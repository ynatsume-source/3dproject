// Headless check (the shelf in older saves, 2026-10-12): what a save kept on the shelf comes back once, never lost and
// never doubled, whichever shape the save has — test data only, made here in a stand-in localStorage:
//  1 a save from before the ledger (village.store only, no lab): its lots go to the lab as they were (6 kg of bamboo), the
//    raw clay given the island's make-up, village.store gone; kept through save → load → save
//  2 a save with the lab only: its lots as they were (raw clay without a make-up given one), nothing added
//  3 a save with both (a lab and a stray old store): the lab is the shelf; the store neither overwrites nor adds a lot
//  4 a lab with only raw clay and an old store: the store is not added (the lab is the shelf)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/save-migration-check.ts
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather } from '../src/world/island-time';
import { RAW_CLAY_SOUTH } from '../src/world/planet-map';

const now = Date.parse('2026-10-06T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
const KEY = 'seaglass.residents.v1';
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
Math.random = mulberry32(7);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const make = () => { const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']); R.setBrain(null); return R; };
const lot = (lotId: string, materialId: string, mg: number, quality?: Record<string, number>) => ({ lotId, materialId, amount: { value: mg, unit: 'mg' }, location: 'shelf', ...(quality ? { quality } : {}) });
const sums = (lots: Record<string, any>) => { const m: Record<string, number> = {}; for (const l of Object.values(lots)) m[l.materialId] = (m[l.materialId] ?? 0) + l.amount.value; return m; };
const same = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const show = (m: Record<string, number>) => Object.entries(m).sort().map(([k, v]) => `${k} ${v / 1e6} kg`).join(', ') || '(none)';
const clayOk = (lots: Record<string, any>) => Object.values(lots).filter((l: any) => l.materialId === 'raw_clay').every((l: any) => l.quality?.water_ppm === RAW_CLAY_SOUTH.water_ppm);

// (a normal save to start from, made by the residents themselves)
store.clear(); make().save();
const base = JSON.parse(store.get(KEY)!);
want('0 a normal save has a lab and no village.store', !!base.lab && base.lab.lots && !('store' in (base.village ?? {})), Object.keys(base.lab ?? {}).join(','));
/** Put a save of this shape in, load it, and return what the lab holds, after one more save → load as well. */
const roundTrip = (shape: (s: any) => void) => {
  const s = structuredClone(base); shape(s); store.clear(); store.set(KEY, JSON.stringify(s));
  const R1 = make(); const first = structuredClone(R1.lab.lots); R1.save();
  const saved = JSON.parse(store.get(KEY)!);
  const R2 = make(); const second = structuredClone(R2.lab.lots); R2.save();
  const third = JSON.parse(store.get(KEY)!).lab.lots;
  return { first, saved, second, third };
};

{ // 1
  const old = [lot('lot:south-near:0', 'bamboo', 6e6), lot('lot:south-near:1', 'raw_clay', 10e6), lot('lot:south-near:2', 'reed', 3e6)];
  const r = roundTrip((s) => { delete s.lab; s.village.store = old; });
  const want1 = { bamboo: 6e6, raw_clay: 10e6, reed: 3e6 };
  want('1 pre-lab store: its lots in the lab as they were (6 kg of bamboo)', same(sums(r.first), want1) && Object.keys(r.first).sort().join() === old.map((l) => l.lotId).sort().join(), show(sums(r.first)));
  want('1 the raw clay given the island\'s make-up', !!r.first['lot:south-near:1'] && clayOk(r.first),JSON.stringify(Object.values(r.first).find((l: any) => l.materialId === 'raw_clay')?.quality ?? null));
  want('1 village.store gone from the save, the lots in its lab', !('store' in r.saved.village) && same(sums(r.saved.lab.lots), want1), show(sums(r.saved.lab.lots)));
  want('1 save → load → save: nothing lost, nothing added', same(sums(r.second), want1) && same(sums(r.third), want1) && Object.keys(r.third).length === old.length, show(sums(r.third)));
}
{ // 2
  const lots = { 'lot:a': lot('lot:a', 'bamboo', 6e6), 'lot:b': lot('lot:b', 'raw_clay', 10e6), 'lot:c': lot('lot:c', 'firewood', 30e6, { water_ppm: 250_000 }) };
  const r = roundTrip((s) => { s.lab.lots = lots; delete s.village.store; });
  const want2 = { bamboo: 6e6, raw_clay: 10e6, firewood: 30e6 };
  want('2 lab only: its lots as they were', same(sums(r.first), want2) && Object.keys(r.first).length === 3 && r.first['lot:c'].quality.water_ppm === 250_000, show(sums(r.first)));
  want('2 the raw clay without a make-up given one', clayOk(r.first));
  want('2 save → load → save: nothing lost, nothing added', same(sums(r.third), want2) && Object.keys(r.third).length === 3, show(sums(r.third)));
}
{ // 3
  const lots = { 'lot:south-near:0': lot('lot:south-near:0', 'bamboo', 2e6), 'lot:x': lot('lot:x', 'raw_clay', 4e6) };
  const old = [lot('lot:south-near:0', 'bamboo', 6e6), lot('lot:south-near:1', 'reed', 3e6)];
  const r = roundTrip((s) => { s.lab.lots = lots; s.village.store = old; });
  const want3 = { bamboo: 2e6, raw_clay: 4e6 };
  want('3 both: the lab is the shelf; the store neither overwrites (bamboo 2 kg kept) nor adds (no reed)', same(sums(r.first), want3) && r.first['lot:south-near:0'].amount.value === 2e6 && Object.keys(r.first).length === 2, show(sums(r.first)));
  want('3 the raw clay given the island\'s make-up', clayOk(r.first));
  want('3 village.store gone; save → load → save the same', !('store' in r.saved.village) && same(sums(r.third), want3) && Object.keys(r.third).length === 2, show(sums(r.third)));
}
{ // 4
  const lots = { 'lot:y': lot('lot:y', 'raw_clay', 4e6) };
  const r = roundTrip((s) => { s.lab.lots = lots; s.village.store = [lot('lot:south-near:0', 'bamboo', 6e6)]; });
  want('4 a lab of raw clay only and an old store: the store not added', same(sums(r.first), { raw_clay: 4e6 }) && clayOk(r.first) && same(sums(r.third), { raw_clay: 4e6 }), show(sums(r.first)));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
