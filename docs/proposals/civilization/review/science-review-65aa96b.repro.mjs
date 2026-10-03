// Read-only follow-up to lab 7d671ea, targeting science 65aa96b / wood firing 0.1.1.
// Usage (from a checkout with tsx): node --import tsx <this file> /absolute/science [wood-version]
// Prints observations, including unresolved counterexamples. Exit 0 means the diagnostic completed.
// No world host, inventory persistence, source mutation or network access.
import { pathToFileURL } from 'node:url';

const root = process.argv[2], woodVersion = process.argv[3] ?? '0.1.1';
if (!root?.startsWith('/')) throw new Error('Pass an absolute science checkout path.');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const { fuelComp } = await get('src/science/step/wood-fire.ts');
const { fuelLhvJPerMg } = await get('src/science/physics.ts');
const { splitComp, totalMg } = await get('src/science/chem.ts');

const H = 3600000;
const tile = {
  lotId: 'lot:tile', materialId: 'test_tile_dry', amount: { value: 37037, unit: 'mg' }, location: 'site:hearth',
  quality: { water_ppm: 20169, thickness_mm: 10, width_mm: 50, length_mm: 50,
    xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 },
};
const wood = (mg = 60000000, water = 150000, ash = 10000) => ({
  lotId: 'lot:wood', materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'site:woodpile',
  quality: { water_ppm: water, ash_dry_ppm: ash },
});
const kiln = {
  equipmentId: 'eq:wk', kind: 'fixture_wood_kiln', catalogEntry: 'fixture_wood_kiln',
  catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 40000, uaWPerK: 8, chamberFraction: .3, maxBurnKgPerH: 15, forcedCoolingUaFactor: 5 },
};
const environment = { sampleId: 'env:review', source: 'live', effectiveAt: 0, airTempC: 28, humidity: .7, windMs: 3 };
const plan = { at: 0, residentId: 'res:dot', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } };
const base = (overrides = {}) => ({
  contract: '0.2.0', requestId: 'review', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, runId: 'run:review',
  processId: 'p13w_test_tile_wood_fire', processVersion: woodVersion, catalogVersion: 'civ-sci-test-2',
  interval: { from: 0, to: H }, state: null, environment, lots: [tile, wood()], equipment: [kiln],
  energy: [], actions: [plan], seed: 3, ...overrides,
});
function checked(request) {
  try {
    const result = scienceStep(request);
    return { result, violations: validateResult(request, result) };
  } catch (error) { return { exception: String(error) }; }
}
function envelope(request) {
  const out = checked(request), r = out.result;
  return r ? { status: r.status, contract: r.contract, hasDrawn: Object.hasOwn(r, 'drawn'), drawn: r.drawn,
    consumed: r.consumed, diagnostics: r.diagnostics, violations: out.violations } : out;
}
const comp = lot => {
  const c = fuelComp(lot);
  if (typeof c === 'string') throw new Error(c);
  return c;
};
function fuelObservation(request) {
  const out = checked(request), r = out.result;
  if (!r) return out;
  const input = request.lots.find(l => l.materialId === 'firewood');
  const product = r.produced.find(l => l.materialId === 'firewood');
  const returnedLot = product ? { ...product, lotId: 'lot:returned', location: product.into } : null;
  const settled = r.consumed.some(l => l.lotId === input.lotId);
  const before = comp(input), after = settled ? (returnedLot ? comp(returnedLot) : {}) : before;
  const settledMg = settled ? input.amount.value - (product?.amount.value ?? 0) : 0;
  const taken = splitComp(before, settledMg).taken;
  const usedJ = r.energy.reduce((sum, e) => sum + e.usedJ, 0);
  // Compare the actual integer component selection and the returned lot, not only the original average LHV.
  const takenNetHeatJ = totalMg(taken) ? totalMg(taken) * fuelLhvJPerMg(taken) : 0;
  return { status: r.status, diagnostics: r.diagnostics, usedJ, settledMg, taken, takenNetHeatJ,
    before, after, dryWoodRemovedMg: (before.wood_dry ?? 0) - (after.wood_dry ?? 0),
    drawn: r.drawn, released: r.released, returnedLot, violations: out.violations,
    heatWithoutDryWoodRemoval: settled && usedJ > 0 && (before.wood_dry ?? 0) === (after.wood_dry ?? 0) };
}
const tiny = (fuel, maxBurnKgPerH = 15, i = 0) => base({
  runId: `run:tiny:${i}`, requestId: `tiny:${i}`, interval: { from: i, to: i + 1 },
  environment: { ...environment, effectiveAt: i }, actions: [{ ...plan, at: i }],
  lots: [tile, fuel], equipment: [{ ...kiln, params: { ...kiln.params, maxBurnKgPerH } }], stop: 'operator',
});

