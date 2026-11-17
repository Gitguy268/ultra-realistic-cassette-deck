// The 3D deck answers the pointer like the real one: each key, switch, button, knob and the door,
// picked on the model, does what its twin does and moves as it should.
// Usage: npm run build && npm run preview, then: node scripts/check-parts.js
import { check, clickPart, finish, openDeck } from './lib.js';

const { browser, page, errors, state, until } = await openDeck({ width: 1440, height: 900 });
// The control view: the face fills the frame.
await page.keyboard.press('f');
await page.waitForTimeout(2300);
const keyZ = (name) =>
  page.evaluate((n) => window.__deck.stage.world.deck.keys[n].position.z, name);
const restZ = await keyZ('play');

await clickPart(page, 'key:play');
check('the Play key on the model plays', await until(() => window.__deck.state().engine.playing));
await page.waitForTimeout(400);
const latched = await keyZ('play');
check(
  `…and stays down, latched (${((restZ - latched) * 1000).toFixed(1)} mm)`,
  restZ - latched > 0.002,
);
await clickPart(page, 'key:pause');
await page.waitForTimeout(300);
check('the Pause key pauses', (await state()).paused);
await clickPart(page, 'key:pause');
await clickPart(page, 'key:stop');
await page.waitForTimeout(400);
check('the Stop key stops', (await state()).mode === 'stop');
check(
  '…and Play comes back up',
  await until(
    (z) => Math.abs(window.__deck.stage.world.deck.keys.play.position.z - z) < 0.0003,
    restZ,
  ),
);
await clickPart(page, 'key:rec');
check(
  'Record says this deck only plays',
  (await page.textContent('#status')).includes('only plays'),
);

const counterWheel = () =>
  page.evaluate(() => window.__deck.stage.world.deck.counterWheels[2].rotation.x);
await clickPart(page, 'key:play');
await page.waitForTimeout(2500);
const w0 = await counterWheel();
await page.waitForTimeout(1500);
check('the counter wheels turn with the tape', (await counterWheel()) !== w0);
const reels = () =>
  page.evaluate(() => window.__deck.stage.world.deck.reels.map((r) => r.rotation.z));
const r0 = await reels();
await page.waitForTimeout(500);
const r1 = await reels();
check('both reels turn', r0[0] !== r1[0] && r0[1] !== r1[1]);
const needles = await page.evaluate(() =>
  window.__deck.stage.world.deck.needles.map((n) => n.rotation.z),
);
check(
  `the VU needles lift off the stop (${needles.map((v) => v.toFixed(2))})`,
  needles.every((v) => v < 0.7),
);
await clickPart(page, 'key:stop');

await clickPart(page, 'counterReset');
await page.waitForTimeout(150);
check('the counter reset button zeroes it', (await state()).counterText === '000');

const before = await page.inputValue('#nr');
const knobX = () => page.evaluate(() => window.__deck.stage.world.deck.switches.nr.position.x);
const x0 = await knobX();
await clickPart(page, 'switch:nr');
await page.waitForTimeout(400);
check(
  `the NR switch on the model steps the setting (${before} → ${await page.inputValue('#nr')})`,
  (await page.inputValue('#nr')) !== before,
);
check('…and its knob slides', (await knobX()) !== x0);
await clickPart(page, 'switch:tapeType');
await page.waitForTimeout(100);
check('the tape selector too', (await page.inputValue('#tape-type')) !== 'II');

const level = Number(await page.inputValue('#volume'));
const at = await page.evaluate(() => window.__deck.project('levelKnob'));
await page.mouse.move(at[0], at[1]);
await page.mouse.down();
await page.mouse.move(at[0], at[1] - 60, { steps: 6 });
await page.mouse.up();
check(
  `turning the level knob raises the output (${level} → ${await page.inputValue('#volume')})`,
  Number(await page.inputValue('#volume')) > level,
);

await clickPart(page, 'power');
await page.waitForTimeout(150);
check('the power switch switches off', !(await state()).powered);
await clickPart(page, 'power');
await page.waitForTimeout(150);

await clickPart(page, 'door');
check('a click on the door ejects it', await until(() => window.__deck.state().door > 25));
await page.waitForTimeout(300);
await clickPart(page, 'cassette');
check(
  'a click on the cassette in the open door takes it out',
  await until(() => !window.__deck.state().inDeck),
);
check(
  '…onto the credenza',
  await until(() => window.__deck.stage.world.deck.cassette.parent.name === 'tableSpot'),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(2300);
await page.dblclick('canvas#scene', {
  position: await page.evaluate(() => {
    const [x, y] = window.__deck.project('cassette');
    return { x, y };
  }),
});
check('a double-click turns it over', await until(() => window.__deck.state().faceUp === 1));
await page.waitForTimeout(800);
await clickPart(page, 'cassette');
check('a click puts it back in the door', await until(() => window.__deck.state().inDeck));
await page.keyboard.press('f');
await page.waitForTimeout(2300);
// On the frame above the window: the middle of the open door is the cassette.
await clickPart(page, 'doorPanel', {}, [0.5, 0.93, 1]);
check('a click on the door shuts it', await until(() => window.__deck.state().door === 0));
await clickPart(page, 'key:play');
const after = await until(
  () => window.__deck.state().mode === 'play' && window.__deck.state().faceUp === 1,
);
const s = await state();
check(
  `…and the other side plays (mode ${s.mode}, side ${s.side}, spot ${s.spot.kind})`,
  after && s.side === 'B',
);

finish(errors);
await browser.close();
