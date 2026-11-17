export type ShortcutAction =
  | 'play'
  | 'stop'
  | 'rewind'
  | 'fastForward'
  | 'eject'
  | 'reverse'
  | 'power'
  | 'counterReset'
  | 'nextTrack'
  | 'previousTrack'
  | 'seekBack'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'shuffle'
  | 'repeat'
  | 'focus'
  | 'help'
  | 'tour'
  | 'escape';

export interface KeyContext {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Focus is in an input, select, textarea or editable element. */
  inFormField: boolean;
  /** Focus is on a button, which handles Space itself. */
  onButton: boolean;
}

/** One row per shortcut, shown in the shortcuts dialog. */
export const SHORTCUT_HELP: readonly (readonly [keys: string, description: string])[] = [
  ['Space', 'Play, or pause while playing'],
  ['X', 'Stop'],
  ['[ / ]', 'Rewind or fast forward; hold during play to review or cue'],
  ['B / N', 'Music search: back to the previous track, on to the next'],
  ['V', 'Reverse: play the other side'],
  ['E', 'Eject, or close the door'],
  ['P', 'Power on or off'],
  ['0', 'Reset the counter'],
  ['← / →', 'Jump 5 seconds back or forward'],
  ['↑ / ↓', 'Volume up or down'],
  ['S', 'Shuffle'],
  ['R', 'Repeat mode'],
  ['F', 'Focus mode'],
  ['T', 'Tour: the next of four close-ups of the deck'],
  ['Esc', 'Leave the tour or focus mode, or close a dialog'],
  ['?', 'Show this list'],
  ['Alt + ↑ / ↓ on a track', 'Reorder the queue'],
];

const KEYS: Readonly<Record<string, ShortcutAction>> = {
  x: 'stop',
  '[': 'rewind',
  ']': 'fastForward',
  b: 'previousTrack',
  n: 'nextTrack',
  v: 'reverse',
  e: 'eject',
  p: 'power',
  '0': 'counterReset',
  s: 'shuffle',
  r: 'repeat',
  f: 'focus',
  t: 'tour',
};

/** Maps a key press to an action, or null when the key should be left alone. */
export function shortcutFor(context: KeyContext): ShortcutAction | null {
  if (context.ctrlKey || context.metaKey || context.altKey) return null;
  if (context.key === 'Escape') return 'escape';
  if (context.inFormField) return null;
  switch (context.key) {
    case ' ':
      return context.onButton ? null : 'play';
    case 'ArrowLeft':
      return 'seekBack';
    case 'ArrowRight':
      return 'seekForward';
    case 'ArrowUp':
      return 'volumeUp';
    case 'ArrowDown':
      return 'volumeDown';
    case '?':
      return 'help';
    default:
      return KEYS[context.key.toLowerCase()] ?? null;
  }
}

export interface DeckDescription {
  title: string;
  state: 'empty' | 'open' | 'stopped' | 'playing' | 'paused' | 'winding' | 'cueing' | 'off';
  side: 'A' | 'B';
  timeText: string;
  durationText: string;
  counter: string;
}

const STATE_TEXT: Record<DeckDescription['state'], string> = {
  empty: 'No cassette',
  open: 'Door open',
  stopped: 'Stopped',
  playing: 'Playing',
  paused: 'Paused',
  winding: 'Winding',
  cueing: 'Cueing',
  off: 'Power off',
};

/** Text alternative for the deck canvas. */
export function describeDeck(deck: DeckDescription): string {
  const tape = deck.title ? `Track: ${deck.title}` : 'No track under the head';
  const position =
    deck.state === 'playing' || deck.state === 'paused'
      ? `, ${deck.timeText} of ${deck.durationText}`
      : '';
  return `Cassette deck. ${STATE_TEXT[deck.state]}, side ${deck.side}${position}. ${tape}. Counter ${deck.counter}.`;
}
