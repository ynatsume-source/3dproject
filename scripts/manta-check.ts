// Headless behavioural/contract checks for the manta replacement.
// npx tsx --import ./scripts/node-assets.mjs scripts/manta-check.ts [--baseline /path/to/base]
// Uses controlled deep water, not a claim about real terrain clearance or visual anatomy.
// Shader-expanded vertices may coincide in the source buffer: that is intentional.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as models from '../src/ocean/models';
import { updateMantas } from '../src/eco/animals';
import { makeBreach } from '../src/eco/breach';
import { makeRareEvents } from '../src/eco/events';
import { LOCATIONS } from '../src/data/locations';
import { seedRandom, mulberry32 } from '../src/core/math';
import { U } from '../src/render/common';

const results: Record<string, unknown> = {};
const failures: { check: string; message: string }[] = [];
const rnd = Math.random;
Math.random = mulberry32(8221);
const round = (n: number) => Number(n.toFixed(7));
const finite = (ns: Iterable<number>, what: string) => { for (const n of ns) assert(Number.isFinite(n), `${what}: non-finite number`); };
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const locFor = (id: string) => LOCATIONS.find(l => l.id === id)!;
const oceanic = (loc: any) => (loc.extraGuide || []).some((e: any) => e.id === 'manta' && e.ja === 'オニイトマキエイ');
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try { results[name] = await fn(); } catch (e) { failures.push({ check: name, message: e instanceof Error ? e.message : String(e) }); }
}
function world(id = 'miyako') {
  const loc = locFor(id), group = new THREE.Group();
  const T = { top: () => -28, h: () => -28, wet: () => true, reef: () => 0.5, slope: () => 0, shore: () => 0 };
  return { loc, T, group, mantas: [] as any[] };
}
function environment(cam: THREE.Vector3, night = 0): any {
  return { t: 0, day: 1 - night, night, twilight: 0, sunI: 1 - night, month: 1, mday: 15,
    cur: { x: 0.2, z: 0 }, cam, shy: 1, events: [], threats: [], threatsOut: [], prey: [],
    plankton: { sample: (x: number, z: number) => 0.65 + 0.1 * Math.sin(x * 0.11 + z * 0.03), consume: () => {} },
    crunch: () => {}, sound: { frenzy: () => {}, plop: () => {} } };
}
function resident(oc: ReturnType<typeof world>, dir = 1) {
  const mesh = new THREE.Mesh(models.MANTA_GEO, models.mantaMaterial(oceanic(oc.loc)));
  mesh.scale.setScalar(oceanic(oc.loc) ? 2.5 : 1.8);
  const m: any = { span: mesh.scale.x * 2, mesh, st: new THREE.Vector3(), a: 0.73, rad: 12, dir, t: 12, y: -8, pos: new THREE.Vector3() };
  oc.mantas.push(m); oc.group.add(mesh); return m;
}
function controls(mesh: THREE.Mesh) {
  const u = (mesh.material as THREE.ShaderMaterial).uniforms;
  return { phase: u.uPhase.value + U.uTime.value * u.uBeat.value,
    feed: u.uFeed.value, mouth: u.uMouth.value, air: u.uAir.value, bank: u.uBank.value, amp: u.uAmp.value };
}
function snapshot(mesh: THREE.Mesh) {
  finite([...mesh.position.toArray(), ...mesh.quaternion.toArray(), ...mesh.scale.toArray()], 'mesh transform');
  const c = controls(mesh); finite(Object.values(c), 'manta controls');
  assert(c.feed >= 0 && c.feed <= 1, 'cephalic feeding control outside 0..1');
  assert(c.mouth >= -1 && c.mouth <= 1, 'mouth control outside -1..1');
  assert(c.air >= 0 && c.air <= 1, 'air control outside 0..1');
  assert(c.amp >= 0, 'negative wing amplitude');
  return { p: mesh.position.clone(), q: mesh.quaternion.clone(), ...c };
}
function motionStats() { return { maxSpeed: 0, maxAngularSpeed: 0, maxPhaseSpeed: 0, maxMouthRate: 0, maxFeedRate: 0, maxAirRate: 0 }; }
function measure(stats: ReturnType<typeof motionStats>, before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>, dt: number) {
  stats.maxSpeed = Math.max(stats.maxSpeed, after.p.distanceTo(before.p) / dt);
  stats.maxAngularSpeed = Math.max(stats.maxAngularSpeed, after.q.angleTo(before.q) / dt);
  stats.maxPhaseSpeed = Math.max(stats.maxPhaseSpeed, angle(after.phase, before.phase) / dt);
  stats.maxMouthRate = Math.max(stats.maxMouthRate, Math.abs(after.mouth - before.mouth) / dt);
  stats.maxFeedRate = Math.max(stats.maxFeedRate, Math.abs(after.feed - before.feed) / dt);
  stats.maxAirRate = Math.max(stats.maxAirRate, Math.abs(after.air - before.air) / dt);
}
const rounded = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));

