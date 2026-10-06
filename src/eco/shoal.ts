import { schoolLength, memberLength } from './growth';
// Big mid-water schools (fusiliers): hundreds of fish flocking as boids. Each fish keeps its distance,
// matches its neighbours and follows a slowly wandering leader; the school parts around the drone and
// flashes outward when a predator comes through. By night the school drops to the reef and loosens.
import * as THREE from 'three';
import { clamp, smooth, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { zx, zz, outZone, toZone } from '../ocean/zone';
import { SHAPES, fishGeometry, fishMaterial, UPV } from '../ocean/models';
import { makeSchoolShade } from './schoolshade';
import { behind, unseen } from './unseen';
import { activity, logEvent, type Env, type PreyGroup, type Subject } from './env';
import type { Species } from '../data/locations';

const _mm = new THREE.Matrix4(), _ss = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cv = new THREE.Vector3();


interface Leader { m?: THREE.Vector3; spread?: number; c: THREE.Vector3; head: number; t: number; alt: number; placed: boolean; fear: number; prey: PreyGroup; ch?: { i: number; x: number; y: number; z: number; t: number; juke: number; jukeT: number } }

export function makeShoalSystem(sp: Species, oc: any) {
  // spacing by body size: small fish school a hand's breadth apart; sharks a body length or two
  const K = clamp(sp.size[1] / 0.5, 1, 4), CELL = 1.6 * K;
  const hashCell = (x: number, y: number, z: number) => ((Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791)) | 0;
  const S = sp.schools || 1, total = S * (sp.n || 100);
  const geo = fishGeometry(SHAPES[sp.shape]);
  const swim = new Float32Array(total * 3);
  const p = new Float32Array(total * 3), v = new Float32Array(total * 3), size = new Float32Array(total), dead = new Float32Array(total);
  const schoolBase = Array.from({ length: S }, () => schoolLength(sp.size[0], sp.size[1]));
  for (let i = 0; i < total; i++) {
    swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr((sp.freq || [7, 10])[0], (sp.freq || [7, 10])[1]); swim[i * 3 + 2] = rr(0.9, 1.08);
    size[i] = memberLength(schoolBase[i % S]) / 1.28;   // fish i swims in school i % S
  }
  geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 3));
  const shade = makeSchoolShade(geo, total, S);
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(sp, true), total);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const T = oc.T;
  // fish i belongs to school i % S, so drawing the first N keeps every school proportionally filled
  let active = total;
  const leaders: Leader[] = [];
  const acc = new Float64Array(S * 5);   // (per school: sums of where its fish are, for their middle and spread)
  for (let s = 0; s < S; s++) {
    const L: Leader = { c: new THREE.Vector3(), head: R() * 6.28, t: R() * 100, alt: rr((sp.alt || [4, 8])[0], (sp.alt || [4, 8])[1]), placed: false, fear: 0, prey: null as any };
    L.prey = {
      x: 0, y: 0, z: 0, alive: 0, label: sp.ja,
      scare() { L.fear = 1; },
      take() {
        for (let k = 0; k < 20; k++) { const i = s + S * Math.floor(R() * (active / S)); if (i < active && !dead[i]) { dead[i] = L.t || 1e-3; return true; } }
        return false;
      },
      pick(x, y, z) {
        // a fish at the edge of the school on the hunter's side
        let best = -1, bs = Infinity;
        for (let k = 0; k < 40; k++) {
          const i = s + S * Math.floor(R() * (active / S)); if (i >= active || dead[i]) continue;
          const dp = Math.hypot(p[i * 3] - x, p[i * 3 + 1] - y, p[i * 3 + 2] - z), out = Math.hypot(p[i * 3] - L.c.x, p[i * 3 + 2] - L.c.z);
          const sc = dp - out * 0.8;
          if (sc < bs) { bs = sc; best = i; }
        }
        return best;
      },
      at(i, out, vel) {
        if (i < 0 || i >= active || dead[i]) return false;
        out.x = p[i * 3]; out.y = p[i * 3 + 1]; out.z = p[i * 3 + 2];
        if (vel) { vel.x = v[i * 3]; vel.y = v[i * 3 + 1]; vel.z = v[i * 3 + 2]; }
        return true;
      },
      chased(i, x, y, z) {
        if (!L.ch || L.ch.i !== i) L.ch = { i, x, y, z, t: L.t, juke: R() < 0.5 ? 1 : -1, jukeT: rr(0.3, 0.7) };
        L.ch.x = x; L.ch.y = y; L.ch.z = z; L.ch.t = L.t; L.fear = 1;
      },
      // back in the thick of the school: lost among the others
      safe(i) { return !dead[i] && Math.hypot(p[i * 3] - L.c.x, p[i * 3 + 1] - L.c.y, p[i * 3 + 2] - L.c.z) < 0.9; },
      kill(i) { if (i < 0 || i >= active || dead[i]) return false; dead[i] = L.t || 1e-3; if (L.ch?.i === i) L.ch = undefined; return true; },
    };
    leaders.push(L);
  }
  const grid = new Map<number, number[]>();

  function place(s: number, cam: THREE.Vector3, fx: number, fz: number, near: boolean) {
    const L = leaders[s];
    let x = cam.x, z = cam.z;
    // on arriving at the sea, nearby (the scene is new); afterwards, a school that has drifted far off comes back
    // in from behind the camera, out of sight, swimming on past into view — never put down where it can be seen
    const bh = near ? null : behind(oc, cam, fx, fz, rr(30, 44), 2.6, rr(-0.9, 0.9));
    if (bh) { x = zx(bh.x); z = zz(bh.z); }
    else for (let k = 0; k < 24; k++) {
      const d = near ? rr(10, 28) : rr(32, 46), lat = (R() * 2 - 1) * 20;
      x = zx(cam.x + fx * d - fz * lat); z = zz(cam.z + fz * d + fx * lat);
      if (T.wet(x, z, 2.6)) break;
    }
    L.c.set(x, Math.min(T.h(x, z) + L.alt, -2), z);
    L.head = bh ? Math.atan2(cam.z + fz * 25 - z, cam.x + fx * 25 - x) + rr(-0.5, 0.5) : Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(0.8, 2.2);
    for (let i = s; i < total; i += S) {
      const a = R() * 6.28, r = Math.cbrt(R()) * 4;
      p[i * 3] = x + Math.cos(a) * r; p[i * 3 + 1] = L.c.y + (R() - 0.5) * 2.5; p[i * 3 + 2] = z + Math.sin(a) * r;
      v[i * 3] = Math.cos(L.head) * 0.8; v[i * 3 + 1] = 0; v[i * 3 + 2] = Math.sin(L.head) * 0.8;
      dead[i] = 0;
    }
    L.placed = true;
  }

  let target = 1, nearStart = 1;   // (nearStart: of the school's parts, how many are about the camera on arriving: the day's lot)
  let orbit: { x: number; z: number; r: number; dir: number } | null = null, always = false, steer: { head: number } | null = null;
  // the reef height under each fish, refreshed every few frames in turn (terrain sampling is costly)
  let frame = 0, fhC = new Float32Array(0);
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
    frame++;
    if (fhC.length < p.length / 3) fhC = new Float32Array(p.length / 3).fill(-1e9);
    const act = always ? 1 : activity(sp.diel, env); target = act;
    for (let s = 0; s < S; s++) {
      const L = leaders[s];
      L.t += dt; L.fear = Math.max(0, L.fear - dt * 0.3);
      const dx = L.c.x - cam.x, dz = L.c.z - cam.z;
      if (!L.placed || (dx * dx + dz * dz > 75 * 75 && !orbit && !steer && unseen(oc, L.c.x, L.c.y, L.c.z, cam, fx, fz, 6))) place(s, cam, fx, fz, !L.placed && R() < nearStart);   // (on arriving: near, or — the day's lot — further off)
      L.head += (Math.sin(L.t * 0.17 + s * 3) * 0.3 + Math.sin(L.t * 0.05 + s) * 0.2) * dt;
      // (sent off a given way: a school leaving the scene)
      if (steer) { let d = steer.head - L.head; d = Math.atan2(Math.sin(d), Math.cos(d)); L.head += d * Math.min(1, dt * 0.8); }
      // (sent on toward a point: until it is there)
      else if ((L as any).goal && !orbit) { const gl = (L as any).goal, gd = Math.hypot(gl.x - L.c.x, gl.z - L.c.z); if (gd < 6) (L as any).goal = undefined; else { let d = Math.atan2(gl.z - L.c.z, gl.x - L.c.x) - L.head; d = Math.atan2(Math.sin(d), Math.cos(d)); L.head += d * Math.min(1, dt * 0.9); } }
      // (circling a point: a tornado of jacks)
      if (orbit) { const ox = L.c.x - orbit.x, oz = L.c.z - orbit.z, r = Math.hypot(ox, oz) || 1; let d = Math.atan2(oz, ox) + orbit.dir * (Math.PI / 2 + clamp((r - orbit.r) / orbit.r, -0.6, 0.6)) - L.head; d = Math.atan2(Math.sin(d), Math.cos(d)); L.head += d * Math.min(1, dt * 2); }
      if (outZone(L.c.x, L.c.z)) { let d = toZone(L.c.x, L.c.z) - L.head; d = Math.atan2(Math.sin(d), Math.cos(d)); L.head += d * dt; }
      L.head += T.shore(L.c.x, L.c.z, L.head, 8, 2.2) * Math.min(1, dt * 1.2);
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
    const radius0 = 2.3 * K * Math.cbrt(Math.max(1, total / S / 60));   // (a bigger school takes more room)
    shade.begin();
    acc.fill(0);
    for (let i = 0; i < active; i++) {
      const s = i % S, L = leaders[s];
      if (dead[i]) {
        if (L.t - dead[i] > 150) { dead[i] = 0; p[i * 3] = L.c.x + rr(-3, 3); p[i * 3 + 1] = L.c.y; p[i * 3 + 2] = L.c.z + rr(-3, 3); }
        else { _mm.makeScale(0, 0, 0); mesh.setMatrixAt(i, _mm); continue; }
      }
      alive[s]++;
      const px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2];
      // the school breathes: it spreads out loose, draws in tight, stretches into a ribbon along its way
      const breath = 0.5 + 0.5 * Math.sin(L.t * 0.07 + s * 2.1) * Math.sin(L.t * 0.031 + s), radius = radius0 * (0.6 + 1.1 * breath) * (1 + L.fear * 0.2);
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
      const ix = Math.floor(px / CELL), iy = Math.floor(py / CELL), iz = Math.floor(pz / CELL);
      outer: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const cell = grid.get((((ix + a) * 73856093) ^ ((iy + b) * 19349663) ^ ((iz + c) * 83492791)) | 0);
        if (!cell) continue;
        for (const j of cell) {
          if (j === i || j % S !== s) continue;
          const ddx = px - p[j * 3], ddy = py - p[j * 3 + 1], ddz = pz - p[j * 3 + 2], d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          if (d2 > 5.76 * K * K) continue;
          const sepR = K > 1.5 ? 0.85 * K : 0.6;   // (big fish keep a body length or so of room)
          if (d2 < sepR * sepR) { const k = K * K / Math.max(d2, 0.02 * K * K); sx += ddx * k; sy += ddy * k; sz += ddz * k; }
          ax += v[j * 3]; ay += v[j * 3 + 1]; az += v[j * 3 + 2];
          cx += p[j * 3]; cy += p[j * 3 + 1]; cz += p[j * 3 + 2];
          if (++n >= 12) break outer;
        }
      }
      let fx2 = 0, fy2 = 0, fz2 = 0;
      if (n) {
        const sepW = K > 1.5 ? 0.18 : 0.05, coh = 0.35 / K;
        fx2 += sx * sepW + (ax / n - v[i * 3]) * 0.9 + (cx / n - px) * coh;
        fy2 += sy * sepW + (ay / n - v[i * 3 + 1]) * 0.9 + (cy / n - py) * coh;
        fz2 += sz * sepW + (az / n - v[i * 3 + 2]) * 0.9 + (cz / n - pz) * coh;
      }
      // stay with the school, milling around its leader
      const lx = L.c.x - px, ly = L.c.y - py, lz = L.c.z - pz;
      // (measured in the school's own frame, its length along its heading counting for less: a ribbon, not a ball)
      const hx = Math.cos(L.head), hz = Math.sin(L.head), along = lx * hx + lz * hz, across = -lx * hz + lz * hx;
      const stretch = 1 + 1.6 * (1 - breath), ld = Math.hypot(along / stretch, ly * 1.3, across), ldt = Math.hypot(lx, ly, lz);
      const pull = ld > radius ? (ld - radius) * 0.6 * (ldt / Math.max(ld, 0.01)) : 0.05;
      fx2 += lx / Math.max(ldt, 0.01) * pull + Math.cos(L.head) * 0.5 - lz / Math.max(ldt, 0.01) * 0.25;
      fy2 += ly / Math.max(ldt, 0.01) * pull * 0.8;
      fz2 += lz / Math.max(ldt, 0.01) * pull + Math.sin(L.head) * 0.5 + lx / Math.max(ldt, 0.01) * 0.25;
      // part around the drone
      _a.set(px - cam.x, py - cam.y, pz - cam.z);
      const cd = _a.length();
      if (cd < 4.2) { const k = (4.2 - cd) * 3.0 / Math.max(cd, 0.1); fx2 += _a.x * k; fy2 += _a.y * k; fz2 += _a.z * k; }
      const ch = L.ch && L.ch.i === i && L.t - L.ch.t < 0.3 ? L.ch : null;
      if (ch) {
        // singled out: bolt away and jink, then dive back into the thick of the school
        const ax = px - ch.x, ay = py - ch.y, az = pz - ch.z, ad = Math.hypot(ax, ay, az) || 1;
        if ((ch.jukeT -= dt) < 0) { ch.juke = -ch.juke; ch.jukeT = rr(0.25, 0.6) * (ad < 2.5 ? 1 : 2); }
        const jang = ch.juke * (ad < 2.5 ? 1.25 : 0.45), cj = Math.cos(jang), sj = Math.sin(jang), hx = ax / ad, hz = az / ad;
        const bolt = sp.speed * 2.6;
        const wx = (hx * cj - hz * sj) * bolt + (L.c.x - px) * 0.5, wz = (hx * sj + hz * cj) * bolt + (L.c.z - pz) * 0.5, wy = (ay / ad) * bolt * 0.3 + (L.c.y - py) * 0.5;
        const kk = 1 - Math.exp(-dt * 9);
        v[i * 3] += (wx - v[i * 3]) * kk; v[i * 3 + 1] += (wy - v[i * 3 + 1]) * kk; v[i * 3 + 2] += (wz - v[i * 3 + 2]) * kk;
        fx2 = fy2 = fz2 = 0;
      }
      // flash away from predators
      if (!ch) for (const th of env.threats) {
        if (!th.r) continue;
        const ddx = px - th.x, ddy = py - th.y, ddz = pz - th.z, dd = Math.hypot(ddx, ddy, ddz), r = th.r + 2;
        if (dd < r) { const k = (r - dd) * 4 / Math.max(dd, 0.1); fx2 += ddx * k; fy2 += ddy * k; fz2 += ddz * k; L.fear = 1; }
      }
      if (((frame + i) % 6) === 0 || fhC[i] < -1e8) fhC[i] = T.top(px, pz);
      const fh = fhC[i];
      if (py < fh + 1) fy2 += (fh + 1 - py) * 3;
      if (py > -1.2) fy2 -= (py + 1.2) * 3;
      let vx = v[i * 3] + fx2 * dt, vy = v[i * 3 + 1] + fy2 * dt, vz = v[i * 3 + 2] + fz2 * dt;
      const sp2 = Math.hypot(vx, vy, vz), maxS = sp.speed * (ch ? 2.8 : 1.6 + L.fear * 1.8), minS = 0.35 + 0.4 * target;
      const k = sp2 > maxS ? maxS / sp2 : sp2 < minS ? minS / Math.max(sp2, 1e-3) : 1;
      vx *= k; vy *= k * 0.7; vz *= k;
      v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
      let nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      if (oc.cave && oc.cave.pushOut(_cv.set(nx, ny, nz), 0.4)) { nx = _cv.x; ny = _cv.y; nz = _cv.z; }   // slide off the cave rock
      p[i * 3] = nx; p[i * 3 + 1] = ny; p[i * 3 + 2] = nz;
      { const o = s * 5; acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz; acc[o + 3] += nx * nx + ny * ny + nz * nz; acc[o + 4]++; }
      const hs = Math.hypot(vx, vz), hy = clamp(vy, -hs * 0.5, hs * 0.5);
      _a.set(nx + vx, ny + hy, nz + vz); _b.set(nx, ny, nz);
      _mm.lookAt(_a, _b, UPV); _ss.setScalar(size[i]); _mm.scale(_ss); _mm.setPosition(nx, ny, nz);
      mesh.setMatrixAt(i, _mm);
      shade.set(i, s, nx, ny, nz);
    }
    shade.end();
    // where each school's fish actually are, and how far they spread: what is filmed and ringed (the leading point
    // runs on ahead of them, and they keep a few metres off the camera — filmed there, the middle was empty water)
    for (let q = 0; q < S; q++) {
      const o = q * 5, n = acc[o + 4], L = leaders[q]; if (!n) continue;
      const mx = acc[o] / n, my = acc[o + 1] / n, mz = acc[o + 2] / n;
      (L.m ??= new THREE.Vector3()).set(mx, my, mz);   // (as they are: the camera and the ring smooth their own way)
      L.spread = Math.sqrt(Math.max(0, acc[o + 3] / n - (mx * mx + my * my + mz * mz)));
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
    if (sp.big) return a < 0.35 ? '群れをほどいて、ひとりずつ沖へ散っていく' : '潮の中に並んで、ゆっくり群れている';   // (a school of sharks: nothing here hunts them)
    if (a < 0.35) return 'リーフの近くで群れをほどいて休んでいる';
    if (leaders.some((L) => L.fear > 0.5)) return '捕食者から逃げて群れが弾けている';
    return sp.diet === 'fish' ? '銀の群れになって、ゆっくり渦を巻いている' : '中層で大群になってプランクトンを食べている';
  }
  // what one school is doing (its own fright: another school bolting elsewhere is not this one)
  function schoolStatus(L: Leader) {
    const a = target;
    if (sp.big) return a < 0.35 ? '群れをほどいて、ひとりずつ沖へ散っていく' : '潮の中に並んで、ゆっくり群れている';
    if (L.ch && L.t - L.ch.t < 2) return '1匹が追われ、群れが弾けている';
    if (L.fear > 0.5) return '捕食者から逃げて群れが弾けている';
    if (L.fear > 0.15) return '群れをまとめ直している';
    if (a < 0.35) return 'リーフの近くで群れをほどいて休んでいる';
    return sp.diet === 'fish' ? '銀の群れになって、ゆっくり渦を巻いている' : '中層で大群になってプランクトンを食べている';
  }
  // how many of a school's fish are there to be seen (those drawn at this quality, not eaten): one with only a
  // few left is not offered as a school to go and see — the camera would arrive at an empty patch of water
  const here = (s: number) => { let n = 0; for (let i = s; i < active; i += S) if (!dead[i]) n++; return n; };
  const enough = (s: number) => here(s) >= Math.max(8, 0.3 * active / S);
  function subjects(out: Subject[]) {
    leaders.forEach((L, s) => {
      if (!L.placed || !enough(s)) return;
      const full = Math.min(1, here(s) / Math.max(1, active / S));
      out.push({ key: `${sp.id}:${s}`, label: `${sp.ja}の群れ`, kind: 'school', prio: 2.6 * (0.4 + 0.6 * target) * (0.5 + 0.5 * full), size: 3.5, pos: () => L.m ?? L.c, frameR: () => L.spread ?? 2, status: () => schoolStatus(L), live: () => L.placed && enough(s) });
    });
  }
  // A tap on the screen: the school with a fish nearest the tapped point (each fish projected, a few hundred at
  // most), not its leading point — fish in plain view in front are picked even when the lead is behind the reef
  function tapAt(score: (x: number, y: number, z: number, r: number) => number): { s: Subject; sc: number } | null {
    let bs = Infinity, bsi = -1;
    const step = Math.max(1, Math.floor(active / 400));
    for (let i = 0; i < active; i += step) {
      const si = i % S, L = leaders[si];
      if (dead[i] || !L.placed || !enough(si)) continue;
      const sc = score(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], size[i] * 0.5);
      if (sc < bs) { bs = sc; bsi = si; }
    }
    if (bsi < 0 || !isFinite(bs)) return null;
    const L = leaders[bsi], si = bsi;
    return { s: { key: `${sp.id}:${si}`, label: `${sp.ja}の群れ`, kind: 'school', prio: 5, size: 3.5, pos: () => L.m ?? L.c, frameR: () => L.spread ?? 2, status: () => schoolStatus(L), live: () => L.placed && enough(si) }, sc: bs };
  }
  function focus(cam: THREE.Vector3): Subject | null {
    let best: Leader | null = null, bd = Infinity;
    let bs = -1;
    leaders.forEach((L, s) => { if (!L.placed || !enough(s)) return; const d = L.c.distanceTo(cam); if (d < bd) { bd = d; best = L; bs = s; } });
    if (!best) return null;
    const L = best as Leader, si = bs;
    return { key: `focus:${sp.id}`, label: `${sp.ja}の群れ`, kind: 'school', prio: 5, size: 3.5, pos: () => L.m ?? L.c, frameR: () => L.spread ?? 2, status: () => schoolStatus(L), live: () => L.placed && enough(si) };
  }
  return {
    sp, mesh, update, nearest, nearestPos, status, subjects, focus, tapAt,
    each(cb: (x: number, y: number, z: number, len: number) => boolean | void, most = 200) { const st = Math.max(1, Math.floor(active / most)); for (let i = 0; i < active; i += st) if (!dead[i] && cb(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], size[i] * 1.28) === true) return; },
    preyGroups: () => (sp.big ? [] : leaders.map((L) => L.prey)),
    dbg: { get fp() { return p; }, dead, get total() { return active; }, leaders },   // (for checks)
    reset() { for (const L of leaders) L.placed = false; },
    setFraction(f: number) { active = Math.max(S, Math.floor(total * f / S) * S); mesh.count = active; },
    setStart(f: number) { nearStart = f; },
    // (as the reef's groups, for keeping fish about the camera: each part of the school, and a way to send it on)
    movers: () => (orbit || steer || always ? [] : leaders.map((L, s) => ({ L, s })).filter(({ L }) => L.placed && !L.ch).map(({ L, s }) => ({
      x: L.c.x, y: L.c.y, z: L.c.z, n: Math.floor(active / S), going: !!(L as any).goal, goal: (L as any).goal,
      move(sx: number, sz: number, ax: number, az: number) {
        const dx = sx - L.c.x, dz = sz - L.c.z;
        for (let i = s; i < total; i += S) { p[i * 3] += dx; p[i * 3 + 2] += dz; }
        L.c.x = sx; L.c.z = sz; L.head = Math.atan2(az - sz, ax - sx); (L as any).goal = { x: ax, z: az };
      },
    }))),
    // (for the rare scenes: put the whole school right here, heading this way; keep it circling a point;
    // keep it active whatever the hour)
    placeAt(x: number, y: number, z: number, head: number, spread = 4) {
      for (let s = 0; s < S; s++) {
        const L = leaders[s]; L.c.set(x, y, z); L.head = head; L.placed = true; L.alt = Math.max(1, y - T.h(x, z));
        for (let i = s; i < total; i += S) {
          const a = R() * 6.28, r = Math.cbrt(R()) * spread;
          p[i * 3] = x + Math.cos(a) * r; p[i * 3 + 1] = y + (R() - 0.5) * spread * 0.6; p[i * 3 + 2] = z + Math.sin(a) * r;
          v[i * 3] = Math.cos(head) * 0.8; v[i * 3 + 1] = 0; v[i * 3 + 2] = Math.sin(head) * 0.8; dead[i] = 0;
        }
      }
    },
    setOrbit(o: { x: number; z: number; r: number; dir: number } | null) { orbit = o; },
    setAlways(on: boolean) { always = on; },
    // (a rare scene's school: sent off this way, to leave the scene; null: its own way again)
    steerTo(head: number | null) { steer = head === null ? null : { head }; },
    leader: () => leaders[0].c,
  };
}
