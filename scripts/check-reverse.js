// Auto-reverse in its three modes, the ◀▶ key, the head turning, the side B azimuth.
// Usage: npm run build && npm run preview, then: node scripts/check-reverse.js
import { check, finish, openDeck } from './lib.js';

const { browser, page, errors, state, until } = await openDeck({ width: 1440, height: 900 });

const nearEnd = (forward) =>
  page.evaluate((f) => {
    const d = window.__deck.deck;
    window.__deck.windTo(f ? d.geometry.total - 0.03 : 0.03);
  }, forward);

await page.selectOption('#reverse-mode', 'both');
await page.click('#play');
await until(() => window.__deck.state().engine.playing || window.__deck.state().mode === 'play');
await nearEnd(true);
check(
  '⊃⊂: the end of side A turns the head and plays side B',
  await until(
    () =>
      window.__deck.state().direction === -1 &&
      window.__deck.state().head === 1 &&
      window.__deck.state().v < 0,
  ),
);
let s = await state();
check('…the page says side B', (await page.textContent('#side-letter')) === 'B' && s.side === 'B');
check(
  '…and the deck heard the end and turned',
  (await page.evaluate(() => window.__deck.mechanisms.join())).includes('end,reverse'),
);
await nearEnd(false);
check(
  '⊃⊂: the end of side B stops the deck',
  await until(() => window.__deck.state().mode === 'stop'),
);

await page.selectOption('#reverse-mode', 'loop');
await page.click('#play');
await page.waitForTimeout(300);
await nearEnd(false);
check(
  '∞: the end of side B turns back to side A',
  await until(() => window.__deck.state().direction === 1 && window.__deck.state().mode === 'play'),
);
await nearEnd(true);
check(
  '…and round again',
  await until(
    () => window.__deck.state().direction === -1 && window.__deck.state().mode === 'play',
  ),
);

await page.selectOption('#reverse-mode', 'one');
await nearEnd(false);
check(
  '⊐: the end of a side stops the deck',
  await until(() => window.__deck.state().mode === 'stop'),
);

// The ◀▶ key, mid-side: the head turns and the other side plays from where the tape is.
await page.evaluate(() => window.__deck.windTo(window.__deck.deck.geometry.total / 2));
await page.click('#play');
await until(() => window.__deck.state().v !== 0);
const before = await state();
await page.click('#reverse');
await page.waitForTimeout(200);
s = await state();
check(
  '◀▶ turns the head, and nothing reads while it turns',
  s.head > 0 && s.head < 1 && Math.abs(s.v) < 0.01,
);
check(
  '…then the other side plays',
  await until(
    (d) =>
      window.__deck.state().direction === d &&
      window.__deck.state().head === (d > 0 ? 0 : 1) &&
      Math.abs(window.__deck.state().rate - 1) < 0.02,
    -before.direction,
  ),
);
const azimuth = () => page.evaluate(() => window.__deck.deck.engine['tape']?.sound.azimuthUs);
const first = await azimuth();
await page.click('#reverse');
await page.waitForTimeout(600);
const second = await azimuth();
const reverseUs = Math.max(first, second);
check(
  `the turned head reads with a larger azimuth error (${Math.min(first, second)} → ${reverseUs} µs)`,
  reverseUs > 5 && Math.min(first, second) < 5,
);

finish(errors);
await browser.close();
