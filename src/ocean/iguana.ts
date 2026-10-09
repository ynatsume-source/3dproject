// Marine iguana (Amblyrhynchus cristatus), the only lizard that feeds in the sea. Lofted from real proportions: a
// short blunt head with heavy jowls, a squat body, and a long tail flattened from side to side (taller than it is
// wide) that it swims with; a crest of spines from the nape down the back and along the tail, tallest at the nape;
// four splayed legs with long-clawed toes it grips the rock with against the surge, and folds back along its flanks
// to swim. Head at +z, length 1 (snout to tail tip). aPart: 0 body, 1 crest, 2 front legs, 3 hind legs, 4 eye.
// Drawn by iguanaMaterial: near-black grey, granular, the head knobbed with pale tubercles, a faint rust and green
// mottle on the flanks. Posed in the vertex shader from aIg (swim phase, swim strength, legs out 0..1, head pitch)
// and aIg2 (age, seed, tail swaying in the surge).
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';

// [z, half-width, top, bottom]
const K: number[][] = [
  [0.503, 0.001, 0.001, -0.001], [0.5, 0.01, 0.007, -0.006], [0.497, 0.019, 0.016, -0.013], [0.489, 0.026, 0.024, -0.019], [0.474, 0.031, 0.031, -0.023],
  [0.456, 0.035, 0.034, -0.027], [0.436, 0.04, 0.033, -0.035], [0.414, 0.038, 0.03, -0.034], [0.395, 0.031, 0.028, -0.029],
  [0.365, 0.039, 0.034, -0.031], [0.32, 0.05, 0.04, -0.034], [0.24, 0.057, 0.043, -0.036], [0.16, 0.052, 0.04, -0.033], [0.1, 0.04, 0.034, -0.029],
  [0.05, 0.028, 0.03, -0.026], [-0.05, 0.019, 0.027, -0.022], [-0.18, 0.012, 0.022, -0.017], [-0.32, 0.007, 0.015, -0.012],
  [-0.44, 0.003, 0.008, -0.006], [-0.5, 0.001, 0.003, -0.002],
];
export function igProf(z: number) {
  let i = 0; while (i < K.length - 2 && K[i + 1][0] > z) i++;
  const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (p1[0] - z) / Math.max(p1[0] - p2[0], 1e-6))), t2 = t * t, t3 = t2 * t;
  const cr = (j: number) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
  return { w: Math.max(0.0008, cr(1)), top: cr(2), bot: cr(3) };
}
export const IG_FRONT = { x: 0.033, y: -0.012, z: 0.33 }, IG_HIND = { x: 0.028, y: -0.012, z: 0.11 };
// how far below its middle its spread feet reach (fraction of the length): where it stands on the rock
export const IG_FEET = 0.064;

