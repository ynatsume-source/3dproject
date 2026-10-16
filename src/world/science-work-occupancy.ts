// Occupancy only: no clock, material state, scheduling or second world host.
import type {Ledger} from './process-runner';
export function otherScienceWorkBusy(L:Ledger,actorId:string,siteId:string,ownProcess:string):{actor:boolean;site:boolean}{
 let actor=false,site=false;
 for(const r of Object.values(L.runs)){
  if(r.processId===ownProcess||!['starting','running','needs-input'].includes(r.status))continue;
  if(!['prototype_manual_husk_work','prototype_coir_work'].includes(r.processId))continue;
  const d=r.state?.data as any;
  let who:string,where:string,engaged:boolean,manual=true;
  if(r.processId==='prototype_manual_husk_work'){
   if(r.state?.schema!=='civ-world.manual-husk-work/1'||!d?.spec)throw Error('invalid-science-occupancy');
   const j=(L as any).manualHuskArrangement?.jobs?.find((j:any)=>j.runId===r.runId);
   if(!j||!Array.isArray(j.controls)||!j.controls.length)throw Error('missing-science-arrangement');
   who=d.spec.operatorId;where=d.spec.worksite?.locationId;engaged=['start','resume'].includes(j.controls.at(-1).kind);
  }else{
   if(r.state?.schema!=='civ-world.coir-work/1'||!d?.spec||!Array.isArray(d.controls)||!d.controls.length)throw Error('invalid-science-occupancy');
   who=d.spec.actorId;where=d.spec.facts?.worksite?.locationId;manual=d.spec.operation!=='dry';engaged=['start','resume'].includes(d.controls.at(-1).kind);
  }
  if(typeof who!=='string'||typeof where!=='string'||r.operator!==who)throw Error('changed-science-occupancy');
  if(where===siteId)site=true;if(manual&&engaged&&who===actorId)actor=true;
 }
 return {actor,site};
}
