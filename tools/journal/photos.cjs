// Drawing the residents' photographs (島だより): each shot a resident chose to take in the day's run
// (scripts/journal-run.ts → DATA/photos/<id>.json) is drawn again in the real app, from its eyes, looking where it
// looked, at that hour, with the island as the run left it and the others where they were — nothing on the screen
// but the picture (?journalshot). Out: DATA/photos/<id>.jpg (1200×800).
// Usage (a build served at PORT): node tools/journal/photos.cjs [--data DIR]   (env PORT, default 4174; CHROME)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(arg('--data', 'journal-data')), PORT = process.env.PORT || 4174;
(async () => {
  const dir = path.join(DATA, 'photos');
  const todo = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).filter((p) => !fs.existsSync(path.join(dir, `${p.id}.jpg`)));
  if (!todo.length) { console.log('no photographs to draw'); return; }
  const storage = JSON.parse(fs.readFileSync(path.join(DATA, 'storage.json'), 'utf8'));
  // (as the run left it, but as if just saved: no catching up on a night that is not to be lived here)
  const saveKey = 'seaglass.residents.v1';
  if (storage[saveKey]) { const s = JSON.parse(storage[saveKey]); s.at = Date.now(); storage[saveKey] = JSON.stringify(s); }
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let ok = 0;
  for (const p of todo) {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, storage);
    const page = await ctx.newPage(); page.setDefaultTimeout(600000);
    page.on('pageerror', (e) => console.log(`  ${p.id}: page error ${e.message}`));
    const at = new Date(p.at).toISOString();
    await page.goto(`http://localhost:${PORT}/?tier=high&journalshot&nointro&wx=clear&at=${encodeURIComponent(at)}#kayama`, { waitUntil: 'commit' });
    const posed = await page.waitForFunction((rec) => !!window.seaglassShot && window.seaglassShot(rec), p, { timeout: 400000, polling: 1000 }).then(() => true, (e) => { console.log(`  ${p.id}: ${String(e.message).split('\n')[0].slice(0, 300)}`); return false; });
    if (!posed) { console.log(`  ${p.id}: the island did not come up`); await ctx.close(); continue; }
    // (a few seconds for the light, the trees round it and the detail to settle; posed again so nothing has moved)
    await page.waitForTimeout(6000);
    const how = await page.evaluate((rec) => window.seaglassShot(rec), p);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(dir, `${p.id}.jpg`), type: 'jpeg', quality: 86 });
    p.file = `photos/${p.id}.jpg`; fs.writeFileSync(path.join(dir, `${p.id}.json`), JSON.stringify(p));
    console.log(`  ${p.id}: ${p.subject.label} (${at}) ${how === true ? '' : how}`); ok++;
    await ctx.close();
  }
  await b.close();
  console.log(`drew ${ok} of ${todo.length}`);
  if (ok < todo.length) process.exitCode = 1;
})();
