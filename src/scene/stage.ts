import { Raycaster, Vector2, Vector3, type MeshStandardMaterial, type Object3D } from 'three';
import type { Deck } from '../deck';
import { DECK_SPEC, type KeyName } from '../spec/deck';
import { NeedleBallistics, levelToDeflection, measure } from '../ui/vu';
import { CameraRig } from './camera';
import type { SwitchName } from './deck/build';
import { poseDeck, type DeckPose } from './deck/pose';
import { CassetteLabel, type LabelContent } from './materials/cassette-label';
import { World } from './world';

/**
 * The page's 3D stage: the World, posed every frame from the deck's state, with the camera rig,
 * pointer picking and the cassette's labels. It owns no deck state; every pick calls the same
 * Deck action its DOM twin does.
 */

const K = DECK_SPEC.keys;
const W = DECK_SPEC.well;
const IDLE_AFTER_S = 1;
const IDLE_FRAME_S = 0.25;
/** Averaging under 24 fps for this long lowers the resolution one step. */
const SLOW_FRAME_S = 1 / 24;
const SLOW_FOR_S = 2;
const MIN_PIXEL_SCALE = 0.55;
const FLIP_S = 0.6;

export type PickKind =
  | `key:${KeyName}`
  | `switch:${SwitchName}`
  | 'door'
  | 'cassette'
  | 'power'
  | 'counterReset'
  | 'levelKnob'
  | 'none';

export interface StageHooks {
  /** The output level, 0..1, and a turn of the knob. */
  level(): number;
  setLevel(level: number): void;
  /** A switch's position (0, 1, 2) and a click that moves it one step. */
  switchPosition(name: SwitchName): number;
  stepSwitch(name: SwitchName): void;
}

export class Stage {
  readonly world: World;
  readonly rig: CameraRig;
  readonly labels = [new CassetteLabel(), new CassetteLabel()] as const;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly needles = [new NeedleBallistics(), new NeedleBallistics()];
  private readonly samples = new Float32Array(1024);
  private readonly keyTravel = new Map<KeyName, number>();
  private faceUp: 0 | 1 = 0;
  private flipLeft = 0;
  private lastMotion = NaN;
  private shadowKey = '';
  private pointerX = 0;
  private pointerY = 0;
  private leanX = 0;
  private leanY = 0;
  private stillFor = 0;
  private sinceDrawn = 0;
  private frameCost = 0;
  private slowFor = 0;
  private pixelScale = 1;
  private readonly lastSize = { width: 1, height: 1, ratio: 1 };
  private drag: {
    kind: PickKind;
    id: number;
    x: number;
    y: number;
    moved: number;
    door: number;
  } | null = null;
  private pinch: { a: number; b: number; distance: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly pose: DeckPose;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly deck: Deck,
    private readonly hooks: StageHooks,
  ) {
    this.world = new World(canvas);
    this.rig = new CameraRig(this.world.camera);
    this.world.deck.labels.forEach((mesh, i) => {
      const material = mesh.material as MeshStandardMaterial;
      material.map = this.labels[i]!.texture;
      material.needsUpdate = true;
    });
    this.faceUp = deck.faceUp;
    this.pose = {
      doorDeg: 0,
      keys: {},
      geometry: deck.geometry,
      x: deck.transport.x,
      faceUp: deck.faceUp,
      flipping: 0,
      inDeck: true,
      counter: 0,
      needles: [0, 0],
      switches: { tapeType: 1, nr: 1, reverse: 1 },
      level: 0.8,
      powered: true,
      forward: true,
      reverse: false,
      head: 0,
    };
    this.bindPointer();
  }

