// ScienceStep for the self-made barometer (m03x_air_barometer_pot), contract 0.1.x / 0.2.x, on the island clock.
// SELF_BAROMETER_DESIGN.md, owner's decisions 2026-10-09 (all as recommended): the test gauge tube first; the tube goes
// through the plug, its joint leaks apart from the walls; the gauge stands in the hut's shade; the tube's water is a lot
// handed back at the end; re-zeroing is the residents' own note (the world does nothing).
//
// The bulb is the residents' own sealed pot with a gauge tube through its plug (assembled_pot, table
// civ-sci.pot-assembly/4: capacityMl, airLeakTauMin, tubeBoreMm, tubeLengthMm, bulbTauS; main adds markMm, the stick
// it floats). It is the test gauge (m02x) with one thing more: the trapped air leaks.
//     (Pa + 2ρg x)(V0 + A x) = s · Tb,      s = n·R (Pa·m³/K), set to Pa0·V0/T0 when the gauge is set
//     ds/dt = −(V0 / (T0 · τ)) · 2ρg x      τ = airLeakTauMin (a pressure difference in the closed pot falls to 1/e)
// A pot that holds its air well reads as the test gauge; a leaky one rises while the pressure falls and creeps back when
// it stops: it shows how fast the pressure changes rather than how high it is (an approaching typhoon shows clearly).
// The reading creeps back with a time near 1.5 τ, not τ, because the water column moves too (SELF_BAROMETER_DESIGN §2).
//
// What it does not know, it carries as bounds, as the test gauge does: the bulb's temperature [lo, hi] and now the air
// in it [sLo, sHi] (a leak's size depends on the reading, which depends on what is not known). While the pressure is
// unknown the water may stand anywhere in the tube, so the air may leak either way at the most the tube allows. A reading
// is given only when both ends give the same mark. The water past an end of the tube: the open mouth spills water (it
// goes to the ground, settled at the end), the bottom lets air out as bubbles; either way the gauge no longer holds what
// it was set with. When that cannot be ruled out, the gauge's state is unknown: no numbers.
// Time: fixed 30 s cells from the run's start (the lamp's lesson, Codex A1 on eb3cd0b): how fast the air leaks is decided
// at a cell's start and held for the cell; inside a cell the bulb and the air are closed forms of the time since its start,
// so a request's end or a read between cells changes nothing. A read never changes the gauge (a spill it sees is
// recorded at the next cell's start).
// 0.2.0 (BAMBOO_TUBE_DESIGN.md, owner's decisions 2026-10-10): the weather pot (tubeForm 2, table /5). A straight bamboo
// tube through the plug dips into water put in the pot; the pot's air presses on that water, and the column in the tube
// stands x above the water's first level. The water lot is that water (handed back at the end, as the tube's water
// was). As the column rises the pot's water falls a little (the tube's area over the water's), so the head is
// (1 + A/Ares)·x instead of the U-tube's 2x and the air gains A·x:
//     (Pa + (1 + A/Ares)ρg x)(V0 + A x) = s · Tb,   V0 = the pot − the water − the tube inside it
// The column can rise to the tube's top (L − dip) and fall to its end (−dip): past the top it spills to the ground, past
// the end outside air bubbles into the pot. The water's heat slows the bulb (bulbTauS × (1 + water's heat / body's)).
// The pot's inside is taken as a sphere's (its widest section is the water's surface): assumed. The U-tube (form 1)
// reads exactly as 0.1.2.
// Not modelled (as m02x): the water evaporating from the open leg, water vapour in the bulb, capillarity, wind on the
// open leg, the tube's expansion; the pot changing in use (tar softening: the gauge stands in shade).

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { pv } from '../params';
import { AIR_RANGE_C, SPILL_NOW, SPILLED, type Geometry } from './barometer';
import { allFinite, stateShapeOk, checkCommon, contractExtras, failed, fingerprint, finite, isInt } from './common';

