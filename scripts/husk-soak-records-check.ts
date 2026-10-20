import assert from 'node:assert/strict';
import { addLot, emptyLedger, startRun, type Ledger } from '../src/world/process-runner';
import type { LotView } from '../src/world/science-contract';
import {
  beginHuskSoak, recordHuskSoakSpan, takeOutHuskSoak, projectHuskSoak,
  restoreHuskSoak, readSoakedHuskInput, readHuskResoakSource,
  HUSK_SOAK_WORK, type HuskSoakStart, type HuskSoakSpan,
} from '../src/world/husk-soak-work';
import {
  HUSK_SOAK_ASSUMPTION, computeHuskSoak, splitSoakedHusks,
} from '../src/science/prototypes/husk-soak';
import {
  beginManualHuskWork, recordManualHuskSpan, projectManualHuskWork,
  type HuskWorkSpec,
} from '../src/world/manual-husk-work';
import {
  MANUAL_HUSK_ASSUMPTION, createManualHuskAssumptionProfile,
} from '../src/science/prototypes/manual-husk-assumptions';

const FULL = HUSK_SOAK_ASSUMPTION.durationMs;
const Q = HUSK_SOAK_ASSUMPTION.quantumMs;
const SITE = 'site:retention-pool';
const ACTOR = 'res:retention-worker';
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let groups = 0;
function test(name: string, fn: () => void): void {
  fn();
  groups++;
  console.log('PASS ' + name);
}
function source(): LotView {
  return {
    lotId: 'lot:raw-husk', materialId: 'coconut_husk',
    amount: { value: 400_000, unit: 'mg' }, location: SITE,
    quality: { count: 1, water_ppm: 250_000, ash_dry_ppm: 0, history_complete: 1 },
  };
}
function spec(at: number, commandId = 'begin'): HuskSoakStart {
  return {
    commandId, assumptionId: HUSK_SOAK_ASSUMPTION.id, actorId: ACTOR,
    lotId: 'lot:raw-husk', site: { locationId: SITE, kind: 'coastal-tide-pool' },
    atWorldMs: at, atIslandMs: at, presence: 'here',
  };
}
function span(L: Ledger, runId: string, from: number, to: number, recordId = 'span'): HuskSoakSpan {
  return {
    recordId, worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId, siteId: SITE,
    fromWorldMs: from, toWorldMs: to, fromIslandMs: from, toIslandMs: to,
    confirmedAtWorldMs: to, immersed: true,
  };
}
function take(L: Ledger, runId: string, at: number, intentId = 'out') {
  return takeOutHuskSoak(L, runId, {
    intentId, kind: 'take-out', actorId: ACTOR, presence: 'here',
    atWorldMs: at, atIslandMs: at,
  }, at);
}
function handSpec(L: Ledger, lotId: string, at: number): HuskWorkSpec {
  return {
    commandId: 'beat:' + lotId, assumptionId: MANUAL_HUSK_ASSUMPTION.id,
    operatorId: ACTOR, huskCount: 1, input: readSoakedHuskInput(L, lotId),
    worksite: { locationId: SITE, x: 0, z: 0, reachM: 1 }, openedAtWorldMs: at,
  };
}
function finishBeating(L: Ledger, runId: string, s: HuskWorkSpec): number {
  const profile = createManualHuskAssumptionProfile(s.input, MANUAL_HUSK_ASSUMPTION.id);
  const duration = Math.ceil(profile.knots.at(-1)!.workMs / Q) * Q;
  const fact = {
    kind: 'executor-activity-span' as const, spanId: 'beat:' + runId,
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId, actorId: ACTOR,
    fromWorldMs: s.openedAtWorldMs, toWorldMs: s.openedAtWorldMs + duration,
    confirmedAtWorldMs: s.openedAtWorldMs + duration,
    activity: 'separate-wet-husk' as const, targetLotId: s.input.lotId,
    targetSiteId: SITE, arrived: true,
    fromPosition: { x: 0, z: 0 }, toPosition: { x: 0, z: 0 },
  };
  recordManualHuskSpan(L, runId, fact, fact.confirmedAtWorldMs);
  assert.equal(projectManualHuskWork(L, runId).status, 'completed');
  const settled = json(L);
  recordManualHuskSpan(L, runId, fact, fact.confirmedAtWorldMs);
  assert.deepEqual(L, settled);
  return fact.toWorldMs;
}
function counts(L: Ledger) {
  const m = (L as any).huskSoakRecords;
  assert.ok(m.recent.length <= 64);
  assert.ok(m.finished.length <= 64);
  return m;
}

