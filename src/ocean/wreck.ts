// Carnatic visual study, not a survey reconstruction. Iron hull, two displaced pieces and a lost
// timber deck. Details whose original arrangement is uncertain are listed in docs/proposals/carnatic-wreck/.
// Ship coordinates: x stern→bow, y keel→deck, z port→starboard. Keep the public fish/tour API stable.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';
import { R, rr } from '../core/math';

export interface WreckSpec { x: number; z: number; rot: number; len: number; beam: number; depth: number }
const ROLL = -1.38;

export class Wreck {
  readonly spec: WreckSpec;
  readonly geo: THREE.BufferGeometry;
  readonly up: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  readonly pts: THREE.Vector3[] = [];
  readonly centre: THREE.Vector3;
  readonly landmarks: { bow: THREE.Vector3; stern: THREE.Vector3; break: THREE.Vector3 };
  private f: (x: number, z: number) => number;
  private ax: THREE.Vector3; private az: THREE.Vector3;

  constructor(spec: WreckSpec, f: (x: number, z: number) => number) {
    this.spec = spec; this.f = f;
    this.ax = new THREE.Vector3(Math.cos(spec.rot), 0, -Math.sin(spec.rot));
    this.az = new THREE.Vector3(Math.sin(spec.rot), 0, Math.cos(spec.rot));
    const L = spec.len, B = spec.beam, D = spec.depth;
    const P: number[] = [], N: number[] = [], A: number[] = [], S: number[] = [], idx: number[] = [];
    // Rounded counter stern, a long parallel body and a fine bow; modest sheer at both ends.
    const half = (s: number) => B / 2 * (s > 0.57
      ? Math.pow(Math.max(0, 1 - Math.pow((s - 0.57) / 0.43, 2)), 0.72)
      : 0.10 + 0.90 * Math.sqrt(Math.max(0, 1 - Math.pow((0.57 - s) / 0.57, 4)))) + 0.045;
    const dep = (s: number) => D + 0.9 * Math.pow(2 * s - 1, 4);
    // Rounded bilge: unlike a flat strip, each transverse frame reads as a bent iron member.
    const hull = (s: number, ph: number, inset = 0) => new THREE.Vector3((s - 0.5) * L,
      inset + (dep(s) - inset) * (1 - Math.pow(Math.max(0, Math.cos(ph)), 0.64)),
      Math.max(0.02, half(s) - inset) * Math.sign(ph) * Math.pow(Math.abs(Math.sin(ph)), 0.72));
    const pieces = [
      { s0: 0, s1: 0.435, roll: ROLL - 0.10, yaw: 0.055, off: new THREE.Vector3(-1.6, 0, 0.8), base: 0 },
      { s0: 0.482, s1: 1, roll: ROLL, yaw: 0, off: new THREE.Vector3(), base: 0 },
    ];
    type Piece = typeof pieces[number];
    const rotate = (pc: Piece, p: THREE.Vector3) => {
      const yy = p.y * Math.cos(pc.roll) - p.z * Math.sin(pc.roll);
      const zz = p.y * Math.sin(pc.roll) + p.z * Math.cos(pc.roll);
      const xx = p.x * Math.cos(pc.yaw) - zz * Math.sin(pc.yaw), z = p.x * Math.sin(pc.yaw) + zz * Math.cos(pc.yaw);
      return p.set(this.ax.x * xx + this.az.x * z, yy, this.ax.z * xx + this.az.z * z);
    };
    const place = (pc: Piece, p: THREE.Vector3) => rotate(pc, p).add(pc.off).add(new THREE.Vector3(spec.x, pc.base, spec.z));
    // Each half is rigid. Fit its underside to the bed once, rather than bending every frame to f().
    for (const pc of pieces) {
      let base = -Infinity;
      for (let i = 1; i < 24; i++) for (let j = 0; j <= 12; j++) {
        const p = rotate(pc, hull(pc.s0 + (pc.s1 - pc.s0) * i / 24, -Math.PI / 2 + j * Math.PI / 12));
        base = Math.max(base, f(spec.x + p.x + pc.off.x, spec.z + p.z + pc.off.z) - p.y - 0.7);
      }
      pc.base = base;
    }
    const vertex = (p: THREE.Vector3, n: THREE.Vector3, part: number, s = 0, ph = 0) => {
      P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); A.push(part); S.push(s, ph); this.pts.push(p.clone());
      return P.length / 3 - 1;
    };
    // Closed rectangular members: faces catch the light even when seen edge-on.
    const beam = (a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, part = 1) => {
      const dir = b.clone().sub(a), len = dir.length(); if (len < 0.001) return;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      append(new THREE.BoxGeometry(width, len, depth), a.clone().add(b).multiplyScalar(0.5), q, part);
    };
    const append = (g: THREE.BufferGeometry, at: THREE.Vector3, q: THREE.Quaternion, part: number) => {
      const start = P.length / 3, p = g.getAttribute('position'), n = g.getAttribute('normal');
      for (let i = 0; i < p.count; i++) vertex(new THREE.Vector3().fromBufferAttribute(p, i).applyQuaternion(q).add(at), new THREE.Vector3().fromBufferAttribute(n, i).applyQuaternion(q), part);
      if (g.index) for (const k of g.index.array) idx.push(start + k);
      g.dispose();
    };
    const tube = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, part = 2, open = false) => {
      const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      append(new THREE.CylinderGeometry(r1, r0, d.length(), 12, Math.max(1, Math.ceil(d.length() / 1.5)), open), a.clone().add(b).multiplyScalar(0.5), q, part);
    };
    for (const pc of pieces) {
      const point = (s: number, ph: number, inset = 0) => place(pc, hull(s, ph, inset));
      // Physical missing plates: only surviving panels contribute to the conservative height map.
      // No fragment discard. The deck side is open; most upper midship plating has fallen away.
      const NS = Math.ceil((pc.s1 - pc.s0) * L / 0.85), NP = 24;
      for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) {
        const s0 = pc.s0 + (pc.s1 - pc.s0) * i / NS, s1 = pc.s0 + (pc.s1 - pc.s0) * (i + 1) / NS;
        const s = (s0 + s1) / 2, ph0 = -Math.PI / 2 + j / NP * Math.PI, ph1 = ph0 + Math.PI / NP;
        const noise = (Math.sin(i * 17.13 + j * 71.7) * 43758.5453) % 1;
        const mid = s > 0.16 && s < 0.83, broken = pc === pieces[0] ? i >= NS - 3 : i < 3;
        if ((mid && j > 13 && (j > 16 || Math.abs(noise) > 0.38)) || (broken && j > 4 && Math.abs(noise) > 0.26)) continue;
        // Shared jittered corners make torn plating irregular rather than a staircase of squares.
        const tornPoint = (s: number, ph: number) => {
          const exposed = ph > 0.10 && s > 0.13 && s < 0.87;
          const ds = exposed ? Math.sin(s * 751 + ph * 31) * 0.0022 : 0;
          const dp = exposed ? Math.sin(s * 913 - ph * 37) * 0.037 : 0;
          return point(Math.max(pc.s0, Math.min(pc.s1, s + ds)), Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ph + dp)));
        };
        const v = [tornPoint(s0, ph0), tornPoint(s1, ph0), tornPoint(s1, ph1), tornPoint(s0, ph1)];
        const n = v[1].clone().sub(v[0]).cross(v[3].clone().sub(v[0])).normalize();
        const out = rotate(pc, new THREE.Vector3(0, hull(s, (ph0 + ph1) / 2).y - dep(s) * 0.6, hull(s, (ph0 + ph1) / 2).z));
        if (n.dot(out) < 0) n.negate();
        const base = P.length / 3;
        // Inner skin plus edge returns give the corroded plate an actual 6 cm thickness.
        for (const inside of [false, true]) for (let k = 0; k < 4; k++) vertex(v[k].clone().addScaledVector(n, inside ? -0.06 : 0), inside ? n.clone().negate() : n, 0, k === 0 || k === 3 ? s0 : s1, k < 2 ? ph0 : ph1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
        for (let k = 0; k < 4; k++) { const a = base + k, b = base + (k + 1) % 4; idx.push(a, b, b + 4, a, b + 4, a + 4); }
        if (n.y > 0.68 && R() < 0.06) this.up.push({ p: v[0].clone().add(v[2]).multiplyScalar(0.5), n: n.clone() });
      }
      let frame = 0;
      for (let x = Math.ceil((pc.s0 * L + 0.6) / 1.85) * 1.85; x < pc.s1 * L - 0.5; x += 1.85, frame++) {
        const s = x / L, NF = 18;
        // Near the break, some ribs have lost their upper tips; away from it the rhythm stays legible.
        const edge = Math.min(s - pc.s0, pc.s1 - s) * L;
        const last = edge < 5 ? 13 + frame % 4 : NF;
        for (let j = 0; j < last; j++) {
          const a = point(s, -Math.PI / 2 + j / NF * Math.PI, 0.18), b = point(s, -Math.PI / 2 + (j + 1) / NF * Math.PI, 0.18);
          beam(a, b, 0.17, 0.24);
          if (j === last - 1 && last === NF && frame % 2 === 0) this.up.push({ p: b.clone(), n: new THREE.Vector3(0, 1, 0) });
        }
        // Surviving deck cross-members and small knees. Most of the wooden deck is gone.
        if (frame % 3 !== 1 && edge > 3) {
          const y = dep(s) - 0.18, x0 = (s - 0.5) * L, h = half(s) - 0.16;
          beam(place(pc, new THREE.Vector3(x0, y, -h)), place(pc, new THREE.Vector3(x0, y, h)), 0.16, 0.22);
          for (const side of [-1, 1]) beam(place(pc, new THREE.Vector3(x0, y, side * (h - 0.85))), place(pc, new THREE.Vector3(x0, y - 0.75, side * h)), 0.11, 0.14);
        }
      }
      // Keel, bilge stringers and the two gunwales tie the transverse frames into a ship.
      for (const ph of [-Math.PI / 2, -0.78, 0, 0.80, Math.PI / 2]) {
        const count = Math.ceil((pc.s1 - pc.s0) * L / 1.5);
        for (let i = 0; i < count; i++) {
          if (ph > 1 && i > count * 0.3 && i < count * 0.8 && i % 7 === 0) continue;
          beam(point(pc.s0 + (pc.s1 - pc.s0) * i / count, ph, 0.11), point(pc.s0 + (pc.s1 - pc.s0) * (i + 1) / count, ph, 0.11), ph === 0 ? 0.23 : 0.12, 0.16);
        }
      }
    }
    const ship = (pi: number, s: number, y: number, z = 0) => place(pieces[pi], new THREE.Vector3((s - 0.5) * L, y, z));
    const sand = (p: THREE.Vector3, lift = 0.25) => { p.y = f(p.x, p.z) + lift; return p; };
    // A stem, a bowsprit fragment and a recognisable rudder plate instead of a thick vertical pole.
    beam(ship(1, 1, 0.2), ship(1, 1, dep(1)), 0.19, 0.22);
    tube(ship(1, 0.985, dep(1) - 0.5), ship(1, 1.072, dep(1) + 1.4), 0.22, 0.095);
    beam(ship(0, -0.006, 0.2), ship(0, -0.006, 3.7), 0.19, 0.19);
    const rudderQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pieces[0].roll, spec.rot + pieces[0].yaw, 0, 'YXZ'));
    append(new THREE.BoxGeometry(1.45, 2.85, 0.11), ship(0, -0.013, 1.9), rudderQ, 2);
    // Two fallen spar remnants. Their exact present-day positions remain an art-study assumption.
    for (const [pi, s, length] of [[0, 0.28, 15], [1, 0.76, 18]]) {
      const a = ship(pi, s, dep(s) - 0.4), b = sand(ship(pi, s - 0.025, dep(s) + length, 0.6));
      tube(a, b, 0.24, 0.10);
      const c = a.clone().lerp(b, 0.7); tube(c.clone().addScaledVector(this.ax, -3.5), c.clone().addScaledVector(this.ax, 3.2), 0.10, 0.07);
    }
    // Hollow fallen funnel: annular rims, no solid end-cap masquerading as a chimney opening.
    const fa = sand(ship(1, 0.53, D + 3), 1.08), fb = sand(fa.clone().addScaledVector(this.ax, 4.8), 1.05);
    tube(fa, fb, 1.03, 0.97, 3, true); tube(fa, fb, 0.94, 0.88, 3, true);
    const fq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fb.clone().sub(fa).normalize());
    for (const [p, r] of [[fa, 0.985], [fb, 0.925]] as const) append(new THREE.TorusGeometry(r, 0.045, 6, 20), p, fq, 3);
    // A small scatter confined to the break; no invented cargo or treasure.
    for (let i = 0; i < 13; i++) {
      const a = sand(ship(1, rr(0.435, 0.50), rr(0, D + 3), rr(-3, 3)), 0.14);
      const b = sand(a.clone().addScaledVector(this.ax, rr(-2, 2)).addScaledVector(this.az, rr(-1.2, 1.2)), 0.14);
      beam(a, b, rr(0.10, 0.18), 0.13, 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); g.setAttribute('aSP', new THREE.Float32BufferAttribute(S, 2)); g.setIndex(idx);
    g.computeBoundingSphere(); this.geo = g;
    this.centre = ship(1, 0.53, D * 0.45);
    this.landmarks = { bow: ship(1, 0.94, D * 0.65), stern: ship(0, 0.08, D * 0.65), break: ship(1, 0.48, D * 0.4) };
  }

  spot(out = new THREE.Vector3()) {
    const s = rr(-0.42, 0.45) * this.spec.len, side = rr(-1, 1) * this.spec.beam * 0.9;
    const x = this.spec.x + this.ax.x * s + this.az.x * side, z = this.spec.z + this.ax.z * s + this.az.z * side;
    return out.set(x, this.f(x, z) + rr(3, 11), z);
  }
  readonly tourLength = 70;
  tourStart(rev: boolean) { const p = new THREE.Vector3(), l = new THREE.Vector3(); this.tourAt(0, rev, p, l); return p; }
  tourAt(t: number, rev: boolean, pos: THREE.Vector3, look: THREE.Vector3) {
    const k = Math.min(1, Math.max(0, t / this.tourLength)), e = k * k * (3 - 2 * k), s = (rev ? 0.46 - 0.9 * e : -0.44 + 0.9 * e) * this.spec.len;
    const off = -(this.spec.depth + 10);
    const x = this.spec.x + this.ax.x * s + this.az.x * off, z = this.spec.z + this.ax.z * s + this.az.z * off;
    pos.set(x, this.f(x, z) + 5 + Math.sin(k * 6) * 0.8, z);
    const ls = s + (rev ? -10 : 10), lx = this.spec.x + this.ax.x * ls - this.az.x * this.spec.depth * 0.5, lz = this.spec.z + this.ax.z * ls - this.az.z * this.spec.depth * 0.5;
    look.set(lx, this.f(lx, lz) + 4, lz);
  }
}

