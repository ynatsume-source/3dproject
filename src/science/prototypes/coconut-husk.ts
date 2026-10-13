// Isolated bookkeeping experiment. No production registration or calibrated kinetics.
import type { LotView, ScienceStep, ScienceStepResult } from '../../world/science-contract';
import { checkCommon, failed, fingerprint, isInt } from '../step/common';

export const HUSK_PROTOTYPE = 'prototype_coconut_husk_soak';
export const HUSK_SCHEMA = 'prototype-coconut-husk/1';
export interface HuskAssumptions {
  eligibleMs: number;
  minTempC: number;
  maxTempC: number;
  fiberPpm: number;
  minWaterPpm: number;
  // Capacity proxy, not measured bulk density or a production vessel specification.
  capacityMg: number;
  waterPolicy: 'unclassified-test-water';
  recovery: 'unmodelled-fixture-separation';
  loss: 'return-husk-spill-water';
}
interface State {
  binding: string;
  equipmentId: string;
  origin: number;
  lastTo: number;
  eligible: number;
  completeHistory: boolean;
  terminal: boolean;
  cell: { start: number; known: boolean; eligible: boolean } | null;
}
const fraction = (n: number, ppm: number) => Number(BigInt(n) * BigInt(ppm) / 1_000_000n);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Local downstream-reader contract; does not make these materials executable in production. */
export function readHuskPrototypeLot(lot: LotView): { waterMg: number; dryMg: number } | null {
  if (!['coconut_husk', 'process_water', 'plant_fiber', 'pith'].includes(lot.materialId)
    || lot.amount.unit !== 'mg' || !isInt(lot.amount.value, 1)) return null;
  const q = lot.quality ?? {};
  if (Object.values(q).some(v => !Number.isFinite(v))) return null;
  if (q.history_complete !== undefined && q.history_complete !== 0 && q.history_complete !== 1) return null;
  if (q.prototype_eligible_ms !== undefined && !isInt(q.prototype_eligible_ms)) return null;
  const ppm = q.water_ppm;
  if (ppm !== undefined && (!isInt(ppm) || ppm > 1_000_000)) return null;
  const water = q.prototype_water_mg ?? (lot.materialId === 'process_water' ? lot.amount.value
    : isInt(ppm) && ppm <= 1_000_000 ? fraction(lot.amount.value, ppm) : NaN);
  if (!isInt(water) || water > lot.amount.value) return null;
  if (q.prototype_water_mg !== undefined && ppm !== undefined
    && ppm !== Number(BigInt(water) * 1_000_000n / BigInt(lot.amount.value))) return null;
  if (lot.materialId === 'process_water' && water !== lot.amount.value) return null;
  return { waterMg: water, dryMg: lot.amount.value - water };
}

function validState(v: unknown, binding: string, from: number, limit: number): v is State {
  if (!object(v) || v.binding !== binding || !isInt(v.origin) || !isInt(v.lastTo)
    || typeof v.equipmentId !== 'string' || !v.equipmentId
    || v.lastTo !== from || v.origin > from || !isInt(v.eligible) || v.eligible > limit || v.eligible > from - v.origin
    || typeof v.completeHistory !== 'boolean' || v.terminal !== false) return false;
  const c = v.cell;
  if (c === null) return from === v.origin;
  return object(c) && isInt(c.start) && c.start >= v.origin && (c.start - v.origin) % 30_000 === 0
    && c.start <= from && from - c.start <= 30_000
    && typeof c.known === 'boolean' && typeof c.eligible === 'boolean' && (!c.eligible || c.known);
}

