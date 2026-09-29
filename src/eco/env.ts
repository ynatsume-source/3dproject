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
}

export interface SeaEvent { kind: string; text: string; x: number; z: number }

// Something worth pointing the camera at.
export interface Subject {
  key: string; label: string;
  kind: 'hunt' | 'turtle' | 'manta' | 'giant' | 'big' | 'anemone' | 'octopus' | 'school' | 'cave';
  prio: number;
  size: number;                         // rough length, m (sets filming distance)
  pos(): { x: number; y: number; z: number } | null;
  status(): string;
  live(): boolean;                      // false once the moment is over (e.g. the hunt ended)
  // a place to fly through rather than orbit: where the camera is and looks at t seconds in
  tour?: { length: number; start(rev: boolean): { x: number; y: number; z: number }; at(t: number, rev: boolean, pos: any, look: any): void };
}

export interface Env {
  t: number;
  day: number; night: number; twilight: number; sunI: number;
  cur: { x: number; z: number };
  plankton: Plankton;
  threats: Threat[];                     // last frame's threats (read)
  threatsOut: Threat[];                  // this frame's threats (write)
  prey: PreyGroup[];
  cam: { x: number; y: number; z: number };
  events: SeaEvent[];
  crunch: (dist: number) => void;
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

export function logEvent(env: Env, kind: string, text: string, x: number, z: number) {
  if (Math.hypot(x - env.cam.x, z - env.cam.z) > 55) return;   // only what the drone could plausibly notice
  env.events.push({ kind, text, x, z });
}
