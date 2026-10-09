// ScienceStep for an oil lamp (p40x_oil_lamp), contract 0.2.x only (the flame draws O2). On the world clock: the night
// is as long as the real one (owner's decision 2026-10-09, OIL_LAMP_DESIGN.md), so a lamp burns the real hours.
//
// A lamp dish (lamp_dish, the residents' own: lampDishParams, plus where it stands: shelter 0..1, roofed 0/1) holds
// coconut oil; a wick (lamp_wick: twisted pandanus fibre, coconut husk fibre or reed pith) draws the oil up and it burns at
// the tip. What the residents can find out by trying (owner's decision: close to the real thing):
//   - the wick out further burns more and gives more light, but smokes (soot); short gives little light
//   - the wick's tip chars as it burns and draws less: the light fades until the tip is trimmed (a tip that has not
//     charred is not cut)
//   - the three fibres draw and char differently (the world decides which is better; nobody is told)
//   - a new unglazed dish soaks up oil (the fat; water stays in the dish) into its wall: that oil stays in the dish's
//     wall, and a dish that has soaked once does not soak again (the soaked oil comes back as its own lot, kept with it)
//   - coconut oil sets solid when it is cool (melting about 24 °C): on a cool night the wick will not light until the
//     dish is warmed by a fire; the flame keeps a little of it warm, and on a cold night it starves and goes out
//   - wind at the lamp blows it out unless it is sheltered; rain puts out a lamp with no roof over it
// Clear oil only: coconut fat with at most lampMaxWaterPpm of water. The wick draws the liquid; the fat burns (light,
// heat, soot), the water boils off. At the end the oil and the water left in the dish come back apart (they do not mix):
// coconut_oil (fat only) and process_water.
// Actions: light {wickOut 0 short, 1 medium, 2 long} (again after it went out), wick_out {level}, trim, warm (the dish by
// a fire, before lighting), look, put_out (the end: everything is handed back). A stop (operator, equipment-lost) ends
// the run at interval.to, the lamp burning until then. The weather the lamp stands in must be known (air temperature,
// wind; rain too if it has no roof): an interval of unknown weather stops the run at its start ("the lamp went out
// while nobody watched"), nothing computed for it.
//
// Time (0.1.1, Codex A1 on eb3cd0b): the run is cut into fixed one-second cells from its start, and also at each hand
// action. Everything the flame decides (lit or out, how fast the fat burns and soaks, how fast the tip chars) is decided
// at a cell's start from the state there and held for the cell; inside a cell every amount is a closed form of the
// time since the cell's start. So a request's end or a look between cells reads the same numbers whichever way the night
// is split, and never makes a decision of its own.
// Light: lumens = lampLumenPerGPerH × the fat burned per hour (an assumed scale); the world counts lumen-seconds
// (diagnostics.lumenSeconds) for main's reward ("how far the night is lit"); the residents only hear what they see now.
// Every constant is assumed (params.ts lamp*); sources are candidates only. Not modelled: the flame's heat warming
// the dish beyond lampFlameWarmK, the wick's own oil, gusts (the mean wind only), fire spreading, the light's colour.

import type { LotView, Observation, ScienceStepRequest } from '../../world/science-contract';
import { react, REACTIONS } from '../chem';
import { pv } from '../params';
import { allFinite, checkCommon, envUsable, failed, fingerprint, finite, intDeltaFloor, isInt, wind10m } from './common';
import type { ScienceStepResultV02 } from './wood-fire';

