/** Isolated, uncalibrated bookkeeping model. Not registered with the production runner.
 * The host certifies attendance/work intervals and owns reservations/transactions.
 * Neither soak history, wall time nor AI text determines output quantities.
 */
export const MANUAL_HUSK_SCHEMA = 'prototype-manual-husk-separation/1';
export interface WetUnseparatedHusk {
  materialId: 'wet_unseparated_coconut_husk';
  lotId: string;
  separation: 'never-separated';
  dryMg: number;
  waterMg: number;
  soakHistory: { recordId: string; runId: string; fromWorldMs: number; toWorldMs: number }[];
}
export interface SeparationKnot {
  workMs: number;
  fiberDryMg: number;
  attachedPithDryMg: number;
  fiberWaterMg: number;
  attachedPithWaterMg: number;
  dischargedWaterMg: number;
}
export interface ManualSeparationTestProfile {
  kind: 'uncalibrated-test-profile';
  profileId: string;
  knots: SeparationKnot[];
}
export interface SeparationContext {
  worldId: string;
  worldEpoch: string;
  runId: string;
  openedAtWorldMs: number;
}
export interface ConfirmedManualInterval {
  kind: 'host-confirmed-manual-work';
  confirmationId: string;
  worldId: string;
  worldEpoch: string;
  runId: string;
  actorId: string;
  attendance: 'present';
  operation: 'separate-wet-husk';
  fromWorldMs: number;
  toWorldMs: number;
  confirmedAtWorldMs: number;
}
export interface SeparationPools {
  fiber: { dryMg: number; waterMg: number };
  attachedPith: { dryMg: number; waterMg: number };
  residualHusk: { dryMg: number; waterMg: number };
  dischargedWaterMg: number;
}
export interface ManualSeparationState {
  schema: typeof MANUAL_HUSK_SCHEMA;
  binding: string;
  confirmedIntervals: ConfirmedManualInterval[];
  totalWorkMs: number;
  lastToWorldMs: number;
  pools: SeparationPools;
}
const massKeys = ['fiberDryMg','attachedPithDryMg','fiberWaterMg','attachedPithWaterMg','dischargedWaterMg'] as const;
const contextKeys = ['worldId','worldEpoch','runId','openedAtWorldMs'];
const intervalKeys = ['kind','confirmationId','worldId','worldEpoch','runId','actorId','attendance','operation','fromWorldMs','toWorldMs','confirmedAtWorldMs'];
const stateKeys = ['schema','binding','confirmedIntervals','totalWorkMs','lastToWorldMs','pools'];
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`manual husk: ${message}`); }
const integer = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const id = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function shape(v: unknown, keys: readonly string[]): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
}
function canonical(v: any): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const sum = (...values: number[]) => {
  const n = values.reduce((s,v)=>s+BigInt(v),0n);
  requireThat(n <= BigInt(Number.MAX_SAFE_INTEGER), 'integer overflow');
  return Number(n);
};

/** All inputs/profile quantities are explicit fixture facts, not defaults or calibration.
 * Recreate with the authoritative original input/profile/context before restoring a save.
 */
