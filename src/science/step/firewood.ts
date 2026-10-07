// ScienceStep for drying firewood in a stack (p15x_firewood_dry), contract 0.2.x only (rain on an open stack is drawn
// from the air). Island clock: a waiting process.
//
// Freshly cut wood holds about as much water as wood (45 % of its wet mass). In a stack it dries toward the moisture
// the air allows (the equilibrium moisture content, EMC), first fast, then slower:
//     dMC/dt = −(MC − EMC) / τ          MC = water / dry wood
// EMC follows the Hailwood–Horrobin form of the USDA Wood Handbook (T in °C, h relative humidity at the wood); about
// 14 % at 28 °C and 75 %. The wood's temperature is the air's plus a sun excess, so a sunny stack sees drier air.
// τ grows with the square of the piece's thickness and shortens with wind at the stack and with warmth (all assumed:
// about a month for 6 cm pieces in shade at 28 °C with a light wind — split wood under a roof is ready in a few months).
// Wood that is already drier than the air allows stays as it is (taking moisture back from humid air is not modelled).
// An open stack (no roof) takes up a part of the rain that falls on its top, up to a soaked surface (drawn from the
// air); a roofed stack is also in shade. An open stack with the rain unknown is not computed (nothing invented).
// Weather unknown (temperature, humidity or wind missing; an explicit wind of 0 is calm), or the wood's temperature
// outside the EMC fit (−1.1..98.9 °C): the interval is not computed, the history is incomplete, and the run observes
// nothing more. The water never goes below 0.
// Looking never touches the wood; a look between grid points reads the state at its own time from a copy.

import type { Observation, ScienceStepRequest } from '../../world/science-contract';
import { pv } from '../params';
import { pSat } from '../physics';
import { allFinite, checkCommon, envUsable, failed, fingerprint, finite, subStepEnd, wind10m } from './common';
import { fuelComp, type ScienceStepResultV02 } from './wood-fire';

export const FIREWOOD_DRY_PROCESS = { processId: 'p15x_firewood_dry', processVersion: '0.1.1' } as const;
const SCHEMA = 'civ-sci.firewood-dry/1', EVAL = 'firewood-dry-eval/0.1.1';
const STACK = 'firewood_stack';
const STEP_MS = 30_000;

/** Where the Hailwood–Horrobin form is used: the temperatures of the Wood Handbook's Table 4-2 (−1.1..98.9 °C). The table's
 *  relative humidities are 5..95 %; above 98 % the form evaluated at h = 0.98 is held (maxH, this step's own assumption). */
export const EMC_RANGE = { minC: -1.1, maxC: 98.9, maxH: 0.98 } as const;
/** Equilibrium moisture content of wood (kg water / kg dry wood) at T °C and relative humidity h (0..1):
 *  Hailwood–Horrobin, USDA Wood Handbook eq. 4-5 (metric form). null outside the table's temperatures (not computed
 *  there). The table's humidities are 5..95 %; the form is also evaluated below 5 % and up to 98 %, and above 98 % it is
 *  held at its value for h = 0.98: not a table value, an assumption of this step (Codex C1 on 29521cb / 511f647). */
export function woodEmc(T: number, h: number): number | null {
  if (!(T >= EMC_RANGE.minC && T <= EMC_RANGE.maxC) || !(h >= 0 && h <= 1)) return null;
  const W = 349 + 1.29 * T + 0.0135 * T * T;
  const K = 0.805 + 0.000736 * T - 0.00000273 * T * T;
  const K1 = 6.27 - 0.00938 * T - 0.000303 * T * T;
  const K2 = 1.91 + 0.0407 * T - 0.000293 * T * T;
  const Kh = K * Math.min(h, EMC_RANGE.maxH);
  return (1800 / W) * (Kh / (1 - Kh) + (K1 * Kh + 2 * K1 * K2 * Kh * Kh) / (1 + K1 * Kh + K1 * K2 * Kh * Kh)) / 100;
}

interface Wood { water: number; dry: number; rainIn: number; evapF: number }
interface FwData extends Wood {
  fps: string[]; eqFp: string; startMs: number; lastTo: number; location: string; amount0: number; water0: number;
  pieceMm: number; sun: number; covered: boolean; topM2: number; quality0: Record<string, number>;
  reportedJ: number; historyComplete: boolean; hist: number;
}