  /** Poses every moving part from the deck and renders a frame. */
  frame(
    dt: number,
    time: number,
    labels: [LabelContent, LabelContent],
    live: HTMLCanvasElement | null,
  ): void {
    const { deck, world } = this;
    const t = deck.transport;
    const calm = this.rig.calm;
    const p = this.pose;
    // Keys glide to where the deck has them.
    const ease = calm ? 1 : 1 - Math.exp(-dt / K.pressS);
    for (const key of K.order) {
      const down = deck.keyDown(key);
      const latched = key === 'play' || key === 'pause' || key === 'ff' || key === 'rew';
      const target = down
        ? latched && !deck.held.has(key) && !deck.taps.has(key)
          ? K.latchTravel / K.travel
          : 1
        : 0;
      const now = this.keyTravel.get(key) ?? 0;
      const next = now + (target - now) * ease;
      this.keyTravel.set(key, Math.abs(next - target) < 1e-3 ? target : next);
      p.keys[key] = this.keyTravel.get(key);
    }
    // Turning the cassette over: half a turn in the hand.
    if (deck.faceUp !== this.faceUp) {
      this.faceUp = deck.faceUp;
      this.flipLeft = calm ? 0 : FLIP_S;
    }
    this.flipLeft = Math.max(0, this.flipLeft - dt);
    const flip = this.flipLeft > 0 ? 1 - this.flipLeft / FLIP_S : 1;
    p.faceUp = flip < 1 ? ((1 - deck.faceUp) as 0 | 1) : deck.faceUp;
    p.flipping = flip < 1 ? flip : 0;
    p.doorDeg = deck.door.angle;
    p.geometry = deck.geometry;
    p.x = t.x;
    p.inDeck = deck.inDeck;
    p.counter = deck.counter;
    p.powered = t.powered;
    p.forward = t.powered && t.direction > 0;
    p.reverse = t.powered && t.direction < 0;
    p.head = t.head;
    p.level = this.hooks.level();
    for (const name of ['tapeType', 'nr', 'reverse'] as const)
      p.switches[name] = this.hooks.switchPosition(name);
    // VU needles: the meters read the deck's output, with real VU ballistics.
    for (let channel = 0; channel < 2; channel++) {
      let target = 0;
      if (t.powered && deck.engine.readMeter(channel as 0 | 1, this.samples)) {
        target = levelToDeflection(measure(this.samples).rms);
      }
      p.needles[channel] = calm ? target : this.needles[channel]!.step(target, dt);
    }
    poseDeck(world.deck, p);
    // Lamps and LEDs.
    const m = world.materials;
    m.meterFace.emissiveIntensity = t.powered ? 0.22 : 0;
    m.lampGlow.opacity = t.powered ? 0.16 : 0;
    // The two direction LEDs share a material: the dark one wears the recess's.
    world.deck.leds.forward.material = p.forward ? m.ledGreen : m.recess;
    world.deck.leds.reverse.material = p.reverse ? m.ledGreen : m.recess;
    m.ledGreen.emissiveIntensity = t.powered ? 2.4 : 0;
    m.ledRed.emissiveIntensity = t.powered ? 2.2 : 0;
    // The lamp's highlight leans a little toward the pointer.
    const lean = calm ? 0 : 1 - Math.exp(-dt / 0.25);
    this.leanX += (this.pointerX - this.leanX) * lean;
    this.leanY += (this.pointerY - this.leanY) * lean;
    world.lighting.lean(this.leanX, this.leanY);
    // Labels: side A on the front of the shell, side B on the back; the live picture goes on
    // whichever faces out while the tape plays.
    labels.forEach((content, i) => this.labels[i]!.paint(content));
    const showing = live && deck.inDeck && deck.playing ? deck.faceUp : -1;
    this.labels.forEach((label, i) => label.showLive(i === showing ? live : null));
    // Shadows follow the parts that cast them.
    const shadowKey = `${Math.round(p.doorDeg)}|${deck.inDeck}|${Math.round(p.flipping * 20)}`;
    if (shadowKey !== this.shadowKey) {
      this.shadowKey = shadowKey;
      world.markShadowsDirty();
    }
    this.rig.update(dt);
    world.postSettings.dofAperture = this.rig.dof ? 2.4 : 0;
    world.postSettings.focusDistance = this.rig.focusDistance;
    // Nothing moving: a still image only needs its grain refreshed now and then.
    const c = world.camera;
    let keys = 0;
    for (const v of this.keyTravel.values()) keys += v;
    const motion =
      t.x * 1e5 +
      p.doorDeg +
      keys * 1e3 +
      p.needles[0] * 1e4 +
      p.needles[1] * 1e4 +
      p.head * 1e3 +
      p.flipping * 1e3 +
      Number(p.inDeck) +
      Number(p.powered) * 7 +
      p.level * 1e3 +
      p.switches.tapeType * 3 +
      p.switches.nr * 5 +
      p.switches.reverse * 11 +
      this.leanX * 1e4 +
      this.leanY * 1e4 +
      c.position.x * 1e4 +
      c.position.y * 1e4 +
      c.position.z * 1e4 +
      c.quaternion.x * 1e4 +
      c.quaternion.y * 1e4 +
      c.fov;
    const still =
      motion === this.lastMotion &&
      (live === null || !deck.playing) &&
      !world.shadowsPending &&
      !this.drag;
    this.lastMotion = motion;
    this.stillFor = still ? this.stillFor + dt : 0;
    this.sinceDrawn += dt;
    if (this.stillFor > IDLE_AFTER_S && this.sinceDrawn < IDLE_FRAME_S) return;
    this.adapt(this.sinceDrawn);
    this.sinceDrawn = 0;
    world.render(time);
  }

