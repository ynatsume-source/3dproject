// Headless check: the sea kept lived in about the camera (ecosystem.ts keepAbout, owner's choice B, 2026-10).
// Moves the camera along the default cruise's path for 30 minutes (as fish-density.ts) and wraps every group the
// ecosystem sends on: where it was taken from and where it was put down must both be out of sight at that moment
// (src/eco/unseen.ts: nothing comes out of nowhere). Counts the fish within 25 m every 30 s.
// Want: no group moved within sight; within 25 m, at most 2 of the 60 counts under 20 fish, and the median over
// 200 (the cruise used to go minutes with a handful).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/keep-about-check.ts [sea]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';
const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!, oc: any = buildOcean(loc);
const ev = sunEvents(Date.UTC(2026, 9, 3, 1), loc); oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
const coral = new Set(oc.cells.flatMap((c: any) => [c.mesh, c.hi].filter(Boolean)));
const path = (s: number) => [110 * Math.sin(s * 0.9) + 22 * Math.sin(s * 2.3 + 1), -8 + 88 * Math.sin(s * 0.6 + 0.8) + 20 * Math.cos(s * 1.7)];
const cam = new THREE.Vector3(), m = new THREE.Matrix4();
let fx = 0, fz = 1, moved = 0, seen = 0;
for (const f of oc.fish) if (f.movers) {
  const orig = f.movers;
  f.movers = () => orig().map((mv: any) => ({ ...mv, move(sx: number, sz: number, ax: number, az: number) {
    moved++;
    if (!unseen(oc, mv.x, mv.y, mv.z, cam, fx, fz, 4) || !unseen(oc, sx, mv.y, sz, cam, fx, fz, 4)) seen++;
    mv.move(sx, sz, ax, az);
  } }));
}
const near = () => {
  let n = 0;
  oc.group.traverse((o: any) => {
    if (!o.isInstancedMesh || coral.has(o) || !o.visible) return;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const e = m.elements; if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 1e-6) continue; if (Math.hypot(e[12] - cam.x, e[13] - cam.y, e[14] - cam.z) < 25) n++; }
  });
  return n;
};
let t = 0, s = 0.4;
const counts: number[] = [];
for (let k = 0; k < 18000; k++) {   // 30 minutes at 0.1 s
  t += 0.1; s += 0.1 * 0.8 / 120;
  const [x, z] = path(s); cam.set(x, Math.min(-2, oc.T.top(x, z) + 4), z);
  const [x2, z2] = path(s + 0.01), dx = x2 - x, dz = z2 - z, dl = Math.hypot(dx, dz) || 1; fx = dx / dl; fz = dz / dl;
  oc.eco.step(0.1, t, cam, fx, fz);
  if (k % 300 === 299) counts.push(near());
}
const sorted = [...counts].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)], low = sorted[0];
console.log(`${loc.id}: ${moved} groups sent on, ${seen} of them moved within sight; fish within 25 m every 30 s: lowest ${low}, median ${med}, highest ${sorted[sorted.length - 1]}`);
console.log(`  ${counts.join(' ')}`);
const thin = counts.filter((c) => c < 20).length;
console.log(`  counts under 20 fish: ${thin} of ${counts.length}`);
const ok = seen === 0 && thin <= 2 && med > 200;
console.log(ok ? 'PASS' : 'FAIL');
if (!ok) process.exit(1);
