// The shared state animals read and write each frame: light and time of day, the tidal current,
// the plankton field, things to flee from, and a log of notable moments.
import { smooth } from '../core/math';
import type { Plankton } from './plankton';

export type Diel = 'day' | 'night' | 'crep' | 'always';

export interface Threat { x: number; y: number; z: number; r: number }

export interface PreyGroup {
  x: number; y: number; z: number;       // group centre
  alive: number;
  label: string;
  scare(): void;                         // make the whole group bolt
  take(): boolean;                       // remove one fish (a successful strike)
  // one fish singled out by a hunter: which (the straggler nearest the hunter), where it is and how
  // it is moving, telling it who is after it (so it bolts and jinks), whether it has got away into
  // cover, and taking it
  pick(x: number, y: number, z: number): number;
  at(i: number, out: Where, vel?: Where): boolean;
  chased(i: number, x: number, y: number, z: number): void;
  safe(i: number): boolean;
  kill(i: number): boolean;
}

export type Where = { x: number; y: number; z: number };
export interface SeaEvent { kind: string; text: string; x: number; z: number; at?: () => Where | null }

// Something worth pointing the camera at.
export interface Subject {
  key: string; label: string;
  kind: 'hunt' | 'turtle' | 'manta' | 'giant' | 'big' | 'anemone' | 'octopus' | 'school' | 'cave' | 'robot' | 'critter';
  prio: number;
  size: number;                         // rough length, m (sets filming distance)
  pos(): { x: number; y: number; z: number } | null;
  status(): string;
  note?(): string;                      // what to say about it (a rare sight, a place, a leap), when its field-guide entry is not the thing
  live(): boolean;                      // false once the moment is over (e.g. the hunt ended)
  reach?: number;                       // how far away the director will go for it (default 42 m)
  hold?: number;                        // stay with it this long (s), instead of the usual time for its kind
  comes?: number;                       // it swims past: once it is seen, the camera stops and waits for it, and films it close from this near (m)
  spot?: boolean;                       // a place, not an animal (a reef spot, where something was logged): circled slowly, never filmed as a big animal's moves
  front?(): { x: number; y: number; z: number };
  heading?(): { x: number; z: number };   // which way its nose points (a turtle: to film it from its front, its side, above)
  brief?(): boolean;                    // nothing much going on right now (a turtle asleep): a short look, then on
  shy?(): number;                       // how near it lets the drone come before it swims off (m), right now
  under?: number;                       // film it from right underneath, looking up (a tornado of fish): how far below its middle   // the open side to film it from (a moray looking out of its hole): no orbiting round it
  target?(): { x: number; y: number; z: number } | null;   // a hunt's prey, to frame together with the hunter
  frameR?(): number;                    // how big the action is right now (m), for close framing
  // a school of small fish: one of its fish, the one shown for it (the caption's ring goes round that fish — a ring
  // round the whole school, mixed in with other small fish, did not say which fish were meant: owner, 2026-10-07).
  // The same fish while it lasts and keeps with the school; then the one nearest its middle.
  one?(): { x: number; y: number; z: number; len: number } | null;
  // (and whether it is plainly a school — many fish close together, a mass the eye takes in as one — rather than a
  // few scattered fish: told of from further off only then. Owner, 2026-10-07)
  clump?(): boolean;
  len?: number; adult?: number; lenK?: number; lenWhat?: string;   // this individual's size (m), its species' adult size, growth rate, what is measured
  // a place to fly through rather than orbit: where the camera is and looks at t seconds in
  // a leap out of the sea (a breaching whale): film it from the waterline, this far off, side on to dir, looking h up
  breach?: { dist: number; h: number; dir: { x: number; y: number; z: number }; body?: { x: number; y: number; z: number }; len?: number; after?: () => number };   // (body: where the animal itself is, all the way up)
  tour?: { length: number; start(rev: boolean): { x: number; y: number; z: number }; at(t: number, rev: boolean, pos: any, look: any): void };
}

export interface Env {
  t: number;
  day: number; night: number; twilight: number; sunI: number;
  month: number; mday: number;
  cur: { x: number; z: number };
  plankton: Plankton;
  threats: Threat[];                     // last frame's threats (read)
  threatsOut: Threat[];                  // this frame's threats (write)
  prey: PreyGroup[];
  cam: { x: number; y: number; z: number };
  shy: number;                           // how far off animals start to mind the drone, as a factor (set by the app: less through its own eyes)
  events: SeaEvent[];
  crunch: (dist: number) => void;
  blow?: (dist: number) => void;         // a whale breathing out at the surface, this far off (heard, set by the app)
  sound: { frenzy(level: number, dist: number): void; plop(dist: number): void };   // set by the app
}

// How active a species is right now (0 resting .. 1 fully active).
export function activity(diel: Diel | undefined, env: Env): number {
  switch (diel ?? 'day') {
    case 'night': return smooth(0.35, 0.8, env.night);
    case 'crep': return Math.min(1, env.twilight * 1.2 + 0.5 * env.day + 0.25 * env.night);
    case 'always': return 1;
    default: return smooth(0.2, 0.6, env.day);
  }
}

// one of several ways to say the same thing, so the log does not read like a machine
export const oneOf = (a: string[]) => a[Math.floor(Math.random() * a.length)];
export function logEvent(env: Env, kind: string, text: string, x: number, z: number, at?: () => Where | null) {
  if (Math.hypot(x - env.cam.x, z - env.cam.z) > 55) return;   // only what the drone could plausibly notice
  env.events.push({ kind, text, x, z, at });
}
