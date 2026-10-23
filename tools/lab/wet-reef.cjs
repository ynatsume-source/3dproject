// LAB: the reef at low water as it looks (?sealevel= holds the drawn sea; ?wetfrom= where it stood a while ago, LAB).
// Finds, near Dot's home, a coral or rock whose top stands just out of the water (between the sea and 0.35 m above it,
// over a floor still under it), and shoots it close and from a little way off. Usage (a build served at PORT):
// PORT=4174 TIME=12:00 SEA=-1.04 OUT=wet node tools/lab/wet-reef.cjs   (WETFROM -0.6: the sea 45 min ago; AT 'x,z' to look there;
// POOL 1: a tide pool's floor instead — cut off from the sea, its water stays at mean sea level while the sea falls;
// ANY 1 with AT: that point's floor when nothing there fits, e.g. at high water)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const OUT = process.env.OUT, TIME = process.env.TIME || '12:00', SEA = process.env.SEA || '-1.04'; fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  const wf = process.env.WETFROM ? `&wetfrom=${process.env.WETFROM}` : '';
  await p.goto(`http://localhost:${process.env.PORT}/?tier=high&debug&lab&time=${TIME}&wx=clear&sealevel=${SEA}${wf}#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  const at = process.env.AT ? process.env.AT.split(',').map(Number) : null;
  const VIEWS = (process.env.VIEWS || 'close:2.2,1.2;off:7,3.5').split(';').map((s) => s.split(':')).map(([n, o]) => [n, o.split(',').map(Number)]);
  // (first near the home, so the reef there is grown in; then the spot)
  const spot = await p.evaluate(async ({ at, SEA, POOL, ANY }) => {
    const s = window.seaglass; s.endOpening?.(); s.hold(true);
    const dh = s.cur.residents.list.find((x) => x.id === 'dot').sp.home, T = s.cur.T, sea = +SEA;
    let best = null, bd = 1e9;
    for (let pass = 0; pass < 6 && !best; pass++) {
      const c = at || [dh[0] + Math.cos(pass) * 30 * pass, dh[1] + Math.sin(pass) * 30 * pass];
      s.aim([c[0], sea + 6, c[1]], 0, -1.2); s.advance(20, 0.1); await new Promise((r) => setTimeout(r, 300));
      for (let dx = -40; dx <= 40; dx += 0.5) for (let dz = -40; dz <= 40; dz += 0.5) {
        const x = c[0] + dx, z = c[1] + dz, top = T.top(x, z), h = T.h(x, z), d = Math.hypot(dx, dz);
        if (POOL ? (s.cur.water.tideK(x, z) < 0.01 && h < -0.08 && h > -0.8 && d < bd) : (top > sea + 0.03 && top < sea + 0.35 && h < sea - 0.1 && d < bd)) { bd = d; best = [x, z, POOL ? h : top, h]; }
      }
    }
    if (!best && at && ANY) best = [at[0], at[1], T.h(at[0], at[1]), T.h(at[0], at[1])];   // (ANY: the floor at AT, whatever it is)
    return best;
  }, { at, SEA, POOL: !!process.env.POOL, ANY: !!process.env.ANY });
  console.log('spot', JSON.stringify(spot));
  if (!spot) { await b.close(); return; }
  for (const [v, [dist, up]] of VIEWS) {
    const pose = await p.evaluate(async ({ spot, dist, up, SEA }) => {
      const s = window.seaglass, t = [spot[0], spot[2], spot[1]];
      // (from the side the sun is behind, a little above the water)
      const a = 0.8, pos = [t[0] + Math.cos(a) * dist, Math.max(t[1], +SEA) + up, t[2] + Math.sin(a) * dist], d = [t[0] - pos[0], t[1] - pos[1], t[2] - pos[2]], l = Math.hypot(...d);
      s.aim(pos, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)); s.advance(10, 0.1); await new Promise((r) => setTimeout(r, 400));
      return [...pos, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)].map((v) => +v.toFixed(4)).join(',');
    }, { spot, dist, up, SEA });
    const f = `${OUT}/wet-${TIME.replace(':', '')}${process.env.TAG ? '-' + process.env.TAG : ''}-${v}.png`;
    await p.screenshot({ path: f }); console.log(v, f, 'pose', pose);   // (the pose: for flicker.cjs POSE)
  }
  await b.close();
})();
