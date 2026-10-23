// LAB: one fixed view of the reef from the beach at several heights of the sea (?sealevel=), for choosing the tide's
// viewpoint (viewer design TIDE_SCENES.md S1) and the heights at which the reef reads as out of the water. From Dot's
// home toward a reef point (AT 'x,z'; a reef flat near the home by default), the camera where the ground first falls
// below the sand's top (+1.2 m), H metres above it, looking out that way. Usage (a build served at PORT):
// PORT=4174 SEAS=-0.4,-0.7,-1.0 OUT=tide node tools/lab/tide-view.cjs   (TIME 17:30, or DATE '2026-12-24T19:35' (JST): the
// day too — the moon's phase — by shifting the page's clock; TURN rad: the view turned from that way; H 3.5; FWD 6: metres on toward the sea; MOON 1: from there, facing the moon; POSE
// 'x,y,z,yaw,pitch' to hold a view as printed)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
  const SEAS = (process.env.SEAS || '-0.4,-0.7,-1.0').split(',');
  const DATE = process.env.DATE, TIME = process.env.TIME || '17:30';
  const off = DATE ? Date.parse(DATE + ':00+09:00') - Date.now() : 0;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sea of SEAS) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    // (the page's clock moved to DATE: the island's time and the sky's, the moon among them)
    if (off) await ctx.addInitScript((off) => { const D = Date, now = D.now.bind(D); class F extends D { constructor(...a) { if (a.length) super(...a); else super(now() + off); } static now() { return now() + off; } } window.Date = F; }, off);
    const p = await ctx.newPage(); p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:${process.env.PORT}/?tier=high&debug&lab${DATE ? '' : `&time=${TIME}`}&wx=clear&sealevel=${sea}#planet`, { waitUntil: 'commit' });
    await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
    await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
    const pose = await p.evaluate(async ({ H, TURN, POSE, AT, FWD, MOON }) => {
      const s = window.seaglass; s.endOpening?.(); s.hold(true);
      let pos, yaw, pitch;
      if (POSE) { const q = POSE.split(',').map(Number); pos = q.slice(0, 3); yaw = q[3]; pitch = q[4]; }
      else {
        const dh = s.cur.residents.list.find((x) => x.id === 'dot').sp.home, f = s.cur.loc.f;
        // (from the home toward the reef point AT, to where the ground first falls below the sand's top)
        const L = Math.hypot(AT[0] - dh[0], AT[1] - dh[1]), dx = (AT[0] - dh[0]) / L, dz = (AT[1] - dh[1]) / L;
        let r = 0; while (r < L && f(dh[0] + dx * r, dh[1] + dz * r) > 1.2) r += 0.5;
        r += FWD; const x = dh[0] + dx * r, z = dh[1] + dz * r;   // (FWD: on past the beach's trees)
        pos = [x, Math.max(f(x, z), 1.2) + H, z]; yaw = Math.atan2(dx, dz) + Math.PI + TURN; pitch = -0.2;
      }
      if (MOON) { const m = s.U.uAirMoon.value; yaw = Math.atan2(-m.x, -m.z); pitch = Math.max(-0.2, Math.min(0.15, Math.asin(m.y) - 0.25)); }   // (MOON: facing the moon, its path on the water and the reef in it)
      s.aim(pos, yaw, pitch); s.advance(30, 0.1); await new Promise((r) => setTimeout(r, 600));
      return [...pos, yaw, pitch].map((v) => +v.toFixed(4)).join(',');
    }, { H: +(process.env.H || 3.5), TURN: +(process.env.TURN || 0), POSE: process.env.POSE || '', AT: (process.env.AT || '22.5,-57.9').split(',').map(Number), FWD: +(process.env.FWD || 6), MOON: !!process.env.MOON });
    const f = `${OUT}/tide-${(DATE || TIME).replace(/[:T-]/g, '')}${process.env.TAG ? '-' + process.env.TAG : ''}-${sea}.png`;
    await p.screenshot({ path: f }); console.log(sea, f, 'pose', pose);
    await ctx.close();
  }
  await b.close();
})();
