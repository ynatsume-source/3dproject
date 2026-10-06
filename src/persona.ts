// The drone's character. Auto-cruise is a guided tour, and who is guiding shapes it — not by a few numbers
// but by four habits: what it finds worth filming (its taste), how it films (its favourite shots, how
// long it stays, how close), how it gets about (its route: drifting in mid-water, along the reef,
// near the surface, down the walls, or wherever), and how easily its eye is caught by something else.
import type { Subject } from './eco/env';

export type Mood = 'bait' | 'hello' | 'shot' | 'sighting' | 'hunt' | 'skyUp' | 'skyDown' | 'dawn' | 'noon' | 'dusk' | 'night' | 'meteor' | 'rain' | 'bird' | 'idle' | 'idleNight' | 'idleSky';
// how it films something that is not a giant (see Director): circling it, following behind it, waiting
// still and letting it come and go, from below against the light, or close in on its details
export type Style = 'orbit' | 'follow' | 'wait' | 'low' | 'detail';
export type GiantMove = 'flank' | 'under' | 'front' | 'pass' | 'reveal' | 'arc' | 'rise' | 'trail' | 'wide';
// where it cruises: high in mid-water, low along the reef, weaving off the line, just under the
// surface, leaning to the deeper side, or all of these by turns
export type Route = 'mid' | 'reef' | 'wander' | 'surface' | 'deep' | 'free';
// what it knows about a subject when weighing it
export interface Taste { shark: boolean; isNew: boolean; night: number; golden: number; whim: string }
export interface Persona {
  id: string; ja: string; blurb: string;
  cruise: number;            // cruising speed ×
  pace?: (t: number) => number;   // and how that wanders over time (× on top)
  dwell: number;             // how long it stays with a subject ×
  sway: number;              // how much it looks around while cruising ×
  skyGap: [number, number];  // seconds under water between trips to the sky
  skyStay: [number, number]; // seconds in the sky (the pair sets the share of time spent up there)
  altK: number;              // cruising height over the reef ×
  route: Route;
  distK: number;             // how close it films things ×
  turn: number;              // how briskly it turns ×
  skyAlt: number;            // cruising height in the sky ×
  styles: Partial<Record<Style, number>>;     // its shots, by how often it uses them
  giant: Partial<Record<GiantMove, number>>;  // and its moves round the big ones
  spinK: number;             // how fast it circles ×
  switchK: number;           // how much better something passing must be before it leaves what it is filming
  minHold: number;           // seconds it gives a subject before its eye can wander
  nearK?: number;            // how far afield it looks for the next subject × (under 1: what is near)
  rest: [number, number];    // seconds of plain cruising between subjects
  jumpTo?: (s: Subject, c: Taste) => boolean;   // what makes it drop everything (if it comes into view)
  weight(s: Subject, c: Taste): number;
  talk: number;              // idle chatter per hour (the guide is silent for now)
  gap: number;               // shortest pause between remarks (s)
  lines?: Partial<Record<Mood, string[]>>;
}

