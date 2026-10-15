import assert from 'node:assert/strict';
import {createManualHuskSeparation, type WetUnseparatedHusk, type ManualSeparationTestProfile,
 type ConfirmedManualInterval, type ManualSeparationState} from '../src/science/prototypes/manual-husk-separation';
import {MANUAL_HUSK_ASSUMPTION, createManualHuskAssumptionProfile} from '../src/science/prototypes/manual-husk-assumptions';
const input: WetUnseparatedHusk={materialId:'wet_unseparated_coconut_husk',lotId:'wet-husk:fixture',separation:'never-separated',dryMg:1003,waterMg:997,
 soakHistory:[{recordId:'soak-record',runId:'prior-soak',fromWorldMs:100,toWorldMs:900}]};
const context={worldId:'fixture',worldEpoch:'1',runId:'manual:1',openedAtWorldMs:1000};
const knot=(workMs:number,fiberDryMg=0,attachedPithDryMg=0,fiberWaterMg=0,attachedPithWaterMg=0,dischargedWaterMg=0)=>
 ({workMs,fiberDryMg,attachedPithDryMg,fiberWaterMg,attachedPithWaterMg,dischargedWaterMg});
// Arbitrary millisecond/mg arithmetic examples, NOT empirical productivity/kinetics.
const profile: ManualSeparationTestProfile={kind:'uncalibrated-test-profile',profileId:'integer-audit-only',
 knots:[knot(0),knot(7,111,41,73,17,83),knot(13,257,91,177,39,211),knot(23,401,103,251,53,307)]};
const model=createManualHuskSeparation(input,profile,context);
const interval=(confirmationId:string,fromWorldMs:number,toWorldMs:number): ConfirmedManualInterval=>
 ({kind:'host-confirmed-manual-work',confirmationId,...{worldId:context.worldId,worldEpoch:context.worldEpoch,runId:context.runId},actorId:'fixture-worker',attendance:'present',operation:'separate-wet-husk',fromWorldMs,toWorldMs,confirmedAtWorldMs:toWorldMs});
