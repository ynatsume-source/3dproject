// Headless check (the sea level, ADR 0009 step 2 in preparation: what reads the sea's height). Each sea's life run for three
// minutes at the year's lowest tide (−1.04 m), at mean sea level and at its highest (+0.91 m), the sea's height set as the
// app sets it (setSeaLevel):
//  1 none of the sea's life above the still water — a breath, a ceiling, a leap's exit all from the water's top there, not
//    from y = 0 (at the lowest tide a sea snake breathing at y = −0.2 had been 0.8 m up in the air)
//    what comes to the top (to breathe, a leap) as near it at every tide as at mean sea level
//  2 at mean sea level all as before: the waters' top 0 everywhere, no map read (the many that ask each frame)
//  3 Kayama, with the island's water map (the three seas above have none: the sea's rise and fall reaches everywhere
//    there): a tide pool and an inland pond keep to mean sea level while the sea and the lagoon rise and fall; the life
//    there is in the sea's water, none above it, what comes to the top as near it at every tide; any in a pool's water
//    stays under mean sea level (science 2026-10-22, before the tide goes in). Known, and not yet counted: at the lowest
//    tide the coral heads that reach near mean sea level (−0.9 m) are out of the water, and what forages over the reef goes
//    up over one — where the reef is within 25 cm of the water's top, shown, not counted: the reef at low water is the
//    tide's own step (ADR 0009 step 3)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sea-readers-check.ts
import './node-land';
import * as THREE from 'three';
import { LOCATIONS, DOTWORLD } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { setSeaLevel, waterTopAt, useWater, tideReach } from '../src/ocean/air';
import { loadLand } from '../src/ocean/land';
import { mulberry32 } from '../src/core/math';
// (one seed, so a run is the same run each time: SEED=n for another)
Math.random = mulberry32(Number(process.env.SEED ?? 1));

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
// (in the air by nature: the birds, the flying fish out of the water)
const flies = (s: any) => s.kind === 'bird' || /トビウオ|カツオドリ|アジサシ|カモメ|ペリカン|グンカン/.test(s.label ?? '');
// (whose coming up to the top within three minutes is by chance: sea lions rest at it and haul out on rocks, a pod of
// dolphins breathes and leaps when it will — under the water at every tide, all the same; science 2026-10-22)
const byChance = (k: string) => /アシカ|イルカ/.test(k);
for (const id of ['miyako', 'gbr', 'galapagos']) {
  const hi: Record<string, Record<string, number>> = {};
  for (const h of [-1.04, 0, 0.91]) {
    const loc: any = LOCATIONS.find((l) => l.id === id)!, oc: any = buildOcean(loc); useWater(oc.water ?? null); setSeaLevel(h);
    const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc); oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
    const cam = new THREE.Vector3(0, h - 3, 0), top: Record<string, number> = hi[h] = {}; let t = 0;
    for (let k = 0; k < 1800; k++) {
      t += 0.1; oc.eco.step(0.1, t, cam, 0, -1);
      if (k % 10) continue;
      for (const s of oc.eco.subjects()) { if (flies(s)) continue; const p = s.pos(); if (!p) continue; const key = `${s.kind}:${s.label}`; top[key] = Math.max(top[key] ?? -1e9, p.y - waterTopAt(p.x, p.z)); }
    }
    const [k, v] = Object.entries(top).sort((a, b) => b[1] - a[1])[0] ?? ['-', -1e9];
    want(`1 ${id}, the sea at ${h >= 0 ? '+' : ''}${h.toFixed(2)} m: the sea's life under its water`, v <= 0.02, `highest ${k} ${v.toFixed(2)} m from the top, ${Object.keys(top).length} kinds`);
  }
  // (those that come to the top — to breathe, a leap — as near it at every tide as at mean sea level; the rest keep to the
  // reef, which does not move: nearer the top at low water, and a fish pushed up to its ceiling by a shallow reef at mean
  // sea level not at high water)
  const kinds = Object.keys(hi[0]).filter((k) => hi[0][k] > -0.45 && !byChance(k)), off = kinds.filter((k) => [hi[-1.04][k], hi[0.91][k]].some((v) => v !== undefined && Math.abs(v - hi[0][k]) > 0.15));
  want(`1 ${id}: what comes to the top, as near it at every tide`, off.length === 0, off.length ? off.map((k) => `${k} ${hi[0][k].toFixed(2)} → ${hi[-1.04][k]?.toFixed(2)} / ${hi[0.91][k]?.toFixed(2)}`).join(', ') : kinds.map((k) => `${k.split(':')[1]} ${hi[0][k].toFixed(2)}`).join(', '));
}
{ // 2
  setSeaLevel(0); let reads = 0;
  useWater({ tex: {}, tideK: () => { reads++; return 1; }, x0: 0, z0: 0, size: 1 } as any);
  const tops = Array.from({ length: 100 }, (_, i) => waterTopAt(i * 3.1, -i * 1.7));
  want('2 at mean sea level: the waters\' top 0 everywhere, no map read', tops.every((v) => v === 0) && reads === 0, `${reads} reads`);
  setSeaLevel(0.5); const t1 = waterTopAt(1, 1); setSeaLevel(0); useWater(null);
  want('2 off it: the map read', t1 === 0.5 && reads === 1, `${t1} m, ${reads} read`);
}
{ // 3
  const loc: any = DOTWORLD; await loadLand('kayama', loc.land.half, loc.land.far);
  const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
  const hi: Record<string, Record<string, number>> = {}, inPool: Record<string, { n: number; top: number }> = {};
  for (const h of [-1.04, 0, 0.91]) {
    const oc: any = buildOcean(loc), W = oc.water; useWater(W); setSeaLevel(h);
    if (h === 0.91) {   // (the map itself: a pool and a pond at mean sea level, the sea and the lagoon at the sea's)
      const cells: Record<string, number[]> = { sea: [], lagoon: [], pool: [], inland: [] };
      for (let x = W.x0 + 5; x < W.x0 + W.size; x += 9) for (let z = W.z0 + 5; z < W.z0 + W.size; z += 9) { const k = W.at(x, z); if (cells[k] && loc.f(x, z) < -0.3) cells[k].push(waterTopAt(x, z)); }
      const all = (k: string, v: number) => cells[k].length > 0 && cells[k].every((t) => Math.abs(t - v) < 1e-9);
      want('3 Kayama at +0.91 m: the sea and the lagoon at +0.91 m, a tide pool and an inland pond at 0 m', all('sea', 0.91) && all('lagoon', 0.91) && (cells.pool.length === 0 || all('pool', 0)) && (cells.inland.length === 0 || all('inland', 0)),
        Object.entries(cells).map(([k, v]) => `${k} ${v.length} cells`).join(', '));
    }
    const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc); oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
    const cam = new THREE.Vector3(0, h - 2, 0), top: Record<string, number> = hi[h] = {}, reef: Record<string, number> = {}; let t = 0;   // (in the sea off the island: its life goes with the camera)
    const pool = inPool[h] = { n: 0, top: -1e9 };
    for (let k = 0; k < 1200; k++) {
      t += 0.1; oc.eco.step(0.1, t, cam, 0, -1);
      if (k % 10) continue;
      for (const s of oc.eco.subjects()) {
        if (flies(s)) continue; const p = s.pos(); if (!p) continue;
        if (tideReach(p.x, p.z) < 0.01) { pool.n++; pool.top = Math.max(pool.top, p.y); }
        // (over a coral head the tide has left at or near the top — the reef at low water, step 3: shown, not counted)
        const key = `${s.kind}:${s.label}`, over = p.y - waterTopAt(p.x, p.z);
        if (oc.T.top(p.x, p.z) + 0.25 > waterTopAt(p.x, p.z)) reef[key] = Math.max(reef[key] ?? -1e9, over); else top[key] = Math.max(top[key] ?? -1e9, over);
      }
    }
    const [k, v] = Object.entries(top).sort((a, b) => b[1] - a[1])[0] ?? ['-', -1e9], [rk, rv] = Object.entries(reef).sort((a, b) => b[1] - a[1])[0] ?? ['', -1e9];
    want(`3 Kayama, the sea at ${h >= 0 ? '+' : ''}${h.toFixed(2)} m: its life under its water`, v <= 0.02, `highest ${k} ${v.toFixed(2)} m from the top, ${Object.keys(top).length} kinds${rk ? ` (not counted, over the reef the tide has left near the top: ${rk} ${rv.toFixed(2)} m)` : ''}`);
    want(`3 Kayama, the sea at ${h >= 0 ? '+' : ''}${h.toFixed(2)} m: any in a pool's water under mean sea level`, pool.n === 0 || pool.top <= -0.5, pool.n ? `${pool.n} sightings, highest y ${pool.top.toFixed(2)} m` : 'none in a pool');
  }
  const kinds = Object.keys(hi[0]).filter((k) => hi[0][k] > -0.45 && !byChance(k)), off = kinds.filter((k) => [hi[-1.04][k], hi[0.91][k]].some((v) => v !== undefined && Math.abs(v - hi[0][k]) > 0.15));
  want('3 Kayama: what comes to the top, as near it at every tide', off.length === 0, off.length ? off.map((k) => `${k} ${hi[0][k].toFixed(2)} → ${hi[-1.04][k]?.toFixed(2)} / ${hi[0.91][k]?.toFixed(2)}`).join(', ') : kinds.map((k) => `${k.split(':')[1]} ${hi[0][k].toFixed(2)}`).join(', ') || 'none near it');
  setSeaLevel(0); useWater(null);
}
console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