  get flipping(): boolean {
    return this.flipLeft > 0;
  }

  /** Sustained slow frames: draw fewer pixels rather than drop frames. It never climbs back. */
  private adapt(dt: number): void {
    if (this.stillFor > IDLE_AFTER_S || dt <= 0 || dt >= 0.25) return;
    this.frameCost += (dt - this.frameCost) * 0.05;
    if (this.frameCost < SLOW_FRAME_S || this.pixelScale <= MIN_PIXEL_SCALE) {
      this.slowFor = 0;
      return;
    }
    this.slowFor += dt;
    if (this.slowFor < SLOW_FOR_S) return;
    this.slowFor = 0;
    this.frameCost = 0;
    this.pixelScale = Math.max(MIN_PIXEL_SCALE, this.pixelScale - 0.15);
    this.world.resize(
      this.lastSize.width,
      this.lastSize.height,
      this.lastSize.ratio * this.pixelScale,
    );
  }

  /**
   * `free` is the rectangle of the canvas no panel covers, in CSS px from its top left. The
   * camera's principal point moves to its centre, so the deck is framed in the open part.
   */
  resize(
    width: number,
    height: number,
    pixelRatio: number,
    free?: { left: number; top: number; right: number; bottom: number },
  ): void {
    this.lastSize.width = width;
    this.lastSize.height = height;
    this.lastSize.ratio = pixelRatio;
    this.world.resize(width, height, pixelRatio * this.pixelScale);
    const camera = this.world.camera;
    if (free) {
      const dx = width / 2 - (free.left + free.right) / 2;
      const dy = height / 2 - (free.top + free.bottom) / 2;
      camera.setViewOffset(width, height, dx, dy, width, height);
    } else camera.clearViewOffset();
  }

  // ─── Picking ─────────────────────────────────────────────────────

