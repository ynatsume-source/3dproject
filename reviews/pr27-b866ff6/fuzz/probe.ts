import {emptyLedger,addLot} from '../src/world/process-runner';
import {MANUAL_HUSK_ASSUMPTION as A} from '../src/science/prototypes/manual-husk-assumptions';
import {MANUAL_HUSK_WORK,projectManualHuskWork} from '../src/world/manual-husk-work';
import {applyHuskIntent,recordHuskWorkflowSpan,huskArrangementRevision as rev,restoreHuskArrangement} from '../src/world/manual-husk-workflow';
const J=(v:any)=>JSON.stringify(v);
let L:any=emptyLedger('w','e');addLot(L,{lotId:'husk',materialId:'wet_unseparated_coconut_husk',amount:{value:900000,unit:'mg'},location:'site',quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
const facts:any={assumptionId:A.id,huskCount:1,input:{materialId:'wet_unseparated_coconut_husk',lotId:'husk',separation:'never-separated',dryMg:300000,waterMg:600000,soakHistory:[]},worksite:{locationId:'site',x:0,z:0,reachM:1}};
const sp=(runId:string,t:number,len:number,id:string)=>({kind:'executor-activity-span',spanId:id,worldId:'w',worldEpoch:'e',runId,actorId:'a',fromWorldMs:t,toWorldMs:t+len,confirmedAtWorldMs:t+len,activity:'separate-wet-husk',arrived:true,targetLotId:'husk',targetSiteId:'site',fromPosition:{x:0,z:0},toPosition:{x:0,z:0}}) as any;
const r1=applyHuskIntent(L,{intentId:'st1',kind:'start',actorId:'a',processId:MANUAL_HUSK_WORK.processId,lotId:'husk',siteId:'site',atWorldMs:1000,presence:'here'},0,1000,facts).runId;
recordHuskWorkflowSpan(L,r1,sp(r1,1000,29999,'f1'),rev(L),30999); // sub-quantum fragment
applyHuskIntent(L,{intentId:'s1',kind:'stop',actorId:'a',runId:r1,atWorldMs:31000},rev(L),31000);
applyHuskIntent(L,{intentId:'ab1',kind:'abandon',actorId:'a',runId:r1,atWorldMs:32000},rev(L),32000);
console.log('after abandon:',J(Object.values(L.lots).map((l:any)=>[l.lotId,l.materialId,l.amount.value,l.quality.unseparated,l.reservedBy??null])));
L=restoreHuskArrangement(JSON.parse(J(L)),40000);
const r2=applyHuskIntent(L,{intentId:'st2',kind:'start',actorId:'b',processId:MANUAL_HUSK_WORK.processId,lotId:'husk',siteId:'site',atWorldMs:50000,presence:'here'},rev(L),50000,facts).runId;
const f2={...sp(r2,50000,240000,'f2'),actorId:'b'};recordHuskWorkflowSpan(L,r2,f2,rev(L),290000);
console.log('second run:',projectManualHuskWork(L,r2).status,'r1:',projectManualHuskWork(L,r1).status,'lots:',J(Object.values(L.lots).map((l:any)=>[l.materialId,l.amount.value])),'total',Object.values(L.lots).reduce((a:number,l:any)=>a+l.amount.value,0));
