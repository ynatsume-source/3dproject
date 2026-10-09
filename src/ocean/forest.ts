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
//   0 テリハボク (Calophyllum): one short trunk, a few stout limbs rising, a dense, deep green, rounded crown
//   1 オオハマボウ (hau, Hibiscus tiliaceus): two or three trunks sprawling out from the foot, a low, broad, yellow-green crown
//   2 ハスノハギリ (Hernandia): a tall clean trunk, a high crown of big, bright leaves
//   3 ガジュマル (banyan): a thick fluted trunk, long level limbs with aerial roots hanging from them, a wide dark crown
// Drawn soft and rounded, a little like a picture book's trees but still these trees (owner's request 2026-10-09,
// docs/proposals/nature-look-2026-10-09): the crown is a few big smooth puffs of foliage, flatter beneath, their
// normals bent outward from the crown's middle so the whole crown is lit as one soft form; two greens, bright and
// warm on top, deep beneath; a stout trunk flaring at the foot and a few smooth limbs running up into the puffs
// (no thin twigs: inside the forest they read as a bundle of lines).
const KINDS = [
  { top: [0.36, 0.54, 0.16], deep: [0.07, 0.18, 0.07], bark: [0.44, 0.38, 0.31], wide: 1.0, flat: 0.78 },
  { top: [0.6, 0.68, 0.24], deep: [0.22, 0.33, 0.1], bark: [0.42, 0.35, 0.27], wide: 1.25, flat: 0.6 },
  { top: [0.48, 0.64, 0.22], deep: [0.13, 0.28, 0.09], bark: [0.52, 0.48, 0.42], wide: 0.85, flat: 0.78 },
  { top: [0.3, 0.48, 0.15], deep: [0.05, 0.15, 0.06], bark: [0.48, 0.45, 0.39], wide: 1.35, flat: 0.68 },
];

