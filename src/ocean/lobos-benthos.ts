// Point Lobos' small residents. Numbers and movement rates are illustrative, not a
// census or measured Bluefish Cove speeds. Snail/anemone/sponge forms are deliberately
// not assigned a species: the CDFW local record is broader than our identification.
import * as THREE from 'three';
import { mulberry32, TERR } from '../core/math';
import { mat } from '../render/common';
import type { Sea } from '../data/locations';

export type LobosBenthosKind = 'urchin' | 'batStar' | 'snail' | 'anemone' | 'sponge';
type Floor = (x: number, z: number) => number;
export type LobosLeafSupport = {
  pos: THREE.Vector3; kind: string; leaf?: THREE.Vector3;
  supportAt?: (time: number) => { pos: THREE.Vector3; normal: THREE.Vector3 };
};
export type LobosBenthicResident = {
  kind: LobosBenthosKind; home: THREE.Vector3; pos: THREE.Vector3;
  phase: number; scale: number; heading: number; color: THREE.Color;
  leaf?: LobosLeafSupport;
};

const UP = new THREE.Vector3(0, 1, 0), TAU = Math.PI * 2;

// Absolute-time, bounded paths: a visitor returning later sees the same slow crawl,
// independent of frame rate, camera, or drawing quality. Leaf riders stay attached;
// stars and rock snails crawl slowly within a small support-preserving envelope.
export function sampleLobosBenthosPose(resident: LobosBenthicResident, time: number, floorAt: Floor) {
  const p = resident.home.clone(), t = Number.isFinite(time) ? Math.max(0, time) : 0;
  if (resident.kind === 'batStar') {
    const w = 0.0011, a = resident.phase;
    p.x += 0.18 * (Math.sin(t * w + a) - Math.sin(a));
    p.z += 0.13 * (Math.sin(t * w * 0.73 + a * 1.7) - Math.sin(a * 1.7));
  } else if (resident.kind === 'snail' && !resident.leaf) {
    const w = 0.0018, a = resident.phase;
    p.x += 0.07 * (Math.sin(t * w + a) - Math.sin(a));
    p.z += 0.05 * (Math.cos(t * w + a) - Math.cos(a));
  }
  p.y = floorAt(p.x, p.z);
  const e = 0.035;
  const normal = new THREE.Vector3(floorAt(p.x - e, p.z) - floorAt(p.x + e, p.z), 2 * e,
    floorAt(p.x, p.z - e) - floorAt(p.x, p.z + e)).normalize();
  if (resident.leaf?.supportAt) return resident.leaf.supportAt(t);
  return { pos: p, normal };
}

