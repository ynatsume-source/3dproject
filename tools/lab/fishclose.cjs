// LAB: a fish seen close in the sea — after the guide takes the camera to the species (goTo), the camera is set
// DIST metres beside one of its fish at its height (the sea stepped a moment so the near, finer copies pick it
// up), looking at it, and one frame drawn straight to the canvas (no post chain).
// Usage (a build served at PORT): node tools/lab/fishclose.cjs   (env PORT 4174, SEA maldives, IDS 'chromis,tang', DIST 1.2,
// SIZE 1280x800, OUT fishclose)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEA = process.env.SEA || 'maldives', IDS = (process.env.IDS || 'chromis').split(','), DIST = +(process.env.DIST || 1.2), OUT = process.env.OUT || 'fishclose';
  const [W, H] = (process.env.SIZE || '1280x800').split('x').map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=${process.env.TIER || 'lite'}&debug&lab&time=10:00&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  await p.waitForTimeout(2000);
  for (const id of IDS) {
    const info = await p.evaluate(({ id, DIST }) => {
      const s = window.seaglass; s.endOpening?.(); s.hold(true);
      const draws = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'], keep = {};
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of draws) if (C.prototype[f]) { keep[C.name + f] = C.prototype[f]; C.prototype[f] = function () {}; }
      s.goTo(id); s.advance(240, 0.05);
      const sys = s.cur.fish.find((f) => f.sp.id === id); if (!sys) return { err: 'no ' + id };
      const d = s.drone.pos; let at = null;
      // the fish of this species nearest the drone
      let best = 1e9;
      const fp = sys.dbg?.fp, dead = sys.dbg?.dead, n = sys.dbg?.total ?? 0;
      for (let i = 0; i < n; i++) { if (dead[i]) continue; const dd = Math.hypot(fp[i * 3] - d.x, fp[i * 3 + 1] - d.y, fp[i * 3 + 2] - d.z); if (dd < best) { best = dd; at = [fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]]; } }
      if (!at) return { err: 'no fish' };
      const pos = [at[0] + DIST * 0.8, at[1] + DIST * 0.15, at[2] + DIST * 0.6];
      d.set(...pos); s.advance(1, 0.001);
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of draws) if (keep[C.name + f]) C.prototype[f] = keep[C.name + f];
      // (follow the fish to where it is now)
      let nb = 1e9; for (let i = 0; i < n; i++) { if (dead[i]) continue; const dd = Math.hypot(fp[i * 3] - at[0], fp[i * 3 + 1] - at[1], fp[i * 3 + 2] - at[2]); if (dd < nb) { nb = dd; at = [fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]]; } }
      s.closeShot([at[0] + DIST * 0.8, at[1] + DIST * 0.15, at[2] + DIST * 0.6], at);
      return { near: sys.mesh.children[0]?.count ?? 'none' };
    }, { id, DIST });
    await p.screenshot({ path: `${OUT}/${SEA}-${id}.png` });
    console.log(id, JSON.stringify(info));
  }
  await b.close();
})();
