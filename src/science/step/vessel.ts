// The sealed vessel: a fired pot, its pores filled with wood tar and its mouth stopped with tar. Two steps.
//
// p16x_vessel_tar_seal (world clock, hand work, contract 0.2.x only: warming it at the fire draws O2)
//   The pot and the tar are warmed at the fire (a little firewood, optional), the tar brushed over the inside and, if
//   the resident does `seal`, the mouth is stopped with a plug and tar. Warm tar runs into the pores; cold tar sits on
//   top: coverage = 1 − (1 − before)·e^(−tar per area / reference). The tar goes onto the pot (its mass joins the pot
//   lot). Settled once, when the work is done (the hands' work arrives evenly, as for kneading).
//
// p17x_vessel_leak_test (island clock, waiting, contract 0.1.x / 0.2.x)
//   The pot stands on a stand (in shade or sun), empty or with water in it. Water soaks into the walls, seeps through
//   what tar has not covered and dries on the outside (faster in dry, warm air); a sealed pot holds its air for a
//   time that grows as the pores are covered (a hidden value for the world's table, not something the residents read).
//   In the sun the tar softens and runs above tarSoftC. Once no free water is left the walls dry, slower as they dry.
//   The resident feels the outside (look) and takes it off the stand (take_out). Holding it under water to see bubbles
//   (submerge) is held back until air, pressure and the water let in are modelled (Codex A4): it is refused.
//   Weather unknown: nothing is computed for that interval (nothing invented), the history is incomplete, and from then
//   on the run tells nothing (its ledger is no longer the world's): take the pot out and set it up again to observe.
//
// The pot lot (fired_pot_test, a test pot for now: the residents' own fired pots come later):
//   capacity_ml, absorption_ppm (water the fired body takes up, by mass), coverage_ppm, sealed (0/1: the plug is in
//   the mouth — a physical state), airtight_known (0 only on a sealed pot whose air-holding is no longer known, after
//   wear; absent = known), x_wood_tar_ppm, x_water_ppm (whole ppm rounded down; the rest is the fired body), crack_ppm
//   (a test damage index, not a measured crack), air_leak_tau_min (written by these steps for the world: how long the
//   sealed pot holds its air, the table main turns into a barometer bulb; absent when not known).
// Every constant is assumed (params.ts). Not modelled: cracks in the tar on cold nights, tar soaking deeper over days,
// the geometry of the pot's cracks and water dripping through them, opening a stopped pot, oil instead of water.

import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, react, REACTIONS, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { fuelLhvJPerMg, pSat } from '../physics';
import { allFinite, checkCommon, contractExtras, envUsable, failed, fingerprint, finite, intDeltaFloor, isInt, subStepEnd, wind10m } from './common';
import { fuelComp, type ScienceStepResultV02 } from './wood-fire';

export const TAR_SEAL_PROCESS = { processId: 'p16x_vessel_tar_seal', processVersion: '0.1.1' } as const;
export const LEAK_TEST_PROCESS = { processId: 'p17x_vessel_leak_test', processVersion: '0.1.2' } as const; // 0.1.2: a missing wind is unknown (not calm)
const SEAL_SCHEMA = 'civ-sci.vessel-seal/2', SEAL_EVAL = 'vessel-seal-eval/0.1.1';
const LEAK_SCHEMA = 'civ-sci.vessel-leak/2', LEAK_EVAL = 'vessel-leak-eval/0.1.2';
const POT = 'fired_pot_test';
const STEP_MS = 30_000;
const REF_ABSORPTION = 0.12, REF_AREA_M2 = 0.0366; // the reference pot: 12 % absorption, 500 mL

export interface Pot { body: number; tar: number; water: number; capacityMl: number; absorption: number; coverage: number; sealed: boolean; airtightKnown: boolean; crack: number }

