// Render the app's actual field-guide model under controlled light. Not a photograph or concept image.
// node docs/proposals/manta-remodel/capture.cjs http://127.0.0.1:4178 after [sea=miyako]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:4178', label = 'after', sea = 'miyako'] = process.argv.slice(2);
const dir = path.join(__dirname, 'images');
fs.mkdirSync(dir, { recursive: true });
const shots = [
  { name: 'overview', view: [0.65, 0.95, 1.15], zoom: 1.05, feed: 0 },
  { name: 'front-cruise', view: [0.1, 0.14, 1], zoom: 3.2, focus: [0, 0, 0.28], feed: 0 },
  { name: 'front-feeding', view: [0.1, 0.14, 1], zoom: 3.2, focus: [0, 0, 0.28], feed: 1 },
  { name: 'belly', view: [0.2, -1, 0.5], zoom: 1.1, feed: 0.7 },
  { name: 'dorsal', view: [0, 1, 0.03], zoom: 1.1, feed: 0 },
  { name: 'side', view: [1, 0.12, 0.22], zoom: 1.1, feed: 0 },
];
(async () => {
  const errors = [], externalFailures = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text()); });
    page.on('requestfailed', r => { if (!r.url().startsWith(base)) externalFailures.push({ url: r.url(), error: r.failure()?.errorText }); });
    await page.goto(`${base}/?debug&tier=low&at=2026-06-20T03:00:00Z#${sea}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(id => window.seaglass?.cur?.loc.id === id && !document.getElementById('veil').classList.contains('on'), sea, { timeout: 180000 });
    await page.evaluate(() => { seaglass.clock.speed = 0; seaglass.setWx({ cloud: 0.1, wind: 2 }); });
    const captured = [];
    for (const pose of shots) {
      const result = await page.evaluate(p => {
        const s = seaglass, oldTime = s.U.uTime.value;
        s.U.uTime.value = 0;
        const set = { uFeed: p.feed, uMouth: -1, uPhase: 1.1, uBeat: 0, uAmp: 1, uSeed: 17, uBank: 0, uAir: 0 };
        const png = s.studio('manta', p.view, p.zoom, p.focus || null, set);
        s.U.uTime.value = oldTime;
        return { png, set };
      }, pose);
      assert.ok(result.png.startsWith('data:image/png;base64,'));
      const filename = `${label}-${pose.name}.png`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(result.png.split(',')[1], 'base64'));
      captured.push({ ...pose, file: filename, uniforms: result.set });
    }
    const state = await page.evaluate(() => {
      const s = seaglass, gl = document.getElementById('scene').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { sea: s.cur.loc.id, vertices: s.cur.mantas[0].mesh.geometry.attributes.position.count,
        triangles: s.cur.mantas[0].mesh.geometry.index.count / 3, glError: gl.getError(), contextLost: gl.isContextLost(),
        renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        scripts: [...document.scripts].filter(x => x.type === 'module').map(x => x.src) };
    });
    const report = { capturedAt: new Date().toISOString(), label, state, portraits: { width: 800, height: 500, time: 0, shots: captured }, errors, externalFailures };
    fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(report, null, 2));
    assert.deepEqual(errors, []); assert.equal(state.glError, 0); assert.equal(state.contextLost, false);
    console.log(JSON.stringify({ label, state, images: captured.map(x => x.file), errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
