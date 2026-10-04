// ScienceStep for firing a test tile with burning wood (p13w_test_tile_wood_fire), contract 0.2.x (proposed).
//
// The heat comes from a reserved lot of firewood burned inside the run, not from an offer: the fuel lot, the O2
// drawn from the air, the ash left behind and the CO2 and vapour sent up all balance in mg. That is why this step
// needs the proposed 0.2.0 `drawn` field and refuses 0.1.x requests.
//
// The resident tends the fire with the same plan as the test kiln (pace, target glow, hold, forced cooling): the
// world-side law turns it into how fast wood is fed. What it cannot do is burn wood it does not have (the fire dies
// down and the piece cools: 'fuel_exhausted'), or get hotter than the hearth allows (an open fire pit loses most of
// its heat; after a while the tender gives up: 'peak_not_reached').
// A fire needs tending: an interval whose weather is unknown (e.g. a server outage) ends the run 'stopped' with an
// incomplete history, never a fire that burned on by itself.
// Not modelled yet: limited air (smouldering, charcoal), smoke, sparks, wet wood that will not catch, sea salt in
// driftwood. Wood with the air cut off becomes charcoal in a separate step, later.

import type { ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, react, REACTIONS, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { fuelLhvJPerMg, GLOW_TARGET_C, PACE_K_PER_H } from '../physics';
import { allFinite, checkCommon, envUsable, failed, finite, fingerprint, intDelta, intDeltaFloor, subStepEnd, tileComp } from './common';
import { advanceWare, settleWare, type WareState } from './kiln-ware';

export const WOOD_FIRE_PROCESS = { processId: 'p13w_test_tile_wood_fire', processVersion: '0.1.2' } as const;
export const WOOD_FIRE_CONTRACT = /^0\.2\.\d+$/;
const SCHEMA = 'civ-sci.tile-wood-fire/1';
const EVAL = 'tile-wood-fire-eval/0.1.0';
const STEP_MS = 30_000;
const UNLOAD_C = 60;
const RAMP_GIVE_UP_S = 2 * 3600; // past the planned ramp by this long without reaching the glow: the tender gives up
const HEARTHS = ['open_fire_pit', 'fixture_wood_kiln'] as const;
const GLOWS = ['dull_red', 'cherry', 'orange', 'yellow'] as const;
const PACES = ['slow', 'normal', 'fast'] as const;

/** The 0.2.0 result shape (proposed): 0.1.0 plus what the run took from its surroundings. */
export type Drawn = { materialId: string; amount: { value: number; unit: 'mg' }; from: 'air' | 'water' | 'ground' };
export type ScienceStepResultV02 = ScienceStepResult & { drawn: Drawn[] };

type Outcome = 'done' | 'fuel_exhausted' | 'peak_not_reached' | 'stopped' | 'untended';

interface WoodFireData extends WareState {
  tileId: string; tileFp: string; fuelId: string; fuelFp: string; location: string; hearth: string;
  lastTo: number; startMs: number; seed: number;
  fuel: Composition; burnedMg: number; heldBurnKgS: number;
  rampKPerH: number; peakC: number; holdMin: number; forced: boolean; plan: { pace: string; glow: string };
  kilnC: number; peakKilnC: number; ambientC: number;
  phase: 'ramp' | 'hold' | 'cool' | 'done'; elapsedS: number; holdStartS: number | null; outcome: Outcome | null;
  cumUsedJ: number; cumLostJ: number; cumChemJ: number; reportedUsed: number; reportedStored: number;
  historyComplete: boolean;
}

// a refusal speaks the request's contract: `drawn` only in a 0.2.x answer
// a refusal speaks the request's contract (failed() adds `drawn` only to a 0.2.x answer)
const fail = (req: ScienceStepRequest, why: string): ScienceStepResultV02 => failed(req, EVAL, why, SCHEMA) as ScienceStepResultV02;

/** A firewood lot as a composition: water_ppm of the whole lot; ash on the dry part (ash_dry_ppm, else woodAshFrac). */
export function fuelComp(lot: ScienceStepRequest['lots'][number]): Composition | string {
  const q = lot.quality ?? {};
  // up to 80% water: green wood is about 30–60%; a handed-back lot of very wet wood can end a little wetter than it came
  if (!finite(q.water_ppm, 0, 800_000)) return `firewood ${lot.lotId} needs quality.water_ppm (0–800000, of the whole lot)`;
  const ashFrac = q.ash_dry_ppm !== undefined ? q.ash_dry_ppm / 1e6 : pv('woodAshFrac');
  if (!finite(ashFrac, 0, 0.2)) return `firewood ${lot.lotId}: ash_dry_ppm must be within 0–200000`;
  const amount = lot.amount.value;
  const water = Math.round((amount * q.water_ppm) / 1e6);
  const ash = Math.round((amount - water) * ashFrac);
  const c: Composition = {};
  if (water) c.water = water;
  if (ash) c.ash = ash;
  if (amount - water - ash) c.wood_dry = amount - water - ash;
  return c;
}

export function woodFireStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const bad = checkCommon(req, WOOD_FIRE_PROCESS.processId, WOOD_FIRE_PROCESS.processVersion, SCHEMA, WOOD_FIRE_CONTRACT);
  if (bad) return fail(req, bad);
  const tiles = req.lots.filter((l) => ['test_tile_dry', 'test_tile_green'].includes(l.materialId));
  const woods = req.lots.filter((l) => l.materialId === 'firewood');
  if (tiles.length !== 1 || woods.length !== 1 || req.lots.length !== 2) return fail(req, 'expected one unfired test tile lot and one firewood lot');
  if (req.energy.length) return fail(req, 'a wood fire burns its reserved firewood: offer no heat source as well (never count the same fire twice)');
  const tile = tiles[0], wood = woods[0];
  const hearth = req.equipment.find((e) => (HEARTHS as readonly string[]).includes(e.kind));
  const p = hearth?.params ?? {};
  if (req.stop !== 'equipment-lost') {
    if (!hearth) return fail(req, `no hearth: expected one of ${HEARTHS.join(', ')}`);
    if (!finite(p.heatCapJPerK, 1e-9)) return fail(req, `${hearth.kind} params.heatCapJPerK must be finite and > 0`);
    if (!finite(p.chamberFraction, 0, 1)) return fail(req, `${hearth.kind} params.chamberFraction must be within 0..1`);
    for (const k of ['uaWPerK', 'maxBurnKgPerH', 'forcedCoolingUaFactor']) if (!finite(p[k], 0)) return fail(req, `${hearth.kind} params.${k} must be finite and ≥ 0`);
  }

  let d: WoodFireData;
  if (req.state === null) {
    // lost before the fire was lit: nothing happened, nothing to settle (the world cancels the run, releases the lots)
    if (!hearth) return fail(req, req.stop === 'equipment-lost' ? 'the hearth was lost before the fire was lit: nothing burned' : `no hearth: expected one of ${HEARTHS.join(', ')}`);
    let base: Composition;
    try { base = tileComp(tile); } catch (e) { return fail(req, (e as Error).message); }
    if ((base.organic_c ?? 0) > 0) return fail(req, 'organic matter in the body burns out in its own step (not yet): use a body without organic_c');
    if (!finite(tile.quality?.thickness_mm, 0.1, 500)) return fail(req, 'tile needs a finite quality.thickness_mm');
    const fc = fuelComp(wood);
    if (typeof fc === 'string') return fail(req, fc);
    const plan = req.actions.find((a) => a.action === 'fire_plan');
    const pp = plan?.params ?? {};
    const pace = PACES[pp.pace], glow = GLOWS[pp.targetGlow];
    if (!plan || !pace || !glow || !finite(pp.holdMin, 0, 7 * 24 * 60)) return fail(req, 'needs a fire_plan action {pace 0-2, targetGlow 0-3, holdMin, forcedCooling}');
    if (!envUsable(req)) return fail(req, `a fire is lit only with known weather (environment ${req.environment.source})`);
    const Ta = req.environment.airTempC!;
    d = { tileId: tile.lotId, tileFp: fingerprint(tile), fuelId: wood.lotId, fuelFp: fingerprint(wood), location: tile.location, hearth: hearth!.kind,
      lastTo: req.interval.from, startMs: req.interval.from, seed: req.seed, fuel: fc, burnedMg: 0, heldBurnKgS: 0,
      base, ext: { water: 0, organic: 0, dehydrox: 0, calc: 0 }, sinter: 0, thicknessMm: tile.quality!.thickness_mm,
      rampKPerH: PACE_K_PER_H[pace], peakC: GLOW_TARGET_C[glow], holdMin: pp.holdMin, forced: pp.forcedCooling === 1, plan: { pace, glow },
      kilnC: Ta, wareC: Ta, maxWareC: Ta, peakKilnC: Ta, ambientC: Ta, steamRatioMax: 0, duntRatioMax: 0,
      phase: 'ramp', elapsedS: 0, holdStartS: null, outcome: null,
      cumUsedJ: 0, cumLostJ: 0, cumChemJ: 0, reportedUsed: 0, reportedStored: 0, historyComplete: (tile.quality?.history_complete ?? 1) === 1 && (wood.quality?.history_complete ?? 1) === 1 };
  } else {
    d = structuredClone(req.state.data as WoodFireData);
    if (d.tileFp !== fingerprint(tile) || d.fuelFp !== fingerprint(wood)) return fail(req, 'changed-input: a reserved lot changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(req, `noncontiguous-interval: expected from=${d.lastTo}`);
  }

  const known = envUsable(req);
  const fuelTotal = totalMg(d.fuel);
  const lhv = fuelLhvJPerMg(d.fuel); // J per mg as burned (dry LHV less the latent heat of the moisture)
  // The lot burns as it is made up: each mg is part water, part ash, part dry wood. Only the dry wood releases heat
  // (usedJ); the moisture leaves as vapour and its latent heat is a loss. Settling takes whole mg of EACH part.
  const share = (k: 'wood_dry' | 'water' | 'ash') => (d.fuel[k] ?? 0) / fuelTotal;
  const lhvDryJPerMg = pv('woodLhvDry') / 1e6;
  let t = d.lastTo;
  if (known && req.stop !== 'equipment-lost') {
    const Ta = req.environment.airTempC!;
    while (d.phase !== 'done' && t < req.interval.to) {
      const tEnd = subStepEnd(t, d.startMs, STEP_MS, req.interval.to);
      const dt = (tEnd - t) / 1000;
      // the tender's decisions, taken at grid points and held in between (sample-and-hold, like the test kiln)
      if ((t - d.startMs) % STEP_MS === 0) {
        let target: number | null = null, rampKs = 0;
        if (d.phase === 'ramp') {
          target = Math.min(d.peakC, d.ambientC + (d.rampKPerH * d.elapsedS) / 3600);
          rampKs = target < d.peakC ? d.rampKPerH / 3600 : 0;
          if (d.kilnC >= d.peakC - 3) { d.phase = 'hold'; d.holdStartS = d.elapsedS; }
          else if (d.elapsedS > ((d.peakC - d.ambientC) / d.rampKPerH) * 3600 + RAMP_GIVE_UP_S) { d.phase = 'cool'; d.outcome = 'peak_not_reached'; }
        }
        if (d.phase === 'hold') { target = d.peakC; if (d.elapsedS - d.holdStartS! >= d.holdMin * 60) d.phase = 'cool'; }
        if (d.phase !== 'cool' && fuelTotal - d.burnedMg < 1) { d.phase = 'cool'; d.outcome = 'fuel_exhausted'; }
        const want = target !== null && d.phase !== 'cool'
          ? p.heatCapJPerK * rampKs + p.uaWPerK * (target - Ta) + (p.heatCapJPerK * (target - d.kilnC)) / 600 : 0;
        d.heldBurnKgS = lhv > 0 && p.chamberFraction > 0 ? Math.min(Math.max(0, want / (lhv * 1e6 * p.chamberFraction)), p.maxBurnKgPerH / 3600) : 0;
      }
      const burn = Math.min(d.heldBurnKgS * dt * 1e6, fuelTotal - d.burnedMg); // mg of firewood, as it is
      d.burnedMg += burn;
      const released = burn * lhv, chamberIn = released * p.chamberFraction;   // net heat, moisture already boiled off
      const gross = burn * share('wood_dry') * lhvDryJPerMg;                       // heat of the dry wood burned
      const ua = d.phase === 'cool' && d.forced ? p.uaWPerK * p.forcedCoolingUaFactor : p.uaWPerK;
      const wall = ua * (d.kilnC - Ta) * dt;
      const { sens, latent, chem } = advanceWare(d, d.kilnC, dt);
      d.kilnC += (chamberIn - wall - sens - latent - chem) / p.heatCapJPerK;
      d.peakKilnC = Math.max(d.peakKilnC, d.kilnC);
      d.cumUsedJ += gross; d.cumLostJ += (gross - chamberIn) + wall + latent; d.cumChemJ += chem;
      d.elapsedS += dt; t = tEnd;
      if (d.phase === 'cool' && d.wareC < UNLOAD_C && (t - d.startMs) % STEP_MS === 0) { d.phase = 'done'; d.outcome ??= 'done'; }
    }
  } else if (!known) { d.historyComplete = false; d.outcome = 'untended'; }

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
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-thermo', 'S-latent', 'S-wood', 'S-kilneff', 'S-kaol', 'S-quartz', 'S-steam', 'S-abs'],
      notes: '燃焼の量比（CH1.44O0.66）と CO2・水の生成熱の考え方は出典あり。木の発熱量・灰分・炉に入る熱の割合・炉の熱容量は仮定。空気の不足（くすぶり・炭化）は扱わない' },
    diagnostics: { phase: d.phase, outcome: d.outcome, kilnC: d.kilnC, wareC: d.wareC, maxWareC: d.maxWareC, peakKilnC: d.peakKilnC,
      sinter: d.sinter, burnedMg: d.burnedMg, burnKgPerH: d.heldBurnKgS * 3600, plan: d.plan },
  };
  if (ending) {
    const ware = settleWare({ w: d, lot: tile, location: d.location, seed: d.seed, runId: req.runId, endAt,
      done, peakKilnC: d.peakKilnC, historyComplete: d.historyComplete });
    // the firewood: each part (dry wood, water, ash) is settled as burned rounded UP to whole mg, never more than
    // the lot holds. The heat reported is that of the exact dry wood burned (cumulative, floored to J), so it never
    // exceeds the heat of the dry wood settled: a run stopped after a fraction of a mg uses up 1 mg of dry wood (with
    // its O2) and cannot report heat from wood it hands back.
    const taken: Composition = {};
    for (const k of ['wood_dry', 'water', 'ash'] as const) {
      const n = Math.min(d.fuel[k] ?? 0, Math.ceil(d.burnedMg * share(k) - 1e-6));
      if (n > 0) taken[k] = n;
    }
    const rest = addComp(d.fuel, taken, -1);
    const r = react('wood_dry', taken.wood_dry ?? 0, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
    const vapour = (taken.water ?? 0) + (r.produced.water ?? 0), co2 = r.produced.co2 ?? 0, o2 = r.consumed.o2 ?? 0;
    res.consumed = [...ware.consumed, { lotId: d.fuelId, amount: { value: fuelTotal, unit: 'mg' } }];
    res.produced = [...ware.produced];
    if (totalMg(rest) > 0) {
      // fractions kept unrounded, so the returned lot reads back (fuelComp) to exactly these mg: rounding them to whole
      // ppm would turn up to half a ppm of the lot from water into wood, or back, on every return
      const restQ: Record<string, number> = { ...(wood.quality ?? {}), water_ppm: ((rest.water ?? 0) * 1e6) / totalMg(rest) };
      const restDry = totalMg(rest) - (rest.water ?? 0);
      restQ.ash_dry_ppm = restDry > 0 ? ((rest.ash ?? 0) * 1e6) / restDry : 0;
      res.produced.push({ materialId: 'firewood', amount: { value: totalMg(rest), unit: 'mg' }, quality: restQ, into: wood.location });
    }
    if (taken.ash) res.produced.push({ materialId: 'wood_ash', amount: { value: taken.ash, unit: 'mg' }, into: d.location });
    const rel = new Map<string, number>(ware.released.map((x) => [x.materialId, x.amount.value]));
    rel.set('water_vapour', (rel.get('water_vapour') ?? 0) + vapour);
    rel.set('process_co2', (rel.get('process_co2') ?? 0) + co2);
    res.released = [...rel].filter(([, v]) => v > 0).map(([materialId, v]) => ({ materialId, amount: { value: v, unit: 'mg' as const }, to: 'air' as const }));
    if (o2 > 0) res.drawn = [{ materialId: 'o2', amount: { value: o2, unit: 'mg' }, from: 'air' }];
    res.observations = [...ware.observations];
    if (d.outcome === 'fuel_exhausted') res.observations.push({ at: endAt, channel: 'sight', quantity: 'fire', text: '薪が尽きて、火が小さくなっていった' });
    if (d.outcome === 'peak_not_reached') res.observations.push({ at: endAt, channel: 'sight', quantity: 'fire', text: 'いくら薪を足しても、思った火の色にならなかった' });
    if (d.outcome === 'untended') res.observations.push({ at: endAt, channel: 'sight', quantity: 'fire', text: '見ていない間に火が落ちていた' });
    if (taken.ash) res.observations.push({ at: endAt, channel: 'sight', quantity: 'ash', text: '白っぽい灰が残った' });
    if (totalMg(rest) > 0 && totalMg(taken) > 0) res.observations.push({ at: endAt, channel: 'sight', quantity: 'fuel', text: '薪が少し残った' });
    // (the drawn O2 and the gases are not observations: nobody sees them; the world records them as flows)
  }
  return res;
}
