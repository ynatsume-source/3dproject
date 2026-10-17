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

/** One thing at a worksite, as the host reports it (src/world/worksite-look.ts, when it lands: the same shape). */
export type LookItem = { id: string; kind: 'wet-husk' | 'partial-husk' | 'fiber-bundle' | 'yarn' | 'cord'; look: 'wet' | 'dry' | 'fuzzy' | 'smooth' | 'frayed' | 'broken' };
export type WorksiteLook = { siteId: string; items: LookItem[] };

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
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- its material: lit as the residents' things are (the island's air light), wet glossier ---------- */
// (near and far each hold every bundle; each keeps only its own side of LOD_M from the camera, the other's collapsed
// out of view — chosen per bundle in the vertex shader, with no work on the CPU each frame)
function bundleMat(dry: boolean, far: boolean): THREE.Material {
  return mat(
    `uniform float uFar; uniform float uLod; attribute vec3 color; varying vec3 vWp; varying vec3 vN; varying vec3 vC;
     void main(){ mat4 mm = modelMatrix;
       #ifdef USE_INSTANCING
       mm = mm * instanceMatrix;
       #endif
       vec4 w = mm * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(mm) * normal); vC = color; gl_Position = projectionMatrix * viewMatrix * w;
       float isFar = step(uLod, distance(uCamPos, (mm * vec4(0.0, 0.0, 0.0, 1.0)).xyz));
       if (abs(isFar - uFar) > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,
    AIRLIT + `uniform vec3 uCol; uniform float uSpec; varying vec3 vWp; varying vec3 vN; varying vec3 vC;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (!gl_FrontFacing) n = -n;
       if (n.y < 0.0) n = normalize(n + vec3(0.0, 0.8, 0.0));   // (a fibre's underside still faces the bundle's own light)
       vec3 alb = uCol * vC;
       vec3 col = airLit(alb, n, vWp, 0.45);   // (fibres let a little light through)
       col += alb * sunAirCol() * max(uAirSun.y, 0.0) * 0.12;   // light thrown back up by the sand
       vec3 H = normalize(uAirSun + V);
       col += sunAirCol() * pow(max(dot(n, H), 0.0), 40.0) * uSpec * (1.0 - 0.7 * uCloud);   // wet: a sheen along the fibres
       col = fogIt(col, vWp);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uCol: { value: new THREE.Color(dry ? 0xa98052 : 0x3a271a) }, uSpec: { value: dry ? 0.05 : 0.7 }, uFar: { value: far ? 1 : 0 }, uLod: { value: LOD_M } }, opts: { side: THREE.DoubleSide } });
}

const CAP = 12;   // bundles per look, over all worksites (a husk gives one; a day's work a few)

export function makeCoirLook(parent: THREE.Group, groundAt: (x: number, z: number) => number) {
  const built = quiet('coir-look', () => {
    const group = new THREE.Group(); group.name = 'coir-look'; parent.add(group);
    const mk = (dry: boolean, far: boolean) => { const m = new THREE.InstancedMesh(bundleGeo(dry, far), bundleMat(dry, far), CAP); m.count = 0; m.frustumCulled = false; group.add(m); return m; };
    return { group, wet: [mk(false, false), mk(false, true)], dry: [mk(true, false), mk(true, true)] };
  });
  const { group } = built, wet = built.wet[0], dry = built.dry[0], all = [...built.wet, ...built.dry];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  /** Lay out what each worksite has. `where` gives a worksite's spot on the ground ([x, z] and which way it faces);
   *  sites it does not know are not drawn. Only fibre bundles are drawn so far: the other kinds come next. */
  function set(looks: WorksiteLook[], where: (siteId: string) => { x: number; z: number; face: number } | null) {
    wet.count = 0; dry.count = 0;
    for (const site of looks) {
      const at = where(site.siteId); if (!at) continue;
      const fb = site.items.filter((it) => it.kind === 'fiber-bundle' && (it.look === 'wet' || it.look === 'dry'));
      fb.forEach((it, k) => {
        const m = it.look === 'dry' ? dry : wet; if (m.count >= CAP) return;
        // (side by side across the worksite, as they would be laid down; each its own small turn and size)
        const off = (k - (fb.length - 1) / 2) * 0.16, j = (u(it.id, 'jit') - 0.5) * 0.04;
        const x = at.x + Math.cos(at.face) * off - Math.sin(at.face) * j, z = at.z - Math.sin(at.face) * off - Math.cos(at.face) * j;
        _e.set(0, at.face + Math.PI / 2 + (u(it.id, 'turn') - 0.5) * 0.35, 0); _q.setFromEuler(_e);
        const sc = 0.9 + 0.2 * u(it.id, 'size');
        _m.compose(_p.set(x, groundAt(x, z), z), _q, _s.set(sc, sc, sc));
        const k2 = m.count++; for (const mm of it.look === 'dry' ? built.dry : built.wet) mm.setMatrixAt(k2, _m);
      });
    }
    built.wet[1].count = wet.count; built.dry[1].count = dry.count;
    for (const m of all) m.instanceMatrix.needsUpdate = true;
  }
  return { group, set, counts: () => ({ wet: wet.count, dry: dry.count }) };
}

/** LAB: the test knob's worksite (?coirlook=wet|dry|both): a few bundles laid on the sand by Dot's home. */
export function coirLookTest(q: string): WorksiteLook[] | null {
  const m = /[?&]coirlook=(wet|dry|both)/.exec(q); if (!m) return null;
  const looks: ('wet' | 'dry')[] = m[1] === 'both' ? ['wet', 'wet', 'dry', 'dry'] : m[1] === 'wet' ? ['wet', 'wet', 'wet'] : ['dry', 'dry', 'dry'];
  return [{ siteId: 'test', items: looks.map((look, i) => ({ id: `test-bundle-${i}`, kind: 'fiber-bundle', look })) }];
}
