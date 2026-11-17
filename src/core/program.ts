import { DECK_SPEC, TAPE_SPEED, type TapeName } from '../spec/deck';
import { TAPE_NAMES, tapeFor, tapeGeometry, type TapeGeometry } from './tape';

/**
 * The queue recorded onto cassettes, the way a mixtape is made: a short lead after the leader,
 * then each track with a gap after it, side A first and then side B. A track that does not fit
 * on what is left of a side starts the next side; when both sides of a cassette are full, the
 * rest goes on the next cassette. Times are seconds of programme on a side at nominal speed;
 * metres follow by × TAPE_SPEED.
 */

export interface Segment {
  /** Queue index. */
  idx: number;
  start: number;
  end: number;
}

export interface Side {
  /** 0 = A, 1 = B. */
  face: 0 | 1;
  segments: Segment[];
}

export interface Cassette {
  tape: TapeName;
  geometry: TapeGeometry;
  sides: [Side, Side];
}

export type Spot =
  | { kind: 'leader' }
  | { kind: 'blank'; idx: number; next: number }
  | { kind: 'track'; idx: number; t: number }
  | { kind: 'tail' };

export type TapeChoice = 'auto' | TapeName;

/** Seconds assumed for a track whose length is not known yet. */
export const UNKNOWN_SECONDS = 240;

export function duration(seconds: number | undefined): number {
  return seconds !== undefined && seconds > 0 ? seconds : UNKNOWN_SECONDS;
}

/** Lays the queue onto cassettes. */
export function layout(durations: readonly (number | undefined)[], choice: TapeChoice): Cassette[] {
  const T = DECK_SPEC.transport;
  const lengths = durations.map(duration);
  const total = lengths.reduce((a, b) => a + b + T.gapS, 0) + 2 * T.leadS;
  const tape: TapeName = choice === 'auto' ? tapeFor(total / 2) : choice;
  const geometry = tapeGeometry(tape);
  const capacity = geometry.sideSeconds;
  const cassettes: Cassette[] = [];
  let current: Side[] = [];
  let side: Side = { face: 0, segments: [] };
  let at = T.leadS;
  const close = (): void => {
    current.push(side);
    if (current.length === 2) {
      cassettes.push({ tape, geometry, sides: current as [Side, Side] });
      current = [];
    }
    side = { face: current.length === 0 ? 0 : 1, segments: [] };
    at = T.leadS;
  };
  lengths.forEach((d, idx) => {
    // A track longer than a whole side still gets one: it is cut off at the tail, as a real
    // recording would be.
    if (side.segments.length > 0 && at + d > capacity) close();
    side.segments.push({ idx, start: at, end: Math.min(capacity, at + d) });
    at += d + T.gapS;
  });
  if (side.segments.length > 0 || current.length > 0 || cassettes.length === 0) close();
  if (current.length === 1) close();
  return cassettes;
}

export class Program {
  cassettes: Cassette[] = layout([], 'auto');
  choice: TapeChoice = 'auto';

  build(durations: readonly (number | undefined)[], choice: TapeChoice = this.choice): void {
    this.choice = choice;
    this.cassettes = layout(durations, choice);
  }

  /** Cassette, face and segment of a queue index. */
  locate(idx: number): { cassette: number; face: 0 | 1; segment: Segment } | null {
    for (let c = 0; c < this.cassettes.length; c++) {
      for (const side of this.cassettes[c]!.sides) {
        const segment = side.segments.find((s) => s.idx === idx);
        if (segment) return { cassette: c, face: side.face, segment };
      }
    }
    return null;
  }

  side(cassette: number, face: 0 | 1): Side {
    return this.cassettes[cassette]?.sides[face] ?? { face, segments: [] };
  }

  /** What lies under the head at `t` seconds into a side. */
  spot(cassette: number, face: 0 | 1, t: number): Spot {
    const c = this.cassettes[cassette];
    if (!c || t < 0) return { kind: 'leader' };
    if (t > c.geometry.sideSeconds) return { kind: 'tail' };
    const segments = this.side(cassette, face).segments;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!;
      if (t < s.start) return { kind: 'blank', idx: segments[i - 1]?.idx ?? -1, next: s.idx };
      if (t < s.end) return { kind: 'track', idx: s.idx, t: t - s.start };
    }
    return { kind: 'blank', idx: segments[segments.length - 1]?.idx ?? -1, next: -1 };
  }

  /**
   * Where a music search stops, in side seconds: one second into the gap before the next track
   * (forward), or before this track's start, or the one before it when within two seconds of its
   * start (backward). Null when there is nothing in that direction.
   */
  searchTarget(cassette: number, face: 0 | 1, t: number, direction: 1 | -1): number | null {
    const starts = this.side(cassette, face).segments.map((s) => s.start);
    const before = (start: number): number => Math.max(0, start - 1);
    if (direction > 0) {
      const next = starts.find((start) => start > t + 0.5);
      return next === undefined ? null : before(next);
    }
    const back = [...starts].reverse().find((start) => start < t - 2);
    return back === undefined ? null : before(back);
  }

  letter(face: 0 | 1): 'A' | 'B' {
    return face === 0 ? 'A' : 'B';
  }
}

/** Metres of tape for side seconds. */
export const metres = (seconds: number): number => seconds * TAPE_SPEED;

export { TAPE_NAMES };
