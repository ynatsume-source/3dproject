// Read-only full review of eaa2a84, including the food rounding fix in 788c82d.
// node --import tsx <this-file> /absolute/science-checkout
// Exit 0 means the diagnostic completed, NOT that the outstanding findings passed.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
assert(root?.startsWith('/'), 'Pass an absolute science checkout path');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { COCONUT_BOIL_PROCESS: B, COCONUT_MILK_PROCESS: M } = await get('src/science/step/coconut.ts');
const { fuelComp } = await get('src/science/step/wood-fire.ts');
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
function boil(end, chunk = H, controls = [], options = {}, persist = false) {
  let state = null, r, usedJ = 0; const observations = [];
  const actions = [...controls, [end, 'take_off']].sort((a, b) => a[0] - b[0]);
  let ai = 0;
  for (let t = 0; t <= end; t += chunk) {
    const to = Math.min(end + 1, t + chunk), acts = [];
    while (ai < actions.length && actions[ai][0] < to) { if (actions[ai][0] >= t) acts.push(actions[ai]); ai++; }
    r = step(request(t, to, state, acts, options));
    state = persist ? JSON.parse(JSON.stringify(r.state)) : r.state;
    usedJ += r.energy.reduce((s, e) => s + e.usedJ, 0); observations.push(...r.observations);
    if (r.status !== 'running') break;
  }
  return { r, usedJ, observations };
}
const oilMg = run => run.r.produced.find(p => p.materialId === 'coconut_oil')?.amount.value ?? 0;
const brief = run => ({ status: run.r.status, oilMg: oilMg(run), usedJ: run.usedJ,
  temperatureC: run.r.diagnostics?.tC, brown: run.r.diagnostics?.brown, scorch: run.r.diagnostics?.scorch,
  products: run.r.produced.map(p => ({ materialId: p.materialId, mg: p.amount.value })),
  drawnMg: sum(run.r.drawn ?? []), releasedMg: sum(run.r.released) });

// Actual generated lots go into a fresh boil, not only into a copied composition formula.
const freshFailures = [];
for (let n = 1; n <= 8; n++) for (const added of [0, n * 390000, n * 100000, 123456]) {
  const p = step(milkRequest(n, added)).produced.find(p => p.materialId === 'coconut_milk');
  const r = step(request(0, MIN, null, [], { lots: [lot(p, 'back'), wood] }));
  if (r.status === 'failed') freshFailures.push({ n, added, quality: p.quality, reason: r.evidence.notes });
}
const returnedFailures = [];
for (let minute = 1; minute < 189; minute++) {
  const p = boil(minute * MIN).r.produced.find(p => p.materialId === 'coconut_milk');
  if (!p) continue;
  const r = step(request(0, MIN, null, [], { lots: [lot(p, 'back'), wood] }));
  if (r.status === 'failed') returnedFailures.push({ minute, quality: p.quality, reason: r.evidence.notes });
}

// A1: fixed weather, fire controls and finish time; only request boundaries vary.
const duration = 195 * MIN, reference = boil(duration, 30000);
const aligned = [10 * MIN, H].map(chunk => {
  const r = boil(duration, chunk, [], {}, true);
  assert.deepEqual(r.r.produced, reference.r.produced); assert.deepEqual(r.r.state, reference.r.state);
  assert.deepEqual(r.r.released, reference.r.released); assert.deepEqual(r.r.drawn, reference.r.drawn);
  assert.equal(r.usedJ, reference.usedJ);
  return { chunkMs: chunk, exact: true };
});
const partitioning = [30000, 37001, 7300, 1000, 200, 50].map(chunk => {
  const r = chunk === 30000 ? reference : boil(duration, chunk);
  return { chunkMs: chunk, ...brief(r) };
});
const looks = [];
for (let at = 17000; at < duration; at += MIN) looks.push([at, 'look']);
const watched = boil(duration, H, looks);
const A1 = { aligned, partitioning, observationOnly: { everyMs: MIN, offsetMs: 17000,
  unwatched: brief(reference), watched: brief(watched), oilDifferencePercent: 100 * (oilMg(watched) - oilMg(reference)) / oilMg(reference) } };

