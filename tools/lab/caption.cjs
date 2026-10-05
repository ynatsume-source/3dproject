// LAB check: does the caption speak only of what is on screen, and say where the request came from?
// (docs/proposals/kayama-review/CAPTION_FOCUS_TAP.md §4.) The sea is stepped at a fixed 1/10 s per frame, so the
// numbers are the same however slow the renderer. Three runs, each from a fresh page:
//   cruise — the default cruise for SECS seconds;
//   guide  — "go and see" from the field guide, for a few kinds in turn, 50 s each;
//   tap    — a tap on something in view, 50 s each, a few times.
// Each frame, while the caption is up, its subject is tested for being seen — independently of the app's own test:
// five points of its body (its middle, and out to the sides and up and down by its size) projected; one counts when
// it is inside the frame, nearer than 70% of what this water lets one see, and no seabed or rock stands between it
// and the camera (a march along the line, the floor as creatures see it); and the whole looks at least 10 px big.
// Logged: the share of caption time with nothing of its subject seen (want under 2%), apart from what the rules allow
// (on the way to something asked for, the heading that says only where it is going; and the first 4 s it stays up at
// least, so as not to be cut off mid-reading), which are logged on their own; the share of observing time
// with the subject's middle outside the middle 60% of the frame (want under 5%, step 5); the share of requests whose
// small heading names where they came from (図鑑 / タップ; want 100%).
// Usage (a build served at PORT): node tools/lab/caption.cjs   (env PORT 4174, SEA miyako, SECS 240, W/H 390x844,
// RUNS 'cruise,guide,tap'). Nothing is drawn: the measuring needs the sea and the camera, not the picture.
const { chromium } = require('playwright');
(async () => {
  const SEA = process.env.SEA || 'miyako', SECS = +(process.env.SECS || 240), W = +(process.env.W || 390), H = +(process.env.H || 844);
  const RUNS = (process.env.RUNS || 'cruise,guide,tap').split(',');
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const total = { cap: 0, unseen: 0, head: 0, hold: 0, obs: 0, off: 0, asked: 0, named: 0 };
  for (const run of RUNS) {
    const p = await (await b.newContext({ viewport: { width: W, height: H }, isMobile: W < H, hasTouch: W < H })).newPage();
    p.setDefaultTimeout(1200000); p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=${process.env.TIME || '10:00'}&wx=clear#${SEA}`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
    await p.waitForTimeout(3000);
    await p.evaluate(() => {
      const s = window.seaglass; s.endOpening(); s.hold(true);
      // nothing needs drawing to be measured: the GPU calls are emptied (in software they took nearly all the time)
      s.advance(5, 0.1);
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
      // the test, kept here and apart from the app's own
      const T = s.cur.T, fog = s.cur.loc.water?.fog ?? 0.02, see = Math.min(160, Math.max(60, Math.log(10) / fog)) * 0.7;
      window.__seen = (c) => {
        if (!c.pos) return false;
        const cam = s.camera, o = cam.position, P = c.pos, r = Math.max(c.r || 0, c.size * 0.35);
        const d = Math.hypot(P.x - o.x, P.y - o.y, P.z - o.z);
        if (c.size / Math.max(d, 0.5) * innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360)) < 10) return false;
        const right = { x: Math.cos(s.drone.yaw), z: -Math.sin(s.drone.yaw) };
        const pts = [[0, 0, 0], [right.x * r, 0, right.z * r], [-right.x * r, 0, -right.z * r], [0, r * 0.5, 0], [0, -r * 0.5, 0]];
        const inCave = o.y < T.top(o.x, o.z) - 0.2;
        const v = new o.constructor();
        for (const [ax, ay, az] of pts) {
          const x = P.x + ax, y = P.y + ay, z = P.z + az, dd = Math.hypot(x - o.x, y - o.y, z - o.z);
          if (dd > see) continue;
          v.set(x, y, z).project(cam); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          let open = true;
          if (!inCave) for (let t = 0.5; t < dd - 0.8; t += 0.5) { const k = t / dd, qx = o.x + (x - o.x) * k, qy = o.y + (y - o.y) * k, qz = o.z + (z - o.z) * k; if (qy < T.top(qx, qz) - 0.05) { open = false; break; } }
          if (open) return true;
        }
        return false;
      };
      window.__mid = (c) => { if (!c.pos) return false; const v = new s.camera.position.constructor(c.pos.x, c.pos.y, c.pos.z).project(s.camera); return v.z < 1 && Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.6; };
      // one step of the sea, and how the caption stands
      window.__step = (n) => {
        const out = { cap: 0, unseen: 0, head: 0, hold: 0, obs: 0, off: 0, ex: [], ks: [] };
        for (let i = 0; i < n; i++) {
          s.advance(1, 0.1);
          const c = s.capState(); if (!c.on) continue;
          out.cap++;
          if (c.asked && !out.ks.includes(c.k)) out.ks.push(c.k);
          // (not seen: on the way, under the heading that says only where it is going; in the first 4 s, the least
          // it stays up so as not to be cut off mid-reading; or otherwise, which is what should not happen)
          if (!window.__seen(c)) if (c.head) out.head++; else if (c.upT < 4) out.hold++; else { out.unseen++; if (out.ex.length < 6 && i % 10 === 0) out.ex.push(`${c.label} [${c.k}] ${c.phase}${c.cruise ? ' cruise' : ''}  d ${c.pos ? Math.hypot(c.pos.x - s.camera.position.x, c.pos.y - s.camera.position.y, c.pos.z - s.camera.position.z).toFixed(0) : '-'} m`); }
          if (c.phase === 'observe' && !c.cruise) { out.obs++; if (!window.__mid(c)) out.off++; }
        }
        return out;
      };
    });
    const add = (o, tag) => { for (const k of ['cap', 'unseen', 'head', 'hold', 'obs', 'off']) total[k] += o[k]; const q = (v) => (100 * v / Math.max(1, o.cap)).toFixed(1); console.log(`  ${tag}: caption ${(o.cap / 10).toFixed(0)} s, unseen ${q(o.unseen)}% (+ on the way ${q(o.head)}%, in its first 4 s ${q(o.hold)}%), observing off-middle ${(100 * o.off / Math.max(1, o.obs)).toFixed(1)}%${o.ex.length ? '; e.g. ' + o.ex.join(' | ') : ''}`); };
    if (run === 'cruise') {
      for (let t = 0; t < SECS; t += 30) add(await p.evaluate((n) => window.__step(n), 300), `cruise ${t}-${t + 30} s`);
    } else if (run === 'guide') {
      for (const id of (process.env.IDS || 'turtle,hibudai,umeiro,manta,napoleon,akashumoku').split(',')) {
        const ok = await p.evaluate((id) => { const s = window.seaglass; const before = s.director.shot; s.goTo(id); return s.director.shot !== before; }, id);
        if (!ok) { console.log(`  guide ${id}: not here`); continue; }
        const o = await p.evaluate(() => window.__step(500));
        // (the heading, each time it was up for the request)
        const ks = o.ks.join(' / ');
        total.asked++; if (o.ks.length && o.ks.every((k) => /図鑑/.test(k))) total.named++;
        add(o, `guide ${id} (heading "${ks}")`);
      }
    } else if (run === 'tap') {
      await p.evaluate(() => window.__step(300));
      for (let k = 0; k < 4; k++) {
        const hit = await p.evaluate(() => {
          const s = window.seaglass, cam = s.camera; let best = null, bd = 1e9;
          for (const j of s.cur.eco.subjects()) {
            const P = j.pos(); if (!P || !j.live() || j.kind === 'cave') continue;
            const c = { pos: { x: P.x, y: P.y, z: P.z }, size: j.size, r: j.frameR?.() ?? 0 };
            if (!window.__seen(c)) continue;
            const d = cam.position.distanceTo(P); if (d < bd) { bd = d; best = { j, P }; }
          }
          if (!best) return null;
          const v = best.P.clone().project(cam), x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
          s.tap(x, y);
          return { label: best.j.label, d: +bd.toFixed(0), picked: s.director.shot?.subject.label ?? null };
        });
        if (!hit) { console.log('  tap: nothing in view'); await p.evaluate(() => window.__step(200)); continue; }
        const o = await p.evaluate(() => window.__step(500));
        const ks = o.ks.join(' / ');
        if (hit.picked) { total.asked++; if (o.ks.length && o.ks.every((k) => /タップ/.test(k))) total.named++; }
        add(o, `tap on ${hit.label} ${hit.d} m → ${hit.picked} (heading "${ks}")`);
      }
    }
    await p.context().close();
  }
  await b.close();
  const q = (v) => (100 * v / Math.max(1, total.cap)).toFixed(1);
  const un = 100 * total.unseen / Math.max(1, total.cap), off = 100 * total.off / Math.max(1, total.obs), nm = 100 * total.named / Math.max(1, total.asked);
  console.log(`caption up ${(total.cap / 10).toFixed(0)} s: subject unseen ${un.toFixed(1)}% (want < 2%; besides, by the rules: on the way ${q(total.head)}%, in its first 4 s ${q(total.hold)}%, before this change all counted); observing, off the middle ${off.toFixed(1)}% (want < 5%, later step); heading names the source ${total.named}/${total.asked} = ${nm.toFixed(0)}% (want 100%)`);
})();
