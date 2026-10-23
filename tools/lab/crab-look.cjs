// LAB: the night beach's ghost crabs as they look (src/ocean/crab.ts, ?crablook: four test crabs by Dot's home — standing,
// running, going into a burrow, eyes laid down), close and from a watch's height. Usage (a build served at PORT):
// PORT=4174 TIME=20:30 OUT=crab node tools/lab/crab-look.cjs   (VIEWS 'close:dx,dy,dz;watch:dx,dy,dz' to set the views; a 4th number 1: at the nearest pandanus, where one climbs)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const OUT = process.env.OUT, TIME = process.env.TIME || '12:00'; fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT}/?tier=high&debug&lab&time=${TIME}&wx=clear&crablook#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  for (const [v, off] of (process.env.VIEWS || 'close:0.55,0.32,0.7;watch:2.6,2.2,2.4').split(';').map((s) => s.split(':')).map(([n, o]) => [n, o.split(',').map(Number)])) {
    const r = await p.evaluate(async (off) => { const s = window.seaglass; s.endOpening?.(); s.hold(true);
      const dh = s.cur.residents.list.find((x) => x.id === 'dot').sp.home, t = [dh[0] + 3.0, 0, dh[1] + 1.5]; t[1] = s.cur.loc.f(t[0], t[2]) + 0.02;
      if (off[3]) {   // (a 4th number: look at the nearest pandanus's trunk, where one climbs, from that offset)
        let best = 1e9, tr = null; s.cur.shore.trunks(t[0], t[2], 15, (q) => { const d = Math.hypot(q.base.x - t[0], q.base.z - t[2]); if (q.kind === 'pandanus' && d < best) { best = d; tr = q; } });
        if (tr) {   // (the camera on the climber's side: dx out from the trunk towards the worksite, dy up, dz along)
          const at = [t[0], t[2]]; t[0] = (tr.base.x + tr.top.x) / 2; t[1] = (tr.base.y + tr.top.y) / 2; t[2] = (tr.base.z + tr.top.z) / 2;
          const nx = at[0] - t[0], nz = at[1] - t[2], l = Math.hypot(nx, nz); off = [nx / l * off[0] - nz / l * off[2], off[1], nz / l * off[0] + nx / l * off[2]];
        }
      }
      const pos = [t[0] + off[0], t[1] + off[1], t[2] + off[2]], d = [t[0] - pos[0], t[1] - pos[1], t[2] - pos[2]], l = Math.hypot(...d);
      s.aim(pos, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)); s.advance(10, 0.1); await new Promise((r) => setTimeout(r, 400));
      return { n: s.cur.crabLook?.mesh.count }; }, off);
    await p.screenshot({ path: `${OUT}/crab-${TIME.replace(':', '')}-${v}.png` }); console.log(v, JSON.stringify(r));
  }
  await b.close();
})();
