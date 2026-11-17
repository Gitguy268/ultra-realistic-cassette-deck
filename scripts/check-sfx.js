// The mechanism is heard: each key, the solenoid, the door, the auto-reverse and the tape's end
// make their sound, the fast wind whines, and "Mechanical sounds" off silences all of it.
// Usage: npm run build && npm run preview, then: node scripts/check-sfx.js
import { check, finish, levelDb, openDeck } from './lib.js';

const { browser, page, errors, until } = await openDeck({ width: 1440, height: 900 });
const heard = () => page.evaluate(() => window.__deck.mechanisms.splice(0));

await page.click('#play');
await until(() => window.__deck.state().engine.playing);
let sounds = await heard();
check(
  `Play: the key, then the solenoid (${sounds})`,
  sounds[0] === 'key' && sounds.includes('engage'),
);
await page.click('#stop');
await page.click('#stop');
await until(() => window.__deck.state().door > 25);
sounds = await heard();
check(`Stop, then eject (${sounds})`, sounds.includes('release') && sounds.includes('eject'));
await page.click('#eject');
await page.waitForTimeout(300);
check(`the door latches shut (${await heard()})`, true);
await page.click('#counter-reset');
check('the counter reset clicks', (await heard()).includes('counter-reset'));
await page.selectOption('#nr', 'C');
check('a switch clicks', (await heard()).includes('switch'));

// The fast wind's whine is a sound of its own, while the tape is silent.
await page.fill('#hiss', '0');
await page.dispatchEvent('#hiss', 'input');
await page.locator('#ff').dispatchEvent('pointerdown', { pointerId: 1 });
await page.locator('#ff').dispatchEvent('pointerup', { pointerId: 1 });
await page.waitForTimeout(1500);
const whine = await levelDb(page, 0.5);
check(`fast wind whines (${whine.toFixed(1)} dBFS)`, whine > -70);
await page.click('#stop');
await page.waitForTimeout(800);
const quiet = await levelDb(page, 0.4);
check(`…and stops with the tape (${quiet.toFixed(1)} dBFS)`, quiet < whine - 15);

// The end of the tape and the auto-reverse.
await heard();
await page.click('#play');
await until(() => window.__deck.state().v > 0);
await page.evaluate(() => window.__deck.windTo(window.__deck.deck.geometry.total - 0.03));
await until(() => window.__deck.state().direction === -1);
sounds = await heard();
check(
  `the tape pulls tight at its end, and the head turns (${sounds})`,
  sounds.includes('end') && sounds.includes('reverse'),
);
await page.click('#stop');

// Mechanical sounds off.
await page.evaluate(() => (document.querySelector('#deck-settings').open = true));
await page.uncheck('#effects');
await heard();
await page.click('#play');
await page.waitForTimeout(600);
await page.click('#stop');
check('with Mechanical sounds off nothing clicks', (await heard()).length === 0);
await page.locator('#ff').dispatchEvent('pointerdown', { pointerId: 2 });
await page.locator('#ff').dispatchEvent('pointerup', { pointerId: 2 });
await page.waitForTimeout(1500);
const silentWind = await levelDb(page, 0.5);
check(`…and the wind is silent (${silentWind.toFixed(1)} dBFS)`, silentWind < -90);
await page.click('#stop');

finish(errors);
await browser.close();
