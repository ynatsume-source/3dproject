// Checks for the lime lineage ScienceSteps (calcination with an offered heat source, hydration with reserved water).
//   npx tsx scripts/science-lime-check.ts
// Every result also goes through validateResult (the contract checker the world side can reuse).

import { SCIENCE_CONTRACT_VERSION, type LotView, type ScienceStepRequest, type ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { lotComp, SCIENCE_CATALOG_VERSION } from '../src/science/step/common';
import { CALCINE_PROCESS, HYDRATE_PROCESS } from '../src/science/step/lime';
import { addComp, elementMoles, type Composition } from '../src/science/chem';
import { PARAMS } from '../src/science/params';
import { hashOf } from '../src/science/fixture/world';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const T0 = Date.UTC(2026, 9, 10, 0, 0, 0);
const H = 3600_000, MIN = 60_000;
const ENV = { sampleId: 'env:fixture', source: 'simulation' as const, effectiveAt: T0, airTempC: 25, humidity: 0.7 };
const violations: string[] = [];
function step(req: ScienceStepRequest): ScienceStepResult {
  const r = scienceStep(req);
  for (const v of validateResult(req, r)) violations.push(`${req.processId}@${req.interval.from}: ${v}`);
  return r;
}

const FEED: LotView = { lotId: 'lot:shell-feed-1', materialId: 'calcium_carbonate_feed', amount: { value: 100_000, unit: 'mg' }, location: 'site:calciner',
  quality: { x_calcite_ppm: 950_000 } }; // 95% calcite, 5% unreactive (assumed test feed, not a real shell analysis)
const CALCINER = (setpointC: number, holdS = 2 * 3600) => ({ equipmentId: 'eq:calciner-1', kind: 'fixture_calciner', catalogEntry: 'fixture_calciner',
  catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { setpointC, holdS, heatCapJPerK: 15_000, uaWPerK: 2, maxPowerW: 4000 } });

function calcine(bounds: number[], o: { setpoint?: number; powerFactor?: number; envAt?: (i: number) => typeof ENV | { sampleId: string; source: 'unknown'; effectiveAt: number } } = {}) {
  let state: ScienceStepRequest['state'] = null;
  const results: ScienceStepResult[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = T0 + bounds[i], to = T0 + bounds[i + 1];
    const r = step({ contract: SCIENCE_CONTRACT_VERSION, requestId: `run:c1@${from}`, world: { worldId: 'civ-sim-test', worldEpoch: 'e1', worldVersion: 1 },
      runId: 'run:c1', processId: CALCINE_PROCESS.processId, processVersion: CALCINE_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION,
      interval: { from, to }, state, environment: (o.envAt?.(i) ?? ENV) as ScienceStepRequest['environment'], lots: [FEED], equipment: [CALCINER(o.setpoint ?? 900)],
      energy: [{ sourceId: 'src:fixture-heater', kind: 'heat', maxJ: Math.floor(4000 * (o.powerFactor ?? 1) * (to - from) / 1000) }], actions: [], seed: 1 });
    results.push(r); state = r.state;
    if (r.status !== 'running') break;
  }
  const end = results[results.length - 1];
  const sum = (k: 'usedJ' | 'lostJ' | 'storedJ') => results.flatMap((r) => r.energy).reduce((s, e) => s + (e[k] ?? 0), 0);
  return { results, end, used: sum('usedJ'), lost: sum('lostJ'), stored: sum('storedJ') };
}
const settle = (r: ScienceStepResult) => hashOf([r.status, r.consumed, r.produced, r.released, r.observations]);
const lotOf = (r: ScienceStepResult, i = 0): LotView => ({ lotId: 'lot:x', materialId: r.produced[i].materialId, amount: r.produced[i].amount, location: 'site:x', quality: r.produced[i].quality });

console.log('1. calcination: CaCO3 → CaO + CO2 with an offered heat source');
const c900 = calcine(Array.from({ length: 25 }, (_, i) => i * H));
const conv900 = c900.end.diagnostics as { conversion: number };
ok(c900.end.status === 'completed', 'the run heats, holds, cools and completes on its own', `${(c900.results.length)} intervals`);
const co2 = c900.end.released.find((x) => x.materialId === 'process_co2')!.amount.value;
const expectCo2 = 95_000 / 100.09 * 44.01 * conv900.conversion;
ok(Math.abs(co2 - expectCo2) <= 2, 'CO2 released matches the stoichiometry of the converted calcite', `${co2} mg (conversion ${(conv900.conversion * 100).toFixed(2)}%)`);
{
  const before: Composition = lotComp(FEED);
  const after = addComp(lotComp(lotOf(c900.end)), { co2 });
  const eb = elementMoles(before), ea = elementMoles(after);
  const worst = Math.max(...(['C', 'O', 'Ca'] as const).map((k) => Math.abs(eb[k] - ea[k]) * 1000));
  ok(worst < 0.05, 'element balance (C, O, Ca) across feed → quicklime + CO2, within ppm rounding', `max ${worst.toFixed(4)} mmol`);
}
const chem = conv900.conversion * (95_000 / 1000 / 100.09) * PARAMS.dHCalcination.value;
ok(Math.abs(c900.stored - chem) <= 1, 'energy kept at the end = reaction enthalpy (sourced +191.59 kJ/mol); sensible heat ends as lost', `${c900.stored} J vs ${chem.toFixed(1)} J`);
ok(c900.used === c900.lost + c900.stored, 'used = lost + stored over the whole run (integer J)', `${c900.used} = ${c900.lost} + ${c900.stored}`);
const c600 = calcine(Array.from({ length: 25 }, (_, i) => i * H), { setpoint: 600 });
const conv600 = (c600.end.diagnostics as { conversion: number }).conversion;
ok(conv600 < 0.2 && conv900.conversion > 0.95, 'a lower setpoint leaves most calcite unconverted', `600 °C: ${(conv600 * 100).toFixed(1)}%, 900 °C: ${(conv900.conversion * 100).toFixed(1)}%`);

console.log('2. calcination: chunking, supply limits, unknown weather, versions');
const ragged = calcine([0, 7 * MIN, 1.3 * H, 1.3 * H + 30_000, 5 * H, 9.9 * H, 30 * H]);
ok(settle(ragged.end) === settle(c900.end) && ragged.used === c900.used && ragged.stored === c900.stored, 'hourly = ragged intervals (lot, CO2, observations, integer J)');
const weak = calcine(Array.from({ length: 25 }, (_, i) => i * H), { powerFactor: 0.15 });
const dw = weak.end.diagnostics as { conversion: number };
ok(dw.conversion < conv900.conversion && weak.results.some((r) => (r.diagnostics as { energyLimited: boolean }).energyLimited), 'a weak heat offer limits power, the charge stays cooler, less converts',
  `${(dw.conversion * 100).toFixed(1)}%`);
const gap = calcine(Array.from({ length: 25 }, (_, i) => i * H), { envAt: (i) => (i === 3 ? { sampleId: 'env:x', source: 'unknown', effectiveAt: T0 } : ENV) });
ok(gap.end.status === 'stopped' && gap.end.produced[0].quality!.history_complete === 0, 'an interval with unknown conditions stops the fire and marks the lot history-incomplete');
{
  const r1 = calcine([0, H]).results[0];
  const r = scienceStep({ ...(r1 as unknown as object), contract: SCIENCE_CONTRACT_VERSION, requestId: 'x', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, runId: 'run:c1',
    processId: CALCINE_PROCESS.processId, processVersion: '9.9.9', catalogVersion: SCIENCE_CATALOG_VERSION, interval: { from: T0, to: T0 + H }, state: null,
    environment: ENV, lots: [FEED], equipment: [CALCINER(900)], energy: [{ sourceId: 'src:h', kind: 'heat', maxJ: 1e9 }], actions: [], seed: 1 } as ScienceStepRequest);
  ok(r.status === 'failed', 'unknown processVersion → failed');
  const wet = scienceStep({ contract: SCIENCE_CONTRACT_VERSION, requestId: 'y', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, runId: 'run:c2',
    processId: CALCINE_PROCESS.processId, processVersion: CALCINE_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION, interval: { from: T0, to: T0 + H }, state: null,
    environment: ENV, lots: [{ ...FEED, quality: { x_calcite_ppm: 900_000, x_water_ppm: 50_000 } }], equipment: [CALCINER(900)], energy: [{ sourceId: 'src:h', kind: 'heat', maxJ: 1e9 }], actions: [], seed: 1 });
  ok(wet.status === 'failed', 'a moist feed is refused (moisture is not modelled in this step)');
}

console.log('3. hydration: CaO + H2O → Ca(OH)2 with water from a reserved lot');
const TUB = { equipmentId: 'eq:tub-1', kind: 'fixture_slaking_tub', catalogEntry: 'fixture_slaking_tub', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { heatCapJPerK: 400, uaWPerK: 1.5 } };
function hydrate(lime: LotView, waterMg: number, bounds: number[]) {
  const water: LotView = { lotId: 'lot:water-1', materialId: 'process_water', amount: { value: waterMg, unit: 'mg' }, location: 'site:tub' };
  let state: ScienceStepRequest['state'] = null;
  const results: ScienceStepResult[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = T0 + bounds[i], to = T0 + bounds[i + 1];
    const r = step({ contract: SCIENCE_CONTRACT_VERSION, requestId: `run:h1@${from}`, world: { worldId: 'civ-sim-test', worldEpoch: 'e1', worldVersion: 1 },
      runId: 'run:h1', processId: HYDRATE_PROCESS.processId, processVersion: HYDRATE_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION,
      interval: { from, to }, state, environment: ENV, lots: [lime, water], equipment: [TUB], energy: [], actions: [], seed: 1 });
    results.push(r); state = r.state;
    if (r.status !== 'running') break;
  }
  const end = results[results.length - 1];
  const used = results.flatMap((r) => r.energy).reduce((s, e) => s + e.usedJ, 0);
  const stored = results.flatMap((r) => r.energy).reduce((s, e) => s + (e.storedJ ?? 0), 0);
  return { results, end, used, stored, water };
}
const quick = lotOf(c900.end);
const h = hydrate(quick, 60_000, Array.from({ length: 13 }, (_, i) => i * H));
const dh = h.end.diagnostics as { peakC: number; conversion: number; evaporatedMg: number };
ok(h.end.status === 'completed' && dh.conversion > 0.99, 'the quicklime from step 1 slakes fully and the batch cools', `peak ${dh.peakC.toFixed(1)} °C, conversion ${(dh.conversion * 100).toFixed(2)}%`);
{
  const before = addComp(lotComp(quick), { water: 60_000 });
  const vap = h.end.released.find((x) => x.materialId === 'water_vapour')?.amount.value ?? 0;
  const after = addComp(lotComp(lotOf(h.end)), { water: vap });
  const eb = elementMoles(before), ea = elementMoles(after);
  const worst = Math.max(...(['H', 'O', 'Ca'] as const).map((k) => Math.abs(eb[k] - ea[k]) * 1000));
  ok(worst < 0.05, 'element balance (H, O, Ca) across quicklime + water → hydrated lime + vapour', `max ${worst.toFixed(4)} mmol, vapour ${vap} mg`);
  const molLime = (lotComp(quick).lime ?? 0) / 1000 / 56.08;
  const heat = molLime * dh.conversion * -PARAMS.dHHydration.value;
  ok(Math.abs(h.used - heat) <= 1 && h.stored === 0, 'reaction heat reported (sourced −64.47 kJ/mol) all leaves as lost by the end', `${h.used} J vs ${heat.toFixed(1)} J`);
  ok(h.end.consumed.length === 2 && h.end.consumed.every((c) => c.lotId === 'lot:water-1' || c.lotId === 'lot:x'), 'both reserved lots are consumed once, at the end');
}
const h2 = hydrate(quick, 60_000, [0, 17_000, 50 * MIN, 50 * MIN + 5_000, 3 * H, 12 * H]);
ok(settle(h2.end) === settle(h.end) && h2.used === h.used, 'hydration: chunking does not change the outcome');
const dry = hydrate(quick, 20_000, Array.from({ length: 13 }, (_, i) => i * H));
const dd = dry.end.diagnostics as { peakC: number; conversion: number };
ok(dd.conversion < 1 && dd.peakC >= 99.9, 'too little water: the batch boils, water runs out, some CaO stays unreacted', `peak ${dd.peakC.toFixed(1)} °C, conversion ${(dd.conversion * 100).toFixed(1)}%`);
const under = hydrate(lotOf(c600.end), 60_000, Array.from({ length: 13 }, (_, i) => i * H));
ok((under.end.diagnostics as { peakC: number }).peakC < (h.end.diagnostics as { peakC: number }).peakC - 30, 'under-burnt lime (600 °C run) barely warms: little CaO to react',
  `peak ${(under.end.diagnostics as { peakC: number }).peakC.toFixed(1)} °C — "${under.end.observations[0].text}"`);
ok(h.end.observations.every((o) => o.value === undefined), 'residents get sound/sight/touch descriptions, no numbers');

console.log('4. contract checker');
ok(violations.length === 0, 'validateResult found no violation in any lime result', violations.slice(0, 3).join(' / '));
{
  const bad = { ...c900.end, released: [] };
  const req = { interval: c900.end.simulated, lots: [FEED], energy: [{ sourceId: 'src:fixture-heater', kind: 'heat' as const, maxJ: 1e12 }], equipment: [], requestId: c900.end.requestId, runId: c900.end.runId, contract: c900.end.contract } as unknown as ScienceStepRequest;
  ok(validateResult(req, bad).some((v) => v.startsWith('mass does not close')), 'the checker catches a result that drops the CO2');
  const over = { ...c900.end, energy: [{ sourceId: 'src:fixture-heater', kind: 'heat' as const, usedJ: 10, lostJ: 10, storedJ: 0 }] };
  ok(validateResult({ ...req, energy: [{ sourceId: 'src:fixture-heater', kind: 'heat', maxJ: 5 }] }, over).some((v) => v.includes('> offered')), 'the checker catches more energy than offered');
  ok(validateResult(req, { ...c900.end, energy: [{ sourceId: 'src:robot-battery:dot', kind: 'electric', usedJ: 1, lostJ: 1, storedJ: 0 }] }).length > 0, 'the checker refuses a robot battery source');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
