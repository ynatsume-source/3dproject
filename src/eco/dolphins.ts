// A pod of dolphins coming by. Every few minutes by day a pod sweeps in from out of sight behind the drone, passes
// it close and fast, and goes on its way out of sight again: never put down where it could be seen, nor taken away
// while it can be (eco/unseen, CLAUDE.md "生き物は無から出ない"). As they pass, one or two of the curious ones peel
// off to look the drone over from a few metres, circling it, before racing to catch up; each goes up to breathe
// every half-minute or so; and a spinner, now and then, bursts out of the water and spins on its long axis
// before falling back with a slap. The pod swims as dolphins do: close, abreast and in file, each keeping its
// own place and its own beat, turning together.
import * as THREE from 'three';
import { R, rr, hyp, clamp } from '../core/math';
import { dolphinGeometry, dolphinMaterial, type DolphinStyle } from '../ocean/dolphin';
import { logEvent, type Env, type Subject } from './env';
import { unseen, behind, sightRange, clearDepth } from './unseen';
import { ageOf } from './growth';

// a species: its pod size, its length range, how often a pod comes by (s), how many of a pod come to look, how often
// a breath ends in a leap
export interface DolphinSpec { id: string; ja: string; sci: string; note: string; style: DolphinStyle; pod: [number, number]; len: [number, number]; every: [number, number]; curious: number; leaps: number }

interface Dol {
  pos: THREE.Vector3; vel: THREE.Vector3; off: THREE.Vector3; len: number; age: number; ph: number; beat: number;
  breath: number; up: number;                 // (s to the next breath; > 0 while going up for one)
  leap: null | { t: number; vy: number; spin: number; vx: number; vz: number; y0: number; splashed: boolean };
  look: number; lookA: number;                // (> 0: off to look the drone over, s left; the angle it circles at)
  roll: number;
}

const MAX = 16;
export function makeDolphins(oc: any) {
  const spec: DolphinSpec | undefined = oc.loc.dolphins;
  if (!spec) return null;
  const geo = dolphinGeometry(spec.style).clone();
  const aDol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); aDol.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aDol', aDol);
  const mesh = new THREE.InstancedMesh(geo, dolphinMaterial(spec.style), MAX);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
  oc.group.add(mesh);
  const fx = { splash: (_x: number, _z: number, _scale: number, _r: number) => {}, bubbles: (_x: number, _y: number, _z: number, _n?: number) => {} };
  return {
    spec, mesh, aDol, fx, members: [] as Dol[], active: false, force: false, next: rr(40, 100), t: 0,
    c: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), speed: 3, depth: -3, phase: 'in' as 'in' | 'near' | 'out', passT: 0, leaving: 0, logged: { near: false, look: 0, leap: 0 },
  };
}
export type Dolphins = NonNullable<ReturnType<typeof makeDolphins>>;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3();

