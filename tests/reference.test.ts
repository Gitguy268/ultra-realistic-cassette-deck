import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, TapeChain } from '../src/audio/tape/chain';
import { EqShelf } from '../src/audio/tape/dsp';
import { packRadius, tapeGeometry } from '../src/core/tape';
import { DECK_SPEC, TAPE_SPEED } from '../src/spec/deck';

/**
 * The cited figures of docs/REFERENCE.md, held against the spec and against what the tape chain
 * actually does. This is the cassette deck's counterpart of a photo overlay: the deck is generic,
 * but a cassette and its playback are not.
 */

const SR = 48000;
const mm = (v: number): number => v / 1000;

describe('[S1] the Compact Cassette', () => {
  it('runs at 1⅞ in/s', () => {
    expect(TAPE_SPEED).toBeCloseTo(0.047625, 9);
  });

  it('has the shell and tape of the format', () => {
    const c = DECK_SPEC.cassette;
    expect(c.width).toBeCloseTo(mm(101.6), 6);
    expect(c.height).toBeCloseTo(mm(63.5), 6);
    expect(c.thickness).toBeCloseTo(mm(12.7), 6);
    expect(c.tapeWidth).toBeCloseTo(mm(3.81), 6);
  });

  it('holds the cited lengths and thicknesses', () => {
    const t = DECK_SPEC.tapes;
    expect(t.C60.length).toBe(90);
    expect(t.C90.length).toBe(135);
    for (const name of ['C46', 'C60'] as const) {
      expect(t[name].thickness).toBeGreaterThanOrEqual(mm(0.015));
      expect(t[name].thickness).toBeLessThanOrEqual(mm(0.016));
    }
    expect(t.C90.thickness).toBeGreaterThanOrEqual(mm(0.01));
    expect(t.C90.thickness).toBeLessThanOrEqual(mm(0.011));
    expect(t.C120.thickness).toBeCloseTo(mm(0.006), 9);
  });

  it('plays as long a side as the name says', () => {
    for (const name of ['C46', 'C60', 'C90', 'C120'] as const) {
      const minutes = tapeGeometry(name).sideSeconds / 60;
      expect(minutes).toBeGreaterThanOrEqual(DECK_SPEC.tapes[name].minutes / 2);
      expect(minutes).toBeLessThan(DECK_SPEC.tapes[name].minutes / 2 + 3);
    }
  });

  it('fits a full pack inside the shell', () => {
    for (const name of ['C46', 'C60', 'C90', 'C120'] as const) {
      const g = tapeGeometry(name);
      const r = packRadius(g, g.total);
      expect(2 * r).toBeLessThan(DECK_SPEC.cassette.height - mm(8));
      expect(r + g.hub).toBeLessThan(DECK_SPEC.cassette.hubSpacing);
    }
  });
});

/** Gain in dB of a process on a steady tone (second half measured). */
function toneGain(process: (x: number) => number, hz: number): number {
  let inSum = 0;
  let outSum = 0;
  for (let i = 0; i < SR; i++) {
    const x = 0.1 * Math.sin((2 * Math.PI * hz * i) / SR);
    const y = process(x);
    if (i < SR / 2) continue;
    inSum += x * x;
    outSum += y * y;
  }
  return 10 * Math.log10(outSum / inSum);
}

describe('[S2] playback equalisation', () => {
  it('uses 120 µs for Type I and 70 µs for Types II and IV', () => {
    expect(DECK_SPEC.tapeTypes.I.eqUs).toBe(120);
    expect(DECK_SPEC.tapeTypes.II.eqUs).toBe(70);
    expect(DECK_SPEC.tapeTypes.IV.eqUs).toBe(70);
  });

  it('plays a 70 µs tape about 4.7 dB bright on the 120 µs setting, and the reverse dull', () => {
    const bright = new EqShelf(SR);
    bright.set(70, 120);
    expect(toneGain((x) => bright.process(x), 16000)).toBeGreaterThan(4);
    expect(toneGain((x) => bright.process(x), 16000)).toBeLessThan(4.8);
    const dull = new EqShelf(SR);
    dull.set(120, 70);
    expect(toneGain((x) => dull.process(x), 16000)).toBeLessThan(-4);
    // The bass is untouched either way.
    const bass = new EqShelf(SR);
    bass.set(70, 120);
    expect(Math.abs(toneGain((x) => bass.process(x), 100))).toBeLessThan(0.1);
  });
});

/** Hiss in a band round `hz` with the deck's NR set to `nr` (the tape was recorded with it). */
function hissIn(nr: 'off' | 'B' | 'C', recorded: 'B' | 'C', hz: number): number {
  const chain = new TapeChain(SR);
  chain.configure({ ...DEFAULT_SOUND, nrTape: recorded, nrDeck: nr });
  const w = (2 * Math.PI * hz) / SR;
  const q = 3;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let sum = 0;
  for (let i = 0; i < SR * 2; i++) {
    const x = chain.process(0, 0, 1, 1);
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    if (i > SR / 2) sum += y * y;
  }
  return sum;
}

describe('[S3] noise reduction', () => {
  it.each([
    [600, 3],
    [1200, 6],
    [2400, 8],
    [5000, 10],
  ])('B takes about the published reduction off the hiss at %i Hz', (hz, db) => {
    const reduction = 10 * Math.log10(hissIn('off', 'B', hz) / hissIn('B', 'B', hz));
    expect(reduction).toBeGreaterThan(db - 1.5);
    expect(reduction).toBeLessThan(db + 1.5);
  });

  it('C takes about 15 dB off the hiss between 2 and 8 kHz, in two stages', () => {
    expect(DECK_SPEC.nr.C.stages).toBe(2);
    for (const hz of [2400, 5000, 8000]) {
      const reduction = 10 * Math.log10(hissIn('off', 'C', hz) / hissIn('C', 'C', hz));
      expect(reduction).toBeGreaterThan(13);
      expect(reduction).toBeLessThan(18);
    }
  });
});
