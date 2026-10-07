// LAB: does anything pile up in memory over a long visit? One page, nothing drawn (the GPU calls emptied: what is
// measured is what the app keeps, not what the GPU holds), the sea stepped 1/20 s a frame. After each minute of the
// sea's time, a full garbage collection, then: the JS heap in use, what the scene holds (objects, distinct geometries,
// materials, textures), and the DOM's element count. Three stages, one after the other:
//   cruise — CRUISE minutes of the default auto camera;
//   rare   — each rare sight the sea can have, started and run out (3 min each), twice round;
//   seas   — to SEA2 and back, SWITCH times (each sea built once; how much a visit to another costs, and whether coming
//            back costs more each time).
// Want: after the first minutes, the heap and the counts level off (a few % up and down with what is about), not a
// steady climb. Usage (a build served at PORT): node tools/lab/memory.cjs   (env PORT 4174, SEA miyako, SEA2 kayama,
// CRUISE 15, SWITCH 3, TOUR 'gbr,maldives,redsea,miyako': the seas gone round instead of SEA2 and back)
const { chromium } = require('playwright');
(async () => {
  const SEA = process.env.SEA || 'miyako', SEA2 = process.env.SEA2 || 'kayama', CRUISE = +(process.env.CRUISE || 15), SWITCH = +(process.env.SWITCH || 3);
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(3600000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=10:00&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  await p.waitForTimeout(3000);
  const cdp = await p.context().newCDPSession(p);
  await p.evaluate(() => {
    const s = window.seaglass; s.endOpening(); s.hold(true);
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
  });
  const rows = [];
  const sample = async (stage, t) => {
    await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
    const h = await cdp.send('Runtime.getHeapUsage');
    const c = await p.evaluate(() => {
      const s = window.seaglass, geo = new Set(), mat = new Set(), tex = new Set(); let obj = 0;
      s.scene.traverse((o) => {
        obj++;
        if (o.geometry) geo.add(o.geometry.uuid);
        for (const m of [].concat(o.material || [])) { mat.add(m.uuid); for (const k in m) { const v = m[k]; if (v && v.isTexture) tex.add(v.uuid); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) tex.add(v.uuid); } }
      });
      const g = s.gpu?.() ?? {};
      return { obj, geo: geo.size, mat: mat.size, tex: tex.size, dom: document.getElementsByTagName('*').length, sea: s.cur.loc.id, gpuGeo: g.geometries, gpuTex: g.textures, programs: g.programs, kept: (g.seas || []).join('+') };
    });
    const r = { stage, t, heapMB: +(h.usedSize / 1048576).toFixed(1), ...c };
    rows.push(r); console.log(JSON.stringify(r));
  };
  const minutes = (n) => p.evaluate((n) => window.seaglass.advance(n * 1200, 0.05), n);
  await sample('start', 0);
  for (let m = 1; m <= CRUISE; m++) { await minutes(1); await sample('cruise', m); }
  for (let round = 0; round < 2; round++) for (const id of ['mantatrain', 'fishwall', 'tornado', 'hammers', 'heatrun', 'bigbait', 'spawning']) {
    const ok = await p.evaluate((id) => { try { return !!window.seaglass.rare(id); } catch (e) { return false; } }, id).catch(() => false);
    if (!ok) continue;
    await minutes(3); await sample('rare:' + id, round);
  }
  const TOUR = (process.env.TOUR || '').split(',').filter(Boolean);
  for (let k = 0; k < SWITCH; k++) for (const sea of TOUR.length ? TOUR : [SEA2, SEA]) {
    await p.evaluate(async (sea) => { const s = window.seaglass; s.hold(false); await s.dive(sea); }, sea);
    await p.waitForFunction((sea) => !!(window.seaglass.cur && window.seaglass.cur.loc.id === sea && window.seaglass.cur.eco), sea, { timeout: 600000 });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const s = window.seaglass; s.endOpening(); s.hold(true); });
    await minutes(2); await sample('sea:' + sea, k);
  }
  // the verdict: from the cruise's 3rd minute to its end, and across the trips to the other sea and back
  const cr = rows.filter((r) => r.stage === 'cruise' && r.t >= 3), first = cr[0], last = cr[cr.length - 1];
  const back = rows.filter((r) => r.stage === 'sea:' + SEA);
  const d = (a, b, k) => (b[k] - a[k]);
  if (first && last) console.log(`cruise min ${first.t}→${last.t}: heap ${first.heapMB}→${last.heapMB} MB (${d(first, last, 'heapMB') >= 0 ? '+' : ''}${d(first, last, 'heapMB').toFixed(1)}), objects ${first.obj}→${last.obj}, geometries ${first.geo}→${last.geo}, materials ${first.mat}→${last.mat}, textures ${first.tex}→${last.tex}, DOM ${first.dom}→${last.dom}`);
  if (back.length > 1) console.log(`back in ${SEA} after each trip: heap ${back.map((r) => r.heapMB).join(' → ')} MB, objects ${back.map((r) => r.obj).join(' → ')}, geometries ${back.map((r) => r.geo).join(' → ')}, textures ${back.map((r) => r.tex).join(' → ')}, DOM ${back.map((r) => r.dom).join(' → ')}`);
  await b.close();
})();
