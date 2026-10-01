// Breaching: a humpback in its breeding season, or a manta, driving up from the deep, bursting out of the
// sea and falling back with a great splash.
//
// A humpback (13 m) comes up steeply from fifteen metres or so, accelerating, and leaves the water at
// about eight metres a second: two-thirds of its body clears the surface, it twists as it rises, and it
// falls back on its side or back. It often breaches again, two or three times, a little further on.
// A reef manta (3-4 m across) leaps flat or turning over, and comes down with a slap; mantas leap in
// runs of two to four. Each leaves a field of white foam on the water that spreads and fades over a
// minute, and a cloud of bubbles beneath it.
//
// Before each leap there are a few seconds' warning (the animal is on its way up): a subject the
// cruise can go to, so the drone is at the waterline, side on, when it comes out.
import * as THREE from 'three';
import { R, rr } from '../core/math';
import { WHALE_GEO, whaleMaterial, MANTA_GEO, mantaMaterial } from '../ocean/models';
import { logEvent, type Env, type Subject } from './env';
import { U } from '../render/common';

type Kind = 'whale' | 'manta';
export interface Foam { x: number; z: number; r: number; age: number; life: number }
interface Leap {
  kind: Kind; c: THREE.Vector3; dir: THREE.Vector3; t: number; len: number;
  vy: number; twist: number; flip: number; splashed: boolean; left: number;
  run: Run; exitAt: number; heaved: boolean; vx: number;
  // after it falls back: carried on in the water from where and how it landed (world position, speeds, attitude)
  sw?: { x: number; y: number; z: number; vy: number; sp: number; yaw: number; pitch: number; roll: number; t: number };
}
// The run up from the deep, as it is driven: each stroke of the wings (a manta) or the flukes (a whale)
// pushes, harder on the downstroke, against a drag that grows with the square of the speed, so the speed
// surges stroke by stroke; the strokes quicken as it goes, and it steepens toward the surface. A manta
// whips up in a couple of seconds with quick hard beats; a whale takes five or six, three or four huge,
// slow strokes, each heaving it on.
interface Run { x: number; y: number; v: number; pitch: number; ph: number; done: boolean }
const WARN = 7, G = 9.8;
const RUN = {
  whale: { y0: -17, v0: 1.4, p0: 0.22, pE: 1.22, T: 2.6, f0: 0.3, f1: 0.55 },
  manta: { y0: -7, v0: 1.0, p0: 0.12, pE: 0.95, T: 7.5, f0: 1.3, f1: 2.6 },
};
function runStep(r: Run, kind: Kind, vT: number, dt: number) {
  const P = RUN[kind], k = Math.min(1, r.v / vT);
  r.ph += dt * Math.PI * 2 * (P.f0 + (P.f1 - P.f0) * k);
  const push = P.T * 2 * Math.pow(Math.max(0, Math.sin(r.ph)), 2) + P.T * 0.15;   // (the power stroke, and a little glide between)
  const drag = P.T / (vT * 1.1) ** 2;
  r.v += (push - drag * r.v * r.v) * dt;
  r.pitch = P.p0 + (P.pE - P.p0) * Math.min(1, Math.max(0, (r.y - P.y0) / -P.y0)) ** 1.4;
  r.x += r.v * Math.cos(r.pitch) * dt; r.y += r.v * Math.sin(r.pitch) * dt;
  if (r.y >= 0) r.done = true;
}
// the shape of a typical run (along, depth), to check there is water for it
const newRun = (kind: Kind): Run => ({ x: 0, y: RUN[kind].y0, v: RUN[kind].v0, pitch: RUN[kind].p0, ph: 0, done: false });
const PATH = (() => {
  const out = {} as Record<Kind, [number, number][]>;
  for (const kind of ['whale', 'manta'] as Kind[]) {
    const r = newRun(kind), vT = (kind === 'whale' ? 7.9 : 5.8) / Math.sin(RUN[kind].pE), pts: [number, number][] = [];
    let n = 0; while (!r.done && n < 1200) { runStep(r, kind, vT, 1 / 60); if (n++ % 20 === 0) pts.push([r.x, r.y]); }
    out[kind] = pts.map(([x, y]) => [r.x - x, y]);   // (measured back from where it comes out)
  }
  return out;
})();

