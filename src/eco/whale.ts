// Humpback whales in their winter breeding season. Every few minutes a pod passes the drone at a
// distance, cruising slowly in mid-water: most often a mother with her calf (sometimes shadowed by an
// escort male), now and then a lone male. The calf rises to breathe every few minutes. Out of season
// the sea is empty of them — they are in their feeding grounds far to the north.
import * as THREE from 'three';
import { R, rr } from '../core/math';
import { WHALE_GEO, whaleMaterial } from '../ocean/models';
import { logEvent, type Env, type Subject } from './env';

export interface WhaleSeason { from: [number, number]; to: [number, number] }   // [month, day], inclusive, wrapping the new year

export function inSeason(month: number, day: number, s: WhaleSeason) {
  const v = month * 100 + day, a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

interface Whale { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; len: number; role: 'mother' | 'calf' | 'escort' | 'single'; off: THREE.Vector3; pos: THREE.Vector3; breath: number; logged: boolean }

export function makeWhales(oc: any) {
  const mk = (len: number, role: Whale['role'], seed: number): Whale => {
    const mat = whaleMaterial(seed);
    const mesh = new THREE.Mesh(WHALE_GEO, mat); mesh.scale.setScalar(len); mesh.visible = false; mesh.frustumCulled = false;
    oc.group.add(mesh);
    return { mesh, mat, len, role, off: new THREE.Vector3(), pos: new THREE.Vector3(), breath: 0, logged: false };
  };
  return {
    all: [mk(13.5, 'mother', 0.21), mk(4.6, 'calf', 0.63), mk(12.5, 'escort', 0.87)],
    pod: [] as Whale[], active: false, t: 0, next: rr(40, 90), dur: 0,
    start: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 1.2, depth: -7, song: 0, seasonal: false,
  };
}
export type Whales = ReturnType<typeof makeWhales>;

const _p = new THREE.Vector3();
export function updateWhales(oc: any, dt: number, env: Env, cam: THREE.Vector3, season: boolean) {
  const W: Whales | undefined = oc.whales;
  if (!W) return;
  W.seasonal = season;
  const T = oc.T;
  if (!W.active) {
    for (const w of W.all) w.mesh.visible = false;
    if (!season) return;
    W.next -= dt;
    if (W.next > 0) return;
    // a pod appears out of the blue, crosses in front of the drone, and fades back into it
    // pick a line across the drone's view with water deep enough all the way along it; over a shallow
    // reef there is none, and the whales stay out in deeper water until the drone moves on
    const run = 150;
    let best = -1e9;
    for (let k = 0; k < 60; k++) {
      const head = R() * Math.PI * 2, pass = rr(14, 40) * (R() < 0.5 ? 1 : -1);
      const dx = Math.cos(head), dz = Math.sin(head), sx0 = cam.x - dz * pass - dx * run / 2, sz0 = cam.z + dx * pass - dz * run / 2;
      let top = -1e9;
      for (let d = 0; d <= run && -top > best; d += 3) for (const o of [-4, 0, 4]) top = Math.max(top, T.top(sx0 + dx * d - dz * o, sz0 + dz * d + dx * o));
      if (-top > best) { best = -top; W.dir.set(dx, 0, dz); W.start.set(sx0, 0, sz0); }
      if (top < -10) break;
    }
    if (best < 5.5) { W.next = 30; return; }
    W.depth = Math.max(-8, Math.min(-2.2, -best + 3.3));   // near the surface, a steady few metres over the highest reef on the way
    const q = R();
    const [mother, calf, escort] = W.all;
    W.pod = q < 0.62 ? [mother, calf] : q < 0.82 ? [mother, calf, escort] : [escort];
    if (W.pod.length === 1) escort.role = 'single'; else escort.role = 'escort';
    mother.off.set(0, 0, 0); calf.off.set(3.2, 1.6, 3.5); escort.off.set(W.pod.length === 1 ? 0 : -7, -0.5, W.pod.length === 1 ? 0 : -9);
    W.speed = rr(1.0, 1.5);
    W.dur = run / W.speed; W.t = 0; W.active = true;
    for (const w of W.pod) { w.breath = rr(20, 60); w.pos.set(W.start.x, W.depth + w.off.y, W.start.z); w.logged = false; }
    logEvent(env, 'whale', W.pod.length === 1 ? 'ザトウクジラが1頭、ゆっくり通り過ぎていく' : 'ザトウクジラの親子が通り過ぎていく', cam.x, cam.z);
  }
  W.t += dt;
  if (W.t > W.dur) { W.active = false; W.next = rr(150, 360); return; }
  const fadeIn = Math.min(1, W.t / 8), fadeOut = Math.min(1, (W.dur - W.t) / 8);
  const cx = W.start.x + W.dir.x * W.speed * W.t, cz = W.start.z + W.dir.z * W.speed * W.t;
  const yaw = Math.atan2(W.dir.x, W.dir.z), sx = -W.dir.z, sz = W.dir.x;
  for (const w of W.pod) {
    const x = cx + sx * w.off.x + W.dir.x * w.off.z, z = cz + sz * w.off.x + W.dir.z * w.off.z;
    // mid-water, clear of the reef; a calf goes up to breathe now and then
    let ty = W.depth + w.off.y + Math.sin(W.t * 0.05 + w.len) * 0.6;
    w.breath -= dt;
    if (w.role === 'calf' && w.breath < 0) {
      const k = -w.breath;                                    // 0..24 s: up, a breath at the top, back down
      ty = ty + (-0.6 - ty) * Math.sin(Math.min(1, k / 24) * Math.PI);
      if (!w.logged) { w.logged = true; logEvent(env, 'breathe', 'ザトウクジラの子どもが息継ぎに浮上していく', x, z); }
      if (k > 24) { w.breath = rr(90, 180); w.logged = false; }
    }
    const vy = (ty - w.pos.y) * Math.min(1, dt * 0.35);
    w.pos.set(x, w.pos.y + vy, z);
    w.mesh.position.copy(w.pos);
    w.mesh.rotation.set(-Math.atan2(vy / Math.max(dt, 1e-3), W.speed) * 0.8, yaw, Math.sin(W.t * 0.2 + w.len) * 0.04, 'YXZ');
    w.mesh.visible = fadeIn * fadeOut > 0.02;
    w.mat.uniforms.uStroke.value = w.role === 'calf' ? 1.2 : 0.8;
  }
}

export function whaleSubjects(oc: any, out: Subject[]) {
  const W: Whales | undefined = oc.whales;
  if (!W || !W.active || W.t < 6 || W.t > W.dur - 10) return;
  const lead = W.pod[0];
  out.push({ key: 'whale', label: 'ザトウクジラ', kind: 'giant', prio: 4.5, size: 8, pos: () => lead.pos,
    status: () => (W.pod.length === 1 ? '悠々と泳いでいる' : W.pod.length === 3 ? '親子にオスが付き添って泳いでいる' : '親子で泳いでいる'), live: () => W.active });
}
