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

type Kind = 'whale' | 'manta';
export interface Foam { x: number; z: number; r: number; age: number; life: number }
interface Leap {
  kind: Kind; c: THREE.Vector3; dir: THREE.Vector3; t: number; len: number;
  vy: number; twist: number; flip: number; splashed: boolean; left: number;
}
const WARN = 7, RISE = 3.2, G = 9.8;

export function makeBreach(oc: any) {
  const whale = new THREE.Mesh(WHALE_GEO, whaleMaterial(0.44)); whale.visible = false; whale.frustumCulled = false; oc.group.add(whale);
  const manta = new THREE.Mesh(MANTA_GEO, mantaMaterial()); manta.visible = false; manta.frustumCulled = false; oc.group.add(manta);
  const foams: Foam[] = [];
  // what the app does with it: spray, bubbles, sound (left as nothing headless)
  const fx = {
    splash: (_x: number, _z: number, _scale: number, _r: number) => {},
    stream: (_x: number, _y: number, _z: number, _vx: number, _vz: number, _n?: number) => {},
    sound: (_big: number, _x: number, _z: number) => {},
  };
  let leap: Leap | null = null, next = rr(120, 240), series = 0;
  const _p = new THREE.Vector3(), _ax = new THREE.Vector3(), _e = new THREE.Euler();

  // where it can come out: ahead of the camera, side on to it, over water deep enough to come up from
  function place(kind: Kind, cam: THREE.Vector3, fx_: number, fz_: number, from?: THREE.Vector3, dir?: THREE.Vector3) {
    const T = oc.T, need = kind === 'whale' ? 9 : 3.5;
    for (let k = 0; k < 40; k++) {
      let x: number, z: number;
      if (from && dir) { const a = rr(-0.5, 0.5); x = from.x + (dir.x * Math.cos(a) - dir.z * Math.sin(a)) * rr(14, 24); z = from.z + (dir.z * Math.cos(a) + dir.x * Math.sin(a)) * rr(14, 24); }
      else { const d = kind === 'whale' ? rr(30, 42) : rr(13, 18), a = rr(-0.6, 0.6); x = cam.x + (fx_ * Math.cos(a) - fz_ * Math.sin(a)) * d; z = cam.z + (fz_ * Math.cos(a) + fx_ * Math.sin(a)) * d; }
      if (T.top(x, z) > -need) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  function begin(kind: Kind, c: THREE.Vector3, dir: THREE.Vector3, left: number) {
    const L = kind === 'whale' ? 13 : rr(3.2, 4.2);
    leap = { kind, c, dir, t: 0, len: L, vy: kind === 'whale' ? rr(7.2, 8.6) : rr(5.2, 6.4), twist: (R() < 0.5 ? -1 : 1) * (kind === 'whale' ? rr(1.4, 2.4) : rr(0, 0.6)),
      flip: kind === 'manta' && R() < 0.45 ? (R() < 0.5 ? -1 : 1) * Math.PI * 2 : 0, splashed: false, left };
  }

  return {
    foams, fx,
    get leap() { return leap; },
    // to see one now (?debug)
    force(kind: Kind, cam: THREE.Vector3, fx_: number, fz_: number) {
      const c = place(kind, cam, fx_, fz_); if (!c) return false;
      const h = Math.atan2(fx_, fz_) + Math.PI / 2;   // (side on to the camera)
      begin(kind, c, new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), kind === 'whale' ? 1 + Math.floor(R() * 3) : 2 + Math.floor(R() * 3)); return true;
    },
    update(dt: number, env: Env, cam: THREE.Vector3, fx_: number, fz_: number, whaleSeason: boolean) {
      for (let i = foams.length - 1; i >= 0; i--) { const f = foams[i]; f.age += dt; if (f.age > f.life) foams.splice(i, 1); }
      if (!leap) {
        whale.visible = manta.visible = false;
        if ((next -= dt) > 0) return;
        const can: Kind[] = [];
        if (whaleSeason) can.push('whale', 'whale');
        if (oc.loc.animals?.manta) can.push('manta');
        if (!can.length) { next = 600; return; }
        const kind = can[Math.floor(R() * can.length)];
        if (!this.force(kind, cam, fx_, fz_)) { next = 30; return; }
        series = 0;
        return;
      }
      const l = leap, L = l.len, mesh = l.kind === 'whale' ? whale : manta;
      l.t += dt;
      const s = l.t - WARN;                 // seconds since it started up for the surface
      const up = s - RISE;                  // seconds since it broke the surface
      const airT = 2 * l.vy / G;
      let y: number, pitch: number, roll = 0, along: number;
      if (s < 0) {
        // on its way, deep and unseen
        y = -14; pitch = 0.3; along = -16 - (-s) * 1.5;
      } else if (up < 0) {
        // the run up: steepening, faster and faster
        const k = s / RISE, e = k * k;
        y = -14 + (14 - 0.4 * L * 0.0) * e; pitch = 0.4 + 0.75 * k; along = -16 + 14 * (1 - (1 - k) * (1 - k));
      } else if (up < airT + 0.6) {
        // out: thrown up and falling back, turning over as it goes
        const k = Math.min(1, up / airT);
        y = l.vy * up - 0.5 * G * up * up; along = -2 + up * 2.2;
        pitch = l.kind === 'whale' ? 1.15 + 0.9 * k : 0.6 - 0.7 * k + l.flip * k;
        roll = l.twist * k;
      } else {
        // under again: carried down and away by its own momentum, slowing
        const u = up - airT - 0.6;
        y = Math.max(-12, -0.5 * L * 0.2 - u * 2.2); along = -2 + (airT + 0.6) * 2.2 + u * 1.5;
        pitch = (l.kind === 'whale' ? 2.05 : 0.6 - 0.7 + l.flip) + Math.min(1.2, u * 0.4); roll = l.twist;
      }
      const cx = l.c.x + l.dir.x * along, cz = l.c.z + l.dir.z * along;
      // the body's centre is a third of its length behind the head along its axis
      _e.set(-pitch, Math.atan2(l.dir.x, l.dir.z), roll, 'YXZ');
      mesh.position.set(cx, y, cz); mesh.rotation.copy(_e);
      if (l.kind === 'whale') mesh.scale.setScalar(L); else mesh.scale.setScalar(L / 2);
      mesh.visible = s > -2;
      // out of the water: water pouring off it
      if (up > 0 && up < airT) for (let k = 0; k < 3; k++) {
        _ax.set(0, 0, (Math.random() - 0.5) * L * 0.9).applyEuler(_e); _p.set(cx, y, cz).add(_ax);
        if (_p.y > 0.2) fx.stream(_p.x, _p.y, _p.z, l.dir.x * 2, l.dir.z * 2, l.kind === 'whale' ? 3 : 1);
      }
      if (up > 0 && up - dt <= 0) { fx.splash(cx, cz, l.kind === 'whale' ? 0.45 : 0.12, L * 0.15); fx.sound(l.kind === 'whale' ? 0.5 : 0.2, cx, cz); }
      if (!l.splashed && up > airT * 0.92) {
        l.splashed = true;
        const big = l.kind === 'whale' ? 1 : 0.32;
        fx.splash(cx, cz, big, L * 0.3); fx.sound(big, cx, cz);
        foams.push({ x: cx, z: cz, r: L * 0.55, age: 0, life: l.kind === 'whale' ? 70 : 35 });
        logEvent(env, 'breach', l.kind === 'whale' ? (series === 0 ? 'ザトウクジラが海面から跳び上がった！ 巨体がしぶきの柱を上げて落ちる' : 'ザトウクジラがまた跳んだ') : (series === 0 ? 'マンタが海面から跳ねた！' : 'マンタがまた跳ねた'), cx, cz, () => null);
      }
      if (up > airT + (l.kind === 'whale' ? 9 : 6)) {
        series++;
        if (l.left > 1) { const c = place(l.kind, cam, fx_, fz_, new THREE.Vector3(cx, 0, cz), l.dir); if (c) { begin(l.kind, c, l.dir, l.left - 1); leap!.t = WARN - (l.kind === 'whale' ? rr(10, 16) : rr(3, 6)); return; } }
        leap = null; next = l.kind === 'whale' ? rr(240, 420) : rr(420, 720);
      }
    },
    subjects(out: Subject[]) {
      const l = leap; if (!l) return;
      const up = l.t - WARN - RISE, airT = 2 * l.vy / G;
      if (up > airT + (l.kind === 'whale' ? 8 : 5)) return;
      const whaleNow = l.kind === 'whale';
      out.push({ key: 'breach', label: whaleNow ? 'ザトウクジラのブリーチ' : 'マンタのジャンプ', kind: 'giant', prio: 9, size: l.len, reach: 160, hold: 26,
        pos: () => l.c, live: () => leap === l, status: () => (up < 0 ? '深みから一気に浮上してくる' : up < airT ? '海面から跳び上がった！' : '大きな水しぶきを上げて着水した'),
        breach: { dist: whaleNow ? 24 : 10, h: whaleNow ? 6 : 1.5, dir: l.dir } });
    },
  };
}
export type Breach = ReturnType<typeof makeBreach>;
