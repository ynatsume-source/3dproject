// ScienceStep for an oil lamp (p40x_oil_lamp), contract 0.2.x only (the flame draws O2). On the world clock: the night
// is as long as the real one (owner's decision 2026-10-09, OIL_LAMP_DESIGN.md), so a lamp burns the real hours.
//
// A lamp dish (lamp_dish, the residents' own: lampDishParams, plus where it stands: shelter 0..1, roofed 0/1) holds
// coconut oil; a wick (lamp_wick: twisted pandanus fibre, coconut husk fibre or reed pith) draws the oil up and it burns at
// the tip. What the residents can find out by trying (owner's decision: close to the real thing):
//   - the wick out further burns more and gives more light, but smokes (soot); short gives little light
//   - the wick's tip chars as it burns and draws less: the light fades until the tip is trimmed
//   - the three fibres draw and char differently (the world decides which is better; nobody is told)
//   - a new unglazed dish soaks up oil first (its absorption): that oil stays in the dish's wall, and a dish that has
//     soaked once does not soak again (the soaked oil comes back as its own lot, kept with the dish)
//   - coconut oil sets solid when it is cool (melting about 24 °C): on a cool night the wick will not light until the
//     dish is warmed by a fire; the flame keeps a little of it warm, and on a cold night it starves and goes out
//   - wind at the lamp blows it out unless it is sheltered; rain puts out a lamp with no roof over it
// Actions: light {wickOut 0 short, 1 medium, 2 long} (again after it went out), wick_out {level}, trim, warm (the dish by
// a fire, before lighting), look, put_out (the end: everything is handed back). A stop (operator, equipment-lost) ends
// the run at interval.to, the lamp burning until then. The weather the lamp stands in must be known (air temperature,
// wind; rain too if it has no roof): an interval of unknown weather stops the run at its start ("the lamp went out
// while nobody watched"), nothing computed for it.
// Light: lumens = lampLumenPerGPerH × the oil burned per hour (an assumed scale); the world counts lumen-seconds
// (diagnostics.lumenSeconds) for main's reward ("how far the night is lit"); the residents only hear words.
// Lessons kept from the reviews: a look reads the lamp at its own time from a copy (looking changes nothing); at the
// same moment the hands act first, then the eyes; whole mg settle once, at the end; the lots handed back read back.
// Every constant is assumed (params.ts lamp*); sources are candidates only. Not modelled: the flame's heat warming
// the dish beyond lampFlameWarmK, the wick's own oil, gusts (the mean wind only), fire spreading, the light's colour.

