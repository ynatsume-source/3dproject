import assert from 'node:assert/strict';
import { addLot, emptyLedger, type Ledger } from '../src/world/process-runner';
import type { LotView, ScienceStepRequest } from '../src/world/science-contract';
import { coconutMilkStep, COCONUT_MILK_PROCESS } from '../src/science/step/coconut';
import { SCIENCE_CATALOG_VERSION } from '../src/science/step/common';
import { MANUAL_HUSK_ASSUMPTION, createManualHuskAssumptionProfile } from '../src/science/prototypes/manual-husk-assumptions';
import { beginManualHuskWork, projectManualHuskWork, recordManualHuskSpan, type HuskWorkSpec } from '../src/world/manual-husk-work';
import { applyHuskIntent } from '../src/world/manual-husk-workflow';
import { otherScienceWorkBusy } from '../src/world/science-work-occupancy';
import { HUSK_SOAK_ASSUMPTION } from '../src/science/prototypes/husk-soak';
import {
  beginHuskSoak, recordHuskSoakSpan, takeOutHuskSoak, projectHuskSoak,
  readSoakedHuskInput, restoreHuskSoak, readHuskSoakWorksite,
  huskWorkFailureObservations, HUSK_SOAK_WORK,
} from '../src/world/husk-soak-work';

const DAY = 86_400_000;
const FULL = 5 * DAY;
const WORLD = 1_001;
const ISLAND = 7_001;
const SITE = 'site:coastal-tide-pool';
const ACTOR = 'res:husk-worker';
let groups = 0;
function test(name: string, check: () => void): void {
  check();
  groups += 1;
  console.log('PASS ' + name);
}
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const sum = (values: number[]): bigint => values.reduce((n, v) => n + BigInt(v), 0n);

function sourceLot(amountMg = 900_007, count = 3, waterPpm = 250_000, historyComplete = 1): LotView {
  return {
    lotId: 'lot:source-husks', materialId: 'coconut_husk',
    amount: { value: amountMg, unit: 'mg' }, location: SITE,
    quality: { count, water_ppm: waterPpm, ash_dry_ppm: 10_000, history_complete: historyComplete },
  };
}
function fixture(source = sourceLot()) {
  const L = emptyLedger('world:husk-soak-check', 'epoch:1');
  addLot(L, json(source));
  const spec = {
    commandId: 'intent:begin-soak', assumptionId: HUSK_SOAK_ASSUMPTION.id,
    actorId: ACTOR, lotId: source.lotId,
    site: { locationId: SITE, kind: 'coastal-tide-pool' as const },
    atWorldMs: WORLD, atIslandMs: ISLAND, presence: 'here' as const,
  };
  const { runId } = beginHuskSoak(L, spec, WORLD);
  return { L, source: json(source), spec, runId };
}
type Fixture = ReturnType<typeof fixture>;
function span(a: Fixture, from: number, to: number, recordId = 'span:immersion', immersed: boolean | null = true) {
  return {
    recordId, worldId: a.L.world.worldId, worldEpoch: a.L.world.worldEpoch,
    runId: a.runId, siteId: SITE,
    fromWorldMs: WORLD + from, toWorldMs: WORLD + to,
    fromIslandMs: ISLAND + from, toIslandMs: ISLAND + to,
    confirmedAtWorldMs: WORLD + to, immersed,
  };
}
function record(a: Fixture, from: number, to: number, recordId = 'span:immersion', immersed: boolean | null = true): void {
  const fact = span(a, from, to, recordId, immersed);
  recordHuskSoakSpan(a.L, a.runId, fact, fact.confirmedAtWorldMs);
}
function take(a: Fixture, elapsed: number, intentId = 'intent:take-out'): void {
  takeOutHuskSoak(a.L, a.runId, {
    intentId, kind: 'take-out', actorId: ACTOR, presence: 'here',
    atWorldMs: WORLD + elapsed, atIslandMs: ISLAND + elapsed,
  }, WORLD + elapsed);
}
const projection = (a: Fixture) => projectHuskSoak(a.L, a.runId);
const wetLots = (a: Fixture) => Object.values(a.L.lots)
  .filter(lot => lot.materialId === 'wet_unseparated_coconut_husk')
  .sort((a, b) => a.lotId.localeCompare(b.lotId));
