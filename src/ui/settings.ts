import { clampTone } from '../audio/mix';
import { FLAT_EQ, parseGraphicEq, type GraphicEq } from '../audio/winamp-eq';
import { CONDITIONS, type Condition } from '../core/wear';
import type { TapeChoice } from '../core/program';
import type { ReverseMode } from '../core/transport';
import { DECK_SPEC, type NrMode, type TapeType } from '../spec/deck';

/** What the cassette's label window shows while it plays. */
export const VISUALIZER_STYLES = [
  'off',
  'milkdrop',
  'bars',
  'lines',
  'scope',
  'spectrogram',
  'radial',
] as const;
export type VisualizerStyle = (typeof VISUALIZER_STYLES)[number];

export const TAPE_TYPES = ['I', 'II', 'IV'] as const satisfies readonly TapeType[];
export const NR_MODES = ['off', 'B', 'C'] as const satisfies readonly NrMode[];
export const REVERSE_MODES = ['one', 'both', 'loop'] as const satisfies readonly ReverseMode[];
export const TAPE_CHOICES = [
  'auto',
  'C46',
  'C60',
  'C90',
  'C120',
] as const satisfies readonly TapeChoice[];
export const CONDITION_NAMES = Object.keys(CONDITIONS) as Condition[];

/** The deck settings remembered between visits, in the units the controls use. */
export interface Settings {
  /** Percent, ±DECK_SPEC.transport.pitchPercent. */
  pitch: number;
  /** 0 to 100. */
  volume: number;
  /** Hiss control, 0 to 100; 50 is the tape's own hiss. */
  hiss: number;
  /** The deck's switches. */
  tapeType: TapeType;
  nr: NrMode;
  reverseMode: ReverseMode;
  /** The cassette: what it is and how it was recorded. */
  cassetteType: TapeType;
  recordedNr: NrMode;
  tape: TapeChoice;
  condition: Condition;
  /** Tone controls in dB, -12 to 12. */
  bass: number;
  mid: number;
  treble: number;
  wowFlutter: boolean;
  /** Wow, flutter and crinkle depth, 0 to 1; 0.5 is the deck's specification. */
  imperfection: number;
  visualizer: VisualizerStyle;
  graphicEq: GraphicEq;
  /** Mechanical sounds: keys, solenoid, door, wind. */
  effects: boolean;
  /** A track chosen in the library is wound to, rather than jumped to. */
  windToTrack: boolean;
  /** Route the sound through a media element so a locked phone keeps playing; null = automatic. */
  background: boolean | null;
}

export const DEFAULT_SETTINGS: Settings = {
  pitch: 0,
  volume: 80,
  hiss: 50,
  tapeType: 'II',
  nr: 'B',
  reverseMode: 'both',
  cassetteType: 'II',
  recordedNr: 'B',
  tape: 'auto',
  condition: 'good',
  bass: 0,
  mid: 0,
  treble: 0,
  wowFlutter: true,
  imperfection: 0.5,
  visualizer: 'off',
  graphicEq: FLAT_EQ,
  effects: true,
  windToTrack: true,
  background: null,
};

const MAX_PITCH = DECK_SPEC.transport.pitchPercent;

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/**
 * Builds valid settings from stored data. Storage can hold anything (an older
 * version's shape, a hand-edited value), so every field is checked and falls
 * back to its default on its own.
 */
export function parseSettings(raw: unknown): Settings {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    pitch: numberIn(stored.pitch, -MAX_PITCH, MAX_PITCH, d.pitch),
    volume: numberIn(stored.volume, 0, 100, d.volume),
    hiss: numberIn(stored.hiss, 0, 100, d.hiss),
    tapeType: oneOf(TAPE_TYPES, stored.tapeType, d.tapeType),
    nr: oneOf(NR_MODES, stored.nr, d.nr),
    reverseMode: oneOf(REVERSE_MODES, stored.reverseMode, d.reverseMode),
    cassetteType: oneOf(TAPE_TYPES, stored.cassetteType, d.cassetteType),
    recordedNr: oneOf(NR_MODES, stored.recordedNr, d.recordedNr),
    tape: oneOf(TAPE_CHOICES, stored.tape, d.tape),
    condition: oneOf(CONDITION_NAMES, stored.condition, d.condition),
    bass: typeof stored.bass === 'number' ? clampTone(stored.bass) : d.bass,
    mid: typeof stored.mid === 'number' ? clampTone(stored.mid) : d.mid,
    treble: typeof stored.treble === 'number' ? clampTone(stored.treble) : d.treble,
    wowFlutter: flag(stored.wowFlutter, d.wowFlutter),
    imperfection: numberIn(stored.imperfection, 0, 1, d.imperfection),
    visualizer: oneOf(VISUALIZER_STYLES, stored.visualizer, d.visualizer),
    graphicEq: parseGraphicEq(stored.graphicEq),
    effects: flag(stored.effects, d.effects),
    windToTrack: flag(stored.windToTrack, d.windToTrack),
    background: typeof stored.background === 'boolean' ? stored.background : null,
  };
}
