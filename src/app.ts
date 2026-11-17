import '@fontsource-variable/inter';
import './style.css';
import './styles/stage.css';
import { DEFAULT_WOW_FLUTTER, NO_WOW_FLUTTER, type WowFlutterParams } from './audio/wowflutter';
import type { TapeChoice } from './core/program';
import type { ReverseMode } from './core/transport';
import type { Condition } from './core/wear';
import { Deck } from './deck';
import { Player } from './player';
import type { SwitchName } from './scene/deck/build';
import type { LabelContent } from './scene/materials/cassette-label';
import type { FinishName } from './scene/materials/deck-materials';
import { Stage } from './scene/stage';
import { DECK_SPEC, type NrMode, type TapeType } from './spec/deck';
import { bindChrome } from './ui/chrome';
import { bindColours } from './ui/colours';
import { applyCoverAccent } from './ui/cover';
import { Deck2D } from './ui/deck2d';
import { bindDesktop } from './ui/desktop';
import { byId, formatSigned, formatTime, setAttr, setText } from './ui/dom';
import { bindGraphicEq } from './ui/graphic-eq';
import { bindLibraryPanel } from './ui/library-panel';
import {
  bindMediaSession,
  showMediaMetadata,
  showPlaybackState,
  showPosition,
} from './ui/media-session';
import { Meters } from './ui/meters';
import { bindRecordInfo } from './ui/record-info';
import { parseSettings, type VisualizerStyle } from './ui/settings';
import {
  describeDeck,
  shortcutFor,
  type DeckDescription,
  type ShortcutAction,
} from './ui/shortcuts';
import { bindUpdateToast } from './ui/update-toast';
import {
  createBarsVisualizer,
  createLabelVisualizer,
  createScopeVisualizer,
  visualizerSupported,
  type LabelVisualizer,
} from './ui/visualizer';
import { readStored, writeStored } from './util/storage';

const SEEK_STEP_S = 5;
/** While the page is hidden the deck still runs: playback logic never waits for frames. */
const HIDDEN_TICK_MS = 250;
const VOLUME_STEP = 5;
const LABEL_INTERVAL_MS = 1000;
const SAVE_DECK_MS = 5000;

/** Phones and upright tablets: controls in a bottom sheet, camera pulled back (stage.css). */
const SHEET_LAYOUT = matchMedia(
  '(max-width: 760px), (orientation: portrait) and (max-width: 1100px)',
);

const deck = new Deck();
const query = new URLSearchParams(location.search);
const player = new Player(deck, query.has('demo'));
const canvas2d = byId<HTMLCanvasElement>('deck2d');
const sceneCanvas = byId<HTMLCanvasElement>('scene');
const pitch = byId<HTMLInputElement>('pitch');
const volume = byId<HTMLInputElement>('volume');
const selects = {
  tapeType: byId<HTMLSelectElement>('tape-type'),
  nr: byId<HTMLSelectElement>('nr'),
  reverse: byId<HTMLSelectElement>('reverse-mode'),
};

/** The 3D stage, or null without WebGL: then the 2D deck is shown with every control (fallback). */
function createStage(): Stage | null {
  // Asked on a canvas of its own: three.js logs an error if it finds out by itself.
  if (!document.createElement('canvas').getContext('webgl2')) return null;
  try {
    return new Stage(sceneCanvas, deck, {
      level: () => Number(volume.value) / 100,
      setLevel: (level) => {
        volume.value = String(Math.round(Math.max(0, Math.min(1, level)) * 100));
        applyVolume();
        saveSettings();
      },
      switchPosition: (name) => selects[name].selectedIndex,
      stepSwitch: (name) => stepSwitch(name),
    });
  } catch {
    return null;
  }
}
const stage = createStage();
document.body.classList.toggle('has-stage', stage !== null);
// With the stage, the 2D deck hides; its strip of twins stays.
(byId('plinth-box').querySelector('.deck-top') as HTMLElement).hidden = stage !== null;
sceneCanvas.hidden = stage === null;
const renderer = stage ? null : new Deck2D(canvas2d, deck);