function physical(a: Fixture) {
  return wetLots(a).map(lot => ({
    lotId: lot.lotId, amount: lot.amount, quality: lot.quality,
    input: readSoakedHuskInput(a.L, lot.lotId),
  }));
}
function rejectUnchanged(L: Ledger, action: () => unknown): void {
  const before = structuredClone(L);
  assert.throws(action);
  assert.deepEqual(L, before);
}
function auditTakenOut(a: Fixture): void {
  const p = projection(a);
  const lots = wetLots(a);
  assert.equal(lots.length, p.count);
  assert.equal(sum(lots.map(lot => lot.amount.value)), BigInt(a.source.amount.value) + BigInt(p.drawnWaterMg));
  assert.equal(sum(lots.map(lot => lot.quality!.dry_mg)), BigInt(p.dryMg));
  assert.equal(sum(lots.map(lot => lot.quality!.water_mg)), BigInt(p.waterMg));
  assert.equal(sum(p.drawn.map(flow => flow.amount.value)), BigInt(p.drawnWaterMg));
  for (const flow of p.drawn) {
    assert.equal(flow.from, 'water');
    assert.equal(flow.materialId, 'sea_water');
    assert.equal(flow.amount.unit, 'mg');
  }
  for (const lot of lots) {
    const q = lot.quality!;
    assert.equal(lot.amount.value, q.dry_mg + q.water_mg);
    assert.equal(q.husk_count, 1);
    assert.equal(q.unseparated, 1);
    assert.equal(q.history_complete, p.historyComplete);
    assert.ok(!lot.reservedBy);
    for (const v of [lot.amount.value, q.dry_mg, q.water_mg]) {
      assert.ok(Number.isSafeInteger(v) && v >= 0);
    }
  }
  assert.equal(a.L.lots[a.source.lotId], undefined);
}
function handSpec(L: Ledger, lotId: string, at: number): HuskWorkSpec {
  return {
    commandId: 'intent:hand:' + lotId, assumptionId: MANUAL_HUSK_ASSUMPTION.id,
    operatorId: ACTOR, huskCount: 1, input: readSoakedHuskInput(L, lotId),
    worksite: { locationId: SITE, x: 0, z: 0, reachM: 0.75 }, openedAtWorldMs: at,
  };
}
function completeHandWork(a: Fixture, lotId: string, at: number): void {
  const spec = handSpec(a.L, lotId, at);
  const { runId } = beginManualHuskWork(a.L, spec);
  const profile = createManualHuskAssumptionProfile(spec.input, MANUAL_HUSK_ASSUMPTION.id);
  const duration = Math.ceil(profile.knots.at(-1)!.workMs / 30_000) * 30_000;
  recordManualHuskSpan(a.L, runId, {
    kind: 'executor-activity-span', spanId: 'hand:' + lotId,
    worldId: a.L.world.worldId, worldEpoch: a.L.world.worldEpoch, runId, actorId: ACTOR,
    fromWorldMs: at, toWorldMs: at + duration, confirmedAtWorldMs: at + duration,
    activity: 'separate-wet-husk', targetLotId: lotId, targetSiteId: SITE, arrived: true,
    fromPosition: { x: 0, z: 0 }, toPosition: { x: 0, z: 0 },
  }, at + duration);
  assert.equal(projectManualHuskWork(a.L, runId).status, 'completed');
  assert.equal(a.L.lots[lotId], undefined);
}
function coconutProducer(count: number): LotView {
  const duration = count * 2_000_000;
  const req: ScienceStepRequest = {
    contract: '0.2.1', requestId: 'producer:request',
    world: { worldId: 'world:producer', worldEpoch: 'epoch:1', worldVersion: 0 },
    runId: 'run:producer', ...COCONUT_MILK_PROCESS, catalogVersion: SCIENCE_CATALOG_VERSION,
    interval: { from: 0, to: duration }, state: null,
    environment: { sampleId: 'env:producer', source: 'unknown', effectiveAt: 0 },
    lots: [{
      lotId: 'lot:coconuts', materialId: 'coconut',
      amount: { value: count * 1_500_001, unit: 'mg' }, location: SITE,
      quality: { count, history_complete: 1 },
    }],
    equipment: [{
      equipmentId: 'eq:tools', kind: 'fixture_coconut_tools',
      catalogEntry: 'fixture_coconut_tools', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1,
    }],
    energy: [{ sourceId: 'src:hand', kind: 'mechanical', maxJ: duration }],
    actions: [], seed: 12_345,
  };
  const result = coconutMilkStep(req);
  assert.equal(result.status, 'completed');
  const husk = result.produced.find(lot => lot.materialId === 'coconut_husk');
  assert.ok(husk);
  assert.equal(husk.quality!.count, count);
  return {
    lotId: 'lot:source-husks', materialId: husk.materialId,
    amount: json(husk.amount), quality: json(husk.quality), location: husk.into!,
  };
}

