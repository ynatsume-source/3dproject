const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.setDefaultTimeout(900000);
  await p.goto(`http://localhost:4174/?tier=lite&debug&time=21:00&wx=clear#miyako`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.seaglass && window.seaglass.cur && window.seaglass.cur.eco, null, { timeout: 350000 });
  await p.evaluate(() => { const s = window.seaglass; s.endOpening(); s.hold(true); s.advance(900, 0.05); });
  await p.screenshot({ path: process.argv[2] + '/night1.png' });
  await p.evaluate(() => window.seaglass.advance(600, 0.05));
  await p.screenshot({ path: process.argv[2] + '/night2.png' });
  console.log(await p.evaluate(() => JSON.stringify({ y: window.seaglass.drone.pos.y.toFixed(1), lamp: window.seaglass.U.uLamp.value })));
  await b.close();
})();