test('one hundred soak-and-beat cycles leave no terminal runs and reach a metadata plateau', () => {
  let L = emptyLedger('world:retention', 'epoch:1'), at = 1_000;
  let bytesAt70 = 0;
  for (let n = 0; n < 100; n++) {
    addLot(L, source());
    const s = spec(at, 'begin:' + n);
    const { runId } = beginHuskSoak(L, s, at);
    recordHuskSoakSpan(L, runId, span(L, runId, at, at + FULL), at + FULL);
    const out = take(L, runId, at + FULL, 'out:' + n);
    assert.equal(L.runs[runId], undefined);
    assert.equal(out.waterMg, 600_000);
    assert.equal(out.drawnWaterMg, 500_000);
    const settled = json(L);
    assert.deepEqual(take(L, runId, at + FULL, 'out:' + n), out);
    assert.deepEqual(L, settled);
    assert.deepEqual(beginHuskSoak(L, s, at), { runId });
    assert.deepEqual(L, settled);
    const wet = out.outputs[0];
    const hand = handSpec(L, wet.lotId, at + FULL + 1);
    const beaten = beginManualHuskWork(L, hand);
    at = finishBeating(L, beaten.runId, hand) + 1;
    assert.equal(L.runs[beaten.runId], undefined);
    assert.equal(Object.values(L.lots).reduce((total, lot) => total + lot.amount.value, 0), 900_000);
    // Physical products are deliberately disposed by this test, outside the
    // scientific APIs. The bound concerns bookkeeping, not an ever-growing stock.
    for (const lotId of Object.keys(L.lots)) delete L.lots[lotId];
    L = restoreHuskSoak(json(L));
    const m = counts(L);
    assert.equal(Object.keys(m.provenance).length, 0);
    assert.equal(Object.values(L.runs).some(r => ['completed', 'stopped', 'failed'].includes(r.status)), false);
    if (n === 69) bytesAt70 = JSON.stringify(L).length;
  }
  const bytesAt100 = JSON.stringify(L).length;
  assert.ok(bytesAt100 <= bytesAt70 + 5_000, JSON.stringify({ bytesAt70, bytesAt100 }));
  assert.ok(bytesAt100 < 600_000, String(bytesAt100));
  console.log(JSON.stringify({ cycles: 100, bytesAt70, bytesAt100 }));
});