test('explicit assumption, tide pool and confirmed onsite intent', () => {
  assert.equal(HUSK_SOAK_ASSUMPTION.id, 'owner-assumption/husk-soak/2026-10-17/v1');
  for (const patch of [
    { assumptionId: undefined }, { assumptionId: 'default' },
    { site: { locationId: SITE, kind: 'freshwater-pool' } },
    { presence: 'away' }, { presence: 'unknown' }, { atWorldMs: WORLD + 1 },
  ]) {
    const L = emptyLedger('world:husk-soak-check', 'epoch:1');
    addLot(L, sourceLot());
    rejectUnchanged(L, () => beginHuskSoak(L, { ...fixture().spec, ...patch } as any, WORLD));
  }
  const a = fixture();
  assert.equal(a.L.runs[a.runId].clock, 'island');
  assert.equal(a.L.runs[a.runId].processId, HUSK_SOAK_WORK.processId);
  assert.equal(a.L.lots[a.source.lotId].reservedBy, a.runId);
});
test('real coconut output becomes four husks, each completes PR20 unchanged', () => {
  const a = fixture(coconutProducer(4));
  record(a, 0, FULL);
  take(a, FULL);
  auditTakenOut(a);
  const p = projection(a);
  assert.equal(p.waterMg, 2 * p.dryMg);
  const total = BigInt(a.source.amount.value) + BigInt(p.drawnWaterMg);
  const ids = wetLots(a).map(lot => lot.lotId);
  let at = WORLD + FULL + 1;
  for (const lotId of ids) {
    completeHandWork(a, lotId, at);
    at += 10_000_000;
  }
  assert.equal(sum(Object.values(a.L.lots).map(lot => lot.amount.value)), total);
  assert.equal(Object.values(a.L.lots).filter(lot => lot.materialId === 'coir_fiber_bundle').length, 4);
});
test('independent dry/water remainders and deterministic IDs', () => {
  const a = fixture();
  record(a, 0, FULL);
  take(a, FULL);
  auditTakenOut(a);
  const p = projection(a);
  p.outputs.forEach((out, i) => {
    assert.equal(out.quality.dry_mg, Math.floor(p.dryMg / p.count) + (i < p.dryMg % p.count ? 1 : 0));
    assert.ok(out.quality.water_mg <= 2 * out.quality.dry_mg);
    assert.equal(out.quality.soak_split_policy, 2);
  });
  const b = fixture();
  record(b, 0, FULL);
  take(b, FULL);
  assert.deepEqual(physical(a), physical(b));
});
test('integer cumulative linear growth and cap; no early inventory settlement', () => {
  const a = fixture(sourceLot(900_000, 1, 100_000));
  const start = projection(a);
  let from = 0;
  for (const to of [30_000, 2 * DAY, FULL, FULL + DAY]) {
    record(a, from, to, 'growth:' + to);
    const expected = start.initialWaterMg
      + Number(BigInt(2 * start.dryMg - start.initialWaterMg) * BigInt(Math.min(to, FULL)) / BigInt(FULL));
    assert.equal(projection(a).waterMg, expected);
    assert.equal(a.L.lots[a.source.lotId].amount.value, a.source.amount.value);
    from = to;
  }
  take(a, FULL + DAY);
  auditTakenOut(a);
});
test('odd partitions, JSON and replay preserve products and normalized provenance', () => {
  const whole = fixture();
  record(whole, 0, FULL, 'whole');
  take(whole, FULL);
  for (const ends of [
    [17_000, 29_999, 30_001, 12_345_678, FULL],
    [737, 29_003, DAY, 2 * DAY + 1, FULL - 1, FULL], [FULL - 29_999, FULL],
  ]) {
    const a = fixture();
    let from = 0;
    for (let i = 0; i < ends.length; i += 1) {
      const fact = span(a, from, ends[i], 'piece:' + i);
      recordHuskSoakSpan(a.L, a.runId, fact, fact.confirmedAtWorldMs);
      a.L = restoreHuskSoak(json(a.L));
      const before = structuredClone(a.L);
      recordHuskSoakSpan(a.L, a.runId, fact, fact.confirmedAtWorldMs + 1);
      assert.deepEqual(a.L, before);
      from = ends[i];
    }
    take(a, FULL);
    assert.deepEqual(physical(a), physical(whole));
    assert.deepEqual(projection(a).drawn, projection(whole).drawn);
  }
});
test('zero and sub-quantum take-out keep original lot reusable under its old ID', () => {
  for (const elapsed of [0, 29_999]) {
    const a = fixture();
    if (elapsed) record(a, 0, elapsed);
    assert.equal(projection(a).certifiedIslandMs, 0);
    take(a, elapsed);
    const { reservedBy: _, ...lot } = a.L.lots[a.source.lotId];
    assert.deepEqual(lot, a.source);
    assert.equal(a.L.lots[a.source.lotId].reservedBy, undefined);
    assert.deepEqual(projection(a).outputs, []);
    assert.equal(projection(a).drawnWaterMg, 0);
    const before = structuredClone(a.L);
    take(a, elapsed);
    assert.deepEqual(a.L, before);
    beginHuskSoak(a.L, {
      ...a.spec, commandId: 'begin-again',
      atWorldMs: WORLD + elapsed, atIslandMs: ISLAND + elapsed,
    }, WORLD + elapsed);
  }
});
test('only known submerged time counts, including carried fragments across a pause', () => {
  const a = fixture();
  record(a, 0, 17_000, 'wet-1');
  assert.equal(projection(a).pendingIslandMs, 17_000);
  record(a, 17_000, DAY, 'not-in-water', false);
  record(a, DAY, 2 * DAY, 'unknown', null);
  a.L = restoreHuskSoak(json(a.L));
  const before = structuredClone(a.L);
  readHuskSoakWorksite(a.L, a.runId);
  projection(a);
  assert.deepEqual(a.L, before);
  assert.equal(projection(a).waterMg, projection(a).initialWaterMg);
  record(a, 5 * DAY, 5 * DAY + 13_000, 'wet-2');
  assert.equal(projection(a).certifiedIslandMs, 30_000);
  assert.equal(projection(a).pendingIslandMs, 0);
  assert.equal(projection(a).historyComplete, 0);
  take(a, 5 * DAY + 13_000);
  auditTakenOut(a);
  assert.ok(wetLots(a).every(lot => lot.quality!.history_complete === 0));
});
test('over-wet source retains all its water and draws none', () => {
  const a = fixture(sourceLot(900_009, 3, 800_000));
  record(a, 0, FULL);
  take(a, FULL);
  auditTakenOut(a);
  assert.equal(projection(a).waterMg, projection(a).initialWaterMg);
  assert.deepEqual(projection(a).drawn, []);
});
test('insufficient soaking is a core refusal; sensory wording needs a certified onsite trial', () => {
  const a = fixture(sourceLot(310_000, 1, Math.round(10_000 / 310_000 * 1_000_000)));
  record(a, 0, 30_000);
  take(a, 30_000);
  const lotId = wetLots(a)[0].lotId;
  let error: unknown;
  const before = structuredClone(a.L);
  try {
    beginManualHuskWork(a.L, handSpec(a.L, lotId, WORLD + 30_001));
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof Error);
  assert.match(error.message, /insufficient input water/);
  assert.deepEqual(a.L, before);
  const attempt = {
    kind: 'executor-confirmed-husk-attempt' as const, actorId: ACTOR, lotId,
    presence: 'here' as const, attempted: true,
    atWorldMs: WORLD + 30_001, confirmedAtWorldMs: WORLD + 30_001,
  };
  assert.deepEqual(huskWorkFailureObservations(error, attempt, attempt.confirmedAtWorldMs)
    .map(o => o.text), ['殻が硬く、ほぐれない']);
  for (const patch of [
    { presence: 'away' }, { presence: 'unknown' }, { attempted: false },
    { confirmedAtWorldMs: attempt.confirmedAtWorldMs + 1 },
  ]) {
    assert.deepEqual(huskWorkFailureObservations(error, { ...attempt, ...patch } as any,
      attempt.confirmedAtWorldMs), []);
  }
  assert.deepEqual(huskWorkFailureObservations(error, undefined, attempt.confirmedAtWorldMs), []);
  assert.deepEqual(huskWorkFailureObservations(new Error('unrelated'), attempt, attempt.confirmedAtWorldMs), []);
});
test('waiting reserves the site, not the actor, through the actual shared occupancy gate', () => {
  const a = fixture();
  assert.deepEqual(otherScienceWorkBusy(a.L, ACTOR, SITE, 'prototype_manual_husk_work'),
    { actor: false, site: true });
  for (const process of ['prototype_coir_work', 'prototype_sail_work']) {
    assert.deepEqual(otherScienceWorkBusy(a.L, ACTOR, 'site:elsewhere', process),
      { actor: false, site: false });
    assert.deepEqual(otherScienceWorkBusy(a.L, ACTOR, SITE, process),
      { actor: false, site: true });
  }
  const second = sourceLot();
  second.lotId = 'lot:second-source';
  addLot(a.L, second);
  rejectUnchanged(a.L, () => beginHuskSoak(a.L, {
    ...a.spec, commandId: 'duplicate-site', lotId: second.lotId,
  }, WORLD));
  const input = {
    materialId: 'wet_unseparated_coconut_husk' as const, lotId: 'lot:unrelated',
    separation: 'never-separated' as const, dryMg: 300_000, waterMg: 600_000, soakHistory: [],
  };
  addLot(a.L, {
    lotId: input.lotId, materialId: input.materialId, location: 'site:elsewhere',
    amount: { value: 900_000, unit: 'mg' },
    quality: { dry_mg: 300_000, water_mg: 600_000, husk_count: 1, unseparated: 1, history_complete: 1 },
  });
  const facts = {
    assumptionId: MANUAL_HUSK_ASSUMPTION.id, huskCount: 1 as const, input,
    worksite: { locationId: 'site:elsewhere', x: 0, z: 0, reachM: 1 },
  };
  applyHuskIntent(a.L, {
    intentId: 'manual-elsewhere', kind: 'start', atWorldMs: WORLD, actorId: ACTOR,
    processId: 'prototype_manual_husk_work', lotId: input.lotId,
    siteId: 'site:elsewhere', presence: 'here',
  }, 0, WORLD, facts);
  assert.equal(readHuskSoakWorksite(a.L, a.runId).operatorFree, true);
  rejectUnchanged(a.L, () => take(a, 0));
});
test('hand-work arrangement cannot start on the reserved tide pool', () => {
  const a = fixture();
  const input = {
    materialId: 'wet_unseparated_coconut_husk' as const, lotId: 'lot:hand-at-pool',
    separation: 'never-separated' as const, dryMg: 300_000, waterMg: 600_000, soakHistory: [],
  };
  addLot(a.L, {
    lotId: input.lotId, materialId: input.materialId, location: SITE,
    amount: { value: 900_000, unit: 'mg' },
    quality: { dry_mg: 300_000, water_mg: 600_000, husk_count: 1, unseparated: 1, history_complete: 1 },
  });
  rejectUnchanged(a.L, () => applyHuskIntent(a.L, {
    intentId: 'manual-conflict', kind: 'start', atWorldMs: WORLD, actorId: 'res:other',
    processId: 'prototype_manual_husk_work', lotId: input.lotId, siteId: SITE, presence: 'here',
  }, 0, WORLD, {
    assumptionId: MANUAL_HUSK_ASSUMPTION.id, huskCount: 1, input,
    worksite: { locationId: SITE, x: 0, z: 0, reachM: 1 },
  }));
});
test('future, overlap, wrong identity and conflicting confirmations reject atomically', () => {
  const a = fixture();
  const f = span(a, 0, 17_000, 'first');
  rejectUnchanged(a.L, () => recordHuskSoakSpan(a.L, a.runId, f, f.confirmedAtWorldMs - 1));
  for (const patch of [
    { worldId: 'other' }, { worldEpoch: 'other' }, { runId: 'other' },
    { siteId: 'other' }, { immersed: 'yes' }, { toIslandMs: Infinity }, { fromIslandMs: ISLAND - 1 },
  ]) {
    rejectUnchanged(a.L, () => recordHuskSoakSpan(a.L, a.runId,
      { ...f, ...patch } as any, f.confirmedAtWorldMs));
  }
  recordHuskSoakSpan(a.L, a.runId, f, f.confirmedAtWorldMs);
  rejectUnchanged(a.L, () => recordHuskSoakSpan(a.L, a.runId,
    { ...f, immersed: false }, f.confirmedAtWorldMs));
  rejectUnchanged(a.L, () => record(a, 16_999, 30_000, 'overlap'));
  rejectUnchanged(a.L, () => beginHuskSoak(a.L, { ...a.spec, actorId: 'changed' }, WORLD));
});
test('settlement and old confirmations stay idempotent after JSON and receipt eviction', () => {
  const a = fixture();
  record(a, 0, FULL);
  take(a, FULL);
  a.L = restoreHuskSoak(json(a.L));
  a.L.committed = Array.from({ length: 500 }, (_, i) => 'unrelated:' + i);
  const before = structuredClone(a.L);
  take(a, FULL);
  recordHuskSoakSpan(a.L, a.runId, span(a, 0, FULL), WORLD + FULL);
  assert.deepEqual(beginHuskSoak(a.L, a.spec, WORLD + FULL), { runId: a.runId });
  assert.deepEqual(a.L, before);
  rejectUnchanged(a.L, () => take(a, FULL + 1, 'other-take-out'));
});
test('corrupt saves and reserved-source changes cannot silently settle', () => {
  const bad = fixture();
  bad.L.runs[bad.runId].state!.schema = 'civ-world.husk-soak/old';
  assert.throws(() => restoreHuskSoak(json(bad.L)));
  for (const mutate of [
    (a: Fixture) => { a.L.lots[a.source.lotId].amount.value += 1; },
    (a: Fixture) => { a.L.lots[a.source.lotId].quality!.water_ppm += 1; },
    (a: Fixture) => { a.L.lots[a.source.lotId].location = 'elsewhere'; },
    (a: Fixture) => { delete a.L.lots[a.source.lotId].reservedBy; },
    (a: Fixture) => { (a.L.runs[a.runId].state!.data as any).totalImmersedMs = 1; },
  ]) {
    const a = fixture();
    mutate(a);
    rejectUnchanged(a.L, () => record(a, 0, FULL));
    rejectUnchanged(a.L, () => take(a, 0));
  }
});
test('caller-owned data and returned projections cannot mutate saved authority', () => {
  const a = fixture();
  const f = span(a, 0, 17_000);
  recordHuskSoakSpan(a.L, a.runId, f, f.confirmedAtWorldMs);
  f.immersed = false;
  a.spec.site.locationId = 'tampered';
  projection(a).waterMg = 999;
  assert.equal(projection(a).pendingIslandMs, 17_000);
  assert.notEqual(projection(a).waterMg, 999);
  record(a, 17_000, FULL, 'remaining');
  take(a, FULL);
  auditTakenOut(a);
});
test('public views are read-only sensory facts without hidden values or recipe guidance', () => {
  const a = fixture();
  let from = 0;
  for (const to of [0, 30_000, DAY, FULL]) {
    if (to) record(a, from, to, 'observe:' + to);
    const before = structuredClone(a.L);
    const view = readHuskSoakWorksite(a.L, a.runId);
    assert.equal(view.operatorFree, true);
    assert.deepEqual(a.L, before);
    assert.deepEqual(Object.keys(view).sort(),
      ['title', 'stage', 'activity', 'materialsReserved', 'operatorFree', 'observations'].sort());
    for (const o of view.observations) {
      assert.deepEqual(Object.keys(o).sort(), ['channel', 'text']);
      assert.ok(!/[0-9]|mg|gf|profile|seed|仮定|キメ値|配分|残量|残り|秒|日|時間|先に|次は/.test(o.text));
    }
    from = to;
  }
  take(a, FULL);
  assert.ok(readHuskSoakWorksite(a.L, a.runId).observations
    .some(o => o.text === '浸けた殻を引き上げた'));
});