export const OIL_LAMP_PROCESS = { processId: 'p40x_oil_lamp', processVersion: '0.1.1' } as const;
// /2 since 0.1.1 (cells with held decisions; the pool's fat and water apart): a /1 run is refused; the host cancels it
const SCHEMA = 'civ-sci.oil-lamp/2', EVAL = 'oil-lamp-eval/0.1.1';
export const LAMP_DISH = 'lamp_dish', LAMP_WICK = 'lamp_wick';
const CELL_MS = 1000;
/** Wick fibres (lamp_wick quality.fiber). */
export const WICK_FIBERS = { 1: 'pandanus', 2: 'coir', 3: 'reed_pith' } as const;
const DRAW = { 1: 'lampDrawPandanusGPerH', 2: 'lampDrawCoirGPerH', 3: 'lampDrawReedGPerH' } as const;
const CHAR = { 1: 'lampCharPandanusPerH', 2: 'lampCharCoirPerH', 3: 'lampCharReedPerH' } as const;
const DEMAND = ['lampDemandShortGPerH', 'lampDemandMidGPerH', 'lampDemandLongGPerH'] as const;
/** The soot path (oilSooting) leaves 39 C of the fat's 639 g/mol as carbon. */
const SOOT_C_PER_FAT = (39 * 12.011) / 639.0;
/** A tip charred less than this is not cut by trim (Codex A5). */
const TRIM_MIN_CHAR = 0.2;

/** Wicks main makes from what the island has (materials and the hands' work; masses assumed). The wick lot is the
 *  same mass as the material it is made from. diameterMm 2..10: thicker draws and burns more. */
export const WICK_RECIPES = [
  { fiber: 1, ja: 'アダンの葉を裂いて干し、よった芯', materialId: 'pandanus_leaf', mg: 2_000, diameterMm: 4, handSeconds: 600 },
  { fiber: 2, ja: 'ヤシの実の殻の繊維（コイア）をよった芯', materialId: 'coconut_husk', mg: 2_000, diameterMm: 5, handSeconds: 900 },
  { fiber: 3, ja: '葦の茎から抜いた髄の芯', materialId: 'reed', mg: 1_000, diameterMm: 4, handSeconds: 600 },
] as const;

/** The lamp's physical state at the start of a cell (tMs); the amounts are floats, settled to whole mg once at the end. */
interface Snap {
  tMs: number; fat: number; water: number; soaked: number; fatBurned: number; waterGone: number; wickBurned: number; trimmed: number;
  sootFat: number; poolC: number; char: number; litS: number; lumenS: number; usedJ: number;
}
/** What the flame decided at the cell's start, held for the cell (rates per ms). */
interface Ctl { lit: boolean; targetC: number; fatPerMs: number; waterPerMs: number; soakPerMs: number; soakRoom: number; charPerMs: number; wickPerMs: number; soot: number }
interface LampData {
  fps: string[]; eqFp: string; dishId: string; startMs: number; lastTo: number;
  oilQ: Record<string, number>; fat0: number; water0: number; soaked0: number; soakedLotId: string | null;
  wickQ: Record<string, number>; wick0: number; fiber: 1 | 2 | 3; diaMm: number;
  shelter: number; roofed: boolean; soakCapMg: number; wickOut: number;
  s: Snap; ctl: Ctl; reportedJ: number; outEvents: string[]; sooty: boolean; historyComplete: boolean;
}

/** The share of the oil that is liquid at this temperature (a linear melting range: an assumption, Codex on 8dba18f). */
const liquid = (c: number) => Math.min(1, Math.max(0, (c - pv('lampOilMeltLowC')) / (pv('lampOilMeltHighC') - pv('lampOilMeltLowC'))));

/** Read clear oil: coconut fat and at most lampMaxWaterPpm of water; water in whole mg rounded down, the rest is fat
 *  (so what lampOilQuality writes reads back exactly, Codex B1). Throws with a reason. */
