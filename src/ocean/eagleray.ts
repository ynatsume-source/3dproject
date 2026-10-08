// Spotted eagle ray (Aetobatus): a diamond of a disc with long, pointed, swept wings, thick through the middle and
// thin to the tips; the head standing out in front of the disc, flat and rounded into a duck-bill snout, the eyes
// bulging at its sides; small pelvic fins behind; a whip of a tail over twice the disc's length with a
// little dorsal fin and the venomous spine at its root. +z forward, the wings spanning x −1..1. aPart: 0 disc and
// body, 1 head, 2 tail, 3 eye. Drawn by eagleRayMaterial: navy-black above, scattered with white spots (some
// ringed), white beneath; the wings beat in a wave out along their span.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';
import { smooth } from '../core/math';

// the disc's outline (span x −1..1, the snout at z 0.55): a leading edge running nearly straight and swept back to
// the pointed tips, a trailing edge bowed forward (concave) from the tips back in to the body; the disc about half
// as long as it is wide, as a spotted eagle ray's is
const LEAD = (ax: number) => 0.3 - 0.6 * Math.pow(ax, 1.05) + 0.05 * Math.sin(ax * Math.PI) * (1 - ax);
const TRAIL = (ax: number) => -0.5 + 0.2 * ax + 0.15 * Math.sin(ax * Math.PI) * Math.pow(1 - ax, 0.4);
// thickness: the body a thick ridge down the middle, heaviest a third of the way back; the wings thin to their tips
const thick = (ax: number, v: number) => (0.15 * Math.exp(-Math.pow(ax / 0.15, 2)) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, v * 1.4))) + 0.026 * Math.pow(1 - ax, 1.3)) * Math.pow(Math.sin(Math.PI * v), 0.55);
// the head's half-width and its top and bottom at u (0 where it leaves the disc, 1 the snout's tip)
const HW = (u: number) => 0.13 * (1 - 0.32 * u) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 5))) + 0.002;
const HT = (u: number) => 0.085 * (1 - 0.45 * u * u) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 7))) + 0.002;
const HB = (u: number) => 0.045 * (1 - 0.3 * u) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 7))) + 0.002;
const HZ = (u: number) => 0.16 + 0.39 * u, HY = (u: number) => 0.012 - 0.035 * u * u;
const EYE_U = 0.36;

