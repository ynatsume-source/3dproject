// Owner assumptions for a damp lamp wick. No clock, inventory or resident state.
import type { LotView } from '../../world/science-contract';
import { isInt } from './common';

export interface WickComposition {
  fiberDryMg: number;
  pithDryMg: number;
  waterMg: number;
}

export interface LampWickComposition extends WickComposition {
  dryMg: number;
  explicit: boolean;
}

export const WET_WICK_RULES = Object.freeze({
  id: 'owner-assumption/lamp-wick/2026-10-17/v1',
  evidence: 'owner-assumption-not-calibrated',
  waterPerDryNumerator: 1,
  waterPerDryDenominator: 10,
});

const COMPONENT_KEYS = [
  'fiber_dry_mg',
  'attached_pith_dry_mg',
  'water_mg',
] as const;

function requireComposition(composition: WickComposition): number {
  const { fiberDryMg, pithDryMg, waterMg } = composition;
  if (![fiberDryMg, pithDryMg, waterMg].every((mg) => isInt(mg))) {
    throw new Error('wick components must be non-negative integer mg');
  }
  const dry = BigInt(fiberDryMg) + BigInt(pithDryMg);
  const total = dry + BigInt(waterMg);
  if (dry === 0n || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('a wick needs dry material and a safe integer total mass');
  }
  return Number(dry);
}

/** Exact component mg are opt-in. An old wick with no component keys is dry. */
export function readLampWick(lot: LotView): LampWickComposition {
  if (lot.materialId !== 'lamp_wick' || lot.amount.unit !== 'mg'
      || !isInt(lot.amount.value, 1)) {
    throw new Error('a lamp wick must have a positive integer mass in mg');
  }

  const quality = lot.quality ?? {};
  const present = COMPONENT_KEYS.filter((key) => Object.hasOwn(quality, key));
  if (present.length === 0) {
    return {
      fiberDryMg: lot.amount.value,
      pithDryMg: 0,
      waterMg: 0,
      dryMg: lot.amount.value,
      explicit: false,
    };
  }
  if (present.length !== COMPONENT_KEYS.length) {
    throw new Error('explicit wick composition needs fiber, attached pith and water mg together');
  }

  const composition: WickComposition = {
    fiberDryMg: quality.fiber_dry_mg,
    pithDryMg: quality.attached_pith_dry_mg,
    waterMg: quality.water_mg,
  };
  const dryMg = requireComposition(composition);
  if (BigInt(dryMg) + BigInt(composition.waterMg) !== BigInt(lot.amount.value)) {
    throw new Error('wick component masses do not equal the lot mass');
  }
  return { ...composition, dryMg, explicit: true };
}

export function wickCompositionQuality(
  composition: WickComposition,
): Record<string, number> {
  requireComposition(composition);
  return {
    fiber_dry_mg: composition.fiberDryMg,
    attached_pith_dry_mg: composition.pithDryMg,
    water_mg: composition.waterMg,
  };
}

export function wickCanLight(composition: WickComposition): boolean {
  const dryMg = requireComposition(composition);
  return BigInt(composition.waterMg) * BigInt(WET_WICK_RULES.waterPerDryDenominator)
    <= BigInt(dryMg) * BigInt(WET_WICK_RULES.waterPerDryNumerator);
}

const floorShare = (part: number, whole: number, amount: number): number =>
  Number(BigInt(part) * BigInt(amount) / BigInt(whole));

const ceilShare = (part: number, whole: number, amount: number): number => {
  const denominator = BigInt(whole);
  return Number((BigInt(part) * BigInt(amount) + denominator - 1n) / denominator);
};

/** Round only at settlement. Removed water is capped by the stock; trim keeps
 * its water in the returned tip. Each component closes separately in whole mg.
 * Upward water rounding makes the remaining wick no wetter than its source. */
export function settleLampWick(
  source: WickComposition,
  burnedDryMg: number,
  trimmedDryMg: number,
): {
  burned: WickComposition;
  trimmed: WickComposition;
  left: WickComposition;
} {
  const dryMg = requireComposition(source);
  if (!isInt(burnedDryMg) || !isInt(trimmedDryMg)
      || BigInt(burnedDryMg) + BigInt(trimmedDryMg) > BigInt(dryMg)) {
    throw new Error('wick removal exceeds the dry material');
  }

  const burnedFiber = floorShare(source.fiberDryMg, dryMg, burnedDryMg);
  const burnedWater = ceilShare(source.waterMg, dryMg, burnedDryMg);
  const dryAfterBurn = dryMg - burnedDryMg;
  const fiberAfterBurn = source.fiberDryMg - burnedFiber;
  const waterAfterBurn = source.waterMg - burnedWater;
  const trimmedFiber = dryAfterBurn > 0
    ? floorShare(fiberAfterBurn, dryAfterBurn, trimmedDryMg)
    : 0;
  const trimmedWater = dryAfterBurn > 0
    ? ceilShare(waterAfterBurn, dryAfterBurn, trimmedDryMg)
    : 0;

  const burned = {
    fiberDryMg: burnedFiber,
    pithDryMg: burnedDryMg - burnedFiber,
    waterMg: burnedWater,
  };
  const trimmed = {
    fiberDryMg: trimmedFiber,
    pithDryMg: trimmedDryMg - trimmedFiber,
    waterMg: trimmedWater,
  };
  return {
    burned,
    trimmed,
    left: {
      fiberDryMg: source.fiberDryMg - burned.fiberDryMg - trimmed.fiberDryMg,
      pithDryMg: source.pithDryMg - burned.pithDryMg - trimmed.pithDryMg,
      waterMg: source.waterMg - burned.waterMg - trimmed.waterMg,
    },
  };
}
