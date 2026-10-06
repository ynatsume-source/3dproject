// Builds a sea from its description: seabed, reef, corals, anemones, garden eels and animals.
import { KELP_FLOOR, makeKelpForest } from './kelp';
import { buildLobosBenthos } from './lobos-benthos';
import { makeLobosVisitors } from '../eco/lobos-visitors';
import { makeLobosOtters } from '../eco/lobos-otters';
import { makeBreach } from '../eco/breach';
import * as THREE from 'three';
import { U, mat, VS_WORLD } from '../render/common';
import { SURFACE, SURF_UNIFORMS } from '../render/surface';
import { fbm, smooth, clamp, seedRandom, R, rr, pick, TERR } from '../core/math';
import { WORLD, LIMIT, HN, oceanScene } from './scenery';
import { CORAL_GEO, CORAL_MAT, CORAL_GEO_HI, CORAL_MAT_HI, PALETTE, makeTurtle, MANTA_GEO, mantaMaterial, _q, _e, _m4, _p3, _s3 } from './models';
import { makeFishSystem } from '../eco/fish';
import { makeShoalSystem } from '../eco/shoal';
import { makeRiders } from '../eco/riders';
import { makeCritters } from '../eco/critters';
import { makeRareEvents } from '../eco/events';
import { Ecosystem } from '../eco/ecosystem';
import { makeOctopi } from '../eco/octopus';
import { makeWhales } from '../eco/whale';
import { makeBirds } from '../eco/birds';
import { makeFlyingFish } from '../eco/flyingfish';
import { loneLength } from '../eco/growth';
import { makeBaitBall } from '../eco/baitball';
import { makeJacks } from '../eco/jacks';
import type { Sea } from '../data/locations';
import { Cave } from './cave';
import { Wreck, wreckMaterial } from './wreck';
import { buildShore, landUniforms, LAND_FLOOR } from './shore';
import { landOf } from './land';
import { classifyWater } from './water';
import { makeResidents } from '../robots/residents';
import { Bodies, bodyOf, type Body } from './substrate';

/* ================= building a sea ================= */
// Heights of everything solid standing on the seabed (rocks, coral colonies) on a 1 m grid, so animals
// and the drone can keep clear of them, not just of the terrain.
class ObstacleMap {
  readonly half: number; readonly N: number; readonly a: Float32Array;
  constructor(half: number) { this.half = half; this.N = Math.ceil(half * 2); this.a = new Float32Array(this.N * this.N).fill(-1e9); }
  stamp(x: number, z: number, r: number, top: number, sy: number) {
    const N = this.N, i0 = Math.max(0, Math.floor(x - r + this.half)), i1 = Math.min(N - 1, Math.ceil(x + r + this.half));
    const j0 = Math.max(0, Math.floor(z - r + this.half)), j1 = Math.min(N - 1, Math.ceil(z + r + this.half));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i + 0.5 - this.half - x, j + 0.5 - this.half - z) / Math.max(r, 0.3);
      if (d >= 1) continue;
      const v = top - d * d * sy * 0.5, k = j * N + i;
      if (v > this.a[k]) this.a[k] = v;
    }
  }
  // set a cell to at least this height (the forest canopy ashore)
  raise(x: number, z: number, top: number) {
    const i = Math.floor(x + this.half), j = Math.floor(z + this.half);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return;
    const k = j * this.N + i; if (top > this.a[k]) this.a[k] = top;
  }
  // conservative: the tallest of the four surrounding cells
  get(x: number, z: number) {
    const N = this.N, i = Math.max(0, Math.min(N - 2, Math.floor(x + this.half - 0.5))), j = Math.max(0, Math.min(N - 2, Math.floor(z + this.half - 0.5))), a = this.a;
    return Math.max(a[j * N + i], a[j * N + i + 1], a[(j + 1) * N + i], a[(j + 1) * N + i + 1]);
  }
}
/** The height of the ground as drawn: the mesh's flat triangles over a grid of `segs` cells, `half` either side
 *  (PlaneGeometry's own split of each cell), rather than the smooth land the residents walk on — what sits on the
 *  ground has to sit on this, or a shell is buried a few centimetres under the sand where the beach curves. NaN off it. */
export function drawnGrid(f: (x: number, z: number) => number, half: number, segs: number) {
  const cell = (2 * half) / segs;
  return (x: number, z: number) => {
    const gx = (x + half) / cell, gz = (z + half) / cell, i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= segs || j >= segs) return NaN;
    const u = gx - i, v = gz - j, x0 = -half + i * cell, z0 = -half + j * cell;
    const ha = f(x0, z0), hb = f(x0, z0 + cell), hc = f(x0 + cell, z0 + cell), hd = f(x0 + cell, z0);
    return u + v <= 1 ? ha + u * (hd - ha) + v * (hb - ha) : hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc);
  };
}
export function makeT(loc) {
  const T: any = {
    obst: null as ObstacleMap | null,
    cave: null as Cave | null,
    // the seabed, or the top of a cave massif (animals keep to the outside of it)
    h: (x, z) => T.cave ? Math.max(loc.f(x, z), T.cave.topAt(x, z)) : loc.f(x, z),
    // the highest solid surface: terrain, a cave massif, or a rock or coral colony standing on it
    top: (x, z) => Math.max(T.h(x, z), T.obst ? T.obst.get(x, z) : -1e9, T.roof ? T.roof.get(x, z) : -1e9),
    roof: null as ObstacleMap | null,   // (what stands up on a cave's rock: in T.top for the animals over it, not in T.ground — the floor the drone keeps above, also inside the tunnel under it)
    // what the drone stands off from outside the cave: the massif itself it avoids in 3D (cave.sd)
    ground: (x, z) => Math.max(loc.f(x, z), T.obst ? T.obst.get(x, z) : -1e9, T.over ? T.over(x, z) : -1e9),
    over: null as null | ((x: number, z: number) => number),   // ashore: the treetops
    reef: (x, z) => { loc.f(x, z); return TERR.reef; },
    // enough water here (seas with land: the island and its beach are off limits to swimmers)
    wet: (x: number, z: number, need = 1.3) => loc.f(x, z) < -need,
    // how far to turn something at (x, z) heading `head`, so it keeps out of water shallower than `need`
    // `look` metres ahead: toward deeper water, down the slope
    shore: (x: number, z: number, head: number, look: number, need = 1.3) => {
      if (!loc.land || loc.f(x + Math.cos(head) * look, z + Math.sin(head) * look) < -need) return 0;
      const gx = loc.f(x + 2, z) - loc.f(x - 2, z), gz = loc.f(x, z + 2) - loc.f(x, z - 2);
      const d = Math.atan2(-gz, -gx) - head; return Math.atan2(Math.sin(d), Math.cos(d));
    },
    slope: (x, z) => Math.hypot(loc.f(x + 0.7, z) - loc.f(x - 0.7, z), loc.f(x, z + 0.7) - loc.f(x, z - 0.7)) / 1.4,
  };
  return T;
}
const CELL = 40;
const _qUp = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _vUp = new THREE.Vector3();
export function addInstanced(kind, variant, items, group, cells) {
  const base = CORAL_GEO[kind][variant], material = CORAL_MAT[kind];
  const bucket = new Map();
  for (const it of items) { const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(it); }
  for (const [k, arr] of bucket) {
    const g = new THREE.BufferGeometry();
    for (const name in base.attributes) g.setAttribute(name, base.attributes[name]);
    g.setIndex(base.index);
    const col = new Float32Array(arr.length * 3), col2 = new Float32Array(arr.length * 3), seed = new Float32Array(arr.length);
    const mesh = new THREE.InstancedMesh(g, material, arr.length);
    arr.forEach((it, i) => {
      _q.setFromEuler(_e.set(it.tx || 0, it.ry, it.tz || 0));
      if (it.up) _q.premultiply(_qUp.setFromUnitVectors(_Y, _vUp.fromArray(it.up)));   // (grown square to the slope it stands on)
      _m4.compose(_p3.set(it.x, it.y, it.z), _q, _s3.set(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, _m4);
      col.set(it.c, i * 3); col2.set(it.c2, i * 3); seed[i] = it.seed;
    });
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    g.setAttribute('aCol2', new THREE.InstancedBufferAttribute(col2, 3));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    mesh.frustumCulled = false;
    group.add(mesh);
    // the close-up version shares the instances; each vertex shader keeps only its own distance band
    let hi: THREE.InstancedMesh | null = null;
    const hiBase = CORAL_GEO_HI[kind]?.[variant];
    if (hiBase) {
      const hg = new THREE.BufferGeometry();
      for (const name in hiBase.attributes) hg.setAttribute(name, hiBase.attributes[name]);
      hg.setIndex(hiBase.index);
      for (const name of ['aCol', 'aCol2', 'aSeed']) hg.setAttribute(name, g.attributes[name]);
      hi = new THREE.InstancedMesh(hg, CORAL_MAT_HI[kind], arr.length);
      hi.instanceMatrix = mesh.instanceMatrix;
      hi.frustumCulled = false;
      group.add(hi);
    }
    const [ci, cj] = k.split(',').map(Number);
    cells.push({ x: (ci + 0.5) * CELL, z: (cj + 0.5) * CELL, mesh, hi });
  }
}
// living coral is less saturated than the textbook: pull palettes a quarter of the way to grey
export function tintCol(c, k = 0.1) {
  const t = 1 + (R() - 0.5) * 2 * k, g = (c[0] + c[1] + c[2]) / 3;
  const v = 0.85 * t;
  return [(g + (c[0] - g) * 0.72) * v, (g + (c[1] - g) * 0.72) * v, (g + (c[2] - g) * 0.72) * v];
}

/** How high a coral colony may grow: this far under the mean surface (m). The swell's troughs still bare the
 *  tallest heads on a rough day for a moment, as on a real reef flat at low water; none stands out of the sea
 *  for good. (The rendered sea has no tide: src/ocean/air.ts.) */
export const CORAL_CEIL = -0.35;
// (each form's own height and half-width per unit of scale, from its geometry, the close-up version included)
const geoTop = new Map<string, [number, number]>();
function coralTop(kind: string, v: number): [number, number] {
  const key = kind + v;
  let t = geoTop.get(key);
  if (!t) {
    let top = 0, half = 0;
    for (const g of [CORAL_GEO[kind][v], CORAL_GEO_HI[kind]?.[v]]) if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox; top = Math.max(top, b.max.y); half = Math.max(half, -b.min.x, b.max.x, -b.min.z, b.max.z);
    }
    geoTop.set(key, t = [top, half]);
  }
  return t;
}
// the smallest a colony of each form is drawn (m of scale): a young one, where the water is too shallow for more
const CORAL_MIN: Record<string, number> = { branch: 0.35, table: 0.45, brain: 0.3, fan: 0.5, mushroom: 0.35, clam: 0.25 };
/** A colony to fit under the water where it grows (its top no higher than CORAL_CEIL): left as it is, or the
 *  same form grown less (a younger colony, its proportions kept — never squashed), or, where even a young one
 *  would stand out of the water, none (false). y0: the floor; sink: how far a domed form sits into it per unit
 *  of its scale (it.y = y0 - sink * scale) — the rest sit a fixed depth into it. */
