// The residents' fired pots as equipment (POT_FIRING_DESIGN.md ④, main's request 2): table civ-sci.fired-pot-assembly/1.
// Main assembles equipment from whole lots (ADR 0006: the equipment keeps a copy of each lot) and returns them as lots
// when it decides to; this file says what params the equipment gets and what the lots come back as.
//
//   cook pot   (kind cook_pot)   from one fired_pot of form 1 or 2: replaces fixture_cook_pot (boiling coconut milk)
//   tar retort (kind tar_retort) from two fired_pots, an upper one charged with wood and a lower one catching the tar:
//                                replaces fixture_tar_retort (charcoal and wood tar)
//   lamp dish  (kind lamp_dish)  from one fired_pot of form 3: for the oil lamp, later
// A pot with a crack (crack ≥ 1) is not assembled: it leaks (assumed rule). The params follow from the pot (all assumed):
//   heatCapJPerK = mass × cpCeramic; uaWPerK = outside surface × firedPotLossWPerM2K; capacityMl = the pot's.
//   heatShare (the share of the fire's heat that goes into the pot) depends on the hearth: a default, main may set it.
// Simple tools (no params that change the physics) are made by main from materials: TOOL_RECIPES below.

import type { LotView } from '../../world/science-contract';
import { pv } from '../params';
import { finite } from './common';
import { BULK_G_PER_ML } from './charcoal';
import { FIRED_POT } from './pit-fire';
import { potSherdsQuality } from './vessel';

export const FIRED_POT_ASSEMBLY_TABLE = 'civ-sci.fired-pot-assembly/1';
export const COOK_POT = 'cook_pot', TAR_RETORT = 'tar_retort', LAMP_DISH = 'lamp_dish';

function readFired(lot: LotView, forms: number[], what: string) {
  const q = lot.quality ?? {};
  if (lot.materialId !== FIRED_POT) throw new Error(`${what} is made from a ${FIRED_POT} lot (got ${lot.materialId})`);
  if (!forms.includes(q.form)) throw new Error(`${what} needs a pot of form ${forms.join(' or ')} (1 cook pot, 2 jar, 3 lamp dish)`);
  if (!finite(q.capacity_ml, 1, 1e5) || !finite(q.surface_cm2, 1, 1e6) || !finite(q.absorption_ppm ?? 0, 0, 1e6)) throw new Error(`${lot.lotId} needs capacity_ml, surface_cm2 and absorption_ppm`);
  if ((q.crack ?? 0) >= 1 || (q.crack_ppm ?? 0) > 0) throw new Error(`${lot.lotId} has a crack: a cracked pot leaks and is not assembled`);
  return { massG: lot.amount.value / 1000, capacityMl: q.capacity_ml as number, areaM2: q.surface_cm2 / 1e4, absorptionPpm: q.absorption_ppm ?? 0 };
}
const heatCap = (g: number) => Math.round(g * pv('cpCeramic'));
const loss = (m2: number) => Math.round(m2 * pv('firedPotLossWPerM2K') * 100) / 100;

/** A cook pot from one fired cook pot or jar. heatShare: the hearth's (three stones: about 0.2, assumed). */
export function cookPotParams(lot: LotView, o: { heatShare?: number } = {}): Record<string, number> {
  const p = readFired(lot, [1, 2], 'a cook pot');
  const heatShare = o.heatShare ?? pv('firedPotHeatShareCook');
  if (!finite(heatShare, 0, 1)) throw new Error('heatShare must be within 0..1');
  return { heatCapJPerK: heatCap(p.massG), uaWPerK: loss(p.areaM2), heatShare, capacityMl: p.capacityMl };
}

/** A tar retort from two fired pots: the upper one holds the charge, the lower one catches the tar. */
export function retortParams(upper: LotView, lower: LotView, o: { heatShare?: number; collectShare?: number } = {}): Record<string, number> {
  if (upper.lotId === lower.lotId) throw new Error('a retort takes two different pots');
  const u = readFired(upper, [1, 2], 'the upper pot of a retort'), l = readFired(lower, [1, 2], 'the lower pot of a retort');
  if (u.capacityMl < pv('firedRetortMinUpperMl')) throw new Error(`the upper pot holds the charge: at least ${pv('firedRetortMinUpperMl')} mL`);
  const heatShare = o.heatShare ?? pv('firedPotHeatShareRetort'), collectShare = o.collectShare ?? pv('firedRetortCollectShare');
  if (!finite(heatShare, 0, 1) || !finite(collectShare, 0, 1)) throw new Error('heatShare and collectShare must be within 0..1');
  // the lower pot must hold all a full charge can drip into it (Codex AS-A1): the retort step keeps no lower capacity,
  // so the pair is refused here. Bound: the fullest charge (BULK_G_PER_ML of the upper pot), all of it dry wood broken
  // down, tar and pyrolysis water at collectShare, counted 1 g = 1 mL (tar is denser than water, so this is generous).
  const maxDripMl = Math.ceil(u.capacityMl * BULK_G_PER_ML * (pv('tarYield') + pv('pyroWaterYield')) * collectShare);
  if (l.capacityMl < maxDripMl) throw new Error(`the lower pot holds ${l.capacityMl} mL: a full charge of the upper pot can drip up to ${maxDripMl} mL into it`);
  return { heatCapJPerK: heatCap(u.massG + l.massG), uaWPerK: loss(u.areaM2 + l.areaM2), heatShare, capacityMl: u.capacityMl, collectShare };
}

