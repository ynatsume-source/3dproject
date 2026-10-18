// What the husk-and-cord work leaves at a worksite, as it looks (nature team, 2026-10-17; owner's decision: the shell
// and cord work is in the 24-hour stream). The world says what is there and in which state it looks (WorksiteLook,
// built by the host from the science side's public readings and observations); this only draws it.
//  - First piece: the fibre bundle beaten out of a soaked husk — wet (dark chestnut, heavy, lying close and a little
//    glossy) or dry (pale golden tan, springy, the ends standing apart).
//  - Nothing here reads a hidden value (strength, water, mass, count): only kind and look.
//  - Each bundle's own small differences (turn, length, lean) come from its id, never from Math.random or the
//    island's stream. Every three.js object is made inside `quiet()`, which lends three.js a stream of its own for the
//    ids it draws — so adding this look leaves the world's random draws, and the count of them, as they were.
// Test knob: ?coirlook=wet|dry|both lays a test worksite by Dot's home (LAB; the host's WorksiteLook replaces it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from '../render/common';
import { AIRLIT } from '../ocean/shore';
import { draw } from '../science/rng';

import { WORKSITE_LOOK_FIXTURES, type WorksiteLook } from '../world/worksite-look';

const SEED = 0x6c6f6f6b;   // 'look'
const u = (id: string, ...k: string[]) => draw(SEED, id, 'look', ...k);

// three.js draws Math.random for every id it gives (four per uuid). Made in here, those draws come from a stream of the
// look's own, keyed by what is being made, and the world's Math.random is handed back untouched.
let made = 0;
function quiet<T>(what: string, f: () => T): T {
  const keep = Math.random; let n = 0; const key = `${what}#${made++}`;
  Math.random = () => draw(SEED, 'three-ids', key, String(n++));
  try { return f(); } finally { Math.random = keep; }
}