test('long active soaking stores cumulative time and only the latest sixty-four exact spans', () => {
  let L = emptyLedger('world:long-soak', 'epoch:1');
  addLot(L, source());
  const start = 1_000, s = spec(start);
  const { runId } = beginHuskSoak(L, s, start);
  let bytesAt100 = 0;
  for (let n = 0; n < 2_000; n++) {
    const f = span(L, runId, start + n * Q, start + (n + 1) * Q, 'span:' + n);
    recordHuskSoakSpan(L, runId, f, f.confirmedAtWorldMs);
    if (n % 100 === 0) L = restoreHuskSoak(json(L));
    const d = L.runs[runId].state!.data as any;
    assert.ok(d.frames.length <= 64 && d.history.length <= 64);
    assert.equal(d.frameCount, n + 1);
    assert.equal(d.totalImmersedMs, (n + 1) * Q);
    counts(L);
    if (n === 99) bytesAt100 = JSON.stringify(L).length;
  }
  const bytesAt2000 = JSON.stringify(L).length;
  assert.ok(bytesAt2000 <= bytesAt100 + 5_000, JSON.stringify({ bytesAt100, bytesAt2000 }));
  const before = json(L);
  assert.throws(() => recordHuskSoakSpan(L, runId, span(L, runId, start, start + Q, 'span:0'), start + 2_000 * Q));
  assert.deepEqual(L, before);
  const now = start + 2_000 * Q;
  const recent = span(L, runId, now - Q, now, 'span:1999');
  recordHuskSoakSpan(L, runId, recent, now);
  assert.deepEqual(L, before);
  const result = take(L, runId, now);
  const whole = emptyLedger('world:long-soak', 'epoch:1');
  addLot(whole, source());
  const once = beginHuskSoak(whole, s, start);
  recordHuskSoakSpan(whole, once.runId, span(whole, once.runId, start, now), now);
  assert.deepEqual(result, take(whole, once.runId, now));
  console.log(JSON.stringify({ activeSpans: 2_000, bytesAt100, bytesAt2000 }));
});

function oldSave(version: 1 | 2, completed = false) {
  const L = emptyLedger('world:legacy-soak', 'epoch:1'), original = source(), start = 1_000;
  addLot(L, original);
  const s = spec(start), work = startRun(L, {
    processId: HUSK_SOAK_WORK.processId, processVersion: 'host-' + version,
    catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'island',
    lotIds: [original.lotId], equipmentIds: [], operator: ACTOR,
  }, start).run!;
  const duration = completed ? FULL : Q;
  const f = span(L, work.runId, start, start + duration);
  const intent = completed ? {
    intentId: 'out', kind: 'take-out' as const, actorId: ACTOR, presence: 'here' as const,
    atWorldMs: start + duration, atIslandMs: start + duration,
  } : null;
  const p = computeHuskSoak(original, s.assumptionId, duration);
  const outputs = completed ? splitSoakedHusks(original, s.assumptionId, duration, {
    runId: work.runId, fromWorldMs: start, toWorldMs: start + duration,
  }, version === 1) : [];
  for (const piece of outputs) {
    piece.input.soakHistory = [{
      recordId: 'record:husk-soak:' + JSON.stringify([work.runId, 0]),
      runId: work.runId, fromWorldMs: start, toWorldMs: start + duration,
    }];
    addLot(L, {lotId: piece.lotId, materialId: piece.input.materialId,
      amount: {value: piece.amountMg, unit: 'mg'}, location: SITE, quality: piece.quality});
  }
  if (completed) delete L.lots[original.lotId];
  work.status = completed ? 'completed' : 'running';
  work.lastTo = start + duration;
  work.state = {schema: 'civ-world.husk-soak/' + version, data: {
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId: work.runId,
    spec: s, source: original, frames: [f], takeOut: intent,
    totalImmersedMs: duration, historyComplete: 1, outputs,
    drawn: completed ? [{materialId: 'sea_water',
      amount: {value: p.drawnWaterMg, unit: 'mg'}, from: 'water'}] : [],
    ...(version === 2 ? {previousHistory: [], origin: null} : {}),
  }};
  return {L, runId: work.runId, start, original, outputs};
}

