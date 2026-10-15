import assert from 'node:assert/strict';
import {createManualHuskSeparation, type WetUnseparatedHusk, type ManualSeparationTestProfile,
 type ConfirmedManualInterval, type ManualSeparationState} from '../src/science/prototypes/manual-husk-separation';
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
console.log(`PASS manual husk separation: ${groups} groups; dry/water conservation, partition/resume/replay, zero yield, invalid inputs and read-only invariance.`);
