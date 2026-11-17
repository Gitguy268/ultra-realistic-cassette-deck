// prefers-reduced-motion: no opening move, no camera drift, the door and the turn-over happen at
// once. The tape still plays and the reels still turn.
// Usage: npm run build && npm run preview, then: node scripts/check-reduced.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({
  width: 1440,
  height: 900,
  reducedMotion: 'reduce',
});
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);
const state = () => page.evaluate(() => window.__deck.state());
check('no opening move', !(await page.evaluate(() => window.__deck.stage.rig.introPlaying)));
const c0 = (await state()).camera;
await page.waitForTimeout(600);
const c1 = (await state()).camera;
check(
  'the camera does not drift',
  c0.every((v, i) => Math.abs(v - c1[i]) < 1e-6),
);

await page.setInputFiles('#file', wavFile('Calm.wav', 30, 440));
await page.waitForFunction(() => window.__deck.player.queue.ids.length === 1);
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
const reel = () => page.evaluate(() => window.__deck.stage.world.deck.reels[1].rotation.z);
const r0 = await reel();
await page.waitForTimeout(800);
check('the reels still turn', (await reel()) !== r0);
await page.click('#stop');
await page.click('#stop');
await page.waitForTimeout(80);
check('the door opens at once', (await state()).door > 25);
await page.click('#turn-over');
await page.waitForTimeout(300);
const s = await state();
check('turning the cassette over is immediate', s.faceUp === 1 && s.inDeck && s.door === 0);

finish(errors);
await browser.close();