export function wreckMaterial() {
  return mat(
    `attribute float aPart; attribute vec2 aSP; varying vec3 vWp; varying vec3 vN; varying float vPart; varying vec2 vSP;
     void main(){ vWp = position; vN = normal; vPart = aPart; vSP = aSP; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying float vPart; varying vec2 vSP;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); float inside = step(dot(n, V), 0.0); n *= 1.0 - 2.0 * inside;
       vec3 p = vWp; vec2 q = p.xz + vec2(p.y * 0.63, -p.y * 0.4);
       float a = vn2(q * 0.48), b = vn2(q * 2.3 + 7.0), c = vn2(q * 14.0 - 3.0);
       vec3 alb = mix(vec3(0.22, 0.16, 0.12), vec3(0.42, 0.40, 0.31), smoothstep(0.25, 0.73, a));
       alb = mix(alb, vec3(0.47, 0.31, 0.34), smoothstep(0.58, 0.78, b) * 0.5);
       alb = mix(alb, vec3(0.63, 0.37, 0.15), smoothstep(0.77, 0.88, vn2(q * 3.0 + 22.0)) * 0.5);
       float up = smoothstep(0.15, 0.9, n.y);
       alb = mix(alb, vec3(0.47, 0.44, 0.35), up * smoothstep(0.4, 0.8, a) * 0.35);
       if (vPart < 0.5) {
         vec2 plate = vec2(vSP.x * 45.0, vSP.y * 3.2);
         vec2 edge = min(fract(plate), 1.0 - fract(plate));
         float seam = 1.0 - smoothstep(0.012, 0.04, min(edge.x, edge.y));
         float rivet = (1.0 - smoothstep(0.09, 0.18, length(vec2(edge.x * 13.0 - 0.45, fract(plate.y * 9.0) - 0.5)))) * 0.16;
         alb *= 1.0 - seam * 0.20 + rivet;
       }
       if (vPart > 2.5) alb *= 0.75;
       n = bumpN(n, p, a * 0.025 + b * 0.016 + c * 0.009);
       gl_FragColor = vec4(shade(alb, p, n, 0.65) * mix(1.0, 0.82, inside), 1.0);
     }`, { uniforms: { ...SURF_UNIFORMS }, opts: { side: THREE.DoubleSide } });
}
