// Point Lobos: Macrocystis architecture, with deterministic geometry and GPU sway.
// Stipes carry individual blades and small basal pneumatocysts; the holdfast stays fixed.
// This is an interpretive stand, not a survey of the real cove's present kelp cover.
import * as THREE from 'three';
import { mulberry32, TERR, hyp } from '../core/math';
import { mat } from '../render/common';
import type { Sea } from '../data/locations';
import { kelpCruiseHabitat, makeKelpUnderstory } from './kelp-understory';

// Separate from the tropical coral-limestone material. No imported reef photograph is
// presented as local granite: mineral grain, joints, low algae and sand are procedural.
export const KELP_FLOOR = /* glsl */ `
uniform vec3 uSand; uniform vec3 uRock;
vec3 reefSurface(vec3 p, vec3 n0, float rock, out vec3 n){
  vec2 q = p.xz + p.y * vec2(0.61, 0.43);
  float grain = vn2(q * 42.0), mineral = vn2(q * 9.0);
  float rockK = smoothstep(0.18, 0.66, rock + (vn2(q * 1.1) - 0.5) * 0.25);
  float rip = sin(p.x * 5.8 + sin(p.z * 0.32) * 1.3 + vn2(p.xz * 0.4) * 1.7);
  vec3 sand = uSand * (0.88 + grain * 0.18 + rip * 0.075);
  vec3 granite = uRock * (0.66 + mineral * 0.6 + grain * 0.18);
  granite = mix(granite, vec3(0.59, 0.57, 0.50), smoothstep(0.7, 0.85, grain) * 0.42);
  float algae = smoothstep(0.53, 0.70, vn2(q * 0.75 + 6.0));
  granite = mix(granite, vec3(0.29, 0.15, 0.20), algae * 0.5);
  float turf = smoothstep(0.62, 0.8, vn2(q * 1.8 + 12.0)) * smoothstep(0.1, 0.75, n0.y);
  granite = mix(granite, vec3(0.23, 0.25, 0.13), turf * 0.5);
  n = normalize(n0 + vec3((vn2(q * 25.0 + 1.0) - 0.5) * 0.15, 0.0, (grain - 0.5) * 0.15));
  // A soft moving canopy impression; a local artistic approximation, not ray-traced shadowing.
  vec2 sun = p.xz - SUN.xz / max(SUN.y, 0.35) * p.y;
  float shadeK = mix(0.70, 1.0, smoothstep(0.36, 0.64, vn2(sun * 0.35 + vec2(uTime * 0.027, 0.0))));
  return mix(sand, granite, rockK) * mix(1.0, shadeK, rockK * uSunI);
}`;

