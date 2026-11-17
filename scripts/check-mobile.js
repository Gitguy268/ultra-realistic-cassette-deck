// A phone: nothing wider than the screen, the deck in view, the transport reachable by touch.
// Usage: npm run build && npm run preview, then: node scripts/check-mobile.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({
  width: 390,
  height: 844,
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
await page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 20000,
});
const wide = await page.evaluate(() =>
  [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && !el.closest('dialog') && (r.right > 390.5 || r.left < -0.5);
    })
    .map((el) => el.id || el.className),
);
check(`nothing is wider than the screen (${wide.slice(0, 4)})`, wide.length === 0);
check(
  'the page does not scroll sideways',
  await page.evaluate(() => document.documentElement.scrollWidth <= 390),
);
const [sx, sy] = await page.evaluate(() => window.__deck.project('cassette'));
check(
  `the cassette is in view (${Math.round(sx)}, ${Math.round(sy)})`,
  sx > 0 && sx < 390 && sy > 0 && sy < 844,
);
check('the Pause key is there to press', await page.isVisible('#pause'));
await page.tap('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 20000 });
check('tapping Play plays', true);
await page.tap('#pause');
await page.waitForFunction(() => window.__deck.state().paused);
check('tapping Pause pauses', true);
check(
  'a touch device routes through the media element',
  await page.evaluate(() => window.__deck.deck.engine.currentRoute === 'sink'),
);

finish(errors);
await browser.close();
