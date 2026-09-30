// The island's residents: four robots living on Kayama-jima, each on its own. They charge in the sun,
// sleep, and get on with their own lives — Dot builds a hut of driftwood, Kamemaru watches the sea and
// swims the lagoon keeping records, Lantern walks the island by night mapping it and thinks on the
// hill, Rakko floats off the west beach cracking shells and piling up the pretty ones. When two of
// them happen to meet they stop and talk: a greeting the first time, then introductions, tips for
// island life, news of their day, and — once they have come to trust each other — their worries.
// Everything they do goes into their diaries; their lives carry on (and are saved) while nobody watches.
import * as THREE from 'three';
import { mat, U } from '../render/common';
import { AIRLIT } from '../ocean/shore';
import { robotKit, type Robot, type Act, type Mats } from './models';
import { VOICES, STAGES, type Voice } from './voices';
import type { Subject } from '../eco/env';
import { aiConverse, aiReady } from './mind';
import { makeItems, type Item, type ItemKind } from './items';

/* ---------- materials: lit by the sea's own sky, sun and water ---------- */
function rmat(hex: number, spec = 0.5, grid = false) {
  return mat(
    `varying vec3 vWp; varying vec3 vN; varying vec2 vUv;
     void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`,
    AIRLIT + `uniform vec3 uCol; uniform float uSpec; uniform float uGrid; varying vec3 vWp; varying vec3 vN; varying vec2 vUv;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp);
       vec3 alb = uCol;
       if (uGrid > 0.5) { vec2 g = fract(vUv * vec2(10.0, 6.0)); alb = mix(vec3(0.05, 0.08, 0.17), vec3(0.72, 0.75, 0.8), max(step(0.9, g.x), step(0.88, g.y))); }
       vec3 col;
       if (vWp.y > 0.0) {
         col = airLit(alb, n, vWp, 0.35);   // (light wraps a little round the curves)
         col += alb * sunAirCol() * max(uAirSun.y, 0.0) * (0.5 - 0.5 * n.y) * 0.3;   // warm light thrown back up by the sand
         vec3 H = normalize(uAirSun + V);
         col += sunAirCol() * pow(max(dot(n, H), 0.0), 70.0) * uSpec * 1.4 * (1.0 - 0.7 * uCloud);   // a glint of sun on the shell
         col += skyAir(reflect(-V, n), -1.0) * pow(1.0 - max(dot(n, V), 0.0), 4.0) * uSpec * 0.6;
         col = fogIt(col, vWp);
       } else col = shade(alb, vWp, n, 0.5);
       gl_FragColor = vec4(col, 1.0);
     }`, { uniforms: { uCol: { value: new THREE.Color(hex) }, uSpec: { value: spec }, uGrid: { value: grid ? 1 : 0 } } });
}
let MATS: Mats | null = null;
function mats(): Mats {
  return MATS ??= {
    shell: rmat(0xf0ece4, 0.8), accent: rmat(0xf08a3c, 0.5), teal: rmat(0x3f9a93, 0.4), joint: rmat(0x2b3035, 0.9),
    dark: rmat(0x0c1418, 1.2), panel: rmat(0x1c2a4a, 1.0, true), stone: rmat(0x8a8072, 0.1),
    glow: new THREE.MeshBasicMaterial({ color: 0x8ff6ff }), warm: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
  };
}

/* ---------- who lives where ---------- */
interface Spec { id: string; make: 'makeDot' | 'makeKame' | 'makeLantern' | 'makeOtter'; home: [number, number]; range: number; speed: number; swimSpeed: number; swims: boolean; nightOwl: boolean; scale: number; color: string; social: number }
const SPECS: Spec[] = [
  { id: 'dot', make: 'makeDot', home: [61, -145], range: 120, speed: 0.6, swimSpeed: 0, swims: false, nightOwl: false, scale: 1, color: '#ffd98a', social: 0.5 },
  { id: 'kame', make: 'makeKame', home: [333, 66], range: 140, speed: 0.28, swimSpeed: 0.5, swims: true, nightOwl: false, scale: 1, color: '#7fe0c0', social: 0.25 },
  { id: 'lantern', make: 'makeLantern', home: [405, -285], range: 420, speed: 0.8, swimSpeed: 0, swims: false, nightOwl: true, scale: 1, color: '#8ff6ff', social: 0.35 },
  { id: 'rakko', make: 'makeOtter', home: [-117, -290], range: 170, speed: 0.4, swimSpeed: 0.85, swims: true, nightOwl: false, scale: 1.25, color: '#f7a36b', social: 0.8 },
];

interface Task { kind: string; x: number; z: number; act: Act; dur: number; t: number; arrived: boolean; wet?: boolean; then?: string; data?: any }
interface Line { who: string; text: string }
interface Talk { a: Resident; b: Resident; lines: Line[]; i: number; t: number; stage: number; pending?: boolean; conv: number }
export interface Bond { stage: number; know: number; talks: number; last: number; toldWorry: number }
export interface Entry { at: number; text: string; who?: string; conv?: number; head?: boolean }   // (a line someone said, or the heading of a conversation)
export interface Resident {
  id: string; v: Voice; sp: Spec; model: Robot;
  pos: THREE.Vector3; head: number; battery: number; task: Task | null; walk: number; act: Act; wet: boolean;
  talk: Talk | null; saying: string; sayT: number;
  stats: { built: number; notes: number; shells: number; cracked: number; visited: number; cairns: number; wood: number; food: number; felled: number };
  today: string[];                        // what it did today (for small talk and its diary)
  diary: Entry[];
  subject: Subject; blocked: number;
  holding: '' | ItemKind | 'piece';       // what it has in its hands
  held: THREE.Mesh;
}
export interface Residents {
  list: Resident[]; bonds: Record<string, Bond>; talks: Entry[];
  group: THREE.Group;
  update(dt: number, ms: number, cam: THREE.Vector3): void;
  subjects(): Subject[];
  status(r: Resident): string;
  save(): void;
  focus(r: Resident | null): void;        // the one being watched: mark where it is heading
  bubbles(camera: THREE.Camera, w: number, h: number): void;
  onEvent: (kind: string, text: string, r: Resident) => void;
  onSay: (r: Resident, text: string) => void;   // someone starts saying something (for its voice)
  gibber(id: string, text: string): string;      // how it sounds in its own language
}

