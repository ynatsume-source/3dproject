// World-only bounded checkpoints. No event history or completed runs accumulate here.
import { commit, startRun, type Ledger } from './process-runner';
import type { LotView, ScienceStepRequest, ScienceStepResult } from './science-contract';
import { INTEGER_HALF_LIFE_POLICY_ID } from '../science/prototypes/integer-half-life';
import {
  cordCanonical as canonical, cordInteger as uint, cordId as id, cordShape as shape,
} from '../science/prototypes/coir-cord-types';
import { readCordPiece, readCordHistory } from './coir-cord-lots';
import {
  clone, CordLoadError, evaluate, need, plain, substance, validateRequest,
  type CordLoadRequest, type CordLoadResult,
} from './coir-cord-load-kernel';
import {
  LEGACY_CORD_LOAD_LEDGER_SCHEMA, readLegacyCordLoads, type LegacyCordLoadStore,
} from './coir-cord-load-v3';

export { CordLoadError } from './coir-cord-load-kernel';
export type { CordHostEvent, CordLoadRequest, CordLoadResult } from './coir-cord-load-kernel';

export const COIR_CORD_LOAD = Object.freeze({
  processId: 'prototype_coir_cord_load',
  processVersion: 'host-5',
  contract: '0.2.1',
  catalogVersion: 'civ-sci-test-2',
  schema: 'civ-world.coir-cord-load/5',
  ledgerSchema: 'civ-world.coir-cord-load-ledger/5',
  strengthPolicyId: INTEGER_HALF_LIFE_POLICY_ID,
  receiptLimit: 64,
  orphanGrace: 64,
  gcScanLimit: 8,
});
interface Cursor {
  worldAtMs: number;
  islandAtMs: number;
}
interface Receipt {
  request: CordLoadRequest;
  result: CordLoadResult;
  digest: number;
}
interface Checkpoint {
  lotId: string;
  kind: 'live' | 'retired';
  cursor: Cursor;
  floor: Cursor | null;
  recent: Receipt[];
  latest: LotView | null;
  children: string[];
  digest: number;
}
interface RetentionNode {
  prev: string | null;
  next: string | null;
  touchedAt: number;
  digest: number;
}
interface Retention {
  generation: number;
  head: string | null;
  tail: string | null;
  scan: string | null;
  nodes: Record<string, RetentionNode>;
  digest: number;
}
const PREVIOUS_LEDGER_SCHEMA = 'civ-world.coir-cord-load-ledger/4';
interface Store {
  schema: string;
  worldId: string;
  worldEpoch: string;
  strengthPolicyId: string;
  receiptLimit: number;
  cords: Record<string, Checkpoint>;
  commands: Record<string, string>;
  retention: Retention;
}
export type CordLoadLedger = Ledger & {
  coirCordLoadFormat?: string;
  coirCordLoads?: Store | LegacyCordLoadStore;
};
const validated = new WeakSet<Store>();
const has = (value: object, key: string) => Object.hasOwn(value, key);
function set<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}
function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value));
}
function cursor(value: unknown): value is Cursor {
  return shape(value, ['worldAtMs', 'islandAtMs'])
    && uint(value.worldAtMs) && uint(value.islandAtMs);
}
const at = (q: CordLoadRequest): Cursor =>
  ({ worldAtMs: q.worldAtMs, islandAtMs: q.islandAtMs });

