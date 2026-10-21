import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { addLot, emptyLedger, startRun, type Ledger } from '../src/world/process-runner';
import type { LotView } from '../src/world/science-contract';
import {
  beginHuskSoak, recordHuskSoakSpan, recordHuskSoakSpans, takeOutHuskSoak,
  projectHuskSoak, restoreHuskSoak, HuskSoakError,
  type HuskSoakStart, type HuskSoakSpan,
} from '../src/world/husk-soak-work';
import { HUSK_SOAK_ASSUMPTION, splitSoakedHusks } from '../src/science/prototypes/husk-soak';
import { beginManualHuskWork } from '../src/world/manual-husk-work';
import { MANUAL_HUSK_ASSUMPTION } from '../src/science/prototypes/manual-husk-assumptions';
import {
  beginHuskSoak as beginV3,
  recordHuskSoakSpan as recordV3,
  takeOutHuskSoak as takeV3,
} from './fixtures/husk-soak-work-v3';

const LIMIT = 64;
const RATE = 16;
const MINUTE = 60_000;
const SITE = 'site:batch-pool';
const ACTOR = 'res:batch-worker';
const BASE = 1_000;
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let groups = 0;

function test(name: string, run: () => void) {
  run();
  groups++;
  console.log('PASS ' + name);
}

function raw(lotId: string): LotView {
  return {
    lotId, materialId: 'coconut_husk',
    amount: { value: 400_000, unit: 'mg' }, location: SITE,
    quality: { count: 1, water_ppm: 250_000, ash_dry_ppm: 0, history_complete: 1 },
  };
}

function start(at: number, lotId: string, commandId: string): HuskSoakStart {
  return {
    commandId, assumptionId: HUSK_SOAK_ASSUMPTION.id, actorId: ACTOR,
    lotId, site: { locationId: SITE, kind: 'coastal-tide-pool' },
    atWorldMs: at, atIslandMs: at * RATE, presence: 'here',
  };
}

function fact(
  L: Ledger, runId: string, from: number, to: number,
  recordId: string, immersed: boolean | null = true, lag = 0,
): HuskSoakSpan {
  return {
    recordId, worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId,
    siteId: SITE, fromWorldMs: from, toWorldMs: to,
    fromIslandMs: from * RATE, toIslandMs: to * RATE,
    confirmedAtWorldMs: to + lag, immersed,
  };
}

function fixture(legacy = false) {
  const L = emptyLedger('world:soak-batch', 'epoch:1');
  const lot = raw('lot:batch-source');
  addLot(L, lot);
  const s = start(BASE, lot.lotId, 'begin:batch');
  const { runId } = legacy ? beginV3(L, s, BASE) : beginHuskSoak(L, s, BASE);
  return { L, runId };
}

function take(L: Ledger, runId: string, at: number, legacy = false) {
  const intent = {
    intentId: 'take:batch', kind: 'take-out' as const, actorId: ACTOR,
    presence: 'here' as const, atWorldMs: at, atIslandMs: at * RATE,
  };
  return legacy
    ? takeV3(L, runId, intent, at)
    : takeOutHuskSoak(L, runId, intent, at);
}

function same(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected),
    message + ': serialized order and values must agree');
}

function reject(L: Ledger, runId: string, spans: unknown, now: number) {
  const before = json(L);
  assert.throws(() => recordHuskSoakSpans(L, runId, spans as HuskSoakSpan[], now),
    HuskSoakError);
  same(L, before, 'a rejected batch is atomic');
}

function series(L: Ledger, runId: string, count: number, mixed = false) {
  const spans: HuskSoakSpan[] = [];
  let from = BASE;
  for (let n = 0; n < count; n++) {
    const gap = mixed && n % 23 === 0 ? 1_037 : 0;
    from += gap;
    const width = mixed ? [1_001, 29_999, 30_000, 60_007][n % 4] : MINUTE;
    const mode = mixed ? [true, true, false, true, null][n % 5] : true;
    spans.push(fact(L, runId, from, from + width, 'span:' + n, mode, mixed ? n % 7 : 0));
    from += width;
  }
  return spans;
}

