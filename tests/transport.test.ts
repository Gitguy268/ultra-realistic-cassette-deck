import { describe, expect, it } from 'vitest';
import { CUE_FACTOR, END_SENSE_S, Transport, type TransportEvent } from '../src/core/transport';
import { tapeGeometry } from '../src/core/tape';
import { DECK_SPEC, TAPE_SPEED } from '../src/spec/deck';

const T = DECK_SPEC.transport;

function run(t: Transport, seconds: number, dt = 1 / 120): TransportEvent[] {
  const events: TransportEvent[] = [];
  for (let s = 0; s < seconds; s += dt) events.push(...t.step(dt));
  return events;
}

describe('transport', () => {
  it('plays at 4.76 cm/s after the mechanism engages', () => {
    const t = new Transport();
    t.play();
    run(t, T.engageS / 2);
    expect(t.v).toBe(0);
    run(t, 1);
    expect(t.v).toBeCloseTo(TAPE_SPEED, 5);
    const x = t.x;
    run(t, 10);
    expect(t.x - x).toBeCloseTo(10 * TAPE_SPEED, 3);
  });

  it('follows the pitch control', () => {
    const t = new Transport();
    t.pitch = 0.03;
    t.play();
    run(t, 2);
    expect(t.rate).toBeCloseTo(1.03, 3);
  });

  it('stops within a tenth of a second when stopped or paused', () => {
    const t = new Transport();
    t.play();
    run(t, 1);
    t.togglePause();
    run(t, 0.12);
    expect(Math.abs(t.v)).toBeLessThan(TAPE_SPEED * 0.05);
    t.togglePause();
    run(t, 0.5);
    t.stop();
    run(t, 0.12);
    expect(Math.abs(t.v)).toBeLessThan(TAPE_SPEED * 0.05);
  });

  it('winds faster as the take-up pack grows, a C60 side in under 90 s', () => {
    const t = new Transport();
    t.load(tapeGeometry('C60'), 0);
    t.wind(1);
    run(t, 2);
    const early = t.v;
    let seconds = 2;
    while (t.x < t.geometry.total - 1 && seconds < 200) {
      run(t, 1);
      seconds++;
    }
    expect(seconds).toBeGreaterThan(30);
    expect(seconds).toBeLessThan(90);
    t.wind(1);
    t.load(tapeGeometry('C60'), t.geometry.total * 0.9);
    t.wind(1);
    run(t, 2);
    expect(t.v).toBeGreaterThan(early * 1.6);
  });

  it('reverses at the end of side A and stops at the end of side B (⊃⊂)', () => {
    const t = new Transport();
    const g = tapeGeometry('C46');
    t.load(g, g.total - 0.02);
    t.reverseMode = 'both';
    t.play();
    const events = run(t, 1 + END_SENSE_S);
    expect(events).toContain('end');
    expect(events).toContain('reverse');
    expect(t.direction).toBe(-1);
    run(t, T.reverseS + 1);
    expect(t.head).toBe(1);
    expect(t.v).toBeCloseTo(-TAPE_SPEED, 4);
    t.load(g, 0.02);
    t.play();
    const more = run(t, 1 + END_SENSE_S);
    expect(more).toContain('autostop');
    expect(t.mode).toBe('stop');
  });

  it('stops at the end of a side in ⊐ and turns round forever in ∞', () => {
    const t = new Transport();
    const g = tapeGeometry('C46');
    t.reverseMode = 'one';
    t.load(g, g.total - 0.01);
    t.play();
    expect(run(t, 1 + END_SENSE_S)).toContain('autostop');
    t.reverseMode = 'loop';
    t.direction = -1;
    t.head = 1;
    t.load(g, 0.01);
    t.play();
    expect(run(t, 1 + END_SENSE_S)).toContain('reverse');
    expect(t.direction).toBe(1);
  });

  it('cues and reviews with the head on the tape while play is held', () => {
    const t = new Transport();
    t.load(tapeGeometry('C60'), 20);
    t.play();
    run(t, 1);
    t.wind(1);
    run(t, 1);
    expect(t.rate).toBeCloseTo(CUE_FACTOR, 1);
    expect(t.headOnTape).toBe(true);
    t.wind(-1);
    run(t, 1);
    expect(t.rate).toBeCloseTo(-CUE_FACTOR, 1);
    t.release();
    run(t, 1);
    expect(t.rate).toBeCloseTo(1, 3);
  });

  it('music search winds to the target and plays from there', () => {
    const t = new Transport();
    t.load(tapeGeometry('C60'), 5);
    t.wind(1, 25);
    const events = run(t, 30);
    expect(events).toContain('search');
    expect(t.mode).toBe('play');
    expect(t.x).toBeGreaterThan(25);
    expect(t.x).toBeLessThan(26);
  });

  it('reads nothing until the head block has turned', () => {
    const t = new Transport();
    t.play();
    run(t, 1);
    t.reverse();
    run(t, T.reverseS / 2);
    expect(t.headOnTape).toBe(false);
    run(t, T.reverseS + 0.5);
    expect(t.headOnTape).toBe(true);
    expect(t.rate).toBeCloseTo(1, 2);
  });

  it('drops out of play when the power goes off', () => {
    const t = new Transport();
    t.play();
    run(t, 1);
    expect(t.setPower(false)).toBe('power-off');
    expect(t.mode).toBe('stop');
    run(t, 3);
    expect(t.v).toBe(0);
    t.play();
    expect(t.mode).toBe('stop');
  });
});
