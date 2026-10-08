// Dolphins, lofted like the whale and the big fish from real proportions (s = fraction of the length from the tip of
// the beak): the beak (long and slender in a spinner, short in a bottlenose) and the rounded melon over it with the
// crease between, the deepest body a third of the way back, the tail stock a keel, a falcate dorsal fin hooked
// back, slender pointed flippers, and broad horizontal flukes with a notch — all with thickness, not cut from a
// sheet. Head at +z, length 1. aPart: 0 body, 1 flippers, 2 dorsal fin, 3 flukes, 4 eye; aMouth: on the head, how
// far above (+) or below (−) the gape. The skin is drawn in dolphinMaterial: countershading in each species'
// pattern, the dark stripes about the eye and flipper, the gape, the blowhole, rake scars that come with age.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';
import { smooth } from '../core/math';

export type DolphinStyle = 'bottlenose' | 'spinner' | 'striped';

// [s, top, belly, half-width] as fractions of the length; the gape's corner (s); the eye (s)
const BODY: Record<DolphinStyle, { k: number[][]; gape: number; eye: number; dorsal: number; pect: number; fluke: number }> = {
  // bottlenose: robust, a short stubby beak sharply set off from the melon
  bottlenose: { k: [[0, 0.005, -0.006, 0.006], [0.025, 0.011, -0.012, 0.012], [0.05, 0.014, -0.016, 0.016], [0.066, 0.024, -0.02, 0.022], [0.085, 0.042, -0.03, 0.034], [0.12, 0.058, -0.044, 0.048],
    [0.18, 0.07, -0.056, 0.058], [0.26, 0.08, -0.066, 0.064], [0.36, 0.084, -0.07, 0.064], [0.46, 0.078, -0.064, 0.058], [0.56, 0.065, -0.05, 0.045], [0.66, 0.048, -0.037, 0.03],
    [0.75, 0.033, -0.026, 0.016], [0.84, 0.02, -0.016, 0.009], [0.88, 0.012, -0.01, 0.006]], gape: 0.105, eye: 0.125, dorsal: 0.095, pect: 0.135, fluke: 0.125 },
  // spinner: slender, a long thin beak, a low melon running smoothly into it; a near-triangular dorsal
  spinner: { k: [[0, 0.004, -0.004, 0.004], [0.04, 0.008, -0.009, 0.009], [0.08, 0.011, -0.013, 0.013], [0.1, 0.018, -0.016, 0.017], [0.125, 0.032, -0.026, 0.028], [0.16, 0.047, -0.038, 0.04],
    [0.22, 0.059, -0.05, 0.05], [0.3, 0.067, -0.058, 0.055], [0.38, 0.07, -0.061, 0.055], [0.48, 0.066, -0.056, 0.05], [0.58, 0.055, -0.045, 0.04], [0.67, 0.041, -0.033, 0.027],
    [0.76, 0.028, -0.022, 0.014], [0.84, 0.017, -0.014, 0.008], [0.88, 0.01, -0.009, 0.005]], gape: 0.13, eye: 0.15, dorsal: 0.085, pect: 0.115, fluke: 0.115 },
  // striped: between the two, a moderate beak, a well-marked melon
  striped: { k: [[0, 0.004, -0.005, 0.005], [0.035, 0.009, -0.01, 0.01], [0.065, 0.012, -0.014, 0.014], [0.082, 0.024, -0.02, 0.022], [0.105, 0.04, -0.031, 0.034], [0.14, 0.054, -0.043, 0.045],
    [0.2, 0.065, -0.054, 0.054], [0.28, 0.073, -0.062, 0.058], [0.37, 0.076, -0.065, 0.058], [0.47, 0.071, -0.06, 0.053], [0.57, 0.059, -0.048, 0.042], [0.67, 0.044, -0.035, 0.028],
    [0.76, 0.03, -0.024, 0.015], [0.84, 0.018, -0.015, 0.008], [0.88, 0.011, -0.009, 0.005]], gape: 0.115, eye: 0.138, dorsal: 0.09, pect: 0.125, fluke: 0.12 },
};

