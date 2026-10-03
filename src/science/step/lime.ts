// The lime lineage as ScienceSteps (contract 0.1.0), kept apart from the clay/ceramic lineage.
//   p20x_lime_calcine_test : CaCO3 → CaO + CO2 in a test calciner heated by an OFFERED heat source
//                            (no combustion inside the step, so no O2 intake is needed under 0.1.0)
//   p21x_lime_hydrate_test : CaO + H2O → Ca(OH)2 with water from a RESERVED lot; the reaction's own heat
//                            warms the batch and can boil water off as vapour
// Reaction enthalpies are sourced (OpenStax standard enthalpies of formation, params.ts). Rates, heat
// capacities of the charge and the fixtures are assumptions: test world only.
// Lots are settled once when a run ends, as in drying (see docs/proposals/civilization/science/ALIGNMENT.md §3).

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, react, REACTIONS, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { glowCategory, KINETICS, rateK } from '../physics';
import { checkCommon, compQuality, failed, fingerprint, intDelta, lotComp } from './common';

const MOLAR = { calcite: 100.09, lime: 56.08, water: 18.015, co2: 44.01 };

interface EnergyBook { cumUsedJ: number; cumLostJ: number; reportedUsed: number; reportedStored: number }

/** Integer energy entry for this interval; at the end, leftover sensible heat is reported as lost. */
function energyEntry(sourceId: string, b: EnergyBook, chemicalStoredJ: number, ending: boolean) {
  let cumStored = b.cumUsedJ - b.cumLostJ;
  if (ending) cumStored = chemicalStoredJ; // sensible heat left in the batch/equipment dissipates after the run
  const u = intDelta(b.cumUsedJ, b.reportedUsed);
  const s = intDelta(cumStored, b.reportedStored);
  b.reportedUsed = u.reported; b.reportedStored = s.reported;
  return u.delta === 0 && s.delta === 0 ? [] : [{ sourceId, kind: 'heat' as const, usedJ: u.delta, lostJ: u.delta - s.delta, storedJ: s.delta }];
}

function startCheck(req: ScienceStepRequest, d: { lotFingerprints: string[]; lastTo: number } | null, lotsFp: string[]): string | null {
  if (!d) return null;
  if (d.lotFingerprints.join('|') !== lotsFp.join('|')) return 'changed-input: a reserved lot changed under a running run';
  if (req.interval.from !== d.lastTo) return `noncontiguous-interval: expected from=${d.lastTo}`;
  return null;
}

const envKnown = (req: ScienceStepRequest) =>
  (req.environment.source === 'live' || req.environment.source === 'simulation') && req.environment.airTempC !== undefined;

// ===================================================================================================
// Calcination
// ===================================================================================================

export const CALCINE_PROCESS = { processId: 'p20x_lime_calcine_test', processVersion: '0.1.0' } as const;
const CALCINE_SCHEMA = 'civ-sci.lime-calcine/1';
const CALCINE_EVAL = 'lime-calcine-eval/0.1.0';
const CALCINE_STEP_MS = 30_000;
const UNLOAD_C = 60;

interface CalcineData extends EnergyBook {
  lotId: string; lotFingerprints: string[]; lastTo: number; nextStepEndMs: number; startMs: number;
  base: Composition; ext: number;
  chamberC: number; chargeC: number; peakChargeC: number;
  phase: 'heat' | 'hold' | 'cool' | 'done'; holdStartMs: number | null;
  sourceId: string; historyComplete: boolean; location: string;
}

