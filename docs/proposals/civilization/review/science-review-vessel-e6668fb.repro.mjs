// Read-only review of e6668fb. Run from a checkout with tsx installed:
// node --import tsx THIS_FILE /absolute/science-checkout
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? process.cwd());
const load = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await load('src/science/step/index.ts');
const { TAR_SEAL_PROCESS: seal, LEAK_TEST_PROCESS: leak, readPot } = await load('src/science/step/vessel.ts');
const { validateResult } = await load('src/science/step/validate.ts');
const H = 3600000, D = 24 * H, M = 60000;
const violations = [], calls = { count: 0 };
function step(q) {
  const r = scienceStep(q); calls.count++;
  for (const v of validateResult(q, r)) if (violations.length < 20) violations.push({ request: q.requestId, v });
  return r;
}
const sum = xs => (xs ?? []).reduce((s, x) => s + x.amount.value, 0);
const massError = r => sum(r.consumed) + sum(r.drawn) - sum(r.produced) - sum(r.released);
const lot = (id, materialId, mg, quality = {}) => ({ lotId: `lot:${id}`, materialId, amount: { value: mg, unit: 'mg' }, location: 'site:shelf', quality });
const pot = (q = {}, mg = 600000) => lot('pot', 'fired_pot_test', mg, { capacity_ml: 500, absorption_ppm: 120000, ...q });
const tar = (mg = 15000) => lot('tar', 'wood_tar', mg, { x_wood_tar_ppm: 1000000 });
const wood = (water = 150000, mg = 2000000) => lot('wood', 'firewood', mg, { water_ppm: water });
const water = (mg = 450000) => lot('water', 'process_water', mg);
const asLot = (p, id = 'pot') => ({ ...lot(id, p.materialId, p.amount.value, p.quality), location: p.into });
const potOf = r => asLot(r.produced.find(p => p.materialId === 'fired_pot_test'));
const eq = (equipmentId, kind, params = {}) => ({ equipmentId, kind, params, condition: 1 });
const brush = eq('eq:brush', 'fixture_tar_brush'), pit = eq('eq:pit', 'open_fire_pit', { maxBurnKgPerH: 3 });
const stand = (sun = 0) => eq('eq:stand', 'fixture_vessel_stand', { sunExposure: sun });
const env = (over = {}) => ({ source: 'record', sampleId: 'env', effectiveAt: 0, airTempC: 28, humidity: .75, windMs: 2, ...over });
const act = (at, action) => ({ at, action, residentId: 'res:lantern' });
const req = (process, from, to, lots, state = null, actions = [], over = {}) => ({
  contract: '0.2.0', requestId: `${process.processId}:${from}`, runId: `run:${process.processId}`,
  world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, ...process, catalogVersion: 'civ-sci-test-2', seed: 1,
  interval: { from, to }, state, lots, actions, environment: env({ effectiveAt: from }),
  equipment: process === seal ? (lots.some(l => l.materialId === 'firewood') ? [brush, pit] : [brush]) : [stand()],
  energy: process === seal ? [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: (to - from) / 1000 * 20 }] : [], ...over,
});
function wait(lots, duration, chunk = H, actions = [], over = {}) {
  let state = null, last; const obs = [], energy = { usedJ: 0, lostJ: 0, storedJ: 0 };
  for (let from = 0; from < duration; from += chunk) {
    const to = Math.min(duration, from + chunk);
    last = step(req(leak, from, to, lots, state, actions.filter(a => a.at >= from && a.at < to), { ...over, ...(to === duration ? { stop: 'operator' } : {}) }));
    state = JSON.parse(JSON.stringify(last.state));
    obs.push(...last.observations);
    for (const e of last.energy) for (const k of Object.keys(energy)) energy[k] += e[k] ?? 0;
    if (!['running', 'needs-input'].includes(last.status)) break;
  }
  return { last, obs, energy };
}
const brief = r => ({ status: r.status, to: r.simulated.to, produced: r.produced, released: r.released, observations: r.observations, energy: r.energy, massErrorMg: massError(r) });
const out = { target: root, processes: { seal, leak } };