/* ---------- the bundle's shape: a hank of coarse fibres lying along x, about 34 cm long ---------- */
// Each fibre a narrow ribbon (wide enough not to shimmer at the stream's distance: a few millimetres), bent along a
// gentle curve; the bundle's cross-section a soft lens. Wet: drawn close and sagging to the ground. Dry: the middle
// still gathered, the ends standing apart and lifting a little, each fibre with its own slight wave.
// Far off (LOD_M and on) the same hank drawn with a few wide strands: fibres thinner than a pixel at the stream's distance
// would shimmer as the camera drifts (tools/lab/flicker.cjs).
const FIBRES = 72, FAR_FIBRES = 14, SEGS = 9, LOD_M = 3.5;
function bundleGeo(dry: boolean, far = false): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let f = 0; f < (far ? FAR_FIBRES : FIBRES); f++) {
    const r = (k: string) => u('fibre-shape', dry ? 'dry' : 'wet', String(f), k);
    const L = 0.3 + 0.08 * r('len'), a = r('ang') * Math.PI * 2, rad = Math.sqrt(r('rad'));
    const y0 = (dry ? 0.04 : 0.024) * (0.25 + 0.75 * rad) * (0.6 + 0.4 * Math.sin(a)) + 0.004;   // (a soft lens: more fibres low down)
    const z0 = (dry ? 0.045 : 0.04) * rad * Math.cos(a);
    const w = (dry ? 0.007 : 0.009) * (far ? 3.5 : 1), tone = 0.8 + 0.4 * r('tone'), x0 = (r('off') - 0.5) * 0.05;
    const wave = dry ? 0.006 + 0.006 * r('wave') : 0.0015, ph = r('ph') * 6.28;
    const base = pos.length / 3;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS, x = x0 + (t - 0.5) * L, e = Math.abs(t - 0.5) * 2;   // e: 0 at the middle, 1 at an end
      const spread = dry ? 1 + 1.6 * e * e : 1 + 0.25 * e * e;   // (dry ends stand apart; wet stay close)
      const y = Math.max(0.002, y0 * (dry ? 1 + 0.5 * e * e : 1 - 0.55 * e * e)) + Math.sin(t * 9 + ph) * wave * (dry ? 1 : 0.4);
      const z = z0 * spread + Math.cos(t * 7 + ph) * wave;
      for (const side of [-1, 1]) {
        pos.push(x, y, z + side * w * 0.5);
        col.push(tone, tone * (0.97 + 0.06 * t), tone);
      }
      if (s < SEGS) { const i = base + s * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aIn', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(1), 1)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- a piece of coconut husk: a thick curved wedge of the shell, lying rind-up, about 22 cm long ---------- */
// Outside the rind (aIn 0), inside and along the cut edges the fibrous husk (aIn 1). Soaked whole ('wet-husk'): thick,
// lying rind-up. Beaten ('partial-husk'): thinner, lying open side up — its inside scored along its length where the
// fibre was beaten out (streaks drawn in the shader) — and a fringe of loose fibres at its edges, only near (LOD_M).
// About 26 cm long.
function huskGeo(partial: boolean, fringe = false): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], inn: number[] = [], idx: number[] = [];
  const A = 0.13, Bv = 0.06, C = 0.07, P0 = 0.12 * Math.PI, P1 = 0.88 * Math.PI, T = 0.85, NU = 10, NV = 14;
  const k = partial ? 0.74 : 0.6;   // (the inner surface: the thinner the shell, the more beaten out)
  const at = (u: number, v: number, s: number) => { const ph = P0 + (P1 - P0) * v, th = (u * 2 - 1) * T; return [A * Math.cos(ph) * (s > 0.99 ? 1 : 0.96), Bv * Math.sin(ph) * Math.cos(th) * s, C * Math.sin(ph) * Math.sin(th) * s]; };
  const y0 = Bv * Math.sin(P0) * Math.cos(T) * k;   // (rind-up, it rests on its lowest edge; open side up, on its rind)
  const lift = (y: number) => partial ? Bv - y : y - y0 * 0.6;
  const push = (p: number[], inside: number, tone: number, raw = true) => { pos.push(p[0], raw ? lift(p[1]) : p[1], p[2]); col.push(tone, tone, tone); inn.push(inside); return pos.length / 3 - 1; };
  if (!fringe) {
    for (const [s, inside] of [[1, 0], [k, 1]] as [number, number][]) {   // the rind, then the fibrous inside
      const b = pos.length / 3;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) push(at(i / NU, j / NV, s), inside, 0.92 + 0.16 * u('husk', partial ? 'p' : 'w', String(i), String(j)));
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = b + j * (NU + 1) + i; inside ? idx.push(a, a + 1, a + NU + 1, a + 1, a + NU + 2, a + NU + 1) : idx.push(a, a + NU + 1, a + 1, a + 1, a + NU + 1, a + NU + 2); }
    }
    // the cut edges all round, joining rind to inside (fibrous)
    const rim: [number, number][] = [];
    for (let i = 0; i <= NU; i++) rim.push([i / NU, 0]); for (let j = 1; j <= NV; j++) rim.push([1, j / NV]);
    for (let i = NU - 1; i >= 0; i--) rim.push([i / NU, 1]); for (let j = NV - 1; j >= 1; j--) rim.push([0, j / NV]);
    for (let r = 0; r < rim.length; r++) {
      const [ua, va] = rim[r], [ub, vb] = rim[(r + 1) % rim.length];
      const a = push(at(ua, va, 1), 1, 1), b = push(at(ub, vb, 1), 1, 1), c = push(at(ub, vb, k), 1, 1), d = push(at(ua, va, k), 1, 1);
      idx.push(a, b, c, a, c, d);
    }
  } else {
    // loose fibres hanging from the long edges, splaying out and down to the sand (narrow ribbons, as the bundles')
    for (let f = 0; f < 40; f++) {
      const r = (q: string) => u('husk-fringe', String(f), q), side = f % 2 ? 1 : -1, v = 0.1 + 0.8 * r('v');
      const e = at(side > 0 ? 1 : 0, v, (1 + k) / 2), ey = lift(e[1]), L = 0.05 + 0.06 * r('len'), w = 0.004, b = pos.length / 3;
      const dx = (r('dx') - 0.5) * 0.4, dz = side * (0.6 + 0.4 * r('dz'));
      for (let s2 = 0; s2 <= 4; s2++) {
        const t = s2 / 4, p = [e[0] + dx * L * t, Math.max(0.002, ey - t * t * 0.06), e[2] + dz * L * t];   // (out and down to the sand)
        push([p[0] - w * 0.5, p[1], p[2]], 1, 0.9 + 0.2 * r('tone'), false); push([p[0] + w * 0.5, p[1], p[2]], 1, 0.9 + 0.2 * r('tone'), false);
        if (s2 < 4) { const i = b + s2 * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aIn', new THREE.Float32BufferAttribute(inn, 1)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- yarn and cord: laid in a loose flat coil on the ground, the same size whatever their length ---------- */
// (the length is the world's hidden value: a coil never says how long it is.) Yarn a thin strand; cord about twice as
// thick, its plies twisted round one another (helical bands in the shader, aTw). 'fuzzy' yarn and 'frayed' cord have
// short fibre ends standing off the strand; 'broken' cord lies in two, the ends at the break splayed. The fibre ends are
// drawn near only (LOD_M), as the bundles'.
// (a loose coil as one would lay it down by hand: rounder in one place, flatter in another, not a perfect spiral)
function coilAt(t: number, turns: number, r0: number, r1: number) {
  const pt = (t: number) => { const a = t * turns * Math.PI * 2, r = (r0 + (r1 - r0) * Math.sqrt(t)) * (1 + 0.16 * Math.sin(a * 1.5 + 0.7) + 0.07 * Math.sin(a * 3.7 + 2.1)); return new THREE.Vector3(Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 0.9); };
  const p = pt(t), d = pt(Math.min(1, t + 0.002)).sub(pt(Math.max(0, t - 0.002))).normalize();
  return { p, d };
}
function strandGeo(cord: boolean, part: 'body' | 'fuzz', fuzzy: boolean, broken: boolean): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], tw: number[] = [], idx: number[] = [];
  const R = cord ? 0.009 : 0.0045, turns = cord ? 1.7 : 2.1, r0 = cord ? 0.05 : 0.035, r1 = cord ? 0.14 : 0.1, N = 140, SEG = 7, plies = cord ? 3 : 2;
  const gap = (t: number) => broken && t > 0.55 && t < 0.6;   // (the break: a short gap, both ends splayed)
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  if (part === 'body') {
    let run = -1;
    for (let i = 0; i <= N; i++) {
      const t = i / N; if (gap(t)) { run = -1; continue; }
      const { p, d } = coilAt(t, turns, r0, r1); side.crossVectors(d, up).normalize();
      const b = pos.length / 3, sLen = t * turns * Math.PI * (r0 + r1);   // (about the length along the strand, m)
      for (let k = 0; k < SEG; k++) {
        const a = k / SEG * Math.PI * 2; nrm.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
        pos.push(p.x + nrm.x * R, R + nrm.y * R, p.z + nrm.z * R); col.push(1, 1, 1);
        tw.push(a * plies / (Math.PI * 2) * 6.2832 + sLen / (R * 7.0) * 6.2832);   // (the plies' bands wind round the strand)
      }
      if (run >= 0) for (let k = 0; k < SEG; k++) { const a0 = run + k, a1 = run + (k + 1) % SEG, b0 = b + k, b1 = b + (k + 1) % SEG; idx.push(a0, b0, a1, a1, b0, b1); }
      run = b;
    }
  } else {
    // fibre ends standing off the strand: short narrow ribbons, out and a little up; for a break, a tuft at each end
    const n = fuzzy ? 70 : broken ? 40 : 34;
    for (let f = 0; f < n; f++) {
      const r = (q: string) => u('strand-fuzz', cord ? 'c' : 'y', fuzzy ? 'f' : broken ? 'b' : 'r', String(f), q);
      let t = r('t');
      if (broken) t = f % 2 ? 0.55 - 0.01 * r('dt') : 0.6 + 0.01 * r('dt'); else if (gap(t)) continue;
      const { p, d } = coilAt(t, turns, r0, r1); side.crossVectors(d, up).normalize();
      const a = r('a') * Math.PI * 2, out = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.abs(Math.sin(a)) * 0.6 + 0.2).normalize();
      if (broken) out.addScaledVector(d, f % 2 ? 1.2 : -1.2).normalize();   // (splayed out of the broken end)
      const L = (broken ? 0.025 : 0.008) + (broken ? 0.02 : 0.01) * r('len'), w = cord ? 0.0025 : 0.0018, b = pos.length / 3;
      const base = new THREE.Vector3(p.x, R, p.z).addScaledVector(out, R * 0.8), wv = d.clone().multiplyScalar(w * 0.5);
      for (let s2 = 0; s2 <= 2; s2++) {
        const q = base.clone().addScaledVector(out, L * s2 / 2); q.y = Math.max(0.001, q.y - s2 * s2 * 0.002);
        pos.push(q.x - wv.x, q.y, q.z - wv.z, q.x + wv.x, q.y, q.z + wv.z); col.push(1.1, 1.1, 1.1, 1.1, 1.1, 1.1); tw.push(0, 0);
        if (s2 < 2) { const i0 = b + s2 * 2; idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aIn', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(1), 1)); g.setAttribute('aTw', new THREE.Float32BufferAttribute(tw, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- what stands at a worksite: the beating board and the drying rack ---------- */
// Drawn only once the world has put one there (WorksiteLook.fixtures). The board: a thick plank of weathered wood laid
// on the sand, about 60 × 28 cm, its grain along it. The rack: a pole on two forked sticks, about 1.1 m long and 0.85 m
// up — what is drying hangs or lies by it as the world says (not drawn on it unless told).
function woodGeo(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }))!;
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3)); g.setAttribute('aIn', new THREE.Float32BufferAttribute(new Array(n).fill(1), 1));
  return g;
}
function boardGeo(): THREE.BufferGeometry {
  const b = new THREE.BoxGeometry(0.6, 0.075, 0.28, 6, 1, 3); b.translate(0, 0.03, 0);   // (sunk a little into the sand)
  const P = b.getAttribute('position');
  for (let k = 0; k < P.count; k++) { const x = P.getX(k), z = P.getZ(k); if (P.getY(k) > 0.05) P.setY(k, P.getY(k) - 0.008 * (Math.abs(z) / 0.14) ** 2 - 0.004 * (Math.abs(x) / 0.3) ** 4); }   // (the top worn a little round)
  return woodGeo([b]);
}
function rackGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stick = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const c = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 6, 1); const d = b.clone().sub(a).normalize();
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(c);
  };
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const sx of [-1, 1]) {
    const lean = (u('rack-shape', String(sx)) - 0.5) * 0.04;
    stick(V3(sx * 0.52, -0.08, 0), V3(sx * 0.52 + lean, 0.8, 0), 0.026, 0.02);   // (pushed into the sand)
    stick(V3(sx * 0.52 + lean, 0.78, 0), V3(sx * 0.52 + lean - 0.05, 0.9, 0.03), 0.017, 0.012);   // the fork
    stick(V3(sx * 0.52 + lean, 0.78, 0), V3(sx * 0.52 + lean + 0.05, 0.9, -0.03), 0.017, 0.012);
  }
  stick(V3(-0.6, 0.85, 0), V3(0.6, 0.85, 0), 0.018, 0.016);   // the pole, resting in the forks
  return woodGeo(parts);
}