function repeatSoak(L: Ledger, lotId: string, offset: number, duration: number, command: string) {
  const spec = {
    commandId: command, assumptionId: HUSK_SOAK_ASSUMPTION.id,
    actorId: ACTOR, lotId, site: { locationId: SITE, kind: 'coastal-tide-pool' as const },
    atWorldMs: WORLD + offset, atIslandMs: ISLAND + offset, presence: 'here' as const,
  };
  const before = json(L.lots[lotId]);
  const started = beginHuskSoak(L, spec, spec.atWorldMs);
  if (duration > 0) {
    const fact = {
      recordId: command + ':span', worldId: L.world.worldId, worldEpoch: L.world.worldEpoch,
      runId: started.runId, siteId: SITE,
      fromWorldMs: WORLD + offset, toWorldMs: WORLD + offset + duration,
      fromIslandMs: ISLAND + offset, toIslandMs: ISLAND + offset + duration,
      confirmedAtWorldMs: WORLD + offset + duration, immersed: true,
    };
    recordHuskSoakSpan(L, started.runId, fact, fact.confirmedAtWorldMs);
  }
  const intent = {
    intentId: command + ':out', kind: 'take-out' as const, actorId: ACTOR, presence: 'here' as const,
    atWorldMs: WORLD + offset + duration, atIslandMs: ISLAND + offset + duration,
  };
  const out = takeOutHuskSoak(L, started.runId, intent, intent.atWorldMs);
  const settled = json(L);
  takeOutHuskSoak(L, started.runId, intent, intent.atWorldMs);
  assert.deepEqual(L, settled);
  assert.equal(sum(out.outputs.map(p => p.amountMg)),
    out.outputs.length ? BigInt(before.amount.value) + BigInt(out.drawnWaterMg) : 0n);
  return { ...started, projection: out };
}