test('batch and modern singles match frozen /3 over both bounded receipt windows', () => {
  for (const mixed of [false, true]) {
    const old = fixture(true);
    let single = fixture();
    const batch = fixture();
    const spans = series(old.L, old.runId, 720, mixed);
    let expected: ReturnType<typeof recordV3> | undefined;
    let actual: ReturnType<typeof recordHuskSoakSpan> | undefined;
    for (let n = 0; n < spans.length; n++) {
      const span = spans[n];
      expected = recordV3(old.L, old.runId, span, span.confirmedAtWorldMs);
      actual = recordHuskSoakSpan(single.L, single.runId, span, span.confirmedAtWorldMs);
      if (n % 113 === 0) {
        single = { ...single, L: restoreHuskSoak(json(single.L)) };
      }
    }
    const now = Math.max(...spans.map(span => span.confirmedAtWorldMs));
    const all = recordHuskSoakSpans(batch.L, batch.runId, json(spans), now);
    same(actual, expected, 'single projection against frozen /3');
    same(all, expected, 'batch projection against frozen /3');
    same(single.L, old.L, 'single whole ledger against frozen /3');
    same(batch.L, old.L, 'batch whole ledger against frozen /3');
    const data = batch.L.runs[batch.runId].state!.data as any;
    assert.equal(data.frameCount, 720);
    assert.equal(data.frames.length, LIMIT);
    assert.equal(batch.L.committed.length, 500);
    assert.equal((batch.L as any).huskSoakRecords.recent.length, LIMIT);
    assert.equal(typeof data.digest, 'number');
    const last = spans.at(-1)!;
    const beforeReplay = json(batch.L);
    same(recordHuskSoakSpans(batch.L, batch.runId, [last, last], now), all,
      'retained duplicates are no-ops');
    same(batch.L, beforeReplay, 'duplicates do not advance private bookkeeping');
    const takenAt = last.toWorldMs + 10;
    same(take(batch.L, batch.runId, takenAt), take(old.L, old.runId, takenAt, true),
      'batch and frozen /3 settle identical material and water');
    same(batch.L, old.L, 'settlement after batch preserves whole ledger');
    const finished = json(batch.L);
    same(recordHuskSoakSpans(batch.L, batch.runId, [last], now),
      projectHuskSoak(batch.L, batch.runId), 'finished run supports retained span replay');
    same(batch.L, finished, 'finished replay does not restore the run');
  }
});


function oldSave(version: 1 | 2) {
  const L = emptyLedger('world:soak-batch-old', 'epoch:1');
  const source = raw('lot:batch-old');
  addLot(L, source);
  const spec = { ...start(BASE, source.lotId, 'begin:old'), atIslandMs: BASE };
  const { run } = startRun(L, {
    processId: 'prototype_husk_soak', processVersion: 'host-' + version,
    catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'island',
    lotIds: [source.lotId], equipmentIds: [], operator: ACTOR,
  }, BASE);
  assert.ok(run);
  const frame = {
    ...fact(L, run.runId, BASE, BASE + MINUTE, 'old:first'),
    fromIslandMs: BASE, toIslandMs: BASE + MINUTE,
  };
  run.status = 'running';
  run.lastTo = frame.toIslandMs;
  run.state = { schema: 'civ-world.husk-soak/' + version, data: {
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId: run.runId,
    spec, source, frames: [frame], takeOut: null,
    totalImmersedMs: MINUTE, historyComplete: 1, outputs: [], drawn: [],
    ...(version === 2 ? { previousHistory: [], origin: null } : {}),
  } };
  return { L, runId: run.runId };
}

test('direct legacy /1 and /2 batches migrate exactly like frozen singles and fail atomically', () => {
  for (const version of [1, 2] as const) {
    const initial = oldSave(version);
    const before = json(initial.L);
    const projection = recordHuskSoakSpans(initial.L, initial.runId, [], BASE + MINUTE);
    assert.equal(projection.certifiedIslandMs, MINUTE);
    same(initial.L, before, 'empty legacy read does not install migration');
    const spans = Array.from({ length: 73 }, (_, n) => {
      const from = BASE + (n + 1) * MINUTE;
      return {
        ...fact(initial.L, initial.runId, from, from + MINUTE, 'old:next:' + n),
        fromIslandMs: from, toIslandMs: from + MINUTE,
      };
    });
    const now = spans.at(-1)!.confirmedAtWorldMs;
    reject(initial.L, initial.runId, [spans[0], { ...spans[1], worldEpoch: 'wrong' }], now);
    const old = json(initial.L);
    const single = json(initial.L);
    let expected: ReturnType<typeof recordV3> | undefined;
    for (const span of spans) {
      expected = recordV3(old, initial.runId, span, now);
      recordHuskSoakSpan(single, initial.runId, span, now);
    }
    const batch = json(initial.L);
    same(recordHuskSoakSpans(batch, initial.runId, spans, now), expected,
      'direct legacy projection ' + version);
    same(batch, old, 'direct legacy batch full ledger ' + version);
    same(single, old, 'direct legacy single full ledger ' + version);
  }
});

