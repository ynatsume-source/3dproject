// A wild harbor seal, in metres (+z is the nose). No resident model or saved identity is reused.
// The spindle-shaped torso and neck are continuous; true seals have no external ear flaps,
// short steering foreflippers, and two webbed hindfeet rather than a cetacean's tail fluke.
import * as THREE from 'three';
import { mat } from '../render/common';

interface MeshData { p: number[]; n: number[]; part: number[] }
function add(a: MeshData, geometry: THREE.BufferGeometry, part = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    a.p.push(p.getX(i), p.getY(i), p.getZ(i));
    a.n.push(n.getX(i), n.getY(i), n.getZ(i)); a.part.push(part);
  }
  if (g !== geometry) g.dispose(); geometry.dispose();
}
function finish(a: MeshData) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(a.part, 1));
  g.computeBoundingSphere(); return g;
}
const empty = (): MeshData => ({ p: [], n: [], part: [] });
function ellipsoid(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  return new THREE.SphereGeometry(1, 18, 12).scale(sx, sy, sz).translate(x, y, z);
}
function tube(points: THREE.Vector3[], radius: number) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, radius, 4, false);
}
function sealBody() {
  const a = empty();
  // z, half-width, half-height, vertical centre. Catmull-Rom preserves the tucked neck and
  // sloping forehead without visible intersecting shoulder/head spheres.
  const profile = new THREE.CatmullRomCurve3([
    [-0.87, 0.018, -0.015], [-0.77, 0.09, -0.01], [-0.59, 0.185, -0.012],
    [-0.35, 0.29, -0.002], [-0.08, 0.305, 0], [0.17, 0.27, 0.018],
    [0.35, 0.205, 0.028], [0.47, 0.16, 0.063], [0.60, 0.171, 0.086],
    [0.72, 0.148, 0.084], [0.82, 0.105, 0.063], [0.885, 0.051, 0.055],
    [0.904, 0.004, 0.055],
  ].map(([z, r, h]) => new THREE.Vector3(z, r, h)));
  const p: number[] = [], idx: number[] = []; const rings = 84, sides = 40;
  for (let j = 0; j <= rings; j++) {
    const q = profile.getPoint(j / rings);
    for (let k = 0; k <= sides; k++) {
      const th = k / sides * Math.PI * 2;
      const ry = q.y * (q.x > 0.42 ? 0.87 : 0.91);
      p.push(Math.cos(th) * q.y, q.z + Math.sin(th) * ry, q.x);
    }
  }
  for (let j = 0; j < rings; j++) for (let k = 0; k < sides; k++) {
    const i = j * (sides + 1) + k; idx.push(i, i + 1, i + sides + 1, i + 1, i + sides + 2, i + sides + 1);
  }
  const first = profile.getPoint(0), last = profile.getPoint(1), startCap = p.length / 3;
  p.push(0, first.z, first.x, 0, last.z, last.x);
  for (let k = 0; k < sides; k++) {
    idx.push(startCap, k + 1, k);
    const i = rings * (sides + 1) + k; idx.push(startCap + 1, i, i + 1);
  }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); body.setIndex(idx); body.computeVertexNormals(); add(a, body);
  for (const side of [-1, 1]) {
    // Separate muzzle pads, small side-set eyes, and a dark ear opening, never external pinnae.
    add(a, ellipsoid(side * 0.052, 0.025, 0.842, 0.067, 0.048, 0.082), 4);
    add(a, ellipsoid(side * 0.127, 0.140, 0.727, 0.017, 0.019, 0.023), 1);
    add(a, ellipsoid(side * 0.162, 0.100, 0.573, 0.006, 0.012, 0.008), 3);
    // Upper lids are skin, breaking up the round eye silhouette.
    const lid = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.43);
    lid.scale(0.020, 0.008, 0.026).translate(side * 0.127, 0.153, 0.727); add(a, lid);
    for (let w = 0; w < 9; w++) {
      const y = 0.014 + (w % 3) * 0.016, z = 0.862 - Math.floor(w / 3) * 0.024;
      const length = 0.10 + 0.017 * (w % 4);
      add(a, tube([
        new THREE.Vector3(side * 0.080, y, z),
        new THREE.Vector3(side * (0.105 + length * 0.4), y - 0.01, z + 0.024),
        new THREE.Vector3(side * (0.105 + length), y - 0.025 - 0.005 * w, z + 0.002 - 0.011 * w),
      ], 0.0011), 2);
    }
    // The mouth is a shallow, downturned seam below the pads, not a permanent smile.
    add(a, tube([new THREE.Vector3(0, -0.003, 0.904), new THREE.Vector3(side * 0.04, -0.006, 0.899), new THREE.Vector3(side * 0.09, -0.012, 0.844)], 0.002), 3);
  }
  add(a, ellipsoid(0, 0.087, 0.891, 0.046, 0.025, 0.024), 3);
  return finish(a);
}

