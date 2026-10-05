// ScienceStep for preparing raw clay: soak, sieve, let it settle, pour off the clear water, let it thicken
// (process p10x_clay_slake), contract 0.1.x / 0.2.x. Waiting process: on the island clock.
//
// The world brings a raw_clay lot (as dug, carried home by Dot) and a process_water lot; both go into the tub at the
// start. The raw clay's make-up comes with the lot, fixed per place it was dug:
//   water_ppm          water / lot mass
//   xd_<species>_ppm   the dry part (as the test tiles carry it); what is not listed is inert_mineral
//   xc_<species>_ppm   of the dry part, what is coarse (stones, sand, roots): it stays on the sieve.
//                      xc_inert_mineral_ppm may name coarse inert stone.
// What happens (each is a simple law with assumed constants, see params.ts):
//   - the lumps fall apart in the water: share dispersed 1 − e^(−t/τ), τ longer for moist clay (slakeTauDryS)
//   - sieve (once): the coarse part and the lumps not yet dispersed stay on the cloth, with some water; a slip too
//     thick to pass does not go through (nothing happens)
//   - after sieving the fine part settles: the sediment's water ratio goes from the slip's toward slipSettledWaterRatio
//     (slipSettleTauS); decant pours off the water above it (integer mg at that moment)
//   - all the while water evaporates from the open surface (Dalton type, as the drying rack), when the weather is known
//   - take_out ends the run: settled_clay (the fine part with its water), the sieve residue, the poured-off water and
//     the vapour settle once. Taken out before sieving, it comes back as raw_clay (wetter, same make-up).
// Not modelled: fines lost with the poured water, rain falling into the tub (it stands under the roof), the slip's
// own chemistry (salts, organic matter decaying), temperature effects on settling.

import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, SPECIES, splitComp, totalMg, type Composition, type SpeciesId } from '../chem';
import { pv } from '../params';
import { pSat } from '../physics';
import { allFinite, checkCommon, contractExtras, envUsable, failed, fingerprint, finite, isInt, subStepEnd, tileQuality, wind10m } from './common';

export const SLAKE_PROCESS = { processId: 'p10x_clay_slake', processVersion: '0.1.0' } as const;
const SCHEMA = 'civ-sci.clay-slake/1';
const EVAL = 'clay-slake-eval/0.1.0';
const TUB = 'fixture_clay_tub';
const STEP_MS = 30_000;
const SOLID_DENSITY = 2.6; // g/cm³ of the dry part, for the tub's capacity only (assumed)

interface SlakeData {
  rawId: string; waterId: string; fps: string[]; eqId: string; eqFp: string; location: string;
  areaM2: number; sun: number;                 // the tub as it was set up (kept: a tub lost at interval.to still stood until then)
  startMs: number; lastTo: number; seed: number;
  fine: Composition; coarse: Composition;      // the dry part (integer mg), as it went in
  rawWaterRatio: number;                       // water / dry of the raw clay (sets how fast it falls apart)
  waterMg: number;                             // water in the tub (float: evaporation)
  evaporatedMg: number; latentJ: number; reportedJ: number;
  sievedAt: number;                            // -1 before sieving
  residue: Composition; residueWaterMg: number; // what stayed on the cloth (integer mg)
  tubDry: Composition;                         // the dry part in the tub (integer mg): everything before sieving, the fine part after
  slipRatioAtSieve: number;
  decantedMg: number;                          // integer mg poured off so far
  historyComplete: boolean; hist: number;
}

