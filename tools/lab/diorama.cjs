// LAB: the diorama finish as it is in use (docs/proposals/nature-look-2026-10-09/DIORAMA.md): watching Dot on the
// island, the camera at eye level, a little above and well above (the watch's elevation and distance), each held for a
// few seconds of the island's time and shot; the finish's strength and focus are printed with each.
// Usage (a build served at PORT): node tools/lab/diorama.cjs   (env PORT 4174, OUT diorama, WHO dot, TIME 12:00, TIER high,
// VIEWS JSON [[name, elevation rad, distance m], …], NODIO 1: the same without it)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const OUT = process.env.OUT || 'diorama', WHO = process.env.WHO || 'dot', TAG = process.env.NODIO ? 'off' : 'on';
  const VIEWS = JSON.parse(process.env.VIEWS || '[["eye",0.15,5],["above",0.55,8],["high",0.85,11]]');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=${process.env.TIER || 'high'}&debug&lab&time=${process.env.TIME || '12:00'}&wx=clear${process.env.NODIO ? '&nodiorama' : ''}#planet`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.residents), null, { timeout: 600000 });
  await p.addStyleTag({ content: '#newMark, #capRing { display: none !important; }' });
  await p.evaluate(([who, warm]) => { const s = window.seaglass; s.endOpening?.(); s.startWatch(who); const r = s.cur.residents.list.find((x) => x.id === who); s.drone.pos.set(r.pos.x + 4, r.pos.y + 2.5, r.pos.z + 4); s.hold(true); s.advance(warm, 0.1); }, [WHO, +(process.env.WARM || 30)]);   // (the drone put down by them: flying in from the sea takes minutes of drawing)
  console.log('watching', WHO);
  for (const [name, el, dist] of VIEWS) {
    const r = await p.evaluate(([el, dist]) => {
      const s = window.seaglass; s.watch.el = el; s.watch.dist = dist;
      s.advance(20, 0.1);
      const c = s.camera.position, u = s.post?.compMat?.uniforms;
      return { cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)), k: u ? +u.uDio.value.toFixed(2) : null, focus: u ? +u.uFocus.value.toFixed(1) : null };
    }, [el, dist]);
    await p.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
    console.log(name, JSON.stringify(r));
  }
  await b.close();
})();
