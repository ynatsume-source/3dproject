// The night beach's crabs, their lives (night sight 2: docs/proposals/night-sights-2026-10-19, CRABS.md; ADR 0009 for the
// coconut crab's hideouts). The nature team draws them (ocean/crab.ts); this says where each one is and what it is doing.
//  - The horned ghost crab lives in a burrow of its own in the dry sand above the high-water line. The burrows are the
//    island's: found once, by a fixed search out from Dot's home, one to a crab and never in a cluster, and there by day
//    too. After dark (the sun six degrees down) a crab comes up out of its burrow — not every crab, nor every night:
//    fewer on a cold night, fewer in the rain — wanders the sand near it, and goes down again before dawn.
//  - A light coming near (a resident's lamp, the drone's, the fire) sends it running sideways to its burrow and down;
//    it comes up again once no light has been near for a while. Its burrow is its way in and out: it appears and goes
//    there (the owner's decision, 2026-10-19), never out of nothing.
//  - The coconut crab hides by day in a hole at the root of a pandanus (ADR 0009: its hideout is its way in and out). Later
//    at night it comes out and walks slowly about the tree, now and then climbing a little way up its trunk (the trunk as
//    drawn: ocean/shore.ts trunks) and down again; a light near, it turns back to its hole, not in a hurry.
// Nothing here draws the island's random numbers (Math.random): every choice is draw() of the crab, the night and the
// moment, so the same night is the same night. Nothing is saved, and nothing goes back to the world or a resident.
import { draw } from '../science/rng';

const SEED = 0x63726173;   // 'cras'
const r = (...k: string[]) => draw(SEED, ...k);
export interface CrabLight { x: number; z: number; r: number }
export interface CrabPoseOut {
  kind: 'ghost' | 'coconut'; id: string; x: number; z: number; y: number;
  head: number; phase: number; run: number; sunk: number; eyes: number;
  on?: { n: [number, number, number]; fwd: [number, number, number] };   // (on a trunk: out from it, and its head along it)
}
export interface BurrowOut { id: string; x: number; z: number; y: number; dir: number }
type V3 = { x: number; y: number; z: number };
/** A trunk as drawn (ocean/shore.ts TrunkLine): its foot and top, its radius at each end. */
export interface CrabTrunk { kind: string; base: V3; top: V3; r0: number; r1: number }
export interface CrabWorld {
  ground(x: number, z: number): number;          // the land's height (m above mean sea level)
  sandy(x: number, z: number): boolean;          // open sand (no trees, no rock)
  home: [number, number];                        // where to look out from (Dot's home)
  trunks(x: number, z: number, rad: number): CrabTrunk[];   // the beach trees' trunks near (the pandanus: the coconut crabs' homes)
}
/** Where a ghost crab may dig: dry sand above the highest tide (+0.8 m spring, +1.04 below at the lowest — ADR 0009) with
 *  room for the waves' run-up, and not up in the dunes' grass. */
export const BURROW_H: [number, number] = [1.2, 3.4];
const GHOSTS = 14, COCONUTS = 2, SPACING_M = 5;
const FLEE_M = 4.5, CALM_M = 6.5, CALM_S = 20;   // (a light this near sends a crab down; it comes up once none has been this near for so long)
const WANDER_M = 5, GHOST_MS = 0.28, GHOST_RUN_MS = 1.5, COCONUT_MS = 0.08;

type Mode = 'in' | 'up' | 'out' | 'climb' | 'home' | 'down';
interface Crab {
  kind: 'ghost' | 'coconut'; id: string; bx: number; bz: number; dir: number;
  x: number; z: number; head: number; phase: number; run: number; sunk: number; eyes: number;
  mode: Mode; tx: number; tz: number; leg: number; calm: number; flee: boolean;
  trunk?: CrabTrunk; up: number; upTo: number; stay: number;   // (a coconut crab: its tree, how far up its trunk it is and is going (0–1), and how long it has been up there (s))
}

