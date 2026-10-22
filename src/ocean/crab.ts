// The night beach's crabs (nature team, 2026-10-19; night sight 2 in docs/proposals/night-sights-2026-10-19). Their
// look only: the world says where a crab is and what it is doing (not yet: the eco side's, once main has answered),
// this draws it.
//  - The horned ghost crab (ツノメガニ, Ocypode ceratophthalmus), the pale crab that runs the Yaeyama beaches by night:
//    a squarish carapace about 4.5 cm across, the colour of dry sand, a little paler at its edges; long eyestalks
//    standing up from the front corners, black eyes with a short horn (the style) above each; one claw larger than the
//    other, white-tipped; four pairs of long walking legs splayed out to the sides. It runs sideways (along x).
//  - The coconut crab (ヤシガニ, Birgus latro), the great land hermit crab that climbs the pandanus and palms by night:
//    a heavy carapace about 10 cm long, deep purple-brown to rust (one to another), its soft abdomen curled under it;
//    short eyestalks; long antennae sweeping forward; the left claw the larger, both massive; three pairs of thick
//    walking legs (the fourth, small, tucked away). It walks forward, slowly.
//  - Head at +z, the body's middle over the origin, the feet on y = 0; metres. Posed in the vertex shader from aCr
//    (gait phase, speed 0..1 — 0 standing, 1 at its quickest —, sunk 0..1 — 0 on the sand, 1 gone down its burrow —,
//    eyes 0..1 — 0 laid down, 1 raised) and aCr2 (seed, size, colour 0..1): the legs in an alternating gait, the body
//    raised a little when going fast.
//  - Far off (CRAB_LOD_M), legs and antennae thinner than a pixel would shimmer as the camera moves: there they are drawn
//    folded close to the body, so the crab is a shape with its outline only.
//  - A ghost crab's burrow mouth (makeBurrowLook): one round opening in the sand with the damp sand it threw out fanned
//    beside it — a darkening of whatever sand is there (drawn multiplied over it), soft-edged. One to a crab, never
//    a field of holes.
// Nothing here draws the island's random numbers: built only behind the lab knob for now (?crablook), every three.js
// object made inside quiet().
import * as THREE from 'three';
import { mat } from '../render/common';
import { AIRLIT, type TrunkLine } from './shore';
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
export type CrabKind = 'ghost' | 'coconut';

