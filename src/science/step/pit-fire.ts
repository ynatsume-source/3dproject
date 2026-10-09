// ScienceStep for firing the residents' own pots in an open fire on the ground (p13y_pot_pit_fire), contract 0.2.x only
// (the fire draws O2). Island clock: a tended fire is waiting work. POT_FIRING_DESIGN.md, owner's decisions 2026-10-07.
//
// One pot (dry_pot, or a green_pot not yet dry: the steam then has its say) and a firewood lot, on an open_fire_pit.
// The resident decides once, at the start (one fire_plan action at interval.from of the first request):
//   preheatMin   how long to warm the pot beside the fire first (あぶり, held at pitPreheatC)
//   pace         0 slow / 1 normal / 2 fast: how fast the fire is built up around it
//   targetGlow   0 dull red … 3 yellow; holdMin: how long to keep it there
//   forcedCooling 1: pulled out of the embers to cool (fast); 0: left to cool in the ashes
// The fire and the pot follow the wood-fired tile step (wood-fire.ts) and the shared kiln physics (kiln-ware.ts:
// lag through the wall, drying out, dehydroxylation, sintering, steam and quartz-inversion risks). Open-fire things
// added here (all assumed, params.ts):
//   - wet firewood burns with a cooler, smokier flame: the heat reaching the pot falls with the wood's water
//     (pitWetFlameK above pitWetFlameFrom of the wet mass); fresh-cut wood cannot bring a pot to a red glow
//   - wind fans one side of the fire: above pitWindCrackRefMs the uneven heating is a third crack risk
//   - rain damps the fire (heat ÷ (1 + rain mm/h ÷ pitRainHalfMmH)); the rain must be known, and the wind too
//   - hand-built ware has flaws no care removes: a small base risk (pitBaseCrackP)
// Crack draws are keyed by the run's seed and the pot (chunking never changes them). A pot broken apart (crack 2)
// comes back as pot_sherds of the same mass; a pot never heated past 300 °C comes back as it went in.
// Weather unknown (temperature, humidity, wind or rain missing) ends the run 'stopped': a fire is never left to burn
// on by itself. 0.1.1: organic matter in the body (the island's clay has some) burns out with O2 drawn from the air; a
// pot fired too short keeps a dark core. Not modelled: the heat of that burning (small beside the fire's), temper
// (sand, shell, and shell's lime spalling), smoke blackening, the pot's own strength from its wall, several pots in one fire.

import type { LotView, Observation, ScienceStepRequest } from '../../world/science-contract';
import { addComp, react, REACTIONS, totalMg, type Composition } from '../chem';
import { wareComp } from '../ceramic';
import { pv } from '../params';
import { crackP, dehydroxExtent, fuelLhvJPerMg, glowCategory, GLOW_TARGET_C } from '../physics';
import { draw } from '../rng';
import { allFinite, checkCommon, envUsable, failed, fingerprint, finite, intDelta, intDeltaFloor, subStepEnd, tileComp, tileQuality, wind10m } from './common';
import { advanceWare, type WareState } from './kiln-ware';
import { potSherdsQuality } from './vessel';
import { fuelComp, type ScienceStepResultV02 } from './wood-fire';
import { DRY_POT, GREEN_POT } from './pottery';

export const PIT_FIRE_PROCESS = { processId: 'p13y_pot_pit_fire', processVersion: '0.1.2' } as const; // 0.1.2: a lost hearth stops the fire at interval.to, not at interval.from (Codex PF-A1)
const SCHEMA = 'civ-sci.pot-pit-fire/1', EVAL = 'pot-pit-fire-eval/0.1.2';
export const FIRED_POT = 'fired_pot';
const STEP_MS = 30_000, UNLOAD_C = 60, RAMP_GIVE_UP_S = 2 * 3600;
const GLOWS = ['dull_red', 'cherry', 'orange', 'yellow'] as const;
const PACES = ['slow', 'normal', 'fast'] as const;
/** How fast a bonfire is built up around the pot (K/h): an open fire rises much faster than a kiln (assumed). */
export const PIT_PACE_K_PER_H = { slow: 300, normal: 600, fast: 1200 } as const;

