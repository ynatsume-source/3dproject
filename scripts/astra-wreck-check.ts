// Headless integration check for Carnatic. No renderer or substitute collision map is used.
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/astra-wreck-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { Director } from '../src/director';
import type { Subject } from '../src/eco/env';
import type { Wreck } from '../src/ocean/wreck';

const started = performance.now();
const loc = LOCATIONS.find((l) => l.id === 'carnatic')!;
assert(loc?.wreck, 'Carnatic must retain its wreck specification');
const oc = buildOcean(loc);
const wreck: Wreck = oc.wreck;
assert(wreck, 'buildOcean must expose the wreck');
const geometry = wreck.geo, position = geometry.getAttribute('position');
const normal = geometry.getAttribute('normal'), index = geometry.getIndex();
assert(position?.count && normal?.count && index?.count, 'wreck needs indexed, lit geometry');
assert.equal(index.count % 3, 0, 'triangle index count');
for (const [name, attribute] of Object.entries(geometry.attributes)) {
  assert.equal(attribute.count, position.count, `${name} must cover every vertex`);
  assert(Array.from(attribute.array).every(Number.isFinite), `${name} contains non-finite values`);
}
const finite = (p: THREE.Vector3) => [p.x, p.y, p.z].every(Number.isFinite);
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const edge = new THREE.Vector3(), secondEdge = new THREE.Vector3(), cross = new THREE.Vector3();
const normalSum = new THREE.Vector3(), vertexNormal = new THREE.Vector3();
let degenerate = 0, firstDegenerate = -1;
let minNormalAgreement = 1;
for (let i = 0; i < index.count; i += 3) {
  for (let k = 0; k < 3; k++) {
    const id = index.getX(i + k);
    assert(Number.isInteger(id) && id >= 0 && id < position.count, `invalid index at ${i + k}`);
  }
  a.fromBufferAttribute(position, index.getX(i));
  b.fromBufferAttribute(position, index.getX(i + 1));
  c.fromBufferAttribute(position, index.getX(i + 2));
  cross.crossVectors(edge.subVectors(b, a), secondEdge.subVectors(c, a));
  if (cross.lengthSq() < 1e-12) { degenerate++; if (firstDegenerate < 0) firstDegenerate = i / 3; }
  normalSum.set(0, 0, 0);
  for (let k = 0; k < 3; k++) normalSum.add(vertexNormal.fromBufferAttribute(normal, index.getX(i + k)));
  minNormalAgreement = Math.min(minNormalAgreement, cross.normalize().dot(normalSum.normalize()));
}
assert.equal(degenerate, 0, `collapsed facets: ${degenerate}, first triangle ${firstDegenerate}`);
assert(minNormalAgreement > 0, 'vertex normals oppose triangle winding');
for (let i = 0; i < normal.count; i++) {
  a.fromBufferAttribute(normal, i);
  assert(Math.abs(a.length() - 1) < 0.05, `normal ${i} is not unit length`);
}
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
const bounds = geometry.boundingBox!, sphere = geometry.boundingSphere!;
const size = bounds.getSize(new THREE.Vector3());
assert(finite(bounds.min) && finite(bounds.max) && Number.isFinite(sphere.radius), 'finite geometry bounds');
assert(Math.max(size.x, size.z) > loc.wreck.len * 0.8, 'geometry must span the ship length');
assert(sphere.radius < loc.wreck.len, 'geometry extends implausibly far from the ship');
assert(size.y > loc.wreck.beam * 0.4 && size.y < loc.wreck.len * 0.6, 'plausible rolled-hull height');
assert(bounds.max.y < -0.7, 'the wreck must remain submerged');
assert(finite(wreck.centre) && bounds.containsPoint(wreck.centre), 'subject centre must be inside the wreck bounds');
console.log(`geometry: ${position.count} vertices, ${index.count / 3} nondegenerate triangles; bounds ${size.toArray().map((v) => v.toFixed(2)).join(' × ')} m; minimum normal agreement ${minNormalAgreement.toFixed(3)}`);

assert(wreck.pts.length > 0, 'collision samples must remain available');
for (const p of wreck.pts) {
  assert(finite(p), 'non-finite collision sample');
  assert(oc.T.ground(p.x, p.z) >= p.y + 0.29, 'buildOcean did not register a collision sample');
}
assert(wreck.up.length > 0, 'coral attachment points must remain available');
for (const { p, n } of wreck.up) {
  assert(finite(p) && finite(n), 'non-finite coral attachment');
  assert(n.y > 0 && Math.abs(n.length() - 1) < 0.05, 'coral attachment normal must point upward');
  assert(p.y >= loc.f(p.x, p.z) - 0.1, 'coral attachment buried in the seabed');
}
for (let i = 0; i < 100; i++) {
  const out = new THREE.Vector3();
  assert.equal(wreck.spot(out), out, 'fish habitat API must fill and return the supplied vector');
  assert(finite(out) && out.y > loc.f(out.x, out.z) && out.y < -0.7, 'fish habitat must remain in the water');
  assert(out.distanceTo(wreck.centre) < loc.wreck.len, 'fish habitat must remain near the ship');
}

