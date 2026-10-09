// Headless check (science final review 2026-10-09-lamp: the oil lamp, p40x 0.1.1), with the residents:
//  1 a fired dish of the lamp's form made the lamp dish (lampDishParams, standing in the hut: shelter 0.8, roofed 1)
//  2 a wick twisted from what the island has (WICK_RECIPES); not lit in the afternoon
//  3 lit at dusk, trimmed in the evening, put out at bedtime (the world clock): light the world counts, never told
//  4 what comes back: the clear oil left to the shelf, the water that sat under it to a jar of its own (accounted, not
//    in the oil), the oil soaked into the dish's wall kept with the dish
//  5 the next evening: the soaked oil goes in with the dish; a wick of a fibre not yet tried
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/lamp-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';

let now = Date.parse('2026-10-06T06:00:00Z');   // (15:00 on the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
Math.random = mulberry32(5);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
R.setBrain(null);
const lantern = R.list.find((r: any) => r.id === 'lantern'), lab = R.lab, V = R.village;
const hour = () => ((now / 3.6e6 + 9) % 24 + 24) % 24;
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; } if (until?.()) return true; } return false; };
const lots = (m: string) => Object.values(lab.lots).filter((l: any) => l.materialId === m) as any[];
const going = (r: any) => ['starting', 'running', 'needs-input'].includes(r?.status);
const lampRuns = () => Object.values(lab.runs).filter((r: any) => r.processId === 'p40x_oil_lamp') as any[];
// (the island as the oil chain leaves it: its cook pot, its oil — with a little water in it — and the husks and reeds about;
// and a small dish fired with the pot)
lab.equipment['eq:cook_pot'] = { equipmentId: 'eq:cook_pot', kind: 'cook_pot', catalogEntry: 'cook_pot', catalogVersion: 'x', condition: 1, params: { capacityMl: 3000 } };
addLot(lab, { materialId: 'fired_pot', amount: { value: 260_000, unit: 'mg' }, location: 'shelf', quality: { form: 3, capacity_ml: 100, surface_cm2: 160, absorption_ppm: 120_000, history_complete: 1 } });
addLot(lab, { materialId: 'coconut_oil', amount: { value: 67_000, unit: 'mg' }, location: 'shelf', quality: { x_coconut_fat_ppm: 990_000, x_water_ppm: 10_000, history_complete: 1 } });
addLot(lab, { materialId: 'coconut_husk', amount: { value: 600_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
addLot(lab, { materialId: 'reed', amount: { value: 3_000_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
{ // 1, 2
  step(3 * 3600, () => !!lab.equipment['eq:lamp_dish'] && lots('lamp_wick').length > 0);
  const d = lab.equipment['eq:lamp_dish'];
  want('1 the fired dish made the lamp dish, standing in the hut', !!d && d.params.capacityMl === 100 && d.params.shelter === 0.8 && d.params.roofed === 1 && d.params.massG > 0 && lots('fired_pot').length === 0, JSON.stringify(d?.params));
  const w = lots('lamp_wick')[0];
  want('2 a wick twisted from what the island has', !!w && [2, 3].includes(w.quality.fiber) && w.quality.diameter_mm >= 2, JSON.stringify(w?.quality));
  want('2 not lit in the afternoon', lampRuns().length === 0, `${hour().toFixed(1)} h`);
}
{ // 3, 4
  step(6 * 3600, () => lampRuns().length > 0);
  const lit = hour();
  want('3 lit at dusk', lampRuns().length === 1 && lit >= 18.3 && lit <= 21, `${lit.toFixed(1)} h`);
  const oilIn = lab.runs[lampRuns()[0]?.runId]?.lotIds.map((id: string) => lab.lots[id]).find((l: any) => l?.materialId === 'coconut_oil');
  step(7 * 3600, () => !!lampRuns()[0] && !going(lampRuns()[0]));
  const run = lampRuns()[0], log = V.lampLog[0];
  want('3 burned through the evening and put out at bedtime', run?.status === 'completed' && !!log && log.litS > 3600 && log.lumenS > 0, `${run?.status} ${run?.why ?? ''} lit ${((log?.litS ?? 0) / 3600).toFixed(1)} h, ${log?.lumenS ?? 0} lm·s`);
  const soaked = lots('coconut_oil').filter((l) => l.quality?.soaked_in_dish === 1), left = lots('coconut_oil').filter((l) => l.quality?.soaked_in_dish !== 1), water = lots('process_water');
  want('4 the oil soaked into the dish\'s wall kept with the dish', soaked.length === 1 && soaked[0].location === 'eq:lamp_dish', soaked.map((l) => `${l.amount.value / 1000}g @${l.location}`).join(','));
  want('4 the clear oil left back on the shelf', left.length >= 1 && left.every((l) => l.location === 'shelf' && (l.quality?.x_water_ppm ?? 0) === 0), left.map((l) => `${l.amount.value / 1000}g @${l.location}`).join(','));
  want('4 the water that sat under the oil in a jar of its own', water.length === 1 && water[0].location === 'jar:lamp' && water[0].amount.value > 0, water.map((l) => `${l.amount.value / 1000}g @${l.location}`).join(','));
  want('4 the lamp\'s words in its diary, not how long it burned', lantern.diary.some((e: any) => /灯皿にヤシ油を入れ/.test(e.text)) && !lantern.diary.some((e: any) => /lm|時間ともった/.test(e.text)), lantern.diary.filter((e: any) => /灯/.test(e.text)).map((e: any) => e.text).slice(-2).join(' / '));
  void oilIn;
}
{ // 5
  addLot(lab, { materialId: 'coconut_oil', amount: { value: 60_000, unit: 'mg' }, location: 'shelf', quality: { x_coconut_fat_ppm: 1_000_000, history_complete: 1 } });
  step(30 * 3600, () => lampRuns().length >= 2 && !going(lampRuns()[1]));
  const r2 = lampRuns()[1], ids: string[] = r2?.lotIds ?? [];
  want('5 the next evening: the soaked oil goes in with the dish', !!r2 && ids.some((id) => lab.lots[id]?.quality?.soaked_in_dish === 1 || V.lampLog.length >= 2), `${r2?.status} ${r2?.why ?? ''}`);
  want('5 a wick of a fibre not yet tried', V.lampLog.length >= 2 && V.lampLog[0].fiber !== V.lampLog[1].fiber, V.lampLog.map((x: any) => `fibre ${x.fiber}: ${x.lumenS} lm·s`).join(' / '));
}
R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('lampLog')) ?? '{}');
want('kept in the save', (saved.village?.lampLog?.length ?? 0) >= 2 && !!saved.lab?.equipment?.['eq:lamp_dish']);
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
