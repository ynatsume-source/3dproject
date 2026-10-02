// SS Carnatic at Abu Nuhas: an interpretive iron skeleton, not a surveyed reconstruction.
// Overall dimensions and the port-side, broken wreck are inherited from the sea definition.
// Frame spacing, retained plates, machinery and growth are plausible visual decisions; see
// docs/proposals/astra-carnatic. Coordinates: x stern→bow, y keel→deck, z→starboard.
import * as THREE from 'three';
import { mat } from '../render/common';
import { hash, mulberry32, rr } from '../core/math';

export interface WreckSpec { x: number; z: number; rot: number; len: number; beam: number; depth: number }

type Point = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

// One mesh/material for iron, mineral crust and small sessile growth. All openings and torn
// edges are geometry. Collision samples cover surfaces, not just their corner vertices.
class WreckMesh {
  p: number[] = []; n: number[] = []; part: number[] = []; uv: number[] = []; shade: number[] = [];
  indices: number[] = [];
  samples = new Map<string, Point>();
  counts: Record<string, number> = {};
  private mark(p: Point) {
    const k = `${Math.floor(p.x * 2)},${Math.floor(p.z * 2)}`, old = this.samples.get(k);
    if (!old || old.y < p.y) this.samples.set(k, p.clone());
  }
  face(a: Point, b: Point, c: Point, d: Point, part: number, shade = 1, uv?: number[]) {
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const start = this.p.length / 3;
    for (const [i, p] of [a, b, c, d].entries()) {
      this.p.push(p.x, p.y, p.z); this.n.push(normal.x, normal.y, normal.z);
      this.part.push(part); this.shade.push(shade); this.uv.push(uv?.[i * 2] ?? 0, uv?.[i * 2 + 1] ?? 0);
    }
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    this.counts[part] = (this.counts[part] || 0) + 2;
    // A bilinear lattice also stamps the interiors of long beams and plates into the height map.
    const nx = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), d.distanceTo(c)) / 0.45));
    const ny = Math.max(1, Math.ceil(Math.max(a.distanceTo(d), b.distanceTo(c)) / 0.45));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      this.mark(a.clone().lerp(b, i / nx).lerp(d.clone().lerp(c, i / nx), j / ny));
    }
  }
  // Rectangular section: iron frames should have real webs/edges, not flat ribbons or pipes.
  beam(a: Point, b: Point, width: number, depth: number, part = 1, shade = 0.92) {
    const axis = b.clone().sub(a).normalize();
    const u = V(0, 1, 0); if (Math.abs(axis.y) > 0.93) u.set(0, 0, 1);
    u.cross(axis).normalize().multiplyScalar(width / 2);
    const v = axis.clone().cross(u).normalize().multiplyScalar(depth / 2);
    const ring = (p: Point) => [p.clone().add(u).add(v), p.clone().sub(u).add(v), p.clone().sub(u).sub(v), p.clone().add(u).sub(v)];
    const aa = ring(a), bb = ring(b);
    for (let k = 0; k < 4; k++) this.face(aa[k], aa[(k + 1) % 4], bb[(k + 1) % 4], bb[k], part, shade);
    this.face(aa[3], aa[2], aa[1], aa[0], part, shade * 0.8);
    this.face(bb[0], bb[1], bb[2], bb[3], part, shade * 0.8);
  }
  tube(a: Point, b: Point, r0: number, r1: number, part = 2, sides = 10, shade = 0.9, open = false) {
    const axis = b.clone().sub(a).normalize();
    const u = (Math.abs(axis.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(axis).normalize();
    const v = axis.clone().cross(u);
    const point = (p: Point, r: number, k: number) => p.clone().addScaledVector(u, Math.cos(k / sides * TAU) * r).addScaledVector(v, Math.sin(k / sides * TAU) * r);
    for (let k = 0; k < sides; k++) {
      this.face(point(a, r0, k), point(a, r0, k + 1), point(b, r1, k + 1), point(b, r1, k), part, shade);
      // Annular cut ends give tubes a visible wall and a dark, recessed interior.
      if (open) {
        const ia = a.clone().addScaledVector(axis, Math.min(0.32, a.distanceTo(b) * 0.2));
        const ib = b.clone().addScaledVector(axis, -Math.min(0.32, a.distanceTo(b) * 0.2));
        const wall = part === 5 ? 0.76 : 0.9;
        this.face(point(a, r0, k + 1), point(a, r0, k), point(a, r0 * wall, k), point(a, r0 * wall, k + 1), part, shade);
        this.face(point(b, r1, k), point(b, r1, k + 1), point(b, r1 * wall, k + 1), point(b, r1 * wall, k), part, shade);
        this.face(point(a, r0 * wall, k), point(ia, r0 * wall, k), point(ia, r0 * wall, k + 1), point(a, r0 * wall, k + 1), part, 0.36);
        this.face(point(b, r1 * wall, k + 1), point(ib, r1 * wall, k + 1), point(ib, r1 * wall, k), point(b, r1 * wall, k), part, 0.36);
      }
    }
  }
  sponge(base: Point, tip: Point, radius: number, seed: number) {
    const axis = tip.clone().sub(base).normalize();
    const u = V(1, 0, 0).cross(axis).normalize(), v = axis.clone().cross(u);
    const point = (t: number, r: number, k: number) => {
      const a = k / 8 * TAU;
      const uneven = 1 + Math.sin(a * 3 + seed) * 0.13 + Math.cos(a * 2 - seed) * 0.08;
      return base.clone().lerp(tip, t).addScaledVector(u, Math.sin(t * Math.PI) * radius * 0.28)
        .addScaledVector(u, Math.cos(a) * radius * r * uneven)
        .addScaledVector(v, Math.sin(a) * radius * r * uneven)
        .addScaledVector(axis, Math.sin(a * 3 + seed) * radius * 0.09 * t);
    };
    const meshFace = (a: number[], b: number[], k: number) => this.face(
      point(a[0], a[1], k), point(a[0], a[1], k + 1), point(b[0], b[1], k + 1), point(b[0], b[1], k), 5, 0.94);
    const rings = [[0, 0.55], [0.35, 0.9], [0.77, 1.04], [1, 0.83]];
    for (let k = 0; k < 8; k++) {
      for (let j = 0; j < 3; j++) meshFace(rings[j], rings[j + 1], k);
      this.face(point(1, 0.83, k), point(1, 0.83, k + 1), point(1, 0.57, k + 1), point(1, 0.57, k), 5, 0.98);
      this.face(point(1, 0.57, k + 1), point(0.55, 0.47, k + 1), point(0.55, 0.47, k), point(1, 0.57, k), 5, 0.32);
    }
    // Curved, widening walls and an uneven lip distinguish living cups from cut metal pipes.
  }
  finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.setIndex(this.indices); g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.trianglesByPart = this.counts;
    return g;
  }
}

