import assert from 'node:assert/strict';
import { addLot, emptyLedger, takeMass, canTakeMass } from '../src/world/process-runner';
let sd = 9; const rr = (n: number) => { sd = (sd * 1103515245 + 12345) >>> 0; return Math.floor((sd / 4294967296) * n); };
const qs: (Record<string, number> | undefined)[] = [undefined, {}, { dry_mg: 4, water_mg: 6 }, { fiber_dry_mg: 9, attached_pith_dry_mg: 1, water_mg: 0 }, { pith_dry_mg: 5, water_mg: 5 }, { future_x_mg: 1, dry_mg: 9 }, { water_ppm: 5 }];
let n = 0;
for (let k = 0; k < 5000; k++) {
  const L: any = emptyLedger('w', 'e'), amt = 1 + rr(1000), q = qs[rr(qs.length)];
  const lot = addLot(L, { materialId: 'm', amount: { value: amt, unit: 'mg' }, location: 'shelf', ...(q ? { quality: { ...q } } : {}) } as any);
  const mg = [0, -1, amt, amt + 1, 1 + rr(amt)][rr(5)], before = JSON.stringify(L);
  const can = canTakeMass(lot, mg);
  const partialCodec = !!q && Object.keys(q).some((x) => x.endsWith('_mg') && x !== 'dry_mg' && x !== 'water_mg');
  const expect = mg > 0 && mg <= amt && (mg === amt || !partialCodec);
  assert.equal(can, expect, `can k${k}`);
  let threw = false; try { takeMass(L, lot, mg); } catch { threw = true; }
  assert.equal(threw, !can); if (threw) assert.equal(JSON.stringify(L), before, 'untouched on refusal');
  else if (mg === amt) assert.ok(!L.lots[lot.lotId]); else assert.equal(L.lots[lot.lotId].amount.value, amt - mg);
  n++;
}
console.log(`PASS canTakeMass/takeMass agree on ${n} cases; refusals leave the ledger untouched`);
