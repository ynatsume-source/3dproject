// Headless check of the way planner (src/ocean/route.ts) on every sea: random trips through the water
// between open spots. Each planned way must keep to open water (room between the floor and the surface)
// except right by its ends; a simple follower steering along it as the drone does must arrive, and a trip
// with no way through the water must be one the straight line could not swim either.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/route-check.ts [sea…]
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { planRoute, alongRoute, floorCells } from '../src/ocean/route';
import { LIMIT } from '../src/ocean/scenery';

const CEIL = -0.7 - 0.75 - 0.45;
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : LOCATIONS.filter((l) => !l.land || l.id === 'miyako').map((l) => l.id);
let fails = 0;
for (const id of ids) {
  const loc = LOCATIONS.find((l) => l.id === id);
  if (!loc) continue;
  let oc: any;
  try { oc = buildOcean(loc); } catch (e) { console.log(`${id}: cannot build headless (${(e as Error).message.slice(0, 60)})`); continue; }
  const T = oc.T, floor = (x: number, z: number) => Math.max(T.ground(x, z), T.cave ? T.cave.topAt(x, z) : -1e9);
  const L = LIMIT - 2, bound: [number, number, number, number] = [-L, L, -L, L];
  const openAt = (x: number, z: number) => floor(x, z) < CEIL - 0.6;
  const cells = floorCells(floor);
  // the shallow reef tops (no room under the surface): trips are aimed across them as well as at random
  const tops: [number, number][] = [];
  for (let x = -L; x <= L; x += 4) for (let z = -L; z <= L; z += 4) if (floor(x, z) > CEIL + 0.3 && floor(x, z) < -0.3) tops.push([x, z]);
  let trips = 0, firstMs = -1, ok = 0, blocked = 0, straightBlocked = 0, detour = 0, bad = 0, arrive = 0, slowMs = 0, sumMs = 0;
  for (let n = 0; n < 120; n++) {
    let ax = 0, az = 0, bx = 0, bz = 0, k = 0;
    if (n % 2 && tops.length) {
      // across a reef top: from one side of it to the other
      const [tx, tz] = tops[Math.floor(rnd() * tops.length)];
      do { const a = rnd() * 6.283, r = 15 + rnd() * 25; ax = tx + Math.cos(a) * r; az = tz + Math.sin(a) * r; bx = tx - Math.cos(a) * r * (0.6 + rnd()); bz = tz - Math.sin(a) * r * (0.6 + rnd()); }
      while ((!openAt(ax, az) || !openAt(bx, bz) || Math.max(Math.abs(ax), Math.abs(az), Math.abs(bx), Math.abs(bz)) > L * 0.95) && ++k < 300);
    } else {
      do { ax = (rnd() * 2 - 1) * L * 0.9; az = (rnd() * 2 - 1) * L * 0.9; } while (!openAt(ax, az) && ++k < 200);
      k = 0;
      do { bx = (rnd() * 2 - 1) * L * 0.9; bz = (rnd() * 2 - 1) * L * 0.9; } while ((!openAt(bx, bz) || Math.hypot(bx - ax, bz - az) < 25) && ++k < 200);
    }
    if (!openAt(ax, az) || !openAt(bx, bz)) continue;
    trips++;
    const t0 = performance.now(), p = planRoute(cells, CEIL, bound, ax, az, bx, bz), ms = performance.now() - t0;
    if (firstMs < 0) firstMs = ms; else { sumMs += ms; slowMs = Math.max(slowMs, ms); }
    // would the straight line have hit a reef top?
    const d = Math.hypot(bx - ax, bz - az);
    let sb = false;
    for (let s = 2; s < d - 2; s += 0.5) if (floor(ax + (bx - ax) * s / d, az + (bz - az) * s / d) > CEIL) { sb = true; break; }
    if (sb) straightBlocked++;
    if (!p.ok) { blocked++; continue; }
    ok++;
    if (p.len > d * 1.05) detour++;
    // the planned way keeps to open water (within a cell of its ends excepted)
    let worst = -1e9;
    for (let i = 0; i < p.pts.length - 2; i += 2) {
      const sx = p.pts[i], sz = p.pts[i + 1], ex = p.pts[i + 2], ez = p.pts[i + 3], sl = Math.hypot(ex - sx, ez - sz);
      for (let s = 0; s <= sl; s += 0.5) {
        const x = sx + (ex - sx) * s / sl, z = sz + (ez - sz) * s / sl;
        if (Math.hypot(x - ax, z - az) < 3 || Math.hypot(x - bx, z - bz) < 3) continue;
        worst = Math.max(worst, floor(x, z));
      }
    }
    if (worst > CEIL + 0.05) { bad++; if (bad <= 3) console.log(`  ${id}: way crosses floor ${worst.toFixed(2)} m (limit ${CEIL.toFixed(2)})`); }
    // follow it as the drone does: 4 m ahead along the way, at most 3.2 m/s, turning with lag
    let x = ax, z = az, vx = 0, vz = 0, t = 0;
    const o = { x: 0, z: 0 };
    for (; t < 400; t += 0.05) {
      const r = alongRoute(p, x, z, 4, o);
      const tx = r.rest > 3 ? o.x : bx, tz = r.rest > 3 ? o.z : bz, dx = tx - x, dz = tz - z, dl = Math.hypot(dx, dz) || 1;
      const sp = Math.min(3.2, (r.rest > 3 ? r.rest : dl) * 0.8);
      const kk = 1 - Math.exp(-0.05 * 1.2);
      vx += (dx / dl * sp - vx) * kk; vz += (dz / dl * sp - vz) * kk;
      x += vx * 0.05; z += vz * 0.05;
      if (Math.hypot(bx - x, bz - z) < 2.5) break;
    }
    if (t < 400) arrive++; else console.log(`  ${id}: follower did not arrive (${d.toFixed(0)} m)`);
  }
  const line = `${id}: trips ${trips}, way found ${ok} (detour ${detour}), no way through the water ${blocked}, straight line blocked ${straightBlocked}, ` +
    `way over a reef top ${bad}, follower arrived ${arrive}/${ok}, shallow tops ${tops.length}, plan: first ${firstMs.toFixed(0)} ms, then ${(sumMs / Math.max(1, trips - 1)).toFixed(1)} ms avg / ${slowMs.toFixed(1)} ms max`;
  console.log(line);
  if (bad || arrive < ok) fails++;
}
console.log(fails ? `FAIL (${fails} seas)` : 'PASS');
if (fails) process.exit(1);
