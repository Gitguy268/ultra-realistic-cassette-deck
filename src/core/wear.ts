import { hash, rng } from './random';

/**
 * How a cassette has aged. Dropouts are where oxide has worn thin or the tape has creased: the
 * signal dips, the highs most. They sit at fixed places on the tape (metres from the start of
 * side A), so they come back every time that stretch passes the head, on whichever side.
 */

export const CONDITIONS = {
  new: { label: 'New', perMinute: 0.15, depth: 0.25, hissDb: 0, dullHz: 16000, crinkles: 0 },
  good: { label: 'Good', perMinute: 0.6, depth: 0.4, hissDb: 1, dullHz: 13500, crinkles: 0 },
  worn: { label: 'Worn', perMinute: 2.2, depth: 0.6, hissDb: 2.5, dullHz: 10000, crinkles: 1 },
  chewed: {
    label: 'Chewed',
    perMinute: 5,
    depth: 0.85,
    hissDb: 4,
    dullHz: 7500,
    crinkles: 4,
  },
} as const;

export type Condition = keyof typeof CONDITIONS;

export interface Dropout {
  /** Metres from the physical start of the tape (side A's leader end). */
  at: number;
  /** Metres long. */
  length: number;
  /** 0..1: how far the level falls at its deepest. */
  depth: number;
  /** A crease: a burst of flutter and a rough patch, not only a dip. */
  crinkle: boolean;
}

export function isCondition(value: unknown): value is Condition {
  return typeof value === 'string' && Object.hasOwn(CONDITIONS, value);
}

/** The dropouts of a cassette in a condition, seeded so the same tape always has the same ones. */
export function buildDropouts(
  seed: string,
  condition: Condition,
  totalMetres: number,
  speed: number,
): Dropout[] {
  const c = CONDITIONS[condition];
  const random = rng(hash(`${seed}:${condition}`));
  const minutes = totalMetres / speed / 60;
  const count = Math.round(c.perMinute * minutes);
  const dropouts: Dropout[] = [];
  for (let i = 0; i < count; i++) {
    dropouts.push({
      at: random() * totalMetres,
      length: speed * (0.008 + random() * 0.06),
      depth: c.depth * (0.4 + 0.6 * random()),
      crinkle: false,
    });
  }
  for (let i = 0; i < c.crinkles; i++) {
    dropouts.push({
      at: random() * totalMetres,
      length: speed * (0.6 + random() * 1.2),
      depth: Math.min(0.95, c.depth + 0.1),
      crinkle: true,
    });
  }
  return dropouts.sort((a, b) => a.at - b.at);
}

/** The longest dropout, metres: a crinkle of 1.8 s at play speed. */
const MAX_LENGTH = 0.1;

/** First index whose dropout could still cover `x` (the list is sorted by `at`). */
function firstNear(dropouts: readonly Dropout[], x: number): number {
  let lo = 0;
  let hi = dropouts.length;
  const from = x - MAX_LENGTH;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dropouts[mid]!.at < from) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A crinkle under the head: 0, or how deep into it (0..1, peaking in its middle). */
export function crinkleAt(dropouts: readonly Dropout[], x: number): number {
  for (let i = firstNear(dropouts, x); i < dropouts.length; i++) {
    const d = dropouts[i]!;
    if (d.at > x) break;
    if (d.crinkle && x <= d.at + d.length) return Math.sin(Math.PI * ((x - d.at) / d.length));
  }
  return 0;
}

/** Level at a tape position, 1 where the tape is clean. Smooth raised-cosine dips. */
export function levelAt(dropouts: readonly Dropout[], x: number): number {
  let level = 1;
  for (let i = firstNear(dropouts, x); i < dropouts.length; i++) {
    const d = dropouts[i]!;
    if (d.at > x) break;
    if (x > d.at + d.length) continue;
    const f = (x - d.at) / d.length;
    const dip = d.depth * 0.5 * (1 - Math.cos(2 * Math.PI * f));
    level = Math.min(level, 1 - dip);
  }
  return level;
}
