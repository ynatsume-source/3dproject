// LAB: how much life the auto camera has in front of it, from the moment it is in a sea. Each sea and hour, the first
// MIN minutes of the default auto camera with nothing drawn: once a second, the fish within 12 m in the frame (each
// fish, every system), and whether it is filming something or between things. Logged: the share of seconds with no
// fish near in view, the median count, the longest run of empty seconds, and the same split by filming / between.
// Usage (a build served at PORT): node tools/lab/life.cjs   (env PORT 4174, SEAS 'miyako,kayama', TIMES '10:00', MIN 6, TRACE 60: each of the first 60 s, INTRO 1: with the way in from the air, as on the
// first visit of the day — counted from when it is under the water)
const { chromium } = require('playwright');
(async () => {
  const SEAS = (process.env.SEAS || 'miyako,kayama,gbr').split(','), TIMES = (process.env.TIMES || '10:00').split(','), MIN = +(process.env.MIN || 6);
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sea of SEAS) for (const time of TIMES) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    p.setDefaultTimeout(3600000); p.on('pageerror', (e) => console.log('ERR', sea, e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab${process.env.INTRO ? '&intro' : ''}&time=${time}&wx=clear#${sea}`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
    await p.waitForTimeout(2000);
    const r = await p.evaluate((MIN) => {
      const s = window.seaglass; s.hold(true);
      if (s.opening) { s.advance(Math.ceil(s.opening.len / 0.05) - Math.round(s.opening.t / 0.05) - 50, 0.05); } else s.endOpening();   // (the way in: from its last 2.5 s, under the water)
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
      const cam = s.camera, V = cam.position.constructor, rows = [];
      for (let sec = 0; sec < MIN * 60; sec++) {
        s.advance(20, 0.05);
        cam.updateMatrixWorld(); const o = cam.position; let near = 0;
        const count = (x, y, z) => { const v = new V(x, y, z); if (v.distanceTo(o) > 12) return; v.project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) near++; };
        for (const f of s.cur.fish) f.each?.(count, 1e6);
        if (s.cur.bait?.st.active) s.cur.bait.each?.(count, 1e6);
        s.cur.jacks?.each?.(count, 1e6);
        rows.push({ near, film: !!s.director.shot, label: s.director.shot?.subject.label ?? '', ph: s.director.shot?.phase ?? '', y: +o.y.toFixed(1), fl: +(o.y - s.cur.T.top(o.x, o.z)).toFixed(1) });
      }
      return rows;
    }, MIN);
    const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 0; };
    let run = 0, longest = 0, at = 0; r.forEach((q, i) => { if (q.near === 0) { run++; if (run > longest) { longest = run; at = i - run + 1; } } else run = 0; });
    const part = (f) => { const a = r.filter(f); return `${a.length} s: none ${(100 * a.filter((q) => q.near === 0).length / Math.max(1, a.length)).toFixed(0)}%, median ${med(a.map((q) => q.near))}`; };
    const first = r.slice(0, 60);
    console.log(`${sea} ${time}: no fish within 12 m in view ${(100 * r.filter((q) => q.near === 0).length / r.length).toFixed(0)}% of ${MIN} min, median ${med(r.map((q) => q.near))}, longest empty ${longest} s (from ${at} s); first minute: none ${(100 * first.filter((q) => q.near === 0).length / 60).toFixed(0)}%, median ${med(first.map((q) => q.near))} | filming ${part((q) => q.film)} | between ${part((q) => !q.film)}`);
    if (process.env.TRACE) console.log(r.slice(0, +process.env.TRACE).map((q, i) => `${i}s ${q.near} ${q.label}${q.ph ? ' ' + q.ph : ''} y${q.y} floor+${q.fl}`).join('\n'));
    await p.context().close();
  }
  await b.close();
})();
