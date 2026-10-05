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
// evaporating from the open leg, capillarity, wind on the open leg, the tube's own expansion.

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { pv } from '../params';
import { allFinite, checkCommon, contractExtras, failed, finite, isInt, subStepEnd } from './common';

export const BAROMETER_PROCESS = { processId: 'm02x_air_barometer_test', processVersion: '0.1.0' } as const;
const SCHEMA = 'civ-sci.air-barometer/1';
const EVAL = 'air-barometer-eval/0.1.0';
const GAUGE = 'fixture_air_barometer';
const STEP_MS = 30_000; // the bulb's temperature advances on the run's 30 s grid: 30 s-aligned chunks give identical states

interface GaugeData {
  eqId: string; paramsFp: string; startMs: number; lastTo: number;
  /** Pa0 · V0 / T0 of the air sealed in (Pa·m³/K): the amount of trapped air */
  sealed: number;
  bulbK: number;            // the bulb's temperature at lastTo
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

const envOk = (req: ScienceStepRequest) => {
  const e = req.environment;
  return (e.source === 'live' || e.source === 'simulation') && finite(e.airTempC, -60, 70) && finite(e.pressureHPa, 800, 1100);
};

export function barometerStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, BAROMETER_PROCESS.processId, BAROMETER_PROCESS.processVersion, SCHEMA);
  if (bad) return failed(req, EVAL, bad, SCHEMA);
  if (req.lots.length) return failed(req, EVAL, 'the test barometer takes no material lots', SCHEMA);
  if (req.energy.length) return failed(req, EVAL, 'the barometer uses no energy: offer none', SCHEMA);
  const eq = req.equipment.find((e) => e.kind === GAUGE);
  if (!eq && req.stop !== 'equipment-lost') return failed(req, EVAL, `no ${GAUGE}`, SCHEMA);
  const params = eq?.params ?? {};
  const fp = JSON.stringify(Object.entries(params).sort(([x], [y]) => x.localeCompare(y)));
  const known = envOk(req);

  let d: GaugeData;
  if (req.state === null) {
    if (!eq) return failed(req, EVAL, 'the gauge was lost before it was set: nothing happened', SCHEMA);
    const g = geometry(params);
    if (typeof g === 'string') return failed(req, EVAL, g, SCHEMA);
    if (!known) return failed(req, EVAL, 'the gauge is set only with known weather (air temperature and pressure)', SCHEMA);
    const T0 = req.environment.airTempC! + 273.15;
    d = { eqId: eq.equipmentId, paramsFp: fp, startMs: req.interval.from, lastTo: req.interval.from,
      sealed: (req.environment.pressureHPa! * 100 * g.V0) / T0, bulbK: T0, historyComplete: true };
  } else {
    d = structuredClone(req.state.data as GaugeData);
    if (req.interval.from !== d.lastTo) return failed(req, EVAL, `noncontiguous-interval: expected from=${d.lastTo}`, SCHEMA);
    if (eq && (eq.equipmentId !== d.eqId || fp !== d.paramsFp)) return failed(req, EVAL, 'changed-input: the gauge changed under a running run', SCHEMA);
  }
  for (const a of req.actions) {
    if (a.action !== 'read_gauge') return failed(req, EVAL, `unknown action ${a.action} (only read_gauge)`, SCHEMA);
    if (!(isInt(a.at) && a.at >= req.interval.from && a.at < req.interval.to)) return failed(req, EVAL, 'read_gauge must fall inside the interval', SCHEMA);
  }

  const g = eq ? geometry(params) : null;
  const observations: Observation[] = [];
  const diagnostics: Record<string, unknown> = {};
  if (known && g && typeof g !== 'string' && req.stop !== 'equipment-lost') {
    const Ta = req.environment.airTempC! + 273.15, Pa = req.environment.pressureHPa! * 100;
    const reads = [...req.actions].sort((x, y) => x.at - y.at);
    let t = d.lastTo, k = 0;
    const readUntil = (end: number) => { // readings strictly before `end`, from the bulb's temperature at t
      for (; k < reads.length && reads[k].at < end; k++) {
        const a = reads[k], x = rise(g, d.sealed, Pa, Ta + (d.bulbK - Ta) * Math.exp(-(a.at - t) / 1000 / g.tauS));
      if (Math.abs(x) > g.halfLengthM) {
        observations.push({ at: a.at, channel: `instrument:${d.eqId}`, quantity: 'level',
          text: x > 0 ? '水が開いた管の口まで上がっていて、目盛りの外' : '水が開いた管の底まで下がっていて、目盛りの外' });
      } else {
        observations.push({ at: a.at, channel: `instrument:${d.eqId}`, quantity: 'level', value: Math.round(x / g.markM), unit: 'mark', precision: 1 });
      }
      }
    };
    while (t < req.interval.to) {
      const tEnd = subStepEnd(t, d.startMs, STEP_MS, req.interval.to);
      readUntil(tEnd);
      d.bulbK = Ta + (d.bulbK - Ta) * Math.exp(-(tEnd - t) / 1000 / g.tauS);
      t = tEnd;
    }
    readUntil(Infinity);
    diagnostics.riseMm = rise(g, d.sealed, Pa, d.bulbK) * 1000;
    diagnostics.bulbC = d.bulbK - 273.15;
  } else if (!known) {
    // weather unknown: nothing is computed and nothing invented; readings in this interval are not given
    d.historyComplete = false;
    diagnostics.skipped = `environment ${req.environment.source}: no readings in this interval`;
    if (req.actions.length) diagnostics.unreadable = req.actions.length;
  }
  d.lastTo = req.interval.to;
  if (!allFinite(d)) return failed(req, EVAL, 'non-finite state: refusing to return it', SCHEMA);
  const ending = req.stop === 'operator' || req.stop === 'equipment-lost';
  return {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.to },
    state: { schema: SCHEMA, data: d }, status: ending ? 'stopped' : 'running',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: [],
      notes: '理想気体と水の柱の釣り合い（教科書の関係、出典本文は未照合）。器の温度の追従（時定数）は仮定。漏れ・蒸発・毛管現象は扱わない' },
    diagnostics: { ...diagnostics, historyComplete: d.historyComplete },
  };
}
