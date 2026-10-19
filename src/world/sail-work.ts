// World-owned arrangement for making sail parts. This opt-in boundary certifies
// physical work; it neither chooses resident actions nor stores a history of spans.
import type {LotView, ScienceStepRequest, ScienceStepResult} from './science-contract';
import {commit, startRun, toClock, type Ledger} from './process-runner';
import type {HuskExecutorSpan, HuskWorksite} from './manual-husk-work';
import {otherScienceWorkBusy} from './science-work-occupancy';
import {
  createCompactSailManufacturingModel,
  type SailManufactureInput,
} from '../science/prototypes/sail-raft-manufacturing';
import {
  canonical, copy, id, shape, uint, sum, type PlantMass,
} from '../science/prototypes/sail-raft-rules';
import {
  readPlantMass, readSailHistory, writePlantMass, writeSailMat, writeBambooMast,
} from './sail-lots';

export const SAIL_WORK = {
  processId: 'prototype_sail_work',
  version: 'host-1',
  schema: 'civ-world.sail-work/1',
  arrangement: 'civ-world.sail-arrangement/1',
  quantumMs: 30_000,
  receiptLimit: 64,
} as const;
export type Operation = 'harvest' | 'dry' | 'split' | 'weave' | 'mast';
export type Activity = 'harvest-leaves' | 'split-leaves' | 'weave-mat' |
  'cut-mast' | 'rest' | 'travel' | 'idle' | 'unknown';
type Presence = 'here' | 'away' | 'unknown';
export type SailManualSpan = Omit<HuskExecutorSpan, 'activity'> & {activity: Activity};
export interface SailRoofedSpan {
  kind: 'confirmed-roofed-wait';
  spanId: string;
  worldId: string;
  worldEpoch: string;
  runId: string;
  fromWorldMs: number;
  toWorldMs: number;
  confirmedAtWorldMs: number;
  siteId: string;
  roofed: boolean;
}
export type SailSpan = SailManualSpan | SailRoofedSpan;
export type SailIntent =
  | {intentId: string; kind: 'start'; actorId: string; atWorldMs: number;
      operation: Operation; lotIds: string[]; siteId: string; presence: Presence}
  | {intentId: string; kind: 'stop' | 'abandon'; actorId: string;
      atWorldMs: number; runId: string}
  | {intentId: string; kind: 'resume' | 'takeover'; actorId: string;
      atWorldMs: number; runId: string; presence: Presence};
export interface SailStartFacts {
  assumptionId: string;
  worksite: HuskWorksite;
  requestedAreaCm2?: 20_000;
  roofed?: true;
}
interface Spec {
  commandId: string;
  actorId: string;
  operation: Operation;
  lotIds: string[];
  openedAtWorldMs: number;
  facts: SailStartFacts;
}
interface Assignment {actorId: string; atWorldMs: number}
interface Data {
  worldId: string;
  worldEpoch: string;
  runId: string;
  seed: number;
  spec: Spec;
  source: LotView;
  actorId: string;
  engaged: boolean;
  controlAtWorldMs: number;
  totalWorkMs: number;
  pendingMs: number;
  observedThroughWorldMs: number;
  lastConfirmedAtWorldMs: number;
  lastWasWork: boolean;
  seenByActor: boolean;
  assignments: Assignment[];
  digest: number;
}
interface Receipt {
  key: string;
  payload: string;
  runId: string;
  atWorldMs: number;
}
interface Finished {
  runId: string;
  actorId: string;
  siteId: string;
  operation: Operation;
  status: 'completed' | 'abandoned';
  atWorldMs: number;
  certifiedMs: number;
  lotIds: string[];
  observations: {channel: 'sight'; text: string}[];
}
interface Arrangement {
  schema: typeof SAIL_WORK.arrangement;
  worldId: string;
  worldEpoch: string;
  revision: number;
  authorityAtWorldMs: number;
  floorAtWorldMs: number | null;
  receipts: Receipt[];
  finished: Finished[];
}
export type SailWorkLedger = Ledger & {sailArrangement?: Arrangement};

