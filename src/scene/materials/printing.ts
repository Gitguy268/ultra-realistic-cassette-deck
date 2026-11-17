import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { DECK_SPEC } from '../../spec/deck';

/**
 * Everything printed on the deck, painted once into canvases: the silkscreen on the face, the VU
 * scales, the counter's digit wheels and the legends on the keys. The deck is generic, so there
 * is no maker's name: only what the controls do. White ink on transparency; the material sets
 * the ink's colour per finish.
 */

const C = DECK_SPEC.chassis;
const W = DECK_SPEC.well;
const K = DECK_SPEC.keys;
const SW = DECK_SPEC.switches;
const MT = DECK_SPEC.meters;
const CT = DECK_SPEC.counter;
const LV = DECK_SPEC.levelKnob;
const PW = DECK_SPEC.power;
const LED = DECK_SPEC.leds;

const FONT = '"Inter Variable", "Helvetica Neue", Arial, sans-serif';

function texture(canvas: HTMLCanvasElement, srgb = true): Texture {
  const t = new CanvasTexture(canvas);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The face plate spans the chassis width and stands from the feet to the top. */
export const FACE_BOTTOM = C.footHeight;
export const FACE_HEIGHT = C.height - C.footHeight;
/** Pixels per metre of the silkscreen. */
const S = 9600;

export function paintSilkscreen(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(C.width * S);
  canvas.height = Math.round(FACE_HEIGHT * S);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  const px = (x: number): number => (x + C.width / 2) * S;
  const py = (y: number): number => (C.height - y) * S;
  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = 'center',
    weight = 500,
    spacing = 0.12,
  ): void => {
    g.font = `${weight} ${size * S}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.letterSpacing = `${spacing * size * S}px`;
    g.fillText(s, px(x), py(y));
  };
  const line = (x0: number, y0: number, x1: number, y1: number, width = 0.0003): void => {
    g.lineWidth = width * S;
    g.beginPath();
    g.moveTo(px(x0), py(y0));
    g.lineTo(px(x1), py(y1));
    g.stroke();
  };
  const mm = (v: number): number => v / 1000;

  // The door: a thin printed frame and its legend.
  const doorTop = W.centreY + W.doorHeight / 2;
  text('AUTO REVERSE', W.centreX + W.doorWidth / 2, doorTop + mm(3.6), mm(2.3), 'right', 600);
  text(
    'STEREO CASSETTE DECK',
    W.centreX - W.doorWidth / 2,
    doorTop + mm(3.6),
    mm(2.3),
    'left',
    600,
  );

  // Under the keys: what each does.
  const pitch = K.width + K.gap;
  const first = W.centreX - (pitch * (K.order.length - 1)) / 2;
  const names: Record<(typeof K.order)[number], string> = {
    rec: 'REC',
    rew: 'REW · REVIEW',
    play: 'PLAY',
    ff: 'F.FWD · CUE',
    stop: 'STOP / EJECT',
    pause: 'PAUSE',
  };
  K.order.forEach((key, i) => {
    text(
      names[key],
      first + i * pitch,
      K.centreY + K.height / 2 + mm(2.4),
      mm(1.45),
      'center',
      600,
      0.06,
    );
  });

  // Power and phones.
  text('POWER', PW.x, PW.y - PW.height / 2 - mm(3.2), mm(1.9), 'center', 600);
  text('ON ▪ OFF', PW.x, PW.y + PW.height / 2 + mm(3), mm(1.5), 'center', 500);
  text('PHONES', PW.jackX, PW.jackY - mm(7), mm(1.9), 'center', 600);

  // Direction LEDs.
  text('◀', LED.reverseX, LED.y + mm(4.5), mm(2.2));
  text('▶', LED.forwardX, LED.y + mm(4.5), mm(2.2));

  // Meters and counter.
  text('LEVEL', MT.centreX, MT.centreY - MT.height / 2 - mm(3.4), mm(1.8), 'center', 600, 0.4);
  text('TAPE COUNTER', CT.x, CT.y + mm(9), mm(1.6), 'center', 600);
  text('RESET', CT.resetX, CT.y - mm(6.5), mm(1.5), 'center', 600);

  // The switch row: name above, positions below the slot.
  const row = (x: number, name: string, positions: string[]): void => {
    text(name, x, SW.y + mm(8), mm(1.8), 'center', 600);
    positions.forEach((label, i) => {
      const at = x - SW.travel + (i * SW.travel * 2) / (positions.length - 1);
      text(label, at, SW.y - mm(7.5), mm(1.6), 'center', 600, 0.02);
      line(at, SW.y - mm(5), at, SW.y - mm(4));
    });
  };
  row(SW.tapeTypeX, 'TAPE', ['I', 'II', 'IV']);
  row(SW.nrX, 'NR SYSTEM', ['OFF', 'B', 'C']);
  row(SW.reverseX, 'REV. MODE', ['⊐', '⊃⊂', '∞']);
  text('NORMAL   CrO₂   METAL', SW.tapeTypeX, SW.y - mm(12), mm(1.25), 'center', 500, 0.04);

  // The output level scale round its knob.
  const r = LV.diameter / 2 + mm(2.8);
  for (let i = 0; i <= 10; i++) {
    const a = ((-LV.sweepDeg / 2 + (i * LV.sweepDeg) / 10) * Math.PI) / 180;
    const x = LV.x + Math.sin(a) * r;
    const y = LV.y + Math.cos(a) * r;
    line(x, y, LV.x + Math.sin(a) * (r + mm(1.4)), LV.y + Math.cos(a) * (r + mm(1.4)), 0.00035);
    if (i % 2 === 0) {
      text(
        String(i),
        LV.x + Math.sin(a) * (r + mm(3.4)),
        LV.y + Math.cos(a) * (r + mm(3.4)),
        mm(1.4),
        'center',
        600,
        0,
      );
    }
  }
  text('OUTPUT', LV.x, LV.y - LV.diameter / 2 - mm(6.5), mm(1.8), 'center', 600);

  // A hairline along the bottom of the face.
  line(
    -C.width / 2 + mm(8),
    FACE_BOTTOM + mm(4),
    C.width / 2 - mm(8),
    FACE_BOTTOM + mm(4),
    0.00025,
  );
  return texture(canvas);
}

/** Both VU faces on one card behind the meter window. */
export function paintMeterFace(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * MT.height) / MT.width);
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const half = w / 2;
  g.fillStyle = '#efe6cc';
  g.fillRect(0, 0, w, h);
  // A divider between the two meters.
  g.fillStyle = '#121212';
  g.fillRect(half - 4, 0, 8, h);
  for (const [side, cx] of [
    ['L', half / 2],
    ['R', half + half / 2],
  ] as const) {
    const pivotY = h * 1.12;
    const radius = h * 0.92;
    const sweep = (MT.sweepDeg * Math.PI) / 180;
    const angleFor = (db: number): number => -sweep / 2 + ((db + 20) / 23) * sweep;
    // The arc, red past 0 VU.
    g.lineWidth = 3;
    g.strokeStyle = '#1b1b1b';
    g.beginPath();
    g.arc(cx, pivotY, radius, -Math.PI / 2 + angleFor(-20), -Math.PI / 2 + angleFor(0));
    g.stroke();
    g.strokeStyle = '#c4221a';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(cx, pivotY, radius - 2, -Math.PI / 2 + angleFor(0), -Math.PI / 2 + angleFor(3));
    g.stroke();
    const marks: [number, string][] = [
      [-20, '20'],
      [-10, '10'],
      [-7, '7'],
      [-5, '5'],
      [-3, '3'],
      [-1, '1'],
      [0, '0'],
      [1, '1'],
      [2, '2'],
      [3, '3'],
    ];
    g.font = `600 ${h * 0.1}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [db, label] of marks) {
      const a = -Math.PI / 2 + angleFor(db);
      const red = db >= 0;
      g.strokeStyle = red ? '#c4221a' : '#1b1b1b';
      g.lineWidth = db === 0 ? 4 : 2.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * radius, pivotY + Math.sin(a) * radius);
      g.lineTo(cx + Math.cos(a) * (radius + h * 0.07), pivotY + Math.sin(a) * (radius + h * 0.07));
      g.stroke();
      g.fillStyle = red ? '#c4221a' : '#1b1b1b';
      g.fillText(
        label,
        cx + Math.cos(a) * (radius + h * 0.15),
        pivotY + Math.sin(a) * (radius + h * 0.15),
      );
    }
    // Minor ticks.
    for (let db = -20; db <= 3; db += 1) {
      const a = -Math.PI / 2 + angleFor(db);
      g.strokeStyle = db >= 0 ? '#c4221a' : '#1b1b1b';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * radius, pivotY + Math.sin(a) * radius);
      g.lineTo(
        cx + Math.cos(a) * (radius + h * 0.035),
        pivotY + Math.sin(a) * (radius + h * 0.035),
      );
      g.stroke();
    }
    g.fillStyle = '#1b1b1b';
    g.font = `700 ${h * 0.13}px ${FONT}`;
    g.fillText('VU', cx, h * 0.62);
    g.font = `600 ${h * 0.09}px ${FONT}`;
    g.fillText(side, cx - half * 0.36, h * 0.82);
    g.fillText('dB', cx + half * 0.36, h * 0.82);
  }
  return texture(canvas);
}

