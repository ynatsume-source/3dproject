// Science team soak on the real island (2026-10-21): Kayama's land and water as built (buildOcean), the residents' minds a
// seeded stand-in that prefers the husk / cord / sail / voyage work; HOURS open, CLOSE closed, HOURS again. Hour rows.
import './node-land';
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
let now = Date.parse('2026-12-01T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>(), KEY = 'seaglass.residents.v1';
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(11);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const { loadIslandWeather, islandWeather } = await import('../src/world/island-time');
const { addLot } = await import('../src/world/process-runner');
const { writeCordBundle } = await import('../src/world/coir-cord-lots');
const { BAMBOO_SOUTH } = await import('../src/world/planet-map');
await loadIslandWeather();
const pickRng = mulberry32(2026);
const WORK = /^(husk|soak|takeout|beat|clear|cord|sail|voyage|survey|lash|craft|gather)/;
let calls = 0; const picks: Record<string, number> = {};
const keyOf = (id: string) => /^(sail|cord|voyage)/.test(id) ? id.split(':').slice(0, 2).join(':') : id.split(':')[0];
const make = () => {
  const oc: any = buildOcean(loc); const R: any = oc.residents;
  R.setBrain(async (i: any) => { calls++; const o = i.options ?? []; if (!o.length) return null;
    const ready = o.filter((x: any) => x.ready !== false), work = ready.filter((x: any) => WORK.test(x.id)), pool = work.length && pickRng() < 0.6 ? work : (ready.length ? ready : o), p = pool[Math.floor(pickRng() * pool.length)];
    picks[keyOf(p.id)] = (picks[keyOf(p.id)] ?? 0) + 1; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p.id] }; });
  return R;
};
const j = JSON.parse(readFileSync(process.env.SOAK_IN!, 'utf8')); for (const [k, v] of Object.entries(j.store)) store.set(k, v as string); now = j.now;
const R: any = make();
const v = R.village; console.log('pier', v.pier, 'bases', v.bases, 'posts', v.posts, 'deck', JSON.stringify(v.deck).slice(0, 200));
const tx = 40.88770459182257, tz = -79.5680355033236;
console.log('deck stand ground', loc.f(tx, tz).toFixed(2), 'walkCost', R.walkCost(tx, tz));
// (a coarse flood fill over walkCost from Dot's spot: is the stand reachable on foot at all?)
const sx = 62.55, sz = -143.9, step = 1; const key = (x: number, z: number) => `${x},${z}`;
const q: [number, number][] = [[Math.round(sx), Math.round(sz)]]; const seen = new Set([key(q[0][0], q[0][1])]); let best = 1e9, bestAt: any = null;
while (q.length) { const [x, z] = q.shift()!; const d = Math.hypot(x - tx, z - tz); if (d < best) { best = d; bestAt = [x, z]; }
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + a * step, Z = z + b * step, k = key(X, Z); if (seen.has(k) || Math.abs(X - sx) > 200 || Math.abs(Z - sz) > 200) continue; seen.add(k); if (isFinite(R.walkCost(X, Z))) q.push([X, Z]); } }
console.log('reachable cells', seen.size, 'closest to the stand', best.toFixed(1), 'm at', bestAt, 'ground there', loc.f(bestAt[0], bestAt[1]).toFixed(2));
for (let d = 0; d <= 6; d += 1) { const x = tx + (bestAt[0] - tx) * d / 6, z = tz + (bestAt[1] - tz) * d / 6; console.log(' line', d, x.toFixed(1), z.toFixed(1), 'ground', loc.f(x, z).toFixed(2), 'walk', R.walkCost(x, z)); }
