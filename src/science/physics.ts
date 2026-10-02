// Small physical laws used by the clay loop. Each one is a simplification; see params.ts.

import { pv, type ParamId } from './params';
import { SPECIES, totalMg, type Composition } from './chem';

const R = 8.314; // J/(mol·K)

/** Saturation vapour pressure over water (Pa), Magnus-type formula (assumed, not source-checked here). */
export function pSat(tC: number): number {
  return 610.94 * Math.exp((17.625 * tC) / (tC + 243.04));
}

/**
 * First-order rate constant (1/s) with Arrhenius temperature dependence, anchored by the
 * temperature where the half-life is `halfLifeS`. Game calibration, not measured kinetics.
 */
export function rateK(tC: number, trefParam: ParamId, halfLifeS: number, eaJPerMol: number): number {
  const T = tC + 273.15, Tr = pv(trefParam) + 273.15;
  const kRef = Math.LN2 / halfLifeS;
  return kRef * Math.exp((eaJPerMol / R) * (1 / Tr - 1 / T));
}

export const KINETICS = {
  water: (tC: number) => rateK(tC, 'kinWaterTref', 300, 40e3),
  dehydrox: (tC: number) => rateK(tC, 'kinDehydroxTref', 600, 200e3),
  calcination: (tC: number) => rateK(tC, 'kinCalcTref', 900, 180e3),
  organic: (tC: number) => rateK(tC, 'kinOrganicTref', 900, 120e3),
  sinter: (tC: number) => rateK(tC, 'kinSinterTref', 3600, 300e3),
};

export function dryMg(c: Composition): number {
  return totalMg(c) - (c.water ?? 0);
}
export function waterRatio(c: Composition): number {
  const d = dryMg(c);
  return d > 0 ? (c.water ?? 0) / d : 0;
}

/** Fraction of the original kaolinite already dehydroxylated (by moles, via mass of products). */
export function dehydroxExtent(c: Composition): number {
  const k = c.kaolinite ?? 0, m = c.metakaolin ?? 0;
  if (k + m === 0) return 1;
  const kMol = k / 258.16, mMol = m / 222.13;
  return mMol / (kMol + mMol);
}

/** Probability that one mechanism cracks a piece, from exposure/tolerance ratio. */
export function crackP(ratio: number): number {
  if (ratio <= 1) return 0;
  return Math.min(pv('pCrackMax'), 0.3 * Math.log2(ratio));
}

/** Glow colour category a resident can see, from kiln temperature (coarse; sources disagree by ~200 K). */
export function glowCategory(tC: number): string {
  if (tC < 500) return '光は見えない';
  if (tC < 650) return 'ごく暗い赤（暗がりでわかる程度）';
  if (tC < 800) return '暗い赤';
  if (tC < 950) return '桜色がかった赤';
  if (tC < 1100) return '橙';
  return '黄色みの強い明るさ';
}

/** Lower edge of each glow category the operator aims for; they stop raising once it appears (+30 K judgement). */
export const GLOW_TARGET_C: Record<'dull_red' | 'cherry' | 'orange' | 'yellow', number> = {
  dull_red: 650 + 30, cherry: 800 + 30, orange: 950 + 30, yellow: 1100 + 30,
};
export const PACE_K_PER_H: Record<'slow' | 'normal' | 'fast', number> = { slow: 100, normal: 200, fast: 400 };

/** Wood fuel lot: energy per mg as burned (LHV of dry part minus latent heat of its moisture). */
export function fuelLhvJPerMg(c: Composition): number {
  const t = totalMg(c);
  if (t === 0) return 0;
  const dry = (c.wood_dry ?? 0) / t, wet = (c.water ?? 0) / t;
  return (dry * pv('woodLhvDry') - wet * pv('latentHeatWater25')) / 1e6;
}

export function hasFormula(id: keyof typeof SPECIES): boolean {
  return SPECIES[id].formula !== null;
}
