// What the husk-and-cord work leaves at a worksite, as it looks (nature team, 2026-10-17; owner's decision: the shell
// and cord work is in the 24-hour stream). The world says what is there and in which state it looks (WorksiteLook,
// built by the host from the science side's public readings and observations); this only draws it.
//  - First piece: the fibre bundle beaten out of a soaked husk — wet (dark chestnut, heavy, lying close and a little
//    glossy) or dry (pale golden tan, springy, the ends standing apart).
//  - Nothing here reads a hidden value (strength, water, mass, count): only kind and look.
//  - Each bundle's own small differences (turn, length, lean) come from its id, never from Math.random or the
//    island's stream. Every three.js object is made inside `quiet()`, which lends three.js a stream of its own for the
//    ids it draws — so adding this look leaves the world's random draws, and the count of them, as they were.
// Test knob: ?coirlook=wet|dry|both lays a test worksite by Dot's home (LAB; the host's WorksiteLook replaces it).
import * as THREE from 'three';
import { mat } from '../render/common';
import { AIRLIT } from '../ocean/shore';
import { draw } from '../science/rng';

import { WORKSITE_LOOK_FIXTURES, type WorksiteLook } from '../world/worksite-look';

const SEED = 0x6c6f6f6b;   // 'look'
const u = (id: string, ...k: string[]) => draw(SEED, id, 'look', ...k);

// three.js draws Math.random for every id it gives (four per uuid). Made in here, those draws come from a stream of the
// look's own, keyed by what is being made, and the world's Math.random is handed back untouched.
let made = 0;
function quiet<T>(what: string, f: () => T): T {
  const keep = Math.random; let n = 0; const key = `${what}#${made++}`;
  Math.random = () => draw(SEED, 'three-ids', key, String(n++));
  try { return f(); } finally { Math.random = keep; }
}

