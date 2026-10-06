// LAB: every caption that actually comes up, written out to be read through (the heading, the name, the status line,
// the note). Each sea, by day and by night, nothing drawn, the sea stepped 1/20 s a frame:
//   cruise 240 s (the cruise's own captions, notices, and a tap on any NEW SIGHTING ring that comes up);
//   "go and see" for every entry of the field guide and its places, 30 s each;
//   the rare sights that can happen there, and a leap;
//   taps on fish in view and on the seabed.
// Each distinct caption is kept once, with how often it came up and where. Written to OUT (JSON lines).
// Usage (a build served at PORT): node tools/lab/captext.cjs   (env PORT 4174, SEAS 'miyako,...', TIMES '10:00,21:00',
// OUT captext.jsonl, CRUISE 240)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEAS = (process.env.SEAS || 'miyako,kayama,gbr,redsea,maldives,galapagos,carnatic,pacific,pointlobos').split(',');
  const TIMES = (process.env.TIMES || '10:00,21:00').split(','), OUT = process.env.OUT || 'captext.jsonl', CRUISE = +(process.env.CRUISE || 240);
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sea of SEAS) for (const time of TIMES) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', sea, e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=lite&debug&lab&time=${time}&wx=clear#${sea}`, { waitUntil: 'commit' });
    try { await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 }); } catch (e) { console.log('skip', sea, e.message); await p.context().close(); continue; }
    await p.waitForTimeout(3000);
    const res = await p.evaluate(async ({ CRUISE, time }) => {
      const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(5, 0.1);
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'bufferSubData', 'texSubImage2D', 'readPixels']) if (C.prototype[f]) C.prototype[f] = function () {};
      const seen = new Map(), $ = (id) => document.getElementById(id), tx = (el, q) => (el.querySelector(q)?.textContent ?? '').trim();
      let how = 'cruise';
      const rec = () => {
        const c = $('caption');
        if (c.classList.contains('on')) {
          const st = s.capState(), k = tx(c, '.k'), t = tx(c, '.t b'), i = tx(c, '.t i'), st2 = tx(c, '.s'), m = tx(c, '.m'), n = tx(c, '.n');
          const key = ['cap', k, t, st2, m, n].join('|');
          const e = seen.get(key) ?? { what: 'caption', k, t, i, s: st2, m, n, subj: st.key, phase: st.phase, how, n0: 0 };
          e.n0++; seen.set(key, e);
        }
        const tt = $('toast');
        if (tt.classList.contains('on')) {
          const k = tx(tt, '.k'), t = tx(tt, '.t'), st2 = tx(tt, '.s'), key = ['toast', k.replace(/[↑↗→↘↓↙←↖] ?\d+m/, '…'), t, st2].join('|');
          const e = seen.get(key) ?? { what: 'toast', k, t, s: st2, how, n0: 0 }; e.n0++; seen.set(key, e);
        }
        const nm = $('newMark');
        if (nm.classList.contains('on') && Math.random() < 0.05) nm.click();
      };
      const step = (sec) => { for (let i = 0; i < sec * 20; i++) { s.advance(1, 0.05); rec(); } };   // (a frame is at most 1/20 s of the sea's time)
      const free = () => { s.director.shot = null; step(3); };
      how = 'cruise'; step(CRUISE);
      for (const id of s.guideIds()) { how = 'guide:' + id; s.goTo(id); step(30); free(); }
      for (const id of ['mantatrain', 'fishwall', 'tornado', 'hammers', 'heatrun', 'spawning', 'bigbait']) { how = 'rare:' + id; let ok = false; try { ok = !!s.rare(id); } catch (e) { /* not here */ } if (ok) { step(45); free(); } }
      for (const k of ['manta', 'whale']) { how = 'leap:' + k; let ok = false; try { ok = !!s.breach(k); } catch (e) { /* not here */ } if (ok) { step(40); free(); } }
      // taps: a fish in view, then the seabed in the middle of the screen
      for (let k = 0; k < 8; k++) {
        how = 'tap:fish';
        const cam = s.camera; cam.updateMatrixWorld();
        const o = cam.position, cand = [];
        for (const f of s.cur.fish) {
          const fp = f.dbg?.fp, dead = f.dbg?.dead, n = f.dbg?.total; if (!fp) continue;
          for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 100))) { if (dead[i]) continue; const v = new o.constructor(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]); if (v.distanceTo(o) > 20) continue; v.project(cam); if (v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.7) cand.push([(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]); }
        }
        if (cand.length) { const c = cand[(k * 7919) % cand.length]; s.tap(c[0], c[1]); step(25); free(); }
        else step(10);
      }
      how = 'tap:seabed'; s.tap(innerWidth / 2, innerHeight * 0.7); step(25); free();
      return [...seen.values()].map((e) => ({ ...e, time }));
    }, { CRUISE, time });
    fs.appendFileSync(OUT, res.map((e) => JSON.stringify({ sea, ...e })).join('\n') + '\n');
    console.log(sea, time, res.length, 'distinct');
    await p.context().close();
  }
  await b.close();
})();