export const EAGLERAY_GEO = (() => {
  const P: number[] = [], A: number[] = [], UP: number[] = [], idx: number[] = [];
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[], part: number, up: number | ((u: number, v: number) => number), flip = false) => {
    const o = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { P.push(...f(i / nu, j / nv)); A.push(part); UP.push(typeof up === 'number' ? up : up(i / nu, j / nv)); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = o + i * (nv + 1) + j, b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  // the disc: top and underside across the whole span (u over x, finer toward the body; v: 0 leading .. 1 trailing)
  const at = (u: number, v: number, sgn: number) => {
    const s = u * 2 - 1, x = Math.sign(s) * Math.pow(Math.abs(s), 1.25), ax = Math.min(1, Math.abs(x)), lz = LEAD(ax), tz = TRAIL(ax), z = lz + (tz - lz) * v;
    const t = thick(ax, v) * (1 - 0.9 * smooth(0.85, 1, ax));
    return [x, sgn > 0 ? t * 0.66 : -t * 0.34, z];
  };
  grid(96, 24, (u, v) => at(u, v, 1), 0, 1);
  grid(96, 24, (u, v) => at(u, v, -1), 0, 0, true);
  // the head: standing out in front of the disc, deep and fleshy, rounded off at the snout like a duck's bill
  grid(28, 28, (u, v) => {
    const a = v * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 0.75) * HW(u), y = HY(u) + Math.sign(sn) * Math.pow(Math.abs(sn), 0.85) * (sn > 0 ? HT(u) : HB(u));
    return [x, y, HZ(u)];
  }, 1, (u, v) => (Math.sin(v * Math.PI * 2) > -0.25 ? 1 : 0));
  // the eyes: domes bulging from the sides of the head, high up, looking out and a little up
  for (const sx of [-1, 1]) {
    const cx = sx * HW(EYE_U) * 0.86, cy = HY(EYE_U) + HT(EYE_U) * 0.45, cz = HZ(EYE_U), nx = sx * 0.86, ny = 0.5, r = 0.026;
    grid(8, 16, (u, v) => {
      const th = u * Math.PI / 2, ph = v * Math.PI * 2, rr = Math.sin(th) * r, h = Math.cos(th) * r * 0.7;
      // (a local frame: out along (nx, ny), the rim round it in the plane across)
      const ex = -ny, ey = nx;
      return [cx + nx * h + ex * Math.cos(ph) * rr, cy + ny * h + ey * Math.cos(ph) * rr, cz + Math.sin(ph) * rr];
    }, 3, 1, sx > 0);
  }
  // pelvic fins: two small flaps behind the disc either side of the tail's root
  for (const sx of [-1, 1]) {
    grid(6, 6, (u, v) => [sx * (0.03 + 0.09 * u * (1 - 0.4 * v)), 0.006 * Math.sin(v * Math.PI) * (1 - u), -0.44 - 0.12 * v - 0.03 * u], 0, 1, sx < 0);
    grid(6, 6, (u, v) => [sx * (0.03 + 0.09 * u * (1 - 0.4 * v)), -0.004 * Math.sin(v * Math.PI) * (1 - u) - 0.002, -0.44 - 0.12 * v - 0.03 * u], 0, 0, sx > 0);
  }
  // the tail: a long whip, its little dorsal fin and the spine at its root
  grid(72, 10, (u, v) => {
    const z = -0.46 - 2.2 * Math.pow(u, 0.95), a = v * Math.PI * 2, r = 0.032 * Math.pow(1 - u, 1.3) + 0.0045;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.9 + 0.01, z];
  }, 2, 1);
  for (const sx of [-1, 1]) grid(5, 5, (u, v) => [sx * 0.002 * (1 - v), 0.04 + 0.04 * u * (1 - v) - 0.01 * v, -0.55 - 0.07 * v - 0.03 * u], 2, 1, sx < 0);
  grid(2, 3, (u, v) => [0.0025 * (u - 0.5), 0.045 - 0.006 * v, -0.62 - 0.09 * v], 2, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); g.setAttribute('aUp', new THREE.Float32BufferAttribute(UP, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
})();

// Instanced: aRay (beat phase, beat strength, seed, how far the tail lags in a turn).
export function eagleRayMaterial() {
  return mat(
    `attribute float aPart; attribute float aUp; attribute vec4 aRay; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying float vSeed; varying float vUp;
     void main(){
       vec3 p = position; float ax = abs(p.x), ph = aRay.x;
       // the wings beat in a wave running out along the span; the body rides a little the other way
       float wing = sin(ph - ax * 1.6) * aRay.y * pow(ax, 1.5) * 0.32;
       p.y += step(aPart, 0.5) * wing - 0.012 * sin(ph) * aRay.y * (1.0 - ax);
       // the tail trails and swings
       float tl = clamp((-0.46 - p.z) / 2.2, 0.0, 1.0);
       p.x += step(1.5, aPart) * step(aPart, 2.5) * (sin(ph * 0.5 - tl * 3.0) * 0.05 * tl + aRay.w * tl * tl * 0.6);
       p.y += step(1.5, aPart) * step(aPart, 2.5) * sin(ph - tl * 4.0) * 0.04 * tl;
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vL = position; vPart = aPart; vSeed = aRay.z; vUp = aUp;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying float vSeed; varying float vUp;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); bool back = dot(n, V) < 0.0; if (back) n = -n;
       float up = step(0.5, vUp);
       // the back: a deep navy going brownish in patches, lighter toward the wing tips; the belly white
       vec3 top = mix(vec3(0.045, 0.06, 0.1), vec3(0.075, 0.07, 0.07), vn2(vL.xz * 6.0 + vSeed * 9.0)) * (1.0 + 0.4 * abs(vL.x));
       vec3 belly = vec3(0.9, 0.9, 0.88);
       vec3 alb = mix(belly, top, up);
       // the spots: white, scattered all over the back, some of them rings round a dark middle; finer on the head
       // and out toward the wing tips (everything sampled every fragment, then weighed: no branches round it)
       float sc = mix(15.0, 24.0, step(0.5, vPart) * step(vPart, 1.5)) * (1.0 + 0.5 * abs(vL.x));
       // (on the head the spots go on round its sides: the coordinate across runs on down the flank from the top)
       float isHead = step(0.5, vPart) * step(vPart, 1.5), hu = clamp((vL.z - 0.16) / 0.39, 0.0, 1.0);
       float ytop = 0.012 - 0.035 * hu * hu + 0.085 * (1.0 - 0.45 * hu * hu);
       vec2 q = vec2(mix(vL.x, sign(vL.x) * (abs(vL.x) + max(0.0, ytop - vL.y)), isHead), vL.z) * sc + vSeed * 31.0;
       float f = cellF1(q), hsz = hash2(floor(q + 0.5));
       float sz = 0.15 + 0.12 * hsz;
       float spot = 1.0 - smoothstep(sz - 0.05, sz, f);
       float ring = step(0.62, hash2(floor(q) + 3.0)) * (1.0 - smoothstep(sz * 0.4, sz * 0.58, f));
       float onBack = up * step(vPart, 1.5) * smoothstep(-0.48, -0.4, vL.z);
       alb = mix(alb, vec3(0.74, 0.77, 0.8), spot * (1.0 - ring * 0.9) * onBack);
       // the spiracles behind the eyes, and the gill slits in two rows of five under the front of the disc
       float spir = (1.0 - smoothstep(0.7, 1.0, length(vec2((abs(vL.x) - 0.075) / 0.012, (vL.z - 0.2) / 0.028)))) * up * step(0.5, vPart) * step(vPart, 1.5);
       float gx = abs(vL.x) - 0.085, gz = fract((vL.z - 0.02) / 0.032);
       float gill = (1.0 - up) * step(vPart, 0.5) * step(abs(gx), 0.022) * step(0.0, vL.z - 0.02) * step(vL.z, 0.18) * (1.0 - smoothstep(0.0, 0.18, abs(gz - 0.5)));
       alb = mix(alb, vec3(0.02, 0.025, 0.035), spir);
       alb = mix(alb, vec3(0.45, 0.42, 0.42), gill * 0.8);
       // the tail: dark, paling toward its tip
       float tail = step(1.5, vPart) * step(vPart, 2.5);
       alb = mix(alb, mix(top, vec3(0.28, 0.29, 0.31), smoothstep(-0.6, -2.2, vL.z) * 0.5), tail);
       // the eye: dark, a dull greenish-gold iris round the pupil
       float eye = step(2.5, vPart);
       vec3 eo = vec3(sign(vL.x) * 0.86, 0.5, 0.0), ed = vL - vec3(sign(vL.x) * 0.1003, 0.0444, 0.3004);
       float er = length(ed - dot(ed, eo) * eo) / 0.026;
       alb = mix(alb, mix(vec3(0.01), vec3(0.16, 0.15, 0.08), smoothstep(0.35, 0.6, er) * (1.0 - smoothstep(0.8, 1.0, er))), eye);
       vec3 col = shade(alb, vWp, n, 0.5);
       vec3 R = reflect(-V, n);
       col += absorb(uTint * uSunI * pow(max(dot(R, SUN), 0.0), mix(30.0, 80.0, eye)) * mix(0.3, 1.2, eye) * caveLight(vWp).x, vWp.y);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS }, opts: { side: THREE.DoubleSide } });
}
