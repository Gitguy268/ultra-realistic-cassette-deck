import { describe, expect, it } from 'vitest';
import {
  EQ_RANGE_DB,
  clampTone,
  mixPlan,
  tonePeakDb,
  toneResponseDb,
  type MixSettings,
} from '../src/audio/mix';
import { EQ_BANDS, FLAT_EQ } from '../src/audio/winamp-eq';

const FLAT_TONE = { bass: 0, mid: 0, treble: 0 };
const base: MixSettings = { ...FLAT_TONE, graphicEq: FLAT_EQ };
const eqWith = (bands: number[], preamp = 0) => ({ on: true, preamp, bands, preset: '' });

describe('tone controls', () => {
  it('clamps to plus or minus 12 dB', () => {
    expect(EQ_RANGE_DB).toBe(12);
    expect(clampTone(40)).toBe(12);
    expect(clampTone(-40)).toBe(-12);
    expect(clampTone(Number.NaN)).toBe(0);
  });

  it('is flat with every control at zero', () => {
    for (const hz of [20, 100, 1000, 10000, 20000]) expect(toneResponseDb(hz, FLAT_TONE)).toBe(0);
    expect(tonePeakDb(FLAT_TONE)).toBe(0);
  });

  it('boosts each band where it should and leaves the far end alone', () => {
    expect(toneResponseDb(30, { ...FLAT_TONE, bass: 12 })).toBeCloseTo(12, 0);
    expect(Math.abs(toneResponseDb(8000, { ...FLAT_TONE, bass: 12 }))).toBeLessThan(0.5);
    expect(toneResponseDb(1000, { ...FLAT_TONE, mid: 12 })).toBeCloseTo(12, 1);
    expect(Math.abs(toneResponseDb(30, { ...FLAT_TONE, mid: 12 }))).toBeLessThan(0.5);
    expect(toneResponseDb(16000, { ...FLAT_TONE, treble: 12 })).toBeCloseTo(12, 0);
    expect(Math.abs(toneResponseDb(50, { ...FLAT_TONE, treble: 12 }))).toBeLessThan(0.5);
  });

  it('cuts symmetrically', () => {
    expect(toneResponseDb(30, { ...FLAT_TONE, bass: -12 })).toBeCloseTo(-12, 0);
    expect(tonePeakDb({ bass: -12, mid: -12, treble: -12 })).toBe(0);
  });

  it('finds a combined peak above any single control when bands overlap', () => {
    const peak = tonePeakDb({ bass: 12, mid: 12, treble: 12 });
    expect(peak).toBeGreaterThan(12);
    expect(peak).toBeLessThan(18);
  });
});

describe('mixPlan', () => {
  it('passes music at unity with flat tone', () => {
    expect(mixPlan(base).musicGain).toBe(1);
  });

  it('turns music down by at least the largest tone boost', () => {
    for (const tone of [
      { bass: 12, mid: 0, treble: 0 },
      { bass: 0, mid: 7, treble: 0 },
      { bass: 12, mid: 12, treble: 12 },
      { bass: -6, mid: 3, treble: 12 },
    ]) {
      const plan = mixPlan({ ...base, ...tone });
      const boosted = plan.musicGain * 10 ** (tonePeakDb(tone) / 20);
      expect(boosted).toBeLessThanOrEqual(1);
    }
  });

  it('does not turn music down for a cut', () => {
    expect(mixPlan({ ...base, bass: -12, treble: -5 }).musicGain).toBe(1);
  });
});

describe('graphic EQ in the mix', () => {
  it('changes nothing while it is off, whatever the sliders say', () => {
    const off = {
      ...eqWith(
        EQ_BANDS.map(() => 12),
        12,
      ),
      on: false,
    };
    expect(tonePeakDb(FLAT_TONE, off)).toBe(0);
    expect(mixPlan({ ...base, graphicEq: off }).musicGain).toBe(1);
  });

  it('boosts each band near its centre frequency', () => {
    EQ_BANDS.forEach((hz, i) => {
      const bands = EQ_BANDS.map((_, j) => (j === i ? 12 : 0));
      expect(toneResponseDb(hz, FLAT_TONE, eqWith(bands))).toBeGreaterThan(5);
    });
  });

  it('keeps every band and the preamp at full boost under full scale', () => {
    const eq = eqWith(
      EQ_BANDS.map(() => 12),
      12,
    );
    const tone = { bass: 12, mid: 12, treble: 12 };
    const plan = mixPlan({ ...base, ...tone, graphicEq: eq });
    const peak = plan.musicGain * 10 ** (tonePeakDb(tone, eq) / 20);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.9);
  });

  it('lets a negative preamp turn the music down', () => {
    const plan = mixPlan({
      ...base,
      graphicEq: eqWith(
        EQ_BANDS.map(() => 0),
        -6,
      ),
    });
    expect(plan.musicGain).toBeCloseTo(10 ** (-6 / 20));
  });
});
