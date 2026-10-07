// Pots the residents make themselves (POT_FIRING_DESIGN.md, owner's decisions 2026-10-07): shape, then dry. Firing in an
// open fire (p13y) comes next, in its own step.
//
// p11y_pot_shape (world clock, hand work, contract 0.1.x / 0.2.x)
//   The resident builds a pot from prepared clay by coiling: a cook pot (form 1), a jar (form 2) or a lamp dish
//   (form 3), of a capacity and a wall thickness chosen once, at the start (one `plan` action at interval.from of the
//   first request: a recipe, not a timed act). The clay it takes follows from the shape: one side's surface × wall ×
//   the wet clay's density; the rest of the lot comes back as it was. Too wet the walls slump, too dry the coils crack,
//   too thin for its size it sags: then the clay comes back, nothing is made. Settled once, when the work is done.
// p12y_pot_dry (island clock, waiting, contract 0.1.x / 0.2.x)
//   The tile drying law (physics.ts dryPhysics) on the pot's own surface: both sides of the wall dry, the inside less;
//   the rim dries ahead of the body (a factor on the crack ratio for pots with a rim); leaves over the pot (rack
//   param covered 1) slow it. A pot that dries too fast cracks when it passes the leather-hard point, as tiles do.
// Every constant is assumed (params.ts). Not modelled yet: temper (sand, shell), the base drying slower than the rim
// as a separate part, slumping while drying, reclaiming broken unfired pots (slaking them again).

import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { crackP, dryPhysics, waterRatio } from '../physics';
import { draw } from '../rng';
import { allFinite, checkCommon, contractExtras, envUsable, failed, fingerprint, finite, intDeltaFloor, subStepEnd, tileComp, tileQuality, wind10m } from './common';

export const POT_SHAPE_PROCESS = { processId: 'p11y_pot_shape', processVersion: '0.1.0' } as const;
export const POT_DRY_PROCESS = { processId: 'p12y_pot_dry', processVersion: '0.1.0' } as const;
const SHAPE_SCHEMA = 'civ-sci.pot-shape/1', SHAPE_EVAL = 'pot-shape-eval/0.1.0';
const DRY_SCHEMA = 'civ-sci.pot-dry/1', DRY_EVAL = 'pot-dry-eval/0.1.0';
export const GREEN_POT = 'green_pot', DRY_POT = 'dry_pot';
const STEP_MS = 30_000;

/** The forms: what the residents make first (the tub is a clay pit, not a fired pot). */
export const POT_FORMS = {
  1: { name: 'cook_pot', ja: '鍋', minMl: 300, maxMl: 8000, wallMm: 8, rimCrack: 1.3 },
  2: { name: 'jar', ja: '壺', minMl: 100, maxMl: 10000, wallMm: 9, rimCrack: 1.3 },
  3: { name: 'lamp_dish', ja: '灯皿', minMl: 20, maxMl: 300, wallMm: 6, rimCrack: 1.0 },
} as const;
type Form = keyof typeof POT_FORMS;

/** One side's surface of a pot (cm²) holding capacityMl: a cook pot is a round pot about 0.8 times as high as wide,
 *  a jar the sealed vessel's shape (a sphere's surface and a fifth for the neck), a lamp dish a shallow bowl a quarter
 *  as high as wide (assumed shapes). */
export function potSurfaceCm2(form: Form, capacityMl: number): number {
  if (form === 2) return 4.836 * Math.pow(capacityMl, 2 / 3) * 1.2;
  const hOverD = form === 1 ? 0.8 : 0.25;
  const D = Math.cbrt((4 * capacityMl) / (Math.PI * hOverD)), H = hOverD * D;
  return (Math.PI * D * D) / 4 + Math.PI * D * H;
}
/** The thinnest wall that stands at this size (mm): thinner and it sags while it is built (assumed). */
export const minWallMm = (capacityMl: number) => 3 + 1.5 * Math.cbrt(capacityMl / 1000);

// ---- p11y: build the pot ----------------------------------------------------------------------------------------------

interface Plan { form: Form; capacityMl: number; wallMm: number }
interface ShapeData { fps: string[]; plan: Plan; potMg: number; lastTo: number; elapsedMs: number; durationMs: number; reportedHands: number }