function fitUnder(kind: string, v: number, it: any, y0: number, sink = 0) {
  const [top, half] = coralTop(kind, v), s = Math.max(it.sx, it.sz);
  // (a tilt lifts one edge: its sine times the half-width)
  const lift = (Math.abs(it.tx || 0) + Math.abs(it.tz || 0) + (it.up ? Math.sqrt(Math.max(0, 1 - it.up[1] * it.up[1])) : 0)) * half * s;
  const H = top * it.sy + lift, fixed = sink ? 0 : y0 - it.y, dp = sink ? y0 - it.y : 0;
  if (y0 - fixed + H - dp <= CORAL_CEIL) return true;
  const f = (CORAL_CEIL - y0 + fixed) / Math.max(1e-6, H - dp);
  if (!(f > 0) || s * f < CORAL_MIN[kind]) return false;
  it.sx *= f; it.sy *= f; it.sz *= f;
  if (sink) it.y = y0 - (y0 - it.y) * f;
  return true;
}

/** A colony set down on the reef under all of it, not on the one point under its middle: on a rim or a slope the
 *  side over the drop would stand in the water. Lowered to the low side (the high side then grows into the rock,
 *  as on a real reef), or, where that would bury too much of it, not here at all (null). Returns the floor it now
 *  stands on. f: the floor height at a point. (A table stands on its stalk: only that has to meet the rock; so do a leather coral's cap and a soft-coral tree —
 *  a finger leather coral is a lobed mound, all of it on the rock.) */
function seat(kind: string, v: number, it: any, y0: number, f: (x: number, z: number) => number) {
  const [top, half] = coralTop(kind, v), s = Math.max(it.sx, it.sz);
  const foot = (kind === 'table' ? 0.2 : kind === 'fan' ? 0.25 : kind === 'mushroom' ? (v === 1 ? 0.9 : 0.3) : kind === 'brain' || kind === 'clam' ? 1.0 : 0.75) * half * s;
  // a dome, a clam or a leather coral grows square to the rock under it: on a slope, tilted with it (up to 45°); a
  // branching colony reaches up for the light, so leans only a little (20°). A table and a sea fan stay upright.
  let kx = 0, kz = 0;
  const lean = kind === 'table' || kind === 'fan' ? 0 : kind === 'branch' ? 0.35 : 0.785;
  if (lean > 0) {
    const r = Math.max(foot, 0.3);
    const gx = (f(it.x + r, it.z) - f(it.x - r, it.z)) / (2 * r), gz = (f(it.x, it.z + r) - f(it.x, it.z - r)) / (2 * r), g = Math.hypot(gx, gz);
    if (g > 0.05) {
      const k = Math.min(g, Math.tan(lean)) / g; kx = gx * k; kz = gz * k;
      const n = new THREE.Vector3(-kx, 1, -kz).normalize(); it.up = [n.x, n.y, n.z];
    }
  }
  let lo = 1e9;
  for (const ring of [0.5, 1]) for (let k = 0; k < 12; k++) { const a = (k + ring) * Math.PI / 6, dx = Math.cos(a) * foot * ring, dz = Math.sin(a) * foot * ring; lo = Math.min(lo, f(it.x + dx, it.z + dz) - kx * dx - kz * dz); }
  const drop = y0 - Math.min(lo, y0) - (0.06 + 0.04 * s);
  if (drop <= 0) return y0;
  if (drop > 0.45 * top * it.sy) { it.up = undefined; return null; }
  it.y -= drop;
  return y0 - drop;
}

