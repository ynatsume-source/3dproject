// Procedural models: corals, fish (per-species body plans and colour patterns), turtles and mantas.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';
import { fbm, smooth, mulberry32 } from '../core/math';

/* ================= geometry helpers ================= */
export const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
export function Acc() { return { pos: [], nrm: [], tip: [], extra: [] }; }
// append a geometry, transformed by m, with a per-vertex scalar from tipFn(localPos)
export function pushGeo(acc, geo, m, tipFn?, extraVal = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const t = tipFn ? tipFn(v) : 0;
    v.applyMatrix4(m); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    acc.pos.push(v.x, v.y, v.z); acc.nrm.push(n.x, n.y, n.z); acc.tip.push(t); acc.extra.push(extraVal);
  }
}
export function accGeo(acc, extraName?: string) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(acc.tip, 1));
  if (extraName) g.setAttribute(extraName, new THREE.Float32BufferAttribute(acc.extra, 1));
  return g;
}
export function orientTo(dir, base, len) { _q.setFromUnitVectors(UPV, dir); return new THREE.Matrix4().compose(base, _q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, len / 2, 0)); }

/* ---------- coral shapes (built once; each sea colours its instances) ---------- */
export function branchCoralGeo(seed, style) {
  const rnd = mulberry32(seed), acc = Acc();
  const maxD = style === 'stag' ? 3 : 3;
  function grow(base, dir, len, rad, depth) {
    const m = orientTo(dir, base, len);
    const cyl = new THREE.CylinderGeometry(rad * 0.72, rad, len, 5, 1, true);
    pushGeo(acc, cyl, m, (v) => (depth + (v.y / len + 0.5)) / (maxD + 1));
    const end = base.clone().addScaledVector(dir, len);
    if (depth >= maxD) {
      const cap = new THREE.ConeGeometry(rad * 0.72, rad * 2.2, 5, 1, true);
      pushGeo(acc, cap, orientTo(dir, end, rad * 2.2), () => 1);
      return;
    }
    const kids = style === 'stag' ? (rnd() < 0.6 ? 2 : 1) : 2 + (rnd() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const axis = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize();
      const nd = dir.clone().applyAxisAngle(axis, (style === 'stag' ? 0.35 : 0.5) + rnd() * 0.45);
      nd.y += 0.35; nd.normalize();
      grow(end, nd, len * (style === 'stag' ? 0.85 : 0.72), rad * 0.72, depth + 1);
    }
  }
  const trunks = style === 'stag' ? 5 : 6;
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rnd() * 0.6;
    const tilt = 0.25 + rnd() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    grow(new THREE.Vector3(0, 0, 0), dir, style === 'stag' ? 0.3 : 0.2, style === 'stag' ? 0.045 : 0.06, 0);
  }
  return accGeo(acc);
}
export function tableCoralGeo() {
  const acc = Acc();
  const plate = new THREE.CylinderGeometry(1, 0.9, 0.09, 28, 3);
  const p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    const k = 1 + 0.06 * Math.sin(a * 5) + 0.04 * Math.sin(a * 11 + 1);
    p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, p.getY(i) + Math.sin(a * 7) * 0.025 * r - r * r * 0.05);
  }
  plate.computeVertexNormals();
  pushGeo(acc, plate, new THREE.Matrix4().makeTranslation(0, 0.5, 0), (v) => Math.hypot(v.x, v.z));
  pushGeo(acc, new THREE.CylinderGeometry(0.1, 0.2, 0.5, 7), new THREE.Matrix4().makeTranslation(0, 0.25, 0), () => 0);
  return accGeo(acc);
}
export function brainCoralGeo() {
  const acc = Acc();
  const g = new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (fbm(x * 1.6 + 3, z * 1.6 + y, 3) - 0.5) * 0.25;
    p.setXYZ(i, x * k, y * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4(), (v) => v.y / 0.7);
  return accGeo(acc);
}
// ---- close-up coral geometry (drawn only near the camera; see LOD in coralMaterial) ----
// Staghorn Acropora: leaders that keep growing with a gentle wander and throw off side branches.
export function acroporaStag(seed) {
  const rnd = mulberry32(seed), acc = Acc(), maxD = 5;
  function grow(base, dir, len, rad, depth) {
    pushGeo(acc, new THREE.CylinderGeometry(rad * 0.86, rad, len, 7, 2, true), orientTo(dir, base, len), (v) => (depth + (v.y / len + 0.5)) / (maxD + 1));
    const end = base.clone().addScaledVector(dir, len);
    if (depth >= maxD || rad < 0.008) {
      const tip = new THREE.SphereGeometry(rad * 0.86, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      pushGeo(acc, tip, new THREE.Matrix4().compose(end, new THREE.Quaternion().setFromUnitVectors(UPV, dir), new THREE.Vector3(1, 1.6, 1)), () => 1);
      return;
    }
    const cont = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.4, 0.1, (rnd() - 0.5) * 0.4)).normalize();
    grow(end, cont, len * 0.93, rad * 0.88, depth + 1);
    if (rnd() < 0.62) {
      const axis = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize();
      const sd = dir.clone().applyAxisAngle(axis, 0.55 + rnd() * 0.5); sd.y += 0.15; sd.normalize();
      grow(end, sd, len * 0.82, rad * 0.78, depth + 1);
    }
  }
  const trunks = 8;
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rnd() * 0.7, tilt = 0.3 + rnd() * 0.75;
    grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize(), 0.19, 0.03, 0);
  }
  return accGeo(acc);
}
// Corymbose Acropora (like A. digitifera): a low dome bristling with short upright fingers.
export function acroporaCorymbose(seed, hi) {
  const rnd = mulberry32(seed), acc = Acc();
  const dome = new THREE.SphereGeometry(0.5, hi ? 20 : 10, hi ? 6 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
  pushGeo(acc, dome, new THREE.Matrix4().makeScale(1, 0.3, 1), (v) => 0.3 + v.y);
  const n = hi ? 170 : 45;
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rnd()) * 0.47, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = 0.15 * Math.sqrt(Math.max(0, 1 - (r / 0.5) ** 2)) - 0.01;
    const lean = 0.9 * r;
    const dir = new THREE.Vector3(x * lean, 1, z * lean).normalize();
    const len = (0.07 + rnd() * 0.08) * (1.25 - r), rad = 0.013 + rnd() * 0.008;
    const base = new THREE.Vector3(x, y, z);
    pushGeo(acc, new THREE.CylinderGeometry(rad * 0.85, rad, len, hi ? 6 : 3, 1, true), orientTo(dir, base, len), (v) => 0.45 + 0.4 * (v.y / len + 0.5));
    if (hi) pushGeo(acc, new THREE.SphereGeometry(rad * 0.85, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.Matrix4().compose(base.clone().addScaledVector(dir, len), new THREE.Quaternion().setFromUnitVectors(UPV, dir), new THREE.Vector3(1, 1.4, 1)), () => 1);
  }
  return accGeo(acc);
}
// Table Acropora, close up: a thin scalloped plate with an upturned growing rim.
export function tableCoralHi() {
  const acc = Acc();
  const plate = new THREE.CylinderGeometry(1, 0.94, 0.07, 72, 6);
  const p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    const k = 1 + 0.06 * Math.sin(a * 5) + 0.04 * Math.sin(a * 11 + 1) + 0.018 * Math.sin(a * 37);
    p.setX(i, x * k); p.setZ(i, z * k);
    p.setY(i, p.getY(i) + Math.sin(a * 7) * 0.025 * r - r * r * 0.05 + Math.pow(Math.max(0, r - 0.85), 2) * 1.2 + (fbm(x * 4, z * 4, 2) - 0.5) * 0.02 * r);
  }
  plate.computeVertexNormals();
  pushGeo(acc, plate, new THREE.Matrix4().makeTranslation(0, 0.5, 0), (v) => Math.hypot(v.x, v.z));
  pushGeo(acc, new THREE.CylinderGeometry(0.1, 0.2, 0.5, 12), new THREE.Matrix4().makeTranslation(0, 0.25, 0), () => 0);
  return accGeo(acc);
}
export function brainCoralGeoDetail(ws, hs) {
  const acc = Acc();
  const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (fbm(x * 1.6 + 3, z * 1.6 + y, 3) - 0.5) * 0.25;
    p.setXYZ(i, x * k, y * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4(), (v) => v.y / 0.7);
  return accGeo(acc);
}
// Massive Porites: a lumpy, knobbed boulder of coral.
export function poritesGeo(ws, hs) {
  const acc = Acc();
  const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const lobes = (fbm(x * 1.1 + 9, z * 1.1 + y * 0.8 - 4, 3) - 0.5) * 0.6;
    const knobs = Math.pow(Math.abs(Math.sin(x * 6.5 + Math.sin(z * 3)) * Math.sin(z * 6.5 + Math.sin(x * 3))), 3) * 0.08 * y;
    const k = 1 + lobes + knobs;
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4(), (v) => v.y / 0.85);
  return accGeo(acc);
}

