import type { LotView } from '../../world/science-contract';
import type { WetUnseparatedHusk } from './manual-husk-separation';

/** 仮定（キメ値）. Salt is not modelled; this policy is never selected by default. */
export const HUSK_SOAK_ASSUMPTION = Object.freeze({
  id: 'owner-assumption/husk-soak/2026-10-17/v1',
  evidence: 'owner-assumption-not-calibrated',
  durationMs: 432_000_000,
  quantumMs: 30_000,
} as const);

export interface HuskSoakOrigin {
  dryMg: number;
  waterMg: number;
  count: number;
  pieceIndex: number;
  elapsedMs: number;
  splitPolicy: 1 | 2;
}

export interface CoconutHuskComposition {
  dryMg: number;
  waterMg: number;
  count: number;
  historyComplete: 0 | 1;
}

export interface HuskSoakProjection {
  dryMg: number;
  initialWaterMg: number;
  waterMg: number;
  drawnWaterMg: number;
  count: number;
  certifiedIslandMs: number;
}

export interface SoakedHuskPiece {
  lotId: string;
  amountMg: number;
  quality: {
    dry_mg: number;
    water_mg: number;
    husk_count: 1;
    unseparated: 1;
    history_complete: 0 | 1;
    soak_origin_dry_mg?: number;
    soak_origin_water_mg?: number;
    soak_origin_count?: number;
    soak_piece_index?: number;
    soak_elapsed_ms?: number;
    soak_split_policy?: 1 | 2;
  };
  input: WetUnseparatedHusk;
}

function requireThat(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error('husk soak: ' + reason);
}