/* ---------- the material: lit as the residents' things are (the island's air light), wet glossier ---------- */
// uFar: 0 drawn only near (closer than LOD_M), 1 only far, -1 always. Near and far each hold every thing of theirs; each
// keeps only its own side of LOD_M from the camera, the other's collapsed out of view — chosen per thing in the vertex
// shader, with no work on the CPU each frame. uStreak: the scored inside of a beaten husk (long, soft streaks along it).
type Tone = { out: number; inn: number; spec: number; streak?: number; twist?: number };
function thingMat(t: Tone, far: number): THREE.Material {
  return mat(
    `uniform float uFar; uniform float uLod; attribute vec3 color; attribute float aIn; attribute float aTw; varying vec3 vWp; varying vec3 vN; varying vec3 vC; varying float vIn; varying vec3 vLp; varying float vTw;
     void main(){ mat4 mm = modelMatrix;
       #ifdef USE_INSTANCING
       mm = mm * instanceMatrix;
       #endif
       vec4 w = mm * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(mm) * normal); vC = color; vIn = aIn; vLp = position; vTw = aTw; gl_Position = projectionMatrix * viewMatrix * w;
       float isFar = step(uLod, distance(uCamPos, (mm * vec4(0.0, 0.0, 0.0, 1.0)).xyz));
       if (uFar > -0.5 && abs(isFar - uFar) > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,
    AIRLIT + `uniform vec3 uOut; uniform vec3 uIn; uniform float uSpec; uniform float uStreak; uniform float uTwist; varying vec3 vWp; varying vec3 vN; varying vec3 vC; varying float vIn; varying vec3 vLp; varying float vTw;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (!gl_FrontFacing) n = -n;
       if (n.y < 0.0) n = normalize(n + vec3(0.0, 0.8, 0.0));   // (a fibre's underside still faces the thing's own light)
       // (streaks along the length: soft bands, faded where they would be finer than a pixel)
       float sc = vLp.z * 160.0, aa = clamp(1.0 - length(fwidth(vLp)) * 160.0 * 0.6, 0.0, 1.0);
       float streak = 1.0 - uStreak * vIn * aa * (0.5 + 0.5 * sin(sc + sin(vLp.x * 40.0) * 1.5));
       // (a cord's plies: helical bands round it, faded where they would be finer than a pixel)
       float twa = clamp(1.0 - fwidth(vTw) * 0.35, 0.0, 1.0), twist = 1.0 - uTwist * twa * (0.5 + 0.5 * cos(vTw));
       vec3 alb = mix(uOut, uIn, vIn) * vC * streak * twist;
       vec3 col = airLit(alb, n, vWp, 0.45);
       col += alb * sunAirCol() * max(uAirSun.y, 0.0) * 0.12;   // light thrown back up by the sand
       vec3 H = normalize(uAirSun + V);
       col += sunAirCol() * pow(max(dot(n, H), 0.0), 24.0) * uSpec * (1.0 - 0.7 * uCloud);   // wet: a soft sheen
       col = fogIt(col, vWp);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uOut: { value: new THREE.Color(t.out) }, uIn: { value: new THREE.Color(t.inn) }, uSpec: { value: t.spec }, uStreak: { value: t.streak ?? 0 }, uTwist: { value: t.twist ?? 0 }, uFar: { value: far }, uLod: { value: LOD_M } }, opts: { side: THREE.DoubleSide } });
}