await check('geometry', () => {
  const g = models.MANTA_GEO, p = g.getAttribute('position'), attributes: Record<string, number> = {};
  assert(p.count > 0, 'empty manta geometry');
  let bytes = 0;
  for (const [name, a] of Object.entries(g.attributes)) {
    assert.equal(a.count, p.count, `${name}: vertex count differs from position`);
    finite(a.array, `geometry ${name}`); attributes[name] = a.itemSize; bytes += a.array.byteLength;
  }
  assert(g.index && g.index.count % 3 === 0, 'geometry must have complete indexed triangles');
  for (const i of g.index.array) assert(Number.isInteger(i) && i >= 0 && i < p.count, 'index outside vertex buffer');
  bytes += g.index.array.byteLength;
  const b = new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute);
  assert(Math.abs(b.min.x + 1) < 0.03 && Math.abs(b.max.x - 1) < 0.03, 'replacement breaks span = 2 × scale contract');
  assert(b.min.z < -0.5 && b.max.z > 0.2, 'head +z / trailing tail convention changed');
  assert(g.boundingBox?.containsBox(b), 'declared pose bounds do not contain the source geometry');
  return { vertices: p.count, triangles: g.index.count / 3, bytes, attributes, rawBounds: { min: b.min.toArray(), max: b.max.toArray() },
    note: 'Raw parameter geometry only; GPU expansion and appearance require the browser check.' };
});

await check('material_contract', () => {
  const a = models.mantaMaterial(), b = models.mantaMaterial(false), c = models.mantaMaterial(true);
  const own = ['uPhase', 'uFeed', 'uBeat', 'uAmp', 'uSeed', 'uMouth', 'uBank', 'uAir'];
  for (const k of own) {
    assert(a.uniforms[k] && b.uniforms[k] && c.uniforms[k], `missing ${k}`);
    assert.notEqual(a.uniforms[k], b.uniforms[k], `${k} shared between individuals`);
    assert.notEqual(b.uniforms[k], c.uniforms[k], `${k} shared between species variants`);
  }
  assert.equal(a.uniforms.uTime, U.uTime, 'shared simulation clock disconnected');
  assert.equal(a.uniforms.uMouth.value, -1, 'legacy uFeed mouth fallback disabled by default');
  assert.equal(a.uniforms.uAir.value, 0); assert.equal(a.uniforms.uBank.value, 0);
  assert.equal(a.vertexShader, b.vertexShader, 'no-argument reef caller shader differs');
  const speciesKeys = Object.keys(b.uniforms).filter(k => typeof b.uniforms[k].value === 'number' && b.uniforms[k].value !== c.uniforms[k]?.value && !['uSeed', 'uPhase'].includes(k));
  assert(speciesKeys.length || b.fragmentShader !== c.fragmentShader, 'reef/oceanic variant has no material distinction');
  a.dispose(); b.dispose(); c.dispose(); return { independentUniforms: own, speciesControls: speciesKeys, noArgumentCompatible: true };
});