function start(oc: any, D: Dolphins, cam: THREE.Vector3, fx: number, fz: number) {
  const sp = D.spec, n = Math.round(rr(sp.pod[0], sp.pod[1]));
  // out of sight behind the drone, in water deep enough; heading to pass it a few metres to one side and on ahead
  const at = behind(oc, cam, fx, fz, rr(34, 46), 5);
  if (!at) return false;
  const side = R() < 0.5 ? -1 : 1, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
  const passX = cam.x + ux * rr(6, 14) - uz * side * rr(5, 10), passZ = cam.z + uz * rr(6, 14) + ux * side * rr(5, 10);
  D.dir.set(passX - at.x, 0, passZ - at.z).normalize();
  D.c.set(at.x, 0, at.z);
  D.depth = clearDepth(oc, at.x, at.z, D.dir.x, D.dir.z, rr(-4.5, -2.2), 2, 2.5, 10);
  D.c.y = D.depth;
  D.members = [];
  for (let i = 0; i < n; i++) {
    // abreast and in file: rows of two to four, a couple of metres apart, a little stagger up and down
    const row = Math.floor(i / 3), col = (i % 3) - 1;
    const off = new THREE.Vector3(col * rr(1.4, 2.2) + (R() - 0.5) * 0.6, (R() - 0.5) * 1.4, -row * rr(1.8, 2.6) + (R() - 0.5) * 0.6);
    const len = sp.len[0] + (sp.len[1] - sp.len[0]) * Math.pow(R(), 0.7) * (R() < 0.15 ? 0.6 : 1);   // (now and then a calf)
    const p = new THREE.Vector3(D.c.x - D.dir.z * off.x + D.dir.x * off.z, D.depth + off.y, D.c.z + D.dir.x * off.x + D.dir.z * off.z);
    D.members.push({ pos: p, vel: D.dir.clone().multiplyScalar(3), off, len, age: clamp(ageOf(len, sp.len[1], 0.3) / ageOf(sp.len[1] * 1.05, sp.len[1], 0.3), 0, 1), ph: R() * 6.28, beat: 0.8, breath: rr(6, 40), up: 0, leap: null, look: 0, lookA: R() * 6.28, roll: 0 });
  }
  // (all of it out of sight as it is put down)
  if (D.members.some((d) => !unseen(oc, d.pos.x, d.pos.y, d.pos.z, cam, fx, fz, d.len))) return false;
  D.active = true; D.t = 0; D.phase = 'in'; D.speed = 3.2; D.leaving = 0; D.passT = 0; D.logged = { near: false, look: 0, leap: 0 };
  return true;
}