export function readLampOil(lot: LotView, soakedWall = false): { fat: number; water: number } {
  const q = lot.quality ?? {};
  for (const k of Object.keys(q)) if (/^x_.+_ppm$/.test(k) && k !== 'x_coconut_fat_ppm' && k !== 'x_water_ppm') throw new Error(`the lamp burns clear oil: ${lot.lotId} has ${k}`);
  const w = q.x_water_ppm ?? 0, f = q.x_coconut_fat_ppm ?? 0;
  if (!isInt(w) || !isInt(f) || w + f > 1e6 || w + f < 1e6 - 2) throw new Error(`the lamp burns clear oil: ${lot.lotId} needs x_coconut_fat_ppm and x_water_ppm (whole ppm, summing to 1000000)`);
  if (w > (soakedWall ? 0 : pv('lampMaxWaterPpm'))) throw new Error(soakedWall ? `the oil in the dish's wall is fat only: ${lot.lotId} has water` : `too much water for a lamp: ${lot.lotId} (at most ${pv('lampMaxWaterPpm')} ppm)`);
  if (!isInt(lot.amount.value, 1) || lot.amount.value > 1e6) throw new Error(`${lot.lotId}: whole mg, at most 1000000 (1 kg) in a lamp`);
  const water = Math.floor((lot.amount.value * w) / 1e6);
  return { fat: lot.amount.value - water, water };
}
/** The quality of clear oil of fat + water mg: water ppm rounded up so that it reads back to the same whole mg (lots up
 *  to 1 kg, where 1 ppm is under 1 mg). */
export function lampOilQuality(fat: number, water: number): Record<string, number> {
  const t = fat + water, w = water > 0 ? Math.ceil((water * 1e6) / t) : 0;
  return { x_coconut_fat_ppm: 1_000_000 - w, ...(w ? { x_water_ppm: w } : {}) };
}