for (const id of ['miyako', 'maldives', 'galapagos']) for (const dt of [1 / 60, 1 / 120, 1 / 240]) {
  await check(`routine_${id}_${Math.round(1 / dt)}hz`, () => {
    seedRandom(103); U.uTime.value = 1200;
    const oc = world(id), m = resident(oc, id === 'maldives' ? -1 : 1), cam = new THREE.Vector3(0, -7, 0), env = environment(cam);
    let consumed = 0; env.plankton.consume = (_x: number, _z: number, n: number) => { consumed += n; };
    const stats = motionStats(); let previous: ReturnType<typeof snapshot> | null = null;
    let feedMouth = 0, cruiseMouth = 0, finalMouth = 0, worstSpeedAt = 0, worstAngleAt = 0;
    for (let i = 0; i < Math.round(85 / dt); i++) {
      const t = i * dt;
      env.night = t >= 12 && t < 62 ? 1 : 0; env.day = 1 - env.night;
      U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1);
      const s = snapshot(m.mesh);
      assert(m.pos.distanceTo(m.mesh.position) < 1e-8, `world position differs from drawn position at ${t.toFixed(3)}s`);
      if (previous) {
        const speed = stats.maxSpeed, angular = stats.maxAngularSpeed;
        measure(stats, previous, s, dt);
        if (stats.maxSpeed > speed) worstSpeedAt = t;
        if (stats.maxAngularSpeed > angular) worstAngleAt = t;
      }
      previous = s;
      if (t > 10 && t < 11) cruiseMouth = s.mouth;
      if (t > 34 && t < 35) feedMouth = s.mouth;
      finalMouth = s.mouth;
    }
    assert(feedMouth > cruiseMouth + 0.25, 'feeding does not open mouth relative to cruise');
    assert(finalMouth < feedMouth - 0.25, 'mouth does not close after feeding');
    assert(consumed > 0, 'feeding stopped consuming plankton');
    assert(stats.maxSpeed < 12, `visible teleport: ${stats.maxSpeed}m/s at ${worstSpeedAt}s`);
    assert(stats.maxAngularSpeed < 4, `orientation discontinuity: ${stats.maxAngularSpeed}rad/s at ${worstAngleAt}s`);
    assert(stats.maxPhaseSpeed < 6, `wing phase discontinuity: ${stats.maxPhaseSpeed}rad/s`);
    assert(stats.maxMouthRate < 4 && stats.maxFeedRate < 3, 'mouth/cephalic control snaps on mode change');
    return { oceanic: oceanic(oc.loc), ...rounded(stats), mouth: { cruise: round(cruiseMouth), feeding: round(feedMouth), recovered: round(finalMouth) },
      consumed: round(consumed), positionMatchesMesh: true };
  });
}

await check('twilight_hysteresis', () => {
  seedRandom(101); const oc = world(), m = resident(oc), cam = new THREE.Vector3(0, -7, 0), env = environment(cam);
  const step = (night: number) => { env.night = night; env.day = 1 - night; U.uTime.value += 1 / 60; updateMantas(oc, 1 / 60, env, cam, 0, -1); };
  step(0.3); assert.equal(m.feeding, false);
  for (let i = 0; i < 120; i++) { step(i % 2 ? 0.49 : 0.51); assert.equal(m.feeding, false, 'twilight jitter repeatedly enters feeding'); }
  step(0.7); assert.equal(m.feeding, true);
  const target = m.stationTarget.clone(), radius = m.radTarget;
  for (let i = 0; i < 120; i++) { step(i % 2 ? 0.49 : 0.51); assert.equal(m.feeding, true, 'twilight jitter repeatedly exits feeding'); }
  assert(m.stationTarget.equals(target) && m.radTarget === radius, 'station repeatedly reselected around twilight');
  step(0.3); assert.equal(m.feeding, false);
  return { thresholdJitterSteps: 240, feedingEntersAndLeaves: true, targetStableDuringJitter: true };
});

