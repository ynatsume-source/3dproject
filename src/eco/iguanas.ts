// A marine iguana comes down to graze. Now and then by day (they feed when the sun has warmed them) one swims in
// along the surface from out of sight (eco/unseen), its legs folded back and its flattened tail sweeping; over a
// shallow rock near the drone it dives, head first, and grips the rock with its claws against the surge, biting at
// the algae with its head turned sideways, its tail swaying; after a minute or two it lets go and rises to the surface
// and swims off along it, taken away only once out of sight.
import * as THREE from 'three';
import { R, rr, hyp, clamp } from '../core/math';
import { IGUANA_GEO, iguanaMaterial, IG_FEET } from '../ocean/iguana';
import { logEvent, type Env, type Subject } from './env';
import { unseen, behind } from './unseen';

// a species: its length range (m, snout to tail tip), how often one comes down (s), how deep it will graze (m)
export interface IguanaSpec { id: string; ja: string; sci: string; note: string; len: [number, number]; every: [number, number]; deep: [number, number] }

type Phase = 'surface' | 'dive' | 'graze' | 'rise' | 'leave';
const MAX = 1;
export function makeIguanas(oc: any) {
  const spec: IguanaSpec | undefined = oc.loc.iguanas;
  if (!spec) return null;
  const geo = IGUANA_GEO.clone();
  const aIg = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), aIg2 = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  aIg.setUsage(THREE.DynamicDrawUsage); aIg2.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aIg', aIg); geo.setAttribute('aIg2', aIg2);
  const mesh = new THREE.InstancedMesh(geo, iguanaMaterial(), MAX);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
  oc.group.add(mesh);
  return { spec, mesh, aIg, aIg2, active: false, force: false, next: rr(90, 200), phase: 'surface' as Phase, t: 0, dur: 0,
    pos: new THREE.Vector3(), head: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3(), target: new THREE.Vector3(), len: 1, age: 0.5, seed: 0,
    ph: 0, swim: 0, legs: 0, pitch: 0, bite: 0, sway: 0, tilt: 0, roll: 0, away: 0, logged: false };
}
export type Iguanas = NonNullable<ReturnType<typeof makeIguanas>>;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _w = new THREE.Vector3();

// a rock to graze on: near the drone and in its view, shallow enough, and level enough to grip
function findRock(oc: any, I: Iguanas, cam: THREE.Vector3, fx: number, fz: number) {
  const T = oc.T, sp = I.spec, fl = hyp(fx, fz) || 1;
  let best: THREE.Vector3 | null = null, bestS = -1e9;
  for (let k = 0; k < 260; k++) {
    // (called from the guide, it may be some way off: the drone goes to it)
    const a = Math.atan2(fz, fx) + (I.force ? rr(-3.14, 3.14) : rr(-1.1, 1.1)), d = rr(6, I.force ? 45 : 20), x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d, top = T.top(x, z);
    if (-top < sp.deep[0] || -top > sp.deep[1]) continue;
    // (level enough under its whole length to lie along and grip: eight ways round, half a metre out)
    let rough = 0; for (let k2 = 0; k2 < 8; k2++) { const b2 = k2 * Math.PI / 4; for (const r2 of [0.25, 0.5]) rough = Math.max(rough, Math.abs(T.top(x + Math.cos(b2) * r2, z + Math.sin(b2) * r2) - top) / r2 * 0.5); }
    if (rough > 0.16) continue;
    const s = -Math.abs(d - 10) * (I.force ? 0.05 : 0.2) - rough * 4 + ((x - cam.x) * fx + (z - cam.z) * fz) / (d * fl) + top * 0.1;
    if (s > bestS) { bestS = s; best = new THREE.Vector3(x, top, z); }
  }
  return best;
}

function start(oc: any, I: Iguanas, cam: THREE.Vector3, fx: number, fz: number) {
  const rock = findRock(oc, I, cam, fx, fz);
  if (!rock) return false;
  // put in along the surface out to one side of the drone and out of its sight, to swim in to the rock
  const side = R() < 0.5 ? -1 : 1;
  for (let k = 0; k < 8; k++) {
    const at = behind(oc, cam, fx, fz, I.force ? rr(23, 27) : rr(28, 36), 1.5, side * (Math.PI - rr(1.5, 1.9)));
    if (!at) continue;
    const p = new THREE.Vector3(at.x, -0.18, at.z);
    I.len = rr(I.spec.len[0], I.spec.len[1]);
    if (!unseen(oc, p.x, p.y, p.z, cam, fx, fz, I.len)) continue;
    I.pos.copy(p); I.target.copy(rock); I.head.set(rock.x - p.x, 0, rock.z - p.z).normalize(); I.vel.copy(I.head).multiplyScalar(0.5);
    I.age = clamp((I.len - I.spec.len[0]) / (I.spec.len[1] - I.spec.len[0]), 0, 1); I.seed = R();
    I.active = true; I.phase = 'surface'; I.t = 0; I.swim = 1; I.legs = 0; I.pitch = 0; I.logged = false;
    return true;
  }
  return false;
}

