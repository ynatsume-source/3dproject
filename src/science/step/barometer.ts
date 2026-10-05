// ScienceStep for a test air-and-water barometer (m02x_air_barometer_test), contract 0.1.x / 0.2.x.
//
// A closed bulb of air is joined to a U-tube of water; the other leg is open to the air. When the gauge is set
// (the run's first request), both water levels are equal: the bulb holds the air of that moment. Afterwards the
// trapped air pushes the water as the outside pressure and the bulb's temperature change:
//     (Pa + 2·ρ·g·x) · (V0 + A·x) = Pa0 · V0 · Tb / T0
// x is how far the open leg's water has risen (the bulb-side level falls as much). A falling pressure and a warmer
// bulb both raise the open leg: a resident cannot tell them apart from one reading. With a 500 mL bulb and an 8 mm
// bore, a fall of 30 hPa raises it about 10 cm, and 1 °C warmer about 1.1 cm. Telling the two apart (read at the
// same hour, keep the bulb in water, compare with a second gauge) is the resident's work, not this step's.
// The bulb's temperature follows the air with a lag (bulbTauS: minutes in air, hours under water).
// The reading is a count of marks on the stick that floats in the open leg: no unit the residents do not have.
// Waiting process: on the island clock. Nothing is consumed, no energy is used. Not modelled: leaks, the water
// evaporating from the open leg, water vapour in the bulb, capillarity, wind on the open leg, the tube's own expansion.
//
// What the step does not know, it carries as bounds (0.1.1, Codex review of 5971025):
// - the bulb's temperature is a range [lo, hi]. While the air temperature is known both ends follow it; while it is
//   not, they spread toward gapAirMinC / gapAirMaxC. A reading is given only when both ends give the same mark.
// - the air temperature alone moves the bulb: an hour with the pressure missing still warms or cools it.
// - the water past either end of the tube (the open mouth, or the bottom of the U) spills or lets the trapped air out:
//   the gauge no longer holds the air it was set with, and says so until it is set again (a new run). When that
//   cannot be ruled out (a gap in the pressure, a wide temperature range), the gauge's state is unknown: no numbers.
// - a lost gauge is lost at interval.to: what happened before that in the interval (warming, readings) still counts.

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { pv } from '../params';
import { allFinite, checkCommon, contractExtras, failed, finite, isInt, subStepEnd } from './common';

export const BAROMETER_PROCESS = { processId: 'm02x_air_barometer_test', processVersion: '0.1.1' } as const;
const SCHEMA = 'civ-sci.air-barometer/2';
const EVAL = 'air-barometer-eval/0.1.1';
const GAUGE = 'fixture_air_barometer';
const STEP_MS = 30_000; // the bulb's temperature advances on the run's 30 s grid: 30 s-aligned chunks give identical states

type Condition = 'ok' | 'spilled-top' | 'spilled-bottom' | 'unknown';

interface GaugeData {
  eqId: string; params: Record<string, number>; paramsFp: string; startMs: number; lastTo: number;
  /** Pa0 · V0 / T0 of the air sealed in (Pa·m³/K): the amount of trapped air */
  sealed: number;
  bulbLoK: number; bulbHiK: number;   // the bulb's temperature at lastTo lies in [lo, hi] (equal when known)
  lastPaPa: number; lastPaAt: number; // the last known outside pressure, and until when it was known
  gapLoMinK: number; gapHiMaxK: number; // while the pressure is unknown: the widest bulb range met so far
  condition: Condition;
  spilledAt: number;                 // when the water passed an end (-1: never)
  historyComplete: boolean;
}

interface Geometry { V0: number; A: number; halfLengthM: number; markM: number; tauS: number }

function geometry(p: Record<string, number>): Geometry | string {
  for (const k of ['bulbVolumeMl', 'tubeBoreMm', 'tubeLengthMm', 'markMm', 'bulbTauS']) {
    if (!finite(p[k], 1e-9)) return `${GAUGE} params.${k} must be finite and > 0`;
  }
  const r = p.tubeBoreMm / 2000;
  return { V0: p.bulbVolumeMl * 1e-6, A: Math.PI * r * r, halfLengthM: p.tubeLengthMm / 2000, markM: p.markMm / 1000, tauS: p.bulbTauS };
}

/** How far the open leg's water stands above the bulb side's starting level (m), for outside pressure Pa (Pa). */
export function rise(g: Geometry, sealed: number, PaPa: number, bulbK: number): number {
  const k = 2 * pv('waterDensity') * pv('gravity');
  const a = k * g.A, b = PaPa * g.A + k * g.V0, c = PaPa * g.V0 - sealed * bulbK;
  return (-2 * c) / (b + Math.sqrt(b * b - 4 * a * c)); // the root near 0, without cancellation
}

