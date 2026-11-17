// Each build keeps its own storage: the app's IndexedDB and settings, the one-file build's own
// (file:// pages share one origin), and only the Winamp EQ under the family's shared keys. The
// tape position comes back after a reload.
// Usage: npm run build && npm run build:single && npm run preview, then: node scripts/check-storage.js
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
const databases = () =>
  page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name).sort()));

async function exercise(url, prefix, dbName, label) {
  await page.goto(url);
  await page.waitForFunction(() => window.__deck);
  await page.setInputFiles('#file', [wavFile('one.wav', 40, 330), wavFile('two.wav', 40, 440)]);
  await page.waitForFunction(() => window.__deck.player.queue.ids.length === 2);
  await page.selectOption('#tape-type', 'IV');
  await page.selectOption('#nr', 'C');
  await page.selectOption('#reverse-mode', 'loop');
  await page.selectOption('#plinth', 'black');
  await page.evaluate(() => {
    document.querySelector('#eq-on').click();
  });
  await page.click('#play');
  await page.waitForFunction(() => window.__deck.state().engine.playing, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.click('#stop');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__deck.state());
  // Saved on hide and every few seconds; force it like a closing tab would.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 2, null, {
    timeout: 20000,
  });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__deck.state());
  check(`${label}: the library comes back`, after.queue === 2);
  check(
    `${label}: the switches come back`,
    (await page.inputValue('#tape-type')) === 'IV' &&
      (await page.inputValue('#nr')) === 'C' &&
      (await page.inputValue('#reverse-mode')) === 'loop' &&
      (await page.inputValue('#plinth')) === 'black',
  );
  check(
    `${label}: the tape is where it was left (${before.x.toFixed(3)} → ${after.x.toFixed(3)} m)`,
    Math.abs(after.x - before.x) < 0.01 && after.x > 0.3,
  );
  check(
    `${label}: the counter too (${before.counterText} → ${after.counterText})`,
    before.counterText === after.counterText,
  );
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check(
    `${label}: settings live under ${prefix}*`,
    keys.includes(`${prefix}settings`) && keys.includes(`${prefix}deck`),
  );
  check(
    `${label}: the EQ lives under the family's shared key`,
    keys.includes('vinyl-eq') && !keys.includes(`${prefix}eq`),
  );
  const names = await databases();
  check(
    `${label}: its own database ${dbName} (${names})`,
    names.includes(dbName) && !names.includes('vinyl-library'),
  );
}

await exercise(`${BASE_URL}?debug`, 'ultra-cassette-deck.', 'cassette-library', 'app');

const single = new URL('../dist-single/index.html', import.meta.url);
if (existsSync(single)) {
  await exercise(
    `${pathToFileURL(single.pathname)}?debug`,
    'cassette-deck-html.',
    'cassette-deck-html',
    'one file',
  );
} else process.stdout.write('dist-single/index.html not built: the one-file half is skipped\n');

finish(errors);
await browser.close();
