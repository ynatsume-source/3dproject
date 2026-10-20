// Headless check (science soak 2026-10-20 on e759e76, its finding 2): split leaves too few for one mat — the one sail's
// area at the science side's weave mass — are never offered for weaving (59 weaves were refused in a row); enough are.
// Until the science side takes several lots together, a short lot waits. Test data only, in a ledger of its own.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sail-weave-offer-check.ts
import { emptyLedger, addLot } from '../src/world/process-runner';
import { makeSailHost, emptySailHostState } from '../src/robots/sail-host';
import { SAIL_RULES } from '../src/science/prototypes/sail-raft-rules';

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const L = emptyLedger('w', 'weave-offer'), state = emptySailHostState();
const at = (id: string, x: number) => ({ id, x, z: 0, reachM: 2 });
const host = makeSailHost({ lab: L, state: () => state, dev: [], roofed: () => true, wanted: () => true,
  placeSites: () => ({ trees: [at('site:sail-tree-0', 0), at('site:sail-tree-1', 10)], dry: at('site:sail-dry', 20), work: at('site:sail-work', 30) }) });
const need = 20_000 * SAIL_RULES.weaveDryMgPerCm2;
const strips = (lotId: string, dry: number) => addLot(L, { lotId, materialId: 'pandanus_strips', amount: { value: dry + dry / 4, unit: 'mg' }, location: 'site:sail-work', quality: { dry_mg: dry, water_mg: dry / 4, history_complete: 1, sail_codec: 1 } });
const weave = () => host.options('dot', 1_000_000).some((o) => o.id === 'sail:weave:work');
strips('lot:strips:half', need / 2);
want('a lot short of one mat: no weaving offered', !weave(), `${need / 2} of ${need} mg`);
strips('lot:strips:short', need - 1);
want('nor one a milligram short', !weave(), `${need - 1} mg`);
strips('lot:strips:whole', need);
want('a lot enough for the mat: weaving offered', weave(), `${need} mg`);
console.log(bad ? `FAIL ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
