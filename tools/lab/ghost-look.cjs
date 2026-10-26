// LAB: plants seen through (ocean/ghost.ts; viewer design D27, plan 1). Near a resident, the growing beach plant nearest
// it; the camera on the far side of that plant, looking at the resident through it. Shot as drawn (the plant seen
// through) and with nothing seen through, and the count of plants faint. Usage (a build served at PORT):
// PORT=4174 WHO=kame TIME=12:00 OUT=ghost node tools/lab/ghost-look.cjs   (BACK 3.5: metres behind the plant; UP 1.2; TAG)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const OUT = process.env.OUT, TIME = process.env.TIME || '12:00', WHO = process.env.WHO || 'kame'; fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT}/?tier=${process.env.TIER || 'high'}&debug&lab&time=${TIME}&wx=clear#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  const tag = process.env.TAG ? '-' + process.env.TAG : '';
  for (const on of [true, false]) {
    const r = await p.evaluate(async ({ WHO, on, BACK, UP }) => {
      const s = window.seaglass; s.endOpening?.(); s.hold(true);
      const T = s.cur.T, res = s.cur.residents.list.find((x) => x.id === WHO), f = res.pos, gh = T.ghosts;
      const pl = gh.nearest(f.x, f.z); if (!pl) return { none: true };
      const e = s.cur.residents.sense(res).eye;
      let dx = pl.x - f.x, dz = pl.z - f.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const cam = [pl.x + dx * (pl.r + BACK), Math.max(e.y, pl.y0) + UP, pl.z + dz * (pl.r + BACK)], d = [e.x - cam[0], e.y - cam[1], e.z - cam[2]], l = Math.hypot(...d);
      const V = s.camera.position.constructor;
      gh.lab(on ? [new V(f.x, f.y + 0.15, f.z), new V((f.x + e.x) / 2, (f.y + e.y) / 2, (f.z + e.z) / 2), new V(e.x, e.y, e.z)] : null);
      s.aim(cam, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)); s.advance(30, 0.1); await new Promise((r) => setTimeout(r, 600));
      return { plant: pl, dist: +L.toFixed(2), faint: gh.faint, pose: [...cam, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)].map((v) => +v.toFixed(4)).join(',') };
    }, { WHO, on, BACK: +(process.env.BACK || 3.5), UP: +(process.env.UP || 1.2) });
    const f = `${OUT}/ghost-${WHO}-${TIME.replace(':', '')}${tag}-${on ? 'on' : 'off'}.png`;
    await p.screenshot({ path: f }); console.log(on ? 'on ' : 'off', JSON.stringify(r), f);
  }
  await b.close();
})();
