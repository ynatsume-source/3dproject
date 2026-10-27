// The first load from the island to the south (案 A, 2026-10-27; amounts: the science team's
// specs/early-science-bootstrap.md, cc6862d): 25 kg of clay and 7 kg of bamboo on the shelf by the hut, once.
//   new        a new island: 25 kg of raw clay and 7 kg of bamboo on the shelf, as the south island's own (its make-up,
//              the bamboo's dry matter and water), the mark in the save
//   again      saved and opened again: nothing more
//   short      a save from before, with 10 kg of clay, the pit already lined and 3 kg of bamboo: no clay (5 kg at most once
//              the pit is lined), 4 kg of bamboo
//   empty      a save from before with none: 25 kg and 7 kg
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/first-load-check.ts
import './node-land';
import * as THREE from 'three';
let sim = Date.parse('2026-12-04T10:00:00+09:00'); Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD; await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const { RAW_CLAY_SOUTH, BAMBOO_SOUTH } = await import('../src/world/planet-map');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const cam = new THREE.Vector3(0, 50, 0);
const open = () => { const oc: any = buildOcean(loc); oc.residents.setBrain(null); return oc.residents; };
const saved = () => { for (let i = 0; i < 25 * 10; i++) { sim += 100; R.update(0.1, sim, cam); } };   // (it saves every 20 s)
const kg = (id: string) => Object.values(R.lab.lots as Record<string, any>).filter((l) => l.materialId === id).reduce((n, l) => n + l.amount.value, 0) / 1e6;
const saveKey = () => [...store.keys()].find((k) => /residents/.test(k) && !/study/.test(k))!;
const edit = (f: (s: any) => void) => { const k = saveKey(), s = JSON.parse(store.get(k)!); f(s); store.set(k, JSON.stringify(s)); };
let fail = 0;
const row = (ok: boolean, text: string) => { if (!ok) fail++; console.log(`${text} — ${ok ? 'PASS' : 'FAIL'}`); };

// new
let R: any = open();
const clayLot: any = Object.values(R.lab.lots).find((l: any) => l.materialId === 'raw_clay'), bambooLot: any = Object.values(R.lab.lots).find((l: any) => l.materialId === 'bamboo');
row(kg('raw_clay') === 25 && kg('bamboo') === 7 && !!R.village.firstLoad && /^lot:south-near:first:/.test(clayLot?.lotId) && clayLot?.location === 'shelf'
  && Object.entries(RAW_CLAY_SOUTH).every(([k, v]) => clayLot.quality[k] === v) && bambooLot.quality.dry_mg === BAMBOO_SOUTH.dry_mg && bambooLot.quality.water_mg === BAMBOO_SOUTH.water_mg,
  `new: clay ${kg('raw_clay')} kg, bamboo ${kg('bamboo')} kg, ${clayLot?.lotId}, marked ${!!R.village.firstLoad}`);
// again
saved(); R = open();
row(kg('raw_clay') === 25 && kg('bamboo') === 7, `again: clay ${kg('raw_clay')} kg, bamboo ${kg('bamboo')} kg`);
// short
edit((s) => {
  s.village.firstLoad = null; s.village.clayPit = { at: sim, diameterCm: 60, depthCm: 25 };
  for (const [id, l] of Object.entries(s.lab.lots as Record<string, any>)) if (l.materialId === 'raw_clay' || l.materialId === 'bamboo') delete s.lab.lots[id];
  s.lab.lots['lot:old:1'] = { lotId: 'lot:old:1', materialId: 'raw_clay', amount: { value: 10e6, unit: 'mg' }, location: 'shelf', quality: { ...RAW_CLAY_SOUTH } };
  s.lab.lots['lot:old:2'] = { lotId: 'lot:old:2', materialId: 'bamboo', amount: { value: 3e6, unit: 'mg' }, location: 'shelf', quality: { ...BAMBOO_SOUTH, dry_mg: 2142857, water_mg: 857143 } };
});
R = open();
row(kg('raw_clay') === 10 && kg('bamboo') === 7 && R.village.firstLoad?.clayMg === 0 && R.village.firstLoad?.bambooMg === 4e6, `short: clay ${kg('raw_clay')} kg (added ${R.village.firstLoad?.clayMg / 1e6}), bamboo ${kg('bamboo')} kg (added ${R.village.firstLoad?.bambooMg / 1e6})`);
// empty
saved(); edit((s) => { s.village.firstLoad = null; s.village.clayPit = null; for (const [id, l] of Object.entries(s.lab.lots as Record<string, any>)) if (l.materialId === 'raw_clay' || l.materialId === 'bamboo') delete s.lab.lots[id]; });
R = open();
row(kg('raw_clay') === 25 && kg('bamboo') === 7, `empty: clay ${kg('raw_clay')} kg, bamboo ${kg('bamboo')} kg`);
process.exit(fail ? 1 : 0);
