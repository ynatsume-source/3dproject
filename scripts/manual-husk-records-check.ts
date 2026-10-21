import assert from 'node:assert/strict';
import { addLot, emptyLedger, type Ledger } from '../src/world/process-runner';
import { MANUAL_HUSK_ASSUMPTION } from '../src/science/prototypes/manual-husk-assumptions';
import {
  beginManualHuskWork,
  recordManualHuskSpan,
  projectManualHuskWork,
  observeManualHuskWork,
  compactManualHuskRecords,
  MANUAL_HUSK_WORK,
  MANUAL_HUSK_RECORD_LIMIT,
  type HuskExecutorSpan
} from '../src/world/manual-husk-work';
import {
  applyHuskIntent,
  recordHuskWorkflowSpan,
  restoreHuskArrangement,
  huskArrangementRevision,
  readHuskWorksite,
  readHuskResidentObservations,
  HUSK_WORKFLOW_SCHEMA,
  type HuskWorkflowLedger,
  type HuskIntent,
  type HuskStartFacts
} from '../src/world/manual-husk-workflow';
import {
  applyHuskIntent as legacyIntent,
  recordHuskWorkflowSpan as legacySpan,
  huskArrangementRevision as legacyRevision
} from './fixtures/manual-husk-workflow-v2';
import {
  projectManualHuskWork as legacyProject
} from './fixtures/manual-husk-work-v2';

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let groups = 0;
function test(name: string, body: () => void): void {
  body();
  groups++;
  console.log('PASS ' + name);
}
function facts(index: number): HuskStartFacts {
  return {
    assumptionId: MANUAL_HUSK_ASSUMPTION.id,
    huskCount: 1,
    input: {
      materialId: 'wet_unseparated_coconut_husk',
      lotId: 'lot:husk:' + index,
      separation: 'never-separated',
      dryMg: 300_000,
      waterMg: 600_000,
      soakHistory: []
    },
    worksite: { locationId: 'site:manual', x: 10, z: 20, reachM: 1 }
  };
}
function stock(L: Ledger, f: HuskStartFacts): void {
  addLot(L, {
    lotId: f.input.lotId,
    materialId: f.input.materialId,
    amount: { value: 900_000, unit: 'mg' },
    location: f.worksite.locationId,
    quality: {
      dry_mg: 300_000, water_mg: 600_000,
      husk_count: 1, unseparated: 1, history_complete: 1
    }
  });
}
function start(f: HuskStartFacts, at: number, index: number): HuskIntent {
  return {
    intentId: 'start:' + index,
    kind: 'start',
    actorId: 'actor',
    processId: MANUAL_HUSK_WORK.processId,
    lotId: f.input.lotId,
    siteId: f.worksite.locationId,
    atWorldMs: at,
    presence: 'here'
  };
}
function frame(L: Ledger, runId: string, f: HuskStartFacts, at: number, duration: number): HuskExecutorSpan {
  return {
    kind: 'executor-activity-span', spanId: 'span:' + runId,
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch,
    runId, actorId: 'actor', fromWorldMs: at, toWorldMs: at + duration,
    confirmedAtWorldMs: at + duration, activity: 'separate-wet-husk',
    targetLotId: f.input.lotId, targetSiteId: f.worksite.locationId,
    arrived: true, fromPosition: { x: 10, z: 20 }, toPosition: { x: 10, z: 20 }
  };
}
function fixture(legacy = false, complete = false) {
  const L: any = emptyLedger('world:compact-manual', 'epoch:compact-manual');
  const f = facts(0);
  stock(L, f);
  const intent = start(f, 1_000, 0);
  const call = legacy ? legacyIntent : applyHuskIntent;
  const revision = legacy ? legacyRevision : huskArrangementRevision;
  const record = legacy ? legacySpan : recordHuskWorkflowSpan;
  const runId = call(L, intent, 0, 1_000, f).runId;
  const span = frame(L, runId, f, 1_000, complete ? 240_000 : 17_000);
  record(L, runId, span, revision(L), span.confirmedAtWorldMs);
  return { L, f, intent, runId, span };
}