/** Read a pot lot. Throws with a reason. */
export function readPot(lot: LotView): Pot {
  const q = lot.quality ?? {};
  if (!finite(q.capacity_ml, 1, 1e6)) throw new Error(`pot ${lot.lotId} needs quality.capacity_ml (1..1000000)`);
  if (!finite(q.absorption_ppm, 0, 400_000)) throw new Error(`pot ${lot.lotId} needs quality.absorption_ppm (0..400000)`);
  if (!finite(q.coverage_ppm ?? 0, 0, 1e6) || ![0, 1, undefined].includes(q.sealed)) throw new Error(`pot ${lot.lotId}: coverage_ppm 0..1000000, sealed 0 or 1`);
  for (const k of ['x_wood_tar_ppm', 'x_water_ppm']) if (q[k] !== undefined && !(isInt(q[k]) && q[k] <= 1e6)) throw new Error(`pot ${lot.lotId}: ${k} must be a whole ppm`);
  if ((q.x_wood_tar_ppm ?? 0) + (q.x_water_ppm ?? 0) > 1e6) throw new Error(`pot ${lot.lotId}: tar and water exceed the pot`);
  if (!finite(q.crack_ppm ?? 0, 0, 1e6)) throw new Error(`pot ${lot.lotId}: crack_ppm 0..1000000`);
  if (![0, 1, undefined].includes(q.airtight_known) || (q.airtight_known === 0 && q.sealed !== 1)) throw new Error(`pot ${lot.lotId}: airtight_known is 0 or 1, and 0 only on a sealed pot`);
  const tar = Math.floor((lot.amount.value * (q.x_wood_tar_ppm ?? 0)) / 1e6), water = Math.floor((lot.amount.value * (q.x_water_ppm ?? 0)) / 1e6);
  return { body: lot.amount.value - tar - water, tar, water, capacityMl: q.capacity_ml, absorption: q.absorption_ppm / 1e6, coverage: (q.coverage_ppm ?? 0) / 1e6, sealed: q.sealed === 1, airtightKnown: q.airtight_known !== 0, crack: (q.crack_ppm ?? 0) / 1e6 };
}
/** Inner surface (m²) of a pot holding capacityMl: a sphere's, a fifth more for the neck (assumed shape). */
export const potAreaM2 = (capacityMl: number) => (4.836 * Math.pow(capacityMl, 2 / 3) * 1.2) / 1e4;
/** How leaky the walls are compared with the reference raw pot. */
/** A crack (crack_ppm: how far the pot is from whole, from a damaged assembled pot) leaks besides the pores, and tar on
 *  the inside does not close it (assumed: a whole crack leaks like twenty bare reference pots). */
const CRACK_LEAK = 20;
const leakiness = (p: { absorption: number; coverage: number; crack?: number }) => (p.absorption / REF_ABSORPTION) * (1 - p.coverage) + CRACK_LEAK * (p.crack ?? 0);
/** How long (minutes) a sealed pot holds its air against the outside: the time a small pressure difference in the
 *  closed pot (fixed volume, temperature and outside pressure) takes to fall to 1/e (definition proposed by Codex;
 *  the 2-hour reference is assumed). 0 when it is open or its air-holding is not known: "not usable as a bulb", never
 *  "airtight" — the floor on leakiness caps it at 1,200,000 min, which is not perfect airtightness either. */
export function airLeakTauMin(p: { absorption: number; coverage: number; sealed: boolean; airtightKnown?: boolean; crack?: number }): number {
  if (!p.sealed || p.airtightKnown === false) return 0;
  return Math.round((pv('airLeakRefH') * 60) / Math.max(leakiness(p), 1e-4));
}
export function potQuality(p: Pot): Record<string, number> {
  const t = p.body + p.tar + p.water;
  return { capacity_ml: p.capacityMl, absorption_ppm: Math.round(p.absorption * 1e6), coverage_ppm: Math.floor(p.coverage * 1e6), sealed: p.sealed ? 1 : 0,
    ...(p.tar ? { x_wood_tar_ppm: Math.floor((p.tar * 1e6) / t) } : {}), ...(p.water ? { x_water_ppm: Math.floor((p.water * 1e6) / t) } : {}),
    ...(p.crack ? { crack_ppm: Math.round(p.crack * 1e6) } : {}), ...(p.sealed && !p.airtightKnown ? { airtight_known: 0 } : { air_leak_tau_min: airLeakTauMin(p) }) };
}

// ---- assembly: a pot lot becomes equipment, and back (ADR 0006: main assembles; this is the table) -----------------

