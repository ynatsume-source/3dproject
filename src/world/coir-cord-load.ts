// World-only event adapter. Persist coirCordLoads in the same Ledger.
import {startRun,commit,type Ledger,type Run} from './process-runner';
import type {LotView,ScienceStepRequest,ScienceStepResult} from './science-contract';
import {createCordDamageModel,type CordDamageEvent} from '../science/prototypes/coir-cord-damage';
import {COIR_CORD_ASSUMPTION_ID,cordCanonical as canonical,cordInteger as uint,cordId as id,cordShape as shape} from '../science/prototypes/coir-cord-types';
import {readCordPiece,readCordHistory,writeCordPiece} from './coir-cord-lots';
export const COIR_CORD_LOAD=Object.freeze({processId:'prototype_coir_cord_load',processVersion:'host-1',contract:'0.2.1',catalogVersion:'civ-sci-test-2',schema:'civ-world.coir-cord-load/1',ledgerSchema:'civ-world.coir-cord-load-ledger/1'});
export type CordHostEvent={kind:'load';gf:number;breakAtMm?:number}|{kind:'abrasion';count:number}|{kind:'exposure';fromIslandMs:number;toIslandMs:number;shade:boolean};
export interface CordLoadRequest{commandId:string;assumptionId:string;lotId:string;worldAtMs:number;islandAtMs:number;event:CordHostEvent}
export interface CordLoadResult{runId:string;lotIds:string[];observations:string[]}
interface RecordEntry{request:CordLoadRequest;source:LotView;runId:string;lotIds:string[]}
interface Store{schema:string;worldId:string;worldEpoch:string;records:RecordEntry[]}
interface Tracked{lot:LotView;cursor:{worldAtMs:number;islandAtMs:number}}
export type CordLoadLedger=Ledger&{coirCordLoads?:Store};
type Code='invalid-request'|'missing-material'|'material-in-use'|'out-of-order-event'|'conflicting-replay'|'corrupt-save'|'event-refused';
export class CordLoadError extends Error{constructor(readonly code:Code){super('The cord event could not be applied.');this.name='CordLoadError';}}
function need(v:unknown,c:Code):asserts v{if(!v)throw new CordLoadError(c);}
const clone=<T>(v:T):T=>structuredClone(v);
const plain=(l:LotView&{reservedBy?:string}):LotView=>{const{reservedBy:_,...p}=l;return clone(p);};
const substance=(l:LotView)=>canonical([l.materialId,l.amount,l.quality]);
function request(q:CordLoadRequest){
 need(shape(q,['commandId','assumptionId','lotId','worldAtMs','islandAtMs','event'])&&id(q.commandId)&&q.assumptionId===COIR_CORD_ASSUMPTION_ID&&id(q.lotId)&&uint(q.worldAtMs)&&uint(q.islandAtMs),'invalid-request');
 const e=q.event;need(e&&typeof e==='object'&&!Array.isArray(e),'invalid-request');
 if(e.kind==='load')need(shape(e,['kind','gf',...(e.breakAtMm===undefined?[]:['breakAtMm'])])&&uint(e.gf)&&(e.breakAtMm===undefined||uint(e.breakAtMm,1)),'invalid-request');
 else if(e.kind==='abrasion')need(shape(e,['kind','count'])&&uint(e.count),'invalid-request');
 else need(e.kind==='exposure'&&shape(e,['kind','fromIslandMs','toIslandMs','shade'])&&uint(e.fromIslandMs)&&uint(e.toIslandMs)&&e.toIslandMs>e.fromIslandMs&&e.toIslandMs<=q.islandAtMs&&typeof e.shade==='boolean','invalid-request');
}
function science(source:LotView,q:CordLoadRequest,worldId:string,worldEpoch:string,runId:string){
 const e=q.event,m=createCordDamageModel(readCordPiece(source),q.assumptionId,{worldId,worldEpoch,runId,openedAtWorldMs:q.worldAtMs,openedAtIslandMs:e.kind==='exposure'?e.fromIslandMs:q.islandAtMs});
 const common={eventId:q.commandId,worldId,worldEpoch,runId};
 const event:CordDamageEvent=e.kind==='exposure'?{...common,...clone(e),clock:'island',atMs:e.toIslandMs}:{...common,...clone(e),clock:'world',atMs:q.worldAtMs};
 const state=m.commit(m.start(),event),p=m.project(state);
 return{state,produced:p.pieces.map(x=>writeCordPiece(x,source.location,readCordHistory(source))),observations:m.observe(state)};
}
function chronology(q:CordLoadRequest,previous?:Tracked){
 if(!previous)return;
 need(q.worldAtMs>=previous.cursor.worldAtMs&&q.islandAtMs>=previous.cursor.islandAtMs,'out-of-order-event');
 if(q.event.kind==='exposure')need(q.event.fromIslandMs>=previous.cursor.islandAtMs,'out-of-order-event');
}
function runOk(r:Run|undefined,x:RecordEntry,s:ReturnType<typeof science>){
 const q=x.request;
 need(r&&r.runId===x.runId&&r.processId===COIR_CORD_LOAD.processId&&r.processVersion===COIR_CORD_LOAD.processVersion&&r.catalogVersion===COIR_CORD_LOAD.catalogVersion
 &&r.contract===COIR_CORD_LOAD.contract&&r.clock==='world'&&r.status==='completed'&&r.lastTo===q.worldAtMs&&r.operator==='world:coir-cord-load'
 &&canonical(r.lotIds)===canonical([q.lotId])&&Array.isArray(r.equipmentIds)&&!r.equipmentIds.length
 &&canonical(r.state)===canonical({schema:COIR_CORD_LOAD.schema,data:{request:q,source:x.source,damage:s.state,outputLotIds:x.lotIds}})
 &&canonical(r.observations)===canonical(s.observations.map(text=>({at:q.worldAtMs,channel:'sight',text}))),'corrupt-save');
}
function inspect(L:CordLoadLedger){
 need(L&&L.world&&id(L.world.worldId)&&id(L.world.worldEpoch)&&uint(L.seq)&&L.runs&&L.lots&&Array.isArray(L.committed),'corrupt-save');
 const saved=L.coirCordLoads;
 if(!saved){need(!Object.values(L.runs).some(r=>r.processId===COIR_CORD_LOAD.processId),'corrupt-save');
 return{store:{schema:COIR_CORD_LOAD.ledgerSchema,worldId:L.world.worldId,worldEpoch:L.world.worldEpoch,records:[]} as Store,tracked:new Map<string,Tracked>()};}
 need(shape(saved,['schema','worldId','worldEpoch','records'])&&saved.schema===COIR_CORD_LOAD.ledgerSchema&&saved.worldId===L.world.worldId&&saved.worldEpoch===L.world.worldEpoch&&Array.isArray(saved.records),'corrupt-save');
 const tracked=new Map<string,Tracked>(),commands=new Set<string>(),inputs=new Set<string>(),runs=new Set<string>();
 for(const x of saved.records){
  need(shape(x,['request','source','runId','lotIds'])&&id(x.runId)&&Array.isArray(x.lotIds),'corrupt-save');request(x.request);const q=x.request;
  need(!commands.has(q.commandId)&&!inputs.has(q.lotId)&&!runs.has(x.runId),'corrupt-save');commands.add(q.commandId);inputs.add(q.lotId);runs.add(x.runId);
  need(shape(x.source,['lotId','materialId','amount','quality','location'])&&x.source.lotId===q.lotId&&id(x.source.location),'corrupt-save');
  const previous=tracked.get(q.lotId);if(previous)need(substance(previous.lot)===substance(x.source),'corrupt-save');chronology(q,previous);
  const expected=science(x.source,q,saved.worldId,saved.worldEpoch,x.runId);need(x.lotIds.length===expected.produced.length&&new Set(x.lotIds).size===x.lotIds.length,'corrupt-save');
  runOk(L.runs[x.runId],x,expected);
  expected.produced.forEach((p,i)=>{const lotId=x.lotIds[i];need(id(lotId)&&!tracked.has(lotId)&&!inputs.has(lotId),'corrupt-save');
   tracked.set(lotId,{lot:{lotId,materialId:p.materialId,amount:clone(p.amount),quality:clone(p.quality),location:p.into!},cursor:{worldAtMs:q.worldAtMs,islandAtMs:q.islandAtMs}});});
 }
 need(Object.values(L.runs).filter(r=>r.processId===COIR_CORD_LOAD.processId).length===runs.size,'corrupt-save');return{store:saved,tracked};
}
export function validateCordLoadLedger(L:CordLoadLedger):void{try{inspect(L);}catch(e){if(e instanceof CordLoadError)throw e;throw new CordLoadError('corrupt-save');}}
export function applyCordLoad(L:CordLoadLedger,q:CordLoadRequest):CordLoadResult{
 try{
  request(q);const copy=clone(L),{store,tracked}=inspect(copy),previousCommand=store.records.find(x=>x.request.commandId===q.commandId);
  if(previousCommand){need(canonical(previousCommand.request)===canonical(q),'conflicting-replay');const s=science(previousCommand.source,q,copy.world.worldId,copy.world.worldEpoch,previousCommand.runId);
   return{runId:previousCommand.runId,lotIds:[...previousCommand.lotIds],observations:[...s.observations]};}
  const live=copy.lots[q.lotId];need(live,'missing-material');need(!live.reservedBy,'material-in-use');
  const source=plain(live),previous=tracked.get(q.lotId);if(previous)need(substance(source)===substance(previous.lot),'corrupt-save');chronology(q,previous);readCordPiece(source);readCordHistory(source);
  need(uint(copy.seq+1)&&!Object.hasOwn(copy.runs,'run:'+(copy.seq+1)),'corrupt-save');
  const begun=startRun(copy,{processId:COIR_CORD_LOAD.processId,processVersion:COIR_CORD_LOAD.processVersion,catalogVersion:COIR_CORD_LOAD.catalogVersion,contract:COIR_CORD_LOAD.contract,
   clock:'world',lotIds:[q.lotId],equipmentIds:[],operator:'world:coir-cord-load'},q.worldAtMs);
  need(begun.run,'event-refused');const r=begun.run,s=science(source,q,copy.world.worldId,copy.world.worldEpoch,r.runId);
  for(let i=1;i<=s.produced.length;i++)need(uint(copy.seq+i)&&!Object.hasOwn(copy.lots,'lot:'+(copy.seq+i)),'corrupt-save');
  r.lastTo=q.worldAtMs;const outputLotIds=s.produced.map((_,i)=>'lot:'+(copy.seq+i+1));
  const req:ScienceStepRequest={contract:r.contract,requestId:r.runId+':event',world:{...copy.world},runId:r.runId,processId:r.processId,processVersion:r.processVersion,catalogVersion:r.catalogVersion,
   interval:{from:q.worldAtMs,to:q.worldAtMs},state:null,environment:{sampleId:'env:cord-event-unused',source:'unknown',effectiveAt:q.worldAtMs},lots:[source],equipment:[],energy:[],actions:[],seed:r.seed};
  const res:ScienceStepResult={contract:r.contract,requestId:req.requestId,runId:r.runId,simulated:{...req.interval},state:{schema:COIR_CORD_LOAD.schema,data:{request:clone(q),source:clone(source),damage:s.state,outputLotIds}},
   status:'completed',consumed:[{lotId:q.lotId,amount:clone(source.amount)}],produced:s.produced,released:[],drawn:[],energy:[],equipmentWear:[],
   observations:s.observations.map(text=>({at:q.worldAtMs,channel:'sight' as const,text})),evidence:{evaluatorVersion:COIR_CORD_LOAD.processVersion,sourceRefs:[],notes:'owner-assumption-not-calibrated; explicit '+q.assumptionId}};
  const result=commit(copy,req,res);need(result.ok&&result.produced,'event-refused');const lotIds=result.produced.map(p=>p.lotId);need(canonical(lotIds)===canonical(outputLotIds),'corrupt-save');
  store.records.push({request:clone(q),source,runId:r.runId,lotIds});copy.coirCordLoads=store;inspect(copy);Object.assign(L,copy);
  return{runId:r.runId,lotIds:[...lotIds],observations:[...s.observations]};
 }catch(e){if(e instanceof CordLoadError)throw e;throw new CordLoadError('event-refused');}
}
/** Call only for a confirmed on-site witnessed event. No remote-intent knowledge. */
export function applyCordLoadForResident(L:CordLoadLedger,q:CordLoadRequest):{ok:boolean;observations:string[]}{
 try{return{ok:true,observations:applyCordLoad(L,q).observations};}catch{return{ok:false,observations:['今はこの材料を扱えない。']};}
}
