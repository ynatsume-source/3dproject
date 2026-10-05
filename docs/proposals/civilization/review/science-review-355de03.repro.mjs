// Targeted confirmation of vessel fixes A1–A6/C1 at science 355de03.
// Read-only; no source patches. Sherds (9c3b611) are deliberately out of scope.
// node --import tsx THIS_FILE /science/355de03 /host/e14eeba [/science/e6668fb]
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
const { potToEquipmentParams, potQualityOnReturn, POT_ASSEMBLY_TABLE, ASSEMBLED_POT } = await load('src/science/step/vessel.ts');
const host = resolve(process.argv[3]);
const { emptyLedger, addLot, assemble, disassemble } = await import(pathToFileURL(`${host}/src/world/process-runner.ts`));
const out = { target: root, host, processes: { seal, leak }, checks: 0, failures: [] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, condition, detail) {
  out.checks++;
  if (!condition) out.failures.push({ name, detail });
}
const noEffects = r => ['consumed', 'produced', 'released', 'drawn', 'energy', 'equipmentWear', 'observations'].every(k => !(r[k]?.length));
const key = r => ({ produced: r.produced, released: r.released, drawn: r.drawn });
const metrics = r => ({ ...key(r.last), energy: r.energy });

// A1: the end of the job is not the end of a long request. Check both sides of that boundary,
// including a nonzero run origin, repeated requests and JSON save/restore between requests.
out.sealBoundary = [];
for (const start of [0, 1234]) for (const delay of [M, 14 * M, 15 * M - 1, 15 * M, 20 * M]) {
  const lots = [pot(), tar()], at = start + delay;
  const whole = step(req(seal, start, start + H, lots, null, [act(at, 'seal')]));
  for (const chunk of [37000, M, 15 * M]) {
    let state = null, last, handJ = 0;
    for (let from = start; from < start + H; from += chunk) {
      const to = Math.min(from + chunk, start + H);
      last = step(req(seal, from, to, lots, state, at >= from && at < to ? [act(at, 'seal')] : []));
      state = JSON.parse(JSON.stringify(last.state));
      handJ += last.energy.reduce((s, e) => s + e.usedJ, 0);
      if (last.status === 'completed') break;
    }
    check('A1: future/boundary seal and saved state', same(key(whole), key(last)) && handJ === 13500 &&
      last.simulated.to === start + 15 * M && last.produced[0].quality.sealed === (delay < 15 * M ? 1 : 0), { start, delay, chunk });
  }
  out.sealBoundary.push({ start, delay, sealed: whole.produced[0].quality.sealed });
}

// A2: reproduce the old 95-second look, and verify reads never feed back into physics.
const at95 = [act(95000, 'look')];
const one = wait([pot(), water(1000)], 10 * M, 10 * M, at95);
const seconds = wait([pot(), water(1000)], 10 * M, 1000, at95);
out.readTiming = { one: one.obs, seconds: seconds.obs };
check('A2: 95-second look', same(one.obs, seconds.obs) && /しっとり/.test(one.obs[0].text), out.readTiming);
const looks = Array.from({ length: 72 }, (_, i) => act(i * H + 17000, 'look'));
const waterLots = [pot(), water()];
const wet = wait(waterLots, 3 * D), withLooks = wait(waterLots, 3 * D, H, looks);
check('A2: 72 looks leave physics unchanged', same(metrics(wet), metrics(withLooks)) && same(wet.last.state, withLooks.last.state));

// A3: use a real returned wet pot, not a fresh fixture. Dry it, fill it, return it, dry it again.
const dryEnv = { environment: env({ airTempC: 33, humidity: .4 }), equipment: [stand(1)] };
const wetLot = potOf(wet.last), wetMg = readPot(wetLot).water;
const dry = wait([wetLot], 7 * D, H, [act(M, 'look'), act(6 * D, 'look')], dryEnv);
const dryLot = potOf(dry.last), evaporated = sum(dry.last.released);
check('A3: wall water and heat close', wetMg === 72000 && readPot(dryLot).water === 0 && evaporated === wetMg &&
  dry.energy.usedJ === Math.floor(evaporated * 2.43) && massError(dry.last) === 0, metrics(dry));
