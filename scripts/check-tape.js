// What the tape chain does to real playback: no clipping at full level, the hiss and what noise
// reduction does to it, a mismatched tape selector or NR switch, wow and flutter, cue.
// Usage: npm run build && npm run preview, then: node scripts/check-tape.js
import { BASE_URL, check, finish, levelDb, makeWav, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
// The cassette's own settings live in a fold.
await page.evaluate(() => (document.querySelector('#deck-settings').open = true));
const until = (fn, arg, timeout = 15000) =>
  page.waitForFunction(fn, arg, { timeout }).then(
    () => true,
    () => false,
  );

/** Puts one test file on the tape and plays from 2 s into it. */
async function playTone(name, seconds, hz, amplitude, sampleRate = 44100) {
  await page.evaluate(() => window.__deck.player.clearLibrary());
  await page.setInputFiles('#file', {
    name,
    mimeType: 'audio/wav',
    buffer: makeWav(seconds, hz, Buffer.alloc(0), sampleRate, amplitude),
  });
  await until(() => window.__deck.player.queue.ids.length === 1);
  await page.evaluate(() => {
    const d = window.__deck.deck;
    d.selectTrack(0, false);
    const seg = d.program.locate(0).segment;
    window.__deck.windTo(d.geometry.leader + (seg.start + 2) * 0.047625);
  });
  await page.click('#play');
  await until(() => window.__deck.state().engine.playing);
  await page.waitForTimeout(1500);
}

await playTone('loud.wav', 30, 1000, 0.99);
const peak = await page.evaluate(async () => {
  const { samples } = await window.__deck.capture(1);
  return Math.max(...samples.map(Math.abs));
});
check(`a full-scale tone comes out unclipped (peak ${peak.toFixed(3)})`, peak < 1 && peak > 0.3);

// Hiss: in the gap after the track, where only the tape sounds.
async function gapLevel() {
  await page.evaluate(() => {
    const d = window.__deck.deck;
    const seg = d.program.locate(0).segment;
    window.__deck.windTo(d.geometry.leader + (seg.end + 0.5) * 0.047625);
  });
  await page.waitForTimeout(1600);
  return levelDb(page, 1);
}
await page.selectOption('#nr', 'B');
const hissB = await gapLevel();
await page.selectOption('#nr', 'off');
const hissOff = await gapLevel();
check(
  `NR B on a B tape takes the hiss down (${hissOff.toFixed(1)} → ${hissB.toFixed(1)} dBFS)`,
  hissOff - hissB > 5,
);
check(`…and there is hiss to hear (${hissOff.toFixed(1)} dBFS)`, hissOff > -85 && hissOff < -45);
await page.selectOption('#nr', 'B');
await page.fill('#hiss', '0');
await page.dispatchEvent('#hiss', 'input');
const silent = await gapLevel();
check(`the Hiss control at 0 leaves the tape silent (${silent.toFixed(1)} dBFS)`, silent < -100);
await page.fill('#hiss', '50');
await page.dispatchEvent('#hiss', 'input');

// Treble: a quiet 9 kHz tone, which noise reduction encoded and the selector equalises.
await playTone('treble.wav', 40, 9000, 0.02);
const atSetting = async (selector, value) => {
  await page.selectOption(selector, value);
  await page.waitForTimeout(700);
  return levelDb(page, 0.5);
};
// The selector alone first, on a tape recorded without noise reduction.
await page.selectOption('#recorded-nr', 'off');
await page.selectOption('#nr', 'off');
const matched = await atSetting('#tape-type', 'II');
const wrongEq = await atSetting('#tape-type', 'I');
check(
  `a 70 µs tape on the 120 µs setting is bright (+${(wrongEq - matched).toFixed(1)} dB at 9 kHz)`,
  wrongEq - matched > 3.5 && wrongEq - matched < 5.5,
);
// With noise reduction the error grows: the decoder hears the brighter treble as louder and
// expands it less (mistracking).
await page.selectOption('#recorded-nr', 'B');
await page.selectOption('#nr', 'B');
const matchedNr = await atSetting('#tape-type', 'II');
const wrongNr = await atSetting('#tape-type', 'I');
check(
  `…and more so through NR B, which mistracks (+${(wrongNr - matchedNr).toFixed(1)} dB)`,
  wrongNr - matchedNr > wrongEq - matched,
);
await page.selectOption('#tape-type', 'II');
const decoded = await atSetting('#nr', 'B');
const undecoded = await atSetting('#nr', 'off');
check(
  `a B tape played with NR off is bright (+${(undecoded - decoded).toFixed(1)} dB on quiet treble)`,
  undecoded - decoded > 5,
);
await page.selectOption('#nr', 'B');

// Wow and flutter: the period of a steady 1 kHz tone wanders, and holds still with it off.
async function periodSpread() {
  // Long enough that the two-second capture holds nothing from before the last change.
  await page.waitForTimeout(2600);
  return page.evaluate(async () => {
    const { samples, sr } = await window.__deck.capture(2);
    const crossings = [];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0)
        crossings.push(i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]));
    }
    const periods = crossings.slice(1).map((c, i) => (c - crossings[i]) / sr);
    // Average over 20 ms windows: noise jitters single crossings, speed does not.
    const windows = [];
    for (let i = 0; i + 20 <= periods.length; i += 20)
      windows.push(periods.slice(i, i + 20).reduce((a, b) => a + b) / 20);
    const mean = windows.reduce((a, b) => a + b) / windows.length;
    return (Math.max(...windows) - Math.min(...windows)) / mean;
  });
}
await playTone('steady.wav', 40, 1000, 0.5);
await page.fill('#hiss', '0');
await page.dispatchEvent('#hiss', 'input');
const wobble = await periodSpread();
await page.uncheck('#wow-flutter');
const still = await periodSpread();
check(
  `wow and flutter move the pitch (${(wobble * 100).toFixed(3)} % peak to peak) and stop when off (${(still * 100).toFixed(3)} %)`,
  wobble > 0.0004 && wobble < 0.01 && still < wobble / 2,
);
await page.check('#wow-flutter');

// Cue: the music at seven times speed, still heard.
await page.locator('#ff').dispatchEvent('pointerdown', { pointerId: 1 });
await page.waitForTimeout(600);
const cueLevel = await levelDb(page, 0.3);
await page.locator('#ff').dispatchEvent('pointerup', { pointerId: 1 });
check(`cue is heard (${cueLevel.toFixed(1)} dBFS)`, cueLevel > -30);

finish(errors);
await browser.close();