// Sea fan (gorgonian): a slightly cupped fan-shaped sheet on a short stalk. The shader cuts the sheet
// into a lace of fine branches and radial ribs.
export function fanSheetGeo(seed) {
  const rnd = mulberry32(seed), acc = Acc();
  const R0 = 0.14, RA = 24, RR = 10, spread = 1.1 + rnd() * 0.5, lobes = [rnd(), rnd(), rnd()];
  const pos = [], tip = [];
  const at = (i, j) => {
    const a = (i / RA - 0.5) * spread * 2, t = j / RR;
    const edge = 1 + 0.12 * Math.sin(a * 3 + lobes[0] * 6) + 0.08 * Math.sin(a * 7 + lobes[1] * 6);
    const r = R0 + t * (1 - R0) * edge;
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    return [x, y + 0.1, 0.12 * x * x - 0.05 * t * t, r];
  };
  for (let i = 0; i < RA; i++) for (let j = 0; j < RR; j++) {
    const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
    for (const k of [0, 1, 2, 2, 1, 3]) { pos.push(q[k][0], q[k][1], q[k][2]); tip.push(q[k][3]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4(), (v) => Math.hypot(v.x, v.y - 0.1));
  pushGeo(acc, new THREE.CylinderGeometry(0.025, 0.04, 0.2, 6), new THREE.Matrix4().makeTranslation(0, 0.1, 0), () => 0);
  return accGeo(acc);
}
// Leather coral (Sarcophyton): a stout stalk under a broad, deeply folded cap.
export function sarcophytonGeo() {
  const acc = Acc();
  const pts = [[0.0, 0], [0.13, 0], [0.12, 0.2], [0.16, 0.33], [0.32, 0.42], [0.5, 0.47], [0.53, 0.52], [0.44, 0.56], [0.22, 0.555], [0.0, 0.53]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 56);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (r > 0.25) {
      const k = (r - 0.25) / 0.28;
      p.setX(i, x * (1 + 0.1 * Math.sin(a * 5 + 1) * k)); p.setZ(i, z * (1 + 0.1 * Math.sin(a * 5 + 1) * k));
      p.setY(i, p.getY(i) + (Math.sin(a * 9) * 0.07 + Math.sin(a * 4 + 2) * 0.04) * k * k);
    }
  }
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4(), (v) => smooth(0.36, 0.46, v.y));
  return accGeo(acc);
}
// Finger leather coral (Sinularia): a low mound crowded with thick, soft, upright lobes.
export function sinulariaGeo(seed) {
  const rnd = mulberry32(seed), acc = Acc();
  pushGeo(acc, new THREE.SphereGeometry(0.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeScale(1, 0.35, 1), () => 0.3);
  for (let i = 0; i < 34; i++) {
    const r = Math.sqrt(rnd()) * 0.36, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = 0.14 * Math.sqrt(Math.max(0, 1 - (r / 0.4) ** 2));
    const dir = new THREE.Vector3(x * 0.8 + (rnd() - 0.5) * 0.3, 1, z * 0.8 + (rnd() - 0.5) * 0.3).normalize();
    const len = 0.1 + rnd() * 0.2, rad = 0.035 + rnd() * 0.025, base = new THREE.Vector3(x, y, z);
    pushGeo(acc, new THREE.CylinderGeometry(rad * 0.9, rad, len, 8, 2, true), orientTo(dir, base, len), (v) => 0.4 + 0.5 * (v.y / len + 0.5));
    pushGeo(acc, new THREE.SphereGeometry(rad * 0.9, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().compose(base.clone().addScaledVector(dir, len), new THREE.Quaternion().setFromUnitVectors(UPV, dir), new THREE.Vector3(1, 1.2, 1)), () => 1);
  }
  return accGeo(acc);
}
// Soft-coral tree (Dendronephthya): a translucent trunk branching into clusters of polyps.
export function dendroGeo(seed) {
  const rnd = mulberry32(seed), acc = Acc();
  function grow(base, dir, len, rad, depth) {
    pushGeo(acc, new THREE.CylinderGeometry(rad * 0.8, rad, len, 7, 1, true), orientTo(dir, base, len), () => 0.2 + depth * 0.15);
    const end = base.clone().addScaledVector(dir, len);
    if (depth >= 3) {
      for (let k = 0; k < 6; k++) {
        const o = new THREE.Vector3(rnd() - 0.5, rnd() * 0.6, rnd() - 0.5).multiplyScalar(0.07).add(end);
        pushGeo(acc, new THREE.SphereGeometry(0.018 + rnd() * 0.012, 6, 4), new THREE.Matrix4().makeTranslation(o.x, o.y, o.z), () => 1);
      }
      return;
    }
    const kids = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const axis = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize();
      const nd = dir.clone().applyAxisAngle(axis, 0.45 + rnd() * 0.5); nd.y += 0.25; nd.normalize();
      grow(end, nd, len * 0.72, rad * 0.62, depth + 1);
    }
  }
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.32, 0.07, 0);
  return accGeo(acc);
}
export function fanCoralGeo(seed) {
  const rnd = mulberry32(seed), pos = [], tip = [];
  function seg(x0, y0, a, len, w, depth) {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w, w1 = w * 0.8;
    const nx1 = -Math.sin(a) * w1, ny1 = Math.cos(a) * w1;
    const quad = [[x0 - nx, y0 - ny], [x0 + nx, y0 + ny], [x1 - nx1, y1 - ny1], [x1 + nx1, y1 + ny1]];
    for (const k of [0, 1, 2, 2, 1, 3]) { pos.push(quad[k][0], quad[k][1], 0); tip.push(Math.min(1, (k < 2 ? y0 : y1) / 1.0)); }
    if (depth <= 0) return;
    const spread = 0.25 + rnd() * 0.35;
    seg(x1, y1, a - spread, len * 0.8, w1, depth - 1);
    seg(x1, y1, a + spread * 0.9, len * 0.8, w1, depth - 1);
    if (rnd() < 0.35) seg(x1, y1, a + (rnd() - 0.5) * 0.3, len * 0.6, w1 * 0.8, depth - 2);
  }
  seg(0, 0, Math.PI / 2, 0.16, 0.03, 0);
  for (let i = 0; i < 3; i++) seg(0, 0.14, Math.PI / 2 + (i - 1) * 0.55, 0.2, 0.022, 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  return g;
}
export function mushroomGeo() {
  const acc = Acc();
  const pts = [[0.0, 0], [0.13, 0], [0.13, 0.22], [0.17, 0.34], [0.34, 0.42], [0.5, 0.47], [0.52, 0.52], [0.42, 0.56], [0.2, 0.57], [0.0, 0.56]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (r > 0.3) p.setY(i, p.getY(i) + Math.sin(a * 5) * 0.06 * (r - 0.3) / 0.22);
  }
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4(), (v) => smooth(0.36, 0.46, v.y));
  return accGeo(acc);
}
export function anemoneGeo(seed) {
  const rnd = mulberry32(seed), acc = Acc();
  pushGeo(acc, new THREE.CylinderGeometry(0.27, 0.3, 0.1, 16), new THREE.Matrix4().makeTranslation(0, 0.05, 0), () => 0);
  for (let i = 0; i < 90; i++) {
    const r = Math.sqrt(rnd()) * 0.26, a = rnd() * Math.PI * 2;
    const base = new THREE.Vector3(Math.cos(a) * r, 0.09, Math.sin(a) * r);
    const dir = new THREE.Vector3(Math.cos(a) * (0.3 + r * 2), 1, Math.sin(a) * (0.3 + r * 2)).normalize();
    const len = 0.16 + rnd() * 0.1;
    const c = new THREE.CylinderGeometry(0.008, 0.016, len, 4, 3, true);
    pushGeo(acc, c, orientTo(dir, base, len), (v) => 0.15 + 0.85 * (v.y / len + 0.5));
  }
  return accGeo(acc);
}
export function clamGeo() {
  const acc = Acc();
  const g = new THREE.SphereGeometry(0.5, 24, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const flute = 1 + 0.07 * Math.abs(Math.sin(Math.atan2(y, z) * 6));
    p.setXYZ(i, x * 1.0, y * 0.42 * (y > 0 ? 0.6 : 1), z * 0.55 * flute + Math.sin(x * 22) * 0.02 * smooth(0.1, 0.0, Math.abs(y)));
  }
  g.computeVertexNormals();
  pushGeo(acc, g, new THREE.Matrix4().makeTranslation(0, 0.12, 0), (v) => smooth(0.05, 0.16, v.y));
  return accGeo(acc);
}
export function eelGeo() {
  const acc = Acc();
  pushGeo(acc, new THREE.CylinderGeometry(0.011, 0.014, 1, 6, 10, false), new THREE.Matrix4().makeTranslation(0, 0.5, 0), (v) => v.y + 0.5);
  return accGeo(acc);
}
export const CORAL_GEO = {
  branch: [branchCoralGeo(3, 'stag'), acroporaCorymbose(8, false)],
  table: [tableCoralGeo()], brain: [brainCoralGeo(), poritesGeo(22, 9)], fan: [fanSheetGeo(5), fanSheetGeo(9)],
  mushroom: [sarcophytonGeo(), sinulariaGeo(21), dendroGeo(33)], anemone: [anemoneGeo(4)], clam: [clamGeo()], eel: [eelGeo()],
};
// Detailed versions, swapped in near the camera. Same footprint as the light version at each index.
export const CORAL_GEO_HI: Record<string, THREE.BufferGeometry[]> = {
  branch: [acroporaStag(3), acroporaCorymbose(8, true)],
  table: [tableCoralHi()],
  brain: [brainCoralGeoDetail(56, 22), poritesGeo(56, 22)],
};
export const KIND_ID = { branch: 0, table: 1, brain: 2, fan: 3, mushroom: 4, anemone: 5, clam: 6, eel: 7 };
export const PALETTE = {
  branch: [[[0.62, 0.50, 0.36], [0.88, 0.82, 0.72]], [[0.44, 0.47, 0.40], [0.45, 0.62, 0.88]], [[0.55, 0.38, 0.55], [0.88, 0.66, 0.86]], [[0.40, 0.50, 0.30], [0.72, 0.88, 0.55]], [[0.74, 0.70, 0.58], [0.96, 0.86, 0.76]]],
  table: [[[0.40, 0.33, 0.22], [0.58, 0.52, 0.38]], [[0.32, 0.36, 0.26], [0.50, 0.56, 0.44]], [[0.42, 0.33, 0.28], [0.62, 0.48, 0.42]], [[0.34, 0.38, 0.40], [0.52, 0.58, 0.66]]],
  porites: [[[0.62, 0.55, 0.36], [0.5, 0.45, 0.3]], [[0.55, 0.50, 0.58], [0.45, 0.4, 0.48]], [[0.50, 0.56, 0.42], [0.42, 0.46, 0.34]], [[0.66, 0.58, 0.46], [0.54, 0.46, 0.36]]],
  brain: [[[0.66, 0.55, 0.30], [0.40, 0.34, 0.22]], [[0.48, 0.58, 0.36], [0.30, 0.38, 0.25]], [[0.60, 0.46, 0.50], [0.40, 0.30, 0.36]], [[0.56, 0.54, 0.70], [0.36, 0.34, 0.48]]],
  fan: [[[0.78, 0.20, 0.16], [0.5, 0.1, 0.1]], [[0.88, 0.46, 0.16], [0.5, 0.2, 0.1]], [[0.58, 0.24, 0.58], [0.3, 0.1, 0.3]], [[0.88, 0.74, 0.30], [0.5, 0.4, 0.2]]],
  mushroom: [[[0.62, 0.58, 0.40], [0.56, 0.52, 0.42]], [[0.48, 0.54, 0.38], [0.52, 0.52, 0.44]], [[0.64, 0.54, 0.46], [0.58, 0.50, 0.44]]],
  sinularia: [[[0.52, 0.52, 0.36], [0.6, 0.58, 0.42]], [[0.62, 0.50, 0.44], [0.7, 0.58, 0.5]], [[0.44, 0.50, 0.40], [0.52, 0.58, 0.46]]],
  dendro: [[[0.88, 0.40, 0.58], [0.98, 0.72, 0.8]], [[0.62, 0.36, 0.78], [0.86, 0.66, 0.95]], [[0.95, 0.55, 0.30], [1.0, 0.8, 0.6]], [[0.9, 0.9, 0.8], [1.0, 0.98, 0.9]]],
  anemone: [[[0.76, 0.68, 0.46], [0.78, 0.18, 0.44]], [[0.64, 0.72, 0.46], [0.56, 0.50, 0.58]], [[0.80, 0.72, 0.52], [0.86, 0.36, 0.30]]],
  clam: [[[0.12, 0.42, 0.88], [0.62, 0.60, 0.54]], [[0.20, 0.72, 0.62], [0.62, 0.60, 0.54]], [[0.46, 0.28, 0.78], [0.62, 0.60, 0.54]], [[0.40, 0.62, 0.30], [0.62, 0.60, 0.54]]],
  eel: [[[0.86, 0.86, 0.80], [0.1, 0.1, 0.1]]],
};