/** The table's version: main records it on the equipment it assembles. */
export const POT_ASSEMBLY_TABLE = 'civ-sci.pot-assembly/2';
export const ASSEMBLED_POT = 'assembled_pot'; // kind and catalogEntry of the equipment
/** The equipment params of a pot assembled from a whole fired_pot_test lot (the lot's copy is kept by main). */
export function potToEquipmentParams(lot: LotView): Record<string, number> {
  const p = readPot(lot);
  return { capacityMl: p.capacityMl, absorptionPpm: Math.round(p.absorption * 1e6), coveragePpm: Math.floor(p.coverage * 1e6), sealed: p.sealed ? 1 : 0,
    airtightKnown: p.airtightKnown ? 1 : 0, crackPpm: Math.round(p.crack * 1e6), airLeakTauMin: airLeakTauMin(p) };
}
/** The quality of the lot a pot goes back to, from the lot copy kept at assembly (main passes the copy, not the last
 *  returned quality) and the equipment's condition (main sets it to 1 at each assembly, so 1 − condition is the wear of
 *  this use). Whole (condition 1): the copy as it was. Worn (condition < 1): the wear is added to the crack index
 *  (cumulative, capped at 1,000,000; a test index, not a measured crack). Wear does not open the pot: a stopped pot
 *  stays stopped (sealed 1 — nobody took the plug out), only its air-holding is no longer known (airtight_known 0,
 *  air_leak_tau_min dropped). An open pot stays open. Opening is a physical step of its own, not modelled yet. */
export function potQualityOnReturn(copy: Record<string, number>, condition: number): Record<string, number> {
  if (!finite(condition, 0, 1)) throw new Error('condition must be within 0..1');
  if (condition >= 1) return { ...copy };
  const { air_leak_tau_min: _t, airtight_known: _k, ...rest } = copy;
  return { ...rest, ...(copy.sealed === 1 ? { airtight_known: 0 } : {}), crack_ppm: Math.min(1e6, Math.round((copy.crack_ppm ?? 0) + (1 - condition) * 1e6)) };
}

/** The quality of the pot_sherds lot a broken pot goes back to (same mass as the lot copy, ADR 0006): what the body
 *  was (its absorption) and what it carried (tar, water in the walls), in whole ppm rounded down; the rest is body. */
export function potSherdsQuality(copy: Record<string, number>): Record<string, number> {
  const q: Record<string, number> = { absorption_ppm: copy.absorption_ppm };
  if (copy.x_wood_tar_ppm) q.x_wood_tar_ppm = copy.x_wood_tar_ppm;
  if (copy.x_water_ppm) q.x_water_ppm = copy.x_water_ppm;
  if (copy.history_complete !== undefined) q.history_complete = copy.history_complete;
  return q;
}

// ---- p16x: brush on tar, stop the mouth ------------------------------------------------------------------------------

interface SealData { fps: string[]; eqFp: string; lastTo: number; elapsedMs: number; durationMs: number; reportedHands: number; seal: boolean }

