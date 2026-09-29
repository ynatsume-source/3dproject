// Turtles and mantas with daily routines.
// Turtles: forage by day (green turtles graze seagrass where there is any, otherwise reef algae),
// sleep wedged against the reef at night, and rise to breathe now and then.
// Mantas: circle a cleaning station by day; after dark they feed where plankton is thickest.
import * as THREE from 'three';
import { clamp, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { activity, logEvent, type Env } from './env';

const _w = new THREE.Vector3();

function relocate(t: any, T: any, cam: THREE.Vector3, fx: number, fz: number) {
  const d = t.placed ? rr(34, 48) : rr(12, 36), lat = (R() * 2 - 1) * 18;
  t.pos.set(clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), 0, clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT));
  t.pos.y = T.top(t.pos.x, t.pos.z) + rr(1, 3);
  t.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(1, 2.2);
  t.placed = true; t.state = 'travel'; t.goal = null; t.stateT = 0;
}

// a spot near the turtle suited to what it wants to do
function pickGoal(oc: any, from: THREE.Vector3, want: 'graze' | 'rest'): THREE.Vector3 {
  const T = oc.T, loc = oc.loc;
  let best: THREE.Vector3 | null = null, bs = -1;
  for (let k = 0; k < 24; k++) {
    const x = clamp(from.x + rr(-25, 25), -LIMIT, LIMIT), z = clamp(from.z + rr(-25, 25), -LIMIT, LIMIT);
    const h = T.h(x, z), reef = T.reef(x, z);
    let score: number;
    if (want === 'graze') score = loc.grass && oc.grassTex ? loc.grass(x, z) + 0.1 * reef : reef;
    else score = reef * Math.min(1, T.slope(x, z) + 0.3);   // a ledge or coral head to lean against
    if (h > -2.5) score *= 0.2;
    if (score > bs) { bs = score; best = new THREE.Vector3(x, h, z); }
  }
  return best!;
}

export function updateTurtles(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const T = oc.T;
  const act = activity('day', env);
  for (const t of oc.turtles) {
    t.t += dt; t.stateT = (t.stateT || 0) + dt;
    const dx = t.pos.x - cam.x, dz = t.pos.z - cam.z;
    if (!t.placed || dx * dx + dz * dz > 75 * 75) relocate(t, T, cam, fx, fz);
    const fh = T.top(t.pos.x, t.pos.z);
    const sleepy = act < 0.35;

    // state transitions
    if (t.state === 'breathe') { if (t.pos.y > -1.0) { t.state = sleepy ? 'toRest' : 'travel'; t.stateT = 0; } }
    else if ((t.air = (t.air ?? rr(60, 200)) - dt) < 0) { t.state = 'breathe'; t.stateT = 0; t.air = sleepy ? rr(300, 480) : rr(150, 260); logEvent(env, 'breathe', 'ウミガメが息継ぎに浮上していく', t.pos.x, t.pos.z); }
    else if (sleepy && (t.state === 'travel' || t.state === 'graze')) { t.state = 'toRest'; t.goal = pickGoal(oc, t.pos, 'rest'); t.stateT = 0; }
    else if (!sleepy && (t.state === 'rest' || t.state === 'toRest')) { t.state = 'travel'; t.goal = null; t.stateT = 0; }
    else if (t.state === 'travel' && !t.goal) t.goal = pickGoal(oc, t.pos, 'graze');

    let speed = 0.35, ty = Math.min(fh + 1.4 + Math.sin(t.t * 0.2) * 0.6, -1.2), stroke = 1, noseDown = 0;
    if (t.state === 'breathe') { ty = -0.6; speed = 0.3; }
    else if (t.goal && (t.state === 'travel' || t.state === 'toRest')) {
      const gx = t.goal.x - t.pos.x, gz = t.goal.z - t.pos.z, gd = Math.hypot(gx, gz);
      let d = Math.atan2(gz, gx) - t.head; d = Math.atan2(Math.sin(d), Math.cos(d));
      t.head += d * Math.min(1, dt * 0.5);
      if (gd < 2.0) {
        t.state = t.state === 'toRest' ? 'rest' : 'graze'; t.stateT = 0;
        if (t.state === 'rest') logEvent(env, 'rest', 'ウミガメが岩陰で眠りについた', t.pos.x, t.pos.z);
      }
    }
    if (t.state === 'graze') {
      speed = 0.08; ty = fh + 0.45; noseDown = 0.45; stroke = 0.35;
      t.head += Math.sin(t.t * 0.3) * 0.15 * dt;
      if (t.stateT > (t.grazeFor ??= rr(30, 60))) { t.grazeFor = undefined; t.state = 'travel'; t.goal = pickGoal(oc, t.pos, 'graze'); t.stateT = 0; }
    } else if (t.state === 'rest') { speed = 0; ty = fh + 0.18; stroke = 0.05; }
    else t.head += Math.sin(t.t * 0.11 + t.size * 10) * 0.12 * dt;
    if (Math.abs(t.pos.x) > LIMIT || Math.abs(t.pos.z) > LIMIT) { let d = Math.atan2(-t.pos.z, -t.pos.x) - t.head; d = Math.atan2(Math.sin(d), Math.cos(d)); t.head += d * dt; }

    // look ahead and rise over rocks and coral instead of ploughing into them
    if (t.state !== 'rest' && t.state !== 'graze') {
      const ahead = T.top(t.pos.x + Math.cos(t.head) * 1.8 * t.size, t.pos.z + Math.sin(t.head) * 1.8 * t.size);
      ty = Math.max(ty, ahead + 0.6 * t.size);
    }
    const beat = Math.max(0, Math.sin(t.t * 1.0));
    const sp = speed * (0.6 + beat * 0.8);
    const vy = clamp((ty - t.pos.y) * 0.5, -0.35, 0.5);
    t.vel.lerp(_w.set(Math.cos(t.head) * sp, vy, Math.sin(t.head) * sp), Math.min(1, dt * 1.5));
    const away = _w.set(t.pos.x - cam.x, 0, t.pos.z - cam.z), ad = away.length();
    if (ad < 2.5 && t.state !== 'rest') t.vel.addScaledVector(away, (2.5 - ad) * 0.3 / Math.max(ad, 0.1));
    t.pos.addScaledVector(t.vel, dt);
    t.pos.y = Math.max(t.pos.y, fh + 0.15 + 0.2 * t.size);
    t.group.position.copy(t.pos);
    const hs = Math.hypot(t.vel.x, t.vel.z);
    const yaw = hs > 0.02 ? Math.atan2(t.vel.x, t.vel.z) : t.group.rotation.y;
    t.group.rotation.set(-Math.atan2(t.vel.y, Math.max(hs, 0.05)) * (hs > 0.05 ? 1 : 0) + noseDown * (0.6 + 0.4 * Math.sin(t.t * 0.8)), yaw, Math.sin(t.t * 0.5) * 0.06 * stroke, 'YXZ');
    const f = Math.sin(t.t * 1.0) * 0.75 * stroke, sw = Math.sin(t.t * 1.0 - 1.2) * 0.45 * stroke;
    t.fr.rotation.set(0, sw, f); t.fl.rotation.set(0, -sw, -f);
    const r = Math.sin(t.t * 0.8) * 0.2 * Math.max(stroke, 0.2);
    t.br.rotation.set(0, 0, r); t.bl.rotation.set(0, 0, -r);
  }
}

