import assert from 'node:assert/strict';
import { addLot, emptyLedger } from '../co/src/world/process-runner';
import { applyCordLoad, type CordLoadLedger } from '../co/src/world/coir-cord-load';
import { readCordPiece, writeCordPiece } from '../co/src/world/coir-cord-lots';
import { COIR_CORD_ASSUMPTION_ID as ID, type CoirPiece } from '../co/src/science/prototypes/coir-cord-types';
import { currentIntegerCordStrength } from '../co/src/science/prototypes/coir-cord-damage';
let s = 12345; const r = (n: number) => { s = (s * 1103515245 + 12345) >>> 0; return Math.floor((s / 4294967296) * n); };
const mass = (L: CordLoadLedger) => Object.values(L.lots).map(l => readCordPiece(l)).reduce((a, p) => a + p.fiberDryMg + p.pithDryMg + p.waterMg, 0);
let intact = 0, broken = 0, expo = 0;
for (let i = 0; i < 1500; i++) {
  const p: CoirPiece = { lotId: 'cord:f', material: 'coir_rope', lengthMm: 500 + r(8000), fiberDryMg: 5000 + r(40000), pithDryMg: r(5000), waterMg: r(4000),
    baseStrengthGf: 1000 + r(120000), damage: { sunMs: r(2_000_000_000), shadeMs: r(2_000_000_000), abrasions: r(12) } };
  const mk = () => { const L: CordLoadLedger = emptyLedger('w:f', 'e:f'); const o = writeCordPiece(p, 'site:c', 1); addLot(L, { lotId: p.lotId, materialId: o.materialId, amount: o.amount, quality: o.quality, location: o.into! }); return L; };
  // optional exposure first, then load at the threshold and just over it
  const L0 = mk(); let at = 10_000;
  if (r(2)) { const d = 1 + r(500_000_000); applyCordLoad(L0, { commandId: 'x', assumptionId: ID, lotId: 'cord:f', worldAtMs: 1000, islandAtMs: 1000 + d, event: { kind: 'exposure', fromIslandMs: 1000, toIslandMs: 1000 + d, shade: !!r(2) } }); expo++; at = 1000 + d + 1; }
  const S = currentIntegerCordStrength(readCordPiece(L0.lots['cord:f']));
  const base = JSON.stringify(L0), m0 = mass(L0);
  for (const [gf, wantIntact] of [[S, true], [S + 1, false]] as const) {
    if (gf <= 0) continue;
    const L = JSON.parse(base) as CordLoadLedger;
    const res = applyCordLoad(L, { commandId: 'load', assumptionId: ID, lotId: 'cord:f', worldAtMs: 2000, islandAtMs: at, event: { kind: 'load', gf } });
    if (wantIntact) { assert.deepEqual(res.lotIds, ['cord:f'], `intact at S i=${i}`); intact++; }
    else { assert.equal(res.lotIds.length, 2, `break at S+1 i=${i}`); assert.ok(!L.lots['cord:f']); broken++; }
    assert.equal(mass(L), m0, `mass i=${i}`);
    for (const o of res.observations) assert.ok(!/\d/.test(o), `digit in observation: ${o}`);
    const L2 = JSON.parse(base) as CordLoadLedger;
    applyCordLoad(L2, { commandId: 'load', assumptionId: ID, lotId: 'cord:f', worldAtMs: 2000, islandAtMs: at, event: { kind: 'load', gf } });
    assert.equal(JSON.stringify(L2), JSON.stringify(L), `determinism i=${i}`);
    const again = applyCordLoad(L, { commandId: 'load', assumptionId: ID, lotId: 'cord:f', worldAtMs: 2000, islandAtMs: at, event: { kind: 'load', gf } });
    assert.deepEqual(again.lotIds, res.lotIds, `replay i=${i}`);
  }
}
console.log(`PASS intact@S ${intact} broken@S+1 ${broken} withExposure ${expo}`);
