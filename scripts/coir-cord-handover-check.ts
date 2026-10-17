import assert from 'node:assert/strict';
import {emptyLedger,addLot,toClock,type Ledger} from '../src/world/process-runner';
import {ISLAND_EPOCH,ISLAND_RATE} from '../src/world/island-time';
import {COIR_CORD_ASSUMPTION_ID as ID,COIR_CORD_RULES as R} from '../src/science/prototypes/coir-cord-types';
import {currentCordStrength} from '../src/science/prototypes/coir-cord-damage';
import {readCordBundle,readCordPiece,writeCordBundle,writeCordPiece} from '../src/world/coir-cord-lots';
import {applyCordIntent,recordCordSpan,restoreCordWork,cordWorkRevision,projectCordWork,readCordWorksite,readCordWorkerObservations,cordFailureObservations,
 type CordIntent,type CordSpan,type CordStartFacts,type CordWorkLedger,CordWorkError} from '../src/world/coir-cord-work';
import {beginManualHuskWork,recordManualHuskSpan} from '../src/world/manual-husk-work';
import {applyHuskIntent,huskArrangementRevision} from '../src/world/manual-husk-workflow';
import {MANUAL_HUSK_ASSUMPTION as HA} from '../src/science/prototypes/manual-husk-assumptions';
const T=ISLAND_EPOCH+1000;
let groups=0;
const test=(name:string,f:()=>void)=>{f();groups++;console.log('PASS '+name);};
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function addProduced(L:Ledger,p:ReturnType<typeof writeCordBundle>,lotId:string){return addLot(L,{lotId,materialId:p.materialId,amount:p.amount,location:p.into!,quality:p.quality});}
function fixture(op:'dry'|'sieve'|'twist'='twist',wet=false,start=true){
 const L:CordWorkLedger=emptyLedger('world:cord','epoch:1');
 addProduced(L,writeCordBundle({fiberDryMg:72000,pithDryMg:op==='sieve'?14400:7200,waterMg:wet?115200:7920},'site',1),'bundle');
 const intent:CordIntent={kind:'start',intentId:'start',actorId:'actor',atWorldMs:T,operation:op,lotIds:['bundle'],siteId:'site',presence:'here'};
 const facts:CordStartFacts={assumptionId:ID,worksite:{locationId:'site',x:0,z:0,reachM:1},
 ...(op==='dry'?{roofed:true}:op==='twist'?{requestedLengthMm:1000}:{})};
 const runId=start?applyCordIntent(L,intent,0,T,facts).runId:'';
 return {L,intent,facts,runId};
}
type F=ReturnType<typeof fixture>;
const rev=(a:F)=>cordWorkRevision(a.L);
function span(a:F,from:number,to:number,name='span',patch:any={}):CordSpan{
 const base={spanId:name,worldId:a.L.world.worldId,worldEpoch:a.L.world.worldEpoch,runId:a.runId,fromWorldMs:T+from,toWorldMs:T+to,confirmedAtWorldMs:T+to};
 if(a.intent.kind==='start'&&a.intent.operation==='dry')return {kind:'confirmed-roofed-wait',...base,siteId:'site',roofed:true,...patch};
 return {kind:'executor-activity-span',...base,actorId:'actor',activity:a.intent.kind==='start'&&a.intent.operation==='sieve'?'sieve-coir':'twist-coir',
 arrived:true,targetLotId:'bundle',targetSiteId:'site',fromPosition:{x:0,z:0},toPosition:{x:0,z:0},...patch};
}
function work(a:F,from:number,to:number,name='span',patch:any={}){
 const f=span(a,from,to,name,patch);recordCordSpan(a.L,a.runId,f,rev(a),f.confirmedAtWorldMs);
}
function ctrl(a:F,kind:'stop'|'resume',t:number,id=kind){
 const i:CordIntent={kind,intentId:id,runId:a.runId,actorId:'actor',atWorldMs:T+t,...(kind==='resume'?{presence:'here' as const}:{})};
 return applyCordIntent(a.L,i,rev(a),T+t);
}
const p=(a:F)=>projectCordWork(a.L,a.runId);
const holdings=(L:Ledger)=>Object.values(L.lots).map(l=>({materialId:l.materialId,amount:l.amount,quality:l.quality,location:l.location})).sort((a,b)=>a.materialId.localeCompare(b.materialId));
function unchanged(a:F,fn:()=>unknown){const before=json(a.L);assert.throws(fn);assert.deepEqual(a.L,before);}
function safe(v:any){if(Array.isArray(v)){v.forEach(safe);return;}if(v&&typeof v==='object'){Object.values(v).forEach(safe);return;}
 assert.notEqual(typeof v,'number');if(typeof v==='string')assert.ok(!/[0-9]|mg|gf|seed|strength|profile|仮定|キメ値/.test(v),v);}
