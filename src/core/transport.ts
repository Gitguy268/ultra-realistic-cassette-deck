import { DECK_SPEC, TAPE_SPEED } from '../spec/deck';
import { packRadius, tapeGeometry, type TapeGeometry } from './tape';

/**
 * The tape transport: the one source of where the tape is and how fast it moves. Every view of
 * the deck reads it: the pack sizes in the window, the spokes, the counter and the read position
 * the audio follows.
 *
 * Coordinates are physical: `x` is the metres wound on the right-hand reel, and positive speed
 * moves tape from left to right. In play the capstan sets the speed; in fast wind the spindle motor
 * turns the take-up reel toward a fixed angular speed, so the tape speeds up as that pack grows.
 */

export type Mode = 'stop' | 'play' | 'wind';
/** ⊐ one side, ⊃⊂ both sides once, ∞ round and round. */
export type ReverseMode = 'one' | 'both' | 'loop';
export type TransportEvent =
  'engaged' | 'end' | 'reverse' | 'autostop' | 'search' | 'power-off' | 'power-on';

const T = DECK_SPEC.transport;
/** Cue and review run the tape this many times play speed with the head on it. [D] */
export const CUE_FACTOR = 7;
/** The take-up reel stalls at the end of the tape; the deck notices after this long. [D] */
export const END_SENSE_S = 0.35;
const STILL = 1e-4;

export class Transport {
  geometry: TapeGeometry = tapeGeometry('C60');
  x = this.geometry.leader;
  /** Tape speed, m/s, positive to the right. */
  v = 0;
  mode: Mode = 'stop';
  /** Which way the head reads: +1 reads tape moving right (the side facing out). */
  direction: 1 | -1 = 1;
  paused = false;
  /** Cue (+1) or review (−1) while play is held with a wind key; 0 otherwise. */
  cue: -1 | 0 | 1 = 0;
  /** Physical direction of a fast wind. */
  windDir: 1 | -1 = 1;
  powered = true;
  /** Fraction, e.g. 0.02 = +2 %. */
  pitch = 0;
  reverseMode: ReverseMode = 'both';
  /** Physical x where a music search stops and plays. */
  search: number | null = null;
  /** The head block's turn, 0 facing forward and 1 turned for reverse. */
  head = 0;
  /** A tape is in and the door is shut. */
  loaded = true;
  private engage = 0;
  private stall = 0;
  private endHeard = false;
  private tau: number = T.startTau;

  load(geometry: TapeGeometry, x: number): void {
    this.geometry = geometry;
    this.x = Math.max(0, Math.min(geometry.total, x));
    this.v = 0;
    this.loaded = true;
    this.stall = 0;
    this.endHeard = false;
  }

  unload(): void {
    this.stop();
    this.v = 0;
    this.loaded = false;
  }

  /** Metres on the left reel. */
  get leftWound(): number {
    return this.geometry.total - this.x;
  }

  /** Speed as a multiple of play speed, signed in the play direction. */
  get rate(): number {
    return (this.v * this.direction) / TAPE_SPEED;
  }

  /** The head touches tape moving past it: play, cue, review or pause. */
  get headOnTape(): boolean {
    return this.loaded && this.mode === 'play' && this.head === (this.direction > 0 ? 0 : 1);
  }

  get playing(): boolean {
    return this.mode === 'play' && !this.paused && this.cue === 0;
  }

  get engaging(): boolean {
    return this.engage > 0;
  }

  play(): void {
    if (!this.powered || !this.loaded) return;
    if (this.mode !== 'play') this.engage = T.engageS;
    this.mode = 'play';
    this.paused = false;
    this.cue = 0;
    this.search = null;
  }

  stop(): void {
    this.mode = 'stop';
    this.paused = false;
    this.cue = 0;
    this.search = null;
  }

  /** The pause key latches; play stays selected with the pinch roller lifted. */
  togglePause(): void {
    if (!this.powered || !this.loaded) return;
    this.paused = !this.paused;
  }

  /**
   * Fast forward (+1) or rewind (−1), relative to the play direction. During play this is cue or
   * review instead, for as long as the key is held: `release()` ends it.
   */
  wind(relative: 1 | -1, searchTo: number | null = null): void {
    if (!this.powered || !this.loaded) return;
    if (this.mode === 'play' && searchTo === null) {
      this.cue = relative;
      this.paused = false;
      return;
    }
    if (this.mode !== 'wind') this.engage = T.engageS;
    this.mode = 'wind';
    this.paused = false;
    this.cue = 0;
    this.windDir = (relative * this.direction) as 1 | -1;
    this.search = searchTo;
  }

