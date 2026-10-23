// Headless check (science soak 2026-10-20, after #69): a fibre bundle with too little fibre for a use's length — a pot's
// hanging cord (1 m) or a raft's lashing (2 m), at the science side's fibre per strand length — is never offered for
// twisting to that length (insufficient-fiber 14 to 31 times a day); enough for one, that one only; and the bundle taken
// is one that has enough; nor fibre still wet (science soak 2026-10-21). Test data only, in a ledger of its own.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/cord-twist-offer-check.ts
import { emptyLedger, addLot } from '../src/world/process-runner';
import { makeCordHost, emptyCordHostState, CORD_USES } from '../src/robots/cord-host';
import { COIR_CORD_RULES } from '../src/science/prototypes/coir-cord-types';

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const L = emptyLedger('w', 'twist-offer'), state = emptyCordHostState();
const at = (id: string, x: number) => ({ id, x, z: 0, reachM: 2 });
const host = makeCordHost({ lab: L, state: () => state, dev: [], roofed: () => true, raftWhole: () => false, raftAt: () => null,
  placeSites: () => ({ dry: at('site:cord-dry', 0), work: at('site:cord-work', 10), hang: at('site:cord-hang', 20) }) });
const per = COIR_CORD_RULES.dryMgPerStrandMm, pot = CORD_USES.pot.mm * per, raft = CORD_USES.raft.mm * per;
const bundle = (lotId: string, dry: number) => addLot(L, { lotId, materialId: 'coir_fiber_bundle', amount: { value: dry + dry / 20, unit: 'mg' }, location: 'site:husk-work',
  quality: { fiber_dry_mg: dry - dry / 20, attached_pith_dry_mg: dry / 20, water_mg: dry / 20, history_complete: 1, codec_version: 1 } });
const twists = () => host.options('dot', 1_000_000).filter((o) => o.id.startsWith('cord:twist:')).map((o) => o.id.replace('cord:twist:', '')).sort().join(',');
bundle('lot:fiber:1', pot - 1);
want('too little for either length: no twisting offered', twists() === '', `${pot - 1} mg (pot ${pot}, raft ${raft})`);
bundle('lot:fiber:2', pot);
want('enough for a pot\'s cord, not a raft\'s: the pot\'s only', twists() === 'pot', twists());
bundle('lot:fiber:3', raft);
want('enough for a raft\'s too: both', twists() === 'pot,raft', twists());
host.beginWork('dot', 'twist', 'raft', { x: 10, z: 0 }, 1_000_000);
const run: any = Object.values(L.runs)[0], taken = run?.state?.data?.spec?.source?.lotId ?? run?.state?.data?.spec?.bundle?.lotId ?? JSON.stringify(run?.state?.data?.spec ?? {}).match(/lot:fiber:\d/)?.[0];
want('twisting a raft\'s length takes the bundle that has enough', !!run && taken === 'lot:fiber:3', String(taken));
{ // (fibre still wet: not offered, enough of it or not; dried — water a tenth of the dry or less — offered. Science soak
  // 2026-10-21, wet-fiber-cannot-twist)
  const W = emptyLedger('w', 'twist-wet'), st = emptyCordHostState();
  const h = makeCordHost({ lab: W, state: () => st, dev: [], roofed: () => true, raftWhole: () => false, raftAt: () => null,
    placeSites: () => ({ dry: at('site:cord-dry', 0), work: at('site:cord-work', 10), hang: at('site:cord-hang', 20) }) });
  const wet = (lotId: string, dry: number, water: number) => addLot(W, { lotId, materialId: 'coir_fiber_bundle', amount: { value: dry + water, unit: 'mg' }, location: 'site:husk-work',
    quality: { fiber_dry_mg: dry - dry / 20, attached_pith_dry_mg: dry / 20, water_mg: water, history_complete: 1, codec_version: 1 } });
  const tw = () => h.options('dot', 1_000_000).filter((o) => o.id.startsWith('cord:twist:')).length;
  wet('lot:wet:1', raft, raft / 2);
  want('fibre still wet: no twisting offered', tw() === 0, `water ${raft / 2} of ${raft} dry`);
  wet('lot:wet:2', raft, raft / 10 + 1);
  want('a milligram wetter than a tenth: none', tw() === 0);
  wet('lot:wet:3', raft, raft / 10);
  want('dried (a tenth or less): offered', tw() === 2);
}
console.log(bad ? `FAIL ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
