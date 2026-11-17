// The library and the tape: a folder import, tags, persistence, reordering, a chosen track wound
// to (or jumped to), side badges, a programme across two cassettes, the next cassette put in when a
// tape ends, removal and clearing.
// Usage: npm run build && npm run preview, then: node scripts/check-library.js
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE_URL, check, finish, id3Chunk, makeWav, openPage, solidPng } from './lib.js';

const fixture = fileURLToPath(new URL('../.scratch/import-fixture/', import.meta.url));
rmSync(fixture, { recursive: true, force: true });
mkdirSync(`${fixture}nested/deeper`, { recursive: true });
writeFileSync(
  `${fixture}tagged.wav`,
  makeWav(
    20,
    330,
    id3Chunk({ title: 'Tagged Title', artist: 'Tag Artist', coverPng: solidPng([64, 200, 240]) }),
  ),
);
writeFileSync(`${fixture}nested/02 - Folder Band - Second Song.wav`, makeWav(20, 440));
writeFileSync(`${fixture}nested/deeper/Plain Name.wav`, makeWav(20, 550));
writeFileSync(`${fixture}nested/notes.txt`, 'not audio');
writeFileSync(`${fixture}cover.jpg`, 'not audio');

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
page.on('dialog', (dialog) => dialog.accept());
await page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
const state = () => page.evaluate(() => window.__deck.state());
const until = (fn, arg, timeout = 30000) =>
  page.waitForFunction(fn, arg, { timeout }).then(
    () => true,
    () => false,
  );
const titles = () => page.locator('#tracks .track-title').allTextContents();

check('the library starts empty', (await titles()).length === 0);
await page.setInputFiles('#folder', fixture);
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 3);
const imported = await titles();
check(
  `a folder import collects audio recursively (${imported.join(', ')})`,
  [...imported].sort().join() === 'Plain Name,Second Song,Tagged Title',
);
check(
  'embedded tags win over the file name',
  (
    await page
      .locator('#tracks li', { hasText: 'Tagged Title' })
      .locator('.track-meta')
      .textContent()
  ).startsWith('Tag Artist'),
);
check(
  'side A is marked where it begins',
  (await page.locator('#tracks li').first().locator('.trk-side').textContent()) === 'Side A',
);

// Choosing a track: the tape winds to it, then plays.
await page.locator('#tracks .track').nth(2).click();
check('a chosen track is wound to', await until(() => window.__deck.state().mode === 'wind'));
check(
  '…and plays',
  await until(() => window.__deck.state().heard === 2 && window.__deck.state().engine.playing),
);
check(
  '…as the current track',
  (await page.locator('#tracks .track[aria-current=true] .track-title').textContent()) ===
    imported[2],
);
await page.click('#stop');
await page.evaluate(() => (document.querySelector('#deck-settings').open = true));
await page.uncheck('#wind-to-track');
await page.locator('#tracks .track').nth(0).click();
await page.waitForTimeout(200);
const jumped = await state();
check(
  'with winding off, a chosen track is jumped to',
  (jumped.mode === 'play' && jumped.spot.kind !== 'track') || jumped.heard === 0,
);
check(
  '…and plays',
  await until(() => window.__deck.state().heard === 0 && window.__deck.state().engine.playing),
);
await page.click('#stop');
await page.check('#wind-to-track');

// Reordering with the keyboard re-lays the tape.
await page.locator('#tracks .track').first().focus();
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(200);
const reordered = await titles();
check('Alt+↓ moves the focused track down', reordered[1] === imported[0]);
check(
  '…and the tape follows the new order',
  await page.evaluate(
    () =>
      window.__deck.deck.program.locate(1).segment.start >
      window.__deck.deck.program.locate(0).segment.start,
  ),
);

// Persistence.
await page.waitForTimeout(5500);
await page.reload();
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 20000,
});
check(
  'the library and its order persist across a reload',
  (await titles()).join() === reordered.join(),
);

// A programme across two cassettes: long tracks on C46 sides.
await page.evaluate(() => {
  for (const track of window.__deck.player.tracks.values()) track.durationSec = 1300;
  window.__deck.player.events.emit('change', undefined);
});
await page.evaluate(() => (document.querySelector('#deck-settings').open = true));
await page.selectOption('#tape', 'C46');
await page.waitForTimeout(200);
let s = await state();
check(
  `three long tracks need two C46 cassettes (${s.cassettes})`,
  s.cassettes === 2 && s.tape === 'C46',
);
const badges = (await page.locator('#tracks .trk-side').allTextContents()).join();
check(`the list marks where each side begins (${badges})`, badges === 'Side 1A,Side 1B,Side 2A');
await page.uncheck('#wind-to-track');
await page.locator('#tracks .track').nth(2).click();
await page.waitForTimeout(400);
s = await state();
check('a track on the next cassette swaps it in', s.cassette === 1 && s.side === 'A');
check(
  '…and plays it',
  await until(() => window.__deck.state().heard === 2 && window.__deck.state().engine.playing),
);

// When the first cassette ends, the next goes in.
await page.locator('#tracks .track').nth(1).click();
await until(() => window.__deck.state().cassette === 0);
await page.check('#auto-advance');
await page.selectOption('#reverse-mode', 'one');
await until(() => window.__deck.state().v !== 0);
// To the end of the side, whichever way the tape is running.
await page.evaluate(() => {
  const s = window.__deck.state();
  window.__deck.windTo(s.v > 0 ? s.total - 0.02 : 0.02);
});
check(
  'with the option on, the next cassette goes in when a tape ends',
  await until(
    () => window.__deck.state().cassette === 1 && window.__deck.state().mode === 'play',
    null,
    15000,
  ),
);
await page.click('#stop');

// Removal and clearing.
await page.locator('#tracks .remove').last().click();
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 2);
check('a track can be removed', true);
await page.click('#clear-library');
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 0);
check('the library can be cleared', await page.isVisible('#tracks-empty'));
await page.reload();
await page.waitForFunction(() => window.__deck);
await page.waitForTimeout(500);
check('…and stays clear after a reload', (await titles()).length === 0);

finish(errors);
await browser.close();