// aPart: 0 shell, 1 eyestalk or antennule, 2 eye, 3 claw, 4 walking leg, 5 claw's fingers, 6 antenna.
// aLeg: which walking leg (right 0–3, left 4–7; -1 none). aRoot: where the limb turns (its root on the body; for the
// eyes, the stalk's foot); aT: 0 at the root to 1 at the tip.
function kit() {
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
  const tube = (pts: number[][], r0: number, r1: number, part: number, leg: number, n = 5, flatY = 1, root = pts[0]) => {
    const segs = pts.length - 1;
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
  // a domed shell: half-width w, half-length l, dome height h, belly depth b, its middle y; squareness e (smaller: squarer);
  // side: how steep its sides fall (smaller: steeper, a ghost crab's squarish box; larger: a rounded oval)
  const shell = (w: number, l: number, h: number, b: number, y: number, e: number, z0 = 0, frontIn = 0, side = 0.35) => grid(16, 28, (uu, v) => {
    const a = v * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), top = uu < 0.5, k = top ? uu * 2 : (1 - uu) * 2;
    const sq = (q: number, p: number) => Math.sign(q) * Math.pow(Math.abs(q), p);
    const x = sq(c, e) * w * k ** side * (1 - frontIn * Math.max(0, s)), z = z0 + sq(s, e + 0.05) * l * k ** side;
    const dome = top ? h * Math.pow(Math.max(0, k), 0.6) * (1 - 0.25 * ((z - z0) / l) ** 2) : -b * Math.pow(Math.max(0, k), 0.8);
    return [x, y + dome, z];
  }, 0, -1, [0, y, 0], () => 0);
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
    g.setAttribute('aLeg', new THREE.Float32BufferAttribute(L, 1)); g.setAttribute('aRoot', new THREE.Float32BufferAttribute(RT, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  return { tube, shell, geo };
}
const lerp3 = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// the ghost crab: the carapace's middle this high over the sand when it stands
const GHOST_Y = 0.017;
function ghostGeo(): THREE.BufferGeometry {
  const K = kit(), Y = GHOST_Y;
  // the carapace: a squarish, gently domed shell, wider than long, its front edge straight between the eyes
  K.shell(0.0225, 0.019, 0.0085, 0.006, Y, 0.55);
  // the eyestalks: long, from the front corners up and a little out; a black eye along each stalk's top half, and the
  // short horn standing past it
  for (const sx of [-1, 1]) {
    const base = [sx * 0.012, Y + 0.006, 0.017], tip = [sx * 0.016, Y + 0.019, 0.019];
    K.tube([base, tip], 0.0022, 0.0018, 1, -1, 5);
    K.tube([lerp3(base, tip, 0.5), tip], 0.0031, 0.0029, 2, -1, 6, 1, base);
    K.tube([tip, [tip[0] + sx * 0.0008, tip[1] + 0.006, tip[2] - 0.0005]], 0.0009, 0.0004, 1, -1, 4, 1, base);
  }
  // the claws: folded before the mouth, the right one larger (as most are); arm, palm, and the two fingers
  for (const sx of [-1, 1]) {
    const big = sx > 0 ? 1.25 : 0.85, s0 = [sx * 0.014, Y - 0.002, 0.016], el = [sx * 0.026, Y + 0.001, 0.024], wr = [sx * 0.017, Y - 0.002, 0.032];
    K.tube([s0, el, wr], 0.0032 * big, 0.0036 * big, 3, -1, 6);
    K.tube([wr, [sx * 0.008, Y - 0.003, 0.034]], 0.0055 * big, 0.004 * big, 3, -1, 7, 0.7);
    K.tube([[sx * 0.008, Y - 0.003, 0.034], [sx * 0.001, Y - 0.004, 0.033]], 0.0028 * big, 0.0008, 5, -1, 5, 0.7);
  }
  // the walking legs: three joints each, out to the side and down to the sand, the tips pointed
  const ROOTS = [[0.019, 0.009], [0.021, 0.002], [0.02, -0.006], [0.017, -0.013]], REACH = [0.046, 0.054, 0.052, 0.042];
  for (const sx of [-1, 1]) ROOTS.forEach(([rx, rz], k) => {
    const leg = (sx > 0 ? 0 : 4) + k, R = REACH[k], sp = (k - 1.5) * 0.35;   // (spread: the front legs reach forward, the back ones back)
    const root = [sx * rx, Y - 0.001, rz];
    K.tube([root, [sx * (rx + R * 0.5), Y + 0.012, rz + Math.sin(sp) * R * 0.45], [sx * (rx + R * 0.82), Y - 0.002, rz + Math.sin(sp) * R * 0.7], [sx * (rx + R), 0.0005, rz + Math.sin(sp) * R * 0.85]], 0.0026, 0.0012, 4, leg, 5, 0.75);
  });
  return K.geo();
}

// the coconut crab stands higher, on thick legs
const COCO_Y = 0.055;
function coconutGeo(): THREE.BufferGeometry {
  const K = kit(), Y = COCO_Y;
  // the carapace: longer than wide, narrowing to the front, high-domed; the soft abdomen curled under behind it
  K.shell(0.046, 0.056, 0.024, 0.012, Y, 0.8, 0.005, 0.22, 0.7);
  K.shell(0.03, 0.034, 0.008, 0.014, Y - 0.026, 0.85, -0.045, 0, 0.8);
  // the eyestalks short and stout, the eyes dark at their ends; between them the short antennules, and the long
  // antennae sweeping forward and out
  for (const sx of [-1, 1]) {
    const base = [sx * 0.01, Y + 0.012, 0.052], tip = [sx * 0.014, Y + 0.03, 0.06];
    K.tube([base, tip], 0.0045, 0.004, 1, -1, 6);
    K.tube([lerp3(base, tip, 0.65), tip], 0.0058, 0.0055, 2, -1, 7, 1, base);
    K.tube([[sx * 0.004, Y + 0.006, 0.055], [sx * 0.008, Y + 0.03, 0.075], [sx * 0.01, Y + 0.04, 0.085]], 0.0016, 0.0012, 1, -1, 4);
    K.tube([[sx * 0.016, Y + 0.004, 0.052], [sx * 0.05, Y + 0.03, 0.12], [sx * 0.09, Y + 0.035, 0.2], [sx * 0.13, Y + 0.02, 0.26]], 0.0026, 0.0009, 6, -1, 4);
  }
  // the claws: massive, folded before the mouth, the left one the larger
  for (const sx of [-1, 1]) {
    const big = sx < 0 ? 1.2 : 0.9, s0 = [sx * 0.03, Y - 0.012, 0.04], el = [sx * 0.075, Y + 0.004, 0.075], wr = [sx * 0.05, Y - 0.018, 0.12];
    K.tube([s0, el, wr], 0.011 * big, 0.012 * big, 3, -1, 8);
    K.tube([wr, [sx * 0.028, Y - 0.026, 0.15]], 0.019 * big, 0.014 * big, 3, -1, 9, 0.75);
    K.tube([[sx * 0.028, Y - 0.026, 0.15], [sx * 0.006, Y - 0.03, 0.165]], 0.01 * big, 0.003, 5, -1, 7, 0.7);
  }
  // three pairs of walking legs, thick, three joints each, the tips dark and pointed
  const ROOTS = [[0.036, 0.022], [0.04, 0.0], [0.036, -0.022]], REACH = [0.19, 0.21, 0.18];
  for (const sx of [-1, 1]) ROOTS.forEach(([rx, rz], k) => {
    const leg = (sx > 0 ? 0 : 4) + k, R = REACH[k], sp = (k - 1) * 0.5;
    const root = [sx * rx, Y - 0.008, rz];
    K.tube([root, [sx * (rx + R * 0.45), Y + 0.04, rz + Math.sin(sp) * R * 0.4], [sx * (rx + R * 0.78), Y + 0.01, rz + Math.sin(sp) * R * 0.65], [sx * (rx + R), 0.001, rz + Math.sin(sp) * R * 0.8]], 0.012, 0.0055, 4, leg, 6, 0.8);
  });
  return K.geo();
}

// each kind's colours: the shell (and a second, for one to another), its edge, the claws' fingers; and how deep its
// burrow takes it
const KIND = {
  ghost: { geo: ghostGeo, base: [0.74, 0.68, 0.53], alt: [0.83, 0.79, 0.67], edge: 1.12, tip: [0.93, 0.92, 0.88], legTip: 0, eyeUp: GHOST_Y + 0.006, eyeZ: 0.017, eyeX: 0.012, sink: 0.06, nose: 0, lift: 0.004 },
  coconut: { geo: coconutGeo, base: [0.3, 0.17, 0.24], alt: [0.5, 0.24, 0.13], edge: 1.25, tip: [0.08, 0.06, 0.06], legTip: 0.55, eyeUp: COCO_Y + 0.012, eyeZ: 0.052, eyeX: 0.01, sink: 0.17, nose: 0.55, lift: 0.006 },
} as const;

function crabMat(kind: CrabKind): THREE.Material {
  const k = KIND[kind];
  return mat(
    `attribute float aPart; attribute float aLeg; attribute vec3 aRoot; attribute float aT; attribute vec4 aCr; attribute vec4 aCr2;
     uniform float uLod; uniform float uSink; uniform float uLift; uniform float uNose; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vCr2; varying float vT;
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
         // (far off, and going down into its hole or coming up out of it: folded close in under the body)
         q = mix(q, q * vec3(0.35, 0.6, 0.6) + vec3(0.0, 0.004, 0.0), max(far, smoothstep(0.0, 0.35, sunk)));
         p = aRoot + q; nl = m;
       }
       // the antennae, far off: drawn in short along themselves
       float ant = step(5.5, aPart);
       p = mix(p, aRoot + (p - aRoot) * 0.3, ant * far);
       // the eyestalks laid down outward along the front edge (into their grooves), or raised (alert, or going)
       float stalk = step(0.5, aPart) * step(aPart, 2.5), sx = sign(position.x);
       vec3 eb = vec3(sx * ${k.eyeX.toFixed(3)}, ${k.eyeUp.toFixed(3)}, ${k.eyeZ.toFixed(3)});
       float down = -sx * (1.0 - aCr.w) * 1.25;
       p = mix(p, eb + rz(p - eb, down), stalk); nl = mix(nl, rz(nl, down), stalk);
       // the body: raised a little when going fast; gone down its burrow as it sinks (the sand hides what is under it) — a
       // coconut crab tipped nose-up as it goes, so that it comes out of its den front first, eyes, antennae and claws
       float nose = sunk * uNose, ct = cos(nose), st = sin(nose);
       p = vec3(p.x, p.y * ct + p.z * st, -p.y * st + p.z * ct); nl = vec3(nl.x, nl.y * ct + nl.z * st, -nl.y * st + nl.z * ct);
       p.y += run * uLift - sunk * uSink;
       vec4 wp = mm * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(mm) * nl); vL = position; vPart = aPart; vCr2 = aCr2; vT = aT;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    AIRLIT + `uniform vec3 uBase; uniform vec3 uAlt; uniform float uEdge; uniform vec3 uTip; uniform float uLegTip; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart; varying vec4 vCr2; varying float vT;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       // the shell's colour (one to another), lighter to its edges and on the legs' joints; the claws' fingers their own
       // colour, the eyes black
       vec3 base = mix(uBase, uAlt, vCr2.z);
       float shellP = step(vPart, 0.5), edge = smoothstep(0.4, 1.0, length(vL.xz) / max(0.001, length(vL.xz) + 0.02));
       vec3 alb = base * mix(0.92, uEdge, edge * shellP);
       float leg = step(3.5, vPart) * step(vPart, 4.5);
       alb = mix(alb, base * mix(uEdge, 0.85, vT) * (1.0 - uLegTip * smoothstep(0.86, 1.0, vT)), leg);   // (a coconut crab's leg tips dark)
       float finger = step(4.5, vPart) * step(vPart, 5.5);
       alb = mix(alb, mix(base, uTip, smoothstep(0.1, 0.8, vT)), finger);
       float eye = step(1.5, vPart) * step(vPart, 2.5);
       alb = mix(alb, vec3(0.03, 0.03, 0.035), eye);
       vec3 col = airLit(alb, n, vWp, 0.4);
       vec3 H = normalize(uAirSun + V);
       col += sunAirCol() * pow(max(dot(n, H), 0.0), mix(18.0, 90.0, eye)) * mix(0.06, 0.6, eye) * (1.0 - 0.7 * uCloud);
       col = fogIt(col, vWp);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uLod: { value: CRAB_LOD_M }, uSink: { value: k.sink }, uNose: { value: k.nose }, uLift: { value: k.lift }, uBase: { value: new THREE.Vector3(...k.base) }, uAlt: { value: new THREE.Vector3(...k.alt) }, uEdge: { value: k.edge }, uLegTip: { value: k.legTip }, uTip: { value: new THREE.Vector3(...k.tip) } }, opts: { side: THREE.DoubleSide } });
}

