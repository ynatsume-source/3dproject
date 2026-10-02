import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from '../fixtures.ts';
import { applyCommand, audit, checkpoint, restoreCheckpoint } from '../kernel.ts';
import { PROCESS } from '../../../src/science/fixture-profile.ts';
import { runDemo } from '../demo.mjs';

function harness(options) {
  let w = createFixture(options), serial = 0;
  const command = action => ({ commandId: `c${++serial}`, worldId: w.worldId,
    worldEpoch: w.worldEpoch, expectedVersion: w.worldVersion, ...action });
  const send = action => { w = applyCommand(w, command(action)); return w; };
  const start = (processId, lotId = 'a', equipmentId = 'dryer', extra = {}) => send({
    kind: 'start', processId, lotId, equipmentId, expectedLotRevision: w.lots[lotId].revision,
    expectedEquipmentRevision: w.equipment[equipmentId].revision, ...extra });
  const shape = (lotId = 'a', thicknessMm = 5) => {
    start(PROCESS.shape.id, lotId, 'bench', { thicknessMm }); send({ kind: 'advance', seconds: 60 });
  };
  return { get world() { return w; }, command, send, start, shape };
}
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const balanced = w => {
  const a = audit(w); assert.equal(a.solidResidualMg, 0); assert.equal(a.waterResidualMg, 0);
  near(a.energyResidualJ, 0); near(a.supplyResidualJ, 0);
};

