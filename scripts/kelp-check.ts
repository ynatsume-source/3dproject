// npx tsx --import ./scripts/node-assets.mjs scripts/kelp-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { buildKelp } from '../src/ocean/kelp';
import { PLACES } from '../src/ui/places';
const loc = LOCATIONS.find(l => l.id === 'monterey')!;
assert.equal(LOCATIONS.filter(l => l.id === loc.id).length, 1);
const oc = buildOcean(loc);
assert.ok(oc.kelp.count > 100 && oc.kelp.count < 500);
assert.equal(oc.anemones.length, 0); assert.equal(oc.colonies.length, 0);
assert.equal(oc.turtles.length, 0); assert.equal(oc.mantas.length, 0);
assert.equal(oc.fish.length, 4);
// Zero weights really mean no tropical coral instances, despite the hard-substrate terrain mask.
assert.equal(oc.cells.filter((c: any) => !c.big).length, 0);
let vertices = 0, meshes = 0;
oc.group.traverse((m: any) => {
  if (m.name !== 'giant-kelp') return;
  meshes++; const g = m.geometry; vertices += g.attributes.position.count;
  for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) for (const v of attr.array) assert.ok(Number.isFinite(v));
  for (const i of g.index.array) assert.ok(i >= 0 && i < g.attributes.position.count);
  assert.ok(g.boundingSphere.radius > 0 && Number.isFinite(g.boundingSphere.radius));
});
assert.ok(vertices < 850000, 'prototype kelp vertex budget');
assert.equal(meshes, oc.kelp.batches); assert.equal(vertices, oc.kelp.vertices);
// Site previews must land in water and return an actually built stand.
for (const p of PLACES.monterey) { const s = p.find(oc, new THREE.Vector3(0, -8, 0)); assert.ok(s); assert.ok(s.pos.y < 0); }
// Rebuilding in another group preserves the exact roots; no shared RNG dependence.
const again = buildKelp(loc, new THREE.Group(), oc.T.top);
assert.deepEqual(again.roots.map(p => p.toArray()), oc.kelp.roots.map((p: THREE.Vector3) => p.toArray()));
console.log(JSON.stringify({ status: 'passed', roots: oc.kelp.count, vertices, batches: meshes, fish: oc.fish.map((f: any) => f.sp.id) }));
