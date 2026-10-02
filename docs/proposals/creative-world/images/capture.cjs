const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
const out=__dirname;
const crypto=require('crypto');
const previewUrl=process.env.CAPTURE_URL || 'http://127.0.0.1:4194/docs/proposals/creative-world/design-board.html';
const baseOrigin=new URL(previewUrl).origin;
(async()=>{
 const errors=[], requests=[];
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1120},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>requests.push(r.url()));
 await page.goto(previewUrl);
 const checks=[];
 async function assert(name,f){if(!(await f()))throw new Error(name);checks.push(name)}
 await assert('Explicit illustrative / disconnected disclaimer',()=>page.getByText('固定の例で動く説明用モデル。実 AI・本番の島には未接続です。図の地形・材料数・出来事は説明のための仮定です。').isVisible());
 for(const site of ['grove','shore']){
  await page.locator(`[data-site="${site}"]`).click();
  for(const weather of ['clear','rain']){
   await page.locator(`[data-weather="${weather}"]`).click();
   for(let stage=0;stage<7;stage++){
    await page.locator('.step').nth(stage).click();
    await assert(`${site}/${weather}/${stage+1}: selected stage, SVG and shared history match`,()=>page.evaluate(({stage,weather})=>{
      const active=document.querySelectorAll('.step[aria-pressed="true"]');
      const svg=document.getElementById('scene-svg-description').textContent;
      return active.length===1&&document.getElementById('chapter').textContent.includes(`0${stage+1}`)&&[...document.querySelectorAll('.version')].every(e=>e.textContent.includes(`段階 ${stage+1}`))&&svg.includes(weather==='rain'?'雨のため星の新しい観察は行わない':'晴れた夜には屋外で観察できる');
    },{stage,weather}));
   }
  }
 }
 await page.locator('[data-site="grove"]').click();await page.locator('[data-weather="rain"]').click();
 await page.locator('.step').nth(3).click();
 await assert('Unfinished frame does not provide rain shelter',()=>page.getByText('雨よけはまだ無効',{exact:true}).isVisible());
 await page.screenshot({path:path.join(out,'design-board-assembly.png'),fullPage:true});
 await page.locator('.step').nth(5).click();
 await page.mouse.move(1400,20);
 await page.screenshot({path:path.join(out,'design-board-desktop.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'いまの概念図を SVG で保存 ↓'}).click();const download=await downloadPromise;
 await download.saveAs(path.join(out,'design-board-concept.svg'));
 await assert('SVG export is self-contained and retains illustrative provenance',async()=>{const svg=fs.readFileSync(path.join(out,'design-board-concept.svg'),'utf8');return svg.includes('固定の説明図')&&svg.includes('<style')&&!svg.includes('href="http')&&!svg.includes('<script')});
 await page.locator('[data-site="shore"]').click();await page.locator('[data-weather="clear"]').click();
 await assert('Shore option adds maintenance/material implications',()=>page.getByText('流木 2 本を追加搬入・使用 ＋ 搬入済みの支え材',{exact:true}).isVisible());
 await page.screenshot({path:path.join(out,'design-board-shore.png'),fullPage:true});
 await page.locator('[data-site="grove"]').click();await page.locator('[data-weather="rain"]').click();await page.locator('.step').nth(6).click();
 await assert('Last stage cannot progress past fixed scenario',()=>page.locator('#next').isDisabled());
 await page.locator('.step').nth(0).click();await assert('First stage cannot go backwards',()=>page.locator('#previous').isDisabled());
 await page.locator('.step').nth(1).focus();await page.keyboard.press('Enter');
 await assert('Keyboard can choose stages',()=>page.locator('.step').nth(1).getAttribute('aria-pressed').then(v=>v==='true'));
 await page.locator('.step').nth(5).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'design-board-mobile.png'),fullPage:true});
 await assert('390 px mobile has no horizontal overflow',()=>page.evaluate(()=>document.documentElement.scrollWidth===window.innerWidth));
 await assert('No stored or persistent world changes',()=>page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
 await assert('No external HTTP requests',()=>requests.every(u=>u.startsWith(baseOrigin+'/')));
 await assert('No JavaScript/console errors',()=>errors.length===0);
 const svgPage=await context.newPage();await svgPage.setViewportSize({width:1200,height:720});await svgPage.goto(new URL('./images/design-board-concept.svg',previewUrl).href);await assert('Exported SVG opens independently in Chromium',()=>svgPage.locator('svg').count().then(n=>n===1));await svgPage.screenshot({path:path.join(out,'design-board-concept.png')});await svgPage.close();
 const report={htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'../design-board.html'))).digest('hex'),purpose:'Static Japanese interactive design illustration only; no AI, backend, real terrain, or world simulation.',checkedAt:new Date().toISOString(),browser:await browser.version(),viewport:{desktop:[1440,1120],mobile:[390,844]},scenarioCombinations:28,checks,errors,externalRequests:requests.filter(u=>!u.startsWith(baseOrigin+'/')),artifacts:['design-board-desktop.png','design-board-assembly.png','design-board-shore.png','design-board-mobile.png','design-board-concept.svg','design-board-concept.png']};
 fs.writeFileSync(path.join(out,'design-board-browser-report.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();console.log(JSON.stringify({checks:checks.length,scenarioCombinations:28,errors,artifacts:report.artifacts}));
})().catch(e=>{console.error(e);process.exit(1)});
