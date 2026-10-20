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
function action(a:F,kind:'takeover'|'abandon',at:number,actorId='actor',intentId=kind){
 return applyHuskIntent(a.L,{kind,intentId,actorId,runId:a.runId,atWorldMs:1000+at,...(kind==='takeover'?{presence:'here' as const}:{})} as HuskIntent,rev(a),1000+at);
}
const balance=(a:F)=>{
 const lots=Object.values(a.L.lots);assert.equal(lots.reduce((n,l)=>n+BigInt(l.amount.value),0n),900000n);
 let dry=0n,water=0n;for(const l of lots){const q=l.quality!;if(l.materialId==='coir_fiber_bundle'){dry+=BigInt(q.fiber_dry_mg+q.attached_pith_dry_mg);water+=BigInt(q.water_mg);}
 else if(['wet_unseparated_coconut_husk','partially_separated_coconut_husk'].includes(l.materialId)){dry+=BigInt(q.dry_mg);water+=BigInt(q.water_mg);}else if(l.materialId==='husk_drainage_water')water+=BigInt(q.water_mg);else assert.fail(l.materialId);}
 assert.equal(dry,300000n);assert.equal(water,600000n);assert.ok(lots.every(l=>!l.reservedBy));
};
test('takeover and cleanup require pause; new actor differs and history remains',()=>{
 const a=fixture();unchanged(a,()=>action(a,'takeover',0,'new'));unchanged(a,()=>action(a,'abandon',0));control(a,'stop',0);
 unchanged(a,()=>action(a,'takeover',0));action(a,'takeover',0,'new');
 assert.equal(a.L.runs[a.runId].operator,'new');assert.deepEqual((a.L.runs[a.runId].state!.data as any).assignments,[{actorId:'actor',atWorldMs:1000},{actorId:'new',atWorldMs:1000}]);
});
test('17s old and 13s new certify 30s while former actor afterward does nothing',()=>{
 const a=fixture();work(a,0,17000);control(a,'stop',17000);action(a,'takeover',20000,'new');
 work(a,20000,50000,'former');assert.equal(projectManualHuskWork(a.L,a.runId).certifiedWorkMs,0);
 assert.deepEqual(readHuskResidentObservations(a.L,a.runId,'new'),[]);
 work(a,50000,63000,'new',{actorId:'new'});assert.equal(projectManualHuskWork(a.L,a.runId).certifiedWorkMs,30000);
 const d=a.L.runs[a.runId].state!.data as any;assert.deepEqual(d.science.confirmedIntervals.map((i:any)=>[i.actorId,i.toWorldMs-i.fromWorldMs]),[['actor',17000],['new',13000]]);
 assert.deepEqual(readHuskResidentObservations(a.L,a.runId,'actor'),[]);
});
test('restore allows a different actor and returned actor must reconfirm own work',()=>{
 const a=fixture();work(a,0,17000);a.L=restoreHuskArrangement(json(a.L),1001000);
 action(a,'takeover',1000000,'new');work(a,1000000,1013000,'new',{actorId:'new'});
 applyHuskIntent(a.L,{kind:'stop',intentId:'stop-new',actorId:'new',runId:a.runId,atWorldMs:1014000},rev(a),1014000);
 action(a,'takeover',1014000,'actor','back');assert.deepEqual(readHuskResidentObservations(a.L,a.runId,'actor'),[]);
 assert.equal(projectManualHuskWork(a.L,a.runId).certifiedWorkMs,30000);
});
test('certified partial cleanup checkpoints close dry/water and never return a new whole husk',()=>{
 for(const ms of [30000,47000,60000,119999,239999]){
 const a=fixture();if(ms)work(a,0,ms);const p=projectManualHuskWork(a.L,a.runId);
 control(a,'stop',ms);action(a,'abandon',ms);const q=projectManualHuskWork(a.L,a.runId);
 assert.equal(q.status,'stopped');assert.deepEqual(q.pools,p.pools);assert.equal(q.certifiedWorkMs,Math.floor(ms/30000)*30000);balance(a);
 assert.ok(!Object.values(a.L.lots).some(l=>l.materialId==='wet_unseparated_coconut_husk'));
 assert.equal(Object.values(a.L.lots).find(l=>l.materialId==='partially_separated_coconut_husk')!.quality!.unseparated,0);
 }
});
test('cleanup replay after JSON/global trim never consumes twice or resumes',()=>{
 const a=fixture();work(a,0,47000);control(a,'stop',47000);action(a,'abandon',48000);a.L=json(a.L);a.L.committed=[];const before=json(a.L);
 applyHuskIntent(a.L,{kind:'abandon',intentId:'abandon',actorId:'actor',runId:a.runId,atWorldMs:49000},0,50000);
 assert.deepEqual(a.L,before);unchanged(a,()=>work(a,49000,79000,'late'));unchanged(a,()=>control(a,'resume',49000));balance(a);
});
test('cleanup partitions and takeover produce the same physical lots',()=>{
 const whole=fixture();work(whole,0,90000);control(whole,'stop',90000);action(whole,'abandon',90000);
 const a=fixture();work(a,0,17000);control(a,'stop',17000);action(a,'takeover',20000,'new');work(a,20000,93000,'new',{actorId:'new'});
 applyHuskIntent(a.L,{kind:'stop',intentId:'stop-new',actorId:'new',runId:a.runId,atWorldMs:94000},rev(a),94000);
 action(a,'abandon',93000,'new');assert.deepEqual(holdings(a),holdings(whole));balance(a);
});
test('former actor cannot control new actor and cross-assignment spans reject',()=>{
 const a=fixture();control(a,'stop',17000);action(a,'takeover',20000,'new');unchanged(a,()=>control(a,'stop',30000));
 unchanged(a,()=>work(a,0,30000,'cross'));
});
test('old schemas and forged assignment histories fail before inventory changes',()=>{
 for(const change of [(a:F)=>a.L.runs[a.runId].state!.schema='civ-world.manual-husk-work/1',(a:F)=>(a.L.manualHuskArrangement as any).schema='civ-world.manual-husk-arrangement/1']){
 const a=fixture();change(a);unchanged(a,()=>control(a,'stop',0));}
 const a=fixture();control(a,'stop',0);action(a,'takeover',1000,'new');(a.L.runs[a.runId].state!.data as any).assignments[1].actorId='forged';
 unchanged(a,()=>work(a,1000,31000,'new',{actorId:'new'}));
});
test('cleanup frees the worksite and public data contains no hidden numbers or recipe',()=>{
 const a=fixture();work(a,0,47000);control(a,'stop',47000);action(a,'abandon',48000);
 const v=readHuskWorksite(a.L,'site',49000);assert.equal(v.activity,'abandoned');assert.equal(v.materialsReserved,false);assert.equal(v.operatorFree,true);
 function safe(v:any){if(Array.isArray(v)){v.forEach(safe);return;}if(v&&typeof v==='object'){Object.values(v).forEach(safe);return;}assert.notEqual(typeof v,'number');if(typeof v==='string')assert.ok(!/[0-9]|mg|gf|seed|仮定|キメ値|先に振る/.test(v));}
 safe(v);safe(readHuskResidentObservations(a.L,a.runId,'actor'));balance(a);
});