export function calcineStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, CALCINE_PROCESS.processId, CALCINE_PROCESS.processVersion, CALCINE_SCHEMA);
  if (bad) return failed(req, CALCINE_EVAL, bad, CALCINE_SCHEMA);
  const feed = req.lots.filter((l) => l.materialId === 'calcium_carbonate_feed');
  if (feed.length !== 1 || req.lots.length !== 1) return failed(req, CALCINE_EVAL, 'expected exactly one reserved calcium_carbonate_feed lot', CALCINE_SCHEMA);
  const lot = feed[0];
  const eq = req.equipment.find((e) => e.kind === 'fixture_calciner');
  const p = eq?.params ?? {};
  for (const k of ['setpointC', 'holdS', 'heatCapJPerK', 'uaWPerK', 'maxPowerW']) {
    if (req.stop !== 'equipment-lost' && !(typeof p[k] === 'number' && p[k] >= 0)) return failed(req, CALCINE_EVAL, `fixture_calciner lacks params.${k}`, CALCINE_SCHEMA);
  }
  if (eq && p.setpointC > 1100) return failed(req, CALCINE_EVAL, 'setpoint above the modelled range (1100 °C)', CALCINE_SCHEMA);
  const offers = req.energy.filter((e) => e.kind === 'heat');
  if (offers.length !== 1) return failed(req, CALCINE_EVAL, 'expected exactly one offered heat source', CALCINE_SCHEMA);
  const offer = offers[0];

  let comp: Composition;
  try { comp = lotComp(lot); } catch (e) { return failed(req, CALCINE_EVAL, (e as Error).message, CALCINE_SCHEMA); }
  if ((comp.water ?? 0) > 0) return failed(req, CALCINE_EVAL, 'feed must be dry (moisture is not modelled in this step)', CALCINE_SCHEMA);
  if (!comp.calcite) return failed(req, CALCINE_EVAL, 'feed has no calcite', CALCINE_SCHEMA);

  let d: CalcineData;
  const fps = [fingerprint(lot)];
  if (req.state === null) {
    const Ta = req.environment.airTempC ?? 25;
    d = { lotId: lot.lotId, lotFingerprints: fps, lastTo: req.interval.from, nextStepEndMs: req.interval.from + CALCINE_STEP_MS, startMs: req.interval.from,
      base: comp, ext: 0, chamberC: Ta, chargeC: Ta, peakChargeC: Ta, phase: 'heat', holdStartMs: null, sourceId: offer.sourceId,
      historyComplete: true, location: lot.location, cumUsedJ: 0, cumLostJ: 0, reportedUsed: 0, reportedStored: 0 };
  } else {
    d = structuredClone(req.state.data as CalcineData);
    const sc = startCheck(req, d, fps);
    if (sc) return failed(req, CALCINE_EVAL, sc, CALCINE_SCHEMA);
    if (offer.sourceId !== d.sourceId) return failed(req, CALCINE_EVAL, 'heat source changed under a running run', CALCINE_SCHEMA);
  }

  const known = envKnown(req);
  let budget = offer.maxJ;
  const molCalcite = (d.base.calcite ?? 0) / 1000 / MOLAR.calcite;
  const dt = CALCINE_STEP_MS / 1000;
  let energyLimited = false;
  if (known && req.stop !== 'equipment-lost') {
    const Ta = req.environment.airTempC!;
    while (d.phase !== 'done' && d.nextStepEndMs <= req.interval.to) {
      const t = d.nextStepEndMs;
      if (d.phase === 'heat' && d.chamberC >= p.setpointC - 3) { d.phase = 'hold'; d.holdStartMs = t; }
      if (d.phase === 'hold' && t - d.holdStartMs! >= p.holdS * 1000) d.phase = 'cool';
      let P = 0;
      if (d.phase === 'heat' || d.phase === 'hold') {
        P = Math.min(p.maxPowerW, Math.max(0, p.uaWPerK * (p.setpointC - Ta) + (p.heatCapJPerK * (p.setpointC - d.chamberC)) / 600));
        if (P * dt > budget) { P = budget / dt; energyLimited = true; }
      }
      const Q = P * dt; budget -= Q;
      const wall = p.uaWPerK * (d.chamberC - Ta) * dt;
      const massG = totalMg(d.base) / 1000 - d.ext * molCalcite * MOLAR.co2;
      const Tw = d.chargeC + (d.chamberC - d.chargeC) * (1 - Math.exp(-dt / 300));
      const sens = massG * pv('cpLimeCharge') * (Tw - d.chargeC);
      const dExt = (1 - d.ext) * (1 - Math.exp(-KINETICS.calcination(Tw) * dt));
      const rx = dExt * molCalcite * pv('dHCalcination');
      d.chamberC += (Q - wall - sens - rx) / p.heatCapJPerK;
      d.chargeC = Tw; d.ext += dExt; d.peakChargeC = Math.max(d.peakChargeC, Tw);
      d.cumUsedJ += Q; d.cumLostJ += wall;
      d.nextStepEndMs += CALCINE_STEP_MS;
      if (d.phase === 'cool' && d.chargeC < UNLOAD_C) d.phase = 'done';
    }
  } else if (!known) {
    d.historyComplete = false; // a fire that ran through unknown conditions cannot continue as evidence
  }

  const done = d.phase === 'done';
  const ending = done || !known || req.stop === 'operator' || req.stop === 'equipment-lost';
  const endAt = done ? d.nextStepEndMs - CALCINE_STEP_MS : (!known ? req.interval.from : req.interval.to);
  d.lastTo = endAt;
  const chemical = d.ext * molCalcite * pv('dHCalcination');
  const res: ScienceStepResult = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: CALCINE_SCHEMA, data: d }, status: ending ? (done ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], energy: energyEntry(d.sourceId, d, chemical, ending), equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: CALCINE_EVAL, sourceRefs: ['S-thermo', 'S-calc', 'S-heatcap'],
      notes: '反応熱は出典あり（298 K 標準値）。分解の速さ・炉の熱容量・損失は仮定。CO2 分圧との平衡は扱わない' },
    diagnostics: { phase: d.phase, chamberC: d.chamberC, chargeC: d.chargeC, conversion: d.ext, energyLimited, envSkipped: !known },
  };
  if (ending) {
    const conv = (d.base.calcite ?? 0) - Math.round((d.base.calcite ?? 0) * (1 - d.ext));
    let out = { ...d.base };
    let co2 = 0;
    if (conv > 0) {
      const r = react('calcite', conv, REACTIONS.calcination.coeffs, 'co2');
      out = addComp(addComp(out, r.consumed, -1), { lime: r.produced.lime ?? 0 });
      co2 = r.produced.co2 ?? 0;
    }
    res.consumed = [{ lotId: d.lotId, amount: { value: totalMg(d.base), unit: 'mg' } }];
    res.produced = [{ materialId: 'quicklime', amount: { value: totalMg(out), unit: 'mg' },
      quality: { ...compQuality(out), history_complete: d.historyComplete ? 1 : 0 }, into: d.location }];
    if (co2 > 0) res.released = [{ materialId: 'process_co2', amount: { value: co2, unit: 'mg' }, to: 'air' }];
    const obs: Observation[] = [{ at: endAt, channel: 'sight', quantity: 'glow', text: `いちばん熱いときの色：${glowCategory(d.peakChargeC)}` }];
    obs.push({ at: endAt, channel: 'sight', quantity: 'look',
      text: d.ext > 0.5 ? '白っぽく、もろそうな塊になった' : d.ext > 0.05 ? '表面だけ白っぽく変わった' : '見た目はほとんど変わらない' });
    if (done) obs.push({ at: endAt, channel: 'touch', quantity: 'warmth', text: '冷めて手で持てる' });
    res.observations = obs;
  }
  return res;
}