export class Wreck {
  readonly spec: WreckSpec;
  readonly geo: THREE.BufferGeometry;
  readonly up: { p: Point; n: Point }[] = [];
  readonly pts: Point[];
  readonly centre: Point;
  private f: (x: number, z: number) => number;
  private ax: Point; private az: Point;

  constructor(spec: WreckSpec, f: (x: number, z: number) => number) {
    this.spec = spec; this.f = f;
    this.ax = V(Math.cos(spec.rot), 0, -Math.sin(spec.rot));
    this.az = V(Math.sin(spec.rot), 0, Math.cos(spec.rot));
    const mesh = new WreckMesh(), random = mulberry32(1869);
    const L = spec.len, B = spec.beam, D = spec.depth;
    const half = (s: number) => B * 0.5 * Math.pow(Math.max(0.0004, Math.sin(Math.PI * Math.pow(s, 0.82))), 0.43);
    const sheer = (s: number) => D + 1.0 * Math.pow(Math.abs(2 * s - 1), 3);
    const hull = (s: number, ph: number, inset = 0) => {
      const cp = Math.max(0, Math.cos(ph)), sp = Math.sin(ph);
      return V((s - 0.5) * L + Math.pow(Math.abs(2 * s - 1), 10) * (1 - cp) * (s > 0.5 ? 1.0 : -0.8),
        inset + (sheer(s) - inset) * (1 - Math.pow(cp, 1.35)),
        Math.max(0.045, half(s) - inset) * Math.sign(sp) * Math.pow(Math.abs(sp), 0.72));
    };
    const pieces = [
      { lo: 0.018, hi: 0.423, roll: -1.47, yaw: 0.055, dx: -1.2, dz: 0.5 },
      { lo: 0.492, hi: 0.992, roll: -1.36, yaw: -0.015, dx: 0, dz: 0 },
    ].map(pc => {
      // Each half uses one support plane fitted along its keel to follow the broad seabed slope;
      // local bommies cannot bend a steel hull into waves as in the old per-vertex placement.
      const x0 = (pc.lo - 0.5) * L, x1 = (pc.hi - 0.5) * L;
      const bed = (x: number) => f(spec.x + this.ax.x * x + pc.dx, spec.z + this.ax.z * x + pc.dz);
      const y0 = bed(x0), y1 = bed(x1);
      const slope = (y1 - y0) / (x1 - x0);
      return { ...pc, slope, base: y0 - slope * x0 + B * 0.5 - 1.0 };
    });
    const ship = (pi: number, p: Point) => {
      const pc = pieces[pi], c = Math.cos(pc.roll), sn = Math.sin(pc.roll);
      const y = p.y * c - p.z * sn, z = p.y * sn + p.z * c;
      const xx = p.x * Math.cos(pc.yaw) - z * Math.sin(pc.yaw), zz = p.x * Math.sin(pc.yaw) + z * Math.cos(pc.yaw);
      return V(spec.x + this.ax.x * xx + this.az.x * zz + pc.dx, pc.base + pc.slope * p.x + y, spec.z + this.ax.z * xx + this.az.z * zz + pc.dz);
    };
    const worldHull = (pi: number, s: number, ph: number, inset = 0) => ship(pi, hull(s, ph, inset));
    const sand = (p: Point, lift = 0.12) => p.setY(f(p.x, p.z) + lift);
    const growthSites: Point[] = [];

    pieces.forEach((pc, pi) => {
      // Riveted shell strakes. Survivors form larger quiet masses at the ends, opening into
      // mostly bare frames toward the fracture. Boundary thickness is actual geometry.
      const nx = Math.ceil((pc.hi - pc.lo) * L / 1.15), np = 20;
      const alive: boolean[][] = [];
      const ps: Point[][] = [], inner: Point[][] = [];
      for (let i = 0; i <= nx; i++) {
        ps[i] = []; inner[i] = [];
        for (let j = 0; j <= np; j++) {
          const baseS = mix(pc.lo, pc.hi, i / nx);
          const ph = -Math.PI / 2 + Math.PI * j / np + (j > 0 && j < np ? (hash(i + 70, j) - 0.5) * 0.065 : 0);
          const edge = i === 0 || i === nx;
          const torn = (pi === 0 && i === nx) || (pi === 1 && i === 0);
          const s = baseS + (torn ? (hash(j, pi + 8) - 0.5) * 0.026 : edge ? 0 : (hash(i, j) - 0.5) * 0.003);
          ps[i][j] = worldHull(pi, s, ph);
          inner[i][j] = worldHull(pi, s, ph, 0.10);
        }
      }
      for (let i = 0; i < nx; i++) {
        alive[i] = [];
        for (let j = 0; j < np; j++) {
          const s = mix(pc.lo, pc.hi, (i + 0.5) / nx), ph = -Math.PI / 2 + Math.PI * (j + 0.5) / np;
          const end = Math.pow(Math.abs(2 * s - 1), 2);
          const line = 0.16 + end * 1.9 + (hash(Math.floor(i / 2), pi + 3) - 0.5) * 0.5;
          const hole = ph > 0.0 && ph < 1.3 && end < 0.67 && hash(Math.floor(i / 2), Math.floor(j / 2) + pi * 20) > 0.69;
          alive[i][j] = ph < line && !hole;
        }
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < np; j++) {
        if (!alive[i][j]) continue;
        const a = ps[i][j], b = ps[i + 1][j], c = ps[i + 1][j + 1], d = ps[i][j + 1];
        const ia = inner[i][j], ib = inner[i + 1][j], ic = inner[i + 1][j + 1], id = inner[i][j + 1];
        const u0 = mix(pc.lo, pc.hi, i / nx) * L, u1 = mix(pc.lo, pc.hi, (i + 1) / nx) * L;
        mesh.face(d, c, b, a, 0, 1, [u0, j + 1, u1, j + 1, u1, j, u0, j]);
        mesh.face(ia, ib, ic, id, 0, 0.62, [u0, j, u1, j, u1, j + 1, u0, j + 1]);
        if (!alive[i - 1]?.[j]) mesh.face(a, ia, id, d, 2);
        if (!alive[i + 1]?.[j]) mesh.face(c, ic, ib, b, 2);
        if (!alive[i]?.[j - 1]) mesh.face(b, ib, ia, a, 2);
        if (!alive[i]?.[j + 1]) mesh.face(d, id, ic, c, 2);
      }
      // Deep transverse ribs, with narrow outer flanges. Broken ends lean independently;
      // the rhythm reads as a ship before the small surface detail becomes visible.
      const step = 1.62;
      for (let station = Math.ceil(pc.lo * L / step); station * step < pc.hi * L - 0.4; station++) {
        const s = station * step / L, nearBreak = pi === 0 ? pc.hi - s : s - pc.lo;
        const bent = nearBreak < 0.055;
        const rib = (ph: number) => {
          const p = hull(s, ph, 0.17);
          if (bent) { p.x += Math.pow((ph + Math.PI / 2) / Math.PI, 2) * (hash(station, pi) - 0.4) * 2.2; p.y -= Math.max(0, ph) * 0.35; }
          return ship(pi, p);
        };
        const count = 17, stop = bent && station % 2 === 0 ? 13 : count;
        for (let j = 0; j < stop; j++) {
          const ph0 = -Math.PI / 2 + Math.PI * j / count, ph1 = -Math.PI / 2 + Math.PI * (j + 1) / count;
          mesh.beam(rib(ph0), rib(ph1), 0.14, 0.25, 1, 0.82);
          if (j > 8) mesh.beam(worldHull(pi, s, ph0, 0.045), worldHull(pi, s, ph1, 0.045), 0.23, 0.065, 1, 1);
        }
        // Deck planks are gone: only transverse beams and a partial lower deck survive.
        if (!bent && station % 7 !== 3) {
          const end = station % 9 === 4 ? 0.1 : half(s) - 0.2;
          const a = ship(pi, V((s - 0.5) * L, sheer(s) - 0.17, -half(s) + 0.2));
          const b = ship(pi, V((s - 0.5) * L + (station % 9 === 4 ? 0.65 : 0), sheer(s) - 0.17, end));
          mesh.beam(a, b, 0.18, 0.25, 1, 0.93);
          if (station % 3 === 0) mesh.beam(ship(pi, V((s - 0.5) * L, D * 0.54, -half(s) * 0.83)), ship(pi, V((s - 0.5) * L, D * 0.54, half(s) * 0.83)), 0.14, 0.21, 1, 0.7);
        }
        if (!bent) growthSites.push(rib(Math.PI / 2));
        if (station % 3 === 0) growthSites.push(rib(0.72));
        // Low mineral/sponge nodules break the machined silhouette at the centimetre scale.
        // They are merged here, so the extra relief adds no draw call or extra material.
        for (let j = 0; j < 4; j++) {
          const p = rib(0.40 + j * 0.31).add(V(0, 0.065, 0));
          const r = 0.085 + hash(station, j + 19) * 0.10;
          const middle = p.clone().add(V(0.018, r * 0.37, -0.012));
          mesh.tube(p, middle, r * 0.72, r, 4, 6, 0.98);
          mesh.tube(middle, p.clone().add(V(0.035, r * 0.82, -0.02)), r, r * 0.08, 4, 6, 0.94);
        }
      }
      // Longitudinal stringers connect the ribs; intermittent upper rails avoid a pristine cage.
      for (const ph of [-1.52, -0.72, 0.04, 0.68, 1.52]) {
        const n = Math.ceil((pc.hi - pc.lo) * L / 1.5);
        for (let i = 0; i < n; i++) {
          if (ph > 1 && i % 19 > 15) continue;
          const s0 = mix(pc.lo, pc.hi, i / n), s1 = mix(pc.lo, pc.hi, (i + 1) / n);
          mesh.beam(worldHull(pi, s0, ph, 0.28), worldHull(pi, s1, ph, 0.28), ph > 1 ? 0.22 : 0.13, 0.17, 1, ph > 0 ? 0.96 : 0.75);
        }
      }
      // One partly fallen deck centre girder and sparse supporting knees.
      for (let i = 0; i < 12; i++) {
        const s0 = mix(pc.lo + 0.016, pc.hi - 0.012, i / 12), s1 = mix(pc.lo + 0.016, pc.hi - 0.012, (i + 1) / 12);
        if (i === 4 || i === 9) continue;
        mesh.beam(ship(pi, V((s0 - 0.5) * L, sheer(s0) - 0.28, 0)), ship(pi, V((s1 - 0.5) * L, sheer(s1) - 0.28, 0)), 0.19, 0.25, 1, 0.84);
      }
    });

    // A raked stem and short broken bowsprit; a sternpost with a thin rudder blade.
    for (const pi of [0, 1]) {
      const s = pi === 0 ? 0.018 : 0.992;
      for (let j = 0; j < 8; j++) mesh.beam(worldHull(pi, s, -Math.PI / 2 + j * Math.PI / 8), worldHull(pi, s, -Math.PI / 2 + (j + 1) * Math.PI / 8), 0.29, 0.31, 2);
    }
    mesh.tube(ship(1, V(L * 0.486, D + 0.5, 0)), ship(1, V(L * 0.56, D + 2.1, -0.1)), 0.24, 0.11);
    const rudder = [V(-L * 0.49, 0.5, 0), V(-L * 0.525, 1.3, 0), V(-L * 0.52, 4.2, 0), V(-L * 0.49, 4.6, 0)].map(p => ship(0, p));
    mesh.face(rudder[0], rudder[1], rudder[2], rudder[3], 2, 0.85);
    for (let j = 0; j < 4; j++) mesh.beam(rudder[j], rudder[(j + 1) % 4], 0.13, 0.16, 2);

    // Two fallen, interrupted mast spars. Their exact present-day positions need photo review.
    for (const [pi, s, length] of [[0, 0.24, 17], [1, 0.75, 21]]) {
      const root = ship(pi, V((s - 0.5) * L, D - 0.3, 0));
      const elbow = sand(ship(pi, V((s - 0.5) * L + 0.8, D + length * 0.48, 0)), 0.34);
      const tip = sand(ship(pi, V((s - 0.5) * L + 3.5, D + length, -0.8)), 0.16);
      mesh.tube(root, elbow, 0.29, 0.22, 2, 10, 0.91, true);
      mesh.tube(elbow.clone().add(V(0.35, -0.06, -0.35)), tip, 0.21, 0.1, 2, 8, 0.92, true);
      const yard = elbow.clone().lerp(tip, 0.45);
      mesh.tube(sand(yard.clone().addScaledVector(this.ax, -4.8), 0.17), sand(yard.clone().addScaledVector(this.ax, 5.7), 0.17), 0.13, 0.08, 2, 8);
      for (const t of [0.28, 0.65]) {
        const c = root.clone().lerp(elbow, t), d = elbow.clone().sub(root).normalize().multiplyScalar(0.06);
        mesh.tube(c.clone().sub(d), c.clone().add(d), mix(0.29, 0.22, t) + 0.035, mix(0.29, 0.22, t) + 0.035, 2);
      }
    }

    // Low wreckage at the break, with a restrained boiler-like machinery mass. This is an
    // interpretive focal point, not a claim about Carnatic's surviving engine arrangement.
    const engine = sand(ship(1, V(-2.2, 2.6, 0)), 1.65);
    const ea = engine.clone().addScaledVector(this.ax, -2.6), eb = engine.clone().addScaledVector(this.ax, 2.6);
    mesh.tube(ea, eb, 1.62, 1.62, 3, 18, 0.8, true);
    for (const t of [0.12, 0.48, 0.87]) {
      const c = ea.clone().lerp(eb, t);
      mesh.tube(c.clone().addScaledVector(this.ax, -0.08), c.clone().addScaledVector(this.ax, 0.08), 1.68, 1.68, 3, 18, 0.85);
    }
    // Fractured deck beams and small bent plating fans settle into the sand around the gap.
    for (let i = 0; i < 17; i++) {
      const x = -7.7 + random() * 10.3, z = -1.5 - random() * 7.8;
      const a = sand(V(spec.x + this.ax.x * x + this.az.x * z, 0, spec.z + this.ax.z * x + this.az.z * z), 0.15 + random() * 0.55);
      const b = sand(a.clone().addScaledVector(this.ax, (random() - 0.5) * 7.5).addScaledVector(this.az, (random() - 0.5) * 3), 0.1);
      mesh.beam(a, b, 0.18 + random() * 0.09, 0.21, 2, 0.82);
      if (i % 3 === 0) {
        const c = sand(b.clone().addScaledVector(this.az, 0.8 + random()), 0.13), d = a.clone().addScaledVector(this.az, 0.7);
        d.y += 0.18;
        mesh.face(a, b, c, d, 0, 0.9); mesh.beam(a, d, 0.08, 0.09, 2);
      }
    }

    // Growth hierarchy: continuous mineral crust in the shader, small open sponge mouths in
    // this same draw, and at most 56 existing instanced soft corals/fans from buildOcean.
    for (const [i, p] of growthSites.entries()) {
      if (p.y < f(p.x, p.z) + 0.7) continue;
      if (this.up.length < 56 && i % 3 !== 1) this.up.push({ p: p.clone().add(V(0, 0.11, 0)), n: V(0, 1, 0) });
      if (i % 2 === 0) for (let j = 0; j < 2 + i % 3; j++) {
        const base = p.clone().add(V((random() - 0.5) * 0.32, 0.05, (random() - 0.5) * 0.25));
        const height = 0.12 + random() * 0.23, radius = 0.065 + random() * 0.075;
        const tip = base.clone().add(V((random() - 0.5) * 0.15, height, (random() - 0.5) * 0.15));
        mesh.sponge(base, tip, radius, i * 0.71 + j * 1.31);
      }
    }
    this.geo = mesh.finish(); this.pts = [...mesh.samples.values()];
    this.centre = ship(1, V(0, D * 0.5, 0));
  }

