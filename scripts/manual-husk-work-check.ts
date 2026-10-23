import assert from 'node:assert/strict';
import {emptyLedger,addLot,startRun,type Ledger} from '../src/world/process-runner';
import {beginManualHuskWork,recordManualHuskSpan,projectManualHuskWork,observeManualHuskWork,MANUAL_HUSK_WORK,
 type HuskWorkSpec,type HuskExecutorSpan} from '../src/world/manual-husk-work';
import {MANUAL_HUSK_ASSUMPTION as A,createManualHuskAssumptionProfile} from '../src/science/prototypes/manual-husk-assumptions';
import {createManualHuskSeparation} from '../src/science/prototypes/manual-husk-separation';

let groups=0;
const test=(name:string,f:()=>void)=>{f();groups++;console.log('PASS '+name);};
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const rejects=(f:()=>unknown)=>assert.throws(f);
function fixture(dryMg=300000,waterMg=600000,openedAtWorldMs=1001,historyComplete=1) {
 const L=emptyLedger('world:test','epoch:1');
 const input={materialId:'wet_unseparated_coconut_husk' as const,lotId:'lot:husk',separation:'never-separated' as const,dryMg,waterMg,soakHistory:[]};
 addLot(L,{lotId:input.lotId,materialId:input.materialId,amount:{value:dryMg+waterMg,unit:'mg'},
  location:'site:work',quality:{dry_mg:dryMg,water_mg:waterMg,husk_count:1,unseparated:1,history_complete:historyComplete}});
 const spec:HuskWorkSpec={commandId:'start:husk',assumptionId:A.id,operatorId:'res:worker',huskCount:1,input,
  worksite:{locationId:'site:work',x:10,z:20,reachM:0.75},openedAtWorldMs};
 const {runId}=beginManualHuskWork(L,spec);
 return {L,spec,runId};
}
type Fixture=ReturnType<typeof fixture>;
function frame(a:Fixture,from:number,to:number,spanId='frame',changes:Partial<HuskExecutorSpan>={}):HuskExecutorSpan {
 return {kind:'executor-activity-span',spanId,worldId:a.L.world.worldId,worldEpoch:a.L.world.worldEpoch,runId:a.runId,actorId:a.spec.operatorId,
 fromWorldMs:a.spec.openedAtWorldMs+from,toWorldMs:a.spec.openedAtWorldMs+to,confirmedAtWorldMs:a.spec.openedAtWorldMs+to,
 activity:'separate-wet-husk',targetLotId:a.spec.input.lotId,targetSiteId:a.spec.worksite.locationId,arrived:true,
 fromPosition:{x:10,z:20},toPosition:{x:10,z:20},...changes};
}
function record(a:Fixture,from:number,to:number,spanId='frame',changes:Partial<HuskExecutorSpan>={}) {
 const f=frame(a,from,to,spanId,changes);return recordManualHuskSpan(a.L,a.runId,f,f.confirmedAtWorldMs);
}
const view=(a:Fixture)=>projectManualHuskWork(a.L,a.runId);
const data=(a:Fixture)=>(a.L.runs[a.runId].state!.data as any);
const holdings=(L:Ledger)=>Object.values(L.lots).map(l=>({materialId:l.materialId,amount:l.amount,quality:l.quality,location:l.location})).sort((a,b)=>a.materialId.localeCompare(b.materialId));
function unchanged(a:Fixture,f:()=>unknown) {const before=structuredClone(a.L);rejects(f);assert.deepEqual(a.L,before);}
function expectedPools(a:Fixture,work:number) {
 const m=createManualHuskSeparation(a.spec.input,createManualHuskAssumptionProfile(a.spec.input,A.id),
  {worldId:a.L.world.worldId,worldEpoch:a.L.world.worldEpoch,runId:a.runId,openedAtWorldMs:a.spec.openedAtWorldMs});
 let s=m.start();
 if(work)s=m.commit(s,{kind:'host-confirmed-manual-work',confirmationId:'oracle',worldId:a.L.world.worldId,worldEpoch:a.L.world.worldEpoch,runId:a.runId,
 actorId:a.spec.operatorId,attendance:'present',operation:'separate-wet-husk',fromWorldMs:a.spec.openedAtWorldMs,
 toWorldMs:a.spec.openedAtWorldMs+work,confirmedAtWorldMs:a.spec.openedAtWorldMs+work});
 return m.project(s).pools;
}
test('explicit assumptions and a whole single husk are mandatory; original science inputs unchanged',()=>{
 for(const change of [{assumptionId:undefined},{assumptionId:'default'},{huskCount:2},{huskCount:undefined},{input:{...fixture().spec.input,separation:'already-separated'}}]) {
  const a=fixture(),L=emptyLedger('new','new');addLot(L,{...json(a.L.lots['lot:husk']),lotId:'lot:husk'});
  delete L.lots['lot:husk'].reservedBy;
  const before=structuredClone(L);rejects(()=>beginManualHuskWork(L,{...a.spec,...change} as any));assert.deepEqual(L,before);
 }
 const a=fixture();assert.equal(a.L.runs[a.runId].clock,'world');assert.equal(a.L.lots['lot:husk'].reservedBy,a.runId);
 assert.equal(data(a).spec.assumptionId,A.id);
});
test('exact opening time and real 30-second work quanta, without future-mark delay',()=>{
 const a=fixture();assert.equal(a.L.runs[a.runId].lastTo,1001);
 record(a,0,29999,'a');assert.equal(view(a).certifiedWorkMs,0);assert.equal(view(a).pendingWorkMs,29999);
 record(a,29999,30000,'b');
 assert.equal(view(a).certifiedWorkMs,30000);assert.equal(view(a).pendingWorkMs,0);
 assert.deepEqual(view(a).pools,{fiber:{dryMg:18000,waterMg:18000},attachedPith:{dryMg:3600,waterMg:10800},
 residualHusk:{dryMg:278400,waterMg:526200},dischargedWaterMg:45000});
 assert.equal(Object.keys(a.L.lots).length,1);
});
test('rest, travel, unknown, wrong actor/target and non-arrival never certify work',()=>{
 const variants:Partial<HuskExecutorSpan>[]=[
  {activity:'rest'},{activity:'travel'},{activity:'idle'},{activity:'unknown'},{arrived:false},
  {actorId:'res:other'},{targetLotId:'lot:other'},{targetLotId:null},{targetSiteId:'site:other'},
  {fromPosition:{x:12,z:20}},{toPosition:{x:10,z:22}},
 ];
 for(const v of variants){const a=fixture();record(a,0,30000,'no-work',v);assert.equal(view(a).certifiedWorkMs,0);assert.equal(view(a).pendingWorkMs,0);}
});
test('pending real fragments cross a rest without counting the rest',()=>{
 const a=fixture();record(a,0,20000,'work1');record(a,20000,33000,'rest',{activity:'rest'});record(a,33000,43000,'work2');
 assert.equal(view(a).certifiedWorkMs,30000);assert.equal(view(a).pendingWorkMs,0);
 const intervals=data(a).science.confirmedIntervals;
 assert.deepEqual(intervals.map((r:any)=>[r.fromWorldMs-a.spec.openedAtWorldMs,r.toWorldMs-a.spec.openedAtWorldMs]),[[0,20000],[33000,43000]]);
 assert.deepEqual(view(a).pools,expectedPools(a,30000));
});
test('JSON save keeps pending work and reservation; an offline gap creates no work',()=>{
 const a=fixture();record(a,0,17000,'a');a.L=json(a.L);
 const before=structuredClone(a.L);assert.equal(view(a).pendingWorkMs,17000);assert.deepEqual(a.L,before);
 record(a,86400000,86413000,'b');
 assert.equal(view(a).certifiedWorkMs,30000);assert.equal(view(a).pendingWorkMs,0);
 assert.deepEqual(view(a).pools,expectedPools(a,30000));assert.equal(a.L.lots['lot:husk'].reservedBy,a.runId);
});
test('standard completion settles exactly once into three distinct conservative lots',()=>{
 const a=fixture();record(a,0,240000,'full');
 assert.equal(view(a).status,'completed');assert.equal(view(a).completedAtWorldMs,a.spec.openedAtWorldMs+240000);
 assert.equal(a.L.lots['lot:husk'],undefined);
 const lots=Object.values(a.L.lots);
 assert.equal(lots.length,3);assert.equal(lots.reduce((n,l)=>n+BigInt(l.amount.value),0n),900000n);
 const bundle=lots.find(l=>l.materialId==='coir_fiber_bundle')!;
 assert.equal(bundle.amount.value,201600);
 assert.deepEqual(bundle.quality,{fiber_dry_mg:72000,attached_pith_dry_mg:14400,fiber_water_mg:72000,
 attached_pith_water_mg:43200,water_mg:115200,history_complete:1});
 assert.equal(lots.find(l=>l.materialId==='partially_separated_coconut_husk')!.amount.value,518400);
 assert.equal(lots.find(l=>l.materialId==='husk_drainage_water')!.amount.value,180000);
 assert.ok(lots.every(l=>!l.reservedBy));assert.ok(!lots.some(l=>l.materialId==='process_water'));
 const incomplete=fixture(300000,600000,1001,0);record(incomplete,0,240000,'incomplete');
 assert.ok(Object.values(incomplete.L.lots).every(l=>l.quality!.history_complete===0));
});
test('one large span stops at the same actual completion time as smaller spans',()=>{
 const a=fixture(),b=fixture();record(a,0,300000,'bulk');
 record(b,0,120000,'1');record(b,120000,240000,'2');
 assert.deepEqual(view(a),view(b));assert.deepEqual(holdings(a.L),holdings(b.L));
 unchanged(b,()=>record(b,240000,300000,'past-end'));
 assert.equal(view(a).certifiedWorkMs,240000);
 assert.equal(a.L.runs[a.runId],undefined);
 // Recent exact replay receipts retain the later bulk attestation, without
 // keeping the completed science state or its per-quantum replay history.
 const records=(a.L as any).manualHuskRecords;
 assert.ok(records.receipts.every((r:any)=>JSON.parse(r.payload).confirmedAtWorldMs===a.spec.openedAtWorldMs+300000));
});
test('different capture partitions and JSON resumes preserve physical results and observations',()=>{
 const whole=fixture();record(whole,0,240000,'all');
 for(const step of [30000,29000,1000,737]){
  const a=fixture();let n=0;
  for(let t=0;t<240000;t+=step){record(a,t,Math.min(240000,t+step),'f'+n);if(n++%19===0)a.L=json(a.L);}
  assert.deepEqual(view(a),view(whole));assert.deepEqual(holdings(a.L),holdings(whole.L));
  assert.deepEqual(observeManualHuskWork(a.L,a.runId),observeManualHuskWork(whole.L,whole.runId));
 }
});
test('durable frame/start replay survives later work, JSON and a trimmed global committed list',()=>{
 const a=fixture(),first=frame(a,0,30000,'first');recordManualHuskSpan(a.L,a.runId,first,first.toWorldMs);
 record(a,30000,240000,'rest-of-work');a.L=json(a.L);
 a.L.committed=Array.from({length:500},(_,i)=>'unrelated:'+i);
 const before=structuredClone(a.L);
 recordManualHuskSpan(a.L,a.runId,first,a.spec.openedAtWorldMs+999999);
 assert.deepEqual(beginManualHuskWork(a.L,json(a.spec)),{runId:a.runId});assert.deepEqual(a.L,before);
 unchanged(a,()=>recordManualHuskSpan(a.L,a.runId,{...first,activity:'rest'},first.toWorldMs));
 unchanged(a,()=>beginManualHuskWork(a.L,{...a.spec,operatorId:'res:changed'}));
});
test('future spans, wrong worlds, malformed facts and temporal overlap reject atomically',()=>{
 const a=fixture();
 const bad:any[]=[{worldId:'other'},{worldEpoch:'other'},{runId:'other'},{fromWorldMs:0},
  {fromWorldMs:1001,toWorldMs:1001},{confirmedAtWorldMs:0},{fromPosition:{x:NaN,z:20}},
  {activity:'AI decided to work'},{arrived:'yes'},{extra:1},{toWorldMs:Infinity}];
 for(const patch of bad){const f=frame(a,0,30000,'bad',patch);unchanged(a,()=>recordManualHuskSpan(a.L,a.runId,f,100000));}
 unchanged(a,()=>recordManualHuskSpan(a.L,a.runId,frame(a,0,30000,'future'),2000));
 record(a,0,10000,'ok');unchanged(a,()=>record(a,9000,30000,'overlap'));
});
test('changed source amount, composition, place or reservation is never consumed',()=>{
 for(const mutate of [
  (a:Fixture)=>{a.L.lots['lot:husk'].amount.value++;},
  (a:Fixture)=>{a.L.lots['lot:husk'].quality!.dry_mg++;},
  (a:Fixture)=>{a.L.lots['lot:husk'].location='site:elsewhere';},
  (a:Fixture)=>{delete a.L.lots['lot:husk'].reservedBy;},
  (a:Fixture)=>{a.L.lots['lot:husk'].reservedBy='other';},
  (a:Fixture)=>{delete a.L.lots['lot:husk'];},
 ]){const a=fixture();mutate(a);unchanged(a,()=>record(a,0,240000,'bad'));}
});
test('corrupt saved accounting, provenance and host state reject before any ledger change',()=>{
 const mutators=[
  (d:any)=>d.science.pools.fiber.dryMg++,(d:any)=>d.pendingWorkMs++,
  (d:any)=>d.science.totalWorkMs++,(d:any)=>d.binding='wrong',
  (d:any)=>d.spec.operatorId='changed',(d:any)=>d.frames[0].activity='rest',
  (d:any)=>d.source.quality.dry_mg++,(d:any)=>d.pending[0].toWorldMs++,
 ];
 for(const mutate of mutators){const a=fixture();record(a,0,17000,'a');mutate(data(a));unchanged(a,()=>record(a,17000,30000,'b'));}
 const a=fixture();a.L.runs[a.runId].state!.schema='old/0';unchanged(a,()=>record(a,0,30000));
});
test('reservation prevents a second run; generic husks or two-husk lots are not inferred',()=>{
 const a=fixture();unchanged(a,()=>beginManualHuskWork(a.L,{...a.spec,commandId:'second'}));
 for(const patch of [{materialId:'coconut_husk'},{quality:{dry_mg:300000,water_mg:600000,husk_count:2,unseparated:1,history_complete:1}},
  {quality:{dry_mg:300000,water_mg:600000,unseparated:1,history_complete:1}}]){
  const b=fixture(),L=emptyLedger('new','new');const lot={...json(b.L.lots['lot:husk']),...patch};delete lot.reservedBy;addLot(L,lot as any);
  const before=structuredClone(L);rejects(()=>beginManualHuskWork(L,b.spec));assert.deepEqual(L,before);
 }
});
test('observations have only sight/touch words and never expose numerical accounting',()=>{
 const a=fixture();const before=structuredClone(a.L);observeManualHuskWork(a.L,a.runId);assert.deepEqual(a.L,before);
 record(a,0,30000,'work');
 const out=observeManualHuskWork(a.L,a.runId);
 for(const o of out){assert.deepEqual(Object.keys(o).sort(),['at','channel','text']);assert.ok(['sight','touch'].includes(o.channel));
  assert.ok(!/[0-9]|mg|gf|profile|seed|仮定|キメ値|配分|残量|秒|分|時/.test(o.text!));}
 assert.ok(out.some(o=>o.text!.includes('ほぐれた繊維')));
 const source=fixture(300000,900000);record(source,0,30000,'work');assert.deepEqual(observeManualHuskWork(source.L,source.runId),out);
});
test('a non-30-second profile horizon rounds host effort up without extrapolating yield',()=>{
 const a=fixture(450001,1200000);record(a,0,360000,'before');
 assert.equal(view(a).status,'running');record(a,360000,390000,'finish');
 assert.equal(view(a).status,'completed');assert.equal(view(a).certifiedWorkMs,390000);
 assert.deepEqual(view(a).pools,expectedPools(a,390000));
 assert.equal(Object.values(a.L.lots).reduce((n,l)=>n+BigInt(l.amount.value),0n),1650001n);
});
test('tiny integer-mg source never invents a fiber carrier or loses water',()=>{
 const a=fixture(1,1);record(a,0,30000,'tiny');
 assert.equal(view(a).status,'completed');assert.equal(view(a).pools.fiber.dryMg,0);
 assert.equal(Object.values(a.L.lots).reduce((n,l)=>n+BigInt(l.amount.value),0n),2n);
 assert.ok(!Object.values(a.L.lots).some(l=>l.materialId==='coir_fiber_bundle'));
});
test('unrelated ledger lots and active runs remain unchanged',()=>{
 const a=fixture();
 addLot(a.L,{lotId:'lot:other',materialId:'clay',amount:{value:1200000,unit:'mg'},location:'elsewhere',quality:{water_ppm:200000}});
 const r=startRun(a.L,{processId:'unrelated',processVersion:'1',catalogVersion:'test',contract:'0.2.1',clock:'island',lotIds:['lot:other'],equipmentIds:[],operator:'other'},1001).run!;
 const before={lot:structuredClone(a.L.lots['lot:other']),run:structuredClone(r)};
 record(a,0,240000,'work');
 assert.deepEqual(a.L.lots['lot:other'],before.lot);assert.deepEqual(a.L.runs[r.runId],before.run);
});
test('caller mutations of specs, frames and returned views cannot alter saved work',()=>{
 const a=fixture(),f=frame(a,0,17000,'a');recordManualHuskSpan(a.L,a.runId,f,f.toWorldMs);
 f.activity='rest';a.spec.input.dryMg=1;
 const v=view(a);v.pools.fiber.dryMg=999999;observeManualHuskWork(a.L,a.runId)[0].text='tampered';
 assert.equal(view(a).pendingWorkMs,17000);assert.equal(view(a).pools.fiber.dryMg,0);
 assert.equal(data(a).spec.input.dryMg,300000);
});
test('returned residual cannot be presented as a new never-separated whole husk',()=>{
 const a=fixture();record(a,0,240000,'all');
 const residual=Object.values(a.L.lots).find(l=>l.materialId==='partially_separated_coconut_husk')!;
 const input={...a.spec.input,lotId:residual.lotId,dryMg:residual.quality!.dry_mg,waterMg:residual.quality!.water_mg};
 unchanged(a,()=>beginManualHuskWork(a.L,{...a.spec,commandId:'reuse',input}));
});
test('deterministic mixed work/rest/JSON cases match certified work without clock-derived output',()=>{
 let seed=12345;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let trial=0;trial<60;trial++){
  const a=fixture(300000+next()%500000,1200000);let t=0,work=0;
  for(let k=0;k<5;k++){
   const duration=1+next()%45000,working=next()%3!==0;
   record(a,t,t+duration,'f'+k,{activity:working?'separate-wet-husk':'rest'});t+=duration;
   if(working)work+=duration;
   a.L=json(a.L);
  }
  const certified=Math.floor(work/30000)*30000;
  assert.equal(view(a).certifiedWorkMs,certified);assert.equal(view(a).pendingWorkMs,work-certified);
  assert.deepEqual(view(a).pools,expectedPools(a,certified));
  assert.equal(Object.keys(a.L.lots).length,1);
 }
});
console.log('PASS manual husk host boundary: '+groups+' groups; no live resident registration.');
