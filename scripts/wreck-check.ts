// npx tsx --import ./scripts/node-assets.mjs scripts/wreck-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
const loc = LOCATIONS.find(l => l.id === 'carnatic')!;
const oc = buildOcean(loc), w = oc.wreck, g = w.geo;
for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) for (const v of attr.array) assert.ok(Number.isFinite(v));
for (const i of g.index.array) assert.ok(i >= 0 && i < g.attributes.position.count);
const n = g.attributes.normal;
for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 0.01, `normal ${i}`);
assert.equal(w.pts.length, g.attributes.position.count);
for (const p of Object.values(w.landmarks) as THREE.Vector3[]) assert.ok(p.toArray().every(Number.isFinite) && p.y < 0);
// The full forward and reverse viewing routes stay outside the conservative 2D hull obstacle map.
let minimumClearance = Infinity;
for (const rev of [false, true]) for (let t = 0; t <= w.tourLength; t += 0.25) {
  const p = new THREE.Vector3(), look = new THREE.Vector3(); w.tourAt(t, rev, p, look);
  assert.ok([...p.toArray(), ...look.toArray()].every(Number.isFinite));
  assert.ok(p.y < -1 && p.distanceTo(look) > 2);
  const clearance = p.y - oc.T.top(p.x, p.z); minimumClearance = Math.min(minimumClearance, clearance);
  assert.ok(clearance > 1, `tour clearance ${clearance} at ${t}, reversed=${rev}`);
}
assert.ok(w.up.length > 10 && w.up.length < 150);
console.log(JSON.stringify({ status: 'passed', vertices: n.count, triangles: g.index.count / 3, coralAnchors: w.up.length, minimumTourClearance: minimumClearance }));
