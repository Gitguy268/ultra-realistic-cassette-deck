import { describe, expect, it } from 'vitest';
import { Program, layout } from '../src/core/program';
import { DECK_SPEC } from '../src/spec/deck';

const T = DECK_SPEC.transport;

describe('tape program', () => {
  it('records side A then side B with gaps, on the smallest tape that fits', () => {
    const cassettes = layout([600, 600, 600, 600], 'auto');
    expect(cassettes).toHaveLength(1);
    const c = cassettes[0]!;
    expect(c.tape).toBe('C46');
    expect(c.sides[0].segments.map((s) => s.idx)).toEqual([0, 1]);
    expect(c.sides[1].segments.map((s) => s.idx)).toEqual([2, 3]);
    const [a, b] = c.sides[0].segments;
    expect(a!.start).toBe(T.leadS);
    expect(b!.start - a!.end).toBe(T.gapS);
  });

  it('starts a new cassette when both sides are full', () => {
    const cassettes = layout(Array(10).fill(600), 'C60');
    expect(cassettes.length).toBe(2);
    expect(cassettes[1]!.sides[0].segments[0]!.idx).toBe(6);
  });

  it('gives an empty side B to a short programme', () => {
    const c = layout([200], 'auto')[0]!;
    expect(c.sides[1].segments).toEqual([]);
  });

  it('says what is under the head', () => {
    const p = new Program();
    p.build([100, 100], 'C60');
    expect(p.spot(0, 0, -1).kind).toBe('leader');
    expect(p.spot(0, 0, 1)).toEqual({ kind: 'blank', idx: -1, next: 0 });
    expect(p.spot(0, 0, T.leadS + 10)).toEqual({ kind: 'track', idx: 0, t: 10 });
    expect(p.spot(0, 0, T.leadS + 101)).toEqual({ kind: 'blank', idx: 0, next: 1 });
    expect(p.spot(0, 0, 5000).kind).toBe('tail');
  });

  it('finds the next and previous track starts for a music search', () => {
    const p = new Program();
    p.build([100, 100, 100], 'C60');
    const starts = p.side(0, 0).segments.map((s) => s.start);
    expect(p.searchTarget(0, 0, 50, 1)).toBe(starts[1]! - 1);
    expect(p.searchTarget(0, 0, starts[1]! + 30, -1)).toBe(starts[1]! - 1);
    expect(p.searchTarget(0, 0, starts[1]! + 1, -1)).toBe(starts[0]! - 1);
    expect(p.searchTarget(0, 0, starts[2]! + 1, 1)).toBeNull();
    expect(p.locate(2)?.segment.start).toBe(starts[2]);
  });
});
