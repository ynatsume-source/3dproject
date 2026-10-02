// Meaningful habitat/attachment/buffer budgets for the enrichment; no WebGL needed.
// npx tsx --import ./scripts/node-assets.mjs scripts/lobos-forest-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POINT_LOBOS } from '../src/data/pointlobos';
import { buildOcean } from '../src/ocean/build';
import { TERR } from '../src/core/math';
import { kelpCruiseHabitat, makeKelpUnderstory } from '../src/ocean/kelp-understory';

const oc = buildOcean(POINT_LOBOS), kelp = oc.kelp, habitat = kelpCruiseHabitat(POINT_LOBOS);
assert.ok(kelp.stats.addedNearCruise > 25 && kelp.stats.addedNearCruise < 180, 'a local increase, not a doubled whole forest');
assert.ok(kelp.anchors.length < 600, 'keep the original canopy geometry budget bounded');
const recruits = kelp.anchors.slice(-kelp.stats.addedNearCruise);
for (const a of recruits) {
  POINT_LOBOS.f(a.pos.x, a.pos.z); assert.ok(TERR.reef >= 0.58, 'recruit holds onto rock');
  assert.ok(habitat(a.pos.x, a.pos.z).near >= 0.5, 'recruit enriches a cruise-adjacent patch');
  assert.ok(Math.abs(a.pos.y - kelp.floorAt(a.pos.x, a.pos.z) - 0.014) < 1e-6, 'exact triangle support');
}
const under = kelp.understory;
assert.ok(under.stats.juvenile > 50 && under.stats.broadleaf > 180 && under.stats.branching > 80, 'all three lower layers populated');
assert.ok(under.anchors.length < 2400, 'bounded lower-layer population');
const serial = (a: any) => JSON.stringify(a.map(({ pos, leaf, kind, height }: any) => ({ pos, leaf, kind, height })));
const again = makeKelpUnderstory(POINT_LOBOS, new THREE.Group(), oc.T, [], kelp.floorAt);
assert.equal(serial(again.anchors), serial(under.anchors), 'rebuild preserves every lower plant');
let leafSupports = 0, visibleNearCruise = 0;
for (const a of under.anchors) {
  POINT_LOBOS.f(a.pos.x, a.pos.z); assert.ok(TERR.reef >= 0.52, 'lower vegetation never fills a sand pocket');
  assert.ok(Math.abs(a.pos.y - kelp.floorAt(a.pos.x, a.pos.z) - 0.005) < 1e-6, 'lower plant touches its exact rock triangle');
  if (habitat(a.pos.x, a.pos.z).near > 0.9) visibleNearCruise++;
  if (a.kind === 'branching') assert.ok(a.height <= 0.20, 'red-algal tufts remain a genuinely low layer');
  if (!a.supportAt) continue;
  leafSupports++;
  const states = [0, 0.25, 10, 80].map(t => a.supportAt(t));
  for (const state of states) {
    assert.ok(state.pos.toArray().every(Number.isFinite)); assert.ok(state.normal.toArray().every(Number.isFinite));
    assert.ok(Math.abs(state.normal.length() - 1) < 1e-8 && state.normal.y > 0, 'leaf animal has an upward, finite attachment normal');
    assert.ok(state.pos.y > kelp.floorAt(state.pos.x, state.pos.z), 'leaf attachment remains above the rock');
    assert.ok(state.pos.distanceTo(a.leaf) < 0.15, 'attached animals follow gentle leaf motion');
  }
  assert.ok(states[0].pos.distanceTo(states[2].pos) > 0.0001, 'support point actually sways');
}
assert.ok(visibleNearCruise > under.anchors.length * 0.5, 'most enrichment is reachable from the cruise');
assert.equal(leafSupports, under.stats.broadleaf);
const buffers = new Set<ArrayBufferLike>(), meshes: THREE.InstancedMesh[] = [];
oc.group.traverse((m: any) => {
  if (!m.name.startsWith('Kelp understory:')) return;
  meshes.push(m); assert.ok(m.isInstancedMesh);
  const g = m.geometry; buffers.add(g.attributes.position.array.buffer);
  for (const attr of Object.values(g.attributes) as any[]) assert.ok([...attr.array].every(Number.isFinite), 'finite lower-layer geometry');
  assert.ok([...g.index.array].every(i => i >= 0 && i < g.attributes.position.count));
  assert.equal(g.attributes.aPlant.count, m.count, 'one phase/tone per lower plant');
});
assert.equal(buffers.size, 3, 'all low vegetation shares only three position buffers');
assert.ok(under.stats.verticesStored < 2500 && under.stats.trianglesStored < 3500, 'cheap reusable prototypes');
const nearby = under.anchors.filter((a: any) => a.pos.distanceTo(new THREE.Vector3(44.2, a.pos.y, 31)) < 15);
console.log(JSON.stringify({ canopy: kelp.stats, understory: under.stats, reachable: visibleNearCruise, leafSupports,
  exampleGarden: nearby.slice(0, 8).map(({ pos, kind }: any) => ({ kind, pos: pos.toArray() })),
  checks: 'rock/sand separation, triangle support, moving leaf support, repeatable placement, shared buffers and budgets: PASS' }, null, 2));