// A future action must not affect a run which has already completed.
const whole = step(req(seal, 0, H, [pot(), tar()], null, [act(20 * M, 'seal')]));
const split = step(req(seal, 0, 15 * M, [pot(), tar()]));
out.futureSeal = { actionAt: 20 * M, whole: brief(whole), split: brief(split) };

// Follow a real returned wet vessel, without adding another lot of free water.
const wet = wait([pot(), water()], 3 * D);
const wetLot = potOf(wet.last);
const dry = wait([wetLot], 7 * D, H, [act(6 * D, 'look')], { environment: env({ airTempC: 33, humidity: .4, windMs: 2 }), equipment: [stand(1)] });
out.wetWallChain = { before: readPot(wetLot), after: readPot(potOf(dry.last)), evaporatedMg: sum(dry.last.released), energy: dry.energy, observations: dry.obs, massErrorMg: massError(dry.last) };

const gap = wait([pot(), water()], 3 * D, H, [act(D, 'look')], { environment: env({ source: 'unknown' }) });
out.unknown = { observations: gap.obs, produced: gap.last.produced, diagnostics: gap.last.diagnostics };

// Immersion is currently a label-only read: no pressure, air stock or water intake is used.
const stopped = potOf(step(req(seal, 0, H, [pot(), tar(5000)], null, [act(M, 'seal')])));
const bubbles = wait([stopped], 3 * D, H, [act(0, 'submerge'), act(D, 'submerge'), act(2 * D, 'submerge')]);
out.immersion = { input: stopped, observations: bubbles.obs, output: bubbles.last.produced, released: bubbles.last.released, drawn: bubbles.last.drawn };
const openImmersion = wait([pot()], H, H, [act(M, 'submerge')]);
out.openImmersion = { input: readPot(pot()), output: readPot(potOf(openImmersion.last)), observations: openImmersion.obs, drawn: openImmersion.last.drawn };

// Looking must not observe a later integration point. Choose a normal near-empty raw vessel.
// First find depletion time using 1-second physical intervals, then compare the same read in a long request.
let st = null, crossing;
for (let t = 0; t < 10 * M; t += 1000) {
  const r = step(req(leak, t, t + 1000, [pot(), water(1000)], st)); st = r.state;
  if (r.diagnostics.waterInMg === 0) { crossing = t + 1000; break; }
}
const at = Math.max(1000, crossing - 1000);
const lookWhole = wait([pot(), water(1000)], M * 10, M * 10, [act(at, 'look')]);
const lookSplit = wait([pot(), water(1000)], M * 10, 1000, [act(at, 'look')]);
out.readTiming = { crossingMsWith1s: crossing, readAt: at, whole: lookWhole.obs, split: lookSplit.obs };

// Typical static weather: exact grid equality, off-grid numerical error, look not changing settlement.
const warm = potOf(step(req(seal, 0, H, [pot(), tar(), wood()])));
const metrics = r => ({ pot: readPot(potOf(r.last)), leftMg: r.last.produced.find(p => p.materialId === 'process_water')?.amount.value ?? 0, evapMg: sum(r.last.released), energy: r.energy, massErrorMg: massError(r.last) });
out.partitions = [];
for (const chunk of [3 * H, H, 30000, 17000, 1000]) {
  const r = wait([warm, water()], 3 * D, chunk, [], { environment: env({ airTempC: 33, humidity: .7 }), equipment: [stand(1)] });
  out.partitions.push({ chunkMs: chunk, ...metrics(r) });
}
const manyLooks = wait([warm, water()], 3 * D, H, Array.from({ length: 72 }, (_, i) => act(i * H + 17000, 'look')), { environment: env({ airTempC: 33, humidity: .7 }), equipment: [stand(1)] });
out.lookSettlementUnchanged = JSON.stringify(metrics(manyLooks)) === JSON.stringify(Object.fromEntries(Object.entries(out.partitions[1]).filter(([k]) => k !== 'chunkMs')));