function asLegacySoakSave(L: Ledger): Ledger {
  const old = json(L);
  for (const run of Object.values(old.runs)) {
    if (run.processId !== HUSK_SOAK_WORK.processId) continue;
    run.processVersion = 'host-1';
    run.state!.schema = 'civ-world.husk-soak/1';
    const data = run.state!.data as any;
    delete data.previousHistory;
    delete data.origin;
    for (const piece of data.outputs) {
      for (const key of Object.keys(piece.quality)) {
        if (key.startsWith('soak_')) delete piece.quality[key];
      }
      if (old.lots[piece.lotId]) old.lots[piece.lotId].quality = json(piece.quality);
    }
  }
  return old;
}

test('an early take-out can be soaked again at the original rate and then beaten', () => {
  const a = fixture(sourceLot(1_120_000, 1, 250_000));
  record(a, 0, DAY);
  take(a, DAY);
  const early = wetLots(a)[0];
  assert.equal(early.quality!.dry_mg, 840_000);
  assert.throws(() => beginManualHuskWork(a.L, handSpec(a.L, early.lotId, WORLD + DAY)));
  const earlyWater = early.quality!.water_mg;
  const next = repeatSoak(a.L, early.lotId, DAY, FULL - DAY, 'resoak');
  const continued = fixture(sourceLot(1_120_000, 1, 250_000));
  record(continued, 0, FULL);
  take(continued, FULL);
  assert.equal(next.projection.waterMg, projection(continued).waterMg);
  assert.equal(next.projection.drawnWaterMg + earlyWater, next.projection.waterMg);
  assert.equal(next.projection.outputs[0].input.soakHistory.length, 2);
  a.L = restoreHuskSoak(json(a.L));
  completeHandWork(a, next.projection.outputs[0].lotId, WORLD + FULL + 1);
});