/* ---------- the bundle's shape: a hank of coarse fibres lying along x, about 34 cm long ---------- */
// Each fibre a narrow ribbon (wide enough not to shimmer at the stream's distance: a few millimetres), bent along a
// gentle curve; the bundle's cross-section a soft lens. Wet: drawn close and sagging to the ground. Dry: the middle
// still gathered, the ends standing apart and lifting a little, each fibre with its own slight wave.
// Far off (LOD_M and on) the same hank drawn with a few wide strands: fibres thinner than a pixel at the stream's distance
// would shimmer as the camera drifts (tools/lab/flicker.cjs).
const FIBRES = 72, FAR_FIBRES = 14, SEGS = 9, LOD_M = 3.5;
function bundleGeo(dry: boolean, far = false): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let f = 0; f < (far ? FAR_FIBRES : FIBRES); f++) {
    const r = (k: string) => u('fibre-shape', dry ? 'dry' : 'wet', String(f), k);
    const L = 0.3 + 0.08 * r('len'), a = r('ang') * Math.PI * 2, rad = Math.sqrt(r('rad'));
    const y0 = (dry ? 0.04 : 0.024) * (0.25 + 0.75 * rad) * (0.6 + 0.4 * Math.sin(a)) + 0.004;   // (a soft lens: more fibres low down)
    const z0 = (dry ? 0.045 : 0.04) * rad * Math.cos(a);
    const w = (dry ? 0.007 : 0.009) * (far ? 3.5 : 1), tone = 0.8 + 0.4 * r('tone'), x0 = (r('off') - 0.5) * 0.05;
    const wave = dry ? 0.006 + 0.006 * r('wave') : 0.0015, ph = r('ph') * 6.28;
    const base = pos.length / 3;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS, x = x0 + (t - 0.5) * L, e = Math.abs(t - 0.5) * 2;   // e: 0 at the middle, 1 at an end
      const spread = dry ? 1 + 1.6 * e * e : 1 + 0.25 * e * e;   // (dry ends stand apart; wet stay close)
      const y = Math.max(0.002, y0 * (dry ? 1 + 0.5 * e * e : 1 - 0.55 * e * e)) + Math.sin(t * 9 + ph) * wave * (dry ? 1 : 0.4);
      const z = z0 * spread + Math.cos(t * 7 + ph) * wave;
      for (const side of [-1, 1]) {
        pos.push(x, y, z + side * w * 0.5);
        col.push(tone, tone * (0.97 + 0.06 * t), tone);
      }
      if (s < SEGS) { const i = base + s * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aIn', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(1), 1)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- a piece of coconut husk: a thick curved wedge of the shell, lying rind-up, about 22 cm long ---------- */
// Outside the rind (aIn 0), inside and along the cut edges the fibrous husk (aIn 1). Soaked whole ('wet-husk'): thick,
// lying rind-up. Beaten ('partial-husk'): thinner, lying open side up — its inside scored along its length where the
// fibre was beaten out (streaks drawn in the shader) — and a fringe of loose fibres at its edges, only near (LOD_M).
// About 26 cm long.
function huskGeo(partial: boolean, fringe = false): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], inn: number[] = [], idx: number[] = [];
  const A = 0.13, Bv = 0.06, C = 0.07, P0 = 0.12 * Math.PI, P1 = 0.88 * Math.PI, T = 0.85, NU = 10, NV = 14;
  const k = partial ? 0.74 : 0.6;   // (the inner surface: the thinner the shell, the more beaten out)
  const at = (u: number, v: number, s: number) => { const ph = P0 + (P1 - P0) * v, th = (u * 2 - 1) * T; return [A * Math.cos(ph) * (s > 0.99 ? 1 : 0.96), Bv * Math.sin(ph) * Math.cos(th) * s, C * Math.sin(ph) * Math.sin(th) * s]; };
  const y0 = Bv * Math.sin(P0) * Math.cos(T) * k;   // (rind-up, it rests on its lowest edge; open side up, on its rind)
  const lift = (y: number) => partial ? Bv - y : y - y0 * 0.6;
  const push = (p: number[], inside: number, tone: number, raw = true) => { pos.push(p[0], raw ? lift(p[1]) : p[1], p[2]); col.push(tone, tone, tone); inn.push(inside); return pos.length / 3 - 1; };
  if (!fringe) {
    for (const [s, inside] of [[1, 0], [k, 1]] as [number, number][]) {   // the rind, then the fibrous inside
      const b = pos.length / 3;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) push(at(i / NU, j / NV, s), inside, 0.92 + 0.16 * u('husk', partial ? 'p' : 'w', String(i), String(j)));
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = b + j * (NU + 1) + i; inside ? idx.push(a, a + 1, a + NU + 1, a + 1, a + NU + 2, a + NU + 1) : idx.push(a, a + NU + 1, a + 1, a + 1, a + NU + 1, a + NU + 2); }
    }
    // the cut edges all round, joining rind to inside (fibrous)
    const rim: [number, number][] = [];
    for (let i = 0; i <= NU; i++) rim.push([i / NU, 0]); for (let j = 1; j <= NV; j++) rim.push([1, j / NV]);
    for (let i = NU - 1; i >= 0; i--) rim.push([i / NU, 1]); for (let j = NV - 1; j >= 1; j--) rim.push([0, j / NV]);
    for (let r = 0; r < rim.length; r++) {
      const [ua, va] = rim[r], [ub, vb] = rim[(r + 1) % rim.length];
      const a = push(at(ua, va, 1), 1, 1), b = push(at(ub, vb, 1), 1, 1), c = push(at(ub, vb, k), 1, 1), d = push(at(ua, va, k), 1, 1);
      idx.push(a, b, c, a, c, d);
    }
  } else {
    // loose fibres hanging from the long edges, splaying out and down to the sand (narrow ribbons, as the bundles')
    for (let f = 0; f < 40; f++) {
      const r = (q: string) => u('husk-fringe', String(f), q), side = f % 2 ? 1 : -1, v = 0.1 + 0.8 * r('v');
      const e = at(side > 0 ? 1 : 0, v, (1 + k) / 2), ey = lift(e[1]), L = 0.05 + 0.06 * r('len'), w = 0.004, b = pos.length / 3;
      const dx = (r('dx') - 0.5) * 0.4, dz = side * (0.6 + 0.4 * r('dz'));
      for (let s2 = 0; s2 <= 4; s2++) {
        const t = s2 / 4, p = [e[0] + dx * L * t, Math.max(0.002, ey - t * t * 0.06), e[2] + dz * L * t];   // (out and down to the sand)
        push([p[0] - w * 0.5, p[1], p[2]], 1, 0.9 + 0.2 * r('tone'), false); push([p[0] + w * 0.5, p[1], p[2]], 1, 0.9 + 0.2 * r('tone'), false);
        if (s2 < 4) { const i = b + s2 * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aIn', new THREE.Float32BufferAttribute(inn, 1)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- the material: lit as the residents' things are (the island's air light), wet glossier ---------- */
// uFar: 0 drawn only near (closer than LOD_M), 1 only far, -1 always. Near and far each hold every thing of theirs; each
// keeps only its own side of LOD_M from the camera, the other's collapsed out of view — chosen per thing in the vertex
// shader, with no work on the CPU each frame. uStreak: the scored inside of a beaten husk (long, soft streaks along it).
type Tone = { out: number; inn: number; spec: number; streak?: number };
function thingMat(t: Tone, far: number): THREE.Material {
  return mat(
    `uniform float uFar; uniform float uLod; attribute vec3 color; attribute float aIn; varying vec3 vWp; varying vec3 vN; varying vec3 vC; varying float vIn; varying vec3 vLp;
     void main(){ mat4 mm = modelMatrix;
       #ifdef USE_INSTANCING
       mm = mm * instanceMatrix;
       #endif
       vec4 w = mm * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(mm) * normal); vC = color; vIn = aIn; vLp = position; gl_Position = projectionMatrix * viewMatrix * w;
       float isFar = step(uLod, distance(uCamPos, (mm * vec4(0.0, 0.0, 0.0, 1.0)).xyz));
       if (uFar > -0.5 && abs(isFar - uFar) > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,
    AIRLIT + `uniform vec3 uOut; uniform vec3 uIn; uniform float uSpec; uniform float uStreak; varying vec3 vWp; varying vec3 vN; varying vec3 vC; varying float vIn; varying vec3 vLp;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (!gl_FrontFacing) n = -n;
       if (n.y < 0.0) n = normalize(n + vec3(0.0, 0.8, 0.0));   // (a fibre's underside still faces the thing's own light)
       // (streaks along the length: soft bands, faded where they would be finer than a pixel)
       float sc = vLp.z * 160.0, aa = clamp(1.0 - length(fwidth(vLp)) * 160.0 * 0.6, 0.0, 1.0);
       float streak = 1.0 - uStreak * vIn * aa * (0.5 + 0.5 * sin(sc + sin(vLp.x * 40.0) * 1.5));
       vec3 alb = mix(uOut, uIn, vIn) * vC * streak;
       vec3 col = airLit(alb, n, vWp, 0.45);
       col += alb * sunAirCol() * max(uAirSun.y, 0.0) * 0.12;   // light thrown back up by the sand
       vec3 H = normalize(uAirSun + V);
       col += sunAirCol() * pow(max(dot(n, H), 0.0), 24.0) * uSpec * (1.0 - 0.7 * uCloud);   // wet: a soft sheen
       col = fogIt(col, vWp);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uOut: { value: new THREE.Color(t.out) }, uIn: { value: new THREE.Color(t.inn) }, uSpec: { value: t.spec }, uStreak: { value: t.streak ?? 0 }, uFar: { value: far }, uLod: { value: LOD_M } }, opts: { side: THREE.DoubleSide } });
}

// what each kind looks like in each of its states, and how wide it lies (for laying them side by side)
const TONES: Record<string, Tone> = {
  'fiber-bundle/wet': { out: 0x3a271a, inn: 0x3a271a, spec: 0.7 }, 'fiber-bundle/dry': { out: 0xa98052, inn: 0xa98052, spec: 0.05 },
  'wet-husk/wet': { out: 0x3b2a1c, inn: 0x4a2c1a, spec: 0.25 }, 'wet-husk/dry': { out: 0x7a6248, inn: 0x9a6c42, spec: 0.08 },
  'partial-husk/wet': { out: 0x3b2a1c, inn: 0x5a3820, spec: 0.25, streak: 0.22 }, 'partial-husk/dry': { out: 0x7a6248, inn: 0xb0844f, spec: 0.06, streak: 0.18 },
};
const WIDE: Record<string, number> = { 'fiber-bundle': 0.16, 'wet-husk': 0.2, 'partial-husk': 0.24 };
const CAP = 12;   // of each kind and look, over all worksites

export function makeCoirLook(parent: THREE.Group, groundAt: (x: number, z: number) => number) {
  // per kind/look: the meshes that together draw it (each holding every one of them; see thingMat)
  const built = quiet('coir-look', () => {
    const group = new THREE.Group(); group.name = 'coir-look'; parent.add(group);
    const mk = (g: THREE.BufferGeometry, t: Tone, far: number) => { const m = new THREE.InstancedMesh(g, thingMat(t, far), CAP); m.count = 0; m.frustumCulled = false; group.add(m); return m; };
    const sets: Record<string, THREE.InstancedMesh[]> = {};
    for (const look of ['wet', 'dry']) {
      const dry = look === 'dry';
      sets[`fiber-bundle/${look}`] = [mk(bundleGeo(dry), TONES[`fiber-bundle/${look}`], 0), mk(bundleGeo(dry, true), TONES[`fiber-bundle/${look}`], 1)];
      sets[`wet-husk/${look}`] = [mk(huskGeo(false), TONES[`wet-husk/${look}`], -1)];
      sets[`partial-husk/${look}`] = [mk(huskGeo(true), TONES[`partial-husk/${look}`], -1), mk(huskGeo(true, true), TONES[`partial-husk/${look}`], 0)];
    }
    return { group, sets };
  });
  const { group, sets } = built;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  /** Lay out what each worksite has. `where` gives a worksite's spot on the ground ([x, z] and which way it faces);
   *  sites it does not know are not drawn. Drawn so far: fibre bundles, soaked husks and beaten husks, each wet or dry
   *  (the other kinds and looks are skipped: yarn and cord come next). */
  function set(looks: WorksiteLook[], where: (siteId: string) => { x: number; z: number; face: number } | null) {
    for (const ms of Object.values(sets)) for (const m of ms) m.count = 0;
    for (const site of looks) {
      const at = where(site.siteId); if (!at) continue;
      const shown = site.items.filter((it) => sets[`${it.kind}/${it.look}`]);
      const width = shown.reduce((w, it) => w + WIDE[it.kind], 0);
      let off = -width / 2;
      for (const it of shown) {
        const ms = sets[`${it.kind}/${it.look}`], w = WIDE[it.kind]; off += w / 2;
        if (ms[0].count < CAP) {
          // (side by side across the worksite, as they would be laid down; each its own small turn and size)
          const j = (u(it.id, 'jit') - 0.5) * 0.04;
          const x = at.x + Math.cos(at.face) * off - Math.sin(at.face) * j, z = at.z - Math.sin(at.face) * off - Math.cos(at.face) * j;
          _e.set(0, at.face + Math.PI / 2 + (u(it.id, 'turn') - 0.5) * (it.kind === 'fiber-bundle' ? 0.35 : 0.8), 0); _q.setFromEuler(_e);
          const sc = 0.9 + 0.2 * u(it.id, 'size');
          _m.compose(_p.set(x, groundAt(x, z), z), _q, _s.set(sc, sc, sc));
          const k = ms[0].count; for (const m of ms) { m.setMatrixAt(k, _m); m.count = k + 1; }
        }
        off += w / 2;
      }
    }
    for (const ms of Object.values(sets)) for (const m of ms) m.instanceMatrix.needsUpdate = true;
  }
  const counts = () => Object.fromEntries(Object.entries(sets).map(([k, ms]) => [k, ms[0].count]));
  return { group, set, counts };
}

/** LAB: the test knob's worksite by Dot's home: ?coirlook=wet|dry — main's fixtures (WORKSITE_LOOK_FIXTURES 'fiber-wet' /
 *  'fiber-dry'); ?coirlook=both — two bundles of each look side by side; ?coirlook=all — every kind drawn so far, wet
 *  and dry (a soaked husk, a beaten husk and a bundle of each). */
export function coirLookTest(q: string): WorksiteLook[] | null {
  const m = /[?&]coirlook=(wet|dry|both|all)/.exec(q); if (!m) return null;
  if (m[1] === 'wet' || m[1] === 'dry') return [WORKSITE_LOOK_FIXTURES[m[1] === 'wet' ? 'fiber-wet' : 'fiber-dry']];
  const list: [WorksiteLook['items'][number]['kind'], 'wet' | 'dry'][] = m[1] === 'both' ? [['fiber-bundle', 'wet'], ['fiber-bundle', 'wet'], ['fiber-bundle', 'dry'], ['fiber-bundle', 'dry']]
    : [['wet-husk', 'wet'], ['partial-husk', 'wet'], ['fiber-bundle', 'wet'], ['wet-husk', 'dry'], ['partial-husk', 'dry'], ['fiber-bundle', 'dry']];
  return [{ siteId: 'test', items: list.map(([kind, look], i) => ({ id: `test-${kind}-${i}`, kind, look })) }];
}
