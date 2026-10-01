// The island's forest, close to: trees, one by one. From afar the forest is the canopy surface draped with
// the aerial photograph (ocean/shore.ts); near the camera that surface steps aside and the forest is made
// of trees — the coastal broadleaf forest of a Yaeyama islet (テリハボク, オオハマボウ, ハスノハギリ and
// the like): a short, leaning, often forked trunk, a few heavy limbs, and a broad crown of leaf masses,
// darker and denser inside, catching the light at the top, swaying with the wind. Trees stand where the
// photograph shows canopy, as tall as the canopy is there; they are kept in 40 m cells, and only the
// cells near the camera are drawn.
import * as THREE from 'three';
import { mat } from '../render/common';
import { R, rr, hash } from '../core/math';

const CELL = 40;

// one tree, unit height (ground at 0, crown top at 1); a few variants
function treeGeo(variant: number) {
  const P: number[] = [], N: number[] = [], C: number[] = [], W: number[] = [], L: number[] = [], I: number[] = [];
  const push = (p: THREE.Vector3, n: THREE.Vector3, c: number[], sway: number, leaf: number) => { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); C.push(c[0], c[1], c[2]); W.push(sway); L.push(leaf); return P.length / 3 - 1; };
  const bark = [0.3, 0.26, 0.21];
  // a tapered limb from a to b
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sw0: number, sw1: number) => {
    const ax = b.clone().sub(a).normalize(), u = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(ax).normalize() : new THREE.Vector3(1, 0, 0), v = ax.clone().cross(u);
    const st = P.length / 3, S = 7;
    for (let k = 0; k <= 1; k++) for (let j = 0; j < S; j++) {
      const an = j / S * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
      push((k ? b : a).clone().addScaledVector(n, k ? r1 : r0), n, bark, k ? sw1 : sw0, 0);
    }
    for (let j = 0; j < S; j++) { const a0 = st + j, b0 = st + (j + 1) % S; I.push(a0, b0, a0 + S, b0, b0 + S, a0 + S); }
  };
  // a leaf mass: a lumpy ball (an icosphere pushed in and out), its own shade of green
  const ico = new THREE.IcosahedronGeometry(1, 2); const ip = ico.attributes.position, ix = ico.index ? ico.index.array : null;
  const mass = (c: THREE.Vector3, r: number, sway: number) => {
    const st = P.length / 3, seed = R() * 50, tint = R() < 0.25 ? [0.34 + R() * 0.08, 0.42 + R() * 0.06, 0.16 + R() * 0.04] : [0.22 + R() * 0.08, 0.36 + R() * 0.1, 0.14 + R() * 0.05];   // (glossy dark greens, and the yellower crowns of hau and the like)
    for (let k = 0; k < ip.count; k++) {
      const n = new THREE.Vector3(ip.getX(k), ip.getY(k), ip.getZ(k)).normalize();
      const bump = 0.78 + 0.32 * Math.abs(Math.sin(n.x * 5.1 + seed) * Math.sin(n.y * 4.3 + seed * 1.3) * Math.sin(n.z * 4.7 + seed * 0.7));
      const p = c.clone().add(new THREE.Vector3(n.x * r * bump, n.y * r * 0.72 * bump, n.z * r * bump));
      push(p, n, tint, sway, 1);
    }
    if (ix) for (let k = 0; k < ix.length; k++) I.push(st + ix[k]); else for (let k = 0; k < ip.count; k++) I.push(st + k);
  };
  // trunk: leaning, forking at a third to a half of the height
  const lean = new THREE.Vector3((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25).normalize();
  const fork = lean.clone().multiplyScalar(0.3 + variant * 0.06);
  limb(new THREE.Vector3(0, -0.05, 0), fork, 0.045, 0.032, 0, 0.05);
  const limbs = 3 + (variant % 2);
  for (let k = 0; k < limbs; k++) {
    const a = k / limbs * Math.PI * 2 + R() * 0.8, spread = rr(0.22, 0.36);
    const end = fork.clone().add(new THREE.Vector3(Math.cos(a) * spread, rr(0.3, 0.42), Math.sin(a) * spread));
    limb(fork, end, 0.026, 0.012, 0.05, 0.25);
    // leaf masses round the end of each limb, and one or two along it
    mass(end.clone().add(new THREE.Vector3(0, 0.08, 0)), rr(0.2, 0.27), 0.4);
    mass(fork.clone().lerp(end, 0.6).add(new THREE.Vector3((R() - 0.5) * 0.1, 0.1, (R() - 0.5) * 0.1)), rr(0.15, 0.2), 0.3);
  }
  mass(fork.clone().add(new THREE.Vector3(0, 0.55, 0)), rr(0.24, 0.3), 0.45);   // the crown's top
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 1));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(L, 1));
  g.setIndex(I);
  return g;
}

