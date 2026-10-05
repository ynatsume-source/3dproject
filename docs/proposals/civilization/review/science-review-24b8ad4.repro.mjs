// Read-only light review of 24b8ad4: A1/A2/B1 fixes, /2 persistence and the new latik-return path.
// node --import tsx <this-file> /absolute/science-checkout
// Exit 0 means the diagnostic completed, NOT that the outstanding findings passed.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
assert(root?.startsWith('/'), 'Pass an absolute science checkout path');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { COCONUT_BOIL_PROCESS: B, COCONUT_MILK_PROCESS: M } = await get('src/science/step/coconut.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const H = 3600000, MIN = 60000;
const sum = xs => xs.reduce((s, x) => s + x.amount.value, 0);
const lot = (p, id) => ({ ...p, lotId: id, location: p.into ?? 'shelf' });
const base = { contract: '0.2.0', requestId: 'review', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
  runId: 'r', catalogVersion: 'civ-sci-test-2', state: null, seed: 1, actions: [],
  environment: { source: 'record', sampleId: 'weather', effectiveAt: 0, airTempC: 28, humidity: 0.75, windMs: 2 } };
const nut = n => ({ lotId: 'nuts', materialId: 'coconut', location: 'shelf', amount: { value: 1300000 * n, unit: 'mg' }, quality: { count: n } });
const water = mg => ({ lotId: 'water', materialId: 'process_water', location: 'jar', amount: { value: mg, unit: 'mg' } });
function milkRequest(n = 4, mg = 1560000) {
  return { ...base, ...M, interval: { from: 0, to: 24 * H }, lots: [nut(n), ...(mg ? [water(mg)] : [])],
    equipment: [{ equipmentId: 'tools', kind: 'fixture_coconut_tools', condition: 1 }],
    energy: [{ sourceId: 'hands', kind: 'mechanical', maxJ: 24 * 3600 * 30 }] };
}
let calls = 0;
const violations = new Set();
function step(q) {
  const r = scienceStep(q); calls++;
  for (const v of validateResult(q, r)) violations.add(`${q.processId}: ${v}`);
  return r;
}
const milkResult = step(milkRequest());
assert.equal(milkResult.status, 'completed');
assert.equal(sum(milkResult.consumed), sum(milkResult.produced));
const milk = milkResult.produced.find(p => p.materialId === 'coconut_milk');
const wood = { lotId: 'wood', materialId: 'firewood', location: 'shelf', amount: { value: 12000000, unit: 'mg' }, quality: { water_ppm: 150000 } };
const equipment = [
  { equipmentId: 'pot', kind: 'fixture_cook_pot', condition: 1, params: { heatCapJPerK: 1800, uaWPerK: 3, heatShare: 0.2, capacityMl: 5000 } },
  { equipmentId: 'hearth', kind: 'open_fire_pit', condition: 1, params: { maxBurnKgPerH: 3 } },
];
function request(from, to, state = null, acts = [], options = {}) {
  return { ...base, ...B, interval: { from, to }, state, lots: [lot(milk, 'milk'), wood], equipment, energy: [],
    actions: acts.map(([at, action, level]) => ({ at, action, residentId: 'dot', ...(level === undefined ? {} : { params: { level } }) })), ...options };
}
function boil(end, chunk = H, controls = [], options = {}, persist = false, origin = 0) {
  let state = null, r, usedJ = 0; const observations = [], energy = { used: 0, stored: 0, lost: 0 };
  const actions = [...controls, [origin + end, 'take_off']].sort((a, b) => a[0] - b[0]);
  let ai = 0;
  for (let t = origin; t <= origin + end; t += chunk) {
    const to = Math.min(origin + end + 1, t + chunk), acts = [];
    while (ai < actions.length && actions[ai][0] < to) { if (actions[ai][0] >= t) acts.push(actions[ai]); ai++; }
    r = step(request(t, to, state, acts, options));
    state = persist ? JSON.parse(JSON.stringify(r.state)) : r.state;
    usedJ += r.energy.reduce((s, e) => s + e.usedJ, 0); observations.push(...r.observations);
    for (const e of r.energy) { energy.used += e.usedJ; energy.stored += e.storedJ ?? 0; energy.lost += e.lostJ; }
    if (r.status !== 'running') break;
  }
  return { r, usedJ, observations, energy };
}
const oilMg = run => run.r.produced.find(p => p.materialId === 'coconut_oil')?.amount.value ?? 0;
const brief = run => ({ status: run.r.status, oilMg: oilMg(run), usedJ: run.usedJ,
  temperatureC: run.r.diagnostics?.tC, brown: run.r.diagnostics?.brown, scorch: run.r.diagnostics?.scorch,
  products: run.r.produced.map(p => ({ materialId: p.materialId, mg: p.amount.value })),
  drawnMg: sum(run.r.drawn ?? []), releasedMg: sum(run.r.released) });

const duration = 195 * MIN, reference = boil(duration, H, [], {}, true);
const partitions = [30000, 10 * MIN, H, 37001, 7300, 1000, 200, 50].map(chunk => {
  const run = chunk === H ? reference : boil(duration, chunk);
  assert.equal(run.r.status, 'completed');
  assert.equal(run.energy.stored, 0); assert.equal(run.energy.used, run.energy.lost);
  if (chunk >= 1000) assert(Math.abs(oilMg(run) - oilMg(reference)) <= 1);
  if ([30000, 10 * MIN, H, 1000].includes(chunk)) assert.deepEqual(run.r.state, reference.r.state);
  return { chunkMs: chunk, oilMg: oilMg(run), temperatureC: run.r.diagnostics.tC, energy: run.energy };
});
const observationsOnly = [];
for (const offset of [17, 17000]) {
  const looks = []; for (let at = offset; at < duration; at += MIN) looks.push([at, 'look']);
  const run = boil(duration, H, looks);
  assert.deepEqual(run.r.state, reference.r.state); assert.deepEqual(run.r.produced, reference.r.produced);
  assert.deepEqual(run.r.released, reference.r.released); assert.deepEqual(run.energy, reference.energy);
  observationsOnly.push({ offsetMs: offset, everyMs: MIN, samePhysics: true, oilMg: oilMg(run) });
}
const shifted = [30000, H, 37001].map(chunk => boil(duration, chunk, [], {}, true, 1007));
assert.deepEqual(shifted[0].r.state, shifted[1].r.state);
assert.deepEqual(shifted[0].r.produced, shifted[1].r.produced);
assert(Math.abs(oilMg(shifted[2]) - oilMg(shifted[0])) <= 1);

// The clock epoch and reported energy survive a real JSON round trip between requests.
const warmQ = request(1007, 61007), before = JSON.stringify(warmQ), warm = step(warmQ);
assert.equal(JSON.stringify(warmQ), before);
assert.equal(warm.state.schema, 'civ-sci.coconut-boil/2');
assert.equal(sum(warm.consumed), 0);
const saved = JSON.parse(JSON.stringify(warm.state));
const resumeQ = request(61007, 121007, saved);
assert.deepEqual(step(resumeQ), step(request(61007, 121007, warm.state)));
const refused = step(request(61007, 121007, { ...saved, schema: 'civ-sci.coconut-boil/1' }));
assert.equal(refused.status, 'failed'); assert.match(refused.evidence.notes, /unsupported-state-schema/);
assert.equal(sum(refused.consumed) + sum(refused.produced) + sum(refused.released) + sum(refused.drawn ?? []), 0);
assert.deepEqual(refused.energy, []);

const d = warm.state.data;
const capacity = x => x.pot.heatCapJPerK + (4.18 * x.waterMg + 2 * x.food0.coconut_fat + 1.5 * x.food0.plant_solids) / 1000;
const sensible = capacity(d) * (d.tC - d.refC);
assert.equal(warm.energy[0].storedJ, Math.round(sensible));
const shortWood = { ...wood, amount: { value: 400000, unit: 'mg' } }, shortLots = [lot(milk, 'milk'), shortWood];
const hot = step(request(0, H, null, [], { lots: shortLots }));
const cool = step(request(H, H + 10 * MIN, JSON.parse(JSON.stringify(hot.state)), [], { lots: shortLots }));
const coolingChange = capacity(hot.state.data) * (cool.state.data.tC - hot.state.data.tC);
assert(cool.energy[0].storedJ < 0); assert.equal(cool.energy[0].usedJ, 0);
assert.equal(cool.energy[0].lostJ, -cool.energy[0].storedJ);
assert(Math.abs(cool.energy[0].storedJ - coolingChange) <= 1);
const closures = [];
for (const options of [{ stop: 'operator' }, { stop: 'equipment-lost', equipment: [] },
  { environment: { source: 'unknown', sampleId: 'missing', effectiveAt: 61007 } }]) {
  const r = step(request(61007, 121007, saved, [], options));
  assert.equal(r.status, 'stopped'); assert.equal(r.state.data.reportedStored, 0);
  assert.equal(warm.energy[0].storedJ + r.energy.reduce((s, e) => s + (e.storedJ ?? 0), 0), 0);
  assert.equal(sum(r.consumed) + sum(r.drawn ?? []), sum(r.produced) + sum(r.released));
  closures.push({ trigger: options.stop ?? 'unknown-weather', to: r.simulated.to, storedAtEnd: r.state.data.reportedStored });
}
const paused = step(request(61007, 121007, saved, [], { stop: 'world-pause' }));
assert.equal(paused.status, 'running'); assert.equal(sum(paused.consumed), 0);
assert.deepEqual(paused.state, step(resumeQ).state);

// B1: actual outputs, including remaining fuel, are the inputs to the next run.
function reuse(run, id) {
  const p = run.r.produced.find(p => ['coconut_milk', 'coconut_latik'].includes(p.materialId));
  const f = run.r.produced.find(p => p.materialId === 'firewood');
  assert(p && f);
  return [lot(p, `back-food:${id}`), lot(f, `back-wood:${id}`)];
}
const early = boil(189 * MIN), firstReturn = reuse(early, 1);
assert.equal(firstReturn[0].materialId, 'coconut_milk'); assert.equal(oilMg(early), 0);
const finished = boil(H, H, [[0, 'fire_level', 0]], { lots: firstReturn }, true);
assert.equal(finished.r.status, 'completed'); assert(oilMg(finished) > 0);
const half = reference, more = boil(40 * MIN, H, [[0, 'fire_level', 0]], { lots: reuse(half, 2) }, true);
assert.equal(more.r.status, 'completed'); assert(oilMg(more) > 0);
const originalFat = Math.floor(milk.amount.value * milk.quality.x_coconut_fat_ppm / 1e6);
assert(oilMg(half) + oilMg(more) <= originalFat * 0.9 + 1);
for (const run of [early, finished, half, more]) {
  assert.equal(sum(run.r.consumed) + sum(run.r.drawn ?? []), sum(run.r.produced) + sum(run.r.released));
  assert.equal(run.energy.stored, 0);
}

// A3: the added latik path carries brown/scorch, but the no-new-oil message must also carry that history.
const dark = boil(205 * MIN), darkLots = reuse(dark, 3);
assert.equal(darkLots[0].materialId, 'coconut_latik');
assert(darkLots[0].quality.brown_ppm === 1000000 && darkLots[0].quality.scorch_ppm > 400000);
const reheated = boil(5 * MIN, H, [[0, 'fire_level', 0]], { lots: darkLots }, true);
const returned = reheated.r.produced.find(p => p.materialId === 'coconut_latik');
assert.equal(reheated.r.status, 'completed'); assert(returned);
assert.equal(oilMg(reheated), 0);
assert.equal(returned.quality.brown_ppm, darkLots[0].quality.brown_ppm);
assert.equal(returned.quality.scorch_ppm, darkLots[0].quality.scorch_ppm);
assert.equal(sum(reheated.r.consumed) + sum(reheated.r.drawn ?? []), sum(reheated.r.produced) + sum(reheated.r.released));
const A3 = { originalFinishMinute: 205, sourceObservation: dark.r.observations,
  inputLatik: darkLots[0], reheatMinutes: 5, fireLevel: 0, temperatureC: reheated.r.diagnostics.tC,
  newOilMg: oilMg(reheated), returnedLatik: returned, observations: reheated.r.observations,
  incorrectlySaysWhite: reheated.r.observations.some(o => /かすはまだ白く/.test(o.text ?? '')) };
assert.deepEqual([...violations], []);
console.log(JSON.stringify({ root, process: B, calls,
  resolved: { A1: { partitions, observationsOnly, origin1007msOil: shifted.map(oilMg) },
    A2: { heatingSensibleJ: sensible, heating: warm.energy, coolingSensibleJ: coolingChange, cooling: cool.energy,
      wholeRun: reference.energy, closures },
    B1: { returnedMilkMg: firstReturn[0].amount.value, resumedMilkOilMg: oilMg(finished),
      firstOilMg: oilMg(half), latikReheatOilMg: oilMg(more), totalOilMg: oilMg(half) + oilMg(more), originalFatMg: originalFat } },
  state: { freshSchema: warm.state.schema, restoredExactly: true, pauseResume: true, oldStatus: refused.status, oldReason: refused.evidence.notes },
  findings: { A3 }, contractViolations: [...violations] }, null, 2));
