// Focused review of the W3b fix: returned fuel, wont_burn products/retry, old-state rejection.
// Usage: node --import tsx <this file> /absolute/science [wood-version]
// Read-only. Exit 0 means diagnostics completed, not that every observed result is correct.
import { pathToFileURL } from 'node:url';
const root = process.argv[2], version = process.argv[3] ?? '0.1.3';
if (!root?.startsWith('/')) throw new Error('Pass an absolute science checkout path.');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const { fuelComp } = await get('src/science/step/wood-fire.ts');
const tile = { lotId: 'lot:tile', materialId: 'test_tile_dry', amount: { value: 37037, unit: 'mg' }, location: 'site:hearth',
  quality: { water_ppm: 20169, thickness_mm: 10, width_mm: 50, length_mm: 50,
    xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 } };
const wood = (mg = 60000000, water = 150000, ash = 10000) => ({
  lotId: 'lot:wood', materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'site:woodpile',
  quality: { water_ppm: water, ash_dry_ppm: ash },
});
const kiln = { equipmentId: 'eq:wk', kind: 'fixture_wood_kiln', catalogEntry: 'fixture_wood_kiln',
  catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 40000, uaWPerK: 8, chamberFraction: .3, maxBurnKgPerH: 15, forcedCoolingUaFactor: 5 } };
const plan = { at: 0, residentId: 'res:dot', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } };
const base = (o = {}) => ({
  contract: '0.2.0', requestId: 'review', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, runId: 'run:review',
  processId: 'p13w_test_tile_wood_fire', processVersion: version, catalogVersion: 'civ-sci-test-2',
  interval: { from: 0, to: 30000 }, state: null,
  environment: { sampleId: 'env:review', source: 'live', effectiveAt: 0, airTempC: 28, humidity: .7, windMs: 3 },
  lots: [tile, wood()], equipment: [kiln], energy: [], actions: [plan], seed: 3, ...o,
});
function checked(req) {
  try { const result = scienceStep(req); return { result, violations: validateResult(req, result) }; }
  catch (error) { return { exception: String(error) }; }
}
const asLot = (p, id) => JSON.parse(JSON.stringify({ ...p, lotId: id, location: p.into }));
const report = { target: root, version, wontBurn: [] };
for (const [name, fuel] of [['water95', wood(60000000, 950000)],
  ['allWater', wood(60000000, 1000000, 0)], ['allAsh', wood(60000000, 0, 1000000)]]) {
  const first = checked(base({ lots: [tile, fuel] }));
  const product = first.result?.produced.find(p => p.materialId.startsWith('test_tile_'));
  const retry = product ? checked(base({ runId: `run:retry:${name}`, requestId: `retry:${name}`,
    interval: { from: 30000, to: 60000 }, actions: [{ ...plan, at: 30000 }],
    lots: [asLot(product, 'lot:retry'), wood()] })) : null;
  report.wontBurn.push({ name, inputMaterial: tile.materialId, ...first,
    retryWithFreshFuel: retry?.result ? { status: retry.result.status, diagnostics: retry.result.diagnostics,
      consumed: retry.result.consumed, violations: retry.violations } : retry });
}
let current = wood(1000, 600000, 0), totalJ = 0, noDryHeat = 0;
report.returnChain = { limit: 1200 };
for (let i = 0; i < 1200; i++) {
  const before = fuelComp(current);
  const out = checked(base({ runId: `run:chain:${i}`, requestId: `chain:${i}`, lots: [tile, current],
    interval: { from: i, to: i + 1 }, actions: [{ ...plan, at: i }], stop: 'operator',
    equipment: [{ ...kiln, params: { ...kiln.params, maxBurnKgPerH: 1 } }] }));
  const r = out.result, p = r?.produced.find(p => p.materialId === 'firewood');
  const next = p ? asLot(p, `lot:chain:${i}`) : null, after = next ? fuelComp(next) : {};
  const usedJ = r?.energy.reduce((sum, e) => sum + e.usedJ, 0) ?? 0;
  totalJ += usedJ;
  if (typeof before !== 'string' && typeof after !== 'string' && usedJ > 0 && (before.wood_dry ?? 0) <= (after.wood_dry ?? 0)) noDryHeat++;
  if (out.exception || out.violations?.length || r?.status === 'failed' || !next || typeof after === 'string' || r?.diagnostics?.outcome === 'wont_burn') {
    report.returnChain = { runs: i + 1, totalJ, noDryHeat, status: r?.status, outcome: r?.diagnostics?.outcome,
      lastUsedJ: usedJ, before, after, violations: out.violations, exception: out.exception, diagnostics: r?.diagnostics };
    break;
  }
  current = next;
}
const old = checked(base({ state: { schema: 'civ-sci.tile-wood-fire/1', data: { lastTo: 0 } } }));
report.oldState = old.result ? { status: old.result.status, diagnostics: old.result.diagnostics,
  consumed: old.result.consumed, drawn: old.result.drawn, violations: old.violations } : old;
console.log(JSON.stringify(report, null, 2));