// These cases inject only the random opportunity, never a flip/pending state. The controller
// must perform the preparation, eligibility checks and seven-second loop by itself.
const chanceSeeds = new Map<number, number>();
function opportunitySeed(dt: number) {
  if (chanceSeeds.has(dt)) return chanceSeeds.get(dt)!;
  let seed = 0; while (mulberry32(seed)() >= dt / 25) seed++;
  chanceSeeds.set(dt, seed); return seed;
}
function feedingFixture(id: string, scale: number, floor = -28) {
  const oc = world(id), m = resident(oc), cam = new THREE.Vector3(0, -8, 0), env = environment(cam, 1);
  oc.T.top = oc.T.h = () => floor;
  m.mesh.scale.setScalar(scale); m.span = scale * 2;
  Object.assign(m, { placed: true, feeding: true, init: true, flip: -1, rad: 6, radTarget: 6,
    swimY: -3, y: -3, vy: 0.65, pitch: -0.35, bank: 0.25, yaw: 0 });
  m.st.set(0, 0, -20); m.stationTarget = m.st.clone();
  const u = (m.mesh.material as THREE.ShaderMaterial).uniforms; u.uFeed.value = 1; u.uMouth.value = 0.9;
  return { oc, m, cam, env };
}
function poseUpperBound(mesh: THREE.Mesh) {
  mesh.updateMatrixWorld(true);
  const box = models.MANTA_GEO.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
  const sphere = models.MANTA_GEO.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
  // Each encloses all supported shader poses; intersecting their upper bounds avoids
  // claiming that an empty box corner is part of the animal.
  return Math.min(box.max.y, sphere.center.y + sphere.radius);
}
await check('natural_feeding_prepare_loop_recover', () => {
  const cases: any[] = [];
  for (const [id, scale] of [['miyako', 2.2], ['galapagos', 2.9]] as const) for (const dt of [1 / 30, 1 / 120]) {
    const { oc, m, cam, env } = feedingFixture(id, scale), initialDir = m.dir;
    let pending = false, began = false, ended = false, highest = -Infinity, startAt = -1, endAt = -1, deepest = -3, mouthMin = 1;
    let before: ReturnType<typeof snapshot> | null = null;
    const stats = motionStats();
    for (let i = 0; i < Math.round(120 / dt); i++) {
      seedRandom(i === 0 ? opportunitySeed(dt) : 0); U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1);
      const s = snapshot(m.mesh);
      assert(m.pos.distanceTo(m.mesh.position) < 1e-8, 'prepared loop world/drawn positions differ');
      if (before) measure(stats, before, s, dt); before = s;
      pending ||= !!m.loopPending; deepest = Math.min(deepest, m.pos.y);
      if (m.flip >= 0) {
        assert(pending, 'loop skipped the preparation from shallow feeding');
        assert.equal(m.dir, initialDir, 'orbit reverses while the feeding loop is active');
        if (!began) startAt = i * dt;
        began = true; highest = Math.max(highest, poseUpperBound(m.mesh));
        assert(highest < 0, `${id} span ${m.span}m loop can cross still-water surface: bound ${highest}m`);
      } else if (began && !ended) { ended = true; endAt = i * dt; }
      if (m.loopPending || m.flip >= 0) mouthMin = Math.min(mouthMin, s.mouth);
    }
    assert(pending && began && ended, `${id}: shallow feeding did not prepare, loop and recover naturally`);
    assert(deepest < -5, 'preparation did not descend to give the whole body room');
    assert(m.pos.y > -4.2 && !m.loopPending && m.flip < 0, 'animal does not return to shallow feeding after the loop');
    assert(endAt - startAt > 6.8 && endAt - startAt < 7.2, 'feeding loop duration changed unexpectedly');
    assert(mouthMin > 0.6 && controls(m.mesh).mouth > 0.6, 'filter-feeding mouth closes during preparation/loop/recovery');
    assert(stats.maxSpeed < 6 && stats.maxAngularSpeed < 4, `preparation/loop motion jumps: ${JSON.stringify(stats)}`);
    cases.push({ id, span: scale * 2, hz: Math.round(1 / dt), startAt: round(startAt), duration: round(endAt - startAt),
      deepest: round(deepest), recoveredDepth: round(m.pos.y), clearanceLowerBound: round(-highest), minimumFeedingMouth: round(mouthMin), ...rounded(stats) });
  }
  return { cases, envelope: 'Minimum of transformed conservative pose box/sphere upper bounds during the loop; static y=0 waterline, no waves.' };
});

