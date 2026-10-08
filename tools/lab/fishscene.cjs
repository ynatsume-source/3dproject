// LAB: a fish as the auto camera meets it in the sea — tapped in the guide (goTo), the camera on its way and
// watching; screenshots at the given seconds after the tap. The sea is stepped 1/20 s a frame with nothing drawn
// between the shots, then one frame is drawn for each.
// Usage (a build served at PORT): node tools/lab/fishscene.cjs   (env PORT 4174, SEA maldives, ID wrasse, AT '12,16,20',
// SIZE '1280x800', TIME 10:00, OUT fishscene)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEA = process.env.SEA || 'maldives', ID = process.env.ID || 'wrasse', AT = (process.env.AT || '12,16,20').split(',').map(Number), OUT = process.env.OUT || 'fishscene';
  const [W, H] = (process.env.SIZE || '1280x800').split('x').map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=${process.env.TIER || 'lite'}&debug&lab&time=${process.env.TIME || '10:00'}&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  await p.waitForTimeout(2000);
  await p.evaluate((ID) => {
    const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(40, 0.05);
    window.__draw = {};
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (C.prototype[f]) { window.__draw[C.name + f] = C.prototype[f]; }
    window.__off = () => { for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (C.prototype[f]) C.prototype[f] = function () {}; };
    window.__on = () => { for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (window.__draw[C.name + f]) C.prototype[f] = window.__draw[C.name + f]; };
    window.__off(); s.goTo(ID); window.__t = 0;
  }, ID);
  for (const t of AT) {
    const info = await p.evaluate((t) => {
      const s = window.seaglass; window.__off();
      const n = Math.max(0, Math.round((t - window.__t) * 20) - 1); s.advance(n, 0.05); window.__t = t;
      window.__on(); s.advance(1, 0.05);
      const sh = s.director.shot, q = sh?.subject.pos?.();
      return { shot: sh ? `${sh.subject.label}/${sh.phase}` : '-', d: q ? +s.camera.position.distanceTo(q).toFixed(1) : null };
    }, t);
    await p.screenshot({ path: `${OUT}/${SEA}-${ID}-${W}x${H}-${t}s.png` });
    console.log(t, 's', info.shot, 'distance', info.d);
  }
  await b.close();
})();
