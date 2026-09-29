// Sea caves. A limestone massif stands on the sand with a winding tunnel through it, a chamber in the
// middle and holes in its roof, all written as one signed distance field and meshed with surface nets.
// The same field bakes a light volume: how much sun (R) and sky (G) reaches each point. Every material
// and the volumetric light read it, so the tunnel is dark, the walls around the entrances glow, and
// the skylights pour shafts onto the floor — tilting with the sun through the day.
import * as THREE from 'three';
import { smooth } from '../core/math';

export interface CaveSpec { x: number; z: number; rot: number }

// the massif seen from above: three rounded, box-like lobes (local u along the tunnel, v across)
const LOBES: [number, number, number, number][] = [[0, 0, 14, 8.5], [-10, 2.5, 8.5, 6.5], [10, -2, 8.5, 7], [2, 5, 6, 4.5]];
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
function lobeDist(u: number, v: number) {
  let d = 1e9;
  for (const [u0, v0, ru, rv] of LOBES) {
    const q = Math.pow(Math.abs((u - u0) / ru) ** 2.6 + Math.abs((v - v0) / rv) ** 2.6, 1 / 2.6);
    d = smin(d, (q - 1) * Math.min(ru, rv) * 0.85, 3);
  }
  return d + (vn3(u * 0.09, 0.5, v * 0.09) - 0.5) * 5 + (vn3(u * 0.25, 2.5, v * 0.25) - 0.5) * 1.6;   // a ragged outline
}
// 0..1: how much of the seabed at (x, z) lies under the massif (with a margin for its rough sides)
export function caveFootprint(c: CaveSpec) {
  const ca = Math.cos(c.rot), sa = Math.sin(c.rot);
  return (x: number, z: number) => {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > 30 || Math.abs(dz) > 30) return 0;
    return 1 - smooth(-1.5, 4.5, lobeDist(dx * ca + dz * sa, -dx * sa + dz * ca));
  };
}

function h3(x: number, y: number, z: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), fx), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), fx), fy),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), fx), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), fx), fy), fz);
}

export class Cave {
  readonly cx: number; readonly cz: number; readonly ca: number; readonly sa: number;
  readonly step = 0.45;
  readonly min: [number, number, number];          // local (u, y, v) of sample 0
  readonly n: [number, number, number];
  readonly d: Float32Array;                        // signed distance, negative inside rock
  readonly top: number;                            // flat top of the massif
  readonly tex: THREE.Data3DTexture;
  readonly geo: THREE.BufferGeometry;
  readonly skylights: { pos: THREE.Vector3; r: number; floor: number }[] = [];
  readonly foot: (x: number, z: number) => number;
  private colTop: Float32Array;
  private sky: Float32Array;
  private job: { s: [number, number, number]; k: number; buf: Uint8Array } | null = null;
  private baked = new THREE.Vector3(0, -1, 0);
  private tour: { p: THREE.Vector3[]; look: THREE.Vector3[]; t: number[] } = { p: [], look: [], t: [] };