/** Read a raw_clay lot: water, the dry part, and which of it is coarse. Throws with a reason. */
export function readRawClay(lot: LotView): { water: number; fine: Composition; coarse: Composition } {
  const q = lot.quality ?? {};
  const w = q.water_ppm;
  if (!(isInt(w) && w < 1e6)) throw new Error('raw-clay-water-missing: quality.water_ppm (whole ppm, < 1000000)');
  const water = Math.round((lot.amount.value * w) / 1e6), dry = lot.amount.value - water;
  const dryComp: Composition = {};
  let listed = 0, xd = 0;
  for (const [k, v] of Object.entries(q)) {
    const m = /^xd_(.+)_ppm$/.exec(k);
    if (!m) continue;
    if (!Object.hasOwn(SPECIES, m[1]) || m[1] === 'water' || m[1] === 'inert_mineral') throw new Error(`raw-clay-unknown-species: ${m[1]}`);
    if (!isInt(v)) throw new Error('raw-clay-not-whole-ppm');
    xd += v;
    const mg = Math.round((dry * v) / 1e6);
    if (mg > 0) { dryComp[m[1] as SpeciesId] = mg; listed += mg; }
  }
  if (xd === 0) throw new Error('raw-clay-make-up-missing: xd_<species>_ppm');
  if (xd > 1e6 || listed > dry) throw new Error('raw-clay-make-up-exceeds-dry-part');
  if (dry - listed > 0) dryComp.inert_mineral = dry - listed;
  const coarse: Composition = {};
  for (const [k, v] of Object.entries(q)) {
    const m = /^xc_(.+)_ppm$/.exec(k);
    if (!m) continue;
    if (!Object.hasOwn(SPECIES, m[1]) || m[1] === 'water') throw new Error(`raw-clay-unknown-species: ${m[1]}`);
    if (!isInt(v)) throw new Error('raw-clay-not-whole-ppm');
    const mg = Math.round((dry * v) / 1e6);
    const avail = dryComp[m[1] as SpeciesId] ?? 0;
    // a few mg over is the rounding of two ppm values of the same species: take all of it
    if (mg > avail + 2) throw new Error(`raw-clay-coarse-exceeds-${m[1]}: xc_ is a share of the whole dry part`);
    if (Math.min(mg, avail) > 0) coarse[m[1] as SpeciesId] = Math.min(mg, avail);
  }
  return { water, fine: addComp(dryComp, coarse, -1), coarse };
}

/** What a hand feels in a lump of clay at this water ratio (water / dry). Shared with kneading. */
export function clayFeel(wr: number): string {
  const p = pv('clayWaterPlastic');
  if (wr > 0.9) return 'どろどろで、すくうと流れ落ちる';
  if (wr > 0.45) return 'やわらかく、手にべったりつく';
  if (wr > p + 0.06) return '少しやわらかいが、なんとかまとまる';
  if (wr >= p - 0.06) return '手につかず、よくまとまる';
  if (wr >= pv('clayWaterCritical')) return '固く、曲げるとひびが入る';
  return '乾いて固まっている';
}

const tubVolumeMl = (waterMg: number, dryMg: number) => waterMg / 1000 + dryMg / 1000 / SOLID_DENSITY;