test('direct manual work removes completed runs and retains exact recent replay', () => {
  const L = emptyLedger('world:direct', 'epoch:direct');
  const f = facts(0);
  stock(L, f);
  const spec = {
    ...f, commandId: 'direct:start', operatorId: 'actor', openedAtWorldMs: 1_000
  };
  const runId = beginManualHuskWork(L, spec).runId;
  const span = frame(L, runId, f, 1_000, 240_000);
  const result = recordManualHuskSpan(L, runId, span, 241_000);
  assert.equal(result.status, 'completed');
  assert.equal(L.runs[runId], undefined);
  assert.equal(projectManualHuskWork(L, runId).certifiedWorkMs, 240_000);
  const before = json(L);
  assert.equal(beginManualHuskWork(L, spec).runId, runId);
  assert.deepEqual(recordManualHuskSpan(L, runId, span, 241_000), result);
  assert.deepEqual(L, before);
  assert.deepEqual(observeManualHuskWork(L, runId), result.observations);
  const records = (L as any).manualHuskRecords;
  assert.equal(records.finished.length, 1);
  assert.ok(!('frames' in records.finished[0]));
  assert.ok(!('science' in records.finished[0]));
  assert.ok(!('state' in records.finished[0]));
});

test('old active and terminal saves validate and migrate without changing lots, IDs or physics', () => {
  for (const complete of [false, true]) {
    const old = fixture(true, complete);
    const expected = legacyProject(old.L, old.runId);
    const lots = json(old.L.lots);
    const seq = old.L.seq;
    const migrated = restoreHuskArrangement(json(old.L), 500_000);
    assert.equal(migrated.manualHuskArrangement!.schema, HUSK_WORKFLOW_SCHEMA);
    assert.deepEqual(migrated.lots, lots);
    assert.equal(migrated.seq, seq);
    assert.deepEqual(projectManualHuskWork(migrated, old.runId), expected);
    assert.equal(!!migrated.runs[old.runId], !complete);
    assert.equal(migrated.manualHuskArrangement!.jobs.length, complete ? 0 : 1);
    const before = json(migrated);
    assert.equal(applyHuskIntent(migrated, old.intent, 0, 500_000, old.f).runId, old.runId);
    recordHuskWorkflowSpan(migrated, old.runId, old.span, 0, 500_000);
    assert.deepEqual(migrated, before);
  }
});

test('a legacy save with more than sixty-four completed jobs migrates before eviction', () => {
  const L: any = emptyLedger('world:legacy-many', 'epoch:legacy-many');
  let lastRun = '';
  for (let index = 0; index < 65; index++) {
    const f = facts(index);
    stock(L, f);
    const at = 1_000 + index * 300_000;
    lastRun = legacyIntent(L, start(f, at, index), legacyRevision(L), at, f).runId;
    const span = frame(L, lastRun, f, at, 240_000);
    legacySpan(L, lastRun, span, legacyRevision(L), span.confirmedAtWorldMs);
    L.lots = {};
  }
  const expected = legacyProject(L, lastRun);
  const restored = restoreHuskArrangement(json(L), 65 * 300_000);
  assert.equal(Object.keys(restored.runs).length, 0);
  assert.equal(restored.manualHuskArrangement!.jobs.length, 0);
  assert.equal(restored.manualHuskArrangement!.finished.length, 64);
  assert.equal((restored as any).manualHuskRecords.finished.length, 64);
  assert.deepEqual(projectManualHuskWork(restored, lastRun), expected);
});

test('old terminal proof corruption and relabeled schemas are rejected before conversion', () => {
  const old = fixture(true, true);
  const corrupt = json(old.L);
  corrupt.runs[old.runId].state.data.science.pools.fiber.dryMg++;
  const before = json(corrupt);
  assert.throws(() => restoreHuskArrangement(corrupt, 500_000));
  assert.deepEqual(corrupt, before);
  const relabeled = json(old.L);
  relabeled.manualHuskArrangement.schema = HUSK_WORKFLOW_SCHEMA;
  assert.throws(() => restoreHuskArrangement(relabeled, 500_000));
});

