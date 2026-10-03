// ScienceStep for firing dried clay test tiles (p13x_test_tile_fire), contract 0.1.0.
//
// Heat comes from an OFFERED heat source into a test kiln fixture (no combustion inside the step), so no O2
// intake is needed. Bodies containing organic matter are refused for now: burning it out needs O2 from the air,
// which only the proposed 0.2.0 `drawn` field can record.
// The resident's plan arrives as an operator action 'fire_plan' with params that a person can choose without a
// thermometer: pace (0 slow, 1 normal, 2 fast), targetGlow (0 dull red, 1 cherry, 2 orange, 3 yellow),
// holdMin, forcedCooling (0/1). The world-side control law (rate, peak °C) is derived here, never shown.
// The tile lot is settled once when the run ends: consume the tile, produce test_tile_fired, release vapour/CO2.

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { totalMg, type Composition } from '../chem';
import { wareComp } from '../ceramic';
import { pv } from '../params';
import { crackP, dehydroxExtent, glowCategory, GLOW_TARGET_C, KINETICS, PACE_K_PER_H, waterRatio } from '../physics';
import { draw } from '../rng';
import { allFinite, checkCommon, envUsable, failed, finite, fingerprint, intDelta, intDeltaFloor, subStepEnd, tileComp, tileQuality } from './common';

export const FIRING_PROCESS = { processId: 'p13x_test_tile_fire', processVersion: '0.1.0' } as const;
const SCHEMA = 'civ-sci.tile-fire/1';
const EVAL = 'tile-fire-eval/0.1.0';
const STEP_MS = 30_000;
const UNLOAD_C = 60;
const GLOWS = ['dull_red', 'cherry', 'orange', 'yellow'] as const;
const PACES = ['slow', 'normal', 'fast'] as const;
type Ext = { water: number; organic: number; dehydrox: number; calc: number };

interface FireData {
  lotId: string; lotFingerprint: string; lastTo: number; startMs: number; seed: number; sourceId: string; location: string;
  base: Composition; ext: Ext; sinter: number; thicknessMm: number;
  rampKPerH: number; peakC: number; holdMin: number; forced: boolean; plan: { pace: string; glow: string };
  kilnC: number; wareC: number; maxWareC: number; peakKilnC: number; ambientC: number;
  phase: 'ramp' | 'hold' | 'cool' | 'done'; elapsedS: number; holdStartS: number | null;
  /** controller output decided at the last grid point and held until the next (sample-and-hold) */
  heldPowerW: number;
  steamRatioMax: number; duntRatioMax: number;
  cumUsedJ: number; cumLostJ: number; cumChemJ: number; reportedUsed: number; reportedStored: number;
  historyComplete: boolean;
}

