// Behaviour checks exercise the real fish steering and instance transforms, with a
// controlled sandy lane so predators and camera shyness can be tested independently.
// npx tsx --import ./scripts/node-assets.mjs scripts/lobos-fish-life-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeFishSystem } from '../src/eco/fish';
import { makeKelpFishLife } from '../src/eco/kelp-life';
import { POINT_LOBOS } from '../src/data/pointlobos';
import { seedRandom } from '../src/core/math';
import { Plankton } from '../src/eco/plankton';
import type { Env } from '../src/eco/env';

const species = POINT_LOBOS.species.find(s => s.id === 'senorita')!;
function ocean(sand = true, id = 'pointlobos') {
  const floor = (x: number, z: number) => -12 + Math.sin(z * 0.03) * 0.04;
  const reef = (x: number, z: number) => sand && Math.abs(x) < 5 ? 0 : 0.9;
  const oc: any = { loc: { ...POINT_LOBOS, id }, group: new THREE.Group(), anemones: [],
    T: { top: floor, ground: floor, h: floor, reef, wet: () => true, shore: () => 0 },
    kelp: { floorAt: floor, anchors: [-24, -12, 12, 24].flatMap(x => [-24, -12, 0, 12, 24].map(z => ({ pos: new THREE.Vector3(x, floor(x, z), z) }))) },
  };
  return oc;
}
function environment(): Env {
  return { t: 0, day: 1, night: 0, twilight: 0, sunI: 1, month: 9, mday: 15,
    cur: { x: 0.3, z: 0.1 }, plankton: new Plankton(170), threats: [], threatsOut: [], prey: [],
    cam: { x: 0, y: -8, z: 0 }, shy: 0, events: [], crunch: () => {}, sound: { frenzy() {}, plop() {} } };
}
seedRandom(317);
const oc = ocean(), f = makeFishSystem(species, oc)!, env = environment();
const cam = new THREE.Vector3(0, -8, 0), life = f.dbg.kelpLife!;
assert.equal(f.dbg.total, 35, 'existing fish count');
let maxStep = 0, foraging = false, belowRock = 0;
const prior = new Float32Array(f.dbg.fp.length);
function run(seconds: number, checkContinuity = true) {
  for (let frame = 0; frame < seconds * 20; frame++) {
    prior.set(f.dbg.fp); env.t += 0.05;
    f.update(0.05, env, cam, 0, -1);
    for (let i = 0; i < f.dbg.total; i++) {
      const k = i * 3, x = f.dbg.fp[k], y = f.dbg.fp[k + 1], z = f.dbg.fp[k + 2];
      assert.ok(Number.isFinite(x + y + z));
      if (checkContinuity) maxStep = Math.max(maxStep, Math.hypot(x - prior[k], y - prior[k + 1], z - prior[k + 2]));
      if (y < oc.kelp.floorAt(x, z) - 0.001 && oc.T.reef(x, z) > 0.1) belowRock++;
      if (life.states[i].mode === 'forage') foraging = true;
    }
  }
}
run(0.05, false); run(100);
assert.ok(foraging, 'daytime fish actually reach a rocky feeding patch');
const dayPosition = f.dbg.fp.slice();
env.day = 0; env.night = 1; env.sunI = 0;
run(180);
const sleeping = life.states.filter(s => s.mode === 'sleep');
assert.ok(sleeping.length >= 25, `fish reach separate sand beds at night: ${sleeping.length}`);
assert.equal(belowRock, 0, 'no buried fish in rocky substrate');
assert.ok(maxStep < 0.3, `no teleport between group / feeding / sleeping positions: ${maxStep}`);
const normalMaxStep = maxStep;
const matrix = new THREE.Matrix4(), nose = new THREE.Vector3(), tail = new THREE.Vector3();
for (let i = 0; i < f.dbg.total; i++) {
  const s = life.states[i];
  if (s.mode !== 'sleep') continue;
  assert.ok(s.sand && life.isSand(s.sand.x, s.sand.z));
  f.mesh.getMatrixAt(i, matrix);
  nose.set(0, 0, 0.5).applyMatrix4(matrix); tail.set(0, 0, -0.65).applyMatrix4(matrix);
  assert.ok(nose.y > oc.kelp.floorAt(nose.x, nose.z), 'the sleeping head remains above sand');
  assert.ok(tail.y < oc.kelp.floorAt(tail.x, tail.z), 'the tail is occluded by the sand');
}
const sleepSubject = f.focus(cam)!;
assert.ok(sleepSubject.pos()!.y > oc.kelp.floorAt(sleepSubject.pos()!.x, sleepSubject.pos()!.z), 'guide aims at a sleeping head, above sand');
const autoSubjects: import('../src/eco/env').Subject[] = []; f.subjects(autoSubjects);
assert.ok(autoSubjects.length <= 1, 'one life subject per species');
for (const g of f.dbg.groups) if (g.prey) {
  const mean = new THREE.Vector3();
  for (let i = g.start; i < g.start + g.n; i++) mean.add(new THREE.Vector3(f.dbg.fp[i * 3], f.dbg.fp[i * 3 + 1], f.dbg.fp[i * 3 + 2]));
  mean.multiplyScalar(1 / g.n);
  assert.ok(mean.distanceTo(new THREE.Vector3(g.prey.x, g.prey.y, g.prey.z)) < 1e-4, 'predators locate the actual group at night');
}
// One real, nearby threat interrupts one sleeping fish and ordinary steering takes over.
const victim = life.states.findIndex(s => s.mode === 'sleep'), offset = victim * 3;
const p0 = new THREE.Vector3(...Array.from(f.dbg.fp.slice(offset, offset + 3)) as [number, number, number]);
env.threats = [{ x: p0.x + 0.2, y: p0.y + 0.1, z: p0.z, r: 3 }];
run(4);
assert.equal(life.states[victim].burial, 0, 'a threatened fish emerges before fleeing');
assert.ok(new THREE.Vector3(...Array.from(f.dbg.fp.slice(offset, offset + 3)) as [number, number, number]).distanceTo(p0) > 0.5, 'predator escape still moves the body');
env.threats = []; env.day = 1; env.night = 0; env.sunI = 1;
run(100);
assert.ok(life.states.every(s => s.burial === 0), 'all fish emerge at dawn');
assert.ok(autoSubjects.every(s => !s.live()), 'a sleeping subject expires when its fish wakes');
assert.ok(f.dbg.fp.some((v, i) => Math.abs(v - dayPosition[i]) > 0.2), 'fish resume swimming');

