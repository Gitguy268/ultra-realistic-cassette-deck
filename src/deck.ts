import { Emitter } from './audio/emitter';
import { AudioEngine } from './audio/engine';
import { mixPlan, type ToneSettings } from './audio/mix';
import { playMechanism, WindSound, type MechanismSound } from './audio/mechanism';
import type { TapeSound } from './audio/tape/chain';
import { FLAT_EQ, type GraphicEq } from './audio/winamp-eq';
import { Door } from './core/door';
import { Program, type Spot, type TapeChoice } from './core/program';
import { counterReading, tapeGeometry } from './core/tape';
import { Transport, type ReverseMode, type TransportEvent } from './core/transport';
import { CONDITIONS, buildDropouts, type Condition, type Dropout } from './core/wear';
import { DECK_SPEC, TAPE_SPEED, type KeyName, type NrMode, type TapeType } from './spec/deck';

/**
 * The deck: the transport, the cassettes recorded from the queue, the door and the sound. It owns
 * every piece of deck state (the 3D stage and the 2D fallback only draw it), and every control
 * on the page and on the model calls one of its actions.
 *
 * Positions: the transport works in physical metres on the right-hand reel. A cassette's own
 * coordinate, `xA`, is the metres wound on the reel that takes up side A; flipping the cassette
 * over swaps which reel is on the right.
 */

export interface DeckEvents {
  status: string;
  announce: string;
  mechanism: MechanismSound;
  /** The head reached another track (queue index). */
  track: number;
  /** The cassette in the deck changed, or was turned over. */
  cassette: undefined;
  /** Play stopped at the end of the tape. */
  tapeEnd: undefined;
}

export interface DeckQueue {
  ids(): readonly string[];
  durations(): readonly (number | undefined)[];
  fileAt(index: number): Blob | undefined;
  titleAt(index: number): string;
}

export interface DeckState {
  cassette: number;
  faceUp: 0 | 1;
  xA: number;
  direction: 1 | -1;
  /** Metres the right reel has wound since the counter's reset. */
  counterAt: number;
}

export interface DeckOptions {
  effects: boolean;
  windToTrack: boolean;
}

const T = DECK_SPEC.transport;
const PREDECODE_AHEAD_S = 25;
/** The engine is re-seeked when it drifts this far from the tape. */
const RESYNC_S = 0.25;
const MIN_ENGINE_RATE = 0.0625;

export class Deck {
  readonly engine = new AudioEngine();
  readonly transport = new Transport();
  readonly program = new Program();
  readonly door = new Door();
  readonly events = new Emitter<DeckEvents>();
  readonly options: DeckOptions = { effects: true, windToTrack: true };
  /** Which cassette of the programme is in the deck (or beside it). */
  cassetteIndex = 0;
  /** The side that faces out through the window: 0 = A. */
  faceUp: 0 | 1 = 0;
  /** The cassette sits in the door's holder; false while it lies beside the deck. */
  inDeck = true;
  /** Physical x of the right reel when the counter was last reset. */
  counterAt = 0;
  /** The keys held down by a hand or a key press (rewind and fast forward while cueing). */
  readonly held = new Set<KeyName>();
  /** Momentary presses still showing, seconds left (stop, record, a tap on a latched key). */
  readonly taps = new Map<KeyName, number>();
  reducedMotion = false;
  /** The deck's switches. */
  tapeType: TapeType = 'II';
  nr: NrMode = 'B';
  /** The cassette's own nature. */
  cassetteType: TapeType = 'II';
  recordedNr: NrMode = 'B';
  condition: Condition = 'good';
  hissLevel = 50;
  /** Bumped when the cassette's look changes (label, flip, swap). */
  version = 0;
  private queue: DeckQueue | null = null;
  private dropouts: Dropout[] = [];
  private loadedIdx = -1;
  private loadingIdx = -1;
  private heardIdx = -1;
  private predecoded = -1;
  private wind: WindSound | null = null;
  private tone: ToneSettings = { bass: 0, mid: 0, treble: 0 };
  private graphicEq: GraphicEq = FLAT_EQ;
  private lastSpot: Spot = { kind: 'leader' };