const cache = new Map<DolphinStyle, THREE.BufferGeometry>();
export function dolphinGeometry(style: DolphinStyle) {
  if (cache.has(style)) return cache.get(style)!;
  const B = BODY[style], K = B.k, sb = K[K.length - 1][0];
  const Z = (s: number) => 0.5 - s;
  const at = (s: number) => {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < s) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const t = Math.min(1, Math.max(0, (s - p1[0]) / Math.max(p2[0] - p1[0], 1e-6))), t2 = t * t, t3 = t2 * t;
    const cr = (j: number) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
    return [Math.max(0.003, cr(1)), Math.min(-0.003, cr(2)), Math.max(0.003, cr(3))];
  };
  // the gape runs along the beak at about its middle height and turns up a little at its corner (the "smile")
  const gapeY = (s: number) => { const [t, b] = at(s); return (t + b) * 0.5 - 0.002 + 0.006 * smooth(B.gape - 0.03, B.gape, s); };
  const skin = (s: number, a: number) => {
    const [t, b, w] = at(s), ym = b + (t - b) * 0.45, ca = Math.cos(a), sa = Math.sin(a);
    const x = ca * w * (1 - 0.22 * Math.max(sa, 0) ** 2) * (1 - smooth(0.68, 0.84, s) * 0.3 * Math.abs(sa));   // (a keel toward the tail)
    const y = ym + (sa >= 0 ? t - ym : ym - b) * sa;
    return [x, y, Z(s)];
  };
  const P: number[] = [], N: number[] = [], A: number[] = [], M: number[] = [];
  const RINGS = 80, RAD = 28, pos: number[] = [], mo: number[] = [], idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const s = sb * Math.pow(r / RINGS, 1.2);
    for (let k = 0; k < RAD; k++) { const v = skin(s, (k / RAD) * Math.PI * 2); pos.push(v[0], v[1], v[2]); mo.push(s < B.gape + 0.01 ? v[1] - gapeY(s) : 1); }
  }
  for (let r = 0; r < RINGS; r++) for (let k = 0; k < RAD; k++) { const a = r * RAD + k, b = r * RAD + (k + 1) % RAD, c = a + RAD, d = b + RAD; idx.push(a, c, b, b, c, d); }
  const tip = pos.length / 3; pos.push(0, (at(0)[0] + at(0)[1]) * 0.5, Z(0) + 0.002); mo.push(0);
  for (let k = 0; k < RAD; k++) idx.push(tip, k, (k + 1) % RAD);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute('aMouth', new THREE.Float32BufferAttribute(mo, 1));
  body.setIndex(idx); body.computeVertexNormals();
  const bn = body.toNonIndexed();
  P.push(...bn.attributes.position.array); N.push(...bn.attributes.normal.array); M.push(...bn.attributes.aMouth.array); for (let i = 0; i < bn.attributes.position.count; i++) A.push(0);
  const add = (g: THREE.BufferGeometry, part: number) => {
    const q = g.index ? g.toNonIndexed() : g; q.computeVertexNormals();
    const pp = q.attributes.position, nn = q.attributes.normal;
    for (let i = 0; i < pp.count; i++) { P.push(pp.getX(i), pp.getY(i), pp.getZ(i)); N.push(nn.getX(i), nn.getY(i), nn.getZ(i)); A.push(part); M.push(1); }
  };
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[]) => {
    const pp: number[] = [], ix: number[] = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) pp.push(...f(i / nu, j / nv));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const j1 = (j + 1) % nv, a = i * nv + j, b2 = i * nv + j1, c = a + nv, d = b2 + nv; ix.push(a, c, b2, b2, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setIndex(ix); return g;
  };
  // an airfoil section round v (0 leading edge .. 0.5 trailing .. back): (along the chord 0..1, out of its plane)
  const foil = (v: number, th: number) => { const a = v * Math.PI * 2, c = 0.5 - 0.5 * Math.cos(a); return [c, Math.sin(a) * th * (1 - c) * (1.25 - c) * 1.4]; };
  // dorsal fin: falcate, its tip hooked back over the trailing edge (the spinner's more upright and triangular)
  const top = (s: number) => at(s)[0];
  const hook = style === 'spinner' ? 0.35 : 0.75;
  add(grid(14, 14, (u, v) => {
    const hgt = B.dorsal * u, s0 = 0.43 + 0.05 * Math.pow(u, 1.5) + hook * 0.11 * Math.pow(u, 3), chord = 0.16 * Math.pow(1 - u, 0.85) * (1 - 0.15 * u) + 0.012;
    const [c, th] = foil(v, 0.016 * (1 - 0.75 * u));
    const s = s0 + chord * c - 0.03 * Math.pow(u, 2) * c * hook;
    return [th, top(Math.min(s, sb)) - 0.004 + hgt * (1 - 0.15 * c * u), Z(s)];
  }), 2);
  // flippers: from low on the flank behind the eye, slender, pointed, swept back and held a little out and down
  for (const sx of [-1, 1]) {
    const s0 = B.eye + 0.07, [t, b, w] = at(s0), root = new THREE.Vector3(sx * w * 0.85, b + (t - b) * 0.22, Z(s0));
    const dir = new THREE.Vector3(sx * 0.62, -0.42, -0.66).normalize(), fwd = new THREE.Vector3(0, 0, 1);
    const ch = fwd.clone().addScaledVector(dir, -fwd.dot(dir)).normalize(), nrm = new THREE.Vector3().crossVectors(dir, ch).normalize();
    add(grid(20, 12, (u, v) => {
      const chord = 0.06 * Math.pow(1 - u, 0.7) * (1 - 0.2 * u) + 0.003, [c, th] = foil(v, 0.009 * (1 - 0.7 * u));
      const p = root.clone().addScaledVector(dir, u * B.pect).addScaledVector(ch, chord * (0.35 - c) - 0.02 * u * u).addScaledVector(nrm, th);
      return [p.x, p.y, p.z];
    }), 1);
  }
  // flukes: broad, swept, horizontal, a notch in the middle of the trailing edge
  const SP = B.fluke;
  add(grid(40, 12, (u, v) => {
    const x = (u * 2 - 1) * SP, ax = Math.abs(x) / SP;
    const lead = 0.855 + 0.085 * Math.pow(ax, 0.9), trail = 0.965 - 0.03 * Math.sin(ax * Math.PI * 0.9) + 0.012 * (1 - smooth(0, 0.1, ax)) - 0.012 * smooth(0.85, 1, ax);
    const [c, th] = foil(v, 0.011 * (1 - Math.pow(ax, 1.5)) + 0.001);
    return [x, th, Z(lead + (Math.max(lead + 0.004, trail) - lead) * c)];
  }), 3);
  // the eyes: small domes just behind and above the gape's corner
  for (const sx of [-1, 1]) {
    const s = B.eye, [t, b] = at(s), yE = gapeY(B.gape) + (t - b) * 0.08;
    let a = 0; for (let k = 0; k < 60; k++) { const aa = -0.8 + k * 0.025; if (skin(s, aa)[1] >= yE) { a = aa; break; } }
    const p = new THREE.Vector3(...skin(s, a)), ps = new THREE.Vector3(...skin(s + 0.003, a)).sub(p), pa = new THREE.Vector3(...skin(s, a + 0.03)).sub(p);
    const n = new THREE.Vector3().crossVectors(pa, ps).normalize(); if (n.x < 0) n.negate();
    if (sx < 0) { p.x = -p.x; n.x = -n.x; }
    const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(0.0065, 0.0032, 0.0075 * 1.1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)); g.translate(p.x - n.x * 0.001, p.y - n.y * 0.001, p.z - n.z * 0.001);
    add(g, 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); g.setAttribute('aMouth', new THREE.Float32BufferAttribute(M, 1));
  cache.set(style, g);
  return g;
}

