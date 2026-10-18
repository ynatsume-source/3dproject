import type { LotView, ScienceStepResult } from './science-contract';
import {
  cordId,
  cordInteger,
  cordShape
} from '../science/prototypes/coir-cord-types';
import {
  validateMat,
  validateMast,
  type PlantMass,
  type SailMat,
  type BambooMast
} from '../science/prototypes/sail-raft-rules';
import type { RaftHull } from '../science/prototypes/sail-raft-manufacturing';
import { bambooQualityFromLegacyMass } from '../science/prototypes/sail-raft-inputs';

export { bambooQualityFromLegacyMass };
type Produced = ScienceStepResult['produced'][number];

const PLANTS = [
  'pandanus_standing_leaves',
  'pandanus_leaves',
  'pandanus_strips',
  'pandanus_leaf_scrap',
  'bamboo'
] as const;
const MASS = ['dry_mg', 'water_mg', 'history_complete', 'sail_codec'];
const MAT = [
  ...MASS, 'area_cm2', 'base_strength_gf', 'torn',
  'sun_ms', 'shade_ms', 'rain_ms'
];
const MAST = [...MASS, 'length_mm', 'base_strength_gf', 'broken'];

/** World-only material serialization. Never a resident-facing view. */
export class SailLotError extends Error {
  constructor(readonly code: string) {
    super('The sail material record is not usable.');
    this.name = 'SailLotError';
  }
}

function need(value: unknown, code: string): asserts value {
  if (!value) throw new SailLotError(code);
}

function record(value: unknown): value is Record<string, number> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function flag(value: unknown): asserts value is 0 | 1 {
  need(value === 0 || value === 1, 'invalid-history');
}

function total(dryMg: number, waterMg: number): number {
  need(cordInteger(dryMg, 1) && cordInteger(waterMg), 'invalid-mass');
  const amount = BigInt(dryMg) + BigInt(waterMg);
  need(amount <= BigInt(Number.MAX_SAFE_INTEGER), 'mass-overflow');
  return Number(amount);
}

function envelope(lot: LotView, materials: readonly string[]): void {
  need(
    !!lot && cordId(lot.lotId) && cordId(lot.location)
      && materials.includes(lot.materialId),
    'invalid-material'
  );
  need(
    !!lot.amount && lot.amount.unit === 'mg'
      && cordInteger(lot.amount.value, 1),
    'invalid-amount'
  );
}

function quality(lot: LotView, materials: readonly string[]): Record<string, number> {
  envelope(lot, materials);
  need(record(lot.quality), 'missing-quality');
  return lot.quality;
}

function checkedMass(lot: LotView, q: Record<string, number>) {
  const mass = { dryMg: q.dry_mg, waterMg: q.water_mg };
  need(total(mass.dryMg, mass.waterMg) === lot.amount.value, 'mass-does-not-close');
  return mass;
}

function historyQuality(q: Record<string, number>): void {
  flag(q.history_complete);
  need(q.sail_codec === 1, 'unsupported-sail-codec');
}

function destination(location: string, history: number): void {
  need(cordId(location), 'invalid-location');
  flag(history);
}

function isLegacyBamboo(lot: LotView): boolean {
  return lot.materialId === 'bamboo' && (
    lot.quality === undefined
    || cordShape(lot.quality, ['dry_mg', 'water_mg', 'length_mm'])
  );
}

/** Old bamboo had no recorded provenance. Conversion does not invent one. */
export function readSailHistory(lot: LotView): 0 | 1 {
  envelope(lot, [...PLANTS, 'sail_mat', 'bamboo_mast']);
  if (isLegacyBamboo(lot)) return 0;
  const q = quality(lot, [...PLANTS, 'sail_mat', 'bamboo_mast']);
  historyQuality(q);
  return q.history_complete as 0 | 1;
}

export function readPlantMass(lot: LotView): PlantMass {
  envelope(lot, PLANTS);
  if (isLegacyBamboo(lot)) {
    const q = lot.quality ?? bambooQualityFromLegacyMass(lot.amount.value);
    need(cordShape(q, ['dry_mg', 'water_mg', 'length_mm']), 'unsupported-plant-codec');
    const mass = checkedMass(lot, q);
    need(cordInteger(q.length_mm), 'invalid-bamboo-length');
    return { lotId: lot.lotId, material: 'bamboo', ...mass, lengthMm: q.length_mm };
  }
  const q = quality(lot, PLANTS);
  const bamboo = lot.materialId === 'bamboo';
  need(cordShape(q, [...MASS, ...(bamboo ? ['length_mm'] : [])]), 'unsupported-plant-codec');
  historyQuality(q);
  const mass = checkedMass(lot, q);
  if (bamboo) need(cordInteger(q.length_mm), 'invalid-bamboo-length');
  return {
    lotId: lot.lotId,
    material: lot.materialId as PlantMass['material'],
    ...mass,
    ...(bamboo ? { lengthMm: q.length_mm } : {})
  };
}

