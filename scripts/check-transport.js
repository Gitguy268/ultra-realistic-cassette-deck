// The transport through the page's twins: play, pause, stop, stop again to eject, fast wind,
// cue and review while held, music search, the counter, pitch and power.
// Usage: npm run build && npm run preview, then: node scripts/check-transport.js
import { check, finish, openDeck } from './lib.js';

const { browser, page, errors, state, until } = await openDeck({ width: 1440, height: 900 });
const SPEED = 0.047625;

await page.click('#play');
check('Play starts the tape', await until(() => window.__deck.state().engine.playing));
await page.waitForTimeout(1500);
let s = await state();
check(`…at 4.76 cm/s (${(s.v * 100).toFixed(3)} cm/s)`, Math.abs(s.v - SPEED) < 1e-4);
check('…reading side A of the first track', s.side === 'A' && s.heard === 0);
check(
  `…with the sound on the tape (engine ${s.engine.currentTime.toFixed(2)} s, tape ${s.currentTime.toFixed(2)} s)`,
  Math.abs(s.engine.currentTime - s.currentTime) < 0.1,
);
check('the Play twin shows it down', (await page.getAttribute('#play', 'aria-pressed')) === 'true');

await page.click('#pause');
await page.waitForTimeout(400);
s = await state();
check('Pause stops the tape with play still latched', s.paused && Math.abs(s.v) < 1e-3);
check('…and the sound', !s.engine.playing);
await page.click('#pause');
check('Pause again carries on', await until(() => window.__deck.state().engine.playing));

// Pitch.
await page.fill('#pitch', '2');
await page.dispatchEvent('#pitch', 'input');
await until(() => Math.abs(window.__deck.state().rate - 1.02) < 0.002, null, 3000);
s = await state();
check(`pitch +2 % runs the tape 2 % fast (${s.rate.toFixed(4)})`, Math.abs(s.rate - 1.02) < 0.002);
await page.dblclick('#pitch');
await page.waitForTimeout(500);

// Cue while play is held with fast forward.
await page.locator('#ff').dispatchEvent('pointerdown', { pointerId: 1 });
await page.waitForTimeout(700);
s = await state();
check(`holding ▶▶ during play cues at ~7× (${s.rate.toFixed(1)}×)`, s.cue === 1 && s.rate > 6);
check('…with the head on the tape and the sound running', s.engine.cueing);
await page.locator('#ff').dispatchEvent('pointerup', { pointerId: 1 });
await page.waitForTimeout(700);
s = await state();
check('letting go plays on at speed', s.cue === 0 && Math.abs(s.rate - 1) < 0.01);

await page.locator('#rew').dispatchEvent('pointerdown', { pointerId: 2 });
await page.waitForTimeout(500);
s = await state();
check(`holding ◀◀ during play reviews (${s.rate.toFixed(1)}×)`, s.cue === -1 && s.rate < -5);
await page.locator('#rew').dispatchEvent('pointerup', { pointerId: 2 });

// Music search to the next track.
await page.click('#next');
check('Next winds with the head lifted', await until(() => window.__deck.state().mode === 'wind'));
check(
  '…stops at the gap and plays the next track',
  await until(
    () => window.__deck.state().mode === 'play' && window.__deck.state().heard === 1,
    null,
    20000,
  ),
);
check('…which becomes current', (await state()).currentId?.startsWith('Slow Burn'));
// More than two seconds in: Previous goes back to this track's start, not the one before.
await page.waitForTimeout(4500);
await page.click('#prev');
check(
  'Previous winds back to the start of that track',
  await until(
    () =>
      window.__deck.state().mode === 'play' &&
      window.__deck.state().heard === 1 &&
      window.__deck.state().currentTime < 3,
    null,
    20000,
  ),
);

// Stop, then stop again ejects.
await page.click('#stop');
await page.waitForTimeout(300);
s = await state();
check('Stop stops', s.mode === 'stop' && Math.abs(s.v) < 1e-3);
await page.click('#stop');
check('Stop again ejects: the door opens', await until(() => window.__deck.state().door > 25));
await page.click('#eject');
check('Eject again shuts it', await until(() => window.__deck.state().door === 0));

// Fast wind: speeds up as the take-up pack grows.
await page.evaluate(() => window.__deck.windTo(1));
await page.locator('#ff').dispatchEvent('pointerdown', { pointerId: 3 });
await page.locator('#ff').dispatchEvent('pointerup', { pointerId: 3 });
await page.waitForTimeout(1500);
const early = (await state()).v;
await page.evaluate(() => window.__deck.windTo(window.__deck.deck.geometry.total * 0.85));
await page.waitForTimeout(1200);
const late = (await state()).v;
check(
  `fast wind speeds up with the take-up pack (${early.toFixed(2)} → ${late.toFixed(2)} m/s)`,
  late > early * 1.5 && early > 0.2,
);
check('…and the ▶▶ key stays latched', (await page.getAttribute('#ff', 'aria-pressed')) === 'true');
await page.click('#stop');

// The counter counts reel turns and resets.
await page.click('#counter-reset');
await page.waitForTimeout(100);
check('Reset zeroes the counter', (await state()).counterText === '000');
check('the page shows it', (await page.textContent('#counter')) === '000');

// Power.
await page.click('#power');
await page.waitForTimeout(100);
s = await state();
check('Power off', !s.powered);
await page.click('#play');
await page.waitForTimeout(400);
check('…and nothing plays', (await state()).mode === 'stop');
check('…says why', (await page.textContent('#status')).includes('switched off'));
await page.click('#power');

finish(errors);
await browser.close();
