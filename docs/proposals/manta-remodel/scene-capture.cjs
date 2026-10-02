// Render the real application, not a replacement scene or an artist's impression.
// node docs/proposals/manta-remodel/scene-capture.cjs http://127.0.0.1:4178 [--video] [--compat]
// Refresh only one train image, preserving all guides/other seas/video: --train-only=miyako
// Requires Playwright, Chromium, and (for --video) ffmpeg. One browser is used and always closed.
// The debug browser alone pauses other ecology. Breach physics still runs through the real
// cur.breach.update at 1/60 s; app renders advance at 20 Hz. This is not an FPS benchmark.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:4178';
const trainOnly = args.find(a => a.startsWith('--train-only='))?.split('=')[1];
if (trainOnly) assert.ok(['miyako', 'maldives', 'galapagos'].includes(trainOnly));
const compatOnly = args.includes('--compat-only') || !!trainOnly;
const wantVideo = args.includes('--video') && !compatOnly, wantCompat = args.includes('--compat') || compatOnly;
const publishedDir = path.join(__dirname, 'images');
fs.mkdirSync(publishedDir, { recursive: true });
// Failed reruns must not replace the last complete, reviewed capture set. Keep partial results in
// this temporary directory and publish the files together only after all requested checks pass.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manta-scene-output-'));