class Geometry {
  position: number[] = []; local: number[] = []; anchor: number[] = []; flex: number[] = []; index: number[] = [];
  vertex(p: THREE.Vector3, anchor = p, flex = 0) {
    const i = this.position.length / 3;
    this.position.push(p.x, p.y, p.z); this.local.push(p.x, p.y, p.z);
    this.anchor.push(anchor.x, anchor.y, anchor.z); this.flex.push(flex); return i;
  }
  ellipsoid(center: THREE.Vector3, radius: THREE.Vector3, segments = 12, rings = 6) {
    const start = this.position.length / 3;
    for (let j = 0; j <= rings; j++) for (let i = 0; i < segments; i++) {
      const b = j / rings * Math.PI, a = i / segments * TAU;
      this.vertex(new THREE.Vector3(center.x + radius.x * Math.sin(b) * Math.cos(a),
        center.y + radius.y * Math.cos(b), center.z + radius.z * Math.sin(b) * Math.sin(a)));
      if (j) { const k = start + j * segments + i, n = start + j * segments + (i + 1) % segments;
        this.index.push(k - segments, k, n - segments, n - segments, k, n); }
    }
  }
  cone(base: THREE.Vector3, tip: THREE.Vector3, radius: number, flex = 0) {
    const tangent = tip.clone().sub(base).normalize(), side = new THREE.Vector3(0, 1, 0).cross(tangent);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0); else side.normalize();
    const cross = tangent.clone().cross(side), start = this.position.length / 3;
    for (let i = 0; i < 4; i++) this.vertex(base.clone().addScaledVector(side, radius * Math.cos(i * Math.PI / 2))
      .addScaledVector(cross, radius * Math.sin(i * Math.PI / 2)), base, 0);
    const end = this.vertex(tip, base, flex);
    for (let i = 0; i < 4; i++) this.index.push(start + i, start + (i + 1) % 4, end);
  }
  tube(points: THREE.Vector3[], radius: number, flex = 0) {
    const start = this.position.length / 3, sides = 4;
    for (let j = 0; j < points.length; j++) {
      const tangent = points[Math.min(j + 1, points.length - 1)].clone().sub(points[Math.max(j - 1, 0)]).normalize();
      const side = new THREE.Vector3(0, 0, 1).cross(tangent).normalize(), across = tangent.clone().cross(side);
      const r = radius * (1 - 0.91 * j / (points.length - 1));
      for (let i = 0; i < sides; i++) {
        this.vertex(points[j].clone().addScaledVector(side, r * Math.cos(i / sides * TAU))
          .addScaledVector(across, r * Math.sin(i / sides * TAU)), points[0], flex * j / (points.length - 1));
        if (j) { const k = start + j * sides + i, n = start + j * sides + (i + 1) % sides;
          this.index.push(k - sides, k, n - sides, n - sides, k, n); }
      }
    }
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geo.setAttribute('aLocal', new THREE.Float32BufferAttribute(this.local, 3));
    geo.setAttribute('aAnchor', new THREE.Float32BufferAttribute(this.anchor, 3));
    geo.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
    geo.setIndex(this.index); return geo;
  }
}

function form(kind: Exclude<LobosBenthosKind, 'batStar'>) {
  const g = new Geometry();
  if (kind === 'urchin') {
    const center = new THREE.Vector3(0, 0.047, 0);
    g.ellipsoid(center, new THREE.Vector3(0.060, 0.046, 0.060), 10, 5);
    for (let i = 0; i < 58; i++) {
      const y = 0.08 + 0.92 * (i + 0.5) / 58, a = i * 2.399963, r = Math.sqrt(1 - y * y);
      const dir = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
      const base = new THREE.Vector3(dir.x * 0.056, 0.047 + dir.y * 0.044, dir.z * 0.056);
      g.cone(base, base.clone().addScaledVector(dir, 0.042 + 0.013 * Math.sin(i * 7.3)), 0.0026, 0.65);
    }
  } else if (kind === 'snail') {
    // A small turban-like gastropod, with a continuous ribbed spire and a visible foot.
    // This represents the local photograph's snail form; species identification remains open.
    g.ellipsoid(new THREE.Vector3(0.004, 0.0045, 0), new THREE.Vector3(0.028, 0.0045, 0.016), 16, 5);
    const start = g.position.length / 3, sides = 28, rings = 18;
    for (let j = 0; j <= rings; j++) for (let i = 0; i < sides; i++) {
      const t = j / rings, a = i / sides * TAU;
      const r = (0.022 * Math.pow(1 - t, 0.68) + 0.001) * (1 + 0.035 * Math.cos(a * 15 + t * 43));
      const y = 0.006 + t * 0.031 + Math.sin(a + t * TAU * 3.4) * 0.0011 * (1 - t);
      g.vertex(new THREE.Vector3(r * Math.cos(a) - 0.003, y, r * Math.sin(a)));
      if (j) { const k = start + j * sides + i, n = start + j * sides + (i + 1) % sides;
        g.index.push(k - sides, k, n - sides, n - sides, k, n); }
    }
    for (const sign of [-1, 1]) g.tube([new THREE.Vector3(0.023, 0.007, sign * 0.006),
      new THREE.Vector3(0.03, 0.011, sign * 0.009), new THREE.Vector3(0.038, 0.013, sign * 0.014)], 0.001, 0.08);
  } else if (kind === 'anemone') {
    // A low column and two irregular rings of tentacles, not a coral or a tropical host.
    g.ellipsoid(new THREE.Vector3(0, 0.033, 0), new THREE.Vector3(0.029, 0.033, 0.029), 16, 6);
    g.ellipsoid(new THREE.Vector3(0, 0.064, 0), new THREE.Vector3(0.042, 0.006, 0.042), 20, 4);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399963, r = i % 2 ? 0.034 : 0.022, length = i % 2 ? 0.043 : 0.032;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j < 5; j++) {
        const t = j / 4, rr = r + length * (0.2 * t + 0.36 * t * t);
        points.push(new THREE.Vector3(Math.cos(a) * rr, 0.064 + length * (t - 0.17 * t * t), Math.sin(a) * rr));
      }
      g.tube(points, 0.0036, 1);
    }
  } else {
    // Encrusting lobes: centimetres high, with pores suggested in the material.
    g.ellipsoid(new THREE.Vector3(0, 0.010, 0), new THREE.Vector3(0.071, 0.012, 0.052), 16, 5);
    for (let i = 0; i < 5; i++) { const a = i * 2.399963;
      g.ellipsoid(new THREE.Vector3(Math.cos(a) * 0.036, 0.011 + 0.006 * (i % 2), Math.sin(a) * 0.026),
        new THREE.Vector3(0.033, 0.013 + 0.006 * (i % 2), 0.028), 10, 4); }
  }
  return g.build();
}

