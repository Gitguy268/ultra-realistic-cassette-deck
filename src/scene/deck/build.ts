import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Object3D,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK_SPEC, type KeyName } from '../../spec/deck';
import type { DeckMaterials } from '../materials/deck-materials';
import { FACE_BOTTOM, FACE_HEIGHT } from '../materials/printing';
import { LABEL_WINDOW } from '../materials/cassette-label';

/**
 * The deck and its cassette as meshes, every size from DECK_SPEC. Moving parts are named groups
 * whose transform the stage sets each frame (scene/deck/pose.ts); the stage picks by these names.
 */

const C = DECK_SPEC.chassis;
const F = DECK_SPEC.face;
const W = DECK_SPEC.well;
const K = DECK_SPEC.keys;
const PW = DECK_SPEC.power;
const MT = DECK_SPEC.meters;
const CT = DECK_SPEC.counter;
const SW = DECK_SPEC.switches;
const LV = DECK_SPEC.levelKnob;
const LED = DECK_SPEC.leds;
const CS = DECK_SPEC.cassette;
const mm = (v: number): number => v / 1000;

/** The face plate's front plane. */
export const FACE_Z = C.depth / 2 + F.thickness;
/** How deep the cassette well goes behind the face plate. */
const WELL_DEPTH = mm(44);
/** The window between the reels, in cassette coordinates (centre). */
export const CASSETTE_WINDOW_Y =
  CS.height *
  (0.5 - (LABEL_WINDOW.y + LABEL_WINDOW.h / 2) / ((LABEL_WINDOW.w / CS.windowWidth) * CS.height));
/** Hubs sit on the window's centre line. */
export const HUB_Y = CASSETTE_WINDOW_Y;
/** The meter needles' pivot, below the window (canvas pivot at 1.12 × height from the top). */
export const NEEDLE_PIVOT_Y = MT.centreY + MT.height / 2 - 1.12 * MT.height;
export const NEEDLE_LENGTH = 0.97 * MT.height;
const SWITCH_NAMES = ['tapeType', 'nr', 'reverse'] as const;
export type SwitchName = (typeof SWITCH_NAMES)[number];

export interface DeckParts {
  root: Group;
  door: Group;
  /** The cassette; reparented between the door's holder and the credenza. */
  cassette: Group;
  /** Turns the cassette over (side B out). */
  cassetteFlip: Group;
  reels: [Group, Group];
  packs: [Mesh, Mesh];
  labels: [Mesh, Mesh];
  keys: Record<KeyName, Group>;
  needles: [Group, Group];
  counterWheels: [Mesh, Mesh, Mesh];
  counterReset: Mesh;
  switches: Record<SwitchName, Mesh>;
  levelKnob: Group;
  power: Mesh;
  leds: { reverse: Mesh; forward: Mesh; power: Mesh };
  headBlock: Group;
  lampGlow: Mesh;
  /** Where the cassette rests when it is out: on the credenza, right of the deck. */
  tableSpot: Object3D;
  /** Where it sits in the door's holder. */
  holderSpot: Object3D;
}

function rounded(
  shape: Shape | Path,
  w: number,
  h: number,
  r: number,
  cx: number,
  cy: number,
): void {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  shape.moveTo(x0 + rr, y0);
  shape.lineTo(x0 + w - rr, y0);
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
  shape.lineTo(x0 + w, y0 + h - rr);
  shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
  shape.lineTo(x0 + rr, y0 + h);
  shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
  shape.lineTo(x0, y0 + rr);
  shape.quadraticCurveTo(x0, y0, x0 + rr, y0);
}

function hole(shape: Shape, w: number, h: number, r: number, cx: number, cy: number): void {
  const p = new Path();
  rounded(p, w, h, r, cx, cy);
  shape.holes.push(p);
}

function circleHole(shape: Shape, radius: number, cx: number, cy: number): void {
  const p = new Path();
  p.absarc(cx, cy, radius, 0, Math.PI * 2, true);
  shape.holes.push(p);
}

function mesh(geometry: BufferGeometry, material: Material | Material[], name = ''): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const keyPitch = K.width + K.gap;
const firstKeyX = W.centreX - (keyPitch * (K.order.length - 1)) / 2;
export const keyX = (i: number): number => firstKeyX + i * keyPitch;
const keyRowWidth = keyPitch * K.order.length - K.gap;
const switchX: Record<SwitchName, number> = {
  tapeType: SW.tapeTypeX,
  nr: SW.nrX,
  reverse: SW.reverseX,
};
const COUNTER_WHEEL_PITCH = mm(6.2);