export const IGUANA_GEO = (() => {
  const P: number[] = [], A: number[] = [], idx: number[] = [];
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[], part: number, flip = false) => {
    const o = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { P.push(...f(i / nu, j / nv)); A.push(part); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = o + i * (nv + 1) + j, b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  // a tube along a polyline (for the limbs and toes), tapering from r0 to r1
  const tube = (pts: number[][], r0: number, r1: number, part: number, n = 6) => {
    const segs = pts.length - 1;
    grid(segs * 3, n, (u, v) => {
      const s = u * segs, i = Math.min(segs - 1, Math.floor(s)), t = s - i, a = pts[i], b = pts[i + 1];
      const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const e1 = new THREE.Vector3(0, 1, 0).cross(d); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize();
      const e2 = d.clone().cross(e1), ang = v * Math.PI * 2, r = (r0 + (r1 - r0) * u) * (u > 0.97 ? 0.4 : 1);
      return [c[0] + (e1.x * Math.cos(ang) + e2.x * Math.sin(ang)) * r, c[1] + (e1.y * Math.cos(ang) + e2.y * Math.sin(ang)) * r, c[2] + (e1.z * Math.cos(ang) + e2.z * Math.sin(ang)) * r];
    }, part);
  };
  // the body: rings from the snout to the tail's tip (the tail flattened from side to side)
  // (the head knobbed with big conical scales: rounded bumps over the crown, snout and jowls)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const knobs: number[][] = [];
  for (let k = 0; k < 70; k++) knobs.push([0.43 + rnd() * 0.068, (rnd() * 2 - 1) * Math.PI * 0.62 + Math.PI / 2, 0.0035 + rnd() * 0.004, 0.0012 + rnd() * 0.0022]);
  grid(150, 40, (u, v) => {
    // (rings closer together at the head, where the detail is)
    const z = 0.503 - 1.003 * (0.45 * u + 0.55 * u * u), q = igProf(z), a = v * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const mid = (q.top + q.bot) / 2, half = (q.top - q.bot) / 2;
    let x = Math.sign(c) * Math.pow(Math.abs(c), 0.8) * q.w, y = mid + Math.sign(s) * Math.pow(Math.abs(s), 0.85) * half;
    if (z > 0.425) {
      let b = 0;
      for (const [kz, ka, kr, kh] of knobs) {
        const ax = Math.cos(ka) * q.w, ay = mid + Math.sin(ka) * half, d = Math.hypot(x - ax, y - ay, z - kz);
        if (d < kr) b = Math.max(b, kh * (1 - (d / kr) ** 2));
      }
      const rl = Math.hypot(x, y - mid) || 1; x += x / rl * b; y += (y - mid) / rl * b;
    }
    return [x, y, z];
  }, 0, true);
  // the crest: a row of spines along the back, leaning back, tallest at the nape and over the shoulders
  for (let z = 0.425; z > -0.36; ) {
    const back = z < 0.1, step = back ? 0.014 : 0.011, h = (z > 0.36 ? 0.024 : z > 0.2 ? 0.014 : z > 0.1 ? 0.009 : 0.008 * Math.max(0.15, 1 - (0.1 - z) / 0.5)) * (0.8 + 0.4 * Math.abs(Math.sin(z * 731)));
    const z0 = z, z1 = z - step, zm = z - step * 0.75, y0 = igProf(z0).top - 0.002, y1 = igProf(z1).top - 0.002, ym = igProf(zm).top + h;
    for (const sx of [-1, 1]) {
      const o = P.length / 3, w = 0.0018 * sx;
      P.push(w, y0, z0, w, y1, z1, 0, ym, zm); A.push(1, 1, 1);
      idx.push(...(sx > 0 ? [o, o + 1, o + 2] : [o, o + 2, o + 1]));
    }
    z = z1;
  }
  // the legs, spread as it grips the rock (the shader folds them back to swim): upper limb out, the lower down, and
  // five long-clawed toes; the hind legs longer, their toes longer still, the fourth the longest
  for (const sx of [-1, 1]) {
    const F = IG_FRONT, H = IG_HIND;
    const fe = [sx * 0.085, -0.02, 0.335], fw = [sx * 0.094, -0.058, 0.345];
    tube([[sx * F.x, F.y, F.z], fe, fw], 0.014, 0.009, 2);
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.38 + 0.15, l = [0.018, 0.024, 0.028, 0.026, 0.02][k];
      const tip = [fw[0] + sx * Math.sin(a + 0.5) * l, -IG_FEET, fw[2] + Math.cos(a + 0.5) * l];
      tube([fw, [fw[0] + (tip[0] - fw[0]) * 0.5, -IG_FEET + 0.002, fw[2] + (tip[2] - fw[2]) * 0.5], tip], 0.0035, 0.0012, 2, 4);
    }
    const he = [sx * 0.09, -0.018, 0.1], hw = [sx * 0.108, -0.058, 0.082];
    tube([[sx * H.x, H.y, H.z], he, hw], 0.018, 0.01, 3);
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.36 + 0.9, l = [0.02, 0.03, 0.04, 0.05, 0.03][k];
      const tip = [hw[0] + sx * Math.sin(a) * l, -IG_FEET, hw[2] + Math.cos(a) * l * 0.8 - 0.01];
      tube([hw, [hw[0] + (tip[0] - hw[0]) * 0.5, -IG_FEET + 0.002, hw[2] + (tip[2] - hw[2]) * 0.5], tip], 0.0038, 0.0012, 3, 4);
    }
  }
  // the eyes: small domes high on the sides of the head
  for (const sx of [-1, 1]) {
    const n = new THREE.Vector3(sx * 0.9, 0.4, 0.15).normalize(), e1 = new THREE.Vector3(0, 1, 0).cross(n).normalize(), e2 = n.clone().cross(e1), r = 0.0066;
    grid(6, 12, (u, v) => {
      const th = u * Math.PI / 2, ph = v * Math.PI * 2, rr = Math.sin(th) * r, h = Math.cos(th) * r * 0.6;
      return [sx * 0.0315 + n.x * h + (e1.x * Math.cos(ph) + e2.x * Math.sin(ph)) * rr, 0.017 + n.y * h + (e1.y * Math.cos(ph) + e2.y * Math.sin(ph)) * rr, 0.458 + n.z * h + (e1.z * Math.cos(ph) + e2.z * Math.sin(ph)) * rr];
    }, 4, sx < 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
})();

// Instanced: aIg (swim phase, swim strength 0..1, legs out 0..1, head pitch: + nose down), aIg2 (age, seed, tail sway).
export function iguanaMaterial() {
  return mat(
    `attribute float aPart; attribute vec4 aIg; attribute vec4 aIg2; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vIg2;
     vec3 ry(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
     vec3 rz(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
     vec3 rx(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
     // (the swimming wave: small at the head, growing down the tail; and the tail swaying in the surge)
     float wave(float z){ return aIg.y * (0.01 + 0.075 * pow(smoothstep(0.35, -0.5, z), 1.3)) * sin(aIg.x - (0.5 - z) * 7.0) + aIg2.z * 0.07 * pow(smoothstep(0.12, -0.5, z), 1.5); }
     void main(){
       vec3 p = position, nl = normal;
       // the legs: spread to grip, or folded back along the flanks to swim
       float leg = step(1.5, aPart) * step(aPart, 3.5), sg = sign(p.x), hind = step(2.5, aPart);
       vec3 pv = mix(vec3(sg * ${IG_FRONT.x.toFixed(3)}, ${IG_FRONT.y.toFixed(3)}, ${IG_FRONT.z.toFixed(3)}), vec3(sg * ${IG_HIND.x.toFixed(3)}, ${IG_HIND.y.toFixed(3)}, ${IG_HIND.z.toFixed(3)}), hind);
       if (leg > 0.5) {
         vec3 q = p - pv; q.x *= sg; vec3 m = nl; m.x *= sg;
         float fold = 1.0 - aIg.z;
         q = ry(rz(q, fold * 0.75), fold * mix(1.25, 1.45, hind)); m = ry(rz(m, fold * 0.75), fold * mix(1.25, 1.45, hind));
         q.x *= sg; m.x *= sg; p = pv + q; nl = m;
       }
       // the head pitches down to bite at the rock
       float hw = smoothstep(0.38, 0.42, p.z) * (1.0 - leg);
       vec3 hp = vec3(0.0, 0.0, 0.4);
       p = mix(p, hp + rx(p - hp, aIg.w), hw); nl = mix(nl, rx(nl, aIg.w), hw);
       // the body and tail: the wave (the legs ride with the body where they join it)
       p.x += wave(mix(p.z, pv.z, leg));
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nl); vL = position; vPart = aPart; vIg2 = aIg2;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vIg2;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float x = vL.x, y = vL.y, z = vL.z, sd = vIg2.y * 11.0, age = vIg2.x;
       float upp = length(fwidth(vL));
       // near-black slate, a little paler beneath (the legs too); a faint rust and green tinge in patches along the
       // flanks, a little stronger in an old one
       float leg = step(1.5, vPart) * step(vPart, 3.5);
       vec3 alb = mix(vec3(0.1, 0.1, 0.1), vec3(0.06, 0.062, 0.064), max(smoothstep(-0.02, 0.01, y), leg * 0.7));
       float mo = vn2(vec2(z * 22.0 + sd, y * 34.0));
       alb = mix(alb, vec3(0.16, 0.085, 0.06), smoothstep(0.62, 0.85, mo) * (0.1 + 0.15 * age) * smoothstep(-0.25, 0.1, z) * (1.0 - leg));
       alb = mix(alb, vec3(0.07, 0.1, 0.07), smoothstep(0.65, 0.88, vn2(vec2(z * 14.0 - sd, y * 24.0 + 3.0))) * 0.25);
       // granular scales all over (fine, soft: no hard pits)
       float gr = cellF1(vec2(z * 200.0, (y + x * 1.3) * 200.0) + sd);
       alb *= 0.88 + 0.2 * mix(0.45, smoothstep(0.15, 0.7, gr), aaK(200.0, upp));
       // the head: rough with big conical scales, greyer and crusted pale with salt on the crown (a merged roughness,
       // not separate dots)
       float head = smoothstep(0.42, 0.45, z) * step(vPart, 0.5);
       float tb = mix(0.35, smoothstep(0.55, 0.1, cellF1(vec2(x * 80.0, z * 80.0) + 7.0)) * (0.6 + 0.4 * vn2(vec2(x, z) * 160.0)), aaK(80.0, upp));
       alb = mix(alb, vec3(0.22, 0.215, 0.205), head * smoothstep(0.0, 0.02, y) * (0.35 + 0.35 * tb));
       // the mouth line and the nostrils
       float gape = 1.0 - smoothstep(0.0006, 0.0016, abs(y + 0.007 + (0.5 - z) * 0.1));
       alb *= 1.0 - 0.45 * gape * step(0.452, z) * step(0.008, abs(x) + (0.5 - z));
       alb = mix(alb, vec3(0.02), (1.0 - smoothstep(0.6, 1.0, length(vec2((y - 0.006) / 0.0022, (z - 0.492) / 0.003)))) * step(0.008, abs(x)));   // (the nostrils, small, on the sides of the snout's tip)
       // the crest's spines: grey, paler at their tips
       float cr = step(0.5, vPart) * step(vPart, 1.5);
       alb = mix(alb, mix(vec3(0.09, 0.09, 0.085), vec3(0.24, 0.23, 0.2), smoothstep(0.0, 0.016, y - 0.03)), cr);
       // the claws dark horn at the toes' ends
       alb = mix(alb, vec3(0.05, 0.045, 0.04), leg * smoothstep(-0.055, -0.062, y));
       float eye = step(3.5, vPart);
       alb = mix(alb, vec3(0.06, 0.035, 0.02), eye);
       vec3 col = shade(alb, vWp, n, 0.45);
       vec3 H = normalize(V + SUN);
       col += absorb(uTint * uSunI * pow(max(dot(n, H), 0.0), mix(24.0, 120.0, eye)) * mix(0.18, 1.2, eye) * caveLight(vWp).x, vWp.y);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS }, opts: { side: THREE.DoubleSide } });
}
