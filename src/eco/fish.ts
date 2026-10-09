import { loneLength, schoolLength, memberLength, ageOf } from './growth';
// Fish as groups with needs. Each group (a school, a pair, a loner or an anemone family) follows the
// clock: active species forage the way their diet dictates, resting ones tuck into the reef, prey
// scatter from predators and from the drone, and predators hunt when hungry, mostly at dusk and dawn.
import * as THREE from 'three';
import { clamp, smooth, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { zx, zz, outZone, toZone } from '../ocean/zone';
import { unseen } from './unseen';
import { SHAPES, fishGeometry, fishMaterial, UPV, speciesGeometry } from '../ocean/models';
import { bonyFromShape } from '../ocean/bony';
import { mat } from '../render/common';
import { activity, logEvent, oneOf, type Env, type PreyGroup, type Subject } from './env';
import type { Species } from '../data/locations';
import { makeKelpFishLife } from './kelp-life';

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
  anchor: { x: number; z: number }; placed: boolean; away?: boolean;
  goal?: { x: number; z: number };        // (a home patch further on: the group swims its patch there, at its own pace)   // (an anemone family left be, far off, and not drawn)
  bodyCenter?: THREE.Vector3;             // kelp fish can leave the group patch to feed / sleep
  act: number; fear: number; hunger: number; ready?: boolean;
  course?: number;                        // (a roaming one's course, which it weaves about)
  predT?: number;
  restLog?: boolean; shyLog?: number;
  oneI?: number;                          // (the fish shown for it: Subject.one)     // (what the sea log was last told of it: resting or not; when it last hid from a hunter)
  m?: THREE.Vector3; spread?: number;    // (where its fish are, their middle, and how far they spread from it)
  lead?: number; leadAt?: THREE.Vector3; // (the one of it that is filmed, when one is: see leadOf)
  core?: number; coreF?: number;         // (see coreOf)                         // (when a predator last frightened it, by its own clock: what it is shying from)
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

  const geo = speciesGeometry(sp);
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
  // how far through its life each fish is, by its size (the same growth curve its caption's age is read from):
  // 0 a young one, 1 an old one as big as its kind grows — the shader wears an old one's skin more
  const ageK = new Float32Array(total), oldAge = ageOf(sp.size[1] * 1.12, sp.size[1]);
  for (let i = 0; i < total; i++) ageK[i] = Math.min(1, Math.max(0, ageOf(fs[i] * 1.28, sp.size[1]) / oldAge));
  geo.setAttribute('aAge', new THREE.InstancedBufferAttribute(ageK, 1));
  // how hard each fish is bending into a turn (big ones only), for the vertex shader
  const fb = new Float32Array(total), bendAttr = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
  bendAttr.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aBend', bendAttr);
  const bigTurn = !!sp.big || sp.size[1] > 1.2, turnMax = 1.6 / (1 + sp.size[1]);
  // The few fish nearest the camera are drawn again on a finer, lofted body of their own shape (ocean/bony
  // bonyFromShape: an eye, fin rays, gill cover, the same pattern), and hidden in the plain copy; the rest, often
  // hundreds, stay plain. Only drawing: positions, matrices and everything that reads them are the plain copy's.
  const nearKey = !sp.model && total > 0 ? bonyFromShape(sp.shape, sh) : null;
  const NEAR = nearKey ? Math.min(total, 16) : 0;
  const hideA = nearKey ? new THREE.InstancedBufferAttribute(new Float32Array(total), 1) : null;
  if (hideA) { hideA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aHide', hideA); }
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(sp, false, false, { hide: !!nearKey, aged: true }), total);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let near: THREE.InstancedMesh | null = null, nearSw: THREE.InstancedBufferAttribute | null = null, nearBend: THREE.InstancedBufferAttribute | null = null, nearAge: THREE.InstancedBufferAttribute | null = null;
  const nearOf = new Int32Array(NEAR).fill(-1), nearD = new Float32Array(NEAR);
  if (nearKey) {
    const ng = speciesGeometry({ ...sp, model: nearKey });
    nearSw = new THREE.InstancedBufferAttribute(new Float32Array(NEAR * 3), 3); ng.setAttribute('aSwim', nearSw);
    nearBend = new THREE.InstancedBufferAttribute(new Float32Array(NEAR), 1); nearBend.setUsage(THREE.DynamicDrawUsage); ng.setAttribute('aBend', nearBend);
    nearAge = new THREE.InstancedBufferAttribute(new Float32Array(NEAR), 1); nearAge.setUsage(THREE.DynamicDrawUsage); ng.setAttribute('aAge', nearAge);
    near = new THREE.InstancedMesh(ng, fishMaterial(sp, false, false, { bony: nearKey, aged: true }), NEAR);
    near.frustumCulled = false; near.instanceMatrix.setUsage(THREE.DynamicDrawUsage); near.count = 0;
    mesh.add(near);   // (the plain copy sits at the origin: its child draws in the same world frame)
  }
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
  const kelpLife = makeKelpFishLife(sp, oc, total);
  const lastCam = new THREE.Vector3();
  const isPredator = sp.diet === 'fish';
  let nearStart = 1;   // (of the reef's groups, how many are about the camera on arriving: the day's lot, ecosystem.ts startDay)
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
    if (Math.sqrt((_e.x - g.c.x) ** 2 + (_e.z - g.c.z) ** 2) > 1e-3) g.head = Math.atan2(_e.z - g.c.z, _e.x - g.c.x);
    g.c.copy(_e);
    return cr.t === to;
  }
  // By day: into the cave (unseen if the camera is elsewhere, else in through the nearer end), onto the
  // floor, still; at dusk: back out along the tunnel. Returns true while the cave has the group.
  function caveRoutine(g: Group, dt: number, cam: THREE.Vector3) {
    const cr: NonNullable<Group['cr']> = g.cr!, len = cave.tourLength, sp0 = cr.spot;
    const mode = () => cr.mode as string;
    const want = g.act < 0.45;
    const camTo = (p: { x: number; z: number }) => Math.sqrt((p.x - cam.x) ** 2 + (p.z - cam.z) ** 2);
    if (cr.mode === 'out') {
      if (!want) return false;
      if (camTo(g.c) > 32 && camTo(sp0.pos) > 32) toRest(g);   // nobody is watching: it is simply there
      else {
        const a = cave.tourStart(false), b = cave.tourStart(true), rev = Math.sqrt((b.x - g.c.x) ** 2 + (b.z - g.c.z) ** 2) < Math.sqrt((a.x - g.c.x) ** 2 + (a.z - g.c.z) ** 2);
        const e = rev ? b : a, d = Math.sqrt((e.x - g.c.x) ** 2 + (e.z - g.c.z) ** 2);
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
      scare() { g.fear = 1; g.predT = g.t; },
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
          const dp = Math.sqrt((fp[i * 3] - x) ** 2 + (fp[i * 3 + 1] - y) ** 2 + (fp[i * 3 + 2] - z) ** 2);
          const out = Math.sqrt((fp[i * 3] - g.c.x) ** 2 + (fp[i * 3 + 2] - g.c.z) ** 2);   // stragglers at the edge are easier
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
        g.ch.x = x; g.ch.y = y; g.ch.z = z; g.ch.t = g.t; g.predT = g.t;
        g.fear = 1;
      },
      safe(i) { return !dead[i] && fp[i * 3 + 1] < flC[i] + 0.3; },   // tucked down into the reef
      kill(i) { if (dead[i]) return false; let n = 0; for (let k = g.start; k < g.start + g.n; k++) if (!dead[k]) n++; if (n <= 1) return false; dead[i] = g.t || 1e-3; if (g.ch?.i === i) g.ch = undefined; return true; },
    };
  }

  function findSpot(cam: THREE.Vector3, fx: number, fz: number, dmin: number, dmax: number, wantReef: boolean): [number, number] {
    let best: [number, number] = [cam.x, cam.z], bs = -1;
    for (let k = 0; k < 40; k++) {
      // ahead of the camera first; then, if that is all dry land (the camera ashore), all round it
      if (k === 28 && bs >= 0) break;
      const ahead = k < 28, a = ahead ? 0 : R() * Math.PI * 2, ux = ahead ? fx : Math.cos(a), uz = ahead ? fz : Math.sin(a);
      const d = ahead ? rr(dmin, dmax) : rr(dmin, Math.min(dmax + 18, 64)),   // (all round: still well inside the 72 m at which a group is moved on)
        lat = ahead ? (R() * 2 - 1) * (dmax * 0.5) : 0;
      const x = zx(cam.x + ux * d - uz * lat), z = zz(cam.z + uz * d + ux * lat);
      const r = !T.wet(x, z, 1.6) ? -0.5 : wantReef ? T.reef(x, z) : 1;
      if (r > bs) { bs = r; best = [x, z]; }
      if (r > 0.5) break;
    }
    return best;
  }
  function place(g: Group, cam: THREE.Vector3, fx: number, fz: number, near: boolean) {
    if (g.type === 'anem') { g.c.copy(g.a!.pos); }   // (in among the tentacles: see the family's swimming below)
    else {
      // (those that keep to a wreck: somewhere along her)
      const ws = sp.wreck && oc.wreck ? oc.wreck.spot(_e) : null;
      let [x, z] = ws ? [ws.x, ws.z] : findSpot(cam, fx, fz, near ? 6 : 32, near ? 30 : 48, g.type === 'reef');
      const plant = kelpLife?.anchorNear(x, z);
      if (plant) { x = plant.x; z = plant.z; }
      g.anchor.x = x; g.anchor.z = z;
      g.c.set(x, ws ? Math.min(Math.max(ws.y, T.top(x, z) + g.alt), -1.4) : Math.min(T.h(x, z) + g.alt, -1.4), z);
      g.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(0.9, 2.1);
      g.hunt = null;
    }
    g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(sp.speed * 0.4);
    for (let i = g.start; i < g.start + g.n; i++) {
      dead[i] = 0;
      fp[i * 3] = g.c.x + fo[i * 3]; fp[i * 3 + 1] = g.c.y + fo[i * 3 + 1]; fp[i * 3 + 2] = g.c.z + fo[i * 3 + 2];
      fv[i * 3] = g.v.x; fv[i * 3 + 1] = 0; fv[i * 3 + 2] = g.v.z;
      kelpLife?.place(i, fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]);
    }
    g.placed = true; g.born = g.t;   // (it swims in: grows from nothing rather than popping up)
    if (kelpLife) { g.bodyCenter ??= new THREE.Vector3(); g.bodyCenter.copy(g.c); }
  }

  // Predators: build hunger, pick a school, close in, then chase one fish in bursts.
  const _tv = { x: 0, y: 0, z: 0 }, _tw = { x: 0, y: 0, z: 0 }, _d = new THREE.Vector3();
  function hunt(g: Group, dt: number, env: Env) {
    g.hunger = Math.min(1, g.hunger + dt / 150);
    g.cooldown = Math.max(0, g.cooldown - dt);
    const ex = ((g as any).excited = Math.max(0, ((g as any).excited ?? 0) - dt));
    const drive = Math.max(g.hunger * (0.2 + 0.8 * env.twilight + 0.3 * env.night), ex > 0 ? 0.9 : 0);   // (a feast close by: hunting even by day)
    if (!g.hunt && g.cooldown <= 0 && drive > 0.5 && R() < dt * (ex > 0 ? 0.3 : 0.08)) {
      let best: PreyGroup | null = null, bd = 45;
      for (const p of env.prey) { const d = Math.sqrt((p.x - g.c.x) ** 2 + (p.z - g.c.z) ** 2); if (p.alive > 1 && d < bd) { bd = d; best = p; } }
      if (best) { g.c.set(fp[g.start * 3], fp[g.start * 3 + 1], fp[g.start * 3 + 2]); g.v.set(fv[g.start * 3], fv[g.start * 3 + 1], fv[g.start * 3 + 2]);   // (the hunt starts from where its body actually is)
        g.hunt = { prey: best, t0: g.t, phase: 'stalk', pt: 0, tries: 0, target: -1, tp: new THREE.Vector3(best.x, best.y, best.z), speed: g.v.length(), close: 1e9 }; logEvent(env, 'hunt', oneOf([`${sp.ja}が${best.label}の群れを狙っている`, `${sp.ja}が${best.label}の群れに狙いを定めた`, `${sp.ja}が${best.label}の群れの下を、ゆっくり回りはじめた`, `${sp.ja}の気配に、${best.label}の群れがざわつきはじめた`, `${sp.ja}が${best.label}の群れとの距離を、じわじわと詰めていく`]), g.c.x, g.c.z, () => g.c); }
    }
    if (!g.hunt) return false;
    const h = g.hunt, p = h.prey, len = fs[g.start] * 1.28;
    h.pt += dt;
    const end = (caught: boolean) => {
      if (caught) { g.hunger = 0; const at = g.c.clone(); logEvent(env, 'catch', oneOf([`${sp.ja}が${p.label}を捕らえた`, `${sp.ja}の突進が決まった。${p.label}が一匹、群れから消えた`, `一瞬の出来事だった。${sp.ja}が${p.label}をくわえて泳ぎ去る`, `${sp.ja}の狩りが成功。${p.label}の群れがぱっと散った`]), g.c.x, g.c.z, () => at); }
      else { g.hunger *= 0.85; if (h.close < 1.2) logEvent(env, 'hunt', oneOf([`${p.label}が間一髪で${sp.ja}の追跡を振り切った`, `${sp.ja}の突進は空を切った。${p.label}は群れの中へ`, `${p.label}の鋭い切り返しに、${sp.ja}は追いつけなかった`, `${p.label}が${oc.loc.habitat === 'kelp' ? '岩' : 'サンゴ'}の隙間へ逃げ込み、${sp.ja}はあきらめた`]), g.c.x, g.c.z, () => g.c); }   // (only the near things)
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
      if (!p.at(h.target, _tv, _tw) || (h.pt > 0.2 && Math.sqrt((_tv.x - h.tp.x) ** 2 + (_tv.y - h.tp.y) ** 2 + (_tv.z - h.tp.z) ** 2) > 3)) { h.phase = 'recover'; h.pt = 0; }   // (gone, or the school was moved off elsewhere)
      else {
        h.tp.set(_tv.x, _tv.y, _tv.z);
        const dx = _tv.x - g.c.x, dy = _tv.y - g.c.y, dz = _tv.z - g.c.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
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
        const d = Math.sqrt((p.x - g.c.x) ** 2 + (p.z - g.c.z) ** 2);
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
    const hs = Math.sqrt(g.v.x * g.v.x + g.v.z * g.v.z) || 1e-3;
    for (const a of [0.25, 0.5, 0.8]) fl = Math.max(fl, T.top(g.c.x + g.v.x / hs * a * Math.max(1, h.speed), g.c.z + g.v.z / hs * a * Math.max(1, h.speed)));
    fl += 0.25;
    if (g.c.y < fl) { g.c.y += Math.min(fl - g.c.y, (1.0 + h.speed * 0.8) * dt); if (g.v.y < 0) g.v.y *= 0.6; }
    if (g.c.y > -0.8) g.c.y = -0.8;
    g.head = Math.atan2(g.v.z, g.v.x);
    return true;
  }

  const caveMode0 = (g: Group) => (g.cr ? g.cr.mode : 'out');
  let target = 1;
  let curNow = 0, frameNo = 0;   // (how hard the current runs: plankton feeders snap at what it brings; frames gone by)
  // The reef's everyday fish in the sea log, as they really change: a group going to rest or waking (its activity
  // crossing the line its status reads by), and a school pressing into the reef from a hunter (only near by:
  // logEvent keeps to what the drone could notice). Said when it happens, of this group.
  function tellReef(g: Group, env: Env, dc2: number) {
    const resting = g.act < 0.35, rocky = !!oc.kelp, bommie = rocky ? '岩' : '根', at = () => g.m ?? g.c;
    if (g.restLog === undefined) g.restLog = resting;
    else if (resting !== g.restLog) {
      g.restLog = resting;
      if (dc2 < 45 * 45) {
        const anem = g.type === 'anem', night = sp.diel === 'night';
        const text = resting
          ? (anem ? `${sp.ja}がイソギンチャクの奥へもぐり込み、休みはじめた` : night ? `${sp.ja}が${bommie}のそばに集まり、昼の休みに入った` : g.n > 1 ? `${sp.ja}の群れがほどけて、${bommie}のすき間へ眠りに入っていく` : `${sp.ja}が${bommie}のすき間に入り、眠りについた`)
          : (anem ? `${sp.ja}がイソギンチャクから出てきて、泳ぎはじめた` : night ? `日が落ちて、${sp.ja}が${bommie}を離れ、動き出した` : `${sp.ja}が${bommie}のすき間から出てきて、泳ぎはじめた`);
        logEvent(env, resting ? 'fishrest' : 'fishwake', text, g.c.x, g.c.z, at);
      }
    }
    if (g.type === 'reef' && g.n > 2 && g.predT != null && g.t - g.predT < 0.3 && !(g.ch && g.t - g.ch.t < 2) && (g.shyLog == null || g.t - g.shyLog > 150) && dc2 < 40 * 40) {
      g.shyLog = g.t;
      logEvent(env, 'shy', `捕食者の気配に、${sp.ja}の群れが${rocky ? '岩礁' : 'サンゴ'}へさっと身を寄せた`, g.c.x, g.c.z, at);
    }
  }
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
    frame++;
    if (kelpLife) lastCam.copy(cam);
    const t = env.t;
    const act = activity(sp.diel, env);
    target = act;
    const upX = -env.cur.x, upZ = -env.cur.z, curLen = Math.sqrt(upX * upX + upZ * upZ);
    curNow = curLen; frameNo++;
    let dirty = false;
    for (const g of groups) {
      g.t += dt;
      if (!g.ready) { g.act = act; g.ready = true; }                // start the day where the clock is
      g.act += (act - g.act) * Math.min(1, dt * 0.08);           // settle in / wake up over ~15 s
      g.fear = Math.max(0, g.fear - dt * 0.25);
      const dxc = g.c.x - cam.x, dzc = g.c.z - cam.z, dc2 = dxc * dxc + dzc * dzc;
      if (g.placed && g.type !== 'roam' && !kelpLife) tellReef(g, env, dc2);
      if (g.type === 'anem') {
        if (!g.placed) place(g, cam, fx, fz, true);
        // (far off, the family is left be — and not drawn: one never yet come near would otherwise be drawn
        // where its instances start, at the middle of the sea's surface)
        if (dc2 > 80 * 80) { if (!g.away) { g.away = true; _mm.makeScale(0, 0, 0); for (let i = g.start; i < g.start + g.n; i++) mesh.setMatrixAt(i, _mm); dirty = true; } continue; }
        g.away = false;
      }
      else if (!g.placed || (dc2 > 72 * 72 && (!g.cr || g.cr.mode === 'out'))) {
        place(g, cam, fx, fz, !g.placed && (g.type !== 'reef' || R() < nearStart));   // (on arriving: near, or — the day's lot — further off)
        if (g.cr) { g.cr.mode = 'out'; if (g.act < 0.45 && Math.sqrt((g.cr.spot.pos.x - cam.x) ** 2 + (g.cr.spot.pos.z - cam.z) ** 2) > 32) toRest(g); }
      }
      const floorC = T.top(g.c.x, g.c.z);
      const rest = 1 - g.act;
      let hunting = false;

      if (g.type === 'reef') {
        // active: drift around the home patch; resting: settle into it
        if (g.goal) {
          // (on its way to a new patch: the patch itself moves on at the group's swimming pace, the fish after it)
          const gx = g.goal.x - g.anchor.x, gz = g.goal.z - g.anchor.z, gd = Math.sqrt(gx * gx + gz * gz), st = Math.max(sp.speed * 0.9, 0.9) * dt;
          if (gd <= st) { g.anchor.x = g.goal.x; g.anchor.z = g.goal.z; g.goal = undefined; } else { g.anchor.x += gx / gd * st; g.anchor.z += gz / gd * st; }
        }
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
          // (a big one meanders in long, slow arcs: its wandering scaled to how fast it can turn)
          const wk = bigTurn ? Math.min(1, turnMax * 1.5) : 1;
          // (it keeps a course that only drifts, slowly and both ways, and weaves either side of it: steering by a turn
          // rate that wandered meant one that stayed the same way for half a minute took it round and round in one
          // place — owner, 2026-10-09: a barracuda circling on the spot)
          if (g.course === undefined || Math.abs(Math.atan2(Math.sin(g.course - g.head), Math.cos(g.course - g.head))) > 1.3) g.course = g.head;
          g.course += Math.sin(g.t * 0.031 + g.start * 1.7) * 0.05 * dt;
          const weave = g.course + Math.sin(g.t * 0.23 * wk + g.start) * 0.45 + Math.sin(g.t * 0.071 + g.start * 0.3) * 0.25;
          const h0 = g.head;
          g.head += Math.atan2(Math.sin(weave - g.head), Math.cos(weave - g.head)) * Math.min(1, dt * 0.6 * wk);
          if (kelpLife && Math.sqrt((g.c.x - g.anchor.x) ** 2 + (g.c.z - g.anchor.z) ** 2) > 13) {
            // Olive rockfish circle their kelp patch between hunts. Chases retain
            // their existing control and can carry a hunter beyond the forest edge.
            const dh = Math.atan2(g.anchor.z - g.c.z, g.anchor.x - g.c.x) - g.head;
            g.head += Math.atan2(Math.sin(dh), Math.cos(dh)) * Math.min(1, dt * 0.3);
          }
          g.head += T.shore(g.c.x, g.c.z, g.head, 5 / wk, 1.2) * Math.min(1, dt * 1.5 * wk);
          if (outZone(g.c.x, g.c.z)) { let d = toZone(g.c.x, g.c.z) - g.head; d = Math.atan2(Math.sin(d), Math.cos(d)); g.head += d * dt * 0.8 * wk; }
          // (turned off its course by the shore or the edge of the sea: its course turns with it)
          g.course! += (g.head - h0) - Math.atan2(Math.sin(weave - h0), Math.cos(weave - h0)) * Math.min(1, dt * 0.6 * wk);
          const pace = sp.speed * 0.7 * (0.25 + 0.75 * g.act);
          g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(pace);
          g.c.x += g.v.x * dt; g.c.z += g.v.z * dt;
          // rise ahead of a coral head instead of scaling it; come down slowly on the far side. A big fish sees it
          // coming from further off and climbs no faster than a gentle glide (it was going up a metre and a half a
          // second over a reef mound, which read as a jump)
          let fl = floorC;
          for (const s of sp.big ? [1.5, 3, 5, 8, 12] : [1.5, 3, 5]) fl = Math.max(fl, T.top(g.c.x + g.v.x * s, g.c.z + g.v.z * s));
          const ty = Math.min(fl + g.alt * (0.4 + 0.6 * g.act) + Math.sin(g.t * 0.3) * 0.5, -1.4);
          let dy = (ty - g.c.y) * Math.min(1, dt * (ty > g.c.y ? 0.6 : 0.25));
          if (sp.big) dy = Math.max(-0.25 * dt, Math.min(0.35 * dt, dy));
          g.c.y += dy;
        }
        env.threatsOut.push({ x: g.c.x, y: g.c.y, z: g.c.z, r: isPredator ? (hunting ? 7 : 3) : 0 });
      }
      if (g.prey) { g.prey.x = g.c.x; g.prey.y = g.c.y; g.prey.z = g.c.z; }

      const camNear = g.type === 'anem' ? smooth(2.0, 0.7, Math.sqrt(dc2 + (g.c.y - cam.y) ** 2)) * 0.8 : 0;
      const tuck = g.type === 'anem' ? Math.max(camNear, rest * 0.85) : rest * 0.7;
      const rot = g.t * (g.type === 'anem' ? 0.3 : 0.12) * (1 - rest * 0.8), cr = Math.cos(rot), sr = Math.sin(rot);
      const spreadK = (1 - tuck * 0.8) * (1 + g.fear * 1.2);
      const lone = g.n === 1;
      const feedFace = sp.diet === 'plankton' ? g.act * clamp(curLen * 1.5, 0, 1) : 0;
      let alive = 0;
      const appear = g.born == null ? 1 : smooth(0, 1.5, g.t - g.born);
      for (let i = g.start; i < g.start + g.n; i++) {
        if (dead[i]) {
          if (g.t - dead[i] > REVIVE_AFTER) {
            dead[i] = 0; fp[i * 3] = g.c.x + fo[i * 3] * 3; fp[i * 3 + 1] = g.c.y; fp[i * 3 + 2] = g.c.z + fo[i * 3 + 2] * 3;
            // A newcomer inherits neither the eaten fish's buried pose nor its old bed.
            kelpLife?.place(i, fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]);
          }
          else { _mm.makeScale(0, 0, 0); mesh.setMatrixAt(i, _mm); cocoon?.setMatrixAt(i, _mm); dirty = true; continue; }
        }
        alive++;
        const ox = fo[i * 3] * spreadK, oz = fo[i * 3 + 2] * spreadK;
        const wob = lone ? 0 : (g.type === 'anem' ? 0.12 : 0.4) * (1 - rest * 0.7);
        const dart = feedFace * 0.25 * Math.sin(t * 3.1 + i * 7.3);     // quick snaps at passing plankton
        let tx = g.c.x + ox * cr - oz * sr + Math.sin(t * 0.7 + i) * wob + upX * dart;
        let ty = g.c.y + fo[i * 3 + 1] * spreadK - camNear * 0.2 + Math.sin(t * 0.9 + i * 1.7) * wob * 0.6;
        let tz = g.c.z + ox * sr + oz * cr + Math.cos(t * 0.6 + i) * wob + upZ * dart;
        if (g.type === 'anem') {
          // a clownfish family lives in its anemone: each one keeps dipping down into the tentacles and
          // rising just clear of them, never straying past the crown; when something comes close, or at
          // rest, they sink right in among the tentacles, down by the oral disc
          const s = g.a!.s, crown = 0.3 * s;
          const ex = tx - g.c.x, ez = tz - g.c.z, er = Math.sqrt(ex * ex + ez * ez), k = er > crown * (1 - tuck * 0.6) ? crown * (1 - tuck * 0.6) / er : 1;
          tx = g.c.x + ex * k; tz = g.c.z + ez * k;
          const dip = Math.pow(0.5 + 0.5 * Math.sin(t * (0.55 + 0.1 * (i % 3)) + i * 2.3), 2);   // 0 down in the tentacles .. 1 just above them
          const free = g.c.y + (0.06 + 0.24 * dip) * s, hide = g.c.y + 0.08 * s;   // (the crown's tips are at about +0.14: in among them, and a little above; hiding, down in the top of it, peeking out)
          ty = free + (hide - free) * tuck + Math.sin(t * 1.3 + i) * 0.015;
        }
        // grazers dip to bite the reef
        if (sp.diet === 'algae' && g.act > 0.5) {
          const bite = Math.pow(Math.max(0, Math.sin(t * 0.7 + i * 2.1)), 4);
          ty -= bite * 0.3;
          if (bite > 0.97 && sp.big) env.crunch(Math.sqrt((fp[i * 3] - cam.x) ** 2 + (fp[i * 3 + 1] - cam.y) ** 2 + (fp[i * 3 + 2] - cam.z) ** 2));
        }
        const px = fp[i * 3], py = fp[i * 3 + 1], pz = fp[i * 3 + 2];
        // The life layer chooses a destination, never a new body position. Normal
        // acceleration, terrain avoidance and predator steering still move the fish.
        let life = kelpLife?.states[i];
        if (kelpLife) {
          let danger = !!(g.ch && g.ch.i === i && g.t - g.ch.t < 0.3);
          const cameraRadius = 4.5 * env.shy;
          if (Math.sqrt((px - cam.x) ** 2 + (py - cam.y) ** 2 + (pz - cam.z) ** 2) < cameraRadius) danger = true;
          if (!isPredator) for (const th of env.threats) {
            if (th.r && Math.sqrt((px - th.x) ** 2 + (py - th.y) ** 2 + (pz - th.z) ** 2) < th.r) { danger = true; break; }
          }
          life = kelpLife.update(i, dt, t, g.act, danger, { x: px, y: py, z: pz }, fs[i]);
          tx += (life.x - tx) * life.weight; ty += (life.y - ty) * life.weight; tz += (life.z - tz) * life.weight;
        }
        if (hunting && lone) {
          // the hunter is the hunt: its body goes where the chase goes
          const k = Math.min(1, dt * 10);
          fp[i * 3] = px + (g.c.x - px) * k; fp[i * 3 + 1] = py + (g.c.y - py) * k; fp[i * 3 + 2] = pz + (g.c.z - pz) * k;
          fv[i * 3] = g.v.x; fv[i * 3 + 1] = g.v.y; fv[i * 3 + 2] = g.v.z;
          const hs0 = Math.sqrt(g.v.x * g.v.x + g.v.z * g.v.z), hy0 = clamp(g.v.y, -hs0 * 0.6, hs0 * 0.6);
          _w.set(fp[i * 3] + g.v.x, fp[i * 3 + 1] + hy0, fp[i * 3 + 2] + g.v.z); _v.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]);
          _mm.lookAt(_w, _v, UPV); _ss.setScalar(fs[i] * appear); _mm.scale(_ss); _mm.setPosition(_v);
          mesh.setMatrixAt(i, _mm); dirty = true;
          continue;
        }
        if (((frame + i) & 3) === 0 || py < flC[i] + 0.6) {   // (every frame when down against the reef)
          const out = caveMode0(g) === 'out';   // in the tunnel the floor, not the massif's top
          flC[i] = out ? T.top(px, pz) : T.ground(px, pz); ftC[i] = out ? T.top(tx, tz) : T.ground(tx, tz);
        }
        const burial = life?.burial || 0;
        const fl = kelpLife ? Math.max(flC[i], kelpLife.floor(px, pz)) : flC[i];
        // Only verified sand beds allow burial; all other fish keep the usual clearance.
        const bottomTarget = burial ? kelpLife!.floor(tx, tz) - fs[i] * 0.28 * burial : ftC[i] + 0.2;
        ty = Math.max(ty, bottomTarget);
        const ch = g.ch && g.ch.i === i && g.t - g.ch.t < 0.3 ? g.ch : null;
        if (ch) {
          // singled out: bolt away flat out, jinking hard when the hunter is close, and dive for the reef
          const ax = px - ch.x, ay = py - ch.y, az = pz - ch.z, ad = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
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
        _v.multiplyScalar(Math.min(maxS, L * 1.1) / Math.max(L, 1e-4)).addScaledVector(g.v, 1 - (life?.weight || 0));
        }
        // flee the drone and any predator on the prowl
        const caveMode = g.cr ? g.cr.mode : 'out';
        if (g.type !== 'anem' && caveMode === 'out') {
          _w.set(px - cam.x, py - cam.y, pz - cam.z);
          // (the giants, a whale shark grazing on plankton, pay a small drone no mind)
          const cd = _w.length(), fr = (sp.diet === 'filter' || sp.size[1] > 3 ? 0 : sp.big ? 3.5 : 4.5) * env.shy;
          if (cd < fr) {
            // a big fish (a barracuda, a wrasse, a grouper, a reef shark) is not startled by a diver-sized drone at the
            // distance it is filmed from: it eases off sideways, level, keeping its distance; only one right up close
            // makes it start (owner, 2026-10-08: a watched barracuda jumping up and down and turning of a sudden)
            if (sp.big) { const kk = (fr - cd) * 0.45 / Math.max(cd, 0.1); _v.x += _w.x * kk; _v.z += _w.z * kk; if (cd < fr * 0.35) g.fear = Math.max(g.fear, 0.4 * (1 - cd / fr)); }
            else { _v.addScaledVector(_w, (fr - cd) * 2.2 / Math.max(cd, 0.1)); g.fear = Math.max(g.fear, 0.5 * (1 - cd / fr)); }   // (startled: a quick dart, turning on a pin)
          }
          if (!isPredator && !ch && sp.size[1] < 1) for (const th of env.threats) {   // (a fish of a metre and more — a Napoleon, a bumphead — does not bolt from a reef shark going by)
            if (!th.r) continue;
            const ddx = px - th.x, ddy = py - th.y, ddz = pz - th.z, dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
            if (dd < th.r) { const k = (th.r - dd) * 2.8 / Math.max(dd, 0.1); _v.x += ddx * k; _v.y += ddy * k; _v.z += ddz * k; g.fear = Math.max(g.fear, 0.8); g.predT = g.t; }
          }
        }
        const floorClearance = burial ? -fs[i] * 0.28 * burial : 0.15;
        const floorNow = burial ? kelpLife!.floor(px, pz) : fl;
        if (py < floorNow + floorClearance) _v.y = Math.max(_v.y, Math.min((floorNow + floorClearance - py) * 3, 1.2));   // ease back out of the reef, no kick
        if (burial > 0) {
          // Surface first before darting away; a frightened buried fish cannot slide
          // sideways through rock. It starts its ordinary escape as soon as it emerges.
          _v.x = (life!.x - px) * 3; _v.z = (life!.z - pz) * 3;
        }
        const k = 1 - Math.exp(-dt * (ch ? 9 : lone ? 1.0 : 2.6 + g.fear * 2));   // (a chased fish turns on a pin)
        let vx = fv[i * 3] + (_v.x - fv[i * 3]) * k, vy = fv[i * 3 + 1] + (_v.y - fv[i * 3 + 1]) * k, vz = fv[i * 3 + 2] + (_v.z - fv[i * 3 + 2]) * k;
        // a big fish cannot turn on a pin: its heading swings round no faster than its length allows, and
        // its body curves into the turn (the bend goes to the model, below)
        if (bigTurn && !ch && !g.hunt) {
          const s0 = Math.sqrt(fv[i * 3] * fv[i * 3] + fv[i * 3 + 2] * fv[i * 3 + 2]), s1 = Math.sqrt(vx * vx + vz * vz);
          if (s0 > 0.03 && s1 > 0.03) {
            const h0 = Math.atan2(fv[i * 3 + 2], fv[i * 3]); let d = Math.atan2(vz, vx) - h0; d = Math.atan2(Math.sin(d), Math.cos(d));
            const md = turnMax * dt, dd = Math.max(-md, Math.min(md, d));
            vx = Math.cos(h0 + dd) * s1; vz = Math.sin(h0 + dd) * s1;
            fb[i] += (-(dd / Math.max(dt, 1e-3)) / turnMax * 0.22 - fb[i]) * Math.min(1, dt * 2);
          }
          bendAttr.array[i] = fb[i];
        }
        fv[i * 3] = vx; fv[i * 3 + 1] = vy; fv[i * 3 + 2] = vz;
        let nx = px + vx * dt, ny = Math.min(py + vy * dt, -0.5), nz = pz + vz * dt;
        if (kelpLife && !burial) ny = Math.max(ny, kelpLife.floor(nx, nz) + 0.1);
        if (oc.cave && oc.cave.pushOut(_c.set(nx, ny, nz), 0.12 * sp.size[1] + 0.1)) { nx = _c.x; ny = _c.y; nz = _c.z; }   // slide off the cave rock
        fp[i * 3] = nx; fp[i * 3 + 1] = ny; fp[i * 3 + 2] = nz;
        // heading: where it swims, turned into the current while feeding on plankton
        let hx = vx + upX * feedFace * 0.8, hz = vz + upZ * feedFace * 0.8;
        let hs = Math.sqrt(hx * hx + hz * hz);
        // nearly still (asleep): hold a steady heading instead of turning with every tiny drift
        const still = clamp(1 - hs / 0.12, 0, 1);
        hx = hx * (1 - still) + Math.cos(g.head + i) * 0.12 * still; hz = hz * (1 - still) + Math.sin(g.head + i) * 0.12 * still; hs = Math.sqrt(hx * hx + hz * hz);
        let hy = clamp(vy * (1 - still), -hs * 0.6, hs * 0.6);
        if (life) {
          if (life.mode === 'forage' && life.feedingOnLeaf) {
            hx = hx * (1 - life.weight) + Math.cos(life.heading) * 0.12 * life.weight;
            hz = hz * (1 - life.weight) + Math.sin(life.heading) * 0.12 * life.weight;
            hs = Math.sqrt(hx * hx + hz * hz);
          }
          hy -= hs * life.peck * 0.65;
          if (burial > 0) {
            hx = hx * (1 - burial) + Math.cos(life.heading) * 0.12 * burial;
            hz = hz * (1 - burial) + Math.sin(life.heading) * 0.12 * burial;
            hs = Math.sqrt(hx * hx + hz * hz);
            hy = hy * (1 - burial) + hs * 3.4 * burial;
          }
        }
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
      // where its fish actually are and how far they spread (the group's own point is the middle of its patch, which
      // its fish swim round and off from: filmed and ringed there, the camera looked at empty water beside them)
      if (alive && g.type !== 'anem') {
        let mx = 0, my = 0, mz = 0, ss = 0;
        for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) { mx += fp[i * 3]; my += fp[i * 3 + 1]; mz += fp[i * 3 + 2]; ss += fp[i * 3] ** 2 + fp[i * 3 + 1] ** 2 + fp[i * 3 + 2] ** 2; }
        mx /= alive; my /= alive; mz /= alive;
        if (!g.m) g.m = new THREE.Vector3(mx, my, mz); else g.m.set(mx, my, mz);
        g.spread = Math.sqrt(Math.max(0, ss / alive - (mx * mx + my * my + mz * mz)));
      }
      if (g.bodyCenter && alive) {
        g.bodyCenter.set(0, 0, 0);
        for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) {
          g.bodyCenter.x += fp[i * 3]; g.bodyCenter.y += fp[i * 3 + 1]; g.bodyCenter.z += fp[i * 3 + 2];
        }
        g.bodyCenter.multiplyScalar(1 / alive);
        if (g.prey) { g.prey.x = g.bodyCenter.x; g.prey.y = g.bodyCenter.y; g.prey.z = g.bodyCenter.z; }
      }
      if (g.prey) g.prey.alive = alive;
    }
    if (cave) {
      const resting = groups.filter((g) => g.cr!.mode === 'rest').length / groups.length;
      (mesh.material as THREE.ShaderMaterial).uniforms.uWig.value = (sp.wig ?? 1) * (1 - 0.8 * resting);
    }
    if (dirty) { mesh.instanceMatrix.needsUpdate = true; if (bigTurn) bendAttr.needsUpdate = true; if (cocoon) cocoon.instanceMatrix.needsUpdate = true; }
    if (near) pickNear(cam);
  }

  // the NEAR fish nearest the camera, within a reach that grows with the fish (a 10 cm damselfish from 4.5 m, a
  // half-metre one from about 9): copied onto the fine body, hidden on the plain one
  const _nm = new THREE.Matrix4();
  function pickNear(cam: THREE.Vector3) {
    let n = 0;
    nearD.fill(Infinity);
    const reachK = 4.5 / 0.1;
    for (let i = 0; i < total; i++) {
      if (dead[i]) continue;
      const len = fs[i] * 1.28, reach = Math.min(9, Math.max(3.5, len * reachK * 0.5 + 2.2));
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > reach * reach) continue;
      // keep the NEAR smallest (insertion into a short sorted list)
      if (n < NEAR) n++; else if (d2 >= nearD[NEAR - 1]) continue;
      let k = n - 1; while (k > 0 && nearD[k - 1] > d2) { nearD[k] = nearD[k - 1]; nearOf[k] = nearOf[k - 1]; k--; }
      nearD[k] = d2; nearOf[k] = i;
    }
    const H = hideA!.array as Float32Array, E = mesh.instanceMatrix.array as Float32Array, sw = nearSw!.array as Float32Array, nb = nearBend!.array as Float32Array, fbA = bendAttr.array as Float32Array;
    H.fill(0);
    for (let k = 0; k < n; k++) {
      const i = nearOf[k];
      H[i] = 1;
      _nm.fromArray(E, i * 16); near!.setMatrixAt(k, _nm);
      sw[k * 3] = swim[i * 3]; sw[k * 3 + 1] = swim[i * 3 + 1]; sw[k * 3 + 2] = swim[i * 3 + 2];
      nb[k] = fbA[i]; (nearAge!.array as Float32Array)[k] = ageK[i];
    }
    near!.count = n;
    hideA!.needsUpdate = true; near!.instanceMatrix.needsUpdate = true; nearSw!.needsUpdate = true; nearBend!.needsUpdate = true; nearAge!.needsUpdate = true;
  }

  function nearest(cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number) {
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      if (dead[i]) continue;
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < maxD && d < best && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3) > 0.55) best = d;
    }
    return best;
  }
  function nearestPos(cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number, out: THREE.Vector3) {
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      if (dead[i]) continue;
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < maxD && d < best && (dx * fwd.x + dz * fwd.z) / Math.max(d, 1e-3) > 0.2) { best = d; out.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]); }
    }
    return best;
  }
  // what the species is doing right now, for the field guide
  function status(): string {
    if (groups.some((g) => g.hunt)) return '狩り中';
    const kelpStatus = kelpLife?.status();
    if (kelpStatus) return kelpStatus;
    const a = groups.reduce((s, g) => s + g.act, 0) / groups.length;
    if (a < 0.35) return sp.habitat === 'anemone' ? 'イソギンチャクの奥で休んでいる' : sp.cocoon ? '粘液の膜にくるまって眠っている' : '岩陰で休んでいる';
    if (Math.abs(target - a) > 0.2) return target > a ? 'そろそろ動き出す' : 'そろそろ休む';
    return ({ plankton: 'プランクトンを食べている', algae: '藻をかじっている', invert: '餌を探している', fish: '巡回中', filter: 'プランクトンを濾して食べている' } as Record<string, string>)[sp.diet || 'plankton'];
  }
  // One of a group to film and ring: the fish nearest its middle (or the one tapped), kept while it lives. A big reef
  // fish's group grazes or hunts metres apart over its patch: no frame or ring holds them all, and what the caption
  // tells of (its size, its age) is one fish's. Small fish in a school are filmed and ringed as the school.
  function leadOf(g: Group, prefer = -1) {
    if (prefer >= g.start && prefer < g.start + g.n && !dead[prefer]) g.lead = prefer;
    if (g.lead == null || dead[g.lead] || g.lead < g.start || g.lead >= g.start + g.n) {
      const m = g.m ?? g.c; let b = g.start, bd = Infinity;
      for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) { const d = Math.sqrt((fp[i * 3] - m.x) ** 2 + (fp[i * 3 + 1] - m.y) ** 2 + (fp[i * 3 + 2] - m.z) ** 2); if (d < bd) { bd = d; b = i; } }
      g.lead = b;
    }
    return g.lead;
  }
  const leadPos = (g: Group) => () => { const i = leadOf(g); return (g.leadAt ??= new THREE.Vector3()).set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]); };
  // how big what is filmed is: one fish, half its length; a group, how far its fish spread (and a fish's length)
  // (a group: the core of it, the distance from its middle that holds six in ten of its fish — a few strays far
  // off, or fish right by the camera, do not make it the whole view; worked out once a frame, when asked for)
  function coreOf(g: Group) {
    if (g.coreF === frameNo && g.core != null) return g.core;
    const m = g.m ?? g.c, d: number[] = [];
    for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) d.push(Math.sqrt((fp[i * 3] - m.x) ** 2 + (fp[i * 3 + 1] - m.y) ** 2 + (fp[i * 3 + 2] - m.z) ** 2));
    d.sort((a, b) => a - b);
    g.coreF = frameNo; g.core = d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.6))] : 1;
    return g.core;
  }
  const frameOf = (g: Group) => (g.n === 1 ? fs[g.start] * 0.64 : coreOf(g) + fs[g.start] * 0.5);
  // (how far off to film a group from: far enough back for its core to fit the view)
  const groupSize = (g: Group) => Math.max(1.2, Math.min(6, coreOf(g) * 2.4));
  // what this group is doing right now, from its own state (not the species': one school bolting is not all of
  // them, and a grazer is said to graze only while it is biting the reef)
  // one fish to show for a group (see Subject.one): kept while alive and within its core; else the nearest its middle
  const _one = { x: 0, y: 0, z: 0, len: 0 };
  function fishOf(g: Group) {
    const m = g.m ?? g.c, core = coreOf(g);
    let i = g.oneI ?? -1;
    if (i < 0 || dead[i] || Math.sqrt((fp[i * 3] - m.x) ** 2 + (fp[i * 3 + 1] - m.y) ** 2 + (fp[i * 3 + 2] - m.z) ** 2) > core * 1.5) {
      let bd = Infinity; i = -1;
      for (let j = g.start; j < g.start + g.n; j++) { if (dead[j]) continue; const d = Math.sqrt((fp[j * 3] - m.x) ** 2 + (fp[j * 3 + 1] - m.y) ** 2 + (fp[j * 3 + 2] - m.z) ** 2); if (d < bd) { bd = d; i = j; } }
      g.oneI = i;
    }
    if (i < 0) return null;
    _one.x = fp[i * 3]; _one.y = fp[i * 3 + 1]; _one.z = fp[i * 3 + 2]; _one.len = fs[i] * 1.28;
    return _one;
  }
  // plainly a school: a dozen fish or more, packed (over 1.5 fish to each cubic metre of the sphere round its core)
  function clumpOf(g: Group) {
    let n = 0; for (let i = g.start; i < g.start + g.n; i++) if (!dead[i]) n++;
    const r = Math.max(0.3, coreOf(g));
    return n >= 12 && n / (4.19 * r * r * r) >= 1.5;
  }
  function groupStatus(g: Group): string {
    const kelpSays = kelpLife?.status(); if (kelpSays) return kelpSays;
    // (the words for where it lives: a coral reef and its bommies; a rocky reef in the kelp; the open ocean)
    const open = !!oc.loc.pelagic, rocky = !!oc.kelp, reef = rocky ? '岩礁' : '礁', bommie = rocky ? '岩' : '根';
    if (g.hunt) return '狩りをしている';
    if (g.ch && g.t - g.ch.t < 2) return g.n > 1 ? '1匹が捕食者に追われている' : '捕食者に追われている';
    if (g.predT != null && g.t - g.predT < 4) return g.type === 'reef' ? `近くの捕食者を避けて、${reef}に身を寄せている` : '近くの捕食者を避けて泳いでいる';
    if (g.fear > 0.2 && g.type !== 'anem') return 'こちらに気づいて、少し離れた';
    if (g.act < 0.35) {
      if (sp.habitat === 'anemone') return 'イソギンチャクの奥で休んでいる';
      if (sp.cocoon) return '粘液の膜にくるまって眠っている';
      if (g.type === 'roam') return 'ゆっくり泳いで休んでいる';
      // (a night fish by day hangs still by its bommie in its school; a day fish by night shelters in the reef, one by one)
      return sp.diel === 'night' ? (g.n > 1 ? `${bommie}のそばに群れて、じっと休んでいる` : '岩陰でじっと休んでいる') : (g.n > 1 ? '群れをほどいて、岩のすき間で眠っている' : '岩のすき間で眠っている');
    }
    if (sp.diet === 'algae' && g.act > 0.5 && !g.goal) return '藻をかじっている';   // (biting the reef: it does so whenever this active)
    if (Math.abs(target - g.act) > 0.2) return target > g.act ? 'そろそろ動き出す' : 'そろそろ休む';
    if (g.goal) return `群れで次の${bommie}へ移っている`;
    if (g.type === 'anem') return 'イソギンチャクのまわりを泳いでいる';
    if (sp.diet === 'algae') return `${reef}の上でじっとしている`;
    if (sp.diet === 'plankton') return g.act * Math.min(1, curNow * 1.5) > 0.15 ? '流れに向かってプランクトンをついばんでいる' : '群れて漂っている';
    if (sp.diet === 'filter') return 'プランクトンを濾して食べている';
    if (g.type === 'roam') return open ? (sp.diet === 'fish' ? '獲物を探して、外洋を回遊している' : '外洋をゆったり泳いでいる') : sp.diet === 'fish' ? `${reef}のまわりを巡回中` : `${reef}のまわりを泳いでいる`;
    return sp.diet === 'fish' ? `${bommie}のまわりで獲物をうかがっている` : `${bommie}のまわりで餌を探している`;
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
        const st = () => (g.cr && g.cr.mode !== 'out' ? (g.cr.mode === 'rest' ? '洞窟の底で休んでいる' : g.cr.mode === 'leave' ? '洞窟から出ていく' : '洞窟へ入っていく') : groupStatus(g));
        out.push({ key, label: sp.ja, len: fs[g.start] * 1.28, adult: sp.size[1], kind: giant ? 'giant' : 'big', prio: (giant ? 3.5 : 2.1) * (0.45 + 0.55 * g.act) + (g.cr && g.cr.mode !== 'out' ? 0.6 : 0), size, pos: () => g.m ?? g.c, frameR: () => frameOf(g), status: st, live: () => g.placed });
      } else if (g.type === 'reef' && sp.big && g.act > 0.5) {
        out.push({ key, label: sp.ja, len: fs[leadOf(g)] * 1.28, adult: sp.size[1], kind: 'big', prio: 1.4, size: size * 1.5, pos: leadPos(g), frameR: () => fs[leadOf(g)] * 0.64, status: () => groupStatus(g), live: () => g.placed });
      } else if (g.type === 'anem') {
        out.push({ key, label: sp.ja, kind: 'anemone', prio: 1.6, size: 0.5, pos: () => g.a!.pos, status: () => groupStatus(g), live: () => true });
      } else if (g.type === 'reef' && !sp.big && g.n >= 5 && g.act > 0.4) {
        // a small fish's school over its patch of reef (the owner, 2026-10-06: the small fish are worth the cruise's
        // look as much as the big ones): filmed as a tap on it is — close and slowly, round its core
        const o: Subject = { key, label: `${sp.ja}の群れ`, kind: 'critter', prio: 1.6 * g.act, size: 1, pos: () => g.m ?? g.c, frameR: () => frameOf(g), status: () => groupStatus(g), live: () => g.placed, one: () => fishOf(g), clump: () => clumpOf(g) };
        Object.defineProperty(o, 'size', { get: () => groupSize(g), enumerable: true });
        out.push(o);
      }
    });
    if (kelpLife && sp.id === 'senorita') {
      let best = -1, distance = 18;
      for (let i = 0; i < total; i++) {
        if (dead[i] || !['forage', 'bury', 'sleep'].includes(kelpLife.states[i].mode)) continue;
        const d = Math.sqrt((fp[i * 3] - lastCam.x) ** 2 + (fp[i * 3 + 1] - lastCam.y) ** 2 + (fp[i * 3 + 2] - lastCam.z) ** 2);
        if (d < distance) { distance = d; best = i; }
      }
      // One modest local moment, subject to the director's normal cooldown, rather
      // than 35 competing subjects or a promise that this short meal lasts forever.
      if (best >= 0) {
        const mode = kelpLife.states[best].mode;
        const s = individualSubject(best, `${sp.id}:kelp-life`, mode === 'forage' ? 1.4 : 1.2);
        const stillHere = s.live;
        s.live = () => stillHere() && kelpLife.states[best].mode === mode;
        s.reach = 18; s.hold = 8; out.push(s);
      }
    }
  }
  function individualSubject(i: number, key: string, prio: number): Subject {
    const g = groups.find(g => i >= g.start && i < g.start + g.n)!;
    const born = g.born, at = new THREE.Vector3(), matrix = new THREE.Matrix4();
    return { key, label: sp.ja, kind: 'critter', prio, size: Math.max(0.2, fs[i] * 1.28), len: fs[i] * 1.28, adult: sp.size[1],
      pos: () => {
        // Aim at the exposed head when buried; the body centre is below the sand.
        if (kelpLife!.states[i].burial > 0.5) { mesh.getMatrixAt(i, matrix); return at.set(0, 0, 0.43).applyMatrix4(matrix); }
        return at.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]);
      },
      status: () => {
        const s = kelpLife!.states[i];
        return s.mode === 'sleep' ? '砂に潜り、頭だけ出して休んでいる' : s.mode === 'seek-sand' ? '砂地の寝床へ泳いでいる'
          : s.mode === 'bury' ? '砂に潜って休むところ' : s.mode === 'wake' ? '砂から出て泳ぎ始めている'
          : s.mode === 'forage' ? '海藻の表面の小動物をついばんでいる' : 'ケルプの間で餌を探している';
      },
      live: () => g.placed && g.born === born && !dead[i],
    };
  }
  // A tap on the screen: the group with a fish nearest the tapped point (each fish projected, a few hundred at
  // most looked at), as something to go and film — a small reef fish's group too, which is no subject of its own
  // (a little school of damselfish, filmed close and slowly). `score` gives a fish's miss from the tap (lower
  // is nearer; Infinity when it cannot be the one: off the tap, out of view, behind the reef).
  function tapAt(score: (x: number, y: number, z: number, r: number) => number): { s: Subject; sc: number } | null {
    if (kelpLife) return null;
    let bg: Group | null = null, bgi = -1, bs = Infinity, bi = -1;
    const step = Math.max(1, Math.floor(total / 400));
    groups.forEach((g, gi) => {
      if (!g.placed || g.away) return;
      for (let i = g.start; i < g.start + g.n; i += g.n > 40 ? step : 1) {
        if (dead[i]) continue;
        const sc = score(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2], fs[i] * 0.64);
        if (sc < bs) { bs = sc; bg = g; bgi = gi; bi = i; }
      }
    });
    if (!bg || !isFinite(bs)) return null;
    const g = bg as Group, gi = bgi, giant = sp.size[1] > 3;
    // (a big fish: the one tapped; a small fish's school: the school)
    if (sp.big && g.type !== 'anem') leadOf(g, bi);
    const one = (g.n === 1 || sp.big) && g.type !== 'anem', i0 = sp.big ? leadOf(g) : g.start, at = new THREE.Vector3();
    const pos = g.type === 'anem' ? () => g.a!.pos : sp.big ? leadPos(g) : one ? () => at.set(fp[i0 * 3], fp[i0 * 3 + 1], fp[i0 * 3 + 2]) : () => g.m ?? g.c;
    const st = () => (g.cr && g.cr.mode !== 'out' ? (g.cr.mode === 'rest' ? '洞窟の底で休んでいる' : g.cr.mode === 'leave' ? '洞窟から出ていく' : '洞窟へ入っていく') : groupStatus(g));
    const small = !sp.big && g.type !== 'anem';
    const s: Subject = {
      key: `${sp.id}:${gi}`, label: g.n > 1 && g.type === 'reef' && !sp.big ? `${sp.ja}の群れ` : sp.ja,
      kind: g.type === 'anem' ? 'anemone' : small ? 'critter' : giant ? 'giant' : 'big', prio: 5,
      size: g.type === 'anem' ? 0.5 : small ? (g.n > 1 ? 1.2 : 0.6) : one ? sp.size[1] : Math.max(sp.size[1], 1.2),
      len: one ? fs[i0] * 1.28 : undefined, adult: one ? sp.size[1] : undefined, pos, status: st, live: () => g.placed,
      frameR: g.type === 'anem' ? undefined : sp.big ? () => fs[leadOf(g)] * 0.64 : () => frameOf(g),
    };
    if (small) s.reach = 30;
    if (small && g.n > 1) Object.defineProperty(s, 'size', { get: () => groupSize(g), enumerable: true });   // (filmed from as far back as its core needs)
    return { s, sc: bs };
  }
  // the nearest group, as something the director can be sent to film
  function focus(cam: THREE.Vector3): Subject | null {
    if (kelpLife && (sp.id === 'senorita' || sp.id === 'black-surfperch')) {
      let best = -1, distance = Infinity;
      for (const g of groups) if (g.placed) for (let i = g.start; i < g.start + g.n; i++) {
        if (dead[i]) continue;
        const d = Math.sqrt((fp[i * 3] - cam.x) ** 2 + (fp[i * 3 + 1] - cam.y) ** 2 + (fp[i * 3 + 2] - cam.z) ** 2);
        if (d < distance) { distance = d; best = i; }
      }
      if (best >= 0) return individualSubject(best, `focus:${sp.id}`, 5);
      return null;
    }
    let best: Group | null = null, bd = Infinity;
    for (const g of groups) { if (!g.placed) continue; const p = g.type === 'anem' ? g.a!.pos : g.bodyCenter || g.c, d = p.distanceTo(cam); if (d < bd) { bd = d; best = g; } }
    if (!best) return null;
    const g = best, p = g.type === 'anem' ? g.a!.pos : g.bodyCenter || g.c;
    // a lone fish: its own body (not the middle of its patch), and its own size
    // (a big fish's group: one of it, as leadOf; a small fish's: the school)
    const lead = sp.big && g.type !== 'anem' && g.n > 1, one = (g.n === 1 || lead) && g.type !== 'anem', at = new THREE.Vector3(), i0 = lead ? leadOf(g) : g.start;
    const pos = lead ? leadPos(g) : one ? () => at.set(fp[i0 * 3], fp[i0 * 3 + 1], fp[i0 * 3 + 2]) : g.type === 'anem' ? () => p : () => g.m ?? p;
    const label = g.n > 1 && g.type === 'reef' && !lead ? `${sp.ja}の群れ` : sp.ja;
    const out: Subject = { key: `focus:${sp.id}`, label, kind: g.type === 'anem' ? 'anemone' : one ? 'big' : 'critter',   // (a small fish's school: filmed close and slowly, never with a big animal's moves)
      prio: 5, size: g.type === 'anem' ? 0.5 : lead ? sp.size[1] * 1.5 : Math.max(sp.size[1], g.n > 1 ? 1.2 : 0.4), len: one ? fs[i0] * 1.28 : undefined, adult: one ? sp.size[1] : undefined, pos, frameR: g.type === 'anem' ? undefined : one ? () => fs[lead ? leadOf(g) : i0] * 0.64 : () => frameOf(g), status: () => (g.cr && g.cr.mode !== 'out' ? (g.cr.mode === 'rest' ? '洞窟の底で休んでいる' : g.cr.mode === 'leave' ? '洞窟から出ていく' : '洞窟へ入っていく') : groupStatus(g)), live: () => g.placed };
    if (!one && g.type !== 'anem') Object.defineProperty(out, 'size', { get: () => groupSize(g), enumerable: true });
    return out;
  }
  return {
    sp, mesh, update, nearest, nearestPos, status, subjects, focus, tapAt,
    // each fish as it is (a few hundred at most, spread evenly): where, and how long
    each(cb: (x: number, y: number, z: number, len: number) => boolean | void, most = 200) { const st = Math.max(1, Math.floor(total / most)); for (let i = 0; i < total; i += st) if (!dead[i] && cb(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2], fs[i] * 1.28) === true) return; },
    preyGroups: () => groups.filter((g) => g.prey).map((g) => g.prey!),
    setStart(f: number) { nearStart = f; },
    // a big one passing by early in a visit (the day's lot): put down out of sight off to one side, heading across the
    // way ahead, so it comes into view by itself
    visit(cam: THREE.Vector3, fx: number, fz: number) {
      const g = groups.find((q) => q.type === 'roam' && q.placed && !q.hunt && !q.cr);
      if (!g) return false;
      for (let k = 0; k < 16; k++) {
        const side = k % 2 ? 1 : -1, a = rr(80, 100) * Math.PI / 180, d = rr(28, 40);
        const x = cam.x + (fx * Math.cos(a) - fz * Math.sin(a) * side) * d, z = cam.z + (fz * Math.cos(a) + fx * Math.sin(a) * side) * d;
        if (!T.wet(x, z, 3) || !unseen(oc, x, T.h(x, z) + g.alt + 1, z, cam, fx, fz, 2)) continue;
        const dx = x - g.c.x, dz = z - g.c.z, y = Math.min(T.h(x, z) + g.alt + 1, -2), dy = y - g.c.y;
        for (let i = g.start; i < g.start + g.n; i++) { fp[i * 3] += dx; fp[i * 3 + 1] += dy; fp[i * 3 + 2] += dz; }
        g.c.set(x, y, z);
        g.head = Math.atan2(cam.z + fz * rr(14, 24) - z, cam.x + fx * rr(14, 24) - x);   // (toward the way ahead, to cross it)
        return true;
      }
      return false;
    },
    // the reef's groups, for keeping fish about the camera (ecosystem.ts): where each is, how many, and a way to
    // send it — put down at (sx, sz) (where it cannot be seen) with its home patch moving on to (ax, az)
    movers: () => (kelpLife ? [] : groups.filter((g) => g.type === 'reef' && g.placed && !g.ch).map((g) => ({
      x: g.c.x, y: g.c.y, z: g.c.z, n: g.n, going: !!g.goal, goal: g.goal,
      move(sx: number, sz: number, ax: number, az: number) {
        const dx = sx - g.c.x, dz = sz - g.c.z, dy = Math.min(T.h(sx, sz) + g.alt, -1.4) - g.c.y;
        for (let i = g.start; i < g.start + g.n; i++) { fp[i * 3] += dx; fp[i * 3 + 1] += dy; fp[i * 3 + 2] += dz; }
        g.c.x = sx; g.c.y += dy; g.c.z = sz; g.anchor.x = sx; g.anchor.z = sz; g.goal = { x: ax, z: az };
      },
    }))),
    // something worth hunting has turned up near (a tornado of jacks): the hunters close by wake up hungry
    excite(x: number, z: number, r: number) { if (!isPredator) return; for (const g of groups) if (g.type === 'roam' && Math.sqrt((g.c.x - x) ** 2 + (g.c.z - z) ** 2) < r) { g.hunger = Math.max(g.hunger, 0.85); g.cooldown = Math.min(g.cooldown, 5); (g as any).excited = 40; } },
    dbg: { fp, dead, groups, kelpLife, get total() { return total; } },   // (for checks)
    reset() { for (const g of groups) g.placed = false; },
  };
}
export type FishSystem = NonNullable<ReturnType<typeof makeFishSystem>>;
