// The forest floor is a mosaic, not a second canopy. These procedural forms represent
// juvenile Macrocystis and unidentified broad-leaved brown / low branching red algae.
// They are not species records or measured cover for Bluefish Cove.
import * as THREE from 'three';
import { mulberry32, smooth, TERR, vnoise } from '../core/math';
import { mat } from '../render/common';
import type { Sea } from '../data/locations';

export type UnderstoryKind = 'juvenile' | 'broadleaf' | 'branching';
export type UnderstoryAnchor = { pos: THREE.Vector3; leaf: THREE.Vector3; kind: UnderstoryKind; height: number;
  supportAt?: (time: number) => { pos: THREE.Vector3; normal: THREE.Vector3 } };

/** Distance to the actual cruise, used only as a design weight; never changes rock/sand. */
export function kelpCruiseHabitat(loc: Sea) {
  const route = Array.from({ length: 80 }, (_, i) => loc.path(i / 80 * Math.PI * 2));
  return (x: number, z: number) => {
    let d2 = Infinity;
    for (const [px, pz] of route) d2 = Math.min(d2, (px - x) ** 2 + (pz - z) ** 2);
    const near = 1 - smooth(16, 42, Math.sqrt(d2));
    const patch = smooth(0.28, 0.73, vnoise(x * 0.052 + 29, z * 0.052 - 17));
    return { near, patch };
  };
}

// Small indexed geometry, reused by every instance of a form. UV.y is a blade's
// transverse coordinate; UV.x distinguishes the stalk from its translucent blade.
class Frond {
  p: number[] = []; uv: number[] = []; ix: number[] = [];
  vertex(p: THREE.Vector3, u = 0, v = 0) { const i = this.p.length / 3; this.p.push(p.x, p.y, p.z); this.uv.push(u, v); return i; }
  stem(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const axis = b.clone().sub(a).normalize(), side = new THREE.Vector3(0, 0, 1).cross(axis).normalize(), up = axis.clone().cross(side);
    const start = this.p.length / 3;
    for (const [j, p] of [a, b].entries()) for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2;
      this.vertex(p.clone().addScaledVector(side, Math.cos(ang) * r * (1 - j * 0.5)).addScaledVector(up, Math.sin(ang) * r * (1 - j * 0.5)));
      if (j) { const n = start + 4 + k, next = start + 4 + (k + 1) % 4; this.ix.push(n - 4, next - 4, n, next - 4, next, n); }
    }
  }
  blade(base: THREE.Vector3, az: number, len: number, width: number, rise: number, phase: number, steps = 7) {
    const start = this.p.length / 3, out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, w = Math.pow(Math.sin(t * Math.PI), 0.8) * width;
      for (let k = -1; k <= 1; k++) {
        const p = base.clone().addScaledVector(out, t * len * 0.8).addScaledVector(side, k * w + Math.sin(t * 2.8) * len * 0.1);
        p.y += len * (rise * t - t * t * 0.48) + Math.abs(k) * Math.sin(t * 27 + phase) * width * 0.24;
        this.vertex(p, t + 0.01, k);
      }
      if (j) for (let k = 0; k < 2; k++) { const i = start + j * 3 + k; this.ix.push(i - 3, i - 2, i, i - 2, i + 1, i); }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.ix); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function shape(kind: UnderstoryKind) {
  const g = new Frond();
  if (kind === 'juvenile') {
    // Young giant kelp retains the long narrow blades of Macrocystis, below the canopy.
    for (let s = 0; s < 3; s++) {
      const az = s * 2.399, top = 1.65 + s * 0.28;
      let previous = new THREE.Vector3();
      for (let j = 1; j <= 8; j++) {
        const t = j / 8, p = new THREE.Vector3(Math.cos(az) * t * t * 0.3, top * t, Math.sin(az) * t * t * 0.3);
        g.stem(previous, p, 0.009); previous = p;
        const a = az + (j % 2 ? 1.2 : -1.2), len = 0.44 + 0.1 * Math.sin(j + s);
        g.blade(p, a, len, len * 0.075, 0.65, j + s, 5);
        // A small basal float, deliberately not a bull-kelp bulb.
        const b = new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(0.065).add(p);
        g.stem(p, b, 0.018);
      }
    }
  } else if (kind === 'broadleaf') {
    for (let i = 0; i < 8; i++) {
      const az = i * 2.399, base = new THREE.Vector3(Math.cos(az) * 0.055, 0.12 + (i % 3) * 0.09, Math.sin(az) * 0.055);
      g.stem(new THREE.Vector3(), base, 0.016);
      g.blade(base, az, 0.55 + (i % 3) * 0.17, 0.085 + (i % 2) * 0.025, 0.9 + (i % 3) * 0.12, i);
    }
  } else {
    // A low, articulated red-algal tuft. Most placements stay below 20 cm.
    for (let i = 0; i < 8; i++) {
      const az = i * 2.399, end = new THREE.Vector3(Math.cos(az) * 0.065, 0.10 + (i % 3) * 0.028, Math.sin(az) * 0.065);
      g.stem(new THREE.Vector3(), end, 0.008);
      for (let k = 0; k < 3; k++) {
        const at = end.clone().multiplyScalar(0.43 + k * 0.18), a = az + (k % 2 ? 1 : -1) * 0.75;
        g.stem(at, at.clone().add(new THREE.Vector3(Math.cos(a) * 0.062, 0.045, Math.sin(a) * 0.062)), 0.004);
      }
    }
  }
  return g.geometry();
}

