import { describe, expect, it } from 'vitest';
import { SHORTCUT_HELP, describeDeck, shortcutFor, type KeyContext } from '../src/ui/shortcuts';

function press(key: string, patch: Partial<KeyContext> = {}): ReturnType<typeof shortcutFor> {
  return shortcutFor({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    inFormField: false,
    onButton: false,
    ...patch,
  });
}

describe('shortcutFor', () => {
  it.each([
    [' ', 'play'],
    ['x', 'stop'],
    ['X', 'stop'],
    ['[', 'rewind'],
    [']', 'fastForward'],
    ['b', 'previousTrack'],
    ['n', 'nextTrack'],
    ['v', 'reverse'],
    ['e', 'eject'],
    ['p', 'power'],
    ['0', 'counterReset'],
    ['ArrowLeft', 'seekBack'],
    ['ArrowRight', 'seekForward'],
    ['ArrowUp', 'volumeUp'],
    ['ArrowDown', 'volumeDown'],
    ['s', 'shuffle'],
    ['r', 'repeat'],
    ['f', 'focus'],
    ['t', 'tour'],
    ['?', 'help'],
    ['Escape', 'escape'],
  ])('maps "%s" to %s', (key, action) => {
    expect(press(key)).toBe(action);
  });

  it('ignores unmapped keys', () => {
    expect(press('q')).toBeNull();
    expect(press('Enter')).toBeNull();
    expect(press('Tab')).toBeNull();
  });

  it.each(['x', ' ', 'ArrowLeft', 'ArrowUp', 's', '?', '['])(
    'ignores "%s" inside form fields',
    (key) => {
      expect(press(key, { inFormField: true })).toBeNull();
    },
  );

  it('still handles Escape inside form fields', () => {
    expect(press('Escape', { inFormField: true })).toBe('escape');
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('ignores keys pressed with %s', (modifier) => {
    expect(press('r', { [modifier]: true })).toBeNull();
    expect(press('ArrowUp', { [modifier]: true })).toBeNull();
  });

  it('leaves Space to a focused button, which clicks itself', () => {
    expect(press(' ', { onButton: true })).toBeNull();
  });

  it('lists every mapped key in the help', () => {
    const keys = SHORTCUT_HELP.map(([k]) => k).join(' ');
    for (const k of ['Space', 'X', '[', 'B', 'V', 'E', 'P', '0', 'S', 'R', 'F', 'T', 'Esc', '?'])
      expect(keys).toContain(k);
  });
});

describe('describeDeck', () => {
  it('names the state, side, position and counter', () => {
    const text = describeDeck({
      title: 'Song',
      state: 'playing',
      side: 'B',
      timeText: '1:02',
      durationText: '3:30',
      counter: '123',
    });
    expect(text).toBe('Cassette deck. Playing, side B, 1:02 of 3:30. Track: Song. Counter 123.');
  });

  it('says when nothing is under the head', () => {
    expect(
      describeDeck({
        title: '',
        state: 'empty',
        side: 'A',
        timeText: '',
        durationText: '',
        counter: '000',
      }),
    ).toContain('No cassette');
  });
});