/** Accidental-corruption checksum, not authentication or evidence of physical calibration. */
function digest(value: unknown): number {
  const text = canonical(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}
function receiptDigest(x: Receipt): number {
  return digest([x.request, x.result]);
}
function checkpointDigest(x: Checkpoint): number {
  return digest([x.lotId, x.kind, x.cursor, x.floor, x.latest, x.children,
    x.recent.map(r => [r.request.commandId, r.digest])]);
}
function seal(x: Checkpoint): Checkpoint {
  x.digest = checkpointDigest(x);
  return x;
}
function freshStore(L: Ledger): Store {
  return {
    schema: COIR_CORD_LOAD.ledgerSchema,
    worldId: L.world.worldId,
    worldEpoch: L.world.worldEpoch,
    strengthPolicyId: INTEGER_HALF_LIFE_POLICY_ID,
    receiptLimit: COIR_CORD_LOAD.receiptLimit,
    cords: {},
    commands: {},
    retention: freshRetention(),
  };
}
function freshCheckpoint(lot: LotView, time: Cursor): Checkpoint {
  return seal({
    lotId: lot.lotId, kind: 'live', cursor: clone(time), floor: null,
    recent: [], latest: clone(lot), children: [], digest: 0,
  });
}
function base(L: CordLoadLedger): void {
  need(L && L.world && id(L.world.worldId) && id(L.world.worldEpoch)
    && uint(L.world.worldVersion) && uint(L.seq) && record(L.lots)
    && record(L.runs) && record(L.equipment) && Array.isArray(L.committed), 'corrupt-save');
}
function header(L: CordLoadLedger, s: Store, legacy = false): void {
  base(L);
  const expected = legacy ? PREVIOUS_LEDGER_SCHEMA : COIR_CORD_LOAD.ledgerSchema;
  need(s.schema === expected, 'unsupported-load-schema');
  need(shape(s, ['schema', 'worldId', 'worldEpoch', 'strengthPolicyId',
    'receiptLimit', 'cords', 'commands', ...(legacy ? [] : ['retention'])])
    && L.coirCordLoadFormat === expected
    && s.worldId === L.world.worldId && s.worldEpoch === L.world.worldEpoch
    && s.strengthPolicyId === INTEGER_HALF_LIFE_POLICY_ID
    && s.receiptLimit === COIR_CORD_LOAD.receiptLimit
    && record(s.cords) && record(s.commands), 'corrupt-save');
  if (!legacy) retentionHeader(s.retention);
}
const words = new Set([
  '縄は二本に切れた。', '縄はつながっている。',
  '撚り糸は二本に切れた。', '撚り糸はつながっている。',
  '表面が日焼けして色あせている。', '目立った色あせはない。',
  '表面に擦れの跡がある。', '目立った擦れの跡はない。',
]);
function checkReceipt(x: Receipt, lotId: string): void {
  need(shape(x, ['request', 'result', 'digest']), 'corrupt-save');
  validateRequest(x.request);
  const r = x.result;
  need(x.request.lotId === lotId && shape(r, ['runId', 'lotIds', 'observations'])
    && id(r.runId) && Array.isArray(r.lotIds) && [1, 2].includes(r.lotIds.length)
    && r.lotIds.every(id) && new Set(r.lotIds).size === r.lotIds.length
    && (r.lotIds.length === 1 ? r.lotIds[0] === lotId : !r.lotIds.includes(lotId))
    && Array.isArray(r.observations) && r.observations.length === 3
    && r.observations.every(text => words.has(text))
    && uint(x.digest) && x.digest === receiptDigest(x), 'corrupt-save');
}
function checkCheckpoint(L: CordLoadLedger, s: Store, key: string): Checkpoint {
  const x = s.cords[key];
  need(x && shape(x, ['lotId', 'kind', 'cursor', 'floor', 'recent',
    'latest', 'children', 'digest'])
    && id(key) && x.lotId === key && ['live', 'retired'].includes(x.kind)
    && cursor(x.cursor) && (x.floor === null || cursor(x.floor))
    && Array.isArray(x.recent) && x.recent.length <= COIR_CORD_LOAD.receiptLimit
    && Array.isArray(x.children), 'corrupt-save');
  const seen = new Set<string>();
  let previous = x.floor;
  for (const r of x.recent) {
    checkReceipt(r, key);
    const q = r.request;
    need(!seen.has(q.commandId) && has(s.commands, q.commandId)
      && s.commands[q.commandId] === key, 'corrupt-save');
    seen.add(q.commandId);
    if (previous) {
      need(q.worldAtMs >= previous.worldAtMs && q.islandAtMs >= previous.islandAtMs,
        'corrupt-save');
    }
    previous = at(q);
  }
  if (previous) need(canonical(previous) === canonical(x.cursor), 'corrupt-save');
  if (x.floor) {
    need(x.floor.worldAtMs <= x.cursor.worldAtMs
      && x.floor.islandAtMs <= x.cursor.islandAtMs, 'corrupt-save');
  }
  const live = has(L.lots, key) ? L.lots[key] : undefined;
  if (x.kind === 'live') {
    need(x.latest && shape(x.latest, ['lotId', 'materialId', 'amount', 'quality', 'location'])
      && x.latest.lotId === key && x.children.length === 0, 'corrupt-save');
    readCordPiece(x.latest);
    if (live) need(substance(live) === substance(x.latest), 'corrupt-save');
  } else {
    need(x.latest === null && x.children.length === 2 && x.children.every(id)
      && x.children[0] !== x.children[1] && !x.children.includes(key) && !live,
      'corrupt-save');
    const last = x.recent.at(-1);
    need(last && canonical(last.result.lotIds) === canonical(x.children), 'corrupt-save');
  }
  need(uint(x.digest) && x.digest === checkpointDigest(x), 'corrupt-save');
  return x;
}
function checkAll(L: CordLoadLedger, s: Store, legacy = false): void {
  header(L, s, legacy);
  let receipts = 0;
  for (const key of Object.keys(s.cords)) {
    const x = checkCheckpoint(L, s, key);
    receipts += x.recent.length;
    if (legacy && x.kind === 'retired') {
      for (const child of x.children) need(has(s.cords, child), 'corrupt-save');
    }
  }
  need(Object.keys(s.commands).length === receipts, 'corrupt-save');
  for (const [command, key] of Object.entries(s.commands)) {
    need(id(command) && id(key) && has(s.cords, key)
      && s.cords[key].recent.some(r => r.request.commandId === command), 'corrupt-save');
  }
  need(!Object.values(L.runs).some(r => r.processId === COIR_CORD_LOAD.processId),
    'corrupt-save');
  if (!legacy) checkRetention(s);
}
function append(s: Store, x: Checkpoint, q: CordLoadRequest, result: CordLoadResult): void {
  const receipt: Receipt = { request: clone(q), result: clone(result), digest: 0 };
  receipt.digest = receiptDigest(receipt);
  x.recent.push(receipt);
  set(s.commands, q.commandId, q.lotId);
  if (x.recent.length > COIR_CORD_LOAD.receiptLimit) {
    const old = x.recent.shift()!;
    x.floor = at(old.request);
    delete s.commands[old.request.commandId];
  }
  seal(x);
}

const nullableId = (value: unknown): value is string | null =>
  value === null || id(value);
function retentionDigest(r: Retention): number {
  return digest([r.generation, r.head, r.tail, r.scan]);
}
function nodeDigest(key: string, n: RetentionNode): number {
  return digest([key, n.prev, n.next, n.touchedAt]);
}
function freshRetention(): Retention {
  const r: Retention = {
    generation: 0, head: null, tail: null, scan: null, nodes: {}, digest: 0,
  };
  r.digest = retentionDigest(r);
  return r;
}
function retentionHeader(value: unknown): asserts value is Retention {
  need(shape(value, ['generation', 'head', 'tail', 'scan', 'nodes', 'digest'])
    && uint(value.generation) && nullableId(value.head) && nullableId(value.tail)
    && nullableId(value.scan) && record(value.nodes)
    && uint(value.digest) && value.digest === retentionDigest(value as Retention),
  'corrupt-save');
}
function checkNode(r: Retention, key: string, n: RetentionNode | undefined): RetentionNode {
  need(n && shape(n, ['prev', 'next', 'touchedAt', 'digest'])
    && nullableId(n.prev) && nullableId(n.next) && n.prev !== key && n.next !== key
    && uint(n.touchedAt) && n.touchedAt <= r.generation
    && uint(n.digest) && n.digest === nodeDigest(key, n), 'corrupt-save');
  return n;
}
function initializeRetention(s: Store): void {
  const r = freshRetention();
  for (const key of Object.keys(s.cords)) {
    const n: RetentionNode = { prev: r.tail, next: null, touchedAt: 0, digest: 0 };
    if (r.tail !== null) {
      const previous = r.nodes[r.tail];
      previous.next = key;
      previous.digest = nodeDigest(r.tail, previous);
    } else {
      r.head = key;
    }
    n.digest = nodeDigest(key, n);
    set(r.nodes, key, n);
    r.tail = key;
  }
  r.scan = r.head;
  r.digest = retentionDigest(r);
  s.retention = r;
}
function checkRetention(s: Store): void {
  const r = s.retention;
  retentionHeader(r);
  const keys = Object.keys(r.nodes);
  need(keys.length === Object.keys(s.cords).length, 'corrupt-save');
  for (const key of keys) {
    need(has(s.cords, key), 'corrupt-save');
    checkNode(r, key, r.nodes[key]);
  }
  if (keys.length === 0) {
    need(r.head === null && r.tail === null && r.scan === null, 'corrupt-save');
    return;
  }
  need(r.head !== null && r.tail !== null && r.scan !== null
    && has(r.nodes, r.scan), 'corrupt-save');
  const seen = new Set<string>();
  let key = r.head;
  let previous: string | null = null;
  while (key !== null) {
    need(!seen.has(key) && has(r.nodes, key), 'corrupt-save');
    seen.add(key);
    const n = checkNode(r, key, r.nodes[key]);
    need(n.prev === previous, 'corrupt-save');
    previous = key;
    key = n.next;
  }
  need(seen.size === keys.length && previous === r.tail, 'corrupt-save');
}
interface RetentionPlan {
  header: Omit<Retention, 'nodes'>;
  nodes: Map<string, RetentionNode | null>;
  removed: string[];
  commands: string[];
}
interface RetentionEvent {
  owner: string;
  children: string[];
  liveOwner: boolean;
}
function returnableCordIds(L: CordLoadLedger): Set<string> {
  const ids = new Set<string>();
  for (const equipment of Object.values(L.equipment)) {
    const assembly = equipment.assembled;
    if (!assembly) continue;
    if (id(assembly.from?.lotId)) ids.add(assembly.from.lotId);
    if (Array.isArray(assembly.parts)) {
      for (const part of assembly.parts) if (id(part?.lotId)) ids.add(part.lotId);
    }
  }
  return ids;
}
/**
 * Build an atomic patch for a bounded round-robin scan. Untouched live rows are
 * never read. Explicit compaction supplies the complete index length instead.
 */
function retentionPlan(
  L: CordLoadLedger,
  s: Store,
  budget: number,
  event?: RetentionEvent,
): RetentionPlan {
  const old = s.retention;
  retentionHeader(old);
  const r = { ...old };
  const patches = new Map<string, RetentionNode | null>();
  const removed: string[] = [];
  const commands: string[] = [];
  function get(key: string): RetentionNode {
    if (patches.has(key)) {
      const node = patches.get(key);
      need(node, 'corrupt-save');
      return node;
    }
    const node = checkNode(old, key, has(old.nodes, key) ? old.nodes[key] : undefined);
    const copy = clone(node);
    patches.set(key, copy);
    return copy;
  }
  function unlink(key: string): void {
    const n = get(key);
    if (n.prev !== null) {
      const previous = get(n.prev);
      need(previous.next === key, 'corrupt-save');
      previous.next = n.next;
    } else {
      need(r.head === key, 'corrupt-save');
      r.head = n.next;
    }
    if (n.next !== null) {
      const next = get(n.next);
      need(next.prev === key, 'corrupt-save');
      next.prev = n.prev;
    } else {
      need(r.tail === key, 'corrupt-save');
      r.tail = n.prev;
    }
    if (r.scan === key) r.scan = n.next ?? r.head;
    patches.set(key, null);
  }
  function touch(key: string): void {
    if (patches.has(key) ? patches.get(key) !== null : has(old.nodes, key)) unlink(key);
    const n: RetentionNode = {
      prev: r.tail, next: null, touchedAt: r.generation, digest: 0,
    };
    if (r.tail !== null) get(r.tail).next = key;
    else r.head = key;
    r.tail = key;
    patches.set(key, n);
    if (r.scan === null) r.scan = r.head;
  }
  if (event) {
    need(uint(r.generation + 1), 'corrupt-save');
    r.generation++;
    touch(event.owner);
    for (const child of event.children) touch(child);
  }
  let protectedIds: Set<string> | undefined;
  for (let step = 0; step < budget && r.scan !== null; step++) {
    const key = r.scan;
    const n = get(key);
    r.scan = n.next ?? r.head;
    if (r.generation - n.touchedAt < COIR_CORD_LOAD.orphanGrace) continue;
    const exists = event && key === event.owner ? event.liveOwner
      : !!(has(L.lots, key) ? L.lots[key] : undefined);
    if (exists || event?.children.includes(key)) continue;
    protectedIds ??= returnableCordIds(L);
    if (protectedIds.has(key)) continue;
    const checkpoint = checkCheckpoint(L, s, key);
    removed.push(key);
    for (const receipt of checkpoint.recent) commands.push(receipt.request.commandId);
    unlink(key);
  }
  for (const [key, n] of patches) {
    if (n !== null) n.digest = nodeDigest(key, n);
  }
  r.digest = retentionDigest(r);
  return {
    header: {
      generation: r.generation, head: r.head, tail: r.tail, scan: r.scan, digest: r.digest,
    },
    nodes: patches, removed, commands,
  };
}
function applyRetentionPlan(s: Store, plan: RetentionPlan): void {
  for (const key of plan.removed) delete s.cords[key];
  for (const command of plan.commands) delete s.commands[command];
  for (const [key, n] of plan.nodes) {
    if (n === null) delete s.retention.nodes[key];
    else set(s.retention.nodes, key, n);
  }
  Object.assign(s.retention, plan.header);
}

interface Prepared {
  store: Store;
  removeRuns: string[];
  install: boolean;
}
function prepare(L: CordLoadLedger): Prepared {
  base(L);
  const saved = L.coirCordLoads;
  if (!saved) {
    need(L.coirCordLoadFormat === undefined
      && !Object.values(L.runs).some(r => r.processId === COIR_CORD_LOAD.processId),
      'corrupt-save');
    return { store: freshStore(L), removeRuns: [], install: true };
  }
  if (saved.schema === LEGACY_CORD_LOAD_LEDGER_SCHEMA) {
    need(L.coirCordLoadFormat === undefined, 'corrupt-save');
    const old = readLegacyCordLoads(L);
    const s = freshStore(L);
    for (const { record: r, evaluation: e } of old.events) {
      const q = r.request;
      let x = has(s.cords, q.lotId) ? s.cords[q.lotId]
        : freshCheckpoint(r.source, at(q));
      const result: CordLoadResult = {
        runId: r.runId, lotIds: [...r.lotIds], observations: [...e.observations],
      };
      x.cursor = at(q);
      if (r.lotIds.length === 1) {
        const p = e.produced[0];
        x.latest = {
          lotId: q.lotId, materialId: p.materialId, amount: clone(p.amount),
          quality: clone(p.quality), location: p.into!,
        };
      } else {
        x.kind = 'retired';
        x.latest = null;
        x.children = [...r.lotIds];
        e.produced.forEach((p, i) => {
          set(s.cords, r.lotIds[i], freshCheckpoint({
            lotId: r.lotIds[i], materialId: p.materialId, amount: clone(p.amount),
            quality: clone(p.quality), location: p.into!,
          }, at(q)));
        });
      }
      append(s, x, q, result);
      set(s.cords, q.lotId, x);
    }
    initializeRetention(s);
    // This view adds no mutations to the caller until the entire migration is accepted.
    const removed = new Set(old.runIds);
    const view = { ...L, coirCordLoadFormat: s.schema, coirCordLoads: s,
      runs: Object.fromEntries(Object.entries(L.runs)
        .filter(([key]) => !removed.has(key))) };
    checkAll(view, s);
    return { store: s, removeRuns: old.runIds, install: true };
  }
  if (saved.schema === PREVIOUS_LEDGER_SCHEMA) {
    const old = saved as Store;
    // The old shape, checksums and child links are checked before a new header
    // is added. Relabeling an old object as /5 is never a migration.
    checkAll(L, old, true);
    const s = clone(old);
    s.schema = COIR_CORD_LOAD.ledgerSchema;
    initializeRetention(s);
    const view = { ...L, coirCordLoadFormat: s.schema, coirCordLoads: s };
    checkAll(view, s);
    return { store: s, removeRuns: [], install: true };
  }
  const s = saved as Store;
  header(L, s);
  if (!validated.has(s)) {
    checkAll(L, s);
    validated.add(s);
  }
  return { store: s, removeRuns: [], install: false };
}
function install(L: CordLoadLedger, p: Prepared): void {
  if (!p.install) return;
  L.coirCordLoadFormat = COIR_CORD_LOAD.ledgerSchema;
  L.coirCordLoads = p.store;
  for (const runId of p.removeRuns) delete L.runs[runId];
  validated.add(p.store);
}
/** Load/restore boundary. /3 and /4 are validated before migration; clocks do not advance. */
export function compactCordLoadLedger(L: CordLoadLedger): void {
  try {
    const p = prepare(L);
    if (!p.install) checkAll(L, p.store);
    const cleanup = retentionPlan(L, p.store, Object.keys(p.store.cords).length);
    install(L, p);
    applyRetentionPlan(p.store, cleanup);
  } catch (error) {
    if (error instanceof CordLoadError && error.code === 'unsupported-load-schema') throw error;
    throw new CordLoadError('corrupt-save');
  }
}
export const validateCordLoadLedger = compactCordLoadLedger;

function chronology(q: CordLoadRequest, x?: Checkpoint): void {
  if (!x) return;
  if (x.floor) {
    need(q.worldAtMs > x.floor.worldAtMs || q.islandAtMs > x.floor.islandAtMs,
      'expired-command');
  }
  need(q.worldAtMs >= x.cursor.worldAtMs && q.islandAtMs >= x.cursor.islandAtMs,
    'out-of-order-event');
  if (q.event.kind === 'exposure') {
    need(q.event.fromIslandMs >= x.cursor.islandAtMs, 'out-of-order-event');
  } else if (q.event.kind === 'voyage-summary') {
    need(q.islandAtMs - q.event.sunMs - q.event.shadeMs >= x.cursor.islandAtMs,
      'out-of-order-event');
  }
}

/** Settle a single private lot using the existing runner; preserve its sequence allocation exactly.
 * The temporary completed run and receipt never enter the world's runs/committed collections.
 */
function transaction(L: CordLoadLedger, q: CordLoadRequest, source: LotView) {
  need(uint(L.seq + 4) && uint(L.world.worldVersion + 4)
    && !has(L.runs, 'run:' + (L.seq + 1)), 'corrupt-save');
  const mini: Ledger = {
    world: clone(L.world), seq: L.seq, lots: {}, equipment: {}, runs: {}, committed: [],
  };
  set(mini.lots, q.lotId, clone(source));
  const begun = startRun(mini, {
    processId: COIR_CORD_LOAD.processId, processVersion: COIR_CORD_LOAD.processVersion,
    catalogVersion: COIR_CORD_LOAD.catalogVersion, contract: COIR_CORD_LOAD.contract,
    clock: 'world', lotIds: [q.lotId], equipmentIds: [], operator: 'world:coir-cord-load',
  }, q.worldAtMs);
  need(begun.run, 'event-refused');
  const r = begun.run;
  const e = evaluate(source, q, L.world.worldId, L.world.worldEpoch, r.runId);
  for (let i = 1; i <= e.produced.length; i++) {
    need(uint(mini.seq + i) && !has(L.lots, 'lot:' + (mini.seq + i)), 'corrupt-save');
  }
  const intact = e.produced.length === 1;
  const lotIds = intact ? [q.lotId] : e.produced.map((_, i) => 'lot:' + (mini.seq + i + 1));
  r.lastTo = q.worldAtMs;
  const req: ScienceStepRequest = {
    contract: r.contract, requestId: r.runId + ':event', world: clone(mini.world),
    runId: r.runId, processId: r.processId, processVersion: r.processVersion,
    catalogVersion: r.catalogVersion, interval: { from: q.worldAtMs, to: q.worldAtMs },
    state: null, environment: {
      sampleId: 'env:cord-event-unused', source: 'unknown', effectiveAt: q.worldAtMs,
    }, lots: [source], equipment: [], energy: [], actions: [], seed: r.seed,
  };
  const res: ScienceStepResult = {
    contract: r.contract, requestId: req.requestId, runId: r.runId,
    simulated: { ...req.interval }, state: {
      schema: COIR_CORD_LOAD.schema,
      data: { request: clone(q), source, damage: e.state, outputLotIds: lotIds },
    },
    status: 'completed', consumed: [{ lotId: q.lotId, amount: clone(source.amount) }],
    produced: e.produced, released: [], drawn: [], energy: [], equipmentWear: [],
    observations: e.observations.map(text => ({ at: q.worldAtMs, channel: 'sight', text })),
    evidence: { evaluatorVersion: COIR_CORD_LOAD.processVersion, sourceRefs: [],
      notes: 'owner-assumption-not-calibrated; strength policy ' + INTEGER_HALF_LIFE_POLICY_ID },
  };
  const applied = commit(mini, req, res);
  need(applied.ok && applied.produced, 'event-refused');
  if (intact) {
    const temporary = applied.produced[0];
    delete mini.lots[temporary.lotId];
    set(mini.lots, q.lotId, { ...temporary, lotId: q.lotId });
  }
  need(canonical(lotIds) === canonical(intact
    ? [q.lotId] : applied.produced.map(p => p.lotId)), 'corrupt-save');
  return {
    mini, result: { runId: r.runId, lotIds, observations: [...e.observations] },
  };
}
export function applyCordLoad(L: CordLoadLedger, q: CordLoadRequest): CordLoadResult {
  try {
    validateRequest(q);
    const p = prepare(L);
    const s = p.store;
    if (has(s.commands, q.commandId)) {
      const owner = s.commands[q.commandId];
      const x = checkCheckpoint(L, s, owner);
      const previous = x.recent.find(r => r.request.commandId === q.commandId);
      need(previous && canonical(previous.request) === canonical(q), 'conflicting-replay');
      install(L, p);
      return clone(previous.result);
    }
    const previous = has(s.cords, q.lotId) ? checkCheckpoint(L, s, q.lotId) : undefined;
    chronology(q, previous);
    need(!previous || previous.kind === 'live', 'missing-material');
    const live = has(L.lots, q.lotId) ? L.lots[q.lotId] : undefined;
    need(live, 'missing-material');
    need(!live.reservedBy, 'material-in-use');
    const source = plain(live);
    readCordPiece(source);
    readCordHistory(source);
    const { mini, result } = transaction(L, q, source);
    const x = previous ? clone(previous) : freshCheckpoint(source, at(q));
    const patches: Checkpoint[] = [];
    x.cursor = at(q);
    if (result.lotIds.length === 1) {
      x.latest = clone(mini.lots[q.lotId]);
    } else {
      x.kind = 'retired';
      x.latest = null;
      x.children = [...result.lotIds];
      for (const key of result.lotIds) {
        need(!has(s.cords, key), 'corrupt-save');
        patches.push(freshCheckpoint(mini.lots[key], at(q)));
      }
    }
    // Prepare only this bounded row. The old index is patched after every check succeeds.
    const evicted = x.recent.length === COIR_CORD_LOAD.receiptLimit
      ? x.recent[0].request.commandId : undefined;
    const local: Store = { ...s, commands: {} };
    append(local, x, q, result);
    const cleanup = retentionPlan(L, s, COIR_CORD_LOAD.gcScanLimit, {
      owner: q.lotId, children: result.lotIds.length === 2 ? [...result.lotIds] : [],
      liveOwner: result.lotIds.length === 1,
    });
    // No throwing validation or unrelated checkpoint traversal after the atomic patch begins.
    install(L, p);
    delete L.lots[q.lotId];
    for (const key of result.lotIds) set(L.lots, key, mini.lots[key]);
    L.seq = mini.seq;
    L.world.worldVersion = mini.world.worldVersion;
    if (evicted !== undefined) delete s.commands[evicted];
    set(s.commands, q.commandId, q.lotId);
    set(s.cords, q.lotId, x);
    for (const child of patches) set(s.cords, child.lotId, child);
    applyRetentionPlan(s, cleanup);
    validated.add(s);
    return clone(result);
  } catch (error) {
    if (error instanceof CordLoadError) throw error;
    throw new CordLoadError('event-refused');
  }
}
/** Call only for a confirmed on-site witnessed event. World checkpoint data stays private. */
export function applyCordLoadForResident(
  L: CordLoadLedger,
  q: CordLoadRequest,
): { ok: boolean; observations: string[] } {
  try {
    return { ok: true, observations: applyCordLoad(L, q).observations };
  } catch {
    return { ok: false, observations: ['今はこの材料を扱えない。'] };
  }
}
