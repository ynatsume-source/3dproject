// The island's forest, close to: trees, one by one. From afar the forest is the canopy surface draped with
// the aerial photograph (ocean/shore.ts); near the camera that surface steps aside and the forest is made
// of trees — the coastal broadleaf forest of a Yaeyama islet (テリハボク, オオハマボウ, ハスノハギリ and
// the like): a short, leaning, often forked trunk, a few heavy limbs, and a broad crown of leaf masses,
// darker and denser inside, catching the light at the top, swaying with the wind. Trees stand where the
// photograph shows canopy, as tall as the canopy is there; they are kept in 40 m cells, and only the
// cells near the camera are drawn.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from '../render/common';
import { hash, mulberry32, hyp } from '../core/math';

const CELL = 40;
const icoI = (detail = 1) => { const g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return mergeVertices(g); };

// the kinds of tree in the coastal forest of a Yaeyama islet, and how each grows
//   0 テリハボク (Calophyllum): one short trunk, a few stout limbs rising, a dense dark rounded crown
//   1 オオハマボウ (hau, Hibiscus tiliaceus): two or three trunks sprawling out from the foot, a low, broad, yellow-green crown
//   2 ハスノハギリ (Hernandia): a tall clean trunk, a high crown of big, bright leaves
//   3 ガジュマル (banyan): a thick fluted trunk, long level limbs with aerial roots hanging from them, a wide dark crown
// leaf masses are small and many, flattened, clustered at the twig ends with gaps between; their normals are
// bent outward from the crown's middle, so the crown is lit as one soft form rather than as a heap of balls
const KINDS = [
  { tint: [0.17, 0.3, 0.11], bark: [0.44, 0.41, 0.36], wide: 1.0 },
  { tint: [0.3, 0.4, 0.15], bark: [0.42, 0.36, 0.28], wide: 1.25 },
  { tint: [0.24, 0.4, 0.15], bark: [0.5, 0.48, 0.43], wide: 0.85 },
  { tint: [0.15, 0.27, 0.11], bark: [0.48, 0.46, 0.41], wide: 1.35 },
];