test('different successful batch boundaries, gaps, JSON and replay give one byte-identical ledger', () => {
  const reference = fixture();
  const spans = series(reference.L, reference.runId, 215, true);
  for (const span of spans) {
    recordHuskSoakSpan(reference.L, reference.runId, span, span.confirmedAtWorldMs);
  }
  for (const chunkSize of [1, 2, 7, 31, 64, 65, 107, 215]) {
    let { L, runId } = fixture();
    for (let from = 0; from < spans.length; from += chunkSize) {
      const part = spans.slice(from, from + chunkSize);
      const now = Math.max(...part.map(span => span.confirmedAtWorldMs));
      recordHuskSoakSpans(L, runId, json(part), now);
      const last = part.at(-1)!;
      const stable = json(L);
      recordHuskSoakSpans(L, runId, [last], now);
      same(L, stable, 'last receipt can be resent across a batch boundary');
      L = restoreHuskSoak(json(L));
    }
    same(L, reference.L, 'batch width ' + chunkSize);
  }
});

test('malformed, future, conflicting, overlapping and expired batches fail before any write', () => {
  const { L, runId } = fixture();
  const first = fact(L, runId, BASE, BASE + MINUTE, 'first');
  const second = fact(L, runId, BASE + MINUTE, BASE + 2 * MINUTE, 'second');
  reject(L, runId, null, second.confirmedAtWorldMs);
  reject(L, runId, {}, second.confirmedAtWorldMs);
  reject(L, runId, [first, undefined], second.confirmedAtWorldMs);
  const sparse = new Array<HuskSoakSpan>(2);
  sparse[0] = first;
  reject(L, runId, sparse, second.confirmedAtWorldMs);
  reject(L, runId, [first, { ...second, worldEpoch: 'other' }], second.confirmedAtWorldMs);
  reject(L, runId, [first, { ...second, fromWorldMs: first.fromWorldMs }],
    second.confirmedAtWorldMs);
  reject(L, runId, [first, { ...second, confirmedAtWorldMs: second.confirmedAtWorldMs + 1 }],
    second.confirmedAtWorldMs);
  reject(L, runId, [first, { ...second, recordId: first.recordId }],
    second.confirmedAtWorldMs);
  const spans = series(L, runId, 65);
  reject(L, runId, [...spans, spans[0]], spans.at(-1)!.confirmedAtWorldMs);
  recordHuskSoakSpans(L, runId, spans, spans.at(-1)!.confirmedAtWorldMs);
  const before = json(L);
  reject(L, runId, [spans[0]], spans.at(-1)!.confirmedAtWorldMs);
  same(L, before, 'expired command stays refused');
});

test('empty batches are read-only, and inputs do not become aliases of stored frames', () => {
  const { L, runId } = fixture();
  const before = json(L);
  same(recordHuskSoakSpans(L, runId, [], BASE), projectHuskSoak(L, runId),
    'empty batch returns current projection');
  same(L, before, 'empty batch writes no receipt or frame');
  const input = [fact(L, runId, BASE, BASE + MINUTE, 'owned')];
  recordHuskSoakSpans(L, runId, input, input[0].confirmedAtWorldMs);
  const settled = json(L);
  input[0].immersed = false;
  input[0].recordId = 'changed-outside';
  input.push(fact(L, runId, BASE + MINUTE, BASE + 2 * MINUTE, 'outside'));
  same(L, settled, 'caller mutation cannot change stored evidence');
});

