// Read-only full review. Run with node --import tsx <this file> /absolute/science-checkout.
// Exit 0 means diagnostics completed, not that integration is approved. No science files are modified.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const root = process.argv[2];
assert(root?.startsWith('/'), 'Pass an absolute science checkout path');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { SLAKE_PROCESS, readRawClay } = await get('src/science/step/slake.ts');
const { KNEAD_PROCESS } = await get('src/science/step/knead.ts');
const { DRYING_PROCESS } = await get('src/science/step/drying.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const { pv } = await get('src/science/params.ts');
const { pSat } = await get('src/science/physics.ts');
const H = 3600000, D = 24 * H;
const raw = (quality = {}) => ({ lotId: 'lot:raw', materialId: 'raw_clay', amount: { value: 10000000, unit: 'mg' }, location: 'shelf',
  quality: { water_ppm: 200000, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 350000, xd_organic_c_ppm: 10000,
    xc_quartz_ppm: 150000, xc_inert_mineral_ppm: 50000, xc_organic_c_ppm: 5000, ...quality } });
const water = (mg = 15000000) => ({ lotId: 'lot:water', materialId: 'process_water', amount: { value: mg, unit: 'mg' }, location: 'jar' });
const lot = (p, id) => ({ ...p, lotId: id, location: p.into ?? 'shelf' });
const tubEquipment = { equipmentId: 'tub', kind: 'fixture_clay_tub', catalogEntry: 'fixture_clay_tub',
  catalogVersion: 'civ-sci-test-2', condition: 1, params: { surfaceCm2: 1500, capacityMl: 40000, sunExposure: 0 } };
function request(from, to, state = null, acts = [], options = {}) {
  return { contract: '0.2.0', requestId: `q:${from}`, world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
    runId: 'run:slake', ...SLAKE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
    environment: { source: 'record', sampleId: `e:${from}`, effectiveAt: from, airTempC: 28, humidity: 0.75, windMs: 3 },
    lots: [raw(), water()], equipment: [tubEquipment], energy: [], seed: 1,
    actions: acts.map(([at, action]) => ({ at, action, residentId: 'dot' })), ...options };
}
let calls = 0;
const violations = [];
function step(q) {
  const before = JSON.stringify(q), r = scienceStep(q); calls++;
  assert.equal(JSON.stringify(q), before, 'input/state mutation');
  violations.push(...validateResult(q, r).map(v => `${q.processId}@${q.interval.from}: ${v}`));
  assert.deepEqual(JSON.parse(JSON.stringify(r.state)), r.state);
  return JSON.parse(JSON.stringify(r)); // exercise actual persisted state, including fractional water
}
function tub(until, acts, options = {}, chunk = H, origin = 0) {
  let state = null, last, heatJ = 0; const observations = [];
  for (let from = origin; from < origin + until; from += chunk) {
    const to = Math.min(origin + until, from + chunk);
    last = step(request(from, to, state, acts.filter(([at]) => at >= from && at < to), options));
    state = last.state; heatJ += last.energy.reduce((s, e) => s + e.usedJ, 0); observations.push(...last.observations);
    if (last.status !== 'running') break;
  }
  return { last, heatJ, observations };
}
const plan = [[D, 'sieve'], [2.5 * D, 'decant'], [4 * D, 'decant'], [9.25 * D, 'take_out']];
const sum = xs => xs.reduce((s, x) => s + x.amount.value, 0);
const wr = p => p.quality.water_ppm / (1000000 - p.quality.water_ppm);
const out = (r, id) => r.last.produced.find(p => p.materialId === id);
const brief = r => ({ status: r.status, reason: r.evidence.notes, produced: r.produced, observations: r.observations });
const normal = tub(10 * D, plan);
assert.equal(normal.last.status, 'completed');
assert.equal(sum(normal.last.consumed), sum(normal.last.produced) + sum(normal.last.released));
assert.equal(normal.heatJ, Math.floor(sum(normal.last.released) * 2.43 + 1e-9));
const otherContract = tub(10 * D, plan, { contract: '0.1.0' });
assert.deepEqual(normal.last.produced, otherContract.last.produced);
assert.equal(normal.heatJ, otherContract.heatJ);
const baseline = { consumedMg: sum(normal.last.consumed), produced: normal.last.produced, vapourMg: sum(normal.last.released),
  heatJ: normal.heatJ, waterRatio: wr(out(normal, 'settled_clay')), observations: normal.observations };

// B1: a valid normal-sized carbonate-bearing clay returned before sieving must remain readable.
const carbonate = raw(); carbonate.quality = { water_ppm: 200000, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 400000, xd_calcite_ppm: 150000 };
readRawClay(carbonate);
const returned = tub(H, [[H - 1, 'take_out']], { lots: [carbonate, water()] });
const back = lot(out(returned, 'raw_clay'), 'lot:back');
let readError = null; try { readRawClay(back); } catch (e) { readError = e.message; }
const restart = step(request(0, H, null, [], { lots: [back, water()] }));
const B1 = { input: carbonate, returned: back, readError, restart: brief(restart),
  rereadDryMg: back.amount.value - Math.round(back.amount.value * back.quality.water_ppm / 1e6) };

// B2: immediate sieving sends every lump to the cloth. Decant then empties the tub.
const emptyWhole = step(request(0, H, null, [[0, 'sieve'], [60000, 'decant'], [120000, 'take_out']]));
const emptyFirst = step(request(0, 30000, null, [[0, 'sieve']]));
const emptySecond = step(request(30000, H, emptyFirst.state, [[60000, 'decant'], [120000, 'take_out']]));
const B2 = { whole: brief(emptyWhole), split: brief(emptySecond), solidsAfterSieve: emptyFirst.state.data.tubDry };

// A1: what the resident sees must come from what was actually left on the cloth.
const pure = raw(); pure.quality = { water_ppm: 0, xd_kaolinite_ppm: 1000000 };
const cleanSieve = tub(D + H, [[D, 'sieve'], [D + 30000, 'take_out']], { lots: [pure, water()] });
const A1 = { input: pure, residue: out(cleanSieve, 'clay_sieve_residue') ?? null,
  residueState: cleanSieve.last.state.data.residue, observations: cleanSieve.observations };

function kneadReq(lots, from = 0, to = H, state = null, power = 20, options = {}) {
  return request(from, to, state, [], { ...KNEAD_PROCESS, runId: 'run:knead', lots,
    equipment: [{ equipmentId: 'bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1 }],
    energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: power * (to - from) / 1000 }], ...options });
}
// A2: water recovered from an incomplete run is reused; fresh ingredients alone miss this provenance path.
const incomplete = tub(10 * D, plan, { lots: [raw({ history_complete: 0 }), water()] });
const recovered = lot(out(incomplete, 'process_water'), 'lot:recovered');
const aliquot = { ...recovered, amount: { ...recovered.amount, value: 150000 } }; // ordinary inventory split, same quality
const knownClay = { lotId: 'lot:known', materialId: 'settled_clay', location: 'shelf', amount: { value: 1000000, unit: 'mg' },
  quality: { water_ppm: 200000, xd_kaolinite_ppm: 800000, xd_quartz_ppm: 200000, history_complete: 1 } };
const reused = step(kneadReq([knownClay, aliquot]));
const A2 = { incompleteClayQuality: out(incomplete, 'settled_clay').quality, recoveredWater: recovered,
  reusedAliquotMg: aliquot.amount.value, nextPrepared: reused.produced[0] };
const provenancePaths = [];
for (const [cause, options] of [
  ['raw-history', { lots: [raw({ history_complete: 0 }), water()] }],
  ['water-history', { lots: [raw(), { ...water(), quality: { history_complete: 0 } }] }],
  ['unknown-weather', { environment: { sampleId: 'unknown', source: 'unknown', effectiveAt: 0 } }],
]) {
  const r = tub(10 * D, plan, options), w = lot(out(r, 'process_water'), 'lot:recovered');
  w.amount = { value: 150000, unit: 'mg' };
  const next = step(kneadReq([knownClay, w]));
  provenancePaths.push({ cause, clayHistory: out(r, 'settled_clay').quality.history_complete,
    recoveredWaterQuality: w.quality, nextClayHistory: next.produced[0].quality.history_complete });
}
A2.provenancePaths = provenancePaths;

// B3: taking the clay out to feel it must leave a supported way to wait when it is still too wet.
const early = tub(2 * D, [[D, 'sieve'], [D + 30000, 'take_out']]);
const wet = lot(out(early, 'settled_clay'), 'lot:wet');
const wetKnead = step(kneadReq([wet], 0, 3 * H));
const prepared = lot(wetKnead.produced[0], 'lot:prepared');
const retries = [wet, prepared].map(c => ({ materialId: c.materialId,
  slake: brief(step(request(0, H, null, [], { lots: [c, water()] }))),
  dry: brief(step(request(0, H, null, [], { ...DRYING_PROCESS, lots: [c], equipment: [] }))) }));
const B3 = { earlyFeel: early.observations.at(-1), waterRatio: wr(wet), kneadedFeel: wetKnead.observations, retries };

// Nonzero run origin; actions and weather boundaries identical in every run.
const partitioning = [];
for (const days of [9.25, 12]) {
  const origin = 1000, acts = [[origin + D + 17000, 'sieve'], [origin + 2.5 * D + 5500, 'decant'],
    [origin + 4 * D, 'decant'], [origin + days * D + 13000, 'take_out']];
  const base = tub((days + 1) * D, acts, {}, 30000, origin);
  for (const chunk of [H, 3 * H, 37001]) {
    const r = tub((days + 1) * D, acts, {}, chunk, origin);
    const exact = JSON.stringify([base.last.produced, base.last.released, base.last.state, base.observations]) ===
      JSON.stringify([r.last.produced, r.last.released, r.last.state, r.observations]);
    if (chunk % 30000 === 0) assert(exact);
    const maxProductMg = Math.max(...base.last.produced.map((p, i) => Math.abs(p.amount.value - r.last.produced[i].amount.value)));
    partitioning.push({ days, chunk, exact, waterRatio: wr(out(r, 'settled_clay')), maxProductMg,
      vapourDifferenceMg: sum(r.last.released) - sum(base.last.released), heatDifferenceJ: r.heatJ - base.heatJ,
      heatRelativePercent: 100 * (r.heatJ - base.heatJ) / base.heatJ, sameObservations: JSON.stringify(r.observations) === JSON.stringify(base.observations) });
  }
}
// Work clock: supply interruption, no heat/power carried from a previous interval, and loss at interval.to.
const normalKnead = step(kneadReq([knownClay], 1000, 361000));
const k1 = step(kneadReq([knownClay], 1000, 61000));
const k2 = step(kneadReq([knownClay], 61000, 121000, k1.state, 0));
const k3 = step(kneadReq([knownClay], 121000, 361000, k2.state));
assert.equal(k2.status, 'needs-input'); assert.deepEqual(k2.energy, []);
assert.deepEqual(k3.produced, normalKnead.produced);
assert.equal(k1.energy[0].usedJ + k3.energy[0].usedJ, normalKnead.energy[0].usedJ);
const stopped = step(kneadReq([knownClay], 61000, 121000, k1.state, 20, { stop: 'equipment-lost', equipment: [] }));
assert.equal(stopped.status, 'stopped'); assert.equal(stopped.energy[0].usedJ, 1200); assert.deepEqual(stopped.consumed, []);
const clocks = { catalog: JSON.parse(readFileSync(`${root}/data/science/catalog-test-2.json`, 'utf8')).processes
  .filter(p => [SLAKE_PROCESS.processId, KNEAD_PROCESS.processId].includes(p.id ?? p.processId)),
  pausedWork: { beforeMs: k1.state.data.elapsedMs, afterMs: k2.state.data.elapsedMs, completedAt: k3.simulated.to }, stopped: brief(stopped) };
const flux = (sun, rh = 0.75) => pv('evapCoeff') * 1.9 * Math.max(0, pSat(28 + pv('sunSurfaceExcessC') * sun) - rh * pSat(28));
const realism = { assumptionsNotMeasurements: true, shade: { evaporationKgM2Day: flux(0) * 86400,
  waterKgDayAt1500Cm2: flux(0) * 86400 * 0.15, latentWPerM2: flux(0) * pv('latentHeatWater25') },
  constantSun: { evaporationKgM2Day: flux(1) * 86400, latentWPerM2: flux(1) * pv('latentHeatWater25') },
  tauDryS: pv('slakeTauDryS'), tauRaw20PercentWaterS: pv('slakeTauDryS') * (1 + 4 * 0.25 / pv('clayWaterPlastic')) };
const massMatrix = [];
for (const mg of [45000, 500000, 10000000]) for (const waterPpm of [0, 200000, 400000]) for (const coarsePpm of [0, 100000, 300000]) {
  const c = raw(); c.amount.value = mg;
  c.quality = { water_ppm: waterPpm, xd_kaolinite_ppm: 500000, xd_quartz_ppm: 300000,
    xc_quartz_ppm: coarsePpm, xc_inert_mineral_ppm: 100000 };
  const dry = mg - Math.round(mg * waterPpm / 1e6), w = water(Math.ceil(1.8 * dry));
  const r = tub(3 * D, [[H, 'sieve'], [2 * D, 'decant'], [2.5 * D, 'take_out']], { lots: [c, w] });
  assert.equal(r.last.status, 'completed');
  assert.equal(sum(r.last.consumed), sum(r.last.produced) + sum(r.last.released));
  assert.equal(r.heatJ, Math.floor(sum(r.last.released) * 2.43 + 1e-9));
  massMatrix.push({ mg, waterPpm, coarsePpm, massCloses: true, latentJMatches: true });
}
assert.deepEqual(violations, []);
console.log(JSON.stringify({ root, processes: [SLAKE_PROCESS, KNEAD_PROCESS], calls, baseline, partitioning, clocks, realism,
  massMatrix, findings: { A1, A2, B1, B2, B3 }, contractViolations: violations }, null, 2));
