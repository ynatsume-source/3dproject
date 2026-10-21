import assert from 'node:assert/strict';
import {
  emptyLedger, addLot, startRun, nextRequest, commit, abortRun,
  type Ledger, type Run
} from '../src/world/process-runner';
import {
  SCIENCE_RECORDS_SCHEMA, SCIENCE_RECORD_LIMITS,
  archiveScienceRun, compactScienceLedger, readScienceRunSummary, recentScienceRuns
} from '../src/world/science-records';
import type {
  ScienceStepRequest, ScienceStepResult, Observation
} from '../src/world/science-contract';
import { barometerStep, BAROMETER_PROCESS } from '../src/science/step/barometer';

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let groups = 0;
function test(name: string, body: () => void): void {
  body();
  groups++;
  console.log('PASS ' + name);
}
function result(req: ScienceStepRequest, patch: Partial<ScienceStepResult> = {}): ScienceStepResult {
  return {
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { ...req.interval }, state: { schema: 'fixture-records/1', data: null },
    status: 'completed', consumed: [], produced: [], released: [], drawn: [],
    observations: [], energy: [], equipmentWear: [],
    evidence: { evaluatorVersion: 'records-test', sourceRefs: [] }, ...patch
  };
}
function begin(L: Ledger, at = 0, processId = 'records_fixture') {
  return startRun(L, {
    processId, processVersion: '1', catalogVersion: 'civ-sci-test-2',
    contract: '0.2.1', clock: 'world', lotIds: [], equipmentIds: [],
    operator: 'res:worker'
  }, at).run!;
}
const env = (at: number) => ({
  sampleId: 'env:' + at, source: 'simulation' as const, effectiveAt: at
});
function request(L: Ledger, run: Run): ScienceStepRequest {
  return nextRequest(L, run.runId, {
    realNow: run.lastTo + 30_000, environment: env
  })!;
}
const metadataBytes = (L: Ledger) => JSON.stringify({
  runs: L.runs, records: L.scienceRecords, committed: L.committed,
  released: L.released
}).length;

test('standard completion archives a compact summary and a resend settles nothing twice', () => {
  const L = emptyLedger('world', 'epoch');
  addLot(L, {
    lotId: 'lot:source', materialId: 'fixture', amount: { value: 1_000, unit: 'mg' },
    location: 'site'
  });
  const run = startRun(L, {
    processId: 'records_fixture', processVersion: '1', catalogVersion: 'civ-sci-test-2',
    contract: '0.2.1', clock: 'world', lotIds: ['lot:source'], equipmentIds: [],
    operator: 'res:worker'
  }, 0).run!;
  const req = request(L, run);
  const res = result(req, {
    state: { schema: 'large-state/1', data: { unnecessary: 'x'.repeat(20_000) } },
    consumed: [{ lotId: 'lot:source', amount: { value: 1_000, unit: 'mg' } }],
    produced: [{ materialId: 'product', amount: { value: 1_000, unit: 'mg' }, into: 'site' }],
    observations: [{ at: req.interval.to, channel: 'sight', text: '作業を終えた。' }]
  });
  assert.equal(commit(L, req, res).ok, true);
  assert.equal(L.runs[run.runId], undefined);
  assert.equal(Object.values(L.lots).length, 1);
  assert.equal(Object.values(L.lots)[0].amount.value, 1_000);
  const summary = readScienceRunSummary(L, run.runId)!;
  assert.equal(summary.status, 'completed');
  assert.deepEqual(summary.lotIds, ['lot:source']);
  assert.equal('state' in summary, false);
  assert.equal('seed' in summary, false);
  assert.ok(JSON.stringify(summary).length < 1_000);
  const before = json(L);
  assert.deepEqual(commit(L, req, res), { ok: false, why: 'already committed' });
  assert.deepEqual(L, before);
});

test('completed generic metadata plateaus after its bounded windows fill', () => {
  const L = emptyLedger('world', 'epoch');
  let after600 = 0;
  for (let i = 0; i < 1_200; i++) {
    const run = begin(L, i * 60_000);
    const req = request(L, run);
    const res = result(req, {
      state: { schema: 'large-state/1', data: { oldFrames: 'x'.repeat(15_000) } }
    });
    assert.equal(commit(L, req, res).ok, true);
    assert.equal(Object.keys(L.runs).length, 0);
    if (i === 599) after600 = metadataBytes(L);
  }
  assert.equal(L.scienceRecords!.finished.length, SCIENCE_RECORD_LIMITS.finished);
  assert.equal(L.committed.length, SCIENCE_RECORD_LIMITS.committed);
  assert.ok(metadataBytes(L) < after600 + 3_000);
  assert.ok(metadataBytes(L) < 80_000);
  console.log(JSON.stringify({ genericMetadataAt600: after600, at1200: metadataBytes(L) }));
});

