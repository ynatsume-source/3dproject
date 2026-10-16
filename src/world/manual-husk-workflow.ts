// Scientific work arrangement, phase 1: PR20 only. Decisions, movement and UI
// remain in the host. This metadata lives inside the existing Ledger JSON.
import type {Ledger} from './process-runner';
import {otherScienceWorkBusy} from './science-work-occupancy';
import type {HuskWorkSpec,HuskExecutorSpan} from './manual-husk-work';
import {MANUAL_HUSK_WORK,beginManualHuskWork,recordManualHuskSpan,projectManualHuskWork,observeManualHuskWork,reassignManualHuskWork,abandonManualHuskWork} from './manual-husk-work';
export const HUSK_WORKFLOW_SCHEMA='civ-world.manual-husk-arrangement/2';
type Presence='here'|'away'|'unknown';
export type HuskIntent=
 | {intentId:string;kind:'start';atWorldMs:number;actorId:string;processId:string;lotId:string;siteId:string;presence:Presence}
 | {intentId:string;kind:'resume'|'takeover';atWorldMs:number;actorId:string;runId:string;presence:Presence}
 | {intentId:string;kind:'stop'|'abandon';atWorldMs:number;actorId:string;runId:string};
export type HuskStartFacts=Pick<HuskWorkSpec,'assumptionId'|'huskCount'|'input'|'worksite'>;
interface Control {kind:'start'|'resume'|'stop'|'restore'|'takeover'|'abandon';actorId:string;atWorldMs:number;presence:Presence}
interface Job {runId:string;actorId:string;lotId:string;siteId:string;controls:Control[]}
interface Receipt {key:string;payload:string;runId:string}
interface Arrangement {schema:typeof HUSK_WORKFLOW_SCHEMA;worldId:string;worldEpoch:string;revision:number;authorityAtWorldMs:number;jobs:Job[];receipts:Receipt[]}
export type HuskWorkflowLedger=Ledger&{manualHuskArrangement?:Arrangement};
export interface HuskWorksiteView {
 title:string;stage:string;activity:'available'|'waiting'|'working'|'paused'|'completed'|'abandoned';
 materialsReserved:boolean;operatorFree:boolean;reason:string|null;nextStep:string;
 observations:{channel:'sight'|'touch';text:string}[];
}
export class HuskWorkflowError extends Error {constructor(public readonly code:string){super('科学の作業段取りを適用できない。');this.name='HuskWorkflowError';}}
function ensure(v:unknown,why:string):asserts v {if(!v)throw new HuskWorkflowError(why);}
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const id=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
function shape(v:unknown,keys:string[]):v is Record<string,any>{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const a=Object.keys(v).sort(),b=[...keys].sort();return a.length===b.length&&a.every((k,i)=>k===b[i]);
}
function canon(v:any):string{
 if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
const copy=<T>(v:T):T=>structuredClone(v);
const key=(kind:string,...parts:string[])=>JSON.stringify([kind,...parts]);
const active=(j:Job)=>['start','resume','takeover'].includes(j.controls.at(-1)!.kind);
const ended=(status:string)=>['completed','stopped'].includes(status);
function authority(L:Ledger,j:Job){
 try{
 const p=projectManualHuskWork(L,j.runId),r=L.runs[j.runId],d=r.state!.data as {spec:HuskWorkSpec;observedThroughWorldMs:number};
 ensure(r.runId===j.runId&&r.operator===j.actorId&&d.spec.input.lotId===j.lotId&&d.spec.worksite.locationId===j.siteId,'changed-job-binding');
 return {p,r,spec:d.spec,through:d.observedThroughWorldMs,frames:(r.state!.data as any).frames as HuskExecutorSpan[],assignments:(r.state!.data as any).assignments as {actorId:string;atWorldMs:number}[]};
 }catch(e){if(e instanceof HuskWorkflowError)throw e;throw new HuskWorkflowError('invalid-world-or-material-state');}
}
function empty(L:Ledger):Arrangement{
 return {schema:HUSK_WORKFLOW_SCHEMA,worldId:L.world.worldId,worldEpoch:L.world.worldEpoch,revision:0,authorityAtWorldMs:0,jobs:[],receipts:[]};
}
function metadata(L:HuskWorkflowLedger):Arrangement{
 const m=L.manualHuskArrangement;
 if(!m){ensure(!Object.values(L.runs).some(r=>r.processId===MANUAL_HUSK_WORK.processId),'missing-arrangement');return empty(L);}
 ensure(shape(m,['schema','worldId','worldEpoch','revision','authorityAtWorldMs','jobs','receipts'])&&m.schema===HUSK_WORKFLOW_SCHEMA&&m.worldId===L.world.worldId&&m.worldEpoch===L.world.worldEpoch
 &&uint(m.revision)&&uint(m.authorityAtWorldMs)&&Array.isArray(m.jobs)&&Array.isArray(m.receipts),'unsupported-arrangement');
 const jobs=new Set<string>(),sites=new Set<string>(),actors=new Set<string>();
 for(const j of m.jobs){
  ensure(shape(j,['runId','actorId','lotId','siteId','controls'])&&[j.runId,j.actorId,j.lotId,j.siteId].every(id)
   &&!jobs.has(j.runId)&&Array.isArray(j.controls)&&j.controls.length>0,'invalid-job');jobs.add(j.runId);
  const a=authority(L,j);let at=a.spec.openedAtWorldMs,actor=a.spec.operatorId;
  for(let i=0;i<j.controls.length;i++){
   const c=j.controls[i];ensure(shape(c,['kind','actorId','atWorldMs','presence'])&&id(c.actorId)&&uint(c.atWorldMs)&&c.atWorldMs>=at&&c.atWorldMs<=m.authorityAtWorldMs&&['here','away','unknown'].includes(c.presence)
    &&(i===0?c.kind==='start'&&c.atWorldMs===at:['resume','stop','restore','takeover','abandon'].includes(c.kind)),'invalid-control-history');at=c.atWorldMs;
   if(i>0)ensure(['start','resume','takeover'].includes(j.controls[i-1].kind)?['stop','restore'].includes(c.kind):
    j.controls[i-1].kind!=='abandon'&&['resume','takeover','abandon'].includes(c.kind),'invalid-control-transition');
   ensure(c.kind==='takeover'?c.actorId!==actor:c.actorId===actor,'invalid-assignment-history');actor=c.actorId;
   if(c.kind!=='restore')ensure(m.receipts.some(r=>{
    try{const v=JSON.parse(r.payload)[0];return r.runId===j.runId&&r.key===key('intent',v.intentId)&&v.kind===c.kind&&(c.kind!=='start'||v.intentId===a.spec.commandId&&v.lotId===j.lotId&&v.siteId===j.siteId)&&v.actorId===c.actorId&&v.atWorldMs===c.atWorldMs&&(['stop','abandon'].includes(c.kind)||v.presence===c.presence);}catch{return false;}
   }),'control-without-intent');
  }
  ensure(actor===j.actorId&&canon(a.assignments)===canon(j.controls.filter(c=>['start','takeover'].includes(c.kind)).map(c=>({actorId:c.actorId,atWorldMs:c.atWorldMs}))), 'changed-job-assignment');
  const abandoned=j.controls.at(-1)!.kind==='abandon';
  ensure(abandoned?a.p.status==='stopped'&&a.p.abandonedAtWorldMs===j.controls.at(-1)!.atWorldMs:a.p.status!=='stopped','changed-abandon-state');
  for(const f of a.frames)if(worksAt(f,a.spec,actorAt(j,f.fromWorldMs)))ensure(permitted(j,f),'saved-work-outside-intent');
  if(!ended(a.p.status)){
   ensure(!sites.has(j.siteId),'worksite-double-booked');sites.add(j.siteId);
   if(active(j)){ensure(!actors.has(j.actorId),'actor-double-booked');actors.add(j.actorId);}
  }
 }
 const receipts=new Set<string>();for(const r of m.receipts){
  ensure(shape(r,['key','payload','runId'])&&id(r.key)&&typeof r.payload==='string'&&jobs.has(r.runId)&&!receipts.has(r.key),'invalid-receipt');receipts.add(r.key);
 }
 return m;
}
function transaction<T>(L:HuskWorkflowLedger,fn:(draft:HuskWorkflowLedger,m:Arrangement)=>T):T{
 try{
  metadata(L);const draft=copy(L),m=copy(metadata(draft)),value=fn(draft,m);
  ensure(m.revision<Number.MAX_SAFE_INTEGER,'revision-overflow');m.revision++;
  draft.manualHuskArrangement=m;metadata(draft);Object.assign(L,draft);return value;
 }catch(e){if(e instanceof HuskWorkflowError)throw e;throw new HuskWorkflowError('invalid-world-or-material-state');}
}
function version(m:Arrangement,expected:number){ensure(uint(expected)&&m.revision===expected,'stale-arrangement');}
function replay(m:Arrangement,k:string,payload:string):string|null{
 const old=m.receipts.find(r=>r.key===k);if(!old)return null;ensure(old.payload===payload,'conflicting-command-replay');return old.runId;
}
function checkIntent(i:HuskIntent,now:number){
 const keys=i?.kind==='start'?['intentId','kind','atWorldMs','actorId','processId','lotId','siteId','presence']:
 ['resume','takeover'].includes(i?.kind)?['intentId','kind','atWorldMs','actorId','runId','presence']:['intentId','kind','atWorldMs','actorId','runId'];
 ensure(shape(i,keys)&&['start','resume','stop','takeover','abandon'].includes(i.kind)&&id(i.intentId)&&id(i.actorId)&&uint(i.atWorldMs)&&uint(now)&&i.atWorldMs<=now,'invalid-intent');
 if(i.kind==='start')ensure(i.processId===MANUAL_HUSK_WORK.processId&&id(i.lotId)&&id(i.siteId)&&['here','away','unknown'].includes(i.presence),'unsupported-process-or-presence');
 else {ensure(id(i.runId),'invalid-run');if(i.kind==='resume'||i.kind==='takeover')ensure(['here','away','unknown'].includes(i.presence),'invalid-presence');}
}
export function huskArrangementRevision(L:HuskWorkflowLedger):number{return metadata(L).revision;}
/** Intent is a choice already made by the body. Facts are authoritative material
 * composition/provenance, never supplied by a resident's text. */
export function applyHuskIntent(L:HuskWorkflowLedger,i:HuskIntent,expectedRevision:number,nowWorldMs:number,facts?:HuskStartFacts):{runId:string}{
 checkIntent(i,nowWorldMs);
 const m=metadata(L),k=key('intent',i.intentId),payload=canon([i,facts??null]),old=replay(m,k,payload);
 if(old)return {runId:old};
 return transaction(L,(draft,state)=>{
  version(state,expectedRevision);ensure(i.atWorldMs>=state.authorityAtWorldMs,'backdated-intent');state.authorityAtWorldMs=i.atWorldMs;let j:Job;
  if(i.kind==='start'){
   const foreign=otherScienceWorkBusy(draft,i.actorId,i.siteId,MANUAL_HUSK_WORK.processId);
   ensure(!foreign.actor&&!foreign.site,'other-science-work-busy');
   ensure(facts&&shape(facts,['assumptionId','huskCount','input','worksite'])&&facts.input?.lotId===i.lotId&&facts.worksite?.locationId===i.siteId,'start-facts-required');
   ensure(!state.jobs.some(x=>!ended(authority(draft,x).p.status)&&x.siteId===i.siteId),'worksite-reserved');
   ensure(!state.jobs.some(x=>!ended(authority(draft,x).p.status)&&active(x)&&x.actorId===i.actorId),'actor-busy');
   const {runId}=beginManualHuskWork(draft,{...copy(facts),commandId:i.intentId,operatorId:i.actorId,openedAtWorldMs:i.atWorldMs});
   j={runId,actorId:i.actorId,lotId:i.lotId,siteId:i.siteId,controls:[{kind:'start',actorId:i.actorId,atWorldMs:i.atWorldMs,presence:i.presence}]};state.jobs.push(j);
  }else{
   ensure(facts===undefined,'unexpected-start-facts');
   const found=state.jobs.find(x=>x.runId===i.runId);ensure(found&&(i.kind==='takeover'?found.actorId!==i.actorId:found.actorId===i.actorId),'not-this-actors-job');j=found;
   const a=authority(draft,j);
   ensure(!ended(a.p.status),'work-already-ended');
   ensure(i.atWorldMs>=Math.max(j.controls.at(-1)!.atWorldMs,a.through),'intent-precedes-certified-work');
   if(i.kind==='resume'||i.kind==='takeover'){
    ensure(!otherScienceWorkBusy(draft,i.actorId,'',MANUAL_HUSK_WORK.processId).actor,'other-science-work-busy');
    ensure(!state.jobs.some(x=>x!==j&&!ended(authority(draft,x).p.status)&&active(x)&&x.actorId===i.actorId),'actor-busy');
    ensure(!active(j),'already-engaged');
   }else if(i.kind==='stop')ensure(active(j),'already-paused');
   else ensure(!active(j),'stop-before-abandon');
   if(i.kind==='takeover'){reassignManualHuskWork(draft,j.runId,i.actorId,i.atWorldMs);j.actorId=i.actorId;}
   if(i.kind==='abandon')abandonManualHuskWork(draft,j.runId,i.atWorldMs);
   j.controls.push({kind:i.kind,actorId:i.actorId,atWorldMs:i.atWorldMs,presence:i.kind==='resume'||i.kind==='takeover'?i.presence:'unknown'});
  }
  state.receipts.push({key:k,payload,runId:j.runId});return {runId:j.runId};
 });
}
function actorAt(j:Job,at:number):string{return j.controls.filter(c=>c.atWorldMs<=at).at(-1)!.actorId;}
function permitted(j:Job,f:HuskExecutorSpan){
 for(let n=0;n<j.controls.length;n++){
  const c=j.controls[n],end=j.controls[n+1]?.atWorldMs??Number.MAX_SAFE_INTEGER;
  if(['start','resume','takeover'].includes(c.kind)&&c.actorId===f.actorId&&f.fromWorldMs>=c.atWorldMs&&f.toWorldMs<=end)return true;
 }return false;
}
function observations(L:Ledger,j:Job,worker?:string):{channel:'sight'|'touch';text:string}[]{
 const a=authority(L,j);if(a.p.status==='stopped')return [{channel:'sight',text:a.p.certifiedWorkMs===0?'殻を手つかずのまま脇に置いた。':'途中までほぐした殻を脇に置いた。'}];
 const assignmentAt=a.assignments.at(-1)!.atWorldMs;
 if(!a.frames.some(f=>(worker===undefined||f.actorId===worker&&f.fromWorldMs>=assignmentAt)&&worksAt(f,a.spec,actorAt(j,f.fromWorldMs))))return [];
 return observeManualHuskWork(L,j.runId).map(o=>({channel:o.channel as 'sight'|'touch',text:o.text!}));
}
function worksAt(f:HuskExecutorSpan,s:HuskWorkSpec,actorId:string){
 const near=(p:{x:number;z:number})=>Math.hypot(p.x-s.worksite.x,p.z-s.worksite.z)<=s.worksite.reachM;
 return f.actorId===actorId&&f.activity==='separate-wet-husk'&&f.arrived&&f.targetLotId===s.input.lotId&&f.targetSiteId===s.worksite.locationId&&near(f.fromPosition)&&near(f.toPosition);
}
/** Presence without actual manual activity is never a work interval. */
export function recordHuskWorkflowSpan(L:HuskWorkflowLedger,runId:string,f:HuskExecutorSpan,expectedRevision:number,nowWorldMs:number):void{
 ensure(uint(nowWorldMs)&&f&&uint(f.confirmedAtWorldMs)&&f.confirmedAtWorldMs<=nowWorldMs,'invalid-span-time');
 const m=metadata(L),k=key('span',runId,f?.spanId),payload=canon(f);
 const old=replay(m,k,payload);if(old)return;
 transaction(L,(draft,state)=>{
  version(state,expectedRevision);const j=state.jobs.find(x=>x.runId===runId);ensure(j,'unknown-job');
  const a=authority(draft,j),isWork=worksAt(f,a.spec,actorAt(j,f.fromWorldMs));
  if(isWork)ensure(permitted(j,f),'work-outside-engaged-interval');
  recordManualHuskSpan(draft,runId,f,nowWorldMs);
  state.authorityAtWorldMs=Math.max(state.authorityAtWorldMs,f.confirmedAtWorldMs);
  state.receipts.push({key:k,payload,runId});
 });
}
/** Called at the real load boundary, not by rendering. Open attendance is
 * invalidated; pending work/material reservations remain unchanged. */
export function restoreHuskArrangement(saved:unknown,atWorldMs:number):HuskWorkflowLedger{
 const L=copy(saved) as HuskWorkflowLedger,m=metadata(L);
 ensure(uint(atWorldMs)&&atWorldMs>=m.authorityAtWorldMs,'invalid-restore-time');
 for(const j of m.jobs)ensure(atWorldMs>=Math.max(j.controls.at(-1)!.atWorldMs,authority(L,j).through),'restore-before-saved-events');
 if(!m.jobs.length)return L;
 transaction(L,(draft,state)=>{
  state.authorityAtWorldMs=atWorldMs;
  for(const j of state.jobs)if(!ended(authority(draft,j).p.status)&&active(j)){
   const cutoff=Math.max(j.controls.at(-1)!.atWorldMs,authority(draft,j).through);
   j.controls.push({kind:'restore',actorId:j.actorId,atWorldMs:cutoff,presence:'unknown'});
  }
 });return L;
}
export function readHuskResidentObservations(L:HuskWorkflowLedger,runId:string,actorId:string){
 const j=metadata(L).jobs.find(x=>x.runId===runId);ensure(j,'unknown-job');
 return j.actorId===actorId?observations(L,j,actorId):[];
}
/** Strict public whitelist. No counts, times, ratios, IDs, quality or snapshots.
 * asOf comes from the host; read-only calls never certify presence/work. */
export function readHuskWorksite(L:HuskWorkflowLedger,siteId:string,asOfWorldMs:number):HuskWorksiteView{
 ensure(id(siteId)&&uint(asOfWorldMs),'invalid-view-context');
 const m=metadata(L),all=m.jobs.filter(j=>j.siteId===siteId);
 const j=all.find(x=>!ended(authority(L,x).p.status))??all.at(-1);
 if(!j)return {title:'ヤシ殻の作業場',stage:'開始前',activity:'available',materialsReserved:false,operatorFree:true,reason:null,nextStep:'本体が選んだ作業の意図を受け取る。',observations:[]};
 const a=authority(L,j),last=j.controls.at(-1)!;
 ensure(asOfWorldMs>=Math.max(last.atWorldMs,a.through),'view-before-record');
 const visible=observations(L,j).filter(o=>o.channel==='sight');
 if(a.p.status==='stopped')return {title:'ヤシ殻の作業場',stage:a.p.certifiedWorkMs===0?'手つかずの殻を片付けた':'途中までの殻を片付けた',activity:'abandoned',materialsReserved:false,operatorFree:true,reason:null,nextStep:'本体が選んだ作業の意図を受け取る。',observations:visible};
 if(a.p.status==='completed')return {title:'ヤシ殻の作業場',stage:'ほぐす作業を終えた',activity:'completed',materialsReserved:false,operatorFree:true,reason:null,nextStep:'回収したものを確認し、次の作業を選ぶ。',observations:visible};
 if(!active(j))return {title:'ヤシ殻の作業場',stage:'手作業を中断・続きあり',activity:'paused',materialsReserved:true,operatorFree:true,
 reason:last.kind==='restore'?'保存から復帰したため、作業の再確認を待つ。':'本体から中断の意図を受け取った。',nextStep:'続けたい意図を受け取り、在席と手仕事を確認する。',observations:visible};
 const f=a.frames.at(-1),fresh=!!f&&f.confirmedAtWorldMs===asOfWorldMs&&f.toWorldMs>last.atWorldMs;
 const working=!!fresh&&worksAt(f!,a.spec,j.actorId);
 const reason=working?null:!fresh?'現在の在席と手仕事が未確認。':f!.activity==='rest'?'手を休めている。':!f!.arrived||f!.activity==='travel'?'作業場での在席を確認できない。':'この作業の手仕事が未確認。';
 return {title:'ヤシ殻の作業場',stage:'殻を手でほぐす',activity:working?'working':'waiting',materialsReserved:true,operatorFree:false,reason,
 nextStep:working?'手を動かした区間を確定する。途中で手を離しても続きは残る。':'本体から在席と実際の手仕事の確認を受け取る。',observations:visible};
}
/** A lot's public label is an allowlist, never a spread of its hidden quality.
 * Future rope strength remains an internal lot property, not a UI/debug field. */
export function readHuskMaterialLabel(materialId:string):{label:string}{
 const names:Record<string,string>={wet_unseparated_coconut_husk:'湿った未分離の殻',coir_fiber_bundle:'ほぐれた繊維の束',partially_separated_coconut_husk:'ほぐした後の殻',husk_drainage_water:'作業で出た水'};
 return {label:Object.hasOwn(names,materialId)?names[materialId]:'材料'};
}
