// Fast switching between tracks never leaves the wrong track playing; a long file plays in
// streaming mode, where cue and review are off.
// Usage: npm run build && npm run preview, then: node scripts/check-loading.js
import { BASE_URL, check, finish, makeWav, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
const state = () => page.evaluate(() => window.__deck.state());
const until = (fn, arg, timeout = 30000) =>
  page.waitForFunction(fn, arg, { timeout }).then(
    () => true,
    () => false,
  );
await page.evaluate(() => (document.querySelector('#deck-settings').open = true));
await page.uncheck('#wind-to-track');

await page.setInputFiles('#file', [
  wavFile('Race A.wav', 30, 330),
  wavFile('Race B.wav', 30, 440),
  wavFile('Race C.wav', 30, 550),
]);
await page.waitForFunction(() => window.__deck.player.queue.ids.length === 3);
const tracks = page.locator('#tracks .track');
await tracks.nth(0).click();
await tracks.nth(2).click();
await tracks.nth(1).click();
await tracks.nth(2).click();
check(
  'after quick clicks the last chosen track plays',
  await until(() => window.__deck.state().heard === 2 && window.__deck.state().engine.playing),
);
await page.waitForTimeout(1500);
let s = await state();
check(
  `…from its start, in step with the tape (${s.engine.currentTime.toFixed(2)} s / ${s.currentTime.toFixed(2)} s)`,
  Math.abs(s.engine.currentTime - s.currentTime) < 0.15 && s.currentTime < 4,
);
check('…and it is the current track', s.currentId.startsWith('Race C'));

// The tape plays on through the gap into the next track, decoded ahead of time.
await page.evaluate(() => {
  const d = window.__deck.deck;
  window.__deck.windTo(d.geometry.leader + (d.program.locate(0).segment.end - 1) * 0.047625);
});
await page.click('#play');
check(
  'the head crosses a gap into the next track by itself',
  await until(
    () => window.__deck.state().heard === 1 && window.__deck.state().engine.playing,
    null,
    15000,
  ),
);
check('…which becomes current', (await state()).currentId.startsWith('Race B'));
await page.click('#stop');

// A long file streams: 21 minutes of 8 kHz mono, past the decode limit.
await page.evaluate(() => window.__deck.player.clearLibrary());
await page.setInputFiles('#file', {
  name: 'Long Take.wav',
  mimeType: 'audio/wav',
  buffer: makeWav(21 * 60, 220, Buffer.alloc(0), 8000, 0.3),
});
await page.waitForFunction(() => window.__deck.player.queue.ids.length === 1, null, {
  timeout: 30000,
});
await page.locator('#tracks .track').first().click();
check('a long file plays', await until(() => window.__deck.state().engine.playing, null, 30000));
s = await state();
check(`…in streaming mode (${s.engine.mode})`, s.engine.mode === 'stream');
check('…and says what that means', (await page.textContent('#status')).includes('streaming'));
await page.locator('#ff').dispatchEvent('pointerdown', { pointerId: 1 });
await page.waitForTimeout(500);
s = await state();
check('cue moves the tape but cannot read a stream', s.cue === 1 && !s.engine.cueing);
await page.locator('#ff').dispatchEvent('pointerup', { pointerId: 1 });
check(
  '…and play carries on after it',
  await until(() => window.__deck.state().engine.playing, null, 10000),
);

finish(errors);
await browser.close();
