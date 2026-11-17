import {
  AdditiveBlending,
  Color,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
  type Texture,
} from 'three';
import { DECK_SPEC } from '../../spec/deck';
import type { Surfaces } from './surfaces';

/** Every material on the deck and the cassette. The keys are what scene/deck/build.ts assigns. */
export interface DeckMaterials {
  /** The brushed aluminium face plate, strokes running left to right. */
  face: MeshPhysicalMaterial;
  /** Polished chamfer round the face and the openings. */
  bevel: MeshPhysicalMaterial;
  /** Painted steel wrap over the top and sides. */
  wrap: MeshPhysicalMaterial;
  /** Piano keys: brushed caps. */
  key: MeshPhysicalMaterial;
  /** The dark recesses behind openings. */
  recess: MeshStandardMaterial;
  /** Matte black plastic: switch slots, meter bezel, counter window, cassette holder. */
  plastic: MeshStandardMaterial;
  /** The door's smoked window. */
  smoked: MeshPhysicalMaterial;
  /** Meter and counter glass: clear, a little reflective. */
  glass: MeshPhysicalMaterial;
  meterFace: MeshStandardMaterial;
  needle: MeshStandardMaterial;
  counterWheel: MeshStandardMaterial;
  silkscreen: MeshStandardMaterial;
  keyLegend: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  chrome: MeshStandardMaterial;
  /** LEDs: emissive, switched by the stage. */
  ledGreen: MeshStandardMaterial;
  ledAmber: MeshStandardMaterial;
  ledRed: MeshStandardMaterial;
  /** The meters' warm lamp, spilling over their faces. */
  lampGlow: MeshBasicMaterial;
  // The cassette.
  shell: MeshPhysicalMaterial;
  shellWindow: MeshPhysicalMaterial;
  tape: MeshStandardMaterial;
  leader: MeshStandardMaterial;
  hub: MeshStandardMaterial;
  label: MeshStandardMaterial;
  screw: MeshStandardMaterial;
}

export type FinishName = keyof typeof DECK_SPEC.finishes;

const M = DECK_SPEC.materials;

/** A texture repeated over a part's UVs; shares the baked image. */
function tiled(texture: Texture, x: number, y = x): Texture {
  const t = texture.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

function led(colour: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(colour).multiplyScalar(0.25),
    emissive: colour,
    emissiveIntensity: 0,
    roughness: 0.3,
  });
}

