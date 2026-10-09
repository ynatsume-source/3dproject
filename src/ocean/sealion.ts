// Galápagos sea lion (Zalophus wollebaeki), lofted from real proportions like the dolphins and the big fish: a slender
// spindle of a body deepest at the chest, a long thick neck, a dog-like head with a pointed muzzle and a stop to the
// forehead, the whisker pads; big dark eyes set forward; small rolled ear flaps (a sea lion's, which a seal lacks);
// long wing-like foreflippers, naked and black, that it swims with — sweeping down and back together like wings,
// then held to its sides to glide — and the hindflippers trailing behind as a rudder, their toes webbed with a
// scalloped edge. Head at +z, length 1 (nose to tail; the hindflippers reach beyond). aPart: 0 body, 1 foreflipper,
// 2 hindflipper, 3 eye, 4 ear, 5 whisker. Drawn by seaLionMaterial: wet fur, dark chocolate on the back, tan
// beneath, the naked flippers, a wet sheen; older ones darker and scarred. Posed in the vertex shader from aSl
// (stroke phase, stroke strength, flippers held out, body bend) and aSl2 (age, seed, head turn, head tilt).
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';

// [z, half-width, top, bottom] (fractions of the length)
const K: number[][] = [
  [0.505, 0.004, 0.008, 0.0], [0.495, 0.016, 0.02, -0.012], [0.478, 0.024, 0.028, -0.02], [0.455, 0.031, 0.036, -0.027],
  [0.435, 0.042, 0.05, -0.033], [0.41, 0.053, 0.062, -0.04], [0.385, 0.057, 0.066, -0.045], [0.36, 0.057, 0.063, -0.05],
  [0.33, 0.056, 0.057, -0.06], [0.27, 0.067, 0.062, -0.075], [0.19, 0.088, 0.077, -0.1], [0.1, 0.1, 0.084, -0.108],
  [-0.03, 0.095, 0.079, -0.097], [-0.16, 0.08, 0.067, -0.078], [-0.28, 0.058, 0.049, -0.052], [-0.38, 0.038, 0.033, -0.031],
  [-0.45, 0.023, 0.019, -0.016], [-0.5, 0.007, 0.006, -0.004],
];
function prof(z: number) {
  // (Catmull-Rom through the keys, z descending)
  let i = 0; while (i < K.length - 2 && K[i + 1][0] > z) i++;
  const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (p1[0] - z) / Math.max(p1[0] - p2[0], 1e-6))), t2 = t * t, t3 = t2 * t;
  const cr = (j: number) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
  return { w: Math.max(0.002, cr(1)), top: cr(2), bot: cr(3) };
}
export const SL_EYE = { z: 0.432, x: 0.035, y: 0.033, r: 0.0135 };
export const SL_FORE = { x: 0.068, y: -0.05, z: 0.2, len: 0.27 };
export const SL_HIND = { x: 0.022, y: -0.004, z: -0.47, len: 0.16 };

