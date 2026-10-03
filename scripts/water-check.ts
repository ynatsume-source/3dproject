// Headless check (Kayama review A3): the kinds of water on Kayama's sea (src/ocean/water.ts), and the swell
// drawn on each. The hollows the review found cut off from the sea are not the sea, and no swell moves their
// water; the open sea keeps all of its swell; a lagoon some. Also: the residents' water is the sea's.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/water-check.ts
import './node-land';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { classifyWater } from '../src/ocean/water';
import { surfaceAt, useWater } from '../src/ocean/air';
import { U } from '../src/render/common';

const loc: any = LOCATIONS.find((l) => l.id === 'kayama')!;
await loadLand('kayama', loc.land.half, loc.land.far);
const t0 = performance.now();
const w = classifyWater(loc.f, loc.land.far);
console.log(`classified in ${(performance.now() - t0).toFixed(0)} ms; cells: ${Object.entries(w.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
useWater(w);
U.uSwell.value = 0.35 / 2.37; U.uCurrent.value.set(0.8, 0.6);
const range = (x: number, z: number) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k < 1200; k++) { U.uTime.value = k * 0.1; const y = surfaceAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; };
let bad = 0;
const want = (x: number, z: number, kinds: string[], swell: (r: number) => boolean, what: string) => {
  const k = w.at(x, z), r = range(x, z), ok = kinds.includes(k) && swell(r);
  if (!ok) bad++;
  console.log(`  (${x}, ${z}) floor ${loc.f(x, z).toFixed(2)}: ${k}, surface moves ${r.toFixed(3)} m — want ${what} ${ok ? 'ok' : 'FAIL'}`);
};
// the review's hollows cut off from the sea (SHORE_REVIEW.md §B)
for (const [x, z] of [[-83.5, -193.5], [271.5, 10.5], [709, -213]]) want(x, z, ['pool', 'inland'], (r) => r < 0.005, 'cut off, still');
// (a hollow of the far map 3 cells across, 5 cm deep: on this 2 m grid, land a few metres from the sea's edge,
// where only the last of the beach's run-up reaches)
want(389, -575, ['pool', 'inland', 'dry'], (r) => r < 0.03, 'not the sea, near still');
// open water off the island, and deep water near it
const open = range(0, 600), deep = [[0, 0], [-200, 200]].find(([x, z]) => loc.f(x, z) < -6);
want(0, 600, ['sea'], (r) => r > 0.2, 'the sea, all its swell');
if (deep) want(deep[0], deep[1], ['sea'], (r) => Math.abs(r - open) < 0.08, 'the sea, all its swell');
// a lagoon cell, if there is one: some of the swell, not all
let lag: [number, number] | null = null;
for (let x = -300; x <= 300 && !lag; x += 4) for (let z = -300; z <= 300 && !lag; z += 4) if (w.at(x, z) === 'lagoon' && [[4, 0], [-4, 0], [0, 4], [0, -4]].every(([a, b]) => w.at(x + a, z + b) === 'lagoon')) lag = [x, z];
if (lag) want(lag[0], lag[1], ['lagoon'], (r) => r > 0.02 && r < open * 0.6, 'a lagoon, some of the swell');
else console.log('  (no lagoon cell found)');
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