test('odd count splits retain every fractional mg over repeated take-outs and cap each new piece', () => {
  for (const source of [sourceLot(900_007, 3, 250_000), sourceLot(17, 4, 0)]) {
    const continuous = fixture(source);
    record(continuous, 0, FULL);
    take(continuous, FULL);
    const expected = projection(continuous).outputs;
    const interrupted = fixture(source);
    record(interrupted, 0, DAY);
    take(interrupted, DAY);
    let offset = DAY;
    for (let i = 0; i < projection(interrupted).outputs.length; i++) {
      const piece = projection(interrupted).outputs[i];
      const middle = repeatSoak(interrupted.L, piece.lotId, offset, DAY, 'again:' + i);
      offset += DAY;
      interrupted.L = restoreHuskSoak(json(interrupted.L));
      const final = repeatSoak(interrupted.L, middle.projection.outputs[0].lotId,
        offset, FULL - 2 * DAY, 'final:' + i);
      offset += FULL - 2 * DAY;
      const actual = final.projection.outputs[0];
      assert.equal(actual.quality.dry_mg, expected[i].quality.dry_mg);
      assert.equal(actual.quality.water_mg, expected[i].quality.water_mg);
      assert.ok(actual.quality.water_mg <= 2 * actual.quality.dry_mg);
    }
  }
});

