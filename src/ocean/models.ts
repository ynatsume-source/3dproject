// Procedural models: corals, fish (per-species body plans and colour patterns), turtles and mantas.
import * as THREE from 'three';
import { mat } from '../render/common';
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
  branch: [branchCoralGeo(3, 'stag'), branchCoralGeo(8, 'bush')],
  table: [tableCoralGeo()], brain: [brainCoralGeo()], fan: [fanCoralGeo(5), fanCoralGeo(9)],
  mushroom: [mushroomGeo()], anemone: [anemoneGeo(4)], clam: [clamGeo()], eel: [eelGeo()],
};
export const KIND_ID = { branch: 0, table: 1, brain: 2, fan: 3, mushroom: 4, anemone: 5, clam: 6, eel: 7 };
export const PALETTE = {
  branch: [[[0.62, 0.50, 0.36], [0.88, 0.82, 0.72]], [[0.44, 0.47, 0.40], [0.45, 0.62, 0.88]], [[0.55, 0.38, 0.55], [0.88, 0.66, 0.86]], [[0.40, 0.50, 0.30], [0.72, 0.88, 0.55]], [[0.74, 0.70, 0.58], [0.96, 0.86, 0.76]]],
  table: [[[0.52, 0.45, 0.32], [0.78, 0.72, 0.56]], [[0.40, 0.48, 0.40], [0.62, 0.76, 0.66]], [[0.55, 0.42, 0.40], [0.82, 0.64, 0.62]], [[0.45, 0.50, 0.55], [0.66, 0.74, 0.88]]],
  brain: [[[0.66, 0.55, 0.30], [0.40, 0.34, 0.22]], [[0.48, 0.58, 0.36], [0.30, 0.38, 0.25]], [[0.60, 0.46, 0.50], [0.40, 0.30, 0.36]], [[0.56, 0.54, 0.70], [0.36, 0.34, 0.48]]],
  fan: [[[0.78, 0.20, 0.16], [0.5, 0.1, 0.1]], [[0.88, 0.46, 0.16], [0.5, 0.2, 0.1]], [[0.58, 0.24, 0.58], [0.3, 0.1, 0.3]], [[0.88, 0.74, 0.30], [0.5, 0.4, 0.2]]],
  mushroom: [[[0.84, 0.80, 0.56], [0.76, 0.72, 0.58]], [[0.64, 0.74, 0.50], [0.70, 0.72, 0.60]], [[0.86, 0.72, 0.64], [0.78, 0.70, 0.62]]],
  anemone: [[[0.76, 0.68, 0.46], [0.78, 0.18, 0.44]], [[0.64, 0.72, 0.46], [0.56, 0.50, 0.58]], [[0.80, 0.72, 0.52], [0.86, 0.36, 0.30]]],
  clam: [[[0.12, 0.42, 0.88], [0.62, 0.60, 0.54]], [[0.20, 0.72, 0.62], [0.62, 0.60, 0.54]], [[0.46, 0.28, 0.78], [0.62, 0.60, 0.54]], [[0.40, 0.62, 0.30], [0.62, 0.60, 0.54]]],
  eel: [[[0.86, 0.86, 0.80], [0.1, 0.1, 0.1]]],
};

