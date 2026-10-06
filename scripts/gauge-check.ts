// Headless check (owner's decision 2026-10-06: the typhoon forecast begins with the test barometer, Lantern's from the
// first): Lantern sets the gauge and reads it every few island hours from the replayed record; the readings go in its
// diary and the island's gauge log; the gauge left reading does not keep it from other work.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/gauge-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather } from '../src/world/island-time';

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
const lantern = R.list.find((r: any) => r.id === 'lantern');
for (let i = 0; i < 3600 * 4; i++) { now += 250; R.update(0.25, now, new THREE.Vector3(0, 50, 0)); }
const reads = lantern.diary.filter((e: any) => /試験用の気圧計を置いて読む：/.test(e.text));
want('started: Lantern set the gauge', lantern.diary.some((e: any) => /試験用の気圧計を置いて読む：始めた/.test(e.text)), lantern.diary.filter((e: any) => e.key === 'study').slice(0, 2).map((e: any) => e.text).join(' / '));
want('read every few island hours, from the record', reads.length >= 4 && reads.some((e: any) => /目盛り -?\d+/.test(e.text)), `${reads.length}: ${reads.slice(0, 4).map((e: any) => e.text.split('：')[1]).join(', ')}`);

if (bad) console.log('mind', !!R.mind(lantern), 'act', lantern.act, lantern.task?.kind, 'holding', lantern.holding, 'diary', lantern.diary.slice(-5).map((e: any) => e.text).join(' | '));
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
