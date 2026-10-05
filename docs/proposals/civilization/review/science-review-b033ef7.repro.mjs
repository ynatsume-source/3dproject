// Light confirmation of A3: actual four-stage returns, physical equivalence and /2 cross-version resume.
// node --import tsx <this-file> /absolute/b033ef7-checkout /absolute/24b8ad4-checkout
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const [root, previousRoot] = process.argv.slice(2);
assert(root?.startsWith('/') && previousRoot?.startsWith('/'), 'Pass target and previous absolute checkout paths');
async function load(path) {
  const { scienceStep } = await import(pathToFileURL(`${path}/src/science/step/index.ts`));
  const { COCONUT_BOIL_PROCESS: boil, COCONUT_MILK_PROCESS: milk } = await import(pathToFileURL(`${path}/src/science/step/coconut.ts`));
  const { validateResult } = await import(pathToFileURL(`${path}/src/science/step/validate.ts`));
  return { scienceStep, boil, milk, validateResult };
}
const current = await load(root), previous = await load(previousRoot);
const MIN = 60000;
const base = { contract: '0.2.0', requestId: 'review', runId: 'r',
  world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, catalogVersion: 'civ-sci-test-2', state: null, seed: 1, actions: [],
  environment: { source: 'record', sampleId: 'weather', effectiveAt: 0, airTempC: 28, humidity: 0.75, windMs: 2 } };
const lot = (p, id) => ({ ...p, lotId: id, location: p.into ?? 'shelf' });
const wood = { lotId: 'wood', materialId: 'firewood', location: 'shelf', amount: { value: 12000000, unit: 'mg' }, quality: { water_ppm: 150000 } };
const equipment = [
  { equipmentId: 'pot', kind: 'fixture_cook_pot', condition: 1, params: { heatCapJPerK: 1800, uaWPerK: 3, heatShare: 0.2, capacityMl: 5000 } },
  { equipmentId: 'hearth', kind: 'open_fire_pit', condition: 1, params: { maxBurnKgPerH: 3 } },
];
let calls = 0;
function step(mod, q) {
  const before = JSON.stringify(q), r = mod.scienceStep(q); calls++;
  assert.equal(JSON.stringify(q), before); assert.deepEqual(mod.validateResult(q, r), []);
  assert.deepEqual(JSON.parse(JSON.stringify(r.state)), r.state);
  return r;
}
const milkRun = step(current, { ...base, ...current.milk, interval: { from: 0, to: 7200000 },
  lots: [{ lotId: 'nuts', materialId: 'coconut', location: 'shelf', amount: { value: 5200000, unit: 'mg' }, quality: { count: 4 } },
    { lotId: 'water', materialId: 'process_water', location: 'jar', amount: { value: 1560000, unit: 'mg' } }],
  equipment: [{ equipmentId: 'tools', kind: 'fixture_coconut_tools', condition: 1 }], energy: [{ sourceId: 'hands', kind: 'mechanical', maxJ: 216000 }] });
const milk = lot(milkRun.produced.find(p => p.materialId === 'coconut_milk'), 'milk');
function request(mod, from, to, state = null, lots = [milk, wood], actions = []) {
  return { ...base, ...mod.boil, interval: { from, to }, state, lots, equipment, energy: [],
    actions: actions.map(([at, action, level]) => ({ at, action, residentId: 'dot', ...(level === undefined ? {} : { params: { level } }) })) };
}
function finish(mod, minutes, lots = [milk, wood], level = 1) {
  return step(mod, request(mod, 0, minutes * MIN + 1, null, lots, [[0, 'fire_level', level], [minutes * MIN, 'take_off']]));
}
function physical(r) {
  const { observations, evidence, ...rest } = r;
  return rest; // Status, simulated interval, state, flows, energy, wear and diagnostics remain compared.
}
const output = r => r.produced.find(p => ['coconut_milk', 'coconut_latik'].includes(p.materialId));
const oil = r => r.produced.find(p => p.materialId === 'coconut_oil')?.amount.value ?? 0;
const cases = [];
// No fabricated colour qualities: the first run actually produces every input to the reheating run.
for (const [minutes, colour, words] of [[189, 'white', /まだ白く/], [195, 'browning', /色づき始め/],
  [200, 'brown', /かすは茶色く/], [205, 'burnt', /黒く焦げていて/]]) {
  const initial = finish(current, minutes), oldInitial = finish(previous, minutes);
  assert.deepEqual(physical(initial), physical(oldInitial));
  const food = output(initial), fuel = initial.produced.find(p => p.materialId === 'firewood');
  const lots = [lot(food, 'returned-food'), lot(fuel, 'returned-wood')];
  const r = finish(current, 5, lots, 0), old = finish(previous, 5, lots, 0);
  assert.equal(r.status, 'completed'); assert.equal(oil(r), 0);
  assert.deepEqual(physical(r), physical(old));
  const back = output(r), said = r.observations.at(-1).text;
  for (const k of ['brown_ppm', 'scorch_ppm']) assert.equal(back.quality[k] ?? 0, food.quality[k] ?? 0);
  assert.match(said, words);
  if (colour !== 'white') assert(!/まだ白く/.test(said));
  cases.push({ initialMinutes: minutes, material: food.materialId, colour, inputQuality: food.quality,
    returnedQuality: back.quality, newOilMg: oil(r), beforeWords: old.observations.at(-1).text, afterWords: said, samePhysics: true });
}
// /2 is intentionally unchanged: resume an actual old-version state under the new process version.
const oldPartial = step(previous, request(previous, 0, 60 * MIN));
assert.equal(oldPartial.state.schema, 'civ-sci.coconut-boil/2');
assert.deepEqual(oldPartial.consumed, []);
const saved = JSON.parse(JSON.stringify(oldPartial.state));
const actions = [[195 * MIN, 'take_off']];
const resumed = step(current, request(current, 60 * MIN, 195 * MIN + 1, saved, [milk, wood], actions));
const oldResumed = step(previous, request(previous, 60 * MIN, 195 * MIN + 1, saved, [milk, wood], actions));
assert.deepEqual(physical(resumed), physical(oldResumed));
assert.equal(resumed.status, 'completed');
console.log(JSON.stringify({ root, previousRoot, process: current.boil, calls, cases,
  crossVersionResume: { schema: resumed.state.schema, status: resumed.status, oilMg: oil(resumed), samePhysics: true },
  verdict: 'A3 resolved; no additional A/B in the changed paths' }, null, 2));