// ===================================================================================================
// Hydration (slaking)
// ===================================================================================================

export const HYDRATE_PROCESS = { processId: 'p21x_lime_hydrate_test', processVersion: '0.1.0' } as const;
const HYDRATE_SCHEMA = 'civ-sci.lime-hydrate/1';
const HYDRATE_EVAL = 'lime-hydrate-eval/0.1.0';
const HYDRATE_STEP_MS = 5_000;
const SAFE_C = 40;

interface HydrateData extends EnergyBook {
  lotIds: string[]; lotFingerprints: string[]; lastTo: number; nextStepEndMs: number;
  base: Composition; ext: number; tempC: number; peakC: number; evapMg: number;
  historyComplete: boolean; location: string; done: boolean;
}

export function hydrateStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, HYDRATE_PROCESS.processId, HYDRATE_PROCESS.processVersion, HYDRATE_SCHEMA);
  if (bad) return failed(req, HYDRATE_EVAL, bad, HYDRATE_SCHEMA);
  const ql = req.lots.filter((l) => l.materialId === 'quicklime');
  const wl = req.lots.filter((l) => l.materialId === 'process_water');
  if (ql.length !== 1 || wl.length !== 1 || req.lots.length !== 2) return failed(req, HYDRATE_EVAL, 'expected one quicklime lot and one process_water lot', HYDRATE_SCHEMA);
  const tub = req.equipment.find((e) => e.kind === 'fixture_slaking_tub');
  const p = tub?.params ?? {};
  if (req.stop !== 'equipment-lost' && !(p.heatCapJPerK >= 0 && p.uaWPerK >= 0)) return failed(req, HYDRATE_EVAL, 'fixture_slaking_tub lacks heatCapJPerK / uaWPerK', HYDRATE_SCHEMA);

  const fps = [fingerprint(ql[0]), fingerprint(wl[0])];
  let d: HydrateData;
  if (req.state === null) {
    let lime: Composition;
    try { lime = lotComp(ql[0]); } catch (e) { return failed(req, HYDRATE_EVAL, (e as Error).message, HYDRATE_SCHEMA); }
    const Ta = req.environment.airTempC ?? 25;
    d = { lotIds: [ql[0].lotId, wl[0].lotId], lotFingerprints: fps, lastTo: req.interval.from, nextStepEndMs: req.interval.from + HYDRATE_STEP_MS,
      base: addComp(lime, { water: wl[0].amount.value }), ext: 0, tempC: Ta, peakC: Ta, evapMg: 0,
      historyComplete: true, location: ql[0].location, done: false, cumUsedJ: 0, cumLostJ: 0, reportedUsed: 0, reportedStored: 0 };
  } else {
    d = structuredClone(req.state.data as HydrateData);
    const sc = startCheck(req, d, fps);
    if (sc) return failed(req, HYDRATE_EVAL, sc, HYDRATE_SCHEMA);
  }

  const known = envKnown(req);
  const molLime = (d.base.lime ?? 0) / 1000 / MOLAR.lime;
  const molWater0 = (d.base.water ?? 0) / 1000 / MOLAR.water;
  const dt = HYDRATE_STEP_MS / 1000;
  const L100 = pv('latentHeatWater100') / 1000; // J/g
  if (known && req.stop !== 'equipment-lost' && molLime > 0) {
    const Ta = req.environment.airTempC!;
    while (!d.done && d.nextStepEndMs <= req.interval.to) {
      const waterLeftMol = molWater0 - d.ext * molLime - d.evapMg / 1000 / MOLAR.water;
      const k = rateK(d.tempC, 'kinHydrationTref', 120, 50e3);
      const dExt = Math.max(0, Math.min((1 - d.ext) * (1 - Math.exp(-k * dt)), waterLeftMol / molLime));
      const heat = dExt * molLime * -pv('dHHydration');
      const waterG = Math.max(0, waterLeftMol * MOLAR.water - dExt * molLime * MOLAR.water);
      const solidsG = (totalMg(d.base) - (d.base.water ?? 0)) / 1000 + d.ext * molLime * MOLAR.water;
      const Cm = p.heatCapJPerK + waterG * pv('cpWater') + solidsG * pv('cpLimeCharge');
      const wall = p.uaWPerK * (d.tempC - Ta) * dt;
      let T = d.tempC + (heat - wall) / Cm;
      let latent = 0;
      if (T > 100) {
        const excessJ = (T - 100) * Cm;
        const evapG = Math.min(waterG, excessJ / L100);
        latent = evapG * L100;
        d.evapMg += evapG * 1000;
        T = 100 + (excessJ - latent) / Cm;
      }
      d.ext += dExt; d.tempC = T; d.peakC = Math.max(d.peakC, T);
      d.cumUsedJ += heat; d.cumLostJ += wall + latent;
      d.nextStepEndMs += HYDRATE_STEP_MS;
      const waterGone = molWater0 - d.ext * molLime - d.evapMg / 1000 / MOLAR.water <= 1e-9;
      if ((d.ext >= 0.999 || waterGone) && d.tempC < SAFE_C) d.done = true;
    }
  } else if (!known) d.historyComplete = false;
  if (molLime === 0) d.done = true;

  const ending = d.done || !known || req.stop === 'operator' || req.stop === 'equipment-lost';
  const endAt = d.done && molLime > 0 ? d.nextStepEndMs - HYDRATE_STEP_MS : (!known ? req.interval.from : req.interval.to);
  d.lastTo = Math.max(req.interval.from, endAt);
  const res: ScienceStepResult = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: d.lastTo },
    state: { schema: HYDRATE_SCHEMA, data: d }, status: ending ? (d.done ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], energy: energyEntry(`src:reaction:${req.runId}`, d, 0, ending), equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: HYDRATE_EVAL, sourceRefs: ['S-thermo', 'S-heatcap', 'S-latent'],
      notes: '反応熱・水の比熱・蒸発潜熱は出典あり。反応の速さと固体の比熱、容器の熱容量は仮定。100 °C 未満の蒸発は扱わない' },
    diagnostics: { tempC: d.tempC, peakC: d.peakC, conversion: d.ext, evaporatedMg: d.evapMg, envSkipped: !known },
  };
  if (ending) {
    const conv = (d.base.lime ?? 0) - Math.round((d.base.lime ?? 0) * (1 - d.ext));
    let out = { ...d.base };
    if (conv > 0) {
      const r = react('lime', conv, REACTIONS.hydration.coeffs, 'portlandite');
      out = addComp(addComp(out, r.consumed, -1), r.produced);
    }
    const evap = Math.min(out.water ?? 0, Math.round(d.evapMg));
    if (evap > 0) out = addComp(out, { water: evap }, -1);
    res.consumed = d.lotIds.map((id) => ({ lotId: id, amount: { value: req.lots.find((l) => l.lotId === id)!.amount.value, unit: 'mg' as const } }));
    res.produced = [{ materialId: 'hydrated_lime', amount: { value: totalMg(out), unit: 'mg' },
      quality: { ...compQuality(out), history_complete: d.historyComplete ? 1 : 0 }, into: d.location }];
    if (evap > 0) res.released = [{ materialId: 'water_vapour', amount: { value: evap, unit: 'mg' }, to: 'air' }];
    const solids = totalMg(out) - (out.water ?? 0);
    const obs: Observation[] = [];
    if (d.peakC >= 95) obs.push({ at: d.lastTo, channel: 'sound', quantity: 'boiling', text: 'ぐつぐつと音を立て、湯気が勢いよく上がった' });
    else if (d.peakC >= 50) obs.push({ at: d.lastTo, channel: 'sight', quantity: 'steam', text: '湯気が立ち、近くで熱気を感じた' });
    else obs.push({ at: d.lastTo, channel: 'touch', quantity: 'warmth', text: d.peakC >= 32 ? '少し温かくなった' : 'ほとんど温かくならなかった' });
    obs.push({ at: d.lastTo, channel: 'sight', quantity: 'look',
      text: (out.water ?? 0) > 0.4 * solids ? '白いどろりとした練り物になった' : '白い粉になった' });
    res.observations = obs;
  }
  return res;
}