export const BAROMETER_POT_PROCESS = { processId: 'm03x_air_barometer_pot', processVersion: '0.2.2' } as const; // 0.2.2: reads sample the same whole seconds as the spill scan (SB-C3); the U-tube's bottom lets outside air in; impossible pots, very short τ and broken states refused // 0.2.1: the leak's conductance from the empty pot's capacity, not the air left above the water (Codex BW-A1) // 0.2.0: the weather pot (tubeForm 2) // 0.1.2: reads on the held pressure (Codex FX-SB-A1)
// /2 since 0.1.1 (the cell keeps its own pressure; a pressure gap keeps its extremes): a /1 run is refused; the host cancels it
// /4 since 0.2.1 (the stored leakK of a 0.2.0 weather pot was too small; /3 since 0.2.0: the geometry carries the head
// factor and the two ends): older states are refused, never resumed under a relabelled version; the host cancels the run
// and releases its reservation
const SCHEMA = 'civ-sci.air-barometer-pot/4', EVAL = 'air-barometer-pot-eval/0.2.2';
const BULB = 'assembled_pot';
const CELL_MS = 30_000, MIN_TAU_MIN = 10;

/** The gauge's shape: the test gauge's, with the head per metre of rise (2 for the U-tube, 1 + A/Ares for the weather
 *  pot) and how far the water may rise (topM) or fall (bottomM) before it passes an end. */
interface PotGeometry extends Geometry { form: 1 | 2; headK: number; topM: number; bottomM: number }
type Condition = 'ok' | 'spilled-top' | 'spilled-bottom' | 'unknown';
/** The gauge at the start of a cell. */
interface Snap { tMs: number; bLo: number; bHi: number; sLo: number; sHi: number }
/** What was decided at the cell's start (rates per second). */
interface Ctl { tKnown: boolean; Ta: number; pKnown: boolean; Pa: number; dsLo: number; dsHi: number }
interface PotGaugeData {
  eqId: string; paramsFp: string; g: PotGeometry; leakK: number; startMs: number; lastTo: number;
  waterFp: string; waterMg: number; waterLocation: string; spilledMg: number;
  s: Snap; ctl: Ctl; lastPaPa: number; lastPaAt: number; gapOpen: boolean; gapLoMinK: number; gapHiMaxK: number; gapSLo: number; gapSHi: number;
  condition: Condition; spilledAt: number; historyComplete: boolean;
}

/** The bulb's params from the assembled pot (table /5) and the stick main carved (markMm); the weather pot needs the
 *  water put in it (mg) as well. */
