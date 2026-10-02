// Point Lobos: Macrocystis architecture, with deterministic geometry and GPU sway.
// Stipes carry individual blades and small basal pneumatocysts; the holdfast stays fixed.
// This is an interpretive stand, not a survey of the real cove's present kelp cover.
import * as THREE from 'three';
import { mulberry32, TERR } from '../core/math';
import { mat } from '../render/common';
import type { Sea } from '../data/locations';

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
  tube(points: THREE.Vector3[], radius: number, root: Root, tone = 0) {
    const start = this.p.length / 3, sides = 4;
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
  blade(base: THREE.Vector3, az: number, len: number, width: number, root: Root, tone: number, flat: boolean) {
    const start = this.p.length / 3, steps = 8;
    const along = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, w = width * Math.pow(Math.sin(Math.PI * t), 0.72) * (0.87 + 0.13 * Math.sin(t * 39 + root.phase));
      // Flexible, lanceolate blades bend down at their tips. Upper blades lie beneath the surface.
      const y = flat ? -Math.sin(t * Math.PI) * 0.10 : Math.sin(t * Math.PI * 1.1) * len * 0.14 - t * t * len * 0.24;
      for (let k = -1; k <= 1; k++) {
        const p = base.clone().addScaledVector(along, t * len).addScaledVector(side, k * w + Math.sin(t * Math.PI) * len * 0.12 * Math.sin(root.phase + az));
        p.y += y + Math.abs(k) * Math.sin(t * 24 + root.phase) * width * 0.24;
        this.vertex(p, t, k, root, tone);
      }
      if (j) for (let k = 0; k < 2; k++) { const i = start + j * 3 + k;
        this.ix.push(i - 3, i - 2, i, i - 2, i + 1, i); }
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
  const buckets = new Map<string, Geometry>();
  const anchors: { pos: THREE.Vector3; top: THREE.Vector3 }[] = [];
  const stats = { holdfasts: 0, stipes: 0, blades: 0, vertices: 0, triangles: 0, meshes: 0, urchins: 0, batStars: 0 };
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
  // Jittered placement rather than a regular grid, with clear sandy lanes and uneven forest edges.
  for (let x0 = -152; x0 < 152; x0 += 9.4) for (let z0 = -152; z0 < 152; z0 += 9.4) {
    const x = x0 + between(-3.3, 3.3), z = z0 + between(-3.3, 3.3), y = loc.f(x, z), cover = TERR.reef;
    if (cover < 0.38 || rnd() > cover * 0.60 || y > -5 || y < -22 || T.slope(x, z) > 0.85 || T.top(x, z) - y > 0.12) continue;
    const root: Root = { x, y: floorAt(x, z) + 0.014, z, phase: rnd() * Math.PI * 2 };
    const key = Math.floor(x / 40) + ',' + Math.floor(z / 40);
    let geo = buckets.get(key); if (!geo) buckets.set(key, geo = new Geometry());
    const top = between(-0.72, -0.40), lean = between(1.1, 2.8), az = between(-0.5, 0.65);
    const anchor = { pos: new THREE.Vector3(x, root.y, z), top: new THREE.Vector3() };
    anchors.push(anchor);
    stats.holdfasts++;
    // Fingerlike haptera clasp the rock. They are stationary because their sway weight is zero.
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2, r = between(0.18, 0.46);
      geo.tube([new THREE.Vector3(x, root.y + 0.14, z), new THREE.Vector3(x + Math.cos(a) * r * 0.6, root.y + 0.09, z + Math.sin(a) * r * 0.6), new THREE.Vector3(x + Math.cos(a) * r, floorAt(x + Math.cos(a) * r, z + Math.sin(a) * r) + 0.008, z + Math.sin(a) * r)], 0.027, root);
    }
    const n = 3 + Math.floor(rnd() * 3);
    for (let stem = 0; stem < n; stem++) {
      const a = az + between(-1.1, 1.1), spread = between(0.4, 1.5), end = top - (rnd() < 0.26 && stem > 0 ? between(1.5, 5) : 0), height = end - root.y;
      const phase = between(0, 6.28), tone = between(0.25, 0.95), bend = lean + spread;
      const at = (t: number) => new THREE.Vector3(x + Math.cos(a) * bend * t * t + Math.sin(t * 7 + phase) * 0.22 * t,
        root.y + height * (1 - Math.pow(1 - t, 1.45)), z + Math.sin(a) * bend * t * t + Math.cos(t * 6 + phase) * 0.20 * t);
      if (stem === 0) anchor.top.copy(at(1)); // every destination belongs to a real mature stipe
      const path = Array.from({ length: 16 }, (_, i) => at(i / 15));
      geo.tube(path, between(0.018, 0.028), root); stats.stipes++;
      const leaves = Math.floor(height / 0.66);
      for (let j = 1; j < leaves; j++) {
        const t = j / leaves, p = at(t), leafAz = a + (j % 2 ? 1 : -1) * between(0.85, 1.7) + Math.sin(j * 1.6) * 0.4;
        const len = between(0.58, 1.25) * (0.65 + t * 0.4);
        geo.bladder(p, leafAz, root, tone);
        geo.blade(p.clone().add(new THREE.Vector3(Math.cos(leafAz) * 0.13, 0.015, Math.sin(leafAz) * 0.13)), leafAz, len, len * between(0.135, 0.21), root, tone, t > 0.9);
        stats.blades++;
      }
      // Floating continuation of each mature stipe spreads into a broken amber canopy.
      if (end > -1) {
        const tip = at(1), canopy: THREE.Vector3[] = [];
        const run = between(2, 4.8);
        for (let j = 0; j <= 8; j++) {
          const t = j / 8, p = tip.clone().add(new THREE.Vector3(Math.cos(a) * run * t, -Math.sin(t * 3) * 0.12, Math.sin(a) * run * t + Math.sin(t * 3.1) * 0.4));
          canopy.push(p);
          if (j > 0) { const d = a + (j % 2 ? 1.2 : -1.2); geo.blade(p, d, between(0.7, 1.2), between(0.14, 0.22), root, tone, true); geo.bladder(p, d, root, tone); stats.blades++; }
        }
        geo.tube(canopy, 0.02, root);
      }
    }
  }
  for (const [key, builder] of buckets) {
    // Swayed leaf/stipe normals come from fragment derivatives; no stored normals needed.
    const geometry = builder.build(false), mesh = new THREE.Mesh(geometry, material); mesh.name = 'Macrocystis forest'; mesh.frustumCulled = false;
    group.add(mesh); const [x, z] = key.split(',').map(Number);
    cells.push({ x: (x + 0.5) * 40, z: (z + 0.5) * 40, mesh });
    stats.vertices += geometry.attributes.position.count; stats.triangles += geometry.index!.count / 3; stats.meshes++;
  }
  buildBenthos(loc, T, group, rnd, stats, floorAt);
  return { anchors, stats, floorAt };
}

