// Every shortcut, the tab order through the controls, the dialogs and focus mode.
// Usage: npm run build && npm run preview, then: node scripts/check-keyboard.js
import { check, finish, openDeck } from './lib.js';

const { browser, page, errors, state, until } = await openDeck({ width: 1440, height: 900 });
await page
  .locator('body')
  .click({ position: { x: 5, y: 5 } })
  .catch(() => {});
await page.evaluate(() => document.activeElement?.blur());
const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
};

await press(' ');
check('Space plays', await until(() => window.__deck.state().engine.playing));
await press(' ');
check('Space again pauses', (await state()).paused);
await press(' ');
await until(() => window.__deck.state().engine.playing);

const t0 = (await state()).currentTime;
await press('ArrowRight');
check(
  `→ jumps 5 s on (${t0.toFixed(1)} → ${(await state()).currentTime.toFixed(1)})`,
  (await state()).currentTime > t0 + 4,
);
await press('ArrowLeft');
check('← jumps 5 s back', (await state()).currentTime < t0 + 2);

const volume = Number(await page.inputValue('#volume'));
await press('ArrowUp');
check('↑ raises the level', Number(await page.inputValue('#volume')) === volume + 5);
await press('ArrowDown');
check('↓ lowers it', Number(await page.inputValue('#volume')) === volume);

await page.keyboard.down(']');
await page.waitForTimeout(600);
check('] held during play cues', (await state()).cue === 1);
await page.keyboard.up(']');
await page.waitForTimeout(400);
check('…until it is let go', (await state()).cue === 0);
await page.keyboard.down('[');
await page.waitForTimeout(500);
check('[ held during play reviews', (await state()).cue === -1);
await page.keyboard.up('[');

await press('n');
check(
  'N searches to the next track',
  await until(
    () => window.__deck.state().heard === 1 && window.__deck.state().mode === 'play',
    null,
    20000,
  ),
);
await page.waitForTimeout(500);
await press('b');
check(
  'B searches back',
  await until(
    () => window.__deck.state().mode === 'wind' || window.__deck.state().heard === 0,
    null,
    5000,
  ),
);
await until(() => window.__deck.state().mode === 'play', null, 20000);

const direction = (await state()).direction;
await press('v');
check('V reverses', (await state()).direction === -direction);
await press('x');
check('X stops', (await state()).mode === 'stop');
await press('x');
check('X again ejects', await until(() => window.__deck.state().door > 25));
await press('e');
check('E shuts the door', await until(() => window.__deck.state().door === 0));
await press('0');
check('0 resets the counter', (await state()).counterText === '000');
await press('p');
check('P switches the power off', !(await state()).powered);
await press('p');
check('…and on', (await state()).powered);

await press('s');
check('S toggles shuffle', (await page.getAttribute('#shuffle', 'aria-pressed')) === 'true');
await press('s');
await press('r');
check('R cycles repeat', (await page.textContent('#repeat')) !== 'Repeat: off');
await press('f');
check(
  'F enters focus mode',
  await page.evaluate(() => document.body.classList.contains('focus-mode')),
);
await press('Escape');
check(
  'Esc leaves it',
  !(await page.evaluate(() => document.body.classList.contains('focus-mode'))),
);
await press('t');
check('T starts the tour', await page.isVisible('#tour-caption'));
await press('Escape');
check('Esc leaves the tour', await page.isHidden('#tour-caption'));
await press('?');
check('? opens the shortcuts', await page.isVisible('#shortcuts-dialog'));
const rows = await page.locator('#shortcuts-body tr').count();
check(`…listing every shortcut (${rows} rows)`, rows >= 16);
await press('Escape');
check('Esc closes the dialog', await page.isHidden('#shortcuts-dialog'));

// Typing in a field is not taken for shortcuts.
await page.evaluate(() => (document.querySelector('#record-info').open = true));
const mode = (await state()).mode;
await page.focus('#info-title');
await page.keyboard.type('x p e');
check('shortcuts sleep while typing', (await state()).mode === mode && (await state()).powered);
await page.evaluate(() => document.activeElement?.blur());

// Tab reaches every transport twin, in the order they stand.
const order = [];
await page.focus('#power');
for (let i = 0; i < 10; i++) {
  order.push(await page.evaluate(() => document.activeElement?.id));
  await page.keyboard.press('Tab');
}
check(
  `Tab walks the transport in order (${order.join(' ')})`,
  order.slice(0, 9).join() === 'power,rew,play,ff,stop,pause,reverse,counter-reset,pitch',
);
check(
  'every transport twin has a name',
  await page.evaluate(() =>
    ['power', 'rew', 'play', 'ff', 'stop', 'pause', 'reverse', 'counter-reset'].every((id) => {
      const el = document.getElementById(id);
      return (el.getAttribute('aria-label') ?? el.textContent).trim().length > 0;
    }),
  ),
);

finish(errors);
await browser.close();
