import type { LotView } from '../../world/science-contract';
import type { WetUnseparatedHusk } from './manual-husk-separation';

/** 仮定（キメ値）. Salt is not modelled; this policy is never selected by default. */
export const HUSK_SOAK_ASSUMPTION = Object.freeze({
  id: 'owner-assumption/husk-soak/2026-10-17/v1',
  evidence: 'owner-assumption-not-calibrated',
  durationMs: 432_000_000,
  quantumMs: 30_000,
} as const);

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
  requireThat(lot.materialId === 'coconut_husk' && nonempty(lot.lotId),
    'requires an identified coconut_husk lot');
  requireThat(lot.amount?.unit === 'mg' && whole(lot.amount.value, 1),
    'requires a positive safe-integer amount in mg');
  const q = lot.quality;
  requireThat(q && typeof q === 'object' && !Array.isArray(q),
    'requires explicit composition and count');
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

/** Quantize cumulative confirmed submersion once, never each request.
 * Five days caps absorption, not the material reservation.
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
  const gain = target > initialWater ? (target - initialWater) * elapsed / duration : 0n;
  return {
    dryMg: input.dryMg,
    initialWaterMg: input.waterMg,
    waterMg: Number(initialWater + gain),
    drawnWaterMg: Number(gain),
    count: input.count,
    certifiedIslandMs: Number(elapsed),
  };
}

export function splitSoakedHusks(
  source: LotView,
  assumptionId: string,
  certifiedIslandMs: number,
  context: { runId: string; fromWorldMs: number; toWorldMs: number },
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
    const waterMg = Number(water / count + (i < water % count ? 1n : 0n));
    const identity = JSON.stringify([context.runId, source.lotId, index]);
    const lotId = 'lot:husk-soak:' + identity;
    pieces.push({
      lotId,
      amountMg: dryMg + waterMg,
      quality: {
        dry_mg: dryMg, water_mg: waterMg, husk_count: 1, unseparated: 1,
        history_complete: input.historyComplete,
      },
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
