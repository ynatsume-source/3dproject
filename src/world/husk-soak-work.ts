import type { Ledger, Run } from './process-runner';
import { commit, startRun } from './process-runner';
import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from './science-contract';
import { otherScienceWorkBusy } from './science-work-occupancy';
import { ensureScienceRecords } from './science-records';
import {
  HUSK_SOAK_ASSUMPTION, computeHuskSoak, readCoconutHusk, splitSoakedHusks,
  readHuskSoakOrigin, withHuskSoakOrigin, huskSoakOriginForPiece,
  type SoakedHuskPiece, type HuskSoakOrigin,
} from '../science/prototypes/husk-soak';

const PREVIOUS_HUSK_SOAK_WORK = Object.freeze({
  processId: 'prototype_husk_soak',
  processVersion: 'host-2',
  catalogVersion: 'civ-sci-test-2',
  contract: '0.2.1',
  clock: 'island' as const,
  schema: 'civ-world.husk-soak/2',
});

const LEGACY_VERSION = 'host-1';
const LEGACY_SCHEMA = 'civ-world.husk-soak/1';

type Presence = 'here' | 'away' | 'unknown';
export interface HuskSoakStart {
  commandId: string;
  assumptionId: string;
  actorId: string;
  lotId: string;
  site: { locationId: string; kind: 'coastal-tide-pool' };
  atWorldMs: number;
  atIslandMs: number;
  presence: Presence;
}

export interface HuskSoakSpan {
  recordId: string;
  worldId: string;
  worldEpoch: string;
  runId: string;
  siteId: string;
  fromWorldMs: number;
  toWorldMs: number;
  fromIslandMs: number;
  toIslandMs: number;
  confirmedAtWorldMs: number;
  immersed: boolean | null;
}

export interface HuskSoakTakeOut {
  intentId: string;
  kind: 'take-out';
  actorId: string;
  presence: Presence;
  atWorldMs: number;
  atIslandMs: number;
}

interface SoakData {
  worldId: string;
  worldEpoch: string;
  runId: string;
  spec: HuskSoakStart;
  source: LotView;
  frames: HuskSoakSpan[];
  previousHistory?: SoakedHuskPiece['input']['soakHistory'];
  origin?: HuskSoakOrigin | null;
  takeOut: HuskSoakTakeOut | null;
  totalImmersedMs: number;
  historyComplete: 0 | 1;
  outputs: SoakedHuskPiece[];
  drawn: NonNullable<ScienceStepResult['drawn']>;
}

const copy = <T>(value: T): T => structuredClone(value);
const uint = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function requireSoak(ok: unknown, code: string): asserts ok {
  if (!ok) throw new HuskSoakError(code);
}

export class HuskSoakError extends Error {
  constructor(readonly code: string) {
    super('殻を浸ける段取りを適用できない。');
    this.name = 'HuskSoakError';
  }
}

function shape(v: unknown, keys: readonly string[]): v is Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const actual = Object.keys(v).sort();
  const wanted = [...keys].sort();
  return actual.length === wanted.length && actual.every((k, i) => k === wanted[i]);
}

