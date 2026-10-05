// ScienceStep for firing dried clay test tiles (p13x_test_tile_fire), contract 0.1.0.
//
// Heat comes from an OFFERED heat source into a test kiln fixture (no combustion inside the step), so no O2
// intake is needed. Bodies containing organic matter are refused for now: burning it out needs O2 from the air,
// which only the proposed 0.2.0 `drawn` field can record.
// The resident's plan arrives as an operator action 'fire_plan' with params that a person can choose without a
// thermometer: pace (0 slow, 1 normal, 2 fast), targetGlow (0 dull red, 1 cherry, 2 orange, 3 yellow),
// holdMin, forcedCooling (0/1). The world-side control law (rate, peak °C) is derived here, never shown.
// The tile lot is settled once when the run ends: consume the tile, produce test_tile_fired, release vapour/CO2.

import type { ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import type { Composition } from '../chem';
import { GLOW_TARGET_C, PACE_K_PER_H } from '../physics';
import { allFinite, checkCommon, contractExtras, envUsable, failed, finite, fingerprint, intDelta, intDeltaFloor, offerPowerW, subStepEnd, tileComp } from './common';
import { advanceWare, settleWare, type WareState } from './kiln-ware';

export const FIRING_PROCESS = { processId: 'p13x_test_tile_fire', processVersion: '0.2.1' } as const; // 0.2.1: tile make-ups read and written in whole ppm rounded down (Codex B2)
const SCHEMA = 'civ-sci.tile-fire/2';
const EVAL = 'tile-fire-eval/0.1.0';
const STEP_MS = 30_000;
const UNLOAD_C = 60;
const GLOWS = ['dull_red', 'cherry', 'orange', 'yellow'] as const;
const PACES = ['slow', 'normal', 'fast'] as const;

interface FireData extends WareState {
  lotId: string; lotFingerprint: string; lastTo: number; startMs: number; seed: number; sourceId: string; location: string;
  rampKPerH: number; peakC: number; holdMin: number; forced: boolean; plan: { pace: string; glow: string };
  kilnC: number; peakKilnC: number; ambientC: number;
  phase: 'ramp' | 'hold' | 'cool' | 'done'; elapsedS: number; holdStartS: number | null;
  /** controller output decided at the last grid point and held until the next (sample-and-hold) */
  heldPowerW: number;
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
  const offerW = offerPowerW(req, offers[0].maxJ); // the offer arrives evenly over the interval
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
      let P = Math.min(d.heldPowerW, offerW);
      if (P * dt > budget) P = budget / dt;
      const Q = P * dt; budget = Math.max(0, budget - Q);
      const ua = d.phase === 'cool' && d.forced ? p.uaWPerK * p.forcedCoolingUaFactor : p.uaWPerK;
      const wall = ua * (d.kilnC - Ta) * dt;
      // the tile
      const { sens, latent, chem } = advanceWare(d, d.kilnC, dt);
      d.kilnC += (Q - wall - sens - latent - chem) / p.heatCapJPerK;
      d.peakKilnC = Math.max(d.peakKilnC, d.kilnC);
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
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (done ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [],
    energy: u.delta === 0 && s.delta === 0 ? [] : [{ sourceId: d.sourceId, kind: 'heat', usedJ: u.delta, lostJ: u.delta - s.delta, storedJ: s.delta }],
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-thermo', 'S-latent', 'S-kaol', 'S-quartz', 'S-steam', 'S-abs'],
      notes: '焼成反応の熱の一部は出典あり（炭酸塩・蒸発）。脱水の熱・速度・焼結・割れの基準は校正値・仮定' },
    diagnostics: { phase: d.phase, kilnC: d.kilnC, wareC: d.wareC, maxWareC: d.maxWareC, sinter: d.sinter, ext: d.ext,
      steamRatioMax: d.steamRatioMax, duntRatioMax: d.duntRatioMax, plan: d.plan },
  };
  if (ending) Object.assign(res, settleWare({ w: d, lot, location: d.location, seed: d.seed, runId: req.runId, endAt,
    done, peakKilnC: d.peakKilnC, historyComplete: d.historyComplete }));
  return res;
}