  /** What lies under a canvas point: the nearest named control. */
  pick(clientX: number, clientY: number): { kind: PickKind; point: Vector3 | null } {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.world.camera);
    const hits = this.raycaster.intersectObject(this.world.deck.root, true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      // With the door open, a hand reaches past its window to the cassette behind.
      if (h.object.name === 'doorWindow' && !this.deck.door.closed) continue;
      const kind = this.kindOf(h.object);
      // The cassette in the shut door is seen through the window: a click there is the door's.
      if (kind === 'cassette' && this.deck.inDeck && this.deck.door.closed)
        return { kind: 'door', point: h.point };
      if (kind !== 'none') return { kind, point: h.point };
    }
    return { kind: 'none', point: null };
  }

  private kindOf(o: Object3D | null): PickKind {
    for (let n = o; n; n = n.parent) {
      const name = n.name;
      if (name.startsWith('key:') || name.startsWith('switch:')) return name as PickKind;
      switch (name) {
        case 'cassette':
        case 'door':
        case 'power':
        case 'counterReset':
        case 'levelKnob':
          return name;
      }
    }
    return 'none';
  }

  /** Presses a piano key or a button on the model; held keys are released in `release`. */
  private press(kind: PickKind): void {
    const d = this.deck;
    switch (kind) {
      case 'key:rec':
        return d.record();
      case 'key:rew':
        return d.windKey(-1, true);
      case 'key:ff':
        return d.windKey(1, true);
      case 'key:play':
        return d.play();
      case 'key:stop':
        return d.stopOrEject();
      case 'key:pause':
        return d.pause();
      case 'power':
        return d.togglePower();
      case 'counterReset':
        return d.resetCounter();
      case 'switch:tapeType':
      case 'switch:nr':
      case 'switch:reverse':
        return this.hooks.stepSwitch(kind.slice(7) as SwitchName);
      default:
        return;
    }
  }

  private release(kind: PickKind): void {
    if (kind === 'key:rew') this.deck.windKey(-1, false);
    if (kind === 'key:ff') this.deck.windKey(1, false);
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.rig.skipIntro();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        this.pinch = {
          a: a![0],
          b: b![0],
          distance: Math.hypot(a![1].x - b![1].x, a![1].y - b![1].y),
        };
        this.cancelDrag();
        return;
      }
      const { kind } = this.pick(e.clientX, e.clientY);
      this.press(kind);
      this.drag = {
        kind,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: 0,
        door: this.deck.door.angle,
      };
      c.setPointerCapture(e.pointerId);
      c.classList.add('is-grabbing');
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId))
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) {
        const a = this.pointers.get(this.pinch.a);
        const b = this.pointers.get(this.pinch.b);
        if (a && b) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 0) this.rig.dolly(this.pinch.distance / d);
          this.pinch.distance = d;
        }
        return;
      }
      const drag = this.drag;
      if (!drag || drag.id !== e.pointerId) {
        this.hover(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      switch (drag.kind) {
        case 'levelKnob':
          this.hooks.setLevel(this.hooks.level() + (dx - dy) * 0.004);
          break;
        case 'door':
          if (drag.moved > 6 && this.deck.transport.mode === 'stop') {
            drag.door = Math.max(0, Math.min(W.openDeg, drag.door + dy * 0.25));
            this.deck.door.grab(drag.door);
          }
          break;
        case 'cassette':
          // A pencil in the hub: winding by hand, only with the cassette out.
          if (!this.deck.inDeck) this.deck.handWind(dx * 0.004);
          break;
        default:
          if (!drag.kind.startsWith('key:')) this.rig.orbit(dx, dy);
          break;
      }
    });
    const end = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) {
        this.pinch = null;
        return;
      }
      const drag = this.drag;
      if (!drag || drag.id !== e.pointerId) return;
      this.drag = null;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      c.classList.remove('is-grabbing');
      const click = drag.moved < 6;
      this.release(drag.kind);
      if (drag.kind === 'door') {
        if (click) this.deck.eject();
        else {
          const wasOpen = this.deck.door.angle > 0;
          this.deck.door.release();
          if (wasOpen && this.deck.door.target === 0)
            this.deck.events.emit('mechanism', 'door-close');
        }
      }
      if (drag.kind === 'cassette' && click) {
        if (this.deck.inDeck) this.deck.toggleCassette();
        else if (!this.deck.door.closed) this.deck.toggleCassette();
        else this.deck.eject();
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.rig.skipIntro();
        this.rig.dolly(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    c.addEventListener('dblclick', (e) => {
      const kind = this.pick(e.clientX, e.clientY).kind;
      if (kind === 'cassette' && !this.deck.inDeck) {
        this.deck.flip();
        return;
      }
      if (kind !== 'none') return;
      this.rig.goTo(this.rig.home);
    });
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.release(this.drag.kind);
    this.drag = null;
  }

  /** The cursor shows what a press would do. */
  private hover(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerY = ((clientY - rect.top) / rect.height) * 2 - 1;
    const { kind } = this.pick(clientX, clientY);
    this.canvas.dataset.hover = kind;
  }
}
