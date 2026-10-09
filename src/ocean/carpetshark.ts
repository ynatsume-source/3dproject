// Carpet sharks that rest on the bottom by day: the zebra shark (Stegostoma tigrinum) and the tawny nurse shark
// (Nebrius ferrugineus). Lofted from real proportions (s = fraction of the total length from the snout):
// - zebra: a short, blunt, rounded snout; a body ridged lengthwise (a ridge down the middle of the back and two along
//   each flank) running on to the tail; big rounded pectorals it props itself on at rest; the first dorsal over the
//   middle of the body, a smaller second just behind; and a tail nearly half its length, a long low strap of a fin
//   along its underside ending in a rounded lobe. Sandy yellow-brown, scattered with dark brown spots.
// - tawny nurse: a broad, flattened head with a rounded snout; a thick cylindrical body; two dorsal fins of nearly the
//   same size set far back, and pointed, falcate pectorals and dorsals (an Atlantic nurse shark's are rounded); a tail
//   about a quarter of its length with a weak lower lobe. Plain tawny brown.
// Both: small eyes high on the head with the spiracle behind, a small mouth well forward under the snout with a pair
// of barbels from the nostrils, five gill slits. Head at +z, length 1. aPart: 0 body, 1 vertical fins, 2 pectorals,
// 3 pelvics, 4 eye, 5 barbels. Posed in the shader from aCs (swim phase, swim strength, propped on its pectorals 0..1,
// breathing phase) and aCs2 (age, seed, tail curl at rest).
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';

export type CarpetStyle = 'zebra' | 'nurse';
interface Style { k: number[][]; d1: number[][]; d2: number[][]; anal: number[][]; caudal: number[][]; pect: number[][]; pectS: [number, number]; pelv: number[][]; ridges: boolean; eye: number; belly: number }
// body keys: [s, half-height, half-width, centre y]; fins: outlines as [s, height] (dorsal up, anal and caudal + down)
const STYLES: Record<CarpetStyle, Style> = {
  zebra: {
    k: [[0, 0, 0, -0.004], [0.012, 0.016, 0.026, -0.006], [0.04, 0.03, 0.045, -0.006], [0.08, 0.042, 0.058, -0.004], [0.14, 0.052, 0.066, -0.002], [0.22, 0.058, 0.07, 0],
      [0.3, 0.058, 0.066, 0], [0.38, 0.052, 0.056, 0], [0.46, 0.042, 0.042, 0.002], [0.54, 0.03, 0.028, 0.004], [0.62, 0.02, 0.018, 0.006], [0.74, 0.012, 0.011, 0.008],
      [0.86, 0.007, 0.007, 0.01], [0.97, 0.003, 0.003, 0.012], [1, 0.0005, 0.0005, 0.012]],
    d1: [[0.29, 0], [0.31, 0.03], [0.335, 0.05], [0.365, 0.054], [0.385, 0.046], [0.395, 0.02], [0.41, 0]],
    d2: [[0.43, 0], [0.445, 0.018], [0.465, 0.026], [0.48, 0.02], [0.49, 0]],
    anal: [[0.49, 0], [0.505, 0.018], [0.525, 0.02], [0.535, 0]],
    caudal: [[0.54, 0], [0.58, 0.032], [0.64, 0.046], [0.76, 0.05], [0.86, 0.048], [0.915, 0.04], [0.925, 0.018], [0.94, 0.03], [0.975, 0.032], [0.995, 0.014], [1.0, 0]],
    pect: [[0, 0], [0.02, 0.05], [0.045, 0.1], [0.075, 0.118], [0.1, 0.11], [0.112, 0.08], [0.11, 0.03], [0.1, 0]], pectS: [0.13, 0.24],
    pelv: [[0, 0], [0.02, 0.035], [0.045, 0.045], [0.06, 0.03], [0.065, 0]],
    ridges: true, eye: 0.075, belly: 0.06,
  },
  nurse: {
    k: [[0, 0, 0, -0.004], [0.01, 0.014, 0.03, -0.006], [0.04, 0.03, 0.055, -0.006], [0.09, 0.045, 0.068, -0.004], [0.16, 0.058, 0.074, -0.002], [0.25, 0.064, 0.072, 0],
      [0.35, 0.062, 0.064, 0.001], [0.45, 0.052, 0.05, 0.002], [0.55, 0.038, 0.036, 0.003], [0.63, 0.026, 0.024, 0.004], [0.72, 0.016, 0.014, 0.006], [0.85, 0.008, 0.007, 0.008],
      [0.98, 0.003, 0.003, 0.01], [1, 0.0005, 0.0005, 0.01]],
    d1: [[0.41, 0], [0.43, 0.035], [0.46, 0.065], [0.485, 0.075], [0.49, 0.06], [0.5, 0.025], [0.515, 0]],
    d2: [[0.55, 0], [0.57, 0.03], [0.595, 0.055], [0.615, 0.06], [0.62, 0.045], [0.63, 0.02], [0.64, 0]],
    anal: [[0.625, 0], [0.645, 0.025], [0.665, 0.032], [0.675, 0.02], [0.685, 0]],
    caudal: [[0.7, 0], [0.75, 0.022], [0.82, 0.032], [0.88, 0.03], [0.92, 0.024], [0.93, 0.01], [0.945, 0.022], [0.98, 0.024], [0.997, 0.01], [1.0, 0]],
    pect: [[0, 0], [0.02, 0.05], [0.05, 0.1], [0.085, 0.14], [0.1, 0.145], [0.095, 0.11], [0.085, 0.06], [0.09, 0.02], [0.1, 0]], pectS: [0.17, 0.27],
    pelv: [[0, 0], [0.025, 0.04], [0.05, 0.05], [0.07, 0.035], [0.075, 0]],
    ridges: false, eye: 0.085, belly: 0.064,
  },
};