// what each kind looks like in each of its states, and how wide it lies (for laying them side by side)
const TONES: Record<string, Tone> = {
  'fiber-bundle/wet': { out: 0x3a271a, inn: 0x3a271a, spec: 0.7 }, 'fiber-bundle/dry': { out: 0xa98052, inn: 0xa98052, spec: 0.05 },
  'wet-husk/wet': { out: 0x3b2a1c, inn: 0x4a2c1a, spec: 0.25 }, 'wet-husk/dry': { out: 0x7a6248, inn: 0x9a6c42, spec: 0.08 },
  'partial-husk/wet': { out: 0x3b2a1c, inn: 0x5a3820, spec: 0.25, streak: 0.22 }, 'partial-husk/dry': { out: 0x7a6248, inn: 0xb0844f, spec: 0.06, streak: 0.18 },
  'yarn/fuzzy': { out: 0xa47c4b, inn: 0xa47c4b, spec: 0.03, twist: 0.25 }, 'yarn/smooth': { out: 0x93693e, inn: 0x93693e, spec: 0.12, twist: 0.35 },
  'fixture/beat-board': { out: 0x8a7457, inn: 0x8a7457, spec: 0.04, streak: 0.14 }, 'fixture/drying-rack': { out: 0x9a8660, inn: 0x9a8660, spec: 0.04, streak: 0.1 },
  'cord/smooth': { out: 0x87603a, inn: 0x87603a, spec: 0.1, twist: 0.4 }, 'cord/frayed': { out: 0x9f7c55, inn: 0x9f7c55, spec: 0.04, twist: 0.3 }, 'cord/broken': { out: 0x9f7c55, inn: 0x9f7c55, spec: 0.04, twist: 0.3 },
};
const WIDE: Record<string, number> = { 'fiber-bundle': 0.16, 'wet-husk': 0.2, 'partial-husk': 0.24, yarn: 0.2, cord: 0.26, 'beat-board': 0.7, 'drying-rack': 1.3 };
const CAP = 12;   // of each kind and look, over all worksites

