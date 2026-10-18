import type { LotView } from './science-contract';
import type { PartsAssemblyTable } from './process-runner';
import { readCordPiece } from './coir-cord-lots';
import {
  cordId,
  cordInteger,
  type CoirPiece
} from '../science/prototypes/coir-cord-types';
import { currentIntegerCordStrength } from '../science/prototypes/coir-cord-damage';
import { SAIL_RULES, sailStrength } from '../science/prototypes/sail-raft-rules';
import { readSailMat, readBambooMast, SailLotError } from './sail-lots';

type CordMaterial = CoirPiece['material'];

function need(value: unknown, code: string): asserts value {
  if (!value) throw new SailLotError(code);
}

function lotForQuality(
  materialId: string,
  quality: Record<string, number>,
  index: number
): LotView {
  const parts = index < 2
    ? [quality.dry_mg, quality.water_mg]
    : [quality.fiber_dry_mg, quality.attached_pith_dry_mg, quality.water_mg];
  need(parts.every(value => cordInteger(value)), 'invalid-rig-part-mass');
  const mass = parts.reduce((sum, value) => sum + BigInt(value), 0n);
  need(mass > 0n && mass <= BigInt(Number.MAX_SAFE_INTEGER), 'invalid-rig-part-mass');
  return {
    lotId: 'rig-part:' + index,
    materialId,
    amount: { value: Number(mass), unit: 'mg' },
    quality,
    location: 'rig'
  };
}

/**
 * A rig consists of one mat, one mast and all of the selected whole cord lots.
 * The hull remains the world's virtual raft, outside the assembled equipment.
 *
 * The table API returns quality without receiving the original material IDs.
 * Capture each cord's material explicitly so strands never become ropes on return.
 */
export function sailRigParts(
  cordCount: number,
  cordMaterials: readonly CordMaterial[] = Array.from(
    { length: cordCount },
    () => 'coir_rope' as const
  )
): PartsAssemblyTable {
  need(cordInteger(cordCount, 1), 'cords-required');
  need(
    Array.isArray(cordMaterials) && cordMaterials.length === cordCount
      && cordMaterials.every(material => material === 'coir_rope' || material === 'coir_strand'),
    'invalid-rig-cord-materials'
  );
  const materials = ['sail_mat', 'bamboo_mast', ...cordMaterials];
  const roles = ['mat', 'mast', ...cordMaterials.map((_, index) => 'cord-' + index)];
  return {
    version: 'civ-sci.sail-rig-parts/1',
    kind: 'sail_rig',
    catalogEntry: 'prototype_sail_rig',
    catalogVersion: 'civ-sci-test-2',
    roles,
    materials: ['sail_mat', 'bamboo_mast', 'coir_rope', 'coir_strand'],
    toParams(lots: LotView[]): Record<string, number> {
      need(
        Array.isArray(lots) && lots.length === roles.length
          && lots.every((lot, index) => lot.materialId === materials[index])
          && lots.every(lot => cordId(lot.lotId))
          && new Set(lots.map(lot => lot.lotId)).size === lots.length,
        'invalid-rig-parts'
      );
      const mat = readSailMat(lots[0]);
      const mast = readBambooMast(lots[1]);
      const cords = lots.slice(2).map(readCordPiece);
      need(!mat.torn && !mast.broken && sailStrength(mat) > 0, 'broken-rig-part');
      let cordLength = 0n;
      for (const cord of cords) {
        need(currentIntegerCordStrength(cord) > 0, 'broken-rig-cord');
        need(
          cord.lengthMm >= 2
            && BigInt(cord.fiberDryMg) * BigInt(Math.floor(cord.lengthMm / 2))
              / BigInt(cord.lengthMm) > 0n,
          'unsplittable-rig-cord'
        );
        cordLength += BigInt(cord.lengthMm);
      }
      need(cordLength >= BigInt(SAIL_RULES.minRigCordMm), 'insufficient-rig-cord');
      need(cordLength <= BigInt(Number.MAX_SAFE_INTEGER), 'rig-length-overflow');
      const params: Record<string, number> = {
        mat_area_cm2: mat.areaCm2,
        cord_count: cordCount,
        rig_ms: SAIL_RULES.rigMs
      };
      // The world voyage ledger restores an existing physical cord's remainder
      // when the same cord is assembled again. The cord material codec is unchanged.
      for (let index = 0; index < cordCount; index++) {
        params['cord_use_ms_' + index] = 0;
      }
      return params;
    },
    partsOnReturn(
      copies: Record<string, number>[],
      condition: number
    ): { materialId: string; quality: Record<string, number> }[] {
      need(
        Array.isArray(copies) && copies.length === materials.length
          && Number.isFinite(condition) && condition >= 0 && condition <= 1,
        'invalid-rig-return'
      );
      return copies.map((copy, index) => {
        const quality = { ...copy };
        // Voyage damage is already written into each part. A world-side total
        // destruction marks both rigid parts broken, without deleting their mass.
        if (condition === 0 && index === 0) quality.torn = 1;
        if (condition === 0 && index === 1) quality.broken = 1;
        const lot = lotForQuality(materials[index], quality, index);
        if (index === 0) readSailMat(lot);
        else if (index === 1) readBambooMast(lot);
        else readCordPiece(lot);
        return { materialId: materials[index], quality };
      });
    }
  };
}

export const sailRigPartsForCordCount = sailRigParts;
/** Ordinary one-rope rig. Use sailRigParts for other cord selections. */
export const SAIL_RIG_PARTS = sailRigParts(1);