export function coralMaterial(kind, lod = 0) {
  const K = KIND_ID[kind];
  return mat(
    `attribute float aTip; attribute vec3 aCol; attribute vec3 aCol2; attribute float aSeed;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vTip; varying vec3 vCol; varying vec3 vCol2; varying float vSeed;
     void main(){
       vec3 p = position;
       vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       #if LOD == 1
         if (distance(ip, uCamPos) < uLodR) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
       #elif LOD == 2
         if (distance(ip, uCamPos) >= uLodR) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
       #endif
       float t = uTime;
       #if KIND == 3
         p.z += sin(t * 0.8 + aSeed * 6.283 + ip.x * 0.1) * 0.07 * aTip * aTip;
       #elif KIND == 4
         p.x += sin(t * 0.7 + aSeed * 6.283) * 0.025 * aTip;
       #elif KIND == 5
         float ph = t * 1.4 + aSeed * 6.283 + position.x * 9.0 + position.z * 7.0;
         p.x += sin(ph) * 0.05 * aTip * aTip; p.z += cos(ph * 0.8) * 0.05 * aTip * aTip;
       #elif KIND == 7
         float k = smoothstep(3.5, 8.5, distance(ip, uCamPos)) * mix(1.0, 0.08, uNight);
         k *= 0.75 + 0.25 * clamp(length(uCurrent), 0.0, 1.0);
         p.y *= k;
         vec2 lean = -normalize(uCurrent + vec2(1e-4));
         p.x += sin(t * 1.2 + aSeed * 6.283) * 0.07 * p.y * p.y + lean.x * p.y * p.y * p.y * 0.3;
         p.z += lean.y * p.y * p.y * p.y * 0.3;
       #endif
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (isc * isc)));
       vL = position; vTip = aTip; vCol = aCol; vCol2 = aCol2; vSeed = aSeed;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vTip; varying vec3 vCol; varying vec3 vCol2; varying float vSeed;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp);
       if (dot(n, V) < 0.0) n = -n;
       float g = hash2(floor(vL.xz * 40.0 + vL.y * 30.0));
       vec3 alb;
       #if KIND == 0
         alb = mix(vCol, vCol2, smoothstep(0.55, 1.0, vTip)) * (0.88 + 0.22 * g);
       #elif KIND == 1
         float ang = atan(vL.z, vL.x);
         alb = mix(vCol, vCol2, smoothstep(0.8, 1.0, vTip)) * (0.95 + 0.05 * sin(ang * 90.0 + vTip * 24.0)) * (0.9 + 0.15 * g);
       #elif KIND == 2
         bool por = vSeed >= 1.0;
         // fine meandering valleys, like Platygyra
         vec2 bq = vL.xz * 34.0 + vec2(sin(vL.z * 11.0 + vSeed * 6.0), sin(vL.x * 13.0)) * 2.5 + vL.y * 9.0;
         float m = abs(sin(bq.x + sin(bq.y * 0.7) * 2.0) * sin(bq.y * 0.8 + sin(bq.x * 0.6) * 2.0));
         alb = por ? vCol * (0.9 + 0.2 * g) : mix(mix(vCol2, vCol, 0.45), vCol, smoothstep(0.05, 0.45, m)) * (0.92 + 0.12 * g);
         if (!por) n = bumpN(n, vWp, smoothstep(0.05, 0.6, m) * 0.012 * (1.0 - smoothstep(3.0, 12.0, distance(vWp, uCamPos))));
       #elif KIND == 3
         // lace: a net of fine branches plus radial ribs; solid silhouette far away to avoid shimmer
         {
           vec2 fp = vec2(vL.x, vL.y - 0.1);
           float rr0 = length(fp);
           float ang = atan(fp.x, fp.y);
           // a fine net whose meshes stretch along the radial branches, as in Annella
           float web = vor(vec2(ang * rr0 * 30.0, rr0 * 19.0) + vSeed * 10.0);
           float line = 1.0 - smoothstep(0.04, 0.12, web);
           float rib = 1.0 - smoothstep(0.0, 0.03, abs(fract(ang * 4.0 + sin(rr0 * 7.0 + vSeed * 5.0) * 0.25) - 0.5) * rr0 * 1.6);
           float m = max(max(line, rib), step(rr0, 0.16) + step(vL.y, 0.12));
           float solidK = smoothstep(8.0, 15.0, distance(vWp, uCamPos));
           if (m < 0.5 && solidK < 0.5) discard;
           alb = mix(vCol2, vCol, smoothstep(0.0, 0.3, vTip)) * (0.85 + 0.25 * g) * mix(1.0, 0.7, solidK * (1.0 - m));
         }
       #elif KIND == 4
         alb = mix(vCol2, vCol * (0.85 + 0.3 * hash2(floor(vL.xz * 70.0))), vTip);
         // soft tissue lets light through: glow when the sun is behind it
         alb += vCol * pow(max(dot(-V, SUN), 0.0), 2.0) * 0.35 * uSunI;
       #elif KIND == 5
         alb = mix(vCol2, vCol, smoothstep(0.05, 0.2, vTip)) * (0.85 + 0.35 * smoothstep(0.85, 1.0, vTip));
       #elif KIND == 6
         float spots = step(0.78, hash2(floor(vL.xz * 60.0)));
         alb = mix(vCol2 * (0.85 + 0.2 * g), vCol * (0.75 + 0.6 * spots), vTip);
       #else
         float sp = step(0.7, hash2(floor(vec2(atan(vL.z, vL.x) * 2.0, vL.y * 45.0))));
         alb = mix(vCol, vCol2, sp * 0.9);
       #endif
       // corallites: each polyp sits in a tiny cup, which catches light as a fine pitted relief
       #if KIND <= 2 || KIND == 4
       {
         // branching and massive corals: raised polyp nubs; tables: a fine granular crust; leather coral: soft polyp fuzz
         float fade = 1.0 - smoothstep(2.5, 13.0, distance(vWp, uCamPos));
         float sc = KIND == 0 ? 70.0 : (KIND == 1 ? 95.0 : (KIND == 4 ? 110.0 : (vSeed >= 1.0 ? 120.0 : 0.0)));
         if (sc > 0.0 && fade > 0.0) {
           vec3 wv = pow(abs(normalize(vN)), vec3(4.0)); wv /= (wv.x + wv.y + wv.z);
           vec3 q = vWp * sc + vec3(vn2(vWp.xz * 9.0), vn2(vWp.zy * 9.0), 0.0) * 1.5;
           float h;
           #if KIND == 1
             float e = vor(q.zy) * wv.x + vor(q.xz) * wv.y + vor(q.xy) * wv.z;
             h = 1.0 - smoothstep(0.02, 0.32, e);
             alb *= mix(1.0, mix(0.9, 1.03, h), fade);
           #else
             float f1 = cellF1(q.zy) * wv.x + cellF1(q.xz) * wv.y + cellF1(q.xy) * wv.z;
             h = 1.0 - smoothstep(0.0, 0.5, f1);
             alb *= mix(1.0, mix(0.8, 1.06, h), fade);
           #endif
           n = bumpN(n, vWp, h * (KIND == 4 ? 0.0012 : 0.0028) * fade);
         }
       }
       #endif
       #if KIND == 1
         alb *= mix(0.45, 1.0, smoothstep(-0.4, 0.3, normalize(vN).y));   // shaded underside of the table
       #endif
       // photographic micro-detail from the reef-rock scan: skeleton pores, polyps, grime
       #if KIND != 7
         vec3 w3 = pow(abs(n), vec3(4.0)); w3 /= (w3.x + w3.y + w3.z);
         vec3 dc = vec3(0.0), dn = vec3(0.0);
         float bump = (KIND == 3 || KIND == 5) ? 0.35 : 0.9;
         triSample(tRockC, tRockN, vWp + vSeed * 13.0, dFdx(vWp), dFdy(vWp), w3, 1.9, bump, dc, dn, 1.0);
         alb *= mix(1.0, dot(dc, vec3(0.333)) * 2.6, 0.55);
         n = normalize(n + dn * 0.8);
         alb *= mix(0.5, 1.0, smoothstep(0.0, 0.3, vL.y));          // shade where it meets the reef
       #endif
       gl_FragColor = vec4(shade(alb, vWp, n, 0.8), 1.0);
     }`,
    { defines: { KIND: K, LOD: lod }, uniforms: SURF_UNIFORMS, opts: { side: (kind === 'fan' || kind === 'anemone' || kind === 'eel') ? THREE.DoubleSide : THREE.FrontSide } });
}
export const CORAL_MAT = {};
export const CORAL_MAT_HI = {};
for (const k of Object.keys(KIND_ID)) {
  CORAL_MAT[k] = coralMaterial(k, CORAL_GEO_HI[k] ? 1 : 0);
  if (CORAL_GEO_HI[k]) CORAL_MAT_HI[k] = coralMaterial(k, 2);
}