// Deterministic mass/heat/re-read checks, including very wet returned fuel and tiny remainders.
const balances = { seals: 0, leaks: 0, errors: [] };
for (const wetPpm of [0, 150000, 600000, 950000, 1000000]) for (const mg of [1, 149999, 150000, 300001, 2000000]) for (const tarMg of [1, 4999, 5000, 15001]) {
  const r = step(req(seal, 0, H, [pot(), tar(tarMg), wood(wetPpm, mg)], null, [act(M, 'seal')])); balances.seals++;
  if (r.status === 'failed' || massError(r)) balances.errors.push(brief(r));
  if (r.status !== 'failed') readPot(potOf(r));
}
for (const waterMg of [1, 2, 13, 1000, 450001, 500000]) for (const coverage of [0, 560000, 935131, 1000000]) {
  const r = wait([pot({ coverage_ppm: coverage }), water(waterMg)], 3 * D); balances.leaks++;
  if (r.last.status === 'failed' || massError(r.last)) balances.errors.push(brief(r.last));
  if (r.last.status !== 'failed') readPot(potOf(r.last));
}
out.balances = balances;
out.pureWaterFuel = brief(step(req(seal, 0, H, [pot(), tar(), wood(1000000, 300000)])));
const first = step(req(leak, 0, H, [pot(), water()], null, [], { equipment: [eq('eq:stand', 'fixture_vessel_stand', { sunExposure: .5, spare: 1 })] }));
const reorder = step(req(leak, H, 2 * H, [pot(), water()], first.state, [], { equipment: [eq('eq:stand', 'fixture_vessel_stand', { spare: 1, sunExposure: .5 })] }));
out.standKeyOrder = reorder.status;
const normalSeal = step(req(seal, 0, H, [pot(), tar(), wood()], null, [act(M, 'seal')]));
let sealState = null, sealLast, handJ = 0;
for (let t = 0; t < H; t += M) {
  sealLast = step(req(seal, t, t + M, [pot(), tar(), wood()], sealState, t === M ? [act(M, 'seal')] : []));
  handJ += sealLast.energy.filter(e => e.kind === 'mechanical').reduce((s, e) => s + e.usedJ, 0);
  sealState = JSON.parse(JSON.stringify(sealLast.state));
  if (sealLast.status === 'completed') break;
}
out.normalSealPartition = { productsEqual: JSON.stringify(normalSeal.produced) === JSON.stringify(sealLast.produced), handJ };
const lostFirst = step(req(leak, 0, H, [pot(), water()], null, [], { stop: 'equipment-lost', equipment: [] }));
const firstHour = step(req(leak, 0, H, [pot(), water()]));
const lost = step(req(leak, H, 2 * H, [pot(), water()], firstHour.state, [], { stop: 'equipment-lost', equipment: [] }));
const operator = step(req(leak, H, 2 * H, [pot(), water()], firstHour.state, [], { stop: 'operator' }));
out.equipmentLoss = { first: lostFirst.status, to: lost.simulated.to, sameSettlementAsOperator: JSON.stringify([lost.produced, lost.released, lost.energy]) === JSON.stringify([operator.produced, operator.released, operator.energy]) };
const zeroSupply = step(req(seal, 0, H, [pot(), tar()], null, [], { energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 0 }] }));
const resumed = step(req(seal, H, 2 * H, [pot(), tar()], zeroSupply.state));
out.insufficientHands = { status: zeroSupply.status, energy: zeroSupply.energy, to: zeroSupply.simulated.to, resumedStatus: resumed.status, resumedTo: resumed.simulated.to };
out.calls = calls.count; out.validatorViolations = violations;
console.log(JSON.stringify(out, null, 2));