export function buildDeck(m: DeckMaterials): DeckParts {
  const root = new Group();
  root.name = 'deck';
  const front = C.depth / 2;

  // ─── Cabinet ─────────────────────────────────────────────────────
  const bodyDepth = C.depth - WELL_DEPTH;
  const body = mesh(
    new RoundedBoxGeometry(C.width, C.height - C.footHeight, bodyDepth, 3, C.edgeRadius),
    m.wrap,
    'cabinet',
  );
  body.position.set(0, C.footHeight + (C.height - C.footHeight) / 2, -C.depth / 2 + bodyDepth / 2);
  root.add(body);
  // The front part of the cabinet: a frame round the well, its front face dark (behind the openings).
  const frameShape = new Shape();
  rounded(
    frameShape,
    C.width,
    C.height - C.footHeight,
    C.edgeRadius,
    0,
    FACE_BOTTOM + FACE_HEIGHT / 2,
  );
  hole(frameShape, W.doorWidth + mm(2), W.doorHeight + mm(2), mm(2), W.centreX, W.centreY);
  // Openings for the meters and the counter, which sit deeper than the face plate.
  hole(frameShape, MT.width, MT.height, mm(2), MT.centreX, MT.centreY);
  hole(frameShape, CT.windowWidth, CT.windowHeight, mm(1), CT.x, CT.y);
  const frame = mesh(
    new ExtrudeGeometry(frameShape, { depth: WELL_DEPTH, bevelEnabled: false, curveSegments: 6 }),
    [m.recess, m.wrap],
    'cabinetFront',
  );
  frame.position.z = front - WELL_DEPTH;
  root.add(frame);
  // Dark surfaces that never move, behind every opening: one mesh, one draw call.
  const recesses: BufferGeometry[] = [];
  const recessBox = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    recesses.push(new BoxGeometry(w, h, d).translate(x, y, z));
  };
  // The well: an open box behind the door.
  const ww = W.doorWidth + mm(2);
  const wh = W.doorHeight + mm(2);
  const wall = (
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    ry: number,
    rx: number,
  ): void => {
    recesses.push(new PlaneGeometry(w, h).rotateX(rx).rotateY(ry).translate(x, y, z));
  };
  const wz = front - WELL_DEPTH / 2;
  wall(ww, wh, W.centreX, W.centreY, front - WELL_DEPTH + 0.0002, 0, 0);
  wall(WELL_DEPTH, wh, W.centreX - ww / 2 + 0.0002, W.centreY, wz, Math.PI / 2, 0);
  wall(WELL_DEPTH, wh, W.centreX + ww / 2 - 0.0002, W.centreY, wz, -Math.PI / 2, 0);
  wall(ww, WELL_DEPTH, W.centreX, W.centreY + wh / 2 - 0.0002, wz, 0, Math.PI / 2);
  wall(ww, WELL_DEPTH, W.centreX, W.centreY - wh / 2 + 0.0002, wz, 0, -Math.PI / 2);

  // Feet.
  const feet: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new CylinderGeometry(
        C.footDiameter / 2,
        C.footDiameter / 2 - mm(2),
        C.footHeight,
        32,
      );
      g.translate(
        sx * (C.width / 2 - C.footInsetX),
        C.footHeight / 2,
        sz * (C.depth / 2 - C.footInsetZ),
      );
      feet.push(g);
    }
  }
  root.add(mesh(mergeGeometries(feet), m.rubber, 'feet'));

  // Ventilation slots in the top, over the transport.
  const vents: BufferGeometry[] = [];
  for (let i = 0; i < C.ventSlots; i++) {
    const g = new BoxGeometry(mm(3), mm(0.6), mm(70));
    g.translate(W.centreX - mm(60) + i * mm(6), C.height + mm(0.05), -mm(30));
    vents.push(g);
  }
  root.add(mesh(mergeGeometries(vents), m.recess, 'vents'));

  // ─── Face plate ──────────────────────────────────────────────────
  const faceShape = new Shape();
  rounded(faceShape, C.width - 2 * F.inset, FACE_HEIGHT, mm(2), 0, FACE_BOTTOM + FACE_HEIGHT / 2);
  hole(faceShape, W.doorWidth + mm(1.2), W.doorHeight + mm(1.2), mm(2.5), W.centreX, W.centreY);
  hole(faceShape, keyRowWidth + mm(3), K.height + mm(2.5), mm(1.5), W.centreX, K.centreY);
  hole(faceShape, PW.width + mm(1.5), PW.height + mm(1.5), mm(1.2), PW.x, PW.y);
  circleHole(faceShape, PW.jackDiameter / 2 + mm(2.2), PW.jackX, PW.jackY);
  hole(faceShape, MT.width, MT.height, mm(2), MT.centreX, MT.centreY);
  hole(faceShape, CT.windowWidth, CT.windowHeight, mm(1), CT.x, CT.y);
  circleHole(faceShape, mm(3.2), CT.resetX, CT.y);
  for (const name of SWITCH_NAMES) {
    hole(faceShape, 2 * SW.travel + SW.knobWidth + mm(1.5), mm(3.6), mm(1.2), switchX[name], SW.y);
  }
  for (const [x, y] of [
    [LED.reverseX, LED.y],
    [LED.forwardX, LED.y],
    [PW.x, LED.powerY],
  ] as const) {
    circleHole(faceShape, LED.diameter / 2 + mm(0.4), x, y);
  }
  const faceGeometry = new ExtrudeGeometry(faceShape, {
    depth: F.thickness - F.bevel,
    bevelEnabled: true,
    bevelThickness: F.bevel,
    bevelSize: F.bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 10,
  });
  const face = mesh(faceGeometry, [m.face, m.bevel], 'face');
  face.position.z = front;
  root.add(face);
  // The silkscreen, a hair in front of the face.
  const silk = mesh(new PlaneGeometry(C.width, FACE_HEIGHT), m.silkscreen, 'silkscreen');
  silk.position.set(0, FACE_BOTTOM + FACE_HEIGHT / 2, FACE_Z + mm(0.05));
  silk.castShadow = false;
  root.add(silk);

  // ─── Door, holder and cassette ───────────────────────────────────
  const door = new Group();
  door.name = 'door';
  door.position.set(W.centreX, W.centreY - W.doorHeight / 2, FACE_Z);
  const doorShape = new Shape();
  rounded(doorShape, W.doorWidth, W.doorHeight, mm(2.2), 0, W.doorHeight / 2);
  hole(doorShape, W.windowWidth, W.windowHeight, mm(3), 0, W.doorHeight / 2 + W.windowOffsetY);
  const doorPanel = mesh(
    new ExtrudeGeometry(doorShape, {
      depth: mm(2.4),
      bevelEnabled: true,
      bevelThickness: mm(0.6),
      bevelSize: mm(0.5),
      bevelSegments: 2,
      curveSegments: 8,
    }),
    [m.face, m.bevel],
    'doorPanel',
  );
  doorPanel.position.z = -mm(3.6);
  door.add(doorPanel);
  const smoked = mesh(
    new BoxGeometry(W.windowWidth + mm(4), W.windowHeight + mm(4), mm(2)),
    m.smoked,
    'doorWindow',
  );
  smoked.position.set(0, W.doorHeight / 2 + W.windowOffsetY, -mm(4.6));
  smoked.castShadow = false;
  door.add(smoked);
  // The holder: two rails and a lip the cassette stands in.
  const holder: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const g = new BoxGeometry(mm(3), CS.height * 0.7, CS.thickness + mm(3));
    g.translate(sx * (CS.width / 2 + mm(1.5)), W.doorHeight / 2 - mm(4), -W.cassetteDepth);
    holder.push(g);
  }
  const lip = new BoxGeometry(CS.width + mm(6), mm(3), CS.thickness + mm(3));
  lip.translate(0, W.doorHeight / 2 - CS.height / 2 - mm(2.5), -W.cassetteDepth);
  holder.push(lip);
  door.add(mesh(mergeGeometries(holder), m.plastic, 'holder'));
  const holderSpot = new Object3D();
  holderSpot.name = 'holderSpot';
  holderSpot.position.set(0, W.doorHeight / 2 - mm(1), -W.cassetteDepth);
  door.add(holderSpot);
  root.add(door);

  const cassette = buildCassette(m);
  holderSpot.add(cassette.group);

  const tableSpot = new Object3D();
  tableSpot.name = 'tableSpot';
  tableSpot.position.set(C.width / 2 + mm(95), CS.thickness / 2 + mm(0.2), C.depth / 2 - mm(40));
  tableSpot.rotation.set(-Math.PI / 2, 0, -0.32);
  root.add(tableSpot);

  // The head block, visible in the well when the door is open: turns half a turn for reverse.
  const headBlock = new Group();
  headBlock.name = 'headBlock';
  headBlock.position.set(W.centreX, W.centreY - CS.height / 2 + mm(2), front - WELL_DEPTH + mm(16));
  const blockPlastic: BufferGeometry[] = [
    new BoxGeometry(mm(70), mm(5), mm(14)).translate(0, -mm(5), 0),
    new BoxGeometry(mm(0.4), mm(9.2), mm(0.4)).translate(0, mm(1), mm(6.1)),
  ];
  const blockSteel: BufferGeometry[] = [];
  const blockRubber: BufferGeometry[] = [];
  const head = mesh(new RoundedBoxGeometry(mm(11), mm(9), mm(8), 2, mm(2)), m.chrome, 'head');
  head.position.set(0, mm(1), mm(2));
  headBlock.add(head);
  for (const sx of [-1, 1]) {
    blockSteel.push(
      new CylinderGeometry(mm(1.2), mm(1.2), mm(14), 16).translate(sx * mm(26), mm(2), mm(3)),
    );
    blockRubber.push(
      new CylinderGeometry(mm(5), mm(5), mm(8), 24).translate(sx * mm(26), mm(2), -mm(4)),
    );
    blockPlastic.push(
      new CylinderGeometry(mm(2), mm(2), mm(6), 12).translate(sx * mm(12), mm(1), mm(3)),
    );
  }
  headBlock.add(
    mesh(mergeGeometries(blockPlastic), m.plastic, 'headPlate'),
    mesh(mergeGeometries(blockSteel), m.steel, 'capstans'),
    mesh(mergeGeometries(blockRubber), m.rubber, 'rollers'),
  );
  root.add(headBlock);

  // ─── Keys ────────────────────────────────────────────────────────
  const keys = {} as Record<KeyName, Group>;
  const legendCells = K.order.length;
  K.order.forEach((name, i) => {
    const key = new Group();
    key.name = `key:${name}`;
    key.position.set(keyX(i), K.centreY, FACE_Z + mm(4) - K.depth / 2);
    const cap = mesh(new RoundedBoxGeometry(K.width, K.height, K.depth, 2, mm(1.2)), m.key);
    key.add(cap);
    const legend = new PlaneGeometry(K.width * 0.92, K.height * 0.92);
    const uv = legend.getAttribute('uv');
    for (let v = 0; v < uv.count; v++) uv.setX(v, (i + uv.getX(v)) / legendCells);
    const legendMesh = mesh(legend, m.keyLegend);
    legendMesh.position.z = K.depth / 2 + mm(0.03);
    legendMesh.castShadow = false;
    key.add(legendMesh);
    if (name === 'rec') {
      const dot = mesh(new CylinderGeometry(mm(1.5), mm(1.5), mm(0.2), 20), m.ledRed);
      dot.rotation.x = Math.PI / 2;
      dot.position.set(0, 0, K.depth / 2 + mm(0.1));
      key.add(dot);
    }
    root.add(key);
    keys[name] = key;
  });
  // The slot behind the keys.
  recessBox(keyRowWidth + mm(3), K.height + mm(2.5), mm(2), W.centreX, K.centreY, front - mm(1));

  // ─── Power, phones, LEDs ─────────────────────────────────────────
  const power = mesh(new RoundedBoxGeometry(PW.width, PW.height, mm(12), 2, mm(1)), m.key, 'power');
  power.position.set(PW.x, PW.y, FACE_Z + mm(2) - mm(6));
  root.add(power);
  const jackRing = mesh(
    new TorusGeometry(PW.jackDiameter / 2 + mm(1.2), mm(0.9), 12, 32),
    m.chrome,
    'jack',
  );
  jackRing.position.set(PW.jackX, PW.jackY, FACE_Z + mm(0.3));
  root.add(jackRing);
  recesses.push(
    new CylinderGeometry(PW.jackDiameter / 2, PW.jackDiameter / 2, mm(4), 24)
      .rotateX(Math.PI / 2)
      .translate(PW.jackX, PW.jackY, FACE_Z - mm(1.5)),
  );
  const ledMesh = (material: Material, x: number, y: number, name: string): Mesh => {
    const g = new SphereGeometry(LED.diameter / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    const l = mesh(g, material, name);
    l.position.set(x, y, FACE_Z - mm(0.6));
    l.castShadow = false;
    root.add(l);
    return l;
  };
  const leds = {
    reverse: ledMesh(m.ledGreen, LED.reverseX, LED.y, 'led:reverse'),
    forward: ledMesh(m.ledGreen, LED.forwardX, LED.y, 'led:forward'),
    power: ledMesh(m.ledRed, PW.x, LED.powerY, 'led:power'),
  };

  // ─── Meters ──────────────────────────────────────────────────────
  const meterGroup = new Group();
  meterGroup.name = 'meters';
  const meterFace = mesh(new PlaneGeometry(MT.width, MT.height), m.meterFace, 'meterFace');
  meterFace.position.set(MT.centreX, MT.centreY, FACE_Z - mm(9));
  meterFace.castShadow = false;
  meterGroup.add(meterFace);
  const bezel: BufferGeometry[] = [];
  for (const [w, h, x, y] of [
    [MT.width, mm(0.4), MT.centreX, MT.centreY + MT.height / 2],
    [MT.width, mm(0.4), MT.centreX, MT.centreY - MT.height / 2],
    [mm(0.4), MT.height, MT.centreX - MT.width / 2, MT.centreY],
    [mm(0.4), MT.height, MT.centreX + MT.width / 2, MT.centreY],
  ] as const) {
    const g = new BoxGeometry(w, h, mm(9));
    g.translate(x, y, FACE_Z - mm(4.5));
    bezel.push(g);
  }
  meterGroup.add(mesh(mergeGeometries(bezel), m.plastic, 'meterBezel'));
  const lampGlow = mesh(new PlaneGeometry(MT.width, MT.height), m.lampGlow, 'lampGlow');
  lampGlow.position.set(MT.centreX, MT.centreY, FACE_Z - mm(8.9));
  lampGlow.castShadow = false;
  meterGroup.add(lampGlow);
  const needles = [0, 1].map((i) => {
    const needle = new Group();
    needle.name = `needle:${i}`;
    needle.position.set(
      MT.centreX + (i === 0 ? -1 : 1) * (MT.width / 4),
      NEEDLE_PIVOT_Y,
      FACE_Z - mm(8),
    );
    const shaft = new BoxGeometry(mm(0.45), NEEDLE_LENGTH, mm(0.3));
    shaft.translate(0, NEEDLE_LENGTH / 2, 0);
    const n = mesh(shaft, m.needle);
    n.castShadow = false;
    needle.add(n);
    meterGroup.add(needle);
    return needle;
  }) as [Group, Group];
  const glasses: BufferGeometry[] = [
    new PlaneGeometry(MT.width, MT.height).translate(MT.centreX, MT.centreY, FACE_Z - mm(1.2)),
  ];
  root.add(meterGroup);

  // ─── Counter ─────────────────────────────────────────────────────
  recessBox(CT.windowWidth, CT.windowHeight, mm(1), CT.x, CT.y, FACE_Z - mm(9));
  const wheels = [0, 1, 2].map((i) => {
    const g = new CylinderGeometry(
      CT.wheelDiameter / 2,
      CT.wheelDiameter / 2,
      CT.wheelWidth,
      40,
      1,
      true,
    );
    g.rotateZ(-Math.PI / 2);
    const w = mesh(g, m.counterWheel, `counterWheel:${i}`);
    w.position.set(
      CT.x + (i - 1) * COUNTER_WHEEL_PITCH,
      CT.y,
      FACE_Z - mm(2) - CT.wheelDiameter / 2,
    );
    w.castShadow = false;
    root.add(w);
    return w;
  }) as [Mesh, Mesh, Mesh];
  glasses.push(
    new PlaneGeometry(CT.windowWidth, CT.windowHeight).translate(CT.x, CT.y, FACE_Z - mm(1)),
  );
  const reset = mesh(new CylinderGeometry(mm(2.6), mm(2.6), mm(6), 24), m.plastic, 'counterReset');
  reset.rotation.x = Math.PI / 2;
  reset.position.set(CT.resetX, CT.y, FACE_Z - mm(1.5));
  root.add(reset);

  // ─── Switches ────────────────────────────────────────────────────
  const switches = {} as Record<SwitchName, Mesh>;
  for (const name of SWITCH_NAMES) {
    recessBox(
      2 * SW.travel + SW.knobWidth + mm(1.5),
      mm(3.6),
      mm(1),
      switchX[name],
      SW.y,
      FACE_Z - mm(5),
    );
    const knob = mesh(
      new RoundedBoxGeometry(SW.knobWidth, SW.knobHeight, mm(9), 2, mm(0.8)),
      m.key,
      `switch:${name}`,
    );
    knob.position.set(switchX[name], SW.y, FACE_Z + mm(3) - mm(4.5));
    knob.userData.baseX = switchX[name];
    root.add(knob);
    switches[name] = knob;
  }

  const glass = mesh(mergeGeometries(glasses), m.glass, 'glass');
  glass.castShadow = false;
  root.add(glass, mesh(mergeGeometries(recesses), m.recess, 'recesses'));

  // ─── Level knob ──────────────────────────────────────────────────
  const levelKnob = new Group();
  levelKnob.name = 'levelKnob';
  levelKnob.position.set(LV.x, LV.y, FACE_Z);
  const knurled = new CylinderGeometry(
    LV.diameter / 2,
    LV.diameter / 2,
    LV.depth,
    LV.knurls * 2,
    1,
  );
  // Knurls: every other vertex round the rim stands a little proud.
  const pos = knurled.getAttribute('position');
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const z = pos.getZ(v);
    const r = Math.hypot(x, z);
    if (r < LV.diameter / 2 - mm(0.01)) continue;
    const angle = Math.atan2(z, x);
    const k = 1 + 0.025 * Math.sign(Math.cos(angle * LV.knurls));
    pos.setXYZ(v, x * k, pos.getY(v), z * k);
  }
  knurled.computeVertexNormals();
  knurled.rotateX(Math.PI / 2);
  knurled.translate(0, 0, LV.depth / 2);
  levelKnob.add(mesh(knurled, m.key, 'knobBody'));
  const cap = mesh(
    new CylinderGeometry(LV.diameter / 2 - mm(2), LV.diameter / 2 - mm(2), mm(0.6), 48),
    m.bevel,
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = LV.depth + mm(0.1);
  levelKnob.add(cap);
  const pointer = mesh(new BoxGeometry(mm(1), mm(6), mm(0.4)), m.recess);
  pointer.position.set(0, LV.diameter / 2 - mm(5), LV.depth + mm(0.5));
  levelKnob.add(pointer);
  root.add(levelKnob);

  return {
    root,
    door,
    cassette: cassette.group,
    cassetteFlip: cassette.flip,
    reels: cassette.reels,
    packs: cassette.packs,
    labels: cassette.labels,
    keys,
    needles,
    counterWheels: wheels,
    counterReset: reset,
    switches,
    levelKnob,
    power,
    leds,
    headBlock,
    lampGlow,
    tableSpot,
    holderSpot,
  };
}

