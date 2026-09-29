// Meteors over the sea. Sporadic meteors at the real background rate (a handful an hour under a dark
// sky), and the major annual showers from their real radiants around their peak dates, at the hourly
// rate an observer would see: the zenithal rate scaled by the radiant's height and by how bright a star
// the sky still shows (moonlight, twilight and cloud hide the faint ones, which are most of them).
import * as THREE from 'three';
import { mat } from '../render/common';
import { oceanScene } from './scenery';

interface Shower { ja: string; peak: [number, number]; zhr: number; ra: number; dec: number; width: number; v: number }
export const SHOWERS: Shower[] = [
  { ja: 'しぶんぎ座流星群', peak: [1, 3.8], zhr: 110, ra: 230, dec: 49, width: 0.6, v: 41 },
  { ja: '4月こと座流星群', peak: [4, 22.6], zhr: 18, ra: 271, dec: 34, width: 1.0, v: 49 },
  { ja: 'みずがめ座η流星群', peak: [5, 6], zhr: 50, ra: 338, dec: -1, width: 3.5, v: 66 },
  { ja: 'みずがめ座δ南流星群', peak: [7, 30], zhr: 25, ra: 340, dec: -16, width: 5, v: 41 },
  { ja: 'ペルセウス座流星群', peak: [8, 12.8], zhr: 100, ra: 48, dec: 58, width: 2.2, v: 59 },
  { ja: '10月りゅう座流星群', peak: [10, 8.5], zhr: 10, ra: 262, dec: 54, width: 0.5, v: 20 },
  { ja: 'オリオン座流星群', peak: [10, 21.5], zhr: 20, ra: 95, dec: 16, width: 2.5, v: 66 },
  { ja: 'しし座流星群', peak: [11, 17.5], zhr: 15, ra: 152, dec: 22, width: 1.2, v: 71 },
  { ja: 'ふたご座流星群', peak: [12, 14.3], zhr: 150, ra: 112, dec: 33, width: 1.1, v: 35 },
  { ja: 'こぐま座流星群', peak: [12, 22.4], zhr: 10, ra: 217, dec: 76, width: 0.7, v: 33 },
];
const D2R = Math.PI / 180, DAY = 86400000;

// how active each shower is at this moment (0..1, a bell around its peak)
function activity(sh: Shower, ms: number) {
  const y = new Date(ms).getUTCFullYear();
  let best = 0;
  for (const yy of [y - 1, y, y + 1]) {
    const d = (ms - Date.UTC(yy, sh.peak[0] - 1, 1) - (sh.peak[1] - 1) * DAY) / DAY;
    best = Math.max(best, Math.exp(-((d / sh.width) ** 2)));
  }
  return best;
}
export function activeShower(ms: number): { ja: string; k: number } | null {
  let best: { ja: string; k: number } | null = null;
  for (const sh of SHOWERS) { const k = activity(sh, ms) * sh.zhr; if (k > 4 && (!best || k > best.k)) best = { ja: sh.ja, k }; }
  return best;
}

