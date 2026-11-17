import { Box3, Vector3 } from 'three';
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
        camera: stage ? stage.world.camera.position.toArray() : null,
        inRoom: stage?.rig.insideRoom ?? null,
        queue: player.queue.ids.length,
      };
    },
    /** A point of a named part on the page, in CSS pixels; null without the 3D stage. */
    project: (
      name: string,
      at: [number, number, number] = [0.5, 0.5, 0.5],
    ): [number, number] | null => {
      if (!stage) return null;
      const part = stage.world.deck.root.getObjectByName(name);
      if (!part) throw new Error(`no part ${name}`);
      // The middle of what is drawn, not the part's origin (a door's origin is its hinge).
      // `at` picks a point inside its box by fractions (0.5 everywhere is the middle).
      const box = new Box3().setFromObject(part);
      const size = box.getSize(new Vector3());
      const point = box.min.clone().add(size.multiply(new Vector3(...at)));
      const [x, y] = stage.world.project(point);
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
    /** The label visualizer: styles on offer, the one live on a label, and its colours. */
    Viz: {
      modes: () =>
        [...(document.getElementById('visualizer') as HTMLSelectElement).options]
          .filter((o) => !o.disabled)
          .map((o) => o.value),
      live: () =>
        stage?.labels.some((label) => label.isLive)
          ? (document.getElementById('visualizer') as HTMLSelectElement).value
          : null,
      colours: () => {
        const source = stage?.labels.find((label) => label.isLive)?.source;
        const ctx = source?.getContext('2d');
        if (!source || !ctx) return 0;
        const data = ctx.getImageData(0, 0, source.width, source.height).data;
        const seen = new Set<number>();
        for (let i = 0; i < data.length; i += 4)
          seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
        return seen.size;
      },
    },
  };
  Object.assign(window, { __deck: api });
}