function canonical(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function sourceCopy(lot: LotView & { reservedBy?: string }): LotView {
  const { reservedBy: _, ...source } = lot;
  return copy(source);
}

function checkStart(spec: HuskSoakStart, source: LotView): void {
  requireSoak(shape(spec, [
    'commandId', 'assumptionId', 'actorId', 'lotId', 'site',
    'atWorldMs', 'atIslandMs', 'presence',
  ]), 'invalid-start');
  requireSoak([spec.commandId, spec.actorId, spec.lotId].every(id)
    && uint(spec.atWorldMs) && uint(spec.atIslandMs)
    && spec.presence === 'here', 'onsite-start-required');
  requireSoak(shape(spec.site, ['locationId', 'kind'])
    && id(spec.site.locationId) && spec.site.kind === 'coastal-tide-pool',
    'coastal-tide-pool-required');
  requireSoak(source.lotId === spec.lotId && source.location === spec.site.locationId,
    'husk-must-be-at-tide-pool');
  computeHuskSoak(source, spec.assumptionId, 0);
}

function checkTakeOut(intent: HuskSoakTakeOut): void {
  requireSoak(shape(intent, [
    'intentId', 'kind', 'actorId', 'presence', 'atWorldMs', 'atIslandMs',
  ]) && intent.kind === 'take-out' && id(intent.intentId) && id(intent.actorId)
    && intent.presence === 'here' && uint(intent.atWorldMs) && uint(intent.atIslandMs),
    'onsite-take-out-required');
}

function rebuild(
  worldId: string,
  worldEpoch: string,
  runId: string,
  spec: HuskSoakStart,
  source: LotView,
  frames: HuskSoakSpan[],
  takeOut: HuskSoakTakeOut | null,
  previousHistory: SoakedHuskPiece['input']['soakHistory'] = [],
  legacyQuality = false,
  origin: HuskSoakOrigin | null = null,
): SoakData {
  requireSoak([worldId, worldEpoch, runId].every(id), 'invalid-world-or-run');
  checkStart(spec, source);
  requireSoak(Array.isArray(previousHistory) && previousHistory.every(record =>
    shape(record, ['recordId', 'runId', 'fromWorldMs', 'toWorldMs'])
      && id(record.recordId) && id(record.runId)
      && uint(record.fromWorldMs) && uint(record.toWorldMs)
      && record.fromWorldMs <= record.toWorldMs && record.toWorldMs <= spec.atWorldMs),
    'invalid-previous-soaking-history');
  requireSoak(new Set(previousHistory.map(record => record.recordId)).size
    === previousHistory.length, 'duplicate-previous-soaking-history');
  requireSoak(Array.isArray(frames), 'invalid-span-history');
  let worldAt = spec.atWorldMs;
  let islandAt = spec.atIslandMs;
  let certifiedAt = spec.atWorldMs;
  let total = 0n;
  let complete = readCoconutHusk(source).historyComplete === 1;
  const seen = new Set<string>();
  const history: SoakedHuskPiece['input']['soakHistory'] = copy(previousHistory);
  let lastImmersed: HuskSoakSpan | null = null;
  for (const f of frames) {
    requireSoak(shape(f, [
      'recordId', 'worldId', 'worldEpoch', 'runId', 'siteId',
      'fromWorldMs', 'toWorldMs', 'fromIslandMs', 'toIslandMs',
      'confirmedAtWorldMs', 'immersed',
    ]) && id(f.recordId) && !seen.has(f.recordId)
      && f.worldId === worldId && f.worldEpoch === worldEpoch && f.runId === runId
      && f.siteId === spec.site.locationId
      && [f.fromWorldMs, f.toWorldMs, f.fromIslandMs, f.toIslandMs, f.confirmedAtWorldMs].every(uint)
      && f.toWorldMs > f.fromWorldMs && f.toIslandMs >= f.fromIslandMs
      && f.fromWorldMs >= worldAt && f.fromIslandMs >= islandAt
      && f.confirmedAtWorldMs >= f.toWorldMs
      && (f.immersed === true || f.immersed === false || f.immersed === null),
      'invalid-or-overlapping-submersion-span');
    seen.add(f.recordId);
    if (f.fromWorldMs !== worldAt || f.fromIslandMs !== islandAt || f.immersed === null) {
      complete = false;
    }
    if (f.immersed === true) {
      total += BigInt(f.toIslandMs - f.fromIslandMs);
      requireSoak(total <= BigInt(Number.MAX_SAFE_INTEGER), 'submersion-time-overflow');
      if (lastImmersed?.toWorldMs === f.fromWorldMs
        && lastImmersed.toIslandMs === f.fromIslandMs) {
        history[history.length - 1].toWorldMs = f.toWorldMs;
      } else {
        history.push({
          recordId: 'record:husk-soak:' + JSON.stringify([runId, history.length]),
          runId, fromWorldMs: f.fromWorldMs, toWorldMs: f.toWorldMs,
        });
      }
      lastImmersed = f;
    } else {
      lastImmersed = null;
    }
    worldAt = f.toWorldMs;
    islandAt = f.toIslandMs;
    certifiedAt = Math.max(certifiedAt, f.confirmedAtWorldMs);
  }
  const uptakeSource = origin ? withHuskSoakOrigin(source, origin) : source;
  const physical = computeHuskSoak(uptakeSource, spec.assumptionId, Number(total));
  let outputs: SoakedHuskPiece[] = [];
  let drawn: NonNullable<ScienceStepResult['drawn']> = [];
  if (takeOut !== null) {
    checkTakeOut(takeOut);
    requireSoak(takeOut.atWorldMs >= Math.max(worldAt, certifiedAt)
      && takeOut.atIslandMs >= islandAt, 'take-out-precedes-certified-span');
    if (takeOut.atWorldMs !== worldAt || takeOut.atIslandMs !== islandAt) complete = false;
    if (physical.certifiedIslandMs > 0) {
      outputs = splitSoakedHusks(uptakeSource, spec.assumptionId, Number(total), {
        runId, fromWorldMs: spec.atWorldMs, toWorldMs: takeOut.atWorldMs,
      }, legacyQuality);
      for (const piece of outputs) {
        piece.quality.history_complete = complete ? 1 : 0;
        piece.input.soakHistory = copy(history);
      }
      if (physical.drawnWaterMg > 0) {
        drawn = [{
          materialId: 'sea_water',
          amount: { value: physical.drawnWaterMg, unit: 'mg' },
          from: 'water',
        }];
      }
    }
  }
  return {
    worldId, worldEpoch, runId, spec: copy(spec), source: copy(source), frames: copy(frames),
    takeOut: copy(takeOut), totalImmersedMs: Number(total),
    historyComplete: complete ? 1 : 0, outputs, drawn,
    ...(legacyQuality ? {} : { previousHistory: copy(previousHistory), origin: copy(origin) }),
  };
}

function legacyDataOf(L: Ledger, runId: string): { run: Run; data: SoakData } {
  const r = L.runs[runId];
  const legacy = r?.processVersion === LEGACY_VERSION && r.state?.schema === LEGACY_SCHEMA;
  requireSoak(r && r.processId === PREVIOUS_HUSK_SOAK_WORK.processId
    && (legacy || r.processVersion === PREVIOUS_HUSK_SOAK_WORK.processVersion)
    && r.catalogVersion === PREVIOUS_HUSK_SOAK_WORK.catalogVersion
    && r.contract === PREVIOUS_HUSK_SOAK_WORK.contract && r.clock === 'island'
    && (legacy || r.state?.schema === PREVIOUS_HUSK_SOAK_WORK.schema), 'unsupported-soak-run-or-state');
  const saved = r.state!.data as SoakData;
  requireSoak(!legacy || saved?.source?.materialId === 'coconut_husk', 'invalid-legacy-soak-source');
  requireSoak(saved && saved.worldId === L.world.worldId
    && saved.worldEpoch === L.world.worldEpoch && saved.runId === runId,
    'wrong-world-or-run');
  const expected = rebuild(saved.worldId, saved.worldEpoch, runId, saved.spec,
    saved.source, saved.frames, saved.takeOut, saved.previousHistory ?? [], legacy,
    saved.origin ?? null);
  requireSoak(canonical(saved) === canonical(expected), 'corrupt-soak-state');
  requireSoak(r.operator === expected.spec.actorId && r.lotIds.length === 1
    && r.lotIds[0] === expected.source.lotId && r.equipmentIds.length === 0,
    'changed-run-binding');
  const to = expected.takeOut?.atIslandMs
    ?? expected.frames.at(-1)?.toIslandMs ?? expected.spec.atIslandMs;
  requireSoak(r.lastTo === to, 'changed-run-clock');
  requireSoak(expected.takeOut
    ? r.status === (expected.outputs.length ? 'completed' : 'stopped')
    : r.status === 'running', 'changed-run-status');
  if (!expected.takeOut) {
    const current = L.lots[expected.source.lotId];
    requireSoak(current?.reservedBy === runId
      && canonical(sourceCopy(current)) === canonical(expected.source),
      'lost-or-changed-reserved-husk');
  }
  return { run: r, data: expected };
}

function legacyResoakSource(L: Ledger, lotId: string): LotView {
  const lot = L.lots[lotId];
  requireSoak(lot && lot.materialId === 'wet_unseparated_coconut_husk',
    'requires-one-unseparated-wet-husk');
  const source = sourceCopy(lot);
  readCoconutHusk(source);
  if (readHuskSoakOrigin(source)) return source;
  for (const r of Object.values(L.runs)) {
    if (r.processId !== PREVIOUS_HUSK_SOAK_WORK.processId) continue;
    const d = legacyDataOf(L, r.runId).data;
    const index = d.outputs.findIndex(piece => piece.lotId === lotId);
    if (index < 0) continue;
    const piece = d.outputs[index];
    requireSoak(source.amount.value === piece.amountMg
      && canonical(source.quality) === canonical(piece.quality),
      'changed-or-missing-soaked-husk');
    let origin = huskSoakOriginForPiece(d.origin ? withHuskSoakOrigin(d.source, d.origin) : d.source,
      d.totalImmersedMs, index,
      r.state!.schema === LEGACY_SCHEMA);
    // Nearly full old odd-count splits can already be one mg over a piece's
    // capacity. Keep that old allocation readable rather than deleting water.
    if (origin.splitPolicy === 1) {
      const current = { ...origin, splitPolicy: 2 as const };
      try {
        withHuskSoakOrigin(source, current);
        origin = current;
      } catch {
        // The legacy allocation remains an explicitly marked compatibility case.
      }
    }
    return withHuskSoakOrigin(source, origin);
  }
  // Explicit wet material without an old producer has no attested earlier
  // uptake clock: start this run from its actual water, never guessed history.
  return source;
}


export const HUSK_SOAK_WORK = Object.freeze({
  processId: 'prototype_husk_soak',
  processVersion: 'host-3',
  catalogVersion: 'civ-sci-test-2',
  contract: '0.2.1',
  clock: 'island' as const,
  schema: 'civ-world.husk-soak/3',
  ledgerSchema: 'civ-world.husk-soak-records/3',
  receiptLimit: 64,
});

type SoakHistory = SoakedHuskPiece['input']['soakHistory'];
interface CompactData {
  worldId: string;
  worldEpoch: string;
  runId: string;
  spec: HuskSoakStart;
  source: LotView;
  origin: HuskSoakOrigin | null;
  frames: HuskSoakSpan[];
  frameCount: number;
  totalImmersedMs: number;
  worldAt: number;
  islandAt: number;
  certifiedAt: number;
  historyComplete: 0 | 1;
  history: SoakHistory;
  historyCount: number;
  lastImmersed: boolean;
  legacyQuality: boolean;
  digest: number;
}
type SoakProjection = ReturnType<typeof computeHuskSoak> & {
  status: 'running' | 'completed' | 'stopped';
  pendingIslandMs: number;
  historyComplete: 0 | 1;
  outputs: SoakedHuskPiece[];
  drawn: NonNullable<ScienceStepResult['drawn']>;
};
interface Receipt {
  key: string;
  payload: string;
  runId: string;
  atWorldMs: number;
}
interface Finished {
  runId: string;
  atWorldMs: number;
  projection: SoakProjection;
  digest: number;
}
interface Provenance {
  input: SoakedHuskPiece['input'];
  origin: HuskSoakOrigin | null;
  digest: number;
}
interface Records {
  schema: typeof HUSK_SOAK_WORK.ledgerSchema;
  worldId: string;
  worldEpoch: string;
  authorityAtWorldMs: number;
  floorAtWorldMs: number | null;
  recent: Receipt[];
  finished: Finished[];
  provenance: Record<string, Provenance>;
}
type SoakLedger = Ledger & {
  huskSoakRecordFormat?: string;
  huskSoakRecords?: Records;
};

function digest(value: unknown): number {
  let h = 2166136261;
  for (const c of canonical(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function sealData(value: Omit<CompactData, 'digest'>): CompactData {
  return { ...value, digest: digest(value) };
}
function validHistory(history: unknown): history is SoakHistory {
  return Array.isArray(history) && history.length <= HUSK_SOAK_WORK.receiptLimit
    && history.every(record => shape(record, ['recordId', 'runId', 'fromWorldMs', 'toWorldMs'])
      && id(record.recordId) && id(record.runId)
      && uint(record.fromWorldMs) && uint(record.toWorldMs)
      && record.toWorldMs >= record.fromWorldMs)
    && new Set(history.map(record => record.recordId)).size === history.length;
}
function trimHistory(d: Omit<CompactData, 'digest'>): void {
  if (d.history.length > HUSK_SOAK_WORK.receiptLimit) {
    d.history.splice(0, d.history.length - HUSK_SOAK_WORK.receiptLimit);
    // The cumulative cursor still certifies every interval. Retaining fewer
    // exact records does not invent a gap or change the physical history flag.
  }
}
function sourceFor(d: Pick<CompactData, 'source' | 'origin'>): LotView {
  return d.origin ? withHuskSoakOrigin(d.source, d.origin) : d.source;
}
function physical(d: Pick<CompactData, 'source' | 'origin' | 'spec' | 'totalImmersedMs'>) {
  return computeHuskSoak(sourceFor(d), d.spec.assumptionId, d.totalImmersedMs);
}
function projectionOf(
  d: CompactData,
  status: SoakProjection['status'] = 'running',
  outputs: SoakedHuskPiece[] = [],
  drawn: SoakProjection['drawn'] = [],
): SoakProjection {
  return {
    status,
    ...physical(d),
    pendingIslandMs: d.totalImmersedMs % HUSK_SOAK_ASSUMPTION.quantumMs,
    historyComplete: d.historyComplete,
    outputs: copy(outputs),
    drawn: copy(drawn),
  };
}
function emptyRecords(L: Ledger): Records {
  return {
    schema: HUSK_SOAK_WORK.ledgerSchema,
    worldId: L.world.worldId,
    worldEpoch: L.world.worldEpoch,
    authorityAtWorldMs: 0,
    floorAtWorldMs: null,
    recent: [],
    finished: [],
    provenance: {},
  };
}
function install(L: Ledger, records: Records): void {
  const target = L as SoakLedger;
  target.huskSoakRecordFormat = HUSK_SOAK_WORK.ledgerSchema;
  target.huskSoakRecords = records;
}
function trimRecords(m: Records, L: Ledger): void {
  while (m.recent.length > HUSK_SOAK_WORK.receiptLimit) {
    const old = m.recent.shift()!;
    m.floorAtWorldMs = Math.max(m.floorAtWorldMs ?? 0, old.atWorldMs);
  }
  if (m.finished.length > HUSK_SOAK_WORK.receiptLimit) {
    m.finished.splice(0, m.finished.length - HUSK_SOAK_WORK.receiptLimit);
  }
  for (const lotId of Object.keys(m.provenance)) {
    if (L.lots[lotId]?.materialId !== 'wet_unseparated_coconut_husk') {
      delete m.provenance[lotId];
    }
  }
}
function inputMatches(L: Ledger, lotId: string, input: SoakedHuskPiece['input']): void {
  requireSoak(input && typeof input === 'object' && !Array.isArray(input), 'corrupt-soak-provenance');
  const lot = L.lots[lotId];
  requireSoak(lot && lot.materialId === 'wet_unseparated_coconut_husk'
    && lot.amount.unit === 'mg' && uint(lot.amount.value) && lot.amount.value > 0
    && input.lotId === lotId && input.materialId === lot.materialId
    && input.separation === 'never-separated'
    && uint(input.dryMg) && input.dryMg > 0 && uint(input.waterMg)
    && BigInt(input.dryMg) + BigInt(input.waterMg) === BigInt(lot.amount.value)
    && lot.quality?.dry_mg === input.dryMg && lot.quality.water_mg === input.waterMg
    && lot.quality.husk_count === 1 && lot.quality.unseparated === 1,
    'changed-or-missing-soaked-husk');
}
const checkedWorlds = new WeakMap<Ledger, { worldId: string; worldEpoch: string }>();

function checkedRecordsHeader(L: Ledger): Records {
  const target = L as SoakLedger, m = target.huskSoakRecords;
  requireSoak(m && target.huskSoakRecordFormat === HUSK_SOAK_WORK.ledgerSchema
    && shape(m, ['schema', 'worldId', 'worldEpoch', 'authorityAtWorldMs',
      'floorAtWorldMs', 'recent', 'finished', 'provenance'])
    && m.schema === HUSK_SOAK_WORK.ledgerSchema
    && m.worldId === L.world.worldId && m.worldEpoch === L.world.worldEpoch
    && uint(m.authorityAtWorldMs)
    && (m.floorAtWorldMs === null || uint(m.floorAtWorldMs))
    && Array.isArray(m.recent) && m.recent.length <= HUSK_SOAK_WORK.receiptLimit
    && Array.isArray(m.finished) && m.finished.length <= HUSK_SOAK_WORK.receiptLimit
    && m.provenance && typeof m.provenance === 'object' && !Array.isArray(m.provenance),
    'unsupported-soak-records');
  return m;
}
function checkedReceipt(m: Records, r: Receipt): void {
  requireSoak(shape(r, ['key', 'payload', 'runId', 'atWorldMs'])
    && id(r.key) && typeof r.payload === 'string' && id(r.runId)
    && uint(r.atWorldMs) && r.atWorldMs <= m.authorityAtWorldMs,
    'corrupt-soak-receipt');
}
function checkedFinished(L: Ledger, f: Finished): void {
  requireSoak(shape(f, ['runId', 'atWorldMs', 'projection', 'digest'])
    && id(f.runId) && uint(f.atWorldMs) && !L.runs[f.runId]
    && uint(f.digest), 'corrupt-soak-summary');
  const { digest: checksum, ...body } = f;
  requireSoak(checksum === digest(body)
    && ['completed', 'stopped'].includes(f.projection?.status), 'corrupt-soak-summary');
}
function checkedRecords(L: Ledger): Records {
  const m = checkedRecordsHeader(L);
  const receipts = new Set<string>();
  for (const r of m.recent) {
    checkedReceipt(m, r);
    requireSoak(!receipts.has(r.key), 'corrupt-soak-receipt');
    receipts.add(r.key);
  }
  const finished = new Set<string>();
  for (const f of m.finished) {
    checkedFinished(L, f);
    requireSoak(!finished.has(f.runId), 'corrupt-soak-summary');
    finished.add(f.runId);
  }
  for (const [lotId, p] of Object.entries(m.provenance)) {
    requireSoak(id(lotId) && shape(p, ['input', 'origin', 'digest']) && uint(p.digest),
      'corrupt-soak-provenance');
    const { digest: checksum, ...body } = p;
    requireSoak(checksum === digest(body) && validHistory(p.input?.soakHistory),
      'corrupt-soak-provenance');
    if (L.lots[lotId]?.materialId === 'wet_unseparated_coconut_husk') {
      inputMatches(L, lotId, p.input);
      if (p.origin) withHuskSoakOrigin(sourceCopy(L.lots[lotId]), p.origin);
    }
  }
  checkedWorlds.set(L, { worldId: L.world.worldId, worldEpoch: L.world.worldEpoch });
  return m;
}
/** A live ledger is owned by world transactions. A restored/new ledger must be
 * fully checked; a known root may have been legitimately cloned by another
 * world transaction, so object identity of the large record store is not proof.
 */
function spanRecords(L: Ledger): Records {
  const target = L as SoakLedger;
  if (target.huskSoakRecordFormat === undefined && target.huskSoakRecords === undefined) {
    return records(L);
  }
  const m = checkedRecordsHeader(L);
  const world = checkedWorlds.get(L);
  return world?.worldId === L.world.worldId && world.worldEpoch === L.world.worldEpoch
    ? m : checkedRecords(L);
}

function freshData(
  L: Ledger,
  runId: string,
  spec: HuskSoakStart,
  source: LotView,
  origin: HuskSoakOrigin | null,
  previousHistory: SoakHistory,
  legacyQuality = false,
): CompactData {
  const base: Omit<CompactData, 'digest'> = {
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId,
    spec: copy(spec), source: copy(source), origin: copy(origin),
    frames: [], frameCount: 0, totalImmersedMs: 0,
    worldAt: spec.atWorldMs, islandAt: spec.atIslandMs, certifiedAt: spec.atWorldMs,
    historyComplete: readCoconutHusk(source).historyComplete,
    history: copy(previousHistory), historyCount: previousHistory.length,
    lastImmersed: false, legacyQuality,
  };
  trimHistory(base);
  return sealData(base);
}
function checkSpan(
  d: Pick<CompactData, 'worldId' | 'worldEpoch' | 'runId' | 'spec' | 'worldAt' | 'islandAt'>,
  f: HuskSoakSpan,
): void {
  requireSoak(shape(f, ['recordId', 'worldId', 'worldEpoch', 'runId', 'siteId',
    'fromWorldMs', 'toWorldMs', 'fromIslandMs', 'toIslandMs', 'confirmedAtWorldMs', 'immersed'])
    && id(f.recordId) && f.worldId === d.worldId && f.worldEpoch === d.worldEpoch
    && f.runId === d.runId && f.siteId === d.spec.site.locationId
    && [f.fromWorldMs, f.toWorldMs, f.fromIslandMs, f.toIslandMs, f.confirmedAtWorldMs].every(uint)
    && f.toWorldMs > f.fromWorldMs && f.toIslandMs >= f.fromIslandMs
    && f.fromWorldMs >= d.worldAt && f.fromIslandMs >= d.islandAt
    && f.confirmedAtWorldMs >= f.toWorldMs
    && (f.immersed === true || f.immersed === false || f.immersed === null),
    'invalid-or-overlapping-submersion-span');
}
function appendSpanInPlace(next: Omit<CompactData, 'digest'>, span: HuskSoakSpan): void {
  checkSpan(next, span);
  const contiguous = span.fromWorldMs === next.worldAt && span.fromIslandMs === next.islandAt;
  if (!contiguous || span.immersed === null) next.historyComplete = 0;
  if (span.immersed === true) {
    const total = BigInt(next.totalImmersedMs) + BigInt(span.toIslandMs - span.fromIslandMs);
    requireSoak(total <= BigInt(Number.MAX_SAFE_INTEGER), 'submersion-time-overflow');
    next.totalImmersedMs = Number(total);
    if (next.lastImmersed && contiguous && next.history.at(-1)?.runId === next.runId) {
      next.history[next.history.length - 1].toWorldMs = span.toWorldMs;
    } else {
      next.history.push({
        recordId: 'record:husk-soak:' + JSON.stringify([next.runId, next.historyCount]),
        runId: next.runId, fromWorldMs: span.fromWorldMs, toWorldMs: span.toWorldMs,
      });
      next.historyCount++;
      requireSoak(uint(next.historyCount), 'history-count-overflow');
    }
  }
  next.lastImmersed = span.immersed === true;
  next.worldAt = span.toWorldMs;
  next.islandAt = span.toIslandMs;
  next.certifiedAt = Math.max(next.certifiedAt, span.confirmedAtWorldMs);
  next.frameCount++;
  requireSoak(uint(next.frameCount), 'frame-count-overflow');
  next.frames.push(copy(span));
  if (next.frames.length > HUSK_SOAK_WORK.receiptLimit) next.frames.shift();
  trimHistory(next);
  physical(next);
}
function appendSpan(d: CompactData, span: HuskSoakSpan): CompactData {
  const { digest: _, ...next } = copy(d);
  appendSpanInPlace(next, span);
  return sealData(next);
}

function compactDataOf(L: Ledger, runId: string): { run: Run; data: CompactData } {
  const r = L.runs[runId], d = r?.state?.data as CompactData;
  requireSoak(r && r.processId === HUSK_SOAK_WORK.processId
    && r.processVersion === HUSK_SOAK_WORK.processVersion
    && r.catalogVersion === HUSK_SOAK_WORK.catalogVersion && r.contract === HUSK_SOAK_WORK.contract
    && r.clock === 'island' && r.status === 'running'
    && r.state?.schema === HUSK_SOAK_WORK.schema && d
    && shape(d, ['worldId', 'worldEpoch', 'runId', 'spec', 'source', 'origin',
      'frames', 'frameCount', 'totalImmersedMs', 'worldAt', 'islandAt', 'certifiedAt',
      'historyComplete', 'history', 'historyCount', 'lastImmersed', 'legacyQuality', 'digest'])
    && d.worldId === L.world.worldId && d.worldEpoch === L.world.worldEpoch && d.runId === runId,
    'unsupported-soak-run-or-state');
  const { digest: checksum, ...body } = d;
  requireSoak(uint(checksum) && checksum === digest(body)
    && [d.frameCount, d.totalImmersedMs, d.worldAt, d.islandAt, d.certifiedAt, d.historyCount].every(uint)
    && [0, 1].includes(d.historyComplete) && typeof d.lastImmersed === 'boolean'
    && typeof d.legacyQuality === 'boolean'
    && d.worldAt >= d.spec.atWorldMs && d.islandAt >= d.spec.atIslandMs
    && d.certifiedAt >= d.worldAt && validHistory(d.history)
    && d.historyCount >= d.history.length
    && Array.isArray(d.frames) && d.frames.length <= HUSK_SOAK_WORK.receiptLimit
    && d.frames.length <= d.frameCount, 'corrupt-soak-state');
  checkStart(d.spec, d.source);
  requireSoak(d.frames.length === Math.min(d.frameCount, HUSK_SOAK_WORK.receiptLimit),
    'corrupt-soak-frame-window');
  let worldAt = d.frames[0]?.fromWorldMs ?? d.spec.atWorldMs;
  let islandAt = d.frames[0]?.fromIslandMs ?? d.spec.atIslandMs;
  let retainedImmersed = 0n;
  const seen = new Set<string>();
  for (const frame of d.frames) {
    checkSpan({ ...d, worldAt, islandAt }, frame);
    requireSoak(!seen.has(frame.recordId), 'duplicate-soak-span');
    seen.add(frame.recordId);
    if (frame.immersed) retainedImmersed += BigInt(frame.toIslandMs - frame.fromIslandMs);
    worldAt = frame.toWorldMs;
    islandAt = frame.toIslandMs;
  }
  requireSoak(worldAt === d.worldAt && islandAt === d.islandAt
    && retainedImmersed <= BigInt(d.totalImmersedMs)
    && (d.frameCount > 0 || d.totalImmersedMs === 0),
    'corrupt-soak-cumulative-cursor');
  physical(d);
  requireSoak(r.operator === d.spec.actorId && r.lotIds.length === 1
    && r.lotIds[0] === d.source.lotId && r.equipmentIds.length === 0 && r.lastTo === d.islandAt,
    'changed-run-binding');
  const lot = L.lots[d.source.lotId];
  requireSoak(lot?.reservedBy === runId && canonical(sourceCopy(lot)) === canonical(d.source),
    'lost-or-changed-reserved-husk');
  return { run: r, data: d };
}
function remember(m: Records, key: string, payload: string, runId: string, atWorldMs: number): void {
  m.recent.push({ key, payload, runId, atWorldMs });
  m.authorityAtWorldMs = Math.max(m.authorityAtWorldMs, atWorldMs);
}
function replay(m: Records, key: string, payload: string, atWorldMs: number): Receipt | null {
  const old = m.recent.find(r => r.key === key);
  if (old) {
    checkedReceipt(m, old);
    requireSoak(old.payload === payload, 'conflicting-command-replay');
    return old;
  }
  requireSoak(m.floorAtWorldMs === null || atWorldMs > m.floorAtWorldMs, 'expired-command');
  return null;
}
function rememberFinished(m: Records, runId: string, atWorldMs: number, p: SoakProjection): void {
  const body = { runId, atWorldMs, projection: copy(p) };
  m.finished.push({ ...body, digest: digest(body) });
}
function provenanceOf(input: SoakedHuskPiece['input'], origin: HuskSoakOrigin | null): Provenance {
  const body = { input: copy(input), origin: copy(origin) };
  return { ...body, digest: digest(body) };
}
function migrateRecords(L: Ledger): Records {
  const previous = Object.values(L.runs)
    .filter(r => r.processId === HUSK_SOAK_WORK.processId)
    .map(r => legacyDataOf(L, r.runId));
  const m = emptyRecords(L);
  // Resolve every live lot while all producer states still exist. Never patch a
  // reserved lot: another process may have fingerprinted its original quality.
  for (const { data: d } of previous) {
    for (const piece of d.outputs) {
      const lot = L.lots[piece.lotId];
      if (!lot || lot.materialId !== 'wet_unseparated_coconut_husk') continue;
      requireSoak(lot.amount.value === piece.amountMg && canonical(lot.quality) === canonical(piece.quality),
        'changed-or-missing-soaked-husk');
      const origin = readHuskSoakOrigin(legacyResoakSource(L, lot.lotId));
      const input = copy(piece.input);
      if (input.soakHistory.length > HUSK_SOAK_WORK.receiptLimit) {
        input.soakHistory = input.soakHistory.slice(-HUSK_SOAK_WORK.receiptLimit);
      }
      m.provenance[lot.lotId] = provenanceOf(input, origin);
    }
  }
  for (const { run: r, data: old } of previous) {
    let d = freshData(L, r.runId, old.spec, old.source, old.origin ?? null, old.previousHistory ?? [], r.state!.schema === LEGACY_SCHEMA);
    remember(m, canonical(['begin', old.spec.commandId]), canonical(old.spec),
      r.runId, old.spec.atWorldMs);
    for (const frame of old.frames) {
      d = appendSpan(d, frame);
      remember(m, canonical(['span', r.runId, frame.recordId]), canonical(frame),
        r.runId, frame.confirmedAtWorldMs);
    }
    if (old.takeOut) {
      const p: SoakProjection = {
        status: r.status as 'completed' | 'stopped',
        ...computeHuskSoak(sourceFor(d), old.spec.assumptionId, old.totalImmersedMs),
        pendingIslandMs: old.totalImmersedMs % HUSK_SOAK_ASSUMPTION.quantumMs,
        historyComplete: old.historyComplete,
        outputs: copy(old.outputs),
        drawn: copy(old.drawn),
      };
      for (const piece of p.outputs) {
        piece.input.soakHistory = piece.input.soakHistory.slice(-HUSK_SOAK_WORK.receiptLimit);
      }
      rememberFinished(m, r.runId, old.takeOut.atWorldMs, p);
      remember(m, canonical(['take-out', r.runId, old.takeOut.intentId]), canonical(old.takeOut),
        r.runId, old.takeOut.atWorldMs);
      delete L.runs[r.runId];
    } else {
      r.processVersion = HUSK_SOAK_WORK.processVersion;
      r.state = { schema: HUSK_SOAK_WORK.schema, data: d };
    }
  }
  m.recent.sort((a, b) => a.atWorldMs - b.atWorldMs);
  m.finished.sort((a, b) => a.atWorldMs - b.atWorldMs);
  trimRecords(m, L);
  install(L, m);
  return checkedRecords(L);
}
function records(L: Ledger): Records {
  const target = L as SoakLedger;
  if (target.huskSoakRecordFormat === undefined && target.huskSoakRecords === undefined) {
    const draft = copy(L);
    migrateRecords(draft);
    Object.assign(L, draft);
  }
  return checkedRecords(L);
}
function soakTransaction<T>(L: Ledger, body: (draft: Ledger, m: Records) => T): T {
  records(L);
  const draft = copy(L), m = copy(checkedRecords(draft));
  const answer = body(draft, m);
  trimRecords(m, draft);
  install(draft, m);
  checkedRecords(draft);
  Object.assign(L, draft);
  return answer;
}

/** Start waiting at a confirmed tide-pool visit; waiting never holds the actor. */
function beginHuskSoakImpl(
  L: Ledger, spec: HuskSoakStart, nowWorldMs: number,
): { runId: string } {
  requireSoak(uint(nowWorldMs) && uint(spec?.atWorldMs)
    && spec.atWorldMs <= nowWorldMs, 'future-or-invalid-start');
  const m = records(L), key = canonical(['begin', spec.commandId]), payload = canonical(spec);
  const old = replay(m, key, payload, spec.atWorldMs);
  if (old) return { runId: old.runId };
  requireSoak(spec.atWorldMs >= m.authorityAtWorldMs, 'backdated-start');
  return soakTransaction(L, (draft, next) => {
    const lot = draft.lots[spec.lotId];
    requireSoak(lot && !lot.reservedBy, 'missing-or-reserved-husk');
    const source = sourceCopy(lot);
    let previousHistory: SoakHistory = [], origin: HuskSoakOrigin | null = null;
    if (source.materialId === 'wet_unseparated_coconut_husk') {
      const proof = Object.hasOwn(next.provenance, source.lotId) ? next.provenance[source.lotId] : undefined;
      if (proof) {
        inputMatches(draft, source.lotId, proof.input);
        previousHistory = copy(proof.input.soakHistory);
      }
      origin = readHuskSoakOrigin(readHuskResoakSource(draft, source.lotId));
    }
    checkStart(spec, source);
    const busy = otherScienceWorkBusy(draft, spec.actorId, spec.site.locationId,
      HUSK_SOAK_WORK.processId);
    requireSoak(!busy.actor && !busy.site, 'other-science-work-busy');
    for (const r of Object.values(draft.runs)) {
      if (r.processId === HUSK_SOAK_WORK.processId) {
        requireSoak(compactDataOf(draft, r.runId).data.spec.site.locationId
          !== spec.site.locationId, 'tide-pool-reserved');
      }
    }
    const started = startRun(draft, {
      processId: HUSK_SOAK_WORK.processId, processVersion: HUSK_SOAK_WORK.processVersion,
      catalogVersion: HUSK_SOAK_WORK.catalogVersion, contract: HUSK_SOAK_WORK.contract,
      clock: 'island', lotIds: [source.lotId], equipmentIds: [], operator: spec.actorId,
    }, spec.atWorldMs);
    requireSoak(started.run, 'reservation-refused');
    const run = started.run;
    run.lastTo = spec.atIslandMs;
    run.status = 'running';
    run.state = {
      schema: HUSK_SOAK_WORK.schema,
      data: freshData(draft, run.runId, spec, source, origin, previousHistory),
    };
    remember(next, key, payload, run.runId, spec.atWorldMs);
    return { runId: run.runId };
  });
}
function request(
  L: Ledger, r: Run, d: CompactData, requestId: string, to: number,
  snapshot = true,
): ScienceStepRequest {
  return {
    contract: r.contract, requestId, world: copy(L.world), runId: r.runId,
    processId: r.processId, processVersion: r.processVersion, catalogVersion: r.catalogVersion,
    interval: { from: r.lastTo, to }, state: snapshot ? copy(r.state) : r.state,
    environment: { sampleId: 'env:husk-soak-unused', source: 'unknown', effectiveAt: r.lastTo },
    lots: [snapshot ? copy(d.source) : d.source], equipment: [], energy: [], actions: [], seed: r.seed,
  };
}
function result(
  req: ScienceStepRequest, d: CompactData, status: ScienceStepResult['status'],
): ScienceStepResult {
  return {
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: copy(req.interval), state: { schema: HUSK_SOAK_WORK.schema, data: d }, status,
    consumed: [], produced: [], released: [], drawn: [], energy: [], equipmentWear: [],
    observations: [],
    evidence: {
      evaluatorVersion: HUSK_SOAK_WORK.processVersion, sourceRefs: [],
      notes: 'owner-assumption-not-calibrated; ' + HUSK_SOAK_ASSUMPTION.id
        + '; cumulative confirmed submersion, bounded command history',
    },
  };
}
/** Receipts are trimmed after EACH accepted span, including their expiry floor.
 * Other record rows do not change during a running span and are not cloned.
 */
function spanReceiptWindow(m: Records): void {
  while (m.recent.length > HUSK_SOAK_WORK.receiptLimit) {
    const old = m.recent.shift()!;
    m.floorAtWorldMs = Math.max(m.floorAtWorldMs ?? 0, old.atWorldMs);
  }
}
function spanRecordCopy(m: Records, L: Ledger): Records {
  const next = { ...m, recent: m.recent.slice() };
  for (const lotId of Object.keys(m.provenance)) {
    if (L.lots[lotId]?.materialId !== 'wet_unseparated_coconut_husk') {
      if (next.provenance === m.provenance) next.provenance = { ...m.provenance };
      delete next.provenance[lotId];
    }
  }
  return next;
}
function projectionFromRecords(L: Ledger, m: Records, runId: string): SoakProjection {
  const finished = m.finished.find(f => f.runId === runId);
  if (finished) {
    checkedFinished(L, finished);
    return copy(finished.projection);
  }
  return projectionOf(compactDataOf(L, runId).data);
}
function recordHuskSoakSpansImpl(
  L: Ledger, runId: string, spans: HuskSoakSpan[], nowWorldMs: number,
): SoakProjection {
  requireSoak(uint(nowWorldMs) && Array.isArray(spans), 'future-or-unconfirmed-span');
  const m = spanRecords(L);
  if (spans.length === 0) return projectionFromRecords(L, m, runId);
  // Check the shared envelope once. The private mini-ledger commits the same
  // running-only results, while unrelated summaries are never rechecked per span.
  ensureScienceRecords(L);
  const next = spanRecordCopy(m, L);
  let mini: Ledger | undefined;
  let run: Run | undefined;
  let data: CompactData | undefined;
  let changed = false;
  for (const span of spans) {
    requireSoak(uint(span?.confirmedAtWorldMs) && span.confirmedAtWorldMs <= nowWorldMs,
      'future-or-unconfirmed-span');
    const key = canonical(['span', runId, span.recordId]), payload = canonical(span);
    if (replay(next, key, payload, span.confirmedAtWorldMs)) continue;
    if (!mini) {
      const current = compactDataOf(L, runId);
      data = copy(current.data);
      run = { ...current.run, observations: current.run.observations.slice(),
        state: { schema: HUSK_SOAK_WORK.schema, data } };
      mini = {
        world: copy(L.world), seq: L.seq, lots: {}, equipment: {},
        runs: { [runId]: run }, committed: L.committed.slice(),
      };
    }
    appendSpanInPlace(data!, span);
    const req = request(mini, run!, data!,
      runId + ':span:' + JSON.stringify(span.recordId), span.toIslandMs, false);
    const applied = commit(mini, req, result(req, data!, 'running'));
    requireSoak(applied.ok, applied.why ?? 'span-commit-refused');
    remember(next, key, payload, runId, span.confirmedAtWorldMs);
    spanReceiptWindow(next);
    changed = true;
  }
  if (!changed) return projectionFromRecords(L, m, runId);
  // Intermediate checksums are unobservable inside this atomic transaction.
  // The final body and key order are exactly appendSpan's sequential result.
  const { digest: _, ...body } = data!;
  const final = sealData(body);
  run!.state = { schema: HUSK_SOAK_WORK.schema, data: final };
  const answer = projectionOf(final);
  L.world = mini!.world;
  L.committed = mini!.committed;
  L.runs[runId] = run!;
  install(L, next);
  checkedWorlds.set(L, { worldId: L.world.worldId, worldEpoch: L.world.worldEpoch });
  return answer;
}

function takeOutHuskSoakImpl(
  L: Ledger, runId: string, intent: HuskSoakTakeOut, nowWorldMs: number,
): SoakProjection {
  checkTakeOut(intent);
  requireSoak(uint(nowWorldMs) && intent.atWorldMs <= nowWorldMs, 'future-take-out');
  const m = records(L), key = canonical(['take-out', runId, intent.intentId]);
  if (replay(m, key, canonical(intent), intent.atWorldMs)) return projectHuskSoak(L, runId);
  return soakTransaction(L, (draft, next) => {
    const { run, data } = compactDataOf(draft, runId);
    requireSoak(intent.atWorldMs >= Math.max(data.worldAt, data.certifiedAt)
      && intent.atIslandMs >= data.islandAt, 'take-out-precedes-certified-span');
    requireSoak(!otherScienceWorkBusy(draft, intent.actorId, '', HUSK_SOAK_WORK.processId).actor,
      'actor-busy');
    const { digest: _, ...body } = copy(data);
    if (intent.atWorldMs !== data.worldAt || intent.atIslandMs !== data.islandAt) {
      body.historyComplete = 0;
    }
    const d = sealData(body), p = physical(d);
    const outputs = p.certifiedIslandMs > 0 ? splitSoakedHusks(sourceFor(d),
      d.spec.assumptionId, d.totalImmersedMs, {
        runId, fromWorldMs: d.spec.atWorldMs, toWorldMs: intent.atWorldMs,
      }, d.legacyQuality) : [];
    const drawn: SoakProjection['drawn'] = outputs.length && p.drawnWaterMg > 0
      ? [{ materialId: 'sea_water', amount: { value: p.drawnWaterMg, unit: 'mg' }, from: 'water' }]
      : [];
    for (const piece of outputs) {
      requireSoak(!Object.hasOwn(draft.lots, piece.lotId), 'output-lot-id-collision');
      piece.quality.history_complete = d.historyComplete;
      piece.input.soakHistory = copy(d.history);
    }
    const req = request(draft, run, data,
      runId + ':take-out:' + JSON.stringify(intent.intentId), intent.atIslandMs);
    const status = outputs.length ? 'completed' as const : 'stopped' as const;
    const res = result(req, d, status);
    if (outputs.length) {
      res.consumed = [{ lotId: d.source.lotId, amount: copy(d.source.amount) }];
      res.produced = outputs.map(piece => ({
        materialId: piece.input.materialId,
        amount: { value: piece.amountMg, unit: 'mg' },
        into: d.source.location, quality: copy(piece.quality),
      }));
      res.drawn = copy(drawn);
    }
    res.observations = [{
      at: intent.atIslandMs, channel: 'sight',
      text: outputs.length ? '浸けた殻を引き上げた' : '殻を手つかずのまま引き上げた。',
    }];
    const applied = commit(draft, req, res);
    requireSoak(applied.ok, applied.why ?? 'take-out-commit-refused');
    for (let index = 0; index < outputs.length; index++) {
      const generated = applied.produced![index], piece = outputs[index];
      delete draft.lots[generated.lotId];
      draft.lots[piece.lotId] = { ...generated, lotId: piece.lotId };
      next.provenance[piece.lotId] = provenanceOf(piece.input,
        readHuskSoakOrigin(draft.lots[piece.lotId])
          ?? huskSoakOriginForPiece(sourceFor(d), d.totalImmersedMs, index, d.legacyQuality));
    }
    const projection = projectionOf(d, status, outputs, drawn);
    rememberFinished(next, runId, intent.atWorldMs, projection);
    remember(next, key, canonical(intent), runId, intent.atWorldMs);
    delete draft.runs[runId];
    return copy(projection);
  });
}

function mutateSoak<T>(L: Ledger, body: (draft: Ledger) => T): T {
  const draft = copy(L);
  const answer = body(draft);
  Object.assign(L, draft);
  const world = checkedWorlds.get(draft);
  if (world) checkedWorlds.set(L, world);
  return answer;
}
export function beginHuskSoak(
  L: Ledger, spec: HuskSoakStart, nowWorldMs: number,
): { runId: string } {
  return mutateSoak(L, draft => beginHuskSoakImpl(draft, spec, nowWorldMs));
}
/** Atomic ordered batch. It has the exact effects of sequential single-span
 * calls, including individual receipts, frame counters and expiry decisions.
 * An empty batch only reads the current projection.
 */
export function recordHuskSoakSpans(
  L: Ledger, runId: string, spans: HuskSoakSpan[], nowWorldMs: number,
): SoakProjection {
  const target = L as SoakLedger;
  if (target.huskSoakRecordFormat === undefined && target.huskSoakRecords === undefined) {
    const draft = copy(L);
    const answer = recordHuskSoakSpansImpl(draft, runId, spans, nowWorldMs);
    if (spans.length) {
      Object.assign(L, draft);
      const world = checkedWorlds.get(draft);
      if (world) checkedWorlds.set(L, world);
    }
    return answer;
  }
  return recordHuskSoakSpansImpl(L, runId, spans, nowWorldMs);
}
export function recordHuskSoakSpan(
  L: Ledger, runId: string, span: HuskSoakSpan, nowWorldMs: number,
): SoakProjection {
  return recordHuskSoakSpans(L, runId, [span], nowWorldMs);
}

export function takeOutHuskSoak(
  L: Ledger, runId: string, intent: HuskSoakTakeOut, nowWorldMs: number,
): SoakProjection {
  return mutateSoak(L, draft => takeOutHuskSoakImpl(draft, runId, intent, nowWorldMs));
}

/** World-only accounting, never a resident knowledge payload. */
export function projectHuskSoak(L: Ledger, runId: string): SoakProjection {
  return projectionFromRecords(L, spanRecords(L), runId);
}
/** Provenance belongs to live wet lots, not to completed producer runs. */
export function readSoakedHuskInput(L: Ledger, lotId: string): SoakedHuskPiece['input'] {
  const m = records(L), p = Object.hasOwn(m.provenance, lotId) ? m.provenance[lotId] : undefined;
  if (!p) throw new HuskSoakError('unknown-soaked-husk');
  inputMatches(L, lotId, p.input);
  return copy(p.input);
}
/** Return a virtually annotated source; never change a reserved lot's quality. */
export function readHuskResoakSource(L: Ledger, lotId: string): LotView {
  const m = records(L), lot = L.lots[lotId];
  requireSoak(lot && lot.materialId === 'wet_unseparated_coconut_husk',
    'requires-one-unseparated-wet-husk');
  const source = sourceCopy(lot);
  readCoconutHusk(source);
  if (readHuskSoakOrigin(source)) return source;
  const proof = Object.hasOwn(m.provenance, lotId) ? m.provenance[lotId] : undefined;
  if (proof) {
    inputMatches(L, lotId, proof.input);
    return proof.origin ? withHuskSoakOrigin(source, proof.origin) : source;
  }
  return source;
}
/** Validate old representations once, then retain only cumulative state and
 * bounded records. A load itself attests no new waiting interval. */
export function restoreHuskSoak(saved: unknown): Ledger {
  const L = copy(saved) as Ledger;
  requireSoak(L && L.world && L.runs && L.lots && L.equipment, 'invalid-ledger');
  const m = records(L);
  for (const r of Object.values(L.runs)) {
    if (r.processId === HUSK_SOAK_WORK.processId) compactDataOf(L, r.runId);
  }
  trimRecords(m, L);
  return L;
}
/** Public allowlist: no durations, counts, ratios, IDs, quality or recipe. */
export function readHuskSoakWorksite(L: Ledger, runId: string) {
  const p = projectHuskSoak(L, runId), ended = p.status !== 'running';
  const text = ended
    ? (p.outputs.length ? '浸けた殻を引き上げた' : '殻を手つかずのまま引き上げた。')
    : p.drawnWaterMg > 0 ? '殻が水を吸って重くなってきた。'
    : p.initialWaterMg >= 2 * p.dryMg ? '殻は水を含み、重い。' : 'まだ硬く、乾いている。';
  return {
    title: '潮だまりの殻',
    stage: ended ? '引き上げた' : '水に浸けている',
    activity: ended ? 'completed' as const : 'waiting' as const,
    materialsReserved: !ended,
    operatorFree: true as const,
    observations: [{ channel: 'sight' as const, text }],
  };
}
export interface HuskWorkAttempt {
  kind: 'executor-confirmed-husk-attempt';
  actorId: string;
  lotId: string;
  presence: Presence;
  attempted: boolean;
  atWorldMs: number;
  confirmedAtWorldMs: number;
}

/** Translate only the accepted core's water refusal after a certified onsite
 * trial. The machine-facing exception and accepted hand-work code stay intact.
 */
export function huskWorkFailureObservations(
  error: unknown,
  attempt: HuskWorkAttempt | undefined,
  nowWorldMs: number,
): Observation[] {
  const waterRefusal = error instanceof Error
    && error.message === 'manual husk: assumption has insufficient input water for this recipe';
  if (!waterRefusal || !attempt || attempt.kind !== 'executor-confirmed-husk-attempt'
    || !id(attempt.actorId) || !id(attempt.lotId) || attempt.presence !== 'here'
    || attempt.attempted !== true || !uint(attempt.atWorldMs)
    || !uint(attempt.confirmedAtWorldMs) || !uint(nowWorldMs)
    || attempt.confirmedAtWorldMs < attempt.atWorldMs
    || attempt.confirmedAtWorldMs > nowWorldMs) return [];
  return [{ at: attempt.atWorldMs, channel: 'touch', text: '殻が硬く、ほぐれない' }];
}
