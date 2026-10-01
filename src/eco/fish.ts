import { loneLength, schoolLength, memberLength } from './growth';
// Fish as groups with needs. Each group (a school, a pair, a loner or an anemone family) follows the
// clock: active species forage the way their diet dictates, resting ones tuck into the reef, prey
// scatter from predators and from the drone, and predators hunt when hungry, mostly at dusk and dawn.
import * as THREE from 'three';
import { clamp, smooth, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { SHAPES, fishGeometry, fishMaterial, UPV } from '../ocean/models';
import { mat } from '../render/common';
import { activity, logEvent, oneOf, type Env, type PreyGroup, type Subject } from './env';
import type { Species } from '../data/locations';

const _c = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _mm = new THREE.Matrix4(), _mc = new THREE.Matrix4(), _ss = new THREE.Vector3();
const REVIVE_AFTER = 150;   // s until another fish drifts in to take a lost one's place

type GroupType = 'anem' | 'reef' | 'roam';
// A hunt: close in on the school unhurried, then burst at one fish. The hunter is fast but turns wide;
// the fish is slower but jinks, so most bursts overshoot or end with the fish in the reef. It tries
// again a few times, catching its breath in between, before giving up.
interface Hunt {
  prey: PreyGroup; t0: number; phase: 'stalk' | 'burst' | 'recover'; pt: number; tries: number;
  target: number; tp: THREE.Vector3; speed: number; close: number;
}
// the fish being chased: where the hunter is, and which way it is jinking
export interface Chase { i: number; x: number; y: number; z: number; t: number; juke: number; jukeT: number }
interface Group {
  type: GroupType; n: number; start: number;
  a?: { pos: THREE.Vector3; s: number };
  c: THREE.Vector3; v: THREE.Vector3; head: number; t: number; alt: number;
  anchor: { x: number; z: number }; placed: boolean;
  act: number; fear: number; hunger: number; ready?: boolean;
  hunt: null | Hunt; cooldown: number;
  prey?: PreyGroup;
  ch?: Chase;                             // one of this group's fish is being chased
  // cave-resting sharks: out on the reef, going in along the tunnel, lying on the floor, coming out
  born?: number;
  cr?: { spot: { pos: THREE.Vector3; head: number; t: number }; mode: 'out' | 'in' | 'rest' | 'leave'; t: number; dir: number };
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
  // the reef height under each fish and under where it is heading, refreshed every few frames in turn
  // (sampling the terrain is the costliest thing a fish does)
  const flC = new Float32Array(total).fill(-1e9), ftC = new Float32Array(total).fill(-1e9);
  let frame = 0;
  for (const g of groups) {
    const base = schoolLength(sp.size[0], sp.size[1]);
    const spread = g.type === 'anem' ? [0.35, 0.2, 0.35] : (sp.spread || [0, 0, 0]);
    for (let i = g.start; i < g.start + g.n; i++) {
      const fr = sp.freq || (sp.big ? [3, 5] : [8, 12]);
      swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr(fr[0], fr[1]); swim[i * 3 + 2] = rr(0.88, 1.1);
      fs[i] = (g.n === 1 ? loneLength(sp.size[0], sp.size[1]) : memberLength(base)) / 1.28;
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
         // a real mucus cocoon is almost invisible: a thin, clear film that only catches light at its rim
         float f = pow(1.0 - abs(dot(n, V)), 3.0);
         vec3 c = vec3(0.85, 0.93, 0.95) * (0.1 + uAmb * 0.4) + lamp(vec3(0.9), vWp, faceforward(n, -V, n)) * 0.5;
         gl_FragColor = vec4(fogIt(c, vWp), 0.015 + 0.16 * f);
       }`, { opts: { transparent: true, depthWrite: false } }), total);
    cocoon.frustumCulled = false;
    cocoon.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oc.group.add(cocoon);
  }
  const T = oc.T;
  const isPredator = sp.diet === 'fish';
  const cave = sp.rests === 'cave' ? oc.cave : null;
  if (cave) { const spots = cave.restSpots(groups.length); groups.forEach((g, i) => { g.cr = { spot: spots[i % spots.length], mode: 'out', t: 0, dir: 1 }; }); }
  const _e = new THREE.Vector3();
  function toRest(g: Group) {
    const sp0 = g.cr!.spot;
    g.cr!.mode = 'rest';
    g.c.set(sp0.pos.x, sp0.pos.y + 0.09 * sp.size[1], sp0.pos.z); g.head = sp0.head;
    for (let i = g.start; i < g.start + g.n; i++) { fp[i * 3] = g.c.x; fp[i * 3 + 1] = g.c.y; fp[i * 3 + 2] = g.c.z; fv[i * 3] = fv[i * 3 + 1] = fv[i * 3 + 2] = 0; }
  }
  // Follow the tunnel route toward tour time `to`; true once there.
  function alongRoute(g: Group, dt: number, to: number) {
    const cr = g.cr!, step = dt * 0.9;
    cr.t = cr.t < to ? Math.min(to, cr.t + step) : Math.max(to, cr.t - step);
    cave.routeAt(cr.t, _e, 0.25 * sp.size[1] + 0.45);
    g.v.set((_e.x - g.c.x) / Math.max(dt, 1e-3), (_e.y - g.c.y) / Math.max(dt, 1e-3), (_e.z - g.c.z) / Math.max(dt, 1e-3)).clampLength(0, sp.speed * 1.5);
    if (Math.hypot(_e.x - g.c.x, _e.z - g.c.z) > 1e-3) g.head = Math.atan2(_e.z - g.c.z, _e.x - g.c.x);
    g.c.copy(_e);
    return cr.t === to;
  }
  // By day: into the cave (unseen if the camera is elsewhere, else in through the nearer end), onto the
  // floor, still; at dusk: back out along the tunnel. Returns true while the cave has the group.
  function caveRoutine(g: Group, dt: number, cam: THREE.Vector3) {
    const cr: NonNullable<Group['cr']> = g.cr!, len = cave.tourLength, sp0 = cr.spot;
    const mode = () => cr.mode as string;
    const want = g.act < 0.45;
    const camTo = (p: { x: number; z: number }) => Math.hypot(p.x - cam.x, p.z - cam.z);
    if (cr.mode === 'out') {
      if (!want) return false;
      if (camTo(g.c) > 32 && camTo(sp0.pos) > 32) toRest(g);   // nobody is watching: it is simply there
      else {
        const a = cave.tourStart(false), b = cave.tourStart(true), rev = Math.hypot(b.x - g.c.x, b.z - g.c.z) < Math.hypot(a.x - g.c.x, a.z - g.c.z);
        const e = rev ? b : a, d = Math.hypot(e.x - g.c.x, e.z - g.c.z);
        if (d < 2.5) { cr.mode = 'in'; cr.t = rev ? len : 0; }
        else {
          // swim for the entrance
          let dh = Math.atan2(e.z - g.c.z, e.x - g.c.x) - g.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          g.head += dh * Math.min(1, dt * 1.2);
          g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(sp.speed * 0.6);
          g.c.x += g.v.x * dt; g.c.z += g.v.z * dt;
          g.c.y += (Math.min(e.y, T.h(g.c.x, g.c.z) + 1.5) - g.c.y) * Math.min(1, dt * 0.6);
          return true;
        }
      }
    }
    if (mode() === 'in' && alongRoute(g, dt, sp0.t)) cr.mode = 'rest';
    if (mode() === 'rest') {
      _e.set(sp0.pos.x, sp0.pos.y + 0.09 * sp.size[1], sp0.pos.z);
      g.c.lerp(_e, Math.min(1, dt * 0.8)); g.v.set(0, 0, 0);
      let dh = sp0.head - g.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); g.head += dh * Math.min(1, dt * 0.8);
      if (!want) { cr.mode = 'leave'; cr.t = sp0.t; cr.dir = sp0.t < len / 2 ? 0 : len; }
      return true;
    }
    if (mode() === 'leave') {
      if (camTo(g.c) > 40) { cr.mode = 'out'; g.placed = false; return true; }
      if (alongRoute(g, dt, cr.dir)) cr.mode = 'out';
      return true;
    }
    return mode() !== 'out';
  }
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
      pick(x, y, z) {
        let best = -1, bs = Infinity;
        for (let i = g.start; i < g.start + g.n; i++) {
          if (dead[i]) continue;
          const dp = Math.hypot(fp[i * 3] - x, fp[i * 3 + 1] - y, fp[i * 3 + 2] - z);
          const out = Math.hypot(fp[i * 3] - g.c.x, fp[i * 3 + 2] - g.c.z);   // stragglers at the edge are easier
          const sc = dp - out * 0.8 + R() * 0.8;
          if (sc < bs) { bs = sc; best = i; }
        }
        return best;
      },
      at(i, out, vel) {
        if (i < g.start || i >= g.start + g.n || dead[i]) return false;
        out.x = fp[i * 3]; out.y = fp[i * 3 + 1]; out.z = fp[i * 3 + 2];
        if (vel) { vel.x = fv[i * 3]; vel.y = fv[i * 3 + 1]; vel.z = fv[i * 3 + 2]; }
        return true;
      },
      chased(i, x, y, z) {
        if (!g.ch || g.ch.i !== i) g.ch = { i, x, y, z, t: g.t, juke: R() < 0.5 ? 1 : -1, jukeT: rr(0.3, 0.7) };
        g.ch.x = x; g.ch.y = y; g.ch.z = z; g.ch.t = g.t;
        g.fear = 1;
      },
      safe(i) { return !dead[i] && fp[i * 3 + 1] < flC[i] + 0.3; },   // tucked down into the reef
      kill(i) { if (dead[i]) return false; let n = 0; for (let k = g.start; k < g.start + g.n; k++) if (!dead[k]) n++; if (n <= 1) return false; dead[i] = g.t || 1e-3; if (g.ch?.i === i) g.ch = undefined; return true; },
    };
  }

  function findSpot(cam: THREE.Vector3, fx: number, fz: number, dmin: number, dmax: number, wantReef: boolean): [number, number] {
    let best: [number, number] = [cam.x, cam.z], bs = -1;
    for (let k = 0; k < 28; k++) {
      const d = rr(dmin, dmax), lat = (R() * 2 - 1) * (dmax * 0.5);
      const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT);
      const r = !T.wet(x, z, 1.6) ? -0.5 : wantReef ? T.reef(x, z) : 1;
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
    g.placed = true; g.born = g.t;   // (it swims in: grows from nothing rather than popping up)
  }

  // Predators: build hunger, pick a school, close in, then chase one fish in bursts.
  const _tv = { x: 0, y: 0, z: 0 }, _tw = { x: 0, y: 0, z: 0 }, _d = new THREE.Vector3();
  function hunt(g: Group, dt: number, env: Env) {
    g.hunger = Math.min(1, g.hunger + dt / 150);
    g.cooldown = Math.max(0, g.cooldown - dt);
    const drive = g.hunger * (0.2 + 0.8 * env.twilight + 0.3 * env.night);
    if (!g.hunt && g.cooldown <= 0 && drive > 0.5 && R() < dt * 0.08) {
      let best: PreyGroup | null = null, bd = 45;
      for (const p of env.prey) { const d = Math.hypot(p.x - g.c.x, p.z - g.c.z); if (p.alive > 1 && d < bd) { bd = d; best = p; } }
      if (best) { g.c.set(fp[g.start * 3], fp[g.start * 3 + 1], fp[g.start * 3 + 2]); g.v.set(fv[g.start * 3], fv[g.start * 3 + 1], fv[g.start * 3 + 2]);   // (the hunt starts from where its body actually is)
        g.hunt = { prey: best, t0: g.t, phase: 'stalk', pt: 0, tries: 0, target: -1, tp: new THREE.Vector3(best.x, best.y, best.z), speed: g.v.length(), close: 1e9 }; logEvent(env, 'hunt', oneOf([`${sp.ja}が${best.label}の群れを狙っている`, `${sp.ja}が${best.label}の群れに狙いを定めた`, `${sp.ja}が${best.label}の群れの下を、ゆっくり回りはじめた`, `${sp.ja}の気配に、${best.label}の群れがざわつきはじめた`, `${sp.ja}が${best.label}の群れとの距離を、じわじわと詰めていく`]), g.c.x, g.c.z, () => g.c); }
    }
    if (!g.hunt) return false;
    const h = g.hunt, p = h.prey, len = fs[g.start] * 1.28;
    h.pt += dt;
    const end = (caught: boolean) => {
      if (caught) { g.hunger = 0; const at = g.c.clone(); logEvent(env, 'catch', oneOf([`${sp.ja}が${p.label}を捕らえた`, `${sp.ja}の突進が決まった。${p.label}が一匹、群れから消えた`, `一瞬の出来事だった。${sp.ja}が${p.label}をくわえて泳ぎ去る`, `${sp.ja}の狩りが成功。${p.label}の群れがぱっと散った`]), g.c.x, g.c.z, () => at); }
      else { g.hunger *= 0.85; if (h.close < 1.2) logEvent(env, 'hunt', oneOf([`${p.label}が間一髪で${sp.ja}の追跡を振り切った`, `${sp.ja}の突進は空を切った。${p.label}は群れの中へ`, `${p.label}の鋭い切り返しに、${sp.ja}は追いつけなかった`, `${p.label}がサンゴの隙間へ逃げ込み、${sp.ja}はあきらめた`]), g.c.x, g.c.z, () => g.c); }   // (only the near things)
      g.hunt = null; g.cooldown = rr(60, 150);
    };
    let wantSpeed = sp.speed, turn = 1.2;
    if (h.phase === 'stalk') {
      // close in unhurried, a little below the school
      _d.set(p.x - g.c.x, p.y - 1.2 - g.c.y, p.z - g.c.z);
      h.tp.set(p.x, p.y, p.z);
      wantSpeed = sp.speed * 1.1;
      if (_d.length() < 7 && p.alive > 1) {
        h.target = p.pick(g.c.x, g.c.y, g.c.z);
        if (h.target >= 0 && p.at(h.target, _tv)) { h.phase = 'burst'; h.pt = 0; h.tries++; h.tp.set(_tv.x, _tv.y, _tv.z); p.scare(); }
      }
      if (g.t - h.t0 > 40) { end(false); return false; }
    } else if (h.phase === 'burst') {
      // flat out after the one fish, leading it a little; wide turns, so a jink leaves the hunter overshooting
      if (!p.at(h.target, _tv, _tw) || (h.pt > 0.2 && Math.hypot(_tv.x - h.tp.x, _tv.y - h.tp.y, _tv.z - h.tp.z) > 3)) { h.phase = 'recover'; h.pt = 0; }   // (gone, or the school was moved off elsewhere)
      else {
        h.tp.set(_tv.x, _tv.y, _tv.z);
        const dx = _tv.x - g.c.x, dy = _tv.y - g.c.y, dz = _tv.z - g.c.z, d = Math.hypot(dx, dy, dz);
        const lead = Math.min(0.5, d / Math.max(h.speed, 0.5));
        _d.set(dx + _tw.x * lead, dy + _tw.y * lead, dz + _tw.z * lead);
        p.chased(h.target, g.c.x, g.c.y, g.c.z); h.close = Math.min(h.close, d);
        wantSpeed = sp.speed * 3.6 * Math.min(1, 0.4 + h.pt * 1.5);
        turn = 2.3;
        if (d < Math.max(0.3, len * 0.3)) {
          // at the mouth: now and then the fish still slips aside at the last instant
          if (R() < 0.7 && p.kill(h.target)) { end(true); return true; }
        }
        if (h.pt > rr(3.5, 5) || d > 9 || (h.pt > 1 && p.safe(h.target))) { h.phase = 'recover'; h.pt = 0; }   // (tired, outpaced, or the fish made it into cover)
      }
    } else {
      // missed: glide on, catch breath, come round for another go (or give up)
      _d.set(g.v.x, g.v.y * 0.3, g.v.z);
      _d.x += (p.x - g.c.x) * 0.05; _d.z += (p.z - g.c.z) * 0.05;
      wantSpeed = sp.speed * 0.6; turn = 0.8;
      if (h.pt > 3.5) {
        const d = Math.hypot(p.x - g.c.x, p.z - g.c.z);
        if (h.tries < 3 && d < 16 && p.alive > 1 && g.hunger > 0.3) { h.phase = 'stalk'; h.pt = 0; }
        else { end(false); return false; }
      }
    }
    // steer: turn the heading toward the wanted direction at a limited rate, and speed up or ease off
    const dl = _d.length();
    if (dl > 1e-4) {
      _d.multiplyScalar(1 / dl);
      _c.copy(g.v); const vl = _c.length();
      if (vl < 1e-4) _c.copy(_d); else _c.multiplyScalar(1 / vl);
      const ang = Math.acos(clamp(_c.dot(_d), -1, 1)), maxA = turn * dt;
      if (ang > maxA) { _w.crossVectors(_c, _d); if (_w.lengthSq() < 1e-8) _w.set(0, 1, 0); _c.applyAxisAngle(_w.normalize(), maxA); } else _c.copy(_d);
    }
    h.speed += (wantSpeed - h.speed) * Math.min(1, dt * (wantSpeed > h.speed ? 2.5 : 1.2));
    g.v.copy(_c).multiplyScalar(h.speed); g.v.y = clamp(g.v.y, -h.speed * 0.5, h.speed * 0.5);
    g.c.addScaledVector(g.v, dt);
    // over rock and coral: look a little ahead and rise over it smoothly (never snap up onto a ledge)
    let fl = T.top(g.c.x, g.c.z);
    const hs = Math.hypot(g.v.x, g.v.z) || 1e-3;
    for (const a of [0.25, 0.5, 0.8]) fl = Math.max(fl, T.top(g.c.x + g.v.x / hs * a * Math.max(1, h.speed), g.c.z + g.v.z / hs * a * Math.max(1, h.speed)));
    fl += 0.25;
    if (g.c.y < fl) { g.c.y += Math.min(fl - g.c.y, (1.0 + h.speed * 0.8) * dt); if (g.v.y < 0) g.v.y *= 0.6; }
    if (g.c.y > -0.8) g.c.y = -0.8;
    g.head = Math.atan2(g.v.z, g.v.x);
    return true;
  }

  const caveMode0 = (g: Group) => (g.cr ? g.cr.mode : 'out');
  let target = 1;
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
    frame++;
    const t = env.t;
    const act = activity(sp.diel, env);
    target = act;
    const upX = -env.cur.x, upZ = -env.cur.z, curLen = Math.hypot(upX, upZ);
    let dirty = false;
    for (const g of groups) {
      g.t += dt;
      if (!g.ready) { g.act = act; g.ready = true; }                // start the day where the clock is
      g.act += (act - g.act) * Math.min(1, dt * 0.08);           // settle in / wake up over ~15 s
      g.fear = Math.max(0, g.fear - dt * 0.25);
      const dxc = g.c.x - cam.x, dzc = g.c.z - cam.z, dc2 = dxc * dxc + dzc * dzc;
      if (g.type === 'anem') { if (!g.placed) place(g, cam, fx, fz, true); if (dc2 > 80 * 80) continue; }
      else if (!g.placed || (dc2 > 72 * 72 && (!g.cr || g.cr.mode === 'out'))) {
        place(g, cam, fx, fz, !g.placed);
        if (g.cr) { g.cr.mode = 'out'; if (g.act < 0.45 && Math.hypot(g.cr.spot.pos.x - cam.x, g.cr.spot.pos.z - cam.z) > 32) toRest(g); }
      }
      const floorC = T.top(g.c.x, g.c.z);
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
        const inCave = cave ? caveRoutine(g, dt, cam) : false;
        if (isPredator && !inCave) hunting = hunt(g, dt, env);
        if (!hunting && !inCave) {
          g.head += (Math.sin(g.t * 0.23 + g.start) * 0.35 + Math.sin(g.t * 0.07) * 0.2) * dt;
          g.head += T.shore(g.c.x, g.c.z, g.head, 5, 1.2) * Math.min(1, dt * 1.5);
          if (Math.abs(g.c.x) > LIMIT || Math.abs(g.c.z) > LIMIT) { let d = Math.atan2(-g.c.z, -g.c.x) - g.head; d = Math.atan2(Math.sin(d), Math.cos(d)); g.head += d * dt * 0.8; }
          const pace = sp.speed * 0.7 * (0.25 + 0.75 * g.act);
          g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(pace);
          g.c.x += g.v.x * dt; g.c.z += g.v.z * dt;
          // rise ahead of a coral head instead of scaling it; come down slowly on the far side
          let fl = floorC;
          for (const s of [1.5, 3, 5]) fl = Math.max(fl, T.top(g.c.x + g.v.x * s, g.c.z + g.v.z * s));
          const ty = Math.min(fl + g.alt * (0.4 + 0.6 * g.act) + Math.sin(g.t * 0.3) * 0.5, -1.4);
          g.c.y += (ty - g.c.y) * Math.min(1, dt * (ty > g.c.y ? 0.6 : 0.25));
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
      const appear = g.born == null ? 1 : smooth(0, 1.5, g.t - g.born);
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
          const bite = Math.pow(Math.max(0, Math.sin(t * 0.7 + i * 2.1)), 4);
          ty -= bite * 0.3;
          if (bite > 0.97 && sp.big) env.crunch(Math.hypot(fp[i * 3] - cam.x, fp[i * 3 + 1] - cam.y, fp[i * 3 + 2] - cam.z));
        }
        const px = fp[i * 3], py = fp[i * 3 + 1], pz = fp[i * 3 + 2];
        if (hunting && lone) {
          // the hunter is the hunt: its body goes where the chase goes
          const k = Math.min(1, dt * 10);
          fp[i * 3] = px + (g.c.x - px) * k; fp[i * 3 + 1] = py + (g.c.y - py) * k; fp[i * 3 + 2] = pz + (g.c.z - pz) * k;
          fv[i * 3] = g.v.x; fv[i * 3 + 1] = g.v.y; fv[i * 3 + 2] = g.v.z;
          const hs0 = Math.hypot(g.v.x, g.v.z), hy0 = clamp(g.v.y, -hs0 * 0.6, hs0 * 0.6);
          _w.set(fp[i * 3] + g.v.x, fp[i * 3 + 1] + hy0, fp[i * 3 + 2] + g.v.z); _v.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]);
          _mm.lookAt(_w, _v, UPV); _ss.setScalar(fs[i] * appear); _mm.scale(_ss); _mm.setPosition(_v);
          mesh.setMatrixAt(i, _mm); dirty = true;
          continue;
        }
        if (((frame + i) & 3) === 0 || py < flC[i] + 0.6) {   // (every frame when down against the reef)
          const out = caveMode0(g) === 'out';   // in the tunnel the floor, not the massif's top
          flC[i] = out ? T.top(px, pz) : T.ground(px, pz); ftC[i] = out ? T.top(tx, tz) : T.ground(tx, tz);
        }
        const fl = flC[i];
        ty = Math.max(ty, ftC[i] + 0.2);   // aim above the reef under the target, not into it
        const ch = g.ch && g.ch.i === i && g.t - g.ch.t < 0.3 ? g.ch : null;
        if (ch) {
          // singled out: bolt away flat out, jinking hard when the hunter is close, and dive for the reef
          const ax = px - ch.x, ay = py - ch.y, az = pz - ch.z, ad = Math.hypot(ax, ay, az) || 1;
          if ((ch.jukeT -= dt) < 0) { ch.juke = -ch.juke; ch.jukeT = rr(0.25, 0.6) * (ad < 2.5 ? 1 : 2); }
          const jang = ch.juke * (ad < 2.5 ? 1.25 : 0.45), cj = Math.cos(jang), sj = Math.sin(jang);
          const hx = ax / ad, hz = az / ad;
          const bolt = sp.speed * 2.6;
          _v.set((hx * cj - hz * sj) * bolt, 0, (hx * sj + hz * cj) * bolt);
          _v.y = (ay / ad) * bolt * 0.3 + (flC[i] + 0.1 - py) * 1.5;   // down toward cover
          // back toward the others (safety in numbers, and the reef they live on)
          _v.x += (g.c.x - px) * 0.4; _v.z += (g.c.z - pz) * 0.4;
          { const vl = _v.length(), cap = bolt * 1.1; if (vl > cap) _v.multiplyScalar(cap / vl); }
        } else {
        _v.set(tx - px, ty - py, tz - pz);
        const L = _v.length(), maxS = Math.max(sp.speed * (1.7 + g.fear * 1.5), 0.3);
        _v.multiplyScalar(Math.min(maxS, L * 1.1) / Math.max(L, 1e-4)).add(g.v);
        }
        // flee the drone and any predator on the prowl
        const caveMode = g.cr ? g.cr.mode : 'out';
        if (g.type !== 'anem' && caveMode === 'out') {
          _w.set(px - cam.x, py - cam.y, pz - cam.z);
          const cd = _w.length(), fr = sp.big ? 3.5 : 4.5;
          if (cd < fr) _v.addScaledVector(_w, (fr - cd) * 2.2 / Math.max(cd, 0.1));
          if (!isPredator && !ch) for (const th of env.threats) {
            if (!th.r) continue;
            const ddx = px - th.x, ddy = py - th.y, ddz = pz - th.z, dd = Math.hypot(ddx, ddy, ddz);
            if (dd < th.r) { const k = (th.r - dd) * 2.8 / Math.max(dd, 0.1); _v.x += ddx * k; _v.y += ddy * k; _v.z += ddz * k; g.fear = Math.max(g.fear, 0.8); }
          }
        }
        if (py < fl + 0.15) _v.y = Math.max(_v.y, Math.min((fl + 0.15 - py) * 3, 1.2));   // ease back out of the reef, no kick
        const k = 1 - Math.exp(-dt * (ch ? 9 : lone ? 1.0 : 2.6 + g.fear * 2));   // (a chased fish turns on a pin)
        let vx = fv[i * 3] + (_v.x - fv[i * 3]) * k, vy = fv[i * 3 + 1] + (_v.y - fv[i * 3 + 1]) * k, vz = fv[i * 3 + 2] + (_v.z - fv[i * 3 + 2]) * k;
        fv[i * 3] = vx; fv[i * 3 + 1] = vy; fv[i * 3 + 2] = vz;
        let nx = px + vx * dt, ny = Math.min(py + vy * dt, -0.5), nz = pz + vz * dt;
        if (oc.cave && oc.cave.pushOut(_c.set(nx, ny, nz), 0.12 * sp.size[1] + 0.1)) { nx = _c.x; ny = _c.y; nz = _c.z; }   // slide off the cave rock
        fp[i * 3] = nx; fp[i * 3 + 1] = ny; fp[i * 3 + 2] = nz;
        // heading: where it swims, turned into the current while feeding on plankton
        let hx = vx + upX * feedFace * 0.8, hz = vz + upZ * feedFace * 0.8;
        let hs = Math.hypot(hx, hz);
        // nearly still (asleep): hold a steady heading instead of turning with every tiny drift
        const still = clamp(1 - hs / 0.12, 0, 1);
        hx = hx * (1 - still) + Math.cos(g.head + i) * 0.12 * still; hz = hz * (1 - still) + Math.sin(g.head + i) * 0.12 * still; hs = Math.hypot(hx, hz);
        const hy = clamp(vy * (1 - still), -hs * 0.6, hs * 0.6);
        _w.set(nx + hx, ny + hy, nz + hz); _v.set(nx, ny, nz);
        _mm.lookAt(_w, _v, UPV);
        if (cocoon) {
          const c = smooth(0.8, 0.97, rest);                        // only once it is properly asleep
          _mc.copy(_mm); _ss.set(fs[i] * 0.42 * c, fs[i] * 0.62 * c, fs[i] * 1.35 * c); _mc.scale(_ss); _mc.setPosition(nx, ny, nz);
          cocoon.setMatrixAt(i, _mc);
        }
        _ss.setScalar(fs[i] * appear); _mm.scale(_ss); _mm.setPosition(nx, ny, nz);
        mesh.setMatrixAt(i, _mm);
        dirty = true;
      }
      if (g.prey) g.prey.alive = alive;
    }
    if (cave) {
      const resting = groups.filter((g) => g.cr!.mode === 'rest').length / groups.length;
      (mesh.material as THREE.ShaderMaterial).uniforms.uWig.value = (sp.wig ?? 1) * (1 - 0.8 * resting);
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
        out.push({ key: key + ':hunt', label: sp.ja, len: fs[g.start] * 1.28, adult: sp.size[1], kind: 'hunt', prio: 4, size: 3, pos: () => g.c, status: () => (h.phase === 'burst' ? `${h.prey.label}を追いかけている` : h.phase === 'recover' ? `かわされて、次を狙っている` : `${h.prey.label}を狙っている`), live: () => g.hunt === h, target: () => (h.phase === 'burst' ? h.tp : h.prey), frameR: () => Math.max(0.4, fs[g.start] * 1.28) });
      } else if (g.type === 'roam' && sp.big) {
        const st = g.cr ? () => (g.cr!.mode === 'rest' ? '洞窟の底で休んでいる' : g.cr!.mode === 'leave' ? '洞窟から出ていく' : g.cr!.mode === 'in' ? '洞窟へ入っていく' : status()) : status;
        out.push({ key, label: sp.ja, len: fs[g.start] * 1.28, adult: sp.size[1], kind: giant ? 'giant' : 'big', prio: (giant ? 3.5 : 2.1) * (0.45 + 0.55 * g.act) + (g.cr && g.cr.mode !== 'out' ? 0.6 : 0), size, pos: () => g.c, status: st, live: () => g.placed });
      } else if (g.type === 'reef' && sp.big && g.act > 0.5) {
        out.push({ key, label: sp.ja, len: fs[g.start] * 1.28, adult: sp.size[1], kind: 'big', prio: 1.4, size: size * 3, pos: () => g.c, status, live: () => g.placed });
      } else if (g.type === 'anem') {
        out.push({ key, label: sp.ja, kind: 'anemone', prio: 1.6, size: 0.5, pos: () => g.a!.pos, status, live: () => true });
      }
    });
  }
  // the nearest group, as something the director can be sent to film
  function focus(cam: THREE.Vector3): Subject | null {
    let best: Group | null = null, bd = Infinity;
    for (const g of groups) { if (!g.placed) continue; const p = g.type === 'anem' ? g.a!.pos : g.c, d = p.distanceTo(cam); if (d < bd) { bd = d; best = g; } }
    if (!best) return null;
    const g = best, p = g.type === 'anem' ? g.a!.pos : g.c;
    // a lone fish: its own body (not the middle of its patch), and its own size
    const one = g.n === 1 && g.type !== 'anem', at = new THREE.Vector3(), i0 = g.start;
    const pos = one ? () => at.set(fp[i0 * 3], fp[i0 * 3 + 1], fp[i0 * 3 + 2]) : () => p;
    return { key: `focus:${sp.id}`, label: sp.ja, kind: g.type === 'anem' ? 'anemone' : 'big', prio: 5, size: g.type === 'anem' ? 0.5 : Math.max(sp.size[1], g.n > 1 ? 1.2 : 0.4), len: one ? fs[i0] * 1.28 : undefined, adult: one ? sp.size[1] : undefined, pos, status, live: () => g.placed };
  }
  return {
    sp, mesh, update, nearest, nearestPos, status, subjects, focus,
    preyGroups: () => groups.filter((g) => g.prey).map((g) => g.prey!),
    dbg: { fp, dead, groups, get total() { return total; } },   // (for checks)
    reset() { for (const g of groups) g.placed = false; },
  };
}
export type FishSystem = NonNullable<ReturnType<typeof makeFishSystem>>;