export function slakeStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, SLAKE_PROCESS.processId, SLAKE_PROCESS.processVersion, SCHEMA);
  if (bad) return failed(req, EVAL, bad, SCHEMA);
  const raws = req.lots.filter((l) => l.materialId === 'raw_clay'), waters = req.lots.filter((l) => l.materialId === 'process_water');
  if (raws.length !== 1 || waters.length !== 1 || req.lots.length !== 2) return failed(req, EVAL, 'expected one raw_clay lot and one process_water lot', SCHEMA);
  const raw = raws[0], water = waters[0];
  const tub = req.equipment.find((e) => e.kind === TUB);
  if (!tub && req.stop !== 'equipment-lost') return failed(req, EVAL, `no ${TUB}`, SCHEMA);
  if (req.energy.length) return failed(req, EVAL, 'soaking and settling use no offered energy (evaporation takes its heat from the air)', SCHEMA);
  const fps = [fingerprint(raw), fingerprint(water)];
  const eqFp = tub ? JSON.stringify([tub.equipmentId, Object.entries(tub.params ?? {}).sort(([a], [b]) => a.localeCompare(b))]) : '';
  for (const a of req.actions) {
    if (!['sieve', 'decant', 'take_out'].includes(a.action)) return failed(req, EVAL, `unknown action ${a.action} (sieve, decant, take_out)`, SCHEMA);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return failed(req, EVAL, `${a.action} must fall inside the interval`, SCHEMA);
  }

  let d: SlakeData;
  if (req.state === null) {
    if (!tub) return failed(req, EVAL, 'the tub was lost before anything went in: nothing happened', SCHEMA);
    const area = tub.params?.surfaceCm2, cap = tub.params?.capacityMl, sun = tub.params?.sunExposure ?? 0;
    if (!finite(area, 1, 1e5) || !finite(cap, 1, 1e6) || !finite(sun, 0, 1)) return failed(req, EVAL, `${TUB} needs params surfaceCm2 (1..100000), capacityMl (1..1000000), sunExposure 0..1`, SCHEMA);
    let rc: ReturnType<typeof readRawClay>;
    try { rc = readRawClay(raw); } catch (e) { return failed(req, EVAL, (e as Error).message, SCHEMA); }
    const dry = totalMg(rc.fine) + totalMg(rc.coarse), w = rc.water + water.amount.value;
    if (dry <= 0) return failed(req, EVAL, 'the raw clay has no dry part', SCHEMA);
    if (w < pv('slipMinWaterRatio') * dry) return failed(req, EVAL, `not enough water to cover the clay and make a slip: at least ${pv('slipMinWaterRatio')} times the dry clay`, SCHEMA);
    if (tubVolumeMl(w, dry) > cap) return failed(req, EVAL, 'the clay and the water do not fit in the tub', SCHEMA);
    d = { rawId: raw.lotId, waterId: water.lotId, fps, eqId: tub.equipmentId, eqFp, location: raw.location, areaM2: area / 1e4, sun,
      startMs: req.interval.from, lastTo: req.interval.from, seed: req.seed,
      fine: rc.fine, coarse: rc.coarse, rawWaterRatio: rc.water / dry, waterMg: w,
      evaporatedMg: 0, latentJ: 0, reportedJ: 0, sievedAt: -1, residue: {}, residueWaterMg: 0,
      tubDry: addComp(rc.fine, rc.coarse), slipRatioAtSieve: 0, decantedMg: 0, historyComplete: true,
      hist: Math.min(raw.quality?.history_complete ?? 1, water.quality?.history_complete ?? 1) };
  } else {
    d = structuredClone(req.state.data as SlakeData);
    if (d.fps.join('|') !== fps.join('|')) return failed(req, EVAL, 'changed-input: a reserved lot changed under a running run', SCHEMA);
    if (tub && eqFp !== d.eqFp) return failed(req, EVAL, 'changed-input: the tub changed under a running run', SCHEMA);
    if (req.interval.from !== d.lastTo) return failed(req, EVAL, `noncontiguous-interval: expected from=${d.lastTo}; send a missed interval with environment.source 'unknown'`, SCHEMA);
  }
  const area = d.areaM2, sun = d.sun;

  const takeOut = req.actions.filter((a) => a.action === 'take_out').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = takeOut ?? req.interval.to;
  const acts = req.actions.filter((a) => a.action !== 'take_out' && a.at < endAt).sort((x, y) => x.at - y.at || (x.action < y.action ? 1 : -1));
  const env = req.environment;
  const known = envUsable(req) && env.humidity !== undefined;
  const observations: Observation[] = [];
  const tubDryMg = () => totalMg(d.tubDry);

  const evaporate = (dtS: number) => {
    if (!known || dtS <= 0) return;
    const wr = d.waterMg / tubDryMg(), wc = pv('clayWaterCritical'), weq = pv('clayWaterEqAt70RH') * (env.humidity! / 0.7);
    const ts = env.airTempC! + pv('sunSurfaceExcessC') * sun;
    const deficit = Math.max(0, pSat(ts) - env.humidity! * pSat(env.airTempC!));
    const factor = wr > wc ? 1 : Math.max(0, (wr - weq) / (wc - weq));
    const e = Math.min(Math.max(0, d.waterMg - weq * tubDryMg()), pv('evapCoeff') * (1 + 0.5 * wind10m(req) * pv('windRackFactor')) * deficit * factor * area * dtS * 1e6);
    d.waterMg -= e; d.evaporatedMg += e; d.latentJ += (e / 1e6) * pv('latentHeatWater25');
  };
  const dispersed = (at: number) => {
    const tau = pv('slakeTauDryS') * (1 + (4 * d.rawWaterRatio) / pv('clayWaterPlastic'));
    return 1 - Math.exp(-(at - d.startMs) / 1000 / tau);
  };
  const act = (a: ScienceStepRequest['actions'][number]) => {
    if (a.action === 'sieve') {
      if (d.sievedAt >= 0) { observations.push({ at: a.at, channel: 'sight', quantity: 'sieve', text: 'もうこしてある。こし布には何も残らない' }); return; }
      if (d.waterMg < pv('slipSievableRatio') * tubDryMg()) {
        observations.push({ at: a.at, channel: 'sight', quantity: 'sieve', text: '泥が濃すぎて、こし布を通らない' }); return;
      }
      const fineDry = totalMg(d.fine);
      const lumpsMg = Math.round(fineDry * (1 - dispersed(a.at)));
      const lumps = splitComp(d.fine, lumpsMg);
      d.residue = addComp(d.coarse, lumps.taken);
      d.residueWaterMg = Math.min(Math.floor(d.waterMg), Math.round(pv('sieveResidueWaterRatio') * totalMg(d.residue)));
      d.waterMg -= d.residueWaterMg;
      d.tubDry = lumps.rest;
      d.sievedAt = a.at;
      d.slipRatioAtSieve = tubDryMg() > 0 ? d.waterMg / tubDryMg() : 0;
      const rawDry = totalMg(d.fine) + totalMg(d.coarse), cs = totalMg(d.coarse) / rawDry;
      const parts = [`こし布に小石や砂が${cs < 0.02 ? '少し' : cs < 0.1 ? 'かなり' : 'たくさん'}残った`];
      if ((d.coarse.organic_c ?? 0) > 0) parts.push('根や草のくずも混じっている');
      if (lumpsMg / rawDry > 0.05) parts.push('溶けきらない土の塊も残った');
      observations.push({ at: a.at, channel: 'sight', quantity: 'sieve', text: parts.join('。') });
    } else if (a.action === 'decant') {
      if (d.sievedAt < 0) { observations.push({ at: a.at, channel: 'sight', quantity: 'decant', text: 'こす前の泥は、上の水だけを分けられない' }); return; }
      const e = Math.exp(-(a.at - d.sievedAt) / 1000 / pv('slipSettleTauS'));
      const sedRatio = pv('slipSettledWaterRatio') + (d.slipRatioAtSieve - pv('slipSettledWaterRatio')) * e;
      const pour = Math.max(0, Math.floor(d.waterMg - Math.max(sedRatio, pv('slipSettledWaterRatio')) * tubDryMg()));
      d.waterMg -= pour; d.decantedMg += pour;
      observations.push({ at: a.at, channel: 'sight', quantity: 'decant',
        text: pour === 0 ? '上に分かれた水はない' : e > 0.5 ? '上の水はまだ濁っていて、少ししか捨てられない' : e > 0.1 ? '上の水は少し濁っている' : '上の水は澄んでいる' });
    }
  };

  let t = d.lastTo, k = 0;
  while (t < endAt) {
    const tEnd = Math.min(subStepEnd(t, d.startMs, STEP_MS, endAt), k < acts.length ? Math.max(acts[k].at, t) : Infinity);
    evaporate((tEnd - t) / 1000);
    t = tEnd;
    for (; k < acts.length && acts[k].at <= t; k++) act(acts[k]);
  }
  for (; k < acts.length; k++) act(acts[k]); // actions at the very start of a zero-length remainder
  if (!known && endAt > req.interval.from) d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d)) return failed(req, EVAL, 'non-finite state: refusing to return it', SCHEMA);

  // heat for the vapour, from the whole mg evaporated so far (as the drying rack)
  const evapInt = Math.floor(d.evaporatedMg + 1e-6);
  const cumJ = Math.floor((evapInt / 1e6) * pv('latentHeatWater25') + 1e-9), usedJ = cumJ - d.reportedJ;
  d.reportedJ = cumJ;
  const ending = takeOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt }, state: { schema: SCHEMA, data: d },
    status: ending ? (takeOut !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [],
    energy: usedJ > 0 ? [{ sourceId: `src:env-heat:${req.runId}`, kind: 'heat', usedJ, lostJ: usedJ, storedJ: 0 }] : [],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-slake', 'S-dry'],
      notes: 'ほぐれ・沈み・こし布に残る水・沈んだ泥の含水比はすべて仮定（出典なし）。蒸発は乾燥棚と同じ Dalton 型（校正値）。注いだ水と出る細かい粒、雨、塩類は扱わない' },
    diagnostics: { dispersed: dispersed(endAt), waterRatio: d.waterMg / Math.max(1, tubDryMg()), sieved: d.sievedAt >= 0,
      decantedMg: d.decantedMg, evaporatedMg: d.evaporatedMg, historyComplete: d.historyComplete },
  };
  if (!ending) return res;

  // settle once: everything that went in comes out, in whole mg
  const hist = d.historyComplete && d.hist === 1 ? 1 : 0;
  const waterLeft = raw.amount.value + water.amount.value - totalMg(d.fine) - totalMg(d.coarse) - evapInt - d.decantedMg - d.residueWaterMg;
  res.consumed = [{ lotId: raw.lotId, amount: { ...raw.amount } }, { lotId: water.lotId, amount: { ...water.amount } }];
  const clayComp = addComp(d.tubDry, waterLeft > 0 ? { water: waterLeft } : {});
  if (d.sievedAt >= 0) {
    if (totalMg(clayComp) > 0) res.produced.push({ materialId: 'settled_clay', amount: { value: totalMg(clayComp), unit: 'mg' }, into: d.location,
      quality: { ...tileQuality(clayComp), history_complete: hist } });
    const resComp = addComp(d.residue, d.residueWaterMg > 0 ? { water: d.residueWaterMg } : {});
    if (totalMg(resComp) > 0) res.produced.push({ materialId: 'clay_sieve_residue', amount: { value: totalMg(resComp), unit: 'mg' }, into: d.location,
      quality: { ...tileQuality(resComp), history_complete: hist } });
  } else {
    // not sieved: the raw clay comes back, wetter, with the same make-up (what is coarse stays coarse)
    const q = tileQuality(clayComp), dry = totalMg(d.tubDry);
    for (const [sp, mg] of Object.entries(d.coarse)) if (mg) q[`xc_${sp}_ppm`] = Math.round((mg * 1e6) / dry);
    res.produced.push({ materialId: 'raw_clay', amount: { value: totalMg(clayComp), unit: 'mg' }, into: d.location, quality: { ...q, history_complete: hist } });
  }
  if (d.decantedMg > 0) res.produced.push({ materialId: 'process_water', amount: { value: d.decantedMg, unit: 'mg' }, into: water.location, quality: {} });
  if (evapInt > 0) res.released.push({ materialId: 'water_vapour', amount: { value: evapInt, unit: 'mg' }, to: 'air' });
  const wr = waterLeft / Math.max(1, tubDryMg());
  res.observations.push({ at: endAt, channel: 'touch', quantity: 'feel', text: d.sievedAt >= 0 ? clayFeel(wr) : `こす前の泥。${clayFeel(wr)}` });
  return res;
}
