// Checks for the ScienceStep implementation (contract 0.1.0, src/world/science-contract.ts), drying first.
//   npx tsx scripts/science-step-check.ts
// The "world" here is a few lines of test code that commits each result once by requestId. It is not a
// world server and keeps nothing beyond this script.

import { SCIENCE_CONTRACT_VERSION, type ScienceStepRequest, type ScienceStepResult, type EnvironmentSample } from '../src/world/science-contract';
import { dryingStep, DRYING_PROCESS, SCIENCE_CATALOG_VERSION } from '../src/science/step/drying';
import { scienceStep } from '../src/science/step';
import { hashOf } from '../src/science/fixture/world';
import { createClayTestWorld } from '../src/science/fixture/clay-world';
import { Driver, T0 } from '../src/science/fixture/scenario';

let pass = 0, failN = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { failN++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000;
const ENV: EnvironmentSample = { sampleId: 'env:fixture-day', source: 'simulation', effectiveAt: T0, airTempC: 28, humidity: 0.72, windMs: 3 };
const UNKNOWN: EnvironmentSample = { sampleId: 'env:unknown', source: 'unknown', effectiveAt: T0 };

const LOT = {
  lotId: 'lot:tile-1', materialId: 'test_tile_green', amount: { value: 45_000, unit: 'mg' as const }, location: 'site:rack-shade',
  quality: { water_ppm: 193_548, shaped_water_ratio_ppm: 240_000, width_mm: 50, length_mm: 50, thickness_mm: 10, linear_shrink_ppm: 0, crack: 0, history_complete: 1 },
};
const RACK = (sun = 0) => ({ equipmentId: 'eq:rack-1', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { sunExposure: sun } });

function req(over: Partial<ScienceStepRequest> & { from: number; to: number }): ScienceStepRequest {
  const { from, to, ...rest } = over;
  return {
    contract: SCIENCE_CONTRACT_VERSION, requestId: `run:dry-1@${from}#0`, world: { worldId: 'civ-sim-test', worldEpoch: 'e1', worldVersion: 1 },
    runId: 'run:dry-1', processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION,
    interval: { from, to }, state: null, environment: ENV, lots: [LOT], equipment: [RACK()], energy: [], actions: [], seed: 7, ...rest,
  };
}

/** A minimal committer: chunk boundaries in ms (relative to T0), env per chunk, take-off at the end. */
function run(bounds: number[], opt: { env?: (i: number) => EnvironmentSample; seeds?: (i: number) => number; sun?: number;
  lot?: typeof LOT; stopAt?: { i: number; stop: ScienceStepRequest['stop'] } } = {}) {
  let state: ScienceStepRequest['state'] = null;
  const committed = new Map<string, ScienceStepResult>();
  const results: ScienceStepResult[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = T0 + bounds[i], to = T0 + bounds[i + 1];
    const last = i === bounds.length - 2;
    const r = req({ from, to, state, environment: opt.env?.(i) ?? ENV, seed: opt.seeds?.(i) ?? 7, lots: [opt.lot ?? LOT], equipment: [RACK(opt.sun ?? 0)],
      actions: last && opt.stopAt?.stop !== 'operator' ? [{ at: to - 1, residentId: 'res:dot', action: 'take_off' }] : [],
      stop: opt.stopAt?.i === i ? opt.stopAt.stop : undefined, requestId: `run:dry-1@${from}#0` });
    if (committed.has(r.requestId)) continue;
    const out = dryingStep(r);
    committed.set(r.requestId, out);
    results.push(out);
    state = out.state;
    if (out.status !== 'running') break;
  }
  const end = results[results.length - 1];
  const J = results.flatMap((r) => r.energy).reduce((s, e) => s + e.usedJ, 0);
  return { results, end, J };
}
const settled = (r: ScienceStepResult) => hashOf({ consumed: r.consumed, produced: r.produced, released: r.released, observations: r.observations, status: r.status });

console.log('1. versions and inputs: unknown → failed, nothing consumed');
for (const [name, over] of [
  ['contract 1.0.0', { contract: '1.0.0' }], ['processVersion', { processVersion: '9.9.9' }], ['catalogVersion', { catalogVersion: 'other' }],
  ['state schema', { state: { schema: 'civ-sci.drying/0', data: {} } }], ['process', { processId: 'p20_lime_calcination' }],
] as const) {
  const r = dryingStep(req({ from: T0, to: T0 + H, ...over }));
  ok(r.status === 'failed' && r.consumed.length === 0 && r.energy.length === 0, `unknown ${name} is refused, not guessed`);
}
ok(dryingStep(req({ from: T0, to: T0 + H, equipment: [] })).status === 'failed', 'no drying rack → failed');
ok(dryingStep(req({ from: T0, to: T0 + H, energy: [{ sourceId: 'src:robot-battery:dot', kind: 'electric', maxJ: 1e6 }] })).status === 'failed',
  'a robot battery offered as energy → failed');
ok(scienceStep(req({ from: T0, to: T0 + H, processId: 'p13_pottery_fire' })).status === 'failed', 'dispatcher: concept-only / unimplemented process → failed');

console.log('2. determinism and resend');
const a1 = dryingStep(req({ from: T0, to: T0 + 5 * H })), a2 = dryingStep(req({ from: T0, to: T0 + 5 * H }));
ok(hashOf(a1) === hashOf(a2), 'the same request gives the same result');
const once = run([0, 24 * H, 48 * H, 120 * H]);
ok(once.results.length === 3, 'committer applies each requestId once (resends are no-ops by construction)');

console.log('3. interval additivity: chunking never changes the outcome');
const whole = run([0, 120 * H]);
const halfDays = run(Array.from({ length: 11 }, (_, i) => i * 12 * H));
const ragged = run([0, 7 * 60_000, 3.3 * H, 3.3 * H + 1, 50 * H, 50.5 * H, 99.9 * H, 120 * H]);
ok(settled(whole.end) === settled(halfDays.end) && settled(whole.end) === settled(ragged.end), 'one interval = 12 h chunks = ragged chunks (settled lot, vapour, observations)');
ok(whole.J === halfDays.J && whole.J === ragged.J, 'integer J summed over chunks is identical', `${whole.J} J`);
const seeded = run(Array.from({ length: 11 }, (_, i) => i * 12 * H), { seeds: (i) => (i === 0 ? 7 : 1000 + i), sun: 1, lot: { ...LOT, quality: { ...LOT.quality, thickness_mm: 15 } } });
const seeded0 = run(Array.from({ length: 11 }, (_, i) => i * 12 * H), { sun: 1, lot: { ...LOT, quality: { ...LOT.quality, thickness_mm: 15 } } });
ok(settled(seeded.end) === settled(seeded0.end), 'a different seed on later requests does not change the outcome (seed fixed at run start)');

console.log('4. mass: the lot is settled once, at the end');
ok(whole.results.slice(0, -1).every((r) => r.consumed.length + r.produced.length + r.released.length === 0) &&
   halfDays.results.slice(0, -1).every((r) => r.consumed.length + r.produced.length + r.released.length === 0), 'running steps consume, produce and release nothing');
const e = halfDays.end;
const cons = e.consumed.reduce((s, c) => s + c.amount.value, 0), prod = e.produced.reduce((s, c) => s + c.amount.value, 0), rel = e.released.reduce((s, c) => s + c.amount.value, 0);
ok(e.status === 'completed' && cons === prod + rel && cons === LOT.amount.value, 'Σconsumed = Σproduced + Σreleased, exactly in mg', `${cons} = ${prod} + ${rel}`);
ok(e.consumed.every((c) => c.lotId === LOT.lotId), 'consumes only the reserved lot');
ok(e.produced[0].materialId === 'test_tile_dry' && e.produced[0].quality!.water_ppm < LOT.quality.water_ppm, 'produced lot carries the new state as quality', JSON.stringify(e.produced[0].quality));

console.log('5. energy: integer J, closed per entry, no double count');
const all = halfDays.results.flatMap((r) => r.energy);
ok(all.every((x) => Number.isInteger(x.usedJ) && Number.isInteger(x.lostJ) && x.usedJ === x.lostJ + (x.storedJ ?? 0)), 'every entry is integer and closes: used = lost + stored');
const latent = (rel / 1e6) * 2.44e6;
ok(Math.abs(halfDays.J - latent) <= 0.5, 'Σ reported J = latent heat of the vapour within ½ J (cumulative rounding)', `${halfDays.J} J vs ${latent.toFixed(2)} J`);
ok(all.every((x) => x.sourceId.startsWith('src:env-heat:')), 'heat is drawn from the environment source only (no fuel, no battery)');

console.log('6. operational vs in-world stops; unknown weather');
const paused = run([0, 24 * H, 48 * H, 120 * H], { stopAt: { i: 0, stop: 'world-pause' } });
ok(paused.results[0].status === 'running' && paused.results[0].consumed.length === 0, 'world-pause: nothing settles, the run keeps its state');
ok(settled(paused.end) === settled(once.end), '…and resuming gives the same outcome as never pausing');
const opStop = run([0, 24 * H, 48 * H], { stopAt: { i: 1, stop: 'operator' } });
ok(opStop.end.status === 'stopped' && opStop.end.consumed.length === 1, 'operator stop settles the lot (status stopped)');
const gap = run([0, 12 * H, 36 * H, 120 * H], { env: (i) => (i === 1 ? UNKNOWN : ENV) });
ok(gap.end.produced[0].quality!.history_complete === 0, 'an interval with unknown weather is not integrated; the lot is marked history-incomplete');
ok(gap.end.released[0].amount.value <= once.end.released[0].amount.value, 'no evaporation is invented for the unknown interval');

console.log('7. same physics as the test-world prototype');
{
  const d = new Driver(createClayTestWorld());
  d.send({ type: 'open_research', atMs: T0, record: { id: 'rx', residentId: 'dot', question: 'q', hypothesis: { text: '', variable: '', expect: '' }, basis: [], controls: {} } });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rc', researchId: 'rx', purpose: '', lotId: 'clay-A', mg: 100_000 });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rw', researchId: 'rx', purpose: '', lotId: 'water-work', mg: 100_000 });
  d.send({ type: 'prepare_clay', atMs: T0, clayReservationId: 'rc', waterReservationId: 'rw', rawMg: 50_000, targetWaterRatio: 0.24, outLotId: 'pc' });
  d.send({ type: 'shape_tiles', atMs: T0, lotId: 'pc', researchId: 'rx', scrapLotId: 'sc', trimFraction: 0, tiles: [{ sampleId: 'S', label: 's', massMg: 45_000, dimsMm: { w: 50, l: 50, t: 10 } }] });
  const s0 = d.w.state.view.samples.S;
  d.send({ type: 'start_drying', atMs: T0, runId: 'dr', researchId: 'rx', sampleIds: ['S'], facilityId: 'rack-shade', seed: 1 });
  d.send({ type: 'advance', atMs: T0 + 120 * H, runId: 'dr', untilMs: T0 + 120 * H, env: { id: 'e', source: 'test-fixture', airTempC: 28, rh: 0.72, windMs: 3, solar: 0.8 } });
  const s1 = d.w.state.view.samples.S;
  const lot = { ...LOT, quality: { ...LOT.quality, water_ppm: Math.round(((s0.comp.water ?? 0) * 1e6) / 45_000), shaped_water_ratio_ppm: Math.round(s0.shapedWaterRatio * 1e6) } };
  const st = run([0, 120 * H + 1], { lot });
  const protoEvap = (s0.comp.water ?? 0) - (s1.comp.water ?? 0);
  ok(Math.abs(st.end.released[0].amount.value - protoEvap) <= 2, 'ScienceStep drying evaporates what the prototype does (±2 mg ppm rounding)', `${st.end.released[0].amount.value} vs ${protoEvap} mg`);
}

console.log('8. conditions matter: sun + 15 mm cracks, shade does not');
{
  const lot15 = { ...LOT, quality: { ...LOT.quality, thickness_mm: 15 }, amount: { value: 67_500, unit: 'mg' as const } };
  let sunCr = 0, shadeCr = 0;
  for (let s = 1; s <= 20; s++) {
    if (run([0, 24 * H], { seeds: () => s, sun: 1, lot: lot15 }).end.produced[0].quality!.crack) sunCr++;
    if (run([0, 24 * H], { seeds: () => s, sun: 0, lot: lot15 }).end.produced[0].quality!.crack) shadeCr++;
  }
  ok(sunCr > 0 && shadeCr === 0, 'drying cracks across 20 seeds', `sun ${sunCr}/20, shade ${shadeCr}/20`);
}

console.log(`\n${pass} passed, ${failN} failed`);
if (failN) process.exit(1);