(async () => {
  const errors = [], externalFailures = [];
  const report = { status: 'running', capturedAt: new Date().toISOString(), source: base, method: {
    description: 'Actual application renderer and breach simulation; debug force schedules a manta, never changes its model, trajectory or material.',
    physicsStepSeconds: 1 / 60, renderStepSeconds: 1 / 20, performanceBenchmark: false,
    inspectionChanges: ['Other ecological updates are paused in this browser.', 'Manual camera; clock and weather fixed.',
      'requestAnimationFrame is driven by the capture script after scene loading; no production source changes.',
      'The first six seconds of warning are skipped; during acceleration, flight and recovery every three physics steps receive one real app frame, preserving particle aging.',
      'Intermediate frames update the app and particles but omit GPU draw calls; every saved still/video frame is fully rendered.'],
  }, stills: [], compatibility: [], errors, externalFailures };
  if (compatOnly) {
    const previous = JSON.parse(fs.readFileSync(path.join(publishedDir, 'scene-report.json'), 'utf8'));
    assert.equal(previous.stills.length, 4); assert.deepEqual(previous.errors, []);
    for (const key of ['capturedAt', 'application', 'leap', 'stills', 'effects', 'video']) if (previous[key]) report[key] = previous[key];
    externalFailures.push(...previous.externalFailures);
    report.compatibilityCapturedAt = new Date().toISOString();
    report.captureNotes = ['Breach and biome checks used separate browser sessions against the same production bundle.'];
    if (trainOnly) {
      report.compatibility = previous.compatibility.filter(c => c.sea !== trainOnly);
      report.captureNotes.push(`Only ${trainOnly}'s train image was refreshed; existing guides, other seas and video were preserved.`);
    }
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  let temporaryFrames;
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text()); });
    page.on('requestfailed', r => { if (!r.url().startsWith(base)) externalFailures.push({ url: r.url(), error: r.failure()?.errorText }); });

    async function loadSea(sea) {
      const at = sea === 'galapagos' ? '2026-06-20T18:00:00Z' : '2026-06-20T03:00:00Z';
      // Navigating to the same hash URL can be a same-document navigation. Always recreate the
      // document so the capture's requestAnimationFrame override cannot wrap its previous self.
      await page.goto('about:blank');
      await page.goto(`${base}/?debug&tier=low&at=${at}#${sea}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(id => window.seaglass?.cur?.loc.id === id && !document.getElementById('veil').classList.contains('on'), sea, { timeout: 180000 });
      await page.evaluate(() => {
        const s = window.seaglass;
        s.clock.speed = 0; s.clock.live = false; s.setWx({ cloud: 0.08, wind: 1.2 });
        s.drone.mode = 'manual'; s.drone.lastInput = 1e12; s.drone.vel.set(0, 0, 0); s.drone.roll = 0;
        s.cur.eco.step = () => [];
        const style = document.createElement('style'); style.textContent = 'body > :not(#scene) { visibility: hidden !important; }'; document.head.appendChild(style);
        const c = window.__mantaCapture = { queue: [], timestamp: performance.now(), physicsSteps: 0, effects: [], mesh: null, centre: null };
        const gl = document.getElementById('scene').getContext('webgl2');
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const draw = gl[name].bind(gl);
          gl[name] = (...values) => { if (!c.skipGpu) return draw(...values); };
        }
        window.requestAnimationFrame = callback => { c.queue.push(callback); return 0; };
        c.render = (advance = true, draw = true) => {
          if (advance) c.timestamp += 50;
          const callbacks = c.queue.splice(0);
          c.skipGpu = !draw;
          try { for (const callback of callbacks) callback(c.timestamp); }
          finally { c.skipGpu = false; }
          // Complete each saved frame before requesting its pixels; do not queue hundreds of
          // software-rendered ocean frames while the browser cannot service screenshot requests.
          if (draw) gl.finish();
        };
        c.look = (position, target) => {
          s.drone.pos.copy(position); s.drone.vel.set(0, 0, 0); s.drone.roll = 0;
          s.drone.sky = position.y > 0;
          const dx = target.x - position.x, dz = target.z - position.z;
          s.drone.yaw = Math.atan2(-dx, -dz); s.drone.pitch = Math.atan2(target.y - position.y, Math.hypot(dx, dz));
        };
        c.step = () => {
          s.cur.breach.update(1 / 60, s.cur.eco.env, s.drone.pos, -Math.sin(s.drone.yaw), -Math.cos(s.drone.yaw), false);
          c.physicsSteps++;
        };
        c.advance = () => { for (let n = 0; n < 3; n++) c.step(); c.render(true, false); };
        c.snapshot = () => {
          const l = s.cur.breach.leap, mesh = c.mesh, p = mesh.position.clone().project(s.camera), u = mesh.material.uniforms;
          return { time: l.t, secondsAfterExit: l.t - l.exitAt, recoverySeconds: l.sw?.t ?? null,
            runComplete: l.run.done, landed: l.splashed, flip: l.flip, wingSpan: l.len,
            position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), camera: s.camera.position.toArray(), cameraRotation: s.camera.rotation.toArray(),
            projectedCentre: p.toArray(), visible: mesh.visible, mouth: u.uMouth.value, air: u.uAir.value,
            wingPhase: u.uPhase.value, wingAmplitude: u.uAmp.value, foamPatches: s.cur.breach.foams.length };
        };
      });
      await page.waitForFunction(() => window.__mantaCapture.queue.length > 0, null, { polling: 100, timeout: 30000 });
      // One native frame was already queued when requestAnimationFrame was replaced. Start beyond
      // its timestamp, or a busy software renderer can accidentally produce a negative first dt.
      await page.evaluate(() => { __mantaCapture.timestamp = performance.now(); __mantaCapture.render(); });
      return page.evaluate(() => {
        const s = seaglass, gl = document.getElementById('scene').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { sea: s.cur.loc.id, renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
          scripts: [...document.scripts].filter(x => x.type === 'module').map(x => x.src),
          mantaCount: s.cur.mantas.length, species: s.cur.loc.extraGuide?.find(e => e.id === 'manta')?.ja || 'ナンヨウマンタ',
          oceanicUniform: s.cur.mantas[0].mesh.material.uniforms.uOceanic.value };
      });
    }

    async function forceLeap() {
      const state = await page.evaluate(() => {
        const s = seaglass, c = __mantaCapture;
        let selected = null;
        // force() checks the actual takeoff/run-up terrain. Do not demand unrealistically deep water.
        for (const x of [0, -40, 40, -80, 80]) {
          for (const z of [0, -40, 40, -80, 80]) {
            if (s.cur.T.top(x, z) > -5) continue;
            for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
              s.drone.pos.set(x, 1.6, z);
              if (s.cur.breach.force('manta', s.drone.pos, Math.sin(a), Math.cos(a))) { selected = { x, z, direction: a }; break; }
            }
            if (selected) break;
          }
          if (selected) break;
        }
        if (!selected) throw new Error('No manta breach placement found over the real terrain.');
        const l = s.cur.breach.leap, subjects = []; s.cur.breach.subjects(subjects);
        c.centre = subjects[0].pos().clone();
        c.mesh = s.cur.group.children.find(o => o.geometry === s.cur.mantas[0].mesh.geometry && !s.cur.mantas.some(m => m.mesh === o));
        if (!c.mesh) throw new Error('Cannot find the actual breach mesh.');
        c.effects = [];
        if (!c.originalSplash) {
          c.originalSplash = s.cur.breach.fx.splash;
          s.cur.breach.fx.splash = (...values) => { c.effects.push({ t: s.cur.breach.leap?.t, kind: 'splash', values }); c.originalSplash(...values); };
        }
        // Keep the departure and landing in the same shot. Recovery switches to an underwater view.
        c.airTarget = c.centre.clone().addScaledVector(l.dir, 2.3); c.airTarget.y = 0.95;
        c.airCamera = c.airTarget.clone().addScaledVector(l.dir, 6.0);
        c.airCamera.x += l.dir.z * 4.0; c.airCamera.z -= l.dir.x * 4.0; c.airCamera.y = 1.7;
        c.look(c.airCamera, c.airTarget);
        // The quiet warning interval emits no run-up bubbles or splash. From here on, stepping and
        // rendering together also ages every particle; never accumulate a whole leap's spray at once.
        while (l.t < 6) c.step();
        return { placement: selected, exitPoint: c.centre.toArray(), direction: l.dir.toArray(), predictedExitAt: l.exitAt,
          nominalVerticalSpeed: l.vy, flip: l.flip, wingSpan: l.len };
      });
      return state;
    }

    async function still(name, phase) {
      const state = await page.evaluate(phase => {
        const s = seaglass, c = __mantaCapture;
        const reached = () => {
          const l = s.cur.breach.leap, up = l.t - l.exitAt;
          if (phase === 'departure') return l.run.done && up >= 0.15;
          if (phase === 'apex') return l.run.done && up >= l.vy / 9.8;
          if (phase === 'splash') return !!l.sw;
          return !!l.sw && l.sw.t >= 2.5;
        };
        let steps = 0;
        while (!reached() && steps++ < 800) c.advance();
        if (!reached()) throw new Error(`Phase not reached: ${phase}`);
        if (phase === 'recovery') {
          const target = c.mesh.position.clone(), cam = target.clone(), d = s.cur.breach.leap.dir;
          cam.x += d.z * 3.2 + d.x * 4.8; cam.z += -d.x * 3.2 + d.z * 4.8; cam.y = Math.min(-0.9, target.y + 0.35);
          c.look(cam, target);
        } else c.look(c.airCamera, c.airTarget);
        c.render(false);
        return c.snapshot();
      }, phase);
      assert.equal(state.visible, true);
      assert.ok(Math.abs(state.projectedCentre[0]) < 1 && Math.abs(state.projectedCentre[1]) < 1, `${phase} outside camera`);
      const file = `scene-${name}.png`;
      await page.screenshot({ path: path.join(dir, file), timeout: 60000 });
      report.stills.push({ file, phase, ...state });
      fs.writeFileSync(path.join(dir, 'scene-report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ captured: file, stagedAt: dir, position: state.position, mouth: state.mouth, air: state.air }));
    }

    if (!compatOnly) {
      report.application = await loadSea('miyako');
      report.leap = await forceLeap();
      await still('departure', 'departure');
      await still('apex', 'apex');
      await still('splash', 'splash');
      await still('recovery', 'recovery');
      report.effects = await page.evaluate(() => __mantaCapture.effects);
      assert.ok(report.effects.length >= 2, 'Departure and reentry must both emit a splash.');
    }

    if (wantVideo) {
      temporaryFrames = fs.mkdtempSync(path.join(os.tmpdir(), 'manta-breach-frames-'));
      await page.setViewportSize({ width: 720, height: 450 });
      report.video = { file: 'scene-breach.mp4', width: 720, height: 450, fps: 20, fixedSimulationStep: true, performanceBenchmark: false,
        note: 'A second actual debug-forced leap. Camera cuts underwater 0.9 s after reentry to show recovery.', leap: await forceLeap(), frames: [] };
      await page.evaluate(() => {
        const c = __mantaCapture, l = seaglass.cur.breach.leap;
        while (l.t < l.exitAt - 0.4 && !l.run.done) c.advance();
      });
      for (let i = 0; i < 100; i++) {
        const state = await page.evaluate(() => {
          const s = seaglass, c = __mantaCapture;
          for (let n = 0; n < 3; n++) c.step();
          const l = s.cur.breach.leap;
          if (l.sw && l.sw.t > 0.9) {
            const target = c.mesh.position.clone(), cam = target.clone();
            cam.x += l.dir.z * 3.2 + l.dir.x * 4.8; cam.z += -l.dir.x * 3.2 + l.dir.z * 4.8; cam.y = Math.min(-0.9, target.y + 0.35);
            c.look(cam, target);
          } else c.look(c.airCamera, c.airTarget);
          c.render(); return c.snapshot();
        });
        report.video.frames.push(state);
        await page.screenshot({ path: path.join(temporaryFrames, `${String(i).padStart(4, '0')}.png`), timeout: 60000 });
        if (i % 20 === 0) console.log(JSON.stringify({ videoFrames: i + 1, secondsAfterExit: state.secondsAfterExit }));
      }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', path.join(temporaryFrames, '%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', path.join(dir, report.video.file)], { timeout: 120000 });
    }

    if (wantCompat) {
      await page.setViewportSize({ width: 960, height: 600 });
      for (const sea of trainOnly ? [trainOnly] : ['miyako', 'maldives', 'galapagos']) {
        const state = await loadSea(sea);
        assert.deepEqual(state.scripts, report.application.scripts, 'Do not combine captures from different production bundles.');
        const result = await page.evaluate(trainOnly => {
          const s = seaglass, c = __mantaCapture, normal = s.cur.mantas.map(m => m.mesh), previous = new Set(s.cur.group.children);
          const normalMouth = normal.map(m => m.material.uniforms.uMouth.value);
          const png = trainOnly ? null : s.studio('manta', [0.6, 0.8, 1.1], 1.1, null, { uFeed: 0.7, uMouth: -1, uBeat: 0, uPhase: 1.1 });
          s.drone.pos.set(0, -7, 0);
          if (!s.cur.rare.start('mantatrain', s.cur.eco.env, s.drone.pos, 0, -1)) throw new Error('Manta train did not start.');
          for (let i = 0; i < 1800; i++) s.cur.rare.update(1 / 60, s.cur.eco.env, s.drone.pos, 0, -1);
          const train = s.cur.group.children.filter(o => !previous.has(o) && o.geometry === normal[0].geometry);
          // A visible=true flag is not proof of visibility through coral. Keep the actual train
          // trajectory, select a clear segment, and check both the camera and its line of sight.
          let framing = null;
          const observations = [];
          for (let attempt = 0; attempt < 9 && !framing; attempt++) {
            const visible = train.filter(m => m.visible);
            const clear = visible.map(m => ({ m, floor: s.cur.T.top(m.position.x, m.position.z) }))
              .sort((a, b) => (b.m.position.y - b.floor) - (a.m.position.y - a.floor));
            observations.push({ time: s.cur.rare.running.t, visibleFlags: visible.length,
              centresBelowTerrain: clear.filter(x => x.m.position.y < x.floor).length });
            for (const item of clear) {
              if (item.m.position.y - item.floor < 1.0) continue;
              const target = item.m.position.clone();
              for (const [dx, dz] of [[8, 5], [-8, 5], [5, -8], [-5, -8], [0, 8], [0, -8]]) {
                const cam = target.clone(); cam.x += dx; cam.z += dz;
                cam.y = Math.max(target.y + 4, s.cur.T.top(cam.x, cam.z) + 1.6);
                if (cam.y > -0.7) continue;
                let rayClearance = Infinity;
                for (let j = 0; j <= 24; j++) {
                  const p = cam.clone().lerp(target, j / 24);
                  rayClearance = Math.min(rayClearance, p.y - s.cur.T.top(p.x, p.z));
                }
                if (rayClearance < 0.9) continue;
                framing = { target, cam, rayClearance, targetClearance: target.y - item.floor }; break;
              }
              if (framing) break;
            }
            if (!framing) for (let i = 0; i < 240; i++) s.cur.rare.update(1 / 60, s.cur.eco.env, s.drone.pos, 0, -1);
          }
          if (!framing) throw new Error('No unobstructed train/camera segment found on the existing path.');
          const visible = train.filter(m => m.visible);
          c.look(framing.cam, framing.target); c.render();
          const gl = document.getElementById('scene').getContext('webgl2');
          return { png, normalMouth, trainCount: train.length, visibleTrain: visible.length,
            trainCapture: { time: s.cur.rare.running.t, target: framing.target.toArray(), camera: s.camera.position.toArray(),
              lineOfSightTerrainClearance: framing.rayClearance, targetTerrainClearance: framing.targetClearance,
              observations, trajectoryChanged: false,
              limitation: observations.some(o => o.centresBelowTerrain > 0) ? 'The existing train uses a shared depth and some members can intersect the reef. This capture selects an unobstructed segment; it does not fix the path.' : null },
            trainOceanic: train.map(m => m.material.uniforms.uOceanic.value), separateMaterials: new Set([...normal, ...train].map(m => m.material)).size === normal.length + train.length,
            normalMouthUnchanged: normal.every((m, i) => m.material.uniforms.uMouth.value === normalMouth[i]), glError: gl.getError(), contextLost: gl.isContextLost() };
        }, !!trainOnly);
        if (result.png) fs.writeFileSync(path.join(dir, `scene-${sea}-guide.png`), Buffer.from(result.png.split(',')[1], 'base64'));
        delete result.png;
        await page.screenshot({ path: path.join(dir, `scene-${sea}-train.png`), timeout: 60000 });
        assert.equal(result.glError, 0); assert.equal(result.contextLost, false); assert.equal(result.separateMaterials, true); assert.equal(result.normalMouthUnchanged, true);
        report.compatibility.push({ ...state, ...result });
        console.log(JSON.stringify({ compatibility: sea, ...result }));
      }
    }
    report.gl = await page.evaluate(() => { const gl = document.getElementById('scene').getContext('webgl2'); return { error: gl.getError(), contextLost: gl.isContextLost() }; });
    assert.deepEqual(errors, []); assert.equal(report.gl.error, 0); assert.equal(report.gl.contextLost, false);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error); report.stagedAt = dir;
    throw error;
  } finally {
    fs.writeFileSync(path.join(dir, 'scene-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    if (temporaryFrames) fs.rmSync(temporaryFrames, { recursive: true, force: true });
    if (report.status === 'passed') {
      for (const file of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, file), path.join(publishedDir, file));
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      fs.writeFileSync(path.join(publishedDir, 'scene-failure.json'), JSON.stringify(report, null, 2));
      console.error(`Partial capture retained at ${dir}; previous successful images are unchanged.`);
    }
  }
  console.log(JSON.stringify({ completed: true, stills: report.stills.map(s => s.file), video: report.video?.file, errors }));
})().catch(e => { console.error(e); process.exitCode = 1; });
