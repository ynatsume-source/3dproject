// LAB: the island's plants and things, seen at the four places the nature-look request names
// (docs/proposals/nature-look-2026-10-09): Dot's homestead from a little above, the forest's edge at eye height, the
// beach's driftwood and rocks close to, and inside the forest. The places are found from Dot's home the same way every
// time, so before and after can be shot from the same spots. Each is held there (seaglass.aim) and drawn through the
// whole drawing path at noon.
// Usage (a build served at PORT): node tools/lab/island.cjs   (env PORT 4174, OUT island, TAG now, TIER high, SIZE 1280x720,
// TIME 12:00, ONLY 'homestead,edge,beach,inside')
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const OUT = process.env.OUT || 'island', TAG = process.env.TAG || 'now';
  const [W, H] = (process.env.SIZE || '1280x720').split('x').map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=${process.env.TIER || 'high'}&debug&lab&time=${process.env.TIME || '12:00'}&wx=clear#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.shore), null, { timeout: 600000 });
  // (the HUD's marks that point at something in the scene — a new sighting, a subject's ring — would be left from the sea
  // the page opens in: the camera is put down on the island at once, as no camera moves. Hidden for these shots)
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  const poses = await p.evaluate(() => {
    const s = window.seaglass; s.endOpening?.();
    const T = s.cur.T, sh = s.cur.shore, home = [61, -145];
    const can = (x, z) => T.landCover(x, z).can, g = (x, z) => s.cur.loc.f(x, z);   // (the land itself: T.ground has the treetops over it)
    const look = (from, at) => { const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]], l = Math.hypot(...d); return { pos: from, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(d[1] / l) }; };
    const out = {};
    // the homestead, from a little above
    { const t = [home[0], g(home[0], home[1]) + 0.5, home[1]]; out.homestead = look([t[0] + 9, t[1] + 7, t[2] + 9], t); }
    // the forest's edge: the nearest point to home where the forest starts, seen from the open ground 9 m off
    let best = null;
    for (let r = 6; r < 80 && !best; r += 2) for (let a = 0; a < 6.28 && !best; a += 0.1) {
      const x = home[0] + Math.cos(a) * r, z = home[1] + Math.sin(a) * r;
      if (can(x, z) > 0.7 && can(x - Math.cos(a) * 9, z - Math.sin(a) * 9) < 0.15 && g(x, z) > 0.5) best = [x, z, a];
    }
    if (best) { const [x, z, a] = best, cx = x - Math.cos(a) * 9, cz = z - Math.sin(a) * 9; out.edge = look([cx, g(cx, cz) + 1.6, cz], [x, g(x, z) + 2.2, z]); }
    // the beach: the nearest washed-up log to home, from 3.5 m to its side
    const d0 = sh.lists.drift.slice().sort((u, v) => (u.x - home[0]) ** 2 + (u.z - home[1]) ** 2 - (v.x - home[0]) ** 2 - (v.z - home[1]) ** 2)[0];
    if (d0) { const sx = -Math.sin(d0.ry), sz = -Math.cos(d0.ry), cx = d0.x + sx * 3.5 + Math.cos(d0.ry) * 1.5, cz = d0.z + sz * 3.5 - Math.sin(d0.ry) * 1.5; out.beach = look([cx, g(cx, cz) + 1.4, cz], [d0.x, d0.y + 0.2, d0.z]); }
    // inside the forest: the nearest deep forest to home, looking level along it
    let inn = null;
    for (let r = 10; r < 120 && !inn; r += 3) for (let a = 0; a < 6.28 && !inn; a += 0.15) {
      const x = home[0] + Math.cos(a) * r, z = home[1] + Math.sin(a) * r;
      if (can(x, z) > 0.85 && [0, 1, 2, 3, 4, 5].every((k) => can(x + Math.cos(k * 1.05) * 10, z + Math.sin(k * 1.05) * 10) > 0.7) && !(T.solids && T.solids.hit && T.solids.hit(x, z, { r: 0.8, y0: 0, y1: 2, step: 0.1 }, g(x, z)))) inn = [x, z, a];
    }
    if (inn) { const [x, z, a] = inn; out.inside = look([x, g(x, z) + 1.7, z], [x + Math.cos(a) * 10, g(x, z) + 2.4, z + Math.sin(a) * 10]); }
    // the seam: from a little above Dot's home, looking over the forest to where the trees give way to the canopy's
    // surface (the aerial photograph) — the way with the most forest from 60 to 160 m off
    { let bestA = 0, bs = -1; for (let a = 0; a < 6.28; a += 0.1) { let sc = 0; for (let d = 60; d <= 160; d += 10) sc += can(home[0] + Math.cos(a) * d, home[1] + Math.sin(a) * d); if (sc > bs) { bs = sc; bestA = a; } }
      const t = [home[0] + Math.cos(bestA) * 110, g(home[0], home[1]) + 4, home[1] + Math.sin(bestA) * 110]; out.seam = look([home[0] - Math.cos(bestA) * 10, g(home[0], home[1]) + 16, home[1] - Math.sin(bestA) * 10], t); }
    return out;
  });
  const only = (process.env.ONLY || 'homestead,edge,beach,inside,seam').split(',');
  for (const name of only) {
    const q = poses[name]; if (!q) { console.log('no place for', name); continue; }
    await p.evaluate((q) => { const s = window.seaglass; s.hold(true); s.aim(q.pos, q.yaw, q.pitch); s.advance(+(window.__N || 12), 0.1); }, q);
    await p.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
    console.log(name, q.pos.map((v) => v.toFixed(1)).join(','), q.yaw.toFixed(2), q.pitch.toFixed(2));
  }
  await p.evaluate(() => window.seaglass.aim(null));
  await b.close();
})();
