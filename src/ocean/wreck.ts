// A wreck on the sand: the SS Carnatic (P&O, 1862; lost on Abu Nuhas in the northern Red Sea, 1869), an
// iron steamship with a sailing rig, 90 m long and 11.6 m in the beam. She lies on her port side at the
// foot of the reef on a sand slope, broken in two; her wooden decks have rotted away so that amidships
// the iron frames stand open like the ribs of a whale, and the light falls through them. Her masts lie
// out across the sand, her funnel beside her. A century and a half of the sea has crusted her in coral,
// sponge and red and purple soft coral, and glassfish crowd her shadows.
//
// Built in her own frame (x along her length, stern −, bow +; y up through her deck; z to starboard),
// rolled onto her side, set into the slope, and turned to lie along the reef. Her solid outline goes
// into the obstacle map, so fish and the drone keep out of her plating.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';
import { R, rr } from '../core/math';

export interface WreckSpec { x: number; z: number; rot: number; len: number; beam: number; depth: number }

const ROLL = -1.38;   // (onto her port side, a little short of flat)

export class Wreck {
  readonly spec: WreckSpec;
  readonly geo: THREE.BufferGeometry;
  readonly up: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];   // points on her upward faces (for the soft corals)
  readonly pts: THREE.Vector3[] = [];                            // every vertex, for the obstacle map
  readonly centre: THREE.Vector3;
  private f: (x: number, z: number) => number;
  private ax: THREE.Vector3; private az: THREE.Vector3;

  constructor(spec: WreckSpec, f: (x: number, z: number) => number) {
    this.spec = spec; this.f = f;
    this.ax = new THREE.Vector3(Math.cos(spec.rot), 0, -Math.sin(spec.rot));   // her length, in the world
    this.az = new THREE.Vector3(Math.sin(spec.rot), 0, Math.cos(spec.rot));    // across her
    const P: number[] = [], N: number[] = [], A: number[] = [], S: number[] = [];   // position, normal, part, (s, phi)
    const idx: number[] = [];
    const L = spec.len, B = spec.beam, D = spec.depth;
    // her lines: fine at the bow, fuller and rounded at the stern; a sheer that rises at both ends
    const half = (s: number) => s > 0.55
      ? B / 2 * Math.pow(Math.max(0, 1 - Math.pow((s - 0.55) / 0.45, 2.2)), 0.7) + 0.08            // (a fine bow, to a sharp stem)
      : B / 2 * (0.3 + 0.7 * Math.pow(Math.max(0, 1 - Math.pow((0.55 - s) / 0.55, 3)), 0.5));      // (a rounded counter stern)
    const dep = (s: number) => D + 1.4 * Math.pow(2 * s - 1, 4);
    // the two halves she broke into: the stern part settled a little more on its side, and slewed
    const pieces = [
      { s0: 0.0, s1: 0.44, roll: ROLL - 0.12, yaw: 0.07, off: new THREE.Vector3(-1.5, 0, 0.8) },
      { s0: 0.465, s1: 1.0, roll: ROLL, yaw: 0, off: new THREE.Vector3(0, 0, 0) },
    ];
    const _v = new THREE.Vector3(), _n = new THREE.Vector3();
    // ship frame → world, for a piece (and a point on the sand under her side for each station)
    const place = (pc: typeof pieces[0], x: number, y: number, z: number, out: THREE.Vector3) => {
      const c = Math.cos(pc.roll), si = Math.sin(pc.roll);
      let yy = y * c - z * si, zz = y * si + z * c;
      const cy = Math.cos(pc.yaw), sy = Math.sin(pc.yaw);
      const xx = x * cy - zz * sy; zz = x * sy + zz * cy;
      const wx = spec.x + this.ax.x * xx + this.az.x * zz + pc.off.x, wz = spec.z + this.ax.z * xx + this.az.z * zz + pc.off.z;
      // resting on her port side, bedded into the sand a metre, following the slope under her
      yy += B / 2 * Math.abs(si) * 0.98 - 1.0 + this.f(spec.x + this.ax.x * x + pc.off.x, spec.z + this.ax.z * x + pc.off.z);
      return out.set(wx, yy, wz);
    };
    const rotN = (pc: typeof pieces[0], n: THREE.Vector3) => {
      const c = Math.cos(pc.roll), si = Math.sin(pc.roll);
      const y = n.y * c - n.z * si; let z = n.y * si + n.z * c;
      const cy = Math.cos(pc.yaw), sy = Math.sin(pc.yaw);
      const x = n.x * cy - z * sy; z = n.x * sy + z * cy;
      return n.set(this.ax.x * x + this.az.x * z, y, this.ax.z * x + this.az.z * z);
    };
    const push = (p: THREE.Vector3, n: THREE.Vector3, part: number, s: number, ph: number) => {
      P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); A.push(part); S.push(s, ph);
      this.pts.push(p.clone());
      return P.length / 3 - 1;
    };
    // a point on her side: s along her (0 stern .. 1 bow), phi round the hull (−π/2 port rail .. 0 keel ..
    // π/2 starboard rail), inset toward the inside
    const hull = (s: number, ph: number, inset: number, o: THREE.Vector3) => {
      const hb = Math.max(half(s) - inset, 0.05), d = dep(s) - inset * 0.5;
      const sp = Math.sin(ph), cp = Math.cos(ph);
      return o.set((s - 0.5) * L, inset + (d - inset) * (1 - Math.pow(Math.abs(cp), 0.32)), hb * Math.sign(sp) * Math.pow(Math.abs(sp), 0.34));
    };
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
    for (const pc of pieces) {
      // the plating
      const NS = Math.round((pc.s1 - pc.s0) * 120), NP = 26, start = P.length / 3;
      for (let i = 0; i <= NS; i++) for (let j = 0; j <= NP; j++) {
        const s = pc.s0 + (pc.s1 - pc.s0) * i / NS, ph = -Math.PI / 2 + Math.PI * j / NP;
        hull(s, ph, 0, _a);
        const ds = 0.004, dp = 0.02;
        const tS = hull(Math.min(1, s + ds), ph, 0, new THREE.Vector3()).sub(hull(Math.max(0, s - ds), ph, 0, _c));
        const tP = hull(s, ph + dp, 0, new THREE.Vector3()).sub(hull(s, ph - dp, 0, _c));
        _n.crossVectors(tS, tP).normalize();
        if (_n.dot(_b.set(0, _a.y - dep(s) * 0.55, _a.z)) < 0) _n.negate();   // (outward, away from her middle)
        place(pc, _a.x, _a.y, _a.z, _v); rotN(pc, _n);
        push(_v, _n, 0, s, ph);
        if (_n.y > 0.75 && R() < 0.1) this.up.push({ p: _v.clone(), n: _n.clone() });
      }
      for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) { const a = start + i * (NP + 1) + j, b = a + NP + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      // the frames (ribs) inside her, every 1.8 m, and a deck beam across at the top of each
      for (let x = Math.ceil(pc.s0 * L / 1.8) * 1.8; x < pc.s1 * L - 0.5; x += 1.8) {
        const s = x / L, w = 0.32 / L, fs = P.length / 3, NF = 18;
        for (let j = 0; j <= NF; j++) {
          const ph = -Math.PI / 2 + Math.PI * j / NF;
          for (const k of [-1, 1]) {
            hull(s + k * w * 0.5, ph, 0.28, _a); _n.set(0, -Math.cos(ph), -Math.sin(ph) * 0.5).normalize();
            place(pc, _a.x, _a.y, _a.z, _v); rotN(pc, _n); push(_v, _n, 1, s, ph);
          }
        }
        for (let j = 0; j < NF; j++) { const a = fs + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        if (Math.round(x / 1.8) % 2 === 0) {   // (every other frame a deck beam, the rest long since fallen)
          const bs = P.length / 3, hb = half(s) - 0.3, y = dep(s) - 0.35;
          for (const zz of [-hb, hb]) for (const k of [-1, 1]) { _n.set(0, 1, 0); place(pc, (s - 0.5) * L + k * 0.14, y, zz, _v); rotN(pc, _n); push(_v, _n, 1, s, 0); }
          idx.push(bs, bs + 1, bs + 2, bs + 1, bs + 3, bs + 2);
        }
      }
    }
    // spars: a cylinder from a to b (world), radius r
    const spar = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, part: number) => {
      const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
      const u = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(dir).normalize() : new THREE.Vector3(1, 0, 0);
      const v = dir.clone().cross(u);
      const st = P.length / 3, RN = 10, LN = Math.max(2, Math.round(len / 2));
      for (let i = 0; i <= LN; i++) for (let k = 0; k < RN; k++) {
        const t = i / LN, an = k / RN * Math.PI * 2, r = r0 + (r1 - r0) * t;
        _n.copy(u).multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
        _v.copy(a).addScaledVector(dir, len * t).addScaledVector(_n, r);
        push(_v, _n, part, t, an);
      }
      for (let i = 0; i < LN; i++) for (let k = 0; k < RN; k++) { const a0 = st + i * RN + k, b0 = st + i * RN + (k + 1) % RN; idx.push(a0, a0 + RN, b0, b0, a0 + RN, b0 + RN); }
    };
    const shipPt = (pcI: number, x: number, y: number, z: number) => place(pieces[pcI], x, y, z, new THREE.Vector3());
    // her masts, snapped off and lying out over the sand from where they stood (she lies on her side,
    // so they point away along the seabed); the bowsprit; the funnel, fallen beside her
    const sand = (p: THREE.Vector3, lift = 0.35) => { p.y = this.f(p.x, p.z) + lift; return p; };
    const masts: [number, number, number][] = [[1, 0.78, 21], [1, 0.52, 14], [0, 0.3, 17]];
    for (const [pi, s, ml] of masts) {
      const foot = shipPt(pi, (s - 0.5) * L, dep(s) - 0.5, 0);
      const tip = sand(shipPt(pi, (s - 0.5) * L + rr(-3, 3), dep(s) + ml, rr(-2, 2)), 0.3);
      spar(foot, tip, 0.36, 0.2, 2);
    }
    spar(shipPt(1, 0.5 * L - 0.5, dep(1) - 0.6, 0), shipPt(1, 0.5 * L + 9, dep(1) + 3.5, 0), 0.3, 0.14, 2);
    const fa = sand(shipPt(1, (0.5 - 0.5) * L + 4, dep(0.5) + 2.5, -1), 1.15), fb = sand(fa.clone().addScaledVector(this.ax, 6), 1.15);
    spar(fa, fb, 1.15, 1.1, 3);
    // the rudder, still hung at her stern
    { const a = shipPt(0, -0.5 * L - 0.6, 0.5, 0), b = shipPt(0, -0.5 * L - 0.6, 5.0, 0); spar(a, b, 0.9, 0.5, 2); }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
    g.setAttribute('aSP', new THREE.Float32BufferAttribute(S, 2));
    g.setIndex(idx);
    this.geo = g;
    this.centre = place(pieces[1], 0, dep(0.6) * 0.5, 0, new THREE.Vector3());
  }

  // somewhere a school would hang about her: along her, in her lee and over her upper side
  spot(out = new THREE.Vector3()) {
    const s = rr(-0.42, 0.45) * this.spec.len, side = rr(-1, 1) * this.spec.beam * 0.9;
    const x = this.spec.x + this.ax.x * s + this.az.x * side, z = this.spec.z + this.ax.z * s + this.az.z * side;
    return out.set(x, this.f(x, z) + rr(3, 11), z);
  }

  // a slow glide along her, a few metres off the open deck side (where the frames stand bare and the
  // light comes through them), at half her height, looking in; reversed, from bow to stern
  readonly tourLength = 70;
  tourStart(rev: boolean) { const p = new THREE.Vector3(), l = new THREE.Vector3(); this.tourAt(0, rev, p, l); return p; }
  tourAt(t: number, rev: boolean, pos: THREE.Vector3, look: THREE.Vector3) {
    const k = Math.min(1, Math.max(0, t / this.tourLength)), e = k * k * (3 - 2 * k), s = (rev ? 0.46 - 0.9 * e : -0.44 + 0.9 * e) * this.spec.len;
    const off = -(this.spec.depth + 10);   // (off the deck side, rolled to face away across the sand: well clear of her)
    const x = this.spec.x + this.ax.x * s + this.az.x * off, z = this.spec.z + this.ax.z * s + this.az.z * off;
    pos.set(x, this.f(x, z) + 5 + Math.sin(k * 6) * 0.8, z);
    // looking in at her, a little ahead: the frames standing open, the dark inside, the light through her
    const ls = s + (rev ? -10 : 10), lx = this.spec.x + this.ax.x * ls - this.az.x * this.spec.depth * 0.5, lz = this.spec.z + this.ax.z * ls - this.az.z * this.spec.depth * 0.5;
    look.set(lx, this.f(lx, lz) + 4, lz);
  }
}

