// The documentation's pictures, rendered from the production build. Fails on any console error.
// Usage: npm run build && npm run preview, then: node scripts/screenshots.js [out directory]
import { mkdirSync } from 'node:fs';
import { BASE_URL, finish, openPage } from './lib.js';

const OUT = process.argv[2] ?? 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const errors = [];
const QUALITY = { type: 'jpeg', quality: 86 };

/** Opens the page in a fresh browser, with the demo record on the platter. */
async function open({
  width = 1440,
  height = 900,
  scheme = 'dark',
  dpr = 1,
  touch = false,
  query = '?demo&debug',
}) {
  const session = await openPage({
    width,
    height,
    colorScheme: scheme,
    deviceScaleFactor: dpr,
    hasTouch: touch,
    isMobile: touch,
  });
  await session.page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
  await session.page.goto(`${BASE_URL}${query}`);
  await session.page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
    timeout: 30000,
  });
  return session;
}

const play = async (page) => {
  await page.click('#play');
  await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
};

const done = async ({ browser, errors: found }) => {
  errors.push(...found);
  await browser.close();
};

// The page, playing, in both schemes at both sizes.
for (const [name, size] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, dpr: 2, touch: true }],
]) {
  for (const scheme of ['dark', 'light']) {
    const session = await open({ ...size, scheme });
    await play(session.page);
    await session.page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
    await done(session);
  }
}

// The scene with its panels out of the way: the four finishes, in focus mode.
const session = await open({ scheme: 'dark' });
const { page } = session;
await play(page);
await page.screenshot({ path: `${OUT}/playback.jpg`, ...QUALITY });
await page.keyboard.press('f');
await page.waitForTimeout(2400);
const setFinish = (name) =>
  page.evaluate((f) => {
    // Focus mode hides the topbar, so set the select by hand.
    const select = document.querySelector('#plinth');
    select.value = f;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
for (const finishName of ['silver', 'black', 'champagne', 'walnut']) {
  await setFinish(finishName);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/finishes-${finishName}.jpg`, ...QUALITY });
}
await setFinish('silver');
await page.keyboard.press('Escape');
await done(session);

// Both colour schemes of the room.
{
  const s = await open({ scheme: 'light' });
  await s.page.waitForTimeout(800);
  await s.page.screenshot({ path: `${OUT}/schemes-daylight.jpg`, ...QUALITY });
  await done(s);
  const d = await open({ scheme: 'dark' });
  await d.page.waitForTimeout(800);
  await d.page.screenshot({ path: `${OUT}/schemes-dusk.jpg`, ...QUALITY });
  await done(d);
}

// Macros, through the scene-only view.
{
  const s = await openPage({ width: 1440, height: 900 });
  const shots = {
    cassette: ['', { position: [-0.15, 0.1, 0.36], target: [-0.092, 0.07, 0.13], focal: 70 }],
    meters: ['', { position: [0.12, 0.11, 0.38], target: [0.09, 0.085, 0.13], focal: 75 }],
    counter: [
      '&counter=399.6',
      { position: [0.2, 0.11, 0.26], target: [0.18, 0.09, 0.13], focal: 90 },
    ],
    keys: [
      '&keys=play',
      { position: [-0.06, 0.07, 0.33], target: [-0.09, 0.02, 0.135], focal: 70 },
    ],
    switches: ['', { position: [0.16, 0.09, 0.32], target: [0.12, 0.05, 0.135], focal: 70 }],
    door: ['&door=28', { position: [-0.22, 0.16, 0.4], target: [-0.092, 0.06, 0.12], focal: 50 }],
    out: ['&door=28&out', { position: [0.33, 0.22, 0.42], target: [0.3, 0.0, 0.1], focal: 45 }],
  };
  for (const [name, [extra, stop]] of Object.entries(shots)) {
    await s.page.goto(
      `${BASE_URL}view.html?view=hero${extra}&macro=${encodeURIComponent(JSON.stringify(stop))}`,
    );
    await s.page.waitForFunction(() => window.__world?.ready, null, { timeout: 60000 });
    await s.page.waitForTimeout(400);
    await s.page.screenshot({ path: `${OUT}/macro-${name}.jpg`, ...QUALITY });
  }
  await done(s);
}

finish(errors);
