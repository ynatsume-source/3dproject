// ワモンダコ (Octopus cyanea), the day octopus: it walks the reef probing for crabs, flushes through
// passing-cloud colour displays, blanches and jets away when the drone crowds it, and spends the
// night tucked in its den.
import * as THREE from 'three';
import { clamp, smooth, R, rr } from '../core/math';
import { mat } from '../render/common';
import { LIMIT } from '../ocean/scenery';
import { activity, logEvent, oneOf, type Env, type Subject } from './env';

function octopusGeometry() {
  const pos: number[] = [], nrm: number[] = [], part: number[] = [], arm: number[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4, p: number, a: number) => {
    const ng = (g.index ? g.toNonIndexed() : g);
    ng.applyMatrix4(m);
    ng.computeVertexNormals();
    pos.push(...ng.attributes.position.array); nrm.push(...ng.attributes.normal.array);
    for (let i = 0; i < ng.attributes.position.count; i++) { part.push(p); arm.push(a); }
  };
  // mantle (the "head" bag), set behind and above the arm crown
  add(new THREE.SphereGeometry(0.5, 22, 14), new THREE.Matrix4().compose(new THREE.Vector3(0, 0.32, -0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(0.5, 0.46, 0.7)), 0, 0);
  // eyes on small turrets
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.045, 10, 8), new THREE.Matrix4().makeTranslation(sx * 0.14, 0.25, 0.12), 2, 0);
  // arms: unit-length tapered tubes; the vertex shader bends them
  for (let a = 0; a < 8; a++) {
    const g = new THREE.CylinderGeometry(0.012, 0.055, 1, 7, 14, true);
    g.translate(0, 0.5, 0);
    add(g, new THREE.Matrix4(), 1, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aArm', new THREE.Float32BufferAttribute(arm, 1));
  return g;
}
const GEO = octopusGeometry();

function octopusMaterial() {
  return mat(
    `attribute float aPart; attribute float aArm;
     uniform float uSpread; uniform float uWalk; uniform float uSeed;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying float vT;
     void main(){
       vec3 p = position; vec3 n = normal; float t = 0.0;
       if (aPart > 0.5 && aPart < 1.5) {
         t = position.y;
         float th = aArm * 0.785398 + 0.39;
         vec3 dir = vec3(sin(th), 0.0, cos(th)), side = vec3(cos(th), 0.0, -sin(th));
         float L = 0.95;
         float wave = sin(uTime * 1.4 + aArm * 1.7 + uSeed - t * 4.0) * 0.14 * uWalk * t;
         float curl = t * t * (0.7 + 0.5 * sin(uTime * 0.6 + aArm * 2.3 + uSeed));
         vec3 splay = vec3(0.0, 0.1, 0.06) + dir * (L * t * mix(0.4, 1.0, uSpread)) + side * wave;
         splay.y += -0.1 * t + curl * 0.22;
         vec3 trail = vec3(0.0, 0.18, -0.1) + vec3(0.0, 0.05, -1.0) * L * t + dir * 0.06 * t + side * wave * 0.4;
         vec3 c = mix(trail, splay, uSpread);
         p = c + side * position.x + vec3(0.0, 1.0, 0.0) * position.z;
         n = normalize(side * normal.x + vec3(0.0, 1.0, 0.0) * normal.z + vec3(0.0, 0.3, 0.0));
       }
       vec4 w = modelMatrix * vec4(p, 1.0);
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * n); vL = p; vPart = aPart; vT = t;
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    `uniform vec3 uCamo; uniform float uAlarm; uniform float uSeed;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying float vT;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       // mottled camouflage with pale spots, and a slow "passing cloud" of dark pigment
       float m = vn2(vL.xz * 9.0 + vL.y * 6.0 + uSeed);
       float spots = smoothstep(0.72, 0.82, vn2(vL.xz * 24.0 + vL.y * 17.0 + uSeed));
       float cloud = smoothstep(0.55, 0.9, sin(vL.z * 9.0 + vL.x * 4.0 - uTime * 2.2 + uSeed) * 0.5 + 0.5) * (1.0 - uAlarm);
       vec3 camo = uCamo * (0.7 + 0.5 * m);
       camo = mix(camo, vec3(0.9, 0.86, 0.78), spots * 0.6);
       camo = mix(camo, camo * 0.45, cloud * 0.6);
       vec3 alarm = mix(vec3(0.46, 0.1, 0.07), vec3(0.95, 0.9, 0.85), smoothstep(0.62, 0.75, vn2(vL.xz * 16.0 - vL.y * 11.0)) * 0.6);
       vec3 alb = mix(camo, alarm, uAlarm);
       if (vPart > 0.5 && vPart < 1.5) alb = mix(alb, vec3(0.92, 0.85, 0.78), smoothstep(-0.02, -0.05, vL.y) * 0.5);   // pale suckers underneath
       if (vPart > 1.5) alb = mix(vec3(0.85, 0.8, 0.55), vec3(0.03), step(abs(vL.y - 0.25), 0.01));   // gold eye, slit pupil
       gl_FragColor = vec4(shade(alb, vWp, n, 0.6), 1.0);
     }`,
    { uniforms: { uSpread: { value: 1 }, uWalk: { value: 0 }, uSeed: { value: Math.random() * 20 }, uCamo: { value: new THREE.Color(0.55, 0.42, 0.3) }, uAlarm: { value: 0 } },
      opts: { side: THREE.DoubleSide } });
}

// a still model for the field guide
export function octopusModel() { return new THREE.Mesh(GEO, octopusMaterial()); }

type State = 'den' | 'forage' | 'jet' | 'settle';
const STATUS: Record<State, string> = { den: '巣穴から様子をうかがっている', forage: '岩の上を歩いて餌を探している', jet: 'ジェット噴射で逃げている', settle: '体の色を周りに合わせている' };

export function makeOctopi(oc: any, count: number, rock: number[]) {
  const list: any[] = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(GEO, octopusMaterial());
    m.frustumCulled = false;
    const o: any = { mesh: m, pos: new THREE.Vector3(), den: new THREE.Vector3(), head: 0, t: R() * 50, state: 'den' as State, stateT: 0, placed: false,
      spread: 0.3, walk: 0, alarm: 0, size: rr(0.55, 0.8), goal: null as THREE.Vector3 | null, up: new THREE.Vector3(0, 1, 0) };
    m.scale.setScalar(o.size);
    (m.material as THREE.ShaderMaterial).uniforms.uCamo.value.setRGB(rock[0] * 1.05, rock[1] * 0.9, rock[2] * 0.75);
    o.subject = { key: `octopus:${i}`, label: 'ワモンダコ', kind: 'octopus', prio: 2.1, size: 0.9, pos: () => (o.placed ? o.pos : null), status: () => STATUS[o.state as State], live: () => o.placed } as Subject;
    oc.group.add(m);
    list.push(o);
  }
  return list;
}

const _v = new THREE.Vector3(), _g = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _ax = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qj = new THREE.Quaternion();
// the surface it crawls on: terrain and everything standing on it (rock, coral), smoothed over about
// its own size so that a coral head is a rounded mound with sides to cling to, not a stepped block
function surf(T: any, x: number, z: number) {
  let c = 0, mx = -1e9;
  for (let k = 0; k < 7; k++) {
    const a = k * 1.0472, r = k === 6 ? 0 : 0.55, v = solid(T, x + Math.cos(a) * r, z + Math.sin(a) * r);
    c += k === 6 ? v * 2 : v; mx = Math.max(mx, v);
  }
  return (c / 8) * 0.75 + mx * 0.25;
}
// terrain and the obstacle grid, interpolated between cells (the grid's own lookup takes the tallest
// neighbour, which is right for keeping clear of things but makes a staircase to walk on)
function solid(T: any, x: number, z: number) {
  const h = T.h(x, z), O = T.obst;
  if (!O) return h;
  const N = O.N, fx = Math.min(N - 1.001, Math.max(0, x + O.half - 0.5)), fz = Math.min(N - 1.001, Math.max(0, z + O.half - 0.5));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, a = O.a, k = j * N + i;
  const g = (q: number) => Math.max(a[q], h);
  return (g(k) * (1 - u) + g(k + 1) * u) * (1 - v) + (g(k + N) * (1 - u) + g(k + N + 1) * u) * v;
}
// how steep the surface is here (rise over run), and its gradient in g
function slope(T: any, x: number, z: number, g: THREE.Vector3) {
  const e = 0.45;
  g.set((surf(T, x + e, z) - surf(T, x - e, z)) / (2 * e), 0, (surf(T, x, z + e) - surf(T, x, z - e)) / (2 * e));
  return Math.hypot(g.x, g.z);
}
export function updateOctopi(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const T = oc.T, act = activity('day', env);
  for (const o of oc.octopi || []) {
    o.t += dt; o.stateT += dt;
    const dx = o.pos.x - cam.x, dz = o.pos.z - cam.z;
    if (!o.placed || dx * dx + dz * dz > 75 * 75) {
      // a den in the reef ahead of the drone
      let best: [number, number] = [cam.x, cam.z], bs = -1;
      const near = !o.placed;
      for (let k = 0; k < 30; k++) {
        const d = near ? rr(10, 30) : rr(30, 45), lat = (R() * 2 - 1) * 18;
        const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT);
        const r = T.reef(x, z), h = T.h(x, z);
        // a crevice at the foot of rock or coral: reef here, and something standing higher close by
        let rise = 0; for (let k2 = 0; k2 < 6; k2++) { const a2 = k2 * 1.047; rise = Math.max(rise, surf(T, x + Math.cos(a2) * 0.9, z + Math.sin(a2) * 0.9) - surf(T, x, z)); }
        const sc = h > -0.9 ? -0.5 : r * (h > -18 ? 1 : 0.3) * (0.4 + Math.min(1, rise / 0.8));
        if (sc > bs) { bs = sc; best = [x, z]; }
      }
      o.den.set(best[0], surf(T, best[0], best[1]), best[1]);
      o.pos.copy(o.den); o.up.set(0, 1, 0); o.state = 'den'; o.stateT = 0; o.placed = true; o.goal = null;
    }
    const camD = o.pos.distanceTo(cam);
    const st = o.state as State;
    // decide
    if (st === 'den') { if (act > 0.6 && o.stateT > rr(20, 60) && camD > 3) { o.state = 'forage'; o.stateT = 0; } }
    else if (st === 'forage') {
      if (camD < 2.4) { o.state = 'jet'; o.stateT = 0; o.head = Math.atan2(o.pos.z - cam.z, o.pos.x - cam.x); logEvent(env, 'octopus', oneOf(['ワモンダコが色を変えて、ジェット噴射で逃げた', 'ワモンダコが白く色を抜き、墨を残すように飛び去った', 'ドローンに驚いたワモンダコが、脚をそろえて一気に泳ぎ去った']), o.pos.x, o.pos.z, () => o.pos); }
      else if (act < 0.4 || o.stateT > 150) { o.goal = o.den.clone(); if (Math.hypot(o.pos.x - o.den.x, o.pos.z - o.den.z) < 0.5) { o.state = 'den'; o.stateT = 0; } }
    } else if (st === 'jet') { if (o.stateT > 2.4) { o.state = 'settle'; o.stateT = 0; } }
    else if (st === 'settle') { if (o.stateT > 6) { o.state = act > 0.5 ? 'forage' : 'den'; o.stateT = 0; if (o.state === 'den') o.pos.copy(o.den); } }

    // act
    let speed = 0, spread = 1, walk = 0, alarm = 0, lift = 0;
    if (o.state === 'den') { spread = 0.25; lift = -0.08; }
    else if (o.state === 'forage') {
      // probe along the reef: the next spot is a crack or the edge of a coral head near the den
      if (!o.goal || Math.hypot(o.pos.x - o.goal.x, o.pos.z - o.goal.z) < 0.4) {
        let best: THREE.Vector3 | null = null, bs = -1;
        for (let k = 0; k < 10; k++) {
          const a = R() * Math.PI * 2, r = rr(0.8, 3.5);
          const gx = clamp(o.den.x + Math.cos(a) * r * 1.6, -LIMIT, LIMIT), gz = clamp(o.den.z + Math.sin(a) * r * 1.6, -LIMIT, LIMIT);
          if (!T.wet(gx, gz, 0.6)) continue;
          const sc = T.reef(gx, gz) + Math.min(1, slope(T, gx, gz, _g)) * 0.8 + R() * 0.3;
          if (sc > bs) { bs = sc; best = new THREE.Vector3(gx, 0, gz); }
        }
        o.goal = best ?? o.den.clone();
      }
      const gx = o.goal.x - o.pos.x, gz = o.goal.z - o.pos.z;
      let d = Math.atan2(gz, gx) - o.head; d = Math.atan2(Math.sin(d), Math.cos(d));
      o.head += d * Math.min(1, dt * 0.8);
      const pause = Math.sin(o.t * 0.4) > 0.3 ? 0 : 1;   // stop now and then to probe a crevice
      speed = 0.16 * pause; walk = pause;
    } else if (o.state === 'jet') { speed = 1.8 * (1 - o.stateT / 2.6); spread = 0; alarm = 1; lift = 0.6 * Math.sin(Math.min(1, o.stateT / 2.4) * Math.PI); }
    else if (o.state === 'settle') { alarm = 1 - smooth(0, 5, o.stateT); }
    o.spread += (spread - o.spread) * Math.min(1, dt * (o.state === 'jet' ? 6 : 1.2));
    o.walk += (walk - o.walk) * Math.min(1, dt * 2);
    o.alarm += (alarm - o.alarm) * Math.min(1, dt * (alarm > o.alarm ? 8 : 1));
    // Crawling keeps to the surface, up and down its sides: speed is along the surface, so on a steep
    // flank the octopus creeps up or down it rather than hopping onto the top or dropping off the edge.
    const k = slope(T, o.pos.x, o.pos.z, _g);
    const along = o.state === 'jet' ? 1 : 1 / Math.sqrt(1 + k * k * 1.6);
    o.pos.x = clamp(o.pos.x + Math.cos(o.head) * speed * along * dt, -LIMIT, LIMIT);
    o.pos.z = clamp(o.pos.z + Math.sin(o.head) * speed * along * dt, -LIMIT, LIMIT);
    const floorY = surf(T, o.pos.x, o.pos.z);
    if (o.state === 'jet' || o.state === 'settle') o.pos.y += (Math.max(floorY + lift, o.pos.y - dt * 0.4) - o.pos.y) * Math.min(1, dt * 3);   // (sinks back down after a jet)
    else o.pos.y += (floorY + lift - o.pos.y) * Math.min(1, dt * 6);
    // lie against the surface: the body's up is the surface normal (flat on top, sideways on a wall),
    // pressed a little closer on steep sides, where it flattens as octopuses do
    _n.set(-_g.x, 1, -_g.z).normalize();
    if (o.state === 'jet') _n.set(0, 1, 0);
    o.up.lerp(_n, Math.min(1, dt * 3)).normalize();
    _f.set(Math.cos(o.head), 0, Math.sin(o.head)); _f.addScaledVector(o.up, -_f.dot(o.up)).normalize();
    _r.crossVectors(o.up, _f).normalize();
    _m.makeBasis(_r, o.up, _f);
    _q.setFromRotationMatrix(_m);
    if (o.state === 'jet') _q.multiply(_qj.setFromAxisAngle(_ax.set(1, 0, 0), -0.3));
    o.mesh.quaternion.slerp(_q, Math.min(1, dt * 5));
    const steep = 1 - o.up.y;
    o.mesh.scale.set(o.size, o.size * (1 - steep * 0.25), o.size);
    o.mesh.position.copy(o.pos).addScaledVector(o.up, -steep * 0.05 * o.size);
    const u = (o.mesh.material as THREE.ShaderMaterial).uniforms;
    u.uSpread.value = o.spread; u.uWalk.value = o.walk; u.uAlarm.value = o.alarm;
    void _v;
  }
}