test('research loop compares two real executions, with a failed sample retained', () => {
  const { world, report } = runDemo();
  assert.equal(report.trials[0].outcome, 'completed');
  assert.equal(report.trials[0].afterMg, 100000);
  assert.equal(report.trials[1].outcome, 'failed');
  assert.equal(report.trials[1].reason, 'duration-limit');
  assert.ok(report.trials[1].afterMg > report.trials[0].afterMg);
  assert.equal(world.lots.b.solidMg, 100000); assert.ok(world.lots.b.waterMg > 0);
  assert.equal(report.firstLightAchieved, false); balanced(world);
});
test('heat budget agrees with independent sensible + latent calculation', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id); h.send({ kind: 'advance', seconds: 3000 });
  const run = Object.values(h.world.runs).at(-1);
  // 0.1 kg surrogate solid and 0.02 kg free water, raised from 20 to 60 C.
  near(run.inputJ, ((0.1 * 800 + 0.02 * 4186) * 40 + 0.02 * 2340000) / 0.8);
  near(run.vaporEnthalpyJ, 0.02 * (2340000 + 4186 * 40));
  near(run.coolingHeatJ, 0.1 * 800 * 40);
  assert.equal(run.vaporMg, 20000); assert.equal(h.world.lots.a.temperatureC, 20);
  balanced(h.world);
});
test('drying requires elapsed time; starting alone consumes no material or energy', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id);
  assert.equal(h.world.lots.a.waterMg, 20000); assert.equal(h.world.equipment.dryer.energyJ, 200000);
  h.send({ kind: 'advance', seconds: 1 });
  assert.equal(h.world.lots.a.waterMg, 20000); assert.ok(h.world.lots.a.temperatureC > 20);
  assert.equal(Object.values(h.world.runs).at(-1).status, 'running'); balanced(h.world);
});
test('cooling keeps equipment and sample reserved until the heat is discharged', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id); h.send({ kind: 'advance', seconds: 2082 });
  assert.equal(h.world.lots.a.waterMg, 0); assert.equal(h.world.lots.a.temperatureC, 60);
  assert.ok(h.world.lots.a.reservedBy); assert.equal(Object.values(h.world.runs).at(-1).stage, 'cooling');
  h.send({ kind: 'advance', seconds: 320 }); assert.equal(h.world.lots.a.reservedBy, null); balanced(h.world);
});
test('large heat reservoir cannot replace equipment temperature capability', () => {
  const h = harness({ dryerEnergyJ: 1e8, dryerMaxTemperatureC: 59 }); h.shape();
  const before = checkpoint(h.world); assert.throws(() => h.start(PROCESS.dry.id), /temperature-capability/);
  assert.equal(checkpoint(h.world), before);
});
test('finite energy exhaustion preserves partial material and all spent energy', () => {
  const h = harness({ dryerEnergyJ: 12000 }); h.shape(); h.start(PROCESS.dry.id);
  h.send({ kind: 'advance', seconds: 3000 });
  const r = Object.values(h.world.runs).at(-1);
  assert.equal(r.status, 'failed'); assert.ok(h.world.lots.a.waterMg > 0 && h.world.lots.a.waterMg < 20000);
  assert.ok(h.world.equipment.dryer.energyJ >= 0 && h.world.equipment.dryer.energyJ < 3);
  assert.equal(h.world.lots.a.temperatureC, 20); balanced(h.world);
});
test('less source power delays heating and evaporation', () => {
  const fast = harness(), slow = harness({ dryerPowerW: 10 });
  for (const h of [fast, slow]) { h.shape(); h.start(PROCESS.dry.id); h.send({ kind: 'advance', seconds: 3000 }); balanced(h.world); }
  assert.equal(Object.values(fast.world.runs).at(-1).status, 'completed');
  assert.equal(Object.values(slow.world.runs).at(-1).status, 'running');
  assert.ok(slow.world.lots.a.waterMg > fast.world.lots.a.waterMg);
});
test('competing processes cannot consume or measure the same reserved sample', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id);
  assert.throws(() => h.start(PROCESS.weigh.id, 'a', 'balance'), /resource-reserved/);
  h.shape('b'); assert.throws(() => h.start(PROCESS.dry.id, 'b'), /resource-reserved/);
  balanced(h.world);
});
test('duplicate commands are idempotent, including after JSON restart', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id);
  const c = h.command({ kind: 'advance', seconds: 900 });
  const w = applyCommand(h.world, c), restored = restoreCheckpoint(checkpoint(w));
  assert.deepEqual(restored, w); assert.equal(applyCommand(restored, c), restored);
  assert.throws(() => applyCommand(restored, { ...c, seconds: 901 }), /command-id-conflict/);
});
test('checkpoint resume is equivalent to uninterrupted evolution, with no offline progress', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id); h.send({ kind: 'advance', seconds: 600 });
  const saved = checkpoint(h.world), c = h.command({ kind: 'advance', seconds: 2400 });
  assert.deepEqual(restoreCheckpoint(saved), h.world);
  assert.deepEqual(applyCommand(restoreCheckpoint(saved), c), applyCommand(h.world, c));
});
test('operational pause rejects elapsed-time commands and resume retains exact state', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id); h.send({ kind: 'advance', seconds: 100 });
  h.send({ kind: 'pause' }); const before = h.world.worldTime, water = h.world.lots.a.waterMg;
  assert.throws(() => h.send({ kind: 'advance', seconds: 1000 }), /world-paused/);
  h.send({ kind: 'resume' }); assert.equal(h.world.worldTime, before); assert.equal(h.world.lots.a.waterMg, water);
});
test('cancellation cools and preserves the partially dried specimen without refund', () => {
  const h = harness(); h.shape(); h.start(PROCESS.dry.id); h.send({ kind: 'advance', seconds: 1000 });
  const runId = Object.values(h.world.runs).at(-1).id, water = h.world.lots.a.waterMg, energy = h.world.equipment.dryer.energyJ;
  h.send({ kind: 'cancel', runId }); h.send({ kind: 'advance', seconds: 1000 });
  assert.equal(h.world.runs[runId].status, 'failed'); assert.equal(h.world.lots.a.waterMg, water);
  assert.equal(h.world.equipment.dryer.energyJ, energy); assert.equal(h.world.lots.a.reservedBy, null); balanced(h.world);
});
test('split advance intervals yield the same physics and completion times', () => {
  const a = harness(), b = harness(); for (const h of [a, b]) { h.shape(); h.start(PROCESS.dry.id); }
  a.send({ kind: 'advance', seconds: 3000 });
  for (const seconds of [1, 81, 333, 585, 1000, 1000]) b.send({ kind: 'advance', seconds });
  assert.deepEqual(a.world.lots, b.world.lots); assert.deepEqual(a.world.runs, b.world.runs);
  assert.deepEqual(a.world.equipment, b.world.equipment); balanced(b.world);
});
test('measurements retain the existing lot and reveal only quantized total mass', () => {
  const h = harness(), before = structuredClone(h.world.lots.a);
  h.start(PROCESS.weigh.id, 'a', 'balance'); h.send({ kind: 'advance', seconds: 10 });
  assert.equal(Object.keys(h.world.lots).length, 2); assert.equal(h.world.lots.a.solidMg, before.solidMg);
  assert.equal(h.world.lots.a.waterMg, before.waterMg);
  const o = h.world.observations[0]; assert.equal(o.measuredMassMg, 120000);
  assert.equal(o.resolutionMg, 100); assert.equal('waterMg' in o, false); balanced(h.world);
});
test('stale world, epoch and resource versions fail atomically', () => {
  const h = harness(); const base = checkpoint(h.world);
  for (const extra of [{ worldEpoch: 'old' }, { worldId: 'another' }, { expectedVersion: 3 }]) {
    assert.throws(() => applyCommand(h.world, { ...h.command({ kind: 'advance', seconds: 1 }), ...extra }));
  }
  assert.throws(() => h.start(PROCESS.shape.id, 'a', 'bench', { thicknessMm: 5, expectedLotRevision: 1 }), /stale-resource/);
  assert.equal(checkpoint(h.world), base);
});
test('all inherited concept processes stay gated, including firing and first light', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../../data/science/process-catalog.reference.json', import.meta.url)));
  assert.equal(catalog.processes.length, 82);
  const h = harness();
  for (const p of catalog.processes) {
    assert.equal(p.readiness, 'concept-only');
    assert.throws(() => h.start(p.id), /unsupported-process/);
  }
  for (const p of Object.values(PROCESS)) if (p.candidateId) assert.ok(catalog.processes.some(c => c.id === p.candidateId));
});
for (const seconds of [-1, 0, 0.5, NaN, Infinity, 86401, '60']) test(`reject invalid elapsed time ${seconds}`, () => {
  const h = harness(); const before = checkpoint(h.world);
  assert.throws(() => h.send({ kind: 'advance', seconds }), /invalid-time/); assert.equal(checkpoint(h.world), before);
});
test('invalid parameters, checkpoint versions and tampered commands are rejected', () => {
  assert.throws(() => createFixture({ dryerEnergyJ: -1 })); assert.throws(() => createFixture({ dryerPowerW: NaN }));
  const h = harness(); assert.throws(() => h.start(PROCESS.shape.id, 'a', 'bench', { thicknessMm: Infinity }));
  assert.throws(() => h.send({ kind: 'advance', seconds: 5, viewerCount: 100 }), /unknown-command-field/);
  assert.throws(() => restoreCheckpoint('{"modelVersion":"v2","commands":[]}'), /invalid-checkpoint/);
  const saved = JSON.parse(checkpoint(h.world)); saved.commands = [h.command({ kind: 'advance', seconds: -5 })];
  assert.throws(() => restoreCheckpoint(JSON.stringify(saved)), /invalid-time/);
});
test('conservation holds across thickness, duration, power and energy boundaries', () => {
  for (const thickness of [1, 5, 10, 20]) for (const power of [1, 10, 100]) for (const energy of [1, 9000, 100000]) {
    const h = harness({ dryerEnergyJ: energy, dryerPowerW: power }); h.shape('a', thickness);
    h.start(PROCESS.dry.id, 'a', 'dryer', { durationLimitS: 2400 });
    for (const seconds of [100, 2300, 1000]) { h.send({ kind: 'advance', seconds }); balanced(h.world); }
    assert.equal(Object.values(h.world.runs).at(-1).status === 'running', false);
    assert.equal(h.world.lots.a.solidMg, 100000);
  }
});

