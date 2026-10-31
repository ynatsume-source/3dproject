// LAB: Dot's world — the young trees by the hut, the beach's trees from the lagoon, and the island's edge from a little up
// (for the beach trees in Dot's world: docs/proposals/native-beach-2026-10-31). Usage (a build served at PORT):
// PORT=4174 TAG=after OUT=native node tools/lab/native-look.cjs
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const OUT = process.env.OUT, TAG = process.env.TAG; fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT}/?tier=high&debug&lab&time=10:00&wx=clear#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  const views = await p.evaluate(() => {
    const s = window.seaglass; s.endOpening?.(); s.hold(true);
    const T = s.cur.T, f = s.cur.loc.f, home = s.cur.residents.list.find((x) => x.id === 'dot').sp.home;
    // the young trees: the one-instance meshes the residents drew them with
    const sap = []; const P = new (s.camera.position.constructor)();
    s.cur.group.traverse((o) => { if (o.isInstancedMesh && o.count === 1 && o.parent && o.parent.parent && o.parent.parent.isGroup && o.userData.shared) { o.getWorldPosition(P); if (Math.hypot(P.x - home[0], P.z - home[1]) < 14) sap.push([P.x, P.y, P.z]); } });
    const c = sap.slice(0, 3).reduce((a, q) => [a[0] + q[0] / 3, a[1] + q[1] / 3, a[2] + q[2] / 3], [0, 0, 0]);
    // the way out to sea from home: the lowest ground nearby
    let best = null; for (let a = 0; a < 6.28; a += 0.2) { const x = home[0] + Math.cos(a) * 60, z = home[1] + Math.sin(a) * 60; const h = f(x, z); if (!best || h < best[2]) best = [x, z, h, a]; }
    const dx = Math.cos(best[3]), dz = Math.sin(best[3]);
    const look = (pos, at) => { const d = [at[0] - pos[0], at[1] - pos[1], at[2] - pos[2]], l = Math.hypot(...d); return [pos, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)]; };
    return {
      saplings: sap.length,
      young: look([c[0] + 6, c[1] + 1.7, c[2] + 4], [c[0], c[1] + 1.3, c[2]]),
      beach: look([home[0] + dx * 70, 1.6, home[1] + dz * 70], [home[0], 6, home[1]]),
      edge: look([home[0] + dx * 150 + dz * 40, 28, home[1] + dz * 150 - dx * 40], [home[0], 4, home[1]]),
    };
  });
  console.log('saplings found', views.saplings);
  for (const k of ['young', 'beach', 'edge']) {
    await p.evaluate(async (v) => { const s = window.seaglass; s.aim(v[0], v[1], v[2]); s.advance(30, 0.1); await new Promise((r) => setTimeout(r, 500)); }, views[k]);
    const fn = `${OUT}/${k}-${TAG}.png`; await p.screenshot({ path: fn }); console.log(k, fn, JSON.stringify(views[k]));
  }
  await b.close();
})();
