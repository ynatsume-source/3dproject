import assert from 'node:assert/strict';
import {addLot, emptyLedger, type Ledger} from '../src/world/process-runner';
import {ISLAND_EPOCH, ISLAND_RATE} from '../src/world/island-time';
import {SAIL_RULES as R, type PlantMass} from '../src/science/prototypes/sail-raft-rules';
import {
  readPlantMass, readSailMat, readBambooMast, writePlantMass,
} from '../src/world/sail-lots';
import {
  SAIL_WORK, applySailIntent, recordSailSpan, restoreSailWork, sailWorkRevision,
  projectSailWork, readSailWorksite, readSailWorkerObservations,
  sailFailureObservations, SailWorkError,
  type Operation, type SailIntent, type SailSpan,
  type SailStartFacts, type SailWorkLedger,
} from '../src/world/sail-work';

const ID = 'owner-assumption/sail-raft/2026-10-18/v2-island';
const T = ISLAND_EPOCH + 1_000;
const site = {locationId: 'site:sail', x: 0, z: 0, reachM: 1};
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));
let groups = 0;
function test(name: string, fn: () => void) {
  fn();
  console.log('PASS ' + name);
  groups++;
}
function visible(v: unknown): void {
  if (Array.isArray(v)) {
    v.forEach(visible);
  } else if (v && typeof v === 'object') {
    Object.values(v).forEach(visible);
  } else {
    assert.notEqual(typeof v, 'number');
    if (typeof v === 'string') assert.ok(!/[0-9]|mg|gf|seed|strength|profile|仮定|キメ値/.test(v), v);
  }
}
function addPlant(L: Ledger, source: PlantMass) {
  const p = writePlantMass(source, site.locationId, 1);
  return addLot(L, {lotId: source.lotId, materialId: p.materialId,
    amount: p.amount, quality: p.quality, location: p.into!});
}
function fixture(operation: Operation = 'weave', start = true) {
  const L: SailWorkLedger = emptyLedger('world:sail-work', 'epoch:sail-work');
  const source: PlantMass = operation === 'mast'
    ? {lotId: 'input', material: 'bamboo', dryMg: 5_000_000,
      waterMg: 2_000_000, lengthMm: 6_000}
    : {lotId: 'input', material: operation === 'harvest' ? 'pandanus_standing_leaves'
      : operation === 'weave' ? 'pandanus_strips' : 'pandanus_leaves',
      dryMg: operation === 'weave' ? 900_000 : 1_000_000,
      waterMg: operation === 'dry' || operation === 'harvest' ? 2_000_000 : 180_000};
  addPlant(L, source);
  const intent: SailIntent = {kind: 'start', intentId: 'start',
    actorId: 'actor', atWorldMs: T, operation, lotIds: ['input'],
    siteId: site.locationId, presence: 'here'};
  const facts: SailStartFacts = {assumptionId: ID, worksite: {...site},
    ...(operation === 'weave' ? {requestedAreaCm2: 20_000 as const}
      : operation === 'dry' ? {roofed: true as const} : {})};
  const runId = start ? applySailIntent(L, intent, 0, T, facts).runId : '';
  return {L, runId, operation, facts, intent};
}
type F = ReturnType<typeof fixture>;
const revision = (a: F) => sailWorkRevision(a.L);
const current = (a: F) => projectSailWork(a.L, a.runId) as any;
function span(a: F, from: number, to: number, spanId = 'span', patch: any = {}): SailSpan {
  const base = {spanId, worldId: a.L.world.worldId, worldEpoch: a.L.world.worldEpoch,
    runId: a.runId, fromWorldMs: T + from, toWorldMs: T + to,
    confirmedAtWorldMs: T + to};
  return a.operation === 'dry'
    ? {kind: 'confirmed-roofed-wait', ...base, siteId: site.locationId, roofed: true, ...patch}
    : {kind: 'executor-activity-span', ...base, actorId: 'actor',
      activity: {harvest: 'harvest-leaves', split: 'split-leaves',
        weave: 'weave-mat', mast: 'cut-mast'}[a.operation],
      targetLotId: 'input', targetSiteId: site.locationId, arrived: true,
      fromPosition: {x: 0, z: 0}, toPosition: {x: 0, z: 0}, ...patch};
}
function work(a: F, from: number, to: number, spanId = 'span', patch: any = {}) {
  const f = span(a, from, to, spanId, patch);
  recordSailSpan(a.L, a.runId, f, revision(a), f.confirmedAtWorldMs);
}
function control(a: F, kind: 'stop' | 'resume' | 'takeover' | 'abandon',
  at: number, actorId = 'actor') {
  const intent: SailIntent = {kind, runId: a.runId, actorId,
    intentId: kind + ':' + at + ':' + actorId, atWorldMs: T + at,
    ...(kind === 'resume' || kind === 'takeover' ? {presence: 'here' as const} : {})} as SailIntent;
  return applySailIntent(a.L, intent, revision(a), T + at);
}
function unchanged(a: F, fn: () => unknown) {
  const before = json(a.L);
  assert.throws(fn);
  assert.deepEqual(a.L, before);
}
function holdings(L: Ledger) {
  return Object.values(L.lots).map(l => ({materialId: l.materialId,
    amount: l.amount, quality: l.quality, location: l.location}))
    .sort((a, b) => a.materialId.localeCompare(b.materialId));
}
const mass = (L: Ledger) => Object.values(L.lots)
  .reduce((n, l) => n + BigInt(l.amount.value), 0n) +
  (L.released ?? []).reduce((n, r) => n + BigInt(r.mg), 0n);

