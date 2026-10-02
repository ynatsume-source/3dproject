// One wild harbor seal occasionally passes through Point Lobos. Session-local ecology, independent
// of the island's resident otter. Timing/density are design values, never a local population estimate.
import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { makeHarborSeal, type HarborSealModel } from '../ocean/lobos-visitor-models';
import { swellAt } from '../ocean/air';
import { logEvent, type Env, type Subject, type Where } from './env';

export type SealPhase = 'absent' | 'passing' | 'ascending' | 'breathing' | 'diving' | 'departing';
export interface SealTerrain { top(x: number, z: number): number }
export interface SealRoute { start: THREE.Vector3; end: THREE.Vector3; bend: THREE.Vector3; depth: number }
export const SEAL_VISIT_SECONDS = 220;
export const SEAL_COOLDOWN = [480, 840] as const;
const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Position in the horizontal route. The broad sine bend has a continuous tangent at every phase.
export function sealRouteAt(route: SealRoute, u: number, out: THREE.Vector3) {
  out.copy(route.start).lerp(route.end, u).addScaledVector(route.bend, Math.sin(u * Math.PI)); return out;
}

// A visitor followed all the way to the edge keeps swimming a quiet offshore arc. It does not
// freeze at an endpoint or vanish in front of the lens. This corridor is checked at route creation.
function offshoreArc(route: SealRoute, seconds: number, out: THREE.Vector3) {
  const dx = route.end.x - route.start.x - Math.PI * route.bend.x;
  const dz = route.end.z - route.start.z - Math.PI * route.bend.z;
  const l = Math.hypot(dx, dz), x = dx / l, z = dz / l;
  const radius = 7, a = seconds * 0.7 / radius;
  out.copy(route.end);
  out.x += x * radius * Math.sin(a) - z * radius * (1 - Math.cos(a));
  out.z += z * radius * Math.sin(a) + x * radius * (1 - Math.cos(a));
  return out;
}

// A whole 2.5 m wide body corridor must be navigable, not merely a point underneath its centre.
// Routes outside the existing 260 m sea, or over land/shallows, are rejected even in debug mode.
export function findSealRoute(terrain: SealTerrain, camera: Where, random: () => number): SealRoute | null {
  const p = new THREE.Vector3();
  for (let attempt = 0; attempt < 36; attempt++) {
    const angle = random() * TAU, dx = Math.cos(angle), dz = Math.sin(angle);
    const off = (16 + random() * 8) * (random() < 0.5 ? -1 : 1);
    const cx = Math.max(-30, Math.min(30, camera.x)), cz = Math.max(-30, Math.min(30, camera.z));
    const centreX = cx - dz * off, centreZ = cz + dx * off;
    const route: SealRoute = {
      start: new THREE.Vector3(centreX - dx * 78, 0, centreZ - dz * 78),
      end: new THREE.Vector3(centreX + dx * 78, 0, centreZ + dz * 78),
      bend: new THREE.Vector3(-dz * 8, 0, dx * 8), depth: -5.8,
    };
    let safe = true, highest = -Infinity;
    for (let i = 0; i <= 312 && safe; i++) {
      sealRouteAt(route, i / 312, p);
      for (const side of [-1.25, 0, 1.25]) {
        const x = p.x - dz * side, z = p.z + dx * side;
        const h = terrain.top(x, z);
        if (!Number.isFinite(h) || h > -3 || Math.abs(x) > 128 || Math.abs(z) > 128) { safe = false; break; }
        highest = Math.max(highest, h);
      }
    }
    for (let i = 0; i <= 90 && safe; i++) {
      offshoreArc(route, i, p);
      for (const ox of [-1.25, 0, 1.25]) for (const oz of [-1.25, 0, 1.25]) {
        const h = terrain.top(p.x + ox, p.z + oz);
        if (!Number.isFinite(h) || h > -3 || Math.abs(p.x + ox) > 128 || Math.abs(p.z + oz) > 128) { safe = false; break; }
        highest = Math.max(highest, h);
      }
    }
    if (safe && route.start.distanceTo(new THREE.Vector3(camera.x, 0, camera.z)) > 50) {
      route.depth = Math.max(-6.5, highest + 1.4); return route;
    }
  }
  return null;
}

