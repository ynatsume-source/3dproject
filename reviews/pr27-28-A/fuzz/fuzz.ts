import {emptyLedger,addLot} from '../src/world/process-runner';
import {MANUAL_HUSK_ASSUMPTION as A} from '../src/science/prototypes/manual-husk-assumptions';
import {MANUAL_HUSK_WORK,projectManualHuskWork} from '../src/world/manual-husk-work';
import {applyHuskIntent,recordHuskWorkflowSpan,restoreHuskArrangement,huskArrangementRevision as rev,readHuskResidentObservations,readHuskWorksite} from '../src/world/manual-husk-workflow';
let s=31n;const r=(n:number)=>{s=(s*6364136223846793005n+1442695040888963407n)%(1n<<64n);return Number((s>>11n)%BigInt(Math.max(1,n)));};
const J=(v:any)=>JSON.stringify(v);const bad:string[]=[];const B=(x:string)=>{if(bad.length<30)bad.push(x);};const cnt:Record<string,number>={};const inc=(k:string)=>cnt[k]=(cnt[k]||0)+1;
const mk=()=>{const L:any=emptyLedger('w','e');addLot(L,{lotId:'husk',materialId:'wet_unseparated_coconut_husk',amount:{value:900000,unit:'mg'},location:'site',quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
 const facts:any={assumptionId:A.id,huskCount:1,input:{materialId:'wet_unseparated_coconut_husk',lotId:'husk',separation:'never-separated',dryMg:300000,waterMg:600000,soakHistory:[]},worksite:{locationId:'site',x:0,z:0,reachM:1}};
 const {runId}=applyHuskIntent(L,{intentId:'st',kind:'start',actorId:'a',processId:MANUAL_HUSK_WORK.processId,lotId:'husk',siteId:'site',atWorldMs:1000,presence:'here'},0,1000,facts);return {L,runId};};
// demo: zero work abandon
{const {L,runId}=mk();applyHuskIntent(L,{intentId:'s1',kind:'stop',actorId:'a',runId,atWorldMs:2000},rev(L),2000);applyHuskIntent(L,{intentId:'ab',kind:'abandon',actorId:'a',runId,atWorldMs:3000},rev(L),3000);
 console.log('ZERO-WORK ABANDON lots:',J(Object.values(L.lots).map((l:any)=>[l.materialId,l.amount.value,l.quality])));}
const sp=(runId:string,actor:string,t:number,len:number,id:string)=>({kind:'executor-activity-span',spanId:id,worldId:'w',worldEpoch:'e',runId,actorId:actor,fromWorldMs:t,toWorldMs:t+len,confirmedAtWorldMs:t+len,activity:'separate-wet-husk',arrived:true,targetLotId:'husk',targetSiteId:'site',fromPosition:{x:0,z:0},toPosition:{x:0,z:0}}) as any;
for(let c=0;c<300;c++){
 let {L,runId}=mk();let t=1000,cur='a',engaged=true,avail=0,n=0,ended=false;const actors=['a','b','c'];
 for(let k=0;k<50&&!ended;k++){
  const o=r(12);
  try{
  if(o<6){const who=r(5)===0?actors[r(3)]:cur;const len=1+r(60000);const f=sp(runId,who,t,len,'s'+n++);const before=J(L);
   try{recordHuskWorkflowSpan(L,runId,f,rev(L),t+len);if(engaged&&who===cur)avail+=len;else if(who===cur&&!engaged)B('accepted while paused');}
   catch(e){if(J(L)!==before)B('mutated');if(engaged&&who===cur)B('valid rejected '+(e as any).code);}
   t+=len;}
  else if(o<8){t+=1+r(3000);if(engaged){applyHuskIntent(L,{intentId:'i'+n++,kind:'stop',actorId:cur,runId,atWorldMs:t},rev(L),t);engaged=false;}else{applyHuskIntent(L,{intentId:'i'+n++,kind:'resume',actorId:cur,runId,atWorldMs:t,presence:'here'},rev(L),t);engaged=true;}}
  else if(o<10){t+=1+r(3000);if(!engaged){const nw=actors.filter(x=>x!==cur)[r(2)];applyHuskIntent(L,{intentId:'i'+n++,kind:'takeover',actorId:nw,runId,atWorldMs:t,presence:'here'},rev(L),t);cur=nw;engaged=true;inc('takeover');}}
  else if(o<11){t+=r(1e5);L=restoreHuskArrangement(JSON.parse(J(L)),t);engaged=false;}
  else {if(!engaged){t+=1;const cert=projectManualHuskWork(L,runId).certifiedWorkMs;applyHuskIntent(L,{intentId:'i'+n++,kind:'abandon',actorId:cur,runId,atWorldMs:t},rev(L),t);ended=true;inc('abandon');
     const tot=Object.values(L.lots).reduce((a:number,l:any)=>a+l.amount.value,0);if(tot!==900000||L.lots.husk)B('abandon balance');
     const p=projectManualHuskWork(L,runId);if(p.certifiedWorkMs!==cert||p.status!=='stopped')B('abandon cert');
     const v=readHuskWorksite(L,'site',t);if(/\d/.test(J(v)))B('digits');
     try{recordHuskWorkflowSpan(L,runId,sp(runId,cur,t,5000,'late'),rev(L),t+5000);B('span after abandon accepted');}catch{}
  }}
  }catch(e){B('op'+o+' '+(e as any).code);}
  const p=projectManualHuskWork(L,runId);if(p.status==='completed'){ended=true;inc('completed');}
  if(!ended&&p.certifiedWorkMs!==Math.min(Math.floor(avail/30000)*30000,240000))B(`cert ${p.certifiedWorkMs} vs ${avail}`);
 }
}
console.log(J({cnt,bad:bad.length,first:bad.slice(0,8)}));