/** The counter's digit wheels: 0–9 round the circumference. */
export function paintCounterDigits(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 96;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#121212';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#f2f0ea';
  g.font = `600 80px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let d = 0; d < 10; d++) {
    // Rotated to stand upright on a wheel turning about x.
    g.save();
    g.translate(d * 128 + 64, 48);
    g.rotate(-Math.PI / 2);
    g.fillText(String(d), 0, 4);
    g.restore();
  }
  return texture(canvas);
}

/** The key legends, in a row of cells: one per key in DECK_SPEC.keys.order. */
export function paintKeyLegends(): Texture {
  const cell = 160;
  const canvas = document.createElement('canvas');
  canvas.width = cell * K.order.length;
  canvas.height = Math.round((cell * K.height) / K.width);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  const h = canvas.height;
  const symbol: Record<(typeof K.order)[number], (x: number) => void> = {
    rec: (x) => {
      g.beginPath();
      g.arc(x, h / 2, h * 0.13, 0, Math.PI * 2);
      g.fill();
    },
    rew: (x) => {
      tri(x - h * 0.02, -1);
      tri(x - h * 0.22, -1);
    },
    play: (x) => tri(x - h * 0.08, 1),
    ff: (x) => {
      tri(x - h * 0.2, 1);
      tri(x + 0.0, 1);
    },
    stop: (x) => {
      g.fillRect(x - h * 0.25, h * 0.36, h * 0.2, h * 0.2);
      g.beginPath();
      g.moveTo(x + h * 0.06, h * 0.52);
      g.lineTo(x + h * 0.32, h * 0.52);
      g.lineTo(x + h * 0.19, h * 0.34);
      g.fill();
      g.fillRect(x + h * 0.06, h * 0.56, h * 0.26, h * 0.05);
    },
    pause: (x) => {
      g.fillRect(x - h * 0.13, h * 0.32, h * 0.08, h * 0.36);
      g.fillRect(x + h * 0.05, h * 0.32, h * 0.08, h * 0.36);
    },
  };
  function tri(x: number, dir: 1 | -1): void {
    const s = h * 0.2;
    g.beginPath();
    if (dir > 0) {
      g.moveTo(x, h / 2 - s);
      g.lineTo(x + s * 1.1, h / 2);
      g.lineTo(x, h / 2 + s);
    } else {
      g.moveTo(x + s * 1.1, h / 2 - s);
      g.lineTo(x, h / 2);
      g.lineTo(x + s * 1.1, h / 2 + s);
    }
    g.fill();
  }
  K.order.forEach((key, i) => symbol[key](i * cell + cell / 2));
  return texture(canvas);
}
