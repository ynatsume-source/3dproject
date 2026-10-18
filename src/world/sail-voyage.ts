/** World-only sail voyage entry. A confirmed cell folds once; no clock is read here. */
import {
  startRun, disassembleParts, type Ledger, type Run,
} from './process-runner';
import type { LotView } from './science-contract';
import {
  createSailRaftVoyage, type VoyageContext, type SailCellV2, type SailVoyageCheckpoint,
} from '../science/prototypes/sail-raft-voyage';
import {
  sailAssumptionId, canonical, copy, id, uint, shape,
} from '../science/prototypes/sail-raft-rules';
import type { RaftHull, SailRig } from '../science/prototypes/sail-raft-manufacturing';
import type { CoirPiece } from '../science/prototypes/coir-cord-types';
import { COIR_CORD_ASSUMPTION_ID } from '../science/prototypes/coir-cord-types';
import {
  readSailMat, readBambooMast, readSailHistory, writeSailMat,
  writeBambooMast,
} from './sail-lots';
import { sailRigParts } from './sail-rig-parts';
import { readCordPiece } from './coir-cord-lots';
import { applyCordVoyageSummary } from './sail-cord-settlement';
import type { CordLoadLedger } from './coir-cord-load';
import { otherScienceWorkBusy } from './science-work-occupancy';

