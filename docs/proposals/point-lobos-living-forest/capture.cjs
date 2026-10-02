// Capture the real application at matched viewpoints; no replacement scene or image retouching.
// node docs/proposals/point-lobos-living-forest/capture.cjs URL before|after [--revision=SHA]
// Optional single-view tier check: --tier=medium --view=rock-garden (use a different label).
// Requires Playwright and Chromium. Uses one browser, closed even when a check fails.
// SwiftShader draw counts are recorded for comparison; these are NOT hardware FPS measurements.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = args[0] || 'http://127.0.0.1:4186';
const label = args[1] || 'before';
assert.ok(/^[a-z0-9-]+$/.test(label), 'Use a simple capture-set label.');
const revision = args.find(a => a.startsWith('--revision='))?.slice(11) || 'unspecified';
const tier = args.find(a => a.startsWith('--tier='))?.slice(7) || 'low';
assert.ok(['low', 'medium', 'high'].includes(tier));
const onlyView = args.find(a => a.startsWith('--view='))?.slice(7);
const published = path.join(__dirname, 'images');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'lobos-capture-'));
fs.mkdirSync(published, { recursive: true });
const views = [
  { id: 'forest-edge', position: [32, -9.6, 27], target: [48, -9, 35], description: 'East stand, looking into the mature forest.' },
  { id: 'rock-garden', position: [38, -11.8, 33], target: [44.2, -12.1, 31], description: 'East rocky floor and the future understory at close range.' },
  { id: 'northern-edge', position: [18, -11.7, 49], target: [29, -10.8, 56], description: 'Northern sandy passage looking towards its rocky forest edge.' },
  { id: 'canopy', position: [42, -7.0, 27], target: [49, -0.8, 34], description: 'Looking up through the east stand into the broken surface canopy.' },
];
if (onlyView) assert.ok(views.some(v => v.id === onlyView), 'Unknown viewpoint.');
const report = {
  status: 'running', source: base, revision, capturedAt: new Date().toISOString(), label,
  method: { application: 'Actual Point Lobos application scene, fixed viewpoints, no source changes for capture.',
    quality: tier, date: '2026-06-20T20:00:00Z', cloud: 0.08, wind: 1.2, shaderTime: 30,
    width: 960, height: 600, performanceBenchmark: false,
    notes: ['Ecology is paused after loading for habitat comparisons. Fish positions at that point are not guaranteed identical between captures.',
      'The application clock is frozen, and shader time is fixed before each captured frame.',
      'Existing kelp detail is warmed at each camera before capture; intermediate frames omit GPU drawing.',
      'The capture hides the interface in this browser only.',
      'Draw calls and submitted triangles include the actual render passes; they are not unique visible geometry counts.'] },
  views: [], errors: [], localFailures: [], externalFailures: [],
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: report.method.width, height: report.method.height } });
    page.on('pageerror', e => { report.errors.push(e.message); console.error(`Application error: ${e.message}`); });
    page.on('console', m => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) report.errors.push(m.text());
      if (m.text().startsWith('[load]')) console.log(m.text());
    });
    page.on('requestfailed', r => {
      const item = { url: r.url(), error: r.failure()?.errorText };
      (r.url().startsWith(base) ? report.localFailures : report.externalFailures).push(item);
    });
    page.on('response', r => {
      if (r.status() >= 400) (r.url().startsWith(base) ? report.localFailures : report.externalFailures).push({ url: r.url(), status: r.status() });
    });
    const response = await page.goto(`${base}/?debug&tier=${tier}&at=${report.method.date}#pointlobos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.seaglass?.cur?.loc.id === 'pointlobos' && !document.getElementById('veil').classList.contains('on'), null, { timeout: 180000 });
    report.application = await page.evaluate(() => {
      const s = seaglass, gl = document.getElementById('scene').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      s.clock.live = false; s.clock.speed = 0; s.clock.ms = Date.parse('2026-06-20T20:00:00Z'); s.setWx({ cloud: 0.08, wind: 1.2 });
      s.drone.mode = 'manual'; s.drone.lastInput = 1e12; s.drone.vel.set(0, 0, 0); s.drone.roll = 0;
      s.cur.eco.step = () => [];
      const style = document.createElement('style');
      style.textContent = 'body > :not(#scene) { visibility: hidden !important; }'; document.head.appendChild(style);
      const c = window.__lobosCapture = { queue: [], timestamp: performance.now(), skipGpu: false, counts: {}, shaderTime: 30 };
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const draw = gl[name].bind(gl);
        gl[name] = (...values) => {
          if (c.skipGpu) return;
          const mode = values[0], count = values[name.includes('Arrays') ? 2 : 1];
          const instances = name.includes('Instanced') ? values[name.includes('Arrays') ? 3 : 4] : 1;
          c.counts.drawCalls = (c.counts.drawCalls || 0) + 1;
          if (mode === gl.TRIANGLES) c.counts.submittedTriangles = (c.counts.submittedTriangles || 0) + count / 3 * instances;
          else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) c.counts.submittedTriangles = (c.counts.submittedTriangles || 0) + Math.max(0, count - 2) * instances;
          return draw(...values);
        };
      }
      window.requestAnimationFrame = callback => { c.queue.push(callback); return 0; };
      c.look = view => {
        const [x, y, z] = view.position, [tx, ty, tz] = view.target;
        s.drone.pos.set(x, y, z); s.drone.vel.set(0, 0, 0); s.drone.roll = 0; s.drone.sky = false;
        s.drone.yaw = Math.atan2(x - tx, z - tz); s.drone.pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
      };
      c.render = draw => {
        c.timestamp += 50; s.U.uTime.value = c.shaderTime - 0.05; c.counts = {}; c.skipGpu = !draw;
        try { const callbacks = c.queue.splice(0); for (const callback of callbacks) callback(c.timestamp); }
        finally { c.skipGpu = false; }
        if (draw) gl.finish();
      };
      return { sea: s.cur.loc.id, renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        canvas: [gl.canvas.width, gl.canvas.height], scripts: [...document.scripts].filter(x => x.type === 'module').map(x => x.src),
        kelp: { ...s.cur.kelp.stats }, fishGroups: s.cur.fish.length, recoveryStage: sessionStorage.getItem('seaglass.safe') };
    });
    assert.equal(report.application.recoveryStage, null);
    await page.waitForFunction(() => __lobosCapture.queue.length > 0, null, { polling: 100, timeout: 30000 });
    await page.evaluate(() => { __lobosCapture.timestamp = performance.now(); });
    for (const view of views.filter(v => !onlyView || v.id === onlyView)) {
      const state = await page.evaluate(view => {
        const s = seaglass, c = __lobosCapture, gl = document.getElementById('scene').getContext('webgl2');
        c.look(view);
        // Build fine meshes with the production updater, without forcing global high detail.
        for (let i = 0; i < 400; i++) s.cur.kelp.update(s.drone.pos);
        for (let i = 0; i < 30; i++) { c.look(view); c.render(false); }
        c.look(view); c.render(true);
        let sceneMeshes = 0, visibleMeshes = 0, triangles = 0;
        s.cur.group.traverse(o => { if (!o.isMesh) return; sceneMeshes++; if (o.visible) visibleMeshes++;
          triangles += (o.geometry.index?.count || o.geometry.attributes.position?.count || 0) / 3 * (o.isInstancedMesh ? o.count : 1); });
        return { camera: s.camera.position.toArray(), cameraRotation: s.camera.rotation.toArray(), shaderTime: s.U.uTime.value,
          floorAtCamera: s.cur.kelp.floorAt(view.position[0], view.position[2]), terrainAtCamera: s.cur.T.top(view.position[0], view.position[2]),
          date: new Date(s.clock.ms).toISOString(), kelp: { ...s.cur.kelp.stats }, rendererCounts: { ...c.counts }, sceneMeshes, visibleMeshes, sceneTrianglesIncludingHidden: triangles,
          glError: gl.getError(), contextLost: gl.isContextLost(), errorVisible: !document.getElementById('err').hidden };
      }, view);
      assert.equal(state.glError, 0); assert.equal(state.contextLost, false); assert.equal(state.errorVisible, false);
      assert.ok(state.camera[1] > state.terrainAtCamera + 0.5, `${view.id}: camera intersects the floor.`);
      const file = `${label}-${view.id}.png`;
      await page.screenshot({ path: path.join(staging, file), timeout: 60000 });
      report.views.push({ ...view, file, ...state });
      console.log(JSON.stringify({ captured: file, counts: state.rendererCounts, stagedAt: staging }));
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.localFailures, []);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = String(error); throw error; }
  finally {
    fs.writeFileSync(path.join(staging, `${label}-report.json`), JSON.stringify(report, null, 2));
    await browser.close();
    if (report.status === 'passed') {
      for (const file of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, file), path.join(published, file));
      fs.rmSync(staging, { recursive: true, force: true });
    } else console.error(`Capture failed; partial results remain at ${staging}. Previous complete captures are unchanged.`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