test('old active saves migrate once without changing clocks, reservations or sequence', () => {
  for (const version of [1, 2] as const) {
    const old = oldSave(version), seq = old.L.seq, sourceBefore = json(old.L.lots);
    const L = restoreHuskSoak(json(old.L));
    assert.equal(L.seq, seq);
    assert.deepEqual(L.lots, sourceBefore);
    assert.equal(L.runs[old.runId].processVersion, HUSK_SOAK_WORK.processVersion);
    assert.equal(L.runs[old.runId].state!.schema, HUSK_SOAK_WORK.schema);
    assert.equal(projectHuskSoak(L, old.runId).certifiedIslandMs, Q);
    const migrated = json(L);
    assert.deepEqual(restoreHuskSoak(json(L)), migrated);
    recordHuskSoakSpan(L, old.runId,
      span(L, old.runId, old.start + Q, old.start + FULL, 'continued'), old.start + FULL);
    const out = take(L, old.runId, old.start + FULL);
    const expected = splitSoakedHusks(old.original, HUSK_SOAK_ASSUMPTION.id, FULL, {
      runId: old.runId, fromWorldMs: old.start, toWorldMs: old.start + FULL,
    }, version === 1);
    assert.deepEqual(out.outputs.map(p => p.lotId), expected.map(p => p.lotId));
    assert.equal(out.waterMg, 600_000);
    const relabel = json(old.L);
    relabel.runs[old.runId].processVersion = HUSK_SOAK_WORK.processVersion;
    relabel.runs[old.runId].state!.schema = HUSK_SOAK_WORK.schema;
    assert.throws(() => restoreHuskSoak(relabel));
  }
});

test('an old active save retains its original uptake slope after partial take-out and re-soaking', () => {
  const old = oldSave(1), half = FULL / 2;
  let L = restoreHuskSoak(json(old.L));
  recordHuskSoakSpan(L, old.runId,
    span(L, old.runId, old.start + Q, old.start + half, 'partial'), old.start + half);
  const partial = take(L, old.runId, old.start + half);
  assert.equal(L.runs[old.runId], undefined);
  const wet = partial.outputs[0], unchanged = json(L.lots[wet.lotId]);
  assert.equal(wet.quality.soak_origin_dry_mg, undefined);
  const carry = readHuskResoakSource(L, wet.lotId);
  assert.equal(carry.quality!.soak_elapsed_ms, half);
  assert.deepEqual(L.lots[wet.lotId], unchanged);
  L = restoreHuskSoak(json(L));
  const start = old.start + half;
  const again = beginHuskSoak(L, { ...spec(start, 'again'), lotId: wet.lotId }, start);
  recordHuskSoakSpan(L, again.runId, span(L, again.runId, start, old.start + FULL, 'continued'),
    old.start + FULL);
  const out = take(L, again.runId, old.start + FULL, 'again-out');
  assert.equal(out.waterMg, computeHuskSoak(old.original, HUSK_SOAK_ASSUMPTION.id, FULL).waterMg);
  assert.equal(out.waterMg, 600_000);
});

test('producer deletion preserves old wet lots and the fingerprint of a reserved hand-work input', () => {
  const old = oldSave(1, true), wet = old.outputs[0], at = old.start + FULL + 1;
  const hand: HuskWorkSpec = {
    commandId: 'beat:legacy', assumptionId: MANUAL_HUSK_ASSUMPTION.id,
    operatorId: ACTOR, huskCount: 1, input: json(wet.input),
    worksite: {locationId: SITE, x: 0, z: 0, reachM: 1}, openedAtWorldMs: at,
  };
  const begun = beginManualHuskWork(old.L, hand);
  const before = json(old.L.lots[wet.lotId]), manualBefore = json(old.L.runs[begun.runId]);
  const L = restoreHuskSoak(json(old.L));
  assert.equal(L.runs[old.runId], undefined);
  assert.deepEqual(L.lots[wet.lotId], before);
  assert.deepEqual(L.runs[begun.runId], manualBefore);
  assert.deepEqual(readSoakedHuskInput(L, wet.lotId), wet.input);
  assert.equal(readHuskResoakSource(L, wet.lotId).quality!.soak_elapsed_ms, FULL);
  assert.deepEqual(L.lots[wet.lotId], before);
  finishBeating(L, begun.runId, hand);
  assert.equal(L.lots[wet.lotId], undefined);
  assert.equal(Object.keys((restoreHuskSoak(json(L)) as any).huskSoakRecords.provenance).length, 0);
});

console.log('husk-soak-records-check: ' + groups + ' groups passed');