test('old in-progress and old taken-out saves keep their old water and can continue soaking', () => {
  const oldActive = fixture(sourceLot(1_120_000, 1, 250_000));
  record(oldActive, 0, DAY);
  oldActive.L = restoreHuskSoak(asLegacySoakSave(oldActive.L));
  const before = projection(oldActive).waterMg;
  record(oldActive, DAY, 2 * DAY, 'after-old-load');
  assert.ok(projection(oldActive).waterMg > before);
  take(oldActive, 2 * DAY);
  const oldWet = wetLots(oldActive)[0];
  oldActive.L = restoreHuskSoak(asLegacySoakSave(oldActive.L));
  const oldQuality = json(oldActive.L.lots[oldWet.lotId].quality);
  const zero = repeatSoak(oldActive.L, oldWet.lotId, 2 * DAY, 29_999, 'old-zero');
  assert.deepEqual(oldActive.L.lots[oldWet.lotId].quality, oldQuality);
  assert.equal(zero.projection.outputs.length, 0);
  oldActive.L = restoreHuskSoak(json(oldActive.L));
  const resumed = repeatSoak(oldActive.L, oldWet.lotId, 2 * DAY + 29_999,
    FULL - 2 * DAY, 'old-resoak');
  assert.equal(resumed.projection.waterMg, 1_680_000);
  assert.ok(resumed.projection.outputs[0].quality.soak_elapsed_ms === FULL);
  completeHandWork(oldActive, resumed.projection.outputs[0].lotId,
    WORLD + FULL + 30_000);
});

test('taking out repeatedly does not reset the uptake clock or manufacture fractional water', () => {
  const a = fixture(sourceLot(123_457, 1, 123_456));
  const rounds = 33;
  const total = rounds * 30_000;
  record(a, 0, 30_000);
  take(a, 30_000);
  let current = wetLots(a)[0].lotId;
  let gained = projection(a).drawnWaterMg;
  for (let i = 1; i < rounds; i++) {
    a.L = restoreHuskSoak(json(a.L));
    const out = repeatSoak(a.L, current, i * 30_000, 30_000, 'tiny:' + i);
    current = out.projection.outputs[0].lotId;
    assert.ok(current.length < 100, 'resumed lot IDs must not recursively contain old IDs');
    gained += out.projection.drawnWaterMg;
  }
  const whole = fixture(sourceLot(123_457, 1, 123_456));
  record(whole, 0, total);
  take(whole, total);
  assert.equal(a.L.lots[current].quality!.water_mg, projection(whole).waterMg);
  assert.equal(gained, projection(whole).drawnWaterMg);
});

console.log('PASS husk soak science and host boundary: ' + groups + ' groups; no resident registration.');
