import {
  Biquad,
  EqShelf,
  FractionalDelay,
  Hiss,
  HighPass,
  NoiseReduction,
  Saturation,
  type NrKind,
} from './dsp';

/**
 * The sound of a recorded cassette, one stereo sample at a time. The first half stands for how
 * the tape was recorded (its noise reduction encoding and the tape's own saturation); the second
 * half is this deck playing it back:
 *
 *   music ─► NR encode (tape) ─► saturation ─► dropouts ─► + hiss ─► EQ (deck vs tape)
 *         ─► head bump ─► treble loss ─► azimuth ─► NR decode (deck) ─► out
 *
 * Wow and flutter, which move everything that passes the head, are applied by the worklet around
 * this chain. Dropouts take the treble first: thinning oxide loses short wavelengths soonest.
 */

export interface TapeSound {
  /** Noise reduction the tape was recorded with, and the deck's switch. */
  nrTape: NrKind;
  nrDeck: NrKind;
  /** Playback EQ time constants: the tape's and the deck's selector (120 or 70 µs) [S2]. */
  tapeUs: number;
  deckUs: number;
  /** Hiss before noise reduction, dB RMS of full scale. */
  hissDb: number;
  /** Tape headroom and treble handling. */
  mol: number;
  hfSaturation: number;
  /** Where the treble falls away: the tape type's, lowered by wear. */
  trebleHz: number;
  /** Interchannel delay from the head's azimuth, microseconds. */
  azimuthUs: number;
}

export const DEFAULT_SOUND: TapeSound = {
  nrTape: 'B',
  nrDeck: 'B',
  tapeUs: 70,
  deckUs: 70,
  hissDb: -62,
  mol: 1,
  hfSaturation: 0.75,
  trebleHz: 15000,
  azimuthUs: 2,
};

class Channel {
  readonly encode: NoiseReduction;
  readonly decode: NoiseReduction;
  readonly saturation: Saturation;
  readonly dropHp: HighPass;
  readonly hiss: Hiss;
  readonly eq: EqShelf;
  readonly bump: Biquad;
  readonly treble: Biquad;
  readonly treble2: Biquad;
  readonly azimuth = new FractionalDelay();

  constructor(sampleRate: number, seed: number) {
    this.encode = new NoiseReduction(sampleRate);
    this.decode = new NoiseReduction(sampleRate);
    this.saturation = new Saturation(sampleRate);
    this.dropHp = new HighPass(1200, sampleRate);
    this.hiss = new Hiss(sampleRate, seed);
    this.eq = new EqShelf(sampleRate);
    // The playback head's low-frequency bump at 4.76 cm/s. [D]
    this.bump = new Biquad(sampleRate).peaking(80, 1.1, 1.6);
    this.treble = new Biquad(sampleRate);
    this.treble2 = new Biquad(sampleRate);
  }
}

export class TapeChain {
  private readonly channels: [Channel, Channel];
  sound: TapeSound = { ...DEFAULT_SOUND };

  constructor(private readonly sampleRate: number) {
    this.channels = [new Channel(sampleRate, 0x9e3779b9), new Channel(sampleRate, 0x85ebca6b)];
    this.configure(DEFAULT_SOUND);
  }

  configure(sound: TapeSound): void {
    this.sound = { ...sound };
    this.channels.forEach((c, i) => {
      c.encode.set(sound.nrTape);
      c.decode.set(sound.nrDeck);
      c.saturation.set(sound.mol, sound.hfSaturation);
      c.hiss.setLevel(sound.hissDb);
      c.eq.set(sound.tapeUs, sound.deckUs);
      c.treble.lowpass(sound.trebleHz, 0.6);
      c.treble2.lowpass(sound.trebleHz * 1.25, 0.6);
      // The right channel lags by the azimuth error.
      c.azimuth.samples = i === 1 ? sound.azimuthUs * 1e-6 * this.sampleRate : 0;
    });
  }

  /**
   * One sample of one channel. `level` is the tape's condition under the head (dropouts),
   * `hissGain` how much hiss the moving tape makes (0 at rest, 1 at play speed).
   */
  process(channel: 0 | 1, x: number, level: number, hissGain: number): number {
    const c = this.channels[channel];
    let y = c.saturation.process(c.encode.encode(x));
    if (level < 1) {
      const high = c.dropHp.process(y);
      // The treble falls with the level, the lows half as far.
      y = (y - high) * (0.5 + 0.5 * level) + high * level;
    } else c.dropHp.process(y);
    const hiss = c.hiss.next();
    y += hiss * hissGain;
    y = c.eq.process(y);
    y = c.bump.process(y);
    y = c.treble2.process(c.treble.process(y));
    y = c.azimuth.process(y);
    return c.decode.decode(y);
  }
}