// A closed, softly ribbed webbed foot, with five short toe lobes along its outer edge.
// Local z runs aft; the small forefoot is tapered and drawn back beside the body.
function flipper(hind: boolean, side: number) {
  const a = empty(), p: number[] = [], ix: number[] = []; const rows = 20, cols = 24;
  for (let j = 0; j <= rows; j++) for (let k = 0; k <= cols; k++) {
    const u = j / rows, th = k / cols * Math.PI * 2;
    const span = hind ? 0.38 : 0.36;
    const width = hind ? 0.034 + Math.sin(Math.PI * u * 0.80) * 0.092 : 0.036 + Math.sin(Math.PI * u) * 0.060;
    const tip = Math.pow(Math.sin(Math.PI * Math.min(0.997, u)), 0.27);
    const fin = Math.max(0.025, tip);
    const toes = 0.013 * Math.pow(u, 6) * Math.cos(Math.cos(th) * Math.PI * 5);
    const x = side * ((hind ? 0.16 : 0.20) * u + Math.cos(th) * width * fin);
    const y = Math.sin(th) * (hind ? 0.014 : 0.018) * fin + (hind ? 0.02 : -0.035) * u;
    const z = -span * u + toes;
    p.push(x, y, z);
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
    const i = j * (cols + 1) + k;
    if (side > 0) ix.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
    else ix.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
  }
  const cap = p.length / 3;
  p.push(0, 0, 0, side * (hind ? 0.16 : 0.20), hind ? 0.02 : -0.035, -(hind ? 0.38 : 0.36));
  for (let k = 0; k < cols; k++) {
    const i = rows * (cols + 1) + k;
    if (side > 0) ix.push(cap, k, k + 1, cap + 1, i + 1, i);
    else ix.push(cap, k + 1, k, cap + 1, i, i + 1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setIndex(ix); geo.computeVertexNormals(); add(a, geo);
  return finish(a);
}

const smoothStep01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function sealMaterial() {
  return mat(`attribute float aPart; uniform float uSealTime; uniform float uSealStroke; uniform float uSealBend;
    varying vec3 vWp; varying vec3 vN; varying vec3 vLocal; varying float vPart;
    void main(){
      vec3 p = position; vec3 n = normal; vLocal = p; vPart = aPart;
      float g = max(0.0, -p.z - 0.12); float phase = uSealTime + p.z * 2.6;
      // the hind third sweeps side to side with the feet, the wave running back down the body
      p.x += uSealBend * uSealStroke * 0.36 * g * g * sin(phase);
      float dx = uSealBend * uSealStroke * 0.36 * (-2.0 * g * sin(phase) + 2.6 * g * g * cos(phase));
      n.z -= dx * n.x;
      vec4 w = modelMatrix * vec4(p, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`, `varying vec3 vWp; varying vec3 vN; varying vec3 vLocal; varying float vPart; uniform float uSealFin;
    float sealHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float sealNoise(vec3 p) {
      vec3 i = floor(p), f = fract(p), w = f * f * (3.0 - 2.0 * f);
      float lo = mix(mix(sealHash(i), sealHash(i + vec3(1,0,0)), w.x),
                     mix(sealHash(i + vec3(0,1,0)), sealHash(i + vec3(1,1,0)), w.x), w.y);
      float hi = mix(mix(sealHash(i + vec3(0,0,1)), sealHash(i + vec3(1,0,1)), w.x),
                     mix(sealHash(i + vec3(0,1,1)), sealHash(i + vec3(1,1,1)), w.x), w.y);
      return mix(lo, hi, w.z);
    }
    void main(){
      vec3 n = normalize(vN), V = normalize(uCamPos - vWp);
      vec3 p = vLocal;
      float belly = (1.0 - smoothstep(-0.12, 0.15, p.y)) * (1.0 - uSealFin);
      vec3 alb = mix(vec3(0.31, 0.33, 0.32), vec3(0.58, 0.57, 0.52), belly * 0.86);
      alb *= mix(1.0, 0.85, uSealFin);
      // Soft irregular spots in animal-local 3D: an angular UV would leave a horizontal seam
      // along one flank. Their grain is much finer than the broad dorsal/ventral countershade.
      vec3 uv = p * 49.0;
      float blotch = sealNoise(uv + vec3(sealNoise(uv * 0.3 + 7.0)) * 1.1);
      float spots = smoothstep(0.56, 0.73, blotch);
      alb = mix(alb, vec3(0.12, 0.145, 0.145), spots * 0.58);
      alb *= 0.91 + 0.15 * sealNoise(p * 5.0 + 11.0);
      alb *= 0.96 + 0.08 * sealNoise(p * 180.0);
      float gloss = 0.18;
      if (vPart > 0.5 && vPart < 1.5) { alb = vec3(0.018, 0.016, 0.013); gloss = 0.9; }
      if (vPart > 1.5 && vPart < 2.5) { alb = vec3(0.65, 0.64, 0.55); gloss = 0.08; }
      if (vPart > 2.5 && vPart < 3.5) { alb = vec3(0.10, 0.105, 0.10); gloss = 0.15; }
      if (vPart > 3.5) alb = mix(alb, vec3(0.36, 0.365, 0.34), 0.45);
      vec3 c = shade(alb, vWp, n, 0.28);
      vec3 H = normalize(V + SUN); float s = pow(max(dot(n, H), 0.0), 70.0);
      c += fogIt(absorb(vec3(s * gloss * uSunI * 0.3), vWp.y), vWp) - fogIt(vec3(0.0), vWp);
      gl_FragColor = vec4(c, 1.0);
    }`, { uniforms: { uSealTime: { value: 0 }, uSealStroke: { value: 1 }, uSealBend: { value: 1 }, uSealFin: { value: 0 } } });
}

export interface HarborSealModel {
  group: THREE.Group;
  length: number;
  pose(time: number, stroke: number, breathing: number): number;   // (returns how far ahead of its even pace the strokes have carried it, m)
}

export function makeHarborSeal(): HarborSealModel {
  const group = new THREE.Group(); group.name = 'Wild harbor seal'; group.scale.setScalar(0.85);
  const skin = sealMaterial(), fins = sealMaterial(); fins.uniforms.uSealBend.value = 0; fins.uniforms.uSealFin.value = 1;
  const body = new THREE.Mesh(sealBody(), skin); body.name = 'Harbor seal continuous body'; group.add(body);
  const fore: THREE.Mesh[] = [], hind: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(flipper(false, side), fins); f.position.set(side * 0.20, -0.10, 0.19); f.name = 'Harbor seal foreflipper'; group.add(f); fore.push(f);
    const h = new THREE.Mesh(flipper(true, side), fins); h.position.set(side * 0.045, -0.01, -0.81); h.name = 'Harbor seal webbed hindfoot'; group.add(h); hind.push(h);
  }
  const noses: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const a = empty(); add(a, ellipsoid(0, 0, 0, 0.007, 0.009, 0.004), 1);
    const nose = new THREE.Mesh(finish(a), fins); nose.position.set(side * 0.016, 0.098, 0.91); nose.rotation.z = side * 0.30; group.add(nose); noses.push(nose);
  }
  // A harbor seal swims with its hindfeet: sculling side to side, the two feet in turn spread wide to push
  // and folded to come back, the hind third of the body swinging with them — a few strokes, about one a
  // second, then a glide with the feet held together and the foreflippers out a little to steer.
  let ph = 0, last = -1;
  return { group, length: 1.8,
    pose(time, stroke, breathing) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, time - last)); last = time;
      const cyc = (time / 5.5) % 1, on = smoothStep01(0, 0.08, cyc) * (1 - smoothStep01(0.55, 0.7, cyc));   // (3-4 s of strokes, 2 s of glide)
      const amp = stroke * on;
      ph += dt * Math.PI * 2 * 1.05 * (0.25 + 0.75 * on);
      skin.uniforms.uSealTime.value = ph; skin.uniforms.uSealStroke.value = amp;
      const sway = 0.36 * 0.69 * 0.69 * Math.sin(ph - 0.81 * 2.6) * amp;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1, beat = Math.sin(ph - 1.7);
        hind[i].position.x = side * 0.045 + sway;
        hind[i].rotation.y = beat * 0.78 * amp + side * 0.035;
        // (the one pushing spreads its webbed toes; gliding, both are folded together behind)
        hind[i].scale.x = 0.62 + 0.38 * Math.max(0, side * beat) * amp + 0.1 * (1 - amp);
        hind[i].rotation.z = side * (0.08 + 0.06 * amp * Math.cos(ph));
        // Forefeet steer and tuck; they do not beat like a sea lion's propulsive foreflippers.
        fore[i].rotation.y = side * (0.10 + 0.035 * Math.sin(time * 0.7 + i));
        fore[i].rotation.z = side * (-0.16 + 0.26 * (1 - on) + breathing * 0.08);
        noses[i].scale.x = 0.24 + breathing * (0.32 + 0.44 * Math.max(0, Math.sin(time * 1.3)));
      }
      // the front swings a little the other way to each stroke, and the strokes carry it on in surges
      body.rotation.y = -0.035 * Math.sin(ph - 0.4) * amp;
      return 0.22 * Math.sin(cyc * Math.PI * 2 - 0.6) * stroke;
    },
  };
}