// one tree, unit height (ground at 0, crown top about 1); `young` makes a sapling — fewer twigs, a slimmer stem
// (`seed` fixes its shape, so the near and the far version — `lo`: coarser leaf masses and limbs — are the same tree)
export function treeGeo(kind: number, young: boolean, seed: number, lo = false) {
  const R = mulberry32(seed), rr = (a: number, b: number) => a + (b - a) * R();
  const P: number[] = [], N: number[] = [], C: number[] = [], W: number[] = [], L: number[] = [], I: number[] = [], M: number[] = [];
  const push = (p: THREE.Vector3, n: THREE.Vector3, c: number[], sway: number, leaf: number) => { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); M.push(n.x, n.y, n.z); C.push(c[0], c[1], c[2]); W.push(sway); L.push(leaf); return P.length / 3 - 1; };
  const K = KINDS[kind], bark = K.bark;
  const sw = (y: number) => 0.5 * Math.pow(Math.max(0, y), 1.6);
  // a tapered limb from a to b
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, S0 = 6) => {
    const S = lo ? Math.min(S0, 4) : S0;
    const ax = b.clone().sub(a).normalize(), u = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(ax).normalize() : new THREE.Vector3(1, 0, 0).cross(ax).normalize(), v = ax.clone().cross(u);
    const st = P.length / 3;
    for (let k = 0; k <= 1; k++) for (let j = 0; j < S; j++) {
      const an = j / S * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
      const c = k ? b : a; push(c.clone().addScaledVector(n, (k ? r1 : r0) * 0.55), n, bark, sw(c.y), 0);
    }
    for (let j = 0; j < S; j++) { const a0 = st + j, b0 = st + (j + 1) % S; I.push(a0, b0, a0 + S, b0, b0 + S, a0 + S); }
  };
  // a leaf mass: a small lumpy flattened ball, a shade of the tree's green
  const ico = icoI(lo ? 0 : 1); const ip = ico.attributes.position, ix = ico.index!.array;
  const masses: { c: THREE.Vector3; st: number; n: number }[] = [];
  const mass = (c: THREE.Vector3, r: number, flat = 0.6) => {
    const st = P.length / 3, seed = R() * 50, j = rr(0.85, 1.15), tint = [K.tint[0] * j * rr(0.9, 1.1), K.tint[1] * j, K.tint[2] * j * rr(0.85, 1.15)];
    for (let k = 0; k < ip.count; k++) {
      const n = new THREE.Vector3(ip.getX(k), ip.getY(k), ip.getZ(k)).normalize();
      const bump = 0.75 + 0.4 * Math.abs(Math.sin(n.x * 5.1 + seed) * Math.sin(n.y * 4.3 + seed * 1.3) * Math.sin(n.z * 4.7 + seed * 0.7));
      push(c.clone().add(new THREE.Vector3(n.x * r * bump, n.y * r * flat * bump, n.z * r * bump)), n, tint, sw(c.y) + 0.1, 1);
    }
    for (let k = 0; k < ix.length; k++) I.push(st + ix[k]);
    masses.push({ c, st, n: ip.count });
  };
  // a branch and what grows from it: forking `depth` more times, a cluster of leaf masses at each twig's end
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number, rise: number) => {
    const b = a.clone().addScaledVector(dir, len);
    limb(a, b, r0, r0 * 0.62, depth > 1 ? 6 : 4);
    if (depth <= 0) {
      const lr = rr(0.09, 0.13) * (kind === 2 ? 1.25 : 1) * (young ? 1.4 : 1);
      mass(b.clone().add(new THREE.Vector3(0, lr * 0.4, 0)), lr, kind === 1 ? 0.5 : 0.62);
      for (let k = 0, n = 1; k < n; k++) mass(b.clone().add(new THREE.Vector3(rr(-1, 1) * lr, rr(-0.3, 0.5) * lr, rr(-1, 1) * lr)), lr * rr(0.6, 0.85));
      return;
    }
    const n = depth > 1 && R() < 0.4 ? 3 : 2, a0 = R() * 6.28;
    for (let k = 0; k < n; k++) {
      const an = a0 + k / n * 6.28 + rr(-0.5, 0.5), side = new THREE.Vector3(Math.cos(an), 0, Math.sin(an));
      const d = dir.clone().multiplyScalar(0.6).addScaledVector(side, rr(0.45, 0.8)).addScaledVector(up, rise).normalize();
      branch(b, d, len * rr(0.55, 0.75), r0 * 0.62, depth - 1, rise);
    }
    if (depth === 1 && R() < 0.6) mass(a.clone().lerp(b, 0.6).add(new THREE.Vector3(rr(-0.05, 0.05), 0.05, rr(-0.05, 0.05))), rr(0.08, 0.11));   // (leaves along the limb too)
  };
  const D = young ? 1 : 2;
  const tilt = (x: number) => new THREE.Vector3((R() - 0.5) * x, 1, (R() - 0.5) * x).normalize();
  if (kind === 0) {
    const t = tilt(0.3), top = t.clone().multiplyScalar(rr(0.28, 0.38));
    limb(new THREE.Vector3(0, -0.05, 0), top, young ? 0.03 : 0.05, 0.036);
    const n = 3 + Math.floor(R() * 2);
    for (let k = 0; k < n; k++) { const an = k / n * 6.28 + rr(-0.4, 0.4); branch(top, new THREE.Vector3(Math.cos(an) * 0.7, 0.75, Math.sin(an) * 0.7).normalize(), rr(0.2, 0.28), 0.026, D, 0.5); }
    if (!young) branch(top, t, 0.22, 0.026, D, 0.7);
  } else if (kind === 1) {
    const n = young ? 1 : 2 + Math.floor(R() * 2), a0 = R() * 6.28;
    for (let k = 0; k < n; k++) {
      const an = a0 + k / n * 6.28 + rr(-0.4, 0.4), out = new THREE.Vector3(Math.cos(an), 0, Math.sin(an));
      const m = out.clone().multiplyScalar(rr(0.12, 0.22)).add(new THREE.Vector3(0, rr(0.22, 0.3), 0));
      const e2 = m.clone().add(out.clone().multiplyScalar(rr(0.04, 0.12))).add(new THREE.Vector3(0, rr(0.14, 0.2), 0));
      limb(new THREE.Vector3(0, -0.05, 0), m, 0.04, 0.03); limb(m, e2, 0.03, 0.024);   // (a sprawling, kinked stem)
      for (let j = 0; j < 2; j++) { const b2 = an + rr(-1.2, 1.2); branch(e2, new THREE.Vector3(Math.cos(b2), 0.55, Math.sin(b2)).normalize(), rr(0.18, 0.26), 0.02, D, 0.25); }
    }
  } else if (kind === 2) {
    const t = tilt(0.15), top = t.clone().multiplyScalar(rr(0.52, 0.6));
    limb(new THREE.Vector3(0, -0.05, 0), top, young ? 0.028 : 0.042, 0.028);
    const n = young ? 2 : 3;
    for (let k = 0; k < n; k++) { const an = k / n * 6.28 + rr(-0.4, 0.4); branch(top, new THREE.Vector3(Math.cos(an) * 0.6, 0.8, Math.sin(an) * 0.6).normalize(), rr(0.16, 0.22), 0.02, D, 0.6); }
  } else {
    const t = tilt(0.12), top = t.clone().multiplyScalar(rr(0.3, 0.36));
    // the fluted trunk: a bundle of stems fused together, buttressed at the foot
    for (let k = 0; k < (young ? 1 : 4); k++) { const an = k * 1.57 + R(), o = new THREE.Vector3(Math.cos(an), 0, Math.sin(an)); limb(o.clone().multiplyScalar(0.07).setY(-0.05), top.clone().addScaledVector(o, 0.02), 0.045, 0.03); }
    const n = young ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const an = k / n * 6.28 + rr(-0.3, 0.3), out = new THREE.Vector3(Math.cos(an), 0, Math.sin(an));
      const e2 = top.clone().addScaledVector(out, rr(0.28, 0.38)).add(new THREE.Vector3(0, rr(0.08, 0.16), 0));
      limb(top, e2, 0.03, 0.02);
      if (!young && k % 2 === 0) for (let j = 0; j < 2; j++) { const r0 = top.clone().lerp(e2, rr(0.5, 1)); limb(r0, new THREE.Vector3(r0.x + rr(-0.02, 0.02), -0.05, r0.z + rr(-0.02, 0.02)), 0.004, 0.006, 3); }   // (aerial roots)
      branch(e2, out.clone().add(new THREE.Vector3(0, 0.9, 0)).normalize(), rr(0.15, 0.2), 0.018, D, 0.45);
    }
  }
  // normals of the leaves bent outward from the crown's middle
  const cc = new THREE.Vector3(); let nn = 0;
  for (const m of masses) { cc.add(m.c); nn++; } cc.divideScalar(Math.max(1, nn)); cc.y -= 0.05;
  const v3 = new THREE.Vector3(), o3 = new THREE.Vector3();
  for (const m of masses) for (let k = m.st; k < m.st + m.n; k++) {
    v3.set(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]); o3.set(P[k * 3] - cc.x, (P[k * 3 + 1] - cc.y) * 1.5, P[k * 3 + 2] - cc.z).normalize();
    v3.lerp(o3, 0.65).normalize(); N[k * 3] = v3.x; N[k * 3 + 1] = v3.y; N[k * 3 + 2] = v3.z;
  }
  // scaled so the crown top is at 1
  let ymax = 0; for (let k = 1; k < P.length; k += 3) ymax = Math.max(ymax, P[k]);
  for (let k = 0; k < P.length; k++) P[k] /= ymax;
  // how much open sky each part sees: the top of the crown all of it, the trunk and the inside of the crown little
  // (saplings live in the shade of the canopy)
  const Sh: number[] = [];
  for (let k = 0; k < L.length; k++) { const y = P[k * 3 + 1]; Sh.push(young ? 0.55 : L[k] ? 0.55 + 0.45 * smooth(0.4, 0.95, y) : 0.55 + 0.35 * smooth(0.45, 1.0, y)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 1));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(L, 1));
  g.setAttribute('aSh', new THREE.Float32BufferAttribute(Sh, 1));
  g.setAttribute('aMn', new THREE.Float32BufferAttribute(M, 3));
  g.setIndex(I);
  return g;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the forest floor's own growth: a low clump of ferns and seedlings (a few leaf masses close to the ground)
