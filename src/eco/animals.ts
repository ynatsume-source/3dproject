// Turtles and mantas with daily routines.
// Turtles: forage by day (green turtles graze seagrass where there is any, otherwise reef algae),
// sleep wedged against the reef at night, and rise to breathe now and then.
// Mantas: circle a cleaning station by day; after dark they feed where plankton is thickest.
import * as THREE from 'three';
import { clamp, R, rr } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { zx, zz, outZone, toZone } from '../ocean/zone';
import { activity, logEvent, oneOf, type Env } from './env';

const _w = new THREE.Vector3();

function relocate(t: any, T: any, cam: THREE.Vector3, fx: number, fz: number) {
  for (let k = 0; k < 24; k++) {
    const d = t.placed ? rr(34, 48) : rr(12, 36), lat = (R() * 2 - 1) * 18;
    t.pos.set(zx(cam.x + fx * d - fz * lat), 0, zz(cam.z + fz * d + fx * lat));
    if (T.wet(t.pos.x, t.pos.z, 1.8)) break;
  }
  t.pos.y = T.top(t.pos.x, t.pos.z) + rr(1, 3);
  t.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(1, 2.2);
  t.placed = true; t.state = 'travel'; t.goal = null; t.stateT = 0; t.yaw = undefined; t.pitch = undefined;
}

// a spot near the turtle suited to what it wants to do
function pickGoal(oc: any, from: THREE.Vector3, want: 'graze' | 'rest'): THREE.Vector3 {
  const T = oc.T, loc = oc.loc;
  let best: THREE.Vector3 | null = null, bs = -1;
  for (let k = 0; k < 24; k++) {
    const x = zx(from.x + rr(-25, 25)), z = zz(from.z + rr(-25, 25));
    const h = T.h(x, z), reef = T.reef(x, z);
    let score: number;
    if (want === 'graze') score = loc.grass && oc.grassTex ? loc.grass(x, z) + 0.1 * reef : reef;
    else score = reef * Math.min(1, T.slope(x, z) + 0.3);   // a ledge or coral head to lean against
    if (h > -2.5) score *= 0.2;
    if (h > -1.2) score = -1;
    if (score > bs) { bs = score; best = new THREE.Vector3(x, h, z); }
  }
  return best!;
}

