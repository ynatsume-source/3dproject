// Geometry/ecology contract for the cold-water prototype; no browser or WebGL required.
// npx tsx --import ./scripts/node-assets.mjs scripts/pointlobos-check.ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { PLACES } from '../src/ui/places';
import * as THREE from 'three';

const loc = LOCATIONS.find(l => l.id === 'pointlobos')!;
assert.ok(loc && loc.habitat === 'kelp');
const oc = buildOcean(loc);
assert.equal(oc.anemones.length, 0); assert.equal(oc.colonies.length, 0);
assert.equal(oc.turtles.length, 0); assert.equal(oc.mantas.length, 0); assert.ok(!oc.residents);
assert.ok(!oc.flyfish && !oc.bait && !oc.whales && !oc.octopi && !oc.critters);
assert.ok(Object.values(loc.corals).every(w => w === 0));
assert.deepEqual(oc.fish.map((f: any) => f.sp.id), ['blue-rockfish', 'olive-rockfish', 'black-surfperch', 'senorita', 'kelp-rockfish', 'kelp-greenling', 'cabezon', 'lingcod']);
assert.ok(oc.kelp.anchors.length > 180 && oc.kelp.anchors.length < 750);
const coralInst = oc.group.children.filter((m: any) => m.geometry?.attributes.aCol2);
assert.equal(coralInst.length, 0, 'zero-weight corals must not fall back to a tropical coral kind');
let lo = Infinity, hi = -Infinity;
for (let x = -130; x <= 130; x += 2) for (let z = -130; z <= 130; z += 2) {
  const y = loc.f(x, z); assert.ok(Number.isFinite(y)); lo = Math.min(lo, y); hi = Math.max(hi, y);
}
assert.ok(lo > -23 && hi < -5);
for (const a of oc.kelp.anchors) {
  assert.ok(Number.isFinite(a.pos.y) && a.pos.y <= -4);
  assert.ok(Math.abs(a.pos.y - oc.kelp.floorAt(a.pos.x, a.pos.z) - 0.014) < 1e-6, 'holdfast touches its support');
  assert.ok(a.top.y < -0.3 && a.top.y > -0.8);
}
const memory = { verticesStored: 0, trianglesStored: 0, trianglesInstanced: 0, meshObjects: 0, instanceCount: 0 };
const unique = new Set<THREE.BufferGeometry>();
const hash = createHash('sha256');
oc.group.traverse((m: any) => {
  if (!m.geometry) return;
  memory.meshObjects++;
  const g = m.geometry, tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  memory.trianglesInstanced += tris * (m.isInstancedMesh ? m.count : 1);
  if (m.isInstancedMesh) memory.instanceCount += m.count;
  if (!unique.has(g)) {
    unique.add(g); memory.verticesStored += g.attributes.position.count; memory.trianglesStored += tris;
    for (const [name, attr] of Object.entries(g.attributes) as [string, any][]) {
      assert.ok([...attr.array].every(Number.isFinite), `${m.name}/${name} contains a nonfinite vertex`);
    }
    if (g.index) assert.ok([...g.index.array].every(i => i >= 0 && i < g.attributes.position.count));
  }
  if (m.name === 'Macrocystis forest') {
    hash.update(Buffer.from(g.attributes.position.array.buffer));
    assert.ok(tris > 0);
  }
});
for (const pl of PLACES.pointlobos) {
  const found = pl.find(oc, new THREE.Vector3(0, -9, 0)); assert.ok(found, `no destination: ${pl.id}`);
  assert.ok(found.pos.y < 0 && found.pos.y > oc.T.top(found.pos.x, found.pos.z), `destination inside seabed: ${pl.id}`);
}
// the fine drawing near the camera: built within a few frames, finite, and let go once the camera has left
const near = new THREE.Vector3(oc.kelp.anchors[0].pos.x, -9, oc.kelp.anchors[0].pos.z);
const fineMeshes = () => oc.group.children.filter((m: any) => m.name === 'Macrocystis forest').length;
const coarse = fineMeshes();
for (let i = 0; i < 400 && fineMeshes() === coarse; i++) oc.kelp.update(near);
assert.ok(fineMeshes() > coarse, 'fine kelp near the camera');
oc.group.children.slice(coarse).forEach((m: any) => { if (m.name === 'Macrocystis forest') assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite)); });
oc.kelp.update(new THREE.Vector3(9999, -9, 9999));
assert.equal(fineMeshes(), coarse, 'fine kelp released far away');
const anchors = JSON.stringify(oc.kelp.anchors);
const again = buildOcean(loc);
assert.equal(JSON.stringify(again.kelp.anchors), anchors, 'kelp layout must be reproducible');
assert.deepEqual(again.kelp.stats, oc.kelp.stats);
const report = { sea: loc.id, seabedRange: [lo, hi], kelp: oc.kelp.stats, geometry: memory, kelpGeometrySHA256: hash.digest('hex'), checks: 'finite vertices / indices / zero tropical defaults / supported holdfasts / destinations / deterministic placement: PASS' };
console.log(JSON.stringify(report, null, 2));