import type { Observation, ScienceStepRequest } from '../../world/science-contract';
import { react, REACTIONS, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { allFinite, checkCommon, envUsable, failed, fingerprint, finite, intDeltaFloor, isInt, subStepEnd, wind10m } from './common';
import { foodQuality, readFood } from './coconut';
import type { ScienceStepResultV02 } from './wood-fire';

export const OIL_LAMP_PROCESS = { processId: 'p40x_oil_lamp', processVersion: '0.1.0' } as const;
const SCHEMA = 'civ-sci.oil-lamp/1', EVAL = 'oil-lamp-eval/0.1.0';
export const LAMP_DISH = 'lamp_dish', LAMP_WICK = 'lamp_wick';
const STEP_MS = 1000;
/** Wick fibres (lamp_wick quality.fiber). */
export const WICK_FIBERS = { 1: 'pandanus', 2: 'coir', 3: 'reed_pith' } as const;
const DRAW = { 1: 'lampDrawPandanusGPerH', 2: 'lampDrawCoirGPerH', 3: 'lampDrawReedGPerH' } as const;
const CHAR = { 1: 'lampCharPandanusPerH', 2: 'lampCharCoirPerH', 3: 'lampCharReedPerH' } as const;
const DEMAND = ['lampDemandShortGPerH', 'lampDemandMidGPerH', 'lampDemandLongGPerH'] as const;

/** Wicks main makes from what the island has (materials and the hands' work; masses assumed). The wick lot is the
 *  same mass as the material it is made from. diameterMm 2..10: thicker draws and burns more. */
export const WICK_RECIPES = [
  { fiber: 1, ja: 'アダンの葉を裂いて干し、よった芯', materialId: 'pandanus_leaf', mg: 2_000, diameterMm: 4, handSeconds: 600 },
  { fiber: 2, ja: 'ヤシの実の殻の繊維（コイア）をよった芯', materialId: 'coconut_husk', mg: 2_000, diameterMm: 5, handSeconds: 900 },
  { fiber: 3, ja: '葦の茎から抜いた髄の芯', materialId: 'reed', mg: 1_000, diameterMm: 4, handSeconds: 600 },
] as const;

interface LampData {
  fps: string[]; eqFp: string; dishId: string; startMs: number; lastTo: number;
  oilId: string; oilQ: Record<string, number>; oil0: Composition; soakedLotId: string | null; soaked0: number;
  wickId: string; wickQ: Record<string, number>; wick0: number; fiber: 1 | 2 | 3; diaMm: number;
  shelter: number; roofed: boolean; soakCapMg: number;
  poolMg: number; soakedMg: number; burnedMg: number; wickBurnedMg: number; trimmedMg: number; sootPathMg: number;
  poolC: number; char: number; wickOut: number; lit: boolean; litSeconds: number; lumenSeconds: number;
  cumUsedJ: number; reportedUsed: number; outEvents: string[]; sooty: boolean; historyComplete: boolean;
}

/** The share of the oil that is liquid at this temperature (a linear melting range: an assumption, Codex on 8dba18f). */
const liquid = (c: number) => Math.min(1, Math.max(0, (c - pv('lampOilMeltLowC')) / (pv('lampOilMeltHighC') - pv('lampOilMeltLowC'))));

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

  let d: LampData;
  if (req.state === null) {
    if (!dish) return fail(req.stop === 'equipment-lost' ? 'the dish was lost before it was lit: nothing happened' : `needs a ${LAMP_DISH}`);
    const p = dish.params ?? {};
    if (!finite(p.capacityMl, 1, 5000) || !finite(p.absorptionPpm ?? 0, 0, 1e6) || !finite(p.massG, 1, 1e5) || !finite(p.shelter, 0, 1) || ![0, 1].includes(p.roofed))
      return fail(`${LAMP_DISH} needs params capacityMl, absorptionPpm, massG (lampDishParams) and where it stands: shelter 0..1, roofed 0/1`);
    let oc: Composition;
    try { oc = readFood(oil); } catch (e) { return fail((e as Error).message); }
    if ((oc.plant_solids ?? 0) > 0) return fail('the lamp burns clear oil: coconut_oil with only coconut_fat (and a little water)');
    if (oil.amount.value / 1000 / pv('lampOilDensity') > p.capacityMl) return fail('the oil does not fit in the dish');
    const wq = wick.quality ?? {};
    if (![1, 2, 3].includes(wq.fiber) || !finite(wq.diameter_mm, 2, 10) || !finite(wq.char_ppm ?? 0, 0, 1e6)) return fail(`${LAMP_WICK} needs quality fiber 1 (pandanus), 2 (coir) or 3 (reed pith) and diameter_mm 2..10`);
    if (!isInt(wick.amount.value, 1)) return fail('the wick has no mass');
    if (soaked[0] && soaked[0].location !== dish.equipmentId) return fail('the soaked oil is in the dish\'s wall: its location is the dish\'s equipmentId');
    if (!envUsable(req)) return fail(`a lamp is set out only with known weather (environment ${req.environment.source})`);
    const Ta = req.environment.airTempC!;
    d = { fps, eqFp, dishId: dish.equipmentId, startMs: req.interval.from, lastTo: req.interval.from,
      oilId: oil.lotId, oilQ: { ...(oil.quality ?? {}) }, oil0: oc, soakedLotId: soaked[0]?.lotId ?? null, soaked0: soaked[0]?.amount.value ?? 0,
      wickId: wick.lotId, wickQ: { ...wq }, wick0: wick.amount.value, fiber: wq.fiber as 1 | 2 | 3, diaMm: wq.diameter_mm,
      shelter: p.shelter, roofed: p.roofed === 1, soakCapMg: Math.round(p.massG * 1000 * (p.absorptionPpm ?? 0) / 1e6 * pv('lampOilDensity')),
      poolMg: oil.amount.value, soakedMg: 0, burnedMg: 0, wickBurnedMg: 0, trimmedMg: 0, sootPathMg: 0,
      poolC: Ta, char: (wq.char_ppm ?? 0) / 1e6, wickOut: 1, lit: false, litSeconds: 0, lumenSeconds: 0,
      cumUsedJ: 0, reportedUsed: 0, outEvents: [], sooty: false,
      historyComplete: [oil, wick, ...soaked].every((l) => (l.quality?.history_complete ?? 1) === 1) };
  } else {
    d = structuredClone(req.state.data as LampData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the dish changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }

  const env = req.environment;
  // the weather the lamp stands in: temperature and wind always; rain only matters with no roof over it
  const known = envUsable(req) && env.windMs !== undefined && (d.roofed || (env.rainMmH !== undefined && finite(env.rainMmH, 0, 1000)));
  const putOut = req.actions.filter((a) => a.action === 'put_out').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = !known ? req.interval.from : putOut ?? req.interval.to;
  const acts = req.actions.filter((a) => a.action !== 'look' && a.action !== 'put_out' && a.at < endAt).sort((x, y) => x.at - y.at);
  const looks = req.actions.filter((a) => a.action === 'look' && a.at < endAt).map((a) => a.at).sort((x, y) => x - y);
  const observations: Observation[] = [];
  const o = (at: number, channel: Observation['channel'], quantity: string, text: string) => observations.push({ at, channel, quantity, text });
  const Ta = env.airTempC ?? 0;
  const windAtLamp = known ? wind10m(req) * pv('lampWindAtLamp') * (1 - d.shelter) : 0;
  const rainOut = known && !d.roofed && (env.rainMmH ?? 0) > pv('lampRainOutMmH');
  const fatShare = (d.oil0.coconut_fat ?? 0) / Math.max(1, totalMg(d.oil0));
  const dia = d.diaMm / pv('lampWickRefMm');
  const demand = (s: LampData) => pv(DEMAND[s.wickOut]) * dia;
  const pool = (s: LampData) => Math.min(1, s.poolMg / pv('lampMinPoolMg'));
  const supply = (s: LampData) => pv(DRAW[s.fiber]) * dia * liquid(s.poolC) * (1 - pv('lampCharDrawLoss') * s.char) * pool(s);
  const rate = (s: LampData) => Math.min(demand(s), supply(s)); // g/h
  const wickLeft = (s: LampData) => s.wick0 - s.wickBurnedMg - s.trimmedMg;
  const goOut = (s: LampData, why: string) => { s.lit = false; s.outEvents.push(why); };

  /** One stretch of dt seconds with nothing done by hand (no decisions inside: the grid keeps it the same in any split). */
  const advance = (s: LampData, dt: number) => {
    const target = Ta + (s.lit ? pv('lampFlameWarmK') : 0);
    s.poolC = target + (s.poolC - target) * Math.exp(-dt / pv('lampPoolTauS'));
    // a new unglazed dish takes up liquid oil into its wall until it has its fill
    const room = d.soakCapMg - d.soaked0 - s.soakedMg;
    if (room > 1 && s.poolMg > 0) { // under 1 mg left is the whole-mg rounding of an earlier settle: the wall has its fill
      const take = Math.min(s.poolMg, room * (1 - Math.exp(-(dt * liquid(s.poolC)) / pv('lampSoakTauS'))));
      s.soakedMg += take; s.poolMg -= take;
    }
    if (!s.lit) return;
    if (windAtLamp > pv('lampBlowoutMs') * (1 + 0.25 * s.wickOut)) { goOut(s, 'wind'); return; }
    if (rainOut) { goOut(s, 'rain'); return; }
    const r = rate(s);
    if (r < pv('lampMinFlameGPerH')) { goOut(s, s.poolMg < 1000 ? 'oil' : liquid(s.poolC) < pv('lampLightMinLiquid') ? 'cold' : 'starved'); return; }
    if (wickLeft(s) <= 50) { goOut(s, 'wick'); return; }
    const burn = Math.min(s.poolMg, (r * 1000 * dt) / 3600);
    const soot = pv('lampSootBase') + (s.wickOut === 2 ? pv('lampSootLongWick') : 0) + pv('lampSootChar') * s.char;
    if (soot > 0.01) s.sooty = true;
    // the soot comes from the part of the oil that burns without enough air (oilSooting leaves 39 C of the 639 g/mol)
    s.sootPathMg += (burn * fatShare * soot) / (39 * 12.011 / 639.0);
    s.poolMg -= burn; s.burnedMg += burn;
    s.wickBurnedMg += (pv('lampWickBurnMgPerH') * dt) / 3600;
    s.char = Math.min(1, s.char + (pv(CHAR[s.fiber]) * (0.5 + 0.5 * s.wickOut) * dt) / 3600);
    s.cumUsedJ += (burn * fatShare / 1e6) * pv('lampOilHeatJPerKg') + (pv('lampWickBurnMgPerH') * dt / 3600 / 1e6) * pv('woodLhvDry');
    s.litSeconds += dt; s.lumenSeconds += pv('lampLumenPerGPerH') * (burn * 3600 / 1000 / dt) * dt;
  };
  const act = (a: ScienceStepRequest['actions'][number]) => {
    if (a.action === 'warm') { d.poolC = Math.max(d.poolC, pv('lampWarmC')); o(a.at, 'sight', 'oil', liquid(d.poolC) > 0.9 ? '皿の油が温まって、澄んだ液になった' : '皿の油が少しやわらかくなった'); }
    else if (a.action === 'wick_out') d.wickOut = a.params!.wickOut as number;
    else if (a.action === 'trim') { const cut = Math.min(pv('lampTrimMg'), Math.max(0, wickLeft(d) - 50)); d.trimmedMg += cut; d.char = 0; o(a.at, 'sight', 'wick', cut > 0 ? '黒く固まった芯の先を切りそろえた' : '芯がもう短くて、切れない'); }
    else if (a.action === 'light') {
      if (a.params?.wickOut !== undefined) d.wickOut = a.params.wickOut as number;
      if (d.lit) return;
      if (windAtLamp > pv('lampBlowoutMs') * (1 + 0.25 * d.wickOut) || rainOut) { o(a.at, 'sight', 'flame', rainOut ? '雨で火がつかない' : '風で火がすぐ消えてしまう'); return; }
      if (d.poolMg < 1000) { o(a.at, 'sight', 'flame', '皿の油がほとんどない'); return; }
      if (liquid(d.poolC) < pv('lampLightMinLiquid')) { o(a.at, 'sight', 'flame', '油が白く固まっていて、芯に火がつかない'); return; }
      if (wickLeft(d) <= 50) { o(a.at, 'sight', 'flame', '芯が燃え尽きている'); return; }
      d.lit = true; o(a.at, 'sight', 'flame', '芯の先に小さな炎がともった');
    }
  };
  const look = (at: number, s: LampData) => {
    if (!known || !s.historyComplete) return;
    if (!s.lit) { o(at, 'sight', 'flame', s.outEvents.length ? lastOut(s.outEvents[s.outEvents.length - 1]) : '灯はついていない'); }
    else {
      const lm = pv('lampLumenPerGPerH') * rate(s);
      o(at, 'sight', 'light', lm < 3 ? '灯のまわりだけがぼんやり明るい' : lm < 8 ? '手元が見える' : lm < 14 ? 'そばにいる顔が見える' : '小屋の中がうっすら見渡せる');
      if (windAtLamp > 0.5 * pv('lampBlowoutMs')) o(at, 'sight', 'flame', '炎が風にゆれている');
      if (pv('lampSootBase') + (s.wickOut === 2 ? pv('lampSootLongWick') : 0) + pv('lampSootChar') * s.char > 0.01) o(at, 'sight', 'smoke', '炎の先から黒い煙が上がっている');
      if (s.char > 0.5) o(at, 'sight', 'wick', '芯の先が黒く固まっている');
    }
    const lq = liquid(s.poolC);
    o(at, 'sight', 'oil', s.poolMg < 1000 ? '皿の油がほとんどない' : lq < 0.1 ? '皿の油が白く固まっている' : lq < 0.9 ? '皿の油が半分白くにごっている' : '皿の油は澄んでいる');
    if (d.soakCapMg - d.soaked0 - s.soakedMg > 0.2 * d.soakCapMg && s.soakedMg > 0) o(at, 'sight', 'dish', '油が皿にしみこんで、皿の外がにじんでいる');
  };

  let t = d.lastTo, k = 0, j = 0;
  if (known) {
    while (t < endAt) {
      for (; k < acts.length && acts[k].at <= t; k++) act(acts[k]);       // the hands first,
      for (; j < looks.length && looks[j] <= t; j++) look(looks[j], d);    // then the eyes
      const tEnd = Math.min(subStepEnd(t, d.startMs, STEP_MS, endAt), k < acts.length ? acts[k].at : Infinity);
      for (; j < looks.length && looks[j] < tEnd; j++) { const c = structuredClone(d); advance(c, (looks[j] - t) / 1000); look(looks[j], c); }
      advance(d, (tEnd - t) / 1000);
      t = tEnd;
    }
    for (; k < acts.length; k++) act(acts[k]);
    for (; j < looks.length; j++) look(looks[j], d);
  } else d.historyComplete = false;
  const wasLit = d.lit;
  d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const ending = !known || putOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const u = intDeltaFloor(d.cumUsedJ, d.reportedUsed);
  d.reportedUsed = u.reported;
  if (ending) d.lit = false;
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (putOut !== undefined && known ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    // the flame's heat all goes to the air (the little light it gives is counted in it)
    energy: u.delta === 0 ? [] : [{ sourceId: `src:combustion:${req.runId}`, kind: 'heat', usedJ: u.delta, lostJ: u.delta, storedJ: 0 }],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['sisi-vanuatu-straight-coconut-oils-2020', 'kahwaji-white-coconut-pcm-2019', 'hughes-gale-lamp-consumption-2007', 'moullou-doulos-topalis-historical-lamp-photometry-2015'],
      notes: 'ヤシ油の燃焼熱・融解の温度・古い油の灯りの油の消費と明るさの桁は資料の候補に近づけた仮定（同じ条件の校正ではない）。芯の吸い上げと焦げ、すす、風と雨、皿が油を吸う速さはすべて仮定' },
    diagnostics: { lit: wasLit, poolC: d.poolC, liquid: liquid(d.poolC), char: d.char, wickOut: d.wickOut, rateGPerH: wasLit ? rate(d) : 0,
      lumens: wasLit ? pv('lampLumenPerGPerH') * rate(d) : 0, lumenSeconds: d.lumenSeconds, litSeconds: d.litSeconds, burnedMg: d.burnedMg, soakedMg: d.soakedMg, outEvents: d.outEvents.join(',') },
  };
  if (!ending) return res;

  // settle once, in whole mg: the oil burned (and its water), what soaked into the dish, what is left; the wick
  res.consumed = req.lots.map((l) => ({ lotId: l.lotId, amount: { ...l.amount } }));
  const hist = d.historyComplete ? 1 : 0;
  const oil0 = totalMg(d.oil0);
  const soakedNew = Math.min(oil0, Math.floor(d.soakedMg + 1e-6));
  const burned = Math.min(oil0 - soakedNew, Math.ceil(d.burnedMg - 1e-6));
  const left = oil0 - soakedNew - burned;
  const split = (mg: number): Composition => { const f = Math.round(mg * fatShare); const c: Composition = {}; if (f) c.coconut_fat = f; if (mg - f) c.water = mg - f; return c; };
  const bc = split(burned), leftC = split(left);
  const keep = Object.fromEntries(Object.entries(d.oilQ).filter(([key]) => !/^x_.+_ppm$/.test(key))); // the make-up is written anew
  if (left > 0) res.produced.push({ materialId: 'coconut_oil', amount: { value: left, unit: 'mg' }, into: d.dishId,
    quality: { ...keep, ...foodQuality(leftC), history_complete: hist } });
  const soakedTotal = d.soaked0 + soakedNew;
  if (soakedTotal > 0) res.produced.push({ materialId: 'coconut_oil', amount: { value: soakedTotal, unit: 'mg' }, into: d.dishId,
    quality: { x_coconut_fat_ppm: 1_000_000, soaked_in_dish: 1, history_complete: hist } });
  const wickBurned = Math.min(d.wick0, Math.ceil(d.wickBurnedMg - 1e-6)), trimmed = Math.min(d.wick0 - wickBurned, Math.round(d.trimmedMg));
  const wickLeftMg = d.wick0 - wickBurned - trimmed;
  if (wickLeftMg > 0) res.produced.push({ materialId: LAMP_WICK, amount: { value: wickLeftMg, unit: 'mg' }, into: d.dishId,
    quality: { ...d.wickQ, char_ppm: Math.round(d.char * 1e6), history_complete: hist } });
  if (trimmed > 0) res.produced.push({ materialId: 'wick_char', amount: { value: trimmed, unit: 'mg' }, into: d.dishId, quality: { history_complete: hist } });
  // the oil's fat: the soot path leaves carbon, the rest burns clean; the wick's fibre burns as dry wood
  const fat = bc.coconut_fat ?? 0, sootFat = Math.min(fat, Math.round(d.sootPathMg));
  const rClean = react('coconut_fat', fat - sootFat, REACTIONS.oilCombustion.coeffs, REACTIONS.oilCombustion.closeInto);
  const rSoot = react('coconut_fat', sootFat, REACTIONS.oilSooting.coeffs, REACTIONS.oilSooting.closeInto);
  const rWick = react('wood_dry', wickBurned, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
  const rel = (materialId: string, mg: number) => { if (mg > 0) res.released.push({ materialId, amount: { value: mg, unit: 'mg' }, to: 'air' }); };
  rel('water_vapour', (bc.water ?? 0) + (rClean.produced.water ?? 0) + (rSoot.produced.water ?? 0) + (rWick.produced.water ?? 0));
  rel('process_co2', (rClean.produced.co2 ?? 0) + (rWick.produced.co2 ?? 0));
  rel('soot', rSoot.produced.organic_c ?? 0);
  const o2 = (rClean.consumed.o2 ?? 0) + (rSoot.consumed.o2 ?? 0) + (rWick.consumed.o2 ?? 0);
  if (o2 > 0) res.drawn = [{ materialId: 'o2', amount: { value: o2, unit: 'mg' }, from: 'air' }];

  if (!known) { if (wasLit || d.litSeconds > 0) o(endAt, 'sight', 'flame', '見ていない間に灯が消えていた'); return res; }
  const hours = d.litSeconds / 3600;
  if (d.litSeconds > 0) o(endAt, 'sight', 'flame', hours < 0.25 ? '灯はすぐに消えた' : `灯はおよそ${hours < 1 ? '半刻' : `${Math.round(hours)}刻`}ともった`);
  if (d.sooty) o(endAt, 'sight', 'smoke', '皿のまわりと天井が黒くすすけている');
  if (soakedNew > 0) o(endAt, 'sight', 'dish', '皿の外側が油でしっとりしている');
  return res;
}

const lastOut = (why: string) => ({
  wind: '風で灯が吹き消えた', rain: '雨で灯が消えた', oil: '油が尽きて灯が消えた', cold: '油が白く固まって、灯が細くなって消えた',
  starved: '芯が油を吸わなくなって、灯が消えた', wick: '芯が燃え尽きて灯が消えた',
} as Record<string, string>)[why] ?? '灯が消えた';

/** Read a lamp_wick lot as main makes it (WICK_RECIPES). */
export function wickQuality(fiber: 1 | 2 | 3, diameterMm: number): Record<string, number> {
  if (![1, 2, 3].includes(fiber) || !finite(diameterMm, 2, 10)) throw new Error('fiber 1..3, diameterMm 2..10');
  return { fiber, diameter_mm: diameterMm, char_ppm: 0 };
}