  constructor() {
    this.engine.events.on('notice', (message) => this.events.emit('status', message));
    this.loadCassette(0, 0, null);
  }

  attach(queue: DeckQueue): void {
    this.queue = queue;
    this.rebuild();
  }

  // ─── The cassette ─────────────────────────────────────────────────

  get geometry(): typeof this.transport.geometry {
    return this.transport.geometry;
  }

  get xA(): number {
    return this.faceUp === 0 ? this.transport.x : this.geometry.total - this.transport.x;
  }

  private physical(xA: number): number {
    return this.faceUp === 0 ? xA : this.geometry.total - xA;
  }

  /** The side the head reads: the one facing out when playing forward. */
  get readingFace(): 0 | 1 {
    return this.transport.direction > 0 ? this.faceUp : ((1 - this.faceUp) as 0 | 1);
  }

  get sideLetter(): 'A' | 'B' {
    return this.program.letter(this.readingFace);
  }

  /** Seconds into a side for a cassette position. */
  sideTime(face: 0 | 1, xA = this.xA): number {
    const g = this.geometry;
    const m = face === 0 ? xA - g.leader : g.total - g.leader - xA;
    return m / TAPE_SPEED;
  }

  private xAFor(face: 0 | 1, seconds: number): number {
    const g = this.geometry;
    const m = seconds * TAPE_SPEED;
    return face === 0 ? g.leader + m : g.total - g.leader - m;
  }

  /** Lays the queue onto cassettes again (the queue or the cassette choice changed). */
  rebuild(choice?: TapeChoice): void {
    const before = this.program.cassettes[this.cassetteIndex]?.tape;
    this.program.build(this.queue?.durations() ?? [], choice);
    this.cassetteIndex = Math.min(this.cassetteIndex, this.program.cassettes.length - 1);
    const cassette = this.program.cassettes[this.cassetteIndex]!;
    if (cassette.tape !== before) {
      const share = this.xA / this.geometry.total;
      this.loadCassette(this.cassetteIndex, this.faceUp, share * cassette.geometry.total);
    } else this.refreshTape();
    this.loadedIdx = -1;
    this.version++;
    this.events.emit('cassette', undefined);
  }

  private loadCassette(index: number, faceUp: 0 | 1, xA: number | null): void {
    const cassette = this.program.cassettes[index] ?? this.program.cassettes[0]!;
    this.cassetteIndex = index;
    this.faceUp = faceUp;
    const g = cassette.geometry;
    const at = xA ?? g.leader;
    this.transport.load(g, faceUp === 0 ? at : g.total - at);
    if (!this.inDeck || !this.door.closed) this.transport.loaded = false;
    this.counterAt = this.transport.x;
    this.refreshTape();
  }

  get cassetteCount(): number {
    return this.program.cassettes.length;
  }

  // ─── Sound settings ───────────────────────────────────────────────

  private refreshTape(): void {
    const type = DECK_SPEC.tapeTypes[this.cassetteType];
    const deck = DECK_SPEC.tapeTypes[this.tapeType];
    const wear = CONDITIONS[this.condition];
    const sound: TapeSound = {
      nrTape: this.recordedNr,
      nrDeck: this.nr,
      tapeUs: type.eqUs,
      deckUs: deck.eqUs,
      hissDb: type.hissDb + wear.hissDb,
      mol: type.mol,
      hfSaturation: type.hfSaturation,
      trebleHz: Math.min(wear.dullHz, this.cassetteType === 'I' ? 13000 : 15500),
      azimuthUs:
        this.transport.direction > 0 ? DECK_SPEC.azimuth.forwardUs : DECK_SPEC.azimuth.reverseUs,
    };
    this.dropouts = buildDropouts(
      `cassette${this.cassetteIndex}`,
      this.condition,
      this.geometry.total,
      TAPE_SPEED,
    );
    this.engine.setTape({ sound, dropouts: this.dropouts, hissScale: this.hissLevel / 50 });
  }

