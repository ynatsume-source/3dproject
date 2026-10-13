// Fixed synthetic-save captures. Fresh, offline browser context per case; no application changes.
// Env: URL (local preview), PLAYWRIGHT_MODULE, CHROME, FIXTURE, OUT, CASE, WARM (20), SAMPLES (6).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readFirewoodState } from './firewood-state.mjs';
const pw = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href) : await import('playwright');
const base = new URL(process.env.URL || 'http://127.0.0.1:5318/');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only local app previews are allowed');
const fixtureText = fs.readFileSync(process.env.FIXTURE, 'utf8');
const fixture = JSON.parse(fixtureText);
const sha = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const out = process.env.OUT || 'check-results/firewood'; fs.mkdirSync(out, { recursive: true });
const warmFrames = Number(process.env.WARM || 20); assert(Number.isInteger(warmFrames) && warmFrames > 0);
const samples = Number(process.env.SAMPLES || 6); assert(samples > 0 && Number.isInteger(samples));
const cases = [['desktop',1280,720,'high'], ['phone',390,844,'medium']].flatMap(([device,w,h,tier]) =>
  [['day','12:00'],['evening','17:45'],['night','20:30']].map(([light,time]) => ({ id: `${device}-${light}`,w,h,tier,time })));
const browser = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });
const report = { sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), harnessSha256:sha(fs.readFileSync(new URL(import.meta.url),'utf8')+fs.readFileSync(new URL('./firewood-state.mjs',import.meta.url),'utf8')), mode: 'synthetic fixture; visual shape changes deferred', fixtureSha256: sha(fixtureText), browser: browser.version(), measurements: [], failures: [] };
try {
  for (const c of cases.filter(c => !process.env.CASE || c.id === process.env.CASE)) {
    const context = await browser.newContext({ viewport: {width:c.w,height:c.h}, deviceScaleFactor:1 });
    const errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    await context.addInitScript(({ fixture }) => {
      localStorage.clear(); localStorage.setItem('seaglass.residents.v1', JSON.stringify(fixture));
      const realNow = performance.now.bind(performance);
      const realRAF = requestAnimationFrame.bind(window);
      window.__firewood = { ms: 1000, loading: true, realNow, draws: 0, hash: 2166136261 };
      // Fixed rendering time, independent of wall-clock shader compilation or image loading.
      Object.defineProperty(performance, 'now', { value: () => window.__firewood.ms });
      Date.now = () => fixture.at;
      let seed = 11;
      Math.random = () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        const v = ((t ^ t >>> 14) >>> 0) / 4294967296;
        const d = window.__firewood; d.draws++; d.hash = Math.imul(d.hash ^ (v * 4294967296 >>> 0), 16777619) >>> 0;
        return v;
      };
      // Keep the normal app's frame loop stopped from its first callback. Loading RAFs still run.
      // This uses an unminified test build so the frame function retains its name (see README).
      window.requestAnimationFrame = cb => cb.name === 'frame' && cb.toString().includes('frameBody') ? 0 : realRAF(() => { if (window.__firewood.loading) window.__firewood.ms += 1000 / 60; cb(window.__firewood.ms); });
    }, {fixture});
    const page = await context.newPage();
    page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.message); });
    page.on('console', m => { if(m.text().startsWith('study:')) console.log(m.text()); if (m.type() === 'error' && /shader|webgl|uncaught/i.test(m.text())) errors.push(m.text()); });
    page.setDefaultTimeout(600000);
    const url = new URL(base); url.search = `?debug&lab&nointro&nopip&wx=clear&date=2026-10-10&time=${c.time}&tier=${c.tier}`; url.hash = 'planet';
    console.log('loading', c.id);
    await page.goto(url.href, {waitUntil:'commit'});
    await page.waitForFunction(() => window.seaglass?.gv?.tween);
    // The stopped main loop would otherwise never resolve the loading globe tween.
    await page.evaluate(() => { const g=window.seaglass.gv, t=g.tween; g.lat=t.lat1; g.lon=t.lon0+t.dlon; g.dist=t.d1; g.tween=null; t.done(); });
    await page.waitForFunction(() => window.seaglass?.cur?.residents && window.seaglass?.advance);
    console.log('loaded', c.id);
    const setup = await page.evaluate(warmFrames => {
      const s = window.seaglass, d = window.__firewood;
      if (s.U.uTime.value !== 0) throw Error('The automatic frame loop was not intercepted; use an unminified build');
      d.loading = false; d.ms = 1000; s.hold(true); s.endOpening(); s.cur.residents.setBrain(null);
      s.clock.live = false; s.clock.speed = 0;
      const height = s.cur.residents.T.ground(61, -145);
      const pose = [68, height + 6, -137, Math.PI / 4, -0.5];
      s.aim(pose.slice(0,3), pose[3], pose[4]);
      const gl = s.renderer.getContext();
      const tick = () => { d.ms += 50; s.advance(1,0.05); gl.finish(); };
      for (let i=0; i<warmFrames; i++) tick();
      s.cur.residents.save();
      return { pose, startupRandom: {draws:d.draws,hash:d.hash}, storage: JSON.parse(localStorage.getItem('seaglass.residents.v1')) };
    }, warmFrames);
    console.log('prepared', c.id);
    const metrics = await page.evaluate(samples => {
      const s=window.seaglass, d=window.__firewood, r=s.renderer, gl=r.getContext();
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const times=[], counts=[], pixel=new Uint8Array(4);
      const originalRender=r.render; let count;
      r.render=function(...args) { const value=originalRender.apply(this,args); for(const k of ['calls','triangles','points','lines']) count[k]+=r.info.render[k]; return value; };
      for(let i=0;i<samples;i++) {
        count={calls:0,triangles:0,points:0,lines:0}; d.ms+=50; const start=d.realNow();
        s.advance(1,0.05); gl.finish(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        times.push(d.realNow()-start); counts.push(count);
      }
      r.render=originalRender;
      let objects=0, meshes=0; s.scene.traverse(o=>{objects++; if(o.isMesh) meshes++;});
      s.cur.residents.save();
      return { renderer, timesMs:times, counts, objects, meshes, random:{draws:d.draws,hash:d.hash},
        storage:JSON.parse(localStorage.getItem('seaglass.residents.v1')), fire:s.U.uFire.value.w,
        clockMs:s.clock.ms, camera:s.camera.position.toArray(), rotation:s.camera.rotation.toArray(),
        drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight], tiers:s.tiers };
    }, samples);
    console.log('measured', c.id, JSON.stringify({times:metrics.timesMs,counts:metrics.counts.at(-1)}));
    const cdp=await context.newCDPSession(page);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(out,`${c.id}.png`),Buffer.from(shot.data,'base64'));
    await cdp.detach();
    const sorted=[...metrics.timesMs].sort((a,b)=>a-b);
    const row = {...c, warmFrames, ...metrics, pose:setup.pose, startupRandom:setup.startupRandom,
      startStateSha256:sha(setup.storage), endStateSha256:sha(metrics.storage),
      state:readFirewoodState(metrics.storage,metrics.fire), medianMs:sorted[Math.floor(sorted.length/2)],
      errors};
    delete row.storage;
    report.measurements.push(row);
    if(errors.length) report.failures.push({case:c.id,errors});
    console.log(c.id, JSON.stringify({medianMs:row.medianMs,random:row.random,counts:row.counts.at(-1),state:row.state}));
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    await context.close();
  }
} catch(e) { report.failures.push({error:String(e)}); throw e; }
finally { fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n'); await browser.close(); }
assert(report.measurements.length > 0 && report.failures.length===0, 'Capture has errors or no selected cases');