export function makeBreach(oc: any) {
  const whale = new THREE.Mesh(WHALE_GEO, whaleMaterial(0.44)); whale.visible = false; whale.frustumCulled = false; oc.group.add(whale);
  const manta = new THREE.Mesh(MANTA_GEO, mantaMaterial()); manta.visible = false; manta.frustumCulled = false; oc.group.add(manta);
  const foams: Foam[] = [];
  // what the app does with it: spray, bubbles, sound (left as nothing headless)
  const fx = {
    splash: (_x: number, _z: number, _scale: number, _r: number) => {},
    stream: (_x: number, _y: number, _z: number, _vx: number, _vz: number, _n?: number) => {},
    bubbles: (_x: number, _y: number, _z: number, _n?: number) => {},
    sound: (_big: number, _x: number, _z: number) => {},
  };
  let leap: Leap | null = null, next = rr(120, 240), series = 0;
  const _p = new THREE.Vector3(), _ax = new THREE.Vector3(), _e = new THREE.Euler();

  // where it can come out: ahead of the camera, side on to it, over water deep enough to come up from
  function place(kind: Kind, cam: THREE.Vector3, fx_: number, fz_: number, from?: THREE.Vector3, dir?: THREE.Vector3, runDir?: THREE.Vector3) {
    const T = oc.T, need = kind === 'whale' ? 9 : 3.5;
    for (let k = 0; k < 40; k++) {
      let x: number, z: number;
      if (from && dir) { const a = rr(-0.5, 0.5); x = from.x + (dir.x * Math.cos(a) - dir.z * Math.sin(a)) * rr(14, 24); z = from.z + (dir.z * Math.cos(a) + dir.x * Math.sin(a)) * rr(14, 24); }
      else { const d = kind === 'whale' ? rr(30, 42) : rr(13, 18), a = rr(-0.6, 0.6); x = cam.x + (fx_ * Math.cos(a) - fz_ * Math.sin(a)) * d; z = cam.z + (fz_ * Math.cos(a) + fx_ * Math.sin(a)) * d; }
      if (T.top(x, z) > -need) continue;
      // and deep enough under the whole run up to it, coming in along dir (or toward the camera's side)
      const d0 = runDir ?? dir ?? new THREE.Vector3(fx_, 0, fz_);
      if (PATH[kind].some(([px, py]) => T.top(x - d0.x * px, z - d0.z * px) > py * 0.5 - 1)) continue;   // (the deep start far off, in the blue, may graze the slope)
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  function begin(kind: Kind, c: THREE.Vector3, dir: THREE.Vector3, left: number) {
    const L = kind === 'whale' ? 13 : rr(3.2, 4.2), vy = kind === 'whale' ? rr(7.2, 8.6) : rr(5.2, 6.4);
    // work the run out ahead of time, so that it breaks the surface right where the camera is waiting
    const r = newRun(kind), vT = vy / Math.sin(RUN[kind].pE);
    let T = 0; while (!r.done && T < 20) { runStep(r, kind, vT, 1 / 60); T += 1 / 60; }
    const start = c.clone().addScaledVector(dir, -r.x);
    leap = { kind, c: start, dir, t: 0, len: L, vy, twist: (R() < 0.5 ? -1 : 1) * (kind === 'whale' ? rr(1.4, 2.4) : rr(0, 0.35)),
      // (now and then a somersault: mostly a flat leap and a belly-flop)
      flip: kind === 'manta' && R() < 0.12 ? (R() < 0.5 ? -1 : 1) * Math.PI * 2 : 0, splashed: false, left,
      run: newRun(kind), exitAt: WARN + T, heaved: false, vx: 0 };
    exitC.copy(c);
  }
  const exitC = new THREE.Vector3();   // where it will come out (what the camera frames)

  return {
    foams, fx,
    get leap() { return leap; },
    // to see one now (?debug)
    force(kind: Kind, cam: THREE.Vector3, fx_: number, fz_: number) {
      const h = Math.atan2(fx_, fz_) + Math.PI / 2, d = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));   // (side on to the camera)
      const c = place(kind, cam, fx_, fz_, undefined, undefined, d); if (!c) return false;
      begin(kind, c, d, kind === 'whale' ? 1 + Math.floor(R() * 3) : 2 + Math.floor(R() * 2)); return true;
    },
    update(dt: number, env: Env, cam: THREE.Vector3, fx_: number, fz_: number, whaleSeason: boolean) {
      for (let i = foams.length - 1; i >= 0; i--) { const f = foams[i]; f.age += dt; if (f.age > f.life) foams.splice(i, 1); }
      if (!leap) {
        whale.visible = manta.visible = false;
        if ((next -= dt) > 0) return;
        // (a dark night, no moon to speak of: a leap no one could see; not now)
        if (env.night > 0.6 && U.uMoonIllum.value * Math.max(0, U.uAirMoon.value.y) < 0.25) { next = 60; return; }
        const can: Kind[] = [];
        if (whaleSeason) can.push('whale', 'whale');
        if (oc.loc.animals?.manta) can.push('manta');
        if (!can.length) { next = 600; return; }
        const kind = can[Math.floor(R() * can.length)];
        if (!this.force(kind, cam, fx_, fz_)) { next = 30; return; }
        series = 0;
        return;
      }
      const l = leap, L = l.len, mesh = l.kind === 'whale' ? whale : manta, run = l.run, P = RUN[l.kind];
      l.t += dt;
      const s = l.t - WARN;                 // seconds since it started up for the surface
      const up = l.t - l.exitAt;            // seconds since it broke the surface
      const airT = 2 * l.vy / G, vT = l.vy / Math.sin(P.pE);
      let y: number, pitch: number, roll = 0, along: number, beat = 1, ph = 0;
      if (s < 0) {
        // waiting deep, unseen, cruising slowly with lazy strokes
        run.ph += dt * Math.PI * 2 * P.f0 * 0.6;
        y = P.y0; pitch = P.p0; along = s * 1.2; ph = run.ph; beat = 0.8;
      } else if (!run.done) {
        // the run up, driven stroke by stroke (in the same small steps it was worked out in)
        for (let k = 0, n = Math.max(1, Math.round(dt * 60)); k < n && !run.done; k++) runStep(run, l.kind, vT, dt / n);
        y = run.y; along = run.x; ph = run.ph; beat = 1 + 1.4 * Math.min(1, run.v / vT);
        pitch = run.pitch + (l.kind === 'whale' ? 0.05 : 0.03) * Math.sin(run.ph + 1.2);   // (the body nods with each stroke)
        // the water it drives back: bubbles shed from the wingtips or the flukes on each power stroke
        if (Math.sin(run.ph) > 0.6 && R() < dt * (l.kind === 'whale' ? 40 : 25)) {
          const back = l.kind === 'whale' ? L * 0.45 : L * 0.25, side = l.kind === 'manta' ? (R() < 0.5 ? -1 : 1) * L * 0.45 : 0;
          fx.bubbles(l.c.x + l.dir.x * (along - back * Math.cos(pitch)) - l.dir.z * side, y - back * Math.sin(pitch), l.c.z + l.dir.z * (along - back * Math.cos(pitch)) + l.dir.x * side, l.kind === 'whale' ? 6 : 3);
        }
        // a whale coming up shoves a mound of water ahead of it: the surface heaves and goes pale just before
        if (l.kind === 'whale' && !l.heaved && run.y > -4) { l.heaved = true; foams.push({ x: l.c.x + l.dir.x * (run.x + 2), z: l.c.z + l.dir.z * (run.x + 2), r: L * 0.35, age: 0, life: 4 }); }
        if (run.done) { l.exitAt = l.t; l.vx = run.v * Math.cos(run.pitch); l.vy = Math.min(l.vy * 1.1, Math.max(l.vy * 0.75, run.v * Math.sin(run.pitch))); }
      } else if (!l.sw) {
        // out: thrown up and falling back, turning over as it goes (still carried on along its line)
        const k = Math.min(1.1, up / airT);
        y = l.vy * up - 0.5 * G * up * up; along = run.x + up * Math.min(l.vx, 3);
        pitch = l.kind === 'whale' ? P.pE + 0.85 * k : P.pE - 0.3 - 0.7 * k + l.flip * Math.min(1, k);
        roll = l.twist * Math.min(1, k); ph = run.ph; beat = 0.3;
      } else {
        // back in: the water stops it hard; it rolls upright and levels out, and swims on — a few strong
        // strokes, a little way down, then easing back up toward the surface, on its way
        const w = l.sw, u = (w.t += dt);
        // (drag; then settling a few metres down; then, its show over, diving away into the blue)
        const want = u < 7 ? -L * 0.25 : -Math.min(L * 1.2, L * 0.25 + (u - 7) * 1.1);
        w.vy += (-w.vy * 2.2 + (u < 1.5 ? -0.6 : (want - w.y) * 0.3)) * dt;
        w.y += w.vy * dt;
        if (u >= 7) w.pitch += (-0.22 - w.pitch) * Math.min(1, dt * 0.5);   // (nose down, going)
        w.sp += ((l.kind === 'whale' ? 1.8 : 1.4) - w.sp) * Math.min(1, dt * 0.6);
        const ka = 1 - Math.exp(-dt * 1.1);
        w.roll += (Math.round(w.roll / (Math.PI * 2)) * Math.PI * 2 - w.roll) * ka;
        if (u < 7) w.pitch += ((u < 3 ? -0.15 : 0.05) - w.pitch) * ka;
        w.x += Math.sin(w.yaw) * w.sp * dt; w.z += Math.cos(w.yaw) * w.sp * dt;
        y = w.y; pitch = w.pitch; roll = w.roll; along = 0;
        run.ph += dt * Math.PI * 2 * P.f0 * (u < 4 ? 1.4 : 1); ph = run.ph; beat = u < 4 ? 1.6 : 1;
      }
      // the stroke itself, on the model: a manta's wings driven by our phase and beaten harder as it pushes;
      // a whale's flukes swept in a bigger arc
      const um = (mesh.material as THREE.ShaderMaterial).uniforms;
      if (l.kind === 'manta') { um.uBeat.value = 0; um.uPhase.value = ph; um.uAmp.value = beat; }
      else { um.uPhase.value = ph - U.uTime.value * 1.6; um.uStroke.value = 0.8 * beat * 1.2; }
      const cx = l.sw ? l.sw.x : l.c.x + l.dir.x * along, cz = l.sw ? l.sw.z : l.c.z + l.dir.z * along;
      _e.set(-pitch, l.sw ? l.sw.yaw : Math.atan2(l.dir.x, l.dir.z), roll, 'YXZ');
      mesh.position.set(cx, y, cz); mesh.rotation.copy(_e);
      if (l.kind === 'whale') mesh.scale.setScalar(L); else mesh.scale.setScalar(L / 2);
      mesh.visible = s > -2;
      // out of the water: water pouring off it
      if (up > 0 && up < airT) for (let k = 0; k < 3; k++) {
        _ax.set(0, 0, (Math.random() - 0.5) * L * 0.9).applyEuler(_e); _p.set(cx, y, cz).add(_ax);
        if (_p.y > 0.2) fx.stream(_p.x, _p.y, _p.z, l.dir.x * 2, l.dir.z * 2, l.kind === 'whale' ? 3 : 1);
      }
      if (up > 0 && up - dt <= 0) fx.splash(cx, cz, l.kind === 'whale' ? 0.45 : 0.12, L * 0.15);   // (breaking out: spray, and the sound of the water tearing, quietly)
      if (!l.splashed && up > airT * 0.5 && y <= L * 0.04) {
        // the moment it comes down: carry on from here, as it is, in the water
        l.splashed = true;
        let yaw = Math.atan2(l.dir.x, l.dir.z), pp = pitch, rr0 = roll;
        // (fallen back past upright, on its back: the same attitude is facing the other way, belly up — it rights itself from that)
        if (pp > Math.PI / 2) { yaw += Math.PI; pp = Math.PI - pp; rr0 += Math.PI; }
        l.sw = { x: cx, y, z: cz, vy: -(G * (up) - l.vy) * 0.6, sp: Math.min(l.vx, 3), yaw, pitch: pp, roll: rr0, t: 0 };
        const big = l.kind === 'whale' ? 1 : 0.32;
        fx.splash(cx, cz, big, L * 0.3); fx.sound(big, cx, cz);
        foams.push({ x: cx, z: cz, r: L * 0.55, age: 0, life: l.kind === 'whale' ? 70 : 35 });
        logEvent(env, 'breach', l.kind === 'whale' ? (series === 0 ? 'ザトウクジラが海面から跳び上がった！ 巨体がしぶきの柱を上げて落ちる' : 'ザトウクジラがまた跳んだ') : (series === 0 ? 'マンタが海面から跳ねた！' : 'マンタがまた跳ねた'), cx, cz, () => null);
      }
      // its show over and on its way down into the blue: gone (or up for the next leap) only once it is far
      // off or out of the picture, never in front of the camera
      const fwd = U.uCamFwd.value as THREE.Vector3, dx = cx - cam.x, dy = y - cam.y, dz = cz - cam.z, dd = Math.hypot(dx, dy, dz);
      if (up > airT + (l.kind === 'whale' ? 22 : 12) && (dd > 70 || dx * fwd.x + dy * fwd.y + dz * fwd.z < dd * 0.25)) {
        series++;
        if (l.left > 1) { const c = place(l.kind, cam, fx_, fz_, new THREE.Vector3(cx, 0, cz), l.dir); if (c) { begin(l.kind, c, l.dir, l.left - 1); leap!.t = WARN - (l.kind === 'whale' ? rr(10, 16) : rr(3, 6)); return; } }
        leap = null; next = l.kind === 'whale' ? rr(240, 420) : rr(420, 720);
      }
    },
    subjects(out: Subject[]) {
      const l = leap; if (!l) return;
      const up = l.t - l.exitAt, airT = 2 * l.vy / G;
      if (up > airT + (l.kind === 'whale' ? 8 : 5)) return;
      const whaleNow = l.kind === 'whale';
      out.push({ key: 'breach', label: whaleNow ? 'ザトウクジラのブリーチ' : 'マンタのジャンプ', kind: 'giant', prio: 9, size: l.len, reach: 160, hold: 26,
        pos: () => exitC, live: () => leap === l, status: () => (up < 0 ? '深みから一気に浮上してくる' : up < airT ? '海面から跳び上がった！' : '大きな水しぶきを上げて着水した'),
        breach: { dist: whaleNow ? 24 : 10, h: whaleNow ? 6 : 1.5, dir: l.dir } });
    },
  };
}
export type Breach = ReturnType<typeof makeBreach>;