export const SEALION_GEO = (() => {
  const P: number[] = [], A: number[] = [], idx: number[] = [];
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[], part: number, flip = false, wrapV = false) => {
    const o = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { P.push(...f(i / nu, wrapV && j === nv ? 0 : j / nv)); A.push(part); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = o + i * (nv + 1) + j, b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  // the body: rings from the nose to the tail
  grid(110, 36, (u, v) => {
    const z = 0.505 - 1.005 * u, q = prof(z), a = v * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const mid = (q.top + q.bot) / 2, half = (q.top - q.bot) / 2;
    // (a rounded section, a little flatter across the back; the belly fuller)
    const y = mid + Math.sign(s) * Math.pow(Math.abs(s), 0.92) * half;
    return [Math.sign(c) * Math.pow(Math.abs(c), 0.88) * q.w, y, z];
  }, 0, true);
  // the eyes: wet domes on the sides of the head, looking forward and out
  for (const sx of [-1, 1]) {
    const n = new THREE.Vector3(sx * 0.82, 0.3, 0.48).normalize(), e1 = new THREE.Vector3(0, 1, 0).cross(n).normalize(), e2 = n.clone().cross(e1);
    grid(8, 18, (u, v) => {
      const th = u * Math.PI / 2, ph = v * Math.PI * 2, rr = Math.sin(th) * SL_EYE.r, h = Math.cos(th) * SL_EYE.r * 0.55 - SL_EYE.r * 0.2;
      return [sx * SL_EYE.x + n.x * h + (e1.x * Math.cos(ph) + e2.x * Math.sin(ph)) * rr, SL_EYE.y + n.y * h + (e1.y * Math.cos(ph) + e2.y * Math.sin(ph)) * rr, SL_EYE.z + n.z * h + (e1.z * Math.cos(ph) + e2.z * Math.sin(ph)) * rr];
    }, 3, sx < 0);
  }
  // the ears: small rolled flaps behind the eyes, pointing back and a little out
  for (const sx of [-1, 1]) grid(6, 8, (u, v) => {
    const a = v * Math.PI * 2, r = 0.0065 * (1 - u * 0.85);
    return [sx * (0.05 + 0.006 * u) + Math.cos(a) * r * 0.6, 0.05 + 0.006 * u + Math.sin(a) * r, 0.375 - 0.022 * u];
  }, 4, sx < 0);
  // the whiskers: long pale bristles fanning back from the pads
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) {
    const z0 = 0.462 + k * 0.004, y0 = 0.004 + (k % 3) * 0.006, len = 0.06 + 0.03 * Math.sin(k * 1.7) ** 2, dy = (k - 3) * 0.05 - 0.05;
    grid(4, 1, (u, v) => [sx * (0.03 + 0.028 * u + 0.005 * (1 - u * u) + u * u * 0.01), y0 + dy * len * u - 0.012 * u * u + (v - 0.5) * 0.0018 * (1 - u * 0.7), z0 - len * u * 0.85], 5, sx < 0);
  }
  // the foreflippers: long blades, thick at the leading edge, swept back and tapering to a rounded point; span along
  // +x out from the shoulder (the root buried in the flank)
  for (const sx of [-1, 1]) for (const sy of [1, -1]) grid(22, 10, (u, v) => {
    const L = SL_FORE.len, le = 0.046 - 0.055 * u, ch = 0.1 * (1 - 0.5 * u) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 4))) + 0.006;
    const z = le - ch * v, t = 0.017 * (1 - 0.65 * u) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.8 + 0.2 * v * v)), 0.7) * (1 - 0.6 * v);
    return [sx * (SL_FORE.x + u * L), SL_FORE.y + sy * t * 0.5 - 0.004 * u, SL_FORE.z + z];
  }, 1, (sx < 0) !== (sy < 0));
  // the hindflippers: paddles trailing behind, held together sole to sole, webbed toes with a scalloped edge (the
  // first and fifth toes the longest)
  for (const sx of [-1, 1]) for (const sz of [1, -1]) grid(14, 10, (u, v) => {
    const L = SL_HIND.len, w = 0.016 + 0.034 * u, yy = (v - 0.5) * 2 * w;
    const toe = Math.abs(v - 0.5) * 2, tips = 1 + 0.12 * Math.pow(toe, 2) - 0.08 * Math.pow(Math.abs(Math.sin(v * Math.PI * 4)), 0.6) * smooth01(0.85, 1, u);
    const t = 0.006 * (1 - 0.6 * u) * (1 - toe * toe * 0.7);
    return [sx * (SL_HIND.x + 0.006 * u) + sz * t, SL_HIND.y + yy - 0.01 * u, SL_HIND.z - L * u * tips];
  }, 2, (sx < 0) !== (sz < 0));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
})();
function smooth01(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Instanced: aSl (stroke phase, stroke strength 0..1, flippers held out 0..1, body bend: + curves toward +x),
// aSl2 (age 0..1, seed, head turn, head tilt (+ up)).
export function seaLionMaterial() {
  return mat(
    `attribute float aPart; attribute vec4 aSl; attribute vec4 aSl2; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vSl2;
     vec3 rx(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
     vec3 ry(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
     vec3 rz(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
     void main(){
       vec3 p = position, nl = normal; float ph = aSl.x, A = aSl.y, S = aSl.z;
       // the foreflippers: a wing's stroke — from up and out, down and back to lie along the flank, feathering — or
       // held to the sides in a glide, or out to steer and hover
       if (aPart > 0.5 && aPart < 1.5) {
         float sg = sign(p.x); vec3 pv = vec3(sg * ${SL_FORE.x.toFixed(3)}, ${SL_FORE.y.toFixed(3)}, ${SL_FORE.z.toFixed(3)});
         vec3 q = p - pv; q.x *= sg; vec3 m = nl; m.x *= sg;
         float sk = 0.5 - 0.5 * cos(ph);
         float dih = mix(mix(-0.22, -0.12, S), mix(0.45, -0.5, sk), A), swp = mix(mix(1.38, 0.35, S), mix(0.12, 1.3, sk), A), fth = mix(0.12 * S * sin(ph * 0.4), 0.6 * sin(ph), A);
         q = ry(rz(rx(q, fth), dih), swp); m = ry(rz(rx(m, fth), dih), swp);
         q.x *= sg; m.x *= sg; p = pv + q; nl = m;
       }
       // the hindflippers: trailing, a little beat with the stroke, flared apart when it hangs to look
       if (aPart > 1.5 && aPart < 2.5) {
         vec3 pv = vec3(0.0, ${SL_HIND.y.toFixed(3)}, ${SL_HIND.z.toFixed(3)}), q = p - pv;
         q = rx(q, 0.12 * sin(ph - 1.2) * A + 0.05); q = rz(q, sign(p.x) * 0.25 * S); q = ry(q, -aSl.w * 0.8);
         p = pv + q;
       }
       // the head turns and tilts on the long neck
       float hw = smoothstep(0.24, 0.38, p.z) * step(aPart, 0.5) + step(2.5, aPart);
       vec3 hp = vec3(0.0, 0.01, 0.27);
       vec3 hq = rx(ry(p - hp, aSl2.z), -aSl2.w);
       p = mix(p, hp + hq, hw); nl = mix(nl, rx(ry(nl, aSl2.z), -aSl2.w), hw);
       // the body bends into a turn, and rides the strokes a little
       p.x += aSl.w * (p.z * p.z * 1.4 - 0.04);
       p.y += sin(ph - 0.5 - p.z * 2.0) * 0.008 * A;
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nl); vL = position; vPart = aPart; vSl2 = aSl2;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vSl2;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float x = vL.x, y = vL.y, z = vL.z, age = vSl2.x, sd = vSl2.y * 13.0;
       float upp = length(fwidth(vL));
       // wet fur: dark chocolate along the back, tan beneath, a warmer brown on the muzzle; a young one greyer, an
       // old one darker; fine streaks running with the lie of the fur
       vec3 back = mix(vec3(0.15, 0.125, 0.1), vec3(0.1, 0.075, 0.055), age), belly = mix(vec3(0.37, 0.31, 0.24), vec3(0.34, 0.25, 0.16), age);
       float mid = mix(-0.03, -0.008, smoothstep(0.3, 0.45, z));
       vec3 alb = mix(belly, back, smoothstep(mid - 0.03, mid + 0.04, y));
       alb = mix(alb, mix(alb, vec3(0.28, 0.21, 0.15), 0.5), smoothstep(0.43, 0.48, z));
       // (the bare dark skin round the big eyes)
       alb *= 1.0 - 0.45 * (1.0 - smoothstep(0.017, 0.028, length(vec3(abs(x) - 0.035, y - 0.033, (z - 0.432) * 0.8))));
       alb *= 0.9 + 0.2 * mix(0.5, vn2(vec2((x + y) * 140.0 + sd, z * 14.0)), aaK(140.0, upp)) + 0.08 * (vn2(vec2(x, z) * 9.0 + sd) - 0.5);
       // the whisker pads: paler (no dotted pores: a grid of holes is hard to look at for some); the nose dark, its nostrils two commas; the mouth
       float pad = smoothstep(0.455, 0.47, z) * (1.0 - smoothstep(0.49, 0.5, z)) * smoothstep(0.012, 0.022, abs(x)) * smoothstep(-0.02, -0.005, y) * (1.0 - smoothstep(0.012, 0.02, y));
       alb = mix(alb, vec3(0.5, 0.42, 0.33), pad * 0.6);
       alb = mix(alb, vec3(0.05, 0.04, 0.035), smoothstep(0.494, 0.502, z) * step(0.0, y));
       float nos = 1.0 - smoothstep(0.6, 1.0, length(vec2((abs(x) - 0.007) / 0.004, (y - 0.012) / 0.0025)));
       alb = mix(alb, vec3(0.01), nos * step(0.49, z));
       float gape = 1.0 - smoothstep(0.0006, 0.0018, abs(y + 0.004 + (0.5 - z) * 0.2));
       alb *= 1.0 - 0.7 * gape * step(0.455, z) * step(0.01, abs(x) + (0.5 - z) * 0.5);
       // scars: pale healed lines from bites and rocks, more on an old one
       vec2 q = vec2(z * 18.0 + sd, (y + x * 0.7) * 30.0 + sd * 0.4); vec2 ci = floor(q);
       vec2 f = fract(q) - 0.5; float sa = hash2(ci) * 2.0 - 1.0;
       float scar = (1.0 - smoothstep(0.012, 0.03, abs(f.y * cos(sa) - f.x * sin(sa)))) * (1.0 - smoothstep(0.25, 0.4, abs(f.x * cos(sa) + f.y * sin(sa)))) * step(0.97 - 0.1 * age * age, hash2(ci + 7.1));
       alb = mix(alb, alb * 0.5 + vec3(0.3, 0.27, 0.24), scar * step(vPart, 0.5) * (0.3 + 0.6 * age));
       // the flippers: naked, leathery and black, creased across
       float fl = step(0.5, vPart) * step(vPart, 2.5);
       vec3 skin = vec3(0.07, 0.06, 0.055) * (0.88 + 0.24 * vn2(vec2(abs(x) * 60.0, z * 60.0)));
       alb = mix(alb, skin, fl);
       float eye = step(2.5, vPart) * step(vPart, 3.5), ear = step(3.5, vPart) * step(vPart, 4.5), wh = step(4.5, vPart);
       alb = mix(alb, vec3(0.012, 0.01, 0.01), eye);
       alb = mix(alb, back * 0.9, ear);
       alb = mix(alb, vec3(0.62, 0.57, 0.48), wh);
       vec3 col = shade(alb, vWp, n, 0.45);
       // wet: a broad soft sheen over the fur, a hard bright one on the eye and the naked skin
       vec3 H = normalize(V + SUN);
       float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
       float sp = pow(max(dot(n, H), 0.0), mix(mix(18.0, 40.0, fl), 160.0, eye)) * mix(mix(0.22, 0.3, fl), 1.6, eye);
       col += absorb(uTint * uSunI * (sp + fr * 0.08 * (1.0 - eye)) * caveLight(vWp).x, vWp.y);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS }, opts: { side: THREE.DoubleSide } });
}