/** A lamp dish (for the oil lamp, later): how much oil it holds and how much its unglazed body soaks up. */
export function lampDishParams(lot: LotView): Record<string, number> {
  const p = readFired(lot, [3], 'a lamp dish');
  return { capacityMl: p.capacityMl, absorptionPpm: p.absorptionPpm, massG: Math.round(p.massG) };
}

/** The quality a fired pot goes back to, from the copy kept at assembly and the equipment's condition (as the sealed
 *  vessel's table: condition 1 → the copy; worn → the wear added to the crack index, capped; a crack shows). */
export function firedPotQualityOnReturn(copy: Record<string, number>, condition: number): Record<string, number> {
  if (!finite(condition, 0, 1)) throw new Error('condition must be within 0..1');
  if (condition >= 1) return { ...copy };
  return { ...copy, crack: Math.max(copy.crack ?? 0, 1), crack_ppm: Math.min(1e6, Math.round((copy.crack_ppm ?? 0) + (1 - condition) * 1e6)) };
}
/** Broken (condition 0, ADR 0006): the copy becomes pot_sherds of the same amount (the sealed vessel's form). */
export const firedPotSherdsQuality = (copy: Record<string, number>) => potSherdsQuality(copy);

/** A retort goes back as two lots (main's question: when it breaks, what does each pot become?). The retort has one
 *  condition, given by main (the charcoal step reports no wear: equipmentWear is empty). In this version the wear of
 *  normal use is put on the upper pot, which sits in the fire with the charge; the lower pot's own wear (hot vapour and
 *  tar, heating and cooling, knocks when taken out) is not modelled. This is an assumed allocation, not a result of the
 *  heat calculation (one temperature for both pots): the lower pot is not proven to stay cool. No dice.
 *  So the lower pot comes back as its copy, the upper one as firedPotQualityOnReturn, and at condition 0 the upper one
 *  is pot_sherds and the lower one whole. Not covered (Codex RT-C1, 7b23852 addendum): a fall, a flood, the lower pot
 *  itself broken, or equipment-lost (the retort gone, which pot unknown): main decides those, not this table.
 *  Only materialId and quality come back: main keeps each pot's own amount from assembly and settles each side once. */
export function retortPartsOnReturn(upperCopy: Record<string, number>, lowerCopy: Record<string, number>, condition: number):
  { upper: { materialId: string; quality: Record<string, number> }; lower: { materialId: string; quality: Record<string, number> } } {
  if (!finite(condition, 0, 1)) throw new Error('condition must be within 0..1');
  const upper = condition <= 0 ? { materialId: 'pot_sherds', quality: firedPotSherdsQuality(upperCopy) } : { materialId: FIRED_POT, quality: firedPotQualityOnReturn(upperCopy, condition) };
  return { upper, lower: { materialId: FIRED_POT, quality: { ...lowerCopy } } };
}

/** Tools main makes from materials (their kind is what the steps look for; no params change the physics).
 *  Masses assumed; stones and leaves are picked up where they lie (no lot). handSeconds at 15 W. */
export const TOOL_RECIPES = [
  { kind: 'fixture_coconut_tools', ja: 'ヤシの実を割る杭と石、削る貝、こす布', materials: [{ materialId: 'bamboo', mg: 1_500_000 }], picked: '石・二枚貝の殻・アダンの葉（布の代わりに編む）', handSeconds: 1800 },
  { kind: 'fixture_tar_brush', ja: 'タールの刷毛と栓', materials: [{ materialId: 'bamboo', mg: 200_000 }], picked: 'アダンの繊維（刷毛の毛）・木片（栓）', handSeconds: 900 },
  { kind: 'fixture_vessel_stand', ja: '器の台', materials: [{ materialId: 'bamboo', mg: 1_000_000 }], picked: '縛る蔓', handSeconds: 1200 },
  { kind: 'drying_rack', ja: '乾かす棚（試験片・器）', materials: [{ materialId: 'bamboo', mg: 3_000_000 }], picked: '縛る蔓', handSeconds: 2400 },
  { kind: 'firewood_stack', ja: '薪の山の屋根（covered 1）', materials: [{ materialId: 'bamboo', mg: 2_000_000 }], picked: '屋根を葺く葉', handSeconds: 2400 },
] as const;
