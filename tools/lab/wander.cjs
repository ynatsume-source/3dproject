// LAB: does the auto camera ever wander without going anywhere? MIN minutes of the default auto camera in a sea,
// nothing drawn, the sea stepped 1/20 s a frame; every half second its state (where, how fast, over what floor, what it
// is filming, whether it follows a passing caption, where the cruise leans for life, by night). Logged: the stretches
// of 20 s with nothing being filmed in which it moved less than 8 m from where it began, or turned back and forth
// (its heading swung more than 120° in all while ending within 30° of where it began) — "drifting about" — with what
// it was doing then. Written in full to OUT (JSON lines) for a closer look.
// Usage (a build served at PORT): node tools/lab/wander.cjs   (env PORT 4174, SEA miyako, TIMES '10:00,18:30,21:00',
// MIN 8, OUT wander.jsonl)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEA = process.env.SEA || 'miyako', TIMES = (process.env.TIMES || '10:00,18:30,21:00').split(','), MIN = +(process.env.MIN || 8), OUT = process.env.OUT || 'wander.jsonl';
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const time of TIMES) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    p.setDefaultTimeout(3600000); p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=${time}&wx=clear#${SEA}`, { waitUntil: 'commit' });
    await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
    await p.waitForTimeout(2000);
    const rows = await p.evaluate((MIN) => {
      const s = window.seaglass; s.endOpening(); s.hold(true);
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
      const out = [], d = s.drone, T = s.cur.T;
      for (let k = 0; k < MIN * 120; k++) {
        s.advance(10, 0.05);
        const c = s.cruiseState(), sh = s.director.shot, cap = s.capState();
        out.push({ t: k / 2, x: +d.pos.x.toFixed(1), y: +d.pos.y.toFixed(1), z: +d.pos.z.toFixed(1), floor: +T.top(d.pos.x, d.pos.z).toFixed(1), v: +d.vel.length().toFixed(2), yaw: +d.yaw.toFixed(3), s: +c.s.toFixed(3), shot: sh ? `${sh.subject.label}/${sh.phase}${sh.asked ? '/asked' : ''}` : '', follow: c.follow, cap: cap.on ? `${cap.label}${cap.cruise ? '(passing)' : ''}` : '', life: c.life.ok ? [+c.life.x.toFixed(0), +c.life.z.toFixed(0), +c.life.score.toFixed(1)] : null, deep: c.life.deep.ok ? +c.life.deep.score.toFixed(1) : null, night: +c.night.toFixed(2), iw: +c.interestW.toFixed(2), stuck: +c.stuckT.toFixed(1), arrive: +c.arrive.toFixed(1), mode: c.mode });
      }
      return out;
    }, MIN);
    fs.appendFileSync(OUT, rows.map((r) => JSON.stringify({ sea: SEA, time, ...r })).join('\n') + '\n');
    // drifting about: 20 s windows (40 rows), nothing filmed throughout
    const found = [];
    for (let i = 0; i + 40 < rows.length; i += 4) {
      const w = rows.slice(i, i + 41); if (w.some((r) => r.shot)) continue;
      const moved = Math.hypot(w[40].x - w[0].x, w[40].z - w[0].z);
      let swing = 0; for (let j = 1; j < w.length; j++) swing += Math.abs(Math.atan2(Math.sin(w[j].yaw - w[j - 1].yaw), Math.cos(w[j].yaw - w[j - 1].yaw)));
      const net = Math.abs(Math.atan2(Math.sin(w[40].yaw - w[0].yaw), Math.cos(w[40].yaw - w[0].yaw)));
      const still = moved < 8, dither = swing > 120 * Math.PI / 180 && net < 30 * Math.PI / 180;
      if ((still || dither) && !(found.length && i - found[found.length - 1].i < 40)) found.push({ i, t: w[0].t, moved: +moved.toFixed(1), swing: +(swing * 180 / Math.PI).toFixed(0), floor: w[20].floor, y: w[20].y, follow: w.filter((r) => r.follow).length, caps: [...new Set(w.map((r) => r.cap).filter(Boolean))].join(' / '), lifeJumps: w.filter((r, j) => j && r.life && w[j - 1].life && Math.hypot(r.life[0] - w[j - 1].life[0], r.life[1] - w[j - 1].life[1]) > 8).length, ds: +(w[40].s - w[0].s).toFixed(3), still, dither });
    }
    const filming = rows.filter((r) => r.shot).length / rows.length;
    console.log(`${SEA} ${time}: ${MIN} min, filming ${(filming * 100).toFixed(0)}%, night ${rows[0].night}; drifting about: ${found.length ? '' : 'none'}`);
    for (const f of found) console.log(`  at ${f.t} s: moved ${f.moved} m in 20 s, heading swung ${f.swing}°${f.still ? ' (still)' : ''}${f.dither ? ' (back and forth)' : ''}, over floor ${f.floor} m at ${f.y} m, route progress ${f.ds}, following a passing caption ${f.follow}/41 samples (${f.caps || '-'}), life target jumped ${f.lifeJumps}×`);
    await p.context().close();
  }
  await b.close();
})();