test('B1 zero certified work releases the exact original husk without replacing it',()=>{
 for(const ms of [0,1,17000,29999]){
 // Extra quality is part of the immutable source; start with it recorded.
 const b=fixture(false);b.L.lots.husk.quality!.extra_provenance=7;
 const original=json(b.L.lots.husk);
 b.runId=applyHuskIntent(b.L,b.intent,0,1000,b.facts).runId;
 const seq=b.L.seq;if(ms)work(b,0,ms);control(b,'stop',ms);action(b,'abandon',ms);
 assert.deepEqual(b.L.lots,{husk:original});assert.equal(b.L.seq,seq);
 assert.equal(p(b).certifiedWorkMs,0);assert.equal(p(b).status,'stopped');
 assert.equal(readHuskWorksite(b.L,'site',1000+ms).stage,'手つかずの殻を片付けた');
 assert.deepEqual(readHuskResidentObservations(b.L,b.runId,'actor'),[{channel:'sight',text:'殻を手つかずのまま脇に置いた。'}]);
 assert.equal(b.L.runs[b.runId],undefined);
 assert.equal((b.L as any).manualHuskRecords.finished.at(-1).projection.abandonedAtWorldMs,1000+ms);
 balance(b);
 }
});
test('B1 the untouched same husk can restart, survive replay/restore, and finish',()=>{
 for(const ms of [0,1,17000,29999]){
 const a=fixture();if(ms)work(a,0,ms);control(a,'stop',ms);
 const abandonedRun=a.runId,close:HuskIntent={kind:'abandon',intentId:'abandon',actorId:'actor',runId:abandonedRun,atWorldMs:1000+ms};
 applyHuskIntent(a.L,close,rev(a),1000+ms);
 const freshAt=2000+ms;
 a.runId=applyHuskIntent(a.L,{...a.intent,intentId:'fresh-start',atWorldMs:freshAt},rev(a),freshAt,a.facts).runId;
 assert.notEqual(a.runId,abandonedRun);assert.equal(a.L.lots.husk.reservedBy,a.runId);assert.equal(p(a).certifiedWorkMs,0);
 a.L=json(a.L);a.L.committed=[];const before=json(a.L);
 assert.equal(applyHuskIntent(a.L,close,0,freshAt).runId,abandonedRun);assert.deepEqual(a.L,before);
 a.L=restoreHuskArrangement(json(a.L),freshAt);
 control(a,'resume',ms+1000,'fresh-resume');
 work(a,ms+1000,ms+1000+239999,'fresh-prefix');
 assert.equal(p(a).status,'running');assert.equal(p(a).certifiedWorkMs,210000);
 work(a,ms+1000+239999,ms+1000+240000,'fresh-last');
 assert.equal(p(a).status,'completed');assert.equal(p(a).certifiedWorkMs,240000);balance(a);
 const complete=json(a.L);applyHuskIntent(a.L,close,0,freshAt+240000);assert.deepEqual(a.L,complete);
 }
});
test('B1 pending work across takeover is still untouched when the job is abandoned',()=>{
 const a=fixture(),original=json(a.L.lots.husk);delete original.reservedBy;
 work(a,0,17000);control(a,'stop',17000);action(a,'takeover',20000,'new');
 work(a,20000,32000,'new-span',{actorId:'new'});
 applyHuskIntent(a.L,{kind:'stop',intentId:'stop-new',actorId:'new',runId:a.runId,atWorldMs:33000},rev(a),33000);
 action(a,'abandon',32000,'new');assert.equal(p(a).certifiedWorkMs,0);
 assert.deepEqual(a.L.lots,{husk:original});balance(a);
});

console.log('PASS manual husk handover: '+groups+' groups.');