// A rocky-only bed must never become a fake sand sleeping spot.
const rockLife = makeKelpFishLife(species, ocean(false), 1)!;
rockLife.place(0, 12, -10, 0);
for (let i = 0; i < 1000; i++) rockLife.update(0, 0.1, i * 0.1, 0, false, { x: 12, y: -11.8, z: 0 }, 0.15);
assert.equal(rockLife.states[0].sand, null); assert.equal(rockLife.states[0].burial, 0);
assert.equal(makeKelpFishLife(species, ocean(true, 'miyako'), 1), null, 'other seas keep their original behaviour');

// Real triangulated terrain and the leaf support shared with the GPU. Disable
// predators only here so this isolates the journey itself rather than hunt odds.
const { buildOcean } = await import('../src/ocean/build');
const real = buildOcean(POINT_LOBOS), fish = real.fish.find((f: any) => f.sp.id === 'senorita');
const realLife = fish.dbg.kelpLife!, realEnv = real.eco.env; realEnv.shy = 0;
let realPecks = 0, closeLeafPecks = 0, realMaxStep = 0;
let old: Float32Array | undefined;
function realRun(day: number, seconds: number) {
  realEnv.day = day; realEnv.night = 1 - day; realEnv.sunI = day;
  for (let tick = 0; tick < seconds * 20; tick++) {
    realEnv.t += 0.05; fish.update(0.05, realEnv, cam, 0, -1);
    const fp = fish.dbg.fp;
    for (let i = 0; i < fish.dbg.total; i++) {
      const s = realLife.states[i], x = fp[i * 3], y = fp[i * 3 + 1], z = fp[i * 3 + 2];
      assert.ok(Number.isFinite(x + y + z));
      if (old) realMaxStep = Math.max(realMaxStep, Math.hypot(x - old[i * 3], y - old[i * 3 + 1], z - old[i * 3 + 2]));
      if (!s.burial) assert.ok(y >= real.kelp.floorAt(x, z) + 0.099, 'awake bodies clear the rendered terrain');
      if (s.peck > 0.7 && s.feedingOnLeaf) {
        realPecks++; fish.mesh.getMatrixAt(i, matrix); nose.set(0, 0, 0.5).applyMatrix4(matrix);
        const support = s.supportAt!(realEnv.t).pos;
        if (nose.distanceTo(new THREE.Vector3(support.x, support.y, support.z)) < 0.12) closeLeafPecks++;
      }
    }
    old = fp.slice();
  }
}
realRun(1, 120);
assert.ok(realPecks > 0 && closeLeafPecks > 0, 'feeding reaches actual moving leaves');
realRun(0, 180);
const realSleeping = realLife.states.filter((s: any) => s.mode === 'sleep').length;
assert.ok(realSleeping >= 28, `real terrain has reachable individual sand beds: ${realSleeping}`);
for (let i = 0; i < fish.dbg.total; i++) {
  const s = realLife.states[i];
  if (s.mode !== 'sleep') continue;
  assert.ok(realLife.isSand(s.sand.x, s.sand.z));
  fish.mesh.getMatrixAt(i, matrix); nose.set(0, 0, 0.5).applyMatrix4(matrix);
  assert.ok(nose.y > real.kelp.floorAt(nose.x, nose.z), 'real floor leaves the head exposed');
}
realRun(1, 120);
assert.ok(realLife.states.every((s: any) => s.burial === 0));
assert.ok(realMaxStep < 0.3, 'no teleports on the rocky real terrain');
console.log(JSON.stringify({ fish: f.dbg.total, sleeping: sleeping.length, foraging, normalMaxStep, maxEscapeStep: maxStep, belowRock,
  real: { sleeping: realSleeping, leafPecks: realPecks, closeLeafPecks, maxStep: realMaxStep },
  checks: 'sand selection / individual night travel / exposed heads / no teleport / predator interruption / dawn / actual leaf feeding / guide focus / non-Lobos isolation: PASS' }, null, 2));
