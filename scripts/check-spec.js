// The app's spec and the spec inlined in the single file must be equal, so the two builds cannot
// drift. Run after `npm run build:single`.
import { readFileSync } from 'node:fs';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const app = JSON.parse(read('../src/spec/deck.json'));
const html = read('../dist-single/index.html');
const inlined = /<script type="application\/json" id="deck-spec">([\s\S]*?)<\/script>/.exec(html);
let failed = false;
const same = (label, value) => {
  const ok = JSON.stringify(value) === JSON.stringify(app);
  console.log(`${ok ? '✓' : '✗'} ${label} matches src/spec/deck.json`);
  failed ||= !ok;
};
if (!inlined) {
  console.log('✗ dist-single/index.html carries no #deck-spec');
  failed = true;
} else same('the single file’s #deck-spec', JSON.parse(inlined[1]));
process.exit(failed ? 1 : 0);
