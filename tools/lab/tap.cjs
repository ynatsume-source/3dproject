// LAB check: a tap on the reef in front goes to the reef, not to what swims far behind it.
// In Miyako with the hammerhead school out, the camera is set so the school sits behind a coral head on screen;
// a tap on the school's screen point must not pick it (the seabed is nearer along that ray), and must head
// for the reef spot instead. Also: with nothing in front, a tap right on the school still picks it.
// Usage (a build served at PORT): node tools/lab/tap.cjs   (env PORT, default 4174; CHROME for the browser)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(400000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=low&debug&lab&time=noon&wx=clear#miyako`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const s = window.seaglass, oc = s.cur, T = oc.T, d = s.drone, cam = s.camera;
    s.rare('hammers');
    const subj = () => oc.eco.subjects().find((x) => x.key.startsWith('hammers') || /シュモク/.test(x.label));
    const h = subj(); if (!h) return { err: 'no hammerhead subject' };
    const H = h.pos().clone();
    const place = (x, y, z, yaw, pitch) => { d.mode = 'manual'; d.pos.set(x, y, z); d.yaw = yaw; d.pitch = pitch; cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0, 'YXZ'); cam.updateMatrixWorld(); };
    const look = (x, y, z) => { const dx = H.x - x, dy = H.y - y, dz = H.z - z; place(x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); };
    const proj = () => { const v = H.clone().project(cam); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; };
    // find a spot where the school is behind the seabed: low over the floor, 35-70 m off, looking at it
    let hidden = null, open = null;
    for (let k = 0; k < 400 && !(hidden && open); k++) {
      const a = k * 2.39996, rr = 35 + (k % 8) * 5, x = H.x + Math.cos(a) * rr, z = H.z + Math.sin(a) * rr;
      const fl = T.top(x, z); if (fl > -4) continue;
      const y = Math.min(fl + 1.5, -1.5);
      look(x, y, z);
      const [sx, sy] = proj(), dist = cam.position.distanceTo(H), sb = s.seabedAt(sx, sy);
      if (!hidden && sb != null && sb < dist - 8) hidden = { x, y, z, sx, sy, dist, sb };
      if (!open && (sb == null || sb > dist + 5) && dist < 70) open = { x, y, z, sx, sy, dist };
    }
    const out = { H: [H.x, H.y, H.z].map((v) => +v.toFixed(1)) };
    if (hidden) {
      look(hidden.x, hidden.y, hidden.z);
      out.hidden = { dist: +hidden.dist.toFixed(1), seabed: +hidden.sb.toFixed(1), pick: s.pick(hidden.sx, hidden.sy) };
      s.tap(hidden.sx, hidden.sy); out.hidden.went = s.director.shot ? s.director.shot.subject.key + ' ' + s.director.shot.subject.label : null;
      s.director.release();
    }
    if (open) { look(open.x, open.y, open.z); out.open = { dist: +open.dist.toFixed(1), pick: s.pick(open.sx, open.sy) }; }
    return out;
  });
  console.log(JSON.stringify(r));
  await b.close();
  const bad = !r.hidden || !r.open || (r.hidden.pick && /hammer/i.test(r.hidden.pick)) || !/place:tap/.test(r.hidden.went || '') || !r.open.pick;
  console.log(bad ? 'FAIL' : 'PASS');
  if (bad) process.exit(1);
})();
