// LAB: the beach shrubs close up (ocean/shore.ts: クサトベラ naupaka, モンパノキ tree heliotrope), the one of each kind
// nearest Dot's home, from the side and from a little above; and a hash of each beach plant's shape (to see which
// shapes a change has moved). Usage (a build served at PORT):
// PORT=4174 TIME=12:00 OUT=shrub node tools/lab/shrub-look.cjs   (KINDS 'naupaka,heliotrope'; TAG)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const OUT = process.env.OUT, TIME = process.env.TIME || '12:00'; fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT}/?tier=high&debug&lab&time=${TIME}&wx=clear#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  const hashes = await p.evaluate(() => {
    const g = window.seaglass.cur.T.plantLook.geo, out = {};
    for (const k in g) { const a = g[k].attributes.position.array; let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + Math.round(a[i] * 1e4)) | 0; out[k] = `${a.length / 3} verts, ${h >>> 0}`; }
    return out;
  });
  console.log('shapes', JSON.stringify(hashes));
  const tag = process.env.TAG ? '-' + process.env.TAG : '';
  for (const kind of (process.env.KINDS || 'naupaka,heliotrope').split(',')) for (const [v, dist, up] of [['side', 2.2, 0.5], ['above', 2.4, 1.6]]) {
    const r = await p.evaluate(async ({ kind, dist, up }) => {
      const s = window.seaglass; s.endOpening?.(); s.hold(true);
      const T = s.cur.T, geo = T.plantLook.geo[kind], dh = s.cur.residents.list.find((x) => x.id === 'dot').sp.home;
      let mesh = null; s.cur.group.traverse((o) => { if (o.isInstancedMesh && o.geometry === geo) mesh = o; });
      if (!mesh) return { none: true };
      const M = new (s.camera.matrix.constructor)(), P = new (s.camera.position.constructor)(), Q = new (s.camera.quaternion.constructor)(), Sc = new (s.camera.position.constructor)();
      let best = null, bd = Infinity;
      for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, M); M.decompose(P, Q, Sc); const d = (P.x - dh[0]) ** 2 + (P.z - dh[1]) ** 2; if (d < bd) { bd = d; best = { x: P.x, y: P.y, z: P.z, s: Sc.y }; } }
      const t = [best.x, best.y + best.s * 0.45, best.z], a = 0.8, pos = [t[0] + Math.cos(a) * dist * best.s, best.y + up * best.s, t[2] + Math.sin(a) * dist * best.s];
      const d = [t[0] - pos[0], t[1] - pos[1], t[2] - pos[2]], l = Math.hypot(...d);
      s.aim(pos, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)); s.advance(20, 0.1); await new Promise((r) => setTimeout(r, 500));
      return { at: [best.x, best.y, best.z].map((v) => +v.toFixed(2)), size: +best.s.toFixed(2) };
    }, { kind, dist, up });
    const f = `${OUT}/shrub-${kind}-${v}${tag}.png`;
    await p.screenshot({ path: f }); console.log(kind, v, JSON.stringify(r), f);
  }
  await b.close();
})();