// Contract-facing calculation: no lab ledger or clock is used by this function.
const { scienceStep, FIXTURE_CATALOG_VERSION, FIXTURE_PROCESS_VERSION } = await import('../../../src/science/step.ts');
function request(overrides = {}) {
  return { contract: '0.1.0', requestId: 'request:1', world: { worldId: 'lab', worldEpoch: 'epoch:1', worldVersion: 0 },
    runId: 'run:shape', processId: 'p11_pottery_shape', processVersion: FIXTURE_PROCESS_VERSION, catalogVersion: FIXTURE_CATALOG_VERSION,
    interval: { from: 0, to: 60000 }, state: null,
    environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0 },
    lots: [{ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 120000, unit: 'mg' }, location: 'eq:bench' }],
    equipment: [{ equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: FIXTURE_CATALOG_VERSION,
      condition: 1, params: { thicknessMm: 5 } }],
    energy: [{ sourceId: 'src:fixture-work', kind: 'mechanical', maxJ: 120 }], actions: [], seed: 1, ...overrides };
}
function contractBalance(r) {
  assert.equal(r.consumed.reduce((n, x) => n + x.amount.value, 0),
    [...r.produced, ...r.released].reduce((n, x) => n + x.amount.value, 0));
  for (const e of r.energy) { assert.equal(e.usedJ, e.lostJ + e.storedJ); assert.ok(Number.isInteger(e.usedJ)); }
}
test('ScienceStep is pure, deterministic and conserves the shaped lot', () => {
  const req = request(), before = structuredClone(req), r = scienceStep(req);
  assert.equal(r.status, 'completed'); assert.deepEqual(req, before); assert.deepEqual(scienceStep(req), r);
  assert.equal(r.produced[0].materialId, 'unfired_pot'); assert.equal(r.produced[0].amount.value, 120000);
  assert.equal(r.produced[0].quality.thicknessMm, 5); assert.equal(r.observations.length, 0); contractBalance(r);
});
test('ScienceStep split intervals and energy offers add to the whole interval', () => {
  const whole = scienceStep(request());
  const a = scienceStep(request({ interval: { from: 0, to: 23000 }, energy: [{ sourceId: 'src:fixture-work', kind: 'mechanical', maxJ: 46 }] }));
  const b = scienceStep(request({ requestId: 'request:2', interval: { from: 23000, to: 60000 }, state: a.state,
    energy: [{ sourceId: 'src:fixture-work', kind: 'mechanical', maxJ: 74 }] }));
  assert.equal(a.status, 'running'); assert.deepEqual(b.state, whole.state); assert.deepEqual(b.produced, whole.produced);
  assert.equal(a.energy[0].usedJ + b.energy[0].usedJ, whole.energy[0].usedJ); contractBalance(a); contractBalance(b);
});
test('ScienceStep completion shortens the requested interval; terminal state cannot consume twice', () => {
  const r = scienceStep(request({ interval: { from: 0, to: 120000 } }));
  assert.deepEqual(r.simulated, { from: 0, to: 60000 });
  const again = scienceStep(request({ state: r.state, interval: { from: 60000, to: 61000 }, lots: [], equipment: [], energy: [] }));
  assert.equal(again.status, 'completed'); assert.equal(again.consumed.length, 0); assert.equal(again.produced.length, 0);
});
test('ScienceStep caps use to energy offered and reports needs-input without inventing time', () => {
  const r = scienceStep(request({ energy: [{ sourceId: 'src:fixture-work', kind: 'mechanical', maxJ: 21 }] }));
  assert.equal(r.status, 'needs-input'); assert.equal(r.energy[0].usedJ, 20); assert.equal(r.simulated.to, 10000);
  assert.deepEqual(r.consumed, []); contractBalance(r);
});
test('ScienceStep rejects unknown versions, uncalibrated/live profiles and fractional clock units', () => {
  for (const change of [ { contract: '2.0.0' }, { processVersion: '1' }, { catalogVersion: 'raw-world' },
    { state: { schema: 'future', data: {} } }, { processId: 'p13_pottery_fire' }, { processId: 'p12_pottery_dry' },
    { environment: { sampleId: 'env:x', source: 'live', effectiveAt: 0 } },
    { interval: { from: 0, to: 1500 } }, { energy: [{ sourceId: 'src:x', kind: 'mechanical', maxJ: -1 }] },
    { lots: [{ ...request().lots[0], amount: { value: 120, unit: 'g' } }] } ]) {
    const r = scienceStep(request(change)); assert.equal(r.status, 'failed'); assert.deepEqual(r.consumed, []); assert.deepEqual(r.energy, []);
  }
});
test('ScienceStep refuses changed lots, epoch, equipment, or noncontiguous time after restart', () => {
  const initial = scienceStep(request({ interval: { from: 0, to: 10000 } }));
  const continued = { state: JSON.parse(JSON.stringify(initial.state)), interval: { from: 10000, to: 60000 } };
  for (const change of [{ interval: { from: 11000, to: 60000 } }, { world: { ...request().world, worldEpoch: 'other' } },
    { lots: [{ ...request().lots[0], amount: { value: 119999, unit: 'mg' } }] },
    { equipment: [{ ...request().equipment[0], condition: 0.5 }] }]) {
    assert.equal(scienceStep(request({ ...continued, ...change })).status, 'failed');
  }
});
test('ScienceStep operational shutdown freezes the gap; operator stop preserves unfinished inputs', () => {
  const a = scienceStep(request({ interval: { from: 0, to: 10000 }, stop: 'shutdown' }));
  assert.equal(a.status, 'running'); assert.equal(a.state.data.operationalPause, true);
  const b = scienceStep(request({ state: a.state, interval: { from: 100000, to: 150000 } }));
  assert.equal(b.status, 'completed'); assert.equal(b.energy[0].usedJ, 100);
  const stopped = scienceStep(request({ interval: { from: 0, to: 10000 }, stop: 'operator' }));
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.consumed.length, 0); contractBalance(stopped);
});
test('ScienceStep measuring needs an instrument/read action; never generates material', () => {
  const req = request({ runId: 'run:weigh', processId: 'fixture_mass_measure', interval: { from: 0, to: 10000 },
    lots: [{ ...request().lots[0], amount: { value: 108410, unit: 'mg' } }],
    equipment: [{ equipmentId: 'eq:balance', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: FIXTURE_CATALOG_VERSION, condition: 1 }],
    energy: [{ sourceId: 'src:balance', kind: 'electric', maxJ: 10 }],
    actions: [{ at: 0, residentId: 'res:researcher', action: 'read-balance' }] });
  const r = scienceStep(req); assert.equal(r.status, 'completed'); assert.equal(r.observations[0].value, 108400);
  assert.equal(r.observations[0].precision, 100); assert.equal(r.produced.length, 0); contractBalance(r);
  assert.equal(scienceStep({ ...req, actions: [] }).status, 'failed');
});