export function coralMaterial(kind) {
  const K = KIND_ID[kind];
  return mat(
    `attribute float aTip; attribute vec3 aCol; attribute vec3 aCol2; attribute float aSeed;
     varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vTip; varying vec3 vCol; varying vec3 vCol2; varying float vSeed;
     void main(){
       vec3 p = position;
       vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float t = uTime;
       #if KIND == 3
         p.z += sin(t * 0.8 + aSeed * 6.283 + ip.x * 0.1) * 0.07 * aTip * aTip;
       #elif KIND == 4
         p.x += sin(t * 0.7 + aSeed * 6.283) * 0.025 * aTip;
       #elif KIND == 5
         float ph = t * 1.4 + aSeed * 6.283 + position.x * 9.0 + position.z * 7.0;
         p.x += sin(ph) * 0.05 * aTip * aTip; p.z += cos(ph * 0.8) * 0.05 * aTip * aTip;
       #elif KIND == 7
         float k = smoothstep(3.5, 8.5, distance(ip, uCamPos));
         p.y *= k;
         p.x += sin(t * 1.2 + aSeed * 6.283) * 0.07 * p.y * p.y;
         p.z += p.y * p.y * p.y * 0.3 * k;
       #endif
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       vL = position; vTip = aTip; vCol = aCol; vCol2 = aCol2; vSeed = aSeed;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vTip; varying vec3 vCol; varying vec3 vCol2; varying float vSeed;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp);
       if (dot(n, V) < 0.0) n = -n;
       float g = hash2(floor(vL.xz * 40.0 + vL.y * 30.0));
       vec3 alb;
       #if KIND == 0
         alb = mix(vCol, vCol2, smoothstep(0.55, 1.0, vTip)) * (0.88 + 0.22 * g);
       #elif KIND == 1
         float ang = atan(vL.z, vL.x);
         alb = mix(vCol, vCol2, smoothstep(0.72, 1.0, vTip)) * (0.88 + 0.12 * sin(ang * 90.0 + vTip * 24.0)) * (0.9 + 0.15 * g);
       #elif KIND == 2
         float m = abs(sin(dot(vL.xz, vec2(19.0, 11.0)) + sin(vL.x * 8.0 + vSeed * 6.0) * 2.2 + sin(vL.z * 9.0) * 2.2 + vL.y * 6.0));
         alb = mix(vCol2, vCol, smoothstep(0.15, 0.5, m)) * (0.92 + 0.12 * g);
       #elif KIND == 3
         alb = mix(vCol2, vCol, smoothstep(0.0, 0.3, vTip)) * (0.85 + 0.25 * g);
       #elif KIND == 4
         alb = mix(vCol2, vCol * (0.85 + 0.3 * hash2(floor(vL.xz * 70.0))), vTip);
       #elif KIND == 5
         alb = mix(vCol2, vCol, smoothstep(0.05, 0.2, vTip)) * (0.85 + 0.35 * smoothstep(0.85, 1.0, vTip));
       #elif KIND == 6
         float spots = step(0.78, hash2(floor(vL.xz * 60.0)));
         alb = mix(vCol2 * (0.85 + 0.2 * g), vCol * (0.75 + 0.6 * spots), vTip);
       #else
         float sp = step(0.7, hash2(floor(vec2(atan(vL.z, vL.x) * 2.0, vL.y * 45.0))));
         alb = mix(vCol, vCol2, sp * 0.9);
       #endif
       gl_FragColor = vec4(shade(alb, vWp, n, 0.8), 1.0);
     }`,
    { defines: { KIND: K }, opts: { side: (kind === 'fan' || kind === 'anemone' || kind === 'eel') ? THREE.DoubleSide : THREE.FrontSide } });
}
export const CORAL_MAT = {};
for (const k of Object.keys(KIND_ID)) CORAL_MAT[k] = coralMaterial(k);