// one tree, unit height (ground at 0, crown top about 1); `young` makes a sapling — a slim stem and a small crown
// (`seed` fixes its shape, so the near and the far version — `lo`: coarser puffs and limbs — are the same tree:
// nothing drawn from the random numbers depends on `lo`)
export function treeGeo(kind: number, young: boolean, seed: number, lo = false) {
  const R = mulberry32(seed), rr = (a: number, b: number) => a + (b - a) * R();
  const P: number[] = [], N: number[] = [], C: number[] = [], W: number[] = [], L: number[] = [], I: number[] = [], M: number[] = [];
  const push = (p: THREE.Vector3, n: THREE.Vector3, c: number[], sway: number, leaf: number) => { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); M.push(n.x, n.y, n.z); C.push(c[0], c[1], c[2]); W.push(sway); L.push(leaf); return P.length / 3 - 1; };
  const K = KINDS[kind], bark = K.bark;
  const sw = (y: number) => 0.5 * Math.pow(Math.max(0, y), 1.6);
  // a limb: a smooth tapered tube from a to b, bowed a little through its middle (`bow`, sideways), its radius
  // at t given by rad(t); round in section, so it is lit as a rounded thing, not a ruled stick
  const up = new THREE.Vector3(0, 1, 0);
  const limb = (a: THREE.Vector3, b: THREE.Vector3, rad: (t: number) => number, bow = new THREE.Vector3()) => {
    const S = lo ? 5 : 8, Rn = lo ? 2 : 5, st = P.length / 3;
    const mid = a.clone().lerp(b, 0.5).add(bow);
    for (let i = 0; i <= Rn; i++) {
      const t = i / Rn, c = a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(b, t * t);
      const ax = mid.clone().sub(a).multiplyScalar(2 * (1 - t)).addScaledVector(b.clone().sub(mid), 2 * t).normalize();
      const u = (Math.abs(ax.y) < 0.95 ? up.clone() : new THREE.Vector3(1, 0, 0)).cross(ax).normalize(), v = ax.clone().cross(u);
      for (let j = 0; j < S; j++) {
        const an = j / S * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
        push(c.clone().addScaledVector(n, rad(t)), n, bark, sw(c.y), 0);
      }
    }
    for (let i = 0; i < Rn; i++) for (let j = 0; j < S; j++) { const a0 = st + i * S + j, b0 = st + i * S + (j + 1) % S; I.push(a0, b0, a0 + S, b0, b0 + S, a0 + S); }
  };
  const taper = (r0: number, r1: number, flare = 0) => (t: number) => r1 + (r0 - r1) * (1 - t) + flare * Math.pow(Math.max(0, 1 - t * 4), 2);
  // a puff of foliage: a smooth ball, its underside flatter, gently lumpy (low, broad lumps only)
  const ico = icoI(lo ? 1 : young ? 2 : 3); const ip = ico.attributes.position, ix = ico.index!.array;
  const puffs: { c: THREE.Vector3; st: number; n: number; j: number }[] = [];
  const puff = (c: THREE.Vector3, rx: number, ry: number) => {
    const st = P.length / 3, s0 = R() * 50, j = rr(0.92, 1.08), rz = rx * rr(0.88, 1.08);
    const n3 = new THREE.Vector3(), q = new THREE.Vector3();
    for (let k = 0; k < ip.count; k++) {
      n3.set(ip.getX(k), ip.getY(k), ip.getZ(k)).normalize();
      const lump = 1 + 0.07 * Math.sin(n3.x * 2.2 + s0) * Math.sin(n3.z * 2.4 + s0 * 1.3) + 0.05 * Math.sin(n3.y * 2.6 + s0 * 0.7);
      const fy = n3.y < 0 ? 0.6 : 1;
      q.set(n3.x * rx * lump, n3.y * ry * fy * lump, n3.z * rz * lump);
      const mn = new THREE.Vector3(n3.x / rx, n3.y / (ry * fy), n3.z / rz).normalize();
      push(c.clone().add(q), mn, K.top, sw(c.y) + 0.1, 1);
    }
    for (let k = 0; k < ix.length; k++) I.push(st + ix[k]);
    puffs.push({ c, st, n: ip.count, j });
  };
  // the crown: a big puff on top, a ring round it a little lower, a few more tucked in between (a sapling: two or three)
  const crown = (c: THREE.Vector3, A: number, B: number, n: number, limbsFrom: THREE.Vector3[] | null, limbR: number) => {
    const fl = K.flat, a0 = R() * 6.28, cs: THREE.Vector3[] = [];
    puff(c.clone().add(new THREE.Vector3(rr(-0.05, 0.05) * A, B * 0.42, rr(-0.05, 0.05) * A)), A * rr(0.5, 0.6), A * rr(0.5, 0.6) * fl);
    cs.push(puffs[puffs.length - 1].c);
    const ring = Math.max(2, n - 1 - (n > 6 ? 2 : 0));
    for (let k = 0; k < ring; k++) {
      const an = a0 + k / ring * 6.28 + rr(-0.3, 0.3), d = A * rr(0.5, 0.68);
      const pc = c.clone().add(new THREE.Vector3(Math.cos(an) * d, rr(-0.35, 0.05) * B, Math.sin(an) * d)), r = A * rr(0.38, 0.5);
      puff(pc, r, r * fl); cs.push(pc);
    }
    for (let k = 0; k < n - 1 - ring; k++) {
      const an = a0 + (k + 0.5) / (n - 1 - ring) * 6.28, d = A * rr(0.28, 0.4);
      const pc = c.clone().add(new THREE.Vector3(Math.cos(an) * d, B * rr(0.12, 0.3), Math.sin(an) * d)), r = A * rr(0.4, 0.5);
      puff(pc, r, r * fl); cs.push(pc);
    }
    // limbs up into the puffs (ending inside them)
    if (limbsFrom) cs.forEach((pc, k) => { if (k === 0 && cs.length > 3) return; const f = limbsFrom[k % limbsFrom.length]; limb(f, f.clone().lerp(pc, 0.8), taper(limbR, limbR * 0.45), new THREE.Vector3(0, 0.04, 0)); });
  };
  const tilt = (x: number) => new THREE.Vector3((R() - 0.5) * x, 1, (R() - 0.5) * x).normalize();
  if (young) {
    // a sapling: a slim stem, a small round crown
    const t = tilt(0.25), top = t.clone().multiplyScalar(rr(0.5, 0.6));
    limb(new THREE.Vector3(0, -0.05, 0), top, taper(0.026, 0.016, 0.006), new THREE.Vector3(rr(-0.03, 0.03), 0, rr(-0.03, 0.03)));
    crown(top.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.26, 0.24, kind === 1 || kind === 3 ? 3 : 2, [top], 0.014);
  } else if (kind === 0) {
    const t = tilt(0.3), top = t.clone().multiplyScalar(rr(0.32, 0.4));
    limb(new THREE.Vector3(0, -0.05, 0), top, taper(0.05, 0.036, 0.022), new THREE.Vector3(rr(-0.03, 0.03), 0, rr(-0.03, 0.03)));
    crown(top.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.44, 0.34, 8, [top], 0.028);
  } else if (kind === 1) {
    // two or three trunks sprawling from the foot, each kinked once; the crown low and broad over them
    const n = 2 + Math.floor(R() * 2), a0 = R() * 6.28, ends: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const an = a0 + k / n * 6.28 + rr(-0.4, 0.4), out = new THREE.Vector3(Math.cos(an), 0, Math.sin(an));
      const m = out.clone().multiplyScalar(rr(0.12, 0.2)).add(new THREE.Vector3(0, rr(0.2, 0.26), 0));
      const e2 = m.clone().add(out.clone().multiplyScalar(rr(0.06, 0.12))).add(new THREE.Vector3(0, rr(0.12, 0.16), 0));
      limb(new THREE.Vector3(0, -0.05, 0), m, taper(0.04, 0.032, 0.012)); limb(m, e2, taper(0.032, 0.026));
      ends.push(e2);
    }
    crown(new THREE.Vector3(0, 0.62, 0), 0.52, 0.24, 9, ends, 0.022);
  } else if (kind === 2) {
    const t = tilt(0.15), top = t.clone().multiplyScalar(rr(0.54, 0.6));
    limb(new THREE.Vector3(0, -0.05, 0), top, taper(0.042, 0.03, 0.016), new THREE.Vector3(rr(-0.02, 0.02), 0, rr(-0.02, 0.02)));
    crown(top.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.32, 0.26, 6, [top], 0.022);
  } else {
    const t = tilt(0.12), top = t.clone().multiplyScalar(rr(0.32, 0.36));
    // the fluted trunk: a bundle of stems fused together, buttressed at the foot
    for (let k = 0; k < 4; k++) { const an = k * 1.57 + R(), o = new THREE.Vector3(Math.cos(an), 0, Math.sin(an)); limb(o.clone().multiplyScalar(0.06).setY(-0.05), top.clone().addScaledVector(o, 0.018), taper(0.04, 0.028, 0.012)); }
    // long level limbs, aerial roots hanging from some, the crown wide over them
    const n = 5, ends: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const an = k / n * 6.28 + rr(-0.3, 0.3), out = new THREE.Vector3(Math.cos(an), 0, Math.sin(an));
      const e2 = top.clone().addScaledVector(out, rr(0.3, 0.4)).add(new THREE.Vector3(0, rr(0.1, 0.16), 0));
      limb(top, e2, taper(0.03, 0.02), new THREE.Vector3(0, 0.03, 0)); ends.push(e2);
      if (k % 2 === 0) { const r0 = top.clone().lerp(e2, rr(0.55, 0.9)); limb(r0, new THREE.Vector3(r0.x + rr(-0.02, 0.02), -0.05, r0.z + rr(-0.02, 0.02)), taper(0.007, 0.009)); }   // (aerial roots)
    }
    crown(top.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.58, 0.3, 10, ends, 0.02);
  }
  // the crown lit as one form: each puff's normals bent outward from the crown's middle; its colour by how it faces
  // and how high it is — the bright warm green on top, the deep green beneath
  const cc = new THREE.Vector3(), lo3 = new THREE.Vector3(1e9, 1e9, 1e9), hi3 = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (const pf of puffs) for (let k = pf.st; k < pf.st + pf.n; k++) { const v = new THREE.Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); lo3.min(v); hi3.max(v); }
  cc.addVectors(lo3, hi3).multiplyScalar(0.5); const ext = hi3.clone().sub(lo3).multiplyScalar(0.5).max(new THREE.Vector3(1e-3, 1e-3, 1e-3));
  const v3 = new THREE.Vector3(), o3 = new THREE.Vector3();
  for (const pf of puffs) for (let k = pf.st; k < pf.st + pf.n; k++) {
    v3.set(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]); o3.set((P[k * 3] - cc.x) / ext.x, (P[k * 3 + 1] - cc.y) / ext.y * 1.2 + 0.15, (P[k * 3 + 2] - cc.z) / ext.z).normalize();
    v3.lerp(o3, 0.6).normalize(); N[k * 3] = v3.x; N[k * 3 + 1] = v3.y; N[k * 3 + 2] = v3.z;
    const h = (P[k * 3 + 1] - cc.y) / ext.y, tt = smooth(0, 1, 0.45 + 0.4 * v3.y + 0.3 * h);
    for (let i = 0; i < 3; i++) C[k * 3 + i] = (K.deep[i] + (K.top[i] - K.deep[i]) * tt) * pf.j;
  }
  // scaled so the crown top is at 1
  let ymax = 0; for (let k = 1; k < P.length; k += 3) ymax = Math.max(ymax, P[k]);
  for (let k = 0; k < P.length; k++) P[k] /= ymax;
  // how much open sky each part sees: the top of the crown all of it, the trunk and the inside of the crown little
  // (saplings live in the shade of the canopy)
  const Sh: number[] = [];
  for (let k = 0; k < L.length; k++) { const y = P[k * 3 + 1]; Sh.push(young ? 0.6 : L[k] ? 0.6 + 0.4 * smooth(0.4, 0.95, y) : 0.55 + 0.35 * smooth(0.45, 1.0, y)); }
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

