/**
 * The deck's mechanical sounds, synthesized: each is a few hits, a pitched body sweeping down
 * and/or a band of noise, with a fast decay. They follow the volume but skip the tape chain and
 * the EQ: they are heard through the air, not through the head. The fast-wind whine is the one
 * continuous sound: `WindSound` follows the spindle's speed.
 */

export type MechanismSound =
  | 'key'
  | 'key-up'
  | 'engage'
  | 'release'
  | 'eject'
  | 'door-close'
  | 'insert'
  | 'remove'
  | 'reverse'
  | 'end'
  | 'brake'
  | 'power-on'
  | 'power-off'
  | 'switch'
  | 'counter-reset';

interface Hit {
  f0?: number;
  f1?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  noise?: number;
  nf?: number;
  nf1?: number;
  q?: number;
  at?: number;
}

export const MECHANISM_HITS: Record<MechanismSound, readonly Hit[]> = {
  // A piano key bottoms out on its latch: a bright click with a small plastic body.
  key: [
    { f0: 1900, f1: 600, dur: 0.018, gain: 0.05, noise: 0.06, nf: 3200, q: 2.5 },
    { f0: 260, f1: 120, type: 'triangle', dur: 0.04, gain: 0.05, at: 0.006 },
  ],
  'key-up': [{ f0: 1400, f1: 500, dur: 0.015, gain: 0.035, noise: 0.04, nf: 2600, q: 2.5 }],
  // The solenoid pulls the head block and pinch roller in: a firm thunk.
  engage: [
    { f0: 140, f1: 52, type: 'triangle', dur: 0.09, gain: 0.16 },
    { noise: 0.05, nf: 900, nf1: 400, dur: 0.05, q: 1.2 },
  ],
  release: [
    { f0: 110, f1: 46, type: 'triangle', dur: 0.08, gain: 0.12 },
    { noise: 0.04, nf: 1300, dur: 0.03, q: 1.5 },
  ],
  // The latch lets go and the spring pushes the door against its damper.
  eject: [
    { f0: 1600, f1: 500, dur: 0.02, gain: 0.05, noise: 0.05, nf: 2800, q: 2 },
    { noise: 0.025, nf: 500, nf1: 1100, dur: 0.5, q: 0.7, at: 0.02 },
  ],
  'door-close': [
    { noise: 0.03, nf: 1200, nf1: 600, dur: 0.12, q: 0.8 },
    { f0: 1700, f1: 700, dur: 0.02, gain: 0.06, noise: 0.05, nf: 3000, q: 2, at: 0.12 },
    { f0: 180, f1: 80, dur: 0.06, gain: 0.07, at: 0.12 },
  ],
  insert: [
    { f0: 320, f1: 140, type: 'triangle', dur: 0.06, gain: 0.08, noise: 0.05, nf: 1800, q: 1 },
    { f0: 900, f1: 400, dur: 0.02, gain: 0.03, at: 0.05 },
  ],
  remove: [{ noise: 0.04, nf: 1500, nf1: 900, dur: 0.08, q: 1 }],
  // The head block turns over: a whirr of the cam and a clunk at each end.
  reverse: [
    { f0: 120, f1: 60, type: 'triangle', dur: 0.08, gain: 0.12 },
    { noise: 0.02, nf: 700, nf1: 1100, dur: 0.3, q: 1.5, at: 0.03 },
    { f0: 150, f1: 55, type: 'triangle', dur: 0.08, gain: 0.12, at: 0.36 },
  ],
  // The tape pulls tight against its hub.
  end: [
    { f0: 90, f1: 40, type: 'triangle', dur: 0.12, gain: 0.12 },
    { noise: 0.06, nf: 2400, dur: 0.025, q: 1.2 },
  ],
  brake: [{ noise: 0.03, nf: 900, nf1: 300, dur: 0.12, q: 1 }],
  'power-on': [
    { f0: 1200, f1: 400, dur: 0.02, gain: 0.05, noise: 0.05, nf: 2400, q: 2 },
    { f0: 60, f1: 50, type: 'triangle', dur: 0.15, gain: 0.04, at: 0.02 },
  ],
  'power-off': [{ f0: 1100, f1: 350, dur: 0.02, gain: 0.05, noise: 0.05, nf: 2200, q: 2 }],
  switch: [{ f0: 2400, f1: 900, dur: 0.012, gain: 0.04, noise: 0.04, nf: 3800, q: 3 }],
  'counter-reset': [
    { f0: 2600, f1: 1200, dur: 0.01, gain: 0.03, noise: 0.03, nf: 4200, q: 3 },
    { noise: 0.02, nf: 3000, nf1: 2000, dur: 0.05, q: 2, at: 0.01 },
  ],
};

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

export function playMechanism(ctx: BaseAudioContext, bus: AudioNode, sound: MechanismSound): void {
  for (const h of MECHANISM_HITS[sound]) {
    const t = ctx.currentTime + (h.at ?? 0);
    const dur = h.dur ?? 0.05;
    const envelope = (peak: number): GainNode => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);
      return g;
    };
    if (h.f0) {
      const osc = ctx.createOscillator();
      osc.type = h.type ?? 'sine';
      osc.frequency.setValueAtTime(h.f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, h.f1 ?? h.f0), t + dur);
      osc.connect(envelope(h.gain ?? 0.06));
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    if (h.noise) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = h.q ?? 1;
      filter.frequency.setValueAtTime(h.nf ?? 2000, t);
      filter.frequency.exponentialRampToValueAtTime(h.nf1 ?? h.nf ?? 2000, t + dur);
      src.connect(filter).connect(envelope(h.noise));
      src.start(t, Math.random() * 0.7);
      src.stop(t + dur + 0.02);
    }
  }
}

/**
 * The fast-wind sound: the spindle motor's whine rising with its speed, and the rush of tape
 * through the guides, which follows the tape's speed.
 */
export class WindSound {
  private readonly motor: OscillatorNode;
  private readonly motorGain: GainNode;
  private readonly rush: AudioBufferSourceNode;
  private readonly rushFilter: BiquadFilterNode;
  private readonly rushGain: GainNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    bus: AudioNode,
  ) {
    this.motor = ctx.createOscillator();
    this.motor.type = 'sawtooth';
    this.motor.frequency.value = 80;
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 900;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motor.connect(motorFilter).connect(this.motorGain).connect(bus);
    this.rush = ctx.createBufferSource();
    this.rush.buffer = noiseBuffer(ctx);
    this.rush.loop = true;
    this.rushFilter = ctx.createBiquadFilter();
    this.rushFilter.type = 'bandpass';
    this.rushFilter.Q.value = 0.8;
    this.rushFilter.frequency.value = 600;
    this.rushGain = ctx.createGain();
    this.rushGain.gain.value = 0;
    this.rush.connect(this.rushFilter).connect(this.rushGain).connect(bus);
    this.motor.start();
    this.rush.start();
  }

  /** `spin` is the spindle in rad/s, `speed` the tape in m/s; both 0 when still. */
  set(spin: number, speed: number): void {
    const t = this.ctx.currentTime;
    const on = Math.min(1, spin / 40);
    this.motor.frequency.setTargetAtTime(60 + spin * 2.4, t, 0.05);
    this.motorGain.gain.setTargetAtTime(0.012 * on, t, 0.05);
    this.rushFilter.frequency.setTargetAtTime(300 + speed * 900, t, 0.05);
    this.rushGain.gain.setTargetAtTime(Math.min(0.02, speed * 0.012), t, 0.05);
  }
}
