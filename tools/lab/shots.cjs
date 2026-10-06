// LAB: what the auto cruise spends its time on. Each sea and hour, MIN minutes of the default cruise with nothing
// drawn: every shot the director takes (what, what kind, how long, how near), the share of time filming vs plainly
// cruising, the passing captions; and along the plain cruise, how deep the camera is, how far the seabed is below
// it, and how much there is to see (fish within 12 m in the frame) — by day and by night.
// Usage (a build served at PORT): node tools/lab/shots.cjs   (env PORT 4174, SEAS 'miyako,maldives', TIMES '10:00,21:00',
// MIN 12, OUT shots.jsonl)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEAS = (process.env.SEAS || 'miyako,maldives,redsea,galapagos,gbr').split(','), TIMES = (process.env.TIMES || '10:00,21:00').split(','), MIN = +(process.env.MIN || 12), OUT = process.env.OUT || 'shots.jsonl';
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sea of SEAS) for (const time of TIMES) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    p.setDefaultTimeout(3600000); p.on('pageerror', (e) => console.log('ERR', sea, e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=${time}&wx=clear#${sea}`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
    await p.waitForTimeout(3000);
    const r = await p.evaluate((MIN) => {
      const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(5, 0.05);
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
      const cam = s.camera, V = cam.position.constructor, T = s.cur.T;
      const shots = [], caps = new Set(); let cur = null, film = 0, plain = 0, n = 0, yaw0 = s.drone.yaw, turn = 0, firstShot = null; const yawRates = [];
      const plainSamples = [];
      for (let i = 0; i < MIN * 60 * 20; i++) {
        s.advance(1, 0.05);
        const sh = s.director.shot;
        if (sh !== cur) { if (cur) cur.rec.end = i / 20; cur = sh; if (sh) { sh.rec = { at: +(i / 20).toFixed(0), label: sh.subject.label, kind: sh.subject.kind, prio: +sh.subject.prio.toFixed(1), d0: +cam.position.distanceTo(sh.subject.pos() ?? cam.position).toFixed(0), obs: 0 }; shots.push(sh.rec); } }
        if (sh) { film++; if (sh.phase === 'observe') sh.rec.obs++; if (firstShot == null) firstShot = i / 20; } else plain++;
        { const dy = Math.abs(Math.atan2(Math.sin(cam.rotation.y - yaw0), Math.cos(cam.rotation.y - yaw0))) * 20 * 180 / Math.PI; yaw0 = cam.rotation.y; if (i % 5 === 0) yawRates.push(dy); }
        const c = s.capState?.(); if (c && c.on && c.cruise) caps.add(c.label);
        if (!sh && i % 20 === 0) {
          // (plain cruising, once a second: how deep, how far down the seabed is, how much is near and in view)
          cam.updateMatrixWorld();
          const o = cam.position; let near = 0;
          for (const f of s.cur.fish) f.each?.((x, y, z) => { const v = new V(x, y, z); if (v.distanceTo(o) > 12) return; v.project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) near++; }, 200);
          plainSamples.push({ y: o.y, floor: o.y - T.top(o.x, o.z), near });
        }
        n++;
      }
      if (cur) cur.rec.end = n / 20;
      for (const x of shots) { x.dur = +((x.end ?? n / 20) - x.at).toFixed(0); x.obs = +(x.obs / 20).toFixed(0); delete x.end; }
      const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 0; };
      const yr = [...yawRates].sort((a, b) => a - b);
      return { firstShot, yawMed: +(yr[Math.floor(yr.length / 2)] ?? 0).toFixed(1), yaw90: +(yr[Math.floor(yr.length * 0.9)] ?? 0).toFixed(1), meanShot: +(shots.reduce((a, x) => a + x.dur, 0) / Math.max(1, shots.length)).toFixed(0), shots, film: +(film / n).toFixed(2), caps: [...caps], plain: { depth: +med(plainSamples.map((q) => -q.y)).toFixed(1), floorBelow: +med(plainSamples.map((q) => q.floor)).toFixed(1), deepShare: +(plainSamples.filter((q) => q.floor > 12).length / Math.max(1, plainSamples.length)).toFixed(2), nearFish: med(plainSamples.map((q) => q.near)), emptyShare: +(plainSamples.filter((q) => q.near === 0).length / Math.max(1, plainSamples.length)).toFixed(2) } };
    }, MIN);
    fs.appendFileSync(OUT, JSON.stringify({ sea, time, ...r }) + '\n');
    console.log(`${sea} ${time}: first shot at ${r.firstShot} s, mean shot ${r.meanShot} s, view turning median ${r.yawMed}°/s (90%: ${r.yaw90}°/s), filming ${(r.film * 100).toFixed(0)}% of ${MIN} min, ${r.shots.length} shots: ${r.shots.map((x) => `${x.label}(${x.kind}) ${x.dur}s`).join(', ')} | passing captions: ${r.caps.join('・') || '-'} | plain cruise: depth ${r.plain.depth} m, seabed ${r.plain.floorBelow} m below (over 12 m: ${(r.plain.deepShare * 100).toFixed(0)}%), fish within 12 m in view: median ${r.plain.nearFish}, none ${(r.plain.emptyShare * 100).toFixed(0)}%`);
    await p.context().close();
  }
  await b.close();
})();