export function sealPhaseAt(seconds: number): Exclude<SealPhase, 'absent'> {
  return seconds < 75 ? 'passing' : seconds < 95 ? 'ascending' : seconds < 113 ? 'breathing' : seconds < 136 ? 'diving' : 'departing';
}
function routeProgress(seconds: number) {
  if (seconds < 75) return seconds / 75 * 0.42;
  if (seconds < 95) return 0.42 + (seconds - 75) / 20 * 0.06;
  if (seconds < 113) return 0.48 + (seconds - 95) / 18 * 0.05;
  if (seconds < 136) return 0.53 + (seconds - 113) / 23 * 0.09;
  return 0.62 + (seconds - 136) / 84 * 0.38;
}
export function sampleSealVisit(route: SealRoute, seconds: number, waterHeight: number, out: THREE.Vector3) {
  if (seconds > SEAL_VISIT_SECONDS) offshoreArc(route, seconds - SEAL_VISIT_SECONDS, out);
  else sealRouteAt(route, routeProgress(seconds), out);
  const up = ease((seconds - 75) / 20) * (1 - ease((seconds - 113) / 23));
  // At rest, a raised head exposes the nostrils while shoulders and hindquarters stay underwater.
  out.y = route.depth + (waterHeight - 0.28 - route.depth) * up;
  return out;
}

export interface LobosVisitorState {
  active: boolean;
  phase: SealPhase;
  position: THREE.Vector3;
  seconds: number;
  cooldown: number;
  visits: number;
}
const STATUS: Record<SealPhase, string> = {
  absent: 'ときどき、この海を訪れる', passing: '森の縁を静かに泳いでいる',
  ascending: '息継ぎに水面へ向かっている', breathing: '鼻先を水面へ出して息継ぎしている',
  diving: 'ゆっくり海の中へ戻っていく', departing: '森の向こうへ泳ぎ去っていく',
};

export class LobosVisitors {
  readonly state: LobosVisitorState;
  readonly model: HarborSealModel;
  private random: () => number;
  private route: SealRoute | null = null;
  private target = new THREE.Vector3();
  private ahead = new THREE.Vector3();
  private lastPhase: SealPhase = 'absent';
  private heading = 0;
  private tilt = 0;

  constructor(private terrain: SealTerrain, group: THREE.Group, seed = 317) {
    this.random = mulberry32(seed ^ 0x5345414c);
    this.state = { active: false, phase: 'absent', position: new THREE.Vector3(), seconds: 0, cooldown: 60 + this.random() * 60, visits: 0 };
    this.model = makeHarborSeal(); this.model.group.visible = false; group.add(this.model.group);
  }

  /** Debug-only request. Uses the same safe route selection and deterministic RNG as natural visits. */
  force(camera: Where): boolean { return this.start(camera); }

  private start(camera: Where): boolean {
    if (this.state.active) return false;
    const route = findSealRoute(this.terrain, camera, this.random);
    if (!route) { this.state.cooldown = 30; return false; }
    this.route = route; this.state.active = true; this.state.seconds = 0; this.state.phase = 'passing'; this.state.visits++;
    this.lastPhase = 'absent';
    sampleSealVisit(route, 0, 0, this.state.position);
    sealRouteAt(route, 0.002, this.ahead);
    this.heading = Math.atan2(this.ahead.x - route.start.x, this.ahead.z - route.start.z); this.tilt = 0;
    this.draw(0, 0); return true;
  }

