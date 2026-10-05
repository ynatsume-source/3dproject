// Deferred common tileComp/tileQuality review. Read-only; no edits to the supplied checkout.
// node --import tsx THIS_FILE /absolute/science-checkout
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? process.cwd());
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { FIXTURE_PROCESS_VERSION } = await get('src/science/step/simple.ts');
const { DRYING_PROCESS } = await get('src/science/step/drying.ts');
const { FIRING_PROCESS } = await get('src/science/step/firing.ts');
const { SOAK_PROCESS } = await get('src/science/step/soak.ts');
const { tileComp } = await get('src/science/step/common.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const H = 3600000;
const violations = [];
const asLot = (p, id) => ({ lotId: id, materialId: p.materialId, amount: p.amount, quality: p.quality, location: p.into });
const req = (proc, lots, equipment, to = H, actions = [], energy = []) => ({
  contract: '0.2.0', requestId: 'req:tile', runId: 'run:tile', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
  ...proc, catalogVersion: 'civ-sci-test-2', seed: 1, interval: { from: 0, to }, state: null,
  environment: { source: 'record', sampleId: 'env:tile', effectiveAt: 0, airTempC: 28, humidity: .75, windMs: 2 },
  lots, equipment, actions, energy,
});
const step = q => { const r = scienceStep(q); violations.push(...validateResult(q, r)); return r; };
const action = (at, name, params) => ({ at, action: name, residentId: 'res:dot', ...(params ? { params } : {}) });
const kiln = { equipmentId: 'eq:kiln', kind: 'fixture_kiln', condition: 1, params: { heatCapJPerK: 40000, uaWPerK: 8, maxPowerW: 15000, forcedCoolingUaFactor: 5 } };
const fire = tile => step(req(FIRING_PROCESS, [tile], [kiln], 24 * H,
  [action(0, 'fire_plan', { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 })], [{ sourceId: 'src:heater', kind: 'heat', maxJ: 15000 * 24 * 3600 }]));
const brief = r => ({ status: r.status, produced: r.produced, consumed: r.consumed, diagnostics: r.diagnostics });
function read(lot) {
  try { return { composition: tileComp(lot) }; } catch (e) { return { error: e.message }; }
}
const small = [45000, 45001].map(mg => {
  const clay = { lotId: 'lot:prepared', materialId: 'prepared_clay', location: 'bench', amount: { value: mg, unit: 'mg' },
    quality: { water_ppm: 200000, xd_kaolinite_ppm: 500000, xd_quartz_ppm: 500000, history_complete: 1 } };
  const bench = { equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1,
    params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 } };
  const shaped = step(req({ processId: 'p11x_test_tile_shape', processVersion: FIXTURE_PROCESS_VERSION }, [clay], [bench], H, [], [{ sourceId: 'src:hand', kind: 'mechanical', maxJ: 7200 }]));
  if (!shaped.produced[0]) return { mg, shaped: brief(shaped) };
  const dried = step(req(DRYING_PROCESS, [asLot(shaped.produced[0], 'lot:green')], [{ equipmentId: 'eq:rack', kind: 'drying_rack', condition: 1, params: { sunExposure: 0 } }],
    120 * H, [action(120 * H - 1, 'take_off')]));
  if (!dried.produced[0]) return { mg, shaped: brief(shaped), dried: brief(dried) };
  const lot = asLot(dried.produced[0], 'lot:dry');
  return { mg, shaped: brief(shaped), dried: brief(dried), reading: read(lot), firing: brief(fire(lot)) };
});
// A larger valid dry tile exercises the writer as well. Not the standard 45 g fixture.
// Initial species masses are exact integers (676500 + 792000 + 31500 = 1500000 mg).
const big = { lotId: 'lot:large-dry', materialId: 'test_tile_dry', location: 'bench', amount: { value: 1500000, unit: 'mg' },
  quality: { water_ppm: 0, width_mm: 200, length_mm: 200, thickness_mm: 20, history_complete: 1,
    xd_kaolinite_ppm: 451000, xd_quartz_ppm: 528000, xd_calcite_ppm: 21000 } };
const fired = fire(big);
let large = { input: big, readingInput: read(big), fired: brief(fired) };
if (fired.produced[0]) {
  const lot = asLot(fired.produced[0], 'lot:fired');
  const soaked = step(req(SOAK_PROCESS, [lot, { lotId: 'lot:water', materialId: 'process_water', amount: { value: 6000000, unit: 'mg' }, location: 'basin' }],
    [{ equipmentId: 'eq:basin', kind: 'fixture_soak_basin', condition: 1 }], 24 * H, [action(24 * H - 1, 'take_out')]));
  large = { ...large, readingOutput: read(lot), soaked: brief(soaked) };
}
console.log(JSON.stringify({ target: root, findings: { B2: { smallShapeDryFire: small, largerFireSoak: large } }, violations }, null, 2));
