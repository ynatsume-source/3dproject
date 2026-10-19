// The horned ghost crab (ツノメガニ, Ocypode ceratophthalmus), the pale crab that runs the Yaeyama beaches by night
// (nature team, 2026-10-19; night sight 2 in docs/proposals/night-sights-2026-10-19). Its look only: the world says
// where a crab is and what it is doing (not yet: the eco side's, once main has answered), this draws it.
//  - A squarish carapace about 4.5 cm across, the colour of dry sand, a little paler at its edges; long eyestalks
//    standing up from the front corners, black eyes with a short horn (the style) above each; one claw larger than
//    the other, white-tipped; four pairs of long walking legs splayed out to the sides. Head at +z; it runs sideways
//    (along x). Units: metres, the body's middle at the origin, the feet on y = 0.
//  - Posed in the vertex shader from aCr (gait phase, speed 0..1 — 0 a crab standing still, 1 running —, sunk 0..1 —
//    0 standing on the sand, 1 gone into its burrow —, eyes 0..1 — 0 laid flat, 1 raised) and aCr2 (seed, size,
//    pale 0..1): legs in an alternating gait, the body raised and a little ahead of its feet when running.
//  - Far off (LOD_M), legs thinner than a pixel would shimmer as the camera moves: there they are drawn folded close
//    under the body, so the crab is a pale shape with its outline only.
// Nothing here draws the island's random numbers: built only behind the lab knob for now (?crablook), every three.js
// object made inside quiet().
import * as THREE from 'three';
import { mat } from '../render/common';
import { AIRLIT } from './shore';
import { draw } from '../science/rng';

const SEED = 0x63726162;   // 'crab'
const u = (...k: string[]) => draw(SEED, 'crab-look', ...k);
let made = 0;
function quiet<T>(what: string, f: () => T): T {
  const keep = Math.random; let n = 0; const key = `${what}#${made++}`;
  Math.random = () => draw(SEED, 'three-ids', key, String(n++));
  try { return f(); } finally { Math.random = keep; }
}

export const CRAB_LOD_M = 5;
// the walking legs' roots on the carapace's sides (x, z), front to back; and how far out their feet stand
const ROOTS = [[0.019, 0.009], [0.021, 0.002], [0.02, -0.006], [0.017, -0.013]];
const REACH = [0.046, 0.054, 0.052, 0.042];
const BODY_Y = 0.017;   // (standing: the carapace's middle this high over the sand)

