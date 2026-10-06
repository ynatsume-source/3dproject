// LAB: when a rare sight starts, how long is it announced before any of it can be seen? Each sea, each rare sight
// it can have (started by hand, after a minute of cruising), nothing drawn: from the start, the time to the
// announcement card, to the director turning to it, to the caption, and to the first moment any of its animals is
// in the frame, within 70% of sight, unhidden by the reef and at least 6 px on screen (read from the meshes the
// sight adds to the sea, apart from the app's own idea of where it is). Logged also what the camera looks at
// meanwhile: the share of the wait with the subject's own point (what the director films) in the frame.
// Usage (a build served at PORT): node tools/lab/rare.cjs   (env PORT 4174, SEAS 'miyako,galapagos', IDS)
const { chromium } = require('playwright');
(async () => {
  const SEAS = (process.env.SEAS || 'miyako,galapagos,maldives').split(',');
  const IDS = (process.env.IDS || 'fishwall,mantatrain,hammers,heatrun,spawning').split(',');
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sea of SEAS) for (const id of IDS) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=10:00&wx=clear#${sea}`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
    await p.waitForTimeout(2000);
    const r = await p.evaluate((id) => {
      const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(5, 0.05);
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
      s.advance(1200, 0.05);
      const oc = s.cur, cam = s.camera, V = cam.position.constructor, M = new (cam.matrixWorld.constructor)(), T = oc.T;
      const fog = oc.loc.water?.fog ?? 0.02, see = Math.min(160, Math.max(60, Math.log(10) / fog)) * 0.7;
      const before = new Set(oc.group.children);
      if (!s.rare(id)) return null;
      const bodies = oc.group.children.filter((o) => !before.has(o));
      const pxm = innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360));
      const pts = () => {
        const out = [];
        for (const o of bodies) {
          if (o.isInstancedMesh) { const E = o.instanceMatrix.array, st = Math.max(1, Math.floor(o.count / 150)); for (let i = 0; i < o.count; i += st) { const sc = Math.hypot(E[i * 16], E[i * 16 + 1], E[i * 16 + 2]); if (sc > 1e-4) out.push([E[i * 16 + 12], E[i * 16 + 13], E[i * 16 + 14], sc]); } }
          else if (o.isPoints) { const P = o.geometry.attributes.position, st = Math.max(1, Math.floor(P.count / 150)); for (let i = 0; i < P.count; i += st) out.push([P.getX(i), P.getY(i), P.getZ(i), 0.05]); }   // (the coral's spawn: little grains, each a few px near by)
          else if (o.isMesh) out.push([o.position.x, o.position.y, o.position.z, o.scale.x]);
        }
        return out;
      };
      const seen = () => {
        cam.updateMatrixWorld(); const o = cam.position;
        for (const [x, y, z, sc] of pts()) {
          const v = new V(x, y, z), d = v.distanceTo(o); if (d > see || sc / d * pxm < 6) continue;
          v.project(cam); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          let open = true; for (let t = 0.5; t < d - 0.5; t += 0.5) { const k = t / d; if (o.y + (y - o.y) * k < T.top(o.x + (x - o.x) * k, o.z + (z - o.z) * k) - 0.05) { open = false; break; } }
          if (open) return true;
        }
        return false;
      };
      const out = { card: null, shot: null, caption: null, seen: null, waitLooking: 0, waitN: 0, d0: null };
      for (let i = 0; i < 20 * 120; i++) {
        s.advance(1, 0.05); const t = +(i / 20).toFixed(1);
        if (out.card == null && document.getElementById('rare').classList.contains('on')) out.card = t;
        const sh = s.director.shot;
        if (out.shot == null && sh && sh.subject.key.startsWith('rare:')) { out.shot = t; const q = sh.subject.pos(); out.d0 = q ? +cam.position.distanceTo(new V(q.x, q.y, q.z)).toFixed(0) : null; }
        const c = s.capState(); if (out.caption == null && c.on && (c.key || '').startsWith('rare:')) out.caption = t;
        if (out.seen == null && i % 4 === 0 && seen()) out.seen = t;
        if (out.seen == null && sh && sh.subject.key.startsWith('rare:')) { const q = sh.subject.pos(); out.waitN++; if (q) { const v = new V(q.x, q.y, q.z).project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) out.waitLooking++; } }
        if (out.seen != null && i > out.seen * 20 + 40) break;
      }
      return out;
    }, id);
    if (!r) console.log(`${sea} ${id}: cannot happen here`);
    else console.log(`${sea} ${id}: card ${r.card ?? '-'} s, director turns to it ${r.shot ?? '-'} s (its point ${r.d0 ?? '-'} m off), caption ${r.caption ?? '-'} s, first seen ${r.seen ?? 'never (2 min)'} s; before it is seen, the camera on its point ${(100 * r.waitLooking / Math.max(1, r.waitN)).toFixed(0)}% of ${(r.waitN / 20).toFixed(0)} s`);
    await p.context().close();
  }
  await b.close();
})();
