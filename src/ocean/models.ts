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
  // a soft column, an oral disc and a thick crown of long, tapering tentacles with rounded tips,
  // jointed along their length so the shader can bend them like cloth in the surge
  const rnd = mulberry32(seed), acc = Acc();
  pushGeo(acc, new THREE.CylinderGeometry(0.25, 0.3, 0.12, 20, 1), new THREE.Matrix4().makeTranslation(0, 0.06, 0), () => 0);
  pushGeo(acc, new THREE.CylinderGeometry(0.2, 0.25, 0.02, 20, 1), new THREE.Matrix4().makeTranslation(0, 0.125, 0), () => 0.05);
  for (let i = 0; i < 150; i++) {
    const r = 0.05 + Math.sqrt(rnd()) * 0.21, a = rnd() * Math.PI * 2;
    const base = new THREE.Vector3(Math.cos(a) * r, 0.12, Math.sin(a) * r);
    const out = 0.25 + r * 2.4;
    const dir = new THREE.Vector3(Math.cos(a) * out, 1, Math.sin(a) * out).normalize();
    const len = 0.17 + rnd() * 0.14;
    const c = new THREE.CylinderGeometry(0.009, 0.017, len, 5, 6, true);
    // a little bulb at the tip, as on bubble-tip anemones
    const pc = c.attributes.position;
    for (let k = 0; k < pc.count; k++) { const y = pc.getY(k) / len + 0.5, bulb = 1 + 0.6 * smooth(0.72, 0.92, y) * (1 - smooth(0.92, 1.0, y)); pc.setX(k, pc.getX(k) * bulb); pc.setZ(k, pc.getZ(k) * bulb); }
    c.computeVertexNormals();
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
         p.x += sin(t * 0.7 + aSeed * 6.283) * 0.025 * aTip; p.z += sin(t * 0.55 + aSeed * 4.0 + position.y * 3.0) * 0.02 * aTip;
       #elif KIND == 5
         // each tentacle curls on its own a little, and the whole crown slowly breathes
         float ph = t * 1.1 + aSeed * 6.283 + position.x * 7.0 + position.z * 5.0 - aTip * 2.5;
         p.x += sin(ph) * 0.035 * aTip * aTip; p.z += cos(ph * 0.83) * 0.035 * aTip * aTip;
         p.xz *= 1.0 + 0.08 * sin(t * 0.45 + aSeed * 6.283) * aTip;
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
       #if KIND == 3 || KIND == 4 || KIND == 5
       {
         // the water moving through: a steady lean down-current, and the surge of passing swell rolling
         // across the reef as one visible wave (stronger in the shallows), breathing in slow gusts
         vec2 fd = normalize(uCurrent + vec2(1e-4));
         float cur = clamp(length(uCurrent), 0.2, 1.0);
         float surge = sin(t * 0.85 - dot(ip.xz, fd) * 0.3 + aSeed * 0.8) * mix(1.0, 0.45, smoothstep(-3.0, -24.0, ip.y));
         float gust = 0.65 + 0.35 * sin(t * 0.23 + dot(ip.xz, vec2(0.05, 0.07)));
         float flow = (0.3 * cur + 0.55 * surge) * gust;
         #if KIND == 5
           float bend = aTip * aTip * 0.2;
         #elif KIND == 4
           float bend = aTip * aTip * 0.07;
         #else
           float bend = aTip * aTip * 0.09;
         #endif
         wp.xz += fd * flow * bend * isc.y;
         wp.y -= abs(flow) * bend * 0.35 * isc.y;
       }
       #endif
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
  oceanic: { h: 0.24, w: 0.22, tail: 'shark', dorsal: 0.2, anal: 0.04, pect: 0.4, pointy: true, lofted: 'oceanic' },
  hammer: { h: 0.2, w: 0.2, tail: 'shark', dorsal: 0.2, anal: 0.04, pect: 0.26, pointy: true, lofted: 'hammer' },
  tiger: { h: 0.24, w: 0.24, tail: 'shark', dorsal: 0.16, anal: 0.04, pect: 0.26, pointy: true, lofted: 'tiger' },
  marlin: { h: 0.24, w: 0.16, tail: 'lunate', dorsal: 0.3, anal: 0.08, pointy: true, bill: 0.4 },
  fusilier: { h: 0.3, w: 0.15, tail: 'fork', dorsal: 0.08, anal: 0.06 },
  jack: { h: 0.42, w: 0.15, tail: 'fork', dorsal: 0.12, anal: 0.1 },
  whale: { h: 0.24, w: 0.3, tail: 'shark', dorsal: 0.16, anal: 0.04, pect: 0.3, flathead: true, lofted: 'whaleshark' },
  grouper: { h: 0.34, w: 0.26, tail: 'round', dorsal: 0.08, anal: 0.06 },
  barracuda: { h: 0.15, w: 0.12, tail: 'fork', dorsal: 0.07, anal: 0.05, pointy: true },
  angel: { h: 0.64, w: 0.12, tail: 'trunc', dorsal: 0.1, anal: 0.09 },
  trigger: { h: 0.52, w: 0.17, tail: 'trunc', dorsal: 0.13, anal: 0.12 },
  batfish: { h: 0.92, w: 0.1, tail: 'trunc', dorsal: 0.32, anal: 0.28 },
  tuna: { h: 0.28, w: 0.25, tail: 'fork', dorsal: 0.1, anal: 0.07, pect: 0.14 },
  mola: { h: 0.78, w: 0.15, tail: 'round', dorsal: 0.5, anal: 0.5, mola: true },
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
  // oceanic whitetip: stocky, a short rounded snout, a huge first dorsal with a rounded crown, and very
  // long, broad, paddle-ended pectorals it glides on
  oceanic: { body: [[0, 0, 0, -0.004], [0.02, 0.022, 0.03, -0.006], [0.06, 0.044, 0.052, -0.004], [0.13, 0.064, 0.064, 0], [0.22, 0.074, 0.068, 0.002], [0.32, 0.075, 0.064, 0.003], [0.45, 0.062, 0.05, 0.003], [0.55, 0.046, 0.036, 0.003], [0.64, 0.03, 0.022, 0.003], [0.7, 0.019, 0.014, 0.004], [0.745, 0.012, 0.009, 0.006], [0.76, 0.004, 0.004, 0.008]],
    d1: [[0.25, 0], [0.27, 0.05], [0.3, 0.1], [0.34, 0.128], [0.38, 0.134], [0.41, 0.122], [0.425, 0.09], [0.425, 0.05], [0.42, 0]], d2: 0.026, pect: 0.3, paddle: true },
  // scalloped hammerhead: slender, a very tall falcate first dorsal, and the cephalofoil — the flattened,
  // scalloped hammer of a head with an eye at each end
  hammer: { body: [[0, 0, 0.02, -0.004], [0.03, 0.016, 0.03, -0.004], [0.07, 0.032, 0.04, -0.003], [0.13, 0.048, 0.05, 0], [0.22, 0.058, 0.054, 0.002], [0.32, 0.06, 0.052, 0.003], [0.45, 0.05, 0.042, 0.003], [0.55, 0.038, 0.031, 0.003], [0.64, 0.026, 0.02, 0.003], [0.7, 0.017, 0.012, 0.004], [0.745, 0.011, 0.008, 0.006], [0.76, 0.004, 0.004, 0.008]],
    d1: [[0.28, 0], [0.31, 0.05], [0.345, 0.1], [0.375, 0.13], [0.392, 0.135], [0.392, 0.105], [0.388, 0.05], [0.385, 0]], d2: 0.02, pect: 0.15, hammer: true },
  // tiger shark: heavy, with a short, broad, almost square snout and a long upper tail lobe
  tiger: { body: [[0, 0, 0.02, -0.004], [0.015, 0.024, 0.04, -0.006], [0.05, 0.046, 0.06, -0.004], [0.13, 0.068, 0.07, 0], [0.22, 0.078, 0.072, 0.002], [0.32, 0.076, 0.066, 0.003], [0.45, 0.064, 0.052, 0.003], [0.55, 0.048, 0.037, 0.003], [0.64, 0.031, 0.023, 0.003], [0.7, 0.019, 0.014, 0.004], [0.745, 0.012, 0.009, 0.006], [0.76, 0.004, 0.004, 0.008]],
    d1: [[0.3, 0], [0.33, 0.04], [0.37, 0.075], [0.41, 0.092], [0.43, 0.094], [0.425, 0.06], [0.42, 0.03], [0.415, 0]], d2: 0.03, pect: 0.18 },
  // whale shark: the head broad and flat, cut square across the front by the huge terminal mouth, the eyes
  // small and set at its corners; the body deepest a third of the way back and ridged — three ridges along
  // each upper flank, the lowest running on into a keel on the tail stock; the first dorsal set far back,
  // big, broad pectorals, and a tall, nearly crescent tail
  whaleshark: { body: [[0, 0.024, 0.07, 0], [0.015, 0.032, 0.08, 0.002], [0.05, 0.046, 0.088, 0.004], [0.11, 0.062, 0.091, 0.006], [0.2, 0.078, 0.091, 0.008], [0.3, 0.088, 0.084, 0.009], [0.42, 0.08, 0.071, 0.009], [0.53, 0.063, 0.055, 0.009], [0.62, 0.045, 0.041, 0.009], [0.69, 0.029, 0.03, 0.009], [0.74, 0.019, 0.025, 0.009], [0.76, 0.005, 0.006, 0.01]],
    d1: [[0.43, 0], [0.46, 0.045], [0.5, 0.085], [0.535, 0.098], [0.552, 0.094], [0.548, 0.05], [0.545, 0]], d2: 0.024, pect: 0.21, rad: 36, cap: true, flatHead: true,
    ridges: [0.32, 0.72, 1.12],
    tail: [[0.735, 0.014], [0.79, 0.06], [0.86, 0.12], [0.92, 0.168], [0.952, 0.188], [0.943, 0.158], [0.905, 0.1], [0.868, 0.042], [0.855, 0.002], [0.872, -0.05], [0.9, -0.1], [0.913, -0.122], [0.866, -0.094], [0.795, -0.042], [0.745, -0.01]] },
};
export function sharkGeometry(style: 'reef' | 'whitetip' | 'oceanic' | 'hammer' | 'tiger' | 'whaleshark') {
  const S: any = SHARK_STYLE[style], K = S.body, L = 1.28, Z = (s: number) => 0.47 - L * s;
  // Catmull-Rom through the body keys
  const at = (s: number) => {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < s) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const t = (s - p1[0]) / Math.max(p2[0] - p1[0], 1e-6), t2 = t * t, t3 = t2 * t;
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    return [Math.max(0, cr(p0[1], p1[1], p2[1], p3[1])), Math.max(0, cr(p0[2], p1[2], p2[2], p3[2])), cr(p0[3], p1[3], p2[3], p3[3])];
  };
  const RINGS = S.rad ? 64 : 40, RAD = S.rad ?? 18, pos: number[] = [], idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const s = 0.76 * Math.pow(r / RINGS, 1.15);
    const [h, w, yc] = at(s);
    // (whale shark: the ridges along the upper flanks, standing out most along the middle of the body)
    const rk = S.ridges ? smooth(0.06, 0.2, s) * (1 - smooth(0.66, 0.76, s)) : 0;
    const flat = S.flatHead ? 1 - 0.38 * (1 - smooth(0.0, 0.3, s)) : 1;   // (a flatter, broader head)
    for (let k = 0; k < RAD; k++) {
      const a = (k / RAD) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      let bump = 0;
      if (rk > 0 && sa > -0.1) for (const ra of S.ridges) { const d = Math.abs(Math.atan2(sa, Math.abs(ca))) - (Math.PI / 2 - ra); bump += Math.exp(-((d / 0.06) ** 2)) * (ra === S.ridges[0] ? 1 : 0.7); }
      const keel = S.ridges ? smooth(0.62, 0.72, s) * (1 - smooth(0.74, 0.76, s)) * Math.exp(-((sa / 0.2) ** 2)) * 0.35 : 0;   // the keel on each side of the tail stock
      const rr2 = 1 + bump * 0.045 * rk + keel;
      // flatter belly, a slightly squared-off back
      pos.push(ca * w * L * rr2, (yc + h * sa * (sa < 0 ? 0.82 * flat : flat) * (1 + bump * 0.04 * rk)) * L, Z(s));
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
  if (S.cap) {
    // the square-cut front: the mouth, a wide slit set a little back into the head (aFin 6)
    const [h0, w0, y0] = at(0), zc = Z(0) + 0.008;   // (blunt, very slightly domed)
    for (let k = 0; k < RAD; k++) {
      const a0 = (k / RAD) * Math.PI * 2, a1 = ((k + 1) / RAD) * Math.PI * 2;
      const v = (a: number) => { const sa = Math.sin(a); return [Math.cos(a) * w0 * L, (y0 + h0 * sa * (sa < 0 ? 0.82 * 0.7 : 0.7)) * L, Z(0)]; };
      for (const q of [[0, y0 * L, zc], v(a1), v(a0)]) { P.push(q[0], q[1], q[2]); N.push(0, 0, 1); F.push(6); }
    }
  }
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
  fin(S.tail ?? [[0.735, 0.012], [0.8, 0.055], [0.88, 0.1], [0.95, 0.13], [0.985, 0.14], [0.972, 0.118], [0.945, 0.1], [0.91, 0.062], [0.875, 0.022], [0.86, 0.004],
    [0.878, -0.035], [0.9, -0.07], [0.862, -0.055], [0.8, -0.03], [0.745, -0.008]], (s, y) => [0, y * L, Z(s)], 1, X);
  if (S.hammer) {
    // the cephalofoil, lying flat across the front of the head: scalloped leading edge, eyes at the tips
    const hw = 0.19, zf = 0.47, pts: number[][] = [];   // about 30% of the length across
    for (let i = 0; i <= 16; i++) { const x = -hw + (2 * hw * i) / 16; pts.push([x, zf - 0.004 - 0.018 * (Math.abs(x) / hw) ** 2 - 0.004 * Math.abs(Math.sin(x * 70))]); }
    pts.push([hw, zf - 0.06], [hw * 0.55, zf - 0.066], [0.035, zf - 0.1], [-0.035, zf - 0.1], [-hw * 0.55, zf - 0.066], [-hw, zf - 0.06]);
    const yc = at(0.03)[2] * L;
    for (const dy of [0.009, -0.009]) fin(pts.map(([x, z]) => [x, z]), (x, z) => [x, yc + dy * (1 - (Math.abs(x) / hw) ** 2 * 0.5), z], 4, [0, Math.sign(dy), 0]);
  }
  for (const sx of [-1, 1]) {
    // pectorals: (s, span out from the body), swept back and angled a little down, falcate
    const [h, w, yc] = at(0.2), ry = (yc - h * 0.45) * L, rx = w * 0.85 * L, sp = S.pect;
    fin(S.paddle ? [[0.17, 0], [0.2, sp * 0.3], [0.25, sp * 0.7], [0.3, sp * 0.95], [0.345, sp * 1.02], [0.375, sp * 0.9], [0.37, sp * 0.55], [0.33, sp * 0.2], [0.3, 0]]   // broad, rounded paddles
      : S.cap ? [[0.17, 0], [0.23, sp * 0.42], [0.3, sp * 0.82], [0.35, sp], [0.345, sp * 0.8], [0.315, sp * 0.4], [0.295, 0]]   // (whale shark: broad at the root)
      : [[0.18, 0], [0.24, sp * 0.42], [0.31, sp * 0.82], [0.36, sp], [0.335, sp * 0.72], [0.29, sp * 0.32], [0.265, 0]],
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

// Ocean sunfish (Mola mola): a tall, flattened disc that ends abruptly behind in the clavus, a rudder of
// scalloped fin rays in place of a tail; long pointed dorsal and anal fins that it sculls from side to
// side; a small beak of a mouth and tiny round pectorals. Snout at +z, like fishGeometry.
export function molaGeometry() {
  const RINGS = 26, RAD = 20, pos: number[] = [], idx: number[] = [];
  const Z = (s: number) => 0.48 - 0.82 * s;
  const H = (s: number) => 0.33 * Math.pow(Math.min(1, (s + 0.02) / 0.34), 0.6) * (1 - 0.14 * Math.max(0, s - 0.55) / 0.45);
  const Wd = (s: number) => 0.085 * Math.pow(Math.min(1, (s + 0.03) / 0.28), 0.7) * (1 - 0.55 * Math.max(0, s - 0.45) / 0.55);
  for (let r = 0; r <= RINGS; r++) {
    const s = r / RINGS, h = H(s), w = Wd(s);
    for (let k = 0; k < RAD; k++) {
      const a = (k / RAD) * Math.PI * 2, sa = Math.sin(a);
      pos.push(Math.cos(a) * w * (1 - 0.35 * sa * sa), sa * h - 0.012 * (1 - s), Z(s));
    }
  }
  for (let r = 0; r < RINGS; r++) for (let k = 0; k < RAD; k++) {
    const a = r * RAD + k, b = r * RAD + (k + 1) % RAD, c = a + RAD, d = b + RAD;
    idx.push(a, c, b, b, c, d);
  }
  // close the blunt front and the cut-off back
  const f0 = pos.length / 3; pos.push(0, -0.012, Z(0) + 0.02);
  for (let k = 0; k < RAD; k++) idx.push(f0, k, (k + 1) % RAD);
  const b0 = pos.length / 3; pos.push(0, 0, Z(1)); const last = RINGS * RAD;
  for (let k = 0; k < RAD; k++) idx.push(b0, last + (k + 1) % RAD, last + k);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx); body.computeVertexNormals();
  const b = body.toNonIndexed();
  const P = Array.from(b.attributes.position.array), N = Array.from(b.attributes.normal.array), F = new Array(b.attributes.position.count).fill(0);
  const fin = (outline: number[][], map: (a: number, b: number) => number[], id: number, n: number[]) => {
    const pts = outline.map(([a, c]) => new THREE.Vector2(a, c));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) for (const i of t) { const v = map(pts[i].x, pts[i].y); P.push(v[0], v[1], v[2]); N.push(...n); F.push(id); }
  };
  const X = [1, 0, 0];
  // dorsal and anal: tall, narrow, raked back to a point (z, height above the back)
  const topAt = (z: number) => H((0.48 - z) / 0.82);
  const tall = [[-0.06, 0], [-0.12, 0.18], [-0.2, 0.37], [-0.26, 0.47], [-0.3, 0.44], [-0.31, 0.3], [-0.325, 0.12], [-0.335, 0]];
  fin(tall, (z, y) => [0, topAt(z) - 0.02 + y, z], 2, X);
  fin(tall, (z, y) => [0, -topAt(z) + 0.02 - y, z], 2, X);
  // the clavus: a scalloped frill from top to bottom behind the body
  const cl: number[][] = [];
  const zb = Z(1) + 0.01, hb = H(1) * 1.05;
  for (let i = 0; i <= 24; i++) { const t = -1 + (2 * i) / 24; cl.push([t * hb, zb - 0.11 * Math.sqrt(1 - t * t) - 0.018 * Math.abs(Math.sin(t * Math.PI * 4))]); }
  cl.push([hb, zb], [-hb, zb]);
  fin(cl.map(([y, z]) => [z, y]), (z, y) => [0, y, z], 1, X);
  // small round pectorals just behind the gill opening
  for (const sx of [-1, 1]) {
    const pts: number[][] = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 10; pts.push([0.22 - 0.06 * (1 + Math.cos(a)) * 0.5 - 0.03, 0.04 * Math.sin(a) + 0.005]); }
    pts.push([0.22, 0.045], [0.22, -0.035]);
    fin(pts.map(([z, d]) => [z, d]), (z, d) => [sx * (Wd((0.48 - z) / 0.82) * 0.9 + Math.max(0, 0.22 - z) * 0.5), d, z], 3, [sx, 0, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(F, 1));
  return g;
}

export function fishGeometry(sh, low = false) {
  if (sh.lofted) return sharkGeometry(sh.lofted);
  if (sh.mola) return molaGeometry();
  const body = low ? new THREE.SphereGeometry(0.5, 8, 6) : new THREE.SphereGeometry(0.5, 16, 12);   // low: for schools of hundreds
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
  else if (sh.tail === 'lunate') {
    // a stiff crescent, as tall as the body is long in the fast swimmers
    const c = [[0, 0.02, -0.42], [0, H * 3.2, -0.72], [0, H * 2.6, -0.66], [0, 0.0, -0.5], [0, -H * 2.6, -0.66], [0, -H * 3.2, -0.72], [0, -0.02, -0.42]];
    for (let k = 1; k < c.length - 1; k++) tri(c[0], c[k], c[k + 1], 1);
  }
  else { tri([0, 0, -0.44], [0, H * 3.2, -0.9], [0, 0, -0.62], 1); tri([0, 0, -0.44], [0, 0, -0.6], [0, -H * 1.8, -0.72], 1); }
  if (sh.bill) {
    // the bill: a long spear from the upper jaw
    const b = sh.bill;
    tri([0, 0.012, 0.46], [0, 0.0, 0.5 + b], [0, -0.012, 0.46], 5); tri([-0.012, 0, 0.46], [0, 0, 0.5 + b], [0.012, 0, 0.46], 5, [0, 1, 0]);
  }
  if (sh.filament) { tri([0, H * 0.9, 0.12], [0, H + sh.filament, -0.42], [0, H * 0.9, -0.04], 2); tri([0, H * 0.9, 0.12], [0, H * 0.9, -0.3], [0, H + 0.2, -0.2], 2); }
  else if (sh.rear) {
    // ocean sunfish: a tall dorsal and anal fin far back, which it sculls side to side instead of a tail
    tri([0, H * 0.7, -0.14], [0, H + sh.dorsal, -0.36], [0, H * 0.45, -0.42], 2);
    tri([0, -H * 0.7, -0.14], [0, -H - sh.anal, -0.36], [0, -H * 0.45, -0.42], 2);
  }
  else if (sh.bill) {
    // marlin: the dorsal rises high at the front and runs low along the back
    tri([0, H * 0.85, 0.22], [0, H + sh.dorsal, 0.14], [0, H * 0.9, 0.02], 2); tri([0, H * 0.9, 0.02], [0, H + sh.dorsal * 0.35, 0.02], [0, H * 0.7, -0.34], 2);
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
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vFin; varying float vTint; varying float vWear;
     void main(){
       vec3 p = position;
       float back = clamp((0.25 - p.z) / 1.0, 0.0, 1.0);
       #if PAT == 20
         // the sunfish sculls: dorsal and anal fins sweep together from side to side, the clavus steers
         float scull = sin(uTime * aSwim.y * 0.3 + aSwim.x);
         if (aFin > 1.5 && aFin < 2.5) p.x += scull * max(abs(p.y) - 0.28, 0.0) * 0.9;
         if (aFin > 0.5 && aFin < 1.5) p.x += scull * 0.02 * (-p.z - 0.33) * 8.0;
       #else
       p.x += (sin(uTime * aSwim.y - p.z * 4.5 + aSwim.x) * 0.17 * back * back + sin(uTime * aSwim.y + aSwim.x) * 0.02) * uWig;
       #endif
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       vL = position; vFin = aFin; vTint = aSwim.z; vWear = aSwim.x;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uBands; uniform float uEdge; uniform float uEye; uniform float uShine; uniform float uWear;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vFin; varying float vTint; varying float vWear;
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
         // a hammerhead's eyes sit at the ends of the hammer
         if (vFin > 3.5) { alb = mix(uC2, uC1, step(0.0, n.y) * 0.8 + 0.2); alb = mix(alb, vec3(0.02), 1.0 - smoothstep(0.006, 0.01, length(vec2(abs(vL.x) - 0.184, z - 0.43)))); }
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
         // whale shark: blue-grey above, white below; on the back and flanks a checkerboard of thin pale
         // lines, a white spot in each square; on the head the spots are small and crowded, with no lines
         float up = smoothstep(-0.05, 0.02, y + 0.012 * sin(z * 14.0));
         alb = mix(uC2, uC1, up);
         float head = smoothstep(0.26, 0.34, z);
         float ang = atan(y - 0.01, abs(vL.x));                       // around the body (the pattern wraps it)
         vec2 bg = vec2(z * 13.0, ang * 3.6);
         vec2 bf = fract(bg) - 0.5;
         vec2 bw = bf + 0.06 * vec2(sin(ang * 7.0 + z * 3.0), sin(z * 23.0));   // (hand-drawn, not ruled)
         float lines = max(1.0 - smoothstep(0.02, 0.05, abs(bw.x)), 1.0 - smoothstep(0.018, 0.045, abs(bw.y))) * (0.55 + 0.45 * hash2(floor(bg + 0.5)));
         float bspot = 1.0 - smoothstep(0.13, 0.2, length(bf * vec2(1.0, 1.15) + (hash2(floor(bg)) - 0.5) * 0.12));
         vec2 hg = vec2(z * 34.0, ang * 9.0) + vec2(0.5 * step(0.5, fract(ang * 4.5)), 0.0);
         float hspot = (1.0 - smoothstep(0.14, 0.26, length(fract(hg) - 0.5))) * step(0.2, hash2(floor(hg)));
         float pale = mix(max(bspot * 0.9, lines * 0.3), hspot * 0.8, head) * up * step(-0.8, z);
         alb = mix(alb, vec3(0.84, 0.86, 0.84), pale);
         if (vFin > 0.5 && vFin < 5.5) { vec2 fg = vec2(z * 26.0, y * 26.0 + vL.x * 26.0); alb = mix(uC1 * 0.95, vec3(0.84, 0.86, 0.84), (1.0 - smoothstep(0.12, 0.2, length(fract(fg) - 0.5))) * step(0.35, hash2(floor(fg))) * 0.8); }
         // five long gill slits on each flank, arching over the pectorals
         float gz = (z - 0.215) / 0.024;
         alb *= 1.0 - 0.55 * smoothstep(0.34, 0.46, abs(fract(gz) - 0.5)) * step(0.0, gz) * step(gz, 5.0) * step(abs(y + 0.012), 0.06 - 0.004 * gz) * step(0.05, abs(vL.x)) * step(vFin, 0.5);
         // the mouth: a dark gape rimmed by pale lips, right across the front of the head
         if (vFin > 5.5) { float gape = length(vec2(vL.x / 0.082, (y + 0.004) / 0.011)); alb = mix(vec3(0.04, 0.04, 0.05), mix(uC2, uC1, smoothstep(-0.01, 0.01, y)), smoothstep(0.8, 1.0, gape)); }
         // the small eyes, set at the corners of the head behind the mouth
         float we = length(vec2(y - 0.01, (z - 0.425) * 0.75));
         alb = mix(alb, uC1 * 0.55, (1.0 - smoothstep(0.007, 0.009, we)) * step(0.07, abs(vL.x)) * step(vFin, 0.5));   // (a darker rim)
         alb = mix(alb, vec3(0.03, 0.03, 0.035), (1.0 - smoothstep(0.0042, 0.0058, we)) * step(0.07, abs(vL.x)) * step(vFin, 0.5));
         // the gape seen from the side: a long line from the front back to the corner of the mouth
         alb *= 1.0 - 0.8 * (1.0 - smoothstep(0.002, 0.005, abs(y + 0.004 + (0.47 - z) * 0.06))) * step(0.418, z) * step(0.05, abs(vL.x)) * step(vFin, 0.5);
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
       #elif PAT == 21
         // tiger shark: grey-brown above with dark vertical bars and blotches on the upper flanks, white below
         alb = mix(uC2, uC1, smoothstep(-0.03, 0.03, y));
         float bars = smoothstep(0.55, 0.8, sin(z * 60.0 + vn2(vec2(z * 20.0, y * 30.0)) * 4.0) * 0.5 + 0.5) * smoothstep(0.0, 0.04, y) * step(z, 0.3);
         alb = mix(alb, uC3, bars * 0.75);
         if (vFin > 0.5) alb = uC1 * 0.9;
         if (vFin < 0.5 && y < -0.01) {
           float mz = 0.43 - 5.0 * vL.x * vL.x;
           alb *= 1.0 - 0.7 * (1.0 - smoothstep(0.002, 0.006, abs(z - mz))) * step(abs(vL.x), 0.06);
         }
       #elif PAT == 19
         // oceanic whitetip: bronze-grey above, white below; every big fin ends in a mottled white tip
         alb = mix(uC2, uC1, smoothstep(-0.03, 0.03, y));
         float tipk = vFin > 2.5 ? smoothstep(0.38, 0.44, abs(vL.x)) : vFin > 1.5 ? smoothstep(0.2, 0.24, y) : vFin > 0.5 ? max(smoothstep(0.13, 0.16, y), smoothstep(0.06, 0.08, -y)) : 0.0;
         if (vFin > 0.5) alb = uC1 * (vFin > 2.5 ? 0.95 : 1.0);   // fins are bronze-grey right to their tips
         float mott = hash2(floor(vL.zy * 90.0 + vL.x * 40.0));
         alb = mix(alb, uC3, tipk * (0.75 + 0.25 * mott));
         if (vFin < 0.5 && y < -0.01) {
           float mz = 0.39 - 9.0 * vL.x * vL.x;
           alb *= 1.0 - 0.7 * (1.0 - smoothstep(0.002, 0.005, abs(z - mz))) * step(abs(vL.x), 0.05);
         }
         float gi2 = (z - 0.21) / 0.019;
         alb *= 1.0 - 0.45 * smoothstep(0.36, 0.46, abs(fract(gi2) - 0.5)) * step(0.0, gi2) * step(gi2, 5.0) * step(abs(y + 0.005), 0.035) * step(0.02, abs(vL.x)) * step(vFin, 0.5);
       #elif PAT == 20
         // ocean sunfish: silvery grey, darker along the back, pale blotches, rough skin; fins a darker grey
         alb = mix(uC2, uC1, smoothstep(-0.2, 0.25, y));
         float bl = smoothstep(0.55, 0.8, vn2(vL.zy * 9.0 + 3.0));
         alb = mix(alb, uC2 * 1.12, bl * 0.55);
         alb *= 0.9 + 0.1 * hash2(floor(vL.zy * 160.0));
         if (vFin > 1.5 && vFin < 2.5) alb = uC1 * 0.75;
         if (vFin > 0.5 && vFin < 1.5) alb = mix(uC1 * 0.8, uC2, smoothstep(-0.36, -0.44, z));
         if (vFin > 2.5) alb = uC1 * 0.8;
         // the small beak of a mouth, and the round gill opening in front of the pectoral
         if (vFin < 0.5) {
           alb = mix(alb, vec3(0.08), (1.0 - smoothstep(0.012, 0.02, length(vec2(y + 0.02, (z - 0.49) * 0.6)))));
           alb = mix(alb, uC1 * 0.45, (1.0 - smoothstep(0.018, 0.026, length(vec2(y + 0.005, z - 0.24)))) * step(0.02, abs(vL.x)));
         }
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
       // a lived-in skin on the big ones: fine grain, uneven mottling, old pale scars (bites, coral, lines)
       // and a few darker bruises; different on every individual
       vec3 nW = n;
       if (uWear > 0.0 && vFin < 5.5) {
         float sd = fract(vWear * 7.13) * 40.0;
         vec2 q = vec2(vL.z, vL.y + vL.x * 0.6);
         float grain = hash2(floor(q * 420.0 + sd)) - 0.5;
         alb *= 1.0 + uWear * (0.1 * grain + 0.14 * (vn2(q * 7.0 + sd) - 0.5));
         // scars: here and there a short stroke, or a rake of two or three parallel ones (teeth, coral, line)
         vec2 cq = q * 8.0 + sd, ci = floor(cq);
         float scar = 0.0;
         if (hash2(ci * 1.3 + 0.7) > 0.76) {
           float a = hash2(ci + 4.1) * 6.2832; vec2 d = vec2(cos(a), sin(a)), nn = vec2(-d.y, d.x);
           vec2 pp = cq - ci - 0.5 - (vec2(hash2(ci + 1.3), hash2(ci + 2.7)) - 0.5) * 0.3;
           float along = dot(pp, d), across = dot(pp, nn) + along * along * 0.35 * (hash2(ci + 6.6) - 0.5);   // (slightly curved)
           float lines = 1.0 + floor(hash2(ci + 8.8) * 3.0), gap = 0.1;
           float k = clamp(floor(across / gap + 0.5), 0.0, lines - 1.0);
           float w = 0.022 * (0.6 + hash2(ci + 3.3));
           scar = (1.0 - smoothstep(w * 0.5, w, abs(across - k * gap))) * (1.0 - smoothstep(0.22, 0.34 + 0.1 * hash2(ci + 5.5), abs(along)));
         }
         alb = mix(alb, alb * 0.5 + vec3(0.46, 0.45, 0.43), scar * uWear * 0.55);
         float bruise = smoothstep(0.72, 0.85, vn2(q * 3.1 + sd * 0.7)) * step(vFin, 0.5);
         alb = mix(alb, alb * vec3(0.72, 0.66, 0.7), bruise * uWear * 0.5);
         // (and the grain roughens the sheen: a leathery, not glassy, skin)
         nW = normalize(n + uWear * 0.18 * vec3(hash2(floor(q * 160.0 + sd)) - 0.5, hash2(floor(q * 160.0 + sd + 9.0)) - 0.5, 0.0));
       }
       #if PAT != 9
       float eye = (1.0 - smoothstep(0.022 * uEye, 0.034 * uEye, length(vec2(y - 0.035, z - 0.34)))) * step(0.02, abs(vL.x)) * step(vFin, 0.5);
       alb = mix(alb, vec3(0.02), eye);
       #endif
       float spec = pow(max(dot(reflect(-SUN, nW), V), 0.0), 24.0 / uShine) * 0.6 * uSunI * uShine * (1.0 - 0.6 * uWear);   // silvery fish flash as they turn (a worn hide less)
       float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.3 * uAmb;
       vec3 col = absorb(alb * (lightAt(n, caveLight(vWp)) + uTint * uAmb * 0.1) * 1.3 + (spec + fres * vec3(0.7, 0.9, 1.0)) * uTint, vWp.y);
       col += absorb(vec3(0.9, 1.0, 0.9), vWp.y) * caus2(vWp) * max(n.y, 0.0) * 0.4 * alb;
       col += lamp(alb, vWp, n) * 1.2;
       gl_FragColor = vec4(fogIt(col, vWp), 1.0);
     }`,
    { defines: { PAT: sp.pat }, uniforms: { uC1: { value: c(sp.c1) }, uC2: { value: c(sp.c2 || sp.c1) }, uC3: { value: c(sp.c3 || [0, 0, 0]) }, uBands: { value: sp.bands || 3 }, uEdge: { value: sp.edge ?? 1 }, uWig: { value: sp.wig ?? 1 }, uEye: { value: sp.eye ?? 1 }, uShine: { value: sp.shine ?? 1 }, uWear: { value: sp.big ? 1 : 0 } },
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
  // a short, thick neck, mostly under the front of the shell, that runs straight into the back of the skull
  const neck = new THREE.SphereGeometry(0.5, 20, 12), np = neck.attributes.position;
  for (let i = 0; i < np.count; i++) { const x = np.getX(i), y = np.getY(i), z = np.getZ(i); np.setXYZ(i, x * 0.15 * (1 - 0.12 * (z + 0.5)) * (1 + 0.03 * Math.sin(z * 40)), y * 0.11 * (1 + 0.03 * Math.sin(z * 40)), z * 0.24); }   // (with folds)
  neck.translate(0, -0.004, 0.5);
  add(neck, 1);
  // the head: a rounded, deep skull, broadest behind the eyes, tapering to a short blunt snout (the
  // hawksbill's longer and narrower, ending in a hooked beak); the upper jaw's horny sheath closes over
  // the lower one, and the gape runs back beneath the eye
  const HL = hawk ? 0.25 : 0.21, HW = hawk ? 0.068 : 0.078, HH = 0.062, HZ = 0.55;
  const head = new THREE.SphereGeometry(0.5, 32, 22), hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const f = z + 0.5;                                                   // 0 back of the skull .. 1 tip of the snout
    x *= 2 * HW * (1 - (hawk ? 0.62 : 0.5) * Math.pow(f, hawk ? 1.9 : 2.4)) * (1 - 0.12 * Math.pow(1 - f, 3));
    y *= 2 * HH * (y > 0 ? (1 - 0.32 * Math.pow(f, 1.8)) * 0.92 : 1 - 0.28 * Math.pow(f, 1.5));
    if (y > 0) y *= 1 - 0.18 * Math.pow(Math.abs(x) / (HW + 1e-3), 2);     // (a flat crown)
    if (hawk && f > 0.78) y -= 0.024 * Math.pow((f - 0.78) / 0.22, 1.5) * (y > 0 ? 0.6 : 1);   // the hooked beak
    else if (!hawk && f > 0.85 && y < 0) y += 0.006 * (f - 0.85) / 0.15;    // (the lower jaw tucks in under the upper)
    z *= HL;
    hp.setXYZ(i, x, y, z);
  }
  head.translate(0, 0.012, HZ + HL * 0.5);
  add(head, 1);
  // the eyes: glossy dark balls under heavy lids, set to the sides a little ahead of the middle of the head
  for (const sx of [-1, 1]) {
    const ez = HZ + HL * (hawk ? 0.66 : 0.63), ef = (ez - HZ) / HL;
    const ex = HW * (1 - (hawk ? 0.62 : 0.5) * Math.pow(ef, hawk ? 1.9 : 2.4)) * 0.74;
    const eye = new THREE.SphereGeometry(0.0155, 14, 10); eye.scale(0.7, 0.9, 1.1); eye.translate(sx * ex, 0.012 + HH * 0.32, ez);
    add(eye, 3, (x, y, z) => [(x - sx * ex) / 0.0155 * sx, (z - ez) / 0.017]);
    // the upper lid: a fold of skin arching over the eye
    const lid = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42); lid.scale(0.03, 0.02, 0.04);
    lid.rotateZ(-sx * 0.5); lid.translate(sx * (ex + 0.002), 0.012 + HH * 0.32 + 0.006, ez + 0.002);
    add(lid, 1);
  }
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
  // a point on the shell (xn across -1..1, zn along -1..1), for what grows on it
  const shell = (xn: number, zn: number) => new THREE.Vector3(xn * half(zn), dome(xn, zn), Z(zn));
  return { body, front: flipper(0.56, 0.15, 0.03, 0.26, 0.024), rear: flipper(0.2, 0.13, 0.06, 0.06, 0.018), shell };
}
// Barnacles on an old turtle's shell: a few clusters of little volcano-shaped cones, mostly toward the
// back and along the margins, different on every turtle (aPart 5; aCar.x = height up the cone 0..1)
function barnacleGeo(shell: (xn: number, zn: number) => THREE.Vector3, rnd: () => number, n: number) {
  const P: number[] = [], N: number[] = [], A: number[] = [], C: number[] = [];
  const cone = new THREE.CylinderGeometry(0.35, 1, 0.75, 7, 2, true).toNonIndexed(); cone.translate(0, 0.375, 0); cone.computeVertexNormals();
  const cap = new THREE.CircleGeometry(0.35, 7).toNonIndexed(); cap.rotateX(-Math.PI / 2); cap.translate(0, 0.75, 0);
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), v = new THREE.Vector3(), nn = new THREE.Vector3();
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) { cx = (rnd() * 2 - 1) * 0.8; cz = -0.2 - rnd() * 0.7; if (rnd() < 0.3) cz = rnd() * 1.4 - 0.7; }   // a new cluster
    const xn = Math.max(-0.95, Math.min(0.95, cx + (rnd() - 0.5) * 0.25)), zn = Math.max(-0.95, Math.min(0.9, cz + (rnd() - 0.5) * 0.2));
    const p0 = shell(xn, zn), px = shell(xn + 0.01, zn), pz = shell(xn, zn + 0.01);
    const nrm = new THREE.Vector3().crossVectors(pz.clone().sub(p0), px.clone().sub(p0)).normalize(); if (nrm.y < 0) nrm.negate();
    const r = 0.013 + Math.pow(rnd(), 1.5) * 0.022;
    q.setFromUnitVectors(up, nrm); m.compose(p0.addScaledVector(nrm, -0.002), q, new THREE.Vector3(r, r * (0.8 + rnd() * 0.5), r));
    for (const [g, top] of [[cone, false], [cap, true]] as [THREE.BufferGeometry, boolean][]) {
      const gp = g.attributes.position, gn = g.attributes.normal;
      for (let k = 0; k < gp.count; k++) {
        v.set(gp.getX(k), gp.getY(k), gp.getZ(k)); const h = v.y / 0.75; v.applyMatrix4(m);
        nn.set(gn.getX(k), gn.getY(k), gn.getZ(k)).applyQuaternion(q);
        P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z); A.push(5); C.push(top ? 1.2 : h, Math.atan2(gp.getZ(k), gp.getX(k)));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); g.setAttribute('aCar', new THREE.Float32BufferAttribute(C, 2));
  return g;
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
       float gloss = 0.0;
       if (vPart > 2.5 && vPart < 3.5) {
         // the eye: a dark, wet ball; brown iris, black pupil looking out to the side
         float rr = sqrt(max(0.0, 1.0 - clamp(vCar.x, 0.0, 1.0) * clamp(vCar.x, 0.0, 1.0)));
         alb = mix(vec3(0.02, 0.018, 0.015), vec3(0.2, 0.12, 0.06) * (0.8 + 0.4 * sin(atan(vCar.y, rr) * 30.0)), smoothstep(0.3, 0.38, rr));
         alb = mix(alb, vec3(0.08, 0.07, 0.06), smoothstep(0.7, 0.8, rr));
         gloss = 1.0;
       } else if (vPart > 4.5) {
         // a barnacle: chalky ridged plates rising to a dark opening, a little green at the base
         float h = vCar.x;
         alb = vec3(0.78, 0.76, 0.69) * (0.85 + 0.15 * sin(vCar.y * 21.0)) * (0.8 + 0.25 * h);
         alb = mix(alb, vec3(0.35, 0.4, 0.22), (1.0 - smoothstep(0.0, 0.3, h)) * 0.5);
         if (h > 1.1) alb = mix(vec3(0.08, 0.07, 0.06), vec3(0.5, 0.46, 0.4), step(0.7, fract(vL.x * 400.0 + vL.z * 300.0)));
       } else if (vPart < 0.5) {
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
         // years of wear: scrapes across the scutes, the worn, paler tops of the old ones, and a fringe of
         // fine green algae along the back margin
         vec2 cq = vL.xz * 14.0 + uSeed, ci = floor(cq);
         if (hash2(ci + 0.4) > 0.72) {
           float a = hash2(ci + 3.1) * 6.2832; vec2 dd = vec2(cos(a), sin(a)); vec2 pp = cq - ci - 0.5;
           float al = dot(pp, dd), ac = dot(pp, vec2(-dd.y, dd.x));
           ac += al * al * 0.4 * (hash2(ci + 7.7) - 0.5);
           float sc = (1.0 - smoothstep(0.008, 0.022, abs(ac))) * (1.0 - smoothstep(0.3, 0.48, abs(al))) * (0.6 + 0.4 * vn2(vec2(al * 20.0, 1.0)));
           alb = mix(alb, alb * 0.7 + vec3(0.2, 0.19, 0.15), sc * 0.55);
         }
         alb = mix(alb, alb * 1.25 + 0.04, smoothstep(0.6, 0.85, vn2(vL.xz * 5.0 - uSeed)) * 0.35);
         alb = mix(alb, vec3(0.2, 0.3, 0.12), smoothstep(-0.8, -0.95, z) * smoothstep(0.4, 0.7, vn2(vL.xz * 30.0 + uSeed)) * 0.6);
       } else if (vPart < 1.5) {
         // skin: dark polygonal scales with pale edges; larger plates on the head and flipper tops
         // big plates on the head and the tops of the flippers, fine wrinkled skin on the neck
         float plates = max(step(0.56, vL.z), step(0.12, vCar.x) * step(0.0, n.y));
         float sc = vor(vec2(vL.x, vL.z) * mix(80.0, 26.0, plates) + vL.y * 14.0);
         vec3 skin = uSkin * (0.8 + 0.35 * hash2(floor(vL.xz * mix(80.0, 26.0, plates))));
         alb = mix(mix(skin * 1.4, vec3(0.62, 0.57, 0.44), 0.35), skin, smoothstep(0.012, mix(0.07, 0.04, plates), sc));
         // pale underside of neck and flippers
         alb = mix(alb, vec3(0.8, 0.74, 0.58), smoothstep(0.2, -0.6, n.y) * 0.6);
         // the head: a pale chin and throat below the gape; the horny sheath of the beak over the jaws
         float HL = uHawk > 0.5 ? 0.25 : 0.21, f = (vL.z - 0.55) / HL, yh = vL.y - 0.012;
         if (f > 0.0 && vPart < 1.5 && vCar.x == 0.0) {
           float yg = -0.014 - 0.005 * (1.0 - f) + (uHawk > 0.5 ? -0.012 * smoothstep(0.75, 1.0, f) : 0.0);
           float below = smoothstep(0.004, -0.004, yh - yg) * smoothstep(0.35, 0.55, f);
           alb = mix(alb, vec3(0.74, 0.68, 0.52) * (0.9 + 0.2 * hash2(floor(vL.xz * 90.0))), below * 0.85);
           float sheath = smoothstep(0.76, 0.84, f);
           alb = mix(alb, mix(vec3(0.3, 0.26, 0.19), vec3(0.52, 0.46, 0.34), below) * (0.85 + 0.3 * vn2(vL.xy * 120.0)), sheath);
           float gape = (1.0 - smoothstep(0.0008, 0.0022, abs(yh - yg))) * smoothstep(0.5, 0.62, f);
           alb = mix(alb, vec3(0.06, 0.05, 0.04), gape * 0.75);
           // the nostrils, small, high on the snout
           alb = mix(alb, vec3(0.08), 0.8 * (1.0 - smoothstep(0.0012, 0.0022, length(vec2(abs(vL.x) - 0.008, yh - 0.022 + 0.03 * (f - 0.92))))) * smoothstep(0.9, 0.93, f));
         }
         // the claw on each fore flipper's leading edge
         alb = mix(alb, vec3(0.1, 0.08, 0.06), (1.0 - smoothstep(0.012, 0.02, length(vec2(vCar.x - 0.35, 0.0)) + abs(vL.z + 0.04) * 0.5)) * step(0.01, vCar.x));
       } else {
         // plastron: creamy yellow with faint seams; the underside of the marginal scutes around it
         float sm = min(abs(fract(vCar.y * 2.3 + 0.2) - 0.5), abs(abs(vCar.x) - 0.3));
         alb = mix(vec3(0.62, 0.56, 0.4), vec3(0.8, 0.74, 0.55), smoothstep(0.0, 0.04, sm));
         alb = mix(alb, mix(uC1, vec3(0.7, 0.64, 0.46), 0.5), smoothstep(0.72, 0.8, abs(vCar.x)));
         // and a life's wear underneath: rubbed and scratched from resting on rock, stained in places
         alb *= 0.82 + 0.3 * vn2(vL.xz * 6.0 + uSeed);
         alb = mix(alb, vec3(0.5, 0.45, 0.33), smoothstep(0.62, 0.8, vn2(vL.xz * 11.0 - uSeed)) * 0.3);
         float scr = 1.0 - smoothstep(0.0, 0.01, abs(fract(dot(vL.xz, vec2(0.8, 0.6)) * 40.0 + vn2(vL.xz * 8.0) * 3.0) - 0.5) - 0.47);
         alb = mix(alb, alb * 0.75, scr * smoothstep(0.5, 0.7, vn2(vL.xz * 4.0 + uSeed)) * 0.6);
       }
       vec3 col = shade(alb, vWp, n, 0.6);
       col += gloss * absorb(vec3(0.9, 0.95, 1.0), vWp.y) * (pow(max(dot(reflect(-SUN, n), V), 0.0), 60.0) * uSunI * 0.9 + pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12 * uAmb);   // (a wet eye catches the light)
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { ...SURF_UNIFORMS, uC1: { value: c(s.c1) }, uC2: { value: c(s.c2) }, uRay: { value: c(s.ray) }, uDark: { value: c(s.dark) }, uSkin: { value: c(s.skin) }, uHawk: { value: s.hawk }, uSeed: { value: Math.random() * 40 } }, opts: { side: THREE.DoubleSide } });
}
export function makeTurtle(style) {
  const m = turtleMaterial(style), g = new THREE.Group(), G = TURTLE_GEOS[style];
  g.add(new THREE.Mesh(G.body, m));
  // (every turtle carries its own few barnacles: some almost none, the old ones a crust of them)
  const rnd = mulberry32((Math.random() * 1e9) | 0), nb = Math.floor(Math.pow(rnd(), 1.6) * 26) + 3;
  g.add(new THREE.Mesh(barnacleGeo(G.shell, rnd, nb), m));
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
