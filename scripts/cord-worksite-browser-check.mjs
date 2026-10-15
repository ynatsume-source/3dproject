import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=path.resolve(process.env.CORD_SCREENSHOT_OUT??'check-results/cord-worksite');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox']});
const report={viewports:[],failures:[],note:'Stage area minus union of all visible overlay rectangles. Full bounds of both people protected. Compact >=80%, details >=70%. Schematic saved projections, not production footage.'};
const expected={
 parallel:['浸して待つ','ドット：Bで手作業','Aは待機・Bは作業','戻って取り出し・確認'],
 check:['取り出して確認へ','ドット：手は空いている','完成未確認・手は空いている','戻って取り出し・確認'],
 working:['回収の手作業中','ドット：Aで手作業','一区切りで手を離せる','一区切りで続きへ'],
 paused:['中断・続きは保持','ドット：手は空いている','中断・続きあり','残りの手作業を再開'],
 recovered:['回収済み・縄は未完成','ドット：手は空いている','縄は未完成','回収物を見て次を検討'],
 missing:['水不足・開始前','ドット：手は空いている','水が揃わず開始できない','水を用意して再検討'],
};
try {
 for(const viewport of [{width:1280,height:720},{width:640,height:360}]) {
  const page=await browser.newPage({viewport,deviceScaleFactor:1});const errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.route('http://**/*',r=>r.abort());await page.route('https://**/*',r=>r.abort());
  // setContent does not navigate: install guards in this document before loading its scripts.
  await page.evaluate(()=>{for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){throw Error('preview attempted storage access');}});});
  await page.setContent(fs.readFileSync('docs/proposals/cord-worksite-preview/index.html','utf8'));
  await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.fonts.check('14px ReviewJP')));
  const before=await page.evaluate(()=>window.worksiteReview.snapshot());
  const ids=await page.locator('#states option').evaluateAll(xs=>xs.map(x=>x.value));
  assert.deepEqual(ids,Object.keys(expected));
  for(const id of ids) {
   await page.selectOption('#states',id);
   for(const mode of ['compact','details']) {
    if(mode==='details')await page.click('#details-toggle');
    assert.equal(await page.locator('#details-toggle').getAttribute('aria-expanded'),String(mode==='details'));
    assert.equal(await page.locator('#details').isVisible(),mode==='details');
    const layout=await page.evaluate(()=>{
     const stage=document.querySelector('#stage').getBoundingClientRect();
     const visible=e=>e.getClientRects().length>0;
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.left-stage.left,y:r.top-stage.top,w:r.width,h:r.height};};
     const intersects=(a,b,tolerance=0)=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+tolerance&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+tolerance;
     const boxes=[...document.querySelectorAll('[data-occluder]')].filter(visible).map(rect);
     const cuts=[...new Set([0,stage.width,...boxes.flatMap(r=>[Math.max(0,r.x),Math.min(stage.width,r.x+r.w)])])].sort((a,b)=>a-b);let covered=0;
     for(let i=1;i<cuts.length;i++){const mid=(cuts[i-1]+cuts[i])/2;const ys=boxes.filter(r=>r.x<=mid&&mid<r.x+r.w).map(r=>[Math.max(0,r.y),Math.min(stage.height,r.y+r.h)]).sort((a,b)=>a[0]-b[0]);let bottom=0,len=0;for(const [a,b]of ys){if(b>bottom){len+=b-Math.max(a,bottom);bottom=b;}}covered+=(cuts[i]-cuts[i-1])*len;}
     const elements=[...document.querySelectorAll('footer p,.tag,header strong,header button,header select')].filter(visible);
     const clipping=elements.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.textContent);
     const select=document.querySelector('#states'),context=document.createElement('canvas').getContext('2d');context.font=getComputedStyle(select).font;
     if(context.measureText(select.selectedOptions[0].textContent).width+28>select.clientWidth)clipping.push('selected state label');
     const overlap=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(intersects(boxes[i],boxes[j],1))overlap.push([i,j]);
     const outside=boxes.filter(r=>r.x<-.5||r.y<-.5||r.x+r.w>stage.width+.5||r.y+r.h>stage.height+.5);
     const textBoxes=elements.map(e=>{const range=document.createRange();range.selectNodeContents(e);const r=e.tagName==='SELECT'?e.getBoundingClientRect():range.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height};});
     const textOverlaps=[];for(let i=0;i<textBoxes.length;i++)for(let j=i+1;j<textBoxes.length;j++)if(intersects(textBoxes[i],textBoxes[j],.5))textOverlaps.push([textBoxes[i].text,textBoxes[j].text]);
     const textOutside=textBoxes.filter(r=>r.x<stage.x-.5||r.y<stage.y-.5||r.x+r.w>stage.right+.5||r.y+r.h>stage.bottom+.5).map(r=>r.text);
     // Full bounds include head, torso, limbs and shadows for every scene person.
     const people=[...document.querySelectorAll('[data-person]')].map(e=>({id:e.id,...rect(e)}));
     const personOverlaps=[];for(const person of people)for(const [i,label]of boxes.entries())if(intersects(person,label))personOverlaps.push({person:person.id,overlay:i});
     const minFont=selector=>Math.min(...[...document.querySelectorAll(selector)].filter(visible).map(e=>parseFloat(getComputedStyle(e).fontSize)));
     return {people,personOverlaps,worldVisible:1-covered/(stage.width*stage.height),clipping,overlap,outside,textOverlaps,textOutside,minMainTextPx:minFont('#summary p,header strong,header button,header select,.tag'),minDetailTextPx:document.querySelector('#details').hidden?null:minFont('#details p'),summary:['current','parallel','reason','following'].map(id=>document.getElementById(id).textContent),eta:document.querySelector('#eta').textContent};
    });
    report.viewports.push({viewport,id,mode,...layout});
    await page.screenshot({path:path.join(out,`${viewport.width}-${id}${mode==='details'?'-details':''}.png`)});
    assert.ok(layout.worldVisible>=(mode==='details'?.70:.80),`${viewport.width}/${id}/${mode}: world visibility ${layout.worldVisible}`);
    for(const key of ['clipping','overlap','outside','textOverlaps','textOutside','personOverlaps'])assert.deepEqual(layout[key],[],`${viewport.width}/${id}/${mode}: ${key}`);
    assert.ok(layout.minMainTextPx>=14);if(mode==='details')assert.ok(layout.minDetailTextPx>=14);
    assert.equal(layout.people.length,2,'both scene residents must be checked');assert.deepEqual(layout.summary,expected[id]);
    assert.ok(!/[0-9]+\s*(秒|分|時間)/.test(layout.eta),'no fixture ETA');
    if(!['missing','recovered'].includes(id))assert.equal(layout.eta,'自然処理の完了時刻：不明');
    assert.equal(await page.locator('.future').textContent(),'乾燥・撚り・完成縄は未実装');
    assert.equal(await page.evaluate(()=>window.worksiteReview.snapshot()),before);
   }
   await page.click('#details-toggle');assert.equal(await page.locator('#details').isVisible(),false);
   assert.equal(await page.evaluate(()=>window.worksiteReview.selected),id,'closing preserves selected record');
  }
  // Keep details open while changing records; closing/Escape return to the same record.
  await page.locator('#details-toggle').focus();await page.keyboard.press('Enter');
  for(const id of ids){await page.selectOption('#states',id);assert.equal(await page.locator('#details').isVisible(),true);assert.equal(await page.locator('#reason').textContent(),expected[id][2]);}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#details').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'details-toggle');
  await page.keyboard.press('Space');assert.equal(await page.locator('#details').isVisible(),true);
  await page.keyboard.press('Space');assert.equal(await page.locator('#details').isVisible(),false);
  await page.click('#prev');assert.equal(await page.evaluate(()=>window.worksiteReview.selected),'recovered');
  await page.click('#next');assert.equal(await page.evaluate(()=>window.worksiteReview.selected),'missing');
  for(let i=0;i<120;i++)await page.click('#next');
  assert.equal(await page.evaluate(()=>window.worksiteReview.snapshot()),before);
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);await page.close();
 }
 report.status='passed';
} catch(e){report.status='failed';report.failures.push(e.stack);throw e;}
finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(`PASS worksite browser: ${report.viewports.length} rendered states/modes; compact >=80%, details >=70%; all people clear; open/close/keyboard/state switches preserve data; no network/storage/model writes.`);