await check('shallow_seabed_loop_suppressed', () => {
  const cases: any[] = [], dt = 1 / 60;
  for (const [id, scale] of [['miyako', 2.2], ['galapagos', 2.9]] as const) {
    const { oc, m, cam, env } = feedingFixture(id, scale, -6);
    for (let i = 0; i < 45 / dt; i++) {
      seedRandom(opportunitySeed(dt)); U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1);
      assert(!m.loopPending && m.flip < 0, `${id}: prepares a loop where the floor leaves insufficient room`);
      assert(m.pos.y > -4.2, 'animal dives into shallow floor while trying to prepare a loop');
      snapshot(m.mesh);
    }
    cases.push({ id, span: scale * 2, floor: -6, seconds: 45, pending: false, loop: false });
  }
  return { cases };
});

await check('feeding_loop_cancelled_on_day', () => {
  const cases: any[] = [], dt = 1 / 60;
  for (const [id, scale] of [['miyako', 2.2], ['galapagos', 2.9]] as const) {
    const { oc, m, cam, env } = feedingFixture(id, scale);
    seedRandom(opportunitySeed(dt)); updateMantas(oc, dt, env, cam, 0, -1);
    assert(m.loopPending, 'natural preparation did not begin before cancellation test');
    for (let i = 0; i < 2 / dt; i++) { seedRandom(0); U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1); }
    env.day = 1; env.night = 0;
    let before = snapshot(m.mesh); const stats = motionStats();
    for (let i = 0; i < 20 / dt; i++) {
      seedRandom(0); U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1);
      assert(!m.loopPending && m.flip < 0, 'daylight does not cancel a pending feeding loop');
      const s = snapshot(m.mesh); measure(stats, before, s, dt); before = s;
    }
    assert(controls(m.mesh).mouth < 0.3, 'mouth remains in feeding state after daylight cancellation');
    assert(stats.maxSpeed < 6 && stats.maxAngularSpeed < 4, 'cancelling preparation snaps the animal');
    cases.push({ id, cancelled: true, ...rounded(stats) });
  }
  return { cases };
});

await check('initial_feeding_placement', () => {
  const cases: any[] = [], dt = 1 / 60;
  for (const id of ['miyako', 'galapagos']) {
    const oc = world(id), m = resident(oc), cam = new THREE.Vector3(0, -8, 0), env = environment(cam, 1);
    seedRandom(opportunitySeed(dt)); U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1);
    assert(!m.loopPending && m.flip < 0, 'first placement immediately prepares a loop before initialization');
    assert(m.pos.y > -4.2, 'first feeding placement warps to a deep preparation target');
    assert(m.pos.distanceTo(m.mesh.position) < 1e-8);
    // A preselected station with no first swim position is another valid initialization state.
    // It isolates the random opportunity from the placement sampler's random draws.
    const f = feedingFixture(id, id === 'galapagos' ? 2.9 : 2.2);
    f.m.init = false; f.m.swimY = undefined; f.m.vy = undefined;
    seedRandom(opportunitySeed(dt)); updateMantas(f.oc, dt, f.env, f.cam, 0, -1);
    assert(!f.m.loopPending && f.m.flip < 0, 'uninitialized animal queues a loop before its first swim position');
    assert(f.m.pos.y > -4.2, 'uninitialized animal spawns at a deep loop target');
    cases.push({ id, initialDepth: round(m.pos.y), pending: false });
  }
  return { cases };
});