  setSwitches(change: {
    tapeType?: TapeType;
    nr?: NrMode;
    cassetteType?: TapeType;
    recordedNr?: NrMode;
    condition?: Condition;
    hiss?: number;
  }): void {
    let moved = false;
    if (change.tapeType && change.tapeType !== this.tapeType) {
      this.tapeType = change.tapeType;
      moved = true;
    }
    if (change.nr && change.nr !== this.nr) {
      this.nr = change.nr;
      moved = true;
    }
    if (change.cassetteType) this.cassetteType = change.cassetteType;
    if (change.recordedNr) this.recordedNr = change.recordedNr;
    if (change.condition && change.condition !== this.condition) {
      this.condition = change.condition;
      this.version++;
    }
    if (change.hiss !== undefined) this.hissLevel = change.hiss;
    if (moved) this.mechanism('switch');
    this.refreshTape();
  }

  setReverseMode(mode: ReverseMode): void {
    if (mode !== this.transport.reverseMode) this.mechanism('switch');
    this.transport.reverseMode = mode;
  }

  setPitch(percent: number): number {
    const limit = T.pitchPercent;
    const clamped = Math.max(-limit, Math.min(limit, Number.isFinite(percent) ? percent : 0));
    this.transport.pitch = clamped / 100;
    return clamped;
  }

  setTone(tone: ToneSettings): void {
    this.tone = { ...tone };
    this.applyMix();
  }

  setGraphicEq(eq: GraphicEq): void {
    this.graphicEq = eq;
    this.applyMix();
  }

  private applyMix(): void {
    const plan = mixPlan({ ...this.tone, graphicEq: this.graphicEq });
    const bands = this.graphicEq.on ? this.graphicEq.bands : this.graphicEq.bands.map(() => 0);
    this.engine.setMix(plan.musicGain, this.tone, [...bands]);
  }

  setOptions(change: Partial<DeckOptions>): void {
    Object.assign(this.options, change);
  }

  // ─── What is playing ──────────────────────────────────────────────

  /** What lies under the head now. */
  get spot(): Spot {
    return this.lastSpot;
  }

  /** The track the head last read, or -1. */
  get heard(): number {
    return this.heardIdx;
  }

  get title(): string {
    return this.heardIdx >= 0 ? (this.queue?.titleAt(this.heardIdx) ?? '') : '';
  }

  private segment(idx: number): { start: number; end: number } | null {
    return this.program.locate(idx)?.segment ?? null;
  }

  /** Length of the track under the head (or last under it). */
  get duration(): number {
    const s = this.segment(this.heardIdx);
    return s ? s.end - s.start : 0;
  }

  /** Seconds into that track. */
  get currentTime(): number {
    const s = this.segment(this.heardIdx);
    const located = this.program.locate(this.heardIdx);
    if (!s || !located || located.cassette !== this.cassetteIndex) return 0;
    const t = this.sideTime(located.face) - s.start;
    return Math.max(0, Math.min(s.end - s.start, t));
  }

  get counter(): number {
    return counterReading(this.geometry, this.transport.x, this.counterAt);
  }

  get counterText(): string {
    return String(Math.floor(this.counter)).padStart(3, '0');
  }

  get playing(): boolean {
    return this.transport.playing;
  }

  get powered(): boolean {
    return this.transport.powered;
  }

  /** Which piano keys are down, as the model and the 2D deck show them. */
  keyDown(key: KeyName): boolean {
    const t = this.transport;
    if (this.held.has(key) || (this.taps.get(key) ?? 0) > 0) return true;
    switch (key) {
      case 'play':
        return t.mode === 'play';
      case 'pause':
        return t.mode === 'play' && t.paused;
      case 'ff':
        return t.mode === 'wind' && t.windDir === t.direction;
      case 'rew':
        return t.mode === 'wind' && t.windDir !== t.direction;
      default:
        return false;
    }
  }

  // ─── Controls ─────────────────────────────────────────────────────

