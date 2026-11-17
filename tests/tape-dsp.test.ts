import { describe, expect, it } from 'vitest';
import { TapeChain, DEFAULT_SOUND } from '../src/audio/tape/chain';
import {
  EqShelf,
  HighPass,
  Hiss,
  NoiseReduction,
  Saturation,
  SlidingBand,
} from '../src/audio/tape/dsp';

const SR = 48000;
const db = (ratio: number): number => 20 * Math.log10(ratio);
const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);

function tone(hz: number, amp: number, n = SR): number[] {
  return Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
}

/** Steady-state gain of a per-sample process on a tone (second half only). */
function gain(process: (x: number) => number, hz: number, amp: number): number {
  const input = tone(hz, amp);
  const output = input.map(process);
  return rms(output.slice(SR / 2)) / rms(input.slice(SR / 2));
}

describe('noise reduction', () => {
  it('decodes exactly what it encoded', () => {
    const enc = new SlidingBand(SR, 10, 1500, 0.012);
    const dec = new SlidingBand(SR, 10, 1500, 0.012);
    let worst = 0;
    for (let i = 0; i < SR; i++) {
      const x =
        0.3 * Math.sin((2 * Math.PI * 220 * i) / SR) +
        0.05 * Math.sin((2 * Math.PI * 6100 * i) / SR) * (i % 9000 < 4000 ? 1 : 0.02);
      worst = Math.max(worst, Math.abs(dec.decode(enc.encode(x)) - x));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('round-trips both stages of C', () => {
    const enc = new NoiseReduction(SR);
    const dec = new NoiseReduction(SR);
    enc.set('C');
    dec.set('C');
    let worst = 0;
    for (let i = 0; i < SR / 2; i++) {
      const x = 0.2 * Math.sin((2 * Math.PI * 3000 * i) / SR) * Math.sin(i / 3000);
      worst = Math.max(worst, Math.abs(dec.decode(enc.encode(x)) - x));
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it('B lifts quiet treble about 10 dB and leaves loud treble and the bass alone', () => {
    const quiet = new SlidingBand(SR, 10, 1500, 0.012);
    const loud = new SlidingBand(SR, 10, 1500, 0.012);
    const bass = new SlidingBand(SR, 10, 1500, 0.012);
    expect(db(gain((x) => quiet.encode(x), 5000, 0.001))).toBeGreaterThan(8);
    expect(db(gain((x) => quiet.encode(x), 5000, 0.001))).toBeLessThan(10.5);
    expect(db(gain((x) => loud.encode(x), 5000, 0.5))).toBeLessThan(2);
    expect(Math.abs(db(gain((x) => bass.encode(x), 100, 0.001)))).toBeLessThan(1);
  });
});

describe('tape sound', () => {
  it('plays a 70 µs tape 4–5 dB bright on the 120 µs setting', () => {
    const eq = new EqShelf(SR);
    eq.set(70, 120);
    const high = db(gain((x) => eq.process(x), 14000, 0.1));
    expect(high).toBeGreaterThan(3.5);
    expect(high).toBeLessThan(5);
    const flat = new EqShelf(SR);
    flat.set(70, 70);
    expect(Math.abs(db(gain((x) => flat.process(x), 10000, 0.1)))).toBeLessThan(0.01);
  });

  it('makes hiss at the asked level', () => {
    const hiss = new Hiss(SR, 7);
    hiss.setLevel(-60);
    const samples = Array.from({ length: SR }, () => hiss.next());
    expect(Math.abs(db(rms(samples)) + 60)).toBeLessThan(2.5);
  });

  it('saturates loud signals and leaves quiet ones', () => {
    const s = new Saturation(SR);
    s.set(1, 0.75);
    expect(Math.abs(db(gain((x) => s.process(x), 1000, 0.05)))).toBeLessThan(0.3);
    const t = new Saturation(SR);
    t.set(1, 0.75);
    expect(db(gain((x) => t.process(x), 1000, 1.5))).toBeLessThan(-1);
  });

  function hissOnly(nrDeck: 'off' | 'B'): number {
    const chain = new TapeChain(SR);
    chain.configure({ ...DEFAULT_SOUND, nrTape: 'B', nrDeck });
    const hp = new HighPass(4000, SR);
    const out: number[] = [];
    for (let i = 0; i < SR; i++) out.push(hp.process(chain.process(0, 0, 1, 1)));
    return rms(out.slice(SR / 4));
  }

  it('NR B on playback takes about 10 dB off the treble hiss', () => {
    const reduction = db(hissOnly('off') / hissOnly('B'));
    expect(reduction).toBeGreaterThan(7);
    expect(reduction).toBeLessThan(12);
  });

  it('plays a matched recording back flat in the midrange', () => {
    const chain = new TapeChain(SR);
    chain.configure({ ...DEFAULT_SOUND, hissDb: -200 });
    const g = db(gain((x) => chain.process(0, x, 1, 0), 1000, 0.1));
    expect(Math.abs(g)).toBeLessThan(1);
  });

  it('dips the treble more than the bass in a dropout', () => {
    const lowChain = new TapeChain(SR);
    const highChain = new TapeChain(SR);
    for (const c of [lowChain, highChain])
      c.configure({ ...DEFAULT_SOUND, hissDb: -200, nrTape: 'off', nrDeck: 'off' });
    const low = db(gain((x) => lowChain.process(0, x, 0.3, 0), 150, 0.1));
    const high = db(gain((x) => highChain.process(0, x, 0.3, 0), 6000, 0.1));
    expect(high).toBeLessThan(low - 3);
  });
});
