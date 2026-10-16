import {emptyLedger,addLot,toClock} from '../src/world/process-runner';
import {ISLAND_EPOCH} from '../src/world/island-time';
import {COIR_CORD_ASSUMPTION_ID as ID} from '../src/science/prototypes/coir-cord-types';
import {currentCordStrength} from '../src/science/prototypes/coir-cord-damage';
import {readCordPiece,writeCordBundle} from '../src/world/coir-cord-lots';
import {applyCordIntent,recordCordSpan,restoreCordWork,cordWorkRevision as rev,projectCordWork,readCordWorksite,readCordWorkerObservations} from '../src/world/coir-cord-work';
import {applyCordLoad,validateCordLoadLedger} from '../src/world/coir-cord-load';
let s=4242n;const r=(n:number)=>{s=(s*6364136223846793005n+1442695040888963407n)%(1n<<64n);return Number((s>>11n)%BigInt(Math.max(1,Math.floor(n))));};
const bad:string[]=[];const B=(x:string)=>{if(bad.length<40)bad.push(x);};const cnt:Record<string,number>={};const inc=(k:string)=>cnt[k]=(cnt[k]||0)+1;
const J=(v:any)=>JSON.stringify(v);const Q=30000;
const total=(L:any)=>Object.values(L.lots).reduce((a:number,l:any)=>a+l.amount.value,0);
function vapor(L:any){let v=0;for(const x of L.released??[])if(x.materialId==='water_vapor')v+=x.mg;return v;}
for(let c=0;c<360;c++){
 const op=(['dry','sieve','twist'] as const)[c%3];
 let L:any=emptyLedger('w','e');const T=ISLAND_EPOCH+1000+r(1e6);
 const f=1000+r(200000),p=r(Math.floor(f*0.2)+1),w=op==='dry'?r(3*(f+p)):r(Math.floor((f+p)/10)+1);
 const prod=writeCordBundle({fiberDryMg:f,pithDryMg:p,waterMg:w},'site',1);
 addLot(L,{lotId:'b',materialId:prod.materialId,amount:prod.amount,location:'site',quality:prod.quality});
 const start0=total(L);
 const req=op==='twist'?1+r(Math.floor((f+p)/5)):undefined;
 const facts:any={assumptionId:ID,worksite:{locationId:'site',x:0,z:0,reachM:1},...(op==='dry'?{roofed:true}:op==='twist'?{requestedLengthMm:req}:{})};
 let runId:string;try{runId=applyCordIntent(L,{kind:'start',intentId:'st',actorId:'a',atWorldMs:T,operation:op,lotIds:['b'],siteId:'site',presence:'here'},0,T,facts).runId;}catch(e){B('start '+op+' '+(e as any).code);continue;}
 const cap0=projectCordWork(L,runId);if(cap0.status==='completed'){inc('zero-'+op);continue;}
 // cap in clock units
 const clk=op==='dry'?'island':'world';
 const dur=op==='dry'?3*86400000:op==='sieve'?Math.ceil(f*60000/72000):req!*120; const cap=Math.ceil(dur/Q)*Q;
 let t=T,engaged=true,avail=0,n=0,done=false,settled='';
 for(let k=0;k<80&&!done;k++){
  const o=r(10);
  try{
   if(o<6){ const len=1+(op==='dry'?r(2000000):r(90000)); const good=r(7)>0;
     const sp:any=op==='dry'?{kind:'confirmed-roofed-wait',spanId:'s'+n++,worldId:'w',worldEpoch:'e',runId,fromWorldMs:t,toWorldMs:t+len,confirmedAtWorldMs:t+len,siteId:'site',roofed:good}
      :{kind:'executor-activity-span',spanId:'s'+n++,worldId:'w',worldEpoch:'e',runId,fromWorldMs:t,toWorldMs:t+len,confirmedAtWorldMs:t+len,actorId:'a',activity:good?(op==='sieve'?'sieve-coir':'twist-coir'):'rest',arrived:true,targetLotId:'b',targetSiteId:'site',fromPosition:{x:0,z:0},toPosition:{x:0,z:0}};
     const before=J(L);
     try{recordCordSpan(L,runId,sp,rev(L),t+len); if(good){ if(!engaged&&op!=='dry')B('work while paused'); else avail+=toClock(clk,t+len)-toClock(clk,t);} }
     catch(e){ if(J(L)!==before)B('mutate on reject'); if(engaged||!good)B('rejected valid '+(e as any).code+' '+op); else inc('reject-paused'); }
     t+=len;
   }else if(o<7&&op!=='dry'){ t+=r(9000); if(engaged){applyCordIntent(L,{kind:'stop',intentId:'i'+n++,actorId:'a',runId,atWorldMs:t},rev(L),t);engaged=false;}else{applyCordIntent(L,{kind:'resume',intentId:'i'+n++,actorId:'a',runId,atWorldMs:t,presence:'here'},rev(L),t);engaged=true;} }
   else if(o<8){ t+=r(5e5); L=restoreCordWork(JSON.parse(J(L)),t); if(op!=='dry')engaged=false; inc('restore'); }
   else { const v=readCordWorksite(L,'site',t);const ob=readCordWorkerObservations(L,runId,'a'); if(/\d|gf|mg/.test(J(v)+J(ob)))B('leak '+J(v)); }
  }catch(e){B('op '+o+' '+(e as any).code+' '+op);}
  const pr=projectCordWork(L,runId);const expect=Math.min(Math.floor(avail/Q)*Q,cap);
  if(pr.certifiedMs!==expect)B(`${op} certified ${pr.certifiedMs} vs ${expect}`);
  if(pr.status==='completed'){done=true;inc('done-'+op);
   if(total(L)+vapor(L)!==start0)B(`${op} balance ${total(L)}+${vapor(L)} vs ${start0}`);
   if(L.lots.b)B('source not consumed');
   if(op==='twist'){const strand:any=Object.values(L.lots).find((l:any)=>l.materialId==='coir_strand');const pc=readCordPiece(strand);if(pc.lengthMm!==req||pc.fiberDryMg+pc.pithDryMg!==req!*5)B('strand len/mass');
     // loads: monotone strength and break conservation
     let lot=strand.lotId,wt=t,it=toClock('island',t),prev=currentCordStrength(pc);
     for(let j=0;j<6;j++){const kind=r(3);const ev:any=kind===0?{kind:'exposure',fromIslandMs:it,toIslandMs:it+1+r(1e10),shade:!!r(2)}:kind===1?{kind:'abrasion',count:r(5)}:{kind:'load',gf:r(50000)};
       if(kind===0)it=ev.toIslandMs; wt+=1000;
       const before=total(L);
       try{const res=applyCordLoad(L,{commandId:'L'+c+'_'+j,assumptionId:ID,lotId:lot,worldAtMs:wt,islandAtMs:it,event:ev});
         if(total(L)!==before)B('load mass');
         const pieces=res.lotIds.map((id:string)=>readCordPiece(L.lots[id]));
         if(pieces.length===2){inc('broke');if(!(ev.kind==='load'&&ev.gf>prev))B('broke wrongly');if(pieces[0].lengthMm+pieces[1].lengthMm!==pc.lengthMm)B('len');break;}
         const now=currentCordStrength(pieces[0]);if(now>prev)B('strength rose');if(ev.kind==='load'&&ev.gf>prev)B('should break');prev=now;
         const again=applyCordLoad(L,{commandId:'L'+c+'_'+j,assumptionId:ID,lotId:lot,worldAtMs:wt,islandAtMs:it,event:ev});if(J(again.lotIds)!==J(res.lotIds)||total(L)!==before)B('replay changed');lot=res.lotIds[0];
       }catch(e){if(String((e as any).code)==='event-refused'&&ev.kind==='load'){inc('unsplit');break;}B('load '+(e as any).code);break;}}
     validateCordLoadLedger(L);
   }
  } else if(L.lots.b?.reservedBy!==runId)B('reservation lost');
 }
}
console.log(J({cnt,bad:bad.length,first:bad.slice(0,10)}));
