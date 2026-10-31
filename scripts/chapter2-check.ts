// Chapter 2 as the world keeps it (viewer design PROGRAM.md §2-2, CHAPTER2.md, D34). Headless, on controlled ground:
//   A no chapter 2 before chapter 1 has ended; with the south island's load in, it begins — none of its way done
//   B the firewood: done when the seasoned wood comes to a pit fire's (30 kg), every lot counted; green wood does not
//   C the lamp dish: done with a fired dish of the lamp's form, not cracked — not a pot of another form, not a cracked dish
//   D the oil: done with coconut oil on the island
//   E the way as the world goes, in the screen's order; the chapter ends with the first lamp; no chapter 2 on an island
//     whose first lamp was lit before it began (pure: world/chapter2.ts)
// (the pot fired and the first lamp are seen where the world does them: oil-chain-check, lamp-check)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/chapter2-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { addLot } from '../src/world/process-runner';
import { chapter2, WAY2 } from '../src/world/chapter2';

let now = Date.parse('2026-10-03T01:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };

Math.random = mulberry32(3);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
const V = R.village, lab = R.lab;
R.list.forEach((o: any, i: number) => { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; });
R.setBrain(null);
const run = (secs: number) => { for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); } };
const wood = (mg: number, water: number) => addLot(lab, { materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'shelf', quality: { water_ppm: water, history_complete: 1 } });
const pot = (form: number, crack: number) => addLot(lab, { materialId: 'fired_pot', amount: { value: 400_000, unit: 'mg' }, location: 'shelf', quality: { form, capacity_ml: form === 3 ? 150 : 3000, wall_mm: 6, crack, history_complete: 1 } });
const F = () => V.firsts as Record<string, number>;
{ // A
  run(31);
  const before = chapter2(V);
  V.firsts['south-load'] = now; run(31);
  const c = chapter2(V);
  want('A no chapter 2 before chapter 1 has ended; then it begins, none of its way done', before === null && !!c && c.began === F()['south-load'] && WAY2.every((s) => c.way[s] === null) && c.ended === null, JSON.stringify(c));
}
{ // B
  wood(20e6, 250_000); wood(45e6, 450_000); run(31);
  const notYet = F()['dry-wood'];
  wood(12e6, 280_000); run(31);
  want('B the firewood: done when the seasoned wood comes to a pit fire\'s, every lot counted; green wood does not', notYet === undefined && F()['dry-wood'] > F()['south-load'], `${notYet} → ${F()['dry-wood']}`);
}
{ // C
  pot(1, 0); pot(3, 1); run(31);
  const notYet = F()['lamp-dish'];
  pot(3, 0); run(31);
  want('C the lamp dish: a fired dish of the lamp\'s form, not cracked — not another form, not a cracked one', notYet === undefined && F()['lamp-dish'] > F()['dry-wood'], `${notYet} → ${F()['lamp-dish']}`);
}
{ // D
  const notYet = F().oil;
  addLot(lab, { materialId: 'coconut_oil', amount: { value: 30_000, unit: 'mg' }, location: 'shelf', quality: { x_coconut_fat_ppm: 1_000_000, scorch_ppm: 0, history_complete: 1 } }); run(31);
  want('D the oil: done with coconut oil on the island', notYet === undefined && F().oil > F()['lamp-dish'], `${notYet} → ${F().oil}`);
}
{ // E
  const c = chapter2(V)!;
  const order = WAY2.filter((s) => c.way[s] !== null).join(' ');
  const lit = chapter2({ firsts: { ...F(), 'fired-pot': F().oil + 1, light: F().oil + 2 } })!;
  const old = chapter2({ firsts: { 'south-load': 0, 'fired-pot': 0, light: 0 } }), before = chapter2({ firsts: { 'south-load': 5000, light: 4000 } });
  const notLit = chapter2({ firsts: { 'south-load': 0, 'fired-pot': 0 } })!;
  want('E the way as the world goes; the chapter ends with the first lamp; none where the lamp was lit before it began', order === 'wood dish oil' && c.ended === null && lit.ended === F().oil + 2 && WAY2.every((s) => lit.way[s] !== null)
    && old === null && before === null && notLit.began === 0 && notLit.ended === null, `${order}; ended ${lit.ended}; old ${JSON.stringify(old)} ${JSON.stringify(before)}`);
}
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
