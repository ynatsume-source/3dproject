// Headless check (science, reviews/192-193-a6d6199-f9f1af3 oil-none-1.log: with the model away the pots were fired at 107
// hours; the boil, begun before the evening gathering, was stopped at 18:54 — told as "the materials as they were" — and
// was not begun again: the pit fire had taken the dry wood, and wood was gathered only for pots). On the real island of
// Dot's world, its habits alone, the hut and the raft done, the cook pot standing and milk waiting, no oil, no firewood:
//  1 Dot fells trees for the boil's wood, and stops once there is green wood enough for a pile
//  2 with clear oil enough on the shelf, no felling for it
//  3 a fire tended by hand is not lit when its tender would soon be called away: two dry pots and a seasoned pile at
//    18:15 — neither the pit fire nor the boil lit before the evening gathering; the pit fire lit after it
//  4 the boil watched: the fire lowered as the milk stops boiling and fries, the pot taken off as the oil clears —
//    oil made, the wood it was given back but for what burnt; Lantern's diary in words, no ids
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/oil-wood-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-08T07:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(19);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { addLot } = await import('../src/world/process-runner');
const { recentScienceRuns } = await import('../src/world/science-records');
const { loadIslandWeather } = await import('../src/world/island-time'); await loadIslandWeather();   // (the processes run on the island's recorded weather)
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const dot = R.list.find((r: any) => r.id === 'dot'), lantern = R.list.find((r: any) => r.id === 'lantern'), V = R.village, lab = R.lab, cam = new THREE.Vector3();
R.setBrain(null);
R.setWeather({ ok: true, at: 0, cloud: 0.3, rain: 0, code: 2, wind: 3, windDir: 90, gust: 5, pressure: 1012, typhoon: false, source: 'test', record: { station: 'test', at: '' } });
// (the hut up, the raft whole and the south island reached; the pots fired and one made the cook pot — its params as the
// island's own came out, oil-chain-check — and the milk of a nut pressed, as p30x gives it)
dot.stats.built = 24; V.raft.parts = 6; V.map.seen['south-near'] = { word: 'x', at: 0 }; V.map.reached['south-near'] = { at: sim };
for (const k of Object.keys(lab.lots)) if (['firewood', 'dry_pot', 'green_pot', 'coconut_oil'].includes(lab.lots[k].materialId)) delete lab.lots[k];
lab.equipment['eq:cook_pot'] = { equipmentId: 'eq:cook_pot', kind: 'cook_pot', catalogEntry: 'cook_pot', catalogVersion: 'civ-sci-test-2', condition: 1, params: { heatCapJPerK: 938, uaWPerK: 1.87, heatShare: 0.2, capacityMl: 3000 } };
addLot(lab, { materialId: 'coconut_milk', amount: { value: 281_475, unit: 'mg' }, location: 'shelf', quality: { x_water_ppm: 638_689, x_coconut_fat_ppm: 267_785, x_plant_solids_ppm: 93_525, history_complete: 1 } });
const wood = () => Object.values(lab.lots).filter((l: any) => l.materialId === 'firewood') as any[];
const kg = (ls: any[]) => +(ls.reduce((n, l) => n + l.amount.value, 0) / 1e6).toFixed(1);
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { sim += 1000; cam.set(dot.pos.x, 30, dot.pos.z); R.update(1, sim, cam); if (i % 60 === 0) await Promise.resolve(); if (until?.()) return true; } return false; };
const felled = () => dot.diary.filter((e: any) => /林の.*を切り倒した/.test(e.text)).length;
const hm = (ms: number) => new Date(ms + 9 * 3.6e6).toISOString().slice(11, 16);
{ // 1
  await run(14 * 3600, () => kg(wood()) >= 45);
  want('1 Dot fells trees for the boil\'s wood until there is green wood enough for a pile', kg(wood()) >= 45 && felled() >= 3, `${kg(wood())} kg from ${felled()} trees`);
  const n = felled(); await run(2 * 3600);
  want('1 then it stops', felled() === n, `${felled() - n} more`);
}
{ // 2
  for (const k of Object.keys(lab.lots)) if (lab.lots[k].materialId === 'firewood' && !lab.lots[k].reservedBy) delete lab.lots[k];
  for (const x of [...V.labRuns]) if (x.processId === 'p15x_firewood_dry') { delete lab.runs[x.runId]; V.labRuns.splice(V.labRuns.indexOf(x), 1); }
  for (const k of Object.keys(lab.lots)) if (lab.lots[k].materialId === 'firewood') delete lab.lots[k];
  addLot(lab, { materialId: 'coconut_oil', amount: { value: 30_000, unit: 'mg' }, location: 'shelf', quality: { x_coconut_fat_ppm: 1_000_000, scorch_ppm: 0, history_complete: 1 } });
  const n = felled(); await run(4 * 3600);
  want('2 with clear oil enough on the shelf, no felling for it', felled() === n, `${felled() - n} more`);
  for (const k of Object.keys(lab.lots)) if (['coconut_oil', 'firewood'].includes(lab.lots[k].materialId)) delete lab.lots[k];
}
{ // 3
  const next1815 = (() => { let t = Date.parse(new Date(sim + 9 * 3.6e6).toISOString().slice(0, 10) + 'T18:15:00+09:00'); if (t <= sim) t += 86_400_000; return t; })();
  await run(Math.round((next1815 - sim) / 1000));
  for (let i = 0; i < 2; i++) addLot(lab, { materialId: 'dry_pot', amount: { value: 1_420_000, unit: 'mg' }, location: 'shelf', quality: { form: 1, capacity_ml: 3000, wall_mm: 8, dry_stage: 2, crack: 0, history_complete: 1 } });
  addLot(lab, { materialId: 'firewood', amount: { value: 34_663_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 250_000, history_complete: 1 } });
  const started = (re: RegExp) => lantern.diary.find((e: any) => re.test(e.text) && /始めた/.test(e.text) && e.at >= next1815);
  await run(4 * 3600, () => !!started(/野焼きする/));
  const fire = started(/野焼きする/), boil = started(/ヤシのミルクを煮て/);
  want('3 a fire is not lit when its tender would soon be called away: lit after the evening gathering, not before', !!fire && fire.at >= Date.parse(new Date(next1815 + 9 * 3.6e6).toISOString().slice(0, 10) + 'T21:00:00+09:00'), fire ? `${hm(fire.at)} ${fire.text.slice(0, 60)}` : 'never lit');
  want('3 nor the boil before it', !boil || boil.at >= (fire?.at ?? 0) || boil.at >= Date.parse(new Date(next1815 + 9 * 3.6e6).toISOString().slice(0, 10) + 'T21:00:00+09:00'), boil ? `${hm(boil.at)} ${boil.text.slice(0, 60)}` : 'no boil');
}
{ // 4
  // (the oil of a boil before the fire, if one ran, taken away; another nut's milk)
  for (const k of Object.keys(lab.lots)) if (lab.lots[k].materialId === 'coconut_oil') delete lab.lots[k];
  if (!Object.values(lab.lots).some((l: any) => l.materialId === 'coconut_milk')) addLot(lab, { materialId: 'coconut_milk', amount: { value: 281_475, unit: 'mg' }, location: 'shelf', quality: { x_water_ppm: 638_689, x_coconut_fat_ppm: 267_785, x_plant_solids_ppm: 93_525, history_complete: 1 } });
  addLot(lab, { materialId: 'firewood', amount: { value: 3_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 250_000, history_complete: 1 } });
  const n0 = lantern.diary.length; let took = 0;
  const startedNow = () => { const x = V.labRuns.find((q: any) => q.processId === 'p31x_coconut_oil_boil'); if (x && !took) took = (lab.runs[x.runId]?.lotIds ?? []).reduce((n: number, id: string) => n + (lab.lots[id]?.materialId === 'firewood' ? lab.lots[id].amount.value : 0), 0); };
  await run(6 * 3600, () => { startedNow(); return lantern.diary.slice(n0).some((e: any) => /ヤシのミルクを煮て油をとる：(できた|途中でやめた|うまくいかなかった)/.test(e.text)); });
  const boil = lantern.diary.slice(n0).map((e: any) => `${hm(e.at)} ${e.text}`).filter((t: string) => /ヤシのミルクを煮て/.test(t));
  const done = boil.find((t: string) => /できた（/.test(t)) ?? '', back = +(done.match(/薪 (\d+(?:\.\d+)?)g/)?.[1] ?? 0) * 1000;
  want('4 the boil watched: the fire lowered as it fries, the pot taken off as the oil clears — oil made', /火を弱めた/.test(boil.join()) && /鍋を火から下ろした/.test(boil.join()) && /できた（.*ヤシ油/.test(done), boil.join(' / ').slice(0, 600));
  want('4 the wood it was given comes back but for what the fire burnt (under a kilogram)', took > 0 && back > took - 1e6, `took ${(took / 1e6).toFixed(2)} kg, back ${(back / 1e6).toFixed(2)} kg`);
  const ids = lantern.diary.map((e: any) => e.text).filter((t: string) => /[a-z]+_[a-z_]+/.test(t));
  want('4 no ids in Lantern\'s diary', ids.length === 0, ids.slice(0, 3).join(' / ').slice(0, 300));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
