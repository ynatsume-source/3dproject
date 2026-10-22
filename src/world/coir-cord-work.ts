// Opt-in stage-2 arrangement. Existing Ledger is the sole world authority.
import type {LotView,Observation,ScienceStepRequest,ScienceStepResult} from './science-contract';
import {startRun,commit,toClock,type Ledger} from './process-runner';
import {createCoirCordModel,type CoirInput,type CoirInterval,type CoirState} from '../science/prototypes/coir-cord';
import {COIR_CORD_ASSUMPTION_ID as ID,COIR_CORD_RULES as R,cordCanonical as canon,cordShape as shape,
 cordInteger as uint,cordSum as sum,type CoirMass} from '../science/prototypes/coir-cord-types';
import {readCordBundle,readCordPiece,readCordHistory,writeCordBundle,writeCordPiece,writeCordPith} from './coir-cord-lots';
import type {HuskWorksite,HuskExecutorSpan} from './manual-husk-work';
import {otherScienceWorkBusy} from './science-work-occupancy';
import {restoreHuskArrangement} from './manual-husk-workflow';
const LEGACY_CORD_WORK = {
  processId: 'prototype_coir_work',
  version: 'host-2',
  schema: 'civ-world.coir-work/2',
  arrangement: 'civ-world.coir-arrangement/2',
  quantumMs: 30_000
} as const;
export const CORD_WORK = {
  ...LEGACY_CORD_WORK,
  version: 'host-3',
  schema: 'civ-world.coir-work/3',
  arrangement: 'civ-world.coir-arrangement/3',
  receiptLimit: 64
} as const;
type Operation=CoirInput['operation'];
type Presence='here'|'away'|'unknown';
type Activity='sieve-coir'|'twist-coir'|'ply-coir'|'rest'|'travel'|'idle'|'unknown';
export type CordManualSpan=Omit<HuskExecutorSpan,'activity'>&{activity:Activity};
export interface CordRoofedSpan {kind:'confirmed-roofed-wait';spanId:string;worldId:string;worldEpoch:string;runId:string;
 fromWorldMs:number;toWorldMs:number;confirmedAtWorldMs:number;siteId:string;roofed:boolean}
export type CordSpan=CordManualSpan|CordRoofedSpan;
export type CordIntent=
 | {intentId:string;kind:'start';actorId:string;atWorldMs:number;operation:Operation;lotIds:string[];siteId:string;presence:Presence}
 | {intentId:string;kind:'stop'|'abandon';actorId:string;atWorldMs:number;runId:string}
 | {intentId:string;kind:'resume'|'takeover';actorId:string;atWorldMs:number;runId:string;presence:Presence};
export interface CordStartFacts {assumptionId:string;worksite:HuskWorksite;requestedLengthMm?:number;roofed?:true}
interface Spec {commandId:string;actorId:string;operation:Operation;lotIds:string[];openedAtWorldMs:number;facts:CordStartFacts}
interface Control {kind:'start'|'stop'|'resume'|'restore'|'takeover'|'abandon';atWorldMs:number;actorId:string}
interface Data {binding:string;worldId:string;worldEpoch:string;runId:string;seed:number;spec:Spec;sources:LotView[];
 controls:Control[];frames:CordSpan[];science:CoirState;pendingMs:number;observedThroughWorldMs:number;completedAtMs:number|null;abandonedAtMs:number|null}
