// Coconut oil, the first oil for the lamp. Two steps, one clock each (ADR 0006):
//
// p30x_coconut_milk (world clock, hand work, contract 0.1.x / 0.2.x)
//   Drift coconuts are husked on a stake, cracked, the white meat grated and squeezed through a cloth, with water
//   added or not. In: one `coconut` lot (quality.count nuts) and, if wanted, one process_water lot. Out, settled once
//   when the work is done: coconut_husk (fibre), coconut_shell, coconut_water, coconut_milk, coconut_pulp.
//   The hands' work arrives as an even offer (coconutHandPowerW); offered less, nothing happens in that interval.
//
// p31x_coconut_oil_boil (island clock, waiting by the fire, contract 0.2.x only: the fire draws O2)
//   The milk is boiled in a pot over a wood fire. While free water is left it boils at 100 °C and the water goes up as
//   vapour; then the temperature climbs, the solids brown and the oil separates and floats; left too long or on too
//   strong a fire, it scorches. The resident chooses the fire (fire_level 0 low, 1 medium, 2 high, at any time), looks
//   (look: sound, colour, smell) and lifts the pot off (take_off). Out: coconut_oil (clear, with how scorched it is),
//   coconut_latik (the browned solids, holding the rest of the fat), or, lifted off before the water is gone,
//   coconut_milk (thicker); and from the fire: the firewood left, wood_ash, vapour and CO2 to the air, O2 drawn.
//   0.1.1 (Codex A1, A2, B1 on eaa2a84): looking does not touch the physics (only the fire level and lifting the pot
//   off do); the pot is integrated on a fixed 0.25 s grid, so any split of the same run agrees; the heat the pot and
//   its contents hold is reported as storedJ (negative while it cools) and settles to zero at the end; lifted off
//   before any oil has separated, the pot gives back the same material it took in (milk or latik, with how far it had
//   browned), and the latik goes back on the fire to give up the oil it still holds.
//   The pot is a test pot that takes up no oil (a porous fired pot would: later).
// Every constant is assumed (params.ts). Not modelled: rancidity, fermentation (another way to the oil, later), the
// pot's own porosity, oil spattering, smoke.

import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, react, REACTIONS, totalMg, type Composition, type SpeciesId } from '../chem';
import { pv } from '../params';
import { fuelLhvJPerMg } from '../physics';
import { allFinite, checkCommon, contractExtras, envUsable, failed, fingerprint, finite, intDeltaFloor, isInt, subStepEnd } from './common';
import { fuelComp, type ScienceStepResultV02 } from './wood-fire';

export const COCONUT_MILK_PROCESS = { processId: 'p30x_coconut_milk', processVersion: '0.1.0' } as const;
export const COCONUT_BOIL_PROCESS = { processId: 'p31x_coconut_oil_boil', processVersion: '0.1.3' } as const; // 0.1.3: the residents' cook_pot as well // 0.1.2: the closing words follow the solids' colour (Codex A3)
const MILK_SCHEMA = 'civ-sci.coconut-milk/1', MILK_EVAL = 'coconut-milk-eval/0.1.0';
// /2 since 0.1.1 (heat held by the pot, browning carried over): a /1 run is refused; the host cancels it and releases its lots
const BOIL_SCHEMA = 'civ-sci.coconut-boil/2', BOIL_EVAL = 'coconut-boil-eval/0.1.3';
const TOOLS = 'fixture_coconut_tools', POT = 'fixture_cook_pot', HEARTH = 'open_fire_pit';
const FINE_MS = 250; // the pot is integrated on a 0.25 s grid from the run's start: near the end of the boil it changes fast
const FIRE_KG_PER_H = [0.4, 0.8, 1.6] as const; // low, medium, high: wood the tender feeds (assumed), never above the hearth's max
const CP = { water: 4.18, coconut_fat: 2.0, plant_solids: 1.5 } as const; // J/(g·K)
const FOOD = ['water', 'coconut_fat', 'plant_solids'] as const;