export function buildOcean(loc) {
  seedRandom(loc.seed);
  const T = makeT(loc);
  const obst = new ObstacleMap(loc.land ? loc.land.far : LIMIT + 45);   // (by an island, over the whole of it: its reef is filled in as the camera comes near — see grow)
  T.obst = obst;
  const cave = loc.cave ? new Cave(loc.cave, loc.f) : null;
  if (cave) T.roof = new ObstacleMap(obst.half);   // (see T.roof)
  T.cave = cave;
  const group = new THREE.Group();
  const oc: any = { loc, T, group, cave, cells: [], anemones: [], fish: [], turtles: [], mantas: [], colonies: [], grassTex: null, eco: null };
  oc.water = classifyWater(loc.f, loc.land ? loc.land.far : 0);   // what kind of water is where: the sea, a lagoon, a pool cut off from it (src/ocean/water.ts)
  // a wreck on the sand: solid to everything that swims (its outline into the obstacle map)
  const wreck = loc.wreck ? new Wreck(loc.wreck, loc.f) : null;
  if (wreck) {
    oc.wreck = wreck;
    const m = new THREE.Mesh(wreck.geo, wreckMaterial()); m.frustumCulled = false; group.add(m);
    for (const p of wreck.pts) obst.raise(p.x, p.z, p.y + 0.3);
  }
  const underWreck = (x: number, z: number, h: number) => !!wreck && obst.get(x, z) > h + 0.8;

  const seabedSurface = loc.habitat === 'kelp' ? KELP_FLOOR : SURFACE;

  // seabed
  const SEGS = 420;
  const floorGeo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, SEGS, SEGS);
  { const near = drawnGrid(loc.f, WORLD, SEGS); T.drawn = (x: number, z: number) => { const h = near(x, z); return Number.isNaN(h) ? loc.f(x, z) : h; }; }
  floorGeo.rotateX(-Math.PI / 2);
  {
    const p = floorGeo.attributes.position, r = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, loc.f(x, z)); r[i] = TERR.reef; }
    floorGeo.setAttribute('aReef', new THREE.BufferAttribute(r, 1));
    floorGeo.computeVertexNormals();
    // ambient occlusion from the height grid: how much of the sky each point sees past its neighbours
    const N = SEGS + 1, cell = (WORLD * 2) / SEGS, ao = new Float32Array(p.count), Y = p.array as Float32Array;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], reach = [1, 3, 7];
    // (the steepest of the three rises, then one angle for it: the angle grows with the rise, so it is the same horizon)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h0 = Y[(j * N + i) * 3 + 1];
      let occ = 0;
      for (const [dx, dz] of dirs) {
        let m = 0;
        for (const k of reach) {
          const ii = Math.min(N - 1, Math.max(0, i + dx * k)), jj = Math.min(N - 1, Math.max(0, j + dz * k));
          m = Math.max(m, (Y[(jj * N + ii) * 3 + 1] - h0) / (k * cell * Math.hypot(dx, dz)));
        }
        occ += Math.atan(m) / (Math.PI / 2);
      }
      ao[j * N + i] = 1 - Math.min(0.7, (occ / dirs.length) * 1.7);
    }
    floorGeo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  }
  // (by an island, dry land is the aerial photograph, lit by the open air)
  const land = loc.land ? landOf(loc.id) : undefined;
  // (by an island: a triangle wholly under the water is drawn as seabed alone, one wholly on dry land as land alone,
  // and only those across the shore work out both and blend them — every pixel of the island no longer pays for the reef)
  const floorMat = (defs: Record<string, number>) => mat(
    `attribute float aReef; attribute float aAO; varying vec3 vWp; varying vec3 vN; varying float vReef; varying float vAO;
     void main(){ vWp = position; vN = normal; vReef = aReef; vAO = aAO; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    seabedSurface + (land ? LAND_FLOOR : '') + `varying vec3 vWp; varying vec3 vN; varying float vReef; varying float vAO;
     void main(){
       #ifdef LAND_ONLY
       vec3 col = vec3(0.0);
       #else
       vec3 n;
       vec3 alb = reefSurface(vWp, normalize(vN), vReef, n) * vAO;
       vec3 col = shade(alb, vWp, n, ${loc.habitat === 'kelp' ? '0.35' : '0.95'});
       #endif
       #ifdef LAND
       #ifdef LAND_ONLY
       float dry = 1.0;
       #else
       float dry = smoothstep(-0.1, 0.06, vWp.y);
       #endif
       vec3 la = landAlbedo(vWp) * mix(1.0, vAO, 0.5);
       col = mix(col, fogIt(airLit(la, landNormal(vWp, normalize(vN)), vWp, 0.0), vWp), dry);
       #endif
       gl_FragColor = vec4(col, 1.0);
     }`, { uniforms: { ...SURF_UNIFORMS, ...(land ? landUniforms(land) : {}) }, defines: defs });
  const shoreMat = floorMat(land ? { LAND: 1 } : {});
  let floorMats: THREE.Material | THREE.Material[] = shoreMat;
  if (land) {
    const p = floorGeo.attributes.position, ix = floorGeo.index!, wet: number[] = [], dryT: number[] = [], both: number[] = [];
    for (let t = 0; t < ix.count; t += 3) {
      const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
      const lo = Math.min(p.getY(a), p.getY(b), p.getY(c)), hi = Math.max(p.getY(a), p.getY(b), p.getY(c));
      (hi < -0.1 ? wet : lo > 0.06 ? dryT : both).push(a, b, c);
    }
    floorGeo.setIndex([...wet, ...dryT, ...both]);
    floorGeo.addGroup(0, wet.length, 0); floorGeo.addGroup(wet.length, dryT.length, 1); floorGeo.addGroup(wet.length + dryT.length, both.length, 2);
    floorMats = [floorMat({}), floorMat({ LAND: 1, LAND_ONLY: 1 }), shoreMat];
  }
  const floor = new THREE.Mesh(floorGeo, floorMats);
  if (!loc.pelagic) group.add(floor);   // the open ocean has no bottom within sight
  // an island larger than the modelled sea: the rest of it, and the lagoon round it, more coarsely
  if (land) {
    const E1 = land.far.half - 6, S = 3, N = Math.round(2 * E1 / S) + 1;
    { const near = drawnGrid(loc.f, WORLD, SEGS), far = drawnGrid(loc.f, E1, N - 1); T.drawn = (x: number, z: number) => { let h = near(x, z); if (Number.isNaN(h)) h = far(x, z); return Number.isNaN(h) ? loc.f(x, z) : h; }; }
    const g = new THREE.PlaneGeometry(2 * E1, 2 * E1, N - 1, N - 1); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, loc.f(p.getX(i), p.getZ(i)));
    g.setAttribute('aReef', new THREE.BufferAttribute(new Float32Array(p.count), 1));
    g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(p.count).fill(1), 1));
    const ix = g.index!.array, keep: number[] = [];
    for (let t = 0; t < ix.length; t += 3) {   // leave out what the fine floor covers
      let inside = true;
      for (let k = 0; k < 3; k++) { const v = ix[t + k]; if (Math.max(Math.abs(p.getX(v)), Math.abs(p.getZ(v))) > WORLD - 1) inside = false; }
      if (!inside) keep.push(ix[t], ix[t + 1], ix[t + 2]);
    }
    g.setIndex(keep); g.computeVertexNormals();
    const outer = new THREE.Mesh(g, shoreMat); outer.frustumCulled = false;
    group.add(outer);
  }

  // grass heightmap (only seas with seagrass)
  if (loc.grass) {
    const hdata = new Float32Array(HN * HN * 4);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const x = -WORLD + (i + 0.5) / HN * 2 * WORLD, z = -WORLD + (j + 0.5) / HN * 2 * WORLD, k = (j * HN + i) * 4;
      hdata[k] = loc.f(x, z); hdata[k + 1] = loc.grass(x, z); hdata[k + 3] = 1;
    }
    oc.grassTex = new THREE.DataTexture(hdata, HN, HN, THREE.RGBAFormat, THREE.FloatType);
    oc.grassTex.minFilter = oc.grassTex.magFilter = THREE.NearestFilter; oc.grassTex.needsUpdate = true;
  }

  // corals: sample the reef, pick a form by depth / slope / sea
  const newItems = () => ({ branch: [[], [], []], table: [[]], brain: [[], []], fan: [[], []], mushroom: [[], [], []], anemone: [[]], clam: [[]], eel: [[]] });
  const items = newItems();
  const EXT = LIMIT + 45, STEP = 1.1;   // (more chances than colonies: those that would run into another are not grown — src/ocean/substrate.ts)
  const samples = [];
  let sum = 0;
  for (let x = -EXT; x < EXT; x += STEP) for (let z = -EXT; z < EXT; z += STEP) {
    const jx = x + (R() - 0.5) * STEP, jz = z + (R() - 0.5) * STEP;
    const h = loc.f(jx, jz), r = TERR.reef;
    if (r < 0.05) continue;
    samples.push([jx, jz, h, r]); sum += r * r * 1.6;
  }
  const target = 19000, accept = Math.min(1, target / Math.max(sum, 1));
  const W = loc.corals;
  // one coral where the reef was sampled (the same for the sea round the drone at the start and, by an
  // island, for each stretch of reef further off as the camera comes near it: see grow() below)
  // Staghorn thickets: on a sea that has them, patches of the shallow, gentle reef where branching Acropora
  // has grown into one tangled carpet (how much of the reef: loc.thicket). Where it is, h is the depth there.
  const TH = loc.thicket ?? 0;
  // (the cheap factors first: most of the reef is not thicket, and there the reef cover and the slope — five more samples
  // of the terrain — are not needed. The product is taken in the same order, so the value is the same to the last bit.)
  const thicketK = (x: number, z: number, h: number) => {
    if (TH <= 0) return 0;
    const dA = smooth(-15, -7, h), dB = 1 - smooth(-1.4, -0.7, h);
    if (dA === 0 || dB === 0) return 0;
    const fb = smooth(0.5, 0.6, fbm(x * 0.021 + 7.3, z * 0.021 - 2.1, 3));
    if (fb === 0) return 0;
    loc.f(x, z);   // (TERR.reef for this spot)
    const rf = smooth(0.15, 0.45, TERR.reef);
    if (rf === 0) return 0;
    return TH * fb * dA * dB * rf * (1 - smooth(0.45, 0.85, T.slope(x, z)));
  };
  oc.thicketAt = (x: number, z: number) => thicketK(x, z, loc.f(x, z));   // (how much of a thicket is here: where a visit starts, src/ocean/start.ts)
  const thicketIn = (x0: number, z0: number, x1: number, z1: number, items: any, skip: ((x: number, z: number) => boolean) | null) => {
    const S = 0.9, pal = PALETTE.thicket;
    for (let x = x0; x < x1; x += S) for (let z = z0; z < z1; z += S) {
      const jx = x + (R() - 0.5) * S * 0.9, jz = z + (R() - 0.5) * S * 0.9, q = R();
      if (skip && skip(jx, jz)) continue;
      const h = loc.f(jx, jz), k = thicketK(jx, jz, h);
      if (q > k * 1.6) continue;
      if ((cave && cave.routeDist(jx, jz) < 3.5) || underWreck(jx, jz, h)) continue;
      // (mostly the tangle itself; here and there a corymbose dome among it)
      const dome = R() < 0.12, s = dome ? rr(0.9, 1.5) : rr(1.0, 1.55) * (0.75 + 0.25 * Math.min(1, k));
      const it: any = { x: jx, z: jz, y: h - 0.1, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.15), sz: s * rr(0.85, 1.15) };
      // (neighbours mostly of one colour, as a thicket is often one or a few colonies grown together)
      const c = pal[Math.floor(fbm(jx * 0.15 + 3, jz * 0.15, 2) * pal.length * 1.6 + R() * 0.8) % pal.length];
      it.c = tintCol(c[0], 0.14); it.c2 = tintCol(c[1], 0.1); it.seed = R();
      if (!fitUnder('branch', dome ? 1 : 2, it, h)) continue;   // (its top under the water)
      items.branch[dome ? 1 : 2].push(it);
      obst.stamp(jx, jz, 0.6 * it.sx, it.y + (dome ? 0.3 : 0.62) * it.sy, it.sy);
    }
  };
  const coralAt = (x: number, z: number, h: number, items: any) => {
    if (cave && cave.routeDist(x, z) < 3.5) return;                     // keep the way into the cave open
    if (underWreck(x, z, h)) return;                                      // (nothing grows under her)
    if (TH > 0 && R() < thicketK(x, z, h) * 0.7) return;                 // (inside a thicket: mostly the thicket)
    const sl = T.slope(x, z);
    const shallow = smooth(-20, -6, h);
    const w = {
      branch: W.branch * (0.3 + shallow) * (1 - smooth(0.6, 1.2, sl)),
      table: W.table * (0.2 + shallow) * (1 - smooth(0.25, 0.7, sl)),
      brain: W.brain * (1 - smooth(0.8, 1.4, sl) * 0.7),
      fan: W.fan * (0.15 + 2 * smooth(0.35, 1.0, sl)) * (1.2 - shallow * 0.6),
      mushroom: W.mushroom * (0.6 + 0.4 * smooth(0.2, 0.8, sl)),
      clam: W.clam * shallow * (1 - smooth(0.3, 0.7, sl)),
    };
    let tot = 0; for (const k in w) tot += w[k];
    if (!(tot > 0)) return; // no coral forms configured (e.g. a temperate kelp forest)
    let q = R() * tot, kind = 'brain';
    for (const k in w) { q -= w[k]; if (q <= 0) { kind = k; break; } }
    const pal = pick(PALETTE[kind]), seed = R();
    let s, it, vi = 0, sink = 0;
    const y0 = loc.f(x, z);
    if (kind === 'branch') { s = rr(0.6, 1.7); it = { x, z, y: y0 - 0.08, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.2), sz: s }; vi = R() < 0.55 ? 0 : 1; }
    else if (kind === 'table') { s = rr(0.7, 2.1) * (0.6 + 0.6 * shallow); it = { x, z, y: y0 - 0.05, ry: R() * 6.28, sx: s, sy: rr(0.7, 1.1), sz: s * rr(0.85, 1.1), tx: (R() - 0.5) * 0.12, tz: (R() - 0.5) * 0.12 }; }
    else if (kind === 'brain') {
      s = Math.pow(R(), 1.8) * 1.8 + 0.35; it = { x, z, y: y0 - 0.2 * s, ry: R() * 6.28, sx: s, sy: s * rr(0.7, 1.3), sz: s * rr(0.8, 1.2) }; sink = 0.2;
      if (R() < 0.45) { it.porites = true; vi = 1; }
    }
    else if (kind === 'fan') { s = rr(0.9, 2.0); it = { x, z, y: y0 - 0.05, ry: (R() - 0.5) * 0.5, sx: s, sy: s, sz: s, tx: (R() - 0.5) * 0.2 }; vi = R() < 0.5 ? 0 : 1; }
    else if (kind === 'mushroom') {
      // soft corals: leather coral, finger leather coral, or a soft-coral tree (commonest on Maldivian thilas)
      const w = loc.id === 'maldives' || loc.id === 'redsea' ? [0.3, 0.3, 0.4] : loc.id === 'galapagos' ? [0.35, 0.25, 0.4] : loc.id === 'gbr' ? [0.45, 0.4, 0.15] : [0.5, 0.4, 0.1];
      const q = R(), v = q < w[0] ? 0 : q < w[0] + w[1] ? 1 : 2;
      s = v === 2 ? rr(0.6, 1.3) : rr(0.6, 1.4);
      it = { x, z, y: y0 - 0.05, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.2), sz: s, soft: v }; vi = v;
    }
    else { s = rr(loc.clamSize[0], loc.clamSize[1]); it = { x, z, y: y0 - 0.06 * s, ry: R() * 6.28, sx: s, sy: s, sz: s }; sink = 0.06; }
    const pl = it.porites ? pick(PALETTE.porites) : it.soft === 1 ? pick(PALETTE.sinularia) : it.soft === 2 ? pick(PALETTE.dendro) : pal;
    it.c = tintCol(pl[0]); it.c2 = tintCol(pl[1]); it.seed = seed + (it.porites ? 1 : 0);
    // (its top under the water: grown less where the water is shallow, or not here at all — the random draws
    // above are the same either way, so the rest of the reef is laid out as before)
    const y1 = seat(kind, vi, it, y0, loc.f); loc.f(x, z);   // (loc.f again: TERR is this spot's once more)
    if (y1 === null || !fitUnder(kind, vi, it, y1, sink)) return;
    it.floor = y1;   // (what it stands on: if it is moved off a rock, it is set down again from here)
    items[kind][vi].push(it);
    const TOP: Record<string, [number, number]> = { branch: [0.55, 0.95], table: [1.0, 0.55], brain: [1.0, 0.75], mushroom: [0.5, 0.55], fan: [0.45, 1.12], clam: [0.4, 0.3] };
    if (TOP[kind]) obst.stamp(x, z, TOP[kind][0] * Math.max(it.sx, it.sz), it.y + TOP[kind][1] * it.sy, it.sy);
  };
  for (const [x, z, h, r] of samples) { if (R() > r * r * accept * 1.6) continue; coralAt(x, z, h, items); }
  thicketIn(-EXT, -EXT, EXT, EXT, items, null);

  // anemones, each home to a few clownfish
  const nearAnemone = (x: number, z: number, r: number) => oc.anemones.some((a: any) => Math.hypot(a.pos.x - x, a.pos.z - z) < a.s * 0.75 + r + 0.3);
  const clown = loc.species.find((s) => s.habitat === 'anemone');
  for (let tries = 0; oc.anemones.length < loc.anemones && tries < 4000; tries++) {
    const x = rr(-LIMIT, LIMIT), z = rr(-LIMIT, LIMIT), h = loc.f(x, z), r = TERR.reef;
    if (r < 0.4 || h < -20 || h > (loc.land ? -1.5 : -2.5) || T.slope(x, z) > 0.8) continue;   // (not up on a reef top just under the surface: its fish would be pinned there)
    // (on open reef, not inside a coral that already stands there)
    let blocked = false;
    for (let k = 0; k < 6 && !blocked; k++) { const a = k * 1.047; if (obst.get(x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7) > h + 0.15) blocked = true; }
    if (blocked || obst.get(x, z) > h + 0.15) continue;
    const s = rr(1.0, 1.7), pal = pick(PALETTE.anemone);
    items.anemone[0].push({ x, z, y: h - 0.04, ry: R() * 6.28, sx: s, sy: s * rr(0.9, 1.2), sz: s, c: tintCol(pal[0]), c2: tintCol(pal[1]), seed: R() });
    oc.anemones.push({ pos: new THREE.Vector3(x, h + 0.28 * s, z), s, species: clown && clown.id });
  }
  // garden eel colonies on open sand
  for (let tries = 0; oc.colonies.length < loc.eels && tries < 3000; tries++) {
    const x = rr(-LIMIT, LIMIT), z = rr(-LIMIT, LIMIT), h = loc.f(x, z);
    if (TERR.reef > 0.02 || h < -24 || h > -6 || T.slope(x, z) > 0.2 || (cave && cave.foot(x, z) > 0) || underWreck(x, z, h)) continue;
    const pos = new THREE.Vector3(x, h, z);
    if (oc.colonies.some((c) => c.pos.distanceTo(pos) < 18)) continue;
    oc.colonies.push({ pos });
    const n = 16 + Math.floor(R() * 16);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * 3.2, ex = x + Math.cos(a) * d, ez = z + Math.sin(a) * d;
      items.eel[0].push({ x: ex, z: ez, y: loc.f(ex, ez) - 0.02, ry: 0.3 + (R() - 0.5) * 0.4, sx: 1, sy: rr(0.35, 0.55), sz: 1, c: [0.88, 0.88, 0.8], c2: [0.08, 0.08, 0.08], seed: R() });
    }
  }
  if (cave) buildCave(cave, group, items);
  // soft-coral trees on her upward faces, and the odd sea fan
  if (wreck) for (const u of wreck.up) {
    const s = rr(0.3, 0.75), fan = R() < 0.2, pal = pick(fan ? PALETTE.fan : PALETTE.dendro);   // (small: not hiding her frames)
    const it: any = { x: u.p.x, z: u.p.z, y: u.p.y - 0.06, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.3), sz: s, c: tintCol(pal[0]), c2: tintCol(pal[1]), seed: R() };
    if (fan) items.fan[0].push(it); else { it.soft = 2; items.mushroom[2].push(it); }
  }
  if (land) oc.shore = buildShore(loc, group, T, obst);
  if (loc.residents) {
    const lanternStudy = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lantern-study');
    T.water = oc.water.at;   // (where the residents may go into the water: the sea, not a pool cut off from it)
    oc.residents = makeResidents(loc, T, loc.species.filter((s: any) => !s.big).map((s: any) => s.ja), (loc.birds || []).map((b: any) => b.ja), { lanternStudy });
    group.add(oc.residents.group);
  }
  // (the corals are drawn once the rocks are down: see clearOfRocks, after placeRocks below)

  // life and litter on the sand: broken coral, shells, sea cucumbers and blue starfish (placed over an area:
  // the sea round the drone now, and by an island each stretch further off as the camera comes near it)
  let placeLitter: ((x0: number, z0: number, x1: number, z1: number, frac: number, skip: ((x: number, z: number) => boolean) | null, cells: any[]) => void) | null = null;
  if (!loc.pelagic && loc.habitat !== 'kelp') {   // (none of this in a kelp forest's cold water)
    const debris: { geo: THREE.BufferGeometry; type: number }[] = [
      { geo: fragmentGeo(1), type: 0 }, { geo: fragmentGeo(2), type: 0 },
      { geo: bivalveGeo(), type: 0 }, { geo: coneShellGeo(), type: 0 },
      { geo: cucumberGeo(3), type: 1 }, { geo: starfishGeo(), type: 2 },
    ];
    const lean = loc.id === 'maldives' ? 0.5 : 1;
    const want = [2600 * lean, 1800 * lean, 900 * lean, 600 * lean, 90 * lean, 70 * lean];
    const MAT = [0, 1, 2].map((type) => mat(
      `attribute vec3 aCol; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying vec3 vCol;
       void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWp = w.xyz;
         vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
         vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (sc * sc))); vL = position; vCol = aCol; gl_Position = projectionMatrix * viewMatrix * w; }`,
      SURFACE + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying vec3 vCol;
       void main(){
         vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
         vec3 alb = vCol * (0.85 + 0.25 * vn2(vL.xz * 60.0 + vL.y * 40.0));
         #if TYPE == 0
           alb = mix(alb, alb * vec3(0.72, 0.82, 0.66), smoothstep(0.4, 0.8, vn2(vL.xz * 25.0 + vL.y * 12.0)) * 0.7);   // dead rubble greys over with algae film
         #elif TYPE == 1
           alb = mix(alb, uSand * 0.8, smoothstep(0.6, 0.85, vn2(vL.xz * 90.0)) * 0.3 * smoothstep(0.03, 0.07, vL.y));   // black sea cucumbers coat themselves in sand
           n = bumpN(n, vWp, smoothstep(0.3, 0.9, vn2(vL.xz * 70.0 + vL.y * 30.0)) * 0.004);
         #elif TYPE == 2
           n = bumpN(n, vWp, cellF1(vL.xz * 180.0) * 0.0015);
         #endif
         alb *= mix(0.55, 1.0, smoothstep(-0.01, 0.02, vL.y));
         gl_FragColor = vec4(shade(alb, vWp, n, 0.9), 1.0);
       }`, { defines: { TYPE: type }, uniforms: SURF_UNIFORMS, opts: { side: THREE.DoubleSide } }));
    placeLitter = (x0, z0, x1, z1, frac, skip, cells) => {
      const lists: any[][] = debris.map(() => []);
      for (let tries = 0; tries < 60000 * frac; tries++) {
        const x = rr(x0, x1), z = rr(z0, z1);
        if (skip && skip(x, z)) continue;
        const h = loc.f(x, z), r = TERR.reef;
        const k = Math.floor(R() * debris.length), list = lists[k];
        if (list.length >= want[k] * frac) continue;
        if (cave && cave.sd(x, h + 0.05, z) < 0.1) continue;                     // not buried in the cave rock
        if (h > -0.5) continue;                                                    // (not up on the beach)
        if (k === 5 ? r < 0.05 || r > 0.8 : r > 0.45) continue;                  // starfish on rubble and reef edge, the rest on sand
        if (k < 4 && R() > 0.25 + r * 1.5) continue;                              // litter thickest near the reef
        const s = k === 4 ? rr(1.1, 1.7) : k === 5 ? rr(0.7, 1.2) : rr(0.6, 1.6);
        const col = k === 4 ? [0.08, 0.075, 0.07] : k === 5 ? [0.16, 0.34, 0.86] : tintCol(pick([[0.92, 0.9, 0.84], [0.86, 0.8, 0.72], [0.8, 0.72, 0.7], [0.9, 0.86, 0.78]]));
        list.push({ x, z, y: h + (k === 4 ? 0.02 : 0.005), ry: R() * 6.28, tx: (R() - 0.5) * 0.3, tz: (R() - 0.5) * 0.3, sx: s, sy: s, sz: s, c: col, c2: col, seed: R() });
      }
      debris.forEach((d, di) => {
        const bucket = new Map<string, any[]>();
        for (const it of lists[di]) { const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); if (!bucket.has(key)) bucket.set(key, []); bucket.get(key)!.push(it); }
        for (const [key, arr] of bucket) {
          const g = new THREE.BufferGeometry();
          for (const name in d.geo.attributes) g.setAttribute(name, d.geo.attributes[name]);
          g.setIndex(d.geo.index);
          const col = new Float32Array(arr.length * 3);
          const m = new THREE.InstancedMesh(g, MAT[d.type], arr.length);
          arr.forEach((it, i) => { _q.setFromEuler(_e.set(it.tx, it.ry, it.tz)); _m4.compose(_p3.set(it.x, it.y, it.z), _q, _s3.set(it.sx, it.sy, it.sz)); m.setMatrixAt(i, _m4); col.set(it.c, i * 3); });
          g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
          m.frustumCulled = false;
          group.add(m);
          const [ci, cj] = key.split(',').map(Number);
          cells.push({ x: (ci + 0.5) * CELL, z: (cj + 0.5) * CELL, mesh: m, small: true });
        }
      });
    };
    placeLitter(-LIMIT - 20, -LIMIT - 20, LIMIT + 20, LIMIT + 20, 1, null, oc.cells);
  }

  // rocks and rubble: a dozen prototypes in six shapes, scattered thickly over the reef and drawn per cell
  // (placed over an area: the sea round the drone now, and by an island each stretch further off later)
  let placeRocks: ((sr: number[], lr: number[], frac: number, skip: ((x: number, z: number) => boolean) | null, cellsOut: any[], feet?: any[]) => void) | null = null;
  // Where each rock stands (its footprint on the bottom, how high it reaches, and — for a ledge — how high its
  // underside is), so that no coral is drawn growing through one: the rocks are set down first, then each
  // colony is checked against them — left as it is, grown less (a younger colony, its form kept) where only
  // its edge reached the rock, or not drawn where its base would be inside it. The random draws are the same
  // either way, so the rest of the reef is laid out as before. (A colony under a ledge's overhang is kept.)
  const RG = 6, rockGrid = new Map<string, any[]>();
  const addFoot = (f: any, feet?: any[]) => { const k = Math.floor(f.x / RG) + ',' + Math.floor(f.z / RG); let a = rockGrid.get(k); if (!a) rockGrid.set(k, a = []); a.push(f); feet?.push(f); };
  const dropFeet = (feet: any[]) => { for (const f of feet) { const k = Math.floor(f.x / RG) + ',' + Math.floor(f.z / RG), a = rockGrid.get(k); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } } };
  const SINK: Record<string, number> = { brain: 0.2, clam: 0.06 };
  // the top of a rock where a colony could grow on it: straight down onto the rock's own surface (or -1e9 off it)
  const rockMesh = new Map<THREE.BufferGeometry, THREE.Mesh>(), rayc = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), rayO = new THREE.Vector3();
  const rockTop = (f: any, x: number, z: number) => {
    if (!f.geo) return -1e9;
    let mesh = rockMesh.get(f.geo); if (!mesh) { mesh = new THREE.Mesh(f.geo); mesh.matrixAutoUpdate = false; rockMesh.set(f.geo, mesh); }
    if (!f.m) { const it = f.it; f.m = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(it.tx, it.ry, it.tz)), new THREE.Vector3(it.sx, it.sy, it.sz)); }
    mesh.matrixWorld.copy(f.m);
    rayc.set(rayO.set(x, f.top + 4, z), DOWN);
    const h = rayc.intersectObject(mesh, false);
    return h.length ? h[0].point.y : -1e9;
  };
  const clearOfRocks = (its: any) => {
    for (const kind of ['branch', 'table', 'brain', 'fan', 'mushroom', 'clam']) its[kind].forEach((list: any[], v: number, lists: any[][]) => {
      const [top, half] = coralTop(kind, v);
      const hits = (x: number, z: number, hw: number, ctop: number, y: number, on: any = null) => {
        let worst: any = null, wd = 0;
        const i0 = Math.floor((x - hw - 4) / RG), i1 = Math.floor((x + hw + 4) / RG), j0 = Math.floor((z - hw - 4) / RG), j1 = Math.floor((z + hw + 4) / RG);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const r of rockGrid.get(i + ',' + j) ?? []) {
          if (r === on) continue;   // (the rock it grows on)
          const d = Math.hypot(x - r.x, z - r.z), need = r.r + hw;   // (clear of the whole rock, not just its middle)
          if (d >= need || ctop < r.under || y > r.top) continue;   // (clear of it, under its overhang, or over it)
          if (need - d > wd) { wd = need - d; worst = { r, d, need }; }
        }
        return worst;
      };
      lists[v] = list.filter((it) => {
        const s = Math.max(it.sx, it.sz), hw = half * s;
        let w = hits(it.x, it.z, hw, it.y + top * it.sy, it.y);
        if (!w) return true;
        // (on the rock, where its middle is over the rock's top and all of its foot is on rock: corals grow on hard
        // ground, a rock as much as the reef — not a sea fan out on a boulder's crown, nor a thicket)
        if (w.d < 0.7 * w.r.r && w.r.geo && kind !== 'fan' && !(kind === 'branch' && v === 2)) {
          const rf = (x: number, z: number) => { const h = rockTop(w.r, x, z); return h > -1e8 ? h : -1e3; };
          const ry0 = rf(it.x, it.z);
          if (ry0 > -1e2) {
            const t = { ...it, y: it.y - (it.floor ?? loc.f(it.x, it.z)) + ry0, up: undefined };
            const ry1 = seat(kind, v, t, ry0, rf);
            if (ry1 !== null && fitUnder(kind, v, t, ry1, SINK[kind] ?? 0) && !hits(t.x, t.z, half * Math.max(t.sx, t.sz), t.y + top * t.sy, t.y, w.r)) { Object.assign(it, t); it.floor = ry1; it.onRock = true; oc.onRock = (oc.onRock ?? 0) + 1; (oc.onRockAt ??= []).push([it.x, it.y, it.z, Math.max(it.sx, it.sz)]); return true; }
          }
        }
        // (out from the rock to where it is clear, where the bottom there allows — the colony as it was: straight
        // away from it first, else a little to either side)
        const push = w.need - w.d + 0.05, ux0 = (it.x - w.r.x) / Math.max(w.d, 1e-3), uz0 = (it.z - w.r.z) / Math.max(w.d, 1e-3);
        if (push < 4) for (const a of [0, 0.6, -0.6, 1.2, -1.2]) {
          const c = Math.cos(a), sn = Math.sin(a), ux = ux0 * c - uz0 * sn, uz = ux0 * sn + uz0 * c;
          const nx = it.x + ux * push, nz = it.z + uz * push;
          const y0 = it.floor ?? loc.f(it.x, it.z), ny0 = loc.f(nx, nz);
          if (Math.abs(ny0 - y0) > 0.6 || (cave && cave.routeDist(nx, nz) < 3.5) || underWreck(nx, nz, ny0)) continue;
          const t = { ...it, x: nx, z: nz, y: it.y + ny0 - y0, up: undefined };
          const ny1 = seat(kind, v, t, ny0, loc.f);   // (set down on the reef there, as where it first grew)
          if (ny1 !== null && fitUnder(kind, v, t, ny1, SINK[kind] ?? 0) && !hits(t.x, t.z, half * Math.max(t.sx, t.sz), t.y + top * t.sy, t.y)) { Object.assign(it, t); return true; }
        }
        if (w.d < 0.8 * w.r.r) return false;                               // (its base in the rock, and nowhere near to go: none)
        // (else grown less, a younger colony with its form kept, just clear of the rock — but never cut down to a stub
        // standing against the rock's flank, which reads as coral poking out of stone: then none)
        const f = Math.max(0, (w.d - w.r.r) / hw);
        if (f < 0.6 || s * f < CORAL_MIN[kind]) return false;
        const y0 = it.y + (SINK[kind] ?? 0) * s;
        it.sx *= f; it.sy *= f; it.sz *= f;
        if (SINK[kind]) it.y = y0 - SINK[kind] * s * f;
        return true;
      });
    });
  };
  // Colonies keep clear of one another (src/ocean/substrate.ts): the biggest set down first, each after only where its
  // body is clear of every other's; one that is not is grown less (down to six tenths) or not grown here. A thicket's
  // own colonies may tangle. Bodies kept per block, so a block let go takes its colonies' bodies with it.
  const bodies = new Bodies();
  const settle = (its: any, kept?: Body[]) => {
    const all: { kind: string; v: number; it: any; size: number }[] = [];
    for (const kind of ['table', 'brain', 'branch', 'fan', 'mushroom', 'clam']) its[kind].forEach((list: any[], v: number) => { for (const it of list) all.push({ kind, v, it, size: Math.max(it.sx, it.sz) * it.sy }); });
    all.sort((a, b) => b.size - a.size);
    const keep = new Set<any>();
    for (const c of all) {
      const g = CORAL_GEO[c.kind][c.v], group = c.kind === 'branch' && c.v === 2 ? 0 : -1;
      let b = bodyOf(g, c.it, group);
      if (!bodies.fits(b)) {
        const s0 = Math.max(c.it.sx, c.it.sz), base = c.it.y + (SINK[c.kind] ?? 0) * s0;
        let ok = false;
        for (const f of [0.8, 0.6]) {
          if (s0 * f < CORAL_MIN[c.kind]) break;
          const t = { ...c.it, sx: c.it.sx * f, sy: c.it.sy * f, sz: c.it.sz * f, y: SINK[c.kind] ? base - SINK[c.kind] * s0 * f : c.it.y };
          const tb = bodyOf(g, t, group);
          if (bodies.fits(tb)) { Object.assign(c.it, t); b = tb; ok = true; break; }
        }
        if (!ok) continue;
      }
      bodies.add(b); kept?.push(b); keep.add(c.it);
      // (and a solid one — a dome, a plate, a clam, a leather coral — on the map the animals and the drone keep clear
      // of: they swim over it or round it, not through. A branching colony and a fan are open lattices fish live in.)
      // (one up on a cave's rock goes on a map of its own: the map is heights alone, and from the tunnel under it its
      // top would read as the floor — the drone in the cave would climb for it and stick against the roof
      // (2026-10-05). The animals over the rock see it in T.top; the drone's floor, T.ground, leaves it out. The
      // register with both faces of each solid, SUBSTRATE_LAYERS.md, is the cure)
      const overCave = cave && cave.topAt(c.it.x, c.it.z) > loc.f(c.it.x, c.it.z) + 0.5;
      if (c.kind !== 'branch' && c.kind !== 'fan') (overCave ? T.roof : obst).stamp(c.it.x, c.it.z, b.R * 1.1, b.y1[b.y1.length - 1], b.y1[b.y1.length - 1] - b.y0[0]);
    }
    for (const kind of ['table', 'brain', 'branch', 'fan', 'mushroom', 'clam']) its[kind].forEach((list: any[], v: number, lists: any[][]) => { lists[v] = list.filter((it) => keep.has(it)); });
  };
  if (!loc.pelagic) {
    const KINDS: [string, number, [number, number]][] = [
      ['boulder', 0.2, [0.25, 1.8]], ['angular', 0.26, [0.25, 1.6]], ['slab', 0.14, [0.6, 2.0]],
      ['pinnacle', 0.1, [0.35, 1.1]], [loc.habitat === 'kelp' ? 'boulder' : 'pitted', 0.14, [0.3, 1.5]], ['rubble', 0.16, [0.08, 0.32]],
    ];
    const protos: { kind: string; geo: THREE.BufferGeometry }[] = [];
    KINDS.forEach(([kind], i) => { for (let v = 0; v < 2; v++) protos.push({ kind, geo: rockPrototype(kind, loc.seed * 7 + i * 31 + v * 13) }); });
    const rockMat = mat(
      `varying vec3 vWp; varying vec3 vN; varying float vLy;
       void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWp = w.xyz; vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (sc * sc))); vLy = position.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      seabedSurface + `varying vec3 vWp; varying vec3 vN; varying float vLy;
       void main(){
         vec3 n;
         vec3 alb = reefSurface(vWp, normalize(vN), 1.0, n) * mix(0.45, 1.0, smoothstep(-0.45, 0.5, vLy));
         gl_FragColor = vec4(shade(alb, vWp, n, 0.85), 1.0);
       }`, { uniforms: SURF_UNIFORMS });
    placeRocks = (sr, lr, frac, skip, cellsOut, feet) => {
      const lists: any[][] = protos.map(() => []);
      const wsum = KINDS.reduce((a, k) => a + k[1], 0);
      for (let placed = 0, tries = 0; placed < 2200 * frac && tries < 40000 * frac; tries++) {
        const x = rr(sr[0], sr[2]), z = rr(sr[1], sr[3]); if (skip && skip(x, z)) continue;
        const h = loc.f(x, z), r = TERR.reef;
        if (r < 0.22 || R() > r * (0.7 + 0.9 * Math.min(1, T.slope(x, z)))) continue;
        if (cave && cave.routeDist(x, z) < 4) continue;
        if (nearAnemone(x, z, 0.6)) continue;
        let q = R() * wsum, ki = 0;
        for (; ki < KINDS.length - 1; ki++) { q -= KINDS[ki][1]; if (q <= 0) break; }
        const [kind, , [a, b]] = KINDS[ki];
        const s = a + Math.pow(R(), 2.2) * (b - a);
        const tilt = kind === 'angular' || kind === 'rubble' ? 0.9 : kind === 'slab' ? 0.25 : 0.35;
        const sy = s * (kind === 'pinnacle' ? rr(1.0, 1.6) : kind === 'slab' ? rr(0.7, 1.0) : rr(0.5, 0.9));
        const it = { x, z, y: h - sy * (kind === 'pinnacle' ? 0.15 : 0.3), ry: R() * 6.28, tx: (R() - 0.5) * tilt, tz: (R() - 0.5) * tilt, sx: s * rr(0.75, 1.35), sy, sz: s * rr(0.75, 1.35) };
        // (resting on the slope under all of it: down to its low side, or, on a drop too steep for that, not here)
        { const r0 = 0.85 * Math.max(it.sx, it.sz); let lo = h; for (const ring of [0.5, 1]) for (let k = 0; k < 10; k++) { const a = (k + ring) * 0.628; lo = Math.min(lo, loc.f(x + Math.cos(a) * r0 * ring, z + Math.sin(a) * r0 * ring)); } loc.f(x, z);
          const drop = h - lo - 0.12 * sy; if (drop > 1.1 * sy) continue; if (drop > 0) it.y -= drop; }
        const li = ki * 2 + (R() < 0.5 ? 0 : 1); lists[li].push(it);
        if (s > 0.3) obst.stamp(x, z, 0.9 * Math.max(it.sx, it.sz) * (kind === 'slab' ? 1.4 : 1), it.y + sy * (kind === 'pinnacle' ? 1.9 : kind === 'slab' ? 0.45 : 0.85), sy);
        if (s > 0.3) addFoot({ x, z, r: 0.85 * Math.max(it.sx, it.sz) * (kind === 'slab' ? 1.3 : 1), top: it.y + sy * (kind === 'pinnacle' ? 1.9 : kind === 'slab' ? 0.45 : 0.85), under: -1e9, it, geo: kind === 'pinnacle' || kind === 'rubble' ? null : protos[li].geo }, feet);   // (geo: a top a colony can grow on)
        placed++;
      }
      // Overhangs and crevices on the flanks of coral heads: find where a steep side meets its flat top,
      // and set a slab there jutting out over the drop; at the foot of the wall, lean big angular blocks
      // against it so shadowed gaps open behind them.
      const slabIdx = (kIdx: number) => kIdx * 2 + (R() < 0.5 ? 0 : 1);
      // (the anemones keep their patch of open reef: no rock or slab comes down on one)
      const hAt = (x: number, z: number) => loc.f(x, z);
      let ledges = 0, leaners = 0;
      for (let tries = 0; tries < 60000 * frac && (ledges < 320 * frac || leaners < 300 * frac); tries++) {
        const x = rr(lr[0], lr[2]), z = rr(lr[1], lr[3]); if (skip && skip(x, z)) continue;
        const h = hAt(x, z);
        if (TERR.reef < 0.35 || h < -22 || (cave && cave.routeDist(x, z) < 4)) continue;
        const gx = (hAt(x + 0.7, z) - hAt(x - 0.7, z)) / 1.4, gz = (hAt(x, z + 0.7) - hAt(x, z - 0.7)) / 1.4, sl = Math.hypot(gx, gz);
        if (sl < 0.8) continue;
        const ox = -gx / sl, oz = -gz / sl;                       // outward, down the slope
        if (ledges < 320 * frac && R() < 0.55) {
          // climb to the rim
          let rx = x, rz = z, rh = h;
          for (let k = 0; k < 10; k++) {
            const nx = rx - ox * 0.5, nz = rz - oz * 0.5, nh = hAt(nx, nz);
            if (nh - rh < 0.12) break;
            rx = nx; rz = nz; rh = nh;
          }
          const w = rr(1.1, 2.4), d = rr(0.8, 1.6), th = rr(0.3, 0.62);
          // (lying on the rim, a little back from the edge: jutting out over the drop it read as a plate stuck on
          // the side, floating — the owner, 2026-10-05)
          const it = { x: rx - ox * d * 0.3, z: rz - oz * d * 0.3, y: rh - th * 0.4, ry: Math.atan2(ox, oz), tx: rr(-0.04, 0.08), tz: rr(-0.06, 0.06), sx: w, sy: th, sz: d };
          { let lo = rh; for (let k = 0; k < 6; k++) { const a = k * 1.047; lo = Math.min(lo, hAt(it.x + Math.cos(a) * Math.max(w, d) * 0.45, it.z + Math.sin(a) * Math.max(w, d) * 0.45)); }
            if (rh - lo > th * 1.2) continue; it.y -= Math.max(0, rh - lo - th * 0.3); }
          if (nearAnemone(it.x, it.z, Math.max(w, d) * 0.6)) continue;
          const li = slabIdx(R() < 0.5 ? 2 : 1); lists[li].push(it);          // flat slabs and flattened angular blocks
          obst.stamp(it.x, it.z, Math.max(w, d) * 0.8, it.y + th * 0.45, th);
          addFoot({ x: it.x, z: it.z, r: Math.max(w, d) * 0.6, top: it.y + th * 0.5, under: -1e9, it, geo: protos[li].geo }, feet);
          ledges++;
        } else if (leaners < 300 * frac) {
          // walk down to the foot of the wall
          let fx = x, fz = z, fh = h;
          for (let k = 0; k < 12; k++) {
            const nx = fx + ox * 0.5, nz = fz + oz * 0.5, nh = hAt(nx, nz);
            if (fh - nh < 0.1) break;
            fx = nx; fz = nz; fh = nh;
          }
          const sz = rr(0.8, 1.8), sy = sz * rr(0.8, 1.3);
          const it = { x: fx + ox * 0.3, z: fz + oz * 0.3, y: fh - sy * 0.2, ry: Math.atan2(ox, oz) + rr(-0.4, 0.4), tx: -rr(0.2, 0.55), tz: rr(-0.3, 0.3), sx: sz * rr(0.9, 1.5), sy, sz };
          // (down on the floor under all of it, not hung off the wall where the foot runs out)
          { const r0 = 0.6 * Math.max(it.sx, sz); let lo = fh; for (let k = 0; k < 6; k++) { const a = k * 1.047; lo = Math.min(lo, hAt(it.x + Math.cos(a) * r0, it.z + Math.sin(a) * r0)); }
            if (fh - lo > sy * 1.1) continue; it.y -= Math.max(0, fh - lo - sy * 0.15); }
          if (nearAnemone(it.x, it.z, Math.max(it.sx, sz) * 0.6)) continue;
          const li = slabIdx(1); lists[li].push(it);
          obst.stamp(it.x, it.z, Math.max(it.sx, sz) * 0.85, it.y + sy * 0.85, sy);
          addFoot({ x: it.x, z: it.z, r: Math.max(it.sx, sz) * 0.75, top: it.y + sy * 0.85, under: -1e9, it, geo: protos[li].geo }, feet);
          leaners++;
        }
      }
      const ROCK_CELL = 80;
      lists.forEach((list, k) => {
        const bucket = new Map<string, any[]>();
        for (const it of list) { const key = Math.floor(it.x / ROCK_CELL) + ',' + Math.floor(it.z / ROCK_CELL); if (!bucket.has(key)) bucket.set(key, []); bucket.get(key)!.push(it); }
        for (const [key, arr] of bucket) {
          const m = new THREE.InstancedMesh(protos[k].geo, rockMat, arr.length);
          arr.forEach((it, i) => { _q.setFromEuler(_e.set(it.tx, it.ry, it.tz)); _m4.compose(_p3.set(it.x, it.y, it.z), _q, _s3.set(it.sx, it.sy, it.sz)); m.setMatrixAt(i, _m4); });
          m.frustumCulled = false;
          group.add(m);
          const [ci, cj] = key.split(',').map(Number);
          cellsOut.push({ x: (ci + 0.5) * ROCK_CELL, z: (cj + 0.5) * ROCK_CELL, mesh: m, big: true });
        }
      });
    };
    placeRocks([-LIMIT - 35, -LIMIT - 35, LIMIT + 35, LIMIT + 35], [-LIMIT - 20, -LIMIT - 20, LIMIT + 20, LIMIT + 20], 1, null, oc.cells);
  }
  clearOfRocks(items);
  settle(items);
  for (const kind in items) items[kind].forEach((list, v) => { if (list.length) addInstanced(kind, v, list, group, oc.cells); });

  // By an island the sea is far bigger than the stretch round the drone that is filled in at the start: as
  // the camera comes near more of it, each 80 m block of the reef there is grown in its turn — its corals,
  // litter and rocks, at the same density, the same each visit (seeded by the block) — one block a frame at
  // most, and blocks left far behind are let go (and grown again the same if the camera comes back).
  if (land && !loc.pelagic) {
    const B = 80, GROW = 190, DROP = 460, E = loc.land.far - 8;
    const blocks = new Map<string, { meshes: any[]; cells: any[]; feet: any[]; bodies: Body[] }>();
    const inner = (ext: number) => (x: number, z: number) => Math.abs(x) < ext && Math.abs(z) < ext;
    const inCoral = inner(EXT), inLitter = inner(LIMIT + 20), inRocks = inner(LIMIT + 35);
    // (a block is grown in three steps on three frames — its corals, its litter, its rocks — so that no one
    // frame carries the whole of it)
    function* growBlock(bi: number, bj: number) {
      const x0 = bi * B, z0 = bj * B, x1 = x0 + B, z1 = z0 + B, key = bi + ',' + bj;
      const rec = { meshes: [] as any[], cells: [] as any[], feet: [] as any[], bodies: [] as Body[] };
      blocks.set(key, rec);
      const seed = loc.seed * 7919 + bi * 104729 + bj * 1299709;
      // anything in the sea here at all? (an inland block, or one wholly inside the stretch done at the start: nothing)
      let wet = false; for (let k = 0; k < 25 && !wet; k++) { const x = x0 + (k % 5 + 0.5) * B / 5, z = z0 + (Math.floor(k / 5) + 0.5) * B / 5; wet = loc.f(x, z) < -0.5 && !inCoral(x, z); }
      if (!wet) return;
      const add = (cells: any[]) => { for (const c of cells) { rec.cells.push(c); rec.meshes.push(c.mesh); if (c.hi) rec.meshes.push(c.hi); oc.cells.push(c); } };
      seedRandom(seed);
      const its = newItems(), c1: any[] = [];
      for (let x = x0; x < x1; x += STEP) for (let z = z0; z < z1; z += STEP) {
        const jx = x + (R() - 0.5) * STEP, jz = z + (R() - 0.5) * STEP;
        if (inCoral(jx, jz)) continue;
        const h = loc.f(jx, jz), r = TERR.reef;
        if (r < 0.05 || R() > r * r * accept * 1.6) continue;
        coralAt(jx, jz, h, its);
      }
      thicketIn(x0, z0, x1, z1, its, inCoral);
      yield;
      if (!blocks.has(key)) return;   // (let go meanwhile)
      seedRandom(seed + 1); const c2: any[] = [];
      placeLitter?.(x0, z0, x1, z1, (B * B) / ((2 * LIMIT + 40) * (2 * LIMIT + 40)), inLitter, c2); add(c2);
      yield;
      if (!blocks.has(key)) return;
      seedRandom(seed + 2); const c3: any[] = [];
      placeRocks?.([x0, z0, x1, z1], [x0, z0, x1, z1], (B * B) / ((2 * LIMIT + 70) * (2 * LIMIT + 70)), inRocks, c3, rec.feet); add(c3);
      // (and its corals, now that its rocks are down: none through a rock)
      clearOfRocks(its);
      settle(its, rec.bodies);
      for (const kind in its) its[kind].forEach((list, v) => { if (list.length) addInstanced(kind, v, list, group, c1); });
      add(c1);
    }
    let growing: Generator | null = null;
    oc.grow = (cam: THREE.Vector3) => {
      // let go of what is far behind
      for (const [k, b] of blocks) {
        const [bi, bj] = k.split(',').map(Number);
        if (Math.hypot((bi + 0.5) * B - cam.x, (bj + 0.5) * B - cam.z) < DROP) continue;
        for (const m of b.meshes) {
          group.remove(m);
          // (free only what is this block's own — where each one stands, its colours — never the shapes all the blocks share)
          const g = m.geometry;
          if (!b.cells.some((c: any) => c.big && c.mesh === m)) { for (const name of Object.keys(g.attributes)) if (!(g.attributes[name] as any).isInstancedBufferAttribute) g.deleteAttribute(name); g.setIndex(null); g.dispose(); }
          m.dispose();
        }
        if (b.cells.length) { const gone = new Set(b.cells); oc.cells = oc.cells.filter((c: any) => !gone.has(c)); }
        dropFeet(b.feet); for (const o of b.bodies) bodies.remove(o);
        blocks.delete(k);
      }
      // carry on with a block under way; else grow the nearest in reach not grown yet
      if (growing) { if (growing.next().done) growing = null; return true; }
      let best: [number, number] | null = null, bd = GROW;
      const i0 = Math.floor((cam.x - GROW) / B), i1 = Math.floor((cam.x + GROW) / B), j0 = Math.floor((cam.z - GROW) / B), j1 = Math.floor((cam.z + GROW) / B);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (blocks.has(i + ',' + j) || (i + 1) * B < -E || i * B > E || (j + 1) * B < -E || j * B > E) continue;
        const d = Math.hypot(Math.max(i * B - cam.x, 0, cam.x - (i + 1) * B), Math.max(j * B - cam.z, 0, cam.z - (j + 1) * B));
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) { growing = growBlock(best[0], best[1]); if (growing.next().done) growing = null; }
      return !!best;
    };
  }

  if (loc.habitat === 'kelp') {
    oc.kelp = makeKelpForest(loc, group, T, oc.cells, floorGeo);
    if (loc.id === 'pointlobos') {
      oc.lobosBenthos = buildLobosBenthos(loc, T, group, oc.kelp.floorAt, { understoryAnchors: oc.kelp.understory.anchors });
      oc.kelp.stats.urchins = oc.lobosBenthos.stats.urchins;
      oc.kelp.stats.batStars = oc.lobosBenthos.stats.batStars;
    }
  }

  // fish
  for (const sp of loc.species) {
    const sys: any = sp.habitat === 'shoal' ? makeShoalSystem(sp, oc) : makeFishSystem(sp, oc);
    if (sys) { oc.fish.push(sys); group.add(sys.mesh); }
  }
  // the nearest fish to a point, ahead of a direction (for a resident watching one go by): its name, its place
  const _nf = new THREE.Vector3();
  T.nearFish = (p: THREE.Vector3, fwd: THREE.Vector3, maxD: number, out: THREE.Vector3) => {
    let best = Infinity, name = '';
    for (const f of oc.fish) { if (!f.nearestPos) continue; const d = f.nearestPos(p, fwd, maxD, _nf); if (d < best) { best = d; name = f.sp.ja; out.copy(_nf); } }
    return name;
  };
  // turtles & mantas
  const an = loc.animals || {};
  if (an.turtle) for (let i = 0; i < an.turtle.count; i++) { const t = makeTurtle(an.turtle.style); t.size = Math.max(0.45, an.turtle.style === 'green' ? loneLength(0.85, 1.1) : loneLength(0.7, 0.88)); t.group.scale.setScalar(t.size); oc.turtles.push(t); group.add(t.group); }
  for (let i = 0; i < (an.manta || 0); i++) {
    const giant = (loc.extraGuide || []).some((e: any) => e.id === 'manta' && e.ja === 'オニイトマキエイ');   // (the oceanic manta is the bigger one)
    const m = new THREE.Mesh(MANTA_GEO, mantaMaterial(giant)); m.frustumCulled = false;
    const s = Math.max(0.9, giant ? loneLength(2.2, 2.9) : loneLength(1.6, 2.2)); m.scale.setScalar(s);
    oc.mantas.push({ span: s * 2, mesh: m, st: new THREE.Vector3(), a: R() * 6.28, rad: rr(10, 16), dir: R() < 0.5 ? 1 : -1, t: R() * 50, y: -8, pos: new THREE.Vector3() }); group.add(m);
  }
  if (an.octopus) oc.octopi = makeOctopi(oc, an.octopus, loc.rock);
  if (loc.whales) oc.whales = makeWhales(oc);
  // (where there are bait balls, the diving birds also come in their dozens to one: a great flock out of sight till then)
  const diver = loc.bait && (loc.birds || []).find((b: any) => b.kind === 'booby' || b.kind === 'tern');
  if (loc.birds) oc.birds = makeBirds(diver ? [...loc.birds, { ...diver, count: 36, rest: 0, crowd: true }] : loc.birds, group);
  // flying fish, where they live: bursts out of the sea and glides over it
  if ([...(loc.extraGuide || []), ...loc.species].some((e) => e.id === 'tobiuo')) oc.flyfish = makeFlyingFish(group);
  if (loc.bait) oc.bait = makeBaitBall(oc, 1);
  oc.jacks = makeJacks(oc, 1);   // the jacks' spot on the reef's edge, where they mill or wind up into a tornado
  oc.riders = makeRiders(oc); if (oc.riders) group.add(oc.riders.group);
  oc.critters = makeCritters(oc); if (oc.critters) group.add(oc.critters.group);
  oc.breach = makeBreach(oc);   // whales and mantas leaping out of the sea
  oc.rare = makeRareEvents(oc);   // rare scenes, now and then   // morays, sea snakes, jellyfish   // remoras, pilot fish and trevally with the big ones
  oc.lobosVisitors = makeLobosVisitors(oc);
  oc.lobosOtters = makeLobosOtters(oc);   // wild sea otters in the canopy
  oc.eco = new Ecosystem(oc);
  group.visible = false;
  oceanScene.add(group);
  return oc;
}


// The cave massif: its rock (with orange cup corals crowding the shaded walls), light beams under the
// skylights, and coral growing on its sunlit top.
function buildCave(cave: Cave, group: THREE.Group, items: any) {
  const rock = new THREE.Mesh(cave.geo, mat(
    `varying vec3 vWp; varying vec3 vN; void main(){ vWp = position; vN = normal; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    SURFACE + `varying vec3 vWp; varying vec3 vN;
     void main(){
       vec3 n0 = normalize(vN), n;
       vec2 cl = caveLight(vWp + n0 * 0.3);
       float open = smoothstep(0.12, 0.5, cl.y);
       vec3 alb = reefSurface(vWp, n0, mix(0.6, 1.0, open), n);
       // Tubastraea: orange cup corals on the shaded walls and ceilings, polyps in tight clusters
       vec2 q = abs(n0.y) > 0.7 ? vWp.xz : vec2(dot(vWp.xz, normalize(vec2(-n0.z, n0.x) + 1e-4)), vWp.y);
       float cf = cellF1(q * 5.5);
       float cup = (1.0 - smoothstep(0.1, 0.26, cf)) * smoothstep(0.4, 0.62, vn2(q * 0.45 + 9.0)) * (1.0 - open) * (1.0 - smoothstep(0.2, 0.8, n0.y));
       alb = mix(alb * mix(0.8, 1.0, open), vec3(1.0, 0.42, 0.07), cup * 0.9);
       n = bumpN(n, vWp, cup * 0.025 * (1.0 - cf));
       gl_FragColor = vec4(shade(alb, vWp, n, 0.85), 1.0);
     }`, { uniforms: SURF_UNIFORMS }));
  group.add(rock);
  // beams: an open cylinder from each skylight down along the sun, glowing brightest along its axis
  for (const s of cave.skylights) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 18, 6, true);
    const beam = new THREE.Mesh(g, mat(
      `uniform vec3 uTop; uniform float uR; uniform float uDrop; varying vec3 vWp; varying vec3 vAxis; varying vec3 vNr; varying float vT; varying vec2 vQ;
       void main(){
         float t = 0.5 - position.y;
         vec3 dir = -SUN; dir.y = min(dir.y, -0.3); dir = normalize(dir);
         vec3 a = normalize(cross(dir, vec3(0.0, 0.0, 1.0))), b = cross(dir, a);
         float len = uDrop / -dir.y;
         vAxis = uTop + dir * t * len;
         vec3 off = (a * position.x + b * position.z) * uR * (0.75 + 0.35 * t);
         vWp = vAxis + off; vNr = normalize(off); vT = t; vQ = vec2(atan(position.z, position.x), t * len);
         gl_Position = projectionMatrix * viewMatrix * vec4(vWp, 1.0);
       }`,
      `varying vec3 vWp; varying vec3 vAxis; varying vec3 vNr; varying float vT; varying vec2 vQ;
       void main(){
         vec3 V = normalize(uCamPos - vWp);
         float core = pow(abs(dot(vNr, V)), 1.6);
         float ripple = 0.65 + 0.35 * vn2(vec2(vQ.x * 2.0 + uTime * 0.4, vQ.y * 0.35 - uTime * 0.5));
         float fade = smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.7, 1.0, vT));
         vec2 ax = caveLight(vAxis);
         float vis = ax.x * smoothstep(0.97, 0.75, ax.y);   // only inside the rock, not where the beam would leave it
         float inside = 1.0 - smoothstep(0.4, 0.9, uCamCave) * 0.5;
         gl_FragColor = vec4(uShaftCol * uShaftI * core * ripple * fade * vis * inside * 0.22, 1.0);
       }`,
      { uniforms: { uTop: { value: s.pos.clone() }, uR: { value: s.r }, uDrop: { value: s.pos.y - s.floor + 1.5 } },
        opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } }));
    beam.frustumCulled = false;
    beam.renderOrder = 2;
    group.add(beam);
  }
  // coral on the sunlit top of the massif
  const P = cave.geo.attributes.position, N = cave.geo.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    if (N.getY(i) < 0.8 || R() > 0.05) continue;
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y < cave.top - 3.5 || cave.skyAt(x, y + 0.5, z) < 0.7) continue;
    const q = R(), s = rr(0.5, 1.4);
    // (not out over a skylight's edge, and on rock all under it: seen from inside, one at the rim hung in the light)
    if (cave.skylights.some((k: any) => Math.hypot(x - k.pos.x, z - k.pos.z) < k.r + 1.4 * s + 0.8)) continue;
    { let ok = true; for (let k = 0; k < 8 && ok; k++) { const a = k * Math.PI / 4; if (cave.topAt(x + Math.cos(a) * 0.8 * s, z + Math.sin(a) * 0.8 * s) < y - 0.25) ok = false; } if (!ok) continue; }
    const kind = q < 0.35 ? 'branch' : q < 0.55 ? 'table' : q < 0.85 ? 'brain' : 'mushroom';
    const v = kind === 'branch' ? (R() < 0.5 ? 0 : 1) : kind === 'mushroom' ? (R() < 0.5 ? 0 : 1) : kind === 'brain' ? (R() < 0.5 ? 0 : 1) : 0;
    const pal = kind === 'brain' && v === 1 ? pick(PALETTE.porites) : kind === 'mushroom' && v === 1 ? pick(PALETTE.sinularia) : pick(PALETTE[kind]);
    const it: any = { x, z, y: y - 0.12 * s, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.2), sz: s, c: tintCol(pal[0]), c2: tintCol(pal[1]), seed: R() + (kind === 'brain' && v === 1 ? 1 : 0) };
    if (kind === 'table') { it.sy = rr(0.7, 1.0); it.y = y - 0.05; }
    if (kind === 'mushroom') it.soft = v;
    items[kind][v].push(it);
  }
}

