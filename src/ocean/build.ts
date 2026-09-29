// Builds a sea from its description: seabed, reef, corals, anemones, garden eels and animals.
import * as THREE from 'three';
import { U, mat, VS_WORLD } from '../render/common';
import { fbm, smooth, clamp, seedRandom, R, rr, pick, TERR } from '../core/math';
import { WORLD, LIMIT, HN, oceanScene } from './scenery';
import { CORAL_GEO, CORAL_MAT, PALETTE, SHAPES, fishGeometry, fishMaterial, makeTurtle, MANTA_GEO, mantaMaterial, UPV, _q, _e, _m4, _p3, _s3 } from './models';
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
  const oc = { loc, T, group, cells: [], anemones: [], fish: [], turtles: [], mantas: [], colonies: [], grassTex: null };

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
    const sys = makeFishSystem(sp, oc);
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
  group.visible = false;
  oceanScene.add(group);
  return oc;
}

/* ---------- fish behaviour ---------- */
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _mm = new THREE.Matrix4(), _ss = new THREE.Vector3();
export function makeFishSystem(sp, oc) {
  const sh = SHAPES[sp.shape];
  const groups = [];
  let total = 0;
  if (sp.habitat === 'anemone') {
    for (const a of oc.anemones) { if (a.species !== sp.id) continue; const n = 2 + Math.floor(R() * 3); groups.push({ type: 'anem', n, start: total, a }); total += n; }
  } else if (sp.habitat === 'reef') {
    for (let i = 0; i < sp.schools; i++) { groups.push({ type: 'reef', n: sp.n, start: total }); total += sp.n; }
  } else {
    for (let i = 0; i < sp.count; i++) { groups.push({ type: 'roam', n: 1, start: total }); total += 1; }
  }
  if (!total) return null;
  const geo = fishGeometry(sh);
  const swim = new Float32Array(total * 3);
  const fp = new Float32Array(total * 3), fv = new Float32Array(total * 3), fs = new Float32Array(total), fo = new Float32Array(total * 3);
  for (const g of groups) {
    const spread = g.type === 'anem' ? [0.35, 0.2, 0.35] : (sp.spread || [0, 0, 0]);
    Object.assign(g, { c: new THREE.Vector3(), v: new THREE.Vector3(), head: R() * 6.28, t: R() * 100, alt: rr((sp.alt || [0.3, 0.6])[0], (sp.alt || [0.3, 0.6])[1]), anchor: { x: 0, z: 0 }, placed: false });
    for (let i = g.start; i < g.start + g.n; i++) {
      const fr = sp.freq || (sp.big ? [3, 5] : [8, 12]);
      swim[i * 3] = R() * 6.28; swim[i * 3 + 1] = rr(fr[0], fr[1]); swim[i * 3 + 2] = rr(0.88, 1.1);
      fs[i] = rr(sp.size[0], sp.size[1]) / 1.28;
      let x, y, z; do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; } while (x * x + y * y + z * z > 1);
      fo[i * 3] = x * spread[0]; fo[i * 3 + 1] = y * spread[1]; fo[i * 3 + 2] = z * spread[2];
    }
  }
  geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 3));
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(sp), total);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const T = oc.T;

  function findSpot(cam, fx, fz, dmin, dmax, wantReef) {
    let best = null, bs = -1;
    for (let k = 0; k < 28; k++) {
      const d = rr(dmin, dmax), lat = (R() * 2 - 1) * (dmax * 0.5);
      const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT);
      const r = wantReef ? T.reef(x, z) : 1;
      if (r > bs) { bs = r; best = [x, z]; }
      if (r > 0.5) break;
    }
    return best;
  }
  function place(g, cam, fx, fz, near) {
    if (g.type === 'anem') { g.c.copy(g.a.pos); g.c.y += 0.25; }
    else {
      const [x, z] = findSpot(cam, fx, fz, near ? 6 : 32, near ? 30 : 48, g.type === 'reef');
      g.anchor.x = x; g.anchor.z = z;
      g.c.set(x, Math.min(T.h(x, z) + g.alt, -1.4), z);
      g.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(0.9, 2.1);
    }
    g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(sp.speed * 0.4);
    for (let i = g.start; i < g.start + g.n; i++) {
      fp[i * 3] = g.c.x + fo[i * 3]; fp[i * 3 + 1] = g.c.y + fo[i * 3 + 1]; fp[i * 3 + 2] = g.c.z + fo[i * 3 + 2];
      fv[i * 3] = g.v.x; fv[i * 3 + 1] = 0; fv[i * 3 + 2] = g.v.z;
    }
    g.placed = true;
  }
  function update(dt, cam, fx, fz) {
    const t = U.uTime.value;
    let dirty = false;
    for (const g of groups) {
      g.t += dt;
      const dxc = g.c.x - cam.x, dzc = g.c.z - cam.z, dc2 = dxc * dxc + dzc * dzc;
      if (g.type === 'anem') { if (!g.placed) place(g, cam, fx, fz, true); if (dc2 > 80 * 80) continue; }
      else if (!g.placed || dc2 > 72 * 72) place(g, cam, fx, fz, !g.placed);
      if (g.type === 'reef') {
        const r = 3.5;
        const nx = g.anchor.x + Math.cos(g.t * 0.13 + g.start) * r, nz = g.anchor.z + Math.sin(g.t * 0.1 + g.start) * r;
        g.v.set((nx - g.c.x) / Math.max(dt, 1e-3), 0, (nz - g.c.z) / Math.max(dt, 1e-3)).clampLength(0, sp.speed);
        g.c.x = nx; g.c.z = nz;
      } else if (g.type === 'roam') {
        g.head += (Math.sin(g.t * 0.23 + g.start) * 0.35 + Math.sin(g.t * 0.07) * 0.2) * dt;
        if (Math.abs(g.c.x) > LIMIT || Math.abs(g.c.z) > LIMIT) { let d = Math.atan2(-g.c.z, -g.c.x) - g.head; d = Math.atan2(Math.sin(d), Math.cos(d)); g.head += d * dt * 0.8; }
        g.v.set(Math.cos(g.head), 0, Math.sin(g.head)).multiplyScalar(sp.speed * 0.7);
        g.c.x += g.v.x * dt; g.c.z += g.v.z * dt;
      }
      if (g.type !== 'anem') {
        const ty = Math.min(T.h(g.c.x, g.c.z) + g.alt + Math.sin(g.t * 0.3) * 0.5, -1.4);
        g.c.y += (ty - g.c.y) * Math.min(1, dt * 0.6);
      }
      const camNear = g.type === 'anem' ? smooth(3.0, 1.2, Math.sqrt(dc2 + (g.c.y - cam.y) ** 2)) : 0;
      const rot = g.t * (g.type === 'anem' ? 0.3 : 0.12), cr = Math.cos(rot), sr = Math.sin(rot);
      const shrink = 1 - camNear * 0.75;
      const lone = g.n === 1;
      for (let i = g.start; i < g.start + g.n; i++) {
        const ox = fo[i * 3] * shrink, oz = fo[i * 3 + 2] * shrink;
        const wob = lone ? 0 : (g.type === 'anem' ? 0.12 : 0.4);
        const tx = g.c.x + ox * cr - oz * sr + Math.sin(t * 0.7 + i) * wob;
        const ty = g.c.y + fo[i * 3 + 1] * shrink - camNear * 0.2 + Math.sin(t * 0.9 + i * 1.7) * wob * 0.6;
        const tz = g.c.z + ox * sr + oz * cr + Math.cos(t * 0.6 + i) * wob;
        const px = fp[i * 3], py = fp[i * 3 + 1], pz = fp[i * 3 + 2];
        _v.set(tx - px, ty - py, tz - pz);
        const L = _v.length(), maxS = Math.max(sp.speed * 1.7, 0.3);
        _v.multiplyScalar(Math.min(maxS, L * 1.1) / Math.max(L, 1e-4)).add(g.v);
        _w.set(px - cam.x, py - cam.y, pz - cam.z);
        const cd = _w.length(), fr = g.type === 'anem' ? 0 : (sp.big ? 3.5 : 4.5);
        if (cd < fr) _v.addScaledVector(_w, (fr - cd) * 2.2 / Math.max(cd, 0.1));
        if (py < T.h(px, pz) + 0.3) _v.y += 1.5;
        const k = 1 - Math.exp(-dt * (lone ? 1.0 : 2.6));
        let vx = fv[i * 3] + (_v.x - fv[i * 3]) * k, vy = fv[i * 3 + 1] + (_v.y - fv[i * 3 + 1]) * k, vz = fv[i * 3 + 2] + (_v.z - fv[i * 3 + 2]) * k;
        fv[i * 3] = vx; fv[i * 3 + 1] = vy; fv[i * 3 + 2] = vz;
        const nx = px + vx * dt, ny = Math.min(py + vy * dt, -0.5), nz = pz + vz * dt;
        fp[i * 3] = nx; fp[i * 3 + 1] = ny; fp[i * 3 + 2] = nz;
        let hs = Math.hypot(vx, vz);
        if (hs < 0.05) { vx += Math.cos(g.head + i) * 0.05; vz += Math.sin(g.head + i) * 0.05; hs = Math.hypot(vx, vz); }
        vy = clamp(vy, -hs * 0.6, hs * 0.6);
        _w.set(nx + vx, ny + vy, nz + vz); _v.set(nx, ny, nz);
        _mm.lookAt(_w, _v, UPV); _ss.setScalar(fs[i]); _mm.scale(_ss); _mm.setPosition(nx, ny, nz);
        mesh.setMatrixAt(i, _mm);
        dirty = true;
      }
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }
  function nearest(cam, fwd, maxD) {
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < maxD && d < best && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3) > 0.55) best = d;
    }
    return best;
  }
  function nearestPos(cam, fwd, maxD, out) {
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      const dx = fp[i * 3] - cam.x, dy = fp[i * 3 + 1] - cam.y, dz = fp[i * 3 + 2] - cam.z, d = Math.hypot(dx, dy, dz);
      if (d < maxD && d < best && (dx * fwd.x + dz * fwd.z) / Math.max(d, 1e-3) > 0.2) { best = d; out.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]); }
    }
    return best;
  }
  return { sp, mesh, update, nearest, nearestPos, reset() { for (const g of groups) g.placed = false; } };
}

