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
// Not modelled (as m02x): the water evaporating from the open leg, water vapour in the bulb, capillarity, wind on the
// open leg, the tube's expansion; the pot changing in use (tar softening: the gauge stands in shade).

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { pv } from '../params';
import { AIR_RANGE_C, rise, SPILL_NOW, SPILLED, type Geometry } from './barometer';
import { allFinite, checkCommon, contractExtras, failed, fingerprint, finite, isInt } from './common';

export const BAROMETER_POT_PROCESS = { processId: 'm03x_air_barometer_pot', processVersion: '0.1.0' } as const;
const SCHEMA = 'civ-sci.air-barometer-pot/1', EVAL = 'air-barometer-pot-eval/0.1.0';
const BULB = 'assembled_pot';
const CELL_MS = 30_000;

type Condition = 'ok' | 'spilled-top' | 'spilled-bottom' | 'unknown';
/** The gauge at the start of a cell. */
interface Snap { tMs: number; bLo: number; bHi: number; sLo: number; sHi: number }
/** What was decided at the cell's start (rates per second). */
interface Ctl { tKnown: boolean; Ta: number; dsLo: number; dsHi: number }
interface PotGaugeData {
  eqId: string; paramsFp: string; g: Geometry; leakK: number; startMs: number; lastTo: number;
  waterFp: string; waterMg: number; waterLocation: string; spilledMg: number;
  s: Snap; ctl: Ctl; lastPaPa: number; lastPaAt: number; gapLoMinK: number; gapHiMaxK: number;
  condition: Condition; spilledAt: number; historyComplete: boolean;
}

