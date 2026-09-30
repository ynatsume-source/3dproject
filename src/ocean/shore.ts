// Ashore, where a sea has real land (ocean/land.ts): the forest canopy as a surface draped with the
// aerial photograph (bumpy with tree crowns, ragged where the photo's canopy ends), and the plants of a
// Yaeyama beach, placed where the photograph shows them: casuarina (モクマオウ) and screw pine (アダン)
// along the forest edge, beach naupaka (クサトベラ) and tree heliotrope (モンパノキ) on the upper beach.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURF_UNIFORMS } from '../render/surface';
import { hash, smooth, R, rr } from '../core/math';
import { WORLD } from './scenery';
import { landOf, sample, type Land } from './land';

// lighting in the open air: sun (reddened low down), moon and sky; the photo already carries the
// look of the place, this only turns it with the time of day
export const AIRLIT = /* glsl */ `
vec3 airLit(vec3 alb, vec3 n, vec3 wp, float trans){
  float nl = dot(n, uAirSun);
  vec3 sun = sunAirCol() * (max(nl, 0.0) + trans * max(-nl, 0.0) * 0.6) * (1.0 - 0.7 * uCloud);
  vec3 moon = vec3(0.5, 0.55, 0.65) * max(dot(n, uAirMoon), 0.0) * uMoonI * 0.4;
  vec3 sky = skyAir(vec3(0.0, 1.0, 0.0), -1.0);
  sky = mix(vec3(dot(sky, vec3(0.3, 0.5, 0.2))), sky, 0.35) * (0.55 + 0.3 * n.y) + vec3(0.02, 0.025, 0.03);   // skylight, only faintly blue
  return alb * (sun * 0.8 + moon + sky * 0.55) + lamp(alb, wp, n);
}
`;

// the floor shader's view of the land: photo, cover, and how to light what is above the water
export function landUniforms(L: Land) {
  return { tPhoto: { value: L.photo }, tCover: { value: L.cover }, uLandHalf: { value: L.half } };
}
export const LAND_FLOOR = /* glsl */ `
uniform sampler2D tPhoto; uniform sampler2D tCover; uniform float uLandHalf;
${AIRLIT}
// albedo of dry land at wp: the aerial photograph, with grain from the sand texture close up
// (the photo is half a metre a pixel), leaf litter under trees, and dark wet sand at the water's edge
vec3 landAlbedo(vec3 wp){
  vec2 uv = (wp.xz + uLandHalf) / (2.0 * uLandHalf);
  vec3 ph = texture2D(tPhoto, uv).rgb;
  vec4 cv = texture2D(tCover, uv);
  float g = dot(texture2D(tSandC, wp.xz * 0.35).rgb, vec3(0.333)) / 0.6;
  vec3 a = ph * mix(1.0, g, 0.55 * cv.g + 0.25);
  a *= mix(1.0, 0.75 + 0.45 * vn2(wp.xz * 1.9), cv.r * 0.8 + cv.b * 0.5);
  float wet = 1.0 - smoothstep(0.02, 0.5, wp.y);
  return mix(a, a * vec3(0.66, 0.7, 0.74), wet * 0.85);
}
`;

// tree crowns: domes about 2.5 m across on a jittered 3.5 m grid
function crowns(x: number, z: number) {
  const C = 3.5, ci = Math.floor(x / C), cj = Math.floor(z / C);
  let b = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ii = ci + i, jj = cj + j;
    const cx = (ii + hash(ii, jj)) * C, cz = (jj + hash(ii + 71, jj - 13)) * C, r = 1.6 + hash(ii - 5, jj + 9) * 1.4;
    const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r);
    if (d2 < 1) b = Math.max(b, Math.sqrt(1 - d2) * (0.7 + 0.6 * hash(ii + 3, jj + 3)));
  }
  return b;
}

