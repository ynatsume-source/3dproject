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
// and the camera (a march along the line, the floor as creatures see it), nor a fish of another kind across the line
// (every one of them, its body a third of its length deep); and the whole looks at least 10 px big.
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
  const total = { cap: 0, unseen: 0, head: 0, hold: 0, obs: 0, off: 0, ringN: 0, ringMiss: 0, ringLoose: 0, asked: 0, named: 0, capsN: 0, ambNoRing: 0, ringNoAmb: 0, ringOn: 0, short: 0, capsAll: 0, smallN: 0, sparse: 0 };
  for (const run of RUNS) {
    const p = await (await b.newContext({ viewport: { width: W, height: H }, isMobile: W < H, hasTouch: W < H })).newPage();
    p.setDefaultTimeout(1200000); p.on('pageerror', (e) => console.log('ERR', e.message));
    if (process.env.WHY) await p.addInitScript(() => { window.__WHY = true; });   // (WHY=1: examples of each moment a caption's subject is not seen in its first 4 s)
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
        // (and no school of other fish across the line: every fish of another kind, its body a third of its length deep)
        const parts = (c.key || '').split(':'), mine = (sp) => parts.includes(sp.id) || c.label === sp.ja || (c.label || '').startsWith(sp.ja + 'の');
        const fishes = [];
        const take = (x, y, z, len) => { fishes.push(x, y, z, len * 0.33); };
        for (const f of s.cur.fish) if (!mine(f.sp)) f.each?.(take, 1e6);
        const bb = s.cur.bait; if (bb?.st.active && c.key !== 'baitball' && !mine(bb.bsp)) bb.each?.(take, 1e6);
        const jk = s.cur.jacks; if (jk && c.key !== 'jacks' && !mine(jk.sp)) jk.each?.(take, 1e6);
        const blocked = (x, y, z) => {
          const ux = x - o.x, uy = y - o.y, uz = z - o.z, dd = Math.hypot(ux, uy, uz);
          for (let i = 0; i < fishes.length; i += 4) {
            const qx = fishes[i] - o.x, qy = fishes[i + 1] - o.y, qz = fishes[i + 2] - o.z, t = (qx * ux + qy * uy + qz * uz) / dd;
            if (t < 0.3 || t > dd - 0.3) continue; const k = t / dd;
            if (Math.hypot(qx - ux * k, qy - uy * k, qz - uz * k) < fishes[i + 3]) return true;
          }
          return false;
        };
        for (const [ax, ay, az] of pts) {
          const x = P.x + ax, y = P.y + ay, z = P.z + az, dd = Math.hypot(x - o.x, y - o.y, z - o.z);
          if (dd > see) continue;
          v.set(x, y, z).project(cam); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          let open = true;
          if (!inCave) for (let t = 0.5; t < dd - 0.8; t += 0.5) { const k = t / dd, qx = o.x + (x - o.x) * k, qy = o.y + (y - o.y) * k, qz = o.z + (z - o.z) * k; if (qy < T.top(qx, qz) - 0.05) { open = false; break; } }
          if (open && !blocked(x, y, z)) return true;
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
        // (the jacks' tornado is its own school, apart from the roaming ギンガメアジ of the same name: its own fish)
        if (c.key === 'jacks' && s.cur.jacks?.each) { pts = []; s.cur.jacks.each((x, y, z) => { pts.push(new V(x, y, z)); }, 200); }
        if (!pts.length) pts = [new V(c.pos.x, c.pos.y, c.pos.z)];
        // (a school of small fish shown by one of its fish: the ring must go round a fish of that school, and be about
        // that fish's size — half its length on screen, not the school's spread)
        if (c.one && pts.length > 1 && f) {
          const pxm = innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360)), len = (f.sp.size?.[1] ?? 0.1);
          let hit = false, half = 0;
          for (const v of pts) { const d = cam.position.distanceTo(v), q = v.clone().project(cam); if (q.z > 1) continue; const x = (q.x * 0.5 + 0.5) * innerWidth, y = (-q.y * 0.5 + 0.5) * innerHeight; if (Math.hypot(x - rx, y - ry) < R * 1.1) { hit = true; half = Math.max(half, len * 0.5 / Math.max(d, 0.5) * pxm); } }
          return { miss: !hit, loose: hit && R > 2.5 * half + 45, off: 0, R, spread: half };
        }
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
      // could the words be taken for something else on the screen? (read here apart from the app: another kind of fish
      // or animal in the frame, at least half as big on screen as the subject, which is not itself the picture's lead)
      window.__amb = (c) => {
        if (!c.pos) return false;
        const cam = s.camera, V = cam.position.constructor, o = cam.position, pxm = innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360));
        const P = new V(c.pos.x, c.pos.y, c.pos.z), d0 = Math.max(0.5, o.distanceTo(P)), q = P.clone().project(cam);
        const parts = (c.key || '').split(':'), own = s.cur.fish.find((f) => parts.includes(f.sp.id) || c.label === f.sp.ja || c.label === f.sp.ja + 'の群れ');
        let unit = c.len || 0; if (!unit && own?.each) own.each((x, y, z, len) => { unit = len; return true; }, 20); if (!unit) unit = c.size * 0.5;
        const lead = Math.max(c.r || 0, unit) / d0 * pxm >= Math.min(innerWidth, innerHeight) * 0.25 && Math.abs(q.x) < 0.3 && Math.abs(q.y) < 0.3;
        if (!(q.z < 1 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1)) return false;   // (not on the screen itself: nothing to ring)
        // (filling the view — the camera close to it, or in among its school — it is the picture: nothing to mistake)
        if (Math.max(c.r || 0, unit * 0.55) * 1.15 / d0 * pxm + 6 > Math.min(innerWidth, innerHeight) * 0.6) return false;
        const need = (lead ? 0.75 : 0.5) * unit / d0;   // (the picture's lead: only something nearly as big, three quarters of it)
        // (each fish as it is, at its own length)
        let hit = false;
        for (const f of s.cur.fish) {
          if (f === own || !f.each) continue;
          f.each((x, y, z, len) => { const v = new V(x, y, z), d = v.distanceTo(o); if (d > 90 || len / d < need) return; v.project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) { hit = true; window.__ambWhy = `${f.sp.ja} ${len.toFixed(2)} m at ${d.toFixed(0)} m (subject ${unit.toFixed(2)} m at ${d0.toFixed(0)} m)`; return true; } }, 150);
          if (hit) return true;
        }
        // (and the other animals: turtles, mantas, morays, sea snakes — not the fish's own groups, counted above)
        for (const x of s.cur.eco.subjects()) {
          if (x.key === c.key || parts.some((k) => k && x.key.split(':').includes(k)) || x.kind === 'cave' || s.cur.fish.some((f) => x.key.startsWith(f.sp.id + ':'))) continue;
          const p = x.pos(); if (!p || !x.live()) continue;
          const v = new V(p.x, p.y, p.z), d = v.distanceTo(o); if (d > 90 || (x.len ?? x.size * 0.5) / d < need) continue;
          v.project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) { window.__ambWhy = `${x.label} at ${d.toFixed(0)} m (subject ${unit.toFixed(2)} m at ${d0.toFixed(0)} m)`; return true; }
        }
        return false;
      };
      window.__mid = (c) => { if (!c.pos) return false; const v = new s.camera.position.constructor(c.pos.x, c.pos.y, c.pos.z).project(s.camera); return v.z < 1 && Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.6; };
      // one step of the sea, and how the caption stands
      window.__step = (n) => {
        const out = { cap: 0, unseen: 0, head: 0, hold: 0, obs: 0, off: 0, ringN: 0, ringMiss: 0, ringLoose: 0, rex: [], ex: [], ks: [], capsN: 0, ambNoRing: 0, ringNoAmb: 0, ringOn: 0, nex: [], short: 0, capsAll: 0, sex: [], smallN: 0, sparse: 0, spx: [] };
        const done = (cs) => { if (!cs || cs.n < 20) return; out.capsN++; if (cs.amb && !cs.ring) { out.ambNoRing++; if (out.nex.length < 4) out.nex.push(cs.label + (cs.why ? ' (' + cs.why + ')' : '')); } if (cs.ring && !cs.amb) out.ringNoAmb++; };
        for (let i = 0; i < n; i++) {
          s.advance(1, 0.1);
          const c = s.capState(); if (!c.on) { if (window.__cu && !window.__cu.why) window.__cu.why = c.why; continue; }
          out.cap++;
          if (c.asked && !out.ks.includes(c.k)) out.ks.push(c.k);
          // (not seen: on the way, under the heading that says only where it is going; in the first 4 s, the least
          // it stays up so as not to be cut off mid-reading; or otherwise, which is what should not happen)
          if (!window.__seen(c)) if (c.head) out.head++; else if (c.upT < 4) { out.hold++; if (window.__WHY && i % 10 === 0 && out.ex.length < 12) { const cam = s.camera, v = new cam.position.constructor(c.pos.x, c.pos.y, c.pos.z), d = v.distanceTo(cam.position); v.project(cam); out.ex.push(`[first 4 s] ${c.label} ${c.cruise ? 'cruise' : c.phase} d ${d.toFixed(1)} m, at ${v.x.toFixed(2)},${v.y.toFixed(2)}${v.z > 1 ? ' behind' : ''} r ${(c.r || 0).toFixed(1)} up ${c.upT.toFixed(1)} s`); } } else { out.unseen++; if (out.ex.length < 6 && i % 10 === 0) out.ex.push(`${c.label} [${c.k}] ${c.phase}${c.cruise ? ' cruise' : ''}  d ${c.pos ? Math.hypot(c.pos.x - s.camera.position.x, c.pos.y - s.camera.position.y, c.pos.z - s.camera.position.z).toFixed(0) : '-'} m`); }
          if (c.phase === 'observe' && !c.cruise) { out.obs++; if (!window.__mid(c)) out.off++; }
          // (each caption, from when it comes up: was there anything to mistake it for in its first 2 s, and did a ring show)
          // (each caption as the viewer sees it — one subject, its way there and its look together: how long it was up)
          // (a school of small fish just told of: the nearest of its kind in the frame — how many px long — and how many
          // of its kind within 3 m of its middle; far and sparse — under 14 px and under 12 fish — should not be told of)
          if (c.one && !c.asked && (!window.__cu || window.__cu.key !== c.key)) {
            const f = s.cur.fish.find((q) => (c.key || '').split(':').includes(q.sp.id) || c.label === q.sp.ja + 'の群れ');
            if (f) {
              const cam = s.camera, o = cam.position, V = o.constructor, pxm = innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360));
              let px = 0, n3 = 0;
              f.each((x, y, z, len) => { const v = new V(x, y, z), d = v.distanceTo(o); if (c.pos && Math.hypot(x - c.pos.x, y - c.pos.y, z - c.pos.z) < 3) n3++; v.project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) px = Math.max(px, len / Math.max(d, 0.5) * pxm); }, 1e6);
              out.smallN++; if (px < 14 && n3 < 12) { out.sparse++; if (out.spx.length < 5) out.spx.push(`${c.label} ${px.toFixed(0)} px, ${n3} fish`); }
            }
          }
          if (!window.__cu || window.__cu.key !== c.key) { if (window.__cu && window.__cu.n < 80) { out.short++; if (out.sex.length < 6) out.sex.push(`${window.__cu.label} ${(window.__cu.n / 20).toFixed(1)} s (${window.__cu.why || '?'})`); } if (window.__cu) out.capsAll++; window.__cu = { key: c.key, label: c.label, n: 0 }; }
          window.__cu.n++; window.__cu.why = '';
          if (!window.__cs || window.__cs.key !== c.key + '|' + c.phase) { done(window.__cs); window.__cs = { key: c.key + '|' + c.phase, label: c.label, n: 0, amb: false, ring: false }; }
          const cs = window.__cs; cs.n++;
          const ringOn = document.getElementById('capRing')?.classList.contains('on') && !document.getElementById('capRing')?.classList.contains('edge');
          if (cs.n <= 40 && !c.head && window.__amb(c)) { cs.amb = true; cs.why = window.__ambWhy + ` [app: need ${c.ring?.need}, conf ${c.ring?.conf}, ring ${c.ring?.showT > 0 ? 'up' : 'down'}, r ${c.ring?.r?.toFixed(0)}]`; }
          if (ringOn) { cs.ring = true; out.ringOn++; }
          const rc = window.__ringCheck(c);
          if (rc) { out.ringN++; if (rc.miss) out.ringMiss++; if (rc.loose) out.ringLoose++; if ((rc.miss || rc.loose) && out.rex.length < 4 && i % 10 === 0) out.rex.push(`${c.label} ${rc.miss ? 'miss' : 'loose'} (ring ${rc.R.toFixed(0)} px, fish ${rc.spread.toFixed(0)} px, ${rc.off.toFixed(0)} px off)`); }
        }
        done(window.__cs); window.__cs = null;
        if (window.__cu) { out.capsAll++; window.__cu = null; }   // (the last, cut off by the end of the run: not counted as short)
        return out;
      };
    });
    const add = (o, tag) => { for (const k of ['cap', 'unseen', 'head', 'hold', 'obs', 'off', 'ringN', 'ringMiss', 'ringLoose', 'capsN', 'ambNoRing', 'ringNoAmb', 'ringOn', 'short', 'capsAll', 'smallN', 'sparse']) total[k] += o[k]; if (o.spx.length) console.log('    small fish far and sparse: ' + o.spx.join(' | ')); if (o.sex.length) console.log('    up under 4 s: ' + o.sex.join(' | ')); if (o.nex.length) console.log('    no ring though there was something to mistake it for: ' + o.nex.join(' | ')); const q = (v) => (100 * v / Math.max(1, o.cap)).toFixed(1); console.log(`  ${tag}: caption ${(o.cap / 20).toFixed(0)} s, unseen ${q(o.unseen)}% (+ on the way ${q(o.head)}%, in its first 4 s ${q(o.hold)}%), observing off-middle ${(100 * o.off / Math.max(1, o.obs)).toFixed(1)}%, ring off its fish ${(100 * o.ringMiss / Math.max(1, o.ringN)).toFixed(1)}% / too big ${(100 * o.ringLoose / Math.max(1, o.ringN)).toFixed(1)}%${o.rex.length ? ' [' + o.rex.join(' | ') + ']' : ''}${o.ex.length ? '; e.g. ' + o.ex.join(' | ') : ''}`); };
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
  console.log(`caption up ${(total.cap / 20).toFixed(0)} s: subject unseen ${un.toFixed(1)}% (want < 2%; besides, by the rules: on the way ${q(total.head)}%, in its first 4 s ${q(total.hold)}%, before this change all counted); observing, off the middle ${off.toFixed(1)}% (want < 5%, later step); heading names the source ${total.named}/${total.asked} = ${nm.toFixed(0)}% (want 100%); ring off its subject ${(100 * total.ringMiss / Math.max(1, total.ringN)).toFixed(1)}%, too big ${(100 * total.ringLoose / Math.max(1, total.ringN)).toFixed(1)}% of ${(total.ringN / 20).toFixed(0)} s (want under 2%); captions ${total.capsN}: something to mistake it for but no ring ${total.ambNoRing} (want 0), a ring with nothing to mistake it for ${total.ringNoAmb}; ring up ${(100 * total.ringOn / Math.max(1, total.cap)).toFixed(0)}% of caption time; captions up under 4 s ${total.short}/${total.capsAll} (want 0); small-fish schools told of far and sparse ${total.sparse}/${total.smallN} (want 0)${total.tapT ? `; a tap on a fish in view goes to its group ${total.tapOk}/${total.tapT} = ${(100 * total.tapOk / total.tapT).toFixed(0)}% (want 95%)` : ''}`);
})();