export function makeCoirLook(parent: THREE.Group, groundAt: (x: number, z: number) => number) {
  // per kind/look: the meshes that together draw it (each holding every one of them; see thingMat)
  const built = quiet('coir-look', () => {
    const group = new THREE.Group(); group.name = 'coir-look'; parent.add(group);
    const mk = (g: THREE.BufferGeometry, t: Tone, far: number) => { if (!g.getAttribute('aTw')) g.setAttribute('aTw', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count).fill(0), 1)); const m = new THREE.InstancedMesh(g, thingMat(t, far), CAP); m.count = 0; m.frustumCulled = false; group.add(m); return m; };
    const sets: Record<string, THREE.InstancedMesh[]> = {};
    for (const look of ['wet', 'dry']) {
      const dry = look === 'dry';
      sets[`fiber-bundle/${look}`] = [mk(bundleGeo(dry), TONES[`fiber-bundle/${look}`], 0), mk(bundleGeo(dry, true), TONES[`fiber-bundle/${look}`], 1)];
      sets[`wet-husk/${look}`] = [mk(huskGeo(false), TONES[`wet-husk/${look}`], -1)];
      sets[`partial-husk/${look}`] = [mk(huskGeo(true), TONES[`partial-husk/${look}`], -1), mk(huskGeo(true, true), TONES[`partial-husk/${look}`], 0)];
    }
    sets['yarn/fuzzy'] = [mk(strandGeo(false, 'body', true, false), TONES['yarn/fuzzy'], -1), mk(strandGeo(false, 'fuzz', true, false), TONES['yarn/fuzzy'], 0)];
    sets['yarn/smooth'] = [mk(strandGeo(false, 'body', false, false), TONES['yarn/smooth'], -1)];
    sets['cord/smooth'] = [mk(strandGeo(true, 'body', false, false), TONES['cord/smooth'], -1)];
    sets['cord/frayed'] = [mk(strandGeo(true, 'body', false, false), TONES['cord/frayed'], -1), mk(strandGeo(true, 'fuzz', false, false), TONES['cord/frayed'], 0)];
    sets['cord/broken'] = [mk(strandGeo(true, 'body', false, true), TONES['cord/broken'], -1), mk(strandGeo(true, 'fuzz', false, true), TONES['cord/broken'], 0)];
    sets['fixture/beat-board'] = [mk(boardGeo(), TONES['fixture/beat-board'], -1)];
    sets['fixture/drying-rack'] = [mk(rackGeo(), TONES['fixture/drying-rack'], -1)];
    return { group, sets };
  });
  const { group, sets } = built;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  /** Lay out what each worksite has. `where` gives a worksite's spot on the ground ([x, z] and which way it faces);
   *  sites it does not know are not drawn. Drawn: fibre bundles, soaked and beaten husks (each wet or dry), yarn
   *  (fuzzy, smooth) and cord (smooth, frayed, broken); any other kind/look pair is skipped. */
  function set(looks: WorksiteLook[], where: (siteId: string) => { x: number; z: number; face: number } | null) {
    for (const ms of Object.values(sets)) for (const m of ms) m.count = 0;
    for (const site of looks) {
      const at = where(site.siteId); if (!at) continue;
      // (what stands there first — only what the world has put there — then the things, side by side along the site)
      const shown = [...(site.fixtures ?? []).map((f) => ({ id: f.id, kind: f.kind, key: `fixture/${f.kind}` })), ...site.items.map((it) => ({ id: it.id, kind: it.kind, key: `${it.kind}/${it.look}` }))].filter((it) => sets[it.key]);
      const width = shown.reduce((w, it) => w + WIDE[it.kind], 0);
      let off = -width / 2;
      for (const it of shown) {
        const ms = sets[it.key], w = WIDE[it.kind]; off += w / 2;
        if (ms[0].count < CAP) {
          // (side by side across the worksite, as they would be laid down; each its own small turn and size)
          const j = (u(it.id, 'jit') - 0.5) * 0.04;
          const x = at.x + Math.cos(at.face) * off - Math.sin(at.face) * j, z = at.z - Math.sin(at.face) * off - Math.cos(at.face) * j;
          _e.set(0, at.face + (it.key.startsWith('fixture/') ? 0 : Math.PI / 2) + (u(it.id, 'turn') - 0.5) * (it.key.startsWith('fixture/') ? 0.12 : it.kind === 'fiber-bundle' ? 0.35 : 0.8), 0); _q.setFromEuler(_e);
          const sc = it.key.startsWith('fixture/') ? 1 : 0.9 + 0.2 * u(it.id, 'size');
          _m.compose(_p.set(x, groundAt(x, z), z), _q, _s.set(sc, sc, sc));
          const k = ms[0].count; for (const m of ms) { m.setMatrixAt(k, _m); m.count = k + 1; }
        }
        off += w / 2;
      }
    }
    for (const ms of Object.values(sets)) for (const m of ms) m.instanceMatrix.needsUpdate = true;
  }
  const counts = () => Object.fromEntries(Object.entries(sets).map(([k, ms]) => [k, ms[0].count]));
  /** Keep to what the world says: read `looks()` and `spots()` (the residents' worksiteLooks / worksiteSpots) about once
   *  a second while drawn — laid out again only when something there has changed. */
  let readAt = -1e9, last = '';
  function follow(looks: () => WorksiteLook[], spots: () => Record<string, { x: number; z: number }>, face = 0.4) {
    sets['fiber-bundle/wet'][0].onBeforeRender = () => {   // (always drawn: frustumCulled off; a mesh's hook, so it costs nothing when the sea is not)
      const now = performance.now(); if (now - readAt < 1000) return; readAt = now;
      const L = looks(), key = JSON.stringify(L); if (key === last) return; last = key;
      const S = spots(); set(L, (id) => (S[id] ? { x: S[id].x, z: S[id].z, face } : null));
    };
  }
  return { group, set, follow, counts };
}