// Instanced: aDol per dolphin (stroke phase, beat, age 0..1, seed). The stroke is vertical, a wave down the tail
// stock that lifts and drops the flukes; the flippers steer a little.
export function dolphinMaterial(style: DolphinStyle) {
  const S = style === 'spinner' ? 1 : style === 'striped' ? 2 : 0;
  return mat(
    `attribute float aPart; attribute float aMouth; attribute vec4 aDol; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying float vMouth; varying vec4 vDol;
     void main(){
       vec3 p = position;
       float back = clamp((0.1 - p.z) / 0.6, 0.0, 1.0), ph = aDol.x;
       float w = sin(ph - back * 2.6);
       p.y += w * 0.05 * back * back * aDol.y + sin(ph + 1.2) * 0.006 * aDol.y * (1.0 - back);
       if (aPart > 0.5 && aPart < 1.5) p.y += sin(ph * 0.5 + p.x * 3.0) * 0.006 * abs(p.x) * 8.0;
       vec3 nl = normal; nl.z -= cos(ph - back * 2.6) * 0.05 * back * back * aDol.y * 2.6 / 0.6 * nl.y;
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nl); vL = position; vPart = aPart; vMouth = aMouth; vDol = aDol;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying float vMouth; varying vec4 vDol;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float z = vL.z, y = vL.y, x = vL.x, s = 0.5 - z, sd = vDol.w * 17.0;
       float side = abs(x);
       vec3 alb;
       #if STYLE == 0
         // bottlenose: a dark grey cape along the back, grey flanks, pale belly; the boundaries soft
         vec3 cape = vec3(0.16, 0.18, 0.2), flank = vec3(0.38, 0.4, 0.43), belly = vec3(0.82, 0.82, 0.8);
         float capeK = smoothstep(0.012, 0.04, y + 0.01 * sin(s * 12.0) - 0.02 * smoothstep(0.3, 0.55, s) + 0.01 * smoothstep(0.55, 0.8, s));
         alb = mix(mix(belly, flank, smoothstep(-0.05, -0.012, y)), cape, capeK);
       #elif STYLE == 1
         // spinner: three tones — a dark grey back, a pale grey band along the flank, a white belly; a dark stripe
         // from the eye to the flipper; the tip of the beak dark
         vec3 cape = vec3(0.09, 0.1, 0.13), flank = vec3(0.56, 0.58, 0.6), belly = vec3(0.92, 0.88, 0.86);
         alb = mix(belly, flank, smoothstep(-0.04, -0.018, y));
         alb = mix(alb, cape, smoothstep(0.008, 0.026, y + 0.008 * sin(s * 9.0)));
         alb = mix(alb, cape * 1.2, (1.0 - smoothstep(0.0, 0.006, abs(y - (0.004 - (s - 0.15) * 0.18)))) * step(0.15, s) * step(s, 0.27) * step(0.01, side));
         alb = mix(alb, cape, smoothstep(0.03, 0.0, s));
       #else
         // striped: blue-grey above, white below, a black stripe from the eye down the flank to the vent, a second
         // from the eye to the flipper, and a pale blaze sweeping up from the flank toward the dorsal fin
         vec3 cape = vec3(0.17, 0.22, 0.3), flank = vec3(0.42, 0.48, 0.55), belly = vec3(0.92, 0.92, 0.9);
         alb = mix(belly, flank, smoothstep(-0.03, -0.008, y));
         alb = mix(alb, cape, smoothstep(0.015, 0.04, y));
         float blaze = smoothstep(0.012, 0.0, abs(y - 0.012 - (s - 0.3) * 0.25)) * smoothstep(0.25, 0.35, s) * (1.0 - smoothstep(0.42, 0.5, s));
         alb = mix(alb, flank * 1.5, blaze * 0.7);
         float st1 = 1.0 - smoothstep(0.002, 0.0045, abs(y + 0.008 + (s - 0.14) * 0.06 + 0.012 * smoothstep(0.55, 0.7, s)));
         float st2 = 1.0 - smoothstep(0.0015, 0.0035, abs(y + 0.004 + (s - 0.14) * 0.28));
         alb = mix(alb, vec3(0.05, 0.06, 0.08), max(st1 * step(0.14, s) * step(s, 0.72), st2 * step(0.14, s) * step(s, 0.22)) * step(0.008, side));
       #endif
       if (vPart > 0.5 && vPart < 3.5) alb = mix(alb, vec3(0.2, 0.22, 0.25), 0.55);   // (fins the colour of the back)
       // the gape: a fine dark line along the beak to its upturned corner
       if (vPart < 0.5) {
         alb *= 1.0 - 0.75 * (1.0 - smoothstep(0.0005, 0.0016, abs(vMouth)));
         // the blowhole: a crescent on top of the head, opening forward
         vec2 bh = vec2(x / 0.009, (s - 0.165) / 0.004);
         float cres = (1.0 - smoothstep(0.85, 1.0, length(bh))) * smoothstep(-0.2, 0.3, -bh.y) * step(0.0, y);
         alb = mix(alb, vec3(0.04), cres * 0.8);
         // rake scars: thin parallel lines from other dolphins' teeth, more on an older one
         // (a set of three to five fine parallel scratches, each a few centimetres long, curving a little)
         vec2 q = vec2(s * 22.0 + sd, (y + x * 0.5) * 34.0 + sd * 0.3);
         vec2 ci = floor(q);
         float rake = 0.0;
         if (hash2(ci + 1.7) > 0.9 - 0.22 * vDol.z) {
           vec2 f = fract(q) - 0.5 - (vec2(hash2(ci + 2.2), hash2(ci + 3.3)) - 0.5) * 0.3; float a = hash2(ci) * 1.4 - 0.7; vec2 d = vec2(cos(a), sin(a));
           float al = dot(f, d), ac = dot(f, vec2(-d.y, d.x)) + al * al * 0.3, lines = 3.0 + floor(hash2(ci + 4.4) * 3.0);
           float kk = clamp(floor(ac / 0.05 + 0.5), 0.0, lines - 1.0);
           rake = (1.0 - smoothstep(0.004, 0.009, abs(ac - kk * 0.05))) * (1.0 - smoothstep(0.18, 0.3, abs(al))) * step(-0.03, ac) * step(ac, lines * 0.05);
         }
         alb = mix(alb, alb * 0.55 + vec3(0.36), rake * (0.2 + 0.6 * vDol.z));
       }
       // the eye: dark and wet
       if (vPart > 3.5) alb = vec3(0.025, 0.022, 0.02);
       vec3 col = shade(alb, vWp, n, 0.5);
       // a dolphin's skin is smooth and wet: it holds the sun in a soft, broad sheen
       vec3 R = reflect(-V, n);
       col += absorb(uTint * uSunI * (pow(max(dot(R, SUN), 0.0), 40.0) * 0.5 + pow(max(dot(R, SUN), 0.0), 8.0) * 0.08) * caveLight(vWp).x + waterCol(R) * 0.06, vWp.y) * (vPart > 3.5 ? 2.0 : 1.0);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { defines: { STYLE: S }, uniforms: { ...SURF_UNIFORMS }, opts: { side: THREE.DoubleSide } });
}
