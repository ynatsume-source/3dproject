const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:720,height:480}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text());});
  await page.goto(`${process.argv[2] || 'http://127.0.0.1:4176'}/?debug&tier=low&at=2026-06-20T10:00:00Z#carnatic`);
  await page.waitForFunction(()=>window.seaglass?.cur?.loc.id==='carnatic'&&!document.getElementById('veil').classList.contains('on'),null,{timeout:180000});
  const tours=await page.evaluate(()=>{
   const s=seaglass,sub=s.cur.eco.subjects().find(x=>x.key==='wreck'),out=[];
   for(const reverse of [false,true]){
    s.director.reset();s.drone.mode='auto';s.drone.sky=false;s.drone.seaUntil=Infinity;s.drone.pos.copy(sub.tour.start(reverse));s.drone.vel.set(0,0,0);
    s.director.focus(sub,s.drone.pos);let minGround=Infinity,observed=false,complete=false,maxLag=0,endError=0,steps=0;
    const end=s.drone.pos.clone(),look=end.clone();sub.tour.at(sub.tour.length,reverse,end,look);
    for(let i=0;i<(sub.tour.length+20)*60;i++){
     s.stepDrone(1/60);steps++;
     minGround=Math.min(minGround,s.drone.pos.y-s.cur.T.ground(s.drone.pos.x,s.drone.pos.z));
     const sh=s.director.shot;
     if(sh?.subject.key==='wreck'){observed ||=sh.phase==='observe';maxLag=Math.max(maxLag,sh.pos.distanceTo(s.drone.pos));}
     else if(observed){complete=true;break;}
    }
    endError=s.drone.pos.distanceTo(end);out.push({reverse,observed,complete,steps,minGround,maxLag,endError});
   }
   s.drone.mode='manual';s.drone.lastInput=performance.now();return out;
  });
  const gl=await page.evaluate(()=>{const g=document.getElementById('scene').getContext('webgl2');return {error:g.getError(),lost:g.isContextLost()};});
  const testedAt=new Date().toISOString(),url=page.url(),scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src));
  const r={testedAt,url,scripts,tours,gl,errors};console.log(JSON.stringify(r,null,2));fs.writeFileSync(require('node:path').join(__dirname,'drone-check.json'),JSON.stringify(r,null,2));
  if(errors.length||gl.error||gl.lost||tours.some(t=>!t.observed||!t.complete||t.minGround<.7||t.endError>1))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
