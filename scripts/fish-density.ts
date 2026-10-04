// Diagnostic: how many fish are about the camera as the cruise goes on. Builds a sea headless, moves the camera
// along the default cruise path at about the cruise's speed for 30 minutes, and every 3 minutes counts the animals
// drawn (instances, coral left out) within 25 m and 50 m of it.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/fish-density.ts [sea]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!, oc: any = buildOcean(loc);
const ev = sunEvents(Date.UTC(2026, 9, 3, 1), loc); oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
const coral = new Set(oc.cells.flatMap((c: any) => [c.mesh, c.hi].filter(Boolean)));
const path = (s: number) => [110 * Math.sin(s * 0.9) + 22 * Math.sin(s * 2.3 + 1), -8 + 88 * Math.sin(s * 0.6 + 0.8) + 20 * Math.cos(s * 1.7)];
const cam = new THREE.Vector3(), m = new THREE.Matrix4();
let t = 0, s = 0.4;
const count = () => {
  let n25 = 0, n50 = 0; const by: Record<string, number> = {};
  oc.group.traverse((o: any) => {
    if (!o.isInstancedMesh || coral.has(o) || !o.visible) return;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const e = m.elements; if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 1e-6) continue; const d = Math.hypot(e[12] - cam.x, e[13] - cam.y, e[14] - cam.z); if (d < 50) { n50++; if (d < 25) { n25++; const k = o.name || o.material?.name || o.geometry?.uuid?.slice(0, 4); by[k] = (by[k] ?? 0) + 1; } } }
  });
  return { n25, n50 };
};
for (let min = 0; min <= 30; min += 1) {
  for (let k = 0; k < 600; k++) {   // a minute at 0.1 s, the camera along the cruise's path at ~0.8 m/s
    t += 0.1; s += 0.1 * 0.8 / 120;
    const [x, z] = path(s); cam.set(x, Math.min(-2, oc.T.top(x, z) + 4), z);
    const [x2, z2] = path(s + 0.01), fx = x2 - x, fz = z2 - z, fl = Math.hypot(fx, fz) || 1;
    oc.eco.step(0.1, t, cam, fx / fl, fz / fl);
  }
  if (min % 3 === 0) { const c = count(); console.log(`${String(min).padStart(2)} min  at (${cam.x.toFixed(0)}, ${cam.z.toFixed(0)}) floor ${oc.T.top(cam.x, cam.z).toFixed(1)}  within 25 m ${c.n25}, within 50 m ${c.n50}`); }
}
