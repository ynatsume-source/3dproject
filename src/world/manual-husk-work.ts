// Opt-in host boundary for accepted PR20. No resident scheduler or second ledger.
// The caller is the authoritative executor; it certifies actual continuous activity,
// not an AI plan, task timer, weather interval, animation or elapsed offline time.
import type {LotView, Observation, ScienceStepRequest, ScienceStepResult} from './science-contract';
import {startRun, commit, type Ledger, type Run} from './process-runner';
import {createManualHuskSeparation, type WetUnseparatedHusk, type ManualSeparationState} from '../science/prototypes/manual-husk-separation';
import {MANUAL_HUSK_ASSUMPTION, createManualHuskAssumptionProfile} from '../science/prototypes/manual-husk-assumptions';

export const MANUAL_HUSK_WORK = Object.freeze({
  processId: 'prototype_manual_husk_work', processVersion: 'host-2',
  catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'world' as const,
  schema: 'civ-world.manual-husk-work/2', quantumMs: 30_000,
});
export const MANUAL_HUSK_RECORDS_SCHEMA = 'civ-world.manual-husk-records/1';
export const MANUAL_HUSK_RECORD_LIMIT = 64;

export interface HuskWorksite {locationId: string; x: number; z: number; reachM: number}
export interface HuskWorkSpec {
  commandId: string; assumptionId: string; operatorId: string; huskCount: 1;
  input: WetUnseparatedHusk; worksite: HuskWorksite; openedAtWorldMs: number;
}
/** A completed, continuous span from the WORLD EXECUTOR. Split a span at any
 * movement, interruption or activity change. Endpoints alone do not certify a path.
 * No client/AI text is accepted as this authority at an application boundary. */