  constructor(spec: CaveSpec, floor: (x: number, z: number) => number) {
    this.cx = spec.x; this.cz = spec.z; this.ca = Math.cos(spec.rot); this.sa = Math.sin(spec.rot);
    this.foot = caveFootprint(spec);
    const U0 = -23, U1 = 23, V0 = -13.5, V1 = 13.5;
    const fl = (u: number, v: number) => floor(...this.toWorld(u, v));
    let fmin = 1e9, fsum = 0, fn = 0;
    for (let u = U0; u <= U1; u += 1) for (let v = V0; v <= V1; v += 1) { const f = fl(u, v); fmin = Math.min(fmin, f); if (this.foot(...this.toWorld(u, v)) > 0.5) { fsum += f; fn++; } }
    const base = fsum / Math.max(fn, 1);
    this.top = Math.min(base + 8, -3.8);
    const top = this.top;

    // the tunnel: a winding tube along u that keeps to the seabed, a chamber, and three skylights
    const vc = (u: number) => 2.0 * Math.sin(u * 0.13 + 0.7);
    const rad = (u: number) => 2.5 + 0.6 * Math.sin(u * 0.23 + 1.3);
    const FL: number[] = [];
    for (let u = U0 - 4; u <= U1 + 4; u += 0.5) FL.push(fl(u, vc(u)));
    const flAt = (u: number) => { const f = (Math.min(Math.max(u, U0 - 4), U1 + 4) - (U0 - 4)) * 2, i = Math.min(FL.length - 2, Math.floor(f)); return FL[i] + (FL[i + 1] - FL[i]) * (f - i); };
    const yc = (u: number) => flAt(u) + rad(u) * 0.5;
    const CH = { u: 3, y: yc(3) + 0.9, v: vc(3) + 1.2, r: [5.5, 3.4, 4.6] };
    const SKY = [{ u: -7.5, r: 1.0, tu: 0.14, tv: 0.05 }, { u: 3.6, r: 1.35, tu: -0.06, tv: 0.12 }, { u: 11, r: 1.15, tu: 0.1, tv: -0.1 }].map((k) => ({ ...k, y0: yc(k.u) + 1, v0: vc(k.u) }));

    // ld, ytn, sp: the parts that only depend on the column (u, v)
    const sdf = (u: number, y: number, v: number, ld: number, ytn: number, sp: number, vcu: number, r: number, c: number) => {
      if (ld > 8) return ld - 5.5;                                          // well clear of the massif
      // walls lean out toward the top (the notch bored at the foot of reef rock), shoulders round off
      // toward the rim, and the top is a rough, uneven reef flat
      const dh = ld - 1.6 * smooth(base - 1, top, y);
      const yt = top - 2.6 * (1 - smooth(-7, -1, dh)) + ytn;
      if (y - yt > 5.5) return y - yt - 4.5;
      let dm = smax(dh, y - yt, 1.2);
      dm += (vn3(u * 0.14, y * 0.2, v * 0.14) - 0.5) * 3.2 + (vn3(u * 0.32, y * 0.32, v * 0.32) - 0.5) * 1.6 + (vn3(u * 0.55 + 7, y * 0.7, v * 0.55) - 0.5) * 0.9;
      dm += 0.3 * Math.sin(y * 1.7 + sp);                                   // strata: ledges along the bedding
      if (dm > 3) return dm;
      const dt = Math.hypot((v - vcu) / 1.2, (y - c) / 0.95) - r;
      const ex = (u - CH.u) / CH.r[0], ey = (y - CH.y) / CH.r[1], ez = (v - CH.v) / CH.r[2];
      const k0 = Math.hypot(ex, ey, ez), k1 = Math.hypot(ex / CH.r[0], ey / CH.r[1], ez / CH.r[2]);
      let carve = smin(dt, k0 * (k0 - 1) / Math.max(k1, 1e-4), 2.0);
      for (let i = 0; i < SKY.length; i++) {
        const s = SKY[i], y0 = s.y0, dy = Math.max(y - y0, 0);
        const ds = Math.hypot(u - (s.u + dy * s.tu), v - (s.v0 + dy * s.tv), Math.min(y - y0, 0)) - s.r * (1 + 0.2 * Math.sin(y * 1.3 + i * 2));
        carve = smin(carve, ds, 1.0);
      }
      carve += (vn3(u * 0.6, y * 0.6, v * 0.6) - 0.5) * 0.9 + (vn3(u * 1.7, y * 1.7 + 5, v * 1.7) - 0.5) * 0.25;
      return smax(dm, -carve, 0.7);
    };

    const s = this.step;
    this.min = [U0, fmin - 2.2, V0];
    this.n = [Math.ceil((U1 - U0) / s) + 1, Math.ceil((top + 4.5 - this.min[1]) / s) + 1, Math.ceil((V1 - V0) / s) + 1];
    const [nx, ny, nz] = this.n;
    this.d = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const u = U0 + i * s, v = V0 + k * s, ld = lobeDist(u, v), ytn = (vn3(u * 0.12, 1.7, v * 0.12) - 0.5) * 2.6, sp = vn3(u * 0.1, 3, v * 0.1) * 6;
      const vcu = vc(u), r = rad(u), c = yc(u);
      for (let j = 0; j < ny; j++) this.d[i + nx * (j + ny * k)] = sdf(u, this.min[1] + j * s, v, ld, ytn, sp, vcu, r, c);
    }
    this.colTop = new Float32Array(nx * nz).fill(-1e9);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) for (let j = ny - 1; j >= 0; j--) if (this.d[i + nx * (j + ny * k)] < 0) { this.colTop[i + nx * k] = this.min[1] + (j + 0.5) * s; break; }

    this.geo = this.mesh(floor);

    // skylights, for the beams
    for (const k of SKY) {
      const u = k.u + (top - yc(k.u)) * k.tu, v = vc(k.u) + (top - yc(k.u)) * k.tv;
      const [x, z] = this.toWorld(u, v);
      this.skylights.push({ pos: new THREE.Vector3(x, top + 0.5, z), r: k.r, floor: flAt(k.u) });
    }
    // the director's way through: in at one end, a pause under the big skylight, out at the other
    const P: THREE.Vector3[] = [], Lk: THREE.Vector3[] = [], T: number[] = [];
    let t = 0;
    const sky = this.skylights[1];
    for (let u = U0 - 5; u <= U1 + 5; u += 0.5) {
      const [x, z] = this.toWorld(u, vc(u));
      const p = new THREE.Vector3(x, Math.max(yc(u), flAt(u) + 1.3), z);
      const w = Math.exp(-(((u - CH.u) / 3.2) ** 2));
      const [ax, az] = this.toWorld(u + 5, vc(u + 5));
      const look = new THREE.Vector3(ax, yc(u + 5) - 0.3, az).lerp(sky.pos, w * 0.85);
      if (P.length) t += 0.5 / (0.75 * (1 - 0.7 * w));
      P.push(p); Lk.push(look); T.push(t);
    }
    this.tour = { p: P, look: Lk, t: T };

    // light volume
    this.sky = new Float32Array(nx * ny * nz);
    this.bakeSky();
    const data = new Uint8Array(nx * ny * nz * 2);
    for (let i = 0; i < nx * ny * nz; i++) { data[i * 2] = data[i * 2 + 1] = Math.round(this.sky[i] * 255); }   // sun starts as sky until its bake lands
    this.tex = new THREE.Data3DTexture(data, nx, ny, nz);
    this.tex.format = THREE.RGFormat; this.tex.type = THREE.UnsignedByteType;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = this.tex.wrapR = THREE.ClampToEdgeWrapping;
    this.tex.unpackAlignment = 1;
  }

  toWorld(u: number, v: number): [number, number] { return [this.cx + u * this.ca - v * this.sa, this.cz + u * this.sa + v * this.ca]; }
  toLocal(x: number, z: number): [number, number] { const dx = x - this.cx, dz = z - this.cz; return [dx * this.ca + dz * this.sa, -dx * this.sa + dz * this.ca]; }

  // trilinear distance at a local point; open water outside the grid
  private at(u: number, y: number, v: number) {
    const s = this.step, [nx, ny, nz] = this.n;
    const fx = (u - this.min[0]) / s, fy = (y - this.min[1]) / s, fz = (v - this.min[2]) / s;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return fy < 0 ? -1 : 4;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k;
    const D = this.d, o = i + nx * (j + ny * k), sy = nx, sz = nx * ny;
    const a0 = D[o] + (D[o + 1] - D[o]) * tx, a1 = D[o + sy] + (D[o + sy + 1] - D[o + sy]) * tx;
    const b0 = D[o + sz] + (D[o + sz + 1] - D[o + sz]) * tx, b1 = D[o + sz + sy] + (D[o + sz + sy + 1] - D[o + sz + sy]) * tx;
    const a = a0 + (a1 - a0) * ty, b = b0 + (b1 - b0) * ty;
    return a + (b - a) * tz;
  }
  // world-space distance to rock (large when well away from the massif)
  sd(x: number, y: number, z: number) { const [u, v] = this.toLocal(x, z); return this.at(u, y, v); }
  grad(x: number, y: number, z: number, out: THREE.Vector3) {
    const e = 0.3;
    out.set(this.sd(x + e, y, z) - this.sd(x - e, y, z), this.sd(x, y + e, z) - this.sd(x, y - e, z), this.sd(x, y, z + e) - this.sd(x, y, z - e));
    return out.lengthSq() > 1e-9 ? out.normalize() : out.set(0, 1, 0);
  }
  // highest rock in the column at (x, z), or -1e9
  topAt(x: number, z: number) {
    const [u, v] = this.toLocal(x, z), s = this.step, [nx, , nz] = this.n;
    const i = Math.round((u - this.min[0]) / s), k = Math.round((v - this.min[2]) / s);
    let m = -1e9;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, kk = k + dk;
      if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) m = Math.max(m, this.colTop[ii + nx * kk]);
    }
    return m;
  }
  // how much open sky a point sees (1 outside, low deep in the tunnel)
  skyAt(x: number, y: number, z: number) {
    const [u, v] = this.toLocal(x, z), s = this.step, [nx, ny, nz] = this.n;
    const i = Math.round((u - this.min[0]) / s), j = Math.round((y - this.min[1]) / s), k = Math.round((v - this.min[2]) / s);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 1;
    return this.sky[i + nx * (j + ny * k)];
  }

  // soft visibility from a local point along a local direction
  private vis(u: number, y: number, v: number, du: number, dy: number, dv: number, maxT: number, k = 4) {
    let res = 1, t = 0.2;
    const yEnd = this.top + 3;
    for (let n = 0; n < 48 && t < maxT; n++) {
      const py = y + dy * t;
      if (py > yEnd) break;
      const h = this.at(u + du * t, py, v + dv * t);
      if (h < 0.02) return 0;
      res = Math.min(res, k * h / t);
      t += Math.min(Math.max(h, 0.2), 2.0);
    }
    return Math.max(0, Math.min(1, res));
  }
  // lift samples just inside the rock out to its surface so the filtered volume doesn't darken walls
  private lifted(i: number, j: number, k: number, out: number[]) {
    const s = this.step, [nx, ny] = this.n;
    let u = this.min[0] + i * s, y = this.min[1] + j * s, v = this.min[2] + k * s;
    const d = this.d[i + nx * (j + ny * k)];
    if (d < 0.3) {
      const e = 0.3;
      let gu = this.at(u + e, y, v) - this.at(u - e, y, v), gy = this.at(u, y + e, v) - this.at(u, y - e, v), gv = this.at(u, y, v + e) - this.at(u, y, v - e);
      const L = Math.hypot(gu, gy, gv) || 1; gu /= L; gy /= L; gv /= L;
      const m = 0.3 - d; u += gu * m; y += gy * m; v += gv * m;
    }
    out[0] = u; out[1] = y; out[2] = v;
    return d;
  }

  private bakeSky() {
    const [nx, ny, nz] = this.n, C = 3;
    const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
    const coarse = new Float32Array(cx * cy * cz);
    const dirs: [number, number, number, number][] = [[0, 1, 0, 1]];
    for (let a = 0; a < 5; a++) {
      for (const [el, w] of [[0.95, 0.8], [0.45, 0.45]]) {
        const ang = a * Math.PI * 0.4 + (el < 0.5 ? Math.PI * 0.2 : 0);
        dirs.push([Math.cos(ang) * Math.cos(el), Math.sin(el), Math.sin(ang) * Math.cos(el), w]);
      }
    }
    const wsum = dirs.reduce((a, d) => a + d[3], 0), p = [0, 0, 0];
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const fi = Math.min(nx - 1, i * C), fj = Math.min(ny - 1, j * C), fk = Math.min(nz - 1, k * C);
      const d = this.lifted(fi, fj, fk, p);
      let acc = 0;
      if (d > 6) acc = wsum;
      else if (d > -1.0) for (const [du, dy, dv, w] of dirs) acc += this.vis(p[0], p[1], p[2], du, dy, dv, 40) * w;
      coarse[i + cx * (j + cy * k)] = acc / wsum;
    }
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const fx = i / C, fy = j / C, fz = k / C, i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz), tx = fx - i0, ty = fy - j0, tz = fz - k0;
      const g = (a: number, b: number, c: number) => coarse[a + cx * (b + cy * c)];
      const l = (a: number, b: number, t: number) => a + (b - a) * t;
      this.sky[i + nx * (j + ny * k)] = l(l(l(g(i0, j0, k0), g(i0 + 1, j0, k0), tx), l(g(i0, j0 + 1, k0), g(i0 + 1, j0 + 1, k0), tx), ty),
        l(l(g(i0, j0, k0 + 1), g(i0 + 1, j0, k0 + 1), tx), l(g(i0, j0 + 1, k0 + 1), g(i0 + 1, j0 + 1, k0 + 1), tx), ty), tz);
    }
  }

  // Re-bake the sun channel when the sun has moved; works through the volume a slice at a time within
  // the time budget and uploads the finished bake in one go.
  updateSun(dir: THREE.Vector3, budgetMs = 2.5) {
    const [nx, ny, nz] = this.n;
    if (!this.job) {
      if (dir.angleTo(this.baked) < 0.012) return;
      this.baked.copy(dir);
      const y = Math.max(dir.y, 0.25), L = Math.hypot(dir.x, y, dir.z);
      const du = (dir.x * this.ca + dir.z * this.sa) / L, dv = (-dir.x * this.sa + dir.z * this.ca) / L;
      this.job = { s: [du, y / L, dv], k: 0, buf: new Uint8Array(nx * ny * nz) };
    }
    const job = this.job, t0 = performance.now(), p = [0, 0, 0];
    while (job.k < nz) {
      const k = job.k++;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = i + nx * (j + ny * k);
        const d = this.lifted(i, j, k, p);
        job.buf[o] = d < -1.0 ? 0 : d > 6 && p[1] > this.top ? 255 : Math.round(this.vis(p[0], p[1], p[2], job.s[0], job.s[1], job.s[2], 60, 14) * 255);
      }
      if (performance.now() - t0 > budgetMs) return;
    }
    const data = this.tex.image.data as Uint8Array;
    for (let o = 0; o < nx * ny * nz; o++) data[o * 2] = job.buf[o];
    this.tex.needsUpdate = true;
    this.job = null;
  }

  // position and gaze along the tour at time t (s); rev walks it the other way
  tourAt(t: number, rev: boolean, pos: THREE.Vector3, look: THREE.Vector3) {
    const T = this.tour.t, end = T[T.length - 1];
    let tt = Math.min(Math.max(t, 0), end);
    if (rev) tt = end - tt;
    let i = 0;
    while (i < T.length - 2 && T[i + 1] < tt) i++;
    const f = (tt - T[i]) / Math.max(T[i + 1] - T[i], 1e-6);
    pos.lerpVectors(this.tour.p[i], this.tour.p[i + 1], f);
    if (!rev) look.lerpVectors(this.tour.look[i], this.tour.look[i + 1], f);
    else {
      // walking back: look toward where we are heading, still craning up under the skylight
      const j = Math.max(0, i - 10);
      look.copy(this.tour.p[j]);
      const fw = this.tour.look[i].clone().sub(this.tour.p[i]);
      if (fw.y > 1.5) look.lerp(this.skylights[1].pos, Math.min(1, (fw.y - 1.5) / 4));
    }
    return tt;
  }
  get tourLength() { return this.tour.t[this.tour.t.length - 1]; }
  tourStart(rev: boolean) { return rev ? this.tour.p[this.tour.p.length - 1] : this.tour.p[0]; }

  // surface nets over the distance grid; faces buried in the seabed are dropped
  private mesh(floor: (x: number, z: number) => number) {
    const [nx, ny, nz] = this.n, s = this.step, D = this.d;
    const I = (i: number, j: number, k: number) => i + nx * (j + ny * k);
    const C = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
    const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const pos: number[] = [];
    const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const val = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { val[c] = D[I(i + CO[c][0], j + CO[c][1], k + CO[c][2])]; if (val[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, cnt = 0;
      for (const [a, b] of ED) {
        if ((val[a] < 0) === (val[b] < 0)) continue;
        const t = val[a] / (val[a] - val[b]);
        ax += CO[a][0] + t * (CO[b][0] - CO[a][0]); ay += CO[a][1] + t * (CO[b][1] - CO[a][1]); az += CO[a][2] + t * (CO[b][2] - CO[a][2]);
        cnt++;
      }
      cellV[C(i, j, k)] = pos.length / 3;
      pos.push(this.min[0] + (i + ax / cnt) * s, this.min[1] + (j + ay / cnt) * s, this.min[2] + (k + az / cnt) * s);
    }
    // world positions, normals from the field, and whether each vertex is buried
    const nv = pos.length / 3, P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), buried = new Uint8Array(nv), g = new THREE.Vector3();
    for (let q = 0; q < nv; q++) {
      const [x, z] = this.toWorld(pos[q * 3], pos[q * 3 + 2]), y = pos[q * 3 + 1];
      P[q * 3] = x; P[q * 3 + 1] = y; P[q * 3 + 2] = z;
      this.grad(x, y, z, g); N[q * 3] = g.x; N[q * 3 + 1] = g.y; N[q * 3 + 2] = g.z;
      buried[q] = y < floor(x, z) - 0.7 ? 1 : 0;
    }
    const idx: number[] = [];
    const tri = (a: number, b: number, c: number) => {
      if (buried[a] && buried[b] && buried[c]) return;
      // wind so the face points out of the rock
      const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
      const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
      const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const dot = fx * (N[a * 3] + N[b * 3] + N[c * 3]) + fy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + fz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
      if (dot >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    };
    const quad = (a: number, b: number, c: number, d: number) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; tri(a, b, c); tri(a, c, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const in0 = D[I(i, j, k)] < 0;
      if (in0 !== (D[I(i + 1, j, k)] < 0)) quad(cellV[C(i, j - 1, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i, j - 1, k)]);
      if (in0 !== (D[I(i, j + 1, k)] < 0)) quad(cellV[C(i - 1, j, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)]);
      if (in0 !== (D[I(i, j, k + 1)] < 0)) quad(cellV[C(i - 1, j - 1, k)], cellV[C(i, j - 1, k)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setIndex(idx);
    return geo;
  }
}