function bulbGeometry(p: Record<string, number>, waterMg: number): { g: PotGeometry; tauMin: number; capM3: number } | string {
  if (p.sealed !== 1 || p.airtightKnown !== 1) return `${BULB} must be sealed with its air-holding known (sealed 1, airtightKnown 1)`;
  if (!finite(p.airLeakTauMin, 1e-9)) return `${BULB} params.airLeakTauMin must be > 0 (a pot that holds its air)`;
  // the leak is held through each 30 s cell: a pot that loses its air in minutes is no gauge (and the held rate would
  // overshoot; Codex PHYS-SHORT-TAU)
  if (p.airLeakTauMin < MIN_TAU_MIN) return `${BULB} holds its air ${p.airLeakTauMin} min: too short to read (at least ${MIN_TAU_MIN} min)`;
  for (const k of ['capacityMl', 'tubeBoreMm', 'tubeLengthMm', 'bulbTauS', 'markMm']) if (!finite(p[k], 1e-9)) return `${BULB} params.${k} must be finite and > 0 (a pot with a gauge tube through its plug, table civ-sci.pot-assembly/5; markMm: the stick)`;
  if (![undefined, 2].includes(p.tubeForm)) return `${BULB} params.tubeForm is 2 (the weather pot) or absent (the U-tube)`;
  const r = p.tubeBoreMm / 2000, A = Math.PI * r * r;
  if (p.tubeForm !== 2) {
    const half = p.tubeLengthMm / 2000;
    return { g: { V0: p.capacityMl * 1e-6, A, halfLengthM: half, markM: p.markMm / 1000, tauS: p.bulbTauS, form: 1, headK: 2, topM: half, bottomM: half }, tauMin: p.airLeakTauMin, capM3: p.capacityMl * 1e-6 };
  }
  // the weather pot: its inside taken as a sphere's (assumed); the water stands on the widest section
  if (!finite(p.tubeOuterMm, p.tubeBoreMm, 60) || !finite(p.bulbHeatJPerK, 1e-9)) return `${BULB} params.tubeOuterMm and bulbHeatJPerK are needed for the weather pot (table /5)`;
  const V = p.capacityMl * 1e-6, D = Math.cbrt((6 * V) / Math.PI), Ares = (Math.PI * D * D) / 4;
  const W = waterMg * 1e-9 / (pv('waterDensity') / 1000), gap = pv('weatherPotTubeGapMm') / 1000, dip = W / Ares - gap;
  // the limit itself is allowed (300 mL in a 500 mL pot)
  if (W > pv('weatherPotMaxWaterShare') * V * (1 + 1e-12)) return `too much water for the weather pot: at most ${(pv('weatherPotMaxWaterShare') * p.capacityMl).toFixed(0)} mL (air must stay above it)`;
  if (dip < pv('weatherPotMinDipMm') / 1000) return `too little water for the weather pot: at least ${(((pv('weatherPotMinDipMm') / 1000 + gap) * Ares) * 1e6).toFixed(0)} mL (the tube's end must stand ${pv('weatherPotMinDipMm')} mm under it)`;
  const ro = p.tubeOuterMm / 2000, inside = D - gap, L = p.tubeLengthMm / 1000;
  if (L < inside + pv('weatherPotStickOutMm') / 1000) return `the tube is too short for this pot: at least ${((inside * 1000) + pv('weatherPotStickOutMm')).toFixed(0)} mm (down to the water and ${pv('weatherPotStickOutMm')} mm out of the plug)`;
  // the tube must fit in the pot and leave air above the water (Codex BW-C2: a huge tube could make V0 negative)
  if (2 * ro >= D / 2) return `the tube (outer ${p.tubeOuterMm} mm) is too thick for this pot (under ${((D / 2) * 1000).toFixed(0)} mm)`;
  const V0 = V - W - Math.PI * ro * ro * inside;
  if (!(V0 > 0.1 * V)) return 'too little air left above the water and around the tube (at least a tenth of the pot)';
  const tauS = p.bulbTauS * (1 + (waterMg / 1000) * pv('cpWater') / p.bulbHeatJPerK);
  return { g: { V0, A, halfLengthM: Math.max(L - dip, dip), markM: p.markMm / 1000, tauS, form: 2, headK: 1 + A / Ares, topM: L - dip, bottomM: dip }, tauMin: p.airLeakTauMin, capM3: V };
}
/** The rise for this gauge's head (the test gauge's rise() for the U-tube: the same numbers). */
function riseOf(g: PotGeometry, sealed: number, PaPa: number, bulbK: number): number {
  const k = g.headK * pv('waterDensity') * pv('gravity');
  const a = k * g.A, b = PaPa * g.A + k * g.V0, c = PaPa * g.V0 - sealed * bulbK;
  return (-2 * c) / (b + Math.sqrt(b * b - 4 * a * c));
}
const WEATHER_SPILL_NOW = { top: '管の上から水があふれた', bottom: '管の下の端まで水が下がり、外の空気が泡になって壺に入った' };
const WEATHER_SPILLED = { top: '水があふれて減ったまま。管の水が、置いたときの印と合わない', bottom: '壺に空気が入ったまま。管の水が、置いたときの印と合わない' };

const sourceOk = (req: ScienceStepRequest) => ['live', 'simulation', 'record'].includes(req.environment.source as string);
const tempKnown = (req: ScienceStepRequest) => sourceOk(req) && finite(req.environment.airTempC, AIR_RANGE_C[0], AIR_RANGE_C[1]);
const presKnown = (req: ScienceStepRequest) => sourceOk(req) && finite(req.environment.pressureHPa, 800, 1100);

