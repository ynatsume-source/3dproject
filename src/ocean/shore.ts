// Ashore, where a sea has real land (ocean/land.ts): the forest canopy as a surface draped with the
// aerial photograph (bumpy with tree crowns, ragged where the photo's canopy ends), and the plants of a
// Yaeyama beach, placed where the photograph shows them: casuarina (モクマオウ) and screw pine (アダン)
// along the forest edge, beach naupaka (クサトベラ) and tree heliotrope (モンパノキ) on the upper beach.
import * as THREE from 'three';
import { mat } from '../render/common';
import { SURF_UNIFORMS } from '../render/surface';
import { hash, smooth, R, rr } from '../core/math';
import { WORLD } from './scenery';
import { landOf, type Land } from './land';
import { buildForest } from './forest';

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
  return { tPhoto: { value: L.near.photo }, tCover: { value: L.near.cover }, uLandHalf: { value: L.near.half },
    tPhotoF: { value: L.far.photo }, tCoverF: { value: L.far.cover }, uFarHalf: { value: L.far.half } };
}
// the photo and cover at a point: the close-in square's sharper copy where it reaches, else the island's
const LAND_TEX = /* glsl */ `
uniform sampler2D tPhoto; uniform sampler2D tCover; uniform float uLandHalf;
uniform sampler2D tPhotoF; uniform sampler2D tCoverF; uniform float uFarHalf;
void landTex(vec2 xz, out vec3 ph, out vec4 cv){
  vec2 uv = (xz + uLandHalf) / (2.0 * uLandHalf), uf = (xz + uFarHalf) / (2.0 * uFarHalf);
  float w = smoothstep(0.0, 8.0, uLandHalf - 2.0 - max(abs(xz.x), abs(xz.y)));
  ph = mix(texture2D(tPhotoF, uf).rgb, texture2D(tPhoto, uv).rgb, w);
  cv = mix(texture2D(tCoverF, uf), texture2D(tCover, uv), w);
}
`;
export const LAND_FLOOR = /* glsl */ `
${LAND_TEX}
${AIRLIT}
// Dry land at wp, close up. The aerial photograph is half a metre a pixel: from the air it is the land,
// but at a walker's height it is a blur. So it only sets the broad colour; what the ground is made of comes
// from the land cover — coral sand (fine grain, ripples, bits of shell and coral, dark and glossy where the
// sea has just left it), grassland (blades in clumps, dry patches, little flowers), the forest floor under
// the trees (leaf litter over dark soil, roots), and grey limestone — each with its own relief.
float landH;   // (the relief at the last point asked: for the normal)
vec3 landAlbedo(vec3 wp){
  vec3 ph; vec4 cv; landTex(wp.xz, ph, cv);
  vec2 p = wp.xz;
  float sandW = smoothstep(0.15, 0.6, cv.g), rockW = smoothstep(0.2, 0.7, cv.b) * (1.0 - sandW * 0.5), canW = smoothstep(0.25, 0.75, cv.r);
  float grassW = max(0.0, 1.0 - sandW - rockW) * (1.0 - canW) * smoothstep(0.45, 1.1, wp.y);   // (by the water it is all beach)
  sandW = max(sandW, 1.0 - smoothstep(0.45, 1.1, wp.y)) * (1.0 - rockW * 0.6);
  float litterW = canW * max(0.0, 1.0 - sandW * 0.7 - rockW);
  float pl = dot(ph, vec3(0.333));
  // sand: the texture's grain, a pale coral white warmed by the photo, scattered fragments, faint ripples
  float g = dot(texture2D(tSandC, p * 0.35).rgb, vec3(0.333)) / 0.6;
  float rip = sin(dot(p, vec2(0.8, 0.6)) * 3.3 + vn2(p * 0.4) * 4.0) * 0.5 + 0.5;
  vec3 sand = vec3(0.86, 0.82, 0.73) * (0.82 + 0.25 * g) * mix(vec3(1.0), ph / max(pl, 0.05), 0.25) * (0.94 + 0.08 * rip);
  float frag = (1.0 - smoothstep(0.03, 0.09, cellF1(p * 6.0))) * step(0.82, hash2(floor(p * 6.0)));
  sand = mix(sand, vec3(0.96, 0.93, 0.86), frag * 0.8);
  // grass: clumps of blades (fine streaks), greener and yellower patches, bare sandy gaps, a few flowers
  float clump = vn2(p * 1.6) * 0.6 + vn2(p * 5.0) * 0.4, blade = vn2(vec2(p.x * 38.0, p.y * 38.0) + vn2(p * 9.0) * 3.0);
  vec3 grass = mix(vec3(0.34, 0.42, 0.18), vec3(0.52, 0.5, 0.26), smoothstep(0.45, 0.75, vn2(p * 0.35 + 4.0)));
  grass = mix(grass, ph * 1.15, 0.3) * (0.7 + 0.45 * blade) * (0.8 + 0.3 * clump);
  grass = mix(grass, sand * 0.9, smoothstep(0.65, 0.85, vn2(p * 0.7 + 11.0)) * 0.6);
  grass = mix(grass, vec3(0.9, 0.85, 0.5), (1.0 - smoothstep(0.02, 0.06, cellF1(p * 3.0 + 7.0))) * step(0.93, hash2(floor(p * 3.0 + 7.0))));
  // the forest floor: dark soil under a layer of dry leaves (browns, ochres, the odd green one), roots
  float leaf = cellF1(p * 9.0), lv = hash2(floor(p * 9.0));
  vec3 litter = mix(vec3(0.26, 0.2, 0.13), mix(vec3(0.55, 0.4, 0.22), vec3(0.4, 0.3, 0.16), lv), smoothstep(0.45, 0.2, leaf));
  litter = mix(litter, vec3(0.3, 0.36, 0.16), step(0.92, lv) * smoothstep(0.4, 0.2, leaf));
  float root = 1.0 - smoothstep(0.0, 0.06, abs(vn2(p * 0.9 + 3.0) - 0.5));
  litter = mix(litter, vec3(0.33, 0.27, 0.2), root * 0.6);
  // limestone: grey, pitted and sharp (raised coral rock), stained dark in the hollows
  vec3 rc = texture2D(tRockC, p * 0.4).rgb;
  vec3 rock = mix(vec3(0.62, 0.6, 0.55), rc * 1.3, 0.5) * (0.75 + 0.35 * vn2(p * 2.0));
  vec3 a = sand * sandW + grass * grassW + litter * litterW + rock * rockW;
  a /= max(sandW + grassW + litterW + rockW, 1e-3);
  landH = sandW * (rip * 0.08 + frag * 0.15) + grassW * (blade * 0.25 + clump * 0.3) + litterW * (smoothstep(0.45, 0.15, leaf) * 0.2 + root * 0.35) + rockW * (dot(rc, vec3(0.6)) + vn2(p * 3.0)) * 0.6;
  // wet sand by the water: darker, a little glossy (see airLit's caller), then the swash line
  float wet = 1.0 - smoothstep(0.02, 0.5, wp.y);
  return mix(a, a * vec3(0.66, 0.7, 0.74), wet * 0.85);
}
vec3 landNormal(vec3 wp, vec3 n){ return bumpN(n, wp, landH * 0.05); }
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

export function buildShore(loc: any, group: THREE.Group, T: any, obst: { raise(x: number, z: number, top: number): void }) {
  const L = landOf(loc.id)!;
  const f = loc.f as (x: number, z: number) => number;
  const can = L.canopy, sand = L.sand;
  const FAR = L.far.half - 8;
  // how deep into the forest: canopy averaged over a wide ring (edges are low, the middle is tall)
  const inner = (x: number, z: number) => {
    let s = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; s += can(x + Math.cos(a) * 9, z + Math.sin(a) * 9); }
    return s / 8;
  };

  /* ---------- the canopy ---------- */
  const top = (x: number, z: number) => {
    const c = can(x, z);
    if (c < 0.08) return { y: f(x, z) - 0.3, c };
    const tall = 2.2 + 4.8 * smooth(0.2, 0.85, inner(x, z));
    return { y: f(x, z) + (tall + 1.3 * crowns(x, z)) * smooth(0.08, 0.5, c), c };
  };
  const canopyMat = mat(
    `attribute float aC; varying vec3 vWp; varying vec3 vN; varying float vC;
     void main(){ vec3 p = position; float w = smoothstep(1.0, 6.0, p.y);
       p.xz += vec2(sin(uTime * 0.9 + p.x * 0.3 + p.z * 0.2), cos(uTime * 0.7 + p.z * 0.3)) * 0.06 * w * (0.4 + uWave);
       vWp = p; vN = normal; vC = aC; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    `${LAND_TEX}
     ${AIRLIT}
     varying vec3 vWp; varying vec3 vN; varying float vC; uniform float uNear;
     void main(){
       vec3 ph; vec4 cv; landTex(vWp.xz, ph, cv);
       float nz = vn2(vWp.xz * 0.9) * 0.6 + vn2(vWp.xz * 3.1 + 7.0) * 0.4;
       if (cv.r < 0.3 + 0.3 * nz) discard;                            // ragged where the forest ends
       if (length(vWp.xz - uCamPos.xz) < uNear * (0.9 + 0.2 * nz)) discard;   // (close by, the trees themselves: ocean/forest.ts)
       if (length(vWp.xz - uCut.xz) < uCut.w * (0.85 + 0.3 * nz)) discard;   // (opened up over a resident being watched from above)
       vec3 n = normalize(vN);
       float under = gl_FrontFacing ? 1.0 : 0.3;                       // seen from beneath: the shade inside the crowns
       // leafy texture: clumps of light and shade at the scale of branches
       float leaf = vn2(vWp.xz * 4.3 + vWp.y * 2.0) * 0.5 + vn2(vWp.xz * 11.0 - vWp.y * 3.0) * 0.5;
       n = normalize(n + vec3(leaf - 0.5, 0.0, vn2(vWp.zx * 4.1) - 0.5) * 0.9);
       vec3 alb = ph * (0.72 + 0.5 * leaf) * mix(0.55, 1.0, smoothstep(-0.3, 0.8, n.y));   // the sides of the forest are in shade
       gl_FragColor = vec4(fogIt(airLit(alb * under, n, vWp, 0.5), vWp), 1.0);
     }`,
    { uniforms: { ...landUniforms(L), uNear: { value: 0 } }, opts: { side: THREE.DoubleSide } });
  // a grid of step S over +-E1, leaving out what lies inside +-E0 (drawn finer by the other)
  const canopyMesh = (E0: number, E1: number, S: number) => {
    const N = Math.round(2 * E1 / S) + 1;
    const pos = new Float32Array(N * N * 3), aC = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -E1 + i * S, z = -E1 + j * S, k = j * N + i;
      const c = can(x, z);
      const y = c < 0.08 ? f(x, z) + 1.3 : top(x, z).y;   // (the edge hangs down like the outer leaves, not to the ground)
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; aC[k] = c;
    }
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      if (Math.max(aC[a], aC[b], aC[c], aC[d]) < 0.12) continue;
      const x0 = -E1 + i * S, z0 = -E1 + j * S;
      if (E0 > 0 && x0 >= -E0 && x0 + S <= E0 && z0 >= -E0 && z0 + S <= E0) continue;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(aC, 1));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, canopyMat); m.frustumCulled = false; group.add(m);
    return m;
  };
  const E = WORLD;
  const canopy = [canopyMesh(0, E, 1.5), canopyMesh(E, FAR, 3)];
  // the drone and birds keep above the treetops: near the modelled sea from a 1 m grid, further out
  // from the shape itself
  T.over = (x: number, z: number) => (can(x, z) < 0.3 ? -1e9 : top(x, z).y + 0.5);
  T.landCover = (x: number, z: number) => ({ can: can(x, z), sand: sand(x, z) });
  for (let z = -E; z < E; z += 1) for (let x = -E; x < E; x += 1) {
    if (can(x, z) < 0.3) continue;
    obst.raise(x, z, top(x, z).y + 0.5);
  }

  /* ---------- plants of the beach and the forest edge ---------- */
  type Spot = { x: number; z: number; y: number; s: number; ry: number };
  const lists: Record<string, Spot[]> = { casuarina: [], pandanus: [], naupaka: [], heliotrope: [] };
  const cellsOf: Record<string, Map<string, Spot[]>> = {};
  const far = (list: Spot[], x: number, z: number, d: number) => {   // nothing of this kind within d
    const kind = Object.keys(lists).find((k) => lists[k] === list)!, M = (cellsOf[kind] ??= new Map());
    const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) for (const p of M.get(i + ',' + j) || []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false;
    return true;
  };
  const add = (kind: string, sp: Spot) => { lists[kind].push(sp); const k = Math.floor(sp.x / 8) + ',' + Math.floor(sp.z / 8), M = (cellsOf[kind] ??= new Map()); if (!M.has(k)) M.set(k, []); M.get(k)!.push(sp); };
  const near = (fn: (x: number, z: number) => number, x: number, z: number, r: number) => {
    let m = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; m = Math.max(m, fn(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m;
  };
  for (let t = 0; t < 400000; t++) {
    const x = rr(-FAR, FAR), z = rr(-FAR, FAR), y = f(x, z);
    if (y < 0.5) continue;
    const c = can(x, z), sd = sand(x, z);
    if (c > 0.35 && c < 0.9 && near(sand, x, z, 7) > 0.5 && lists.casuarina.length < 340 && far(lists.casuarina, x, z, 6)) add('casuarina', { x, z, y, s: rr(7, 12), ry: R() * 6.28 });
    else if (c > 0.15 && c < 0.7 && near(sand, x, z, 4) > 0.4 && lists.pandanus.length < 460 && far(lists.pandanus, x, z, 4.2)) add('pandanus', { x, z, y, s: rr(2.6, 4.2), ry: R() * 6.28 });
    else if (sd > 0.35 && c < 0.3 && near(can, x, z, 4) > 0.4 && y > 0.9 && lists.naupaka.length < 560 && far(lists.naupaka, x, z, 2.0)) add('naupaka', { x, z, y, s: rr(1.4, 2.4), ry: R() * 6.28 });
    else if (sd > 0.6 && c < 0.1 && near(can, x, z, 10) > 0.3 && y > 1.1 && lists.heliotrope.length < 120 && far(lists.heliotrope, x, z, 6)) add('heliotrope', { x, z, y, s: rr(2.4, 4), ry: R() * 6.28 });
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
       if (length(vWp.xz - uCut.xz) < uCut.w && vWp.y > uCut.y + 0.9) discard;   // (the crowns over a resident being watched)
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
  const forest = buildForest(AIRLIT, group, f, can, top, E);
  return {
    canopy, plants: count, lists, forest,
    // each frame: the trees near the camera, and the canopy surface stepping aside for them
    update(cam: THREE.Vector3, near: number) { forest.update(cam, near); (canopyMat.uniforms.uNear as { value: number }).value = near; },
  };
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

// モクマオウ: a tall, thin, often leaning trunk with a few upward-angled limbs; a light, open crown of
// fine grey-green twigs that hang in soft drooping curtains (it is no pine: its "needles" are jointed
// twigs) — airy enough to see the sky through, sighing in the wind
function casuarinaGeo() {
  const B = new Builder(), bark = [0.36, 0.3, 0.25];
  const lean = V(0.08, 1, 0.03).normalize();
  const trunkTop = lean.clone().multiplyScalar(0.92);
  B.tube(V(0, 0, 0), trunkTop, 0.02, 0.007, bark, 0, 0.3, 6);
  for (let t = 0; t < 12; t++) {
    const h = 0.32 + t * 0.052 + R() * 0.04, a = t * 2.4 + R() * 0.6, len = 0.09 + Math.sin((1 - t / 12) * Math.PI * 0.85) * 0.16;
    const base = lean.clone().multiplyScalar(h), tip = base.clone().add(V(Math.cos(a) * len, len * 0.55, Math.sin(a) * len));   // (the limbs angle up)
    B.tube(base, tip, 0.006, 0.0025, bark, h * 0.3, h * 0.5, 4);
    // curtains of fine twigs hanging from the limb: long, thin, curving down, light grey-green
    for (let k = 0; k < 90; k++) {
      const f = 0.2 + R() * 0.8, c = base.clone().lerp(tip, f).add(V((R() - 0.5) * 0.06, (R() - 0.2) * 0.05, (R() - 0.5) * 0.06));
      let d = V(Math.cos(a) * 0.5 + (R() - 0.5) * 0.9, -0.5, Math.sin(a) * 0.5 + (R() - 0.5) * 0.9).normalize();
      const L = 0.05 + R() * 0.07, col = jit([0.36, 0.44, 0.33], 0.22);
      let p0 = c;
      for (let s = 0; s < 3; s++) {   // (each twig a little curved: steeper toward the tip)
        const p1 = p0.clone().addScaledVector(d, L / 3);
        const side = V(-d.z, 0, d.x).normalize().multiplyScalar(0.0035);
        B.quad(p0.clone().sub(side), p0.clone().add(side), p1.clone().add(side), p1.clone().sub(side), V(side.x, 0.6, side.z).normalize(), col, [h * 0.7 + s * 0.1, h * 0.7 + s * 0.1, h * 0.8 + s * 0.1, h * 0.8 + s * 0.1]);
        p0 = p1; d.y -= 0.45; d.normalize();
      }
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
