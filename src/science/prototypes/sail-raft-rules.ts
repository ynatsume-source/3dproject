import {
  drawUint32
} from '../rng';
import {
  integerSqrt,
  integerDecayStrength
} from './integer-half-life';
import {
  cordAssert as check,
  cordInteger as uint,
  cordShape as shape,
  cordId as id,
  cordCanonical as canonical
} from './coir-cord-types';
export {
  check,
  uint,
  shape,
  id,
  canonical,
  integerSqrt
};
/** Motion clock is selected only here. Saved v2 IDs retain the selected policy. */
export const SAIL_MOTION_CLOCK: 'island' | 'world' = 'island';
export const SAIL_RAFT_ISLAND_ID = 'owner-assumption/sail-raft/2026-10-18/v2-island' as const;
export const SAIL_RAFT_WORLD_ID = 'owner-assumption/sail-raft/2026-10-18/v2-world' as const;
export const PADDLE_MM_S = 556;
export function sailAssumptionId(clock: 'island' | 'world' = SAIL_MOTION_CLOCK): typeof SAIL_RAFT_ISLAND_ID | typeof SAIL_RAFT_WORLD_ID {
  return clock === 'island' ? SAIL_RAFT_ISLAND_ID : SAIL_RAFT_WORLD_ID;
}
export function sailMotionClock(assumptionId: string): 'island' | 'world' {
  check(assumptionId === SAIL_RAFT_ISLAND_ID || assumptionId === SAIL_RAFT_WORLD_ID,
    'explicit-sail-v2-assumption-required');
  return assumptionId === SAIL_RAFT_ISLAND_ID ? 'island' : 'world';
}
export const SAIL_RAFT_ID = 'owner-assumption/sail-raft/2026-10-15/v1' as const;
export const SAIL_RULES = Object.freeze({
  id: SAIL_RAFT_ID,
  evidence: 'owner-assumption-not-calibrated',
  cellWorldMs: 30000,
  yearIslandMs: 31536000000,
  leafReferenceDryMg: 1000000,
  harvestMs: 1800000,
  roofDryMs: 172800000,
  splitMs: 5400000,
  weaveMsPerCm2: 720,
  weaveDryMgPerCm2: 45,
  sailGfPerCm2: 3,
  mastMm: 2500,
  mastMinDryMg: 2000000,
  mastMs: 600000,
  mastBaseGf: 40000,
  rigMs: 1800000,
  minRigCordMm: 8000,
  cordLoadMultiplier: 2,
  abrasionWorldMs: 3600000
});
export interface PlantMass {
  lotId: string;
  material: 'pandanus_standing_leaves'|'pandanus_leaves'|'pandanus_strips'|'pandanus_leaf_scrap'|'bamboo';
  dryMg: number;
  waterMg: number;
  lengthMm?: number
}
export interface SailMat {
  lotId: string;
  material: 'sail_mat';
  dryMg: number;
  waterMg: number;
  areaCm2: number;
  baseStrengthGf: number;
  torn: boolean;
  damage: {
    sunMs: number;
    shadeMs: number;
    rainMs: number
  }
}
export interface BambooMast {
  lotId: string;
  material: 'bamboo_mast';
  dryMg: number;
  waterMg: number;
  lengthMm: number;
  baseStrengthGf: number;
  broken: boolean
}
export function safe(n: bigint): number {
  check(n >= 0n && n <= BigInt(Number.MAX_SAFE_INTEGER), 'integer-overflow');
  return Number(n);
}
export function signed(n: bigint): number {
  check(n >= -BigInt(Number.MAX_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER), 'integer-overflow');
  return Number(n);
}
export const sum = (...n: number[]) => safe(n.reduce((a, b) => a+BigInt(b), 0n));
export const mulDiv = (a: number, b: number, c: number) => safe(BigInt(a)*BigInt(b)/BigInt(c));
export const ceilDiv = (a: number, b: number, c: number) => safe((BigInt(a)*BigInt(b)+BigInt(c)-1n)/BigInt(c));
export const copy = <T>(v: T): T => structuredClone(v);
export function choose(idValue: string) {
  check(idValue === SAIL_RAFT_ID, 'explicit-sail-assumption-required');
}
export function qualityPpm(seed: number, runId: string, lotId: string, purpose: string, min: number, range: number): number {
  check(uint(seed) && seed <= 0xffffffff && id(runId) && id(lotId), 'invalid-draw-context');
  return min+safe(BigInt(drawUint32(seed, runId, lotId, purpose))*BigInt(range+1)/4294967296n);
}
export function validateMat(m: SailMat) {
  check(shape(m, ['lotId', 'material', 'dryMg', 'waterMg', 'areaCm2', 'baseStrengthGf', 'torn', 'damage']) && id(m.lotId) && m.material === 'sail_mat'
  && uint(m.dryMg, 1) && uint(m.waterMg) && uint(m.areaCm2, 1) && BigInt(m.areaCm2)*45n === BigInt(m.dryMg) && uint(m.baseStrengthGf) && typeof m.torn === 'boolean', 'invalid-sail');
  check(shape(m.damage, ['sunMs', 'shadeMs', 'rainMs']) && Object.values(m.damage).every(v => uint(v)), 'invalid-sail-damage');
  sum(m.dryMg, m.waterMg);
}
export function sailStrength(m: SailMat): number {
  validateMat(m);
  return m.torn?0: integerDecayStrength(m.baseStrengthGf, 10n*(BigInt(m.damage.sunMs)+BigInt(m.damage.rainMs))+BigInt(m.damage.shadeMs), 10n*BigInt(SAIL_RULES.yearIslandMs), 0);
}
export function validateMast(m: BambooMast) {
  check(shape(m, ['lotId', 'material', 'dryMg', 'waterMg', 'lengthMm', 'baseStrengthGf', 'broken']) && id(m.lotId) && m.material === 'bamboo_mast'
  && uint(m.dryMg, SAIL_RULES.mastMinDryMg) && uint(m.waterMg) && m.lengthMm === 2500 && uint(m.baseStrengthGf) && typeof m.broken === 'boolean', 'invalid-mast');
  sum(m.dryMg, m.waterMg);
}
// Fixed one-degree trigonometric table, rounded to ppm. Coefficients are part of v1.
// No runtime floating trigonometry; windToDeg is where wind travels, not wind-from.
const COS = [1000000, 999848, 999391, 998630, 997564, 996195, 994522, 992546, 990268, 987688, 984808, 981627, 978148, 974370, 970296, 965926, 961262, 956305, 951057, 945519, 939693, 933580, 927184, 920505, 913545, 906308, 898794, 891007, 882948, 874620, 866025, 857167, 848048, 838671, 829038, 819152, 809017, 798636, 788011, 777146, 766044, 754710, 743145, 731354, 719340, 707107, 694658, 681998, 669131, 656059, 642788, 629320, 615661, 601815, 587785, 573576, 559193, 544639, 529919, 515038, 500000, 484810, 469472, 453990, 438371, 422618, 406737, 390731, 374607, 358368, 342020, 325568, 309017, 292372, 275637, 258819, 241922, 224951, 207912, 190809, 173648, 156434, 139173, 121869, 104528, 87156, 69756, 52336, 34899, 17452, 0] as const;
export const TRIG_SCALE = 1000000;
export function cosDeg(d: number): number {
  check(Number.isSafeInteger(d), 'integer-angle-required');
  const a = ((d%360)+360)%360;
  return a <= 90?COS[a]: a <= 180?-COS[180-a]: a <= 270?-COS[a-180]: COS[360-a];
}
export const sinDeg = (d: number) => cosDeg(90-d);
export const angleDelta = (wind: number, heading: number) => ((wind-heading+540)%360)-180;
export function equilibriumSpeedMmS(windMmS: number, areaCm2: number, offsetDeg: number): number {
  check(uint(windMmS) && uint(areaCm2, 1) && Number.isSafeInteger(offsetDeg), 'invalid-speed-input');
  if (Math.abs(offsetDeg)>60)return 0;
  const a = 9n*BigInt(areaCm2)*BigInt(cosDeg(offsetDeg)), b = 19218750n*1000000n, W = BigInt(windMmS);
  if (!a)return 0;
  if (a === b)return safe(W/2n);
  const N = a*b*W*W, q = integerSqrt(N);
  return safe(b>a?(q-a*W)/(b-a): (a*W-q-(q*q<N?1n: 0n))/(a-b));
}
/** Force quantized once DOWN to integer gf; standard gravity 9.80665. */
export function sailForceGf(areaCm2: number, apparentMmS: number): number {
  check(uint(areaCm2, 1) && uint(apparentMmS), 'invalid-force-input');
  return safe(72n*BigInt(areaCm2)*BigInt(apparentMmS)*BigInt(apparentMmS)/9806650000n);
}