export function barometerPotStep(req: ScienceStepRequest): ScienceStepResult {
  const fail = (why: string) => failed(req, EVAL, why, SCHEMA);
  const bad = checkCommon(req, BAROMETER_POT_PROCESS.processId, BAROMETER_POT_PROCESS.processVersion, SCHEMA);
  if (bad) return fail(bad);
  if (req.energy.length) return fail('the barometer uses no energy: offer none');
  const waters = req.lots.filter((l) => l.materialId === 'process_water');
  if (waters.length !== 1 || req.lots.length !== 1) return fail('expected one process_water lot: the water in the tube');
  const water = waters[0];
  const eq = req.equipment.find((e) => e.kind === BULB);
  if (!eq && req.stop !== 'equipment-lost') return fail(`no ${BULB} (a sealed pot with a gauge tube through its plug)`);
  const fpOf = (p: Record<string, number>) => JSON.stringify(Object.entries(p).sort(([x], [y]) => x.localeCompare(y)));
  for (const a of req.actions) {
    if (a.action !== 'read_gauge' && a.action !== 'take_out') return fail(`unknown action ${a.action} (read_gauge, take_out)`);
    if (!(isInt(a.at) && a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
  }
  const tKnown = tempKnown(req), pKnown = presKnown(req);

  let d: PotGaugeData;
  if (req.state === null) {
    if (!eq) return fail('the gauge was lost before it was set: nothing happened');
    if (!isInt(water.amount.value, 1)) return fail('the water lot needs a whole positive mg');
    const b = bulbGeometry(eq.params ?? {}, water.amount.value);
    if (typeof b === 'string') return fail(b);
    const needMl = b.g.A * b.g.halfLengthM * 2 * 1e6 / 2; // both legs filled to the middle of the tube
    if (b.g.form === 1 && water.amount.value / 1000 < needMl) return fail(`the tube needs at least ${needMl.toFixed(1)} mL of water to stand in both legs`);
    if (!tKnown || !pKnown) return fail('the gauge is set only with known weather (air temperature and pressure)');
    const T0 = req.environment.airTempC! + 273.15, P0 = req.environment.pressureHPa! * 100, s0 = (P0 * b.g.V0) / T0;
    // the leak is the pot's fixed conductance: airLeakTauMin is defined on the EMPTY pot (its whole capacity: table /5),
    // so alpha = capacity / (T0 · τ), whatever water is put in it (0.2.1, Codex BW-A1: not the air volume V0 left above
    // the water, which made a half-filled weather pot leak half as fast). For the U-tube V0 is the capacity: as before.
    d = { eqId: eq.equipmentId, paramsFp: fpOf(eq.params ?? {}), g: b.g, leakK: (b.capM3 / (T0 * b.tauMin * 60)) * (b.g.headK * pv('waterDensity') * pv('gravity')), startMs: req.interval.from, lastTo: req.interval.from,
      waterFp: fingerprint(water), waterMg: water.amount.value, waterLocation: water.location, spilledMg: 0,
      s: { tMs: req.interval.from, bLo: T0, bHi: T0, sLo: s0, sHi: s0 }, ctl: { tKnown: true, Ta: T0, pKnown: true, Pa: P0, dsLo: 0, dsHi: 0 },
      lastPaPa: P0, lastPaAt: req.interval.from, gapOpen: false, gapLoMinK: T0, gapHiMaxK: T0, gapSLo: s0, gapSHi: s0, condition: 'ok', spilledAt: -1,
      historyComplete: (water.quality?.history_complete ?? 1) === 1 };
  } else {
    if (!stateShapeOk(req.state.data, { num: ['leakK', 'startMs', 'lastTo', 'waterMg', 'spilledMg', 'lastPaPa', 'lastPaAt', 'gapLoMinK', 'gapHiMaxK', 'gapSLo', 'gapSHi', 'spilledAt'],
      str: ['eqId', 'paramsFp', 'waterFp', 'waterLocation', 'condition'], bool: ['gapOpen', 'historyComplete'], obj: ['g', 's', 'ctl'] }))
      return fail('corrupt-state: the saved gauge is not one this step wrote (cancel the run and set it again)');
    d = structuredClone(req.state.data as PotGaugeData);
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
    if (fingerprint(water) !== d.waterFp) return fail('changed-input: the water lot changed under a running run');
    if (eq && (eq.equipmentId !== d.eqId || fpOf(eq.params ?? {}) !== d.paramsFp)) return fail('changed-input: the gauge changed under a running run');
  }
  const g = d.g;
  const Pa = pKnown ? req.environment.pressureHPa! * 100 : NaN, Ta = tKnown ? req.environment.airTempC! + 273.15 : NaN;
  const toMin = AIR_RANGE_C[0] + 273.15, toMax = AIR_RANGE_C[1] + 273.15;
  const takeOut = req.actions.filter((a) => a.action === 'take_out').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = takeOut ?? req.interval.to;
  const ending = takeOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const observations: Observation[] = [];
  let unreadable = 0;
  const obs = (at: number, o: Partial<Observation>) => observations.push({ at, channel: `instrument:${d.eqId}`, quantity: 'level', ...o });

  /** The gauge at t inside the current cell (closed forms; no decisions). */
  const at = (t: number): Snap => {
    const s = d.s, c = d.ctl, sec = (t - s.tMs) / 1000, f = Math.exp(-sec / g.tauS);
    const [bLo, bHi] = c.tKnown ? [c.Ta + (s.bLo - c.Ta) * f, c.Ta + (s.bHi - c.Ta) * f] : [Math.min(toMin + (s.bLo - toMin) * f, s.bLo), Math.max(toMax + (s.bHi - toMax) * f, s.bHi)];
    return { tMs: t, bLo, bHi, sLo: Math.max(1e-12, s.sLo + c.dsLo * sec), sHi: Math.max(1e-12, s.sHi + c.dsHi * sec) };
  };
  const xBounds = (s: Snap, P: number) => [riseOf(g, s.sLo, P, s.bLo), riseOf(g, s.sHi, P, s.bHi)] as const;
  const NOW = g.form === 2 ? WEATHER_SPILL_NOW : SPILL_NOW, AFTER = g.form === 2 ? WEATHER_SPILLED : SPILLED;
  /** What the water did between the cell's start and `until`, at the pressure the cell was decided with (Codex SB-A3:
   *  an end passed inside a cell is a physical event, whatever the next cell's weather). Known exactly: the levels are
   *  scanned each second (and at `until`); the first moment past an end is the spill, and over the mouth the water
   *  lost is the most it stood above it in the stretch (afterwards the gauge is no longer followed). With bounds: the widest the
   *  bounds reach in the stretch (each bound moves one way within a cell) passing an end makes it unknown. */
  // 0.2.2 (SB-C3): a read samples the same whole seconds from the cell's start as the spill the cell records, never its
  // own moment between them (a peak between two seconds, about a nanometre above them, was read as a spill that was
  // never recorded); the run's end is a real moment and is sampled
  const scan = (until: number, endSample = true): { kind: 'top' | 'bottom' | 'maybe'; at: number; excessM: number } | null => {
    const c = d.ctl, s0 = d.s;
    if (!c.pKnown || d.condition !== 'ok' || until <= s0.tMs) return null;
    const s1 = at(until);
    if (s0.bLo === s0.bHi && s0.sLo === s0.sHi && c.dsLo === c.dsHi && c.tKnown) {
      // the first moment past an end, and for the mouth the highest the water stands over it in the rest of the stretch
      let first: { kind: 'top' | 'bottom'; at: number; excessM: number } | null = null;
      const last = endSample ? until : s0.tMs + Math.floor((until - s0.tMs) / 1000) * 1000;
      for (let t = s0.tMs; ; t = Math.min(last, t + 1000)) {
        const x = riseOf(g, at(t).sHi, c.Pa, at(t).bHi);
        if (!first && x > g.topM) first = { kind: 'top', at: t, excessM: 0 };
        if (!first && x < -g.bottomM) return { kind: 'bottom', at: t, excessM: 0 };
        if (first?.kind === 'top') first.excessM = Math.max(first.excessM, x - g.topM);
        if (t >= last) return first;
      }
    }
    const hi = riseOf(g, Math.max(s0.sHi, s1.sHi), c.Pa, Math.max(s0.bHi, s1.bHi)), lo = riseOf(g, Math.min(s0.sLo, s1.sLo), c.Pa, Math.min(s0.bLo, s1.bLo));
    return hi > g.topM || lo < -g.bottomM ? { kind: 'maybe', at: until, excessM: 0 } : null;
  };
  /** Decide at a cell's start, with this request's weather. */
  const decide = () => {
    let dsLo = 0, dsHi = 0;
    if (d.condition === 'ok' || d.condition === 'unknown') {
      if (pKnown && d.condition === 'ok') {
        const [xLo, xHi] = xBounds(d.s, Pa), cl = (x: number) => Math.max(-g.bottomM, Math.min(g.topM, x));
        dsLo = -d.leakK * cl(xHi); dsHi = -d.leakK * cl(xLo);
      } else { dsLo = -d.leakK * g.topM; dsHi = d.leakK * g.bottomM; } // the water anywhere in the tube
    }
    d.ctl = { tKnown, Ta: tKnown ? Ta : 0, pKnown, Pa: pKnown ? Pa : 0, dsLo, dsHi };
  };
  /** Close the stretch to t: what happened in it is recorded (a spill), then the gauge moves to t. */
  const commit = (t: number) => {
    if (t <= d.s.tMs) return;
    const e = scan(t);
    if (e?.kind === 'maybe') d.condition = 'unknown';
    else if (e) {
      d.condition = e.kind === 'top' ? 'spilled-top' : 'spilled-bottom'; d.spilledAt = e.at;
      if (e.kind === 'top') d.spilledMg = Math.min(d.waterMg, Math.max(1, Math.round(e.excessM * g.A * 1e9)));
    }
    d.s = at(t);
    if (d.gapOpen) { d.gapLoMinK = Math.min(d.gapLoMinK, d.s.bLo); d.gapHiMaxK = Math.max(d.gapHiMaxK, d.s.bHi); d.gapSLo = Math.min(d.gapSLo, d.s.sLo); d.gapSHi = Math.max(d.gapSHi, d.s.sHi); }
  };
  const nextCell = (t: number) => d.startMs + (Math.floor((t - d.startMs) / CELL_MS) + 1) * CELL_MS;
  const rollTo = (t: number, inclusive: boolean) => {
    for (let c = nextCell(d.s.tMs); inclusive ? c <= t : c < t; c = nextCell(c)) { commit(c); decide(); }
  };
  /** A read: what the gauge shows at t, never changing it (a spill earlier in this cell is seen as it will be recorded). */
  // 0.1.2 (Codex FX-SB-A1 on 7318506): a read follows the same held trajectory as the leak and the spill: the pressure
  // the cell was decided with, never this request's if it changed inside the cell (a known change counts from the next
  // cell, as everywhere else in this step). So a number is never one the recorded water level could not show.
  const read = (t: number) => {
    if (!pKnown || !d.ctl.pKnown || d.condition === 'unknown') { unreadable++; return; }
    if (d.condition !== 'ok') { obs(t, { text: (t === d.spilledAt ? NOW : AFTER)[d.condition === 'spilled-top' ? 'top' : 'bottom'] }); return; }
    const e = scan(t, false);
    if (e?.kind === 'maybe') { unreadable++; return; }
    if (e) { obs(t, { text: (e.at === t ? NOW : AFTER)[e.kind] }); return; }
    // between two sampled seconds the level is within the tube by the samples' account (a sub-second excess is clamped)
    const cl = (x: number) => Math.max(-g.bottomM, Math.min(g.topM, x));
    const s = at(t), [xLo, xHi] = xBounds(s, d.ctl.Pa).map(cl);
    const mLo = Math.round(xLo / g.markM), mHi = Math.round(xHi / g.markM);
    if (mLo === mHi) obs(t, { value: mHi, unit: 'mark', precision: 1 }); else unreadable++;
  };

  if (req.state === null) decide();
  else {
    // where the gauge is at this request's start, from the cell running across it (no decision is made here)
    const now = at(req.interval.from);
    if (!pKnown && !d.gapOpen) { d.gapOpen = true; d.gapLoMinK = now.bLo; d.gapHiMaxK = now.bHi; d.gapSLo = now.sLo; d.gapSHi = now.sHi; }
    if (pKnown && d.gapOpen) {
      // the pressure comes back: could the water have passed an end while nobody knew it? The bulb's temperature and
      // the air are taken at their widest over the whole gap, up to this very moment (Codex SB-A4); the level being back
      // inside the tube now does not show it never left it
      d.gapLoMinK = Math.min(d.gapLoMinK, now.bLo); d.gapHiMaxK = Math.max(d.gapHiMaxK, now.bHi); d.gapSLo = Math.min(d.gapSLo, now.sLo); d.gapSHi = Math.max(d.gapSHi, now.sHi);
      if (d.condition === 'ok') {
        const T = (req.interval.from - d.lastPaAt) / 3_600_000, R = pv('pressureRateMaxHPaPerH'), P1 = d.lastPaPa / 100, P2 = Pa / 100;
        if (R * T < Math.abs(P1 - P2)) d.condition = 'unknown';
        else {
          const pMin = Math.max(800, (P1 + P2 - R * T) / 2) * 100, pMax = Math.min(1100, (P1 + P2 + R * T) / 2) * 100;
          if (riseOf(g, d.gapSHi, pMin, d.gapHiMaxK) > g.topM || riseOf(g, d.gapSLo, pMax, d.gapLoMinK) < -g.bottomM) d.condition = 'unknown';
        }
      }
      d.gapOpen = false;
    }
  }
  const reads = req.actions.filter((a) => a.action === 'read_gauge' && a.at < endAt).map((a) => a.at).sort((x, y) => x - y);
  for (const r of reads) { rollTo(r, true); read(r); }
  rollTo(endAt, false);
  if (ending) commit(endAt);
  if (pKnown) { d.lastPaPa = Pa; d.lastPaAt = endAt; }
  if (!tKnown || !pKnown) d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');

  const diagnostics: Record<string, unknown> = { condition: d.condition, bulbC: [d.s.bLo - 273.15, d.s.bHi - 273.15], airLeft: [d.s.sLo, d.s.sHi], spilledMg: d.spilledMg };
  if (!tKnown || !pKnown) diagnostics.skipped = `environment ${req.environment.source}: ${!tKnown ? 'air temperature' : ''}${!tKnown && !pKnown ? ' and ' : ''}${!pKnown ? 'pressure' : ''} not known`;
  if (unreadable) diagnostics.unreadable = unreadable;
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (takeOut !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: [],
      notes: '理想気体と水の柱の釣り合い（OpenStax の本文で照合、器の実測ではない）。器の漏れ（空気を保つ時間、継ぎ目の漏れ）、器の温度の追従、分からない区間の気温・気圧の幅は仮定。蒸発・器の中の水蒸気・毛管現象は扱わない' },
    diagnostics: { ...diagnostics, historyComplete: d.historyComplete },
  };
  if (!ending) return res;
  // the water goes back, less what spilled over the mouth (to the ground)
  res.consumed = [{ lotId: water.lotId, amount: { ...water.amount } }];
  const back = d.waterMg - d.spilledMg;
  if (back > 0) res.produced.push({ materialId: 'process_water', amount: { value: back, unit: 'mg' }, into: d.waterLocation, quality: { ...(water.quality ?? {}), history_complete: d.historyComplete ? 1 : 0 } });
  if (d.spilledMg > 0) res.released.push({ materialId: 'process_water', amount: { value: d.spilledMg, unit: 'mg' }, to: 'ground' });
  return res;
}
