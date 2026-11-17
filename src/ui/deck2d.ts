import { packRadius, reelAngle } from '../core/tape';
import type { Deck } from '../deck';
import { DECK_SPEC } from '../spec/deck';

/**
 * The deck in 2D, for browsers without WebGL: the face seen straight on, with the door, the
 * cassette's reels turning and their packs growing and shrinking, the counter and the LEDs. Every
 * control has a twin in the page's strip, so nothing here is needed to operate the deck; a click
 * on the door ejects or shuts it, and a click on the cassette takes it out or puts it back.
 */

const C = DECK_SPEC.chassis;
const W = DECK_SPEC.well;
const CS = DECK_SPEC.cassette;
const MT = DECK_SPEC.meters;
const CT = DECK_SPEC.counter;
const mm = (v: number): number => v / 1000;

export class Deck2D {
  reducedMotion = false;
  labelSource: HTMLCanvasElement | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private colours = { face: '#c9cacc', ink: '#1a1a1a', label: '#d8452b' };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deck: Deck,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('click', (event) => this.click(event));
    this.refreshColors();
  }

  refreshColors(): void {
    const style = getComputedStyle(document.documentElement);
    const finish = document.documentElement.dataset.plinth ?? 'silver';
    this.colours = {
      face: finish === 'black' ? '#2a2b2e' : finish === 'champagne' ? '#d8c7a6' : '#c9cacc',
      ink: finish === 'black' ? '#dcdcd8' : '#1a1a1a',
      label: style.getPropertyValue('--label').trim() || '#d8452b',
    };
  }

  /** Face metres to canvas pixels. */
  private x(mmX: number): number {
    return (mmX + C.width / 2) * this.scale;
  }

  private y(mmY: number): number {
    return (C.height - mmY) * this.scale;
  }

  private click(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * this.canvas.width) / rect.width;
    const py = ((event.clientY - rect.top) * this.canvas.height) / rect.height;
    const mx = px / this.scale - C.width / 2;
    const my = C.height - py / this.scale;
    const inDoor =
      Math.abs(mx - W.centreX) < W.doorWidth / 2 && Math.abs(my - W.centreY) < W.doorHeight / 2;
    if (!inDoor) return;
    if (this.deck.door.closed) this.deck.eject();
    else this.deck.toggleCassette();
  }

  update(): void {
    const { canvas, ctx: g, deck } = this;
    const width = canvas.clientWidth || 640;
    const ratio = Math.min(2, devicePixelRatio || 1);
    const height = Math.round((width * C.height) / C.width);
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.height = `${height}px`;
    }
    this.scale = canvas.width / C.width;
    const s = this.scale;
    const t = deck.transport;
    g.clearRect(0, 0, canvas.width, canvas.height);
    // Face.
    const face = g.createLinearGradient(0, 0, 0, canvas.height);
    face.addColorStop(0, this.colours.face);
    face.addColorStop(1, shade(this.colours.face, -0.12));
    g.fillStyle = face;
    g.beginPath();
    g.roundRect(0, 0, canvas.width, this.y(C.footHeight), mm(3) * s);
    g.fill();
    // Brushing.
    g.globalAlpha = 0.06;
    for (let i = 0; i < canvas.height; i += 2) {
      g.fillStyle = i % 4 === 0 ? '#ffffff' : '#000000';
      g.fillRect(0, i, canvas.width, 1);
    }
    g.globalAlpha = 1;
    // Door and window.
    const doorX = this.x(W.centreX - W.doorWidth / 2);
    const doorY = this.y(W.centreY + W.doorHeight / 2);
    g.strokeStyle = shade(this.colours.face, -0.35);
    g.lineWidth = mm(0.8) * s;
    g.strokeRect(doorX, doorY, W.doorWidth * s, W.doorHeight * s);
    const open = !deck.door.closed;
    g.fillStyle = open ? '#060606' : '#1d1915';
    const winX = this.x(W.centreX - W.windowWidth / 2);
    const winY = this.y(W.centreY + W.windowOffsetY + W.windowHeight / 2);
    g.fillRect(winX, winY, W.windowWidth * s, W.windowHeight * s);
    if (deck.inDeck) this.cassette(W.centreX, W.centreY + W.windowOffsetY + mm(4), open ? 0.85 : 1);
    // Meters: two bars standing in for the needles.
    g.fillStyle = t.powered ? '#efe0b8' : '#9b9480';
    g.fillRect(
      this.x(MT.centreX - MT.width / 2),
      this.y(MT.centreY + MT.height / 2),
      MT.width * s,
      MT.height * s,
    );
    // Counter.
    g.fillStyle = '#121212';
    g.fillRect(
      this.x(CT.x - CT.windowWidth / 2),
      this.y(CT.y + CT.windowHeight / 2),
      CT.windowWidth * s,
      CT.windowHeight * s,
    );
    g.fillStyle = '#f2f0ea';
    g.font = `600 ${mm(7) * s}px ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(deck.counterText, this.x(CT.x), this.y(CT.y));
    // LEDs.
    const led = (x: number, y: number, on: boolean, colour: string): void => {
      g.fillStyle = on ? colour : '#222';
      g.beginPath();
      g.arc(this.x(x), this.y(y), mm(1.6) * s, 0, Math.PI * 2);
      g.fill();
    };
    led(DECK_SPEC.leds.reverseX, DECK_SPEC.leds.y, t.powered && t.direction < 0, '#38ff6a');
    led(DECK_SPEC.leds.forwardX, DECK_SPEC.leds.y, t.powered && t.direction > 0, '#38ff6a');
    led(DECK_SPEC.power.x, DECK_SPEC.leds.powerY, t.powered, '#ff3020');
    g.fillStyle = this.colours.ink;
    g.font = `600 ${mm(2.6) * s}px Inter, sans-serif`;
    g.fillText(
      'STEREO CASSETTE DECK',
      this.x(W.centreX),
      this.y(W.centreY + W.doorHeight / 2 + mm(3.5)),
    );
  }

  private cassette(cx: number, cy: number, scale: number): void {
    const { ctx: g, deck } = this;
    const s = this.scale * scale;
    const x0 = this.x(cx) - (CS.width / 2) * s;
    const y0 = this.y(cy) - (CS.height / 2) * s;
    g.fillStyle = '#151517';
    g.beginPath();
    g.roundRect(x0, y0, CS.width * s, CS.height * s, mm(3) * s);
    g.fill();
    g.fillStyle = '#efe7d6';
    g.fillRect(x0 + mm(5) * s, y0 + mm(5) * s, (CS.width - mm(10)) * s, (CS.height - mm(18)) * s);
    g.fillStyle = this.colours.label;
    g.fillRect(x0 + mm(5) * s, y0 + mm(6) * s, (CS.width - mm(10)) * s, mm(4) * s);
    // The window with the packs and hubs.
    const wy = y0 + CS.height * 0.5 * s + mm(2) * s;
    g.fillStyle = '#2a211b';
    g.fillRect(
      this.x(cx) - (CS.windowWidth / 2) * s,
      wy - (CS.windowHeight / 2) * s,
      CS.windowWidth * s,
      CS.windowHeight * s,
    );
    const geometry = deck.geometry;
    const x = deck.transport.x;
    const wound = [geometry.total - x, x];
    const angles = [-reelAngle(geometry, wound[0]!), reelAngle(geometry, x)];
    if (this.labelSource) {
      g.drawImage(
        this.labelSource,
        x0 + mm(22) * s,
        y0 + mm(11) * s,
        (CS.width - mm(44)) * s,
        mm(11) * s,
      );
    } else {
      g.fillStyle = '#1d2a5a';
      g.font = `600 ${mm(4) * s}px Inter, sans-serif`;
      g.textAlign = 'left';
      g.fillText(
        `${deck.program.letter(deck.faceUp)}   ${deck.title || 'Mixtape'}`.slice(0, 40),
        x0 + mm(8) * s,
        y0 + mm(16) * s,
      );
    }
    for (let i = 0; i < 2; i++) {
      const hx = this.x(cx) + (i === 0 ? -1 : 1) * (CS.hubSpacing / 2) * s;
      g.save();
      g.beginPath();
      g.rect(
        this.x(cx) - (CS.windowWidth / 2) * s,
        wy - (CS.windowHeight / 2) * s,
        CS.windowWidth * s,
        CS.windowHeight * s,
      );
      g.clip();
      g.fillStyle = '#3b2618';
      g.beginPath();
      g.arc(hx, wy, packRadius(geometry, wound[i]!) * s, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.save();
      g.translate(hx, wy);
      g.rotate(-(this.reducedMotion ? 0 : angles[i]!));
      g.fillStyle = '#f1f0ec';
      g.beginPath();
      g.arc(0, 0, CS.hubRadius * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#151517';
      for (let k = 0; k < 6; k++) {
        g.rotate(Math.PI / 3);
        g.fillRect(-mm(0.8) * s, mm(3.5) * s, mm(1.6) * s, mm(3) * s);
      }
      g.beginPath();
      g.arc(0, 0, mm(4) * s, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f((n >> 16) & 255)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
}
