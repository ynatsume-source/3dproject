// The island's residents on Kayama-jima: two robots and two animals, each living its own life. The robots
// charge in the sun — Dot builds a hut of driftwood, Lantern walks the island by night mapping it and
// thinks on the hill. The animals live as their kind does: Kamemaru, an old green turtle, grazes the
// lagoon's seagrass, comes up to breathe, sleeps on the bottom and basks on the beach; Rakko, a sea otter,
// dives for urchins, crabs and clams when hungry, eats them floating on its back (cracking the clams on its
// stone), grooms, sleeps on its back, and piles up the pretty shells it finds. When two of them happen to
// meet they stop and talk: a greeting the first time, then introductions, tips for island life, news of
// their day, and — once they have come to trust each other — their worries.
// Everything they do goes into their diaries; their lives carry on (and are saved) while nobody watches.
import * as THREE from 'three';
import { mat, U } from '../render/common';
import { AIRLIT } from '../ocean/shore';
import { findPath } from './path';
import { robotKit, type Robot, type Act, type Mats } from './models';
import { creatureKit, type CMats, type Food } from './creatures';
import { VOICES, STAGES, type Voice } from './voices';
import type { Subject } from '../eco/env';
import { aiConverse, aiReady } from './mind';
import { makeItems, type Item, type ItemKind } from './items';

/* ---------- materials: lit by the sea's own sky, sun and water ---------- */
// pat: 0 plain, 1 a green turtle's carapace (its scutes, from the shell's own coordinates), 2 scaled
// skin (a turtle's head and flippers: dark scales edged pale), 3 fur (fine variation in the pile)
function rmat(hex: number, spec = 0.5, grid = false, pat = 0, scl = 1) {
  return mat(
    `varying vec3 vWp; varying vec3 vN; varying vec2 vUv; varying vec3 vLp;
     void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vLp = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    AIRLIT + `uniform vec3 uCol; uniform float uSpec; uniform float uGrid; uniform float uPat; uniform float uScl; varying vec3 vWp; varying vec3 vN; varying vec2 vUv; varying vec3 vLp;
     vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
     vec3 cells(vec2 p) {   // nearest cell distance, the gap to the next (the seams), and the cell's own random
       vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
       for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = h22(i + g), r = g + o - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; id = o.x; } else if (d < d2) d2 = d; }
       return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
     }
     // a green turtle's carapace: five scutes down the middle, four each side, a ring of small ones round
     // the rim; each one olive-brown with streaks of tan and dark radiating from its growth centre, the seams
     // a little paler, and a green film of algae toward the back of an old shell
     vec3 carapace(vec3 q) {
       vec2 p = q.xz; float d1 = 9.0, d2 = 9.0; vec2 c1 = vec2(0.0); float id = 0.0;
       for (int i = 0; i < 13; i++) {
         float fi = float(i);
         vec2 s = i < 5 ? vec2(0.0, 0.3 - fi * 0.155) : vec2((mod(fi, 2.0) < 0.5 ? -1.0 : 1.0) * 0.19, 0.235 - floor((fi - 5.0) / 2.0) * 0.165);
         float d = length((p - s) * vec2(1.0, 1.15));
         if (d < d1) { d2 = d1; d1 = d; c1 = s; id = fi; } else if (d < d2) d2 = d;
       }
       float rn = length(vec2(p.x / 0.37, p.y / 0.48)), seam = 1.0 - smoothstep(0.004, 0.012, d2 - d1);
       vec2 rel = p - c1; float ang = atan(rel.y, rel.x);
       if (rn > 0.84) {   // the marginal scutes
         float a = atan(p.x, p.y) / 6.2832 * 24.0; seam = max(smoothstep(0.42, 0.48, abs(fract(a) - 0.5)), 1.0 - smoothstep(0.004, 0.014, abs(rn - 0.84)));
         id = floor(a) + 20.0; ang = (fract(a) - 0.5) * 6.0 + rn * 30.0;
       }
       float streak = (0.5 + 0.5 * sin(ang * 9.0 + id * 13.7)) * (0.55 + 0.45 * sin(ang * 4.0 - id * 5.1)) * smoothstep(0.0, 0.06, d1);   // (rays from the growth centre)
       if (rn > 0.84) streak *= 0.6;
       vec3 col = mix(vec3(0.17, 0.11, 0.055), vec3(0.47, 0.37, 0.19), streak);
       col = mix(col, vec3(0.1, 0.07, 0.04), smoothstep(0.08, 0.0, d1) * 0.3);
       col = mix(col, vec3(0.52, 0.47, 0.34), seam * 0.7);
       float algae = smoothstep(-0.05, -0.4, p.y) * (0.5 + 0.5 * sin(p.x * 40.0 + p.y * 23.0) * sin(p.y * 31.0));
       return mix(col, vec3(0.2, 0.27, 0.12), algae * 0.45);
     }
     // a character's shell: the same scutes, but quiet — a touch lighter at each one's middle, the seams a little darker
     vec3 softScutes(vec3 q) {
       vec2 p = q.xz; float d1 = 9.0, d2 = 9.0;
       for (int i = 0; i < 13; i++) {
         float fi = float(i);
         vec2 s = i < 5 ? vec2(0.0, 0.3 - fi * 0.155) : vec2((mod(fi, 2.0) < 0.5 ? -1.0 : 1.0) * 0.19, 0.235 - floor((fi - 5.0) / 2.0) * 0.165);
         float d = length((p - s) * vec2(1.0, 1.15));
         if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
       }
       float rn = length(vec2(p.x / 0.37, p.y / 0.48));
       float seam = max(1.0 - smoothstep(0.006, 0.016, d2 - d1), 1.0 - smoothstep(0.006, 0.018, abs(rn - 0.86)));
       vec3 col = uCol * (1.0 + 0.14 * (1.0 - smoothstep(0.02, 0.11, d1)));
       if (rn > 0.86) col = uCol * 0.88;
       return mix(col, uCol * 0.62, seam * 0.75);
     }
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp);
       vec3 alb = uCol;
       if (uGrid > 0.5) { vec2 g = fract(vUv * vec2(10.0, 6.0)); alb = mix(vec3(0.05, 0.08, 0.17), vec3(0.72, 0.75, 0.8), max(step(0.9, g.x), step(0.88, g.y))); }
       if (uPat > 0.5 && uPat < 1.5) alb = carapace(vLp);
       else if (uPat > 3.5) alb = softScutes(vLp);
       else if (uPat > 1.5 && uPat < 2.5) { vec3 c = cells(vec2(vLp.x + vLp.y * 0.7, vLp.z - vLp.y * 0.4) * uScl); alb = mix(uCol * (0.75 + 0.5 * c.z), vec3(0.72, 0.64, 0.44), 1.0 - smoothstep(0.03, 0.09, c.y)); }
       else if (uPat > 2.5 && uPat < 3.5) { vec3 c = cells(vec2(vLp.x * 1.3 + vLp.z * 0.7, vLp.y * 1.3 - vLp.z * 0.5) * uScl); alb = uCol * (0.9 + 0.2 * c.z); }   // (a soft, fine unevenness in the pile)
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
     }`, { uniforms: { uCol: { value: new THREE.Color(hex) }, uSpec: { value: spec }, uGrid: { value: grid ? 1 : 0 }, uPat: { value: pat }, uScl: { value: scl } } });
}
let MATS: Mats | null = null;
let CM: CMats | null = null;
function cmats(): CMats {
  return CM ??= {
    fur: rmat(0x3a281b, 0.3, false, 3, 70), furPale: rmat(0xb9a487, 0.2, false, 3, 40), furDark: rmat(0x1f1610, 0.25, false, 3, 40),
    nose: rmat(0x0d0c0c, 0.9), eye: rmat(0x050506, 1.8),
    carapace: rmat(0x5a4426, 0.8, false, 1), plastron: rmat(0xd8c890, 0.3), skin: rmat(0x4c3b24, 0.45, false, 2, 6), beak: rmat(0x6a5838, 0.6),
    stone: rmat(0x7d776e, 0.15), urchin: rmat(0x3b1736, 0.5), crab: rmat(0xb04a2a, 0.5), clam: rmat(0xcbbca4, 0.5),
    white: rmat(0xf4f1ea, 0.3), kelp: rmat(0x5d6b2a, 0.35),
    // the characters' flat colours
    chibi: {
      brown: rmat(0x4b2e1f, 0.15), brownOdd: rmat(0x4b2e1f, 0.15), belly: rmat(0xc99a70, 0.1), cream: rmat(0xf0dcb8, 0.1), paw: rmat(0x3e2518, 0.1), nose: rmat(0x1c120d, 0.8), mouth: rmat(0x8c3b3b, 0.3),
      dark: rmat(0x120b08, 0.9), iris: rmat(0x7a4a26, 0.3), white: rmat(0xffffff, 0.2), pink: rmat(0xf0a4a0, 0.1), red: rmat(0xd8423a, 0.1), stone: rmat(0x8e8b86, 0.15),
      shell: rmat(0x8a5a36, 0.3), shellPlain: rmat(0x6e4529, 0.3, false, 4), seam: rmat(0xf1e2b8, 0.15), plastron: rmat(0xe2cf9a, 0.15), skin: rmat(0x86c4a4, 0.15), skinOdd: rmat(0x679c82, 0.15),
      brow: rmat(0xfbf8f0, 0.1), moss: rmat(0x5d9a3e, 0.1), barnacle: rmat(0xe2ddd0, 0.2),
    },
  };
}
function mats(): Mats {
  return MATS ??= {
    shell: rmat(0xf0ece4, 0.8), accent: rmat(0xf08a3c, 0.5), teal: rmat(0x3f9a93, 0.4), joint: rmat(0x2b3035, 0.9),
    dark: rmat(0x0c1418, 1.2), panel: rmat(0x1c2a4a, 1.0, true), stone: rmat(0x8a8072, 0.1),
    glow: new THREE.MeshBasicMaterial({ color: 0x8ff6ff }), warm: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
  };
}

/* ---------- their lights after dark ---------- */
// Each carries its own: Dot a warm little torch on its antenna, Kamemaru the glow of its lens, Lantern its
// lamp (the widest), Rakko a small orange light held in its paws. A faint cone of light shows where it
// points, and a soft pool falls on the ground ahead: enough to see what it is doing, never glaring.
const LIGHT: Record<string, { c: number; y: number; tilt: number; r: number; k: number; ahead: number }> = {
  dot: { c: 0xffd98a, y: 0.95, tilt: 0.55, r: 2.3, k: 0.34, ahead: 1.6 },
  kame: { c: 0x8fe8d0, y: 0.45, tilt: 0.35, r: 2.0, k: 0.26, ahead: 1.5 },
  lantern: { c: 0xbff8ff, y: 0.88, tilt: 0.9, r: 3.4, k: 0.38, ahead: 0.9 },
  rakko: { c: 0xffc08a, y: 0.6, tilt: 0.5, r: 2.1, k: 0.3, ahead: 1.3 },
};
const beamGeo = (len: number, rad: number) => { const g = new THREE.ConeGeometry(rad, len, 20, 1, true); g.translate(0, -len / 2, 0); return g; };
const BEAM_GEO: Record<string, THREE.BufferGeometry> = { dot: beamGeo(2.2, 0.75), kame: beamGeo(1.8, 0.55), lantern: beamGeo(1.6, 1.1), rakko: beamGeo(1.8, 0.6) };

/* ---------- who lives where ---------- */
interface Spec { id: string; make: 'makeDot' | 'makeLantern' | 'makeKame' | 'makeRakko'; home: [number, number]; range: number; speed: number; swimSpeed: number; swims: boolean; nightOwl: boolean; scale: number; color: string; social: number; living?: boolean }
const SPECS: Spec[] = [
  { id: 'dot', make: 'makeDot', home: [61, -145], range: 120, speed: 0.6, swimSpeed: 0, swims: false, nightOwl: false, scale: 1, color: '#ffd98a', social: 0.5 },
  { id: 'kame', make: 'makeKame', home: [333, 66], range: 140, speed: 0.22, swimSpeed: 0.6, swims: true, nightOwl: false, scale: 1, color: '#7fe0c0', social: 0.25, living: true },
  { id: 'lantern', make: 'makeLantern', home: [405, -285], range: 420, speed: 0.8, swimSpeed: 0, swims: false, nightOwl: true, scale: 1, color: '#8ff6ff', social: 0.35 },
  { id: 'rakko', make: 'makeRakko', home: [-117, -290], range: 170, speed: 0.35, swimSpeed: 0.9, swims: true, nightOwl: false, scale: 1.2, color: '#f7a36b', social: 0.8, living: true },
];

interface Task { kind: string; x: number; z: number; act: Act; dur: number; t: number; arrived: boolean; wet?: boolean; then?: string; data?: any }
interface Line { who: string; text: string }
interface Talk { a: Resident; b: Resident; lines: Line[]; i: number; t: number; stage: number; pending?: boolean; conv: number }
export interface Mark { x: number; y: number; z: number; kind: string; label: string; sub?: string; hot?: boolean; color?: string }
export interface Sense { eye: THREE.Vector3; head: number; marks: Mark[]; target: Mark | null; task: string; built: number; hutN: number; food: number }
export interface Bond { stage: number; know: number; talks: number; last: number; toldWorry: number }
export interface Entry { at: number; text: string; who?: string; conv?: number; head?: boolean; key?: string; with?: string }   // (a line someone said, or the heading of a conversation)
export interface Resident {
  id: string; v: Voice; sp: Spec; model: Robot;
  pos: THREE.Vector3; head: number; battery: number; task: Task | null; walk: number; act: Act; wet: boolean;
  hunger: number; sleepy: number; meal: Record<string, number>; under: number;   // (the two who are animals: how hungry and how sleepy, what it has eaten this bout, how far down toward the bottom it is)
  talk: Talk | null; saying: string; sayT: number;
  stats: { built: number; notes: number; shells: number; cracked: number; visited: number; cairns: number; wood: number; food: number; felled: number };
  today: string[];                        // what it did today (for small talk and its diary)
  diary: Entry[];
  subject: Subject; blocked: number;
  path?: { pts: [number, number][]; tx: number; tz: number; t: number };   // the way it means to walk (robots/path.ts)
  // for its body (what the model is told, not the world's facts): how far its feet have gone, how fast it
  // is going, what it is looking at, and which spell of doing something this is and for how long
  mo: { stride: number; px: number; pz: number; ph: number; gait: number; key: number; t: number; act: string; task: Task | null; look: THREE.Vector3 | null };
  lightK?: number;
  holding: '' | ItemKind | 'piece' | 'plank' | 'drift';   // what it has in its hands
  held: THREE.Mesh;
  beam: THREE.Mesh;                        // its light after dark: a soft cone ahead of it
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
  sense(r: Resident): Sense;                       // what it sees and what it is up to, for its own point of view
  vitals(r: Resident): string;                     // its battery, or (an animal) how hungry and sleepy it is
  hide: string;                                    // (the one whose eyes we are looking through: not drawn)
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
const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const localHour = (ms: number) => (((ms / 3.6e6 + 9) % 24) + 24) % 24;
const dayK = (hr: number) => Math.min(1, Math.max(0, (hr - 6.3) / 0.8)) * Math.min(1, Math.max(0, (18.9 - hr) / 0.8));
const hhmm = (ms: number) => { const h = localHour(ms); return `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };

const KEY = 'seaglass.residents.v1';

const _lv = new THREE.Vector3();
export function makeResidents(loc: any, T: any, fishNames: string[], birdNames: string[]): Residents {
  const L = { h: (x: number, z: number) => loc.f(x, z) };
  const kit = robotKit(mats()), ckit = creatureKit(cmats());
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
  const fly = { t: -1, m: null as THREE.Mesh | null, from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };
  // something carried lifts from the hands and swings into its place (the place is the hidden mesh itself)
  function launch(r: Resident, m: THREE.Mesh, fast: boolean) {
    if (fast || !r.model.root.visible) { m.visible = true; return; }
    if (fly.m) { fly.m.visible = true; }
    fly.t = 0; fly.m = m; r.held.getWorldPosition(fly.from); r.held.getWorldQuaternion(fly.fromQ); flyer.geometry = m.geometry; (flyer as THREE.Mesh).material = m.material as THREE.Material;
  }
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
  let fireK = 0, fireTalkT = 5, lastSpeaker = '', fireSaid = false, fireConv = 0, fireLines = 0, lastFireAt = 0;
  const fireQueue: { who: string; line: string }[] = [];
  const fireUsed = new Set<string>();
  const atFire = new Set<string>();

  /* ---------- the pier they build together ---------- */
  // Out from the beach in front of the hut into the lagoon: four pilings (a stone base Lantern brings,
  // a post Rakko swims out and sets on it) and eight deck planks Dot shapes and lays. Kamemaru surveys
  // it first. It starts once they have sat round the fire together a few times.
  const village = { fires: 0, pier: 'none' as 'none' | 'plan' | 'build' | 'done', bases: 0, posts: 0, deck: 0, treasures: [] as { what: string; who: string; at: number }[] };
  const pierAt = (() => {
    let best: { x: number; z: number; dx: number; dz: number; d: number } | null = null;
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * 6.28, dx = Math.cos(a), dz = Math.sin(a);
      for (let d = 6; d < 70; d += 1) { const x = PIT.x + dx * d, z = PIT.z + dz * d; if (L.h(x, z) < 0.05) { if (!best || d < best.d) best = { x: PIT.x + dx * (d - 2), z: PIT.z + dz * (d - 2), dx, dz, d }; break; } }
    }
    return best ?? { x: PIT.x, z: PIT.z, dx: 1, dz: 0, d: 0 };
  })();
  const along = (t: number) => [pierAt.x + pierAt.dx * t, pierAt.z + pierAt.dz * t] as [number, number];
  const pier = new THREE.Group(); group.add(pier);
  const PILE_T = [2.2, 4.6, 7.0, 9.4];
  const bases = PILE_T.map((t) => { const [x, z] = along(t); const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), stoneM); m.position.set(x, L.h(x, z) + 0.12, z); m.visible = false; pier.add(m); return m; });
  const posts = PILE_T.map((t) => { const [x, z] = along(t); const y0 = L.h(x, z) + 0.2, len = 0.95 - y0; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, Math.max(0.4, len), 7), wood2); m.position.set(x, y0 + Math.max(0.4, len) / 2, z); m.visible = false; pier.add(m); return m; });
  const planks = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const [x, z] = along(0.6 + k * 1.2); const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 1.3), k % 2 ? wood : wood2); m.position.set(x, 0.98, z); m.rotation.y = Math.atan2(pierAt.dx, pierAt.dz); m.visible = false; pier.add(m); return m; });
  const pierGhost = new THREE.Group(); pier.add(pierGhost); pierGhost.visible = false;
  for (const m of [...bases, ...posts, ...planks]) { const g = new THREE.Mesh(m.geometry, ghostM); g.position.copy(m.position); g.rotation.copy(m.rotation); pierGhost.add(g); }
  function drawPierSoon() { pierGhost.visible = village.pier === 'build'; pierGhost.children.forEach((g, i) => (g.visible = i < 4 ? i >= village.bases : i < 8 ? i - 4 >= village.posts : i - 8 >= village.deck)); }
  function drawPier() {
    bases.forEach((m, i) => (m.visible = i < village.bases)); posts.forEach((m, i) => (m.visible = i < village.posts)); planks.forEach((m, i) => (m.visible = i < village.deck));
    pierGhost.visible = village.pier === 'build';
    if (village.pier === 'build') pierGhost.children.forEach((g, i) => (g.visible = i < 4 ? i >= village.bases : i < 8 ? i - 4 >= village.posts : i - 8 >= village.deck));
  }
  const pileStand = (i: number, wet: boolean): [number, number] => { const [x, z] = along(PILE_T[i]); return wet ? [x + pierAt.dz * 0.8, z - pierAt.dx * 0.8] : [x - pierAt.dx * 1.2, z - pierAt.dz * 1.2]; };
  const plankStand = (k: number): [number, number] => along(Math.max(-0.6, 0.6 + k * 1.2 - 1.2));   // (on the last plank laid)
  // the ground under foot, counting the pier's deck as far as it is laid
  function G(x: number, z: number) {
    const h = L.h(x, z); if (!village.deck) return h;
    const rx = x - pierAt.x, rz = z - pierAt.z, t = rx * pierAt.dx + rz * pierAt.dz, side = Math.abs(rx * pierAt.dz - rz * pierAt.dx);
    return t > -0.8 && t < 0.6 * 0 + village.deck * 1.2 && side < 0.6 ? Math.max(h, 1.01) : h;
  }

  /* ---------- things the sea brings from far away ---------- */
  const DRIFT = [
    { id: 'bottle', ja: '瓶に入った手紙', geo: new THREE.CylinderGeometry(0.05, 0.06, 0.26, 10) },
    { id: 'gear', ja: '見慣れない歯車', geo: new THREE.TorusGeometry(0.1, 0.03, 6, 12) },
    { id: 'float', ja: 'ガラスの浮き玉', geo: new THREE.SphereGeometry(0.13, 12, 8) },
    { id: 'tag', ja: '異国の文字の木札', geo: new THREE.BoxGeometry(0.22, 0.02, 0.12) },
  ];
  const glassM = rmat(0x8fd6c8, 1.4);
  const driftMesh = new THREE.Mesh(DRIFT[0].geo, glassM); driftMesh.visible = false; group.add(driftMesh);
  const drift = { kind: -1, x: 0, z: 0, t: 0, by: '' };
  // the shelf by the hut where finds are kept
  const shelf = new THREE.Group(); { const w = atHut(1.6, -1.5); shelf.position.set(w.x, L.h(w.x, w.z), w.z); shelf.rotation.y = hut.rotation.y; group.add(shelf);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), wood); b.position.y = 0.55; shelf.add(b); for (const sx of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), wood2); l.position.set(sx, 0.27, 0); shelf.add(l); } }
  const shelfItems = DRIFT.map((d, i) => { const m = new THREE.Mesh(d.geo, i === 1 ? stoneM : i === 3 ? wood : glassM); m.position.set(-0.3 + i * 0.2, 0.66, 0); if (i === 0) m.rotation.z = Math.PI / 2; m.visible = false; shelf.add(m); return m; });
  function drawShelf() { DRIFT.forEach((d, i) => (shelfItems[i].visible = village.treasures.some((t) => t.what === d.ja))); }
  function tickDrift(dt: number) {
    drift.t += dt;
    if (drift.kind < 0 && drift.t > 5 * 3600) {   // every few hours something washes up, somewhere along the shore
      drift.t = 0;
      const at = spot([PIT.x, PIT.z], 260, tideline, 80); if (!at) return;
      const left = DRIFT.map((_, i) => i).filter((i) => !village.treasures.some((t) => t.what === DRIFT[i].ja));
      drift.kind = (left.length ? left : [0, 1, 2, 3])[Math.floor(Math.random() * (left.length || 4))]; drift.x = at[0]; drift.z = at[1]; drift.by = '';
      driftMesh.geometry = DRIFT[drift.kind].geo; driftMesh.position.set(drift.x, L.h(drift.x, drift.z) + 0.06, drift.z); driftMesh.rotation.set(0, Math.random() * 6, drift.kind === 0 ? Math.PI / 2 : 0); driftMesh.visible = true;
    }
  }
  // Rakko's pile of shells on the beach; Lantern's cairns where it stopped to think
  const shellGeo = new THREE.SphereGeometry(0.05, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const pile = new THREE.InstancedMesh(shellGeo, shellM, 80); pile.count = 0; group.add(pile);
  const cairnGeo = new THREE.DodecahedronGeometry(0.16, 0);
  const cairns = new THREE.InstancedMesh(cairnGeo, stoneM, 60); cairns.count = 0; group.add(cairns);
  const cairnSpots: number[][] = [];   // [x, z, stones so far]

  /* ---------- the residents ---------- */
  const list: Resident[] = SPECS.map((sp) => {
    const model = ((sp.living ? ckit : kit) as any)[sp.make]() as Robot;
    model.root.scale.setScalar(sp.scale);
    group.add(model.root);
    const r: Resident = {
      id: sp.id, v: VOICES[sp.id], sp, model,
      pos: new THREE.Vector3(sp.home[0], L.h(sp.home[0], sp.home[1]), sp.home[1]), head: Math.random() * 6.28, mo: { stride: 0, px: NaN, pz: 0, ph: 0, gait: 0, key: 0, t: 0, act: '', task: null, look: null }, battery: sp.living ? 1 : 0.8, hunger: 0.4, sleepy: 0.2, meal: {}, under: 0,
      task: null, walk: 0, act: 'idle', wet: false, talk: null, saying: '', sayT: 0,
      stats: { built: 0, notes: 0, shells: 0, cracked: 0, visited: 0, cairns: 0, wood: 0, food: 0, felled: 0 },
      today: [], diary: [], blocked: 0,
      subject: null as any, holding: '', held: new THREE.Mesh(new THREE.BufferGeometry(), wood),
      beam: new THREE.Mesh(BEAM_GEO[sp.id], new THREE.MeshBasicMaterial({ color: LIGHT[sp.id].c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    };
    r.beam.position.set(0, LIGHT[sp.id].y, 0.12); r.beam.rotation.x = -(Math.PI / 2 - LIGHT[sp.id].tilt); r.beam.visible = false; model.root.add(r.beam);
    r.held.visible = false; if (model.hand) model.hand.add(r.held); else { r.held.position.set(0, 0.5, 0.27); model.root.add(r.held); }
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
      if (h > 0.2 && T.vegH && T.vegH(x, z) > 0.45) continue;   // (not into the middle of a thicket)
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
    wood: { near: byId.dot.sp.home, rad: 160, ok: tideline, max: 8, every: 1200 },
    shell: { near: byId.rakko.sp.home, rad: 170, ok: tideline, max: 16, every: 260 },
    stone: { near: [byId.lantern.sp.home[0] - 40, byId.lantern.sp.home[1] + 20], rad: 140, ok: (x, z, h) => h > 1.2 && cover(x, z).can < 0.4, max: 12, every: 900 },
  }, itemMat, group);

  /* ---------- the diary and what happened today ---------- */
  function note(r: Resident, key: string, vars: Record<string, string | number> = {}, today?: string) {
    const lines = r.v.diary[key]; if (!lines) return;
    const text = fill(pickOne(lines), { ...statVars(r), ...vars });
    r.diary.push({ at: clockMs, text, key }); if (r.diary.length > 400) r.diary.shift();
    if (today) { r.today.push(today); if (r.today.length > 6) r.today.shift(); }
    res.onEvent(key, `${r.v.name}：${text}`, r);
  }
  const statVars = (r: Resident) => {
    const s = r.stats, map = Math.round(Math.min(100, visited.size / 3.2));
    return { built: s.built, notes: s.notes, shells: s.shells, map, food: s.food, deck: village.deck,
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
  // The two animals: what their bodies ask for comes first. Rakko dives for its food when it is hungry
  // (by night too, if it is very hungry) and sleeps on its back; Kamemaru grazes the seagrass, sleeps on
  // the bottom by night, and hauls out to bask on a warm afternoon.
  const water = (lo: number, hi: number) => (x: number, z: number, h: number) => h < -lo && h > -hi;
  function forage(at: [number, number] | null): Task | null {
    const q = Math.random(), prey: Food = Math.random() < 0.28 ? '' : q < 0.42 ? 'urchin' : q < 0.68 ? 'crab' : 'clam';   // (what it will come up with, if anything)
    return task('forage', at, 'dive', rr(35, 75), { wet: true, data: prey });
  }
  function live(r: Resident, hr: number): Task | null | undefined {
    const home = r.sp.home, day = dayK(hr), night = sleepTime(r, hr);
    if (r.id === 'rakko') {
      if (r.holding) return undefined;
      if (r.hunger > (night ? 0.85 : 0.5)) return forage(spot(home, 70, water(1.5, 7)) ?? spot(home, 120, water(1, 9)));
      if (night) return task('sleep', spot(home, 60, water(0.6, 3)) ?? spot(home, 140, water(0.5, 6)) ?? home, 'sleep', 1200, { wet: true });   // (always in the water, on its back)
      if (r.sleepy > 0.65 && day > 0.3) return task('nap', spot(home, 50, water(0.8, 4)), 'sleep', rr(600, 1500), { wet: true });
      return undefined;
    }
    if (night) return task('sleep', spot(home, 60, water(1.5, 5)) ?? spot(home, 140, water(1, 8)) ?? home, 'sleep', 1800, { wet: true });
    if (r.holding) return undefined;
    if (r.hunger > 0.45 && day > 0.15) return task('graze', spot(home, 90, water(1.2, 5)) ?? spot(home, 160, water(1, 7)), 'graze', rr(2400, 4200), { wet: true });
    if ((r.sleepy > 0.6 || Math.random() < 0.15) && day > 0.7 && hr > 10 && hr < 16.5) return task('bask', spot(home, r.sp.range, shore, 200), 'bask', rr(1500, 3600));
    return undefined;
  }
  function decide(r: Resident, hr: number): Task | null {
    const home = r.sp.home, day = dayK(hr);
    if (r.sp.living) { const t = live(r, hr); if (t !== undefined) return t; }
    if (sleepTime(r, hr)) {
      if (r.id === 'rakko') return task('sleep', spot(home, 6, (x, z, h) => h < -0.6 && h > -3) ?? home, 'sleep', 1200, { wet: true });
      return task('sleep', home, 'sleep', 1200);
    }
    if (r.battery < 0.3 && day > 0.4 && !r.sp.nightOwl && !r.sp.living) return task('charge', spot(home, 30, open), 'idle', rr(600, 1400));
    const q = Math.random();
    // something strange lying on the beach nearby: go and look
    if (drift.kind >= 0 && !drift.by && !r.holding && Math.hypot(drift.x - r.pos.x, drift.z - r.pos.z) < 60) { drift.by = r.id; return task('find', [drift.x, drift.z], 'pick', 6); }
    if (r.holding === 'drift') return task('shelve', (() => { const w = shelf.position; return [w.x + 0.6, w.z + 0.6] as [number, number]; })(), 'work', 4);
    // the pier, once they have agreed on it
    if (village.pier === 'plan' && r.id === 'kame') return task('survey', along(1), 'look', rr(60, 120));
    if (village.pier === 'build') {
      if (r.id === 'lantern' && r.holding === 'stone' && village.bases < 4) return task('base', along(-0.8), 'work', 6);   // (from the shore it hands the stone out)
      if (r.id === 'rakko' && r.holding === 'wood' && village.posts < village.bases) return task('post', pileStand(village.posts, true), 'work', 8, { wet: true });
      if (r.id === 'dot' && r.holding === 'plank') return task('deck', plankStand(village.deck), 'hammer', 8);
      if (r.id === 'rakko' && !r.holding && village.posts < village.bases && q < 0.3) {
        const it = items.nearest('wood', r.pos.x, r.pos.z, 260, r.id);
        if (it) { items.claim(it, r.id); return task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
      }
      if (r.id === 'lantern' && !r.holding && village.bases < 4 && q < 0.35 && 1 - dayK(hr) > 0.5) {
        const it = items.nearest('stone', r.pos.x, r.pos.z, 400, r.id);
        if (it) { items.claim(it, r.id); return task('fetch', [it.x, it.z], 'work', 3, { data: it }); }
      }
      if (r.id === 'kame' && q < 0.2) return task('inspect', along(4), 'look', rr(120, 300));   // keeping an eye on the work, and the tide
      if (r.id === 'dot' && !r.holding && village.posts >= 4 && village.deck < 8 && (r.stats.built >= HUT.length || q < 0.15) && q < 0.3) {
        const it = items.nearest('wood', r.pos.x, r.pos.z, 220, r.id);
        if (it) { items.claim(it, r.id); return task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
      }
    }
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
        if (r.holding === 'shell') return task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3);
        if (q < 0.35) return task('float', spot(home, 60, (x, z, h) => h < -0.8 && h > -4), 'float', rr(300, 800), { wet: true });
        if (q < 0.5) return task('groom', spot(home, 50, (x, z, h) => h < -0.8 && h > -4), 'groom', rr(90, 200), { wet: true });   // (its fur is all that keeps it warm: it grooms for hours a day)
        if (q < 0.85) {
          const it = items.nearest('shell', r.pos.x, r.pos.z, 200, r.id);
          if (it) { items.claim(it, r.id); return task('collect', [it.x, it.z], 'pick', 3, { data: it }); }
        }
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
        r.holding = 'wood';
        if (r.id !== 'dot') { r.today.push('桟橋の柱にする木を拾った'); r.task = null; return; }
        r.stats.wood = 1; note(r, 'gather', {}, '流木を拾った');
        r.task = task('craft', benchStand(), 'work', rr(45, 75)); return;
      case 'craft':
        r.stats.wood = 0;
        if (r.stats.built >= HUT.length && village.pier === 'build') { r.holding = 'plank'; r.task = null; return; }   // (a plank for the pier)
        r.holding = 'piece'; r.task = r.stats.built < HUT.length ? task('place', slotStand(r.stats.built), 'hammer', 7) : null; return;
      case 'place': {
        const k = r.stats.built; if (k >= HUT.length) { r.holding = ''; break; }
        r.holding = ''; r.stats.built++;
        launch(r, HUT[k], fast);
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
      case 'forage': {
        // up with something: roll over and eat it; or nothing this time: down again, a little way off
        const prey = tk.data as Food;
        if (prey) { r.task = task('eat', [r.pos.x, r.pos.z], prey === 'clam' ? 'work' : 'eat', prey === 'clam' ? rr(60, 120) : prey === 'crab' ? rr(70, 130) : rr(50, 100), { wet: true, data: prey, arrived: true }); return; }
        r.task = forage(spot([r.pos.x, r.pos.z], 12, water(1.2, 8)) ?? [r.pos.x, r.pos.z]); return;
      }
      case 'eat': {
        const prey = tk.data as string;
        r.hunger = Math.max(0, r.hunger - (prey === 'crab' ? 0.2 : prey === 'urchin' ? 0.15 : 0.12));
        r.meal[prey] = (r.meal[prey] ?? 0) + 1; if (prey === 'clam') r.stats.cracked++;
        if (r.hunger > 0.12) { r.task = forage(spot([r.pos.x, r.pos.z], 12, water(1.2, 8)) ?? [r.pos.x, r.pos.z]); return; }
        const NAME: Record<string, [string, string]> = { urchin: ['ウニ', 'つ'], crab: ['カニ', '匹'], clam: ['貝', 'つ'] };
        const meal = Object.entries(r.meal).map(([k, n]) => `${NAME[k][0]}${n}${NAME[k][1]}`).join('、'); r.meal = {};
        note(r, 'eat', { meal }, `${meal}食べた`);
        r.task = task('groom', [r.pos.x, r.pos.z], 'groom', rr(60, 150), { wet: true, arrived: true }); return;   // (after eating, cleaning the fur)
      }
      case 'groom': if (Math.random() < 0.25) note(r, 'groom', {}, '毛づくろいをした'); break;
      case 'graze': r.stats.notes++; note(r, 'graze', { sight: sight() }, 'ラグーンで海草を食べた'); break;
      case 'bask': note(r, 'bask', {}, '浜で甲羅干しをした'); break;
      case 'collect':
        if (!items.take(tk.data)) break;
        r.holding = 'shell'; r.task = task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3); return;
      case 'pile': if (r.holding !== 'shell') break; r.holding = ''; r.stats.shells++; buildPile(); note(r, 'collect', {}, 'きれいな貝殻を拾った'); break;
      case 'survey': if (village.pier === 'plan') { village.pier = 'build'; drawPier(); note(r, 'survey', {}, '桟橋の位置を測った'); res.onEvent('pier', 'カメマルが桟橋の位置を測り終えた。いよいよ建設開始', r); } break;
      case 'inspect': r.today.push('桟橋の工事を見守った'); break;
      case 'base': if (r.holding !== 'stone' || village.bases >= 4) break; r.holding = ''; launch(r, bases[village.bases], fast); village.bases++; drawPierSoon(); note(r, 'base', {}, '桟橋の土台石を据えた'); break;
      case 'post': if (r.holding !== 'wood' || village.posts >= village.bases) break; r.holding = ''; launch(r, posts[village.posts], fast); village.posts++; drawPierSoon(); note(r, 'post', {}, '桟橋の柱を立てた'); break;
      case 'deck':
        if (r.holding !== 'plank' || village.deck >= 8) break; r.holding = ''; launch(r, planks[village.deck], fast); village.deck++; drawPierSoon();
        if (village.deck >= 8) { village.pier = 'done'; for (const o of list) note(o, 'pierDone', {}, 'みんなで桟橋を完成させた'); res.onEvent('pier', '桟橋が完成した！ みんなでつくった、はじめての大きなもの', r); }
        else note(r, 'deck', {}, '桟橋の板を張った');
        break;
      case 'find':
        if (drift.kind < 0 || drift.by !== r.id) break;
        r.holding = 'drift'; driftMesh.visible = false; r.task = null;
        r.today.push(`浜で${DRIFT[drift.kind].ja}を見つけた`); note(r, 'find', { thing: DRIFT[drift.kind].ja }); res.onEvent('drift', `${r.v.name}が浜で${DRIFT[drift.kind].ja}を見つけた`, r); return;
      case 'shelve':
        if (r.holding !== 'drift') break;
        r.holding = ''; village.treasures.push({ what: DRIFT[drift.kind].ja, who: r.v.name, at: clockMs }); drift.kind = -1; drift.t = 0; drawShelf(); break;
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
  // what it costs to cross a metre of the island on foot: the sea cannot be walked; growth above the waist
  // (a thicket of naupaka or pandanus, a boulder, the forest's undergrowth) it goes round when it can
  const WAIST = 0.45;
  const walkCost = (x: number, z: number) => {
    if (G(x, z) < 0.2) return Infinity;
    const v = T.vegH ? T.vegH(x, z, 0.6) : 0;
    return v > WAIST ? 30 : 1 + v;
  };
  function move(r: Resident, tx: number, tz: number, dt: number, wetTask: boolean, fast = false) {
    const dx0 = tx - r.pos.x, dz0 = tz - r.pos.z, d0 = Math.hypot(dx0, dz0);
    if (d0 < 0.6) { r.path = undefined; return true; }
    // on land, to somewhere on land: plan a way round what is in the way (again if the goal has moved off)
    let ax = tx, az = tz;
    if (!fast && G(r.pos.x, r.pos.z) > 0.2 && G(tx, tz) > 0.2) {
      const P = r.path;
      if (!P || (Math.hypot(P.tx - tx, P.tz - tz) > 4 && clockMs - P.t > 3000)) {
        r.path = { pts: d0 > 2 ? findPath(r.pos.x, r.pos.z, tx, tz, walkCost) ?? [[tx, tz]] : [[tx, tz]], tx, tz, t: clockMs };
      }
      const pts = r.path!.pts;
      while (pts.length > 1 && Math.hypot(pts[0][0] - r.pos.x, pts[0][1] - r.pos.z) < 0.9) pts.shift();
      if (pts.length > 1 || Math.hypot(r.path!.tx - tx, r.path!.tz - tz) < 4) { ax = pts[0][0]; az = pts[0][1]; }
    } else r.path = undefined;
    const dx = ax - r.pos.x, dz = az - r.pos.z, d = Math.max(Math.hypot(dx, dz), Math.min(d0, 0.7));
    let want = Math.atan2(dx, dz);
    const inWater = G(r.pos.x, r.pos.z) < 0.1;
    const speed = (inWater ? r.sp.swimSpeed || 0.3 : r.sp.speed) * (r.battery < 0.1 ? 0.5 : 1);
    // walkers keep to land: if the way ahead is water, turn uphill along the shore
    if (!r.sp.swims || (!wetTask && !inWater)) {
      const ax = r.pos.x + Math.sin(want) * 2, az = r.pos.z + Math.cos(want) * 2;
      if (G(ax, az) < 0.25 && !(r.sp.swims && wetTask)) {
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
    let moved = 0;
    if (r.sp.swims || G(nx, nz) > 0.2) { r.pos.x = nx; r.pos.z = nz; moved = step; if (!fast) T.pushTrees?.(r.pos); }
    else r.blocked += dt * 2;   // (the way ahead is water: it stops, rather than marching on the spot, and soon thinks again)
    r.walk = moved / Math.max(dt, 1e-3) / speed;   // (legs move only as fast as it really goes)
    return false;
  }
  function placeY(r: Resident) {
    const h = r.wet && r.sp.swims && (r.act === 'swim' || r.under > 0) ? L.h(r.pos.x, r.pos.z) : G(r.pos.x, r.pos.z);
    r.wet = h < 0.05;
    const top = r.id === 'rakko' ? 0 : -0.2;   // floating at the surface (Rakko), or with its head out (Kamemaru)
    if (!r.wet) r.pos.y = h;
    else if (r.under > 0) r.pos.y = top + (h + (r.id === 'rakko' ? 0.18 : 0.1) - top) * r.under;   // (down on the bottom: diving, grazing, asleep)
    else if (r.id === 'kame' && r.act === 'swim') r.pos.y = Math.max(h + 0.3, -1.2 + Math.sin(performance.now() * 0.0003) * 0.2);
    else r.pos.y = top;
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
    tk.a.diary.push({ at: clockMs, text: `${tk.b.v.name}と会って、${summary}。`, key: 'met', with: tk.b.id }); tk.b.diary.push({ at: clockMs, text: `${tk.a.v.name}と会って、${summary}。`, key: 'met', with: tk.a.id });
    for (const r of [tk.a, tk.b]) if (r.diary.length > 400) r.diary.shift();
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
      if (a.talk || b.talk || a.act === 'sleep' || b.act === 'sleep' || a.task?.kind === 'fire' || b.task?.kind === 'fire' || a.under > 0.2 || b.under > 0.2) continue;   // (not with one of them down on the bottom)
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
    if (!r.sp.living) r.battery = Math.min(1, Math.max(0, r.battery + dt * ((busy ? -1 / 21600 : -1 / 72000) + (!busy ? day / 5400 : day / 21600))));
    else {
      // an otter must eat about a quarter of its weight a day, so it is soon hungry again; a turtle, slowly
      r.hunger = Math.min(1, r.hunger + dt / (r.id === 'rakko' ? 16000 : 45000));
      r.sleepy = Math.min(1, Math.max(0, r.sleepy + dt * (r.act === 'sleep' ? -1 / 9000 : r.act === 'bask' || r.act === 'float' ? -1 / 40000 : 1 / 57600)));
      if (r.task?.kind === 'graze' && r.task.arrived && r.act === 'graze') r.hunger = Math.max(0, r.hunger - dt / 4000);   // (grazing is slow: an hour or more a meal)
    }
    if (r.talk) { if (r.talk.a === r) stepTalk(r.talk, dt, fast); placeY(r); return; }
    // the evening fire: everyone who is up comes and sits round it, and goes off again after
    if (gatherHours(hr) && !sleepTime(r, hr) && r.task?.kind !== 'fire') {
      items.release(r.id); if (drift.by === r.id && r.holding !== 'drift') drift.by = '';
      const seat = seatAt(list.indexOf(r));
      r.task = task('fire', seat, 'sit', 1e9); r.blocked = 0;
    }
    if (r.task?.kind === 'fire' && !gatherHours(hr)) {
      if (atFire.has(r.id)) note(r, 'fire', {}, '焚き火を囲んだ');
      r.task = null; r.saying = '';
    }
    if (!r.task || (sleepTime(r, hr) !== (r.task.kind === 'sleep') && r.task.kind !== 'approach' && !(r.sp.living && ['forage', 'eat', 'groom'].includes(r.task.kind)))) {
      r.task = (!sleepTime(r, hr) && maybeVisit(r, hr)) || decide(r, hr);
      r.blocked = 0;
      if (!r.task) { r.act = 'idle'; r.walk = 0; placeY(r); return; }
    }
    const tk = r.task;
    if (tk.kind === 'approach') { const o = byId[tk.data]; tk.x = o.pos.x; tk.z = o.pos.z; if (Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) < 3) { r.task = null; r.walk = 0; return; } }
    r.under = 0;
    if (!tk.arrived) {
      r.act = r.wet ? 'swim' : r.holding ? 'carry' : 'walk';
      tk.arrived = move(r, tk.x, tk.z, dt, !!tk.wet, fast);
      tk.t += dt;
      if (tk.t > 1800 || r.blocked > 20) { items.release(r.id); if (drift.by === r.id && r.holding !== 'drift') drift.by = ''; r.task = null; return; }   // could not get there: think again
      if (tk.arrived) tk.t = 0;
      if (r.id === 'lantern') visited.add(cellOf(r.pos.x, r.pos.z));
    } else {
      r.walk = 0; r.act = tk.act;
      if (tk.kind === 'fire') { atFire.add(r.id); let d = Math.atan2(PIT.x - r.pos.x, PIT.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 2); }
      if (tk.kind === 'watch' || tk.kind === 'look') { let d = Math.atan2(-r.pos.x + (r.sp.home[0] - 60), -r.pos.z + (r.sp.home[1] + 80)) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt); }
      tk.t += dt;
      if (r.sp.living && r.wet) {
        if (tk.kind === 'forage') { const k = tk.t / tk.dur; r.under = smooth01(0, 0.12, k) * (1 - smooth01(0.86, 1, k)); }   // (down head first, along the bottom, back up)
        else if (tk.kind === 'graze' || (r.id === 'kame' && tk.kind === 'sleep')) {
          // a turtle comes up to breathe: every few minutes while it feeds, every forty or so asleep
          const per = tk.kind === 'sleep' ? 2400 : 420, ph = tk.t % per;
          const up = smooth01(per - 46, per - 32, ph) * (1 - smooth01(per - 14, per - 2, ph));
          r.under = 1 - up; if (up > 0.5) r.act = 'breathe';
        }
        if (tk.kind === 'graze' && r.hunger < 0.05 && tk.t > 240 && r.under > 0.99) tk.t = tk.dur + 1;   // (full)
      }
      if (tk.t > tk.dur) done(r, tk, fast);
    }
    placeY(r);
  }

  /* ---------- saving and catching up ---------- */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        at: Date.now(), clockMs, visited: [...visited], cairns: cairnSpots, bonds, talks: talks.slice(-160), items: items.save(), trees: TREES.map((t) => (t.down ? 1 : 0)), plots: PLOTS.map((pl) => [pl.s, pl.at]), village, lastFireAt, drift: drift.kind >= 0 ? drift : null,
        list: list.map((r) => ({ id: r.id, pos: [r.pos.x, r.pos.z], head: r.head, battery: r.battery, hunger: r.hunger, sleepy: r.sleepy, stats: r.stats, today: r.today, diary: r.diary.slice(-300), holding: r.holding })),
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
      r.pos.set(d.pos[0], 0, d.pos[1]); r.head = d.head; r.battery = r.sp.living ? 1 : d.battery; r.hunger = d.hunger ?? 0.4; r.sleepy = d.sleepy ?? 0.2; Object.assign(r.stats, d.stats); r.today = d.today || []; r.diary = d.diary || [];
      r.holding = d.holding ?? (r.id === 'dot' && r.stats.wood > 0 ? 'wood' : '');
    }
    for (let i = 0; i < Math.min(byId.dot.stats.built, HUT.length); i++) HUT[i].visible = true;
    (s.trees || []).forEach((d: number, i: number) => { const t = TREES[i]; if (t && d && t.ok) { t.down = true; t.pivot.visible = false; t.stump.visible = true; } });
    (s.plots || []).forEach((d: number[], i: number) => { const pl = PLOTS[i]; if (pl) { pl.s = d[0]; pl.at = d[1]; } });
    if (s.village) Object.assign(village, s.village);
    lastFireAt = s.lastFireAt ?? 0;
    if (s.drift && s.drift.kind >= 0) { Object.assign(drift, s.drift); driftMesh.geometry = DRIFT[drift.kind].geo; driftMesh.position.set(drift.x, L.h(drift.x, drift.z) + 0.06, drift.z); driftMesh.visible = !drift.by || !list.some((r) => r.holding === 'drift'); }
    drawPier(); drawShelf();
    buildPile(); buildCairns();
    return Math.min(12 * 3600, Math.max(0, (Date.now() - s.at) / 1000));   // how long they lived on without us (up to half a day)
  }

  // what it is doing, in words
  function statusOf(r: Resident): string {
    if (r.talk) { const o = r.talk.a === r ? r.talk.b : r.talk.a; return `${o.v.name}と話している`; }
    const tk = r.task, k = tk?.kind ?? 'idle';
    const far = tk && !tk.arrived ? Math.round(Math.hypot(tk.x - r.pos.x, tk.z - r.pos.z)) : 0, left = far > 3 ? `（あと${far}m）` : '';
    const going: Record<string, string> = { eat: '獲物をかかえて浮かんでいる', forage: '餌場へ泳いでいく', graze: '海草の原へ泳いでいく', bask: '甲羅干しの浜へ向かう', groom: '静かな水面へ', survey: '桟橋の場所へ向かう', inspect: '桟橋の工事を見に行く', base: '土台の石を桟橋へ運んでいる', post: '柱にする木を桟橋へ運んでいる', deck: '桟橋の板を運んでいる', find: '浜で見慣れないものを見つけて近づいていく', shelve: '見つけたものを小屋の棚へ運んでいる', chop: '若木のところへ向かう', till: '畑へ向かう', plant: '畑へ種をまきに行く', harvest: '畑へ収穫に行く', fire: '焚き火へ向かっている', gather: '流木を拾いに行く', collect: '貝殻を拾いに行く', fetch: '石積みの石を拾いに行く', craft: '流木を作業台へ運んでいる', place: `削った部材を小屋へ運んでいる`, pile: '貝殻を運んでいる', stack: '石を石積みへ運んでいる' };
    const prey = ({ urchin: 'ウニ', crab: 'カニ', clam: '貝' } as Record<string, string>)[tk?.data] ?? '';
    const k01 = tk ? tk.t / tk.dur : 0;
    const at: Record<string, string> = {
      forage: k01 < 0.12 ? '頭から潜っていく' : k01 > 0.86 ? (prey ? `${prey}をかかえて浮かんでくる` : '手ぶらで浮かんでくる') : '海の底で、前足で岩の下を探っている',
      eat: tk?.data === 'clam' ? 'お腹の上の石で貝を割って食べている' : `仰向けに浮かんで、${prey}を食べている`,
      groom: '水面で転がりながら毛づくろいしている',
      graze: r.act === 'breathe' ? '息つぎに浮かんできた' : '海の底で海草を食べている',
      bask: '浜で甲羅干しをしている',
      survey: '桟橋の場所を測っている', inspect: '桟橋の工事と潮を見守っている', base: '土台の石を据えている', post: '泳ぎながら柱を立てている', deck: `桟橋に板を張っている（${village.deck + 1}/8）`, find: '見つけたものを拾い上げて調べている', shelve: '見つけたものを棚に飾っている', chop: '斧で若木を切っている', till: '鍬で畑を耕している', plant: '種をまいている', harvest: '実を収穫している', fire: '焚き火を囲んで話している', gather: '流木を拾い上げている', collect: '貝殻を拾い上げている', fetch: '石を拾い上げている', craft: `作業台で流木を部材に削っている（${r.stats.built + 1}本目）`, place: `部材を小屋に取りつけている（${r.stats.built + 1}/${HUT.length}）`, pile: '貝殻を浜に並べている', stack: '石を積み上げている' };
    if (!r.talk && tk && going[k]) return tk.arrived ? at[k] : going[k] + left;
    const base: Record<string, string> = {
      sleep: r.id === 'kame' && r.wet ? (r.act === 'breathe' ? '眠りの合間に息つぎに浮かんできた' : '海の底の岩かげで眠っている') : r.wet ? '仰向けで波に揺られて眠っている' : '眠っている', charge: '日なたで充電している', gather: tk?.arrived ? '流木を拾っている' : '流木を探しに浜へ', carry: '流木を運んでいる', build: '小屋を建てている',
      look: '海を眺めている', wander: '散歩している', watch: '浜で海を観察している', swim: 'ラグーンを泳いで記録している', rest: '丘のふもとで夜を待っている', think: '丘の上で星を見て考えごとをしている',
      explore: '夜の島を歩いて地図を作っている', float: '沖で仰向けに浮かんでいる', crack: 'お腹の上で貝を割っている', collect: '浜で貝殻を拾っている', pile: '貝殻を浜に並べている', nap: '仰向けに浮いたまま昼寝している',
      visit: 'となりの浜のほうへ散歩している', approach: '誰かに気づいて近づいていく', idle: 'ひと休みしている',
    };
    return base[k] ?? 'ひと休みしている';
  }
  const res: Residents = {
    list, bonds, talks, group,
    onEvent: () => { /* set by the app */ },
    onSay: () => { /* set by the app */ },
    hide: '',
    sense(r) {
      const EYE: Record<string, number> = { dot: 0.9, kame: 0.46, lantern: 0.88, rakko: 0.62 };
      const fx = Math.sin(r.head), fz = Math.cos(r.head);
      const eye = new THREE.Vector3(r.pos.x + fx * 0.2, r.wet ? Math.max(0.32, r.pos.y + 0.3) : r.pos.y + EYE[r.id] * r.sp.scale, r.pos.z + fz * 0.2);
      if (r.id === 'kame' && r.wet && r.act === 'swim') eye.y = r.pos.y + 0.2;   // (swimming under the water, looking through it)
      if (r.wet && r.pos.y < -0.3) eye.y = r.pos.y + 0.15;   // (down on the bottom)
      const marks: Mark[] = [], near = (x: number, z: number, d: number) => Math.hypot(x - r.pos.x, z - r.pos.z) < d;
      const tk = r.task, tgt = tk && tk.data;
      const NAME: Record<string, string> = { wood: '流木', shell: '貝殻', stone: '石' };
      for (const it of items.list) if (near(it.x, it.z, 45)) marks.push({ x: it.x, y: L.h(it.x, it.z) + 0.1, z: it.z, kind: it.kind, label: NAME[it.kind], hot: tgt === it });
      for (const o of list) if (o !== r && near(o.pos.x, o.pos.z, 70)) { const bd = bonds[pair(r.id, o.id)]; marks.push({ x: o.pos.x, y: o.pos.y + 1.1 * o.sp.scale, z: o.pos.z, kind: 'friend', label: o.v.name, sub: STAGES[bd.stage], color: o.sp.color, hot: tk?.kind === 'approach' && tk.data === o.id }); }
      if (near(hut.position.x, hut.position.z, 90)) {
        marks.push({ x: hut.position.x, y: hut.position.y + 2.1, z: hut.position.z, kind: 'place', label: 'ドットの小屋', sub: r.stats.built >= HUT.length || byId.dot.stats.built >= HUT.length ? '完成' : `部材 ${byId.dot.stats.built}/${HUT.length}` });
        marks.push({ x: PIT.x, y: PIT.y + 0.5, z: PIT.z, kind: 'place', label: '焚き火台', hot: tk?.kind === 'fire' });
        if (r.id === 'dot') {
          const b = hut.localToWorld(benchL.clone()); marks.push({ x: b.x, y: b.y + 0.7, z: b.z, kind: 'place', label: '作業台', hot: tk?.kind === 'craft' });
          if (byId.dot.stats.built < HUT.length) { const w = slotWorld(byId.dot.stats.built); marks.push({ x: w.x, y: w.y, z: w.z, kind: 'slot', label: `次の部材 #${byId.dot.stats.built + 1}`, hot: tk?.kind === 'place' }); }
          for (const pl of PLOTS) if (pl.ok) marks.push({ x: pl.x, y: L.h(pl.x, pl.z) + 0.3, z: pl.z, kind: 'plot', label: '畑', sub: pl.s === 0 ? '未開墾' : pl.s === 1 ? '耕した' : growth(pl) >= 1 ? '収穫どき' : `生育 ${Math.round(growth(pl) * 100)}%`, hot: tgt === pl });
          for (const t of TREES) if (t.ok && !t.down) marks.push({ x: t.x, y: L.h(t.x, t.z) + 2.2, z: t.z, kind: 'tree', label: '若木', sub: 'モクマオウ', hot: tgt === t });
        }
      }
      for (const c of cairnSpots) if (near(c[0], c[1], 60)) marks.push({ x: c[0], y: L.h(c[0], c[1]) + 0.2 + 0.22 * c[2], z: c[1], kind: 'place', label: '石積み', sub: `${c[2]}/4 段`, hot: tgt === c });
      { const [px, pz] = pileAt(0); if (near(px, pz, 60)) marks.push({ x: px, y: L.h(px, pz) + 0.3, z: pz, kind: 'place', label: '貝殻の山', sub: `${byId.rakko.stats.shells}個`, hot: tk?.kind === 'pile' }); }
      if (village.pier !== 'none' && near(pierAt.x, pierAt.z, 90)) { const [x, z] = along(5); marks.push({ x, y: 1.3, z, kind: 'place', label: '桟橋', sub: village.pier === 'plan' ? '計画中' : village.pier === 'done' ? '完成' : `土台 ${village.bases}/4・柱 ${village.posts}/4・板 ${village.deck}/8`, hot: ['survey', 'inspect', 'base', 'post', 'deck'].includes(tk?.kind ?? '') }); }
      if (drift.kind >= 0 && !list.some((o) => o.holding === 'drift') && near(drift.x, drift.z, 60)) marks.push({ x: drift.x, y: L.h(drift.x, drift.z) + 0.2, z: drift.z, kind: 'drift', label: '？ 見慣れないもの', hot: tk?.kind === 'find' });
      let target: Mark | null = marks.find((m) => m.hot) ?? null;
      if (!target && tk && !tk.arrived) target = { x: tk.x, y: L.h(tk.x, tk.z) + 0.2, z: tk.z, kind: 'goal', label: '目的地', hot: true };
      return { eye, head: r.head, marks, target, task: tk?.kind ?? 'idle', built: byId.dot.stats.built, hutN: HUT.length, food: byId.dot.stats.food };
    },
    gibber,
    update(dt, ms, cam) {
      clockMs = ms;
      items.tick(dt); tickDrift(dt);
      for (const r of list) step(r, dt, false);
      fireCircle(dt, false);
      // their lights: on after dark while they are up and about (not asleep, not under the water)
      { const nightK = 1 - dayK(localHour(ms)), tt = performance.now() / 1000;
        list.forEach((r, i) => {
          const Lt = LIGHT[r.id], on = r.sp.living ? 0 : nightK * (r.act === 'sleep' || (r.wet && r.act === 'swim') ? 0 : 1);   // (the animals carry no light)
          r.lightK = (r.lightK ?? 0) + (on - (r.lightK ?? 0)) * Math.min(1, dt * 0.8);
          const fx = Math.sin(r.head), fz = Math.cos(r.head), sway = Math.sin(tt * 1.3 + i) * 0.15;
          U.uLights.value[i].set(r.pos.x + (fx + fz * sway) * Lt.ahead, r.pos.y, r.pos.z + (fz - fx * sway) * Lt.ahead, r.lightK * Lt.k * (0.94 + 0.06 * Math.sin(tt * 2.1 + i * 2)));
          (U.uLightR.value as any).setComponent(i, Lt.r);
          U.uLightC.value[i].set(((Lt.c >> 16) & 255) / 255, ((Lt.c >> 8) & 255) / 255, (Lt.c & 255) / 255);
          r.beam.visible = r.lightK > 0.02; (r.beam.material as THREE.MeshBasicMaterial).opacity = 0.07 * r.lightK; r.beam.rotation.y = sway * 0.6;
        }); }
      animateWork(dt);
      if ((meetT -= dt) < 0) { meetT = 1; checkMeetings(false); }
      for (const r of list) {
        const near = Math.hypot(r.pos.x - cam.x, r.pos.z - cam.z) < 160;
        r.model.root.visible = near && res.hide !== r.id;
        if (!near) continue;
        r.model.root.position.copy(r.pos); r.model.root.rotation.y = r.head;
        const act: Act = r.id === 'dot' ? r.act : r.act === 'sit' ? (r.wet ? 'float' : 'idle') : !r.sp.living && (r.act === 'pick' || r.act === 'hammer' || r.act === 'chop' || r.act === 'dig') ? 'work' : r.act;
        const tk = r.task, k = tk && tk.arrived ? Math.min(1, tk.t / tk.dur) : 0;
        const food = tk?.kind === 'eat' ? tk.data : tk?.kind === 'forage' && k > 0.8 ? tk.data : '';   // (coming up with it in its paws)
        // the body's own account: the feet keep pace with the ground actually covered (turning on the spot
        // moves them too, round the body), a new spell begins when what it is doing changes
        const mo = r.mo, FOOT = r.id === 'lantern' ? 0.28 : r.id === 'kame' ? 0.3 : r.id === 'rakko' ? 0.15 : 0.12;
        const moved = Number.isNaN(mo.px) ? 0 : Math.hypot(r.pos.x - mo.px, r.pos.z - mo.pz), turned = Math.abs(Math.atan2(Math.sin(r.head - mo.ph), Math.cos(r.head - mo.ph)));
        const jump = moved > 2 || turned > 1.5;   // (back in view after a while, or set down somewhere: not a step)
        if (!jump) mo.stride += moved + turned * FOOT;
        mo.px = r.pos.x; mo.pz = r.pos.z; mo.ph = r.head;
        const pace = jump ? 0 : (moved + turned * FOOT) / Math.max(dt, 1e-3) / (r.wet ? r.sp.swimSpeed || r.sp.speed : r.sp.speed);
        mo.gait += (Math.min(1, pace) - mo.gait) * Math.min(1, dt * 6);   // (settling as it stops, not snapping still)
        if (act !== mo.act || tk !== mo.task) { mo.key++; mo.t = 0; mo.act = act; mo.task = tk; } else mo.t += dt;
        let look: [number, number, number] | undefined;
        if (mo.look) { r.model.root.updateMatrixWorld(); const v = r.model.root.worldToLocal(_lv.copy(mo.look)); look = [v.x, v.y, v.z]; }
        r.model.update(performance.now() / 1000 + r.sp.home[0], dt, { act, walk: mo.gait, night: 1 - dayK(localHour(ms)), wet: r.wet, k, food, stride: mo.stride, look, key: mo.key, elapsed: mo.t });
        // what it has in its hands (Dot's arms hold a log themselves)
        if (r.model.carry) r.model.carry.visible = r.holding === 'wood';
        const hk = r.holding === 'wood' && r.model.carry ? '' : r.holding;
        r.held.visible = !!hk && !(r.task?.kind === 'craft' && r.task.arrived);
        if (hk === 'piece' && r.stats.built < HUT.length) { lying(HUT[r.stats.built], r.held); r.held.scale.setScalar(0.6); }
        else if (hk === 'plank') { r.held.geometry = planks[0].geometry; r.held.material = wood; r.held.rotation.set(0, 0, 0); r.held.scale.set(0.5, 1, 0.3); }
        else if (hk === 'drift') { if (drift.kind >= 0) r.held.geometry = DRIFT[drift.kind].geo; r.held.material = glassM; r.held.rotation.set(0, 0, 0); r.held.scale.setScalar(1); }
        else if (hk) { r.held.geometry = items.geo[hk as ItemKind]; r.held.material = itemMat[hk as ItemKind]; r.held.rotation.set(0, 0, 0); r.held.scale.setScalar(hk === 'wood' ? 0.8 : 1); }
        if (r.saying) r.sayT += dt;
        r.subject.prio = r.talk ? 7 : r.act === 'sleep' ? 1.2 : 2.6;
      }
      if ((saveT -= dt) < 0) { saveT = 20; save(); }
    },
    subjects: () => list.map((r) => r.subject),
    status(r) {
      const s = statusOf(r);
      if (!r.sp.living || r.talk || r.act === 'sleep' || ['forage', 'eat', 'graze'].includes(r.task?.kind ?? '')) return s;
      return s + (r.hunger > 0.6 ? '（おなかがすいている）' : r.sleepy > 0.7 ? '（ねむそう）' : '');
    },
    vitals(r) {
      if (!r.sp.living) return `電池 ${Math.round(r.battery * 100)}%`;
      return `おなか：${r.hunger > 0.7 ? 'ぺこぺこ' : r.hunger > 0.45 ? 'すいてきた' : r.hunger > 0.2 ? 'ほどほど' : 'いっぱい'}・ねむけ：${r.sleepy > 0.7 ? 'ねむい' : r.sleepy > 0.4 ? 'すこし' : 'すっきり'}`;
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
  (res as any).village = village;
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
        village.fires++; lastFireAt = clockMs;
      }
      fireQueue.length = 0;
      atFire.clear(); fireSaid = false; fireConv = 0; fireLines = 0; fireUsed.clear();
      return;
    }
    if (seated.length >= 2 && !fireSaid) {
      fireSaid = true; res.onEvent('fire', 'みんなが焚き火のまわりに集まってきた', seated[0]);
      // what tonight is about: something found on the beach, and (after a few evenings) a plan to make something together
      const found = village.treasures.filter((t) => t.at > lastFireAt);
      for (const t of found) {
        const f = list.find((r) => r.v.name === t.who);
        if (f) fireQueue.push({ who: f.id, line: fill(pickOne(f.v.show), { thing: t.what }) });
        for (const o of list.filter((r) => r !== f).sort(() => Math.random() - 0.5).slice(0, 2)) fireQueue.push({ who: o.id, line: pickOne(o.v.wonder) });
      }
      if (village.pier === 'none' && village.fires >= 2) {
        for (const id of ['rakko', 'dot', 'kame', 'lantern']) fireQueue.push({ who: id, line: byId[id].v.pier[0] });
        fireQueue.push({ who: 'rakko', line: byId.rakko.v.pier[1] }, { who: 'dot', line: byId.dot.v.pier[1] });
        fireQueue.push({ who: '', line: 'pier' });   // (then it is agreed)
      }
    }
    if (seated.length < 2) return;
    if ((fireTalkT -= dt) > 0) return;
    fireTalkT = fast ? 60 : rr(16, 34);
    while (fireQueue.length) {
      const q = fireQueue.shift()!;
      if (q.line === 'pier') { village.pier = 'plan'; drawPier(); res.onEvent('pier', 'みんなで桟橋をつくることに決めた。まずはカメマルが場所を測る', seated[0]); continue; }
      const w = byId[q.who]; if (!w || !seated.includes(w)) continue;
      for (const r of seated) if (r !== w) r.saying = '';
      if (!fireConv) fireConv = heading('焚き火の会');
      say(w, q.line, fireConv, fast); lastSpeaker = w.id; fireTalkT = fast ? 60 : rr(9, 16);
      return;
    }
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
      fly.m!.updateMatrixWorld(); fly.m!.matrixWorld.decompose(_sw, _sq, _ss); const to = _sw, toQ = _sq;
      flyer.visible = true;
      flyer.position.lerpVectors(fly.from, to, s); flyer.position.y += Math.sin(s * Math.PI) * 0.6;
      flyer.quaternion.slerpQuaternions(fly.fromQ, toQ, s);
      if (k >= 1) { flyer.visible = false; fly.t = -1; fly.m!.visible = true; reveal.push({ m: fly.m!, t: 0 }); fly.m = null; }
    }
    // and settles with a little bump
    for (let i = reveal.length - 1; i >= 0; i--) {
      const rv = reveal[i]; rv.t += dt;
      const b = rv.t < 0.35 ? 1 + 0.12 * Math.sin(rv.t / 0.35 * Math.PI) : 1; rv.m.scale.setScalar(b);
      if (rv.t >= 0.35) { rv.m.scale.setScalar(1); reveal.splice(i, 1); }
    }
    // where the watched one is going
    const ft = focused?.task;
    marker.visible = !!ft && !ft.arrived && ['gather', 'collect', 'fetch', 'craft', 'place', 'pile', 'stack', 'chop', 'till', 'plant', 'harvest', 'fire', 'survey', 'base', 'post', 'deck', 'find', 'shelve'].includes(ft.kind);
    if (marker.visible) {
      markT += dt;
      marker.position.set(ft!.x, L.h(ft!.x, ft!.z) + 0.06, ft!.z);
      marker.scale.setScalar(1 + 0.15 * Math.sin(markT * 3));
      (marker.material as THREE.MeshBasicMaterial).color.set(focused!.sp.color);
      (marker.material as THREE.MeshBasicMaterial).opacity = res.hide ? 0.25 : 0.6;   // (softer seen from its own eyes)
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
      items.tick(20); tickDrift(20);
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