export function readSailMat(lot: LotView): SailMat {
  const q = quality(lot, ['sail_mat']);
  need(cordShape(q, MAT), 'unsupported-mat-codec');
  historyQuality(q);
  need(q.torn === 0 || q.torn === 1, 'invalid-torn-flag');
  const mat: SailMat = {
    lotId: lot.lotId,
    material: 'sail_mat',
    ...checkedMass(lot, q),
    areaCm2: q.area_cm2,
    baseStrengthGf: q.base_strength_gf,
    torn: q.torn === 1,
    damage: { sunMs: q.sun_ms, shadeMs: q.shade_ms, rainMs: q.rain_ms }
  };
  validateMat(mat);
  return mat;
}

export function readBambooMast(lot: LotView): BambooMast {
  const q = quality(lot, ['bamboo_mast']);
  need(cordShape(q, MAST), 'unsupported-mast-codec');
  historyQuality(q);
  need(q.broken === 0 || q.broken === 1, 'invalid-broken-flag');
  const mast: BambooMast = {
    lotId: lot.lotId,
    material: 'bamboo_mast',
    ...checkedMass(lot, q),
    lengthMm: q.length_mm,
    baseStrengthGf: q.base_strength_gf,
    broken: q.broken === 1
  };
  validateMast(mast);
  return mast;
}

export function writePlantMass(plant: PlantMass, location: string, history: number): Produced {
  destination(location, history);
  need(
    cordShape(plant, [
      'lotId', 'material', 'dryMg', 'waterMg',
      ...(plant?.material === 'bamboo' ? ['lengthMm'] : [])
    ]) && cordId(plant.lotId) && PLANTS.includes(plant.material),
    'invalid-plant'
  );
  if (plant.material === 'bamboo') {
    need(cordInteger(plant.lengthMm), 'invalid-bamboo-length');
  }
  return {
    materialId: plant.material,
    amount: { value: total(plant.dryMg, plant.waterMg), unit: 'mg' },
    into: location,
    quality: {
      dry_mg: plant.dryMg,
      water_mg: plant.waterMg,
      ...(plant.material === 'bamboo' ? { length_mm: plant.lengthMm! } : {}),
      history_complete: history,
      sail_codec: 1
    }
  };
}

export function writeSailMat(mat: SailMat, location: string, history: number): Produced {
  destination(location, history);
  validateMat(mat);
  return {
    materialId: 'sail_mat',
    amount: { value: total(mat.dryMg, mat.waterMg), unit: 'mg' },
    into: location,
    quality: {
      dry_mg: mat.dryMg,
      water_mg: mat.waterMg,
      area_cm2: mat.areaCm2,
      base_strength_gf: mat.baseStrengthGf,
      torn: mat.torn ? 1 : 0,
      sun_ms: mat.damage.sunMs,
      shade_ms: mat.damage.shadeMs,
      rain_ms: mat.damage.rainMs,
      history_complete: history,
      sail_codec: 1
    }
  };
}

export function writeBambooMast(mast: BambooMast, location: string, history: number): Produced {
  destination(location, history);
  validateMast(mast);
  return {
    materialId: 'bamboo_mast',
    amount: { value: total(mast.dryMg, mast.waterMg), unit: 'mg' },
    into: location,
    quality: {
      dry_mg: mast.dryMg,
      water_mg: mast.waterMg,
      length_mm: mast.lengthMm,
      base_strength_gf: mast.baseStrengthGf,
      broken: mast.broken ? 1 : 0,
      history_complete: history,
      sail_codec: 1
    }
  };
}

/** Assumption: each existing raft pole is 8.5 kg dry material and 0.5 kg water. */
export const RAFT_PIECE = Object.freeze({ dryMg: 8_500_000, waterMg: 500_000 });

export function raftHullFromPieces(lotId: string, pieces: number): RaftHull {
  need(cordId(lotId) && cordInteger(pieces, 1), 'invalid-raft-pieces');
  const dry = BigInt(pieces) * BigInt(RAFT_PIECE.dryMg);
  const water = BigInt(pieces) * BigInt(RAFT_PIECE.waterMg);
  need(dry + water <= BigInt(Number.MAX_SAFE_INTEGER), 'mass-overflow');
  return { lotId, material: 'raft', dryMg: Number(dry), waterMg: Number(water) };
}
