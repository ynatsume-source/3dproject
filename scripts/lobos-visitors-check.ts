// A complete seal encounter: spatial safety, deterministic ecology, waves, and honest rare scope.
// npx tsx --import ./scripts/node-assets.mjs scripts/lobos-visitors-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { makeT } from '../src/ocean/build';
import { mulberry32 } from '../src/core/math';
import { U } from '../src/render/common';
import { swellAt } from '../src/ocean/air';
import { findSealRoute, LobosVisitors, makeLobosVisitors, sampleSealVisit, SEAL_COOLDOWN, SEAL_VISIT_SECONDS, type SealPhase } from '../src/eco/lobos-visitors';
import type { Env, Subject } from '../src/eco/env';

const loc = LOCATIONS.find(l => l.id === 'pointlobos')!, T = makeT(loc);
const camera = new THREE.Vector3(0, -8, 0);
const env = { events: [], cam: camera } as unknown as Env;
const group = new THREE.Group();
assert.equal(makeLobosVisitors({ loc: { id: 'miyako' }, T, group }), undefined);
assert.equal(group.children.length, 0, 'other seas allocate no seal model');
const a = new LobosVisitors(T, new THREE.Group()), b = new LobosVisitors(T, new THREE.Group());
assert.equal(a.state.cooldown, b.state.cooldown);
assert.ok(a.state.cooldown >= 60 && a.state.cooldown <= 120);
assert.equal(a.force(camera), true); assert.equal(b.force(camera), true);
assert.equal(a.force(camera), false, 'a second request cannot add or teleport another seal');
const subjects: Subject[] = []; a.subjects(subjects);
assert.equal(subjects.length, 1); assert.equal(subjects[0].label, 'ゼニガタアザラシ');
assert.ok(subjects[0].live());
assert.equal(findSealRoute({ top: () => 3 }, camera, mulberry32(12)), null, 'no route through land');
assert.equal(findSealRoute({ top: () => -1.5 }, camera, mulberry32(12)), null, 'no route through shallow water');
assert.equal(findSealRoute({ top: () => NaN }, camera, mulberry32(12)), null, 'no route through missing terrain');
const route = findSealRoute(T, camera, mulberry32(13))!; assert.ok(route);
const p = new THREE.Vector3(), q = new THREE.Vector3();
let checkedRoutes = 0;
for (let seed = 1; seed <= 12; seed++) {
  const observer = new THREE.Vector3(Math.sin(seed * 2.3) * 65, -6, Math.cos(seed * 1.1) * 65);
  const path = findSealRoute(T, observer, mulberry32(seed));
  if (!path) continue;
  checkedRoutes++;
  for (let seconds = 0; seconds < 310; seconds += 0.5) {
    sampleSealVisit(path, seconds, 0, p);
    assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) < 128, 'route and continued departure stay in modelled water');
    assert.ok(p.y > T.top(p.x, p.z) + 1, 'route clears relief over every phase');
  }
}
assert.ok(checkedRoutes >= 10, 'visitors can safely reach multiple parts of the real generated map');
for (const edge of [75, 95, 113, 136, 220]) {
  sampleSealVisit(route, edge - 1e-5, 0, p); sampleSealVisit(route, edge + 1e-5, 0, q);
  assert.ok(p.distanceTo(q) < 0.0001, `continuous phase boundary ${edge}`);
}
const phases = new Set<SealPhase>(); let lowestClearance = Infinity, highestNose = -Infinity, lowestNose = Infinity;
const world = new THREE.Vector3();
for (let frame = 0; frame < SEAL_VISIT_SECONDS * 10 + 3; frame++) {
  U.uTime.value = frame / 10;
  U.uSwell.value = 0.65;
  a.update(0.1, env, camera); b.update(0.1, env, camera);
  assert.deepEqual(a.state.position.toArray(), b.state.position.toArray(), 'deterministic path independent of shared RNG');
  phases.add(a.state.phase);
  if (!a.state.active) continue;
  a.model.group.updateMatrixWorld(true);
  // Sample every part, not only its centre: the lowest flipper while banking must clear the reef.
  if (frame % 5 === 0) a.model.group.traverse((o: any) => {
    if (!o.geometry) return;
    const attr = o.geometry.attributes.position;
    for (let i = 0; i < attr.count; i += 7) {
      world.fromBufferAttribute(attr, i).applyMatrix4(o.matrixWorld);
      const clearance = world.y - T.top(world.x, world.z);
      lowestClearance = Math.min(lowestClearance, clearance);
      assert.ok(Number.isFinite(world.x + world.y + world.z));
      assert.ok(clearance > 0.1, `whole-body clearance ${clearance}`);
    }
  });
  if (a.state.phase === 'breathing') {
    world.set(0, 0.098, 0.91).applyMatrix4(a.model.group.matrixWorld);
    highestNose = Math.max(highestNose, world.y - swellAt(world.x, world.z));
    if (a.state.seconds > 97 && a.state.seconds < 111) lowestNose = Math.min(lowestNose, world.y - swellAt(world.x, world.z));
  }
}
assert.deepEqual([...phases], ['passing', 'ascending', 'breathing', 'diving', 'departing', 'absent']);
assert.ok(highestNose > 0, 'nostrils can reach air during breathing');
assert.ok(lowestNose > 0, 'nostrils stay above the local swell through the settled breathing interval');
assert.equal(a.state.active, false); assert.equal(subjects[0].live(), false);
assert.ok(a.state.cooldown >= SEAL_COOLDOWN[0] - 1 && a.state.cooldown <= SEAL_COOLDOWN[1]);
assert.equal(a.model.group.visible, false);
const after: Subject[] = []; a.subjects(after); assert.equal(after.length, 0);
assert.equal(a.state.visits, 1);
// A camera following the departure does not make an animal vanish or freeze at the route end.
const followed = new LobosVisitors(T, new THREE.Group()); assert.ok(followed.force(camera));
const chase = camera.clone(); let travel = 0, previous = followed.state.position.clone();
for (let i = 0; i < 2700; i++) {
  chase.copy(followed.state.position).add(new THREE.Vector3(0, 0, 4));
  followed.update(0.1, env, chase);
  if (i > 2200) travel += followed.state.position.distanceTo(previous);
  previous.copy(followed.state.position);
}
assert.ok(followed.state.active); assert.ok(travel > 30, 'continues swimming when followed');
console.log(JSON.stringify({ checks: 'PASS', phases: [...phases], lowestWholeBodyClearance: lowestClearance, highestNoseAboveWave: highestNose,
  lowestSettledNoseAboveWave: lowestNose, checkedRoutes, visits: a.state.visits, nextVisitSeconds: a.state.cooldown, followDepartureTravel: travel }, null, 2));