type Outcome = 'done' | 'fuel_exhausted' | 'wont_burn' | 'peak_not_reached' | 'stopped' | 'untended';
interface Fire { kilnC: number; peakKilnC: number; burnedMg: number; elapsedS: number; cumUsedJ: number; cumLostJ: number; cumChemJ: number; unevenRatioMax: number }
interface PitData extends WareState, Fire {
  potId: string; fps: string[]; eqFp: string; fuelId: string; location: string; fuelLocation: string; lastTo: number; startMs: number; seed: number;
  fuel: Composition; heldBurnKgS: number; quality0: Record<string, number>; potMaterial: string;
  preheatS: number; rampKPerH: number; peakC: number; holdMin: number; forced: boolean; plan: { preheatMin: number; pace: string; glow: string };
  ambientC: number; phase: 'preheat' | 'ramp' | 'hold' | 'cool' | 'done'; holdStartS: number | null; outcome: Outcome | null;
  reportedUsed: number; reportedStored: number; historyComplete: boolean; runKnown: boolean;
}

const fail = (req: ScienceStepRequest, why: string) => failed(req, EVAL, why, SCHEMA) as ScienceStepResultV02;

/** How much of the fire's heat a wet wood's flame brings (1 for seasoned wood; assumed). */
export function wetFlameFactor(fuel: Composition): number {
  const wb = (fuel.water ?? 0) / Math.max(1, totalMg(fuel));
  return Math.min(1, Math.max(0.1, 1 - pv('pitWetFlameK') * Math.max(0, wb - pv('pitWetFlameFrom'))));
}