function audit(s:ManualSeparationState,dry=input.dryMg,water=input.waterMg) {
 const p=s.pools;
 for(const bucket of [p.fiber,p.attachedPith,p.residualHusk])for(const x of Object.values(bucket))assert.ok(Number.isSafeInteger(x)&&x>=0);
 assert.ok(Number.isSafeInteger(p.dischargedWaterMg)&&p.dischargedWaterMg>=0);
 assert.equal(BigInt(p.fiber.dryMg)+BigInt(p.attachedPith.dryMg)+BigInt(p.residualHusk.dryMg),BigInt(dry));
 assert.equal(BigInt(p.fiber.waterMg)+BigInt(p.attachedPith.waterMg)+BigInt(p.residualHusk.waterMg)+BigInt(p.dischargedWaterMg),BigInt(water));
}
let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
const rejects=(fn:()=>unknown)=>assert.throws(fn,/manual husk:/);
test('explicit partial partition and separate dry/water balances',()=>{
 const start=model.start(),before=JSON.stringify(start),s=model.commit(start,interval('first',1000,1003));
 assert.equal(JSON.stringify(start),before);audit(s);
 assert.deepEqual(s.pools,{fiber:{dryMg:47,waterMg:31},attachedPith:{dryMg:17,waterMg:7},residualHusk:{dryMg:939,waterMg:924},dischargedWaterMg:35});
});
test('pause/absence gaps contribute no work; partial save resumes',()=>{
 let s=model.commit(model.start(),interval('a',1000,1003));
 const saved=JSON.parse(JSON.stringify(s));s=model.restore(saved);
 s=model.commit(s,interval('b',1_000_000,1_000_007));audit(s);assert.equal(s.totalWorkMs,10);
 assert.deepEqual(s.pools,{fiber:{dryMg:184,waterMg:125},attachedPith:{dryMg:66,waterMg:28},residualHusk:{dryMg:753,waterMg:697},dischargedWaterMg:147});
 assert.deepEqual(model.project(s),model.project(model.commit(model.start(),interval('all',1000,1010))));
});
test('all single split points and 1ms chunks match lumped work, including profile exhaustion',()=>{
 for(let end=1;end<=40;end++){
  const whole=model.commit(model.start(),interval('whole',1000,1000+end));audit(whole);
  for(let split=1;split<end;split++){
   let s=model.commit(model.start(),interval('a',1000,1000+split));
   s=model.commit(model.restore(JSON.parse(JSON.stringify(s))),interval('b',1000+split,1000+end));audit(s);
   assert.deepEqual(model.project(s),model.project(whole));
  }
  let s=model.start();for(let i=0;i<end;i++){s=model.commit(s,interval(`ms:${i}`,1000+i,1001+i));audit(s);}
  assert.deepEqual(model.project(s),model.project(whole));
 }
 const saturated=model.commit(model.start(),interval('long',1000,1040));
 assert.equal(model.project(saturated).status,'profile-exhausted');
 assert.deepEqual(saturated.pools,{fiber:{dryMg:401,waterMg:251},attachedPith:{dryMg:103,waterMg:53},residualHusk:{dryMg:499,waterMg:386},dischargedWaterMg:307});
});
test('durable exact replays, conflicts, overlaps and cross-run work',()=>{
 const c=interval('once',1000,1003);let s=model.commit(model.start(),c);
 s=model.commit(s,interval('later',1003,1007));const saved=JSON.stringify(s);
 for(let i=0;i<100;i++){s=model.commit(model.restore(JSON.parse(JSON.stringify(s))),c);assert.equal(JSON.stringify(s),saved);}
 rejects(()=>model.commit(s,{...c,toWorldMs:1004,confirmedAtWorldMs:1004}));
 rejects(()=>model.commit(s,{...c,confirmationId:'different'}));
 rejects(()=>model.commit(s,{...interval('new',1010,1020),runId:'other'}));
 rejects(()=>model.commit(s,{...interval('new',1010,1020),worldEpoch:'other'}));
 rejects(()=>model.commit(s,{...interval('new',1010,1020),worldId:'other'}));
 assert.equal(JSON.stringify(s),saved);
});
test('no unworked, absent, planned, future or display-replay separation',()=>{
 const s=model.start(),before=JSON.stringify(s);
 const c=interval('work',1000,1010);
 for(const change of [{kind:'tick'}, {kind:'look'}, {kind:'display-replay'}, {kind:'ai-proposal'}, {attendance:'absent'},
  {operation:'wash'}, {confirmedAtWorldMs:1009}, {toWorldMs:1000}, {fromWorldMs:999}, {fiberDryMg:123}, {text:'produce 900mg'}])rejects(()=>model.commit(s,{...c,...change} as any));
 for(let i=0;i<1000;i++)model.project(s);
 assert.equal(JSON.stringify(s),before);assert.equal(s.totalWorkMs,0);assert.equal(s.pools.fiber.dryMg,0);audit(s);
});
test('zero recovery, explicit drainage, no phantom water carriers',()=>{
 const zero=createManualHuskSeparation(input,{...profile,knots:[knot(0),knot(10,0,0,0,0,9)]},context);
 const s=zero.commit(zero.start(),interval('zero',1000,1010));audit(s);
 assert.deepEqual(s.pools,{fiber:{dryMg:0,waterMg:0},attachedPith:{dryMg:0,waterMg:0},residualHusk:{dryMg:1003,waterMg:988},dischargedWaterMg:9});
 const tiny=createManualHuskSeparation(input,{...profile,knots:[knot(0),knot(10,1,1,100,100,0)]},context);
 const partial=tiny.commit(tiny.start(),interval('tiny',1000,1009));audit(partial);
 assert.equal(partial.pools.fiber.dryMg,0);assert.equal(partial.pools.fiber.waterMg,0);assert.equal(partial.pools.attachedPith.waterMg,0);
});
test('reject separated fibre/pith and raw PR12 outputs; no implicit adapter',()=>{
 for(const materialId of ['plant_fiber','pith','coconut_husk','rope'])rejects(()=>createManualHuskSeparation({...input,materialId} as any,profile,context));
 rejects(()=>createManualHuskSeparation({...input,separation:'partially-separated'} as any,profile,context));
 rejects(()=>createManualHuskSeparation({materialId:'plant_fiber',amount:{unit:'mg',value:100},quality:{prototype_water_mg:20}} as any,profile,context));
 for(const change of [{waterMg:0},{waterMg:NaN},{dryMg:-1},{dryMg:1.5},{dryMg:Number.MAX_SAFE_INTEGER},{softened:true}])rejects(()=>createManualHuskSeparation({...input,...change} as any,profile,context));
});
test('soak history is provenance only, no readiness or temperature multiplier',()=>{
 const other=createManualHuskSeparation({...input,soakHistory:[]},profile,context);
 const c=interval('same',1000,1013);
 assert.deepEqual(other.commit(other.start(),c).pools,model.commit(model.start(),c).pools);
 rejects(()=>createManualHuskSeparation({...input,temperatureC:28} as any,profile,context));
 rejects(()=>createManualHuskSeparation(input,{...profile,temperatureMultiplier:2} as any,context));
 const v=model.project(model.start());assert.equal((v as any).ready,undefined);assert.equal((v as any).eta,undefined);
});
test('required, bounded, monotone profile; no hidden defaults',()=>{
 rejects(()=>createManualHuskSeparation(input,undefined,context));
 for(const change of [{kind:'calibrated'}, {knots:[]}, {knots:[knot(0)]}, {knots:[knot(0,1),knot(10,2)]},
  {knots:[knot(0),knot(10,1004)]}, {knots:[knot(0),knot(10,10,0,998)]}, {knots:[knot(0),knot(1,0,1)]},
  {knots:[knot(0),knot(2,10),knot(3,9)]}, {knots:[knot(0),knot(0)]}, {knots:[knot(0),knot(NaN)]}])rejects(()=>createManualHuskSeparation(input,{...profile,...change} as any,context));
});
test('save/accounting corruption and changed input/profile rejected; key order preserved semantically',()=>{
 const s=model.commit(model.start(),interval('a',1000,1007));
 for(const mutate of [(x:any)=>x.pools.fiber.dryMg++, (x:any)=>x.totalWorkMs++, (x:any)=>x.lastToWorldMs++,
  (x:any)=>x.confirmedIntervals.push(x.confirmedIntervals[0]), (x:any)=>x.confirmedIntervals[0].attendance='absent',
  (x:any)=>x.schema='future', (x:any)=>x.extra='ignored?', (x:any)=>x.binding='other']){
  const bad=structuredClone(s);mutate(bad);rejects(()=>model.restore(bad));
 }
 const reversed=Object.fromEntries(Object.entries(s).reverse());assert.deepEqual(model.restore(reversed),s);
 rejects(()=>createManualHuskSeparation({...input,lotId:'other'},profile,context).restore(s));
 rejects(()=>createManualHuskSeparation(input,{...profile,profileId:'other'},context).restore(s));
 rejects(()=>createManualHuskSeparation(input,profile,{...context,runId:'other'}).restore(s));
});
test('defensive copies and safe large integer arithmetic',()=>{
 const h=structuredClone(input),p=structuredClone(profile),c=structuredClone(context),m=createManualHuskSeparation(h,p,c);
 h.dryMg=1;p.knots[1].fiberDryMg=0;c.runId='changed';
 let s=m.commit(m.start(),interval('a',1000,1007));assert.equal(s.pools.fiber.dryMg,111);
 const view=m.project(s);view.pools.fiber.dryMg=0;view.soakHistory.length=0;assert.equal(s.pools.fiber.dryMg,111);
 const large={...input,dryMg:Number.MAX_SAFE_INTEGER-10,waterMg:10};
 const big=createManualHuskSeparation(large,{...profile,knots:[knot(0),knot(3,large.dryMg,0,5,0,5)]},context);
 s=big.commit(big.start(),interval('big',1000,1002));audit(s,large.dryMg,10);
 assert.equal(s.pools.fiber.dryMg,Number(BigInt(large.dryMg)*2n/3n));
});