type Root = { x: number; y: number; z: number; phase: number };
class Geometry {
  p: number[] = []; uv: number[] = []; root: number[] = []; color: number[] = []; ix: number[] = [];
  vertex(p: THREE.Vector3, u: number, v: number, root: Root, tone: number) {
    const i = this.p.length / 3;
    this.p.push(p.x, p.y, p.z); this.uv.push(u, v);
    this.root.push(root.x, root.y, root.z, root.phase); this.color.push(tone);
    return i;
  }
  tube(points: THREE.Vector3[], radius: number, root: Root, tone = 0, sides = 4) {
    const start = this.p.length / 3;
    for (let j = 0; j < points.length; j++) {
      const t = points[Math.min(j + 1, points.length - 1)].clone().sub(points[Math.max(0, j - 1)]).normalize();
      const n = new THREE.Vector3(0, 0, 1).cross(t).normalize(), b = t.clone().cross(n);
      for (let k = 0; k < sides; k++) {
        const a = k / sides * Math.PI * 2;
        this.vertex(points[j].clone().addScaledVector(n, Math.cos(a) * radius).addScaledVector(b, Math.sin(a) * radius), 0, 0, root, tone);
        if (j) { const i = start + j * sides + k, next = start + j * sides + (k + 1) % sides;
          this.ix.push(i - sides, next - sides, i, next - sides, next, i); }
      }
    }
  }
  // A Macrocystis blade: long and narrow (a tenth or so as wide as it is long), a slim stalk from its float,
  // widest a third of the way out and drawn out to a point, its surface wrinkled and its margin finely
  // toothed; carried up and out along the stipe and streaming a little with the water, the tip falling
  // away. `steps` sets how finely it is drawn (fewer for the forest further off). `flat`: lying in the
  // surface canopy.
  blade(base: THREE.Vector3, az: number, len: number, width: number, root: Root, tone: number, flat: boolean, steps = 9) {
    const start = this.p.length / 3;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const along = flat ? out.clone() : out.clone().multiplyScalar(0.62).add(new THREE.Vector3(0, 0.78, 0)).normalize();
    const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const shape = t < 0.3 ? Math.pow(t / 0.3, 0.7) : Math.pow((1 - t) / 0.7, 0.85);
      const w = width * shape * (steps > 4 ? 0.9 + 0.1 * Math.sin(t * 61 + root.phase) : 1);
      const sag = flat ? -Math.sin(t * Math.PI) * 0.08 : -t * t * len * 0.32;
      for (let k = -1; k <= 1; k++) {
        const p = base.clone().addScaledVector(along, t * len).addScaledVector(side, k * w + Math.sin(t * Math.PI) * len * 0.07 * Math.sin(root.phase + az));
        p.y += sag + Math.abs(k) * Math.sin(t * 27 + root.phase + k) * width * 0.3;   // (the wrinkled, ruffled surface)
        this.vertex(p, t, k, root, tone);
      }
      if (j) for (let k = 0; k < 2; k++) { const i = start + j * 3 + k;
        this.ix.push(i - 3, i - 2, i, i - 2, i + 1, i); }
    }
  }
  // The holdfast's mass: a low, lumpy cone of matted haptera over the rock (the separate haptera drawn on it).
  mound(x: number, z: number, r: number, h: number, floorAt: (x: number, z: number) => number, root: Root, sides: number, lump: (k: number) => number) {
    const start = this.p.length / 3, rings = 4;
    for (let j = 0; j <= rings; j++) for (let k = 0; k < sides; k++) {
      const t = j / rings, a = k / sides * Math.PI * 2, rr = r * (1 - t * 0.82) * (0.85 + 0.3 * lump(k + j * 7));
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      this.vertex(new THREE.Vector3(px, j ? root.y - 0.02 + h * Math.pow(t, 0.8) * (0.9 + 0.2 * lump(k * 3 + j)) : floorAt(px, pz) - 0.01, pz), 0, 0, root, 0);
      if (j) { const i = start + j * sides + k, next = start + j * sides + (k + 1) % sides;
        this.ix.push(i - sides, next - sides, i, next - sides, next, i); }
    }
  }
  bladder(base: THREE.Vector3, az: number, root: Root, tone: number) {
    // Small teardrop bladder at the base of each blade (not the giant bulb of Nereocystis).
    const start = this.p.length / 3, dir = new THREE.Vector3(Math.cos(az), 0.25, Math.sin(az)).normalize();
    const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)), up = dir.clone().cross(side);
    for (let j = 0; j <= 2; j++) for (let k = 0; k < 4; k++) {
      const t = j / 2, a = k / 4 * Math.PI * 2, r = Math.sin(t * Math.PI) * 0.043;
      this.vertex(base.clone().addScaledVector(dir, t * 0.16).addScaledVector(side, r * Math.cos(a)).addScaledVector(up, r * Math.sin(a)), 0, 0, root, tone);
      if (j) { const i = start + j * 4 + k, next = start + j * 4 + (k + 1) % 4;
        this.ix.push(i - 4, next - 4, i, next - 4, next, i); }
    }
  }
  build(withNormals = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aRoot', new THREE.Float32BufferAttribute(this.root, 4));
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.color, 1));
    g.setIndex(this.ix);
    if (withNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export function makeKelpForest(loc: Sea, group: THREE.Group, T: any, cells: any[], floor: THREE.BufferGeometry) {
  // The analytic terrain differs slightly from its triangulated render mesh. Root the
  // visible benthos on those exact triangles so close views do not show floating feet.
  const fp = floor.attributes.position, side = Math.round(Math.sqrt(fp.count)), step = fp.getX(1) - fp.getX(0);
  const floorAt = (x: number, z: number) => {
    const gx = (x - fp.getX(0)) / step, gz = (z - fp.getZ(0)) / step;
    const i = Math.max(0, Math.min(side - 2, Math.floor(gx))), j = Math.max(0, Math.min(side - 2, Math.floor(gz)));
    const u = Math.max(0, Math.min(1, gx - i)), v = Math.max(0, Math.min(1, gz - j)), k = j * side + i;
    const a = fp.getY(k), b = fp.getY(k + 1), c = fp.getY(k + side), d = fp.getY(k + side + 1);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const rnd = mulberry32(loc.seed + 601), between = (a: number, b: number) => a + (b - a) * rnd();
  const anchors: { pos: THREE.Vector3; top: THREE.Vector3 }[] = [];
  const stats = { holdfasts: 0, stipes: 0, blades: 0, vertices: 0, triangles: 0, meshes: 0, urchins: 0, batStars: 0, addedNearCruise: 0 };
  const material = mat(
    `attribute vec4 aRoot; attribute float aTone; varying vec3 vWp; varying vec2 vUv; varying float vTone;
     void main(){
       float h = clamp((position.y - aRoot.y) / max(1.0, -0.45 - aRoot.y), 0.0, 1.0);
       float ph = uTime * 0.38 + aRoot.x * 0.018 + aRoot.z * 0.026;
       vec3 p = position;
       p.x += pow(h, 1.45) * (sin(ph - h * 0.8) * 0.54 + sin(ph * 0.61 + aRoot.w) * 0.16);
       p.z += pow(h, 1.3) * cos(ph * 0.87 - h * 0.65) * 0.35;
       p.y += h * sin(ph + aRoot.w) * 0.075 + sin(uTime * 0.91 + position.y * 2.4 + aRoot.w) * abs(uv.y) * uv.x * 0.035;
       vWp = p; vUv = uv; vTone = aTone;
       gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
     }`,
    `varying vec3 vWp; varying vec2 vUv; varying float vTone;
     void main(){
       vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp)));
       vec3 V = normalize(uCamPos - vWp); if(dot(n,V)<0.0) n=-n;
       float leaf = step(0.15, vTone), tone = fract(vTone);
       vec3 alb = mix(vec3(0.24, 0.21, 0.075), mix(vec3(0.32,0.245,0.09), vec3(0.48,0.355,0.15),tone),leaf);
       float ribs = sin(vUv.x * 83.0 + abs(vUv.y) * 11.0) * 0.06;
       alb *= 0.87 + ribs + 0.13 * (1.0 - abs(vUv.y));
       // Opaque two-sided leaf; transmission is a light term, avoiding alpha sorting forests.
       float through = pow(max(dot(V,SUN),0.0),3.0) * (0.35 + 0.65 * abs(dot(n,SUN)));
       vec3 light = lightAt(n) + uTint * uSunI * leaf * (0.18 + through * 0.5);
       vec3 col = absorb(alb * light * 1.6, vWp.y) + lamp(alb,vWp,n);
       gl_FragColor=vec4(fogIt(col,vWp),1.0);
     }`, { opts: { side: THREE.DoubleSide } });
  // Each plant keeps its own seed, so its cell can be drawn twice, coarsely for the forest further off and
  // finely near the camera, and come out the same plant. Where the plants stand never depends on either.
  type Stem = { a: number; bend: number; end: number; phase: number; tone: number; at: (t: number) => THREE.Vector3 };
  type Plant = { x: number; z: number; root: Root; seed: number; stems: Stem[] };
  const design = (x: number, z: number, root: Root, seed: number): Plant => {
    const r = mulberry32(seed), btw = (a: number, b: number) => a + (b - a) * r();
    const top = btw(-0.72, -0.40), lean = btw(1.1, 2.8), az = btw(-0.5, 0.65), stems: Stem[] = [];
    const n = 5 + Math.floor(r() * 4);
    for (let s = 0; s < n; s++) {
      const a = az + btw(-1.1, 1.1), bend = lean + btw(0.4, 1.5), end = top - (r() < 0.28 && s > 0 ? btw(1.5, 6) : 0);
      const phase = btw(0, 6.28), tone = btw(0.25, 0.95), height = end - root.y, ox = btw(-0.08, 0.08), oz = btw(-0.08, 0.08);
      const at = (t: number) => new THREE.Vector3(x + ox + Math.cos(a) * bend * t * t + Math.sin(t * 7 + phase) * 0.22 * t,
        root.y + 0.12 + (height - 0.12) * (1 - Math.pow(1 - t, 1.45)), z + oz + Math.sin(a) * bend * t * t + Math.cos(t * 6 + phase) * 0.20 * t);
      stems.push({ a, bend, end, phase, tone, at });
    }
    return { x, z, root, seed, stems };
  };
  const byCell = new Map<string, Plant[]>();
  // Jittered placement rather than a regular grid, with clear sandy lanes and uneven forest edges.
  for (let x0 = -152; x0 < 152; x0 += 9.4) for (let z0 = -152; z0 < 152; z0 += 9.4) {
    const x = x0 + between(-3.3, 3.3), z = z0 + between(-3.3, 3.3), y = loc.f(x, z), cover = TERR.reef;
    if (cover < 0.38 || rnd() > cover * 0.60 || y > -5 || y < -22 || T.slope(x, z) > 0.85 || T.top(x, z) - y > 0.12) continue;
    const root: Root = { x, y: floorAt(x, z) + 0.014, z, phase: rnd() * Math.PI * 2 };
    const plant = design(x, z, root, Math.floor(rnd() * 4294967296));
    const key = Math.floor(x / 40) + ',' + Math.floor(z / 40);
    let list = byCell.get(key); if (!list) byCell.set(key, list = []); list.push(plant);
    anchors.push({ pos: new THREE.Vector3(x, root.y, z), top: plant.stems[0].at(1) });   // every destination belongs to a real mature stipe
  }
  // Fill selected rocky reaches beside the actual cruise, retaining every original
  // plant and its seed. Nearby crowns overlap into a forest; sand remains open.
  // This local recruitment is a design choice, not a measured present-day density.
  const habitat = kelpCruiseHabitat(loc), recruit = mulberry32(loc.seed + 9721);
  for (let x0 = -86; x0 < 86; x0 += 5.3) for (let z0 = -101; z0 < 101; z0 += 5.3) {
    const x = x0 + (recruit() - 0.5) * 3.8, z = z0 + (recruit() - 0.5) * 3.8;
    const y = loc.f(x, z), cover = TERR.reef, { near, patch } = habitat(x, z);
    if (cover < 0.58 || near < 0.5 || patch < 0.2 || recruit() > cover * near * (0.18 + patch * 0.54)) continue;
    if (y > -5 || y < -22 || T.slope(x, z) > 0.8 || T.top(x, z) - y > 0.12) continue;
    if (anchors.some(a => (a.pos.x - x) ** 2 + (a.pos.z - z) ** 2 < 3.6 ** 2)) continue;
    const root: Root = { x, y: floorAt(x, z) + 0.014, z, phase: recruit() * Math.PI * 2 };
    const plant = design(x, z, root, Math.floor(recruit() * 4294967296));
    const key = Math.floor(x / 40) + ',' + Math.floor(z / 40);
    let list = byCell.get(key); if (!list) byCell.set(key, list = []); list.push(plant);
    anchors.push({ pos: new THREE.Vector3(x, root.y, z), top: plant.stems[0].at(1) });
    stats.addedNearCruise++;
  }
  // One plant drawn into `geo`, coarse (`lo`) or fine.
  const drawPlant = (geo: Geometry, pl: Plant, lo: boolean, count: boolean) => {
    const { x, z, root } = pl, r = mulberry32(pl.seed + 1), btw = (a: number, b: number) => a + (b - a) * r();
    // The holdfast: a low cone of tangled haptera grown over the rock, a hand or two high and up to a metre
    // across, the stipes rising from its crown. It does not sway (its sway weight is near zero).
    const hr = btw(0.32, 0.55), hh = hr * btw(0.55, 0.8);
    geo.mound(x, z, hr * 0.78, hh, floorAt, root, lo ? 5 : 9, () => r());
    const rings = lo ? [[6, 0.9]] : [[11, 1], [9, 0.78], [7, 0.55], [5, 0.32]];
    for (const [cnt, f] of rings) for (let k = 0; k < cnt; k++) {
      const a = (k + btw(-0.35, 0.35)) / cnt * Math.PI * 2 + f * 2.1, rr = hr * (f * 0.75 + 0.3) * btw(0.85, 1.2);
      const c = Math.cos(a), s = Math.sin(a), y0 = root.y + hh * (1 - f * 0.7);
      const pts = [new THREE.Vector3(x + c * rr * 0.15, y0 + hh * 0.12, z + s * rr * 0.15),
        new THREE.Vector3(x + c * rr * 0.62, y0 + hh * 0.06 * (1 - f) - 0.02, z + s * rr * 0.62),
        new THREE.Vector3(x + c * rr, floorAt(x + c * rr, z + s * rr) + 0.006, z + s * rr)];
      geo.tube(lo ? pts : [pts[0], pts[0].clone().lerp(pts[1], 0.5).setY(pts[0].y + 0.01), pts[1], pts[1].clone().lerp(pts[2], 0.6), pts[2]],
        (0.022 + 0.022 * (1 - f)) * (lo ? 1.3 : 1), root, 0, lo ? 3 : 4);
    }
    if (count) stats.holdfasts++;
    for (const st of pl.stems) {
      const { a, at, tone, end } = st, height = end - root.y;
      const pts = lo ? 8 : 16;
      geo.tube(Array.from({ length: pts }, (_, i) => at(i / (pts - 1))), btw(0.018, 0.028), root, 0, lo ? 3 : 4);
      if (count) stats.stipes++;
      // Blades every half metre or so, alternating along the stipe, each on its small float.
      const leaves = Math.floor(height / 0.5);
      for (let j = 1; j < leaves; j++) {
        const t = j / leaves, p = at(t), leafAz = a + (j % 2 ? 1 : -1) * btw(0.85, 1.7) + Math.sin(j * 1.6) * 0.4;
        const len = btw(0.55, 1.0) * (0.7 + t * 0.35), w = len * btw(0.065, 0.09);
        if (!lo) geo.bladder(p, leafAz, root, tone);
        geo.blade(p.clone().add(new THREE.Vector3(Math.cos(leafAz) * 0.13, 0.015, Math.sin(leafAz) * 0.13)), leafAz, len, w, root, tone, t > 0.9, lo ? 3 : 9);
        if (count) stats.blades++;
      }
      // Floating continuation of each mature stipe spreads into a broken amber canopy.
      if (end > -1) {
        const tip = at(1), canopy: THREE.Vector3[] = [];
        const run = btw(2, 4.8);
        for (let j = 0; j <= 8; j++) {
          const t = j / 8, p = tip.clone().add(new THREE.Vector3(Math.cos(a) * run * t, -Math.sin(t * 3) * 0.12, Math.sin(a) * run * t + Math.sin(t * 3.1) * 0.4));
          canopy.push(p);
          if (j > 0) { const d = a + (j % 2 ? 1 : -1) * btw(0.3, 0.75), len = btw(0.6, 1.15);
            geo.blade(p, d, len, len * btw(0.07, 0.09), root, tone, true, lo ? 3 : 7); if (!lo) geo.bladder(p, d, root, tone); if (count) stats.blades++; }
        }
        geo.tube(lo ? canopy.filter((_, i) => i % 2 === 0) : canopy, 0.02, root, 0, lo ? 3 : 4);
      }
    }
  };
  const finish = (geo: Geometry) => { const g = geo.build(false), m = new THREE.Mesh(g, material); m.name = 'Macrocystis forest'; m.frustumCulled = false; return m; };
  type KelpCell = { x: number; z: number; mesh: THREE.Mesh; plants: Plant[]; kelpHi: THREE.Mesh | null; job: Generator<void, THREE.Mesh> | null };
  const kelpCells: KelpCell[] = [];
  for (const [key, plants] of byCell) {
    // Swayed leaf/stipe normals come from fragment derivatives; no stored normals needed.
    const geo = new Geometry(); for (const pl of plants) drawPlant(geo, pl, true, true);
    const mesh = finish(geo), geometry = mesh.geometry;
    group.add(mesh); const [x, z] = key.split(',').map(Number);
    const cell: KelpCell = { x: (x + 0.5) * 40, z: (z + 0.5) * 40, mesh, plants, kelpHi: null, job: null };
    cells.push(cell); kelpCells.push(cell);
    stats.vertices += geometry.attributes.position.count; stats.triangles += geometry.index!.count / 3; stats.meshes++;
  }
  // Near the camera each cell is redrawn finely, a plant or two at a time so no frame waits on it, and the
  // fine drawing let go again once the camera has gone well past.
  const NEAR = 45, FAR = 70;
  function* fine(c: KelpCell): Generator<void, THREE.Mesh> {
    const geo = new Geometry();
    for (const pl of c.plants) { drawPlant(geo, pl, false, false); yield; }
    return finish(geo);
  }
  const update = (cam: THREE.Vector3) => {
    let busy = false;
    for (const c of kelpCells) {
      const d = hyp(c.x - cam.x, c.z - cam.z);
      if (c.kelpHi && d > FAR) { group.remove(c.kelpHi); c.kelpHi.geometry.dispose(); c.kelpHi = null; }
      if (!c.kelpHi && d < NEAR && !busy) {
        busy = true;
        c.job ??= fine(c);
        const t0 = performance.now();
        for (;;) { const s = c.job.next(); if (s.done) { c.kelpHi = s.value; group.add(c.kelpHi); c.job = null; break; } if (performance.now() - t0 > 3) break; }
      }
      if (c.job && d > FAR) c.job = null;
      const near = !!c.kelpHi && d < NEAR + 8;
      if (c.kelpHi) c.kelpHi.visible = near && c.mesh.visible;
      if (near) c.mesh.visible = false;
    }
  };
  const understory = makeKelpUnderstory(loc, group, T, cells, floorAt);
  return { anchors, stats, floorAt, update, understory };
}