export function updateIguanas(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const I: Iguanas | null = oc.iguanas;
  if (!I) return;
  const T = oc.T;
  if (!I.active) {
    I.mesh.count = 0;
    I.next -= dt;
    if ((I.next > 0 || env.night > 0.4) && !I.force) return;
    if (!start(oc, I, cam, fx, fz)) { I.next = I.force ? 3 : 20; return; }
    I.force = false;
  }
  I.t += dt;
  const L = I.len, stand = T.top(I.target.x, I.target.z) + IG_FEET * L;
  let want = 0.6, swim = 1, legs = 0, pitch = 0, face: THREE.Vector3 | null = null;
  _w.set(0, 0, 0);
  const was = I.phase;   // (the frame it settles or lets go, it still moves as it was moving)
  switch (I.phase) {
    case 'surface': {
      // along the surface, head up, to above the rock
      _w.set(I.target.x - I.pos.x, -0.18 - I.pos.y, I.target.z - I.pos.z);
      if (hyp(_w.x, _w.z) < 1.2 + -I.target.y * 0.35) { I.phase = 'dive'; I.t = 0; }
      break;
    }
    case 'dive': {
      // head first, steeply down to the rock
      _w.set(I.target.x - I.pos.x, stand + 0.04 - I.pos.y, I.target.z - I.pos.z);
      want = 0.5;
      if (_w.length() < 0.12 || (I.t > 25 && _w.length() < 0.6)) {
        I.phase = 'graze'; I.t = 0; I.dur = rr(50, 110);
        if (!I.logged) { I.logged = true; logEvent(env, 'iguana', `${I.spec.ja}が潜ってきて、岩に爪を立てて藻を食べている`, I.pos.x, I.pos.z, () => (I.active ? I.pos : null)); }
      }
      if (I.t > 60) { I.phase = 'rise'; I.t = 0; }
      break;
    }
    case 'graze': {
      // gripping the rock: still, the head biting at it, the tail swaying in the surge; it turns a little now and then
      want = 0; swim = 0; legs = 1;
      I.bite += dt * (1.6 + 0.6 * Math.sin(I.t * 0.3));
      pitch = 0.35 + 0.22 * Math.max(0, Math.sin(I.bite)) ;
      if (Math.sin(I.t * 0.11 + I.seed * 6) > 0.97) { const a = 0.4 * dt; const c = Math.cos(a), s = Math.sin(a); I.head.set(I.head.x * c - I.head.z * s, 0, I.head.x * s + I.head.z * c).normalize(); }
      // (settling onto its holdfast: its way slowing to nothing, no jolt)
      I.vel.lerp(_w.set((I.target.x - I.pos.x) * 1.5, (stand - I.pos.y) * 1.5, (I.target.z - I.pos.z) * 1.5), 1 - Math.exp(-dt * 2.5));
      I.pos.addScaledVector(I.vel, dt);
      if (I.pos.y < stand) { I.pos.y += (stand - I.pos.y) * Math.min(1, dt * 6); if (I.vel.y < 0) I.vel.y = 0; }   // (its feet on the rock, not through it)
      if (I.t > I.dur) { I.phase = 'rise'; I.t = 0; }
      break;
    }
    case 'rise': {
      // lets go and swims up, on along its way, to the surface
      _w.set(I.head.x * 1.2, -0.18 - I.pos.y, I.head.z * 1.2);
      want = 0.45;
      if (I.pos.y > -0.4) { I.phase = 'leave'; I.t = 0; const back = Math.atan2(-fz, -fx); I.away = back + (R() < 0.5 ? -1 : 1) * rr(0.4, 1.0); }
      break;
    }
    case 'leave': {
      // off along the surface, past the drone's side and away behind it
      _w.set(Math.cos(I.away) * 50 + cam.x - I.pos.x, -0.18 - I.pos.y, Math.sin(I.away) * 50 + cam.z - I.pos.z);
      want = 0.6;
      if (I.t > 8 && unseen(oc, I.pos.x, I.pos.y, I.pos.z, cam, fx, fz, L)) { I.active = false; I.mesh.count = 0; I.next = rr(I.spec.every[0], I.spec.every[1]); return; }
      break;
    }
  }
  if (was !== 'graze') {
    const d = _w.length();
    _w.multiplyScalar(Math.min(want, d * 1.5) / Math.max(d, 1e-3));
    I.vel.lerp(_w, 1 - Math.exp(-dt * 1.5));
    // (not into the drone, nor into the rock but where it means to land)
    _s.subVectors(I.pos, cam); const cd = _s.length(); if (cd < 0.9 + L * 0.4) I.vel.addScaledVector(_s, (0.9 + L * 0.4 - cd) * dt * 3 / Math.max(cd, 0.1));
    // (rock rising ahead of it or under it: it rises over it in good time)
    const fl = Math.max(T.top(I.pos.x, I.pos.z), T.top(I.pos.x + I.head.x * L * 0.45, I.pos.z + I.head.z * L * 0.45), T.top(I.pos.x + I.vel.x * 1.2, I.pos.z + I.vel.z * 1.2)) + IG_FEET * L + (I.phase === 'dive' ? 0 : 0.08);
    if (I.pos.y < fl + 0.1 && !(I.phase === 'dive' && hyp(I.target.x - I.pos.x, I.target.z - I.pos.z) < 0.3)) I.vel.y += clamp(fl + 0.1 - I.pos.y, 0, 0.5) * dt * 4;
    I.pos.addScaledVector(I.vel, dt);
    // (and never into the rock right under it)
    const under = T.top(I.pos.x, I.pos.z) + IG_FEET * L;
    if (I.pos.y < under) { I.pos.y += (under - I.pos.y) * Math.min(1, dt * 6); if (I.vel.y < 0) I.vel.y *= 0.5; }
    I.pos.y = Math.min(I.pos.y, -0.12);
    const hv = hyp(I.vel.x, I.vel.z);
    if (hv > 0.05) face = _s.set(I.vel.x / hv, 0, I.vel.z / hv);
    if (face) I.head.lerp(face, 1 - Math.exp(-dt * 2)).normalize();
  }
  // its attitude: head up at the surface, nose down diving, level on the rock (tilted with it), nose up rising
  const vy = I.vel.y, hv = hyp(I.vel.x, I.vel.z) || 1e-3;
  let tilt = I.phase === 'graze' ? -Math.atan2(T.top(I.pos.x + I.head.x * L * 0.3, I.pos.z + I.head.z * L * 0.3) - T.top(I.pos.x - I.head.x * L * 0.3, I.pos.z - I.head.z * L * 0.3), L * 0.6) : -Math.atan2(vy, hv);
  if (I.phase === 'surface' || I.phase === 'leave') tilt = -0.12;
  I.tilt += (clamp(tilt, -1.0, 1.0) - I.tilt) * Math.min(1, dt * 2);
  I.swim += (swim - I.swim) * Math.min(1, dt * 2); I.legs += (legs - I.legs) * Math.min(1, dt * 1.5); I.pitch += (pitch - I.pitch) * Math.min(1, dt * 4);
  I.ph += dt * (1.2 + 2.2 * I.swim);
  I.sway = Math.sin(env.t * 0.6 + I.seed * 5) * (0.4 + 0.6 * I.legs);   // (the surge rocks the tail; more when it holds still)
  // (on the rock, rolled with its slope across as well)
  const side = I.phase === 'graze' ? Math.atan2(T.top(I.pos.x - I.head.z * L * 0.12, I.pos.z + I.head.x * L * 0.12) - T.top(I.pos.x + I.head.z * L * 0.12, I.pos.z - I.head.x * L * 0.12), L * 0.24) : 0;
  I.roll += (clamp(-side, -0.5, 0.5) - I.roll)   /* (+ roll lifts its left side: the right side higher, roll the other way) */ * Math.min(1, dt * 2);
  _e.set(I.tilt, Math.atan2(I.head.x, I.head.z), I.roll, 'YXZ');
  _q.setFromEuler(_e); _m.compose(I.pos, _q, _s.setScalar(L));
  I.mesh.setMatrixAt(0, _m);
  const A = I.aIg.array as Float32Array, B = I.aIg2.array as Float32Array;
  A[0] = I.ph; A[1] = I.swim; A[2] = I.legs; A[3] = I.pitch;
  B[0] = I.age; B[1] = I.seed; B[2] = I.sway; B[3] = 0;
  I.mesh.count = 1;
  I.mesh.instanceMatrix.needsUpdate = true; I.aIg.needsUpdate = true; I.aIg2.needsUpdate = true;
}

export function iguanaSubjects(oc: any, out: Subject[], focus = false) {
  const I: Iguanas | null = oc.iguanas;
  if (!I || !I.active) return;
  const sp = I.spec;
  out.push({ key: focus ? 'focus:iguana' : 'iguana', label: sp.ja, len: I.len, adult: sp.len[1], lenK: 0.25, lenWhat: '全長', kind: 'turtle', prio: focus ? 5 : 4.2, size: I.len, pos: () => I.pos,
    heading: () => ({ x: I.head.x, z: I.head.z }),
    status: () => (I.phase === 'surface' ? '水面を泳いでくる' : I.phase === 'dive' ? '岩をめざして潜っていく' : I.phase === 'graze' ? '岩に爪を立てて、藻を食べている' : I.phase === 'rise' ? '息つぎに水面へ上がっていく' : '水面を泳いで去っていく'),
    live: () => I.active && I.phase !== 'leave' });
}