export function updateDolphins(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const D: Dolphins | null = oc.dolphins;
  if (!D) return;
  const sp = D.spec, T = oc.T;
  if (!D.active) {
    D.mesh.count = 0;
    D.next -= dt;
    // by day (at night they are off in deep water feeding), or when someone is waiting to see them
    if ((D.next > 0 || env.night > 0.6) && !D.force) return;
    if (!start(oc, D, cam, fx, fz)) { D.next = 8; return; }
    D.force = false;
  }
  D.t += dt;
  // the pod's own course: on to the pass, slowing as it comes by the drone, then on its way and gone out of sight
  const dc = hyp(D.c.x - cam.x, D.c.z - cam.z);
  if (D.phase === 'in' && dc < 16) { D.phase = 'near'; D.passT = D.t; if (!D.logged.near) { D.logged.near = true; logEvent(env, 'dolphin', `${sp.ja}の群れが、すぐそばを泳ぎ抜けていく`, D.c.x, D.c.z, () => (D.active ? D.c : null)); } }
  if (D.phase === 'near' && (D.t - D.passT > 22 || dc > 26)) D.phase = 'out';
  const want = D.phase === 'in' ? 3.2 : D.phase === 'near' ? 1.7 : 3.4;
  D.speed += (want - D.speed) * Math.min(1, dt * 0.5);
  // (keep to water deep enough: of the headings a little either side, the one with the most water ahead)
  let best = 0, bestD = -1e9;
  for (const a of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const ca = Math.cos(a), sa = Math.sin(a), dx = D.dir.x * ca - D.dir.z * sa, dz = D.dir.x * sa + D.dir.z * ca;
    let top = -1e9; for (let d = 6; d <= 24; d += 6) top = Math.max(top, T.top(D.c.x + dx * d, D.c.z + dz * d));
    const score = Math.min(-top, 8) - Math.abs(a) * 3;
    if (score > bestD) { bestD = score; best = a; }
  }
  const turn = clamp(best, -0.25, 0.25) * dt, ct = Math.cos(turn), st = Math.sin(turn);
  D.dir.set(D.dir.x * ct - D.dir.z * st, 0, D.dir.x * st + D.dir.z * ct).normalize();
  D.c.x += D.dir.x * D.speed * dt; D.c.z += D.dir.z * D.speed * dt;
  D.depth += (clearDepth(oc, D.c.x, D.c.z, D.dir.x, D.dir.z, D.depth, 3, 2.5, 12) - D.depth) * Math.min(1, dt * 0.4);
  // gone only when the whole pod is out of sight, on its way out
  if (D.phase === 'out') {
    D.leaving += dt;
    if (D.leaving > 6 && D.members.every((d) => !d.leap && unseen(oc, d.pos.x, d.pos.y, d.pos.z, cam, fx, fz, d.len))) { D.active = false; D.mesh.count = 0; D.next = rr(sp.every[0], sp.every[1]); return; }
  }
  // the curious: one or two peel off while it is close
  if (D.phase === 'near' && D.logged.look < sp.curious && R() < dt * 0.25) {
    const free = D.members.filter((d) => d.look <= 0 && !d.leap && d.len > sp.len[0] * 0.8);
    if (free.length) { const d = free[Math.floor(R() * free.length)]; d.look = rr(8, 13); d.lookA = Math.atan2(d.pos.z - cam.z, d.pos.x - cam.x); D.logged.look++;
      if (D.logged.look === 1) logEvent(env, 'dolphin', `${sp.ja}が一頭、こちらをのぞきこみに来た`, d.pos.x, d.pos.z, () => (D.active ? d.pos : null)); }
  }
  const A = D.aDol.array as Float32Array;
  D.members.forEach((d, i) => {
    // where it wants to be: its place in the pod, or circling the drone at a few metres while it looks
    if (d.look > 0) {
      d.look -= dt;
      d.lookA += dt * 0.45;
      const r = 3.2 + d.len * 0.6;
      _t.set(cam.x + Math.cos(d.lookA) * r, cam.y + Math.sin(D.t * 0.7 + i) * 0.4, cam.z + Math.sin(d.lookA) * r);
      _t.y = Math.min(_t.y, -0.8);
    } else {
      const sway = Math.sin(D.t * 0.5 + i * 1.7) * 0.5;
      _t.set(D.c.x - D.dir.z * (d.off.x + sway) + D.dir.x * d.off.z, D.depth + d.off.y, D.c.z + D.dir.x * (d.off.x + sway) + D.dir.z * d.off.z);
    }
    // breathing: every half minute or so up to the surface in a smooth arc, a moment there, and down again
    d.breath -= dt;
    if (d.breath < 0 && !d.leap) {
      d.up += dt;
      const k = d.up / 4.5;
      _t.y = _t.y + (-0.12 - _t.y) * Math.sin(Math.min(1, k) * Math.PI);
      // a spinner, now and then, goes on up and out of the water instead: a spinning leap
      if (k > 0.45 && k < 0.5 && sp.leaps > 0 && R() < sp.leaps && d.look <= 0) {
        const sv = Math.max(3.5, d.vel.length());
        d.leap = { t: 0, vy: rr(5.2, 6.8), spin: (R() < 0.5 ? -1 : 1) * rr(2, 4) * Math.PI * 2, vx: D.dir.x * sv * 0.8, vz: D.dir.z * sv * 0.8, y0: d.pos.y, splashed: false };
        D.fx.splash(d.pos.x, d.pos.z, 0.05, 0.5);
        if (D.logged.leap++ === 0 || R() < 0.3) logEvent(env, 'dolphin', `${sp.ja}が水面から跳び上がり、くるくると回った`, d.pos.x, d.pos.z, () => (D.active ? d.pos : null));
      }
      if (k >= 1) { d.up = 0; d.breath = rr(22, 50); }
    }
    let roll = Math.sin(D.t * 0.6 + i) * 0.08;
    if (d.leap) {
      // in the air: on a ballistic arc, spinning about its long axis; a slap and a splash as it comes down
      const L = d.leap; L.t += dt;
      L.vy -= 9.8 * dt;
      d.pos.x += L.vx * dt; d.pos.z += L.vz * dt; d.pos.y += L.vy * dt;
      d.vel.set(L.vx, L.vy, L.vz);
      roll = L.spin * Math.min(1, L.t / (2 * 6 / 9.8));
      if (!L.splashed && L.vy < 0 && d.pos.y < 0.2) { L.splashed = true; D.fx.splash(d.pos.x, d.pos.z, 0.09, 0.8); D.fx.bubbles(d.pos.x, -0.6, d.pos.z, 4); }
      if (d.pos.y < -1.0 && L.vy < 0) { d.leap = null; d.up = 0; d.breath = rr(25, 50); d.vel.multiplyScalar(0.5); }
    } else {
      // swimming: steer for its place at a dolphin's pace, a limited turn, and keep off the reef
      _w.subVectors(_t, d.pos);
      const dist = _w.length(), maxS = d.look > 0 ? 2.4 : D.speed * 1.5 + 0.8;
      _w.multiplyScalar(Math.min(maxS, dist * 1.4) / Math.max(dist, 1e-3));
      d.vel.lerp(_w, 1 - Math.exp(-dt * 1.6));
      // (and give the drone room: not through it)
      _s.subVectors(d.pos, cam); const cd = _s.length(); if (cd < 2.2) d.vel.addScaledVector(_s, (2.2 - cd) * 1.5 / Math.max(cd, 0.1));
      d.pos.addScaledVector(d.vel, dt);
      const fl = T.top(d.pos.x, d.pos.z) + 0.8;
      if (d.pos.y < fl) { d.pos.y += (fl - d.pos.y) * Math.min(1, dt * 3); if (d.vel.y < 0) d.vel.y *= 0.5; }
      d.pos.y = Math.min(d.pos.y, -0.1);
    }
    d.roll += (roll - d.roll) * (d.leap ? 1 : Math.min(1, dt * 2));
    // the stroke: faster and harder the faster it goes
    const sp2 = d.vel.length();
    d.ph += dt * (3.5 + sp2 * 2.2) * (d.leap ? 0.2 : 1);
    d.beat += ((d.leap ? 0.15 : 0.55 + Math.min(0.6, sp2 * 0.15)) - d.beat) * Math.min(1, dt * 2);
    const hs = hyp(d.vel.x, d.vel.z) || 1e-3;
    _e.set(-Math.atan2(d.vel.y, hs) * (d.leap ? 1 : 0.8), Math.atan2(d.vel.x, d.vel.z), d.roll, 'YXZ');
    _q.setFromEuler(_e); _m.compose(d.pos, _q, _s.setScalar(d.len));
    D.mesh.setMatrixAt(i, _m);
    A[i * 4] = d.ph; A[i * 4 + 1] = d.beat; A[i * 4 + 2] = d.age; A[i * 4 + 3] = (i * 0.37) % 1;
  });
  D.mesh.count = D.members.length;
  D.mesh.instanceMatrix.needsUpdate = true; D.aDol.needsUpdate = true;
}