test('a real test barometer keeps its latest observations without changing readings', () => {
  const L = emptyLedger('world', 'epoch');
  L.equipment['eq:barometer'] = {
    equipmentId: 'eq:barometer', kind: 'fixture_air_barometer',
    catalogEntry: 'fixture_air_barometer', catalogVersion: 'civ-sci-test-2',
    condition: 1,
    params: { bulbVolumeMl: 500, tubeBoreMm: 8, tubeLengthMm: 600, markMm: 5, bulbTauS: 900 }
  };
  const run = startRun(L, {
    ...BAROMETER_PROCESS, catalogVersion: 'civ-sci-test-2', contract: '0.2.1',
    clock: 'world', lotIds: [], equipmentIds: ['eq:barometer'], operator: 'res:worker'
  }, 0).run!;
  let oldState: ScienceStepRequest['state'] = null;
  const expected: Observation[] = [];
  let at256 = 0;
  for (let i = 0; i < 1_000; i++) {
    const req = nextRequest(L, run.runId, {
      realNow: run.lastTo + 30_000,
      environment: at => ({
        ...env(at), airTempC: 24, pressureHPa: 1010 - i % 20
      }),
      actions: [{ action: 'read_gauge', at: run.lastTo }]
    })!;
    const actual = barometerStep(req);
    const reference = barometerStep({ ...json(req), state: oldState });
    assert.deepEqual(actual, reference);
    oldState = json(reference.state);
    expected.push(...actual.observations);
    assert.equal(actual.status, 'running', String(actual.evidence.notes));
    assert.equal(commit(L, req, actual).ok, true);
    assert.deepEqual(L.runs[run.runId].observations, expected.slice(-SCIENCE_RECORD_LIMITS.observations));
    if (i === 255) at256 = metadataBytes(L);
  }
  assert.equal(L.runs[run.runId].observations.length, SCIENCE_RECORD_LIMITS.observations);
  assert.ok(metadataBytes(L) < at256 + 15_000);
});

test('old unversioned saves compact without consuming material or changing IDs and clocks', () => {
  const L = emptyLedger('world', 'epoch');
  const active = begin(L);
  const completed = begin(L, 60_000);
  completed.status = 'completed';
  completed.state = { schema: 'legacy-big-state/1', data: { frames: 'x'.repeat(15_000) } };
  for (let i = 0; i < 200; i++) {
    active.observations.push({ at: i, channel: 'sight', text: '目盛りを見た。' });
  }
  const input = json(L);
  const before = { world: json(L.world), seq: L.seq, lots: json(L.lots),
    equipment: json(L.equipment), lastTo: active.lastTo, state: json(active.state) };
  compactScienceLedger(L);
  assert.equal(L.scienceRecords!.schema, SCIENCE_RECORDS_SCHEMA);
  assert.equal(L.runs[completed.runId], undefined);
  assert.equal(readScienceRunSummary(L, completed.runId)!.status, 'completed');
  assert.deepEqual(L.world, before.world);
  assert.equal(L.seq, before.seq);
  assert.deepEqual(L.lots, before.lots);
  assert.deepEqual(L.equipment, before.equipment);
  assert.equal(L.runs[active.runId].lastTo, before.lastTo);
  assert.deepEqual(L.runs[active.runId].state, before.state);
  assert.deepEqual(L.runs[active.runId].observations, input.runs[active.runId].observations.slice(-64));
  const once = json(L);
  compactScienceLedger(L);
  assert.deepEqual(L, once);
});

test('aborts release reservations once and prototype owners choose their retirement point', () => {
  const L = emptyLedger('world', 'epoch');
  const run = begin(L);
  abortRun(L, run.runId, 'stopped by owner');
  assert.equal(L.runs[run.runId], undefined);
  assert.equal(readScienceRunSummary(L, run.runId)!.why, 'stopped by owner');
  const before = json(L);
  abortRun(L, run.runId, 'again');
  assert.deepEqual(L, before);
  const owned = begin(L, 0, 'prototype_owned');
  const req = request(L, owned);
  assert.equal(commit(L, req, result(req)).ok, true);
  assert.equal(L.runs[owned.runId].status, 'completed');
  archiveScienceRun(L, owned.runId);
  assert.equal(L.runs[owned.runId], undefined);
  assert.equal(recentScienceRuns(L).at(-1)!.runId, owned.runId);
});

test('relabelled or corrupt summary envelopes are refused before migration mutates anything', () => {
  for (const scienceRecords of [
    { schema: SCIENCE_RECORDS_SCHEMA, runs: {} },
    { schema: 'civ-world.science-records/0', worldId: 'world', worldEpoch: 'epoch', finished: [] },
    { schema: SCIENCE_RECORDS_SCHEMA, worldId: 'other', worldEpoch: 'epoch', finished: [] },
    { schema: SCIENCE_RECORDS_SCHEMA, worldId: 'world', worldEpoch: 'epoch', finished: [{}] }
  ]) {
    const L = emptyLedger('world', 'epoch');
    (L as any).scienceRecords = scienceRecords;
    const before = json(L);
    assert.throws(() => compactScienceLedger(L), /corrupt-or-unsupported/);
    assert.deepEqual(L, before);
  }
});

console.log('science-records-check: ' + groups + ' groups passed');
