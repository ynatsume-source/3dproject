// Headless check (Kayama review A3): every coral colony fits under the water where it grows. Builds Kayama's
// sea on its real land (scripts/node-land.ts), reads each placed colony's top from its own geometry, and counts
// the colonies whose top stands above the line a colony may grow to (CORAL_CEIL below the mean surface) and
// above the mean surface itself; then the review's three tallest spots. Also: the reef still has coral in its
// shallows (the count in water 0.5–2 m deep).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/coral-depth-check.ts
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean, CORAL_CEIL } from '../src/ocean/build';
import { CORAL_MAT } from '../src/ocean/models';

const loc0 = LOCATIONS.find((l) => l.id === 'kayama')!;
await loadLand('kayama', loc0.land!.half, loc0.land!.far);
const oc: any = buildOcean({ ...loc0, residents: false } as any);
const loc = loc0;
const m = new THREE.Matrix4(), box = new THREE.Box3(), pt = new THREE.Vector3();
const KINDS = ['branch', 'table', 'brain', 'mushroom', 'fan', 'clam'];
const all: { kind: string; x: number; z: number; floor: number; top: number }[] = [];
for (const cell of oc.cells) {
  const kind = Object.keys(CORAL_MAT).find((k) => (CORAL_MAT as any)[k] === cell.mesh.material);
  if (!kind || !KINDS.includes(kind)) continue;
  const meshes = [cell.mesh, ...(cell.hi ? [cell.hi] : [])];
  for (const me of meshes) if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
  for (let i = 0; i < cell.mesh.count; i++) {
    cell.mesh.getMatrixAt(i, m);
    const e = m.elements, x = e[12], z = e[14];
    let top = -Infinity;
    for (const me of meshes) {
      if (Math.abs(e[1]) + Math.abs(e[9]) > 1e-7) { const p = me.geometry.attributes.position; for (let j = 0; j < p.count; j++) top = Math.max(top, pt.fromBufferAttribute(p, j).applyMatrix4(m).y); }
      else top = Math.max(top, box.copy(me.geometry.boundingBox!).applyMatrix4(m).max.y);
    }
    all.push({ kind, x, z, floor: loc.f(x, z), top });
  }
}
const over = all.filter((c) => c.top > CORAL_CEIL + 0.02), above0 = all.filter((c) => c.top > 0);
const shallow = all.filter((c) => c.floor > -2 && c.floor < -0.5).length;
const by = (list: typeof all) => KINDS.map((k) => `${k} ${list.filter((c) => c.kind === k).length}`).join(', ');
console.log(`colonies ${all.length}; in water 0.5–2 m deep ${shallow}`);
console.log(`top above the mean surface: ${above0.length} (${by(above0)})`);
console.log(`top above the growing line ${CORAL_CEIL} m: ${over.length} (${by(over)})`);
for (const [x, z] of [[-9.058, -83.308], [-59.923, -112.288], [-37.655, -112.598]]) {
  const near = all.filter((c) => Math.hypot(c.x - x, c.z - z) < 1).sort((a, b) => b.top - a.top)[0];
  console.log(`  (${x}, ${z}) floor ${loc.f(x, z).toFixed(2)}: ${near ? `${near.kind} top ${near.top.toFixed(2)}` : 'no colony within 1 m'}`);
}
for (const c of over.sort((a, b) => b.top - a.top).slice(0, 5)) console.log(`  over: ${c.kind} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) floor ${c.floor.toFixed(2)} top ${c.top.toFixed(2)}`);
const bad = over.length > 0 || shallow < 200;
console.log(bad ? 'FAIL' : 'PASS');
if (bad) process.exit(1);