export function dolphinSubjects(oc: any, out: Subject[], focus = false) {
  const D: Dolphins | null = oc.dolphins;
  if (!D || !D.active) return;
  const sp = D.spec, mid = new THREE.Vector3();
  const lead = D.members.reduce((a, b) => (b.len > a.len ? b : a), D.members[0]);
  const pos = () => {
    // (the middle of the pod, or the curious one when it is close by)
    const looker = D.members.find((d) => d.look > 0);
    if (looker) return looker.pos;
    mid.set(0, 0, 0); for (const d of D.members) mid.add(d.pos); return mid.multiplyScalar(1 / D.members.length);
  };
  out.push({ key: focus ? 'focus:dolphin' : 'dolphins', label: `${sp.ja}の群れ`, len: lead.len, adult: sp.len[1], lenK: 0.3, lenWhat: '体長', kind: 'giant', prio: focus ? 5 : 4.4, size: 5, pos,
    heading: () => ({ x: D.dir.x, z: D.dir.z }),
    status: () => (D.members.some((d) => d.leap) ? '水面から跳び上がった！' : D.members.some((d) => d.look > 0) ? '一頭がこちらをのぞきこんでいる' : D.phase === 'in' ? '群れで近づいてくる' : D.phase === 'near' ? 'すぐそばを群れで泳いでいる' : '沖へ泳ぎ去っていく'),
    live: () => D.active && D.phase !== 'out' });
}
