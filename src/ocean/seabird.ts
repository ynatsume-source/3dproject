// Seabirds, lofted from real proportions: a spindle of a body with a neck and a head, the bill of each kind (a
// booby's stout dagger, a tern's slim spike, an albatross's or a frigatebird's hooked one), the tail (a booby's or a
// shearwater's pointed wedge, a tern's fork with its streamers, a frigatebird's scissors, an albatross's short
// round one), webbed feet, and wings with a real section — thick along the leading edge, thin at the feathers —
// that bend at the shoulder, the elbow and the wrist. Wingspan 1, head at +z. aPart: 0 body, 1 wing, 3 bill,
// 4 tail, 5 feet. aK: body (t along it 0 tail..1 bill base); wing (s root..tip, u leading..trailing edge, side
// +1 upper / -1 lower, which wing ±1); bill (u); tail (across −1..1, along 0..1); feet (which foot, along).
// aFold: where a wing's point lies folded along the flank (a bird at rest on the water).
// Posed in the vertex shader from aFly (wingbeat strength, its phase, folded, swept back for a plunge) and aFly2
// (feet down, tail spread, head bowed, seed): the wing beats from the shoulder with the hand lagging behind, flexes
// back on the upstroke and twists on the downstroke; each kind holds its own glide (a frigatebird's crooked M, an
// albatross's flat locked wing, a tern's angled hand).
import * as THREE from 'three';
import { mat } from '../render/common';

export type BirdKind = 'booby' | 'tern' | 'albatross' | 'frigate' | 'shearwater';

interface Form {
  body: number; w: number; h: number;                 // tail base to bill base; greatest half-width and half-height
  neck: number; head: number;                         // how slender the neck, how big the head (×)
  bill: number; bw: number; bh: number; hook: number; droop: number;
  tail: number; tailW: number; tailShape: 'wedge' | 'round' | 'fork' | 'scissors';
  wing: number[][];                                   // [s, leading edge (z from the shoulder), chord]
  glide: number[];                                    // shoulder up, elbow up, wrist up, wrist back
  fold: number; feet: number;
}
// (one span: a brown booby 1.4 m, 75 cm long; a crested tern 1.1 m, 47 cm; a Laysan albatross 2 m, 80 cm; a great
// frigatebird 2.2 m, a metre with its tail; a wedge-tailed shearwater 1 m, 45 cm)
const S = [0, 0.12, 0.24, 0.35, 0.47, 0.58, 0.7, 0.82, 0.92, 1];
export const FORMS: Record<BirdKind, Form> = {
  booby: {
    body: 0.31, w: 0.04, h: 0.038, neck: 0.62, head: 1, bill: 0.078, bw: 0.016, bh: 0.019, hook: 0, droop: 0.002,
    tail: 0.15, tailW: 0.028, tailShape: 'wedge',
    wing: S.map((s, i) => [s, [0, 0.008, 0.014, 0.018, 0.022, 0.024, 0.008, -0.016, -0.04, -0.066][i], [0.13, 0.126, 0.12, 0.115, 0.108, 0.098, 0.083, 0.064, 0.042, 0.01][i]]),
    glide: [0.05, 0.02, -0.06, 0.14], fold: 0.3, feet: 0.05,
  },
  tern: {
    body: 0.23, w: 0.03, h: 0.029, neck: 0.66, head: 1.12, bill: 0.058, bw: 0.0075, bh: 0.009, hook: 0, droop: 0.003,
    tail: 0.14, tailW: 0.03, tailShape: 'fork',
    wing: S.map((s, i) => [s, [0, 0.006, 0.012, 0.016, 0.022, 0.026, 0.006, -0.024, -0.054, -0.088][i], [0.12, 0.116, 0.11, 0.104, 0.098, 0.088, 0.07, 0.05, 0.032, 0.008][i]]),
    glide: [0.1, 0.06, -0.14, 0.32], fold: 0.29, feet: 0.022,
  },
  albatross: {
    body: 0.27, w: 0.046, h: 0.043, neck: 0.72, head: 0.98, bill: 0.058, bw: 0.012, bh: 0.016, hook: 0.007, droop: 0,
    tail: 0.065, tailW: 0.035, tailShape: 'round',
    wing: S.map((s, i) => [s, [0, 0.002, 0.005, 0.008, 0.01, 0.012, 0.004, -0.01, -0.026, -0.046][i], [0.086, 0.085, 0.082, 0.078, 0.075, 0.07, 0.06, 0.046, 0.03, 0.008][i]]),
    glide: [0.0, 0.02, -0.08, 0.05], fold: 0.27, feet: 0.05,
  },
  frigate: {
    body: 0.21, w: 0.03, h: 0.03, neck: 0.64, head: 1.05, bill: 0.056, bw: 0.0075, bh: 0.009, hook: 0.006, droop: 0,
    tail: 0.21, tailW: 0.018, tailShape: 'scissors',
    wing: S.map((s, i) => [s, [0, 0.01, 0.02, 0.03, 0.036, 0.036, 0.002, -0.04, -0.08, -0.12][i], [0.125, 0.12, 0.112, 0.102, 0.092, 0.082, 0.066, 0.05, 0.032, 0.008][i]]),
    glide: [0.2, 0.06, -0.46, 0.46], fold: 0.28, feet: 0.015,
  },
  shearwater: {
    body: 0.28, w: 0.036, h: 0.034, neck: 0.7, head: 1, bill: 0.042, bw: 0.0075, bh: 0.009, hook: 0.004, droop: 0,
    tail: 0.12, tailW: 0.026, tailShape: 'wedge',
    wing: S.map((s, i) => [s, [0, 0.005, 0.01, 0.012, 0.015, 0.016, 0.002, -0.018, -0.04, -0.062][i], [0.1, 0.099, 0.095, 0.09, 0.085, 0.079, 0.067, 0.05, 0.032, 0.008][i]]),
    glide: [0.0, 0.0, -0.07, 0.1], fold: 0.3, feet: 0.04,
  },
};
const SHOULDER_T = 0.6, ELBOW = 0.35, WRIST = 0.58;
// [t, half-width ×w, half-height ×h, middle ×h] from the tail base (0) to the bill base (1)
const PROF = [[0, 0.42, 0.36, 0.22], [0.12, 0.76, 0.7, 0.1], [0.3, 0.97, 0.95, 0], [0.47, 1, 1, 0], [0.6, 0.93, 0.97, 0.04], [0.72, 0.7, 0.75, 0.16],
  [0.8, 0.6, 0.62, 0.3], [0.88, 0.66, 0.68, 0.36], [0.95, 0.58, 0.58, 0.32], [1, 0.38, 0.4, 0.24]];