// the forest floor's own growth: a low clump of ferns and seedlings — a soft mound of three or four small puffs
function shrubGeo() {
  const R = mulberry32(77), rr = (a: number, b: number) => a + (b - a) * R();
  const P: number[] = [], N: number[] = [], C: number[] = [], W: number[] = [], L: number[] = [], I: number[] = [];
  const ico = icoI(1); const ip = ico.attributes.position, ix = ico.index!.array;
  const top = [0.34, 0.5, 0.17], deep = [0.08, 0.2, 0.07];
  for (let m = 0; m < 4; m++) {
    const st = P.length / 3, an = m * 1.9 + R(), d = m ? rr(0.25, 0.45) : 0, cx = Math.cos(an) * d, cz = Math.sin(an) * d, r = m ? rr(0.3, 0.42) : 0.48, j = rr(0.9, 1.1), seed = R() * 40;
    for (let k = 0; k < ip.count; k++) {
      const n = new THREE.Vector3(ip.getX(k), ip.getY(k), ip.getZ(k)).normalize();
      const lump = 1 + 0.06 * Math.sin(n.x * 2.1 + seed) * Math.sin(n.z * 2.3 + seed);
      P.push(cx + n.x * r * lump, Math.max(0, r * 0.45 + n.y * r * (n.y < 0 ? 0.4 : 0.75) * lump), cz + n.z * r * lump);
      const o = new THREE.Vector3(cx * 0.8 + n.x, n.y + 0.7, cz * 0.8 + n.z).normalize(); N.push(o.x, o.y, o.z);
      const t = smooth(-0.2, 1, o.y * 0.8 + n.y * 0.3);
      C.push((deep[0] + (top[0] - deep[0]) * t) * j, (deep[1] + (top[1] - deep[1]) * t) * j, (deep[2] + (top[2] - deep[2]) * t) * j); W.push(0.15); L.push(1);
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
       float edge = abs(dot(normalize(vMn), V)) - (0.12 * l2 + 0.03), ew = max(fwidth(edge), 1e-4);   // (a soft, gently scalloped rim: the crowns are smooth puffs now)
       float cover = mix(1.0, smoothstep(-ew, ew, edge), step(0.5, vLeaf));
       if (cover < mix(0.5, 0.02, uA2C)) discard;
       if (vLeaf > 0.5) {
         // (the leaf clumps' light and shade only a soft mottle over the rounded form)
         n = normalize(n + vec3(l1 - 0.5, (l2 - 0.5) * 0.5, vn2(vWp.zx * 3.3) - 0.5) * 0.4);
         vec3 alb = vCol * (0.88 + 0.28 * l2) * mix(0.75, 1.15, smoothstep(-0.2, 0.9, vN.y));   // (sunlit tops, shaded undersides)
         alb = mix(alb, vec3(0.5, 0.56, 0.24), smoothstep(0.8, 0.96, l1) * 0.25);              // (new leaves, paler)
         col = airLit(alb, n, vWp, 0.8);
       } else {
         // bark: grey-brown, ridged, mossy on the shaded side
         float ridge = vn2(vec2(atan(vL.x, vL.z) * 3.0, vL.y * 40.0));
         vec3 alb = vCol * (0.75 + 0.4 * ridge);
         alb = mix(alb, vec3(0.25, 0.3, 0.15), smoothstep(0.2, -0.6, dot(n, uAirSun)) * 0.35);
         col = airLit(alb, n, vWp, 0.0) + alb * vec3(0.16, 0.18, 0.13) * (1.0 - uNight * 0.8);   // (light thrown back from the leaves and the floor)
       }
       col *= vSh + (1.0 - vSh) * 0.9 * dapple(vWp, vWp.y + 6.0);   // (shade inside the forest, flecks of sun)
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
