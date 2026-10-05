// Bait balls, grown out of the sea (ADR 0005). A great school of small fish is out over the deeper water by day
// as a matter of course — a long, loose cloud of thousands drifting and feeding — and the hunters of this sea go
// about it each on its own: as one grows hungry it comes to the school, and once two or more are working it
// from below the school draws itself in, tighter and tighter, and is driven up against the surface into a ball.
// Each hunter circles at its own reach and pace, changes them as it goes, and goes in when it is hungry and the
// ball is tight; a bite or two eases its hunger, and a fed one drifts away. With nothing left pressing it the
// ball loosens and the school goes on as before (nothing vanishes; eaten fish are made up while it is out of
// sight). The sea log and the commentary follow what has happened, never ahead of it.
//   school — the loose school, roaming
//   gather — pressed: drawing together
//   herd   — a ball, driven upward
//   frenzy — at the surface: attacks from below, birds from above, the sea boils
//   scatter — no one pressing any more: it loosens and goes on
import * as THREE from 'three';
import { fishGeometry, fishMaterial, SHAPES } from '../ocean/models';
import { makeSchoolShade } from './schoolshade';
import { unseen, sightRange } from './unseen';
import { splashAt, bubblesAt } from '../ocean/splash';
import { zx, zz, outZone, toZone } from '../ocean/zone';
import { U } from '../render/common';
import { clamp, R, rr } from '../core/math';
import type { Species } from '../data/locations';
import type { Env, Subject } from './env';

type Phase = 'school' | 'gather' | 'herd' | 'frenzy' | 'scatter';
const UP = new THREE.Vector3(0, 1, 0);

type Mode = 'cruise' | 'stalk' | 'herd' | 'strike' | 'glide' | 'leap' | 'leave';
interface Pred {
  p: THREE.Vector3; v: THREE.Vector3; dir?: THREE.Vector3; spd?: number; mode: Mode; t: number;
  hunger: number;                   // 0 fed .. 1 starving: it rises by itself, a bite eases it
  ang: number; rad: number; depth: number; turn: number; pace: number; change: number;   // its own way of circling
  rest: number;                     // seconds before it goes in again
  aim: THREE.Vector3; home: THREE.Vector3; bites: number;
}

