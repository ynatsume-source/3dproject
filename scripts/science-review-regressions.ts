// Regression checks for Codex's review findings R1–R5, T1, T2 (codex/civilization-lab@1d5e846,
// CODEX_LIME_REVIEW.md and CODEX_TILE_CHAIN_REVIEW.md). Inputs are the reviewer's own repro inputs.
//   npx tsx scripts/science-review-regressions.ts

import type { ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { lotComp, tileComp } from '../src/science/step/common';
import { addComp, elementMoles } from '../src/science/chem';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const CALC: ScienceStepRequest = {
  contract: '0.1.0', requestId: 'r0', world: W, runId: 'run:review', processId: 'p20x_lime_calcine_test', processVersion: '0.1.0',
  catalogVersion: 'civ-sci-test-1', interval: { from: 0, to: 30000 }, state: null,
  environment: { sampleId: 'env:review', source: 'simulation', effectiveAt: 0, airTempC: 25 },
  lots: [{ lotId: 'lot:feed', materialId: 'calcium_carbonate_feed', amount: { value: 100000, unit: 'mg' }, location: 'site:review', quality: { x_calcite_ppm: 950000 } }],
  equipment: [{ equipmentId: 'eq:calciner', kind: 'fixture_calciner', catalogEntry: 'fixture_calciner', catalogVersion: 'civ-sci-test-1', condition: 1,
    params: { setpointC: 900, holdS: 7200, heatCapJPerK: 15000, uaWPerK: 2, maxPowerW: 4000 } }],
  energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: 120000 }], actions: [], seed: 1,
};
const FIRE: ScienceStepRequest = {
  contract: '0.1.0', requestId: 'r', world: W, runId: 'run:fire', processId: 'p13x_test_tile_fire', processVersion: '0.1.0', catalogVersion: 'civ-sci-test-1',
  state: null, interval: { from: 0, to: 30000 }, environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0, airTempC: 28, humidity: 0.72, windMs: 3 },
  lots: [{ lotId: 'lot:dry', materialId: 'test_tile_dry', amount: { value: 37047, unit: 'mg' }, location: 'site:review',
    quality: { water_ppm: 20434, thickness_mm: 10, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 } }],
  equipment: [{ equipmentId: 'eq:kiln', kind: 'fixture_kiln', catalogEntry: 'fixture_kiln', catalogVersion: 'civ-sci-test-1', condition: 1,
    params: { heatCapJPerK: 40000, uaWPerK: 8, maxPowerW: 15000, forcedCoolingUaFactor: 5 } }],
  energy: [{ sourceId: 'src:heat', kind: 'heat', maxJ: 450000 }], actions: [{ at: 0, residentId: 'res:review', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } }], seed: 7,
};
const violations: string[] = [];
function chain(base: ScienceStepRequest, bounds: number[], powerW: number, env?: (i: number) => ScienceStepRequest['environment']) {
  let state: ScienceStepRequest['state'] = null, used = 0, last: ScienceStepResult | undefined;
  for (let i = 1; i < bounds.length; i++) {
    const req = { ...base, state, requestId: `r${i}`, interval: { from: bounds[i - 1], to: bounds[i] }, actions: i === 1 ? base.actions : [],
      environment: env?.(i) ?? base.environment, energy: [{ ...base.energy[0], maxJ: Math.floor(powerW * (bounds[i] - bounds[i - 1]) / 1000) }] };
    last = scienceStep(req); state = last.state; used += last.energy.reduce((s, e) => s + e.usedJ, 0);
    violations.push(...validateResult(req, last));
    if (last.status !== 'running') break;
  }
  return { used, last: last!, data: last!.state.data as Record<string, number> };
}
const seconds = (n: number, ms = 1000) => Array.from({ length: n + 1 }, (_, i) => i * ms);

console.log('R1  splitting an interval never lets an earlier offer go unused or a later one stretch');
{
  const a = chain(CALC, [0, 30000], 4000), b = chain(CALC, seconds(30), 4000), c = chain(CALC, [0, 29000, 30000], 4000);
  ok(Math.abs(a.used - b.used) <= 1 && Math.abs(a.used - c.used) <= 1, 'calciner: 30 s once = 1 s × 30 = 29 s + 1 s (used J)', `${a.used} / ${b.used} / ${c.used} J (was 120000 / 4000 / 4000)`);
  ok(Math.abs(a.data.chamberC - b.data.chamberC) < 0.05 && Math.abs(a.data.chamberC - c.data.chamberC) < 0.05, 'calciner: same chamber temperature within the discretisation tolerance',
    `${a.data.chamberC.toFixed(4)} / ${b.data.chamberC.toFixed(4)} / ${c.data.chamberC.toFixed(4)} °C`);
  const fa = chain(FIRE, [0, 30000], 15000), fb = chain(FIRE, seconds(30), 15000);
  ok(Math.abs(fa.used - fb.used) <= 1 && Math.abs(fa.data.kilnC - fb.data.kilnC) < 0.05, 'kiln: 30 s once = 1 s × 30', `${fa.used} / ${fb.used} J, ${fa.data.kilnC.toFixed(4)} / ${fb.data.kilnC.toFixed(4)} °C (was 66667 / 15000 J)`);
  const g1 = chain(CALC, seconds(48, 1800_000), 4000), g2 = chain(CALC, seconds(1440, 60_000), 4000);
  ok(g1.used === g2.used && JSON.stringify(g1.last.produced) === JSON.stringify(g2.last.produced), 'a whole calcination: 30-min chunks = 1-min chunks (on the 30 s grid: identical)', `${g1.used} J`);
  const weak = chain(CALC, seconds(120, 1000), 300);
  ok(violations.every((v) => !v.includes('> offered')) && weak.used <= 300 * 120, 'a weak offer split per second is never exceeded', `${weak.used} J ≤ ${300 * 120} J`);
  const sw = chain(CALC, [0, 10000, 17000, 30000], 4000, (i) => ({ ...CALC.environment, airTempC: i === 2 ? 5 : 25 }));
  ok(sw.last.status === 'running' && sw.used > 0, 'weather can switch mid-step: each part uses its own interval');
}