check('A3: damp then dry', /濡れて|湿って/.test(dry.obs[0].text) && /乾いて/.test(dry.obs[1].text), dry.obs);
out.wallDrying = { beforeMg: wetMg, afterMg: readPot(dryLot).water, evaporated, energy: dry.energy, observations: dry.obs };
out.dryPartitions = [];
for (const chunk of [3 * H, 30000, 37000]) {
  const r = wait([wetLot], 7 * D, chunk, [], dryEnv);
  const equal = same(metrics(dry), metrics(r));
  check('A3: drying partitions, final integer settlement', equal && massError(r.last) === 0, { chunk, metrics: metrics(r) });
  out.dryPartitions.push({ chunk, equal });
}
let current = dryLot;
out.waterReuse = [];
for (let i = 0; i < 3; i++) {
  const filled = wait([current, water()], H);
  const emptied = potOf(filled.last);
  const drying = wait([emptied], 2 * H, 37000, [], dryEnv);
  current = potOf(drying.last);
  const before = readPot(emptied), after = readPot(current);
  check('A3: refill and partial drying chain', before.water > after.water && massError(filled.last) === 0 && massError(drying.last) === 0 &&
    drying.energy.usedJ === Math.floor(sum(drying.last.released) * 2.43), { i, before, after });
  out.waterReuse.push({ beforeMg: before.water, afterMg: after.water, vapourMg: sum(drying.last.released), usedJ: drying.energy.usedJ });
}

// A5: the known interval before a gap can be observed; neither the gap nor the later frozen ledger can.
const first = step(req(leak, 0, H, waterLots, null, [act(M, 'look')]));
const gap = step(req(leak, H, 2 * H, waterLots, JSON.parse(JSON.stringify(first.state)), [act(H + M, 'look')], { environment: env({ source: 'unknown' }) }));
const restored = step(req(leak, 2 * H, 3 * H, waterLots, JSON.parse(JSON.stringify(gap.state)), [act(2 * H + M, 'look')], { stop: 'operator' }));
check('A5: known-gap-known', first.observations.length > 0 && gap.observations.length === 0 && restored.observations.length === 0 &&
  restored.produced.every(p => p.quality.history_complete === 0) && massError(restored) === 0);
const unknown = wait(waterLots, 3 * D, H, looks, { environment: env({ source: 'unknown' }) });
check('A5: all unknown', unknown.obs.length === 0 && unknown.last.produced.every(p => p.quality.history_complete === 0));
out.unknown = { beforeGap: first.observations, inGap: gap.observations, afterGap: restored.observations, history: restored.produced.map(p => p.quality.history_complete) };

// A6: science table injected into the real host, with no modifications to its assembly implementation.
const table = { version: POT_ASSEMBLY_TABLE, kind: ASSEMBLED_POT, catalogEntry: ASSEMBLED_POT, catalogVersion: 'civ-sci-test-2',
  materials: ['fired_pot_test'], toParams: potToEquipmentParams, qualityOnReturn: potQualityOnReturn };
const sealed = potOf(step(req(seal, 0, H, [pot(), tar(20000)], null, [act(M, 'seal')])));
const ledger = emptyLedger('w', 'e');
let returned = addLot(ledger, sealed);
out.assembly = [];
for (const condition of [.9, 1, .97]) {
  const assembled = assemble(ledger, returned.lotId, table, 0).equipment;
  ledger.equipment[assembled.equipmentId].condition = condition;
  returned = disassemble(ledger, assembled.equipmentId, table).lot;
  const params = potToEquipmentParams(returned);
  check('A6: sealed and unknown through real host round trips', returned.quality.sealed === 1 && returned.quality.airtight_known === 0 &&
    returned.quality.air_leak_tau_min === undefined && params.sealed === 1 && params.airtightKnown === 0 && params.airLeakTauMin === 0 && returned.amount.value === sealed.amount.value);
  out.assembly.push({ condition, quality: returned.quality, params });
}
check('A6: cumulative crack', same(out.assembly.map(x => x.quality.crack_ppm), [100000, 100000, 130000]));
const wornDry = wait([returned], D);
const stillUnknown = potOf(wornDry.last);
check('A6: waiting does not certify or open a sealed pot', stillUnknown.quality.sealed === 1 && stillUnknown.quality.airtight_known === 0 && stillUnknown.quality.air_leak_tau_min === undefined);
const fill = step(req(leak, 0, H, [stillUnknown, water()]));
const coat = step(req(seal, 0, H, [stillUnknown, tar()], null, [act(M, 'seal')]));
check('A6: filling and coating refused', [fill, coat].every(r => r.status === 'failed' && noEffects(r)), { fill: fill.evidence.notes, coat: coat.evidence.notes });

