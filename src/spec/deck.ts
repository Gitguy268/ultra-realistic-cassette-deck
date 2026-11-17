/**
 * The one source of every dimension, timing and material of the deck and its cassette.
 * Units: metres, seconds, degrees. Each figure says where it comes from:
 *
 * - [S#] a cited standard or reference, listed in docs/REFERENCE.md and held by tests/reference.test.ts;
 * - [D] a design value: the deck is generic, so its face is ours, kept to hi-fi proportions;
 * - [M] derived by arithmetic from cited figures (the derivation is in the comment).
 *
 * World axes: x to the right, y up, z toward the listener. The deck stands on the credenza top
 * (y = 0), centred on x = 0, its front face at z = chassis.depth / 2.
 */

const mm = (value: number): number => value / 1000;

/** [S1] 1⅞ in/s. */
export const TAPE_SPEED = mm(47.625);

export const DECK_SPEC = {
  version: 1,
  /** The cabinet. [D] 430 mm is the usual hi-fi component width [S6]. */
  chassis: {
    width: mm(430),
    height: mm(118),
    depth: mm(262),
    /** Feet lift the cabinet; the face plate starts above them. */
    footHeight: mm(10),
    footDiameter: mm(36),
    footInsetX: mm(36),
    footInsetZ: mm(32),
    /** Painted steel wrap over top and sides. */
    wrapThickness: mm(1.2),
    edgeRadius: mm(1.6),
    /** Ventilation slots in the top, over the transport. */
    ventSlots: 22,
  },
  /** The brushed aluminium face plate, proud of the wrap. [D] */
  face: {
    thickness: mm(5),
    /** Bevel round the face's outer edge, polished. */
    bevel: mm(1.2),
    /** Inset from the wrap's outer edges. */
    inset: mm(0),
  },
  /** The cassette compartment and its door, on the left half. [D] layout, cassette size from [S1]. */
  well: {
    centreX: mm(-92),
    /** Centre height of the door opening above the credenza. */
    centreY: mm(70),
    doorWidth: mm(140),
    doorHeight: mm(80),
    doorThickness: mm(9),
    /** The smoked window in the door, around the cassette's own window. */
    windowWidth: mm(112),
    windowHeight: mm(54),
    windowOffsetY: mm(3),
    /** The door hinges along its bottom edge and tilts out. */
    openDeg: 28,
    /** Oil damper: the spring pushes, the damper limits speed. Time to open fully. */
    openS: 0.65,
    /** Pushed shut by hand, it latches with a click. */
    closeS: 0.18,
    /** How deep the cassette sits behind the door face. */
    cassetteDepth: mm(14),
  },
  /** Piano-key transport under the door. Order as on the face, left to right. [D] */
  keys: {
    order: ['rec', 'rew', 'play', 'ff', 'stop', 'pause'] as const,
    centreY: mm(19),
    width: mm(20.5),
    height: mm(12),
    gap: mm(2),
    depth: mm(22),
    /** Travel when pressed; latching keys stay at `latchTravel`. */
    travel: mm(4),
    latchTravel: mm(2.6),
    pressS: 0.05,
    releaseS: 0.09,
  },
  /** Power switch and phones jack at the far left. [D] */
  power: {
    x: mm(-196),
    y: mm(80),
    width: mm(16),
    height: mm(10),
    travel: mm(3),
    jackX: mm(-196),
    jackY: mm(30),
    jackDiameter: mm(6.35),
  },
  /** Two needle meters behind one window. [D] Ballistics: VU, 300 ms to 99 % [S7]. */
  meters: {
    centreX: mm(78),
    centreY: mm(88),
    width: mm(124),
    height: mm(38),
    /** One meter face. */
    faceWidth: mm(56),
    needleLength: mm(30),
    /** Needle sweep from −20 VU to +3 VU. */
    sweepDeg: 92,
    /** Needle: rise to 99 % in 300 ms with about 1 % overshoot [S7]. */
    riseS: 0.3,
    overshoot: 0.012,
    lampKelvin: 3000,
  },
  /** Three-digit mechanical counter with its reset button. [D] */
  counter: {
    x: mm(174),
    y: mm(92),
    wheelDiameter: mm(9),
    wheelWidth: mm(5.2),
    windowWidth: mm(22),
    windowHeight: mm(10),
    resetX: mm(196),
    /**
     * Take-up reel turns per counter count. [D] Chosen so a C60 side reads about 600: a whole
     * side moves all 90 m, ~845 turns of the take-up reel ([M] (r_full − r_hub) / t).
     */
    turnsPerCount: 1.4,
  },
  /** The switch row under the meters. [D] */
  switches: {
    y: mm(54),
    tapeTypeX: mm(42),
    nrX: mm(92),
    reverseX: mm(142),
    width: mm(30),
    knobWidth: mm(7),
    knobHeight: mm(6),
    /** Positions across each slot. */
    travel: mm(9),
  },
  /** Output level knob, far right. [D] */
  levelKnob: {
    x: mm(186),
    y: mm(48),
    diameter: mm(24),
    depth: mm(14),
    sweepDeg: 270,
    knurls: 60,
  },
  /** LED indicators: play direction ◀ ▶ between the keys and the meters, power above its switch. [D] */
  leds: {
    y: mm(22),
    reverseX: mm(-8),
    forwardX: mm(4),
    powerY: mm(96),
    diameter: mm(3),
  },
  /** The Compact Cassette. */
  cassette: {
    /** [S1] 4 × 2.5 × 0.5 in at its largest. */
    width: mm(101.6),
    height: mm(63.5),
    thickness: mm(12.7),
    /** [D] hub centres, as measured on common shells (grade B, see REFERENCE.md). */
    hubSpacing: mm(42),
    /** [D] hub (spool) outer radius, as measured (grade B). */
    hubRadius: mm(11),
    /** The window between the reels in the shell. [D] */
    windowWidth: mm(64),
    windowHeight: mm(22),
    /** The label area above the window. [D] */
    labelHeight: mm(30),
    /** Tape width [S1]. */
    tapeWidth: mm(3.81),
    /** Clear leader at each end. [D] about five seconds at play speed. */
    leaderLength: mm(240),
  },
  /** Tape lengths and thicknesses per cassette [S1]. */
  tapes: {
    C46: { minutes: 46, length: 69, thickness: mm(0.0155) },
    /** [S1] C60: 90 m, 15 to 16 µm. */
    C60: { minutes: 60, length: 90, thickness: mm(0.0155) },
    /** [S1] C90: 135 m, 10 to 11 µm. */
    C90: { minutes: 90, length: 135, thickness: mm(0.0105) },
    /** [S1] C120: 6 µm; length [M] 60 min × 47.625 mm/s × 2 sides ≈ 172 m, plus leader. */
    C120: { minutes: 120, length: 172, thickness: mm(0.006) },
  },
  /** The transport. */
  transport: {
    speed: TAPE_SPEED,
    /** Pitch control range, ± percent. [D] */
    pitchPercent: 3,
    /** Capstan settles after the pinch roller closes. [D] */
    startTau: 0.06,
    /** The pinch roller lifts: tape stops almost at once. [D] */
    stopTau: 0.03,
    /** Power off while playing: the capstan flywheel runs down. [D] */
    runDownTau: 0.45,
    /**
     * Fast wind: the spindle motor is driven toward a constant angular speed, so tape speed grows
     * with the pack. [D] chosen so a C60 side winds in about 70 s, typical of decks of the time:
     * the time is 2π × reel turns / ω ([M] ≈ 5300 rad / 75 rad/s).
     */
    windRadPerS: 75,
    windTau: 0.35,
    /** Brakes on the reels. [D] */
    brakeTau: 0.12,
    /** Time the mechanism takes between a key and the motion (solenoid or cam). [D] */
    engageS: 0.12,
    /** Auto-reverse: the head block turns half a turn. [D] */
    reverseS: 0.42,
    /** Music search stops at a gap at least this long, at this much below the programme. [D] */
    searchGapS: 3,
    /** Gap laid between tracks on the tape. [D] */
    gapS: 4,
    /** Time of tape before the first track, after the leader. [D] */
    leadS: 2,
  },
  /** Playback equalisation and the tape itself, per type. EQ from [S2]. */
  tapeTypes: {
    I: { label: 'Type I · Normal', eqUs: 120, hissDb: -58, hfSaturation: 0.55, mol: 0.9 },
    II: { label: 'Type II · CrO₂', eqUs: 70, hissDb: -62, hfSaturation: 0.75, mol: 1.0 },
    IV: { label: 'Type IV · Metal', eqUs: 70, hissDb: -63, hfSaturation: 1.0, mol: 1.25 },
  },
  /** Noise reduction, from the published descriptions [S3]. */
  nr: {
    /** B: one sliding-band stage, 10 dB at 5 kHz and above. */
    B: { stages: 1, maxDb: 10, cornerHz: 1500 },
    /** C: two stages in series, a high-level and a low-level one, about 15–20 dB. */
    C: { stages: 2, maxDb: 10, cornerHz: 600 },
  },
  /** Wow and flutter. [D] typical of a good 1980s deck: about 0.05 % WRMS. */
  wowFlutter: { wowHz: 1.1, wowDepth: 0.0006, flutterHz: 9.5, flutterDepth: 0.00035 },
  /** Azimuth on the reverse side, where the turned head sits a hair off. [D] */
  azimuth: {
    /** Interchannel time error on side B, microseconds. */
    reverseUs: 14,
    forwardUs: 2,
  },
  materials: {
    brushedSilver: { colour: '#cfd0d2', roughness: 0.3, metalness: 1, anisotropy: 0.85 },
    brushedBlack: { colour: '#26272a', roughness: 0.34, metalness: 0.9, anisotropy: 0.8 },
    brushedChampagne: { colour: '#d8c7a6', roughness: 0.3, metalness: 1, anisotropy: 0.85 },
    wrapBlack: { colour: '#1c1c1e', roughness: 0.55, metalness: 0.3 },
    wrapWalnut: { colour: '#5a3a22', roughness: 0.55, metalness: 0 },
    keyCap: { colour: '#d9dadb', roughness: 0.24, metalness: 1, anisotropy: 0.5 },
    keyCapBlack: { colour: '#1d1d1f', roughness: 0.32, metalness: 0.6 },
    smokedAcrylic: { colour: '#3a3430', roughness: 0.05, metalness: 0, transmission: 0.82 },
    meterFace: { colour: '#efe6cc', roughness: 0.7, metalness: 0 },
    needle: { colour: '#c4221a', roughness: 0.5, metalness: 0 },
    shellBlack: { colour: '#141416', roughness: 0.42, metalness: 0 },
    shellClear: { colour: '#e8ecef', roughness: 0.08, metalness: 0, transmission: 0.88 },
    tape: { colour: '#3b2618', roughness: 0.38, metalness: 0.1 },
    leader: { colour: '#e9e5dc', roughness: 0.5, metalness: 0 },
    hub: { colour: '#f1f0ec', roughness: 0.5, metalness: 0 },
    labelPaper: { colour: '#f2ead8', roughness: 0.88, metalness: 0 },
    rubber: { colour: '#121212', roughness: 0.86, metalness: 0 },
    steel: { colour: '#d8d9da', roughness: 0.12, metalness: 1 },
    chrome: { colour: '#e9eaeb', roughness: 0.06, metalness: 1 },
    silkscreen: { colour: '#1a1a1a' },
    credenzaWalnut: { colour: '#4a2e1a', roughness: 0.45, metalness: 0, clearcoat: 0.35 },
    wallPaint: { colour: '#b9a58a', roughness: 0.92, metalness: 0 },
  },
  finishes: {
    silver: { face: 'brushedSilver', wrap: 'wrapBlack', keys: 'keyCap', label: 'Silver' },
    black: { face: 'brushedBlack', wrap: 'wrapBlack', keys: 'keyCapBlack', label: 'Black' },
    champagne: {
      face: 'brushedChampagne',
      wrap: 'wrapBlack',
      keys: 'keyCap',
      label: 'Champagne',
    },
    walnut: {
      face: 'brushedSilver',
      wrap: 'wrapWalnut',
      keys: 'keyCap',
      label: 'Silver on walnut',
    },
  },
  /** The three page themes pick a finish. */
  themes: { minimal: 'black', wood: 'walnut', clear: 'silver' },
  room: {
    credenza: { width: 1.6, depth: 0.5, height: 0.66, top: 0.025, centreX: 0.12, frontZ: 0.2 },
    wallZ: -0.32,
    bounds: { left: -1.45, right: 2.1, front: 3.2, ceiling: 1.95 },
    /** In the left wall: centre z, height of its centre above the credenza top, size. */
    window: { z: 0.45, y: 0.75, width: 1.1, height: 1.25 },
    lamp: { x: 0.66, z: -0.14, shadeY: 0.42, shadeRadius: 0.13, kelvin: 2700 },
    /** Light bounced by walls, ceiling and furniture, as a share of the direct light on the deck. */
    bounce: 0.3,
    /** EV100 of the camera (incident: log2(lux / 2.5)); window light in lux on the deck; lamp in lumens. */
    lighting: {
      dusk: {
        exposureEV: 6.4,
        windowKelvin: 7400,
        windowLux: 190,
        lampLumens: 520,
        wall: '#a69e92',
      },
      daylight: {
        exposureEV: 9.6,
        windowKelvin: 6300,
        windowLux: 1400,
        lampLumens: 0,
        wall: '#c4b49c',
      },
    },
  },
  camera: {
    filmGauge: 36,
    hero: { focal: 40, position: [-0.3, 0.3, 0.86], target: [0.0, 0.06, 0.06] },
    control: { focal: 45, position: [0.0, 0.18, 0.72], target: [0.0, 0.065, 0.13] },
    mobile: { focal: 35, position: [0.0, 0.42, 1.2], target: [0.0, 0.06, 0.06] },
    intro: {
      durationS: 7,
      keyframes: [
        { t: 0, focal: 35, position: [-1.15, 1.1, 2.2], target: [-0.6, 0.7, -0.3] },
        { t: 0.45, focal: 38, position: [-0.8, 0.55, 1.4], target: [-0.05, 0.08, 0.0] },
        { t: 1, focal: 40, position: [-0.3, 0.3, 0.86], target: [0.0, 0.06, 0.06] },
      ],
    },
    tour: [
      {
        name: 'Cassette and reels',
        focal: 55,
        position: [-0.16, 0.12, 0.42],
        target: [-0.092, 0.072, 0.13],
        dof: true,
      },
      {
        name: 'Meters and counter',
        focal: 55,
        position: [0.18, 0.13, 0.44],
        target: [0.11, 0.085, 0.13],
        dof: true,
      },
      {
        name: 'Transport keys',
        focal: 55,
        position: [-0.04, 0.09, 0.4],
        target: [-0.09, 0.02, 0.13],
        dof: true,
      },
      {
        name: 'Switches and level',
        focal: 50,
        position: [0.34, 0.16, 0.38],
        target: [0.12, 0.05, 0.13],
        dof: true,
      },
    ],
    limits: {
      minDistance: 0.24,
      maxDistance: 2.4,
      /** Polar angle from straight up, degrees: never below the credenza top. */
      minPolarDeg: 8,
      maxPolarDeg: 86,
    },
  },
} as const;

export type DeckSpec = typeof DECK_SPEC;
export type TapeName = keyof typeof DECK_SPEC.tapes;
export type TapeType = keyof typeof DECK_SPEC.tapeTypes;
export type NrMode = 'off' | 'B' | 'C';
export type KeyName = (typeof DECK_SPEC.keys.order)[number];
