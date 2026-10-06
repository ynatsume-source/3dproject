// LAB check: where the camera looks, (1) on its way to something tapped on the screen, and (2) after the view is
// turned by hand while cruising. The sea is stepped at 1/10 s a frame and nothing is drawn.
//   tap  — a tap on a fish in view 15–45 m off (every third tap on the reef or seabed instead), then the way there: the share of that time with the fish (its body, or
//          its school's middle) inside the middle of the view (within 30% of the centre) and anywhere in it. Want
//          most of it in the middle (the route may still swing it about) and nearly all in view.
//   hold — while cruising, the view turned 60° aside (as by a drag and let go): how far its bearing in the sea moves
//          over the next 4.5 s (want under 3°, the cruise turning under it), and that it comes back ahead after.
// Usage (a build served at PORT): node tools/lab/look.cjs   (env PORT 4174, SEA miyako, N 12)
const { chromium } = require('playwright');
(async () => {
  const SEA = process.env.SEA || 'miyako', N = +(process.env.N || 12);
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=10:00&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(({ N }) => {
    const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(5, 0.1);
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
    const cam = s.camera, V = cam.position.constructor, out = { taps: 0, appr: 0, mid: 0, inView: 0, ex: [], hold: [] };
    s.advance(300, 0.1);
    // (1) taps
    for (let k = 0; k < N; k++) {
      cam.updateMatrixWorld();
      const o = cam.position, cand = [];
      for (const f of s.cur.fish) {
        const fp = f.dbg?.fp, dead = f.dbg?.dead, n = f.dbg?.total; if (!fp || f.dbg.kelpLife) continue;
        for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 150))) {
          if (dead[i]) continue; const v = new V(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]), d = v.distanceTo(o);
          if (d < 15 || d > 45) continue; v.project(cam); if (v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.7) cand.push([(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, f.sp.ja, d, f, i]);
        }
      }
      if (!cand.length && k % 3 !== 2) { s.advance(100, 0.1); continue; }
      const c = k % 3 === 2 ? [innerWidth * (0.3 + 0.4 * ((k * 37) % 10) / 10), innerHeight * 0.62, 'reef', 0] : cand[(k * 7919) % cand.length];
      s.tap(c[0], c[1]);
      const sh = s.director.shot; if (!sh || !sh.asked) { s.advance(50, 0.1); continue; }
      out.taps++;
      let a = 0, m = 0, iv = 0;
      for (let t = 0; t < 400 && s.director.shot === sh && sh.phase === 'approach'; t++) {
        s.advance(1, 0.1); cam.updateMatrixWorld();
        // (the truth, read from the fish themselves: the fish tapped, if a big one; else the middle of its school)
        let P = null;
        const f = c[4], i0 = c[5];
        if (f) {
          const fp = f.dbg.fp, dead = f.dbg.dead, G = f.dbg.groups, Ls = f.dbg.leaders, n = f.dbg.total;
          let idx = [];
          if (G) { const g = G.find((q) => i0 >= q.start && i0 < q.start + q.n); idx = f.sp.big || !g ? [i0] : Array.from({ length: g.n }, (_, j) => g.start + j); }
          else if (Ls) { for (let j = i0 % Ls.length; j < n; j += Ls.length) idx.push(j); }
          idx = idx.filter((j) => !dead[j]);
          if (idx.length) { P = new V(); for (const j of idx) P.add(new V(fp[j * 3], fp[j * 3 + 1], fp[j * 3 + 2])); P.multiplyScalar(1 / idx.length); }
        } else P = sh.subject.pos();
        if (!P) continue;
        const v = new V(P.x, P.y, P.z).project(cam); a++;
        if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) iv++;
        if (v.z < 1 && Math.abs(v.x) < 0.3 && Math.abs(v.y) < 0.3) m++;
      }
      out.appr += a; out.mid += m; out.inView += iv;
      if (a && m / a < 0.6 && out.ex.length < 5) out.ex.push(`${sh.subject.label} ${c[3].toFixed(0)} m: middle ${(100 * m / a).toFixed(0)}% of ${(a / 20).toFixed(1)} s`);
      s.director.shot = null; s.advance(80, 0.1);
    }
    // (2) the view turned aside while cruising
    if (s.lookBy) for (let k = 0; k < 4; k++) {
      s.director.shot = null; s.advance(30, 0.1);
      const bearing = () => { const d = new V(); cam.getWorldDirection(d); return Math.atan2(d.x, d.z); };
      s.lookBy(k % 2 ? 1.05 : -1.05, 0.1); s.advance(1, 0.1);
      const b0 = bearing(); let most = 0, droneTurn = 0; const y0 = s.drone.yaw;
      for (let t = 0; t < 86; t++) { s.advance(1, 0.05); const db = Math.abs(Math.atan2(Math.sin(bearing() - b0), Math.cos(bearing() - b0))); most = Math.max(most, db); droneTurn = Math.max(droneTurn, Math.abs(Math.atan2(Math.sin(s.drone.yaw - y0), Math.cos(s.drone.yaw - y0)))); }
      s.advance(160, 0.05);   // (8 s on: back ahead)
      out.hold.push({ heldDeg: +(most * 180 / Math.PI).toFixed(1), cruiseTurnedDeg: +(droneTurn * 180 / Math.PI).toFixed(1), backAheadDeg: +(Math.abs(s.look.yaw) * 180 / Math.PI).toFixed(1) });
    }
    return out;
  }, { N });
  console.log(`taps ${r.taps}: on the way, the tapped fish in the middle of the view ${(100 * r.mid / Math.max(1, r.appr)).toFixed(0)}%, in view ${(100 * r.inView / Math.max(1, r.appr)).toFixed(0)}% of ${(r.appr / 20).toFixed(0)} s${r.ex.length ? '; e.g. ' + r.ex.join(' | ') : ''}`);
  if (r.hold.length) console.log('view turned aside, then 4.5 s:', JSON.stringify(r.hold));
  else console.log('view turned aside: (no lookBy in this build)');
  await b.close();
})();
