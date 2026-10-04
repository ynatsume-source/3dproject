// Composition check across devices: what fills the frame over some minutes of the default cruise at Miyako, on a
// phone held upright and on its side, a tablet and a PC — each in its own browser, one after the other (several at
// once crash the software renderer). Rays over the frame: reef within 1.2 m (a wall of rock in the face), the surface
// within 4 m; for what is being observed, its width in the frame, hidden behind reef, or out of the frame.
// Fails a size where the subject is out of the frame over 10% of the observing time, hidden over 5%, under 8% of the
// width over 5%, or the reef/surface fills over a third of the frame in over 3% of the moments.
// Usage (a build served at PORT): node tools/layout/composition.cjs   (env PORT, default 4174; MIN minutes, default 4;
// ONLY e.g. "phone portrait"; CHROME for the browser)
const { chromium } = require('playwright');
const SIZES = [['phone portrait', 390, 844, true], ['phone landscape', 844, 390, true], ['tablet', 820, 1180, true], ['PC', 1440, 900, false]];
async function one(name, vw, vh, mob) {
  const port = process.env.PORT || 4174, mins = +(process.env.MIN || 4), at = process.env.AT || '2026-10-03T03:00Z';
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: vw, height: vh }, isMobile: mob, hasTouch: mob })).newPage();
  p.setDefaultTimeout(600000); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(`http://localhost:${port}/?tier=low&debug&at=${at}#miyako`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur, null, { timeout: 250000 }); await p.waitForTimeout(3000);
  const samples = [];
  for (let c = 0; c < mins * 60; c += 10) {
    const r = await p.evaluate(async () => {
      const s = window.seaglass, T = s.cur.T, cam = s.camera, V = cam.position.constructor, out = [];
      let t = s.U.uTime.value;
      for (let k = 0; k < 10; k++) {
        for (let i = 0; i < 20; i++) { t += 0.05; s.U.uTime.value = t; s.cur.eco.step(0.05, t, s.drone.pos, -Math.sin(s.drone.yaw), -Math.cos(s.drone.yaw)); s.stepDrone(0.05); }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // (the camera placed for this moment)
        cam.updateMatrixWorld();
        // rays over the frame: what each first meets within 8 m (reef / surface / open water)
        let near = 0, surf = 0, n = 0;
        const o = cam.position.clone();
        if (o.y > 0) { out.push({ air: 1 }); continue; }
        for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 5; gx++) {
          const d = new V((gx + 0.5) / 5 * 2 - 1, (gy + 0.5) / 9 * 2 - 1, 0.5).unproject(cam).sub(o).normalize();
          n++;
          for (let L = 0.15; L < 8; L += 0.15) {
            const x = o.x + d.x * L, y = o.y + d.y * L, z = o.z + d.z * L;
            if (y > -0.05) { if (L < 4) surf++; break; }
            if (y < T.top(x, z)) { if (L < 1.2) near++; break; }
          }
        }
        const sh = s.director.shot, sp = sh?.subject.pos?.();
        let w = null, hid = null, inView = null;
        if (sh && sp) {
          const spv = new V(sp.x, sp.y, sp.z), dist = o.distanceTo(spv), hf = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
          w = Math.min(1, 2 * Math.atan((sh.subject.size || 1) / 2 / Math.max(dist, 0.1)) / hf);
          const q = spv.clone().project(cam); inView = Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && q.z < 1;
          hid = false; const dl = dist;
          for (let L = 0.4; L < dl - 0.4; L += 0.25) { const k = L / dl, x = o.x + (sp.x - o.x) * k, y = o.y + (sp.y - o.y) * k, z = o.z + (sp.z - o.z) * k; if (y < T.top(x, z)) { hid = true; break; } }
        }
        out.push({ near: near / n, surf: surf / n, phase: sh ? sh.phase : 'cruise', key: sh?.subject.key, label: sh?.subject.label, w, hid, inView, y: +o.y.toFixed(1), pitch: +s.drone.pitch.toFixed(2) });
      }
      return out;
    });
    samples.push(...r);
  }
  // summary
  const uw = samples.filter((x) => !x.air), pct = (a, b) => (100 * a / Math.max(1, b)).toFixed(0) + '%';
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 0; };
  const obs = uw.filter((x) => x.phase === 'observe' && x.w !== null), app = uw.filter((x) => x.phase === 'approach');
  // shot spans (consecutive samples with the same subject)
  const spans = []; let cur = null;
  for (const x of samples) { if (x.key && (!cur || cur.key !== x.key)) { cur = { key: x.key, label: x.label, a: 0, o: 0 }; spans.push(cur); } else if (!x.key) cur = null; if (cur) { if (x.phase === 'approach') cur.a++; else if (x.phase === 'observe') cur.o++; } }
  const num = (v) => parseFloat(v);
  const r = {
    nearOver35: pct(uw.filter((x) => x.near > 0.35).length, uw.length), surfOver35: pct(uw.filter((x) => x.surf > 0.35).length, uw.length),
    medianWidth: pct(med(obs.map((x) => x.w)), 1), under8pct: pct(obs.filter((x) => x.w < 0.08).length, obs.length),
    hidden: pct(obs.filter((x) => x.hid).length, obs.length), outOfFrame: pct(obs.filter((x) => !x.inView).length, obs.length), shots: spans.length,
  };
  const bad = num(r.outOfFrame) > 10 || num(r.hidden) > 5 || num(r.under8pct) > 5 || num(r.nearOver35) > 3 || num(r.surfOver35) > 3;
  console.log(`${name} ${vw}x${vh}: subject width ${r.medianWidth} (under 8%: ${r.under8pct}), out of frame ${r.outOfFrame}, hidden ${r.hidden}, reef in the face ${r.nearOver35}, surface ${r.surfOver35}, ${r.shots} shots ${bad ? 'FAIL' : 'ok'}`);
  if (process.env.DETAIL) { const by = {}; for (const x of obs) { const k = x.label || x.key; by[k] = by[k] || [0, 0]; by[k][0]++; if (!x.inView) by[k][1]++; } console.log('  observed (samples, out of frame):', JSON.stringify(by)); }
  await b.close();
  return bad;
}
(async () => {
  let fails = 0;
  for (const [name, w, h, mob] of SIZES) {
    if (process.env.ONLY && process.env.ONLY !== name) continue;
    try { if (await one(name, w, h, mob)) fails++; } catch (e) { console.log(`${name}: the browser gave out (${String(e.message).split('\n')[0]})`); fails++; }
  }
  console.log(fails ? `FAIL (${fails})` : 'PASS');
  if (fails) process.exit(1);
})();