export function createDeckMaterials(
  s: Surfaces,
  textures: { silkscreen: Texture; meterFace: Texture; counter: Texture; keyLegend: Texture },
): DeckMaterials {
  const face = new MeshPhysicalMaterial({
    color: M.brushedSilver.colour,
    metalness: 1,
    roughness: 1,
    // The face's UVs are in metres (ExtrudeGeometry's world UVs): one tile per 0.43 m across,
    // strokes running along x.
    roughnessMap: tiled(s.brushedRoughness, 2.3, 2.3 * 5),
    normalMap: tiled(s.brushedNormal, 2.3, 2.3 * 5),
    normalScale: new Vector2(0.04, 0.04),
    anisotropy: M.brushedSilver.anisotropy,
    anisotropyRotation: Math.PI / 2,
  });
  return {
    face,
    bevel: new MeshPhysicalMaterial({
      color: M.brushedSilver.colour,
      metalness: 1,
      roughness: 0.12,
    }),
    wrap: new MeshPhysicalMaterial({
      color: M.wrapBlack.colour,
      metalness: M.wrapBlack.metalness,
      roughness: 1,
      roughnessMap: tiled(s.plinthRoughness, 1),
      normalMap: tiled(s.plinthNormal, 3),
      normalScale: new Vector2(0.05, 0.05),
    }),
    key: new MeshPhysicalMaterial({
      color: M.keyCap.colour,
      metalness: 1,
      roughness: 1,
      roughnessMap: tiled(s.brushedRoughness, 1, 4),
      anisotropy: M.keyCap.anisotropy,
    }),
    recess: new MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.85, metalness: 0 }),
    plastic: new MeshStandardMaterial({ color: '#141415', roughness: 0.55, metalness: 0 }),
    smoked: new MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 1,
      roughnessMap: s.acrylicRoughness,
      transmission: 1,
      thickness: 0.003,
      ior: 1.49,
      attenuationColor: M.smokedAcrylic.colour,
      attenuationDistance: 0.014,
      specularIntensity: 1,
    }),
    glass: new MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.12,
      specularIntensity: 1,
      depthWrite: false,
    }),
    meterFace: new MeshStandardMaterial({
      map: textures.meterFace,
      emissiveMap: textures.meterFace,
      emissive: '#ffcf8a',
      emissiveIntensity: 0,
      roughness: M.meterFace.roughness,
      metalness: 0,
    }),
    needle: new MeshStandardMaterial({ color: M.needle.colour, roughness: 0.5, metalness: 0 }),
    counterWheel: new MeshStandardMaterial({ map: textures.counter, roughness: 0.6, metalness: 0 }),
    silkscreen: new MeshStandardMaterial({
      color: M.silkscreen.colour,
      map: textures.silkscreen,
      transparent: true,
      roughness: 0.6,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    }),
    keyLegend: new MeshStandardMaterial({
      color: M.silkscreen.colour,
      map: textures.keyLegend,
      transparent: true,
      roughness: 0.6,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    }),
    rubber: new MeshStandardMaterial({
      color: M.rubber.colour,
      roughness: M.rubber.roughness,
      metalness: 0,
      normalMap: tiled(s.rubberNormal, 3),
    }),
    steel: new MeshStandardMaterial({
      color: M.steel.colour,
      roughness: M.steel.roughness,
      metalness: 1,
    }),
    chrome: new MeshStandardMaterial({
      color: M.chrome.colour,
      roughness: M.chrome.roughness,
      metalness: 1,
    }),
    ledGreen: led('#38ff6a'),
    ledAmber: led('#ffb020'),
    ledRed: led('#ff3020'),
    lampGlow: new MeshBasicMaterial({
      color: '#ffb866',
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
    shell: new MeshPhysicalMaterial({
      color: M.shellBlack.colour,
      roughness: M.shellBlack.roughness,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
    }),
    shellWindow: new MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.18,
      specularIntensity: 1,
      depthWrite: false,
    }),
    tape: new MeshStandardMaterial({
      color: M.tape.colour,
      roughness: M.tape.roughness,
      metalness: 0.15,
    }),
    leader: new MeshStandardMaterial({
      color: M.leader.colour,
      roughness: M.leader.roughness,
      metalness: 0,
    }),
    hub: new MeshStandardMaterial({
      color: M.hub.colour,
      roughness: M.hub.roughness,
      metalness: 0,
    }),
    label: new MeshStandardMaterial({
      color: '#ffffff',
      roughness: M.labelPaper.roughness,
      metalness: 0,
    }),
    screw: new MeshStandardMaterial({ color: '#9a9b9d', roughness: 0.3, metalness: 1 }),
  };
}

/** A finish is a set of colours on the face, the wrap and the keys. */
export function applyFinish(m: DeckMaterials, name: FinishName, s: Surfaces): void {
  const finish = DECK_SPEC.finishes[name];
  const face = M[finish.face];
  m.face.color.set(face.colour);
  m.face.roughness = 1;
  m.bevel.color.set(face.colour);
  const keys = M[finish.keys];
  m.key.color.set(keys.colour);
  m.key.metalness = keys.metalness;
  if (finish.wrap === 'wrapWalnut') {
    m.wrap.color.set('#ffffff');
    m.wrap.map = s.walnutColour;
    m.wrap.roughnessMap = s.walnutRoughness;
    m.wrap.metalness = 0;
    m.wrap.clearcoat = 0.35;
  } else {
    m.wrap.color.set(M.wrapBlack.colour);
    m.wrap.map = null;
    m.wrap.roughnessMap = tiled(s.plinthRoughness, 1);
    m.wrap.metalness = M.wrapBlack.metalness;
    m.wrap.clearcoat = 0;
  }
  m.wrap.needsUpdate = true;
  // The silkscreen is painted white; the ink colour is the material's.
  const dark = name === 'black';
  m.silkscreen.color.set(dark ? '#dcdcd8' : M.silkscreen.colour);
  m.keyLegend.color.set(dark ? '#dcdcd8' : M.silkscreen.colour);
  m.face.needsUpdate = true;
}