const pair = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);
// what their words sound like: each has its own few syllables, strung together as long as the sentence
const SYLL: Record<string, string[]> = {
  dot: ['ピ', 'ポ', 'パ', 'ピコ', 'プ', 'ペ', 'ポッ', 'ビ'],
  kame: ['もご', 'むぅ', 'ほぉ', 'ふも', 'ん', 'もぉ', 'ぬ'],
  lantern: ['りゅ', 'し', 'ふぇ', 'る', 'みぃ', 'ぽぅ', 'しゅ'],
  rakko: ['きゅ', 'ぷ', 'ぴ', 'きゃ', 'るる', 'ぷぃ', 'みゅ'],
};
export function gibber(id: string, text: string) {
  const sy = SYLL[id]; if (!sy) return '';
  let h = 7; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const words = Math.max(1, Math.min(6, Math.round(text.length / 7)));
  const out: string[] = [];
  for (let w = 0; w < words; w++) { let wd = ''; const n = 1 + (h % 3); for (let k = 0; k < n; k++) { h = (h * 1103515245 + 12345) >>> 0; wd += sy[h % sy.length]; } out.push(wd); }
  const end = /[？?]$/.test(text) ? '？' : /[！!]$/.test(text) ? '！' : '…';
  return out.join(' ') + end;
}
const pickOne = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rr = (a: number, b: number) => a + Math.random() * (b - a);
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const localHour = (ms: number) => (((ms / 3.6e6 + 9) % 24) + 24) % 24;
const dayK = (hr: number) => Math.min(1, Math.max(0, (hr - 6.3) / 0.8)) * Math.min(1, Math.max(0, (18.9 - hr) / 0.8));
const hhmm = (ms: number) => { const h = localHour(ms); return `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };

const KEY = 'seaglass.residents.v1';

export function makeResidents(loc: any, T: any, fishNames: string[], birdNames: string[]): Residents {
  const L = { h: (x: number, z: number) => loc.f(x, z) };
  const kit = robotKit(mats());
  const group = new THREE.Group();
  const cover = (x: number, z: number) => T.landCover?.(x, z) ?? { can: 0, sand: 1 };

  /* ---------- things they make ---------- */
  // Dot's hut: four posts, a frame, then roof slats of driftwood — one piece at a time
  const wood = rmat(0x8d7560, 0.1), wood2 = rmat(0x6f5a48, 0.1), shellM = rmat(0xf3e6d8, 0.6), stoneM = rmat(0x9a9186, 0.1);
  const hut = new THREE.Group(); group.add(hut);
  { const dh = SPECS.find((x) => x.id === 'dot')!.home; hut.position.set(dh[0] + 3, L.h(dh[0] + 3, dh[1] - 2), dh[1] - 2); hut.rotation.y = 0.4; hut.updateMatrixWorld(); }
  const HUT: THREE.Mesh[] = [];
  {
    const post = (x: number, z: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 7), wood); m.position.set(x, 0.85, z); return m; };
    for (const [x, z] of [[-0.9, -0.7], [0.9, -0.7], [0.9, 0.7], [-0.9, 0.7]]) HUT.push(post(x, z));
    for (const [x, z, ry, l] of [[0, -0.7, 0, 1.9], [0.9, 0, Math.PI / 2, 1.5], [0, 0.7, 0, 1.9], [-0.9, 0, Math.PI / 2, 1.5]] as number[][]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, l, 6), wood2); m.rotation.set(0, ry, Math.PI / 2); m.position.set(x, 1.66, z); HUT.push(m);
    }
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.17), k % 2 ? wood : wood2);
      m.position.set(0, 1.74 + Math.sin(k * 1.7) * 0.02, -0.72 + k * 0.16); m.rotation.z = (k % 3 - 1) * 0.03; HUT.push(m);
    }
    for (let k = 0; k < 6; k++) {   // then a bench and a low fence of stakes
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.7, 6), wood); m.position.set(-1.7 + k * 0.5, 0.3, 1.8); HUT.push(m);
    }
    HUT.forEach((m) => { m.visible = false; hut.add(m); });
  }
  // the workbench beside it (a stump and a plank), where each piece is shaped from a log; the next piece's
  // place shown as a faint outline while Dot works on it; the piece on its way from Dot's hands to its place
  const benchL = new THREE.Vector3(-2.3, 0, 1.3);
  const bench = new THREE.Group(); bench.position.copy(benchL); hut.add(bench);
  { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 9), wood2); st.position.y = 0.22; bench.add(st);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.3), wood); top.position.y = 0.47; bench.add(top); }
  const itemMat = { wood: rmat(0xb3a390, 0.1), shell: shellM, stone: stoneM };
  const benchLog = new THREE.Mesh(new THREE.BufferGeometry(), itemMat.wood); benchLog.position.y = 0.53; benchLog.visible = false; bench.add(benchLog);
  const benchPiece = new THREE.Mesh(new THREE.BufferGeometry(), wood); benchPiece.position.y = 0.53; benchPiece.visible = false; bench.add(benchPiece);
  const ghostM = new THREE.MeshBasicMaterial({ color: 0x8ff6ff, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false });
  const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostM); ghost.visible = false; hut.add(ghost);
  const flyer = new THREE.Mesh(new THREE.BufferGeometry(), wood); flyer.visible = false; group.add(flyer);
  const fly = { t: -1, k: 0, from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };
  const CHIPS = 24, chipsM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.012, 0.018), itemMat.wood, CHIPS); chipsM.count = 0; chipsM.frustumCulled = false; group.add(chipsM);
  const chips = Array.from({ length: CHIPS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9 }));
  let chipNext = 0;
  // a piece of the hut shown lying on the bench: its long side along the bench
  const lying = (m: THREE.Mesh, out: THREE.Mesh) => { out.geometry = m.geometry; out.material = m.material; out.rotation.set(0, 0, (m.geometry as any).type === 'CylinderGeometry' ? Math.PI / 2 : 0); };
  // Where a piece goes, in the world, and where to stand to fit it
  const _sw = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();
  function slotWorld(k: number) { hut.updateMatrixWorld(); HUT[k].matrixWorld.decompose(_sw, _sq, _ss); return _sw; }
  function slotStand(k: number): [number, number] {
    const w = slotWorld(k).clone(), c = hut.position, dx = w.x - c.x, dz = w.z - c.z, d = Math.hypot(dx, dz);
    const ux = d > 0.3 ? dx / d : Math.sin(hut.rotation.y), uz = d > 0.3 ? dz / d : Math.cos(hut.rotation.y);
    return [w.x + ux * 0.9, w.z + uz * 0.9];
  }
  const benchStand = (): [number, number] => { const w = hut.localToWorld(benchL.clone().add(new THREE.Vector3(0, 0, 0.6))); return [w.x, w.z]; };
  const reveal: { m: THREE.Mesh; t: number }[] = [];

  /* ---------- the homestead round the hut: young trees to fell, a field, the fire pit ---------- */
  const leafM = rmat(0x4f7a3a, 0.2), soilM = rmat(0x4a3527, 0.05), fruitM = rmat(0xe08a2e, 0.5), cropM = rmat(0x6a9a40, 0.2);
  const atHut = (x: number, z: number) => hut.localToWorld(new THREE.Vector3(x, 0, z));
  // young casuarinas on the ground Dot will clear for the field (the first three), and two more beyond
  const TREES = [[-0.4, 5.6], [1.9, 6.9], [-2.4, 7.3], [5.2, -2.6], [-4.8, -3.2]].map(([lx, lz], i) => {
    const w = atHut(lx, lz), g = new THREE.Group(); g.position.set(w.x, L.h(w.x, w.z), w.z); group.add(g);
    const pivot = new THREE.Group(); g.add(pivot);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.4, 7), wood2); trunk.position.y = 1.2; pivot.add(trunk);
    const crown = new THREE.Group(); crown.position.y = 2.3; pivot.add(crown);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.42 - k * 0.05, 8, 6), leafM); b.position.set(Math.sin(k * 2.1 + i) * 0.25, k * 0.28 - 0.3, Math.cos(k * 2.1 + i) * 0.25); b.scale.y = 0.8; crown.add(b); }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.18, 7), wood2); stump.position.y = 0.09; stump.visible = false; g.add(stump);
    const ok = L.h(w.x, w.z) > 0.35;
    if (!ok) g.visible = false;
    return { g, pivot, stump, x: w.x, z: w.z, ok, down: !ok, fallT: -1, dir: Math.random() * 6.28 };
  });
  // the field: six plots in two rows
  const PLOTS = [0, 1, 2, 3, 4, 5].map((i) => {
    const w = atHut(-1.3 + (i % 3) * 1.35, 5.3 + Math.floor(i / 3) * 1.45), y = L.h(w.x, w.z);
    const g = new THREE.Group(); g.position.set(w.x, y, w.z); g.rotation.y = hut.rotation.y; group.add(g);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 1.15), soilM); soil.position.y = 0.01; soil.visible = false; g.add(soil);
    const crops: THREE.Group[] = [];
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Group(); c.position.set((k % 2 - 0.5) * 0.55, 0.04, (Math.floor(k / 2) - 0.5) * 0.55); g.add(c);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), cropM); leaf.scale.set(1, 0.6, 1); leaf.position.y = 0.1; c.add(leaf);
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fruitM); fruit.position.set(0.1, 0.06, 0.05); fruit.name = 'fruit'; c.add(fruit);
      c.visible = false; crops.push(c);
    }
    return { g, soil, crops, x: w.x, z: w.z, ok: y > 0.35, s: 0, at: 0 };   // s: 0 wild, 1 tilled, 2 sown
  });
  const GROW = 36 * 3600e3;   // a day and a half from seed to harvest
  const growth = (pl: typeof PLOTS[0]) => (pl.s === 2 ? Math.min(1, (clockMs - pl.at) / GROW) : 0);
  function drawField() {
    for (const pl of PLOTS) {
      pl.soil.visible = pl.s >= 1;
      const g = growth(pl);
      pl.crops.forEach((c) => { c.visible = pl.s === 2; c.scale.setScalar(0.25 + 0.75 * g); c.getObjectByName('fruit')!.visible = g >= 1; });
    }
  }
  // the fire pit: a ring of stones and a stack of wood; lit in the evening
  const pitW = atHut(3.4, 2.8), PIT = new THREE.Vector3(pitW.x, L.h(pitW.x, pitW.z), pitW.z);
  const pit = new THREE.Group(); pit.position.copy(PIT); group.add(pit);
  for (let k = 0; k < 9; k++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), stoneM); const a = k / 9 * 6.28; st.position.set(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45); st.rotation.set(k, k * 2, 0); pit.add(st); }
  for (let k = 0; k < 3; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.6, 6), wood2); lg.rotation.set(1.2, k * 2.1, 0); lg.position.y = 0.12; pit.add(lg); }
  const flameM = [0xffb347, 0xff7a2a, 0xffe08a].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flames = [0, 1, 2, 3, 4].map((k) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 - k * 0.012, 0.5, 7, 1, true), flameM[k % 3]); f.position.set(Math.sin(k * 2.4) * 0.08, 0.35, Math.cos(k * 2.4) * 0.08); pit.add(f); return f; });
  const SPARKS = 16, sparksM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 4, 3), flameM[2], SPARKS); sparksM.count = 0; sparksM.frustumCulled = false; group.add(sparksM);
  const sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9 }));
  const seatAt = (i: number): [number, number] => { const a = i / 4 * 6.28 + 0.6; return [PIT.x + Math.cos(a) * 1.7, PIT.z + Math.sin(a) * 1.7]; };
  const fireHours = (hr: number) => hr >= 19.4 && hr < 21.1;   // lit
  const gatherHours = (hr: number) => hr >= 18.9 && hr < 21.0;  // on the way / sitting round it
  let fireK = 0, fireTalkT = 5, lastSpeaker = '', fireSaid = false, fireConv = 0, fireLines = 0;
  const fireUsed = new Set<string>();
  const atFire = new Set<string>();
  // Rakko's pile of shells on the beach; Lantern's cairns where it stopped to think
  const shellGeo = new THREE.SphereGeometry(0.05, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const pile = new THREE.InstancedMesh(shellGeo, shellM, 80); pile.count = 0; group.add(pile);
  const cairnGeo = new THREE.DodecahedronGeometry(0.16, 0);
  const cairns = new THREE.InstancedMesh(cairnGeo, stoneM, 60); cairns.count = 0; group.add(cairns);
  const cairnSpots: number[][] = [];   // [x, z, stones so far]

  /* ---------- the residents ---------- */
  const list: Resident[] = SPECS.map((sp) => {
    const model = (kit as any)[sp.make]() as Robot;
    model.root.scale.setScalar(sp.scale);
    group.add(model.root);
    const r: Resident = {
      id: sp.id, v: VOICES[sp.id], sp, model,
      pos: new THREE.Vector3(sp.home[0], L.h(sp.home[0], sp.home[1]), sp.home[1]), head: Math.random() * 6.28, battery: 0.8,
      task: null, walk: 0, act: 'idle', wet: false, talk: null, saying: '', sayT: 0,
      stats: { built: 0, notes: 0, shells: 0, cracked: 0, visited: 0, cairns: 0, wood: 0, food: 0, felled: 0 },
      today: [], diary: [], blocked: 0,
      subject: null as any, holding: '', held: new THREE.Mesh(new THREE.BufferGeometry(), wood),
    };
    r.held.visible = false; r.held.position.set(0, sp.id === 'rakko' ? 0.36 : 0.5, sp.id === 'rakko' ? 0.18 : 0.27); model.root.add(r.held);
    r.subject = { key: 'robot:' + sp.id, label: r.v.name, kind: 'robot', prio: 2.6, size: 1.0 * sp.scale, reach: 320,
      pos: () => r.pos, status: () => res.status(r), live: () => true, hold: undefined };
    return r;
  });
  const byId = Object.fromEntries(list.map((r) => [r.id, r]));
  const bonds: Record<string, Bond> = {};
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) bonds[pair(list[i].id, list[j].id)] = { stage: 0, know: 0, talks: 0, last: -1e12, toldWorry: 0 };
  const talks: Entry[] = [];
  const visited = new Set<string>();
  let clockMs = Date.now();

  // Dot's hut and Rakko's pile sit by their homes
  const pileAt = (i: number) => { const a = i * 2.4, d = 0.15 + Math.sqrt(i) * 0.09; return [byId.rakko.sp.home[0] + 2 + Math.cos(a) * d, byId.rakko.sp.home[1] + 1 + Math.sin(a) * d]; };

  /* ---------- where to go ---------- */
  function spot(near: [number, number], rad: number, ok: (x: number, z: number, h: number) => boolean, tries = 80): [number, number] | null {
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * rad, x = near[0] + Math.cos(a) * d, z = near[1] + Math.sin(a) * d;
      if (Math.abs(x) > 740 || Math.abs(z) > 740) continue;
      const h = L.h(x, z);
      if (ok(x, z, h)) return [x, z];
    }
    return null;
  }
  const open = (x: number, z: number, h: number) => h > 0.4 && cover(x, z).can < 0.3;
  const beach = (x: number, z: number, h: number) => h > 0.35 && h < 1.4 && cover(x, z).sand > 0.5;
  // the beach proper: water within a few steps
  const shore = (x: number, z: number, h: number) => beach(x, z, h) && [0, 1.57, 3.14, 4.71].some((a) => L.h(x + Math.cos(a) * 9, z + Math.sin(a) * 9) < 0);
  // the water's edge itself, where the sea leaves things
  const tideline = (x: number, z: number, h: number) => h > 0.15 && h < 1.1 && cover(x, z).can < 0.3 && [0, 0.79, 1.57, 2.36, 3.14, 3.93, 4.71, 5.5].some((a) => L.h(x + Math.cos(a) * 6, z + Math.sin(a) * 6) < 0);

  /* ---------- what lies about the island ---------- */
  const items = makeItems(L.h, spot, {
    wood: { near: byId.dot.sp.home, rad: 160, ok: tideline, max: 6, every: 1500 },
    shell: { near: byId.rakko.sp.home, rad: 170, ok: tideline, max: 16, every: 260 },
    stone: { near: [byId.lantern.sp.home[0] - 40, byId.lantern.sp.home[1] + 20], rad: 140, ok: (x, z, h) => h > 1.2 && cover(x, z).can < 0.4, max: 12, every: 900 },
  }, itemMat, group);

  /* ---------- the diary and what happened today ---------- */
  function note(r: Resident, key: string, vars: Record<string, string | number> = {}, today?: string) {
    const lines = r.v.diary[key]; if (!lines) return;
    const text = fill(pickOne(lines), { ...statVars(r), ...vars });
    r.diary.push({ at: clockMs, text }); if (r.diary.length > 60) r.diary.shift();
    if (today) { r.today.push(today); if (r.today.length > 6) r.today.shift(); }
    res.onEvent(key, `${r.v.name}：${text}`, r);
  }
  const statVars = (r: Resident) => {
    const s = r.stats, map = Math.round(Math.min(100, visited.size / 3.2));
    return { built: s.built, notes: s.notes, shells: s.shells, map, food: s.food,
      hutNow: s.built === 0 ? 'マダ、材料 アツメテル トコロ。' : s.built < 18 ? `イマ、部材 ${s.built}本。進捗、順調。` : 'コヤ、モウ 完成シマシタ！',
      notesNow: s.notes === 0 ? '……記録をつけはじめたところです。' : `記録はもう${s.notes}件になりました。`,
      mapNow: map < 3 ? 'まだ歩きはじめたばかりだが。' : `いまで島の${map}%ほど。`,
      shellsNow: s.shells === 0 ? 'きれいな貝殻を集めはじめたところ！' : `貝殻はもう${s.shells}個集めたんだ！` };
  };
  const sight = () => pickOne([
    `${pickOne(fishNames)}の群れが根のまわりを回っていた。`, `${pickOne(birdNames)}が沖へ飛んでいった。`, 'ツマグロが浅瀬を横切った。', `${pickOne(fishNames)}が一匹、じっとこちらを見ていた。`, '潮が満ちてきた。',
  ]);

  /* ---------- deciding what to do next ---------- */
  function sleepTime(r: Resident, hr: number) { return r.sp.nightOwl ? hr > 8.5 && hr < 16.5 : hr >= 21.5 || hr < 5.8; }
  function task(kind: string, at: [number, number] | null, act: Act, dur: number, extra: Partial<Task> = {}): Task | null {
    return at ? { kind, x: at[0], z: at[1], act, dur, t: 0, arrived: false, ...extra } : null;
  }
  function decide(r: Resident, hr: number): Task | null {
    const home = r.sp.home, day = dayK(hr);
    if (sleepTime(r, hr)) {
      if (r.id === 'rakko') return task('sleep', spot(home, 6, (x, z, h) => h < -0.6 && h > -3) ?? home, 'sleep', 1200, { wet: true });
      return task('sleep', home, 'sleep', 1200);
    }
    if (r.battery < 0.3 && day > 0.4 && !r.sp.nightOwl) return task('charge', spot(home, 30, open), 'idle', rr(600, 1400));
    const q = Math.random();
    switch (r.id) {
      case 'dot': {
        // one piece at a time: find a log, bring it to the bench, shape it, fit it
        if (r.holding === 'piece') return r.stats.built < HUT.length ? task('place', slotStand(r.stats.built), 'hammer', 7) : (r.holding = '', null);
        if (r.holding === 'wood') return task('craft', benchStand(), 'work', rr(45, 75));
        if (r.stats.built >= HUT.length) {
          // the hut stands: clear the ground and farm it
          const ripe = PLOTS.find((pl) => pl.ok && pl.s === 2 && growth(pl) >= 1);
          if (ripe) return task('harvest', [ripe.x + 0.8, ripe.z], 'pick', 8, { data: ripe });
          const wild = PLOTS.find((pl) => pl.ok && pl.s === 0);
          const inWay = TREES.slice(0, 3).find((t) => t.ok && !t.down);
          if (wild && inWay && q < 0.4) return task('chop', [inWay.x + 0.9, inWay.z + 0.3], 'chop', rr(40, 70), { data: inWay });
          if (wild && q < 0.4) return task('till', [wild.x + 0.8, wild.z], 'dig', rr(60, 110), { data: wild });
          const tilled = PLOTS.find((pl) => pl.ok && pl.s === 1);
          if (tilled && q < 0.45) return task('plant', [tilled.x + 0.8, tilled.z], 'pick', rr(20, 35), { data: tilled });
          return q < 0.7 ? task('look', spot(home, 80, shore, 200), 'idle', rr(120, 400)) : task('wander', spot(home, 40, open), 'idle', rr(60, 200));   // (a rest between jobs)
        }
        if (q < 0.7 && r.stats.built < HUT.length) {
          const it = items.nearest('wood', r.pos.x, r.pos.z, 220, r.id);
          if (it) { items.claim(it, r.id); return task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
          return task('look', spot(home, 80, shore, 200), 'idle', rr(60, 180));   // nothing washed up yet: watch the sea for it
        }
        if (q < 0.8) return task('look', spot(home, 80, shore, 200), 'idle', rr(60, 180));
        return task('wander', spot(home, r.sp.range, open), 'idle', rr(20, 60));
      }
      case 'kame': {
        if (q < 0.4) return task('watch', spot(home, r.sp.range, shore, 200), 'look', rr(300, 900));
        if (q < 0.75 && day > 0.3) return task('swim', spot(home, 90, (x, z, h) => h < -1.8 && h > -6), 'swim', rr(200, 500), { wet: true });
        return task('wander', spot(home, r.sp.range * 0.7, beach), 'idle', rr(60, 200));
      }
      case 'lantern': {
        const night = 1 - day;
        if (night < 0.5) return task('rest', spot(home, 20, open) ?? home, 'idle', rr(300, 900));   // (evening and dawn: it waits by its hill)
        if (r.holding === 'stone') { const c = cairnSpots.find((c) => c[2] < 4) ?? null; return task('stack', c ? [c[0] - 0.7, c[1]] : spot(home, 40, (x, z, h) => h > 11), 'work', 5, { data: c }); }
        if (q < 0.3) return task('think', spot(home, 40, (x, z, h) => h > 11), 'think', rr(400, 1000));
        if (q < 0.5 && cairnSpots.length < 12) {   // a stone for the cairn it is building
          const it = items.nearest('stone', r.pos.x, r.pos.z, 160, r.id);
          if (it) { items.claim(it, r.id); return task('fetch', [it.x, it.z], 'work', 3, { data: it }); }
        }
        // explore: somewhere it has not been, on the island's open ground and paths
        let best: [number, number] | null = null;
        for (let k = 0; k < 12; k++) { const s = spot([320, -270], 420, open, 20); if (s && !visited.has(cellOf(s[0], s[1]))) { best = s; break; } if (!best) best = s; }
        return task('explore', best, 'look', rr(30, 90));
      }
      case 'rakko': {
        if (r.holding === 'shell') return task('pile', pileAt(r.stats.shells) as [number, number], 'work', 3);
        if (q < 0.35) return task('float', spot(home, 60, (x, z, h) => h < -0.8 && h > -4), 'float', rr(300, 800), { wet: true });
        if (q < 0.6) return task('crack', spot(home, 50, (x, z, h) => h < -0.8 && h > -4), 'work', rr(120, 240), { wet: true });
        if (q < 0.8) {
          const it = items.nearest('shell', r.pos.x, r.pos.z, 200, r.id);
          if (it) { items.claim(it, r.id); return task('collect', [it.x, it.z], 'work', 3, { data: it }); }
        }
        if (q < 0.9 && day > 0.5) return task('nap', spot(home, 50, (x, z, h) => h < -0.8 && h > -4), 'sleep', rr(400, 900), { wet: true });
        return task('wander', spot(home, r.sp.range, beach), 'idle', rr(30, 90));
      }
    }
    return null;
  }
  const cellOf = (x: number, z: number) => Math.floor(x / 20) + ',' + Math.floor(z / 20);

  /* ---------- finishing a task ---------- */
  function done(r: Resident, tk: Task, fast = false) {
    switch (tk.kind) {
      case 'gather':
        if (!items.take(tk.data)) break;   // (gone)
        r.holding = 'wood'; r.stats.wood = 1; note(r, 'gather', {}, '流木を拾った');
        r.task = task('craft', benchStand(), 'work', rr(45, 75)); return;
      case 'craft': r.holding = 'piece'; r.stats.wood = 0; r.task = r.stats.built < HUT.length ? task('place', slotStand(r.stats.built), 'hammer', 7) : null; return;
      case 'place': {
        const k = r.stats.built; if (k >= HUT.length) { r.holding = ''; break; }
        r.holding = ''; r.stats.built++;
        if (fast) HUT[k].visible = true;
        else { fly.t = 0; fly.k = k; r.held.getWorldPosition(fly.from); r.held.getWorldQuaternion(fly.fromQ); flyer.geometry = HUT[k].geometry; (flyer as THREE.Mesh).material = HUT[k].material as THREE.Material; }
        note(r, r.stats.built === 18 ? 'done' : 'build', {}, r.stats.built === 18 ? '小屋を完成させた' : '小屋の部材をひとつ取りつけた');
        break;
      }
      case 'watch': r.stats.notes++; note(r, 'watch', { sight: sight() }, '浜で海を見ていた'); break;
      case 'swim': r.stats.notes++; note(r, 'swim', { sight: sight() }, 'ラグーンを泳いだ'); break;
      case 'explore': note(r, 'explore', { place: pickOne(['北の浜の岩場に出た。', '森の中の空き地を見つけた。', '白い砂の小道をたどった。', 'アダンの茂みを回り込んだ。']) }, '夜の島を歩いて地図を作った'); break;
      case 'think': {
        note(r, 'think', { star: pickOne(['光の届かない場所にも、道はあるのだろうか。', '地図の空白は、まだ知らないという印だ。', '波の音は、何度聞いても同じではない。']) }, '丘で星を見て考えごとをした');
        break;
      }
      case 'chop': {
        const t = tk.data; if (!t || t.down) break;
        t.down = true; r.stats.felled++;
        if (fast) { t.pivot.visible = false; t.stump.visible = true; } else t.fallT = 0;
        const fx = Math.sin(t.dir), fz = Math.cos(t.dir);   // the logs lie where it fell
        items.addAt('wood', t.x + fx * 1.0, t.z + fz * 1.0); items.addAt('wood', t.x + fx * 1.9, t.z + fz * 1.9);
        note(r, 'chop', {}, '若木を切り倒した'); break;
      }
      case 'till': if (tk.data.s === 0) { tk.data.s = 1; drawField(); note(r, 'till', {}, '畑を耕した'); } break;
      case 'plant': if (tk.data.s === 1) { tk.data.s = 2; tk.data.at = clockMs; drawField(); note(r, 'plant', {}, '種をまいた'); } break;
      case 'harvest': if (tk.data.s === 2 && growth(tk.data) >= 1) { tk.data.s = 1; r.stats.food += 4; drawField(); note(r, 'harvest', { food: r.stats.food }, '畑で収穫した'); } break;
      case 'fire': return;   // (they stay round it until it is time to go)
      case 'crack': { const n = 2 + Math.floor(Math.random() * 4); r.stats.cracked += n; note(r, 'crack', { n }, `貝を${n}個割った`); break; }
      case 'collect':
        if (!items.take(tk.data)) break;
        r.holding = 'shell'; r.task = task('pile', pileAt(r.stats.shells) as [number, number], 'work', 3); return;
      case 'pile': if (r.holding !== 'shell') break; r.holding = ''; r.stats.shells++; buildPile(); note(r, 'collect', {}, 'きれいな貝殻を拾った'); break;
      case 'fetch':
        if (!items.take(tk.data)) break;
        r.holding = 'stone'; r.task = null; return;   // (decide() takes it to the cairn)
      case 'stack': {
        if (r.holding !== 'stone') break;
        r.holding = '';
        let c = tk.data as number[] | null;
        if (!c || !cairnSpots.includes(c)) { c = [r.pos.x + 0.7, r.pos.z, 0]; cairnSpots.push(c); }
        c[2]++; buildCairns();
        if (c[2] >= 4) { r.stats.cairns++; note(r, 'cairn'); }
        break;
      }
      case 'float': note(r, 'float', {}, '沖でぷかぷか浮いていた'); break;
      case 'nap': note(r, 'nap', {}, '浮いたまま昼寝した'); break;
      case 'charge': note(r, 'charge'); break;
    }
    r.task = null;
  }
  function buildPile() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 0.6, 1.3), p = new THREE.Vector3();
    const n = Math.min(80, byId.rakko.stats.shells);
    for (let i = 0; i < n; i++) { const [x, z] = pileAt(i); p.set(x, L.h(x, z) + 0.01 + Math.floor(i / 12) * 0.02, z); pile.setMatrixAt(i, m.compose(p, q.setFromEuler(e.set(0, i * 1.7, 0)), s)); }
    pile.count = n; pile.instanceMatrix.needsUpdate = true;
  }
  function buildCairns() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0;
    for (const [x, z, c] of cairnSpots) for (let k = 0; k < Math.min(4, c ?? 4) && n < 60; k++, n++) {
      const sc = 1 - k * 0.2; p.set(x, L.h(x, z) + 0.1 + k * 0.22, z); s.set(sc, sc * 0.75, sc);
      cairns.setMatrixAt(n, m.compose(p, q.setFromEuler(e.set(k, k * 2.1, 0)), s));
    }
    cairns.count = n; cairns.instanceMatrix.needsUpdate = true;
  }

  /* ---------- getting about ---------- */
  function move(r: Resident, tx: number, tz: number, dt: number, wetTask: boolean) {
    const dx = tx - r.pos.x, dz = tz - r.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) return true;
    let want = Math.atan2(dx, dz);
    const inWater = L.h(r.pos.x, r.pos.z) < 0.1;
    const speed = (inWater ? r.sp.swimSpeed || 0.3 : r.sp.speed) * (r.battery < 0.1 ? 0.5 : 1);
    // walkers keep to land: if the way ahead is water, turn uphill along the shore
    if (!r.sp.swims || (!wetTask && !inWater)) {
      const ax = r.pos.x + Math.sin(want) * 2, az = r.pos.z + Math.cos(want) * 2;
      if (L.h(ax, az) < 0.25 && !(r.sp.swims && wetTask)) {
        const gx = L.h(r.pos.x + 1.5, r.pos.z) - L.h(r.pos.x - 1.5, r.pos.z), gz = L.h(r.pos.x, r.pos.z + 1.5) - L.h(r.pos.x, r.pos.z - 1.5);
        const up = Math.atan2(gx, gz), side = want + (Math.sin(want - up) > 0 ? 1.2 : -1.2);
        want = Math.abs(gx) + Math.abs(gz) > 0.01 ? side : want + 1.5;
        r.blocked += dt;
      }
    }
    let dh = want - r.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    r.head += dh * Math.min(1, dt * 2.5);
    const step = Math.min(d, speed * dt) * Math.max(0, Math.cos(dh));
    const nx = r.pos.x + Math.sin(r.head) * step, nz = r.pos.z + Math.cos(r.head) * step;
    if (r.sp.swims || L.h(nx, nz) > 0.2) { r.pos.x = nx; r.pos.z = nz; }
    r.walk = step / Math.max(dt, 1e-3) / speed;
    return false;
  }
  function placeY(r: Resident) {
    const h = L.h(r.pos.x, r.pos.z);
    r.wet = h < 0.05;
    if (!r.wet) r.pos.y = h;
    else if (r.id === 'kame' && r.act === 'swim') r.pos.y = Math.max(h + 0.3, -1.2 + Math.sin(performance.now() * 0.0003) * 0.2);
    else r.pos.y = -0.12;   // floating at the surface (Rakko), or paddling across (Kamemaru)
  }

  /* ---------- meeting and talking ---------- */
  function startTalk(a: Resident, b: Resident, fast: boolean) {
    const bd = bonds[pair(a.id, b.id)];
    const lines: Line[] = [];
    const va = a.v, vb = b.v, A = (t: string) => lines.push({ who: a.id, text: fill(t, { ...statVars(a), you: b.v.name }) }), B = (t: string) => lines.push({ who: b.id, text: fill(t, { ...statVars(b), you: a.v.name }) });
    const did = (r: Resident) => { const t = r.today.filter((x) => !x.endsWith('と話した')); return t.length ? t[t.length - 1] : pickOne(['のんびりしていた', '海を眺めていた']); };
    let stage = bd.stage;
    if (stage === 0) { A(pickOne(va.greet)); B(pickOne(vb.greetBack)); }
    else if (stage === 1) { A(pickOne(va.again)); A(pickOne(va.intro)); B(pickOne(vb.intro)); B(pickOne(vb.chatBack)); }
    else if (stage === 2) { A(pickOne(va.again)); A(pickOne(va.tips)); B(pickOne(vb.thanks)); B(pickOne(vb.tips)); A(pickOne(va.thanks)); }
    else if (stage === 3 || (stage === 4 && bd.know < 0.65) || (stage === 5 && Math.random() < 0.5)) { A(pickOne(va.again)); A(fill(pickOne(va.chat), { did: did(a) })); B(pickOne(vb.chatBack)); B(fill(pickOne(vb.chat), { did: did(b) })); A(pickOne(va.chatBack)); }
    else {   // trusting each other: one of them opens up, the other listens
      const [s, l] = bd.toldWorry % 2 === 0 ? [a, b] : [b, a];
      A(pickOne(va.again));
      lines.push({ who: s.id, text: pickOne(s.v.worries) }, { who: l.id, text: pickOne(l.v.comfort) });
      stage = 5;
    }
    A(pickOne(va.bye)); B(pickOne(vb.bye));
    const tk: Talk = { a, b, lines, i: 0, t: 0, stage, conv: heading(`${a.v.name}と${b.v.name}（${STAGES[Math.min(bd.stage + 1, 5)]}）`) };
    a.talk = b.talk = tk;
    bd.last = clockMs; bd.talks++;
    res.onEvent('meet', `${a.v.name}と${b.v.name}が出会った（${STAGES[Math.min(bd.stage + 1, 5)]}）`, a);
    // with an AI key, their own words replace the prepared ones (the greeting plays while it thinks)
    if (!fast && aiReady() && lines.length > 2) {
      tk.pending = true;
      aiConverse(a.v, b.v, bd.stage, STAGES[bd.stage], a.today.slice(-3), b.today.slice(-3), talks.filter((e) => !e.head).slice(-6).map((e) => (e.who ? `${byId[e.who]?.v.name}「${e.text}」` : e.text)))
        .then((got) => { if (got && got.length) { tk.lines = [tk.lines[0], ...got.map((g) => ({ who: g.who === 'A' ? a.id : b.id, text: g.text }))]; } })
        .finally(() => { tk.pending = false; });
    }
    return tk;
  }
  function endTalk(tk: Talk) {
    const bd = bonds[pair(tk.a.id, tk.b.id)];
    bd.know = Math.min(1, bd.know + (bd.stage >= 3 ? 0.2 : 0.1));
    if (bd.stage < 3) bd.stage++;
    else if (bd.stage === 3 && bd.know >= 0.5) bd.stage = 4;
    else if (tk.stage === 5) { bd.stage = 5; bd.toldWorry++; }
    for (const r of [tk.a, tk.b]) { r.talk = null; r.saying = ''; r.task = null; }
    const who = `${tk.a.v.name}と${tk.b.v.name}`;
    const summary = tk.stage === 5 ? '悩みを打ち明けあった' : ['はじめて挨拶した', '自己紹介をした', '島で生きるコツを教え合った', '近況を話した', '近況を話した'][Math.min(tk.stage, 4)];
    tk.a.today.push(`${tk.b.v.name}と話した`); tk.b.today.push(`${tk.a.v.name}と話した`);
    tk.a.diary.push({ at: clockMs, text: `${tk.b.v.name}と会って、${summary}。` }); tk.b.diary.push({ at: clockMs, text: `${tk.a.v.name}と会って、${summary}。` });
    res.onEvent('talked', `${who}が${summary}`, tk.a);
  }
  function stepTalk(tk: Talk, dt: number, fast: boolean) {
    if (tk.pending && tk.i >= 1) return;   // (waiting for the AI's words)
    tk.t += dt;
    const line = tk.lines[tk.i];
    if (!line) { endTalk(tk); return; }
    const speaker = byId[line.who], other = speaker === tk.a ? tk.b : tk.a;
    if (tk.t === dt || speaker.saying !== line.text) {
      other.saying = ''; say(speaker, line.text, tk.conv, fast);
    }
    // face each other
    for (const [r, o] of [[tk.a, tk.b], [tk.b, tk.a]] as Resident[][]) {
      let d = Math.atan2(o.pos.x - r.pos.x, o.pos.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 2);
      r.walk = 0; r.act = r === speaker ? (tk.i === 0 && r.id === 'dot' ? 'wave' : r.wet ? 'float' : 'idle') : r.wet ? 'float' : 'look';
    }
    if (tk.t > (fast ? 1 : 2.4 + line.text.length * 0.09)) { tk.i++; tk.t = 0; }
  }
  // the one who is out and about closes the gap once they have spotted each other
  function checkMeetings(fast: boolean) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.talk || b.talk || a.act === 'sleep' || b.act === 'sleep' || a.task?.kind === 'fire' || b.task?.kind === 'fire') continue;
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      const bd = bonds[pair(a.id, b.id)];
      if (d > 14 || clockMs - bd.last < 25 * 60e3) continue;
      if (d > 3.2) {   // spotted: walk (or paddle) over
        const [m, o] = a.sp.social >= b.sp.social ? [a, b] : [b, a];
        m.task = { kind: 'approach', x: o.pos.x, z: o.pos.z, act: 'walk', dur: 60, t: 0, arrived: false, wet: m.sp.swims, data: o.id };
        continue;
      }
      startTalk(a.sp.social >= b.sp.social ? a : b, a.sp.social >= b.sp.social ? b : a, fast);
    }
  }
  // now and then the sociable ones take a walk toward a neighbour's part of the island
  function maybeVisit(r: Resident, hr: number): Task | null {
    if (Math.random() > r.sp.social * 0.08) return null;
    const awake = list.filter((o) => o !== r && !sleepTime(o, hr));
    if (!awake.length) return null;
    const o = pickOne(awake), mid = [r.pos.x + (o.pos.x - r.pos.x) * 0.8, r.pos.z + (o.pos.z - r.pos.z) * 0.8] as [number, number];
    return task('visit', spot(mid, 30, r.sp.swims ? (x, z, h) => h > -3 : open) , 'idle', rr(40, 120));
  }

  /* ---------- one resident, one step ---------- */
  function step(r: Resident, dt: number, fast: boolean) {
    const hr = localHour(clockMs), day = dayK(hr);
    // the battery: solar panels charge in daylight when resting; moving and thinking use it up
    const busy = r.walk > 0.1 || r.act === 'work' || r.act === 'swim' || r.act === 'think';
    r.battery = Math.min(1, Math.max(0, r.battery + dt * ((busy ? -1 / 21600 : -1 / 72000) + (!busy ? day / 5400 : day / 21600))));
    if (r.talk) { if (r.talk.a === r) stepTalk(r.talk, dt, fast); placeY(r); return; }
    // the evening fire: everyone who is up comes and sits round it, and goes off again after
    if (gatherHours(hr) && !sleepTime(r, hr) && r.task?.kind !== 'fire') {
      items.release(r.id);
      const seat = seatAt(list.indexOf(r));
      r.task = task('fire', seat, 'sit', 1e9); r.blocked = 0;
    }
    if (r.task?.kind === 'fire' && !gatherHours(hr)) {
      if (atFire.has(r.id)) note(r, 'fire', {}, '焚き火を囲んだ');
      r.task = null; r.saying = '';
    }
    if (!r.task || (sleepTime(r, hr) !== (r.task.kind === 'sleep') && r.task.kind !== 'approach')) {
      r.task = (!sleepTime(r, hr) && maybeVisit(r, hr)) || decide(r, hr);
      r.blocked = 0;
      if (!r.task) { r.act = 'idle'; r.walk = 0; placeY(r); return; }
    }
    const tk = r.task;
    if (tk.kind === 'approach') { const o = byId[tk.data]; tk.x = o.pos.x; tk.z = o.pos.z; if (Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) < 3) { r.task = null; r.walk = 0; return; } }
    if (!tk.arrived) {
      r.act = r.wet ? 'swim' : r.holding ? 'carry' : 'walk';
      tk.arrived = move(r, tk.x, tk.z, dt, !!tk.wet);
      tk.t += dt;
      if (tk.t > 1800 || r.blocked > 40) { items.release(r.id); r.task = null; return; }   // could not get there: think again
      if (tk.arrived) tk.t = 0;
      if (r.id === 'lantern') visited.add(cellOf(r.pos.x, r.pos.z));
    } else {
      r.walk = 0; r.act = tk.act;
      if (tk.kind === 'fire') { atFire.add(r.id); let d = Math.atan2(PIT.x - r.pos.x, PIT.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 2); }
      if (tk.kind === 'watch' || tk.kind === 'look') { let d = Math.atan2(-r.pos.x + (r.sp.home[0] - 60), -r.pos.z + (r.sp.home[1] + 80)) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt); }
      tk.t += dt;
      if (tk.t > tk.dur) done(r, tk, fast);
    }
    placeY(r);
  }

  /* ---------- saving and catching up ---------- */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        at: Date.now(), clockMs, visited: [...visited], cairns: cairnSpots, bonds, talks: talks.slice(-160), items: items.save(), trees: TREES.map((t) => (t.down ? 1 : 0)), plots: PLOTS.map((pl) => [pl.s, pl.at]),
        list: list.map((r) => ({ id: r.id, pos: [r.pos.x, r.pos.z], head: r.head, battery: r.battery, stats: r.stats, today: r.today, diary: r.diary.slice(-40), holding: r.holding })),
      }));
    } catch (e) { /* storage full or blocked: they live on in memory */ }
  }
  function load(nowMs: number) {
    let s: any = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    clockMs = nowMs;
    items.load(s ? s.items : undefined);
    if (!s) return 0;
    for (const v of s.visited || []) visited.add(v);
    for (const c of s.cairns || []) cairnSpots.push([c[0], c[1], c[2] ?? 4]);   // (older saves: finished cairns)
    Object.assign(bonds, s.bonds || {});
    talks.push(...(s.talks || []));
    for (const d of s.list || []) {
      const r = byId[d.id]; if (!r) continue;
      r.pos.set(d.pos[0], 0, d.pos[1]); r.head = d.head; r.battery = d.battery; Object.assign(r.stats, d.stats); r.today = d.today || []; r.diary = d.diary || [];
      r.holding = d.holding ?? (r.id === 'dot' && r.stats.wood > 0 ? 'wood' : '');
    }
    for (let i = 0; i < Math.min(byId.dot.stats.built, HUT.length); i++) HUT[i].visible = true;
    (s.trees || []).forEach((d: number, i: number) => { const t = TREES[i]; if (t && d && t.ok) { t.down = true; t.pivot.visible = false; t.stump.visible = true; } });
    (s.plots || []).forEach((d: number[], i: number) => { const pl = PLOTS[i]; if (pl) { pl.s = d[0]; pl.at = d[1]; } });
    buildPile(); buildCairns();
    return Math.min(12 * 3600, Math.max(0, (Date.now() - s.at) / 1000));   // how long they lived on without us (up to half a day)
  }

  const res: Residents = {
    list, bonds, talks, group,
    onEvent: () => { /* set by the app */ },
    onSay: () => { /* set by the app */ },
    gibber,
    update(dt, ms, cam) {
      clockMs = ms;
      items.tick(dt);
      for (const r of list) step(r, dt, false);
      fireCircle(dt, false);
      animateWork(dt);
      if ((meetT -= dt) < 0) { meetT = 1; checkMeetings(false); }
      for (const r of list) {
        const near = Math.hypot(r.pos.x - cam.x, r.pos.z - cam.z) < 160;
        r.model.root.visible = near;
        if (!near) continue;
        r.model.root.position.copy(r.pos); r.model.root.rotation.y = r.head;
        const act: Act = r.id === 'dot' ? r.act : r.act === 'pick' || r.act === 'hammer' || r.act === 'chop' || r.act === 'dig' ? 'work' : r.act === 'sit' ? (r.wet ? 'float' : 'idle') : r.act;
        r.model.update(performance.now() / 1000 + r.sp.home[0], dt, { act, walk: Math.min(1, r.walk), night: 1 - dayK(localHour(ms)), wet: r.wet });
        // what it has in its hands (Dot's arms hold a log themselves)
        if (r.model.carry) r.model.carry.visible = r.holding === 'wood';
        const hk = r.holding === 'wood' && r.model.carry ? '' : r.holding;
        r.held.visible = !!hk && !(r.task?.kind === 'craft' && r.task.arrived);
        if (hk === 'piece' && r.stats.built < HUT.length) { lying(HUT[r.stats.built], r.held); r.held.scale.setScalar(0.6); }
        else if (hk) { r.held.geometry = items.geo[hk as ItemKind]; r.held.material = itemMat[hk as ItemKind]; r.held.rotation.set(0, 0, 0); r.held.scale.setScalar(hk === 'wood' ? 0.8 : 1); }
        if (r.saying) r.sayT += dt;
        r.subject.prio = r.talk ? 7 : r.act === 'sleep' ? 1.2 : 2.6;
      }
      if ((saveT -= dt) < 0) { saveT = 20; save(); }
    },
    subjects: () => list.map((r) => r.subject),
    status(r) {
      if (r.talk) { const o = r.talk.a === r ? r.talk.b : r.talk.a; return `${o.v.name}と話している`; }
      const tk = r.task, k = tk?.kind ?? 'idle';
      const far = tk && !tk.arrived ? Math.round(Math.hypot(tk.x - r.pos.x, tk.z - r.pos.z)) : 0, left = far > 3 ? `（あと${far}m）` : '';
      const going: Record<string, string> = { chop: '若木のところへ向かう', till: '畑へ向かう', plant: '畑へ種をまきに行く', harvest: '畑へ収穫に行く', fire: '焚き火へ向かっている', gather: '流木を拾いに行く', collect: '貝殻を拾いに行く', fetch: '石積みの石を拾いに行く', craft: '流木を作業台へ運んでいる', place: `削った部材を小屋へ運んでいる`, pile: '貝殻を運んでいる', stack: '石を石積みへ運んでいる' };
      const at: Record<string, string> = { chop: '斧で若木を切っている', till: '鍬で畑を耕している', plant: '種をまいている', harvest: '実を収穫している', fire: '焚き火を囲んで話している', gather: '流木を拾い上げている', collect: '貝殻を拾い上げている', fetch: '石を拾い上げている', craft: `作業台で流木を部材に削っている（${r.stats.built + 1}本目）`, place: `部材を小屋に取りつけている（${r.stats.built + 1}/${HUT.length}）`, pile: '貝殻を浜に並べている', stack: '石を積み上げている' };
      if (!r.talk && tk && going[k]) return tk.arrived ? at[k] : going[k] + left;
      const base: Record<string, string> = {
        sleep: r.wet ? '波に揺られて眠っている' : '眠っている', charge: '日なたで充電している', gather: tk?.arrived ? '流木を拾っている' : '流木を探しに浜へ', carry: '流木を運んでいる', build: '小屋を建てている',
        look: '海を眺めている', wander: '散歩している', watch: '浜で海を観察している', swim: 'ラグーンを泳いで記録している', rest: '丘のふもとで夜を待っている', think: '丘の上で星を見て考えごとをしている',
        explore: '夜の島を歩いて地図を作っている', float: '沖で仰向けに浮かんでいる', crack: 'お腹の上で貝を割っている', collect: '浜で貝殻を拾っている', pile: '貝殻を浜に並べている', nap: '浮いたまま昼寝している',
        visit: 'となりの浜のほうへ散歩している', approach: '誰かに気づいて近づいていく', idle: 'ひと休みしている',
      };
      return base[k] ?? 'ひと休みしている';
    },
    save,
    focus(r) { focused = r; },
    bubbles(camera, w, h) {
      const v = new THREE.Vector3();
      for (const r of list) {
        const el = bubbleEl(r);
        const show = !!r.saying && r.model.root.visible;
        if (show) {
          v.copy(r.pos); v.y += 1.35 * r.sp.scale + (r.wet ? 0.4 : 0);
          const d = v.distanceTo((camera as any).position);
          v.project(camera);
          const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < 45;
          el.style.opacity = on ? '1' : '0';
          if (on) { el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(0)}px) translate(-50%, -100%)`; if (el.dataset.t !== r.saying) { el.dataset.t = r.saying; el.innerHTML = `<b>${r.v.name}</b><i class="ln">${gibber(r.id, r.saying)}</i>${r.saying}`; } }
        } else el.style.opacity = '0';
      }
    },
  };
  (res as any).items = items;   // (for ?debug)
  let convN = 0;
  function say(r: Resident, text: string, conv: number, fast: boolean) {
    r.saying = text; r.sayT = 0;
    talks.push({ at: clockMs, who: r.id, text, conv }); if (talks.length > 300) talks.shift();
    if (!fast) res.onSay(r, text);
  }
  function heading(text: string) { const c = Math.floor(clockMs / 1000) * 10 + (++convN % 10); talks.push({ at: clockMs, text, conv: c, head: true }); if (talks.length > 300) talks.shift(); return c; }
  let meetT = 1, saveT = 20;
  let focused: Resident | null = null;
  // a ring on the ground where the watched one is heading (the log or shell it has its eye on, the bench, the hut)
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; group.add(marker);
  let markT = 0;
  // Round the fire: now one, now another says something; the circle warms them to each other
  function fireCircle(dt: number, fast: boolean) {
    const hr = localHour(clockMs);
    const seated = list.filter((r) => r.task?.kind === 'fire' && r.task.arrived);
    if (!gatherHours(hr)) {
      if (atFire.size > 1) {   // the evening is over: everyone who was there knows the others a little better
        const ids = [...atFire];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const bd = bonds[pair(ids[i], ids[j])]; bd.know = Math.min(1, bd.know + 0.12); if (bd.stage < 3) bd.stage++; bd.last = clockMs; }
        const names = ids.map((id) => byId[id].v.name).join('・');
        res.onEvent('fire', `${names}で焚き火を囲んだ`, byId[ids[0]]);
      }
      atFire.clear(); fireSaid = false; fireConv = 0; fireLines = 0; fireUsed.clear();
      return;
    }
    if (seated.length >= 2 && !fireSaid) { fireSaid = true; res.onEvent('fire', 'みんなが焚き火のまわりに集まってきた', seated[0]); }
    if (seated.length < 2) return;
    if ((fireTalkT -= dt) > 0) return;
    fireTalkT = fast ? 60 : rr(16, 34);
    // a dozen or so things said in an evening, none twice; after that they just sit and watch the fire
    if (fireLines >= 14) return;
    const who = pickOne(seated.filter((r) => r.id !== lastSpeaker)) ?? seated[0];
    lastSpeaker = who.id;
    const did = who.today.filter((x) => !x.endsWith('と話した'));
    const pool = [...who.v.fire, ...(did.length ? who.v.fireDid.map((l) => fill(l, { did: did[did.length - 1] })) : [])].filter((l) => !fireUsed.has(l));
    if (!pool.length) return;
    const line = pickOne(pool); fireUsed.add(line); fireLines++;
    for (const r of seated) if (r !== who) r.saying = '';
    if (!fireConv) fireConv = heading('焚き火の会');
    say(who, line, fireConv, fast);
    for (const o of seated) if (o !== who) { const bd = bonds[pair(who.id, o.id)]; bd.know = Math.min(1, bd.know + 0.01); }
  }
  // Dot at work, the piece flying into place, the chips, a newly fitted piece settling
  let fieldT = 0;
  function animateWork(dt: number) {
    if ((fieldT -= dt) < 0) { fieldT = 2; drawField(); }   // (the crops grow)
    // trees coming down
    for (const t of TREES) {
      if (t.fallT < 0) continue;
      t.fallT += dt;
      const k = Math.min(1, t.fallT / 2.2), a = k * k * Math.PI / 2;
      t.pivot.rotation.set(Math.cos(t.dir) * a, 0, -Math.sin(t.dir) * a);
      if (t.fallT > 3.5) { t.pivot.visible = false; t.stump.visible = true; t.fallT = -1; }
    }
    // the fire: flames flicker, sparks rise, the light it throws
    const hr = localHour(clockMs), lit = fireHours(hr) ? 1 : 0;
    fireK += (lit - fireK) * Math.min(1, dt * 0.5);
    const tt = performance.now() / 1000;
    flames.forEach((f, k) => { const s = fireK * (0.8 + 0.3 * Math.sin(tt * (7 + k) + k * 2) + 0.15 * Math.sin(tt * 13.7 + k)); f.scale.set(s, s * (1 + 0.3 * Math.sin(tt * 9 + k)), s); f.visible = fireK > 0.02; f.rotation.y = tt * (0.5 + k * 0.2); });
    U.uFire.value.set(PIT.x, PIT.y + 0.5, PIT.z, fireK * (1.6 + 0.35 * Math.sin(tt * 11) + 0.2 * Math.sin(tt * 17.3)));
    if (fireK > 0.3 && Math.random() < dt * 6) { const sp = sparks.find((x) => x.t > 2); if (sp) { sp.p.set(PIT.x + (Math.random() - 0.5) * 0.2, PIT.y + 0.4, PIT.z + (Math.random() - 0.5) * 0.2); sp.v.set((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3); sp.t = 0; } }
    { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1); let n = 0;
      for (const sp of sparks) { if (sp.t > 2) continue; sp.t += dt; sp.p.addScaledVector(sp.v, dt); sp.v.x += Math.sin(tt * 3 + sp.p.y * 4) * dt * 0.3; sc.setScalar(Math.max(0, 1 - sp.t / 2)); sparksM.setMatrixAt(n++, m.compose(sp.p, q, sc)); }
      sparksM.count = n; sparksM.instanceMatrix.needsUpdate = true; }
    const dot = byId.dot, tk = dot.task, next = dot.stats.built;
    const crafting = tk?.kind === 'craft' && tk.arrived;
    // the log on the bench turns into the piece: the rough log shrinks away as the shaped piece grows out of it
    benchLog.visible = crafting; benchPiece.visible = crafting && next < HUT.length;
    if (crafting && next < HUT.length) {
      const k = Math.min(1, tk!.t / tk!.dur);
      benchLog.geometry = items.geo.wood; benchLog.scale.set(Math.max(0.05, 1 - k), 1 - k * 0.3, 1 - k * 0.3);
      lying(HUT[next], benchPiece); benchPiece.scale.setScalar(0.55); benchPiece.scale.x *= Math.max(0.02, k);
      // chips fly while it works
      if (Math.random() < dt * 9) {
        const c = chips[chipNext++ % CHIPS]; bench.getWorldPosition(c.p); c.p.y += 0.56; c.p.x += (Math.random() - 0.5) * 0.4; c.p.z += (Math.random() - 0.5) * 0.2;
        c.v.set((Math.random() - 0.5) * 1.2, 1 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2); c.t = 0;
      }
    }
    // the outline of the next piece in its place while Dot is working toward it
    const working = (dot.holding === 'wood' || dot.holding === 'piece') && next < HUT.length;
    ghost.visible = working;
    if (working) { ghost.geometry = HUT[next].geometry; ghost.position.copy(HUT[next].position); ghost.rotation.copy(HUT[next].rotation); ghostM.opacity = 0.22 + 0.12 * Math.sin(performance.now() * 0.004); }
    // chips
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const c of chips) {
      if (c.t > 1.2) continue;
      c.t += dt; c.v.y -= 6 * dt; c.p.addScaledVector(c.v, dt);
      const g = L.h(c.p.x, c.p.z) + 0.01; if (c.p.y < g) { c.p.y = g; c.v.set(0, 0, 0); }
      chipsM.setMatrixAt(n++, m.compose(c.p, q.setFromEuler(e.set(c.t * 9, c.t * 7, 0)), sc));
    }
    chipsM.count = n; chipsM.instanceMatrix.needsUpdate = true;
    // the piece lifts from Dot's hands and swings up into its place
    if (fly.t >= 0) {
      fly.t += dt;
      const k = Math.min(1, fly.t / 1.4), s = k * k * (3 - 2 * k);
      slotWorld(fly.k); const to = _sw, toQ = _sq;
      flyer.visible = true;
      flyer.position.lerpVectors(fly.from, to, s); flyer.position.y += Math.sin(s * Math.PI) * 0.6;
      flyer.quaternion.slerpQuaternions(fly.fromQ, toQ, s);
      if (k >= 1) { flyer.visible = false; fly.t = -1; HUT[fly.k].visible = true; reveal.push({ m: HUT[fly.k], t: 0 }); }
    }
    // and settles with a little bump
    for (let i = reveal.length - 1; i >= 0; i--) {
      const rv = reveal[i]; rv.t += dt;
      const b = rv.t < 0.35 ? 1 + 0.12 * Math.sin(rv.t / 0.35 * Math.PI) : 1; rv.m.scale.setScalar(b);
      if (rv.t >= 0.35) { rv.m.scale.setScalar(1); reveal.splice(i, 1); }
    }
    // where the watched one is going
    const ft = focused?.task;
    marker.visible = !!ft && !ft.arrived && ['gather', 'collect', 'fetch', 'craft', 'place', 'pile', 'stack', 'chop', 'till', 'plant', 'harvest', 'fire'].includes(ft.kind);
    if (marker.visible) {
      markT += dt;
      marker.position.set(ft!.x, L.h(ft!.x, ft!.z) + 0.06, ft!.z);
      marker.scale.setScalar(1 + 0.15 * Math.sin(markT * 3));
      (marker.material as THREE.MeshBasicMaterial).color.set(focused!.sp.color);
    }
  }
  const bubbleEls: Record<string, HTMLElement> = {};
  function bubbleEl(r: Resident) {
    let el = bubbleEls[r.id];
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; el.style.setProperty('--c', r.sp.color); document.getElementById('bubbles')?.appendChild(el); bubbleEls[r.id] = el; }
    return el;
  }

  // wake up where they were, and catch up on the hours nobody was watching
  const behind = load(Date.now());
  if (behind > 0) {
    const t0 = clockMs - behind * 1000, n = Math.ceil(behind / 20);
    const quiet = res.onEvent; res.onEvent = () => {};
    for (let k = 0; k < n; k++) {
      clockMs = t0 + k * 20000;
      items.tick(20);
      for (const r of list) step(r, 20, true);
      fireCircle(20, true);
      if (k % 3 === 0) checkMeetings(true);
      for (const r of list) if (r.talk && r.talk.a === r) for (let s = 0; s < 40 && r.talk; s++) stepTalk(r.talk, 1, true);
    }
    res.onEvent = quiet;
    for (const r of list) { r.saying = ''; }
  }
  for (const r of list) placeY(r);
  return res;
}