export function tarSealStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const fail = (why: string) => failed(req, SEAL_EVAL, why, SEAL_SCHEMA) as ScienceStepResultV02;
  const bad = checkCommon(req, TAR_SEAL_PROCESS.processId, TAR_SEAL_PROCESS.processVersion, SEAL_SCHEMA, /^0\.2\.\d+$/);
  if (bad) return fail(bad);
  const pots = req.lots.filter((l) => l.materialId === POT), tars = req.lots.filter((l) => l.materialId === 'wood_tar'), woods = req.lots.filter((l) => l.materialId === 'firewood');
  if (pots.length !== 1 || tars.length !== 1 || woods.length > 1 || pots.length + tars.length + woods.length !== req.lots.length) {
    return fail(`expected one ${POT} lot, one wood_tar lot and, to warm them at the fire, at most one firewood lot`);
  }
  const pot = pots[0], tarLot = tars[0], wood = woods[0];
  const brush = req.equipment.find((e) => e.kind === 'fixture_tar_brush'), pit = req.equipment.find((e) => e.kind === 'open_fire_pit');
  if (req.stop !== 'equipment-lost' && (!brush || (wood && !pit))) return fail(`needs a fixture_tar_brush${wood ? ' and an open_fire_pit to warm at' : ''}`);
  for (const a of req.actions) {
    if (a.action !== 'seal') return fail(`unknown action ${a.action} (seal: stop the mouth with a plug and tar)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail('seal must fall inside the interval');
  }
  const fps = req.lots.map(fingerprint).sort();
  const eqFp = JSON.stringify([brush?.equipmentId, pit?.equipmentId]);
  let d: SealData;
  if (req.state === null) {
    let p: Pot;
    try { p = readPot(pot); } catch (e) { return fail((e as Error).message); }
    if (p.sealed) return fail('the pot is already stopped: open it before tarring its inside again');
    if (wood) { const fc = fuelComp(wood); if (typeof fc === 'string') return fail(fc); }
    d = { fps, eqFp, lastTo: req.interval.from, elapsedMs: 0, durationMs: pv('vesselHandSeconds') * 1000, reportedHands: 0, seal: false };
  } else {
    d = structuredClone(req.state.data as SealData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the tools changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }
  const hands = req.energy.filter((e) => e.kind === 'mechanical');
  if (hands.length !== 1 || req.energy.length !== 1) return fail('expected one mechanical energy offer (the hands)');
  const span = req.interval.to - req.interval.from, power = pv('vesselHandPowerW');
  const worked = span > 0 && (hands[0].maxJ * 1000) / span >= power ? Math.min(span, d.durationMs - d.elapsedMs) : 0; // a stop is at interval.to
  d.elapsedMs += worked;
  const done = d.elapsedMs >= d.durationMs, endAt = done ? req.interval.from + worked : req.interval.to;
  // a seal counts only when it comes before the work is done (an action at or after endAt was never reached: Codex A1)
  if (req.actions.some((a) => a.at < endAt)) d.seal = true;
  const h = intDeltaFloor((power * d.elapsedMs) / 1000, d.reportedHands);
  d.reportedHands = h.reported; d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const stopped = !done && (req.stop === 'operator' || req.stop === 'equipment-lost');
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SEAL_SCHEMA, data: d }, status: done ? 'completed' : stopped ? 'stopped' : worked === 0 && span > 0 ? 'needs-input' : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    energy: h.delta > 0 ? [{ sourceId: hands[0].sourceId, kind: 'mechanical', usedJ: h.delta, lostJ: h.delta, storedJ: 0 }] : [],
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: SEAL_EVAL, sourceRefs: ['S-wood'], notes: 'タールが穴をふさぐ割合（温めたとき・冷たいとき）、封じに使うタール、温めるのに燃やす薪、手間はすべて仮定（出典未照合）' },
    diagnostics: { elapsedS: d.elapsedMs / 1000, durationS: d.durationMs / 1000, seal: d.seal },
  };
  if (!done) return res;

  // settle: the tar goes onto the pot; the warming fire burns its wood
  const p = readPot(pot), area = potAreaM2(p.capacityMl);
  let burn = 0, fuel: Composition = {};
  // wood too wet (or without dry wood) to give heat does not burn: it comes back as it was (Codex C1)
  if (wood) { fuel = fuelComp(wood) as Composition; burn = fuelLhvJPerMg(fuel) > 0 ? Math.min(totalMg(fuel), Math.round(pv('warmWoodG') * 1000)) : 0; }
  const warm = wood !== undefined && burn >= 0.5 * pv('warmWoodG') * 1000;
  const plug = d.seal ? Math.min(tarLot.amount.value, Math.round(pv('sealPlugTarG') * 1000)) : 0;
  const coat = tarLot.amount.value - plug;
  const ref = warm ? pv('tarCoverRefWarmGm2') : pv('tarCoverRefColdGm2');
  const coverage = 1 - (1 - p.coverage) * Math.exp(-(coat / 1000 / area) / ref);
  const sealed = d.seal && plug >= Math.round(pv('sealPlugTarG') * 1000);
  const out: Pot = { ...p, tar: p.tar + tarLot.amount.value, coverage, sealed };
  const hist = req.lots.every((l) => (l.quality?.history_complete ?? 1) === 1) ? 1 : 0;
  res.consumed = req.lots.map((l) => ({ lotId: l.lotId, amount: { ...l.amount } }));
  res.produced.push({ materialId: POT, amount: { value: out.body + out.tar + out.water, unit: 'mg' }, into: pot.location, quality: { ...potQuality(out), history_complete: hist } });
  if (wood) {
    const ft = totalMg(fuel), taken: Composition = {};
    for (const part of ['wood_dry', 'water', 'ash'] as const) {
      const n = Math.min(fuel[part] ?? 0, Math.ceil((burn * (fuel[part] ?? 0)) / ft - 1e-6));
      if (n > 0) taken[part] = n;
    }
    const left = addComp(fuel, taken, -1);
    const r = react('wood_dry', taken.wood_dry ?? 0, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
    if (totalMg(left) > 0) {
      const leftDry = totalMg(left) - (left.water ?? 0);
      res.produced.push({ materialId: 'firewood', amount: { value: totalMg(left), unit: 'mg' }, into: wood.location,
        quality: { ...(wood.quality ?? {}), water_ppm: ((left.water ?? 0) * 1e6) / totalMg(left), ash_dry_ppm: leftDry > 0 ? ((left.ash ?? 0) * 1e6) / leftDry : 0 } });
    }
    if (taken.ash) res.produced.push({ materialId: 'wood_ash', amount: { value: taken.ash, unit: 'mg' }, into: wood.location });
    const vapour = (taken.water ?? 0) + (r.produced.water ?? 0);
    if (vapour) res.released.push({ materialId: 'water_vapour', amount: { value: vapour, unit: 'mg' }, to: 'air' });
    if (r.produced.co2) res.released.push({ materialId: 'process_co2', amount: { value: r.produced.co2, unit: 'mg' }, to: 'air' });
    if (r.consumed.o2) res.drawn = [{ materialId: 'o2', amount: { value: r.consumed.o2, unit: 'mg' }, from: 'air' }];
    const heat = Math.floor(((taken.wood_dry ?? 0) / 1e6) * pv('woodLhvDry'));
    if (heat > 0) res.energy.push({ sourceId: `src:combustion:${req.runId}`, kind: 'heat', usedJ: heat, lostJ: heat, storedJ: 0 });
  }
  const o = (quantity: string, text: string) => res.observations.push({ at: endAt, channel: 'sight', quantity, text });
  o('pot', warm ? '温めたタールが内側にしみこみ、黒く光っている' : 'タールが固く、内側の表面に乗っているだけに見える');
  if (coat / 1000 / area > 6 * ref) o('pot', '塗りすぎたタールが底にたまった');
  if (d.seal) o('pot', sealed ? '口を栓とタールでふさいだ' : 'タールが足りず、口をふさぎきれなかった');
  return res;
}

// ---- p17x: wait and see what leaks ---------------------------------------------------------------------------------

/** What the waiting changes: the pot (its coverage), the free water in it, the water in its walls, what dried off. */
interface LeakPhys { pot: Pot; waterIn: number; wall: number; evapF: number; latentJ: number }
interface LeakData extends LeakPhys {
  potId: string; fps: string[]; eqFp: string; sun: number; startMs: number; lastTo: number; location: string; waterLocation: string;
  reportedJ: number; historyComplete: boolean; hist: number;
}

export function leakTestStep(req: ScienceStepRequest): ScienceStepResult {
  const fail = (why: string) => failed(req, LEAK_EVAL, why, LEAK_SCHEMA);
  const bad = checkCommon(req, LEAK_TEST_PROCESS.processId, LEAK_TEST_PROCESS.processVersion, LEAK_SCHEMA);
  if (bad) return fail(bad);
  const pots = req.lots.filter((l) => l.materialId === POT), waters = req.lots.filter((l) => l.materialId === 'process_water');
  if (pots.length !== 1 || waters.length > 1 || pots.length + waters.length !== req.lots.length) return fail(`expected one ${POT} lot and, to fill it, at most one process_water lot`);
  if (req.energy.length) return fail('waiting uses no offered energy');
  const stand = req.equipment.find((e) => e.kind === 'fixture_vessel_stand');
  if (!stand && req.stop !== 'equipment-lost') return fail('no fixture_vessel_stand');
  for (const a of req.actions) {
    if (a.action === 'submerge') return fail('submerge is held back: what bubbles under water tell needs the air in the pot, its pressure and the water let in, which are not modelled yet');
    if (!['look', 'take_out'].includes(a.action)) return fail(`unknown action ${a.action} (look, take_out)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
  }
  const pot = pots[0], water = waters[0];
  const fps = req.lots.map(fingerprint).sort();
  const eqFp = JSON.stringify([stand?.equipmentId, Object.entries(stand?.params ?? {}).sort(([x], [y]) => x.localeCompare(y))]);
  let d: LeakData;
  if (req.state === null) {
    if (!stand) return fail('the stand was lost before the pot was put on it: nothing happened');
    const sun = stand.params?.sunExposure ?? 0;
    if (!finite(sun, 0, 1)) return fail('fixture_vessel_stand params.sunExposure must be within 0..1');
    let p: Pot;
    try { p = readPot(pot); } catch (e) { return fail((e as Error).message); }
    if (water && p.sealed) return fail('the pot is stopped: it cannot be filled');
    if (water && water.amount.value / 1000 > p.capacityMl) return fail('the water does not fit in the pot');
    d = { potId: pot.lotId, fps, eqFp, sun, startMs: req.interval.from, lastTo: req.interval.from, location: pot.location, waterLocation: water?.location ?? pot.location,
      pot: p, waterIn: water?.amount.value ?? 0, wall: p.water, evapF: 0, latentJ: 0, reportedJ: 0, historyComplete: true,
      hist: req.lots.every((l) => (l.quality?.history_complete ?? 1) === 1) ? 1 : 0 };
  } else {
    d = structuredClone(req.state.data as LeakData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the stand changed under a running run (send stop equipment-lost when it is lost)');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}; send a missed interval with environment.source 'unknown'`);
  }
  const takeOut = req.actions.filter((a) => a.action === 'take_out').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = takeOut ?? req.interval.to;
  const reads = req.actions.filter((a) => a.action !== 'take_out' && a.at < endAt).sort((x, y) => x.at - y.at);
  const env = req.environment, known = envUsable(req) && env.humidity !== undefined && env.windMs !== undefined; // 0.1.2: a missing wind is unknown, not calm
  const area = potAreaM2(d.pot.capacityMl), wallMax = (s: LeakPhys) => s.pot.absorption * s.pot.body * (1 - s.pot.coverage);
  const potC = () => (known ? env.airTempC! + pv('sunSurfaceExcessC') * d.sun : NaN);
  /** What dries off the outside now (mg/s), from the pot as it is and this interval's weather. With free water inside
   *  the walls are kept wet and the water passes through; once it is gone the walls themselves dry, slower as they dry
   *  (the outside's dryness and the water held deeper in the wall are not told apart: Codex A3). */
  const seepRate = (s: LeakPhys) => {
    if (!known) return 0;
    const wet = s.waterIn > 0 ? 1 : s.wall <= 0 ? 0 : wallMax(s) > 0 ? Math.min(1, s.wall / wallMax(s)) : 1;
    if (wet === 0) return 0;
    const Tp = potC(), deficit = Math.max(0, pSat(Tp) - env.humidity! * pSat(env.airTempC!)), deficitRef = 0.25 * pSat(28);
    return wet * (pv('seepRefGPerDay') * 1000 / 86400) * leakiness(s.pot) * (area / REF_AREA_M2) * (deficit / deficitRef) * (1 + 0.1 * wind10m(req));
  };
  /** Advance the physics by dt seconds (known weather only). */
  const advance = (s: LeakPhys, dt: number) => {
    const Tp = potC();
    // in the sun the tar softens and runs off the walls
    if (s.pot.tar > 0 && Tp > pv('tarSoftC')) s.pot.coverage *= Math.exp(-(dt * (Tp - pv('tarSoftC'))) / (30 * 86400));
    if (s.waterIn > 0) {
      // the walls take up water, then what is not covered lets it through to dry outside
      const up = Math.min(s.waterIn, Math.max(0, wallMax(s) - s.wall) * (1 - Math.exp(-dt / pv('wallUptakeTauS'))));
      s.waterIn -= up; s.wall += up;
      const e = Math.min(s.waterIn, seepRate(s) * dt);
      s.waterIn -= e; s.evapF += e; s.latentJ += (e / 1e6) * pv('latentHeatWater25');
    } else if (s.wall > 0) {
      // no free water: the walls dry
      const e = Math.min(s.wall, seepRate(s) * dt);
      s.wall -= e; s.evapF += e; s.latentJ += (e / 1e6) * pv('latentHeatWater25');
    }
  };
  const observations: Observation[] = [];
  /** Read the state s at a.at. Nothing is told when the weather is unknown, nor after an unknown stretch in this run
   *  (the ledger then lags the world: Codex A5). */
  const read = (a: ScienceStepRequest['actions'][number], s: LeakPhys) => {
    if (!known || !d.historyComplete) return;
    const o = (channel: Observation['channel'], quantity: string, text: string) => observations.push({ at: a.at, channel, quantity, text });
    const perDay = seepRate(s) * 86400;
    o('touch', 'pot', perDay > 20_000 ? '外側がしっとり濡れて、ひんやりする' : perDay > 3_000 ? '外側が少し湿っている' : '外側は乾いている');
    if (s.pot.tar > 0 && potC() > pv('tarSoftC')) o('sight', 'tar', 'タールがやわらかくなって、少し垂れている');
  };
  const snapshot = (): LeakPhys => structuredClone({ pot: d.pot, waterIn: d.waterIn, wall: d.wall, evapF: d.evapF, latentJ: d.latentJ });
  let t = d.lastTo, k = 0;
  while (t < endAt) {
    for (; k < reads.length && reads[k].at <= t; k++) read(reads[k], d);
    const tEnd = subStepEnd(t, d.startMs, STEP_MS, endAt);
    // a read between grid points sees the state at its own time, from a copy: looking never changes the physics (A2)
    for (; k < reads.length && reads[k].at < tEnd; k++) {
      const c = snapshot();
      if (known) advance(c, (reads[k].at - t) / 1000);
      read(reads[k], c);
    }
    if (known) advance(d, (tEnd - t) / 1000);
    t = tEnd;
  }
  if (!known && endAt > req.interval.from) d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const evapInt = Math.floor(d.evapF + 1e-6);
  const cumJ = Math.floor((evapInt / 1e6) * pv('latentHeatWater25') + 1e-9), usedJ = cumJ - d.reportedJ;
  d.reportedJ = cumJ;
  const ending = takeOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt }, state: { schema: LEAK_SCHEMA, data: d },
    status: ending ? (takeOut !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [],
    energy: usedJ > 0 ? [{ sourceId: `src:env-heat:${req.runId}`, kind: 'heat', usedJ, lostJ: usedJ, storedJ: 0 }] : [],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: LEAK_EVAL, sourceRefs: ['S-latent'], notes: 'しみ出し・空気の漏れの基準、壁が水を吸う速さ・乾く速さ、タールが垂れる温度と速さは仮定（出典未照合）。乾く速さは乾燥棚と同じ蒸気圧差' },
    diagnostics: { waterInMg: d.waterIn, wallWaterMg: d.wall, evaporatedMg: d.evapF, coverage: d.pot.coverage, airLeakTauMin: airLeakTauMin(d.pot), historyComplete: d.historyComplete },
  };
  if (!ending) return res;
  const hist = d.historyComplete && d.hist === 1 ? 1 : 0;
  // settle the water: free water left (whole mg, rounded down), what dried off (whole mg, rounded down); the walls
  // take the rest, so the walls can lose water as well as gain it
  const water0 = water?.amount.value ?? 0, total = water0 + d.pot.water;
  const left = Math.max(0, Math.min(total - evapInt, Math.floor(d.waterIn + 1e-6)));
  const potOut: Pot = { ...d.pot, water: total - evapInt - left };
  res.consumed = req.lots.map((l) => ({ lotId: l.lotId, amount: { ...l.amount } }));
  res.produced.push({ materialId: POT, amount: { value: potOut.body + potOut.tar + potOut.water, unit: 'mg' }, into: d.location, quality: { ...potQuality(potOut), history_complete: hist } });
  if (left > 0) res.produced.push({ materialId: 'process_water', amount: { value: left, unit: 'mg' }, into: d.waterLocation, quality: { history_complete: hist } });
  if (evapInt > 0) res.released.push({ materialId: 'water_vapour', amount: { value: evapInt, unit: 'mg' }, to: 'air' });
  // how much the water went down is told only when every stretch of the run was computed (A5)
  if (water0 > 0 && d.historyComplete) {
    const lost = (water0 - left) / water0;
    res.observations.push({ at: endAt, channel: 'sight', quantity: 'water', text: lost > 0.1 ? '中の水がはっきり減っている' : lost > 0.02 ? '中の水が少し減った' : '中の水はほとんど減っていない' });
  }
  return res;
}