let saturated: { L: Ledger; runId: string; at: number } | undefined;
function saturatedFixture() {
  if (saturated) return { ...saturated, L: json(saturated.L) };
  const L = emptyLedger('world:soak-batch-full', 'epoch:1');
  let at = BASE;
  for (let n = 0; n < LIMIT; n++) {
    const lot = raw('lot:full-source:' + n);
    addLot(L, lot);
    const spec = start(at, lot.lotId, 'begin:full:' + n);
    const { runId } = beginHuskSoak(L, spec, at);
    const spans: HuskSoakSpan[] = [];
    for (let i = 0; i < 128; i++) {
      spans.push(fact(L, runId, at + i * 30_000, at + (i + 1) * 30_000,
        'full:' + n + ':' + i, i % 2 === 0));
    }
    recordHuskSoakSpans(L, runId, spans, spans.at(-1)!.confirmedAtWorldMs);
    at += 128 * 30_000;
    takeOutHuskSoak(L, runId, {
      intentId: 'out:full:' + n, kind: 'take-out', actorId: ACTOR, presence: 'here',
      atWorldMs: at, atIslandMs: at * RATE,
    }, at);
    at++;
  }
  const active = raw('lot:full-active');
  addLot(L, active);
  const { runId } = beginHuskSoak(L, start(at, active.lotId, 'begin:full-active'), at);
  const spans: HuskSoakSpan[] = [];
  for (let i = 0; i < 128; i++) {
    spans.push(fact(L, runId, at + i * 30_000, at + (i + 1) * 30_000,
      'active:' + i, i % 2 === 0));
  }
  recordHuskSoakSpans(L, runId, spans, spans.at(-1)!.confirmedAtWorldMs);
  at += 128 * 30_000;
  const records = (L as any).huskSoakRecords;
  assert.equal(records.finished.length, LIMIT);
  assert.equal(records.recent.length, LIMIT);
  assert.equal(Object.keys(records.provenance).length, LIMIT);
  assert.ok(Object.values(records.provenance).every((row: any) => row.input.soakHistory.length === LIMIT));
  const data = L.runs[runId].state!.data as any;
  assert.equal(data.frames.length, LIMIT);
  assert.equal(data.history.length, LIMIT);
  assert.equal(L.committed.length, 500);
  saturated = { L: json(L), runId, at };
  return { L, runId, at };
}

