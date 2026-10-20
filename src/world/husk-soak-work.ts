import type { Ledger, Run } from './process-runner';
import { commit, startRun } from './process-runner';
import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from './science-contract';
import { otherScienceWorkBusy } from './science-work-occupancy';
import {
  HUSK_SOAK_ASSUMPTION, computeHuskSoak, readCoconutHusk, splitSoakedHusks,
  readHuskSoakOrigin, withHuskSoakOrigin, huskSoakOriginForPiece,
  type SoakedHuskPiece, type HuskSoakOrigin,
} from '../science/prototypes/husk-soak';

export const HUSK_SOAK_WORK = Object.freeze({
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

function dataOf(L: Ledger, runId: string): { run: Run; data: SoakData } {
  const r = L.runs[runId];
  const legacy = r?.processVersion === LEGACY_VERSION && r.state?.schema === LEGACY_SCHEMA;
  requireSoak(r && r.processId === HUSK_SOAK_WORK.processId
    && (legacy || r.processVersion === HUSK_SOAK_WORK.processVersion)
    && r.catalogVersion === HUSK_SOAK_WORK.catalogVersion
    && r.contract === HUSK_SOAK_WORK.contract && r.clock === 'island'
    && (legacy || r.state?.schema === HUSK_SOAK_WORK.schema), 'unsupported-soak-run-or-state');
  const saved = r.state!.data as SoakData;
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

function transaction<T>(L: Ledger, body: (draft: Ledger) => T): T {
  const draft = copy(L);
  const result = body(draft);
  Object.assign(L, draft);
  return result;
}

/** Authoritative host intent: source has already been placed at the tide pool.
 * Waiting holds the site and lot, never the resident's continuous activity.
 */
export function beginHuskSoak(
  L: Ledger,
  spec: HuskSoakStart,
  nowWorldMs: number,
): { runId: string } {
  requireSoak(uint(nowWorldMs) && uint(spec?.atWorldMs)
    && spec.atWorldMs <= nowWorldMs, 'future-or-invalid-start');
  for (const r of Object.values(L.runs)) {
    if (r.processId === HUSK_SOAK_WORK.processId
      && (r.state?.data as SoakData)?.spec?.commandId === spec.commandId) {
      const old = dataOf(L, r.runId);
      requireSoak(canonical(old.data.spec) === canonical(spec), 'conflicting-start-replay');
      return { runId: r.runId };
    }
  }
  return transaction(L, draft => {
    const lot = draft.lots[spec.lotId];
    requireSoak(lot && !lot.reservedBy, 'missing-or-reserved-husk');
    const source = sourceCopy(lot);
    let origin: HuskSoakOrigin | null = null;
    let previousHistory: SoakedHuskPiece['input']['soakHistory'] = [];
    if (source.materialId === 'wet_unseparated_coconut_husk') {
      try {
        previousHistory = readSoakedHuskInput(draft, source.lotId).soakHistory;
      } catch (error) {
        requireSoak(error instanceof HuskSoakError && error.code === 'unknown-soaked-husk',
          'changed-or-missing-soaked-husk');
      }
      origin = readHuskSoakOrigin(readHuskResoakSource(draft, source.lotId));
    }
    checkStart(spec, source);
    const busy = otherScienceWorkBusy(draft, spec.actorId, spec.site.locationId,
      HUSK_SOAK_WORK.processId);
    requireSoak(!busy.actor && !busy.site, 'other-science-work-busy');
    for (const r of Object.values(draft.runs)) {
      if (r.processId === HUSK_SOAK_WORK.processId && r.status === 'running') {
        requireSoak(dataOf(draft, r.runId).data.spec.site.locationId
          !== spec.site.locationId, 'tide-pool-reserved');
      }
    }
    const started = startRun(draft, {
      processId: HUSK_SOAK_WORK.processId, processVersion: HUSK_SOAK_WORK.processVersion,
      catalogVersion: HUSK_SOAK_WORK.catalogVersion, contract: HUSK_SOAK_WORK.contract,
      clock: 'island', lotIds: [source.lotId], equipmentIds: [], operator: spec.actorId,
    }, spec.atWorldMs);
    requireSoak(started.run, 'reservation-refused');
    const r = started.run;
    r.lastTo = spec.atIslandMs;
    r.status = 'running';
    r.state = {
      schema: HUSK_SOAK_WORK.schema,
      data: rebuild(draft.world.worldId, draft.world.worldEpoch, r.runId, spec, source, [], null,
        previousHistory, false, origin),
    };
    return { runId: r.runId };
  });
}

function request(L: Ledger, r: Run, d: SoakData, requestId: string, to: number): ScienceStepRequest {
  return {
    contract: r.contract, requestId, world: copy(L.world), runId: r.runId,
    processId: r.processId, processVersion: r.processVersion, catalogVersion: r.catalogVersion,
    interval: { from: r.lastTo, to }, state: copy(r.state),
    environment: { sampleId: 'env:husk-soak-unused', source: 'unknown', effectiveAt: r.lastTo },
    lots: [copy(d.source)], equipment: [], energy: [], actions: [], seed: r.seed,
  };
}

function result(
  req: ScienceStepRequest,
  d: SoakData,
  status: ScienceStepResult['status'],
): ScienceStepResult {
  return {
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: copy(req.interval), state: { schema: req.state?.schema ?? HUSK_SOAK_WORK.schema, data: d }, status,
    consumed: [], produced: [], released: [], drawn: [], energy: [], equipmentWear: [],
    observations: [],
    evidence: {
      evaluatorVersion: HUSK_SOAK_WORK.processVersion, sourceRefs: [],
      notes: '仮定（キメ値）; ' + HUSK_SOAK_ASSUMPTION.id
        + '; only host-confirmed submersion; sea water mass only, salt not modelled',
    },
  };
}

export function recordHuskSoakSpan(
  L: Ledger,
  runId: string,
  span: HuskSoakSpan,
  nowWorldMs: number,
) {
  const old = dataOf(L, runId);
  requireSoak(uint(nowWorldMs) && uint(span?.confirmedAtWorldMs)
    && span.confirmedAtWorldMs <= nowWorldMs, 'future-or-unconfirmed-span');
  const previous = old.data.frames.find(f => f.recordId === span.recordId);
  if (previous) {
    requireSoak(canonical(previous) === canonical(span), 'conflicting-span-replay');
    return projectHuskSoak(L, runId);
  }
  requireSoak(!old.data.takeOut, 'soak-already-ended');
  transaction(L, draft => {
    const { run: r, data: d } = dataOf(draft, runId);
    const next = rebuild(d.worldId, d.worldEpoch, runId, d.spec, d.source,
      [...d.frames, copy(span)], null, d.previousHistory ?? [],
      r.state!.schema === LEGACY_SCHEMA, d.origin ?? null);
    const req = request(draft, r, d, runId + ':span:' + JSON.stringify(span.recordId),
      span.toIslandMs);
    const applied = commit(draft, req, result(req, next, 'running'));
    requireSoak(applied.ok, applied.why ?? 'span-commit-refused');
  });
  return projectHuskSoak(L, runId);
}

export function takeOutHuskSoak(
  L: Ledger,
  runId: string,
  intent: HuskSoakTakeOut,
  nowWorldMs: number,
) {
  checkTakeOut(intent);
  requireSoak(uint(nowWorldMs) && intent.atWorldMs <= nowWorldMs, 'future-take-out');
  const old = dataOf(L, runId);
  if (old.data.takeOut) {
    requireSoak(canonical(old.data.takeOut) === canonical(intent), 'conflicting-take-out-replay');
    return projectHuskSoak(L, runId);
  }
  transaction(L, draft => {
    const { run: r, data: d } = dataOf(draft, runId);
    requireSoak(!otherScienceWorkBusy(draft, intent.actorId, '', HUSK_SOAK_WORK.processId).actor,
      'actor-busy');
    const next = rebuild(d.worldId, d.worldEpoch, runId, d.spec, d.source, d.frames, intent,
      d.previousHistory ?? [], r.state!.schema === LEGACY_SCHEMA, d.origin ?? null);
    for (const p of next.outputs) {
      requireSoak(!Object.hasOwn(draft.lots, p.lotId), 'output-lot-id-collision');
    }
    const req = request(draft, r, d, runId + ':take-out:' + JSON.stringify(intent.intentId),
      intent.atIslandMs);
    const res = result(req, next, next.outputs.length ? 'completed' : 'stopped');
    if (next.outputs.length) {
      res.consumed = [{ lotId: d.source.lotId, amount: copy(d.source.amount) }];
      res.produced = next.outputs.map(p => ({
        materialId: p.input.materialId, amount: { value: p.amountMg, unit: 'mg' },
        into: d.source.location, quality: copy(p.quality),
      }));
      res.drawn = copy(next.drawn);
    }
    res.observations = [{
      at: intent.atIslandMs, channel: 'sight',
      text: next.outputs.length ? '浸けた殻を引き上げた' : '殻を手つかずのまま引き上げた。',
    }];
    const applied = commit(draft, req, res);
    requireSoak(applied.ok, applied.why ?? 'take-out-commit-refused');
    // The shared runner owns atomic settlement. Re-key only these new products
    // inside the same transaction; do not change its allocator or other runs.
    for (let index = 0; index < next.outputs.length; index += 1) {
      const generated = applied.produced![index];
      const stableId = next.outputs[index].lotId;
      delete draft.lots[generated.lotId];
      draft.lots[stableId] = { ...generated, lotId: stableId };
    }
    dataOf(draft, runId);
  });
  return projectHuskSoak(L, runId);
}

/** World-only accounting, never a resident knowledge payload. */
export function projectHuskSoak(L: Ledger, runId: string) {
  const { run, data: d } = dataOf(L, runId);
  return {
    status: run.status,
    ...computeHuskSoak(d.origin ? withHuskSoakOrigin(d.source, d.origin) : d.source,
      d.spec.assumptionId, d.totalImmersedMs),
    pendingIslandMs: d.totalImmersedMs % HUSK_SOAK_ASSUMPTION.quantumMs,
    historyComplete: d.historyComplete,
    outputs: copy(d.outputs),
    drawn: copy(d.drawn),
  };
}

/** Provenance travels outside numeric quality, in this run's existing ledger
 * state. Moving the resulting lot does not erase its recorded soaking history.
 */
export function readSoakedHuskInput(L: Ledger, lotId: string): SoakedHuskPiece['input'] {
  for (const r of Object.values(L.runs)) {
    if (r.processId !== HUSK_SOAK_WORK.processId) continue;
    const d = dataOf(L, r.runId).data;
    const piece = d.outputs.find(p => p.lotId === lotId);
    if (!piece) continue;
    const lot = L.lots[lotId];
    requireSoak(lot && lot.materialId === piece.input.materialId
      && lot.amount.unit === 'mg' && lot.amount.value === piece.amountMg
      && canonical(lot.quality) === canonical(piece.quality), 'changed-or-missing-soaked-husk');
    return copy(piece.input);
  }
  throw new HuskSoakError('unknown-soaked-husk');
}

/** A read-only bridge for old wet lots whose original uptake clock lived in a
 * completed run. C's save compaction must retain this carry before deleting it.
 */
export function readHuskResoakSource(L: Ledger, lotId: string): LotView {
  const lot = L.lots[lotId];
  requireSoak(lot && lot.materialId === 'wet_unseparated_coconut_husk',
    'requires-one-unseparated-wet-husk');
  const source = sourceCopy(lot);
  readCoconutHusk(source);
  if (readHuskSoakOrigin(source)) return source;
  for (const r of Object.values(L.runs)) {
    if (r.processId !== HUSK_SOAK_WORK.processId) continue;
    const d = dataOf(L, r.runId).data;
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

/** A save/load alone never attests submersion or advances the island clock. */
export function restoreHuskSoak(saved: unknown): Ledger {
  const L = copy(saved) as Ledger;
  requireSoak(L && L.world && L.runs && L.lots && L.equipment, 'invalid-ledger');
  for (const r of Object.values(L.runs)) {
    if (r.processId === HUSK_SOAK_WORK.processId) dataOf(L, r.runId);
  }
  return L;
}

/** Public allowlist: no durations, counts, ratios, IDs, quality or recipe. */
export function readHuskSoakWorksite(L: Ledger, runId: string) {
  const { data: d } = dataOf(L, runId);
  const p = computeHuskSoak(d.origin ? withHuskSoakOrigin(d.source, d.origin) : d.source,
    d.spec.assumptionId, d.totalImmersedMs);
  const text = d.takeOut
    ? (d.outputs.length ? '浸けた殻を引き上げた' : '殻を手つかずのまま引き上げた。')
    : p.drawnWaterMg > 0 ? '殻が水を吸って重くなってきた。'
    : p.initialWaterMg >= 2 * p.dryMg ? '殻は水を含み、重い。' : 'まだ硬く、乾いている。';
  return {
    title: '潮だまりの殻',
    stage: d.takeOut ? '引き上げた' : '水に浸けている',
    activity: d.takeOut ? 'completed' as const : 'waiting' as const,
    materialsReserved: d.takeOut === null,
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