/** LAB: the test knob's worksite by Dot's home: ?coirlook=wet|dry|bare — main's test data (WORKSITE_LOOK_FIXTURES 'fiber-wet':
 *  the beating board with wet fibre and a beaten husk; 'fiber-dry': the drying rack with dry fibre; 'bare-site': nothing); ?coirlook=both — two bundles of each look side by side; ?coirlook=all — every kind drawn so far, wet
 *  and dry (a soaked husk, a beaten husk and a bundle of each); ?coirlook=cord — yarn fuzzy and smooth, cord smooth,
 *  frayed and broken. */
export function coirLookTest(q: string): WorksiteLook[] | null {
  const m = /[?&]coirlook=(wet|dry|bare|both|all|cord)/.exec(q); if (!m) return null;
  if (m[1] === 'wet' || m[1] === 'dry' || m[1] === 'bare') return [WORKSITE_LOOK_FIXTURES[m[1] === 'wet' ? 'fiber-wet' : m[1] === 'dry' ? 'fiber-dry' : 'bare-site']];
  if (m[1] === 'cord') return [{ siteId: 'test', fixtures: [], items: ([['yarn', 'fuzzy'], ['yarn', 'smooth'], ['cord', 'smooth'], ['cord', 'frayed'], ['cord', 'broken']] as const).map(([kind, look], i) => ({ id: `test-${kind}-${i}`, kind, look })) }];
  const list: [WorksiteLook['items'][number]['kind'], 'wet' | 'dry'][] = m[1] === 'both' ? [['fiber-bundle', 'wet'], ['fiber-bundle', 'wet'], ['fiber-bundle', 'dry'], ['fiber-bundle', 'dry']]
    : [['wet-husk', 'wet'], ['partial-husk', 'wet'], ['fiber-bundle', 'wet'], ['wet-husk', 'dry'], ['partial-husk', 'dry'], ['fiber-bundle', 'dry']];
  return [{ siteId: 'test', fixtures: [], items: list.map(([kind, look], i) => ({ id: `test-${kind}-${i}`, kind, look })) }];
}