  // Existing ecosystem API: schools remain around the wreck, independently of visual detail.
  spot(out = new THREE.Vector3()) {
    const s = rr(-0.42, 0.45) * this.spec.len, side = rr(-1, 1) * this.spec.beam * 0.9;
    const x = this.spec.x + this.ax.x * s + this.az.x * side, z = this.spec.z + this.ax.z * s + this.az.z * side;
    return out.set(x, this.f(x, z) + rr(3, 11), z);
  }
  readonly tourLength = 70;
  tourStart(rev: boolean) { const p = V(), l = V(); this.tourAt(0, rev, p, l); return p; }
  tourAt(t: number, rev: boolean, pos: Point, look: Point) {
    const k = Math.min(1, Math.max(0, t / this.tourLength)), e = k * k * (3 - 2 * k), s = (rev ? 0.46 - 0.9 * e : -0.44 + 0.9 * e) * this.spec.len;
    const off = -(this.spec.depth + 10);
    const x = this.spec.x + this.ax.x * s + this.az.x * off, z = this.spec.z + this.ax.z * s + this.az.z * off;
    pos.set(x, this.f(x, z) + 5 + Math.sin(k * 6) * 0.8, z);
    const ls = s + (rev ? -10 : 10), lx = this.spec.x + this.ax.x * ls - this.az.x * this.spec.depth * 0.5, lz = this.spec.z + this.ax.z * ls - this.az.z * this.spec.depth * 0.5;
    look.set(lx, this.f(lx, lz) + 4, lz);
  }
}