  private draw(dt: number, water: number) {
    const s = this.state, route = this.route!;
    sampleSealVisit(route, s.seconds, water, this.target);
    sampleSealVisit(route, s.seconds + 0.1, water, this.ahead);
    const vx = this.ahead.x - this.target.x, vy = this.ahead.y - this.target.y, vz = this.ahead.z - this.target.z;
    const surface = ease((s.seconds - 88) / 7) * (1 - ease((s.seconds - 113) / 6));
    const wantTilt = -Math.atan2(vy, Math.hypot(vx, vz)) * (1 - surface) - 0.34 * surface;
    const turn = Math.atan2(vx, vz) - this.heading;
    this.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
    this.tilt += (wantTilt - this.tilt) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
    s.position.copy(this.target);
    this.model.group.position.copy(s.position);
    this.model.group.rotation.set(this.tilt, this.heading, Math.sin(s.seconds * 0.38) * 0.025 * (1 - surface), 'YXZ');
    // Stroke-and-glide, with almost still hindfeet while taking a breath.
    const stroke = (0.75 + 0.25 * ease(Math.sin(s.seconds * 0.31) * 0.7 + 0.3)) * (1 - surface * 0.88);
    const surge = this.model.pose(s.seconds, stroke, surface); this.model.group.visible = true;
    // (each run of strokes carries it a little ahead of its even pace, each glide lets it fall back)
    this.model.group.position.x += Math.sin(this.heading) * surge; this.model.group.position.z += Math.cos(this.heading) * surge;
  }

  update(dt: number, env: Env, camera: THREE.Vector3) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const s = this.state;
    if (!s.active) {
      s.cooldown -= dt;
      if (s.cooldown > 0 || !this.start(camera)) return;
    }
    s.seconds += dt;
    if (s.seconds >= SEAL_VISIT_SECONDS) {
      // The route ends far outside the normal 15 m visibility. Do not despawn in a close-up when
      // a user has followed all the way: continue a prechecked offshore arc until unseen.
      if (s.position.distanceTo(camera) >= 38) {
        s.active = false; s.phase = 'absent'; this.route = null; this.model.group.visible = false;
        s.cooldown = SEAL_COOLDOWN[0] + this.random() * (SEAL_COOLDOWN[1] - SEAL_COOLDOWN[0]); return;
      }
    }
    s.phase = sealPhaseAt(s.seconds);
    sampleSealVisit(this.route!, s.seconds, 0, this.target);
    this.draw(dt, swellAt(this.target.x, this.target.z));
    // The entire visit was checked before appearing; keep a final local clearance guard for
    // dynamic obstacles. A seal never clips through a newly added object below it.
    const safeFloor = this.terrain.top(s.position.x, s.position.z) + 0.8;
    if (s.position.y < safeFloor) { s.position.y = safeFloor; this.model.group.position.y = safeFloor; }
    if (s.phase !== this.lastPhase) {
      if (s.phase === 'breathing') logEvent(env, 'breathe', 'ゼニガタアザラシが鼻先を水面へ出して息をつく', s.position.x, s.position.z, () => s.active ? s.position : null);
      this.lastPhase = s.phase;
    }
  }

  subjects(out: Subject[]) {
    const s = this.state;
    if (!s.active) return;
    out.push({ key: 'harbor-seal:visitor', label: 'ゼニガタアザラシ', kind: 'big', prio: 2.8,
      size: this.model.length, len: this.model.length, adult: 1.9, lenK: 0, lenWhat: '体長', reach: 40, hold: 34,
      pos: () => s.active ? s.position : null, live: () => s.active, status: () => STATUS[s.phase] });
  }
}

export function makeLobosVisitors(oc: { loc: { id: string; seed?: number }; T: SealTerrain; group: THREE.Group }): LobosVisitors | undefined {
  return oc.loc.id === 'pointlobos' ? new LobosVisitors(oc.T, oc.group, oc.loc.seed ?? 317) : undefined;
}