/* ---------- fish ---------- */
export const SHAPES = {
  slender: { h: 0.34, w: 0.18, tail: 'fork', dorsal: 0.12, anal: 0.08 },
  clown: { h: 0.44, w: 0.22, tail: 'round', dorsal: 0.12, anal: 0.1 },
  oval: { h: 0.56, w: 0.16, tail: 'fork', dorsal: 0.08, anal: 0.07 },
  disc: { h: 0.74, w: 0.12, tail: 'trunc', dorsal: 0.08, anal: 0.06 },
  idol: { h: 0.8, w: 0.12, tail: 'fork', dorsal: 0.08, anal: 0.25, filament: 0.9 },
  wrasse: { h: 0.42, w: 0.26, tail: 'round', dorsal: 0.08, anal: 0.06, hump: 0.12 },
  parrot: { h: 0.42, w: 0.24, tail: 'trunc', dorsal: 0.07, anal: 0.05 },
  shark: { h: 0.22, w: 0.2, tail: 'shark', dorsal: 0.2, anal: 0.04, pect: 0.3, pointy: true, lofted: 'reef' },
  whitetip: { h: 0.2, w: 0.2, tail: 'shark', dorsal: 0.16, anal: 0.04, pect: 0.26, pointy: true, lofted: 'whitetip' },
  fusilier: { h: 0.3, w: 0.15, tail: 'fork', dorsal: 0.08, anal: 0.06 },
  jack: { h: 0.42, w: 0.15, tail: 'fork', dorsal: 0.12, anal: 0.1 },
  whale: { h: 0.24, w: 0.3, tail: 'shark', dorsal: 0.16, anal: 0.04, pect: 0.3, flathead: true },
  grouper: { h: 0.34, w: 0.26, tail: 'round', dorsal: 0.08, anal: 0.06 },
  barracuda: { h: 0.15, w: 0.12, tail: 'fork', dorsal: 0.07, anal: 0.05, pointy: true },
  angel: { h: 0.64, w: 0.12, tail: 'trunc', dorsal: 0.1, anal: 0.09 },
  trigger: { h: 0.52, w: 0.17, tail: 'trunc', dorsal: 0.13, anal: 0.12 },
  batfish: { h: 0.92, w: 0.1, tail: 'trunc', dorsal: 0.32, anal: 0.28 },
  tuna: { h: 0.28, w: 0.25, tail: 'fork', dorsal: 0.1, anal: 0.07, pect: 0.14 },
  mola: { h: 0.78, w: 0.15, tail: 'round', dorsal: 0.5, anal: 0.5, rear: true },
};
// Requiem sharks, lofted from real proportions (lengths as fractions of total length from the snout):
// a conical snout, the deepest body a third of the way back, a narrow caudal peduncle, and fins cut as
// outlines — tall falcate first dorsal, swept pectorals, and the heterocercal tail with its long upper
// lobe and subterminal notch. Same frame as fishGeometry (snout at +z, length 1.28).
const SHARK_STYLE = {
  // [s, half-height, half-width, centre y]
  reef: { body: [[0, 0, 0, -0.004], [0.025, 0.018, 0.022, -0.006], [0.07, 0.035, 0.04, -0.004], [0.13, 0.05, 0.052, 0], [0.22, 0.06, 0.058, 0.002], [0.32, 0.063, 0.056, 0.003], [0.45, 0.054, 0.045, 0.003], [0.55, 0.042, 0.033, 0.003], [0.64, 0.028, 0.021, 0.003], [0.7, 0.018, 0.013, 0.004], [0.745, 0.012, 0.009, 0.006], [0.76, 0.004, 0.004, 0.008]],
    d1: [[0.3, 0], [0.33, 0.035], [0.37, 0.068], [0.42, 0.088], [0.447, 0.09], [0.44, 0.06], [0.435, 0.03], [0.43, 0]], d2: 0.022, pect: 0.17 },
  // whitetip reef shark: slender, with a broad, blunt head and the first dorsal set well back
  whitetip: { body: [[0, 0, 0, -0.004], [0.02, 0.016, 0.03, -0.006], [0.06, 0.03, 0.05, -0.004], [0.13, 0.042, 0.055, 0], [0.22, 0.05, 0.052, 0.002], [0.34, 0.052, 0.048, 0.003], [0.46, 0.046, 0.04, 0.003], [0.56, 0.036, 0.029, 0.003], [0.65, 0.025, 0.019, 0.003], [0.71, 0.016, 0.012, 0.004], [0.745, 0.011, 0.008, 0.006], [0.76, 0.004, 0.004, 0.008]],
    d1: [[0.37, 0], [0.4, 0.03], [0.44, 0.058], [0.485, 0.074], [0.505, 0.075], [0.498, 0.05], [0.492, 0.025], [0.487, 0]], d2: 0.03, pect: 0.14 },
};
export function sharkGeometry(style: 'reef' | 'whitetip') {
  const S = SHARK_STYLE[style], K = S.body, L = 1.28, Z = (s: number) => 0.47 - L * s;
  // Catmull-Rom through the body keys
  const at = (s: number) => {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < s) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const t = (s - p1[0]) / Math.max(p2[0] - p1[0], 1e-6), t2 = t * t, t3 = t2 * t;
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    return [Math.max(0, cr(p0[1], p1[1], p2[1], p3[1])), Math.max(0, cr(p0[2], p1[2], p2[2], p3[2])), cr(p0[3], p1[3], p2[3], p3[3])];
  };
  const RINGS = 40, RAD = 18, pos: number[] = [], idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const s = 0.76 * Math.pow(r / RINGS, 1.15);
    const [h, w, yc] = at(s);
    for (let k = 0; k < RAD; k++) {
      const a = (k / RAD) * Math.PI * 2, sa = Math.sin(a);
      // flatter belly, a slightly squared-off back
      pos.push(Math.cos(a) * w * L, (yc + h * sa * (sa < 0 ? 0.82 : 1)) * L, Z(s));
    }
  }
  for (let r = 0; r < RINGS; r++) for (let k = 0; k < RAD; k++) {
    const a = r * RAD + k, b = r * RAD + (k + 1) % RAD, c = a + RAD, d = b + RAD;
    idx.push(a, c, b, b, c, d);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx); body.computeVertexNormals();
  const b = body.toNonIndexed();
  const P = Array.from(b.attributes.position.array), N = Array.from(b.attributes.normal.array), F = new Array(b.attributes.position.count).fill(0);
  const top = (s: number) => { const [h, , yc] = at(s); return (yc + h * 0.96) * L; };
  const bot = (s: number) => { const [h, , yc] = at(s); return (yc - h * 0.8) * L; };
  // a fin from its outline: triangulated in its own 2D frame (a, b), then placed by map
  const fin = (outline: number[][], map: (a: number, b: number) => number[], id: number, n: number[]) => {
    const pts = outline.map(([a, b]) => new THREE.Vector2(a, b));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) for (const i of t) { const v = map(pts[i].x, pts[i].y); P.push(v[0], v[1], v[2]); N.push(...n); F.push(id); }
  };
  const X = [1, 0, 0];
  // vertical fins: (s, height above the back / below the belly)
  fin(S.d1, (s, dy) => [0, top(s) + dy * L - 0.004, Z(s)], 2, X);                                  // first dorsal
  const d2 = S.d2;
  fin([[0.64, 0], [0.665, d2], [0.685, d2 * 0.9], [0.69, 0]], (s, dy) => [0, top(s) + dy * L - 0.003, Z(s)], 2, X);   // second dorsal
  fin([[0.63, 0], [0.66, -0.02], [0.678, -0.018], [0.683, 0]], (s, dy) => [0, bot(s) + dy * L + 0.003, Z(s)], 2, X);  // anal
  // heterocercal tail: long upper lobe with a notch below its tip, short lower lobe
  fin([[0.735, 0.012], [0.8, 0.055], [0.88, 0.1], [0.95, 0.13], [0.985, 0.14], [0.972, 0.118], [0.945, 0.1], [0.91, 0.062], [0.875, 0.022], [0.86, 0.004],
    [0.878, -0.035], [0.9, -0.07], [0.862, -0.055], [0.8, -0.03], [0.745, -0.008]], (s, y) => [0, y * L, Z(s)], 1, X);
  for (const sx of [-1, 1]) {
    // pectorals: (s, span out from the body), swept back and angled a little down, falcate
    const [h, w, yc] = at(0.2), ry = (yc - h * 0.45) * L, rx = w * 0.85 * L, sp = S.pect;
    fin([[0.18, 0], [0.24, sp * 0.42], [0.31, sp * 0.82], [0.36, sp], [0.335, sp * 0.72], [0.29, sp * 0.32], [0.265, 0]],
      (s, d) => [sx * (rx + d * L), ry - d * L * 0.34, Z(s)], 3, [0, 1, 0]);
    // pelvics
    const [h2, w2, yc2] = at(0.52), py = (yc2 - h2 * 0.7) * L;
    fin([[0.5, 0], [0.56, 0.035], [0.575, 0.03], [0.565, 0]], (s, d) => [sx * (w2 * 0.6 * L + d * L), py - d * L * 0.6, Z(s)], 2, [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(F, 1));
  return g;
}

export function fishGeometry(sh) {
  if (sh.lofted) return sharkGeometry(sh.lofted);
  const body = new THREE.SphereGeometry(0.5, 16, 12);
  body.rotateX(Math.PI / 2);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    let s = sh.pointy ? (z < 0 ? 1 + z * 1.3 : 1 - z * z * 1.6) : (z < 0 ? 1 + z * 1.15 : 1 - z * z * 0.7);
    x *= sh.w * s; y *= sh.h * s;
    if (sh.hump && z > 0.1 && y > 0) y += sh.hump * Math.exp(-(((z - 0.32) / 0.12) ** 2)) * (y / (sh.h * 0.5 + 1e-3));
    if (sh.flathead && z > 0) { y *= 1 - 0.4 * z; x *= 1 + 0.25 * z; }
    p.setXYZ(i, x, y, z);
  }
  body.computeVertexNormals();
  const b = body.toNonIndexed();
  const pos = Array.from(b.attributes.position.array), nrm = Array.from(b.attributes.normal.array), fin = new Array(b.attributes.position.count).fill(0);
  const tri = (a, c, d, id, n = [1, 0, 0]) => { for (const v of [a, c, d]) { pos.push(...v); nrm.push(...n); fin.push(id); } };
  const H = sh.h * 0.5;
  if (sh.tail === 'fork') { tri([0, 0, -0.42], [0, H * 1.25, -0.8], [0, 0, -0.62], 1); tri([0, 0, -0.42], [0, 0, -0.62], [0, -H * 1.25, -0.8], 1); }
  else if (sh.tail === 'round') { for (let k = 0; k < 5; k++) { const a0 = -0.9 + k * 0.36, a1 = a0 + 0.36; tri([0, 0, -0.42], [0, Math.sin(a0) * 0.26, -0.42 - Math.cos(a0) * 0.3], [0, Math.sin(a1) * 0.26, -0.42 - Math.cos(a1) * 0.3], 1); } }
  else if (sh.tail === 'trunc') { tri([0, H * 0.3, -0.42], [0, H * 1.0, -0.72], [0, -H * 1.0, -0.72], 1); tri([0, H * 0.3, -0.42], [0, -H * 1.0, -0.72], [0, -H * 0.3, -0.42], 1); }
  else { tri([0, 0, -0.44], [0, H * 3.2, -0.9], [0, 0, -0.62], 1); tri([0, 0, -0.44], [0, 0, -0.6], [0, -H * 1.8, -0.72], 1); }
  if (sh.filament) { tri([0, H * 0.9, 0.12], [0, H + sh.filament, -0.42], [0, H * 0.9, -0.04], 2); tri([0, H * 0.9, 0.12], [0, H * 0.9, -0.3], [0, H + 0.2, -0.2], 2); }
  else if (sh.rear) {
    // ocean sunfish: a tall dorsal and anal fin far back, which it sculls side to side instead of a tail
    tri([0, H * 0.7, -0.14], [0, H + sh.dorsal, -0.36], [0, H * 0.45, -0.42], 2);
    tri([0, -H * 0.7, -0.14], [0, -H - sh.anal, -0.36], [0, -H * 0.45, -0.42], 2);
  }
  else { tri([0, H * 0.85, 0.16], [0, H + sh.dorsal, -0.12], [0, H * 0.7, -0.3], 2); }
  if (!sh.rear) tri([0, -H * 0.8, -0.05], [0, -H - sh.anal, -0.22], [0, -H * 0.6, -0.32], 2);
  if (sh.pect) for (const sx of [-1, 1]) tri([sx * sh.w * 0.4, -H * 0.4, 0.18], [sx * (sh.w * 0.4 + sh.pect), -H * 0.9, -0.12], [sx * sh.w * 0.4, -H * 0.5, -0.02], 3, [0, 1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 1));
  return g;
}
export function fishMaterial(sp) {
  const c = (a) => new THREE.Color(a[0], a[1], a[2]);
  return mat(
    `attribute vec3 aSwim; attribute float aFin; uniform float uWig;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vFin; varying float vTint;
     void main(){
       vec3 p = position;
       float back = clamp((0.25 - p.z) / 1.0, 0.0, 1.0);
       p.x += (sin(uTime * aSwim.y - p.z * 4.5 + aSwim.x) * 0.17 * back * back + sin(uTime * aSwim.y + aSwim.x) * 0.02) * uWig;
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       vL = position; vFin = aFin; vTint = aSwim.z;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uBands; uniform float uEdge; uniform float uEye;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vFin; varying float vTint;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp);
       if (dot(n, V) < 0.0) n = -n;
       float z = vL.z, y = vL.y;
       float top = smoothstep(-0.08, 0.12, y);
       vec3 alb;
       #if PAT == 0
         alb = mix(uC2, uC1, top);
       #elif PAT == 1
         alb = uC1;
         float dmin = abs(z - 0.25 - y * 0.2);
         if (uBands > 1.5) dmin = min(dmin, min(abs(z + 0.02 - y * 0.1), abs(z + 0.36)));
         alb = mix(alb, uC3, (1.0 - smoothstep(0.075, 0.09, dmin)) * uEdge);
         alb = mix(alb, uC2, 1.0 - smoothstep(0.04, 0.055, dmin));
         if (vFin > 0.5) alb = mix(uC1, uC3, uEdge * smoothstep(0.18, 0.3, length(vec2(y, z + 0.42))));
       #elif PAT == 2
         alb = uC1;
         float inBody = step(-0.44, z) * step(z, 0.3);
         alb = mix(alb, uC3, (1.0 - smoothstep(0.045, 0.065, abs(y - (0.03 + 0.12 * z)))) * inBody);
         alb = mix(alb, uC3, (1.0 - smoothstep(0.04, 0.06, abs(y - 0.17 - 0.12 * z))) * step(z, 0.05) * step(-0.44, z));
         if (vFin > 0.5 && vFin < 1.5) alb = uC2;
       #elif PAT == 3
         alb = mix(uC2, uC1, smoothstep(-0.12, 0.05, z));
         alb = mix(alb, uC3, max(1.0 - smoothstep(0.07, 0.09, abs(z - 0.2)), 1.0 - smoothstep(0.09, 0.11, abs(z + 0.2))));
         if (vFin > 0.5 && vFin < 1.5) alb = uC3;
         if (vFin > 1.5) alb = mix(uC1, uC2, 0.4);
         if (z > 0.43) alb = vec3(0.92, 0.55, 0.2);
       #elif PAT == 4
         alb = uC1 * (0.9 + 0.1 * sin((z + abs(y) * 0.8) * 60.0));
         alb = mix(alb, uC2, smoothstep(-0.05, -0.28, z + y * 0.5));
         alb = mix(alb, uC3, 1.0 - smoothstep(0.03, 0.045, abs(z - 0.33)));
         if (vFin > 0.5) alb = uC2;
       #elif PAT == 5
         alb = uC1;
         float s = abs(fract((y + 0.3) * uBands) - 0.5);
         alb = mix(alb, uC2, (1.0 - smoothstep(0.08, 0.15, s)) * step(-0.1, y) * step(y, 0.17) * step(z, 0.42));
         alb = mix(alb * 1.08 + 0.06, alb, top);
         if (vFin > 0.5) alb = uC1;
       #elif PAT == 6
         alb = mix(uC1, uC2, smoothstep(0.02, 0.22, y));
         float bar = abs(fract(z * (uBands == 3.0 ? 4.2 : uBands) + 0.1) - 0.5);   // bar count per species (3 = the default four)
         alb = mix(alb, uC3, (1.0 - smoothstep(0.1, 0.15, bar)) * step(-0.45, z) * step(z, 0.35) * smoothstep(-0.14, 0.0, y));
       #elif PAT == 7
         alb = uC1 * (0.9 + 0.12 * sin(z * 80.0) * sin(y * 80.0));
         alb = mix(alb, uC2, step(0.8, sin(z * 70.0 + sin(y * 40.0) * 1.5)) * step(0.1, z));
       #elif PAT == 8 || PAT == 14
         alb = mix(uC2, uC1, smoothstep(-0.03, 0.03, y));
         #if PAT == 8
         // the pale flank band that runs back to the pelvic fins
         alb = mix(alb, uC2, (1.0 - smoothstep(0.004, 0.014, abs(y - 0.004 + (z + 0.1) * 0.05))) * smoothstep(-0.36, -0.2, z) * smoothstep(0.12, -0.02, z) * step(vFin, 0.5) * 0.8);
         if (vFin > 0.5) alb = mix(uC1, uC3, smoothstep(0.14, 0.18, max(length(vL.xy), -z - 0.58)));
         #else
         // whitetip: bright tips on the first dorsal and the upper tail lobe; scattered dark spots
         vec2 sg = vec2(z * 38.0, y * 38.0 + z * 9.0), sf = fract(sg) - 0.5;
         alb *= 1.0 - 0.28 * step(0.82, hash2(floor(sg))) * (1.0 - smoothstep(0.16, 0.3, length(sf))) * step(vFin, 0.5) * step(-0.01, y);
         if (vFin > 0.5) alb = uC1 * 0.95;
         if (vFin > 0.5 && vFin < 2.5) alb = mix(alb, uC3, smoothstep(0.115, 0.135, y) * step(-0.7, z) + smoothstep(0.1, 0.13, y) * step(z, -0.7));
         #endif
         // the underslung crescent mouth and the nostrils beneath the snout
         if (vFin < 0.5 && y < -0.01) {
           float mz = 0.39 - 9.0 * vL.x * vL.x;
           alb *= 1.0 - 0.7 * (1.0 - smoothstep(0.002, 0.005, abs(z - mz))) * step(abs(vL.x), 0.05);
           alb *= 1.0 - 0.6 * (1.0 - smoothstep(0.004, 0.007, length(vec2(abs(vL.x) - 0.022, z - 0.44))));
         }
         // five gill slits behind the eye
         float gi = (z - 0.21) / 0.019;
         alb *= 1.0 - 0.45 * smoothstep(0.36, 0.46, abs(fract(gi) - 0.5)) * step(0.0, gi) * step(gi, 5.0) * step(abs(y + 0.005), 0.035) * step(0.02, abs(vL.x)) * step(vFin, 0.5);
       #elif PAT == 9
         alb = mix(uC2, uC1, top);
         vec2 g = vec2(z * 26.0, y * 26.0 + sin(z * 20.0) * 0.3); vec2 gf = fract(g) - 0.5;
         float spot = (1.0 - smoothstep(0.14, 0.24, length(gf))) * step(0.25, hash2(floor(g)));
         float line = 1.0 - smoothstep(0.02, 0.06, abs(fract(z * 9.0) - 0.5));
         alb = mix(alb, vec3(0.88, 0.9, 0.88), max(spot, line * 0.5 * step(0.0, z)) * top);
       #elif PAT == 11
         alb = mix(uC2, uC1, top) * (1.0 - 0.5 * step(0.9, hash2(floor(vec2(z * 40.0, y * 40.0)))) * top);
         if (vFin > 0.5) alb = uC3;
       #elif PAT == 13
         alb = mix(uC1, uC3, smoothstep(-0.03, -0.13, y));
         alb = mix(alb, uC2, smoothstep(-0.015, 0.025, y - (0.12 + z * 0.55)));
         if (vFin > 0.5 && vFin < 1.5) alb = uC2;
         if (vFin > 1.5) alb = mix(uC2, uC1, 0.35);
       #elif PAT == 12
         vec2 sq = fract(vec2(z * 26.0, y * 26.0 + z * 13.0));
         alb = mix(uC2, uC1, smoothstep(-0.12, 0.05, y)) * (0.8 + 0.25 * smoothstep(0.3, 0.5, max(abs(sq.x - 0.5), abs(sq.y - 0.5))));
         if (vFin > 0.5) alb = mix(uC1, vec3(0.98), step(0.9, fract(length(vL.yz) * 6.0)) * 0.7);
       #elif PAT == 15
         // spots (coral trout: blue spots on red)
         alb = mix(uC2, uC1, smoothstep(-0.12, 0.05, y));
         vec2 sg = vec2(z * 34.0, y * 34.0 + z * 7.0), sf = fract(sg) - 0.5;
         alb = mix(alb, uC3, (1.0 - smoothstep(0.1, 0.2, length(sf))) * step(0.35, hash2(floor(sg))));
         if (vFin > 0.5) alb = mix(uC1, uC3, (1.0 - smoothstep(0.1, 0.2, length(sf))) * 0.6);
       #elif PAT == 16
         // emperor angelfish: gently curving yellow lines on blue, a dark mask through the eye, yellow tail
         alb = uC1;
         float ln = abs(fract((y * 1.1 - z * 0.5 + 0.05 * sin(z * 9.0)) * uBands) - 0.5);
         alb = mix(alb, uC2, (1.0 - smoothstep(0.12, 0.2, ln)) * step(z, 0.26));
         alb = mix(alb, uC3, (1.0 - smoothstep(0.02, 0.04, abs(z - 0.33))) * step(-0.02, y));
         alb = mix(alb, uC3, smoothstep(0.2, 0.24, z) * (1.0 - smoothstep(0.26, 0.3, z)) * 0.9);
         if (z > 0.38) alb = mix(uC1, vec3(0.95, 0.95, 0.9), 0.5);
         if (vFin > 0.5 && vFin < 1.5) alb = uC2;
       #elif PAT == 17
         // barracuda: silver, with dark chevrons down the back and scattered black spots near the tail
         alb = mix(uC2, uC1, smoothstep(-0.05, 0.08, y));
         float ch = abs(fract(z * 9.0 + abs(y) * 4.0) - 0.5);
         alb = mix(alb, uC3, (1.0 - smoothstep(0.12, 0.22, ch)) * smoothstep(0.0, 0.05, y) * step(z, 0.3) * 0.7);
         vec2 bs = vec2(z * 24.0, y * 24.0); alb = mix(alb, uC3, step(0.9, hash2(floor(bs))) * (1.0 - smoothstep(0.15, 0.3, length(fract(bs) - 0.5))) * step(z, -0.1));
         if (vFin > 0.5) alb = mix(uC1, uC3, 0.5);
       #elif PAT == 18
         // many dark lines along a pale body, bright fins spotted dark (sweetlips)
         alb = uC1;
         alb = mix(alb, uC2, 1.0 - smoothstep(0.14, 0.24, abs(fract((y + z * 0.06) * uBands) - 0.5)));
         if (vFin > 0.5) { vec2 fs = vec2(z * 30.0, y * 30.0); alb = mix(uC3, uC2, step(0.7, hash2(floor(fs))) * (1.0 - smoothstep(0.2, 0.35, length(fract(fs) - 0.5)))); }
       #else
         alb = uC1; vec2 sc = fract(vec2(z * 30.0, y * 30.0 + z * 15.0));
         alb = mix(alb, uC2, smoothstep(0.35, 0.5, max(abs(sc.x - 0.5), abs(sc.y - 0.5))) * 0.6);
         if (vFin > 0.5) alb = mix(uC1, uC2, 0.5);
       #endif
       alb *= vTint;
       #if PAT != 9
       float eye = (1.0 - smoothstep(0.022 * uEye, 0.034 * uEye, length(vec2(y - 0.035, z - 0.34)))) * step(0.02, abs(vL.x)) * step(vFin, 0.5);
       alb = mix(alb, vec3(0.02), eye);
       #endif
       float spec = pow(max(dot(reflect(-SUN, n), V), 0.0), 24.0) * 0.6 * uSunI;
       float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.3 * uAmb;
       vec3 col = absorb(alb * (lightAt(n, caveLight(vWp)) + uTint * uAmb * 0.1) * 1.3 + (spec + fres * vec3(0.7, 0.9, 1.0)) * uTint, vWp.y);
       col += absorb(vec3(0.9, 1.0, 0.9), vWp.y) * caus2(vWp) * max(n.y, 0.0) * 0.4 * alb;
       col += lamp(alb, vWp, n) * 1.2;
       gl_FragColor = vec4(fogIt(col, vWp), 1.0);
     }`,
    { defines: { PAT: sp.pat }, uniforms: { uC1: { value: c(sp.c1) }, uC2: { value: c(sp.c2 || sp.c1) }, uC3: { value: c(sp.c3 || [0, 0, 0]) }, uBands: { value: sp.bands || 3 }, uEdge: { value: sp.edge ?? 1 }, uWig: { value: sp.wig ?? 1 }, uEye: { value: sp.eye ?? 1 } },
      opts: { side: THREE.DoubleSide } });
}