// A2: before boiling/evaporation, positive sensible storage is unambiguous.
const warm = step(request(0, MIN)), d = warm.state.data;
const capacity = x => x.pot.heatCapJPerK + 4.18 * x.waterMg / 1000 + 2 * x.milk0.coconut_fat / 1000 + 1.5 * x.milk0.plant_solids / 1000;
const shortWood = { ...wood, amount: { value: 400000, unit: 'mg' } }, shortLots = [lot(milk, 'milk'), shortWood];
const hot = step(request(0, H, null, [], { lots: shortLots }));
const cool = step(request(H, H + 10 * MIN, hot.state, [], { lots: shortLots }));
const A2 = { heating: { atMs: MIN, temperatureC: d.tC, evaporatedMg: d.evaporatedMg,
  sensibleIncreaseJ: capacity(d) * (d.tC - 28), reportedEnergy: warm.energy },
  cooling: { beforeC: hot.state.data.tC, afterC: cool.state.data.tC,
    sensibleChangeJ: capacity(hot.state.data) * (cool.state.data.tC - hot.state.data.tC), reportedEnergy: cool.energy } };

// B1: taking an unfinished mixture off the fire must leave a supported route to finish it.
const premature = boil(189 * MIN), latik = premature.r.produced.find(p => p.materialId === 'coconut_latik');
const retry = latik ? step(request(0, H, null, [], { lots: [lot(latik, 'unfinished'), wood] })) : null;
const continued = boil(200 * MIN);
const B1 = { atMinute: 189, result: brief(premature), waterRatio: premature.r.diagnostics.waterRatio,
  observations: premature.r.observations, retry: retry ? { status: retry.status, reason: retry.evidence.notes } : null,
  uninterrupted200Minutes: brief(continued) };

// Mass/O2 and integer-J audit. Different duration, moisture and return composition, not only fresh dry wood.
const balances = [];
for (const waterPpm of [0, 150000, 500000, 900000, 1000000]) for (const end of [1, MIN, duration]) {
  const f = { ...wood, quality: { water_ppm: waterPpm } }, run = boil(end, H, [], { lots: [lot(milk, 'milk'), f] });
  assert.equal(run.r.status, 'completed');
  const returned = run.r.produced.find(p => p.materialId === 'firewood');
  const initial = fuelComp(f), remaining = returned ? fuelComp(lot(returned, 'returned-wood')) : {};
  assert.notEqual(typeof initial, 'string'); assert.notEqual(typeof remaining, 'string');
  const dryWoodMg = (initial.wood_dry ?? 0) - (remaining.wood_dry ?? 0);
  const differenceMg = sum(run.r.consumed) + sum(run.r.drawn ?? []) - sum(run.r.produced) - sum(run.r.released);
  assert.equal(differenceMg, 0); assert(Number.isInteger(run.usedJ)); assert(run.usedJ <= dryWoodMg * 18);
  balances.push({ waterPpm, endMs: end, differenceMg, usedJ: run.usedJ, dryWoodMg });
}

// C1: the host should signal equipment loss; detect a malformed continuation without that signal.
const first = step(request(0, H));
const normal = step(request(H, 2 * H, first.state));
const missing = step(request(H, 2 * H, first.state, [], { equipment: [] }));
const changed = step(request(H, 2 * H, first.state, [], { equipment: [
  { ...equipment[0], equipmentId: 'other-pot', params: { ...equipment[0].params, heatShare: 0 } }, equipment[1],
] }));
const C1 = { absentWithoutStop: missing.status, changedWithoutStop: changed.status,
  changedGivesSameState: JSON.stringify(changed.state) === JSON.stringify(normal.state) };
assert.deepEqual([...violations], []);
console.log(JSON.stringify({ root, processes: [M, B], calls, milk: { ...milk, completionMs: milkResult.simulated.to },
  foodRounding: { freshCases: 32, freshFailures, returnedCases: 188, returnedFailures },
  findings: { A1, A2, B1, C1 }, balances, contractViolations: [...violations] }, null, 2));