export class SailWorkError extends Error {
  constructor(public readonly code: string) {
    super('科学の作業を適用できない。');
    this.name = 'SailWorkError';
  }
}
function demand(ok: unknown, code: string): asserts ok {
  if (!ok) throw new SailWorkError(code);
}
const clock = (s: Spec) => s.operation === 'dry' ? 'island' as const : 'world' as const;
const activities: Record<Exclude<Operation, 'dry'>, Activity> = {
  harvest: 'harvest-leaves', split: 'split-leaves',
  weave: 'weave-mat', mast: 'cut-mast',
};
const key = (...parts: string[]) => JSON.stringify(parts);
const publicWords = new Set([
  '材料を手つかずのまま脇に置いた。', '作業中の材料を脇に置いた。',
  '葉を取り終えた。', '葉は乾いて、しなやかになった。',
  '葉を細く裂いた。とげと葉脈の屑が残っている。',
  '葉を細く裂いた。目立った屑は残らなかった。',
  '編んだむしろが広がっている。', '竹のマストを切り出した。',
]);
function digest(value: unknown): number {
  let h = 2166136261;
  for (const c of canonical(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function seal(d: Data): Data {
  const {digest: _, ...body} = d;
  d.digest = digest(body);
  return d;
}
function safe<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof SailWorkError) throw error;
    const message = error instanceof Error ? error.message : '';
    const known = [
      'dry-leaves-required', 'dry-strips-required', 'insufficient-weave-material',
      'long-bamboo-required', 'insufficient-mast-dry-mass',
    ];
    const code = known.find(c => message.endsWith(': ' + c));
    throw new SailWorkError(code ?? 'invalid-world-or-material-state');
  }
}
function inputOf(d: Pick<Data, 'spec' | 'source'>): SailManufactureInput {
  const source = readPlantMass(d.source);
  switch (d.spec.operation) {
    case 'dry': return {operation: 'dry', source, roofed: true};
    case 'weave': return {operation: 'weave', source, requestedAreaCm2: 20_000};
    default: return {operation: d.spec.operation, source};
  }
}
function model(d: Pick<Data, 'spec' | 'source' | 'worldId' | 'worldEpoch' | 'runId' | 'seed'>) {
  return createCompactSailManufacturingModel(inputOf(d), d.spec.facts.assumptionId, {
    worldId: d.worldId, worldEpoch: d.worldEpoch, runId: d.runId, seed: d.seed,
    clock: clock(d.spec), openedAtMs: toClock(clock(d.spec), d.spec.openedAtWorldMs),
  });
}
function specOk(s: Spec, source: LotView): void {
  demand(shape(s, ['commandId', 'actorId', 'operation', 'lotIds', 'openedAtWorldMs', 'facts']) &&
    id(s.commandId) && id(s.actorId) && uint(s.openedAtWorldMs) &&
    ['harvest', 'dry', 'split', 'weave', 'mast'].includes(s.operation) &&
    Array.isArray(s.lotIds) && s.lotIds.length === 1 && id(s.lotIds[0]),
  'invalid-spec');
  const facts = s.facts;
  demand(shape(facts, ['assumptionId', 'worksite',
    ...(s.operation === 'dry' ? ['roofed'] : s.operation === 'weave' ? ['requestedAreaCm2'] : [])]) &&
    id(facts.assumptionId), 'explicit-operation-facts-required');
  demand(shape(facts.worksite, ['locationId', 'x', 'z', 'reachM']) &&
    id(facts.worksite.locationId) && Number.isFinite(facts.worksite.x) &&
    Number.isFinite(facts.worksite.z) && Number.isFinite(facts.worksite.reachM) &&
    facts.worksite.reachM > 0, 'invalid-worksite');
  if (s.operation === 'dry') demand(facts.roofed === true, 'roof-required');
  if (s.operation === 'weave') demand(facts.requestedAreaCm2 === 20_000, 'fixed-sail-area-required');
  demand(source.lotId === s.lotIds[0] &&
    source.location === facts.worksite.locationId, 'wrong-source-place');
  readPlantMass(source);
  readSailHistory(source);
}
function raw(L: SailWorkLedger, runId: string): Data {
  const r = L.runs[runId], d = r?.state?.data as Data;
  demand(r && r.runId === runId && r.processId === SAIL_WORK.processId &&
    r.processVersion === SAIL_WORK.version && r.contract === '0.2.1' &&
    r.catalogVersion === 'civ-sci-test-2' && r.state?.schema === SAIL_WORK.schema &&
    ['starting', 'running'].includes(r.status), 'unsupported-run-or-state');
  demand(shape(d, ['worldId', 'worldEpoch', 'runId', 'seed', 'spec', 'source',
    'actorId', 'engaged', 'controlAtWorldMs', 'totalWorkMs', 'pendingMs',
    'observedThroughWorldMs', 'lastConfirmedAtWorldMs', 'lastWasWork',
    'seenByActor', 'assignments', 'digest']) &&
    d.worldId === L.world.worldId && d.worldEpoch === L.world.worldEpoch &&
    d.runId === runId && uint(d.seed) && d.seed <= 0xffffffff &&
    id(d.actorId) && typeof d.engaged === 'boolean' &&
    typeof d.lastWasWork === 'boolean' && typeof d.seenByActor === 'boolean' &&
    [d.controlAtWorldMs, d.totalWorkMs, d.pendingMs, d.observedThroughWorldMs,
      d.lastConfirmedAtWorldMs].every(n => uint(n)) &&
    d.pendingMs < SAIL_WORK.quantumMs && d.totalWorkMs % SAIL_WORK.quantumMs === 0 &&
    d.observedThroughWorldMs >= d.spec.openedAtWorldMs &&
    d.controlAtWorldMs >= d.spec.openedAtWorldMs &&
    d.lastConfirmedAtWorldMs >= d.observedThroughWorldMs &&
    Array.isArray(d.assignments) && d.assignments.length > 0 &&
    d.assignments.length <= SAIL_WORK.receiptLimit &&
    d.assignments.every(a => shape(a, ['actorId', 'atWorldMs']) &&
      id(a.actorId) && uint(a.atWorldMs)) &&
    d.assignments.at(-1)!.actorId === d.actorId, 'corrupt-work-state');
  const {digest: checksum, ...body} = d;
  demand(checksum === digest(body), 'corrupt-work-checksum');
  specOk(d.spec, d.source);
  demand(r.operator === d.actorId && r.seed === d.seed && r.clock === clock(d.spec) &&
    canonical(r.lotIds) === canonical(d.spec.lotIds) && r.equipmentIds.length === 0 &&
    r.lastTo === toClock(clock(d.spec), d.observedThroughWorldMs), 'changed-run-binding');
  const current = L.lots[d.source.lotId];
  demand(current?.reservedBy === runId, 'lost-reservation');
  const {reservedBy: _, ...lot} = current;
  demand(canonical(lot) === canonical(d.source), 'changed-reserved-material');
  const p = model(d).projectTotal(d.totalWorkMs);
  demand(p.status !== 'completed', 'completed-run-retained');
  return d;
}
function metadata(L: SailWorkLedger): Arrangement {
  const m = L.sailArrangement;
  if (!m) {
    demand(!Object.values(L.runs).some(r => r.processId === SAIL_WORK.processId),
      'missing-arrangement');
    return {schema: SAIL_WORK.arrangement, worldId: L.world.worldId,
      worldEpoch: L.world.worldEpoch, revision: 0, authorityAtWorldMs: 0,
      floorAtWorldMs: null, receipts: [], finished: []};
  }
  demand(shape(m, ['schema', 'worldId', 'worldEpoch', 'revision',
    'authorityAtWorldMs', 'floorAtWorldMs', 'receipts', 'finished']) &&
    m.schema === SAIL_WORK.arrangement && m.worldId === L.world.worldId &&
    m.worldEpoch === L.world.worldEpoch && uint(m.revision) &&
    uint(m.authorityAtWorldMs) && (m.floorAtWorldMs === null || uint(m.floorAtWorldMs)) &&
    Array.isArray(m.receipts) && m.receipts.length <= SAIL_WORK.receiptLimit &&
    Array.isArray(m.finished) && m.finished.length <= SAIL_WORK.receiptLimit,
  'invalid-arrangement');
  const seen = new Set<string>();
  for (const r of m.receipts) {
    demand(shape(r, ['key', 'payload', 'runId', 'atWorldMs']) &&
      id(r.key) && typeof r.payload === 'string' && id(r.runId) &&
      uint(r.atWorldMs) && !seen.has(r.key), 'invalid-receipt');
    seen.add(r.key);
  }
  for (const f of m.finished) {
    demand(shape(f, ['runId', 'actorId', 'siteId', 'operation', 'status',
      'atWorldMs', 'certifiedMs', 'lotIds', 'observations']) &&
      id(f.runId) && id(f.actorId) && id(f.siteId) &&
      ['harvest', 'dry', 'split', 'weave', 'mast'].includes(f.operation) &&
      ['completed', 'abandoned'].includes(f.status) && uint(f.atWorldMs) &&
      uint(f.certifiedMs) && Array.isArray(f.lotIds) && f.lotIds.every(id) &&
      Array.isArray(f.observations) && f.observations.every(o =>
        shape(o, ['channel', 'text']) && o.channel === 'sight' && publicWords.has(o.text)),
    'invalid-finished-summary');
  }
  return m;
}
function jobs(L: SailWorkLedger): Data[] {
  return Object.values(L.runs).filter(r => r.processId === SAIL_WORK.processId)
    .map(r => raw(L, r.runId));
}
function replay(m: Arrangement, k: string, payload: string, at: number): string | null {
  const old = m.receipts.find(r => r.key === k);
  if (old) {
    demand(old.payload === payload, 'conflicting-replay');
    return old.runId;
  }
  demand(m.floorAtWorldMs === null || at > m.floorAtWorldMs, 'expired-command');
  return null;
}
function remember(m: Arrangement, receipt: Receipt): void {
  m.receipts.push(receipt);
  if (m.receipts.length > SAIL_WORK.receiptLimit) {
    const old = m.receipts.shift()!;
    m.floorAtWorldMs = Math.max(m.floorAtWorldMs ?? 0, old.atWorldMs);
  }
}
function transaction<T>(L: SailWorkLedger, fn: (draft: SailWorkLedger, m: Arrangement) => T): T {
  return safe(() => {
    metadata(L);
    jobs(L);
    const draft = copy(L), m = copy(metadata(draft));
    const result = fn(draft, m);
    demand(m.revision < Number.MAX_SAFE_INTEGER, 'revision-overflow');
    m.revision++;
    draft.sailArrangement = m;
    metadata(draft);
    jobs(draft);
    Object.assign(L, draft);
    return result;
  });
}
function version(m: Arrangement, revision: number): void {
  demand(uint(revision) && m.revision === revision, 'stale-arrangement');
}
function parts(d: Data, abandoned: boolean): ScienceStepResult['produced'] {
  const manufacture = model(d);
  const p = abandoned ? manufacture.projectTotalForAbandon(d.totalWorkMs)
    : manufacture.projectTotal(d.totalWorkMs);
  const history = readSailHistory(d.source);
  const location = d.spec.facts.worksite.locationId;
  const out: ScienceStepResult['produced'] = [];
  const plant = (x: PlantMass | null) => {
    if (x && x.dryMg + x.waterMg > 0) out.push(writePlantMass(x, location, history));
  };
  if (p.material) {
    if (p.material.material === 'sail_mat') out.push(writeSailMat(p.material, location, history));
    else if (p.material.material === 'bamboo_mast') out.push(writeBambooMast(p.material, location, history));
    else plant(p.material);
  }
  plant(p.remaining);
  plant(p.scrap);
  return out;
}
function finish(L: SailWorkLedger, m: Arrangement, d: Data, at: number, abandoned: boolean): void {
  const untouched = abandoned && d.totalWorkMs === 0;
  const r = L.runs[d.runId], p = model(d).projectTotal(d.totalWorkMs);
  const observations = abandoned
    ? [{channel: 'sight' as const, text: untouched
      ? '材料を手つかずのまま脇に置いた。' : '作業中の材料を脇に置いた。'}]
    : model(d).observeTotal(d.totalWorkMs).map(text => ({channel: 'sight' as const, text}));
  const req: ScienceStepRequest = {
    contract: r.contract, requestId: key(d.runId, abandoned ? 'abandon' : 'complete'),
    world: {...L.world}, runId: d.runId, processId: SAIL_WORK.processId,
    processVersion: SAIL_WORK.version, catalogVersion: r.catalogVersion,
    interval: {from: r.lastTo, to: Math.max(r.lastTo, toClock(clock(d.spec), at))},
    state: r.state, environment: {sampleId: 'env:sail-work-unused',
      source: 'unknown', effectiveAt: r.lastTo},
    lots: [copy(d.source)], equipment: [], energy: [], actions: [], seed: d.seed,
  };
  const result: ScienceStepResult = {
    contract: req.contract, requestId: req.requestId, runId: d.runId,
    simulated: {...req.interval}, state: {schema: SAIL_WORK.schema, data: d},
    status: abandoned ? 'stopped' : 'completed',
    consumed: untouched ? [] : [{lotId: d.source.lotId, amount: copy(d.source.amount)}],
    produced: untouched ? [] : parts(d, abandoned),
    released: !untouched && p.releasedWaterMg > 0 ? [{materialId: 'water_vapor',
      amount: {value: p.releasedWaterMg, unit: 'mg'}, to: 'air'}] : [],
    drawn: [], energy: [], equipmentWear: [], observations: [],
    evidence: {evaluatorVersion: SAIL_WORK.version, sourceRefs: [],
      notes: 'owner-assumption-not-calibrated; explicit ' + d.spec.facts.assumptionId},
  };
  const applied = commit(L, req, result);
  demand(applied.ok, 'ledger-settlement-refused');
  const lotIds = applied.produced?.map(l => l.lotId) ?? [];
  delete L.runs[d.runId];
  m.finished.push({runId: d.runId, actorId: d.actorId,
    siteId: d.spec.facts.worksite.locationId, operation: d.spec.operation,
    status: abandoned ? 'abandoned' : 'completed', atWorldMs: at,
    certifiedMs: d.totalWorkMs, lotIds, observations});
  if (m.finished.length > SAIL_WORK.receiptLimit) m.finished.shift();
}
function updateRun(L: SailWorkLedger, d: Data): void {
  const r = L.runs[d.runId];
  r.operator = d.actorId;
  r.lastTo = toClock(clock(d.spec), d.observedThroughWorldMs);
  r.status = 'running';
  r.state = {schema: SAIL_WORK.schema, data: seal(d)};
}
export function sailWorkRevision(L: SailWorkLedger): number {
  return safe(() => metadata(L).revision);
}
export function applySailIntent(
  L: SailWorkLedger, i: SailIntent, expectedRevision: number,
  nowWorldMs: number, facts?: SailStartFacts,
): {runId: string} {
  return safe(() => {
    const keys = i?.kind === 'start'
      ? ['intentId', 'kind', 'actorId', 'atWorldMs', 'operation', 'lotIds', 'siteId', 'presence']
      : i?.kind === 'resume' || i?.kind === 'takeover'
        ? ['intentId', 'kind', 'actorId', 'atWorldMs', 'runId', 'presence']
        : ['intentId', 'kind', 'actorId', 'atWorldMs', 'runId'];
    demand(shape(i, keys) && id(i.intentId) && id(i.actorId) &&
      ['start', 'stop', 'resume', 'takeover', 'abandon'].includes(i.kind) &&
      uint(i.atWorldMs) && uint(nowWorldMs) && i.atWorldMs <= nowWorldMs, 'invalid-intent');
    const receiptKey = key('intent', i.intentId), payload = canonical([i, facts ?? null]);
    const old = replay(metadata(L), receiptKey, payload, i.atWorldMs);
    if (old) return {runId: old};
    return transaction(L, (draft, m) => {
      version(m, expectedRevision);
      demand(i.atWorldMs >= m.authorityAtWorldMs, 'backdated-intent');
      m.authorityAtWorldMs = i.atWorldMs;
      let d: Data;
      if (i.kind === 'start') {
        demand(i.presence === 'here', 'presence-required');
        demand(facts && id(i.siteId) && facts.worksite?.locationId === i.siteId,
          'start-facts-required');
        const busy = otherScienceWorkBusy(draft, i.actorId, i.siteId, SAIL_WORK.processId);
        const current = jobs(draft);
        demand(!busy.site && !current.some(j => j.spec.facts.worksite.locationId === i.siteId),
          'worksite-reserved');
        if (i.operation !== 'dry') demand(!busy.actor && !current.some(j =>
          j.engaged && j.spec.operation !== 'dry' && j.actorId === i.actorId), 'actor-busy');
        demand(Array.isArray(i.lotIds) && i.lotIds.length === 1 && id(i.lotIds[0]),
          'one-source-required');
        const lot = draft.lots[i.lotIds[0]];
        demand(lot && !lot.reservedBy, 'missing-or-reserved-material');
        const {reservedBy: _, ...source} = lot;
        const spec: Spec = {commandId: i.intentId, actorId: i.actorId,
          operation: i.operation, lotIds: copy(i.lotIds),
          openedAtWorldMs: i.atWorldMs, facts: copy(facts)};
        specOk(spec, source);
        const started = startRun(draft, {processId: SAIL_WORK.processId,
          processVersion: SAIL_WORK.version, catalogVersion: 'civ-sci-test-2',
          contract: '0.2.1', clock: clock(spec), lotIds: spec.lotIds,
          equipmentIds: [], operator: i.actorId}, i.atWorldMs);
        demand(started.run, 'reservation-refused');
        const r = started.run;
        d = {worldId: draft.world.worldId, worldEpoch: draft.world.worldEpoch,
          runId: r.runId, seed: r.seed, spec, source: copy(source), actorId: i.actorId,
          engaged: true, controlAtWorldMs: i.atWorldMs, totalWorkMs: 0,
          pendingMs: 0, observedThroughWorldMs: i.atWorldMs,
          lastConfirmedAtWorldMs: i.atWorldMs, lastWasWork: false,
          seenByActor: false, assignments: [{actorId: i.actorId, atWorldMs: i.atWorldMs}],
          digest: 0};
        model(d).projectTotal(0);
        r.lastTo = toClock(clock(spec), i.atWorldMs);
        r.state = {schema: SAIL_WORK.schema, data: seal(d)};
        if (model(d).projectTotal(0).status === 'completed') finish(draft, m, d, i.atWorldMs, false);
      } else {
        demand(facts === undefined && id(i.runId), 'invalid-control');
        d = raw(draft, i.runId);
        demand(i.atWorldMs >= Math.max(d.controlAtWorldMs, d.observedThroughWorldMs),
          'intent-precedes-work');
        demand(i.kind === 'takeover' ? d.spec.operation !== 'dry' &&
          i.actorId !== d.actorId : i.actorId === d.actorId, 'not-this-actors-job');
        if (i.kind === 'resume' || i.kind === 'takeover') {
          demand(i.presence === 'here', 'presence-required');
          demand(!d.engaged, 'already-engaged');
          const busy = otherScienceWorkBusy(draft, i.actorId, '', SAIL_WORK.processId);
          if (d.spec.operation !== 'dry') demand(!busy.actor && !jobs(draft).some(j =>
            j.runId !== d.runId && j.engaged && j.spec.operation !== 'dry' &&
            j.actorId === i.actorId), 'actor-busy');
          d.engaged = true;
          if (i.kind === 'takeover') {
            d.actorId = i.actorId;
            d.assignments.push({actorId: i.actorId, atWorldMs: i.atWorldMs});
            if (d.assignments.length > SAIL_WORK.receiptLimit) d.assignments.shift();
            d.seenByActor = false;
          }
        } else if (i.kind === 'stop') {
          demand(d.engaged, 'already-paused');
          d.engaged = false;
        } else {
          demand(!d.engaged, 'stop-before-abandon');
          finish(draft, m, d, i.atWorldMs, true);
        }
        if (i.kind !== 'abandon') {
          d.controlAtWorldMs = i.atWorldMs;
          d.lastWasWork = false;
          updateRun(draft, d);
        }
      }
      remember(m, {key: receiptKey, payload, runId: d.runId, atWorldMs: i.atWorldMs});
      return {runId: d.runId};
    });
  });
}
function checkSpan(f: SailSpan, d: Data, now: number): void {
  const base = ['kind', 'spanId', 'worldId', 'worldEpoch', 'runId',
    'fromWorldMs', 'toWorldMs', 'confirmedAtWorldMs'];
  demand(shape(f, [...base, ...(f?.kind === 'confirmed-roofed-wait'
    ? ['siteId', 'roofed'] : ['actorId', 'activity', 'targetLotId', 'targetSiteId',
      'arrived', 'fromPosition', 'toPosition'])]) &&
    id(f.spanId) && f.worldId === d.worldId && f.worldEpoch === d.worldEpoch &&
    f.runId === d.runId && uint(f.fromWorldMs) && uint(f.toWorldMs) &&
    uint(f.confirmedAtWorldMs) && f.fromWorldMs >= d.observedThroughWorldMs &&
    f.fromWorldMs >= d.controlAtWorldMs && f.toWorldMs > f.fromWorldMs &&
    f.confirmedAtWorldMs >= f.toWorldMs && f.confirmedAtWorldMs <= now, 'invalid-executor-span');
  if (f.kind === 'confirmed-roofed-wait') {
    demand(d.spec.operation === 'dry' && id(f.siteId) && typeof f.roofed === 'boolean',
      'invalid-roofed-fact');
  } else {
    demand(d.spec.operation !== 'dry' && f.kind === 'executor-activity-span' &&
      id(f.actorId) && ['harvest-leaves', 'split-leaves', 'weave-mat', 'cut-mast',
        'rest', 'travel', 'idle', 'unknown'].includes(f.activity) &&
      typeof f.arrived === 'boolean' && (f.targetLotId === null || id(f.targetLotId)) &&
      (f.targetSiteId === null || id(f.targetSiteId)), 'invalid-manual-fact');
    for (const p of [f.fromPosition, f.toPosition]) demand(shape(p, ['x', 'z']) &&
      Number.isFinite(p.x) && Number.isFinite(p.z), 'invalid-position');
  }
}
function eligible(f: SailSpan, d: Data): boolean {
  if (f.kind === 'confirmed-roofed-wait') return d.engaged && f.roofed &&
    f.siteId === d.spec.facts.worksite.locationId;
  const s = d.spec.facts.worksite;
  const near = (p: {x: number; z: number}) =>
    (p.x - s.x) * (p.x - s.x) + (p.z - s.z) * (p.z - s.z) <= s.reachM * s.reachM;
  return d.engaged && f.actorId === d.actorId && d.spec.operation !== 'dry' &&
    f.activity === activities[d.spec.operation] && f.arrived &&
    f.targetLotId === d.source.lotId && f.targetSiteId === s.locationId &&
    near(f.fromPosition) && near(f.toPosition);
}
export function recordSailSpan(
  L: SailWorkLedger, runId: string, f: SailSpan,
  expectedRevision: number, nowWorldMs: number,
): void {
  safe(() => {
    demand(id(runId) && uint(nowWorldMs) && f && id(f.spanId) &&
      uint(f.confirmedAtWorldMs), 'invalid-span');
    const receiptKey = key('span', runId, f.spanId), payload = canonical(f);
    if (replay(metadata(L), receiptKey, payload, f.confirmedAtWorldMs)) return;
    transaction(L, (draft, m) => {
      version(m, expectedRevision);
      const d = raw(draft, runId);
      checkSpan(f, d, nowWorldMs);
      const work = eligible(f, d);
      if (f.kind === 'executor-activity-span' && f.actorId === d.actorId &&
        f.activity === activities[d.spec.operation as Exclude<Operation, 'dry'>] &&
        f.arrived && !d.engaged) demand(false, 'work-outside-engaged-interval');
      if (work) {
        const elapsed = toClock(clock(d.spec), f.toWorldMs) -
          toClock(clock(d.spec), f.fromWorldMs);
        demand(uint(elapsed), 'clock-out-of-range');
        const available = sum(d.pendingMs, elapsed);
        const required = model(d).projectTotal(d.totalWorkMs).requiredMs;
        const cap = Number((BigInt(required) + 29_999n) / 30_000n * 30_000n);
        demand(uint(cap), 'duration-overflow');
        const earned = Math.min(Math.floor(available / SAIL_WORK.quantumMs) *
          SAIL_WORK.quantumMs, cap - d.totalWorkMs);
        d.totalWorkMs = sum(d.totalWorkMs, earned);
        d.pendingMs = d.totalWorkMs >= cap ? 0 : available - earned;
        d.seenByActor = d.spec.operation !== 'dry' || d.seenByActor;
      }
      d.observedThroughWorldMs = f.toWorldMs;
      d.lastConfirmedAtWorldMs = f.confirmedAtWorldMs;
      d.lastWasWork = work;
      // Commit uses the actual prior cursor, while the state gets the new one.
      if (model(d).projectTotal(d.totalWorkMs).status === 'completed') {
        finish(draft, m, d, f.toWorldMs, false);
      } else updateRun(draft, d);
      m.authorityAtWorldMs = Math.max(m.authorityAtWorldMs, f.confirmedAtWorldMs);
      remember(m, {key: receiptKey, payload, runId, atWorldMs: f.confirmedAtWorldMs});
    });
  });
}
export function restoreSailWork(saved: unknown, nowWorldMs: number): SailWorkLedger {
  return safe(() => {
    const L = copy(saved) as SailWorkLedger, m = metadata(L);
    demand(uint(nowWorldMs) && nowWorldMs >= m.authorityAtWorldMs, 'invalid-restore-time');
    transaction(L, (draft, state) => {
      state.authorityAtWorldMs = nowWorldMs;
      for (const d of jobs(draft)) if (d.spec.operation !== 'dry' && d.engaged) {
        d.engaged = false;
        d.controlAtWorldMs = nowWorldMs;
        d.lastWasWork = false;
        updateRun(draft, d);
      }
    });
    return L;
  });
}
/** Numeric world-only accounting. Do not expose this object to resident code. */
export function projectSailWork(L: SailWorkLedger, runId: string) {
  return safe(() => {
    const ended = metadata(L).finished.find(f => f.runId === runId);
    if (ended) return copy(ended);
    const d = raw(L, runId);
    return {runId, status: 'running' as const, certifiedMs: d.totalWorkMs,
      pendingMs: d.pendingMs, projection: model(d).projectTotal(d.totalWorkMs)};
  });
}
export function readSailWorksite(L: SailWorkLedger, siteId: string, asOfWorldMs: number) {
  return safe(() => {
    const m = metadata(L);
    demand(id(siteId) && uint(asOfWorldMs) && asOfWorldMs >= m.authorityAtWorldMs,
      'invalid-view-context');
    const d = jobs(L).find(j => j.spec.facts.worksite.locationId === siteId);
    if (!d) {
      const ended = m.finished.filter(f => f.siteId === siteId).at(-1);
      return {activity: ended?.status ?? 'available',
        observations: copy(ended?.observations ?? [])};
    }
    const working = d.spec.operation !== 'dry' && d.engaged &&
      d.lastWasWork && d.lastConfirmedAtWorldMs === asOfWorldMs;
    return {activity: !d.engaged ? 'paused' : working ? 'working' : 'waiting',
      observations: d.seenByActor ? model(d).observeTotal(d.totalWorkMs)
        .map(text => ({channel: 'sight' as const, text})) : []};
  });
}
export function readSailWorkerObservations(
  L: SailWorkLedger, runId: string, actorId: string,
): {channel: 'sight'; text: string}[] {
  return safe(() => {
    demand(id(actorId), 'invalid-observer');
    const ended = metadata(L).finished.find(f => f.runId === runId);
    if (ended) return ended.actorId === actorId ? copy(ended.observations) : [];
    const d = raw(L, runId);
    if (d.actorId !== actorId || d.spec.operation === 'dry' || !d.seenByActor) return [];
    return model(d).observeTotal(d.totalWorkMs)
      .map(text => ({channel: 'sight' as const, text}));
  });
}
export function sailFailureObservations(
  error: unknown, attempt?: {kind: 'host-confirmed-on-site-attempt'},
): {channel: 'touch' | 'sight'; text: string}[] {
  if (!attempt || !shape(attempt, ['kind']) ||
    attempt.kind !== 'host-confirmed-on-site-attempt') return [];
  const code = error instanceof SailWorkError ? error.code : 'unknown';
  const words: Record<string, string> = {
    'dry-leaves-required': '葉がまだ湿っていて、うまく裂けない。',
    'dry-strips-required': '葉が湿っていて、うまく編めない。',
    'insufficient-weave-material': '葉の帯が足りず、むしろがつながらない。',
    'long-bamboo-required': '竹が短く、マストにならない。',
    'insufficient-mast-dry-mass': '竹が細く、マストに使えない。',
  };
  return [{channel: 'touch', text: Object.hasOwn(words, code)
    ? words[code] : '手元の材料では作業を進められない。'}];
}
