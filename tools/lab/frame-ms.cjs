// LAB: how long one frame's work takes, apart from drawing (the GPU calls emptied), in a sea after a minute of the
// default cruise: the mean and the slowest tenth over 600 frames — to compare builds (a frame's time is the sea's
// time on a slow phone: over 50 ms, the sea itself slows down).
// Usage: node tools/lab/frame-ms.cjs   (env PORT 4174, SEA miyako)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(1800000);
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=10:00&wx=clear#${process.env.SEA || 'miyako'}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(5, 0.05);
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
    s.advance(1200, 0.05);
    const ms = [];
    for (let i = 0; i < 600; i++) { const t0 = performance.now(); s.advance(1, 0.05); ms.push(performance.now() - t0); }
    ms.sort((a, b) => a - b);
    return { mean: ms.reduce((a, x) => a + x, 0) / ms.length, p90: ms[Math.floor(ms.length * 0.9)], max: ms[ms.length - 1] };
  });
  console.log(`frame work (no drawing): mean ${r.mean.toFixed(1)} ms, slowest tenth ${r.p90.toFixed(1)} ms, worst ${r.max.toFixed(1)} ms`);
  await b.close();
})();
