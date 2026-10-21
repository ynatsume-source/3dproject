// Headless check (the sea level, ADR 0009 step 2 in preparation: the tide's reach). On the residents' island as built:
//  1 the sea and a lagoon take all of the sea's rise and fall; a tide pool and an inland pond none — their water stays at
//    mean sea level (ADR 0009 §3), the husks' pool aside (it lies at the lagoon's edge)
//  2 the CPU's water top and "under the water" follow it; the waves ride on it; at mean sea level all is as before
//  3 the GPU's sea is lifted by the same reach (tideReach in the swell's shader, from the same map)
//  4 the rising tide comes up the shore: at the year's highest (+0.91 m) at least 95% of the ground from 0 to 0.91 m
//    joined to the sea (on a 1 m grid of its own, through ground below the tide's top) is under the water (science B1)
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
const { TIDE_TOP_M } = await import('../src/ocean/water');
const { U } = await import('../src/render/common');
const fs = await import('node:fs');

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const W = oc.water; useWater(W);
U.uTime.value = 77.7; U.uSwell.value = 1; U.uCurrent.value.set(0.3, 0.1);
// (a point of each water: the deepest of each kind found on a sweep of the island's grid)
const pick: Record<string, [number, number]> = {};
// (the sea and the lagoon well inside, 3 m of the same all round; a pool or a pond, small, anywhere in it)
for (let x = -600; x <= 600; x += 1) for (let z = -600; z <= 600; z += 1) {
  const k = W.at(x, z); if (k === 'dry') continue;
  const inner = k === 'pool' || k === 'inland' || [[3, 0], [-3, 0], [0, 3], [0, -3]].every(([a, b]) => W.at(x + a, z + b) === k);
  if (inner && (!pick[k] || loc.f(x, z) < loc.f(...pick[k]))) pick[k] = [x, z];
}
const kinds = Object.keys(pick).sort();
want('1 found on the island', ['inland', 'lagoon', 'pool', 'sea'].every((k) => kinds.includes(k)), kinds.join(','));
const reach = Object.fromEntries(kinds.map((k) => [k, tideReach(...pick[k])]));
want('1 the sea and the lagoon all of it; a pool and a pond none', reach.sea === 1 && reach.lagoon === 1 && (reach.pool ?? 0) === 0 && (reach.inland ?? 0) === 0, JSON.stringify(reach));
const before = Object.fromEntries(kinds.map((k) => [k, swellAt(...pick[k])]));
setSeaLevel(0.8);
const top = Object.fromEntries(kinds.map((k) => [k, waterTopAt(...pick[k])])), lifted = Object.fromEntries(kinds.map((k) => [k, swellAt(...pick[k]) - before[k]]));
want('2 at +0.8 m: the water top 0.8 in the sea and the lagoon, 0 in a pool and a pond', top.sea === 0.8 && top.lagoon === 0.8 && (top.pool ?? 0) === 0 && (top.inland ?? 0) === 0, JSON.stringify(top));
want('2 the waves ride on it (the surface lifted by just that)', kinds.every((k) => Math.abs(lifted[k] - top[k]) < 1e-12), JSON.stringify(lifted));
const [sx, sz] = pick.sea, [px, pz] = pick.pool;
want('2 under the water: 0.5 m up in the sea yes, in a pool no', underWater(sx, sz, 0.5) && !underWater(px, pz, 0.5) && underWater(px, pz, -0.01), '');
setSeaLevel(0);
want('2 at mean sea level all as before', kinds.every((k) => swellAt(...pick[k]) === before[k] && waterTopAt(...pick[k]) === 0), '');
// (the GPU: the drawn sea lifted by uSeaH × tideReach, and the waterline view's surface the same)
const air = fs.readFileSync('src/ocean/air.ts', 'utf8'), split = fs.readFileSync('src/render/split.ts', 'utf8');
want('3 the GPU\'s sea lifted where the tide reaches, by the same map', /float tideReach\(vec2 p\)\{[^}]*texture2D\(uSeaK[^}]*\.g;/.test(SWELL) && /w\.y \+= swell\(p0, uTime, dist\)\.x \+ uSeaH \* tideReach\(p0\)/.test(air) && split.includes('uSeaH * tideReach(p)'), '');
{ // 4 (the ground joined to the sea, found here on a 1 m grid of its own: from the sea and the lagoons, through dry ground
  // below the tide's top; the year's highest tide, then lower ones)
  const R = 600, n = 2 * R + 1, at = (i: number, j: number) => i + j * n, h = new Float32Array(n * n), k = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = i - R, z = j - R, w = W.at(x, z); h[at(i, j)] = loc.f(x, z); k[at(i, j)] = w === 'sea' || w === 'lagoon' ? 1 : w === 'dry' ? 0 : 2; }
  const seen = new Uint8Array(n * n), q: number[] = [];
  for (let c = 0; c < n * n; c++) if (k[c] === 1) { seen[c] = 1; q.push(c); }
  for (let qi = 0; qi < q.length; qi++) { const c = q[qi], i = c % n, j = (c - i) / n;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const d = at(ii, jj); if (!seen[d] && k[d] === 0 && h[d] < TIDE_TOP_M) { seen[d] = 1; q.push(d); } } }
  const share = (level: number) => { setSeaLevel(level); let all = 0, under = 0;
    for (let c = 0; c < n * n; c++) if (seen[c] && k[c] === 0 && h[c] >= 0 && h[c] <= level) { all++; const i = c % n, j = (c - i) / n; if (underWater(i - R, j - R, h[c])) under++; }
    setSeaLevel(0); return { all, under, pc: 100 * under / Math.max(1, all) }; };
  const at91 = share(0.91), at60 = share(0.6), at30 = share(0.3);
  want('4 at +0.91 m: 95% or more of the shore joined to the sea from 0 to 0.91 m under the water', at91.all > 1000 && at91.pc >= 95, `${at91.pc.toFixed(1)}% of ${at91.all} m² (+0.6: ${at60.pc.toFixed(1)}%, +0.3: ${at30.pc.toFixed(1)}%)`);
  want('4 and the pools and ponds still at mean sea level', ['pool', 'inland'].every((kk) => { setSeaLevel(0.91); const v = waterTopAt(...pick[kk]); setSeaLevel(0); return v === 0; }));
}
console.log(bad ? `FAIL ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