/** The Compact Cassette: shell, window, packs, hubs and labels. Local origin at its centre. */
function buildCassette(m: DeckMaterials): {
  group: Group;
  flip: Group;
  reels: [Group, Group];
  packs: [Mesh, Mesh];
  labels: [Mesh, Mesh];
} {
  const group = new Group();
  group.name = 'cassette';
  const flip = new Group();
  flip.name = 'cassetteFlip';
  group.add(flip);
  const shape = new Shape();
  rounded(shape, CS.width, CS.height, mm(2.5), 0, 0);
  hole(shape, CS.windowWidth, CS.windowHeight, mm(2), 0, CASSETTE_WINDOW_Y);
  const shellGeometry = new ExtrudeGeometry(shape, {
    depth: CS.thickness - mm(1),
    bevelEnabled: true,
    bevelThickness: mm(0.5),
    bevelSize: mm(0.4),
    bevelSegments: 2,
    curveSegments: 8,
  });
  shellGeometry.translate(0, 0, -(CS.thickness - mm(1)) / 2);
  flip.add(mesh(shellGeometry, m.shell, 'shell'));
  // The trapezoid at the bottom edge where the head goes in.
  const bump = new Shape();
  bump.moveTo(-mm(36), -CS.height / 2);
  bump.lineTo(mm(36), -CS.height / 2);
  bump.lineTo(mm(32), -CS.height / 2 + mm(9));
  bump.lineTo(-mm(32), -CS.height / 2 + mm(9));
  bump.closePath();
  const bumpGeometry = new ExtrudeGeometry(bump, { depth: mm(0.6), bevelEnabled: false });
  for (const z of [CS.thickness / 2, -CS.thickness / 2 - mm(0.6)]) {
    const b = mesh(bumpGeometry, m.shell);
    b.position.z = z;
    flip.add(b);
  }
  // The tape running along the bottom between the guides.
  const strip = mesh(new BoxGeometry(mm(66), mm(0.25), CS.tapeWidth), m.tape, 'tapeStrip');
  strip.position.set(0, -CS.height / 2 + mm(1.2), 0);
  flip.add(strip);
  // Window glazing, both faces.
  for (const z of [1, -1]) {
    const g = mesh(new PlaneGeometry(CS.windowWidth, CS.windowHeight), m.shellWindow);
    g.position.set(0, CASSETTE_WINDOW_Y, z * (CS.thickness / 2 - mm(0.8)));
    if (z < 0) g.rotation.y = Math.PI;
    g.castShadow = false;
    flip.add(g);
  }
  // Packs and hubs.
  const packs: Mesh[] = [];
  const reels: Group[] = [];
  for (const sx of [-1, 1]) {
    const pack = new CylinderGeometry(1, 1, CS.tapeWidth, 72);
    pack.rotateX(Math.PI / 2);
    const p = mesh(pack, m.tape, sx < 0 ? 'packL' : 'packR');
    p.position.set((sx * CS.hubSpacing) / 2, HUB_Y, 0);
    flip.add(p);
    packs.push(p);
    const reel = new Group();
    reel.name = sx < 0 ? 'reelL' : 'reelR';
    reel.position.set((sx * CS.hubSpacing) / 2, HUB_Y, 0);
    const hubShape = new Shape();
    hubShape.absarc(0, 0, CS.hubRadius, 0, Math.PI * 2, false);
    const inner = new Path();
    // Six teeth inside the hub, which the spindle drives.
    const teeth = 6;
    for (let i = 0; i <= teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 === 0 || i % 4 === 1 ? mm(5.1) : mm(6.6);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) inner.moveTo(x, y);
      else inner.lineTo(x, y);
    }
    hubShape.holes.push(inner);
    const hubGeometry = new ExtrudeGeometry(hubShape, {
      depth: CS.tapeWidth + mm(1.6),
      bevelEnabled: false,
      curveSegments: 24,
    });
    hubGeometry.translate(0, 0, -(CS.tapeWidth + mm(1.6)) / 2);
    reel.add(mesh(hubGeometry, m.hub, 'hub'));
    // A clamp in the hub's rim, so its turning shows.
    const clamp = mesh(new BoxGeometry(mm(4), mm(1.6), CS.tapeWidth + mm(1.7)), m.shell);
    clamp.position.set(0, CS.hubRadius - mm(0.6), 0);
    reel.add(clamp);
    flip.add(reel);
    reels.push(reel);
  }
  // Five screws in each face.
  const screws: BufferGeometry[] = [];
  for (const [x, y] of [
    [-CS.width / 2 + mm(5), CS.height / 2 - mm(5)],
    [CS.width / 2 - mm(5), CS.height / 2 - mm(5)],
    [-CS.width / 2 + mm(5), -CS.height / 2 + mm(5)],
    [CS.width / 2 - mm(5), -CS.height / 2 + mm(5)],
    [0, -CS.height / 2 + mm(6)],
  ] as const) {
    for (const z of [1, -1]) {
      const g = new CylinderGeometry(mm(1.6), mm(1.6), mm(0.4), 16);
      g.rotateX(Math.PI / 2);
      g.translate(x, y, z * (CS.thickness / 2 + mm(0.25)));
      screws.push(g);
    }
  }
  flip.add(mesh(mergeGeometries(screws), m.screw, 'screws'));
  // Labels, side A on the front, side B on the back.
  const labels = [0, 1].map((i) => {
    const material = m.label.clone();
    // A cutout, not a blend: transparent materials are left out of the transmission pass, and
    // the label must show through the door's smoked window.
    material.alphaTest = 0.5;
    const l = mesh(
      new PlaneGeometry(CS.width, CS.height),
      material,
      `label:${i === 0 ? 'A' : 'B'}`,
    );
    l.position.z = (i === 0 ? 1 : -1) * (CS.thickness / 2 + mm(0.06));
    if (i === 1) l.rotation.y = Math.PI;
    l.castShadow = false;
    flip.add(l);
    return l;
  }) as [Mesh, Mesh];
  return { group, flip, reels: reels as [Group, Group], packs: packs as [Mesh, Mesh], labels };
}
