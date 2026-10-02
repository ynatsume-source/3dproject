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
  live(): boolean;                      // false once the moment is over (e.g. the hunt ended)
  reach?: number;                       // how far away the director will go for it (default 42 m)
  hold?: number;                        // stay with it this long (s), instead of the usual time for its kind
  front?(): { x: number; y: number; z: number };
  under?: number;                       // film it from right underneath, looking up (a tornado of fish): how far below its middle   // the open side to film it from (a moray looking out of its hole): no orbiting round it
  target?(): { x: number; y: number; z: number } | null;   // a hunt's prey, to frame together with the hunter
  frameR?(): number;                    // how big the action is right now (m), for close framing
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
