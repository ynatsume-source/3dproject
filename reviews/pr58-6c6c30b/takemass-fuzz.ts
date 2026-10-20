import assert from 'node:assert/strict';
import { addLot, emptyLedger, takeMass } from '../src/world/process-runner';
import { readPlantMass } from '../src/world/sail-lots';
import { BAMBOO_SOUTH } from '../src/world/planet-map';
let sd = 5; const rr = (n: number) => { sd = (sd * 1103515245 + 12345) >>> 0; return Math.floor((sd / 4294967296) * n); };
let n = 0;
for (let k = 0; k < 2000; k++) {
  const L: any = emptyLedger('w', 'e'); const m = 1_000_000 + rr(20_000_000), d = 1 + rr(m - 1);
  const q = rr(4) ? { ...BAMBOO_SOUTH, dry_mg: d, water_mg: m - d, length_mm: 1 + rr(10000) } : { ...BAMBOO_SOUTH };
  const amt = q.dry_mg + q.water_mg; const l = addLot(L, { materialId: 'bamboo', amount: { value: amt, unit: 'mg' }, quality: q, location: 'shelf' } as any);
  let cur = amt;
  for (let i = 0; i < 4 && L.lots[l.lotId]; i++) { const take = 1 + rr(cur); takeMass(L, L.lots[l.lotId], take); cur -= take; if (!L.lots[l.lotId]) { assert.equal(cur, 0); break; }
    const p = readPlantMass(L.lots[l.lotId]); assert.equal(p.dryMg + p.waterMg, cur); assert.ok(p.dryMg > 0); n++; }
}
// a lot without quality: only its mass
{ const L: any = emptyLedger('w', 'e'); const l = addLot(L, { materialId: 'bamboo', amount: { value: 6_000_000, unit: 'mg' }, location: 'shelf' } as any); takeMass(L, l, 2_000_000); assert.equal(L.lots[l.lotId].amount.value, 4_000_000); assert.equal(L.lots[l.lotId].quality, undefined); }
console.log(`PASS takeMass: ${n} partial takes read whole by readPlantMass`);