export function birdProfile(f: Form, t: number) {
  let i = 0; while (i < PROF.length - 2 && PROF[i + 1][0] < t) i++;
  const a = PROF[i], b = PROF[i + 1], k = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = k * k * (3 - 2 * k);
  const neck = t > 0.66 && t < 0.86 ? f.neck / 0.62 : 1, head = t > 0.84 ? f.head : 1;
  const m = (j: number) => a[j] + (b[j] - a[j]) * e;
  let w = m(1) * f.w * neck * head, h = m(2) * f.h * neck * head;
  // (the face rounds down onto the bill's base: no step where the bill meets the head)
  if (t > 0.9) { const q = Math.min(1, (t - 0.9) / 0.1), e2 = q * q * (3 - 2 * q); w += (f.bw * 1.08 - w) * e2 * e2; h += (f.bh * 1.08 - h) * e2 * e2; }
  return { w, h, y: m(3) * f.h, z: (t - SHOULDER_T) * f.body };
}
const zOf = (f: Form, t: number) => (t - SHOULDER_T) * f.body;
// where things are on each kind, for the shader and for the shots
export function birdMarks(kind: BirdKind) {
  const f = FORMS[kind], hd = birdProfile(f, 0.93), nk = birdProfile(f, 0.76), base = birdProfile(f, 1);
  const a = 0.6;   // (the eye: up the side of the head, a little forward)
  return {
    eye: [Math.cos(a) * hd.w * 0.98, hd.y + Math.sin(a) * hd.h * 0.98, zOf(f, 0.935)], eyeR: f.h * (kind === 'tern' ? 0.17 : 0.14),
    neck: [0, nk.y, nk.z], billBase: [0, base.y, base.z], chest: zOf(f, 0.62), tailBase: zOf(f, 0), h: f.h, w: f.w,
    shoulder: [f.w * 0.5, f.h * 0.38, 0.018],
  };
}