export function makeKelpUnderstory(loc: Sea, group: THREE.Group, T: any, cells: any[], floorAt: (x: number, z: number) => number) {
  const rnd = mulberry32(loc.seed + 4619), habitat = kelpCruiseHabitat(loc);
  const anchors: UnderstoryAnchor[] = [], stats = { juvenile: 0, broadleaf: 0, branching: 0, meshes: 0, verticesStored: 0, trianglesStored: 0, trianglesInstanced: 0 };
  type Placed = { anchor: UnderstoryAnchor; matrix: THREE.Matrix4; phase: number; tint: number };
  const batches = new Map<string, { kind: UnderstoryKind; x: number; z: number; plants: Placed[] }>();
  const up = new THREE.Vector3(0, 1, 0), geometries = { juvenile: shape('juvenile'), broadleaf: shape('broadleaf'), branching: shape('branching') };
  const material = mat(
    `attribute vec2 aPlant; varying vec3 vWp; varying vec2 vUv; varying vec2 vPlant;
     void main(){
       vec3 p=position; float h=max(0.0,p.y); vec3 root=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
       float ph=uTime*0.38+root.x*0.018+root.z*0.026;
       p.x+=h*h/(1.0+h)*sin(ph+aPlant.x*0.15)*0.11;
       p.z+=h*h/(1.0+h)*cos(ph*0.87+aPlant.x*0.15)*0.08;
       p.y+=sin(uTime*0.91+position.y*2.4+aPlant.x)*abs(uv.y)*uv.x*min(h,1.0)*0.012;
       vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.0); vWp=wp.xyz; vUv=uv; vPlant=aPlant;
       gl_Position=projectionMatrix*viewMatrix*wp;
     }`,
    `varying vec3 vWp; varying vec2 vUv; varying vec2 vPlant;
     void main(){
       vec3 n=normalize(cross(dFdx(vWp),dFdy(vWp))), V=normalize(uCamPos-vWp); if(dot(n,V)<0.0)n=-n;
       float red=step(2.0,vPlant.y), tone=fract(vPlant.y), leaf=step(0.005,vUv.x);
       vec3 brown=mix(vec3(0.27,0.20,0.075),vec3(0.44,0.30,0.11),tone);   // (olive to tawny brown: brown algae, not land green)
       vec3 alb=mix(brown,mix(vec3(0.24,0.10,0.13),vec3(0.49,0.26,0.30),tone),red);
       alb*=0.89+0.09*(1.0-abs(vUv.y))+sin(vUv.x*60.0+abs(vUv.y)*11.0)*0.035;
       float through=pow(max(dot(V,SUN),0.0),3.0)*(0.3+0.7*abs(dot(n,SUN)));
       vec3 light=lightAt(n)+uTint*uSunI*leaf*(1.0-red)*(0.12+through*0.32);
       vec3 col=absorb(alb*light*1.3,vWp.y)+lamp(alb,vWp,n);
       gl_FragColor=vec4(fogIt(col,vWp),1.0);
     }`, { opts: { side: THREE.DoubleSide } });
  // Jittered patches favour the cruise's rocky reaches while preserving both the
  // broad sand lane and smaller sand pockets. Density here is an artistic design value.
  for (let x0 = -122; x0 < 122; x0 += 2.45) for (let z0 = -122; z0 < 122; z0 += 2.45) {
    const x = x0 + (rnd() - 0.5) * 1.9, z = z0 + (rnd() - 0.5) * 1.9;
    const y = loc.f(x, z), cover = TERR.reef, { near, patch } = habitat(x, z);
    if (cover < 0.52 || y > -5 || y < -22 || rnd() > cover * (0.08 + near * 0.74) * (0.28 + patch * 0.72)) continue;
    if (T.slope(x, z) > 0.68 || T.top(x, z) - y > 0.10) continue;
    const chance = rnd(), kind: UnderstoryKind = chance < 0.17 ? 'juvenile' : chance < 0.73 ? 'broadleaf' : 'branching';
    const scale = kind === 'juvenile' ? 0.6 + rnd() * 0.65 : kind === 'broadleaf' ? 0.7 + rnd() * 0.8 : 0.75 + rnd() * 0.4;
    const n = new THREE.Vector3(floorAt(x - 0.08, z) - floorAt(x + 0.08, z), 0.16, floorAt(x, z - 0.08) - floorAt(x, z + 0.08)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI * 2));
    const pos = new THREE.Vector3(x, floorAt(x, z) + 0.005, z), matrix = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(scale, scale, scale));
    // A broadleaf attachment point on the centre of the first real blade. Benthic
    // consumers can use this without pretending an arbitrary point is a living leaf.
    const phase = rnd() * 6.28, tLeaf = 3 / 7;
    const leafLocal = (t: number, k: number) => new THREE.Vector3(0.055 + 0.55 * 0.8 * t,
      0.12 + 0.55 * (0.9 * t - 0.48 * t * t) + Math.abs(k) * Math.sin(t * 27) * 0.085 * 0.24,
      Math.sin(t * 2.8) * 0.55 * 0.1 + k * Math.pow(Math.sin(t * Math.PI), 0.8) * 0.085);
    const leaf = (kind === 'broadleaf' ? leafLocal(tLeaf, 0) : new THREE.Vector3(0, 0.12, 0)).applyMatrix4(matrix);
    const anchor: UnderstoryAnchor = { pos, leaf, kind, height: geometries[kind].boundingBox!.max.y * scale };
    if (kind === 'broadleaf') anchor.supportAt = (time: number) => {
      // The same deformation as the vertex shader. Three real vertices define a
      // support triangle so a tiny animal stays on the moving blade, even in close-up.
      const sway = (t: number, k: number) => {
        const p = leafLocal(t, k), h = Math.max(0, p.y), ph = time * 0.38 + pos.x * 0.018 + pos.z * 0.026;
        p.x += h * h / (1 + h) * Math.sin(ph + phase * 0.15) * 0.11;
        p.z += h * h / (1 + h) * Math.cos(ph * 0.87 + phase * 0.15) * 0.08;
        p.y += Math.sin(time * 0.91 + p.y * 2.4 + phase) * Math.abs(k) * (t + 0.01) * Math.min(h, 1) * 0.012;
        return p.applyMatrix4(matrix);
      };
      const a = sway(tLeaf, 0), b = sway(tLeaf, -1), c = sway(4 / 7, -1);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(); if (normal.y < 0) normal.negate();
      return { pos: a, normal };
    };
    anchors.push(anchor); stats[kind]++;
    const ix = Math.floor(x / 40), iz = Math.floor(z / 40), key = `${kind}:${ix},${iz}`;
    let batch = batches.get(key); if (!batch) { batch = { kind, x: (ix + 0.5) * 40, z: (iz + 0.5) * 40, plants: [] }; batches.set(key, batch); }
    batch.plants.push({ anchor, matrix, phase, tint: (kind === 'branching' ? 2 : 0) + 0.15 + rnd() * 0.75 });
  }
  // Clone only the small buffer containers: position/index arrays remain shared.
  // Instance-specific phase/tone belongs to a batch, never to a duplicated plant mesh.
  for (const batch of batches.values()) {
    const source = geometries[batch.kind], g = new THREE.BufferGeometry();
    g.setAttribute('position', source.attributes.position); g.setAttribute('uv', source.attributes.uv); g.setIndex(source.index);
    const variation = new Float32Array(batch.plants.length * 2), mesh = new THREE.InstancedMesh(g, material, batch.plants.length);
    batch.plants.forEach((p, i) => { mesh.setMatrixAt(i, p.matrix); variation.set([p.phase, p.tint], i * 2); });
    g.setAttribute('aPlant', new THREE.InstancedBufferAttribute(variation, 2));
    mesh.name = `Kelp understory: ${batch.kind}`; mesh.frustumCulled = false; group.add(mesh);
    cells.push({ x: batch.x, z: batch.z, mesh, small: true });   // (low on the floor: drawn only near, like the reef's small things)
    stats.meshes++; stats.trianglesInstanced += source.index!.count / 3 * batch.plants.length;
  }
  for (const g of Object.values(geometries)) { stats.verticesStored += g.attributes.position.count; stats.trianglesStored += g.index!.count / 3; }
  return { anchors, stats };
}