/** A click on a switch on the model: one step along, back to the start after the last. */
function stepSwitch(name: SwitchName): void {
  const select = selects[name];
  select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

deck.events.on('mechanism', (sound) => deck.playMechanism(sound));

let appliedFinish: FinishName | null = null;
let labelColour = '#d8452b';
let labelInk = '#1a1208';
const status = byId<HTMLElement>('status');
const announcer = byId<HTMLElement>('announcer');
const timeCurrent = byId<HTMLElement>('time-current');
const timeTotal = byId<HTMLElement>('time-total');
const seek = byId<HTMLInputElement>('seek');
const SEEK_STEPS = Number(seek.max);

seek.addEventListener('input', () => {
  deck.seek((Number(seek.value) / SEEK_STEPS) * deck.duration);
});

const meters = new Meters(byId('meters'), deck.engine);
// The tutorial looks at what it talks about: the deck, the keys, the reverse, the counter.
const chrome = bindChrome(
  () => refreshColours(),
  (step) => {
    if (!stage || (step === 0 && stage.rig.introPlaying)) return;
    const tour = DECK_SPEC.camera.tour;
    const stops = [homeStop(), tour[2], tour[0], tour[1]];
    stage.rig.goTo(step < 0 ? homeStop() : (stops[step] ?? homeStop()));
  },
);
// Focus mode moves the camera to the control view, and back out to the hero view.
let inFocus = false;
new MutationObserver(() => {
  const focus = document.body.classList.contains('focus-mode');
  if (focus === inFocus) return;
  inFocus = focus;
  byId('app').classList.toggle('focus', focus);
  resizeStage();
  stage?.rig.goTo(focus ? DECK_SPEC.camera.control : homeStop());
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
bindColours(() => refreshColours());

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function applyReducedMotion(): void {
  if (renderer) renderer.reducedMotion = reducedMotion.matches;
  deck.reducedMotion = reducedMotion.matches;
  if (stage) stage.rig.calm = reducedMotion.matches;
  meters.reducedMotion = reducedMotion.matches;
}
reducedMotion.addEventListener('change', applyReducedMotion);
applyReducedMotion();

function announce(message: string): void {
  // Clearing first makes screen readers repeat an identical message.
  announcer.textContent = '';
  requestAnimationFrame(() => setText(announcer, message));
}

deck.events.on('status', (message) => setText(status, message));
deck.events.on('announce', announce);
player.events.on('status', (message) => setText(status, message));
player.events.on('announce', announce);
player.events.on('storage', (answer) => setText(byId('storage-note'), answer));
player.events.on('track', (track) => {
  showMediaMetadata(track);
  void applyCoverAccent(track?.coverBlob).then(() => refreshColours());
  if (track) announce(`Now playing: ${track.tags.title}.`);
});
player.events.on('change', () => void refreshCovers());

bindLibraryPanel(player, announce);
// The ♫ twin of the Visualizer setting: one press, the next style that this browser can draw.
byId('viz-step').addEventListener('click', () => {
  const options = [...visualizerSelect.options].filter((option) => !option.disabled);
  const at = options.findIndex((option) => option.value === visualizerSelect.value);
  visualizerSelect.value = options[(at + 1) % options.length]?.value ?? 'off';
  visualizerSelect.dispatchEvent(new Event('change', { bubbles: true }));
});
bindRecordInfo(player);
bindMediaSession({
  play: () => deck.play(),
  pause: () => deck.pause(),
  previous: () => player.previous(),
  next: () => player.next(),
  seekTo: (seconds) => deck.seek(seconds),
  seekBy: (seconds) => deck.seek(Math.max(0, Math.min(deck.duration, deck.currentTime + seconds))),
});
const demo = query.has('demo');
void player.start().then(() => {
  // `?demo` plays beside the library and leaves the saved tape position alone.
  if (!demo) deck.restoreState(readStored('deck'));
});
const saveDeck = (): void => {
  if (!demo) writeStored('deck', deck.saveState());
};
bindUpdateToast();

// ─── The transport's twins ─────────────────────────────────────────
byId('power').addEventListener('click', () => deck.togglePower());
byId('play').addEventListener('click', () => deck.play());
byId('stop').addEventListener('click', () => deck.stopOrEject());
byId('pause').addEventListener('click', () => deck.pause());
byId('reverse').addEventListener('click', () => deck.reverse());
byId('counter-reset').addEventListener('click', () => deck.resetCounter());
byId('eject').addEventListener('click', () => deck.eject());
byId('cassette-out').addEventListener('click', () => {
  if (deck.door.closed) deck.eject();
  setTimeout(() => deck.toggleCassette(), deck.reducedMotion ? 0 : 700);
});
byId('turn-over').addEventListener('click', () => void turnOver());

/** Out of the door, turned over in the hand, back in, door shut: what a person does. */
async function turnOver(): Promise<void> {
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, deck.reducedMotion ? 0 : ms));
  if (deck.inDeck) {
    if (deck.door.closed) {
      deck.eject();
      await wait(750);
    }
    deck.toggleCassette();
    await wait(250);
  }
  deck.flip();
  await wait(700);
  if (deck.door.closed) {
    deck.eject();
    await wait(750);
  }
  deck.toggleCassette();
  await wait(300);
  deck.eject();
}

/** Rewind and fast forward are held: during play they cue or review until let go. */
for (const [id, direction] of [
  ['rew', -1],
  ['ff', 1],
] as const) {
  const button = byId<HTMLButtonElement>(id);
  let down = false;
  const release = (): void => {
    if (!down) return;
    down = false;
    deck.windKey(direction, false);
  };
  button.addEventListener('pointerdown', (event) => {
    down = true;
    deck.windKey(direction, true);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the key still goes down, and up on leave.
    }
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
  // A keyboard click (Enter or Space on the button): a tap, which winds or briefly cues.
  button.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    deck.windKey(direction, true);
    setTimeout(() => deck.windKey(direction, false), 600);
  });
}