export const SAIL_VOYAGE = Object.freeze({
  processId: 'prototype_sail_voyage',
  version: 'host-1',
  schema: 'civ-world.sail-voyage/1',
  ledgerSchema: 'civ-world.sail-voyages/1',
  cellWorldMs: 30_000,
  receiptLimit: 64,
});
export interface SailCellInput {
  cellId: string;
  fromWorldMs: number;
  toWorldMs: number;
  fromIslandMs: number;
  toIslandMs: number;
  windMmS: number | null;
  windToDeg: number | null;
  gustMmS: number | null;
  headingDeg: number;
  rain: boolean | null;
  sailUp: boolean;
}
export interface SailVoyageView {
  eastMm: number;
  northMm: number;
  sailUp: boolean;
  matTorn: boolean;
  mastBroken: boolean;
  cordBroken: boolean;
  moving: boolean;
}
export interface SailVoyageResult {
  rigEquipmentId: string | null;
  lotIds: string[];
  eastMm: number;
  northMm: number;
  observations: string[];
}
export interface BeginSailVoyage {
  commandId: string;
  rigEquipmentId: string;
  hull: RaftHull;
  actorId: string;
  presence: 'here';
  atWorldMs: number;
  atIslandMs: number;
}
export interface ResumeSailVoyage {
  commandId: string;
  actorId: string;
  presence: 'here';
  atWorldMs: number;
  atIslandMs: number;
}
export interface SettleSailVoyage {
  commandId: string;
  actorId: string;
  atWorldMs: number;
  reason: 'arrived' | 'turned' | 'interrupted';
}
type Checkpoint = SailVoyageCheckpoint;
type Model = ReturnType<typeof model>;
interface CellReceipt {
  values: string;
  words: number[];
}
interface Data {
  assumptionId: string;
  openedAtWorldMs: number;
  openedAtIslandMs: number;
  hull: RaftHull;
  equipmentFingerprint: number;
  checkpoint: Checkpoint;
  paused: boolean;
  nextWorldMs: number;
  nextIslandMs: number;
  nextCell: number;
  cells: CellReceipt[];
  vocabulary: string[];
  digest: number;
}
interface CommandReceipt {
  commandId: string;
  atWorldMs: number;
  payload: string;
  runId: string;
  result: SailVoyageResult | null;
}
interface Store {
  schema: string;
  worldId: string;
  worldEpoch: string;
  authorityAtWorldMs: number;
  floorWorldMs: number | null;
  recent: CommandReceipt[];
  cordUseMs: Record<string, { assumptionId: string; milliseconds: number }>;
}
export type SailVoyageLedger = CordLoadLedger & {
  sailVoyageFormat?: string;
  sailVoyages?: Store;
};
export class SailVoyageError extends Error {
  constructor(readonly code: string) {
    super('The sail voyage instruction is not applicable.');
    this.name = 'SailVoyageError';
  }
}
function need(value: unknown, code: string): asserts value {
  if (!value) throw new SailVoyageError(code);
}
function object(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
const has = (v: object, key: string) => Object.hasOwn(v, key);
function put<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, {
    value, enumerable: true, writable: true, configurable: true,
  });
}
/** Accidental-corruption checksum, not a signature or a security boundary. */
function fingerprint(v: unknown): number {
  const text = canonical(v);
  let hash = 2166136261;
  for (let n = 0; n < text.length; n++) {
    hash = Math.imul(hash ^ text.charCodeAt(n), 16777619) >>> 0;
  }
  return hash;
}
function dataFingerprint(d: Data): number {
  const { digest: _, ...body } = d;
  return fingerprint(body);
}
function seal(d: Data): Data {
  d.digest = dataFingerprint(d);
  return d;
}
function base(L: SailVoyageLedger): void {
  need(object(L) && object(L.world) && id(L.world.worldId)
    && id(L.world.worldEpoch) && uint(L.world.worldVersion)
    && uint(L.seq) && object(L.lots) && object(L.equipment)
    && object(L.runs) && Array.isArray(L.committed), 'corrupt-ledger');
}
function fresh(L: Ledger): Store {
  return {
    schema: SAIL_VOYAGE.ledgerSchema, worldId: L.world.worldId,
    worldEpoch: L.world.worldEpoch, authorityAtWorldMs: 0,
    floorWorldMs: null, recent: [], cordUseMs: {},
  };
}
function storeOf(L: SailVoyageLedger): Store {
  base(L);
  const s = L.sailVoyages;
  if (!s) {
    need(L.sailVoyageFormat === undefined
      && !Object.values(L.runs).some(r => r.processId === SAIL_VOYAGE.processId),
    'missing-voyage-ledger');
    return fresh(L);
  }
  need(shape(s, ['schema', 'worldId', 'worldEpoch', 'authorityAtWorldMs',
    'floorWorldMs', 'recent', 'cordUseMs'])
    && s.schema === SAIL_VOYAGE.ledgerSchema
    && L.sailVoyageFormat === SAIL_VOYAGE.ledgerSchema
    && s.worldId === L.world.worldId && s.worldEpoch === L.world.worldEpoch
    && uint(s.authorityAtWorldMs) && (s.floorWorldMs === null || uint(s.floorWorldMs))
    && Array.isArray(s.recent) && s.recent.length <= SAIL_VOYAGE.receiptLimit
    && object(s.cordUseMs), 'unsupported-or-corrupt-voyage-ledger');
  const ids = new Set<string>();
  let previous = s.floorWorldMs ?? 0;
  for (const r of s.recent) {
    need(shape(r, ['commandId', 'atWorldMs', 'payload', 'runId', 'result'])
      && id(r.commandId) && !ids.has(r.commandId) && id(r.runId)
      && typeof r.payload === 'string' && uint(r.atWorldMs)
      && r.atWorldMs >= previous && r.atWorldMs <= s.authorityAtWorldMs
      && (r.result === null || resultOk(r.result)), 'corrupt-command-receipt');
    previous = r.atWorldMs;
    ids.add(r.commandId);
  }
  return s;
}
function resultOk(r: unknown): r is SailVoyageResult {
  return shape(r, ['rigEquipmentId', 'lotIds', 'eastMm', 'northMm', 'observations'])
    && (r.rigEquipmentId === null || id(r.rigEquipmentId))
    && Array.isArray(r.lotIds) && r.lotIds.every(id)
    && Number.isSafeInteger(r.eastMm) && Number.isSafeInteger(r.northMm)
    && Array.isArray(r.observations) && r.observations.every(x => typeof x === 'string');
}
function install(L: SailVoyageLedger, s: Store): void {
  L.sailVoyageFormat = SAIL_VOYAGE.ledgerSchema;
  L.sailVoyages = s;
}
function prior(s: Store, commandId: string, payload: string, atMs: number) {
  const r = s.recent.find(x => x.commandId === commandId);
  if (r) {
    need(r.payload === payload, 'conflicting-command-replay');
    return r;
  }
  need(s.floorWorldMs === null || atMs > s.floorWorldMs, 'expired-command');
  return null;
}
function remember(s: Store, q: { commandId: string; atWorldMs: number },
  payload: string, runId: string, result: SailVoyageResult | null): void {
  s.authorityAtWorldMs = Math.max(s.authorityAtWorldMs, q.atWorldMs);
  s.recent.push({
    commandId: q.commandId, atWorldMs: q.atWorldMs, payload, runId,
    result: copy(result),
  });
  if (s.recent.length > SAIL_VOYAGE.receiptLimit) {
    s.floorWorldMs = s.recent.shift()!.atWorldMs;
  }
}
function equipmentBody(e: Ledger['equipment'][string]): number {
  return fingerprint([e.equipmentId, e.kind, e.catalogEntry,
    e.catalogVersion, e.condition, e.params, e.assembled]);
}
function originalRig(L: SailVoyageLedger, r: Run, d: Data): SailRig {
  need(r.equipmentIds.length === 1, 'corrupt-equipment-list');
  const e = L.equipment[r.equipmentIds[0]];
  need(e && e.reservedBy === r.runId && e.kind === 'sail_rig'
    && e.assembled?.parts && equipmentBody(e) === d.equipmentFingerprint,
  'lost-or-changed-rig');
  const parts = e.assembled.parts;
  need(parts.length >= 3, 'missing-rig-parts');
  const cords = parts.slice(2).map(readCordPiece);
  return {
    lotId: e.equipmentId, material: 'sail_raft', hull: copy(d.hull),
    mat: readSailMat(parts[0]), mast: readBambooMast(parts[1]), cords,
    cordUseRemainders: cords.map((p, i) => ({
      lotId: p.lotId, worldMs: e.params['cord_use_ms_' + i] ?? 0,
    })),
  };
}
function context(L: Ledger, r: Run, d: Data): VoyageContext {
  return {
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId: r.runId,
    seed: r.seed, openedAtWorldMs: d.openedAtWorldMs,
    openedAtIslandMs: d.openedAtIslandMs,
  };
}
function model(L: SailVoyageLedger, r: Run, d: Data) {
  return createSailRaftVoyage(originalRig(L, r, d),
    d.assumptionId as ReturnType<typeof sailAssumptionId>, context(L, r, d));
}
function raw(L: SailVoyageLedger, runId: string): { r: Run; d: Data; m: Model } {
  const r = has(L.runs, runId) ? L.runs[runId] : undefined;
  const d = r?.state?.data as Data;
  need(r && r.runId === runId && r.processId === SAIL_VOYAGE.processId
    && r.processVersion === SAIL_VOYAGE.version && r.state?.schema === SAIL_VOYAGE.schema
    && ['starting', 'running'].includes(r.status)
    && r.clock === 'world' && r.contract === '0.2.1' && r.catalogVersion === 'civ-sci-test-2'
    && r.lotIds.length === 0 && id(r.operator)
    && uint(r.seed) && d && shape(d, ['assumptionId', 'openedAtWorldMs',
      'openedAtIslandMs', 'hull', 'equipmentFingerprint', 'checkpoint',
      'paused', 'nextWorldMs', 'nextIslandMs', 'nextCell', 'cells', 'vocabulary', 'digest'])
    && d.assumptionId === sailAssumptionId()
    && uint(d.openedAtWorldMs) && uint(d.openedAtIslandMs)
    && uint(d.equipmentFingerprint) && typeof d.paused === 'boolean'
    && uint(d.nextWorldMs) && uint(d.nextIslandMs) && uint(d.nextCell)
    && Array.isArray(d.cells) && d.cells.length <= SAIL_VOYAGE.receiptLimit
    && d.cells.length <= d.nextCell && Array.isArray(d.vocabulary)
    && d.vocabulary.length <= 32 && d.vocabulary.every(x => typeof x === 'string')
    && uint(d.digest) && d.digest === dataFingerprint(d), 'corrupt-or-unsupported-voyage');
  for (const receipt of d.cells) {
    need(shape(receipt, ['values', 'words']) && typeof receipt.values === 'string'
      && /^[0-9a-z,-]+$/.test(receipt.values)
      && receipt.values.split(',').length === 9 && Array.isArray(receipt.words)
      && receipt.words.every(n => uint(n) && n < d.vocabulary.length), 'corrupt-cell-receipt');
  }
  const m = model(L, r, d);
  m.restoreCheckpoint(d.checkpoint);
  need(d.checkpoint.cellCount === d.nextCell
    && d.checkpoint.nextWorldMs <= d.nextWorldMs
    && d.checkpoint.nextIslandMs <= d.nextIslandMs, 'changed-cell-cursor');
  need(r.lastTo === d.nextWorldMs, 'changed-run-clock');
  return { r, d, m };
}
function cellValues(c: SailCellInput): string {
  // Lossless base36, not a hash: the last 64 exact inputs fit without a cell history.
  return [c.fromWorldMs, c.fromIslandMs, c.toIslandMs, c.windMmS ?? -1,
    c.windToDeg ?? -1, c.gustMmS ?? -1, c.headingDeg,
    c.rain === null ? -1 : c.rain ? 1 : 0, c.sailUp ? 1 : 0]
    .map(n => n.toString(36)).join(',');
}
function cellNumber(runId: string, cellId: string): number {
  need(cellId.startsWith(runId + ':'), 'invalid-cell-id');
  const suffix = cellId.slice(runId.length + 1);
  need(/^(0|[1-9][0-9]*)$/.test(suffix), 'invalid-cell-id');
  const n = Number(suffix);
  need(uint(n), 'invalid-cell-id');
  return n;
}
function confirmedCell(c: SailCellInput, now: number): void {
  need(shape(c, ['cellId', 'fromWorldMs', 'toWorldMs', 'fromIslandMs',
    'toIslandMs', 'windMmS', 'windToDeg', 'gustMmS', 'headingDeg', 'rain', 'sailUp'])
    && id(c.cellId) && uint(c.fromWorldMs) && uint(c.toWorldMs)
    && c.toWorldMs - c.fromWorldMs === SAIL_VOYAGE.cellWorldMs
    && uint(c.fromIslandMs) && uint(c.toIslandMs) && c.toIslandMs > c.fromIslandMs
    && uint(now) && c.toWorldMs <= now && uint(c.headingDeg) && c.headingDeg < 360
    && typeof c.sailUp === 'boolean'
    && (c.windMmS === null || uint(c.windMmS))
    && (c.windToDeg === null || uint(c.windToDeg) && c.windToDeg < 360)
    && (c.gustMmS === null || uint(c.gustMmS))
    && (c.rain === null || typeof c.rain === 'boolean'), 'invalid-or-unconfirmed-cell');
}
function wordsOf(d: Data, receipt: CellReceipt): string[] {
  return receipt.words.map(n => d.vocabulary[n]);
}
function addCellReceipt(d: Data, c: SailCellInput, words: string[]): void {
  const indices = words.map(text => {
    let n = d.vocabulary.indexOf(text);
    if (n < 0) {
      need(d.vocabulary.length < 32, 'observation-vocabulary-overflow');
      n = d.vocabulary.push(text) - 1;
    }
    return n;
  });
  d.cells.push({ values: cellValues(c), words: indices });
  if (d.cells.length > SAIL_VOYAGE.receiptLimit) d.cells.shift();
}
function commandContext(q: { commandId: string; actorId: string; atWorldMs: number }): void {
  need(id(q.commandId) && id(q.actorId) && uint(q.atWorldMs), 'invalid-command');
}
function atomic<T>(L: SailVoyageLedger, f: (draft: SailVoyageLedger) => T): T {
  // Begin/settle/restore boundaries may validate the wider ledger. Per-cell calls never clone it.
  const draft = copy(L);
  const answer = f(draft);
  Object.assign(L, draft);
  return answer;
}
export function beginSailVoyage(L: SailVoyageLedger, q: BeginSailVoyage): { runId: string } {
  need(shape(q, ['commandId', 'rigEquipmentId', 'hull', 'actorId',
    'presence', 'atWorldMs', 'atIslandMs']), 'invalid-begin');
  commandContext(q);
  need(q.presence === 'here' && id(q.rigEquipmentId) && uint(q.atIslandMs), 'unconfirmed-presence');
  const s = storeOf(L), payload = canonical(['begin', q]);
  const old = prior(s, q.commandId, payload, q.atWorldMs);
  if (old) return { runId: old.runId };
  need(q.atWorldMs >= s.authorityAtWorldMs, 'backdated-command');
  return atomic(L, draft => {
    const next = copy(storeOf(draft));
    const e = draft.equipment[q.rigEquipmentId];
    need(e && !e.reservedBy && e.kind === 'sail_rig' && e.assembled?.parts,
      'missing-or-reserved-rig');
    need(!otherScienceWorkBusy(draft, q.actorId, '', SAIL_VOYAGE.processId).actor,
      'actor-busy');
    for (const r of Object.values(draft.runs)) {
      need(r.processId !== SAIL_VOYAGE.processId || r.operator !== q.actorId
        || (r.state?.data as Data)?.paused === true, 'actor-already-aboard');
    }
    const parts = e.assembled.parts;
    const T = sailRigParts(parts.length - 2, parts.slice(2).map(p => p.materialId as CoirPiece['material']));
    need(e.assembled.table === T.version, 'unsupported-rig-table');
    T.toParams(parts);
    parts.slice(2).forEach((p, i) => {
      const previous = has(next.cordUseMs, p.lotId) ? next.cordUseMs[p.lotId] : null;
      need(previous === null || shape(previous, ['assumptionId', 'milliseconds'])
        && typeof previous.assumptionId === 'string' && uint(previous.milliseconds),
      'invalid-cord-use-remainder');
      const stored = previous?.milliseconds ?? e.params['cord_use_ms_' + i] ?? 0;
      need(uint(stored) && stored < 3_600_000, 'invalid-cord-use-remainder');
      need(!previous || previous.assumptionId === sailAssumptionId() || stored === 0,
        'incompatible-cord-use-clock');
      e.params['cord_use_ms_' + i] = stored;
    });
    const begun = startRun(draft, {
      processId: SAIL_VOYAGE.processId, processVersion: SAIL_VOYAGE.version,
      catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'world',
      lotIds: [], equipmentIds: [q.rigEquipmentId], operator: q.actorId,
    }, q.atWorldMs);
    need(begun.run, 'reservation-refused');
    const r = begun.run;
    r.lastTo = q.atWorldMs;
    const d: Data = {
      assumptionId: sailAssumptionId(), openedAtWorldMs: q.atWorldMs,
      openedAtIslandMs: q.atIslandMs, hull: copy(q.hull),
      equipmentFingerprint: equipmentBody(e), checkpoint: null as unknown as Checkpoint,
      paused: false, nextWorldMs: q.atWorldMs, nextIslandMs: q.atIslandMs,
      nextCell: 0, cells: [], vocabulary: [], digest: 0,
    };
    d.checkpoint = model(draft, r, d).startCheckpoint();
    r.state = { schema: SAIL_VOYAGE.schema, data: seal(d) };
    remember(next, q, payload, r.runId, null);
    install(draft, next);
    return { runId: r.runId };
  });
}
export function recordSailCell(
  L: SailVoyageLedger, runId: string, cell: SailCellInput, nowWorldMs: number,
): { observations: string[] } {
  confirmedCell(cell, nowWorldMs);
  const s = storeOf(L), { r, d, m } = raw(L, runId);
  const n = cellNumber(runId, cell.cellId);
  if (n < d.nextCell) {
    const first = d.nextCell - d.cells.length;
    need(n >= first, 'expired-cell');
    const receipt = d.cells[n - first];
    need(receipt.values === cellValues(cell), 'conflicting-cell-replay');
    return { observations: wordsOf(d, receipt) };
  }
  need(n === d.nextCell && !d.paused, 'paused-or-out-of-order-cell');
  need(cell.fromWorldMs === d.nextWorldMs && cell.fromIslandMs === d.nextIslandMs,
    'unconfirmed-cell-gap');
  const complete: SailCellV2 = {
    ...copy(cell), worldId: L.world.worldId, worldEpoch: L.world.worldEpoch,
    runId, aboard: true, confirmedAtWorldMs: nowWorldMs,
  };
  const cp = m.step(d.checkpoint, complete);
  const observations = m.observeCheckpoint(cp);
  const next = copy(d);
  next.checkpoint = cp;
  next.nextWorldMs = cell.toWorldMs;
  next.nextIslandMs = cell.toIslandMs;
  next.nextCell++;
  need(uint(next.nextCell) && uint(L.world.worldVersion + 1), 'integer-overflow');
  addCellReceipt(next, cell, observations);
  seal(next);
  // Every operation that may refuse is above this atomic target-only patch.
  r.state = { schema: SAIL_VOYAGE.schema, data: next };
  r.status = 'running';
  r.lastTo = cell.toWorldMs;
  s.authorityAtWorldMs = Math.max(s.authorityAtWorldMs, cell.toWorldMs);
  install(L, s);
  L.world.worldVersion++;
  return { observations: [...observations] };
}
export function resumeSailVoyage(L: SailVoyageLedger, runId: string, q: ResumeSailVoyage): void {
  need(shape(q, ['commandId', 'actorId', 'presence', 'atWorldMs', 'atIslandMs']), 'invalid-resume');
  commandContext(q);
  need(q.presence === 'here' && uint(q.atIslandMs), 'unconfirmed-presence');
  const s = storeOf(L), payload = canonical(['resume', runId, q]);
  if (prior(s, q.commandId, payload, q.atWorldMs)) return;
  const { r, d } = raw(L, runId);
  need(d.paused && r.operator === q.actorId, 'not-this-paused-voyage');
  need(q.atWorldMs >= s.authorityAtWorldMs && q.atWorldMs >= d.nextWorldMs
    && q.atIslandMs >= d.nextIslandMs, 'backdated-resume');
  need(!otherScienceWorkBusy(L, q.actorId, '', SAIL_VOYAGE.processId).actor, 'actor-busy');
  for (const other of Object.values(L.runs)) {
    need(other.runId === runId || other.processId !== SAIL_VOYAGE.processId
      || other.operator !== q.actorId || (other.state?.data as Data)?.paused === true,
    'actor-already-aboard');
  }
  const next = copy(d), meta = copy(s);
  next.paused = false;
  next.nextWorldMs = q.atWorldMs;
  next.nextIslandMs = q.atIslandMs;
  seal(next);
  remember(meta, q, payload, runId, null);
  r.state = { schema: SAIL_VOYAGE.schema, data: next };
  r.lastTo = q.atWorldMs;
  install(L, meta);
}
export function readSailVoyage(L: SailVoyageLedger, runId: string): SailVoyageView {
  storeOf(L);
  const { d, m } = raw(L, runId), p = m.projectCheckpoint(d.checkpoint);
  return {
    eastMm: p.distance.eastMm, northMm: p.distance.northMm,
    sailUp: p.last?.sailUp ?? false, matTorn: p.rig.mat.torn,
    mastBroken: p.rig.mast.broken, cordBroken: p.broken.some(b => b.part === 'cord'),
    moving: !!p.last && p.last.speedMmS > 0,
  };
}
export function readSailVoyageObservations(L: SailVoyageLedger, runId: string): string[] {
  storeOf(L);
  const { d, m } = raw(L, runId);
  return [...m.observeCheckpoint(d.checkpoint)];
}
function producedLot(original: LotView, produced: {
  materialId: string; amount: { value: number; unit: string };
  quality?: Record<string, number>; into?: string;
}): LotView {
  return {
    lotId: original.lotId, materialId: produced.materialId,
    amount: { value: produced.amount.value, unit: 'mg' },
    quality: copy(produced.quality ?? {}), location: original.location,
  };
}
export function settleSailVoyage(
  L: SailVoyageLedger, runId: string, q: SettleSailVoyage,
): SailVoyageResult {
  need(shape(q, ['commandId', 'actorId', 'atWorldMs', 'reason']), 'invalid-settle');
  commandContext(q);
  need(['arrived', 'turned', 'interrupted'].includes(q.reason), 'invalid-settle-reason');
  const s = storeOf(L), payload = canonical(['settle', runId, q]);
  const old = prior(s, q.commandId, payload, q.atWorldMs);
  if (old) {
    need(old.result, 'conflicting-command-replay');
    return copy(old.result);
  }
  const saved = raw(L, runId);
  need(saved.r.operator === q.actorId && q.atWorldMs >= saved.d.nextWorldMs
    && q.atWorldMs >= s.authorityAtWorldMs, 'invalid-settle-context');
  return atomic(L, draft => {
    const meta = copy(storeOf(draft)), { r, d, m } = raw(draft, runId);
    const p = m.projectCheckpoint(d.checkpoint), equipmentId = r.equipmentIds[0];
    const e = draft.equipment[equipmentId], original = copy(e.assembled!.parts!);
    const T = sailRigParts(original.length - 2,
      original.slice(2).map(l => l.materialId as CoirPiece['material']));
    delete e.reservedBy;
    const disassembled = disassembleParts(draft, equipmentId, T, undefined, { keepLotIds: true });
    need(disassembled.lots, 'rig-disassembly-refused');
    draft.lots[original[0].lotId] = producedLot(original[0],
      writeSailMat(p.rig.mat, original[0].location, readSailHistory(original[0])));
    draft.lots[original[1].lotId] = producedLot(original[1],
      writeBambooMast(p.rig.mast, original[1].location, readSailHistory(original[1])));
    const cordIds: string[] = [];
    for (let n = 0; n < p.cordEffects.length; n++) {
      const effect = p.cordEffects[n];
      const applied = applyCordVoyageSummary(draft, {
        commandId: 'voyage:' + runId + ':' + n,
        assumptionId: COIR_CORD_ASSUMPTION_ID, lotId: effect.sourceLotId,
        worldAtMs: q.atWorldMs, islandAtMs: d.nextIslandMs,
        initial: effect.initial, pieces: effect.pieces,
        sunMs: effect.sunMs, shadeMs: effect.shadeMs,
        abrasions: effect.abrasions, maxLoadGf: effect.maxLoadGf,
        ...(effect.break ? { break: effect.break } : {}),
      });
      const remainder = p.rig.cordUseRemainders.find(u =>
        effect.pieces.some(piece => piece.lotId === u.lotId))!.worldMs;
      delete meta.cordUseMs[effect.sourceLotId];
      for (const lotId of applied.lotIds) {
        put(meta.cordUseMs, lotId, { assumptionId: d.assumptionId, milliseconds: remainder });
        cordIds.push(lotId);
      }
    }
    const healthy = !p.rig.mat.torn && !p.rig.mast.broken
      && !p.broken.some(b => b.part === 'cord');
    const allIds = [original[0].lotId, original[1].lotId, ...cordIds];
    if (healthy) {
      const parts = allIds.map(lotId => copy(draft.lots[lotId]));
      const updated = copy(e);
      delete updated.reservedBy;
      updated.assembled = { ...copy(e.assembled!), from: parts[0], parts };
      updated.params = T.toParams(parts);
      cordIds.forEach((lotId, n) => {
        updated.params['cord_use_ms_' + n] = meta.cordUseMs[lotId].milliseconds;
      });
      put(draft.equipment, equipmentId, updated);
      for (const lotId of allIds) delete draft.lots[lotId];
    }
    delete draft.runs[runId];
    const result: SailVoyageResult = {
      rigEquipmentId: healthy ? equipmentId : null,
      lotIds: healthy ? [] : allIds,
      eastMm: p.distance.eastMm, northMm: p.distance.northMm,
      observations: [...m.observeCheckpoint(d.checkpoint)],
    };
    remember(meta, q, payload, runId, result);
    install(draft, meta);
    need(uint(draft.world.worldVersion + 1), 'integer-overflow');
    draft.world.worldVersion++;
    return result;
  });
}
export function restoreSailVoyage(saved: unknown, nowWorldMs: number): SailVoyageLedger {
  need(uint(nowWorldMs), 'invalid-restore-time');
  const L = copy(saved) as SailVoyageLedger, s = copy(storeOf(L));
  need(nowWorldMs >= s.authorityAtWorldMs, 'restore-before-saved-events');
  for (const r of Object.values(L.runs)) {
    if (r.processId !== SAIL_VOYAGE.processId) continue;
    const { d } = raw(L, r.runId), next = copy(d);
    next.paused = true;
    r.state = { schema: SAIL_VOYAGE.schema, data: seal(next) };
  }
  // Restoring establishes no motion, sunshine, abrasion or work for the offline gap.
  s.authorityAtWorldMs = nowWorldMs;
  install(L, s);
  return L;
}
