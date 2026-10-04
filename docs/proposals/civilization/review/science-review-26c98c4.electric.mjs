// Focused differential check for the shared settleWare change in 26c98c4.
// Usage: node --import tsx <this file> /absolute/current /absolute/451ea82
// Read-only. Hashes every complete interval result; never writes source or world state.
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [current, previous] = process.argv.slice(2);
if (![current, previous].every(p => p?.startsWith('/'))) throw new Error('Pass two absolute checkout paths.');
const get = (root, file) => import(pathToFileURL(`${root}/${file}`));
const now = await get(current, 'src/science/step/index.ts');
const before = await get(previous, 'src/science/step/index.ts');
const { validateResult } = await get(current, 'src/science/step/validate.ts');
const H = 3600000;
const tile = { lotId: 'lot:tile', materialId: 'test_tile_dry', amount: { value: 37037, unit: 'mg' }, location: 'site:hearth',
  quality: { water_ppm: 20169, thickness_mm: 10, width_mm: 50, length_mm: 50,
    xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 } };
const kiln = { equipmentId: 'eq:k', kind: 'fixture_kiln', catalogEntry: 'fixture_kiln', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 40000, uaWPerK: 8, maxPowerW: 15000, forcedCoolingUaFactor: 5 } };
const plan = { at: 0, residentId: 'res:dot', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } };
function run(step, chunk, end, forced = false, crack = 0) {
  let state = null, last, intervals = 0, usedJ = 0;
  const hash = createHash('sha256'), violations = [];
  for (let from = 0; from < end; from += chunk) {
    const to = Math.min(end, from + chunk);
    const request = {
      contract: '0.1.0', requestId: `r:${from}`, world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, runId: 'run:electric-review',
      processId: 'p13x_test_tile_fire', processVersion: '0.2.0', catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
      environment: { sampleId: 'env:review', source: 'live', effectiveAt: 0, airTempC: 28, humidity: .7, windMs: 3 },
      lots: [{ ...tile, quality: { ...tile.quality, crack } }], equipment: [kiln],
      energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: 15 * (to - from) }],
      actions: from === 0 ? [{ ...plan, params: { ...plan.params, forcedCooling: forced ? 1 : 0 } }] : [],
      seed: 3, stop: to === end ? 'operator' : undefined,
    };
    last = step(request);
    violations.push(...validateResult(request, last));
    hash.update(JSON.stringify(last)); intervals++;
    usedJ += last.energy.reduce((sum, e) => sum + e.usedJ, 0);
    state = JSON.parse(JSON.stringify(last.state));
    if (last.status !== 'running') break;
  }
  return { sha256: hash.digest('hex'), intervals, usedJ, status: last.status,
    material: last.produced[0]?.materialId, violations };
}
const results = [];
for (const [name, chunk, end, forced, crack] of [
  ['normal', H, 48 * H, false, 0], ['off-grid', 7300, 48 * H, false, 0],
  ['stop', H, 3 * H, false, 0], ['forced-cooling', H, 48 * H, true, 0], ['existing-crack', H, 48 * H, false, 2],
]) {
  const a = run(before.scienceStep, chunk, end, forced, crack), b = run(now.scienceStep, chunk, end, forced, crack);
  results.push({ name, equal: a.sha256 === b.sha256, before: a, after: b });
}
console.log(JSON.stringify({ current, previous, results }, null, 2));
if (results.some(r => !r.equal || r.before.violations.length || r.after.violations.length || r.after.status === 'failed')) process.exitCode = 1;
