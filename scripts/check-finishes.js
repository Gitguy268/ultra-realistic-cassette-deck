// Every finish is a material preset on the face, the wrap and the keys; walnut is a veneer wrap.
// Usage: npm run build && npm run preview, then: node scripts/check-finishes.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-cassette.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);

const material = () =>
  page.evaluate(() => {
    const { face, wrap, key, silkscreen } = window.__deck.stage.world.materials;
    return {
      face: face.color.getHexString(),
      wrap: wrap.color.getHexString(),
      wrapMap: !!wrap.map,
      key: key.color.getHexString(),
      ink: silkscreen.color.getHexString(),
    };
  });
const set = async (name) => {
  await page.selectOption('#plinth', name);
  await page.waitForTimeout(300);
  return material();
};
const seen = new Set();
for (const name of ['silver', 'black', 'champagne', 'walnut']) {
  const m = await set(name);
  seen.add(JSON.stringify(m));
  check(
    `${name} applies`,
    await page.evaluate((n) => document.documentElement.dataset.plinth === n, name),
  );
}
check(`each finish is its own material (${seen.size})`, seen.size === 4);
const walnut = await set('walnut');
check('walnut has a veneer wrap', walnut.wrapMap);
check(
  '…and the Wood class on the root',
  await page.evaluate(() => document.querySelector('#app').classList.contains('theme-wood')),
);
const black = await set('black');
const silver = await set('silver');
check('the black face prints in light ink, the silver in dark', black.ink > silver.ink);
check('leaving walnut gives the painted wrap back', !silver.wrapMap);

finish(errors);
await browser.close();
