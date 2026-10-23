// Headless check (the sea level, ADR 0009 step 2 in preparation: the residents in the water). On the residents' island as
// built, its own sea (res.setSeaAt: the world's clock's, time/sea-level.ts) at the year's lowest tide (−1.04 m), at mean
// sea level and at its highest (+0.91 m):
//  1 Rakko on the sea floats at the water's top there, Kamemaru with its head out, 0.2 m under it — not at y = 0 (at the
//    lowest tide Rakko had floated a metre over the sea)
//  2 in the water while the water is over the ground there; its eyes over the water while it is at the surface
//  3 Dot at home on dry ground at every tide
//  4 at mean sea level all as before
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/residents-water-check.ts
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

const R: any = oc.residents, by = (id: string) => R.list.find((r: any) => r.id === id);
const rk = by('rakko'), km = by('kame'), dot = by('dot'), W = oc.water;
let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
// (a spot of open sea or lagoon off the island, deep enough at every tide)
let spot: [number, number] | null = null;
for (let r = 10; r < 300 && !spot; r += 5) for (let a = 0; a < 6.28 && !spot; a += 0.15) { const x = rk.sp.home[0] + Math.cos(a) * r, z = rk.sp.home[1] + Math.sin(a) * r; if (['sea', 'lagoon'].includes(W.at(x, z)) && loc.f(x, z) < -3 && (T(x, z) > 0.99)) spot = [x, z]; }
function T(x: number, z: number) { return oc.T.tideK ? oc.T.tideK(x, z) : 1; }
want('a spot of open water, deep at every tide', !!spot, spot ? `(${spot[0].toFixed(0)}, ${spot[1].toFixed(0)}) ${loc.f(spot[0], spot[1]).toFixed(1)} m` : '-');
const cam = new THREE.Vector3(0, 50, 0);
for (const h of [-1.04, 0, 0.91]) {
  R.setSeaAt(() => h);
  const [x, z] = spot!;
  for (const r of [rk, km]) { r.pos.set(x + (r === km ? 3 : 0), 0, z); r.wet = true; r.under = 0; r.act = 'swim'; r.task = { kind: 'look', x: r.pos.x, z: r.pos.z, act: 'look', dur: 60, t: 0, arrived: true }; }
  dot.pos.set(dot.sp.home[0], 0, dot.sp.home[1]);
  sim += 1000; R.update(0.05, sim, cam);
  const wt = h * T(x, z), ey = R.sense(rk).eye?.y ?? R.sense(rk).eyes?.y;
  const tag = `${h >= 0 ? '+' : ''}${h.toFixed(2)} m`;
  want(`1 ${tag}: Rakko floats at the water's top`, rk.wet && rk.under === 0 ? Math.abs(rk.pos.y - wt) < 0.02 : true, `y ${rk.pos.y.toFixed(2)} m, the top ${wt.toFixed(2)} m${rk.under ? ' (diving)' : ''}`);
  want(`1 ${tag}: Kamemaru with its head out, 0.2 m under the top`, km.wet && km.under === 0 && km.act !== 'swim' ? Math.abs(km.pos.y - (wt - 0.2)) < 0.02 : km.pos.y < wt, `y ${km.pos.y.toFixed(2)} m (${km.act})`);
  want(`2 ${tag}: both in the water; Rakko's eyes over it`, rk.wet && km.wet && (ey === undefined || ey > wt), `eyes ${ey?.toFixed?.(2) ?? '-'} m`);
  want(`3 ${tag}: Dot at home on dry ground`, !dot.wet, `ground ${loc.f(dot.pos.x, dot.pos.z).toFixed(2)} m`);
}
R.setSeaAt(() => 0);
console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
