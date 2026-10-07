// LAB: how much the app allocates as it runs (what the garbage collector must then clear: on a slow phone, its pauses
// are dropped frames), and where. One sea, nothing drawn (the GPU calls emptied; the rest of each frame, three.js's
// own walk of the scene included, runs as ever), the sea stepped 1/20 s a frame; after a minute's settling, V8's
// sampling heap profiler over SECS seconds of the sea's time: the MB allocated a second, and the functions that
// allocate most (by their own allocations). Best run on a build that is not minified, for the names:
//   npx vite build --minify false --outDir /tmp/devbuild && (cd /tmp/devbuild && python3 -m http.server 4177)
// Usage: node tools/lab/alloc.cjs   (env PORT 4177, SEA miyako, TIME 10:00, SECS 60, TOP 25, MODE cruise|watch|pip)
const { chromium } = require('playwright');
(async () => {
  const SEA = process.env.SEA || 'miyako', SECS = +(process.env.SECS || 60), TOP = +(process.env.TOP || 25), MODE = process.env.MODE || 'cruise';
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(3600000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4177}/?tier=lite&debug&lab&time=${process.env.TIME || '10:00'}&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  await p.waitForTimeout(2000);
  await p.evaluate((MODE) => {
    const s = window.seaglass; s.endOpening(); s.hold(true);
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
    s.advance(1200, 0.05);
    if (MODE === 'watch' && s.cur.residents) { s.startWatch(s.cur.residents.list[0].id); s.setPov(true); s.advance(100, 0.05); }
  }, MODE);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const t0 = Date.now();
  await p.evaluate((n) => window.seaglass.advance(n, 0.05), SECS * 20);
  const wall = (Date.now() - t0) / 1000;
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  // each function's own allocations, summed over the tree
  const by = new Map(); let total = 0;
  const walk = (n) => { const f = n.callFrame, key = `${f.functionName || '(anonymous)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`; by.set(key, (by.get(key) || 0) + n.selfSize); total += n.selfSize; for (const c of n.children) walk(c); };
  walk(profile.head);
  const MB = (x) => (x / 1048576).toFixed(1);
  console.log(`${SEA} ${MODE}: ${MB(total)} MB allocated over ${SECS} s of the sea (${MB(total / SECS)} MB/s of the sea's time; ${(SECS * 20)} frames, ${(total / (SECS * 20) / 1024).toFixed(0)} KB a frame; wall ${wall.toFixed(0)} s)`);
  for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(`  ${MB(v).padStart(6)} MB  ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
  await b.close();
})();