const geoCache = new Map<BirdKind, THREE.BufferGeometry>();
export function seabirdGeometry(kind: BirdKind) {
  const have = geoCache.get(kind); if (have) return have;
  const f = FORMS[kind], M = birdMarks(kind);
  const P: number[] = [], part: number[] = [], K: number[] = [], F: number[] = [], idx: number[] = [];
  const add = (p: number[], pt: number, k: number[], fold?: number[]) => { P.push(p[0], p[1], p[2]); part.push(pt); K.push(...k); F.push(...(fold || p)); return P.length / 3 - 1; };
  const grid = (o: number, nu: number, nv: number, flip: boolean, wrap: boolean) => {
    const W = wrap ? nv : nv + 1;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = o + i * W + j, b = o + (i + 1) * W + j, a1 = o + i * W + (j + 1) % W, b1 = o + (i + 1) * W + (j + 1) % W;
      if (flip) idx.push(a, a1, b, a1, b1, b); else idx.push(a, b, a1, a1, b, b1);
    }
  };
  // the body, tail base to bill base: an oval section, the back a little flatter
  const RING = 14, ST = 30;
  let o = P.length / 3;
  for (let i = 0; i <= ST; i++) {
    const t = i / ST, q = birdProfile(f, t);
    for (let j = 0; j < RING; j++) {
      const a = j / RING * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      add([c * q.w, q.y + Math.sign(s) * Math.pow(Math.abs(s), s > 0 ? 0.9 : 1.05) * q.h, q.z], 0, [t, 0, 0, 0]);
    }
  }
  grid(o, ST, RING, true, true);
  // (closed at the tail end)
  { const q = birdProfile(f, 0), c = add([0, q.y, q.z - f.w * 0.15], 0, [0, 0, 0, 0]); for (let j = 0; j < RING; j++) idx.push(o + (j + 1) % RING, o + j, c); }
  // the bill: from the face to the tip, the hooked kinds' upper mandible curling down over the tip
  const BR = 10, BS = 12, bb = M.billBase;
  o = P.length / 3;
  for (let i = 0; i <= BS; i++) {
    const u = i / BS, z = bb[2] + u * f.bill;
    const taper = Math.pow(1 - u, 0.75) * 0.9 + 0.1 * (1 - u), hw = f.bw * taper + 0.0006, hh = f.bh * (Math.pow(1 - u, 0.7) * 0.85 + 0.15 * (1 - u)) + 0.0008;
    const hk = f.hook * Math.pow(Math.max(0, (u - 0.72) / 0.28), 1.6), cy = bb[1] - 0.15 * f.bh - f.droop * u * u - hk;
    for (let j = 0; j < BR; j++) {
      const a = j / BR * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // (a bill is deeper than wide, keeled above; the hook a little fuller on top)
      add([c * hw, cy + s * hh * (s > 0 ? 1 + hk * 30 : 1), z], 3, [u, 0, 0, 0]);
    }
  }
  grid(o, BS, BR, true, true);
  { const c = add([0, bb[1] - 0.15 * f.bh - f.droop - f.hook - 0.001, bb[2] + f.bill + 0.002], 3, [1, 0, 0, 0]); const e = o + BS * BR; for (let j = 0; j < BR; j++) idx.push(e + j, e + (j + 1) % BR, c); }
  // the tail: a fan of feathers out behind, its outline the kind's
  const tb = birdProfile(f, 0.03), TU = 12, TV = 5, tz = tb.z + 0.004, ty = tb.y + tb.h * 0.25;
  const tailLen = (u: number) => {
    const a = Math.abs(u);
    if (f.tailShape === 'wedge') return f.tail * (1 - 0.5 * Math.pow(a, 1.2));
    if (f.tailShape === 'round') return f.tail * (1 - 0.3 * a * a);
    if (f.tailShape === 'fork') return f.tail * (0.48 + 0.52 * Math.pow(a, 2.2));
    return f.tail * (0.3 + 0.7 * Math.pow(a, 1.4));   // scissors
  };
  for (const side of [1, -1]) {
    o = P.length / 3;
    for (let i = 0; i <= TV; i++) for (let j = 0; j <= TU; j++) {
      const v = i / TV, u = j / TU * 2 - 1, L = tailLen(u);
      // (the streamers and the scissors are narrow blades: the outer feathers close in toward their tips)
      const wide = tb.w * 0.8 + (f.tailW - tb.w * 0.8) * v * (1 - (f.tailShape === 'fork' || f.tailShape === 'scissors' ? 0.35 * v * Math.abs(u) : 0));
      add([u * wide, ty + side * 0.0012 * (1 - v) + 0.004 * (1 - u * u) * v, tz - v * L], 4, [u, v, side, 0]);
    }
    grid(o, TV, TU, side > 0, false);
  }
  // the wings: a real section, root buried in the body; folded, along the flank and over the tail
  const CH = [0, 0.03, 0.1, 0.22, 0.4, 0.62, 0.82, 1];
  const xs = M.shoulder[0], ys = M.shoulder[1], zs = M.shoulder[2];
  const halfAt = (z: number, y: number) => {
    const t = Math.min(1, Math.max(0, z / f.body + SHOULDER_T)), q = birdProfile(f, t), e = Math.min(1, Math.abs((y - q.y) / q.h));
    return q.w * Math.sqrt(1 - e * e);
  };
  // (the planform's keys smoothed through, finer toward the tip: the leading edge curving back into the point
  // without a kink)
  const plan = (s: number) => {
    let i = 0; while (i < f.wing.length - 2 && f.wing[i + 1][0] < s) i++;
    const p0 = f.wing[Math.max(0, i - 1)], p1 = f.wing[i], p2 = f.wing[i + 1], p3 = f.wing[Math.min(f.wing.length - 1, i + 2)];
    const t = (s - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
    const cr = (j: number) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
    return [s, cr(1), Math.max(0.004, cr(2))];
  };
  const STN = 18, stations = Array.from({ length: STN + 1 }, (_, i) => plan(1 - Math.pow(1 - i / STN, 1.35)));
  for (const sg of [1, -1]) {
    o = P.length / 3;
    const ring = CH.length * 2 - 2;
    for (const st of stations) {
      const [s, le, c] = st, x = xs + s * (0.5 - xs), thk = 0.15 - 0.1 * s;
      for (let k = 0; k < ring; k++) {
        // around the section: along the top from the leading edge to the trailing edge, back along the bottom
        const top = k < CH.length, u = top ? CH[k] : CH[ring - k], side = top ? 1 : -1;
        const th = c * thk * 2.6 * Math.sqrt(u) * (1 - u), cam = c * 0.045 * Math.sin(Math.PI * u);
        const y = ys + cam + (top ? th * 0.62 : -th * 0.38), z = zs + 0.034 + le - u * c;
        // folded: the arm and the hand laid back in layers on the flank, the long flight feathers over the tail
        const along = s * 0.82 + u * 0.18, zf = zs + 0.02 - along * f.fold;
        const yf = ys + 0.25 * f.h - u * f.h * (0.95 - 0.55 * s) * (1 - 0.4 * along) - Math.max(0, along - 0.6) * f.h * 0.25;
        const xf = Math.max(halfAt(zf, yf) + 0.003, f.w * (0.36 - 0.25 * along)) + side * 0.0018 + 0.004 * (1 - u) * (1 - s);
        add([sg * x, y, z], 1, [s, u, side, sg], [sg * xf, yf, zf]);
      }
    }
    grid(o, STN, ring, sg < 0, true);
  }
  // the feet: a short leg and a webbed foot of three toes, tucked back under the tail
  const fl = f.feet, hip = birdProfile(f, 0.3);
  for (const sg of [1, -1]) {
    o = P.length / 3;
    const hx = sg * f.w * 0.32, hy = hip.y - hip.h * 0.7, hz = zOf(f, 0.3);
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const v = i / 4, u = j / 4 * 2 - 1;
      // (the leg the first quarter, then the web spreading to the toes, its edge a shallow scallop)
      const L = v < 0.3 ? v / 0.3 * 0.3 : 0.3 + (v - 0.3) / 0.7 * (0.7 - 0.08 * Math.abs(Math.sin(u * Math.PI * 1.0)) * ((v - 0.3) / 0.7));
      const wd = v < 0.3 ? 0.08 : 0.08 + (v - 0.3) / 0.7 * 0.42;
      add([hx + u * wd * fl, hy - 0.0015 * (1 - u * u), hz - L * fl], 5, [sg, v, u, 0]);
    }
    grid(o, 4, 4, true, false);
    const o2 = P.length / 3;   // (its underside)
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const k = o + i * 5 + j; add([P[k * 3], P[k * 3 + 1] - 0.0012, P[k * 3 + 2]], 5, [sg, i / 4, j / 4 * 2 - 1, 0]); }
    grid(o2, 4, 4, false, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 4));
  g.setAttribute('aFold', new THREE.Float32BufferAttribute(F, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.7);
  geoCache.set(kind, g);
  return g;
}