function readPlan(req: ScienceStepRequest): Plan | string {
  const plans = req.actions.filter((a) => a.action === 'plan');
  if (plans.length !== 1 || req.actions.length !== 1 || plans[0].at !== req.interval.from) {
    return 'the first request carries exactly one plan action at interval.from (params form 1 cook pot / 2 jar / 3 lamp dish, capacityMl, wallMm optional)';
  }
  const p = plans[0].params ?? {};
  if (![1, 2, 3].includes(p.form)) return 'plan.form must be 1 (cook pot), 2 (jar) or 3 (lamp dish)';
  const f = POT_FORMS[p.form as Form];
  if (!finite(p.capacityMl, f.minMl, f.maxMl)) return `plan.capacityMl for a ${f.name} must be within ${f.minMl}..${f.maxMl}`;
  const wallMm = p.wallMm ?? f.wallMm;
  if (!finite(wallMm, 2, 20)) return 'plan.wallMm must be within 2..20';
  return { form: p.form as Form, capacityMl: p.capacityMl, wallMm };
}

export function potShapeStep(req: ScienceStepRequest): ScienceStepResult {
  const fail = (why: string) => failed(req, SHAPE_EVAL, why, SHAPE_SCHEMA);
  const bad = checkCommon(req, POT_SHAPE_PROCESS.processId, POT_SHAPE_PROCESS.processVersion, SHAPE_SCHEMA);
  if (bad) return fail(bad);
  if (req.lots.length !== 1 || req.lots[0].materialId !== 'prepared_clay') return fail('expected one prepared_clay lot');
  if (req.equipment.length) return fail('coiling a pot takes the hands only (no equipment)');
  const hands = req.energy.filter((e) => e.kind === 'mechanical');
  if (hands.length !== 1 || req.energy.length !== 1) return fail('expected one mechanical energy offer (the hands)');
  const lot = req.lots[0];
  const fps = req.lots.map(fingerprint).sort();
  let d: ShapeData;
  if (req.state === null) {
    const plan = readPlan(req);
    if (typeof plan === 'string') return fail(plan);
    let comp: Composition;
    try { comp = tileComp(lot); } catch (e) { return fail((e as Error).message); }
    if (!Object.keys(lot.quality ?? {}).some((k) => /^xd_.+_ppm$/.test(k))) return fail(`prepared_clay ${lot.lotId} lacks its make-up (water_ppm, xd_<species>_ppm)`);
    const potMg = Math.round(potSurfaceCm2(plan.form, plan.capacityMl) * (plan.wallMm / 10) * pv('potGreenDensity') * 1000);
    if (potMg > totalMg(comp)) return fail(`not enough clay: this pot takes ${Math.ceil(potMg / 1000)} g, the lot has ${Math.floor(totalMg(comp) / 1000)} g`);
    d = { fps, plan, potMg, lastTo: req.interval.from, elapsedMs: 0, reportedHands: 0,
      durationMs: Math.ceil((pv('potHandSecondsBase') + pv('potHandSecondsPerKg') * (potMg / 1e6)) * 1000) }; // whole ms
  } else {
    if (req.actions.length) return fail('the plan is made once, at the start: no later actions');
    d = structuredClone(req.state.data as ShapeData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }
  const span = req.interval.to - req.interval.from, power = pv('potHandPowerW');
  const worked = span > 0 && (hands[0].maxJ * 1000) / span >= power ? Math.min(span, d.durationMs - d.elapsedMs) : 0;
  d.elapsedMs += worked;
  const done = d.elapsedMs >= d.durationMs, endAt = done ? req.interval.from + worked : req.interval.to;
  const h = intDeltaFloor((power * d.elapsedMs) / 1000, d.reportedHands);
  d.reportedHands = h.reported; d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const stopped = !done && (req.stop === 'operator' || req.stop === 'equipment-lost');
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt }, state: { schema: SHAPE_SCHEMA, data: d },
    status: done ? 'completed' : stopped ? 'stopped' : worked === 0 && span > 0 ? 'needs-input' : 'running',
    consumed: [], produced: [], released: [],
    energy: h.delta > 0 ? [{ sourceId: hands[0].sourceId, kind: 'mechanical', usedJ: h.delta, lostJ: h.delta, storedJ: 0 }] : [],
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: SHAPE_EVAL, sourceRefs: [], notes: '器の形・壁の厚さの下限・湿った粘土の密度・手間・成形できる水分の幅はすべて仮定（出典未照合）' },
    diagnostics: { potMg: d.potMg, elapsedS: d.elapsedMs / 1000, durationS: d.durationMs / 1000 },
  };
  if (!done) return res;

  // settle: the pot (or, when the clay will not stand, nothing), and the clay left over
  const comp = tileComp(lot), total = totalMg(comp), wr = waterRatio(comp), f = POT_FORMS[d.plan.form];
  const o = (text: string) => res.observations.push({ at: endAt, channel: 'sight', quantity: 'pot', text });
  const why = wr > pv('potShapeWaterMax') ? 'slump' : wr < pv('potShapeWaterMin') ? 'crumble' : d.plan.wallMm < minWallMm(d.plan.capacityMl) ? 'sag' : null;
  res.consumed = [{ lotId: lot.lotId, amount: { ...lot.amount } }];
  const hist = lot.quality?.history_complete ?? 1;
  if (why) {
    res.produced.push({ materialId: 'prepared_clay', amount: { ...lot.amount }, into: lot.location, quality: { ...lot.quality } });
    o(why === 'slump' ? '粘土がやわらかすぎて、積んだ壁がつぶれた' : why === 'crumble' ? '粘土が固すぎて、紐がひび割れてつながらない' : '壁が薄すぎて、積むうちに重みでたわんで崩れた');
    return res;
  }
  // split every part of the clay in proportion (whole mg rounded down); the rest stays with the leftover clay
  const pot: Composition = {};
  for (const [k, mg] of Object.entries(comp)) { const n = Math.floor((mg * d.potMg) / total); if (n > 0) pot[k as keyof Composition] = n; }
  const left: Composition = {};
  for (const [k, mg] of Object.entries(comp)) { const n = mg - (pot[k as keyof Composition] ?? 0); if (n > 0) left[k as keyof Composition] = n; }
  const potTotal = totalMg(pot), leftTotal = totalMg(left);
  res.produced.push({ materialId: GREEN_POT, amount: { value: potTotal, unit: 'mg' }, into: lot.location, quality: {
    ...tileQuality(pot), form: d.plan.form, capacity_ml: d.plan.capacityMl, wall_mm: d.plan.wallMm,
    surface_cm2: Math.round(potSurfaceCm2(d.plan.form, d.plan.capacityMl)), shaped_water_ratio_ppm: Math.round(waterRatio(pot) * 1e6),
    linear_shrink_ppm: 0, crack: 0, history_complete: hist } });
  if (leftTotal > 0) res.produced.push({ materialId: 'prepared_clay', amount: { value: leftTotal, unit: 'mg' }, into: lot.location, quality: { ...tileQuality(left), history_complete: hist } });
  o(`${f.ja}の形ができた（壁の厚さ ${d.plan.wallMm} mm ほど）。表面はやわらかく、指の跡が残る`);
  return res;
}

