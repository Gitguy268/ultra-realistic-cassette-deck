// Without WebGL the page shows the 2D deck, with every control working.
// Usage: npm run build && npm run preview, then: node scripts/check-fallback.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/.test(type) ? null : original.call(this, type, ...rest);
  };
});
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
const state = () => page.evaluate(() => window.__deck.state());
check('no 3D stage is built', await page.evaluate(() => window.__deck.stage === null));
check(
  'the page knows it has no stage',
  await page.evaluate(() => !document.body.classList.contains('has-stage')),
);
check('the scene canvas is hidden', await page.isHidden('#scene'));
check('the 2D deck shows', await page.isVisible('#deck2d'));

const painted = () =>
  page.evaluate(() => {
    const c = document.querySelector('#deck2d');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) lit++;
    return lit;
  });
check(`the 2D deck is drawn (${await painted()} samples)`, (await painted()) > 100);

await page.setInputFiles('#file', wavFile('Flat Tone.wav', 20, 440));
await page.waitForFunction(() => window.__deck.player.queue.ids.length === 1);
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
check('Play plays', true);
const x0 = (await state()).x;
await page.waitForTimeout(800);
check('the tape moves', (await state()).x > x0);
await page.click('#pause');
await page.waitForTimeout(300);
check('Pause pauses', (await state()).paused);
await page.click('#stop');
await page.click('#stop');
await page.waitForFunction(() => window.__deck.state().door > 25);
check('Stop twice ejects', true);
await page.click('#deck2d', { position: { x: 160, y: 60 } });
await page.waitForTimeout(200);
check('a click in the open door takes the cassette out', !(await state()).inDeck);
await page.click('#turn-over');
await page.waitForFunction(
  () => window.__deck.state().inDeck && window.__deck.state().door === 0,
  null,
  { timeout: 10000 },
);
check('Turn over puts it back the other way round', (await state()).faceUp === 1);
await page.fill('#pitch', '3');
await page.dispatchEvent('#pitch', 'input');
check('the pitch follows', (await state()).pitch > 0.02);

finish(errors);
await browser.close();
