// Read-only review diagnostics for e118e9f. Run with node --import tsx.
// Arguments: absolute e118e9f and 1f7538f checkout paths. No files or world state are written.
// Exit code 0 means diagnostics completed; inspect the JSON for findings, especially oldStates.
import { pathToFileURL } from 'node:url';
const root = process.argv[2], previousRoot = process.argv[3];
if (!root?.startsWith('/') || !previousRoot?.startsWith('/')) throw new Error('Pass absolute current and previous science checkout paths.');
const { scienceStep } = await import(pathToFileURL(`${root}/src/science/step/index.ts`));
const { scienceStep: previousStep } = await import(pathToFileURL(`${previousRoot}/src/science/step/index.ts`));
const { validateResult } = await import(pathToFileURL(`${root}/src/science/step/validate.ts`));
const W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const CALC = {
  contract: '0.1.0', requestId: 'r0', world: W, runId: 'run:review', processId: 'p20x_lime_calcine_test', processVersion: '0.1.0',
  catalogVersion: 'civ-sci-test-1', interval: { from: 0, to: 30000 }, state: null,
  environment: { sampleId: 'env:review', source: 'simulation', effectiveAt: 0, airTempC: 25 },
  lots: [{ lotId: 'lot:feed', materialId: 'calcium_carbonate_feed', amount: { value: 100000, unit: 'mg' }, location: 'site:review', quality: { x_calcite_ppm: 950000 } }],
  equipment: [{ equipmentId: 'eq:calciner', kind: 'fixture_calciner', catalogEntry: 'fixture_calciner', catalogVersion: 'civ-sci-test-1', condition: 1,
    params: { setpointC: 900, holdS: 7200, heatCapJPerK: 15000, uaWPerK: 2, maxPowerW: 4000 } }],
  energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: 120000 }], actions: [], seed: 1,
};
const FIRE = {
  contract: '0.1.0', requestId: 'r', world: W, runId: 'run:fire', processId: 'p13x_test_tile_fire', processVersion: '0.1.0', catalogVersion: 'civ-sci-test-1',
  state: null, interval: { from: 0, to: 30000 }, environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0, airTempC: 28, humidity: 0.72, windMs: 3 },
  lots: [{ lotId: 'lot:dry', materialId: 'test_tile_dry', amount: { value: 37047, unit: 'mg' }, location: 'site:review',
    quality: { water_ppm: 20434, thickness_mm: 10, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 } }],
  equipment: [{ equipmentId: 'eq:kiln', kind: 'fixture_kiln', catalogEntry: 'fixture_kiln', catalogVersion: 'civ-sci-test-1', condition: 1,
    params: { heatCapJPerK: 40000, uaWPerK: 8, maxPowerW: 15000, forcedCoolingUaFactor: 5 } }],
  energy: [{ sourceId: 'src:heat', kind: 'heat', maxJ: 450000 }], actions: [{ at: 0, residentId: 'res:review', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } }], seed: 7,
};

CALC.processVersion = FIRE.processVersion = '0.2.0';
const HYD = { ...CALC, processId: 'p21x_lime_hydrate_test', energy: [],
  lots: [{ lotId: 'lot:lime', materialId: 'quicklime', amount: { value: 56080, unit: 'mg' }, location: 'site:review', quality: { x_lime_ppm: 1000000 } },
    { lotId: 'lot:water', materialId: 'process_water', amount: { value: 15000, unit: 'mg' }, location: 'site:review' }],
  equipment: [{ equipmentId: 'eq:tub', kind: 'fixture_slaking_tub', catalogEntry: 'fixture_slaking_tub', catalogVersion: 'civ-sci-test-1', condition: 1, params: { heatCapJPerK: 400, uaWPerK: 1.5 } }] };
const SOAK = { ...FIRE, processId: 'm01x_tile_soak_test', energy: [], actions: [],
  lots: [{ lotId: 'lot:fired', materialId: 'test_tile_fired', amount: { value: 100000, unit: 'mg' }, location: 'site:review',
    quality: { xd_metakaolin_ppm: 700000, xd_quartz_ppm: 300000, sinter_ppm: 0, history_complete: 1 } },
    { lotId: 'lot:water', materialId: 'process_water', amount: { value: 500000, unit: 'mg' }, location: 'site:review' }],
  equipment: [{ equipmentId: 'eq:basin', kind: 'fixture_soak_basin', catalogEntry: 'fixture_soak_basin', catalogVersion: 'civ-sci-test-1', condition: 1 }] };
