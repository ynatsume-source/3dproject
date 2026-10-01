// A batched giant-kelp habitat. Flexible stipes, individual blades with basal floats, branching
// holdfasts and a loose surface canopy. Local seeded stream keeps it independent of fish RNG.
import * as THREE from 'three';
import type { Sea } from '../data/locations';
import { mulberry32 } from '../core/math';
import { mat } from '../render/common';

export interface KelpSpec { density(x: number, z: number): number; extent: number; spacing: number }
export const TEMPERATE_SURFACE = /* glsl */ `
vec3 temperateSurface(vec3 p, vec3 n, float hard, out vec3 nOut) {
  // Sample before mixing, including on ANGLE. Use neutral mineral/turf colours, no coral palette.
  vec3 sand = texture2D(tSandC, p.xz * 0.28).rgb;
  vec3 rock = texture2D(tRockC, p.xz * 0.42 + p.y * 0.14).rgb;
  vec2 sn = texture2D(tSandN, p.xz * 0.28).xy * 2.0 - 1.0;
  vec2 rn = texture2D(tRockN, p.xz * 0.42 + p.y * 0.14).xy * 2.0 - 1.0;
  float k = smoothstep(0.18, 0.67, hard + (1.0 - n.y) * 0.4);
  float mineral = dot(rock, vec3(0.30, 0.59, 0.11));
  vec3 stone = uRock * (0.65 + mineral * 1.7);
  stone = mix(stone, stone * vec3(0.72, 0.91, 0.57), smoothstep(0.38, 0.76, vn2(p.xz * 0.5)) * 0.55);
  vec2 dn = mix(sn, rn, k); nOut = normalize(n + vec3(dn.x, 0.0, dn.y) * 0.55);
  return mix(sand * uSand * 1.6, stone, k);
}
`;

