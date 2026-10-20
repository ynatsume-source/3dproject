// Headless check (bamboo brought from the island to the south with its quality, 2026-10-20: sail spec v2 §9.4, once the
// science side's bamboo tube 0.1.1 kept a cut bamboo whole, PR #52).
//  1 a raft load of bamboo is 7 kg, read by the sail's rules as 5 kg dry, 2 kg water, 6 m long
//  2 mass taken from it by hand (a rain catcher, a tool: takeMass) keeps dry, water and length in proportion: what is
//    left reads whole, the sum exact; all of it taken, the lot is gone
//  3 a lot without them (an old bamboo, raw clay) loses only its mass, its quality untouched
//  4 what is left after a rain catcher still makes a mast
//  5 part of a cord or fibre (its own codec) is refused, never left reading wrong; the whole of it may be taken
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/bamboo-carry-check.ts
import { ISLES, BAMBOO_SOUTH } from '../src/world/planet-map';
import { emptyLedger, addLot, takeMass } from '../src/world/process-runner';
import { readPlantMass } from '../src/world/sail-lots';
import { SAIL_RULES } from '../src/science/prototypes/sail-raft-rules';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const carry = ISLES.find((i) => i.id === 'south-near')!.carry!.find((c) => c.materialId === 'bamboo')!;
const L = emptyLedger('w', 'bamboo');
const lot = () => addLot(L, { materialId: 'bamboo', amount: { value: carry.mg, unit: 'mg' }, location: 'shelf', quality: { ...carry.quality! } });
{ // 1
  const p = readPlantMass(lot());
  want('1 a raft load: 7 kg, 5 dry, 2 water, 6 m', carry.mg === 7_000_000 && carry.quality === BAMBOO_SOUTH && p.dryMg === 5_000_000 && p.waterMg === 2_000_000 && p.lengthMm === 6_000, JSON.stringify(p));
}
{ // 2
  const l = lot(); takeMass(L, l, 2_000_000); const p = readPlantMass(l);
  want('2 a rain catcher taken: what is left reads whole, in proportion', l.amount.value === 5_000_000 && p.dryMg + p.waterMg === 5_000_000 && p.waterMg === Math.floor(2_000_000 * 5 / 7) && p.lengthMm === Math.floor(6_000 * 5 / 7), JSON.stringify(p));
  const o = lot(); takeMass(L, o, 1_234_567); const q = readPlantMass(o);
  want('2 an odd amount: still whole, the sum exact', q.dryMg + q.waterMg === 7_000_000 - 1_234_567 && q.dryMg > 0, JSON.stringify(q));
  const g = lot(); takeMass(L, g, 7_000_000);
  want('2 all of it taken: gone', !L.lots[g.lotId]);
}
{ // 3
  const old = addLot(L, { materialId: 'bamboo', amount: { value: 6_000_000, unit: 'mg' }, location: 'shelf' }); takeMass(L, old, 1_000_000);
  const clay = addLot(L, { materialId: 'raw_clay', amount: { value: 10_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 200_000 } }); takeMass(L, clay, 1_000_000);
  want('3 without dry and water: only the mass', old.amount.value === 5_000_000 && old.quality === undefined && readPlantMass(old).lengthMm === Math.floor(5_000_000 * 6000 / 7_000_000) && clay.amount.value === 9_000_000 && clay.quality?.water_ppm === 200_000);
}
{ // 4
  const l = lot(); takeMass(L, l, 2_000_000); const p = readPlantMass(l);
  want('4 the rest after a rain catcher still makes a mast', p.lengthMm >= SAIL_RULES.mastMm, `${p.lengthMm} mm`);
}
{ // 5
  const rope = addLot(L, { materialId: 'coir_rope', amount: { value: 1000, unit: 'mg' }, location: 'shelf', quality: { fiber_dry_mg: 900, attached_pith_dry_mg: 50, water_mg: 50 } });
  let refused = false; try { takeMass(L, rope, 400); } catch { refused = true; }
  const whole = addLot(L, { materialId: 'coir_rope', amount: { value: 1000, unit: 'mg' }, location: 'shelf', quality: { fiber_dry_mg: 900, attached_pith_dry_mg: 50, water_mg: 50 } }); takeMass(L, whole, 1000);
  want('5 part of a cord is refused (its own codec), the cord untouched; all of it may be taken', refused && rope.amount.value === 1000 && rope.quality?.fiber_dry_mg === 900 && !L.lots[whole.lotId]);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
