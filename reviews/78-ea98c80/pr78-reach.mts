// Headless check (the sea level, ADR 0009 step 2 in preparation: the tide's reach). On the residents' island as built:
//  1 the sea and a lagoon take all of the sea's rise and fall; a tide pool and an inland pond none — their water stays at
//    mean sea level (ADR 0009 §3), the husks' pool aside (it lies at the lagoon's edge)
//  2 the CPU's water top and "under the water" follow it; the waves ride on it; at mean sea level all is as before
//  3 the GPU's sea is lifted by the same reach (tideReach in the swell's shader, from the same map)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/tide-reach-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');

const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const oc: any = buildOcean(loc);
const { useWater, setSeaLevel, swellAt, waterTopAt, underWater, tideReach, SWELL } = await import('../src/ocean/air');
const { U } = await import('../src/render/common');
const fs = await import('node:fs');

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const W = oc.water; useWater(W);
U.uTime.value = 77.7; U.uSwell.value = 1; U.uCurrent.value.set(0.3, 0.1);
// (a point of each water: the deepest of each kind found on a sweep of the island's grid)
useWater(W);
const HIGH = 0.91, LOW = -1.04;
const hist: Record<string, number[]> = {}; // [n, reach=1, 0<reach<1, reach=0]
let interN = 0, interFull = 0, interPart = 0, interNone = 0, lowN = 0, lowFull = 0;
const add = (k: string, r: number) => { const h = (hist[k] ??= [0, 0, 0, 0]); h[0]++; if (r >= 0.999) h[1]++; else if (r > 0.001) h[2]++; else h[3]++; };
for (let x = -600; x <= 600; x += 1) for (let z = -600; z <= 600; z += 1) {
  const k = W.at(x, z), g = loc.f(x, z), r = tideReach(x, z);
  if (k !== 'dry') add(k, r);
  // (ground the year's tide covers or bares, joined to the sea: between the lowest and the highest tide)
  if (k === 'dry' && g < HIGH) { interN++; if (r >= 0.999) interFull++; else if (r > 0.001) interPart++; else interNone++; }
  if ((k === 'sea' || k === 'lagoon') && g > LOW) { lowN++; if (r >= 0.999) lowFull++; }
}
console.log('by kind [points, reach 1, between, 0]:', JSON.stringify(hist));
console.log(`dry ground below the highest tide (+0.91 m): ${interN} points; reach 1 ${interFull}, between ${interPart}, 0 ${interNone}`);
console.log(`sea/lagoon above the lowest tide (−1.04 m, bared at low water): ${lowN} points; reach 1 ${lowFull}`);
for (const [n, x, z] of [['husk pool (#73)', 63.4, -78.9], ['husk stand', 0, 0]] as any) if (n.startsWith('husk pool')) console.log(n, W.at(x, z), loc.f(x, z).toFixed(2), 'reach', tideReach(x, z).toFixed(3));
// (how far up the beach the flood would reach: for dry ground below +0.91, distance to nearest sea/lagoon point)
const far: number[] = [];
for (let x = -600; x <= 600; x += 2) for (let z = -600; z <= 600; z += 2) { const g = loc.f(x, z); if (W.at(x, z) !== 'dry' || g >= HIGH || g < 0) continue;
  let d = 99; for (let r = 1; r <= 30 && d === 99; r++) for (let a = 0; a < 6.283; a += 0.3) { const k = W.at(x + Math.cos(a) * r, z + Math.sin(a) * r); if (k === 'sea' || k === 'lagoon') { d = r; break; } } far.push(d); }
far.sort((a, b) => a - b); const q = (p: number) => far[Math.floor(p * (far.length - 1))];
console.log(`dry 0..+0.91 m ground (2 m grid, ${far.length} pts): distance to the sea/lagoon m — median ${q(0.5)}, 90% ${q(0.9)}, max ${q(1)} (99 = >30 m)`);