export function createHuskPrototype(assumptions: HuskAssumptions): ScienceStep {
  const a = { ...assumptions };
  return req => {
    const reject = (why: string) => failed(req, HUSK_PROTOTYPE, why, HUSK_SCHEMA);
    if (!isInt(a.eligibleMs, 1) || !isInt(a.fiberPpm) || a.fiberPpm > 1_000_000
      || !isInt(a.minWaterPpm) || !isInt(a.capacityMg, 1)
      || !Number.isFinite(a.minTempC) || !Number.isFinite(a.maxTempC) || a.minTempC > a.maxTempC
      || a.waterPolicy !== 'unclassified-test-water' || a.recovery !== 'unmodelled-fixture-separation'
      || a.loss !== 'return-husk-spill-water') return reject('invalid explicit fixture assumptions');
    const problem = checkCommon(req, HUSK_PROTOTYPE, '0.0.1', HUSK_SCHEMA, /^0\.2\.1$/);
    if (problem) return reject(problem);
    const { from, to } = req.interval;
    if (to - from > 86_400_000 || to > Number.MAX_SAFE_INTEGER - 30_000) return reject('interval exceeds fixture guard');
    if (req.actions.some(x => !['look', 'recover_fixture'].includes(x.action) || x.at < from || x.at >= to)) return reject('invalid fixture action');
    const husk = req.lots.find(l => l.materialId === 'coconut_husk');
    const water = req.lots.find(l => l.materialId === 'process_water');
    if (req.lots.length !== 2 || !husk || !water || husk.lotId === water.lotId) return reject('reserve one husk and one test-water lot');
    const h = readHuskPrototypeLot(husk), w = readHuskPrototypeLot(water);
    if (!h || !w) return reject('invalid input composition');
    const total = husk.amount.value + water.amount.value;
    if (!isInt(total) || total > a.capacityMg || BigInt(water.amount.value) * 1_000_000n < BigInt(husk.amount.value) * BigInt(a.minWaterPpm)) return reject('fixture capacity or water ratio');
    const lost = req.stop === 'equipment-lost';
    if (!lost && (req.equipment.length !== 1 || req.equipment[0].kind !== 'fixture_coir_basin'
      || req.equipment[0].condition <= 0 || req.equipment[0].params?.capacityMg !== a.capacityMg)) return reject('missing fixture basin');
    // Equipment may disappear only on the explicit loss boundary. The material reservation remains authoritative.
    const binding = JSON.stringify([req.world.worldId, req.world.worldEpoch, req.runId, a,
      req.lots.map(fingerprint).sort()]);
    let s: State;
    if (req.state) {
      if (!validState(req.state.data, binding, from, a.eligibleMs)) return reject('corrupt or incompatible nested state');
      if (!lost && req.equipment[0].equipmentId !== req.state.data.equipmentId) return reject('changed reserved equipment');
      s = structuredClone(req.state.data);
    } else {
      if (lost) return reject('cannot start without basin');
      // Only saved states resume progress. Returned lots keep provenance, but do not transfer
      // time earned under potentially different fixture assumptions to a new run.
      s = { binding, equipmentId: req.equipment[0].equipmentId, origin: from, lastTo: from, eligible: 0,
        completeHistory: husk.quality?.history_complete !== 0 && water.quality?.history_complete !== 0, terminal: false, cell: null };
    }
    const recovery = req.stop ? undefined : req.actions.filter(x => x.action === 'recover_fixture').sort((x,y) => x.at-y.at)[0];
    const end = recovery?.at ?? to;
    for (let t = from; t < end;) {
      const start = s.origin + Math.floor((t - s.origin) / 30_000) * 30_000;
      if (!s.cell || s.cell.start !== start) {
        const e = req.environment;
        const known = ['live', 'simulation', 'record'].includes(e.source) && Number.isFinite(e.airTempC)
          && isInt(e.effectiveAt) && e.effectiveAt <= start;
        s.cell = { start, known, eligible: known && e.airTempC! >= a.minTempC && e.airTempC! <= a.maxTempC };
      }
      const next = Math.min(end, start + 30_000);
      if (!s.cell.known) s.completeHistory = false;
      if (s.cell.eligible) s.eligible = Math.min(a.eligibleMs, s.eligible + next - t);
      t = next;
    }
    s.lastTo = end;
    s.terminal = !!recovery || req.stop === 'operator' || lost;
    const result: ScienceStepResult = {
      contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from, to: end },
      state: { schema: HUSK_SCHEMA, data: s }, status: s.terminal ? recovery ? 'completed' : 'stopped' : 'running',
      consumed: [], produced: [], released: [], drawn: [], energy: [], equipmentWear: [],
      observations: req.actions.filter(x => x.action === 'look' && x.at < end).map(x => ({ at: x.at, channel: 'sight', text: '殻が水に浸かっている。' })),
      evidence: { evaluatorVersion: 'prototype/0.0.1', sourceRefs: [], notes: 'Uncalibrated fixture assumptions; not a retting or pounding model.' },
      diagnostics: { eligibleMs: s.eligible, historyComplete: s.completeHistory },
    };
    if (!s.terminal) return result;
    result.consumed = req.lots.map(l => ({ lotId: l.lotId, amount: { ...l.amount } }));
    const produce = (materialId: string, mass: number, waterMg: number, extra: Record<string, number> = {}) => {
      if (mass) result.produced.push({ materialId, amount: { value: mass, unit: 'mg' }, quality: {
        prototype_water_mg: waterMg, water_ppm: Number(BigInt(waterMg)*1_000_000n/BigInt(mass)),
        history_complete: Number(s.completeHistory), ...extra,
      } });
    };
    if (recovery && s.eligible === a.eligibleMs) {
      // Split wet solids in the same ratio: no unaccounted drying, uptake, decay or dissolved solids.
      const dryFiber = fraction(h.dryMg, a.fiberPpm), wetFiber = fraction(h.waterMg, a.fiberPpm);
      produce('plant_fiber', dryFiber + wetFiber, wetFiber);
      produce('pith', husk.amount.value - dryFiber - wetFiber, h.waterMg - wetFiber);
    } else produce('coconut_husk', husk.amount.value, h.waterMg, { prototype_eligible_ms: s.eligible });
    if (lost) result.released.push({ materialId: 'process_water', amount: { ...water.amount }, to: 'ground' });
    else produce('process_water', water.amount.value, w.waterMg);
    return result;
  };
}