await check('migration_rejects_shallow_reef', () => {
  const oc = world(), m = resident(oc), cam = new THREE.Vector3(0, -8, 0), env = environment(cam);
  const wall = 15, dt = 1 / 60;
  oc.T.top = oc.T.h = (x = 0) => x >= wall ? -0.5 : -28;
  oc.T.wet = (x = 0) => x < wall;
  Object.assign(m, { placed: true, feeding: false, init: true, flip: -1, rad: 6, radTarget: 6,
    swimY: -8, y: -8, vy: 0, a: 0, pitch: 0, bank: 0.25, yaw: 0 });
  m.st.set(0, 0, 0); m.stationTarget = new THREE.Vector3(60, 0, 0);
  let maxX = -Infinity, reversals = 0, oldDir = m.dir;
  for (let i = 0; i < 90 / dt; i++) {
    U.uTime.value += dt; updateMantas(oc, dt, env, cam, 0, -1); snapshot(m.mesh);
    maxX = Math.max(maxX, m.pos.x);
    assert(m.pos.x + m.span * 0.5 < wall, 'candidate migration carries the disc footprint across a shallow reef boundary');
    if (m.dir !== oldDir) reversals++;
    oldDir = m.dir;
  }
  assert(reversals > 0, 'synthetic reef boundary did not exercise blocked migration');
  assert(m.stationTarget.x < wall, 'blocked migration keeps targeting land');
  return { seconds: 90, boundaryX: wall, maxCenterX: round(maxX), directionReversals: reversals,
    note: 'Single artificial straight reef boundary, nominal disc footprint only; not full real-terrain navigation coverage.' };
});

