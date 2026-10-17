import type {ManualSeparationTestProfile, SeparationKnot, WetUnseparatedHusk} from './manual-husk-separation';

/** Owner decision 2026-10-15: 仮定（キメ値）, NOT measured productivity or yield.
 * A named, explicit choice for the isolated prototype; never a runner default.
 * Change the version when any coefficient or scaling rule changes.
 */
export const MANUAL_HUSK_ASSUMPTION = Object.freeze({
  id: 'owner-assumption/manual-husk/2026-10-15/v1',
  evidence: 'owner-assumption-not-calibrated',
  standardDryMg: 300_000,
  standardWaterMg: 600_000,
  initialFiberDryMg: 90_000,
  initialPithDryMg: 210_000,
  knots: Object.freeze([
    Object.freeze({workMs: 0, fiberDryMg: 0, attachedPithDryMg: 0, fiberWaterMg: 0, attachedPithWaterMg: 0, dischargedWaterMg: 0}),
    Object.freeze({workMs: 60_000, fiberDryMg: 36_000, attachedPithDryMg: 7_200, fiberWaterMg: 36_000, attachedPithWaterMg: 21_600, dischargedWaterMg: 90_000}),
    Object.freeze({workMs: 120_000, fiberDryMg: 58_000, attachedPithDryMg: 11_600, fiberWaterMg: 58_000, attachedPithWaterMg: 34_800, dischargedWaterMg: 140_000}),
    Object.freeze({workMs: 240_000, fiberDryMg: 72_000, attachedPithDryMg: 14_400, fiberWaterMg: 72_000, attachedPithWaterMg: 43_200, dischargedWaterMg: 180_000}),
  ]),
});

function requireAssumption(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`manual husk: assumption ${reason}`);
}
const positiveMass = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Explicit opt-in. The caller supplies authoritative dry/water masses, never wet
 * weight converted to a guessed dry mass or a guessed husk count.
 * Scale masses by floor and labour by ceil, using BigInt before multiplication.
 * This assumes uniform work across this lot. Separate lots worked in sequence
 * have a different schedule; only interval partitions of the SAME run must agree.
 * Too little water rejects this recipe instead of inventing water or silently
 * changing retention ratios. Extra water stays in the unseparated residual.
 */
export function createManualHuskAssumptionProfile(
  input: Pick<WetUnseparatedHusk, 'dryMg' | 'waterMg'>,
  assumptionId: typeof MANUAL_HUSK_ASSUMPTION.id,
): ManualSeparationTestProfile {
  requireAssumption(assumptionId === MANUAL_HUSK_ASSUMPTION.id, 'requires the explicit versioned choice');
  requireAssumption(input && typeof input === 'object' && !Array.isArray(input)
    && positiveMass(input.dryMg) && positiveMass(input.waterMg), 'requires explicit positive safe-integer dry/water mg');
  requireAssumption(BigInt(input.dryMg) + BigInt(input.waterMg) <= BigInt(Number.MAX_SAFE_INTEGER), 'total mass exceeds safe integers');
  const dry = BigInt(input.dryMg), reference = BigInt(MANUAL_HUSK_ASSUMPTION.standardDryMg);
  const mass = (value: number) => Number(BigInt(value) * dry / reference);
  const time = (value: number) => Number((BigInt(value) * dry + reference - 1n) / reference);
  const knots: SeparationKnot[] = [];
  for (const base of MANUAL_HUSK_ASSUMPTION.knots) {
    const k: SeparationKnot = {
      workMs: time(base.workMs),
      fiberDryMg: mass(base.fiberDryMg),
      attachedPithDryMg: mass(base.attachedPithDryMg),
      fiberWaterMg: mass(base.fiberWaterMg),
      attachedPithWaterMg: mass(base.attachedPithWaterMg),
      dischargedWaterMg: mass(base.dischargedWaterMg),
    };
    // At mg resolution, water/pith without a whole dry carrier stays residual,
    // just as in the existing core. This also supports very small audit lots.
    if (!k.fiberDryMg) k.attachedPithDryMg = k.fiberWaterMg = k.attachedPithWaterMg = 0;
    if (!k.attachedPithDryMg) k.attachedPithWaterMg = 0;
    // Sub-ms labour knots can round to the same millisecond. Keep the last
    // cumulative allocation at that time, never a duplicate/zero-length segment.
    if (knots.at(-1)?.workMs === k.workMs) knots[knots.length - 1] = k;
    else knots.push(k);
  }
  const last = knots.at(-1)!;
  const requiredWater = BigInt(last.fiberWaterMg) + BigInt(last.attachedPithWaterMg) + BigInt(last.dischargedWaterMg);
  requireAssumption(requiredWater <= BigInt(input.waterMg), 'has insufficient input water for this recipe');
  return {kind: 'uncalibrated-test-profile', profileId: MANUAL_HUSK_ASSUMPTION.id, knots};
}