/** The bulb's params from the assembled pot (table /4) and the stick main carved (markMm). */
function bulbGeometry(p: Record<string, number>): { g: Geometry; tauMin: number } | string {
  if (p.sealed !== 1 || p.airtightKnown !== 1) return `${BULB} must be sealed with its air-holding known (sealed 1, airtightKnown 1)`;
  if (!finite(p.airLeakTauMin, 1e-9)) return `${BULB} params.airLeakTauMin must be > 0 (a pot that holds its air)`;
  for (const k of ['capacityMl', 'tubeBoreMm', 'tubeLengthMm', 'bulbTauS', 'markMm']) if (!finite(p[k], 1e-9)) return `${BULB} params.${k} must be finite and > 0 (a pot with a gauge tube through its plug, table civ-sci.pot-assembly/4; markMm: the stick)`;
  const r = p.tubeBoreMm / 2000;
  return { g: { V0: p.capacityMl * 1e-6, A: Math.PI * r * r, halfLengthM: p.tubeLengthMm / 2000, markM: p.markMm / 1000, tauS: p.bulbTauS }, tauMin: p.airLeakTauMin };
}

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
  const k2 = 2 * pv('waterDensity') * pv('gravity');

  let d: PotGaugeData;
  if (req.state === null) {
    if (!eq) return fail('the gauge was lost before it was set: nothing happened');
    const b = bulbGeometry(eq.params ?? {});
    if (typeof b === 'string') return fail(b);
    const needMl = b.g.A * b.g.halfLengthM * 2 * 1e6 / 2; // both legs filled to the middle of the tube
    if (!isInt(water.amount.value, 1) || water.amount.value / 1000 < needMl) return fail(`the tube needs at least ${needMl.toFixed(1)} mL of water to stand in both legs`);
    if (!tKnown || !pKnown) return fail('the gauge is set only with known weather (air temperature and pressure)');
    const T0 = req.environment.airTempC! + 273.15, P0 = req.environment.pressureHPa! * 100, s0 = (P0 * b.g.V0) / T0;
    d = { eqId: eq.equipmentId, paramsFp: fpOf(eq.params ?? {}), g: b.g, leakK: (b.g.V0 / (T0 * b.tauMin * 60)) * k2, startMs: req.interval.from, lastTo: req.interval.from,
      waterFp: fingerprint(water), waterMg: water.amount.value, waterLocation: water.location, spilledMg: 0,
      s: { tMs: req.interval.from, bLo: T0, bHi: T0, sLo: s0, sHi: s0 }, ctl: { tKnown: true, Ta: T0, dsLo: 0, dsHi: 0 },
      lastPaPa: P0, lastPaAt: req.interval.from, gapLoMinK: T0, gapHiMaxK: T0, condition: 'ok', spilledAt: -1,
      historyComplete: (water.quality?.history_complete ?? 1) === 1 };
  } else {
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
  const xBounds = (s: Snap, P: number) => [rise(g, s.sLo, P, s.bLo), rise(g, s.sHi, P, s.bHi)] as const;
  /** Did the water pass an end (pressure known)? Certain → spilled (the water over the mouth goes to the ground);
   *  only possible → unknown. */
  const check = (t: number) => {
    if (d.condition !== 'ok' || !pKnown) return;
    const [xLo, xHi] = xBounds(d.s, Pa), certain = d.s.bLo === d.s.bHi && d.s.sLo === d.s.sHi;
    const over = xHi > g.halfLengthM ? 'top' : xLo < -g.halfLengthM ? 'bottom' : null;
    if (!over) return;
    if (!certain) { d.condition = 'unknown'; return; }
    d.condition = over === 'top' ? 'spilled-top' : 'spilled-bottom'; d.spilledAt = t;
    if (over === 'top') d.spilledMg = Math.min(d.waterMg, Math.round((xHi - g.halfLengthM) * g.A * 1e9));
  };
  /** Decide at a cell's start, with this request's weather. */
  const decide = () => {
    let dsLo = 0, dsHi = 0;
    if (d.condition === 'ok' || d.condition === 'unknown') {
      if (pKnown && d.condition === 'ok') {
        const [xLo, xHi] = xBounds(d.s, Pa), cl = (x: number) => Math.max(-g.halfLengthM, Math.min(g.halfLengthM, x));
        dsLo = -d.leakK * cl(xHi); dsHi = -d.leakK * cl(xLo);
      } else { dsLo = -d.leakK * g.halfLengthM; dsHi = d.leakK * g.halfLengthM; } // the water anywhere in the tube
    }
    d.ctl = { tKnown, Ta: tKnown ? Ta : 0, dsLo, dsHi };
  };
  const commit = (t: number) => {
    if (t > d.s.tMs) d.s = at(t);
    if (!pKnown) { d.gapLoMinK = Math.min(d.gapLoMinK, d.s.bLo); d.gapHiMaxK = Math.max(d.gapHiMaxK, d.s.bHi); }
  };
  const nextCell = (t: number) => d.startMs + (Math.floor((t - d.startMs) / CELL_MS) + 1) * CELL_MS;
  const rollTo = (t: number, inclusive: boolean) => {
    for (let c = nextCell(d.s.tMs); inclusive ? c <= t : c < t; c = nextCell(c)) { commit(c); check(c); decide(); }
  };
  const read = (t: number) => {
    if (!pKnown || d.condition === 'unknown') { unreadable++; return; }
    if (d.condition !== 'ok') { obs(t, { text: (t === d.spilledAt ? SPILL_NOW : SPILLED)[d.condition === 'spilled-top' ? 'top' : 'bottom'] }); return; }
    const s = at(t), [xLo, xHi] = xBounds(s, Pa), certain = s.bLo === s.bHi && s.sLo === s.sHi;
    if (xHi > g.halfLengthM || xLo < -g.halfLengthM) { if (certain) obs(t, { text: SPILL_NOW[xHi > g.halfLengthM ? 'top' : 'bottom'] }); else unreadable++; return; }
    const mLo = Math.round(xLo / g.markM), mHi = Math.round(xHi / g.markM);
    if (mLo === mHi) obs(t, { value: mHi, unit: 'mark', precision: 1 }); else unreadable++;
  };

  if (req.state === null) decide();
  else {
    if (pKnown && d.lastPaAt < req.interval.from && d.condition === 'ok') {
      // the pressure comes back after a gap: could the water have passed an end while nobody knew the pressure?
      const T = (req.interval.from - d.lastPaAt) / 3_600_000, R = pv('pressureRateMaxHPaPerH'), P1 = d.lastPaPa / 100, P2 = Pa / 100;
      if (R * T < Math.abs(P1 - P2)) d.condition = 'unknown';
      else {
        const pMin = Math.max(800, (P1 + P2 - R * T) / 2) * 100, pMax = Math.min(1100, (P1 + P2 + R * T) / 2) * 100;
        if (rise(g, d.s.sHi, pMin, d.gapHiMaxK) > g.halfLengthM || rise(g, d.s.sLo, pMax, d.gapLoMinK) < -g.halfLengthM) d.condition = 'unknown';
      }
    }
    if (!pKnown && d.lastPaAt === req.interval.from) { d.gapLoMinK = d.s.bLo; d.gapHiMaxK = d.s.bHi; }
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
