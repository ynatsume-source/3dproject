import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=path.resolve(process.env.CORD_SCREENSHOT_OUT??'check-results/cord-worksite');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox']});
const report={viewports:[],failures:[],note:'Conservative world visibility = stage area minus union of header/footer/labels/caption rectangles. Schematic scene; not production footage.'};
try {
 for(const viewport of [{width:1280,height:720},{width:640,height:360}]) {
  const page=await browser.newPage({viewport,deviceScaleFactor:1});const errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.route('http://**/*',r=>r.abort());await page.route('https://**/*',r=>r.abort());
  await page.addInitScript(()=>{for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){throw Error('preview attempted storage access');}});});
  await page.setContent(fs.readFileSync('docs/proposals/cord-worksite-preview/index.html','utf8'));
  await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.fonts.check('14px ReviewJP')));
  const before=await page.evaluate(()=>window.worksiteReview.snapshot());
  const ids=await page.locator('#states option').evaluateAll(xs=>xs.map(x=>x.value));
  for(const id of ids) {
   await page.selectOption('#states',id);
   const layout=await page.evaluate(()=>{
    const stage=document.querySelector('#stage').getBoundingClientRect();
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.left-stage.left,y:r.top-stage.top,w:r.width,h:r.height};};
    const boxes=[...document.querySelectorAll('[data-occluder]')].map(rect);
    const cuts=[...new Set(boxes.flatMap(r=>[r.x,r.x+r.w]))].sort((a,b)=>a-b);let covered=0;
    for(let i=1;i<cuts.length;i++){const mid=(cuts[i-1]+cuts[i])/2;const ys=boxes.filter(r=>r.x<=mid&&mid<r.x+r.w).map(r=>[Math.max(0,r.y),Math.min(stage.height,r.y+r.h)]).sort((a,b)=>a[0]-b[0]);let bottom=0,len=0;for(const [a,b]of ys){if(b>bottom){len+=b-Math.max(a,bottom);bottom=b;}}covered+=(cuts[i]-cuts[i-1])*len;}
    const clipping=[...document.querySelectorAll('footer section,footer strong,footer p,.tag,header strong')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent);
    const overlap=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1)overlap.push([i,j]);}
    const outside=boxes.filter(r=>r.x<-.5||r.y<-.5||r.x+r.w>stage.width+.5||r.y+r.h>stage.height+.5);
    const textBoxes=[...document.querySelectorAll('footer .k,footer strong,footer p')].map(e=>{const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height};});
    const textOverlaps=[];for(let i=0;i<textBoxes.length;i++)for(let j=i+1;j<textBoxes.length;j++){const a=textBoxes[i],b=textBoxes[j];if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1)textOverlaps.push([a.text,b.text]);}
    // Every person (including background figures), against every overlay.
    // Full rendered bounds conservatively include limbs and shadows as well as head/torso.
    const people=[...document.querySelectorAll('[data-person]')].map(e=>({id:e.id,...rect(e)}));
    const personOverlaps=[];
    for(const person of people)for(const [i,label] of boxes.entries())if(Math.min(person.x+person.w,label.x+label.w)>Math.max(person.x,label.x)&&Math.min(person.y+person.h,label.y+label.h)>Math.max(person.y,label.y))personOverlaps.push({person:person.id,overlay:i});
    return {people,personOverlaps,worldVisible:1-covered/(stage.width*stage.height),clipping,overlap,outside,textOverlaps,minMainTextPx:Math.min(...[...document.querySelectorAll('footer strong')].map(e=>parseFloat(getComputedStyle(e).fontSize))),current:document.querySelector('#current').textContent,eta:document.querySelector('#eta').textContent};
   });
   report.viewports.push({viewport,id,...layout});
   await page.screenshot({path:path.join(out,`${viewport.width}-${id}.png`)});
   assert.ok(layout.worldVisible>=.70,`${viewport.width}/${id}: world visibility ${layout.worldVisible}`);
   assert.deepEqual(layout.clipping,[],`${id} clipped text`);assert.deepEqual(layout.overlap,[],`${id} HUD overlap`);assert.deepEqual(layout.outside,[],`${id} HUD outside stage`);assert.deepEqual(layout.textOverlaps,[],`${id} text overlap`);assert.ok(layout.minMainTextPx>=14);assert.equal(layout.people.length,2,'both scene residents must be checked');assert.deepEqual(layout.personOverlaps,[],`${viewport.width}/${id}: overlays must not cover any resident`);
   assert.ok(!/[0-9]+\s*(秒|分|時間)/.test(layout.eta),'no fixture ETA');
   assert.equal(await page.evaluate(()=>window.worksiteReview.snapshot()),before);
  }
  for(let i=0;i<120;i++)await page.click('#next');
  assert.equal(await page.evaluate(()=>window.worksiteReview.snapshot()),before);
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);await page.close();
 }
 report.status='passed';
} catch(e){report.status='failed';report.failures.push(e.stack);throw e;}
finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(`PASS worksite browser: ${report.viewports.length} rendered states, no clipping/overlap, world >=70%, no network/storage/model writes.`);