console.log('R2  water-limited slaking settles without an exception');
const hyd = (waterMg: number, q: Record<string, number> = { x_lime_ppm: 1000000 }): ScienceStepRequest => ({ ...CALC, processId: 'p21x_lime_hydrate_test', interval: { from: 0, to: 12 * 3600000 }, energy: [],
  lots: [{ lotId: 'lot:lime', materialId: 'quicklime', amount: { value: 56080, unit: 'mg' }, location: 'site:review', quality: q },
    { lotId: 'lot:water', materialId: 'process_water', amount: { value: waterMg, unit: 'mg' }, location: 'site:review' }],
  equipment: [{ equipmentId: 'eq:tub', kind: 'fixture_slaking_tub', catalogEntry: 'fixture_slaking_tub', catalogVersion: 'civ-sci-test-1', condition: 1, params: { heatCapJPerK: 400, uaWPerK: 1.5 } }] });
for (const w of [9000, 10000, 12000, 15000, 18015, 20000]) {
  let r: ScienceStepResult | null = null, err = '';
  try { r = scienceStep(hyd(w)); } catch (e) { err = (e as Error).message; }
  if (!r) { ok(false, `water ${w} mg`, err); continue; }
  const v = validateResult(hyd(w), r);
  const before = addComp(lotComp(hyd(w).lots[0]), { water: w });
  const vap = r.released.find((x) => x.materialId === 'water_vapour')?.amount.value ?? 0;
  const after = addComp(lotComp({ ...r.produced[0], lotId: 'x', location: 'x' }), { water: vap });
  const eb = elementMoles(before), ea = elementMoles(after);
  const worst = Math.max(...(['H', 'O', 'Ca'] as const).map((k) => Math.abs(eb[k] - ea[k]) * 1000));
  ok(r.status === 'completed' && v.length === 0 && worst < 0.1, `water ${w} mg: completed, valid, elements balance`,
    `conversion ${((r.diagnostics as { conversion: number }).conversion * 100).toFixed(1)}%, max Δ ${worst.toFixed(3)} mmol`);
}
{
  const bad: string[] = [];
  for (let w = 1000; w <= 50000; w += 101) {
    try { const r = scienceStep(hyd(w)); if (r.status !== 'completed' || validateResult(hyd(w), r).length) bad.push(`${w}`); lotComp({ ...r.produced[0], lotId: 'x', location: 'x' }); }
    catch (e) { bad.push(`${w}:${(e as Error).message}`); }
  }
  ok(bad.length === 0, 'sweep 1000–50000 mg water (step 101): no exception, all valid', bad.slice(0, 3).join(' '));
}

console.log('R3  zero / non-finite equipment values are refused');
const zc = scienceStep({ ...CALC, equipment: [{ ...CALC.equipment[0], params: { ...CALC.equipment[0].params, heatCapJPerK: 0 } }] });
ok(zc.status === 'failed' && zc.energy.length === 0, 'calciner heatCapJPerK 0 → failed', String(zc.evidence.notes));
const zf = scienceStep({ ...FIRE, equipment: [{ ...FIRE.equipment[0], params: { ...FIRE.equipment[0].params, heatCapJPerK: 0 } }] });
ok(zf.status === 'failed', 'kiln heatCapJPerK 0 → failed', String(zf.evidence.notes));
ok(scienceStep({ ...CALC, equipment: [{ ...CALC.equipment[0], params: { ...CALC.equipment[0].params, uaWPerK: NaN } }] }).status === 'failed', 'calciner NaN loss coefficient → failed');
ok(scienceStep({ ...CALC, energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: Infinity }] }).status === 'failed', 'an infinite offer → failed');
const nanEnv = scienceStep({ ...CALC, environment: { ...CALC.environment, airTempC: NaN } });
ok(nanEnv.status !== 'running' && JSON.stringify(nanEnv.state).indexOf('null') === -1 || nanEnv.status === 'stopped', 'a NaN air temperature is treated as unknown conditions, not integrated', nanEnv.status);