export function makeCrabLife(w: CrabWorld) {
  // (the burrows: rings out from home, a fixed sweep; a jitter of each spot's own)
  const ghosts: Crab[] = [];
  for (let d = 12; d <= 160 && ghosts.length < GHOSTS; d += 3) for (let k = 0; k < 40 && ghosts.length < GHOSTS; k++) {
    const id = `burrow:${d}:${k}`, a = (k + r(id, 'a')) / 40 * Math.PI * 2;
    const x = w.home[0] + Math.cos(a) * d, z = w.home[1] + Math.sin(a) * d, h = w.ground(x, z);
    if (h < BURROW_H[0] || h > BURROW_H[1] || !w.sandy(x, z)) continue;
    if (ghosts.some((g) => Math.hypot(g.bx - x, g.bz - z) < SPACING_M)) continue;   // (one to a crab: never a field of holes)
    ghosts.push(crab('ghost', `ghost:${ghosts.length}`, x, z, r(id, 'dir') * Math.PI * 2));
  }
  const off = (t: CrabTrunk) => Math.hypot(t.base.x - w.home[0], t.base.z - w.home[1]);
  const coconuts: Crab[] = w.trunks(w.home[0], w.home[1], 90).filter((t) => t.kind === 'pandanus' && off(t) > 8).sort((p, q) => off(p) - off(q))
    .filter((t, i, all) => all.findIndex((u) => Math.hypot(u.base.x - t.base.x, u.base.z - t.base.z) < 12) === i).slice(0, COCONUTS)
    .map((t, i) => {   // (its hole at the root, on the side away from home)
      const a = Math.atan2(t.base.z - w.home[1], t.base.x - w.home[0]), d = t.r0 + 0.06;
      const c = crab('coconut', `coconut:${i}`, t.base.x + Math.cos(a) * d, t.base.z + Math.sin(a) * d, a); c.trunk = t; return c;
    });
  const all = [...ghosts, ...coconuts];
  function crab(kind: Crab['kind'], id: string, x: number, z: number, dir: number): Crab {
    return { kind, id, bx: x, bz: z, dir, x, z, head: dir, phase: 0, run: 0, sunk: 1, eyes: 0, mode: 'in', tx: x, tz: z, leg: 0, calm: CALM_S, flee: false, up: 0, upTo: 0, stay: 0 };
  }

  /** Whether this crab is up tonight, and between when (ms): from the night of `nightKey`, the dark's start and end. */
  function tonight(c: Crab, nightKey: string, dark: [number, number], keen: number): [number, number] | null {
    if (r(c.id, nightKey, 'out') > keen * (c.kind === 'ghost' ? 0.8 : 0.6)) return null;
    const span = dark[1] - dark[0], late = c.kind === 'coconut' ? 0.25 : 0;
    const from = dark[0] + span * (late + 0.2 * r(c.id, nightKey, 'from')), to = dark[1] - span * (0.05 + 0.15 * r(c.id, nightKey, 'to'));
    return to > from ? [from, to] : null;
  }
  const yaw = (c: Crab, dx: number, dz: number) => (c.kind === 'ghost' ? Math.atan2(-dz, dx) : Math.atan2(dx, dz));   // (a ghost crab runs sideways, along its own x; a coconut crab walks ahead, along its z)
  function moveTo(c: Crab, x: number, z: number, speed: number, dt: number): boolean {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { c.run = 0; return true; }
    const step = Math.min(d, speed * dt); c.x += dx / d * step; c.z += dz / d * step; c.head = yaw(c, dx, dz);
    c.run = Math.min(1, speed / (c.kind === 'ghost' ? GHOST_RUN_MS : 0.2));
    c.phase += step / (c.kind === 'ghost' ? 0.06 : 0.12) * Math.PI * 2;
    return false;
  }

  /** The crabs a moment on: `nowMs` the world's time, `dark` tonight's dark (null by day), `keen` how many come out (0–1:
   *  the cold and the rain), `lights` what is lit near the sand. */
  function update(dt: number, nowMs: number, night: { key: string; dark: [number, number] } | null, keen: number, lights: CrabLight[]) {
    if (dt > 5) for (const c of all) Object.assign(c, { mode: 'in', up: 0, flee: false, calm: CALM_S });   // (a jump in time: each back in its hole, to come up as the night has it)
    dt = Math.min(dt, 0.25);
    for (const c of all) {
      const lit = lights.some((L) => Math.hypot(L.x - c.x, L.z - c.z) < Math.max(FLEE_M, L.r));
      const near = lights.some((L) => Math.hypot(L.x - c.bx, L.z - c.bz) < Math.max(CALM_M, L.r + 2));
      c.calm = near ? 0 : c.calm + dt;
      const up = night ? tonight(c, night.key, night.dark, keen) : null, time = !!up && nowMs >= up[0] && nowMs <= up[1];
      switch (c.mode) {
        case 'in':
          c.sunk = 1; c.eyes = 0; c.run = 0; c.x = c.bx; c.z = c.bz;
          if (time && c.calm >= CALM_S) c.mode = 'up';
          break;
        case 'up':   // (out of its burrow, eyes up first)
          c.eyes = Math.min(1, c.eyes + dt * 2); c.sunk = Math.max(0, c.sunk - dt * 0.5);
          if (c.sunk <= 0) { c.mode = 'out'; c.leg = 0; }
          if (lit || !time) c.mode = 'down';
          break;
        case 'out': {
          if (lit || !time) { c.mode = 'home'; c.flee = lit; break; }
          // (its walk about the burrow: a new spot every few seconds, now and then a stop, eyes up)
          const slot = String(Math.floor(nowMs / (c.kind === 'ghost' ? 7000 : 15000)));
          if (String(c.leg) !== slot) {
            c.leg = Number(slot); const a = r(c.id, slot, 'a') * Math.PI * 2, d = Math.sqrt(r(c.id, slot, 'd')) * (c.kind === 'ghost' ? WANDER_M : 8);
            const rest = r(c.id, slot, 'rest') < 0.35;
            [c.tx, c.tz] = rest ? [c.x, c.z] : [c.bx + Math.cos(a) * d, c.bz + Math.sin(a) * d];
            // (a coconut crab, now and then: up its own trunk a little way, from the foot of it)
            if (c.trunk && r(c.id, slot, 'climb') < 0.08) { c.mode = 'climb'; c.upTo = 0.3 + 0.5 * r(c.id, slot, 'high'); c.stay = 0; [c.tx, c.tz] = [c.bx, c.bz]; }
          }
          moveTo(c, c.tx, c.tz, c.kind === 'ghost' ? GHOST_MS : COCONUT_MS, dt);
          c.eyes = 1;
          break;
        }
        case 'climb': {   // (to the trunk's foot, up, a while there, and down; a light or the night's end: down at once)
          const t = c.trunk!, hold = !lit && time;
          if (c.up === 0 && Math.hypot(c.x - c.bx, c.z - c.bz) > 0.05) { if (!hold) { c.mode = 'home'; c.flee = lit; break; } moveTo(c, c.bx, c.bz, COCONUT_MS, dt); break; }
          const len = Math.hypot(t.top.x - t.base.x, t.top.y - t.base.y, t.top.z - t.base.z) || 1, want = hold ? c.upTo : 0;
          const step = COCONUT_MS * 0.6 * dt / len;
          c.run = Math.abs(want - c.up) > 1e-3 ? 0.3 : 0; c.up += Math.max(-step, Math.min(step, want - c.up)); c.phase += c.run ? step * len / 0.12 * Math.PI * 2 : 0;
          if (Math.abs(want - c.up) < 1e-3 && hold && (c.stay += dt) > 20 + 40 * r(c.id, String(c.leg), 'stay')) c.upTo = 0;   // (a while up there, then down)
          if (c.up <= 0 && want === 0) { c.up = 0; c.mode = hold ? 'out' : 'home'; c.flee = lit; }
          c.eyes = 1;
          break;
        }
        case 'home': {   // (back to its burrow: running from a light, or walking as the night ends)
          const speed = c.kind === 'ghost' ? (c.flee ? GHOST_RUN_MS : GHOST_MS) : (c.flee ? COCONUT_MS * 1.6 : COCONUT_MS);
          if (moveTo(c, c.bx, c.bz, speed, dt)) c.mode = 'down';
          c.eyes = 1;
          break;
        }
        case 'down':
          c.run = 0; c.sunk = Math.min(1, c.sunk + dt * (c.flee ? 2 : 0.7));
          if (c.sunk >= 1) { c.mode = 'in'; c.flee = false; }
          break;
      }
    }
  }
  /** What is to be drawn: the crabs up (or going up or down), nearest the camera first; the burrows (by day too). */
  function poses(cam: { x: number; z: number }) {
    const byNear = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z);
    const crabs: CrabPoseOut[] = all.filter((c) => c.mode !== 'in').sort(byNear).map((c) => (c.up > 0 && c.trunk ? onTrunk(c, c.trunk)
      : { kind: c.kind, id: c.id, x: c.x, z: c.z, y: w.ground(c.x, c.z), head: c.head, phase: c.phase, run: c.run, sunk: c.sunk, eyes: c.eyes }));
    const burrows: BurrowOut[] = ghosts.map((c) => ({ id: c.id, x: c.bx, z: c.bz, y: w.ground(c.bx, c.bz), dir: c.dir })).sort(byNear);
    return { crabs, burrows };
  }
  /** On its trunk, `up` of the way: on the trunk's surface on the side of its hole, back out from it, head up or down. */
  function onTrunk(c: Crab, t: CrabTrunk): CrabPoseOut {
    const ax = { x: t.top.x - t.base.x, y: t.top.y - t.base.y, z: t.top.z - t.base.z }, len = Math.hypot(ax.x, ax.y, ax.z) || 1;
    ax.x /= len; ax.y /= len; ax.z /= len;
    const f = c.up, cx = t.base.x + ax.x * len * f, cy = t.base.y + ax.y * len * f, cz = t.base.z + ax.z * len * f;
    const n = { x: c.bx - t.base.x, y: 0, z: c.bz - t.base.z }, dn = n.x * ax.x + n.z * ax.z;   // (out from the trunk, square to it)
    n.x -= ax.x * dn; n.y -= ax.y * dn; n.z -= ax.z * dn; const nl = Math.hypot(n.x, n.y, n.z) || 1; n.x /= nl; n.y /= nl; n.z /= nl;
    const rr = t.r0 + (t.r1 - t.r0) * f, down = c.upTo < c.up - 1e-3 || c.upTo === 0, s = down ? -1 : 1;
    return { kind: c.kind, id: c.id, x: cx + n.x * rr, y: cy + n.y * rr, z: cz + n.z * rr, head: c.head, phase: c.phase, run: c.run, sunk: 0, eyes: c.eyes,
      on: { n: [n.x, n.y, n.z], fwd: [ax.x * s, ax.y * s, ax.z * s] } };
  }
  return { update, poses, ghosts: () => ghosts.map((c) => ({ id: c.id, x: c.bx, z: c.bz })), coconuts: () => coconuts.map((c) => ({ id: c.id, x: c.bx, z: c.bz })), state: (id: string) => all.find((c) => c.id === id) };
}

/** How many come out tonight, 0–1: fewer on a cold night (the air at the island), fewer in rain. */
export function crabKeen(airC: number | undefined, rainMmH: number | undefined): number {
  const cold = airC === undefined ? 1 : airC >= 22 ? 1 : airC <= 15 ? 0.1 : 0.1 + 0.9 * (airC - 15) / 7;
  const wet = rainMmH === undefined ? 1 : rainMmH > 4 ? 0.4 : rainMmH > 0.5 ? 0.7 : 1;
  return cold * wet;
}
