import { packRadius, reelAngle, type TapeGeometry } from '../../core/tape';
import { DECK_SPEC, type KeyName } from '../../spec/deck';
import type { DeckParts, SwitchName } from './build';

/**
 * Sets every moving part from a plain description of the deck: the stage builds it from the
 * Deck each frame, the `?view` pages from their query. Nothing here keeps state.
 */

const K = DECK_SPEC.keys;
const SW = DECK_SPEC.switches;
const LV = DECK_SPEC.levelKnob;
const MT = DECK_SPEC.meters;
const PW = DECK_SPEC.power;
const DEG = Math.PI / 180;

export interface DeckPose {
  doorDeg: number;
  /** Key travel, 0 up to 1 fully down. */
  keys: Partial<Record<KeyName, number>>;
  geometry: TapeGeometry;
  /** Physical metres on the right reel. */
  x: number;
  faceUp: 0 | 1;
  /** 0 to 1 while the cassette is being turned over, else 0. */
  flipping: number;
  inDeck: boolean;
  counter: number;
  /** Needle deflection, 0 at −20 VU to 1 at +3 VU. */
  needles: [number, number];
  /** Switch positions: 0, 1 or 2 from the left. */
  switches: Record<SwitchName, number>;
  /** Output level, 0..1. */
  level: number;
  powered: boolean;
  /** Direction LEDs, and the meter lamp's brightness. */
  forward: boolean;
  reverse: boolean;
  /** The head block's turn, 0..1. */
  head: number;
}

/** A mechanical counter: each wheel turns over only while the one to its right goes 9 → 0. */
export function counterWheels(value: number): [number, number, number] {
  const v = ((value % 1000) + 1000) % 1000;
  const units = v % 10;
  const carry1 = Math.max(0, units - 9);
  const tens = (Math.floor(v / 10) % 10) + carry1;
  const carry2 = Math.floor(v / 10) % 10 === 9 ? carry1 : 0;
  const hundreds = (Math.floor(v / 100) % 10) + carry2;
  return [hundreds, tens, units];
}

export function poseDeck(parts: DeckParts, pose: DeckPose): void {
  parts.door.rotation.x = pose.doorDeg * DEG;
  K.order.forEach((key) => {
    const travel = pose.keys[key] ?? 0;
    const group = parts.keys[key];
    group.position.z = (group.userData.baseZ ??= group.position.z) - travel * K.travel;
  });
  // The cassette: in the holder, or out on the credenza.
  const spot = pose.inDeck ? parts.holderSpot : parts.tableSpot;
  if (parts.cassette.parent !== spot) spot.add(parts.cassette);
  parts.cassetteFlip.rotation.y = (pose.faceUp + pose.flipping) * Math.PI;
  parts.cassetteFlip.position.z = Math.sin(pose.flipping * Math.PI) * 0.03;
  // Reels: which local reel is on the physical left depends on which side faces out.
  const g = pose.geometry;
  const left = g.total - pose.x;
  const wound: [number, number] = pose.faceUp === 0 ? [left, pose.x] : [pose.x, left];
  const physicalAngle: [number, number] =
    pose.faceUp === 0
      ? [-reelAngle(g, left), reelAngle(g, pose.x)]
      : [reelAngle(g, pose.x), -reelAngle(g, left)];
  const mirror = pose.faceUp === 0 ? 1 : -1;
  for (let i = 0; i < 2; i++) {
    const r = packRadius(g, wound[i]!);
    parts.packs[i]!.scale.set(r, r, 1);
    parts.reels[i]!.rotation.z = mirror * physicalAngle[i]!;
  }
  // Counter.
  const wheels = counterWheels(pose.counter);
  wheels.forEach((digit, i) => {
    parts.counterWheels[i]!.rotation.x = (-(digit + 0.5) / 10) * Math.PI * 2;
  });
  // Meters.
  const sweep = MT.sweepDeg * DEG;
  pose.needles.forEach((d, i) => {
    parts.needles[i]!.rotation.z = -(-sweep / 2 + Math.max(0, Math.min(1.05, d)) * sweep);
  });
  // Switches and knob.
  for (const name of Object.keys(parts.switches) as SwitchName[]) {
    const knob = parts.switches[name];
    knob.position.x = (knob.userData.baseX as number) + (pose.switches[name] - 1) * SW.travel;
  }
  parts.levelKnob.rotation.z = -(pose.level - 0.5) * LV.sweepDeg * DEG;
  // Power: a push switch that stays in while on.
  const base = (parts.power.userData.baseZ ??= parts.power.position.z) as number;
  parts.power.position.z = base - (pose.powered ? PW.travel : 0);
  parts.headBlock.rotation.z = pose.head * Math.PI;
}