/** How a kind looks: colours of each part and where its marks are. */
export interface BirdLook {
  c1: number[]; c2: number[]; bill: number[]; head?: number[]; cap?: 'cap' | 'crest' | 'nape' | 'ring' | 'none'; capCol?: number[];
  hood?: boolean;          // the dark of the back over the head, neck and breast (a brown booby's sharp bib)
  under?: 'white' | 'dark' | 'margin';   // the underwing: white, dark, or white with dark margins
  feet?: number[]; iris?: number[]; face?: number[]; cheek?: boolean; sexes?: boolean; breast?: number[];
}

export function seabirdMaterial(kind: BirdKind, L: BirdLook) {
  const f = FORMS[kind], M = birdMarks(kind);
  const capN = { none: 0, cap: 1, crest: 2, nape: 3, ring: 4 }[L.cap ?? 'none'];
  const C = (c: number[] | undefined, d: number[]) => new THREE.Color(...(c ?? d));
  return mat(
    `attribute float aPart; attribute vec4 aK; attribute vec3 aFold; attribute vec4 aFly; attribute vec4 aFly2;
     uniform vec3 uJ0; uniform vec3 uJ1; uniform vec3 uJ2; uniform vec4 uGlide; uniform vec3 uNeck; uniform vec3 uHip;
     varying vec3 vN; varying vec3 vWp; varying vec3 vL; varying vec4 vK; varying float vPart; varying vec3 vN0; varying float vSeed;
     vec3 rZ(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
     vec3 rY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
     vec3 rX(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
     // (a wing's segment turned about its joint J: twisted along the span, raised, swept back)
     vec3 seg(vec3 v, vec3 J, float sw, float fl, float tw){ return J + rY(rZ(rX(v - J, tw), fl), sw); }
     vec3 segN(vec3 n, float sw, float fl, float tw){ return rY(rZ(rX(n, tw), fl), sw); }
     void main(){
       vec3 p = position, n = normal;
       float A = aFly.x, ph = aFly.y, fold = aFly.z, dive = aFly.w;
       if (aPart > 0.5 && aPart < 1.5) {
         // the wing, worked in the right wing's frame (x out, z ahead) and mirrored back
         float sg = aK.w, s = aK.x;
         vec3 q = vec3(p.x * sg, p.y, p.z), m = vec3(n.x * sg, n.y, n.z);
         float sn = sin(ph), cs = cos(ph), up = max(cs, 0.0);
         // shoulder: the beat itself; the forearm a little after; the hand last, swept back and folded in on the
         // upstroke, twisted leading edge down on the downstroke. A plunge sweeps the whole wing back along the body.
         float fl0 = uGlide.x * (1.0 - dive) + A * sn + dive * 0.08, sw0 = dive * 1.5 + A * 0.12 * up - A * 0.06;
         float fl1 = uGlide.y * (1.0 - dive) + A * 0.3 * sin(ph - 0.6), sw1 = -A * 0.22 * up - dive * 0.12;
         float fl2 = uGlide.z * (1.0 - dive) + A * 0.5 * sin(ph - 1.1) - dive * 0.08, sw2 = uGlide.w * (1.0 - dive * 0.5) + A * 0.6 * up + dive * 0.3;
         float tw2 = -A * 0.35 * cs, tw0 = -A * 0.12 * cs;
         float wW = smoothstep(${WRIST.toFixed(3)} - 0.05, ${WRIST.toFixed(3)} + 0.05, s), wE = smoothstep(${ELBOW.toFixed(3)} - 0.05, ${ELBOW.toFixed(3)} + 0.05, s);
         q = mix(q, seg(q, uJ2, sw2, fl2, tw2), wW); m = mix(m, segN(m, sw2, fl2, tw2), wW);
         q = mix(q, seg(q, uJ1, sw1, fl1, 0.0), wE); m = mix(m, segN(m, sw1, fl1, 0.0), wE);
         float wR = smoothstep(0.0, 0.06, s);
         q = mix(q, seg(q, uJ0, sw0, fl0, tw0), wR); m = mix(m, segN(m, sw0, fl0, tw0), wR);
         // folded on the water: laid along the flank
         vec3 fq = vec3(aFold.x * sg, aFold.y, aFold.z);
         q = mix(q, fq, fold); m = normalize(mix(m, vec3(aK.z, 0.35, 0.0), fold * 0.9));
         p = vec3(q.x * sg, q.y, q.z); n = vec3(m.x * sg, m.y, m.z);
       } else if (aPart > 3.5 && aPart < 4.5) {
         // the tail: fanned open (braking, hovering, turning), the feathers' tips spread most; tipped down to brake
         float spread = aFly2.y, v = aK.y;
         p.x *= 1.0 + spread * 1.6 * v;
         float down = spread * 0.35, dz = p.z - (${(M.tailBase + 0.004).toFixed(4)});
         p.y += dz * sin(down); p.z = ${(M.tailBase + 0.004).toFixed(4)} + dz * cos(down);
       } else if (aPart > 4.5) {
         // the feet: tucked back under the tail in flight, let down and forward to land, to take off, and paddling
         float a = -aFly2.x * 1.75 - aFly2.x * 0.15 * sin(ph * 0.5);
         p = uHip + rX(p - uHip, a); n = rX(n, a);
         p.x += aK.x * aFly2.x * 0.004;
       }
       // the head and neck: bowed to look down at the water (a tern hunting), raised to swallow
       float hw = aPart > 2.5 && aPart < 3.5 ? 1.0 : (aPart < 0.5 ? smoothstep(0.72, 0.86, aK.x) : 0.0);
       if (hw > 0.0) { float a = aFly2.z * hw; p = uNeck + rX(p - uNeck, a); n = rX(n, a); }
       vL = position; vK = aK; vPart = aPart; vN0 = normal; vSeed = aFly2.w;
       vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uBill; uniform vec3 uHead; uniform vec3 uCapC; uniform vec3 uFeet; uniform vec3 uIris; uniform vec3 uFace; uniform vec3 uBreast;
     uniform vec4 uLook; uniform vec4 uLook2; uniform vec4 uEye; uniform vec4 uZ;
     varying vec3 vN; varying vec3 vWp; varying vec3 vL; varying vec4 vK; varying float vPart; varying vec3 vN0; varying float vSeed;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp);
       if (dot(n, V) < 0.0) n = -n;
       // uZ: x neck, y chest, z bill base, w tail base (z along the body); uLook: hood, cap kind, underwing, sexes
       float up = smoothstep(-0.3, 0.2, vN0.y);
       float male = step(fract(vSeed * 7.31), 0.5) * uLook.w;
       vec3 c1 = uC1, c2 = mix(uC2, uC1, uLook.w);   // (a frigatebird: black beneath, the female's breast aside)
       vec3 alb = mix(c2, c1, up);
       float headZ = smoothstep(uZ.x - 0.006, uZ.x + 0.006, vL.z);
       if (vPart < 0.5) {
         alb = mix(alb, uHead, headZ * (1.0 - uLook.x));
         // a booby's hood: the dark of the back right over the head, neck and breast, its edge clean across the chest
         float hood = smoothstep(uZ.y - 0.004, uZ.y + 0.004, vL.z + vL.y * 0.4) * uLook.x;
         alb = mix(alb, uHead, hood);
         // a female frigatebird's white breast (the male is all black, with his red throat)
         float br = uLook.w * (1.0 - male) * smoothstep(uZ.y - 0.05, uZ.y - 0.02, vL.z) * (1.0 - smoothstep(uZ.x - 0.004, uZ.x + 0.01, vL.z)) * (1.0 - up);
         alb = mix(alb, uBreast, br);
         float throat = uLook.w * male * smoothstep(uZ.x - 0.004, uZ.x + 0.008, vL.z) * smoothstep(-0.25, -0.65, vN0.y) * (1.0 - smoothstep(uEye.z - 0.006, uEye.z + 0.002, vL.z));   // (the male's bare throat, red beneath the bill)
         alb = mix(alb, vec3(0.75, 0.12, 0.1), throat);
         // the caps of the terns: a black crown to the nape; the crested's white forehead; the black-naped's band
         vec3 e = vec3(abs(vL.x), vL.y, vL.z) - uEye.xyz;
         float onHead = smoothstep(uZ.x - 0.012, uZ.x + 0.004, vL.z);
         float cap = 0.0;
         if (uLook.y > 0.5 && uLook.y < 2.5) cap = smoothstep(-0.0025, 0.0015, e.y + e.z * 0.35 + uEye.w * 0.4) * onHead;
         if (uLook.y > 1.5 && uLook.y < 2.5) cap *= smoothstep(0.004, -0.002, e.z - e.y * 0.6 - uEye.w);
         if (uLook.y > 2.5 && uLook.y < 3.5) cap = smoothstep(uEye.w * 1.6, uEye.w * 1.0, abs(e.y + e.z * 0.25 - uEye.w * 0.2)) * smoothstep(uEye.w * 1.5, 0.0, e.z) * onHead;
         alb = mix(alb, uCapC, cap);
         // a white streak under the cap (the white-cheeked tern)
         alb = mix(alb, vec3(0.96), uLook2.x * onHead * smoothstep(uEye.w * 2.6, uEye.w * 1.6, abs(e.y + uEye.w * 2.2)) * smoothstep(uEye.w * 2.0, -uEye.w, e.z) * (1.0 - cap));
         // a pale face round the bill's base (the black-footed albatross)
         alb = mix(alb, uFace, uLook2.y * smoothstep(0.012, 0.004, uZ.z - vL.z) * onHead);
         // the eye: its iris, a dark pupil; a dark ring round it (the white tern), a dark smudge before it (the Laysan)
         float d = length(e), r = uEye.w;
         alb = mix(alb, uCapC, uLook2.z * smoothstep(r * 2.0, r * 1.6, d));
         alb = mix(alb, vec3(0.12, 0.11, 0.1), uLook2.w * smoothstep(r * 2.4, r * 1.2, length(e + vec3(0.0, -r * 0.2, -r * 1.2))) * (1.0 - smoothstep(r * 0.9, r * 1.1, d)) );
         float ring = smoothstep(r * 1.15, r * 0.95, d), iris = smoothstep(r, r * 0.8, d), pupil = smoothstep(r * 0.55, r * 0.4, d);
         alb = mix(alb, vec3(0.08), ring * 0.6);
         alb = mix(alb, uIris, iris);
         alb = mix(alb, vec3(0.02), pupil);
       } else if (vPart < 1.5) {
         // the wing: the upperwing the back's colour, the tern's outer flight feathers darker; beneath, white, dark,
         // or white with dark margins (the leading edge, the trailing edge, the hand)
         float s = vK.x, u = vK.y, top = step(0.0, vK.z);
         vec3 upw = c1;
         #ifdef TERN
         upw = mix(upw, c1 * 0.68, smoothstep(0.7, 0.9, s) * smoothstep(0.1, 0.35, u) * 0.8);   // (the outer primaries a darker grey)
         #endif
         // (a frigatebird's paler bar across the arm, plainer on the male)
         upw = mix(upw, vec3(0.32, 0.26, 0.2), uLook.w * smoothstep(0.08, 0.16, s) * (1.0 - smoothstep(0.38, 0.48, s)) * smoothstep(0.08, 0.2, u) * (1.0 - smoothstep(0.42, 0.55, u)) * (0.35 + 0.65 * (1.0 - male)));
         vec3 low = c1;
         if (uLook.z > 0.5) {
           float inner = (1.0 - smoothstep(0.6, 0.78, s)) * smoothstep(0.03, 0.1, u) * (1.0 - smoothstep(0.62, 0.8, u));
           low = uLook.z > 1.5 ? mix(uC2, c1 * 0.7, smoothstep(0.75, 0.95, s) * smoothstep(0.2, 0.5, u) * 0.6) : mix(c1, uC2, inner);
         }
         alb = mix(low, upw, top);
       } else if (vPart < 3.5) {
         alb = uBill * mix(0.9, 1.08, smoothstep(0.0, 0.8, vK.x));
         alb = mix(alb, alb * 0.55, smoothstep(0.8, 0.98, vK.x) * 0.3);   // (the tip a little darker, horn)
       } else if (vPart < 4.5) {
         // the tail: the back's colour, a little darker to the tips; a tern's white beneath
         alb = mix(c1, c1 * 0.8, smoothstep(0.7, 1.0, vK.y) * 0.4);
         #ifdef TERN
         alb = mix(c1, uC2, 1.0 - step(0.0, vK.z));
         #endif
       } else alb = uFeet;
       // light: the sun, wrapped a little round the soft plumage; the sky above; the bill and feet a touch glossy
       float sunL = max(dot(n, uAirSun) * 0.85 + 0.15, 0.0);
       vec3 sun = sunAirCol() * sunL * (1.0 - 0.7 * uCloud);
       vec3 moon = vec3(0.5, 0.55, 0.65) * max(dot(n, uAirMoon), 0.0) * uMoonI * 0.4;
       vec3 sky = skyAir(vec3(0.0, 1.0, 0.0), -1.0) * (0.5 + 0.3 * n.y) + vec3(0.02, 0.025, 0.03);
       // (and from below: the sunlit sea and its glare, which lights a bird's underside seen against the sky)
       vec3 bounce = (sunAirCol() * max(uAirSun.y, 0.0) * 0.45 * (1.0 - 0.6 * uCloud) + sky * 0.35) * max(-n.y, 0.0);
       vec3 col = alb * (sun * 1.15 + moon + sky * 0.85 + bounce);
       float gloss = step(2.5, vPart) * (1.0 - step(3.5, vPart)) + step(4.5, vPart);
       col += gloss * sunAirCol() * pow(max(dot(reflect(-uAirSun, n), V), 0.0), 24.0) * 0.25 * (1.0 - uCloud);
       col = absorb(col, vWp.y);
       gl_FragColor = vec4(fogIt(col, vWp), 1.0);
     }`,
    { uniforms: {
      uC1: { value: C(L.c1, [0.3, 0.3, 0.3]) }, uC2: { value: C(L.c2, [0.9, 0.9, 0.9]) }, uBill: { value: C(L.bill, [0.3, 0.3, 0.3]) },
      uHead: { value: C(L.head, L.hood || kind === 'frigate' ? L.c1 : L.c2) }, uCapC: { value: C(L.capCol, [0.05, 0.05, 0.06]) }, uFeet: { value: C(L.feet, [0.12, 0.12, 0.12]) },
      uIris: { value: C(L.iris, [0.06, 0.05, 0.05]) }, uFace: { value: C(L.face, [0.9, 0.9, 0.88]) }, uBreast: { value: C(L.breast, [0.94, 0.94, 0.92]) },
      uLook: { value: new THREE.Vector4(L.hood ? 1 : 0, capN === 4 ? 0 : capN, { white: 2, margin: 1, dark: 0 }[L.under ?? 'white'], L.sexes ? 1 : 0) },
      uLook2: { value: new THREE.Vector4(L.cheek ? 1 : 0, L.face ? 1 : 0, capN === 4 ? 1 : 0, kind === 'albatross' && L.c2[0] > 0.6 ? 1 : 0) },
      uEye: { value: new THREE.Vector4(M.eye[0], M.eye[1], M.eye[2], M.eyeR) },
      uZ: { value: new THREE.Vector4(M.neck[2], M.chest, M.billBase[2], M.tailBase) },
      uJ0: { value: new THREE.Vector3(M.shoulder[0], M.shoulder[1], M.shoulder[2] + 0.034 - f.wing[0][2] * 0.25) },
      uJ1: { value: jointAt(f, M, ELBOW) }, uJ2: { value: jointAt(f, M, WRIST) },
      uGlide: { value: new THREE.Vector4(...f.glide) },
      uNeck: { value: new THREE.Vector3(...M.neck) },
      uHip: { value: new THREE.Vector3(f.w * 0.32, birdProfile(f, 0.3).y - birdProfile(f, 0.3).h * 0.7, zOf(f, 0.3)) },
    }, defines: kind === 'tern' ? { TERN: '' } : {}, opts: { side: THREE.DoubleSide } });
}
// a wing's joint: on its bone, a quarter of the chord back from the leading edge
function jointAt(f: Form, M: ReturnType<typeof birdMarks>, s: number) {
  let i = 0; while (i < f.wing.length - 2 && f.wing[i + 1][0] < s) i++;
  const a = f.wing[i], b = f.wing[i + 1], k = (s - a[0]) / (b[0] - a[0]);
  const le = a[1] + (b[1] - a[1]) * k, c = a[2] + (b[2] - a[2]) * k;
  return new THREE.Vector3(M.shoulder[0] + s * (0.5 - M.shoulder[0]), M.shoulder[1], M.shoulder[2] + 0.034 + le - c * 0.25);
}