// Her material: iron, rusted and long since crusted over — coralline pinks and greys, orange and
// yellow sponge, the red and purple of soft corals on the faces that catch the light, dark inside her.
// Plating is holed amidships (rotted through), and gone in a ragged line where she broke.
export function wreckMaterial() {
  return mat(
    `attribute float aPart; attribute vec2 aSP; varying vec3 vWp; varying vec3 vN; varying float vPart; varying vec2 vSP;
     void main(){ vWp = position; vN = normal; vPart = aPart; vSP = aSP; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying float vPart; varying vec2 vSP;
     void main(){
       float s = vSP.x, ph = vSP.y;
       if (vPart < 0.5) {
         // rotted through amidships: big ragged holes in the plating, where the frames show
         float mid = smoothstep(0.2, 0.32, s) * (1.0 - smoothstep(0.7, 0.8, s));
         float hole = vn2(vec2(s * 34.0, ph * 3.2) + 4.0) * 0.75 + vn2(vec2(s * 110.0, ph * 9.0)) * 0.25;
         if (hole > 0.62 - 0.22 * mid && mid > 0.05 && ph > 0.35) discard;   // (her upper, starboard side: the one lying on the sand is whole)
         // and torn away where she broke
         float brk = min(abs(s - 0.44), abs(s - 0.465)) - 0.012 * vn2(vec2(ph * 6.0, s * 50.0));
         if (brk < 0.008) discard;
       }
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp);
       bool inside = dot(n, V) < 0.0; if (inside) n = -n;
       vec3 p = vWp;
       float a = vn2(p.xz * 0.35 + p.y * 0.2), b = vn2(p.xz * 1.3 - p.y * 0.4 + 7.0), c = vn2(p.xz * 3.1 + p.y * 1.1 - 3.0);
       vec3 rust = vec3(0.34, 0.2, 0.12), crust = vec3(0.42, 0.42, 0.36);
       vec3 alb = mix(rust, crust, smoothstep(0.3, 0.6, a));
       alb = mix(alb, vec3(0.62, 0.4, 0.46), smoothstep(0.6, 0.8, b) * 0.7);            // coralline algae
       alb = mix(alb, vec3(0.78, 0.48, 0.18), smoothstep(0.72, 0.86, c) * 0.7);          // orange sponge
       alb = mix(alb, vec3(0.8, 0.7, 0.3), smoothstep(0.78, 0.9, vn2(p.xz * 2.2 + 13.0)) * 0.5);   // yellow sponge
       // soft corals on what faces up and into the current: red, pink and purple tufts
       float up = smoothstep(0.3, 0.8, n.y);
       float tuft = smoothstep(0.55, 0.75, vn2(p.xz * 4.0 + p.y * 2.0) * 0.6 + vn2(p.xz * 11.0) * 0.4);
       vec3 soft = mix(vec3(0.62, 0.24, 0.3), vec3(0.5, 0.28, 0.5), vn2(p.xz * 0.8 + 21.0));
       alb = mix(alb, soft, tuft * up * smoothstep(0.45, 0.65, vn2(p.xz * 0.5 + 30.0)) * 0.6);
       // rivet lines and plate seams on the plating, still showing under the growth
       if (vPart < 0.5) { float seam = 1.0 - smoothstep(0.0, 0.05, abs(fract(s * 45.0) - 0.5) - 0.44); alb *= 1.0 - 0.3 * seam * (1.0 - smoothstep(0.4, 0.7, a)); }
       if (vPart > 2.5) alb = mix(alb, vec3(0.25, 0.16, 0.1), 0.4);                       // (the funnel)
       float h = a * 0.6 + b * 0.3 + c * 0.4 + tuft * up * 0.6;
       n = bumpN(n, vWp, h * 0.06);
       vec3 col = shade(alb, vWp, n, 0.5);
       if (inside) col *= 0.7;                                                           // (in her shadow)
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS }, opts: { side: THREE.DoubleSide } });
}
