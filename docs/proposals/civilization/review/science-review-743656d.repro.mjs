// Focused follow-up: uniform offers, no-progress intervals, recovery, stops, and validator mutations.
// Usage: node --import tsx <this file> /absolute/science-checkout
// Read-only; failed assertions exit nonzero. Process version is read from the reviewed checkout.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
assert(root?.startsWith('/'), 'Pass an absolute science checkout path.');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { FIXTURE_PROCESS_VERSION } = await get('src/science/step/simple.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const T = 1_790_000_010_000;
const report = [];
function request(processId, contract, from, seconds, watts, state = null, stop) {
  const weigh = processId === 'fixture_mass_measure';
  return { contract, requestId: `r:${processId}:${from}`, runId: `run:${processId}`,
    world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, processId,
    processVersion: FIXTURE_PROCESS_VERSION, catalogVersion: 'civ-sci-test-2', seed: 3,
    interval: { from, to: from + seconds * 1000 }, state, stop,
    environment: { sampleId: 'env:review', source: 'simulation', effectiveAt: from },
    lots: [{ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 45000, unit: 'mg' }, location: 'site:bench',
      quality: { water_ppm: 193548, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, history_complete: 1 } }],
    equipment: [{ equipmentId: weigh ? 'eq:balance' : 'eq:bench', kind: weigh ? 'fixture_balance' : 'fixture_bench',
      catalogEntry: weigh ? 'fixture_balance' : 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1,
      params: weigh ? {} : { widthMm: 50, lengthMm: 50, thicknessMm: 10 } }],
    energy: [{ sourceId: 'src:review', kind: weigh ? 'electric' : 'mechanical', maxJ: seconds * watts }],
    actions: weigh && !state ? [{ at: from, residentId: 'res:dot', action: 'read-balance' }] : [] };
}
function checked(q) {
  const before = JSON.stringify(q), r = scienceStep(q);
  assert.equal(JSON.stringify(q), before, 'request/state must not be mutated');
  assert.deepEqual(validateResult(q, r), []);
  assert.equal(r.contract, q.contract);
  if (q.contract === '0.2.0') assert.deepEqual(r.drawn, []);
  else assert.equal(Object.hasOwn(r, 'drawn'), false);
  const span = q.interval.to - q.interval.from;
  const delivered = span ? q.energy[0].maxJ * (r.simulated.to - q.interval.from) / span : 0;
  assert(r.energy.reduce((s, e) => s + e.usedJ, 0) <= delivered + 1e-9);
  return r;
}
function empty(r) {
  for (const key of ['consumed', 'produced', 'released', 'energy', 'observations']) assert.deepEqual(r[key], []);
}
const sumJ = r => r.energy.reduce((s, e) => s + e.usedJ, 0);
for (const processId of ['fixture_mass_measure', 'p11_pottery_shape', 'p11x_test_tile_shape']) {
  const weigh = processId === 'fixture_mass_measure', power = weigh ? 1 : 2, duration = weigh ? 10 : 60;
  const strip = ({ contract, drawn, ...rest }) => rest;
  const runs = [];
  for (const contract of ['0.1.0', '0.2.0']) {
    const lowSpan = weigh ? 30 : 120;
    const low = checked(request(processId, contract, T, lowSpan, weigh ? 1 / 3 : 1));
    assert.equal(low.status, 'needs-input'); empty(low);
    assert.equal(low.simulated.to, T + lowSpan * 1000); assert.equal(low.state.data.elapsedS, 0);
    const resumed = checked(request(processId, contract, low.simulated.to, duration * 2, power, JSON.parse(JSON.stringify(low.state))));
    assert.equal(resumed.status, 'completed'); assert.equal(resumed.simulated.to, low.simulated.to + duration * 1000);
    assert.equal(sumJ(resumed), duration * power);
    assert.equal(weigh ? resumed.observations.length : resumed.produced.length, 1);
    const duplicate = checked(request(processId, contract, resumed.simulated.to, 30, power, resumed.state));
    assert.equal(duplicate.status, 'completed'); empty(duplicate);

    // Existing progress survives an unpowered interval; its unused offer is not banked.
    const half = checked(request(processId, contract, T, duration / 2, power));
    assert.equal(half.status, 'running');
    const gap = checked(request(processId, contract, half.simulated.to, 30, 0, half.state));
    assert.equal(gap.status, 'needs-input'); empty(gap);
    assert.equal(gap.state.data.elapsedS, duration / 2);
    const recovered = checked(request(processId, contract, gap.simulated.to, duration, power, gap.state));
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.simulated.to, T + (duration + 30) * 1000);
    assert.equal(sumJ(half) + sumJ(recovered), duration * power);
    const whole = checked(request(processId, contract, T, duration * 2, power));
    assert.deepEqual(recovered.produced, whole.produced);
    assert.equal(sumJ(whole), duration * power);

    const stops = [];
    for (const stop of ['operator', 'equipment-lost', 'world-pause', 'shutdown']) {
      const stopped = checked(request(processId, contract, half.simulated.to, 30, 0, half.state, stop));
      const pause = stop === 'world-pause' || stop === 'shutdown';
      assert.equal(stopped.status, pause ? 'needs-input' : 'stopped'); empty(stopped);
      assert.equal(stopped.simulated.to, half.simulated.to + 30000);
      const next = checked(request(processId, contract, stopped.simulated.to, duration, power, stopped.state));
      assert.equal(next.status, pause ? 'completed' : 'stopped');
      if (!pause) empty(next);
      stops.push({ stop, status: stopped.status, resumedStatus: next.status });
    }

    // Keep observations valid while forging an early energy use: only the new energy check should reject it.
    const q = request(processId, contract, T, duration * 2, power);
    const early = { ...whole, simulated: { from: T, to: T + duration * 500 }, observations: [] };
    const violations = validateResult(q, early);
    assert.equal(violations.length, 1); assert.match(violations[0], /had arrived/);
    const split = { ...early, energy: whole.energy.flatMap(e => [
      { ...e, usedJ: e.usedJ / 2, lostJ: e.lostJ / 2 }, { ...e, usedJ: e.usedJ / 2, lostJ: e.lostJ / 2 }]) };
    assert(validateResult(q, split).some(v => v.includes('had arrived')), 'sum entries from the same source');
    runs.push({ low: strip(low), resumed: strip(resumed), recovered: strip(recovered), stops });
    report.push({ processId, contract, lowStatus: low.status, lowTo: low.simulated.to, usedAfterRecovery: sumJ(resumed),
      completedAt: resumed.simulated.to, stops, earlyEnergyRejected: true, splitEnergyRejected: true });
  }
  assert.deepEqual(runs[0], runs[1], 'both contract versions must agree beyond the envelope');
}
console.log(JSON.stringify({ root, processVersion: FIXTURE_PROCESS_VERSION, passed: true, report }, null, 2));
