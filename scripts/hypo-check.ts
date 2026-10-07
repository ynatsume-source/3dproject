// Headless check (ADR 0006, owner's decision ①: a flash of insight is free, the world says how it came out): from what
// any engineer knows (pressure falls before a storm) Lantern guesses that its test barometer will rise before a typhoon.
//  1 the guess comes after its own first readings; the mark it watches for is the highest of them and two more — no value
//    of the world's is in it
//  2 an alarm with no storm in the day after is wrong, and raises the mark; a hot day it notes, once
//  3 the replayed record's typhoon (island July 23rd–26th): the gauge rose in it, not before — counted as it came
//  5 the second flash, once warmth is noted: compare with the same time the day before (the day's warmth comes round
//    every day); its mark again from its own readings; the record's typhoon answers it too
//  4 the tallies alone say whether the guess holds (Lantern's mind, when on, is given the guess and its tallies)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/hypo-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';

let now = Date.parse('2026-10-07T12:30:00Z');   // (21:30 on the island: Lantern is up at night, and sets the gauge)
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
const lantern = R.list.find((r: any) => r.id === 'lantern'), said: string[] = [];
const push0 = lantern.diary.push.bind(lantern.diary);
lantern.diary.push = (e: any) => { if (/ひらめき|気圧計/.test(e.text) && !/試験用の気圧計/.test(e.text)) said.push(e.text); return push0(e); };
let firstMarks: number[] = [];
const end = Date.parse('2026-10-09T01:00:00Z');
while (now < end) {
  for (let i = 0; i < 60; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); }
  R.setWeather(islandWeather(now));
  if (!firstMarks.length && R.village.hypo) firstMarks = R.village.gaugeLog.filter((g: any) => g.mark !== undefined).map((g: any) => g.mark);
}
const h = R.village.hypo;
console.log(said.join('\n'));
const idea = said.find((t) => /^ひらめき/.test(t)) ?? '';
want('1 a guess from its own first readings', !!h && firstMarks.length >= 16 && new RegExp(`これまでの最高は${Math.max(...firstMarks)}。目盛りが${Math.max(...firstMarks) + 2}以上`).test(idea), idea.slice(0, 60));
const wrong = said.filter((t) => /台風は来なかった/.test(t));
want('2 an alarm with no storm after it is wrong, and the mark goes up', h?.falses >= 1 && wrong.length === h.falses && wrong.every((t) => /次からは\d+以上を待つ/.test(t)) && h.mark > Math.max(...firstMarks) + 2, `${h?.falses} wrong, now ${h?.mark}`);
want('2 a hot day noted once', said.filter((t) => /温まっても目盛りが上がるのかもしれない/.test(t)).length === (h?.heat ? 1 : 0));
const ty = h?.storms[0];
want('3 the record\'s typhoon: the gauge rose in it, not before', !!ty && ty.caught && ty.settled && h.hits === 1 && (h.leads[0] ?? 1) <= 0 && said.some((t) => /台風の中で、気圧計が/.test(t)) && said.some((t) => /前もってはわからなかった/.test(t)), JSON.stringify({ storms: h?.storms.length, hits: h?.hits, leads: h?.leads }));
const judged = h && (h.hits >= 2 && h.hits >= h.falses + h.misses ? 'held' : h.falses + h.misses >= 3 && h.hits * 2 < h.falses + h.misses ? 'doubted' : 'testing');
want('4 the tallies alone say whether it holds', h?.status === judged, `${h?.status} (${h?.hits}/${h?.falses}/${h?.misses})`);
const h2 = R.village.hypo2;
want('5 the second flash: the day before, at the same time', !!h2 && h2.kind === 'day' && said.some((t) => /ひらめき：温まっても目盛りが上がるなら、前の日の同じ時刻と比べればいい/.test(t)), h2 ? `day mark ${h2.mark}` : 'none');
want('5 the record\'s typhoon answers it too', !!h2 && h2.hits + h2.misses >= 1, JSON.stringify(h2 && { hits: h2.hits, falses: h2.falses, misses: h2.misses, leads: h2.leads }));
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
