// Fish as groups with needs. Each group (a school, a pair, a loner or an anemone family) follows the
// clock: active species forage the way their diet dictates, resting ones tuck into the reef, prey
// scatter from predators and from the drone, and predators hunt when hungry, mostly at dusk and dawn.
import * as THREE from 'three';
import { clamp, smooth, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { SHAPES, fishGeometry, fishMaterial, UPV } from '../ocean/models';
import { mat } from '../render/common';
import { activity, logEvent, type Env, type PreyGroup, type Subject } from './env';
import type { Species } from '../data/locations';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _mm = new THREE.Matrix4(), _mc = new THREE.Matrix4(), _ss = new THREE.Vector3();
const REVIVE_AFTER = 150;   // s until another fish drifts in to take a lost one's place

type GroupType = 'anem' | 'reef' | 'roam';
interface Group {
  type: GroupType; n: number; start: number;
  a?: { pos: THREE.Vector3; s: number };
  c: THREE.Vector3; v: THREE.Vector3; head: number; t: number; alt: number;
  anchor: { x: number; z: number }; placed: boolean;
  act: number; fear: number; hunger: number;
  hunt: null | { prey: PreyGroup; t0: number }; cooldown: number;
  prey?: PreyGroup;
}

export function makeFishSystem(sp: Species, oc: any) {
  const sh = SHAPES[sp.shape];
  const groups: Group[] = [];
  let total = 0;
  const mk = (type: GroupType, n: number, extra: Partial<Group> = {}) => {
    groups.push(Object.assign({
      type, n, start: total, c: new THREE.Vector3(), v: new THREE.Vector3(), head: R() * 6.28, t: R() * 100,
      alt: rr((sp.alt || [0.3, 0.6])[0], (sp.alt || [0.3, 0.6])[1]), anchor: { x: 0, z: 0 }, placed: false,
      act: 1, fear: 0, hunger: R() * 0.6, hunt: null, cooldown: 0,
    }, extra));
    total += n;
  };
  if (sp.habitat === 'anemone') { for (const a of oc.anemones) if (a.species === sp.id) mk('anem', 2 + Math.floor(R() * 3), { a }); }
  else if (sp.habitat === 'reef') { for (let i = 0; i < (sp.schools || 1); i++) mk('reef', sp.n || 1); }
  else { for (let i = 0; i < (sp.count || 1); i++) mk('roam', 1); }
  if (!total) return null;

  const geo = fishGeometry(sh);
  const swim = new Float32Array(total * 3);
  const fp = new Float32Array(total * 3), fv = new Float32Array(total * 3), fs = new Float32Array(total), fo = new Float32Array(total * 3);
  const dead = new Float32Array(total);   // 0 = alive, else time of death
  for (const g of groups) {
    const spread = g.type === 'anem' ? [0.35, 0.2, 0.35] : (sp.spread || [0, 0, 0]);
    for (let i = g.start; i < g.start + g.n; i++) {
      const fr = sp.freq || (sp.big ? [3, 5] : [8, 12]);
      swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr(fr[0], fr[1]); swim[i * 3 + 2] = rr(0.88, 1.1);
      fs[i] = rr(sp.size[0], sp.size[1]) / 1.28;
      let x: number, y: number, z: number;
      do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; } while (x * x + y * y + z * z > 1);
      fo[i * 3] = x * spread[0]; fo[i * 3 + 1] = y * spread[1]; fo[i * 3 + 2] = z * spread[2];
    }
  }
  geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 3));
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(sp), total);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // parrotfish sleep inside a mucus cocoon they secrete at dusk
  let cocoon: THREE.InstancedMesh | null = null;
  if (sp.cocoon) {
    cocoon = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 18, 12), mat(
      `varying vec3 vWp; varying vec3 vN;
       void main(){ vec3 p = position * (1.0 + 0.03 * sin(uTime * 1.5 + position.z * 9.0)); vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      `varying vec3 vWp; varying vec3 vN;
       void main(){
         vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp);
         float f = pow(1.0 - abs(dot(n, V)), 2.2);
         vec3 c = vec3(0.78, 0.9, 0.96) * (0.12 + uAmb * 0.5) + lamp(vec3(0.9), vWp, faceforward(n, -V, n)) * 0.7;
         gl_FragColor = vec4(fogIt(c, vWp), 0.07 + 0.45 * f);
       }`, { opts: { transparent: true, depthWrite: false } }), total);
    cocoon.frustumCulled = false;
    cocoon.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oc.group.add(cocoon);
  }
  const T = oc.T;
  const isPredator = sp.diet === 'fish';
  const smallPrey = !sp.big && sp.size[1] < 0.35;

  // prey handles other species' predators can target
  for (const g of groups) {
    if (!smallPrey || g.type !== 'reef') continue;
    g.prey = {
      x: 0, y: 0, z: 0, alive: g.n, label: sp.ja,
      scare() { g.fear = 1; },
      take() {
        const alive: number[] = [];
        for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) alive.push(i);
        if (alive.length <= 1) return false;
        dead[alive[Math.floor(R() * alive.length)]] = g.t || 1e-3;
        return true;
      },
    };
  }

  function findSpot(cam: THREE.Vector3, fx: number, fz: number, dmin: number, dmax: number, wantReef: boolean): [number, number] {
    let best: [number, number] = [cam.x, cam.z], bs = -1;
    for (let k = 0; k < 28; k++) {
      const d = rr(dmin, dmax), lat = (R() * 2 - 1) * (dmax * 0.5);
      const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT);
      const r = wantReef ? T.reef(x, z) : 1;
      if (r > bs) { bs = r; best = [x, z]; }
      if (r > 0.5) break;
    }
    return best;
  }
  function place(g: Group, cam: THREE.Vector3, fx: number, fz: number, near: boolean) {
    if (g.type === 'anem') { g.c.copy(g.a!.pos); g.c.y += 0.25; }
    else {
      const [x, z] = findSpot(cam, fx, fz, near ? 6 : 32, near ? 30 : 48, g.type === 'reef');
      g.anchor.x = x; g.anchor.z = z;
      g.c.set(x, Math.min(T.h(x, z) + g.alt, -1.4), z);
      g.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(0.9, 2.1);
      g.hunt = null;
    }
    g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(sp.speed * 0.4);
    for (let i = g.start; i < g.start + g.n; i++) {
      dead[i] = 0;
      fp[i * 3] = g.c.x + fo[i * 3]; fp[i * 3 + 1] = g.c.y + fo[i * 3 + 1]; fp[i * 3 + 2] = g.c.z + fo[i * 3 + 2];
      fv[i * 3] = g.v.x; fv[i * 3 + 1] = 0; fv[i * 3 + 2] = g.v.z;
    }
    g.placed = true;
  }

  // Predators: build hunger, pick a school, rush it; most strikes miss.
  function hunt(g: Group, dt: number, env: Env) {
    g.hunger = Math.min(1, g.hunger + dt / 160);
    g.cooldown = Math.max(0, g.cooldown - dt);
    const drive = g.hunger * (0.2 + 0.8 * env.twilight + 0.3 * env.night);
    if (!g.hunt && g.cooldown <= 0 && drive > 0.5 && R() < dt * 0.08) {
      let best: PreyGroup | null = null, bd = 45;
      for (const p of env.prey) { const d = Math.hypot(p.x - g.c.x, p.z - g.c.z); if (p.alive > 1 && d < bd) { bd = d; best = p; } }
      if (best) { g.hunt = { prey: best, t0: g.t }; logEvent(env, 'hunt', `${sp.ja}が${best.label}の群れを狙っている`, g.c.x, g.c.z); }
    }
    if (!g.hunt) return false;
    const p = g.hunt.prey, dx = p.x - g.c.x, dy = p.y - g.c.y, dz = p.z - g.c.z, d = Math.hypot(dx, dy, dz);
    const sp2 = sp.speed * 2.6;
    g.v.set(dx, dy * 0.5, dz).multiplyScalar(sp2 / Math.max(d, 1e-3));
    g.c.addScaledVector(g.v, dt);
    g.head = Math.atan2(dz, dx);
    if (d < 5) p.scare();
    if (d < 1.6 || g.t - g.hunt.t0 > 30) {
      if (d < 1.6 && R() < 0.12 && p.take()) {
        g.hunger = 0;
        logEvent(env, 'catch', `${sp.ja}が${p.label}を捕らえた`, g.c.x, g.c.z);
      } else g.hunger *= 0.85;
      g.hunt = null; g.cooldown = rr(60, 150);
    }
    return true;
  }

  let target = 1;
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
    const t = env.t;
    const act = activity(sp.diel, env);
    target = act;
    const upX = -env.cur.x, upZ = -env.cur.z, curLen = Math.hypot(upX, upZ);
    let dirty = false;
    for (const g of groups) {
      g.t += dt;
      g.act += (act - g.act) * Math.min(1, dt * 0.08);           // settle in / wake up over ~15 s
      g.fear = Math.max(0, g.fear - dt * 0.25);
      const dxc = g.c.x - cam.x, dzc = g.c.z - cam.z, dc2 = dxc * dxc + dzc * dzc;
      if (g.type === 'anem') { if (!g.placed) place(g, cam, fx, fz, true); if (dc2 > 80 * 80) continue; }
      else if (!g.placed || dc2 > 72 * 72) place(g, cam, fx, fz, !g.placed);
      const floorC = T.h(g.c.x, g.c.z);
      const rest = 1 - g.act;
      let hunting = false;

      if (g.type === 'reef') {
        // active: drift around the home patch; resting: settle into it
        const r = (sp.diet === 'algae' ? 6 : 3.5) * (1 - rest * 0.8);
        const nx = g.anchor.x + Math.cos(g.t * 0.13 + g.start) * r, nz = g.anchor.z + Math.sin(g.t * 0.1 + g.start) * r;
        g.v.set((nx - g.c.x) / Math.max(dt, 1e-3), 0, (nz - g.c.z) / Math.max(dt, 1e-3)).clampLength(0, sp.speed);
        g.c.x = nx; g.c.z = nz;
        let lift = g.alt;
        if (sp.diet === 'plankton') {
          const pl = env.plankton.sample(g.c.x, g.c.z);
          lift += pl * 1.2 * g.act;                                   // rise to feed when the water is rich
          env.plankton.consume(g.c.x, g.c.z, g.n * 0.00004 * g.act * dt);
        }
        if (sp.diet === 'algae') lift = 0.5 + 0.4 * Math.sin(g.t * 0.2);
        lift = lift * (1 - rest) + 0.25 * rest - g.fear * 0.6;         // rest and fear both pull them into the reef
        const ty = Math.min(floorC + Math.max(lift, 0.15), -1.4);
        g.c.y += (ty - g.c.y) * Math.min(1, dt * 0.6);
      } else if (g.type === 'roam') {
        if (isPredator) hunting = hunt(g, dt, env);
        if (!hunting) {
          g.head += (Math.sin(g.t * 0.23 + g.start) * 0.35 + Math.sin(g.t * 0.07) * 0.2) * dt;
          if (Math.abs(g.c.x) > LIMIT || Math.abs(g.c.z) > LIMIT) { let d = Math.atan2(-g.c.z, -g.c.x) - g.head; d = Math.atan2(Math.sin(d), Math.cos(d)); g.head += d * dt * 0.8; }
          const pace = sp.speed * 0.7 * (0.25 + 0.75 * g.act);
          g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(pace);
          g.c.x += g.v.x * dt; g.c.z += g.v.z * dt;
          const ty = Math.min(floorC + g.alt * (0.4 + 0.6 * g.act) + Math.sin(g.t * 0.3) * 0.5, -1.4);
          g.c.y += (ty - g.c.y) * Math.min(1, dt * 0.6);
        }
        env.threatsOut.push({ x: g.c.x, y: g.c.y, z: g.c.z, r: isPredator ? (hunting ? 7 : 3) : 0 });
      }
      if (g.prey) { g.prey.x = g.c.x; g.prey.y = g.c.y; g.prey.z = g.c.z; }

      const camNear = g.type === 'anem' ? smooth(3.0, 1.2, Math.sqrt(dc2 + (g.c.y - cam.y) ** 2)) : 0;
      const tuck = g.type === 'anem' ? Math.max(camNear, rest * 0.85) : rest * 0.7;
      const rot = g.t * (g.type === 'anem' ? 0.3 : 0.12) * (1 - rest * 0.8), cr = Math.cos(rot), sr = Math.sin(rot);
      const spreadK = (1 - tuck * 0.8) * (1 + g.fear * 1.2);
      const lone = g.n === 1;
      const feedFace = sp.diet === 'plankton' ? g.act * clamp(curLen * 1.5, 0, 1) : 0;
      let alive = 0;
      for (let i = g.start; i < g.start + g.n; i++) {
        if (dead[i]) {
          if (g.t - dead[i] > REVIVE_AFTER) { dead[i] = 0; fp[i * 3] = g.c.x + fo[i * 3] * 3; fp[i * 3 + 1] = g.c.y; fp[i * 3 + 2] = g.c.z + fo[i * 3 + 2] * 3; }
          else { _mm.makeScale(0, 0, 0); mesh.setMatrixAt(i, _mm); cocoon?.setMatrixAt(i, _mm); dirty = true; continue; }
        }
        alive++;
        const ox = fo[i * 3] * spreadK, oz = fo[i * 3 + 2] * spreadK;
        const wob = lone ? 0 : (g.type === 'anem' ? 0.12 : 0.4) * (1 - rest * 0.7);
        const dart = feedFace * 0.25 * Math.sin(t * 3.1 + i * 7.3);     // quick snaps at passing plankton
        let tx = g.c.x + ox * cr - oz * sr + Math.sin(t * 0.7 + i) * wob + upX * dart;
        let ty = g.c.y + fo[i * 3 + 1] * spreadK - camNear * 0.2 + Math.sin(t * 0.9 + i * 1.7) * wob * 0.6;
        let tz = g.c.z + ox * sr + oz * cr + Math.cos(t * 0.6 + i) * wob + upZ * dart;
        // grazers dip to bite the reef
        if (sp.diet === 'algae' && g.act > 0.5) {
          const bite = Math.pow(Math.max(0, Math.sin(t * 0.7 + i * 2.1)), 10);
          ty -= bite * 0.45;
          if (bite > 0.97 && sp.big) env.crunch(Math.hypot(fp[i * 3] - cam.x, fp[i * 3 + 1] - cam.y, fp[i * 3 + 2] - cam.z));
        }
        const px = fp[i * 3], py = fp[i * 3 + 1], pz = fp[i * 3 + 2];
        _v.set(tx - px, ty - py, tz - pz);
        const L = _v.length(), maxS = Math.max(sp.speed * (1.7 + g.fear * 1.5), 0.3);
        _v.multiplyScalar(Math.min(maxS, L * 1.1) / Math.max(L, 1e-4)).add(g.v);
        // flee the drone and any predator on the prowl
        if (g.type !== 'anem') {
          _w.set(px - cam.x, py - cam.y, pz - cam.z);
          const cd = _w.length(), fr = sp.big ? 3.5 : 4.5;
          if (cd < fr) _v.addScaledVector(_w, (fr - cd) * 2.2 / Math.max(cd, 0.1));
          if (!isPredator) for (const th of env.threats) {
            if (!th.r) continue;
            const ddx = px - th.x, ddy = py - th.y, ddz = pz - th.z, dd = Math.hypot(ddx, ddy, ddz);
            if (dd < th.r) { const k = (th.r - dd) * 2.8 / Math.max(dd, 0.1); _v.x += ddx * k; _v.y += ddy * k; _v.z += ddz * k; g.fear = Math.max(g.fear, 0.8); }
          }
        }
        if (py < T.h(px, pz) + 0.15) _v.y += 1.5;
        const k = 1 - Math.exp(-dt * (lone ? 1.0 : 2.6 + g.fear * 2));
        let vx = fv[i * 3] + (_v.x - fv[i * 3]) * k, vy = fv[i * 3 + 1] + (_v.y - fv[i * 3 + 1]) * k, vz = fv[i * 3 + 2] + (_v.z - fv[i * 3 + 2]) * k;
        fv[i * 3] = vx; fv[i * 3 + 1] = vy; fv[i * 3 + 2] = vz;
        const nx = px + vx * dt, ny = Math.min(py + vy * dt, -0.5), nz = pz + vz * dt;
        fp[i * 3] = nx; fp[i * 3 + 1] = ny; fp[i * 3 + 2] = nz;
        // heading: where it swims, turned into the current while feeding on plankton
        let hx = vx + upX * feedFace * 0.8, hz = vz + upZ * feedFace * 0.8;
        let hs = Math.hypot(hx, hz);
        if (hs < 0.05) { hx += Math.cos(g.head + i) * 0.05; hz += Math.sin(g.head + i) * 0.05; hs = Math.hypot(hx, hz); }
        const hy = clamp(vy, -hs * 0.6, hs * 0.6);
        _w.set(nx + hx, ny + hy, nz + hz); _v.set(nx, ny, nz);
        _mm.lookAt(_w, _v, UPV);
        if (cocoon) {
          const c = smooth(0.55, 0.9, rest);
          _mc.copy(_mm); _ss.set(fs[i] * 0.6 * c, fs[i] * 0.85 * c, fs[i] * 1.7 * c); _mc.scale(_ss); _mc.setPosition(nx, ny, nz);
          cocoon.setMatrixAt(i, _mc);
        }
        _ss.setScalar(fs[i]); _mm.scale(_ss); _mm.setPosition(nx, ny, nz);
        mesh.setMatrixAt(i, _mm);
        dirty = true;
      }
      if (g.prey) g.prey.alive = alive;
    }
    if (dirty) { mesh.instanceMatrix.needsUpdate = true; if (cocoon) cocoon.instanceMatrix.needsUpdate = true; }
  }

  function nearest(cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number) {
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      if (dead[i]) continue;
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < maxD && d < best && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3) > 0.55) best = d;
    }
    return best;
  }
  function nearestPos(cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number, out: THREE.Vector3) {
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      if (dead[i]) continue;
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z, d = Math.hypot(dx, dy, dz);
      if (d < maxD && d < best && (dx * fwd.x + dz * fwd.z) / Math.max(d, 1e-3) > 0.2) { best = d; out.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]); }
    }
    return best;
  }
  // what the species is doing right now, for the field guide
  function status(): string {
    if (groups.some((g) => g.hunt)) return '狩り中';
    const a = groups.reduce((s, g) => s + g.act, 0) / groups.length;
    if (a < 0.35) return sp.habitat === 'anemone' ? 'イソギンチャクの中で休息中' : sp.cocoon ? '粘液の膜にくるまって眠っている' : '岩陰で休息中';
    if (Math.abs(target - a) > 0.2) return target > a ? 'そろそろ動き出す' : 'そろそろ休む';
    return ({ plankton: 'プランクトンを食べている', algae: '藻をかじっている', invert: '餌を探している', fish: '巡回中', filter: 'プランクトンを濾して食べている' } as Record<string, string>)[sp.diet || 'plankton'];
  }
  function subjects(out: Subject[]) {
    const giant = sp.size[1] > 3;
    groups.forEach((g, gi) => {
      if (!g.placed) return;
      const key = `${sp.id}:${gi}`, size = sp.size[1];
      if (isPredator && g.hunt) {
        const h = g.hunt;
        out.push({ key: key + ':hunt', label: sp.ja, kind: 'hunt', prio: 4, size: 3, pos: () => g.c, status: () => `${h.prey.label}を狙っている`, live: () => g.hunt === h });
      } else if (g.type === 'roam' && sp.big) {
        out.push({ key, label: sp.ja, kind: giant ? 'giant' : 'big', prio: (giant ? 3.5 : 2.1) * (0.45 + 0.55 * g.act), size, pos: () => g.c, status, live: () => g.placed });
      } else if (g.type === 'reef' && sp.big && g.act > 0.5) {
        out.push({ key, label: sp.ja, kind: 'big', prio: 1.4, size: size * 3, pos: () => g.c, status, live: () => g.placed });
      } else if (g.type === 'anem') {
        out.push({ key, label: sp.ja, kind: 'anemone', prio: 1.6, size: 0.5, pos: () => g.a!.pos, status, live: () => true });
      }
    });
  }
  return {
    sp, mesh, update, nearest, nearestPos, status, subjects,
    preyGroups: () => groups.filter((g) => g.prey).map((g) => g.prey!),
    reset() { for (const g of groups) g.placed = false; },
  };
}
export type FishSystem = NonNullable<ReturnType<typeof makeFishSystem>>;
