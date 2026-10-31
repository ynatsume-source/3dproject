// Headless check (science, reviews/188-8bf9d1e stall-none.log: with the model away the pots dried at 74 hours and nothing
// more was made for 30 days — a pit fire takes 30 kg of dry wood, a drying pile 45 kg of green, and only 12.5 kg of wet
// branches came in 100 hours). On the real island of Dot's world, its habits alone, the hut and the raft done, two dry
// pots waiting and no firewood:
//  0 a piece in hand, the hut and the raft whole: it sets it down by the bench, its hands free for the axe
//  1 Dot fells trees near the hut for firewood — オオハマボウ only, never of the windbreak, kept as fuel stumps and said
//    so — and stops once there is green wood enough for a pile
//  2 Lantern piles it together, makes the woodpile's roof and sets it to dry (p15x)
//  3 with dry wood enough for a fire, or no pots waiting, no more felling for firewood
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/firewood-habit-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-08T07:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(17);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { addLot } = await import('../src/world/process-runner');
const { loadIslandWeather } = await import('../src/world/island-time'); await loadIslandWeather();   // (the drying runs on the island's recorded weather)
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const dot = R.list.find((r: any) => r.id === 'dot'), V = R.village, lab = R.lab, cam = new THREE.Vector3();
R.setBrain(null);
R.setWeather({ ok: true, at: 0, cloud: 0.3, rain: 0, code: 2, wind: 3, windDir: 90, gust: 5, pressure: 1012, typhoon: false, source: 'test', record: { station: 'test', at: '' } });
// (the hut up, the raft whole and the south island reached: the way's habits have nothing to do; two pots dried)
dot.stats.built = 24; V.raft.parts = 6; dot.holding = 'piece';   // (a piece in hand with nowhere to go: set down first — science, reviews/195-5ccc3a5 stall2c.log) V.map.seen['south-near'] = { word: 'x', at: 0 }; V.map.reached['south-near'] = { at: sim };
for (const k of Object.keys(lab.lots)) if (lab.lots[k].materialId === 'firewood') delete lab.lots[k];
for (let i = 0; i < 2; i++) addLot(lab, { materialId: 'dry_pot', amount: { value: 1_420_000, unit: 'mg' }, location: 'shelf', quality: { form: 1, capacity_ml: 3000, wall_mm: 8, dry_stage: 2, crack: 0, history_complete: 1 } });
const wood = () => Object.values(lab.lots).filter((l: any) => l.materialId === 'firewood') as any[];
const kg = (ls: any[]) => +(ls.reduce((n, l) => n + l.amount.value, 0) / 1e6).toFixed(1);
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { sim += 1000; cam.set(dot.pos.x, 30, dot.pos.z); R.update(1, sim, cam); if (i % 60 === 0) await Promise.resolve(); if (until?.()) return true; } return false; };
const felled = () => dot.diary.filter((e: any) => /林の.*を切り倒した/.test(e.text)).length;   // (trees of the wood near the hut: a sapling for the field is the farm's)
{ // 1
  await run(14 * 3600, () => kg(wood()) >= 45);
  want('0 the piece in hand set down by the bench first', dot.holding !== 'piece' && V.spare > 0, `holding '${dot.holding}', spare ${V.spare}`);
  want('1 Dot fells trees for firewood until there is green wood enough for a pile', kg(wood()) >= 45 && felled() >= 3, `${kg(wood())} kg from ${felled()} trees`);
  const fuel = V.felled.filter((f: any) => f.at >= Date.parse('2026-10-08T07:00:00+09:00'));
  want('1 felled to burn: オオハマボウ only, none of the windbreak, each kept as a fuel stump, and said so (D-charcoal-pit §6.2)', fuel.length >= 3 && fuel.every((f: any) => f.kind === 1 && f.fuel === 1)
    && dot.diary.filter((e: any) => /切り倒した/.test(e.text)).every((e: any) => /^薪にするため、林のオオハマボウを切り倒した（/.test(e.text)), `${fuel.map((f: any) => `${f.kind}${f.fuel ? 'f' : ''}`).join(' ')}; ${dot.diary.find((e: any) => /切り倒した/.test(e.text))?.text.slice(0, 60)}`);
  const n = felled(); await run(2 * 3600);
  want('1 then it stops', felled() === n, `${felled() - n} more`);
}
{ // 2
  const drying = () => V.labRuns.some((x: any) => x.processId === 'p15x_firewood_dry');
  await run(30 * 3600, drying);
  want('2 Lantern piles it, makes the woodpile\'s roof and sets it to dry', !!lab.equipment['eq:firewood_stack'] && drying(), `${wood().length} lot(s), ${kg(wood())} kg; roof ${!!lab.equipment['eq:firewood_stack']}; runs ${V.labRuns.map((x: any) => x.processId).join(',') || '—'}; ${R.list.find((r: any) => r.id === 'lantern').diary.slice(-3).map((e: any) => e.text).join(' / ').slice(0, 300)}`);
}
{ // 3
  for (const k of Object.keys(lab.lots)) if (lab.lots[k].materialId === 'dry_pot') delete lab.lots[k];
  for (const k of Object.keys(lab.lots)) if (lab.lots[k].materialId === 'firewood' && !lab.lots[k].reservedBy) delete lab.lots[k];
  const n = felled(); await run(6 * 3600);
  want('3 no pots waiting: no felling for firewood', felled() === n, `${felled() - n} more`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
