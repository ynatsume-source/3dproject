// Galápagos sea lions come to play. Every few minutes by day one, two or three young ones come in fast from out of
// sight behind the drone (eco/unseen, behind), and for half a minute to a minute stay and play about it, as they do
// with divers: circling it a few metres off, rolling as they go; charging straight at it and veering away at the last
// moment; hanging head-on in front of it, flippers out, turning their heads to look, now and then blowing a stream of
// bubbles from the nose; spinning; going up to breathe and coming back down. Then they are off, fast, and taken away
// only once out of sight. Each swims as a sea lion does: strokes of the long foreflippers together like wings, then
// a glide with them held to its sides; it banks into its turns and bends its body round them.
import * as THREE from 'three';
import { R, rr, hyp, clamp } from '../core/math';
import { SEALION_GEO, seaLionMaterial } from '../ocean/sealion';
import { logEvent, type Env, type Subject } from './env';
import { unseen, behind, clearDepth } from './unseen';
import { ageOf } from './growth';

// a species: how many come at once, their length range (m), how often they come by (s)
export interface SeaLionSpec { id: string; ja: string; sci: string; note: string; group: [number, number]; len: [number, number]; every: [number, number] }

type Move = 'come' | 'orbit' | 'charge' | 'veer' | 'hang' | 'spin' | 'breathe' | 'go';
interface Lion {
  pos: THREE.Vector3; vel: THREE.Vector3; head: THREE.Vector3; len: number; age: number; seed: number;
  ph: number; stroke: number; spread: number; bend: number; roll: number; spin: number; hy: number; hp: number;
  move: Move; t: number; dur: number; a: number; r: number; dy: number; side: number; bub: number; v0: THREE.Vector3;
}

const MAX = 4;
export function makeSeaLions(oc: any) {
  const spec: SeaLionSpec | undefined = oc.loc.sealions;
  if (!spec) return null;
  const geo = SEALION_GEO.clone();
  const aSl = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), aSl2 = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  aSl.setUsage(THREE.DynamicDrawUsage); aSl2.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aSl', aSl); geo.setAttribute('aSl2', aSl2);
  const mesh = new THREE.InstancedMesh(geo, seaLionMaterial(), MAX);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
  oc.group.add(mesh);
  const fx = { bubbles: (_x: number, _y: number, _z: number, _n?: number) => {} };
  return { spec, mesh, aSl, aSl2, fx, lions: [] as Lion[], active: false, force: false, next: rr(60, 150), t: 0, play: 0, phase: 'in' as 'in' | 'play' | 'out', leaving: 0, logged: { come: false, charge: 0, bub: 0 } };
}
export type SeaLions = NonNullable<ReturnType<typeof makeSeaLions>>;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function start(oc: any, S: SeaLions, cam: THREE.Vector3, fx: number, fz: number) {
  const sp = S.spec, n = Math.round(rr(sp.group[0], sp.group[1]));
  const at = behind(oc, cam, fx, fz, rr(30, 40), 4);
  if (!at) return false;
  S.lions = [];
  for (let i = 0; i < n; i++) {
    const len = sp.len[0] + (sp.len[1] - sp.len[0]) * Math.pow(R(), 1.3);
    const y = clearDepth(oc, at.x, at.z, cam.x - at.x, cam.z - at.z, Math.min(-1.5, cam.y + rr(-2, 2)), 1, 1.5, 8);
    const p = new THREE.Vector3(at.x + rr(-3, 3), y + rr(-1, 1), at.z + rr(-3, 3));
    p.y = Math.min(p.y, -0.8);
    const d = new THREE.Vector3(cam.x - p.x, 0, cam.z - p.z).normalize();
    S.lions.push({ pos: p, vel: d.clone().multiplyScalar(2.5), head: d.clone(), len, age: clamp(ageOf(len, sp.len[1], 0.25) / ageOf(sp.len[1] * 1.05, sp.len[1], 0.25), 0, 1), seed: R(),
      ph: R() * 6.28, stroke: 1, spread: 0, bend: 0, roll: 0, spin: 0, hy: 0, hp: 0, move: 'come', t: 0, dur: 99, a: R() * 6.28, r: 3, dy: 0, side: R() < 0.5 ? -1 : 1, bub: 0, v0: new THREE.Vector3() });
  }
  if (S.lions.some((l) => !unseen(oc, l.pos.x, l.pos.y, l.pos.z, cam, fx, fz, l.len))) return false;
  S.active = true; S.t = 0; S.phase = 'in'; S.play = rr(35, 65); S.leaving = 0; S.logged = { come: false, charge: 0, bub: 0 };
  return true;
}

