// Bait balls. Now and then predators find a school of small fish out over open water and work it: they
// circle below and drive it up into a tight, milling ball against the surface, then slash through it
// again and again while seabirds plunge in from above. The ball tears open around every attacker and
// closes behind it; when too few are left, the survivors break away into the depths.
//   gather  — the school bunches, predators come in from the blue
//   herd    — predators circle beneath; the ball shrinks and rises
//   frenzy  — the ball at the surface, attacks from below and above, the sea boils
//   scatter — the ball breaks up; everyone leaves
import * as THREE from 'three';
import { fishGeometry, fishMaterial, SHAPES } from '../ocean/models';
import { makeSchoolShade } from './schoolshade';
import { unseen, sightRange } from './unseen';
import { splashAt, bubblesAt } from '../ocean/splash';
import { U } from '../render/common';
import { clamp, R, rr } from '../core/math';
import type { Species } from '../data/locations';
import type { Env, Subject } from './env';

type Phase = 'gather' | 'herd' | 'frenzy' | 'scatter' | 'leave';   // (leave: on out of sight, after the scatter)
const PHASE_T: Record<Phase, number> = { gather: 25, herd: 35, frenzy: 100, scatter: 22, leave: 1e9 };
const UP = new THREE.Vector3(0, 1, 0);

interface Pred { dir?: THREE.Vector3; spd?: number; p: THREE.Vector3; v: THREE.Vector3; mode: 'approach' | 'circle' | 'dash' | 'leap' | 'leave'; ang: number; rad: number; depth: number; next: number; bites: number; aim: THREE.Vector3; seed: number }

