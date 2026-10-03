// The clay test-tile loop end to end through the single ScienceStep entry point (contract 0.1.0):
//   dry → fire (three resident plans) → weigh → soak → weigh → absorption by the lab screen's formula.
//   npx tsx scripts/science-tile-chain-check.ts
// A few lines of test code play the world: they pass each produced lot on as the next reserved lot.

import { SCIENCE_CONTRACT_VERSION, type EnvironmentSample, type EquipmentView, type EnergyOffer, type LotView,
  type OperatorAction, type ScienceStepRequest, type ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { SCIENCE_CATALOG_VERSION, tileComp } from '../src/science/step/common';
import { DRYING_PROCESS } from '../src/science/step/drying';
import { FIRING_PROCESS } from '../src/science/step/firing';
import { SOAK_PROCESS } from '../src/science/step/soak';
import { addComp, elementMoles, type Composition } from '../src/science/chem';
import { hashOf } from '../src/science/fixture/world';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const { summarizeMeasurements } = await import('../tools/science-lab/measurements.mjs');
const T0 = Date.UTC(2026, 9, 12, 0, 0, 0), H = 3600_000, MIN = 60_000;
const ENV: EnvironmentSample = { sampleId: 'env:fixture', source: 'simulation', effectiveAt: T0, airTempC: 28, humidity: 0.72, windMs: 3 };
const violations: string[] = [];

interface Proc { processId: string; processVersion: string; catalogVersion: string }
function run(proc: Proc, runId: string, lots: LotView[], equipment: EquipmentView[], bounds: number[],
  o: { energy?: (from: number, to: number) => EnergyOffer[]; actions?: (i: number, from: number, to: number, last: boolean) => OperatorAction[]; seed?: number } = {}) {
  let state: ScienceStepRequest['state'] = null;
  const results: ScienceStepResult[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = T0 + bounds[i], to = T0 + bounds[i + 1];
    const req: ScienceStepRequest = { contract: SCIENCE_CONTRACT_VERSION, requestId: `${runId}@${from}`, world: { worldId: 'civ-sim-test', worldEpoch: 'e1', worldVersion: 1 },
      runId, ...proc, interval: { from, to }, state, environment: ENV, lots, equipment, energy: o.energy?.(from, to) ?? [],
      actions: o.actions?.(i, from, to, i === bounds.length - 2) ?? [], seed: o.seed ?? 7 };
    const r = scienceStep(req);
    violations.push(...validateResult(req, r).map((v) => `${runId}: ${v}`));
    results.push(r); state = r.state;
    if (r.status !== 'running') break;
  }
  return { results, end: results[results.length - 1] };
}
const asLot = (r: ScienceStepResult, id: string, i = 0): LotView => ({ lotId: id, materialId: r.produced[i].materialId, amount: r.produced[i].amount,
  location: r.produced[i].into ?? 'site:x', quality: r.produced[i].quality });
const steps = (n: number, h: number) => Array.from({ length: n + 1 }, (_, i) => i * h * H);
const sum = (xs: { amount: { value: number } }[]) => xs.reduce((s, x) => s + x.amount.value, 0);

// shaped test tile (fixture): 45 g, water ratio 0.24 on dry, clay A without organic matter (organic burnout waits for 0.2.0)
const TILE: LotView = { lotId: 'lot:tile-1', materialId: 'test_tile_green', amount: { value: 45_000, unit: 'mg' }, location: 'site:bench',
  quality: { water_ppm: 193_548, shaped_water_ratio_ppm: 240_000, width_mm: 50, length_mm: 50, thickness_mm: 10, linear_shrink_ppm: 0, crack: 0, history_complete: 1,
    xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 300_000, xd_calcite_ppm: 20_000 } };
const RACK: EquipmentView = { equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { sunExposure: 0 } };
const KILN: EquipmentView = { equipmentId: 'eq:kiln', kind: 'fixture_kiln', catalogEntry: 'fixture_kiln', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1,
  params: { heatCapJPerK: 40_000, uaWPerK: 8, maxPowerW: 15_000, forcedCoolingUaFactor: 5 } };
const BASIN: EquipmentView = { equipmentId: 'eq:basin', kind: 'fixture_soak_basin', catalogEntry: 'fixture_soak_basin', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1 };
const BAL: EquipmentView = { equipmentId: 'eq:balance', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: 'civilization-fixture-1', condition: 1 };
const PROC = {
  dry: { ...DRYING_PROCESS, catalogVersion: SCIENCE_CATALOG_VERSION }, fire: { ...FIRING_PROCESS, catalogVersion: SCIENCE_CATALOG_VERSION },
  soak: { ...SOAK_PROCESS, catalogVersion: SCIENCE_CATALOG_VERSION }, weigh: { processId: 'fixture_mass_measure', processVersion: 'fixture-1', catalogVersion: 'civilization-fixture-1' },
};
const heat = (from: number, to: number): EnergyOffer[] => [{ sourceId: 'src:fixture-kiln-heater', kind: 'heat', maxJ: Math.floor(15_000 * (to - from) / 1000) }];
const takeOut = (_i: number, _f: number, to: number, last: boolean): OperatorAction[] => last ? [{ at: to - 1, residentId: 'res:dot', action: 'take_off' }, { at: to - 1, residentId: 'res:dot', action: 'take_out' }] : [];
const weigh = (lot: LotView, id: string) => run(PROC.weigh, id, [lot], [BAL], [0, MIN], {
  energy: () => [{ sourceId: 'src:balance-cell', kind: 'electric', maxJ: 100 }], actions: () => [{ at: T0, residentId: 'res:dot', action: 'read-balance' }] }).end.observations[0]?.value as number;

console.log('1. dry (ScienceStep) → a dried tile lot');
const dried = run(PROC.dry, 'run:dry', [TILE], [RACK], steps(10, 12), { actions: takeOut });
ok(dried.end.status === 'completed' && dried.end.produced[0].materialId === 'test_tile_dry', 'the tile dries on the rack and is settled once', `${dried.end.produced[0].amount.value} mg`);
const DRY = asLot(dried.end, 'lot:tile-dry');
ok(DRY.quality!.xd_kaolinite_ppm === 450_000, 'dry-basis composition passes through drying unchanged');

console.log('2. fire with three plans a resident can choose without a thermometer');
const plan = (pace: number, glow: number, holdMin: number, forced = 0) => (_i: number, f: number) => f === T0 ? [{ at: T0, residentId: 'res:dot', action: 'fire_plan', params: { pace, targetGlow: glow, holdMin, forcedCooling: forced } }] : [];
const fire = (id: string, p: ReturnType<typeof plan>, bounds = steps(24, 1), seed = 7) => run(PROC.fire, id, [DRY], [KILN], bounds, { energy: heat, actions: p, seed });
const orange = fire('run:fire-orange', plan(1, 2, 90));
const dull = fire('run:fire-dull', plan(1, 0, 90));
ok(orange.end.status === 'completed' && dull.end.status === 'completed', 'both firings heat, hold, cool and complete');
const dio = orange.end.diagnostics as { maxWareC: number; sinter: number }, did = dull.end.diagnostics as { maxWareC: number; sinter: number };
ok(dio.sinter > did.sinter && dio.maxWareC > did.maxWareC + 200, 'orange glow fires hotter and sinters more than dull red', `${dio.maxWareC.toFixed(0)} °C / sinter ${dio.sinter.toFixed(2)} vs ${did.maxWareC.toFixed(0)} °C / ${did.sinter.toFixed(2)}`);
{
  const before: Composition = tileComp(DRY);
  const r = orange.end;
  const rel = Object.fromEntries(r.released.map((x) => [x.materialId, x.amount.value]));
  const after = addComp(tileComp(asLot(r, 'x')), { water: rel.water_vapour ?? 0, co2: rel.process_co2 ?? 0 });
  const eb = elementMoles(before), ea = elementMoles(after);
  const worst = Math.max(...(['H', 'O', 'Si', 'Al', 'C', 'Ca'] as const).map((k) => Math.abs(eb[k] - ea[k]) * 1000));
  ok(worst < 0.1, 'firing: element balance across tile → fired tile + vapour + CO2 (ppm rounding)', `max ${worst.toFixed(4)} mmol; vapour ${rel.water_vapour} mg, CO2 ${rel.process_co2} mg`);
  ok(sum(r.consumed) === sum(r.produced) + sum(r.released), 'firing: mass closes exactly');
}
const ragged = fire('run:fire-orange', plan(1, 2, 90), [0, 7 * MIN, 2.5 * H, 2.5 * H + 30_000, 9 * H, 30 * H]);
ok(hashOf([ragged.end.produced, ragged.end.released, ragged.end.observations]) === hashOf([orange.end.produced, orange.end.released, orange.end.observations]),
  'firing: hourly = ragged intervals (lot, gases, crack draws, observations)');
ok(orange.results.flatMap((r) => r.energy).reduce((s, e) => s + e.usedJ, 0) === ragged.results.flatMap((r) => r.energy).reduce((s, e) => s + e.usedJ, 0), 'firing: integer J identical across chunkings');
{
  let cracked = 0;
  for (let s = 1; s <= 20; s++) if ((fire('run:fast', plan(2, 2, 30, 1), steps(24, 1), s).end.produced[0].quality!.crack ?? 0) > 0) cracked++;
  let natural = 0;
  for (let s = 1; s <= 20; s++) if ((fire('run:nat', plan(1, 2, 30, 0), steps(24, 1), s).end.produced[0].quality!.crack ?? 0) > 0) natural++;
  ok(cracked > 0 && natural === 0, 'opening the kiln to cool fast cracks tiles through the quartz inversion; natural cooling does not', `forced ${cracked}/20, natural ${natural}/20`);
}
const organic = run(PROC.fire, 'run:org', [{ ...DRY, quality: { ...DRY.quality, xd_organic_c_ppm: 20_000 } }], [KILN], [0, H], { energy: heat, actions: plan(1, 2, 30) });
ok(organic.end.status === 'failed', 'a body with organic matter is refused until O2 intake can be recorded (0.2.0 drawn)');
const noPlan = run(PROC.fire, 'run:np', [DRY], [KILN], [0, H], { energy: heat });
ok(noPlan.end.status === 'failed', 'firing without a plan from the resident is refused');

console.log('3. weigh → soak 24 h → weigh → the resident computes absorption');
const soak = (lot: LotView, id: string) => run(PROC.soak, id, [lot, { lotId: `lot:water-${id}`, materialId: 'process_water', amount: { value: 500_000, unit: 'mg' }, location: 'site:basin' }], [BASIN], steps(4, 6), { actions: takeOut });
const absorption = (fired: ScienceStepResult, id: string) => {
  const lot = asLot(fired, `lot:${id}`);
  const m0 = weigh(lot, `run:w0-${id}`);
  const s = soak(lot, `run:soak-${id}`);
  const m1 = weigh(asLot(s.end, `lot:${id}-wet`), `run:w1-${id}`);
  return { m0, m1, a: summarizeMeasurements({ firedMassG: m0 / 1000, saturatedMassG: m1 / 1000 }).absorptionDryBasisPct as number, s };
};
const aO = absorption(orange.end, 'orange'), aD = absorption(dull.end, 'dull');
ok(aO.a < aD.a, 'measured absorption: orange-fired < dull-red-fired', `${aO.a.toFixed(1)}% < ${aD.a.toFixed(1)}% (from balance readings ${aO.m0}→${aO.m1} mg, ${aD.m0}→${aD.m1} mg)`);
ok(sum(aO.s.end.consumed) === sum(aO.s.end.produced) && aO.s.end.produced.length === 2, 'soak: tile + water in = soaked tile + remaining water out');
const slaked = soak(DRY, 'unfired');
ok(slaked.end.produced[0].materialId === 'clay_slurry_test' && slaked.end.observations[0].text === '水の中で形が崩れ、泥に戻った', 'an unfired tile collapses into slurry in water');
ok([orange, dull, aO.s, slaked].every((r) => r.end.observations.every((o) => o.value === undefined)), 'firing and soaking give no numbers; only the balance does');

console.log('4. contract checker');
ok(violations.length === 0, 'validateResult found no violation anywhere in the chain', violations.slice(0, 3).join(' / '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