const DRY = { ...FIRE, processId: 'p12x_test_tile_dry', energy: [], actions: [],
  lots: [{ lotId: 'lot:green', materialId: 'test_tile_green', amount: { value: 50000, unit: 'mg' }, location: 'site:review',
    quality: { water_ppm: 240000, width_mm: 50, length_mm: 100, thickness_mm: 10, history_complete: 1 } }],
  equipment: [{ equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-1', condition: 1, params: { sunExposure: 0 } }] };
function bounds(start, end, chunk) {
  const b = [start];
  for (let t = Math.floor(start / chunk + 1) * chunk; t < end; t += chunk) b.push(t);
  b.push(end); return b;
}
function run(base, bs, watts, stop = false) {
  let state = null, last, usedJ = 0;
  const violations = [];
  for (let i = 1; i < bs.length; i++) {
    const req = { ...base, state, requestId: `req:${i}`, interval: { from: bs[i-1], to: bs[i] },
      actions: i === 1 ? base.actions.map(a => ({ ...a, at: bs[0] })) : [],
      energy: base.energy.map(e => ({ ...e, maxJ: Math.floor(watts * (bs[i] - bs[i-1]) / 1000) })),
      stop: stop && i === bs.length - 1 ? 'operator' : undefined };
    last = scienceStep(req); state = JSON.parse(JSON.stringify(last.state));
    usedJ += last.energy.reduce((s, e) => s + e.usedJ, 0);
    violations.push(...validateResult(req, last));
    if (last.status !== 'running') break;
  }
  return { status: last.status, usedJ, endAt: last.simulated.to, produced: last.produced, released: last.released,
    diagnostics: last.diagnostics, state: last.state, violations };
}
const report = {};
const day = 86400000;
report.weakCalcine = [day, 3600000, 30000].map(chunk => run(CALC, bounds(0, day, chunk), 600, true));
report.weakFiring = [day, 3600000, 30000].map(chunk => run(FIRE, bounds(0, day, chunk), 1000, true));
report.hydration = [5000, 1000, 737].map(chunk => run(HYD, bounds(0, 43200000, chunk), 0));
report.oldStates = [DRY, FIRE, SOAK, CALC, HYD].map(base => {
  const oldReq = { ...base, processVersion: '0.1.0', interval: { from: 0, to: 1000 } };
  const old = previousStep(oldReq);
  if (old.status !== 'running') throw new Error(`Old fixture did not run: ${base.processId} ${old.evidence.notes}`);
  const req = { ...base, requestId: 'restore', state: JSON.parse(JSON.stringify(old.state)), actions: [], interval: { from: 1000, to: 2000 } };
  const restored = scienceStep(req);
  const fresh = scienceStep({ ...base, interval: { from: 0, to: 1000 } });
  return { processId: base.processId, oldSchema: old.state.schema, freshSchema: fresh.state.schema,
    restoreStatus: restored.status, restoreSchema: restored.state.schema, notes: restored.evidence.notes,
    consumed: restored.consumed, produced: restored.produced, released: restored.released, violations: validateResult(req, restored) };
});
report.aligned30s = [DRY, FIRE, SOAK, CALC, HYD].map(base => ({ processId: base.processId,
  one: run(base, [0, 3600000], base === CALC ? 4000 : 15000, true),
  per30s: run(base, bounds(0, 3600000, 30000), base === CALC ? 4000 : 15000, true) }));
report.offsetStart = [CALC, FIRE, DRY, HYD].map(base => ({ processId: base.processId,
  one: run(base, [1000, 3600000], base === CALC ? 4000 : 15000, true),
  global30s: run(base, bounds(1000, 3600000, 30000), base === CALC ? 4000 : 15000, true),
  relative30s: run(base, bounds(0, 3599000, 30000).map(t => t + 1000), base === CALC ? 4000 : 15000, true) }));
console.log(JSON.stringify(report, null, 2));