export interface CrabPose {
  kind: CrabKind; id: string; x: number; z: number; y: number;
  /** which way its head points on the sand (rad, as a yaw) */
  head: number; phase: number; run: number; sunk: number; eyes: number;
  /** clinging to something upright (a trunk): the way out from its surface where the crab is, and the way its head
   *  points along that surface (both unit vectors; head up a trunk: [0, 1, 0]). Absent: on the sand, by `head`. */
  on?: { n: [number, number, number]; fwd: [number, number, number] };
}
/** Up to `cap` crabs of each kind, drawn from `poses` each frame (the world's, once there is one: today only the lab
 *  knob's). */
export function makeCrabLook(parent: THREE.Group, cap = 16) {
  return quiet('crab-look', () => {
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
    const sets = (Object.keys(KIND) as CrabKind[]).map((kind) => {
      const geo = KIND[kind].geo();
      const aCr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), aCr2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      aCr.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aCr', aCr); geo.setAttribute('aCr2', aCr2);
      const mesh = new THREE.InstancedMesh(geo, crabMat(kind), cap); mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.name = `crab-look/${kind}`; parent.add(mesh);
      return { kind, mesh, aCr, aCr2 };
    });
    function show(poses: CrabPose[]) {
      for (const S of sets) {
        let n = 0;
        for (const c of poses) {
          if (c.kind !== S.kind || n >= cap) continue;
          const size = 0.85 + 0.3 * u(c.id, 'size');
          if (c.on) {   // (its back out from the surface, its head along it: the crab's own y and z)
            _y.set(...c.on.n); _z.set(...c.on.fwd); _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y);
            _m.makeBasis(_x, _y, _z).scale(_s.set(size, size, size)).setPosition(c.x, c.y, c.z);
          } else { _e.set(0, c.head, 0); _q.setFromEuler(_e); _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(size, size, size)); }
          S.mesh.setMatrixAt(n, _m);
          S.aCr.setXYZW(n, c.phase, c.run, c.sunk, c.eyes); S.aCr2.setXYZW(n, u(c.id, 'seed'), size, u(c.id, 'colour'), 0); n++;
        }
        S.mesh.count = n; S.mesh.instanceMatrix.needsUpdate = true; S.aCr.needsUpdate = true; S.aCr2.needsUpdate = true;
      }
    }
    return { mesh: sets[0].mesh, meshes: sets.map((S) => S.mesh), show };
  });
}

