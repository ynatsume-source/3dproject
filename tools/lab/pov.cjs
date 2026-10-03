// LAB check (Kayama review A2): through a resident's eyes, the camera is at the model's own eyes and looks the
// way its head faces. For each resident: the camera's distance from its eye node (want 0), and once the view has
// settled, the angle between the view and the head's forward (want < 2°). Also how high the eye is above the
// ground under it (before the fix Kamemaru's view sat 3.7 m up, on the canopy/floor clamp).
// Usage (a build served at PORT): node tools/lab/pov.cjs   (env PORT, default 4174; CHROME for the browser)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(400000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=low&debug&lab&time=noon&wx=clear#kayama`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.residents, null, { timeout: 350000 });
  await p.waitForTimeout(8000);
  let bad = 0;
  for (const id of ['dot', 'kame', 'rakko', 'lantern']) {
    await p.evaluate((id) => { const s = window.seaglass; s.startWatch(id); s.setPov(true); }, id);
    await p.waitForTimeout(4000);
    const r = await p.evaluate(() => {
      const s = window.seaglass, r = s.watch.r;
      for (let i = 0; i < 80; i++) s.stepDrone(0.05);   // (let the view settle on the head; a slow software renderer draws few frames)
      const sn = s.cur.residents.sense(r), d = s.drone;
      const fx = -Math.sin(d.yaw) * Math.cos(d.pitch), fy = Math.sin(d.pitch), fz = -Math.cos(d.yaw) * Math.cos(d.pitch);
      const ang = sn.look ? Math.acos(Math.max(-1, Math.min(1, sn.look.x * fx + sn.look.y * fy + sn.look.z * fz))) * 180 / Math.PI : NaN;
      return { dist: d.pos.distanceTo(sn.eye), ang, up: sn.eye.y - s.cur.T.h(sn.eye.x, sn.eye.z), act: r.act };
    });
    const ok = r.dist < 0.01 && r.ang < 2;
    if (!ok) bad++;
    console.log(`${id}: camera to eye ${r.dist.toFixed(3)} m, view vs head ${r.ang.toFixed(1)}°, eye ${r.up.toFixed(2)} m above the ground (${r.act}) ${ok ? 'ok' : 'FAIL'}`);
  }
  await b.close();
  console.log(bad ? `FAIL (${bad})` : 'PASS');
  if (bad) process.exit(1);
})();
