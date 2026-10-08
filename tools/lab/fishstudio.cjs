// LAB: portraits of fish models (the ?debug studio: the model alone under clear light, its own scale), from the
// side, three-quarter front, front, above and a close-up of the head, written as PNGs to OUT/<id>-<view>.png.
// Usage (a build served at PORT): node tools/lab/fishstudio.cjs   (env PORT 4174, SEA maldives, IDS 'wrasse,tamakai',
// OUT fishshots, T: the swim time in seconds to pose at, default 0.6; for motion: TS '0,0.2,0.4' and VIEW top, one
// picture per time; SWIM 4: the fish's beat, else it is posed still)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEA = process.env.SEA || 'maldives', IDS = (process.env.IDS || 'wrasse').split(','), OUT = process.env.OUT || 'fishshots', T = +(process.env.T || 0.6);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  p.setDefaultTimeout(600000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=10:00&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  const VIEWS = { side: [[1, 0.12, 0.05], 1, null], q3: [[0.8, 0.25, 0.75], 1.05, null], front: [[0.12, 0.08, 1], 1.1, null], top: [[0.3, 1, 0.15], 1, null], head: [[0.9, 0.18, 0.6], 2.6, [0, 0.03, 0.3]] };
  const TS = process.env.TS ? process.env.TS.split(',').map(Number) : [T];
  const views = process.env.VIEW ? process.env.VIEW.split(',') : Object.keys(VIEWS);
  for (const id of IDS) for (const v of views) for (const t of TS) {
    const [dir, zoom, focus] = VIEWS[v];
    const url = await p.evaluate(({ id, dir, zoom, focus, t, swim }) => { const s = window.seaglass; s.U.uTime.value = t; return s.studio(id, dir, zoom, focus, swim ? { swim } : {}); }, { id, dir, zoom, focus, t, swim: +(process.env.SWIM || 0) });
    if (!url) { console.log('no model', id); break; }
    fs.writeFileSync(`${OUT}/${id}-${v}${TS.length > 1 ? '-' + t : ''}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('done', IDS.join(' '));
  await b.close();
})();