export function buildKelp(loc: Sea, group: THREE.Group, top: (x: number, z: number) => number) {
  const spec = loc.kelp!, rng = mulberry32(loc.seed ^ 0x4b454c50), rr = (a: number, b: number) => a + (b - a) * rng();
  const roots: THREE.Vector3[] = [];
  const material = mat(
    `attribute vec2 aFlow; attribute vec3 aBlade; varying vec3 vWp; varying vec3 vBlade;
     void main(){
       vec3 p = position; float h = aFlow.x, t = uTime * 0.42, phase = aFlow.y;
       float bend = h * h;
       p.x += bend * (0.85 * sin(t + phase) + 0.3 * sin(t * 0.53 + phase * 0.7));
       p.z += bend * 0.55 * sin(t * 0.81 + phase + 1.1);
       p.y += aBlade.x * aBlade.x * 0.055 * sin(uTime * 1.1 + phase + aBlade.x * 5.0);
       vWp = p; vBlade = aBlade;
       gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
     }`,
    `varying vec3 vWp; varying vec3 vBlade;
     void main(){
       // Derivatives follow the displaced blade, including its fine corrugation.
       vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp)));
       vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float leaf = 1.0 - step(0.5, vBlade.z);
       float ridge = 0.92 + 0.08 * cos(vBlade.y * 21.0 + vBlade.x * 3.0);
       vec3 alb = mix(vec3(0.23, 0.19, 0.055), vec3(0.49, 0.38, 0.095), smoothstep(-16.0, -1.0, vWp.y));
       alb *= ridge * (0.82 + 0.22 * vn2(vWp.xz * 2.0 + vWp.y));
       float back = pow(max(0.0, dot(-V, SUN)), 3.0) * uSunI * leaf;
       vec3 col = shade(alb, vWp, n, 0.2);
       col += fogIt(absorb(vec3(0.22, 0.21, 0.06) * back, vWp.y), vWp) - fogIt(vec3(0.0), vWp);
       gl_FragColor = vec4(col, 1.0);
     }`, { opts: { side: THREE.DoubleSide } });
  // A few bounded tiles instead of one object per leaf. Bounds include the shader's maximum sway.
  type Batch = { p: number[]; flow: number[]; blade: number[]; ix: number[] };
  const batches = new Map<string, Batch>();
  const batchFor = (x: number, z: number) => {
    const key = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
    if (!batches.has(key)) batches.set(key, { p: [], flow: [], blade: [], ix: [] });
    return batches.get(key)!;
  };
  for (let gx = -spec.extent; gx < spec.extent; gx += spec.spacing) for (let gz = -spec.extent; gz < spec.extent; gz += spec.spacing) {
    const x = gx + rr(1, spec.spacing - 1), z = gz + rr(1, spec.spacing - 1);
    if (rng() > spec.density(x, z) * 0.8) continue;
    const y = top(x, z) - 0.07; if (y > -5 || y < -24) continue;
    const root = new THREE.Vector3(x, y, z); roots.push(root);
    const b = batchFor(x, z), phase = x * 0.037 + z * 0.023, height = -0.65 - y;
    const vertex = (p: THREE.Vector3, u = 0, v = 0, part = 1) => {
      const i = b.p.length / 3; b.p.push(p.x, p.y, p.z);
      b.flow.push(Math.max(0, Math.min(1, (p.y - y) / height)), phase); b.blade.push(u, v, part); return i;
    };
    const tube = (a: THREE.Vector3, end: THREE.Vector3, r0: number, r1: number) => {
      const d = end.clone().sub(a).normalize(), u = new THREE.Vector3(0, 0, 1).cross(d).normalize(), v = d.clone().cross(u), start = b.p.length / 3;
      for (let j = 0; j < 2; j++) for (let k = 0; k < 4; k++) {
        const angle = k / 4 * Math.PI * 2;
        vertex((j ? end : a).clone().addScaledVector(u, Math.cos(angle) * (j ? r1 : r0)).addScaledVector(v, Math.sin(angle) * (j ? r1 : r0)));
      }
      for (let k = 0; k < 4; k++) { const a0 = start + k, a1 = start + (k + 1) % 4; b.ix.push(a0, a1, a0 + 4, a1, a1 + 4, a0 + 4); }
    };
    const bulb = (p: THREE.Vector3, direction: THREE.Vector3) => {
      const start = b.p.length / 3, v = new THREE.Vector3(0, 1, 0), u = v.clone().cross(direction).normalize();
      vertex(p.clone().addScaledVector(direction, -0.075));
      for (let k = 0; k < 6; k++) vertex(p.clone().addScaledVector(v, Math.sin(k / 6 * Math.PI * 2) * 0.07).addScaledVector(u, Math.cos(k / 6 * Math.PI * 2) * 0.07));
      vertex(p.clone().addScaledVector(direction, 0.13));
      for (let k = 0; k < 6; k++) { const a = start + 1 + k, c = start + 1 + (k + 1) % 6; b.ix.push(start, c, a, start + 7, a, c); }
    };
    // Branching haptera grasp the substrate. They do not resemble a tree planted in sand.
    for (let j = 0; j < 9; j++) {
      const angle = j * 2.399, d = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const mid = root.clone().addScaledVector(d, 0.32).add(new THREE.Vector3(0, 0.25, 0));
      tube(root.clone().add(new THREE.Vector3(0, 0.48, 0)), mid, 0.055, 0.033);
      const end = root.clone().addScaledVector(d, rr(0.45, 0.8)); tube(mid, end, 0.033, 0.012);
    }
    for (let frond = 0; frond < 4; frond++) {
      const az = rr(0, Math.PI * 2), spread = rr(1.8, 4.6), lean = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const h = height * rr(0.94, 1), steps = Math.ceil(h / 0.65);
      const at = (t: number) => root.clone().add(new THREE.Vector3(0, h * t, 0)).addScaledVector(lean, spread * t * t).add(new THREE.Vector3(Math.sin(t * 4 + az) * 0.28 * t, 0, Math.cos(t * 3 + az) * 0.26 * t));
      let prev = at(0);
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, p = at(t); tube(prev, p, 0.034 - t * 0.017, 0.034 - t * 0.017); prev = p;
        if (j < 2) continue;
        const angle = az + j * 2.4, d = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const side = new THREE.Vector3(-d.z, 0, d.x), len = rr(1.15, 1.85) * (0.7 + t * 0.3), width = rr(0.11, 0.20);
        const N = 5; bulb(p, d);
        const leafStart = b.p.length / 3;
        for (let k = 0; k <= N; k++) for (let across = -1; across <= 1; across++) {
          const u = k / N, w = Math.pow(Math.sin(Math.PI * u), 0.72) * width;
          const pt = p.clone().addScaledVector(d, 0.13 + u * len).addScaledVector(side, across * w);
          pt.y += Math.sin(u * Math.PI) * 0.27 - u * u * 0.27 + Math.abs(across) * 0.045 * Math.sin(u * 20 + j);
          vertex(pt, u, across, 0);
        }
        for (let k = 0; k < N; k++) for (let a = 0; a < 2; a++) { const i = leafStart + k * 3 + a; b.ix.push(i, i + 3, i + 1, i + 1, i + 3, i + 4); }
      }
      // Surface fronds turn into the current; a broken, layered canopy allows sky between them.
      if (h > height * 0.92) {
        let a = prev;
        for (let k = 1; k <= 7; k++) {
          const p = a.clone().add(new THREE.Vector3(0.65, Math.sin(k * 0.8) * 0.035, 0.25)); tube(a, p, 0.018, 0.015);
          const side = new THREE.Vector3(-0.35, -0.08, k % 2 ? 1 : -1).normalize(); bulb(p, side);
          const st = b.p.length / 3;
          for (let q = 0; q <= 6; q++) for (const v of [-1, 0, 1]) {
            const u = q / 6, pt = p.clone().addScaledVector(side, u * 1.3).add(new THREE.Vector3(v * 0.15 * Math.sin(u * Math.PI), -0.18 * u * u, 0)); vertex(pt, u, v, 0);
          }
          for (let q = 0; q < 6; q++) for (let v = 0; v < 2; v++) { const i = st + q * 3 + v; b.ix.push(i, i + 3, i + 1, i + 1, i + 3, i + 4); }
          a = p;
        }
      }
    }
  }
  let vertices = 0;
  for (const b of batches.values()) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(b.flow, 2)); g.setAttribute('aBlade', new THREE.Float32BufferAttribute(b.blade, 3)); g.setIndex(b.ix);
    g.computeBoundingBox(); g.boundingBox!.expandByScalar(1.3); g.computeBoundingSphere(); g.boundingSphere!.radius += 1.3;
    vertices += b.p.length / 3; const mesh = new THREE.Mesh(g, material); mesh.name = 'giant-kelp'; group.add(mesh);
  }
  return { roots, count: roots.length, vertices, batches: batches.size };
}
