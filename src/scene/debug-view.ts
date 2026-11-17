import { Vector3 } from 'three';
import { tapeGeometry } from '../core/tape';
import { DECK_SPEC, type KeyName, type TapeName } from '../spec/deck';
import { poseDeck, type DeckPose } from './deck/pose';
import type { LightingPreset } from './lighting';
import { CassetteLabel } from './materials/cassette-label';
import type { FinishName } from './materials/deck-materials';
import { World, type CameraStop } from './world';
import type { MeshStandardMaterial } from 'three';

/**
 * `?view=…`: the 3D scene alone, without the player around it, for screenshots and the camera
 * reviews. Views: hero, control, mobile, front, top, tour0–tour3. Options: macro (a camera stop as
 * JSON), finish, light, door (degrees), out (cassette on the credenza), side (B), tape (C46…C120),
 * at (0..1 along the tape), keys (comma list held down), counter, vu (0..1), off (power off),
 * reverse (head turned), animate.
 */
export function run(view: string): void {
  const params = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
  document.body.replaceChildren(canvas);
  document.body.style.margin = '0';
  const world = new World(canvas);
  const { deck } = world;

  world.setFinish((params.get('finish') ?? 'silver') as FinishName);
  world.setLighting((params.get('light') ?? 'dusk') as LightingPreset);
  const geometry = tapeGeometry((params.get('tape') ?? 'C60') as TapeName);
  const share = Number(params.get('at') ?? 0.3);
  const vu = Number(params.get('vu') ?? 0.62);
  const keys = (params.get('keys') ?? 'play').split(',').filter(Boolean) as KeyName[];
  const pose: DeckPose = {
    doorDeg: Number(params.get('door') ?? 0),
    keys: Object.fromEntries(keys.map((k) => [k, k === 'play' || k === 'pause' ? 0.65 : 1])),
    geometry,
    x: geometry.total * share,
    faceUp: params.get('side') === 'B' ? 1 : 0,
    flipping: 0,
    inDeck: !params.has('out'),
    counter: Number(params.get('counter') ?? 274.3),
    needles: [vu, vu * 0.92],
    switches: { tapeType: 1, nr: 1, reverse: 1 },
    level: 0.75,
    powered: !params.has('off'),
    forward: !params.has('reverse'),
    reverse: params.has('reverse'),
    head: params.has('reverse') ? 1 : 0,
  };
  poseDeck(deck, pose);
  const m = world.materials;
  m.meterFace.emissiveIntensity = pose.powered ? 0.22 : 0;
  m.lampGlow.opacity = pose.powered ? 0.16 : 0;
  m.ledGreen.emissiveIntensity = pose.powered ? 2.4 : 0;
  m.ledRed.emissiveIntensity = pose.powered ? 2.2 : 0;
  deck.leds.forward.material = pose.forward ? m.ledGreen : m.recess;
  deck.leds.reverse.material = pose.reverse ? m.ledGreen : m.recess;
  // Sample labels: a mixtape, both sides written in.
  const labels = [new CassetteLabel(), new CassetteLabel()];
  const sides = [
    ['Night Drive', 'Coastline', 'Static Bloom', 'Paper Moons', 'Low Tide'],
    ['Morning Bus', 'Glass Garden', 'Satellite Hum', 'Velvet Static'],
  ];
  labels.forEach((label, i) => {
    label.paint({
      side: i === 0 ? 'A' : 'B',
      heading: 'Summer mix · 1986',
      tracks: sides[i]!,
      tape: geometry.name,
      type: 'TYPE II · HIGH (CrO₂)',
      nr: 'NR B',
      colour: '#d8452b',
      ink: '#1a1208',
      cover: null,
      coverVersion: 0,
    });
    const material = deck.labels[i]!.material as MeshStandardMaterial;
    material.map = label.texture;
    material.needsUpdate = true;
  });
  world.markShadowsDirty();

  const stops: Record<string, CameraStop> = {
    hero: DECK_SPEC.camera.hero,
    control: DECK_SPEC.camera.control,
    mobile: DECK_SPEC.camera.mobile,
    front: { focal: 70, position: [0, 0.065, 1.05], target: [0, 0.065, 0] },
    top: { focal: 300, position: [0, 4.2, 0.0001], target: [0, 0, 0] },
    ...Object.fromEntries(DECK_SPEC.camera.tour.map((t, i) => [`tour${i}`, t])),
  };
  const resize = (): void => {
    world.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio));
    world.setCamera(
      params.has('macro')
        ? (JSON.parse(params.get('macro') ?? '') as CameraStop)
        : (stops[view] ?? DECK_SPEC.camera.hero),
    );
  };
  resize();
  world.warmUp();
  world.render(0);
  addEventListener('resize', () => {
    resize();
    world.render(0);
  });

  // `animate`: the tape plays and every frame is rendered, for frame-time checks.
  const frames: number[] = [];
  if (params.has('animate')) {
    let last = performance.now();
    const tick = (now: number): void => {
      frames.push(now - last);
      if (frames.length > 2000) frames.shift();
      pose.x = Math.min(
        geometry.total,
        pose.x + ((now - last) / 1000) * DECK_SPEC.transport.speed * 20,
      );
      pose.needles = [0.5 + 0.2 * Math.sin(now / 170), 0.5 + 0.2 * Math.sin(now / 130)];
      poseDeck(deck, pose);
      last = now;
      world.render(now / 1000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const api = {
    world,
    ready: true,
    stats: () => world.stats(),
    frames,
    render: (time = 0) => world.render(time),
    /** A named part's centre in canvas pixels. */
    project: (name: string) => {
      const o = deck.root.getObjectByName(name);
      if (!o) throw new Error(`no part ${name}`);
      return world.project(o.getWorldPosition(new Vector3()));
    },
  };
  Object.assign(window, { __world: api });
}