test('hundreds of finished husks retain bounded metadata, not completed work states', () => {
  const L: HuskWorkflowLedger = emptyLedger('world:many', 'epoch:many');
  let plateau = 0;
  let latest: ReturnType<typeof fixture> | undefined;
  for (let index = 0; index < 300; index++) {
    const f = facts(index);
    stock(L, f);
    const at = 1_000 + index * 300_000;
    const intent = start(f, at, index);
    const runId = applyHuskIntent(L, intent, huskArrangementRevision(L), at, f).runId;
    const span = frame(L, runId, f, at, 240_000);
    recordHuskWorkflowSpan(L, runId, span, huskArrangementRevision(L), span.confirmedAtWorldMs);
    assert.equal(Object.keys(L.runs).length, 0);
    assert.equal(Object.values(L.lots).reduce((n, lot) => n + lot.amount.value, 0), 900_000);
    assert.ok(Object.values(L.lots).every(lot => !lot.reservedBy));
    // Material is real inventory; remove it from this metadata retention test.
    L.lots = {};
    const records = (L as any).manualHuskRecords;
    const arrangement = L.manualHuskArrangement!;
    assert.ok(records.finished.length <= MANUAL_HUSK_RECORD_LIMIT);
    assert.ok(records.receipts.length <= MANUAL_HUSK_RECORD_LIMIT);
    assert.ok(arrangement.finished.length <= MANUAL_HUSK_RECORD_LIMIT);
    assert.ok(arrangement.receipts.length <= MANUAL_HUSK_RECORD_LIMIT);
    assert.equal(arrangement.jobs.length, 0);
    const bytes = Buffer.byteLength(JSON.stringify({ records, arrangement }));
    assert.ok(bytes < 350_000, 'bounded manual metadata: ' + bytes);
    if (index === 149) plateau = bytes;
    if (index === 299) assert.ok(Math.abs(bytes - plateau) < 5_000);
    latest = { L, f, intent, runId, span };
  }
  const recent = latest!;
  const before = json(L);
  applyHuskIntent(L, recent.intent, 0, recent.span.confirmedAtWorldMs, recent.f);
  recordHuskWorkflowSpan(L, recent.runId, recent.span, 0, recent.span.confirmedAtWorldMs);
  assert.deepEqual(L, before);
  assert.equal(readHuskWorksite(L, 'site:manual', recent.span.confirmedAtWorldMs).activity, 'completed');
  assert.ok(readHuskResidentObservations(L, recent.runId, 'actor').length > 0);
  assert.throws(() => projectManualHuskWork(L, 'run:1'));
});

test('active command replay window is bounded across long pause/resume histories', () => {
  const a = fixture();
  for (let index = 0; index < 100; index++) {
    const stopAt = 20_000 + index * 2_000;
    applyHuskIntent(a.L, {
      intentId: 'stop:' + index, kind: 'stop', actorId: 'actor',
      runId: a.runId, atWorldMs: stopAt
    }, huskArrangementRevision(a.L), stopAt);
    applyHuskIntent(a.L, {
      intentId: 'resume:' + index, kind: 'resume', actorId: 'actor',
      runId: a.runId, atWorldMs: stopAt + 1_000, presence: 'here'
    }, huskArrangementRevision(a.L), stopAt + 1_000);
  }
  assert.equal(a.L.manualHuskArrangement.receipts.length, MANUAL_HUSK_RECORD_LIMIT);
  assert.equal(projectManualHuskWork(a.L, a.runId).pendingWorkMs, 17_000);
  const restored = restoreHuskArrangement(json(a.L), 500_000);
  assert.equal(projectManualHuskWork(restored, a.runId).pendingWorkMs, 17_000);
  assert.equal(readHuskWorksite(restored, 'site:manual', 500_000).activity, 'paused');
});

test('terminal summary corruption is rejected and compaction preserves the allocator', () => {
  const a = fixture(false, true);
  const seq = a.L.seq;
  compactManualHuskRecords(a.L);
  assert.equal(a.L.seq, seq);
  const bad = json(a.L);
  bad.manualHuskRecords.finished[0].projection.pools.fiber.dryMg++;
  assert.throws(() => projectManualHuskWork(bad, a.runId));
  const words = json(a.L);
  words.manualHuskRecords.finished[0].observations[0].text = '強さは四万だ。';
  assert.throws(() => projectManualHuskWork(words, a.runId));
  const publicWords = json(a.L);
  publicWords.manualHuskArrangement.finished[0].observations[0].text = '強さは四万だ。';
  assert.throws(() => readHuskWorksite(publicWords, 'site:manual', 241_000));
});

console.log('manual-husk-records-check: ' + groups + ' groups passed');