function material(instanced: boolean, kind: number) {
  return mat(
    `attribute vec3 aLocal; attribute vec3 aAnchor; attribute float aFlex;
     attribute vec3 aColor; attribute float aPhase;
     varying vec3 vWp; varying vec3 vLocal; varying vec3 vColor;
     void main(){
       vec3 p=position;
       #ifdef LOBOS_INSTANCED
       vec3 origin=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
       // (past what the water lets one see of something this small: not drawn at all)
       if (distance(origin,uCamPos) > 34.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
       float nearby=1.0-smoothstep(14.0,30.0,distance(origin,uCamPos));
       vec3 rel=p-aAnchor;
       float wave=sin(uTime*0.57+aPhase+aAnchor.x*19.0+aAnchor.z*23.0)*aFlex*nearby;
       // Small independent spine/tentacle flex around each attached base, never whole-body wobble.
       p+=vec3(rel.y, -rel.x*0.14,rel.y*0.65)*wave*0.055;
       vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.0);
       #else
       vec4 wp=modelMatrix*vec4(p,1.0);
       #endif
       vWp=wp.xyz; vLocal=aLocal; vColor=aColor;
       gl_Position=projectionMatrix*viewMatrix*wp;
     }`,
    `varying vec3 vWp; varying vec3 vLocal; varying vec3 vColor;
     void main(){
       vec3 n=normalize(cross(dFdx(vWp),dFdy(vWp)));
       if(dot(n,uCamPos-vWp)<0.0) n=-n;
       float grain=vn2(vLocal.xz*720.0+vLocal.y*91.0);
       vec3 alb=vColor*(0.84+grain*0.26);
       #if LOBOS_KIND == 1
       // Bat stars' granular skin, subtly mottled rather than a flat orange icon.
       alb*=0.85+0.24*vn2(vLocal.xz*75.0);
       #elif LOBOS_KIND == 2
       float rib=pow(0.5+0.5*sin(atan(vLocal.z,vLocal.x+0.003)*19.0+vLocal.y*560.0),5.0);
       alb=mix(alb,vec3(0.48,0.40,0.25),rib*0.33);
       alb=mix(alb,vec3(0.31,0.28,0.19),1.0-smoothstep(0.006,0.011,vLocal.y));
       #elif LOBOS_KIND == 3
       float mouth=1.0-smoothstep(0.003,0.011,length(vLocal.xz));
       alb*=1.0-mouth*smoothstep(0.062,0.065,vLocal.y)*0.6;
       #elif LOBOS_KIND == 4
       alb*=1.0-smoothstep(0.72,0.85,grain)*0.45;
       #endif
       gl_FragColor=vec4(shade(alb,vWp,n,0.35),1.0);
     }`, { defines: { ...(instanced ? { LOBOS_INSTANCED: 1 } : {}), LOBOS_KIND: kind }, opts: { side: THREE.DoubleSide } });
}