// aPart: 0 carapace, 1 eyestalk, 2 eye, 3 claw, 4 walking leg. aLeg: which leg (0..7: right 0–3, left 4–7; -1 none).
// aRoot: where the limb joins the body; aT: 0 at the root to 1 at the tip.
function crabGeo(): THREE.BufferGeometry {
  const P: number[] = [], A: number[] = [], L: number[] = [], RT: number[] = [], T: number[] = [], idx: number[] = [];
  const push = (p: number[], part: number, leg: number, root: number[], t: number) => { P.push(p[0], p[1], p[2]); A.push(part); L.push(leg); RT.push(root[0], root[1], root[2]); T.push(t); };
  const grid = (nu: number, nv: number, f: (u: number, v: number) => number[], part: number, leg: number, root: number[], tAt: (u: number) => number, flip = false) => {
    const o = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) push(f(i / nu, j / nv), part, leg, root, tAt(i / nu));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = o + i * (nv + 1) + j, b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  const tube = (pts: number[][], r0: number, r1: number, part: number, leg: number, n = 5, flatY = 1) => {
    const segs = pts.length - 1, root = pts[0];
    grid(segs * 2, n, (uu, v) => {
      const s = uu * segs, i = Math.min(segs - 1, Math.floor(s)), t = s - i, a = pts[i], b = pts[i + 1];
      const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const e1 = new THREE.Vector3(0, 1, 0).cross(d); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize();
      const e2 = d.clone().cross(e1), ang = v * Math.PI * 2, r = (r0 + (r1 - r0) * uu) * (uu > 0.95 ? 0.35 : 1);
      const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r * flatY;
      return [c[0] + e1.x * ca + e2.x * sa, c[1] + e1.y * ca + e2.y * sa, c[2] + e1.z * ca + e2.z * sa];
    }, part, leg, root, (uu) => uu);
  };
  const none = [0, BODY_Y, 0];
  // the carapace: a squarish, gently domed shell, wider than long, its front edge straight between the eyes
  grid(16, 28, (uu, v) => {
    const a = v * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), top = uu < 0.5, w = top ? uu * 2 : (1 - uu) * 2;
    const sq = (q: number, e: number) => Math.sign(q) * Math.pow(Math.abs(q), e);
    const x = sq(c, 0.55) * 0.0225 * w ** 0.35, z = sq(s, 0.6) * 0.019 * w ** 0.35 - (s < 0 ? 0.002 * c * c : 0);
    const dome = top ? 0.0085 * Math.pow(Math.max(0, w), 0.6) * (1 - 0.25 * (z / 0.019) ** 2) : -0.006 * Math.pow(Math.max(0, w), 0.8);
    return [x, BODY_Y + dome, z];
  }, 0, -1, none, () => 0);
  // the eyestalks: long, from the front corners up and a little out; a black eye along each stalk's top half, and the
  // short horn standing past it
  for (const sx of [-1, 1]) {
    const base = [sx * 0.012, BODY_Y + 0.006, 0.017], tip = [sx * 0.016, BODY_Y + 0.019, 0.019];
    tube([base, tip], 0.0022, 0.0018, 1, -1, 5);
    const eyeA = [base[0] + (tip[0] - base[0]) * 0.5, base[1] + (tip[1] - base[1]) * 0.5, base[2] + (tip[2] - base[2]) * 0.5];
    tube([eyeA, tip], 0.0031, 0.0029, 2, -1, 6);
    tube([tip, [tip[0] + sx * 0.0008, tip[1] + 0.006, tip[2] - 0.0005]], 0.0009, 0.0004, 1, -1, 4);
  }
  // the claws: folded before the mouth, the right one larger (as most are); arm, palm, and the two fingers
  for (const sx of [-1, 1]) {
    const big = sx > 0 ? 1.25 : 0.85, s0 = [sx * 0.014, BODY_Y - 0.002, 0.016], el = [sx * 0.026, BODY_Y + 0.001, 0.024], wr = [sx * 0.017, BODY_Y - 0.002, 0.032];
    tube([s0, el, wr], 0.0032 * big, 0.0036 * big, 3, -1, 6);
    tube([wr, [sx * 0.008, BODY_Y - 0.003, 0.034]], 0.0055 * big, 0.004 * big, 3, -1, 7, 0.7);
    tube([[sx * 0.008, BODY_Y - 0.003, 0.034], [sx * 0.001, BODY_Y - 0.004, 0.033]], 0.0028 * big, 0.0008, 3, -1, 5, 0.7);
  }
  // the walking legs: three joints each, out to the side and down to the sand, the tips pointed
  for (const sx of [-1, 1]) ROOTS.forEach(([rx, rz], k) => {
    const leg = (sx > 0 ? 0 : 4) + k, R = REACH[k], sp = (k - 1.5) * 0.35;   // (spread: the front legs reach forward, the back ones back)
    const root = [sx * rx, BODY_Y - 0.001, rz];
    const knee = [sx * (rx + R * 0.5), BODY_Y + 0.012, rz + Math.sin(sp) * R * 0.45];
    const ank = [sx * (rx + R * 0.82), BODY_Y - 0.002, rz + Math.sin(sp) * R * 0.7];
    const foot = [sx * (rx + R), 0.0005, rz + Math.sin(sp) * R * 0.85];
    tube([root, knee, ank, foot], 0.0026, 0.0012, 4, leg, 5, 0.75);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setAttribute('aLeg', new THREE.Float32BufferAttribute(L, 1)); g.setAttribute('aRoot', new THREE.Float32BufferAttribute(RT, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function crabMat(): THREE.Material {
  return mat(
    `attribute float aPart; attribute float aLeg; attribute vec3 aRoot; attribute float aT; attribute vec4 aCr; attribute vec4 aCr2;
     uniform float uLod; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vCr2; varying float vT;
     vec3 rz(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
     vec3 ry(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
     void main(){
       vec3 p = position, nl = normal; mat4 mm = modelMatrix * instanceMatrix;
       float far = step(uLod, distance(uCamPos, (mm * vec4(0.0, 0.0, 0.0, 1.0)).xyz));
       float run = aCr.y, sunk = aCr.z;
       // the legs: an alternating gait (legs 0,2 of one side with 1,3 of the other), each lifting and swinging in turn
       if (aLeg > -0.5) {
         float side = aLeg < 3.5 ? 1.0 : -1.0, k = mod(aLeg, 4.0), grp = mod(k + step(3.5, aLeg), 2.0);
         float ph = aCr.x + grp * 3.14159, lift = max(0.0, sin(ph)) * run, sw = cos(ph) * run;
         vec3 q = p - aRoot, m = nl;
         float w = smoothstep(0.0, 0.4, aT);
         q = rz(q, side * lift * 0.55 * w); m = rz(m, side * lift * 0.55 * w);   // (lifted at the hip, out of the sand)
         q = ry(q, sw * 0.32 * w); m = ry(m, sw * 0.32 * w);                      // (swung forward and back)
         // (far off: folded close in under the body)
         q = mix(q, q * vec3(0.35, 0.6, 0.6) + vec3(0.0, 0.004, 0.0), far);
         p = aRoot + q; nl = m;
       }
       // the eyestalks laid down outward along the front edge (into their grooves), or raised (alert, or running)
       float stalk = step(0.5, aPart) * step(aPart, 2.5), sx = sign(position.x);
       vec3 eb = vec3(sx * 0.012, ${BODY_Y.toFixed(3)} + 0.006, 0.017);
       float down = -sx * (1.0 - aCr.w) * 1.25;
       p = mix(p, eb + rz(p - eb, down), stalk); nl = mix(nl, rz(nl, down), stalk);
       // the body: raised a little when running; gone down into the burrow as it sinks (the sand hides what is under it)
       p.y += run * 0.004 - sunk * 0.06;
       vec4 wp = mm * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(mm) * nl); vL = position; vPart = aPart; vCr2 = aCr2; vT = aT;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    AIRLIT + `varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vCr2; varying float vT;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       // the colour of dry sand, a little paler to the shell's edges and on the legs; the claw tips white, the eyes black
       float pale = vCr2.z, edge = smoothstep(0.012, 0.022, length(vL.xz));
       vec3 sand = mix(vec3(0.74, 0.68, 0.53), vec3(0.83, 0.79, 0.67), pale);
       vec3 alb = mix(sand * 0.92, sand * 1.06, edge);
       float leg = step(3.5, vPart);
       alb = mix(alb, sand * mix(1.04, 0.9, vT), leg);
       float claw = step(2.5, vPart) * step(vPart, 3.5);
       alb = mix(alb, mix(sand * 1.05, vec3(0.93, 0.92, 0.88), smoothstep(0.0, -0.004, vL.y - ${BODY_Y.toFixed(3)}) * step(0.03, vL.z)), claw);
       float eye = step(1.5, vPart) * step(vPart, 2.5);
       alb = mix(alb, vec3(0.03, 0.03, 0.035), eye);
       vec3 col = airLit(alb, n, vWp, 0.4);
       vec3 H = normalize(uAirSun + V);
       col += sunAirCol() * pow(max(dot(n, H), 0.0), mix(18.0, 90.0, eye)) * mix(0.06, 0.6, eye) * (1.0 - 0.7 * uCloud);
       col = fogIt(col, vWp);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uLod: { value: CRAB_LOD_M } }, opts: { side: THREE.DoubleSide } });
}

export interface CrabPose { x: number; z: number; y: number; head: number; phase: number; run: number; sunk: number; eyes: number; id: string }
/** Up to `cap` crabs, drawn from `poses` each frame (the world's, once there is one: today only the lab knob's). */
export function makeCrabLook(parent: THREE.Group, cap = 16) {
  return quiet('crab-look', () => {
    const geo = crabGeo();
    const aCr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), aCr2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    aCr.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aCr', aCr); geo.setAttribute('aCr2', aCr2);
    const mesh = new THREE.InstancedMesh(geo, crabMat(), cap); mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'crab-look'; parent.add(mesh);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    function show(poses: CrabPose[]) {
      const n = Math.min(cap, poses.length);
      for (let i = 0; i < n; i++) {
        const c = poses[i], size = 0.85 + 0.3 * u(c.id, 'size');
        _e.set(0, c.head, 0); _q.setFromEuler(_e); _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(size, size, size)); mesh.setMatrixAt(i, _m);
        aCr.setXYZW(i, c.phase, c.run, c.sunk, c.eyes); aCr2.setXYZW(i, u(c.id, 'seed'), size, u(c.id, 'pale'), 0);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; aCr.needsUpdate = true; aCr2.needsUpdate = true;
    }
    return { mesh, show };
  });
}

/** LAB: ?crablook — four crabs on the sand by Dot's home (test only, not the world's): one standing with its eyes up,
 *  one running back and forth sideways, one going into its burrow and coming out again, one with its eyes laid flat. */
export function crabLookTest(q: string): boolean { return /[?&]crablook\b/.test(q); }
export function crabTestPoses(t: number, at: { x: number; z: number }, groundAt: (x: number, z: number) => number): CrabPose[] {
  const out: CrabPose[] = [];
  const put = (id: string, dx: number, dz: number, head: number, phase: number, run: number, sunk: number, eyes: number) => {
    const x = at.x + dx, z = at.z + dz; out.push({ id, x, z, y: groundAt(x, z), head, phase, run, sunk, eyes });
  };
  put('test-still', 0, 0, 0.6, 0, 0, 0, 1);
  const s = Math.sin(t * 0.7);   // (back and forth: running sideways along its own x)
  put('test-run', 0.5 + Math.cos(0.2) * s * 0.6, 0.5 - Math.sin(0.2) * s * 0.6, 0.2, t * 22, Math.min(1, Math.abs(Math.cos(t * 0.7)) * 1.4), 0, 1);
  const b = 0.5 + 0.5 * Math.sin(t * 0.5);   // (into its burrow and out again)
  put('test-burrow', -0.4, 0.45, 2.4, t * 3, 0, Math.min(1, Math.max(0, b * 1.4 - 0.2)), 1);
  put('test-flat', -0.3, -0.35, -0.9, 0, 0, 0, 0);
  return out;
}