export function makeBaitBall(oc: any, fraction: number) {
  const loc = oc.loc;
  if (!loc.bait) return null;
  const T = oc.T, bsp: Species = loc.bait.sp;
  // (thousands: the one sight that is all about numbers — never thinned much, even on a phone. The ball's
  // inside is as full as its skin: the fish fill it, so it reads as fish, not as a lump)
  const NBMAX = 8000;
  let NB = Math.round(NBMAX * clamp(fraction, 0.6, 1));

  const bg = fishGeometry(SHAPES[bsp.shape], true);
  const swim = new Float32Array(NBMAX * 3);
  for (let i = 0; i < NBMAX; i++) { swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr(11, 15); swim[i * 3 + 2] = rr(0.85, 1.1); }
  bg.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 3));
  const bshade = makeSchoolShade(bg, NBMAX);
  const bmesh = new THREE.InstancedMesh(bg, fishMaterial(bsp, true), NBMAX);
  bmesh.count = NB; bmesh.frustumCulled = false; bmesh.visible = false; bmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  oc.group.add(bmesh);
  const bp = new Float32Array(NBMAX * 3), bv = new Float32Array(NBMAX * 3), phi = new Float32Array(NBMAX), rf = new Float32Array(NBMAX), ang = new Float32Array(NBMAX), bs = new Float32Array(NBMAX), dead = new Uint8Array(NBMAX);
  const slot = new Float32Array(NBMAX * 3);   // (its place in the loose school: along, across, up)
  for (let i = 0; i < NBMAX; i++) {
    phi[i] = Math.asin(R() * 2 - 1); rf[i] = Math.cbrt(R()) * 0.95 + 0.05; ang[i] = R() * 6.28; bs[i] = rr(bsp.size[0], bsp.size[1]);
    const a = R() * 6.28, rr0 = Math.sqrt(R());
    slot[i * 3] = (R() * 2 - 1) * (0.6 + 0.4 * R()); slot[i * 3 + 1] = Math.sin(a) * rr0; slot[i * 3 + 2] = Math.cos(a) * rr0;
  }

  // the hunters: more of them than the old circling packs, each its own animal
  const packs = (loc.bait.predators as { id: string; n: number }[]).map(({ id, n }) => {
    const sp: Species | undefined = loc.species.find((s: Species) => s.id === id);
    if (!sp) return null;
    const count = Math.max(1, Math.round(n * 1.6));
    const g = fishGeometry(SHAPES[sp.shape]);
    const sw = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { sw[i * 3] = R() * 6.28; sw[i * 3 + 1] = rr(5, 7); sw[i * 3 + 2] = rr(0.9, 1.05); }
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 3));
    const mesh = new THREE.InstancedMesh(g, fishMaterial(sp), count); mesh.userData.baitPack = true;
    mesh.frustumCulled = false; mesh.visible = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oc.group.add(mesh);
    const shark = !!(SHAPES as any)[sp.shape]?.lofted;
    const list: Pred[] = [];
    for (let i = 0; i < count; i++) list.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), mode: 'cruise', t: 0, hunger: rr(0.05, 0.5), ang: R() * 6.28, rad: 6, depth: 3, turn: R() < 0.5 ? 1 : -1, pace: rr(0.8, 1.2), change: 0, rest: 0, aim: new THREE.Vector3(), home: new THREE.Vector3(), bites: 0 });
    return { sp, mesh, list, size: rr(sp.size[0], sp.size[1]), speed: shark ? 5 : sp.shape === 'jack' || sp.shape === 'tuna' || sp.shape === 'fusilier' ? 7.5 : 6, shark, leaper: !shark && sp.shape !== 'barracuda' };
  }).filter(Boolean) as { sp: Species; mesh: THREE.InstancedMesh; list: Pred[]; size: number; speed: number; shark: boolean; leaper: boolean }[];

  const st = {
    active: false,            // a ball is happening (gather .. scatter)
    phase: 'school' as Phase, t: 0, c: new THREE.Vector3(), r: 10, alive: NB, head: 0, placed: false,
    ballK: 0,                 // 0 the loose school .. 1 the ball
    pressure: 0, calm: 0, told: '' as string, len: 22, frenzyFor: 0, spent: 0,
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const predJa = () => packs.map((k) => k.sp.ja).slice(0, 2).join('や');
  const deepEnough = (x: number, z: number) => loc.pelagic || T.top(x, z) < -9;
  const SCHOOL_R = 12;   // (how far its fish reach from its middle, loose: for out-of-sight tests)

  // where the school is put down: out of sight, off to one side of the way ahead, heading across it
  function placeSchool(cam: THREE.Vector3, fx: number, fz: number) {
    const fl = Math.hypot(fx, fz); if (fl < 1e-3) { fx = 0; fz = -1; } else { fx /= fl; fz /= fl; }
    for (let k = 0; k < 60; k++) {
      const side = k % 2 ? 1 : -1, a = rr(85, 110) * Math.PI / 180, d = rr(60, 90) + (k > 30 ? 30 : 0);
      const x = zx(cam.x + (fx * Math.cos(a) - fz * Math.sin(a) * side) * d), z = zz(cam.z + (fz * Math.cos(a) + fx * Math.sin(a) * side) * d);
      if (!deepEnough(x, z) || !unseen(oc, x, -8, z, cam, fx, fz, SCHOOL_R + 6)) continue;
      const floor = loc.pelagic ? -90 : T.top(x, z);
      st.c.set(x, Math.max(floor + 5, loc.pelagic ? -12 : -8), z);
      st.head = Math.atan2(cam.z + fz * 40 - z, cam.x + fx * 40 - x);
      for (let i = 0; i < NB; i++) { const q = schoolAt(i); bp[i * 3] = q.x; bp[i * 3 + 1] = q.y; bp[i * 3 + 2] = q.z; bv[i * 3] = Math.cos(st.head) * 0.6; bv[i * 3 + 1] = 0; bv[i * 3 + 2] = Math.sin(st.head) * 0.6; }
      st.placed = true;
      return true;
    }
    return false;
  }
  // a hunter put down out of sight, somewhere about the school's part of the sea
  function placePred(p: Pred, cam: THREE.Vector3, fx: number, fz: number) {
    for (let k = 0; k < 30; k++) {
      const a = R() * 6.28, d = rr(45, 85), x = zx(st.c.x + Math.cos(a) * d), z = zz(st.c.z + Math.sin(a) * d);
      if (!deepEnough(x, z) && !(T.top(x, z) < -4)) continue;
      if (!unseen(oc, x, st.c.y - 4, z, cam, fx, fz, 3)) continue;
      p.p.set(x, Math.min(-3, Math.max(T.top(x, z) + 2, st.c.y - rr(2, 6))), z); p.home.copy(p.p);
      p.v.set(Math.cos(a + Math.PI), 0, Math.sin(a + Math.PI)); p.dir = undefined; p.mode = 'cruise'; p.t = 0;
      return true;
    }
    return false;
  }
  const _sp = new THREE.Vector3();
  function schoolAt(i: number) {
    // its place in the loose cloud: long along the way it swims, low and wide, the edges ragged
    const ch = Math.cos(st.head), sh = Math.sin(st.head), L = st.len, W = 5.5, H = 2.6;
    const a = slot[i * 3] * L * 0.5, b = slot[i * 3 + 2] * W, u = slot[i * 3 + 1] * H;
    return _sp.set(st.c.x + ch * a - sh * b, st.c.y + u, st.c.z + sh * a + ch * b);
  }

  // birds: where to gather over, and a beakful of fish when one hits the water there
  const attract = {
    get on() { return st.active && st.c.y > -5 && st.pressure >= 2; },
    get c() { return st.c; },
    get r() { return st.r; },
    take(x: number, z: number) {
      let n = 0;
      for (let i = 0; i < NB && n < 2; i++) {
        if (dead[i] || bp[i * 3 + 1] < -2.5) continue;
        const dx = bp[i * 3] - x, dz = bp[i * 3 + 2] - z;
        if (dx * dx + dz * dz < 2.5) { dead[i] = 1; st.alive--; n++; }
      }
    },
  };

  const tell = (env: Env, kind: 'hunt' | 'catch', text: string, key: string) => {
    if (st.told === key) return; st.told = key;
    const at = () => (st.active ? st.c : null);
    env.events.push({ kind, text, x: st.c.x, z: st.c.z, at });
  };

  let hidden = false, reviveAcc = 0;
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number, audio: { frenzy(level: number, dist: number): void; plop(dist: number): void }) {
    const light = clamp(env.day + env.twilight * 0.8, 0, 1);
    if (!st.placed) { if (!placeSchool(cam, fx, fz)) { audio.frenzy(0, 1e9); return; } for (const k of packs) for (const p of k.list) placePred(p, cam, fx, fz); }
    const dc = Math.hypot(st.c.x - cam.x, st.c.z - cam.z);
    // left far behind and out of sight while nothing is happening: it is somewhere else in the sea now — put down
    // again off the way ahead (as any school is), out of sight
    if (!st.active && dc > 150 && unseen(oc, st.c.x, st.c.y, st.c.z, cam, fx, fz, SCHOOL_R)) { placeSchool(cam, fx, fz); for (const k of packs) for (const p of k.list) if (p.mode === 'cruise' && unseen(oc, p.p.x, p.p.y, p.p.z, cam, fx, fz, 3)) placePred(p, cam, fx, fz); }

    // the school's own way: drifting on over the deeper water, turning from the shallows, feeding
    st.t += dt;
    if (st.ballK < 0.3) {
      st.head += (Math.sin(st.t * 0.031) * 0.12 + Math.sin(st.t * 0.011 + 2) * 0.08) * dt;
      for (const look of [10, 20]) { const ax = st.c.x + Math.cos(st.head) * look, az = st.c.z + Math.sin(st.head) * look; if (!deepEnough(ax, az)) { st.head += (deepEnough(st.c.x, st.c.z) ? 0.6 : 1.5) * dt; break; } }
      if (outZone(st.c.x, st.c.z)) { let d = toZone(st.c.x, st.c.z) - st.head; d = Math.atan2(Math.sin(d), Math.cos(d)); st.head += d * dt * 0.5; }
      const pace = 0.55 * (1 - st.ballK);
      st.c.x += Math.cos(st.head) * pace * dt; st.c.z += Math.sin(st.head) * pace * dt;
    }

    // the hunters, each its own
    let pressing = 0;
    for (const pk of packs) for (const p of pk.list) {
      p.t += dt;
      p.hunger = Math.min(1, p.hunger + dt / (light > 0.3 ? 600 : 1200));
      const toC = _b.subVectors(st.c, p.p), dC = toC.length();
      if (p.mode === 'cruise' && light > 0.25 && p.hunger > 0.55 && dC < 120) { p.mode = 'stalk'; p.t = 0; }
      if (p.mode === 'stalk' && dC < st.r + 10) { p.mode = 'herd'; p.t = 0; p.rad = rr(2, 7); p.depth = rr(1.5, 5); p.change = rr(3, 8); p.rest = rr(2, 6); }
      if ((p.mode === 'herd' || p.mode === 'glide') && p.hunger < 0.12) { p.mode = 'leave'; p.t = 0; p.home.set(zx(p.p.x + (p.p.x - st.c.x) * 4), p.p.y - 3, zz(p.p.z + (p.p.z - st.c.z) * 4)); }
      if (p.mode === 'leave' && p.t > 25) { p.mode = 'cruise'; p.home.copy(p.p); }
      if ((p.mode === 'herd' || p.mode === 'strike' || p.mode === 'glide') && dC < st.r + 15) pressing++;
      let want = _a.set(0, 0, 0), speed = pk.speed * 0.3;
      if (p.mode === 'cruise') {
        // wandering its own stretch, unhurried — a stretch that keeps to where the school is (as hunters do: where
        // the food is), never right on it
        const hd = Math.hypot(st.c.x - p.home.x, st.c.z - p.home.z);
        if (hd > 60) { const k = Math.min(1, dt * 0.02); p.home.x += (st.c.x - p.home.x) * k; p.home.z += (st.c.z - p.home.z) * k; }
        const hx = p.home.x + Math.cos(p.t * 0.05 + p.ang) * 18, hz = p.home.z + Math.sin(p.t * 0.05 + p.ang) * 18;
        want.set(hx - p.p.x, (p.home.y - p.p.y) * 0.3, hz - p.p.z).normalize(); speed = pk.speed * 0.25 * p.pace;
      } else if (p.mode === 'stalk') { want.copy(toC).setY(toC.y - 3).normalize(); speed = pk.speed * 0.5 * p.pace; }
      else if (p.mode === 'herd') {
        // its own circle under and round the school: its own reach, depth, pace and way round, each changed now and then
        if ((p.change -= dt) < 0) { p.change = rr(3, 9); p.rad = clamp(p.rad + rr(-2.5, 2.5), 1.5, 9); p.depth = clamp(p.depth + rr(-1.5, 1.5), 0.5, 6); p.pace = clamp(p.pace + rr(-0.25, 0.25), 0.6, 1.4); if (R() < 0.15) p.turn = -p.turn; }
        p.ang += dt * p.turn * pk.speed * 0.45 * p.pace / Math.max(st.r + p.rad, 3);
        want.set(st.c.x + Math.cos(p.ang) * (st.r + p.rad), st.c.y - p.depth, st.c.z + Math.sin(p.ang) * (st.r + p.rad)).sub(p.p);
        speed = Math.min(pk.speed * 0.55 * p.pace, want.length() * 1.2 + 1.2); want.normalize();
        // in, when hungry and the ball is tight enough to strike at
        const tight = clamp((9 - st.r) / 5, 0, 1) * st.ballK;
        if ((p.rest -= dt) < 0 && R() < dt * (0.05 + 0.6 * p.hunger * tight)) {
          p.mode = 'strike'; p.t = 0; p.bites = 0;
          p.aim.set(st.c.x + (R() - 0.5) * st.r, st.c.y + (R() - 0.3) * st.r * 0.6, st.c.z + (R() - 0.5) * st.r);
        }
      } else if (p.mode === 'strike') {
        want.subVectors(p.aim, p.p);
        const past = want.dot(p.v) < 0 && dC > st.r + 1.5;
        want.normalize(); speed = pk.speed;
        if (past || p.t > 4) { p.mode = 'glide'; p.t = 0; }
        if (p.p.y > -0.8 && pk.leaper && p.v.y > 1 && R() < 0.4) { p.mode = 'leap'; p.v.y = rr(3, 5); splashAt(p.p.x, p.p.z, 0.5); audio.plop(p.p.distanceTo(cam)); }
        else if (p.p.y > -1.2 && R() < dt * 3) splashAt(p.p.x, p.p.z, 0.25);
        if (p.p.y < -0.3 && R() < 0.4) bubblesAt(p.p.x, p.p.y, p.p.z, 1);
      } else if (p.mode === 'glide') {
        // through and out the other side, easing off, then round again
        want.copy(p.dir ?? p.v).normalize(); speed = pk.speed * 0.35;
        if (p.t > rr(1, 2.5)) { p.mode = 'herd'; p.rest = rr(2, 7) * (1.3 - p.hunger); p.change = 0; }
      } else if (p.mode === 'leave') { want.set(p.home.x - p.p.x, (p.home.y - p.p.y) * 0.3, p.home.z - p.p.z).normalize(); speed = pk.speed * 0.4; }
      if (p.mode === 'leap') {
        p.v.y -= 9.8 * dt;
        if (p.p.y < 0 && p.v.y < 0) { splashAt(p.p.x, p.p.z, 0.7); audio.plop(p.p.distanceTo(cam)); p.mode = 'glide'; p.t = 0; p.v.y *= 0.3; }
      } else {
        // a fish swims forward and turns at a fish's rate; never sliding backwards
        if (!p.dir) p.dir = p.v.lengthSq() > 1e-4 ? p.v.clone().normalize() : new THREE.Vector3(1, 0, 0);
        if (want.lengthSq() > 1e-6) {
          const a = p.dir.angleTo(want), maxA = dt * (p.mode === 'strike' ? 3.2 : 1.6);
          if (a > maxA) { _c.crossVectors(p.dir, want); if (_c.lengthSq() < 1e-8) _c.set(0, 1, 0); p.dir.applyAxisAngle(_c.normalize(), maxA); } else p.dir.copy(want);
          p.dir.normalize();
        }
        p.spd = (p.spd ?? p.v.length()) + (speed - (p.spd ?? p.v.length())) * Math.min(1, dt * (p.mode === 'strike' ? 3 : 1.2));
        p.v.copy(p.dir).multiplyScalar(p.spd);
        if (p.p.y > -0.35 && p.v.y > 0) { p.v.y *= 0.3; p.dir.y *= 0.3; p.dir.normalize(); }
      }
      p.p.addScaledVector(p.v, dt);
      if (p.mode !== 'leap') p.p.y = Math.min(p.p.y, -0.3);
      if (!loc.pelagic) p.p.y = Math.max(p.p.y, T.top(p.p.x, p.p.z) + 0.8);
    }
    st.pressure = pressing;

    // the school's answer to them: drawn in while pressed, driven up, at the surface a frenzy; let go, it loosens
    const prev = st.phase;
    st.calm = pressing >= 1 ? 0 : st.calm + dt;
    st.spent = Math.max(0, st.spent - dt);
    if (st.phase === 'school' && pressing >= 2 && light > 0.25 && st.spent <= 0) { st.phase = 'gather'; st.t = 0; st.active = true; st.told = ''; }
    else if (st.phase === 'gather' && st.ballK > 0.8) { st.phase = 'herd'; st.t = 0; }
    else if (st.phase === 'herd' && st.c.y > -5 && pressing >= 3) { st.phase = 'frenzy'; st.t = 0; }
    // (it ends when no one is pressing any more, when too few are left — or, worn out at the surface, the school
    // breaks for the depths all at once: a few minutes of frenzy, as they mostly are)
    if (st.phase === 'frenzy' && !st.frenzyFor) st.frenzyFor = rr(150, 280);
    if ((st.phase === 'gather' || st.phase === 'herd' || st.phase === 'frenzy') && (st.calm > 12 || st.alive < NB * 0.3 || (st.phase === 'frenzy' && st.t > st.frenzyFor))) { st.phase = 'scatter'; st.t = 0; st.frenzyFor = 0; for (const pk of packs) for (const p of pk.list) if (p.mode !== 'cruise' && p.mode !== 'leave') { p.mode = 'leave'; p.t = 0; p.home.set(zx(p.p.x + (p.p.x - st.c.x) * 4), p.p.y - 3, zz(p.p.z + (p.p.z - st.c.z) * 4)); p.hunger = Math.min(p.hunger, rr(0, 0.15)); } }   // (fed, or worn out: not back for a good while)
    if (st.phase === 'scatter' && st.ballK < 0.05) { st.phase = 'school'; st.t = 0; st.active = false; st.spent = rr(240, 480); }   // (scattered deep and wide: some minutes before it can be driven together again)
    if (st.phase !== prev) st.t = 0;
    const ballWant = st.phase === 'gather' || st.phase === 'herd' || st.phase === 'frenzy' ? 1 : 0;
    st.ballK += (ballWant - st.ballK) * Math.min(1, dt * (ballWant ? 0.12 : 0.08));
    // (told once it shows, not before)
    if (st.phase === 'gather' && st.ballK > 0.45) tell(env, 'hunt', `${bsp.ja}の群れが急に身を寄せ合いはじめた。下から${predJa()}が追い上げている`, 'gather');
    if (st.phase === 'frenzy' && st.t > 2) {
      const diver = (loc.birds || []).find((b: any) => b.kind === 'booby' || b.kind === 'tern');
      tell(env, 'hunt', `ベイトボール！ 水面が沸き立ち、${predJa()}が群れに突っ込んでいく${diver ? `。上からは${diver.ja}が次々と海へ` : ''}`, 'frenzy');
    }
    if (st.phase === 'scatter' && st.t > 4) tell(env, 'catch', `${bsp.ja}の群れがほどけていった。残ったのは${Math.round(st.alive / NB * 100)}%ほど`, 'scatter');

    // size and height: from the loose school's to the ball's, the ball's by how hard it is pressed and how many are left
    const ballR = 3.6 + 0.5 * Math.sin(st.t * 0.7) + 1.4 * (1 - st.alive / NB) + Math.max(0, 3 - pressing) * 0.6;
    st.r += ((10 + (ballR - 10) * st.ballK) - st.r) * Math.min(1, dt * 0.5);
    const floor = loc.pelagic ? -90 : T.top(st.c.x, st.c.z);
    const schoolY = Math.min(Math.max(floor + 5, loc.pelagic ? -12 : -8) - (1 - light) * 5, -3);
    const ballY = st.phase === 'gather' ? schoolY + 2 : st.phase === 'scatter' ? schoolY - 4 : -st.r * 0.8 - 0.4 - Math.max(0, 3 - pressing) * 1.2;
    // (clear of the bottom by the loose school's half-height or the ball's, and its middle never out of the water — the
    // frenzy's top breaks the surface, its middle stays under)
    st.c.y += (Math.min(Math.max(schoolY + (ballY - schoolY) * st.ballK, floor + Math.min(st.r * 0.5, 4) + 1), -1.5) - st.c.y) * Math.min(1, dt * 0.2);
    if (st.ballK > 0.3) {
      // it shifts and bulges away from whoever is closest, but holds its ground
      _a.set(U.uCurrent.value.x * 0.15, 0, U.uCurrent.value.y * 0.15);
      for (const pk of packs) for (const q of pk.list) { const d = q.p.distanceTo(st.c); if (d < st.r + 3) _a.addScaledVector(_b.subVectors(st.c, q.p).setY(0).normalize(), (st.r + 3 - d) * 0.25); }
      // and off any reef that rises beside it, out into the open water (where the hunters can work it from all round)
      if (!loc.pelagic) for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, ox = Math.cos(a), oz = Math.sin(a);
        for (const d of [st.r * 0.6, st.r + 4]) { const up = T.top(st.c.x + ox * d, st.c.z + oz * d) - (st.c.y - st.r * 0.5); if (up > 0) { _a.x -= ox * Math.min(up, 3) * 0.1; _a.z -= oz * Math.min(up, 3) * 0.1; } }
      }
      _a.clampLength(0, 0.5);
      if (deepEnough(st.c.x + _a.x * 8, st.c.z + _a.z * 8) || !deepEnough(st.c.x, st.c.z)) st.c.addScaledVector(_a, dt);   // (not pushed over the shallows)
    }
    st.len = 22 * (1 - st.ballK) + 2 * st.r * st.ballK;

    // out of sight and far off: not drawn, its fish not worked out (and the eaten made up, as other fish join it)
    const farOff = dc - SCHOOL_R - 6 > sightRange(oc) || (dc > 70 && unseen(oc, st.c.x, st.c.y, st.c.z, cam, fx, fz, SCHOOL_R + 4));
    if (farOff && !st.active) {
      if (st.alive < NB && (reviveAcc += dt * 12) >= 1) { for (let i = 0; i < NB && reviveAcc >= 1; i++) if (dead[i]) { dead[i] = 0; const q = schoolAt(i); bp[i * 3] = q.x; bp[i * 3 + 1] = q.y; bp[i * 3 + 2] = q.z; st.alive++; reviveAcc--; } }
    }
    const preds = packs.some((k) => k.list.some((p) => !unseen(oc, p.p.x, p.p.y, p.p.z, cam, fx, fz, 3)));
    const wasHidden = hidden;
    hidden = farOff && dc > 90 && !preds && !st.active;
    bmesh.visible = !hidden; for (const k of packs) k.mesh.visible = true;
    // the hunters drawn (always: they cruise the sea)
    let near = 0;
    for (const pk of packs) {
      pk.list.forEach((p, i) => {
        if (p.p.distanceTo(st.c) < 20) near++;
        const sp = Math.max(p.v.length(), 0.1);
        _q.copy(p.p).addScaledVector(p.v, 1 / sp);
        _m.lookAt(_q, p.p, UP); _s.setScalar(pk.size); _m.scale(_s); _m.setPosition(p.p);
        pk.mesh.setMatrixAt(i, _m);
      });
      pk.mesh.instanceMatrix.needsUpdate = true;
    }
    if (hidden) {
      // (not worked out while out of sight: it is carried along with its middle, so it is whole when it comes back)
      if (!wasHidden) { /* nothing to do */ }
      for (let i = 0; i < NB; i++) { const q = schoolAt(i); bp[i * 3] = q.x; bp[i * 3 + 1] = q.y; bp[i * 3 + 2] = q.z; }
      U.uBoil.value.w = 0; audio.frenzy(0, 1e9);
      return;
    }

    // the fish: each to its place in the loose school or the milling ball (between, as the school draws in),
    // flinching from any hunter close to it
    const near2: { p: THREE.Vector3; r: number; strike: boolean; size: number; q: Pred }[] = [];
    for (const pk of packs) for (const q of pk.list) if (q.p.distanceTo(st.c) < st.len * 0.6 + st.r + 6) near2.push({ p: q.p, r: pk.size * 1.7 + 1.0, strike: q.mode === 'strike', size: pk.size, q });
    const flat = 0.8, w = 0.45, kB = st.ballK, ch = Math.cos(st.head), shd = Math.sin(st.head), E = bmesh.instanceMatrix.array as Float32Array;
    bshade.begin();
    for (let i = 0; i < NB; i++) {
      if (dead[i]) { _m.makeScale(0, 0, 0); bmesh.setMatrixAt(i, _m); continue; }
      // in the school
      const L = st.len, a0 = slot[i * 3] * L * 0.5, b0 = slot[i * 3 + 2] * 5.5 * (1 - kB * 0.7), u0 = slot[i * 3 + 1] * 2.6;
      const wob = Math.sin(st.t * 0.6 + i) * 0.4;
      let tx = st.c.x + ch * a0 - shd * (b0 + wob), ty = st.c.y + u0, tz = st.c.z + shd * a0 + ch * (b0 + wob);
      if (kB > 0.01) {
        // in the ball, milling round its middle
        const th = ang[i] + st.t * w * (0.8 + rf[i] * 0.4), rad = st.r * rf[i] * Math.cos(phi[i]);
        const bx = st.c.x + Math.cos(th) * rad, by = st.c.y + st.r * flat * Math.sin(phi[i]), bz = st.c.z + Math.sin(th) * rad;
        tx += (bx - tx) * kB; ty += (by - ty) * kB; tz += (bz - tz) * kB;
      }
      const px = bp[i * 3], py = bp[i * 3 + 1], pz = bp[i * 3 + 2];
      let fear = 0;
      for (const h of near2) {
        const dx = px - h.p.x, dy = py - h.p.y, dz = pz - h.p.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < h.r * h.r) {
          const d = Math.sqrt(d2), f = (h.r - d) * 1.6 / Math.max(d, 0.1);
          tx += dx * f; ty += dy * f * 0.6; tz += dz * f; fear = 1;
          if (h.strike && d < h.size * 0.9 && h.q.bites < 6 && R() < 0.4) { dead[i] = 1; st.alive--; h.q.bites++; h.q.hunger = Math.max(0, h.q.hunger - rr(0.1, 0.18)); }
        }
      }
      if (dead[i]) continue;
      let vx = (tx - px) * 1.8, vy = (ty - py) * 1.8, vz = (tz - pz) * 1.8;
      const vl = Math.hypot(vx, vy, vz), mx = fear ? 5 : 2.6;
      if (vl > mx) { vx *= mx / vl; vy *= mx / vl; vz *= mx / vl; }
      const kk = Math.min(1, dt * (fear ? 8 : 3.5));
      bv[i * 3] += (vx - bv[i * 3]) * kk; bv[i * 3 + 1] += (vy - bv[i * 3 + 1]) * kk; bv[i * 3 + 2] += (vz - bv[i * 3 + 2]) * kk;
      const nx = px + bv[i * 3] * dt, ny = Math.min(py + bv[i * 3 + 1] * dt, -0.15), nz = pz + bv[i * 3 + 2] * dt;
      bp[i * 3] = nx; bp[i * 3 + 1] = ny; bp[i * 3 + 2] = nz;
      // facing the way they swim: along the school, or round the mill
      const th = ang[i] + st.t * w * (0.8 + rf[i] * 0.4);
      let hx = bv[i * 3] + (ch * 0.8) * (1 - kB) - Math.sin(th) * 0.8 * kB, hy = bv[i * 3 + 1] * 0.3, hz = bv[i * 3 + 2] + (shd * 0.8) * (1 - kB) + Math.cos(th) * 0.8 * kB;
      // (its body along the way it swims: the basis written straight in — the same as lookAt, a good deal cheaper)
      const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
      let rx = hz, rz = -hx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const ux = hy * rz, uy = hz * rx - hx * rz, uz = -hy * rx, sc = bs[i], o = i * 16;
      E[o] = rx * sc; E[o + 1] = 0; E[o + 2] = rz * sc; E[o + 3] = 0;
      E[o + 4] = ux * sc; E[o + 5] = uy * sc; E[o + 6] = uz * sc; E[o + 7] = 0;
      E[o + 8] = hx * sc; E[o + 9] = hy * sc; E[o + 10] = hz * sc; E[o + 11] = 0;
      E[o + 12] = nx; E[o + 13] = ny; E[o + 14] = nz; E[o + 15] = 1;
      bshade.set(i, 0, nx, ny, nz);
    }
    bshade.end();
    bmesh.instanceMatrix.needsUpdate = true;
    // the boil at the surface, seen from the air
    const boil = st.phase === 'frenzy' ? 1 : st.active ? clamp((st.c.y + 6) / 4, 0, 1) * st.ballK * 0.5 : 0;
    U.uBoil.value.set(st.c.x, st.c.z, st.r * 1.6 + 2, boil);
    audio.frenzy(boil * (0.4 + Math.min(1, near / 6) * 0.6), cam.distanceTo(st.c));
  }

  const subject: Subject = {
    key: 'baitball', label: `${bsp.ja}のベイトボール`, kind: 'hunt', prio: 7, size: 5, reach: 75,
    pos: () => (st.active ? st.c : null),
    status: () => ({ school: '群れのまわりに捕食者が集まってきた', gather: '群れが固まりはじめている', herd: '水面へ追い上げられている', frenzy: '捕食者と海鳥が突っ込んでいる', scatter: 'ほどけはじめた' })[st.phase],
    live: () => st.active && st.phase !== 'scatter',
    frameR: () => st.r,
    note: () => '追い詰められた小魚が、身を守ろうと球のように固まったもの。下からは捕食魚、上からは海鳥が襲いかかり、ほどけるまでの数分から数十分が勝負になる。',
  };
  const schoolSubject: Subject = {
    key: 'baitschool', label: `${bsp.ja}の大群`, kind: 'school', prio: 2.6, size: 8, reach: 45,
    pos: () => (st.placed && !hidden ? st.c : null), status: () => '何千匹もの群れが、ゆったりと漂っている', live: () => st.placed && !st.active,
  };
  return {
    st, attract, update, bsp,
    // how many bait fish to draw (the quality tier)
    setFraction(f: number) { if (!st.active) { NB = Math.round(NBMAX * clamp(f, 0.6, 1)); bmesh.count = NB; st.alive = Math.min(st.alive, NB); } },
    // (something has stirred the hunters: a rare day of them, or someone asking to see one) — they grow hungry now
    // and come to the school; whether and when a ball forms is still theirs to make. The school, if it is far off and
    // out of sight, is about the way ahead instead.
    start: (cam: THREE.Vector3, fx: number, fz: number, _env: Env) => {
      if (!st.placed) placeSchool(cam, fx, fz);
      else if (!st.active && Math.hypot(st.c.x - cam.x, st.c.z - cam.z) > 110 && unseen(oc, st.c.x, st.c.y, st.c.z, cam, fx, fz, SCHOOL_R)) placeSchool(cam, fx, fz);
      for (const k of packs) for (const p of k.list) { p.hunger = Math.max(p.hunger, rr(0.7, 1)); if (p.mode === 'leave') p.mode = 'cruise'; }
      return true;
    },
    subjects: (): Subject[] => (st.active && st.phase !== 'scatter' ? [subject] : st.placed && !hidden && !st.active ? [schoolSubject] : []),
    near: (cam: THREE.Vector3, d: number) => st.active && cam.distanceTo(st.c) < d,
    dbg: { packs, get NB() { return NB; } },
  };
}
export type BaitBall = NonNullable<ReturnType<typeof makeBaitBall>>;
