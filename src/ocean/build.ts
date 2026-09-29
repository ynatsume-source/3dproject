// Builds a sea from its description: seabed, reef, corals, anemones, garden eels and animals.
import * as THREE from 'three';
import { U, mat, VS_WORLD } from '../render/common';
import { fbm, smooth, clamp, seedRandom, R, rr, pick, TERR } from '../core/math';
import { WORLD, LIMIT, HN, oceanScene } from './scenery';
import { CORAL_GEO, CORAL_MAT, PALETTE, makeTurtle, MANTA_GEO, mantaMaterial, _q, _e, _m4, _p3, _s3 } from './models';
import { makeFishSystem } from '../eco/fish';
import { makeShoalSystem } from '../eco/shoal';
import { Ecosystem } from '../eco/ecosystem';
import { makeOctopi } from '../eco/octopus';
import type { Sea } from '../data/locations';

/* ================= building a sea ================= */
export function makeT(loc) {
  return {
    h: (x, z) => loc.f(x, z),
    reef: (x, z) => { loc.f(x, z); return TERR.reef; },
    slope: (x, z) => Math.hypot(loc.f(x + 0.7, z) - loc.f(x - 0.7, z), loc.f(x, z + 0.7) - loc.f(x, z - 0.7)) / 1.4,
  };
}
const CELL = 40;
export function addInstanced(kind, variant, items, group, cells) {
  const base = CORAL_GEO[kind][variant], material = CORAL_MAT[kind];
  const bucket = new Map();
  for (const it of items) { const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(it); }
  for (const [k, arr] of bucket) {
    const g = new THREE.BufferGeometry();
    for (const name in base.attributes) g.setAttribute(name, base.attributes[name]);
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
    const [ci, cj] = k.split(',').map(Number);
    cells.push({ x: (ci + 0.5) * CELL, z: (cj + 0.5) * CELL, mesh });
  }
}
export function tintCol(c, k = 0.1) { const t = 1 + (R() - 0.5) * 2 * k; return [c[0] * t, c[1] * t, c[2] * t]; }

