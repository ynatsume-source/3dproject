// Actual application inspection, separate from the matched habitat comparison.
// node docs/proposals/point-lobos-living-forest/life-capture.cjs URL --portraits
// Studio portraits use the app's existing debug studio and its neutral inspection lighting.
// Scene captures use the real ocean; no models/positions are substituted for prettier images.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const args = process.argv.slice(2), base = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:4187';
const portraits = args.includes('--portraits');
const revision = args.find(a => a.startsWith('--revision='))?.slice(11);
const small = args.includes('--small'), fish = args.includes('--fish'), seal = args.includes('--seal'), video = args.includes('--video');
assert.ok(portraits || small || fish || seal, 'Select --portraits, --small, --fish, or --seal.');
const reportName = [portraits && 'seal-studio', small && 'small-residents', fish && 'fish-life', seal && 'seal-visit'].filter(Boolean).join('-') + '-report.json';
const dir = path.join(__dirname, 'images'), staging = fs.mkdtempSync(path.join(os.tmpdir(), 'lobos-life-'));
const report = { status: 'running', source: base, implementationCommit: revision || null, capturedAt: new Date().toISOString(),
  method: { renderer: 'Actual application; existing debug studio for portraits.', performanceBenchmark: false,
    physicsStepSeconds: 0.05, notes: ['The original application frame advances ecology and shaders together at 20 Hz.',
      'Clock date is held for consistent sunlight. Unrecorded warmup frames omit only GPU drawing.',
      'Close inspections use a narrower camera lens, reported with each view; creature size and positions are unchanged.',
      'The visitor scheduler is paused during unrelated inspections, then resumed for a debug-requested visit on its real route.'] },
  images: [], videos: [], errors: [], localFailures: [], externalFailures: [] };
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => { report.errors.push(e.message); console.error(e.message); });
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) report.errors.push(m.text()); });
    page.on('requestfailed', r => { (r.url().startsWith(base) ? report.localFailures : report.externalFailures).push({ url: r.url(), error: r.failure()?.errorText }); });
    page.on('response', r => { if (r.status() >= 400) (r.url().startsWith(base) ? report.localFailures : report.externalFailures).push({ url: r.url(), status: r.status() }); });
    await page.goto(`${base}/?debug&tier=low&at=2026-06-20T20:00:00Z#pointlobos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.seaglass?.cur?.loc.id === 'pointlobos' && !document.getElementById('veil').classList.contains('on'), null, { timeout: 180000 });
    report.application = await page.evaluate(() => {
      const s = seaglass, gl = document.getElementById('scene').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
      s.clock.live = false; s.clock.speed = 0; s.clock.ms = Date.parse('2026-06-20T20:00:00Z'); s.setWx({ cloud: 0.08, wind: 1.2 });
      s.drone.mode = 'manual'; s.drone.lastInput = 1e12; s.drone.vel.set(0, 0, 0); s.drone.roll = 0;
      const c = window.__lobosLife = { queue: [], timestamp: performance.now(), skipGpu: false, steps: 0 };
      c.originalVisitorUpdate = s.cur.lobosVisitors.update.bind(s.cur.lobosVisitors);
      s.cur.lobosVisitors.update = () => {};
      const projection = s.camera.updateProjectionMatrix.bind(s.camera);
      s.camera.updateProjectionMatrix = () => { if (c.fov) s.camera.fov = c.fov; projection(); };
      const style = document.createElement('style'); style.textContent = 'body > :not(#scene) { visibility: hidden !important; }'; document.head.appendChild(style);
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const draw = gl[name].bind(gl); gl[name] = (...values) => { if (!c.skipGpu) return draw(...values); };
      }
      window.requestAnimationFrame = callback => { c.queue.push(callback); return 0; };
      c.render = (draw = true) => {
        c.timestamp += 50; c.skipGpu = !draw;
        try { const callbacks = c.queue.splice(0); for (const callback of callbacks) callback(c.timestamp); }
        finally { c.skipGpu = false; }
        c.steps++; if (draw) gl.finish();
      };
      c.look = (position, target) => {
        const [x, y, z] = position, [tx, ty, tz] = target;
        s.drone.pos.set(x, y, z); s.drone.vel.set(0, 0, 0); s.drone.roll = 0; s.drone.sky = y > 0;
        s.drone.yaw = Math.atan2(x - tx, z - tz); s.drone.pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
      };
      c.snapshot = () => ({ camera: s.camera.position.toArray(), cameraRotation: s.camera.rotation.toArray(), fov: s.camera.fov,
        shaderTime: s.U.uTime.value, date: new Date(s.clock.ms).toISOString(), ecologyTime: s.cur.eco.env.t });
      c.close = (p, offset, lift = 0) => {
        const target = p.clone(); target.y += lift;
        const camera = target.clone(); camera.x += offset[0]; camera.y += offset[1]; camera.z += offset[2];
        camera.y = Math.max(camera.y, s.cur.T.top(camera.x, camera.z) + 0.85);
        c.look(camera.toArray(), target.toArray());
      };
      return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        scripts: [...document.scripts].filter(x => x.type === 'module').map(x => x.src), kelp: { ...s.cur.kelp.stats },
        benthos: { ...s.cur.lobosBenthos.stats }, recoveryStage: sessionStorage.getItem('seaglass.safe') };
    });
    assert.equal(report.application.recoveryStage, null);
    await page.waitForFunction(() => __lobosLife.queue.length > 0, null, { polling: 100, timeout: 30000 });
    await page.evaluate(() => { __lobosLife.timestamp = performance.now(); __lobosLife.render(false); });

    if (portraits) {
      report.method.notes.push('The app debug studio isolates the unchanged harbor-seal model in neutral lighting for anatomy inspection. These portraits are not habitat screenshots.');
      for (const [id, view] of [['side', [1, 0.12, 0.1]], ['front', [0, 0.1, 1]], ['rear', [0.05, 0.18, -1]], ['three-quarter', [0.7, 0.3, 1]]]) {
        const png = await page.evaluate(view => { seaglass.U.uTime.value = 30; return seaglass.studio('harbor-seal', view, 1.08); }, view);
        assert.ok(png.startsWith('data:image/png;base64,'));
        const file = `seal-studio-${id}.png`;
        fs.writeFileSync(path.join(staging, file), Buffer.from(png.split(',')[1], 'base64'));
        report.images.push({ file, kind: 'model inspection', view }); console.log(JSON.stringify({ captured: file }));
      }
    }

    async function still(file, state) {
      await page.screenshot({ path: path.join(staging, file), timeout: 60000 });
      report.images.push({ file, ...state }); console.log(JSON.stringify({ captured: file, state }));
    }
    async function clip(file, frames, frameMethod) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lobos-video-frames-'));
      const item = { file, frames: [], fps: 20, width: 720, height: 450, performanceBenchmark: false };
      try {
        await page.setViewportSize({ width: 720, height: 450 });
        for (let i = 0; i < frames; i++) {
          const state = await page.evaluate(({ method, frame }) => __lobosLife[method](true, frame), { method: frameMethod, frame: i });
          item.frames.push(state);
          await page.screenshot({ path: path.join(temp, `${String(i).padStart(4, '0')}.png`), timeout: 60000 });
          if (i % 40 === 0) console.log(JSON.stringify({ video: file, frame: i }));
        }
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', path.join(temp, '%04d.png'), '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', path.join(staging, file)], { timeout: 120000 });
        report.videos.push(item);
      } finally { fs.rmSync(temp, { recursive: true, force: true }); await page.setViewportSize({ width: 960, height: 600 }); }
    }

    if (small) {
      for (const kind of ['snail', 'anemone', 'batStar']) {
        const state = await page.evaluate(kind => {
          const s = seaglass, c = __lobosLife;
          const choices = s.cur.lobosBenthos.residents.filter(r => r.kind === kind && (kind !== 'snail' || !!r.leaf));
          choices.sort((a, b) => Math.hypot(a.home.x - 44, a.home.z - 31) - Math.hypot(b.home.x - 44, b.home.z - 31));
          const r = choices[0]; if (!r) throw new Error(`Missing benthic resident: ${kind}`);
          c.fov = kind === 'snail' ? 24 : 32; s.camera.updateProjectionMatrix();
          for (let i = 0; i < 24; i++) { c.close(r.pos, kind === 'snail' ? [0.38, 0.55, 0.38] : [0.55, 0.80, 0.65], 0.035); c.render(false); }
          c.close(r.pos, kind === 'snail' ? [0.38, 0.55, 0.38] : [0.55, 0.80, 0.65], 0.035); c.render();
          return { kind, position: r.pos.toArray(), scale: r.scale, onMovingLeaf: !!r.leaf,
            speciesIdentification: ['snail', 'anemone'].includes(kind) ? 'Unidentified form, not a named species claim.' : 'Patiria miniata',
            ...c.snapshot(), projectedCentre: r.pos.clone().project(s.camera).toArray() };
        }, kind);
        await still(`resident-${kind}.png`, state);
      }
    }

    if (fish) {
      const forage = await page.evaluate(() => {
        const s = seaglass, c = __lobosLife, f = s.cur.fish.find(f => f.sp.id === 'senorita');
        c.fov = 32; s.camera.updateProjectionMatrix(); c.look([32, -9.6, 27], [44, -10, 31]);
        let selected = -1;
        for (let n = 0; n < 2400 && selected < 0; n++) {
          c.render(false);
          if (n < 400 || n % 10) continue;
          const candidates = f.dbg.kelpLife.states.map((state, i) => ({ state, i, p: f.dbg.fp.slice(i * 3, i * 3 + 3) }))
            .filter(a => a.state.mode === 'forage' && a.state.feedingOnLeaf && !f.dbg.dead[a.i] && (s.U.uTime.value + a.state.phase) % 39 < 10);
          candidates.sort((a, b) => Math.hypot(a.p[0] - 44, a.p[2] - 31) - Math.hypot(b.p[0] - 44, b.p[2] - 31));
          if (candidates.length) selected = candidates[0].i;
        }
        if (selected < 0) throw new Error('No live senorita leaf-foraging event found.');
        c.fishSystem = f; c.fishIndex = selected;
        const st = f.dbg.kelpLife.states[selected], p = s.drone.pos.clone().fromArray(f.dbg.fp, selected * 3);
        c.forageCamera = [p.x + 1.65, Math.max(p.y + 0.90, s.cur.T.top(p.x + 1.65, p.z + 1.25) + 0.9), p.z + 1.25];
        c.forageTarget = [st.support.x, st.support.y + 0.10, st.support.z];
        c.forageFrame = (draw = true) => {
          c.look(c.forageCamera, c.forageTarget); c.render(draw);
          const state = f.dbg.kelpLife.states[selected], p = s.drone.pos.clone().fromArray(f.dbg.fp, selected * 3);
          return { fish: selected, position: p.toArray(), mode: state.mode, feedingOnLeaf: state.feedingOnLeaf, peck: state.peck,
            support: [state.support.x, state.support.y, state.support.z], projectedCentre: p.clone().project(s.camera).toArray(), ...c.snapshot() };
        };
        for (let i = 0; i < 300; i++) s.cur.kelp.update(s.drone.pos.set(...c.forageCamera));
        return c.forageFrame();
      });
      await still('senorita-foraging.png', forage);
      if (video) await clip('forest-life.mp4', 120, 'forageFrame');

      const night = await page.evaluate(() => {
        const s = seaglass, c = __lobosLife, f = c.fishSystem;
        s.clock.ms = Date.parse('2026-06-21T07:00:00Z'); s.setWx({ cloud: 0.08, wind: 1.2 });
        c.look([12, -10, 50], [22, -12, 50]);
        for (let i = 0; i < 4000; i++) c.render(false);
        const candidates = f.dbg.kelpLife.states.map((state, i) => ({ state, i, p: f.dbg.fp.slice(i * 3, i * 3 + 3) }))
          .filter(a => a.state.mode === 'sleep' && a.state.burial > 0.99 && !f.dbg.dead[a.i]);
        if (!candidates.length) throw new Error('No sleeping senorita reached a verified sand bed.');
        candidates.sort((a, b) => Math.hypot(a.p[0] - 20, a.p[2] - 40) - Math.hypot(b.p[0] - 20, b.p[2] - 40));
        const a = candidates[0], bed = a.state.sand, p = s.drone.pos.clone().set(bed.x, bed.y + 0.05, bed.z);
        c.fov = 24; s.camera.updateProjectionMatrix();
        for (let i = 0; i < 80; i++) { c.close(p, [1.0, 1.15, 1.0]); c.render(false); }
        c.close(p, [1.0, 1.15, 1.0]); c.render();
        const state = f.dbg.kelpLife.states[a.i];
        return { fish: a.i, position: Array.from(f.dbg.fp.slice(a.i * 3, a.i * 3 + 3)), mode: state.mode,
          burial: state.burial, sandBed: bed, verifiedSand: f.dbg.kelpLife.isSand(bed.x, bed.z), ...c.snapshot() };
      });
      assert.equal(night.mode, 'sleep'); assert.equal(night.verifiedSand, true);
      await still('senorita-night-rest.png', night);
    }

    if (seal) {
      const passing = await page.evaluate(() => {
        const s = seaglass, c = __lobosLife, v = s.cur.lobosVisitors;
        s.clock.ms = Date.parse('2026-06-20T20:00:00Z'); s.setWx({ cloud: 0.08, wind: 1.2 });
        v.update = c.originalVisitorUpdate; c.look([32, -6, 27], [44, -6, 31]);
        if (!s.lobosVisit()) throw new Error('The debug-requested natural seal route could not start.');
        c.fov = 44; s.camera.updateProjectionMatrix();
        c.sealFrame = (draw = true) => {
          const p = v.state.position, h = v.model.group.rotation.y;
          if (v.state.phase === 'breathing') c.look([p.x + Math.cos(h) * 3.0, 1.25, p.z - Math.sin(h) * 3.0], [p.x, p.y + 0.3, p.z]);
          else c.look([p.x + Math.cos(h) * 4.2, p.y + 1.1, p.z - Math.sin(h) * 4.2], [p.x, p.y, p.z]);
          c.render(draw);
          return { phase: v.state.phase, seconds: v.state.seconds, position: v.state.position.toArray(),
            visible: v.model.group.visible, projectedCentre: v.state.position.clone().project(s.camera).toArray(), ...c.snapshot() };
        };
        while (v.state.seconds < 40) c.sealFrame(false);
        return c.sealFrame();
      });
      assert.equal(passing.phase, 'passing'); await still('seal-forest-pass.png', passing);
      if (video) await clip('seal-passing.mp4', 80, 'sealFrame');
      const breathing = await page.evaluate(() => {
        const c = __lobosLife, v = seaglass.cur.lobosVisitors;
        while (v.state.seconds < 98) c.sealFrame(false);
        return c.sealFrame();
      });
      assert.equal(breathing.phase, 'breathing'); await still('seal-surface-breath.png', breathing);
      if (video) await clip('seal-breathing.mp4', 80, 'sealFrame');
    }

    report.gl = await page.evaluate(() => { const gl = document.getElementById('scene').getContext('webgl2'); return { error: gl.getError(), contextLost: gl.isContextLost() }; });
    assert.equal(report.gl.error, 0); assert.equal(report.gl.contextLost, false); assert.deepEqual(report.errors, []); assert.deepEqual(report.localFailures, []);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = String(error); throw error; }
  finally {
    fs.writeFileSync(path.join(staging, reportName), JSON.stringify(report, null, 2));
    await browser.close();
    if (report.status === 'passed') {
      for (const file of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, file), path.join(dir, file));
      fs.rmSync(staging, { recursive: true, force: true });
    } else console.error(`Failed partial capture retained at ${staging}; previous complete captures are unchanged.`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