// Rock prototypes. Unit-sized; instances scale them.
//  boulder  - lumpy and rounded            angular - facets cut by random planes, crisp edges
//  slab     - a wide, flat, faceted block  pinnacle - tall, tapering, fluted
//  pitted   - dead coral head full of holes rubble - small angular chunks
function rockPrototype(kind: string, seed: number) {
  const rnd = mulberryLocal(seed);
  const detail = kind === 'rubble' ? 1 : kind === 'boulder' || kind === 'pitted' || kind === 'pinnacle' ? 3 : 2;
  const g = new THREE.IcosahedronGeometry(1, detail), P = g.attributes.position, v = new THREE.Vector3();
  const cuts: [THREE.Vector3, number][] = [];
  const nCuts = kind === 'angular' ? 9 : kind === 'slab' ? 7 : kind === 'rubble' ? 6 : 0;
  for (let i = 0; i < nCuts; i++) cuts.push([new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), 0.45 + rnd() * 0.35]);
  const so = rnd() * 100;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    if (kind === 'boulder' || kind === 'pitted' || kind === 'pinnacle') {
      v.multiplyScalar(0.72 + fbm(v.x * 1.4 + so, v.z * 1.4 + v.y * 1.1 + so, 4) * 0.55 + (fbm(v.x * 4 + so, v.y * 4 - v.z * 3, 2) - 0.5) * 0.12);
    }
    if (kind === 'pitted') {
      const pits = Math.max(0, fbm(v.x * 3.2 + so, v.z * 3.2 - v.y * 2.7, 3) - 0.56) * 2.6;
      v.multiplyScalar(1 - Math.min(0.35, pits));
    }
    if (kind === 'pinnacle') {
      const a = Math.atan2(v.z, v.x);
      const k = (1 - 0.5 * Math.max(0, v.y)) * (1 + 0.09 * Math.sin(a * 7 + v.y * 2.5 + so));
      v.x *= k; v.z *= k; v.y *= 1.9;
    }
    for (const [n, c] of cuts) { const d = v.dot(n); if (d > c) v.addScaledVector(n, c - d); }
    if (nCuts) v.multiplyScalar(1 + (fbm(v.x * 2.2 + so, v.z * 2.2 + v.y * 1.7, 2) - 0.5) * 0.18);
    if (kind === 'slab') { v.y *= 0.42; v.x *= 1.45; v.z *= 1.15; }
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
    P.setXYZ(i, v.x, v.y, v.z);
  }
  if (nCuts) { g.computeVertexNormals(); return g; }   // faceted: keep the crisp per-face normals
  // rounded kinds: shade smoothly across the duplicated vertices of the icosphere
  const acc = new Map<string, THREE.Vector3>(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const key = (i: number) => `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
  for (let i = 0; i < P.count; i += 3) {
    A.fromBufferAttribute(P, i); B.fromBufferAttribute(P, i + 1); C.fromBufferAttribute(P, i + 2);
    const fn = C.clone().sub(B).cross(A.clone().sub(B));
    for (let k = 0; k < 3; k++) { const kk = key(i + k); const e = acc.get(kk); if (e) e.add(fn); else acc.set(kk, fn.clone()); }
  }
  const nrm = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const n = acc.get(key(i))!.clone().normalize(); nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}
function mulberryLocal(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- litter on the sand ----
function fragmentGeo(seed: number) {   // a broken-off piece of branching coral, knobbly and forked
  const rnd = mulberryLocal(seed), parts: THREE.BufferGeometry[] = [];
  const main = new THREE.CylinderGeometry(0.011, 0.02, 0.2, 7, 3), mp = main.attributes.position;
  for (let i = 0; i < mp.count; i++) { const y = mp.getY(i); mp.setX(i, mp.getX(i) + Math.sin(y * 30 + seed) * 0.006); mp.setZ(i, mp.getZ(i) + Math.cos(y * 23) * 0.004); }
  main.rotateZ(Math.PI / 2 + (rnd() - 0.5) * 0.3); main.translate(0, 0.016, 0); parts.push(main);
  for (let i = 0; i < 3 + seed; i++) {
    const L = 0.05 + rnd() * 0.06, b = new THREE.CylinderGeometry(0.007, 0.011, L, 5, 1);
    b.translate(0, L / 2, 0); b.rotateZ(-(0.5 + rnd() * 0.7) * (i % 2 ? 1 : -1)); b.rotateY((rnd() - 0.5) * 1.2);
    b.translate((rnd() - 0.5) * 0.16, 0.014, (rnd() - 0.5) * 0.02); parts.push(b);
  }
  return mergeGeos(parts);
}
function bivalveGeo() {   // a single valve of a clam shell, ribbed
  const g = new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x); p.setXYZ(i, x * 0.05, y * 0.018 * (1 + 0.12 * Math.abs(Math.sin(a * 9))), z * 0.042); }
  g.computeVertexNormals(); return g;
}
function coneShellGeo() {   // a cone snail shell lying on its side
  const g = new THREE.ConeGeometry(0.018, 0.055, 10, 3); g.rotateZ(Math.PI / 2); g.translate(0, 0.016, 0); return g;
}
function cucumberGeo(seed: number) {   // Holothuria atra: a long, soft, black sausage
  const ph = mulberryLocal(seed)() * 6.28;
  const g = new THREE.CapsuleGeometry(0.045, 0.24, 6, 10); g.rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x, Math.max(y * 0.8, -0.03) + 0.035, z * (1 + 0.1 * Math.sin(x * 20)) + Math.sin(x * 9 + ph) * 0.02); }
  g.computeVertexNormals(); return g;
}
function starfishGeo() {   // Linckia laevigata: five long, round-tipped arms
  const sh = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 === 0 ? 0.12 : 0.028;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.008, 0); g.computeVertexNormals(); return g;
}
function mergeGeos(list: THREE.BufferGeometry[]) {
  const pos: number[] = [], nrm: number[] = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