/** A food lot (coconut_milk, coconut_water, coconut_pulp, coconut_oil, coconut_latik): x_<species>_ppm of the whole lot
 *  for water, coconut_fat and plant_solids; what is not listed is plant_solids. Throws with a reason. */
export function readFood(lot: LotView): Composition {
  const c: Composition = {};
  let listed = 0;
  for (const [k, v] of Object.entries(lot.quality ?? {})) {
    const m = /^x_(.+)_ppm$/.exec(k);
    if (!m) continue;
    if (!(FOOD as readonly string[]).includes(m[1])) throw new Error(`food-unknown-species: ${m[1]} (water, coconut_fat, plant_solids)`);
    if (!isInt(v)) throw new Error('food-not-whole-ppm');
    const mg = Math.floor((lot.amount.value * v) / 1e6); // whole ppm, rounded down both ways: a lot handed back reads back
    if (mg > 0) { c[m[1] as SpeciesId] = mg; listed += mg; }
  }
  let total = 0; for (const [k, v] of Object.entries(lot.quality ?? {})) if (/^x_.+_ppm$/.test(k)) total += v;
  if (total > 1e6) throw new Error(`food-make-up-exceeds-lot: ${lot.lotId}`);
  if (lot.amount.value - listed > 0) c.plant_solids = (c.plant_solids ?? 0) + lot.amount.value - listed;
  return c;
}
export function foodQuality(c: Composition): Record<string, number> {
  const t = totalMg(c), q: Record<string, number> = {};
  for (const k of FOOD) if (c[k]) q[`x_${k}_ppm`] = Math.floor(((c[k] ?? 0) * 1e6) / t);
  return q;
}
/** A lignocellulosic part (husk, shell) in the firewood make-up: water_ppm of the lot, ash_dry_ppm of the dry part. */
function woodyPart(mg: number, water: number, ashDry: number): { comp: Composition; quality: Record<string, number> } {
  const w = Math.round(mg * water), ash = Math.round((mg - w) * ashDry), comp: Composition = {};
  if (w) comp.water = w; if (ash) comp.ash = ash; if (mg - w - ash) comp.wood_dry = mg - w - ash;
  return { comp, quality: { water_ppm: Math.round((w * 1e6) / mg), ash_dry_ppm: mg - w > 0 ? Math.round((ash * 1e6) / (mg - w)) : 0 } };
}

// ---- p30x_coconut_milk ---------------------------------------------------------------------------------------------

interface MilkData { fps: string[]; eqId: string; lastTo: number; durationMs: number; elapsedMs: number; reportedJ: number }

