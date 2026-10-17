import { addLot, emptyLedger, toClock } from '../src/world/process-runner';
import { applyCordLoad, type CordLoadLedger } from '../src/world/coir-cord-load';
import { writeCordPiece, readCordPiece } from '../src/world/coir-cord-lots';
import { COIR_CORD_ASSUMPTION_ID as ID } from '../src/science/prototypes/coir-cord-types';
import { currentIntegerCordStrength } from '../src/science/prototypes/coir-cord-damage';
const isl = (ms: number) => Math.round(toClock('island', ms)), t0 = 1_800_000_000_000, H = 3_600_000;
function run(chunkH: number, hours: number, shade: boolean) {
  const L: CordLoadLedger = emptyLedger('w:c', 'e:c');
  const p = { lotId: 'c', material: 'coir_rope', lengthMm: 1000, fiberDryMg: 15000, pithDryMg: 1000, waterMg: 1000, baseStrengthGf: 40000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } } as any;
  const o = writeCordPiece(p, 's', 1); addLot(L, { lotId: 'c', materialId: o.materialId, amount: o.amount, quality: o.quality, location: o.into! });
  let from = isl(t0);
  for (let h = chunkH; h <= hours; h += chunkH) { const t = t0 + h * H, to = isl(t); applyCordLoad(L, { commandId: `s${h}`, assumptionId: ID, lotId: 'c', worldAtMs: t, islandAtMs: to, event: { kind: 'exposure', fromIslandMs: from, toIslandMs: to, shade } }); from = to; }
  const q = readCordPiece(L.lots['c']); return `${JSON.stringify(q.damage)} S=${currentIntegerCordStrength(q)}`;
}
for (const shade of [false, true]) { const a = run(1, 48, shade), b = run(24, 48, shade), c = run(48, 48, shade); console.log(shade ? 'shade' : 'sun', a === b && b === c ? 'SAME' : 'DIFF', a, '|', b, '|', c); }
