import assert from 'node:assert/strict';
import {draw,drawUint32} from '../src/science/rng';
import {integerSqrt,integerDecayStrength} from '../src/science/prototypes/integer-half-life';
import {SAIL_RAFT_ID as ID,SAIL_RULES as R,equilibriumSpeedMmS,sailForceGf,sailStrength,cosDeg,qualityPpm,
 type PlantMass,type SailMat,type BambooMast} from '../src/science/prototypes/sail-raft-rules';
import {createSailManufacturingModel,type SailManufactureInput,type SailRig} from '../src/science/prototypes/sail-raft-manufacturing';
import {createSailRaftVoyage,createSailWearModel,cordVoyageContext,type SailCell,type VoyageContext} from '../src/science/prototypes/sail-raft-voyage';
import {COIR_CORD_ASSUMPTION_ID as CORD_ID,type CoirPiece} from '../src/science/prototypes/coir-cord-types';
import {createCordDamageModel,createIntegerCordDamageModel,currentIntegerCordStrength} from '../src/science/prototypes/coir-cord-damage';
import type {CoirContext,CoirInterval} from '../src/science/prototypes/coir-cord';

let groups=0;
const test=(s:string,f:()=>void)=>{f();groups++;console.log('PASS '+s);};
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const reject=(f:()=>unknown)=>assert.throws(f);
const leaves=(material:PlantMass['material']='pandanus_standing_leaves',dryMg=1000000,waterMg=2000000):PlantMass=>({lotId:'leaves',material,dryMg,waterMg});
const ctx=(operation:SailManufactureInput['operation'],runId='make',seed=12345):CoirContext=>({worldId:'fixture',worldEpoch:'1',runId,seed,clock:operation==='dry'?'island':'world',openedAtMs:1000});
function receipt(c:CoirContext,a:number,b:number,confirmationId='work'):CoirInterval{
 return {confirmationId,worldId:c.worldId,worldEpoch:c.worldEpoch,runId:c.runId,clock:c.clock,fromMs:a,toMs:b,confirmedAtMs:b,
 ...(c.clock==='island'?{kind:'host-confirmed-roofed-wait' as const}:{kind:'host-confirmed-manual-work' as const,actorId:'worker',attendance:'present' as const})};
}
function make(input:SailManufactureInput,runId='make',seed=12345){
 const c=ctx(input.operation,runId,seed),m=createSailManufacturingModel(input,ID,c);
 return {c,m,at:(t:number)=>m.project(t?m.commit(m.start(),receipt(c,1000,1000+t)):m.start())};
}
const mass=(v:{dryMg:number;waterMg:number})=>BigInt(v.dryMg)+BigInt(v.waterMg);
const mat=():SailMat=>({lotId:'mat',material:'sail_mat',dryMg:900000,waterMg:180000,areaCm2:20000,baseStrengthGf:60000,torn:false,damage:{sunMs:0,shadeMs:0,rainMs:0}});
const mast=():BambooMast=>({lotId:'mast',material:'bamboo_mast',dryMg:2000000,waterMg:100000,lengthMm:2500,baseStrengthGf:40000,broken:false});
const cord=(lotId='cord',lengthMm=8000,baseStrengthGf=100000):CoirPiece=>({lotId,material:'coir_rope',fiberDryMg:lengthMm*17,pithDryMg:0,waterMg:0,lengthMm,baseStrengthGf,damage:{sunMs:0,shadeMs:0,abrasions:0}});
const rig=():SailRig=>({lotId:'rig',material:'sail_raft',hull:{lotId:'hull',material:'raft',dryMg:50000000,waterMg:1000000},mat:mat(),mast:mast(),cords:[cord()]});
const vc:VoyageContext={worldId:'fixture',worldEpoch:'1',runId:'voyage',seed:12345,openedAtWorldMs:1000,openedAtIslandMs:10000};
function cell(i=0,patch:Partial<SailCell>={}):SailCell{
 return {cellId:'cell:'+i,worldId:vc.worldId,worldEpoch:vc.worldEpoch,runId:vc.runId,
 fromWorldMs:vc.openedAtWorldMs+i*30000,toWorldMs:vc.openedAtWorldMs+(i+1)*30000,confirmedAtWorldMs:vc.openedAtWorldMs+(i+1)*30000,
 fromIslandMs:vc.openedAtIslandMs+i*30000,toIslandMs:vc.openedAtIslandMs+(i+1)*30000,aboard:true,windMmS:5000,windToDeg:0,gustMmS:null,headingDeg:0,rain:false,sailUp:true,...patch};
}
const allMass=(r:SailRig)=>mass(r.hull)+mass(r.mat)+mass(r.mast)+r.cords.reduce((n,p)=>n+BigInt(p.fiberDryMg)+BigInt(p.pithDryMg)+BigInt(p.waterMg),0n);
test('integer sqrt and keyed draws preserve existing mixing without floating powers',()=>{
 for(let n=0n;n<1000n;n++){const q=integerSqrt(n);assert.ok(q*q<=n&&(q+1n)*(q+1n)>n);}
 const n=(1n<<200n)+123456789n,q=integerSqrt(n);assert.ok(q*q<=n&&(q+1n)*(q+1n)>n);
 reject(()=>integerSqrt(-1n));
 for(let s=0;s<100;s++)assert.equal(drawUint32(s,'run','lot','purpose'),draw(s,'run','lot','purpose')*4294967296);
 const values=new Set(Array.from({length:50},(_,i)=>qualityPpm(1,'run'+i,'lot','sail',850000,300000)));
 assert.ok(values.size>40);
});
test('integer cumulative half-life and abrasion have exact anchor values and monotone bounds',()=>{
 const y=BigInt(R.yearIslandMs);
 assert.equal(integerDecayStrength(100000,0n,y,0),100000);
 assert.equal(integerDecayStrength(100000,y,y,0),50000);
 assert.equal(integerDecayStrength(100000,y,y,1),49500);
 assert.equal(integerDecayStrength(100000,0n,y,1),99000);
 assert.equal(integerDecayStrength(Number.MAX_SAFE_INTEGER,0n,y,4096),0);
 assert.ok(BigInt(Number.MAX_SAFE_INTEGER)*99n**4096n<100n**4096n);
 let last=Number.MAX_SAFE_INTEGER;
 for(let i=0;i<=5000;i++){const v=integerDecayStrength(Number.MAX_SAFE_INTEGER,BigInt(i)*y/500n,y,0);assert.ok(v<=last);last=v;}
 reject(()=>integerDecayStrength(1,-1n,y,0));
});
test('old and integer PR21 policies reject relabelling and share conservative fracture',()=>{
 const p=cord(),c=cordVoyageContext(vc,p.lotId),old=createCordDamageModel(p,CORD_ID,c),m=createIntegerCordDamageModel(p,CORD_ID,c);
 reject(()=>m.restore({...old.start(),schema:'prototype-coir-cord-damage/2'}));
 reject(()=>old.restore(m.start() as any));
 const e={kind:'load' as const,clock:'world' as const,eventId:'load',worldId:c.worldId,worldEpoch:c.worldEpoch,runId:c.runId,atMs:1000,gf:100000};
 const equal=m.commit(m.start(),e);assert.equal(m.project(equal).status,'intact');
 const s=m.commit(m.start(),{...e,gf:100001}),parts=m.project(s).pieces;
 assert.equal(parts.reduce((a,b)=>a+b.lengthMm,0),p.lengthMm);
 assert.equal(parts.reduce((a,b)=>a+b.fiberDryMg,0),p.fiberDryMg);
 assert.deepEqual(m.commit(m.restore(json(s)),{...e,gf:100001}),s);
});
test('assumption ID, real source material, proper clocks and confirmed work are mandatory',()=>{
 const i:SailManufactureInput={operation:'harvest',source:leaves()};
 reject(()=>createSailManufacturingModel(i,undefined as any,ctx('harvest')));
 reject(()=>createSailManufacturingModel(i,'default',ctx('harvest')));
 reject(()=>createSailManufacturingModel(i,ID,ctx('dry')));
 reject(()=>make({operation:'harvest',source:leaves('pandanus_leaves')}));
 const a=make(i);reject(()=>a.m.commit(a.m.start(),{...receipt(a.c,1000,2000),attendance:'absent'} as any));
 reject(()=>make({operation:'dry',source:leaves('pandanus_leaves'),roofed:false} as any));
});
test('standard leaves close through harvesting, drying, splitting and weaving a two-square-metre sail',()=>{
 const h=make({operation:'harvest',source:leaves()},'harvest').at(1800000);
 const d=make({operation:'dry',source:h.material as PlantMass,roofed:true},'dry').at(172800000);
 const s=make({operation:'split',source:d.material as PlantMass},'split').at(5400000);
 const w=make({operation:'weave',source:s.material as PlantMass,requestedAreaCm2:20000},'weave').at(14400000);
 assert.equal(h.product.dryMg,1000000);assert.equal(d.releasedWaterMg,1800000);
 assert.deepEqual(s.scrap&&{dryMg:s.scrap.dryMg,waterMg:s.scrap.waterMg},{dryMg:100000,waterMg:20000});
 assert.equal(mass(w.material!),1080000n);assert.equal(mass(w.material!)+mass(s.scrap!)+BigInt(d.releasedWaterMg),3000000n);
 assert.equal(1800000+5400000+14400000,21600000);
 assert.equal((w.material as SailMat).areaCm2,20000);assert.ok((w.material as SailMat).baseStrengthGf>=51000&&(w.material as SailMat).baseStrengthGf<=69000);
});
test('drying never adds water and incomplete materials do not enter later stages',()=>{
 const dry=make({operation:'dry',source:leaves('pandanus_leaves',100,10),roofed:true}).at(0);assert.equal(dry.product.waterMg,10);
 reject(()=>make({operation:'split',source:leaves('pandanus_leaves')}));
 reject(()=>make({operation:'weave',source:leaves('pandanus_leaves',900000,180000),requestedAreaCm2:20000}));
 reject(()=>make({operation:'weave',source:leaves('pandanus_strips',899999,0),requestedAreaCm2:20000}));
 reject(()=>make({operation:'weave',source:leaves('pandanus_strips',900000,180000),requestedAreaCm2:0}));
});
test('partial leaf allocations conserve each component and retain reusable remainder',()=>{
 for(const op of ['harvest','split','weave'] as const)for(const t of [1,719,720,1000,123456]){
  const input:SailManufactureInput=op==='harvest'?{operation:op,source:leaves()}:op==='split'?{operation:op,source:leaves('pandanus_leaves',1000000,200000)}:{operation:op,source:leaves('pandanus_strips',900000,180000),requestedAreaCm2:10000};
  const p=make(input).at(t),src=input.source,other=p.remaining??p.scrap!;
  assert.equal(p.product.dryMg+other.dryMg,src.dryMg);assert.equal(p.product.waterMg+other.waterMg,src.waterMg);
  assert.equal(p.material,null);assert.ok(p.product.dryMg>=0&&other.waterMg>=0);
 }
});
test('mast cutting needs sufficient long bamboo and returns the exact unused length and mass',()=>{
 const a=make({operation:'mast',source:{...leaves('bamboo',3000000,900000),lengthMm:3000}},'mast');
 const p=a.at(600000);assert.equal(p.material!.dryMg,2500000);assert.equal(p.material!.waterMg,750000);
 assert.equal((p.material as BambooMast).lengthMm,2500);assert.equal(p.remaining!.lengthMm,500);
 assert.equal(mass(p.material!)+mass(p.remaining!),3900000n);
 assert.ok((p.material as BambooMast).baseStrengthGf>=36000&&(p.material as BambooMast).baseStrengthGf<=44000);
 reject(()=>make({operation:'mast',source:{...leaves('bamboo',3000000,0),lengthMm:2400}}));
 reject(()=>make({operation:'mast',source:{...leaves('bamboo',2000000,0),lengthMm:3000}}));
});
test('rigging encapsulates all chosen pieces without consuming excess cord invisibly',()=>{
 const r=rig(),input:SailManufactureInput={operation:'rig',hull:r.hull,mat:r.mat,mast:r.mast,cords:[cord('a',5000),cord('b',5000)]};
 const p=make(input,'rigging').at(1800000);assert.equal(p.rig!.cords.reduce((n,p)=>n+p.lengthMm,0),10000);
 assert.equal(allMass(p.rig!),allMass({...r,cords:input.cords}));
 reject(()=>make({...input,cords:[cord('short',7999)]}));
 reject(()=>make({...input,cords:[cord('same',4000),cord('same',4000)]}));
 reject(()=>make({...input,cords:[cord('long',8000),{...cord('tiny',1),fiberDryMg:1}]}));
 reject(()=>make({...input,mat:{...r.mat,torn:true}}));
});
test('manufacturing partitions, pauses, JSON and durable replay match lumped work',()=>{
 const r=rig();
 const inputs:SailManufactureInput[]=[
 {operation:'harvest',source:leaves()},{operation:'dry',source:leaves('pandanus_leaves'),roofed:true},
 {operation:'split',source:leaves('pandanus_leaves',1000000,200000)},
 {operation:'weave',source:leaves('pandanus_strips',900000,180000),requestedAreaCm2:20000},
 {operation:'mast',source:{...leaves('bamboo',2000000,300000),lengthMm:2500}},
 {operation:'rig',hull:r.hull,mat:r.mat,mast:r.mast,cords:r.cords}];
 for(const input of inputs){
  const a=make(input),duration=a.at(0).requiredMs,split=Math.floor(duration/3);
  const first=receipt(a.c,1000,1000+split,'one'),s=a.m.commit(a.m.start(),first);
  const final=a.m.commit(a.m.restore(json(s)),receipt(a.c,1000+split+999,1000+duration+999,'two'));
  assert.deepEqual(a.m.project(final),a.at(duration));assert.deepEqual(a.m.commit(final,first),final);
  reject(()=>a.m.commit(final,{...first,attendance:'absent'} as any));
 }
});
test('seed, run and source lot affect quality; observations never reveal it',()=>{
 const i:SailManufactureInput={operation:'weave',source:leaves('pandanus_strips',900000,180000),requestedAreaCm2:20000};
 const a=make(i,'a',10),b=make(i,'b',10),q=make({...i,source:{...i.source,lotId:'other'}},'a',10);
 const strengths=[a.at(14400000),b.at(14400000),q.at(14400000)].map(p=>(p.material as SailMat).baseStrengthGf);
 assert.ok(new Set(strengths).size>1);assert.deepEqual(a.at(14400000),make(i,'a',10).at(14400000));
 const words=a.m.observe(a.m.commit(a.m.start(),receipt(a.c,1000,14401000)));
 assert.ok(words.every(s=>!/[0-9]|gf|seed|係数|強さ/.test(s)));
});
test('sail storage wear is monotone, partition invariant and rain equals sun',()=>{
 const p=mat(),m=createSailWearModel(p,ID,1000),year=R.yearIslandMs;
 const sun=m.commit(m.start(),{eventId:'s',fromIslandMs:1000,toIslandMs:1000+year,mode:'sun'});
 const rain=m.commit(m.start(),{eventId:'r',fromIslandMs:1000,toIslandMs:1000+year,mode:'rain'});
 const shade=m.commit(m.start(),{eventId:'d',fromIslandMs:1000,toIslandMs:1000+10*year,mode:'shade'});
 assert.equal(sailStrength(m.project(sun)),30000);assert.equal(sailStrength(m.project(rain)),30000);assert.equal(sailStrength(m.project(shade)),30000);
 let s=m.start(),last=60000;
 for(let i=0;i<100;i++){s=m.commit(s,{eventId:'e'+i,fromIslandMs:1000+i*year/100,toIslandMs:1000+(i+1)*year/100,mode:'sun'});const strength=sailStrength(m.project(s));assert.ok(strength<=last);last=strength;}
 assert.deepEqual(m.project(s).damage,m.project(sun).damage);assert.equal(mass(m.project(s)),mass(p));
 assert.deepEqual(m.commit(m.restore(json(sun)),{eventId:'s',fromIslandMs:1000,toIslandMs:1000+year,mode:'sun'}),sun);
});
test('integer equilibrium satisfies both sides of the exact drag inequality',()=>{
 for(const area of [1,200,20000,100000,4000000])for(const angle of [0,1,30,60,61,90])for(const wind of [0,1,100,1000,5000,10000,20000]){
  const v=equilibriumSpeedMmS(wind,area,angle);if(angle>60){assert.equal(v,0);continue;}
  const a=9n*BigInt(area)*BigInt(cosDeg(angle)),b=19218750n*1000000n,W=BigInt(wind),V=BigInt(v);
  assert.ok(b*V*V<=a*(W-V)*(W-V));
  if(v<wind)assert.ok(b*(V+1n)*(V+1n)>a*(W-V-1n)*(W-V-1n));
 }
 assert.equal(equilibriumSpeedMmS(5000,20000,0),441);assert.equal(equilibriumSpeedMmS(10000,20000,0),882);
 assert.equal(equilibriumSpeedMmS(5000,20000,30),413);assert.equal(equilibriumSpeedMmS(5000,20000,60),320);
 let prev=0;for(let w=0;w<=20000;w+=17){const v=equilibriumSpeedMmS(w,20000,0);assert.ok(v>=prev);prev=v;}
});
test('force estimates distinguish a stationary sail from apparent wind at equilibrium',()=>{
 assert.equal(sailForceGf(20000,5000),3670);assert.equal(sailForceGf(20000,10000),14683);
 assert.equal(sailForceGf(20000,7000-441),6317);assert.equal(sailForceGf(20000,14000-882),25268);
 assert.equal(sailForceGf(20000,18000-441),45273);
});
test('standard cell moves at equilibrium and records measured or assumed gust provenance',()=>{
 const r=rig(),m=createSailRaftVoyage(r,ID,vc),s=m.commit(m.start(),cell()),p=m.project(s);
 assert.equal(p.distance.eastMm,13230);assert.equal(p.distance.northMm,0);assert.equal(p.distance.sidewaysMm,0);
 assert.equal(p.trace[0].speedMmS,441);assert.equal(p.trace[0].forceGf,6317);assert.equal(p.maxLoads[2].gf,12634);
 const measured=m.project(m.commit(m.start(),cell(0,{gustMmS:7000})));
 assert.deepEqual(measured.distance,p.distance);assert.equal(measured.trace[0].gustSource,'measured');
 assert.equal(allMass(p.rig),allMass(r));
});
test('reefed sail and headings beyond the sector drift but have no powered motion',()=>{
 for(const patch of [{sailUp:false},{headingDeg:61},{headingDeg:180}]){
  const m=createSailRaftVoyage(rig(),ID,vc),p=m.project(m.commit(m.start(),cell(0,patch)));
  assert.equal(p.trace[0].powered,false);assert.equal(p.distance.eastMm,3000);
  if(patch.sailUp===false){assert.equal(p.maxLoads[0].gf,0);assert.equal(p.cordEvents.length,0);}
 }
 const m=createSailRaftVoyage(rig(),ID,vc),p=m.project(m.commit(m.start(),cell(0,{sailUp:false,windToDeg:90})));
 assert.equal(p.distance.northMm,3000);assert.equal(p.distance.eastMm,0);assert.equal(p.distance.sidewaysMm,3000);
});
test('sail and mast fail only above the quantized load, never at equality',()=>{
 const load=25268;
 for(const part of ['mat','mast'] as const)for(const diff of [0,-1]){
  const r=rig();r[part].baseStrengthGf=load+diff;
  const m=createSailRaftVoyage(r,ID,vc),p=m.project(m.commit(m.start(),cell(0,{windMmS:10000,gustMmS:14000})));
  assert.equal(p.broken.some(b=>b.part===(part==='mat'?'sail':'mast')),diff<0);
 }
});
test('cord equality and fracture are decided by the PR21 integer damage model',()=>{
 for(const strength of [50536,50535]){
  const r=rig();r.cords=[cord('line',8000,strength)];
  const m=createSailRaftVoyage(r,ID,vc),p=m.project(m.commit(m.start(),cell(0,{windMmS:10000,gustMmS:14000})));
  const cm=createIntegerCordDamageModel(r.cords[0],CORD_ID,cordVoyageContext(vc,'line'));let s=cm.start();
  for(const e of p.cordEvents)s=cm.commit(s,e.event);
  assert.deepEqual(p.rig.cords,cm.project(s).pieces);
  assert.equal(p.broken.some(b=>b.part==='cord'),strength===50535);assert.equal(allMass(p.rig),allMass(r));
 }
});
test('all simultaneous overloads are retained in deterministic margin order, then propulsion stops',()=>{
 const r=rig();r.mat.baseStrengthGf=40000;r.mast.baseStrengthGf=30000;r.cords=[cord('line',8000,80000)];
 const m=createSailRaftVoyage(r,ID,vc),s=m.commit(m.start(),[cell(0,{gustMmS:18000}),cell(1)]),p=m.project(s);
 assert.deepEqual(p.broken.map(b=>b.part),['mast','cord','sail']);
 assert.equal(p.distance.eastMm,6000);assert.ok(p.trace.every(t=>!t.powered));
 assert.equal(p.rig.cords.length,2);assert.equal(allMass(p.rig),allMass(r));
 assert.ok(m.observe(s).some(s=>s.includes('縄が切れ')));assert.ok(m.observe(s).some(s=>s.includes('マストが折れ')));
});
test('world sailing and island wear use explicit different intervals and rain is counted once',()=>{
 const m=createSailRaftVoyage(rig(),ID,vc),p=m.project(m.commit(m.start(),cell(0,{toIslandMs:vc.openedAtIslandMs+720000,rain:true})));
 assert.equal(p.distance.eastMm,13230);assert.equal(p.rig.mat.damage.rainMs,720000);assert.equal(p.rig.mat.damage.sunMs,0);
 assert.equal(p.rig.cords[0].damage.sunMs,720000);assert.equal(p.sailExposures.length,1);
});
test('an hour emits one abrasion per cord and external PR21 replay has the same outcome',()=>{
 const r=rig(),m=createSailRaftVoyage(r,ID,vc),cells=Array.from({length:120},(_,i)=>cell(i)),p=m.project(m.commit(m.start(),cells));
 assert.equal(p.sailingMs,3600000);assert.equal(p.rig.cords[0].damage.abrasions,1);
 const cm=createIntegerCordDamageModel(r.cords[0],CORD_ID,cordVoyageContext(vc,r.cords[0].lotId));let cs=cm.start();
 for(const e of p.cordEvents)cs=cm.commit(cs,e.event);
 assert.deepEqual(cm.project(cs).pieces,p.rig.cords);assert.equal(p.distance.eastMm,1587600);
});
test('cell batches, JSON restoration and replay are exactly identical',()=>{
 const r=rig(),cells=Array.from({length:12},(_,i)=>cell(i,{headingDeg:i%3===0?30:0,windToDeg:i%4===0?90:0,rain:i%2===0}));
 const m=createSailRaftVoyage(r,ID,vc),all=m.commit(m.start(),cells);let s=m.start();
 for(const c of cells)s=m.commit(m.restore(json(s)),c);
 assert.deepEqual(s,all);assert.deepEqual(m.project(s),m.project(all));
 assert.deepEqual(m.commit(s,cells),s);
 reject(()=>m.commit(s,{...cells[0],windMmS:6000}));
 const before=json(s);m.observe(s);assert.deepEqual(s,before);
});
test('drift fractional distance is accumulated before signed rounding, with a fixed world basis',()=>{
 const m=createSailRaftVoyage(rig(),ID,vc),cells=Array.from({length:100},(_,i)=>cell(i,{windMmS:1,gustMmS:null,windToDeg:180,sailUp:false}));
 const p=m.project(m.commit(m.start(),cells));assert.equal(p.distance.eastMm,-60);assert.equal(p.distance.northMm,0);
 assert.equal(p.distance.alongHeadingMm,-60);
 const turning=[cell(0,{sailUp:false}),cell(1,{sailUp:false,headingDeg:90})],t=m.project(m.commit(m.start(),turning));
 assert.equal(t.distance.eastMm,6000);assert.equal(t.distance.northMm,0);
});
test('missing weather, unconfirmed or off-cell clocks, wrong worlds and absent crew reject',()=>{
 const m=createSailRaftVoyage(rig(),ID,vc),start=m.start();
 const bad:any[]=[{windMmS:undefined},{windMmS:NaN},{windMmS:-1},{headingDeg:0.5},{windToDeg:360},{gustMmS:4999},
 {aboard:false},{worldId:'other'},{fromWorldMs:1001},{toWorldMs:30999},{confirmedAtWorldMs:30000},
 {fromIslandMs:0},{toIslandMs:10000},{rain:null}];
 for(const patch of bad)reject(()=>m.commit(start,cell(0,patch)));
 reject(()=>m.commit(start,cell(1)));assert.deepEqual(start,m.start());
 reject(()=>m.restore({...start,binding:'other'}));reject(()=>createSailRaftVoyage(rig(),'default',vc));
});
test('all resident observations are words and never export world force, strength or travel numbers',()=>{
 const m=createSailRaftVoyage(rig(),ID,vc),s=m.commit(m.start(),[cell(),cell(1,{sailUp:false})]);
 for(const text of m.observe(s))assert.ok(!/[0-9]|mm|kg|gf|速度|距離|係数|seed|強度/.test(text));
 assert.ok(m.observe(s).some(s=>s.includes('たたまれ')));
});
test('defensive copies protect inputs and returned hidden projections',()=>{
 const r=rig(),m=createSailRaftVoyage(r,ID,vc),c=cell(),s=m.commit(m.start(),c),p=m.project(s);
 c.windMmS=999;r.mat.baseStrengthGf=0;p.rig.mat.damage.sunMs=999999;
 assert.equal(m.project(s).trace[0].speedMmS,441);assert.equal(m.project(s).rig.mat.damage.sunMs,30000);
});
console.log('PASS sail raft science: '+groups+' groups; isolated owner-assumed integer model.');