console.log('R4  validateResult rejects NaN times and cancelling energy entries');
{
  const normal = scienceStep(CALC);
  ok(validateResult(CALC, { ...normal, simulated: { from: 0, to: NaN } }).length > 0, 'NaN simulated.to is a violation');
  ok(validateResult(CALC, { ...normal, energy: [{ sourceId: 'src:heater', kind: 'heat', usedJ: 120001, lostJ: 120001, storedJ: 0 }, { sourceId: 'src:heater', kind: 'heat', usedJ: -1, lostJ: -1, storedJ: 0 }] })
    .some((v) => v.includes('negative')), '+120001 J and −1 J against a 120000 J offer is a violation');
  ok(validateResult(CALC, { ...normal, energy: [{ sourceId: 'src:heater', kind: 'heat', usedJ: 100, lostJ: 200, storedJ: -100 }] }).length === 0, 'a negative storedJ (cooling) is still allowed');
}

console.log('R5  an incomplete history is never made complete again');
{
  const r = scienceStep(hyd(60000, { x_lime_ppm: 1000000, history_complete: 0 }));
  ok(r.produced[0].quality!.history_complete === 0, 'slaking keeps history_complete 0 from the quicklime');
  const c = chain({ ...CALC, lots: [{ ...CALC.lots[0], quality: { ...CALC.lots[0].quality, history_complete: 0 } }] }, seconds(24, 3600_000), 4000);
  ok(c.last.produced[0]?.quality!.history_complete === 0, 'calcination keeps history_complete 0 from the feed');
}

console.log('T1  a crack the tile already had is what the resident sees');
const soakReq = (tile: ScienceStepRequest['lots'][0], hours: number, runId: string, start = 0): ScienceStepRequest => ({ ...FIRE, processId: 'm01x_tile_soak_test', runId,
  interval: { from: start, to: start + hours * 3600000 }, actions: [], stop: 'operator', energy: [],
  lots: [tile, { lotId: 'lot:water', materialId: 'process_water', amount: { value: 500000, unit: 'mg' }, location: 'site:review' }],
  equipment: [{ equipmentId: 'eq:basin', kind: 'fixture_soak_basin', catalogEntry: 'fixture_soak_basin', catalogVersion: 'civ-sci-test-1', condition: 1 }] });
{
  const cracked = { ...FIRE, interval: { from: 0, to: 24 * 3600000 }, energy: [{ ...FIRE.energy[0], maxJ: 15000 * 24 * 3600 }], lots: [{ ...FIRE.lots[0], quality: { ...FIRE.lots[0].quality, crack: 2 } }] };
  const r = scienceStep(cracked);
  const t = r.observations.map((o) => o.text).join(' / ');
  ok(r.produced[0].quality!.crack === 2 && t.includes('割れて分かれている') && t.includes('濁ってびりつく音') && !t.includes('ひびは見当たらない'), 'input crack 2 → seen as split, dull rattling tap', t);
  const hair = scienceStep({ ...cracked, lots: [{ ...FIRE.lots[0], quality: { ...FIRE.lots[0].quality, crack: 1 } }] });
  ok(hair.observations.some((o) => o.text === '細いひびが見える'), 'input crack 1 → a fine crack is seen');
}

console.log('T2  re-soaking a damp tile continues the uptake');
{
  const fired = { lotId: 'lot:fired', materialId: 'test_tile_fired', amount: { value: 100000, unit: 'mg' as const }, location: 'site:review', quality: { water_ppm: 0, xd_metakaolin_ppm: 1000000, sinter_ppm: 0, crack: 0 } };
  const asLot = (r: ScienceStepResult, id: string) => ({ ...r.produced[0], lotId: id, location: 'site:review' });
  const h1 = scienceStep(soakReq(fired, 1, 'run:one'));
  const h11 = scienceStep(soakReq(asLot(h1, 'lot:damp'), 1, 'run:two', 3600000));
  const h2 = scienceStep(soakReq(fired, 2, 'run:cont'));
  const w1 = tileComp(asLot(h1, 'a')).water ?? 0, w11 = tileComp(asLot(h11, 'b')).water ?? 0, w2 = tileComp(asLot(h2, 'c')).water ?? 0;
  ok(w11 > w1 && Math.abs(w11 - w2) <= 2, '1 h + 1 h (re-soaked damp) = 2 h continuous, within mg rounding', `${w1} → ${w11} mg vs ${w2} mg (was 5666 / 5666 / 9103)`);
  const sl = scienceStep(soakReq({ ...FIRE.lots[0], quality: { ...FIRE.lots[0].quality, history_complete: 0 } }, 1, 'run:slurry'));
  ok(sl.produced[0].materialId === 'clay_slurry_test' && sl.produced[0].quality!.history_complete === 0, 'R5 (soak): the slurry keeps history_complete 0');
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation in the chained runs', violations.slice(0, 3).join(' / '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