// ─── Settings ──────────────────────────────────────────────────────
const toneSliders = {
  bass: byId<HTMLInputElement>('bass'),
  mid: byId<HTMLInputElement>('mid'),
  treble: byId<HTMLInputElement>('treble'),
};
const hiss = byId<HTMLInputElement>('hiss');
const wowFlutter = byId<HTMLInputElement>('wow-flutter');
const imperfection = byId<HTMLInputElement>('imperfection');
const tapeChoice = byId<HTMLSelectElement>('tape');
const cassetteType = byId<HTMLSelectElement>('cassette-type');
const recordedNr = byId<HTMLSelectElement>('recorded-nr');
const condition = byId<HTMLSelectElement>('condition');
const effects = byId<HTMLInputElement>('effects');
const windToTrack = byId<HTMLInputElement>('wind-to-track');
const backgroundCheck = byId<HTMLInputElement>('background');
const visualizerSelect = byId<HTMLSelectElement>('visualizer');
const restored = parseSettings(readStored('settings'));
pitch.value = String(restored.pitch);
volume.value = String(restored.volume);
hiss.value = String(restored.hiss);
selects.tapeType.value = restored.tapeType;
selects.nr.value = restored.nr;
selects.reverse.value = restored.reverseMode;
tapeChoice.value = restored.tape;
cassetteType.value = restored.cassetteType;
recordedNr.value = restored.recordedNr;
condition.value = restored.condition;
for (const key of ['bass', 'mid', 'treble'] as const)
  toneSliders[key].value = String(restored[key]);
wowFlutter.checked = restored.wowFlutter;
imperfection.value = String(restored.imperfection);
visualizerSelect.value = restored.visualizer;
effects.checked = restored.effects;
windToTrack.checked = restored.windToTrack;
// Unset means automatic: on for touch devices, where a locked phone should keep playing.
backgroundCheck.checked =
  restored.background ?? matchMedia('(hover: none) and (pointer: coarse)').matches;