function whole(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Match the existing woody codec's half-up whole-ppm water convention.
 * The producer does not retain its pre-ppm components. Ash stays in dryMg.
 */
export function readCoconutHusk(lot: LotView): CoconutHuskComposition {
  requireThat(lot && typeof lot === 'object' && !Array.isArray(lot),
    'requires a coconut husk lot');
  requireThat(['coconut_husk', 'wet_unseparated_coconut_husk'].includes(lot.materialId)
    && nonempty(lot.lotId), 'requires an identified unseparated coconut husk lot');
  requireThat(lot.amount?.unit === 'mg' && whole(lot.amount.value, 1),
    'requires a positive safe-integer amount in mg');
  const q = lot.quality;
  requireThat(q && typeof q === 'object' && !Array.isArray(q),
    'requires explicit composition and count');
  if (lot.materialId === 'wet_unseparated_coconut_husk') {
    requireThat(q.husk_count === 1 && q.unseparated === 1
      && whole(q.dry_mg, 1) && whole(q.water_mg)
      && BigInt(q.dry_mg) + BigInt(q.water_mg) === BigInt(lot.amount.value),
      'requires one unseparated husk with closing integer dry/water masses');
    requireThat(q.history_complete === 0 || q.history_complete === 1,
      'history_complete must be explicitly 0 or 1');
    return { dryMg: q.dry_mg, waterMg: q.water_mg, count: 1,
      historyComplete: q.history_complete };
  }
  requireThat(whole(q.count, 1), 'count must be a positive safe integer');
  requireThat(whole(q.water_ppm) && q.water_ppm <= 1_000_000,
    'water_ppm must be a whole ppm within 0..1000000');
  requireThat(whole(q.ash_dry_ppm) && q.ash_dry_ppm <= 1_000_000,
    'ash_dry_ppm must be a whole ppm within 0..1000000');
  requireThat(q.history_complete === 0 || q.history_complete === 1,
    'history_complete must be explicitly 0 or 1');
  const waterMg = Number(
    (BigInt(lot.amount.value) * BigInt(q.water_ppm) + 500_000n) / 1_000_000n,
  );
  const dryMg = lot.amount.value - waterMg;
  requireThat(dryMg > 0 && q.count <= dryMg,
    'each husk needs at least one mg of dry material');
  return { dryMg, waterMg, count: q.count, historyComplete: q.history_complete };
}

const ORIGIN_KEYS = [
  'soak_origin_dry_mg', 'soak_origin_water_mg', 'soak_origin_count',
  'soak_piece_index', 'soak_elapsed_ms', 'soak_split_policy',
] as const;

function divided(total: bigint, count: bigint, index: bigint): bigint {
  return total / count + (index < total % count ? 1n : 0n);
}

/** The last few integer mg go only to pieces with remaining capacity.
 * This retains the exact batch sum and monotonic uptake for every piece.
 */
function allocatedWater(origin: HuskSoakOrigin, water: bigint): bigint {
  const count = BigInt(origin.count);
  const index = BigInt(origin.pieceIndex);
  const dry = BigInt(origin.dryMg);
  if (origin.splitPolicy === 1 || water > 2n * dry) {
    return divided(water, count, index);
  }
  const smallDry = dry / count;
  const largerPieces = dry % count;
  const commonCapacity = 2n * smallDry * count;
  if (water <= commonCapacity || largerPieces === 0n) {
    return divided(water, count, index);
  }
  return 2n * smallDry + (index < largerPieces
    ? divided(water - commonCapacity, largerPieces, index) : 0n);
}

function originWater(origin: HuskSoakOrigin, elapsedMs: number): bigint {
  const dry = BigInt(origin.dryMg);
  const initial = BigInt(origin.waterMg);
  const gain = 2n * dry > initial ? 2n * dry - initial : 0n;
  return initial + gain * BigInt(elapsedMs) / BigInt(HUSK_SOAK_ASSUMPTION.durationMs);
}

/** An uptake clock belongs to the original lump, not to the next take-out run.
 * Its equal-count allocation carries the fractional mg without floating point.
 */
export function readHuskSoakOrigin(source: LotView): HuskSoakOrigin | null {
  const q = source.quality ?? {};
  const hasOrigin = ORIGIN_KEYS.some(key => q[key] !== undefined);
  if (!hasOrigin) return null;
  requireThat(source.materialId === 'wet_unseparated_coconut_husk'
    && ORIGIN_KEYS.every(key => whole(q[key])), 'invalid soaking origin');
  const origin: HuskSoakOrigin = {
    dryMg: q.soak_origin_dry_mg,
    waterMg: q.soak_origin_water_mg,
    count: q.soak_origin_count,
    pieceIndex: q.soak_piece_index,
    elapsedMs: q.soak_elapsed_ms,
    splitPolicy: q.soak_split_policy as 1 | 2,
  };
  requireThat(origin.dryMg > 0 && origin.count > 0 && origin.count <= origin.dryMg
    && origin.pieceIndex < origin.count
    && origin.elapsedMs <= HUSK_SOAK_ASSUMPTION.durationMs
    && origin.elapsedMs % HUSK_SOAK_ASSUMPTION.quantumMs === 0
    && (origin.splitPolicy === 1 || origin.splitPolicy === 2),
    'invalid soaking origin bounds');
  const maximum = BigInt(origin.waterMg) > 2n * BigInt(origin.dryMg)
    ? BigInt(origin.waterMg) : 2n * BigInt(origin.dryMg);
  requireThat(BigInt(origin.dryMg) + maximum <= BigInt(Number.MAX_SAFE_INTEGER),
    'soaking origin exceeds safe mass');
  const input = readCoconutHusk(source);
  const count = BigInt(origin.count);
  const index = BigInt(origin.pieceIndex);
  requireThat(BigInt(input.dryMg) === divided(BigInt(origin.dryMg), count, index)
    && BigInt(input.waterMg) === allocatedWater(origin, originWater(origin, origin.elapsedMs)),
    'soaking origin does not match the husk');
  return origin;
}

/** World save migration can add this numeric carry to a verified old output. */
export function withHuskSoakOrigin(source: LotView, origin: HuskSoakOrigin): LotView {
  const out = structuredClone(source);
  out.quality = {
    ...out.quality,
    soak_origin_dry_mg: origin.dryMg,
    soak_origin_water_mg: origin.waterMg,
    soak_origin_count: origin.count,
    soak_piece_index: origin.pieceIndex,
    soak_elapsed_ms: origin.elapsedMs,
    soak_split_policy: origin.splitPolicy,
  };
  readHuskSoakOrigin(out);
  return out;
}

export function huskSoakOriginForPiece(
  source: LotView,
  certifiedIslandMs: number,
  pieceIndex: number,
  legacySplit = false,
): HuskSoakOrigin {
  const input = readCoconutHusk(source);
  const previous = readHuskSoakOrigin(source);
  const quantum = HUSK_SOAK_ASSUMPTION.quantumMs;
  const elapsed = Math.floor(certifiedIslandMs / quantum) * quantum;
  if (previous) {
    requireThat(pieceIndex === 0, 'one resumed husk produces one husk');
    return { ...previous,
      elapsedMs: Math.min(HUSK_SOAK_ASSUMPTION.durationMs, previous.elapsedMs + elapsed) };
  }
  return {
    dryMg: input.dryMg, waterMg: input.waterMg, count: input.count, pieceIndex,
    elapsedMs: Math.min(HUSK_SOAK_ASSUMPTION.durationMs, elapsed),
    splitPolicy: legacySplit ? 1 : 2,
  };
}

/** Quantize confirmed submersion once. A take-out does not reset the original
 * uptake clock or its integer allocation when the same husk is soaked again.
 */
export function computeHuskSoak(
  source: LotView,
  assumptionId: string,
  certifiedIslandMs: number,
): HuskSoakProjection {
  requireThat(assumptionId === HUSK_SOAK_ASSUMPTION.id,
    'requires the explicit versioned assumption');
  requireThat(whole(certifiedIslandMs),
    'confirmed island time must be a nonnegative safe integer');
  const input = readCoconutHusk(source);
  const previous = readHuskSoakOrigin(source);
  const dry = BigInt(input.dryMg);
  const initialWater = BigInt(input.waterMg);
  const target = 2n * dry;
  const maximumWater = initialWater > target ? initialWater : target;
  requireThat(dry + maximumWater <= BigInt(Number.MAX_SAFE_INTEGER),
    'fully soaked mass exceeds safe integers');
  const quantum = BigInt(HUSK_SOAK_ASSUMPTION.quantumMs);
  const duration = BigInt(HUSK_SOAK_ASSUMPTION.durationMs);
  const confirmed = BigInt(certifiedIslandMs) / quantum * quantum;
  const elapsed = confirmed > duration ? duration : confirmed;
  let water: bigint;
  if (previous) {
    const at = Math.min(HUSK_SOAK_ASSUMPTION.durationMs,
      previous.elapsedMs + Number(elapsed));
    water = allocatedWater(previous, originWater(previous, at));
  } else {
    const gain = target > initialWater ? (target - initialWater) * elapsed / duration : 0n;
    water = initialWater + gain;
  }
  requireThat(water >= initialWater
    && dry + water <= BigInt(Number.MAX_SAFE_INTEGER), 'invalid resumed water mass');
  return {
    dryMg: input.dryMg,
    initialWaterMg: input.waterMg,
    waterMg: Number(water),
    drawnWaterMg: Number(water - initialWater),
    count: input.count,
    certifiedIslandMs: Number(elapsed),
  };
}

export function splitSoakedHusks(
  source: LotView,
  assumptionId: string,
  certifiedIslandMs: number,
  context: { runId: string; fromWorldMs: number; toWorldMs: number },
  legacyQuality = false,
): SoakedHuskPiece[] {
  const p = computeHuskSoak(source, assumptionId, certifiedIslandMs);
  requireThat(p.certifiedIslandMs > 0,
    'zero certified soaking must release the original lot unchanged');
  requireThat(context && typeof context === 'object' && !Array.isArray(context)
    && nonempty(context.runId) && whole(context.fromWorldMs) && whole(context.toWorldMs)
    && context.toWorldMs >= context.fromWorldMs,
    'requires an identified run and ordered world provenance times');
  const input = readCoconutHusk(source);
  const count = BigInt(p.count);
  const dry = BigInt(p.dryMg);
  const water = BigInt(p.waterMg);
  const pieces: SoakedHuskPiece[] = [];
  for (let index = 0; index < p.count; index += 1) {
    const i = BigInt(index);
    const dryMg = Number(dry / count + (i < dry % count ? 1n : 0n));
    const origin = huskSoakOriginForPiece(source, certifiedIslandMs, index, legacyQuality);
    const waterMg = Number(legacyQuality ? divided(water, count, i)
      : allocatedWater(origin, originWater(origin, origin.elapsedMs)));
    // The run already uniquely binds its source. Never nest an old output ID:
    // repeated take-out/re-soak would otherwise escape and double that string.
    const identity = legacyQuality
      ? JSON.stringify([context.runId, source.lotId, index])
      : context.runId + ':' + index;
    const lotId = 'lot:husk-soak:' + identity;
    const base: LotView = {
      lotId, materialId: 'wet_unseparated_coconut_husk',
      amount: { value: dryMg + waterMg, unit: 'mg' }, location: source.location,
      quality: { dry_mg: dryMg, water_mg: waterMg, husk_count: 1, unseparated: 1,
        history_complete: input.historyComplete },
    };
    const carried = legacyQuality ? base
      : withHuskSoakOrigin(base, origin);
    pieces.push({
      lotId,
      amountMg: dryMg + waterMg,
      quality: carried.quality as SoakedHuskPiece['quality'],
      input: {
        materialId: 'wet_unseparated_coconut_husk',
        lotId, separation: 'never-separated', dryMg, waterMg,
        soakHistory: [{
          recordId: 'record:husk-soak:' + identity,
          runId: context.runId,
          fromWorldMs: context.fromWorldMs,
          toWorldMs: context.toWorldMs,
        }],
      },
    });
  }
  return pieces;
}
