// LAB: portraits of a guide model in given poses (the ?debug studio, see fishstudio.cjs): each shot is a view and a
// set of pose values handed to the model (e.g. a sea lion's stroke phase, its flippers held out, its head turned).
// Usage (a build served at PORT): node tools/lab/posestudio.cjs   (env PORT 4174, SEA galapagos, ID sealion, OUT poseshots,
// SHOTS JSON: [{ "name": "side", "view": [1, 0.1, 0.05], "zoom": 1, "focus": null, "set": { "ph": 1 } }, ...])
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEA = process.env.SEA || 'galapagos', ID = process.env.ID || 'sealion', OUT = process.env.OUT || 'poseshots';
  const SHOTS = JSON.parse(process.env.SHOTS || '[{"name":"side","view":[1,0.12,0.05]},{"name":"q3","view":[0.8,0.3,0.75]},{"name":"front","view":[0.12,0.08,1]},{"name":"top","view":[0.3,1,0.15]}]');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  p.setDefaultTimeout(600000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=10:00&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  for (const s of SHOTS) {
    const url = await p.evaluate(({ id, s }) => window.seaglass.studio(id, s.view, s.zoom || 1, s.focus || null, s.set || {}), { id: ID, s });
    if (!url) { console.log('no model', ID); break; }
    fs.writeFileSync(`${OUT}/${ID}-${s.name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('done', ID, SHOTS.length);
  await b.close();
})();