  private mechanism(sound: MechanismSound): void {
    if (this.options.effects) this.events.emit('mechanism', sound);
  }

  /** Every press starts the audio graph: browsers only allow it inside a gesture. */
  private wake(): void {
    void this.engine.init().then(({ ctx }) => {
      void ctx.resume();
      this.engine.retryRoute();
    });
  }

  private ready(): boolean {
    if (!this.transport.powered) {
      this.events.emit('status', 'The deck is switched off.');
      return false;
    }
    if (!this.inDeck) {
      this.events.emit('status', 'No cassette in the deck: put it back in the door first.');
      return false;
    }
    if (!this.door.closed) {
      this.door.shut();
      this.mechanism('door-close');
    }
    return true;
  }

  /** A key goes down under a finger for a moment. */
  tap(key: KeyName): void {
    this.taps.set(key, 0.14);
  }

  /** The record key: this deck only plays. */
  record(): void {
    this.tap('rec');
    this.mechanism('key');
    this.events.emit('status', 'This deck only plays: recording is not wired up.');
  }

  play(): void {
    this.wake();
    this.tap('play');
    this.mechanism('key');
    if (!this.ready()) return;
    if (this.transport.mode === 'play' && this.transport.paused) {
      this.transport.togglePause();
      return;
    }
    this.transport.play();
  }

  /** Space: play, or pause while playing. */
  togglePlay(): void {
    if (this.transport.mode === 'play' && !this.transport.paused) this.pause();
    else this.play();
  }

  pause(): void {
    this.wake();
    this.tap('pause');
    this.mechanism('key');
    if (!this.transport.powered || this.transport.mode !== 'play') return;
    this.transport.togglePause();
  }

  /** ■/⏏: stops, and when already stopped, ejects. */
  stopOrEject(): void {
    this.wake();
    this.tap('stop');
    if (this.transport.mode === 'stop' && this.door.closed) {
      this.eject();
      return;
    }
    this.mechanism('key');
    if (this.transport.mode !== 'stop') this.mechanism('release');
    this.transport.stop();
  }

  stop(): void {
    this.wake();
    this.tap('stop');
    this.mechanism('key');
    if (this.transport.mode !== 'stop') this.mechanism('release');
    this.transport.stop();
  }

  /** Rewind (−1) or fast forward (+1). Held during play, it reviews or cues until released. */
  windKey(relative: 1 | -1, down: boolean): void {
    const key: KeyName = relative > 0 ? 'ff' : 'rew';
    if (!down) {
      this.held.delete(key);
      if (this.transport.cue !== 0) {
        this.transport.release();
        this.mechanism('key-up');
      }
      return;
    }
    this.wake();
    this.mechanism('key');
    if (!this.ready()) return;
    this.held.add(key);
    if (this.transport.mode !== 'play') this.mechanism('engage');
    this.transport.wind(relative);
  }

  /** B / N and the ⏮ ⏭ buttons: wind to the previous or next track and play it. */
  search(direction: 1 | -1): boolean {
    this.wake();
    if (!this.ready()) return false;
    const face = this.readingFace;
    const target = this.program.searchTarget(
      this.cassetteIndex,
      face,
      this.sideTime(face),
      direction,
    );
    if (target === null) {
      this.events.emit(
        'status',
        direction > 0 ? 'No more tracks on this side.' : 'This is the first track on this side.',
      );
      return false;
    }
    this.windTo(face, target);
    return true;
  }

  /** Winds (with music search) to `seconds` into a side and plays from there. */
  private windTo(face: 0 | 1, seconds: number): void {
    const x = this.physical(this.xAFor(face, seconds));
    const physicalDir: 1 | -1 = x >= this.transport.x ? 1 : -1;
    this.mechanism('key');
    this.mechanism('engage');
    this.transport.stop();
    this.transport.wind((physicalDir * this.transport.direction) as 1 | -1, x);
  }