export function buildShore(loc: any, group: THREE.Group, obst: { raise(x: number, z: number, top: number): void }) {
  const L = landOf(loc.id)!;
  const f = loc.f as (x: number, z: number) => number;
  const can = (x: number, z: number) => sample(L, L.canopy, x, z) / 255;
  const sand = (x: number, z: number) => sample(L, L.sand, x, z) / 255;
  // how deep into the forest: canopy averaged over a wide ring (edges are low, the middle is tall)
  const inner = (x: number, z: number) => {
    let s = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; s += can(x + Math.cos(a) * 9, z + Math.sin(a) * 9); }
    return s / 8;
  };

  /* ---------- the canopy ---------- */
  const S = 1.5, E = WORLD, N = Math.round(2 * E / S) + 1;
  const pos = new Float32Array(N * N * 3), aC = new Float32Array(N * N);
  const top = (x: number, z: number) => {
    const c = can(x, z);
    if (c < 0.08) return { y: f(x, z) - 0.3, c };
    const tall = 2.2 + 4.8 * smooth(0.2, 0.85, inner(x, z));
    return { y: f(x, z) + (tall + 1.3 * crowns(x, z)) * smooth(0.08, 0.5, c), c };
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -E + i * S, z = -E + j * S, k = j * N + i;
    const t = top(x, z);
    pos[k * 3] = x; pos[k * 3 + 1] = t.y; pos[k * 3 + 2] = z; aC[k] = t.c;
  }
  const idx: number[] = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    if (Math.max(aC[a], aC[b], aC[c], aC[d]) < 0.12) continue;
    idx.push(a, c, b, b, c, d);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cg.setAttribute('aC', new THREE.BufferAttribute(aC, 1));
  cg.setIndex(idx); cg.computeVertexNormals();
  const canopy = new THREE.Mesh(cg, mat(
    `attribute float aC; varying vec3 vWp; varying vec3 vN; varying float vC;
     void main(){ vec3 p = position; float w = smoothstep(1.0, 6.0, p.y);
       p.xz += vec2(sin(uTime * 0.9 + p.x * 0.3 + p.z * 0.2), cos(uTime * 0.7 + p.z * 0.3)) * 0.06 * w * (0.4 + uWave);
       vWp = p; vN = normal; vC = aC; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    `uniform sampler2D tPhoto; uniform sampler2D tCover; uniform float uLandHalf; uniform sampler2D tSandC;
     ${AIRLIT}
     varying vec3 vWp; varying vec3 vN; varying float vC;
     void main(){
       vec2 uv = (vWp.xz + uLandHalf) / (2.0 * uLandHalf);
       float c = texture2D(tCover, uv).r;
       float nz = vn2(vWp.xz * 0.9) * 0.6 + vn2(vWp.xz * 3.1 + 7.0) * 0.4;
       if (c < 0.3 + 0.3 * nz) discard;                              // ragged where the forest ends
       vec3 n = normalize(vN);
       // leafy texture: clumps of light and shade at the scale of branches
       float leaf = vn2(vWp.xz * 4.3 + vWp.y * 2.0) * 0.5 + vn2(vWp.xz * 11.0 - vWp.y * 3.0) * 0.5;
       n = normalize(n + vec3(leaf - 0.5, 0.0, vn2(vWp.zx * 4.1) - 0.5) * 0.9);
       vec3 ph = texture2D(tPhoto, uv).rgb;
       vec3 alb = ph * (0.72 + 0.5 * leaf) * mix(0.55, 1.0, smoothstep(-0.3, 0.8, n.y));   // the sides of the forest are in shade
       gl_FragColor = vec4(fogIt(airLit(alb, n, vWp, 0.5), vWp), 1.0);
     }`,
    { uniforms: { ...landUniforms(L), tSandC: SURF_UNIFORMS.tSandC }, opts: { side: THREE.DoubleSide } }));
  canopy.frustumCulled = false;
  group.add(canopy);
  // the drone and birds keep above the treetops
  for (let z = -E; z < E; z += 1) for (let x = -E; x < E; x += 1) {
    if (can(x, z) < 0.3) continue;
    obst.raise(x, z, top(x, z).y + 0.5);
  }

  /* ---------- plants of the beach and the forest edge ---------- */
  type Spot = { x: number; z: number; y: number; s: number; ry: number };
  const lists: Record<string, Spot[]> = { casuarina: [], pandanus: [], naupaka: [], heliotrope: [] };
  const far = (list: Spot[], x: number, z: number, d: number) => list.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d);
  const near = (fn: (x: number, z: number) => number, x: number, z: number, r: number) => {
    let m = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; m = Math.max(m, fn(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m;
  };
  for (let t = 0; t < 90000; t++) {
    const x = rr(-E + 4, E - 4), z = rr(-E + 4, E - 4), y = f(x, z);
    if (y < 0.5) continue;
    const c = can(x, z), sd = sand(x, z);
    if (c > 0.35 && c < 0.9 && near(sand, x, z, 7) > 0.5 && lists.casuarina.length < 170 && far(lists.casuarina, x, z, 6)) lists.casuarina.push({ x, z, y, s: rr(7, 12), ry: R() * 6.28 });
    else if (c > 0.15 && c < 0.7 && near(sand, x, z, 4) > 0.4 && lists.pandanus.length < 260 && far(lists.pandanus, x, z, 4.2)) lists.pandanus.push({ x, z, y, s: rr(2.6, 4.2), ry: R() * 6.28 });
    else if (sd > 0.35 && c < 0.3 && near(can, x, z, 4) > 0.4 && y > 0.9 && lists.naupaka.length < 320 && far(lists.naupaka, x, z, 2.0)) lists.naupaka.push({ x, z, y, s: rr(1.4, 2.4), ry: R() * 6.28 });
    else if (sd > 0.6 && c < 0.1 && near(can, x, z, 10) > 0.3 && y > 1.1 && lists.heliotrope.length < 70 && far(lists.heliotrope, x, z, 6)) lists.heliotrope.push({ x, z, y, s: rr(2.4, 4), ry: R() * 6.28 });
  }
  const geos: Record<string, THREE.BufferGeometry> = { casuarina: casuarinaGeo(), pandanus: pandanusGeo(), naupaka: shrubGeo(false), heliotrope: shrubGeo(true) };
  const plantMat = mat(
    `attribute vec3 aTint; attribute float aSway; varying vec3 vWp; varying vec3 vN; varying vec3 vCol;
     void main(){
       vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
       float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
       w.xz += vec2(sin(uTime * 1.3 + ph), cos(uTime * 1.1 + ph * 1.7)) * aSway * (0.05 + 0.1 * uWave);
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       vCol = aTint * (0.85 + 0.3 * fract(sin(ph * 12.9) * 43758.5));
       gl_Position = projectionMatrix * viewMatrix * w; }`,
    `${AIRLIT}
     varying vec3 vWp; varying vec3 vN; varying vec3 vCol;
     void main(){
       vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
       n = normalize(n + vec3(0.0, 0.35, 0.0));
       gl_FragColor = vec4(fogIt(airLit(vCol, n, vWp, 0.7), vWp), 1.0);
     }`, { opts: { side: THREE.DoubleSide } });
  const e = new THREE.Euler(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  let count = 0;
  for (const kind in lists) {
    const list = lists[kind]; if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geos[kind], plantMat, list.length);
    list.forEach((it, i) => {
      q.setFromEuler(e.set((R() - 0.5) * 0.12, it.ry, (R() - 0.5) * 0.12));
      mesh.setMatrixAt(i, m4.compose(p3.set(it.x, it.y - 0.1, it.z), q, s3.set(it.s * rr(0.85, 1.15), it.s, it.s * rr(0.85, 1.15))));
    });
    mesh.frustumCulled = false;
    group.add(mesh); count += list.length;
  }
  return { canopy, plants: count, lists };
}

/* ---------- plant geometry (unit height; colours and sway per vertex) ---------- */
class Builder {
  p: number[] = []; n: number[] = []; c: number[] = []; w: number[] = []; i: number[] = [];
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, nrm: THREE.Vector3, col: number[], sway: number[]) {
    const o = this.p.length / 3;
    for (const [v, s] of [[a, sway[0]], [b, sway[1]], [c, sway[2]], [d, sway[3]]] as [THREE.Vector3, number][]) {
      this.p.push(v.x, v.y, v.z); this.n.push(nrm.x, nrm.y, nrm.z); this.c.push(col[0], col[1], col[2]); this.w.push(s);
    }
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  // a tapered tube from a to b
  tube(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: number[], sw0 = 0, sw1 = 0, seg = 5) {
    const ax = new THREE.Vector3().subVectors(b, a).normalize();
    const u = new THREE.Vector3(1, 0, 0); if (Math.abs(ax.x) > 0.9) u.set(0, 0, 1);
    const v1 = new THREE.Vector3().crossVectors(ax, u).normalize(), v2 = new THREE.Vector3().crossVectors(ax, v1);
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const d0 = v1.clone().multiplyScalar(Math.cos(a0)).addScaledVector(v2, Math.sin(a0)), d1 = v1.clone().multiplyScalar(Math.cos(a1)).addScaledVector(v2, Math.sin(a1));
      const nm = d0.clone().add(d1).normalize();
      this.quad(a.clone().addScaledVector(d0, r0), a.clone().addScaledVector(d1, r0), b.clone().addScaledVector(d1, r1), b.clone().addScaledVector(d0, r1), nm, col, [sw0, sw0, sw1, sw1]);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.i);
    return g;
  }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const jit = (c: number[], k: number) => { const t = 1 + (R() - 0.5) * k; return [c[0] * t, c[1] * t * (1 + (R() - 0.5) * k * 0.4), c[2] * t]; };

// モクマオウ: a tall, thin, often leaning trunk; sparse tiers of drooping, needle-like grey-green twigs
function casuarinaGeo() {
  const B = new Builder(), bark = [0.32, 0.27, 0.22];
  const lean = V(0.08, 1, 0.03).normalize();
  const trunkTop = lean.clone().multiplyScalar(0.9);
  B.tube(V(0, 0, 0), trunkTop, 0.022, 0.008, bark, 0, 0.3, 6);
  for (let t = 0; t < 9; t++) {
    const h = 0.28 + t * 0.075 + R() * 0.05, a = R() * 6.28, len = 0.1 + (1 - t / 9) * 0.16;
    const base = lean.clone().multiplyScalar(h), tip = base.clone().add(V(Math.cos(a) * len, 0.04, Math.sin(a) * len));
    B.tube(base, tip, 0.006, 0.003, bark, h * 0.3, h * 0.5, 4);
    // a clump of hanging twigs round the branch
    for (let k = 0; k < 70; k++) {
      const f = R(), c = base.clone().lerp(tip, 0.15 + f * 0.85).add(V((R() - 0.5) * 0.12, (R() - 0.3) * 0.08, (R() - 0.5) * 0.12));
      const d = V(Math.cos(a) * 0.4 + (R() - 0.5) * 1.2, -1.5, Math.sin(a) * 0.4 + (R() - 0.5) * 1.2).normalize().multiplyScalar(0.07 + R() * 0.08);
      const side = V(-d.z, 0, d.x).normalize().multiplyScalar(0.006);
      const col = jit([0.17, 0.24, 0.15], 0.25), nm = V(side.x, 0.4, side.z).normalize();
      B.quad(c.clone().sub(side), c.clone().add(side), c.clone().add(d).add(side), c.clone().add(d).sub(side), nm, col, [h * 0.6, h * 0.6, h * 0.8, h * 0.8]);
    }
  }
  return B.geo();
}
// アダン: a short trunk on stilt roots, forking into branches, each ending in a spiral of long
// arching, sword-like leaves; a few dead leaves hang brown underneath
function pandanusGeo() {
  const B = new Builder(), bark = [0.42, 0.38, 0.3];
  const top = V(0.05, 0.42, 0);
  B.tube(V(0, 0.12, 0), top, 0.035, 0.028, bark, 0, 0.05, 6);
  for (let k = 0; k < 6; k++) {   // prop roots
    const a = k / 6 * Math.PI * 2 + R() * 0.4;
    B.tube(V(0, 0.2 + R() * 0.08, 0), V(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14), 0.012, 0.01, [0.46, 0.4, 0.32], 0, 0, 4);
  }
  const heads = 2 + Math.floor(R() * 2);
  for (let hI = 0; hI < heads; hI++) {
    const a = hI / heads * Math.PI * 2 + R();
    const tip = top.clone().add(V(Math.cos(a) * 0.22, 0.22 + R() * 0.12, Math.sin(a) * 0.22));
    B.tube(top, tip, 0.024, 0.02, bark, 0.05, 0.2, 5);
    for (let l = 0; l < 26; l++) {
      const la = l * 2.4 + R() * 0.3, up = l < 18 ? 0.6 + R() * 0.5 : -0.9;   // the last few hang dead
      const dir = V(Math.cos(la), up, Math.sin(la)).normalize();
      const len = 0.42 + R() * 0.22, w = 0.028;
      const col = l < 18 ? jit([0.4, 0.52, 0.24], 0.3) : jit([0.52, 0.4, 0.24], 0.2);
      let p0 = tip.clone(), d = dir.clone();
      for (let s = 0; s < 4; s++) {   // arching: each segment droops more
        const p1 = p0.clone().addScaledVector(d, len / 4);
        const side = V(-d.z, 0, d.x).normalize().multiplyScalar(w * (1 - s * 0.22));
        const sideB = V(-d.z, 0, d.x).normalize().multiplyScalar(w * (1 - (s + 1) * 0.22));
        B.quad(p0.clone().sub(side), p0.clone().add(side), p1.clone().add(sideB), p1.clone().sub(sideB), V(0, 1, 0).addScaledVector(d, -0.3).normalize(), col, [0.3 + s * 0.2, 0.3 + s * 0.2, 0.4 + s * 0.2, 0.4 + s * 0.2]);
        p0 = p1; d.y -= 0.35; d.normalize();
      }
    }
  }
  return B.geo();
}
// クサトベラ (glossy bright green, big leaves) and モンパノキ (silvery, felted): low domes of leaves
function shrubGeo(silver: boolean) {
  const B = new Builder();
  for (let k = 0; k < 5; k++) { const a = R() * 6.28; B.tube(V(0, 0, 0), V(Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3), 0.025, 0.012, [0.35, 0.3, 0.24], 0, 0.2, 4); }
  const n = silver ? 260 : 220, L = silver ? 0.1 : 0.15;
  for (let k = 0; k < n; k++) {
    const u = R() * 6.28, v = Math.acos(1 - R() * 1.15);   // upper part of a sphere
    const nm = V(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    const c = V(nm.x * 0.55, 0.12 + nm.y * 0.5, nm.z * 0.55).multiplyScalar(0.8 + R() * 0.25);
    const t1 = V(-nm.z, 0, nm.x).normalize(), t2 = new THREE.Vector3().crossVectors(nm, t1).normalize();
    const r = R() * 6.28, a = t1.clone().multiplyScalar(Math.cos(r)).addScaledVector(t2, Math.sin(r)), b = t1.clone().multiplyScalar(-Math.sin(r)).addScaledVector(t2, Math.cos(r));
    const col = silver ? jit([0.56, 0.62, 0.52], 0.18) : jit([0.26, 0.5, 0.2], 0.3);
    const lw = L * 0.45;
    B.quad(c.clone().addScaledVector(a, -L).addScaledVector(b, -lw * 0.3), c.clone().addScaledVector(b, -lw), c.clone().addScaledVector(a, L), c.clone().addScaledVector(b, lw), nm, col, [0.3, 0.3, 0.3, 0.3]);
  }
  return B.geo();
}
