// The cassette's labels: each side lists its own tracks, with the artist when there is one, the
// tape and how it was recorded; turning to a longer cassette rewrites them.
// Usage: npm run build && npm run preview, then: node scripts/check-label.js
import { check, finish, openDeck } from './lib.js';

const { browser, page, errors } = await openDeck({ width: 1440, height: 900 });
const labels = () => page.evaluate(() => window.__deck.stage.labels.map((l) => l.content));
await page.waitForTimeout(500);
let [a, b] = await labels();
check(`side A is written for side A (${a.side})`, a.side === 'A' && b.side === 'B');
check(`…listing its tracks (${a.tracks})`, a.tracks.join() === 'Warm Up,Slow Burn,Last Call');
check(`…under the artist and album (${a.heading})`, a.heading === 'Synth Demo · Test Tape');
check('side B is blank: nothing was recorded there', b.tracks.length === 0 && b.heading === '');
check(
  `the tape's name and type are printed (${a.tape}, ${a.type}, ${a.nr})`,
  /^C\d+$/.test(a.tape) && a.type.includes('TYPE II') && a.nr === 'NR B',
);

await page.evaluate(() => (document.querySelector('#deck-settings').open = true));
await page.selectOption('#cassette-type', 'I');
await page.selectOption('#recorded-nr', 'off');
await page.waitForTimeout(300);
[a] = await labels();
check('the label follows the cassette type and NR', a.type.includes('TYPE I ') && a.nr === '');

// Long tracks spread over both sides: each label lists only its own.
await page.evaluate(() => {
  for (const track of window.__deck.player.tracks.values()) track.durationSec = 800;
  window.__deck.player.events.emit('change', undefined);
});
await page.selectOption('#tape', 'C60');
await page.waitForTimeout(400);
[a, b] = await labels();
check(
  `with longer tracks, side B gets its own (${a.tracks} / ${b.tracks})`,
  a.tracks.length === 2 && b.tracks.join() === 'Last Call',
);
const painted = await page.evaluate(() => {
  const c = window.__deck.stage.labels[0].canvas;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4 * 13) if (d[i + 3] > 0 && d[i] < 90) ink++;
  return ink;
});
check(`the label is written on (${painted} dark samples)`, painted > 200);

finish(errors);
await browser.close();