let backgroundChosen = restored.background !== null;
backgroundCheck.addEventListener('change', () => {
  backgroundChosen = true;
  deck.engine.setBackground(backgroundCheck.checked);
});
const graphicEq = bindGraphicEq(
  parseSettings({ graphicEq: readStored('eq') }).graphicEq,
  (eq) => {
    deck.setGraphicEq(eq);
    writeStored('eq', eq);
  },
  (message) => setText(status, message),
);
deck.setGraphicEq(graphicEq());

function saveSettings(): void {
  writeStored(
    'settings',
    parseSettings({
      pitch: Number(pitch.value),
      volume: Number(volume.value),
      hiss: Number(hiss.value),
      tapeType: selects.tapeType.value,
      nr: selects.nr.value,
      reverseMode: selects.reverse.value,
      cassetteType: cassetteType.value,
      recordedNr: recordedNr.value,
      tape: tapeChoice.value,
      condition: condition.value,
      bass: Number(toneSliders.bass.value),
      mid: Number(toneSliders.mid.value),
      treble: Number(toneSliders.treble.value),
      wowFlutter: wowFlutter.checked,
      imperfection: Number(imperfection.value),
      visualizer: visualizerSelect.value,
      effects: effects.checked,
      windToTrack: windToTrack.checked,
      background: backgroundChosen ? backgroundCheck.checked : null,
    }),
  );
}
byId('settings').addEventListener('change', saveSettings);
byId('deck-settings').addEventListener('change', saveSettings);

/** The deck's switches and the cassette's nature follow their controls. */
function applyTape(): void {
  deck.setSwitches({
    tapeType: selects.tapeType.value as TapeType,
    nr: selects.nr.value as NrMode,
    cassetteType: cassetteType.value as TapeType,
    recordedNr: recordedNr.value as NrMode,
    condition: condition.value as Condition,
    hiss: Number(hiss.value),
  });
  deck.setReverseMode(selects.reverse.value as ReverseMode);
  setText(byId('hiss-value'), hiss.value);
  setAttr(hiss, 'aria-valuetext', `${hiss.value} percent`);
}
for (const element of [
  selects.tapeType,
  selects.nr,
  selects.reverse,
  cassetteType,
  recordedNr,
  condition,
]) {
  element.addEventListener('change', applyTape);
}
hiss.addEventListener('input', applyTape);
applyTape();
tapeChoice.addEventListener('change', () => {
  deck.rebuild(tapeChoice.value as TapeChoice);
  // The list's side badges follow the new layout.
  player.events.emit('change', undefined);
});
deck.program.choice = tapeChoice.value as TapeChoice;

function applyOptions(): void {
  deck.setOptions({ effects: effects.checked, windToTrack: windToTrack.checked });
  deck.engine.setBackground(backgroundCheck.checked);
}
effects.addEventListener('change', applyOptions);
windToTrack.addEventListener('change', applyOptions);
applyOptions();

function applyPitch(): void {
  const percent = deck.setPitch(Number(pitch.value));
  pitch.value = String(percent);
  setText(byId('pitch-value'), `${formatSigned(percent)} %`);
  setAttr(pitch, 'aria-valuetext', `${formatSigned(percent).replace('−', 'minus ')} percent`);
}
pitch.addEventListener('input', applyPitch);
pitch.addEventListener('change', saveSettings);
pitch.addEventListener('dblclick', () => {
  pitch.value = '0';
  applyPitch();
  saveSettings();
});
applyPitch();

function applyVolume(): void {
  deck.engine.setVolume(Number(volume.value) / 100);
  setText(byId('volume-value'), volume.value);
  setAttr(volume, 'aria-valuetext', `${volume.value} percent`);
}
volume.addEventListener('input', applyVolume);
applyVolume();

function applyTone(): void {
  for (const [key, slider] of Object.entries(toneSliders)) {
    const text = `${formatSigned(Number(slider.value)).replace('.0', '')} dB`;
    setText(byId(`${key}-value`), text);
    setAttr(slider, 'aria-valuetext', text.replace('−', 'minus ').replace('dB', 'decibels'));
  }
  deck.setTone({
    bass: Number(toneSliders.bass.value),
    mid: Number(toneSliders.mid.value),
    treble: Number(toneSliders.treble.value),
  });
}
for (const slider of Object.values(toneSliders)) slider.addEventListener('input', applyTone);
applyTone();

