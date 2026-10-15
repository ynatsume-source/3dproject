/** Isolated owner assumptions, 2026-10-15. No production registration. */
export const COIR_CORD_ASSUMPTION_ID = 'owner-assumption/coir-cord/2026-10-15/v1' as const;
export const COIR_CORD_RULES = Object.freeze({
  id: COIR_CORD_ASSUMPTION_ID, evidence: 'owner-assumption-not-calibrated',
  dryIslandMs: 3 * 86400000, waterPerDryDenominator: 10,
  sieveWorldMs: 60000, sieveReferenceFiberMg: 72000,
  dryMgPerStrandMm: 5, twistMsPerMm: 120, plyMsPerMm: 60,
  strandStrengthGf: 40000, jitterMinPpm: 850000, jitterRangePpm: 300000,
  pithBaselinePpm: 100000, pithLimitPpm: 200000, pithPenaltyPpm: 300000,
  ropeLengthNumerator: 9, ropeLengthDenominator: 10,
  ropeStrengthNumerator: 255, ropeStrengthDenominator: 100,
  lengthToleranceDenominator: 10, yearIslandMs: 365 * 86400000,
});
export interface CoirMass { fiberDryMg: number; pithDryMg: number; waterMg: number }
export interface CoirBundle extends CoirMass { lotId: string }
export interface CoirPiece extends CoirMass {
  lotId: string; material: 'coir_strand' | 'coir_rope'; lengthMm: number;
  baseStrengthGf: number; inheritedWear?: {faded:boolean;abraded:boolean}; damage: {sunMs: number; shadeMs: number; abrasions: number};
}
export function cordAssert(ok: unknown, why: string): asserts ok { if (!ok) throw Error('coir cord: ' + why); }
export function cordInteger(x: unknown, min = 0): x is number { return typeof x === 'number' && Number.isSafeInteger(x) && x >= min; }
export const cordId = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
export function cordShape(v: unknown, keys: readonly string[]): v is Record<string, any> {
 return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
}
export function cordCanonical(v: any): string {
 if(Array.isArray(v))return '['+v.map(cordCanonical).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+cordCanonical(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
export function cordSum(...values: number[]): number {
 const n=values.reduce((a,b)=>a+BigInt(b),0n);
 cordAssert(n<=BigInt(Number.MAX_SAFE_INTEGER),'integer-overflow');return Number(n);
}
export function cordMass(v: CoirMass): void {
 cordAssert(v && cordInteger(v.fiberDryMg)&&cordInteger(v.pithDryMg)&&cordInteger(v.waterMg),'invalid-mass');
 cordSum(v.fiberDryMg,v.pithDryMg,v.waterMg);
}