  /** ◀▶: the head turns over and the other side plays. */
  reverse(): void {
    this.wake();
    this.mechanism('key');
    if (!this.transport.powered) return;
    this.transport.reverse();
    this.refreshTape();
    this.mechanism('reverse');
    this.events.emit('announce', `Side ${this.sideLetter}.`);
  }

  togglePower(): void {
    this.wake();
    const event = this.transport.setPower(!this.transport.powered);
    if (event) this.mechanism(event);
    this.events.emit('announce', this.transport.powered ? 'Power on.' : 'Power off.');
  }

  resetCounter(): void {
    this.counterAt = this.transport.x;
    this.mechanism('counter-reset');
  }

  /** ⏏ on its own: stop if running, then the door springs open. */
  eject(): void {
    this.wake();
    this.tap('stop');
    if (!this.door.closed) {
      this.door.shut();
      this.mechanism('door-close');
      return;
    }
    this.mechanism('key');
    if (this.transport.mode !== 'stop') this.mechanism('release');
    this.transport.stop();
    this.transport.loaded = false;
    this.door.eject();
    this.mechanism('eject');
  }

  /** The cassette out of the holder, onto the credenza, or back in. Only with the door open. */
  toggleCassette(): void {
    if (this.door.closed) return;
    this.inDeck = !this.inDeck;
    this.mechanism(this.inDeck ? 'insert' : 'remove');
    this.events.emit('announce', this.inDeck ? 'Cassette in.' : 'Cassette out.');
  }

  /** Turns the cassette over in the hand (only while it is out of the deck). */
  flip(): void {
    if (this.inDeck && !this.door.closed) {
      this.inDeck = false;
    }
    const x = this.xA;
    this.faceUp = (1 - this.faceUp) as 0 | 1;
    this.transport.x = this.physical(x);
    this.version++;
    this.mechanism('remove');
    this.events.emit('cassette', undefined);
    this.events.emit('announce', `Side ${this.program.letter(this.faceUp)} up.`);
  }

  /** Puts another cassette of the programme in the deck, or the same one turned over. */
  swapCassette(index: number, faceUp: 0 | 1 = 0, seconds = 0): void {
    if (index < 0 || index >= this.program.cassettes.length) return;
    this.transport.stop();
    this.loadCassette(index, faceUp, null);
    this.transport.x = this.physical(this.xAFor(faceUp, seconds));
    this.counterAt = this.transport.x;
    this.loadedIdx = -1;
    this.version++;
    this.mechanism('insert');
    this.events.emit('cassette', undefined);
  }

  /** A pencil in the hub: winds the cassette by hand (only out of the deck). Metres, signed. */
  handWind(metres: number): void {
    const g = this.geometry;
    this.transport.x = Math.max(0, Math.min(g.total, this.transport.x + metres));
  }

  /**
   * A track chosen in the library: the deck winds to it (or jumps, with "Wind to a chosen
   * track" off) and plays when asked. Another cassette is swapped in, a side on the far face
   * is reached by turning the head.
   */
  selectTrack(idx: number, autoplay: boolean): void {
    const located = this.program.locate(idx);
    if (!located) return;
    this.wake();
    if (!this.transport.powered) this.togglePower();
    if (!this.inDeck) this.inDeck = true;
    if (!this.door.closed) {
      this.door.shut();
      this.mechanism('door-close');
    }
    const at = Math.max(0, located.segment.start - 1);
    if (located.cassette !== this.cassetteIndex) {
      this.swapCassette(located.cassette, located.face, at);
      this.transport.direction = 1;
      this.transport.head = 0;
    } else if (this.readingFace !== located.face) {
      this.transport.direction = this.transport.direction > 0 ? -1 : 1;
      this.refreshTape();
      this.mechanism('reverse');
    }
    this.transport.loaded = true;
    const near = Math.abs(this.sideTime(located.face) - at) < 1.5;
    if (autoplay && this.options.windToTrack && !this.reducedMotion && !near) {
      this.windTo(located.face, at);
      return;
    }
    this.transport.stop();
    this.transport.x = this.physical(this.xAFor(located.face, at));
    if (autoplay) this.transport.play();
  }

