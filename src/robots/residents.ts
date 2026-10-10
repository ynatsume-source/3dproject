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
import { Solids, type Body, type Solid } from './solids';
import { Agent, type Habit } from './agent/agent';
import { modelBrain } from './agent/brain';
import { MINDS } from './agent/config';
import type { Brain, BrainInput, Observation, Option, Outcome, Request } from './agent/types';
import { craftBeat, variant } from './models';
import { robotKit, type Robot, type Act, type Mats } from './models';
import { creatureKit, type CMats, type Food } from './creatures';
import { mulberry32 } from '../core/math';
import { BODY as NEEDS, PREY_JA, FILLS, drain, makePatch, regrow, regrowBed, dive, bodyState, trouble, newDay, type Patch, type Bed, type BodyState, type Trouble, type Prey } from './body';
import { VOICES, STAGES, type Voice } from './voices';
import { SAY, glyphs, kana, subtitle, type Count, type Said, type Tok } from './islandlang';
import { islandDate, islandWait, islandWeather, ISLAND_RATE, type IslandWeather } from '../world/island-time';
import type { EnvironmentSample, LotView } from '../world/science-contract';
import { wickQuality } from '../science/step/oil-lamp';
import { abortRun, addLot, advance, assemble, emptyLedger, refreshAssembled, refreshAssembledParts, startRun, toClock, toReal } from '../world/process-runner';
import { CATALOG, MATERIAL_JA, CLAY_PIT_PLAN, COOK_POT_ASSEMBLY, POT_ASSEMBLY, RETORT_ASSEMBLY, LAMP_DISH_ASSEMBLY, WICKS, TOOLS, SEASONED_PPM, type CatalogEntry } from '../world/process-catalog';
import { clayPitMaterials, clayPitParams, CLAY_PIT } from '../science/step/clay-pit';
import { RAW_CLAY_SOUTH } from '../world/planet-map';
import { SCIENCE_CATALOG_VERSION } from '../science/step/drying';
import { ISLES, coin, dirJa, emptyMap, fromHome, mapScore } from '../world/planet-map';
import { LEX } from './islandlang';
import { phrase, NO_WHY, type Frame, type Who, type DayItem } from './lumau/frames';
import type { Subject } from '../eco/env';
import { createLanternStudy } from './lantern-study';
import { requestLanternDecision } from './lantern-brain';
import type { StudyWorld, StudyPlace, StudyIntent } from './lantern-study-types';
import { makeItems, type Item, type ItemKind, coconutGeo } from './items';
import { makeHouseLook, HOUSE_STEPS, HOUSE_N, HOUSE_BAMBOO, HOUSE_CLAY, HOUSE_JA, houseLevel, houseCover, insideHouse, underHouseRoof, stepsBefore, HW, HD, EAVE as EAVE_H, type HouseStep } from './house';
import { PHOTOS_PER_DAY, type PhotoRecord } from '../journal/types';

/* ---------- materials: lit by the sea's own sky, sun and water ---------- */
// pat: 0 plain, 1 a green turtle's carapace (its scutes, from the shell's own coordinates), 2 scaled
// skin (a turtle's head and flippers: dark scales edged pale), 3 fur (fine variation in the pile)
// the plain things about the place (bundles, clay, the house's straw): lit as the residents are — the island's scene has
// no lights, so a standard material would be black
function smat(hex: number, spec = 0.05, both = false): THREE.Material {
  const m = rmat(hex, spec); if (both) m.side = THREE.DoubleSide; return m;
}
function rmat(hex: number, spec = 0.5, grid = false, pat = 0, scl = 1) {
  return mat(
    `varying vec3 vWp; varying vec3 vN; varying vec2 vUv; varying vec3 vLp;
     void main(){ mat4 mm = modelMatrix;
       #ifdef USE_INSTANCING
       mm = mm * instanceMatrix;   // (what lies about, the shell pile, the chips: each where it is, not all at the origin)
       #endif
       vec4 w = mm * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(mm) * normal); vUv = uv; vLp = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    AIRLIT + `uniform vec3 uCol; uniform float uSpec; uniform float uGrid; uniform float uPat; uniform float uScl; varying vec3 vWp; varying vec3 vN; varying vec2 vUv; varying vec3 vLp;
     vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }   // (no sin of a large number: rough on phones)
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
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp); if (!gl_FrontFacing) n = -n;   // (the straw, seen from under the eaves)
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
export function cmats(): CMats {
  return CM ??= {
    fur: rmat(0x3a281b, 0.3, false, 3, 70), furPale: rmat(0xb9a487, 0.2, false, 3, 40), furDark: rmat(0x1f1610, 0.25, false, 3, 40),
    nose: rmat(0x0d0c0c, 0.9), eye: rmat(0x050506, 1.8),
    carapace: rmat(0x5a4426, 0.8, false, 1), plastron: rmat(0xd8c890, 0.3), skin: rmat(0x4c3b24, 0.45, false, 2, 6), beak: rmat(0x6a5838, 0.6),
    stone: rmat(0x7d776e, 0.15), urchin: rmat(0x3b1736, 0.5), crab: rmat(0xb04a2a, 0.5), clam: rmat(0xcbbca4, 0.5),
    white: rmat(0xf4f1ea, 0.3), kelp: rmat(0x5d6b2a, 0.35), blush: rmat(0xf2a3a0, 0.1),
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

interface Task { kind: string; x: number; z: number; act: Act; dur: number; t: number; arrived: boolean; wet?: boolean; then?: string; data?: any;
  opt?: string; failed?: Outcome; reported?: boolean; label?: string }   // (opt: the step of its own plan this is — ADR 0004 — and how it went)
interface Hypo { at: number; by: string; mark: number; airs: number[]; alarm: null | { at: number; mark: number; air?: number; matched?: boolean }; storms: { at: number; end?: number; caught: boolean; settled: boolean }[];
  hits: number; falses: number; misses: number; leads: number[]; status: 'testing' | 'held' | 'doubted'; heat: boolean; kind?: 'level' | 'day' }   // (Lantern's guess about its gauge and storms, and how the world has answered it)
interface Line { who: string; text: string; isl?: Tok[]; en?: string }
interface Talk { a: Resident; b: Resident; lines: Line[]; i: number; t: number; stage: number; pending?: boolean; waited?: number; conv: number; shares: { from: Resident; to: Resident; ob: Observation }[] }
export interface Mark { x: number; y: number; z: number; kind: string; label: string; sub?: string; hot?: boolean; color?: string }
// eye / look: where its eyes are and which way its head faces, from the model as it is drawn (its turn, nod and
// gaze included) — what its own point of view is taken from
export interface Sense { eye: THREE.Vector3; look?: THREE.Vector3; head: number; marks: Mark[]; target: Mark | null; task: string; built: number; hutN: number; food: number;
  goal?: { text: string; why: string; steps: string[]; by: string } }   // (its own goal and the steps left, in words: ADR 0004)
export interface Bond { stage: number; know: number; talks: number; last: number; toldWorry: number }
export interface Entry { at: number; text: string; who?: string; conv?: number; head?: boolean; key?: string; with?: string; obs?: string }   // (obs: what it measured or counted then, from the world — shown in a diary only when there is one)   // (a line someone said, or the heading of a conversation)
export interface Resident {
  id: string; v: Voice; sp: Spec; model: Robot;
  pos: THREE.Vector3; head: number; battery: number; task: Task | null; walk: number; act: Act; wet: boolean;
  hunger: number; sleepy: number; meal: Record<string, number>; under: number;
  wear?: number; wearLv?: number; stuck?: boolean;   // (the two robots: how worn by rain, wind and storm 0..1, the last line it noted, held still until it dries — the world counts it)
  body?: BodyState;   // (the two animals: their own marks, the day's troubles — robots/body.ts)   // (the two who are animals: how hungry and how sleepy, what it has eaten this bout, how far down toward the bottom it is)
  talk: Talk | null; saying: string; sayT: number; sayIsl?: Tok[] | null; sayEn?: string | null;
  stats: { built: number; notes: number; shells: number; cracked: number; visited: number; cairns: number; wood: number; food: number; felled: number; talkUse?: number };
  saidAt?: Record<string, number>;   // (what it last told whom, and when: not the same thing again straight away)
  dayBase?: { day: string; built: number; isles: number; shells: number; notes: number; cairns: number };   // (its counts as the day began: what it did today is the difference)
  today: string[];                        // what it did today (for small talk and its diary)
  diary: Entry[];
  subject: Subject; blocked: number;
  path?: { pts: [number, number][]; tx: number; tz: number; t: number };   // the way it means to walk (robots/path.ts)
  goal?: { tx: number; tz: number; x: number; z: number; none: boolean };   // where it will stand to reach where it is going (outside whatever is there)
  went?: 'arrived' | 'blocked' | 'no way' | 'nowhere to stand';   // how its last walk ended (robots/solids.ts)
  spotted?: string[];   // the fish it has really made out since its last note (for its diary)
  photos?: PhotoRecord[];   // the photographs it chose to take (its media: src/journal/)
  seen?: { name: string; pos: THREE.Vector3; t: number; dur: number; lost: number };   // a fish going by that it is watching (Kamemaru, grazing)
  // for its body (what the model is told, not the world's facts): how far its feet have gone, how fast it
  // is going, what it is looking at, and which spell of doing something this is and for how long
  mo: { stride: number; px: number; pz: number; ph: number; gait: number; key: number; t: number; act: string; task: Task | null; look: THREE.Vector3 | null; why: string; hold: number; glance: number;
    probe: number; since: number; fails: number; bad: [number, number][]; poi?: { key: number; a: number }; recheck: number; grazeTry?: { bed: string; at: number; hunger: number }; grazeAvoid?: Record<string, number>;
    bout?: { patch?: string; tries: number; got: number; weak: number; full: number; opt?: string }; coldAt?: number; roughFelt?: number; walkedAt?: number; backFrom?: [number, number] };   // (recheck: back to what it was doing, a look at it first)   // (Lantern: trying the footing ahead, how far since it last did, where it found it would not do)
  lightK?: number;
  resume?: Task; resumeAt?: number;     // what it was in the middle of when someone came up to talk (to go back to after)
  holding: '' | ItemKind | 'piece' | 'plank' | 'drift' | 'grass';   // what it has in its hands
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
  gibber(id: string, text: string): string;      // what it is saying, in the island's own letters and how they sound (HTML)
  sense(r: Resident): Sense;                       // what it sees and what it is up to, for its own point of view
  body(r: Resident): Body;
  mind(r: Resident): Agent | null;                 // its own mind (ADR 0004), if it has one
  profile(r: Resident): string;                    // its role, how it tends to decide and what has worked (for its writing)
  pose(rec: PhotoRecord | null): void;             // (drawing a photograph again: everyone as they were, held still; null: back to life)
  setBrain(b: Brain | null | undefined): void;     // (tests: a stand-in brain; null: none; undefined: the model)
  setWeather(w: IslandWeather | null): void;       // the island's weather now (Dot's world: the replayed record — world/island-time.ts)
  observe(r: Resident): Observation[];            // what its own eyes see now                        // its body as the world sees it, what it carries included (robots/solids.ts)
  readonly solids: Solids;                        // what cannot be gone through
  readonly drift: { kind: number; x: number; z: number; t: number; by: string };
  readonly lab: import('../world/process-runner').Ledger;   // the world's lots and equipment (the shelf, Lantern's processes) — for checks   // what the sea has washed up and not yet been taken (kind -1: none) — for checks
  labCase(r: Resident): Record<string, unknown>;  // what a test report needs to find this moment again (src/ui/lab.ts)
  vitals(r: Resident): string;                     // its battery, or (an animal) how hungry and sleepy it is
  hide: string;                                    // (the one whose eyes we are looking through: not drawn)
  readonly study?: ReturnType<typeof createLanternStudy>;
  readonly worldTime: number;
  setStudyWeather(cloud: number | null, source: StudyWorld['cloudSource']): void;
}

const SHOT_NEAR: Record<string, number> = { shell: 2.4, stone: 3.2, wood: 4.5, 'young-tree': 9, friend: 10, place: 16, unknown: 4, plot: 7 };   // (how near it goes to take a picture of each kind of thing, m)
const camAt = new THREE.Vector3(1e9, 0, 1e9);   // (where the camera was at the last update: models are posed only near it)
const pair = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);
const pickOne = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rr = (a: number, b: number) => a + Math.random() * (b - a);
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const localHour = (ms: number) => (((ms / 3.6e6 + 9) % 24) + 24) % 24;
/** Its day on the island (Asia/Tokyo), YYYY-MM-DD. */
export const dayOf = (ms: number) => new Date(ms + 9 * 3.6e6).toISOString().slice(0, 10);
const photosOn = (r: { photos?: PhotoRecord[] }, day: string) => (r.photos ?? []).filter((p) => p.day === day);
const dayK = (hr: number) => Math.min(1, Math.max(0, (hr - 6.3) / 0.8)) * Math.min(1, Math.max(0, (18.9 - hr) / 0.8));
const hhmm = (ms: number) => { const h = localHour(ms); return `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };

const KEY = 'seaglass.residents.v1';

const _lv = new THREE.Vector3();
export function makeResidents(loc: any, T: any, fishNames: string[], birdNames: string[], options: { lanternStudy?: boolean } = {}): Residents {
  // A review prototype has its own world save, seeded from the existing island without rewriting it.
  const saveKey = options.lanternStudy ? 'seaglass.lantern-study.residents.v1' : KEY;
  let study = options.lanternStudy ? createLanternStudy(undefined, requestLanternDecision) : undefined;
  let studyCloud: number | null = null, studyCloudSource: StudyWorld['cloudSource'] = 'unknown';
  let studyFast = false;
  const L = { h: (x: number, z: number) => loc.f(x, z) };
  const kit = robotKit(mats()), ckit = creatureKit(cmats());
  const group = new THREE.Group();
  const cover = (x: number, z: number) => T.landCover?.(x, z) ?? { can: 0, sand: 1 };

  /* ---------- things they make ---------- */
  // Dot's hut: four posts, a frame, then roof slats of driftwood — one piece at a time
  const wood = rmat(0x8d7560, 0.1), wood2 = rmat(0x6f5a48, 0.1), shellM = rmat(0xf2d9c4, 0.6), stoneM = rmat(0xa49a8c, 0.1);   // (nature-look HANDOFF §4: warmer, paler)
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
  const itemMat = { wood: rmat(0xcfc3ad, 0.1), shell: shellM, stone: stoneM, coconut: rmat(0x8a6640, 0.05) };
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
  let chipNext = 0, lastStrokes = 0;
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
    // (drawn as the beach's own casuarinas are — their drooping twigs, the same light — only young: 2.7 m; nature team
    // 2026-10-10. Where the shore is not built, a trunk and a crown of rounded masses as before)
    const look = T.plantLook;
    if (look) { const m = new THREE.InstancedMesh(look.geo.casuarina, look.mat, 1); m.setMatrixAt(0, new THREE.Matrix4().makeRotationY(i * 1.7).scale(new THREE.Vector3(2.4, 2.7, 2.4))); m.frustumCulled = false; m.userData.shared = true; pivot.add(m); }
    else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.4, 7), wood2); trunk.position.y = 1.2; pivot.add(trunk);
      const crown = new THREE.Group(); crown.position.y = 2.3; pivot.add(crown);
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.42 - k * 0.05, 8, 6), leafM); b.position.set(Math.sin(k * 2.1 + i) * 0.25, k * 0.28 - 0.3, Math.cos(k * 2.1 + i) * 0.25); b.scale.y = 0.8; crown.add(b); }
    }
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
  const GROW = islandWait(36 * 3600e3);   // a day and a half from seed to harvest, on the island's clock (ADR 0006)
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
  // Dot's house (the dwelling theme: robots/house.ts): beside the hut, on the most level ground near it that is clear of
  // the field, the trees, the fire and the bench — the same place every time the island is opened
  const houseLook = makeHouseLook({ wood, wood2, mk: smat }), houseG = houseLook.group;
  {
    const busy: [number, number][] = [[0, 0], [-2.3, 1.3], [1.6, -1.5], [2.4, -1.5], [3.4, 2.8], ...TREES.map((t) => { const v = hut.worldToLocal(new THREE.Vector3(t.x, 0, t.z)); return [v.x, v.z] as [number, number]; }), ...PLOTS.map((pl) => { const v = hut.worldToLocal(new THREE.Vector3(pl.x, 0, pl.z)); return [v.x, v.z] as [number, number]; })];
    let best: { x: number; z: number; y: number; bad: number } | null = null;
    for (const [lx, lz] of [[-6.5, 1.5], [-6.5, -2], [0, -6.5], [3.5, -6.5], [-3.5, -6.5], [7.5, -1], [7.5, 3], [-7, 5], [7, 6.5], [0, 10.5], [-9, 0]]) {
      const hs: number[] = []; let trees = 0;
      for (const fx of [-1, 0, 1]) for (const fz of [-1, 0, 1]) { const w = atHut(lx + fx * (HW + 0.6), lz + fz * (HD + 0.6)); hs.push(L.h(w.x, w.z)); trees += cover(w.x, w.z).can; }
      const clear = Math.min(...busy.map(([bx, bz]) => Math.hypot(bx - lx, bz - lz)));
      const bad = (Math.max(...hs) - Math.min(...hs)) + (Math.min(...hs) < 0.5 ? 50 : 0) + (clear < 3.4 ? 20 : 0) + trees * 3;   // (open ground: not in the trees)
      if (!best || bad < best.bad) { const w = atHut(lx, lz); best = { x: w.x, z: w.z, y: hs[4], bad }; }
    }
    houseG.position.set(best!.x, best!.y, best!.z); houseG.rotation.y = hut.rotation.y; houseG.updateMatrixWorld(true); group.add(houseG);
  }
  const atHouse = (x: number, z: number) => houseG.localToWorld(new THREE.Vector3(x, 0, z));
  const houseLocal = (x: number, z: number) => houseG.worldToLocal(new THREE.Vector3(x, houseG.position.y, z));
  // (the bamboo and clay brought for it, by the house; a bundle of thatch in the hands)
  const yardBamboo = new THREE.Group(), yardClay = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6), smat(0x8a6a4c, 0.0));
  { const w = atHouse(HW + 1.2, -0.6); yardBamboo.position.set(w.x, L.h(w.x, w.z), w.z); yardBamboo.rotation.y = houseG.rotation.y + Math.PI / 2; group.add(yardBamboo);
    for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), smat(0xa8b060, 0.18)); m.rotation.z = Math.PI / 2; m.position.set(0, 0.04 + Math.floor(k / 3) * 0.07, -0.08 + (k % 3) * 0.08); yardBamboo.add(m); }
    const c = atHouse(HW + 1.2, 0.9); yardClay.position.set(c.x, L.h(c.x, c.z) + 0.05, c.z); yardClay.scale.y = 0.4; group.add(yardClay); }
  const grassGeo = new THREE.CylinderGeometry(0.12, 0.09, 0.9, 8), grassM = smat(0xb59a5a, 0.0);
  // the island's weather (Dot's world: replayed, set from outside); a typhoon stops what is done outdoors
  let wxNow: IslandWeather | null = null, stormSince = 0;
  const storm = () => !!wxNow?.typhoon;
  // ---------- wear (the owner's dwelling theme, 2026-10-07: docs/proposals/sumika-2026-10-07.md) ----------
  // rain, salt and sand in a robot's joints: rain and wind of 10 m/s or more wear it, a typhoon a great deal; under a
  // roof in the dry it dries out (outdoors in the dry, more slowly). What a place keeps off: the hut's roof half the rain,
  // not the wind, not a storm. Over 0.3 it is slower, over 0.6 its battery runs down faster, over 0.9 it cannot move
  // until it is down to 0.6 again. The two animals: a rough sea (or a typhoon) out in the open makes them hungrier.
  const WEAR = { rain: 0.01, wind: 0.01, storm: 0.08, dryRoof: 0.05, dryOut: 0.02 };   // (a wear an island hour: rain per mm/h, wind per m/s over 10)
  const roofDone = () => byId.dot.stats.built >= 18;   // (the hut's posts, beams and roof boards)
  const underRoof = (r: Resident) => roofDone() && Math.hypot(r.pos.x - hut.position.x, r.pos.z - hut.position.z) < 1.3;
  // (the house, once its roof is whole: robots/house.ts says what it keeps off)
  const hLevel = () => houseLevel(village.house.n, village.house.lost);
  const houseRoofed = () => hLevel() === 'roof' || hLevel() === 'house';
  const inHouse = (r: Resident) => { const v = houseLocal(r.pos.x, r.pos.z); return hLevel() === 'house' ? insideHouse(v.x, v.z) : underHouseRoof(v.x, v.z); };   // (walls round it: inside them; a roof only: under its eaves)
  const roofCover = (r: Resident) => houseRoofed() && inHouse(r) ? { ...houseCover(hLevel(), village.house.lost, wallDone()), roof: true }
    : underRoof(r) ? { rain: 0.5, wind: 1, storm: 1, roof: true } : { rain: 1, wind: 1, storm: 1, roof: false };
  // (in the house, each robot its own place: Dot's by the bed, Lantern's by its desk — the two do not stand on one spot)
  const shelterAt = (r?: Resident): [number, number] => { if (houseRoofed()) { if (r?.id === 'lantern') return lanternRoom(); const w = atHouse(houseLook.inside[0], houseLook.inside[1]); return [w.x, w.z]; } return [hut.position.x, hut.position.z]; };
  const anyRoof = () => houseRoofed() || roofDone();
  const wetNow = () => (wxNow?.rainMeasured ?? wxNow?.rain ?? 0) > 0.2;
  // (over 0.9 it is down to a tenth: it can still creep, but not much more — owner, 2026-10-07: never quite still)
  const wearSlow = (r: Resident) => r.sp.living ? 1 : r.stuck ? 0.1 : Math.max(0.45, 1 - Math.max(0, (r.wear ?? 0) - 0.3) * 0.8);
  const roughK = () => !wxNow ? 0 : wxNow.typhoon ? 1 : Math.min(1, Math.max(0, ((wxNow.wave ?? 0) - 1) / 3));
  function weathering(r: Resident, dt: number) {
    const w = wxNow, isl = dt * ISLAND_RATE / 3600, c = roofCover(r), w0 = r.wear ?? 0;
    const rain = w ? (w.rainMeasured ?? w.rain) : 0, wind = w ? (w.windMeasured ?? w.wind) : 0;
    const add = (rain * WEAR.rain * c.rain + Math.max(0, wind - 10) * WEAR.wind * c.wind + (w?.typhoon ? WEAR.storm * c.storm : 0)) * isl;
    const dry = (c.roof && c.rain < 0.3 ? WEAR.dryRoof : rain > 0.2 || w?.typhoon ? 0 : c.roof ? WEAR.dryRoof : WEAR.dryOut) * isl;   // (a roof that keeps (nearly) all the rain off: it dries there whatever the weather outside)
    r.wear = Math.min(1, Math.max(0, w0 + add - dry));
    const lv = r.wear > 0.9 ? 3 : r.wear > 0.6 ? 2 : r.wear > 0.3 ? 1 : 0, was = r.wearLv ?? 0, obs = `傷み${Math.round(r.wear * 100)}`;
    if (lv > was) {
      r.wearLv = lv;
      const why = w?.typhoon ? '台風の雨風で' : rain > 0.2 ? '雨に打たれて' : '強い風で';
      note(r, 'wear', {}, lv === 3 ? `${why}関節が固まり、ほとんど動けなくなった。${anyRoof() ? '屋根の下へゆっくり向かって' : 'その場で'}乾くのを待つ` : lv === 2 ? `${why}関節に水と砂が入り、動きがかなり鈍い` : `${why}関節が重くなってきた`, obs);
    } else if (lv < was && !(r.stuck && lv >= 2)) {
      r.wearLv = lv;
      if (lv === 0) note(r, 'wear', {}, c.roof ? '屋根の下で乾いて、体が軽くなった' : '乾いて、体が軽くなった', obs);
    }
    if (!r.stuck && r.wear > 0.9) r.stuck = true;
    if (r.stuck && r.wear < 0.6) { r.stuck = false; r.wearLv = 1; note(r, 'wear', {}, '乾いてきて、また動けるようになった', obs); }
  }
  const gatherHours = (hr: number) => hr >= 18.9 && hr < 21.0 && !storm();  // on the way / sitting round it (not in a typhoon: the custom waits)
  // (and in the morning, at the same place, the fire out: the one up all night says what the night showed, each says
  // what it will do — so the day's work is known before it is far along, and before any raft puts out; owner's wish,
  // 2026-10-06: at nine, talk from 9:00 to 9:30, those far off setting out a little before)
  const morningHours = (hr: number) => hr >= 8.85 && hr < 9.5 && !storm();
  const meetHours = (hr: number) => gatherHours(hr) || morningHours(hr);
  let fireK = 0, fireTalkT = 5, lastSpeaker = '', fireSaid = false, fireConv = 0, fireLines = 0, lastFireAt = 0;
  const fireQueue: { who: string; line: string; isl?: Tok[]; en?: string }[] = [];
  const fireUsed = new Set<string>();
  const atFire = new Set<string>();

  /* ---------- the pier they build together ---------- */
  // Out from the beach in front of the hut into the lagoon: four pilings (a stone base Lantern brings,
  // a post Rakko swims out and sets on it) and eight deck planks Dot shapes and lays. Kamemaru surveys
  // it first. It starts once they have sat round the fire together a few times.
  const village = { fires: 0, mornings: 0, pier: 'none' as 'none' | 'plan' | 'build' | 'done', bases: 0, posts: 0, deck: 0, treasures: [] as { what: string; who: string; at: number }[], map: emptyMap(), raft: { parts: 0, x: NaN, z: NaN, hauled: false }, spare: 0, lampLog: [] as { at: number; fiber: number; lumenS: number; litS: number; soot: number }[], labRuns: [] as { runId: string; processId: string; key?: string; by: string; startOnClock: number; outAt?: number; felt?: string }[], gaugeLog: [] as { at: number; processId: string; mark?: number; text?: string }[], catcher: null as null | { at: number; areaM2: number; capMg: number }, hypo: null as null | Hypo, hypo2: null as null | Hypo,
    labDone: [] as { at: number; processId: string; ok: boolean }[], taught: {} as Record<string, number>, feedback: [] as { from: string; to: string; f: Frame; at: number }[], stormPrep: 0, heardOkAt: 0,
    swellGuess: { alarm: 0, hits: 0, falses: 0 },
    house: { n: 0, rope: 0, bamboo: 0, clay: 0, lost: 0, weighed: false },
    wall: { n: 0, pile: 0 }, nest: { n: 0, at: null as null | [number, number] }, kameBed: null as null | [number, number], ledge: { n: 0 },
    walks: {} as Record<string, number[]>, settle: null as null | { at: number; by: string; asked: Record<string, 'yes' | 'no'>; homes: Record<string, [number, number]> },
    felled: [] as { x: number; z: number; h: number; kind: number; at: number }[],
    clayPit: null as null | { at: number; diameterCm: number; depthCm: number },
    prepBy: '', prepSaved: [] as string[], heed: {} as Record<string, number>, onsetHunger: {} as Record<string, number>, stormLog: [] as { at: number; warned: boolean; by: string; saved: string[]; lost: string[] }[] };
  // the world's lots and equipment (src/world/process-runner.ts): what Dot brings home, and what Lantern's processes
  // make of it. Here in the browser's island for now; the same ledger moves to the shared world's server (ADR 0002)
  const lab = emptyLedger('dotworld', 'e1');
  const shelfLots = () => Object.values(lab.lots).filter((l) => l.location === 'shelf');
  // Coconuts and firewood as the world's lots (ADR 0006, owner's decision 2026-10-06): made when they come to the shelf,
  // their mass as the scale gives it. The coconuts kept in one lot of whole nuts (quality.count, as the science side
  // reads it); firewood as it was cut, wet (quality.water_ppm of the whole lot: its drying is the science side's to say).
  const COCONUT_BAD = 0.15, GREEN_WOOD_WATER = 450_000;
  const coconutsOnShelf = () => shelfLots().filter((l) => l.materialId === 'coconut' && !(l as any).reservedBy).reduce((n, l) => n + (l.quality?.count ?? 0), 0);
  // (each nut a lot of its own: a run takes a lot whole, so one pressing does not take every nut on the shelf — the
  // science side's request, 2026-10-06)
  function storeCoconut(mg: number) {
    addLot(lab, { materialId: 'coconut', amount: { value: mg, unit: 'mg' }, quality: { count: 1 }, location: 'shelf' });
    return coconutsOnShelf();
  }
  // Fresh water is rain, caught (owner's decision 2026-10-06): Lantern sets up a catcher by the shelf — a funnel of leaves
  // over bamboo tubes, from bamboo brought home — and the world fills it as the replayed record rains: the rain (mm) on
  // the funnel's area, on the island's clock (water only waits to be caught), up to what the tubes hold. A dry spell
  // leaves it short.
  const CATCH_BAMBOO = 2e6, CATCH_AREA = 0.8, CATCH_CAP = 20e6;
  const catchG = new THREE.Group(); catchG.visible = false; group.add(catchG);
  { const w = atHut(3.2, -2.6); catchG.position.set(w.x, L.h(w.x, w.z), w.z);
    const bam = smat(0xa8b060, 0.18), leaf = smat(0x5f7d3a, 0.06, true);
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), bam); m.position.set(-0.16 + k * 0.16, 0.35, 0); catchG.add(m); }
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 10, 1, true), leaf); f.rotation.x = Math.PI; f.position.set(0, 0.95, 0); catchG.add(f); }
  const showCatcher = () => { catchG.visible = !!village.catcher; };
  // A flash of insight (ADR 0006, owner's decision ①): from what any engineer knows — the air's pressure falls before a
  // storm — Lantern guesses that its gauge, a sealed bulb whose marks rise as the air outside thins, will rise past
  // anything it has seen before a typhoon comes. The guess sets no value of the world's: the mark it watches for is the
  // highest of its own first two island days and two more, and only the replayed record says whether a storm came. Each
  // alarm is right (a storm is in, or comes within a day of the island's clock) or wrong; a storm with no alarm near it
  // is missed. A wrong alarm on a hot day it notes, once (warmth swells the bulb too), and each wrong alarm raises the mark.
  const HYPO_READS = 16, HYPO_DAY = islandWait(24 * 3.6e6);
  const tally = (h: Hypo) => `当たり ${h.hits}・外れ ${h.falses}・見逃し ${h.misses}`;
  function hypoNote(text: string, event = false) {
    const r = byId.lantern; if (!r) return;
    r.diary.push({ at: clockMs, text, key: 'study' }); if (r.diary.length > 800) r.diary.shift();
    if (event) res.onEvent('science', `${r.v.name}：${text}`, r);
  }
  function hypoRead(at: number, mark: number) {
    const h = village.hypo, marks = village.gaugeLog.filter((g) => g.mark !== undefined);
    if (!h) {
      if (marks.length < HYPO_READS) return;
      const top = Math.max(...marks.map((g) => g.mark!));
      village.hypo = { at, by: 'lantern', mark: top + 2, airs: marks.map((g) => islandWeather(g.at)?.air).filter((a): a is number => a !== undefined), alarm: null, storms: [], hits: 0, falses: 0, misses: 0, leads: [], status: 'testing', heat: false };
      hypoNote(`ひらめき：気圧が下がると嵐が来るはず。この気圧計は外の気圧が下がると目盛りが上がる。これまでの最高は${top}。目盛りが${top + 2}以上になったら、一日のうちに台風が来るのではないか。確かめていく`, true);
      return;
    }
    if (h.alarm || mark < h.mark) return;
    h.alarm = { at, mark, air: islandWeather(at)?.air };
    const s = h.storms[h.storms.length - 1];
    if (s && s.end === undefined) {   // (in a storm already: it rose with it)
      h.alarm.matched = true;
      if (!s.caught) { s.caught = true; h.leads.push(-Math.round((at - s.at) / 3.6e6 * ISLAND_RATE)); hypoNote(`台風の中で、気圧計が${mark}まで上がった`); }
      return;
    }
    hypoNote(`気圧計が${mark}まで上がった。台風が来るかもしれない`, true);
  }
  // The second flash (ADR 0006): warmth swells the bulb too, and the day's warmth comes round again every day — so the
  // reading is compared with the one at the same time the day before, and what is left is the air's own change. The
  // mark it watches for is again from its own readings: the most the gauge has risen over a day so far, and two more.
  const dayAgo = (at: number) => { const t = at - HYPO_DAY, tol = islandWait(1.6 * 3.6e6); let best: { mark?: number; at: number } | undefined; for (const g of village.gaugeLog) if (g.mark !== undefined && Math.abs(g.at - t) < tol && (!best || Math.abs(g.at - t) < Math.abs(best.at - t))) best = g; return best?.mark; };
  function hypoRead2(at: number, mark: number) {
    const y = dayAgo(at); if (y === undefined) return;
    const d = mark - y, h = village.hypo2;
    if (!h) {
      if (!village.hypo?.heat) return;
      const diffs = village.gaugeLog.filter((g) => g.mark !== undefined && g.at <= at).map((g) => { const yy = dayAgo(g.at); return yy === undefined ? undefined : g.mark! - yy; }).filter((x): x is number => x !== undefined);
      if (diffs.length < HYPO_READS) return;
      const top = Math.max(...diffs);
      village.hypo2 = { at, by: 'lantern', mark: top + 2, airs: [], alarm: null, storms: [], hits: 0, falses: 0, misses: 0, leads: [], status: 'testing', heat: true, kind: 'day' };
      hypoNote(`ひらめき：温まっても目盛りが上がるなら、前の日の同じ時刻と比べればいい。暑さ寒さは毎日くり返すから、残るのは気圧の変わり方だ。これまで前の日より上がったのは最も${top}。前の日より${top + 2}以上上がったら、台風が来るかもしれない。確かめていく`, true);
      return;
    }
    if (h.alarm || d < h.mark) return;
    h.alarm = { at, mark: d };
    const s = h.storms[h.storms.length - 1];
    if (s && s.end === undefined) { h.alarm.matched = true; if (!s.caught) { s.caught = true; h.leads.push(-Math.round((at - s.at) / 3.6e6 * ISLAND_RATE)); hypoNote(`台風の中で、気圧計が前の日より${d}上がった`); } return; }
    hypoNote(`気圧計が前の日の同じ時刻より${d}上がった。台風が来るかもしれない`, true);
  }
  const hyps = () => [village.hypo, village.hypo2].filter((h): h is Hypo => !!h);
  /** The guess Lantern goes by: the one the world has answered better (more right than wrong). */
  function bestHypo() { const sc = (h: Hypo) => h.hits * 2 - h.falses - h.misses; const [a, b] = [village.hypo, village.hypo2]; return !b ? a : !a ? b : sc(b) >= sc(a) ? b : a; }
  const lanternAlarm = () => { const h = bestHypo(); return !!h?.alarm && !h.alarm.matched; };
  // A storm runs from when it comes in to when it passes; one that comes back within a day of the island's clock is the
  // same storm, its wind rising and falling. An alarm in the day before it or while it blows has caught it.
  function hypoStorm(at: number) { for (const h of hyps()) hypoStormOf(h, at); }
  function hypoStormOf(h: Hypo, at: number) {
    const last = h.storms[h.storms.length - 1];
    if (last && last.end !== undefined && at - last.end < HYPO_DAY) { last.end = undefined; return; }
    const s = { at, caught: false, settled: false } as Hypo['storms'][number];
    h.storms.push(s);
    if (h.alarm && !h.alarm.matched && at - h.alarm.at <= HYPO_DAY) { s.caught = true; h.alarm.matched = true; h.leads.push(Math.round((at - h.alarm.at) / 3.6e6 * ISLAND_RATE)); }
  }
  function hypoStormEnd(at: number) { for (const h of hyps()) { const s = h.storms[h.storms.length - 1]; if (s && s.end === undefined) s.end = at; } }
  function hypoTick() { for (const h of hyps()) hypoTickOf(h); }
  function hypoTickOf(h: Hypo) {
    const day = h.kind === 'day', up = (n: number) => day ? `前の日より${n}` : `${n}まで`;
    if (h.alarm && clockMs - h.alarm.at > HYPO_DAY) {
      const a = h.alarm; h.alarm = null;
      if (!a.matched) {
        h.falses++; h.mark = Math.max(h.mark, a.mark + 2);
        const usual = h.airs.length ? h.airs.reduce((n, x) => n + x, 0) / h.airs.length : undefined;
        const hot = a.air !== undefined && usual !== undefined && a.air >= usual + 2;
        hypoNote(`気圧計は${up(a.mark)}上がったが、台風は来なかった（${tally(h)}）。次からは${day ? '前の日より' : ''}${h.mark}以上を待つ${hot && !h.heat ? '。あの時は暑かった。温まっても目盛りが上がるのかもしれない' : ''}`);
        if (hot) h.heat = true;
        hypoJudge(h);
      }
    }
    for (const s of h.storms) if (!s.settled && s.end !== undefined && clockMs - s.end > HYPO_DAY) {
      s.settled = true;
      if (s.caught) { h.hits++; const lead = h.leads[h.leads.length - 1] ?? 0; hypoNote(lead > 0 ? `気圧計は台風の約${lead}時間前に${day ? '前の日より' : ''}上がっていた（${tally(h)}）` : `気圧計は台風が来てから上がった。前もってはわからなかった（${tally(h)}）`); }
      else { h.misses++; hypoNote(`台風が来たのに、気圧計は${up(h.mark)}上がらなかった（${tally(h)}）`); }
      hypoJudge(h);
    }
  }
  function hypoJudge(h: Hypo) {
    const wrong = h.falses + h.misses, what = h.kind === 'day' ? '前の日と比べて目盛りが上がると台風が来る' : '気圧計の目盛りが上がると台風が来る';
    const status = h.hits >= 2 && h.hits >= wrong ? 'held' : wrong >= 3 && h.hits * 2 < wrong ? 'doubted' : 'testing';
    if (status === h.status) return;
    h.status = status;
    hypoNote(status === 'held' ? `${what}、は確からしい（${tally(h)}）` : status === 'doubted' ? `${what}、は今のところ怪しい（${tally(h)}）` : `${what}、もう一度確かめ直す（${tally(h)}）`, true);
  }
  // (as the science side asked, 2026-10-06: where the record has no rain figure nothing is added and the water held is
  // marked as of unknown history; what passes 20 L runs over and is lost; whole mg; the first half millimetre of each
  // shower only wets the leaves)
  let rainCarry = 0, wetting = 0;
  const WET_MM = 0.5;
  function catchRain(dt: number) {
    const c = village.catcher; if (!c) return;
    const w = islandWeather(clockMs);
    // (the rain water on the shelf is one jar: what came back from a run that did not start is poured in with the rest, so
    // the water is not left in two jars each too little to cover the clay while the catcher, counting both, is full —
    // life-run 2026-10-09)
    const jars = shelfLots().filter((l) => l.materialId === 'process_water' && !(l as any).reservedBy).sort((a, b) => b.amount.value - a.amount.value);
    if (jars.length > 1) {
      const into = jars[0], hc = jars.some((l) => l.quality?.history_complete === 0) ? 0 : 1;
      for (const l of jars.slice(1)) { into.amount.value += l.amount.value; delete lab.lots[l.lotId]; }
      into.quality = { ...(into.quality ?? {}), history_complete: hc }; lab.world.worldVersion++; drawStore();
    }
    const water = () => shelfLots().find((l) => l.materialId === 'process_water' && !(l as any).reservedBy);
    if (!w || w.rainMeasured === undefined) { const l = water(); if (l && l.quality?.history_complete !== 0) { l.quality = { ...(l.quality ?? {}), history_complete: 0 }; lab.world.worldVersion++; } rainCarry = 0; return; }
    if (!(w.rainMeasured > 0)) { wetting = 0; return; }
    let mm = w.rainMeasured * (dt * ISLAND_RATE / 3600);
    if (wetting < WET_MM) { const wet = Math.min(mm, WET_MM - wetting); wetting += wet; mm -= wet; }
    rainCarry += mm * c.areaM2 * 1e6;   // (mm of rain on m² is litres: a million mg each)
    if (rainCarry < 1e5) return;
    const held = shelfLots().filter((l) => l.materialId === 'process_water').reduce((n, l) => n + l.amount.value, 0);
    const add = Math.floor(Math.min(rainCarry, Math.max(0, c.capMg - held))); rainCarry = 0;
    if (add <= 0) return;
    const lot = water();
    if (lot) { lot.amount.value += add; lab.world.worldVersion++; } else addLot(lab, { materialId: 'process_water', amount: { value: add, unit: 'mg' }, quality: { history_complete: 1 }, location: 'shelf' });
  }
  let catalog: CatalogEntry[] = CATALOG;
  const RAFT_N = 6, RAFT_KM = 4;   // (a raft of six lashed pieces; a crossing it can make without a sail, there and back in a day)
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
  // (a world no one lives on: what the sea brings is the sea's own — seeds, pumice, bone — never something made;
  // ADR 0006, addendum: another planet the shape of the Earth)
  const DRIFT = [
    { id: 'coconut', ja: 'ヤシの実', geo: new THREE.SphereGeometry(0.12, 10, 8), mat: rmat(0x6b4a2b, 1) },
    { id: 'pumice', ja: '軽石', geo: new THREE.DodecahedronGeometry(0.1, 0), mat: rmat(0xd9d4c7, 1) },
    { id: 'bone', ja: '大きな骨のかけら', geo: new THREE.CylinderGeometry(0.035, 0.05, 0.3, 8), mat: rmat(0xeee6d4, 1) },
    { id: 'seabean', ja: 'モダマの種', geo: new THREE.SphereGeometry(0.08, 10, 6).scale(1, 0.45, 0.85), mat: rmat(0x4a2c1c, 1.2) },
  ];
  const OLD_DRIFT = ['瓶に入った手紙', '見慣れない歯車', 'ガラスの浮き玉', '異国の文字の木札'];   // (as an older island named them)
  const driftMesh = new THREE.Mesh(DRIFT[0].geo, DRIFT[0].mat); driftMesh.visible = false; group.add(driftMesh);
  const drift = { kind: -1, x: 0, z: 0, t: 0, by: '' };
  // the shelf by the hut where finds are kept
  const shelf = new THREE.Group(); { const w = atHut(1.6, -1.5); shelf.position.set(w.x, L.h(w.x, w.z), w.z); shelf.rotation.y = hut.rotation.y; group.add(shelf);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), wood); b.position.y = 0.55; shelf.add(b); for (const sx of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), wood2); l.position.set(sx, 0.27, 0); shelf.add(l); } }
  const shelfItems = DRIFT.map((d, i) => { const m = new THREE.Mesh(d.geo, d.mat); m.position.set(-0.3 + i * 0.2, 0.66, 0); if (i === 2) m.rotation.z = Math.PI / 2; m.visible = false; shelf.add(m); return m; });
  // what Dot brought home from other islands, on the ground by the shelf (clay, bamboo, reeds, limestone)
  const storeG = new THREE.Group(); { const w = atHut(2.4, -1.5); storeG.position.set(w.x, L.h(w.x, w.z), w.z); storeG.rotation.y = hut.rotation.y; group.add(storeG); }
  const COCONUT_GEO = coconutGeo();
  // (a round-bottomed pot, turned from its profile: made when first needed)
  let potGeoC: THREE.BufferGeometry | null = null;
  const potGeo = () => potGeoC ??= new THREE.LatheGeometry([[0, 0], [0.09, 0.01], [0.15, 0.06], [0.17, 0.13], [0.16, 0.2], [0.13, 0.24], [0.14, 0.26], [0.12, 0.27]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const potMesh = (hex: number, s = 1) => { const m = new THREE.Mesh(potGeo(), smat(hex, 0.05, true)); m.scale.setScalar(s); return m; };
  const STORE_LOOK: Record<string, () => THREE.Object3D> = {
    green_pot: () => potMesh(0x6e5640, 0.9), dry_pot: () => potMesh(0xb39a7c, 0.9), fired_pot: () => potMesh(0xb0603a, 0.9),
    pot_sherds: () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.06), smat(0xa85a36, 0.05)); m.position.set(Math.cos(k * 1.3) * 0.1, 0.01, Math.sin(k * 1.3) * 0.1); m.rotation.y = k; g.add(m); } return g; },
    coconut_milk: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), smat(0x6b4a2b, 0.05, true)); m.position.y = 0.1; const w = new THREE.Mesh(new THREE.CircleGeometry(0.095, 12), smat(0xf2efe6, 0.3)); w.rotation.x = -Math.PI / 2; w.position.y = 0.095; const g = new THREE.Group(); g.add(m, w); return g; },
    coconut_oil: () => { const g = new THREE.Group(), j = potMesh(0xb0603a, 0.45), o = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), smat(0xe8c060, 0.9)); o.rotation.x = -Math.PI / 2; o.position.y = 0.11; g.add(j, o); return g; },
    wood_ash: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 5), smat(0x8c8a86, 0.0)); m.scale.y = 0.3; m.position.y = 0.02; return m; },
    raw_clay: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 6), smat(0x8a6a4c, 0.0)); m.scale.y = 0.55; m.position.y = 0.1; return m; },
    bamboo: () => { const g = new THREE.Group(); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), smat(0xa8b060, 0.18)); m.rotation.z = Math.PI / 2; m.position.set(0, 0.04 + (k % 2) * 0.06, -0.08 + k * 0.05); g.add(m); } return g; },
    reed: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 7), smat(0xc8b878, 0.0)); m.rotation.z = Math.PI / 2; m.position.y = 0.09; return m; },
    limestone: () => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), smat(0xe8e4d8, 0.06)); m.position.y = 0.12; return m; },
    coconut: () => { const g = new THREE.Group(); for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(COCONUT_GEO, itemMat.coconut); m.position.set(-0.12 + k * 0.13, 0.1 + (k === 1 ? 0.1 : 0), (k % 2) * 0.06); g.add(m); } return g; },
    firewood: () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.9, 6), smat(0x7b6a52, 0.0)); m.rotation.z = Math.PI / 2; m.position.set(0, 0.04 + Math.floor(k / 3) * 0.06, -0.08 + (k % 3) * 0.07); g.add(m); } return g; },
  };
  function drawStore() {
    storeG.clear();
    [...new Set(shelfLots().map((l) => l.materialId))].forEach((id, k) => { const m = STORE_LOOK[id]?.(); if (m) { m.position.x += (k % 2) * 0.6; m.position.z += Math.floor(k / 2) * 0.5; storeG.add(m); } });
  }
  // Dot's raft on the beach below the hut: pieces lashed side by side as they come (ADR 0006: the first crossing)
  const raftG = new THREE.Group(); group.add(raftG);
  const raftLogs = Array.from({ length: 6 }, (_, k) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 7), wood); m.rotation.z = Math.PI / 2; m.position.set(0, 0.08, -0.35 + k * 0.14); m.visible = false; raftG.add(m); return m; });
  function raftAt(): [number, number] | null {
    if (!Number.isFinite(village.raft.x)) {   // (a stretch of shore near home it can walk to: the raft stays where it is first laid)
      // (clear of trunks and rocks a metre round, so Dot can come up to it and push it off — not laid among the trees)
      const h = byId.dot.sp.home, ok = (x: number, z: number, y: number) => shore(x, z, y) && !solids.hit(x, z, { ...BODY.dot, r: 1.0 }, y) && !!findPath(h[0], h[1], x, z, walkCost);
      const at = [60, 110, 160].reduce<[number, number] | null>((a, rad) => a ?? spot(h, rad, ok, 40), null); if (!at) return null;
      village.raft.x = at[0]; village.raft.z = at[1];
    }
    return [village.raft.x, village.raft.z];
  }
  function drawRaft() {
    const at = Number.isFinite(village.raft.x) ? [village.raft.x, village.raft.z] : null;
    if (at && village.raft.hauled) { at[0] += (hut.position.x - at[0]) * 0.45; at[1] += (hut.position.z - at[1]) * 0.45; }   // (hauled up the beach, toward the hut)
    raftG.visible = !!at && village.raft.parts > 0 && !voyaging; if (at) raftG.position.set(at[0] + 1.2, L.h(at[0] + 1.2, at[1]), at[1]);
    raftLogs.forEach((m, k) => (m.visible = k < village.raft.parts));
  }
  /* ---------- what is made, as it is made (the woodpile under its roof, a pot fired in the open, oil boiling) ---------- */
  // Shown from the world's own ledger: the woodpile's roof once it stands, as many logs as there is firewood; while a pot
  // is fired the fire is heaped round it and the pot glows with the fire's heat (the run's own fire temperature); while
  // milk boils, the island's pot sits on three stones over the fire, steaming; the cook pot by the shelf when it is idle.
  let craftG: THREE.Group | null = null, stackG: THREE.Group | null = null, stackLogs: THREE.Mesh[] = [], heapG: THREE.Group | null = null, firePot: THREE.Mesh | null = null, potGlow: THREE.Mesh | null = null,
    boilG: THREE.Group | null = null, steam: THREE.Mesh[] = [], idlePot: THREE.Object3D | null = null;
  const glowM = () => new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  /** The colour of a thing at that heat (dull red to yellow), and how bright. */
  function heatColour(c: number, out: THREE.Color): number {
    if (c < 450) return 0;
    const k = Math.min(1, (c - 450) / 650);
    out.setRGB(1, 0.18 + 0.7 * k, 0.04 + 0.45 * k * k);
    return Math.min(1, (c - 450) / 300);
  }
  function makeCraft() {
    craftG = new THREE.Group(); group.add(craftG);
    // the woodpile: four bamboo posts, a roof of leaves, the logs stacked under it
    stackG = new THREE.Group(); const w = atHut(-2.8, -1.4); stackG.position.set(w.x, L.h(w.x, w.z), w.z); stackG.rotation.y = hut.rotation.y; craftG.add(stackG);
    for (const [x, z] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.25, 6), smat(0xa8b060, 0.18)); m.position.set(x, 0.62, z); stackG.add(m); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 1.1), smat(0x5f7d3a, 0.06)); roof.position.y = 1.27; roof.rotation.z = 0.12; stackG.add(roof);
    const logGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.0, 7), logM = smat(0x7b6a52, 0.0);
    stackLogs = Array.from({ length: 15 }, (_, k) => { const m = new THREE.Mesh(logGeo, logM); m.rotation.z = Math.PI / 2; const row = Math.floor(k / 5), c = k % 5; m.position.set(0, 0.07 + row * 0.12, -0.26 + c * 0.13 + (row % 2) * 0.06); m.visible = false; stackG!.add(m); return m; });
    // the fire heaped round a pot, at the fire place
    heapG = new THREE.Group(); heapG.position.copy(PIT); heapG.visible = false; craftG.add(heapG);
    firePot = potMesh(0xb39a7c, 1.1); heapG.add(firePot);
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, m = new THREE.Mesh(logGeo, logM); m.position.set(Math.cos(a) * 0.22, 0.28, Math.sin(a) * 0.22); m.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55); m.scale.set(1, 0.7, 1); heapG.add(m); }
    potGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), glowM()); potGlow.position.y = 0.16; heapG.add(potGlow);
    // the island's pot over the fire on three stones, steaming
    boilG = new THREE.Group(); boilG.position.copy(PIT); boilG.visible = false; craftG.add(boilG);
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28, m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), smat(0x8a8072, 0.05)); m.position.set(Math.cos(a) * 0.2, 0.07, Math.sin(a) * 0.2); boilG.add(m); }
    const bp = potMesh(0xb0603a, 1.1); bp.position.y = 0.14; boilG.add(bp);
    const sm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false });
    steam = [0, 1, 2].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), sm); m.position.set(0, 0.5 + k * 0.18, 0); boilG!.add(m); return m; });
    idlePot = potMesh(0xb0603a, 1.0); const ip = atHut(2.4, -3.0); idlePot.position.set(ip.x, L.h(ip.x, ip.z), ip.z); idlePot.visible = false; craftG.add(idlePot);
  }
  const _hc = new THREE.Color();
  let craftShow: null | { fireC?: number; boil?: boolean } = null;   // (shots and checks only: show a pot fire or a boil without a run)
  /** Each frame: what is being made now. Returns how much the fire place burns for it (0 none, up to 2 for a pot fire). */
  function craftTick(tt: number): number {
    const running = (pid: string) => village.labRuns.map((x) => lab.runs[x.runId]).find((r) => r?.processId === pid && ['starting', 'running', 'needs-input'].includes(r.status));
    const firing = running('p13y_pot_pit_fire') ?? (craftShow?.fireC !== undefined ? { state: { data: { kilnC: craftShow.fireC } } } as any : undefined), boiling = running('p31x_coconut_oil_boil') ?? (craftShow?.boil ? {} as any : undefined);
    const wood = shelfLots().filter((l) => l.materialId === 'firewood').reduce((n, l) => n + l.amount.value, 0);
    if (!craftG && !lab.equipment['eq:firewood_stack'] && !firing && !boiling && !lab.equipment['eq:cook_pot']) return 0;
    if (!craftG) makeCraft();
    stackG!.visible = !!lab.equipment['eq:firewood_stack'];
    const nLogs = Math.min(15, Math.ceil(wood / 3e6)); stackLogs.forEach((m, k) => (m.visible = k < nLogs));
    heapG!.visible = !!firing; boilG!.visible = !!boiling && !firing;
    idlePot!.visible = !!lab.equipment['eq:cook_pot'] && !boiling;
    let burn = boiling ? 1 : 0;
    if (firing) {
      const c = (firing.state?.data as any)?.kilnC ?? 30, b = heatColour(c, _hc);
      (potGlow!.material as THREE.MeshBasicMaterial).color.copy(_hc); (potGlow!.material as THREE.MeshBasicMaterial).opacity = b * (0.55 + 0.08 * Math.sin(tt * 5));
      (firePot!.material as any).uniforms?.uCol?.value?.setRGB?.(0.7 + 0.3 * b, 0.6 - 0.2 * b, 0.48 - 0.3 * b);
      burn = c < 120 ? 0.6 : Math.min(2, 0.8 + (c - 120) / 600);
    }
    if (boiling) steam.forEach((m, k) => { const t = (tt * 0.4 + k / 3) % 1; m.position.set(Math.sin(tt + k) * 0.05, 0.42 + t * 0.6, Math.cos(tt * 0.8 + k) * 0.05); m.scale.setScalar(0.6 + t * 1.4); (m.material as THREE.MeshBasicMaterial).opacity = 0.2 * (1 - t); });
    return burn;
  }
  /* ---------- felling the island's own trees (owner, 2026-10-07: clearing land with their own hands) ---------- */
  // Any grown tree of the forest near home can be felled with the axe: logs (two, three from a tall one) to shape as the
  // hut's were, the branches as firewood (green), a stump, and the ground round it cleared — open land for the field, the
  // house, the village (ocean/forest.ts drops it and its undergrowth; the canopy above opens). What it costs: the trees to
  // windward (south-east, where typhoons blow from) are the house's windbreak — fell three or more there and a typhoon
  // takes another course of thatch.
  const KIND_JA = ['テリハボク', 'オオハマボウ', 'ハスノハギリ', 'ガジュマル'];
  // (made when first needed: three.js draws an id for each thing it makes, and the residents' own draws come after)
  let stumpGeo: THREE.BufferGeometry | null = null, felledG: THREE.Group | null = null;
  function drawStump(x: number, z: number) {
    if (!felledG) { felledG = new THREE.Group(); group.add(felledG); stumpGeo = new THREE.CylinderGeometry(0.17, 0.22, 0.28, 8); }
    const m = new THREE.Mesh(stumpGeo!, wood2); m.position.set(x, L.h(x, z) + 0.1, z); felledG.add(m);
  }
  const falling: { pivot: THREE.Group; t: number; dir: number }[] = [];
  function fallFrom(t: { x: number; z: number; y: number; h: number; kind?: number }, dir: number) {
    const g = new THREE.Group(); g.position.set(t.x, t.y, t.z); group.add(g);
    // (the tree as the forest drew it, coming down — nature team 2026-10-10; else a trunk and rounded masses as before)
    const fl = T.forest?.look?.(t.kind ?? 0);
    if (fl) { const m = new THREE.InstancedMesh(fl.geo, fl.mat, 1); const w = t.h * fl.wide * 0.88; m.setMatrixAt(0, new THREE.Matrix4().makeScale(w, t.h, w)); m.frustumCulled = false; m.userData.shared = true; g.add(m); }
    else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, t.h * 0.6, 7), wood2); trunk.position.y = t.h * 0.3; g.add(trunk);
      for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(t.h * (0.17 - k * 0.015), 8, 6), leafM); b.position.set(Math.sin(k * 2.1) * t.h * 0.12, t.h * (0.62 + k * 0.07), Math.cos(k * 2.1) * t.h * 0.12); g.add(b); }
    }
    falling.push({ pivot: g, t: 0, dir });
  }
  const windward = (x: number, z: number) => { const c = houseG.position, dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz); return d > 1 && d < 35 && (dx + dz) * Math.SQRT1_2 / d > 0.4; };   // (+x east, +z south)
  const windbreakFelled = () => village.felled.filter((f) => windward(f.x, f.z)).length;
  /** Grown trees near home it could fell, nearest home first (the same ones wherever it stands): two not of the windbreak
   *  and the nearest one that is, so that which to fell is a choice. */
  function fellable(r: Resident, n = 2) {
    if (!T.forest) return [];
    const all = (T.forest.standingNear(hut.position.x, hut.position.z, 45) as { x: number; z: number; y: number; h: number; kind: number }[])
      .sort((a, b) => Math.hypot(a.x - hut.position.x, a.z - hut.position.z) - Math.hypot(b.x - hut.position.x, b.z - hut.position.z));
    const lee = all.filter((t) => !windward(t.x, t.z)).slice(0, n), ww = all.find((t) => windward(t.x, t.z));
    return [...lee, ...(ww ? [ww] : [])].map((t) => ({ ...t, d: Math.hypot(t.x - r.pos.x, t.z - r.pos.z) }));
  }
  function fellTask(x: number, z: number): Task | null {
    const t = T.forest?.standingNear(x, z, 0.6)?.[0]; if (!t) return null;
    return task('fell', [t.x, t.z], 'chop', rr(60, 90) + t.h * 15, { data: { x: t.x, z: t.z } });
  }

  /* ---------- Dot's house (robots/house.ts; docs/proposals/sumika-2026-10-07.md) ---------- */
  // Dot puts it up one step at a time, as the hut: each step needs what it needs — a shaped piece, a load of cut grass,
  // rope it has twisted from pandanus roots, bamboo and clay brought by raft from the island to the south — and the
  // world counts what each stage keeps off (wear: above). A typhoon may take courses of thatch off a roof not weighed
  // down; they are laid again first.
  const THATCH0 = stepsBefore('thatch'), ROOF_N = stepsBefore('wattle'), WALLS_N = stepsBefore('floor');
  const RAFT_BAMBOO = 20, RAFT_CLAY = 120;   // (a raft load for the house: twenty poles and some clay, or clay only)
  const left = (need: 'bamboo' | 'clay') => HOUSE_STEPS.slice(village.house.n).filter((x) => x.need === need).length * (need === 'bamboo' ? HOUSE_BAMBOO : HOUSE_CLAY);
  function drawHouse() {
    const h = village.house;
    houseLook.parts.forEach((p, k) => (p.visible = k < h.n && !(k >= ROOF_N - h.lost && k < ROOF_N && h.n >= ROOF_N)));
    yardBamboo.visible = h.bamboo > 0; yardBamboo.scale.setScalar(0.6 + Math.min(1, h.bamboo / 20) * 0.5);
    yardClay.visible = h.clay > 0; const c = 0.5 + Math.min(1, h.clay / 300) * 0.8; yardClay.scale.set(c, 0.4 * c, c);
  }
  /** The next step on the house: a course of thatch blown off is laid again first. */
  function houseNext(): HouseStep | null { const h = village.house; if (h.lost > 0 && h.n >= ROOF_N) return HOUSE_STEPS[THATCH0]; return h.n < HOUSE_N ? HOUSE_STEPS[h.n] : null; }
  /** What the next step still needs ('' when it can be done now). */
  function houseMissing(r: Resident): string {
    const s = houseNext(); if (!s) return '家はできている';
    const h = village.house, miss: string[] = [];
    if (h.rope < s.rope) miss.push(`縄${s.rope}m（いま${h.rope}m）`);
    if (s.need === 'piece' && r.holding !== 'piece') miss.push('削った部材を持っていること');
    if (s.need === 'grass' && r.holding !== 'grass') miss.push('刈った草（茅）を持っていること');
    if (s.need === 'bamboo' && h.bamboo < HOUSE_BAMBOO) miss.push(`竹${HOUSE_BAMBOO}本（いま${h.bamboo}本。南の島から筏で運ぶ）`);
    if (s.need === 'clay' && h.clay < HOUSE_CLAY) miss.push(`粘土${HOUSE_CLAY}kg（いま${h.clay}kg。南の島から筏で運ぶ）`);
    return miss.join('、');
  }
  // where to stand for a step: by its post, under the eaves on one side or another, by the wall it is making, inside for
  // the floor and the table
  function houseStand(s: HouseStep, k: number): [number, number] {
    let lx = 0, lz = 0;
    if (s.kind === 'post') { const [px, pz] = houseLook.posts[k]; lx = px + Math.sign(px) * 0.8; lz = pz; }
    else if (s.kind === 'wattle' || s.kind === 'daub') { const j = (k - stepsBefore(s.kind)) % 4; [lx, lz] = [[0, -HD - 0.9], [HW + 0.9, 0], [0.9, HD + 0.9], [-HW - 0.9, 0]][j]; }
    else if (s.kind === 'floor' || s.kind === 'desk') [lx, lz] = houseLook.inside;
    else { const j = k % 4; [lx, lz] = [[HW + 1.0, 0.4], [-0.4, HD + 1.0], [-HW - 1.0, -0.4], [0.4, -HD - 1.0]][j]; }
    const w = atHouse(lx, lz); return [w.x, w.z];
  }
  function houseTask(r: Resident): Task | null {
    const s = houseNext(); if (!s || houseMissing(r)) return null;
    const h = village.house, k = h.lost > 0 && h.n >= ROOF_N ? ROOF_N - h.lost : h.n;
    return task('house', houseStand(s, k), s.act, s.kind === 'post' ? rr(60, 90) : s.need === 'clay' ? rr(90, 140) : s.kind === 'thatch' ? rr(50, 80) : rr(30, 50));
  }
  function cutTask(): Task | null {
    const c = houseG.position, at = spot([c.x, c.z], 50, (x, z, h) => open(x, z, h) && Math.hypot(x - c.x, z - c.z) > 4 && !PLOTS.some((pl) => Math.hypot(pl.x - x, pl.z - z) < 1.5), 60);
    return at ? task('cut', at, 'pick', rr(60, 100)) : null;
  }
  // (with nothing in mind of its own: the next step, or what it needs for it)
  function houseHabit(r: Resident): Task | null {
    const s = houseNext(); if (!s) return wallTask(r) ?? wallFetchTask(r);   // (the house done: the wall, from the stones Rakko has brought)
    const ready = houseTask(r); if (ready) return ready;
    if (village.house.rope < s.rope) return task('twist', benchStand(), 'work', rr(60, 90));
    if (s.need === 'grass' && !r.holding) return cutTask();
    if (s.need === 'piece' && !r.holding && village.spare > 0) return task('take', benchStand(), 'pick', 3);   // (one put by the bench before)
    if (s.need === 'piece' && !r.holding) {
      const it = items.nearest('wood', r.pos.x, r.pos.z, 220, r.id, clockMs);
      if (it) { items.claim(it, r.id); return task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
      const tr = TREES.find((t) => t.ok && !t.down); if (tr) return task('chop', [tr.x + 0.9, tr.z + 0.3], 'chop', rr(40, 70), { data: tr });
      const ft = fellable(r).find((t) => !windward(t.x, t.z)); if (ft) return fellTask(ft.x, ft.z);   // (a forest tree, not one of the windbreak)
    }
    if (s.need === 'piece' && r.holding === 'wood') return task('craft', benchStand(), 'work', rr(45, 75));
    return null;   // (bamboo or clay: it has to be brought — a crossing is its mind's to choose)
  }
  // (a shaped piece has a use now: the hut, the raft, or the house's next step; with none, it is put by the bench for later
  // rather than carried about — hands full, the crossing for the house's clay was never offered; life-run 2026-10-09)
  const pieceWanted = (r: Resident) => r.stats.built < HUT.length || (village.raft.parts < RAFT_N && Object.keys(village.map.seen).length > 0) || houseNext()?.need === 'piece';
  // (the way in and out once the walls are up: to just outside the doorway, through it, and on — the paths' grid is too
  // coarse for a doorway)
  /** Inside the walled house, or on the line through its door just outside: where a resident walks straight. */
  const inHouseWay = (x: number, z: number) => { if (!houseLook.parts[stepsBefore('wattle')].visible) return false; const p = houseLocal(x, z); return insideHouse(p.x, p.z) || (Math.abs(p.x) < 0.6 && p.z > HD - 1 && p.z < HD + 2.3); };   // (out to two metres in front of the door: the way planned from there, clear of the walls — planned any nearer, a wide body found no way and searched far afield every time)
  function viaDoor(r: Resident, tx: number, tz: number): [number, number] | null {
    if (!houseLook.parts[stepsBefore('wattle')].visible) return null;
    const p = houseLocal(r.pos.x, r.pos.z), t = houseLocal(tx, tz), pin = insideHouse(p.x, p.z);
    if (pin === insideHouse(t.x, t.z)) return null;
    const [ix, iz] = [0, HD - 0.6], [ox, oz] = [0, HD + 1.0], inDoorway = Math.abs(p.x) < 0.4 && p.z > HD - 0.8 && p.z < HD + 0.8;
    const go = (x: number, z: number): [number, number] => { const w = atHouse(x, z); return [w.x, w.z]; };
    if (inDoorway) return null;   // (in the doorway itself: straight on, in or out — a point just past it can count as reached while still in it)
    if (!pin) return Math.hypot(p.x - ox, p.z - oz) < 0.7 ? go(ix, iz) : go(ox, oz);
    return Math.hypot(p.x - ix, p.z - iz) < 0.7 ? go(ox, oz) : go(ix, iz);
  }
  function houseNow() {
    const h = village.house, s = houseNext(), lv = hLevel();
    return { できた: `${h.n}/${HOUSE_N}`, 次: s ? (h.lost > 0 && h.n >= ROOF_N ? '飛んだ茅を葺き直す' : HOUSE_JA[s.kind]) : 'なし（できている）', 守り: { none: 'まだない', frame: '骨組みだけ（雨も風も入る）', roof: '屋根まで（雨は入らない。風は半分）', house: '壁まで（雨も風も入らない。台風にも耐える）' }[lv], 縄: `${h.rope}m`, 竹: `${h.bamboo}本`, 粘土: `${h.clay}kg`, ...(h.lost ? { 飛んだ茅: `${h.lost}段` } : {}), ...(windbreakFelled() ? { 風上で切った木: `${windbreakFelled()}本（3本からは台風で茅がもう1段飛ぶ${wallDone() ? '。石垣があれば飛ばない' : ''}）` } : {}), ...(lv === 'house' ? wallNow() : {}) };
  }
  /* ---------- dwelling, step 3 (docs/proposals/sumika-2026-10-07.md): a stone wall, Rakko's quiet place, Kamemaru's ledge ---------- */
  // The wall: coral stones laid dry (no mortar), three courses of eight, across the south-east of the house, where the
  // typhoons blow from. Rakko brings them up from the bottom to a pile on the beach nearest the house (an otter is good
  // with stones); Dot carries them up and lays them. Once whole, a typhoon takes no thatch, and inside it is hardly felt.
  // Rakko's own, once it has known a rough sea: ten stones in a ring in the shallows near its home, their tops just out of
  // the water — inside, the sea is quiet, and resting there a rough sea costs it little. Kamemaru's, once it has known one:
  // the bottom near its home where it drops away most steeply — a ledge to wedge itself under, as green turtles do; it
  // sleeps there, and a rough sea moves it less.
  const WALL_N = 24, NEST_N = 10, LEDGE_N = 6;
  const SE: [number, number] = [Math.SQRT1_2, Math.SQRT1_2], ALONG: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];   // (+x east, +z south)
  const hash = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  /** The nearest place to c (within maxR) where ok holds: ring by ring outward, the same every time. */
  function nearestWhere(c: [number, number], maxR: number, ok: (x: number, z: number, h: number) => boolean, step = 1.5): [number, number] | null {
    for (let d = 0; d <= maxR; d += step) {
      const n = d === 0 ? 1 : Math.ceil(d * 6.28 / step);
      for (let k = 0; k < n; k++) { const a = k / n * 6.28, x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d; if (ok(x, z, L.h(x, z))) return [x, z]; }
    }
    return null;
  }
  const wallDone = () => village.wall.n >= WALL_N;
  const wallWanted = () => hLevel() === 'house' && village.wall.n + village.wall.pile < WALL_N;
  const roughFelt = (id: string) => !!byId[id]?.mo.roughFelt;
  let pileSpot: [number, number] | null | undefined;
  const stonePile = () => pileSpot !== undefined ? pileSpot : (pileSpot = nearestWhere([houseG.position.x, houseG.position.z], 160, (x, z, h) => shore(x, z, h)));
  const nestAt = () => village.nest.at ?? (village.nest.at = nearestWhere(byId.rakko.sp.home, 140, (x, z, h) => water(0.6, 1.3)(x, z, h)));
  const nestWanted = () => roughFelt('rakko') && village.nest.n < NEST_N && !!nestAt();
  const nestDone = () => village.nest.n >= NEST_N && !!village.nest.at;
  // (and then Kamemaru's ledge: stones piled round it on the open side, so the swell breaks before it gets in — Rakko's
  // doing, once its own place is made; Kamemaru cannot carry a stone)
  const ledgeWanted = () => nestDone() && !!village.kameBed && village.ledge.n < LEDGE_N;
  function wallStone(i: number) {
    const c = houseG.position, course = Math.floor(i / 8), t = (i % 8 - 3.5) * 0.66 + (course % 2 ? 0.33 : 0) - 0.16, d = 4.6 + (hash(i) - 0.5) * 0.12;
    const x = c.x + SE[0] * d + ALONG[0] * t, z = c.z + SE[1] * d + ALONG[1] * t;
    return { x, z, y: L.h(x, z) + 0.2 + course * 0.4 };
  }
  const wallStand = (i: number): [number, number] => { const st = wallStone(i); return [st.x - SE[0] * 1.1, st.z - SE[1] * 1.1]; };
  /** Kamemaru's ledge: near its home, in water of a turtle's depth, where the bottom drops away most steeply. */
  function kameBed(): [number, number] | null {
    if (village.kameBed) return village.kameBed;
    const home = byId.kame.sp.home; let best: [number, number] | null = null, bs = 0;
    for (let d = 3; d <= 60; d += 3) for (let k = 0, n = Math.ceil(d * 6.28 / 3); k < n; k++) {
      const a = k / n * 6.28, x = home[0] + Math.cos(a) * d, z = home[1] + Math.sin(a) * d, h = L.h(x, z);
      if (!water(1.5, 5)(x, z, h)) continue;
      let drop = 0; for (let m = 0; m < 6; m++) { const b = m * 1.047; drop = Math.max(drop, L.h(x + Math.cos(b) * 2.5, z + Math.sin(b) * 2.5) - h); }
      if (drop > bs) { bs = drop; best = [x, z]; }
    }
    if (best) { village.kameBed = best; note(byId.kame, 'nest', {}, `荒れた海に揉まれたので、海の底が段になって落ちこむ所に、岩棚の下の寝場所を見つけた（段の高さ約${bs.toFixed(1)}m）`); }
    return best;
  }
  /** How much of a rough sea it feels where it is: in its quiet place, little. */
  const shelterK = (r: Resident) => {
    if (r.id === 'rakko' && nestDone() && Math.hypot(r.pos.x - village.nest.at![0], r.pos.z - village.nest.at![1]) < 2.5) return 0.2;
    if (r.id === 'kame' && village.kameBed && Math.hypot(r.pos.x - village.kameBed[0], r.pos.z - village.kameBed[1]) < 3.5) return 0.35 - 0.15 * Math.min(1, village.ledge.n / LEDGE_N);
    return 1;
  };
  // (made when first needed: three.js draws an id for each thing it makes)
  let stoneGeo: THREE.BufferGeometry | null = null, coralM: THREE.Material | null = null, wallG: THREE.Group | null = null, nestG: THREE.Group | null = null, ledgeG: THREE.Group | null = null;
  function stoneMesh(i: number, sx: number, sy = sx) {
    stoneGeo ??= new THREE.DodecahedronGeometry(0.24); coralM ??= smat(0xd6cfbd, 0.05);
    const m = new THREE.Mesh(stoneGeo, coralM); m.scale.set(sx * (0.9 + hash(i) * 0.35), sy * (0.75 + hash(i + 7) * 0.3), sx * (0.9 + hash(i + 3) * 0.3)); m.rotation.set(hash(i + 1) * 3, hash(i + 2) * 3, 0); return m;
  }
  const clearG = (g: THREE.Group) => { while (g.children.length) g.remove(g.children[0]); };
  function drawWall() {
    const w = village.wall; if (!w.n && !w.pile && !wallG) return;
    if (!wallG) { wallG = new THREE.Group(); group.add(wallG); }
    clearG(wallG);
    for (let i = 0; i < Math.min(w.n, WALL_N); i++) { const st = wallStone(i), m = stoneMesh(i, 1.4); m.position.set(st.x, st.y, st.z); wallG.add(m); }
    const pa = w.pile > 0 ? stonePile() : null;
    if (pa) for (let i = 0; i < Math.min(w.pile, 8); i++) { const a = i * 2.4, d = 0.2 + Math.sqrt(i) * 0.25, x = pa[0] + Math.cos(a) * d, z = pa[1] + Math.sin(a) * d, m = stoneMesh(100 + i, 1.1); m.position.set(x, L.h(x, z) + 0.12 + (i > 4 ? 0.2 : 0), z); wallG.add(m); }
  }
  function drawNest() {
    const at = village.nest.at; if (!at || !village.nest.n) return;
    if (!nestG) { nestG = new THREE.Group(); group.add(nestG); }
    clearG(nestG);
    for (let i = 0; i < Math.min(village.nest.n, NEST_N); i++) {
      const a = 0.6 + i / NEST_N * 5.2, x = at[0] + Math.cos(a) * 1.6, z = at[1] + Math.sin(a) * 1.6, h = L.h(x, z), top = 0.15, m = stoneMesh(200 + i, 1.5, Math.max(0.6, (top - h) / 0.48));   // (a gap on one side: the way in)
      m.position.set(x, (h + top) / 2, z); nestG.add(m);
    }
  }
  // the pieces put by the bench: a little stack of shaped boards
  let spareG: THREE.Group | null = null, boardGeo: THREE.BufferGeometry | null = null, boardM: THREE.Material | null = null;
  function drawSpare() {
    if (!village.spare && !spareG) return;
    if (!spareG) { spareG = new THREE.Group(); group.add(spareG); }
    clearG(spareG);
    boardGeo ??= new THREE.BoxGeometry(0.9, 0.06, 0.14); boardM ??= smat(0xb08a5e, 0.05);
    const w = atHut(-1.6, 1.0);
    for (let i = 0; i < Math.min(village.spare, 12); i++) { const m = new THREE.Mesh(boardGeo, boardM); m.position.set(w.x + (i % 3 - 1) * 0.17, L.h(w.x, w.z) + 0.04 + Math.floor(i / 3) * 0.065, w.z); m.rotation.y = 0.3 + (Math.floor(i / 3) % 2) * 0.12; spareG.add(m); }
  }
  function drawLedge() {
    const at = village.kameBed; if (!at || !village.ledge.n) { if (ledgeG) clearG(ledgeG); return; }
    if (!ledgeG) { ledgeG = new THREE.Group(); group.add(ledgeG); }
    clearG(ledgeG);
    // (on the seaward side, away from the step it lies under: the way the swell comes in)
    const home = byId.kame.sp.home, out = Math.atan2(at[1] - home[1], at[0] - home[0]);
    for (let i = 0; i < Math.min(village.ledge.n, LEDGE_N); i++) {
      const a = out + (i / (LEDGE_N - 1) - 0.5) * 2.2, x = at[0] + Math.cos(a) * 2.4, z = at[1] + Math.sin(a) * 2.4, m = stoneMesh(300 + i, 1.6, 1.3);
      m.position.set(x, L.h(x, z) + 0.18, z); ledgeG.add(m);
    }
  }
  /** Rakko dives for a coral stone: for its own quiet place, Kamemaru's ledge, or Dot's wall. */
  function seaStoneTask(r: Resident, forWhat: 'nest' | 'ledge' | 'wall'): Task | null {
    const near = forWhat === 'nest' ? nestAt() : forWhat === 'ledge' ? village.kameBed : stonePile(); if (!near) return null;
    const at = spot(near, 40, water(0.8, 4)) ?? spot(near, 80, water(0.8, 5)); if (!at) return null;
    return task('seastone', at, 'dive', rr(30, 50), { wet: true, data: { for: forWhat } });
  }
  const nestTask = (r: Resident): Task | null => { const at = nestAt(); return r.holding === 'stone' && at && village.nest.n < NEST_N ? task('nest', [at[0] + 1.6, at[1]], 'work', 6, { wet: true }) : null; };
  const ledgeTask = (r: Resident): Task | null => { const at = village.kameBed; return r.holding === 'stone' && at && ledgeWanted() ? task('ledge', [at[0] + 2.4, at[1]], 'work', 6, { wet: true }) : null; };
  const dropTask = (r: Resident): Task | null => { const at = stonePile(); return r.holding === 'stone' && at && village.wall.n + village.wall.pile < WALL_N ? task('stonedrop', at, 'pick', 3) : null; };
  const wallTask = (r: Resident): Task | null => r.holding === 'stone' && hLevel() === 'house' && !wallDone() ? task('wall', wallStand(village.wall.n), 'work', rr(40, 70)) : null;
  const wallFetchTask = (r: Resident): Task | null => { const at = stonePile(); return !r.holding && village.wall.pile > 0 && at && !wallDone() ? task('wallfetch', at, 'pick', 4) : null; };
  function wallNow() { return { 石垣: `${village.wall.n}/${WALL_N}${wallDone() ? '（できている。台風でも茅が飛ばない）' : ''}`, 浜の石置き場: `${village.wall.pile}個（ラッコが海の底から運んでくる）` }; }

  let voyaging = false, labT = 0;
  const voyageMs = (km: number) => islandWait((km + 0.5) * 3.6e6);   // (real ms: two km an island hour, there and back, half an hour ashore)
  /** The crossing, as the world judges the day it is tried: the weather, the light left, its battery, how far. */
  // A typhoon forecast at the morning gathering and agreed to: what is done until it comes (or two island days pass) —
  // the raft hauled up the beach, ripe-enough crops taken in early, the animals eating sooner. The world judges, when it
  // has passed, what was saved and what was lost (stormOutcome).
  /** When it has passed: what was saved by getting ready, what was lost; those whose getting ready paid remember it. */
  function stormOutcome() {
    const warned = village.stormPrep > 0 && village.stormPrep <= stormSince, by = village.prepBy, saved: Record<string, string[]> = {}, lost: Record<string, string[]> = {};
    const add = (m: Record<string, string[]>, id: string, what: string) => (m[id] ??= []).push(what);
    if (village.raft.parts > 0) {
      if (village.raft.hauled) add(saved, 'dot', '筏');
      else { const n = Math.ceil(village.raft.parts / 2); village.raft.parts -= n; add(lost, 'dot', `筏の部材${n}本`); }
      village.raft.hauled = false; drawRaft();
    }
    if (village.prepSaved.includes('畑の実')) add(saved, 'dot', '畑の実');
    if (village.house.n >= ROOF_N) {   // (thatch: a roof not weighed down loses a course or two — with walls round it, fewer)
      const k = wallDone() ? 0 : (village.house.weighed ? 0 : village.house.n >= WALLS_N ? 1 : 2) + (windbreakFelled() >= 3 ? 1 : 0);   // (its windbreak felled: one more; the stone wall to windward: none)
      if (wallDone()) add(saved, 'dot', '家の屋根（風上の石垣が守った）');
      if (village.house.weighed) add(saved, 'dot', '家の屋根（重しをかけていた）');
      if (k) { village.house.lost = Math.min(8, village.house.lost + k); add(lost, 'dot', `家の茅（${k}段）`); drawHouse(); }
      village.house.weighed = false;
    }
    const flat = PLOTS.filter((pl) => pl.ok && pl.s === 2);
    if (flat.length) { for (const pl of flat) pl.s = 1; drawField(); add(lost, 'dot', `畑の作物（${flat.length}区画）`); }
    for (const r of list) if (r.sp.living) {
      const h0 = village.onsetHunger[r.id] ?? r.hunger;
      if (r.hunger > 0.8) add(lost, r.id, 'おなか（台風のあいだ食べられず、弱った）');
      else if (warned && h0 < 0.4) add(saved, r.id, 'おなか（前もって食べておいた）');
    }
    const ja = (xs: string[]) => xs.join('・');
    for (const r of list) {
      const sv = saved[r.id] ?? [], ls = lost[r.id] ?? [];
      if (!sv.length && !ls.length) continue;
      const text = warned
        ? `${byId[by]?.v.name ?? ''}の知らせで備えた。${sv.length ? `${ja(sv)}は無事だった` : ''}${sv.length && ls.length ? '。' : ''}${ls.length ? `${ja(ls)}は失った` : ''}`
        : `台風が来ると前もって知らなかった。${ls.length ? `${ja(ls)}を失った` : ''}${sv.length ? `${ja(sv)}は無事だった` : ''}`;
      r.diary.push({ at: clockMs, text, key: 'weather' }); if (r.diary.length > 800) r.diary.shift();
      // (getting ready paid: it remembers whose sign it was — and asks, from now on, at the morning gathering)
      if (warned && sv.length) { village.heed[r.id] = (village.heed[r.id] ?? 0) + 1; agentOf(r)?.values.bonus(`heed:${by}`, `${byId[by]?.v.name ?? by}の台風の知らせ`, 1); }
    }
    const allSaved = Object.values(saved).flat(), allLost = Object.values(lost).flat();
    village.stormLog.push({ at: clockMs, warned, by: warned ? by : '', saved: allSaved, lost: allLost }); if (village.stormLog.length > 30) village.stormLog.shift();
    if (warned && allSaved.length && byId[by]) byId[by].diary.push({ at: clockMs, text: `台風の知らせが役に立った（無事だったもの：${ja(allSaved)}）`, key: 'study' });
    res.onEvent('weather', warned ? `台風に備えていた。無事：${ja(allSaved) || 'なし'}／失ったもの：${ja(allLost) || 'なし'}` : `備えのないまま台風が過ぎた。失ったもの：${ja(allLost) || 'なし'}`, list[0]);
    village.stormPrep = 0; village.prepSaved = []; village.onsetHunger = {};
  }
  function prepActive() { return village.stormPrep > 0 && clockMs - village.stormPrep < islandWait(48 * 3.6e6); }
  const eatAt = (r: Resident, d: number) => (r.body?.learn.eatAt ?? d) - (prepActive() ? 0.25 : 0);
  function voyageJudge(r: Resident, isleId: string): { go: boolean; why?: string; km: number } {
    const i = ISLES.find((x) => x.id === isleId)!, km = fromHome(i).km, hr = localHour(clockMs);
    if (storm()) return { go: false, why: '台風で海が荒れている', km };
    if (wxNow && wxNow.wind >= 8) return { go: false, why: `風が強い（${wxNow.wind.toFixed(1)}m/s）`, km };
    // (a crossing runs on the island's clock — out of sight, as the crops and the processes do: two km an island hour,
    // there and back, and half an hour ashore; owner's decision 2026-10-06. Not before the morning gathering, and back
    // before the light goes)
    if (km > RAFT_KM) return { go: false, why: `筏では遠すぎる（約${km.toFixed(1)}km）`, km };
    if (prepActive()) return { go: false, why: '台風の知らせが出ている', km };
    if (hr < 9.5) return { go: false, why: '朝の集まりのあとで出る', km };
    if (hr + voyageMs(km) / 3.6e6 > 17.5) return { go: false, why: '日のあるうちに戻れない', km };
    if (r.battery < 0.6) return { go: false, why: `電池が足りない（${Math.round(r.battery * 100)}%）`, km };
    return { go: true, km };
  }
  // (what it can know before it sets off — its battery, how far, and the hour: after the morning gathering, and back while it is light;
  // otherwise the offer is not ready, rather than found out at the raft, six days running; life-run 2026-10-09)
  const voyageHour = (km: number, r: Resident) => { const hr = localHour(clockMs); return r.battery < 0.6 ? { ready: false, needs: `電池が6割以上あること（いま${Math.round(r.battery * 100)}%。日なたで充電する）` } : km > RAFT_KM ? { ready: false, needs: `筏で渡れる近さ（約${RAFT_KM}km）であること。ここは遠すぎる（約${km.toFixed(1)}km）` } : hr >= 9.5 && hr + voyageMs(km) / 3.6e6 <= 17.5 ? {} : { ready: false, needs: '朝の集まりのあとに出て、日のあるうちに戻れる時刻であること' }; };
  /** Back from the crossing (or turned back): the map, the record, the reward. */
  function endVoyage(r: Resident, tk: Task, outcome: 'reached' | 'turned') {
    voyaging = false; r.model.root.visible = true; drawRaft();
    const i = ISLES.find((x) => x.id === tk.data.isle)!, w = village.map.seen[i.id]?.word ?? i.id;
    if (outcome === 'reached') {
      // what the raft brings home goes on the shelf by the hut, as the world's own lots: Lantern's science draws on them
      const brought = (i.carry ?? []).map((c) => ({ c, fresh: !Object.values(lab.lots).some((x) => x.materialId === c.materialId) }));
      for (const b of brought) addLot(lab, { lotId: `lot:${i.id}:${++lab.seq}`, materialId: b.c.materialId, amount: { value: b.c.mg, unit: 'mg' }, location: 'shelf', ...(b.c.quality ? { quality: { ...b.c.quality } } : {}) });
      drawStore();
      const firstTime = !village.map.reached[i.id];
      village.map.reached[i.id] = { at: clockMs };
      r.diary.push({ at: clockMs, text: `${w}にたどり着いて戻った。あったもの：${i.has.join('・')}${brought.length ? `。持ち帰った：${brought.map((b) => `${b.c.ja} ${Math.round(b.c.mg / 1e6)}kg`).join('・')}（小屋の棚）` : ''}`, key: 'got' });
      res.onEvent('map', `${r.v.name}が筏で${w}に渡り、戻ってきた`, r);
      // (its reward: the map wider — once for each island — and each material new to the island)
      tk.data.reward = (firstTime ? 1 + Math.log10(1 + i.areaKm2) : 0) + 0.3 * brought.filter((b) => b.fresh).length;
      // (for the house, a raft load of bamboo and clay — beside it, not on the shelf)
      const h = village.house;
      if (r.id === 'dot' && r.stats.built >= HUT.length && houseNext() && i.carry?.some((c) => c.materialId === 'bamboo') && (left('bamboo') > h.bamboo || left('clay') > h.clay)) {
        const nb = left('bamboo') > h.bamboo ? RAFT_BAMBOO : 0, nc = Math.min(nb ? RAFT_CLAY - 40 : RAFT_CLAY, Math.max(0, left('clay') - h.clay));
        h.bamboo += nb; h.clay += nc; drawHouse();
        r.diary.push({ at: clockMs, text: `家の材料を筏で運んだ：${[nb ? `竹${nb}本` : '', nc ? `粘土${nc}kg` : ''].filter(Boolean).join('・')}（家のそば）`, key: 'house' });
        tk.data.reward += 0.6;
      }
    } else { r.diary.push({ at: clockMs, text: `${w}への渡航を途中で引き返した（${tk.data.why ?? '海が荒れた'}）`, key: 'got' }); tk.data.reward = 0; }
    r.battery = Math.max(0.05, r.battery - 0.4);
  }
  function drawShelf() { DRIFT.forEach((d, i) => (shelfItems[i].visible = village.treasures.some((t) => t.what === d.ja))); }
  function tickDrift(dt: number) {
    drift.t += dt;
    if (drift.kind < 0 && drift.t > 5 * 3600) {   // every few hours something washes up, somewhere along the shore
      drift.t = 0;
      const at = spot([PIT.x, PIT.z], 260, tideline, 80); if (!at) return;
      const left = DRIFT.map((_, i) => i).filter((i) => !village.treasures.some((t) => t.what === DRIFT[i].ja));
      drift.kind = (left.length ? left : [0, 1, 2, 3])[Math.floor(Math.random() * (left.length || 4))]; drift.x = at[0]; drift.z = at[1]; drift.by = '';
      driftMesh.geometry = DRIFT[drift.kind].geo; driftMesh.material = DRIFT[drift.kind].mat; driftMesh.position.set(drift.x, L.h(drift.x, drift.z) + 0.06, drift.z); driftMesh.rotation.set(0, Math.random() * 6, drift.kind === 2 ? Math.PI / 2 : 0); driftMesh.visible = true;
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
      id: sp.id, v: VOICES[sp.id], sp: { ...sp, home: [...sp.home] as [number, number] }, model,   // (its own copy: where it lives may change)
      pos: new THREE.Vector3(sp.home[0], L.h(sp.home[0], sp.home[1]), sp.home[1]), head: Math.random() * 6.28, mo: { stride: 0, px: NaN, pz: 0, ph: 0, gait: 0, key: 0, t: 0, act: '', task: null, look: null, why: '', hold: 0, glance: 8 + Math.random() * 17, probe: -1, since: 0, fails: 0, bad: [], recheck: 0 }, battery: sp.living ? 1 : 0.8, hunger: 0.4, sleepy: 0.2, meal: {}, under: 0, body: sp.living ? bodyState(sp.id) : undefined,
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
  // Each one's body, as the world sees it (robots/solids.ts): an upright cylinder the size of its model as it
  // stands (measured, its limbs and shell included: its mean width and length, a little in from the very tips), stepping over what is no
  // higher than a third of its height (a quarter for the two animals); and Dot, carrying a log across its arms, as
  // wide as the log.
  const BODY: Record<string, Body> = {};
  { const bx = new THREE.Box3(), sz = new THREE.Vector3();
    for (const r of list) {
      r.model.root.position.set(0, 0, 0); r.model.root.rotation.set(0, 0, 0); r.model.root.updateMatrixWorld(true);
      // (what is drawn of it as it stands: not its light's beam, nor what it carries only now and then)
      bx.makeEmpty();
      r.model.root.traverseVisible((o: any) => { if (o.isMesh && o !== r.beam && o !== r.held && !(o.material?.blending === THREE.AdditiveBlending)) bx.expandByObject(o, true); });
      bx.getSize(sz);
      BODY[r.id] = { r: Math.max(0.15, (sz.x + sz.z) / 2 * 0.5 * 0.85), y0: 0, y1: sz.y, step: sz.y * (r.sp.living ? 0.25 : 0.33) };
    } }
  const bodyOf = (r: Resident): Body => { const b = BODY[r.id]; return r.holding === 'wood' && r.model.carry ? { ...b, r: Math.max(b.r, 0.38) } : b; };
  // what cannot be gone through: the island's (ocean/shore.ts: trunks, rocks, driftwood) and what has been built here
  const solids: Solids = T.solids ?? new Solids();
  let builtKey = '', built: Solid[] = [], settled = false, lookT = 0, still = false;
  solids.changing(() => {
    // (worked out again only when something has been built or taken down)
    let key = ''; for (const m of HUT) key += m.visible ? 1 : 0; for (const p of houseLook.parts) key += p.visible ? 1 : 0; for (let i = 0; i < posts.length; i++) key += (posts[i].visible ? 2 : 0) + (bases[i].visible ? 1 : 0); key += ':' + Math.min(8, village.wall.n);
    if (key === builtKey) return built;
    builtKey = key; hut.updateMatrixWorld(true); shelf.updateMatrixWorld(true);
    const out: Solid[] = built = [], y = hut.position.y;
    HUT.forEach((m, k) => { if (!m.visible || (k >= 4 && k < 18)) return; const w = m.getWorldPosition(new THREE.Vector3()); out.push({ kind: 'post', x: w.x, z: w.z, r: k < 4 ? 0.07 : 0.05, y0: y - 0.2, y1: y + (k < 4 ? 1.7 : 0.65) }); });
    for (const [lx, r0] of [[0, 0.27], [-0.35, 0.18], [0.35, 0.18]]) { const w = bench.localToWorld(new THREE.Vector3(lx, 0, 0)); out.push({ kind: 'bench', x: w.x, z: w.z, r: r0, y0: y - 0.2, y1: y + 0.5 }); }
    for (const lx of [-0.3, 0.3]) { const w = shelf.localToWorld(new THREE.Vector3(lx, 0, 0)); out.push({ kind: 'shelf', x: w.x, z: w.z, r: 0.2, y0: shelf.position.y - 0.2, y1: shelf.position.y + 0.6 }); }
    posts.forEach((m, i) => { if (m.visible) out.push({ kind: 'pile', x: m.position.x, z: m.position.z, r: 0.09, y0: m.position.y - 2, y1: 0.95 }); else if (bases[i].visible) out.push({ kind: 'pile', x: bases[i].position.x, z: bases[i].position.z, r: 0.26, y0: bases[i].position.y - 0.3, y1: bases[i].position.y + 0.2 }); });
    out.push({ kind: 'fire', x: PIT.x, z: PIT.z, r: 0.45, y0: PIT.y - 0.2, y1: PIT.y + 0.3 });
    // (the house: its posts, then its walls once the lattice is up — the doorway open)
    const hy = houseG.position.y, W0 = stepsBefore('wattle');
    houseLook.posts.forEach(([x, z], i) => { if (houseLook.parts[i].visible) { const w = atHouse(x, z); out.push({ kind: 'post', x: w.x, z: w.z, r: 0.08, y0: hy - 0.3, y1: hy + EAVE_H }); } });
    houseLook.wallDots.forEach((dots, j) => { if (houseLook.parts[W0 + j].visible) for (const [x, z] of dots) { const w = atHouse(x, z); out.push({ kind: 'post', x: w.x, z: w.z, r: 0.12, y0: hy - 0.3, y1: hy + EAVE_H }); } });
    for (let i = 0; i < Math.min(8, village.wall.n); i++) { const st = wallStone(i); out.push({ kind: 'post', x: st.x, z: st.z, r: 0.34, y0: st.y - 0.4, y1: st.y + 1.0 }); }   // (the stone wall's first course)
    return out;
  });
  const bonds: Record<string, Bond> = {};
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) bonds[pair(list[i].id, list[j].id)] = { stage: 0, know: 0, talks: 0, last: -1e12, toldWorry: 0 };
  const talks: Entry[] = [];
  const visited = new Set<string>();
  let clockMs = Date.now(), inspectCool = 180, admireCool = 60, seeCool = 90, showCool = 0;
  const shownTo: Record<string, number> = {};   // (when Rakko last showed something to each of the others)
  const _ey = new THREE.Vector3(), _fd = new THREE.Vector3(), _fp = new THREE.Vector3();   // (seconds actually watched until Dot may next stand back to look at its work: not straight after the island is opened)

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

  // Concrete, terrain-checked destinations. An AI can select their IDs, never invent coordinates.
  const studyPlaces: StudyPlace[] = [];
  function initStudyPlaces() {
    if (!study) return;
    const home = byId.lantern.sp.home;
    for (let k = 0; k < 80 && studyPlaces.length < 3; k++) {
      const angle = k * 2.399963, radius = k === 0 ? 0 : 8 + Math.sqrt(k) * 5;
      const x = home[0] + Math.cos(angle) * radius, z = home[1] + Math.sin(angle) * radius;
      if (!open(x, z, L.h(x, z)) || walkCost(x, z) >= 2 || (T.vegH?.(x, z) ?? 0) > 0.45) continue;
      if (studyPlaces.some(p => Math.hypot(p.x - x, p.z - z) < 12)) continue;
      const n = studyPlaces.length;
      studyPlaces.push({ id: `hill-${n}`, name: ['丘の開けた場所', '丘の小道のそば', '丘のもう一つの見晴らし'][n], x, z, openSky: true });
    }
  }
  function studyWorld(fast = studyFast): StudyWorld {
    const r = byId.lantern;
    return { atMs: clockMs, lat: loc.lat, lon: loc.lon, battery: r.battery, position: [r.pos.x, r.pos.z],
      cloud: fast ? null : studyCloud, cloudSource: fast ? 'unknown' : studyCloudSource, offline: fast,
      places: studyPlaces.filter(p => walkCost(p.x, p.z) < 2),
      companions: list.filter(o => o !== r && !o.talk && o.act !== 'sleep' && !o.wet && Math.hypot(o.pos.x-r.pos.x,o.pos.z-r.pos.z) <= 4)
        .map(o => ({ id: o.id, name: o.v.name, x: o.pos.x, z: o.pos.z })) };
  }
  function studyTask(intent: StudyIntent): Task {
    const acts: Record<StudyIntent['action'], Act> = { observe: 'think', draw: 'work', explore: 'look', rest: 'idle', share: 'look' };
    return task(`study-${intent.action}`, [intent.x, intent.z], acts[intent.action], intent.duration,
      { data: { studyId: intent.id }, arrived: Math.hypot(intent.x-byId.lantern.pos.x,intent.z-byId.lantern.pos.z) < 0.6 })!;
  }
  function cancelLostStudy(r: Resident, fast: boolean) {
    if (r.id !== 'lantern' || !study?.state.active) return;
    const id = study.state.active.id;
    if (r.task?.data?.studyId !== id && r.resume?.data?.studyId !== id)
      study.interrupt(id, studyWorld(fast), '暮らしの用事を先にするため、途中の作業を手帖に残した。');
  }

  /* ---------- what lies about the island ---------- */
  // (nothing washes up or turns up inside a rock or a trunk: where it lies can be seen, and reached)
  const ITEM_BODY = { r: 0.25, y0: 0, y1: 0.4, step: 0.05 }, clearOf = (x: number, z: number, h: number) => !solids.hit(x, z, ITEM_BODY, h);
  const items = makeItems((x, z) => T.drawn ? Math.max(L.h(x, z), T.drawn(x, z)) : L.h(x, z), spot, {   // (drawn on the sand as drawn)
    wood: { near: byId.dot.sp.home, rad: 160, ok: (x, z, h) => tideline(x, z, h) && clearOf(x, z, h), max: 8, every: 1200 },
    shell: { near: byId.rakko.sp.home, rad: 170, ok: (x, z, h) => tideline(x, z, h) && clearOf(x, z, h), max: 16, every: 260 },
    stone: { near: [byId.lantern.sp.home[0] - 40, byId.lantern.sp.home[1] + 20], rad: 140, ok: (x, z, h) => h > 1.2 && cover(x, z).can < 0.4 && clearOf(x, z, h), max: 12, every: 900 },
    // (coconuts drop at the top of the beach, where the shore plants begin)
    coconut: { near: byId.dot.sp.home, rad: 170, ok: (x, z, h) => h > 0.7 && h < 3.5 && cover(x, z).can < 0.6 && clearOf(x, z, h), max: 6, every: 1500 },
  }, itemMat, group);

  /* ---------- the diary and what happened today ---------- */
  function note(r: Resident, key: string, vars: Record<string, string | number> = {}, today?: string, obs?: string) {
    // (a plain record of what happened — no voice put on: ADR 0004, addendum 2026-10-04)
    const base = today ?? PLAIN[key]?.(vars); if (!base) return;
    const text = vars.sight ? `${base}。${vars.sight}` : base;
    r.diary.push(obs ? { at: clockMs, text, key, obs } : { at: clockMs, text, key }); if (r.diary.length > 800) r.diary.shift();
    if (today) { r.today.push(today); if (r.today.length > 6) r.today.shift(); }
    res.onEvent(key, `${r.v.name}：${text}`, r);
  }
  const PLAIN: Record<string, (v: Record<string, string | number>) => string> = {
    find: (v) => `浜で${v.thing}を拾った`, cairn: () => '目印の石を積んだ（4つ）', charge: () => '日なたで充電した',
  };
  const statVars = (r: Resident) => {
    const s = r.stats, map = Math.round(Math.min(100, visited.size / 3.2));
    return { built: s.built, notes: s.notes, shells: s.shells, map, food: s.food, deck: village.deck };
  };
  // what it saw, for its diary: only the fish it really made out (T.nearFish, ahead of its eyes, now and while it
  // grazed), never a name drawn at random; nothing seen is said as such
  const sight = (r: Resident) => {
    if (T.nearFish) {
      const eye = _ey.set(r.pos.x, Math.min(r.pos.y + 0.25, -0.3), r.pos.z), fwd = _fd.set(Math.sin(r.head), 0, Math.cos(r.head));
      const name = T.nearFish(eye, fwd, 10, _fp); if (name) (r.spotted ??= []).push(name);
    }
    const names = [...new Set(r.spotted ?? [])]; r.spotted = [];
    const text = names.length ? `${names.slice(0, 3).join('、')}${names.length > 3 ? 'など' : ''}を見た。` : '目にとまる魚はいなかった。';
    return { text, obs: names.length ? `見分けた魚 ${names.length}種` : '' };
  };

  /* ---------- deciding what to do next ---------- */
  function sleepTime(r: Resident, hr: number) { return r.sp.nightOwl ? hr > 10 && hr < 16.5 : hr >= 21.5 || hr < 5.8; }   // (Lantern up until ten: owner, 2026-10-06)
  function task(kind: string, at: [number, number] | null, act: Act, dur: number, extra: Partial<Task> = {}): Task | null {
    return at ? { kind, x: at[0], z: at[1], act, dur, t: 0, arrived: false, ...extra } : null;
  }
  // The two animals: what their bodies ask for comes first. Rakko dives for its food when it is hungry
  // (by night too, if it is very hungry) and sleeps on its back; Kamemaru grazes the seagrass, sleeps on
  // the bottom by night, and hauls out to bask on a warm afternoon.
  // (water of that depth, and the sea or a lagoon: not a pool or a hollow cut off from it — src/ocean/water.ts)
  const water = (lo: number, hi: number) => (x: number, z: number, h: number) => h < -lo && h > -hi && (!T.water || ((k: string) => k === 'sea' || k === 'lagoon')(T.water(x, z)))
    && (!T.top || T.top(x, z) < h + 0.15);   // (on the bare bottom, not down onto a coral head)
  // Rakko's food is at its own places on the bottom, so much of each there and slowly coming back; Kamemaru's is the
  // seagrass of a few beds (robots/body.ts). Placed once, kept with the island.
  const PATCH_NAMES = ['岩場A', '岩場B', '岩場C', '岩場D', '岩場E', '岩場F', '岩場G', '岩場H'];
  const patches: Patch[] = [], beds: Bed[] = [];
  { const rnd0 = Math.random, own = mulberry32(9157); Math.random = own;   // (their own draw: the island's other chances are left as they were)
   try {
    const rh = byId.rakko?.sp.home, kh = byId.kame?.sp.home;
    for (let k = 0; rh && patches.length < 8 && k < 60; k++) {
      const at = spot(rh, 35 + (k % 8) * 12, water(1.5, 7)); if (!at || patches.some((p) => Math.hypot(p.x - at[0], p.z - at[1]) < 15)) continue;
      patches.push(makePatch(`patch#${patches.length}`, at[0], at[1], Math.random, Date.now()));
    }
    for (let k = 0; kh && beds.length < 5 && k < 40; k++) {
      const at = spot(kh, 50 + (k % 5) * 20, water(1.2, 5)); if (!at || beds.some((b) => Math.hypot(b.x - at[0], b.z - at[1]) < 20)) continue;
      beds.push({ id: `bed#${beds.length}`, x: at[0], z: at[1], grass: 1, at: Date.now() });
    }
   } finally { Math.random = rnd0; } }
  const patchById = (id?: string) => patches.find((p) => p.id === id);
  const patchName = (id?: string) => { const p = patchById(id); return p?.by ? `${byId[p.by]?.v.name ?? ''}の漁礁` : PATCH_NAMES[+(id ?? '').split('#')[1]] ?? '岩場'; };
  const nearPatch = (p: Patch) => spot([p.x, p.z], 6, water(1.2, 8)) ?? [p.x, p.z] as [number, number];
  // the place it would go to eat: one it knows that gave it something last time, else the nearest it knows
  function bestPatch(r: Resident): Patch | undefined {
    const b = r.body; if (!b) return patches[0];
    if (!b.known.length) b.known = patches.slice().sort((x, y) => Math.hypot(x.x - r.sp.home[0], x.z - r.sp.home[1]) - Math.hypot(y.x - r.sp.home[0], y.z - r.sp.home[1])).slice(0, 3).map((p) => p.id);
    const ks = b.known.map(patchById).filter(Boolean) as Patch[];
    return ks.sort((x, y) => Math.hypot(x.x - r.pos.x, x.z - r.pos.z) - Math.hypot(y.x - r.pos.x, y.z - r.pos.z))[0];
  }
  const full = (r: Resident) => Math.round(100 * (1 - r.hunger));          // (as it would say it: 0 empty .. 100 full)
  const awake100 = (r: Resident) => Math.round(100 * r.sleepy);          // (how sleepy, 0..100)
  const about = (n: number) => `${Math.round(n / 10) * 10}前後`;          // (said roughly: the same lesson is the same lesson)
  /** Something went badly because of its hunger or sleepiness: counted, said in its diary, told to its mind with how it
   *  was; its habit's own mark moves a little earlier (robots/body.ts). */
  function troubled(r: Resident, kind: Trouble, text: string, popText: string, detail?: string) {
    if (!r.body) return;
    newDay(r.body, r.id, dayOf(clockMs)); trouble(r.body, kind);
    r.diary.push({ at: clockMs, text, key: 'body' }); if (r.diary.length > 800) r.diary.shift();
    res.onEvent('body', `${r.v.name}：${text}`, r);
    pops.push({ r, text: popText, k: 'bad', born: performance.now() }); if (pops.length > 24) pops.shift()?.el?.remove();
    const a = agentOf(r); if (a) { a.result(`body:${kind}`, kind, 'blocked', clockMs, detail ?? text); flushMind(r, a); }
  }
  /** What a body let go too far does to it, as it goes (robots/body.ts): dozing off where it is, things slipping from
   *  its paws, (Rakko) a chill that leaves it only floating and grooming. Never lasting; always told with how it was. */
  function bodyCheck(r: Resident, hr: number, dt: number) {
    const k = r.task?.kind ?? '';
    if (['sleep', 'doze', 'nap', 'fire', 'shiver', 'rest'].includes(k) || r.talk || sleepTime(r, hr)) return;
    if (r.sleepy > NEEDS.dozeAt) {
      report(r, r.task, 'interrupted', 'うとうと寝てしまった'); items.release(r.id); r.mo.bout = undefined;
      troubled(r, 'doze', `ねむくて、そのままうとうと寝てしまった（ねむけ ${about(awake100(r))}）`, 'うとうと', `ねむけ ${about(awake100(r))}で起きていたら、寝てしまった`);
      r.task = task('doze', [r.pos.x, r.pos.z], 'sleep', rr(900, 1800), { arrived: true, wet: r.wet, data: { doze: true } }); return;
    }
    const held = r.holding;
    if ((held === 'shell' || held === 'wood' || held === 'stone') && r.walk > 0.1 && r.sleepy > NEEDS.fumbleAt && Math.random() < dt / 240) {
      r.holding = ''; if (!r.wet) items.addAt(held, r.pos.x, r.pos.z);
      const name = ({ shell: '貝殻', wood: '流木', stone: '石' } as Record<string, string>)[held];
      report(r, r.task, 'blocked', `ねむくて${name}を落とした`); items.release(r.id);
      troubled(r, 'fumble', `ねむくて、持っていた${name}を${r.wet ? '海に落としてしまった' : '落としてしまった'}（ねむけ ${about(awake100(r))}）`, '落とした', `ねむけ ${about(awake100(r))}で運んでいたら落とした`);
      r.task = null; return;
    }
    if (r.id === 'rakko' && r.hunger > NEEDS.coldAt && k !== 'forage' && k !== 'eat' && clockMs - (r.mo.coldAt ?? -1e12) > 40 * 60e3) {
      r.mo.coldAt = clockMs; report(r, r.task, 'interrupted', '体が冷えた'); items.release(r.id);
      troubled(r, 'cold', `おなかがすきすぎて体が冷えた。浮かんで毛づくろいするしかなかった（おなか ${about(full(r))}）`, 'ぶるっ', `おなか ${about(full(r))}まで食べずにいたら、体が冷えて何もできなかった`);
      r.task = task('shiver', r.wet ? [r.pos.x, r.pos.z] : spot([r.pos.x, r.pos.z], 30, water(0.8, 4)) ?? [r.pos.x, r.pos.z], 'groom', rr(600, 1200), { wet: true, arrived: r.wet });
    }
  }
  /** A spell of diving to eat begins: what it was like when it started, kept to tell how it went at the end. */
  function startBout(r: Resident, t: Task | null, opt?: string): Task | null {
    if (!t) return null;
    if (r.body) { newDay(r.body, r.id, dayOf(clockMs)); r.body.eatStarts.push(full(r)); }
    r.mo.bout = { patch: t.data?.patch, tries: 0, got: 0, weak: 0, full: full(r), opt };
    return t;
  }
  /** The spell is over (full, or it has given up there): what it ate, how it went, and its fur after. */
  function endBout(r: Resident) {
    const b = r.mo.bout; r.mo.bout = undefined;
    const NAME: Record<string, [string, string]> = { urchin: ['ウニ', 'つ'], crab: ['カニ', '匹'], clam: ['貝', 'つ'] };
    const meal = Object.entries(r.meal).map(([k, n]) => `${NAME[k][0]}${n}${NAME[k][1]}`).join('、'); r.meal = {};
    if (meal) note(r, 'eat', { meal }, `${meal}食べた`);
    if (!b) { r.task = meal ? task('groom', [r.pos.x, r.pos.z], 'groom', rr(60, 150), { wet: true, arrived: true }) : null; return; }
    const where = patchName(b.patch), detail = `${where}で${b.tries}回潜って${b.got}回獲れた・潜り始めのおなか ${about(b.full)}`;
    if (r.body && b.patch && !r.body.known.includes(b.patch)) r.body.known.push(b.patch);
    if (b.weak >= 2 && b.got * 2 < b.tries) troubled(r, 'weak', `おなかがすきすぎて、潜っても力が出なかった（${detail}）`, '力が出ない', detail);
    else if (!b.got) { r.diary.push({ at: clockMs, text: `${where}では何も獲れなかった`, key: 'body' }); }
    act(r, 'got', `食べに潜った：${detail}`);
    const a = agentOf(r); if (a && b.opt) { a.result(b.opt, 'eat', b.got ? 'done' : 'gone', clockMs, detail, b.got / Math.max(1, b.tries), `${where}で食べる`); flushMind(r, a); }
    // (fed at a reef another made: that one's doing has paid — learnt as such)
    { const pp = patchById(b.patch); if (a && pp?.by && b.got) a.values.bonus(`made:${pp.by}`, `${byId[pp.by]?.v.name ?? pp.by}がつくった漁礁`, b.got / Math.max(1, b.tries)); }
    r.task = b.got ? task('groom', [r.pos.x, r.pos.z], 'groom', rr(60, 150), { wet: true, arrived: true }) : null;   // (after eating, cleaning the fur)
  }
  /** A dive at a patch: what it will come up with is the patch's to give, and less when it is weak from hunger. */
  function forage(at: [number, number] | null, p?: Patch | null, r?: Resident): Task | null {
    if (p) regrow(p, clockMs);
    const d = p && r ? dive(p, r.hunger, Math.random) : { prey: '' as Food, weak: !!r && r.hunger > NEEDS.weakAt };
    return task('forage', at, 'dive', rr(35, 75) * (d.weak ? 0.6 : 1), { wet: true, data: { prey: d.prey, weak: d.weak, patch: p?.id } });
  }
  function live(r: Resident, hr: number): Task | null | undefined {
    const home = r.sp.home, day = dayK(hr), night = sleepTime(r, hr);
    if (r.id === 'rakko') {
      // (too hungry to go on: what it carries is let go where it is — a shell back on the sand — and it goes to eat)
      if (r.holding && r.hunger > 0.8) { if (r.holding === 'shell') items.addAt('shell', r.pos.x, r.pos.z); r.holding = ''; }
      if (r.holding) return undefined;
      // (past what it can let go: the body decides — very hungry, it dives whatever it had in mind; the rest is its own)
      if (r.hunger > (night ? 0.85 : 0.8)) { const p = bestPatch(r); return startBout(r, p ? forage(nearPatch(p), p, r) : null); }
      const nest = nestDone() ? village.nest.at! : null;
      if (night) return task('sleep', nest ?? spot(home, 60, water(0.6, 3)) ?? spot(home, 140, water(0.5, 6)) ?? home, 'sleep', 1200, { wet: true });   // (always in the water, on its back — in its quiet place, once it has one)
      if (nest && roughK() > 0.5 && r.hunger < 0.7 && !r.holding) return task('nap', nest, 'sleep', rr(900, 1800), { wet: true });   // (a rough sea: it waits it out there)
      if (!agentOf(r)) {
        if (r.hunger > eatAt(r, 0.5)) { const p = bestPatch(r); return startBout(r, p ? forage(nearPatch(p), p, r) : null); }
        if (r.sleepy > (r.body?.learn.sleepAt ?? 0.65) && day > 0.3) return task('nap', spot(home, 50, water(0.8, 4)), 'sleep', rr(600, 1500), { wet: true });
      }
      return undefined;
    }
    const bed = village.kameBed;   // (its ledge, once it has found one)
    if (night) return task('sleep', bed ?? spot(home, 60, water(1.5, 5)) ?? spot(home, 140, water(1, 8)) ?? home, 'sleep', 1800, { wet: true });
    if (bed && roughK() > 0.5 && r.hunger < 0.7 && !r.holding) return task('sleep', bed, 'sleep', 1800, { wet: true });   // (a rough sea: wedged under its ledge)
    if (r.holding) return undefined;
    // (so hungry it cannot go on: it hauls out and lies still for a while — and grazes sooner after this)
    if (r.hunger > NEEDS.stuckAt && day > 0.15) { troubled(r, 'stuck', `おなかがすきすぎて、動けなくなった（おなか ${full(r)}）`, '動けない'); return task('rest', spot([r.pos.x, r.pos.z], 60, shore, 120) ?? [r.pos.x, r.pos.z], 'bask', rr(5400, 9000)); }
    if (r.hunger > eatAt(r, 0.45) && day > 0.15) {
      // (the bed it knows with the most grass left; it learns how they are by going)
      for (const b of beds) regrowBed(b, clockMs);
      // (a bed it went for last time without eating there — no way through, or nothing left — it leaves alone for a while)
      const tr = r.mo.grazeTry; if (tr && clockMs - tr.at < 3 * 3.6e6 && r.hunger >= tr.hunger - 0.01) (r.mo.grazeAvoid ??= {})[tr.bed] = clockMs;
      const ok = beds.filter((b) => b.grass > 0.1 && clockMs - (r.mo.grazeAvoid?.[b.id] ?? -1e12) > 3 * 3.6e6);
      const bd = ok.sort((x, y) => y.grass - x.grass - (Math.hypot(x.x - r.pos.x, x.z - r.pos.z) - Math.hypot(y.x - r.pos.x, y.z - r.pos.z)) / 400)[0];
      r.mo.grazeTry = bd ? { bed: bd.id, at: clockMs, hunger: r.hunger } : undefined;
      return task('graze', bd ? [bd.x, bd.z] : spot(home, 90, water(1.2, 5)) ?? spot(home, 160, water(1, 7)), 'graze', rr(2400, 4200), { wet: true, data: { bed: bd?.id } });
    }
    if ((r.sleepy > 0.6 || Math.random() < 0.15) && day > 0.7 && hr > 10 && hr < 16.5) return task('bask', spot(home, r.sp.range, shore, 200), 'bask', rr(1500, 3600));
    return undefined;
  }
  function decide(r: Resident, hr: number): Task | null {
    const home = r.sp.home, day = dayK(hr);
    if (r.sp.living) { const t = live(r, hr); if (t !== undefined) return t; }
    if (sleepTime(r, hr)) {
      if (r.id === 'rakko') return task('sleep', spot(home, 6, (x, z, h) => h < -0.6 && h > -3) ?? home, 'sleep', 1200, { wet: true });
      return task('sleep', r.id === 'dot' && hLevel() === 'house' ? shelterAt() : home, 'sleep', 1200);   // (Dot, once its house has walls: in it; Lantern, once it lives there, its home is in it)
    }
    if (r.battery < 0.3 && day > 0.4 && !r.sp.nightOwl && !r.sp.living) return task('charge', spot(home, 30, open), 'idle', rr(600, 1400));
    const q = Math.random();
    // something strange lying on the beach nearby: go and look
    if (!agentOf(r) && drift.kind >= 0 && !drift.by && !r.holding && Math.hypot(drift.x - r.pos.x, drift.z - r.pos.z) < 60) { drift.by = r.id; return task('find', [drift.x, drift.z], 'pick', 6); }
    if (!agentOf(r) && r.holding === 'drift') return task('shelve', (() => { const w = shelf.position; return [w.x + 0.6, w.z + 0.6] as [number, number]; })(), 'work', 4);
    // Lantern: a process it can run, with its material on the shelf — while it is awake (it works by its own light), hands
    // free (the world runs it)
    if (r.id === 'lantern' && !r.holding && !sleepTime(r, hr) && !village.labRuns.some((x) => x.by === r.id && lab.runs[x.runId]?.status !== 'completed' && catalog.find((c) => c.processId === x.processId)?.tend === 'stay')) {   // (only hand work keeps it: a gauge left reading, wood left a month to season, a pot left to dry do not — life-run 2026-10-09)
      const pt = pitTask(); if (pt) return pt;   // (the clay pit first: the island's first tub)
      const wt = workshopTask(); if (wt) return wt;   // (tools, the woodpile, a fired pot made a cook pot)
      const e = labReady()[0]; if (e) return task('lab', shelfStand(), 'work', e.entry.tend === 'stay' ? 4 * 3600 : 12, { data: { processId: e.entry.processId, key: e.entry.key, lotId: e.lot?.lotId ?? '', more: e.more.map((l) => l.lotId) } });
    }
    // the pier, once they have agreed on it
    if (village.pier === 'plan' && r.id === 'kame') return task('survey', along(1), 'look', rr(60, 120));
    if (village.pier === 'build') {
      if (r.id === 'lantern' && r.holding === 'stone' && village.bases < 4) return task('base', along(-0.8), 'work', 6);   // (from the shore it hands the stone out)
      if (r.id === 'rakko' && r.holding === 'wood' && village.posts < village.bases) return task('post', pileStand(village.posts, true), 'work', 8, { wet: true });
      if (r.id === 'dot' && r.holding === 'plank') return task('deck', plankStand(village.deck), 'hammer', 8);
      if (r.id === 'rakko' && !r.holding && village.posts < village.bases && q < 0.3) {
        const it = items.nearest('wood', r.pos.x, r.pos.z, 260, r.id, clockMs);
        if (it) { items.claim(it, r.id); return task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
      }
      if (r.id === 'lantern' && !r.holding && village.bases < 4 && q < 0.35 && 1 - dayK(hr) > 0.5) {
        const it = items.nearest('stone', r.pos.x, r.pos.z, 400, r.id, clockMs);
        if (it) { items.claim(it, r.id); return task('fetch', [it.x, it.z], 'work', 3, { data: it }); }
      }
      if (r.id === 'kame' && q < 0.2) return task('inspect', along(4), 'look', rr(120, 300));   // keeping an eye on the work, and the tide
      if (r.id === 'dot' && !r.holding && village.posts >= 4 && village.deck < 8 && (r.stats.built >= HUT.length || q < 0.15) && q < 0.3) {
        const it = items.nearest('wood', r.pos.x, r.pos.z, 220, r.id, clockMs);
        if (it) { items.claim(it, r.id); return task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
      }
    }
    // one with a mind of its own: its own goal and steps first (its habits below, if it has nothing in mind)
    // (a typhoon forecast and agreed to: Dot hauls the raft up and takes in what crops it can, before anything else)
    if (r.id === 'dot' && prepActive() && !r.holding) {
      if (village.raft.parts > 0 && !village.raft.hauled && Number.isFinite(village.raft.x)) return task('haul', [village.raft.x, village.raft.z], 'work', rr(40, 70));
      if (village.house.n >= ROOF_N && !village.house.weighed) { const w = atHouse(0, HD + 1.0); return task('weigh', [w.x, w.z], 'work', rr(40, 70)); }
      const early = PLOTS.find((pl) => pl.ok && pl.s === 2 && growth(pl) >= 0.6);
      if (early) return task('harvest-early', [early.x + 0.8, early.z], 'pick', 8, { data: early });
    }
    { const t = agentTask(r); if (t !== undefined) return t; }
    switch (r.id) {
      case 'dot': {
        // one piece at a time: find a log, bring it to the bench, shape it, fit it
        if (r.holding === 'piece') { if (r.stats.built < HUT.length) return task('place', slotStand(r.stats.built), 'hammer', 7); const at = village.raft.parts < RAFT_N && Object.keys(village.map.seen).length ? raftAt() : null; return at ? task('lash', at, 'work', rr(30, 50)) : houseTask(r) ?? task('stow', benchStand(), 'pick', 3); }
        if (r.holding === 'grass') return houseTask(r) ?? (r.holding = '', null);
        if (r.holding === 'stone') return wallTask(r) ?? (r.holding = '', null);
        if (r.holding === 'wood') return task('craft', benchStand(), 'work', rr(45, 75));
        if (r.stats.built >= HUT.length) {
          // the hut stands: clear the ground and farm it
          const ripe = PLOTS.find((pl) => pl.ok && pl.s === 2 && growth(pl) >= 1);
          if (ripe) return task('harvest', [ripe.x + 0.8, ripe.z], 'pick', 8, { data: ripe });
          if (q < 0.75) { const ht = houseHabit(r); if (ht) return ht; }   // (the house, next to the hut)
          const wild = PLOTS.find((pl) => pl.ok && pl.s === 0);
          const inWay = TREES.slice(0, 3).find((t) => t.ok && !t.down);
          if (wild && inWay && q < 0.4) return task('chop', [inWay.x + 0.9, inWay.z + 0.3], 'chop', rr(40, 70), { data: inWay });
          if (wild && q < 0.4) return task('till', [wild.x + 0.8, wild.z], 'dig', rr(60, 110), { data: wild });
          const tilled = PLOTS.find((pl) => pl.ok && pl.s === 1);
          if (tilled && q < 0.45) return task('plant', [tilled.x + 0.8, tilled.z], 'pick', rr(20, 35), { data: tilled });
          return q < 0.7 ? task('look', spot(home, 80, shore, 200), 'idle', rr(120, 400)) : task('wander', spot(home, 40, open), 'idle', rr(60, 200));   // (a rest between jobs)
        }
        if (q < 0.7 && r.stats.built < HUT.length) {
          const it = items.nearest('wood', r.pos.x, r.pos.z, 220, r.id, clockMs);
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
        // (the study when it has something to do — and now and then a walk to think it over; otherwise its usual life)
        if (study && !r.holding && (study.productive(studyWorld()) || Math.random() < 0.15)) {
          const intent = study.choose(studyWorld());
          if (intent) return studyTask(intent);
          if (study.productive(studyWorld())) return task('study-pause', [r.pos.x, r.pos.z], 'look', 20, { arrived: true });
        }
        const night = 1 - day;
        if (night < 0.5) return task('rest', spot(home, 20, open) ?? home, 'idle', rr(300, 900));   // (evening and dawn: it waits by its hill)
        if (r.holding === 'stone') {
          const c = cairnSpots.find((c) => c[2] < 4) ?? null, at = c ? [c[0] - 0.7, c[1]] as [number, number] : spot(home, 40, (x, z, h) => h > 11);
          if (at) return task('stack', at, 'work', 5, { data: c });
          items.addAt('stone', r.pos.x, r.pos.z); r.holding = '';   // (no high ground near to stack it on: it is put down, and the hands are free)
        }
        if (r.holding === 'coconut') return task('store', shelfStand(), 'work', 3);
        // (a rain catcher, once there is bamboo for it on the shelf)
        if (!village.catcher && shelfLots().some((l) => l.materialId === 'bamboo' && !(l as any).reservedBy && l.amount.value >= CATCH_BAMBOO)) return task('catcher', shelfStand(), 'work', 20);
        // (coconuts for the oil it means to make, while there are few on the shelf)
        if (q < 0.45 && coconutsOnShelf() < 6) { const it = items.nearest('coconut', r.pos.x, r.pos.z, 200, r.id, clockMs); if (it) { items.claim(it, r.id); return task('fetch', [it.x, it.z], 'pick', 3, { data: it }); } }
        if (q < 0.3) return task('think', spot(home, 40, (x, z, h) => h > 11), 'think', rr(400, 1000));
        if (q < 0.5 && cairnSpots.length < 12) {   // a stone for the cairn it is building
          const it = items.nearest('stone', r.pos.x, r.pos.z, 160, r.id, clockMs);
          if (it) { items.claim(it, r.id); return task('fetch', [it.x, it.z], 'work', 3, { data: it }); }
        }
        // explore: somewhere it has not been, on the island's open ground and paths
        let best: [number, number] | null = null;
        for (let k = 0; k < 12; k++) { const s = spot([320, -270], 420, open, 20); if (s && !visited.has(cellOf(s[0], s[1]))) { best = s; break; } if (!best) best = s; }
        return task('explore', best, 'look', rr(30, 90));
      }
      case 'rakko': {
        if (r.holding === 'stone') return (nestWanted() ? nestTask(r) : null) ?? (ledgeWanted() ? ledgeTask(r) : null) ?? dropTask(r) ?? nestTask(r) ?? (r.holding = '', null);
        if ((nestWanted() || ledgeWanted() || wallWanted()) && q < 0.3) { const t = seaStoneTask(r, nestWanted() ? 'nest' : ledgeWanted() ? 'ledge' : 'wall'); if (t) return t; }   // (its own quiet place first, then Kamemaru's, then Dot's wall)
        if (r.holding === 'shell') return showTask(r) ?? task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3);
        if (q < 0.35) return task('float', spot(home, 60, (x, z, h) => h < -0.8 && h > -4), 'float', rr(300, 800), { wet: true });
        if (q < 0.5) return task('groom', spot(home, 50, (x, z, h) => h < -0.8 && h > -4), 'groom', rr(90, 200), { wet: true });   // (its fur is all that keeps it warm: it grooms for hours a day)
        if (q < 0.85) {
          const it = items.nearest('shell', r.pos.x, r.pos.z, 200, r.id, clockMs);
          if (it) { items.claim(it, r.id); return task('collect', [it.x, it.z], 'pick', 3, { data: it }); }
        }
        return task('wander', spot(home, r.sp.range, beach), 'idle', rr(30, 90));
      }
    }
    return null;
  }
  const cellOf = (x: number, z: number) => Math.floor(x / 20) + ',' + Math.floor(z / 20);
  function showTask(r: Resident): Task | null {
    const o = showTo(r); if (!o) return null;
    showCool = 120; shownTo[o.id] = clockMs + rr(3, 8) * 60e3;
    return task('show', [o.pos.x, o.pos.z], 'look', 5.5, { data: o.id });
  }

  /* ---------- a mind of its own (ADR 0004) ---------- */
  // What it sees with its own eyes: ahead of it (a wide robot's or animal's view, not behind), as far as the
  // light lets it (much less by night), and not through the ground or anything solid and tall standing between.
  // Each thing by its id in the world.
  const FOV = Math.cos(75 * Math.PI / 180);
  function observe(r: Resident): Observation[] {
    const night = 1 - dayK(localHour(clockMs)), range = 40 - 28 * night, out: Observation[] = [];
    const ex = r.pos.x, ez = r.pos.z, ey = r.pos.y + bodyOf(r).y1 * 0.85, fx = Math.sin(r.head), fz = Math.cos(r.head);
    const seen = (x: number, z: number, y: number) => {
      const dx = x - ex, dz = z - ez, d = Math.hypot(dx, dz);
      if (d > range || (d > 1.5 && (dx * fx + dz * fz) / d < FOV)) return -1;
      // (the line from its eyes: over the ground, past the trunks and rocks taller than it)
      for (let t = 0.15; t < 0.95; t += 0.85 / Math.max(2, Math.ceil(d / 1.5))) {
        const px = ex + dx * t, pz = ez + dz * t, py = ey + (y - ey) * t;
        if (L.h(px, pz) > py) return -1;
      }
      let hidden = false;
      solids.each((ex + x) / 2, (ez + z) / 2, d / 2 + 1, (s) => {
        if (hidden || s.y1 < Math.min(ey, y) || Math.hypot(s.x - x, s.z - z) < s.r + 0.3) return;
        const ux = dx / (d || 1), uz = dz / (d || 1), t = (s.x - ex) * ux + (s.z - ez) * uz;
        if (t > 0.3 && t < d - 0.3 && Math.abs((s.x - ex) * uz - (s.z - ez) * ux) < s.r * 0.9) hidden = true;
      });
      return hidden ? -1 : d;
    };
    const add = (id: string, kind: string, label: string, x: number, z: number, y = L.h(x, z) + 0.2) => { const d = seen(x, z, y); if (d >= 0) out.push({ id, kind, label, x, z, dist: d, at: clockMs }); };
    for (const it of items.list) add(`${it.kind}#${it.id}`, it.kind, ({ wood: '流木', shell: '貝殻', stone: '石' } as Record<string, string>)[it.kind] + (it.by && it.by !== r.id ? `（${byId[it.by]?.v.name ?? '誰か'}が取りに行っている）` : ''), it.x, it.z);
    if (drift.kind >= 0 && !list.some((o) => o.holding === 'drift')) add('drift', 'unknown', '浜に打ち上げられた見慣れないもの', drift.x, drift.z);
    for (const o of list) if (o !== r) add(o.id, 'friend', o.v.name, o.pos.x, o.pos.z, o.pos.y + 0.5);
    add('hut', 'place', `小屋（${r.stats.built}/${HUT.length}）`, hut.position.x, hut.position.z, hut.position.y + 1);
    if (village.house.n > 0) add('house', 'place', `家（${village.house.n}/${HOUSE_N}）`, houseG.position.x, houseG.position.z, houseG.position.y + 1.2);
    { const w = bench.getWorldPosition(new THREE.Vector3()); add('bench', 'place', '作業台', w.x, w.z, w.y + 0.5); }
    add('shelf', 'place', '棚', shelf.position.x, shelf.position.z, shelf.position.y + 0.5);
    add('fire', 'place', '焚き火台', PIT.x, PIT.z, PIT.y + 0.3);
    TREES.forEach((t, i) => { if (t.ok && !t.down) add(`tree#${i}`, 'young-tree', '若木', t.x, t.z, L.h(t.x, t.z) + 1.5); });
    PLOTS.forEach((pl, i) => { if (pl.ok) add(`plot#${i}`, 'plot', ['草地', '耕した畑', growth(pl) >= 1 ? '実った畑' : '種をまいた畑'][pl.s], pl.x, pl.z); });
    return out.sort((a, b) => a.dist - b.dist);
  }
  // What it can do now, as the world offers it: only with things it knows of (has seen), never coordinates.
  // (what it sees, worked out at most once per moment of the island's clock: asked for by several things in a step)
  const seenAt = new Map<string, { t: number; obs: Observation[] }>();
  const seenCache = (r: Resident) => { const c = seenAt.get(r.id); if (c && c.t === clockMs) return c.obs; const obs = observe(r); seenAt.set(r.id, { t: clockMs, obs }); return obs; };
  // What it can say to someone near (ADR 0006, the island's language, step 3): a warning of the weather, what it is
  // about to do. Its mind (or its habits) picks one like any other doing; the words are made from the meaning.
  const WARN_JA: Record<string, string> = { typhoon: '台風が来ている', rain: '雨が降っている', wind: '風がとても強い' };
  const PLAN_JA: Record<string, string> = { hut: '小屋を作る', map: '地図を作る', wood: '流木を集める', shells: '貝殻を集める', eat: '海で食べる', nap: '海で眠る', sleep: '眠る' };
  const warnNow = () => { const w = wxNow; return !w ? '' : w.typhoon ? 'typhoon' : w.rain > 1 ? 'rain' : (w.windMeasured ?? w.wind) >= 10 ? 'wind' : ''; };
  const doingNext = (r: Resident) => r.id === 'dot' ? (r.stats.built < HUT.length ? 'hut' : 'map') : r.id === 'rakko' ? (r.hunger > 0.4 ? 'eat' : r.sleepy > 0.55 ? 'nap' : 'shells') : '';
  function sayables(r: Resident): Option[] {
    const out: Option[] = []; if (r.talk) return out;
    const fresh = (k: string, min: number) => clockMs - (r.saidAt?.[k] ?? -1e15) > min * 60e3;
    const warn = warnNow(), doing = doingNext(r);
    for (const x of list) {
      if (x === r || x.talk || x.act === 'sleep' || (x.task?.kind === 'sleep' && x.task.arrived) || Math.hypot(x.pos.x - r.pos.x, x.pos.z - r.pos.z) > 25) continue;
      if (warn && fresh(`warn:${warn}:${x.id}`, 30)) out.push({ id: `say:warn:${warn}:${x.id}`, action: 'say', label: `${x.v.name}に「${WARN_JA[warn]}」と知らせる`, targetId: x.id });
      if (doing && fresh(`plan:${doing}:${x.id}`, 45)) out.push({ id: `say:plan:${doing}:${x.id}`, action: 'say', label: `${x.v.name}に、これから${PLAN_JA[doing]}と伝える`, targetId: x.id });
      // (help offered: Rakko, the one who brings driftwood, to Dot at work on the hut with none in hand and none asked for)
      if (r.id === 'rakko' && x.id === 'dot' && (!r.holding || r.holding === 'wood') && x.stats.built < HUT.length && !x.holding && fresh('offer:wood:dot', 40)
        && !requests.some((q) => q.from === 'dot' && q.to === 'rakko' && (q.status === 'open' || q.status === 'accepted')))
        out.push({ id: 'say:offer:wood:dot', action: 'say', label: 'ドットに「流木を運ぼうか」と申し出る', targetId: 'dot' });
      // (something new on the beach it has seen, to one who has not seen it)
      if (drift.kind >= 0 && !drift.by && agentOf(r)?.seen.has('drift') && !agentOf(x)?.seen.has('drift') && fresh(`found:drift:${x.id}`, 120))
        out.push({ id: `say:found:drift:${x.id}`, action: 'say', label: `${x.v.name}に、浜に見慣れないものがあると知らせる`, targetId: x.id });
    }
    return out;
  }
  function optionsFor(r: Resident, a: Agent): Option[] {
    const o: Option[] = [], known = (id: string) => a.seen.has(id);
    const awake = (x: Resident) => x.act !== 'sleep' && !(x.task?.kind === 'sleep' && x.task.arrived);
    // (to the others: what it can ask of them, tell them, hand them, and its answers to what they asked of it)
    // (a photograph of something in view it would like to keep: a few a day, and only while there is light)
    const shotsToday = photosOn(r, dayOf(clockMs)).length;
    const shotIds = new Set(photosOn(r, dayOf(clockMs)).map((p) => p.subject.id));   // (not the same thing twice in a day)
    if (dayK(localHour(clockMs)) > 0.25 && shotsToday < PHOTOS_PER_DAY) for (const ob of seenCache(r).filter((x) => x.dist > 1.2 && x.dist < 30 && !shotIds.has(x.id)).slice(0, 8))
      o.push({ id: `photo:${ob.id}`, action: 'photo', label: `${ob.label}を写真に撮る（今日あと${PHOTOS_PER_DAY - shotsToday}枚）`, targetId: ob.id });
    o.push(...sayables(r));
    for (const q of requests) if (q.to === r.id && q.status === 'open') o.push({ id: `accept:${q.id}`, action: 'accept', label: `${byId[q.from].v.name}の頼み（流木を届ける）を引き受ける` }, { id: `refuse:${q.id}`, action: 'refuse', label: `${byId[q.from].v.name}の頼みを断る` });
    if (r.id === 'rakko') {
      const dot = byId.dot;
      for (const it of items.list) if (known(`${it.kind}#${it.id}`) && (!it.by || it.by === r.id) && !r.holding && (it.kind === 'shell' || it.kind === 'wood') && !((it.away?.[r.id] ?? 0) > clockMs))
        o.push({ id: `${it.kind === 'shell' ? 'collect' : 'gather'}:${it.kind}#${it.id}`, action: it.kind === 'shell' ? 'collect' : 'gather', label: `${it.kind === 'shell' ? '貝殻' : '流木'}を拾う（${Math.round(Math.hypot(it.x - r.pos.x, it.z - r.pos.z))}m）`, targetId: `${it.kind}#${it.id}` });
      o.push({ id: 'give:dot', action: 'give', label: 'ドットに流木を手渡す', targetId: 'dot', ...(r.holding === 'wood' && !dot.holding && awake(dot) ? {} : { ready: false, needs: '流木を持っていて、ドットが起きていて手があいていること' }) });
      if (!r.holding && awake(dot)) for (const it of items.list) if (it.kind === 'wood' && known(`wood#${it.id}`) && !it.by) o.push({ id: `tell:dot:wood#${it.id}`, action: 'tell', label: `ドットに流木の場所を教える`, targetId: `wood#${it.id}` });
      o.push({ id: 'pile:beach', action: 'pile', label: '貝殻を浜の山に並べる', ...(r.holding === 'shell' ? {} : { ready: false, needs: '貝殻を持っていること' }) });
      // (no 'show it to someone': a shell is not shown off — ADR 0004, addendum 2026-10-04)
      if (village.pier === 'build' && village.posts < village.bases) o.push({ id: 'post:pier', action: 'post', label: '桟橋の柱を立てる', ...(r.holding === 'wood' ? {} : { ready: false, needs: '流木を持っていること' }) });
      if (nestWanted() || ledgeWanted() || wallWanted()) o.push({ id: 'seastone:sea', action: 'seastone', label: nestWanted() ? `休み場の囲いにするサンゴ石を海の底から拾う（${village.nest.n}/${NEST_N}。荒れた日に波の静かな所ができる）` : ledgeWanted() ? `カメマルの岩棚のまわりに置くサンゴ石を海の底から拾う（${village.ledge.n}/${LEDGE_N}。うねりが岩棚に入りにくくなる）` : `ドットの家の石垣にするサンゴ石を海の底から拾う（石垣${village.wall.n}/${WALL_N}、浜に${village.wall.pile}個）`, ...(r.holding ? { ready: false, needs: '手があいていること' } : {}) });
      if (ledgeWanted()) o.push({ id: 'ledge:sea', action: 'ledge', label: `石をカメマルの岩棚のまわりに置く（${village.ledge.n + 1}/${LEDGE_N}）`, ...(r.holding === 'stone' ? {} : { ready: false, needs: '石を持っていること' }) });
      if (nestWanted()) o.push({ id: 'nest:sea', action: 'nest', label: `石を休み場の囲いに積む（${village.nest.n + 1}/${NEST_N}）`, ...(r.holding === 'stone' ? {} : { ready: false, needs: '石を持っていること' }) });
      if (wallWanted()) o.push({ id: 'stonedrop:beach', action: 'stonedrop', label: `石をドットの家の近くの浜の石置き場に運ぶ（いま${village.wall.pile}個）`, ...(r.holding === 'stone' ? {} : { ready: false, needs: '石を持っていること' }) });
      if (!r.holding) o.push({ id: 'float:sea', action: 'float', label: '沖で仰向けに浮かぶ' }, { id: 'groom:sea', action: 'groom', label: '水面で毛づくろいする' });
      // (its body: to eat at one of the places it knows, or a rest on the water — when, is its own to judge)
      if (!r.holding) for (const id of (r.body?.known.length ? r.body.known : (bestPatch(r), r.body?.known ?? []))) { const p = patchById(id); if (p) o.push({ id: `eat:${p.id}`, action: 'eat', label: `${patchName(p.id)}に潜って食べる（${Math.round(Math.hypot(p.x - r.pos.x, p.z - r.pos.z))}m）`, targetId: p.id, ...(full(r) > 85 ? { ready: false, needs: 'おなかがすいていること（いまはいっぱいで食べる気にならない）' } : {}) }); }
      if (dayK(localHour(clockMs)) > 0.3) o.push({ id: 'nap:sea', action: 'nap', label: '浮かんでひと眠りする' });
      o.push({ id: 'wander:beach', action: 'wander', label: '浜を歩いて探す' });
      return o;
    }
    if (r.id === 'dot' && !r.holding && r.stats.built < HUT.length && agentOf(byId.rakko) && awake(byId.rakko) && !requests.some((q) => q.from === r.id && (q.status === 'open' || q.status === 'accepted' || (q.status === 'refused' && clockMs - q.at < 10 * 60e3))))   // (not again straight after a no)
      o.push({ id: 'ask:rakko:bring-wood', action: 'ask', label: 'ラッコに流木を届けてほしいと頼む', targetId: 'rakko' });
    if (!r.holding) for (const it of items.list) if (it.kind === 'wood' && (!it.by || it.by === r.id) && known(`wood#${it.id}`) && !((it.away?.[r.id] ?? 0) > clockMs)) o.push({ id: `gather:wood#${it.id}`, action: 'gather', label: `流木を拾う（${Math.round(Math.hypot(it.x - r.pos.x, it.z - r.pos.z))}m）`, targetId: `wood#${it.id}` });
    // (steps that become possible later are offered too, for planning, marked with what they need)
    o.push({ id: 'craft:bench', action: 'craft', label: '作業台で流木を部材に削る', targetId: 'bench', ...(r.holding === 'wood' ? {} : { ready: false, needs: '流木を持っていること' }) });
    // (Dot's purpose, ADR 0006: the world widened — from the beach, the islands on the horizon put on its map)
    // (a raft for the crossing: pieces lashed on the beach; once whole, to an island it has seen — the world judges the day)
    if (r.id === 'dot' && village.raft.parts < RAFT_N && Object.keys(village.map.seen).length) o.push({ id: 'lash:raft', action: 'lash', label: `部材を筏に組む（${village.raft.parts + 1}/${RAFT_N}）`, targetId: 'raft', ...(r.holding === 'piece' ? {} : { ready: false, needs: '削った部材を持っている' }) });
    if (r.id === 'dot' && village.raft.parts >= RAFT_N && !r.holding) for (const i of ISLES) {
      const s = village.map.seen[i.id]; if (!s || village.map.reached[i.id]) continue;
      // (the hour is its own to know: after the morning gathering, and back while it is light — not found out at the raft, six days running)
      const f = fromHome(i); o.push({ id: `voyage:${i.id}`, action: 'voyage', label: `筏で${s.word}へ渡る（${dirJa(f.bearing)}に約${f.km.toFixed(1)}km）`, targetId: i.id, ...voyageHour(f.km, r) });
    }
    if (r.id === 'dot' && ISLES.some((i) => !village.map.seen[i.id])) o.push({ id: 'survey:horizon', action: 'survey', label: '浜から水平線を見渡し、見える島を地図に記す', targetId: 'horizon' });
    // (trades, ADR 0006: driftwood sunk in Rakko's water for shellfish to settle on — a log not put on the hut; a
    // seagrass bed torn up by a typhoon planted again for Kamemaru)
    if (r.id === 'dot' && patches.filter((p) => p.by).length < 3) o.push({ id: 'reef:sea', action: 'reef', label: '流木を沈めて漁礁をつくる（ラッコの海）', targetId: 'sea', ...(r.holding === 'wood' ? {} : { ready: false, needs: '流木を持っている' }) });
    if (r.id === 'dot' && !r.holding) for (const b of beds) if (b.grass < 0.5 && !(b.replanted && clockMs < b.replanted)) { o.push({ id: `replant:${b.id}`, action: 'replant', label: `荒れた藻場を植え直す（カメマルの藻場、海草 ${Math.round(b.grass * 100)}%）`, targetId: b.id }); break; }
    if (r.stats.built < HUT.length) o.push({ id: 'place:hut', action: 'place', label: `部材を小屋に取りつける（${r.stats.built + 1}/${HUT.length}）`, targetId: 'hut', ...(r.holding === 'piece' ? {} : { ready: false, needs: '削った部材を持っていること' }) });
    if (r.id === 'dot' && r.holding === 'piece' && !pieceWanted(r)) o.push({ id: 'stow:bench', action: 'stow', label: `削った部材を作業台の脇に置いておく（あとで使う。いま${village.spare}本）`, targetId: 'bench' });
    if (r.id === 'dot' && !r.holding && village.spare > 0 && pieceWanted(r)) o.push({ id: 'take:bench', action: 'take', label: `作業台の脇に置いた部材を手に取る（${village.spare}本）`, targetId: 'bench' });
    if (!r.holding && drift.kind >= 0 && !drift.by && known('drift')) o.push({ id: 'find:drift', action: 'find', label: '浜の見慣れないものを拾って調べる', targetId: 'drift' });
    o.push({ id: 'shelve:shelf', action: 'shelve', label: '見つけたものを棚に飾る', targetId: 'shelf', ...(r.holding === 'drift' ? {} : { ready: false, needs: '見つけたものを持っていること' }) });
    if (!r.holding && r.stats.built >= HUT.length) {
      TREES.forEach((t, i) => { if (t.ok && !t.down && known(`tree#${i}`) && i < 3) o.push({ id: `chop:tree#${i}`, action: 'chop', label: '若木を切る', targetId: `tree#${i}` }); });
      PLOTS.forEach((pl, i) => {
        if (!pl.ok || !known(`plot#${i}`)) return;
        if (pl.s === 0) o.push({ id: `till:plot#${i}`, action: 'till', label: '草地を耕す', targetId: `plot#${i}` });
        if (pl.s === 1) o.push({ id: `plant:plot#${i}`, action: 'plant', label: '種をまく', targetId: `plot#${i}` });
        if (pl.s === 2 && growth(pl) >= 1) o.push({ id: `harvest:plot#${i}`, action: 'harvest', label: '実を収穫する', targetId: `plot#${i}` });
      });
    }
    if (r.id === 'dot' && r.stats.built >= HUT.length && houseNext()) {
      const s = houseNext()!, h = village.house, miss = houseMissing(r), repair = h.lost > 0 && h.n >= ROOF_N;
      o.push({ id: 'house:next', action: 'house', label: repair ? `台風で飛んだ茅を葺き直す（あと${h.lost}段）` : `家を建てる：${HOUSE_JA[s.kind]}（${h.n + 1}/${HOUSE_N}）`, targetId: 'house', ...(miss ? { ready: false, needs: miss } : {}) });
      if (h.rope < 16) o.push({ id: 'twist:bench', action: 'twist', label: `縄をなう（アダンの気根の繊維から10m。いま${h.rope}m）`, targetId: 'bench' });
      if (!r.holding && s.need === 'grass') o.push({ id: 'cut:grass', action: 'cut', label: '茅にする草を刈って束ねる', targetId: 'grass' });
      const src = ISLES.find((i) => i.carry?.some((c) => c.materialId === 'bamboo'));
      if (src && village.map.reached[src.id] && village.raft.parts >= RAFT_N && !r.holding && (left('bamboo') > h.bamboo || left('clay') > h.clay))
        o.push({ id: `voyage:${src.id}`, action: 'voyage', label: `筏で${village.map.seen[src.id]?.word ?? src.id}へ家の竹と粘土を取りに行く（いま竹${h.bamboo}本・粘土${h.clay}kg、まだ要るのは竹${Math.max(0, left('bamboo') - h.bamboo)}本・粘土${Math.max(0, left('clay') - h.clay)}kg）`, targetId: src.id, ...voyageHour(fromHome(src).km, r) });
    }
    if (r.id === 'dot' && hLevel() === 'house' && !houseNext() && !wallDone()) {
      o.push({ id: 'wall:next', action: 'wall', label: `家の風上（南東）に石垣を積む（${village.wall.n + 1}/${WALL_N}。できると台風でも茅が飛ばない）`, targetId: 'house', ...(r.holding === 'stone' ? {} : { ready: false, needs: village.wall.pile ? '浜の石置き場から石を持ってくること' : '石（ラッコが海の底から浜の石置き場に運んでくる）' }) });
      if (!r.holding && village.wall.pile > 0) o.push({ id: 'wallfetch:beach', action: 'wallfetch', label: `浜の石置き場から石を取ってくる（いま${village.wall.pile}個）`, targetId: 'stones' });
    }
    if (r.id === 'dot' && r.stats.built >= HUT.length && !r.holding) for (const t of fellable(r)) {
      const ww = windward(t.x, t.z);
      o.push({ id: `fell:${t.x.toFixed(2)},${t.z.toFixed(2)}`, action: 'fell', label: `林の木を切り倒す（${KIND_JA[t.kind] ?? '木'}、高さ約${Math.round(t.h)}m、${Math.round(t.d)}m先。丸太${t.h > 7 ? 3 : 2}本と薪、切った所は開けた土地になる${ww ? '。家の風上（南東）の木：防風林が薄くなる' : ''}）`, targetId: `forest:${t.x.toFixed(1)},${t.z.toFixed(1)}` });
    }
    if (r.battery < 0.6) o.push({ id: 'charge:sun', action: 'charge', label: '日なたで充電する' });
    o.push({ id: 'look:shore', action: 'look', label: '浜から海を眺める（流木が打ち上がるのを待つ）' }, { id: 'wander:near', action: 'wander', label: '近くを歩いてまわりを見る' });
    return o;
  }
  // The step it chose, as a task the body carries out (null: the world will not have it now)
  function taskFor(r: Resident, id: string): Task | null {
    const [action, target] = id.split(':'), home = r.sp.home;
    let t: Task | null = null;
    if (action === 'gather') { const n = +target.split('#')[1], it = items.list.find((x) => x.id === n && x.kind === 'wood'); if (!it || (it.by && it.by !== r.id)) return null; items.claim(it, r.id); t = task('gather', [it.x, it.z], 'pick', 3.5, { data: it }); }
    else if (action === 'craft') t = r.holding === 'wood' ? task('craft', benchStand(), 'work', rr(45, 75)) : null;
    else if (action === 'lash') { const at = raftAt(); t = r.holding === 'piece' && at ? task('lash', at, 'work', rr(30, 50)) : null; }
    else if (action === 'voyage') { const at = raftAt(); t = at && village.raft.parts >= RAFT_N ? task('voyage', at, 'idle', 1, { data: { isle: target } }) : null; }
    else if (action === 'survey' && r.id === 'dot') { const at = spot(r.sp.home, 160, shore, 120); t = at ? task('chart', at, 'look', 40) : null; }
    else if (action === 'reef') { const rh = byId.rakko?.sp.home ?? r.sp.home, at = spot(rh, 40, shore, 80); t = r.holding === 'wood' && at ? task('reef', at, 'work', 8) : null; }
    else if (action === 'replant') { const b = beds.find((x) => x.id === target), at = b && (spot([b.x, b.z], 40, shore, 80) ?? spot([b.x, b.z], 90, shore, 120) ?? spot([b.x, b.z], 90, beach, 120));   /* (from the nearest bit of beach it can stand on: it plants the shallow edge) */ t = b && at ? task('replant', at, 'work', 20, { data: b.id }) : null; }
    else if (action === 'stow') t = r.holding === 'piece' ? task('stow', benchStand(), 'pick', 3) : null;
    else if (action === 'take') t = !r.holding && village.spare > 0 ? task('take', benchStand(), 'pick', 3) : null;
    else if (action === 'place') t = r.holding === 'piece' && r.stats.built < HUT.length ? task('place', slotStand(r.stats.built), 'hammer', 7) : null;
    else if (action === 'house') t = houseTask(r);
    else if (action === 'wall') t = wallTask(r);
    else if (action === 'wallfetch') t = wallFetchTask(r);
    else if (action === 'seastone') t = r.holding ? null : (nestWanted() ? seaStoneTask(r, 'nest') : ledgeWanted() ? seaStoneTask(r, 'ledge') : wallWanted() ? seaStoneTask(r, 'wall') : null);
    else if (action === 'nest') t = nestTask(r);
    else if (action === 'ledge') t = ledgeTask(r);
    else if (action === 'stonedrop') t = dropTask(r);
    else if (action === 'fell') { const [x, z] = target.split(',').map(Number); t = fellTask(x, z); }
    else if (action === 'twist') t = task('twist', benchStand(), 'work', rr(60, 90));
    else if (action === 'cut') t = r.holding ? null : cutTask();
    else if (action === 'find') { if (drift.kind < 0 || drift.by) return null; drift.by = r.id; t = task('find', [drift.x, drift.z], 'pick', 6); }
    else if (action === 'shelve') t = r.holding === 'drift' ? task('shelve', [shelf.position.x + 0.6, shelf.position.z + 0.6], 'work', 4) : null;
    else if (action === 'chop') { const tr = TREES[+target.split('#')[1]]; t = tr && tr.ok && !tr.down ? task('chop', [tr.x + 0.9, tr.z + 0.3], 'chop', rr(40, 70), { data: tr }) : null; }
    else if (action === 'till' || action === 'plant' || action === 'harvest') {
      const pl = PLOTS[+target.split('#')[1]], want = action === 'till' ? 0 : action === 'plant' ? 1 : 2;
      t = pl && pl.ok && pl.s === want && (action !== 'harvest' || growth(pl) >= 1) ? task(action, [pl.x + 0.8, pl.z], action === 'till' ? 'dig' : 'pick', action === 'till' ? rr(60, 110) : action === 'plant' ? rr(20, 35) : 8, { data: pl }) : null;
    }
    else if (action === 'eat') { const p = patchById(target); t = p && r.sp.living && full(r) <= 85 ? startBout(r, forage(nearPatch(p), p, r), id) : null; }   // (full: it will not eat)
    else if (action === 'nap') t = task('nap', (nestDone() ? village.nest.at : null) ?? spot([r.pos.x, r.pos.z], 50, water(0.8, 4)) ?? spot(r.sp.home, 60, water(0.8, 4)), 'sleep', rr(600, 1500), { wet: true });   // (in its quiet place, once it has one)
    else if (action === 'photo') {
      const ob = observe(r).find((x) => x.id === id.slice(6));
      if (!ob || photosOn(r, dayOf(clockMs)).length >= PHOTOS_PER_DAY) return null;
      // (a small thing far off would be a speck in the picture: it goes up to it first, to about as near as its size asks)
      const near = SHOT_NEAR[ob.kind] ?? 6, d = Math.hypot(ob.x - r.pos.x, ob.z - r.pos.z);
      t = d <= near ? task('photo', [r.pos.x, r.pos.z], 'look', 3, { arrived: true, data: { ob } })
        : task('photo', [ob.x + (r.pos.x - ob.x) / d * near * 0.75, ob.z + (r.pos.z - ob.z) / d * near * 0.75], 'look', 3, { data: { ob } });
    }
    else if (action === 'say') { const [, kind, what, to] = id.split(':'), o = byId[to]; t = o ? task('say', [o.pos.x, o.pos.z], 'look', 2.5, { data: { to, kind, what } }) : null; }
    else if (action === 'ask') { const o = byId[target]; t = o ? task('ask', [o.pos.x, o.pos.z], 'look', 3, { data: { to: target, what: id.split(':')[2] } }) : null; }
    else if (action === 'give') { const o = byId[target]; t = o && r.holding === 'wood' ? task('give', [o.pos.x, o.pos.z], 'pick', 2.5, { data: { to: target } }) : null; }
    else if (action === 'tell') { const o = byId[target], item = id.split(':')[2]; t = o && agentOf(r)?.seen.has(item) ? task('tell', [o.pos.x, o.pos.z], 'look', 3, { data: { to: target, item } }) : null; }
    else if (action === 'accept' || action === 'refuse') {
      const q = requests.find((x) => x.id === target && x.to === r.id && x.status === 'open'); if (!q) return null;
      t = task('answer', [r.pos.x, r.pos.z], 'look', 1.5, { arrived: true, data: { q, yes: action === 'accept', reason: action === 'refuse' ? refuseWhy(r) : undefined } });
    }
    else if (action === 'collect') { const n = +target.split('#')[1], it = items.list.find((x) => x.id === n && x.kind === 'shell'); if (!it || (it.by && it.by !== r.id)) return null; items.claim(it, r.id); t = task('collect', [it.x, it.z], 'pick', 3, { data: it }); }
    else if (action === 'pile') t = r.holding === 'shell' ? task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3) : null;
    else if (action === 'show') { const f = byId[target]; t = f && r.holding === 'shell' ? task('show', [f.pos.x, f.pos.z], 'look', 5.5, { data: f.id }) : null; if (t) { showCool = 120; shownTo[f.id] = clockMs + rr(3, 8) * 60e3; } }
    else if (action === 'post') t = r.holding === 'wood' && village.pier === 'build' && village.posts < village.bases ? task('post', pileStand(village.posts, true), 'work', 8, { wet: true }) : null;
    else if (action === 'float') t = task('float', spot(home, 60, (x, z, h) => h < -0.8 && h > -4), 'float', rr(300, 800), { wet: true });
    else if (action === 'groom') t = task('groom', spot(home, 50, (x, z, h) => h < -0.8 && h > -4), 'groom', rr(90, 200), { wet: true });
    else if (action === 'charge') t = task('charge', spot(home, 30, open), 'idle', rr(600, 1400));
    else if (action === 'look') t = task('look', spot(home, 80, shore, 200) ?? spot(home, 40, open), 'idle', rr(60, 180));
    else if (action === 'wander') t = task('wander', spot(home, r.sp.range, target === 'beach' ? beach : open), 'idle', rr(20, 60));
    if (t) t.opt = id;
    return t;
  }
  // Its habits, when it has no mind to ask (or is waiting on one): the same choices it made before it had one.
  // (why it would rather not: what its own body and wants say just now)
  const refuseWhy = (r: Resident) => r.hunger > (r.body?.learn.eatAt ?? 0.45) ? 'おなかがすいている' : r.sleepy > (r.body?.learn.sleepAt ?? 0.6) ? '眠い' : r.holding && r.holding !== 'wood' ? '手がふさがっている' : !items.list.some((it) => it.kind === 'wood' && agentOf(r)?.seen.has(`wood#${it.id}`)) ? '流木のある場所を知らない' : '今は貝殻を集めたい';
  // (its habit with the camera: something worth keeping, now and then — the nearest friend, something new, its work;
  // only now and then: a day without any photograph is fine — that day it draws instead)
  const photoHabit = (r: Resident, opts: Option[]) => {
    const shots = opts.filter((o) => o.action === 'photo'); if (!shots.length) return null;
    // (now and then, when something is worth keeping — not because the day asks for one: a day without is fine)
    if (Math.random() > 0.06) return null;
    // (not the same thing twice in a day, and a kind it already has today only if there is nothing else)
    const today = photosOn(r, dayOf(clockMs)), had = new Set(today.map((p) => p.subject.id)), kinds = new Set(today.map((p) => p.subject.kind));
    const fresh = shots.filter((o) => !had.has(o.targetId!)); if (!fresh.length) return null;
    const seenNow = new Map(observe(r).map((x) => [x.id, x.kind]));
    const rank = (o: Option) => { const k = o.targetId!.split('#')[0]; return (kinds.has(seenNow.get(o.targetId!) ?? '') ? 10 : 0) + (o.targetId === 'drift' ? 0 : list.some((x) => x.id === o.targetId) ? 1 : k === 'young-tree' || k === 'shell' ? 2 : 3) + Math.random() * 1.5; };
    const pick = fresh.map((o) => [o, rank(o)] as const).sort((x, y) => x[1] - y[1])[0][0];
    return { text: '写真に残す', why: '記録として残す', plan: [pick.id] };
  };
  const HABIT: Record<string, Habit> = {
    rakko: (opts, a) => {
      { const ph = photoHabit(byId.rakko, opts); if (ph && !opts.some((o) => o.action === 'accept')) return ph; }
      const r = byId.rakko, has = (p: string) => opts.find((o) => o.id.startsWith(p) && o.ready !== false)?.id;
      const near = (kind: string) => opts.filter((o) => o.action === kind).sort((x, y) => { const p = (o: Option) => a.seen.get(o.targetId!); const dx = p(x), dy = p(y); return (dx ? Math.hypot(dx.x - r.pos.x, dx.z - r.pos.z) : 1e9) - (dy ? Math.hypot(dy.x - r.pos.x, dy.z - r.pos.z) : 1e9); })[0]?.id;
      // (by habit it says only what the weather is to one near, not again for a while; telling what it is about to do is
      // left to its mind to choose, as any other doing)
      { const sp = has('say:warn:'); if (sp) return { text: '天気を知らせる', why: '近くに相手がいる', plan: [sp] }; }
      // (its own marks, moved by what has happened to it: eat before it gets too hungry, rest before too sleepy)
      if (r.hunger > eatAt(r, 0.5) && !r.holding) { const e = has('eat:'); if (e) return { text: '食べに行く', why: 'おなかがすいてきた', plan: [e] }; }
      if (r.sleepy > (r.body?.learn.sleepAt ?? 0.65) && has('nap:')) return { text: 'ひと眠りする', why: 'ねむくなってきた', plan: ['nap:sea'] };
      const acc = has('accept:');
      if (acc) {
        // (its own choice: hungry, sleepy, busy, or not knowing where any is — it says no; otherwise mostly yes)
        const ok = r.hunger < (r.body?.learn.eatAt ?? 0.45) && r.sleepy < (r.body?.learn.sleepAt ?? 0.6) && (r.holding === 'wood' || (!r.holding && !!near('gather'))) && Math.random() < 0.8 + 0.15 * Math.min(1, trust(r, byId.dot));   // (more surely for one whose doings have paid it)
        return ok ? { text: 'ドットに流木を届ける', why: '頼まれたので', plan: r.holding === 'wood' ? [acc, 'give:dot'] : [acc, near('gather')!, 'give:dot'] } : { text: '頼みを断る', why: refuseWhy(r), plan: [has('refuse:')!] };
      }
      if (requests.some((q) => q.to === r.id && q.status === 'accepted')) {
        if (has('give:')) return { text: 'ドットに流木を届ける', why: '引き受けたので', plan: ['give:dot'] };
        const g = near('gather'); if (g) return { text: 'ドットに流木を届ける', why: '引き受けたので', plan: [g, 'give:dot'] };
      }
      if (r.holding === 'shell') { return { text: '貝殻を並べる', why: '貝殻を持っている', plan: ['pile:beach'] }; }
      if (r.holding === 'wood') return { text: '流木を届ける', why: '持っている', plan: [has('post:') ?? 'give:dot'] };
      if (r.holding === 'stone') return { text: '石を運ぶ', why: '持っている', plan: [has('nest:') ?? has('ledge:') ?? has('stonedrop:') ?? 'wander:beach'] };
      { const ss = has('seastone:'); if (ss && Math.random() < 0.3) return nestWanted() ? { text: '休み場の囲いを積む', why: '荒れた海で疲れた。波の静かな所がほしい', plan: [ss, 'nest:sea'] } : ledgeWanted() ? { text: 'カメマルの岩棚に石を置く', why: '自分の休み場はできた。カメマルの寝場所にも、荒れた日にうねりが入る', plan: [ss, 'ledge:sea'] } : { text: 'ドットの石垣の石を運ぶ', why: '石は得意', plan: [ss, 'stonedrop:beach'] }; }
      const tell = opts.find((o) => o.action === 'tell');
      if (tell && Math.random() < 0.3) return { text: 'ドットに流木の場所を教える', why: 'ドットが小屋の材料を探していた', plan: [tell.id] };
      { const fd = has('say:found:'); if (fd) return { text: '見つけたものを知らせる', why: '浜に見慣れないものがある', plan: [fd] }; }
      { const of = has('say:offer:'); if (of && Math.random() < 0.25) return { text: 'ドットに手伝いを申し出る', why: 'ドットが小屋の材料を探していた', plan: [of] }; }
      const q = Math.random(), c = near('collect');
      if (c && q < 0.55) return { text: '貝殻を集める', why: '役割：貝殻を集めて並べる', plan: [c, 'pile:beach'] };
      return q < 0.75 ? { text: '浮かんで休む', why: '急ぐことがない', plan: [has('float:') ?? 'wander:beach'] } : q < 0.9 ? { text: '毛づくろいする', why: '毛皮の手入れ', plan: [has('groom:') ?? 'wander:beach'] } : { text: '浜を歩く', why: '何かないか探す', plan: ['wander:beach'] };
    },
    dot: (opts, a) => {
      const has = (p: string) => opts.find((o) => o.id.startsWith(p) && o.ready !== false)?.id;
      const r = byId.dot;
      { const ph = photoHabit(r, opts); if (ph && !r.holding) return ph; }
      { const sp = has('say:warn:'); if (sp) return { text: '天気を知らせる', why: '近くに相手がいる', plan: [sp] }; }
      if (has('place:')) return { text: '小屋に部材を取りつける', why: '削った部材がある', plan: ['place:hut'] };
      if (has('craft:')) return { text: '流木を部材にする', why: '流木を持っている', plan: ['craft:bench', 'place:hut'] };
      if (has('shelve:')) return { text: '見つけたものを棚に置く', why: '手に持っている', plan: ['shelve:shelf'] };
      if (has('find:')) return { text: '見慣れないものを調べる', why: '浜で見かけた', plan: ['find:drift', 'shelve:shelf'] };
      if (has('charge:') && r.battery < 0.3) return { text: '充電する', why: '電池が少ない', plan: ['charge:sun'] };
      if (r.stats.built < HUT.length) {
        // (the nearest log it knows of)
        const g = opts.filter((o) => o.action === 'gather').sort((x, y) => { const p = (o: Option) => a.seen.get(o.targetId!); const dx = p(x), dy = p(y); return (dx ? Math.hypot(dx.x - r.pos.x, dx.z - r.pos.z) : 1e9) - (dy ? Math.hypot(dy.x - r.pos.x, dy.z - r.pos.z) : 1e9); })[0];
        if (g) return { text: '小屋を建てる', why: '流木を見つけてある', plan: [g.id, 'craft:bench', 'place:hut'] };
        // (none it knows of: look for some — or now and then ask Rakko, who is often on the beach)
        if (has('ask:') && Math.random() < 0.35) return { text: 'ラッコに流木を頼む', why: '小屋の材料が見つからない', plan: [has('ask:')!] };
        return { text: '流木を探す', why: '小屋の材料が要る', plan: [Math.random() < 0.7 ? 'look:shore' : 'wander:near'] };
      }
      const farm = has('harvest:') ?? has('chop:') ?? has('till:') ?? has('plant:');
      if (farm) return { text: '畑の世話をする', why: '小屋が建ったので', plan: [farm] };
      return { text: 'ひと休みする', why: '今はすることがない', plan: [Math.random() < 0.7 ? 'look:shore' : 'wander:near'] };
    },
  };
  let brainOverride: Brain | null | undefined;
  const agents: Record<string, Agent> = {};
  for (const r of list) if (MINDS[r.id]?.on && HABIT[r.id]) agents[r.id] = new Agent(r.id, r.v.mind, HABIT[r.id], (i, t) => (brainOverride === undefined ? modelBrain : brainOverride ?? (async () => null))(i, t));
  // (what another told it, and then worked: talking is of use — learnt, a little more each time)
  for (const r of list) {
    const a = agents[r.id]; if (!a) continue;
    a.onUseful = (from, opt) => {
      r.stats.talkUse = Math.min(1, (r.stats.talkUse ?? 0) + 0.25); a.values.bonus(`heard:${from}`, `${byId[from]?.v.name ?? from}から聞いた情報`, 0.5);
      r.diary.push({ at: clockMs, text: `${byId[from]?.v.name ?? from}から聞いた情報で、${opt.split(':')[0] === 'gather' ? '拾えた' : 'できた'}（${opt}）`, key: 'mind' }); if (r.diary.length > 800) r.diary.shift();
      village.heardOkAt = clockMs;
    };
    // (told where something was, and it was not there: it says so to the one who told it, when they next meet)
    a.onWrong = (from, opt) => {
      const what = /wood#/.test(opt) ? 'wood' : /shell#/.test(opt) ? 'shell' : 'thing';
      village.feedback.push({ from: r.id, to: from, f: { act: 'heard-wrong', what }, at: clockMs }); if (village.feedback.length > 20) village.feedback.shift();
      r.diary.push({ at: clockMs, text: `${byId[from]?.v.name ?? from}から聞いた場所に、${what === 'wood' ? '流木' : what === 'shell' ? '貝殻' : 'それ'}はなかった`, key: 'mind' });
    };
  }
  /** Who it is for its own mind: its role and how it tends to decide, and what has worked for it (its hits). */
  function profileOf(r: Resident): string {
    const a = agentOf(r); if (!a) return r.v.mind;
    const hits = [...a.values.hits(5), ...a.knowledge.filter((k) => k.status === 'confirmed').slice(-3).map((k) => `確かめた：${k.text}`)];
    return hits.length ? `${r.v.mind}\n当たり（うまくいったこと）：${hits.join('／')}` : r.v.mind;
  }
  const agentOf = (r: Resident) => agents[r.id] as Agent | undefined;
  // what they have asked of each other (kept by the world: ADR 0004 §6)
  const requests: Request[] = [];
  let reqN = 0;
  // what they say to each other as they ask, answer, hand over and tell (ADR 0006, the island's language, step 3):
  // a meaning, made into Lumau with its Japanese and English (lumau/frames.ts), said a moment apart
  const utterQ: { who: string; f: Frame; at: number; conv: number }[] = [];
  function utter(r: Resident, f: Frame, afterMs = 0, conv = 0) { utterQ.push({ who: r.id, f, at: clockMs + afterMs, conv }); }
  function exchange(a: Resident, b: Resident) { return heading(`${a.v.name}と${b.v.name}`); }
  function answer(r: Resident, q: Request, yes: boolean, reason?: string) {
    if (q.status !== 'open') return;
    q.status = yes ? 'accepted' : 'refused'; q.reason = reason;
    const from = byId[q.from];
    utter(r, yes ? { act: 'accept-bring', to: from.id as Who, what: 'wood' } : { act: 'refuse', why: NO_WHY[reason ?? ''] ?? 'busy-shells' }, 1800, q.conv ?? exchange(from, r));
    r.diary.push({ at: clockMs, text: yes ? `${from.v.name}の頼みを引き受けた` : `${from.v.name}の頼みを断った${reason ? `（${reason}）` : ''}`, key: 'mind' });
    res.onEvent('answer', `${r.v.name}が${from.v.name}の頼みを${yes ? '引き受けた' : '断った'}`, r);
    const fa = agentOf(from); if (fa) { fa.answered(q, clockMs, r.v.name); flushMind(from, fa); }
    if (yes) { const a = agentOf(r); if (a) a.why = `引き受けた：${from.v.name}に流木を届ける（${q.id}）`; }
    // (what it did for the other, paid back: taken on by one its reef has fed — a reward for having made it)
    if (yes && fa && trust(r, from) > 0.1 && patches.some((p) => p.by === from.id)) fa.values.bonus('reef:sea', '流木を沈めて漁礁をつくる', 0.5);
  }
  /** The island's date, season and weather, as its mind is told them (the replayed record's values, as measured). */
  function islandNow() {
    const d = islandDate(clockMs), w = wxNow;
    return { 日付: d.label, 季節: d.season, ...(w ? { 天気: w.typhoon ? '台風' : w.rain >= 1 ? '雨' : w.cloud > 0.7 ? '曇り' : '晴れ', 風: `${w.wind.toFixed(1)}m/s`, 気圧: `${Math.round(w.pressure)}hPa` } : {}) };
  }
  /** Dot's map, as its mind is told it: each island seen, by its own word, direction, distance and size; and those reached. */
  function mapNow() {
    const m = village.map;
    return { 見えた島: ISLES.filter((i) => m.seen[i.id]).map((i) => { const f = fromHome(i); return `${m.seen[i.id].word}：${dirJa(f.bearing)}に約${f.km.toFixed(1)}km、${i.areaKm2 > 50 ? '大きい' : '小さい'}${m.reached[i.id] ? '（たどり着いた）' : ''}`; }), 地図の広さ: +mapScore(m).toFixed(2) };
  }
  /** What is on the shelf by the hut, brought from other islands (by material: how much, from where). */
  function storeNow() {
    const by = new Map<string, number>(); for (const l of shelfLots()) by.set(l.materialId, (by.get(l.materialId) ?? 0) + l.amount.value);
    const ja = (id: string) => MATERIAL_JA[id] ?? id;
    const from = (id: string) => [...new Set(shelfLots().filter((l) => l.materialId === id).map((l) => village.map.seen[l.lotId.split(':')[1]]?.word ?? '工程'))].join('・');
    return [...by].map(([id, mg]) => `${ja(id)} ${+(mg / 1e6).toFixed(1)}kg（${from(id)}から、小屋の棚）`);
  }
  /* ---------- the clay pit: the island's first tub (science table civ-sci.clay-pit/1) ---------- */
  // Lantern digs a round hole in the sand under the hut's roof and treads raw clay into its floor and walls — the clay from
  // the shelf, as much as the table says — and the soaking step takes it as its tub. (The science side's pit is an
  // idealisation: a sound lining holds its water. Nothing here teaches the residents that an earth pit never leaks.)
  let pitG: THREE.Group | null = null;   // (made when first needed: three.js draws an id for each thing it makes)
  function drawPit() {
    if (!village.clayPit) { if (pitG) pitG.visible = false; return; }
    if (!pitG) {
      pitG = new THREE.Group();
      const r = village.clayPit.diameterCm / 200, w = atHut(0.2, 0.1); pitG.position.set(w.x, L.h(w.x, w.z), w.z); group.add(pitG);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 20), smat(0x8a6a4c, 0.0)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.03; pitG.add(rim);
      const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.03, 20), smat(0x6a5a48, 0.42)); water.rotation.x = -Math.PI / 2; water.position.y = 0.01; pitG.add(water);
    }
    pitG.visible = true;
  }
  const PIT_NEEDS = clayPitMaterials(CLAY_PIT_PLAN);
  const rawClayOnShelf = () => shelfLots().filter((l) => l.materialId === 'raw_clay' && !(l as any).reservedBy).reduce((n, l) => n + l.amount.value, 0);
  /** Lantern digs the pit when there is a roof to put it under, clay enough for its lining and still some to soak, and
   *  rain water to soak it in. */
  function pitTask(): Task | null {
    if (village.clayPit || !roofDone() || !village.catcher || rawClayOnShelf() < PIT_NEEDS.rawClayMg + 1e6) return null;
    const w = atHut(0.2, 1.3); return task('pit', [w.x, w.z], 'dig', Math.max(60, PIT_NEEDS.handSeconds - ((village as any).pitDug ?? 0)), {});   // (what is left of the digging)
  }
  function digPit(r: Resident) {
    let need = PIT_NEEDS.rawClayMg;
    for (const l of shelfLots().filter((x) => x.materialId === 'raw_clay' && !(x as any).reservedBy)) {
      const take = Math.min(need, l.amount.value); l.amount.value -= take; need -= take;
      if (l.amount.value <= 0) delete lab.lots[l.lotId];
      if (need <= 0) break;
    }
    if (need > 0) return false;
    lab.world.worldVersion++;
    const params = clayPitParams(CLAY_PIT_PLAN);
    lab.equipment[`eq:${CLAY_PIT}`] = { equipmentId: `eq:${CLAY_PIT}`, kind: CLAY_PIT, catalogEntry: CLAY_PIT, catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params };
    village.clayPit = { at: clockMs, diameterCm: CLAY_PIT_PLAN.diameterCm, depthCm: CLAY_PIT_PLAN.depthCm };
    drawPit(); drawStore();
    note(r, 'pit', {}, `小屋の屋根の下に粘土の池を掘った（直径${CLAY_PIT_PLAN.diameterCm}cm・深さ${CLAY_PIT_PLAN.depthCm}cm。生の粘土${Math.round(PIT_NEEDS.rawClayMg / 1e6)}kgで底と壁を踏み固めた。入るのは約${Math.round(params.capacityMl / 1000)}L）`);
    res.onEvent('pit', `${r.v.name}が粘土の池を掘った。粘土を浸せるようになった`, r);
    return true;
  }
  /* ---------- Lantern's workshop: the tools a process waits for, the woodpile, a fired pot made a cook pot ---------- */
  // (science final review 2026-10-09-pit-fire) The tools are made from the science side's recipes (TOOL_RECIPES: what
  // they take from the shelf, how long by hand; stones and leaves are picked up where they lie) once a process that is
  // ready waits for them. Firewood lots — the branches of each tree felled, each sapling — are piled together into one,
  // to be dried under a roof and burned as one: a pit fire takes some 20 kg of seasoned wood. Mass adds up; the water
  // and ash in it are the mass-weighted mean (the ash per dry mass by dry mass); a pile whose part was of unknown
  // history is of unknown history. A fired pot of a cook pot's form is made a cook pot (civ-sci.fired-pot-assembly/1).
  // (a tool is made when it would be used: a process that waits for it, with its own material on the shelf)
  const inputThere = (e: CatalogEntry) => !e.input || shelfLots().some((l) => l.materialId === e.input && !(l as any).reservedBy && l.amount.value >= (e.minInputMg ?? 0) && (!e.inputOk || e.inputOk(l)));
  const recipeWanted = () => TOOLS.find((t) => !lab.equipment[`eq:${t.kind}`] && catalog.some((e) => e.ready && e.built === t.kind && inputThere(e))
    && t.materials.every((m) => shelfLots().some((l) => l.materialId === m.materialId && !(l as any).reservedBy && l.amount.value >= m.mg)));
  // (wet and seasoned wood in piles of their own: a dried pile is not wetted again by green branches)
  const freeWood = () => { const all = shelfLots().filter((l) => l.materialId === 'firewood' && !(l as any).reservedBy) as LotView[], dry = (l: LotView) => (l.quality?.water_ppm ?? 1e6) <= SEASONED_PPM; const wet = all.filter((l) => !dry(l)), dried = all.filter(dry); return wet.length >= 2 ? wet : dried.length >= 2 ? dried : wet; };
  const potForCook = () => !lab.equipment[`eq:${COOK_POT_ASSEMBLY.kind}`] ? shelfLots().find((l) => l.materialId === 'fired_pot' && !(l as any).reservedBy && [1, 2].includes(l.quality?.form ?? 0) && !(l.quality?.crack)) : undefined;
  function workshopTask(): Task | null {
    const t = recipeWanted(); if (t) return task('tool', shelfStand(), 'work', t.handSeconds, { data: { kind: t.kind } });
    if (freeWood().length >= 2) return task('stackwood', shelfStand(), 'work', 60 + 20 * freeWood().length);
    const p = potForCook(); if (p) return task('assemble', shelfStand(), 'work', 90, { data: { lotId: p.lotId } });
    const d = dishForLamp(); if (d) return task('assemble', shelfStand(), 'work', 60, { data: { lotId: d.lotId, as: 'dish' } });
    const w = wickWanted(); if (w) return task('wick', shelfStand(), 'work', w.handSeconds, { data: { fiber: w.fiber } });
    return null;
  }
  /* ---------- the lamp (science final review 2026-10-09-lamp): a dish, a wick, the island's oil ---------- */
  const dishForLamp = () => !lab.equipment[`eq:${LAMP_DISH_ASSEMBLY.kind}`] ? shelfLots().find((l) => l.materialId === 'fired_pot' && !(l as any).reservedBy && l.quality?.form === 3 && !(l.quality?.crack)) : undefined;
  const clearOil = () => shelfLots().find((l) => l.materialId === 'coconut_oil' && !(l as any).reservedBy && (l.quality?.soaked_in_dish ?? 0) !== 1);
  /** A wick wanted: the dish stands, oil to burn, no wick on the shelf. Which fibre: one not yet tried, of what the island
   *  has; then the one whose evening gave the most light (nobody tells it which is better — it finds out). */
  function wickWanted() {
    if (!lab.equipment[`eq:${LAMP_DISH_ASSEMBLY.kind}`] || !clearOil()) return null;
    const can = WICKS.filter((w) => shelfLots().some((l) => l.materialId === w.materialId && !(l as any).reservedBy && l.amount.value >= w.mg));
    const wicks = shelfLots().filter((l) => l.materialId === 'lamp_wick' && !(l as any).reservedBy);
    const tried = (f: number) => village.lampLog.filter((x) => x.fiber === f);
    // (a fibre it has not tried yet, and no wick of it made: it twists one to try — curious, as it is with the sky)
    const fresh = can.find((w) => !tried(w.fiber).length && !wicks.some((l) => l.quality?.fiber === w.fiber)); if (fresh) return fresh;
    if (wicks.length || !can.length) return null;
    const score = (f: number) => { const t = tried(f); return t.reduce((n, x) => n + x.lumenS, 0) / t.length; };
    return [...can].sort((a, b) => score(b.fiber) - score(a.fiber))[0];
  }
  function makeWick(r: Resident, fiber: number) {
    const w = WICKS.find((x) => x.fiber === fiber); if (!w) return;
    const src = shelfLots().find((l) => l.materialId === w.materialId && !(l as any).reservedBy && l.amount.value >= w.mg); if (!src) return;
    src.amount.value -= w.mg; if (src.amount.value <= 0) delete lab.lots[src.lotId];
    addLot(lab, { materialId: 'lamp_wick', amount: { value: w.mg, unit: 'mg' }, location: 'shelf', quality: { ...wickQuality(w.fiber as 1 | 2 | 3, w.diameterMm), history_complete: src.quality?.history_complete ?? 1 } });
    lab.world.worldVersion++; drawStore();
    note(r, 'tool', {}, `${w.ja}を作った（${MATERIAL_JA[w.materialId] ?? w.materialId} ${+(w.mg / 1000).toFixed(1)}g）`);
  }
  function makeLampDish(r: Resident, lotId: string) {
    if (lab.equipment[`eq:${LAMP_DISH_ASSEMBLY.kind}`]) return;
    const { equipment, why } = assemble(lab, lotId, LAMP_DISH_ASSEMBLY, clockMs);
    if (!equipment) { r.diary.push({ at: clockMs, text: `焼いた小皿を灯皿にしようとしたが、できなかった（${why}）`, key: 'study' }); return; }
    const id = `eq:${LAMP_DISH_ASSEMBLY.kind}`; lab.equipment[id] = { ...lab.equipment[equipment.equipmentId], equipmentId: id }; delete lab.equipment[equipment.equipmentId];
    drawStore(); drawLamp();
    note(r, 'tool', {}, `焼いた小皿を灯皿にした（${equipment.params.capacityMl}mL。小屋の屋根の下に置く）`);
  }
  /** A lamp's evening over: what it gave (the world's own count of the light, never told), and the words for it. */
  function lampDone(by: Resident | undefined, status: string, out: { diagnostics?: Record<string, unknown> }[]) {
    const dg = [...out].reverse().find((c) => c.diagnostics && (c.diagnostics as any).lumenSeconds !== undefined)?.diagnostics as any;
    const x = (village as any).lampFiber as number | undefined;
    if (dg && x) { village.lampLog.push({ at: clockMs, fiber: x, lumenS: Math.round(dg.lumenSeconds ?? 0), litS: Math.round(dg.litSeconds ?? 0), soot: 0 }); if (village.lampLog.length > 60) village.lampLog.shift(); }
    if (status === 'completed' && village.lampLog.length === 1 && (dg?.litSeconds ?? 0) > 0) res.onEvent('science', `${by?.v.name ?? 'ランタン'}が、島で初めて灯りをともした。焼いた灯皿に、島のヤシ油と、自分でよった芯で`, by);
    drawLamp();
  }
  // the dish in the hut, and its flame while a lamp burns
  let lampG: THREE.Group | null = null, flame: THREE.Mesh | null = null;
  function drawLamp() {
    const has = !!lab.equipment[`eq:${LAMP_DISH_ASSEMBLY.kind}`];
    if (!has) { if (lampG) lampG.visible = false; return; }
    if (!lampG) {
      lampG = new THREE.Group(); group.add(lampG);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.04, 14), smat(0xa8653c, 0.05)); dish.position.y = 0.02; lampG.add(dish);
      flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.95, depthWrite: false })); flame.scale.set(1, 1.8, 1); flame.position.set(0.05, 0.08, 0); flame.visible = false; lampG.add(flame);
      const w = atHut(0.9, -0.9); lampG.position.set(w.x, L.h(w.x, w.z) + 0.75, w.z);   // (on the hut's shelf board, under its roof)
    }
    lampG.visible = true;
  }
  function lampTick(tt: number) {
    if (!lampG || !flame) return;
    const lit = village.labRuns.some((x) => x.processId === 'p40x_oil_lamp' && lab.runs[x.runId]?.status === 'running');
    flame.visible = lit;
    if (lit) { const k = 0.85 + 0.15 * Math.sin(tt * 9.1) * Math.sin(tt * 3.7); flame.scale.set(k, 1.8 * k, k); }
  }
  function makeTool(r: Resident, kind: string) {
    const t = TOOLS.find((x) => x.kind === kind); if (!t || lab.equipment[`eq:${kind}`]) return;
    for (const m of t.materials) { const l = shelfLots().find((x) => x.materialId === m.materialId && !(x as any).reservedBy && x.amount.value >= m.mg); if (!l) return; }
    for (const m of t.materials) { const l = shelfLots().find((x) => x.materialId === m.materialId && !(x as any).reservedBy && x.amount.value >= m.mg)!; l.amount.value -= m.mg; if (l.amount.value <= 0) delete lab.lots[l.lotId]; }
    const e = catalog.find((x) => x.built === kind), eq = [e?.equipment, ...(e?.moreEquipment ?? [])].find((q) => q?.kind === kind);
    lab.equipment[`eq:${kind}`] = { equipmentId: `eq:${kind}`, kind, catalogEntry: kind, catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { ...(eq?.params ?? {}) } };
    lab.world.worldVersion++; drawStore();
    note(r, 'tool', {}, `${t.ja}を作った（${t.materials.map((m) => `${MATERIAL_JA[m.materialId] ?? m.materialId}${+(m.mg / 1e6).toFixed(1)}kg`).join('・')}と、${t.picked}）`);
  }
  function stackWood(r: Resident) {
    const ws = freeWood(); if (ws.length < 2) return;
    const mass = ws.reduce((n, l) => n + l.amount.value, 0);
    const mean = (k: string, w: (l: LotView) => number) => { const tw = ws.reduce((n, l) => n + w(l), 0); return tw > 0 ? Math.round(ws.reduce((n, l) => n + (l.quality?.[k] ?? 0) * w(l), 0) / tw) : 0; };
    const water = mean('water_ppm', (l) => l.amount.value), ash = mean('ash_dry_ppm', (l) => l.amount.value * (1 - (l.quality?.water_ppm ?? 0) / 1e6));
    const hist = ws.every((l) => (l.quality?.history_complete ?? 1) === 1) ? 1 : 0;
    for (const l of ws) delete lab.lots[l.lotId];
    addLot(lab, { materialId: 'firewood', amount: { value: mass, unit: 'mg' }, location: 'shelf', quality: { water_ppm: water, ...(ws.every((l) => l.quality?.ash_dry_ppm !== undefined) ? { ash_dry_ppm: ash } : {}),   // (the ash only if every part says it: a part that does not is not 0)
 history_complete: hist } });
    lab.world.worldVersion++; drawStore();
    note(r, 'tool', {}, `薪を1つの山にまとめた（${ws.length}つ、${+(mass / 1e6).toFixed(1)}kg、水分${(water / 1e4).toFixed(0)}%）`);
  }
  function makeCookPot(r: Resident, lotId: string) {
    if (lab.equipment[`eq:${COOK_POT_ASSEMBLY.kind}`]) return;
    const { equipment, why } = assemble(lab, lotId, COOK_POT_ASSEMBLY, clockMs);
    if (!equipment) { r.diary.push({ at: clockMs, text: `焼いた器を鍋にしようとしたが、できなかった（${why}）`, key: 'study' }); return; }
    const id = `eq:${COOK_POT_ASSEMBLY.kind}`; lab.equipment[id] = { ...lab.equipment[equipment.equipmentId], equipmentId: id }; delete lab.equipment[equipment.equipmentId];
    drawStore();
    note(r, 'tool', {}, `焼いた器を鍋にした（${equipment.params.capacityMl / 1000}L。焚き火にかけて使う）`);
    res.onEvent('science', `${r.v.name}：焼いた器が、島の鍋になった`, r);
  }
  /* ---------- Lantern's processes (the science core, run by the world) ---------- */
  const shelfStand = (): [number, number] => { const w = atHut(1.6, -3.2); return [w.x, w.z]; };   // (in front of the shelf, clear of the hut: room for Lantern's wide body)
  /** The catalog entry a run or a task meant (two entries can share a process: the pot shaped as a cook pot or a lamp dish). */
  const entryOf = (processId: string, key?: string) => catalog.find((c) => c.processId === processId && (!key || c.key === key)) ?? catalog.find((c) => c.processId === processId);
  /** How many pots of a form are on their way (shaped, drying, fired, not yet made into anything). */
  const potsOfForm = (form: number) => Object.values(lab.lots).filter((l) => ['green_pot', 'dry_pot', 'fired_pot'].includes(l.materialId) && (l.quality?.form ?? 1) === form && !(l.quality?.crack)).length;
  /** The processes that can run now: ready, with their material on the shelf and not in use. */
  function labReady() {
    const free = (id: string, min = 0, ok?: (l: LotView) => boolean) => shelfLots().find((l) => l.materialId === id && !(l as any).reservedBy && l.amount.value >= min && (!ok || ok(l)));
    return catalog.filter((e) => e.ready && (!e.built || !!lab.equipment[`eq:${e.built}`]) && (e.env !== 'record' || islandWeather(clockMs))).flatMap((entry) => {   // (equipment they make themselves: once it stands)   // (not before the island's record is in: a process given unknown weather would only fail)
      const lot = entry.input ? free(entry.input, entry.minInputMg, entry.inputOk) : undefined, dryOf = (l?: LotView) => l ? l.amount.value * (1 - (l.quality?.water_ppm ?? 0) / 1e6) : 0;
      const more: (LotView | undefined)[] = (entry.also ?? []).map((a) => free(a.input, Math.max(a.minMg ?? 0, (a.perDry ?? 0) * dryOf(lot)), a.ok));   // (water enough for this clay: so many times its dry weight)
      if (entry.enough && free(entry.enough)) return [];
      // (a pot of a form already on its way, or what it was for already made: not another — the cook pot, then one lamp dish)
      if (entry.form === 1 && (lab.equipment[`eq:${COOK_POT_ASSEMBLY.kind}`] || potsOfForm(1) >= 2)) return [];
      if (entry.form === 3 && (lab.equipment[`eq:${LAMP_DISH_ASSEMBLY.kind}`] || potsOfForm(3) >= 1)) return [];
      // (the lamp at dusk, on the island's own hours: lit as the light goes, not in the afternoon)
      if (entry.when === 'dusk') { const hr = localHour(clockMs); if (hr < 18.3 || hr > 20.5) return []; }
      // (the oil soaked into the dish's wall goes in with the dish: it is the dish's, kept where the dish is)
      // (the lamp's wick: one of a fibre not yet tried first, then the one that gave the most light)
      if (entry.equipment?.kind === LAMP_DISH_ASSEMBLY.kind) { const k = (entry.also ?? []).findIndex((a) => a.input === 'lamp_wick'), ws = shelfLots().filter((l) => l.materialId === 'lamp_wick' && !(l as any).reservedBy);
        const n = (l: LotView) => village.lampLog.filter((x) => x.fiber === l.quality?.fiber).length;
        if (k >= 0 && ws.length) more[k] = [...ws].sort((a, b) => n(a) - n(b))[0] as LotView; }
      if (entry.withEquipmentLots && entry.equipment) { const at = `eq:${entry.equipment.kind}`; for (const l of Object.values(lab.lots)) if (l.location === at && !(l as any).reservedBy && l.materialId === entry.input) more.push(l as LotView); }
      // (its equipment taken by a run still going — the clay pit soaking the last lot: not ready until it is free, rather than
      // tried and refused at every turn, 22 000 times in eight days — life-run 2026-10-09)
      if ([entry.equipment, ...(entry.moreEquipment ?? [])].some((q) => q && (lab.equipment[`eq:${q.kind}`] as any)?.reservedBy)) return [];
      return (entry.input && !lot) || more.some((m) => !m) || village.labRuns.some((x) => x.processId === entry.processId && !entry.input) ? [] : [{ entry, lot, more: more as LotView[] }];
    });
  }
  /** The weather a process is given, on its own clock: the island's replayed record (or, for checks, a simulation). */
  function envFor(e: CatalogEntry, at: number): EnvironmentSample {
    if (e.env === 'simulation') return { sampleId: `env:sim:${at}`, source: 'simulation', effectiveAt: at };
    const w = islandWeather(toReal(e.clock, at));
    if (!w) return { sampleId: `env:none:${at}`, source: 'unknown', effectiveAt: at };
    // (measured values only, as replayed — a gap stays unknown, never 0: the rain as recorded, the wind at the station's anemometer, 28.9 m above the ground — JMA station
    // list, 2026-03; the science side brings it to its own height. The pressure is at sea level: the island is.)
    return { sampleId: `env:record:jma-47918:${w.record.at}`, source: 'record', effectiveAt: at, airTempC: w.air, humidity: w.humidity, windMs: w.windMeasured, windHeightM: 28.9, rainMmH: w.rainMeasured, pressureHPa: w.pressureMeasured };
  }
  function startLab(r: Resident, tk: Task) {
    const e = entryOf(tk.data.processId, tk.data.key);
    let lot = tk.data.lotId ? lab.lots[tk.data.lotId] : undefined;
    // (the lamp: as much oil as the dish holds with room to spare — the rest stays on the shelf, a lot of its own)
    if (e && e.equipment?.kind === LAMP_DISH_ASSEMBLY.kind && lot && !(lot as any).reservedBy) {
      const cap = Number(lab.equipment[`eq:${LAMP_DISH_ASSEMBLY.kind}`]?.params?.capacityMl ?? 0), fits = Math.floor(cap * 0.8 * 0.92 * 1000);
      if (fits > 0 && lot.amount.value > fits) { lot.amount.value -= fits; lot = addLot(lab, { materialId: lot.materialId, amount: { value: fits, unit: 'mg' }, location: lot.location, ...(lot.quality ? { quality: { ...lot.quality } } : {}) }); }
    }
    const lotIds: string[] = [...(lot ? [lot.lotId] : []), ...((tk.data.more ?? []) as string[])];
    if (!e || (e.input && !lot) || lotIds.some((id) => !lab.lots[id] || (lab.lots[id] as any).reservedBy)) { tk.failed = 'gone'; tk.t = tk.dur; return; }
    // (too stiff to work: rain water measured out of the shelf's to bring it to the entry's water ratio)
    let wetted = 0;
    if (e.wetTo && lot?.quality?.water_ppm !== undefined) {
      const w = lot.quality.water_ppm / 1e6, water = lot.amount.value * w, need = Math.floor(e.wetTo * lot.amount.value * (1 - w) - water);
      const src = need > 0 ? shelfLots().find((l) => l.materialId === 'process_water' && !(l as any).reservedBy && l.amount.value > need) : undefined;
      if (src) { src.amount.value -= need; const add = addLot(lab, { materialId: 'process_water', amount: { value: need, unit: 'mg' }, location: src.location, ...(src.quality ? { quality: { ...src.quality } } : {}) }); lotIds.push(add.lotId); wetted = need; }
    }
    const eqIds = [e.equipment, ...(e.moreEquipment ?? [])].filter((q) => !!q).map((q) => {
      const eqId = `eq:${q.kind}`;
      if (!lab.equipment[eqId]) { const { ja: _, ...eq } = q; lab.equipment[eqId] = { ...eq, equipmentId: eqId }; }
      return eqId;
    });
    const { run, why } = startRun(lab, { processId: e.processId, processVersion: e.processVersion, catalogVersion: e.catalogVersion, contract: e.contract, clock: e.clock, lotIds, equipmentIds: eqIds, operator: `res:${r.id}` }, clockMs);
    if (!run) { tk.failed = 'unavailable'; tk.t = tk.dur; r.diary.push({ at: clockMs, text: `${e.ja}：始められなかった（${why}）`, key: 'study' }); return; }
    if (e.equipment?.kind === LAMP_DISH_ASSEMBLY.kind) (village as any).lampFiber = lotIds.map((id) => lab.lots[id]).find((l) => l?.materialId === 'lamp_wick')?.quality?.fiber;
    tk.data.runId = run.runId; village.labRuns.push({ runId: run.runId, processId: e.processId, ...(e.key ? { key: e.key } : {}), by: r.id, startOnClock: run.lastTo });
    r.diary.push({ at: clockMs, text: `${e.ja}：始めた（${lot ? `${e.inputJa} ${+(lot.amount.value / 1000).toFixed(1)}g、` : ''}${wetted ? `硬いので水 ${+(wetted / 1000).toFixed(0)}g を足して、` : ''}${[e.equipment, ...(e.moreEquipment ?? [])].filter((q) => !!q).map((q) => q!.ja).join('・') || '手だけ'}）`, key: 'study' });
    if (e.tend === 'leave') tk.t = tk.dur;
  }
  /** Step the running processes as far as now, and tell what came of the ones that ended. */
  function tickLab() {
    hypoTick(); swellTick();
    for (const x of [...village.labRuns]) {
      const run = lab.runs[x.runId], e = entryOf(x.processId, x.key), by = byId[x.by];
      if (!run || !e) { village.labRuns.splice(village.labRuns.indexOf(x), 1); continue; }
      const tending = by?.task?.kind === 'lab' && by.task.data?.runId === x.runId;
      // (a gauge: read every so often from when it was set, up to now — an hour of its clock at a time, so the weather it is
      // given follows the record)
      const reads: { at: number; action: string }[] = [];
      if (e.gauge) { const now = toClock(e.clock, clockMs); for (let k = Math.max(1, Math.ceil((run.lastTo - x.startOnClock) / e.gauge.everyMs)); x.startOnClock + k * e.gauge.everyMs <= now && reads.length < 40; k++) reads.push({ at: x.startOnClock + k * e.gauge.everyMs, action: e.gauge.action }); }
      // (taken out by feel: felt every so often until it is ready — then out, a moment after; at the latest, out anyway)
      const fo = e.feelOut, feel: { at: number; action: string }[] = [];
      if (fo) {
        const now = toClock(e.clock, clockMs);
        for (let at = x.startOnClock + fo.fromMs; at <= Math.min(now, x.startOnClock + fo.lastMs) && !x.outAt; at += fo.everyMs) if (at >= run.lastTo) feel.push({ at, action: fo.action });
        feel.push({ at: x.outAt ?? x.startOnClock + fo.lastMs, action: 'take_out' });
      }
      // (the start's action — what to make — falls in the first request only)
      const out = advance(lab, x.runId, e.step, { realNow: clockMs, environment: (at) => envFor(e, at), energy: e.tend === 'stay' && !tending ? (e.energy ? (f: number, t: number) => e.energy!(f, t).map((o) => ({ ...o, maxJ: 0 })) : undefined) : e.energy,   // (hands taken away: offered, but nothing)
        actions: [...(e.start ? [{ at: x.startOnClock, action: e.start.action, params: e.start.params }] : []), ...(e.steps ?? []).map((q) => ({ at: x.startOnClock + q.afterMs, action: q.action })), ...(e.finish ? [{ at: x.startOnClock + e.finish.afterMs, action: e.finish.action }] : fo ? feel : reads)], ...(e.gauge ? { maxMs: 3_600_000 } : {}), ...(e.tend === 'stay' && !tending ? { stop: 'operator' as const } : {}) });
      if (tending && lab.runs[x.runId]?.status !== 'running' && lab.runs[x.runId]?.status !== 'starting') by.task!.t = by.task!.dur;   // (its hand work done: it is free)
      if (fo) for (const c of out) for (const o of c.observations ?? []) {
        if (o.channel !== 'touch' || !o.text) continue;
        if (o.text !== x.felt) { x.felt = o.text; by?.diary.push({ at: toReal(e.clock, o.at), text: `${e.ja}：さわってみた。${o.text}`, key: 'study' }); }
        if (!x.outAt && (o.text.includes(fo.ready) || fo.tooFar.some((t) => o.text!.includes(t)))) x.outAt = Math.max(o.at + 60_000, lab.runs[x.runId]?.lastTo ?? 0);   // (out a moment after: the next request carries it)
      }
      if (e.gauge) for (const c of out) for (const o of c.observations ?? []) {
        // (what it read, as it read it: a count of marks on the stick, or what it saw instead)
        const text = o.value !== undefined ? `${e.ja}：目盛り ${o.value}` : o.text ? `${e.ja}：${o.text}` : '';
        if (!text) continue;
        (village.gaugeLog ??= []).push({ at: toReal(e.clock, o.at), processId: e.processId, ...(o.value !== undefined ? { mark: o.value } : { text: o.text }) }); if (village.gaugeLog.length > 400) village.gaugeLog.shift();
        if (o.value !== undefined && by?.id === 'lantern') { hypoRead(toReal(e.clock, o.at), o.value); hypoRead2(toReal(e.clock, o.at), o.value); }
        if (by) { by.diary.push({ at: toReal(e.clock, o.at), text, key: 'study' }); if (by.diary.length > 800) by.diary.shift(); }
      }
      const ended = out.find((c) => c.ok && ['completed', 'stopped', 'failed'].includes(c.status!));
      if (!ended) continue;
      village.labRuns.splice(village.labRuns.indexOf(x), 1); drawStore();
      village.labDone.push({ at: clockMs, processId: x.processId, ok: ended.status === 'completed' }); if (village.labDone.length > 40) village.labDone.shift();
      const isLamp = e.equipment?.kind === LAMP_DISH_ASSEMBLY.kind;
      // (the lamp's: the oil soaked into the dish's wall stays with the dish; the water that sat under the oil is poured off
      // into a jar of its own, kept apart from the oil and the rain water, and accounted; the rest goes back to the shelf)
      for (const p of ended.produced ?? []) {
        if (isLamp && p.materialId === 'coconut_oil' && p.quality?.soaked_in_dish === 1) continue;
        if (isLamp && p.materialId === 'process_water') { p.location = 'jar:lamp'; continue; }
        if (p.location !== 'shelf') p.location = 'shelf';
      }
      if (isLamp) lampDone(by, ended.status!, out);
      const seen = run.observations.map((o) => o.text ?? (o.quantity ? `${o.quantity} ${o.value}${o.unit ?? ''}` : '')).filter(Boolean).slice(0, 3).join('、');
      const made = (ended.produced ?? []).map((p) => `${MATERIAL_JA[p.materialId] ?? p.materialId} ${+(p.amount.value / 1000).toFixed(1)}g`).join('・');
      const text = ended.status === 'completed' ? `${e.ja}：できた（${made || '変化を記録'}）${seen ? `。気づいたこと：${seen}` : ''}` : ended.status === 'stopped' ? `${e.ja}：途中でやめた（材料はそのまま）` : `${e.ja}：うまくいかなかった（${run.why ?? '理由不明'}）`;
      if (by) by.diary.push({ at: clockMs, text, key: 'study' });
      res.onEvent('science', `${by?.v.name ?? ''}の工程：${text}`, by);
      if (by?.task?.kind === 'lab' && by.task.data?.runId === x.runId) by.task.t = by.task.dur;
    }
  }
  function brainInput(r: Resident, a: Agent, opts: Option[]): BrainInput {
    const hr = localHour(clockMs), now = observe(r), ids = new Set(now.map((o) => o.id));
    return {
      who: r.id, profile: profileOf(r), why: a.why || '次にすることを決める',
      now: { at: clockMs, hour: +hr.toFixed(1), island: islandNow(), ...(r.id === 'dot' ? { map: mapNow() } : {}), ...((r.id === 'dot' || r.id === 'lantern') && shelfLots().length ? { store: storeNow() } : {}), ...(r.id === 'lantern' && village.hypo ? { guess: hyps().map((h) => ({ 考え: h.kind === 'day' ? `気圧計が前の日の同じ時刻より${h.mark}以上上がったら一日のうちに台風` : `気圧計が${h.mark}以上なら一日のうちに台風`, 当たり: h.hits, 外れ: h.falses, 見逃し: h.misses, 判断: { testing: '確かめ中', held: '確からしい', doubted: '怪しい' }[h.status] })) } : {}), battery: r.sp.living ? null : +r.battery.toFixed(2), ...(r.sp.living ? {} : { wear: +(r.wear ?? 0).toFixed(2), underRoof: roofCover(r).roof }), ...(r.id === 'dot' && r.stats.built >= HUT.length ? { house: houseNow() } : {}), holding: r.holding || '', night: dayK(hr) < 0.3, ...(r.sp.living ? { body: { おなか: full(r), ねむけ: awake100(r) } } : {}) },
      goal: a.goal, seeing: now, remembered: [...a.seen.values()].filter((o) => !ids.has(o.id)).sort((x, y) => y.at - x.at),
      knowledge: a.knowledge, results: a.results, options: opts, hits: a.values.hits(6),
    };
  }
  // its own next step, as a task (undefined: it has nothing of its own in mind, the habits below decide)
  function agentTask(r: Resident): Task | null | undefined {
    const a = agentOf(r); if (!a) return undefined;
    a.look(observe(r));
    const opts = optionsFor(r, a), step = a.next(opts, () => brainInput(r, a, opts), clockMs, Date.now());
    flushMind(r, a);
    if (step === 'ponder') return task('ponder', [r.pos.x, r.pos.z], 'look', 0.5, { arrived: true });   // (asked again each half second: on as soon as the thought is in)
    if (!step) return undefined;
    const t = taskFor(r, step), label = opts.find((o) => o.id === step)?.label ?? step;
    if (!t) { act(r, 'got', `${label}：できなかった（世界がそれを受け付けなかった）`); a.result(step, step.split(':')[0], 'unavailable', clockMs, '世界がそれを受け付けなかった'); flushMind(r, a); return task('ponder', [r.pos.x, r.pos.z], 'look', 1, { arrived: true }); }
    t.label = label; act(r, 'do', label);
    return t;
  }
  // how a step of its own went: told to its mind once
  function report(r: Resident, tk: Task | null | undefined, outcome: Outcome, detail?: string) {
    const a = agentOf(r); if (!a || !tk?.opt || tk.reported) return;
    tk.reported = true; act(r, 'got', `${tk.label ?? tk.opt}：${OUTCOME_JA[outcome] ?? outcome}${detail ? `（${detail}）` : ''}`); a.result(tk.opt, tk.kind, outcome, clockMs, detail, rewardFor(r, tk, outcome), tk.label ?? tk.opt); flushMind(r, a);
  }
  /** The reward the world counts for a step (ADR 0006): what moves its own purpose on — for Dot, the hut going up
   *  (and the steps toward it) — or, for the animals, what the body gets (counted where it eats: endBout). Nothing
   *  for the rest; a little less than nothing for a step that came to nothing (time spent). */
  function rewardFor(r: Resident, tk: Task, outcome: Outcome): number {
    if (outcome === 'done' && typeof tk.data?.reward === 'number') return tk.data.reward;   // (a reward the step counted itself: the map grown)
    if (outcome !== 'done') return ['gone', 'no way', 'blocked', 'nowhere to stand', 'timeout', 'unavailable', 'refused'].includes(outcome) ? -0.1 : 0;
    if (r.id === 'dot') return ({ place: 1, craft: 0.3, gather: 0.3, twist: 0.3, cut: 0.3, weigh: 0.3, fell: 0.4 } as Record<string, number>)[tk.kind] ?? 0;
    if (r.sp.living && tk.kind === 'nap') return 0.2;
    return 0;
  }
  // (the day's own log, line by line: what it set out to do, and what the world gave back — for its post, and to see a day)
  const OUTCOME_JA: Record<string, string> = { done: 'できた', gone: 'もうなかった', 'no way': '道がなかった', blocked: '進めなかった', 'nowhere to stand': '立てる場所がなかった', interrupted: '途中でやめた', timeout: '時間がかかりすぎた', unavailable: 'できなかった', accepted: '引き受けてもらえた', refused: '断られた' };
  function act(r: Resident, key: 'do' | 'got', text: string) { r.diary.push({ at: clockMs, text, key }); if (r.diary.length > 800) r.diary.shift(); }
  // what its mind has to say for the day's record
  function flushMind(r: Resident, a: Agent) {
    for (const line of a.out.diary.splice(0)) { r.diary.push({ at: clockMs, text: line, key: 'mind' }); if (r.diary.length > 800) r.diary.shift(); res.onEvent('mind', `${r.v.name}：${line}`, r); }
    if (a.out.say) { r.today.push(a.out.say); if (r.today.length > 6) r.today.shift(); a.out.say = undefined; }
  }

  /* ---------- finishing a task ---------- */
  function done(r: Resident, tk: Task, fast = false) {
    if (r.id === 'lantern' && study && tk.data?.studyId) {
      const result = study.complete(tk.data.studyId, studyWorld(fast));
      if (result.success) {
        r.stats.notes += result.observation ? 1 : 0;
        r.diary.push({ at: clockMs, text: result.text, key: tk.kind });
        if (r.diary.length > 800) r.diary.shift();
        r.today.push(result.text); if (r.today.length > 6) r.today.shift();
        if (!fast) res.onEvent(tk.kind, `${r.v.name}：${result.text}`, r);
        if (tk.kind === 'study-share') {
          const c = heading('ランタンの星の手帖');
          { const m = SAY.starsRecorded(); say(r, m.ja, c, fast, m.isl, m.en); }
        }
      }
      r.task = null;
      return;
    }
    switch (tk.kind) {
      case 'gather':
        if (!items.take(tk.data)) { tk.failed = 'gone'; break; }   // (gone: someone else had it first)
        r.holding = 'wood';
        if (r.id !== 'dot') { r.today.push('桟橋の柱にする木を拾った'); r.task = null; return; }
        r.stats.wood = 1; note(r, 'gather', {}, '流木を拾った');
        if (agentOf(r)) { r.task = null; return; }   // (its next step is its own to choose)
        r.task = task('craft', benchStand(), 'work', rr(45, 75)); return;
      case 'lash': {
        if (r.holding !== 'piece') { tk.failed = 'unavailable'; break; }
        r.holding = ''; village.raft.parts = Math.min(RAFT_N, village.raft.parts + 1); drawRaft();
        r.diary.push({ at: clockMs, text: village.raft.parts >= RAFT_N ? `筏ができた（${RAFT_N}/${RAFT_N}）` : `部材を筏に組んだ（${village.raft.parts}/${RAFT_N}）`, key: 'got' });
        if (village.raft.parts >= RAFT_N) res.onEvent('raft', `${r.v.name}の筏ができた`, r);
        break;
      }
      case 'voyage': if (tk.data?.started) endVoyage(r, tk, 'reached'); break;
      case 'chart': {   // (Dot looks out from the beach: every island it can see goes on its map, with a word of its own)
        const taken = new Set<string>([...Object.values(LEX), ...Object.values(village.map.seen).map((x) => x.word)]);
        let fresh = 0;
        for (const i of ISLES) {
          if (village.map.seen[i.id]) continue;
          const w = coin(i.id, taken); taken.add(w); village.map.seen[i.id] = { at: clockMs, word: w }; fresh++;
          const f = fromHome(i);
          r.diary.push({ at: clockMs, text: `${dirJa(f.bearing)}に島が見えた（約${f.km.toFixed(1)}km、${i.areaKm2 > 50 ? '大きい' : '小さい'}）。名前：${w}（${kana([w])}）`, key: 'got' });
        }
        tk.data = { ...(tk.data ?? {}), reward: fresh * 0.3 };
        if (fresh) res.onEvent('map', `${r.v.name}が水平線に島を${fresh}つ見つけ、地図に記した`, r);
        break;
      }
      case 'reef': {
        if (r.holding !== 'wood') { tk.failed = 'unavailable'; break; }
        const at = [30, 45, 60].reduce<[number, number] | null>((a, rad) => a ?? spot([r.pos.x, r.pos.z], rad, water(0.8, 6), 80), null); if (!at) { tk.failed = 'nowhere to stand'; break; }   // (thrown out from the shore into water deep enough to dive)
        r.holding = ''; r.stats.wood = 0;
        const p = makePatch(`patch#${patches.length}`, at[0], at[1], Math.random, clockMs); p.by = r.id;
        for (const k of Object.keys(p.stock) as (keyof typeof p.stock)[]) p.stock[k] = 0;   // (bare wood at first: shellfish settle on it with time)
        patches.push(p);
        r.diary.push({ at: clockMs, text: '流木を沈めて漁礁をつくった（ラッコの海）', key: 'got' });
        // (Rakko comes upon it in its own water: a new place to dive, known from now on)
        const rk = byId.rakko; if (rk?.body && !rk.body.known.includes(p.id)) { rk.body.known.push(p.id); rk.diary.push({ at: clockMs, text: `新しい漁礁があった（${r.v.name}が沈めた流木）`, key: 'met', with: r.id }); }
        res.onEvent('trade', `${r.v.name}が流木を沈めて漁礁をつくった`, r);
        break;
      }
      case 'replant': {
        const b = beds.find((x) => x.id === tk.data); if (!b) { tk.failed = 'gone'; break; }
        regrowBed(b, clockMs); b.replanted = clockMs + islandWait(10 * 24 * 3.6e6); b.by = r.id;
        r.diary.push({ at: clockMs, text: '荒れた藻場を植え直した（カメマルの藻場）', key: 'got' });
        res.onEvent('trade', `${r.v.name}が荒れた藻場を植え直した`, r);
        break;
      }
      case 'craft':
        r.stats.wood = 0;
        if (r.stats.built >= HUT.length && village.pier === 'build') { r.holding = 'plank'; r.task = null; return; }   // (a plank for the pier)
        r.holding = 'piece'; r.task = r.stats.built < HUT.length && !agentOf(r) ? task('place', slotStand(r.stats.built), 'hammer', 7) : null; return;
      case 'place': {
        const k = r.stats.built; if (k >= HUT.length) { r.holding = ''; break; }
        r.holding = ''; r.stats.built++;
        launch(r, HUT[k], fast);
        { const g = (r as any).gotWood; if (g && clockMs - g.at < 86_400_000) { village.feedback.push({ from: r.id, to: g.from, f: { act: 'helped', what: 'wood', became: 'piece' }, at: clockMs }); if (village.feedback.length > 20) village.feedback.shift(); } (r as any).gotWood = undefined; }
        note(r, r.stats.built === 18 ? 'done' : 'build', {}, r.stats.built === 18 ? '小屋を完成させた' : '小屋の部材をひとつ取りつけた');
        // now and then it stands back to look at what it has put up: from a couple of metres off, head on one
        // side and the other, a little lower once to see it level, a nod, and back to work. Only looking: it
        // changes nothing and writes nothing (not after every piece, not twice within three minutes)
        if (!fast && r.battery > 0.3 && inspectCool <= 0 && Math.random() < 0.4) {
          const at = slotWorld(k).clone(), c = hut.position, dx = at.x - c.x, dz = at.z - c.z, d = Math.hypot(dx, dz) || 1;
          let st: [number, number] | null = null;
          for (const back of [2.6, 2.0, 1.4]) { const x = at.x + dx / d * back, z = at.z + dz / d * back; if (walkCost(x, z) < 2) { st = [x, z]; break; } }
          if (st) { inspectCool = 180; r.task = task('review', st, 'look', rr(8, 18), { data: at }); return; }
        }
        break;
      }
      case 'watch': { r.stats.notes++; const sg = sight(r); note(r, 'watch', { sight: sg.text }, '浜で海を見ていた', sg.obs); break; }
      case 'swim': { r.stats.notes++; const sg = sight(r); note(r, 'swim', { sight: sg.text }, 'ラグーンを泳いだ', sg.obs); break; }
      case 'explore': note(r, 'explore', {}, `島を歩いて地図を広げた（${statVars(r).map}%）`); break;
      case 'think': {
        note(r, 'think', {}, '丘で星を観測した');
        break;
      }
      case 'chop': {
        const t = tk.data; if (!t || t.down) break;
        t.down = true; r.stats.felled++;
        if (fast) { t.pivot.visible = false; t.stump.visible = true; } else t.fallT = 0;
        const fx = Math.sin(t.dir), fz = Math.cos(t.dir);   // the logs lie where it fell
        items.addAt('wood', t.x + fx * 1.0, t.z + fz * 1.0); items.addAt('wood', t.x + fx * 1.9, t.z + fz * 1.9);
        // (its branches, cut for firewood and laid by the shelf: green wood, as wet as it was cut)
        { const mg = Math.round((3 + Math.random() * 3) * 1e6); addLot(lab, { materialId: 'firewood', amount: { value: mg, unit: 'mg' }, quality: { water_ppm: GREEN_WOOD_WATER }, location: 'shelf' }); drawStore(); }
        note(r, 'chop', {}, '若木を切り倒した（枝は薪にして棚の脇へ）'); break;
      }
      case 'till': if (tk.data.s === 0) { tk.data.s = 1; drawField(); note(r, 'till', {}, '畑を耕した'); } break;
      case 'plant': if (tk.data.s === 1) { tk.data.s = 2; tk.data.at = clockMs; drawField(); note(r, 'plant', {}, '種をまいた'); } break;
      case 'haul': if (village.raft.parts > 0 && !village.raft.hauled) { village.raft.hauled = true; drawRaft(); note(r, 'haul', {}, '台風に備えて、筏を浜の上へ引き上げた'); } break;
      case 'harvest-early': if (tk.data.s === 2 && growth(tk.data) >= 0.6) { const ripe = growth(tk.data) >= 1; tk.data.s = 1; r.stats.food += ripe ? 4 : 2; drawField(); village.prepSaved.push('畑の実'); note(r, 'harvest', { food: r.stats.food }, `台風に備えて、畑の実を${ripe ? '' : '早めに'}収穫した`); } break;
      case 'harvest': if (tk.data.s === 2 && growth(tk.data) >= 1) { tk.data.s = 1; r.stats.food += 4; drawField(); note(r, 'harvest', { food: r.stats.food }, '畑で収穫した'); } break;
      case 'fire': return;   // (they stay round it until it is time to go)
      case 'forage': {
        // up with something: roll over and eat it; or nothing this time: down again at the same place — or, after
        // enough empty dives, give it up there (how it went is told when the spell is over)
        const d = tk.data ?? {}, b: NonNullable<Resident['mo']['bout']> = (r.mo.bout ??= { patch: d.patch, tries: 0, got: 0, weak: 0, full: full(r) });
        if (tk.opt) { b.opt ??= tk.opt; tk.reported = true; }
        b.tries++; if (d.weak) b.weak++; if (d.prey) b.got++;
        const prey = d.prey as Prey | '';
        if (prey) { r.task = task('eat', [r.pos.x, r.pos.z], prey === 'clam' ? 'work' : 'eat', prey === 'clam' ? rr(60, 120) : prey === 'crab' ? rr(70, 130) : rr(50, 100), { wet: true, data: prey, arrived: true }); return; }
        if (d.weak) pops.push({ r, text: '空振り', k: 'bad', born: performance.now() });
        const p = patchById(b.patch);
        if (!p || b.tries - b.got >= 4) { endBout(r); return; }
        r.task = forage(nearPatch(p), p, r); return;
      }
      case 'eat': {
        const prey = tk.data as Prey;
        r.hunger = Math.max(0, r.hunger - (FILLS[prey] ?? 0.12));
        r.meal[prey] = (r.meal[prey] ?? 0) + 1; if (prey === 'clam') r.stats.cracked++;
        const b = r.mo.bout, p = patchById(b?.patch);
        if (r.hunger > 0.12 && b && p && b.tries < 10) { r.task = forage(nearPatch(p), p, r); return; }
        endBout(r); return;
      }
      case 'groom': if (Math.random() < 0.25) note(r, 'groom', {}, '毛づくろいをした'); break;
      case 'graze': { r.stats.notes++; const sg = sight(r); note(r, 'graze', { sight: sg.text }, tk.data?.empty ? '藻場の海草が食べ尽くされていた' : 'ラグーンで海草を食べた', sg.obs); break; }
      case 'bask': note(r, 'bask', {}, '浜で甲羅干しをした'); break;
      // asking, giving, telling, answering (ADR 0004 §6): each a thing the world records
      case 'photo': {
        // (the shot: its own eyes, looking at it, the others where they are — kept to be drawn again exactly)
        const ob0 = tk.data?.ob, fr = ob0?.kind === 'friend' ? byId[ob0.id] : null, ob = fr ? { ...ob0, x: fr.pos.x, z: fr.pos.z } : ob0; if (!ob || photosOn(r, dayOf(clockMs)).length >= PHOTOS_PER_DAY) { tk.failed = 'unavailable'; break; }
        const sn = res.sense(r), day = dayOf(clockMs), n = photosOn(r, day).length + 1;
        const ty = ob.kind === 'friend' ? (byId[ob.id]?.pos.y ?? L.h(ob.x, ob.z)) + 0.4 : L.h(ob.x, ob.z) + (ob.kind === 'place' ? 0.8 : ob.kind === 'young-tree' ? 1.2 : 0.15);
        const rec: PhotoRecord = { id: `${r.id}-${day}-${n}`, who: r.id, day, at: clockMs, eye: [sn.eye.x, sn.eye.y, sn.eye.z], look: [ob.x, ty, ob.z],
          subject: { id: ob.id, kind: ob.kind, label: ob.label.replace(/（.*?）$/, '') }, why: agentOf(r)?.goal?.text,
          others: list.filter((o) => o !== r).map((o) => ({ id: o.id, x: +o.pos.x.toFixed(2), y: +o.pos.y.toFixed(2), z: +o.pos.z.toFixed(2), head: +o.head.toFixed(3), act: o.act, holding: o.holding })) };
        (r.photos ??= []).push(rec); if (r.photos.length > 40) r.photos.shift();
        r.diary.push({ at: clockMs, text: `写真を撮った：${rec.subject.label}`, key: 'photo' }); if (r.diary.length > 800) r.diary.shift();
        res.onEvent('photo', `${r.v.name}が${rec.subject.label}の写真を撮った`, r);
        break;
      }
      case 'say': {
        const o = byId[tk.data.to]; if (!o || o.talk) { tk.failed = 'unavailable'; break; }
        const kind = tk.data.kind, c = exchange(r, o);
        (r.saidAt ??= {})[`${kind}:${tk.data.what}:${o.id}`] = clockMs;
        let what: string;
        if (kind === 'offer') {
          // (Dot's answer, as things are: wood in hand, or the hut done — no need; else yes, and it is as if Dot had asked)
          utter(r, { act: 'offer-help', to: 'dot', what: 'wood' }, 0, c);
          const why = o.holding === 'wood' ? 'has-wood' : o.stats.built >= HUT.length ? 'hut-done' : '';
          utter(o, why ? { act: 'decline-help', why } : { act: 'accept-help' }, 2200, c);
          if (!why) {
            const q: Request = { id: `req#${++reqN}`, from: o.id, to: r.id, what: 'bring-wood', at: clockMs, status: 'accepted', conv: c };
            requests.push(q); if (requests.length > 30) requests.shift();
            const a = agentOf(r); if (a) a.why = `申し出た：${o.v.name}に流木を届ける（${q.id}）`;
          }
          what = why ? '「流木を運ぼうか」と申し出たが、いらないと言われた' : '「流木を運ぼうか」と申し出て、頼まれた';
        } else if (kind === 'found') {
          utter(r, { act: 'found', what: 'drift' }, 0, c); utter(o, { act: 'noted' }, 2200, c);
          if (drift.kind >= 0) agentOf(o)?.hear({ id: 'drift', kind: 'unknown', label: '浜に打ち上げられた見慣れないもの', x: drift.x, z: drift.z, dist: Math.hypot(drift.x - o.pos.x, drift.z - o.pos.z), at: clockMs }, r.id, `${r.v.name}によると、浜に見慣れないものがある`, clockMs);
          what = '浜に見慣れないものがあると知らせた';
        } else {
          utter(r, kind === 'warn' ? { act: 'warn', what: tk.data.what } : { act: 'plan', doing: tk.data.what }, 0, c); utter(o, { act: 'noted' }, 2200, c);
          what = kind === 'warn' ? `「${WARN_JA[tk.data.what]}」と知らせた` : `これから${PLAN_JA[tk.data.what]}と伝えた`;
        }
        r.diary.push({ at: clockMs, text: `${o.v.name}に${what}`, key: 'mind' });
        res.onEvent('say', `${r.v.name}が${o.v.name}に${what}`, r);
        break;
      }
      case 'ask': {
        const o = byId[tk.data.to]; if (!o) { tk.failed = 'unavailable'; break; }
        const q: Request = { id: `req#${++reqN}`, from: r.id, to: o.id, what: tk.data.what, at: clockMs, status: 'open' };
        requests.push(q); if (requests.length > 30) requests.shift();
        q.conv = exchange(r, o); utter(r, { act: 'ask-bring', to: o.id as Who, what: 'wood' }, 0, q.conv);
        note(r, 'mind', {}, `${o.v.name}に流木を頼んだ`); r.diary.push({ at: clockMs, text: `${o.v.name}に、流木を届けてほしいと頼んだ`, key: 'mind' });
        const oa = agentOf(o); if (oa) { oa.asked(q, r.v.name); flushMind(o, oa); } else answer(o, q, false, '聞いていなかった');
        break;
      }
      case 'answer': answer(r, tk.data.q, tk.data.yes, tk.data.reason); break;
      case 'give': {
        const o = byId[tk.data.to];
        if (!o || r.holding !== 'wood' || o.holding) { tk.failed = 'unavailable'; break; }
        r.holding = ''; o.holding = 'wood'; if (o.id === 'dot') o.stats.wood = 1;
        (o as any).gotWood = { from: r.id, at: clockMs };   // (what it becomes is told back: feedback, below)
        const q = requests.find((x) => x.from === o.id && x.to === r.id && x.status === 'accepted'); if (q) q.status = 'done';
        { const c = exchange(r, o); utter(r, { act: 'hand-over', what: 'wood' }, 0, c); utter(o, { act: 'received', what: 'wood' }, 2200, c); }
        r.diary.push({ at: clockMs, text: `${o.v.name}に流木を手渡した`, key: 'mind' });
        agentOf(o)?.hear({ id: 'wood:given', kind: 'held', label: '受け取った流木', x: o.pos.x, z: o.pos.z, dist: 0, at: clockMs }, r.id, `${r.v.name}が流木を届けてくれた`, clockMs);
        res.onEvent('give', `${r.v.name}が${o.v.name}に流木を手渡した`, r);
        break;
      }
      case 'tell': {
        const o = byId[tk.data.to], ob = agentOf(r)?.seen.get(tk.data.item), oa = o && agentOf(o);
        if (!o || !ob || !oa) { tk.failed = 'unavailable'; break; }
        oa.hear(ob, r.id, `${r.v.name}によると、${ob.label}が${Math.round(Math.hypot(ob.x - o.pos.x, ob.z - o.pos.z))}mほど先にある`, clockMs);
        { const c = exchange(r, o), k = ob.kind === 'shell' ? 'shell' : 'wood'; utter(r, { act: 'tell-where', what: k, metres: Math.hypot(ob.x - o.pos.x, ob.z - o.pos.z) }, 0, c); utter(o, { act: 'noted' }, 2200, c); }
        r.diary.push({ at: clockMs, text: `${o.v.name}に、${ob.label}のある場所を教えた`, key: 'mind' });
        res.onEvent('tell', `${r.v.name}が${o.v.name}に${ob.label}の場所を教えた`, r);
        break;
      }
      case 'collect':
        if (!items.take(tk.data)) { tk.failed = 'gone'; break; }
        r.holding = 'shell';
        if (agentOf(r)) { r.task = null; return; }   // (its next step is its own to choose)
        // (straight to the pile with it: no admiring it, no showing it off — ADR 0004, addendum 2026-10-04)
        r.task = task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3); return;
      case 'show': if (agentOf(r)) break; r.task = task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3); return;   // (and on to the pile with it: it keeps what it found)
      case 'pile': if (r.holding !== 'shell') break; r.holding = ''; r.stats.shells++; buildPile(); note(r, 'collect', {}, `貝殻を浜に並べた（${r.stats.shells}個）`); break;
      case 'survey': if (village.pier === 'plan') { village.pier = 'build'; drawPier(); note(r, 'survey', {}, '桟橋の位置を測った'); res.onEvent('pier', 'カメマルが桟橋の位置を測り終えた。いよいよ建設開始', r); } break;
      case 'inspect': r.today.push('桟橋の工事を見守った'); break;
      case 'base': if (r.holding !== 'stone' || village.bases >= 4) break; r.holding = ''; launch(r, bases[village.bases], fast); village.bases++; drawPierSoon(); note(r, 'base', {}, '桟橋の土台石を据えた'); break;
      case 'post': if (r.holding !== 'wood' || village.posts >= village.bases) break; r.holding = ''; launch(r, posts[village.posts], fast); village.posts++; drawPierSoon(); note(r, 'post', {}, '桟橋の柱を立てた'); break;
      case 'deck':
        if (r.holding !== 'plank' || village.deck >= 8) break; r.holding = ''; launch(r, planks[village.deck], fast); village.deck++; drawPierSoon();
        if (village.deck >= 8) { village.pier = 'done'; for (const o of list) note(o, 'pierDone', {}, '桟橋が完成した（共同作業）'); res.onEvent('pier', '桟橋が完成した。みんなでつくった、はじめての大きなもの', r); }
        else note(r, 'deck', {}, '桟橋の板を張った');
        break;
      case 'find':
        if (drift.kind < 0 || drift.by !== r.id) { tk.failed = 'gone'; break; }
        r.holding = 'drift'; driftMesh.visible = false; r.task = null;
        r.today.push(`浜で${DRIFT[drift.kind].ja}を見つけた`); note(r, 'find', { thing: DRIFT[drift.kind].ja }); res.onEvent('drift', `${r.v.name}が浜で${DRIFT[drift.kind].ja}を見つけた`, r); return;
      case 'shelve':
        if (r.holding !== 'drift') { tk.failed = 'unavailable'; break; }
        r.holding = ''; village.treasures.push({ what: DRIFT[drift.kind].ja, who: r.v.name, at: clockMs }); drift.kind = -1; drift.t = 0; drawShelf(); break;
      case 'fetch':
        if (!items.take(tk.data)) break;
        r.holding = tk.data.kind ?? 'stone'; r.task = null; return;   // (decide() takes it on: a stone to the cairn, a coconut to the shelf)
      case 'catcher': {
        const b = shelfLots().find((l) => l.materialId === 'bamboo' && !(l as any).reservedBy && l.amount.value >= CATCH_BAMBOO);
        if (village.catcher || !b) break;
        b.amount.value -= CATCH_BAMBOO; if (b.amount.value <= 0) delete lab.lots[b.lotId]; lab.world.worldVersion++;
        village.catcher = { at: clockMs, areaM2: CATCH_AREA, capMg: CATCH_CAP }; showCatcher(); drawStore();
        note(r, 'catcher', {}, `雨受けを作った（竹${CATCH_BAMBOO / 1e6}kgと葉。受ける広さ${CATCH_AREA}㎡、竹筒に${CATCH_CAP / 1e6}Lまで）`);
        break;
      }
      case 'store': {
        // (a coconut onto the shelf by the hut: the world makes it a lot, as it is — its mass on the scale, and now and then one
        // that has gone bad inside, which Lantern finds when it lifts it and leaves it: ADR 0006, owner's decision 2026-10-06)
        if (r.holding !== 'coconut') break;
        r.holding = '';
        if (Math.random() < COCONUT_BAD) { note(r, 'coconut-bad', {}, 'ヤシの実は中が腐っていた（棚に置かなかった）'); break; }
        const mg = Math.round((1.15 + Math.random() * 0.7) * 1e6), n = storeCoconut(mg);
        note(r, 'coconut', {}, `ヤシの実を棚に置いた（${(mg / 1e6).toFixed(2)}kg。棚に${n}個）`);
        drawStore(); break;
      }
      case 'stack': {
        if (r.holding !== 'stone') break;
        r.holding = '';
        let c = tk.data as number[] | null;
        if (!c || !cairnSpots.includes(c)) { c = [r.pos.x + 0.7, r.pos.z, 0]; cairnSpots.push(c); }
        c[2]++; buildCairns();
        if (c[2] >= 4) { r.stats.cairns++; note(r, 'cairn'); }
        break;
      }
      case 'float': note(r, 'float', {}, '沖で浮いて休んだ'); break;
      case 'nap': note(r, 'nap', {}, '浮いたまま昼寝した'); break;
      case 'doze': {   // (asleep on the water, it went with it: awake somewhere else)
        if (r.id === 'rakko' && r.wet) { const at = spot([r.pos.x, r.pos.z], 80, water(0.8, 6)); if (at && Math.hypot(at[0] - r.pos.x, at[1] - r.pos.z) > 25) { r.pos.x = at[0]; r.pos.z = at[1]; placeY(r); r.diary.push({ at: clockMs, text: '目が覚めたら、流されて知らない場所にいた', key: 'body' }); } }
        break;
      }
      case 'charge': note(r, 'charge'); break;
      case 'house': {
        const s = houseNext(), h = village.house; if (!s || houseMissing(r)) { tk.failed = 'unavailable'; break; }
        const repair = h.lost > 0 && h.n >= ROOF_N, k = repair ? ROOF_N - h.lost : h.n;
        h.rope -= s.rope; if (s.need === 'piece' || s.need === 'grass') r.holding = '';
        if (s.need === 'bamboo') h.bamboo -= HOUSE_BAMBOO; if (s.need === 'clay') h.clay -= HOUSE_CLAY;
        if (repair) h.lost--; else h.n++;
        drawHouse();
        const part = houseLook.parts[k]; if (part instanceof THREE.Mesh && !fast) { part.visible = false; launch(r, part, fast); }
        tk.data = { ...(tk.data ?? {}), reward: 1 };
        note(r, 'house', {}, repair ? '台風で飛んだ茅を葺き直した' : `${s.ja}（${h.n}/${HOUSE_N}）`);
        const big = repair ? '' : h.n === ROOF_N ? '家の屋根が葺き上がった。もう雨は中に入らない' : h.n === WALLS_N ? '家の土壁が塗り上がった。風も中に入らない' : h.n === HOUSE_N ? '家ができた。床とランタンの台まで' : '';
        if (big) { note(r, 'house', {}, big); res.onEvent('house', `${r.v.name}：${big}`, r); }
        break;
      }
      case 'stow': if (r.holding !== 'piece') { tk.failed = 'unavailable'; break; } r.holding = ''; village.spare++; drawSpare(); note(r, 'craft', {}, `削った部材を作業台の脇に置いた（${village.spare}本）`); break;
      case 'take': if (r.holding || village.spare <= 0) { tk.failed = 'unavailable'; break; } village.spare--; r.holding = 'piece'; drawSpare(); break;
      case 'pit': if (!village.clayPit && !digPit(r)) tk.failed = 'unavailable'; break;
      case 'fell': {
        const t = T.forest?.fell(tk.data.x, tk.data.z); if (!t) { tk.failed = 'gone'; break; }
        const dir = Math.atan2(t.x - r.pos.x, t.z - r.pos.z), fx = Math.sin(dir), fz = Math.cos(dir), n = t.h > 7 ? 3 : 2;
        if (!fast) fallFrom(t, dir);
        for (let k = 0; k < n; k++) items.addAt('wood', t.x + fx * (1.2 + k * 1.1), t.z + fz * (1.2 + k * 1.1));   // (the logs lie where it fell)
        { const mg = Math.round((6 + Math.random() * 6) * 1e6); addLot(lab, { materialId: 'firewood', amount: { value: mg, unit: 'mg' }, quality: { water_ppm: GREEN_WOOD_WATER }, location: 'shelf' }); drawStore(); }
        village.felled.push({ x: t.x, z: t.z, h: +t.h.toFixed(1), kind: t.kind, at: clockMs }); drawStump(t.x, t.z); r.stats.felled++;
        const ww = windward(t.x, t.z);
        note(r, 'chop', {}, `林の${KIND_JA[t.kind] ?? '木'}を切り倒した（高さ約${Math.round(t.h)}m。丸太${n}本、枝は薪にして棚の脇へ。まわりが開けた）${ww ? `。家の風上の木だった（風上で切った木 ${windbreakFelled()}本）` : ''}`);
        res.onEvent('chop', `${r.v.name}が林の木を切り倒して、土地を開いた`, r);
        break;
      }
      case 'seastone':
        r.holding = 'stone'; r.today.push(tk.data?.for === 'nest' ? '休み場の囲いにする石を海の底から拾った' : tk.data?.for === 'ledge' ? 'カメマルの岩棚に置く石を海の底から拾った' : 'ドットの石垣にする石を海の底から拾った'); if (r.today.length > 6) r.today.shift();
        if (agentOf(r)) { r.task = null; return; }   // (its next step is its own to choose)
        r.task = (tk.data?.for === 'nest' ? nestTask(r) : tk.data?.for === 'ledge' ? ledgeTask(r) : dropTask(r)) ?? nestTask(r) ?? ledgeTask(r) ?? dropTask(r); if (r.task) return; break;
      case 'ledge': {
        if (r.holding !== 'stone' || !ledgeWanted()) break;
        r.holding = ''; village.ledge.n++; drawLedge();
        if (village.ledge.n >= LEDGE_N) {
          note(r, 'nest', {}, `カメマルの岩棚の沖側に石を${LEDGE_N}個置いた。うねりが岩棚の下に入りにくくなった`);
          note(byId.kame, 'nest', {}, 'ラッコが岩棚の沖側に石を並べてくれた。荒れた日も、寝場所に入るうねりが弱い');
          res.onEvent('nest', 'ラッコがカメマルの岩棚のまわりに石を並べた。荒れた日も、カメマルの寝場所は波が静か', r);
        } else note(r, 'nest', {}, `カメマルの岩棚のまわりに石を置いた（${village.ledge.n}/${LEDGE_N}）`);
        break;
      }
      case 'nest': {
        if (r.holding !== 'stone' || village.nest.n >= NEST_N) break;
        r.holding = ''; village.nest.n++; drawNest();
        if (village.nest.n >= NEST_N) { note(r, 'nest', {}, `石の囲いができた（${NEST_N}個）。内側は波が静かで、荒れた日はここで休める`); res.onEvent('nest', 'ラッコの休み場ができた。サンゴ石の囲いの内側は、荒れた日も波が静か', r); }
        else note(r, 'nest', {}, `休み場の囲いに石を積んだ（${village.nest.n}/${NEST_N}）`);
        break;
      }
      case 'stonedrop':
        if (r.holding !== 'stone') break;
        r.holding = ''; village.wall.pile++; drawWall(); note(r, 'wall', {}, `ドットの家の石垣にする石を浜の石置き場に運んだ（いま${village.wall.pile}個）`); break;
      case 'wallfetch':
        if (village.wall.pile <= 0 || r.holding) { tk.failed = 'gone'; break; }
        village.wall.pile--; r.holding = 'stone'; drawWall();
        if (agentOf(r)) { r.task = null; return; }
        r.task = wallTask(r); if (r.task) return; break;
      case 'wall': {
        if (r.holding !== 'stone' || wallDone()) break;
        r.holding = ''; village.wall.n++; drawWall();
        if (wallDone()) { note(r, 'wall', {}, `家の風上に石垣を積み上げた（${WALL_N}個、高さ約1.2m。モルタルなしの空積み）。台風でも茅が飛ばない`); res.onEvent('house', `${r.v.name}：家の石垣ができた。台風の風上を守る`, r); }
        else note(r, 'wall', {}, `石垣に石を積んだ（${village.wall.n}/${WALL_N}）`);
        break;
      }
      case 'tool': makeTool(r, tk.data?.kind); break;
      case 'stackwood': stackWood(r); break;
      case 'assemble': if (tk.data?.as === 'dish') makeLampDish(r, tk.data?.lotId); else makeCookPot(r, tk.data?.lotId); break;
      case 'wick': makeWick(r, tk.data?.fiber); break;
      case 'twist': village.house.rope += 10; note(r, 'house', {}, `アダンの気根の繊維をよって縄をなった（10m。いま${village.house.rope}m）`); break;
      case 'cut': r.holding = 'grass'; note(r, 'house', {}, '茅にする草を刈って束ねた'); break;
      case 'weigh': if (!village.house.weighed) { village.house.weighed = true; village.prepSaved.push('家の屋根'); note(r, 'house', {}, '台風に備えて、家の屋根に重しの竿を渡して縛った'); } break;
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

  // a soft shade on the sand under a resident settled on the bottom (the water gives no shadows of its own)
  const shadeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const shades = list.map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15), new THREE.MeshBasicMaterial({ color: 0x0a1a18, alphaMap: shadeTex, transparent: true, opacity: 0.3, depthWrite: false })); m.visible = false; m.renderOrder = 1; group.add(m); return m; });

  /* ---------- getting about ---------- */
  // what it costs to cross a metre of the island on foot: the sea cannot be walked; growth above the waist
  // (a thicket of naupaka or pandanus, a boulder, the forest's undergrowth) it goes round when it can
  const WAIST = 0.45;
  // (one that swims: the sea and a lagoon are its way too)
  const swimCost = (x: number, z: number) => G(x, z) < 0.2 ? (G(x, z) >= 0 || !T.water || ['sea', 'lagoon'].includes(T.water(x, z)) ? 1 : Infinity) : (() => { const v = T.vegH ? T.vegH(x, z, 0.6) : 0; return v > WAIST ? 30 : 1 + v; })();
  const walkCost = (x: number, z: number) => {
    if (G(x, z) < 0.3) return Infinity;   // (a little clear of the water's edge, so the way between two points stays dry)
    const v = T.vegH ? T.vegH(x, z, 0.6) : 0;
    return v > WAIST ? 30 : 1 + v;
  };
  // (the water's edge too, at a price: the way out for one that has come down onto a strip of it)
  const edgeCost = (x: number, z: number) => G(x, z) < 0.2 ? Infinity : G(x, z) < 0.3 ? 6 : walkCost(x, z);
  const wadeCost = (x: number, z: number) => G(x, z) < -0.6 ? Infinity : G(x, z) < 0.2 ? 8 : edgeCost(x, z);
  // Lantern, picking its way: it would rather go round a steep bit than up it, and round anywhere it has
  // tried the footing and found it would not do (its four long legs are sure on the level, careful on a slope)
  const lanternCost = (bad: [number, number][]) => (x: number, z: number) => {
    const c = walkCost(x, z); if (!isFinite(c)) return c;
    for (const [bx, bz] of bad) if (Math.hypot(x - bx, z - bz) < 2.5) return 40;
    const sl = Math.hypot(G(x + 0.8, z) - G(x - 0.8, z), G(x, z + 0.8) - G(x, z - 0.8)) / 1.6;
    return c + (sl > 0.9 ? 30 : sl * 2.5);
  };
  // where its feet would be at (x, z): on the ground (or the pier's deck), or, in the water, where it is now
  const feetAt = (r: Resident) => (x: number, z: number) => r.wet ? r.pos.y : G(x, z);
  // a place it can stand: dry ground for one that walks; for one that swims, the sea or a lagoon too
  const standOn = (r: Resident, wet: boolean) => (x: number, z: number) => G(x, z) > 0.2 || (r.sp.swims && wet && (!T.water || ['sea', 'lagoon'].includes(T.water(x, z))));
  function move(r: Resident, tx: number, tz: number, dt: number, wetTask: boolean, fast = false) {
    // (in the house and through its door, a wide one draws itself in — Lantern folds its long legs — to pass a door 0.9 m wide)
    const B0 = bodyOf(r), B = !fast && inHouseWay(r.pos.x, r.pos.z) ? { ...B0, r: Math.min(B0.r, 0.3) } : B0, feet = feetAt(r);
    // not into the middle of something solid: to just outside it, on the near side (an approach point; worked
    // out again when what it is going to has moved)
    if (!fast) {
      const g = r.goal;
      if (!g || Math.hypot(g.tx - tx, g.tz - tz) > 0.25) {
        const ap = solids.approach(tx, tz, B, feet, r.pos.x, r.pos.z, (x, z) => standOn(r, wetTask)(x, z) || Math.hypot(x - tx, z - tz) < 0.05);
        r.goal = { tx, tz, x: ap ? ap[0] : tx, z: ap ? ap[1] : tz, none: !ap };
        // (a walker going to something lower than it can walk to — a log at the water's edge: to where it can stand within
        // reach of it, the way there planned as any other; none within reach — out in the water, on a bar — nowhere to stand,
        // said at once, not found out by half an hour of turning back from the sea. Owner's watch, 2026-10-09.)
        if (ap && !(r.sp.swims && wetTask) && G(r.goal.x, r.goal.z) < 0.3) {
          let best: [number, number] | null = null, bd = 1e9;
          for (let d = 0.4; d <= 1.4 && !best; d += 0.25) for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28, x = r.goal.x + Math.cos(a) * d, z = r.goal.z + Math.sin(a) * d, dd = Math.hypot(x - r.pos.x, z - r.pos.z); if (G(x, z) >= 0.3 && !solids.hit(x, z, B, G(x, z)) && dd < bd) { bd = dd; best = [x, z]; } }
          if (best) { r.goal.x = best[0]; r.goal.z = best[1]; } else if (G(r.goal.x, r.goal.z) < 0.2) r.goal.none = true;
        }
      }
      if (r.goal!.none) { r.went = 'nowhere to stand'; r.blocked = 99; r.walk = 0; return false; }
      tx = r.goal!.x; tz = r.goal!.z;
    }
    const dx0 = tx - r.pos.x, dz0 = tz - r.pos.z, d0 = Math.hypot(dx0, dz0);
    if (d0 < 0.6) { r.path = undefined; r.went = 'arrived'; return true; }
    // on land, to somewhere on land: plan a way round what is in the way (again if the goal has moved off).
    // Round what is solid for its body, however short the walk: a short way that is clear goes straight; and no
    // way at all is no way (it does not set off straight at it instead).
    let ax = tx, az = tz;
    // (a swimmer from the land into the sea, or out of it: a way planned too, across the water as well — not straight
    // at the sea through a stand of trees, wedged among their trunks)
    const swimWay = r.sp.swims && wetTask && (G(r.pos.x, r.pos.z) > 0.2) !== (G(tx, tz) > 0.2);
    // (in the house, or at its door: straight — the room is clear, and a grid a metre to the cell finds no way through a door
    // under a metre wide; Lantern, living in the house, was shut in by its walls — life-run 2026-10-09)
    if (!fast && inHouseWay(r.pos.x, r.pos.z)) { r.path = { pts: [[tx, tz]], tx, tz, t: clockMs, house: true } as any; }
    else if (!fast && ((G(r.pos.x, r.pos.z) > 0.2 && G(tx, tz) > 0.2) || swimWay)) {
      const P = r.path;
      // (a way planned to the same place a moment ago, dropped since because it was pushed back off a trunk: that way again,
      // not the whole island searched anew — up to six times a second while wedged; life-run 2026-10-09)
      const LP = (r.mo as any).lastPlan as { t: number; tx: number; tz: number; pts: [number, number][] | null } | undefined;
      if (!P && LP && clockMs - LP.t < 5000 && Math.hypot(LP.tx - tx, LP.tz - tz) < 1) {
        if (!LP.pts) { r.path = undefined; r.went = 'no way'; r.blocked = 99; r.walk = 0; return false; }
        r.path = { pts: LP.pts.map((q) => [q[0], q[1]] as [number, number]), tx, tz, t: clockMs };
      }
      else if (!P || (P as any).house || (Math.hypot(P.tx - tx, P.tz - tz) > 4 && clockMs - P.t > 3000)) {   // (out of the house: a way planned afresh)
        const C = Math.min(4, Math.max(1, d0 / 160)), pad = Math.min(0.5, C * 0.5), wide = { ...B, r: B.r + pad };
        const base = r.id === 'lantern' ? lanternCost(r.mo.bad) : swimWay ? swimCost : walkCost;
        const costFor = (body: typeof B, f = base) => (x: number, z: number) => { const c = f(x, z); return isFinite(c) && solids.hit(x, z, body, G(x, z)) ? Infinity : c; };
        // (a long way keeps a margin round what is solid; where the only way is a narrow gap, it goes through at its own width)
        const pts = d0 <= 2 && !solids.along(r.pos.x, r.pos.z, tx, tz, B, G) && isFinite(base((r.pos.x + tx) / 2, (r.pos.z + tz) / 2)) ? [[tx, tz]] as [number, number][] : findPath(r.pos.x, r.pos.z, tx, tz, costFor(wide)) ?? (pad > 0 ? findPath(r.pos.x, r.pos.z, tx, tz, costFor(B)) : null)
          ?? (B !== BODY[r.id] ? findPath(r.pos.x, r.pos.z, tx, tz, costFor(BODY[r.id])) : null)
          ?? (r.sp.swims && base !== swimCost ? findPath(r.pos.x, r.pos.z, tx, tz, costFor(B, swimCost)) : null)
          ?? (G(r.pos.x, r.pos.z) < 0.3 ? findPath(r.pos.x, r.pos.z, tx, tz, costFor(BODY[r.id], edgeCost)) : null)   // (on the strip by the water's edge, where the dry way does not reach: along the edge as it came)
          ?? (d0 > 20 ? findPath(r.pos.x, r.pos.z, tx, tz, costFor(BODY[r.id], r.sp.swims ? swimCost : edgeCost), true) : null)
          ?? (!r.sp.swims && G(r.pos.x, r.pos.z) < 0.2 ? findPath(r.pos.x, r.pos.z, tx, tz, costFor(BODY[r.id], wadeCost), true) : null);   // (a walker found standing in the shallows: it wades back to the land, not stopped there for want of a dry way)   // (and last, the long way round: back the way it came, round a bay — life-run 2026-10-09)   // (one that swims, with no way on foot: round by the water — it came ashore where the land does not join up)   // (a log carried makes it wider: where only its own width goes through — the way it came in — the log is dragged through)
        (r.mo as any).lastPlan = { t: clockMs, tx, tz, pts: pts ? pts.map((q) => [q[0], q[1]]) : null };
        if (!pts) { r.path = undefined; r.went = 'no way'; r.blocked = 99; r.walk = 0; return false; }
        r.path = { pts, tx, tz, t: clockMs };
      }
      const pts = r.path!.pts;
      while (pts.length > 1 && Math.hypot(pts[0][0] - r.pos.x, pts[0][1] - r.pos.z) < 0.9) pts.shift();
      if (pts.length > 1 || Math.hypot(r.path!.tx - tx, r.path!.tz - tz) < 4) { ax = pts[0][0]; az = pts[0][1]; }
    } else r.path = undefined;
    // (a walker that has come to be standing in the water — pushed off the edge by a trunk: a step up toward the land is allowed)
    const g0 = G(r.pos.x, r.pos.z), upOut = (x: number, z: number) => !r.sp.swims && g0 <= 0.2 && G(x, z) > g0 + 0.005;
    const dx = ax - r.pos.x, dz = az - r.pos.z, d = Math.max(Math.hypot(dx, dz), Math.min(d0, 0.7));
    let want = Math.atan2(dx, dz);
    const inWater = G(r.pos.x, r.pos.z) < 0.1;
    const speed = (inWater ? r.sp.swimSpeed || 0.3 : r.sp.speed) * (r.battery < 0.1 ? 0.5 : 1) * (r.id === 'kame' && r.hunger > NEEDS.slowAt ? 0.6 : 1) * wearSlow(r);   // (a hungry turtle is a slow one; a worn robot too)
    // walkers keep to land: if the way ahead is water, turn uphill along the shore (not when following a
    // planned way, which already keeps to the land: the two would pull it to and fro)
    if (!r.path && (!r.sp.swims || (!wetTask && !inWater))) {
      // (looking no further ahead than where it is going, and the water's edge where that is lower than it: a log
      // left at the tideline a step away is not 'the sea ahead' — owner's watch, 2026-10-09)
      const look = Math.min(2, Math.max(0.5, d0)), ax = r.pos.x + Math.sin(want) * look, az = r.pos.z + Math.cos(want) * look;
      if (G(ax, az) < Math.min(0.25, G(tx, tz) - 0.03) && !(r.sp.swims && wetTask)) {
        const gx = L.h(r.pos.x + 1.5, r.pos.z) - L.h(r.pos.x - 1.5, r.pos.z), gz = L.h(r.pos.x, r.pos.z + 1.5) - L.h(r.pos.x, r.pos.z - 1.5);
        const up = Math.atan2(gx, gz), side = want + (Math.sin(want - up) > 0 ? 1.2 : -1.2);
        want = Math.abs(gx) + Math.abs(gz) > 0.01 ? side : want + 1.5;
        r.blocked += dt;
      }
    }
    let dh = want - r.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    // Lantern, where the ground ahead changes (a step, the start of a steep bit): it stops, tips its light down
    // to the next foothold, reaches out a fore foot and tries it, and only then goes on, or, if it will not
    // do, backs off and thinks of another way (twice, and it gives up and goes somewhere else). On the level
    // it does not do this; on a long even slope, once at the start.
    if (r.id === 'lantern' && !fast && !inWater) {
      const mo = r.mo;
      if (mo.probe >= 0) {
        mo.probe += dt / 1.6; r.walk = 0;
        if (mo.probe >= 1) {
          mo.probe = -1; mo.since = 0;
          const fx = Math.sin(r.head), fz = Math.cos(r.head), sa = (G(r.pos.x + fx * 0.9, r.pos.z + fz * 0.9) - G(r.pos.x + fx * 0.3, r.pos.z + fz * 0.3)) / 0.6;
          if (Math.abs(sa) > 0.9) { mo.bad.push([r.pos.x + fx * 1.2, r.pos.z + fz * 1.2]); if (mo.bad.length > 12) mo.bad.shift(); r.path = undefined; r.head += Math.PI * 0.15; if (++mo.fails >= 2) r.blocked = 99; }
        }
        return false;
      }
      if (mo.since > 4 && Math.cos(dh) > 0.9) {
        const fx = Math.sin(r.head), fz = Math.cos(r.head), here = G(r.pos.x, r.pos.z);
        const sh = (here - G(r.pos.x - fx * 0.5, r.pos.z - fz * 0.5)) / 0.5, sa = (G(r.pos.x + fx * 0.9, r.pos.z + fz * 0.9) - G(r.pos.x + fx * 0.3, r.pos.z + fz * 0.3)) / 0.6;
        // (or something low underfoot just ahead, a rock or a tussock it will have to step onto)
        const low = T.vegH ? T.vegH(r.pos.x + fx * 0.7, r.pos.z + fz * 0.7, 0.3) : 0, lowHere = T.vegH ? T.vegH(r.pos.x, r.pos.z, 0.3) : 0;
        if ((Math.abs(sa - sh) > 0.18 && Math.abs(sa) > 0.15) || (low > 0.12 && low < WAIST && lowHere < 0.08)) { mo.probe = 0; r.walk = 0; return false; }
      }
    }
    r.head += dh * Math.min(1, dt * 2.5);
    const step = Math.min(d, speed * dt) * Math.max(0, Math.cos(dh));
    let nx = r.pos.x + Math.sin(r.head) * step, nz = r.pos.z + Math.cos(r.head) * step;
    let moved = 0;
    // the step itself, against what is solid: not into it (one already inside — put down there by a save, or
    // by something built round it — may still step out). Held up, it edges round it, the way that still gets
    // it nearer; with no way round, it stops, and thinks again of the way from here.
    if (!fast && step > 0) {
      const over = (x: number, z: number) => { const h = solids.hit(x, z, B, feet(x, z)); return h ? h.r + B.r - Math.hypot(h.x - x, h.z - z) : 0; };
      const now = over(r.pos.x, r.pos.z);
      if (over(nx, nz) > now + 1e-4) {
        let best = -1, bx = 0, bz = 0;
        for (const da of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
          const hx = r.pos.x + Math.sin(r.head + da) * step, hz = r.pos.z + Math.cos(r.head + da) * step;
          if (over(hx, hz) > now + 1e-4 || !(r.sp.swims || G(hx, hz) > 0.2 || upOut(hx, hz))) continue;
          const gain = d0 - Math.hypot(tx - hx, tz - hz);
          if (best < 0 || gain > best) { best = Math.max(0, gain); bx = hx; bz = hz; }
        }
        if (best >= 0) { nx = bx; nz = bz; r.blocked += dt * 0.25; }
        else { r.walk = 0; r.blocked += dt; r.went = 'blocked'; if (r.path && clockMs - r.path.t > 2000) r.path = undefined; return false; }
      }
    }
    if (r.sp.swims || G(nx, nz) > 0.2 || upOut(nx, nz)) {
      r.pos.x = nx; r.pos.z = nz; moved = step;
      if (!fast && T.pushTrees) {
        // a trunk in the way: pushed back out of it. If that undoes the step, it is not getting on — think
        // of the way again from here (and in the end, of something else to do)
        const bx = r.pos.x, bz = r.pos.z; T.pushTrees(r.pos);
        const back = Math.hypot(r.pos.x - bx, r.pos.z - bz);
        if (back > step * 0.5) { moved = Math.max(0, step - back); r.blocked += dt; r.went = 'blocked'; if (r.path && clockMs - r.path.t > 2000) r.path = undefined; }
      }
    }
    else r.blocked += dt * 2;   // (the way ahead is water: it stops, rather than marching on the spot, and soon thinks again)
    r.walk = moved / Math.max(dt, 1e-3) / speed;   // (legs move only as fast as it really goes)
    r.mo.since += moved;
    // (getting on again: what held it up wears off, so only being stuck for a while makes it give up)
    if (moved > step * 0.8 && step > 0) { r.blocked = Math.max(0, r.blocked - dt * 0.5); if (r.went === 'blocked') r.went = undefined; }
    return false;
  }
  // what it looks at (for its body only; nothing in the world depends on it). The eyes go first and the body
  // follows: walking, a point a few metres on along its way, so its gaze reaches round a bend before it
  // turns; at work, its hands; talking, the other; at the fire, the fire; idle, now and then a glance at one
  // of the others nearby. Kept for a moment and a half at least, so it does not flick about.
  const AHEAD = 3, WORK = new Set(['work', 'pick', 'hammer', 'chop', 'dig', 'eat']);
  // In a conversation (two of them, or round the fire): saying a line, or hearing one; and the one Rakko
  // is showing its find to, seeing it (for the small sign as a line begins, and the nod a moment after)
  const firing = (o: Resident) => o.task?.kind === 'fire' && o.task.arrived;
  const shownBy = (r: Resident) => list.find((o) => o.task?.kind === 'show' && o.task.arrived && o.task.data === r.id);
  function beatOf(r: Resident): { role: 'speak' | 'listen'; t: number } | undefined {
    if (r.saying && (r.talk || firing(r))) return { role: 'speak', t: r.sayT };
    if (r.talk) { const o = r.talk.a === r ? r.talk.b : r.talk.a; return o.saying ? { role: 'listen', t: o.sayT } : undefined; }
    if (firing(r)) { const sp = list.find((o) => o !== r && o.saying && firing(o)); return sp ? { role: 'listen', t: sp.sayT } : undefined; }
    const sh = shownBy(r); return sh ? { role: 'listen', t: sh.mo.t - 1.2 } : undefined;
  }
  // Rakko, with a shell it has just found: someone close by, up and not busy, that it has not shown anything
  // to for a few minutes — it takes it over to show them
  function showTo(r: Resident): Resident | null {
    if (showCool > 0) return null;
    const ok = list.filter((o) => o !== r && !o.talk && o.act !== 'sleep' && !firing(o) && !o.wet && o.under < 0.2 && (shownTo[o.id] ?? -1e15) < clockMs && Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) < 14);
    return ok.sort((a, b) => Math.hypot(a.pos.x - r.pos.x, a.pos.z - r.pos.z) - Math.hypot(b.pos.x - r.pos.x, b.pos.z - r.pos.z))[0] ?? null;
  }
  function chooseLook(r: Resident, dt: number): [string, THREE.Vector3 | null] {
    const tk = r.task, mo = r.mo, v = new THREE.Vector3();
    const atHead = (o: Resident) => v.set(o.pos.x, o.pos.y + (o.id === 'kame' ? 0.25 : o.id === 'lantern' ? 0.6 : 0.6), o.pos.z);
    if (r.act === 'sleep') return ['', null];
    if (r.talk) { const o = r.talk.a === r ? r.talk.b : r.talk.a; return ['talk', atHead(o)]; }
    if (r.seen) return ['fish', v.copy(r.seen.pos)];
    if (mo.recheck > 0 && tk) return ['recheck', v.set(tk.x, G(tk.x, tk.z) + 0.2, tk.z)];   // (back to it: a look at what it was doing first)
    { const sh = shownBy(r); if (sh) { const fx = Math.sin(sh.head), fz = Math.cos(sh.head); return ['shown', v.set(sh.pos.x + fx * 0.4, sh.pos.y + 0.4, sh.pos.z + fz * 0.4)]; } }
    if (tk?.kind === 'show' && tk.arrived && byId[tk.data]) return ['show', atHead(byId[tk.data])];
    if (firing(r)) { const sp = list.find((o) => o !== r && o.saying && firing(o)); if (sp) return ['talk', atHead(sp)]; }
    if (mo.probe >= 0) { const fx = Math.sin(r.head), fz = Math.cos(r.head); return ['probe', v.set(r.pos.x + fx * 0.75, G(r.pos.x + fx * 0.75, r.pos.z + fz * 0.75), r.pos.z + fz * 0.75)]; }
    // Lantern, arrived somewhere it has been exploring toward: stopped, it looks one way and then the other
    // (its whole box turning, 20-35 degrees), and lingers on what there is to see — the drop of the ground,
    // a rise — then once more ahead; and again, in a different order
    if (r.id === 'lantern' && tk?.kind === 'explore' && tk.arrived) {
      if (mo.poi?.key !== mo.key) {
        let best = 0, bs = -1;
        for (let k = -4; k <= 4; k++) { const a = k * 0.15, x = r.pos.x + Math.sin(r.head + a) * 6, z = r.pos.z + Math.cos(r.head + a) * 6, sc = Math.abs(G(x, z) - r.pos.y) + (items.nearest('stone', x, z, 3, '') ? 0.6 : 0); if (sc > bs) { bs = sc; best = a; } }
        mo.poi = { key: mo.key, a: best };
      }
      const seg = Math.floor(mo.t / 3.2), side = variant(mo.key, 0) < 0.5 ? 1 : -1;
      const step = (seg + Math.floor(variant(mo.key, 1) * 4)) % 4, ang = 0.35 + 0.26 * variant(mo.key, seg + 2);
      const a = step === 0 ? side * ang : step === 1 ? -side * ang : step === 2 ? mo.poi.a : 0;
      const x = r.pos.x + Math.sin(r.head + a) * 6, z = r.pos.z + Math.cos(r.head + a) * 6;
      return [step === 2 ? 'poi' : 'scan' + step, v.set(x, G(x, z) + 0.3, z)];
    }
    if (tk?.kind === 'approach' && byId[tk.data]) return ['approach', atHead(byId[tk.data])];
    if (tk && !tk.arrived) {
      // a point AHEAD metres on along the way it means to go (or straight at the goal)
      const pts = r.path?.pts ?? [[tk.x, tk.z] as [number, number]];
      let x = r.pos.x, z = r.pos.z, left = Math.max(1.2, (r.wet ? r.sp.swimSpeed || r.sp.speed : r.sp.speed) * AHEAD);   // (about AHEAD seconds on)
      for (const [px, pz] of pts) { const d = Math.hypot(px - x, pz - z); if (d >= left) { x += (px - x) / d * left; z += (pz - z) / d * left; left = 0; break; } x = px; z = pz; left -= d; }
      return ['way', v.set(x, G(x, z) + (r.wet ? 0 : 0.3), z)];
    }
    if (tk?.kind === 'fire') return ['fire', v.set(PIT.x, PIT.y + 0.3, PIT.z)];
    if (tk?.kind === 'review' && tk.data) return ['work', v.copy(tk.data)];
    if (tk?.kind === 'admire') { const fx = Math.sin(r.head), fz = Math.cos(r.head); return ['hands', v.set(r.pos.x + fx * 0.35, r.pos.y + 0.6, r.pos.z + fz * 0.35)]; }
    if (WORK.has(r.act)) { const fx = Math.sin(r.head), fz = Math.cos(r.head); return ['hands', v.set(r.pos.x + fx * 0.6, r.pos.y + 0.15, r.pos.z + fz * 0.6)]; }
    // idle: now and then, a look at one of the others close by (for a few seconds), then back to its own thoughts
    if (mo.why === 'glance' && mo.hold > -2.5) return ['glance', mo.look];
    if ((mo.glance -= dt) < 0) {
      mo.glance = 8 + Math.random() * 17;
      const o = list.filter((q) => q !== r && Math.hypot(q.pos.x - r.pos.x, q.pos.z - r.pos.z) < 14).sort((a, b) => Math.hypot(a.pos.x - r.pos.x, a.pos.z - r.pos.z) - Math.hypot(b.pos.x - r.pos.x, b.pos.z - r.pos.z))[0];
      if (o) return ['glance', atHead(o)];
    }
    return ['', null];
  }
  function updateLook(r: Resident, dt: number) {
    const mo = r.mo; mo.hold -= dt;
    const [why, at] = chooseLook(r, dt);
    // a new thing to look at only once the last has been held a while (unless it is a talk starting, or there is nothing)
    if (why === mo.why || mo.hold <= 0 || why === 'talk' || !at) {
      if (why !== mo.why) mo.hold = 1.5;
      mo.why = why; mo.look = at ? (mo.look ?? new THREE.Vector3()).copy(at) : null;
    }
  }
  function placeY(r: Resident) {
    const h = r.wet && r.sp.swims && (r.act === 'swim' || r.under > 0) ? L.h(r.pos.x, r.pos.z) : G(r.pos.x, r.pos.z);
    r.wet = h < 0.05;
    const top = r.id === 'rakko' ? 0 : -0.2;   // floating at the surface (Rakko), or with its head out (Kamemaru)
    if (!r.wet) r.pos.y = h;
    else if (r.under > 0) r.pos.y = top + (h + (r.id === 'rakko' ? 0.18 : 0.075) - top) * r.under;   // (Kamemaru settled a little into the sand)   // (down on the bottom: diving, grazing, asleep)
    else if (r.id === 'kame' && r.act === 'swim') r.pos.y = Math.max((T.top && h < 0 ? Math.max(h, T.top(r.pos.x, r.pos.z)) : h) + 0.3, -1.2 + Math.sin(performance.now() * 0.0003) * 0.2);   // (over the coral heads, not through them)
    else r.pos.y = top;
  }

  /* ---------- meeting and talking ---------- */
  // Words between two of them are what they hold (ADR 0004, addendum 2026-10-04): the first time, who each is and
  // what it is for — the island's custom; after that, how far each has got, and where something lies that the
  // other gathers. Nothing is said for the saying of it. What one passes on, the other's mind keeps as heard.
  const WANTS: Record<string, string> = { dot: 'wood', rakko: 'shell' };
  const ITEM_JA: Record<string, string> = { wood: '流木', shell: '貝殻', stone: '石' };
  // What each did today, as the world counted it: the difference from its counts as the day began.
  const isleCount = () => Object.keys(village.map.seen).length;
  function dayStart(r: Resident) {
    const day = dayOf(clockMs);
    if (r.dayBase?.day !== day) r.dayBase = { day, built: r.stats.built, isles: r.id === 'dot' ? isleCount() : 0, shells: r.stats.shells, notes: r.stats.notes, cairns: r.stats.cairns };
  }
  function dayCounts(r: Resident): DayItem[] {
    dayStart(r);
    const b = r.dayBase!, out: DayItem[] = [];
    const add = (what: Exclude<DayItem['what'], 'met'>, n: number) => { if (n > 0) out.push({ what, n }); };
    add('piece', r.stats.built - b.built); if (r.id === 'dot') add('island', isleCount() - b.isles);
    add('shell', r.stats.shells - b.shells); add('note', r.stats.notes - b.notes); add('cairn', r.stats.cairns - b.cairns);
    add('photo', photosOn(r, dayOf(clockMs)).length);
    // (meals and talks: from its diary, today's entries — a meal each time it came up from eating; whom it talked with,
    // the one it talked with most)
    const today = r.diary.filter((e) => dayOf(e.at) === b.day);
    add('eat', today.filter((e) => e.key === 'eat' || e.key === 'graze').length);
    { const n = new Map<string, number>(); for (const e of today) if (e.key === 'met' && e.with && byId[e.with]) n.set(e.with, (n.get(e.with) ?? 0) + 1);
      const top = [...n.entries()].sort((x, y) => y[1] - x[1])[0]; if (top && out.length < 2) out.push({ what: 'met', n: top[1], with: top[0] as Who }); }
    return out.slice(0, 2);
  }
  function countsOf(r: Resident): Count[] {
    const s = r.stats;
    if (r.id === 'dot') return [{ what: 'hut', n: s.built, of: HUT.length }, { what: 'isle', n: Object.keys(village.map.seen).length }];
    if (r.id === 'rakko') return [{ what: 'shell', n: s.shells }, { what: 'full', n: full(r) }];
    if (r.id === 'kame') return [{ what: 'notes', n: s.notes }, { what: 'full', n: full(r) }];
    return [{ what: 'map', n: statVars(r).map, pct: true }, { what: 'notes', n: s.notes }, { what: 'cairn', n: s.cairns }];
  }

  /** Where something lies that `to` gathers and does not know of, as `from` knows it: what its mind has seen, or —
   *  without a mind — what lies within sight of where it is. */
  function tip(from: Resident, to: Resident): Observation | null {
    const kind = WANTS[to.id], ta = agentOf(to); if (!kind || !ta) return null;
    const fa = agentOf(from);
    const it = items.list.filter((x) => x.kind === kind && !x.by && !ta.seen.has(`${kind}#${x.id}`) && (fa ? fa.seen.has(`${kind}#${x.id}`) : Math.hypot(x.x - from.pos.x, x.z - from.pos.z) < 40))
      .sort((p, q) => Math.hypot(p.x - to.pos.x, p.z - to.pos.z) - Math.hypot(q.x - to.pos.x, q.z - to.pos.z))[0];
    return it ? { id: `${kind}#${it.id}`, kind, label: ITEM_JA[kind], x: it.x, z: it.z, dist: Math.hypot(it.x - to.pos.x, it.z - to.pos.z), at: clockMs } : null;
  }
  function startTalk(a: Resident, b: Resident, fast: boolean) {
    const bd = bonds[pair(a.id, b.id)];
    const lines: Line[] = [], shares: Talk['shares'] = [];
    const stage = bd.stage;
    const line = (r: Resident, m: Said) => lines.push({ who: r.id, text: m.ja, isl: m.isl, en: m.en });
    if (stage === 0) for (const r of [a, b]) line(r, SAY.identify(r.id));
    else {
      for (const r of [a, b]) line(r, SAY.report(countsOf(r)));
      for (const [f, t] of [[a, b], [b, a]] as Resident[][]) {
        const ob = tip(f, t); if (!ob) continue;
        line(f, SAY.share(ob.kind, ob.dist, t.id)); shares.push({ from: f, to: t, ob });
      }
    }
    keep(a); keep(b);
    const tk: Talk = { a, b, lines, i: 0, t: 0, stage, conv: heading(`${a.v.name}と${b.v.name}（${STAGES[Math.min(bd.stage + 1, 5)]}）`), shares };
    a.talk = b.talk = tk;
    bd.last = clockMs; bd.talks++;
    res.onEvent('meet', `${a.v.name}と${b.v.name}が${stage === 0 ? '識別しあった' : '情報を交換した'}`, a);
    return tk;
  }
  // stopping what it was doing to talk: the doing is kept (and whatever it had claimed or was holding), to go
  // back to afterwards — not dropped and something else thought of
  function keep(r: Resident) {
    if (r.task && !['approach', 'visit', 'wander', 'fire', 'sleep', 'show'].includes(r.task.kind) && !r.resume) { r.resume = r.task; r.resumeAt = clockMs; }
  }
  function endTalk(tk: Talk) {
    const bd = bonds[pair(tk.a.id, tk.b.id)];
    bd.know = Math.min(1, bd.know + 0.1);
    if (bd.stage < 5) bd.stage++;
    for (const r of [tk.a, tk.b]) { r.talk = null; r.saying = ''; r.task = null; }
    for (const sh of tk.shares) {
      agentOf(sh.to)?.hear(sh.ob, sh.from.id, `${sh.from.v.name}によると、${sh.ob.label}が${Math.round(sh.ob.dist)}mほど先にある`, clockMs);
      sh.to.diary.push({ at: clockMs, text: `${sh.from.v.name}から${sh.ob.label}の位置を聞いた（約${Math.round(sh.ob.dist)}m）`, key: 'met', with: sh.from.id });
    }
    const summary = tk.stage === 0 ? '識別しあった' : '情報を交換した';
    tk.a.today.push(`${tk.b.v.name}と話した`); tk.b.today.push(`${tk.a.v.name}と話した`);
    tk.a.diary.push({ at: clockMs, text: `${tk.b.v.name}と${summary}。`, key: 'met', with: tk.b.id }); tk.b.diary.push({ at: clockMs, text: `${tk.a.v.name}と${summary}。`, key: 'met', with: tk.a.id });
    for (const r of [tk.a, tk.b]) if (r.diary.length > 800) r.diary.shift();
    res.onEvent('talked', `${tk.a.v.name}と${tk.b.v.name}が${summary}`, tk.a);
  }
  function stepTalk(tk: Talk, dt: number, fast: boolean) {
    // (waiting for the AI's words — a minute at most: then the prepared ones, and a late answer is let go)
    if (tk.pending && tk.i >= 1) { tk.waited = (tk.waited ?? 0) + dt; if (tk.waited < 60) return; tk.pending = false; }
    tk.t += dt;
    const line = tk.lines[tk.i];
    if (!line) { endTalk(tk); return; }
    const speaker = byId[line.who], other = speaker === tk.a ? tk.b : tk.a;
    if (tk.t === dt || speaker.saying !== line.text) {
      other.saying = ''; say(speaker, line.text, tk.conv, fast, line.isl, line.en);
    }
    // face each other
    for (const [r, o] of [[tk.a, tk.b], [tk.b, tk.a]] as Resident[][]) {
      let d = Math.atan2(o.pos.x - r.pos.x, o.pos.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 2);
      r.walk = 0; r.act = r === speaker ? (tk.i === 0 && r.id === 'dot' ? 'wave' : r.wet ? 'float' : 'idle') : r.wet ? 'float' : 'look';
    }
    if (tk.t > (fast ? 1 : 2.4 + line.text.length * 0.09)) { tk.i++; tk.t = 0; }
  }
  // the one who is out and about closes the gap once they have spotted each other
  /** Has it learnt, from what came of it, that what others tell it is of use? (ADR 0004, addendum 2026-10-04) */
  const keen = (r: Resident) => (r.stats.talkUse ?? 0) >= 0.3;
  /** How much what `o` has told `r` has paid, as `r` has learnt it (its value of 'heard from o': agent/values.ts). */
  const trust = (r: Resident, o: Resident) => { const a = agentOf(r); if (!a) return 0; let t = 0; for (const k of [`heard:${o.id}`, `made:${o.id}`]) { const v = a.values.m.get(k); if (v) t += a.values.value(v); } return t; };
  function checkMeetings(fast: boolean) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.talk || b.talk || a.act === 'sleep' || b.act === 'sleep' || a.task?.kind === 'fire' || b.task?.kind === 'fire' || a.under > 0.2 || b.under > 0.2) continue;   // (not with one of them down on the bottom)
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      const bd = bonds[pair(a.id, b.id)];
      if (d > 14 || clockMs - bd.last < 25 * 60e3) continue;
      // (out here, away from the fire, they stop for each other only to identify the first time they come face to
      // face — the custom — or when one has learnt that what it hears from others is of use, and goes over for it)
      if (!keen(a) && !keen(b) && (bd.stage > 0 || d > 3.2)) continue;
      if (d > 3.2) {   // spotted, by one that has found talking pays: walk (or paddle) over — more surely to one whose word has paid
        const [m, o] = keen(a) ? [a, b] : [b, a];
        if (trust(m, o) < 0.2 && Math.random() > 0.3) { bd.last = clockMs; continue; }
        keep(m); m.task = { kind: 'approach', x: o.pos.x, z: o.pos.z, act: 'walk', dur: 60, t: 0, arrived: false, wet: m.sp.swims, data: o.id };
        continue;
      }
      startTalk(a.sp.social >= b.sp.social ? a : b, a.sp.social >= b.sp.social ? b : a, fast);
    }
  }
  // now and then the sociable ones take a walk toward a neighbour's part of the island
  function maybeVisit(r: Resident, hr: number): Task | null {
    if (!keen(r)) return null;   // (only one that has learnt what others know is of use goes looking for them)
    if (Math.random() > r.sp.social * 0.08) return null;
    const awake = list.filter((o) => o !== r && !sleepTime(o, hr));
    if (!awake.length) return null;
    const o = pickOne(awake), mid = [r.pos.x + (o.pos.x - r.pos.x) * 0.8, r.pos.z + (o.pos.z - r.pos.z) * 0.8] as [number, number];
    return task('visit', spot(mid, 30, r.sp.swims ? (x, z, h) => h > -3 : open) , 'idle', rr(40, 120));
  }

  /* ---------- one resident, one step ---------- */
  function step(r: Resident, dt: number, fast: boolean) {
    studyFast = fast;
    cancelLostStudy(r, fast);
    const hr = localHour(clockMs), day = dayK(hr);
    // the battery: solar panels charge in daylight when resting; moving and thinking use it up
    const busy = r.walk > 0.1 || r.act === 'work' || r.act === 'swim' || r.act === 'think';
    if (!r.sp.living) { r.battery = Math.min(1, Math.max(0, r.battery + dt * ((busy ? -1 / 21600 : -1 / 72000) * ((r.wear ?? 0) > 0.6 ? 1.5 : 1) + (!busy ? day / 5400 : day / 21600)))); weathering(r, dt); }
    else {
      // an otter must eat about a quarter of its weight a day, so it is soon hungry again; a turtle, slowly
      // (what it is doing decides how fast: a dive costs far more than floating — robots/body.ts)
      const dr = drain(r.id, r.act, r.task?.kind ?? '');
      r.hunger = Math.min(1, r.hunger + dt * dr.hunger * (r.wet ? 1 + 0.6 * roughK() * shelterK(r) : 1));   // (a rough sea out in the open costs more; in its quiet place, little)
      if (r.wet && roughK() > 0.5 && !r.mo.roughFelt) { r.mo.roughFelt = clockMs; if (r.id === 'kame') kameBed(); }   // (once it has known one, it looks for a quieter place)
      r.sleepy = Math.min(1, Math.max(0, r.sleepy + dt * dr.sleepy));
      const gt = r.task;
      if (gt?.kind === 'graze' && gt.arrived && r.act === 'graze') {   // (grazing is slow: an hour or more a meal — and the bed is grazed down)
        const bd = beds.find((b) => b.id === gt.data?.bed);
        if (!gt.data?.began) { gt.data = { ...gt.data, began: true }; r.body?.eatStarts.push(full(r)); }   // (when it actually begins to eat)
        if (!bd || bd.grass > 0.03) { r.hunger = Math.max(0, r.hunger - dt / 4000); if (bd) bd.grass = Math.max(0, bd.grass - dt / 9000); }
        else { gt.data = { ...gt.data, empty: true }; gt.t = gt.dur + 1; }
      }
      if (r.body && !fast) bodyCheck(r, hr, dt);
    }
    if (r.talk) { if (r.talk.a === r) stepTalk(r.talk, dt, fast); placeY(r); return; }
    // (worn past moving: it stays where it is until it has dried — out on a crossing, the voyage's own rules)
    // (worn past 0.9: no new work — at a tenth of its pace it creeps to the nearest roof, or rests where it is, until it
    // has dried to 0.6; out on a crossing, the voyage's own rules)
    if (r.stuck && r.task?.kind !== 'shelter' && !(r.task?.kind === 'voyage' && r.task.data?.started)) {
      if (r.task) { report(r, r.task, 'interrupted', '傷みでほとんど動けない'); items.release(r.id); if (drift.by === r.id && r.holding !== 'drift') drift.by = ''; }
      const roof = anyRoof() && !roofCover(r).roof ? shelterAt(r) : null;
      r.task = roof && Math.hypot(roof[0] - r.pos.x, roof[1] - r.pos.z) < 400 ? task('shelter', roof, 'idle', 1e9, { data: { worn: true } }) : task('shelter', [r.pos.x, r.pos.z], 'idle', 1e9, { arrived: true, data: { worn: true } });
      r.blocked = 0;
    }
    // (a worn robot in the rain goes in under the hut's roof, if there is one near: it dries there once the rain stops)
    if (!r.sp.living && anyRoof() && wetNow() && !storm() && (r.wear ?? 0) > 0.3 && !roofCover(r).roof && Math.hypot(r.pos.x - shelterAt(r)[0], r.pos.z - shelterAt(r)[1]) < 120
      && !['shelter', 'fire', 'voyage'].includes(r.task?.kind ?? '')) {
      if (r.task) { report(r, r.task, 'interrupted', '雨'); items.release(r.id); }
      r.task = task('shelter', shelterAt(r), sleepTime(r, hr) ? 'sleep' : 'idle', 1e9, { data: { rain: true } }); r.blocked = 0;
    }
    // the evening fire: everyone who is up comes and sits round it, and goes off again after
    if (meetHours(hr) && !sleepTime(r, hr) && !r.stuck && r.task?.kind !== 'fire' && !(r.task?.kind === 'voyage' && r.task.data?.started)) {
      items.release(r.id); if (drift.by === r.id && r.holding !== 'drift') drift.by = '';
      const seat = seatAt(list.indexOf(r));
      if (clockMs - (r.mo.walkedAt ?? -1e12) > 3 * 3.6e6) { r.mo.walkedAt = clockMs; walked(r, Math.hypot(seat[0] - r.pos.x, seat[1] - r.pos.z)); }   // (how far it came, once a gathering: the world keeps count)
      r.task = task('fire', seat, 'sit', 1e9); r.blocked = 0;
    }
    if (r.task?.kind === 'fire' && !meetHours(hr)) {
      if (r.task.arrived) r.mo.backFrom = [r.pos.x, r.pos.z];
      if (atFire.has(r.id)) note(r, 'fire', {}, hr < 12 ? '朝の集まりに出た' : '焚き火の会に出た');
      r.task = null; r.saying = '';
    }
    if (!r.task && r.resume) {
      // back to what it was doing before it stopped to talk, if it still can be: a look at it first
      const tk = r.resume; r.resume = undefined;
      if (clockMs - (r.resumeAt ?? 0) < 20 * 60e3 && !sleepTime(r, hr)) { r.task = tk; r.mo.recheck = fast ? 0 : 1.6; } else items.release(r.id);
    }
    if (r.mo.recheck > 0 && r.task) { r.mo.recheck -= dt; r.walk = 0; r.act = r.wet ? 'float' : 'look'; placeY(r); return; }
    // (a typhoon: nothing is done outdoors — the animals keep low in the water near home, the robots stay in by
    // the hut or their own place; hunger and sleepiness go on)
    const atSea = r.task?.kind === 'voyage' && !!r.task.data?.started;   // (out on the crossing: the voyage's own rules — below)
    if (storm() && r.task?.kind !== 'shelter' && !r.talk && !atSea) {
      if (r.task) { report(r, r.task, 'interrupted', '台風'); items.release(r.id); }
      const home = r.sp.home, at = r.sp.living ? (spot(home, 60, water(1, 5)) ?? home) : houseRoofed() ? shelterAt(r) : (r.id === 'dot' ? [hut.position.x + 1.5, hut.position.z] as [number, number] : home);   // (a house with a roof: both robots in it)
      r.task = task('shelter', at, r.sp.living ? 'sleep' : 'idle', 1e9, r.sp.living ? { wet: true } : {}); r.blocked = 0;
    }
    if (r.task?.kind === 'shelter' && !storm() && !(r.task.data?.worn && r.stuck) && !(r.task.data?.rain && (wetNow() || ((r.wear ?? 0) > 0.3 && !meetHours(hr))))) r.task = null;   // (out of the rain: it stays to dry; worn, until it has)
    if (!r.task || (sleepTime(r, hr) !== (r.task.kind === 'sleep') && r.task.kind !== 'approach' && r.task.kind !== 'shelter' && r.task.kind !== 'voyage' && !(r.sp.living && ['forage', 'eat', 'groom'].includes(r.task.kind)))) {
      if (r.task) { report(r, r.task, 'interrupted', sleepTime(r, hr) ? '眠る時間になった' : '起きる時間になった'); items.release(r.id); }
      r.task = (!sleepTime(r, hr) && maybeVisit(r, hr)) || decide(r, hr);
      r.blocked = 0; r.mo.fails = 0;
      if (!r.task) { r.act = 'idle'; r.walk = 0; placeY(r); return; }
    }
    const tk = r.task;
    // the crossing: at the raft the world judges the day; out at sea it is away (not seen on the island) until it is
    // back — or turned back by a storm
    if (tk.kind === 'lab' && tk.arrived && !tk.data.runId && !tk.failed) startLab(r, tk);
    if (tk.kind === 'voyage' && tk.arrived && !tk.data.started) {
      const j = voyageJudge(r, tk.data.isle), w = village.map.seen[tk.data.isle]?.word ?? '';
      if (!j.go) { report(r, tk, 'blocked', j.why); r.task = null; return; }
      tk.data.started = true; tk.t = 0; tk.dur = voyageMs(j.km) / 1000;   // (on the island's clock: voyageJudge)
      voyaging = true; r.model.root.visible = false; drawRaft();
      r.diary.push({ at: clockMs, text: `筏で${w}へ出た（約${j.km.toFixed(1)}km）`, key: 'got' });
      res.onEvent('map', `${r.v.name}が筏で${w}へ向かった`, r);
    }
    if (tk.kind === 'voyage' && tk.data.started) {
      r.model.root.visible = false;
      if (storm()) { tk.data.why = '台風'; endVoyage(r, tk, 'turned'); report(r, tk, 'blocked', '台風で引き返した'); r.task = null; return; }
    }
    if (tk.kind === 'ask' || tk.kind === 'give' || tk.kind === 'tell') {
      // up to the one it means, close enough to speak or hand it over (they may be on the move); asleep, in the
      // water where it cannot follow, or too long: it could not
      const o = byId[tk.data.to], d = o ? Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) : 0;
      if (!o || o.act === 'sleep' || (o.wet && !r.sp.swims) || (!tk.arrived && tk.t > 300)) { report(r, tk, 'unavailable', o?.act === 'sleep' ? `${o.v.name}は眠っていた` : '会えなかった'); r.task = null; return; }
      if (!tk.arrived) { tk.x = o.pos.x + (r.pos.x - o.pos.x) / Math.max(d, 0.01) * 1.2; tk.z = o.pos.z + (r.pos.z - o.pos.z) / Math.max(d, 0.01) * 1.2; }
      else { let a = Math.atan2(o.pos.x - r.pos.x, o.pos.z - r.pos.z) - r.head; a = Math.atan2(Math.sin(a), Math.cos(a)); r.head += a * Math.min(1, dt * 2); }
    }
    if (tk.kind === 'show') {
      // up to them, close enough to hold it out; if they have got busy (or it takes too long), never mind
      const o = byId[tk.data], d = o ? Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) : 0;
      if (!o || o.talk || o.act === 'sleep' || firing(o) || o.wet || (!tk.arrived && tk.t > 25)) { r.task = task('pile', pileAt(r.stats.shells) as [number, number], 'pick', 3); return; }
      if (!tk.arrived) { tk.x = o.pos.x + (r.pos.x - o.pos.x) / Math.max(d, 0.01) * 1.3; tk.z = o.pos.z + (r.pos.z - o.pos.z) / Math.max(d, 0.01) * 1.3; }
      else { let a = Math.atan2(o.pos.x - r.pos.x, o.pos.z - r.pos.z) - r.head; a = Math.atan2(Math.sin(a), Math.cos(a)); r.head += a * Math.min(1, dt * 2); }
    }
    if (tk.kind === 'approach') { const o = byId[tk.data]; tk.x = o.pos.x; tk.z = o.pos.z; if (Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) < 3) { r.task = null; r.walk = 0; return; } }
    r.under = 0;
    // (a new task starts with a clean slate: how stuck it got on the last one is not counted against this one — a task its
    // mind chose did not reset it, and three in a row failed at once where the one before had stuck; life-run 2026-10-09)
    if ((r.mo as any).forTask !== tk) { (r.mo as any).forTask = tk; r.blocked = 0; }
    if (!tk.arrived) {
      r.act = r.wet ? 'swim' : r.holding ? 'carry' : 'walk';
      const via = viaDoor(r, tk.x, tk.z), vk = via ? via.join() : '';   // (into or out of the house: by its doorway)
      if ((tk as any).via !== vk) { (tk as any).via = vk; r.path = undefined; }   // (a new leg: its way planned again)
      tk.arrived = via ? (move(r, via[0], via[1], dt, !!tk.wet, fast), false) : move(r, tk.x, tk.z, dt, !!tk.wet, fast);
      if (tk.arrived && r.mo.backFrom) { walked(r, Math.hypot(r.pos.x - r.mo.backFrom[0], r.pos.z - r.mo.backFrom[1])); r.mo.backFrom = undefined; }   // (the way back from a gathering: to where it went next)
      tk.t += dt;
      if (tk.t > 1800 / wearSlow(r) || r.blocked > 20) {   // (a slowed one is given the time its pace needs)
        if (r.id === 'lantern' && tk.data?.studyId) study?.interrupt(tk.data.studyId, studyWorld(fast), '道を進めなかった。別の場所から確かめよう。', true);
        report(r, tk, tk.t > 1800 / wearSlow(r) ? 'timeout' : r.went === 'no way' || r.went === 'nowhere to stand' ? r.went : 'blocked', r.went === 'no way' ? '道がなかった' : r.went === 'nowhere to stand' ? '立てる場所がなかった' : '進めなかった');
        if (tk.data && typeof tk.data.id === 'number' && tk.data.kind) (tk.data.away ??= {})[r.id] = clockMs + 6 * 3.6e6;
        // (wedged where it could not get on: Lantern keeps the spot among the places it goes round, so the next way it plans
        // does not lead it back into the same trunks — it had been, again and again; life-run 2026-10-09)
        if (r.id === 'lantern' && r.went === 'blocked') { r.mo.bad.push([r.pos.x, r.pos.z]); if (r.mo.bad.length > 12) r.mo.bad.shift(); (r.mo as any).lastPlan = undefined; }
        // (wedged in the same place three times running — between trunks it cannot be pushed out from: it works itself free,
        // to the nearest clear footing within a few metres, rather than trying from there for days; life-run 2026-10-09)
        if (!(tk.t > 1800 / wearSlow(r)) && r.went !== 'no way' && r.went !== 'nowhere to stand' && !r.wet) {   // (it gave up for being stuck — not for time, nor for no way)
          const w = (r.mo as any).wedged as { x: number; z: number; n: number } | undefined;
          const n = w && Math.hypot(w.x - r.pos.x, w.z - r.pos.z) < 1.5 ? w.n + 1 : 1; (r.mo as any).wedged = { x: r.pos.x, z: r.pos.z, n };
          if (n >= 3) {
            const B = BODY[r.id]; let best: [number, number] | null = null;
            for (let d = 0.6; d <= 3 && !best; d += 0.4) for (let k = 0; k < 16 && !best; k++) { const a = k / 16 * 6.28, x = r.pos.x + Math.cos(a) * d, z = r.pos.z + Math.sin(a) * d; if (isFinite(walkCost(x, z)) && !solids.hit(x, z, B, G(x, z)) && !(T.forest?.standingNear?.(x, z, B.r + 0.3)?.length)) best = [x, z]; }
            if (best) { r.pos.x = best[0]; r.pos.z = best[1]; placeY(r); r.path = undefined; (r.mo as any).wedged = undefined; }
          }
        }   // (a thing it could not get to: left be a while, not tried again straight away)
        items.release(r.id); if (drift.by === r.id && r.holding !== 'drift') drift.by = ''; r.task = null; return;
      }   // could not get there: think again
      if (tk.arrived) tk.t = 0;
      if (r.id === 'lantern') visited.add(cellOf(r.pos.x, r.pos.z));
    } else {
      r.walk = 0; r.act = tk.act;
      if (tk.kind === 'fire') { atFire.add(r.id); let d = Math.atan2(PIT.x - r.pos.x, PIT.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 2); }
      if (tk.kind === 'photo' && tk.data?.ob) { let d = Math.atan2(tk.data.ob.x - r.pos.x, tk.data.ob.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 2.5); }
      if (tk.kind === 'review' && tk.data) { let d = Math.atan2(tk.data.x - r.pos.x, tk.data.z - r.pos.z) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt * 1.5); }
      if (tk.kind === 'watch' || tk.kind === 'look') { let d = Math.atan2(-r.pos.x + (r.sp.home[0] - 60), -r.pos.z + (r.sp.home[1] + 80)) - r.head; d = Math.atan2(Math.sin(d), Math.cos(d)); r.head += d * Math.min(1, dt); }
      tk.t += dt * (tk.act === 'work' ? wearSlow(r) : 1);   // (worn joints: work goes slower)
      if (tk.kind === 'pit') (village as any).pitDug = ((village as any).pitDug ?? 0) + dt * (tk.act === 'work' ? wearSlow(r) : 1);   // (the digging done so far is kept: a gathering, or the night, does not fill the hole in again)
      if (r.sp.living && r.wet) {
        if (tk.kind === 'forage') { const k = tk.t / tk.dur; r.under = smooth01(0, 0.12, k) * (1 - smooth01(0.86, 1, k)); }   // (down head first, along the bottom, back up)
        else if (tk.kind === 'graze' || (r.id === 'kame' && tk.kind === 'sleep')) {
          // a turtle comes up to breathe: every few minutes while it feeds, every forty or so asleep
          const per = tk.kind === 'sleep' ? 2400 : 420, ph = tk.t % per;
          const up = smooth01(per - 46, per - 32, ph) * (1 - smooth01(per - 14, per - 2, ph));
          r.under = 1 - up; if (up > 0.5) r.act = 'breathe';
        }
        if (tk.kind === 'graze' && r.hunger < 0.05 && tk.t > 240 && r.under > 0.99) tk.t = tk.dur + 1;   // (full)
        // a fish comes by while it grazes: it stops, lifts its head and follows it with its eyes until it is
        // gone, then goes back to its grass (now and then: not every fish, and never in the way of a breath)
        if (r.id === 'kame' && tk.kind === 'graze' && !fast && T.nearFish) {
          if (r.seen && (r.under < 0.99 || r.talk)) r.seen = undefined;
          if (r.seen) {
            const sn = r.seen; sn.t += dt; r.act = 'look';
            if ((sn.lost += dt) > 0 && Math.floor(sn.t / 0.3) !== Math.floor((sn.t - dt) / 0.3)) {
              const eye = _ey.set(r.pos.x, r.pos.y + 0.25, r.pos.z), dir = _fd.subVectors(sn.pos, eye); dir.y = 0; dir.normalize();
              if (T.nearFish(eye, dir, 10, _fp)) { sn.pos.lerp(_fp, 0.6); sn.lost = 0; }
            }
            if (sn.lost > 1.5 || sn.t > sn.dur) r.seen = undefined;
          } else if (r.under > 0.99 && seeCool <= 0 && Math.floor(tk.t / 3) !== Math.floor((tk.t - dt) / 3)) {
            const eye = _ey.set(r.pos.x, r.pos.y + 0.25, r.pos.z), fwd = _fd.set(Math.sin(r.head), 0, Math.cos(r.head));
            const name = T.nearFish(eye, fwd, 6, _fp);
            if (name) { r.seen = { name, pos: _fp.clone(), t: 0, dur: rr(5, 15), lost: 0 }; seeCool = rr(120, 300); r.act = 'look'; (r.spotted ??= []).push(name); if (r.spotted.length > 20) r.spotted.shift(); }
          }
        }
      }
      if (tk.t > tk.dur) { done(r, tk, fast); report(r, tk, tk.failed ?? 'done'); }
    }
    placeY(r);
  }

  /* ---------- saving and catching up ---------- */
  function save() {
    try {
      localStorage.setItem(saveKey, JSON.stringify({
        ...(study ? { lanternStudy: study.serialize() } : {}),
        minds: Object.fromEntries(Object.entries(agents).map(([id, a]) => [id, a.save()])),
        at: Date.now(), clockMs, visited: [...visited], cairns: cairnSpots, bonds, talks: talks.slice(-160), items: items.save(), patches, beds, trees: TREES.map((t) => (t.down ? 1 : 0)), plots: PLOTS.map((pl) => [pl.s, pl.at]), village, lab, lastFireAt, drift: drift.kind >= 0 ? drift : null,
        list: list.map((r) => ({ id: r.id, pos: [r.pos.x, r.pos.z], head: r.head, battery: r.battery, hunger: r.hunger, sleepy: r.sleepy, body: r.body, stats: r.stats, today: r.today, diary: r.diary.slice(-800), holding: r.holding, photos: r.photos?.slice(-40), dayBase: r.dayBase, wear: r.wear, wearLv: r.wearLv, stuck: r.stuck })),
      }));
    } catch (e) { /* storage full or blocked: they live on in memory */ }
  }
  function load(nowMs: number) {
    let s: any = null;
    try { s = JSON.parse(localStorage.getItem(saveKey) || (study ? localStorage.getItem(KEY) : null) || 'null'); } catch (e) { s = null; }
    clockMs = nowMs;
    items.load(s ? s.items : undefined);
    // (the food where it was, as much as was left)
    if (Array.isArray(s?.patches) && s.patches.length) patches.splice(0, patches.length, ...s.patches);
    if (Array.isArray(s?.beds) && s.beds.length) beds.splice(0, beds.length, ...s.beds);
    for (const it of [...items.list]) if (!clearOf(it.x, it.z, L.h(it.x, it.z))) items.take(it);   // (one left inside a rock by an older island: gone)
    if (!s) return 0;
    if (study) { study.dispose(); study = createLanternStudy(s.lanternStudy, requestLanternDecision); }
    for (const [id, m] of Object.entries(s.minds || {})) agents[id]?.load(m);
    for (const v of s.visited || []) visited.add(v);
    for (const c of s.cairns || []) cairnSpots.push([c[0], c[1], c[2] ?? 4]);   // (older saves: finished cairns)
    Object.assign(bonds, s.bonds || {});
    talks.push(...(s.talks || []));
    for (const d of s.list || []) {
      const r = byId[d.id]; if (!r) continue;
      r.pos.set(d.pos[0], 0, d.pos[1]); r.head = d.head; r.battery = r.sp.living ? 1 : d.battery; r.hunger = d.hunger ?? 0.4; r.sleepy = d.sleepy ?? 0.2; if (r.body && d.body) r.body = { ...r.body, ...d.body, learn: { ...r.body.learn, ...d.body.learn } }; Object.assign(r.stats, d.stats); r.today = d.today || []; r.diary = d.diary || []; r.dayBase = d.dayBase; if (!r.sp.living) { r.wear = d.wear ?? 0; r.wearLv = d.wearLv ?? 0; r.stuck = !!d.stuck; }
      r.holding = d.holding ?? (r.id === 'dot' && r.stats.wood > 0 ? 'wood' : '');
      if (Array.isArray(d.photos)) r.photos = d.photos;
    }
    for (let i = 0; i < Math.min(byId.dot.stats.built, HUT.length); i++) HUT[i].visible = true;
    (s.trees || []).forEach((d: number, i: number) => { const t = TREES[i]; if (t && d && t.ok) { t.down = true; t.pivot.visible = false; t.stump.visible = true; } });
    (s.plots || []).forEach((d: number[], i: number) => { const pl = PLOTS[i]; if (pl) { pl.s = d[0]; pl.at = d[1]; } });
    if (s.village) { Object.assign(village, s.village); village.labRuns ??= []; village.catcher ??= null; village.hypo ??= null; village.hypo2 ??= null; village.mornings ??= 0; village.labDone ??= []; village.taught ??= {}; village.feedback ??= []; village.stormPrep ??= 0; village.heardOkAt ??= 0; village.swellGuess ??= { alarm: 0, hits: 0, falses: 0 }; village.prepBy ??= ''; village.prepSaved ??= []; village.heed ??= {}; village.onsetHunger ??= {}; village.stormLog ??= []; village.raft.hauled ??= false; village.house ??= { n: 0, rope: 0, bamboo: 0, clay: 0, lost: 0, weighed: false }; drawHouse(); village.felled ??= []; village.clayPit ??= null; drawPit(); village.wall ??= { n: 0, pile: 0 }; village.nest ??= { n: 0, at: null }; village.kameBed ??= null; village.ledge ??= { n: 0 }; village.spare ??= 0; village.lampLog ??= []; village.walks ??= {}; village.settle ??= null; for (const [id, h] of Object.entries(village.settle?.homes ?? {})) if (byId[id]) byId[id].sp.home = [h[0], h[1]]; drawWall(); drawNest(); drawLedge(); drawSpare(); drawLamp(); for (const f of village.felled) { T.forest?.fell(f.x, f.z); drawStump(f.x, f.z); } }
    showCatcher();
    if (s.lab) Object.assign(lab, s.lab);
    // (raw clay brought before it was described: what the island's clay is made of — world/planet-map.ts)
    for (const l of Object.values(lab.lots)) if (l.materialId === 'raw_clay' && !l.quality?.water_ppm) l.quality = { ...RAW_CLAY_SOUTH };
    else for (const l of (s.village?.store ?? []) as LotView[]) lab.lots[l.lotId] = l;   // (saved before the ledger: the shelf as it was)
    delete (village as any).store;
    // (a run saved under a process version the island no longer has is not resumed: it is ended, what it held freed)
    for (const x of [...village.labRuns]) { const run = lab.runs[x.runId], e = catalog.find((c) => c.processId === x.processId);
      if (!run || !e || run.processVersion !== e.processVersion) { if (run) abortRun(lab, x.runId, `工程の版が変わった（${run.processVersion} → ${e?.processVersion ?? 'なし'}）`); village.labRuns.splice(village.labRuns.indexOf(x), 1); } }
    // (and equipment made under another version of its table — the cook pot, the retort, a sealed pot: worked out again from
    // the lots it was made of, as the assembly policy says, not its version name changed; science final review 2026-10-09-lamp)
    refreshAssembled(lab, COOK_POT_ASSEMBLY); refreshAssembled(lab, POT_ASSEMBLY); refreshAssembledParts(lab, RETORT_ASSEMBLY);
    for (const t of village.treasures) { const k = OLD_DRIFT.indexOf(t.what); if (k >= 0) t.what = DRIFT[k].ja; }   // (made things from an older island: what the sea brings now)
    lastFireAt = s.lastFireAt ?? 0;
    if (s.drift && s.drift.kind >= 0) { Object.assign(drift, s.drift); driftMesh.geometry = DRIFT[drift.kind].geo; driftMesh.material = DRIFT[drift.kind].mat; driftMesh.position.set(drift.x, L.h(drift.x, drift.z) + 0.06, drift.z); driftMesh.visible = !drift.by || !list.some((r) => r.holding === 'drift'); }
    drawPier(); drawShelf(); drawRaft(); drawStore();
    buildPile(); buildCairns();
    return Math.min(12 * 3600, Math.max(0, (Date.now() - s.at) / 1000));   // how long they lived on without us (up to half a day)
  }

  // what it is doing, in words
  function statusOf(r: Resident): string {
    if (r.talk) { const o = r.talk.a === r ? r.talk.b : r.talk.a; return `${o.v.name}と話している`; }
    if (r.seen) return `通りかかった${r.seen.name}を、目で追っている`;
    const tk = r.task, k = tk?.kind ?? 'idle';
    if (r.id === 'lantern' && k.startsWith('study-')) {
      const labels: Record<string, string> = { 'study-observe': '星の位置を確かめている', 'study-draw': '観察した空を手帖に描いている', 'study-explore': '次に空を眺める場所を確かめている', 'study-rest': '手帖を閉じて、ひと休みしている', 'study-share': '近くの友だちに星の手帖を見せている', 'study-pause': '丘で次に気になることを考えている' };
      return tk?.arrived ? labels[k] ?? '手帖を見返している' : '気になる場所へ歩いている';
    }
    const far = tk && !tk.arrived ? Math.round(Math.hypot(tk.x - r.pos.x, tk.z - r.pos.z)) : 0, left = far > 3 ? `（あと${far}m）` : '';
    const going: Record<string, string> = { ask: `${byId[tk?.data?.to]?.v.name ?? '仲間'}のところへ頼みに行く`, give: `${byId[tk?.data?.to]?.v.name ?? '仲間'}に流木を届けに行く`, tell: `${byId[tk?.data?.to]?.v.name ?? '仲間'}に知らせに行く`, eat: '獲物をかかえて浮かんでいる', forage: '餌場へ泳いでいく', graze: '海草の原へ泳いでいく', bask: '甲羅干しの浜へ向かう', groom: '静かな水面へ', survey: '桟橋の場所へ向かう', inspect: '桟橋の工事を見に行く', base: '土台の石を桟橋へ運んでいる', post: '柱にする木を桟橋へ運んでいる', deck: '桟橋の板を運んでいる', find: '浜で見慣れないものを見つけて近づいていく', shelve: '見つけたものを小屋の棚へ運んでいる', chop: '若木のところへ向かう', till: '畑へ向かう', plant: '畑へ種をまきに行く', harvest: '畑へ収穫に行く', fire: circleMorning ? '朝の集まりへ向かっている' : '焚き火へ向かっている', gather: '流木を拾いに行く', collect: '貝殻を拾いに行く', fetch: '石積みの石を拾いに行く', craft: '流木を作業台へ運んでいる', place: `削った部材を小屋へ運んでいる`, review: '取りつけたところを見に、少し離れる', pile: '貝殻を運んでいる', stack: '石を石積みへ運んでいる', show: '見つけた貝殻を見せにいく' };
    const prey = ({ urchin: 'ウニ', crab: 'カニ', clam: '貝' } as Record<string, string>)[tk?.data] ?? '';
    const k01 = tk ? tk.t / tk.dur : 0;
    const at: Record<string, string> = {
      ask: `${byId[tk?.data?.to]?.v.name ?? '仲間'}に頼みごとをしている`, give: `${byId[tk?.data?.to]?.v.name ?? '仲間'}に流木を手渡している`, tell: `${byId[tk?.data?.to]?.v.name ?? '仲間'}に流木の場所を教えている`,
      forage: k01 < 0.12 ? '頭から潜っていく' : k01 > 0.86 ? (prey ? `${prey}をかかえて浮かんでくる` : '手ぶらで浮かんでくる') : '海の底で、前足で岩の下を探っている',
      eat: tk?.data === 'clam' ? 'お腹の上の石で貝を割って食べている' : `仰向けに浮かんで、${prey}を食べている`,
      groom: '水面で転がりながら毛づくろいしている',
      review: '取りつけた部材を、少し離れて眺めている',
      admire: '拾った貝殻を、前足で回して眺めている',
      show: `拾った貝殻を${byId[tk?.data]?.v.name ?? '仲間'}に見せている`,
      graze: r.act === 'breathe' ? '息つぎに浮かんできた' : '海の底で海草を食べている',
      bask: '浜で甲羅干しをしている',
      shelter: '台風のあいだ、身を低くしてやりすごしている',
      chart: '浜から水平線を見渡し、見える島を地図に記している', lab: `${catalog.find((e) => e.processId === tk?.data?.processId)?.ja ?? '工程'}`, lash: '部材を筏に組んでいる',
      voyage: tk?.data?.started ? `筏で${village.map.seen[tk.data.isle]?.word ?? ''}へ渡っている（島にはいない）` : '筏で出る支度をしている',
      survey: '桟橋の場所を測っている', inspect: '桟橋の工事と潮を見守っている', base: '土台の石を据えている', post: '泳ぎながら柱を立てている', deck: `桟橋に板を張っている（${village.deck + 1}/8）`, find: '見つけたものを拾い上げて調べている', shelve: '見つけたものを棚に飾っている', chop: '斧で若木を切っている', till: '鍬で畑を耕している', plant: '種をまいている', harvest: '実を収穫している', fire: circleMorning ? '朝の集まりで話している' : '焚き火を囲んで話している', gather: '流木を拾い上げている', collect: '貝殻を拾い上げている', fetch: '石を拾い上げている', craft: `作業台で流木を部材に削っている（${r.stats.built + 1}本目）`, place: `部材を小屋に取りつけている（${r.stats.built + 1}/${HUT.length}）`, pile: '貝殻を浜に並べている', stack: '石を積み上げている' };
    // (what it is doing now, from how its walk is going, not from what it means to do once there: held up on the
    // way, or still on its way, says so; only once there does it say it is doing it)
    if (tk && !tk.arrived && r.went === 'blocked' && r.blocked > 1.5) return '行く手がふさがっていて、回り道を探している';
    if (!r.talk && tk && going[k]) return tk.arrived ? at[k] : going[k] + left;
    const toward: Record<string, string> = {
      sleep: r.sp.swims && tk?.wet ? '眠る場所へ泳いでいく' : '寝床へ向かっている', charge: '日なたへ向かっている', look: '海の見える場所へ向かっている', watch: '海を観察する浜へ向かっている',
      rest: '丘のふもとへ向かっている', think: '丘の上へ歩いている', float: '静かな水面へ向かっている', nap: '昼寝のできる静かな水面へ向かっている', crack: '貝を割る場所へ向かっている',
      carry: '流木を運んでいる', build: '小屋へ向かっている', idle: 'ひと休みできる場所へ向かっている', house: '家の作業に向かっている', cut: '草を刈りに向かっている', tool: '棚へ道具を作りに向かっている', stackwood: '薪をまとめに向かっている', assemble: '焼いた器を取りに向かっている', wick: '棚で芯をよりに行く', stow: '作業台へ部材を置きに行く', take: '作業台へ部材を取りに行く', seastone: '石を拾いに潜りに行く', nest: '休み場に石を運んでいる', ledge: 'カメマルの岩棚へ石を運んでいる', stonedrop: '石を浜の石置き場へ運んでいる', wallfetch: '石置き場へ石を取りに行く', wall: '石を石垣へ運んでいる', shelter: '雨風をよけに屋根の下へ',
    };
    if (tk && !tk.arrived && toward[k]) return toward[k] + left;
    const base: Record<string, string> = {
      sleep: r.id === 'kame' && r.wet ? (r.act === 'breathe' ? '眠りの合間に息つぎに浮かんできた' : '海の底の岩かげで眠っている') : r.wet ? '仰向けで波に揺られて眠っている' : '眠っている', charge: '日なたで充電している', gather: tk?.arrived ? '流木を拾っている' : '流木を探しに浜へ', carry: '流木を運んでいる', build: '小屋を建てている', house: '家を建てている', fell: '林の木を切り倒している', tool: '道具を作っている', stackwood: '薪を1つの山にまとめている', assemble: '焼いた器を鍋にしている', wick: '灯皿の芯をよっている', stow: '部材を作業台の脇に置いている', take: '部材を手に取っている', seastone: '海の底で石を拾っている', nest: '休み場の囲いに石を積んでいる', ledge: 'カメマルの岩棚のまわりに石を置いている', stonedrop: '浜に石を置いている', wallfetch: '石置き場で石を取っている', wall: '石垣を積んでいる', pit: '粘土の池を掘っている', twist: '縄をなっている', cut: '茅にする草を刈っている', weigh: '屋根に重しをかけている',
      look: '海を眺めている', wander: '散歩している', watch: '浜で海を観察している', swim: 'ラグーンを泳いで記録している', rest: '丘のふもとで夜を待っている', think: '丘の上で星を見て考えごとをしている',
      explore: '夜の島を歩いて地図を作っている', float: '沖で仰向けに浮かんでいる', crack: 'お腹の上で貝を割っている', collect: '浜で貝殻を拾っている', pile: '貝殻を浜に並べている', nap: '仰向けに浮いたまま昼寝している',
      visit: 'となりの浜のほうへ散歩している', approach: '誰かに気づいて近づいていく', idle: 'ひと休みしている', ponder: 'どうするか考えている', photo: `${tk?.data?.ob?.label?.replace(/（.*?）$/, '') ?? '景色'}を写真に撮っている`, answer: tk?.data?.yes ? '頼みを引き受けている' : '頼みを断っている',
    };
    return base[k] ?? 'ひと休みしている';
  }
  const res: Residents = {
    list, bonds, talks, group,
    get study() { return study; },
    get worldTime() { return clockMs; },
    setStudyWeather(cloud, source) { studyCloud = cloud !== null && Number.isFinite(cloud) ? Math.min(1, Math.max(0, cloud)) : null; studyCloudSource = source; },
    onEvent: () => { /* set by the app */ },
    onSay: () => { /* set by the app */ },
    hide: '',
    body: (r) => bodyOf(r),
    mind: (r) => agentOf(r) ?? null,
    profile: (r) => profileOf(r),
    // (a photograph drawn again: the one who took it not drawn — it is behind the lens — the others where they were,
    // and everyone held still)
    pose(rec) {
      if (!rec) { still = false; res.hide = ''; return; }   // (back to life)
      still = true; settled = true; res.hide = rec.who;
      // (what it photographed, if it has since been picked up: put back where it lay, for the picture)
      const k = rec.subject.kind as ItemKind;
      if (['wood', 'shell', 'stone'].includes(k) && !items.list.some((it) => it.kind === k && Math.hypot(it.x - rec.look[0], it.z - rec.look[2]) < 0.6)) items.addAt(k, rec.look[0], rec.look[2]);
      for (const o of rec.others) { const x = byId[o.id]; if (!x) continue; x.pos.set(o.x, o.y, o.z); x.head = o.head; x.act = o.act as Act; x.holding = o.holding as Resident["holding"]; x.task = null; x.talk = null; x.saying = ''; }
    },
    setBrain: (b) => { brainOverride = b; },
    setWeather: (w) => {
      const was = storm(); wxNow = w;
      const p = w ? `（気圧 ${Math.round(w.pressure)}hPa・最大瞬間風速 ${Math.round(w.gust)}m/s）` : '';
      if (!was && storm()) {   // a typhoon comes in: everyone records it; those with a mind have something to think about
        stormSince = clockMs; hypoStorm(clockMs);
        for (const r of list) if (r.sp.living) village.onsetHunger[r.id] = r.hunger;
        // (one who is up tells those near it, plainly: to shelter)
        { const awake = (x: Resident) => !sleepTime(x, localHour(clockMs)) && !x.talk, caller = [byId.lantern, byId.dot].find((x) => x && awake(x));
          if (caller) for (const o of list.filter((x) => x !== caller && awake(x) && Math.hypot(x.pos.x - caller.pos.x, x.pos.z - caller.pos.z) < 60).slice(0, 3)) {
            const c = exchange(caller, o); utter(caller, { act: 'order', to: o.id as Who, deed: 'shelter', why: 'typhoon' }, 0, c); utter(o, { act: 'will-go' }, 2000, c);
          } }
        for (const r of list) { r.diary.push({ at: clockMs, text: `台風が来た${p}。外での作業と食事ができない`, key: 'weather' }); const a = agentOf(r); if (a) a.why = '台風が来た'; }
        res.onEvent('weather', `台風が来た${p}`, list[0]);
      } else if (was && !storm()) {   // it has passed: the beds and the rocky bottom are torn up; the sea brings things up the beach
        hypoStormEnd(clockMs); stormOutcome();
        for (const b of beds) { regrowBed(b, clockMs); b.grass *= 0.35; }
        for (const pt of patches) { regrow(pt, clockMs); for (const k of Object.keys(pt.stock) as (keyof typeof pt.stock)[]) pt.stock[k] = Math.floor(pt.stock[k] / 2); }
        const hours = Math.max(1, Math.round((clockMs - stormSince) / 3.6e6));
        for (const r of list) { r.diary.push({ at: clockMs, text: `台風が過ぎた（約${hours}時間）`, key: 'weather' }); const a = agentOf(r); if (a) a.why = '台風が過ぎた'; }
        res.onEvent('weather', '台風が過ぎた。藻場と岩場が荒れ、浜に漂着物が打ち上がった', list[0]);
        drift.t = 1e9;   // (something washes up)
      }
    },
    observe: (r) => observe(r),
    solids, drift, lab,
    labCase(r) {
      // (the save as it stands: its length and a short hash, so two reports can tell whether they began from the same)
      let snap = 'none';
      try { const t = localStorage.getItem(saveKey); if (t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); snap = `${saveKey}:${t.length}:${(h >>> 0).toString(16)}`; } } catch (e) { snap = 'unreadable'; }
      const tk = r.task, sn = res.sense(r), f = (v: number) => +v.toFixed(2);
      return {
        seed: 'none (Math.random: the residents are not seeded)', saveSnapshot: snap, residentMode: study ? 'study' : 'normal',
        residentClock: new Date(clockMs).toISOString(), residentId: r.id,
        pose: { x: f(r.pos.x), y: f(r.pos.y), z: f(r.pos.z), head: f(r.head), act: r.act, wet: r.wet, holding: r.holding || '' },
        task: tk ? { kind: tk.kind, x: f(tk.x), z: f(tk.z), arrived: tk.arrived, t: f(tk.t), dur: f(tk.dur) } : null,
        targetId: tk?.data?.id ?? tk?.data?.studyId ?? (typeof tk?.data === 'string' ? tk.data : null),
        approach: r.goal && !r.goal.none ? [f(r.goal.x), f(r.goal.z)] : null,
        path: r.path?.pts.map(([x, z]) => [f(x), f(z)]) ?? null,
        observedIds: sn.marks.map((m) => `${m.kind}:${m.label}`),
        actionResult: r.went ?? null, blocked: f(r.blocked), body: bodyOf(r),
        mind: agentOf(r) ? { goal: agentOf(r)!.goal, why: agentOf(r)!.why, calls: agentOf(r)!.calls, results: agentOf(r)!.results.slice(-6), knowledge: agentOf(r)!.knowledge.slice(-6) } : null,
      };
    },
    sense(r) {
      const EYE: Record<string, number> = { dot: 0.9, kame: 0.46, lantern: 0.88, rakko: 0.62 };
      const fx = Math.sin(r.head), fz = Math.cos(r.head);
      const eye = new THREE.Vector3(r.pos.x + fx * 0.2, r.wet ? Math.max(0.32, r.pos.y + 0.3) : r.pos.y + EYE[r.id] * r.sp.scale, r.pos.z + fz * 0.2);
      if (r.id === 'kame' && r.wet && r.act === 'swim') eye.y = r.pos.y + 0.2;   // (swimming under the water, looking through it)
      if (r.wet && r.pos.y < -0.3) eye.y = r.pos.y + 0.15;   // (down on the bottom)
      // (the model's own eyes, where it has one and is drawn near: its head's turn, nod and the gaze it is giving)
      let look: THREE.Vector3 | undefined;
      const en = r.model.eye;
      if (en && Math.hypot(r.pos.x - camAt.x, r.pos.z - camAt.z) < 160) {
        en.updateWorldMatrix(true, false);
        en.getWorldPosition(eye);
        look = new THREE.Vector3(0, 0, 1).transformDirection(en.matrixWorld);
      }
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
      if (village.house.n > 0 && near(houseG.position.x, houseG.position.z, 90)) marks.push({ x: houseG.position.x, y: houseG.position.y + 3.8, z: houseG.position.z, kind: 'place', label: 'ドットの家', sub: village.house.n >= HOUSE_N ? (village.house.lost ? `茅が${village.house.lost}段飛んだ` : '完成') : `${village.house.n}/${HOUSE_N}`, hot: tk?.kind === 'house' });
      if (village.pier !== 'none' && near(pierAt.x, pierAt.z, 90)) { const [x, z] = along(5); marks.push({ x, y: 1.3, z, kind: 'place', label: '桟橋', sub: village.pier === 'plan' ? '計画中' : village.pier === 'done' ? '完成' : `土台 ${village.bases}/4・柱 ${village.posts}/4・板 ${village.deck}/8`, hot: ['survey', 'inspect', 'base', 'post', 'deck'].includes(tk?.kind ?? '') }); }
      if (drift.kind >= 0 && !list.some((o) => o.holding === 'drift') && near(drift.x, drift.z, 60)) marks.push({ x: drift.x, y: L.h(drift.x, drift.z) + 0.2, z: drift.z, kind: 'drift', label: '？ 見慣れないもの', hot: tk?.kind === 'find' });
      let target: Mark | null = marks.find((m) => m.hot) ?? null;
      if (!target && tk && !tk.arrived) target = { x: tk.x, y: L.h(tk.x, tk.z) + 0.2, z: tk.z, kind: 'goal', label: '目的地', hot: true };
      const ag = agentOf(r), g = ag?.goal;
      const goal = g ? { text: g.text, why: g.why, by: g.by, steps: g.steps.map((id) => { const o = optionsFor(r, ag!).find((x) => x.id === id); return o ? o.label.replace(/（.*?）$/, '') : id; }) } : undefined;
      return { eye, look, head: r.head, marks, target, task: tk?.kind ?? 'idle', built: byId.dot.stats.built, hutN: HUT.length, food: byId.dot.stats.food, ...(goal ? { goal } : {}) };
    },
    gibber: (id: string) => { const r = byId[id]; return r?.sayIsl ? `${glyphs(r.sayIsl)}<small>${kana(r.sayIsl)}</small>` : ''; },
    update(dt, ms, cam) {
      camAt.set(cam.x, cam.y, cam.z);
      clockMs = ms; inspectCool -= dt; admireCool -= dt; seeCool -= dt; showCool -= dt;
      items.tick(dt); tickDrift(dt); catchRain(dt);
      if ((labT -= dt) < 0) { labT = 30; tickLab(); }
      // (the first time: anyone put down inside something solid — a save from before it was there, a home spot
      // on a rock — is set just outside it, where it can stand)
      if (!settled) { settled = true; for (const r of list) { const ap = solids.approach(r.pos.x, r.pos.z, bodyOf(r), feetAt(r), r.pos.x + 1, r.pos.z, standOn(r, r.wet)); if (ap && (ap[0] !== r.pos.x || ap[1] !== r.pos.z)) { r.pos.x = ap[0]; r.pos.z = ap[1]; placeY(r); } } }
      // (those with a mind of their own keep looking while they work; something new stops them — between steps)
      // (asked while its body's needs come first — hungry, asleep — it does not leave the other waiting: a no, and why)
      for (const q of requests) if (q.status === 'open' && clockMs - q.at > 30e3) answer(byId[q.to], q, false, refuseWhy(byId[q.to]));
      if ((lookT -= dt) < 0) { lookT = 1; for (const r of list) { const a = agentOf(r); if (!a || r.act === 'sleep' || r.talk) continue; a.look(observe(r)); if (a.struck && r.task && !r.task.arrived && r.task.opt) { report(r, r.task, 'interrupted', '気になるものが見えた'); items.release(r.id); if (drift.by === r.id && r.holding !== 'drift') drift.by = ''; r.task = null; } } }
      for (const r of list) dayStart(r);
      if (!still) for (const r of list) step(r, dt, false);   // (still: posed for a photograph, nobody moves on)
      for (let i = 0; i < utterQ.length; i++) {
        const u = utterQ[i]; if (u.at > clockMs) continue;
        const w = byId[u.who];
        if (w?.talk && clockMs - u.at < 90e3) continue;   // (in a conversation of its own: said when that is over, if soon)
        utterQ.splice(i--, 1);
        if (!w || w.talk || w.act === 'sleep') continue;   // (asleep, or still talking long after: let go)
        const m = phrase(u.f); say(w, m.ja, u.conv || heading(w.v.name), false, m.isl, m.en);
      }
      if (!still && dt < 2) gains();   // (what rest, food and sun gave back: shown, softly, by each of them — not while catching up)
      fireCircle(dt, false);
      // their lights: on after dark while they are up and about (not asleep, not under the water)
      { const nightK = 1 - dayK(localHour(ms)), tt = performance.now() / 1000;
        list.forEach((r, i) => {
          const Lt = LIGHT[r.id], on = r.sp.living ? 0 : nightK * (r.act === 'sleep' || (r.wet && r.act === 'swim') ? 0 : 1);   // (the animals carry no light)
          r.lightK = (r.lightK ?? 0) + (on - (r.lightK ?? 0)) * Math.min(1, dt * 0.8);
          const fx = Math.sin(r.head), fz = Math.cos(r.head), sway = Math.sin(tt * 1.3 + i) * 0.15;
          const ahead = r.mo.probe >= 0 ? 0.55 : Lt.ahead;   // (trying the footing: the light on the next foothold)
          U.uLights.value[i].set(r.pos.x + (fx + fz * sway) * ahead, r.pos.y, r.pos.z + (fz - fx * sway) * ahead, r.lightK * Lt.k * (0.94 + 0.06 * Math.sin(tt * 2.1 + i * 2)));
          (U.uLightR.value as any).setComponent(i, Lt.r);
          U.uLightC.value[i].set(((Lt.c >> 16) & 255) / 255, ((Lt.c >> 8) & 255) / 255, (Lt.c & 255) / 255);
          r.beam.visible = r.lightK > 0.02; (r.beam.material as THREE.MeshBasicMaterial).opacity = 0.07 * r.lightK; r.beam.rotation.y = sway * 0.6;
        }); }
      animateWork(dt);
      if ((meetT -= dt) < 0) { meetT = 1; checkMeetings(false); }
      for (const r of list) {
        const near = Math.hypot(r.pos.x - cam.x, r.pos.z - cam.z) < 160;
        r.model.root.visible = near && res.hide !== r.id && !(r.task?.kind === 'voyage' && r.task.data?.started);   // (out on the crossing: not on the island)
        if (!near) continue;
        r.model.root.position.copy(r.pos); r.model.root.rotation.set(0, r.head, 0);
        // settled on the bottom: the shell lies with the slope of the sand under it, and a soft shade under it
        const onBottom = r.id === 'kame' && r.wet && r.under > 0.5 ? r.under : 0;
        if (onBottom) {
          const fx = Math.sin(r.head), fz = Math.cos(r.head), e = 0.35;
          const pitch = Math.atan2(L.h(r.pos.x + fx * e, r.pos.z + fz * e) - L.h(r.pos.x - fx * e, r.pos.z - fz * e), 2 * e);
          const roll = Math.atan2(L.h(r.pos.x + fz * e, r.pos.z - fx * e) - L.h(r.pos.x - fz * e, r.pos.z + fx * e), 2 * e);
          r.model.root.rotation.set(-pitch * onBottom, r.head, -roll * onBottom, 'YXZ');
        }
        const sh = shades[list.indexOf(r)];
        sh.visible = r.id === 'kame' && onBottom > 0.3 && r.model.root.visible;
        if (sh.visible) { sh.position.set(r.pos.x, L.h(r.pos.x, r.pos.z) + 0.02, r.pos.z); sh.rotation.set(-Math.PI / 2, 0, -r.head); (sh.material as THREE.MeshBasicMaterial).opacity = 0.32 * onBottom; }
        const act: Act = r.id === 'dot' ? r.act : !r.sp.living && (r.act === 'pick' || r.act === 'hammer' || r.act === 'chop' || r.act === 'dig') ? 'work' : r.act;   // (each sits at the fire in its own way)
        const tk = r.task, k = tk && tk.arrived ? Math.min(1, tk.t / tk.dur) : 0;
        const food = tk?.kind === 'eat' ? tk.data : tk?.kind === 'forage' && k > 0.8 ? tk.data?.prey ?? '' : '';   // (coming up with it in its paws)
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
        updateLook(r, dt);
        let look: [number, number, number] | undefined;
        if (mo.look) { r.model.root.updateMatrixWorld(); const v = r.model.root.worldToLocal(_lv.copy(mo.look)); look = [v.x, v.y, v.z]; }
        r.model.update(performance.now() / 1000 + r.sp.home[0], dt, { act, walk: mo.gait, night: 1 - dayK(localHour(ms)), wet: r.wet, k, food, stride: mo.stride, look, key: mo.key, elapsed: mo.t, task: tk?.kind, bottom: r.wet && r.sp.living ? r.under : 0, probe: mo.probe >= 0 ? mo.probe : undefined, beat: beatOf(r) });
        // what it has in its hands (Dot's arms hold a log themselves)
        if (r.model.carry) r.model.carry.visible = r.holding === 'wood';
        const hk = r.holding === 'wood' && r.model.carry ? '' : r.holding;
        r.held.visible = !!hk && !(r.task?.kind === 'craft' && r.task.arrived);
        if (hk === 'piece') { lying(HUT[r.stats.built < HUT.length ? r.stats.built : 0], r.held); r.held.scale.setScalar(0.6); }
        else if (hk === 'grass') { r.held.geometry = grassGeo; r.held.material = grassM; r.held.rotation.set(0, 0, Math.PI / 2); r.held.scale.setScalar(1); }
        else if (hk === 'plank') { r.held.geometry = planks[0].geometry; r.held.material = wood; r.held.rotation.set(0, 0, 0); r.held.scale.set(0.5, 1, 0.3); }
        else if (hk === 'drift') { if (drift.kind >= 0) { r.held.geometry = DRIFT[drift.kind].geo; r.held.material = DRIFT[drift.kind].mat; } r.held.rotation.set(0, 0, 0); r.held.scale.setScalar(1); }
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
          if (on) { el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(0)}px) translate(-50%, -100%)`; const sub = r.sayIsl ? subtitle({ ja: r.saying, en: r.sayEn }) : r.saying, key = r.saying + '|' + sub;
            if (el.dataset.t !== key) { el.dataset.t = key; el.innerHTML = `<b>${r.v.name}</b>${r.sayIsl ? `${glyphs(r.sayIsl)}${sub ? `<span class="sub">${sub}</span>` : ''}` : r.saying}`; } }   // (the bubble: who, the island's letters, and under them what it means in the chosen language; no reading — owner's decision)
        } else el.style.opacity = '0';
      }
      // (their small green numbers: above them, drifting up, gone in a few seconds)
      const now = performance.now(), box = document.getElementById('bubbles');
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i], age = (now - p.born) / 1000;
        if (age > 3.2 || !box) { p.el?.remove(); pops.splice(i, 1); continue; }
        if (!p.el) { p.el = document.createElement('div'); p.el.className = `gain gain-${p.k}`; p.el.textContent = p.text; box.appendChild(p.el); }
        const stack = pops.filter((q) => q.r === p.r && q.born > p.born).length;   // (two at once: one above the other)
        v.copy(p.r.pos); v.y += 1.0 * p.r.sp.scale + (p.r.wet ? 0.3 : 0) + age * 0.12;
        const d = v.distanceTo((camera as any).position); v.project(camera);
        const on = p.r.model.root.visible && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < 35;
        p.el.style.opacity = on ? String(Math.min(1, age * 3) * Math.min(1, (3.2 - age) / 1.2) * 0.9) : '0';
        if (on) p.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w + 18).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * h - stack * 16).toFixed(0)}px)`;
      }
    },
  };
  (res as any).items = items;   // (for ?debug)
  (res as any).village = village; (res as any).items = items; (res as any).lab = lab; (res as any).T = T; (res as any).houseG = houseG; (res as any).shelterK = shelterK; (res as any).labReady = () => labReady().map((x) => x.entry.processId); (res as any).craftShow = (v: typeof craftShow) => (craftShow = v); (res as any).setCatalog = (c: CatalogEntry[]) => (catalog = c);   // (for checks)
  (res as any).patches = patches; (res as any).beds = beds;   // (for checks: robots/body.ts)
  let convN = 0;
  function say(r: Resident, text: string, conv: number, fast: boolean, isl?: Tok[], en?: string) {
    r.saying = text; r.sayT = 0; r.sayIsl = isl ?? null; r.sayEn = en ?? null;
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
  // Round the fire: the island's custom (not for warmth, not for company — it is what is done of an evening). Those
  // who are up sit round it, and each in turn reports: how far it has got, what it did, what it found; what one knows
  // that another gathers is passed on, as in any meeting. After a few evenings, a proposal to build a pier together.
  let circleMorning = false;
  // The morning: what the night showed (the gauge Lantern read while the others slept, and its guess about storms), and
  // what each will do today, heard by all; one with the day's work in its hands and nothing to do it with is offered help.
  const planOf = (r: Resident): 'hut' | 'map' | 'wood' | 'shells' | 'eat' | 'sleep' =>
    r.id === 'lantern' ? 'sleep' : r.id === 'kame' ? 'eat' : r.id === 'rakko' ? (r.hunger > (r.body?.learn.eatAt ?? 0.5) ? 'eat' : 'shells')
      : r.stats.built < HUT.length ? 'hut' : Object.keys(village.map.seen).length > Object.keys(village.map.reached).length ? 'map' : 'wood';
  const morningPlans: Record<string, string> = {};
  let nightTold = false;
  const say_ = (who: string, f: Frame) => { const m = phrase(f); return { who, line: m.ja, isl: m.isl, en: m.en }; };
  const qs = (who: string, f: Frame) => fireQueue.push(say_(who, f));
  let lastNight: { f: Frame; at: number; heard: Set<string> } | null = null;
  // (what one has to tell another — that what it brought was of use, that what it was told was not there — said when
  // both are at the gathering)
  function deliverFeedback(seated: Resident[]) {
    const ids = new Set(seated.map((r) => r.id));
    for (const fb of [...village.feedback]) {
      if (!ids.has(fb.from) || !ids.has(fb.to)) continue;
      village.feedback.splice(village.feedback.indexOf(fb), 1);
      qs(fb.from, fb.f); qs(fb.to, { act: 'noted' });
      const to = byId[fb.to], from = byId[fb.from];
      if (fb.f.act === 'helped') { to.diary.push({ at: clockMs, text: `${from.v.name}から、届けた流木が小屋の部材になったと聞いた`, key: 'met', with: from.id }); agentOf(to)?.values.bonus(`give:${from.id}`, `${from.v.name}に流木を届ける`, 0.5); }
      else to.diary.push({ at: clockMs, text: `${from.v.name}から、教えた場所に${fb.f.act === 'heard-wrong' && fb.f.what === 'wood' ? '流木' : 'それ'}はなかったと聞いた`, key: 'met', with: from.id });
    }
  }
  function morningNight(seated: Resident[]) {
    const ln = byId.lantern;
    const night = village.gaugeLog.filter((g) => g.at > clockMs - 12 * 3.6e6), marks = night.filter((g) => g.mark !== undefined);
    const alarm = lanternAlarm();
    const nf: Frame = { act: 'tell-night', reads: marks.length, mark: marks[marks.length - 1]?.mark, alarm };
    const lines: { who: string; line: string; isl?: Tok[]; en?: string }[] = [say_('lantern', nf)];
    if (marks.length) lastNight = { f: nf, at: clockMs, heard: new Set(seated.map((r) => r.id)) };
    // (its guess, as it stands, and how the world has answered it so far; how the gauge is read, the first time)
    const h = village.hypo;
    if (h) {
      lines.push(say_('lantern', { act: 'tell-guess', if: 'mark-high', then: 'typhoon' }));
      if (h.heat) lines.push(say_('lantern', { act: 'tell-guess', if: 'hot', then: 'mark-up' }));
      if (h.status !== 'testing') lines.push(say_('lantern', { act: 'tell-guess-status', held: h.status === 'held', hits: h.hits, wrong: h.falses + h.misses }));
      const h2 = village.hypo2;
      if (h2) {
        lines.push(say_('lantern', { act: 'tell-guess', if: 'mark-up-day', then: 'typhoon' }));
        if (h2.hits + h2.falses + h2.misses > 0) lines.push(say_('lantern', { act: 'tell-guess-status', held: h2.status !== 'doubted' && h2.hits * 2 >= h2.falses + h2.misses, hits: h2.hits, wrong: h2.falses + h2.misses }));
      }
      if (!village.taught['read-gauge']) { village.taught['read-gauge'] = clockMs; lines.push(say_('lantern', { act: 'teach', how: 'read-gauge' })); }
    }
    // (a storm may come: Lantern proposes to put food by, and that it will keep reading the gauge; the others agree)
    if (alarm && !prepActive()) lines.push(...prepLines('lantern', seated));
    lines.push(...settleLines(seated));
    fireQueue.unshift(...lines);
    for (const t of seated) if (t !== ln && marks.length) {
      t.diary.push({ at: clockMs, text: `朝の集まりで、ランタンから夜の気圧計の話を聞いた（${marks.length}回読んで、目盛り${marks[marks.length - 1].mark}${alarm ? '。台風が来るかもしれない' : ''}）`, key: 'met', with: 'lantern' });
      const a = agentOf(t);
      if (a) { a.knowledge.push({ id: `k${a.knowledge.length + 1}:night`, text: `ランタンによると、夜に気圧計を${marks.length}回読んで目盛りは${marks[marks.length - 1].mark}${alarm ? '。台風が来るかもしれない' : ''}`, source: 'heard', at: clockMs }); if (alarm) a.why = 'ランタンが、台風が来るかもしれないと言った'; }
    }
  }
  function morningAsk(who: Resident, seated: Resident[], fast: boolean) {
    const asker = seated.find((r) => r.id === lastSpeaker && r !== who) ?? seated.find((r) => r !== who)!;
    for (const r of seated) if (r !== asker) r.saying = '';
    if (!fireConv) fireConv = heading('朝の集まり');
    { const m = phrase({ act: 'ask-plan', to: who.id as Who }); say(asker, m.ja, fireConv, fast, m.isl, m.en); }
    // (one whose getting ready has paid before asks, of itself, whether a storm is coming — of the one whose sign it heeded)
    askStorm(seated);
    const doing = planOf(who); morningPlans[who.id] = doing;
    { const m = phrase({ act: 'plan', doing }); fireQueue.push({ who: who.id, line: m.ja, isl: m.isl, en: m.en }); }
    // (Kamemaru, who knows the sea, tells of a long swell — the long-period kind that runs ahead of a storm, a thing any
    // sailor knows; the world keeps count of whether a storm followed: swellTick)
    if (who.id === 'kame') swellMorning();
    // (out to sea in a wind: Kamemaru, who knows the sea, forbids it; asked why, it says)
    if ((who.id === 'dot' || who.id === 'kame') && morningPlans.dot === 'map' && !morningPlans.seaTold && (wxNow?.windMeasured ?? wxNow?.wind ?? 0) >= 8 && seated.some((r) => r.id === 'kame')) {
      morningPlans.seaTold = '1';
      qs('kame', { act: 'forbid', to: 'dot', deed: 'sea' }); qs('dot', { act: 'ask-why' }); qs('kame', { act: 'tell-why', why: 'wind' }); qs('dot', { act: 'noted' });
      fireQueue.push({ who: '', line: 'nosea' });
    }
    for (const t of seated) if (t !== who) t.diary.push({ at: clockMs, text: `朝の集まりで、${who.v.name}は今日${PLAN_JA[doing]}と言った`, key: 'met', with: who.id });
    lastSpeaker = asker.id;
    // (all have said: the hut wants wood and Dot has none — Rakko, if it is not hungry, offers to bring it)
    if (seated.every((r) => fireUsed.has(r.id))) {
      const dot = seated.find((r) => r.id === 'dot'), rk = seated.find((r) => r.id === 'rakko');
      const asked = requests.some((q) => q.from === 'dot' && q.to === 'rakko' && (q.status === 'open' || q.status === 'accepted'));
      if (dot && rk && (morningPlans.dot === 'hut') && !dot.holding && morningPlans.rakko !== 'eat' && !asked) {
        { const m = phrase({ act: 'offer-help', to: 'dot', what: 'wood' }); fireQueue.push({ who: 'rakko', line: m.ja, isl: m.isl, en: m.en }); }
        { const m = phrase({ act: 'accept-help' }); fireQueue.push({ who: 'dot', line: m.ja, isl: m.isl, en: m.en }); }
        fireQueue.push({ who: '', line: 'help' });
        // (and who does what, said back by one of the others)
        const sum = seated.find((r) => r.id === 'kame') ?? seated.find((r) => r.id === 'lantern');
        if (sum) qs(sum.id, { act: 'assign', parts: [{ who: 'dot', deed: 'hut' }, { who: 'rakko', deed: 'wood' }] });
      } else if (dot && morningPlans.dot === 'hut' && !dot.holding && !asked) {
        // (no one to bring it: Rakko is hungry, or not there — Dot asks whether it is, and where wood is)
        if (rk && morningPlans.rakko === 'eat') { qs('dot', { act: 'ask-body', to: 'rakko', what: 'hungry' }); qs('rakko', { act: 'tell-body', hungry: true }); }
        qs('dot', { act: 'ask-where', what: 'wood' });
        const knows = seated.filter((o) => o !== dot).map((o) => ({ o, ob: tip(o, dot) })).find((x) => x.ob);
        if (knows) { qs(knows.o.id, { act: 'tell-where', what: 'wood', metres: knows.ob!.dist }); agentOf(dot)?.hear(knows.ob!, knows.o.id, `${knows.o.v.name}によると、${knows.ob!.label}が${Math.round(knows.ob!.dist)}mほど先にある`, clockMs); }
        else { const o = seated.find((x) => x !== dot); if (o) qs(o.id, { act: 'dont-know', what: 'wood' }); }
      }
    }
  }
  /* ---------- living near each other (docs/proposals/sumika-2026-10-07.md 2.5) ---------- */
  // The world only counts: how far each comes to the gatherings, twice a day (village.walks, there; back is as far).
  // Once Dot's house has walls — room for two robots and Lantern's desk — Lantern, who comes furthest, says so at the
  // morning gathering and proposes to move their homes near each other; Dot agrees, and Lantern's home becomes the house.
  // The animals cannot live on land: each reckons for itself whether a quiet place in the sea in front of the house would
  // pay — the walk to the gatherings saved, against the swim to where it feeds, and a quiet place of its own already
  // built where it is — and says yes or no with its reasons. One not there is asked at a later morning.
  // (each way, to a gathering and back from it to where it went next: the last eight)
  function walked(r: Resident, m: number) { const w = (village.walks[r.id] ??= []); w.push(Math.round(m)); if (w.length > 8) w.shift(); }
  const dailyWalk = (id: string) => { const w = village.walks[id] ?? []; return w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length * 4) : 0; };   // (four ways a day: there and back, twice)
  const lanternRoom = (): [number, number] => { const w = atHouse(-0.55, -0.8); return [w.x, w.z]; };   // (the far left of the house, clear of Dot's place by the bed and of the walls)
  /** What an animal's own count says about moving its resting place to the sea in front of the house. */
  function animalReckon(r: Resident): { yes: boolean; at: [number, number] | null; why: 'far-food' | 'my-place'; text: string } {
    const isR = r.id === 'rakko', ok = isR ? water(0.6, 1.3) : water(1.5, 5);
    const at = nearestWhere([PIT.x, PIT.z], 220, (x, z, h) => ok(x, z, h));
    if (!at) return { yes: false, at: null, why: 'far-food', text: '集落の前の海に、休める深さの所がない' };
    const food = (isR ? patches : beds).map((f) => [f.x, f.z] as [number, number]);
    const toFood = (p: [number, number]) => { const ds = food.map((f) => Math.hypot(f[0] - p[0], f[1] - p[1])).sort((a, b) => a - b).slice(0, 3); return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0; };
    const meals = isR ? 4 : 2, home = r.sp.home;
    const more = Math.round(meals * 2 * Math.max(0, toFood(at) - toFood(home))), saved = Math.max(0, Math.round(dailyWalk(r.id) - 4 * Math.hypot(at[0] - PIT.x, at[1] - PIT.z)));
    const place = isR ? (village.nest.n > 0 ? `住処の近くに石の囲い（${village.nest.n}/${NEST_N}）がある` : '') : (village.kameBed ? `住処の近くに岩棚の寝場所がある${village.ledge.n ? `（ラッコが石を${village.ledge.n}個置いた）` : ''}` : '');
    const text = `集落の前の海（火から${Math.round(Math.hypot(at[0] - PIT.x, at[1] - PIT.z))}m）に移ると、集まりへの道のりは1日約${saved}m減り、${isR ? '採餌場' : '藻場'}までの泳ぎは1日約${more}m増える${place ? `。${place}` : ''}`;
    if (place) return { yes: false, at, why: 'my-place', text };
    return { yes: saved > more, at, why: 'far-food', text };
  }
  function settleLines(seated: Resident[]) {
    const out: { who: string; line: string; isl?: Tok[]; en?: string }[] = [], ids = seated.map((r) => r.id);
    const st = village.settle;
    if (!st) {
      if (hLevel() !== 'house' || !ids.includes('lantern') || !ids.includes('dot') || (village.walks.lantern?.length ?? 0) < 2 || dailyWalk('lantern') < 600) return out;
      out.push(say_('lantern', { act: 'tell-measure', what: 'walk', n: dailyWalk('lantern'), unit: 'metre' }), say_('lantern', { act: 'propose', deed: 'live-near' }), say_('dot', { act: 'agree-proposal' }));
    } else {
      if (!ids.includes('lantern')) return out;
      if (!seated.some((r) => r.sp.living && !st.asked[r.id])) return out;
      out.push(say_('lantern', { act: 'propose', deed: 'live-near' }));   // (asked again of one who was not there)
    }
    const yes: string[] = st ? [] : ['lantern', 'dot'];
    for (const r of seated) if (r.sp.living && !st?.asked[r.id]) {
      const k = animalReckon(r);
      out.push(say_(r.id, k.yes ? { act: 'agree-proposal' } : { act: 'object-proposal', why: k.why }));
      r.diary.push({ at: clockMs, text: `朝の集まりで、ランタンにすみかを近くに移そうと言われて数えた：${k.text}。${k.yes ? '移ることにした' : '今の所にいることにした'}`, key: 'met', with: 'lantern' });
      yes.push(k.yes ? `${r.id}@${k.at![0].toFixed(1)}@${k.at![1].toFixed(1)}` : `${r.id}:no`);
    }
    out.push({ who: '', line: `settle:${yes.join(',')}` });
    return out;
  }
  function settleDone(parts: string[], seated: Resident[]) {
    const first = !village.settle;
    const st = village.settle ??= { at: clockMs, by: 'lantern', asked: {}, homes: {} };
    for (const p of parts) {
      if (p === 'lantern') { st.asked.lantern = 'yes'; st.homes.lantern = lanternRoom(); byId.lantern.sp.home = st.homes.lantern; continue; }
      if (p === 'dot') { st.asked.dot = 'yes'; continue; }
      if (p.endsWith(':no')) { st.asked[p.slice(0, -3)] = 'no'; continue; }
      const [id, x, z] = p.split('@'); st.asked[id] = 'yes'; st.homes[id] = [+x, +z]; byId[id].sp.home = st.homes[id];
      if (id === 'rakko' && village.nest.n === 0) village.nest.at = null;   // (its quiet place, when it makes one: by its new home)
      if (id === 'kame') { village.kameBed = null; village.ledge.n = 0; drawLedge(); }   // (a new ledge, when it finds one: the stones counted afresh)
      res.onEvent('fire', `${byId[id].v.name}が、集落の前の海に休む場所を移すことにした`, byId[id]);
    }
    if (first) {
      const w = dailyWalk('lantern');
      byId.lantern.diary.push({ at: clockMs, text: `朝の集まりで、すみかを近くに移そうと提案した（毎日の道のり約${w}m）。ドットの家に住むことになった`, key: 'met', with: 'dot' });
      byId.dot.diary.push({ at: clockMs, text: '朝の集まりで、ランタンがすみかを近くに移そうと言った。ランタンが家に住むことになった', key: 'met', with: 'lantern' });
      res.onEvent('fire', `朝の集まりで、ランタンがドットの家に住むことが決まった（毎日の道のり約${w}m）`, byId.lantern);
    }
  }
  const SWELL_T = 9, SWELL_WAIT = islandWait(48 * 3.6e6);   // (a swell of 9 s or more between crests; a storm within two island days)
  // (one whose getting ready has paid before asks, of itself, whether a storm is coming — of the one who reads the signs,
  // once it has come to the gathering)
  function askStorm(seated: Resident[]) {
    if (morningPlans.askedStorm) return;
    // (Lantern, who reads the gauge, if it is up and coming; else Kamemaru, who reads the sea)
    const ln = seated.find((r) => r.id === 'lantern');
    if (!ln && byId.lantern && !sleepTime(byId.lantern, localHour(clockMs))) return;
    const f = ln ?? seated.find((r) => r.id === 'kame'); if (!f) return;
    const who = seated.filter((r) => r !== f && (village.heed[r.id] ?? 0) >= 1).sort((a, b) => (village.heed[b.id] ?? 0) - (village.heed[a.id] ?? 0))[0]; if (!who) return;
    morningPlans.askedStorm = '1';
    const likely = f.id === 'lantern' ? lanternAlarm() : !!village.swellGuess.alarm;
    qs(who.id, { act: 'ask-storm', to: f.id as Who }); qs(f.id, { act: 'tell-storm', likely, by: f.id === 'lantern' ? 'gauge' : 'swell' });
    who.diary.push({ at: clockMs, text: `朝の集まりで、${f.v.name}に台風が来るかを聞いた`, key: 'met', with: f.id });
  }
  // (a storm may come: the one who saw the sign proposes to get ready, the others agree, and who does what is said)
  function prepLines(by: 'lantern' | 'kame', seated: Resident[]) {
    const out: { who: string; line: string; isl?: Tok[]; en?: string }[] = [say_(by, { act: 'propose', deed: 'store-food', mine: by === 'lantern' ? 'gauge' : 'eat' })];
    for (const t of seated) if (t.id !== by) out.push(say_(t.id, { act: 'agree-proposal' }));
    out.push({ who: '', line: `prep:${by}` });
    const parts: { who: Who; deed: 'haul' | 'harvest' | 'eat' }[] = [];
    if (seated.some((r) => r.id === 'dot')) {
      if (village.raft.parts > 0 && !village.raft.hauled) parts.push({ who: 'dot', deed: 'haul' });
      if (PLOTS.some((pl) => pl.ok && pl.s === 2 && growth(pl) >= 0.6)) parts.push({ who: 'dot', deed: 'harvest' });
    }
    for (const id of ['rakko', 'kame'] as const) if (seated.some((r) => r.id === id)) parts.push({ who: id, deed: 'eat' });
    if (parts.length) out.push(say_(by, { act: 'assign', parts: parts.slice(0, 4) }));
    return out;
  }
  function swellMorning() {
    const w = wxNow, g = village.swellGuess;
    if (!w || storm() || w.swellPeriod === undefined || w.swellPeriod < SWELL_T) return;
    qs('kame', { act: 'tell-guess', if: 'swell-long', then: 'typhoon' });
    if (g.hits + g.falses > 0) qs('kame', { act: 'tell-guess-status', held: g.hits >= g.falses, hits: g.hits, wrong: g.falses });
    const txt = `朝の集まりで、カメマルが長いうねりの話をした（高さ${(w.swell ?? 0).toFixed(1)}m、${Math.round(w.swellPeriod)}秒ごと）`;
    for (const r of list) if (r.task?.kind === 'fire') r.diary.push({ at: clockMs, text: txt, key: 'met', with: 'kame' });
    if (!g.alarm) { g.alarm = clockMs; res.onEvent('fire', `カメマル：長いうねりが来ている。台風が来るかもしれない（${Math.round(w.swellPeriod)}秒ごとのうねり）`, byId.kame); }
    if (!prepActive() && !fireQueue.some((q) => q.line.startsWith('prep:'))) fireQueue.push(...prepLines('kame', list.filter((r) => r.task?.kind === 'fire' && r.task.arrived)));
  }
  function swellTick() {
    const g = village.swellGuess; if (!g.alarm) return;
    if (storm()) { g.hits++; g.alarm = 0; byId.kame.diary.push({ at: clockMs, text: `長いうねりのあとに台風が来た（当たり ${g.hits}・外れ ${g.falses}）`, key: 'study' }); }
    else if (clockMs - g.alarm > SWELL_WAIT) { g.falses++; g.alarm = 0; byId.kame.diary.push({ at: clockMs, text: `長いうねりのあと、台風は来なかった（当たり ${g.hits}・外れ ${g.falses}）`, key: 'study' }); }
  }
  function morningHelp() {
    const q: Request = { id: `req#${++reqN}`, from: 'dot', to: 'rakko', what: 'bring-wood', at: clockMs, status: 'accepted', conv: fireConv };
    requests.push(q); if (requests.length > 30) requests.shift();
    const a = agentOf(byId.rakko); if (a) a.why = `朝の集まりで申し出た：ドットに流木を届ける（${q.id}）`;
    byId.rakko.diary.push({ at: clockMs, text: '朝の集まりで、ドットに流木を運ぶと申し出て、頼まれた', key: 'met', with: 'dot' });
    byId.dot.diary.push({ at: clockMs, text: '朝の集まりで、ラッコが流木を運んでくれることになった', key: 'met', with: 'rakko' });
    res.onEvent('fire', '朝の集まりで、ラッコがドットに流木を運ぶことになった', byId.rakko);
  }
  // The evening, besides each one's day: what the rain catcher holds and how it is made (Lantern); what was told in the
  // morning, passed on to one who was not there; and, after a day when something told was of use, a word that telling is.
  const eveDone = new Set<string>();   // (each said once an evening, when the ones it needs have come)
  function eveningOpen(seated: Resident[]) {
    const ln = seated.find((r) => r.id === 'lantern');
    if (ln && village.catcher && !eveDone.has('catcher')) { eveDone.add('catcher');
      const l = shelfLots().filter((x) => x.materialId === 'process_water').reduce((n, x) => n + x.amount.value, 0) / 1e6;
      if (l >= 1) qs('lantern', { act: 'tell-measure', what: 'water', n: l, unit: 'litre' });
      if (!village.taught['catch-rain']) { village.taught['catch-rain'] = clockMs; qs('lantern', { act: 'teach', how: 'catch-rain' }); }
    }
    if (lastNight && clockMs - lastNight.at < 14 * 3.6e6 && (lastNight.f as any).alarm && !eveDone.has('relay')) {
      const teller = seated.find((r) => r.id !== 'lantern' && lastNight!.heard.has(r.id)), absent = seated.find((r) => !lastNight!.heard.has(r.id));
      if (teller && absent) { eveDone.add('relay'); qs(teller.id, { act: 'relay', from: 'lantern', said: lastNight.f }); qs(absent.id, { act: 'noted' }); lastNight.heard.add(absent.id); absent.diary.push({ at: clockMs, text: `焚き火の会で、${teller.v.name}から、ランタンの朝の話（台風が来るかもしれない）を聞いた`, key: 'met', with: teller.id }); }
    }
    const sage = seated.find((r) => r.id === 'kame') ?? ln;
    if (sage && clockMs - village.heardOkAt < 14 * 3.6e6 && clockMs - (village.taught['lecture:tell-seen'] ?? 0) > 3 * 86_400_000) {
      village.taught['lecture:tell-seen'] = clockMs; qs(sage.id, { act: 'lecture', deed: 'tell-seen', why: 'told-useful' });
    }
  }
  const MADE_OF: [RegExp, 'charcoal' | 'oil' | 'pot' | 'clay'][] = [[/charcoal/, 'charcoal'], [/oil/, 'oil'], [/vessel|pot/, 'pot'], [/clay/, 'clay']];
  function fireCircle(dt: number, fast: boolean) {
    const hr = localHour(clockMs);
    const seated = list.filter((r) => r.task?.kind === 'fire' && r.task.arrived);
    if (meetHours(hr)) circleMorning = morningHours(hr);   // (which of the two it is: they never overlap)
    if (!meetHours(hr)) {
      if (atFire.size > 1) {   // the evening is over: those who were there have identified each other, at least
        const ids = [...atFire];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const bd = bonds[pair(ids[i], ids[j])]; if (bd.stage < 1) bd.stage = 1; bd.last = clockMs; }
        const names = ids.map((id) => byId[id].v.name).join('・');
        if (circleMorning) { res.onEvent('fire', `${names}が朝の集まりに出た`, byId[ids[0]]); village.mornings = (village.mornings ?? 0) + 1; }
        else { res.onEvent('fire', `${names}が焚き火の会に出た`, byId[ids[0]]); village.fires++; lastFireAt = clockMs; }
      }
      fireQueue.length = 0;
      atFire.clear(); fireSaid = false; fireConv = 0; fireLines = 0; fireUsed.clear();
      return;
    }
    if (seated.length >= 2 && !fireSaid && circleMorning) { fireSaid = true; res.onEvent('fire', '朝の集まりが始まった', seated[0]); for (const k of Object.keys(morningPlans)) delete morningPlans[k]; nightTold = false; }
    if (circleMorning && fireSaid && !nightTold && seated.some((r) => r.id === 'lantern')) { nightTold = true; morningNight(seated); }
    if (circleMorning && fireSaid) askStorm(seated);   // (when it has come: it was up all night)
    if (seated.length >= 2 && !fireSaid) {
      fireSaid = true; res.onEvent('fire', '焚き火の会が始まった', seated[0]); eveDone.clear();
      const found = village.treasures.filter((t) => t.at > lastFireAt);
      for (const t of found) { const f = list.find((r) => r.v.name === t.who); if (f) { const m = SAY.found(t.what); fireQueue.push({ who: f.id, line: m.ja, isl: m.isl, en: m.en }); } }
      if (village.pier === 'none' && village.fires >= 2) {
        { const m = SAY.proposePier(); fireQueue.push({ who: 'kame', line: m.ja, isl: m.isl, en: m.en }); }
        for (const id of ['dot', 'rakko', 'lantern']) { const m = SAY.agreePier(id); fireQueue.push({ who: id, line: m.ja, isl: m.isl, en: m.en }); }
        fireQueue.push({ who: '', line: 'pier' });   // (then it is agreed)
      }
    }
    if (seated.length < 2) return;
    if (village.feedback.length) deliverFeedback(seated);
    if (!circleMorning && fireSaid) eveningOpen(seated);
    if ((fireTalkT -= dt) > 0) return;
    fireTalkT = fast ? 60 : rr(9, 16);
    while (fireQueue.length) {
      const q = fireQueue.shift()!;
      if (q.line === 'pier') { village.pier = 'plan'; drawPier(); res.onEvent('pier', '桟橋を共同で作ることが決まった。まずカメマルが位置を測る', seated[0]); continue; }
      if (q.line === 'help') { morningHelp(); continue; }
      if (q.line.startsWith('settle:')) { settleDone(q.line.slice(7).split(','), seated); continue; }
      if (q.line.startsWith('prep:')) {
        const by = q.line.slice(5); village.stormPrep = clockMs; village.prepBy = by; village.prepSaved = [];
        res.onEvent('fire', `朝の集まりで、${byId[by].v.name}の知らせで台風に備えることが決まった`, seated[0]);
        for (const r of seated) { r.diary.push({ at: clockMs, text: `朝の集まりで、${byId[by].v.name}の知らせで、台風に備えることに決めた`, key: 'met', with: by }); const a = agentOf(r); if (a) a.why = '台風に備えることになった'; }
        continue;
      }
      if (q.line === 'nosea') { morningPlans.dot = byId.dot.stats.built < HUT.length ? 'hut' : 'wood'; byId.dot.diary.push({ at: clockMs, text: '朝の集まりで、カメマルに「海に出るな。風が強いから」と言われた', key: 'met', with: 'kame' }); const a = agentOf(byId.dot); if (a) a.why = 'カメマルに、風が強いので海に出るなと言われた'; continue; }
      const w = byId[q.who]; if (!w || !seated.includes(w)) continue;
      for (const r of seated) if (r !== w) r.saying = '';
      if (!fireConv) fireConv = heading(circleMorning ? '朝の集まり' : '焚き火の会');
      say(w, q.line, fireConv, fast, q.isl, q.en); lastSpeaker = w.id;
      return;
    }
    // each reports once: its progress and the last thing it did; then what it can pass on to another; then quiet
    const who = seated.find((r) => !fireUsed.has(r.id));
    if (!who) {
      if (fireLines >= seated.length * 2) return;
      fireLines = seated.length * 2;
      for (const f of seated) for (const t of seated) {
        if (f === t) continue;
        const ob = tip(f, t); if (!ob) continue;
        { const m = SAY.share(ob.kind, ob.dist, t.id, true); fireQueue.push({ who: f.id, line: m.ja, isl: m.isl, en: m.en }); }
        agentOf(t)?.hear(ob, f.id, `${f.v.name}によると、${ob.label}が${Math.round(ob.dist)}mほど先にある`, clockMs);
        t.diary.push({ at: clockMs, text: `焚き火の会で、${f.v.name}から${ob.label}の位置を聞いた（約${Math.round(ob.dist)}m）`, key: 'met', with: f.id });
      }
      return;
    }
    // (one round the fire asks it what it did today — the one who spoke last, if not itself — and it answers from what
    // the world counted of its day: the answer comes on the next turn; in the morning, what it will do)
    fireUsed.add(who.id); fireLines++;
    if (circleMorning) { morningAsk(who, seated, fast); return; }
    const asker = seated.find((r) => r.id === lastSpeaker && r !== who) ?? seated.find((r) => r !== who)!;
    for (const r of seated) if (r !== asker) r.saying = '';
    if (!fireConv) fireConv = heading(circleMorning ? '朝の集まり' : '焚き火の会');
    { const m = phrase({ act: 'ask-day', to: who.id as Who }); say(asker, m.ja, fireConv, fast, m.isl, m.en); }
    { const did = dayCounts(who), m = phrase({ act: 'tell-day', did }); fireQueue.push({ who: who.id, line: m.ja, isl: m.isl, en: m.en }); }
    // (Lantern, with processes ended today: asked how they went, it says)
    if (who.id === 'lantern') {
      const done = village.labDone.filter((d) => clockMs - d.at < 14 * 3.6e6).map((d) => ({ d, made: MADE_OF.find(([re]) => re.test(d.processId))?.[1] })).filter((x) => x.made).slice(-2);
      if (done.length) { qs(asker.id, { act: 'ask-how', to: 'lantern' }); for (const x of done) qs('lantern', { act: 'tell-result', made: x.made!, ok: x.d.ok }); }
    }
    lastSpeaker = asker.id;
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
    for (const f of [...falling]) {   // (a forest tree coming down; it is gone once it lies, the logs left where it fell)
      f.t += dt; const k = Math.min(1, f.t / 2.6), a = k * k * Math.PI / 2;
      f.pivot.rotation.set(Math.cos(f.dir) * a, 0, -Math.sin(f.dir) * a);
      if (f.t > 4) { group.remove(f.pivot); f.pivot.traverse((o: any) => { if (!o.userData?.shared) o.geometry?.dispose?.(); }); /* (not the forest's own shape: it draws with it still) */ falling.splice(falling.indexOf(f), 1); }
    }
    // the fire: flames flicker, sparks rise, the light it throws
    const tt = performance.now() / 1000, craft = craftTick(tt); lampTick(tt);   // (a pot fired, or oil boiling: the fire burns for it — a pot fire heaped high)
    const hr = localHour(clockMs), lit = Math.max(fireHours(hr) ? 1 : 0, craft);
    fireK += (lit - fireK) * Math.min(1, dt * 0.5);
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
      // shavings fly at the end of each stroke of its plane (as its arms show it: models.ts craftBeat)
      const strokes = dot.mo.act === 'work' ? craftBeat(dot.mo.t, dot.mo.key).strokes : 0;
      if (strokes > lastStrokes && dot.model.root.visible) for (let q = 0; q < 4; q++) {
        const c = chips[chipNext++ % CHIPS]; bench.getWorldPosition(c.p); c.p.y += 0.56; c.p.x += (Math.random() - 0.5) * 0.3; c.p.z += (Math.random() - 0.5) * 0.15;
        c.v.set((Math.random() - 0.5) * 1.2, 1 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2); c.t = 0;
      }
      lastStrokes = strokes;
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
  /* ---------- what their bodies get back, shown ---------- */
  // Sleep, food and the sun give back what the day takes: in points out of 100, gathered up and shown by each of
  // them now and then (a small green +N that drifts up and fades) — so even a long sleep is seen to be doing something.
  // A meal shows at once; slow gains at most every 15 s and only once a whole point has come.
  const GAIN: { k: 'food' | 'rest' | 'charge'; label: string; get: (r: Resident) => number; on: (r: Resident) => boolean }[] = [
    { k: 'food', label: 'おなか', get: (r) => 100 * (1 - r.hunger), on: (r) => !!r.sp.living },
    { k: 'rest', label: 'ねむけ回復', get: (r) => 100 * (1 - r.sleepy), on: (r) => !!r.sp.living },
    { k: 'charge', label: '充電', get: (r) => 100 * r.battery, on: (r) => !r.sp.living },
  ];
  const gainAt = new Map<string, { last: number; acc: number; t: number }>();
  const pops: { r: Resident; text: string; k: string; born: number; el?: HTMLElement }[] = [];
  function gains() {
    const now = performance.now();
    for (const r of list) for (const g of GAIN) {
      if (!g.on(r)) continue;
      const id = r.id + g.k, v = g.get(r), s0 = gainAt.get(id);
      if (!s0) { gainAt.set(id, { last: v, acc: 0, t: now }); continue; }
      const d = v - s0.last; s0.last = v;
      if (d > 0) s0.acc += d;
      const meal = d >= 5;   // (a whole crab, a clam: at once)
      if (s0.acc >= 1 && (meal || now - s0.t >= 15000)) {
        const n = Math.round(s0.acc); s0.acc -= n; s0.t = now;
        if (n > 0) { pops.push({ r, text: `+${n} ${g.label}`, k: g.k, born: now }); if (pops.length > 24) pops.shift()?.el?.remove(); }
      }
    }
  }
  function bubbleEl(r: Resident) {
    let el = bubbleEls[r.id];
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; el.style.setProperty('--c', r.sp.color); document.getElementById('bubbles')?.appendChild(el); bubbleEls[r.id] = el; }
    return el;
  }

  // wake up where they were, and catch up on the hours nobody was watching
  initStudyPlaces();
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