test('owner assumption is a versioned explicit opt-in, not an implicit default',()=>{
 assert.equal(MANUAL_HUSK_ASSUMPTION.evidence,'owner-assumption-not-calibrated');
 assert.ok(Object.isFrozen(MANUAL_HUSK_ASSUMPTION) && Object.isFrozen(MANUAL_HUSK_ASSUMPTION.knots)
  && MANUAL_HUSK_ASSUMPTION.knots.every(Object.isFrozen));
 const h={...input,dryMg:300000,waterMg:600000};
 const p=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
 assert.equal(p.kind,'uncalibrated-test-profile');
 assert.deepEqual(p.knots,[
  knot(0),knot(60000,36000,7200,36000,21600,90000),
  knot(120000,58000,11600,58000,34800,140000),
  knot(240000,72000,14400,72000,43200,180000),
 ]);
 rejects(()=>createManualHuskAssumptionProfile(h,undefined));
 rejects(()=>createManualHuskAssumptionProfile(h,'guess-a-recipe' as any));
 rejects(()=>createManualHuskSeparation(h,undefined,context));
});
test('assumed standard husk has declining recovery and exact dry/water balances',()=>{
 const h={...input,dryMg:300000,waterMg:600000};
 const m=createManualHuskSeparation(h,createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id),context);
 const at=(t:number)=>m.commit(m.start(),interval('at',1000,1000+t));
 assert.deepEqual(at(90000).pools,{fiber:{dryMg:47000,waterMg:47000},attachedPith:{dryMg:9400,waterMg:28200},
  residualHusk:{dryMg:243600,waterMg:409800},dischargedWaterMg:115000});
 assert.deepEqual(at(240000).pools,{fiber:{dryMg:72000,waterMg:72000},attachedPith:{dryMg:14400,waterMg:43200},
  residualHusk:{dryMg:213600,waterMg:304800},dischargedWaterMg:180000});
 const amounts=[at(60000).pools.fiber.dryMg,at(120000).pools.fiber.dryMg,at(240000).pools.fiber.dryMg];
 assert.ok(amounts[0]/60000>(amounts[1]-amounts[0])/60000);
 assert.ok((amounts[1]-amounts[0])/60000>(amounts[2]-amounts[1])/120000);
 assert.equal(m.project(at(239999)).status,'partial-or-unworked');
 assert.equal(m.project(at(240000)).status,'profile-exhausted');
 assert.deepEqual(at(900000).pools,at(240000).pools);
 for(const t of [1,59999,60000,60001,119999,120000,120001,239999,240000,240001])audit(at(t),h.dryMg,h.waterMg);
});
test('dry-mass scaling covers half, double and non-integral standard equivalents',()=>{
 // Literal expectations supplied independently of the helper calculation.
 const cases=[
  {dry:150000,water:300000,end:120000,f:36000,p:7200,fw:36000,pw:21600,d:90000,rd:106800,rw:152400},
  {dry:600000,water:1200000,end:480000,f:144000,p:28800,fw:144000,pw:86400,d:360000,rd:427200,rw:609600},
  {dry:300001,water:600002,end:240001,f:72000,p:14400,fw:72000,pw:43200,d:180000,rd:213601,rw:304802},
 ];
 for(const x of cases){
  const h={...input,dryMg:x.dry,waterMg:x.water},p=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
  assert.equal(p.knots.at(-1)!.workMs,x.end);
  const m=createManualHuskSeparation(h,p,context),s=m.commit(m.start(),interval('end',1000,1000+x.end));
  audit(s,h.dryMg,h.waterMg);
  assert.deepEqual(s.pools,{fiber:{dryMg:x.f,waterMg:x.fw},attachedPith:{dryMg:x.p,waterMg:x.pw},
   residualHusk:{dryMg:x.rd,waterMg:x.rw},dischargedWaterMg:x.d});
 }
});
test('assumed retention never invents water and extra input water remains residual',()=>{
 for(const water of [295200,295201,600000,600001]){
  const h={...input,dryMg:300000,waterMg:water},m=createManualHuskSeparation(h,createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id),context);
  const s=m.commit(m.start(),interval('end',1000,241000));audit(s,h.dryMg,h.waterMg);
  assert.equal(s.pools.residualHusk.waterMg,water-295200);
  assert.equal(s.pools.fiber.dryMg,72000);
 }
 rejects(()=>createManualHuskAssumptionProfile({...input,dryMg:300000,waterMg:295199},MANUAL_HUSK_ASSUMPTION.id));
 for(const bad of [{dryMg:0},{dryMg:-1},{dryMg:0.5},{waterMg:0},{waterMg:NaN},{waterMg:Infinity},
  {dryMg:Number.MAX_SAFE_INTEGER},{dryMg:Number.MAX_SAFE_INTEGER+1}]){
  rejects(()=>createManualHuskAssumptionProfile({...input,...bad},MANUAL_HUSK_ASSUMPTION.id));
 }
});
test('tiny audit lots coalesce millisecond knots without phantom carriers or nonmonotone outputs',()=>{
 for(let dry=1;dry<=128;dry++){
  const h={...input,dryMg:dry,waterMg:2*dry},p=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
  assert.ok(p.knots.length>=2);
  assert.equal(p.knots[0].workMs,0);
  p.knots.slice(1).forEach((k,i)=>assert.ok(k.workMs>p.knots[i].workMs));
  const m=createManualHuskSeparation(h,p,context);
  let previous=[0,0,0,0,0];
  for(let t=1;t<=p.knots.at(-1)!.workMs+1;t++){
   const s=m.commit(m.start(),interval('at',1000,1000+t));audit(s,h.dryMg,h.waterMg);
   const q=s.pools,now=[q.fiber.dryMg,q.attachedPith.dryMg,q.fiber.waterMg,q.attachedPith.waterMg,q.dischargedWaterMg];
   now.forEach((v,i)=>assert.ok(v>=previous[i]));previous=now;
   if(!q.fiber.dryMg)assert.deepEqual([q.attachedPith.dryMg,q.fiber.waterMg,q.attachedPith.waterMg],[0,0,0]);
   if(!q.attachedPith.dryMg)assert.equal(q.attachedPith.waterMg,0);
  }
 }
 const h={...input,dryMg:10,waterMg:20},m=createManualHuskSeparation(h,createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id),context);
 assert.deepEqual(m.commit(m.start(),interval('end',1000,1008)).pools,{
  fiber:{dryMg:2,waterMg:2},attachedPith:{dryMg:0,waterMg:0},residualHusk:{dryMg:8,waterMg:12},dischargedWaterMg:6,
 });
});
test('assumed profiles agree across off-knot partitions, pauses, JSON restore and durable replay',()=>{
 for(const dry of [5,20,1003,150000,300000,300001,600000]){
  const h={...input,dryMg:dry,waterMg:dry*2},p=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
  const m=createManualHuskSeparation(h,p,context),end=p.knots.at(-1)!.workMs+13;
  const whole=m.project(m.commit(m.start(),interval('whole',1000,1000+end)));
  const schedules=dry<=20?[[1],[3,1,7]]:[[737],[29000],[59999,2,60000,17,120001]];
  for(const schedule of schedules){
   let s=m.start(),work=0,cursor=1000,i=0;
   while(work<end){
    const dt=Math.min(schedule[i%schedule.length],end-work),c=interval('piece:'+i,cursor,cursor+dt);
    s=m.commit(s,c);audit(s,h.dryMg,h.waterMg);work+=dt;cursor+=dt;
    if(i%7===0){
     const fresh=createManualHuskSeparation(structuredClone(h),createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id),{...context});
     s=fresh.restore(JSON.parse(JSON.stringify(s)));
    }
    if(i%3===0)cursor+=101; // no work during a host pause
    i++;
   }
   assert.deepEqual(m.project(s),whole);
   const saved=JSON.stringify(s);
   s=m.commit(m.restore(JSON.parse(saved)),s.confirmedIntervals[0]);
   assert.equal(JSON.stringify(s),saved);
   rejects(()=>m.commit(s,{...s.confirmedIntervals[0],actorId:'changed'}));
  }
 }
});
test('assumption profile copies, save binding and host-only projection remain explicit',()=>{
 const h={...input,dryMg:300000,waterMg:600000},p=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
 const m=createManualHuskSeparation(h,p,context),s=m.commit(m.start(),interval('a',1000,91000));
 p.knots[1].fiberDryMg=0; // returned profile is a copy, not the frozen recipe or the run
 assert.equal(m.restore(JSON.parse(JSON.stringify(s))).pools.fiber.dryMg,47000);
 assert.equal(createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id).knots[1].fiberDryMg,36000);
 for(const newInput of [{...h,dryMg:300001},{...h,waterMg:600001}]){
  const changed=createManualHuskSeparation(newInput,createManualHuskAssumptionProfile(newInput,MANUAL_HUSK_ASSUMPTION.id),context);
  rejects(()=>changed.restore(s));
 }
 const changed=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
 changed.knots[1].fiberDryMg++; // same ID cannot silently change the saved curve
 rejects(()=>createManualHuskSeparation(h,changed,context).restore(s));
 changed.knots[1].fiberDryMg--;changed.profileId+=':changed';
 rejects(()=>createManualHuskSeparation(h,changed,context).restore(s));
 const view=m.project(s),legacy=model.project(model.start());
 assert.deepEqual(Object.keys(view).sort(),Object.keys(legacy).sort());
 assert.equal(view.calibration,'uncalibrated-test-profile');
 for(const key of ['ready','eta','assumedHuskCount','residentObservation'])assert.equal((view as any)[key],undefined);
});
test('assumption scaling retains exact safe-integer arithmetic near the maximum total mass',()=>{
 const h={...input,dryMg:3002399751580330,waterMg:6004799503160660};
 const p=createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id);
 assert.equal(p.knots.at(-1)!.workMs,2401919801264264);
 const m=createManualHuskSeparation(h,p,context);
 const s=m.commit(m.start(),interval('large',1000,2401919801265264));audit(s,h.dryMg,h.waterMg);
 assert.deepEqual(s.pools,{fiber:{dryMg:720575940379279,waterMg:720575940379279},
  attachedPith:{dryMg:144115188075855,waterMg:432345564227567},
  residualHusk:{dryMg:2137708623125196,waterMg:3050438147605616},dischargedWaterMg:1801439850948198});
});

console.log(`PASS manual husk separation: ${groups} groups; dry/water conservation, partition/resume/replay, zero yield, invalid inputs and read-only invariance.`);