export function oilLampStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const fail = (why: string) => failed(req, EVAL, why, SCHEMA) as ScienceStepResultV02;
  const bad = checkCommon(req, OIL_LAMP_PROCESS.processId, OIL_LAMP_PROCESS.processVersion, SCHEMA, /^0\.2\.\d+$/);
  if (bad) return fail(bad);
  if (req.energy.length) return fail('a lamp burns its own oil: offer no energy');
  for (const a of req.actions) {
    if (!['light', 'wick_out', 'trim', 'warm', 'look', 'put_out'].includes(a.action)) return fail(`unknown action ${a.action} (light, wick_out, trim, warm, look, put_out)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
    if ((a.action === 'light' || a.action === 'wick_out') && ![0, 1, 2, undefined].includes(a.params?.wickOut as number)) return fail(`${a.action} params.wickOut is 0 (short), 1 (medium) or 2 (long)`);
    if (a.action === 'wick_out' && a.params?.wickOut === undefined) return fail('wick_out needs params.wickOut 0, 1 or 2');
  }
  const dish = req.equipment.find((e) => e.kind === LAMP_DISH);
  const wicks = req.lots.filter((l) => l.materialId === LAMP_WICK);
  const oils = req.lots.filter((l) => l.materialId === 'coconut_oil' && (l.quality?.soaked_in_dish ?? 0) !== 1);
  const soaked = req.lots.filter((l) => l.materialId === 'coconut_oil' && l.quality?.soaked_in_dish === 1);
  if (wicks.length !== 1 || oils.length !== 1 || soaked.length > 1 || req.lots.length !== 2 + soaked.length)
    return fail('expected one coconut_oil lot, one lamp_wick lot, and the oil soaked in the dish (coconut_oil, soaked_in_dish 1) if the dish has soaked before');
  const oil = oils[0], wick = wicks[0];
  const fps = req.lots.map(fingerprint).sort();
  const eqFp = JSON.stringify([dish?.equipmentId, Object.entries(dish?.params ?? {}).sort(([x], [y]) => x.localeCompare(y))]);
  const env = req.environment;
  // the weather the lamp stands in: temperature and wind always; rain only matters with no roof over it
  const knownFor = (roofed: boolean) => envUsable(req) && env.windMs !== undefined && (roofed || (env.rainMmH !== undefined && finite(env.rainMmH, 0, 1000)));

  let d: LampData;
  if (req.state === null) {
    if (!dish) return fail(req.stop === 'equipment-lost' ? 'the dish was lost before it was lit: nothing happened' : `needs a ${LAMP_DISH}`);
    const p = dish.params ?? {};
    if (!finite(p.capacityMl, 1, 1000) || !finite(p.absorptionPpm ?? 0, 0, 1e6) || !finite(p.massG, 1, 1e5) || !finite(p.shelter, 0, 1) || ![0, 1].includes(p.roofed))
      return fail(`${LAMP_DISH} needs params capacityMl 1..1000, absorptionPpm, massG (lampDishParams) and where it stands: shelter 0..1, roofed 0/1`);
    let o: { fat: number; water: number }, sk = 0;
    try { o = readLampOil(oil); if (soaked[0]) sk = readLampOil(soaked[0], true).fat; } catch (e) { return fail((e as Error).message); }
    if (oil.amount.value / 1000 / pv('lampOilDensity') > p.capacityMl) return fail('the oil does not fit in the dish');
    const wq = wick.quality ?? {};
    if (![1, 2, 3].includes(wq.fiber) || !finite(wq.diameter_mm, 2, 10) || !finite(wq.char_ppm ?? 0, 0, 1e6)) return fail(`${LAMP_WICK} needs quality fiber 1 (pandanus), 2 (coir) or 3 (reed pith) and diameter_mm 2..10`);
    if (!isInt(wick.amount.value, 1)) return fail('the wick has no mass');
    if (soaked[0] && soaked[0].location !== dish.equipmentId) return fail('the soaked oil is in the dish\'s wall: its location is the dish\'s equipmentId');
    if (!envUsable(req)) return fail(`a lamp is set out only with known weather (environment ${req.environment.source})`);
    const Ta = req.environment.airTempC!;
    d = { fps, eqFp, dishId: dish.equipmentId, startMs: req.interval.from, lastTo: req.interval.from,
      oilQ: { ...(oil.quality ?? {}) }, fat0: o.fat, water0: o.water, soaked0: sk, soakedLotId: soaked[0]?.lotId ?? null,
      wickQ: { ...wq }, wick0: wick.amount.value, fiber: wq.fiber as 1 | 2 | 3, diaMm: wq.diameter_mm,
      shelter: p.shelter, roofed: p.roofed === 1, soakCapMg: Math.round(p.massG * 1000 * (p.absorptionPpm ?? 0) / 1e6 * pv('lampOilDensity')), wickOut: 1,
      s: { tMs: req.interval.from, fat: o.fat, water: o.water, soaked: 0, fatBurned: 0, waterGone: 0, wickBurned: 0, trimmed: 0, sootFat: 0,
        poolC: Ta, char: (wq.char_ppm ?? 0) / 1e6, litS: 0, lumenS: 0, usedJ: 0 },
      ctl: { lit: false, targetC: Ta, fatPerMs: 0, waterPerMs: 0, soakPerMs: 0, soakRoom: 0, charPerMs: 0, wickPerMs: 0, soot: 0 },
      reportedJ: 0, outEvents: [], sooty: false, historyComplete: [oil, wick, ...soaked].every((l) => (l.quality?.history_complete ?? 1) === 1) };
  } else {
    d = structuredClone(req.state.data as LampData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the dish changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }

  const known = knownFor(d.roofed);
  const putOut = req.actions.filter((a) => a.action === 'put_out').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = !known ? req.interval.from : putOut ?? req.interval.to;
  const ending = !known || putOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const observations: Observation[] = [];
  const o = (at: number, channel: Observation['channel'], quantity: string, text: string) => observations.push({ at, channel, quantity, text });
  const Ta = env.airTempC ?? 0;
  const windAtLamp = known ? wind10m(req) * pv('lampWindAtLamp') * (1 - d.shelter) : 0;
  const rainOut = known && !d.roofed && (env.rainMmH ?? 0) > pv('lampRainOutMmH');
  const dia = d.diaMm / pv('lampWickRefMm');
  const wickLeft = (s: Snap) => d.wick0 - s.wickBurned - s.trimmed;
  /** The liquid the wick draws (g/h) and the share of it that is fat. */
  const draw = (s: Snap) => {
    const pool = s.fat + s.water;
    const r = Math.min(pv(DEMAND[d.wickOut]) * dia, pv(DRAW[d.fiber]) * dia * liquid(s.poolC) * (1 - pv('lampCharDrawLoss') * s.char) * Math.min(1, pool / pv('lampMinPoolMg')));
    return { r, fatShare: pool > 0 ? s.fat / pool : 0 };
  };
  const sootOf = (s: Snap) => pv('lampSootBase') + (d.wickOut === 2 ? pv('lampSootLongWick') : 0) + pv('lampSootChar') * s.char;
  const goOut = (why: string) => { d.ctl.lit = false; d.outEvents.push(why); };

  /** The state at time t inside the current cell: closed forms of the time since the cell's start (no decisions). */
  const at = (t: number): Snap => {
    const s = d.s, c = d.ctl, el = t - s.tMs;
    const soak = Math.min(c.soakPerMs * el, c.soakRoom, s.fat);
    const fatB = Math.min(c.fatPerMs * el, s.fat - soak), waterG = Math.min(c.waterPerMs * el, s.water);
    const wickB = Math.min(c.wickPerMs * el, Math.max(0, wickLeft(s)));
    const sootF = (fatB * c.soot) / SOOT_C_PER_FAT;
    return { tMs: t, fat: s.fat - soak - fatB, water: s.water - waterG, soaked: s.soaked + soak, fatBurned: s.fatBurned + fatB, waterGone: s.waterGone + waterG,
      wickBurned: s.wickBurned + wickB, trimmed: s.trimmed, sootFat: s.sootFat + sootF,
      poolC: c.targetC + (s.poolC - c.targetC) * Math.exp(-el / 1000 / pv('lampPoolTauS')),
      char: Math.min(1, s.char + c.charPerMs * el), litS: s.litS + (c.lit ? el / 1000 : 0),
      lumenS: s.lumenS + pv('lampLumenPerGPerH') * fatB * 3.6,
      // the fat's heat, less what the soot's carbon would have given (it is left unburned, Codex A6), and the wick's
      usedJ: s.usedJ + (fatB / 1e6) * pv('lampOilHeatJPerKg') - sootF * SOOT_C_PER_FAT * pv('lampCarbonHeatJPerMg') + (wickB / 1e6) * pv('woodLhvDry') };
  };
  /** Decide at a cell's start, from the state there and this request's weather. */
  const decide = () => {
    const s = d.s;
    if (d.ctl.lit) {
      const { r, fatShare } = draw(s);
      if (windAtLamp > pv('lampBlowoutMs') * (1 + 0.25 * d.wickOut)) goOut('wind');
      else if (rainOut) goOut('rain');
      else if (wickLeft(s) <= 50) goOut('wick');
      else if (r * fatShare < pv('lampMinFlameGPerH')) goOut(s.fat < 1000 ? 'oil' : liquid(s.poolC) < pv('lampLightMinLiquid') ? 'cold' : 'starved');
    }
    const lit = d.ctl.lit, { r, fatShare } = draw(s);
    const room = d.soakCapMg - d.soaked0 - s.soaked;
    d.ctl = { lit, targetC: Ta + (lit ? pv('lampFlameWarmK') : 0),
      fatPerMs: lit ? (r * fatShare * 1000) / 3.6e6 : 0, waterPerMs: lit ? (r * (1 - fatShare) * 1000) / 3.6e6 : 0,
      // a new unglazed dish takes up the liquid fat into its wall (under 1 mg left is the rounding of an earlier settle)
      soakRoom: room > 1 ? room : 0, soakPerMs: room > 1 ? (room * liquid(s.poolC)) / pv('lampSoakTauS') / 1000 : 0,
      charPerMs: lit ? (pv(CHAR[d.fiber]) * (0.5 + 0.5 * d.wickOut)) / 3.6e6 : 0, wickPerMs: lit ? pv('lampWickBurnMgPerH') / 3.6e6 : 0, soot: lit ? sootOf(s) : 0 };
    if (lit && d.ctl.soot > 0.01) d.sooty = true;
  };
  const commit = (t: number) => { if (t > d.s.tMs) d.s = at(t); };
  const nextCell = (t: number) => d.startMs + (Math.floor((t - d.startMs) / CELL_MS) + 1) * CELL_MS;
  /** Close the cells that end before (or at) t: each new cell decides at its start. */
  const rollTo = (t: number, inclusive: boolean) => {
    for (let g = nextCell(d.s.tMs); inclusive ? g <= t : g < t; g = nextCell(g)) { commit(g); decide(); }
  };
  const act = (a: ScienceStepRequest['actions'][number]) => {
    const s = d.s;
    if (a.action === 'warm') { s.poolC = Math.max(s.poolC, pv('lampWarmC')); o(a.at, 'sight', 'oil', liquid(s.poolC) > 0.9 ? '皿の油が温まって、澄んだ液になった' : '皿の油が少しやわらかくなった'); }
    else if (a.action === 'wick_out') d.wickOut = a.params!.wickOut as number;
    else if (a.action === 'trim') {
      const cut = s.char >= TRIM_MIN_CHAR ? Math.min(pv('lampTrimMg'), Math.max(0, wickLeft(s) - 50)) : 0;
      if (cut > 0) { s.trimmed += cut; s.char = 0; }
      o(a.at, 'sight', 'wick', s.char > 0 && cut === 0 && wickLeft(s) <= 50 + pv('lampTrimMg') ? '芯がもう短くて、切れない' : cut > 0 ? '黒く固まった芯の先を切りそろえた' : '芯の先はまだ焦げていない');
    } else if (a.action === 'light') {
      if (a.params?.wickOut !== undefined) d.wickOut = a.params.wickOut as number;
      if (d.ctl.lit) return;
      const { r, fatShare } = draw(s);
      if (windAtLamp > pv('lampBlowoutMs') * (1 + 0.25 * d.wickOut) || rainOut) { o(a.at, 'sight', 'flame', rainOut ? '雨で火がつかない' : '風で火がすぐ消えてしまう'); return; }
      if (s.fat < 1000) { o(a.at, 'sight', 'flame', '皿の油がほとんどない'); return; }
      if (liquid(s.poolC) < pv('lampLightMinLiquid')) { o(a.at, 'sight', 'flame', '油が白く固まっていて、芯に火がつかない'); return; }
      if (wickLeft(s) <= 50) { o(a.at, 'sight', 'flame', '芯が燃え尽きている'); return; }
      if (r * fatShare < pv('lampMinFlameGPerH')) { o(a.at, 'sight', 'flame', '芯が油を吸わず、火がすぐ消えてしまう'); return; }
      d.ctl.lit = true; o(a.at, 'sight', 'flame', '芯の先に小さな炎がともった');
    }
  };
  const look = (t: number) => {
    if (!known || !d.historyComplete) return;
    const s = at(t), lit = d.ctl.lit;
    if (!lit) o(t, 'sight', 'flame', d.outEvents.length ? lastOut(d.outEvents[d.outEvents.length - 1]) : '灯はついていない');
    else {
      const lm = pv('lampLumenPerGPerH') * d.ctl.fatPerMs * 3.6e3;
      o(t, 'sight', 'light', lm < 3 ? '灯のまわりだけがぼんやり明るい' : lm < 8 ? '手元が見える' : lm < 14 ? 'そばにいる顔が見える' : '小屋の中がうっすら見渡せる');
      if (windAtLamp > 0.5 * pv('lampBlowoutMs')) o(t, 'sight', 'flame', '炎が風にゆれている');
      if (d.ctl.soot > 0.01) o(t, 'sight', 'smoke', '炎の先から黒い煙が上がっている');
      if (s.char > 0.5) o(t, 'sight', 'wick', '芯の先が黒く固まっている');
    }
    const lq = liquid(s.poolC);
    o(t, 'sight', 'oil', s.fat < 1000 ? '皿の油がほとんどない' : lq < 0.1 ? '皿の油が白く固まっている' : lq < 0.9 ? '皿の油が半分白くにごっている' : '皿の油は澄んでいる');
    if (d.soakCapMg - d.soaked0 - s.soaked > 0.2 * d.soakCapMg && s.soaked > 0) o(t, 'sight', 'dish', '油が皿にしみこんで、皿の外がにじんでいる');
  };

  if (known) {
    if (req.state === null) decide();
    // the hands first, then the eyes, at the same moment
    const events = req.actions.filter((a) => a.action !== 'put_out' && a.at < endAt)
      .map((a, i) => ({ a, i })).sort((x, y) => x.a.at - y.a.at || Number(x.a.action === 'look') - Number(y.a.action === 'look') || x.i - y.i);
    for (const { a } of events) {
      rollTo(a.at, true);
      if (a.action === 'look') look(a.at);
      else { commit(a.at); act(a); decide(); }
    }
    rollTo(endAt, false);
    if (ending) commit(endAt);
  } else { commit(endAt); d.historyComplete = false; }
  const wasLit = d.ctl.lit;
  d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const u = intDeltaFloor(d.s.usedJ, d.reportedJ);
  d.reportedJ = u.reported;
  if (ending) d.ctl.lit = false;
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (putOut !== undefined && known ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    // the flame's heat all goes to the air (the little light it gives is counted in it)
    energy: u.delta === 0 ? [] : [{ sourceId: `src:combustion:${req.runId}`, kind: 'heat', usedJ: u.delta, lostJ: u.delta, storedJ: 0 }],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['sisi-vanuatu-straight-coconut-oils-2020', 'kahwaji-white-coconut-pcm-2019', 'hughes-gale-lamp-consumption-2007', 'moullou-doulos-topalis-historical-lamp-photometry-2015'],
      notes: 'ヤシ油の燃焼熱・融解の温度・古い油の灯りの油の消費と明るさの桁は資料の候補に近づけた仮定（同じ条件の校正ではない）。芯の吸い上げと焦げ、すす、風と雨、皿が油を吸う速さはすべて仮定' },
    diagnostics: { lit: wasLit, poolC: d.s.poolC, liquid: liquid(d.s.poolC), char: d.s.char, wickOut: d.wickOut, fatGPerH: d.ctl.fatPerMs * 3.6e3,
      lumens: wasLit ? pv('lampLumenPerGPerH') * d.ctl.fatPerMs * 3.6e3 : 0, lumenSeconds: d.s.lumenS, litSeconds: d.s.litS, burnedMg: d.s.fatBurned, soakedMg: d.s.soaked, outEvents: d.outEvents.join(',') },
  };
  if (!ending) return res;

  // settle once, in whole mg, each part on its own (Codex A2): the fat burned, soaked and left; the water boiled off
  // and left; the wick burned, trimmed and left
  res.consumed = req.lots.map((l) => ({ lotId: l.lotId, amount: { ...l.amount } }));
  const hist = d.historyComplete ? 1 : 0, s = d.s;
  const soakedNew = Math.min(d.fat0, Math.floor(s.soaked + 1e-6));
  const fatBurned = Math.min(d.fat0 - soakedNew, Math.ceil(s.fatBurned - 1e-6)), fatLeft = d.fat0 - soakedNew - fatBurned;
  const waterGone = Math.min(d.water0, Math.ceil(s.waterGone - 1e-6)), waterLeft = d.water0 - waterGone;
  const keep = Object.fromEntries(Object.entries(d.oilQ).filter(([key]) => !/^x_.+_ppm$/.test(key))); // the make-up is written anew
  // oil and water do not mix: what is left in the dish comes back as clear oil and, under it, water (so the oil handed
  // back is always clear oil the lamp reads again, however much fat the wall took, Codex B1)
  if (fatLeft > 0) res.produced.push({ materialId: 'coconut_oil', amount: { value: fatLeft, unit: 'mg' }, into: d.dishId,
    quality: { ...keep, ...lampOilQuality(fatLeft, 0), history_complete: hist } });
  if (waterLeft > 0) res.produced.push({ materialId: 'process_water', amount: { value: waterLeft, unit: 'mg' }, into: d.dishId, quality: { history_complete: hist } });
  const soakedTotal = d.soaked0 + soakedNew;
  if (soakedTotal > 0) res.produced.push({ materialId: 'coconut_oil', amount: { value: soakedTotal, unit: 'mg' }, into: d.dishId,
    quality: { x_coconut_fat_ppm: 1_000_000, soaked_in_dish: 1, history_complete: hist } });
  const wickBurned = Math.min(d.wick0, Math.ceil(s.wickBurned - 1e-6)), trimmed = Math.min(d.wick0 - wickBurned, Math.round(s.trimmed));
  const wickLeftMg = d.wick0 - wickBurned - trimmed;
  if (wickLeftMg > 0) res.produced.push({ materialId: LAMP_WICK, amount: { value: wickLeftMg, unit: 'mg' }, into: d.dishId,
    quality: { ...d.wickQ, char_ppm: Math.round(s.char * 1e6), history_complete: hist } });
  if (trimmed > 0) res.produced.push({ materialId: 'wick_char', amount: { value: trimmed, unit: 'mg' }, into: d.dishId, quality: { history_complete: hist } });
  // the fat: the soot path leaves carbon, the rest burns clean; the wick's fibre burns as dry wood
  const sootFat = Math.min(fatBurned, Math.round(s.sootFat));
  const rClean = react('coconut_fat', fatBurned - sootFat, REACTIONS.oilCombustion.coeffs, REACTIONS.oilCombustion.closeInto);
  const rSoot = react('coconut_fat', sootFat, REACTIONS.oilSooting.coeffs, REACTIONS.oilSooting.closeInto);
  const rWick = react('wood_dry', wickBurned, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
  const rel = (materialId: string, mg: number) => { if (mg > 0) res.released.push({ materialId, amount: { value: mg, unit: 'mg' }, to: 'air' }); };
  rel('water_vapour', waterGone + (rClean.produced.water ?? 0) + (rSoot.produced.water ?? 0) + (rWick.produced.water ?? 0));
  rel('process_co2', (rClean.produced.co2 ?? 0) + (rWick.produced.co2 ?? 0));
  rel('soot', rSoot.produced.organic_c ?? 0);
  const o2 = (rClean.consumed.o2 ?? 0) + (rSoot.consumed.o2 ?? 0) + (rWick.consumed.o2 ?? 0);
  if (o2 > 0) res.drawn = [{ materialId: 'o2', amount: { value: o2, unit: 'mg' }, from: 'air' }];

  // what the resident sees when it ends: whether it is still burning, the soot, the dish (Codex A4: no hours it was not
  // watched; the world keeps those in diagnostics)
  if (!known) { if (wasLit) o(endAt, 'sight', 'flame', '見ていない間に灯が消えていた'); return res; }
  if (s.litS > 0 || wasLit) o(endAt, 'sight', 'flame', wasLit ? '灯を消した' : '灯はもう消えていた');
  if (d.sooty) o(endAt, 'sight', 'smoke', d.roofed ? '皿のまわりと屋根の裏が黒くすすけている' : '皿のまわりが黒くすすけている');
  if (soakedNew > 0) o(endAt, 'sight', 'dish', '皿の外側が油でしっとりしている');
  return res;
}

const lastOut = (why: string) => ({
  wind: '風で灯が吹き消えた', rain: '雨で灯が消えた', oil: '油が尽きて灯が消えた', cold: '油が白く固まって、灯が細くなって消えた',
  starved: '芯が油を吸わなくなって、灯が消えた', wick: '芯が燃え尽きて灯が消えた',
} as Record<string, string>)[why] ?? '灯が消えた';

/** The quality of a lamp_wick main makes (WICK_RECIPES). */
export function wickQuality(fiber: 1 | 2 | 3, diameterMm: number): Record<string, number> {
  if (![1, 2, 3].includes(fiber) || !finite(diameterMm, 2, 10)) throw new Error('fiber 1..3, diameterMm 2..10');
  return { fiber, diameter_mm: diameterMm, char_ppm: 0 };
}