export function makeBaitBall(oc: any, fraction: number) {
  const loc = oc.loc;
  if (!loc.bait) return null;
  const T = oc.T, bsp: Species = loc.bait.sp;
  const NBMAX = 5000;   // (a ball that fills the view: thousands, not a few hundred)
  let NB = Math.round(NBMAX * clamp(fraction, 0.6, 1));   // (the one sight that is all about numbers: never thinned much, even on a phone)

  // the bait: a low-detail body, since there are so many
  const bg = fishGeometry(SHAPES[bsp.shape], true);
  const swim = new Float32Array(NBMAX * 3);
  for (let i = 0; i < NBMAX; i++) { swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr(11, 15); swim[i * 3 + 2] = rr(0.85, 1.1); }
  bg.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 3));
  const bshade = makeSchoolShade(bg, NBMAX);
  const bmesh = new THREE.InstancedMesh(bg, fishMaterial(bsp, true), NBMAX);
  bmesh.count = NB;
  bmesh.frustumCulled = false; bmesh.visible = false; bmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  oc.group.add(bmesh);
  const bp = new Float32Array(NBMAX * 3), bv = new Float32Array(NBMAX * 3), phi = new Float32Array(NBMAX), rf = new Float32Array(NBMAX), ang = new Float32Array(NBMAX), bs = new Float32Array(NBMAX), dead = new Uint8Array(NBMAX);

  // the predators that come for it
  const packs = (loc.bait.predators as { id: string; n: number }[]).map(({ id, n }) => {
    const sp: Species | undefined = loc.species.find((s: Species) => s.id === id);
    if (!sp) return null;
    const g = fishGeometry(SHAPES[sp.shape]);
    const sw = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { sw[i * 3] = R() * 6.28; sw[i * 3 + 1] = rr(5, 7); sw[i * 3 + 2] = rr(0.9, 1.05); }
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 3));
    const mesh = new THREE.InstancedMesh(g, fishMaterial(sp), n); mesh.userData.baitPack = true;   // (a bait ball's hunters: for the checks)
    mesh.frustumCulled = false; mesh.visible = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oc.group.add(mesh);
    const shark = !!(SHAPES as any)[sp.shape]?.lofted;   // every shark body is lofted
    const list: Pred[] = [];
    for (let i = 0; i < n; i++) list.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), mode: 'approach', ang: 0, rad: 0, depth: 0, next: 0, bites: 0, aim: new THREE.Vector3(), seed: R() * 50 });
    return { sp, mesh, list, size: rr(sp.size[0], sp.size[1]), speed: shark ? 5 : sp.shape === 'jack' || sp.shape === 'tuna' || sp.shape === 'fusilier' ? 7.5 : 6, shark, leaper: !shark && sp.shape !== 'barracuda' };
  }).filter(Boolean) as { sp: Species; mesh: THREE.InstancedMesh; list: Pred[]; size: number; speed: number; shark: boolean; leaper: boolean }[];

  const st = {
    active: false, phase: 'gather' as Phase, t: 0, c: new THREE.Vector3(), r: 10, alive: NB,
    timer: rr(500, 1500),                       // seconds of daylight until the next one, give or take
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const predJa = () => packs.map((k) => k.sp.ja).slice(0, 2).join('や');

  function start(cam: THREE.Vector3, fx: number, fz: number, env: Env, near = false) {
    // out over deeper water ahead: never on top of the reef or in the cave
    let best: [number, number] | null = null;
    for (let k = 0; k < 40 && !best; k++) {
      const d = near ? rr(30, 45) : rr(45, 75), lat = (R() * 2 - 1) * 35;
      const x = clamp(cam.x + fx * d - fz * lat, -125, 125), z = clamp(cam.z + fz * d + fx * lat, -125, 125);
      if ((loc.pelagic || T.top(x, z) < -8) && !(oc.cave && Math.hypot(x - oc.cave.cx, z - oc.cave.cz) < 45)) best = [x, z];
    }
    if (!best) return false;
    const floor = loc.pelagic ? -90 : T.top(best[0], best[1]);
    st.c.set(best[0], Math.max(floor + 5, loc.pelagic ? -16 : -11), best[1]);
    st.active = true; st.phase = 'gather'; st.t = 0; st.r = 10; st.alive = NB;
    // the fish do not appear there: a long, loose school swims in from the blue beyond it (the far side from the
    // camera) and draws together over the next half minute; the hunters come in from out there too
    // (as far out as this water lets one see, and a little more: they swim in out of the blue)
    const ix = st.c.x - cam.x, iz = st.c.z - cam.z, il = Math.hypot(ix, iz) || 1, ux = ix / il, uz = iz / il;
    const back0 = Math.max(42, sightRange(oc) - il + 12);
    for (let i = 0; i < NB; i++) {
      dead[i] = 0;
      phi[i] = Math.asin(R() * 2 - 1); rf[i] = Math.cbrt(R()) * 0.95 + 0.05;   // filling the ball, not just its skin
      ang[i] = R() * 6.28; bs[i] = rr(bsp.size[0], bsp.size[1]);
      const back = back0 + rr(0, 28), lat = (R() - 0.5) * 18;
      bp[i * 3] = st.c.x + ux * back - uz * lat; bp[i * 3 + 1] = st.c.y + (R() - 0.5) * 5; bp[i * 3 + 2] = st.c.z + uz * back + ux * lat;
      bv[i * 3] = -ux * 2; bv[i * 3 + 1] = 0; bv[i * 3 + 2] = -uz * 2;
    }
    for (const k of packs) for (const p of k.list) {
      let a = 0, d = 0;
      for (let t = 0; t < 30; t++) {
        a = Math.atan2(uz, ux) + rr(-1.4, 1.4); d = back0 + rr(5, 30);
        if (unseen(oc, st.c.x + Math.cos(a) * d, st.c.y, st.c.z + Math.sin(a) * d, cam, fx, fz, 3)) break;
      }
      p.p.set(st.c.x + Math.cos(a) * d, st.c.y - rr(3, 10), st.c.z + Math.sin(a) * d);
      p.v.set(-Math.cos(a), 0, -Math.sin(a)).multiplyScalar(2);
      p.mode = 'approach'; p.ang = a; p.rad = rr(6, 10); p.depth = rr(2, 6); p.next = rr(2, 8); p.bites = 0;
    }
    bmesh.visible = true; for (const k of packs) k.mesh.visible = true;
    env.events.push({ kind: 'hunt', text: `沖で${bsp.ja}の大群が身を寄せ合いはじめた。何かに追われている`, x: st.c.x, z: st.c.z, at: () => (st.active ? st.c : null) });
    return true;
  }

  function end() {
    st.active = false; bmesh.visible = false; for (const k of packs) k.mesh.visible = false;
    st.timer = rr(900, 2000);
    U.uBoil.value.w = 0;
  }

  // birds: where to gather over, and a beakful of fish when one hits the water there
  const attract = {
    get on() { return st.active && (st.phase === 'frenzy' || (st.phase === 'herd' && st.t > 20)); },
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

  let leaveCheck = 0;
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number, audio: { frenzy(level: number, dist: number): void; plop(dist: number): void }) {
    if (!st.active) {
      // bait balls happen by day, most of all around dawn and dusk
      st.timer -= dt * (0.15 + env.day * 0.85 + env.twilight * 1.8);
      if (st.timer <= 0 && !start(cam, fx, fz, env)) st.timer = 60;
      audio.frenzy(0, 1e9);
      return;
    }
    st.t += dt;
    const prev = st.phase;
    if (st.t > PHASE_T[st.phase] || (st.phase === 'frenzy' && st.alive < NB * 0.3)) {
      const order: Phase[] = ['gather', 'herd', 'frenzy', 'scatter', 'leave'];
      const i = order.indexOf(st.phase);
      st.phase = order[i + 1]; st.t = 0;
    }
    // gone on out of sight, every last fish and hunter: only then is it over (nothing vanishes in view)
    if (st.phase === 'leave' && (leaveCheck -= dt) < 0) {
      leaveCheck = 0.5;
      let seen = false;
      for (let i = 0; i < NB && !seen; i += 7) if (!dead[i] && !unseen(oc, bp[i * 3], bp[i * 3 + 1], bp[i * 3 + 2], cam, fx, fz, 1)) seen = true;
      for (const k of packs) for (const p of k.list) if (!seen && !unseen(oc, p.p.x, p.p.y, p.p.z, cam, fx, fz, 2)) seen = true;
      if (!seen) { end(); return; }
    }
    if (st.phase !== prev) {
      const at = () => (st.active ? st.c : null);
      if (st.phase === 'herd') env.events.push({ kind: 'hunt', text: `${predJa()}が${bsp.ja}の群れを下から水面へ追い上げている`, x: st.c.x, z: st.c.z, at });
      const diver = (loc.birds || []).find((b: any) => b.kind === 'booby' || b.kind === 'tern');
      if (st.phase === 'frenzy') env.events.push({ kind: 'hunt', text: `ベイトボール！ 水面が沸き立ち、${predJa()}が群れに突っ込んでいく${diver ? `。上からは${diver.ja}が次々と海へ` : ''}`, x: st.c.x, z: st.c.z, at });
      if (st.phase === 'scatter') env.events.push({ kind: 'catch', text: `${bsp.ja}の群れが散っていった。残ったのは${Math.round(st.alive / NB * 100)}%ほど`, x: st.c.x, z: st.c.z, at });
    }
    const ph = st.phase, k = st.t / PHASE_T[ph];
    // the ball: size, height and flattening by phase
    const rT = ph === 'gather' ? 10 : ph === 'herd' ? 10 - 6 * k : ph === 'frenzy' ? 3.8 + 0.5 * Math.sin(st.t * 0.7) + 1.2 * (1 - st.alive / NB) : 5 + 18 * k;   // (packed dense: tens of fish to every cubic metre)   // packed tight; it thins as it is eaten
    st.r += (rT - st.r) * Math.min(1, dt * 0.5);
    const floor = loc.pelagic ? -90 : T.top(st.c.x, st.c.z);
    const yT = ph === 'gather' ? Math.max(floor + 5, loc.pelagic ? -16 : -11) : ph === 'herd' ? -3.5 - (1 - k) * 5 : ph === 'frenzy' ? -st.r * 0.8 - 0.4 : -6 - 8 * k;
    st.c.y += (Math.max(yT, floor + st.r + 1) - st.c.y) * Math.min(1, dt * 0.25);
    const flat = ph === 'gather' ? 0.35 : 0.8;
    // it drifts, and flinches away from whatever is closest
    _a.set(U.uCurrent.value.x * 0.15, 0, U.uCurrent.value.y * 0.15);
    for (const p of packs) for (const q of p.list) { const d = q.p.distanceTo(st.c); if (d < st.r + 3) _a.addScaledVector(_b.subVectors(st.c, q.p).setY(0).normalize(), (st.r + 3 - d) * 0.25); }
    st.c.addScaledVector(_a.clampLength(0, 0.35), dt);   // it shifts and bulges, but holds its ground

    // predators
    let near = 0;
    for (const pk of packs) {
      pk.list.forEach((p, i) => {
        const toC = _b.subVectors(st.c, p.p), dC = toC.length();
        let want = _a.set(0, 0, 0), speed = pk.speed * 0.45;
        if (ph === 'scatter' || ph === 'leave') p.mode = p.mode === 'leap' ? 'leap' : 'leave';
        else if (p.mode === 'approach' && dC < p.rad + 6) p.mode = 'circle';
        if (p.mode === 'approach') { want.copy(toC).normalize(); speed = pk.speed * 0.6; }
        else if (p.mode === 'circle') {
          // patrol a ring under and around the ball, pushing it up and together
          p.ang += dt * (0.9 / Math.max(p.rad, 3)) * pk.speed * 0.5 * (i % 2 ? 1 : -1);
          want.set(st.c.x + Math.cos(p.ang) * (st.r + p.rad * 0.5), st.c.y - p.depth - (ph === 'gather' ? 2 : 0), st.c.z + Math.sin(p.ang) * (st.r + p.rad * 0.5)).sub(p.p);
          speed = Math.min(pk.speed * 0.55, want.length() * 1.2 + 1.5); want.normalize();
          if (ph === 'frenzy' && (p.next -= dt) < 0) {
            // an attack: in through the ball from below or the side
            p.mode = 'dash'; p.bites = 0; p.next = rr(3, pk.shark ? 12 : 8);
            p.aim.set(st.c.x + (R() - 0.5) * st.r, st.c.y + (R() - 0.3) * st.r * 0.6, st.c.z + (R() - 0.5) * st.r);
          }
        } else if (p.mode === 'dash') {
          want.subVectors(p.aim, p.p);
          const past = want.dot(p.v) < 0 && dC > st.r + 2;
          want.normalize(); speed = pk.speed;
          if (past) { p.mode = 'circle'; p.depth = rr(2, 6); }
          // bursting out through the surface
          if (p.p.y > -0.8 && pk.leaper && p.v.y > 1 && R() < 0.5) { p.mode = 'leap'; p.v.y = rr(3, 5); splashAt(p.p.x, p.p.z, 0.5); audio.plop(p.p.distanceTo(cam)); }
          else if (p.p.y > -1.2 && R() < dt * 3) splashAt(p.p.x, p.p.z, 0.25);
          if (p.p.y < -0.3 && R() < 0.5) bubblesAt(p.p.x, p.p.y, p.p.z, 1);
        } else if (p.mode === 'leave') { want.copy(toC).multiplyScalar(-1).setY(-0.3).normalize(); speed = pk.speed * 0.5; }
        if (p.mode === 'leap') {
          p.v.y -= 9.8 * dt;
          if (p.p.y < 0 && p.v.y < 0) { splashAt(p.p.x, p.p.z, 0.7); audio.plop(p.p.distanceTo(cam)); p.mode = 'circle'; p.v.y *= 0.3; }
        } else {
          // a fish swims forward and turns: its heading swings toward where it wants to go at a fish's
          // turning rate, and it never slides backwards (so it cannot flip end for end)
          if (!p.dir) p.dir = p.v.lengthSq() > 1e-4 ? p.v.clone().normalize() : new THREE.Vector3(1, 0, 0);
          if (want.lengthSq() > 1e-6) {
            const ang = p.dir.angleTo(want), maxA = dt * (p.mode === 'dash' ? 3.2 : 1.8);
            if (ang > maxA) { _c.crossVectors(p.dir, want); if (_c.lengthSq() < 1e-8) _c.set(0, 1, 0); p.dir.applyAxisAngle(_c.normalize(), maxA); } else p.dir.copy(want);
            p.dir.normalize();
          }
          p.spd = (p.spd ?? p.v.length()) + (speed - (p.spd ?? p.v.length())) * Math.min(1, dt * (p.mode === 'dash' ? 3 : 1.2));
          p.v.copy(p.dir).multiplyScalar(p.spd);
          if (p.p.y > -0.35 && p.v.y > 0) { p.v.y *= 0.3; p.dir.y *= 0.3; p.dir.normalize(); }
        }
        p.p.addScaledVector(p.v, dt);
        if (p.mode !== 'leap') p.p.y = Math.min(p.p.y, -0.3);
        if (!loc.pelagic) p.p.y = Math.max(p.p.y, T.top(p.p.x, p.p.z) + 0.8);
        if (dC < 20) near++;
        const sp = Math.max(p.v.length(), 0.1);
        _q.copy(p.p).addScaledVector(p.v, 1 / sp);
        _m.lookAt(_q, p.p, UP); _s.setScalar(pk.size); _m.scale(_s); _m.setPosition(p.p);
        pk.mesh.setMatrixAt(i, _m);
      });
      pk.mesh.instanceMatrix.needsUpdate = true;
    }

    // the bait: a ball milling round its centre, torn open around each attacker
    const w = 0.45;
    bshade.begin();
    for (let i = 0; i < NB; i++) {
      if (dead[i]) { _m.makeScale(0, 0, 0); bmesh.setMatrixAt(i, _m); continue; }
      const th = ang[i] + st.t * w * (0.8 + rf[i] * 0.4), rad = st.r * rf[i] * Math.cos(phi[i]);
      let tx = st.c.x + Math.cos(th) * rad, ty = st.c.y + st.r * flat * Math.sin(phi[i]), tz = st.c.z + Math.sin(th) * rad;
      if (ph === 'scatter') { const s = 1 + k * 2.5; tx = st.c.x + (tx - st.c.x) * s; tz = st.c.z + (tz - st.c.z) * s; ty -= k * 6 * rf[i]; }
      if (ph === 'leave') {
        // scattered: each fish on out, away from where the ball was, and a little down, into the blue
        const ox = bp[i * 3] - st.c.x, oz = bp[i * 3 + 2] - st.c.z, ol = Math.hypot(ox, oz) || 1;
        tx = bp[i * 3] + ox / ol * 8; tz = bp[i * 3 + 2] + oz / ol * 8; ty = Math.max(bp[i * 3 + 1] - 0.4, st.c.y - 14);
      }
      const px = bp[i * 3], py = bp[i * 3 + 1], pz = bp[i * 3 + 2];
      let fear = 0;
      for (const pk of packs) for (const q of pk.list) {
        const dx = px - q.p.x, dy = py - q.p.y, dz = pz - q.p.z, d2 = dx * dx + dy * dy + dz * dz;
        const rr2 = pk.size * 1.7 + 1.0;
        if (d2 < rr2 * rr2) {
          const d = Math.sqrt(d2), f = (rr2 - d) * 1.6 / Math.max(d, 0.1);
          tx += dx * f; ty += dy * f * 0.6; tz += dz * f; fear = 1;
          // caught: most strikes miss, a few don't
          if (q.mode === 'dash' && d < pk.size * 0.9 && q.bites < 6 && R() < 0.4) { dead[i] = 1; st.alive--; q.bites++; }
        }
      }
      if (dead[i]) continue;
      let vx = (tx - px) * 1.8, vy = (ty - py) * 1.8, vz = (tz - pz) * 1.8;
      const vl = Math.hypot(vx, vy, vz), mx = fear ? 5 : ph === 'gather' || (ph === 'herd' && st.t < 15) ? 3.4 : 2.4;   // (coming in from far off: a steady fast swim)
      if (vl > mx) { vx *= mx / vl; vy *= mx / vl; vz *= mx / vl; }
      const kk = Math.min(1, dt * (fear ? 8 : 3.5));
      bv[i * 3] += (vx - bv[i * 3]) * kk; bv[i * 3 + 1] += (vy - bv[i * 3 + 1]) * kk; bv[i * 3 + 2] += (vz - bv[i * 3 + 2]) * kk;
      const nx = px + bv[i * 3] * dt, ny = Math.min(py + bv[i * 3 + 1] * dt, -0.15), nz = pz + bv[i * 3 + 2] * dt;
      bp[i * 3] = nx; bp[i * 3 + 1] = ny; bp[i * 3 + 2] = nz;
      // face along the mill (the way they swim) blended with how they are actually moving
      const hx = bv[i * 3] - Math.sin(th) * 0.8, hz = bv[i * 3 + 2] + Math.cos(th) * 0.8;
      _q.set(nx + hx, ny + bv[i * 3 + 1] * 0.3, nz + hz); _a.set(nx, ny, nz);
      _m.lookAt(_q, _a, UP); _s.setScalar(bs[i]); _m.scale(_s); _m.setPosition(nx, ny, nz);
      bmesh.setMatrixAt(i, _m);
      bshade.set(i, 0, nx, ny, nz);
    }
    bshade.end();
    bmesh.instanceMatrix.needsUpdate = true;
    // the boil at the surface, seen from the air
    const boil = ph === 'frenzy' ? 1 : ph === 'herd' ? k * 0.4 : ph === 'scatter' ? 1 - k : 0;
    U.uBoil.value.set(st.c.x, st.c.z, st.r * 1.6 + 2, boil);
    audio.frenzy(boil * (0.4 + Math.min(1, near / 6) * 0.6), cam.distanceTo(st.c));
  }

  const subject: Subject = {
    key: 'baitball', label: `${bsp.ja}のベイトボール`, kind: 'hunt', prio: 7, size: 5, reach: 190,
    pos: () => (st.active ? st.c : null),
    status: () => ({ gather: '群れが固まりはじめている', herd: '水面へ追い上げられている', frenzy: '捕食者と海鳥が突っ込んでいる', scatter: '散りはじめた' })[st.phase],
    live: () => st.active && st.phase !== 'scatter',
    hold: 0,
    frameR: () => st.r,
  };
  return {
    st, attract, update, bsp,
    // how many bait fish to draw (the quality tier)
    setFraction(f: number) { if (!st.active) { NB = Math.round(NBMAX * clamp(f, 0.6, 1)); bmesh.count = NB; } },
    start: (cam: THREE.Vector3, fx: number, fz: number, env: Env) => st.active || start(cam, fx, fz, env, true),
    subjects: (): Subject[] => {
      if (!st.active || st.phase === 'scatter') return [];
      const left = ['gather', 'herd', 'frenzy'].slice(['gather', 'herd', 'frenzy'].indexOf(st.phase)).reduce((a, p) => a + PHASE_T[p as Phase], 0) - st.t;
      subject.hold = left;
      return [subject];
    },
    near: (cam: THREE.Vector3, d: number) => st.active && cam.distanceTo(st.c) < d,
  };
}
export type BaitBall = NonNullable<ReturnType<typeof makeBaitBall>>;
