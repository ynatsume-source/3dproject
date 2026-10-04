// LAB film: the bait ball and its hunters, recorded frame by frame (the sim stepped at a fixed 1/FPS per frame, so
// the film runs at true speed however slow the software renderer is). Frames go to OUT as PNGs; join them with
//   ffmpeg -framerate 24 -i OUT/f%04d.png -pix_fmt yuv420p -vf scale=trunc(iw/2)*2:trunc(ih/2)*2 bait.mp4
// Usage (a build served at PORT): node tools/lab/baitfilm.cjs   (env PORT 4174, SEA miyako, SECS 20, FPS 24, OUT, W/H)
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
  // (the view alone, as a recording from the app is: no menus or captions)
  if (!process.env.HUD) await p.addStyleTag({ content: 'body > *:not(#scene) { visibility: hidden !important; } body > *:not(#scene) * { visibility: hidden !important; }' });
  // the hunters made hungry and the drone sent to the school; then the sea run on (no drawing) until a ball is pressed
  const fast = await p.evaluate((FPS) => {
    const s = window.seaglass, oc = s.cur, B = oc.bait;
    s.goTo('bait'); s.advance(30, 1 / 10);
    let t = 0;
    for (; t < 900 && !(B.st.phase === 'herd' || B.st.phase === 'frenzy'); t += 0.1) {
      const fx = -Math.sin(s.drone.yaw), fz = -Math.cos(s.drone.yaw);
      for (const ev of oc.eco.step(0.1, s.U.uTime.value += 0.1, s.drone.pos, fx, fz)) { /* (told in the film itself) */ }
      if ((t * 10 | 0) % 50 === 0) { s.drone.pos.x += (B.st.c.x + 18 - s.drone.pos.x) * 0.5; s.drone.pos.z += (B.st.c.z - s.drone.pos.z) * 0.5; s.drone.pos.y = Math.min(B.st.c.y + 1, -2); }
    }
    s.goTo('bait'); s.advance(FPS * 4, 1 / FPS);
    return { t: +t.toFixed(0), phase: B.st.phase, preds: (B.dbg?.packs || []).map((k) => k.list?.length) };
  }, FPS);
  console.log('ran on', fast);
  const n = SECS * FPS;
  for (let i = 0; i < n; i++) {
    await p.evaluate((f) => window.seaglass.advance(1, 1 / f), FPS);
    await p.screenshot({ path: `${OUT}/f${String(i).padStart(4, '0')}.png` });
    if (i % 48 === 0) console.log(i, await p.evaluate(() => { const B = window.seaglass.cur.bait; const st = B.st, m = B.mesh || window.seaglass.cur.group.children.find((o) => o.isInstancedMesh && o.count >= 1000 && o.count === B.dbg.NB), E = m.instanceMatrix.array; let sd = 0, k = 0; for (let j = 0; j < m.count; j += 37) { if (!E[j * 16 + 15] || !(E[j * 16] || E[j * 16 + 2])) continue; sd += Math.hypot(E[j * 16 + 12] - st.c.x, E[j * 16 + 13] - st.c.y, E[j * 16 + 14] - st.c.z); k++; } return `${st.phase} ballK ${st.ballK.toFixed(2)} r ${st.r.toFixed(1)} y ${st.c.y.toFixed(1)} fish from middle ${(sd / k).toFixed(1)} m; cam ${window.seaglass.camera.position.distanceTo(st.c).toFixed(1)} m; alive ${st.alive} pressing ${st.pressure} shot ${window.seaglass.director.shot?.subject.label ?? '-'}`; }));
  }
  await b.close();
})();