let shadeTex: THREE.Texture | undefined;
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
    else if ((t.air = (t.air ?? rr(60, 200)) - dt) < 0) { t.state = 'breathe'; t.stateT = 0; t.air = sleepy ? rr(300, 480) : rr(150, 260); logEvent(env, 'breathe', env.night > 0.5 ? oneOf(['暗い水の中を、ウミガメが息継ぎに上がっていく', 'ウミガメが寝床を離れて、そっと水面へ', '月明かりの水面へ、ウミガメが息を吸いに上がる', 'ウミガメが眠りの途中で、ひと息つきに浮上していく'])
      : oneOf(['ウミガメが息継ぎに浮上していく', 'ウミガメがゆっくりと水面へ。そろそろ息継ぎの時間らしい', 'ウミガメが光の差す水面へ泳ぎ上がっていく', 'ウミガメが前ヒレを大きくかいて、水面へ向かう', 'ウミガメがひと息つきに、まっすぐ上へ']), t.pos.x, t.pos.z, () => t.pos); }
    else if (sleepy && (t.state === 'travel' || t.state === 'graze')) { t.state = 'toRest'; t.goal = pickGoal(oc, t.pos, 'rest'); t.stateT = 0; }
    else if (!sleepy && (t.state === 'rest' || t.state === 'toRest')) { t.state = 'travel'; t.goal = null; t.stateT = 0; }
    else if (t.state === 'travel' && !t.goal) t.goal = pickGoal(oc, t.pos, 'graze');

    // something coming too close (the drone): startled, it turns away and drives off with hard, quick
    // strokes of the fore flippers, each one surging it on, then eases back to its own pace once clear
    const cdx = t.pos.x - cam.x, cdy = t.pos.y - cam.y, cdz = t.pos.z - cam.z, cd = Math.hypot(cdx, cdy, cdz) / t.size;
    const near = (t.state === 'rest' ? 1.4 : t.state === 'graze' ? 2.2 : 3.0) * Math.max(0.5, env.shy);
    // (only something in the water with it)
    if (cd < near && cam.y < 0.3) { if ((t.alarm ?? 0) < 0.3) t.fleeH = Math.atan2(cdz, cdx) + rr(-0.5, 0.5); t.alarm = Math.min(1, (t.alarm ?? 0) + dt * 3); if (t.state === 'rest' || t.state === 'graze') { t.state = 'travel'; t.goal = null; t.stateT = 0; } }
    else t.alarm = Math.max(0, (t.alarm ?? 0) - dt * (cd > near * 2.5 ? 0.35 : 0.12));
    const alarm = t.alarm ?? 0;
    let speed = 0.35, ty = Math.min(fh + 1.4 + Math.sin(t.t * 0.2) * 0.6, -1.2), stroke = 1, noseDown = 0;
    if (t.state === 'breathe') { ty = -0.6; speed = 0.3; }
    else if (t.goal && (t.state === 'travel' || t.state === 'toRest')) {
      const gx = t.goal.x - t.pos.x, gz = t.goal.z - t.pos.z, gd = Math.hypot(gx, gz);
      let d = Math.atan2(gz, gx) - t.head; d = Math.atan2(Math.sin(d), Math.cos(d));
      t.head += d * Math.min(1, dt * 0.5);
      if (gd < 2.0) {
        t.state = t.state === 'toRest' ? 'rest' : 'graze'; t.stateT = 0;
        if (t.state === 'rest') logEvent(env, 'rest', env.night > 0.5 ? oneOf(['ウミガメが岩陰で眠りについた', 'ウミガメが岩の下にもぐり込み、今夜の寝床に落ち着いた', 'ウミガメが甲羅を岩に預けて、静かに目を閉じた', 'ウミガメがいつもの寝床に戻ってきた'])
          : oneOf(['ウミガメがサンゴの張り出しの下で、ひと休みをはじめた', 'ウミガメが岩のくぼみに体を収めて、じっと休んでいる', 'ウミガメが根の陰でうとうとしはじめた']), t.pos.x, t.pos.z, () => t.pos);
      }
    }
    if (t.state === 'graze') {
      speed = 0.08; ty = fh + 0.45; noseDown = 0.45; stroke = 0.35;
      t.head += Math.sin(t.t * 0.3) * 0.15 * dt;
      if (t.stateT > (t.grazeFor ??= rr(30, 60))) { t.grazeFor = undefined; t.state = 'travel'; t.goal = pickGoal(oc, t.pos, 'graze'); t.stateT = 0; }
    } else if (t.state === 'rest') {
      // lying on the bottom: the shell on the sand (or the ledge), tilted with it, as low as its belly allows
      speed = 0; stroke = 0.05;
      const fw = Math.sin(t.yaw ?? 0), fz2 = Math.cos(t.yaw ?? 0), e = 0.3 * t.size;
      // (the tilt from the lie of the sea floor itself, gently: the reef's own lumps and ledges are steps it nestles against, not slopes to lie along)
      // (the tilt of what it lies on, gently; where the bottom steps up or down at its side — a ledge it has
      // nestled against — it lies level, not along the step)
      const hf = T.top(t.pos.x + fw * e, t.pos.z + fz2 * e), hb = T.top(t.pos.x - fw * e, t.pos.z - fz2 * e);
      const hr = T.top(t.pos.x + fz2 * e, t.pos.z - fw * e), hl = T.top(t.pos.x - fz2 * e, t.pos.z + fw * e);
      const lean = (a: number, b: number) => (Math.abs(a - fh) < 0.25 * t.size && Math.abs(b - fh) < 0.25 * t.size ? clamp(Math.atan2(a - b, 2 * e), -0.2, 0.2) : 0);
      t.restY = fh + 0.065 * t.size;
      t.restPitch = lean(hb, hf); t.restRoll = lean(hr, hl);
      ty = t.restY;
    }
    else t.head += Math.sin(t.t * 0.11 + t.size * 10) * 0.12 * dt;
    if (t.state !== 'rest' && t.state !== 'graze') t.head += T.shore(t.pos.x, t.pos.z, t.head, 4, 1.1) * Math.min(1, dt * 1.5);
    if (alarm > 0.01) {
      // away from it, turning hard at first (a bank and a sweep of the flippers), climbing a little
      let d = (t.fleeH ?? t.head) - t.head; d = Math.atan2(Math.sin(d), Math.cos(d)); t.head += d * Math.min(1, dt * (0.6 + 2.4 * alarm));
      t.fleeH = Math.atan2(cdz, cdx) * 0.15 + (t.fleeH ?? t.head) * 0.85;
      // (never away into the shallows or up the beach: then off along the deeper water instead)
      const lx = t.pos.x + Math.cos(t.fleeH) * 4, lz = t.pos.z + Math.sin(t.fleeH) * 4;
      if (!T.wet(lx, lz, 1.5)) t.fleeH += T.shore(t.pos.x, t.pos.z, t.fleeH, 4, 1.5) || Math.PI * 0.5;
      speed = 0.35 + 1.5 * alarm; stroke = 1 + 0.7 * alarm; noseDown = 0; ty = Math.min(Math.max(ty, t.pos.y + 0.6 * alarm), -0.8);
    }
    if (outZone(t.pos.x, t.pos.z)) { let d = toZone(t.pos.x, t.pos.z) - t.head; d = Math.atan2(Math.sin(d), Math.cos(d)); t.head += d * dt; }

    // look ahead and rise over rocks and coral instead of ploughing into them
    if (t.state !== 'rest' && t.state !== 'graze') {
      for (const a of [1.8, 3.5, 5.5]) ty = Math.max(ty, T.top(t.pos.x + Math.cos(t.head) * a * t.size, t.pos.z + Math.sin(t.head) * a * t.size) + 0.6 * t.size);
    }
    t.ph = (t.ph ?? t.t) + dt * (1.0 + 2.2 * alarm);
    const beat = Math.max(0, Math.sin(t.ph));
    const sp = speed * (0.6 + beat * 0.8);
    const vy = clamp((ty - t.pos.y) * 0.5, -0.35, 0.5 + alarm);
    // (the power stroke drives it: when fleeing, each downstroke snaps the speed up, and it glides off between)
    const pull = Math.min(1, dt * (1.5 + alarm * 4 * beat));
    t.vel.lerp(_w.set(Math.cos(t.head) * sp, vy, Math.sin(t.head) * sp), pull);
    t.pos.addScaledVector(t.vel, dt);
    // a sea turtle stays in the sea: under the surface, and off the dry sand
    if (t.pos.y > -0.35) { t.pos.y = -0.35; if (t.vel.y > 0) t.vel.y = 0; }
    if (!T.wet(t.pos.x, t.pos.z, 0.6)) { t.pos.x -= t.vel.x * dt * 1.5; t.pos.z -= t.vel.z * dt * 1.5; t.head += Math.PI * dt; }
    // keep off the reef, but ease up over a sudden coral edge rather than popping onto it
    t.restK = (t.restK ?? 0) + ((t.state === 'rest' && alarm < 0.01 ? 1 : 0) - (t.restK ?? 0)) * Math.min(1, dt * 0.8);
    const minY = t.state === 'rest' && alarm < 0.01 ? t.restY - 0.03 : fh + 0.15 + 0.2 * t.size;   // (resting, it may lie right down on it)
    if (t.pos.y < minY) { t.pos.y += Math.min((minY - t.pos.y) * dt * 3, 0.6 * dt); t.vel.y = Math.max(t.vel.y, 0.2); t.vel.x *= 0.9; t.vel.z *= 0.9; }
    t.group.position.copy(t.pos);
    // orientation follows the swim direction through a slow turn rate, and the swim speed only fades the
    // pitch in and out, so a pause or a nudge never flips the body round in a frame
    const hs = Math.hypot(t.vel.x, t.vel.z), mov = clamp((hs - 0.01) / 0.08, 0, 1);
    const yawT = hs > 0.005 ? Math.atan2(t.vel.x, t.vel.z) : (t.yaw ?? Math.PI / 2 - t.head);
    t.yaw ??= yawT;
    let dy = yawT - t.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    t.yaw += clamp(dy, -1, 1) * Math.min(1, dt * (0.4 + 1.6 * mov));
    const pitchT = -Math.atan2(t.vel.y, Math.max(hs, 0.08)) * mov + noseDown * (0.6 + 0.4 * Math.sin(t.t * 0.8));
    t.pitch = (t.pitch ?? pitchT) + (pitchT - (t.pitch ?? pitchT)) * Math.min(1, dt * 1.5);
    const rk = t.restK ?? 0;
    t.group.rotation.set(t.pitch * (1 - rk) + (t.restPitch ?? 0) * rk, t.yaw, (Math.sin(t.t * 0.5) * 0.06 * stroke + clamp(dy, -0.6, 0.6) * 0.5 * alarm) * (1 - rk) + (t.restRoll ?? 0) * rk, 'YXZ');   // (banking into the turn away; lying with the bottom at rest)
    const f = Math.sin(t.ph) * 0.75 * Math.min(stroke, 1.45), sw = Math.sin(t.ph - 1.2) * 0.45 * stroke;
    // the fore flippers flap like wings and feather (twist) through the stroke
    const fe = Math.cos(t.ph) * 0.35 * stroke;
    // (at rest the flippers lie on the sand)
    t.fr.rotation.set(fe, sw, f - 0.16 * rk, 'YZX'); t.fl.rotation.set(fe, -sw, -f + 0.16 * rk, 'YZX');
    const r = Math.sin(t.ph * 0.8) * 0.2 * Math.max(stroke, 0.2) * (1 - rk * 0.8);
    t.br.rotation.set(0, 0, r - 0.12 * rk); t.bl.rotation.set(0, 0, -r + 0.12 * rk);
    // and a soft shade on the sand beneath it (the water casts none of its own)
    if (typeof document !== 'undefined') {
      if (!t.shade) {
        shadeTex ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
        t.shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.3), new THREE.MeshBasicMaterial({ color: 0x0a1a18, alphaMap: shadeTex, transparent: true, opacity: 0, depthWrite: false }));
        t.shade.renderOrder = 1; t.group.parent?.add(t.shade);
      }
      t.shade.visible = rk > 0.05;
      if (t.shade.visible) { t.shade.position.set(t.pos.x, fh + 0.02, t.pos.z); t.shade.rotation.set(-Math.PI / 2, 0, t.yaw); t.shade.scale.setScalar(t.size * 0.9); t.shade.material.opacity = 0.3 * rk; }
    }
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
        const x = zx(cam.x + fx * d - fz * lat), z = zz(cam.z + fz * d + fx * lat);
        const s = (feeding ? env.plankton.sample(x, z) : T.h(x, z)) - (T.wet(x, z, 5) || !oc.loc.land ? 0 : 1e6);   // by an island, mantas need room below them
        if (s > bs) { bs = s; best = [x, z]; }
      }
      m.st.set(best[0], 0, best[1]);
      m.rad = feeding ? rr(5, 8) : rr(10, 16);
      // one steady height for the whole loop, clear of the tallest thing under it: mantas glide over the
      // reef rather than following its every bump
      let top = -1e9;
      for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; for (const r of [m.rad - 2.5, m.rad, m.rad + 2.5]) top = Math.max(top, T.top(best[0] + Math.cos(a) * r, best[1] + Math.sin(a) * r)); }
      m.y = feeding ? Math.max(-3, Math.min(top + 2.6, -2.5)) : Math.min(Math.max(T.h(best[0], best[1]) + rr(4, 7), top + 2.8), -2.5);
      if (m.placed && m.feeding !== feeding && feeding) logEvent(env, 'manta', oneOf(['マンタがプランクトンを食べに浅場へ上がってきた', 'マンタが口を大きく開けて、流れの中でプランクトンを濾しはじめた', 'マンタが浅場で輪を描きながら、プランクトンを食べている', '潮に乗ってプランクトンが集まり、マンタがやってきた']), m.st.x, m.st.z, () => m.pos);
      m.feeding = feeding; m.placed = true;
    }
    const w = 1.25 / m.rad;
    m.a += dt * w * m.dir;
    const px = m.st.x + Math.cos(m.a) * m.rad, pz = m.st.z + Math.sin(m.a) * m.rad;
    const ty = Math.min(m.y + Math.sin(m.t * 0.15) * (feeding ? 0.5 : 1.2), -2.5);
    const vy = (ty - m.pos.y) * Math.min(1, dt * 0.3);
    m.pos.y += vy;
    m.pos.x = px; m.pos.z = pz;
    if (feeding) env.plankton.consume(px, pz, 0.002 * dt);
    const tx = -Math.sin(m.a) * m.dir, tz = Math.cos(m.a) * m.dir;
    // feeding: cephalic fins unrolled and mouth open; now and then a somersault through the plankton
    const U = (m.mesh.material as THREE.ShaderMaterial).uniforms;
    U.uFeed.value += ((feeding ? 1 : 0) - U.uFeed.value) * Math.min(1, dt * 0.4);
    U.uBeat.value = feeding ? 0.85 : 1.05;
    m.flip = (m.flip ?? -1);
    if (feeding && m.flip < 0 && R() < dt / 25) m.flip = 0;
    let loop = 0;
    if (m.flip >= 0) { m.flip += dt / 7; if (m.flip >= 1) m.flip = -1; else loop = m.flip; }
    const back = loop > 0 ? Math.sin(loop * Math.PI * 2) : 0, lift = loop > 0 ? (1 - Math.cos(loop * Math.PI * 2)) * 1.3 : 0;
    m.mesh.position.copy(m.pos);
    m.mesh.position.y += lift; m.mesh.position.x -= tx * back * 1.3; m.mesh.position.z -= tz * back * 1.3;
    m.mesh.rotation.set(-0.05 + Math.sin(m.t * 0.3) * 0.05 - Math.atan2(vy / Math.max(dt, 1e-3), 1.25) * 0.8 - loop * Math.PI * 2, Math.atan2(tx, tz), (feeding ? 0.55 : 0.32) * m.dir * (loop > 0 ? 0.2 : 1), 'YXZ');
    if (!m.init) { m.init = true; m.pos.y = ty; }
  }
}