export function buildForest(AIRLIT: string, group: THREE.Group, f: (x: number, z: number) => number, can: (x: number, z: number) => number, top: (x: number, z: number) => { y: number; c: number }, E: number) {
  const treeMat = mat(
    `attribute vec3 aTint; attribute float aSway; attribute float aLeaf; varying vec3 vWp; varying vec3 vN; varying vec3 vCol; varying float vLeaf; varying vec3 vL;
     void main(){
       vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
       float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
       // the crowns move in the wind: a slow lean and a quicker flutter of the leaf masses
       w.xz += (vec2(sin(uTime * 0.9 + ph), cos(uTime * 0.7 + ph * 1.7)) * 0.12 + vec2(sin(uTime * 2.7 + ph * 3.0 + position.y * 9.0), cos(uTime * 2.3 + position.x * 7.0)) * 0.04 * aLeaf) * aSway * (0.4 + 0.6 * uWave);
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       vCol = aTint * (0.85 + 0.3 * fract(sin(ph * 12.9) * 43758.5)); vLeaf = aLeaf; vL = position;
       gl_Position = projectionMatrix * viewMatrix * w; }`,
    `${AIRLIT}
     varying vec3 vWp; varying vec3 vN; varying vec3 vCol; varying float vLeaf; varying vec3 vL;
     void main(){
       if (length(vWp.xz - uCut.xz) < uCut.w && vWp.y > uCut.y + 0.9) discard;   // (the crowns over a resident being watched)
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (!gl_FrontFacing) n = -n;
       vec3 col;
       if (vLeaf > 0.5) {
         // leaves: clumps of light and shade at the scale of twigs, a ragged edge where the mass turns away
         float l1 = vn2(vWp.xz * 3.1 + vWp.y * 2.3), l2 = vn2(vWp.xz * 9.0 - vWp.y * 6.0 + 5.0);
         float edge = abs(dot(n, V));
         if (edge < 0.32 * l2 + 0.06) discard;
         n = normalize(n + vec3(l1 - 0.5, (l2 - 0.5) * 0.5, vn2(vWp.zx * 3.3) - 0.5) * 1.1);
         vec3 alb = vCol * (0.75 + 0.7 * l2) * mix(0.62, 1.25, smoothstep(-0.2, 0.9, vN.y));   // (sunlit tops, shaded undersides)
         alb = mix(alb, vec3(0.44, 0.48, 0.22), smoothstep(0.78, 0.95, l1) * 0.4);            // (new leaves, paler)
         col = airLit(alb, n, vWp, 0.8);
       } else {
         // bark: grey-brown, ridged, mossy on the shaded side
         float ridge = vn2(vec2(atan(vL.x, vL.z) * 3.0, vL.y * 40.0));
         vec3 alb = vCol * (0.75 + 0.4 * ridge);
         alb = mix(alb, vec3(0.25, 0.3, 0.15), smoothstep(0.2, -0.6, dot(n, uAirSun)) * 0.35);
         col = airLit(alb, n, vWp, 0.0);
       }
       gl_FragColor = vec4(fogIt(col, vWp), 1.0);
     }`, { opts: { side: THREE.DoubleSide } });
  const geos = [treeGeo(0), treeGeo(1), treeGeo(2)];
  // where the trees stand: a jittered grid over the canopy, each as tall as the canopy there
  type Tree = { x: number; z: number; y: number; h: number; ry: number; v: number };
  const cells = new Map<string, Tree[]>();
  const S = 3.6;
  for (let gz = -E; gz < E; gz += S) for (let gx = -E; gx < E; gx += S) {
    const x = gx + hash(gx * 0.7, gz * 1.3) * S, z = gz + hash(gx * 1.9 + 4, gz * 0.3 - 2) * S;
    const c = can(x, z); if (c < 0.45) continue;
    const y = f(x, z); if (y < 0.3) continue;
    const h = Math.max(2.2, top(x, z).y - y);
    const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push({ x, z, y, h, ry: R() * 6.28, v: Math.floor(R() * 3) });
  }
  const meshes: { cx: number; cz: number; list: THREE.InstancedMesh[] }[] = [];
  const e = new THREE.Euler(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  let count = 0;
  for (const [k, list] of cells) {
    const [ci, cj] = k.split(',').map(Number);
    const ms: THREE.InstancedMesh[] = [];
    for (let v = 0; v < 3; v++) {
      const sub = list.filter((t) => t.v === v); if (!sub.length) continue;
      const mesh = new THREE.InstancedMesh(geos[v], treeMat, sub.length);
      sub.forEach((t, i) => {
        const w = t.h * rr(0.8, 1.05);   // (crowns about as wide as the trees are tall, touching to close the canopy)
        q.setFromEuler(e.set((R() - 0.5) * 0.08, t.ry, (R() - 0.5) * 0.08));
        mesh.setMatrixAt(i, m4.compose(p3.set(t.x, t.y, t.z), q, s3.set(w, t.h, w)));
      });
      mesh.frustumCulled = false; mesh.visible = false; group.add(mesh); ms.push(mesh); count += sub.length;
    }
    meshes.push({ cx: (ci + 0.5) * CELL, cz: (cj + 0.5) * CELL, list: ms });
  }
  let near = 85;
  return {
    count,
    get near() { return near; },
    // which cells to draw: those reaching within `near` of the camera (the canopy surface fills in beyond)
    update(cam: THREE.Vector3, r: number) {
      near = r;
      for (const c of meshes) { const on = Math.hypot(c.cx - cam.x, c.cz - cam.z) < r + CELL * 0.75; for (const m of c.list) m.visible = on; }
    },
  };
}