const report = { target: root, woodVersion };
report.W1 = envelope(base({ stop: 'equipment-lost', equipment: [] }));
report.W2 = [];
for (const contract of ['0.1.0', '0.1.3', '0.2.0', '0.2.3']) {
  for (const processId of ['p12x_test_tile_dry', 'fixture_mass_measure', 'p11x_test_tile_shape',
    'p20x_lime_calcine_test', 'p21x_lime_hydrate_test', 'p13x_test_tile_fire', 'm01x_tile_soak_test',
    'p13w_test_tile_wood_fire', 'not-implemented']) {
    const out = envelope(base({ contract, processId, processVersion: 'deliberately-unsupported' }));
    report.W2.push({ requestedContract: contract, processId, ...out });
  }
}
report.W3 = {
  original15Percent: fuelObservation(tiny(wood())),
  halfWater: fuelObservation(tiny(wood(1000, 500000, 0))),
  wetSlow: fuelObservation(tiny(wood(1000, 600000, 0), 1)),
  wetWithAsh: fuelObservation(tiny(wood(1000, 600000, 200000), 1)),
};
let fuel = wood(1000, 600000, 0);
const repetitions = [];
for (let i = 0; i < 20; i++) {
  const out = fuelObservation(tiny(fuel, 1, i));
  repetitions.push(out);
  if (!out.returnedLot) break;
  // Each new run receives the previous result's actual returned fuel, with its new mass AND quality.
  fuel = { ...out.returnedLot, lotId: `lot:rest:${i}` };
}
report.W3.sequentialReturns = {
  before: repetitions[0].before, after: repetitions.at(-1).after,
  usedJ: repetitions.reduce((sum, x) => sum + (x.usedJ ?? 0), 0),
  o2Mg: repetitions.reduce((sum, x) => sum + (x.drawn ?? []).reduce((s, d) => s + d.amount.value, 0), 0),
  repetitions,
};

const shape = base({ contract: '0.1.0', processId: 'p11x_test_tile_shape', processVersion: 'fixture-2',
  interval: { from: 0, to: 60000 }, environment: { ...environment, source: 'simulation' }, actions: [],
  lots: [{ ...tile, materialId: 'prepared_clay', amount: { value: 45000, unit: 'mg' },
    quality: { water_ppm: 193548, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000 } }],
  equipment: [{ equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench',
    catalogVersion: 'civ-sci-test-2', condition: 1, params: { widthMm: 50, lengthMm: 50, thicknessMm: 10 } }],
  energy: [{ sourceId: 'src:work', kind: 'mechanical', maxJ: 120 }],
});
report.W4 = [];
for (const [name, extra] of [
  ['valid', {}], ['negative', { xd_quartz_ppm: -1 }], ['overfull', { xd_quartz_ppm: 900000 }],
  ['unknown', { xd_unknown_ppm: 1 }], ['fractional', { xd_kaolinite_ppm: 450000.5 }], ['water', { xd_water_ppm: 1 }],
  ['constructor', { xd_constructor_ppm: 1000 }], ['toString', { xd_toString_ppm: 1000 }],
  ['__proto__', { xd___proto___ppm: 1000 }],
]) {
  // Ordinary JSON numeric quality keys; no prototype is modified by this diagnostic.
  const request = JSON.parse(JSON.stringify({ ...shape,
    lots: [{ ...shape.lots[0], quality: { ...shape.lots[0].quality, ...extra } }] }));
  const out = checked(request), r = out.result, product = r?.produced[0];
  let downstream;
  if (product) downstream = envelope(base({ interval: { from: 0, to: 30000 },
    lots: [{ ...product, lotId: 'lot:shaped', location: product.into }, wood()] }));
  report.W4.push({ name, status: r?.status, diagnostics: r?.diagnostics, consumed: r?.consumed,
    energy: r?.energy, product, violations: out.violations, exception: out.exception, downstream });
}

report.W5 = [];
for (const [tileHistory, fuelHistory] of [[1, 1], [1, 0], [0, 1], [0, 0]]) {
  let state = null, last, violations = [];
  const lots = [{ ...tile, quality: { ...tile.quality, history_complete: tileHistory } },
    { ...wood(), quality: { ...wood().quality, history_complete: fuelHistory } }];
  for (let h = 0; h < 48; h++) {
    const out = checked(base({ requestId: `history:${h}`, state, lots, interval: { from: h * H, to: (h + 1) * H },
      actions: h === 0 ? [plan] : [] }));
    if (out.exception) { last = out; break; }
    last = out.result; violations.push(...out.violations);
    state = JSON.parse(JSON.stringify(last.state));
    if (last.status !== 'running') break;
  }
  report.W5.push({ tileHistory, fuelHistory, status: last.status, exception: last.exception, violations,
    outputHistory: last.produced?.find(l => l.materialId === 'test_tile_fired')?.quality?.history_complete });
}
console.log(JSON.stringify(report, null, 2));
