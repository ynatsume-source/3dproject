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
for (const H of [0.3, 0.6, 0.91]) {
  let should = 0, does = 0, wrongDry = 0, pools = 0, poolsUnder = 0; const missDist: number[] = [];
  for (let x = -600; x <= 600; x += 1) for (let z = -600; z <= 600; z += 1) {
    const k = W.at(x, z), g = loc.f(x, z); if (k !== 'dry' || g < 0 || g >= H) continue;
    should++; if (H * tideReach(x, z) > g) does++; else wrongDry++;
  }
  console.log(`sea at +${H} m: dry ground between 0 and +${H} m: ${should} points, under the drawn water ${does} (${(100 * does / should).toFixed(0)}%), left dry ${wrongDry}`);
}