const sourceOk = (req: ScienceStepRequest) => {
  const s = req.environment.source;
  return s === 'live' || s === 'simulation' || s === ('record' as string);
};
const tempKnown = (req: ScienceStepRequest) => sourceOk(req) && finite(req.environment.airTempC, -60, 70);
const presKnown = (req: ScienceStepRequest) => sourceOk(req) && finite(req.environment.pressureHPa, 800, 1100);

const SPILL_NOW = { top: '水が開いた管の口まで上がって、あふれた', bottom: '開いた管の水が底まで下がり、器の空気が泡になって抜けた' };
const SPILLED = { top: '水があふれて減ったまま。両側の水面が、置いたときの印と合わない', bottom: '器の空気が抜けたまま。両側の水面が、置いたときの印と合わない' };

export function barometerStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, BAROMETER_PROCESS.processId, BAROMETER_PROCESS.processVersion, SCHEMA);
  if (bad) return failed(req, EVAL, bad, SCHEMA);
  if (req.lots.length) return failed(req, EVAL, 'the test barometer takes no material lots', SCHEMA);
  if (req.energy.length) return failed(req, EVAL, 'the barometer uses no energy: offer none', SCHEMA);
  const eq = req.equipment.find((e) => e.kind === GAUGE);
  if (!eq && req.stop !== 'equipment-lost') return failed(req, EVAL, `no ${GAUGE}`, SCHEMA);
  const fpOf = (p: Record<string, number>) => JSON.stringify(Object.entries(p).sort(([x], [y]) => x.localeCompare(y)));
  const tKnown = tempKnown(req), pKnown = presKnown(req);

  let d: GaugeData;
  if (req.state === null) {
    if (!eq) return failed(req, EVAL, 'the gauge was lost before it was set: nothing happened', SCHEMA);
    const g0 = geometry(eq.params ?? {});
    if (typeof g0 === 'string') return failed(req, EVAL, g0, SCHEMA);
    if (!tKnown || !pKnown) return failed(req, EVAL, 'the gauge is set only with known weather (air temperature and pressure)', SCHEMA);
    const T0 = req.environment.airTempC! + 273.15, P0 = req.environment.pressureHPa! * 100;
    d = { eqId: eq.equipmentId, params: { ...eq.params }, paramsFp: fpOf(eq.params ?? {}), startMs: req.interval.from, lastTo: req.interval.from,
      sealed: (P0 * g0.V0) / T0, bulbLoK: T0, bulbHiK: T0, lastPaPa: P0, lastPaAt: req.interval.from,
      gapLoMinK: T0, gapHiMaxK: T0, condition: 'ok', spilledAt: -1, historyComplete: true };
  } else {
    d = structuredClone(req.state.data as GaugeData);
    if (req.interval.from !== d.lastTo) return failed(req, EVAL, `noncontiguous-interval: expected from=${d.lastTo}`, SCHEMA);
    if (eq && (eq.equipmentId !== d.eqId || fpOf(eq.params ?? {}) !== d.paramsFp)) return failed(req, EVAL, 'changed-input: the gauge changed under a running run', SCHEMA);
  }
  for (const a of req.actions) {
    if (a.action !== 'read_gauge') return failed(req, EVAL, `unknown action ${a.action} (only read_gauge)`, SCHEMA);
    if (!(isInt(a.at) && a.at >= req.interval.from && a.at < req.interval.to)) return failed(req, EVAL, 'read_gauge must fall inside the interval', SCHEMA);
  }

  // the gauge as it was set (kept in the state): a gauge lost at interval.to still lived through the interval
  const g = geometry(d.params) as Geometry;
  const Pa = pKnown ? req.environment.pressureHPa! * 100 : NaN;
  const toMin = pv('gapAirMinC') + 273.15, toMax = pv('gapAirMaxC') + 273.15;
  const Ta = tKnown ? req.environment.airTempC! + 273.15 : NaN;
  const observations: Observation[] = [];
  let unreadable = 0;
  const obs = (at: number, o: Partial<Observation>) => observations.push({ at, channel: `instrument:${d.eqId}`, quantity: 'level', ...o });

  /** Did the water pass an end of the tube at this moment (pressure known)? Certain → spilled; only possible → unknown. */
  const check = (at: number, lo: number, hi: number): 'top' | 'bottom' | null => {
    if (d.condition !== 'ok') return null;
    const xHi = rise(g, d.sealed, Pa, hi), xLo = rise(g, d.sealed, Pa, lo);
    const over = xHi > g.halfLengthM ? 'top' : xLo < -g.halfLengthM ? 'bottom' : null;
    if (over) d.condition = lo === hi ? (over === 'top' ? 'spilled-top' : 'spilled-bottom') : 'unknown';
    if (over && lo === hi) d.spilledAt = at;
    return over;
  };

  if (pKnown && d.lastPaAt < req.interval.from && d.condition === 'ok') {
    // the pressure comes back after a gap: could the water have passed an end while nobody knew the pressure?
    const T = (req.interval.from - d.lastPaAt) / 3_600_000, R = pv('pressureRateMaxHPaPerH');
    const P1 = d.lastPaPa / 100, P2 = Pa / 100;
    if (R * T < Math.abs(P1 - P2)) d.condition = 'unknown';
    else {
      const pMin = Math.max(800, (P1 + P2 - R * T) / 2) * 100, pMax = Math.min(1100, (P1 + P2 + R * T) / 2) * 100;
      if (rise(g, d.sealed, pMin, d.gapHiMaxK) > g.halfLengthM || rise(g, d.sealed, pMax, d.gapLoMinK) < -g.halfLengthM) d.condition = 'unknown';
    }
  }
  if (!pKnown && d.lastPaAt === req.interval.from) { d.gapLoMinK = d.bulbLoK; d.gapHiMaxK = d.bulbHiK; } // a pressure gap begins
  if (pKnown) check(req.interval.from, d.bulbLoK, d.bulbHiK); // the pressure of this interval meets the bulb as it is at its start

  const relax = (lo: number, hi: number, dtMs: number): [number, number] => {
    const f = Math.exp(-dtMs / 1000 / g.tauS);
    return tKnown ? [Ta + (lo - Ta) * f, Ta + (hi - Ta) * f] : [Math.min(toMin + (lo - toMin) * f, lo), Math.max(toMax + (hi - toMax) * f, hi)];
  };
  const reads = [...req.actions].sort((x, y) => x.at - y.at);
  let t = d.lastTo, k = 0;
  const readUntil = (end: number) => {
    for (; k < reads.length && reads[k].at < end; k++) {
      const at = reads[k].at;
      if (!pKnown || d.condition === 'unknown') { unreadable++; continue; }
      if (d.condition !== 'ok') { const side = d.condition === 'spilled-top' ? 'top' : 'bottom'; obs(at, { text: (at === d.spilledAt ? SPILL_NOW : SPILLED)[side] }); continue; }
      const [lo, hi] = relax(d.bulbLoK, d.bulbHiK, at - t);
      const over = check(at, lo, hi);
      if (over && (d.condition as Condition) !== 'unknown') { obs(at, { text: SPILL_NOW[over] }); continue; }
      if (over) { unreadable++; continue; }
      const mLo = Math.round(rise(g, d.sealed, Pa, lo) / g.markM), mHi = Math.round(rise(g, d.sealed, Pa, hi) / g.markM);
      if (mLo === mHi) obs(at, { value: mHi, unit: 'mark', precision: 1 });
      else unreadable++; // the bulb's temperature is not known well enough to say which mark: nothing invented
    }
  };
  while (t < req.interval.to) {
    const tEnd = subStepEnd(t, d.startMs, STEP_MS, req.interval.to);
    readUntil(tEnd);
    [d.bulbLoK, d.bulbHiK] = relax(d.bulbLoK, d.bulbHiK, tEnd - t);
    if (pKnown) check(tEnd, d.bulbLoK, d.bulbHiK);
    else { d.gapLoMinK = Math.min(d.gapLoMinK, d.bulbLoK); d.gapHiMaxK = Math.max(d.gapHiMaxK, d.bulbHiK); }
    t = tEnd;
  }
  readUntil(Infinity);
  if (pKnown) { d.lastPaPa = Pa; d.lastPaAt = req.interval.to; }
  if (!tKnown || !pKnown) d.historyComplete = false;
  d.lastTo = req.interval.to;
  if (!allFinite(d)) return failed(req, EVAL, 'non-finite state: refusing to return it', SCHEMA);

  const diagnostics: Record<string, unknown> = { condition: d.condition, bulbC: [d.bulbLoK - 273.15, d.bulbHiK - 273.15] };
  if (pKnown && d.bulbLoK === d.bulbHiK) diagnostics.riseMm = rise(g, d.sealed, Pa, d.bulbHiK) * 1000;
  if (!tKnown || !pKnown) diagnostics.skipped = `environment ${req.environment.source}: ${!tKnown ? 'air temperature' : ''}${!tKnown && !pKnown ? ' and ' : ''}${!pKnown ? 'pressure' : ''} not known`;
  if (unreadable) diagnostics.unreadable = unreadable;
  const ending = req.stop === 'operator' || req.stop === 'equipment-lost';
  return {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.to },
    state: { schema: SCHEMA, data: d }, status: ending ? 'stopped' : 'running',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: [],
      notes: '理想気体と水の柱の釣り合い（OpenStax の本文で照合、器の実測ではない）。器の温度の追従（時定数）、分からない区間の気温・気圧の幅は仮定。漏れ・蒸発・器の中の水蒸気・毛管現象は扱わない' },
    diagnostics: { ...diagnostics, historyComplete: d.historyComplete },
  };
}