// Query real triangle interiors against the built map. Registering only the corners of a new
// large plate can leave its middle permeable even though all supplied pts were registered.
let surfaceSamples = 0, collisionGaps = 0, worstGap = 0;
const sample = new THREE.Vector3();
for (let i = 0; i < index.count; i += 3) {
  a.fromBufferAttribute(position, index.getX(i));
  b.fromBufferAttribute(position, index.getX(i + 1));
  c.fromBufferAttribute(position, index.getX(i + 2));
  const span = Math.max(Math.hypot(a.x - b.x, a.z - b.z), Math.hypot(b.x - c.x, b.z - c.z), Math.hypot(c.x - a.x, c.z - a.z));
  const divisions = Math.max(1, Math.ceil(span / 0.75));
  for (let u = 0; u <= divisions; u++) for (let v = 0; v <= divisions - u; v++) {
    sample.copy(a).multiplyScalar(1 - (u + v) / divisions).addScaledVector(b, u / divisions).addScaledVector(c, v / divisions);
    const gap = sample.y - oc.T.ground(sample.x, sample.z);
    surfaceSamples++;
    if (gap > 0.1) { collisionGaps++; worstGap = Math.max(worstGap, gap); }
  }
}
assert.equal(collisionGaps, 0, `collision map leaves ${collisionGaps}/${surfaceSamples} surface samples uncovered, deepest ${worstGap.toFixed(2)} m`);
console.log(`integration: ${wreck.pts.length} collision points, ${surfaceSamples} covered surface samples, ${wreck.up.length} coral attachments`);

const subject: Subject = oc.eco.subjects().find((s: Subject) => s.key === 'wreck');
assert(subject?.tour && subject.live(), 'ecosystem must expose a live wreck tour');
assert.equal(subject.tour.length, wreck.tourLength, 'ecosystem tour duration');
const tour = subject.tour;
assert(Number.isFinite(tour.length) && tour.length > 0, 'finite positive tour duration');
const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
const meshSafe = (p: THREE.Vector3) => {
  // A cheap axis-aligned rejection keeps the exact point-to-triangle check small.
  for (let i = 0; i < index.count; i += 3) {
    triangle.a.fromBufferAttribute(position, index.getX(i));
    triangle.b.fromBufferAttribute(position, index.getX(i + 1));
    triangle.c.fromBufferAttribute(position, index.getX(i + 2));
    const { a, b, c } = triangle, r = 0.7;
    if (p.x < Math.min(a.x, b.x, c.x) - r || p.x > Math.max(a.x, b.x, c.x) + r ||
        p.y < Math.min(a.y, b.y, c.y) - r || p.y > Math.max(a.y, b.y, c.y) + r ||
        p.z < Math.min(a.z, b.z, c.z) - r || p.z > Math.max(a.z, b.z, c.z) + r) continue;
    triangle.closestPointToPoint(p, closest);
    assert(closest.distanceTo(p) >= r, `tour intersects visible geometry at triangle ${i / 3}`);
  }
};
for (const reverse of [false, true]) {
  const p = new THREE.Vector3(), look = new THREE.Vector3(), previous = new THREE.Vector3();
  let routeLength = 0, minGround = Infinity, minTerrain = Infinity;
  const steps = Math.ceil(tour.length / 0.25), dt = tour.length / steps;
  for (let i = 0; i <= steps; i++) {
    tour.at(i * dt, reverse, p, look);
    assert(finite(p) && finite(look) && p.distanceTo(look) > 0.1, 'finite tour position and nonzero gaze');
    minGround = Math.min(minGround, p.y - oc.T.ground(p.x, p.z));
    minTerrain = Math.min(minTerrain, p.y - loc.f(p.x, p.z));
    assert(p.y < -0.7, 'tour must stay underwater');
    meshSafe(p);
    if (i > 0) {
      const stepLength = previous.distanceTo(p);
      assert(stepLength / dt < 5, 'tour has a discontinuity or excessive speed');
      routeLength += stepLength;
    } else assert(p.distanceTo(new THREE.Vector3().copy(tour.start(reverse))) < 1e-6, 'tour.start must match tour.at(0)');
    previous.copy(p);
  }
  assert(minGround >= 0.7, `tour ${reverse ? 'reverse' : 'forward'} violates drone ground clearance: ${minGround.toFixed(2)} m`);
  assert(minTerrain >= 0.7, 'tour enters the seabed');
  assert(routeLength > loc.wreck.len * 0.5, 'tour must travel along the ship');
  const opposite = tour.start(!reverse);
  assert(Math.hypot(p.x - opposite.x, p.z - opposite.z) < 0.01, 'tour must finish at the opposite end');

  // Exercise the real Director handoff and completion using an ideal follower. This verifies
  // its tour contract; it does not pretend to test the drone controller in main.ts.
  const director = new Director(), follower = new THREE.Vector3().copy(tour.start(reverse));
  director.focus(subject, follower);
  assert.equal(director.shot?.rev, reverse, 'director must select the nearer tour entrance');
  let observing = false, completed = false;
  for (let t = 0; t <= tour.length + 5; t += 0.25) {
    const shot = director.update(0.25, follower, () => [subject], oc.T.top);
    if (!shot) { completed = observing; break; }
    observing ||= shot.phase === 'observe';
    assert(shot.subject === subject && finite(shot.pos) && finite(shot.look), 'director lost the wreck tour');
    follower.copy(shot.pos);
  }
  assert(completed, 'director did not complete the wreck tour');
  console.log(`tour ${reverse ? 'reverse' : 'forward'}: ${steps + 1} samples, ${routeLength.toFixed(2)} m, terrain clearance ${minTerrain.toFixed(2)} m, collision clearance ${minGround.toFixed(2)} m; director completed`);
}
console.log(`Carnatic headless checks passed in ${((performance.now() - started) / 1000).toFixed(2)} s`);