/* ---------- fish ---------- */
export const SHAPES = {
  slender: { h: 0.34, w: 0.18, tail: 'fork', dorsal: 0.12, anal: 0.08 },
  clown: { h: 0.44, w: 0.22, tail: 'round', dorsal: 0.12, anal: 0.1 },
  oval: { h: 0.56, w: 0.16, tail: 'fork', dorsal: 0.08, anal: 0.07 },
  disc: { h: 0.74, w: 0.12, tail: 'trunc', dorsal: 0.08, anal: 0.06 },
  idol: { h: 0.8, w: 0.12, tail: 'fork', dorsal: 0.08, anal: 0.25, filament: 0.9 },
  wrasse: { h: 0.42, w: 0.26, tail: 'round', dorsal: 0.08, anal: 0.06, hump: 0.12 },
  parrot: { h: 0.42, w: 0.24, tail: 'trunc', dorsal: 0.07, anal: 0.05 },
  shark: { h: 0.22, w: 0.2, tail: 'shark', dorsal: 0.2, anal: 0.04, pect: 0.3, pointy: true },
  whale: { h: 0.24, w: 0.3, tail: 'shark', dorsal: 0.16, anal: 0.04, pect: 0.3, flathead: true },
};
export function fishGeometry(sh) {
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
  else { tri([0, H * 0.85, 0.16], [0, H + sh.dorsal, -0.12], [0, H * 0.7, -0.3], 2); }
  tri([0, -H * 0.8, -0.05], [0, -H - sh.anal, -0.22], [0, -H * 0.6, -0.32], 2);
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
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uBands; uniform float uEdge;
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
         float bar = abs(fract(z * 4.2 + 0.1) - 0.5);
         alb = mix(alb, uC3, (1.0 - smoothstep(0.1, 0.15, bar)) * step(-0.45, z) * step(z, 0.35) * smoothstep(-0.14, 0.0, y));
       #elif PAT == 7
         alb = uC1 * (0.9 + 0.12 * sin(z * 80.0) * sin(y * 80.0));
         alb = mix(alb, uC2, step(0.8, sin(z * 70.0 + sin(y * 40.0) * 1.5)) * step(0.1, z));
       #elif PAT == 8
         alb = mix(uC2, uC1, top);
         if (vFin > 0.5) alb = mix(uC1, uC3, smoothstep(0.2, 0.3, max(length(vL.xy), -z - 0.55)));
       #elif PAT == 9
         alb = mix(uC2, uC1, top);
         vec2 g = vec2(z * 26.0, y * 26.0 + sin(z * 20.0) * 0.3); vec2 gf = fract(g) - 0.5;
         float spot = (1.0 - smoothstep(0.14, 0.24, length(gf))) * step(0.25, hash2(floor(g)));
         float line = 1.0 - smoothstep(0.02, 0.06, abs(fract(z * 9.0) - 0.5));
         alb = mix(alb, vec3(0.88, 0.9, 0.88), max(spot, line * 0.5 * step(0.0, z)) * top);
       #else
         alb = uC1; vec2 sc = fract(vec2(z * 30.0, y * 30.0 + z * 15.0));
         alb = mix(alb, uC2, smoothstep(0.35, 0.5, max(abs(sc.x - 0.5), abs(sc.y - 0.5))) * 0.6);
         if (vFin > 0.5) alb = mix(uC1, uC2, 0.5);
       #endif
       alb *= vTint;
       #if PAT != 9
       float eye = (1.0 - smoothstep(0.022, 0.034, length(vec2(y - 0.035, z - 0.34)))) * step(0.02, abs(vL.x)) * step(vFin, 0.5);
       alb = mix(alb, vec3(0.02), eye);
       #endif
       float spec = pow(max(dot(reflect(-SUN, n), V), 0.0), 24.0) * 0.6 * uSunI;
       float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.3 * uAmb;
       vec3 col = absorb(alb * (lightAt(n) + uTint * uAmb * 0.1) * 1.3 + (spec + fres * vec3(0.7, 0.9, 1.0)) * uTint, vWp.y);
       col += absorb(vec3(0.9, 1.0, 0.9), vWp.y) * caus2(vWp) * max(n.y, 0.0) * 0.4 * alb;
       col += lamp(alb, vWp, n) * 1.2;
       gl_FragColor = vec4(fogIt(col, vWp), 1.0);
     }`,
    { defines: { PAT: sp.pat }, uniforms: { uC1: { value: c(sp.c1) }, uC2: { value: c(sp.c2 || sp.c1) }, uC3: { value: c(sp.c3 || [0, 0, 0]) }, uBands: { value: sp.bands || 3 }, uEdge: { value: sp.edge ?? 1 }, uWig: { value: sp.wig ?? 1 } },
      opts: { side: THREE.DoubleSide } });
}

/* ---------- turtles ---------- */
export const TURTLE_STYLE = { green: { c1: [0.42, 0.36, 0.22], c2: [0.32, 0.30, 0.24], mottle: 0.25 }, hawksbill: { c1: [0.55, 0.36, 0.16], c2: [0.30, 0.26, 0.20], mottle: 0.6 } };
export function turtleMaterial(style) {
  const s = TURTLE_STYLE[style];
  return mat(
    `attribute float aPart; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart;
     void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vL = position; vPart = aPart; gl_Position = projectionMatrix * viewMatrix * w; }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform float uMottle; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       vec3 alb;
       if (vPart < 0.5) {
         float e = vor(vL.xz * vec2(4.2, 3.4) + 3.0);
         float streak = sin(atan(vL.z, vL.x) * 14.0 + length(vL.xz) * 20.0) * 0.5 + 0.5;
         alb = uC1 * (0.8 + 0.3 * hash2(floor(vL.xz * 9.0))) * mix(1.0, 0.6 + 0.8 * streak, uMottle);
         alb = mix(alb * 0.45, alb, smoothstep(0.02, 0.09, e));
         if (vL.y < -0.02) alb = vec3(0.82, 0.76, 0.56);
       } else {
         float e = vor(vL.xz * 26.0 + vL.y * 10.0);
         alb = mix(vec3(0.85, 0.82, 0.70), uC2, smoothstep(0.02, 0.1, e));
       }
       gl_FragColor = vec4(shade(alb, vWp, n, 0.6), 1.0);
     }`,
    { uniforms: { uC1: { value: new THREE.Color(...s.c1) }, uC2: { value: new THREE.Color(...s.c2) }, uMottle: { value: s.mottle } }, opts: { side: THREE.DoubleSide } });
}
export function partGeo(geo, m, part) { const acc = Acc(); pushGeo(acc, geo, m, null, part); return accGeo(acc, 'aPart'); }
export const TURTLE_GEO = (() => {
  const shell = new THREE.SphereGeometry(0.5, 26, 14);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 0.78, y * (y < 0 ? 0.1 : 0.28), z * (z > 0 ? 1.0 : 1.08)); }
  shell.computeVertexNormals();
  const acc = Acc();
  pushGeo(acc, shell, new THREE.Matrix4(), null, 0);
  pushGeo(acc, new THREE.SphereGeometry(0.12, 14, 10), new THREE.Matrix4().compose(new THREE.Vector3(0, 0.0, 0.6), new THREE.Quaternion(), new THREE.Vector3(0.85, 0.72, 1.25)), null, 1);
  const body = accGeo(acc, 'aPart');
  const front = partGeo(new THREE.SphereGeometry(0.5, 12, 6), new THREE.Matrix4().compose(new THREE.Vector3(0.28, 0, -0.04), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.35, 0)), new THREE.Vector3(0.62, 0.05, 0.2)), 1);
  const rear = partGeo(new THREE.SphereGeometry(0.5, 10, 6), new THREE.Matrix4().compose(new THREE.Vector3(0.12, 0, -0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.4, 0)), new THREE.Vector3(0.28, 0.05, 0.16)), 1);
  return { body, front, rear };
})();
export function makeTurtle(style) {
  const m = turtleMaterial(style), g = new THREE.Group();
  g.add(new THREE.Mesh(TURTLE_GEO.body, m));
  const mk = (geo, x, z, mirror) => { const f = new THREE.Mesh(geo, m); f.position.set(x, -0.03, z); if (mirror) f.scale.x = -1; g.add(f); return f; };
  const fr = mk(TURTLE_GEO.front, 0.3, 0.28, false), fl = mk(TURTLE_GEO.front, -0.3, 0.28, true);
  const br = mk(TURTLE_GEO.rear, 0.24, -0.42, false), bl = mk(TURTLE_GEO.rear, -0.24, -0.42, true);
  g.traverse((o) => { o.frustumCulled = false; });
  return { group: g, fr, fl, br, bl, pos: new THREE.Vector3(), vel: new THREE.Vector3(), head: 0, t: Math.random() * 100, alt: 2, size: 1, ascend: 0 };
}

/* ---------- manta ---------- */
export const MANTA_GEO = (() => {
  const SN = 30, CN = 10, pos = [], side = [], uu = [], idx = [];
  const zF = (u) => 0.55 - 0.8 * Math.pow(Math.abs(u), 1.25), zB = (u) => -0.6 + 0.35 * Math.pow(Math.abs(u), 1.5);
  for (const s of [1, -1]) {
    const start = pos.length / 3;
    for (let i = 0; i <= SN; i++) for (let j = 0; j <= CN; j++) {
      const u = -1 + 2 * i / SN, v = j / CN, z = zF(u) + (zB(u) - zF(u)) * v;
      const th = 0.09 * Math.pow(1 - u * u, 0.8) * Math.pow(Math.sin(Math.PI * v), 0.7);
      pos.push(u, s > 0 ? th : -th * 0.6, z); side.push(s); uu.push(u);
    }
    for (let i = 0; i < SN; i++) for (let j = 0; j < CN; j++) {
      const a = start + i * (CN + 1) + j, b = a + CN + 1;
      if (s > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const quad = (pts, s) => { const st = pos.length / 3; for (const p of pts) { pos.push(...p); side.push(s); uu.push(0); } idx.push(st, st + 1, st + 2, st + 2, st + 1, st + 3); };
  for (const sx of [-1, 1]) quad([[sx * 0.1, 0.01, 0.5], [sx * 0.17, 0.01, 0.5], [sx * 0.1, -0.05, 0.72], [sx * 0.15, -0.07, 0.7]], 1);
  quad([[-0.012, 0, -0.52], [0.012, 0, -0.52], [-0.004, 0.01, -1.15], [0.004, 0.01, -1.15]], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1));
  g.setIndex(idx);
  return g;
})();
export function mantaMaterial() {
  return mat(
    `attribute float aSide; attribute float aU; uniform float uPhase; varying vec3 vWp; varying vec3 vL; varying float vSide;
     void main(){
       vec3 p = position; float au = abs(aU);
       p.y += sin(uTime * 1.05 + uPhase - au * 1.7) * 0.34 * pow(au, 1.6);
       p.z += cos(uTime * 1.05 + uPhase - au * 1.7) * 0.04 * au;
       vec4 w = modelMatrix * vec4(p, 1.0); vWp = w.xyz; vL = position; vSide = aSide;
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    `varying vec3 vWp; varying vec3 vL; varying float vSide;
     void main(){
       vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp))); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       vec3 alb;
       if (vSide > 0.0) {
         alb = vec3(0.05, 0.06, 0.07);
         float sh = (1.0 - smoothstep(0.1, 0.16, abs(abs(vL.x) - 0.3))) * smoothstep(0.02, 0.1, vL.z) * (1.0 - smoothstep(0.26, 0.36, vL.z + abs(vL.x) * 0.3));
         alb = mix(alb, vec3(0.78, 0.8, 0.78), sh * 0.85);
       } else {
         alb = vec3(0.9, 0.91, 0.88);
         alb = mix(alb, vec3(0.12), smoothstep(0.75, 0.95, abs(vL.x)) + step(0.9, hash2(floor(vL.xz * 14.0))) * step(abs(vL.x), 0.5) * 0.8);
         alb = mix(alb, vec3(0.1), smoothstep(0.42, 0.5, vL.z) * step(abs(vL.x), 0.14));
       }
       gl_FragColor = vec4(shade(alb, vWp, n, 0.4), 1.0);
     }`,
    { uniforms: { uPhase: { value: Math.random() * 6 } }, opts: { side: THREE.DoubleSide } });
}