test('explicit assumption, fixed area and confirmed presence; reads never advance work', () => {
  const a = fixture(), before = json(a.L);
  for (let n = 0; n < 20; n++) {
    visible(readSailWorksite(a.L, site.locationId, T + n));
    assert.deepEqual(readSailWorkerObservations(a.L, a.runId, 'actor'), []);
  }
  assert.deepEqual(a.L, before);
  assert.equal(a.L.lots.input.reservedBy, a.runId);
  for (const patch of [{assumptionId: 'default'}, {requestedAreaCm2: 10_000}]) {
    const b = fixture('weave', false);
    unchanged(b, () => applySailIntent(b.L, b.intent, 0, T, {...b.facts, ...patch} as any));
  }
  const b = fixture('weave', false);
  unchanged(b, () => applySailIntent(b.L, {...b.intent, presence: 'away'} as any, 0, T, b.facts));
});
test('all five manufacturing operations close dry matter and water and retire runs', () => {
  for (const operation of ['harvest', 'dry', 'split', 'weave', 'mast'] as const) {
    const a = fixture(operation), initial = mass(a.L);
    const dt = operation === 'dry' ? Math.ceil(R.roofDryMs / ISLAND_RATE) + 1
      : operation === 'harvest' ? R.harvestMs : operation === 'split' ? R.splitMs
      : operation === 'weave' ? 20_000 * R.weaveMsPerCm2 : R.mastMs;
    work(a, 0, dt);
    assert.equal(current(a).status, 'completed');
    assert.equal(a.L.runs[a.runId], undefined);
    assert.equal(mass(a.L), initial);
    assert.ok(Object.values(a.L.lots).every(l => !l.reservedBy));
    const output = Object.values(a.L.lots);
    if (operation === 'weave') assert.equal(readSailMat(output[0]).areaCm2, 20_000);
    if (operation === 'mast') assert.equal(readBambooMast(output.find(l => l.materialId === 'bamboo_mast')!).lengthMm, 2_500);
    if (operation === 'dry') assert.equal(readPlantMass(output[0]).waterMg, 200_000);
    visible(readSailWorksite(a.L, site.locationId, T + dt));
    visible(readSailWorkerObservations(a.L, a.runId, 'actor'));
  }
});
test('seventeen seconds plus thirteen after a pause certifies one quantum', () => {
  const a = fixture();
  work(a, 0, 17_000);
  assert.equal(current(a).certifiedMs, 0);
  assert.equal(current(a).pendingMs, 17_000);
  control(a, 'stop', 17_000);
  control(a, 'resume', 100_000);
  work(a, 100_000, 113_000, 'continued');
  assert.equal(current(a).certifiedMs, 30_000);
  assert.equal(current(a).pendingMs, 0);
  assert.equal(a.L.lots.input.reservedBy, a.runId);
});
test('actor, activity, arrival and actual positions determine manual work', () => {
  for (const patch of [{actorId: 'other'}, {activity: 'rest'}, {activity: 'travel'},
    {activity: 'unknown'}, {arrived: false}, {targetLotId: 'wrong'},
    {targetSiteId: 'wrong'}, {toPosition: {x: 2, z: 0}}]) {
    const a = fixture();
    work(a, 0, 30_000, 'wrong-fact', patch);
    assert.equal(current(a).certifiedMs, 0);
    assert.deepEqual(readSailWorkerObservations(a.L, a.runId, 'actor'), []);
  }
});
test('save restoration pauses manual work without adding offline time', () => {
  const a = fixture();
  work(a, 0, 17_000);
  a.L = restoreSailWork(json(a.L), T + 100_000);
  assert.equal(readSailWorksite(a.L, site.locationId, T + 100_000).activity, 'paused');
  assert.equal(current(a).pendingMs, 17_000);
  unchanged(a, () => work(a, 17_000, 30_000, 'offline'));
  control(a, 'resume', 100_000);
  work(a, 100_000, 113_000, 'awake');
  assert.equal(current(a).certifiedMs, 30_000);
});
test('roofed waiting uses only confirmed island intervals, including a restored gap', () => {
  const a = fixture('dry'), before = mass(a.L);
  work(a, 0, 60_000, 'outside', {roofed: false});
  assert.equal(current(a).certifiedMs, 0);
  a.L = restoreSailWork(json(a.L), T + 1_000_000);
  const through = Math.ceil(R.roofDryMs / ISLAND_RATE) + 60_001;
  work(a, 60_000, through, 'offline-confirmed');
  assert.equal(current(a).status, 'completed');
  assert.equal(mass(a.L), before);
});
test('takeover preserves the quantum remainder but does not count the previous actor', () => {
  const a = fixture();
  unchanged(a, () => control(a, 'takeover', 0, 'other'));
  work(a, 0, 17_000);
  control(a, 'stop', 17_000);
  control(a, 'takeover', 100_000, 'other');
  work(a, 100_000, 113_000, 'old-worker');
  assert.equal(current(a).pendingMs, 17_000);
  work(a, 113_000, 126_000, 'new-worker', {actorId: 'other'});
  assert.equal(current(a).certifiedMs, 30_000);
  assert.deepEqual(readSailWorkerObservations(a.L, a.runId, 'actor'), []);
});
test('zero-work abandonment preserves source identity and allows a fresh start', () => {
  const a = fixture();
  work(a, 0, 17_000);
  control(a, 'stop', 17_000);
  control(a, 'abandon', 17_000);
  assert.equal(current(a).status, 'abandoned');
  assert.equal(a.L.runs[a.runId], undefined);
  assert.equal(a.L.lots.input.reservedBy, undefined);
  assert.equal(readPlantMass(a.L.lots.input).dryMg, 900_000);
  const result = applySailIntent(a.L, {...a.intent, intentId: 'again',
    atWorldMs: T + 17_000} as SailIntent, revision(a), T + 17_000, a.facts);
  assert.notEqual(result.runId, a.runId);
});
test('partial abandonment conserves materials without granting a completed mast or strips', () => {
  for (const operation of ['harvest', 'dry', 'split', 'weave', 'mast'] as const) {
    const a = fixture(operation), before = mass(a.L);
    work(a, 0, 60_000);
    control(a, 'stop', 60_000);
    control(a, 'abandon', 60_000);
    assert.equal(mass(a.L), before);
    assert.equal(a.L.runs[a.runId], undefined);
    assert.equal(current(a).status, 'abandoned');
    if (operation === 'mast') assert.ok(!Object.values(a.L.lots).some(l => l.materialId === 'bamboo_mast'));
    if (operation === 'split') assert.ok(!Object.values(a.L.lots).some(l => l.materialId === 'pandanus_strips'));
    visible(readSailWorksite(a.L, site.locationId, T + 60_000));
  }
});
test('partitioning, JSON and retries preserve outputs; histories stay bounded', () => {
  const whole = fixture('mast');
  work(whole, 0, R.mastMs, 'all');
  for (const step of [30_000, 17_000, 737]) {
    const a = fixture('mast');
    for (let t = 0, n = 0; t < R.mastMs; t += step, n++) {
      const to = Math.min(t + step, R.mastMs), f = span(a, t, to, 'piece:' + n);
      recordSailSpan(a.L, a.runId, f, revision(a), f.confirmedAtWorldMs);
      const before = json(a.L);
      recordSailSpan(a.L, a.runId, f, 0, f.confirmedAtWorldMs);
      assert.deepEqual(a.L, before);
      a.L = json(a.L);
      assert.ok(a.L.sailArrangement!.receipts.length <= 64);
      for (const r of Object.values(a.L.runs)) {
        assert.ok(!('frames' in (r.state!.data as any)));
        assert.ok(!('intervals' in (r.state!.data as any)));
      }
    }
    assert.deepEqual(holdings(a.L), holdings(whole.L));
    assert.equal(Object.keys(a.L.runs).length, 0);
  }
});
test('bounded receipts reject expired and conflicting commands without duplicating work', () => {
  const a = fixture();
  const first = span(a, 0, 1_000, 'first');
  recordSailSpan(a.L, a.runId, first, revision(a), first.confirmedAtWorldMs);
  for (let n = 1; n <= 70; n++) work(a, n * 1_000, (n + 1) * 1_000, 'f:' + n);
  assert.equal(a.L.sailArrangement!.receipts.length, 64);
  unchanged(a, () => recordSailSpan(a.L, a.runId, first, revision(a), T + 71_000));
  const last = span(a, 70_000, 71_000, 'f:70');
  unchanged(a, () => recordSailSpan(a.L, a.runId, {...last, arrived: false} as any,
    revision(a), T + 71_000));
});
test('same actor and worksite cannot be double-booked; waiting leaves actor free', () => {
  const a = fixture();
  addPlant(a.L, {lotId: 'second', material: 'pandanus_strips', dryMg: 900_000, waterMg: 0});
  const intent = {...a.intent, intentId: 'second', lotIds: ['second']} as SailIntent;
  unchanged(a, () => applySailIntent(a.L, intent, revision(a), T, a.facts));
  control(a, 'stop', 0);
  unchanged(a, () => applySailIntent(a.L, {...intent, actorId: 'other'} as SailIntent,
    revision(a), T, a.facts));
});
test('completed work and command receipts have fixed retained limits', () => {
  const a = fixture('mast', false);
  let at = T;
  for (let n = 0; n < 80; n++) {
    const lotId = n === 0 ? 'input' : 'bamboo:' + n;
    if (n > 0) addPlant(a.L, {lotId, material: 'bamboo',
      dryMg: 5_000_000, waterMg: 2_000_000, lengthMm: 6_000});
    const intent = {...a.intent, intentId: 'batch:' + n,
      atWorldMs: at, lotIds: [lotId]} as SailIntent;
    const runId = applySailIntent(a.L, intent, revision(a), at, a.facts).runId;
    const f = {kind: 'executor-activity-span' as const,
      spanId: 'batch:' + n, worldId: a.L.world.worldId,
      worldEpoch: a.L.world.worldEpoch, runId, actorId: 'actor',
      fromWorldMs: at, toWorldMs: at + R.mastMs,
      confirmedAtWorldMs: at + R.mastMs, activity: 'cut-mast' as const,
      targetLotId: lotId, targetSiteId: site.locationId, arrived: true,
      fromPosition: {x: 0, z: 0}, toPosition: {x: 0, z: 0}};
    recordSailSpan(a.L, runId, f, revision(a), at + R.mastMs);
    at += R.mastMs;
    assert.equal(Object.keys(a.L.runs).length, 0);
    assert.ok(a.L.sailArrangement!.finished.length <= 64);
    assert.ok(a.L.sailArrangement!.receipts.length <= 64);
  }
  assert.equal(a.L.sailArrangement!.finished.length, 64);
  assert.equal(a.L.sailArrangement!.receipts.length, 64);
});
test('future, malformed, changed reservation and corrupt state failures are atomic', () => {
  for (const patch of [{worldEpoch: 'wrong'}, {runId: 'wrong'}, {fromPosition: null},
    {activity: 'invented'}, {confirmedAtWorldMs: T - 1}, {extra: true}]) {
    const a = fixture();
    unchanged(a, () => work(a, 0, 30_000, 'bad', patch));
  }
  const a = fixture();
  unchanged(a, () => recordSailSpan(a.L, a.runId, span(a, 0, 30_000), revision(a), T + 29_999));
  for (const edit of [
    (a: F) => { delete a.L.lots.input.reservedBy; },
    (a: F) => { (a.L.runs[a.runId].state!.data as any).pendingMs++; },
    (a: F) => { (a.L.sailArrangement as any).schema = 'civ-world.sail-arrangement/0'; },
  ]) {
    const b = fixture();
    edit(b);
    unchanged(b, () => work(b, 0, 30_000));
  }
});
test('public failures require a confirmed attempt and never expose hidden values', () => {
  const a = fixture('weave', false);
  a.L.lots.input.quality!.water_mg = 900_000;
  a.L.lots.input.amount.value = 1_800_000;
  let error: unknown;
  try { applySailIntent(a.L, a.intent, 0, T, a.facts); } catch (e) { error = e; }
  assert.ok(error instanceof SailWorkError);
  assert.deepEqual(sailFailureObservations(error), []);
  const words = sailFailureObservations(error, {kind: 'host-confirmed-on-site-attempt'});
  assert.match(words[0].text, /湿って/);
  visible(words);
});
console.log('PASS sail work: ' + groups + ' groups; no resident or UI connection.');
