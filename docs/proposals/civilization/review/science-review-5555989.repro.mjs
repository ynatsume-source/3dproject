// Read-only diagnostic, not a second world host. Exit 0 means the diagnostic ran, not that findings are fixed.
// node --import tsx THIS_FILE /absolute/science-checkout
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] ?? process.cwd());
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { CHARCOAL_PROCESS: PROC } = await get('src/science/step/charcoal.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const { fuelComp } = await get('src/science/step/wood-fire.ts');
const { react, REACTIONS, elementMoles, ATOMIC_MASS } = await get('src/science/chem.ts');
const H = 3600000, M = 60000;
const charge = (o = {}) => ({ lotId: 'lot:charge', materialId: 'firewood', amount: { value: 2000000, unit: 'mg' }, location: 'eq:retort', quality: { water_ppm: 150000 }, ...o });
const fuel = (o = {}) => ({ lotId: 'lot:fuel', materialId: 'firewood', amount: { value: 12000000, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: 150000 }, ...o });
const equipment = [
  { equipmentId: 'eq:retort', kind: 'fixture_tar_retort', condition: 1, params: { heatCapJPerK: 4000, uaWPerK: 2.5, heatShare: .35, capacityMl: 8000, collectShare: .6 } },
  { equipmentId: 'eq:hearth', kind: 'open_fire_pit', condition: 1, params: { maxBurnKgPerH: 3 } },
];
const req = (from, to, state = null, acts = [], o = {}) => ({
  contract: '0.2.0', requestId: `req:${from}`, runId: 'run:charcoal', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
  ...PROC, catalogVersion: 'civ-sci-test-2', seed: 1, interval: { from, to }, state,
  environment: { source: 'record', sampleId: `env:${from}`, effectiveAt: from, airTempC: 28, humidity: .75, windMs: 2 },
  lots: [charge(), fuel()], equipment, energy: [],
  actions: acts.map(([at, action, level]) => ({ at, action, residentId: 'res:lantern', ...(level === undefined ? {} : { params: { level } }) })), ...o,
});
let calls = 0, violationCount = 0;
const violations = [];
function step(q) {
  calls++;
  const r = scienceStep(q), v = validateResult(q, r);
  violationCount += v.length;
  if (v.length && violations.length < 20) violations.push({ from: q.interval.from, errors: v });
  return r;
}
const asLot = (p, id) => p && ({ lotId: id, materialId: p.materialId, amount: p.amount, quality: p.quality, location: p.into });
const sum = xs => (xs ?? []).reduce((s, x) => s + x.amount.value, 0);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const standard = [[200 * M, 'put_out'], [360 * M, 'open']];
function run(acts = standard, o = {}, chunk = H, origin = 0, json = false) {
  const shifted = acts.map(([t, ...rest]) => [origin + t, ...rest]);
  const end = origin + Math.max(...acts.map(a => a[0])) + 1;
  let state = null, last;
  const energy = { usedJ: 0, lostJ: 0, storedJ: 0 }, observations = [];
  for (let from = origin; from < end; from += chunk) {
    const to = Math.min(end, from + chunk);
    last = step(req(from, to, state, shifted.filter(([t]) => t >= from && t < to), o));
    state = json ? JSON.parse(JSON.stringify(last.state)) : last.state;
    for (const e of last.energy) for (const k of Object.keys(energy)) energy[k] += e[k] ?? 0;
    observations.push(...last.observations);
    if (!['running', 'needs-input'].includes(last.status)) break;
  }
  return { last, energy, observations };
}
const products = r => r.last.produced.map(p => ({ materialId: p.materialId, mg: p.amount.value, quality: p.quality, into: p.into }));
const outputKey = r => hash([r.last.produced, r.last.released, r.last.drawn, r.last.state, r.energy]);
const coalMg = r => r.last.produced.find(p => p.materialId === 'charcoal')?.amount.value ?? 0;
const massError = r => sum(r.last.consumed) + sum(r.last.drawn) - sum(r.last.produced) - sum(r.last.released);
const brief = r => ({ status: r.last.status, products: products(r), energy: r.energy, massErrorMg: massError(r), diagnostics: r.last.diagnostics, observations: r.observations });
const findings = {}, verification = {};
const normal = run();
verification.standard = brief(normal);
// A: missing weather is not a resident opening the lid, nor evidence that the vessel has broken.
const hot = step(req(0, 2 * H));
const unknown = step(req(2 * H, 3 * H, hot.state, [], { environment: { source: 'unknown', sampleId: 'env:missing', effectiveAt: 2 * H } }));
let coolState = hot.state, cool;
for (let t = 2 * H; t <= 6 * H; t += H) {
  const acts = t === 2 * H ? [[t, 'put_out']] : t === 6 * H ? [[t, 'open']] : [];
  cool = step(req(t, t + H, coolState, acts)); coolState = cool.state;
}
findings.A1 = { before: { tC: hot.diagnostics.tC, charMg: hot.state.data.charF }, missingWeatherActions: [], result: unknown,
  knownClosedCoolingControl: { products: cool.produced, observations: cool.observations } };
// B: take the actual brown, mostly-wood output and actual returned fuel into a new run.
const low = run([[0, 'fire_level', 0], [250 * M, 'put_out'], [360 * M, 'open']]);
const partial = low.last.produced.find(p => p.into === 'eq:retort' && ['charcoal', 'firewood'].includes(p.materialId));
const returnedFuel = low.last.produced.find(p => p.into === 'site:woodpile' && p.materialId === 'firewood');
const again = partial && returnedFuel ? step(req(0, H, null, [], { lots: [asLot(partial, 'lot:partial'), asLot(returnedFuel, 'lot:returned-fuel')] })) : null;
findings.B1 = { first: brief(low), restart: again && { status: again.status, diagnostics: again.diagnostics, consumed: again.consumed } };
// C: the caller violates equipment reservation, without the agreed equipment-lost notice.
const first = step(req(0, H));
const missing = step(req(H, 2 * H, first.state, [], { equipment: [] }));
const swapped = step(req(H, 2 * H, first.state, [], { equipment: equipment.map(e => ({ ...e, equipmentId: `${e.equipmentId}:other`, params: { ...e.params, ...(e.kind === 'fixture_tar_retort' ? { heatShare: 0 } : {}) } })) }));
findings.C1 = { noNoticeAndMissing: missing.status, noNoticeAndSwapped: swapped.status };
const misplaced = [charge(), fuel({ amount: { value: 1000000, unit: 'mg' }, location: 'eq:retort' })];
findings.C2 = { bothInside: [false, true].map(reverse => {
  const r = run(standard, { lots: reverse ? [...misplaced].reverse() : misplaced });
  return { status: r.last.status, charcoalMg: coalMg(r), maxC: r.last.diagnostics.maxC };
}) };
verification.validLotReorderIdentical = outputKey(run(standard, { lots: [fuel(), charge()] })) === outputKey(normal);
const lost = step(req(H, 2 * H, first.state, [], { stop: 'equipment-lost', equipment: [] }));
const stopped = step(req(H, 2 * H, first.state, [], { stop: 'operator' }));
verification.equipmentLostAtTo = { to: lost.simulated.to, sameSettlement: hash([lost.produced, lost.released, lost.drawn, lost.energy]) === hash([stopped.produced, stopped.released, stopped.drawn, stopped.energy]) };
const looks = Array.from({ length: 360 }, (_, i) => [17013 + i * M, 'look']);
verification.lookDoesNotChangePhysics = outputKey(run([...standard, ...looks])) === outputKey(normal);
const partitionPlan = [[0, 'fire_level', 1], [97 * M + 13013, 'fire_level', 2], [150 * M + 7017, 'put_out'], [330 * M + 3009, 'open']];
const reference = run(partitionPlan, {}, H, 1007, true);
verification.partitions = [H, 10 * M, 30000, 37001, 7300, 250, 50].map(chunk => {
  const r = chunk === H ? reference : run(partitionPlan, {}, chunk, 1007, chunk >= 10 * M);
  const deltas = r.last.produced.map(p => ({ materialId: p.materialId, deltaMg: p.amount.value - (reference.last.produced.find(b => b.materialId === p.materialId && b.into === p.into)?.amount.value ?? 0) }));
  return { chunkMs: chunk, startMs: 1007, exactlyIdentical: outputKey(r) === outputKey(reference), charcoalMg: coalMg(r), deltas,
    temperatureC: r.last.diagnostics.tC, maxC: r.last.diagnostics.maxC, usedJ: r.energy.usedJ, massErrorMg: massError(r) };
});
const checks = [];
for (const mg of [1, 2, 7, 100, 45000, 2000000]) for (const water_ppm of [0, 150000, 1000000]) for (const end of [1, 2 * H]) {
  const lots = [charge({ amount: { value: mg, unit: 'mg' }, quality: { water_ppm } }), fuel()];
  const r = run([[end, 'open']], { lots });
  const source = fuelComp(lots[1]);
  const back = r.last.produced.find(p => p.materialId === 'firewood' && p.into === 'site:woodpile');
  const left = back ? fuelComp(asLot(back, 'lot:fuel-back')) : {};
  const charProduct = r.last.produced.find(p => p.materialId === 'charcoal');
  const returnedCharMg = Math.floor((charProduct?.amount.value ?? 0) * (charProduct?.quality?.x_char_ppm ?? 0) / 1e6);
  // A conservative upper bound from declared solid output; ppm quantisation can enlarge it slightly.
  const charConsumedUpperMg = Math.max(0, Math.floor(r.last.state.data?.charF ?? 0) - returnedCharMg);
  const heatCeiling = ((source.wood_dry ?? 0) - (left.wood_dry ?? 0)) * 18 + charConsumedUpperMg * 30;
  checks.push({ mg, water_ppm, endMs: end, status: r.last.status, massErrorMg: massError(r), integerJ: Object.values(r.energy).every(Number.isInteger),
    energyClosed: r.energy.usedJ === r.energy.lostJ + r.energy.storedJ, storedEndsAtZero: r.energy.storedJ === 0, heatWithinSettledFuel: r.energy.usedJ <= heatCeiling });
}
verification.massEnergyMatrix = { count: checks.length, failures: checks.filter(x => x.status !== 'completed' || x.massErrorMg !== 0 || !x.integerJ || !x.energyClosed || !x.storedEndsAtZero || !x.heatWithinSettledFuel) };
verification.wetFuel = [0, 150000, 500000, 950000, 1000000].map(water_ppm => {
  const r = run(standard, { lots: [charge(), fuel({ quality: { water_ppm } })] });
  return { water_ppm, status: r.last.status, massErrorMg: massError(r), usedJ: r.energy.usedJ };
});
const warm = step(req(0, M));
const cooling = step(req(2 * H, 2 * H + 10 * M, hot.state, [[2 * H, 'put_out']]));
verification.storedHeat = { warming: warm.energy, cooling: cooling.energy, end: normal.energy.storedJ };
verification.history = ['charge', 'fuel'].map(which => {
  const r = run(standard, { lots: [charge(which === 'charge' ? { quality: { water_ppm: 150000, history_complete: 0 } } : {}), fuel(which === 'fuel' ? { quality: { water_ppm: 150000, history_complete: 0 } } : {})] });
  return { incomplete: which, generated: r.last.produced.filter(p => p.into === 'eq:retort').map(p => [p.materialId, p.quality.history_complete]) };
});
const paused = step(req(0, H, null, [], { stop: 'world-pause' }));
const resumed = step(req(H, 2 * H, JSON.parse(JSON.stringify(paused.state))));
verification.pauseResume = { pausedStatus: paused.status, equalStateAt2h: hash(resumed.state) === hash(hot.state) };
const lateHeat = run([[200 * M, 'fire_level', 2], [400 * M, 'put_out'], [600 * M, 'open']]);
verification.secondaryHeatingLimit = { originalPeakC: normal.last.diagnostics.maxC, hotterPeakC: lateHeat.last.diagnostics.maxC,
  originalCharcoalMg: coalMg(normal), hotterCharcoalMg: coalMg(lateHeat), originalProducts: products(normal).slice(0, 3), hotterProducts: products(lateHeat).slice(0, 3) };
verification.noNumericalObservations = normal.observations.every(o => o.value === undefined);
verification.charCombustion = [1, 2, 7, 17, 346604, 1000000].map(mg => {
  const r = react('char', mg, REACTIONS.charCombustion.coeffs, REACTIONS.charCombustion.closeInto);
  const before = elementMoles(r.consumed), after = elementMoles(r.produced);
  return { charMg: mg, consumed: r.consumed, produced: r.produced,
    massErrorMg: Object.values(r.consumed).reduce((a, b) => a + b, 0) - Object.values(r.produced).reduce((a, b) => a + b, 0),
    elementMassDeltaMg: Object.fromEntries(['C', 'H', 'O'].map(k => [k, (after[k] - before[k]) * ATOMIC_MASS[k] * 1000])) };
});
console.log(JSON.stringify({ target: root, process: PROC, calls, violationCount, violations, findings, verification }, null, 2));
