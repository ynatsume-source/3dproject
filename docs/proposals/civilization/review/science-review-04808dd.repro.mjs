// Read-only review of 04808dd (wood fire 0.1.2), following lab b8bf6ec.
// Usage: node --import tsx <this file> /absolute/science [wood-version] [/absolute/65aa96b]
// Exit 0 means diagnostics completed, not that there are no findings. No source or world writes.
import { pathToFileURL } from 'node:url';

const root = process.argv[2], version = process.argv[3] ?? '0.1.2', previous = process.argv[4];
if (!root?.startsWith('/') || (previous && !previous.startsWith('/'))) throw new Error('Use absolute checkout paths.');
const get = (p, r = root) => import(pathToFileURL(`${r}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const { fuelComp } = await get('src/science/step/wood-fire.ts');
const { lotComp, tileComp } = await get('src/science/step/common.ts');
const { pv } = await get('src/science/params.ts');
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
  equipmentId: 'eq:wk', kind: 'fixture_wood_kiln', catalogEntry: 'fixture_wood_kiln', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 40000, uaWPerK: 8, chamberFraction: .3, maxBurnKgPerH: 15, forcedCoolingUaFactor: 5 },
};
const environment = { sampleId: 'env:review', source: 'live', effectiveAt: 0, airTempC: 28, humidity: .7, windMs: 3 };
const plan = { at: 0, residentId: 'res:dot', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } };
const base = (overrides = {}) => ({
  contract: '0.2.0', requestId: 'review', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, runId: 'run:review',
  processId: 'p13w_test_tile_wood_fire', processVersion: version, catalogVersion: 'civ-sci-test-2',
  interval: { from: 0, to: H }, state: null, environment, lots: [tile, wood()], equipment: [kiln],
  energy: [], actions: [plan], seed: 3, ...overrides,
});
const stopped = (fuel, ms = 1, rate = 15, start = 0) => base({
  requestId: `r:${start}`, runId: `run:${start}`, interval: { from: start, to: start + ms },
  environment: { ...environment, effectiveAt: start }, actions: [{ ...plan, at: start }],
  lots: [tile, fuel], equipment: [{ ...kiln, params: { ...kiln.params, maxBurnKgPerH: rate } }], stop: 'operator',
});
function checked(request, step = scienceStep) {
  try { const result = step(request); return { result, violations: validateResult(request, result) }; }
  catch (error) { return { exception: String(error) }; }
}
const used = r => r.energy.reduce((sum, e) => sum + e.usedJ, 0);
const asLot = p => ({ ...p, lotId: 'lot:returned', location: p.into });
function inspect(request, next = false) {
  const out = checked(request), r = out.result;
  if (!r) return out;
  const product = r.produced.find(p => p.materialId === 'firewood');
  // Preserve the actual returned mass and quality, including a JSON save/restore roundtrip.
  const returnedLot = product ? JSON.parse(JSON.stringify(asLot(product))) : null;
  const inputComp = fuelComp(request.lots[1]);
  const returnedComp = returnedLot ? fuelComp(returnedLot) : {};
  const o = { status: r.status, usedJ: used(r), inputComp, returnedLot, returnedComp,
    drawn: r.drawn, released: r.released, violations: out.violations, diagnostics: r.diagnostics };
  if (typeof inputComp !== 'string' && typeof returnedComp !== 'string' && r.consumed.some(p => p.lotId === request.lots[1].lotId)) {
    o.dryConsumedMg = (inputComp.wood_dry ?? 0) - (returnedComp.wood_dry ?? 0);
    o.withinDryHeat = o.usedJ <= o.dryConsumedMg * pv('woodLhvDry') / 1e6 + 1e-7;
  }
  if (next && returnedLot) {
    const following = checked(stopped(returnedLot, 1, 1, request.interval.to));
    o.next = following.result ? { status: following.result.status, diagnostics: following.result.diagnostics,
      consumed: following.result.consumed, violations: following.violations } : following;
  }
  return o;
}

const report = { target: root, version };
report.halfWater = inspect(stopped(wood(1000, 500000, 0)));
report.waterLimit = inspect(stopped(wood(1000000, 800000, 10000)), true);
report.ashLimit = inspect(stopped(wood(8, 0, 200000), 5), true);
let current = wood(1000, 600000, 0), totalJ = 0, o2Mg = 0;
for (let i = 0; i < 600; i++) {
  const out = inspect(stopped(current, 1, 1, i));
  totalJ += out.usedJ ?? 0;
  o2Mg += (out.drawn ?? []).reduce((sum, x) => sum + x.amount.value, 0);
  if (i === 19) report.first20 = { totalJ, o2Mg, returnedComp: out.returnedComp };
  if (typeof out.returnedComp === 'string' || !out.returnedLot || out.exception || out.status === 'failed') {
    report.repeatEnd = { run: i + 1, totalJ, o2Mg, ...inspect(stopped(current, 1, 1, i), true) };
    break;
  }
  current = { ...out.returnedLot, lotId: `lot:return:${i}` };
}

const sweep = { cases: 0, unreadableReturns: 0, heatChecks: 0, heatFailures: [], violations: [], exceptions: [], examples: [] };
for (const mg of [1, 2, 3, 4, 5, 8, 10, 20, 100, 1000, 1000000, 60000000]) {
  for (const water of [0, 150000, 500000, 600000, 799999, 800000]) {
    for (const ash of [0, 10000, 200000]) for (const ms of [1, 2, 5, 10, 30, 1000]) {
      const key = { mg, water, ash, ms }, out = inspect(stopped(wood(mg, water, ash), ms));
      sweep.cases++;
      if (out.exception) sweep.exceptions.push({ ...key, exception: out.exception });
      if (out.violations?.length) sweep.violations.push({ ...key, violations: out.violations });
      if (typeof out.returnedComp === 'string') {
        sweep.unreadableReturns++;
        if (sweep.examples.length < 6) sweep.examples.push({ ...key, returnedLot: out.returnedLot, error: out.returnedComp });
      }
      if (out.withinDryHeat !== undefined) {
        sweep.heatChecks++;
        if (!out.withinDryHeat) sweep.heatFailures.push({ ...key, usedJ: out.usedJ, dryConsumedMg: out.dryConsumedMg });
      }
    }
  }
}
report.sweep = sweep;
report.speciesReaders = [];
for (const species of ['constructor', 'toString', '__proto__']) {
  for (const [name, fn, prefix] of [['lotComp', lotComp, 'x'], ['tileComp', tileComp, 'xd']]) {
    const lot = JSON.parse(JSON.stringify({ ...tile, quality: { ...tile.quality, [`${prefix}_${species}_ppm`]: 1000 } }));
    try { report.speciesReaders.push({ name, species, accepted: true, composition: fn(lot) }); }
    catch (error) { report.speciesReaders.push({ name, species, accepted: false, error: String(error) }); }
  }
}
const first = scienceStep(base()), d = first.state.data, fc = fuelComp(wood());
report.heatDefinition = { schema: first.state.schema, evaluator: first.evidence.evaluatorVersion,
  cumulativeJ: d.cumUsedJ, expectedDryJ: d.burnedMg * fc.wood_dry / 60000000 * pv('woodLhvDry') / 1e6,
  integerJ: used(first), violations: validateResult(base(), first) };
if (previous) {
  const { scienceStep: oldStep } = await get('src/science/step/index.ts', previous);
  const oldFirst = oldStep(base({ processVersion: '0.1.1' }));
  const state = JSON.parse(JSON.stringify(oldFirst.state));
  const resume = base({ state, interval: { from: H, to: 2 * H }, actions: [] });
  const pinned = checked({ ...resume, processVersion: '0.1.1' }), relabelled = checked(resume);
  const freshTwo = checked(base({ interval: { from: 0, to: 2 * H } }));
  report.compatibility = { oldSchema: state.schema,
    pinnedVersion: { status: pinned.result?.status, diagnostics: pinned.result?.diagnostics, violations: pinned.violations },
    // Deliberately changes the request version: this is NOT how a host should resume a pinned old run.
    relabelledVersion: { status: relabelled.result?.status, cumulativeJ: relabelled.result?.state.data?.cumUsedJ, violations: relabelled.violations },
    freshTwoHoursJ: freshTwo.result?.state.data?.cumUsedJ };
}
console.log(JSON.stringify(report, null, 2));
