import {
  INTEGER_HALF_LIFE_POLICY_ID,
  integerDecayStrength
} from './integer-half-life';
import {
  COIR_CORD_ASSUMPTION_ID,
  COIR_CORD_RULES as R,
  cordAssert as check,
  cordInteger as integer,
  cordId as id,
  cordShape as shape,
  cordCanonical as canonical,
  cordSum as sum,
  cordMass,
  type CoirPiece,
} from './coir-cord-types';
export interface CordDamageContext {
  worldId: string;
  worldEpoch: string;
  runId: string;
  openedAtIslandMs: number;
  openedAtWorldMs: number
}
interface EventBase {
  eventId: string;
  worldId: string;
  worldEpoch: string;
  runId: string;
  atMs: number
}
export type CordDamageEvent =
| (EventBase & {
  kind: 'exposure';
  clock: 'island';
  fromIslandMs: number;
  toIslandMs: number;
  shade: boolean
})
| (EventBase & {
  kind: 'abrasion';
  clock: 'world';
  count: number
})
| (EventBase & {
  kind: 'load';
  clock: 'world';
  gf: number;
  breakAtMm?: number
});
interface DamageState<S extends string> {
  schema: S;
  binding: string;
  events: CordDamageEvent[]
}
export type CordDamageState = DamageState<'prototype-coir-cord-damage/1'>;
export type IntegerCordDamageState = DamageState<'prototype-coir-cord-damage/2'>;
const copy = (p: CoirPiece): CoirPiece => structuredClone(p);
function validatePiece(p: CoirPiece) {
  check(shape(p, ['lotId', 'material', 'lengthMm', 'fiberDryMg', 'pithDryMg', 'waterMg', 'baseStrengthGf', 'damage', ...(p?.inheritedWear !== undefined?['inheritedWear']: [])])
  && id(p.lotId) && ['coir_strand', 'coir_rope'].includes(p.material), 'invalid-piece');
  cordMass(p);
  check(integer(p.lengthMm, 1) && p.fiberDryMg>0 && integer(p.baseStrengthGf), 'invalid-piece-values');
  check(shape(p.damage, ['sunMs', 'shadeMs', 'abrasions']) && Object.values(p.damage).every(x => integer(x)), 'invalid-damage');
  if (p.inheritedWear !== undefined)check(shape(p.inheritedWear, ['faded', 'abraded']) && Object.values(p.inheritedWear).every(x => typeof x === 'boolean'), 'invalid-inherited-wear');
}
/** Hidden world truth, never a resident observation. Apply rounding only to
 * cumulative damage, not successively to the previous integer strength. */
