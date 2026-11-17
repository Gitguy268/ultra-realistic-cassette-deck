import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../src/ui/settings';

describe('parseSettings', () => {
  it.each([null, undefined, 42, 'text', [], {}])('falls back to the defaults for %j', (raw) => {
    expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips valid settings through JSON', () => {
    const settings: Settings = {
      pitch: -2.5,
      volume: 55,
      hiss: 70,
      tapeType: 'IV',
      nr: 'C',
      reverseMode: 'loop',
      cassetteType: 'I',
      recordedNr: 'off',
      tape: 'C90',
      condition: 'worn',
      bass: 6,
      mid: -3,
      treble: 12,
      wowFlutter: false,
      imperfection: 0.8,
      visualizer: 'spectrogram',
      graphicEq: {
        on: true,
        preamp: -2.5,
        bands: [4.8, 2.9, -3.6, -5.1, -2.5, 2.5, 5.5, 6.7, 6.7, 6.7],
        preset: 'Rock',
      },
      effects: false,
      windToTrack: false,
      background: false,
    };
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it('repairs the deck switches field by field', () => {
    const repaired = parseSettings({
      tapeType: 'III',
      nr: 'S',
      reverseMode: 'sideways',
      tape: 'C180',
      condition: 'shiny',
      imperfection: 7,
      background: 'auto',
    });
    expect(repaired.tapeType).toBe('II');
    expect(repaired.nr).toBe('B');
    expect(repaired.reverseMode).toBe('both');
    expect(repaired.tape).toBe('auto');
    expect(repaired.condition).toBe('good');
    expect(repaired.imperfection).toBe(1);
    expect(repaired.background).toBeNull();
  });

  it('accepts every visualizer style and drops unknown ones', () => {
    for (const style of ['lines', 'scope', 'spectrogram', 'radial'] as const) {
      expect(parseSettings({ visualizer: style }).visualizer).toBe(style);
    }
    expect(parseSettings({ visualizer: 'winamp' }).visualizer).toBe('off');
  });

  it('repairs a damaged graphic EQ field by field', () => {
    const eq = parseSettings({
      graphicEq: { on: 'yes', preamp: 40, bands: [1, 2, 3], preset: 7 },
    }).graphicEq;
    expect(eq).toEqual({ ...DEFAULT_SETTINGS.graphicEq, preamp: 12 });
  });

  it('clamps numbers to the range of their control', () => {
    const parsed = parseSettings({ pitch: 40, volume: -5, hiss: 900, bass: 99 });
    expect(parsed.pitch).toBe(3);
    expect(parsed.volume).toBe(0);
    expect(parsed.hiss).toBe(100);
    expect(parsed.bass).toBe(12);
  });
});