export function firewoodDryStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const fail = (why: string) => failed(req, EVAL, why, SCHEMA) as ScienceStepResultV02;
  const bad = checkCommon(req, FIREWOOD_DRY_PROCESS.processId, FIREWOOD_DRY_PROCESS.processVersion, SCHEMA, /^0\.2\.\d+$/);
  if (bad) return fail(bad);
  const woods = req.lots.filter((l) => l.materialId === 'firewood');
  if (woods.length !== 1 || req.lots.length !== 1) return fail('expected one firewood lot');
  if (req.energy.length) return fail('waiting uses no offered energy');
  const stack = req.equipment.find((e) => e.kind === STACK);
  if (!stack && req.stop !== 'equipment-lost') return fail(`no ${STACK} (where the wood is stacked)`);
  for (const a of req.actions) {
    if (!['look', 'take_out'].includes(a.action)) return fail(`unknown action ${a.action} (look, take_out)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
  }
  const lot = woods[0];
  const fps = req.lots.map(fingerprint).sort();
  const eqFp = JSON.stringify([stack?.equipmentId, Object.entries(stack?.params ?? {}).sort(([x], [y]) => x.localeCompare(y))]);
  let d: FwData;
  if (req.state === null) {
    if (!stack) return fail('the stack was lost before the wood was put on it: nothing happened');
    const p = stack.params ?? {};
    if (!finite(p.sunExposure ?? 0, 0, 1)) return fail(`${STACK} params.sunExposure must be within 0..1`);
    if (![0, 1].includes(p.covered)) return fail(`${STACK} params.covered must be 0 (open) or 1 (under a roof)`);
    if (!finite(p.topAreaM2 ?? pv('woodStackTopM2'), 0.01, 100)) return fail(`${STACK} params.topAreaM2 must be within 0.01..100`);
    const comp = fuelComp(lot);
    if (typeof comp === 'string') return fail(comp);
    const q = lot.quality ?? {};
    const pieceMm = q.piece_mm ?? pv('woodPieceMm');
    if (!finite(pieceMm, 5, 500)) return fail(`firewood ${lot.lotId}: piece_mm must be within 5..500`);
    const water = comp.water ?? 0, dry = lot.amount.value - water;
    if (dry <= 0) return fail(`firewood ${lot.lotId} has no wood in it`);
    d = { fps, eqFp, startMs: req.interval.from, lastTo: req.interval.from, location: lot.location, amount0: lot.amount.value, water0: water,
      water, dry, rainIn: 0, evapF: 0, pieceMm, sun: p.covered === 1 ? 0 : (p.sunExposure ?? 0), covered: p.covered === 1,
      topM2: p.topAreaM2 ?? pv('woodStackTopM2'), quality0: { ...q }, reportedJ: 0, historyComplete: true, hist: (q.history_complete ?? 1) === 1 ? 1 : 0 };
  } else {
    d = structuredClone(req.state.data as FwData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the stack changed under a running run (send stop equipment-lost when it is lost)');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}; send a missed interval with environment.source 'unknown'`);
  }
  const takeOut = req.actions.filter((a) => a.action === 'take_out').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = takeOut ?? req.interval.to;
  const reads = req.actions.filter((a) => a.action === 'look' && a.at < endAt).sort((x, y) => x.at - y.at);
  const env = req.environment;
  const rain = env.rainMmH;
  // the drying needs temperature, humidity and the wind (a missing wind is unknown, an explicit 0 is calm: Codex A2);
  // an open stack needs the rain too; a roofed one does not. Outside the EMC fit's temperatures nothing is computed (A1).
  const weather = envUsable(req) && env.humidity !== undefined && env.windMs !== undefined && (d.covered || (rain !== undefined && finite(rain, 0, 1000)));
  const Tw = weather ? env.airTempC! + pv('sunSurfaceExcessC') * d.sun : NaN;
  const hWood = weather ? Math.min(1, (env.humidity! * pSat(env.airTempC!)) / pSat(Tw)) : NaN;
  const emcOrNull = weather ? woodEmc(Tw, hWood) : null;
  const known = emcOrNull !== null;
  const emc = emcOrNull ?? NaN;
  const windStack = known ? wind10m(req) * pv('windRackFactor') : NaN, windRef = 2 * pv('windRackFactor');
  const tauS = known ? (pv('woodDryTauRefDays') * 86400 * (d.pieceMm / pv('woodPieceMm')) ** 2)
    / (((1 + 0.15 * windStack) / (1 + 0.15 * windRef)) * 2 ** ((Tw - 28) / 15)) : NaN;
  const raining = known && !d.covered && rain! > 0;
  /** Advance the wood by dt seconds (known weather only). */
  const advance = (s: Wood, dt: number) => {
    const mc = s.water / s.dry;
    if (mc > emc) {
      const e = Math.min(s.water, (mc - emc) * s.dry * (1 - Math.exp(-dt / tauS)));
      s.water -= e; s.evapF += e;
    }
    if (raining) {
      // a part of the rain on the stack's top soaks in, up to a soaked surface
      const supply = (rain! / 3600) * d.topM2 * 1e6 * pv('woodRainCapture') * dt; // mg (1 mm on 1 m² = 1 kg)
      const room = Math.max(0, pv('woodRainMcMax') * s.dry - s.water);
      const w = Math.min(supply, room);
      s.water += w; s.rainIn += w;
    }
  };
  const observations: Observation[] = [];
  const read = (at: number, s: Wood) => {
    if (!known || !d.historyComplete) return;
    const wb = s.water / (s.water + s.dry);
    const o = (channel: Observation['channel'], quantity: string, text: string) => observations.push({ at, channel, quantity, text });
    o('touch', 'wood', wb > 0.35 ? '切り口が湿っていて、持つと重い' : wb > 0.22 ? '切り口に細かいひびが出てきて、少し軽くなった' : '乾いて軽い。打ち合わせると乾いた音がする');
    if (raining) o('sight', 'wood', '雨で表面が濡れている');
  };
  const snapshot = (): Wood => ({ water: d.water, dry: d.dry, rainIn: d.rainIn, evapF: d.evapF });
  let t = d.lastTo, k = 0;
  while (t < endAt) {
    for (; k < reads.length && reads[k].at <= t; k++) read(reads[k].at, d);
    const tEnd = subStepEnd(t, d.startMs, STEP_MS, endAt);
    for (; k < reads.length && reads[k].at < tEnd; k++) {
      const c = snapshot();
      if (known) advance(c, (reads[k].at - t) / 1000);
      read(reads[k].at, c);
    }
    if (known) advance(d, (tEnd - t) / 1000);
    t = tEnd;
  }
  if (!known && endAt > req.interval.from) d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d) || d.water < 0) return fail('non-finite or negative state: refusing to return it');
  const evapInt = Math.floor(d.evapF + 1e-6), rainInt = Math.floor(d.rainIn + 1e-6);
  const cumJ = Math.floor((evapInt / 1e6) * pv('latentHeatWater25') + 1e-9), usedJ = cumJ - d.reportedJ;
  d.reportedJ = cumJ;
  const ending = takeOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt }, state: { schema: SCHEMA, data: d },
    status: ending ? (takeOut !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    energy: usedJ > 0 ? [{ sourceId: `src:env-heat:${req.runId}`, kind: 'heat', usedJ, lostJ: usedJ, storedJ: 0 }] : [],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-latent'], notes: '平衡含水率は Wood Handbook の Hailwood–Horrobin 式（原典未照合）。乾く時定数・太さ・風・温度・日なた・雨の取り込みは仮定' },
    diagnostics: { waterRatio: d.water / d.dry, emc: known ? emc : null, tauDays: known ? tauS / 86400 : null, evaporatedMg: d.evapF, rainInMg: d.rainIn, historyComplete: d.historyComplete },
  };
  if (!ending) return res;
  const hist = d.historyComplete && d.hist === 1 ? 1 : 0;
  const out = d.amount0 + rainInt - evapInt, waterOut = d.water0 + rainInt - evapInt;
  res.consumed = [{ lotId: req.lots[0].lotId, amount: { ...req.lots[0].amount } }];
  res.produced = [{ materialId: 'firewood', amount: { value: out, unit: 'mg' }, into: d.location,
    quality: { ...d.quality0, water_ppm: (waterOut * 1e6) / out, history_complete: hist } }];
  if (evapInt > 0) res.released.push({ materialId: 'water_vapour', amount: { value: evapInt, unit: 'mg' }, to: 'air' });
  if (rainInt > 0) res.drawn.push({ materialId: 'rain_water', amount: { value: rainInt, unit: 'mg' }, from: 'air' });
  return res;
}
