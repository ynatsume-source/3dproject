import {emptyLedger,addLot} from '../src/world/process-runner';
import {MANUAL_HUSK_ASSUMPTION as A} from '../src/science/prototypes/manual-husk-assumptions';
import {MANUAL_HUSK_WORK,projectManualHuskWork} from '../src/world/manual-husk-work';
import {applyHuskIntent,recordHuskWorkflowSpan,restoreHuskArrangement,huskArrangementRevision as rev,readHuskWorksite,readHuskResidentObservations} from '../src/world/manual-husk-workflow';
let s=99n;const r=(n:number)=>{s=(s*6364136223846793005n+1442695040888963407n)%(1n<<64n);return Number((s>>11n)%BigInt(Math.max(1,n)));};
const bad:string[]=[];const B=(x:string)=>{if(bad.length<50)bad.push(x);};const cnt:Record<string,number>={};const inc=(k:string)=>cnt[k]=(cnt[k]||0)+1;
const J=(v:any)=>JSON.stringify(v);
for(let c=0;c<300;c++){
 let L:any=emptyLedger('w','e');
 addLot(L,{lotId:'husk',materialId:'wet_unseparated_coconut_husk',amount:{value:900000,unit:'mg'},location:'site',quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:1}});
 const facts:any={assumptionId:A.id,huskCount:1,input:{materialId:'wet_unseparated_coconut_husk',lotId:'husk',separation:'never-separated',dryMg:300000,waterMg:600000,soakHistory:[]},worksite:{locationId:'site',x:0,z:0,reachM:1}};
 let t=1000;const {runId}=applyHuskIntent(L,{intentId:'st',kind:'start',actorId:'a',processId:MANUAL_HUSK_WORK.processId,lotId:'husk',siteId:'site',atWorldMs:t,presence:'here'},0,t,facts);
 let engaged=true,sum=0,n=0,done=false,settledLots='';
 for(let k=0;k<60;k++){
  const op=r(10);
  const sp=(act:string,len:number,inside=true)=>({kind:'executor-activity-span',spanId:'sp'+n++,worldId:'w',worldEpoch:'e',runId,actorId:'a',fromWorldMs:t,toWorldMs:t+len,confirmedAtWorldMs:t+len,activity:act,targetLotId:'husk',targetSiteId:'site',arrived:true,fromPosition:{x:0,z:0},toPosition:inside?{x:0.5,z:0}:{x:3,z:0}});
  try{
  if(op<5){const len=1+r(70000);const f:any=sp('separate-wet-husk',len,r(8)>0);const isWork=f.toPosition.x<1;
   const before=J(L);
   try{recordHuskWorkflowSpan(L,runId,f,rev(L),f.confirmedAtWorldMs);
     if(isWork&&!engaged)B('work accepted while paused'); if(done)B('accepted after done'); t+=len; if(isWork&&engaged){sum+=len;inc('work');}}
   catch(e){ if(J(L)!==before)B('mutated on reject'); if(engaged&&!done) B('valid span rejected '+e+(e as any).code); else inc('rejected-ok'); t+=len; /* advance anyway: gap */ }
  }else if(op<6){const len=1+r(20000);const f:any=sp('rest',len);try{recordHuskWorkflowSpan(L,runId,f,rev(L),f.confirmedAtWorldMs);t+=len;}catch(e){if(!done)B('rest rejected '+(e as any).code);t+=len;}}
  else if(op<7){ if(done)continue; t+=r(5000); if(engaged){applyHuskIntent(L,{intentId:'i'+n++,kind:'stop',actorId:'a',runId,atWorldMs:t},rev(L),t);engaged=false;inc('stop');} else {applyHuskIntent(L,{intentId:'i'+n++,kind:'resume',actorId:'a',runId,atWorldMs:t,presence:'here'},rev(L),t);engaged=true;inc('resume');}}
  else if(op<8){ t+=r(1e6); L=restoreHuskArrangement(JSON.parse(J(L)),t); if(!done)engaged=false; inc('restore'); }
  else { const v=readHuskWorksite(L,'site',t); const o=readHuskResidentObservations(L,runId,'a'); if(/\d/.test(J(v))||/\d/.test(J(o)))B('digits in view '+J(v)); }
  }catch(e){ if(!(done&&op===6))B('op'+op+' threw '+(e as any).code+' done='+done); }
  const p=projectManualHuskWork(L,runId);
  const expect=Math.min(Math.floor(sum/30000)*30000,240000);
  if(p.certifiedWorkMs!==expect)B(`certified ${p.certifiedWorkMs} vs ${expect} c${c}k${k}`);
  const nowDone=p.status==='completed';
  if(nowDone!==(sum>=240000))B('completion mismatch');
  if(nowDone){ const lots=J(Object.values(L.lots).map((l:any)=>[l.materialId,l.amount.value]).sort());
    if(!done){done=true;engaged=false;inc('settled');settledLots=lots;
      const tot=Object.values(L.lots).reduce((a:number,l:any)=>a+l.amount.value,0); if(tot!==900000||L.lots.husk)B('settle balance '+lots);}
    else if(lots!==settledLots)B('resettled');}
  else if(L.lots.husk?.reservedBy!==runId)B('reservation lost');
 }
}
console.log(J({cnt,bad:bad.length,first:bad.slice(0,8)}));
