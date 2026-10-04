// LAB film: the jacks at their spot, wound up into a tornado by the tide, recorded frame by frame (the sim stepped
// at a fixed 1/FPS per frame, true speed however slow the renderer). Frames go to OUT as PNGs; join with
//   ffmpeg -framerate 24 -i OUT/f%04d.png -pix_fmt yuv420p jacks.mp4
// Usage (a build served at PORT): node tools/lab/jacksfilm.cjs   (env PORT 4174, SEA miyako, SECS 20, FPS 24, OUT, W/H,
// K: 'tornado' (default: a day the stream runs hard) or 'slack' (the lazy wheel))
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const OUT = process.env.OUT || 'film', FPS = +(process.env.FPS || 24), SECS = +(process.env.SECS || 20), SEA = process.env.SEA || 'miyako';
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } })).newPage();
  p.setDefaultTimeout(900000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=${process.env.TIER || 'lite'}&debug&lab&time=${process.env.TIME || '10:00'}&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const s = window.seaglass; s.endOpening(); s.hold(true); });
  if (!process.env.HUD) await p.addStyleTag({ content: 'body > *:not(#scene) { visibility: hidden !important; } body > *:not(#scene) * { visibility: hidden !important; }' });
  // the drone sent to the spot; the sea run on (no drawing) until the school has wound up (or settled)
  const fast = await p.evaluate((K) => {
    const s = window.seaglass, oc = s.cur, J = oc.jacks;
    if (!J) return { err: 'no jacks here' };
    if (K !== 'slack') J.surge();
    s.goTo('gingameaji'); s.advance(10, 1 / 10);
    let t = 0;
    for (; t < 240 && (K === 'slack' ? t < 30 : J.st.k < 0.8); t += 0.1) {
      const fx = -Math.sin(s.drone.yaw), fz = -Math.cos(s.drone.yaw);
      oc.eco.step(0.1, s.U.uTime.value += 0.1, s.drone.pos, fx, fz);
      if ((t * 10 | 0) % 50 === 0) { s.drone.pos.x += (J.st.c.x + 16 - s.drone.pos.x) * 0.5; s.drone.pos.z += (J.st.c.z - s.drone.pos.z) * 0.5; s.drone.pos.y = Math.min(J.home.y + 5, -2); }
    }
    s.goTo('gingameaji'); s.advance(24 * 6, 1 / 24);
    return { t: +t.toFixed(0), k: +J.st.k.toFixed(2), home: J.home.toArray().map((v) => +v.toFixed(1)), n: J.st.alive };
  }, process.env.K || 'tornado');
  console.log('ran on', fast);
  const n = SECS * FPS;
  for (let i = 0; i < n; i++) {
    await p.evaluate(([f, view, i]) => {
      const s = window.seaglass, J = s.cur.jacks;
      if (view === 'side') {
        // (from outside, as in a diver's photograph: 17 m off, level with its middle, drifting slowly round it)
        const a = 0.6 + i / f * 0.03, d = 17, y = (Math.max(J.home.y + 2.5, -18) + Math.min(Math.max(J.home.y + 2.5, -18) + 12, -1.5)) / 2 - 1.5;
        const x = J.st.c.x + Math.cos(a) * d, z = J.st.c.z + Math.sin(a) * d;
        s.drone.mode = 'manual'; s.drone.pos.set(x, y, z); s.drone.yaw = Math.atan2(-(J.st.c.x - x), -(J.st.c.z - z)); s.drone.pitch = 0.12;
      }
      s.advance(1, 1 / f);
      if (view === 'side') { s.camera.position.copy(s.drone.pos); s.camera.rotation.set(s.drone.pitch, s.drone.yaw, 0, 'YXZ'); }
    }, [FPS, process.env.VIEW || 'director', i]);
    await p.screenshot({ path: `${OUT}/f${String(i).padStart(4, '0')}.png` });
    if (i % 48 === 0) console.log(i, await p.evaluate(() => { const s = window.seaglass, J = s.cur.jacks; return `k ${J.st.k.toFixed(2)} cam ${s.camera.position.distanceTo(J.st.c).toFixed(1)} m (y ${s.camera.position.y.toFixed(1)}) shot ${s.director.shot?.subject.label ?? '-'} ${s.director.shot?.phase ?? ''}`; }));
  }
  await b.close();
})();