function catchupSpans(L: Ledger, runId: string, from: number, count = 720) {
  return Array.from({ length: count }, (_, n) =>
    fact(L, runId, from + n * MINUTE, from + (n + 1) * MINUTE,
      'catchup:' + n));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test('a full proof cache is shared without reading or cloning unrelated proof bodies', () => {
  const { L, runId, at } = saturatedFixture();
  recordHuskSoakSpans(L, runId, [], at); // Register the valid load before adding traps.
  const previousRecords = (L as any).huskSoakRecords;
  // Another accepted world component uses structuredClone + Object.assign(L,...).
  // Keep that real transaction outside the measured span: it must not make the
  // next span rescan every unrelated soak proof solely because objects changed.
  const piece = splitSoakedHusks(raw('lot:foreign-producer-input'),
    HUSK_SOAK_ASSUMPTION.id, HUSK_SOAK_ASSUMPTION.durationMs, {
      runId: 'run:foreign-producer', fromWorldMs: 0, toWorldMs: at - 1,
    })[0];
  piece.input.soakHistory = [{
    recordId: 'record:foreign-soak', runId: 'run:foreign-producer',
    fromWorldMs: 0, toWorldMs: at - 1,
  }];
  addLot(L, { lotId: piece.lotId, materialId: piece.input.materialId,
    amount: { value: piece.amountMg, unit: 'mg' }, location: SITE, quality: piece.quality });
  beginManualHuskWork(L, {
    commandId: 'begin:unrelated-hand-work', assumptionId: MANUAL_HUSK_ASSUMPTION.id,
    operatorId: 'res:other-worker', huskCount: 1, input: piece.input,
    worksite: { locationId: SITE, x: 0, z: 0, reachM: 1 }, openedAtWorldMs: at,
  });
  assert.notEqual((L as any).huskSoakRecords, previousRecords,
    'the real transaction replaced nested identities on the same ledger root');
  const records = (L as any).huskSoakRecords;
  const originals = records.finished.slice();
  const proofs = { ...records.provenance };
  let foreignProofReads = 0;
  for (let n = 0; n < records.finished.length; n++) {
    const original = records.finished[n];
    records.finished[n] = new Proxy(original, {
      get(target, key, receiver) {
        if (key === 'runId') return Reflect.get(target, key, receiver);
        foreignProofReads++;
        throw new Error('unrelated finished proof read');
      },
      ownKeys() {
        foreignProofReads++;
        throw new Error('unrelated finished proof enumerated');
      },
    });
  }
  for (const key of Object.keys(proofs)) {
    records.provenance[key] = new Proxy(proofs[key], {
      get() {
        foreignProofReads++;
        throw new Error('unrelated material provenance read');
      },
      ownKeys() {
        foreignProofReads++;
        throw new Error('unrelated material provenance enumerated');
      },
    });
  }
  const span = fact(L, runId, at, at + MINUTE, 'guard:single');
  recordHuskSoakSpan(L, runId, span, span.confirmedAtWorldMs);
  assert.equal(foreignProofReads, 0);
  // Restore the traps before serialization and validate the real post-commit save.
  const after = (L as any).huskSoakRecords;
  after.finished = originals;
  after.provenance = proofs;
  restoreHuskSoak(json(L));
});


test('a warm read still checks the selected finished summary', () => {
  const { L, runId, at } = saturatedFixture();
  recordHuskSoakSpans(L, runId, [], at);
  const selected = (L as any).huskSoakRecords.finished[0];
  selected.digest++;
  reject(L, selected.runId, [], at);
});

test('cold JSON loads validate unrelated proof corruption before accepting new work', () => {
  const { L, runId, at } = saturatedFixture();
  const mutations = [
    (value: any) => { value.huskSoakRecords.finished[0].projection.waterMg++; },
    (value: any) => {
      const key = Object.keys(value.huskSoakRecords.provenance)[0];
      value.huskSoakRecords.provenance[key].input.waterMg++;
    },
    (value: any) => { value.runs[runId].state.data.totalImmersedMs++; },
  ];
  for (const mutate of mutations) {
    const bad = json(L);
    mutate(bad);
    reject(bad, runId, [fact(bad, runId, at, at + MINUTE, 'bad:cold')], at + MINUTE);
  }
});

test('full-cache batch, single, and JSON-resumed records are byte-identical', () => {
  const base = saturatedFixture();
  const spans = catchupSpans(base.L, base.runId, base.at);
  const now = spans.at(-1)!.confirmedAtWorldMs;
  const single = json(base.L);
  let expected: ReturnType<typeof recordHuskSoakSpan> | undefined;
  for (const span of spans) expected = recordHuskSoakSpan(single, base.runId, span, now);
  const batch = json(base.L);
  const actual = recordHuskSoakSpans(batch, base.runId, spans, now);
  same(actual, expected, 'full-cache projection');
  same(batch, single, 'full-cache whole JSON ledger');
  const resumed = restoreHuskSoak(json(batch));
  same(resumed, batch, 'JSON restore has no extra span or receipt');
});

test('full-cache catch-up and warm singles stay within shared-runner fast budgets', () => {
  const base = saturatedFixture();
  const spans = catchupSpans(base.L, base.runId, base.at);
  const now = spans.at(-1)!.confirmedAtWorldMs;
  const warmBatchMs: number[] = [];
  const coldBatchMs: number[] = [];
  for (let n = 0; n < 5; n++) {
    const warm = restoreHuskSoak(json(base.L));
    recordHuskSoakSpans(warm, base.runId, [], base.at);
    const startedWarm = performance.now();
    recordHuskSoakSpans(warm, base.runId, spans, now);
    warmBatchMs.push(performance.now() - startedWarm);

    const cold = json(base.L);
    const startedCold = performance.now();
    recordHuskSoakSpans(cold, base.runId, spans, now);
    coldBatchMs.push(performance.now() - startedCold);
  }
  const warm = restoreHuskSoak(json(base.L));
  const singles = catchupSpans(warm, base.runId, base.at, 120);
  const singleMs: number[] = [];
  for (const span of singles) {
    const started = performance.now();
    recordHuskSoakSpan(warm, base.runId, span, span.confirmedAtWorldMs);
    singleMs.push(performance.now() - started);
  }
  const warmMedian = median(warmBatchMs);
  const coldMedian = median(coldBatchMs);
  const singleMedian = median(singleMs);
  const singleMean = singleMs.reduce((sum, value) => sum + value, 0) / singleMs.length;
  const sortedSingles = [...singleMs].sort((a, b) => a - b);
  console.log(JSON.stringify({
    fullCache: {
      finished: LIMIT, provenance: LIMIT, historyPerProof: LIMIT, recent: LIMIT,
      serializedBytes: JSON.stringify(base.L).length * 2,
    },
    spansPerBatch: spans.length,
    warmBatchMs, coldBatchMs, warmMedianMs: warmMedian, coldMedianMs: coldMedian,
    singleMedianMs: singleMedian, singleMeanMs: singleMean,
    singleP95Ms: sortedSingles[Math.floor(sortedSingles.length * 0.95)],
  }));
  // Fast checks share CPU with other workers. Keep the raw timings above for
  // profiling; use contention-tolerant smoke budgets rather than isolated targets.
  const batchBudgetMs = 500;
  const singleBudgetMs = 5;
  assert.ok(warmMedian <= batchBudgetMs,
    'warm 720-span batch median must be at most ' + batchBudgetMs + ' ms');
  assert.ok(coldMedian <= batchBudgetMs,
    'JSON-loaded 720-span batch median must be at most ' + batchBudgetMs + ' ms');
  assert.ok(singleMedian <= singleBudgetMs && singleMean <= singleBudgetMs,
    'warm one-span median and mean must be at most ' + singleBudgetMs + ' ms');
});

console.log('PASS husk soak batch: ' + groups + ' groups.');