/** The deck's own wow and flutter, scaled by Imperfection: 0.5 is the specification. */
function wowFlutterFor(on: boolean, amount: number): WowFlutterParams {
  if (!on) return NO_WOW_FLUTTER;
  const spec = DECK_SPEC.wowFlutter;
  const scale = Math.max(0, Math.min(1, amount)) / 0.5;
  return {
    ...DEFAULT_WOW_FLUTTER,
    wowHz: spec.wowHz,
    flutterHz: spec.flutterHz,
    wowDepth: spec.wowDepth * scale,
    flutterDepth: spec.flutterDepth * scale,
  };
}
function applyWowFlutter(): void {
  deck.engine.setWowFlutter(wowFlutterFor(wowFlutter.checked, Number(imperfection.value)));
  const percent = Math.round(Number(imperfection.value) * 100);
  setText(byId('imperfection-value'), `${percent} %`);
  setAttr(imperfection, 'aria-valuetext', `${percent} percent`);
}
wowFlutter.addEventListener('change', applyWowFlutter);
imperfection.addEventListener('input', applyWowFlutter);
applyWowFlutter();

// ─── Visualizer ────────────────────────────────────────────────────
// A style is in the map once it has been asked for; its value arrives when it has loaded.
const visualizers = new Map<VisualizerStyle, LabelVisualizer | null>();

/** Butterchurn needs WebGL 2 and may still refuse a browser; the bars only need a canvas. */
function dropMilkdrop(): void {
  const option = visualizerSelect.querySelector<HTMLOptionElement>('option[value="milkdrop"]');
  if (option) option.disabled = true;
  if (visualizerSelect.value === 'milkdrop') visualizerSelect.value = 'bars';
}
if (!visualizerSupported()) dropMilkdrop();

/** The visualizer's canvas with a fresh frame on it, or null while the written label shows. */
function visualizerFrame(): HTMLCanvasElement | null {
  const style = visualizerSelect.value as VisualizerStyle;
  if (style === 'off' || reducedMotion.matches || !deck.playing) return null;
  if (!visualizers.has(style)) {
    visualizers.set(style, null);
    void deck.engine
      .init()
      .then(({ ctx, gain }) => {
        if (style === 'milkdrop') return createLabelVisualizer(ctx, gain);
        if (style === 'bars') return createBarsVisualizer(ctx, gain);
        return createScopeVisualizer(style, ctx, gain);
      })
      .then((created) => visualizers.set(style, created))
      .catch(() => {
        if (style === 'milkdrop') {
          dropMilkdrop();
          setText(status, 'MilkDrop is not available in this browser.');
        } else {
          visualizerSelect.value = 'off';
          setText(status, 'This visualizer is not available in this browser.');
        }
      });
  }
  const visualizer = visualizers.get(style);
  if (!visualizer) return null;
  visualizer.render();
  return visualizer.canvas;
}

// ─── Keyboard ──────────────────────────────────────────────────────
function runShortcut(action: ShortcutAction): void {
  const nudgeVolume = (delta: number): void => {
    volume.value = String(Number(volume.value) + delta);
    applyVolume();
    saveSettings();
  };
  switch (action) {
    case 'play':
      return deck.togglePlay();
    case 'stop':
      return deck.stopOrEject();
    case 'rewind':
      return deck.windKey(-1, true);
    case 'fastForward':
      return deck.windKey(1, true);
    case 'eject':
      return deck.eject();
    case 'reverse':
      return deck.reverse();
    case 'power':
      return deck.togglePower();
    case 'counterReset':
      return deck.resetCounter();
    case 'nextTrack':
      return player.next();
    case 'previousTrack':
      return player.previous();
    case 'seekBack':
      return deck.seek(deck.currentTime - SEEK_STEP_S);
    case 'seekForward':
      return deck.seek(deck.currentTime + SEEK_STEP_S);
    case 'volumeUp':
      return nudgeVolume(VOLUME_STEP);
    case 'volumeDown':
      return nudgeVolume(-VOLUME_STEP);
    case 'shuffle':
      return byId('shuffle').click();
    case 'repeat':
      return byId('repeat').click();
    case 'focus':
      return chrome.toggleFocusMode();
    case 'help':
      return chrome.openShortcuts();
    case 'tour':
      return nextTourStop();
    case 'escape':
      if (tourStop >= 0) return endTour();
      chrome.escape();
  }
}