export function coconutMilkStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, COCONUT_MILK_PROCESS.processId, COCONUT_MILK_PROCESS.processVersion, MILK_SCHEMA);
  if (bad) return failed(req, MILK_EVAL, bad, MILK_SCHEMA);
  const nuts = req.lots.filter((l) => l.materialId === 'coconut'), waters = req.lots.filter((l) => l.materialId === 'process_water');
  if (nuts.length !== 1 || waters.length > 1 || nuts.length + waters.length !== req.lots.length) return failed(req, MILK_EVAL, 'expected one coconut lot and at most one process_water lot', MILK_SCHEMA);
  const nut = nuts[0], q = nut.quality ?? {};
  if (!isInt(q.count, 1)) return failed(req, MILK_EVAL, 'coconut lot needs quality.count (whole nuts, ≥ 1)', MILK_SCHEMA);
  const frac = { husk: q.husk_ppm !== undefined ? q.husk_ppm / 1e6 : pv('coconutHuskFrac'), shell: q.shell_ppm !== undefined ? q.shell_ppm / 1e6 : pv('coconutShellFrac'),
    meat: q.meat_ppm !== undefined ? q.meat_ppm / 1e6 : pv('coconutMeatFrac') };
  if (!Object.values(frac).every((f) => finite(f, 0, 1)) || frac.husk + frac.shell + frac.meat > 1) return failed(req, MILK_EVAL, 'coconut husk_ppm + shell_ppm + meat_ppm must stay within the nut', MILK_SCHEMA);
  const tools = req.equipment.find((e) => e.kind === TOOLS);
  if (!tools && req.stop !== 'equipment-lost') return failed(req, MILK_EVAL, `no ${TOOLS} (a stake, a stone, a grater, a cloth)`, MILK_SCHEMA);
  if (req.actions.length) return failed(req, MILK_EVAL, `unknown action ${req.actions[0].action} (the work is done when its time is worked)`, MILK_SCHEMA);
  const fps = req.lots.map(fingerprint).sort();
  let d: MilkData;
  if (req.state === null) {
    if (!tools) return failed(req, MILK_EVAL, 'the tools were lost before the work began: nothing happened', MILK_SCHEMA);
    d = { fps, eqId: tools.equipmentId, lastTo: req.interval.from, durationMs: q.count * pv('coconutHandSecondsPerNut') * 1000, elapsedMs: 0, reportedJ: 0 };
  } else {
    d = structuredClone(req.state.data as MilkData);
    if (d.fps.join('|') !== fps.join('|')) return failed(req, MILK_EVAL, 'changed-input: a reserved lot changed under a running run', MILK_SCHEMA);
    if (tools && tools.equipmentId !== d.eqId) return failed(req, MILK_EVAL, 'changed-input: the tools changed under a running run', MILK_SCHEMA);
    if (req.interval.from !== d.lastTo) return failed(req, MILK_EVAL, `noncontiguous-interval: expected from=${d.lastTo}`, MILK_SCHEMA);
  }
  if (req.energy.length !== 1 || req.energy[0].kind !== 'mechanical') return failed(req, MILK_EVAL, 'expected one mechanical energy offer (the hands)', MILK_SCHEMA);
  const offer = req.energy[0], span = req.interval.to - req.interval.from, power = pv('coconutHandPowerW');
  const worked = span > 0 && (offer.maxJ * 1000) / span >= power ? Math.min(span, d.durationMs - d.elapsedMs) : 0; // a stop is at interval.to
  d.elapsedMs += worked;
  const done = d.elapsedMs >= d.durationMs, endAt = done ? req.interval.from + worked : req.interval.to;
  const cum = intDeltaFloor((power * d.elapsedMs) / 1000, d.reportedJ);
  d.reportedJ = cum.reported; d.lastTo = endAt;
  const stopped = !done && (req.stop === 'operator' || req.stop === 'equipment-lost');
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: MILK_SCHEMA, data: d }, status: done ? 'completed' : stopped ? 'stopped' : worked === 0 && span > 0 ? 'needs-input' : 'running',
    consumed: [], produced: [], released: [],
    energy: cum.delta > 0 ? [{ sourceId: offer.sourceId, kind: 'mechanical', usedJ: cum.delta, lostJ: cum.delta, storedJ: 0 }] : [],
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: MILK_EVAL, sourceRefs: [], notes: '実の部分の割合、果肉の水・脂、搾りで出る割合、手間はすべて仮定（食品成分表は未照合）' },
    diagnostics: { elapsedS: d.elapsedMs / 1000, durationS: d.durationMs / 1000 },
  };
  if (!done) return res;

  const M = nut.amount.value, added = waters[0]?.amount.value ?? 0;
  const huskMg = Math.round(M * frac.husk), shellMg = Math.round(M * frac.shell), meatMg = Math.round(M * frac.meat), cwMg = M - huskMg - shellMg - meatMg;
  const mWater = Math.round(meatMg * pv('coconutMeatWater')), mFat = Math.round(meatMg * pv('coconutMeatFat')), mSolids = meatMg - mWater - mFat;
  const ratio = meatMg > 0 ? Math.min(1, added / meatMg) : 0;
  const fatOut = Math.round(mFat * (pv('pressFatDry') + (pv('pressFatWet') - pv('pressFatDry')) * ratio));
  const solidsOut = Math.round(mSolids * pv('pressSolids')), waterOut = Math.round((mWater + added) * pv('pressWater'));
  const milk: Composition = {}, pulp: Composition = {};
  if (waterOut) milk.water = waterOut; if (fatOut) milk.coconut_fat = fatOut; if (solidsOut) milk.plant_solids = solidsOut;
  const pw = mWater + added - waterOut, pf = mFat - fatOut, ps = mSolids - solidsOut;
  if (pw) pulp.water = pw; if (pf) pulp.coconut_fat = pf; if (ps) pulp.plant_solids = ps;
  const cwSolids = Math.round(cwMg * pv('coconutWaterSolids')), cw: Composition = {};
  if (cwMg - cwSolids) cw.water = cwMg - cwSolids; if (cwSolids) cw.plant_solids = cwSolids;
  const husk = woodyPart(huskMg, pv('coconutHuskWater'), pv('coconutHuskAshDry')), shell = woodyPart(shellMg, pv('coconutShellWater'), pv('coconutShellAshDry'));
  res.consumed = req.lots.map((l) => ({ lotId: l.lotId, amount: { ...l.amount } }));
  const hist = req.lots.every((l) => (l.quality?.history_complete ?? 1) === 1) ? 1 : 0;
  const out = (materialId: string, c: Composition, quality: Record<string, number>) => {
    if (totalMg(c) > 0) res.produced.push({ materialId, amount: { value: totalMg(c), unit: 'mg' }, into: nut.location, quality: { ...quality, history_complete: hist } });
  };
  out('coconut_husk', husk.comp, { ...husk.quality, count: q.count });
  out('coconut_shell', shell.comp, { ...shell.quality, count: 2 * q.count }); // each nut cracks into two halves
  out('coconut_water', cw, foodQuality(cw));
  out('coconut_milk', milk, foodQuality(milk));
  out('coconut_pulp', pulp, foodQuality(pulp));
  res.observations = [
    { at: endAt, channel: 'sight', quantity: 'milk', text: ratio > 0.5 ? '白く薄いミルクがたくさん搾れた' : '白く濃いミルクが搾れた' },
    { at: endAt, channel: 'touch', quantity: 'pulp', text: ratio > 0.5 ? '搾りかすはさらさらしている' : '搾りかすはまだ少し脂っぽい' },
  ];
  return res;
}

