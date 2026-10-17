// LAB: the husk-and-cord things at a worksite as the stream sees them (src/robots/coir-look.ts): the test worksite by
// Dot's home (?coirlook=wet|dry|both), held at a close view and a watch's view from a little above, and shot.
// Usage (a build served at PORT): node tools/lab/coir-look.cjs   (env PORT 4174, OUT coir, LOOK both|wet|dry|none,
// TIME 12:00, DATE (none: today), WX clear, SIZE 1920x1080, TIER high, VIEWS 'close,watch')
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const OUT = process.env.OUT || 'coir', LOOK = process.env.LOOK || 'both', TIME = process.env.TIME || '12:00';
  const [W, H] = (process.env.SIZE || '1920x1080').split('x').map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  const q = `tier=${process.env.TIER || 'high'}&debug&lab&time=${TIME}${process.env.DATE ? '&date=' + process.env.DATE : ''}&wx=${process.env.WX || 'clear'}${LOOK !== 'none' ? '&coirlook=' + LOOK : ''}`;
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?${q}#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  const views = (process.env.VIEWS || 'close,watch').split(',');
  for (const v of views) {
    const r = await p.evaluate((v) => {
      const s = window.seaglass; s.endOpening?.();
      const dh = s.cur.residents.list.find((x) => x.id === 'dot').sp.home, t = [dh[0] + 1.8, 0, dh[1] + 3.0]; t[1] = s.cur.loc.f(t[0], t[2]) + 0.05;
      const off = v === 'close' ? [1.4, 1.1, 1.6] : [4.2, 3.2, -2.0];   // (close: a person crouched by it; watch: the usual view a little above)
      const pos = [t[0] + off[0], t[1] + off[1], t[2] + off[2]], d = [t[0] - pos[0], t[1] - pos[1], t[2] - pos[2]], l = Math.hypot(...d);
      s.hold(true); s.aim(pos, Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)); s.advance(+(window.__N || 10), 0.1);
      const c = s.cur.coirLook?.counts?.(); return { counts: c, pos: pos.map((x) => +x.toFixed(1)) };
    }, v);
    await p.screenshot({ path: `${OUT}/${LOOK}-${TIME.replace(':', '')}-${v}.png` });
    console.log(v, JSON.stringify(r));
  }
  await b.close();
})();