export function buildOcean(loc) {
  seedRandom(loc.seed);
  const T = makeT(loc);
  const group = new THREE.Group();
  const oc: any = { loc, T, group, cells: [], anemones: [], fish: [], turtles: [], mantas: [], colonies: [], grassTex: null, eco: null };

  // seabed
  const SEGS = 420;
  const floorGeo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, SEGS, SEGS);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const p = floorGeo.attributes.position, r = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, loc.f(x, z)); r[i] = TERR.reef; }
    floorGeo.setAttribute('aReef', new THREE.BufferAttribute(r, 1));
    floorGeo.computeVertexNormals();
  }
  const floor = new THREE.Mesh(floorGeo, mat(
    `attribute float aReef; varying vec3 vWp; varying vec3 vN; varying float vReef;
     void main(){ vWp = position; vN = normal; vReef = aReef; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    `uniform vec3 uSand; uniform vec3 uRock; varying vec3 vWp; varying vec3 vN; varying float vReef;
     void main(){
       vec3 n = normalize(vN);
       float rip = sin(vWp.x * 1.7 + sin(vWp.z * 0.5) * 2.5 + vWp.z * 0.3) * 0.5 + 0.5;
       float grain = hash2(floor(vWp.xz * 14.0)), patchy = hash2(floor(vWp.xz * 0.35));
       vec3 sand = uSand * (0.86 + 0.08 * rip * (1.0 - vReef) + 0.07 * grain + 0.05 * patchy);
       vec2 q = vWp.xz + vec2(vWp.y * 0.7, -vWp.y * 0.5);
       float n1 = vn2(q * 0.6), n2 = vn2(q * 1.9 + 7.0), n3 = vn2(q * 5.5 - 3.0);
       vec3 rock = uRock * (0.7 + 0.45 * n2);
       rock = mix(rock, vec3(0.50, 0.40, 0.52), smoothstep(0.55, 0.75, n1) * 0.6);
       rock = mix(rock, vec3(0.42, 0.50, 0.30), smoothstep(0.6, 0.8, vn2(q * 0.8 + 21.0)) * 0.55);
       rock = mix(rock, vec3(0.72, 0.52, 0.56), smoothstep(0.7, 0.85, vn2(q * 1.3 - 11.0)) * 0.5);
       rock *= 0.82 + 0.28 * n3 + 0.12 * hash2(floor(q * 22.0));
       rock *= mix(0.85, 1.0, smoothstep(0.0, 0.1, vor(q * 3.2)));
       vec3 alb = mix(sand, rock, smoothstep(0.12, 0.55, vReef));
       gl_FragColor = vec4(shade(alb, vWp, n, 0.95), 1.0);
     }`, { uniforms: { uSand: U.uSand, uRock: U.uRock } }));
  group.add(floor);

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
  const items = { branch: [[], []], table: [[]], brain: [[]], fan: [[], []], mushroom: [[]], anemone: [[]], clam: [[]], eel: [[]] };
  const EXT = LIMIT + 45, STEP = 1.35;
  const samples = [];
  let sum = 0;
  for (let x = -EXT; x < EXT; x += STEP) for (let z = -EXT; z < EXT; z += STEP) {
    const jx = x + (R() - 0.5) * STEP, jz = z + (R() - 0.5) * STEP;
    const h = loc.f(jx, jz), r = TERR.reef;
    if (r < 0.05) continue;
    samples.push([jx, jz, h, r]); sum += r * r * 1.6;
  }
  const target = 9000, accept = Math.min(1, target / Math.max(sum, 1));
  const W = loc.corals;
  for (const [x, z, h, r] of samples) {
    if (R() > r * r * accept * 1.6) continue;
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
    let q = R() * tot, kind = 'brain';
    for (const k in w) { q -= w[k]; if (q <= 0) { kind = k; break; } }
    const pal = pick(PALETTE[kind]), seed = R();
    let s, it;
    const y0 = loc.f(x, z);
    if (kind === 'branch') { s = rr(0.6, 1.7); it = { x, z, y: y0 - 0.08, ry: R() * 6.28, sx: s, sy: s * rr(0.8, 1.2), sz: s }; items.branch[R() < 0.55 ? 0 : 1].push(it); }
    else if (kind === 'table') { s = rr(0.7, 2.1) * (0.6 + 0.6 * shallow); it = { x, z, y: y0 - 0.05, ry: R() * 6.28, sx: s, sy: rr(0.7, 1.1), sz: s * rr(0.85, 1.1), tx: (R() - 0.5) * 0.12, tz: (R() - 0.5) * 0.12 }; items.table[0].push(it); }
    else if (kind === 'brain') { s = Math.pow(R(), 1.8) * 1.8 + 0.35; it = { x, z, y: y0 - 0.2 * s, ry: R() * 6.28, sx: s, sy: s * rr(0.7, 1.3), sz: s * rr(0.8, 1.2) }; items.brain[0].push(it); }
    else if (kind === 'fan') { s = rr(0.9, 2.0); it = { x, z, y: y0 - 0.05, ry: (R() - 0.5) * 0.5, sx: s, sy: s, sz: s, tx: (R() - 0.5) * 0.2 }; items.fan[R() < 0.5 ? 0 : 1].push(it); }
    else if (kind === 'mushroom') { s = rr(0.6, 1.4); it = { x, z, y: y0 - 0.05, ry: R() * 6.28, sx: s, sy: s * rr(0.7, 1.2), sz: s }; items.mushroom[0].push(it); }
    else { s = rr(loc.clamSize[0], loc.clamSize[1]); it = { x, z, y: y0 - 0.06 * s, ry: R() * 6.28, sx: s, sy: s, sz: s }; items.clam[0].push(it); }
    it.c = tintCol(pal[0]); it.c2 = tintCol(pal[1]); it.seed = seed;
  }
  // anemones, each home to a few clownfish
  const clown = loc.species.find((s) => s.habitat === 'anemone');
  for (let tries = 0; oc.anemones.length < loc.anemones && tries < 4000; tries++) {
    const x = rr(-LIMIT, LIMIT), z = rr(-LIMIT, LIMIT), h = loc.f(x, z), r = TERR.reef;
    if (r < 0.4 || h < -20 || T.slope(x, z) > 0.8) continue;
    const s = rr(1.0, 1.7), pal = pick(PALETTE.anemone);
    items.anemone[0].push({ x, z, y: h - 0.04, ry: R() * 6.28, sx: s, sy: s * rr(0.9, 1.2), sz: s, c: tintCol(pal[0]), c2: tintCol(pal[1]), seed: R() });
    oc.anemones.push({ pos: new THREE.Vector3(x, h + 0.28 * s, z), s, species: clown && clown.id });
  }
  // garden eel colonies on open sand
  for (let tries = 0; oc.colonies.length < loc.eels && tries < 3000; tries++) {
    const x = rr(-LIMIT, LIMIT), z = rr(-LIMIT, LIMIT), h = loc.f(x, z);
    if (TERR.reef > 0.02 || h < -24 || h > -6 || T.slope(x, z) > 0.2) continue;
    const pos = new THREE.Vector3(x, h, z);
    if (oc.colonies.some((c) => c.pos.distanceTo(pos) < 18)) continue;
    oc.colonies.push({ pos });
    const n = 16 + Math.floor(R() * 16);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * 3.2, ex = x + Math.cos(a) * d, ez = z + Math.sin(a) * d;
      items.eel[0].push({ x: ex, z: ez, y: loc.f(ex, ez) - 0.02, ry: 0.3 + (R() - 0.5) * 0.4, sx: 1, sy: rr(0.35, 0.55), sz: 1, c: [0.88, 0.88, 0.8], c2: [0.08, 0.08, 0.08], seed: R() });
    }
  }
  for (const kind in items) items[kind].forEach((list, v) => { if (list.length) addInstanced(kind, v, list, group, oc.cells); });

  // rubble / dead-coral rocks
  {
    const pos = [], nrm = [], tmp = new THREE.Vector3();
    for (let placed = 0, tries = 0; placed < 70 && tries < 3000; tries++) {
      const x = rr(-LIMIT - 30, LIMIT + 30), z = rr(-LIMIT - 30, LIMIT + 30), h = loc.f(x, z);
      if (TERR.reef < 0.3) continue;
      const s = 0.5 + Math.pow(R(), 2) * 2.2, seed = R() * 100;
      const g = new THREE.IcosahedronGeometry(1, 2), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { tmp.fromBufferAttribute(P, i); tmp.multiplyScalar(0.72 + fbm(tmp.x * 1.3 + seed, tmp.z * 1.3 + tmp.y * 0.9 + seed, 4) * 0.62); P.setXYZ(i, tmp.x, tmp.y, tmp.z); }
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.3 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 0.4, R() * 6.3, R() * 0.4)), new THREE.Vector3(s, s * rr(0.4, 0.7), s * rr(0.8, 1.3))));
      g.computeVertexNormals();
      pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); placed++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    group.add(new THREE.Mesh(geo, mat(VS_WORLD,
      `uniform vec3 uRock; varying vec3 vWp; varying vec3 vN;
       void main(){
         vec3 n = normalize(vN); float g = hash2(floor(vWp.xz * 5.0 + vWp.y * 3.0)), g2 = hash2(floor(vWp.xz * 1.3 - vWp.y * 1.7));
         vec3 rock = uRock * (0.78 + 0.22 * g + 0.15 * g2);
         rock = mix(rock, mix(vec3(0.34, 0.40, 0.22), vec3(0.55, 0.36, 0.40), g2), smoothstep(0.3, 0.85, n.y) * 0.6);
         gl_FragColor = vec4(shade(rock, vWp, n, 0.8), 1.0);
       }`, { uniforms: { uRock: U.uRock } })));
  }

  // fish
  for (const sp of loc.species) {
    const sys: any = sp.habitat === 'shoal' ? makeShoalSystem(sp, oc) : makeFishSystem(sp, oc);
    if (sys) { oc.fish.push(sys); group.add(sys.mesh); }
  }
  // turtles & mantas
  const an = loc.animals || {};
  if (an.turtle) for (let i = 0; i < an.turtle.count; i++) { const t = makeTurtle(an.turtle.style); t.size = an.turtle.style === 'green' ? rr(0.95, 1.2) : rr(0.75, 0.9); t.group.scale.setScalar(t.size); oc.turtles.push(t); group.add(t.group); }
  for (let i = 0; i < (an.manta || 0); i++) {
    const m = new THREE.Mesh(MANTA_GEO, mantaMaterial()); m.frustumCulled = false;
    const s = rr(1.7, 2.2); m.scale.setScalar(s);
    oc.mantas.push({ mesh: m, st: new THREE.Vector3(), a: R() * 6.28, rad: rr(10, 16), dir: R() < 0.5 ? 1 : -1, t: R() * 50, y: -8, pos: new THREE.Vector3() }); group.add(m);
  }
  if (an.octopus) oc.octopi = makeOctopi(oc, an.octopus, loc.rock);
  oc.eco = new Ecosystem(oc);
  group.visible = false;
  oceanScene.add(group);
  return oc;
}