  /** Jumps within the track under the head (the seek bar and ← →). */
  seek(seconds: number): void {
    const located = this.program.locate(this.heardIdx);
    if (!located || located.cassette !== this.cassetteIndex) return;
    const s = located.segment;
    const t = Math.max(0, Math.min(s.end - s.start - 0.05, seconds));
    this.transport.x = this.physical(this.xAFor(located.face, s.start + t));
    if (this.engine.playing) this.engine.seek(t);
  }

  // ─── Between visits ───────────────────────────────────────────────

  /** Where the tape stood, for the next visit. */
  saveState(): DeckState {
    return {
      cassette: this.cassetteIndex,
      faceUp: this.faceUp,
      xA: this.xA,
      direction: this.transport.direction,
      counterAt: this.transport.x - this.counterAt,
    };
  }

  /** Puts the cassette back where it was left, wound to the same place. */
  restoreState(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const state = raw as Partial<DeckState>;
    const index = Number(state.cassette);
    if (!Number.isInteger(index) || index < 0 || index >= this.program.cassettes.length) return;
    const face = state.faceUp === 1 ? 1 : 0;
    this.loadCassette(index, face, Number.isFinite(state.xA) ? Number(state.xA) : null);
    this.transport.direction = state.direction === -1 ? -1 : 1;
    this.transport.head = this.transport.direction > 0 ? 0 : 1;
    if (Number.isFinite(state.counterAt))
      this.counterAt = this.transport.x - Number(state.counterAt);
    this.refreshTape();
    this.version++;
    this.events.emit('cassette', undefined);
  }

  // ─── Every frame ──────────────────────────────────────────────────

  private onTransport(event: TransportEvent): void {
    switch (event) {
      case 'engaged':
        if (this.transport.mode === 'play') this.mechanism('engage');
        break;
      case 'end':
        this.mechanism('end');
        break;
      case 'reverse':
        this.refreshTape();
        this.mechanism('reverse');
        this.events.emit('announce', `Auto-reverse: side ${this.sideLetter}.`);
        break;
      case 'autostop':
        this.held.clear();
        this.mechanism('release');
        this.events.emit('status', 'End of the tape.');
        this.events.emit('tapeEnd', undefined);
        break;
      case 'search':
        this.mechanism('brake');
        break;
      default:
        break;
    }
  }

  tick(dt: number): void {
    for (const [key, left] of this.taps) {
      if (left - dt <= 0) this.taps.delete(key);
      else this.taps.set(key, left - dt);
    }
    const t = this.transport;
    const wasReading = t.direction;
    for (const event of t.step(dt)) this.onTransport(event);
    if (t.direction !== wasReading) this.refreshTape();
    const doorEvent = this.reducedMotion ? this.door.snap() : this.door.step(dt);
    if (doorEvent === 'closed' && this.inDeck) t.loaded = true;
    if (doorEvent === 'opened') this.events.emit('announce', 'Door open.');
    this.sync();
    this.windSound();
  }

