// Ashore, where a sea has real land (ocean/land.ts): the forest canopy as a surface draped with the
// aerial photograph (bumpy with tree crowns, ragged where the photo's canopy ends), and the plants of a
// Yaeyama beach, placed where the photograph shows them: casuarina (モクマオウ) and screw pine (アダン)
// along the forest edge, beach naupaka (クサトベラ) and tree heliotrope (モンパノキ) on the upper beach.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, U } from '../render/common';
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
  vec2 pw = p + vec2(vn2(p * 2.3), vn2(p * 2.3 + 9.0)) * 0.5;   // (warped, so the leaves lie at random rather than in rows)
  float leaf = min(cellF1(pw * 7.0), cellF1(pw * 11.0 + 3.0) * 1.2), lv = hash2(floor(pw * 7.0)) * 0.6 + vn2(p * 3.0) * 0.4;
  vec3 litter = mix(vec3(0.2, 0.16, 0.12), mix(vec3(0.4, 0.32, 0.22), vec3(0.3, 0.25, 0.18), lv), smoothstep(0.42, 0.22, leaf) * (0.45 + 0.4 * vn2(p * 0.8)));
  litter = mix(litter, vec3(0.3, 0.36, 0.16), step(0.92, lv) * smoothstep(0.4, 0.2, leaf));
  float root = 1.0 - smoothstep(0.0, 0.06, abs(vn2(p * 0.9 + 3.0) - 0.5));
  litter = mix(litter, vec3(0.33, 0.27, 0.2), root * 0.6);
  // limestone: grey, pitted and sharp (raised coral rock), stained dark in the hollows
  vec3 rc = texture2D(tRockC, p * 0.4).rgb;
  vec3 rock = mix(vec3(0.62, 0.6, 0.55), rc * 1.3, 0.5) * (0.75 + 0.35 * vn2(p * 2.0));
  vec3 a = sand * sandW + grass * grassW + litter * litterW + rock * rockW;
  a /= max(sandW + grassW + litterW + rockW, 1e-3);
  a *= mix(1.0, 0.45 + 0.55 * dapple(wp, wp.y + 8.0), canW * (1.0 - sandW * 0.8));   // (in the shade of the trees, flecked with sun)
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
       // the colour of the trees themselves (ocean/forest.ts: their kinds' greens, in patches a crown or a stand
       // across), lightened and darkened as the photograph is, so that where the surface gives way to the trees
       // close by there is no seam; the photograph only lends a little of its own hue
       float cr = vn2(vWp.xz * 0.3), st = vn2(vWp.xz * 0.045 + 13.0);
       vec3 tint = mix(vec3(0.17, 0.3, 0.11), vec3(0.3, 0.4, 0.15), smoothstep(0.35, 0.75, st));
       tint = mix(tint, vec3(0.24, 0.4, 0.15), smoothstep(0.55, 0.85, cr) * 0.7);
       float pl = dot(ph, vec3(0.333));
       vec3 alb = mix(tint * clamp(pl / 0.3, 0.7, 1.15), ph * 0.7, 0.15) * 0.82;
       alb *= (0.68 + 0.5 * leaf) * mix(0.38, 1.1, smoothstep(0.2, 0.62, vn2(vWp.xz * 0.55 + 3.0)) * 0.7 + smoothstep(0.3, 0.7, cr) * 0.3) * mix(0.55, 1.0, smoothstep(-0.3, 0.8, n.y));   // (crowns in light and shade; the sides of the forest in shade)
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
  // (the canopy is no longer solid as a block: the drone cruising by keeps above it by T.over, but flown by
  // hand it can go in among the trees, which stand apart — see forest.push)
  void obst;

  /* ---------- plants of the beach and the forest edge ---------- */
  type Spot = { x: number; z: number; y: number; s: number; ry: number };
  const lists: Record<string, Spot[]> = { casuarina: [], pandanus: [], naupaka: [], heliotrope: [], drift: [], rock: [] };
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
    else if (sd > 0.5 && c < 0.2 && y > 0.7 && y < 1.5 && lists.drift.length < 160 && far(lists.drift, x, z, 7)) add('drift', { x, z, y: y + 0.08, s: rr(1.6, 4.5), ry: R() * 6.28 });
    else if ((L.rock(x, z) > 0.4 || (y < 0.9 && hash(x * 3.3, z * 1.7) < 0.15)) && lists.rock.length < 260 && far(lists.rock, x, z, 3)) add('rock', { x, z, y: y + 0.05, s: rr(0.4, 1.4), ry: R() * 6.28 });
  }
  const geos: Record<string, THREE.BufferGeometry> = { casuarina: casuarinaGeo(), pandanus: pandanusGeo(), naupaka: shrubGeo(false), heliotrope: shrubGeo(true), drift: driftGeo(), rock: rockGeo() };
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
       if (cutSight(vWp)) discard;   // (the leaves between the camera and a resident being watched)
       vec3 n = normalize(vN); if (!gl_FrontFacing) n = normalize(-n * 0.4 + vec3(0.0, 0.9, 0.0));   // (a leaf seen from beneath: the light comes through it)
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
      if (kind === 'drift') s3.set(it.s, it.s * 0.45, it.s * 0.45); else s3.set(it.s * rr(0.85, 1.15), it.s, it.s * rr(0.85, 1.15));
      mesh.setMatrixAt(i, m4.compose(p3.set(it.x, it.y - 0.1, it.z), q, s3));
    });
    mesh.frustumCulled = false;
    group.add(mesh); count += list.length;
  }
  const forest = buildForest(AIRLIT, group, f, can, top, FAR);
  // how tall the growth is at a point (m): for those who walk on the island and go round what is above their
  // waist (robots/residents.ts). The shrubs and rocks one by one; inside the forest, its undergrowth.
  const VEG: Record<string, [number, number]> = { naupaka: [0.55, 0.5], heliotrope: [0.5, 0.75], pandanus: [0.38, 1], rock: [0.85, 0.5], casuarina: [0.05, 9] };   // (radius, height, per unit of its size)
  T.pushTrees = (p: THREE.Vector3) => forest.push(p);   // (keeping walkers out of the trunks)
  T.vegH = (x: number, z: number, pad = 0) => {   // (pad: a margin round each plant, to keep clear of it)
    let h = can(x, z) > 0.55 || forest.trunkNear(x, z, pad) ? 1 : 0;   // (in the forest; or by a tree's trunk, where it thins out)
    const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
    for (const kind in VEG) {
      const M = cellsOf[kind]; if (!M) continue; const [rk, hk] = VEG[kind];
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) for (const p of M.get(i + ',' + j) || []) {
        const r = Math.max(0.35, p.s * rk) + pad; if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) h = Math.max(h, p.s * hk);
      }
    }
    return h;
  };
  return {
    canopy, plants: count, lists, forest,
    // each frame: the trees near the camera, and the canopy surface stepping aside for them
    update(cam: THREE.Vector3, near: number) {
      forest.update(cam, near); (canopyMat.uniforms.uNear as { value: number }).value = near;
      // under the trees? then the air there is hazy (render/common.ts fogAir)
      const inF = Math.abs(cam.x) < FAR && Math.abs(cam.z) < FAR && cam.y > 0 && can(cam.x, cam.z) > 0.5 && cam.y < top(cam.x, cam.z).y - 0.5 ? 1 : 0;
      U.uHaze.value += (inF - U.uHaze.value) * 0.05;
    },
    push: (p: THREE.Vector3) => forest.push(p),
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
// クサトベラ (beach naupaka): a low dome of shoots, each ending in a rosette of fleshy, glossy, spoon-shaped
// leaves held up and out, the young ones at the centre paler; モンパノキ (tree heliotrope): a small gnarled
// tree, its silvery felted leaves in loose rosettes at the ends of the twigs, the crown a rounded heap of them
function rosette(B: Builder, c: THREE.Vector3, out: THREE.Vector3, n: number, L: number, col: number[], young: number[], sway: number, fold = false) {
  const up = V(0, 1, 0), a0 = R() * 6.28;
  for (let k = 0; k < n; k++) {
    const an = a0 + k * 2.4, inner = k < 2;
    // each leaf leans out from the rosette's axis (the shoot's direction), the inner ones more upright
    const side = V(Math.cos(an), 0, Math.sin(an)), tilt = inner ? 0.35 : 0.85;
    const d = out.clone().multiplyScalar(1 - tilt * 0.6).addScaledVector(side, tilt).addScaledVector(up, 0.25).normalize();
    const w = V(-d.z, 0, d.x).normalize(), l = L * (inner ? 0.6 : rr(0.85, 1.15));
    const nrm = new THREE.Vector3().crossVectors(w, d).normalize(); if (nrm.y < 0) nrm.negate();
    const dome = out.clone().add(up).normalize(), nm = nrm.lerp(dome, 0.55).normalize();
    // spoon-shaped: narrow at the stalk, widest two-thirds out, round at the tip
    const p0 = c, p1 = c.clone().addScaledVector(d, l * 0.62), p2 = c.clone().addScaledVector(d, l);
    const hw = l * 0.24, cl = jit(inner ? young : col, 0.2);
    if (!fold) { B.quad(p0, p1.clone().addScaledVector(w, -hw), p2, p1.clone().addScaledVector(w, hw), nm, cl, [sway, sway + 0.05, sway + 0.1, sway + 0.05]); continue; }
    // a thick felted leaf: folded up along the midrib, arched, its tip curling down — four facets, each
    // shaded a little differently, so it reads as a leaf with a body rather than a flat card
    const m1 = c.clone().addScaledVector(d, l * 0.5).addScaledVector(up, l * 0.08), m2 = c.clone().addScaledVector(d, l).addScaledVector(up, -l * 0.18);
    const eAt = (t: number, sgn: number, wd: number) => c.clone().addScaledVector(d, l * t).addScaledVector(w, sgn * wd).addScaledVector(up, -wd * 0.45 + (t < 0.7 ? l * 0.05 : -l * 0.06));
    for (const sgn of [-1, 1]) {
      const e1 = eAt(0.5, sgn, hw * 1.1), e2 = eAt(0.82, sgn, hw * 0.75);
      const fn = (a: THREE.Vector3, b: THREE.Vector3, q: THREE.Vector3) => { const f = new THREE.Vector3().crossVectors(b.clone().sub(a), q.clone().sub(a)).normalize(); if (f.y < 0) f.negate(); return f.lerp(dome, 0.45).normalize(); };
      B.quad(c, e1, m1, m1, fn(c, e1, m1), cl, [sway, sway + 0.05, sway + 0.05, sway + 0.05]);
      B.quad(m1, e1, e2, m2, fn(m1, e1, m2), cl.map((v) => v * 0.93), [sway + 0.05, sway + 0.05, sway + 0.1, sway + 0.1]);
    }
  }
}
// the leafy heart of a shrub or crown: a lumpy dome, so what shows between the rosettes is more leaves, not sand
function dome(B: Builder, c: THREE.Vector3, rx: number, ry: number, col: number[], sway: number, cap = false) {
  const NU = 12, NV = 5, seed = R() * 30, pt = (i: number, j: number) => {
    const u = i / NU * 6.28, v = j / NV * Math.PI * 0.5, n = V(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
    const r = 0.85 + 0.25 * Math.abs(Math.sin(u * 3 + seed) * Math.sin(v * 4 + seed * 0.7));
    return { p: V(c.x + n.x * rx * r, c.y + n.y * ry * r, c.z + n.z * rx * r), n };
  };
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = pt(i, j), b = pt(i + 1, j), d = pt(i + 1, j + 1), e = pt(i, j + 1);
    B.quad(a.p, b.p, d.p, e.p, a.n.clone().add(d.n).normalize(), jit(col, 0.15), [sway * 0.5, sway * 0.5, sway, sway]);
  }
  // (a crown up in the air is closed underneath: a shallow, shaded underside, not a hollow seen into from below)
  if (cap) for (let i = 0; i < NU; i++) {
    const a = pt(i, 0), b = pt(i + 1, 0), lo = V(c.x, c.y - ry * 0.25, c.z);
    const nn = V(a.n.x * 0.6, -0.5, a.n.z * 0.6).normalize();
    B.quad(a.p, lo, b.p, b.p, nn, jit(col.map((v) => v * 0.8), 0.12), [sway * 0.5, sway * 0.5, sway * 0.5, sway * 0.5]);
  }
}
function shrubGeo(silver: boolean) {
  const B = new Builder(), bark = silver ? [0.42, 0.38, 0.32] : [0.4, 0.36, 0.26];
  if (!silver) {
    dome(B, V(0, 0.02, 0), 0.5, 0.42, [0.13, 0.3, 0.11], 0.15);
    // shoots spreading from the foot to points over a low dome, a rosette at each
    for (let k = 0; k < 85; k++) {
      const u = R() * 6.28, v = Math.acos(1 - R() * 1.1);
      const nm = V(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
      const tip = V(nm.x * 0.6, 0.08 + nm.y * 0.45, nm.z * 0.6).multiplyScalar(rr(0.8, 1.05));
      const mid = tip.clone().multiplyScalar(0.5).add(V(0, -0.04, 0));
      if (k % 3 === 0) { B.tube(V(nm.x * 0.05, 0, nm.z * 0.05), mid, 0.018, 0.012, bark, 0, 0.1, 3); B.tube(mid, tip, 0.012, 0.008, bark, 0.1, 0.25, 3); }
      rosette(B, tip, V(nm.x, nm.y * 0.6, nm.z).normalize(), 8, rr(0.15, 0.2), [0.2, 0.44, 0.16], [0.42, 0.6, 0.25], 0.25);
    }
  } else {
    // a short crooked trunk, limbs out and up, twigs ending in rosettes
    const top = V(rr(-0.06, 0.06), 0.22, rr(-0.06, 0.06)), cc = top.clone().add(V(0, 0.26, 0));
    B.tube(V(0, 0, 0), top, 0.05, 0.035, bark, 0, 0.05, 6);
    dome(B, cc.clone().add(V(0, -0.1, 0)), 0.3, 0.28, [0.27, 0.33, 0.25], 0.25, true);
    for (let k = 0; k < 5; k++) {
      const an = k * 1.26 + R() * 0.5, e = top.clone().add(V(Math.cos(an) * rr(0.18, 0.28), rr(0.1, 0.2), Math.sin(an) * rr(0.18, 0.28)));
      B.tube(top, e, 0.03, 0.015, bark, 0.05, 0.25, 4);
      for (let j = 0; j < 9; j++) {
        // twig ends over a rounded crown
        const u = an + rr(-0.75, 0.75), v = Math.acos(1 - R() * 1.55), t = cc.clone().add(V(Math.sin(v) * Math.cos(u) * 0.48, Math.cos(v) * 0.4, Math.sin(v) * Math.sin(u) * 0.48));   // (a rounded heap, down its sides too)
        B.tube(e, t, 0.012, 0.006, bark, 0.25, 0.35, 3);
        const o = t.clone().sub(cc).normalize();
        rosette(B, t, o, 11, rr(0.13, 0.17), [0.46, 0.54, 0.44], [0.56, 0.64, 0.5], 0.35, true);
      }
    }
  }
  return B.geo();
}
// driftwood thrown up along the high-tide line: bleached, split, a stub of root or branch; and beach rocks
function driftGeo() {
  const B = new Builder(), col = [0.66, 0.63, 0.57];
  const a = V(-0.5, 0.04, 0), m = V(rr(-0.05, 0.05), 0.05, rr(-0.04, 0.04)), b = V(0.5, 0.035, rr(-0.06, 0.06));
  B.tube(a, m, 0.06, 0.055, jit(col, 0.1), 0, 0, 6); B.tube(m, b, 0.055, 0.035, jit(col, 0.1), 0, 0, 6);
  for (let k = 0; k < 3; k++) { const p = a.clone().lerp(b, rr(0.1, 0.8)), an = R() * 6.28; B.tube(p, p.clone().add(V(Math.cos(an) * 0.1, rr(0.02, 0.1), Math.sin(an) * 0.1)), 0.02, 0.01, jit(col, 0.12), 0, 0, 4); }
  // the root plate at one end: short stubs splaying out
  for (let k = 0; k < 6; k++) { const an = k * 1.05 + R() * 0.4; B.tube(a, a.clone().add(V(-0.05, Math.sin(an) * 0.12 + 0.03, Math.cos(an) * 0.12)), 0.03, 0.008, jit([0.55, 0.5, 0.44], 0.15), 0, 0, 3); }
  return B.geo();
}
function rockGeo() {
  const g0 = new THREE.IcosahedronGeometry(1, 3); g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
  const g = mergeVertices(g0), P = g.attributes.position;
  const seed = R() * 40, C: number[] = [], W: number[] = [];
  for (let k = 0; k < P.count; k++) {
    const v = new THREE.Vector3(P.getX(k), P.getY(k), P.getZ(k)).normalize();
    const n1 = Math.sin(v.x * 4.1 + seed) * Math.sin(v.y * 3.7 + seed * 0.7) * Math.sin(v.z * 4.3 + seed * 1.3);
    const n2 = Math.sin(v.x * 9 + v.z * 7 + seed) * Math.sin(v.y * 8 - v.x * 5), n3 = Math.sin(v.x * 23 + v.y * 19 + seed) * Math.sin(v.z * 21 - v.y * 17);
    const r = 1 + 0.22 * n1 + 0.07 * n2 + 0.025 * n3;   // (lumps, ledges, and the sharp pitting of raised coral rock)
    P.setXYZ(k, v.x * r, Math.max(-0.2, v.y * 0.55 * r), v.z * r * 0.85);
    // grey limestone, dark in the hollows and at the foot (wet, algae), pale on the tops
    const t = 0.5 + 0.5 * v.y, dk = (n1 < -0.1 ? 0.75 : 1) * (0.85 + 0.25 * n3) * (v.y < -0.1 ? 0.7 : 1);
    C.push(0.5 * dk * (0.75 + 0.35 * t), 0.49 * dk * (0.75 + 0.35 * t), 0.44 * dk * (0.72 + 0.35 * t)); W.push(0);
  }
  g.computeVertexNormals();
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 1));
  return g;
}