export function pitFireStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const bad = checkCommon(req, PIT_FIRE_PROCESS.processId, PIT_FIRE_PROCESS.processVersion, SCHEMA, /^0\.2\.\d+$/);
  if (bad) return fail(req, bad);
  const pots = req.lots.filter((l) => l.materialId === DRY_POT || l.materialId === GREEN_POT), woods = req.lots.filter((l) => l.materialId === 'firewood');
  if (pots.length !== 1 || woods.length !== 1 || req.lots.length !== 2) return fail(req, `expected one ${DRY_POT} (or ${GREEN_POT}) lot and one firewood lot`);
  if (req.energy.length) return fail(req, 'an open fire burns its reserved firewood: offer no heat source as well');
  const pot = pots[0], wood = woods[0];
  const hearth = req.equipment.find((e) => e.kind === 'open_fire_pit');
  // the open_fire_pit is the place; the fire heaped around the pot there is the science side's (assumed) bonfire
  const p = { heatCapJPerK: pv('pitHeatCapJPerK'), uaWPerK: pv('pitUaWPerK'), chamberFraction: pv('pitChamberFraction'), maxBurnKgPerH: pv('pitMaxBurnKgPerH'), forcedCoolingUaFactor: pv('pitPulledOutUaFactor') };
  if (req.stop !== 'equipment-lost' && !hearth) return fail(req, 'no open_fire_pit');
  for (const a of req.actions) if (!['fire_plan', 'look'].includes(a.action)) return fail(req, `unknown action ${a.action} (fire_plan at the start, look)`);
  const fps = req.lots.map(fingerprint).sort();
  const eqFp = JSON.stringify([hearth?.equipmentId, Object.entries(hearth?.params ?? {}).sort(([x], [y]) => x.localeCompare(y))]);
  const env = req.environment;
  // the fire needs the weather it burns in: temperature, humidity, wind (explicit 0 is calm) and rain
  const known = envUsable(req) && env.humidity !== undefined && env.windMs !== undefined && env.rainMmH !== undefined && finite(env.rainMmH, 0, 1000);

  let d: PitData;
  if (req.state === null) {
    if (!hearth) return fail(req, req.stop === 'equipment-lost' ? 'the hearth was lost before the fire was lit: nothing burned' : 'no open_fire_pit');
    const plans = req.actions.filter((a) => a.action === 'fire_plan');
    if (plans.length !== 1 || plans[0].at !== req.interval.from) return fail(req, 'the first request carries one fire_plan at interval.from {preheatMin, pace 0-2, targetGlow 0-3, holdMin, forcedCooling 0/1}');
    const pp = plans[0].params ?? {};
    const pace = PACES[pp.pace], glow = GLOWS[pp.targetGlow];
    if (!pace || !glow || !finite(pp.holdMin, 0, 24 * 60) || !finite(pp.preheatMin ?? 0, 0, 24 * 60) || ![0, 1, undefined].includes(pp.forcedCooling)) {
      return fail(req, 'fire_plan {preheatMin 0..1440, pace 0-2, targetGlow 0-3, holdMin 0..1440, forcedCooling 0/1}');
    }
    const q = pot.quality ?? {};
    if (![1, 2, 3].includes(q.form) || !finite(q.wall_mm, 2, 20)) return fail(req, `${pot.materialId} ${pot.lotId} needs form and wall_mm`);
    if ((q.crack ?? 0) >= 2) return fail(req, 'the pot is broken apart: it cannot be fired');
    let base: Composition;
    try { base = tileComp(pot); } catch (e) { return fail(req, (e as Error).message); }
    const fc = fuelComp(wood);
    if (typeof fc === 'string') return fail(req, fc);
    if (!known) return fail(req, `a fire is lit only with known weather (temperature, humidity, wind and rain; environment ${env.source})`);
    const Ta = env.airTempC!;
    d = { potId: pot.lotId, fps, eqFp, fuelId: wood.lotId, location: pot.location, fuelLocation: wood.location, lastTo: req.interval.from, startMs: req.interval.from, seed: req.seed,
      fuel: fc, heldBurnKgS: 0, quality0: { ...q }, potMaterial: pot.materialId,
      base, ext: { water: 0, organic: 0, dehydrox: 0, calc: 0 }, sinter: 0, thicknessMm: q.wall_mm, wareC: Ta, maxWareC: Ta, steamRatioMax: 0, duntRatioMax: 0,
      kilnC: Ta, peakKilnC: Ta, burnedMg: 0, elapsedS: 0, cumUsedJ: 0, cumLostJ: 0, cumChemJ: 0, unevenRatioMax: 0,
      preheatS: (pp.preheatMin ?? 0) * 60, rampKPerH: PIT_PACE_K_PER_H[pace], peakC: GLOW_TARGET_C[glow], holdMin: pp.holdMin, forced: pp.forcedCooling === 1,
      plan: { preheatMin: pp.preheatMin ?? 0, pace, glow }, ambientC: Ta, phase: (pp.preheatMin ?? 0) > 0 ? 'preheat' : 'ramp', holdStartS: null, outcome: null,
      reportedUsed: 0, reportedStored: 0, historyComplete: (q.history_complete ?? 1) === 1 && (wood.quality?.history_complete ?? 1) === 1, runKnown: true };
  } else {
    if (req.actions.some((a) => a.action === 'fire_plan')) return fail(req, 'the fire_plan is made once, at the start');
    d = structuredClone(req.state.data as PitData);
    if (d.fps.join('|') !== fps.join('|')) return fail(req, 'changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail(req, 'changed-input: the hearth changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(req, `noncontiguous-interval: expected from=${d.lastTo}`);
  }
  for (const a of req.actions) if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(req, `${a.action} must fall inside the interval`);

  const fuelTotal = totalMg(d.fuel), lhv = fuelLhvJPerMg(d.fuel), lhvDry = pv('woodLhvDry') / 1e6;
  const dryShare = (d.fuel.wood_dry ?? 0) / fuelTotal;
  const flame = wetFlameFactor(d.fuel);
  const rainFactor = known ? 1 / (1 + env.rainMmH! / pv('pitRainHalfMmH')) : 0;
  const windRatio = known ? wind10m(req) / pv('pitWindCrackRefMs') : 0;
  /** One sub-step of the fire and the pot (no decisions: those are taken at grid points). */
  const burnStep = (s: PitData, dt: number) => {
    const Ta = env.airTempC!;
    const burn = Math.min(s.heldBurnKgS * dt * 1e6, fuelTotal - s.burnedMg);
    s.burnedMg += burn;
    const chamberIn = burn * lhv * p.chamberFraction * flame * rainFactor, gross = burn * dryShare * lhvDry;
    // cooling: pulled out of the embers it loses heat fast; left in the ashes the ash bed holds it in (assumed factors)
    const ua = s.phase === 'cool' ? p.uaWPerK * (s.forced ? p.forcedCoolingUaFactor : pv('pitAshCoolUaFactor')) : p.uaWPerK;
    const wall = ua * (s.kilnC - Ta) * dt;
    const { sens, latent, chem } = advanceWare(s, s.kilnC, dt, { burnOrganic: true }); // the island's clay has some organic matter: it burns out in the open fire
    s.kilnC += (chamberIn - wall - sens - latent - chem) / p.heatCapJPerK;
    s.peakKilnC = Math.max(s.peakKilnC, s.kilnC);
    s.cumUsedJ += gross; s.cumLostJ += (gross - chamberIn) + wall + latent; s.cumChemJ += chem;
    if (s.kilnC > 200 && s.phase !== 'cool' && s.phase !== 'done') s.unevenRatioMax = Math.max(s.unevenRatioMax, windRatio);
    s.elapsedS += dt;
  };
  const observations: Observation[] = [];
  const read = (at: number, s: PitData) => {
    if (!known || !d.runKnown) return;
    const o = (quantity: string, text: string) => observations.push({ at, channel: 'sight', quantity, text });
    o('glow', s.kilnC < 400 ? (s.phase === 'preheat' ? '火の脇で器があたたまっている' : '火はまだ赤く光っていない') : `火の色：${glowCategory(s.kilnC)}`);
    if (s.phase !== 'cool' && s.phase !== 'done' && flame < 0.6) o('fire', '煙ばかりで、炎が弱い');
    if (s.wareC > 90 && s.wareC < 250 && s.ext.water < 0.95 && (s.base.water ?? 0) > 0) o('pot', '器から白い湯気が出ている');
  };

  let t = d.lastTo;
  const reads = req.actions.filter((a) => a.action === 'look').sort((x, y) => x.at - y.at);
  let k = 0;
  // a stop (equipment-lost too) ends the run at interval.to: the fire burns up to then, as in any other interval (PF-A1)
  if (known) {
    const Ta = env.airTempC!;
    while (d.phase !== 'done' && t < req.interval.to) {
      const tEnd = subStepEnd(t, d.startMs, STEP_MS, req.interval.to);
      const dt = (tEnd - t) / 1000;
      if ((t - d.startMs) % STEP_MS === 0) {
        let target: number | null = null, rampKs = 0;
        // warming beside the fire: the heat rises gently (pitPreheatKPerH) to pitPreheatC, then holds there
        if (d.phase === 'preheat') {
          target = Math.min(pv('pitPreheatC'), d.ambientC + (pv('pitPreheatKPerH') * d.elapsedS) / 3600);
          rampKs = target < pv('pitPreheatC') ? pv('pitPreheatKPerH') / 3600 : 0;
          if (d.elapsedS >= d.preheatS) { d.phase = 'ramp'; d.ambientC = Math.max(d.ambientC, Math.min(d.kilnC, pv('pitPreheatC'))); }
        }
        if (d.phase === 'ramp') {
          const rampS = d.elapsedS - (d.plan.preheatMin > 0 ? d.preheatS : 0);
          target = Math.min(d.peakC, d.ambientC + (d.rampKPerH * rampS) / 3600);
          rampKs = target < d.peakC ? d.rampKPerH / 3600 : 0;
          if (d.kilnC >= d.peakC - 3) { d.phase = 'hold'; d.holdStartS = d.elapsedS; }
          else if (rampS > ((d.peakC - d.ambientC) / d.rampKPerH) * 3600 + RAMP_GIVE_UP_S) { d.phase = 'cool'; d.outcome = 'peak_not_reached'; }
        }
        if (d.phase === 'hold') { target = d.peakC; if (d.elapsedS - d.holdStartS! >= d.holdMin * 60) d.phase = 'cool'; }
        if (d.phase !== 'cool' && fuelTotal - d.burnedMg < 1) { d.phase = 'cool'; d.outcome = 'fuel_exhausted'; }
        if (d.phase !== 'cool' && !(lhv > 0)) { d.phase = 'cool'; d.outcome ??= 'wont_burn'; }
        const want = target !== null && d.phase !== 'cool'
          ? p.heatCapJPerK * rampKs + p.uaWPerK * (target - Ta) + (p.heatCapJPerK * (target - d.kilnC)) / 600 : 0;
        const perKg = lhv * 1e6 * p.chamberFraction * flame * rainFactor;
        d.heldBurnKgS = perKg > 0 ? Math.min(Math.max(0, want / perKg), p.maxBurnKgPerH / 3600) : 0;
      }
      for (; k < reads.length && reads[k].at <= t; k++) read(reads[k].at, d);
      for (; k < reads.length && reads[k].at < tEnd; k++) { const c = structuredClone(d); burnStep(c, (reads[k].at - t) / 1000); read(reads[k].at, c); }
      burnStep(d, dt);
      t = tEnd;
      if (d.phase === 'cool' && d.wareC < UNLOAD_C && (t - d.startMs) % STEP_MS === 0) { d.phase = 'done'; d.outcome ??= 'done'; }
    }
  } else if (!known) { d.historyComplete = false; d.runKnown = false; d.outcome = 'untended'; }

  const done = d.phase === 'done';
  const ending = done || !known || req.stop === 'operator' || req.stop === 'equipment-lost';
  if (ending && !done && !d.outcome) d.outcome = 'stopped';
  const endAt = done ? t : (!known ? req.interval.from : req.interval.to);
  d.lastTo = endAt;
  if (!allFinite(d)) return fail(req, 'non-finite state: refusing to return it');
  const u = intDeltaFloor(d.cumUsedJ, d.reportedUsed);
  const s = intDelta(ending ? d.cumChemJ : d.cumUsedJ - d.cumLostJ, d.reportedStored);
  d.reportedUsed = u.reported; d.reportedStored = s.reported;
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (done ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    energy: u.delta === 0 && s.delta === 0 ? [] : [{ sourceId: `src:combustion:${req.runId}`, kind: 'heat', usedJ: u.delta, lostJ: u.delta - s.delta, storedJ: s.delta }],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-thermo', 'S-latent', 'S-wood', 'S-kaol', 'S-quartz', 'S-steam', 'S-abs'],
      notes: '火と器は薪で焼く工程と焼き物の物理をそのまま使う。湿った薪の炎・風の片焼け・雨・手づくりの器の欠陥・あぶりの温度は仮定（出典未照合）' },
    diagnostics: { phase: d.phase, outcome: d.outcome, kilnC: d.kilnC, wareC: d.wareC, maxWareC: d.maxWareC, peakKilnC: d.peakKilnC, sinter: d.sinter,
      burnedMg: d.burnedMg, flameFactor: flame, steamRatioMax: d.steamRatioMax, duntRatioMax: d.duntRatioMax, unevenRatioMax: d.unevenRatioMax, plan: d.plan },
  };
  if (!ending) return res;
  settle(res, d, pot, wood, req.runId, endAt, done);
  return res;
}