  /** Keeps the sound on the tape: the engine plays the track under the head at the tape's speed. */
  private sync(): void {
    const t = this.transport;
    const engine = this.engine;
    const face = this.readingFace;
    const at = this.sideTime(face);
    const spot = this.program.spot(this.cassetteIndex, face, at);
    this.lastSpot = spot;
    const contact = t.headOnTape && t.loaded;
    const rate = t.rate;
    const vA = this.faceUp === 0 ? t.v : -t.v;
    engine.setMotion(rate, contact, this.xA, vA);
    if (spot.kind === 'track' && spot.idx !== this.heardIdx) {
      this.heardIdx = spot.idx;
      this.events.emit('track', spot.idx);
    }
    this.predecode(spot, at);
    const moving = contact && Math.abs(rate) > 0.02;
    if (spot.kind !== 'track' || !moving) {
      if (engine.playing) engine.pause();
      if (engine.isCueing) engine.endScratch();
      return;
    }
    if (this.loadedIdx !== spot.idx) {
      this.load(spot.idx);
      return;
    }
    if (engine.state === 'loading' || engine.state === 'idle') return;
    if (spot.t > engine.duration - 0.05) return;
    if (t.cue !== 0) {
      if (!engine.isCueing && !engine.beginScratch()) return;
      engine.setScratchRate(rate);
      return;
    }
    if (engine.isCueing) {
      engine.endScratch();
      return;
    }
    engine.setRate(Math.max(MIN_ENGINE_RATE, Math.abs(rate)));
    if (engine.mode === 'stream') engine.setStreamRate(Math.max(MIN_ENGINE_RATE, Math.abs(rate)));
    if (!engine.playing) {
      engine.seek(spot.t);
      void engine.play().catch(() => undefined);
      return;
    }
    const drift = engine.currentTime - spot.t;
    if (Math.abs(drift) > RESYNC_S) {
      engine.seek(spot.t);
      return;
    }
    // Steady play: the sound leads, the tape follows it, so the two never part.
    if (Math.abs(rate - (1 + t.pitch)) < 0.01 && !t.engaging) {
      const located = this.segment(spot.idx);
      if (located) t.x = this.physical(this.xAFor(face, located.start + engine.currentTime));
    }
  }

  private load(idx: number): void {
    if (this.loadingIdx === idx) return;
    const file = this.queue?.fileAt(idx);
    if (!file) return;
    this.loadingIdx = idx;
    const durations = this.queue?.durations() ?? [];
    void this.engine
      .load(file, durations[idx] ?? 0)
      .then(() => {
        if (this.loadingIdx === idx) this.loadedIdx = idx;
      })
      .catch(() => {
        this.events.emit(
          'status',
          `This track could not be played: ${this.queue?.titleAt(idx) ?? ''}.`,
        );
        this.loadedIdx = idx;
      })
      .finally(() => {
        if (this.loadingIdx === idx) this.loadingIdx = -1;
      });
  }

  /** The next track is decoded before the head reaches it, so the gap is crossed without a wait. */
  private predecode(spot: Spot, at: number): void {
    let next = -1;
    if (spot.kind === 'blank') next = spot.next;
    else if (spot.kind === 'track') {
      const s = this.segment(spot.idx);
      const segments = this.program.side(this.cassetteIndex, this.readingFace).segments;
      const i = segments.findIndex((x) => x.idx === spot.idx);
      if (s && s.end - at < PREDECODE_AHEAD_S) next = segments[i + 1]?.idx ?? -1;
    }
    if (next < 0 || next === this.predecoded || next === this.loadedIdx) return;
    const file = this.queue?.fileAt(next);
    if (!file) return;
    this.predecoded = next;
    if (spot.kind === 'blank' && this.loadingIdx < 0) {
      this.load(next);
      return;
    }
    void this.engine.predecode(file, this.queue?.durations()[next] ?? 0);
  }

  private windSound(): void {
    const t = this.transport;
    const ctx = this.engine.context;
    const bus = this.engine.mechanismBus;
    if (!ctx || !bus) return;
    if (!this.wind && t.mode === 'wind') this.wind = new WindSound(ctx, bus);
    if (!this.wind) return;
    const winding = t.mode === 'wind' || Math.abs(t.v) > TAPE_SPEED * 2;
    const on = winding && this.options.effects;
    this.wind.set(
      on ? DECK_SPEC.transport.windRadPerS * Math.min(1, Math.abs(t.v) / 0.3) : 0,
      on ? Math.abs(t.v) : 0,
    );
  }

  withAudio(fn: (ctx: AudioContext, bus: AudioNode) => void): void {
    const ctx = this.engine.context;
    const bus = this.engine.mechanismBus;
    if (ctx && bus) fn(ctx, bus);
  }

  /** Plays a mechanism sound now (the app routes the deck's `mechanism` events here). */
  playMechanism(sound: MechanismSound): void {
    this.withAudio((ctx, bus) => {
      if (ctx.state === 'running') playMechanism(ctx, bus, sound);
    });
  }
}

export { tapeGeometry };