/* ---------- turtles ---------- */
export const TURTLE_STYLE = {
  green: { c1: [0.3, 0.26, 0.16], c2: [0.24, 0.22, 0.16], ray: [0.5, 0.44, 0.24], dark: [0.1, 0.085, 0.06], skin: [0.26, 0.22, 0.16], hawk: 0 },
  hawksbill: { c1: [0.4, 0.25, 0.1], c2: [0.26, 0.2, 0.13], ray: [0.62, 0.45, 0.2], dark: [0.09, 0.055, 0.03], skin: [0.22, 0.17, 0.11], hawk: 1 },
};
// Sea turtles, built from their anatomy: a heart-shaped, domed carapace (flatter plastron below), a
// thick neck and a blunt head (a narrow, hooked beak for the hawksbill), long wing-like fore flippers
// with a claw on the leading edge, and short rounded hind flippers. Carapace length 1, head at +z.
// aPart: 0 carapace, 1 skin, 2 plastron; aCar = carapace coordinates (x across -1..1, z along -1..1).
function turtleGeos(hawk: boolean) {
  const P: number[] = [], N: number[] = [], A: number[] = [], C: number[] = [];
  const add = (g: THREE.BufferGeometry, part: number, car?: (x: number, y: number, z: number) => [number, number]) => {
    const q = g.index ? g.toNonIndexed() : g; q.computeVertexNormals();
    const pp = q.attributes.position, nn = q.attributes.normal;
    for (let i = 0; i < pp.count; i++) {
      P.push(pp.getX(i), pp.getY(i), pp.getZ(i)); N.push(nn.getX(i), nn.getY(i), nn.getZ(i)); A.push(part);
      const c = car ? car(pp.getX(i), pp.getY(i), pp.getZ(i)) : [0, 0]; C.push(c[0], c[1]);
    }
  };
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[]) => {
    const pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...f(i / nu, j / nv));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  };
  // carapace outline: half-width along z (zn = -1 tail .. 1 head), widest a little ahead of centre
  const W = hawk ? 0.39 : 0.41;
  const half = (zn: number) => W * Math.pow(Math.max(0, 1 - zn * zn), 0.55) * (1 + 0.1 * zn) * (0.78 + 0.22 * smooth(-1, -0.2, zn));
  const Z = (zn: number) => zn * (zn > 0 ? 0.47 : 0.53);
  const dome = (xn: number, zn: number) => 0.2 * Math.pow(Math.max(0, 1 - xn * xn), 0.6) * Math.pow(Math.max(0, 1 - zn * zn), 0.4) * (1 + 0.12 * zn)
    + (hawk ? 0.012 * Math.max(0, 1 - Math.abs(xn) * 5) : 0);                          // hawksbill: a slight ridge
  const top = grid(40, 48, (u, v) => { const xn = u * 2 - 1, zn = -0.995 + v * 1.99; let y = dome(xn, zn);
    // marginal scutes flare out a little, and the hawksbill's rear margin is serrated
    const rim = smooth(0.82, 1.0, Math.abs(xn)); y = y * (1 - rim * 0.6) + rim * 0.015;
    let hw = half(zn); if (hawk && zn < -0.2) hw *= 1 - 0.04 * Math.max(0, Math.sin(zn * 40)) * rim;
    return [xn * hw, y, Z(zn)]; });
  add(top, 0, (x, y, z) => { const zn = z > 0 ? z / 0.47 : z / 0.53; return [x / Math.max(half(zn), 1e-3), zn]; });
  const bot = grid(40, 40, (u, v) => { const xn = u * 2 - 1, zn = -0.995 + v * 1.99;
    return [xn * half(zn), 0.012 - 0.05 * Math.pow(Math.max(0, 1 - xn * xn), 0.8) * Math.pow(Math.max(0, 1 - zn * zn), 0.6), Z(zn)]; });
  bot.index!.array.reverse?.call(bot.index!.array);
  add(bot, 2, (x, y, z) => { const zn = z > 0 ? z / 0.47 : z / 0.53; return [x / Math.max(half(zn), 1e-3), zn]; });
  // neck and head
  // a thick, fleshy neck that runs from under the shell's front edge into the back of the skull
  const neck = new THREE.SphereGeometry(0.5, 18, 12), np = neck.attributes.position;
  for (let i = 0; i < np.count; i++) { const x = np.getX(i), y = np.getY(i), z = np.getZ(i); np.setXYZ(i, x * 0.17 * (1 - 0.25 * (z + 0.5)), y * 0.12, z * 0.26); }
  neck.translate(0, -0.012, 0.5);
  add(neck, 1);
  const head = new THREE.SphereGeometry(0.5, 24, 16), hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const f = z + 0.5;                                                  // 0 back of the skull .. 1 tip of the beak
    x *= 0.16 * (1 - 0.4 * Math.pow(f, 2.2) * (hawk ? 1.4 : 1));
    y *= 0.115 * (y > 0 ? 1 - 0.35 * f : 1 - 0.1 * f);
    if (y > 0) y *= 0.9;
    z *= hawk ? 0.28 : 0.24;
    if (hawk && f > 0.75 && y < 0.01) y -= 0.02 * (f - 0.75) / 0.25;    // the hooked beak
    hp.setXYZ(i, x, y, z);
  }
  head.translate(0, 0.014, 0.67);
  add(head, 1);
  const tail = new THREE.ConeGeometry(0.04, 0.12, 8); tail.rotateX(-Math.PI / 2); tail.translate(0, -0.005, -0.56);
  add(tail, 1);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); body.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  body.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); body.setAttribute('aCar', new THREE.Float32BufferAttribute(C, 2));
  // flippers: lofted along their span from the shoulder (+x), a rounded airfoil section
  const flipper = (span: number, chord0: number, chord1: number, sweep: number, thick: number) => {
    const g = grid(18, 10, (u, v) => {
      const s = u, a = v * Math.PI * 2;
      const ch = chord0 * Math.pow(1 - s, 0.55) + chord1 * s;
      const cx = span * s, cz = -sweep * Math.pow(s, 1.4), cy = -0.03 * s;
      const th = thick * (1 - 0.75 * s);
      const lead = Math.cos(a) > 0 ? 0.42 : 0.58;                       // thicker toward the leading edge
      return [cx, cy + Math.sin(a) * th * (Math.cos(a) > 0 ? 1.1 : 0.8), cz + Math.cos(a) * ch * lead];
    });
    const pp: number[] = [], nn: number[] = [], aa: number[] = [], cc: number[] = [];
    const q = g.toNonIndexed(); q.computeVertexNormals();
    for (let i = 0; i < q.attributes.position.count; i++) { pp.push(q.attributes.position.getX(i), q.attributes.position.getY(i), q.attributes.position.getZ(i)); nn.push(q.attributes.normal.getX(i), q.attributes.normal.getY(i), q.attributes.normal.getZ(i)); aa.push(1); cc.push(q.attributes.position.getX(i) / span, 0); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    out.setAttribute('aPart', new THREE.Float32BufferAttribute(aa, 1)); out.setAttribute('aCar', new THREE.Float32BufferAttribute(cc, 2));
    return out;
  };
  return { body, front: flipper(0.56, 0.15, 0.03, 0.26, 0.024), rear: flipper(0.2, 0.13, 0.06, 0.06, 0.018) };
}
const TURTLE_GEOS = { green: turtleGeos(false), hawksbill: turtleGeos(true) };
export function turtleMaterial(style) {
  const s = TURTLE_STYLE[style], c = (a: number[]) => new THREE.Color(a[0], a[1], a[2]);
  return mat(
    `attribute float aPart; attribute vec2 aCar; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec2 vCar;
     void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vL = position; vPart = aPart; vCar = aCar; gl_Position = projectionMatrix * viewMatrix * w; }`,
    SURFACE + `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uRay; uniform vec3 uDark; uniform vec3 uSkin; uniform float uHawk; uniform float uSeed;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec2 vCar;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       vec3 alb;
       if (vPart < 0.5) {
         // scutes: five vertebral down the middle, four costal a side, a ring of marginals
         float x = vCar.x, ax = abs(x), z = vCar.y;
         vec2 cen; float seam;
         if (ax > 0.86 || abs(z) > 0.93) {
           float a = atan(z, x) / 3.14159 * 11.0; float fa = fract(a);
           seam = min(min(fa, 1.0 - fa) * 0.18, abs(ax - 0.86) + 1.0);
           seam = min(seam, (ax > 0.86 ? ax - 0.86 : abs(abs(z) - 0.93)));
           cen = vec2(x, z) * 0.93;
         } else if (ax < 0.27 + 0.05 * sin(z * 9.0)) {
           float zz = z + 0.12 * x * x;
           float k = clamp(floor((0.92 - zz) / 0.36), 0.0, 4.0), b0 = 0.92 - k * 0.36;
           seam = min(min(abs(zz - b0), abs(zz - (b0 - 0.36))), abs(ax - 0.27 - 0.05 * sin(z * 9.0)));
           cen = vec2(0.0, b0 - 0.18);
         } else {
           float zz = z + 0.22 * (ax - 0.27);
           float k = clamp(floor((0.75 - zz) / 0.4), 0.0, 3.0), b0 = 0.75 - k * 0.4;
           seam = min(min(abs(zz - b0), abs(zz - (b0 - 0.4))), min(abs(ax - 0.27), abs(ax - 0.86)));
           cen = vec2(sign(x) * 0.56, b0 - 0.2);
         }
         float fw = fwidth(z) * 1.5 + 0.004;
         vec2 d = vec2(x, z) - cen; float ang = atan(d.y, d.x), rr = length(d);
         // each scute: rays fanning from its growth centre (dark flames on amber for the hawksbill)
         float rays = 0.5 + 0.5 * sin(ang * (7.0 + 3.0 * uHawk) + vn2(vec2(ang * 2.0, rr * 6.0) + cen * 13.0 + uSeed) * 5.0);
         alb = mix(uC1, uRay, smoothstep(0.45, 0.95, rays) * smoothstep(0.02, 0.25, rr) * (0.2 + 0.5 * uHawk));
         alb *= 0.8 + 0.4 * vn2(vec2(x, z) * 3.0 + uSeed);                                    // broad mottling across the shell
         alb = mix(alb, uDark, smoothstep(0.55, 0.85, vn2(vec2(ang * 1.5, rr * 5.0) - cen * 7.0 + uSeed)) * (0.35 + 0.45 * uHawk));
         alb *= 0.85 + 0.25 * vn2(vL.xz * 60.0);
         alb = mix(uDark * 0.8, alb, smoothstep(0.0, fw, seam - 0.006));              // the seams between scutes
         // a little algae and the odd barnacle
         alb = mix(alb, vec3(0.22, 0.27, 0.13), smoothstep(0.66, 0.85, vn2(vL.xz * 9.0 + uSeed)) * 0.35 * (1.0 - uHawk * 0.5));
         float bc = cellF1(vL.xz * 38.0 + uSeed);
         alb = mix(alb, vec3(0.82, 0.8, 0.72), (1.0 - smoothstep(0.1, 0.2, bc)) * step(0.975, hash2(floor(vL.xz * 38.0 + uSeed))));
       } else if (vPart < 1.5) {
         // skin: dark polygonal scales with pale edges; larger plates on the head and flipper tops
         // big plates on the head and the tops of the flippers, fine wrinkled skin on the neck
         float plates = max(step(0.56, vL.z), step(0.12, vCar.x) * step(0.0, n.y));
         float sc = vor(vec2(vL.x, vL.z) * mix(80.0, 26.0, plates) + vL.y * 14.0);
         vec3 skin = uSkin * (0.8 + 0.35 * hash2(floor(vL.xz * mix(80.0, 26.0, plates))));
         alb = mix(mix(skin * 1.4, vec3(0.62, 0.57, 0.44), 0.35), skin, smoothstep(0.012, mix(0.07, 0.04, plates), sc));
         // pale underside of neck and flippers
         alb = mix(alb, vec3(0.8, 0.74, 0.58), smoothstep(0.2, -0.6, n.y) * 0.6);
         // eye, and the beak
         vec2 e = vec2(abs(vL.x) - 0.062, vL.z - 0.71); float eye = 1.0 - smoothstep(0.011, 0.016, length(vec2(e.x * 0.8, (vL.y - 0.028) * 1.1 + e.y * 0.2)) + abs(e.y) * 0.6);
         alb = mix(alb, vec3(0.02), eye * step(0.6, vL.z));
         alb = mix(alb, vec3(0.3, 0.26, 0.2), smoothstep(0.76, 0.84, vL.z) * (1.0 - smoothstep(0.02, 0.03, abs(vL.y - 0.0))) * 0.8);
         // the claw on each fore flipper's leading edge
         alb = mix(alb, vec3(0.1, 0.08, 0.06), (1.0 - smoothstep(0.012, 0.02, length(vec2(vCar.x - 0.35, 0.0)) + abs(vL.z + 0.04) * 0.5)) * step(0.01, vCar.x));
       } else {
         // plastron: creamy yellow with faint seams; the underside of the marginal scutes around it
         float sm = min(abs(fract(vCar.y * 2.3 + 0.2) - 0.5), abs(abs(vCar.x) - 0.3));
         alb = mix(vec3(0.62, 0.56, 0.4), vec3(0.8, 0.74, 0.55), smoothstep(0.0, 0.04, sm));
         alb = mix(alb, mix(uC1, vec3(0.7, 0.64, 0.46), 0.5), smoothstep(0.72, 0.8, abs(vCar.x)));
       }
       gl_FragColor = vec4(shade(alb, vWp, n, 0.6), 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS, uC1: { value: c(s.c1) }, uC2: { value: c(s.c2) }, uRay: { value: c(s.ray) }, uDark: { value: c(s.dark) }, uSkin: { value: c(s.skin) }, uHawk: { value: s.hawk }, uSeed: { value: Math.random() * 40 } }, opts: { side: THREE.DoubleSide } });
}
export function makeTurtle(style) {
  const m = turtleMaterial(style), g = new THREE.Group(), G = TURTLE_GEOS[style];
  g.add(new THREE.Mesh(G.body, m));
  const mk = (geo, x, y, z, mirror) => { const f = new THREE.Mesh(geo, m); f.position.set(x, y, z); if (mirror) f.scale.x = -1; g.add(f); return f; };
  const fr = mk(G.front, 0.24, -0.01, 0.27, false), fl = mk(G.front, -0.24, -0.01, 0.27, true);
  const br = mk(G.rear, 0.2, -0.01, -0.36, false), bl = mk(G.rear, -0.2, -0.01, -0.36, true);
  g.traverse((o) => { o.frustumCulled = false; });
  return { group: g, fr, fl, br, bl, pos: new THREE.Vector3(), vel: new THREE.Vector3(), head: 0, t: Math.random() * 100, alt: 2, size: 1, ascend: 0 };
}

/* ---------- manta ---------- */
// Reef manta (Mobula alfredi). The disc is one surface with a top and a bottom sheet over (u = span
// -1..1 tip to tip, v = 0 leading edge .. 1 trailing edge): a raised body in the middle, pectoral
// "wings" with swept, pointed tips and a concave trailing edge, small pelvic lobes, and a whip tail.
// The cephalic fins at the front of the head are rolled into horns while cruising and unroll into a
// funnel when feeding (uFeed), when the wide mouth also opens. Head at +z; attributes: aSide (+1 top,
// -1 bottom), aU, aV, aPart (0 disc, 1 tail, 2 cephalic fin), aCeph (along, across, side).
export const MANTA_GEO = (() => {
  const SN = 56, CN = 18, pos: number[] = [], side: number[] = [], uu: number[] = [], vv: number[] = [], part: number[] = [], ceph: number[] = [], idx: number[] = [];
  const tipBack = (au: number) => -0.1 * Math.pow(au, 5);
  const zF = (u: number) => { const au = Math.abs(u); return 0.31 - 0.4 * Math.pow(au, 1.05) + 0.06 * Math.sin(au * Math.PI) + tipBack(au); };
  const zB = (u: number) => { const au = Math.abs(u); return -0.36 + 0.25 * Math.pow(au, 0.75) - 0.07 * Math.exp(-(((au - 0.12) / 0.045) ** 2)) + tipBack(au) * 1.2; };
  const vert = (x: number, y: number, z: number, s: number, u: number, v: number, pt: number, c: number[] = [0, 0, 0]) => { pos.push(x, y, z); side.push(s); uu.push(u); vv.push(v); part.push(pt); ceph.push(...c); };
  for (const s of [1, -1]) {
    const start = pos.length / 3;
    for (let i = 0; i <= SN; i++) for (let j = 0; j <= CN; j++) {
      const u = -1 + 2 * i / SN, v = j / CN, au = Math.abs(u);
      const z = zF(u) + (zB(u) - zF(u)) * v;
      const body = Math.exp(-((u / 0.2) ** 2)) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.6);
      const wing = Math.pow(Math.max(0, 1 - au), 1.3) * Math.pow(Math.sin(Math.PI * v), 0.8);
      const y = s > 0 ? 0.11 * body + 0.035 * wing : -(0.05 * body + 0.02 * wing);
      vert(u, y, z, s, u, v, 0);
    }
    for (let i = 0; i < SN; i++) for (let j = 0; j < CN; j++) {
      const a = start + i * (CN + 1) + j, b = a + CN + 1;
      if (s > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // tail: a thin, tapering whip about as long as the disc, with a small dorsal fin at its root
  { const start = pos.length / 3, L = 12, R = 6;
    for (let i = 0; i <= L; i++) for (let k = 0; k < R; k++) {
      const t = i / L, a = k / R * Math.PI * 2, r = 0.018 * (1 - t) + 0.002;
      vert(Math.cos(a) * r, 0.005 + Math.sin(a) * r, -0.34 - t * 0.75, 1, 0, 1, 1);
    }
    for (let i = 0; i < L; i++) for (let k = 0; k < R; k++) { const a = start + i * R + k, b = start + i * R + (k + 1) % R; idx.push(a, a + R, b, b, a + R, b + R); }
    const f = pos.length / 3;
    vert(0, 0.04, -0.3, 1, 0, 1, 1); vert(0, 0.1, -0.38, 1, 0, 1, 1); vert(0, 0.03, -0.4, 1, 0, 1, 1);
    idx.push(f, f + 1, f + 2);
  }
  // cephalic fins: flaps that roll into horns (the vertex shader curls them by uFeed)
  for (const sx of [-1, 1]) {
    const start = pos.length / 3, L = 8, C = 6;
    for (let i = 0; i <= L; i++) for (let j = 0; j <= C; j++) vert(sx * 0.13, 0.02, 0.28, 1, 0, 0, 2, [i / L, j / C, sx]);
    for (let i = 0; i < L; i++) for (let j = 0; j < C; j++) { const a = start + i * (C + 1) + j, b = a + C + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vv, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aCeph', new THREE.Float32BufferAttribute(ceph, 3));
  g.setIndex(idx);
  return g;
})();
export function mantaMaterial() {
  return mat(
    `attribute float aSide; attribute float aU; attribute float aV; attribute float aPart; attribute vec3 aCeph;
     uniform float uPhase; uniform float uFeed; uniform float uBeat;
     varying vec3 vWp; varying vec3 vL; varying float vSide; varying float vPart; varying vec2 vUV;
     void main(){
       vec3 p = position; float au = abs(aU);
       if (aPart > 1.5) {
         // cephalic fin: a strip that rolls into a horn, or unrolls and turns down into a funnel when feeding
         float curl = 1.0 - uFeed, l = aCeph.x, c = aCeph.y - 0.5, sx = aCeph.z;
         float len = 0.17, wid = 0.075;
         float R = wid / max(curl * 5.5, 0.02), th = c * wid / R;
         vec3 fw = normalize(vec3(sx * 0.12 * (1.0 - uFeed) + sx * 0.25 * uFeed, -0.5 * uFeed, 1.0));
         vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fw)) * sx;
         vec3 up = cross(fw, side) * sx;
         p = vec3(sx * (0.12 + 0.02 * uFeed), 0.02, 0.27) + fw * l * len + side * (sin(th) * R) + up * ((1.0 - cos(th)) * R) * sx;
         p.y -= l * l * 0.03 * (1.0 - uFeed);
       } else if (aPart > 0.5) {
         // the tail trails and swings a little
         float t = clamp((-0.34 - p.z) / 0.75, 0.0, 1.0);
         p.x += sin(uTime * 0.9 + uPhase - t * 3.0) * 0.05 * t * t;
         p.y += sin(uTime * uBeat + uPhase - 1.8) * 0.04 * t;
       } else {
         // wings flap in a wave that travels out to the tips, with the trailing edge lagging
         float ph = uTime * uBeat + uPhase - au * 1.7 - aV * 0.7;
         p.y += sin(ph) * 0.36 * pow(au, 1.6);
         p.z += cos(ph) * 0.04 * au;
         // the mouth opens: the lower jaw drops at the front of the head
         if (aSide < 0.0) p.y -= uFeed * 0.045 * smoothstep(0.1, 0.0, aV) * smoothstep(0.13, 0.05, au);
       }
       vec4 w = modelMatrix * vec4(p, 1.0); vWp = w.xyz; vL = position; vSide = aSide; vPart = aPart; vUV = vec2(aU, aV);
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    `uniform float uSeed; uniform float uFeed; varying vec3 vWp; varying vec3 vL; varying float vSide; varying float vPart; varying vec2 vUV;
     void main(){
       vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp))); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float u = vUV.x, v = vUV.y, au = abs(u);
       vec3 black = vec3(0.03, 0.035, 0.045), white = vec3(0.9, 0.91, 0.88);
       vec3 alb;
       if (vPart > 0.5) alb = mix(black, vec3(0.2), step(1.5, vPart) * 0.5 * (1.0 - uFeed));
       else if (vSide > 0.0) {
         // back: black, with the reef manta's pale shoulder patches that run out from behind the head
         alb = black * (0.9 + 0.25 * vn2(vL.xz * 12.0 + uSeed));
         // each patch is a soft, swept ellipse from beside the head out and back over the wing
         vec2 q = vec2(au - 0.27, vL.z - 0.13);
         vec2 r = vec2(dot(q, normalize(vec2(0.8, -0.6))), dot(q, normalize(vec2(0.6, 0.8))));
         float shoulder = 1.0 - smoothstep(0.45, 1.25, length(r / vec2(0.27, 0.12)) + (vn2(vL.xz * 7.0 + uSeed) - 0.5) * 0.6);
         shoulder *= smoothstep(0.1, 0.2, au) * smoothstep(-0.12, 0.08, vL.z);   // the black V behind the head; black toward the back
         alb = mix(alb, mix(vec3(0.3, 0.32, 0.34), vec3(0.72, 0.73, 0.72), smoothstep(0.3, 0.9, shoulder)), smoothstep(0.0, 0.5, shoulder));
         // eyes on the sides of the head, at the base of the cephalic fins
         alb = mix(alb, vec3(0.01), 1.0 - smoothstep(0.012, 0.018, length(vec2(au - 0.145, vL.z - 0.255))));
       } else {
         // belly: white, dark along the trailing edges and wingtips, and each manta's own black spots
         alb = white;
         alb = mix(alb, vec3(0.1), smoothstep(0.7, 0.98, v) * smoothstep(0.3, 0.7, au) + smoothstep(0.82, 0.97, au));
         vec2 g = vL.xz * 16.0 + uSeed; float sp = (1.0 - smoothstep(0.18, 0.32, length(fract(g) - 0.5))) * step(0.84, hash2(floor(g)));
         alb = mix(alb, vec3(0.08), sp * step(au, 0.35) * smoothstep(0.25, 0.05, abs(vL.z - 0.02)));
         // five pairs of gill slits
         for (int k = 0; k < 5; k++) { float zz = 0.12 - float(k) * 0.035; alb *= 1.0 - 0.7 * (1.0 - smoothstep(0.003, 0.006, abs(vL.z - zz))) * step(0.1, au) * step(au, 0.17 + float(k) * 0.006); }
         // the mouth: a dark edge, and grey gill rakers inside when it opens
         alb = mix(alb, vec3(0.12), smoothstep(0.04, 0.0, v) * step(au, 0.13));
         alb = mix(alb, vec3(0.42), uFeed * smoothstep(0.08, 0.0, v) * step(au, 0.12) * (0.6 + 0.4 * step(0.5, fract(u * 60.0))));
       }
       gl_FragColor = vec4(shade(alb, vWp, n, 0.4), 1.0);
     }`,
    { uniforms: { uPhase: { value: Math.random() * 6 }, uFeed: { value: 0 }, uBeat: { value: 1.05 }, uSeed: { value: Math.random() * 50 } }, opts: { side: THREE.DoubleSide } });
}