export function carpetProfile(style: CarpetStyle, s: number) {
  const K = STYLES[style].k;
  let i = 0; while (i < K.length - 2 && K[i + 1][0] < s) i++;
  const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (s - p1[0]) / Math.max(p2[0] - p1[0], 1e-6))), t2 = t * t, t3 = t2 * t;
  const cr = (j: number) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
  let h = Math.max(0.0004, cr(1)), w = Math.max(0.0004, cr(2));
  // (the snout rounded off as a dome)
  if (s < 0.02) { const k = Math.sqrt(Math.max(0, 1 - (1 - s / 0.02) ** 2)); h = Math.max(h, K[1][1] * 1.1 * k); w = Math.max(w, K[1][2] * 1.1 * k); }
  return { h, w, y: cr(3) };
}
// how far below its axis its belly lies at the deepest (fraction of the length): where it lies on the sand
export const carpetBelly = (style: CarpetStyle) => STYLES[style].belly;
export const CARPET_PECT = (style: CarpetStyle) => STYLES[style].pectS;

const cache = new Map<CarpetStyle, THREE.BufferGeometry>();
export function carpetGeometry(style: CarpetStyle) {
  if (cache.has(style)) return cache.get(style)!;
  const S = STYLES[style], Z = (s: number) => 0.5 - s;
  const P: number[] = [], A: number[] = [], idx: number[] = [];
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[], part: number, flip = false) => {
    const o = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { P.push(...f(i / nu, j / nv)); A.push(part); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = o + i * (nv + 1) + j, b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  // the body (rings closer at the head); a zebra's five ridges, from behind the head along to the tail
  grid(130, 40, (u, v) => {
    const s = Math.pow(u, 1.2), q = carpetProfile(style, s), a = v * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    let r = 1;
    if (S.ridges) {
      const rk = smooth(0.1, 0.22, s) * (1 - smooth(0.85, 1, s)), side = Math.atan2(sn, Math.abs(c));
      for (const [ra, amp] of [[Math.PI / 2, 0.1], [0.75, 0.08], [0.02, 0.07]]) r += amp * rk * Math.exp(-(((side - ra) / 0.09) ** 2));
    }
    // (a flattish belly, a broad head)
    const yy = q.y + q.h * sn * (sn < 0 ? 0.85 : 1) * r;
    return [c * q.w * r, yy, Z(s)];
  }, 0, true);
  const top = (s: number) => { const q = carpetProfile(style, s); return q.y + q.h * (S.ridges ? 1.05 : 0.97); };
  const bot = (s: number) => { const q = carpetProfile(style, s); return q.y - q.h * 0.82; };
  // a fin from its outline (s, height), as a thin blade: two faces a hair apart
  const fin = (o: number[][], map: (s: number, d: number, side: number) => number[], part: number) => {
    const pts = o.map(([a, b]) => new THREE.Vector2(a, b)); if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const side of [1, -1]) for (const t of tris) {
      const vs = (side > 0 ? t : [t[0], t[2], t[1]]).map((i) => map(pts[i].x, pts[i].y, side));
      const o0 = P.length / 3; for (const v of vs) { P.push(...v); A.push(part); } idx.push(o0, o0 + 1, o0 + 2);
    }
  };
  const th = 0.0016;
  fin(S.d1, (s, d, sd) => [sd * th * (1 - d / 0.08), top(s) + d - 0.003, Z(s)], 1);
  fin(S.d2, (s, d, sd) => [sd * th * (1 - d / 0.08), top(s) + d - 0.003, Z(s)], 1);
  fin(S.anal, (s, d, sd) => [sd * th, bot(s) - d + 0.002, Z(s)], 1);
  // the caudal: along the underside of the tail (and a narrow web above it), ending in its lobe
  fin(S.caudal, (s, d, sd) => [sd * th, bot(s) - d + 0.002, Z(s)], 1);
  fin([[0.6, 0], [0.7, 0.008], [0.85, 0.01], [0.95, 0.008], [1, 0]], (s, d, sd) => [sd * th, top(s) + d - 0.002, Z(s)], 1);
  // pectorals and pelvics: flat blades out from the lower flank (s along the body, d out from it), angled a little down
  for (const sx of [-1, 1]) {
    const [s0] = S.pectS, q = carpetProfile(style, s0 + 0.04), rx = q.w * 0.8, ry = q.y - q.h * 0.55;
    fin(S.pect, (s, d, sd) => [sx * (rx + d), ry - d * 0.25 + sd * th * 1.5, Z(s0 + s)], 2);
    const sp = style === 'zebra' ? 0.33 : 0.42, qp = carpetProfile(style, sp + 0.03);
    fin(S.pelv, (s, d, sd) => [sx * (qp.w * 0.7 + d), qp.y - qp.h * 0.7 - d * 0.35 + sd * th, Z(sp + s)], 3);
  }
  // the eyes: small domes high on the sides of the head
  for (const sx of [-1, 1]) {
    const se = S.eye, q = carpetProfile(style, se), ang = 0.55, x0 = Math.cos(ang) * q.w, y0 = q.y + Math.sin(ang) * q.h;
    const n = new THREE.Vector3(sx * Math.cos(ang) * q.h, Math.sin(ang) * q.w, 0).normalize(), e1 = new THREE.Vector3(0, 0, 1), e2 = n.clone().cross(e1).normalize(), r = 0.0055;
    grid(5, 12, (u, v) => {
      const t2 = u * Math.PI / 2, ph = v * Math.PI * 2, rr = Math.sin(t2) * r, hh = Math.cos(t2) * r * 0.5;
      return [sx * x0 + n.x * hh + (e1.x * Math.cos(ph) + e2.x * Math.sin(ph)) * rr, y0 + n.y * hh + (e1.y * Math.cos(ph) + e2.y * Math.sin(ph)) * rr, Z(se) + n.z * hh + (e1.z * Math.cos(ph) + e2.z * Math.sin(ph)) * rr];
    }, 4, sx < 0);
  }
  // the barbels: a short fleshy pair hanging from the nostrils under the snout
  for (const sx of [-1, 1]) {
    const q = carpetProfile(style, 0.018), x0 = sx * q.w * 0.45, y0 = q.y - q.h * 0.7, z0 = Z(0.018);
    grid(4, 6, (u, v) => { const a = v * Math.PI * 2, r = 0.0034 * (1 - u * 0.55); return [x0 + Math.cos(a) * r, y0 - u * 0.011 + Math.sin(a) * r * 0.8, z0 - u * 0.004]; }, 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(idx); g.computeVertexNormals();
  cache.set(style, g);
  return g;
}
function smooth(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Instanced: aCs (swim phase, swim strength 0..1, propped on its pectorals 0..1, breathing phase), aCs2 (age, seed,
// tail curl at rest).
export function carpetMaterial(style: CarpetStyle) {
  const S = STYLES[style], q = carpetProfile(style, S.pectS[0] + 0.04), pr = q.w * 0.8, py = q.y - q.h * 0.55;   // (the pectorals' root: where they hinge)
  return mat(
    `attribute float aPart; attribute vec4 aCs; attribute vec4 aCs2; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vCs2;
     void main(){
       vec3 p = position, nl = normal; float s = 0.5 - p.z;
       // the pectorals: held out flat, or turned down at the tips to prop it up off the sand
       if (aPart > 1.5 && aPart < 2.5) {
         float sg = sign(p.x), a = -0.5 * aCs.z;
         vec2 q = vec2(abs(p.x) - PR, p.y - PY), m = vec2(abs(nl.x), nl.y);
         float c = cos(a), sn = sin(a);
         q = vec2(q.x * c - q.y * sn, q.x * sn + q.y * c); m = vec2(m.x * c - m.y * sn, m.x * sn + m.y * c);
         p.x = sg * (PR + q.x); p.y = PY + q.y; nl.x = sg * m.x; nl.y = m.y;
       }
       // the swimming wave: small at the head, growing to the tail (a zebra's whole body sinuous); at rest the tail
       // lies a little curled, swaying slowly
       float amp = 0.008 + ${S.ridges ? '0.07' : '0.055'} * pow(s, 1.6);
       float w = aCs.y * amp * sin(aCs.x - s * ${S.ridges ? '6.5' : '5.5'}) + aCs2.z * 0.12 * pow(smoothstep(0.35, 1.0, s), 2.0) + (1.0 - aCs.y) * 0.01 * pow(s, 2.0) * sin(aCs.x * 0.3);
       p.x += w;
       // breathing: at rest it pumps water over its gills, the throat swelling a little
       float gl = smoothstep(0.06, 0.12, s) * (1.0 - smoothstep(0.2, 0.26, s)) * step(aPart, 0.5);
       p.xy *= 1.0 + gl * 0.025 * (1.0 - aCs.y) * sin(aCs.w);
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nl); vL = position; vPart = aPart; vCs2 = aCs2;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vCs2;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float x = vL.x, y = vL.y, z = vL.z, s = 0.5 - z, sd = vCs2.y * 17.0, age = vCs2.x;
       float up = smoothstep(-0.02, 0.012, y);
       vec3 alb;
       #if STYLE == 0
         // zebra: sandy yellow-brown, paler beneath; dark brown spots scattered over the back, flanks and fins, of
         // uneven size and shape, well apart (not a pattern of holes: soft-edged blotches, few enough to read as a leopard's)
         alb = mix(vec3(0.66, 0.6, 0.48), vec3(0.54, 0.46, 0.33), up);
         vec2 q = vec2(s * 30.0, (atan(y, x) * 0.07 + y * 0.6) * 30.0 + sd) + vec2(vn2(vec2(s, y) * 30.0), vn2(vec2(y, s) * 30.0 + 4.0)) * 0.6;
         float f = cellF1(q), r = 0.17 + 0.12 * hash2(floor(q + 0.5) + 2.0);
         float spot = (1.0 - smoothstep(r - 0.08, r + 0.05, f)) * step(0.5, hash2(floor(q + 0.5) + 9.0));
         alb = mix(alb, vec3(0.2, 0.14, 0.09), spot * mix(0.35, 0.9, up) * smoothstep(0.02, 0.06, s));
       #else
         // tawny nurse: plain tawny brown, a little darker along the back, paler beneath
         alb = mix(vec3(0.62, 0.52, 0.38), vec3(0.45, 0.34, 0.22), up) * (0.93 + 0.12 * vn2(vec2(s * 9.0 + sd, y * 30.0)));
       #endif
       // a fine sandpaper skin; fins a shade darker at their edges; older ones a little duller and scuffed
       alb *= 0.94 + 0.08 * vn2(vec2(s * 300.0, (y + x) * 300.0));
       alb = mix(alb, alb * 0.82 + vec3(0.06), age * 0.25 * vn2(vec2(s * 20.0, y * 40.0) + sd));
       // the five gill slits, low on the side over the pectoral's root; the spiracle behind the eye; the mouth
       float gs = fract((s - 0.1) / 0.017);
       float gill = step(0.5, abs(x) / max(abs(y) + abs(x), 1e-3)) * step(0.1, s) * step(s, 0.185) * (1.0 - smoothstep(0.05, 0.14, abs(gs - 0.5))) * smoothstep(-0.03, -0.005, y) * (1.0 - smoothstep(0.012, 0.03, y));
       alb *= 1.0 - 0.45 * gill * step(vPart, 0.5);
       vec2 spr = vec2((s - ${(S.eye + 0.03).toFixed(3)}) / ${style === 'zebra' ? '0.007' : '0.004'}, (y - 0.03) / ${style === 'zebra' ? '0.005' : '0.003'});
       alb = mix(alb, alb * 0.35, 0.8 * (1.0 - smoothstep(0.5, 1.0, length(spr))) * step(0.02, abs(x)) * step(vPart, 0.5));   // (a hole, not a second eye: soft, darker skin)
       float mouth = (1.0 - smoothstep(0.0008, 0.002, abs(s - 0.03 - x * x * 3.0))) * step(y, -0.008) * step(abs(x), 0.03);
       alb *= 1.0 - 0.6 * mouth * step(vPart, 0.5);
       float fin = step(0.5, vPart) * step(vPart, 3.5);
       // (the fins the colour of the back, on both faces: not the belly's because they hang low)
       #if STYLE == 0
         alb = mix(alb, vec3(0.5, 0.42, 0.3) * (0.9 + 0.15 * vn2(vec2(s * 40.0, x * 40.0) + sd)), fin);   // (the body's spots, wrapped round it, would stretch into streaks on a flat fin)
       #else
         alb = mix(alb, vec3(0.43, 0.32, 0.21), fin);
       #endif
       float eye = step(3.5, vPart) * step(vPart, 4.5);
       alb = mix(alb, vec3(0.04, 0.045, 0.035), eye);
       vec3 col = shade(alb, vWp, n, 0.5);
       vec3 H = normalize(V + SUN);
       col += absorb(uTint * uSunI * pow(max(dot(n, H), 0.0), mix(30.0, 140.0, eye)) * mix(0.12, 1.0, eye) * caveLight(vWp).x, vWp.y);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS }, defines: { STYLE: style === 'zebra' ? 0 : 1, PR: pr.toFixed(4), PY: py.toFixed(4) }, opts: { side: THREE.DoubleSide } });
}
