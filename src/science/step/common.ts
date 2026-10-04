// Small helpers shared by ScienceStep implementations. Pure: no clock, randomness or I/O.

import type { LotView, ScienceStepRequest, ScienceStepResult, ScienceState } from '../../world/science-contract';
import { SPECIES, totalMg, type Composition, type SpeciesId } from '../chem';

export const SCIENCE_CATALOG_VERSION = 'civ-sci-test-2';

export const isInt = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;

export const fingerprint = (lot: LotView) => JSON.stringify([lot.lotId, lot.materialId, lot.amount, lot.location,
  Object.entries(lot.quality ?? {}).sort(([a], [b]) => a.localeCompare(b))]);

/** A 0.2.x request (proposed contract): every answer, refusals included, carries `drawn` (empty when nothing). */
export const isV02 = (req: ScienceStepRequest) => /^0\.2\.\d+$/.test(req.contract);
/** The fields a result needs for the request's contract version beyond 0.1.0. */
export const contractExtras = (req: ScienceStepRequest) => (isV02(req) ? { drawn: [] as never[] } : {});

export function failed(req: ScienceStepRequest, evaluator: string, why: string, schema: string): ScienceStepResult {
  return {
    ...contractExtras(req),
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.from },
    state: req.state ?? ({ schema, data: null } as ScienceState),
    status: 'failed', consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: evaluator, sourceRefs: [], notes: why }, diagnostics: { error: why },
  };
}

/** An older schema of the same state is refused with an explicit reason (no migration for test-only states). */
export function stateSchemaProblem(req: ScienceStepRequest, schema: string): string | null {
  if (!req.state || req.state.schema === schema) return null;
  const [base, ver] = schema.split('/'), [sBase, sVer] = String(req.state.schema).split('/');
  if (base === sBase && Number(sVer) < Number(ver)) {
    return `unsupported-state-schema: ${req.state.schema} is an older test state and is not migrated (current ${schema}). `
      + 'Cancel the run and release its reservation: lots settle only when a run ends, so nothing was consumed yet.';
  }
  return `unknown state schema ${req.state.schema}`;
}

/** Common request checks: contract (0.1.x or the proposed 0.2.x, unless a step needs only 0.2.x), process id/version, catalog, state
 *  schema, integer interval and seed. */
export function checkCommon(req: ScienceStepRequest, processId: string, processVersion: string, schema: string,
  contract: RegExp = /^0\.[12]\.\d+$/): string | null {
  if (!contract.test(req.contract)) return `unknown contract ${req.contract}`;
  if (req.processId !== processId) return `unknown process ${req.processId}`;
  if (req.processVersion !== processVersion) return `unknown processVersion ${req.processVersion}`;
  if (req.catalogVersion !== SCIENCE_CATALOG_VERSION) return `unknown catalogVersion ${req.catalogVersion}`;
  const sp = stateSchemaProblem(req, schema);
  if (sp) return sp;
  if (!isInt(req.interval.from) || !isInt(req.interval.to) || req.interval.to < req.interval.from) return 'invalid interval';
  if (!isInt(req.seed)) return 'invalid seed';
  if (req.energy.some((e) => /battery|robot/i.test(e.sourceId))) return 'robot battery is not an energy source (legacy / sealed_bootstrap)';
  if (req.energy.some((e) => !isInt(e.maxJ))) return 'energy offers must be non-negative integer J';
  for (const a of req.actions) if (!isInt(a.at) || Object.values(a.params ?? {}).some((v) => !Number.isFinite(v))) return 'invalid operator action';
  for (const e of req.equipment) if (!finite(e.condition, 0, 1) || Object.values(e.params ?? {}).some((v) => !Number.isFinite(v))) return `equipment ${e.equipmentId} has non-finite values`;
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
    if (!Object.hasOwn(SPECIES, sp)) throw new Error(`unknown species in quality: ${sp}`);
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
 * Same, rounding down. Used for energy drawn from an offer: if this interval's float use is ≤ its integer maxJ,
 * floor(prev + use) − floor(prev) ≤ maxJ, so the integer report never exceeds the offer of the interval.
 */
export function intDeltaFloor(cumFloat: number, reported: number): { delta: number; reported: number } {
  const r = Math.floor(cumFloat + 1e-9);
  return { delta: r - reported, reported: r };
}

/**
 * The integration sub-step: up to the next point of the fixed grid (origin + k·step), but never past `until`.
 * Each request integrates exactly to the end of its own interval, using only that interval's offer and
 * environment; requests whose boundaries lie on the grid give identical results, others agree within the
 * discretisation tolerance.
 */
export function subStepEnd(t: number, origin: number, stepMs: number, until: number): number {
  const next = origin + (Math.floor((t - origin) / stepMs) + 1) * stepMs;
  return Math.min(next, until);
}

/**
 * The power an offer can deliver: maxJ is spread evenly over the request's interval (W = maxJ / seconds).
 * A long request therefore cannot spend its whole budget early; any split of the same supply behaves the same.
 */
export function offerPowerW(req: ScienceStepRequest, maxJ: number): number {
  const s = (req.interval.to - req.interval.from) / 1000;
  return s > 0 ? maxJ / s : 0;
}

/** Finite-number check of a parameter. */
export function finite(v: unknown, min = -Infinity, max = Infinity): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** True if every number anywhere in the value is finite (used before returning a state). */
export function allFinite(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(allFinite);
  if (x && typeof x === 'object') return Object.values(x).every(allFinite);
  return true;
}

/** Environment values that a step may integrate with: known source, finite and physically plausible. */
export function envUsable(req: ScienceStepRequest): boolean {
  const e = req.environment;
  if (e.source !== 'live' && e.source !== 'simulation') return false;
  if (!finite(e.airTempC, -60, 70)) return false;
  if (e.humidity !== undefined && !finite(e.humidity, 0, 1)) return false;
  if (e.windMs !== undefined && !finite(e.windMs, 0, 80)) return false;
  return true;
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
    if (!Object.hasOwn(SPECIES, sp) || sp === 'water') throw new Error(`invalid dry-basis species in quality: ${sp}`);
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
