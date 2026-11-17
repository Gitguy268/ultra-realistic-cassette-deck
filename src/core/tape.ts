import { DECK_SPEC, TAPE_SPEED, type TapeName } from '../spec/deck';

/**
 * The tape wound on two hubs. A reel's pack grows by one tape thickness per turn, so the area it
 * covers is the hub's plus thickness × length: r² = r_hub² + t·L/π. Turning that around, the
 * turns a reel has made while winding L metres is (r − r_hub) / t, in closed form.
 */
export interface TapeGeometry {
  name: TapeName;
  /** Magnetic tape, metres. */
  length: number;
  /** Clear leader at each end, metres. */
  leader: number;
  /** Leader + magnetic + leader. */
  total: number;
  thickness: number;
  hub: number;
  /** Seconds of programme each side holds at the nominal speed. */
  sideSeconds: number;
}

export const TAPE_NAMES = Object.keys(DECK_SPEC.tapes) as TapeName[];

export function tapeGeometry(name: TapeName): TapeGeometry {
  const t = DECK_SPEC.tapes[name];
  const leader = DECK_SPEC.cassette.leaderLength;
  return {
    name,
    length: t.length,
    leader,
    total: t.length + 2 * leader,
    thickness: t.thickness,
    hub: DECK_SPEC.cassette.hubRadius,
    sideSeconds: t.length / TAPE_SPEED,
  };
}

/** Radius of a pack holding `wound` metres, in metres. */
export function packRadius(g: TapeGeometry, wound: number): number {
  const w = Math.max(0, Math.min(g.total, wound));
  return Math.sqrt(g.hub * g.hub + (g.thickness * w) / Math.PI);
}

/** Turns a reel has made since it was empty, holding `wound` metres. */
export function reelTurns(g: TapeGeometry, wound: number): number {
  return (packRadius(g, wound) - g.hub) / g.thickness;
}

/** The reel's angle in radians for `wound` metres: the spokes turn with the tape. */
export function reelAngle(g: TapeGeometry, wound: number): number {
  return reelTurns(g, wound) * 2 * Math.PI;
}

/** The smallest cassette that holds `seconds` per side, or the longest one. */
export function tapeFor(secondsPerSide: number): TapeName {
  for (const name of TAPE_NAMES) {
    if (tapeGeometry(name).sideSeconds >= secondsPerSide) return name;
  }
  return TAPE_NAMES[TAPE_NAMES.length - 1]!;
}

/**
 * The mechanical counter: a belt off the right-hand spindle, so it counts reel turns, not time.
 * It reads fast at the start of side A and slow near its end, as on the real thing.
 */
export function counterReading(
  g: TapeGeometry,
  rightWound: number,
  resetAt: number,
  turnsPerCount = DECK_SPEC.counter.turnsPerCount,
): number {
  const counts = (reelTurns(g, rightWound) - reelTurns(g, resetAt)) / turnsPerCount;
  return ((counts % 1000) + 1000) % 1000;
}