// the next game: whichever it fancies, but not the same twice running; up to breathe when it has been down a while
function pick(l: Lion, cam: THREE.Vector3, others: Lion[]) {
  const last = l.move, r = R();
  const breathe = l.t > 0 && l.pos.y < -3 && R() < 0.15;
  let m: Move = breathe ? 'breathe' : r < 0.32 ? 'orbit' : r < 0.52 ? 'charge' : r < 0.78 ? 'hang' : 'spin';
  if (m === last && m !== 'orbit') m = 'orbit';
  // (only one charges or hangs in front at a time: the others keep circling)
  if ((m === 'charge' || m === 'hang') && others.some((o) => o !== l && (o.move === 'charge' || o.move === 'veer' || o.move === 'hang'))) m = 'orbit';
  l.move = m; l.t = 0;
  l.dur = m === 'orbit' ? rr(5, 9) : m === 'charge' ? 6 : m === 'hang' ? rr(4, 7) : m === 'spin' ? rr(2.2, 3) : 12;
  l.a = Math.atan2(l.pos.z - cam.z, l.pos.x - cam.x); l.r = rr(2.4, 3.8); l.dy = rr(-1.2, 1.2); l.side = R() < 0.5 ? -1 : 1;
}

export function updateSeaLions(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const S: SeaLions | null = oc.sealions;
  if (!S) return;
  const sp = S.spec, T = oc.T;
  if (!S.active) {
    S.mesh.count = 0;
    S.next -= dt;
    if ((S.next > 0 || env.night > 0.6) && !S.force) return;
    if (!start(oc, S, cam, fx, fz)) { S.next = 8; return; }
    S.force = false;
  }
  S.t += dt;
  const fl = hyp(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
  const near = S.lions.reduce((m, l) => Math.min(m, l.pos.distanceTo(cam)), 1e9);
  if (S.phase === 'in' && near < 9) {
    S.phase = 'play'; S.t = 0;
    for (const l of S.lions) pick(l, cam, S.lions);
    if (!S.logged.come) { S.logged.come = true; const l = S.lions[0]; logEvent(env, 'sealion', `${sp.ja}がやってきて、こちらのまわりを泳ぎ回りはじめた`, l.pos.x, l.pos.z, () => (S.active ? l.pos : null)); }
  }
    // (off and away, out past the drone's side and behind it, far beyond what it can see)
  const leave = () => { S.phase = 'out'; S.leaving = 0; const back = Math.atan2(-fz, -fx), sd = R() < 0.5 ? -1 : 1; for (const l of S.lions) { l.move = 'go'; l.t = 0; l.a = back + sd * rr(0.3, 0.9); } };
  if (S.phase === 'play' && S.t > S.play) leave();
  if (S.phase === 'in' && S.t > 60) leave();
  if (S.phase === 'out') {
    S.leaving += dt;
    if (S.leaving > 4 && S.lions.every((l) => unseen(oc, l.pos.x, l.pos.y, l.pos.z, cam, fx, fz, l.len))) { S.active = false; S.mesh.count = 0; S.next = rr(sp.every[0], sp.every[1]); return; }
  }
  const A = S.aSl.array as Float32Array, B = S.aSl2.array as Float32Array;
  S.lions.forEach((l, i) => {
    l.t += dt;
    if (S.phase === 'play' && l.t > l.dur && l.move !== 'veer') pick(l, cam, S.lions);
    // where it wants to go, how fast, and how it holds its flippers
    let speed = 2.4, spread = 0, face = false;
    switch (l.move) {
      case 'come': _t.set(cam.x + ux * 2.5 + l.side * uz * 3, cam.y + l.dy, cam.z + uz * 2.5 - l.side * ux * 3); speed = 3; break;
      case 'orbit': {
        // round the drone a few metres off, rising and falling a little, rolled toward it
        l.a += dt * l.side * 2.1 / l.r;
        _t.set(cam.x + Math.cos(l.a) * l.r, cam.y + l.dy + Math.sin(l.t * 0.9) * 0.6, cam.z + Math.sin(l.a) * l.r); speed = 2.3; break;
      }
      case 'charge': {
        // straight at the lens, fast; at a couple of metres it veers off past it
        _t.copy(cam); speed = 3.2;
        if (l.pos.distanceTo(cam) < 1.6 + l.len * 0.5) {
          l.move = 'veer'; l.t = 0; l.dur = 2.5;
          _s.subVectors(cam, l.pos).normalize(); l.v0.crossVectors(_s, _up).normalize().multiplyScalar(l.side).addScaledVector(_up, rr(-0.4, 0.6)).normalize();
          if (S.logged.charge++ < 1) logEvent(env, 'sealion', `${sp.ja}がまっすぐ突っ込んできて、目の前でひらりと身をかわした`, l.pos.x, l.pos.z, () => (S.active ? l.pos : null));
        }
        break;
      }
      case 'veer': _t.copy(l.pos).addScaledVector(l.v0, 4).addScaledVector(_s.subVectors(l.pos, cam).normalize(), 1.5); speed = 3; if (l.t > l.dur) pick(l, cam, S.lions); break;
      case 'hang': {
        // head-on in front of the drone, a couple of metres off, flippers out; looking it over
        _t.set(cam.x + ux * (1.9 + l.len * 0.6) + l.side * uz * 0.6, cam.y + l.dy * 0.4, cam.z + uz * (1.9 + l.len * 0.6) - l.side * ux * 0.6);
        speed = 0.9; spread = 1; face = true;
        if (l.t > 1.5 && l.bub <= 0 && R() < dt * 0.35) { l.bub = 2.5; S.fx.bubbles(l.pos.x + l.head.x * l.len * 0.5, l.pos.y + 0.05, l.pos.z + l.head.z * l.len * 0.5, 10); if (S.logged.bub++ < 1) logEvent(env, 'sealion', `${sp.ja}が目の前で、鼻からぶくぶくと泡を吐いた`, l.pos.x, l.pos.z, () => (S.active ? l.pos : null)); }
        break;
      }
      case 'spin': _t.set(cam.x + Math.cos(l.a) * l.r, cam.y + l.dy, cam.z + Math.sin(l.a) * l.r); l.a += dt * l.side * 1.6 / l.r; speed = 2.6; break;
      case 'breathe': _t.set(l.pos.x + l.head.x * 2, -0.15, l.pos.z + l.head.z * 2); speed = 2.2; if (l.pos.y > -0.45) { l.move = 'orbit'; l.t = 0; l.dur = 1.5; l.dy = rr(-1, 0.5); } break;
      case 'go': _t.set(cam.x + Math.cos(l.a) * 250, Math.min(-1.5, cam.y), cam.z + Math.sin(l.a) * 250); speed = 3.4; break;
    }
    l.bub -= dt;
    _t.y = Math.min(_t.y, l.move === 'breathe' ? -0.12 : -0.7);
    // swimming: steer for it at a sea lion's pace, quick in the turn but not on a pin
    _w.subVectors(_t, l.pos);
    const dist = _w.length();
    _w.multiplyScalar(Math.min(speed, dist * 1.2) / Math.max(dist, 1e-3));
    l.vel.lerp(_w, 1 - Math.exp(-dt * (l.move === 'veer' ? 3 : 2)));
    // (never through the drone, nor into the rock)
    _s.subVectors(l.pos, cam); const cd = _s.length(), keep = 1.0 + l.len * 0.45;
    if (cd < keep + 0.6) l.vel.addScaledVector(_s, Math.min(1, keep + 0.6 - cd) * dt * 9 / Math.max(cd, 0.1));
    for (const o of S.lions) if (o !== l) { _s.subVectors(l.pos, o.pos); const od = _s.length(); if (od < 1.2) l.vel.addScaledVector(_s, (1.2 - od) * dt * 4 / Math.max(od, 0.1)); }
    const floor = T.top(l.pos.x + l.vel.x * 0.6, l.pos.z + l.vel.z * 0.6) + 0.45 + l.len * 0.1;
    if (l.pos.y < floor + 0.4) l.vel.y += clamp(floor + 0.4 - l.pos.y, 0, 1) * dt * 6;
    l.pos.addScaledVector(l.vel, dt);
    if (l.pos.y < floor) l.pos.y += (floor - l.pos.y) * Math.min(1, dt * 5);
    l.pos.y = Math.min(l.pos.y, -0.1);
    // its nose: along its way when it swims, round to the drone when it hangs looking
    const v = l.vel.length();
    if (face || v < 0.5) _f.subVectors(cam, l.pos).normalize(); else _f.copy(l.vel).divideScalar(Math.max(v, 1e-3));
    const h0x = l.head.x, h0z = l.head.z;
    l.head.lerp(_f, 1 - Math.exp(-dt * (face ? 1.5 : 4))).normalize();
    const turn = Math.atan2(h0x * l.head.z - h0z * l.head.x, h0x * l.head.x + h0z * l.head.z) / Math.max(dt, 1e-3);
    // banking and bending into the turn (turn > 0: round to its right; it rolls right side down); a spin is a roll
    // right round
    l.bend += (clamp(-turn * 0.12, -0.25, 0.25) - l.bend) * Math.min(1, dt * 4);
    if (l.move === 'spin') l.spin += dt * l.side * Math.PI * 2 / 1.2; else l.spin += (Math.round(l.spin / (Math.PI * 2)) * Math.PI * 2 - l.spin) * Math.min(1, dt * 3);
    l.roll += (clamp(turn * 0.5, -1.1, 1.1) - l.roll) * Math.min(1, dt * 3);
    // the flippers: strokes when it speeds up or climbs, a glide when it has the speed; out when it hangs
    const want = (_w.length() > v + 0.25 || l.vel.y > 0.6) && !face ? 1 : 0;
    l.stroke += (Math.max(want, face ? 0.15 : 0) - l.stroke) * Math.min(1, dt * 3);
    l.spread += (spread - l.spread) * Math.min(1, dt * 2);
    l.ph += dt * Math.PI * 2 * (0.9 + 0.5 * l.stroke);
    // the head: turned to the drone when it is close, within what its neck allows
    const toC = _s.subVectors(cam, l.pos), dc = toC.length();
    let hy = 0, hp = 0;
    if (dc < 7) {
      // (the drone in the body's own frame: +x its left, +z ahead)
      const hx = l.head.x, hz = l.head.z, hh = hyp(hx, hz) || 1, lx = (toC.x * hz - toC.z * hx) / hh, lz = (toC.x * hx + toC.z * hz) / hh;
      hy = clamp(Math.atan2(lx, lz), -0.7, 0.7) * (1 - smooth(4, 7, dc));
      hp = clamp(Math.atan2(toC.y, hyp(toC.x, toC.z)) - Math.atan2(l.head.y, hh), -0.5, 0.5) * (1 - smooth(4, 7, dc));
    }
    if (l.move === 'hang') { hy += Math.sin(S.t * 0.9 + i) * 0.25; hp += Math.sin(S.t * 0.6 + i * 2) * 0.15; }
    l.hy += (hy - l.hy) * Math.min(1, dt * 3); l.hp += (hp - l.hp) * Math.min(1, dt * 3);
    const hs = hyp(l.head.x, l.head.z) || 1e-3;
    _e.set(-Math.atan2(l.head.y, hs) * 0.9, Math.atan2(l.head.x, l.head.z), l.roll + l.spin, 'YXZ');
    _q.setFromEuler(_e); _m.compose(l.pos, _q, _s.setScalar(l.len));
    S.mesh.setMatrixAt(i, _m);
    A[i * 4] = l.ph; A[i * 4 + 1] = l.stroke; A[i * 4 + 2] = l.spread; A[i * 4 + 3] = l.bend;
    B[i * 4] = l.age; B[i * 4 + 1] = l.seed; B[i * 4 + 2] = l.hy; B[i * 4 + 3] = l.hp;
  });
  S.mesh.count = S.lions.length;
  S.mesh.instanceMatrix.needsUpdate = true; S.aSl.needsUpdate = true; S.aSl2.needsUpdate = true;
}
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

export function seaLionSubjects(oc: any, out: Subject[], focus = false) {
  const S: SeaLions | null = oc.sealions;
  if (!S || !S.active) return;
  const sp = S.spec, lead = S.lions[0];
  const pos = () => {
    // (the one in front of the drone, if one is; else the nearest)
    const f = S.lions.find((l) => l.move === 'hang' || l.move === 'charge' || l.move === 'veer');
    return (f ?? S.lions.reduce((a, b) => (a.pos.distanceToSquared(S.lions[0].pos) < b.pos.distanceToSquared(S.lions[0].pos) ? a : b))).pos;
  };
  const what = () => {
    const ms = S.lions.map((l) => l.move);
    if (S.phase === 'in') return 'こちらへ泳いでくる';
    if (S.phase === 'out') return '沖へ泳ぎ去っていく';
    if (ms.includes('veer') || ms.includes('charge')) return 'まっすぐ突っ込んできて、目の前で身をかわした';
    if (ms.includes('hang')) return S.lions.some((l) => l.bub > 0) ? '目の前で鼻から泡を吐いている' : '目の前に止まって、こちらをのぞきこんでいる';
    if (ms.includes('spin')) return 'くるくると回りながら泳いでいる';
    if (ms.includes('breathe')) return '息つぎに水面へ上がっていく';
    return 'こちらのまわりを泳ぎ回って遊んでいる';
  };
  out.push({ key: focus ? 'focus:sealion' : 'sealions', label: S.lions.length > 1 ? `${sp.ja}たち` : sp.ja, len: lead.len, adult: sp.len[1], lenK: 0.3, lenWhat: '体長', kind: 'giant', prio: focus ? 5 : 4.6, size: 2.5, pos,
    heading: () => ({ x: lead.head.x, z: lead.head.z }), status: what, live: () => S.active && S.phase !== 'out' });
}