  release(): void {
    this.cue = 0;
  }

  /** The ◀▶ key: the head turns and play continues the other way. */
  reverse(): void {
    if (!this.powered) return;
    this.direction = this.direction > 0 ? -1 : 1;
    this.cue = 0;
    if (this.mode === 'play') this.engage = T.reverseS;
  }

  setPower(on: boolean): 'power-off' | 'power-on' | null {
    if (on === this.powered) return null;
    this.powered = on;
    if (!on) {
      // The pinch roller drops away; a capstan flywheel would run down, but the tape stops with
      // the roller lifted. Keys release, as on a solenoid deck.
      this.tau = this.mode === 'play' ? T.runDownTau : T.brakeTau;
      this.mode = 'stop';
      this.paused = false;
      this.cue = 0;
      this.search = null;
      return 'power-off';
    }
    return 'power-on';
  }

  private target(): number {
    if (!this.powered || !this.loaded || this.engage > 0) return 0;
    const reading = this.head === (this.direction > 0 ? 0 : 1);
    switch (this.mode) {
      case 'stop':
        return 0;
      case 'play':
        if (!reading || this.paused) return 0;
        if (this.cue !== 0) return this.direction * this.cue * CUE_FACTOR * TAPE_SPEED;
        return this.direction * TAPE_SPEED * (1 + this.pitch);
      case 'wind': {
        const takeUp = this.windDir > 0 ? this.x : this.leftWound;
        return this.windDir * T.windRadPerS * packRadius(this.geometry, takeUp);
      }
    }
  }

  private tauFor(target: number): number {
    if (!this.powered) return this.tau;
    if (this.mode === 'wind') return Math.abs(target) > Math.abs(this.v) ? T.windTau : T.brakeTau;
    if (this.mode === 'play') {
      if (this.cue !== 0) return T.windTau / 2;
      return Math.abs(target) >= Math.abs(this.v) ? T.startTau : T.stopTau;
    }
    return Math.abs(this.v) > TAPE_SPEED * 1.5 ? T.brakeTau : T.stopTau;
  }

  /** Advances `dt` seconds and returns what happened, in order. */
  step(dt: number): TransportEvent[] {
    const events: TransportEvent[] = [];
    if (dt <= 0) return events;
    // The head block turns toward the play direction first; nothing reads until it has.
    const wantHead = this.direction > 0 ? 0 : 1;
    if (this.head !== wantHead) {
      const step = dt / T.reverseS;
      this.head =
        wantHead > this.head ? Math.min(1, this.head + step) : Math.max(0, this.head - step);
    }
    if (this.engage > 0) {
      this.engage = Math.max(0, this.engage - dt);
      if (this.engage === 0) events.push('engaged');
    }
    const target = this.target();
    const tau = this.tauFor(target);
    this.v += (target - this.v) * (1 - Math.exp(-dt / tau));
    if (Math.abs(this.v) < STILL && target === 0) this.v = 0;
    const before = this.x;
    this.x += this.v * dt;
    if (this.search !== null && this.mode === 'wind') {
      const crossed = (before - this.search) * (this.x - this.search) <= 0;
      if (crossed) {
        this.x = this.search;
        this.search = null;
        this.v = 0;
        this.mode = 'play';
        this.engage = T.engageS;
        events.push('search');
      }
    }
    // The ends: the tape pulls tight on its hub and stops.
    const atEnd = (this.x >= this.geometry.total && target > 0) || (this.x <= 0 && target < 0);
    this.x = Math.max(0, Math.min(this.geometry.total, this.x));
    if (!atEnd) {
      this.stall = 0;
      this.endHeard = false;
      return events;
    }
    this.v = 0;
    if (!this.endHeard) {
      this.endHeard = true;
      events.push('end');
    }
    this.stall += dt;
    if (this.stall < END_SENSE_S) return events;
    this.stall = 0;
    this.endHeard = false;
    const readingForward = this.mode === 'play' && this.cue === 0;
    if (readingForward) {
      const again =
        this.reverseMode === 'loop' || (this.reverseMode === 'both' && this.direction > 0);
      if (again) {
        this.reverse();
        events.push('reverse');
        return events;
      }
    }
    this.stop();
    events.push('autostop');
    return events;
  }
}