type BreachApi = { makeBreach: typeof makeBreach; seedRandom: typeof seedRandom; U: typeof U };
function breachRun(api: BreachApi, kind: 'manta' | 'whale', dt: number, flip = 0, id = 'miyako') {
  api.seedRandom(777); Math.random = mulberry32(944);
  const oc = world(id), cam = new THREE.Vector3(0, 1, 0), env = environment(cam);
  const b = api.makeBreach(oc); assert(b.force(kind, cam, 0, -1), 'forced breach placement failed in deep water');
  b.leap!.left = 1; if (kind === 'manta') b.leap!.flip = flip;
  const mesh = oc.group.children[kind === 'whale' ? 0 : 1] as THREE.Mesh;
  if (kind === 'manta') assert.equal((mesh.material as THREE.ShaderMaterial).uniforms.uOceanic.value, oceanic(oc.loc) ? 1 : 0, 'breach uses wrong species material');
  let previous: ReturnType<typeof snapshot> | null = null, wasVisible = false;
  const stats = motionStats(), trace: number[][] = [];
  let sawAir = false, sawRecovery = false, maxHeight = -Infinity, minMouthInAir = 1, maxMouthInAir = 0, maxAir = 0;
  let landing = null as null | { positionStep: number; angleStep: number }, exit = null as null | { positionStep: number; angleStep: number };
  let splashCount = 0; b.fx.splash = () => { splashCount++; };
  api.U.uTime.value = 0;
  for (let i = 0; i < Math.round(50 / dt); i++) {
    const prevLeap = b.leap, wasOut = !!prevLeap?.run.done, wasIn = !!prevLeap?.sw;
    // Keep it close and in front: the post-show actor must not vanish while being watched.
    if (mesh.visible) cam.copy(mesh.position).add(new THREE.Vector3(10, 3, 0));
    api.U.uCamFwd.value.copy(mesh.position).sub(cam).normalize();
    api.U.uTime.value += dt; b.update(dt, env, cam, 0, -1, kind === 'whale');
    assert(b.leap, 'breaching animal despawned while close and in front of the camera');
    if (wasVisible) assert(mesh.visible, 'breaching mesh hidden while watched');
    wasVisible ||= mesh.visible;
    finite([...mesh.position.toArray(), ...mesh.quaternion.toArray()], 'breach transform');
    trace.push([...mesh.position.toArray(), ...mesh.quaternion.toArray(), (mesh.material as THREE.ShaderMaterial).uniforms.uPhase.value].map(round));
    maxHeight = Math.max(maxHeight, mesh.position.y);
    sawAir ||= mesh.position.y > 0.2; sawRecovery ||= !!b.leap!.sw && b.leap!.sw.t > 10;
    if (kind === 'manta' && mesh.visible) {
      const s = snapshot(mesh); maxAir = Math.max(maxAir, s.air);
      if (mesh.position.y > 0.35) { minMouthInAir = Math.min(minMouthInAir, s.mouth); maxMouthInAir = Math.max(maxMouthInAir, s.mouth); }
      if (previous) {
        measure(stats, previous, s, dt);
        const edge = { positionStep: round(previous.p.distanceTo(s.p)), angleStep: round(previous.q.angleTo(s.q)) };
        if (wasOut && !exit) exit = edge;
        if (!wasIn && b.leap!.sw) landing = edge;
      }
      previous = s;
    }
  }
  assert(sawAir && sawRecovery, 'leap did not leave water and recover underwater');
  assert(splashCount >= 2, 'missing departure or landing splash');
  const recoveryDepth = mesh.position.y;
  if (kind === 'manta') {
    assert(stats.maxSpeed < 24, `breach position discontinuity: ${stats.maxSpeed}m/s`);
    assert(stats.maxAngularSpeed < 12, `breach attitude discontinuity: ${stats.maxAngularSpeed}rad/s`);
    assert(stats.maxPhaseSpeed < 24, `breach wing phase discontinuity: ${stats.maxPhaseSpeed}rad/s`);
    assert(stats.maxMouthRate < 8 && stats.maxFeedRate < 8 && stats.maxAirRate < 16, `breach visual control discontinuity: ${JSON.stringify(stats)}`);
    assert(maxAir > 0.5, 'airborne pose never engages');
    assert(maxMouthInAir < 0.3, 'mouth remains open while airborne');
    assert(controls(mesh).air < 0.05, 'air pose persists after underwater recovery');
  }
  // Turn away: cleanup is allowed once the show has ended and the actor is out of view.
  api.U.uCamFwd.value.copy(cam).sub(mesh.position).normalize();
  b.update(dt, env, cam, 0, -1, kind === 'whale');
  assert.equal(b.leap, null, 'finished actor does not retire after camera turns away');
  return { stats: rounded(stats), maxHeight: round(maxHeight), recoveryDepth: round(recoveryDepth), exit, landing,
    air: { max: round(maxAir), minMouth: round(minMouthInAir), maxMouth: round(maxMouthInAir) }, splashCount,
    traceHash: createHash('sha256').update(JSON.stringify(trace)).digest('hex'), samples: trace.length, trace };
}

for (const id of ['miyako', 'galapagos']) for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const flip of [0, Math.PI * 2, -Math.PI * 2]) {
  await check(`breach_${id}_${Math.round(1 / dt)}hz_flip${Math.sign(flip)}`, () => {
    const { trace, ...r } = breachRun({ makeBreach, seedRandom, U }, 'manta', dt, flip, id); return r;
  });
}

await check('dark_night_and_debug', () => {
  seedRandom(771); const oc = world(), cam = new THREE.Vector3(0, 1, 0), env = environment(cam, 1);
  U.uMoonIllum.value = 0; U.uAirMoon.value.set(0, -1, 0); const b = makeBreach(oc);
  for (let i = 0; i < 6000; i++) { b.update(0.1, env, cam, 0, -1, true); assert.equal(b.leap, null, 'natural breach appears on a moonless night'); }
  assert(b.force('manta', cam, 0, -1), 'explicit debug breach is incorrectly blocked at night');
  return { simulatedSeconds: 600, naturalDarkNightSuppressed: true, explicitDebugAllowed: true };
});

