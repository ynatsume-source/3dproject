// Builds a sea from its description: seabed, reef, corals, anemones, garden eels and animals.
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
import type { Sea } from '../data/locations';
import { Cave } from './cave';
import { buildKelp, TEMPERATE_SURFACE } from './kelp';
import { Wreck, wreckMaterial } from './wreck';
import { buildShore, landUniforms, LAND_FLOOR } from './shore';
import { landOf } from './land';
import { makeResidents } from '../robots/residents';

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
export function makeT(loc) {
  const T: any = {
    obst: null as ObstacleMap | null,
    cave: null as Cave | null,
    // the seabed, or the top of a cave massif (animals keep to the outside of it)
    h: (x, z) => T.cave ? Math.max(loc.f(x, z), T.cave.topAt(x, z)) : loc.f(x, z),
    // the highest solid surface: terrain, a cave massif, or a rock or coral colony standing on it
    top: (x, z) => Math.max(T.h(x, z), T.obst ? T.obst.get(x, z) : -1e9),
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

export function buildOcean(loc) {
  seedRandom(loc.seed);
  const T = makeT(loc);
  const obst = new ObstacleMap(LIMIT + 45);
  T.obst = obst;
  const cave = loc.cave ? new Cave(loc.cave, loc.f) : null;
  T.cave = cave;
  const group = new THREE.Group();
  const oc: any = { loc, T, group, cave, cells: [], anemones: [], fish: [], turtles: [], mantas: [], colonies: [], grassTex: null, eco: null };
  // a wreck on the sand: solid to everything that swims (its outline into the obstacle map)
  const wreck = loc.wreck ? new Wreck(loc.wreck, loc.f) : null;
  if (wreck) {
    oc.wreck = wreck;
    const m = new THREE.Mesh(wreck.geo, wreckMaterial()); m.frustumCulled = false; group.add(m);
    for (const p of wreck.pts) obst.raise(p.x, p.z, p.y + 0.3);
  }
  const underWreck = (x: number, z: number, h: number) => !!wreck && obst.get(x, z) > h + 0.8;

  // seabed
  const SEGS = 420;
  const floorGeo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, SEGS, SEGS);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const p = floorGeo.attributes.position, r = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, loc.f(x, z)); r[i] = TERR.reef; }
    floorGeo.setAttribute('aReef', new THREE.BufferAttribute(r, 1));
    floorGeo.computeVertexNormals();
    // ambient occlusion from the height grid: how much of the sky each point sees past its neighbours
    const N = SEGS + 1, cell = (WORLD * 2) / SEGS, ao = new Float32Array(p.count);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], reach = [1, 3, 7];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h0 = p.getY(j * N + i);
      let occ = 0;
      for (const [dx, dz] of dirs) {
        let m = 0;
        for (const k of reach) {
          const ii = Math.min(N - 1, Math.max(0, i + dx * k)), jj = Math.min(N - 1, Math.max(0, j + dz * k));
          m = Math.max(m, Math.atan2(p.getY(jj * N + ii) - h0, k * cell * Math.hypot(dx, dz)));
        }
        occ += Math.max(0, m) / (Math.PI / 2);
      }
      ao[j * N + i] = 1 - Math.min(0.7, (occ / dirs.length) * 1.7);
    }
    floorGeo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  }
  // (by an island, dry land is the aerial photograph, lit by the open air)
  const land = loc.land ? landOf(loc.id) : undefined;
  const floor = new THREE.Mesh(floorGeo, mat(
    `attribute float aReef; attribute float aAO; varying vec3 vWp; varying vec3 vN; varying float vReef; varying float vAO;
     void main(){ vWp = position; vN = normal; vReef = aReef; vAO = aAO; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    SURFACE + (loc.kelp ? TEMPERATE_SURFACE : '') + (land ? LAND_FLOOR : '') + `varying vec3 vWp; varying vec3 vN; varying float vReef; varying float vAO;
     void main(){
       vec3 n;
       vec3 alb = ${loc.kelp ? 'temperateSurface' : 'reefSurface'}(vWp, normalize(vN), vReef, n) * vAO;
       vec3 col = shade(alb, vWp, n, 0.95);
       #ifdef LAND
       float dry = smoothstep(-0.1, 0.06, vWp.y);
       vec3 la = landAlbedo(vWp) * mix(1.0, vAO, 0.5);
       col = mix(col, fogIt(airLit(la, landNormal(vWp, normalize(vN)), vWp, 0.0), vWp), dry);
       #endif
       gl_FragColor = vec4(col, 1.0);
     }`, { uniforms: { ...SURF_UNIFORMS, ...(land ? landUniforms(land) : {}) }, defines: land ? { LAND: 1 } : {} }));
  if (!loc.pelagic) group.add(floor);   // the open ocean has no bottom within sight
  // an island larger than the modelled sea: the rest of it, and the lagoon round it, more coarsely
  if (land) {
    const E1 = land.far.half - 6, S = 3, N = Math.round(2 * E1 / S) + 1;
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
    const outer = new THREE.Mesh(g, floor.material); outer.frustumCulled = false;
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
  const items = { branch: [[], []], table: [[]], brain: [[], []], fan: [[], []], mushroom: [[], [], []], anemone: [[]], clam: [[]], eel: [[]] };
  const EXT = LIMIT + 45, STEP = 1.35;
  const samples = [];
  let sum = 0;
  for (let x = -EXT; x < EXT; x += STEP) for (let z = -EXT; z < EXT; z += STEP) {
    const jx = x + (R() - 0.5) * STEP, jz = z + (R() - 0.5) * STEP;
    const h = loc.f(jx, jz), r = TERR.reef;
    if (r < 0.05) continue;
    samples.push([jx, jz, h, r]); sum += r * r * 1.6;
  }
  const target = 12500, accept = Math.min(1, target / Math.max(sum, 1));
  const W = loc.corals;
  for (const [x, z, h, r] of samples) {
    if (R() > r * r * accept * 1.6) continue;
    if (cave && cave.routeDist(x, z) < 3.5) continue;                     // keep the way into the cave open
    if (underWreck(x, z, h)) continue;                                    // (nothing grows under her)
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
    if (tot <= 0) continue; // zero coral weights must mean no coral (temperate habitats)
    let q = R() * tot, kind = 'brain';
    for (const k in w) { q -= w[k]; if (q <= 0) { kind = k; break; } }
    const pal = pick(PALETTE[kind]), seed = R();
    let s, it;
    const y0 = loc.f(x, z);
    if (kind === 'branch') { s = rr(0.6, 1.7); it = { x, z, y: y0 - 0.08, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.2), sz: s }; items.branch[R() < 0.55 ? 0 : 1].push(it); }
    else if (kind === 'table') { s = rr(0.7, 2.1) * (0.6 + 0.6 * shallow); it = { x, z, y: y0 - 0.05, ry: R() * 6.28, sx: s, sy: rr(0.7, 1.1), sz: s * rr(0.85, 1.1), tx: (R() - 0.5) * 0.12, tz: (R() - 0.5) * 0.12 }; items.table[0].push(it); }
    else if (kind === 'brain') {
      s = Math.pow(R(), 1.8) * 1.8 + 0.35; it = { x, z, y: y0 - 0.2 * s, ry: R() * 6.28, sx: s, sy: s * rr(0.7, 1.3), sz: s * rr(0.8, 1.2) };
      if (R() < 0.45) { it.porites = true; items.brain[1].push(it); } else items.brain[0].push(it);
    }
    else if (kind === 'fan') { s = rr(0.9, 2.0); it = { x, z, y: y0 - 0.05, ry: (R() - 0.5) * 0.5, sx: s, sy: s, sz: s, tx: (R() - 0.5) * 0.2 }; items.fan[R() < 0.5 ? 0 : 1].push(it); }
    else if (kind === 'mushroom') {
      // soft corals: leather coral, finger leather coral, or a soft-coral tree (commonest on Maldivian thilas)
      const w = loc.id === 'maldives' || loc.id === 'redsea' ? [0.3, 0.3, 0.4] : loc.id === 'galapagos' ? [0.35, 0.25, 0.4] : loc.id === 'gbr' ? [0.45, 0.4, 0.15] : [0.5, 0.4, 0.1];
      const q = R(), v = q < w[0] ? 0 : q < w[0] + w[1] ? 1 : 2;
      s = v === 2 ? rr(0.6, 1.3) : rr(0.6, 1.4);
      it = { x, z, y: y0 - 0.05, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.2), sz: s, soft: v };
      items.mushroom[v].push(it);
    }
    else { s = rr(loc.clamSize[0], loc.clamSize[1]); it = { x, z, y: y0 - 0.06 * s, ry: R() * 6.28, sx: s, sy: s, sz: s }; items.clam[0].push(it); }
    const TOP: Record<string, [number, number]> = { branch: [0.55, 0.95], table: [1.0, 0.55], brain: [1.0, 0.75], mushroom: [0.5, 0.55], fan: [0.45, 1.0], clam: [0.4, 0.3] };
    if (TOP[kind]) obst.stamp(x, z, TOP[kind][0] * Math.max(it.sx, it.sz), it.y + TOP[kind][1] * it.sy, it.sy);
    const pl = it.porites ? pick(PALETTE.porites) : it.soft === 1 ? pick(PALETTE.sinularia) : it.soft === 2 ? pick(PALETTE.dendro) : pal;
    it.c = tintCol(pl[0]); it.c2 = tintCol(pl[1]); it.seed = seed + (it.porites ? 1 : 0);
  }
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
    const s = rr(0.5, 1.2), fan = R() < 0.2, pal = pick(fan ? PALETTE.fan : PALETTE.dendro);
    const it: any = { x: u.p.x, z: u.p.z, y: u.p.y - 0.06, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.3), sz: s, c: tintCol(pal[0]), c2: tintCol(pal[1]), seed: R() };
    if (fan) items.fan[0].push(it); else { it.soft = 2; items.mushroom[2].push(it); }
  }
  if (land) oc.shore = buildShore(loc, group, T, obst);
  if (loc.residents) { oc.residents = makeResidents(loc, T, loc.species.filter((s: any) => !s.big).map((s: any) => s.ja), (loc.birds || []).map((b: any) => b.ja)); group.add(oc.residents.group); }
  for (const kind in items) items[kind].forEach((list, v) => { if (list.length) addInstanced(kind, v, list, group, oc.cells); });

  // life and litter on the sand: broken coral, shells, sea cucumbers and blue starfish
  if (!loc.pelagic && !loc.kelp) {
    const debris: { geo: THREE.BufferGeometry; type: number; list: any[] }[] = [
      { geo: fragmentGeo(1), type: 0, list: [] }, { geo: fragmentGeo(2), type: 0, list: [] },
      { geo: bivalveGeo(), type: 0, list: [] }, { geo: coneShellGeo(), type: 0, list: [] },
      { geo: cucumberGeo(3), type: 1, list: [] }, { geo: starfishGeo(), type: 2, list: [] },
    ];
    const lean = loc.id === 'maldives' ? 0.5 : 1;
    const want = [2600 * lean, 1800 * lean, 900 * lean, 600 * lean, 90 * lean, 70 * lean];
    for (let tries = 0; tries < 60000; tries++) {
      const x = rr(-LIMIT - 20, LIMIT + 20), z = rr(-LIMIT - 20, LIMIT + 20), h = loc.f(x, z), r = TERR.reef;
      const k = Math.floor(R() * debris.length), d = debris[k];
      if (d.list.length >= want[k]) continue;
      if (cave && cave.sd(x, h + 0.05, z) < 0.1) continue;                     // not buried in the cave rock
      if (h > -0.5) continue;                                                    // (not up on the beach)
      if (k === 5 ? r < 0.05 || r > 0.8 : r > 0.45) continue;                  // starfish on rubble and reef edge, the rest on sand
      if (k < 4 && R() > 0.25 + r * 1.5) continue;                              // litter thickest near the reef
      const s = k === 4 ? rr(1.1, 1.7) : k === 5 ? rr(0.7, 1.2) : rr(0.6, 1.6);
      const col = k === 4 ? [0.08, 0.075, 0.07] : k === 5 ? [0.16, 0.34, 0.86] : tintCol(pick([[0.92, 0.9, 0.84], [0.86, 0.8, 0.72], [0.8, 0.72, 0.7], [0.9, 0.86, 0.78]]));
      d.list.push({ x, z, y: h + (k === 4 ? 0.02 : 0.005), ry: R() * 6.28, tx: (R() - 0.5) * 0.3, tz: (R() - 0.5) * 0.3, sx: s, sy: s, sz: s, c: col, c2: col, seed: R() });
    }
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
    for (const d of debris) {
      const bucket = new Map<string, any[]>();
      for (const it of d.list) { const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); if (!bucket.has(key)) bucket.set(key, []); bucket.get(key)!.push(it); }
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
        oc.cells.push({ x: (ci + 0.5) * CELL, z: (cj + 0.5) * CELL, mesh: m, small: true });
      }
    }
  }

  // rocks and rubble: a dozen prototypes in six shapes, scattered thickly over the reef and drawn per cell
  if (!loc.pelagic) {
    const KINDS: [string, number, [number, number]][] = [
      ['boulder', 0.2, [0.25, 1.8]], ['angular', 0.26, [0.25, 1.6]], ['slab', 0.14, [0.6, 2.0]],
      ['pinnacle', 0.1, [0.35, 1.1]], ['pitted', 0.14, [0.3, 1.5]], ['rubble', 0.16, [0.08, 0.32]],
    ];
    const protos: { kind: string; geo: THREE.BufferGeometry }[] = [];
    KINDS.forEach(([kind], i) => { for (let v = 0; v < 2; v++) protos.push({ kind, geo: rockPrototype(kind, loc.seed * 7 + i * 31 + v * 13) }); });
    const lists: any[][] = protos.map(() => []);
    const wsum = KINDS.reduce((a, k) => a + k[1], 0);
    for (let placed = 0, tries = 0; placed < 2200 && tries < 40000; tries++) {
      const x = rr(-LIMIT - 35, LIMIT + 35), z = rr(-LIMIT - 35, LIMIT + 35), h = loc.f(x, z), r = TERR.reef;
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
      lists[ki * 2 + (R() < 0.5 ? 0 : 1)].push(it);
      if (s > 0.3) obst.stamp(x, z, 0.9 * Math.max(it.sx, it.sz) * (kind === 'slab' ? 1.4 : 1), it.y + sy * (kind === 'pinnacle' ? 1.9 : kind === 'slab' ? 0.45 : 0.85), sy);
      placed++;
    }
    // Overhangs and crevices on the flanks of coral heads: find where a steep side meets its flat top,
    // and set a slab there jutting out over the drop; at the foot of the wall, lean big angular blocks
    // against it so shadowed gaps open behind them.
    const slabList = (kIdx: number) => lists[kIdx * 2 + (R() < 0.5 ? 0 : 1)];
    // (the anemones keep their patch of open reef: no rock or slab comes down on one)
    const hAt = (x: number, z: number) => loc.f(x, z);
    let ledges = 0, leaners = 0;
    for (let tries = 0; tries < 60000 && (ledges < 320 || leaners < 300); tries++) {
      const x = rr(-LIMIT - 20, LIMIT + 20), z = rr(-LIMIT - 20, LIMIT + 20), h = hAt(x, z);
      if (TERR.reef < 0.35 || h < -22 || (cave && cave.routeDist(x, z) < 4)) continue;
      const gx = (hAt(x + 0.7, z) - hAt(x - 0.7, z)) / 1.4, gz = (hAt(x, z + 0.7) - hAt(x, z - 0.7)) / 1.4, sl = Math.hypot(gx, gz);
      if (sl < 0.8) continue;
      const ox = -gx / sl, oz = -gz / sl;                       // outward, down the slope
      if (ledges < 320 && R() < 0.55) {
        // climb to the rim
        let rx = x, rz = z, rh = h;
        for (let k = 0; k < 10; k++) {
          const nx = rx - ox * 0.5, nz = rz - oz * 0.5, nh = hAt(nx, nz);
          if (nh - rh < 0.12) break;
          rx = nx; rz = nz; rh = nh;
        }
        const w = rr(1.1, 2.4), d = rr(0.8, 1.6), th = rr(0.3, 0.62);
        const it = { x: rx + ox * d * 0.45, z: rz + oz * d * 0.45, y: rh - rr(0.05, 0.5), ry: Math.atan2(ox, oz), tx: rr(-0.04, 0.16), tz: rr(-0.08, 0.08), sx: w, sy: th, sz: d };
        if (nearAnemone(it.x, it.z, Math.max(w, d) * 0.6)) continue;
        slabList(R() < 0.5 ? 2 : 1).push(it);          // flat slabs and flattened angular blocks
        obst.stamp(it.x, it.z, Math.max(w, d) * 0.8, it.y + th * 0.45, th);
        ledges++;
      } else if (leaners < 300) {
        // walk down to the foot of the wall
        let fx = x, fz = z, fh = h;
        for (let k = 0; k < 12; k++) {
          const nx = fx + ox * 0.5, nz = fz + oz * 0.5, nh = hAt(nx, nz);
          if (fh - nh < 0.1) break;
          fx = nx; fz = nz; fh = nh;
        }
        const sz = rr(0.8, 1.8), sy = sz * rr(0.8, 1.3);
        const it = { x: fx + ox * 0.3, z: fz + oz * 0.3, y: fh - sy * 0.2, ry: Math.atan2(ox, oz) + rr(-0.4, 0.4), tx: -rr(0.2, 0.55), tz: rr(-0.3, 0.3), sx: sz * rr(0.9, 1.5), sy, sz };
        if (nearAnemone(it.x, it.z, Math.max(it.sx, sz) * 0.6)) continue;
        slabList(1).push(it);
        obst.stamp(it.x, it.z, Math.max(it.sx, sz) * 0.85, it.y + sy * 0.85, sy);
        leaners++;
      }
    }
    const rockMat = mat(
      `varying vec3 vWp; varying vec3 vN; varying float vLy;
       void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWp = w.xyz; vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (sc * sc))); vLy = position.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      SURFACE + (loc.kelp ? TEMPERATE_SURFACE : '') + `varying vec3 vWp; varying vec3 vN; varying float vLy;
       void main(){
         vec3 n;
         vec3 alb = ${loc.kelp ? 'temperateSurface' : 'reefSurface'}(vWp, normalize(vN), 1.0, n) * mix(0.45, 1.0, smoothstep(-0.45, 0.5, vLy));
         gl_FragColor = vec4(shade(alb, vWp, n, 0.85), 1.0);
       }`, { uniforms: SURF_UNIFORMS });
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
        oc.cells.push({ x: (ci + 0.5) * ROCK_CELL, z: (cj + 0.5) * ROCK_CELL, mesh: m, big: true });
      }
    });
  }

  if (loc.kelp) oc.kelp = buildKelp(loc, group, T.top);

  // fish
  for (const sp of loc.species) {
    const sys: any = sp.habitat === 'shoal' ? makeShoalSystem(sp, oc) : makeFishSystem(sp, oc);
    if (sys) { oc.fish.push(sys); group.add(sys.mesh); }
  }
  // turtles & mantas
  const an = loc.animals || {};
  if (an.turtle) for (let i = 0; i < an.turtle.count; i++) { const t = makeTurtle(an.turtle.style); t.size = Math.max(0.45, an.turtle.style === 'green' ? loneLength(0.85, 1.1) : loneLength(0.7, 0.88)); t.group.scale.setScalar(t.size); oc.turtles.push(t); group.add(t.group); }
  for (let i = 0; i < (an.manta || 0); i++) {
    const m = new THREE.Mesh(MANTA_GEO, mantaMaterial()); m.frustumCulled = false;
    const giant = (loc.extraGuide || []).some((e: any) => e.id === 'manta' && e.ja === 'オニイトマキエイ');   // (the oceanic manta is the bigger one)
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
  oc.riders = makeRiders(oc); if (oc.riders) group.add(oc.riders.group);
  oc.critters = makeCritters(oc); if (oc.critters) group.add(oc.critters.group);
  oc.breach = makeBreach(oc);   // whales and mantas leaping out of the sea
  oc.rare = makeRareEvents(oc);   // rare scenes, now and then   // morays, sea snakes, jellyfish   // remoras, pilot fish and trevally with the big ones
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