export function createManualHuskSeparation(input: WetUnseparatedHusk, profile: ManualSeparationTestProfile, context: SeparationContext) {
  requireThat(shape(context,contextKeys) && id(context.worldId) && id(context.worldEpoch) && id(context.runId)
    && integer(context.openedAtWorldMs), 'invalid context');
  requireThat(shape(input,['materialId','lotId','separation','dryMg','waterMg','soakHistory'])
    && input.materialId === 'wet_unseparated_coconut_husk' && input.separation === 'never-separated'
    && id(input.lotId) && integer(input.dryMg,1) && integer(input.waterMg,1) && Array.isArray(input.soakHistory), 'requires wet unseparated husk with explicit composition');
  sum(input.dryMg,input.waterMg);
  const historyIds = new Set<string>();
  for (const r of input.soakHistory) {
    requireThat(shape(r,['recordId','runId','fromWorldMs','toWorldMs']) && id(r.recordId) && id(r.runId)
      && integer(r.fromWorldMs) && integer(r.toWorldMs) && r.fromWorldMs <= r.toWorldMs
      && r.toWorldMs <= context.openedAtWorldMs && !historyIds.has(r.recordId), 'invalid soak provenance');
    historyIds.add(r.recordId);
  }
  requireThat(shape(profile,['kind','profileId','knots']) && profile.kind === 'uncalibrated-test-profile'
    && id(profile.profileId) && Array.isArray(profile.knots) && profile.knots.length >= 2, 'explicit test profile required');
  let previous: SeparationKnot | undefined;
  for (const k of profile.knots) {
    requireThat(shape(k,['workMs',...massKeys]) && integer(k.workMs) && massKeys.every(key=>integer(k[key])), 'invalid profile knot');
    requireThat(previous ? k.workMs > previous.workMs && massKeys.every(key=>k[key]>=previous![key])
      : k.workMs === 0 && massKeys.every(key=>k[key]===0), 'profile must start at zero and be cumulative monotone');
    requireThat(sum(k.fiberDryMg,k.attachedPithDryMg) <= input.dryMg
      && sum(k.fiberWaterMg,k.attachedPithWaterMg,k.dischargedWaterMg) <= input.waterMg, 'profile exceeds input inventory');
    // Water and pith cannot be assigned to a nonexistent separated fibre bundle.
    requireThat(k.fiberDryMg > 0 || k.attachedPithDryMg+k.fiberWaterMg+k.attachedPithWaterMg === 0, 'profile creates bundle without fiber');
    requireThat(k.attachedPithDryMg > 0 || k.attachedPithWaterMg === 0, 'profile creates wet pith without dry pith');
    previous = k;
  }
  const h = structuredClone(input), p = structuredClone(profile), c = structuredClone(context);
  const binding = canonical([MANUAL_HUSK_SCHEMA,c,h,p]);
  const horizon = p.knots.at(-1)!.workMs;
  function poolsAt(workMs: number): SeparationPools {
    const t = Math.min(workMs,horizon);
    const upper = p.knots.findIndex(k=>k.workMs >= t);
    const b = p.knots[upper], a = p.knots[Math.max(0,upper-1)];
    const values = Object.fromEntries(massKeys.map(key=>[key,a === b ? a[key]
      : a[key]+Number(BigInt(b[key]-a[key])*BigInt(t-a.workMs)/BigInt(b.workMs-a.workMs))])) as Record<typeof massKeys[number],number>;
    // Independent floors may temporarily allocate pith/water before the first whole mg
    // of fibre. Keep those fractions in the residual until their dry carrier exists.
    if (!values.fiberDryMg) values.attachedPithDryMg=values.fiberWaterMg=values.attachedPithWaterMg=0;
    if (!values.attachedPithDryMg) values.attachedPithWaterMg=0;
    return {fiber:{dryMg:values.fiberDryMg,waterMg:values.fiberWaterMg},
      attachedPith:{dryMg:values.attachedPithDryMg,waterMg:values.attachedPithWaterMg},
      residualHusk:{dryMg:h.dryMg-values.fiberDryMg-values.attachedPithDryMg,
        waterMg:h.waterMg-values.fiberWaterMg-values.attachedPithWaterMg-values.dischargedWaterMg},
      dischargedWaterMg:values.dischargedWaterMg};
  }
  function interval(v: unknown): asserts v is ConfirmedManualInterval {
    requireThat(shape(v,intervalKeys) && v.kind === 'host-confirmed-manual-work' && id(v.confirmationId) && id(v.actorId)
      && v.worldId === c.worldId && v.worldEpoch === c.worldEpoch && v.runId === c.runId
      && v.attendance === 'present' && v.operation === 'separate-wet-husk'
      && integer(v.fromWorldMs) && integer(v.toWorldMs) && integer(v.confirmedAtWorldMs)
      && v.fromWorldMs >= c.openedAtWorldMs && v.toWorldMs > v.fromWorldMs
      && v.confirmedAtWorldMs >= v.toWorldMs, 'requires a completed host-confirmed present-work interval');
  }
  function rebuild(records: unknown): ManualSeparationState {
    requireThat(Array.isArray(records),'invalid interval history');
    let workMs=0, lastTo=c.openedAtWorldMs;
    const seen = new Set<string>();
    for (const r of records) {
      interval(r);
      requireThat(!seen.has(r.confirmationId) && r.fromWorldMs >= lastTo, 'duplicate or overlapping saved work');
      workMs=sum(workMs,r.toWorldMs-r.fromWorldMs);lastTo=r.toWorldMs;seen.add(r.confirmationId);
    }
    return {schema:MANUAL_HUSK_SCHEMA,binding,confirmedIntervals:structuredClone(records),totalWorkMs:workMs,lastToWorldMs:lastTo,pools:poolsAt(workMs)};
  }
  function restore(value: unknown): ManualSeparationState {
    requireThat(shape(value,stateKeys) && value.schema === MANUAL_HUSK_SCHEMA && value.binding === binding, 'incompatible save binding/schema');
    const expected = rebuild(value.confirmedIntervals);
    requireThat(canonical(value) === canonical(expected), 'corrupt saved work or material accounting');
    return expected;
  }
  return Object.freeze({
    start: (): ManualSeparationState => rebuild([]),
    restore,
    commit(state: ManualSeparationState, confirmed: ConfirmedManualInterval): ManualSeparationState {
      const s=restore(state);interval(confirmed);
      const prior=s.confirmedIntervals.find(r=>r.confirmationId === confirmed.confirmationId);
      if (prior) {requireThat(canonical(prior) === canonical(confirmed), 'conflicting replay');return s;}
      return rebuild([...s.confirmedIntervals,confirmed]);
    },
    project(state: ManualSeparationState) {
      const s=restore(state);
      return {calibration:'uncalibrated-test-profile' as const, profileId:p.profileId,
        status:s.totalWorkMs>=horizon?'profile-exhausted' as const:'partial-or-unworked' as const,
        totalWorkMs:s.totalWorkMs,pools:structuredClone(s.pools),soakHistory:structuredClone(h.soakHistory)};
    },
  });
}