document.addEventListener('keydown', (event) => {
  // An open modal dialog owns the keyboard, including Escape.
  if (document.querySelector('dialog:modal')) return;
  const target = event.target instanceof HTMLElement ? event.target : document.body;
  const action = shortcutFor({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    inFormField: target.matches('input, select, textarea') || target.isContentEditable,
    // Safari does not focus a button on click, so the open desktop answers for its own buttons.
    onButton: target.matches('button, summary') || !byId('desktop').hidden,
  });
  if (!action) return;
  if (action !== 'escape') event.preventDefault();
  // A held key repeats: the wind keys stay down until it is let go.
  if (event.repeat && (action === 'rewind' || action === 'fastForward')) return;
  runShortcut(action);
});
document.addEventListener('keyup', (event) => {
  if (event.key === '[') deck.windKey(-1, false);
  if (event.key === ']') deck.windKey(1, false);
});

// ─── The page follows the deck ─────────────────────────────────────
let labelUpdatedAt = 0;
let positionClock = 0;
const pressed = (id: string, on: boolean): void => setAttr(byId(id), 'aria-pressed', String(on));

function deckState(): DeckDescription['state'] {
  const t = deck.transport;
  if (!t.powered) return 'off';
  if (!deck.door.closed) return 'open';
  if (!deck.inDeck) return 'empty';
  if (t.mode === 'wind') return 'winding';
  if (t.mode === 'play') return t.paused ? 'paused' : t.cue !== 0 ? 'cueing' : 'playing';
  return 'stopped';
}

function syncUi(): void {
  const t = deck.transport;
  if (performance.now() - positionClock > 1000) {
    positionClock = performance.now();
    showPosition(deck.duration, deck.currentTime, 1 + t.pitch);
  }
  showPlaybackState(deck.playing);
  pressed('power', t.powered);
  byId('power-led').classList.toggle('is-on', t.powered);
  pressed('play', t.mode === 'play');
  pressed('pause', t.mode === 'play' && t.paused);
  pressed('ff', deck.keyDown('ff'));
  pressed('rew', deck.keyDown('rew'));
  pressed('eject', !deck.door.closed);
  pressed('cassette-out', !deck.inDeck);
  setText(byId('side-letter'), deck.sideLetter);
  setText(byId('counter'), deck.counterText);
  setText(timeCurrent, formatTime(deck.currentTime));
  setText(timeTotal, formatTime(deck.duration));
  const duration = deck.duration;
  seek.disabled = duration <= 0;
  if (!seek.matches(':active') && duration > 0) {
    seek.value = String(Math.round((deck.currentTime / duration) * SEEK_STEPS));
  }
  setAttr(seek, 'aria-valuetext', `${formatTime(deck.currentTime)} of ${formatTime(duration)}`);
  // Screen readers re-read a changed label, so refresh it at most once a second.
  const now = performance.now();
  if (now - labelUpdatedAt < LABEL_INTERVAL_MS) return;
  labelUpdatedAt = now;
  const description = describeDeck({
    title: deck.title,
    state: deckState(),
    side: deck.sideLetter,
    timeText: formatTime(deck.currentTime),
    durationText: formatTime(deck.duration),
    counter: deck.counterText,
  });
  setAttr(sceneCanvas, 'aria-label', description);
  setAttr(canvas2d, 'aria-label', description);
}

