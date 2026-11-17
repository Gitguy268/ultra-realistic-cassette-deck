import { Vector3 } from 'three';
import type { Deck } from '../deck';
import type { Player } from '../player';
import type { Stage } from '../scene/stage';

/**
 * `?debug`: the deck's state for the browser checks, as `window.__deck`. Read-only views of the
 * owners, plus `project`, which turns a named part of the 3D deck into page pixels so a check can
 * aim the pointer at the real key, door or switch, and `capture`, which returns the last seconds
 * of what was heard.
 */
export function exposeDeck(deck: Deck, player: Player, stage: Stage | null): void {
  const frames: number[] = [];
  let last = performance.now();
  let tap: AudioWorkletNode | null = null;
  const connectTap = (): void => {
    const ctx = deck.engine.context;
    const output = deck.engine.outputNode;
    if (tap || !ctx || !output) return;
    tap = new AudioWorkletNode(ctx, 'tap');
    const mute = ctx.createGain();
    mute.gain.value = 0;
    output.connect(tap).connect(mute).connect(ctx.destination);
  };
  const count = (now: number): void => {
    frames.push(now - last);
    if (frames.length > 1200) frames.shift();
    last = now;
    connectTap();
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const mechanisms: string[] = [];
  deck.events.on('mechanism', (sound) => mechanisms.push(sound));

  const api = {
    deck,
    player,
    stage,
    frames,
    mechanisms,
    /** Plain facts, for a check to compare. */
    state: () => {
      const t = deck.transport;
      return {
        mode: t.mode,
        paused: t.paused,
        cue: t.cue,
        direction: t.direction,
        head: t.head,
        x: t.x,
        v: t.v,
        rate: t.rate,
        powered: t.powered,
        loaded: t.loaded,
        reverseMode: t.reverseMode,
        pitch: t.pitch,
        tape: deck.geometry.name,
        total: deck.geometry.total,
        cassette: deck.cassetteIndex,
        cassettes: deck.cassetteCount,
        faceUp: deck.faceUp,
        side: deck.sideLetter,
        inDeck: deck.inDeck,
        door: deck.door.angle,
        counter: deck.counter,
        counterText: deck.counterText,
        spot: deck.spot,
        heard: deck.heard,
        title: deck.title,
        currentTime: deck.currentTime,
        duration: deck.duration,
        engine: {
          state: deck.engine.state,
          playing: deck.engine.playing,
          cueing: deck.engine.isCueing,
          currentTime: deck.engine.currentTime,
          mode: deck.engine.mode,
          route: deck.engine.currentRoute,
        },
        nr: deck.nr,
        tapeType: deck.tapeType,
        condition: deck.condition,
        currentId: player.queue.currentId,
        queue: player.queue.ids.length,
      };
    },
    /** A named part's centre on the page, in CSS pixels; null without the 3D stage. */
    project: (name: string): [number, number] | null => {
      if (!stage) return null;
      const part = stage.world.deck.root.getObjectByName(name);
      if (!part) throw new Error(`no part ${name}`);
      const [x, y] = stage.world.project(part.getWorldPosition(new Vector3()));
      const rect = stage.canvas.getBoundingClientRect();
      return [rect.left + x, rect.top + y];
    },
    /** Puts the tape at a position (physical metres on the right reel), for checks that start mid-tape. */
    windTo: (x: number) => {
      deck.transport.x = Math.max(0, Math.min(deck.geometry.total, x));
    },
    /** The last `seconds` of output as mono samples, and the sample rate. */
    capture: (seconds: number): Promise<{ samples: number[]; sr: number }> =>
      new Promise((resolve, reject) => {
        if (!tap) {
          reject(new Error('no audio yet'));
          return;
        }
        const port = tap.port;
        port.onmessage = (event: MessageEvent<{ samples: Float32Array; sr: number }>) => {
          resolve({ samples: [...event.data.samples], sr: event.data.sr });
        };
        port.postMessage({ seconds });
      }),
    stats: () => stage?.world.stats() ?? null,
  };
  Object.assign(window, { __deck: api });
}
