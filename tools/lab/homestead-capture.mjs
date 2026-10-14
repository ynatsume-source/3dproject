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
const cases = [
  ...['day','evening','night'].flatMap(light=>[['desktop',1280,720,'high'],['phone',390,844,'medium']].map(([device,w,h,tier])=>({id:`${device}-home-wide-${light}`,view:'home-wide',w,h,tier,time:light==='day'?'12:00':light==='evening'?'17:30':'20:30',date:'2026-10-10',weather:'clear'}))),
  {id:'desktop-home-near-day',view:'home-near',w:1280,h:720,tier:'high',time:'12:00',date:'2026-10-10',weather:'clear'}
];
const browser = await pw.chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });
const report = { sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), sourceSha256:sha(['src/ocean/shore.ts','src/ocean/forest.ts','src/robots/residents.ts'].map(p=>fs.readFileSync(p,'utf8')).join('')), harnessSha256:sha(fs.readFileSync(new URL(import.meta.url),'utf8')+fs.readFileSync(new URL('./firewood-state.mjs',import.meta.url),'utf8')), mode: 'homestead visual study; synthetic fixed save', fixtureSha256: sha(fixtureText), browser: browser.version(), measurements: [], failures: [] };
try {
  for (const c of cases.filter(c => !process.env.CASE || process.env.CASE.split(',').includes(c.id))) {
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
    const url = new URL(base); url.search = `?debug&lab&nointro&nopip&wx=${c.weather}&date=${c.date}&time=${c.time}&tier=${c.tier}`; url.hash = 'planet';
    console.log('loading', c.id);
    await page.goto(url.href, {waitUntil:'commit'});
    await page.waitForFunction(() => window.seaglass?.gv?.tween);
    // The stopped main loop would otherwise never resolve the loading globe tween.
    await page.evaluate(() => { const g=window.seaglass.gv, t=g.tween; g.lat=t.lat1; g.lon=t.lon0+t.dlon; g.dist=t.d1; g.tween=null; t.done(); });
    await page.waitForFunction(() => window.seaglass?.cur?.residents && window.seaglass?.advance);
    console.log('loaded', c.id);
    const setup = await page.evaluate(({warmFrames,view}) => {
      const s = window.seaglass, d = window.__firewood;
      if (s.U.uTime.value !== 0) throw Error('The automatic frame loop was not intercepted; use an unminified build');
      d.loading = false; d.ms = 1000; s.hold(true); s.endOpening(); s.cur.residents.setBrain(null);
      s.clock.live = false; s.clock.speed = 0;
      const R=s.cur.residents, ground=(x,z)=>R.T.ground(x,z);
      const height=ground(61,-145);
      let pose=[68,height+6,-137,Math.PI/4,-0.5], target=null;
      const lookAt=(x,y,z,tx,ty,tz)=>[x,y,z,Math.atan2(x-tx,z-tz),-Math.atan2(y-ty,Math.hypot(x-tx,z-tz))];
      if(view==='home-near')pose=lookAt(66.8,4.6,-136.5,65.81231831932729,3.0,-141.6862910966604);
      if(view==='beach') {
        target=[...s.cur.shore.lists.casuarina].sort((a,b)=>Math.hypot(a.x-61,a.z+145)-Math.hypot(b.x-61,b.z+145))[0];
        pose=lookAt(target.x+10,target.y+4,target.z+12,target.x,target.y+target.s*.55,target.z);
      }
      if(view==='falling') {
        target=R.T.forest.standingNear(61,-145,25).sort((a,b)=>Math.hypot(a.x-61,a.z+145)-Math.hypot(b.x-61,b.z+145))[0];
        const dot=R.list.find(r=>r.id==='dot');dot.pos.set(target.x+1,target.y,target.z+1);
        dot.task={kind:'fell',x:dot.pos.x,z:dot.pos.z,act:'work',dur:0,t:1,arrived:true,data:{x:target.x,z:target.z}};dot.act='work';
        R.update(.1,s.clock.ms,s.camera.position); R.update(1.1,s.clock.ms,s.camera.position);
        if(!R.village.felled.some(t=>t.x===target.x&&t.z===target.z))throw Error('Felling did not complete');
        pose=lookAt(target.x+7,target.y+4,target.z+8,target.x,target.y+target.h*.35,target.z);
      }
      s.aim(pose.slice(0,3), pose[3], pose[4]);
      const gl = s.renderer.getContext(), pixel=new Uint8Array(4);
      const tick = () => { d.ms += 50; s.advance(1,0.05); gl.finish(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel); };
      for (let i=0; i<warmFrames; i++) tick();
      s.cur.residents.save();
      return { pose, target, startupRandom: {draws:d.draws,hash:d.hash}, storage: JSON.parse(localStorage.getItem('seaglass.residents.v1')) };
    }, {warmFrames,view:c.view});
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
        sky:{night:s.U.uNight.value,cloud:s.U.uCloud.value,moonI:s.U.uMoonI.value,moonIllum:s.U.uMoonIllum.value,moonY:s.U.uAirMoon.value.y},
        projection:s.camera.projectionMatrix.toArray(),clockMs:s.clock.ms, camera:s.camera.position.toArray(), rotation:s.camera.rotation.toArray(),
        drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight], tiers:s.tiers };
    }, samples);
    console.log('measured', c.id, JSON.stringify({times:metrics.timesMs,counts:metrics.counts.at(-1)}));
    const cdp=await context.newCDPSession(page);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(out,`${c.id}.png`),Buffer.from(shot.data,'base64'));
    await cdp.detach();
    const sorted=[...metrics.timesMs].sort((a,b)=>a-b);
    let flicker=null;
    if(process.env.FLICKER==='1' && ['desktop-home-near-day','desktop-beach-day'].includes(c.id)) {
      flicker=await page.evaluate(pose=>{
        const s=seaglass,gl=s.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const step=2*Math.tan(s.camera.fov*Math.PI/360)/h*4*.25, frames=[],mx=new Float32Array(w*h);
        for(let i=0;i<4;i++){
          s.aim([pose[0]+Math.cos(pose[3])*step*i,pose[1],pose[2]-Math.sin(pose[3])*step*i],pose[3],pose[4]);s.advance(1,1e-4);
          const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          const L=new Float32Array(w*h);for(let k=0;k<L.length;k++)L[k]=(pixels[k*4]*.299+pixels[k*4+1]*.587+pixels[k*4+2]*.114)/255;
          frames.push(L);if(i>=2)for(let k=0;k<L.length;k++)mx[k]=Math.max(mx[k],Math.abs(L[k]-2*frames[i-1][k]+frames[i-2][k]));
        }
        return {frames:4,step,w,h,over12:mx.filter(x=>x>.12).length/mx.length,over25:mx.filter(x=>x>.25).length/mx.length};
      },setup.pose);
    }
    const row = {...c, flicker, warmFrames, ...metrics, pose:setup.pose,target:setup.target, startupRandom:setup.startupRandom,
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