function settle(res: ScienceStepResultV02, d: PitData, pot: LotView, wood: LotView, runId: string, endAt: number, done: boolean) {
  const wc = wareComp(d.base, d.ext);
  // heated at all (cracks can happen), and turned to ceramic (the clay mineral dehydroxylated: it no longer slakes)
  const fired = d.maxWareC > 300, ceramic = fired && dehydroxExtent(wc.comp) >= pv('slakeIfDehydroxBelow');
  // cracks: steam, quartz inversion, uneven heating in the wind, and the flaws of hand-built ware; keyed by seed and pot
  let crack = d.quality0.crack ?? 0;
  if (fired) {
    for (const [mech, ratio] of [['steam', d.steamRatioMax], ['dunting', d.duntRatioMax], ['uneven', d.unevenRatioMax]] as const) {
      const pc = crackP(ratio);
      if (pc > 0 && draw(d.seed, runId, d.potId, mech) < pc) crack = Math.max(crack, draw(d.seed, runId, d.potId, mech, 'severity') < Math.min(0.8, 0.25 * ratio) ? 2 : 1);
    }
    if (draw(d.seed, runId, d.potId, 'flaw') < pv('pitBaseCrackP')) crack = Math.max(crack, draw(d.seed, runId, d.potId, 'flaw', 'severity') < 0.5 ? 2 : 1);
  }
  const hist = d.historyComplete ? 1 : 0, mass = totalMg(wc.comp);
  const absorption = Math.round((pv('absorptionLowFire') * (1 - d.sinter) + pv('absorptionVitrified') * d.sinter) * pv('coldSoakFraction') * 1e6);
  const keep = (({ form, capacity_ml, wall_mm, surface_cm2 }) => ({ form, capacity_ml, wall_mm, surface_cm2 }))(d.quality0);
  const o = (quantity: string, text: string, channel: Observation['channel'] = 'sight') => res.observations.push({ at: endAt, channel, quantity, text });
  res.consumed = [{ lotId: d.potId, amount: { value: totalMg(d.base), unit: 'mg' } }, { lotId: d.fuelId, amount: { value: totalMg(d.fuel), unit: 'mg' } }];
  if (!fired || (!ceramic && crack < 2)) {
    const q: Record<string, number> = { ...d.quality0, ...tileQuality(wc.comp), crack, history_complete: hist };
    for (const key of Object.keys(q)) if (/^xd_/.test(key) && !(key in tileQuality(wc.comp))) delete q[key];
    res.produced.push({ materialId: d.potMaterial, amount: { value: mass, unit: 'mg' }, into: d.location, quality: q });
  } else if (crack === 2) {
    res.produced.push({ materialId: 'pot_sherds', amount: { value: mass, unit: 'mg' }, into: d.location, quality: potSherdsQuality({ absorption_ppm: absorption, history_complete: hist }) });
  } else {
    res.produced.push({ materialId: FIRED_POT, amount: { value: mass, unit: 'mg' }, into: d.location, quality: {
      ...keep, ...tileQuality(wc.comp), absorption_ppm: absorption, sinter_ppm: Math.round(d.sinter * 1e6), crack,
      ...(crack === 1 ? { crack_ppm: pv('pitHairlineCrackPpm') } : {}), overfired: d.maxWareC > pv('overfireC') ? 1 : 0, history_complete: hist } });
  }
  // the firewood, as wood-fire.ts settles it: each part burned rounded up to whole mg, never more than the lot holds
  const share = (key: 'wood_dry' | 'water' | 'ash') => (d.fuel[key] ?? 0) / totalMg(d.fuel);
  const taken: Composition = {};
  for (const key of ['wood_dry', 'water', 'ash'] as const) { const n = Math.min(d.fuel[key] ?? 0, Math.ceil(d.burnedMg * share(key) - 1e-6)); if (n > 0) taken[key] = n; }
  const rest = addComp(d.fuel, taken, -1);
  const r = react('wood_dry', taken.wood_dry ?? 0, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
  if (totalMg(rest) > 0) {
    const restDry = totalMg(rest) - (rest.water ?? 0);
    res.produced.push({ materialId: 'firewood', amount: { value: totalMg(rest), unit: 'mg' }, into: d.fuelLocation,
      quality: { ...(wood.quality ?? {}), water_ppm: ((rest.water ?? 0) * 1e6) / totalMg(rest), ash_dry_ppm: restDry > 0 ? ((rest.ash ?? 0) * 1e6) / restDry : 0 } });
  }
  if (taken.ash) res.produced.push({ materialId: 'wood_ash', amount: { value: taken.ash, unit: 'mg' }, into: d.location });
  const vapour = (wc.out.water ?? 0) + (taken.water ?? 0) + (r.produced.water ?? 0), co2 = (wc.out.co2 ?? 0) + (r.produced.co2 ?? 0);
  if (vapour > 0) res.released.push({ materialId: 'water_vapour', amount: { value: vapour, unit: 'mg' }, to: 'air' });
  if (co2 > 0) res.released.push({ materialId: 'process_co2', amount: { value: co2, unit: 'mg' }, to: 'air' });
  const o2 = (r.consumed.o2 ?? 0) + (wc.inn.o2 ?? 0); // the wood's and the body's organic matter's
  if (o2 > 0) res.drawn = [{ materialId: 'o2', amount: { value: o2, unit: 'mg' }, from: 'air' }];
  // after an unknown stretch the run tells nothing of the pot: only that the fire fell while nobody watched
  if (!d.runKnown) { o('fire', '見ていない間に火が落ちていた'); return; }
  o('glow', `いちばん熱いときの火の色：${glowCategory(d.peakKilnC)}`);
  if (fired) {
    o('crack', crack === 2 ? '割れて、かけらになっている' : crack === 1 ? '細いひびが見える' : 'ひびは見当たらない');
    if (done && crack < 2) o('tap', d.sinter > 0.5 ? '高く澄んだ音' : dehydroxExtent(wc.comp) >= pv('slakeIfDehydroxBelow') ? 'やや鈍いが、焼けた音' : 'こもった音', 'sound');
    if (!ceramic && crack < 2) o('pot', '焼きが足りず、まだ土のまま（水に入れると崩れる）');
    else if (crack < 2 && (d.base.organic_c ?? 0) > 0 && d.ext.organic < 0.9) o('pot', '割ると、器の芯が黒い（土の中の草や根が燃え残っている）');
  } else o('pot', '器は焼けていない（火が届かなかった）');
  if (d.outcome === 'wont_burn') o('fire', '薪が湿っていて、火が育たなかった');
  if (d.outcome === 'fuel_exhausted') o('fire', '薪が尽きて、火が小さくなっていった');
  if (d.outcome === 'peak_not_reached') o('fire', wetFlameFactor(d.fuel) < 0.6 ? '煙ばかりで、いくら薪を足しても火が赤くならなかった' : 'いくら薪を足しても、思った火の色にならなかった');
}