interface Receipt {
  key: string;
  payload: string;
  runId: string;
  atWorldMs: number;
}
type Projection = ReturnType<ReturnType<typeof createCoirCordModel>['project']>;
interface WorkProjection {
  status: 'running' | 'completed' | 'stopped';
  certifiedMs: number;
  pendingMs: number;
  completedAtMs: number | null;
  abandonedAtMs: number | null;
  projection: Projection;
}
interface Finished {
  runId: string;
  actorId: string;
  siteId: string;
  operation: Operation;
  atWorldMs: number;
  projection: WorkProjection;
  view: CordWorksiteView;
  workerObservations: {channel: 'sight'; text: string}[];
  digest: number;
}
interface Arrangement {
  schema: typeof CORD_WORK.arrangement;
  worldId: string;
  worldEpoch: string;
  revision: number;
  authorityAtWorldMs: number;
  floorAtWorldMs: number | null;
  receipts: Receipt[];
  finished: Finished[];
}
export type CordWorkLedger=Ledger&{cordArrangement?:Arrangement};
export class CordWorkError extends Error {constructor(public readonly code:string){super('科学の作業を適用できない。');this.name='CordWorkError';}}
const id=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const clone=<T>(v:T):T=>structuredClone(v);
const clock=(s:Spec)=>s.operation==='dry'?'island' as const:'world' as const;
const active=(d:Data)=>['start','resume','takeover'].includes(d.controls.at(-1)!.kind);
const terminal=(d:Data)=>d.completedAtMs!==null||d.abandonedAtMs!==null;
const actor=(d:Data)=>d.controls.at(-1)!.actorId;
const actorAt=(controls:Control[],at:number)=>controls.filter(c=>c.atWorldMs<=at).at(-1)!.actorId;
const key=(...s:string[])=>JSON.stringify(s);
function demand(ok:unknown,code:string):asserts ok {if(!ok)throw new CordWorkError(code);}
function translated(e:unknown):never {
 if(e instanceof CordWorkError)throw e;
 const msg=e instanceof Error?e.message:'';
 for(const c of ['wet-fiber-cannot-twist','too-much-pith-sieve-first','insufficient-fiber','strands-too-short','strands-not-similar-length','three-distinct-strands-required'])
 if(msg==='coir cord: '+c)throw new CordWorkError(c);
 throw new CordWorkError('invalid-world-or-material-state');
}
function inputOf(s:Spec,lots:LotView[]):CoirInput {
 if(s.operation==='ply')return {operation:'ply',strands:lots.map(readCordPiece) as any};
 const bundle=readCordBundle(lots[0]);
 return s.operation==='dry'?{operation:'dry',bundle,roofed:true}:s.operation==='sieve'?{operation:'sieve',bundle}:{operation:'twist',bundle,requestedLengthMm:s.facts.requestedLengthMm!};
}
function duration(i:CoirInput):number{
 if(i.operation==='ply')return Number(BigInt(Math.min(...i.strands.map(s=>s.lengthMm)))*9n/10n*BigInt(R.plyMsPerMm));
 if(i.operation==='dry')return i.bundle.waterMg>Math.floor(sum(i.bundle.fiberDryMg,i.bundle.pithDryMg)/10)?R.dryIslandMs:0;
 if(i.operation==='sieve')return i.bundle.pithDryMg>Math.floor(i.bundle.fiberDryMg/10)?
 Number((BigInt(i.bundle.fiberDryMg)*BigInt(R.sieveWorldMs)+BigInt(R.sieveReferenceFiberMg)-1n)/BigInt(R.sieveReferenceFiberMg)):0;
 return Number(BigInt(i.requestedLengthMm)*BigInt(R.twistMsPerMm));
}
function model(d:Pick<Data,'spec'|'sources'|'worldId'|'worldEpoch'|'runId'|'seed'>){
 return createCoirCordModel(inputOf(d.spec,d.sources),ID,{worldId:d.worldId,worldEpoch:d.worldEpoch,runId:d.runId,seed:d.seed,clock:clock(d.spec),openedAtMs:toClock(clock(d.spec),d.spec.openedAtWorldMs)});
}
function specOk(s:Spec,sources:LotView[]){
 demand(shape(s,['commandId','actorId','operation','lotIds','openedAtWorldMs','facts'])&&id(s.commandId)&&id(s.actorId)&&uint(s.openedAtWorldMs)
 &&['dry','sieve','twist','ply'].includes(s.operation)&&Array.isArray(s.lotIds)&&s.lotIds.every(id)&&new Set(s.lotIds).size===s.lotIds.length
 &&s.lotIds.length===(s.operation==='ply'?3:1),'invalid-spec');
 const f=s.facts;
 demand(shape(f,['assumptionId','worksite',...(s.operation==='dry'?['roofed']:s.operation==='twist'?['requestedLengthMm']:[])])
 &&f.assumptionId===ID,'explicit-operation-facts-required');
 demand(shape(f.worksite,['locationId','x','z','reachM'])&&id(f.worksite.locationId)&&Number.isFinite(f.worksite.x)&&Number.isFinite(f.worksite.z)
 &&Number.isFinite(f.worksite.reachM)&&f.worksite.reachM>0,'invalid-worksite');
 if(s.operation==='dry')demand(f.roofed===true,'roof-required');
 if(s.operation==='twist')demand(uint(f.requestedLengthMm,1),'invalid-requested-length');
 demand(Array.isArray(sources)&&sources.length===s.lotIds.length,'invalid-source-count');
 sources.forEach((l,i)=>{demand(l.lotId===s.lotIds[i]&&l.location===f.worksite.locationId,'wrong-source-place');readCordHistory(l);});
 inputOf(s,sources);
}
function eligible(f:CordSpan,s:Spec,controls:Control[]){
 if(f.kind==='confirmed-roofed-wait')return s.operation==='dry'&&f.roofed&&f.siteId===s.facts.worksite.locationId;
 if(s.operation==='dry')return false;
 const near=(p:{x:number;z:number})=>Math.hypot(p.x-s.facts.worksite.x,p.z-s.facts.worksite.z)<=s.facts.worksite.reachM;
 const activity=s.operation==='sieve'?'sieve-coir':s.operation==='twist'?'twist-coir':'ply-coir';
 return f.actorId===actorAt(controls,f.fromWorldMs)&&f.activity===activity&&f.arrived&&f.targetLotId===s.lotIds[0]&&f.targetSiteId===s.facts.worksite.locationId&&near(f.fromPosition)&&near(f.toPosition);
}
function allowed(controls:Control[],f:CordSpan){
 return controls.some((c,i)=>['start','resume','takeover'].includes(c.kind)&&f.fromWorldMs>=c.atWorldMs&&f.toWorldMs<=(controls[i+1]?.atWorldMs??Number.MAX_SAFE_INTEGER));
}
function frameOk(f:CordSpan,d:Pick<Data,'spec'|'worldId'|'worldEpoch'|'runId'>){
 const base=['kind','spanId','worldId','worldEpoch','runId','fromWorldMs','toWorldMs','confirmedAtWorldMs'];
 demand(shape(f,[...base,...(f?.kind==='confirmed-roofed-wait'?['siteId','roofed']:['actorId','activity','targetLotId','targetSiteId','arrived','fromPosition','toPosition'])])
 &&id(f.spanId)&&f.worldId===d.worldId&&f.worldEpoch===d.worldEpoch&&f.runId===d.runId
 &&uint(f.fromWorldMs)&&uint(f.toWorldMs)&&uint(f.confirmedAtWorldMs)&&f.fromWorldMs>=d.spec.openedAtWorldMs&&f.toWorldMs>f.fromWorldMs&&f.confirmedAtWorldMs>=f.toWorldMs,'invalid-executor-span');
 if(f.kind==='confirmed-roofed-wait')demand(d.spec.operation==='dry'&&id(f.siteId)&&typeof f.roofed==='boolean','invalid-roofed-fact');
 else{
  demand(f.kind==='executor-activity-span'&&d.spec.operation!=='dry'&&id(f.actorId)&&['sieve-coir','twist-coir','ply-coir','rest','travel','idle','unknown'].includes(f.activity)
   &&typeof f.arrived==='boolean'&&(f.targetLotId===null||id(f.targetLotId))&&(f.targetSiteId===null||id(f.targetSiteId)),'invalid-manual-fact');
  for(const p of [f.fromPosition,f.toPosition])demand(shape(p,['x','z'])&&Number.isFinite(p.x)&&Number.isFinite(p.z),'invalid-position');
 }
}
function rebuild(worldId:string,worldEpoch:string,runId:string,seed:number,spec:Spec,sources:LotView[],controls:Control[],frames:CordSpan[],bindingPolicy:unknown=CORD_WORK):Data{
 specOk(spec,sources);demand(id(worldId)&&id(worldEpoch)&&id(runId)&&uint(seed)&&seed<=0xffffffff,'invalid-context');
 demand(Array.isArray(controls)&&controls.length>0&&Array.isArray(frames),'invalid-history');
 let controlAt=spec.openedAtWorldMs;
 controls.forEach((c,i)=>{
  demand(shape(c,['kind','atWorldMs','actorId'])&&id(c.actorId)&&uint(c.atWorldMs)&&c.atWorldMs>=controlAt&&(i===0?c.kind==='start'&&c.atWorldMs===controlAt&&c.actorId===spec.actorId:
  ['start','resume','takeover'].includes(controls[i-1].kind)?['stop','restore'].includes(c.kind):['resume','takeover','abandon'].includes(c.kind)),'invalid-control-history');
  if(i>0){
   const previous=controls[i-1];demand(previous.kind!=='abandon','control-after-abandon');
   demand(c.kind==='takeover'?spec.operation!=='dry'&&c.actorId!==previous.actorId:c.actorId===previous.actorId,'invalid-operator-transition');
  }
  controlAt=c.atWorldMs;
 });
 const base={worldId,worldEpoch,runId,seed,spec,sources},m=model(base),i=inputOf(spec,sources),horizon=duration(i),Q=CORD_WORK.quantumMs;
 demand(uint(horizon),'duration-overflow');const cap=Number((BigInt(horizon)+BigInt(Q)-1n)/BigInt(Q)*BigInt(Q));demand(uint(cap),'duration-overflow');
 const segments:{from:number;to:number;confirmed:number;actorId:string}[]=[],seen=new Set<string>();let observed=spec.openedAtWorldMs,available=0;
 for(const f of frames){
  frameOk(f,base);demand(!seen.has(f.spanId)&&f.fromWorldMs>=observed,'duplicate-or-overlapping-facts');seen.add(f.spanId);observed=f.toWorldMs;
  if(!eligible(f,spec,controls))continue;demand(allowed(controls,f),'work-outside-engaged-interval');
  const from=toClock(clock(spec),f.fromWorldMs),to=toClock(clock(spec),f.toWorldMs),confirmed=toClock(clock(spec),f.confirmedAtWorldMs);
  demand(uint(from)&&uint(to)&&uint(confirmed)&&to>=from,'clock-out-of-range');if(to===from)continue;
  available=sum(available,to-from);
  // Merge actual adjacent intervals. Their recording time may differ, but never
  // invent activity across a gap.
  const last=segments.at(-1);if(last?.to===from&&last.actorId===actorAt(controls,f.fromWorldMs)){last.to=to;last.confirmed=Math.max(last.confirmed,confirmed);}else segments.push({from,to,confirmed,actorId:actorAt(controls,f.fromWorldMs)});
 }
 const budget=Math.min(Math.floor(available/Q)*Q,cap);let left=budget,science=m.start(),end=toClock(clock(spec),spec.openedAtWorldMs);
 for(let n=0;n<segments.length&&left>0;n++){
  const s=segments[n],used=Math.min(left,s.to-s.from),to=s.from+used;
  const receipt:CoirInterval={confirmationId:key(runId,'work',String(n)),worldId,worldEpoch,runId,clock:clock(spec),fromMs:s.from,toMs:to,confirmedAtMs:s.confirmed,
   ...(spec.operation==='dry'?{kind:'host-confirmed-roofed-wait'}:{kind:'host-confirmed-manual-work',actorId:s.actorId,attendance:'present'})};
  science=m.commit(science,receipt);left-=used;end=to;
 }
 const complete=m.project(science).status==='completed';
 if(controls.at(-1)!.kind==='abandon')demand(!complete&&controls.at(-1)!.atWorldMs>=observed,'invalid-abandon-state');
 return {binding:canon([bindingPolicy,worldId,worldEpoch,runId,seed,spec,sources]),worldId,worldEpoch,runId,seed,spec:clone(spec),sources:clone(sources),
 controls:clone(controls),frames:clone(frames),science,pendingMs:complete||controls.at(-1)!.kind==='abandon'?0:available-budget,observedThroughWorldMs:observed,completedAtMs:complete?end:null,abandonedAtMs:controls.at(-1)!.kind==='abandon'?toClock(clock(spec),controls.at(-1)!.atWorldMs):null};
}
function raw(L:Ledger,runId:string,legacy=false):Data {
 const policy = legacy ? LEGACY_CORD_WORK : CORD_WORK;
 const r=L.runs[runId],d=r?.state?.data as Data;
 demand(r&&r.runId===runId&&r.processId===CORD_WORK.processId&&r.processVersion===policy.version&&r.catalogVersion==='civ-sci-test-2'
 &&r.contract==='0.2.1'&&r.state?.schema===policy.schema&&d&&d.worldId===L.world.worldId&&d.worldEpoch===L.world.worldEpoch&&d.runId===runId,'unsupported-run-or-state');
 const rebuilt=rebuild(d.worldId,d.worldEpoch,d.runId,d.seed,d.spec,d.sources,d.controls,d.frames,policy);
 demand(canon(d)===canon(rebuilt)&&r.seed===d.seed&&r.clock===clock(d.spec)&&r.operator===actor(d)&&canon(r.lotIds)===canon(d.spec.lotIds)&&r.equipmentIds.length===0,'corrupt-work-state');
 demand(terminal(d)?r.status===(d.abandonedAtMs!==null?'stopped':'completed'):['starting','running'].includes(r.status),'unexpected-run-status');
 demand(r.lastTo===(d.abandonedAtMs??d.completedAtMs??toClock(clock(d.spec),d.observedThroughWorldMs)),'changed-run-clock');
 if(!terminal(d))d.sources.forEach(l=>{
  const current=L.lots[l.lotId];demand(current&&current.reservedBy===runId,'lost-reservation');
  const {reservedBy:_,...v}=current;demand(canon(v)===canon(l),'changed-reserved-material');
 });
 return rebuilt;
}
function summaryDigest(value: unknown): number {
  let h = 2166136261;
  for (const c of canon(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function sealSummary(value: Omit<Finished, 'digest'>): Finished {
  return { ...value, digest: summaryDigest(value) };
}
function arrangementHeader(L: CordWorkLedger): Arrangement {
  const m = L.cordArrangement;
  if (!m) {
    demand(!Object.values(L.runs).some(r => r.processId === CORD_WORK.processId), 'missing-arrangement');
    return {
      schema: CORD_WORK.arrangement,
      worldId: L.world.worldId,
      worldEpoch: L.world.worldEpoch,
      revision: 0,
      authorityAtWorldMs: 0,
      floorAtWorldMs: null,
      receipts: [],
      finished: []
    };
  }
  demand(shape(m, [
    'schema', 'worldId', 'worldEpoch', 'revision', 'authorityAtWorldMs',
    'floorAtWorldMs', 'receipts', 'finished'
  ]) && m.schema === CORD_WORK.arrangement
    && m.worldId === L.world.worldId && m.worldEpoch === L.world.worldEpoch
    && uint(m.revision) && uint(m.authorityAtWorldMs)
    && (m.floorAtWorldMs === null || uint(m.floorAtWorldMs))
    && Array.isArray(m.receipts) && m.receipts.length <= CORD_WORK.receiptLimit
    && Array.isArray(m.finished) && m.finished.length <= CORD_WORK.receiptLimit,
  'invalid-arrangement');
  return m;
}
interface CheckedReadArrangement {
  arrangement: Arrangement;
  worldId: string;
  worldEpoch: string;
  revision: number;
  authorityAtWorldMs: number;
  floorAtWorldMs: number | null;
  receipts: Receipt[];
  receiptCount: number;
  finished: Finished[];
  finishedCount: number;
}
const checkedReadArrangements = new WeakMap<CordWorkLedger, CheckedReadArrangement>();

function rememberReadArrangement(L: CordWorkLedger, m: Arrangement): void {
  if (L.cordArrangement !== m) return;
  checkedReadArrangements.set(L, {
    arrangement: m,
    worldId: L.world.worldId,
    worldEpoch: L.world.worldEpoch,
    revision: m.revision,
    authorityAtWorldMs: m.authorityAtWorldMs,
    floorAtWorldMs: m.floorAtWorldMs,
    receipts: m.receipts,
    receiptCount: m.receipts.length,
    finished: m.finished,
    finishedCount: m.finished.length
  });
}
function checkedFinishedSummary(
  L: CordWorkLedger, f: Finished, seen?: Set<string>
): void {
  demand(shape(f, [
    'runId', 'actorId', 'siteId', 'operation', 'atWorldMs',
    'projection', 'view', 'workerObservations', 'digest'
  ]) && id(f.runId) && id(f.actorId) && id(f.siteId)
    && ['dry', 'sieve', 'twist', 'ply'].includes(f.operation)
    && uint(f.atWorldMs) && uint(f.digest)
    && (!seen || !seen.has(f.runId)) && !L.runs[f.runId], 'invalid-finished-summary');
  const { digest, ...body } = f;
  demand(summaryDigest(body) === digest
    && ['completed', 'stopped'].includes(f.projection?.status)
    && f.projection.pendingMs === 0, 'corrupt-finished-summary');
}
function checkArrangementJobs(L: CordWorkLedger, m: Arrangement): void {
  const actors = new Set<string>(), sites = new Set<string>();
  for (const r of Object.values(L.runs).filter(r => r.processId === CORD_WORK.processId)) {
    const d = raw(L, r.runId);
    demand(!terminal(d), 'completed-run-retained');
    for (const c of d.controls) {
      demand(c.atWorldMs <= m.authorityAtWorldMs, 'control-after-authority');
      if (c.kind !== 'restore' && (m.floorAtWorldMs === null || c.atWorldMs > m.floorAtWorldMs)) {
        demand(m.receipts.some(q => {
          try {
            const v = JSON.parse(q.payload)[0];
            return q.runId === d.runId && q.key === key('intent', v.intentId)
              && v.kind === c.kind && v.atWorldMs === c.atWorldMs && v.actorId === c.actorId;
          } catch { return false; }
        }), 'control-without-intent');
      }
    }
    demand(!sites.has(d.spec.facts.worksite.locationId), 'worksite-double-booked');
    sites.add(d.spec.facts.worksite.locationId);
    if (d.spec.operation !== 'dry' && active(d)) {
      demand(!actors.has(actor(d)), 'actor-double-booked');
      actors.add(actor(d));
    }
  }
}
function arrangement(L: CordWorkLedger): Arrangement {
  // Writes and restores always use the complete check, even if a read was cached.
  // A failed check also discards any earlier proof for this ledger.
  checkedReadArrangements.delete(L);
  const m = arrangementHeader(L);
  const ids = new Set<string>();
  for (const r of m.receipts) {
    demand(shape(r, ['key', 'payload', 'runId', 'atWorldMs'])
      && id(r.key) && typeof r.payload === 'string' && id(r.runId)
      && uint(r.atWorldMs) && !ids.has(r.key), 'invalid-receipt');
    ids.add(r.key);
  }
  const finished = new Set<string>();
  for (const f of m.finished) {
    checkedFinishedSummary(L, f, finished);
    finished.add(f.runId);
  }
  checkArrangementJobs(L, m);
  rememberReadArrangement(L, m);
  return m;
}
/** Only the immutable history scan is reused. Live jobs and their reservations
 * may change independently, so validate those on every worksite read.
 * Fresh JSON roots and changed arrangement envelopes take the complete path.
 */
function readArrangement(L: CordWorkLedger): Arrangement {
  const m = arrangementHeader(L);
  const checked = checkedReadArrangements.get(L);
  if (checked
    && checked.arrangement === m
    && checked.worldId === L.world.worldId
    && checked.worldEpoch === L.world.worldEpoch
    && checked.revision === m.revision
    && checked.authorityAtWorldMs === m.authorityAtWorldMs
    && checked.floorAtWorldMs === m.floorAtWorldMs
    && checked.receipts === m.receipts
    && checked.receiptCount === m.receipts.length
    && checked.finished === m.finished
    && checked.finishedCount === m.finished.length) {
    checkArrangementJobs(L, m);
    return m;
  }
  return arrangement(L);
}
function safe<T>(f: () => T): T {
  try { return f(); } catch (e) { return translated(e); }
}
function trim(m: Arrangement): void {
  while (m.receipts.length > CORD_WORK.receiptLimit) {
    const old = m.receipts.shift()!;
    m.floorAtWorldMs = Math.max(m.floorAtWorldMs ?? 0, old.atWorldMs);
  }
  if (m.finished.length > CORD_WORK.receiptLimit) {
    m.finished.splice(0, m.finished.length - CORD_WORK.receiptLimit);
  }
}
function transaction<T>(L: CordWorkLedger, f: (d: CordWorkLedger, m: Arrangement) => T): T {
  return safe(() => {
    arrangement(L);
    const d = clone(L), m = clone(arrangement(d));
    const value = f(d, m);
    demand(m.revision < Number.MAX_SAFE_INTEGER, 'revision-overflow');
    m.revision++;
    trim(m);
    d.cordArrangement = m;
    arrangement(d);
    Object.assign(L, d);
    const checked = checkedReadArrangements.get(d);
    if (checked) checkedReadArrangements.set(L, checked);
    return value;
  });
}
function version(m: Arrangement, n: number): void {
  demand(uint(n) && m.revision === n, 'stale-arrangement');
}
function replay(m: Arrangement, k: string, payload: string, at: number): string | null {
  const r = m.receipts.find(r => r.key === k);
  if (r) {
    demand(r.payload === payload, 'conflicting-replay');
    return r.runId;
  }
  demand(m.floorAtWorldMs === null || at > m.floorAtWorldMs, 'expired-command');
  return null;
}
const jobs=(L:Ledger)=>Object.values(L.runs).filter(r=>r.processId===CORD_WORK.processId).map(r=>raw(L,r.runId));
function huskBusy(L:Ledger,actor:string,site:string){return otherScienceWorkBusy(L,actor,site,CORD_WORK.processId);}
function projectionOf(d: Data): WorkProjection {
  const m = model(d);
  const p = d.abandonedAtMs !== null ? m.projectForAbandon(d.science) : m.project(d.science);
  return {
    status: d.abandonedAtMs !== null ? 'stopped' : terminal(d) ? 'completed' : 'running',
    certifiedMs: p.totalTimeMs,
    pendingMs: d.pendingMs,
    completedAtMs: d.completedAtMs,
    abandonedAtMs: d.abandonedAtMs,
    projection: p
  };
}
function workerWords(d: Data, worker: string): {channel: 'sight'; text: string}[] {
  const assignment = d.controls.filter(c => ['start', 'takeover'].includes(c.kind)).at(-1)!;
  if (d.spec.operation === 'dry' || actor(d) !== worker
    || !d.frames.some(f => f.kind === 'executor-activity-span'
      && f.actorId === worker && f.fromWorldMs >= assignment.atWorldMs
      && eligible(f, d.spec, d.controls))) return [];
  return [{channel: 'sight', text: model(d).observe(d.science).text}];
}
function viewOf(d: Data, asOfWorldMs: number): CordWorksiteView {
  const manual = d.spec.operation !== 'dry';
  const last = d.frames.at(-1);
  const seen = d.frames.some(f => eligible(f, d.spec, d.controls));
  const observations = d.abandonedAtMs !== null
    ? [{
      channel: 'sight' as const,
      text: d.spec.operation === 'dry' ? '繊維の束を屋根の下から取り出した。'
        : d.spec.operation === 'sieve' ? '振るっていた束と落ちた髄を脇に置いた。'
          : d.spec.operation === 'twist' ? '途中まで撚った糸と残った繊維を脇に置いた。'
            : '合わせていた縄と撚り糸を脇に置いた。'
    }]
    : seen && manual ? [{channel: 'sight' as const, text: model(d).observe(d.science).text}] : [];
  const abandoned = d.abandonedAtMs !== null;
  const complete = terminal(d), engaged = active(d);
  const fresh = last?.confirmedAtWorldMs === asOfWorldMs
    && last.toWorldMs > d.controls.at(-1)!.atWorldMs;
  const working = manual && engaged && !!fresh && eligible(last!, d.spec, d.controls);
  return {
    title: '縄の作業場',
    stage: titles[d.spec.operation],
    activity: abandoned ? 'abandoned' : complete ? 'completed'
      : !engaged ? 'paused' : working ? 'working' : 'waiting',
    materialsReserved: !complete,
    operatorFree: complete || !engaged || !manual,
    reason: complete || working ? null : !engaged ? '中断している。続きは残っている。'
      : manual ? '現在の在席と手仕事が未確認。' : '屋根の下で乾くのを待っている。',
    nextStep: complete ? '回収した材料を確認し、次の作業を選ぶ。'
      : !engaged ? '続けたい意図と実際の作業条件を確認する。'
        : manual ? '実際に手を動かした区間を確認する。' : '屋根の下に置かれていた区間を確認する。',
    observations
  };
}
function retire(L: CordWorkLedger, m: Arrangement, d: Data): void {
  demand(terminal(d), 'cannot-retire-active-work');
  const at = Math.max(d.observedThroughWorldMs, d.controls.at(-1)!.atWorldMs);
  m.finished.push(sealSummary({
    runId: d.runId,
    actorId: actor(d),
    siteId: d.spec.facts.worksite.locationId,
    operation: d.spec.operation,
    atWorldMs: at,
    projection: projectionOf(d),
    view: viewOf(d, at),
    workerObservations: workerWords(d, actor(d))
  }));
  delete L.runs[d.runId];
}

function settle(L:CordWorkLedger,a:Arrangement,d:Data,oldLastTo:number,requestTo:number){
 const m=model(d),p=d.abandonedAtMs!==null?m.projectForAbandon(d.science):m.project(d.science),complete=terminal(d),history=Math.min(...d.sources.map(readCordHistory)),location=d.spec.facts.worksite.locationId;
 const produced:ScienceStepResult['produced']=[];
 const has=(x:CoirMass)=>sum(x.fiberDryMg,x.pithDryMg,x.waterMg)>0;
 if(complete){
  if(p.bundle)produced.push(writeCordBundle(p.bundle,location,history));
  if(p.fallenPith.pithDryMg||p.fallenPith.waterMg)produced.push(writeCordPith(p.fallenPith,location,history));
  if(p.piece)produced.push(writeCordPiece(p.piece,location,history));
  if(d.spec.operation==='twist'&&p.remaining[0]&&has(p.remaining[0]))produced.push(p.remaining[0].fiberDryMg>0?writeCordBundle(p.remaining[0],location,history):writeCordPith(p.remaining[0],location,history));
  if(d.spec.operation==='ply')for(const piece of p.leftovers??[])produced.push(writeCordPiece(piece,location,history));
 }
 const req:ScienceStepRequest={contract:'0.2.1',requestId:key(d.runId,'step',String(d.frames.length),String(d.controls.length)),world:{...L.world},runId:d.runId,
 processId:CORD_WORK.processId,processVersion:CORD_WORK.version,catalogVersion:'civ-sci-test-2',interval:{from:oldLastTo,to:requestTo},
 state:L.runs[d.runId].state,environment:{sampleId:'env:coir-unused',source:'unknown',effectiveAt:oldLastTo},lots:clone(d.sources),equipment:[],energy:[],actions:[],seed:d.seed};
 const result:ScienceStepResult={contract:req.contract,requestId:req.requestId,runId:d.runId,simulated:{from:oldLastTo,to:d.abandonedAtMs??d.completedAtMs??requestTo},
 state:{schema:CORD_WORK.schema,data:d},status:d.abandonedAtMs!==null?'stopped':complete?'completed':'running',consumed:complete?d.sources.map(l=>({lotId:l.lotId,amount:clone(l.amount)})):[],produced,
 released:complete&&p.releasedWaterMg?[{materialId:'water_vapor',amount:{value:p.releasedWaterMg,unit:'mg'},to:'air'}]:[],drawn:[],energy:[],equipmentWear:[],observations:[],
 evidence:{evaluatorVersion:CORD_WORK.version,sourceRefs:[],notes:'owner-assumption-not-calibrated; explicit '+ID}};
 const applied=commit(L,req,result);demand(applied.ok,'ledger-settlement-refused');
  if (complete) retire(L, a, d);
}
export function cordWorkRevision(L:CordWorkLedger):number{return safe(()=>arrangement(L).revision);}
export function applyCordIntent(L:CordWorkLedger,i:CordIntent,expectedRevision:number,nowWorldMs:number,facts?:CordStartFacts):{runId:string}{
 return safe(()=>{
 const fields=i?.kind==='start'?['intentId','kind','actorId','atWorldMs','operation','lotIds','siteId','presence']:
 (i?.kind==='resume'||i?.kind==='takeover')?['intentId','kind','actorId','atWorldMs','runId','presence']:['intentId','kind','actorId','atWorldMs','runId'];
 demand(shape(i,fields)&&['start','stop','resume','takeover','abandon'].includes(i.kind)&&id(i.intentId)&&id(i.actorId)&&uint(i.atWorldMs)&&uint(nowWorldMs)&&i.atWorldMs<=nowWorldMs,'invalid-intent');
 if(['start','resume','takeover'].includes(i.kind))demand(['here','away','unknown'].includes((i as {presence:Presence}).presence),'invalid-presence');
 const k=key('intent',i.intentId),payload=canon([i,facts??null]),old=replay(arrangement(L),k,payload,i.atWorldMs);if(old)return {runId:old};
 return transaction(L,(draft,a)=>{
  version(a,expectedRevision);demand(i.atWorldMs>=a.authorityAtWorldMs,'backdated-intent');a.authorityAtWorldMs=i.atWorldMs;
  let d:Data;
  if(i.kind==='start'){
   demand(facts&&id(i.siteId)&&facts.worksite?.locationId===i.siteId,'start-facts-required');
   const busy=huskBusy(draft,i.actorId,i.siteId);
   demand(!busy.site&&!jobs(draft).some(d=>!terminal(d)&&d.spec.facts.worksite.locationId===i.siteId),'worksite-reserved');
   if(i.operation!=='dry')demand(!busy.actor&&!jobs(draft).some(d=>!terminal(d)&&active(d)&&d.spec.operation!=='dry'&&actor(d)===i.actorId),'actor-busy');
   const spec:Spec={commandId:i.intentId,actorId:i.actorId,operation:i.operation,lotIds:clone(i.lotIds),openedAtWorldMs:i.atWorldMs,facts:clone(facts)};
   const sources=spec.lotIds.map(lotId=>{const l=draft.lots[lotId];demand(l&&!l.reservedBy,'missing-or-reserved-material');const {reservedBy:_,...v}=l;return clone(v);});
   specOk(spec,sources);
   const started=startRun(draft,{processId:CORD_WORK.processId,processVersion:CORD_WORK.version,catalogVersion:'civ-sci-test-2',contract:'0.2.1',clock:clock(spec),lotIds:spec.lotIds,equipmentIds:[],operator:spec.actorId},i.atWorldMs);
   demand(started.run,'reservation-refused');const r=started.run;r.lastTo=toClock(clock(spec),i.atWorldMs);
   d=rebuild(draft.world.worldId,draft.world.worldEpoch,r.runId,r.seed,spec,sources,[{kind:'start',atWorldMs:i.atWorldMs,actorId:i.actorId}],[]);
   r.state={schema:CORD_WORK.schema,data:d};
   if(terminal(d))settle(draft,a,d,r.lastTo,r.lastTo);
  }else{
   demand(facts===undefined&&id(i.runId),'invalid-resume-or-stop');d=raw(draft,i.runId);
   demand(!terminal(d),'work-already-completed');
   demand(i.kind==='takeover'?d.spec.operation!=='dry'&&actor(d)!==i.actorId:actor(d)===i.actorId,'not-this-actors-job');
   demand(i.atWorldMs>=d.observedThroughWorldMs,'intent-precedes-work');
   if(i.kind==='resume'||i.kind==='takeover'){
    demand(!active(d),'already-engaged');const busy=huskBusy(draft,i.actorId,'');
    if(d.spec.operation!=='dry')demand(!busy.actor&&!jobs(draft).some(x=>x.runId!==d.runId&&!terminal(x)&&active(x)&&x.spec.operation!=='dry'&&actor(x)===i.actorId),'actor-busy');
   }else if(i.kind==='abandon')demand(!active(d),'stop-before-abandon');
   else demand(active(d),'already-paused');
   const next=rebuild(d.worldId,d.worldEpoch,d.runId,d.seed,d.spec,d.sources,[...d.controls,{kind:i.kind,atWorldMs:i.atWorldMs,actorId:i.actorId}],d.frames);
   draft.runs[d.runId].operator=i.actorId;
   if(i.kind==='abandon')settle(draft,a,next,draft.runs[d.runId].lastTo,toClock(clock(next.spec),i.atWorldMs));
   else draft.runs[d.runId].state={schema:CORD_WORK.schema,data:next};
  }
  a.receipts.push({key:k,payload,runId:d.runId,atWorldMs:i.atWorldMs});return {runId:d.runId};
 });
 });
}
export function recordCordSpan(L:CordWorkLedger,runId:string,f:CordSpan,expectedRevision:number,nowWorldMs:number):void{
 safe(()=>{
 demand(uint(nowWorldMs)&&f&&uint(f.confirmedAtWorldMs)&&f.confirmedAtWorldMs<=nowWorldMs,'future-or-unconfirmed-span');
 const k=key('span',runId,f.spanId),payload=canon(f);if(replay(arrangement(L),k,payload,f.confirmedAtWorldMs))return;
 transaction(L,(draft,a)=>{
  version(a,expectedRevision);const old=raw(draft,runId);demand(!terminal(old),'work-already-completed');
  const d=rebuild(old.worldId,old.worldEpoch,runId,old.seed,old.spec,old.sources,old.controls,[...old.frames,clone(f)]);
  settle(draft,a,d,draft.runs[runId].lastTo,toClock(clock(d.spec),f.toWorldMs));
  a.authorityAtWorldMs=Math.max(a.authorityAtWorldMs,f.confirmedAtWorldMs);a.receipts.push({key:k,payload,runId,atWorldMs:f.confirmedAtWorldMs});
 });
 });
}
function legacyArrangement(L:any):any {
 const m=L.cordArrangement;
 if(!m){demand(!Object.values(L.runs).some((r:any)=>r.processId===CORD_WORK.processId),'missing-arrangement');
 return {schema:LEGACY_CORD_WORK.arrangement,worldId:L.world.worldId,worldEpoch:L.world.worldEpoch,revision:0,authorityAtWorldMs:0,receipts:[]};}
 demand(shape(m,['schema','worldId','worldEpoch','revision','authorityAtWorldMs','receipts'])&&m.schema===LEGACY_CORD_WORK.arrangement&&m.worldId===L.world.worldId&&m.worldEpoch===L.world.worldEpoch
 &&uint(m.revision)&&uint(m.authorityAtWorldMs)&&Array.isArray(m.receipts),'invalid-arrangement');
 const ids=new Set<string>();
 for(const r of m.receipts){demand(shape(r,['key','payload','runId'])&&id(r.key)&&typeof r.payload==='string'&&id(r.runId)&&!ids.has(r.key),'invalid-receipt');ids.add(r.key);}
 const actors=new Set<string>(),sites=new Set<string>();
 for(const r of Object.values(L.runs).filter((r:any)=>r.processId===CORD_WORK.processId)){
  const d=raw(L,(r as any).runId,true);
  for(const c of d.controls){demand(c.atWorldMs<=m.authorityAtWorldMs,'control-after-authority');
   if(c.kind!=='restore')demand(m.receipts.some((q:any)=>{try{const v=JSON.parse(q.payload)[0];return q.runId===d.runId&&q.key===key('intent',v.intentId)&&v.kind===c.kind&&v.atWorldMs===c.atWorldMs&&v.actorId===c.actorId;}catch{return false;}}),'control-without-intent');
  }
  if(!terminal(d)){
   demand(!sites.has(d.spec.facts.worksite.locationId),'worksite-double-booked');sites.add(d.spec.facts.worksite.locationId);
   if(d.spec.operation!=='dry'&&active(d)){demand(!actors.has(actor(d)),'actor-double-booked');actors.add(actor(d));}
  }
 }
 return m;
}


function migrateCordRecords(L: CordWorkLedger): void {
  const saved = L.cordArrangement as any;
  if (!saved || saved.schema !== LEGACY_CORD_WORK.arrangement) return;
  // Validate the original representation before changing any tag or dropping history.
  const previous = legacyArrangement(L);
  const data = Object.values(L.runs)
    .filter(r => r.processId === CORD_WORK.processId)
    .map(r => raw(L, r.runId, true));
  const m: Arrangement = {
    schema: CORD_WORK.arrangement,
    worldId: previous.worldId,
    worldEpoch: previous.worldEpoch,
    revision: previous.revision,
    authorityAtWorldMs: previous.authorityAtWorldMs,
    floorAtWorldMs: null,
    receipts: [],
    finished: []
  };
  for (const r of previous.receipts) {
    const event = JSON.parse(r.payload);
    const at = Array.isArray(event) ? event[0]?.atWorldMs : event?.confirmedAtWorldMs;
    demand(uint(at) && at <= m.authorityAtWorldMs, 'invalid-legacy-receipt-time');
    m.receipts.push({key: r.key, payload: r.payload, runId: r.runId, atWorldMs: at});
  }
  for (const before of data) {
    const d = rebuild(before.worldId, before.worldEpoch, before.runId, before.seed,
      before.spec, before.sources, before.controls, before.frames);
    const r = L.runs[d.runId];
    r.processVersion = CORD_WORK.version;
    r.state = {schema: CORD_WORK.schema, data: d};
    if (terminal(d)) retire(L, m, d);
  }
  trim(m);
  L.cordArrangement = m;
  arrangement(L);
}

export function restoreCordWork(saved:unknown,nowWorldMs:number):CordWorkLedger{
 return safe(()=>{
 let L=clone(saved) as CordWorkLedger;
  migrateCordRecords(L);
 if((L as any).manualHuskArrangement)L=restoreHuskArrangement(L,nowWorldMs) as CordWorkLedger;
 const m=arrangement(L);
 demand(uint(nowWorldMs)&&nowWorldMs>=m.authorityAtWorldMs,'restore-before-saved-events');
 transaction(L,(d,a)=>{
  a.authorityAtWorldMs=nowWorldMs;
  for(const job of jobs(d))if(!terminal(job)&&active(job)&&job.spec.operation!=='dry'){
   // Waiting may really continue offline, but it still needs an explicit fact
   // confirming the roof; restoring alone creates none.
   const at=Math.max(job.controls.at(-1)!.atWorldMs,job.observedThroughWorldMs);
   const next=rebuild(job.worldId,job.worldEpoch,job.runId,job.seed,job.spec,job.sources,[...job.controls,{kind:'restore',atWorldMs:at,actorId:actor(job)}],job.frames);
   d.runs[job.runId].state={schema:CORD_WORK.schema,data:next};
  }
 });return L;
 });
}
/** World-only numeric accounting. Never spread this into an AI/UI/log payload. */
export function projectCordWork(L: CordWorkLedger, runId: string): WorkProjection {
  return safe(() => {
    const m = arrangement(L);
    const done = m.finished.find(f => f.runId === runId);
    if (done) return clone(done.projection);
    return projectionOf(raw(L, runId));
  });
}
export interface CordWorksiteView {title:string;stage:string;activity:'available'|'waiting'|'working'|'paused'|'completed'|'abandoned';materialsReserved:boolean;operatorFree:boolean;reason:string|null;nextStep:string;observations:{channel:'sight';text:string}[]}
const titles:Record<Operation,string>={dry:'繊維を屋根の下で乾かす',sieve:'繊維の髄を振るう',twist:'繊維から撚り糸を作る',ply:'撚り糸を縄に合わせる'};
export function readCordWorksite(
  L: CordWorkLedger, siteId: string, asOfWorldMs: number
): CordWorksiteView {
  return safe(() => {
    const a = readArrangement(L);
    demand(id(siteId) && uint(asOfWorldMs) && asOfWorldMs >= a.authorityAtWorldMs, 'invalid-view-context');
    const d = jobs(L).find(job => job.spec.facts.worksite.locationId === siteId);
    if (d) return viewOf(d, asOfWorldMs);
    const done = a.finished.filter(f => f.siteId === siteId).at(-1);
    if (done) {
      checkedFinishedSummary(L, done);
      return clone(done.view);
    }
    return {
      title: '縄の作業場', stage: '開始前', activity: 'available',
      materialsReserved: false, operatorFree: true, reason: null,
      nextStep: '選ばれた作業の意図を待つ。', observations: []
    };
  });
}
export function readCordWorkerObservations(
  L: CordWorkLedger, runId: string, actorId: string
): {channel: 'sight'; text: string}[] {
  return safe(() => {
    const m = arrangement(L);
    const done = m.finished.find(f => f.runId === runId);
    if (done) return done.actorId === actorId ? clone(done.workerObservations) : [];
    return workerWords(raw(L, runId), actorId);
  });
}
/** Public failure words are deliberately separate from internal error codes. */
export function cordFailureObservations(error:unknown,attempt?:{kind:'host-confirmed-on-site-attempt'}):{channel:'touch'|'sight';text:string}[]{
 if(!attempt||!shape(attempt,['kind'])||attempt.kind!=='host-confirmed-on-site-attempt')return [{channel:'sight',text:'作業場で材料を確かめたい。'}];
 const code=error instanceof CordWorkError?error.code:'unknown';
 const words:Record<string,string>={'wet-fiber-cannot-twist':'繊維が湿っていて、撚れない。','too-much-pith-sieve-first':'髄が多く、撚るとぼろぼろ崩れる。',
 'insufficient-fiber':'撚るための繊維が足りない。','strands-too-short':'撚り糸が短く、合わせられない。','strands-not-similar-length':'撚り糸の長さがそろっていない。',
 'three-distinct-strands-required':'同じ撚り糸どうしでは合わせられない。'};
 return [{channel:'touch',text:Object.hasOwn(words,code)?words[code]:'作業を進められない。材料と作業場を確かめたい。'}];
}