/* ---------- humpback whale ---------- */
// Megaptera novaeangliae, lofted like the sharks (s = fraction of length from the rostrum): a broad,
// flat-topped head, the deepest body just behind the flippers, a tall narrow tail stock, and flukes a
// third of the body length across with a scalloped trailing edge. The flippers are the longest of any
// whale, with knobbed leading edges. Head at +z, length 1; parts: 0 body, 1 left flipper, 2 right, 3 flukes.
export function whaleGeometry() {
  const K = [[0, 0.004, 0.006, -0.012], [0.02, 0.024, 0.036, -0.014], [0.08, 0.048, 0.066, -0.02], [0.16, 0.068, 0.085, -0.02], [0.26, 0.088, 0.1, -0.015],
    [0.36, 0.098, 0.104, -0.01], [0.46, 0.094, 0.094, 0], [0.56, 0.08, 0.074, 0.004], [0.66, 0.063, 0.05, 0.008], [0.76, 0.047, 0.027, 0.008],
    [0.84, 0.032, 0.015, 0.005], [0.88, 0.019, 0.011, 0.001], [0.9, 0.004, 0.004, 0]];
  const Z = (s: number) => 0.5 - s;
  const at = (s: number) => {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < s) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const t = (s - p1[0]) / Math.max(p2[0] - p1[0], 1e-6), t2 = t * t, t3 = t2 * t;
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    return [Math.max(0.002, cr(p0[1], p1[1], p2[1], p3[1])), Math.max(0.002, cr(p0[2], p1[2], p2[2], p3[2])), cr(p0[3], p1[3], p2[3], p3[3])];
  };
  const RINGS = 56, RAD = 22, pos: number[] = [], idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const s = 0.9 * Math.pow(r / RINGS, 1.1), [h, w, yc] = at(s);
    const flatTop = 1 - 0.35 * (1 - smooth(0.05, 0.3, s));          // the rostrum is flat on top
    for (let k = 0; k < RAD; k++) {
      const a = (k / RAD) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      // the tail stock is a keel: taller than wide, pinched at the sides
      const keel = smooth(0.66, 0.84, s);
      const x = ca * w * (1 - keel * 0.25 * Math.abs(sa));
      pos.push(x, yc + h * sa * (sa > 0 ? flatTop : 0.9), Z(s));
    }
  }
  for (let r = 0; r < RINGS; r++) for (let k = 0; k < RAD; k++) {
    const a = r * RAD + k, b = r * RAD + (k + 1) % RAD, c = a + RAD, d = b + RAD;
    idx.push(a, c, b, b, c, d);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx); body.computeVertexNormals();
  const b = body.toNonIndexed();
  const P = Array.from(b.attributes.position.array), N = Array.from(b.attributes.normal.array), A = new Array(b.attributes.position.count).fill(0);
  const fin = (outline: number[][], map: (a: number, b: number) => number[], part: number, n: number[]) => {
    const pts = outline.map(([a, c]) => new THREE.Vector2(a, c));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) for (const i of t) { const v = map(pts[i].x, pts[i].y); P.push(v[0], v[1], v[2]); N.push(...n); A.push(part); }
  };
  // small dorsal fin on its hump
  const top = (s: number) => { const [h, , yc] = at(s); return yc + h * 0.97; };
  fin([[0.61, 0], [0.64, 0.012], [0.662, 0.026], [0.675, 0.03], [0.68, 0.02], [0.685, 0]], (s, dy) => [0, top(s) + dy - 0.003, Z(s)], 0, [1, 0, 0]);
  // flukes: swept, with a scalloped trailing edge and a central notch
  const half: number[][] = [[0.855, 0.012], [0.88, 0.06], [0.91, 0.115], [0.94, 0.155], [0.965, 0.172]];
  const trail: number[][] = [];
  for (let k = 0; k <= 10; k++) { const x = 0.165 - k * 0.0155, s = 0.972 - 0.012 * Math.sin(k / 10 * Math.PI) + (k % 2 ? 0.004 : 0) + (k === 10 ? 0.012 : 0); trail.push([s, x]); }
  // assemble a simple, ordered loop: left leading edge out, left trailing edge in, notch, right trailing out, right leading in
  const loop = [...half.map(([s, x]) => [s, -x]), ...trail.map(([s, x]) => [s, -x]).slice(1), [0.975, 0], ...trail.slice().reverse().slice(0, -1).map(([s, x]) => [s, x]), ...half.slice().reverse().map(([s, x]) => [s, x])];
  fin(loop, (s, x) => [x, 0, Z(s)], 3, [0, 1, 0]);
  // flippers: a third of the body long, narrow, with knobs along the leading edge
  for (const sx of [-1, 1]) {
    const [h, w, yc] = at(0.27), root = [sx * w * 0.8, yc - h * 0.55, Z(0.27)];
    const dir = new THREE.Vector3(sx * 0.78, -0.32, -0.54).normalize(), fwd = new THREE.Vector3(0, 0, 1);
    const chordDir = fwd.clone().addScaledVector(dir, -fwd.dot(dir)).normalize(), nrm = new THREE.Vector3().crossVectors(dir, chordDir).normalize();
    const L = 0.31, pts: number[][] = [];
    for (let k = 0; k <= 16; k++) { const a = k / 16 * L, c = 0.036 * (1 - 0.7 * (a / L)) * (1 + 0.14 * Math.pow(Math.abs(Math.sin(k * Math.PI * 0.5)), 2)); pts.push([a, c]); }   // knobbed leading edge
    for (let k = 16; k >= 0; k--) { const a = k / 16 * L; pts.push([a, -0.026 * (1 - 0.62 * (a / L))]); }
    fin(pts, (a, c) => [root[0] + dir.x * a + chordDir.x * c, root[1] + dir.y * a + chordDir.y * c, root[2] + dir.z * a + chordDir.z * c], sx < 0 ? 1 : 2, [nrm.x, nrm.y, nrm.z]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  return g;
}
export const WHALE_GEO = whaleGeometry();
export function whaleMaterial(seed: number) {
  return mat(
    `attribute float aPart; uniform float uStroke; uniform float uPhase; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart;
     void main(){
       vec3 p = position;
       // the stroke is vertical: a wave down the tail stock that lifts and drops the flukes
       float back = clamp((0.15 - p.z) / 0.65, 0.0, 1.0);
       float ph = uTime * 1.6 + uPhase;
       p.y += sin(ph - back * 2.2) * 0.045 * back * back * uStroke;
       // the flippers sweep slowly
       if (aPart > 0.5 && aPart < 2.5) p.y += sin(uTime * 0.45 + uPhase + aPart) * 0.06 * length(p.xz - vec2(0.0, 0.23)) * uStroke;
       vec4 w = modelMatrix * vec4(p, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vL = position; vPart = aPart;
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    SURFACE + `uniform float uSeed; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float z = vL.z, y = vL.y, x = vL.x;
       vec3 dark = vec3(0.055, 0.06, 0.068), pale = vec3(0.82, 0.84, 0.84);
       // dark back, white belly with a ragged boundary and mottling that differs whale to whale
       float edge = smoothstep(-0.03, 0.01, y + 0.03 * (vn2(vec2(z * 18.0, x * 18.0) + uSeed) - 0.5) + 0.02 * sin(z * 9.0 + uSeed));
       vec3 alb = mix(pale, dark, edge);
       alb = mix(alb, dark, smoothstep(0.55, 0.8, vn2(vec2(z * 30.0, x * 30.0) - uSeed)) * 0.6 * (1.0 - edge));
       // ventral pleats from chin to navel
       if (vPart < 0.5 && z > 0.02 && y < -0.035) alb *= 0.72 + 0.28 * smoothstep(0.25, 0.45, abs(fract(x * 95.0) - 0.5));
       // tubercles on the head and barnacle clusters on the chin
       if (vPart < 0.5 && z > 0.3) {
         float c = cellF1(vec2(x, z) * 55.0);
         alb = mix(alb, dark * 0.6, (1.0 - smoothstep(0.12, 0.22, c)) * step(0.0, y) * 0.8);
         alb = mix(alb, vec3(0.78, 0.76, 0.7), (1.0 - smoothstep(0.1, 0.2, cellF1(vec2(x, z) * 90.0 + 3.0))) * step(y, -0.01) * step(0.62, vn2(vec2(x, z) * 25.0)));
       }
       // flippers: white, dark along the upper leading edge; flukes: pale undersides with dark marks
       if (vPart > 0.5 && vPart < 2.5) alb = mix(pale, dark, smoothstep(0.35, 0.8, vn2(vec2(x, z) * 30.0 + uSeed)) * 0.7);
       if (vPart > 2.5) alb = n.y < 0.0 ? mix(pale, dark, smoothstep(0.4, 0.75, vn2(vec2(x, z) * 22.0 + uSeed))) : dark;
       gl_FragColor = vec4(shade(alb, vWp, n, 0.4), 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS, uStroke: { value: 1 }, uPhase: { value: seed * 6.28 }, uSeed: { value: seed * 17.0 } }, opts: { side: THREE.DoubleSide } });
}
