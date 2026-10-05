// Creatures through coral (owner report, 2026-10-05: fish swim through the round coral heads). Builds each sea as the
// app does, runs its life for three minutes with the camera drifting over the reef, and once a second takes every
// creature drawn within 40 m of the camera (each fish of each school, turtles, the rest: every instanced mesh that is
// not coral or rock, and the turtles' own meshes) and tests its position against the solid bodies of the coral colonies (each
// colony's own form, as in coral-overlap-check). Logged: the share of creature positions inside a coral colony.
// Want: under 0.5% in every sea.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/passthrough-check.ts [miyako kayama gbr]
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState } from '../src/time/clock';
import { CORAL_MAT } from '../src/ocean/models';
import { profileOf } from '../src/ocean/substrate';

// (solid bodies only: a branching colony and a sea fan are open lattices that small fish live in and weave through —
// damselfish shelter in the branches — so being among their branches is not passing through)
const KINDS = ['table', 'brain', 'mushroom', 'clam'];
const m = new THREE.Matrix4(), lp = new THREE.Vector3(), p = new THREE.Vector3();
let bad = 0;
const want = process.argv.slice(2);
for (const id of want.length ? want : ['miyako', 'kayama', 'gbr']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  if (loc.land) await loadLand(id, loc.land.half, loc.land.far);
  const oc: any = buildOcean(loc);
  oc.eco.setSky(skyState(Date.UTC(2026, 8, 29, 3) - loc.tz * 3600000 + 9 * 3600000, loc), new THREE.Vector2(0.3, 0.1));
  // the coral bodies, in a hash
  const corals = new Set<any>(), C = 3, H = new Map<string, any[]>();
  for (const c of oc.cells) if (!c.big && Object.values(CORAL_MAT).includes(c.mesh.material)) corals.add(c.mesh);
  const rocks = new Set<any>(oc.cells.filter((c: any) => c.big).map((c: any) => c.mesh));
  for (const mesh of corals) {
    const kind = Object.keys(CORAL_MAT).find((k) => (CORAL_MAT as any)[k] === mesh.material)!;
    if (!KINDS.includes(kind)) continue;
    const pr = profileOf(mesh.geometry);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); const e = m.elements, s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10]));
      const b = { x: e[12], z: e[14], R: Math.max(...pr.r) * s, inv: m.clone().invert(), pr, fan: kind === 'fan' };
      const k = Math.floor(b.x / C) + ',' + Math.floor(b.z / C); (H.get(k) ?? H.set(k, []).get(k)!).push(b);
    }
  }
  const inCoral = (w: THREE.Vector3) => {
    for (let i = Math.floor((w.x - 4) / C); i <= Math.floor((w.x + 4) / C); i++) for (let j = Math.floor((w.z - 4) / C); j <= Math.floor((w.z + 4) / C); j++) for (const b of H.get(i + ',' + j) ?? []) {
      if (Math.hypot(w.x - b.x, w.z - b.z) > b.R) continue;
      lp.copy(w).applyMatrix4(b.inv);
      const t = (lp.y - b.pr.lo) / b.pr.h; if (t < 0.05 || t > 0.95) continue;
      const r = b.pr.r[Math.min(b.pr.r.length - 1, Math.floor(t * b.pr.r.length))] * 0.75;
      if (b.fan ? Math.abs(lp.z) < 0.04 && Math.hypot(lp.x, lp.z) < r : Math.hypot(lp.x, lp.z) < r) return true;
    }
    return false;
  };
  const cam = new THREE.Vector3();
  let n = 0, inside = 0; const who: Record<string, number> = {};
  const dt = 1 / 20;
  for (let k = 0; k < 20 * 180; k++) {
    const t = k * dt, s = t * 0.004;
    const [px, pz] = loc.path ? loc.path(s) : [Math.cos(s) * 40, Math.sin(s) * 40];
    cam.set(px, Math.min(oc.T.top(px, pz) + 4, -2), pz);
    const [qx, qz] = loc.path ? loc.path(s + 0.01) : [Math.cos(s + 0.01) * 40, Math.sin(s + 0.01) * 40];
    const fx = qx - px, fz = qz - pz, fl = Math.hypot(fx, fz) || 1;
    oc.eco.step(dt, t, cam, fx / fl, fz / fl);
    if (k % 20 || t < 20) continue;
    oc.group.traverse((o: any) => {
      if (!o.isInstancedMesh || !o.visible || corals.has(o) || rocks.has(o) || o.userData?.jacks) return;
      if (o.instanceMatrix.usage !== THREE.DynamicDrawUsage) return;   // (what moves: the litter and shells on the sand stay put)
      if (Object.values(CORAL_MAT).includes(o.material)) return;
      const E = o.instanceMatrix.array as Float32Array, step = Math.max(1, Math.floor(o.count / 300));
      for (let i = 0; i < o.count; i += step) {
        if (!(Math.abs(E[i * 16]) + Math.abs(E[i * 16 + 2]) > 1e-6)) continue;
        p.set(E[i * 16 + 12], E[i * 16 + 13], E[i * 16 + 14]);
        if (p.distanceTo(cam) > 40) continue;
        n++; if (inCoral(p)) { inside++; if (process.env.DBG && inside % 200 === 1) console.log('  in', o.count, o.geometry.attributes.position.count, p.toArray().map((v: number) => v.toFixed(1)).join(','), 'floor', oc.T.h(p.x, p.z).toFixed(2), 'top', oc.T.top(p.x, p.z).toFixed(2)); const nm = o.name || o.material?.name || o.geometry?.type || 'mesh'; who[nm] = (who[nm] ?? 0) + 1; }
      }
    });
  }
  const pct = 100 * inside / Math.max(1, n), ok = pct < 0.5;
  if (!ok) bad++;
  console.log(`${id}: ${n} creature positions near the camera, ${pct.toFixed(2)}% inside a coral colony ${ok ? 'ok' : 'FAIL'}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
