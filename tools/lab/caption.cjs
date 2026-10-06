// LAB check: does the caption speak only of what is on screen, and say where the request came from?
// (docs/proposals/kayama-review/CAPTION_FOCUS_TAP.md §4.) The sea is stepped frame by frame (a frame is at most 1/20 s of the sea's time), so the
// numbers are the same however slow the renderer. Three runs, each from a fresh page:
//   cruise — the default cruise for SECS seconds;
//   guide  — "go and see" from the field guide, for a few kinds in turn, 25 s each;
//   tap    — a tap on something in view, 25 s each, a few times;
//   tapfish — a tap on a fish in plain view (2–25 m, not behind the reef), 40 times: does it go to that fish's group?
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
// RUNS 'cruise,guide,tap,tapfish'). Nothing is drawn: the measuring needs the sea and the camera, not the picture.
const { chromium } = require('playwright');
(async () => {
  const SEA = process.env.SEA || 'miyako', SECS = +(process.env.SECS || 240), W = +(process.env.W || 390), H = +(process.env.H || 844);
  const RUNS = (process.env.RUNS || 'cruise,guide,tap,tapfish').split(',');
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const total = { cap: 0, unseen: 0, head: 0, hold: 0, obs: 0, off: 0, ringN: 0, ringMiss: 0, ringLoose: 0, asked: 0, named: 0 };
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
      // the ring: does it go round the subject's own fish (or its body), and is it about their size? (one at its largest,
      // round a school wider than the view, only has to sit on the school's middle) The truth is read
      // here from the fish themselves: the group of that kind whose fish's middle is nearest the subject, projected
      window.__ringCheck = (c) => {
        const rg = document.getElementById('capRing'); if (!rg || !rg.classList.contains('on') || rg.classList.contains('edge') || !c.pos) return null;
        const mm = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(rg.style.transform), R = parseFloat(rg.style.getPropertyValue('--r'));
        if (!mm || !R) return null;
        const rx = +mm[1], ry = +mm[2], cam = s.camera, V = cam.position.constructor;
        const parts = (c.key || '').split(':');
        const f = s.cur.fish.find((q) => parts.includes(q.sp.id) || c.label === q.sp.ja || c.label === q.sp.ja + 'の群れ');
        let pts = [];
        if (f && f.dbg?.fp) {
          const fp = f.dbg.fp, dead = f.dbg.dead, G = f.dbg.groups, Ls = f.dbg.leaders, n = f.dbg.total;
          const sets = G ? G.filter((g) => g.placed && g.type !== 'anem').map((g) => { const a = []; for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) a.push(i); return a; })
            : Ls ? Ls.map((L, si) => { const a = []; for (let i = si; i < n; i += Ls.length) if (!dead[i]) a.push(i); return a; }) : [];
          let best = null, bd = 1e9;
          for (const a of sets) { if (!a.length) continue; let x = 0, y = 0, z = 0; for (const i of a) { x += fp[i * 3]; y += fp[i * 3 + 1]; z += fp[i * 3 + 2]; } x /= a.length; y /= a.length; z /= a.length; const d = Math.hypot(x - c.pos.x, y - c.pos.y, z - c.pos.z); if (d < bd) { bd = d; best = a; } }
          // (one fish — the subject is not "...の群れ": the fish of it at the subject's point; a school: its fish)
          if (best && bd < 12 && !/の群れ$/.test(c.label) && f.sp.big) { let bi = -1, bb = 1e9; for (const a of sets) for (const i of a) { const d = Math.hypot(fp[i * 3] - c.pos.x, fp[i * 3 + 1] - c.pos.y, fp[i * 3 + 2] - c.pos.z); if (d < bb) { bb = d; bi = i; } } if (bi >= 0) pts.push(new V(fp[bi * 3], fp[bi * 3 + 1], fp[bi * 3 + 2])); }
          else if (best && bd < 12) for (const i of best.slice(0, 200)) pts.push(new V(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]));
        }
        if (!pts.length) pts = [new V(c.pos.x, c.pos.y, c.pos.z)];
        const pts0 = pts.map((v) => v.clone());
        const sp = pts.map((v) => v.project(cam)).filter((v) => v.z < 1).map((v) => [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]);
        if (!sp.length) return null;
        const inside = sp.filter(([x, y]) => Math.hypot(x - rx, y - ry) < R * 1.1).length / sp.length;
        // (its middle on screen: the middle of the fish in the sea, projected — not the average of where each fish falls on
        // the screen, which the fish nearest the lens throw far out to the edges)
        const c3 = pts0.reduce((a, v) => a.add(v), new V()).multiplyScalar(1 / pts0.length).project(cam), mx = (c3.x * 0.5 + 0.5) * innerWidth, my = (-c3.y * 0.5 + 0.5) * innerHeight;
        let spread = Math.sqrt(sp.reduce((a, p) => a + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0) / sp.length);
        // (one animal: how big it looks, half its length)
        if (pts.length === 1) spread = c.size * 0.5 / Math.max(0.5, cam.position.distanceTo(new V(c.pos.x, c.pos.y, c.pos.z))) * innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360));
        // (a ring at its largest — a third or more of the screen — round a school wider than the view: it must sit on
        // the school's middle, as it cannot go round it all)
        const capped = R >= Math.min(innerWidth, innerHeight) * 0.41, off = Math.hypot(mx - rx, my - ry);
        return { miss: capped ? off > R * 0.6 : inside < 0.5, loose: R > 2.5 * spread + 45, off, R, spread };
      };
      window.__mid = (c) => { if (!c.pos) return false; const v = new s.camera.position.constructor(c.pos.x, c.pos.y, c.pos.z).project(s.camera); return v.z < 1 && Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.6; };
      // one step of the sea, and how the caption stands
      window.__step = (n) => {
        const out = { cap: 0, unseen: 0, head: 0, hold: 0, obs: 0, off: 0, ringN: 0, ringMiss: 0, ringLoose: 0, rex: [], ex: [], ks: [] };
        for (let i = 0; i < n; i++) {
          s.advance(1, 0.1);
          const c = s.capState(); if (!c.on) continue;
          out.cap++;
          if (c.asked && !out.ks.includes(c.k)) out.ks.push(c.k);
          // (not seen: on the way, under the heading that says only where it is going; in the first 4 s, the least
          // it stays up so as not to be cut off mid-reading; or otherwise, which is what should not happen)
          if (!window.__seen(c)) if (c.head) out.head++; else if (c.upT < 4) out.hold++; else { out.unseen++; if (out.ex.length < 6 && i % 10 === 0) out.ex.push(`${c.label} [${c.k}] ${c.phase}${c.cruise ? ' cruise' : ''}  d ${c.pos ? Math.hypot(c.pos.x - s.camera.position.x, c.pos.y - s.camera.position.y, c.pos.z - s.camera.position.z).toFixed(0) : '-'} m`); }
          if (c.phase === 'observe' && !c.cruise) { out.obs++; if (!window.__mid(c)) out.off++; }
          const rc = window.__ringCheck(c);
          if (rc) { out.ringN++; if (rc.miss) out.ringMiss++; if (rc.loose) out.ringLoose++; if ((rc.miss || rc.loose) && out.rex.length < 4 && i % 10 === 0) out.rex.push(`${c.label} ${rc.miss ? 'miss' : 'loose'} (ring ${rc.R.toFixed(0)} px, fish ${rc.spread.toFixed(0)} px, ${rc.off.toFixed(0)} px off)`); }
        }
        return out;
      };
    });
    const add = (o, tag) => { for (const k of ['cap', 'unseen', 'head', 'hold', 'obs', 'off', 'ringN', 'ringMiss', 'ringLoose']) total[k] += o[k]; const q = (v) => (100 * v / Math.max(1, o.cap)).toFixed(1); console.log(`  ${tag}: caption ${(o.cap / 20).toFixed(0)} s, unseen ${q(o.unseen)}% (+ on the way ${q(o.head)}%, in its first 4 s ${q(o.hold)}%), observing off-middle ${(100 * o.off / Math.max(1, o.obs)).toFixed(1)}%, ring off its fish ${(100 * o.ringMiss / Math.max(1, o.ringN)).toFixed(1)}% / too big ${(100 * o.ringLoose / Math.max(1, o.ringN)).toFixed(1)}%${o.rex.length ? ' [' + o.rex.join(' | ') + ']' : ''}${o.ex.length ? '; e.g. ' + o.ex.join(' | ') : ''}`); };
    if (run === 'cruise') {
      for (let t = 0; t < SECS; t += 15) add(await p.evaluate((n) => window.__step(n), 300), `cruise ${t}-${t + 15} s`);   // (a frame is at most 1/20 s of the sea's time)
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
    } else if (run === 'tapfish') {
      // a tap on a fish in plain view (any kind: a small reef fish's group as much as a shark), and whether the
      // drone sets off for that fish's own group (CAPTION_FOCUS_TAP.md rule 5; want 95% or more)
      let tried = 0, went = 0; const miss = [];
      for (let k = 0; k < 40; k++) {
        const r = await p.evaluate((k) => {
          const s = window.seaglass, cam = s.camera, oc = s.cur; cam.updateMatrixWorld();
          const T = oc.T, o = cam.position, cand = [];
          for (const f of oc.fish) {
            const fp = f.dbg?.fp, dead = f.dbg?.dead, n = f.dbg?.total; if (!fp || f.dbg.kelpLife) continue;
            for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 200))) {
              if (dead[i]) continue;
              const x = fp[i * 3], y = fp[i * 3 + 1], z = fp[i * 3 + 2], d = Math.hypot(x - o.x, y - o.y, z - o.z);
              if (d < 2 || d > 25) continue;
              const v = new o.constructor(x, y, z).project(cam); if (v.z > 1 || Math.abs(v.x) > 0.85 || Math.abs(v.y) > 0.75) continue;
              let open = true; for (let t = 0.5; t < d - 0.5; t += 0.5) { const q = t / d; if (o.y + (y - o.y) * q < T.top(o.x + (x - o.x) * q, o.z + (z - o.z) * q) - 0.05) { open = false; break; } }
              if (open) cand.push({ ja: f.sp.ja, sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight, d });
            }
          }
          if (!cand.length) return null;
          const c = cand[(k * 7919) % cand.length];
          s.tap(c.sx, c.sy);
          const sh = s.director.shot;
          return { ja: c.ja, d: +c.d.toFixed(0), got: sh ? sh.subject.label : null };
        }, k);
        if (r) { tried++; if (r.got && r.got.startsWith(r.ja)) went++; else if (miss.length < 8) miss.push(`${r.ja} ${r.d} m → ${r.got}`); }
        await p.evaluate(() => { const s = window.seaglass; s.director.shot = null; s.advance(1, 0.1); for (let i = 0; i < 4; i++) s.advance(20, 0.1); });
      }
      total.tapT = (total.tapT || 0) + tried; total.tapOk = (total.tapOk || 0) + went;
      console.log(`  tap on a fish in view: ${went}/${tried} went to that fish's group${miss.length ? '; missed: ' + miss.join(' | ') : ''}`);
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
  console.log(`caption up ${(total.cap / 20).toFixed(0)} s: subject unseen ${un.toFixed(1)}% (want < 2%; besides, by the rules: on the way ${q(total.head)}%, in its first 4 s ${q(total.hold)}%, before this change all counted); observing, off the middle ${off.toFixed(1)}% (want < 5%, later step); heading names the source ${total.named}/${total.asked} = ${nm.toFixed(0)}% (want 100%); ring off its subject ${(100 * total.ringMiss / Math.max(1, total.ringN)).toFixed(1)}%, too big ${(100 * total.ringLoose / Math.max(1, total.ringN)).toFixed(1)}% of ${(total.ringN / 20).toFixed(0)} s (want under 2%)${total.tapT ? `; a tap on a fish in view goes to its group ${total.tapOk}/${total.tapT} = ${(100 * total.tapOk / total.tapT).toFixed(0)}% (want 95%)` : ''}`);
})();
