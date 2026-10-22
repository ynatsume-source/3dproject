// Headless check (a way not found, science soak on the island 2026-10-21 B). On the residents' island as built:
//  1 the pier's way: from its landing on the shore along the deck as far as it is laid, all ground one walks on; Dot, a plank
//    in hand and six planks down, gets from home to the deck's end and lays the seventh (the paths' grid, a metre to the
//    cell, found no way along the deck that runs aslant of it — "no way" every few seconds, for hours)
//  2 a place walled round: no way to it, and not looked for again for a while — two minutes of tries, the island searched
//    once, not every five seconds
//  3 the pier walled off at its landing: the deck task comes to nothing three times, then is set aside and other work
//    chosen; the frames stay light
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/no-way-check.ts
import './node-land';
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';

let sim = Date.parse('2026-12-04T14:00:00+09:00');
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

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const cam = new THREE.Vector3(0, 50, 0);
// (an island with the pier six planks down, Dot at home with the seventh)
const island = () => {
  const R: any = buildOcean(loc).residents, v = R.village;
  v.pier = 'build'; v.bases = 4; v.posts = 4; v.deck = 6; R.pierHost.drawPier();
  const dot = R.list.find((r: any) => r.id === 'dot');
  dot.holding = 'plank'; dot.task = null; dot.pos.x = dot.sp.home[0]; dot.pos.z = dot.sp.home[1];
  return { R, v, dot };
};
const run = (R: any, s: number, each?: () => void) => { let worst = 0, sum = 0, slow = 0; for (let i = 0; i < s; i++) { sim += 1000; const t = performance.now(); R.update(1, sim, cam); const ms = performance.now() - t; sum += ms; worst = Math.max(worst, ms); if (ms > 150) slow++; each?.(); } return { mean: sum / s, worst, slow }; };
const ring = (R: any, x: number, z: number, rad: number) => { for (let a = 0; a < 6.28; a += 0.5 / rad) R.solids.add({ kind: 'rock', x: x + Math.cos(a) * rad, z: z + Math.sin(a) * rad, r: 0.45, y0: -5, y1: 5 }); };

{ // 1
  const { R, v, dot } = island(), P = R.pierHost;
  const [lx, lz] = P.landing(), [sx, sz] = P.plankStand(6);
  let worst = Infinity; for (let k = 0; k <= 40; k++) { const x = lx + (sx - lx) * k / 40, z = lz + (sz - lz) * k / 40; worst = Math.min(worst, P.G(x, z)); if (!isFinite(R.walkCost(x, z))) worst = -Infinity; }
  want('1 the pier\'s way, landing to the deck\'s end: ground one walks on all along', worst >= 0.3, `lowest ${worst.toFixed(2)} m, ${Math.hypot(sx - lx, sz - lz).toFixed(1)} m`);
  const r = run(R, 900, () => {});
  want('1 Dot, a plank in hand, from home to the deck\'s end: the seventh plank laid', v.deck === 7, `deck ${v.deck}, frames mean ${r.mean.toFixed(1)} ms`);
}
{ // 2
  const { R, dot } = island(); dot.holding = '';
  const h = dot.sp.home, tx = h[0] + 30, tz = h[1];
  ring(R, tx, tz, 3);
  const go = () => { if (!dot.task || dot.task.kind !== 'survey') dot.task = { kind: 'survey', x: tx, z: tz, act: 'look', dur: 5, t: 0, arrived: false }; };
  go(); const r = run(R, 120, go);
  const w = R.noWayHost.at(dot, tx, tz);
  want('2 a place walled round: no way to it', dot.went === 'no way' && !!w, `went ${dot.went}, tried ${w?.n ?? 0} times`);
  want('2 not looked for again for a while: one slow frame in two minutes of tries, not one every five seconds', r.slow <= 1 && w && w.n >= 3, `${r.slow} frames over 150 ms, worst ${r.worst.toFixed(0)} ms, mean ${r.mean.toFixed(1)} ms`);
}
{ // 3
  const { R, v, dot } = island(), P = R.pierHost;
  const [lx, lz] = P.landing(); ring(R, lx, lz, 3.2);
  const kinds: string[] = []; let last = '';
  const r = run(R, 1200, () => { const k = dot.task?.kind ?? ''; if (k && k !== last) kinds.push(k); last = k; });
  const decks = R.noWayHost.at(dot, ...P.plankStand(6))?.n ?? 0, other = kinds.filter((k) => k !== 'deck').length;   // (each try set out and found no way within the one frame)
  want('3 the pier walled off: the deck task set aside after three tries', decks === 3 && R.noWayHost.setAside(dot, ...P.plankStand(6)) && v.deck === 6, `no way to the deck's end ${decks} times in twenty minutes, set aside ${R.noWayHost.setAside(dot, ...P.plankStand(6))}`);
  want('3 other work chosen, the frames light', other >= 1 && r.mean < 20, `${other} other tasks (${[...new Set(kinds)].slice(0, 6).join(', ')}), mean ${r.mean.toFixed(1)} ms, ${r.slow} slow`);
}
console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
