// Targeted follow-up to 5555989. Read-only; pass current and optionally old science checkouts.
// node --import tsx THIS_FILE /absolute/current-science-checkout /absolute/5555989-checkout
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? process.cwd());
const load = (p, dir = root) => import(pathToFileURL(`${dir}/${p}`));
const { scienceStep } = await load('src/science/step/index.ts');
const { CHARCOAL_PROCESS: charcoal } = await load('src/science/step/charcoal.ts');
const { CALCINE_PROCESS: calcine, HYDRATE_PROCESS: hydrate } = await load('src/science/step/lime.ts');
const { lotComp, compQuality } = await load('src/science/step/common.ts');
const { react, REACTIONS, addComp, elementMoles, molarMass } = await load('src/science/chem.ts');
const { validateResult } = await load('src/science/step/validate.ts');
const H = 3600000, M = 60000;
const violations = [];
const step = q => { const r = scienceStep(q); violations.push(...validateResult(q, r)); return r; };
const sum = xs => (xs ?? []).reduce((s, x) => s + x.amount.value, 0);
const asLot = (p, id) => ({ lotId: id, materialId: p.materialId, amount: p.amount, location: p.into, quality: p.quality });
const equipment = [
  { equipmentId: 'eq:r', kind: 'fixture_tar_retort', condition: 1, params: { heatCapJPerK: 4000, uaWPerK: 2.5, heatShare: .35, capacityMl: 8000, collectShare: .6 } },
  { equipmentId: 'eq:h', kind: 'open_fire_pit', condition: 1, params: { maxBurnKgPerH: 3 } },
];
const charge = { lotId: 'lot:c', materialId: 'firewood', amount: { value: 2000000, unit: 'mg' }, location: 'eq:r', quality: { water_ppm: 150000 } };
const fuel = { lotId: 'lot:f', materialId: 'firewood', amount: { value: 12000000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 150000 } };
const req = (from, to, state = null, actions = [], overrides = {}) => ({
  contract: '0.2.0', requestId: `req:${from}`, runId: 'run:followup', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
  ...charcoal, catalogVersion: 'civ-sci-test-2', seed: 1, interval: { from, to }, state,
  environment: { source: 'record', sampleId: `env:${from}`, effectiveAt: from, airTempC: 28, humidity: .75, windMs: 2 },
  lots: [charge, fuel], equipment, energy: [], actions, ...overrides,
});
const act = (at, action, level) => ({ at, action, residentId: 'res:lantern', ...(level === undefined ? {} : { params: { level } }) });
const standard = [act(200 * M, 'put_out'), act(360 * M, 'open')];
function retort(lots = [charge, fuel], actions = standard, call = step, process = charcoal) {
  let state = null, last;
  const energy = { usedJ: 0, lostJ: 0, storedJ: 0 };
  for (let t = 0; t <= 6 * H; t += H) {
    last = call(req(t, t + H, state, actions.filter(a => a.at >= t && a.at < t + H), { ...process, lots }));
    state = JSON.parse(JSON.stringify(last.state));
    for (const e of last.energy) for (const key of Object.keys(energy)) energy[key] += e[key] ?? 0;
    if (last.status !== 'running') break;
  }
  return { last, energy };
}
const result = { target: root, processes: { charcoal, calcine, hydrate } };
const normal = retort();
const low = retort([charge, fuel], [act(0, 'fire_level', 0), act(250 * M, 'put_out'), act(360 * M, 'open')]);
const chains = [];
let previous = low;
for (let i = 0; i < 3; i++) {
  const coal = previous.last.produced.find(p => p.materialId === 'charcoal');
  const wood = previous.last.produced.find(p => p.materialId === 'firewood' && p.into === 'shelf');
  if (!coal || !wood) { chains.push({ error: 'preceding run did not return expected lots' }); break; }
  const r = retort([asLot(coal, `lot:coal-${i}`), asLot(wood, `lot:wood-${i}`)]);
  const next = r.last.produced.find(p => p.materialId === 'charcoal');
  chains.push({ status: r.last.status, massErrorMg: sum(r.last.consumed) + sum(r.last.drawn) - sum(r.last.produced) - sum(r.last.released),
    input: coal, output: next, energy: r.energy });
  previous = r;
}
result.returnedCharcoalChain = chains;
const first = step(req(0, H));
const freshState = first.state;
const hot = step(req(H, 2 * H, first.state));
const gap = step(req(2 * H, 3 * H, hot.state, [], { environment: { source: 'unknown', sampleId: 'env:gap', effectiveAt: 2 * H } }));
result.unknown = { status: gap.status, products: gap.produced, energy: gap.energy, observations: gap.observations };
const sortedEquipment = equipment.map(e => ({ ...e, params: Object.fromEntries(Object.entries(e.params).sort(([a], [b]) => a.localeCompare(b))) }));
const orderOnly = step(req(H, 2 * H, freshState, [], { equipment: sortedEquipment }));
result.C3_parameterKeyOrder = { changedValues: false, status: orderOnly.status, diagnostics: orderOnly.diagnostics };
if (process.argv[3]) {
  const oldRoot = resolve(process.argv[3]);
  const { scienceStep: oldStep } = await load('src/science/step/index.ts', oldRoot);
  const { CHARCOAL_PROCESS: oldProcess } = await load('src/science/step/charcoal.ts', oldRoot);
  const oldState = oldStep(req(0, H, null, [], oldProcess)).state;
  const restore = step(req(H, 2 * H, oldState));
  const oldNormal = retort([charge, fuel], standard, oldStep, oldProcess);
  const signature = r => JSON.stringify([r.last.produced, r.last.released, r.last.drawn, r.energy]);
  result.compatibility = { oldSchema: oldState.schema, newSchema: freshState.schema, restoreStatus: restore.status,
    restoreDiagnostics: restore.diagnostics, restoreConsumed: restore.consumed, standardSettlementAndEnergyUnchanged: signature(normal) === signature(oldNormal) };
}
// Reproduce the existing 100 g feed -> quicklime -> hydration fixture through the public step.
const feed = { lotId: 'lot:feed', materialId: 'calcium_carbonate_feed', amount: { value: 100000, unit: 'mg' }, location: 'site:calciner', quality: { x_calcite_ppm: 950000 } };
const calciner = { equipmentId: 'eq:calciner', kind: 'fixture_calciner', condition: 1, params: { setpointC: 900, holdS: 7200, heatCapJPerK: 15000, uaWPerK: 2, maxPowerW: 4000 } };
const env = { source: 'simulation', sampleId: 'env:fixture', effectiveAt: 0, airTempC: 25, humidity: .7 };
const burned = step(req(0, 24 * H, null, [], { ...calcine, lots: [feed], equipment: [calciner], environment: env, energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: 4000 * 24 * 3600 }] }));
const quick = asLot(burned.produced[0], 'lot:quick');
const water = { lotId: 'lot:water', materialId: 'process_water', amount: { value: 60000, unit: 'mg' }, location: 'site:tub' };
const tub = { equipmentId: 'eq:tub', kind: 'fixture_slaking_tub', condition: 1, params: { heatCapJPerK: 400, uaWPerK: 1.5 } };
const hydrated = step(req(0, 12 * H, null, [], { ...hydrate, lots: [quick, water], equipment: [tub], environment: env }));
const before = addComp(lotComp(quick), { water: 60000 });
const vapour = hydrated.released.find(r => r.materialId === 'water_vapour')?.amount.value ?? 0;
// This fixture fully converts its quicklime. Independently reconstruct integer stoichiometric settlement.
const reaction = react('lime', before.lime, REACTIONS.hydration.coeffs, 'portlandite');
const rawWithVapour = addComp(addComp(before, reaction.consumed, -1), reaction.produced);
const rawLiquid = addComp(rawWithVapour, { water: vapour }, -1);
const decoded = lotComp(asLot(hydrated.produced[0], 'lot:hydrated'));
const decodedWithVapour = addComp(decoded, { water: vapour });
const elements = ['H', 'O', 'Ca'];
const delta = (a, b) => Object.fromEntries(elements.map(k => [k, (elementMoles(b)[k] - elementMoles(a)[k]) * 1000]));
const mw = molarMass('water'), mp = molarMass('portlandite');
const waterAtoms = { H: 2, O: 1, Ca: 0 }, portAtoms = { H: 2, O: 2, Ca: 1 };
const amount = hydrated.produced[0].amount.value;
// Integer-mg compositions lose at most ceil(T / 1e6) mg per species in one write/read round trip
// (real arithmetic; retain a small FP guard for tests). This is not a global fixed-mmol tolerance.
const lossMg = Math.ceil(amount / 1e6);
const bound = Object.fromEntries(elements.map(k => [k, lossMg * (waterAtoms[k] / mw + portAtoms[k] / mp)
  + .5 * Math.abs(portAtoms[k] / mp - waterAtoms[k] / mw)]));
result.lime = { calcineStatus: burned.status, hydrateStatus: hydrated.status, quick, before, vapourMg: vapour,
  rawLiquid, decoded, outputMg: amount, reactionDeltaMmol: delta(before, rawWithVapour),
  codecDeltaMmol: delta(rawWithVapour, decodedWithVapour), totalDeltaMmol: delta(before, decodedWithVapour), perElementBoundMmol: bound,
  massErrorMg: sum(hydrated.consumed) - sum(hydrated.produced) - sum(hydrated.released),
  sameLotRepeatedReadUnchanged: JSON.stringify(lotComp(quick)) === JSON.stringify(lotComp(quick)),
  codecExamples: [114858, 1500001, 10000000].map(total => {
    const original = { water: Math.floor(total / 3) + 1, portlandite: total - Math.floor(total / 3) - 1 };
    const decoded = lotComp({ lotId: 'lot:codec', materialId: 'hydrated_lime', amount: { value: total, unit: 'mg' }, quality: compQuality(original), location: 'site:codec' });
    return { totalMg: total, original, decoded, maxLossPerSpeciesMg: Math.ceil(total / 1e6) };
  }) };
console.log(JSON.stringify({ ...result, violations }, null, 2));