// ---- p12y: dry the pot -------------------------------------------------------------------------------------------

interface PotDryData {
  lotId: string; fps: string[]; eqFp: string; startMs: number; seed: number; lastTo: number; location: string;
  amountMg: number; dryMg: number; waterMg: number; evaporatedMg: number; shapedWaterRatio: number; linearShrink: number;
  fluxRatioMax: number; crack: number; stage: 'formed' | 'leather' | 'dry'; quality0: Record<string, number>;
  wallMm: number; areaM2: number; rimCrack: number; sun: number; covered: boolean;
  historyComplete: boolean; reportedJ: number;
}
type DryPhys = Pick<PotDryData, 'waterMg' | 'evaporatedMg' | 'linearShrink' | 'fluxRatioMax' | 'crack' | 'stage'>;

export function potDryStep(req: ScienceStepRequest): ScienceStepResult {
  const fail = (why: string) => failed(req, DRY_EVAL, why, DRY_SCHEMA);
  const bad = checkCommon(req, POT_DRY_PROCESS.processId, POT_DRY_PROCESS.processVersion, DRY_SCHEMA);
  if (bad) return fail(bad);
  if (req.lots.length !== 1 || req.lots[0].materialId !== GREEN_POT) return fail(`expected one ${GREEN_POT} lot`);
  if (req.energy.length) return fail('waiting uses no offered energy');
  const rack = req.equipment.find((e) => e.kind === 'drying_rack');
  if (!rack && req.stop !== 'equipment-lost') return fail('no drying_rack');
  for (const a of req.actions) {
    if (!['look', 'take_off'].includes(a.action)) return fail(`unknown action ${a.action} (look, take_off)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
  }
  const lot = req.lots[0];
  const fps = req.lots.map(fingerprint).sort();
  const eqFp = JSON.stringify([rack?.equipmentId, Object.entries(rack?.params ?? {}).sort(([x], [y]) => x.localeCompare(y))]);
  let d: PotDryData;
  if (req.state === null) {
    if (!rack) return fail('the rack was lost before the pot was put on it: nothing happened');
    const p = rack.params ?? {};
    if (!finite(p.sunExposure ?? 0, 0, 1)) return fail('drying_rack params.sunExposure must be within 0..1');
    if (![0, 1, undefined].includes(p.covered)) return fail('drying_rack params.covered must be 0 or 1 (leaves over the pot)');
    const q = lot.quality ?? {};
    if (![1, 2, 3].includes(q.form) || !finite(q.wall_mm, 2, 20) || !finite(q.capacity_ml, 1, 1e5)) return fail(`${GREEN_POT} ${lot.lotId} needs form, capacity_ml and wall_mm`);
    let comp: Composition;
    try { comp = tileComp(lot); } catch (e) { return fail((e as Error).message); }
    const water = comp.water ?? 0, dry = totalMg(comp) - water;
    if (dry <= 0) return fail('no clay in the pot');
    const f = POT_FORMS[q.form as Form];
    d = { lotId: lot.lotId, fps, eqFp, startMs: req.interval.from, seed: req.seed, lastTo: req.interval.from, location: lot.location,
      amountMg: lot.amount.value, dryMg: dry, waterMg: water, evaporatedMg: 0,
      shapedWaterRatio: (q.shaped_water_ratio_ppm ?? (water * 1e6) / dry) / 1e6, linearShrink: (q.linear_shrink_ppm ?? 0) / 1e6,
      fluxRatioMax: 0, crack: q.crack ?? 0, stage: 'formed', quality0: { ...q }, wallMm: q.wall_mm,
      areaM2: (potSurfaceCm2(q.form as Form, q.capacity_ml) * (1 + pv('potInsideDryShare'))) / 1e4, rimCrack: f.rimCrack,
      sun: p.sunExposure ?? 0, covered: p.covered === 1, historyComplete: (q.history_complete ?? 1) === 1, reportedJ: 0 };
  } else {
    d = structuredClone(req.state.data as PotDryData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the rack changed under a running run (send stop equipment-lost when it is lost)');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}; send a missed interval with environment.source 'unknown'`);
  }
  const takeOff = req.actions.filter((a) => a.action === 'take_off').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = takeOff ?? req.interval.to;
  const reads = req.actions.filter((a) => a.action === 'look' && a.at < endAt).sort((x, y) => x.at - y.at);
  const env = req.environment;
  // temperature, humidity and the wind are needed (a missing wind is unknown, an explicit 0 is calm)
  const known = envUsable(req) && env.humidity !== undefined && env.windMs !== undefined;
  const advance = (s: DryPhys, t: number, dt: number) => {
    const o = dryPhysics({ waterMg: s.waterMg, dryMg: d.dryMg, shapedWaterRatio: d.shapedWaterRatio, linearShrink: s.linearShrink,
      dimsMm: { w: 0, l: 0, t: d.wallMm }, airTempC: env.airTempC!, rh: env.humidity!, windMs: wind10m(req) * pv('windRackFactor'),
      sun: d.sun, dtS: dt, areaM2: d.areaM2, fluxFactor: d.covered ? pv('potCoverFluxFactor') : 1, crackFactor: d.rimCrack,
      fallingSlow: pv('potFallingSlow') * (d.wallMm / 8) ** 2 });
    s.waterMg -= o.evapExactMg; s.evaporatedMg += o.evapExactMg; s.linearShrink = o.linearShrink; s.stage = o.stage;
    if (o.fluxRatio !== null) s.fluxRatioMax = Math.max(s.fluxRatioMax, o.fluxRatio);
    if (o.crossedCritical && s.crack === 0) {
      const p = crackP(s.fluxRatioMax);
      if (p > 0 && draw(d.seed, req.runId, d.lotId, 'pot-dry') < p) s.crack = draw(d.seed, req.runId, d.lotId, 'pot-dry', 'severity') < Math.min(0.8, 0.25 * s.fluxRatioMax) ? 2 : 1;
    }
    void t;
  };
  const observations: Observation[] = [];
  const read = (at: number, s: DryPhys) => {
    if (!known || !d.historyComplete) return;
    const o = (quantity: string, text: string) => observations.push({ at, channel: 'sight', quantity, text });
    o('dryness', s.stage === 'dry' ? '全体が白っぽく乾いて、軽い' : s.stage === 'leather' ? '縁が先に白っぽくなり、胴はまだ色が濃い（革のかたさ）' : 'まだやわらかく、色が濃い');
    if (s.crack === 2) o('crack', '割れて分かれている');
    else if (s.crack === 1) o('crack', '縁に細いひびが入っている');
  };
  const snap = (): DryPhys => ({ waterMg: d.waterMg, evaporatedMg: d.evaporatedMg, linearShrink: d.linearShrink, fluxRatioMax: d.fluxRatioMax, crack: d.crack, stage: d.stage });
  let t = d.lastTo, k = 0;
  while (t < endAt) {
    for (; k < reads.length && reads[k].at <= t; k++) read(reads[k].at, d);
    const tEnd = subStepEnd(t, d.startMs, STEP_MS, endAt);
    for (; k < reads.length && reads[k].at < tEnd; k++) {
      const c = snap();
      if (known) advance(c, t, (reads[k].at - t) / 1000);
      read(reads[k].at, c);
    }
    if (known) advance(d, t, (tEnd - t) / 1000);
    t = tEnd;
  }
  if (!known && endAt > req.interval.from) d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d) || d.waterMg < 0) return fail('non-finite or negative state: refusing to return it');
  const evapInt = Math.floor(d.evaporatedMg + 1e-6);
  const cumJ = Math.floor((evapInt / 1e6) * pv('latentHeatWater25') + 1e-9), usedJ = cumJ - d.reportedJ;
  d.reportedJ = cumJ;
  const ending = takeOff !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt }, state: { schema: DRY_SCHEMA, data: d },
    status: ending ? (takeOff !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [],
    energy: usedJ > 0 ? [{ sourceId: `src:env-heat:${req.runId}`, kind: 'heat', usedJ, lostJ: usedJ, storedJ: 0 }] : [],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: DRY_EVAL, sourceRefs: ['S-dry', 'S-latent'], notes: '試験片の乾燥の式を器の面に広げた。内側の乾く割合・縁の割れやすさ・葉で覆う効果は仮定' },
    diagnostics: { waterRatio: d.waterMg / d.dryMg, stage: d.stage, fluxRatioMax: d.fluxRatioMax, evaporatedMg: d.evaporatedMg, historyComplete: d.historyComplete },
  };
  if (!ending) return res;
  // settle: whole mg of vapour (rounded down); the pot keeps the rest of its water
  const out = d.amountMg - evapInt;
  const comp = tileComp(lot); comp.water = (comp.water ?? 0) - evapInt;
  if (!comp.water) delete comp.water;
  const hist = d.historyComplete ? 1 : 0;
  res.consumed = [{ lotId: lot.lotId, amount: { ...lot.amount } }];
  res.produced = [{ materialId: d.stage === 'dry' ? DRY_POT : GREEN_POT, amount: { value: out, unit: 'mg' }, into: d.location, quality: {
    ...d.quality0, ...tileQuality(comp), linear_shrink_ppm: Math.round(d.linearShrink * 1e6), crack: d.crack, history_complete: hist } }];
  if (evapInt > 0) res.released = [{ materialId: 'water_vapour', amount: { value: evapInt, unit: 'mg' }, to: 'air' }];
  if (known && d.historyComplete) read(endAt, d);
  return res;
}

/** For checks: a green pot lot as p11y makes it, from the clay's make-up. */
export function readGreenPot(lot: LotView) { return { comp: tileComp(lot), form: lot.quality?.form as Form, wallMm: lot.quality?.wall_mm, capacityMl: lot.quality?.capacity_ml }; }
