import { addLot, emptyLedger, toClock } from '../src/world/process-runner';
import { applyCordLoad, type CordLoadLedger } from '../src/world/coir-cord-load';
import { writeCordPiece } from '../src/world/coir-cord-lots';
import { COIR_CORD_ASSUMPTION_ID as ID } from '../src/science/prototypes/coir-cord-types';
const L: CordLoadLedger = emptyLedger('w:g', 'e:g'); const N = 6;
for (let i = 0; i < N; i++) { const p = { lotId: `cord:${i}`, material: 'coir_rope', lengthMm: 1000, fiberDryMg: 15000, pithDryMg: 1000, waterMg: 1000, baseStrengthGf: 40000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } } as any;
  const o = writeCordPiece(p, 'site:cord-hang', 1); addLot(L, { lotId: p.lotId, materialId: o.materialId, amount: o.amount, quality: o.quality, location: o.into! }); }
const isl = (ms: number) => Math.round(toClock('island', ms));
const t0 = 1_800_000_000_000, size = () => JSON.stringify(L).length; const s0 = size(); const sun: Record<string, number> = {};
for (let i = 0; i < N; i++) sun[`cord:${i}`] = isl(t0);
let t = t0; const H = 3_600_000;
for (let h = 1; h <= 24 * 7; h++) { t = t0 + h * H; for (let i = 0; i < N; i++) { const id = `cord:${i}`, to = isl(t); applyCordLoad(L, { commandId: `sun:${id}:${sun[id]}:${to}`, assumptionId: ID, lotId: id, worldAtMs: t, islandAtMs: to, event: { kind: 'exposure', fromIslandMs: sun[id], toIslandMs: to, shade: true } }); sun[id] = to; }
  if (h === 24) console.log(`1 day: +${size() - s0} chars, runs ${Object.keys(L.runs).length}`); }
const per = (size() - s0) / (24 * 7 * N);
console.log(`7 days: +${size() - s0} chars (${N} cords hourly), per event ${per.toFixed(0)} chars; 30 days ≈ ${(per * 24 * 30 * N / 1e6).toFixed(2)} MB`);
const t1 = performance.now(); for (let i = 0; i < 20; i++) { const id = 'cord:0', to = isl(t + (i + 1) * H); applyCordLoad(L, { commandId: `x${i}`, assumptionId: ID, lotId: id, worldAtMs: t + (i + 1) * H, islandAtMs: to, event: { kind: 'exposure', fromIslandMs: sun[id], toIslandMs: to, shade: true } }); sun[id] = to; }
console.log(`one event now takes ${((performance.now() - t1) / 20).toFixed(1)} ms`);
