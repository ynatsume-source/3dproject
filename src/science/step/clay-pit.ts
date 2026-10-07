// The clay pit: the island's first tub (owner's decision 2026-10-07: the tub is first an unfired pit, a large jar later).
// A round hole dug in the sand and lined with puddled raw clay, under a leaf roof. Main builds it from materials (as it
// assembles equipment, ADR 0006); this file is the table: the pit's equipment params from its size, and what it takes.
// The soaking step (p10x_clay_slake, 0.1.2) accepts it as its tub.
//
// Shape: a cylinder dug diameterCm × depthCm; the lining (clayPitLiningCm of raw clay, trampled wet) covers the bottom
// and the wall; it is filled to clayPitFillShare of the inside. Everything is assumed (params.ts).
// An idealisation (Codex CP-C1 on 7601336): a sound lining is treated as a watertight tub. How well a real lining holds
// water, drying damage and repairs are not evaluated; the roof and the wetness are how it is built, not a guarantee
// that it does not leak (puddled clay still seeps, e.g. FAO's ~1 mm/day for fish ponds: not calibrated to this pit).
// The lining's clay is a thin-wall estimate (outer perimeter × thickness), slightly more than the exact cylinder
// difference (+0.5 kg at 50 × 25 cm, CP-C2): a margin for the work. Not modelled: the lining mixing into the clay
// soaked in it, rain.

import { pv } from '../params';
import { finite } from './common';

export const CLAY_PIT_TABLE = 'civ-sci.clay-pit/1';
export const CLAY_PIT = 'clay_pit'; // kind and catalogEntry of the equipment
export const CLAY_PIT_RANGE = { diameterCm: [20, 120], depthCm: [10, 60] } as const;

export interface ClayPitPlan { diameterCm: number; depthCm: number; sunExposure?: number }

function check(p: ClayPitPlan) {
  if (!finite(p.diameterCm, CLAY_PIT_RANGE.diameterCm[0], CLAY_PIT_RANGE.diameterCm[1])) throw new Error(`diameterCm must be within ${CLAY_PIT_RANGE.diameterCm.join('..')}`);
  if (!finite(p.depthCm, CLAY_PIT_RANGE.depthCm[0], CLAY_PIT_RANGE.depthCm[1])) throw new Error(`depthCm must be within ${CLAY_PIT_RANGE.depthCm.join('..')}`);
  if (!finite(p.sunExposure ?? 0, 0, 1)) throw new Error('sunExposure must be within 0..1');
}

/** The equipment params the soaking step reads (as fixture_clay_tub's): capacityMl, surfaceCm2, sunExposure. */
export function clayPitParams(p: ClayPitPlan): Record<string, number> {
  check(p);
  const t = pv('clayPitLiningCm'), r = p.diameterCm / 2 - t, h = p.depthCm - t;
  return { capacityMl: Math.floor(Math.PI * r * r * h * pv('clayPitFillShare')), surfaceCm2: Math.floor(Math.PI * r * r), sunExposure: p.sunExposure ?? 0 };
}

/** What making it takes: raw clay for the lining (mg, as dug: the lining is trampled wet from it) and the hands'
 *  work (seconds at clayPitHandPowerW): digging the sand out and treading the lining in. */
export function clayPitMaterials(p: ClayPitPlan): { rawClayMg: number; handSeconds: number; handPowerW: number } {
  check(p);
  const R = p.diameterCm / 2, t = pv('clayPitLiningCm');
  const liningCm3 = Math.PI * R * R * t + Math.PI * p.diameterCm * (p.depthCm - t) * t; // bottom + wall
  const dugL = (Math.PI * R * R * p.depthCm) / 1000;
  return { rawClayMg: Math.round(liningCm3 * pv('clayPitLiningDensity') * 1000),
    handSeconds: Math.ceil(dugL * pv('clayPitDigSecondsPerL') + liningCm3 / 1000 * pv('clayPitLineSecondsPerL')), handPowerW: pv('clayPitHandPowerW') };
}