export function updateMantas(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const T = oc.T;
  const feeding = env.night > 0.5;
  for (const m of oc.mantas) {
    m.t += dt;
    const dx = m.st.x - cam.x, dz = m.st.z - cam.z;
    if (!m.placed || dx * dx + dz * dz > 85 * 85 || m.feeding !== feeding) {
      // by day: a reef top (cleaning station); by night: the richest plankton nearby
      let best: [number, number] = [cam.x, cam.z], bs = -Infinity;
      for (let k = 0; k < 30; k++) {
        const d = m.placed && m.feeding === feeding ? rr(35, 50) : rr(14, 30), lat = (R() * 2 - 1) * 20;
        const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT);
        const s = feeding ? env.plankton.sample(x, z) : T.h(x, z);
        if (s > bs) { bs = s; best = [x, z]; }
      }
      m.st.set(best[0], 0, best[1]);
      m.y = feeding ? -3 : Math.min(T.h(best[0], best[1]) + rr(4, 7), -3);
      m.rad = feeding ? rr(5, 8) : rr(10, 16);
      if (m.placed && m.feeding !== feeding && feeding) logEvent(env, 'manta', 'マンタがプランクトンを食べに浅場へ上がってきた', m.st.x, m.st.z);
      m.feeding = feeding; m.placed = true;
    }
    const w = 1.25 / m.rad;
    m.a += dt * w * m.dir;
    const px = m.st.x + Math.cos(m.a) * m.rad, pz = m.st.z + Math.sin(m.a) * m.rad;
    const fh = T.top(px, pz);
    const ty = Math.min(Math.max(m.y + Math.sin(m.t * 0.15) * (feeding ? 0.8 : 2), fh + 2.5), -2.5);
    m.pos.y += (ty - m.pos.y) * Math.min(1, dt * 0.5);
    m.pos.x = px; m.pos.z = pz;
    if (feeding) env.plankton.consume(px, pz, 0.002 * dt);
    const tx = -Math.sin(m.a) * m.dir, tz = Math.cos(m.a) * m.dir;
    m.mesh.position.copy(m.pos);
    m.mesh.rotation.set(-0.05 + Math.sin(m.t * 0.3) * 0.05, Math.atan2(tx, tz), (feeding ? 0.55 : 0.32) * m.dir, 'YXZ');
    if (!m.init) { m.init = true; m.pos.y = ty; }
  }
}