/** A ghost crab's burrow mouth: one round opening, about 4 cm across, sloping in, and the damp sand thrown out fanned
 *  on one side — drawn multiplied over the sand, so it is the sand there made darker, whatever its colour. A coconut
 *  crab's den (kind 'coconut': its hole at the foot of a pandanus, ADR 0009): a wider, deeper opening, about 14 cm across,
 *  with no thrown-out sand, there by day too. */
export interface BurrowPose { x: number; z: number; y: number; dir: number; id: string; kind?: 'ghost' | 'coconut' }
const DEN_SCALE = 3;
export function makeBurrowLook(parent: THREE.Group, cap = 24) {
  return quiet('burrow-look', () => {
    const geo = new THREE.PlaneGeometry(0.22, 0.22, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 0.04);
    const m = mat(
      `attribute float aDen; varying vec2 vP; varying vec3 vWp; varying float vDen; void main(){ vP = position.xz; vDen = aDen; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      `varying vec2 vP; varying vec3 vWp; varying float vDen;
       void main(){
         float d = length(vP);
         // the opening: dark in its throat, sloping in to a soft rim
         float hole = 1.0 - mix(0.82, 0.9, vDen) * (1.0 - smoothstep(0.008, 0.024, d));   // (a den: darker in its throat)
         // the thrown-out sand: a low fan beside it (along +z), damp and so a little darker, in soft streaks along its spread
         vec2 f = vec2(vP.x / 0.055, (vP.y - 0.06) / 0.05);
         float fan = (1.0 - smoothstep(0.55, 1.0, length(f))) * smoothstep(0.02, 0.035, d);
         float streak = 0.75 + 0.25 * sin(atan(vP.x, vP.y) * 9.0 + d * 40.0);
         float k = hole * (1.0 - 0.16 * fan * streak * (1.0 - vDen));   // (a den has no thrown-out sand)
         // (far off: let it go, before it is smaller than a pixel — a den, three times as wide, three times as far)
         float far = distance(uCamPos, vWp) / mix(1.0, ${DEN_SCALE.toFixed(1)}, vDen);
         k = mix(k, 1.0, smoothstep(9.0, 14.0, far));
         gl_FragColor = vec4(vec3(k), 1.0);
       }`,
      { opts: { transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } });
    const aDen = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); aDen.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aDen', aDen);
    const mesh = new THREE.InstancedMesh(geo, m, cap); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.name = 'burrow-look'; parent.add(mesh);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    function show(burrows: BurrowPose[]) {
      const n = Math.min(cap, burrows.length);
      for (let i = 0; i < n; i++) {
        const b = burrows[i], den = b.kind === 'coconut', sc = (0.85 + 0.3 * u(b.id, 'burrow')) * (den ? DEN_SCALE : 1);
        _e.set(0, b.dir, 0); _q.setFromEuler(_e); _m.compose(_p.set(b.x, b.y + 0.003, b.z), _q, _s.set(sc, 1, sc)); mesh.setMatrixAt(i, _m); aDen.setX(i, den ? 1 : 0);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; aDen.needsUpdate = true;
    }
    return { mesh, show };
  });
}

/** LAB: ?crablook — on the sand by Dot's home (test only, not the world's): four ghost crabs (one standing with its eyes
 *  up, one running back and forth sideways, one going down its burrow and coming out again, one with its eyes laid
 *  down), two burrow mouths (the one it goes down, and an empty one), a coconut crab's den with one coming up out of it
 *  and going down again, a coconut crab walking slowly to and fro, and one
 *  climbing up and down the nearest pandanus (on its trunk as drawn: ocean/shore.ts trunks).
 *  ?crablook=still holds them at one moment (mid-stride, half down the burrow), for tools/lab/flicker.cjs. */
export function crabLookTest(q: string): 'move' | 'still' | null { const m = /[?&]crablook(=still)?\b/.exec(q); return m ? (m[1] ? 'still' : 'move') : null; }
export function crabTestPoses(t: number, at: { x: number; z: number }, groundAt: (x: number, z: number) => number, trunk?: TrunkLine | null): { crabs: CrabPose[]; burrows: BurrowPose[] } {
  const crabs: CrabPose[] = [], burrows: BurrowPose[] = [];
  const put = (kind: CrabKind, id: string, dx: number, dz: number, head: number, phase: number, run: number, sunk: number, eyes: number) => {
    const x = at.x + dx, z = at.z + dz; crabs.push({ kind, id, x, z, y: groundAt(x, z), head, phase, run, sunk, eyes });
  };
  const hole = (id: string, dx: number, dz: number, dir: number, kind?: 'coconut') => { const x = at.x + dx, z = at.z + dz; burrows.push({ id, x, z, y: groundAt(x, z), dir, kind }); };
  put('ghost', 'test-still', 0, 0, 0.6, 0, 0, 0, 1);
  const s = Math.sin(t * 0.7);   // (back and forth: running sideways along its own x)
  put('ghost', 'test-run', 0.5 + Math.cos(0.2) * s * 0.6, 0.5 - Math.sin(0.2) * s * 0.6, 0.2, t * 22, Math.min(1, Math.abs(Math.cos(t * 0.7)) * 1.4), 0, 1);
  const b = 0.5 + 0.5 * Math.sin(t * 0.5);   // (down its burrow and out again)
  put('ghost', 'test-burrow', -0.4, 0.45, 2.4, t * 3, 0, Math.min(1, Math.max(0, b * 1.4 - 0.2)), 1);
  hole('test-burrow', -0.4, 0.45, 2.4); hole('test-empty', 0.35, -0.55, -0.7);
  put('ghost', 'test-flat', -0.3, -0.35, -0.9, 0, 0, 0, 0);
  // (a coconut crab's den, and one coming up out of it and going down again)
  const e = 0.5 + 0.5 * Math.sin(t * 0.4 - 0.88);   // (held, ?crablook=still: half way up out of its den)
  hole('test-den', -1.2, -0.6, 0.8, 'coconut'); put('coconut', 'test-den', -1.2, -0.6, 2.6, 0, 0, Math.min(1, Math.max(0, e * 1.3 - 0.15)), 1);
  // (the coconut crab walks forward, along its own z, slowly)
  const c = Math.sin(t * 0.15), hd = -1.9 + (Math.cos(t * 0.15) < 0 ? Math.PI : 0);
  put('coconut', 'test-coconut', 1.3 + Math.sin(-1.9) * c * 0.5, -0.9 + Math.cos(-1.9) * c * 0.5, hd, t * 4.5, Math.min(1, Math.abs(Math.cos(t * 0.15)) * 1.6) * 0.6, 0, 1);
  // (and one climbing the nearest pandanus, slowly up and down its drawn trunk, on the side towards the worksite)
  if (trunk) {
    const ax = trunk.top.clone().sub(trunk.base), len = ax.length(); ax.normalize();
    const f = 0.3 + 0.25 * (1 + Math.sin(t * 0.12)), up = Math.cos(t * 0.12) >= 0, c = trunk.base.clone().addScaledVector(ax, len * f);
    const n = new THREE.Vector3(at.x - c.x, 0, at.z - c.z); n.addScaledVector(ax, -n.dot(ax)).normalize();   // (out from the trunk, square to it)
    const p = c.addScaledVector(n, trunk.r0 + (trunk.r1 - trunk.r0) * f), fw = up ? ax : ax.clone().negate();
    crabs.push({ kind: 'coconut', id: 'test-climb', x: p.x, z: p.z, y: p.y, head: 0, phase: t * 3, run: Math.abs(Math.cos(t * 0.12)) * 0.5, sunk: 0, eyes: 1, on: { n: [n.x, n.y, n.z], fwd: [fw.x, fw.y, fw.z] } });
  }
  return { crabs, burrows };
}
