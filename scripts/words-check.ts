// Headless check (Kayama review B): what is said about a resident follows what it is really doing, and its
// diary claims no measurement it did not make. Real makeResidents() and makeDiaryBook() on controlled ground
// (as CLOCK_DIARY_DIAGNOSTICS.md §2–3): Rakko on its way to float is not yet floating; Lantern on its way to
// think is not yet thinking; Kamemaru's notebook shows no water temperature or clarity it never took, and a
// count only when it has one; Rakko's picture diary no weather it was never told.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/words-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { makeDiaryBook } from '../src/ui/diary';
import { mulberry32 } from '../src/core/math';

let now = Date.parse('2026-10-03T08:00:00Z');
Date.now = () => now;
Math.random = mulberry32(2601003);
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
const f = () => 2;
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0 }, ['テスト魚'], ['テスト鳥']);
let bad = 0;
const want = (what: string, ok: boolean, got: string) => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const by = (id: string) => R.list.find((r: any) => r.id === id);
R.list.forEach((x: any, i: number) => { x.pos.set(1000 + i * 100, 2, 1000); x.task = { kind: 'wander', x: x.pos.x, z: x.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; });
for (const [id, kind, notYet, z] of [['rakko', 'float', /浮かんでいる/, 0], ['lantern', 'think', /考えごとをしている/, 300]] as [string, string, RegExp, number][]) {
  const r = by(id); r.pos.set(0, 2, z); r.wet = false;   // (far apart: not stopping to talk)
  r.task = { kind, x: 30, z, act: kind === 'float' ? 'float' : 'think', dur: 1e9, t: 0, arrived: false };
  for (let i = 0; i < 10; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 6, 0)); }
  const st = R.status(r);
  want(`${id} on its way to ${kind} (act ${r.act}, arrived ${r.task?.arrived})`, !r.task?.arrived && !notYet.test(st), st);
}
// the diaries
const root: any = { innerHTML: '', hidden: true, addEventListener() {}, querySelector: () => null };
const book = makeDiaryBook(root);
const kame = by('kame'), rakko = by('rakko');
kame.diary = [{ at: now, key: 'watch', text: '浜で海を見ていた。目にとまる魚はいなかった。' }];
book.show(R, 'kame', 9);
want('Kamemaru, nothing measured', !/水温|透明度|見えた数|見分けた魚/.test(root.innerHTML), (root.innerHTML.match(/class="add">[^<]*/) ?? ['(no figures)'])[0]);
kame.diary = [{ at: now, key: 'watch', text: '浜で海を見ていた。テスト魚を見た。', obs: '見分けた魚 1種' }];
book.show(R, 'kame', 9);
want('Kamemaru, a count it made', /見分けた魚 1種/.test(root.innerHTML) && !/水温|透明度/.test(root.innerHTML), (root.innerHTML.match(/class="add">[^<]*/) ?? ['-'])[0]);
rakko.diary = [{ at: now, key: 'rest', text: '休んだ。' }];
book.show(R, 'rakko', 9);
want('Rakko, no weather given', !/てんき：(はれ|くもり)/.test(root.innerHTML), (root.innerHTML.match(/<header>.*?<\/header>/) ?? ['-'])[0].replace(/<[^>]+>/g, ' '));
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