export function currentCordStrength(p: CoirPiece): number {
  validatePiece(p);
  const years = p.damage.sunMs/R.yearIslandMs+p.damage.shadeMs/(10*R.yearIslandMs);
  return Math.min(p.baseStrengthGf, Math.max(0, Math.floor(p.baseStrengthGf*2**(-years)*0.99**p.damage.abrasions)));
}
function damageFactory<S extends 'prototype-coir-cord-damage/1'|'prototype-coir-cord-damage/2'>(original: CoirPiece, assumptionId: string, ctx: CordDamageContext, schema: S, evaluate: (p: CoirPiece) => number, integerPolicy: boolean) {
  check(assumptionId === COIR_CORD_ASSUMPTION_ID, 'explicit-assumption-required');
  validatePiece(original);
  check(shape(ctx, ['worldId', 'worldEpoch', 'runId', 'openedAtIslandMs', 'openedAtWorldMs']) && id(ctx.worldId) && id(ctx.worldEpoch) && id(ctx.runId)
  && integer(ctx.openedAtIslandMs) && integer(ctx.openedAtWorldMs), 'invalid-damage-context');
  const source = copy(original), context = structuredClone(ctx), binding = canonical(integerPolicy?[COIR_CORD_ASSUMPTION_ID, R, source, context, INTEGER_HALF_LIFE_POLICY_ID]: [COIR_CORD_ASSUMPTION_ID, R, source, context]);
  const stateOf = (events: CordDamageEvent[]): DamageState<S >= >({
    schema,
    binding,
    events: structuredClone(events)
  });
  function event(e: unknown): asserts e is CordDamageEvent {
    const keys = ['eventId', 'worldId', 'worldEpoch', 'runId', 'atMs', 'kind', 'clock'];
    check(e && typeof e === 'object' && !Array.isArray(e), 'invalid-event-object');
    const x = e as any;
    check(shape(x, [...keys, ...(x.kind === 'exposure'?['fromIslandMs', 'toIslandMs', 'shade']: x.kind === 'abrasion'?['count']: x.kind === 'load'?['gf', ...(x.breakAtMm === undefined?[]: ['breakAtMm'])]: ['invalid'])]), 'invalid-event-shape');
    check(id(x.eventId) && x.worldId === context.worldId && x.worldEpoch === context.worldEpoch && x.runId === context.runId && integer(x.atMs), 'event-context-mismatch');
    if (x.kind === 'exposure')check(x.clock === 'island' && integer(x.fromIslandMs) && integer(x.toIslandMs) && x.toIslandMs>x.fromIslandMs && x.atMs === x.toIslandMs && typeof x.shade === 'boolean', 'invalid-exposure');
    else if (x.kind === 'abrasion')check(x.clock === 'world' && integer(x.count), 'invalid-abrasion');
    else check(x.clock === 'world' && integer(x.gf) && (x.breakAtMm === undefined || integer(x.breakAtMm, 1)), 'invalid-load');
  }
  function replay(records: unknown) {
    check(Array.isArray(records), 'invalid-damage-history');
    let p = copy(source), pieces = [p], broken = false, islandTo = context.openedAtIslandMs, worldAt = context.openedAtWorldMs;
    const ids = new Set<string>();
    for (const e of records) {
      event(e);
      check(!ids.has(e.eventId), 'duplicate-damage-event');
      ids.add(e.eventId);
      check(!broken, 'already-broken');
      if (e.kind === 'exposure') {
        check(e.fromIslandMs >= islandTo, 'overlapping-exposure');
        const field = e.shade?'shadeMs': 'sunMs';
        p.damage[field] = sum(p.damage[field], e.toIslandMs-e.fromIslandMs);
        islandTo = e.toIslandMs;
      } else {
        check(e.atMs >= worldAt, 'out-of-order-world-event');
        worldAt = e.atMs;
        if (e.kind === 'abrasion')p.damage.abrasions = sum(p.damage.abrasions, e.count);
        else {
          check(e.breakAtMm === undefined || e.breakAtMm<p.lengthMm, 'invalid-break-position');
          if (e.gf>evaluate(p)) {
            check(p.lengthMm >= 2, 'unsplittable-length');
            const n = e.breakAtMm ?? Math.floor(p.lengthMm/2), a = copy(p), b = copy(p);
            a.lengthMm = n;
            b.lengthMm = p.lengthMm-n;
            for (const key of ['fiberDryMg', 'pithDryMg', 'waterMg'] as const) {
              a[key] = Number(BigInt(p[key])*BigInt(n)/BigInt(p.lengthMm));
              b[key] = p[key]-a[key];
            }
            check(a.fiberDryMg>0 && b.fiberDryMg>0, 'unsplittable-mass');
            const tag = canonical([context.worldId, context.worldEpoch, context.runId, p.lotId, e.eventId]);
            a.lotId = 'coir-break:'+tag+':1';
            b.lotId = 'coir-break:'+tag+':2';
            pieces = [a, b];
            broken = true;
          }
        }
      }
    }
    return {
      pieces,
      broken
    };
  }
  function restore(value: unknown): DamageState<S> {
    check(shape(value, ['schema', 'binding', 'events']) && value.schema === schema && value.binding === binding, 'incompatible-damage-save');
    replay(value.events);
    return stateOf(value.events);
  }
  function project(value: DamageState<S>) {
    const result = replay(restore(value).events);
    return {
      status: result.broken?'broken' as const: 'intact' as const,
      pieces: result.pieces.map(copy),
      strengthGf: evaluate(result.pieces[0])
    };
  }
  function observe(value: DamageState<S>): string[] {
    const p = project(value), first = p.pieces[0], noun = first.material === 'coir_rope'?'縄': '撚り糸';
    const faded = first.inheritedWear?.faded || (integerPolicy?10n*BigInt(first.damage.sunMs)+BigInt(first.damage.shadeMs) >= 10n*BigInt(R.yearIslandMs): first.damage.sunMs/R.yearIslandMs+first.damage.shadeMs/(10*R.yearIslandMs) >= 1);
    return [p.status === 'broken'?noun+'は二本に切れた。': noun+'はつながっている。',
    faded?'表面が日焼けして色あせている。': '目立った色あせはない。',
    first.inheritedWear?.abraded || first.damage.abrasions>0?'表面に擦れの跡がある。': '目立った擦れの跡はない。'];
  }
  return Object.freeze({
    start: () => stateOf([]),
    restore,
    project,
    observe,
    commit(value: DamageState<S>, receipt: CordDamageEvent): DamageState<S> {
      const state = restore(value);
      event(receipt);
      const old = state.events.find(x => x.eventId === receipt.eventId);
      if (old) {
        check(canonical(old) === canonical(receipt), 'conflicting-damage-replay');
        return state;
      }
      const events = [...state.events, receipt];
      replay(events);
      return stateOf(events);
    },
  });
}
/** Legacy /1 remains byte-for-byte equivalent in policy, binding and result. */
export function createCordDamageModel(original: CoirPiece, assumptionId: string, ctx: CordDamageContext) {
  return damageFactory(original, assumptionId, ctx, 'prototype-coir-cord-damage/1', currentCordStrength, false);
}
/** New opt-in policy for integer-only models; old saves cannot be relabelled. */
export function currentIntegerCordStrength(p: CoirPiece): number {
  validatePiece(p);
  return integerDecayStrength(p.baseStrengthGf, 10n*BigInt(p.damage.sunMs)+BigInt(p.damage.shadeMs), 10n*BigInt(R.yearIslandMs), p.damage.abrasions);
}
export function createIntegerCordDamageModel(original: CoirPiece, assumptionId: string, ctx: CordDamageContext) {
  return damageFactory(original, assumptionId, ctx, 'prototype-coir-cord-damage/2', currentIntegerCordStrength, true);
}
