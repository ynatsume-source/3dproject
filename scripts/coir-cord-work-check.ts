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
test('explicit start reserves materials, never works from presence or display reads',()=>{
 const a=fixture();assert.equal(a.L.lots.bundle.reservedBy,a.runId);const old=json(a.L);
 for(let k=0;k<20;k++){safe(readCordWorksite(a.L,'site',T+k));assert.deepEqual(readCordWorkerObservations(a.L,a.runId,'actor'),[]);}
 assert.deepEqual(a.L,old);assert.equal(p(a).certifiedMs,0);
 const b=fixture('twist',false,false);unchanged(b,()=>applyCordIntent(b.L,b.intent,0,T,{...b.facts,assumptionId:'default'}));
});
test('roofed waiting uses island clock and leaves operator free',()=>{
 const a=fixture('dry',true),end=Math.ceil(R.dryIslandMs/ISLAND_RATE)+1;
 assert.equal(a.L.runs[a.runId].clock,'island');assert.equal(readCordWorksite(a.L,'site',T).operatorFree,true);
 work(a,0,end);
 assert.equal(p(a).status,'completed');assert.deepEqual(readCordWorksite(a.L,'site',T+end).observations,[]);assert.deepEqual(readCordWorkerObservations(a.L,a.runId,'actor'),[]);const out=readCordBundle(Object.values(a.L.lots)[0]);
 assert.equal(out.waterMg,7920);
 assert.equal(a.L.released!.reduce((n,r)=>n+r.mg,0),107280);
 assert.equal(Object.values(a.L.lots).reduce((n,l)=>n+l.amount.value,0)+a.L.released!.reduce((n,r)=>n+r.mg,0),194400);
});
test('roofed waiting partitions, false roof, offline factual replay and save preserve water balance',()=>{
 const whole=fixture('dry',true),end=Math.ceil(R.dryIslandMs/ISLAND_RATE)+1;work(whole,0,end);
 const a=fixture('dry',true),half=Math.floor(end/2);work(a,0,half,'first');
 const previous=p(a).projection.releasedWaterMg;
 a.L=restoreCordWork(json(a.L),T+half+500);assert.equal(readCordWorksite(a.L,'site',T+half+500).operatorFree,true);
 assert.equal(p(a).projection.releasedWaterMg,previous);work(a,half,end,'offline-confirmed');
 assert.deepEqual(holdings(a.L),holdings(whole.L));assert.equal(p(a).projection.releasedWaterMg,p(whole).projection.releasedWaterMg);
 const b=fixture('dry',true);work(b,0,end,'exposed',{roofed:false});assert.equal(p(b).certifiedMs,0);assert.equal(p(b).projection.releasedWaterMg,0);
});
test('17 seconds plus 13 after pause certify only real manual work',()=>{
 const a=fixture('sieve');work(a,0,17000);ctrl(a,'stop',17000);
 assert.equal(readCordWorksite(a.L,'site',T+17000).operatorFree,true);assert.equal(p(a).pendingMs,17000);
 ctrl(a,'resume',100000);work(a,100000,113000,'continued');
 assert.equal(p(a).certifiedMs,30000);assert.equal(p(a).pendingMs,0);assert.equal(a.L.lots.bundle.reservedBy,a.runId);
 unchanged(a,()=>work(a,113000,120000,'overlapping-intent',{fromWorldMs:T+1000}));
});
test('manual restore requires fresh resume and refuses backdated offline activity',()=>{
 const a=fixture();work(a,0,17000);a.L=restoreCordWork(json(a.L),T+100000);
 assert.equal(p(a).pendingMs,17000);assert.equal(readCordWorksite(a.L,'site',T+100000).activity,'paused');
 unchanged(a,()=>work(a,17000,30000,'offline'));unchanged(a,()=>ctrl(a,'resume',17000,'backdated'));
 ctrl(a,'resume',100000);work(a,100000,113000,'awake');assert.equal(p(a).certifiedMs,30000);
});
test('manual facts require correct actor, real activity, arrival and place',()=>{
 for(const patch of [{activity:'rest'},{activity:'travel'},{activity:'unknown'},{arrived:false},{actorId:'other'},{targetLotId:'other'},{toPosition:{x:5,z:0}}]){
  const a=fixture();work(a,0,30000,'bad',patch);assert.equal(p(a).certifiedMs,0);assert.deepEqual(readCordWorkerObservations(a.L,a.runId,'actor'),[]);
 }
});
test('partitions and JSON reuse preserve manufacturing result and safe observations',()=>{
 const whole=fixture();work(whole,0,120000);
 for(const step of [30000,17000,737]){
  const a=fixture();let n=0;
  for(let t=0;t<120000;t+=step){work(a,t,Math.min(t+step,120000),'f'+n++);a.L=json(a.L);}
  assert.deepEqual(p(a),p(whole));assert.deepEqual(holdings(a.L),holdings(whole.L));
  assert.deepEqual(readCordWorksite(a.L,'site',T+120000),readCordWorksite(whole.L,'site',T+120000));
 }
});
test('sieving makes a separate pith lot, conserving components and water',()=>{
 const a=fixture('sieve');work(a,0,60000);
 const out=Object.values(a.L.lots),b=readCordBundle(out.find(l=>l.materialId==='coir_fiber_bundle')!);
 assert.deepEqual([b.fiberDryMg,b.pithDryMg,b.waterMg],[72000,7200,7260]);
 const pith=out.find(l=>l.materialId==='coir_pith')!;assert.equal(pith.amount.value,7860);
 assert.equal(out.reduce((n,l)=>n+l.amount.value,0),94320);
});
test('returned dry bundle, strand and leftover preserve hidden traits and provenance',()=>{
 const a=fixture();a.L.lots.bundle.quality!.history_complete=0;
 // Source snapshot is immutable: tampering after reservation is refused.
 unchanged(a,()=>work(a,0,120000));
 const b=fixture();work(b,0,120000);
 const strand=Object.values(b.L.lots).find(l=>l.materialId==='coir_strand')!,piece=readCordPiece(strand);
 assert.equal(piece.lengthMm,1000);assert.ok(currentCordStrength(piece)>0);assert.ok('base_strength_gf' in strand.quality!);
 const rest=Object.values(b.L.lots).find(l=>l.materialId==='coir_fiber_bundle')!;readCordBundle(rest);
 const observed=readCordWorkerObservations(b.L,b.runId,'actor');assert.ok(observed.length>0);assert.ok(observed.every(o=>o.channel==='sight'));safe(observed);safe(readCordWorksite(b.L,'site',T+120000));
});
test('zero-duration no-op stages settle exactly once and pith-only tiny remainder is not disguised as fiber',()=>{
 const a=fixture('dry',false,false);a.L.lots.bundle.quality!.water_mg=0;a.L.lots.bundle.amount.value=79200;
 a.runId=applyCordIntent(a.L,a.intent,0,T,a.facts).runId;assert.equal(p(a).status,'completed');assert.equal(Object.keys(a.L.lots).length,1);
 const b=fixture('twist',false,false);b.L.lots.bundle.quality!.fiber_dry_mg=5;b.L.lots.bundle.quality!.attached_pith_dry_mg=1;b.L.lots.bundle.quality!.water_mg=0;b.L.lots.bundle.amount.value=6;b.facts.requestedLengthMm=1;
 b.runId=applyCordIntent(b.L,b.intent,0,T,b.facts).runId;work(b,0,30000);
 assert.equal(Object.values(b.L.lots).find(l=>l.materialId==='coir_pith')!.amount.value,1);
 assert.equal(Object.values(b.L.lots).reduce((n,l)=>n+l.amount.value,0),6);
});
test('start and fact replay survive completion and trimmed global receipts',()=>{
 const a=fixture(),f=span(a,0,120000);recordCordSpan(a.L,a.runId,f,rev(a),T+120000);
 a.L=json(a.L);a.L.committed=[];const old=json(a.L);
 recordCordSpan(a.L,a.runId,f,0,T+120000);assert.deepEqual(applyCordIntent(a.L,a.intent,0,T+120000,a.facts),{runId:a.runId});assert.deepEqual(a.L,old);
 unchanged(a,()=>recordCordSpan(a.L,a.runId,{...f,confirmedAtWorldMs:T+120001},rev(a),T+120001));
});
test('same operator and site cannot be double booked; passive waiting permits other manual work',()=>{
 const a=fixture('dry',true);const f={...a.facts,worksite:{...a.facts.worksite,locationId:'elsewhere'}};
 addProduced(a.L,writeCordBundle({fiberDryMg:10000,pithDryMg:0,waterMg:0},'elsewhere',1),'second');
 const i:CordIntent={kind:'start',intentId:'manual',operation:'twist',actorId:'actor',atWorldMs:T,siteId:'elsewhere',lotIds:['second'],presence:'here'};
 const mf={assumptionId:ID,worksite:f.worksite,requestedLengthMm:100};
 applyCordIntent(a.L,i,rev(a),T,mf);
 const copy={...i,intentId:'third',siteId:'site',actorId:'other',lotIds:['second']} as CordIntent;
 unchanged(a,()=>applyCordIntent(a.L,copy,rev(a),T,{...mf,worksite:a.facts.worksite}));
});
test('husk and cord arrangements share actor/site occupancy in both directions',()=>{
 const a=fixture();addLot(a.L,{lotId:'husk',materialId:'wet_unseparated_coconut_husk',amount:{value:900000,unit:'mg'},location:'husk-site',
 quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
 const i={kind:'start' as const,intentId:'h-start',actorId:'actor',atWorldMs:T,processId:'prototype_manual_husk_work',lotId:'husk',siteId:'husk-site',presence:'here' as const};
 const facts={assumptionId:HA.id,huskCount:1 as const,input:{materialId:'wet_unseparated_coconut_husk' as const,lotId:'husk',separation:'never-separated' as const,dryMg:300000,waterMg:600000,soakHistory:[]},
 worksite:{locationId:'husk-site',x:0,z:0,reachM:1}};
 unchanged(a,()=>applyHuskIntent(a.L,i,0,T,facts));
 ctrl(a,'stop',0);
 applyHuskIntent(a.L,i,0,T,facts);
 unchanged(a,()=>ctrl(a,'resume',1000));
 assert.equal(huskArrangementRevision(a.L),1);assert.equal(readCordWorksite(a.L,'site',T).operatorFree,true);
 a.L=restoreCordWork(json(a.L),T+2000);assert.equal((a.L as any).manualHuskArrangement.jobs[0].controls.at(-1).kind,'restore');
 ctrl(a,'resume',2000);
});
test('resident failure words expose neither codes nor hidden numbers',()=>{
 const a=fixture('twist',true,false);let error:unknown;
 try{applyCordIntent(a.L,a.intent,0,T,a.facts);}catch(e){error=e;}
 assert.ok(error instanceof CordWorkError);assert.match(cordFailureObservations(error,{kind:'host-confirmed-on-site-attempt'})[0].text,/湿って/);safe(cordFailureObservations(error,{kind:'host-confirmed-on-site-attempt'}));assert.match(cordFailureObservations(error)[0].text,/作業場/);
 assert.equal(cordWorkRevision(a.L),0);assert.ok(!a.L.lots.bundle.reservedBy);
 const b=fixture('twist',false,false);b.facts.requestedLengthMm=99999999;
 try{applyCordIntent(b.L,b.intent,0,T,b.facts);}catch(e){assert.match(cordFailureObservations(e,{kind:'host-confirmed-on-site-attempt'})[0].text,/足りない/);safe(cordFailureObservations(e));}
});
test('future and malformed facts, wrong worlds, corrupt cached state and reservations reject atomically',()=>{
 const patches=[{worldEpoch:'wrong'},{runId:'wrong'},{confirmedAtWorldMs:T-1},{fromPosition:null},{activity:'fake'},{extra:1}];
 for(const patch of patches){const a=fixture();unchanged(a,()=>work(a,0,30000,'bad',patch));}
 const a=fixture();unchanged(a,()=>recordCordSpan(a.L,a.runId,span(a,0,30000),rev(a),T+29999));
 for(const edit of [(a:F)=>(a.L.runs[a.runId].state!.data as any).pendingMs++,(a:F)=>delete a.L.lots.bundle.reservedBy,(a:F)=>(a.L.cordArrangement as any).worldEpoch='wrong']){
  const b=fixture();edit(b);unchanged(b,()=>work(b,0,30000));
 }
});
test('actual PR22 output traverses drying, sieve, three twists and rope with integer ledger closure',()=>{
 const L:CordWorkLedger=emptyLedger('chain','1'),input={materialId:'wet_unseparated_coconut_husk' as const,lotId:'husk',separation:'never-separated' as const,dryMg:300000,waterMg:600000,soakHistory:[]};
 addLot(L,{lotId:'husk',materialId:input.materialId,amount:{value:900000,unit:'mg'},location:'site',quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
 const h=beginManualHuskWork(L,{commandId:'h',assumptionId:HA.id,operatorId:'actor',huskCount:1,input,worksite:{locationId:'site',x:0,z:0,reachM:1},openedAtWorldMs:T});
 recordManualHuskSpan(L,h.runId,{kind:'executor-activity-span',spanId:'h',worldId:'chain',worldEpoch:'1',runId:h.runId,actorId:'actor',
 fromWorldMs:T,toWorldMs:T+240000,confirmedAtWorldMs:T+240000,activity:'separate-wet-husk',arrived:true,targetLotId:'husk',targetSiteId:'site',fromPosition:{x:0,z:0},toPosition:{x:0,z:0}},T+240000);
 let t=T+240000,n=0;const strands:string[]=[];
 function process(op:'dry'|'sieve'|'twist'|'ply',lotIds:string[],dt:number,len?:number){
  const facts:CordStartFacts={assumptionId:ID,worksite:{locationId:'site',x:0,z:0,reachM:1},...(op==='dry'?{roofed:true}:op==='twist'?{requestedLengthMm:len}:{})};
  const runId=applyCordIntent(L,{kind:'start',intentId:'step'+n,actorId:'actor',atWorldMs:t,operation:op,lotIds,siteId:'site',presence:'here'},cordWorkRevision(L),t,facts).runId;
  const base={spanId:'s'+n++,worldId:'chain',worldEpoch:'1',runId,fromWorldMs:t,toWorldMs:t+dt,confirmedAtWorldMs:t+dt};
  const frame:CordSpan=op==='dry'?{kind:'confirmed-roofed-wait',...base,siteId:'site',roofed:true}:{kind:'executor-activity-span',...base,actorId:'actor',activity:op==='sieve'?'sieve-coir':op==='ply'?'ply-coir':'twist-coir',arrived:true,targetLotId:lotIds[0],targetSiteId:'site',fromPosition:{x:0,z:0},toPosition:{x:0,z:0}};
  recordCordSpan(L,runId,frame,cordWorkRevision(L),t+dt);t+=dt;assert.equal(projectCordWork(L,runId).status,'completed');return runId;
 }
 const find=(m:string)=>Object.values(L.lots).find(l=>l.materialId===m)!.lotId;
 process('dry',[find('coir_fiber_bundle')],Math.ceil(R.dryIslandMs/ISLAND_RATE)+1);
 process('sieve',[find('coir_fiber_bundle')],60000);
 for(let k=0;k<3;k++){process('twist',[find('coir_fiber_bundle')],660000,5280);strands.push(Object.values(L.lots).filter(l=>l.materialId==='coir_strand'&&!strands.includes(l.lotId))[0].lotId);}
 process('ply',strands,300000);
 const rope=readCordPiece(Object.values(L.lots).find(l=>l.materialId==='coir_rope')!);assert.equal(rope.lengthMm,4752);
 assert.equal(Object.values(L.lots).reduce((n,l)=>n+BigInt(l.amount.value),0n)+L.released!.reduce((n,r)=>n+BigInt(r.mg),0n),900000n);
 assert.equal(Object.values(L.lots).find(l=>l.materialId==='coir_rope')!.amount.value,87120);
});
console.log('PASS coir work arrangement: '+groups+' groups; no production resident/UI registration.');
