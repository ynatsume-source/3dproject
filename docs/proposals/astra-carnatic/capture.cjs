const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const output=path.join(__dirname,'images');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const [base,id,label='review',mode]=process.argv.slice(2); const errors=[];
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try {const page=await browser.newPage({viewport:{width:1200,height:800}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text());if(m.text().startsWith('[load]'))console.log(m.text());});
 await page.goto(`${base}/?debug&tier=low&at=${id==='carnatic'?'2026-06-20T10:00:00Z':'2026-06-20T20:00:00Z'}#${id}`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(id=>window.seaglass?.cur?.loc.id===id&&!document.getElementById('veil').classList.contains('on'),id,{timeout:180000});
 await page.evaluate(()=>seaglass.setWx({cloud:0.1,wind:2}));
 let poses=id==='carnatic'?[{name:'overview',p:[47,-5,-35],l:[5,-14,-3]},{name:'frames',p:[8,-11,-20],l:[19,-14,-3]},{name:'stern',p:[-50,-12,-18],l:[-28,-15,-2]},{name:'broadside',p:[4,-10,-45],l:[6,-15,1]},{name:'bow',p:[59,-13,-14],l:[41,-16,-1]}]:[{name:'forest',p:[0,-8,-10],l:[14,-6,14]},{name:'canopy',p:[8,-6,8],l:[25,-.5,22]},{name:'floor',p:[-12,-12,-8],l:[-2,-15,4]}];
 if(id==='monterey') { const root=await page.evaluate(()=>seaglass.cur.kelp.roots.reduce((a,b)=>a.x*a.x+a.z*a.z<b.x*b.x+b.z*b.z?a:b).toArray());
 const [x,y,z]=root;
 poses=[{name:'forest',p:[x-7,y+7,z-9],l:[x+3,y+9,z+4]},{name:'canopy',p:[x-3,-5,z-4],l:[x+2,-1,z+2]},{name:'floor',p:[x-3,y+2.5,z-5],l:[x,y+1.8,z]}]; }
 if(mode==='detail'){poses=[{name:'lamp',p:[24,-7.9,-12],l:[26,-8.6,-5.8]}];await page.locator('#btnLamp').click();await page.mouse.move(1,700);await page.waitForFunction(()=>seaglass.U.uLamp.value>.95,null,{timeout:60000});}
 const poseStates=[];
 for(const pose of poses){await page.evaluate(p=>{const s=seaglass;s.drone.mode='manual';s.drone.pos.set(...p.p);s.drone.vel.set(0,0,0);s.drone.lastInput=performance.now();const dx=p.l[0]-p.p[0],dy=p.l[1]-p.p[1],dz=p.l[2]-p.p[2];s.drone.yaw=Math.atan2(-dx,-dz);s.drone.pitch=Math.atan2(dy,Math.hypot(dx,dz));s.drone.roll=0;},pose);
 const t=await page.evaluate(()=>seaglass.U.uTime.value);await page.waitForFunction(t=>seaglass.U.uTime.value>t+.15,t,{timeout:60000});await page.screenshot({path:`${output}/${label}-${pose.name}.png`,timeout:60000});poseStates.push(await page.evaluate(p=>({name:p.name,requestedPosition:p.p,requestedLook:p.l,camera:seaglass.camera.position.toArray(),lamp:seaglass.U.uLamp.value}),pose));}
 const state=await page.evaluate(()=>{const s=seaglass,g=document.getElementById('scene').getContext('webgl2');return {sea:s.cur.loc.id,camera:s.camera.position.toArray(),fish:s.cur.fish.length,kelp:s.cur.kelp?.count,vertices:s.cur.wreck?.geo.attributes.position.count,glError:g.getError(),lost:g.isContextLost(),err:!document.getElementById('err').hidden};});
 console.log(JSON.stringify({label,poseStates,state,errors},null,2));fs.writeFileSync(`${output}/${label}.json`,JSON.stringify({poseStates,state,errors},null,2));
 if(errors.length||state.glError||state.lost||state.err)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
