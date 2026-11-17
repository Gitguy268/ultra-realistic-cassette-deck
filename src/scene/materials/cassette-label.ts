import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { hash, rng } from '../../core/random';
import { DECK_SPEC } from '../../spec/deck';

/**
 * A cassette's paper label, one per side, drawn into a canvas the label mesh shows: the side
 * letter, the tape and its type, the artist and album along the top, and the tracks on that side
 * written in as on a mixtape. The window between the reels is cut out (transparent). A live
 * visualizer, when on, is printed into the title band while the tape plays.
 */

export interface LabelContent {
  side: 'A' | 'B';
  heading: string;
  tracks: readonly string[];
  tape: string;
  type: string;
  nr: string;
  colour: string;
  ink: string;
  cover: ImageBitmap | null;
  coverVersion: number;
}

const CS = DECK_SPEC.cassette;
const WIDTH = 1024;
const HEIGHT = Math.round((WIDTH * CS.height) / CS.width);
/** Pixels per metre on the label. */
const S = WIDTH / CS.width;
const FONT = '"Inter Variable", "Helvetica Neue", Arial, sans-serif';

/** The window in label pixels: centred, just below the middle. */
export const LABEL_WINDOW = {
  x: (WIDTH - CS.windowWidth * S) / 2,
  y: HEIGHT * 0.43,
  w: CS.windowWidth * S,
  h: CS.windowHeight * S,
};
/** The band the visualizer is printed into. */
const LIVE = { x: WIDTH * 0.2, y: HEIGHT * 0.12, w: WIDTH * 0.6, h: HEIGHT * 0.27 };

export class CassetteLabel {
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly print = document.createElement('canvas');
  private key = '';
  private live = false;
  /** What was last printed, and the live picture last shown (for the browser checks). */
  content: LabelContent | null = null;
  source: HTMLCanvasElement | null = null;

  get isLive(): boolean {
    return this.live;
  }

  constructor() {
    this.canvas.width = this.print.width = WIDTH;
    this.canvas.height = this.print.height = HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 8;
  }

  /** Repaints the print when its content changed. */
  paint(content: LabelContent): void {
    const key = [
      content.side,
      content.heading,
      content.tracks.join('|'),
      content.tape,
      content.type,
      content.nr,
      content.colour,
      content.ink,
      content.coverVersion,
    ].join('§');
    if (key === this.key) return;
    this.key = key;
    this.content = { ...content };
    this.paintPrint(content);
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.ctx.drawImage(this.print, 0, 0);
    this.texture.needsUpdate = true;
  }

  /** A live picture in the title band, or the print back when `source` is null. */
  showLive(source: HTMLCanvasElement | null): void {
    if (!source && !this.live) return;
    const g = this.ctx;
    g.clearRect(0, 0, WIDTH, HEIGHT);
    g.drawImage(this.print, 0, 0);
    this.live = source !== null;
    this.source = source;
    if (source) {
      g.save();
      g.beginPath();
      g.roundRect(LIVE.x, LIVE.y, LIVE.w, LIVE.h, 10);
      g.clip();
      g.fillStyle = '#000';
      g.fillRect(LIVE.x, LIVE.y, LIVE.w, LIVE.h);
      g.drawImage(source, LIVE.x, LIVE.y, LIVE.w, LIVE.h);
      g.restore();
    }
    this.texture.needsUpdate = true;
  }

  private paintPrint(c: LabelContent): void {
    const g = this.print.getContext('2d')!;
    g.clearRect(0, 0, WIDTH, HEIGHT);
    const random = rng(hash(`${c.side}${c.heading}`));
    // Paper, inset from the shell's edges, with rounded corners.
    const inset = (5.5 / 1000) * S;
    const paperBottom = HEIGHT * 0.78;
    g.fillStyle = '#f2ead8';
    g.beginPath();
    g.roundRect(inset, inset, WIDTH - 2 * inset, paperBottom - inset, 18);
    g.fill();
    // Paper fibre.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(90,70,40,${0.02 + random() * 0.04})`;
      g.fillRect(random() * WIDTH, random() * paperBottom, 1 + random() * 3, 1);
    }
    // A coloured band at the top, and one under the window.
    g.fillStyle = c.colour;
    g.fillRect(inset, inset + 6, WIDTH - 2 * inset, HEIGHT * 0.07);
    g.fillRect(inset, LABEL_WINDOW.y + LABEL_WINDOW.h + 18, WIDTH - 2 * inset, HEIGHT * 0.05);
    // The cover art, small, at the right of the title band.
    if (c.cover) {
      const size = HEIGHT * 0.25;
      g.drawImage(c.cover, WIDTH - inset - size - 24, HEIGHT * 0.13, size, size);
    }
    // Side letter.
    g.fillStyle = c.ink;
    g.textBaseline = 'middle';
    g.font = `800 ${HEIGHT * 0.2}px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(c.side, inset + 26, HEIGHT * 0.26);
    // Writing lines.
    g.strokeStyle = 'rgba(60,80,140,0.35)';
    g.lineWidth = 2;
    const lineLeft = inset + HEIGHT * 0.2;
    const lineRight = WIDTH - inset - (c.cover ? HEIGHT * 0.25 + 40 : 30);
    for (let i = 0; i < 4; i++) {
      const y = HEIGHT * (0.18 + i * 0.065);
      g.beginPath();
      g.moveTo(lineLeft, y + 14);
      g.lineTo(lineRight, y + 14);
      g.stroke();
    }
    // The heading and the tracks, written in by hand: slightly tilted, ink not quite even.
    g.fillStyle = '#1d2a5a';
    g.save();
    g.translate(lineLeft + 8, HEIGHT * 0.18);
    g.rotate(-0.012);
    g.font = `600 ${HEIGHT * 0.06}px ${FONT}`;
    g.fillText(fit(g, c.heading || 'Mixtape', lineRight - lineLeft - 20), 0, 0);
    g.font = `500 ${HEIGHT * 0.042}px ${FONT}`;
    const list = c.tracks.slice(0, 6);
    const columns = list.length > 3 ? 2 : 1;
    const columnWidth = (lineRight - lineLeft - 20) / columns;
    list.forEach((title, i) => {
      const column = Math.floor(i / 3);
      const row = i % 3;
      g.fillText(
        fit(g, `${i + 1}. ${title}`, columnWidth - 16),
        column * columnWidth,
        HEIGHT * (0.066 + row * 0.065),
      );
    });
    if (c.tracks.length > 6) {
      g.fillText(`+ ${c.tracks.length - 6} more`, columnWidth, HEIGHT * 0.2);
    }
    g.restore();
    // The tape's printing beside the window.
    g.fillStyle = c.ink;
    g.font = `800 ${HEIGHT * 0.07}px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(c.tape, inset + 24, LABEL_WINDOW.y + LABEL_WINDOW.h / 2);
    g.font = `600 ${HEIGHT * 0.034}px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(c.type, WIDTH - inset - 20, LABEL_WINDOW.y + LABEL_WINDOW.h * 0.32);
    g.fillText(c.nr, WIDTH - inset - 20, LABEL_WINDOW.y + LABEL_WINDOW.h * 0.72);
    // The window is a hole in the label.
    g.clearRect(LABEL_WINDOW.x, LABEL_WINDOW.y, LABEL_WINDOW.w, LABEL_WINDOW.h);
  }
}

function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t}…`;
}
