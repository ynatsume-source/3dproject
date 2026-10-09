// Ashore, where a sea has real land (ocean/land.ts): the forest canopy as a surface draped with the
// aerial photograph (bumpy with tree crowns, ragged where the photo's canopy ends), and the plants of a
// Yaeyama beach, placed where the photograph shows them: casuarina (モクマオウ) and screw pine (アダン)
// along the forest edge, beach naupaka (クサトベラ) and tree heliotrope (モンパノキ) on the upper beach.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, U } from '../render/common';
import { SURF_UNIFORMS } from '../render/surface';
import { hash, smooth, R, rr, mulberry32 } from '../core/math';
import { WORLD } from './scenery';
import { landOf, type Land } from './land';
import { buildForest } from './forest';
import { Solids } from '../robots/solids';

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
float landH;   // (the relief at the last point asked)
vec4 landW;    // (the cover's weights there: sand, grass, litter, rock — for the relief's slope)
float landFw;  // (how much ground a pixel covers there, m)
// the ground's relief (its height is this × 0.05 m), from the same cover as its colour: sand ripples, grass clumps,
// the leaves and roots of the forest floor, limestone; detail finer than the pixel left out, as in the colour
float landRelief(vec2 p){
  float rip = sin(dot(p, vec2(0.8, 0.6)) * 3.3 + vn2(p * 0.4) * 4.0) * 0.5 + 0.5;
  float clump = vn2(p * 1.6) * 0.6 + vn2(p * 5.0) * 0.4;
  float aaB = 1.0 - smoothstep(0.008, 0.022, landFw), aaL = 1.0 - smoothstep(0.02, 0.06, landFw);
  float blade = mix(0.5, vn2(vec2(p.x * 38.0, p.y * 38.0) + vn2(p * 9.0) * 3.0), aaB);
  vec2 pw = p + vec2(vn2(p * 2.3), vn2(p * 2.3 + 9.0)) * 0.5;
  float leaf = min(cellF1(pw * 7.0), cellF1(pw * 11.0 + 3.0) * 1.2);
  float root = 1.0 - smoothstep(0.0, 0.06, abs(vn2(p * 0.9 + 3.0) - 0.5));
  vec3 rc = texture2D(tRockC, p * 0.4).rgb;
  return landW.x * rip * 0.08 + landW.y * (blade * 0.25 + clump * 0.3) + landW.z * (mix(0.3, smoothstep(0.45, 0.15, leaf), aaL) * 0.2 + root * 0.35) + landW.w * (dot(rc, vec3(0.6)) + vn2(p * 3.0)) * 0.6;
}
vec3 landAlbedo(vec3 wp){
  vec3 ph; vec4 cv; landTex(wp.xz, ph, cv);
  vec2 p = wp.xz;
  // how much ground one pixel covers here (m): detail finer than about two pixels is faded to its average, or it
  // twinkles as the view moves (a fragment of shell, a grass blade, a flower, the size of a pixel or less, falls on
  // a pixel in one frame and between pixels in the next). (Taken here, outside any branch.)
  float fw = max(length(fwidth(p)), 1e-5);
  float aaFrag = 1.0 - smoothstep(0.004, 0.012, fw), aaBlade = 1.0 - smoothstep(0.008, 0.022, fw), aaFlower = 1.0 - smoothstep(0.006, 0.018, fw), aaLeaf = 1.0 - smoothstep(0.02, 0.06, fw);
  float sandW = smoothstep(0.15, 0.6, cv.g), rockW = smoothstep(0.2, 0.7, cv.b) * (1.0 - sandW * 0.5), canW = smoothstep(0.25, 0.75, cv.r);
  float grassW = max(0.0, 1.0 - sandW - rockW) * (1.0 - canW) * smoothstep(0.45, 1.1, wp.y);   // (by the water it is all beach)
  sandW = max(sandW, 1.0 - smoothstep(0.45, 1.1, wp.y)) * (1.0 - rockW * 0.6);
  float litterW = canW * max(0.0, 1.0 - sandW * 0.7 - rockW);
  float pl = dot(ph, vec3(0.333));
  // sand: the texture's grain, a pale coral white warmed by the photo, scattered fragments, faint ripples
  float g = dot(texture2D(tSandC, p * 0.35).rgb, vec3(0.333)) / 0.6;
  float rip = sin(dot(p, vec2(0.8, 0.6)) * 3.3 + vn2(p * 0.4) * 4.0) * 0.5 + 0.5;
  vec3 sand = vec3(0.86, 0.82, 0.73) * (0.82 + 0.25 * g) * mix(vec3(1.0), ph / max(pl, 0.05), 0.25) * (0.94 + 0.08 * rip);
  float frag = (1.0 - smoothstep(0.03, 0.09, cellF1(p * 6.0))) * step(0.82, hash2(floor(p * 6.0))) * aaFrag;
  sand = mix(sand, vec3(0.96, 0.93, 0.86), frag * 0.8);
  // grass: clumps of blades (fine streaks), greener and yellower patches, bare sandy gaps, a few flowers
  float clump = vn2(p * 1.6) * 0.6 + vn2(p * 5.0) * 0.4, blade = mix(0.5, vn2(vec2(p.x * 38.0, p.y * 38.0) + vn2(p * 9.0) * 3.0), aaBlade);
  vec3 grass = mix(vec3(0.34, 0.42, 0.18), vec3(0.52, 0.5, 0.26), smoothstep(0.45, 0.75, vn2(p * 0.35 + 4.0)));
  grass = mix(grass, ph * 1.15, 0.3) * (0.7 + 0.45 * blade) * (0.8 + 0.3 * clump);
  grass = mix(grass, sand * 0.9, smoothstep(0.65, 0.85, vn2(p * 0.7 + 11.0)) * 0.6);
  grass = mix(grass, vec3(0.9, 0.85, 0.5), (1.0 - smoothstep(0.02, 0.06, cellF1(p * 3.0 + 7.0))) * step(0.93, hash2(floor(p * 3.0 + 7.0))) * aaFlower);
  // the forest floor: dark soil under a layer of dry leaves (browns, ochres, the odd green one), roots
  vec2 pw = p + vec2(vn2(p * 2.3), vn2(p * 2.3 + 9.0)) * 0.5;   // (warped, so the leaves lie at random rather than in rows)
  float leaf = min(cellF1(pw * 7.0), cellF1(pw * 11.0 + 3.0) * 1.2), lv = hash2(floor(pw * 7.0)) * 0.6 + vn2(p * 3.0) * 0.4;
  float leafK = mix(0.45, smoothstep(0.42, 0.22, leaf), aaLeaf);   // (far off, the leaves' average cover)
  vec3 litter = mix(vec3(0.2, 0.16, 0.12), mix(vec3(0.4, 0.32, 0.22), vec3(0.3, 0.25, 0.18), lv), leafK * (0.45 + 0.4 * vn2(p * 0.8)));
  litter = mix(litter, vec3(0.3, 0.36, 0.16), step(0.92, lv) * smoothstep(0.4, 0.2, leaf) * aaLeaf);
  float root = 1.0 - smoothstep(0.0, 0.06, abs(vn2(p * 0.9 + 3.0) - 0.5));
  litter = mix(litter, vec3(0.33, 0.27, 0.2), root * 0.6);
  // limestone: grey, pitted and sharp (raised coral rock), stained dark in the hollows
  vec3 rc = texture2D(tRockC, p * 0.4).rgb;
  vec3 rock = mix(vec3(0.62, 0.6, 0.55), rc * 1.3, 0.5) * (0.75 + 0.35 * vn2(p * 2.0));
  vec3 a = sand * sandW + grass * grassW + litter * litterW + rock * rockW;
  a /= max(sandW + grassW + litterW + rockW, 1e-3);
  a *= mix(1.0, 0.45 + 0.55 * dapple(wp, wp.y + 8.0), canW * (1.0 - sandW * 0.8));   // (in the shade of the trees, flecked with sun)
  float wsum = max(sandW + grassW + litterW + rockW, 1e-3);
  landW = vec4(sandW, grassW, litterW, rockW) / wsum; landFw = fw;
  landH = sandW * (rip * 0.08 + frag * 0.15) + grassW * (blade * 0.25 + clump * 0.3) + litterW * (mix(0.3, smoothstep(0.45, 0.15, leaf), aaLeaf) * 0.2 + root * 0.35) + rockW * (dot(rc, vec3(0.6)) + vn2(p * 3.0)) * 0.6;
  // wet sand by the water: darker, a little glossy (see airLit's caller), then the swash line — the waves running up
  // the sand and back, higher and whiter as they are bigger (in a storm, far up the beach)
  float run = 0.08 + 0.22 * uWave, sph = vn2(wp.xz * 0.15) * 6.2832;
  float swash = run * (0.55 + 0.45 * sin(uTime * 0.55 + sph));
  float wet = 1.0 - smoothstep(0.02, 0.5 + run, wp.y);
  vec3 col = mix(a, a * vec3(0.66, 0.7, 0.74), wet * 0.85);
  float lace = smoothstep(0.35, 0.75, vn2(wp.xz * 2.2 + vec2(uTime * 0.25, -uTime * 0.18)) + 0.25 * vn2(wp.xz * 7.0));
  float foam = (1.0 - smoothstep(0.0, 0.05 + 0.03 * uWave, abs(wp.y - swash))) * lace * sandW * smoothstep(0.45, 0.9, uWave);
  return mix(col, vec3(0.92, 0.95, 0.96), foam * 0.8);
}
// the relief's slope by differences over about a pixel's width of ground (not the screen's derivatives: those are
// shared by each 2×2 block of pixels, and as the view moves the blocks slide across the ripples and the shading
// twinkles — worst with the sun low)
vec3 landNormal(vec3 wp, vec3 n){
  float e = clamp(landFw, 0.01, 0.25);
  vec2 p = wp.xz;
  float h0 = landRelief(p), hx = landRelief(p + vec2(e, 0.0)), hz = landRelief(p + vec2(0.0, e));
  vec2 g = vec2(hx - h0, hz - h0) / e * 0.05;
  return normalize(n - vec3(g.x, 0.0, g.y));
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
       float wk = clamp(uWind.z / 10.0, 0.0, 1.8);
       p.xz += vec2(sin(uTime * 0.9 + p.x * 0.3 + p.z * 0.2), cos(uTime * 0.7 + p.z * 0.3)) * 0.06 * w * (0.5 + 0.8 * wk) + uWind.xy * w * wk * wk * 0.12;
       vWp = p; vN = normal; vC = aC; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    `${LAND_TEX}
     ${AIRLIT}
     varying vec3 vWp; varying vec3 vN; varying float vC; uniform float uNear; uniform vec4 uClear[16]; uniform int uClearN;
     void main(){
       vec3 ph; vec4 cv; landTex(vWp.xz, ph, cv);
       float nz = vn2(vWp.xz * 0.9) * 0.6 + vn2(vWp.xz * 3.1 + 7.0) * 0.4;
       // ragged where the forest ends, and opened where the trees close by take over (ocean/forest.ts): edges soft over a
       // pixel and drawn as coverage when the scene is multisampled, so they do not crawl as the view moves
       float e1 = cv.r - (0.3 + 0.3 * nz), e2 = length(vWp.xz - uCamPos.xz) - uNear * (0.9 + 0.2 * nz);
       float cover = min(smoothstep(-1.0, 1.0, e1 / max(fwidth(e1), 1e-4)), smoothstep(-1.0, 1.0, e2 / max(fwidth(e2), 1e-4)));
       if (cover < mix(0.5, 0.02, uA2C)) discard;
       if (length(vWp.xz - uCut.xz) < uCut.w * (0.85 + 0.3 * nz)) discard;   // (opened up over a resident being watched from above)
       for (int i = 0; i < 16; i++) { if (i >= uClearN) break; vec4 c = uClear[i]; if (length(vWp.xz - c.xy) < c.w * (0.9 + 0.2 * nz)) discard; }   // (where the residents have felled trees)
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
       gl_FragColor = vec4(fogIt(airLit(alb * under, n, vWp, 0.5), vWp), mix(1.0, cover, uA2C));
     }`,
    { uniforms: { ...landUniforms(L), uNear: { value: 0 }, uClear: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uClearN: { value: 0 } }, opts: { side: THREE.DoubleSide, alphaToCoverage: true } });
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
  T.landCover = (x: number, z: number) => ({ can: forest.cleared(x, z) ? 0 : can(x, z), sand: sand(x, z) });   // (felled ground: open)
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
       float wk = clamp(uWind.z / 10.0, 0.0, 1.8);
       w.xz += vec2(sin(uTime * 1.3 + ph), cos(uTime * 1.1 + ph * 1.7)) * aSway * (0.06 + 0.1 * wk) + uWind.xy * aSway * wk * wk * 0.08 * (0.7 + 0.3 * sin(uTime * 1.7 + ph));
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
  // what cannot be walked through (robots/solids.ts): the trunks, the rocks, the driftwood, each its own size
  // (from its geometry: a rock ~1.1 × its size across and 0.7 high; a casuarina's trunk 0.03, a pandanus with
  // its prop roots 0.14; a log its length along its heading, a tenth of its size high)
  const solids: Solids = T.solids = new Solids();
  for (const p of lists.rock) solids.add({ kind: 'rock', x: p.x, z: p.z, r: 1.05 * p.s, y0: p.y - 0.3, y1: p.y - 0.1 + 0.7 * p.s });
  for (const p of lists.casuarina) solids.add({ kind: 'trunk', x: p.x, z: p.z, r: Math.max(0.12, 0.03 * p.s), y0: p.y - 0.3, y1: p.y + p.s * 0.8 });
  for (const p of lists.pandanus) solids.add({ kind: 'trunk', x: p.x, z: p.z, r: 0.14 * p.s, y0: p.y - 0.3, y1: p.y + p.s });
  for (const p of lists.drift) {
    // (a log: discs along it, its length s along its own x, turned by ry; the root plate at one end)
    const ux = Math.cos(p.ry), uz = -Math.sin(p.ry), w = Math.max(0.08, 0.06 * 0.45 * p.s), n = Math.ceil(p.s / (w * 2));
    for (let k = 0; k <= n; k++) { const t = -0.5 + k / n; solids.add({ kind: 'driftwood', x: p.x + ux * p.s * t, z: p.z + uz * p.s * t, r: k === 0 ? Math.max(w, 0.055 * p.s) : w, y0: p.y - 0.3, y1: p.y - 0.1 + 0.12 * 0.45 * p.s * (k === 0 ? 2 : 1) }); }
  }
  // (the residents fell trees: robots/residents.ts. What they have cleared opens the canopy above it, too)
  T.forest = {
    standingNear: (x: number, z: number, r: number) => forest.standingNear(x, z, r),
    fell: (x: number, z: number) => {
      const t = forest.fell(x, z); if (!t) return null;
      const v = (canopyMat.uniforms.uClear.value as THREE.Vector4[]), cl = forest.clearings, i = cl.length - 1;
      if (i < 16) v[i].set(t.clear.x, t.clear.z, 0, t.clear.r + 0.6); else { v.copyWithin(0, 1); v[15] = new THREE.Vector4(t.clear.x, t.clear.z, 0, t.clear.r + 0.6); }
      canopyMat.uniforms.uClearN.value = Math.min(16, cl.length);   // (only as many as there are: nothing to do on most of the island)
      return t;
    },
    cleared: (x: number, z: number) => forest.cleared(x, z),
  };
  solids.source((x, z, r, f) => forest.trunks(x, z, r, (t) => f({ kind: 'trunk', x: t.x, z: t.z, r: 0.55, y0: t.y - 0.5, y1: t.y + t.h })));
  T.vegH = (x: number, z: number, pad = 0) => {   // (pad: a margin round each plant, to keep clear of it)
    let h = (can(x, z) > 0.55 && !forest.cleared(x, z)) || forest.trunkNear(x, z, pad) ? 1 : 0;   // (in the forest; or by a tree's trunk, where it thins out)
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
// Drawn soft and rounded (owner's request 2026-10-09, docs/proposals/nature-look-2026-10-09): heaps of smooth puffs
// lit as one form, two greens (warm and bright on top, deep beneath), round-sectioned stems and logs, smooth rocks.
// Each shape from its own fixed random numbers (mulberry32), not the sea's stream.
const icoCache = new Map<number, THREE.BufferGeometry>();
const icoOf = (detail: number) => { let g = icoCache.get(detail); if (!g) { const g0 = new THREE.IcosahedronGeometry(1, detail); g0.deleteAttribute('normal'); g0.deleteAttribute('uv'); g = mergeVertices(g0); icoCache.set(detail, g); } return g; };
const mixC = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
class Builder {
  p: number[] = []; n: number[] = []; c: number[] = []; w: number[] = []; i: number[] = [];
  constructor(public R: () => number = Math.random) {}
  rr(a: number, b: number) { return a + (b - a) * this.R(); }
  vert(p: THREE.Vector3, n: THREE.Vector3, col: number[], sway: number) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(col[0], col[1], col[2]); this.w.push(sway); return this.p.length / 3 - 1; }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, nrm: THREE.Vector3, col: number[], sway: number[]) {
    const o = this.p.length / 3;
    for (const [v, s] of [[a, sway[0]], [b, sway[1]], [c, sway[2]], [d, sway[3]]] as [THREE.Vector3, number][]) this.vert(v, nrm, col, s);
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  // a smooth tapered tube along a gentle curve (a → mid → b), round in section (normals out from its axis), its
  // ends closed with a rounded cap when `cap` (a log's)
  tube(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: number[], sw0 = 0, sw1 = 0, seg = 6, bow = new THREE.Vector3(), rings = 2, cap = false) {
    const mid = a.clone().lerp(b, 0.5).add(bow), st = this.p.length / 3, upv = V(0, 1, 0);
    const at = (t: number) => a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(b, t * t);
    const tan = (t: number) => mid.clone().sub(a).multiplyScalar(2 * (1 - t)).addScaledVector(b.clone().sub(mid), 2 * t).normalize();
    const frame = (ax: THREE.Vector3) => { const u = (Math.abs(ax.y) < 0.95 ? upv.clone() : V(1, 0, 0)).cross(ax).normalize(); return [u, ax.clone().cross(u)]; };
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, c = at(t), [u, v] = frame(tan(t)), r = r0 + (r1 - r0) * t;
      for (let j = 0; j < seg; j++) { const an = j / seg * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an)); this.vert(c.clone().addScaledVector(n, r), n, col, sw0 + (sw1 - sw0) * t); }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const p0 = st + i * seg + j, p1 = st + i * seg + (j + 1) % seg; this.i.push(p0, p0 + seg, p1, p1, p0 + seg, p1 + seg); }
    if (cap) for (const [t, base, sgn] of [[0, st, -1], [1, st + rings * seg, 1]] as [number, number, number][]) {
      const ax = tan(t).multiplyScalar(sgn), r = t ? r1 : r0, tip = this.vert(at(t).addScaledVector(ax, r * 0.55), ax, col, t ? sw1 : sw0);
      for (let j = 0; j < seg; j++) { if (sgn < 0) this.i.push(base + (j + 1) % seg, base + j, tip); else this.i.push(base + j, base + (j + 1) % seg, tip); }
    }
  }
  // a smooth puff: a ball of radii rx, ry, rz (its underside flatter by `under`), gently lumpy; coloured from `deep`
  // (facing down) to `top` (facing up); its normals bent outward from `mid` by `bend`, so a heap of puffs is lit as one form
  blob(c: THREE.Vector3, rx: number, ry: number, rz: number, top: number[], deep: number[], sway: number, detail = 2, mid: THREE.Vector3 | null = null, bend = 0.5, under = 0.65, floor = -1e9) {
    const g = icoOf(detail), P = g.attributes.position, ix = g.index!.array, st = this.p.length / 3, s0 = this.R() * 40, j = this.rr(0.93, 1.07);
    const n3 = new THREE.Vector3(), q = new THREE.Vector3(), o = new THREE.Vector3();
    for (let k = 0; k < P.count; k++) {
      n3.set(P.getX(k), P.getY(k), P.getZ(k)).normalize();
      const lump = 1 + 0.07 * Math.sin(n3.x * 2.3 + s0) * Math.sin(n3.z * 2.1 + s0 * 1.3) + 0.04 * Math.sin(n3.y * 2.7 + s0 * 0.7), fy = n3.y < 0 ? under : 1;
      q.set(c.x + n3.x * rx * lump, Math.max(floor, c.y + n3.y * ry * fy * lump), c.z + n3.z * rz * lump);
      const nn = V(n3.x / rx, n3.y / (ry * fy), n3.z / rz).normalize();
      if (mid) { o.subVectors(q, mid).normalize(); nn.lerp(o, bend).normalize(); }
      const t = smooth(-0.55, 0.85, nn.y);
      this.vert(q, nn, mixC(deep, top, t).map((v) => v * j), sway * (0.6 + 0.4 * Math.max(0, n3.y)));
    }
    for (let k = 0; k < ix.length; k++) this.i.push(st + ix[k]);
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

// モクマオウ: a tall, thin, often leaning trunk with a few upward-angled limbs; the crown light and open, its
// grey-green jointed twigs hanging in soft drooping tufts (it is no pine) — airy enough to see the sky between
function casuarinaGeo() {
  const B = new Builder(mulberry32(41)), bark = [0.42, 0.35, 0.28];
  const lean = V(0.08, 1, 0.03).normalize();
  const trunkTop = lean.clone().multiplyScalar(0.92);
  B.tube(V(0, 0, 0), trunkTop, 0.022, 0.008, bark, 0, 0.3, 7, V(0.015, 0, 0), 4);
  const top = [0.56, 0.62, 0.42], deep = [0.2, 0.27, 0.17];
  for (let t = 0; t < 12; t++) {
    const h = 0.32 + t * 0.052 + B.R() * 0.04, a = t * 2.4 + B.R() * 0.6, len = 0.09 + Math.sin((1 - t / 12) * Math.PI * 0.85) * 0.16;
    const base = lean.clone().multiplyScalar(h), tip = base.clone().add(V(Math.cos(a) * len, len * 0.55, Math.sin(a) * len));   // (the limbs angle up)
    B.tube(base, tip, 0.007, 0.003, bark, h * 0.3, h * 0.5, 5);
    // a soft tuft hanging from the limb's end, longer than wide, and a smaller one partway along
    const r = 0.045 + len * 0.28;
    B.blob(tip.clone().add(V(0, -r * 0.55, 0)), r, r * 1.35, r * B.rr(0.85, 1.1), top, deep, h * 0.8, 2, null, 0, 0.8);
    if (len > 0.14) { const m = base.clone().lerp(tip, 0.5); B.blob(m.add(V(0, -r * 0.5, 0)), r * 0.7, r * 1.0, r * 0.7, top, deep, h * 0.7, 1, null, 0, 0.8); }
  }
  return B.geo();
}
// アダン: a short trunk on stilt roots, forking into branches, each ending in a spiral of long arching, sword-like
// leaves (folded along the midrib, paler above); a few dead leaves hang brown underneath; a ripe orange fruit
function pandanusGeo() {
  const B = new Builder(mulberry32(43)), bark = [0.48, 0.42, 0.33];
  const top = V(0.05, 0.42, 0);
  B.tube(V(0, 0.12, 0), top, 0.04, 0.03, bark, 0, 0.05, 7, V(0, 0, 0), 2);
  for (let k = 0; k < 6; k++) {   // prop roots, curving out to the sand
    const a = k / 6 * Math.PI * 2 + B.R() * 0.4;
    B.tube(V(0, 0.2 + B.R() * 0.08, 0), V(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15), 0.014, 0.011, [0.52, 0.44, 0.34], 0, 0, 5, V(Math.cos(a) * 0.03, 0.02, Math.sin(a) * 0.03), 2);
  }
  const heads = 2 + Math.floor(B.R() * 2);
  let fruit: THREE.Vector3 | null = null;
  for (let hI = 0; hI < heads; hI++) {
    const a = hI / heads * Math.PI * 2 + B.R();
    const tip = top.clone().add(V(Math.cos(a) * 0.22, 0.22 + B.R() * 0.12, Math.sin(a) * 0.22));
    B.tube(top, tip, 0.028, 0.022, bark, 0.05, 0.2, 6, V(0, 0.03, 0), 2);
    if (!fruit) fruit = tip.clone().add(V(Math.cos(a) * 0.03, -0.09, Math.sin(a) * 0.03));
    for (let l = 0; l < 12; l++) {
      const la = l * 2.4 + B.R() * 0.3, dead = l >= 10, up = dead ? -0.9 : 0.55 + B.R() * 0.5;   // the last few hang dead
      const dir = V(Math.cos(la), up, Math.sin(la)).normalize();
      const len = 0.42 + B.R() * 0.2, w = 0.034;
      const hi = dead ? [0.62, 0.48, 0.3] : [0.56, 0.68, 0.3], lo = dead ? [0.46, 0.34, 0.2] : [0.24, 0.4, 0.14];
      let p0 = tip.clone(), d = dir.clone();
      for (let s = 0; s < 4; s++) {   // arching: each segment droops more; folded up along the midrib
        const p1 = p0.clone().addScaledVector(d, len / 4);
        const side0 = V(-d.z, 0, d.x).normalize(), wa = w * (1 - s * 0.22), wb = w * (1 - (s + 1) * 0.22);
        const lift = (x: number) => V(0, x * 0.45, 0);
        const c0 = mixC(lo, hi, s / 4), c1 = mixC(lo, hi, (s + 1) / 4);
        for (const sg of [-1, 1]) {
          const e0 = p0.clone().addScaledVector(side0, sg * wa).add(lift(wa)), e1 = p1.clone().addScaledVector(side0, sg * wb).add(lift(wb));
          const nm = V(0, 1, 0).addScaledVector(side0, -sg * 0.5).addScaledVector(d, -0.3).normalize();
          const o = B.p.length / 3;
          B.vert(p0, nm, c0, 0.3 + s * 0.2); B.vert(e0, nm, c0, 0.3 + s * 0.2); B.vert(e1, nm, c1, 0.4 + s * 0.2); B.vert(p1, nm, c1, 0.4 + s * 0.2);
          B.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
        }
        p0 = p1; d.y -= 0.35; d.normalize();
      }
    }
  }
  // the fruit: a big orange ball of wedges hanging under the first head
  if (fruit) { B.tube(fruit.clone().add(V(0, 0.08, 0)), fruit.clone().add(V(0, 0.04, 0)), 0.008, 0.008, [0.4, 0.36, 0.2], 0.2, 0.25, 4); B.blob(fruit, 0.055, 0.07, 0.055, [0.95, 0.56, 0.16], [0.62, 0.3, 0.08], 0.25, 1, null, 0, 1); }
  return B.geo();
}
// クサトベラ (beach naupaka): a low, rounded mound of fleshy, glossy, bright leaves; モンパノキ (tree heliotrope):
// a small gnarled tree, its silvery felted leaves in a rounded heap of a crown
function shrubGeo(silver: boolean) {
  const B = new Builder(mulberry32(silver ? 47 : 45)), bark = [0.46, 0.4, 0.33];
  if (!silver) {
    const top = [0.32, 0.52, 0.18], deep = [0.11, 0.27, 0.09], mid = V(0, -0.05, 0);
    B.blob(V(0, 0.22, 0), 0.36, 0.3, 0.36, top, deep, 0.15, 3, mid, 0.45, 0.6, 0);
    for (let k = 0; k < 6; k++) {
      const an = k / 6 * 6.28 + B.rr(-0.3, 0.3), d = B.rr(0.3, 0.4), r = B.rr(0.2, 0.27);
      B.blob(V(Math.cos(an) * d, r * 0.55, Math.sin(an) * d), r, r * 0.85, r, top, deep, 0.2, 3, mid, 0.45, 0.6, 0);
    }
  } else {
    // a short crooked trunk, limbs out and up into the crown's puffs
    const top0 = V(B.rr(-0.06, 0.06), 0.24, B.rr(-0.06, 0.06)), cc = top0.clone().add(V(0, 0.28, 0));
    B.tube(V(0, 0, 0), top0, 0.055, 0.04, bark, 0, 0.05, 7, V(0.03, 0, 0), 3);
    const top = [0.42, 0.55, 0.38], deep = [0.2, 0.29, 0.18];
    B.blob(cc.clone().add(V(0, 0.12, 0)), 0.3, 0.24, 0.3, top, deep, 0.25, 2, cc, 0.5);
    for (let k = 0; k < 5; k++) {
      const an = k * 1.26 + B.R() * 0.5, e = cc.clone().add(V(Math.cos(an) * B.rr(0.24, 0.32), B.rr(-0.06, 0.06), Math.sin(an) * B.rr(0.24, 0.32)));
      B.tube(top0, e.clone().lerp(top0, 0.3), 0.03, 0.016, bark, 0.05, 0.25, 5, V(0, 0.04, 0));
      const r = B.rr(0.2, 0.26); B.blob(e, r, r * 0.8, r, top, deep, 0.3, 2, cc, 0.5);
    }
  }
  return B.geo();
}
// driftwood thrown up along the high-tide line: a bleached, smooth, gently bent log, rounded at the ends, a stub of a
// branch, the worn root plate at one end; and beach rocks: smooth, warm grey boulders
function driftGeo() {
  const B = new Builder(mulberry32(49)), col = [0.76, 0.72, 0.64];
  const a = V(-0.5, 0.05, 0), b = V(0.5, 0.04, B.rr(-0.06, 0.06));
  B.tube(a, b, 0.065, 0.042, col, 0, 0, 8, V(0, 0.01, B.rr(-0.05, 0.05)), 4, true);
  { const p = a.clone().lerp(b, B.rr(0.4, 0.7)), an = B.rr(0.5, 1.2); B.tube(p, p.clone().add(V(Math.cos(an) * 0.08, 0.1, Math.sin(an) * 0.06)), 0.025, 0.016, mixC(col, [0.7, 0.66, 0.58], 0.5), 0, 0, 6, V(0, 0, 0), 1, true); }
  // the root plate: three worn stubs splaying out
  for (let k = 0; k < 3; k++) { const an = k * 2.1 + B.R() * 0.4; B.tube(a, a.clone().add(V(-0.05, Math.sin(an) * 0.1 + 0.04, Math.cos(an) * 0.11)), 0.035, 0.016, [0.68, 0.63, 0.55], 0, 0, 5, V(0, 0, 0), 1, true); }
  return B.geo();
}
function rockGeo() {
  const R = mulberry32(51), g0 = new THREE.IcosahedronGeometry(1, 3); g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
  const g = mergeVertices(g0), P = g.attributes.position;
  const seed = R() * 40, C: number[] = [], W: number[] = [];
  for (let k = 0; k < P.count; k++) {
    const v = new THREE.Vector3(P.getX(k), P.getY(k), P.getZ(k)).normalize();
    const n1 = Math.sin(v.x * 2.6 + seed) * Math.sin(v.y * 2.2 + seed * 0.7) * Math.sin(v.z * 2.8 + seed * 1.3);
    const n2 = Math.sin(v.x * 4.5 + v.z * 3.5 + seed) * Math.sin(v.y * 4 - v.x * 2.5);
    const r = 1 + 0.16 * n1 + 0.05 * n2;   // (a worn boulder: broad, smooth swells only)
    P.setXYZ(k, v.x * r, Math.max(-0.2, v.y * 0.55 * r), v.z * r * 0.85);
    // warm grey limestone, pale and sun-bleached on top, darker and greener at the foot (wet, algae)
    const t = smooth(-0.35, 0.8, v.y), dk = 0.94 + 0.08 * n2;
    C.push((0.42 + 0.26 * t) * dk, (0.4 + 0.25 * t) * dk, (0.35 + 0.22 * t) * dk); W.push(0);
  }
  g.computeVertexNormals();
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 1));
  return g;
}
// (LAB: the beach plants' and things' geometries, for counting and portraits: scripts/_tris.ts)
export const __plantGeos = () => ({ casuarina: casuarinaGeo(), pandanus: pandanusGeo(), naupaka: shrubGeo(false), heliotrope: shrubGeo(true), drift: driftGeo(), rock: rockGeo() });