function buildBenthos(loc: Sea, T: any, group: THREE.Group, rnd: () => number, stats: { urchins: number; batStars: number }, floorAt: (x: number, z: number) => number) {
  // Low-profile species-specific silhouettes; no tropical blue sea stars, cone shells or coral rubble.
  const matBenthos = mat(
    `attribute vec3 aColor; varying vec3 vWp; varying vec3 vN; varying vec3 vColor;
     void main(){ vec4 p=modelMatrix*instanceMatrix*vec4(position,1.0); vWp=p.xyz; vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal); vColor=aColor; gl_Position=projectionMatrix*viewMatrix*p; }`,
    `varying vec3 vWp; varying vec3 vN; varying vec3 vColor;
     void main(){ gl_FragColor=vec4(shade(vColor,vWp,normalize(vN),0.5),1.0); }`);
  const root: Root = { x: 0, y: 0, z: 0, phase: 0 }, builder = new Geometry();
  // Radial short spines around a purple urchin test, merged once and instanced.
  for (let i = 0; i < 90; i++) {
    const y = (i + 0.5) / 90, a = i * 2.399963, d = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y));
    builder.tube([d.clone().multiplyScalar(0.06), d.clone().multiplyScalar(0.13)], 0.006, root);
  }
  const urchin = builder.build();
  const star = new THREE.BufferGeometry(), sp: number[] = [0, 0.044, 0], si: number[] = [];
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 0.10 : 0.19; sp.push(Math.cos(a) * r, 0.012, Math.sin(a) * r); }
  for (let i = 0; i < 10; i++) si.push(0, (i + 1) % 10 + 1, i + 1);
  star.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); star.setIndex(si); star.computeVertexNormals();
  for (const [kind, geo, count] of [['urchin', urchin, 320], ['star', star, 110]] as const) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 9000 && points.length < count; i++) {
      const x = (rnd() - 0.5) * 275, z = (rnd() - 0.5) * 275; const y = loc.f(x, z);
      if (T.top(x, z) - y > 0.08) continue;
      if (TERR.reef < (kind === 'urchin' ? 0.58 : 0.22) || T.slope(x, z) > 0.65) continue;
      points.push(new THREE.Vector3(x, floorAt(x, z) + 0.015, z));
    }
    const g = geo.clone(), colors = new Float32Array(points.length * 3), mesh = new THREE.InstancedMesh(g, matBenthos, points.length);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
    points.forEach((p, i) => {
      const s = 0.8 + rnd() * 0.6;
      const n = new THREE.Vector3(floorAt(p.x - 0.1, p.z) - floorAt(p.x + 0.1, p.z), 0.2, floorAt(p.x, p.z - 0.1) - floorAt(p.x, p.z + 0.1)).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2));
      matrix.compose(p, q, scale.set(s, s, s)); mesh.setMatrixAt(i, matrix);
      colors.set(kind === 'urchin' ? [0.24 + rnd() * 0.12, 0.075, 0.31 + rnd() * 0.08] : [0.65 + rnd() * 0.15, 0.22 + rnd() * 0.15, 0.12], i * 3);
    });
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    mesh.name = kind === 'urchin' ? 'Purple urchins' : 'Bat stars'; mesh.frustumCulled = false; group.add(mesh);
    if (kind === 'urchin') stats.urchins = points.length; else stats.batStars = points.length;
  }
}
