// Headless check (owner's decision 2026-10-06: the typhoon forecast begins with the test barometer, Lantern's from the
// first): Lantern sets the gauge and reads it every few island hours from the replayed record; the readings go in its
// diary and the island's gauge log; the gauge left reading does not keep it from other work: it fetches coconuts from the
// top of the beach to the shelf, where the world makes them a lot (or finds one gone bad); with bamboo on the shelf it
// sets up a rain catcher, which the record's rain fills.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/island-science-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';

let now = Date.parse('2026-10-03T12:30:00Z');   // (21:30 on the island: after the fire, Lantern is up at night)
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
addLot(R.lab, { materialId: 'bamboo', amount: { value: 3e6, unit: 'mg' }, location: 'shelf' });   // (brought home from the near island)
const lantern = R.list.find((r: any) => r.id === 'lantern');
for (let i = 0; i < 3600 * 4; i++) { now += 250; R.update(0.25, now, new THREE.Vector3(0, 50, 0)); }
const reads = lantern.diary.filter((e: any) => /試験用の気圧計を置いて読む：/.test(e.text));
want('started: Lantern set the gauge', lantern.diary.some((e: any) => /試験用の気圧計を置いて読む：始めた/.test(e.text)), lantern.diary.filter((e: any) => e.key === 'study').slice(0, 2).map((e: any) => e.text).join(' / '));
want('read every few island hours, from the record', reads.length >= 4 && reads.some((e: any) => /目盛り -?\d+/.test(e.text)), `${reads.length}: ${reads.slice(0, 4).map((e: any) => e.text.split('：')[1]).join(', ')}`);

want('and meanwhile it takes coconuts to the shelf', lantern.diary.some((e: any) => /ヤシの実を棚に置いた|ヤシの実は中が腐っていた/.test(e.text)), lantern.diary.filter((e: any) => /ヤシの実/.test(e.text)).slice(0, 3).map((e: any) => e.text).join(' / '));
want('a rain catcher from the bamboo', lantern.diary.some((e: any) => /雨受けを作った/.test(e.text)), lantern.diary.filter((e: any) => /雨受け/.test(e.text)).map((e: any) => e.text).join(' / '));
{ // a rainy stretch of the record: the catcher fills
  let t = now; while (t < now + 21 * 86_400_000 && !((islandWeather(t)?.rain ?? 0) >= 2)) t += 600_000;
  const before = (Object.values(R.lab.lots) as any[]).filter((l) => l.materialId === 'process_water').reduce((n, l) => n + l.amount.value, 0), mm = islandWeather(t)?.rain ?? 0;
  now = t; for (let i = 0; i < 60 * 4; i++) { now += 250; R.update(0.25, now, new THREE.Vector3(0, 50, 0)); }
  const after = (Object.values(R.lab.lots) as any[]).filter((l) => l.materialId === 'process_water').reduce((n, l) => n + l.amount.value, 0);
  const expect = Math.max(0, mm * (60 * 365 / 28 / 3600) - 0.5) * 0.8 * 1e6;   // (a real minute of island rain on 0.8 m², less the first half millimetre that wets the leaves)
  want('in the rain it fills: the record\'s rain on the funnel, on the island\'s clock', after - before > expect * 0.5 && after - before < expect * 2, `${mm} mm/h: +${((after - before) / 1e6).toFixed(3)} L (expected about ${(expect / 1e6).toFixed(3)})`);
}
{ const lots = Object.values(R.lab.lots) as any[], water = lots.filter((l) => l.materialId === 'process_water'), nuts = lots.filter((l) => l.materialId === 'coconut');
  console.log(`shelf: coconut ${nuts.map((l) => `${(l.amount.value / 1e6).toFixed(2)}kg`).join(',')}; water ${water.map((l) => (l.amount.value / 1e6).toFixed(2) + 'L').join(',') || 'none (no rain in this stretch)'}`);
  want('coconuts: a lot for each nut (a run takes a lot whole), weighed in whole mg', nuts.length >= 1 && nuts.every((l) => l.quality.count === 1 && Number.isInteger(l.amount.value)));
  want('rain water in whole mg, no more than 20 L', water.every((l) => Number.isInteger(l.amount.value) && l.amount.value <= 20e6)); }
if (bad) console.log('mind', !!R.mind(lantern), 'act', lantern.act, lantern.task?.kind, 'holding', lantern.holding, 'diary', lantern.diary.slice(-5).map((e: any) => e.text).join(' | '));
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