export function updateTurtles(oc, dt, cam, fx, fz) {
  const T = oc.T, time = U.uTime.value;
  for (const t of oc.turtles) {
    t.t += dt;
    const dx = t.pos.x - cam.x, dz = t.pos.z - cam.z;
    if (!t.placed || dx * dx + dz * dz > 75 * 75) {
      const d = t.placed ? rr(34, 48) : rr(12, 36), lat = (R() * 2 - 1) * 18;
      t.pos.set(clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), 0, clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT));
      t.pos.y = T.h(t.pos.x, t.pos.z) + rr(1, 3);
      t.head = Math.atan2(fz, fx) + (R() < 0.5 ? 1 : -1) * rr(1, 2.2);
      t.placed = true;
    }
    if (t.ascend <= 0 && R() < dt / 70) t.ascend = rr(18, 30);
    t.ascend -= dt;
    t.head += Math.sin(t.t * 0.11 + t.size * 10) * 0.2 * dt;
    if (Math.abs(t.pos.x) > LIMIT || Math.abs(t.pos.z) > LIMIT) { let d = Math.atan2(-t.pos.z, -t.pos.x) - t.head; d = Math.atan2(Math.sin(d), Math.cos(d)); t.head += d * dt; }
    const fh = T.h(t.pos.x, t.pos.z);
    const ty = t.ascend > 0 ? -0.9 : Math.min(fh + 1.4 + Math.sin(t.t * 0.2) * 0.8, -1.2);
    const stroke = Math.max(0, Math.sin(t.t * 1.0));
    const sp = 0.3 + stroke * 0.35;
    const vy = clamp((ty - t.pos.y) * 0.25, -0.35, 0.35);
    t.vel.set(Math.cos(t.head) * sp, vy, Math.sin(t.head) * sp);
    const away = _w.set(t.pos.x - cam.x, 0, t.pos.z - cam.z), ad = away.length();
    if (ad < 2.5) t.vel.addScaledVector(away, (2.5 - ad) * 0.4 / Math.max(ad, 0.1));
    t.pos.addScaledVector(t.vel, dt);
    t.pos.y = Math.max(t.pos.y, fh + 0.5);
    t.group.position.copy(t.pos);
    t.group.rotation.set(-Math.atan2(t.vel.y, Math.hypot(t.vel.x, t.vel.z)), Math.atan2(t.vel.x, t.vel.z), Math.sin(t.t * 0.5) * 0.06, 'YXZ');
    const f = Math.sin(t.t * 1.0) * 0.75, sw = Math.sin(t.t * 1.0 - 1.2) * 0.45;
    t.fr.rotation.set(0, sw, f); t.fl.rotation.set(0, -sw, -f);
    const r = Math.sin(t.t * 0.8 + time * 0.1) * 0.2;
    t.br.rotation.set(0, 0, r); t.bl.rotation.set(0, 0, -r);
  }
}
export function updateMantas(oc, dt, cam, fx, fz) {
  const T = oc.T;
  for (const m of oc.mantas) {
    m.t += dt;
    const dx = m.st.x - cam.x, dz = m.st.z - cam.z;
    if (!m.placed || dx * dx + dz * dz > 85 * 85) {
      let best = null, bs = -Infinity;
      for (let k = 0; k < 30; k++) {
        const d = m.placed ? rr(35, 50) : rr(14, 30), lat = (R() * 2 - 1) * 20;
        const x = clamp(cam.x + fx * d - fz * lat, -LIMIT, LIMIT), z = clamp(cam.z + fz * d + fx * lat, -LIMIT, LIMIT), h = T.h(x, z);
        if (h > bs) { bs = h; best = [x, z]; }
      }
      m.st.set(best[0], 0, best[1]); m.placed = true;
      m.y = Math.min(T.h(best[0], best[1]) + rr(4, 7), -3);
    }
    const w = 1.25 / m.rad;
    m.a += dt * w * m.dir;
    const px = m.st.x + Math.cos(m.a) * m.rad, pz = m.st.z + Math.sin(m.a) * m.rad;
    const fh = T.h(px, pz);
    const ty = Math.min(Math.max(m.y + Math.sin(m.t * 0.15) * 2, fh + 2.5), -2.5);
    m.pos.y += (ty - m.pos.y) * Math.min(1, dt * 0.5);
    m.pos.x = px; m.pos.z = pz;
    const tx = -Math.sin(m.a) * m.dir, tz = Math.cos(m.a) * m.dir;
    m.mesh.position.copy(m.pos);
    m.mesh.rotation.set(-0.05 + Math.sin(m.t * 0.3) * 0.05, Math.atan2(tx, tz), 0.32 * m.dir, 'YXZ');
    if (!m.init) { m.init = true; m.pos.y = ty; }
  }
}