// A4: deferred immersion has no observations/flows, for open, sealed, and damaged sealed pots, either contract.
for (const contract of ['0.1.0', '0.2.0', '0.2.1']) for (const p of [pot(), sealed, stillUnknown]) {
  const r = step(req(leak, 0, H, [p], null, [act(M, 'submerge')], { contract }));
  check('A4: deferred submerge', r.status === 'failed' && /held back/.test(r.evidence.notes) && noEffects(r) &&
    (contract.startsWith('0.2.') ? same(r.drawn, []) : !Object.hasOwn(r, 'drawn')), { contract, quality: p.quality });
}

// Old states must be explicitly refused, not relabelled as the new version. Optional genuine old state input.
out.schemas = [];
let oldStep;
if (process.argv[4]) ({ scienceStep: oldStep } = await import(pathToFileURL(`${resolve(process.argv[4])}/src/science/step/index.ts`)));
for (const p of [seal, leak]) {
  const lots = p === seal ? [pot(), tar()] : waterLots;
  const initial = req(p, 0, M, lots), r = step(initial);
  const saved = JSON.parse(JSON.stringify(r.state));
  const resume = step(req(p, M, 2 * M, lots, saved));
  const direct = step(req(p, 0, 2 * M, lots));
  check('new /2 state saves and resumes', r.state.schema.endsWith('/2') && same(resume.state, direct.state));
  const old = oldStep ? oldStep({ ...initial, processVersion: '0.1.0' }).state : { ...saved, schema: saved.schema.replace('/2', '/1') };
  const denied = step(req(p, M, 2 * M, lots, JSON.parse(JSON.stringify(old))));
  check('old /1 state refused with no effects', old.schema.endsWith('/1') && denied.status === 'failed' && /unsupported-state-schema/.test(denied.evidence.notes) && noEffects(denied));
  out.schemas.push({ process: p.processId, fresh: r.state.schema, old: old.schema, rejected: denied.status, notes: denied.evidence.notes });
}
check('assembly table /2', POT_ASSEMBLY_TABLE === 'civ-sci.pot-assembly/2');

// C1: neither pure water nor very wet fuel yields combustion products; the returned fuel survives reuse.
out.nonburnableFuel = [];
for (const waterPpm of [950000, 1000000]) {
  let fuel = wood(waterPpm, 300000);
  for (let i = 0; i < 2; i++) {
    const r = step(req(seal, 0, H, [pot(), tar(), fuel]));
    const returnedFuel = r.produced.find(p => p.materialId === 'firewood');
    check('C1: nonburnable fuel reuse', r.status === 'completed' && returnedFuel.amount.value === 300000 &&
      r.released.length === 0 && r.drawn.length === 0 && r.energy.every(e => e.kind === 'mechanical') && massError(r) === 0);
    fuel = asLot(returnedFuel, 'fuel-return');
    out.nonburnableFuel.push({ waterPpm, reuse: i, returnedMg: fuel.amount.value, energy: r.energy, observations: r.observations });
  }
}
check('all results pass contract validator', violations.length === 0, violations);
out.calls = calls.count;
out.validatorViolations = violations;
console.log(JSON.stringify(out, null, 2));
if (out.failures.length) process.exitCode = 1;