export const PERSONAS: Persona[] = [
  {
    // the default: a bit of everything at an easy pace — the big ones and the events, turtles and the reef's
    // small lives, now and then the sky; it stays long enough to see a thing, and does not linger on the
    // commonest (a passing school) when there is something else about
    // (auto filming rather than a cruise — the owner, 2026-10-06: a look of about ten seconds at each (twenty or
    // thirty on one thing was too long, as the few-seconds pace of 0609bc4 had been too short), then on to the next
    // thing near after a few seconds; and no longer the big ones first: the reef's small fish, the anemone's family
    // and the critters as much as a manta)
    id: 'balanced', ja: '程よく', blurb: 'ほどよい速さで巡り、いろいろな生きものをしばらくずつ見せてくれる。大物や出来事には寄り、ときどき空へも出る。',
    cruise: 0.9, dwell: 0.8, sway: 0.8, skyGap: [480, 760], skyStay: [140, 200], altK: 1.2, route: 'wander', distK: 1.0, turn: 0.75, skyAlt: 1.0,
    styles: { orbit: 2, follow: 2, wait: 1, low: 1, detail: 1 }, giant: { flank: 2, pass: 1.5, under: 1, front: 1 }, spinK: 0.7, switchK: 2.0, minHold: 6, rest: [4, 10],
    jumpTo: (s) => s.kind === 'manta' || (s.kind === 'giant' && s.hold != null),
    weight: (s, c) => (c.isNew ? 1.4 : 1) * (({ giant: 1.2, manta: 1.2, turtle: 1.0, hunt: 1.3, octopus: 1.3, big: 1.0, critter: 1.4, anemone: 1.6, school: 1.3, cave: 0.8 } as Record<string, number>)[s.kind] ?? 1),
    talk: 6, gap: 30,
  },
  {
    id: 'calm', ja: 'おだやか', blurb: '中層をゆっくり漂い、通りかかるものを待って長く眺める。めったに目移りしない。',
    cruise: 0.7, dwell: 1.7, sway: 0.6, skyGap: [700, 1000], skyStay: [180, 240], altK: 1.9, route: 'mid', distK: 1.4, turn: 0.55, skyAlt: 1.0,
    styles: { wait: 3, orbit: 2, low: 0.6 }, giant: { pass: 3, flank: 1, under: 1, front: 0.3 }, spinK: 0.5, switchK: 3.5, minHold: 20, rest: [50, 100],
    // resting and feeding things, the light; a hunt is not its kind of scene
    weight: (s) => ({ turtle: 1.6, anemone: 1.4, octopus: 1.3, manta: 1.4, giant: 1.2, school: 1.0, hunt: 0.55, critter: 0.8 } as Record<string, number>)[s.kind] ?? 1,
    talk: 3, gap: 50,
  },
  {
    id: 'curious', ja: '好奇心', blurb: '目の前を横切るものに何でもついて行く。寄り道だらけで、すぐ目移りする。',
    cruise: 1.5, dwell: 0.5, sway: 1.6, skyGap: [400, 600], skyStay: [110, 150], altK: 0.85, route: 'wander', distK: 0.85, turn: 1.8, skyAlt: 0.6,
    styles: { follow: 3, orbit: 1, detail: 1 }, giant: { flank: 2, front: 1.5, under: 1, pass: 0.5 }, spinK: 1.6, switchK: 1.05, minHold: 4, rest: [8, 20],
    weight: (s) => (s.kind === 'school' ? 1.5 : s.kind === 'cave' ? 0.6 : 1),
    talk: 14, gap: 14,
  },
  {
    id: 'hunter', ja: '狩人', blurb: '捕食者と狩りを追う。リーフの低いところで待ち、朝夕はとくに目ざとい。狩りが始まれば何をおいても向かう。',
    cruise: 1.1, dwell: 1.0, sway: 1.0, skyGap: [800, 1100], skyStay: [200, 260], altK: 0.7, route: 'reef', distK: 0.85, turn: 1.1, skyAlt: 0.5,
    styles: { low: 3, follow: 2, orbit: 1 }, giant: { flank: 3, under: 2, front: 1, pass: 0.5 }, spinK: 1.0, switchK: 2.2, minHold: 8, rest: [25, 55],
    jumpTo: (s) => s.kind === 'hunt',
    weight: (s, c) => {
      const dusk = 1 + 0.6 * c.golden;
      if (s.kind === 'hunt') return 3 * dusk;
      if (c.shark) return 3.5;
      if (s.kind === 'big') return 1.4;            // (the jacks, groupers, barracuda)
      if (s.kind === 'giant') return 1.4;
      if (s.kind === 'school') return 0.7 + 0.6 * c.golden;   // (prey, at the hour it is hunted)
      return 0.5;
    },
    talk: 5, gap: 35,
  },
  {
    id: 'sky', ja: '水面と空', blurb: '水面の近くを巡り、よく空へ抜ける。見上げる構図が好きで、マンタや息継ぎのカメ、大物の出来事なら乗り換える。',
    cruise: 1.0, dwell: 0.9, sway: 1.1, skyGap: [240, 360], skyStay: [280, 360], altK: 1.0, route: 'surface', distK: 1.2, turn: 0.8, skyAlt: 1.5,
    styles: { low: 3, wait: 1, orbit: 1 }, giant: { under: 3, pass: 1, flank: 1, front: 1 }, spinK: 0.8, switchK: 1.8, minHold: 8, rest: [30, 60],
    jumpTo: (s) => s.kind === 'manta' || (s.kind === 'giant' && s.hold != null),
    weight: (s) => ({ manta: 2, giant: 1.6, turtle: 1.4, school: 1.1, critter: 0.5, octopus: 0.6, cave: 0.3, anemone: 0.7 } as Record<string, number>)[s.kind] ?? 1,
    talk: 6, gap: 30,
  },
  {
    id: 'naturalist', ja: '博物学者', blurb: 'リーフをくまなく見て回り、まだ図鑑にいないものやめずらしいものに寄って、模様や目を細かく見る。',
    cruise: 0.85, dwell: 1.2, sway: 1.2, skyGap: [600, 900], skyStay: [160, 220], altK: 0.7, route: 'reef', distK: 0.75, turn: 1.2, skyAlt: 0.9,
    styles: { detail: 4, orbit: 2 }, giant: { flank: 2, front: 1, under: 1, pass: 0.5 }, spinK: 0.7, switchK: 2.0, minHold: 10, rest: [20, 45],
    jumpTo: (s, c) => c.isNew,
    weight: (s, c) => (c.isNew ? 3.5 : 1) * (({ critter: 1.5, octopus: 1.4, anemone: 1.3, school: 0.9, cave: 0.8 } as Record<string, number>)[s.kind] ?? 1),
    talk: 18, gap: 16,
  },
  {
    id: 'deep', ja: '深場', blurb: '深いほうへ、壁沿いへと寄っていく。ウツボや岩陰、洞窟、夜の生きものを、ライトでそっと照らして見る。',
    cruise: 0.8, dwell: 1.4, sway: 0.8, skyGap: [1200, 1600], skyStay: [120, 180], altK: 0.9, route: 'deep', distK: 1.0, turn: 0.7, skyAlt: 0.5,
    styles: { orbit: 2, wait: 1, detail: 1 }, giant: { pass: 2, flank: 1, front: 1, under: 0.3 }, spinK: 0.6, switchK: 3, minHold: 15, rest: [40, 80],
    weight: (s, c) => (({ critter: 2.5, cave: 3, octopus: 2, school: 0.7, manta: 0.8 } as Record<string, number>)[s.kind] ?? 1) * (s.kind === 'critter' || s.kind === 'octopus' ? 1 + 0.4 * c.night : 1),
    talk: 4, gap: 40,
  },
  {
    id: 'free', ja: '気ままに', blurb: '当てもなく巡航する。気分で速さも行き先も好みも変わり、ときどき止まってただ漂う。',
    cruise: 1.0, dwell: 1.0, sway: 1.3, skyGap: [400, 1100], skyStay: [120, 320], altK: 1.0, route: 'free', distK: 1.0, turn: 1.0, skyAlt: 1.0,
    // (now quick, now slow, and now and then hardly moving at all for a minute or two, just drifting)
    pace: (t) => (0.45 + 0.85 * (0.5 + 0.5 * Math.sin(t * 0.011)) * (0.5 + 0.5 * Math.sin(t * 0.0047 + 1))) * (1 - 0.88 * Math.min(1, Math.max(0, (Math.sin(t * 0.0031) - 0.78) / 0.12))),
    styles: { orbit: 1, follow: 1, wait: 1, low: 1, detail: 1 }, giant: { flank: 1, under: 1, front: 1, pass: 1 }, spinK: 1.0, switchK: 1.6, minHold: 8, rest: [15, 90],
    weight: (s, c) => (s.kind === c.whim ? 2.4 : 1),   // (what it fancies changes every few minutes)
    talk: 6, gap: 30,
  },
];

// (the older characters, by their old names)
const OLD: Record<string, string> = { busy: 'curious', shark: 'hunter', nosy: 'naturalist' };

export const personaById = (id: string | null) => PERSONAS.find((p) => p.id === (OLD[id ?? ''] ?? id)) ?? PERSONAS[0];

// one of the persona's lines for this moment, with {name}, {sea}, {note} filled in
export function line(p: Persona, mood: Mood, vars: Record<string, string> = {}): string | null {
  const arr = p.lines?.[mood];
  if (!arr || !arr.length) return null;
  let cand = arr;
  if (!vars.note) cand = arr.filter((l) => !l.includes('{note}'));
  if (!cand.length) return null;
  const s = cand[Math.floor(Math.random() * cand.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