for (const id of ['miyako', 'galapagos']) await check(`train_${id}`, () => {
  seedRandom(543); const oc = world(id), cam = new THREE.Vector3(0, -6, 0), env = environment(cam);
  const r = makeRareEvents(oc); assert(r.start('mantatrain', env, cam, 0, -1), 'train failed to start');
  const meshes = oc.group.children.filter((m: any) => m.geometry === models.MANTA_GEO) as THREE.Mesh[];
  assert(meshes.length >= 2, 'train is not a group');
  const own = new Set(meshes.map(m => (m.material as THREE.ShaderMaterial).uniforms.uMouth));
  assert.equal(own.size, meshes.length, 'train members share mouth control');
  for (const m of meshes) assert.equal((m.material as THREE.ShaderMaterial).uniforms.uOceanic.value, oceanic(oc.loc) ? 1 : 0, 'train uses wrong species material');
  const prev = new Map<THREE.Mesh, ReturnType<typeof snapshot>>(), stats = motionStats(); let visible = 0;
  for (let i = 0; i < 50 * 60; i++) {
    U.uTime.value += 1 / 60; r.update(1 / 60, env, cam, 0, -1);
    for (const m of meshes) if (m.visible) { visible++; const s = snapshot(m); const p = prev.get(m); if (p) measure(stats, p, s, 1 / 60); prev.set(m, s); }
  }
  assert(visible > 0, 'train never enters view'); assert(stats.maxSpeed < 3, 'train motion jumps');
  assert(stats.maxPhaseSpeed < 6, 'train wing phase jumps');
  const subjects: any[] = []; r.subjects(subjects); assert(subjects.some(s => s.key === 'rare:mantatrain' && s.pos()), 'director loses train subject');
  r.running?.dispose(); return { members: meshes.length, oceanic: oceanic(oc.loc), ...rounded(stats), subjectAvailable: true };
});

const baselineArg = process.argv.indexOf('--baseline');
if (baselineArg >= 0) await check('baseline_regression', async () => {
  const base = resolve(process.argv[baselineArg + 1]);
  const read = (root: string, file: string) => readFileSync(resolve(root, file), 'utf8');
  const stripManta = (s: string) => s.replace(/\/\* ---------- manta ---------- \*\/[\s\S]*?(?=\/\* ---------- humpback whale ---------- \*\/)/, '');
  assert.equal(stripManta(read(base, 'src/ocean/models.ts')), stripManta(read(process.cwd(), 'src/ocean/models.ts')), 'non-manta procedural models/shaders changed');
  const turtlePart = (s: string) => s.split('export function updateMantas(')[0];
  assert.equal(turtlePart(read(base, 'src/eco/animals.ts')), turtlePart(read(process.cwd(), 'src/eco/animals.ts')), 'turtle update changed');
  const load = (file: string) => import(pathToFileURL(resolve(base, file)).href);
  const [bb, bm, bu] = await Promise.all([load('src/eco/breach.ts'), load('src/core/math.ts'), load('src/render/common.ts')]);
  const a = breachRun({ makeBreach, seedRandom, U }, 'whale', 1 / 60);
  const b = breachRun({ makeBreach: bb.makeBreach, seedRandom: bm.seedRandom, U: bu.U }, 'whale', 1 / 60);
  assert.equal(a.traceHash, b.traceHash, 'same-seed humpback motion changed');
  return { nonMantaModelsUnchanged: true, turtleUpdateUnchanged: true, whaleTraceIdentical: true, whaleSamples: a.samples, whaleTraceHash: a.traceHash };
});
else results.baseline_regression = { skipped: true, reason: 'Pass --baseline <unmodified checkout> for whale/non-manta regression comparison.' };

Math.random = rnd;
console.log(JSON.stringify({ ok: failures.length === 0, limitations: [
  'Controlled flat deep water: real seabed intersections are not covered.',
  'Checks animation controls and actor transforms, not GPU-deformed anatomy, shader compilation, or appearance.',
  'No hardware performance benchmark or biological field validation.'
], results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
