// The explicit .ts extensions let the headless check scripts load this module in Node.
import { EQ_BANDS, FLAT_EQ, activeGains, bandType, type GraphicEq } from './winamp-eq.ts';

export const EQ_RANGE_DB = 12;

export interface ToneSettings {
  bass: number;
  mid: number;
  treble: number;
}

export interface MixSettings extends ToneSettings {
  /** The Winamp graphic equaliser, after the tone controls. */
  graphicEq: GraphicEq;
}

export interface MixPlan {
  /** Gain ahead of the tone controls: room for any boost, with the EQ preamp. */
  musicGain: number;
}

export const TONE_BANDS = {
  bass: { type: 'lowshelf', frequency: 250, q: 1 },
  mid: { type: 'peaking', frequency: 1000, q: 0.9 },
  treble: { type: 'highshelf', frequency: 4000, q: 1 },
} as const;

/** Web Audio's default Q, which Winamp's peaking bands keep. */
const GRAPHIC_EQ_Q = 1;
const RESPONSE_SAMPLE_RATE = 48000;
// Covers the small difference between this calculation and the browser's filters.
const PREAMP_MARGIN_DB = 0.2;

export function clampTone(db: number): number {
  return Number.isFinite(db) ? Math.max(-EQ_RANGE_DB, Math.min(EQ_RANGE_DB, db)) : 0;
}

type Complex = readonly [re: number, im: number];

function magnitude(b: readonly number[], a: readonly number[], w: number): number {
  const at = (c: readonly number[]): Complex => [
    (c[0] ?? 0) + (c[1] ?? 0) * Math.cos(w) + (c[2] ?? 0) * Math.cos(2 * w),
    -(c[1] ?? 0) * Math.sin(w) - (c[2] ?? 0) * Math.sin(2 * w),
  ];
  const [nr, ni] = at(b);
  const [dr, di] = at(a);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

/** Gain in dB of one Web Audio shelving or peaking filter (the spec's biquad formulas). */
function bandDb(
  type: 'lowshelf' | 'peaking' | 'highshelf',
  frequency: number,
  q: number,
  gainDb: number,
  hz: number,
): number {
  if (gainDb === 0) return 0;
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * frequency) / RESPONSE_SAMPLE_RATE;
  const cos = Math.cos(w0);
  const w = (2 * Math.PI * hz) / RESPONSE_SAMPLE_RATE;
  let b: number[];
  let a: number[];
  if (type === 'peaking') {
    const alpha = Math.sin(w0) / (2 * q);
    b = [1 + alpha * A, -2 * cos, 1 - alpha * A];
    a = [1 + alpha / A, -2 * cos, 1 - alpha / A];
  } else {
    const k = 2 * Math.sqrt(A) * ((Math.sin(w0) / 2) * Math.SQRT2);
    const sign = type === 'lowshelf' ? 1 : -1;
    b = [
      A * (A + 1 - sign * (A - 1) * cos + k),
      sign * 2 * A * (A - 1 - sign * (A + 1) * cos),
      A * (A + 1 - sign * (A - 1) * cos - k),
    ];
    a = [
      A + 1 + sign * (A - 1) * cos + k,
      -sign * 2 * (A - 1 + sign * (A + 1) * cos),
      A + 1 + sign * (A - 1) * cos - k,
    ];
  }
  return 20 * Math.log10(magnitude(b, a, w));
}

/**
 * Combined gain at `hz`, in dB, of the three tone controls and, when given and
 * switched on, the ten graphic EQ bands (without the preamp).
 */
export function toneResponseDb(hz: number, tone: ToneSettings, eq: GraphicEq = FLAT_EQ): number {
  let total = 0;
  for (const key of ['bass', 'mid', 'treble'] as const) {
    const band = TONE_BANDS[key];
    total += bandDb(band.type, band.frequency, band.q, clampTone(tone[key]), hz);
  }
  activeGains(eq).bands.forEach((gainDb, i) => {
    total += bandDb(bandType(i), EQ_BANDS[i] ?? 1000, GRAPHIC_EQ_Q, gainDb, hz);
  });
  return total;
}

/** The largest gain the tone controls and EQ reach anywhere from 20 Hz to 20 kHz, in dB (≥ 0). */
export function tonePeakDb(tone: ToneSettings, eq: GraphicEq = FLAT_EQ): number {
  let peak = 0;
  for (let step = 0; step <= 240; step++) {
    peak = Math.max(peak, toneResponseDb(20 * 1000 ** (step / 240), tone, eq));
  }
  return peak;
}

/**
 * Sets the level so the mix cannot exceed full scale: music is turned down by the largest boost
 * the tone controls and EQ apply. The EQ preamp can lower the level; a raise is only kept as far
 * as it fits. With flat tone, music passes at unity.
 */
export function mixPlan(settings: MixSettings): MixPlan {
  const eqPreampDb = activeGains(settings.graphicEq).preamp;
  const boostDb = tonePeakDb(settings, settings.graphicEq) + eqPreampDb;
  const preamp = boostDb > 0 ? 10 ** (-(boostDb + PREAMP_MARGIN_DB) / 20) : 1;
  return { musicGain: preamp * 10 ** (eqPreampDb / 20) };
}