export interface HuskExecutorSpan {
  kind: 'executor-activity-span'; spanId: string;
  worldId: string; worldEpoch: string; runId: string; actorId: string;
  fromWorldMs: number; toWorldMs: number; confirmedAtWorldMs: number;
  activity: 'separate-wet-husk' | 'rest' | 'travel' | 'idle' | 'unknown';
  targetLotId: string | null; targetSiteId: string | null; arrived: boolean;
  fromPosition: {x: number; z: number}; toPosition: {x: number; z: number};
}
interface Segment {fromWorldMs: number; toWorldMs: number; actorId: string}
interface Assignment {actorId: string; atWorldMs: number}
interface HostData {
  binding: string; worldId: string; worldEpoch: string; runId: string;
  spec: HuskWorkSpec; source: LotView; frames: HuskExecutorSpan[]; assignments: Assignment[]; abandonedAtWorldMs: number | null;
  science: ManualSeparationState; pending: Segment[]; pendingWorkMs: number;
  observedThroughWorldMs: number; completedAtWorldMs: number | null;
}
const uint = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const id = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function requireHost(ok: unknown, why: string): asserts ok {if (!ok) throw Error('manual husk host: ' + why);}
function shape(v: unknown, keys: readonly string[]): v is Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const a = Object.keys(v).sort(), b = [...keys].sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
}
function canonical(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const clone = <T>(v: T): T => structuredClone(v);
const add = (a: number, b: number) => {const n = BigInt(a) + BigInt(b); requireHost(n <= BigInt(Number.MAX_SAFE_INTEGER), 'integer-overflow'); return Number(n);};
const withoutReservation = (l: LotView & {reservedBy?: string}): LotView => {
  const {reservedBy: _, ...copy} = l; return clone(copy);
};
function point(v: unknown): v is {x: number; z: number} {
  return shape(v, ['x', 'z']) && Number.isFinite(v.x) && Number.isFinite(v.z);
}
function checkSpec(s: HuskWorkSpec) {
  requireHost(shape(s, ['commandId','assumptionId','operatorId','huskCount','input','worksite','openedAtWorldMs'])
    && id(s.commandId) && id(s.operatorId) && uint(s.openedAtWorldMs) && s.huskCount === 1, 'explicit-one-husk-spec-required');
  requireHost(s.assumptionId === MANUAL_HUSK_ASSUMPTION.id, 'explicit-owner-assumption-required');
  requireHost(shape(s.worksite, ['locationId','x','z','reachM']) && id(s.worksite.locationId)
    && Number.isFinite(s.worksite.x) && Number.isFinite(s.worksite.z)
    && Number.isFinite(s.worksite.reachM) && s.worksite.reachM > 0, 'invalid-worksite');
  // The accepted core validates the full input and provenance, with no guessed composition.
  const profile = createManualHuskAssumptionProfile(s.input, MANUAL_HUSK_ASSUMPTION.id);
  createManualHuskSeparation(s.input, profile, {worldId:'validation',worldEpoch:'validation',runId:'validation',openedAtWorldMs:s.openedAtWorldMs});
}
function checkSource(source: LotView, s: HuskWorkSpec) {
  const q = source.quality;
  requireHost(source.lotId === s.input.lotId && source.materialId === s.input.materialId
    && source.location === s.worksite.locationId && source.amount.unit === 'mg'
    && uint(source.amount.value, 1) && source.amount.value === add(s.input.dryMg, s.input.waterMg)
    && q && q.dry_mg === s.input.dryMg && q.water_mg === s.input.waterMg
    && q.husk_count === 1 && q.unseparated === 1 && [0,1].includes(q.history_complete),
    'requires-one-explicit-wet-unseparated-husk-at-worksite');
  requireHost(Object.values(q).every(v => typeof v === 'number' && Number.isFinite(v)), 'invalid-source-quality');
}
function checkFrame(f: HuskExecutorSpan, d: Pick<HostData,'worldId'|'worldEpoch'|'runId'|'spec'>) {
  requireHost(shape(f, ['kind','spanId','worldId','worldEpoch','runId','actorId','fromWorldMs','toWorldMs','confirmedAtWorldMs','activity','targetLotId','targetSiteId','arrived','fromPosition','toPosition'])
    && f.kind === 'executor-activity-span' && id(f.spanId) && id(f.actorId)
    && f.worldId === d.worldId && f.worldEpoch === d.worldEpoch && f.runId === d.runId
    && uint(f.fromWorldMs) && uint(f.toWorldMs) && uint(f.confirmedAtWorldMs)
    && f.fromWorldMs >= d.spec.openedAtWorldMs && f.toWorldMs > f.fromWorldMs && f.confirmedAtWorldMs >= f.toWorldMs
    && ['separate-wet-husk','rest','travel','idle','unknown'].includes(f.activity)
    && (f.targetLotId === null || id(f.targetLotId)) && (f.targetSiteId === null || id(f.targetSiteId))
    && typeof f.arrived === 'boolean' && point(f.fromPosition) && point(f.toPosition), 'invalid-executor-span');
}
function assignedActor(assignments: Assignment[], at: number): string {
  return assignments.filter(a=>a.atWorldMs<=at).at(-1)!.actorId;
}
function isWork(f: HuskExecutorSpan, spec: HuskWorkSpec, assignments: Assignment[]) {
  const site = spec.worksite, near = (p: {x:number;z:number}) => Math.hypot(p.x-site.x, p.z-site.z) <= site.reachM;
  return f.actorId === assignedActor(assignments,f.fromWorldMs) && f.activity === 'separate-wet-husk' && f.arrived
    && f.targetLotId === spec.input.lotId && f.targetSiteId === site.locationId
    && near(f.fromPosition) && near(f.toPosition);
}
/** Rebuild from authoritative recorded spans. Adjacent work is normalized before
 * quantum boundaries are derived, so the capture/saving frequency cannot change them. */
function rebuild(worldId: string, worldEpoch: string, runId: string, spec: HuskWorkSpec, source: LotView, frames: HuskExecutorSpan[], assignments: Assignment[]=[{actorId:spec.operatorId,atWorldMs:spec.openedAtWorldMs}], abandonedAtWorldMs: number|null=null): HostData {
  requireHost(id(worldId) && id(worldEpoch) && id(runId), 'invalid-host-context');
  checkSpec(spec); checkSource(source, spec); requireHost(Array.isArray(frames), 'invalid-frame-history');
  requireHost(Array.isArray(assignments)&&assignments.length>0,'invalid-assignment-history');
  let assignedAt=spec.openedAtWorldMs;
  for(let i=0;i<assignments.length;i++){
    const a=assignments[i];requireHost(shape(a,['actorId','atWorldMs'])&&id(a.actorId)&&uint(a.atWorldMs)
      &&a.atWorldMs>=assignedAt&&(i>0?a.actorId!==assignments[i-1].actorId:a.actorId===spec.operatorId&&a.atWorldMs===spec.openedAtWorldMs),'invalid-assignment-history');
    assignedAt=a.atWorldMs;
  }
  const base = {worldId,worldEpoch,runId,spec}, profile = createManualHuskAssumptionProfile(spec.input, MANUAL_HUSK_ASSUMPTION.id);
  const model = createManualHuskSeparation(spec.input, profile, {worldId,worldEpoch,runId,openedAtWorldMs:spec.openedAtWorldMs});
  let observed = spec.openedAtWorldMs, available = 0;
  const seen = new Set<string>(), segments: Segment[] = [];
  for (const f of frames) {
    checkFrame(f, base);
    requireHost(!seen.has(f.spanId) && f.fromWorldMs >= observed, 'duplicate-or-overlapping-executor-spans');
    seen.add(f.spanId); observed = f.toWorldMs;
    requireHost(!assignments.some(a=>a.atWorldMs>f.fromWorldMs&&a.atWorldMs<f.toWorldMs),'span-crosses-assignment');
    if (!isWork(f, spec, assignments)) continue;
    available = add(available, f.toWorldMs-f.fromWorldMs);
    const last = segments.at(-1);
    if (last?.toWorldMs === f.fromWorldMs && last.actorId===f.actorId) last.toWorldMs = f.toWorldMs;
    else segments.push({fromWorldMs:f.fromWorldMs,toWorldMs:f.toWorldMs,actorId:f.actorId});
  }
  const Q = MANUAL_HUSK_WORK.quantumMs, horizon = profile.knots.at(-1)!.workMs;
  const completionWork = Number((BigInt(horizon)+BigInt(Q)-1n)/BigInt(Q)*BigInt(Q));
  requireHost(uint(completionWork,1), 'work-duration-overflow');
  let remaining = Math.min(Math.floor(available/Q)*Q, completionWork), science = model.start();
  const budget = remaining, pending: Segment[] = [];
  let index = 0, completedAt: number | null = null;
  // Each full quantum may cross a pause. Pass its real subintervals, never a
  // synthetic continuous interval that would contain the pause.
  while (remaining > 0) {
    let needed = Q, part = 0;
    const pieces: Segment[] = [];
    while (needed > 0) {
      const s = segments[index]; requireHost(s, 'work-segments-exhausted');
      const n = Math.min(needed, s.toWorldMs-s.fromWorldMs);
      pieces.push({fromWorldMs:s.fromWorldMs,toWorldMs:s.fromWorldMs+n,actorId:s.actorId});
      s.fromWorldMs += n; needed -= n;
      if (s.fromWorldMs === s.toWorldMs) index++;
    }
    const quantumEnd = pieces.at(-1)!.toWorldMs, quantum = (budget-remaining)/Q;
    // Preserve real attestation times, including a later bulk recording. Only
    // physical output, work and balances are partition-invariant; audit times need not be.
    const certifiedAt = Math.max(...frames.filter(f => isWork(f,spec,assignments) && pieces.some(p => f.fromWorldMs<p.toWorldMs && f.toWorldMs>p.fromWorldMs)).map(f => f.confirmedAtWorldMs));
    for (const p of pieces) science = model.commit(science, {
      kind:'host-confirmed-manual-work',confirmationId:runId+':work:'+quantum+':'+part++,
      worldId,worldEpoch,runId,attendance:'present',operation:'separate-wet-husk',
      ...p,confirmedAtWorldMs:certifiedAt,
    });
    remaining -= Q;
    if (science.totalWorkMs >= horizon) completedAt = quantumEnd;
  }
  if (completedAt === null) for (let i=index; i<segments.length; i++) {
    const s=segments[i]; if(s.toWorldMs>s.fromWorldMs) pending.push({...s});
  }
  requireHost(abandonedAtWorldMs===null||(uint(abandonedAtWorldMs)&&abandonedAtWorldMs>=Math.max(observed,assignedAt)&&completedAt===null),'invalid-abandon-time');
  return {binding:canonical([MANUAL_HUSK_WORK,worldId,worldEpoch,runId,spec,source]),worldId,worldEpoch,runId,
    spec:clone(spec),source:clone(source),frames:clone(frames),assignments:clone(assignments),abandonedAtWorldMs,science,pending,
    pendingWorkMs:pending.reduce((n,s)=>add(n,s.toWorldMs-s.fromWorldMs),0),
    observedThroughWorldMs:observed,completedAtWorldMs:completedAt};
}
function dataOf(L: Ledger, runId: string): {run: Run; data: HostData} {
  const r=L.runs[runId], v=r?.state;
  requireHost(r && r.processId===MANUAL_HUSK_WORK.processId && r.processVersion===MANUAL_HUSK_WORK.processVersion
    && r.catalogVersion===MANUAL_HUSK_WORK.catalogVersion && r.contract===MANUAL_HUSK_WORK.contract && r.clock==='world'
    && v?.schema===MANUAL_HUSK_WORK.schema && v.data && typeof v.data==='object', 'unsupported-host-run-or-state');
  const d=v.data as HostData;
  requireHost(d.worldId===L.world.worldId && d.worldEpoch===L.world.worldEpoch && d.runId===runId, 'wrong-world-or-run');
  const expected=rebuild(d.worldId,d.worldEpoch,d.runId,d.spec,d.source,d.frames,d.assignments,d.abandonedAtWorldMs);
  requireHost(canonical(d)===canonical(expected), 'corrupt-host-or-science-state');
  requireHost(r.operator===d.assignments.at(-1)!.actorId && r.lotIds.length===1 && r.lotIds[0]===d.source.lotId && r.equipmentIds.length===0, 'changed-run-binding');
  const terminal=d.completedAtWorldMs!==null||d.abandonedAtWorldMs!==null;
  requireHost(terminal ? r.status===(d.abandonedAtWorldMs!==null?'stopped':'completed') : ['starting','running'].includes(r.status), 'unexpected-run-status');
  requireHost(r.lastTo===(d.abandonedAtWorldMs??d.completedAtWorldMs??d.observedThroughWorldMs), 'changed-run-clock');
  if (!terminal) {
    const current=L.lots[d.source.lotId];
    requireHost(current && current.reservedBy===runId && canonical(withoutReservation(current))===canonical(d.source), 'lost-or-changed-reserved-husk');
  }
  return {run:r,data:expected};
}
function transact<T>(L: Ledger, f: (copy: Ledger)=>T): T {
  const copy=clone(L), result=f(copy);
  Object.assign(L,copy); return result;
}
function observations(d: HostData, at: number): Observation[] {
  const p=d.science.pools, out: Observation[]=[];
  if (p.fiber.dryMg>0) out.push({at,channel:'sight',text:'ほぐれた繊維が束になっている。'});
  else out.push({at,channel:'sight',text:'殻には繊維の筋がついている。'});
  if (p.residualHusk.dryMg>0) out.push({at,channel:'sight',text:'残った殻にも筋がついている。'});
  out.push({at,channel:'touch',text:p.fiber.waterMg+p.attachedPith.waterMg+p.residualHusk.waterMg>0?'繊維と殻はしっとりしている。':'繊維と殻は乾いた手ざわりだ。'});
  return out;
}

interface ManualProjection {
  status: Run['status'];
  certifiedWorkMs: number;
  pendingWorkMs: number;
  pools: ManualSeparationState['pools'];
  completedAtWorldMs: number | null;
  abandonedAtWorldMs: number | null;
}
interface FinishedManualWork {
  runId: string;
  commandId: string;
  startPayload: string;
  actorId: string;
  throughWorldMs: number;
  hadWork: boolean;
  observationActorId: string | null;
  projection: ManualProjection;
  observations: Observation[];
}
interface ManualReceipt {
  key: string;
  payload: string;
  runId: string;
}
interface ManualRecords {
  schema: typeof MANUAL_HUSK_RECORDS_SCHEMA;
  worldId: string;
  worldEpoch: string;
  floorAtWorldMs: number | null;
  finished: FinishedManualWork[];
  receipts: ManualReceipt[];
}
type RecordsLedger = Ledger & { manualHuskRecords?: ManualRecords };

function recordState(L: Ledger): ManualRecords {
  const records = (L as RecordsLedger).manualHuskRecords;
  if (!records) {
    return {
      schema: MANUAL_HUSK_RECORDS_SCHEMA,
      worldId: L.world.worldId,
      worldEpoch: L.world.worldEpoch,
      floorAtWorldMs: null,
      finished: [],
      receipts: []
    };
  }
  requireHost(shape(records, [
    'schema', 'worldId', 'worldEpoch', 'floorAtWorldMs', 'finished', 'receipts'
  ]) && records.schema === MANUAL_HUSK_RECORDS_SCHEMA
    && records.worldId === L.world.worldId && records.worldEpoch === L.world.worldEpoch
    && (records.floorAtWorldMs === null || uint(records.floorAtWorldMs)) && Array.isArray(records.finished)
    && records.finished.length <= MANUAL_HUSK_RECORD_LIMIT
    && Array.isArray(records.receipts)
    && records.receipts.length <= MANUAL_HUSK_RECORD_LIMIT, 'invalid-manual-records');
  const keys = new Set<string>();
  for (const receipt of records.receipts) {
    requireHost(shape(receipt, ['key', 'payload', 'runId']) && id(receipt.key)
      && typeof receipt.payload === 'string' && id(receipt.runId)
      && !keys.has(receipt.key), 'invalid-manual-receipt');
    keys.add(receipt.key);
  }
  return records;
}


function validateManualFinish(L: Ledger, item: FinishedManualWork): void {
    requireHost(shape(item, [
      'runId', 'commandId', 'startPayload', 'actorId', 'throughWorldMs',
      'hadWork', 'observationActorId', 'projection', 'observations'
    ]) && id(item.runId) && id(item.commandId)
      && typeof item.startPayload === 'string' && id(item.actorId)
      && uint(item.throughWorldMs) && typeof item.hadWork === 'boolean'
      && (item.observationActorId === null || id(item.observationActorId)),
      'invalid-manual-finish');
    const p = item.projection;
    requireHost(shape(p, [
      'status', 'certifiedWorkMs', 'pendingWorkMs', 'pools',
      'completedAtWorldMs', 'abandonedAtWorldMs'
    ]) && ['completed', 'stopped'].includes(p.status)
      && uint(p.certifiedWorkMs) && uint(p.pendingWorkMs)
      && p.pendingWorkMs < MANUAL_HUSK_WORK.quantumMs
      && (p.completedAtWorldMs === null || uint(p.completedAtWorldMs))
      && (p.abandonedAtWorldMs === null || uint(p.abandonedAtWorldMs))
      && (p.status === 'completed'
        ? p.completedAtWorldMs !== null && p.abandonedAtWorldMs === null
        : p.completedAtWorldMs === null && p.abandonedAtWorldMs !== null),
      'invalid-manual-finish-projection');
    let spec: HuskWorkSpec;
    try {
      spec = JSON.parse(item.startPayload);
      checkSpec(spec);
    } catch {
      throw Error('manual husk host: invalid-manual-finish-source');
    }
    requireHost(canonical(spec) === item.startPayload
      && spec.commandId === item.commandId
      && item.throughWorldMs >= spec.openedAtWorldMs
      && (item.observationActorId === null || item.observationActorId === item.actorId),
      'invalid-manual-finish-source');
    const end = p.abandonedAtWorldMs ?? p.completedAtWorldMs!;
    requireHost(end >= spec.openedAtWorldMs
      && (p.status === 'stopped' ? end >= item.throughWorldMs : end <= item.throughWorldMs),
      'invalid-manual-finish-time');
    const profile = createManualHuskAssumptionProfile(spec.input, MANUAL_HUSK_ASSUMPTION.id);
    const model = createManualHuskSeparation(spec.input, profile, {
      worldId: L.world.worldId, worldEpoch: L.world.worldEpoch,
      runId: item.runId, openedAtWorldMs: spec.openedAtWorldMs
    });
    const horizon = profile.knots.at(-1)!.workMs;
    const quantum = MANUAL_HUSK_WORK.quantumMs;
    const maximum = Number((BigInt(horizon) + BigInt(quantum) - 1n)
      / BigInt(quantum) * BigInt(quantum));
    requireHost(p.certifiedWorkMs % quantum === 0 && p.certifiedWorkMs <= maximum
      && (p.status === 'completed' ? p.certifiedWorkMs >= horizon : p.certifiedWorkMs < horizon)
      && item.hadWork === (p.certifiedWorkMs > 0 || p.pendingWorkMs > 0),
      'invalid-manual-finish-work');
    let science = model.start();
    if (p.certifiedWorkMs > 0) {
      science = model.commit(science, {
        kind: 'host-confirmed-manual-work', confirmationId: 'summary-validation',
        worldId: L.world.worldId, worldEpoch: L.world.worldEpoch,
        runId: item.runId, actorId: spec.operatorId, attendance: 'present',
        operation: 'separate-wet-husk', fromWorldMs: spec.openedAtWorldMs,
        toWorldMs: add(spec.openedAtWorldMs, p.certifiedWorkMs),
        confirmedAtWorldMs: add(spec.openedAtWorldMs, p.certifiedWorkMs)
      });
    }
    requireHost(canonical(science.pools) === canonical(p.pools),
      'invalid-manual-finish-pools');
    requireHost(Array.isArray(item.observations) && item.observations.length <= 4
      && item.observations.every(o => shape(o, ['at', 'channel', 'text'])
        && uint(o.at) && ['sight', 'touch'].includes(o.channel)
        && typeof o.text === 'string'), 'invalid-manual-finish-observations');

}

/** Full validation belongs to save restoration. Hot reads inspect their selected
 * bounded entry, not every historical finished job. */
export function validateManualHuskRecords(L: Ledger): void {
  const records = recordState(L);
  const ids = new Set<string>();
  for (const item of records.finished) {
    requireHost(!ids.has(item.runId), 'duplicate-manual-finish');
    ids.add(item.runId);
    validateManualFinish(L, item);
  }
}

function finishedWork(L: Ledger, runId: string): FinishedManualWork {
  const item = recordState(L).finished.find(r => r.runId === runId);
  requireHost(item, 'unknown-or-expired-manual-run');
  validateManualFinish(L, item);
  return item;
}

function projectionOf(run: Run, d: HostData): ManualProjection {
  return {
    status: run.status,
    certifiedWorkMs: d.science.totalWorkMs,
    pendingWorkMs: d.pendingWorkMs,
    pools: clone(d.science.pools),
    completedAtWorldMs: d.completedAtWorldMs,
    abandonedAtWorldMs: d.abandonedAtWorldMs
  };
}

function archiveManualWork(L: Ledger, run: Run, d: HostData): void {
  requireHost(d.completedAtWorldMs !== null || d.abandonedAtWorldMs !== null,
    'cannot-archive-active-manual-run');
  const records = clone(recordState(L));
  const assignedAt = d.assignments.at(-1)!.atWorldMs;
  const worked = d.frames.filter(f => isWork(f, d.spec, d.assignments));
  const item: FinishedManualWork = {
    runId: run.runId,
    commandId: d.spec.commandId,
    startPayload: canonical(d.spec),
    actorId: run.operator,
    throughWorldMs: d.observedThroughWorldMs,
    hadWork: worked.length > 0,
    observationActorId: worked.some(f => f.actorId === run.operator
      && f.fromWorldMs >= assignedAt) ? run.operator : null,
    projection: projectionOf(run, d),
    observations: observations(d,
      d.abandonedAtWorldMs ?? d.completedAtWorldMs ?? d.observedThroughWorldMs)
  };
  requireHost(!records.finished.some(r => r.runId === run.runId),
    'duplicate-manual-finish');
  records.finished.push(item);
  for (const frame of d.frames.slice(-MANUAL_HUSK_RECORD_LIMIT)) {
    records.receipts.push({
      key: JSON.stringify([run.runId, frame.spanId]),
      payload: canonical(frame),
      runId: run.runId
    });
  }
  records.receipts = records.receipts.slice(-MANUAL_HUSK_RECORD_LIMIT);
  while (records.finished.length > MANUAL_HUSK_RECORD_LIMIT) {
    const removed = records.finished.shift()!;
    const spec = JSON.parse(removed.startPayload) as HuskWorkSpec;
    records.floorAtWorldMs = Math.max(records.floorAtWorldMs ?? 0, spec.openedAtWorldMs);
  }
  (L as RecordsLedger).manualHuskRecords = records;
  delete L.runs[run.runId];
}

/** Validate old terminal states before replacing their replay history with a
 * bounded world-only summary. The ID allocator and material lots are untouched. */
export function compactManualHuskRecords(L: Ledger): void {
  recordState(L);
  for (const run of Object.values(L.runs)) {
    if (run.processId !== MANUAL_HUSK_WORK.processId
      || !['completed', 'stopped'].includes(run.status)) continue;
    const checked = dataOf(L, run.runId);
    archiveManualWork(L, checked.run, checked.data);
  }
}

/** Current authority is read independently of the retained ledger run. A finished
 * entry contains only the projection and safe observations, not replay frames. */
export function readManualHuskWorkAuthority(L: Ledger, runId: string) {
  if (!L.runs[runId]) {
    const done = finishedWork(L, runId);
    return {
      projection: clone(done.projection),
      spec: JSON.parse(done.startPayload) as HuskWorkSpec,
      operatorId: done.actorId,
      observedThroughWorldMs: done.throughWorldMs,
      hadWork: done.hadWork,
      observationActorId: done.observationActorId,
      observations: clone(done.observations)
    };
  }
  const { run, data } = dataOf(L, runId);
  const worked = data.frames.filter(f => isWork(f, data.spec, data.assignments));
  const assignedAt = data.assignments.at(-1)!.atWorldMs;
  return {
    projection: projectionOf(run, data),
    spec: clone(data.spec),
    operatorId: run.operator,
    observedThroughWorldMs: data.observedThroughWorldMs,
    hadWork: worked.length > 0,
    observationActorId: worked.some(f => f.actorId === run.operator
      && f.fromWorldMs >= assignedAt) ? run.operator : null,
    observations: observations(data,
      data.abandonedAtWorldMs ?? data.completedAtWorldMs ?? data.observedThroughWorldMs)
  };
}

/** Only the WORLD calls this with a known single husk and explicit dry/water
 * facts. No conversion from the generic main coconut_husk, guessed ppm/counts. */
export function beginManualHuskWork(L: Ledger, spec: HuskWorkSpec): {runId: string} {
  checkSpec(spec);
  const records = recordState(L);
  const prior = records.finished.find(r => r.commandId === spec.commandId);
  if (prior) {
    validateManualFinish(L, prior);
    requireHost(prior.startPayload === canonical(spec), 'conflicting-start-replay');
    return { runId: prior.runId };
  }
  requireHost(records.floorAtWorldMs === null || spec.openedAtWorldMs > records.floorAtWorldMs,
    'expired-manual-command');
  for (const r of Object.values(L.runs)) if (r.processId===MANUAL_HUSK_WORK.processId && (r.state?.data as HostData)?.spec?.commandId===spec.commandId) {
    const old=dataOf(L,r.runId);
    requireHost(canonical(old.data.spec)===canonical(spec), 'conflicting-start-replay');
    return {runId:r.runId};
  }
  return transact(L, copy => {
    const lot=copy.lots[spec.input.lotId]; requireHost(lot && !lot.reservedBy, 'missing-or-reserved-husk');
    const source=withoutReservation(lot); checkSource(source,spec);
    const started=startRun(copy, {processId:MANUAL_HUSK_WORK.processId,processVersion:MANUAL_HUSK_WORK.processVersion,catalogVersion:MANUAL_HUSK_WORK.catalogVersion,contract:MANUAL_HUSK_WORK.contract,clock:'world',lotIds:[lot.lotId],equipmentIds:[],operator:spec.operatorId},spec.openedAtWorldMs);
    requireHost(started.run,started.why??'start-refused');
    const run=started.run, d=rebuild(copy.world.worldId,copy.world.worldEpoch,run.runId,spec,source,[]);
    // This exact-time manual-work process has no physical integration grid.
    // Only this run overrides startRun's next-mark convention; never count time
    // before openedAt or discard real work while waiting for that mark.
    run.lastTo=spec.openedAtWorldMs; run.state={schema:MANUAL_HUSK_WORK.schema,data:d};
    return {runId:run.runId};
  });
}
/** Full world-only accounting, not an AI/resident input. */
export function projectManualHuskWork(L: Ledger, runId: string) {
  if (!L.runs[runId]) return clone(finishedWork(L, runId).projection);
  const {run, data} = dataOf(L, runId);
  return projectionOf(run, data);
}
export function observeManualHuskWork(L: Ledger, runId: string): Observation[] {
  return readManualHuskWorkAuthority(L, runId).observations;
}
function settlement(d: HostData): ScienceStepResult['produced'] {
  const p=d.science.pools, history=d.source.quality!.history_complete, produced: ScienceStepResult['produced']=[];
  const fiberMg=add(add(p.fiber.dryMg,p.attachedPith.dryMg),add(p.fiber.waterMg,p.attachedPith.waterMg));
  if (fiberMg) produced.push({materialId:'coir_fiber_bundle',amount:{value:fiberMg,unit:'mg'},into:d.source.location,
    quality:{fiber_dry_mg:p.fiber.dryMg,attached_pith_dry_mg:p.attachedPith.dryMg,
      fiber_water_mg:p.fiber.waterMg,attached_pith_water_mg:p.attachedPith.waterMg,
      water_mg:add(p.fiber.waterMg,p.attachedPith.waterMg),history_complete:history}});
  const residual=add(p.residualHusk.dryMg,p.residualHusk.waterMg);
  if (residual) produced.push({materialId:'partially_separated_coconut_husk',amount:{value:residual,unit:'mg'},into:d.source.location,
    quality:{dry_mg:p.residualHusk.dryMg,water_mg:p.residualHusk.waterMg,husk_count:1,unseparated:0,history_complete:history}});
  if (p.dischargedWaterMg) produced.push({materialId:'husk_drainage_water',amount:{value:p.dischargedWaterMg,unit:'mg'},into:d.source.location,
    quality:{water_mg:p.dischargedWaterMg,unclassified_drainage:1,history_complete:history}});
  return produced;
}
/** No timers: a gap stays a gap. Saves retain pending sub-30-second work, while
 * restoring the ledger cannot generate new attendance or settle inventory. */
export function recordManualHuskSpan(L: Ledger, runId: string, span: HuskExecutorSpan, nowWorldMs: number): {status: Run['status']; observations: Observation[]} {
  if (!L.runs[runId]) {
    const done = finishedWork(L, runId);
    const prior = recordState(L).receipts.find(r =>
      r.key === JSON.stringify([runId, span?.spanId]));
    requireHost(prior && prior.payload === canonical(span),
      'unknown-or-conflicting-finished-span');
    requireHost(uint(nowWorldMs) && uint(span?.confirmedAtWorldMs)
      && span.confirmedAtWorldMs <= nowWorldMs, 'future-or-unconfirmed-span');
    return { status: done.projection.status, observations: clone(done.observations) };
  }
  const old=dataOf(L,runId); checkFrame(span,old.data);
  requireHost(uint(nowWorldMs) && span.confirmedAtWorldMs<=nowWorldMs && span.toWorldMs<=nowWorldMs, 'future-or-unconfirmed-span');
  const previous=old.data.frames.find(f=>f.spanId===span.spanId);
  if (previous) {
    requireHost(canonical(previous)===canonical(span), 'conflicting-span-replay');
    return {status:old.run.status,observations:observeManualHuskWork(L,runId)};
  }
  requireHost(old.data.completedAtWorldMs===null&&old.data.abandonedAtWorldMs===null, 'run-already-settled');
  return transact(L, copy => {
    const {run:r,data:d}=dataOf(copy,runId);
    const next=rebuild(d.worldId,d.worldEpoch,runId,d.spec,d.source,[...d.frames,clone(span)],d.assignments);
    const to=next.completedAtWorldMs??span.toWorldMs;
    const req: ScienceStepRequest={
      contract:r.contract,requestId:runId+':span:'+JSON.stringify(span.spanId),world:{...copy.world},
      runId,processId:r.processId,processVersion:r.processVersion,catalogVersion:r.catalogVersion,
      interval:{from:r.lastTo,to:span.toWorldMs},state:clone(r.state),
      environment:{sampleId:'env:manual-husk-unused',source:'unknown',effectiveAt:r.lastTo},
      lots:[withoutReservation(copy.lots[d.source.lotId])],equipment:[],energy:[],actions:[],seed:r.seed,
    };
    const nextObs=observations(next,to), prior=observations(d,d.observedThroughWorldMs);
    const changed=canonical(nextObs.map(o=>[o.channel,o.text]))!==canonical(prior.map(o=>[o.channel,o.text]));
    const result: ScienceStepResult={
      contract:r.contract,requestId:req.requestId,runId,simulated:{from:r.lastTo,to},
      state:{schema:MANUAL_HUSK_WORK.schema,data:next},status:next.completedAtWorldMs===null?'running':'completed',
      consumed:next.completedAtWorldMs===null?[]:[{lotId:d.source.lotId,amount:clone(d.source.amount)}],
      produced:next.completedAtWorldMs===null?[]:settlement(next),released:[],drawn:[],energy:[],equipmentWear:[],
      observations:changed?nextObs:[],
      evidence:{evaluatorVersion:MANUAL_HUSK_WORK.processVersion,sourceRefs:[],notes:'owner-assumption-not-calibrated; explicit '+d.spec.assumptionId},
    };
    const applied=commit(copy,req,result); requireHost(applied.ok,applied.why??'settlement-refused');
    const status = r.status;
    if (next.completedAtWorldMs !== null) archiveManualWork(copy, r, next);
    return {status, observations: nextObs};
  });
}

/** Arrangement-only reassignment; original source/spec and work fragments remain. */
export function reassignManualHuskWork(L:Ledger,runId:string,actorId:string,atWorldMs:number):void{
  transact(L,copy=>{
    const {run:r,data:d}=dataOf(copy,runId);
    requireHost(d.completedAtWorldMs===null&&d.abandonedAtWorldMs===null,'run-already-settled');
    requireHost(id(actorId)&&actorId!==r.operator&&uint(atWorldMs)
      &&atWorldMs>=Math.max(d.observedThroughWorldMs,d.assignments.at(-1)!.atWorldMs),'invalid-reassignment');
    const next=rebuild(d.worldId,d.worldEpoch,runId,d.spec,d.source,d.frames,[...d.assignments,{actorId,atWorldMs}]);
    r.operator=actorId;r.state={schema:MANUAL_HUSK_WORK.schema,data:next};copy.world.worldVersion++;
  });
}
/** Settle complete quanta only; untouched husks keep their original identity. */
export function abandonManualHuskWork(L:Ledger,runId:string,atWorldMs:number):void{
  if (!L.runs[runId]) {
    const done = finishedWork(L, runId);
    requireHost(done.projection.abandonedAtWorldMs === atWorldMs,
      'conflicting-abandon-replay');
    return;
  }
  const old=dataOf(L,runId);
  if(old.data.abandonedAtWorldMs!==null){
    requireHost(old.data.abandonedAtWorldMs===atWorldMs,'conflicting-abandon-replay');return;
  }
  requireHost(old.data.completedAtWorldMs===null,'run-already-settled');
  transact(L,copy=>{
    const {run:r,data:d}=dataOf(copy,runId),next=rebuild(d.worldId,d.worldEpoch,runId,d.spec,d.source,d.frames,d.assignments,atWorldMs);
    const req:ScienceStepRequest={
      contract:r.contract,requestId:runId+':abandon',world:{...copy.world},runId,
      processId:r.processId,processVersion:r.processVersion,catalogVersion:r.catalogVersion,
      interval:{from:r.lastTo,to:atWorldMs},state:clone(r.state),
      environment:{sampleId:'env:manual-husk-unused',source:'unknown',effectiveAt:r.lastTo},
      lots:[withoutReservation(copy.lots[d.source.lotId])],equipment:[],energy:[],actions:[],seed:r.seed,
    };
    // Pending sub-quantum work has not changed the material. End the run and
    // release its reservation without consuming or re-identifying the source.
    const untouched=next.science.totalWorkMs===0;
    const res:ScienceStepResult={
      contract:r.contract,requestId:req.requestId,runId,simulated:{from:r.lastTo,to:atWorldMs},
      state:{schema:MANUAL_HUSK_WORK.schema,data:next},status:'stopped',
      consumed:untouched?[]:[{lotId:d.source.lotId,amount:clone(d.source.amount)}],produced:untouched?[]:settlement(next),
      released:[],drawn:[],energy:[],equipmentWear:[],observations:[{at:atWorldMs,channel:'sight',text:untouched?'殻を手つかずのまま脇に置いた。':'途中までほぐした殻を脇に置いた。'}],
      evidence:{evaluatorVersion:MANUAL_HUSK_WORK.processVersion,sourceRefs:[],notes:'owner-assumption-not-calibrated; partial settlement'},
    };
    const applied=commit(copy,req,res);requireHost(applied.ok,applied.why??'settlement-refused');
    archiveManualWork(copy, r, next);
  });
}
