import { describe, expect, it } from 'vitest';
import { counterReading, packRadius, reelTurns, tapeFor, tapeGeometry } from '../src/core/tape';
import { DECK_SPEC, TAPE_SPEED } from '../src/spec/deck';

describe('tape geometry', () => {
  it('holds a side of programme per the cassette name', () => {
    expect(tapeGeometry('C60').sideSeconds / 60).toBeCloseTo(31.5, 0);
    expect(tapeGeometry('C90').sideSeconds / 60).toBeGreaterThanOrEqual(45);
    expect(tapeGeometry('C46').sideSeconds / 60).toBeGreaterThanOrEqual(23);
  });

  it('fills a C60 and a C90 to about the same pack radius', () => {
    const c60 = tapeGeometry('C60');
    const c90 = tapeGeometry('C90');
    const r60 = packRadius(c60, c60.total);
    const r90 = packRadius(c90, c90.total);
    expect(r60 * 1000).toBeGreaterThan(22);
    expect(r60 * 1000).toBeLessThan(26);
    expect(Math.abs(r60 - r90) * 1000).toBeLessThan(1.5);
    // Both packs fit side by side between the hubs.
    expect(2 * r60).toBeLessThan(DECK_SPEC.cassette.hubSpacing * 1.2);
  });

  it('counts turns in closed form, matching a numeric integration', () => {
    const g = tapeGeometry('C60');
    let turns = 0;
    const steps = 20000;
    for (let i = 0; i < steps; i++) {
      const x = ((i + 0.5) / steps) * g.total;
      turns += g.total / steps / (2 * Math.PI * packRadius(g, x));
    }
    expect(reelTurns(g, g.total)).toBeCloseTo(turns, 0);
  });

  it('turns the counter faster at the start of a side than at its end', () => {
    const g = tapeGeometry('C60');
    const minute = 60 * TAPE_SPEED;
    const first = counterReading(g, g.leader + minute, g.leader);
    const end = g.total - g.leader;
    const last = counterReading(g, end, g.leader) - counterReading(g, end - minute, g.leader);
    expect(first).toBeGreaterThan(last * 1.5);
    expect(counterReading(g, end, g.leader)).toBeGreaterThan(500);
    expect(counterReading(g, end, g.leader)).toBeLessThan(700);
  });

  it('wraps the counter at 1000 and runs it down in reverse', () => {
    const g = tapeGeometry('C90');
    expect(counterReading(g, g.leader, g.total / 2)).toBeGreaterThan(0);
    expect(counterReading(g, g.leader, g.total / 2)).toBeLessThan(1000);
  });

  it('picks the smallest cassette that fits a side', () => {
    expect(tapeFor(20 * 60)).toBe('C46');
    expect(tapeFor(30 * 60)).toBe('C60');
    expect(tapeFor(40 * 60)).toBe('C90');
    expect(tapeFor(55 * 60)).toBe('C120');
    expect(tapeFor(90 * 60)).toBe('C120');
  });
});
