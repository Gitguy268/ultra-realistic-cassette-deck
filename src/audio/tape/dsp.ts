/**
 * Small per-sample building blocks for the tape chain. They run inside the AudioWorklet, so they
 * allocate nothing while processing; each is tested on its own (tests/tape-dsp.test.ts).
 */

/** First-order high-pass, y = a·(y₋₁ + x − x₋₁). */
export class HighPass {
  a = 1;
  y = 0;
  x1 = 0;

  constructor(
    hz: number,
    private readonly sampleRate: number,
  ) {
    this.setCorner(hz);
  }

  setCorner(hz: number): void {
    const rc = 1 / (2 * Math.PI * hz);
    this.a = rc / (rc + 1 / this.sampleRate);
  }

  process(x: number): number {
    this.y = this.a * (this.y + x - this.x1);
    this.x1 = x;
    return this.y;
  }
}

/** RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(private readonly sampleRate: number) {}

  lowpass(hz: number, q = Math.SQRT1_2): this {
    const w = (2 * Math.PI * Math.min(hz, this.sampleRate * 0.45)) / this.sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    return this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
  }

  peaking(hz: number, q: number, db: number): this {
    const A = 10 ** (db / 40);
    const w = (2 * Math.PI * hz) / this.sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    return this.set(1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A);
  }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/**
 * The difference between two playback equalisations: a first-order shelf whose high-frequency
 * gain is τ_deck / τ_tape. A 70 µs tape played with the 120 µs setting comes out about 4.7 dB
 * bright in the treble, the other way round as much dull [S2].
 */
export class EqShelf {
  private b0 = 1;
  private b1 = 0;
  private a1 = 0;
  private x1 = 0;
  private y1 = 0;

  constructor(private readonly sampleRate: number) {}

  /** H(s) = (1 + s·τ_deck) / (1 + s·τ_tape), by the bilinear transform. */
  set(tapeUs: number, deckUs: number): void {
    const k = 2 * this.sampleRate;
    const tz = deckUs * 1e-6;
    const tp = tapeUs * 1e-6;
    const a0 = 1 + k * tp;
    this.b0 = (1 + k * tz) / a0;
    this.b1 = (1 - k * tz) / a0;
    this.a1 = (1 - k * tp) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 - this.a1 * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/**
 * One sliding-band compander stage, after the published description of the B-type system [S3]:
 * the high frequencies are boosted on recording by up to `maxDb` when they are quiet, less as
 * they get louder, and the band's corner slides up with level so loud treble is left alone. The
 * player's decoder is the same side-chain in a feedback loop, so it is an exact inverse:
 *
 *   encode: y = x + k·H(x)          decode: solve y + k·H(y) = u
 *
 * with H a first-order high-pass whose corner, and k, depend on the side-chain's envelope as it
 * stood before the sample. Both ends see the same envelope while the decoder tracks the original.
 */
export class SlidingBand {
  private readonly hp: HighPass;
  private env = 0;
  private readonly kMax: number;
  private readonly attack: number;
  private readonly release: number;

  constructor(
    private readonly sampleRate: number,
    maxDb: number,
    private readonly cornerHz: number,
    /** Envelope level (full scale 1) where half the boost is left. */
    private readonly threshold: number,
  ) {
    this.hp = new HighPass(cornerHz, sampleRate);
    this.kMax = 10 ** (maxDb / 20) - 1;
    this.attack = 1 - Math.exp(-1 / (0.002 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.06 * sampleRate));
  }

  private gain(): number {
    const level = this.env / this.threshold;
    // The band slides up as treble gets louder.
    this.hp.setCorner(Math.min(this.sampleRate * 0.4, this.cornerHz * (1 + 2 * level)));
    return this.kMax / (1 + level * level);
  }

  private follow(h: number): void {
    const a = Math.abs(h);
    this.env += (a - this.env) * (a > this.env ? this.attack : this.release);
  }

  encode(x: number): number {
    const k = this.gain();
    const h = this.hp.process(x);
    this.follow(h);
    return x + k * h;
  }

  decode(u: number): number {
    const k = this.gain();
    const hp = this.hp;
    const a = hp.a;
    // y + k·a·(Hprev + y − yprev) = u
    const y = (u - k * a * (hp.y - hp.x1)) / (1 + k * a);
    const h = this.hp.process(y);
    this.follow(h);
    return y;
  }
}

export type NrKind = 'off' | 'B' | 'C';

/** B: one stage. C: a high-level stage and a low-level stage in series [S3]. */
export class NoiseReduction {
  private stages: SlidingBand[] = [];
  kind: NrKind = 'off';

  constructor(private readonly sampleRate: number) {}

  set(kind: NrKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    const sr = this.sampleRate;
    if (kind === 'B') this.stages = [new SlidingBand(sr, 10, 1500, 0.012)];
    else if (kind === 'C')
      this.stages = [new SlidingBand(sr, 10, 900, 0.05), new SlidingBand(sr, 10, 600, 0.006)];
    else this.stages = [];
  }

  encode(x: number): number {
    let y = x;
    for (const stage of this.stages) y = stage.encode(y);
    return y;
  }

  decode(u: number): number {
    let y = u;
    for (let i = this.stages.length - 1; i >= 0; i--) y = this.stages[i]!.decode(y);
    return y;
  }
}

/** Tape hiss: white noise leaning to the treble, at an RMS level in dB of full scale. */
export class Hiss {
  private readonly hp: HighPass;
  private readonly lp: Biquad;
  private seed: number;
  gain = 0;

  constructor(sampleRate: number, seed: number) {
    this.hp = new HighPass(400, sampleRate);
    this.lp = new Biquad(sampleRate).lowpass(15000);
    this.seed = seed >>> 0 || 1;
  }

  setLevel(db: number): void {
    // White noise uniform in ±1 has RMS 1/√3; the filters keep about 0.8 of it.
    this.gain = (10 ** (db / 20) * Math.sqrt(3)) / 0.8;
  }

  next(): number {
    // xorshift32: cheap, and reproducible for tests.
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    const white = (this.seed / 4294967296) * 2 - 1;
    return this.lp.process(this.hp.process(white)) * this.gain;
  }
}

/**
 * What the tape does to a loud signal: the whole level rounds off softly, and the treble, which
 * the recording equalisation has boosted, saturates first. `mol` is the tape's headroom (Type IV
 * most), `hf` how well it holds treble.
 */
export class Saturation {
  private readonly hp: HighPass;
  drive = 1;
  hfDrive = 1;

  constructor(sampleRate: number) {
    this.hp = new HighPass(4000, sampleRate);
  }

  set(mol: number, hf: number): void {
    this.drive = 0.55 / mol;
    this.hfDrive = 1.6 / hf;
  }

  process(x: number): number {
    const h = this.hp.process(x);
    const low = x - h;
    const high = Math.tanh(h * this.hfDrive) / this.hfDrive;
    const y = low + high;
    return Math.tanh(y * this.drive) / this.drive;
  }
}

/** A short delay in fractional samples (up to 7), for the azimuth error between the channels. */
export class FractionalDelay {
  private readonly ring = new Float32Array(8);
  private at = 0;
  samples = 0;

  process(x: number): number {
    this.ring[this.at] = x;
    const d = Math.max(0, Math.min(7, this.samples));
    const i = Math.floor(d);
    const f = d - i;
    const a = this.ring[(this.at - i + 8) & 7]!;
    const b = this.ring[(this.at - i - 1 + 8) & 7]!;
    this.at = (this.at + 1) & 7;
    return a * (1 - f) + b * f;
  }
}