export function buildLobosBenthos(loc: Sea, T: { top: Floor; slope: Floor }, group: THREE.Group, floorAt: Floor,
  options: { understoryAnchors?: LobosLeafSupport[] } = {}) {
  const rnd = mulberry32(loc.seed + 1601), between = (a: number, b: number) => a + (b - a) * rnd();
  const residents: LobosBenthicResident[] = [], patches: THREE.Vector3[] = [];
  const eligible = (x: number, z: number, rock = 0.38) => {
    const y = loc.f(x, z), cover = TERR.reef;
    return cover > rock && y < -5 && y > -22 && T.top(x, z) - y < 0.12 && T.slope(x, z) < 0.68;
  };
  // Habitat patches are deliberately concentrated around the ordinary cruise, with
  // open sand left empty. The remainder gives distant forest its own quiet inhabitants.
  for (let i = 0; i < 900 && patches.length < 34; i++) {
    const [px, pz] = loc.path(between(0, TAU)), close = patches.length < 24;
    const x = close ? px + between(-13, 13) : between(-125, 125), z = close ? pz + between(-13, 13) : between(-125, 125);
    if (!eligible(x, z, 0.50) || patches.some(p => Math.hypot(p.x - x, p.z - z) < 7)) continue;
    patches.push(new THREE.Vector3(x, floorAt(x, z), z));
  }
  const colors: Record<LobosBenthosKind, number[][]> = {
    urchin: [[0.27, 0.10, 0.37], [0.36, 0.15, 0.43]],
    batStar: [[0.73, 0.31, 0.20], [0.69, 0.44, 0.22], [0.41, 0.37, 0.35]],
    snail: [[0.15, 0.22, 0.19], [0.29, 0.24, 0.19]],
    anemone: [[0.46, 0.43, 0.29], [0.68, 0.53, 0.35], [0.56, 0.28, 0.21]],
    sponge: [[0.67, 0.36, 0.17], [0.57, 0.48, 0.27], [0.47, 0.25, 0.25]],
  };
  const budgets: [LobosBenthosKind, number][] = [['urchin', 320], ['batStar', 110], ['snail', 30], ['anemone', 58], ['sponge', 74]];
  for (const [kind, count] of budgets) {
    let added = 0;
    for (let attempt = 0; attempt < count * 70 && added < count && patches.length; attempt++) {
      const patch = patches[Math.floor(rnd() * patches.length)], a = between(0, TAU);
      const radius = Math.sqrt(rnd()) * (kind === 'urchin' ? 2.2 : 4.7);
      const x = patch.x + Math.cos(a) * radius, z = patch.z + Math.sin(a) * radius;
      if (!eligible(x, z, kind === 'urchin' ? 0.57 : 0.36)) continue;
      // A crawling star's small lifetime envelope stays on this rocky patch.
      if (kind === 'batStar' && ![[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dx, dz]) => eligible(x + dx, z + dz, 0.25))) continue;
      const home = new THREE.Vector3(x, floorAt(x, z), z), palette = colors[kind];
      if (residents.some(r => r.home.distanceToSquared(home) < 0.24 * 0.24)) continue;
      const color = new THREE.Color(...palette[Math.floor(rnd() * palette.length)] as [number, number, number]);
      residents.push({ kind, home, pos: home.clone(), color, phase: between(0, TAU), heading: between(0, TAU), scale: between(0.72, 1.22) }); added++;
    }
  }
  // A few snails occupy genuine leaves if that module supplies its moving support.
  // Do not use a guessed world-space point that would detach when the blade bends.
  const route = Array.from({ length: 72 }, (_, i) => loc.path(i / 72 * TAU));
  const distanceToRoute = (p: THREE.Vector3) => Math.min(...route.map(([x, z]) => (p.x - x) ** 2 + (p.z - z) ** 2));
  const supports = (options.understoryAnchors?.filter(a => a.kind === 'broadleaf' && a.supportAt) ?? [])
    .sort((a, b) => distanceToRoute(a.pos) - distanceToRoute(b.pos));
  const snails = residents.filter(r => r.kind === 'snail');
  supports.slice(0, Math.min(12, snails.length)).forEach((leaf, i) => {
    snails[i].leaf = leaf; const support = leaf.supportAt!(0);
    snails[i].home.copy(support.pos); snails[i].pos.copy(support.pos);
  });

  const meshes: THREE.Mesh[] = [], instances = new Map<LobosBenthosKind, { mesh: THREE.InstancedMesh; list: LobosBenthicResident[] }>();
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), yaw = new THREE.Quaternion(), scale = new THREE.Vector3();
  const place = (resident: LobosBenthicResident, time: number) => {
    const support = sampleLobosBenthosPose(resident, time, floorAt);
    let heading = resident.heading;
    if (resident.kind === 'snail' && !resident.leaf) {
      const a = Math.max(0, time) * 0.0018 + resident.phase;
      heading = Math.atan2(0.05 * Math.sin(a), 0.07 * Math.cos(a));
    }
    resident.pos.copy(support.pos); q.setFromUnitVectors(UP, support.normal).multiply(yaw.setFromAxisAngle(UP, heading));
    matrix.compose(support.pos, q, scale.setScalar(resident.scale)); return matrix;
  };
  for (const [kind, number] of [['urchin', 0], ['snail', 2], ['anemone', 3], ['sponge', 4]] as const) {
    const list = residents.filter(r => r.kind === kind), geo = form(kind);
    const col = new Float32Array(list.length * 3), phase = new Float32Array(list.length);
    const mesh = new THREE.InstancedMesh(geo, material(true, number), list.length);
    list.forEach((r, i) => { mesh.setMatrixAt(i, place(r, 0)); r.color.toArray(col, i * 3); phase[i] = r.phase; });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3)); geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.name = `Lobos ${kind}s`; mesh.frustumCulled = false; group.add(mesh); meshes.push(mesh); instances.set(kind, { mesh, list });
  }

  // Stars are one shared-topology batch. Every vertex is draped onto the *rendered*
  // floor, including triangle boundaries: an averaged normal alone leaves arms in air.
  // Updating only nearby stars a few times/second keeps the tiny crawl inexpensive.
  const stars = residents.filter(r => r.kind === 'batStar'), starGeo = new Geometry(), starRanges: { start: number; end: number }[] = [];
  for (const r of stars) {
    const start = starGeo.position.length / 3, ringCount = 4, sides = 40;
    const center = starGeo.vertex(new THREE.Vector3(0, 0.025, 0));
    for (let j = 1; j <= ringCount; j++) for (let i = 0; i < sides; i++) {
      const t = j / ringCount, a = i / sides * TAU, radius = (0.088 + 0.030 * Math.cos(a * 5)) * t;
      const k = starGeo.vertex(new THREE.Vector3(Math.cos(a) * radius, 0.002 + 0.022 * Math.pow(1 - t, 0.7), Math.sin(a) * radius));
      if (j === 1) starGeo.index.push(center, start + 1 + (i + 1) % sides, k);
      else { const n = start + 1 + (j - 1) * sides + (i + 1) % sides;
        starGeo.index.push(k - sides, n - sides, k, n - sides, n, k); }
    }
    starRanges.push({ start, end: starGeo.position.length / 3 });
  }
  const geo = starGeo.build(), colorsStar = new Float32Array(starGeo.position.length), phasesStar = new Float32Array(starGeo.position.length / 3);
  stars.forEach((r, i) => { for (let v = starRanges[i].start; v < starRanges[i].end; v++) { r.color.toArray(colorsStar, v * 3); phasesStar[v] = r.phase; } });
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colorsStar, 3)); geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phasesStar, 1));
  const starMesh = new THREE.Mesh(geo, material(false, 1)); starMesh.name = 'Lobos bat stars'; starMesh.frustumCulled = false; group.add(starMesh); meshes.push(starMesh);
  const attr = geo.getAttribute('position') as THREE.BufferAttribute; attr.setUsage(THREE.DynamicDrawUsage);
  const updateStar = (i: number, time: number) => {
    const r = stars[i], pose = sampleLobosBenthosPose(r, time, floorAt); r.pos.copy(pose.pos);
    const c = Math.cos(r.heading), s = Math.sin(r.heading), range = starRanges[i];
    for (let v = range.start; v < range.end; v++) {
      const lx = starGeo.local[v * 3] * r.scale, lz = starGeo.local[v * 3 + 2] * r.scale;
      const x = r.pos.x + c * lx + s * lz, z = r.pos.z - s * lx + c * lz;
      attr.setXYZ(v, x, floorAt(x, z) + starGeo.local[v * 3 + 1] * r.scale, z);
    }
    attr.addUpdateRange(range.start * 3, (range.end - range.start) * 3);
  };
  stars.forEach((_, i) => updateStar(i, 0)); attr.needsUpdate = true;
  let elapsed = 0, accumulator = 0;
  const update = (camera: THREE.Vector3, dt: number, time?: number) => {
    elapsed = Number.isFinite(time) ? Math.max(0, time!) : elapsed + Math.max(0, Number.isFinite(dt) ? dt : 0);
    accumulator += Math.max(0, Number.isFinite(dt) ? dt : 0);
    // Leaf riders need the same frame's support transform. Rock residents' spines and
    // tentacles animate on the GPU; their support never changes with camera distance.
    const snailInstances = instances.get('snail')!; let snailDirty = false;
    snailInstances.list.forEach((r, i) => { if (r.leaf && r.pos.distanceToSquared(camera) < 32 * 32) {
      snailInstances.mesh.setMatrixAt(i, place(r, elapsed)); snailDirty = true;
    } });
    if (snailDirty) snailInstances.mesh.instanceMatrix.needsUpdate = true;
    if (accumulator < 0.35) return; accumulator = 0;
    snailInstances.list.forEach((r, i) => { if (!r.leaf && r.home.distanceToSquared(camera) < 28 * 28) {
      snailInstances.mesh.setMatrixAt(i, place(r, elapsed)); snailDirty = true;
    } });
    if (snailDirty) snailInstances.mesh.instanceMatrix.needsUpdate = true;
    attr.clearUpdateRanges(); let changed = false;
    stars.forEach((r, i) => { if (r.home.distanceToSquared(camera) < 28 * 28) { updateStar(i, elapsed); changed = true; } });
    if (changed) attr.needsUpdate = true;
  };
  const stats = {
    urchins: residents.filter(r => r.kind === 'urchin').length, batStars: stars.length,
    snails: snails.length, leafSnails: snails.filter(r => r.leaf).length,
    anemones: residents.filter(r => r.kind === 'anemone').length, sponges: residents.filter(r => r.kind === 'sponge').length,
    patches: patches.length, meshes: meshes.length,
  };
  return { update, stats, residents, meshes, patches, anchors: residents.map(r => ({ kind: r.kind, pos: r.pos })), starRanges };
}