export function firingStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, FIRING_PROCESS.processId, FIRING_PROCESS.processVersion, SCHEMA);
  if (bad) return failed(req, EVAL, bad, SCHEMA);
  if (req.lots.length !== 1 || !['test_tile_dry', 'test_tile_green'].includes(req.lots[0].materialId)) {
    return failed(req, EVAL, 'expected exactly one reserved unfired test tile lot', SCHEMA);
  }
  const lot = req.lots[0];
  const kiln = req.equipment.find((e) => e.kind === 'fixture_kiln');
  const p = kiln?.params ?? {};
  if (req.stop !== 'equipment-lost') {
    if (!finite(p.heatCapJPerK, 1e-9)) return failed(req, EVAL, 'fixture_kiln params.heatCapJPerK must be finite and > 0', SCHEMA);
    for (const k of ['uaWPerK', 'maxPowerW', 'forcedCoolingUaFactor']) if (!finite(p[k], 0)) return failed(req, EVAL, `fixture_kiln params.${k} must be finite and ≥ 0`, SCHEMA);
  }
  const offers = req.energy.filter((e) => e.kind === 'heat');
  if (offers.length !== 1) return failed(req, EVAL, 'expected exactly one offered heat source', SCHEMA);

  let d: FireData;
  if (req.state === null) {
    let base: Composition;
    try { base = tileComp(lot); } catch (e) { return failed(req, EVAL, (e as Error).message, SCHEMA); }
    if ((base.organic_c ?? 0) > 0) return failed(req, EVAL, 'organic matter needs O2 from the air to burn out; waits for contract 0.2.0 (drawn)', SCHEMA);
    if (!finite(lot.quality?.thickness_mm, 0.1, 500)) return failed(req, EVAL, 'tile needs a finite quality.thickness_mm', SCHEMA);
    const plan = req.actions.find((a) => a.action === 'fire_plan');
    const pp = plan?.params ?? {};
    const pace = PACES[pp.pace], glow = GLOWS[pp.targetGlow];
    if (!plan || !pace || !glow || !finite(pp.holdMin, 0, 7 * 24 * 60)) return failed(req, EVAL, 'needs a fire_plan action {pace 0-2, targetGlow 0-3, holdMin, forcedCooling}', SCHEMA);
    const Ta = finite(req.environment.airTempC, -60, 70) ? req.environment.airTempC : 25;
    d = { lotId: lot.lotId, lotFingerprint: fingerprint(lot), lastTo: req.interval.from, startMs: req.interval.from, seed: req.seed,
      sourceId: offers[0].sourceId, location: lot.location, base, ext: { water: 0, organic: 0, dehydrox: 0, calc: 0 }, sinter: 0,
      thicknessMm: lot.quality.thickness_mm, rampKPerH: PACE_K_PER_H[pace], peakC: GLOW_TARGET_C[glow], holdMin: pp.holdMin,
      forced: pp.forcedCooling === 1, plan: { pace, glow }, kilnC: Ta, wareC: Ta, maxWareC: Ta, peakKilnC: Ta, ambientC: Ta,
      phase: 'ramp', elapsedS: 0, holdStartS: null, heldPowerW: 0, steamRatioMax: 0, duntRatioMax: 0,
      cumUsedJ: 0, cumLostJ: 0, cumChemJ: 0, reportedUsed: 0, reportedStored: 0, historyComplete: (lot.quality.history_complete ?? 1) === 1 };
  } else {
    d = structuredClone(req.state.data as FireData);
    if (d.lotFingerprint !== fingerprint(lot)) return failed(req, EVAL, 'changed-input: the reserved lot changed under a running run', SCHEMA);
    if (req.interval.from !== d.lastTo) return failed(req, EVAL, `noncontiguous-interval: expected from=${d.lastTo}`, SCHEMA);
    if (offers[0].sourceId !== d.sourceId) return failed(req, EVAL, 'heat source changed under a running run', SCHEMA);
  }

  const known = envUsable(req);
  let budget = offers[0].maxJ;
  let t = d.lastTo;
  if (known && req.stop !== 'equipment-lost') {
    const Ta = req.environment.airTempC!;
    while (d.phase !== 'done' && t < req.interval.to) {
      const tEnd = subStepEnd(t, d.startMs, STEP_MS, req.interval.to);
      const dt = (tEnd - t) / 1000;
      // operator control derived from the plan, decided only at grid points and held in between
      if ((t - d.startMs) % STEP_MS === 0) {
        let target: number | null = null, rampKs = 0;
        if (d.phase === 'ramp') {
          target = Math.min(d.peakC, d.ambientC + (d.rampKPerH * d.elapsedS) / 3600);
          rampKs = target < d.peakC ? d.rampKPerH / 3600 : 0;
          if (d.kilnC >= d.peakC - 3) { d.phase = 'hold'; d.holdStartS = d.elapsedS; }
        }
        if (d.phase === 'hold') { target = d.peakC; if (d.elapsedS - d.holdStartS! >= d.holdMin * 60) d.phase = 'cool'; }
        d.heldPowerW = target !== null && (d.phase === 'ramp' || d.phase === 'hold')
          ? Math.min(p.maxPowerW, Math.max(0, p.heatCapJPerK * rampKs + p.uaWPerK * (target - Ta) + (p.heatCapJPerK * (target - d.kilnC)) / 600)) : 0;
      }
      let P = d.heldPowerW;
      if (P * dt > budget) P = budget / dt;
      const Q = P * dt; budget = Math.max(0, budget - Q);
      const ua = d.phase === 'cool' && d.forced ? p.uaWPerK * p.forcedCoolingUaFactor : p.uaWPerK;
      const wall = ua * (d.kilnC - Ta) * dt;
      // the tile
      const now = wareComp(d.base, d.ext).comp;
      const tau = pv('wareLagS10mm') * (d.thicknessMm / 10) ** 2;
      const Tw = d.wareC + (d.kilnC - d.wareC) * (1 - Math.exp(-dt / tau));
      const dTw = Tw - d.wareC;
      const sens = (totalMg(now) / 1000) * pv('cpCeramic') * dTw;
      const rateKh = (dTw / dt) * 3600, wr = waterRatio(now);
      if (Tw >= 90 && Tw <= 250 && wr > pv('steamMoistureLimit') && rateKh > 0) {
        d.steamRatioMax = Math.max(d.steamRatioMax, (wr / pv('steamMoistureLimit')) * (rateKh / pv('steamRateLimit')));
      }
      const qi = pv('quartzInversionC');
      if ((d.wareC - qi) * (Tw - qi) <= 0 && dTw !== 0 && (d.base.quartz ?? 0) > 0) {
        d.duntRatioMax = Math.max(d.duntRatioMax, Math.abs(rateKh) / (pv('duntRateLimit10mm') * (10 / d.thicknessMm)));
      }
      const adv = (x: number, k: number) => x + (1 - x) * (1 - Math.exp(-k * dt));
      const e = d.ext;
      const ne: Ext = { water: adv(e.water, KINETICS.water(Tw)), organic: 0, dehydrox: adv(e.dehydrox, KINETICS.dehydrox(Tw)), calc: adv(e.calc, KINETICS.calcination(Tw)) };
      const latent = ((ne.water - e.water) * (d.base.water ?? 0) / 1e6) * pv('latentHeatWater100');
      const chem = ((ne.dehydrox - e.dehydrox) * (d.base.kaolinite ?? 0) / 1e6) * pv('dHDehydroxylation')
        + ((ne.calc - e.calc) * (d.base.calcite ?? 0) / 1000 / 100.09) * pv('dHCalcination');
      d.ext = ne;
      if (dehydroxExtent(wareComp(d.base, ne).comp) >= pv('slakeIfDehydroxBelow')) d.sinter += (1 - d.sinter) * (1 - Math.exp(-KINETICS.sinter(Tw) * dt));
      d.kilnC += (Q - wall - sens - latent - chem) / p.heatCapJPerK;
      d.wareC = Tw; d.maxWareC = Math.max(d.maxWareC, Tw); d.peakKilnC = Math.max(d.peakKilnC, d.kilnC);
      d.cumUsedJ += Q; d.cumLostJ += wall + latent; d.cumChemJ += chem;
      d.elapsedS += dt; t = tEnd;
      if (d.phase === 'cool' && d.wareC < UNLOAD_C && (t - d.startMs) % STEP_MS === 0) d.phase = 'done';
    }
  } else if (!known) d.historyComplete = false;

  const done = d.phase === 'done';
  const ending = done || !known || req.stop === 'operator' || req.stop === 'equipment-lost';
  const endAt = done ? t : (!known ? req.interval.from : req.interval.to);
  d.lastTo = endAt;
  if (!allFinite(d)) return failed(req, EVAL, 'non-finite state: refusing to return it', SCHEMA);
  const u = intDeltaFloor(d.cumUsedJ, d.reportedUsed);
  const s = intDelta(ending ? d.cumChemJ : d.cumUsedJ - d.cumLostJ, d.reportedStored);
  d.reportedUsed = u.reported; d.reportedStored = s.reported;
  const res: ScienceStepResult = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (done ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [],
    energy: u.delta === 0 && s.delta === 0 ? [] : [{ sourceId: d.sourceId, kind: 'heat', usedJ: u.delta, lostJ: u.delta - s.delta, storedJ: s.delta }],
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-thermo', 'S-latent', 'S-kaol', 'S-quartz', 'S-steam', 'S-abs'],
      notes: '焼成反応の熱の一部は出典あり（炭酸塩・蒸発）。脱水の熱・速度・焼結・割れの基準は校正値・仮定' },
    diagnostics: { phase: d.phase, kilnC: d.kilnC, wareC: d.wareC, maxWareC: d.maxWareC, sinter: d.sinter, ext: d.ext,
      steamRatioMax: d.steamRatioMax, duntRatioMax: d.duntRatioMax, plan: d.plan },
  };
  if (ending) {
    const w = wareComp(d.base, d.ext);
    // crack draws, keyed by the run's seed: chunking and resends never change them
    let crack = 0;
    for (const [mech, ratio] of [['steam', d.steamRatioMax], ['dunting', d.duntRatioMax]] as const) {
      const pc = crackP(ratio);
      if (pc > 0 && draw(d.seed, req.runId, d.lotId, mech) < pc) {
        crack = Math.max(crack, draw(d.seed, req.runId, d.lotId, mech, 'severity') < Math.min(0.8, 0.25 * ratio) ? 2 : 1);
      }
    }
    const fired = done || d.maxWareC > 300;
    res.consumed = [{ lotId: d.lotId, amount: { value: totalMg(d.base), unit: 'mg' } }];
    crack = Math.max(crack, lot.quality?.crack ?? 0); // cracks the piece already had stay, and are what the resident sees
    const q = { ...(lot.quality ?? {}), ...tileQuality(w.comp), sinter_ppm: Math.round(d.sinter * 1e6), crack,
      overfired: d.maxWareC > pv('overfireC') ? 1 : 0, history_complete: d.historyComplete ? 1 : 0 };
    for (const k of Object.keys(q)) if (/^xd_/.test(k) && !(k in tileQuality(w.comp))) delete q[k];
    res.produced = [{ materialId: fired ? 'test_tile_fired' : lot.materialId, amount: { value: totalMg(w.comp), unit: 'mg' }, quality: q, into: d.location }];
    if (w.out.water) res.released.push({ materialId: 'water_vapour', amount: { value: w.out.water, unit: 'mg' }, to: 'air' });
    if (w.out.co2) res.released.push({ materialId: 'process_co2', amount: { value: w.out.co2, unit: 'mg' }, to: 'air' });
    const obs: Observation[] = [{ at: endAt, channel: 'sight', quantity: 'glow', text: `いちばん熱いときの火の色：${glowCategory(d.peakKilnC)}` }];
    obs.push({ at: endAt, channel: 'sight', quantity: 'crack', text: crack === 2 ? '割れて分かれている' : crack === 1 ? '細いひびが見える' : 'ひびは見当たらない' });
    if (done) obs.push({ at: endAt, channel: 'sound', quantity: 'tap',
      text: crack === 2 ? '濁ってびりつく音' : d.sinter > 0.5 ? '高く澄んだ音' : dehydroxExtent(w.comp) >= pv('slakeIfDehydroxBelow') ? 'やや鈍い音' : 'こもった音' });
    res.observations = obs;
  }
  return res;
}