// ---------- drawing ----------
const POOL = 8, R = 300;
interface Meteor { mesh: THREE.Mesh; on: boolean; t: number; dur: number; s: THREE.Vector3; e: THREE.Vector3; b: number; col: THREE.Color; train: number; len: number }
const pool: Meteor[] = [];
for (let i = 0; i < POOL; i++) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
  g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
  g.setAttribute('aV', new THREE.BufferAttribute(new Float32Array([-1, 1, -1, 1]), 1));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const m = new THREE.Mesh(g, mat(
    `attribute float aU; attribute float aV; varying float vU; varying float vV; varying vec3 vWp; void main(){ vU = aU; vV = aV; vWp = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    `uniform vec3 uCol; uniform float uB; uniform float uTrain; varying float vU; varying float vV; varying vec3 vWp;
     void main(){
       vec3 d = normalize(vWp - uCamPos);
       // a hot point at the head fading into a tapering tail; a train is only a faint, soft smear
       float w = mix(0.25 + 0.75 * vU, 1.0, uTrain);
       float across = exp(-pow(vV / w, 2.0) * (uTrain > 0.5 ? 1.5 : 5.0));
       float streak = mix(pow(vU, 3.0) + 2.5 * smoothstep(0.93, 1.0, vU), 0.05 * sin(3.14159 * vU), uTrain) * across;
       float a = streak * uB * (1.0 - cloudAt(d)) * smoothstep(0.0, 0.05, d.y);
       gl_FragColor = vec4(uCol * a, 1.0);
     }`,
    { uniforms: { uCol: { value: new THREE.Color() }, uB: { value: 0 }, uTrain: { value: 0 } }, opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } }));
  m.frustumCulled = false; m.visible = false; m.renderOrder = -0.4;
  oceanScene.add(m);
  pool.push({ mesh: m, on: false, t: 0, dur: 1, s: new THREE.Vector3(), e: new THREE.Vector3(), b: 0, col: new THREE.Color(), train: 0, len: 0 });
}

const _p = new THREE.Vector3(), _h = new THREE.Vector3(), _tl = new THREE.Vector3(), _side = new THREE.Vector3(), _q = new THREE.Vector3();
const eqDir = (ra: number, dec: number, M: THREE.Matrix3, out: THREE.Vector3) =>
  out.set(Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)).applyMatrix3(M);

let force = 0;
export function forceMeteors(n: number) { force = n; }   // debugging: the next frame launches n bright shower meteors
function launch(M: THREE.Matrix3, radiant: THREE.Vector3 | null, v: number, lm: number, name: string | null, log: (t: string) => void, magSet?: number) {
  const m = pool.find((x) => !x.on);
  if (!m) return;
  // where it appears: anywhere in the sky above ~12°
  const y = Math.sin(12 * D2R) + Math.random() * (Math.sin(75 * D2R) - Math.sin(12 * D2R)), a = Math.random() * Math.PI * 2, c = Math.sqrt(1 - y * y);
  _p.set(Math.cos(a) * c, y, Math.sin(a) * c);
  let T: THREE.Vector3, L: number;
  if (radiant) {
    // it travels away from the radiant along a great circle, shorter the nearer it is to the radiant
    const cosr = _p.dot(radiant);
    if (cosr > 0.995) return;
    T = _q.copy(_p).multiplyScalar(cosr).sub(radiant).normalize();
    L = (6 + Math.random() * 18) * D2R * Math.sqrt(1 - cosr * cosr);
  } else {
    T = _q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(_p).normalize();
    L = (4 + Math.random() * 16) * D2R;
  }
  // brightness: most are faint; each magnitude brighter is about twice as rare
  const mag = magSet ?? lm + Math.log(Math.max(Math.random(), 1e-6)) / Math.log(2.2);
  m.s.copy(_p); m.e.copy(_p).multiplyScalar(Math.cos(L)).addScaledVector(T, Math.sin(L));
  m.len = L; m.dur = (0.28 + 0.9 * (1 - (v - 20) / 52)) * (0.7 + 0.6 * Math.random());
  m.b = Math.min(3.5, Math.pow(10, -0.4 * (mag - 2.2)));
  // fast meteors burn blue-green white, slow ones yellow-orange
  m.col.setRGB(1, 1, 1).lerp(v > 50 ? new THREE.Color(0.7, 1.0, 0.85) : new THREE.Color(1.0, 0.8, 0.5), 0.35);
  m.train = mag < -1.5 ? 1 : 0;
  m.t = 0; m.on = true; m.mesh.visible = true;
  if (mag < -1) log(mag < -3 ? `${name ? name + 'の' : ''}火球が夜空を横切った` : `${name ? name + 'の' : ''}明るい流れ星`);
}

// dtSim: simulated seconds that passed (the clock may run fast); dtReal drives the streaks themselves
export function stepMeteors(dtSim: number, dtReal: number, ms: number, cam: THREE.Vector3, M: THREE.Matrix3, sky: { sunAir: number[]; moonI: number; cloud: number }, up: boolean, log: (t: string) => void) {
  // how faint a star the sky shows: a dark moonless sky ~6.5, full moon ~5, and nothing in twilight
  const sunAlt = Math.asin(sky.sunAir[1]) / D2R;
  const lm = 6.5 - 1.6 * sky.moonI - Math.max(0, (sunAlt + 18) / 6) * 1.5;
  if (up && lm > 3 && sky.cloud < 0.9) {
    const clear = 1 - sky.cloud;
    const rateOf = (hr: number) => hr * Math.pow(2.2, lm - 6.5) * clear / 3600;
    const cand: { rate: number; sh: Shower | null; R: THREE.Vector3 | null }[] = [{ rate: rateOf(7), sh: null, R: null }];
    for (const sh of SHOWERS) {
      const k = activity(sh, ms);
      if (k < 0.01) continue;
      const Rw = eqDir(sh.ra, sh.dec, M, new THREE.Vector3());
      if (Rw.y <= 0) continue;
      cand.push({ rate: rateOf(sh.zhr * k * Rw.y), sh, R: Rw });
    }
    if (force > 0) { const c = cand[cand.length - 1]; for (; force > 0; force--) launch(M, c.R, c.sh ? c.sh.v : 30, lm, c.sh ? c.sh.ja : null, log, -1 - Math.random() * 3); }
    for (const c of cand) {
      let acc = c.rate * Math.min(dtSim, 30);
      let n = 0;
      while (n < 3 && Math.random() < acc) { launch(M, c.R, c.sh ? c.sh.v : 30, lm, c.sh ? c.sh.ja : null, log); acc -= 1; n++; }
    }
  }
  for (const m of pool) {
    if (!m.on) continue;
    m.t += dtReal / m.dur;
    const U = (m.mesh.material as THREE.ShaderMaterial).uniforms;
    if (m.t >= 1 + m.train * 2.5 || !up) { m.on = false; m.mesh.visible = false; continue; }
    const head = Math.min(m.t, 1), tail = Math.max(0, head - 0.45);
    const slerp = (k: number, out: THREE.Vector3) => { const w = m.len * k; return out.copy(m.s).multiplyScalar(Math.sin(m.len - w)).addScaledVector(m.e, Math.sin(w)).divideScalar(Math.sin(m.len)); };
    slerp(head, _h); slerp(m.t > 1 ? 0 : tail, _tl);
    _side.copy(_h).sub(_tl).cross(_h).normalize().multiplyScalar(R * (m.t > 1 ? 0.0022 : 0.0014) * (1 + Math.min(m.b, 2) * 0.4));
    const P = m.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const put = (i: number, v: THREE.Vector3, s: number) => P.setXYZ(i, cam.x + v.x * R + _side.x * s, cam.y + v.y * R + _side.y * s, cam.z + v.z * R + _side.z * s);
    put(0, _tl, -1); put(1, _tl, 1); put(2, _h, -1); put(3, _h, 1);
    P.needsUpdate = true;
    // light curve: flares up, peaks late, gone; a bright one leaves a fading train
    const lc = m.t < 1 ? Math.sin(Math.PI * Math.pow(m.t, 0.8)) : 0.25 * Math.exp(-(m.t - 1) * 1.6);
    U.uB.value = m.b * lc; U.uTrain.value = m.t > 1 ? 1 : 0; (U.uCol.value as THREE.Color).copy(m.col);
  }
}
