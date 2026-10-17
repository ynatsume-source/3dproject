import assert from 'node:assert/strict';
import { lookOf } from '../src/robots/worksite-looks';
import { writeCordPiece, writeCordBundle, readCordPiece } from '../src/world/coir-cord-lots';
import { createIntegerCordDamageModel } from '../src/science/prototypes/coir-cord-damage';
import { COIR_CORD_ASSUMPTION_ID as ID, COIR_CORD_RULES as R } from '../src/science/prototypes/coir-cord-types';
let s = 99; const r = (n: number) => { s = (s * 1103515245 + 12345) >>> 0; return Math.floor((s / 4294967296) * n); };
const Y = R.yearIslandMs; let n = 0, faded = 0, rubbed = 0, wet = 0;
for (let i = 0; i < 20000; i++) {
  // pieces: around the one-year boundary on purpose
  const sun = r(3) ? r(2 * Y) : Y - 5 + r(10), shade = r(2) ? 0 : r(12 * Y), ab = r(3) ? 0 : r(3);
  const inh = r(8) === 0 ? { faded: !!r(2), abraded: !!r(2) } : undefined;
  const p = { lotId: 'cord:x', material: r(2) ? 'coir_rope' : 'coir_strand', lengthMm: 1000, fiberDryMg: 5000 + r(20000), pithDryMg: r(5000), waterMg: r(3000), baseStrengthGf: 40000, damage: { sunMs: sun, shadeMs: shade, abrasions: ab }, ...(inh ? { inheritedWear: inh } : {}) } as any;
  const o = writeCordPiece(p, 'shelf', 1); const lot = { lotId: 'cord:x', materialId: o.materialId, amount: o.amount, quality: o.quality, location: 'shelf' } as any;
  const look = lookOf(lot)!.look;
  const m = createIntegerCordDamageModel(readCordPiece(lot), ID, { worldId: 'w', worldEpoch: 'e', runId: 'r', openedAtWorldMs: 0, openedAtIslandMs: 0 });
  const words = m.observe(m.start()).join('');
  const wFaded = words.includes('色あせている'), wRubbed = words.includes('擦れの跡がある');
  assert.equal(look === 'frayed', wFaded || wRubbed, `piece ${i} look=${look} words=${words}`);
  if (wFaded) faded++; if (wRubbed) rubbed++; n++;
  // bundles: wet look iff the science side refuses to twist it for wetness
  const b = { fiberDryMg: 1000 + r(50000), pithDryMg: r(8000), waterMg: r(2) ? r(20000) : 0 };
  const D = b.fiberDryMg + b.pithDryMg; if (r(2)) b.waterMg = Math.floor(D / 10) + r(3) - 1; if (b.waterMg < 0) b.waterMg = 0;
  const ob = writeCordBundle(b as any, 'shelf', 1); const bl = { lotId: 'cord:b', materialId: ob.materialId, amount: ob.amount, quality: ob.quality, location: 'shelf' } as any;
  const twistable = BigInt(b.waterMg) * 10n <= BigInt(D);
  assert.equal(lookOf(bl)!.look === 'wet', !twistable, `bundle ${i} ${JSON.stringify(b)}`); if (!twistable) wet++;
}
console.log(`PASS pieces ${n} (faded ${faded}, rubbed ${rubbed}) bundles ${n} (wet ${wet})`);
