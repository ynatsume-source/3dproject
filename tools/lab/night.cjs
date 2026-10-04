// LAB check: is night night? The same views (in the sea, and over it from the air) at noon, on a full-moon
// night and on a moonless one: the mean brightness of the frame (0-255) and how much of it is near white.
// Want: a full-moon night well under noon (<= 45%), a moonless one darker still (<= 25%), and at night
// (a metre off the reef under the lamp: brightness not compared with noon, only no white-out)
// almost nothing blown out (< 2% of the frame over 235), yet not black (mean >= 8: the reef still reads).
// Usage (a build served at PORT): node tools/lab/night.cjs   (env PORT, default 4174; CHROME for the browser)
const { chromium } = require('playwright');
const SHOTS = [['noon', '2026-10-26', '12:30'], ['full moon', '2026-10-26', '00:30'], ['moonless', '2026-10-11', '00:30']];
// (close: a metre over the reef looking down at it, where the drone's lamp comes on at night)
const VIEWS = [['sea', [20, -7, 30], -0.15], ['air', [20, 6, 30], -0.35], ['close', [24, null, 26], -0.9]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const res = {};
  for (const [name, date, time] of SHOTS) {
    const p = await (await b.newContext({ viewport: { width: 480, height: 300 } })).newPage();
    p.setDefaultTimeout(400000); p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=low&debug&date=${date}&time=${time}&wx=clear#miyako`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.seaglass && window.seaglass.cur, null, { timeout: 350000 });
    await p.addStyleTag({ content: '.hud, #hint, #bubbles, #caption, #toast, #minimap, #brand, #sharedBadge { visibility: hidden !important; }' });
    for (const [vn, at, pitch] of VIEWS) {
      await p.evaluate(([at, pitch]) => { const s = window.seaglass, d = s.drone; if (at[1] == null) at = [at[0], s.cur.T.top(at[0], at[2]) + 1.3, at[2]]; d.mode = 'manual'; d.lastInput = performance.now() + 1e7; d.pos.set(...at); d.vel.set(0, 0, 0); d.yaw = 0.6; d.pitch = pitch; }, [at, pitch]);
      await p.waitForTimeout(9000);   // (the exposure eases in)
      await p.evaluate(([at]) => { const s = window.seaglass; if (at[1] == null) at = [at[0], s.cur.T.top(at[0], at[2]) + 1.3, at[2]]; s.drone.pos.set(...at); s.drone.vel.set(0, 0, 0); }, [at]);
      await p.waitForTimeout(1500);
      const png = (await p.screenshot()).toString('base64');
      const m = await p.evaluate(async (src) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let sum = 0, hot = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; if (l > 235) hot++; n++; }
        return { mean: sum / n, hot: hot / n };
      }, png);
      res[`${name}/${vn}`] = m;
      require('fs').writeFileSync(`${process.env.OUT || '.'}/night-${name.replace(' ', '')}-${vn}.png`, Buffer.from(png, 'base64'));
    }
    await p.close();
  }
  await b.close();
  let bad = 0;
  for (const [vn] of VIEWS) {
    const noon = res[`noon/${vn}`].mean;
    for (const [name] of SHOTS) {
      const r = res[`${name}/${vn}`], k = r.mean / noon;
      let ok = true;
      if (vn === 'close') { ok = r.hot < 0.02; if (!ok) bad++; console.log(`${vn} ${name.padEnd(9)} mean ${r.mean.toFixed(1)}, near white ${(r.hot * 100).toFixed(1)}% ${ok ? 'ok' : 'FAIL'}`); continue; }
      if (name === 'full moon') ok = k <= 0.45 && r.hot < 0.02 && r.mean >= 8;
      if (name === 'moonless') ok = k <= 0.25 && r.hot < 0.02 && r.mean >= 8;
      if (!ok) bad++;
      console.log(`${vn} ${name.padEnd(9)} mean ${r.mean.toFixed(1)} (${(k * 100).toFixed(0)}% of noon), near white ${(r.hot * 100).toFixed(1)}% ${ok ? 'ok' : 'FAIL'}`);
    }
  }
  console.log(bad ? `FAIL (${bad})` : 'PASS');
  if (bad) process.exit(1);
})();