function shrubGeo() {
  const R = mulberry32(77), rr = (a: number, b: number) => a + (b - a) * R();
  const P: number[] = [], N: number[] = [], C: number[] = [], W: number[] = [], L: number[] = [], I: number[] = [];
  const ico = icoI(); const ip = ico.attributes.position, ix = ico.index!.array;
  for (let m = 0; m < 5; m++) {
    const st = P.length / 3, cx = rr(-0.5, 0.5), cz = rr(-0.5, 0.5), r = rr(0.3, 0.5), j = rr(0.8, 1.2), seed = R() * 40;
    for (let k = 0; k < ip.count; k++) {
      const n = new THREE.Vector3(ip.getX(k), ip.getY(k), ip.getZ(k)).normalize();
      const bump = 0.7 + 0.45 * Math.abs(Math.sin(n.x * 4.1 + seed) * Math.sin(n.z * 3.7 + seed));
      P.push(cx + n.x * r * bump, Math.max(0, r * 0.6 + n.y * r * 0.7 * bump), cz + n.z * r * bump);
      const o = new THREE.Vector3(cx * 0.5 + n.x, n.y + 0.6, cz * 0.5 + n.z).normalize(); N.push(o.x, o.y, o.z);
      C.push(0.19 * j, 0.33 * j, 0.12 * j); W.push(0.15); L.push(1);
    }
    for (let k = 0; k < ix.length; k++) I.push(st + ix[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 1));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(L, 1));
  g.setAttribute('aSh', new THREE.Float32BufferAttribute(L.map(() => 0.5), 1));
  g.setAttribute('aMn', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

const rr2 = (x: number, z: number, a: number, b: number) => a + (b - a) * hash(x * 1.37 + 11, z * 0.71 - 5);

export function buildForest(AIRLIT: string, group: THREE.Group, f: (x: number, z: number) => number, can: (x: number, z: number) => number, top: (x: number, z: number) => { y: number; c: number }, E: number) {
  const treeMat = mat(
    `attribute vec3 aTint; attribute float aSway; attribute float aLeaf; attribute float aSh; attribute vec3 aMn; varying vec3 vWp; varying vec3 vN; varying vec3 vMn; varying vec3 vCol; varying float vLeaf; varying vec3 vL; varying float vSh;
     void main(){
       vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
       float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
       // the crowns move in the wind: a slow lean and a quicker flutter of the leaf masses, harder as it blows, and bent
       // away from it (more so in the gusts)
       float wk = clamp(uWind.z / 10.0, 0.0, 1.8);
       w.xz += (vec2(sin(uTime * 0.9 + ph), cos(uTime * 0.7 + ph * 1.7)) * 0.12 + vec2(sin(uTime * 2.7 + ph * 3.0 + position.y * 9.0), cos(uTime * 2.3 + position.x * 7.0)) * 0.04 * aLeaf * (1.0 + wk)) * aSway * (0.6 + 0.6 * wk)
             + uWind.xy * aSway * wk * wk * 0.22 * (0.75 + 0.25 * sin(uTime * 1.3 + ph));
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       vCol = aTint * (0.85 + 0.3 * fract(sin(ph * 12.9) * 43758.5)); vLeaf = aLeaf; vL = position; vSh = aSh; vMn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * aMn);
       gl_Position = projectionMatrix * viewMatrix * w; }`,
    `${AIRLIT}
     varying vec3 vWp; varying vec3 vN; varying vec3 vCol; varying float vLeaf; varying vec3 vL; varying float vSh; varying vec3 vMn;
     void main(){
       if (cutSight(vWp)) discard;   // (the leaves between the camera and a resident being watched)
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (!gl_FrontFacing) n = -n;
       vec3 col;
       // leaves: clumps of light and shade at the scale of twigs, a ragged edge where the mass turns away — the edge
       // soft over a pixel and drawn as coverage when the scene is multisampled (a hard cut there crawled and
       // twinkled as the view moved); cut at its middle when it is not
       float l1 = vn2(vWp.xz * 3.1 + vWp.y * 2.3), l2 = vn2(vWp.xz * 9.0 - vWp.y * 6.0 + 5.0);
       float edge = abs(dot(normalize(vMn), V)) - (0.32 * l2 + 0.06), ew = max(fwidth(edge), 1e-4);
       float cover = mix(1.0, smoothstep(-ew, ew, edge), step(0.5, vLeaf));
       if (cover < mix(0.5, 0.02, uA2C)) discard;
       if (vLeaf > 0.5) {
         n = normalize(n + vec3(l1 - 0.5, (l2 - 0.5) * 0.5, vn2(vWp.zx * 3.3) - 0.5) * 1.1);
         vec3 alb = vCol * (0.75 + 0.7 * l2) * mix(0.62, 1.25, smoothstep(-0.2, 0.9, vN.y));   // (sunlit tops, shaded undersides)
         alb = mix(alb, vec3(0.44, 0.48, 0.22), smoothstep(0.78, 0.95, l1) * 0.4);            // (new leaves, paler)
         col = airLitF(alb, n, vWp, 0.8, 1.0);   // (the open sky round the crown lights its underside too: a soft shade)
       } else {
         // bark: grey-brown, ridged, mossy on the shaded side
         float ridge = vn2(vec2(atan(vL.x, vL.z) * 3.0, vL.y * 40.0));
         vec3 alb = vCol * (0.75 + 0.4 * ridge);
         alb = mix(alb, vec3(0.25, 0.3, 0.15), smoothstep(0.2, -0.6, dot(n, uAirSun)) * 0.35);
         col = airLitF(alb, n, vWp, 0.0, 0.6) + alb * vec3(0.16, 0.18, 0.13) * (1.0 - uNight * 0.8);   // (light thrown back from the leaves and the floor)
       }
       col *= mix(1.0, vSh + (1.0 - vSh) * 0.9 * dapple(vWp, vWp.y + 6.0), 0.6);   // (shade inside the forest, flecks of sun — softened: it is lit through, not dark)
       gl_FragColor = vec4(fogIt(col, vWp), mix(1.0, cover, uA2C));
     }`, { opts: { side: THREE.DoubleSide, alphaToCoverage: true } });
  // geometries: two of each kind of tree, a sapling of each, and the clump on the forest floor
  // (each twice: as drawn near the camera, and coarser for the cells further off)
  const geos: THREE.BufferGeometry[] = [], geosLo: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) for (const sd of [11 + k * 7, 101 + k * 13]) { geos.push(treeGeo(k, false, sd)); geosLo.push(treeGeo(k, false, sd, true)); }
  const YOUNG = geos.length; for (let k = 0; k < 4; k++) { geos.push(treeGeo(k, true, 301 + k)); geosLo.push(treeGeo(k, true, 301 + k, true)); }
  const SHRUB = geos.length; geos.push(shrubGeo()); geosLo.push(geos[SHRUB]);
  const G = geos.length;
  // which kind grows where it does: mostly テリハボク and オオハマボウ, ハスノハギリ in between, a banyan here and there
  const kindAt = (x: number, z: number) => { const u = hash(x * 5.3, z * 4.1), patch = hash(Math.floor(x / 23), Math.floor(z / 23)); const w = [0.42 + 0.3 * (patch - 0.5), 0.3 - 0.3 * (patch - 0.5), 0.22, 0.06]; let a = 0; for (let k = 0; k < 4; k++) { a += w[k]; if (u < a) return k; } return 0; };
  // where the trees stand: a jittered grid over the canopy, about as tall as the canopy there (some reaching
  // above it, some under it) — worked out for a 40 m cell the first time the camera comes near it; beneath
  // them, saplings and clumps in the gaps
  type Tree = { x: number; z: number; y: number; h: number; g: number; m: Float32Array };
  const S = 3.6;
  const cells = new Map<string, { cx: number; cz: number; trees: Tree[]; under: Tree[] }>();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const place = (x: number, y: number, z: number, h: number, w: number, g: number): Tree => {
    q.setFromEuler(e.set((hash(z, x) - 0.5) * 0.08, hash(x * 3.1, z * 2.7) * 6.28, (hash(x + 1, z) - 0.5) * 0.08));
    const m = new Float32Array(16); m4.compose(p3.set(x, y, z), q, s3.set(w, h, w)).toArray(m);
    return { x, z, y, h, g, m };
  };
  const cellAt = (ci: number, cj: number) => {
    const k = ci + ',' + cj; let c = cells.get(k);
    if (c) return c;
    const trees: Tree[] = [], under: Tree[] = [];
    for (let gz = cj * CELL; gz < (cj + 1) * CELL; gz += S) for (let gx = ci * CELL; gx < (ci + 1) * CELL; gx += S) {
      const x = gx + hash(gx * 0.7, gz * 1.3) * S, z = gz + hash(gx * 1.9 + 4, gz * 0.3 - 2) * S;
      if (Math.abs(x) > E || Math.abs(z) > E) continue;
      const cn = can(x, z); if (cn < 0.45) continue;
      const y = f(x, z); if (y < 0.3) continue;
      const kd = kindAt(x, z), u = hash(x * 2.3, z * 7.7);
      if (u < 0.12) continue;                                                     // (a gap: light comes down to the floor)
      const h = Math.max(2.2, top(x, z).y - y) * (u < 0.3 ? rr2(x, z, 0.5, 0.75) : rr2(x, z, 0.85, 1.15));   // (a few under the canopy, the rest of it)
      trees.push(place(x, y, z, h, h * KINDS[kd].wide * rr2(z, x, 0.75, 1.0), kd * 2 + (hash(x * 9.1, z) < 0.5 ? 0 : 1)));
    }
    // the understorey: saplings and clumps on a finer grid, thinner where the canopy is thin
    const S2 = 2.2;
    for (let gz = cj * CELL; gz < (cj + 1) * CELL; gz += S2) for (let gx = ci * CELL; gx < (ci + 1) * CELL; gx += S2) {
      const x = gx + hash(gx * 1.7, gz * 0.3 + 9) * S2, z = gz + hash(gx * 0.9 - 3, gz * 1.3) * S2;
      if (Math.abs(x) > E || Math.abs(z) > E) continue;
      const cn = can(x, z); if (cn < 0.55) continue;
      const y = f(x, z); if (y < 0.4) continue;
      const u = hash(x * 4.7, z * 3.3);
      if (u < 0.16) { const h = rr2(x, z, 0.9, 3.2); under.push(place(x, y, z, h, h * rr2(z, x, 0.55, 0.8), YOUNG + kindAt(x + 7, z))); }
      else if (u < 0.5) { const h = rr2(x, z, 0.35, 0.8); under.push(place(x, y, z, h, h * rr2(z, x, 1.2, 2.2), SHRUB)); }
    }
    c = { cx: (ci + 0.5) * CELL, cz: (cj + 0.5) * CELL, trees, under };
    cells.set(k, c);
    return c;
  };
  // trees the residents have felled (by where they stood: the cells are worked out the same way every time), and the
  // ground they cleared round them — the saplings and clumps there gone too (robots/residents.ts: the island's own clearing)
  const tkey = (t: { x: number; z: number }) => t.x.toFixed(2) + ',' + t.z.toFixed(2);
  const felled = new Set<string>(), clears: { x: number; z: number; r: number }[] = [];
  const cleared = (x: number, z: number) => clears.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r);
  const standing = (t: Tree) => !felled.has(tkey(t));
  // one instanced mesh per geometry for the whole forest, refilled from the cells in range when that set changes
  const meshes: (THREE.InstancedMesh | null)[] = new Array(G * 2).fill(null);
  const fill = (on: { trees: Tree[]; under: Tree[] }[], hi: boolean[]) => {
    const by: Tree[][] = meshes.map(() => []);
    on.forEach((c, i) => { const o = hi[i] ? 0 : G; for (const t of c.trees) if (standing(t)) by[t.g + o].push(t); for (const t of c.under) if (!clears.length || !cleared(t.x, t.z)) by[t.g + o].push(t); });
    let n = 0;
    by.forEach((list, g) => {
      let m = meshes[g];
      if (!list.length && !m) return;
      if (!m || m.instanceMatrix.count < list.length) {
        if (m) { group.remove(m); m.dispose(); }
        m = new THREE.InstancedMesh(g < G ? geos[g] : geosLo[g - G], treeMat, Math.max(16, Math.ceil(list.length * 1.4)));
        m.frustumCulled = false; group.add(m); meshes[g] = m;
      }
      const arr = m.instanceMatrix.array as Float32Array;
      list.forEach((t, i) => arr.set(t.m, i * 16));
      m.count = list.length; m.instanceMatrix.needsUpdate = true; n += list.length;
    });
    count = n;
  };
  let count = 0, key = '';
  let near = 85;
  return {
    get count() { return count; },
    /** A kind's grown tree as the forest draws it (unit height; to be scaled by its height, and across by `wide` × it):
     *  for a tree the residents fell, drawn as it comes down (robots/residents.ts). The geometry is the forest's own:
     *  not to be disposed of. */
    look(kind: number) { return { geo: geos[Math.max(0, Math.min(3, kind)) * 2], mat: treeMat, wide: KINDS[Math.max(0, Math.min(3, kind))].wide }; },
    get near() { return near; },
    // which cells to draw: those reaching within `near` of the camera (the canopy surface fills in beyond)
    update(cam: THREE.Vector3, r: number) {
      near = r;
      const R0 = r + CELL * 0.75, i0 = Math.floor((cam.x - R0) / CELL), i1 = Math.floor((cam.x + R0) / CELL), j0 = Math.floor((cam.z - R0) / CELL), j1 = Math.floor((cam.z + R0) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (hyp((i + 0.5) * CELL - cam.x, (j + 0.5) * CELL - cam.z) < R0) cellAt(i, j);
      const on: { trees: Tree[]; under: Tree[] }[] = [], hi: boolean[] = []; let k2 = '';
      for (const [k, c] of cells) { const d = hyp(c.cx - cam.x, c.cz - cam.z), LOD = r * 0.45; if (d < R0) { on.push(c); hi.push(d < LOD); k2 += k + (d < LOD ? 'h;' : 'l;'); } }
      if (k2 !== key) { key = k2; fill(on, hi); }
    },
    // is there a trunk within r of (x, z)? (for those planning a way on foot: robots/residents.ts)
    trunkNear(x: number, z: number, r: number) {
      if (Math.abs(x) > E || Math.abs(z) > E) return false;
      const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const t of cellAt(i, j).trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (r + 0.55) ** 2 && standing(t)) return true;
      return false;
    },
    // the trunks within r of (x, z), each as a solid (robots/solids.ts): the same trunks push() keeps a point out of
    trunks(x: number, z: number, r: number, f: (t: { x: number; z: number; y: number; h: number }) => void) {
      if (Math.abs(x) > E + r || Math.abs(z) > E + r) return;
      const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const t of cellAt(i, j).trees) if (t.g < YOUNG && (t.x - x) ** 2 + (t.z - z) ** 2 < (r + 0.55) ** 2 && standing(t)) f(t);
    },
    // the grown trees standing within r of (x, z), for a resident to fell: where, how tall, which kind
    standingNear(x: number, z: number, r: number) {
      const out: { x: number; z: number; y: number; h: number; kind: number }[] = [];
      this.trunks(x, z, r, (t) => { const tt = t as Tree; if ((tt.x - x) ** 2 + (tt.z - z) ** 2 < r * r) out.push({ x: tt.x, z: tt.z, y: tt.y, h: tt.h, kind: tt.g >> 1 }); });
      return out;
    },
    /** Fell the grown tree at (x, z) (within half a metre); it and the undergrowth round it are gone. null: none there. */
    fell(x: number, z: number) {
      let hit: Tree | null = null;
      this.trunks(x, z, 0.5, (t) => { const tt = t as Tree; if (!hit && (tt.x - x) ** 2 + (tt.z - z) ** 2 < 0.25) hit = tt; });
      if (!hit) return null;
      const t = hit as Tree;
      felled.add(tkey(t)); clears.push({ x: t.x, z: t.z, r: Math.max(1.6, t.h * 0.22) }); key = '';   // (drawn again without it)
      return { x: t.x, z: t.z, y: t.y, h: t.h, kind: t.g >> 1, clear: clears[clears.length - 1] };
    },
    cleared,
    get clearings() { return clears; },
    // flying in among them: push a point out of any trunk (or the dense heart of a crown) it is inside
    push(p: THREE.Vector3) {
      // (the cell's trees worked out if they are not yet: those who walk here may be far from the camera,
      // and what they bump into must not depend on where it is looking)
      if (Math.abs(p.x) > E || Math.abs(p.z) > E) return;
      const c = cellAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      for (const t of c.trees) {
        if (!standing(t)) continue;
        const dx = p.x - t.x, dz = p.z - t.z, d = hyp(dx, dz), up = p.y - t.y;
        if (up < -0.5 || up > t.h || t.g >= YOUNG) continue;
        const rr0 = up < t.h * 0.4 ? 0.55 : t.h * 0.12;   // (the trunk; up in the crown, its thick middle)
        if (d < rr0) { const k = (rr0 - d) / Math.max(d, 1e-3); p.x += dx * k; p.z += dz * k; }
      }
    },
  };
}