// ─── The tour: four close-ups, stepped with T or the caption's button ──
let tourStop = -1;
const tourCaption = byId<HTMLElement>('tour-caption');
function nextTourStop(): void {
  if (!stage) return;
  const stops = DECK_SPEC.camera.tour;
  tourStop = (tourStop + 1) % (stops.length + 1);
  if (tourStop === stops.length) return endTour();
  const stop = stops[tourStop]!;
  stage.rig.goTo(stop, 2);
  tourCaption.hidden = false;
  setText(
    tourCaption,
    `Tour ${tourStop + 1} of ${stops.length}: ${stop.name}. Press T for the next, Esc to leave.`,
  );
}
function endTour(): void {
  tourStop = -1;
  tourCaption.hidden = true;
  stage?.rig.goTo(homeStop());
}
byId('open-tour').addEventListener('click', () => {
  (byId('help-menu') as HTMLDetailsElement).open = false;
  nextTourStop();
});

// ─── The labels: the tracks of each side written in ────────────────
/** Each side's cover, decoded once per image: a track's own art or the page's dropped cover. */
const covers = new Map<Blob, ImageBitmap | null>();
let coverVersion = 0;

function sideCover(face: 0 | 1): Blob | undefined {
  const first = deck.program.side(deck.cassetteIndex, face).segments[0];
  const id = first ? player.queue.ids[first.idx] : undefined;
  return id ? player.coverOf(player.tracks.get(id) ?? null) : undefined;
}

async function refreshCovers(): Promise<void> {
  for (const face of [0, 1] as const) {
    const blob = sideCover(face);
    if (!blob || covers.has(blob)) continue;
    covers.set(blob, null);
    covers.set(blob, await createImageBitmap(blob).catch(() => null));
    coverVersion++;
  }
}
player.events.on('track', () => void refreshCovers());

const TYPE_TEXT: Record<TapeType, string> = {
  I: 'TYPE I · NORMAL',
  II: 'TYPE II · HIGH (CrO₂)',
  IV: 'TYPE IV · METAL',
};

function labelFor(face: 0 | 1): LabelContent {
  const side = deck.program.side(deck.cassetteIndex, face);
  const tracks = side.segments.map((s) => player.tracks.get(player.queue.ids[s.idx] ?? ''));
  const first = tracks[0];
  const artists = new Set(tracks.map((t) => t?.tags.artist).filter(Boolean));
  const heading =
    artists.size === 1 && first?.tags.artist
      ? [first.tags.artist, first.tags.album].filter(Boolean).join(' · ')
      : tracks.length > 0
        ? 'Mixtape'
        : '';
  const cassette = deck.program.cassettes[deck.cassetteIndex];
  const many =
    deck.program.cassettes.length > 1
      ? ` · ${deck.cassetteIndex + 1}/${deck.program.cassettes.length}`
      : '';
  const cover = sideCover(face);
  return {
    side: deck.program.letter(face),
    heading: heading + many,
    tracks: tracks.map((t) => t?.tags.title ?? ''),
    tape: cassette?.tape ?? 'C60',
    type: TYPE_TEXT[cassetteType.value as TapeType],
    nr: recordedNr.value === 'off' ? '' : `NR ${recordedNr.value}`,
    colour: labelColour,
    ink: labelInk,
    cover: (cover && covers.get(cover)) ?? null,
    coverVersion,
  };
}

/** Page mode and finish select the scene's lighting and finish (materials, not CSS). */
function applyLook(): void {
  if (!stage) return;
  const root = document.documentElement;
  const mode =
    root.dataset.mode ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const lighting = mode === 'light' ? 'daylight' : 'dusk';
  if (stage.world.lighting.preset !== lighting) stage.world.setLighting(lighting);
  const finish = (root.dataset.plinth ?? 'silver') as FinishName;
  const app = byId('app');
  app.classList.toggle('theme-wood', finish === 'walnut');
  if (finish in DECK_SPEC.finishes && finish !== appliedFinish) {
    appliedFinish = finish;
    stage.world.setFinish(finish);
  }
  // A custom background colour is set inline on the root; it paints the wall.
  const wall = root.style.getPropertyValue('--bg').trim();
  stage.world.lighting.setWallColour(wall || null);
}

function refreshColours(): void {
  renderer?.refreshColors();
  applyLook();
  const style = getComputedStyle(document.documentElement);
  labelColour = style.getPropertyValue('--label').trim() || labelColour;
  labelInk = style.getPropertyValue('--label-ink').trim() || labelInk;
}