function command(a:F,kind:'takeover'|'abandon',at:number,actorId='actor',id=kind){
 return applyCordIntent(a.L,{kind,intentId:id,actorId,runId:a.runId,atWorldMs:T+at,...(kind==='takeover'?{presence:'here' as const}:{})} as CordIntent,rev(a),T+at);
}
const totalMass=(L:Ledger)=>Object.values(L.lots).reduce((n,l)=>n+BigInt(l.amount.value),0n)+(L.released??[]).reduce((n,r)=>n+BigInt(r.mg),0n);
function plyFixture():F{
 const a=fixture('twist',false,false);delete a.L.lots.bundle;
 const strands=['a','b','c'];for(const lotId of strands)addProduced(a.L,writeCordPiece({lotId,material:'coir_strand',fiberDryMg:10000,pithDryMg:1000,waterMg:1000,lengthMm:2000,baseStrengthGf:40000,damage:{sunMs:1000,shadeMs:0,abrasions:1}},'site',1),lotId);
 a.intent={...a.intent,operation:'ply',lotIds:strands} as any;delete a.facts.requestedLengthMm;
 a.runId=applyCordIntent(a.L,a.intent,0,T,a.facts).runId;return a;
}
test('takeover only paused by another free actor, not passive dry',()=>{
 const a=fixture();unchanged(a,()=>command(a,'takeover',0,'new'));unchanged(a,()=>command(a,'abandon',0));ctrl(a,'stop',0);
 unchanged(a,()=>command(a,'takeover',0,'actor'));
 command(a,'takeover',0,'new');assert.equal(a.L.runs[a.runId].operator,'new');
 const d=fixture('dry',true);ctrl(d,'stop',0);unchanged(d,()=>command(d,'takeover',0,'new'));command(d,'abandon',0);
 assert.equal(readCordWorksite(d.L,'site',T).activity,'abandoned');assert.equal(totalMass(d.L),194400n);
});
test('new actor inherits 17-second fragments; old actor no longer advances',()=>{
 const a=fixture('sieve');work(a,0,17000);ctrl(a,'stop',17000);command(a,'takeover',100000,'new');
 assert.deepEqual(readCordWorkerObservations(a.L,a.runId,'new'),[]);
 work(a,100000,130000,'former');assert.equal(p(a).certifiedMs,0);assert.equal(p(a).pendingMs,17000);
 work(a,130000,143000,'new',{actorId:'new'});assert.equal(p(a).certifiedMs,30000);
 assert.deepEqual(readCordWorkerObservations(a.L,a.runId,'actor'),[]);
 const data=a.L.runs[a.runId].state!.data as any;assert.deepEqual(data.controls.map((c:any)=>c.actorId),['actor','actor','new']);
 assert.deepEqual(data.science.intervals.map((i:any)=>i.actorId),['actor','new']);safe(readCordWorkerObservations(a.L,a.runId,'new'));
});
test('takeover after restore preserves work and cannot double book a cord actor',()=>{
 const a=fixture();work(a,0,17000);a.L=restoreCordWork(json(a.L),T+100000);
 addProduced(a.L,writeCordBundle({fiberDryMg:10000,pithDryMg:0,waterMg:0},'other-site',1),'other');
 const facts={assumptionId:ID,worksite:{locationId:'other-site',x:0,z:0,reachM:1},requestedLengthMm:100};
 const i:CordIntent={kind:'start',intentId:'other',actorId:'new',atWorldMs:T+100000,operation:'twist',lotIds:['other'],siteId:'other-site',presence:'here'};
 const other=applyCordIntent(a.L,i,rev(a),T+100000,facts).runId;unchanged(a,()=>command(a,'takeover',100000,'new'));
 applyCordIntent(a.L,{kind:'stop',intentId:'stop-other',actorId:'new',runId:other,atWorldMs:T+100000},rev(a),T+100000);
 command(a,'takeover',100000,'new');work(a,100000,113000,'new',{actorId:'new'});assert.equal(p(a).certifiedMs,30000);
});
test('abandon ignores subquantum work, closes once, and rejects further frames',()=>{
 const a=fixture();work(a,0,17000);ctrl(a,'stop',17000);command(a,'abandon',20000);
 assert.equal(p(a).status,'stopped');assert.equal(p(a).certifiedMs,0);assert.equal(p(a).pendingMs,0);
 assert.ok(Object.values(a.L.lots).every(l=>l.materialId==='coir_fiber_bundle'&&!l.reservedBy));assert.equal(totalMass(a.L),87120n);
 const old=json(a.L);command(a,'abandon',20000);assert.deepEqual(a.L,old);unchanged(a,()=>work(a,20000,50000,'late'));
 safe(readCordWorksite(a.L,'site',T+20000));unchanged(a,()=>ctrl(a,'resume',20000));
});
test('sieve partial settlement returns fallen pith and bundle, with provenance',()=>{
 const a=fixture('sieve',false,false);a.L.lots.bundle.quality!.history_complete=0;a.runId=applyCordIntent(a.L,a.intent,0,T,a.facts).runId;
 work(a,0,30000);ctrl(a,'stop',30000);command(a,'abandon',30000);assert.equal(totalMass(a.L),94320n);
 const out=Object.values(a.L.lots);assert.equal(out.find(l=>l.materialId==='coir_pith')!.quality!.pith_dry_mg,3600);
 assert.equal(readCordBundle(out.find(l=>l.materialId==='coir_fiber_bundle')!).pithDryMg,10800);assert.ok(out.every(l=>l.quality!.history_complete===0));
});
test('twist partial product preserves initial strength and conservative leftover',()=>{
 const a=fixture(),b=fixture();work(b,0,120000);const full=readCordPiece(Object.values(b.L.lots).find(l=>l.materialId==='coir_strand')!);
 work(a,0,60000);ctrl(a,'stop',60000);command(a,'abandon',60000);const strand=readCordPiece(Object.values(a.L.lots).find(l=>l.materialId==='coir_strand')!);
 assert.equal(strand.lengthMm,500);assert.equal(strand.baseStrengthGf,full.baseStrengthGf);assert.equal(totalMass(a.L),87120n);
 readCordBundle(Object.values(a.L.lots).find(l=>l.materialId==='coir_fiber_bundle')!);safe(readCordWorksite(a.L,'site',T+60000));
});
test('ply partial product and each remaining strand retain exact mass and wear',()=>{
 const a=plyFixture(),before=totalMass(a.L);work(a,0,30000,'ply',{activity:'ply-coir',targetLotId:'a'});ctrl(a,'stop',30000);command(a,'abandon',30000);
 assert.equal(totalMass(a.L),before);const out=Object.values(a.L.lots),rope=readCordPiece(out.find(l=>l.materialId==='coir_rope')!);
 assert.equal(rope.lengthMm,500);assert.equal(out.filter(l=>l.materialId==='coir_strand').length,3);
 for(const l of out.filter(l=>l.materialId==='coir_strand')){const p=readCordPiece(l);assert.equal(p.damage.abrasions,1);assert.equal(p.damage.sunMs,1000);}
});
test('dry partial removal books only actual vapor and no takeover',()=>{
 const a=fixture('dry',true),end=Math.ceil(86400000/ISLAND_RATE)+1;work(a,0,end);ctrl(a,'stop',end);command(a,'abandon',end);
 assert.equal(totalMass(a.L),194400n);assert.equal(Object.values(a.L.lots).length,1);
 const b=readCordBundle(Object.values(a.L.lots)[0]);assert.ok(b.waterMg<115200&&b.waterMg>7920);
 assert.equal(p(a).status,'stopped');safe(readCordWorksite(a.L,'site',T+end));
});
test('abandoned partitions, JSON and repeated commands preserve all products',()=>{
 const whole=fixture();work(whole,0,60000);ctrl(whole,'stop',60000);command(whole,'abandon',60000);
 for(const step of [30000,17000,737]){
  const a=fixture();let n=0;for(let t=0;t<60000;t+=step){work(a,t,Math.min(60000,t+step),'f'+n++);a.L=json(a.L);}
  ctrl(a,'stop',60000);command(a,'abandon',60000);a.L=restoreCordWork(json(a.L),T+60000);
  const before=json(a.L);command(a,'abandon',60000);assert.deepEqual(a.L,before);assert.deepEqual(holdings(a.L),holdings(whole.L));
 }
});
test('schema relabeling and changed operator/history are refused atomically',()=>{
 for(const edit of [(a:F)=>a.L.runs[a.runId].operator='other',(a:F)=>(a.L.runs[a.runId].state!.data as any).controls[0].actorId='other',
 (a:F)=>a.L.runs[a.runId].state!.schema='civ-world.coir-work/1',(a:F)=>(a.L.cordArrangement as any).schema='civ-world.coir-arrangement/1']){
  const a=fixture();edit(a);unchanged(a,()=>work(a,0,30000));
 }
});
console.log('PASS coir handover/cleanup: '+groups+' groups.');
