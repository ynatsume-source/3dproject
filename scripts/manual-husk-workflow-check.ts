import assert from 'node:assert/strict';
import {emptyLedger,addLot} from '../src/world/process-runner';
import {MANUAL_HUSK_ASSUMPTION as A} from '../src/science/prototypes/manual-husk-assumptions';
import {MANUAL_HUSK_WORK,projectManualHuskWork,type HuskExecutorSpan} from '../src/world/manual-husk-work';
import {applyHuskIntent,recordHuskWorkflowSpan,restoreHuskArrangement,huskArrangementRevision,
 readHuskWorksite,readHuskResidentObservations,readHuskMaterialLabel,type HuskWorkflowLedger,type HuskIntent,type HuskStartFacts} from '../src/world/manual-husk-workflow';
let groups=0;
const test=(name:string,f:()=>void)=>{f();groups++;console.log('PASS '+name);};
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function fixture(start=true){
 const L:HuskWorkflowLedger=emptyLedger('world:workflow','epoch:1');
 const facts:HuskStartFacts={assumptionId:A.id,huskCount:1,
 input:{materialId:'wet_unseparated_coconut_husk',lotId:'husk',separation:'never-separated',dryMg:300000,waterMg:600000,soakHistory:[]},
 worksite:{locationId:'site',x:10,z:20,reachM:0.75}};
 addLot(L,{lotId:'husk',materialId:'wet_unseparated_coconut_husk',amount:{value:900000,unit:'mg'},location:'site',
 quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
 const intent:HuskIntent={intentId:'begin',kind:'start',actorId:'actor',processId:MANUAL_HUSK_WORK.processId,lotId:'husk',siteId:'site',atWorldMs:1000,presence:'here'};
 const runId=start?applyHuskIntent(L,intent,0,1000,facts).runId:'';
 return {L,facts,intent,runId};
}
type F=ReturnType<typeof fixture>;
const rev=(a:F)=>huskArrangementRevision(a.L);
function span(a:F,from:number,to:number,id='span',change:Partial<HuskExecutorSpan>={}):HuskExecutorSpan{
 return {kind:'executor-activity-span',spanId:id,worldId:a.L.world.worldId,worldEpoch:a.L.world.worldEpoch,runId:a.runId,actorId:'actor',
 fromWorldMs:1000+from,toWorldMs:1000+to,confirmedAtWorldMs:1000+to,activity:'separate-wet-husk',arrived:true,
 targetLotId:'husk',targetSiteId:'site',fromPosition:{x:10,z:20},toPosition:{x:10,z:20},...change};
}
function work(a:F,from:number,to:number,id='span',change:Partial<HuskExecutorSpan>={}){
 const f=span(a,from,to,id,change);recordHuskWorkflowSpan(a.L,a.runId,f,rev(a),f.confirmedAtWorldMs);
}
function control(a:F,kind:'stop'|'resume',at:number,id=kind){
 const i:HuskIntent=kind==='resume'?{kind,intentId:id,actorId:'actor',runId:a.runId,atWorldMs:1000+at,presence:'here'}:
 {kind,intentId:id,actorId:'actor',runId:a.runId,atWorldMs:1000+at};
 return applyHuskIntent(a.L,i,rev(a),1000+at);
}
const p=(a:F)=>projectManualHuskWork(a.L,a.runId);
function unchanged(a:F,f:()=>unknown){const old=json(a.L);assert.throws(f);assert.deepEqual(a.L,old);}
const holdings=(a:F)=>Object.values(a.L.lots).map(l=>({materialId:l.materialId,amount:l.amount,quality:l.quality,location:l.location})).sort((a,b)=>a.materialId.localeCompare(b.materialId));
test('intent reserves one husk but presence and rendering never advance work',()=>{
 const a=fixture();assert.equal(a.L.lots.husk.reservedBy,a.runId);const old=json(a.L);
 for(let n=0;n<20;n++){assert.equal(readHuskWorksite(a.L,'site',1000+n).activity,'waiting');assert.deepEqual(readHuskResidentObservations(a.L,a.runId,'actor'),[]);}
 assert.equal(p(a).certifiedWorkMs,0);assert.deepEqual(a.L,old);
});
test('unsupported process, count, assumption and inconsistent source fail atomically',()=>{
 for(const change of [{assumptionId:'default'},{huskCount:2},{input:{...fixture(false).facts.input,dryMg:1}}]){
  const a=fixture(false);unchanged(a,()=>applyHuskIntent(a.L,a.intent,0,1000,{...a.facts,...change} as any));
 }
 const a=fixture(false);unchanged(a,()=>applyHuskIntent(a.L,{...a.intent,processId:'AI invents process'} as any,0,1000,a.facts));
});
test('arrival alone, rest, travel and wrong work never certify time',()=>{
 for(const change of [{activity:'idle'},{activity:'rest'},{activity:'travel'},{activity:'unknown'},{arrived:false},{actorId:'other'},{targetLotId:null},{toPosition:{x:20,z:20}}]){
  const a=fixture();work(a,0,30000,'not-work',change as any);assert.equal(p(a).certifiedWorkMs,0);
  assert.deepEqual(readHuskResidentObservations(a.L,a.runId,'actor'),[]);
 }
});
test('pause releases the operator and keeps reservation and unfinished fragments',()=>{
 const a=fixture();work(a,0,17000);control(a,'stop',17000);
 const v=readHuskWorksite(a.L,'site',18000);assert.equal(v.activity,'paused');assert.equal(v.operatorFree,true);assert.equal(v.materialsReserved,true);
 assert.equal(p(a).pendingWorkMs,17000);assert.equal(a.L.lots.husk.reservedBy,a.runId);
 control(a,'resume',117000);work(a,117000,130000,'rest');assert.equal(p(a).certifiedWorkMs,30000);assert.equal(p(a).pendingWorkMs,0);
});
test('work crossing an interruption must be split and rejects without consuming',()=>{
 const a=fixture();control(a,'stop',17000);control(a,'resume',50000);
 unchanged(a,()=>work(a,0,60000));unchanged(a,()=>work(a,17000,50000,'gap'));
});
test('delayed pre-stop facts settle once without resurrecting attendance',()=>{
 const a=fixture();control(a,'stop',240000);work(a,0,240000);
 assert.equal(p(a).status,'completed');assert.equal(readHuskWorksite(a.L,'site',241000).operatorFree,true);
 assert.equal(Object.values(a.L.lots).reduce((n,l)=>n+l.amount.value,0),900000);
});
test('save restoration closes attendance and never credits offline time',()=>{
 const a=fixture();work(a,0,17000);const old=json(a.L);a.L=restoreHuskArrangement(json(a.L),1001000);
 assert.deepEqual(holdings(a),Object.values(old.lots).map(l=>({materialId:l.materialId,amount:l.amount,quality:l.quality,location:l.location})));
 assert.equal(p(a).pendingWorkMs,17000);assert.equal(readHuskWorksite(a.L,'site',1001000).activity,'paused');
 unchanged(a,()=>work(a,17000,30000,'offline'));
 unchanged(a,()=>control(a,'resume',17000,'backdated'));
 control(a,'resume',1000000);work(a,1000000,1013000,'awake');
 assert.equal(p(a).certifiedWorkMs,30000);
});
test('restoration invalidates stale revisions but durable replay is a no-op',()=>{
 const a=fixture(),first=span(a,0,17000);recordHuskWorkflowSpan(a.L,a.runId,first,rev(a),18000);
 a.L=restoreHuskArrangement(json(a.L),20000);const old=json(a.L);
 applyHuskIntent(a.L,a.intent,0,20000,a.facts);
 recordHuskWorkflowSpan(a.L,a.runId,first,0,20000);assert.deepEqual(a.L,old);
 unchanged(a,()=>applyHuskIntent(a.L,{kind:'resume',intentId:'new',actorId:'actor',runId:a.runId,atWorldMs:20000,presence:'here'},0,20000));
});
test('completion releases source exactly once and durable resend survives trimmed global receipts',()=>{
 const a=fixture(),f=span(a,0,240000);recordHuskWorkflowSpan(a.L,a.runId,f,rev(a),241000);
 a.L=json(a.L);a.L.committed=[];const old=json(a.L);
 recordHuskWorkflowSpan(a.L,a.runId,f,0,241000);applyHuskIntent(a.L,a.intent,0,241000,a.facts);
 assert.deepEqual(a.L,old);assert.equal(Object.keys(a.L.lots).length,3);assert.ok(Object.values(a.L.lots).every(l=>!l.reservedBy));
 unchanged(a,()=>work(a,240000,270000,'again'));
});
test('conflicting command IDs and stale writes reject atomically',()=>{
 const a=fixture();unchanged(a,()=>applyHuskIntent(a.L,{...a.intent,presence:'away'} as any,0,1000,a.facts));
 const f=span(a,0,17000);recordHuskWorkflowSpan(a.L,a.runId,f,rev(a),18000);
 unchanged(a,()=>recordHuskWorkflowSpan(a.L,a.runId,{...f,activity:'rest'},rev(a),18000));
 unchanged(a,()=>recordHuskWorkflowSpan(a.L,a.runId,span(a,17000,30000,'next'),0,31000));
});
test('all time partitions preserve science, inventory and safe words',()=>{
 const whole=fixture();work(whole,0,240000);
 for(const step of [30000,17000,737]){
  const a=fixture();let n=0;
  for(let t=0;t<240000;t+=step){work(a,t,Math.min(240000,t+step),'f'+n++);a.L=json(a.L);}
  assert.deepEqual(p(a),p(whole));assert.deepEqual(holdings(a),holdings(whole));
  assert.deepEqual(readHuskWorksite(a.L,'site',241000),readHuskWorksite(whole.L,'site',241000));
 }
});
test('read-only projections expose no numbers, ledger internals or hidden profile',()=>{
 const a=fixture();work(a,0,30000);const old=json(a.L);
 const views=[readHuskWorksite(a.L,'site',31000),readHuskResidentObservations(a.L,a.runId,'actor')];
 function safe(v:any){if(Array.isArray(v)){v.forEach(safe);return;}if(v&&typeof v==='object'){Object.values(v).forEach(safe);return;}
  assert.notEqual(typeof v,'number');if(typeof v==='string')assert.ok(!/[0-9]|mg|gf|seed|profile|仮定|キメ値|配分/.test(v),v);
 }views.forEach(safe);assert.deepEqual(readHuskResidentObservations(a.L,a.runId,'other'),[]);
 assert.deepEqual(a.L,old);(views[0] as ReturnType<typeof readHuskWorksite>).observations[0].text='mutated';assert.deepEqual(a.L,old);
});
test('working is a confirmed instant, not an indefinitely stale attendance flag',()=>{
 const a=fixture();work(a,0,30000);assert.equal(readHuskWorksite(a.L,'site',31000).activity,'working');
 assert.equal(readHuskWorksite(a.L,'site',31001).activity,'waiting');
 work(a,30000,60000,'rest',{activity:'rest'});assert.equal(readHuskWorksite(a.L,'site',61000).activity,'waiting');
});
test('material labels never spread quality and unknown IDs fall back safely',()=>{
 assert.deepEqual(readHuskMaterialLabel('coir_fiber_bundle'),{label:'ほぐれた繊維の束'});
 for(const id of ['strength:40000','constructor','__proto__'])assert.deepEqual(readHuskMaterialLabel(id),{label:'材料'});
});
test('future, malformed and changed material facts fail atomically',()=>{
 const a=fixture();const f=span(a,0,30000);
 unchanged(a,()=>recordHuskWorkflowSpan(a.L,a.runId,f,rev(a),30000));
 unchanged(a,()=>recordHuskWorkflowSpan(a.L,a.runId,{...f,fromPosition:null} as any,rev(a),31000));
 a.L.lots.husk.quality!.dry_mg++;unchanged(a,()=>work(a,0,30000));
});
test('corrupt arrangement cannot inject public text, activate controls or cross worlds',()=>{
 const edits=[(m:any)=>m.schema='old/0',(m:any)=>m.worldEpoch='other',(m:any)=>m.jobs[0].observations=[{text:'strength 40000'}],
 (m:any)=>m.jobs[0].controls[0].kind='resume',(m:any)=>m.jobs[0].controls[0].presence='not a presence',
 (m:any)=>m.jobs[0].actorId='other',(m:any)=>m.receipts=[]];
 for(const edit of edits){const a=fixture();edit(a.L.manualHuskArrangement);unchanged(a,()=>work(a,0,30000));}
});
test('same actor and occupied site cannot be double booked; pause permits another site',()=>{
 const a=fixture();const f=json(a.facts);f.input.lotId='other';f.worksite.locationId='elsewhere';
 const other={...json(a.L.lots.husk),lotId:'other',location:'elsewhere'};delete other.reservedBy;addLot(a.L,other);
 const i={...a.intent,intentId:'second',lotId:'other',siteId:'elsewhere',atWorldMs:2000} as HuskIntent;
 unchanged(a,()=>applyHuskIntent(a.L,i,rev(a),2000,f));
 control(a,'stop',1000);const second=applyHuskIntent(a.L,i,rev(a),2000,f);
 assert.notEqual(second.runId,a.runId);unchanged(a,()=>control(a,'resume',2000));
 const same={...f,input:{...f.input,lotId:'third'},worksite:{...f.worksite,locationId:'site'}};
 const third={...json(a.L.lots.other),lotId:'third',location:'site'};delete third.reservedBy;addLot(a.L,third);
 unchanged(a,()=>applyHuskIntent(a.L,{...i,intentId:'third',actorId:'other-actor',lotId:'third',siteId:'site'} as HuskIntent,rev(a),2000,same));
});
test('a completed run cannot free its operator retroactively for overlapping work',()=>{
 const a=fixture();work(a,0,240000);
 const f=json(a.facts);f.input.lotId='second';f.worksite.locationId='next-site';
 addLot(a.L,{lotId:'second',materialId:'wet_unseparated_coconut_husk',amount:{value:900000,unit:'mg'},location:'next-site',
 quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
 const i={...a.intent,intentId:'second',lotId:'second',siteId:'next-site',atWorldMs:2000} as HuskIntent;
 unchanged(a,()=>applyHuskIntent(a.L,i,rev(a),241000,f));
 applyHuskIntent(a.L,{...i,atWorldMs:241000},rev(a),241000,f);
});
test('only the original operator resumes phase one and no scheduled time declares readiness',()=>{
 const a=fixture();control(a,'stop',0);
 unchanged(a,()=>applyHuskIntent(a.L,{kind:'resume',intentId:'steal',runId:a.runId,actorId:'other',atWorldMs:1000,presence:'here'},rev(a),1000));
 const v=readHuskWorksite(a.L,'site',99999999);assert.equal(v.activity,'paused');assert.ok(!/乾燥済み|準備完了|もうすぐ|秒|分|時間/.test(v.nextStep+v.stage));
 assert.equal(p(a).certifiedWorkMs,0);
});
console.log('PASS manual husk arrangement: '+groups+' groups; no resident AI or visual UI connection.');