// ---- p31x_coconut_oil_boil -----------------------------------------------------------------------------------------

interface BoilData {
  inId: string; inMaterial: string; inFp: string; fuelId: string; fuelFp: string; location: string; fuelLocation: string;
  pot: { heatCapJPerK: number; uaWPerK: number; heatShare: number }; maxBurnKgPerH: number;
  startMs: number; lastTo: number; level: number;
  food0: Composition; waterMg: number; evaporatedMg: number; tC: number; refC: number;
  brown0: number; brown: number; scorch: number;       // brown0: how far the food had browned when it went in
  fuel: Composition; burnedMg: number; cumUsedJ: number; reportedUsed: number; reportedStored: number;
  outcome: 'running' | 'fuel_exhausted'; historyComplete: boolean;
}

/** Rate (1/s) with a 10 K doubling, reaching 1/τ at the reference temperature. Zero below 100 °C. */
const rate = (tC: number, refC: number, tauS: number) => (tC <= 100 ? 0 : Math.pow(2, (tC - refC) / 10) / tauS);
const BOIL_IN = ['coconut_milk', 'coconut_latik'];

export function coconutBoilStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const fail = (why: string) => failed(req, BOIL_EVAL, why, BOIL_SCHEMA) as ScienceStepResultV02;
  const bad = checkCommon(req, COCONUT_BOIL_PROCESS.processId, COCONUT_BOIL_PROCESS.processVersion, BOIL_SCHEMA, /^0\.2\.\d+$/);
  if (bad) return fail(bad);
  const foods = req.lots.filter((l) => BOIL_IN.includes(l.materialId)), woods = req.lots.filter((l) => l.materialId === 'firewood');
  if (foods.length !== 1 || woods.length !== 1 || req.lots.length !== 2) return fail('expected one coconut_milk (or coconut_latik) lot and one firewood lot');
  if (req.energy.length) return fail('the fire burns its reserved firewood: offer no heat source as well (never count the same fire twice)');
  for (const a of req.actions) {
    if (!['fire_level', 'look', 'take_off'].includes(a.action)) return fail(`unknown action ${a.action} (fire_level, look, take_off)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
    if (a.action === 'fire_level' && ![0, 1, 2].includes(a.params?.level as number)) return fail('fire_level needs params.level 0 (low), 1 (medium) or 2 (high)');
  }
  const food = foods[0], wood = woods[0];
  const pot = req.equipment.find((e) => e.kind === POT || e.kind === 'cook_pot'), hearth = req.equipment.find((e) => e.kind === HEARTH);

  let d: BoilData;
  if (req.state === null) {
    if (!pot || !hearth) return fail(`needs a ${POT} (or the residents' cook_pot) on an ${HEARTH}`);
    const pp = pot.params ?? {};
    if (!finite(pp.heatCapJPerK, 1e-9) || !finite(pp.uaWPerK, 0) || !finite(pp.heatShare, 0, 1) || !finite(pp.capacityMl, 1)) return fail(`${POT} needs params heatCapJPerK > 0, uaWPerK ≥ 0, heatShare 0..1, capacityMl > 0`);
    if (!finite(hearth.params?.maxBurnKgPerH, 0)) return fail(`${HEARTH} params.maxBurnKgPerH must be finite and ≥ 0`);
    let fc0: Composition;
    try { fc0 = readFood(food); } catch (e) { return fail((e as Error).message); }
    const q = food.quality ?? {};
    if (!finite(q.brown_ppm ?? 0, 0, 1e6) || !finite(q.scorch_ppm ?? 0, 0, 1e6)) return fail('brown_ppm and scorch_ppm must be within 0..1000000');
    if (food.amount.value / 1000 > pp.capacityMl) return fail('it does not fit in the pot');
    const fc = fuelComp(wood);
    if (typeof fc === 'string') return fail(fc);
    if (!envUsable(req)) return fail(`a fire is lit only with known weather (environment ${req.environment.source})`);
    const first = req.actions.filter((a) => a.action === 'fire_level').sort((x, y) => x.at - y.at)[0];
    const Ta = req.environment.airTempC!, b0 = (q.brown_ppm ?? 0) / 1e6;
    d = { inId: food.lotId, inMaterial: food.materialId, inFp: fingerprint(food), fuelId: wood.lotId, fuelFp: fingerprint(wood), location: food.location, fuelLocation: wood.location,
      pot: { heatCapJPerK: pp.heatCapJPerK, uaWPerK: pp.uaWPerK, heatShare: pp.heatShare }, maxBurnKgPerH: hearth.params!.maxBurnKgPerH,
      startMs: req.interval.from, lastTo: req.interval.from, level: first?.at === req.interval.from ? (first.params!.level as number) : 1,
      food0: fc0, waterMg: fc0.water ?? 0, evaporatedMg: 0, tC: Ta, refC: Ta, brown0: b0, brown: b0, scorch: (q.scorch_ppm ?? 0) / 1e6,
      fuel: fc, burnedMg: 0, cumUsedJ: 0, reportedUsed: 0, reportedStored: 0, outcome: 'running',
      historyComplete: (food.quality?.history_complete ?? 1) === 1 && (wood.quality?.history_complete ?? 1) === 1 };
  } else {
    d = structuredClone(req.state.data as BoilData);
    if (d.inFp !== fingerprint(food) || d.fuelFp !== fingerprint(wood)) return fail('changed-input: a reserved lot changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }

  const known = envUsable(req);
  const takeOff = req.actions.filter((a) => a.action === 'take_off').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = !known ? req.interval.from : takeOff ?? req.interval.to;
  const levels = req.actions.filter((a) => a.action === 'fire_level' && a.at < endAt).sort((x, y) => x.at - y.at);
  const looks = req.actions.filter((a) => a.action === 'look' && a.at < endAt).map((a) => a.at).sort((x, y) => x - y);
  const fuelTotal = totalMg(d.fuel), lhv = fuelLhvJPerMg(d.fuel), dryShare = (d.fuel.wood_dry ?? 0) / fuelTotal;
  const fat = d.food0.coconut_fat ?? 0, solids = d.food0.plant_solids ?? 0, nonWater = fat + solids;
  const heldJ = () => (d.pot.heatCapJPerK + (CP.water * d.waterMg + CP.coconut_fat * fat + CP.plant_solids * solids) / 1000) * (d.tC - d.refC);
  const observations: Observation[] = [];
  /** What the resident notices: read from the pot as it is, never changing it. */
  const look = (at: number) => {
    const boiling = d.waterMg > pv('boilEndWaterRatio') * nonWater;
    const o = (channel: Observation['channel'], quantity: string, text: string) => observations.push({ at, channel, quantity, text });
    if (d.tC < 90) { o('sight', 'pot', '湯気が少し立っている'); return; }
    if (boiling) { o('sound', 'pot', 'ぐつぐつ煮立っている'); o('sight', 'pot', '白い泡が立ち、ミルクがとろりとしてきた'); return; }
    o('sound', 'pot', d.waterMg > 0.002 * nonWater ? 'ぱちぱちと小さな音がする' : '静かになった');
    o('sight', 'pot', d.scorch > 0.3 ? 'かすが黒ずみ、油の色が濃い' : d.brown < 0.3 ? '白っぽいかすが沈んでいる' : d.brown < 0.8 ? 'かすが薄い金色になり、上に澄んだ油が浮いている' : 'かすが茶色になり、油が澄んでいる');
    o('smell', 'pot', d.scorch > 0.3 ? '焦げたにおい' : d.brown > 0.3 ? '香ばしい甘いにおい' : '甘いにおい');
  };

  let t = d.lastTo, kl = 0, ko = 0;
  if (known) {
    const Ta = req.environment.airTempC!, latent = pv('latentHeatWater100') / 1e6; // J per mg
    while (t < endAt) {
      for (; kl < levels.length && levels[kl].at <= t; kl++) d.level = levels[kl].params!.level as number;
      for (; ko < looks.length && looks[ko] < t + 1e-9; ko++) look(looks[ko]);
      // the fixed grid, cut only by a change of fire (looking is not)
      const tEnd = Math.min(subStepEnd(t, d.startMs, FINE_MS, endAt), kl < levels.length ? levels[kl].at : Infinity);
      for (; ko < looks.length && looks[ko] < tEnd; ko++) look(looks[ko]); // a look inside the step sees the pot as at its start
      const dt = (tEnd - t) / 1000;
      // the fire: the tender feeds wood at the chosen pace while there is wood that burns
      const feedKgS = lhv > 0 ? Math.min(FIRE_KG_PER_H[d.level], d.maxBurnKgPerH) / 3600 : 0;
      const burn = Math.min(feedKgS * dt * 1e6, fuelTotal - d.burnedMg);
      if (fuelTotal - d.burnedMg < 1 && d.outcome === 'running') d.outcome = 'fuel_exhausted';
      d.burnedMg += burn; d.cumUsedJ += burn * dryShare * (pv('woodLhvDry') / 1e6);
      // the pot: what it gets from the fire, less what it loses to the air
      const t0 = d.tC;
      const net = burn * lhv * d.pot.heatShare - d.pot.uaWPerK * (d.tC - Ta) * dt;
      const C = d.pot.heatCapJPerK + CP.water * d.waterMg / 1000 + CP.coconut_fat * fat / 1000 + CP.plant_solids * solids / 1000;
      const free = Math.max(0, d.waterMg - pv('boilEndWaterRatio') * nonWater);
      let heat = net;
      if (free > 0) {
        // up to the boil, then the heat goes into boiling off the free water
        const toBoil = Math.max(0, (100 - d.tC) * C);
        if (heat <= toBoil) d.tC += heat / C;
        else { d.tC = 100; heat -= toBoil; const e = Math.min(free, heat / latent); d.waterMg -= e; d.evaporatedMg += e; heat -= e * latent; d.tC += heat / C; }
      } else {
        // the water bound in the solids goes on leaving (frying), then the pot climbs
        const e = d.tC >= 100 ? Math.min(d.waterMg, d.waterMg * (1 - Math.exp(-dt / pv('boilBoundWaterTauS'))), Math.max(0, heat) / latent) : 0;
        d.waterMg -= e; d.evaporatedMg += e; d.tC += (heat - e * latent) / C;
      }
      const tMid = (t0 + d.tC) / 2; // browning and scorching at the step's mean temperature
      d.brown += rate(tMid, pv('brownRefC'), pv('brownTauRefS')) * dt;
      d.scorch += rate(tMid, pv('scorchRefC'), pv('scorchTauRefS')) * dt;
      t = tEnd;
    }
    for (; ko < looks.length; ko++) look(looks[ko]);
  } else d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const ending = !known || takeOff !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  // heat: the dry wood burned (used); what the pot and its contents hold above where they started (stored: up while it
  // heats, down while it cools); the rest went to the air (lost). At the end the pot cools: stored settles to zero.
  const u = intDeltaFloor(d.cumUsedJ, d.reportedUsed);
  const storedNow = ending ? 0 : Math.round(heldJ());
  const sDelta = storedNow - d.reportedStored;
  d.reportedUsed = u.reported; d.reportedStored = storedNow;
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: BOIL_SCHEMA, data: d }, status: ending ? (takeOff !== undefined && known ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    energy: u.delta === 0 && sDelta === 0 ? [] : [{ sourceId: `src:combustion:${req.runId}`, kind: 'heat', usedJ: u.delta, lostJ: u.delta - sDelta, storedJ: sDelta }],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: BOIL_EVAL, sourceRefs: ['S-latent', 'S-wood'],
      notes: '水の蒸発熱は出典あり。鍋に入る火の熱の割合、かすの色づき・焦げの速さ、油の分かれる割合は仮定。油が分かれるのを色づきに結びつけたのはモデルの仮定（澄んだ油に褐変は必須ではない）。鍋は油を吸わない試験用、中身は一様な温度' },
    diagnostics: { tC: d.tC, waterRatio: d.waterMg / Math.max(1, nonWater), brown: d.brown, scorch: d.scorch, level: d.level, burnedMg: d.burnedMg, heldJ: heldJ(), outcome: d.outcome },
  };
  if (!ending) return res;

  // settle once: the water that went up, the oil that separated, the rest; the fire's wood, ash and gases
  const evap = Math.min(d.food0.water ?? 0, Math.floor(d.evaporatedMg + 1e-6)), waterLeft = (d.food0.water ?? 0) - evap;
  res.consumed = [{ lotId: food.lotId, amount: { ...food.amount } }, { lotId: wood.lotId, amount: { ...wood.amount } }];
  const hist = d.historyComplete ? 1 : 0;
  const scorch = Math.round(Math.min(1, d.scorch) * 1e6), brown = Math.round(Math.min(1, d.brown) * 1e6);
  // of the fat that went in, the share that separates now: what this browning frees beyond what had been freed before
  const R = pv('oilRecoverMax'), freed0 = R * Math.min(1, d.brown0), freed = R * Math.min(1, d.brown);
  const oilMg = d.waterMg <= 0.05 * nonWater && freed > freed0 ? Math.floor((fat * (freed - freed0)) / (1 - freed0)) : 0;
  const rest: Composition = { coconut_fat: fat - oilMg, plant_solids: solids };
  if (waterLeft) rest.water = waterLeft;
  for (const key of Object.keys(rest) as SpeciesId[]) if (!rest[key]) delete rest[key];
  const browned = { ...(brown ? { brown_ppm: brown } : {}), ...(scorch ? { scorch_ppm: scorch } : {}) };
  if (oilMg > 0) {
    res.produced.push({ materialId: 'coconut_oil', amount: { value: oilMg, unit: 'mg' }, into: d.location,
      quality: { x_coconut_fat_ppm: 1_000_000, scorch_ppm: scorch, history_complete: hist } });
    if (totalMg(rest) > 0) res.produced.push({ materialId: 'coconut_latik', amount: { value: totalMg(rest), unit: 'mg' }, into: d.location,
      quality: { ...foodQuality(rest), brown_ppm: brown, scorch_ppm: scorch, history_complete: hist } });
  } else if (totalMg(rest) > 0) {
    // no oil yet: the same material comes back (thicker, browned as far as it got) and can go on the fire again (Codex B1)
    res.produced.push({ materialId: d.inMaterial, amount: { value: totalMg(rest), unit: 'mg' }, into: d.location,
      quality: { ...foodQuality(rest), ...browned, history_complete: hist } });
  }
  // the firewood, as the wood fire settles it: each part burned rounded up, never more than the lot holds
  const taken: Composition = {};
  for (const part of ['wood_dry', 'water', 'ash'] as const) {
    const n = Math.min(d.fuel[part] ?? 0, Math.ceil((d.burnedMg * (d.fuel[part] ?? 0)) / fuelTotal - 1e-6));
    if (n > 0) taken[part] = n;
  }
  const left = addComp(d.fuel, taken, -1);
  const r = react('wood_dry', taken.wood_dry ?? 0, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
  if (totalMg(left) > 0) {
    const leftDry = totalMg(left) - (left.water ?? 0);
    res.produced.push({ materialId: 'firewood', amount: { value: totalMg(left), unit: 'mg' }, into: d.fuelLocation,
      quality: { ...(wood.quality ?? {}), water_ppm: ((left.water ?? 0) * 1e6) / totalMg(left), ash_dry_ppm: leftDry > 0 ? ((left.ash ?? 0) * 1e6) / leftDry : 0 } });
  }
  if (taken.ash) res.produced.push({ materialId: 'wood_ash', amount: { value: taken.ash, unit: 'mg' }, into: d.fuelLocation });
  const vapour = evap + (taken.water ?? 0) + (r.produced.water ?? 0);
  if (vapour > 0) res.released.push({ materialId: 'water_vapour', amount: { value: vapour, unit: 'mg' }, to: 'air' });
  if (r.produced.co2) res.released.push({ materialId: 'process_co2', amount: { value: r.produced.co2, unit: 'mg' }, to: 'air' });
  if (r.consumed.o2) res.drawn = [{ materialId: 'o2', amount: { value: r.consumed.o2, unit: 'mg' }, from: 'air' }];
  if (!known) res.observations.push({ at: endAt, channel: 'sight', quantity: 'fire', text: '見ていない間に火が落ちていた' });
  if (d.outcome === 'fuel_exhausted') res.observations.push({ at: endAt, channel: 'sight', quantity: 'fire', text: '薪が尽きて、火が小さくなっていった' });
  const end = oilMg > 0
    ? (d.scorch > 0.4 ? '油は茶色く濁り、焦げ臭い' : d.scorch > 0.1 ? '油に少し色がつき、香ばしい' : '澄んだ淡い色の油が分かれた')
    : d.waterMg > 0.05 * nonWater ? 'まだ水っぽく、油は分かれていない'
    // no new oil this time: say what the solids look like now (they may have browned or burnt before, Codex A3)
    : d.scorch > 0.4 ? 'かすは黒く焦げていて、もう油は出てこない'
    : d.brown >= 1 ? 'かすは茶色く、もう油は出てこない'
    : d.brown >= 0.2 ? 'かすが色づき始めたが、澄んだ油はまだ分かれていない'
    : 'かすはまだ白く、澄んだ油はほとんど分かれていない';
  res.observations.push({ at: endAt, channel: 'sight', quantity: oilMg > 0 ? 'oil' : 'pot', text: end });
  return res;
}
