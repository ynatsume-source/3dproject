// HUD layout check across devices: with every floating element shown at once (hunt window, map, quick buttons,
// caption, sea log, bar, back-to-cruise), list any two that overlap. Phone portrait and landscape, tablet, PC.
// Usage (a build served at PORT): node tools/layout/overlap.cjs   (env PORT, default 4174; CHROME for the browser)
const { chromium } = require('playwright');
const SIZES = [['phone portrait', 390, 844, true], ['phone portrait small', 360, 740, true], ['phone landscape', 844, 390, true],
  ['phone landscape small', 667, 375, true], ['phone landscape large', 932, 430, true], ['tablet', 820, 1180, true], ['PC', 1440, 900, false]];
const IDS = ['pip', 'minimap', 'quick', 'caption', 'toast', 'dock', 'backCruise', 'brand'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0;
  for (const [name, w, h, mob] of SIZES) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob })).newPage();
    p.setDefaultTimeout(300000);
    await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=low&debug#miyako`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.seaglass && window.seaglass.cur, null, { timeout: 250000 });
    const out = await p.evaluate((IDS) => {
      const $ = (id) => document.getElementById(id);
      // (where things come to rest: no transitions half way)
      const st = document.createElement('style'); st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'; document.head.appendChild(st);
      // everything up at once, as it can be
      $('pip').hidden = false; $('pip').style.opacity = '1';
      $('pipText').textContent = 'スジアラ — かわされて、次を狙っている';
      $('caption').classList.add('on'); $('caption').querySelector('.t b').textContent = 'カスミアジ'; $('caption').querySelector('.s').textContent = 'フエヤッコダイの群れとの距離を詰めていく';
      $('toast').classList.add('on'); $('toastT').textContent = 'アカシュモクザメの気配に、ノコギリダイの群れがざわつきはじめた'; $('toastK').textContent = 'SEA LOG ・ ↖ 55m';
      window.seaglass.goTo('turtle');   // (a visit asked for: the back-to-cruise button up, the caption stepped up for it)
      return new Promise((res) => { const t0 = performance.now(); const wait = () => (document.body.classList.contains('asked') || performance.now() - t0 > 30000 ? go() : setTimeout(wait, 300)); setTimeout(wait, 300); const go = () => setTimeout(() => {
        // (the caption at its fullest, as it is on arriving at something asked for: heading, name, what it is doing,
        // its size, and a long note — filled in just before measuring, as the app would have it)
        const cap = $('caption'); cap.classList.add('on'); cap.classList.remove('head');
        cap.querySelector('.k').textContent = 'タップから ・ 観察中'; cap.querySelector('.t b').textContent = 'ミスジリュウキュウスズメダイの群れ'; cap.querySelector('.t i').textContent = 'Dascyllus aruanus';
        cap.querySelector('.s').textContent = '近くの捕食者を避けて、礁に身を寄せている'; if (cap.querySelector('.m')) cap.querySelector('.m').textContent = '全長 約1.6 m・推定7歳';
        cap.querySelector('.n').textContent = '通称グレート・バラクーダ。銀色の細長い体で中層に静止し、獲物に気づくと矢のような速さで襲いかかる。背の黒い山形の模様と、尾びれの白い縁が目印。大きな個体はひとりで、若い個体は群れで泳ぐ。';
        const r = {};
        // (only what is actually showing: an element faded right out takes no room on the screen)
        const shown = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
        for (const id of IDS) { const el = $(id); if (!el) continue; const q = el.getBoundingClientRect(); if (q.width > 1 && q.height > 1 && shown(el)) r[id] = [q.left, q.top, q.right, q.bottom]; }
        const hits = [];
        const ks = Object.keys(r);
        for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
          const a = r[ks[i]], c = r[ks[j]], ox = Math.min(a[2], c[2]) - Math.max(a[0], c[0]), oy = Math.min(a[3], c[3]) - Math.max(a[1], c[1]);
          if (ox > 2 && oy > 2) hits.push(`${ks[i]}×${ks[j]} (${Math.round(ox)}×${Math.round(oy)})`);
        }
        const off = ks.filter((k) => r[k][0] < -1 || r[k][1] < -1 || r[k][2] > innerWidth + 1 || r[k][3] > innerHeight + 1);
        res({ hits, off, asked: document.body.classList.contains('asked') });
      }, 300); });
    }, IDS);
    const n = out.hits.length + out.off.length; bad += n;
    console.log(`${name} ${w}x${h}${out.asked ? '' : ' (the back-to-cruise button never came up)'}: ${n ? 'overlaps ' + out.hits.join(', ') + (out.off.length ? ' / off screen ' + out.off.join(', ') : '') : 'ok'}`);
    if (process.env.OUT) await p.screenshot({ path: `${process.env.OUT}/layout_${w}x${h}.png`, timeout: 120000 }).catch(() => {});
    await p.close();
  }
  await b.close();
  console.log(bad ? `FAIL (${bad})` : 'PASS');
  process.exit(bad ? 1 : 0);
})();
