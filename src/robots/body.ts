// What the two animals' bodies ask of them, and what the island has to give (ADR 0004, addendum: body and food).
// Rakko's food is in the sea at its own places — urchins, crabs and clams in a patch of rocky bottom, taken one at
// a time and slowly coming back; Kamemaru's is the seagrass of a few beds. A body that is let go too far does
// badly: weak dives that come up empty, a chill that stops everything but floating and grooming, things dropped,
// dozing off where it is. Nothing is lasting: it eats, sleeps and is itself again. What happened is kept with how
// it was at the time, for its own mind to make what it will of (§5); its habits move their own marks a little.
import type { Food } from './creatures';

export type Prey = Exclude<Food, ''>;
export const PREY: Prey[] = ['urchin', 'crab', 'clam'];
export const PREY_JA: Record<Prey, string> = { urchin: 'ウニ', crab: 'カニ', clam: '貝' };
/** How much of an empty stomach (0..1) each fills. */
export const FILLS: Record<Prey, number> = { urchin: 0.15, crab: 0.2, clam: 0.12 };

/** A patch of the bottom where Rakko finds its food: so many of each there now, so many it holds at most. */
export interface Patch { id: string; x: number; z: number; stock: Record<Prey, number>; max: Record<Prey, number>; at: number; by?: string }   // (by: a reef someone made — driftwood sunk for shellfish to settle on)
/** A seagrass bed: how much is there to graze, 0..1. */
export interface Bed { id: string; x: number; z: number; grass: number; at: number; replanted?: number; by?: string }   // (replanted: until when it grows back three times as fast)

// operating settings (how hard the body is on them: ADR 0004, start gentle)
export const BODY = {
  regrowMin: 50,           // a patch gets one of a kind back every so many minutes (island time)
  bedRegrowH: 30,          // a grazed-out bed is back in so many hours
  weakAt: 0.75,            // hungrier than this: dives are short and come up empty more often
  coldAt: 0.92,            // (Rakko) hungrier than this: chilled — floats and grooms, nothing else
  stuckAt: 0.95,           // (Kamemaru) hungrier than this: hauls out and does not move for a while
  slowAt: 0.8,             // (Kamemaru) hungrier than this: slow
  fumbleAt: 0.75,          // sleepier than this: things slip from its paws now and then
  dozeAt: 0.93,            // sleepier than this: dozes off where it is
  learnStep: 0.04, relaxStep: 0.01,
};

/** How fast it gets hungry and sleepy (per second), by what it is doing: a dive costs much more than floating. */
export function drain(id: string, act: string, task: string): { hunger: number; sleepy: number } {
  const hard = act === 'dive' || task === 'forage' ? 2.2 : act === 'swim' ? 1.6 : act === 'walk' || act === 'carry' || act === 'work' || act === 'pick' ? 1.3 : act === 'sleep' ? 0.45 : act === 'float' || act === 'groom' || act === 'bask' ? 0.6 : 1;
  const base = id === 'rakko' ? 1 / 17000 : 1 / 46000;
  return { hunger: base * hard, sleepy: act === 'sleep' ? -1 / 9000 : act === 'bask' || act === 'float' ? -1 / 40000 : (1 / 57600) * (hard > 1.5 ? 1.4 : 1) };
}

export function makePatch(id: string, x: number, z: number, rnd: () => number, at: number): Patch {
  const max = { urchin: 2 + Math.floor(rnd() * 4), crab: 1 + Math.floor(rnd() * 3), clam: 2 + Math.floor(rnd() * 4) };
  return { id, x, z, max, stock: { ...max }, at };
}
/** Time brings back what was taken, one at a time. */
export function regrow(p: Patch, now: number) {
  const step = BODY.regrowMin * 60e3;
  while (now - p.at >= step) {
    p.at += step;
    const low = PREY.filter((k) => p.stock[k] < p.max[k]);
    if (!low.length) { p.at = now; break; }
    const k = low[Math.floor((p.at / step) % low.length)]; p.stock[k]++;
  }
}
// (a bed grows back on the island's clock: 30 island hours — ADR 0006; a patch's regrowMin is already a real-time pace)
export function regrowBed(b: Bed, now: number) { b.grass = Math.min(1, b.grass + ((now - b.at) * (b.replanted && now < b.replanted ? 3 : 1)) / ((BODY.bedRegrowH * 3.6e6) / (365 / 28))); b.at = now; }

/** One dive at a patch: what it comes up with ('' none), and whether it was weak from hunger (short and poor). */
export function dive(p: Patch, hunger: number, rnd: () => number): { prey: Food; weak: boolean } {
  const weak = hunger > BODY.weakAt;
  const total = PREY.reduce((n, k) => n + p.stock[k], 0), most = PREY.reduce((n, k) => n + p.max[k], 0);
  const chance = (total / Math.max(1, most)) * 0.95 * (weak ? 0.4 : 1);
  if (!total || rnd() > chance) return { prey: '', weak };
  let q = rnd() * total;
  for (const k of PREY) { q -= p.stock[k]; if (q < 0) { p.stock[k]--; return { prey: k, weak }; } }
  return { prey: '', weak };
}

/** Its own marks: how hungry before it goes to eat, how sleepy before it rests — moved by what happened to it. */
export interface Learn { eatAt: number; sleepAt: number }
export type Trouble = 'weak' | 'cold' | 'stuck' | 'fumble' | 'doze';
export const TROUBLE_OF: Record<Trouble, 'hunger' | 'sleep'> = { weak: 'hunger', cold: 'hunger', stuck: 'hunger', fumble: 'sleep', doze: 'sleep' };
export const LEARN0: Record<string, Learn> = { rakko: { eatAt: 0.5, sleepAt: 0.65 }, kame: { eatAt: 0.45, sleepAt: 0.6 } };
const LO: Learn = { eatAt: 0.25, sleepAt: 0.4 };

/** The body's record: its marks, and the day's troubles and when it began to eat (for the run's record). */
export interface BodyState { learn: Learn; day: string; troubles: Partial<Record<Trouble, number>>; eatStarts: number[]; hit: { hunger: boolean; sleep: boolean }; known: string[] }
export function bodyState(id: string): BodyState {
  return { learn: { ...(LEARN0[id] ?? LEARN0.rakko) }, day: '', troubles: {}, eatStarts: [], hit: { hunger: false, sleep: false }, known: [] };
}
/** Something went badly because of hunger or sleepiness: counted, and its habit's mark moves earlier. */
export function trouble(b: BodyState, kind: Trouble) {
  b.troubles[kind] = (b.troubles[kind] ?? 0) + 1;
  const w = TROUBLE_OF[kind]; b.hit[w] = true;
  if (w === 'hunger') b.learn.eatAt = Math.max(LO.eatAt, b.learn.eatAt - BODY.learnStep);
  else b.learn.sleepAt = Math.max(LO.sleepAt, b.learn.sleepAt - BODY.learnStep);
}
/** A new day: a mark that brought no trouble yesterday eases back a little toward where it began. */
export function newDay(b: BodyState, id: string, day: string) {
  if (b.day === day) return;
  const L0 = LEARN0[id] ?? LEARN0.rakko;
  if (b.day) {
    if (!b.hit.hunger) b.learn.eatAt = Math.min(L0.eatAt, b.learn.eatAt + BODY.relaxStep);
    if (!b.hit.sleep) b.learn.sleepAt = Math.min(L0.sleepAt, b.learn.sleepAt + BODY.relaxStep);
  }
  b.day = day; b.troubles = {}; b.eatStarts = []; b.hit = { hunger: false, sleep: false };
}