// No added texture fetches, discard or data-dependent early return. The shared lighting still
// handles depth absorption and water fog; crevice shading is applied BEFORE fog, never to water.
export function wreckMaterial() {
  return mat(
    `attribute float aPart; attribute vec2 aUV; attribute float aShade;
     varying vec3 vWp; varying vec3 vN; varying float vPart; varying vec2 vUV; varying float vShade;
     void main(){vWp=position;vN=normal;vPart=aPart;vUV=aUV;vShade=aShade;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
    `varying vec3 vWp; varying vec3 vN; varying float vPart; varying vec2 vUV; varying float vShade;
     float wreckHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
     float wreckNoise(vec3 p){
       vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
       return mix(mix(mix(wreckHash(i),wreckHash(i+vec3(1,0,0)),f.x),
                      mix(wreckHash(i+vec3(0,1,0)),wreckHash(i+vec3(1,1,0)),f.x),f.y),
                  mix(mix(wreckHash(i+vec3(0,0,1)),wreckHash(i+vec3(1,0,1)),f.x),
                      mix(wreckHash(i+vec3(0,1,1)),wreckHash(i+vec3(1,1,1)),f.x),f.y),f.z);
     }
     void main(){
       vec3 p=vWp, n=normalize(vN); n*=gl_FrontFacing?1.0:-1.0;
       float broad=wreckNoise(p*0.27+7.0), crust=wreckNoise(p*1.45-3.0), grain=wreckNoise(p*7.5+11.0);
       float pits=wreckNoise(p*21.0);
       float lime=smoothstep(0.30,0.68,broad*0.58+crust*0.42);
       vec3 alb=mix(vec3(0.23,0.205,0.16),vec3(0.58,0.565,0.45),lime);
       float algae=smoothstep(0.58,0.82,wreckNoise(p*0.87+29.0));
       alb=mix(alb,vec3(0.46,0.27,0.31),algae*0.58);
       float sponge=smoothstep(0.70,0.87,wreckNoise(p*2.2-21.0))*smoothstep(0.37,0.73,crust);
       alb=mix(alb,vec3(0.69,0.46,0.19),sponge*0.75);
       alb*=0.8+0.25*grain+0.09*pits;
       // Seams/rivets are quiet at distance and filter with screen derivatives at close range.
       vec2 plate=vec2(vUV.x/2.2,vUV.y/1.9);
       vec2 aa=max(fwidth(plate),vec2(0.002));
       vec2 line=1.0-smoothstep(vec2(0.008),vec2(0.008)+aa,abs(fract(plate+0.5)-0.5));
       float isPlate=1.0-step(0.5,vPart);
       alb*=1.0-isPlate*max(line.x,line.y)*0.2;
       float rivetD=length(vec2((fract(vUV.x/0.32)-0.5)*0.32,(fract(plate.y+0.5)-0.5)*1.9));
       float rivet=(1.0-smoothstep(0.026,0.026+max(fwidth(rivetD),0.005),rivetD))*isPlate;
       alb+=rivet*vec3(0.065,0.06,0.044);
       float machinery=step(2.5,vPart)*(1.0-step(3.5,vPart));
       alb=mix(alb,alb*vec3(0.65,0.62,0.57),machinery*0.65);
       float nodule=step(3.5,vPart)*(1.0-step(4.5,vPart));
       alb=mix(alb,mix(vec3(0.58,0.54,0.42),vec3(0.51,0.32,0.38),algae),nodule*0.8);
       float smallSponge=step(4.5,vPart);
       alb=mix(alb,mix(vec3(0.48,0.355,0.22),vec3(0.55,0.45,0.33),broad),smallSponge);
       // Derivatives are evaluated uniformly before shading, including across part boundaries.
       float height=(grain*0.006+pits*0.003+crust*0.012)*(1.0-smallSponge*0.65);
       vec3 dx=dFdx(p),dy=dFdy(p); vec3 r1=cross(dy,n),r2=cross(n,dx); float det=dot(dx,r1);
       vec3 grad=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
       n=normalize(max(abs(det),0.000001)*n-grad);
       alb*=vShade;
       gl_FragColor=vec4(shade(alb,p,n,0.32),1.0);
     }`, {opts:{side:THREE.DoubleSide}});
}