let frame = 0;
let last = performance.now();
let hiddenTimer = 0;

/** The rectangle the floating panels leave open (viewport px), for framing the deck. */
function freeArea(): { left: number; top: number; right: number; bottom: number } {
  const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
  const drawer = document.querySelector('.controls')?.getBoundingClientRect();
  const strip = document.querySelector('.deck .strip')?.getBoundingClientRect();
  const narrow = SHEET_LAYOUT.matches;
  return {
    left: 0,
    top: topbar && !document.body.classList.contains('focus-mode') ? topbar.bottom : 0,
    right:
      drawer && !narrow && !document.body.classList.contains('focus-mode')
        ? drawer.left
        : innerWidth,
    bottom: Math.min(strip?.top ?? innerHeight, narrow && drawer ? drawer.top : innerHeight),
  };
}

/** Where the camera rests: pulled back on narrow screens. */
function homeStop(): (typeof DECK_SPEC.camera)['hero' | 'mobile'] {
  return SHEET_LAYOUT.matches ? DECK_SPEC.camera.mobile : DECK_SPEC.camera.hero;
}
let wasNarrow: boolean | null = null;

function resizeStage(): void {
  stage?.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1), freeArea());
  const narrow = SHEET_LAYOUT.matches;
  if (stage && narrow !== wasNarrow) {
    stage.rig.home = homeStop();
    if (!stage.rig.introPlaying) stage.rig.goTo(homeStop(), wasNarrow === null ? 0 : 1.2);
  }
  wasNarrow = narrow;
}
addEventListener('resize', resizeStage);
resizeStage();

function loop(timestamp: number): void {
  // Up to a quarter second: slow frames (software rendering) must not slow the animations down.
  const dt = Math.max(0, Math.min((timestamp - last) / 1000, 0.25));
  last = timestamp;
  deck.tick(dt);
  const live = visualizerFrame();
  if (stage) {
    stage.frame(dt, timestamp / 1000, [labelFor(0), labelFor(1)], live);
  } else if (renderer) {
    renderer.labelSource = live;
    renderer.update();
  }
  meters.update(dt);
  syncUi();
  frame = requestAnimationFrame(loop);
}

function startLoop(): void {
  cancelAnimationFrame(frame);
  clearInterval(hiddenTimer);
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    saveDeck();
    let previous = performance.now();
    hiddenTimer = window.setInterval(() => {
      const now = performance.now();
      deck.tick((now - previous) / 1000);
      previous = now;
    }, HIDDEN_TICK_MS);
  } else startLoop();
});
addEventListener('pagehide', saveDeck);
setInterval(saveDeck, SAVE_DECK_MS);
if (
  stage &&
  !reducedMotion.matches &&
  sessionStorage.getItem('ultra-cassette.intro-seen') === null
) {
  stage.rig.playIntro();
  try {
    sessionStorage.setItem('ultra-cassette.intro-seen', '1');
  } catch {
    // Storage refused: the intro may play again next time, which is harmless.
  }
}
stage?.world.warmUp();
refreshColours();
startLoop();

const redrawDesktop = bindDesktop({
  toggle: byId<HTMLButtonElement>('desktop-toggle'),
  overlay: byId('desktop'),
  entries: () =>
    player.queue.ids.flatMap((id) => {
      const track = player.tracks.get(id);
      return track
        ? [
            {
              id,
              title: track.tags.title,
              artist: track.tags.artist,
              album: track.tags.album,
              durationSec: track.durationSec,
            },
          ]
        : [];
    }),
  play: (id) => player.select(id, true),
});
player.events.on('change', redrawDesktop);

// `?debug`: the deck's state for the browser checks (src/debug/deck-api.ts).
if (query.has('debug')) {
  void import('./debug/deck-api').then((m) => m.exposeDeck(deck, player, stage));
}
if (query.has('selftest')) {
  void import('./selftest').then((m) => {
    // eslint-disable-next-line no-console
    console.log(m.selfTest() ? 'selftest ok' : 'selftest FAILED');
  });
}
