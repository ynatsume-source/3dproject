// Headless check (the sea level, ADR 0009 step 1: time/sea-level.ts). Want:
//  1 seaLevel(t) from the time alone: the same moment the same sea, whatever came before (as after a catch-up or a
//    reload), no draw of Math.random, nothing saved; step 1: 0 in every world, all year
//  2 one value for the GPU and the CPU: setSeaLevel puts it in U.uSeaH and under swellAt and surfaceAt (the drawn waves
//    on it, unchanged), and at 0 they are as before
//  3 tide pools and inland ponds keep to mean sea level (waterTop)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sea-level-check.ts
import { LOCATIONS, DOTWORLD } from '../src/data/locations';
import { seaLevel, waterTop } from '../src/time/sea-level';
import { setSeaLevel, swellAt, surfaceAt, seaHeight } from '../src/ocean/air';
import { U } from '../src/render/common';

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const worlds: any[] = [...LOCATIONS, DOTWORLD];
const t0 = Date.parse('2026-01-01T00:00:00+09:00'), times = Array.from({ length: 24 * 73 }, (_, i) => t0 + i * 5 * 3600e3 + (i % 7) * 60e3);
{ // 1
  let draws = 0; const keep = Math.random; Math.random = () => { draws++; return keep(); };
  const a = worlds.map((w) => times.map((t) => seaLevel(t, w)));
  const b = worlds.map((w) => [...times].reverse().map((t) => seaLevel(t, w)).reverse());   // (the other way round: nothing carried from call to call)
  Math.random = keep;
  want('1 the same moment, the same sea (whatever came before)', JSON.stringify(a) === JSON.stringify(b));
  want('1 no draw of Math.random', draws === 0, draws);
  let ls = 0; try { ls = Object.keys((globalThis as any).localStorage ?? {}).length; } catch { /* (none here) */ }
  want('1 nothing saved', ls === 0, ls);
  want('1 step 1: mean sea level in every world, all year', a.every((r) => r.every((h) => h === 0)), `${worlds.length} worlds × ${times.length} moments`);
}
{ // 2
  U.uTime.value = 123.4; U.uSwell.value = 1; U.uCurrent.value.set(0.3, 0.1);
  const pts = Array.from({ length: 50 }, (_, i) => [Math.cos(i) * i * 7, Math.sin(i * 1.3) * i * 5]);
  setSeaLevel(0); const s0 = pts.map(([x, z]) => swellAt(x, z)), f0 = pts.map(([x, z]) => surfaceAt(x, z));
  setSeaLevel(0.8); const s1 = pts.map(([x, z]) => swellAt(x, z)), f1 = pts.map(([x, z]) => surfaceAt(x, z));
  want('2 the GPU and the CPU have the one value', U.uSeaH.value === 0.8 && seaHeight() === 0.8);
  want('2 the waves ride on it, unchanged', s1.every((h, i) => Math.abs(h - s0[i] - 0.8) < 1e-12) && f1.every((h, i) => Math.abs(h - f0[i] - 0.8) < 1e-12));
  setSeaLevel(0); const s2 = pts.map(([x, z]) => swellAt(x, z));
  want('2 at 0, as before', s2.every((h, i) => h === s0[i]) && U.uSeaH.value === 0 && s0.some((h) => h !== 0));
}
{ // 3
  want('3 pools and ponds at mean sea level; the sea and the lagoon at the sea\'s', waterTop('pool', 0.8) === 0 && waterTop('inland', -0.9) === 0 && waterTop('sea', 0.8) === 0.8 && waterTop('lagoon', -0.9) === -0.9);
}
console.log(bad ? `FAIL ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
