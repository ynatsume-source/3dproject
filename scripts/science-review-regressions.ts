// Regression checks for Codex's review findings R1–R5, T1, T2 (codex/civilization-lab@1d5e846,
// CODEX_LIME_REVIEW.md and CODEX_TILE_CHAIN_REVIEW.md). Inputs are the reviewer's own repro inputs.
//   npx tsx scripts/science-review-regressions.ts

import type { ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { lotComp, tileComp } from '../src/science/step/common';
import { addComp, elementMoles } from '../src/science/chem';
import { CALCINE_PROCESS, HYDRATE_PROCESS } from '../src/science/step/lime';
import { FIRING_PROCESS } from '../src/science/step/firing';
import { SOAK_PROCESS } from '../src/science/step/soak';
import { WOOD_FIRE_PROCESS } from '../src/science/step/wood-fire';
import { DRYING_PROCESS } from '../src/science/step/drying';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const CALC: ScienceStepRequest = {
  contract: '0.1.0', requestId: 'r0', world: W, runId: 'run:review', processId: CALCINE_PROCESS.processId, processVersion: CALCINE_PROCESS.processVersion,
  catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 30000 }, state: null,
  environment: { sampleId: 'env:review', source: 'simulation', effectiveAt: 0, airTempC: 25 },
  lots: [{ lotId: 'lot:feed', materialId: 'calcium_carbonate_feed', amount: { value: 100000, unit: 'mg' }, location: 'site:review', quality: { x_calcite_ppm: 950000 } }],
  equipment: [{ equipmentId: 'eq:calciner', kind: 'fixture_calciner', catalogEntry: 'fixture_calciner', catalogVersion: 'civ-sci-test-2', condition: 1,
    params: { setpointC: 900, holdS: 7200, heatCapJPerK: 15000, uaWPerK: 2, maxPowerW: 4000 } }],
  energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: 120000 }], actions: [], seed: 1,
};
const FIRE: ScienceStepRequest = {
  contract: '0.1.0', requestId: 'r', world: W, runId: 'run:fire', processId: FIRING_PROCESS.processId, processVersion: FIRING_PROCESS.processVersion, catalogVersion: 'civ-sci-test-2',
  state: null, interval: { from: 0, to: 30000 }, environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0, airTempC: 28, humidity: 0.72, windMs: 3 },
  lots: [{ lotId: 'lot:dry', materialId: 'test_tile_dry', amount: { value: 37047, unit: 'mg' }, location: 'site:review',
    quality: { water_ppm: 20434, thickness_mm: 10, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 } }],
  equipment: [{ equipmentId: 'eq:kiln', kind: 'fixture_kiln', catalogEntry: 'fixture_kiln', catalogVersion: 'civ-sci-test-2', condition: 1,
    params: { heatCapJPerK: 40000, uaWPerK: 8, maxPowerW: 15000, forcedCoolingUaFactor: 5 } }],
  energy: [{ sourceId: 'src:heat', kind: 'heat', maxJ: 450000 }], actions: [{ at: 0, residentId: 'res:review', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } }], seed: 7,
};
const violations: string[] = [];
function chain(base: ScienceStepRequest, bounds: number[], powerW: number, env?: (i: number) => ScienceStepRequest['environment'], stopLast = false) {
  let state: ScienceStepRequest['state'] = null, used = 0, last: ScienceStepResult | undefined;
  for (let i = 1; i < bounds.length; i++) {
    const req = { ...base, state, requestId: `r${i}`, interval: { from: bounds[i - 1], to: bounds[i] }, actions: i === 1 ? base.actions : [],
      environment: env?.(i) ?? base.environment, energy: base.energy.length ? [{ ...base.energy[0], maxJ: Math.floor(powerW * (bounds[i] - bounds[i - 1]) / 1000) }] : [],
      ...(stopLast && i === bounds.length - 1 ? { stop: 'operator' as const } : {}) };
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
const hyd = (waterMg: number, q: Record<string, number> = { x_lime_ppm: 1000000 }): ScienceStepRequest => ({ ...CALC, processId: HYDRATE_PROCESS.processId, processVersion: HYDRATE_PROCESS.processVersion, interval: { from: 0, to: 12 * 3600000 }, energy: [],
  lots: [{ lotId: 'lot:lime', materialId: 'quicklime', amount: { value: 56080, unit: 'mg' }, location: 'site:review', quality: q },
    { lotId: 'lot:water', materialId: 'process_water', amount: { value: waterMg, unit: 'mg' }, location: 'site:review' }],
  equipment: [{ equipmentId: 'eq:tub', kind: 'fixture_slaking_tub', catalogEntry: 'fixture_slaking_tub', catalogVersion: 'civ-sci-test-2', condition: 1, params: { heatCapJPerK: 400, uaWPerK: 1.5 } }] });
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
const soakReq = (tile: ScienceStepRequest['lots'][0], hours: number, runId: string, start = 0): ScienceStepRequest => ({ ...FIRE, processId: SOAK_PROCESS.processId, processVersion: SOAK_PROCESS.processVersion, runId,
  interval: { from: start, to: start + hours * 3600000 }, actions: [], stop: 'operator', energy: [],
  lots: [tile, { lotId: 'lot:water', materialId: 'process_water', amount: { value: 500000, unit: 'mg' }, location: 'site:review' }],
  equipment: [{ equipmentId: 'eq:basin', kind: 'fixture_soak_basin', catalogEntry: 'fixture_soak_basin', catalogVersion: 'civ-sci-test-2', condition: 1 }] });
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

console.log('F1  the offer arrives evenly over its interval: a long request cannot spend it early');
{
  const day = 24 * 3600_000;
  const runs = (base: ScienceStepRequest, w: number) => [[0, day], seconds(24, 3600_000), seconds(2880, 30_000)].map((b) => chain(base, b, w, undefined, true));
  const [c1, c2, c3] = runs(CALC, 600);
  const pr = (r: { last: ScienceStepResult }) => JSON.stringify([r.last.status, r.last.produced, r.last.released]);
  ok(c1.used === c2.used && c2.used === c3.used && pr(c1) === pr(c2) && pr(c2) === pr(c3), 'calciner at 600 W for 24 h: one request = hourly = 30 s requests',
    `${c1.used} J, ${c1.last.status}, ${c1.last.produced[0]?.amount.value} mg quicklime lot, CO2 ${c1.last.released[0]?.amount.value ?? 0} mg (was: one request fully calcined, split almost none)`);
  const [k1, k2, k3] = runs(FIRE, 1000);
  ok(k1.used === k2.used && k2.used === k3.used && pr(k1) === pr(k2) && pr(k2) === pr(k3), 'kiln at 1000 W for 24 h: same product and J for every split',
    `${k1.last.produced[0]?.materialId} ${k1.last.produced[0]?.amount.value} mg, ${k1.used} J (was: fired when one request, dry when split)`);
}

console.log('F2  integration accuracy: 30 s-aligned requests are exact; other splits stay within a measured tolerance');
{
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  const hydW = (w: number) => ({ ...hyd(w), interval: { from: 0, to: 0 } });
  const total = 12 * 3600_000;
  const chunked = (base: ScienceStepRequest, ms: number, end: number, w = 0) => chain(base, Array.from({ length: Math.ceil(end / ms) + 1 }, (_, i) => Math.min(end, i * ms)), w);
  // slaking, the reviewer's case: 15000 mg water (water-limited, boiling)
  const h5 = chunked(hydW(15000), 5_000, total), h1 = chunked(hydW(15000), 1_000, total), hx = chunked(hydW(15000), 737, total);
  ok(h5.used === h1.used && JSON.stringify(h5.last.produced) === JSON.stringify(h1.last.produced), 'slaking: 5 s and 1 s requests are identical (both on the grid)', `${h5.used} J (was 47281 vs 45845 J)`);
  ok(rel(hx.used, h1.used) < 0.001 && rel(hx.last.produced[0].amount.value, h1.last.produced[0].amount.value) < 0.001, 'slaking: 0.737 s requests within 0.1% (J and product)',
    `${hx.used} vs ${h1.used} J`);
  const table: string[] = [];
  const offGrid = (name: string, base: ScienceStepRequest, end: number, w: number, tol: number) => {
    const a = chunked(base, 30_000, end, w), b = chunked(base, 7_300, end, w);
    const dJ = rel(b.used, a.used), dM = rel(b.last.produced[0]?.amount.value ?? 0, a.last.produced[0]?.amount.value ?? 0);
    table.push(`${name} ${(dJ * 100).toFixed(3)}% J / ${(dM * 100).toFixed(3)}% mass`);
    ok(dJ <= tol && dM <= tol, `${name}: 7.3 s requests vs 30 s within ${(tol * 100).toFixed(1)}%`, `${(dJ * 100).toFixed(3)}% J, ${(dM * 100).toFixed(3)}% mass`);
  };
  offGrid('calcination 4 kW', { ...CALC, interval: { from: 0, to: 0 } }, 24 * 3600_000, 4000, 0.005);
  offGrid('firing 15 kW', { ...FIRE, interval: { from: 0, to: 0 } }, 24 * 3600_000, 15000, 0.005);
  console.log('      off-grid summary:', table.join(' | '));
}

console.log('F3  states saved by an older version are refused explicitly, not misread');
{
  const old = (req: ScienceStepRequest, schema: string) => scienceStep({ ...req, state: { schema, data: { lastTo: 0 } } });
  const DRY: ScienceStepRequest = { ...FIRE, processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, actions: [], energy: [],
    lots: [{ ...FIRE.lots[0], materialId: 'test_tile_green', quality: { ...FIRE.lots[0].quality, water_ppm: 200000, width_mm: 40, length_mm: 60 } }],
    equipment: [{ equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-2', condition: 1 }] };
  // drying is at /3 since 0.3.0 (wind read as the weather's 10 m wind); its /1 and /2 states are both refused
  const all = [['drying', DRY, 'civ-sci.drying', 3], ['firing', FIRE, 'civ-sci.tile-fire', 2], ['soak', soakReq(FIRE.lots[0], 1, 'run:soak-schema'), 'civ-sci.tile-soak', 2],
    ['calcination', CALC, 'civ-sci.lime-calcine', 2], ['slaking', hyd(60000), 'civ-sci.lime-hydrate', 2]] as const;
  for (const [name, req, base, cur] of all) {
    const fresh = scienceStep({ ...(req as ScienceStepRequest), stop: undefined, interval: { from: 0, to: 30000 } });
    ok(fresh.status !== 'failed' && fresh.state?.schema === `${base}/${cur}`, `${name}: a new run saves state schema ${base}/${cur}`, `${fresh.status} ${fresh.state?.schema} ${fresh.evidence.notes ?? ''}`);
    for (let v = 1; v < cur; v++) {
      const r = old(req as ScienceStepRequest, `${base}/${v}`);
      ok(r.status === 'failed' && r.consumed.length === 0 && String(r.evidence.notes).startsWith('unsupported-state-schema'), `${name}: an /${v} state is refused as unsupported-state-schema`);
    }
  }
  ok(FIRE.processVersion === '0.2.0' && CALC.processVersion === '0.2.0' && DRYING_PROCESS.processVersion === '0.3.0', 'process versions: 0.2.0 with state /2, drying 0.3.0 with /3');
  ok(scienceStep({ ...DRY, processVersion: '0.2.0' }).status === 'failed', 'a drying request for 0.2.0 is refused');
  ok(scienceStep({ ...CALC, processVersion: '0.1.0' }).status === 'failed', 'a request for the old process version 0.1.0 is refused');
}

console.log('G   the 30 s grid starts at the run start (not at world-clock zero)');
{
  const S = 1000, H = 3600_000, rel = Array.from({ length: 121 }, (_, i) => S + i * 30_000);
  for (const [name, base, w] of [['calciner 4 kW', CALC, 4000], ['kiln 15 kW', FIRE, 15000]] as const) {
    const once = chain(base as ScienceStepRequest, [S, S + H], w), split = chain(base as ScienceStepRequest, rel, w);
    ok(once.used === split.used && JSON.stringify(once.last.state.data) === JSON.stringify(split.last.state.data),
      `${name}: a run starting at 1000 ms, cut every 30 s from its start = one request (identical)`, `${once.used} J`);
  }
}

console.log('W   review of 3839fac (lab 7d671ea): wood firing, refusals in 0.2.x, shaping make-up');
{
  const TILE_D = { lotId: 'lot:tile', materialId: 'test_tile_dry', amount: { value: 37_037, unit: 'mg' as const }, location: 'site:hearth',
    quality: { water_ppm: 20_169, thickness_mm: 10, width_mm: 50, length_mm: 50, xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 300_000, xd_calcite_ppm: 20_000, crack: 0, history_complete: 1 } };
  const WOOD = { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 60_000_000, unit: 'mg' as const }, location: 'site:woodpile', quality: { water_ppm: 150_000 } };
  const WKILN = { equipmentId: 'eq:wk', kind: 'fixture_wood_kiln', catalogEntry: 'fixture_wood_kiln', catalogVersion: 'civ-sci-test-2', condition: 1,
    params: { heatCapJPerK: 40_000, uaWPerK: 8, chamberFraction: 0.3, maxBurnKgPerH: 15, forcedCoolingUaFactor: 5 } };
  const WF: ScienceStepRequest = { contract: '0.2.0', requestId: 'wf', world: W, runId: 'run:wf', processId: WOOD_FIRE_PROCESS.processId, processVersion: WOOD_FIRE_PROCESS.processVersion,
    catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 3_600_000 }, state: null,
    environment: { sampleId: 'env:wf', source: 'live', effectiveAt: 0, airTempC: 28, humidity: 0.7, windMs: 3 }, lots: [TILE_D, WOOD], equipment: [WKILN], energy: [],
    actions: [{ at: 0, residentId: 'res:dot', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } }], seed: 3 };
  const drawnOf = (r: ScienceStepResult) => (r as ScienceStepResult & { drawn?: { amount: { value: number } }[] }).drawn;
  const checked = (req: ScienceStepRequest) => { const r = scienceStep(req); violations.push(...validateResult(req, r).map((v) => `${req.processId}: ${v}`)); return r; };

  // W1: the hearth lost before the first request
  let w1: ScienceStepResult | undefined, threw = '';
  try { w1 = checked({ ...WF, stop: 'equipment-lost', equipment: [] }); } catch (e) { threw = String(e); }
  ok(!threw && w1?.status === 'failed' && /lost before the fire was lit/.test(String(w1.evidence.notes)) && w1.consumed.length === 0,
    'W1: equipment lost before the first request → a plain refusal (nothing burned), no exception', threw || String(w1?.evidence.notes));
  const firsts: [string, ScienceStepRequest][] = [['drying', { ...FIRE, processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, actions: [],
      lots: [{ ...FIRE.lots[0], materialId: 'test_tile_green', quality: { ...FIRE.lots[0].quality, water_ppm: 200_000, width_mm: 50, length_mm: 50 } }], energy: [] }],
    ['firing', FIRE], ['calcination', CALC], ['slaking', hyd(60_000)], ['soak', soakReq(FIRE.lots[0], 1, 'run:w1-soak')]];
  for (const [name, req] of firsts) {
    let err = '';
    try { checked({ ...req, stop: 'equipment-lost', equipment: [] }); } catch (e) { err = String(e); }
    ok(!err, `W1: ${name}, equipment lost on the first request: no exception`, err);
  }

  // W2: refusals of a 0.2.x request carry drawn: [] and echo the contract, through the single entry
  const v02 = (o: Partial<ScienceStepRequest>) => ({ ...FIRE, contract: '0.2.0', ...o } as ScienceStepRequest);
  for (const [name, req] of [['drying', v02({ processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion })],
    ['weighing', v02({ processId: 'fixture_mass_measure', processVersion: 'fixture-2' })], ['calcination', { ...CALC, contract: '0.2.0' }],
    ['firing', v02({})], ['soak', { ...soakReq(FIRE.lots[0], 1, 'run:w2'), contract: '0.2.0' }], ['unknown process', v02({ processId: 'p99_nothing' })]] as const) {
    const r = scienceStep(req);
    ok(r.status === 'failed' && r.contract === '0.2.0' && Array.isArray(drawnOf(r)) && validateResult(req, r).length === 0,
      `W2: ${name} refuses a 0.2.0 request in the 0.2.0 shape (contract echoed, drawn: [])`, validateResult(req, r).join(' / '));
  }
  const r01 = scienceStep({ ...FIRE, processId: 'p99_nothing' });
  ok(drawnOf(r01) === undefined && validateResult({ ...FIRE, processId: 'p99_nothing' }, r01).length === 0, 'W2: a 0.1.0 refusal carries no drawn');

  // W3: a stop after a fraction of a mg: heat is never reported for wood that is handed back
  const tiny = checked({ ...WF, interval: { from: 0, to: 1 }, stop: 'operator' });
  const back = tiny.produced.filter((p) => p.materialId === 'firewood').reduce((x, p) => x + p.amount.value, 0);
  const burned = WOOD.amount.value - back, J = tiny.energy.reduce((x, e) => x + e.usedJ, 0);
  const lhv = (0.85 * 0.99 * 18e6 - 0.15 * 2.43e6) / 1e6; // J per mg as burned
  ok(burned >= 1 && J <= burned * lhv && (drawnOf(tiny)?.length ?? 0) === 1, 'W3: stopped after 1 ms: 1 mg of wood is settled as burned (with its O2), the heat reported is within it',
    `${burned} mg settled, ${J} J ≤ ${(burned * lhv).toFixed(1)} J (was: 0 mg settled, 7 J)`);
  let free = 0;
  for (let i = 0; i < 20; i++) {
    const r = checked({ ...WF, requestId: `w3-${i}`, runId: `run:w3-${i}`, interval: { from: 0, to: 1 }, stop: 'operator' });
    const b = WOOD.amount.value - r.produced.filter((p) => p.materialId === 'firewood').reduce((x, p) => x + p.amount.value, 0);
    free += r.energy.reduce((x, e) => x + e.usedJ, 0) - b * lhv;
  }
  ok(free <= 0, 'W3: twenty 1 ms runs on the same wood never report more heat than the wood they used up', `${free.toFixed(1)} J beyond the settled wood`);

  // W3a (lab b8bf6ec): each part of the wood is settled by itself; heat only with dry wood that is used up,
  // also when the wood handed back is burned again in the next run
  const wetLot = (q: Record<string, number>, mg = 1000) => ({ ...WOOD, amount: { value: mg, unit: 'mg' as const }, quality: q });
  const half = checked({ ...WF, interval: { from: 0, to: 1 }, stop: 'operator', lots: [TILE_D, wetLot({ water_ppm: 500_000, ash_dry_ppm: 0 })] });
  const halfBack = half.produced.find((p) => p.materialId === 'firewood')!;
  const halfJ = half.energy.reduce((x, e) => x + e.usedJ, 0);
  const backDry = halfBack.amount.value * (1 - halfBack.quality!.water_ppm / 1e6);
  ok(halfJ > 0 && backDry <= 499 + 1e-6 && (drawnOf(half)?.[0]?.amount.value ?? 0) >= 1,
    'W3a: half-water wood stopped after 1 ms: heat only with dry wood used up (and its O2)', `${halfJ} J, dry wood back ${backDry.toFixed(3)} mg of 500`);
  const LOW = { ...WKILN, params: { ...WKILN.params, maxBurnKgPerH: 1 } };
  let lot = wetLot({ water_ppm: 600_000, ash_dry_ppm: 0 }), J20 = 0, O2 = 0, dryUsed = 0;
  for (let i = 0; i < 20; i++) {
    const dry0 = lot.amount.value * (1 - lot.quality.water_ppm / 1e6);
    const r = checked({ ...WF, requestId: `w3a-${i}`, runId: `run:w3a-${i}`, interval: { from: i, to: i + 1 }, stop: 'operator', equipment: [LOW], lots: [TILE_D, lot],
      actions: [{ ...WF.actions[0], at: i }] });
    const back = r.produced.find((p) => p.materialId === 'firewood');
    if (!back) { ok(false, `W3a: run ${i} handed wood back`, `${r.status} ${r.evidence.notes}`); break; }
    lot = { ...lot, amount: back.amount as { value: number; unit: 'mg' }, quality: back.quality as Record<string, number> };
    dryUsed += dry0 - back.amount.value * (1 - back.quality!.water_ppm / 1e6);
    J20 += r.energy.reduce((x, e) => x + e.usedJ, 0); O2 += drawnOf(r)?.reduce((x, d) => x + d.amount.value, 0) ?? 0;
  }
  ok(J20 <= dryUsed * 18 + 1e-6 && (J20 === 0 || O2 > 0), 'W3a: twenty 1 ms runs, each burning the wood the last one handed back: heat ≤ dry wood used × 18 J/mg, never heat without O2',
    `${J20} J from ${dryUsed.toFixed(3)} mg of dry wood, O2 ${O2} mg (was 20 J, no dry wood, no O2)`);
  ok(Math.abs(lot.amount.value * (1 - lot.quality.water_ppm / 1e6) - Math.round(lot.amount.value * (1 - lot.quality.water_ppm / 1e6))) < 1e-6,
    'W3a: the handed-back lot reads back to whole mg of dry wood (fractions kept unrounded)');

  // W4: shaping copies only a valid dry make-up
  const SH: ScienceStepRequest = { ...FIRE, contract: '0.1.0', processId: 'p11x_test_tile_shape', processVersion: 'fixture-2', runId: 'run:w4',
    environment: { sampleId: 'env:w4', source: 'simulation', effectiveAt: 0 }, actions: [], interval: { from: 0, to: 60_000 },
    lots: [{ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 45_000, unit: 'mg' }, location: 'site:bench',
      quality: { water_ppm: 193_548, xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 300_000, xd_calcite_ppm: 20_000 } }],
    equipment: [{ equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 } }],
    energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 120 }] };
  const shape = (q: Record<string, number>) => checked({ ...SH, lots: [{ ...SH.lots[0], quality: { water_ppm: 193_548, ...q } }] });
  ok(shape({ xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 300_000, xd_calcite_ppm: 20_000 }).status === 'completed', 'W4: a valid make-up still shapes');
  for (const [name, q, code] of [['a negative ppm', { xd_kaolinite_ppm: 450_000, xd_quartz_ppm: -1 }, 'clay-make-up-not-whole-ppm'],
    ['137% of the dry part', { xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 900_000, xd_calcite_ppm: 20_000 }, 'clay-make-up-exceeds-dry-part'],
    ['an unknown species', { xd_kaolinite_ppm: 450_000, xd_unknown_ppm: 1 }, 'clay-make-up-unknown-species'],
    ['a fractional ppm', { xd_kaolinite_ppm: 450_000.5 }, 'clay-make-up-not-whole-ppm']] as const) {
    const r = shape(q as Record<string, number>);
    ok(r.status === 'failed' && (r.diagnostics as { code: string }).code === code && r.consumed.length + r.produced.length + r.energy.length === 0,
      `W4: ${name} is refused (${code}), nothing consumed, no heat`, String((r.diagnostics as { code?: string })?.code));
  }

  // W3b (lab 5ee1bc4): whatever wood this step hands back, the next run reads it (no range check refuses it);
  // wood that cannot give net heat simply does not catch
  const oneMs = (lt: typeof WOOD, i: number, eq = WKILN) => checked({ ...WF, requestId: `w3b-${i}`, runId: `run:w3b-${i}`, interval: { from: i, to: i + 1 },
    stop: 'operator', equipment: [eq], lots: [TILE_D, lt], actions: [{ ...WF.actions[0], at: i }] });
  const handBack = (r: ScienceStepResult, lt: typeof WOOD) => {
    const b = r.produced.find((p) => p.materialId === 'firewood');
    return b ? { ...lt, amount: b.amount as { value: number; unit: 'mg' }, quality: b.quality as Record<string, number> } : null;
  };
  {
    const wet = { ...WOOD, amount: { value: 1_000_000, unit: 'mg' as const }, quality: { water_ppm: 800_000, ash_dry_ppm: 10_000 } };
    const back = handBack(oneMs(wet, 0), wet)!;
    const next = oneMs(back, 1);
    ok(back.quality.water_ppm > 800_000 && next.status !== 'failed', 'W3b: 80% water wood, stopped after 1 ms, hands back wetter wood that the next run reads',
      `water_ppm ${back.quality.water_ppm.toFixed(4)} → next run ${next.status}`);
    const ashy = { ...WOOD, amount: { value: 8, unit: 'mg' as const }, quality: { water_ppm: 0, ash_dry_ppm: 200_000 } };
    const r5 = checked({ ...WF, requestId: 'w3b-ash', runId: 'run:w3b-ash', interval: { from: 0, to: 5 }, stop: 'operator', lots: [TILE_D, ashy] });
    const ashBack = handBack(r5, ashy);
    ok(!ashBack || oneMs(ashBack, 6).status !== 'failed', 'W3b: 8 mg of 20% ash wood stopped after 5 ms: the ashier wood handed back is read by the next run',
      ashBack ? `ash_dry_ppm ${ashBack.quality.ash_dry_ppm.toFixed(0)}` : 'nothing handed back');
    const LOWB = { ...WKILN, params: { ...WKILN.params, maxBurnKgPerH: 1 } };
    let lt: typeof WOOD | null = { ...WOOD, amount: { value: 1000, unit: 'mg' as const }, quality: { water_ppm: 600_000, ash_dry_ppm: 0 } }, refused = 0, runs = 0, heatNoDry = 0;
    while (lt && runs < 1200) {
      const dry0 = lt.amount.value * (1 - lt.quality.water_ppm / 1e6);
      const r = oneMs(lt, runs, LOWB); runs++;
      if (r.status === 'failed') { refused++; break; }
      if ((r.diagnostics as { outcome: string }).outcome === 'wont_burn') { lt = null; break; }
      const nx = handBack(r, lt);
      const dry1 = nx ? nx.amount.value * (1 - nx.quality.water_ppm / 1e6) : 0;
      if (r.energy.reduce((x, e) => x + e.usedJ, 0) > 0 && dry0 - dry1 < 1 - 1e-6) heatNoDry++;
      lt = nx;
    }
    ok(refused === 0 && heatNoDry === 0, 'W3b: a 60% water lot handed back run after run until it is too wet to catch: never refused, never heat without dry wood used up',
      `${runs} runs (was refused at run 335)`);
  }
  {
    const fire = (q: Record<string, number>) => {
      let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
      for (let h = 0; h < 6; h++) {
        r = checked({ ...WF, requestId: `w3b-wb-${h}`, runId: `run:w3b-wb-${JSON.stringify(q)}`, state: st, interval: { from: h * 3_600_000, to: (h + 1) * 3_600_000 },
          lots: [TILE_D, { ...WOOD, quality: q }], actions: h === 0 ? WF.actions : [] });
        st = r.state; if (r.status !== 'running') break;
      }
      return r;
    };
    for (const [name, q] of [['95% water', { water_ppm: 950_000 }], ['all water', { water_ppm: 1_000_000 }], ['all ash', { water_ppm: 0, ash_dry_ppm: 1_000_000 }]] as const) {
      const r = fire(q as Record<string, number>);
      ok(r.status === 'completed' && (r.diagnostics as { outcome: string }).outcome === 'wont_burn' && r.energy.length === 0 && r.produced.find((p) => p.materialId === 'firewood')?.amount.value === WOOD.amount.value
        && r.observations.some((o) => o.text?.includes('火が育たなかった')), `W3b: ${name}: read, but it does not catch (no heat, the wood handed back whole)`);
    }
    for (const [name, q] of [['water above 100%', { water_ppm: 1_000_001 }], ['ash above 100%', { water_ppm: 0, ash_dry_ppm: 1_000_001 }]] as const) {
      ok(scienceStep({ ...WF, lots: [TILE_D, { ...WOOD, quality: q as Record<string, number> }] }).status === 'failed', `W3b: ${name} is refused (not a physical make-up)`);
    }
  }

  {
    const old = scienceStep({ ...WF, state: { schema: 'civ-sci.tile-wood-fire/1', data: { lastTo: 0 } } });
    ok(old.status === 'failed' && /unsupported-state-schema/.test(String(old.evidence.notes)) && Array.isArray(drawnOf(old)),
      'W3b: a run started before 0.1.2 (state /1, heat counted the old way) is refused, never resumed under the new version');
  }

  // A on 451ea82 (lab 793adf5): the end of a run is not a firing. Wood that never caught hands the tile back unfired,
  // and that tile can be fired again with new wood
  {
    let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
    for (let i = 0; i < 20; i++) {
      r = checked({ ...WF, requestId: `a-${i}`, runId: 'run:a-wet', state: st, interval: { from: i * 30_000, to: (i + 1) * 30_000 },
        lots: [TILE_D, { ...WOOD, quality: { water_ppm: 950_000 } }], actions: i === 0 ? WF.actions : [] });
      st = r.state; if (r.status !== 'running') break;
    }
    const back = r.produced.find((p) => p.materialId.startsWith('test_tile'))!;
    ok((r.diagnostics as { outcome: string }).outcome === 'wont_burn' && back.materialId === 'test_tile_dry' && r.energy.length === 0,
      'A: wood that never catches (30 s requests): the tile comes back unfired, as test_tile_dry', `${back.materialId}`);
    const again = { ...TILE_D, lotId: 'lot:tile-again', amount: back.amount as { value: number; unit: 'mg' }, quality: back.quality as typeof TILE_D.quality };
    let st2: ScienceStepRequest['state'] = null, r2!: ScienceStepResult;
    for (let h = 0; h < 48; h++) {
      r2 = checked({ ...WF, requestId: `a2-${h}`, runId: 'run:a-again', state: st2, interval: { from: h * 3_600_000, to: (h + 1) * 3_600_000 },
        lots: [again, WOOD], actions: h === 0 ? WF.actions : [] });
      st2 = r2.state; if (r2.status !== 'running') break;
    }
    ok(r2.status === 'completed' && r2.produced.some((p) => p.materialId === 'test_tile_fired') && (r2.diagnostics as { peakKilnC: number }).peakKilnC > 950,
      'A: the tile handed back, with new dry wood, fires to orange', `${r2.status}, peak ${Math.round((r2.diagnostics as { peakKilnC: number }).peakKilnC)} °C`);
    // the electric test kiln too: a run that ends without heat does not make a fired tile
    let st3: ScienceStepRequest['state'] = null, r3!: ScienceStepResult;
    for (let h = 0; h < 3; h++) {
      r3 = scienceStep({ ...FIRE, requestId: `a3-${h}`, runId: 'run:a-cold', state: st3, interval: { from: h * 3_600_000, to: (h + 1) * 3_600_000 },
        energy: [{ ...FIRE.energy[0], maxJ: 0 }], actions: h === 0 ? FIRE.actions : [], ...(h === 2 ? { stop: 'operator' as const } : {}) });
      st3 = r3.state; if (r3.status !== 'running') break;
    }
    ok(r3.status === 'stopped' && r3.produced.some((p) => p.materialId === 'test_tile_dry') && !r3.produced.some((p) => p.materialId === 'test_tile_fired'), 'A: an electric run with no heat offered, stopped after 3 h: the tile comes back unfired', `${r3.status} ${r3.produced.map((p) => p.materialId).join(',')}`);
  }

  // W4a (lab b8bf6ec): only registered species, never inherited object keys
  for (const key of ['xd_constructor_ppm', 'xd_toString_ppm', 'xd___proto___ppm']) {
    const q = JSON.parse(`{"water_ppm":193548,"xd_kaolinite_ppm":450000,"xd_quartz_ppm":300000,"${key}":1000}`) as Record<string, number>;
    const r = checked({ ...SH, lots: [{ ...SH.lots[0], quality: q }] });
    ok(r.status === 'failed' && (r.diagnostics as { code: string }).code === 'clay-make-up-unknown-species' && r.consumed.length === 0, `W4a: shaping refuses ${key}`);
    const fired = scienceStep({ ...FIRE, lots: [{ ...FIRE.lots[0], quality: { ...FIRE.lots[0].quality, ...q } }] });
    ok(fired.status === 'failed' && /invalid dry-basis species/.test(String(fired.evidence.notes)), `W4a: a tile carrying ${key} is refused by the shared reading (tileComp)`, String(fired.evidence.notes));
  }

  // W5: wood with an incomplete history passes it on to the fired tile
  let st: ScienceStepRequest['state'] = null, last!: ScienceStepResult;
  for (let h = 0; h < 48; h++) {
    last = checked({ ...WF, requestId: `w5-${h}`, runId: 'run:w5', state: st, interval: { from: h * 3_600_000, to: (h + 1) * 3_600_000 },
      lots: [TILE_D, { ...WOOD, quality: { ...WOOD.quality, history_complete: 0 } }], actions: h === 0 ? WF.actions : [] });
    st = last.state; if (last.status !== 'running') break;
  }
  ok(last.produced.find((p) => p.materialId === 'test_tile_fired')?.quality?.history_complete === 0, 'W5: firewood with an incomplete history → the fired tile is marked incomplete too');
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation in the chained runs', violations.slice(0, 3).join(' / '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
