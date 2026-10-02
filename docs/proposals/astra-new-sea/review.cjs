// Optional browser review. Requires Playwright and Chromium supplied by the review environment;
// neither is added to the application dependencies. Run a production preview on port 4177 first.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.join(__dirname, 'screenshots'); fs.mkdirSync(out, { recursive: true });
const tier = process.argv[2] || 'low';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], externalFailures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR_TUNNEL_CONNECTION_FAILED')) errors.push(m.text()); });
  page.on('requestfailed', r => externalFailures.push({ url: r.url(), failure: r.failure()?.errorText }));
  // Count actual submitted WebGL draws, including post-process passes. Static geometry is separate.
  await page.addInitScript(() => {
    window.__draw = { calls: 0, triangles: 0, frames: [] };
    for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        window.__draw.calls++; if (args[0] === 4) window.__draw.triangles += (method.includes('Elements') ? args[1] : args[2]) / 3 * (method.includes('Instanced') ? args[4] ?? args[3] : 1);
        return original.apply(this, args);
      };
    }
    const tick = () => { const d = window.__draw; d.frames.push({ calls: d.calls, triangles: d.triangles }); if (d.frames.length > 20) d.frames.shift(); d.calls = d.triangles = 0; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
  const frames = async (n = 10) => page.evaluate(n => new Promise(resolve => { const f = () => --n > 0 ? requestAnimationFrame(f) : resolve(); requestAnimationFrame(f); }), n);
  const noon = '2026-09-22T20:00:00Z';
  await page.goto(`http://127.0.0.1:4177/?debug&tier=${tier}&at=${noon}#pointlobos`);
  await page.waitForFunction(() => document.body.classList.contains('mode-ocean'), { timeout: 180000 });
  await page.evaluate(() => { const s = window.seaglass; s.clock.live = false; s.clock.speed = 0; s.setWx({ cloud: 0.10, wind: 2, wave: 0.6 }); s.drone.mode = 'manual'; s.drone.lastInput = performance.now(); s.director.reset(); });
  const anchor = await page.evaluate(() => {
    const a = window.seaglass.cur.kelp.anchors.reduce((a, b) => Math.hypot(b.pos.x + 22, b.pos.z - 16) < Math.hypot(a.pos.x + 22, a.pos.z - 16) ? b : a);
    return { root: a.pos.toArray(), top: a.top.toArray() };
  });
  const shots = [];
  const pose = async (p, look) => page.evaluate(({ p, look }) => {
    const s = window.seaglass, dx = look[0] - p[0], dz = look[2] - p[2], dy = look[1] - p[1];
    s.drone.mode = 'manual'; s.director.reset(); s.drone.pos.set(...p); s.drone.vel.set(0, 0, 0);
    s.drone.yaw = Math.atan2(-dx, -dz); s.drone.pitch = Math.atan2(dy, Math.hypot(dx, dz)); s.drone.lastInput = performance.now(); s.drone.sky = p[1] > 0;
  }, { p, look });
  const shot = async (name, p, look) => {
    await pose(p, look); await frames(12);
    await page.screenshot({ path: path.join(out, `${tier}-${name}.png`) });
    shots.push({ name, p, look, submitted: await page.evaluate(() => window.__draw.frames.slice(-5)) });
    console.log('captured', tier, name);
  };
  const r = anchor.root, t = anchor.top;
  await shot('forest', [r[0] + 6, r[1] + 5.5, r[2] + 10], [r[0] - 2, r[1] + 7.5, r[2] - 3]);
  await shot('canopy', [t[0] + 3.4, -3.8, t[2] + 4.5], [t[0] + 1.4, -0.65, t[2] + 0.7]);
  await shot('holdfast', [r[0] + 2.1, r[1] + 1.4, r[2] + 2.7], [r[0], r[1] + 0.5, r[2]]);
  // Population really moves, independently of the frozen astronomical time.
  const before = await page.evaluate(() => Array.from(window.seaglass.cur.fish[0].dbg.fp.slice(0, 12)));
  await frames(20);
  const after = await page.evaluate(() => Array.from(window.seaglass.cur.fish[0].dbg.fp.slice(0, 12)));
  assert.notDeepEqual(after, before, 'fish positions did not advance');
  const fish = await page.evaluate(() => window.seaglass.cur.fish[0].focus(window.seaglass.camera.position).pos().toArray());
  await shot('rockfish', [fish[0] + 2, fish[1] + 0.3, fish[2] + 5.2], fish);
  await page.locator('#btnGuide').click(); await frames(8);
  const guide = await page.locator('#guide').innerText();
  assert.ok(guide.includes('ケルプと底生生物') && !guide.includes('サンゴと底生生物'));
  assert.ok(!guide.includes('クマノミ') && !guide.includes('シャコガイ') && !guide.includes('島の住人'));
  await page.screenshot({ path: path.join(out, `${tier}-guide.png`) });
  const destinations = [];
  for (const id of ['kelp', 'canopy', 'channel']) {
    await page.locator(`#guide [data-go="place:${id}"]`).click(); await frames(3);
    destinations.push(await page.evaluate(() => { const sh = window.seaglass.director.current; return { mode: window.seaglass.drone.mode, toast: document.getElementById('toastT').textContent }; }));
    assert.equal(destinations.at(-1).mode, 'auto');
  }
  await page.locator('#btnGuide').click();
  await page.evaluate(() => { const s = window.seaglass; s.clock.ms = Date.parse('2026-09-23T08:00:00Z'); s.clock.speed = 0; s.clock.live = false; s.setWx({ cloud: 0.1, wind: 2, wave: 0.6 }); });
  await shot('night', [r[0] + 6, r[1] + 5.5, r[2] + 10], [r[0] - 2, r[1] + 7.5, r[2] - 3]);
  assert.ok(await page.evaluate(() => window.seaglass.U.uNight.value > 0.8));
  const runtime = await page.evaluate(() => {
    const s = window.seaglass; let bio;
    s.cur.group.parent.traverse(o => { if (o.material?.uniforms?.uBiolum) bio = o.material.uniforms.uBiolum.value; });
    return { kelp: s.cur.kelp.stats, species: s.cur.fish.map(f => ({ id: f.sp.id, count: f.dbg.total, status: f.status() })), nightBio: bio };
  }); assert.equal(runtime.nightBio, 0);
  // A genuine globe/card round trip, waiting beyond the 1800 ms globe camera tween.
  if (tier === 'low') {
    await page.locator('#btnBack').click(); await page.waitForFunction(() => document.body.classList.contains('mode-globe')); await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, 'low-globe.png') });
    await page.locator('#locList .loc').filter({ hasText: '宮古島' }).click();
    await page.waitForFunction(() => document.body.classList.contains('mode-ocean') && window.seaglass.cur.loc.id === 'miyako', { timeout: 180000 }); await frames(10);
    const restored = await page.evaluate(() => { const s = window.seaglass; let bio; s.cur.group.parent.traverse(o => { if (o.material?.uniforms?.uBiolum) bio = o.material.uniforms.uBiolum.value; }); return { bio, map: document.querySelector('#miniMap .cr')?.textContent || document.querySelector('.cr')?.textContent, kelpVisible: s.cur.group.parent.children.some(o => o.visible && o.children.some(m => m.name === 'Macrocystis forest')) }; });
    assert.equal(restored.bio, 1); assert.equal(restored.kelpVisible, false); assert.equal(restored.map, '国土地理院');
    await page.screenshot({ path: path.join(out, 'low-miyako-return.png') });
    await page.evaluate(() => {
      const s = window.seaglass, p = s.drone.pos.clone(); p.z -= 4;
      s.drone.mode = 'manual'; s.drone.lastInput = performance.now();
      // Old sea is paused when left: this subject deliberately remains live forever.
      s.cur.eco.subjects = () => [{ key: 'old-sea-test', label: '旧海のサンゴ礁テスト', kind: 'hunt', prio: 99, size: 0.4, pos: () => p, status: () => '小魚を追いかけている', live: () => true }];
      s.seaLog('observe', '旧海のサンゴ通知その1'); s.seaLog('observe', '旧海のサンゴ通知その2');
      s.U.uFire.value.w = 1; s.U.uCamCave.value = 0;
    });
    await frames(24);
    assert.equal(await page.evaluate(() => window.seaglass.pip().subj), 'old-sea-test');
    await page.locator('#btnBack').click(); await page.waitForFunction(() => document.body.classList.contains('mode-globe')); await page.waitForTimeout(2500);
    await page.locator('#locList .loc').filter({ hasText: 'ポイントロボス' }).click();
    await page.waitForFunction(() => document.body.classList.contains('mode-ocean') && window.seaglass.cur.loc.id === 'pointlobos', { timeout: 120000 }); await frames(8);
    const returned = await page.evaluate(() => ({ count: window.seaglass.cur.kelp.anchors.length, map: document.querySelector('.cr')?.textContent }));
    assert.equal(returned.count, runtime.kelp.holdfasts); assert.equal(returned.map, '地図未収録');
    await page.waitForTimeout(21000); await frames(3);
    const clean = await page.evaluate(() => { const s = window.seaglass; return { pip: s.pip().subj, fire: s.U.uFire.value.w, cave: s.U.uCamCave.value, toast: document.getElementById('toastT').textContent, caption: document.getElementById('caption').innerText }; });
    assert.notEqual(clean.pip, 'old-sea-test'); assert.equal(clean.fire, 0); assert.equal(clean.cave, 1);
    assert.ok(!clean.toast.includes('旧海') && !clean.caption.includes('旧海'));
    runtime.crossSeaCleanup = clean;
    runtime.roundTrip = { restored, returned };
  }
  assert.deepEqual(errors, []);
  const report = { tier, viewport: '1440x900', renderer: 'Chromium / SwiftShader; not hardware performance', anchor, runtime, shots, destinations, guide, errors, externalFailures };
  fs.writeFileSync(path.join(__dirname, `browser-${tier}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ tier, runtime, errors, externalFailures }));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
