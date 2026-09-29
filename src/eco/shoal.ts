// Big mid-water schools (fusiliers): hundreds of fish flocking as boids. Each fish keeps its distance,
// matches its neighbours and follows a slowly wandering leader; the school parts around the drone and
// flashes outward when a predator comes through. By night the school drops to the reef and loosens.
import * as THREE from 'three';
import { clamp, smooth, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { SHAPES, fishGeometry, fishMaterial, UPV } from '../ocean/models';
import { activity, logEvent, type Env, type PreyGroup, type Subject } from './env';
import type { Species } from '../data/locations';

const _mm = new THREE.Matrix4(), _ss = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cv = new THREE.Vector3();
const CELL = 1.6;
const hashCell = (x: number, y: number, z: number) => ((Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791)) | 0;

interface Leader { c: THREE.Vector3; head: number; t: number; alt: number; placed: boolean; fear: number; prey: PreyGroup }

export function makeShoalSystem(sp: Species, oc: any) {
  const S = sp.schools || 1, total = S * (sp.n || 100);
  const geo = fishGeometry(SHAPES[sp.shape]);
  const swim = new Float32Array(total * 3);
  const p = new Float32Array(total * 3), v = new Float32Array(total * 3), size = new Float32Array(total), dead = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr((sp.freq || [7, 10])[0], (sp.freq || [7, 10])[1]); swim[i * 3 + 2] = rr(0.9, 1.08);
    size[i] = rr(sp.size[0], sp.size[1]) / 1.28;
  }
  geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 3));
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(sp), total);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const T = oc.T;
  // fish i belongs to school i % S, so drawing the first N keeps every school proportionally filled
  let active = total;
  const leaders: Leader[] = [];
  for (let s = 0; s < S; s++) {
    const L: Leader = { c: new THREE.Vector3(), head: R() * 6.28, t: R() * 100, alt: rr((sp.alt || [4, 8])[0], (sp.alt || [4, 8])[1]), placed: false, fear: 0, prey: null as any };
    L.prey = {
      x: 0, y: 0, z: 0, alive: 0, label: sp.ja,
      scare() { L.fear = 1; },
      take() {
        for (let k = 0; k < 20; k++) { const i = s + S * Math.floor(R() * (active / S)); if (i < active && !dead[i]) { dead[i] = L.t || 1e-3; return true; } }
        return false;
      },
    };
    leaders.push(L);
  }
  const grid = new Map<number, number[]>();

  function place(s: number, cam: THREE.Vector3, fx: number, fz: number, near: boolean) {
    const L = leaders[s];
    const d = near ? rr(10, 28) : rr(32, 46), lat = (R() * 2 - 1) * 20;
    const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT);
    L.c.set(x, Math.min(T.h(x, z) + L.alt, -2), z);
    L.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(0.8, 2.2);
    for (let i = s; i < total; i += S) {
      const a = R() * 6.28, r = Math.cbrt(R()) * 4;
      p[i * 3] = x + Math.cos(a) * r; p[i * 3 + 1] = L.c.y + (R() - 0.5) * 2.5; p[i * 3 + 2] = z + Math.sin(a) * r;
      v[i * 3] = Math.cos(L.head) * 0.8; v[i * 3 + 1] = 0; v[i * 3 + 2] = Math.sin(L.head) * 0.8;
      dead[i] = 0;
    }
    L.placed = true;
  }

  let target = 1;
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
    const act = activity(sp.diel, env); target = act;
    for (let s = 0; s < S; s++) {
      const L = leaders[s];
      L.t += dt; L.fear = Math.max(0, L.fear - dt * 0.3);
      const dx = L.c.x - cam.x, dz = L.c.z - cam.z;
      if (!L.placed || dx * dx + dz * dz > 75 * 75) place(s, cam, fx, fz, !L.placed);
      L.head += (Math.sin(L.t * 0.17 + s * 3) * 0.3 + Math.sin(L.t * 0.05 + s) * 0.2) * dt;
      if (Math.abs(L.c.x) > LIMIT || Math.abs(L.c.z) > LIMIT) { let d = Math.atan2(-L.c.z, -L.c.x) - L.head; d = Math.atan2(Math.sin(d), Math.cos(d)); L.head += d * dt; }
      const pace = sp.speed * (0.35 + 0.65 * act);
      L.c.x += Math.cos(L.head) * pace * dt; L.c.z += Math.sin(L.head) * pace * dt;
      const alt = L.alt * act + 1.2 * (1 - act) + Math.sin(L.t * 0.11 + s) * 1.2;
      let fl = T.top(L.c.x, L.c.z);                               // look ahead: lift over coral heads early
      for (const k of [2, 4, 7]) fl = Math.max(fl, T.top(L.c.x + Math.cos(L.head) * pace * k, L.c.z + Math.sin(L.head) * pace * k));
      const ty = Math.min(fl + alt, -2);
      L.c.y += (ty - L.c.y) * Math.min(1, dt * (ty > L.c.y ? 0.4 : 0.2));
      if (sp.diet === 'plankton') env.plankton.consume(L.c.x, L.c.z, 0.0008 * act * dt);
      L.prey.x = L.c.x; L.prey.y = L.c.y; L.prey.z = L.c.z;
    }
    // neighbours
    grid.clear();
    for (let i = 0; i < active; i++) {
      if (dead[i]) continue;
      const k = hashCell(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      let cell = grid.get(k); if (!cell) { cell = []; grid.set(k, cell); } cell.push(i);
    }
    const alive = new Array(S).fill(0);
    const radius = 2.3;
    for (let i = 0; i < active; i++) {
      const s = i % S, L = leaders[s];
      if (dead[i]) {
        if (L.t - dead[i] > 150) { dead[i] = 0; p[i * 3] = L.c.x + rr(-3, 3); p[i * 3 + 1] = L.c.y; p[i * 3 + 2] = L.c.z + rr(-3, 3); }
        else { _mm.makeScale(0, 0, 0); mesh.setMatrixAt(i, _mm); continue; }
      }
      alive[s]++;
      const px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
      const ix = Math.floor(px / CELL), iy = Math.floor(py / CELL), iz = Math.floor(pz / CELL);
      outer: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const cell = grid.get((((ix + a) * 73856093) ^ ((iy + b) * 19349663) ^ ((iz + c) * 83492791)) | 0);
        if (!cell) continue;
        for (const j of cell) {
          if (j === i || j % S !== s) continue;
          const ddx = px - p[j * 3], ddy = py - p[j * 3 + 1], ddz = pz - p[j * 3 + 2], d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          if (d2 > 2.4 * 2.4) continue;
          if (d2 < 0.36) { const k = 1 / Math.max(d2, 0.02); sx += ddx * k; sy += ddy * k; sz += ddz * k; }
          ax += v[j * 3]; ay += v[j * 3 + 1]; az += v[j * 3 + 2];
          cx += p[j * 3]; cy += p[j * 3 + 1]; cz += p[j * 3 + 2];
          if (++n >= 12) break outer;
        }
      }
      let fx2 = 0, fy2 = 0, fz2 = 0;
      if (n) {
        fx2 += sx * 0.05 + (ax / n - v[i * 3]) * 0.9 + (cx / n - px) * 0.35;
        fy2 += sy * 0.05 + (ay / n - v[i * 3 + 1]) * 0.9 + (cy / n - py) * 0.35;
        fz2 += sz * 0.05 + (az / n - v[i * 3 + 2]) * 0.9 + (cz / n - pz) * 0.35;
      }
      // stay with the school, milling around its leader
      const lx = L.c.x - px, ly = L.c.y - py, lz = L.c.z - pz, ld = Math.hypot(lx, ly, lz);
      const pull = ld > radius ? (ld - radius) * 0.6 : 0.05;
      fx2 += lx / Math.max(ld, 0.01) * pull + Math.cos(L.head) * 0.5 - lz / Math.max(ld, 0.01) * 0.25;
      fy2 += ly / Math.max(ld, 0.01) * pull * 0.8;
      fz2 += lz / Math.max(ld, 0.01) * pull + Math.sin(L.head) * 0.5 + lx / Math.max(ld, 0.01) * 0.25;
      // part around the drone
      _a.set(px - cam.x, py - cam.y, pz - cam.z);
      const cd = _a.length();
      if (cd < 4.2) { const k = (4.2 - cd) * 3.0 / Math.max(cd, 0.1); fx2 += _a.x * k; fy2 += _a.y * k; fz2 += _a.z * k; }
      // flash away from predators
      for (const th of env.threats) {
        if (!th.r) continue;
        const ddx = px - th.x, ddy = py - th.y, ddz = pz - th.z, dd = Math.hypot(ddx, ddy, ddz), r = th.r + 2;
        if (dd < r) { const k = (r - dd) * 4 / Math.max(dd, 0.1); fx2 += ddx * k; fy2 += ddy * k; fz2 += ddz * k; L.fear = 1; }
      }
      const fh = T.top(px, pz);
      if (py < fh + 1) fy2 += (fh + 1 - py) * 3;
      if (py > -1.2) fy2 -= (py + 1.2) * 3;
      let vx = v[i * 3] + fx2 * dt, vy = v[i * 3 + 1] + fy2 * dt, vz = v[i * 3 + 2] + fz2 * dt;
      const sp2 = Math.hypot(vx, vy, vz), maxS = sp.speed * (1.6 + L.fear * 1.8), minS = 0.35 + 0.4 * target;
      const k = sp2 > maxS ? maxS / sp2 : sp2 < minS ? minS / Math.max(sp2, 1e-3) : 1;
      vx *= k; vy *= k * 0.7; vz *= k;
      v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
      let nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      if (oc.cave && oc.cave.pushOut(_cv.set(nx, ny, nz), 0.4)) { nx = _cv.x; ny = _cv.y; nz = _cv.z; }   // slide off the cave rock
      p[i * 3] = nx; p[i * 3 + 1] = ny; p[i * 3 + 2] = nz;
      const hs = Math.hypot(vx, vz), hy = clamp(vy, -hs * 0.5, hs * 0.5);
      _a.set(nx + vx, ny + hy, nz + vz); _b.set(nx, ny, nz);
      _mm.lookAt(_a, _b, UPV); _ss.setScalar(size[i]); _mm.scale(_ss); _mm.setPosition(nx, ny, nz);
      mesh.setMatrixAt(i, _mm);
    }
    for (let s = 0; s < S; s++) leaders[s].prey.alive = alive[s];
    mesh.instanceMatrix.needsUpdate = true;
  }

  function nearest(cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number) {
    let best = Infinity;
    for (let i = 0; i < active; i += 7) {
      if (dead[i]) continue;
      const dx = p[i * 3] - cam.x, dy = p[i * 3 + 1] - cam.y, dz = p[i * 3 + 2] - cam.z, d = Math.hypot(dx, dy, dz);
      if (d < maxD && d < best && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3) > 0.55) best = d;
    }
    return best;
  }
  function nearestPos(cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number, out: THREE.Vector3) {
    let best = Infinity;
    for (const L of leaders) {
      const d = L.c.distanceTo(cam);
      if (d < maxD && d < best) { best = d; out.copy(L.c); }
    }
    return best;
  }
  function status() {
    const a = target;
    if (a < 0.35) return 'リーフの近くで群れをほどいて休んでいる';
    if (leaders.some((L) => L.fear > 0.5)) return '捕食者から逃げて群れが弾けている';
    return '中層で大群になってプランクトンを食べている';
  }
  function subjects(out: Subject[]) {
    leaders.forEach((L, s) => {
      if (!L.placed) return;
      out.push({ key: `${sp.id}:${s}`, label: `${sp.ja}の群れ`, kind: 'school', prio: 2.6 * (0.4 + 0.6 * target), size: 3.5, pos: () => L.c, status, live: () => L.placed });
    });
  }
  function focus(cam: THREE.Vector3): Subject | null {
    let best: Leader | null = null, bd = Infinity;
    for (const L of leaders) { if (!L.placed) continue; const d = L.c.distanceTo(cam); if (d < bd) { bd = d; best = L; } }
    if (!best) return null;
    const L = best;
    return { key: `focus:${sp.id}`, label: `${sp.ja}の群れ`, kind: 'school', prio: 5, size: 3.5, pos: () => L.c, status, live: () => L.placed };
  }
  return {
    sp, mesh, update, nearest, nearestPos, status, subjects, focus,
    preyGroups: () => leaders.map((L) => L.prey),
    reset() { for (const L of leaders) L.placed = false; },
    setFraction(f: number) { active = Math.max(S, Math.floor(total * f / S) * S); mesh.count = active; },
  };
}
