// Real terrain contact, frame-rate-independent slow motion, determinism, and budgets.
// npx tsx --import ./scripts/node-assets.mjs scripts/lobos-benthos-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POINT_LOBOS } from '../src/data/pointlobos';
import { buildOcean } from '../src/ocean/build';
import { buildLobosBenthos, sampleLobosBenthosPose } from '../src/ocean/lobos-benthos';
import { TERR } from '../src/core/math';

const ocean = buildOcean(POINT_LOBOS), benthos = ocean.lobosBenthos;
assert.ok(benthos, 'integrated only in Point Lobos');
assert.equal(benthos.stats.meshes, 5, 'all small residents use five batched draws');
assert.equal(benthos.stats.urchins, 320); assert.equal(benthos.stats.batStars, 110);
assert.equal(benthos.stats.snails, 30); assert.equal(benthos.stats.leafSnails, 12);
const floorAt = ocean.kelp.floorAt;
const repeat = buildLobosBenthos(POINT_LOBOS, ocean.T, new THREE.Group(), floorAt,
  { understoryAnchors: ocean.kelp.understory.anchors });
const layout = (b: typeof benthos) => b.residents.map((r: any) => [r.kind, r.home.toArray(), r.scale, r.phase, !!r.leaf]);
assert.deepEqual(layout(benthos), layout(repeat), 'adding other procedural models must not perturb seeded inhabitants');
for (const r of benthos.residents) {
  if (r.leaf) {
    assert.ok(r.home.distanceTo(r.leaf.supportAt(0).pos) < 1e-8, 'leaf rider starts on a real blade');
  } else {
    POINT_LOBOS.f(r.home.x, r.home.z);
    assert.ok(TERR.reef > 0.35, 'open sand remains free of attached benthos');
    assert.ok(Math.abs(r.home.y - floorAt(r.home.x, r.home.z)) < 1e-8);
  }
  const a = sampleLobosBenthosPose(r, 600, floorAt), b = sampleLobosBenthosPose(r, 601, floorAt);
  if (!r.leaf) assert.ok(a.pos.distanceTo(b.pos) < 0.0004, 'crawl cannot race across the seabed');
  assert.ok(Number.isFinite(a.normal.length()) && Math.abs(a.normal.length() - 1) < 1e-8);
}
const star = benthos.residents.find((r: any) => r.kind === 'batStar');
const rockSnail = benthos.residents.find((r: any) => r.kind === 'snail' && !r.leaf);
assert.ok(sampleLobosBenthosPose(star, 1800, floorAt).pos.distanceTo(star.home) > 0.01, 'star really crawls over half an hour');
assert.ok(sampleLobosBenthosPose(rockSnail, 1800, floorAt).pos.distanceTo(rockSnail.home) > 0.01, 'rock snail really crawls');
assert.ok(star.pos.distanceTo(star.home) < 1e-8, 'sampling is pure');

let triangles = 0, worstPenetration = 0;
for (const m of benthos.meshes) {
  const g = m.geometry, p = g.getAttribute('position');
  triangles += g.index.count / 3 * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  for (const [name, attr] of Object.entries(g.attributes) as [string, any][]) assert.ok([...attr.array].every(Number.isFinite), `${m.name}/${name}: finite`);
  assert.ok([...g.index.array].every(i => i >= 0 && i < p.count), `${m.name}: indices in range`);
  if (!(m as THREE.InstancedMesh).isInstancedMesh) continue;
  const list = benthos.residents.filter((r: any) => m.name === `Lobos ${r.kind}s`), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (let i = 0; i < list.length; i++) {
    if (list[i].leaf) continue;
    (m as THREE.InstancedMesh).getMatrixAt(i, matrix);
    let minGap = Infinity;
    for (let v = 0; v < p.count; v++) {
      point.fromBufferAttribute(p, v).applyMatrix4(matrix);
      minGap = Math.min(minGap, point.y - floorAt(point.x, point.z));
    }
    worstPenetration = Math.min(worstPenetration, minGap);
    assert.ok(minGap < 0.008, `${m.name}: cannot float (${minGap})`);
    assert.ok(minGap > -0.013, `${m.name}: excessive penetration (${minGap})`);
  }
}
assert.ok(triangles < 300_000, `benthos draw budget: ${triangles}`);

// Exercise the exact deformation buffer after long time, at a real terrain triangle seam.
for (const time of [60, 1800, 7200]) {
  for (const r of benthos.residents.filter((r: any) => r.kind === 'batStar')) benthos.update(r.home, 0.4, time);
  const mesh = benthos.meshes.find((m: THREE.Mesh) => m.name === 'Lobos bat stars');
  const p = mesh.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const gap = p.getY(i) - floorAt(p.getX(i), p.getZ(i));
    assert.ok(gap > 0.001 && gap < 0.032, `every star vertex hugs rendered rock (${gap})`);
  }
}
const follower = benthos.residents.find((r: any) => r.leaf);
benthos.update(follower.home, 0.4, 135);
assert.ok(follower.pos.distanceTo(follower.leaf.supportAt(135).pos) < 1e-8, 'snail follows the same moving leaf triangle');
const snailMesh = benthos.meshes.find((m: THREE.Mesh) => m.name === 'Lobos snails') as THREE.InstancedMesh;
const index = benthos.residents.filter((r: any) => r.kind === 'snail').indexOf(follower), transform = new THREE.Matrix4();
snailMesh.getMatrixAt(index, transform);
assert.ok(new THREE.Vector3().setFromMatrixPosition(transform).distanceTo(follower.pos) < 1e-5, 'draw transform follows its support');

// Visibility controls draw work, not each creature's absolute-time path.
benthos.update(star.home, 0.4, 1337); repeat.update(star.home, 1, 1337);
assert.ok(star.pos.distanceTo(repeat.residents.find((r: any) => r.kind === 'batStar').pos) < 1e-8, 'different time steps give the same crawl');
console.log(JSON.stringify({ checks: 'PASS', stats: benthos.stats, trianglesInstanced: triangles,
  worstStaticPenetrationMeters: worstPenetration, sampledHours: 2 }, null, 2));
