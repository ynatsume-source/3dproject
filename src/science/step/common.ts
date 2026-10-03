// Small helpers shared by ScienceStep implementations. Pure: no clock, randomness or I/O.

import type { LotView, ScienceStepRequest, ScienceStepResult, ScienceState } from '../../world/science-contract';
import { SPECIES, totalMg, type Composition, type SpeciesId } from '../chem';

export const SCIENCE_CATALOG_VERSION = 'civ-sci-test-1';

export const isInt = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;

export const fingerprint = (lot: LotView) => JSON.stringify([lot.lotId, lot.materialId, lot.amount, lot.location,
  Object.entries(lot.quality ?? {}).sort(([a], [b]) => a.localeCompare(b))]);

export function failed(req: ScienceStepRequest, evaluator: string, why: string, schema: string): ScienceStepResult {
  return {
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.from },
    state: req.state ?? ({ schema, data: null } as ScienceState),
    status: 'failed', consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: evaluator, sourceRefs: [], notes: why }, diagnostics: { error: why },
  };
}

/** Common request checks: contract 0.1.x, process id/version, catalog, state schema, integer interval and seed. */
export function checkCommon(req: ScienceStepRequest, processId: string, processVersion: string, schema: string): string | null {
  if (!/^0\.1\.\d+$/.test(req.contract)) return `unknown contract ${req.contract}`;
  if (req.processId !== processId) return `unknown process ${req.processId}`;
  if (req.processVersion !== processVersion) return `unknown processVersion ${req.processVersion}`;
  if (req.catalogVersion !== SCIENCE_CATALOG_VERSION) return `unknown catalogVersion ${req.catalogVersion}`;
  if (req.state && req.state.schema !== schema) return `unknown state schema ${req.state.schema}`;
  if (!isInt(req.interval.from) || !isInt(req.interval.to) || req.interval.to < req.interval.from) return 'invalid interval';
  if (!isInt(req.seed)) return 'invalid seed';
  if (req.energy.some((e) => /battery|robot/i.test(e.sourceId))) return 'robot battery is not an energy source (legacy / sealed_bootstrap)';
  for (const l of req.lots) {
    if (l.amount.unit !== 'mg' || !isInt(l.amount.value, 1)) return `lot ${l.lotId} must be a positive integer of mg`;
    if (Object.values(l.quality ?? {}).some((v) => !Number.isFinite(v))) return `lot ${l.lotId} has a non-finite quality value`;
  }
  return null;
}

/**
 * Lot composition ↔ quality. A lot of a mixture carries mass fractions as integer ppm under keys
 * `x_<species>_ppm`; whatever is not listed is `inert_mineral` (balanced by mass only).
 */
export function lotComp(lot: LotView): Composition {
  const amount = lot.amount.value;
  const comp: Composition = {};
  let listed = 0;
  for (const [k, v] of Object.entries(lot.quality ?? {})) {
    const m = /^x_(.+)_ppm$/.exec(k);
    if (!m) continue;
    const sp = m[1] as SpeciesId;
    if (!(sp in SPECIES)) throw new Error(`unknown species in quality: ${sp}`);
    const mg = Math.round((amount * v) / 1e6);
    if (mg > 0) { comp[sp] = (comp[sp] ?? 0) + mg; listed += mg; }
  }
  if (listed > amount) throw new Error(`lot ${lot.lotId}: listed fractions exceed the amount`);
  if (amount - listed > 0) comp.inert_mineral = (comp.inert_mineral ?? 0) + amount - listed;
  return comp;
}

export function compQuality(c: Composition): Record<string, number> {
  const t = totalMg(c);
  const q: Record<string, number> = {};
  for (const [k, mg] of Object.entries(c)) if (mg && k !== 'inert_mineral') q[`x_${k}_ppm`] = Math.round((mg * 1e6) / t);
  return q;
}

/** Report an integer for this interval from a float cumulative total: round(cum) − already reported. */
export function intDelta(cumFloat: number, reported: number): { delta: number; reported: number } {
  const r = Math.round(cumFloat);
  return { delta: r - reported, reported: r };
}

/**
 * Test tiles carry their solids as DRY-basis fractions `xd_<species>_ppm` (so drying, which only removes
 * water, leaves them unchanged) and their water as `water_ppm` of the whole lot.
 */
export function tileComp(lot: LotView): Composition {
  const amount = lot.amount.value;
  const q = lot.quality ?? {};
  const water = Math.round((amount * (q.water_ppm ?? 0)) / 1e6);
  const dry = amount - water;
  const comp: Composition = water > 0 ? { water } : {};
  let listed = 0;
  for (const [k, v] of Object.entries(q)) {
    const m = /^xd_(.+)_ppm$/.exec(k);
    if (!m) continue;
    const sp = m[1] as SpeciesId;
    if (!(sp in SPECIES) || sp === 'water') throw new Error(`invalid dry-basis species in quality: ${sp}`);
    const mg = Math.round((dry * v) / 1e6);
    if (mg > 0) { comp[sp] = (comp[sp] ?? 0) + mg; listed += mg; }
  }
  if (listed > dry) throw new Error(`lot ${lot.lotId}: dry-basis fractions exceed the dry mass`);
  if (dry - listed > 0) comp.inert_mineral = (comp.inert_mineral ?? 0) + dry - listed;
  return comp;
}

export function tileQuality(c: Composition): Record<string, number> {
  const t = totalMg(c), w = c.water ?? 0, dry = t - w;
  const q: Record<string, number> = { water_ppm: Math.round((w * 1e6) / t) };
  for (const [k, mg] of Object.entries(c)) if (mg && k !== 'water' && k !== 'inert_mineral') q[`xd_${k}_ppm`] = Math.round((mg * 1e6) / dry);
  return q;
}
