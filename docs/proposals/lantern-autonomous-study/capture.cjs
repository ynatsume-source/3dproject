// Actual browser integration capture. No task/observation/work state is fabricated.
// npm run dev -- --host 0.0.0.0 --port 4192
// node docs/proposals/lantern-autonomous-study/capture.cjs http://127.0.0.1:4192
// Simulation time is stepped explicitly. This is not an AI or frame-rate benchmark.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:4192';
const reuseVideo = process.argv.find(arg => arg.startsWith('--reuse-video='))?.slice('--reuse-video='.length);
const output = path.join(__dirname, 'images');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-study-capture-'));
const startTime = Date.parse('2026-10-01T13:00:00Z');
const report = { status: 'running', capturedAt: new Date().toISOString(), source: base,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' }).trim(),
  method: { scene: 'Actual application island and resident model', viewport: [1200, 900],
    simulatedStartUtc: new Date(startTime).toISOString(), cloud: 0.08, cloudSource: 'simulation',
    controller: 'Rules; optional AI disabled; no paid API call', physicsStepSeconds: 0.25,
    notes: ['Resident tasks, arrival, duration and completion run through the real Residents.update method.',
      'The browser clock is controlled and advanced with the simulation. Warmup does not render every physics step.',
      'No observations, works, task completion flags, resident positions or model geometry are inserted for capture.',
      'The ordinary render loop runs for visual captures; screenshots and fixed-step video are not GPU benchmarks.'] },
  checks: {}, stages: [], images: [], videos: [], errors: [], localFailures: [], externalFailures: [], apiRequests: [] };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
    await context.addInitScript(({ initial }) => {
      let restoredTime = initial;
      try { restoredTime = +(localStorage.getItem('capture.lantern.worldTime') || initial); } catch { /* isolated SVG preview has no storage origin */ }
      window.__captureTime = restoredTime;
      Date.now = () => window.__captureTime;
    }, { initial: startTime });
    const page = await context.newPage();
    page.on('pageerror', error => { report.errors.push(error.message); console.error(error.message); });
    page.on('request', request => { if (request.url().includes('api.anthropic.com')) report.apiRequests.push(request.url()); });
    page.on('requestfailed', request => (request.url().startsWith(base) ? report.localFailures : report.externalFailures)
      .push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) (response.url().startsWith(base) ? report.localFailures : report.externalFailures)
      .push({ url: response.url(), status: response.status() }); });
    async function load(study) {
      await page.goto(`${base}/?debug&tier=low${study ? '&lantern-study' : ''}&at=2026-10-01T13:00:00Z#kayama`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.seaglass?.cur?.loc.id === 'kayama' && !document.getElementById('veil').classList.contains('on'), null, { timeout: 180000 });
    }
    await load(false);
    report.checks.normalMode = await page.evaluate(() => {
      const r = seaglass.cur.residents; r.save();
      return { prototypeAbsent: !r.study, dedicatedSaveAbsent: localStorage.getItem('seaglass.lantern-study.residents.v1') === null,
        legacy: localStorage.getItem('seaglass.residents.v1') };
    });
    assert.equal(report.checks.normalMode.prototypeAbsent, true);
    assert.equal(report.checks.normalMode.dedicatedSaveAbsent, true);
    const legacy = report.checks.normalMode.legacy; delete report.checks.normalMode.legacy;
    await load(true);
    async function control() {
      report.renderer = await page.evaluate(() => {
        const s = seaglass, R = s.cur.residents, gl = document.getElementById('scene').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const c = window.__studyCapture = { queue: [], timestamp: performance.now(), frames: 0, skipGpu: false,
          originalUpdate: R.update.bind(R), worldCalls: [], expectedResidentMs: Date.now() };
        s.clock.live = false; s.clock.speed = 0; s.clock.ms = Date.now(); s.setWx({ cloud: 0.08, wind: 1.2 });
        R.setStudyWeather(0.08, 'simulation');
        s.drone.mode = 'manual'; s.drone.lastInput = 1e12; s.drone.vel.set(0, 0, 0); s.drone.roll = 0;
        R.update = (dt, ms, cam) => { c.worldCalls.push(ms); if (c.realResidentFrame) c.originalUpdate(dt, ms, cam); };
        window.requestAnimationFrame = callback => { c.queue.push(callback); return 0; };
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const draw = gl[name].bind(gl); gl[name] = (...args) => { if (!c.skipGpu) return draw(...args); };
        }
        c.frame = (draw = true) => {
          c.timestamp += 50; c.skipGpu = !draw;
          try { const callbacks = c.queue.splice(0); for (const callback of callbacks) callback(c.timestamp); }
          finally { c.skipGpu = false; }
          c.frames++; if (draw) gl.finish();
        };
        c.step = (dt = 0.25) => {
          window.__captureTime += dt * 1000;
          R.setStudyWeather(0.08, 'simulation');
          c.originalUpdate(dt, Date.now(), s.drone.pos);
          s.clock.ms = Date.now(); c.expectedResidentMs = Date.now();
        };
        c.state = () => {
          const r = R.list.find(r => r.id === 'lantern');
          return { worldTime: R.worldTime, date: new Date(Date.now()).toISOString(), lanternPosition: r.pos.toArray(),
            act: r.act, task: r.task && { kind: r.task.kind, arrived: r.task.arrived, seconds: r.task.t, duration: r.task.dur },
            status: R.status(r), study: JSON.parse(JSON.stringify(R.study.state)) };
        };
        c.lookAtLantern = () => {
          const r = R.list.find(r => r.id === 'lantern'), p = r.pos, h = r.head;
          const x = p.x + Math.sin(h + 0.55) * 3.0, z = p.z + Math.cos(h + 0.55) * 3.0;
          const y = Math.max(p.y + 1.65, s.cur.T.top(x, z) + 1.1), tx = p.x, ty = p.y + 0.55, tz = p.z;
          s.drone.pos.set(x, y, z); s.drone.vel.set(0, 0, 0); s.drone.roll = 0; s.drone.sky = true;
          s.drone.yaw = Math.atan2(x - tx, z - tz); s.drone.pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
        };
        c.persist = () => { R.save(); localStorage.setItem('capture.lantern.worldTime', String(Date.now())); };
        return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      });
      await page.waitForFunction(() => __studyCapture.queue.length > 0, null, { polling: 100, timeout: 30000 });
      await page.evaluate(() => { __studyCapture.timestamp = performance.now(); __studyCapture.frame(false); });
    }
    await control();
    async function still(file, extra = {}) {
      await page.screenshot({ path: path.join(staging, file), timeout: 60000 });
      report.images.push({ file, ...extra }); console.log(JSON.stringify({ captured: file }));
    }
    async function openPanel() {
      await page.evaluate(() => { seaglass.openStudy(); document.querySelector('.ls-scroll').scrollTop = 0; });
      await page.locator('.lantern-study').waitFor({ state: 'visible' });
    }
    async function closePanel() { await page.keyboard.press('Escape'); assert.equal(await page.locator('.lantern-study').isVisible(), false); }
    async function until(stage, criterion, seconds = 2400) {
      const result = await page.evaluate(({ criterion, seconds }) => {
        const c = __studyCapture, test = new Function('s', `return (${criterion})`);
        for (let i = 0; i < seconds * 4; i++) { c.step(); const s = c.state(); if (test(s)) return s; }
        return { failed: true, state: c.state() };
      }, { criterion, seconds });
      if (result.failed) throw new Error(`${stage} did not occur: ${JSON.stringify(result.state)}`);
      report.stages.push({ stage, ...result }); console.log(JSON.stringify({ stage, date: result.date, task: result.task, works: result.study.works.length }));
      return result;
    }

    await openPanel();
    assert.equal(await page.locator('.ls-download').isDisabled(), true);
    await still('atelier-empty.png', { stage: 'Before first observation' });
    await closePanel();
    const unfinished = await until('first-observation', 's.study.observations.length > 0 && s.study.works.length > 0');
    assert.equal(unfinished.study.works[0].completedAt, undefined);
    await openPanel(); await page.locator('.ls-art-image').evaluate(img => img.decode());
    await still('atelier-unfinished.png', { stage: 'Observation completed; work remains unfinished' });
    assert.equal(await page.locator('.ls-download').isDisabled(), true); await closePanel();

    await until('drawing', "s.task?.kind === 'study-draw' && s.task.arrived && s.task.seconds >= 5 && s.task.seconds < 35");
    await page.evaluate(() => {
      const style = document.createElement('style'); style.id = 'capture-hide-ui';
      style.textContent = 'body > :not(#scene) { visibility: hidden !important; }'; document.head.append(style);
      __studyCapture.lookAtLantern();
      for (let i = 0; i < 100; i++) { __studyCapture.step(0.05); __studyCapture.frame(false); }
      __studyCapture.frame();
    });
    await still('lantern-drawing.png', { stage: 'Actual study-draw task on the island' });
    const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-study-video-'));
    const video = { file: 'lantern-drawing.mp4', fps: 20, frames: 120, seconds: 6, performanceBenchmark: false, states: [] };
    try {
      if (reuseVideo) {
        const previous = JSON.parse(fs.readFileSync(path.join(reuseVideo, 'browser-report.json'), 'utf8'));
        const original = previous.videos.find(v => v.file === video.file);
        assert.ok(original && original.states.length === 120 && original.states.every(s => s.task.kind === 'study-draw' && s.task.arrived));
        // The first pass completed every video frame, then exposed a same-document reload issue
        // in this harness. Retain the real frame sequence while independently rerunning checks.
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(reuseVideo, video.file), '-vf', 'trim=start_frame=1,setpts=N/(20*TB)',
          '-r', '20', '-fps_mode', 'cfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', path.join(staging, video.file)], { timeout: 120000 });
        report.videos.push({ ...original, frames: 119, seconds: 5.95, states: original.states.slice(1), originalCapturedAt: previous.capturedAt,
          note: 'Retained from the prior capture of the same frozen source. Its first resize-cleared frame was discarded. All subsequent checks were rerun with explicit page.reload.' });
      } else {
      await page.setViewportSize({ width: 960, height: 600 });
      // A resize handler can clear the WebGL canvas after the first scheduled frame.
      await page.waitForTimeout(100);
      await page.evaluate(() => __studyCapture.frame());
      for (let i = 0; i < video.frames; i++) {
        const state = await page.evaluate(() => { const c = __studyCapture; c.step(0.05); c.lookAtLantern(); c.frame(); return c.state(); });
        video.states.push({ date: state.date, act: state.act, task: state.task });
        await page.screenshot({ path: path.join(frames, `${String(i).padStart(4, '0')}.png`), timeout: 60000 });
        if (i % 40 === 0) console.log(JSON.stringify({ video: video.file, frame: i }));
      }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', path.join(frames, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', path.join(staging, video.file)], { timeout: 120000 });
      report.videos.push(video);
      }
    } finally { fs.rmSync(frames, { recursive: true, force: true }); await page.setViewportSize({ width: 1200, height: 900 }); }
    await page.evaluate(() => document.getElementById('capture-hide-ui').remove());
    const completed = await until('completed-work', 's.study.works.some(w => !!w.completedAt)');
    const work = completed.study.works.find(w => w.completedAt);
    assert.ok(work.revisions >= 2 && work.observationIds.length >= 2);
    assert.ok(completed.study.observations.every(o => o.cloudSource === 'simulation'));
    assert.equal(completed.study.aiEnabled, false);
    await openPanel(); await page.locator('.ls-art-image').evaluate(img => img.decode());
    await still('atelier-completed.png', { stage: 'Two actual observations and drawing passes completed' });
    assert.equal(await page.locator('.ls-download').isDisabled(), false);
    const downloading = page.waitForEvent('download');
    await page.locator('.ls-download').click(); const download = await downloading;
    await download.saveAs(path.join(staging, 'lantern-completed-study.svg'));
    report.checks.svgDownload = { name: download.suggestedFilename(), bytes: fs.statSync(path.join(staging, 'lantern-completed-study.svg')).size };
    const svg = fs.readFileSync(path.join(staging, 'lantern-completed-study.svg'), 'utf8');
    assert.ok(svg.startsWith('<svg') || svg.includes('<svg'));
    assert.ok(!/<script\b|onload\s*=/i.test(svg));
    const artwork = await context.newPage();
    await artwork.setViewportSize({ width: 840, height: 1188 });
    await artwork.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await artwork.locator('svg').evaluate(el => { el.style.width = '840px'; el.style.height = '1188px'; });
    await artwork.screenshot({ path: path.join(staging, 'lantern-completed-study.png') });
    report.images.push({ file: 'lantern-completed-study.png', stage: 'Browser rendering of actual downloaded SVG, at its viewBox size' });
    await artwork.close();

    report.checks.focus = await page.evaluate(() => {
      const modal = document.querySelector('.ls-book'), root = document.querySelector('.lantern-study');
      return { withinDialog: modal.contains(document.activeElement), backgroundInert: [...document.body.children].filter(e => e instanceof HTMLElement && e !== root).every(e => e.inert) };
    });
    assert.equal(report.checks.focus.withinDialog, true); assert.equal(report.checks.focus.backgroundInert, true);
    await page.locator('.ls-close').focus(); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.ls-book').evaluate(el => el.contains(document.activeElement)), true);
    await closePanel();
    await page.locator('#btnMore').focus(); await openPanel(); await closePanel();
    report.checks.focus.returned = await page.locator('#btnMore').evaluate(el => el === document.activeElement);
    assert.equal(report.checks.focus.returned, true);

    report.checks.viewClockIsolation = await page.evaluate(() => {
      const c = __studyCapture, R = seaglass.cur.residents, before = JSON.stringify(R.study.state), world = R.worldTime;
      document.querySelector('#timePanel [data-preset="noon"]').click();
      c.frame(false);
      const result = { viewingMs: seaglass.clock.ms, worldBefore: world, worldAfter: R.worldTime,
        passedToResidents: c.worldCalls.at(-1), dateNow: Date.now(), studyUnchanged: before === JSON.stringify(R.study.state) };
      seaglass.clock.live = false; seaglass.clock.speed = 0; seaglass.clock.ms = Date.now(); seaglass.setWx({ cloud: 0.08, wind: 1.2 });
      return result;
    });
    assert.equal(report.checks.viewClockIsolation.passedToResidents, report.checks.viewClockIsolation.dateNow);
    assert.equal(report.checks.viewClockIsolation.studyUnchanged, true);
    assert.notEqual(report.checks.viewClockIsolation.viewingMs, report.checks.viewClockIsolation.dateNow);

    await page.setViewportSize({ width: 390, height: 844 }); await openPanel();
    report.checks.mobile = await page.evaluate(() => {
      const root = document.querySelector('.lantern-study'), book = document.querySelector('.ls-book'), scroll = document.querySelector('.ls-scroll');
      return { viewport: [innerWidth, innerHeight], book: book.getBoundingClientRect().toJSON(), noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        noPanelHorizontalOverflow: scroll.scrollWidth <= scroll.clientWidth + 1, scrollable: scroll.scrollHeight > scroll.clientHeight };
    });
    assert.equal(report.checks.mobile.noPageHorizontalOverflow, true); assert.equal(report.checks.mobile.noPanelHorizontalOverflow, true);
    await still('atelier-mobile.png', { stage: '390 px mobile viewport' }); await closePanel();
    await page.setViewportSize({ width: 1200, height: 900 });
    const exploring = await until('exploration-started', "s.study.active?.action === 'explore' && s.task?.kind === 'study-explore' && !s.task.arrived");
    const explorationId = exploring.study.active.id;
    const explored = await until('exploration-completed', `s.study.decisions.some(d => d.intentId === ${JSON.stringify(explorationId)} && d.outcome === 'completed')`);
    report.checks.exploration = { intentId: explorationId, start: exploring.lanternPosition, end: explored.lanternPosition,
      displacementMeters: Math.hypot(explored.lanternPosition[0] - exploring.lanternPosition[0], explored.lanternPosition[2] - exploring.lanternPosition[2]),
      completed: true, durationSeconds: (explored.worldTime - exploring.worldTime) / 1000 };
    assert.ok(report.checks.exploration.displacementMeters > 5);
    // Save an actual in-progress task, then reload. A persisted intent must not become a fabricated completion.
    const pending = await until('pending-before-reload', 's.study.active !== null');
    await page.evaluate(() => __studyCapture.persist());
    const storageBefore = await page.evaluate(() => ({ legacy: localStorage.getItem('seaglass.residents.v1'), dedicated: localStorage.getItem('seaglass.lantern-study.residents.v1') }));
    assert.equal(storageBefore.legacy, legacy); assert.ok(storageBefore.dedicated);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.seaglass?.cur?.loc.id === 'kayama' && !document.getElementById('veil').classList.contains('on'), null, { timeout: 180000 });
    await control();
    const restored = await page.evaluate(() => __studyCapture.state());
    report.checks.reload = { pendingId: pending.study.active.id, completedBefore: pending.study.works.filter(w => w.completedAt).length,
      completedAfter: restored.study.works.filter(w => w.completedAt).length,
      oldIntentInterrupted: restored.study.decisions.some(d => d.intentId === pending.study.active.id && d.outcome === 'interrupted'),
      observationsBefore: pending.study.observations.length, observationsAfter: restored.study.observations.length };
    assert.equal(report.checks.reload.completedAfter, report.checks.reload.completedBefore);
    assert.equal(report.checks.reload.observationsAfter, report.checks.reload.observationsBefore);
    assert.equal(report.checks.reload.oldIntentInterrupted, true);
    report.checks.storage = { legacyUnchanged: await page.evaluate(expected => localStorage.getItem('seaglass.residents.v1') === expected, legacy), dedicatedSaveUsed: true };
    assert.equal(report.checks.storage.legacyUnchanged, true);
    report.gl = await page.evaluate(() => { const gl = document.getElementById('scene').getContext('webgl2'); return { error: gl.getError(), contextLost: gl.isContextLost() }; });
    assert.equal(report.gl.error, 0); assert.equal(report.gl.contextLost, false);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.localFailures, []); assert.deepEqual(report.apiRequests, []);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = String(error); throw error; }
  finally {
    fs.writeFileSync(path.join(staging, 'browser-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    if (report.status === 'passed') {
      fs.mkdirSync(output, { recursive: true });
      for (const file of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, file), path.join(output, file));
      fs.rmSync(staging, { recursive: true, force: true });
    } else console.error(`Incomplete capture retained at ${staging}; no successful artifact set overwritten.`);
  }
})();
