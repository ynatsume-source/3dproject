// The camera director: while cruising, it watches for something worth filming nearby — a hunt, a
// turtle asleep or rising to breathe, a manta, a whale shark, a clownfish family — then glides to a
// side-on viewpoint and slowly orbits it for a while before returning to the cruise route.
import * as THREE from 'three';
import { R, rr } from './core/math';
import type { Subject } from './eco/env';

export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; subject: Subject; phase: 'approach' | 'observe'; rev?: boolean; forced?: boolean }

const DURATION: Record<Subject['kind'], [number, number]> = {
  hunt: [8, 30], school: [28, 45], cave: [0, 0], turtle: [30, 50], manta: [30, 45], giant: [35, 55], big: [20, 30], anemone: [22, 32], octopus: [30, 45],
};

const _p = new THREE.Vector3();

export class Director {
  shot: Shot | null = null;
  private cooldown = 12;
  private t = 0;
  private dur = 0;
  private ang = 0;
  private spin = 0.05;
  private recent = new Map<string, number>();
  private clock = 0;
  onStart: (s: Subject) => void = () => { /* set by the app */ };
  // the guide's taste: how much it wants to film a subject, and how long it likes to stay (set by the app)
  weight: (s: Subject) => number = () => 1;
  dwellK = 1;

  reset() { this.shot = null; this.cooldown = 10; }

  // Go and film this now, however far it is (someone asked to see it).
  focus(s: Subject, drone: THREE.Vector3) { this.begin(s, drone, true); }

  private begin(best: Subject, drone: THREE.Vector3, forced: boolean) {
    const p = best.pos() ?? drone;
    this.ang = Math.atan2(drone.z - p.z, drone.x - p.x);   // come in from the side we are already on
    this.spin = (R() < 0.5 ? -1 : 1) * rr(0.035, 0.07);
    this.t = 0;
    const [a, b] = DURATION[best.kind];
    this.dur = best.hold ?? rr(a, b) * this.dwellK;
    this.recent.set(best.key, this.clock);
    this.recent.set('kind:' + best.kind, this.clock);
    this.shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), subject: best, phase: 'approach', forced };
    if (best.tour) {
      // enter from whichever end is nearer
      const e0 = best.tour.start(false), e1 = best.tour.start(true);
      this.shot.rev = Math.hypot(e1.x - drone.x, e1.z - drone.z) < Math.hypot(e0.x - drone.x, e0.z - drone.z);
      this.dur = best.tour.length;
    }
    this.onStart(best);
  }

  update(dt: number, drone: THREE.Vector3, subjects: () => Subject[], floor: (x: number, z: number) => number): Shot | null {
    this.clock += dt;
    if (!this.shot) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return null;
      this.cooldown = 3;                      // look again in a moment if nothing is found
      let best: Subject | null = null, bs = 0;
      for (const s of subjects()) {
        const p = s.pos(); if (!p || !s.live()) continue;
        const d = Math.hypot(p.x - drone.x, p.y - drone.y, p.z - drone.z);
        if (d > (s.reach ?? 42)) continue;
        const seenAgo = this.clock - (this.recent.get(s.key) ?? -1e9);
        const kindAgo = this.clock - (this.recent.get('kind:' + s.kind) ?? -1e9);
        const score = s.prio * (1 - d / 60) * (seenAgo < 240 ? 0.25 : 1) * (kindAgo < 150 ? 0.4 : 1) * this.weight(s);
        if (score > bs) { bs = score; best = s; }
      }
      if (!best || bs < 0.9) return null;
      this.begin(best, drone, false);
    }
    const sh = this.shot!, s = sh.subject, p = s.pos();
    if (s.tour) {
      // fly through: first to the entrance (from above if need be), then along the route
      const st = s.tour.start(!!sh.rev);
      if (sh.phase === 'approach') {
        const gap = Math.hypot(st.x - drone.x, st.z - drone.z) + Math.max(0, Math.abs(st.y - drone.y) - 2.5);   // close enough over the entrance
        sh.pos.set(st.x, gap > 6 ? Math.max(st.y, floor(drone.x, drone.z) + 1.5) : st.y, st.z);
        s.tour.at(0, !!sh.rev, _p, sh.look);
        if (gap < 1.2 || this.t > (sh.forced ? 90 : 40)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
      } else {
        s.tour.at(this.t, !!sh.rev, sh.pos, sh.look);
        if (this.t > this.dur + 1) { this.shot = null; this.cooldown = rr(30, 70); return null; }
      }
      this.t += dt;
      return sh;
    }
    const far = p ? !sh.forced && Math.hypot(p.x - drone.x, p.z - drone.z) > 55 : !sh.forced;
    if (sh.forced && !p) {                                       // e.g. whales still on their way in: hold here and look out
      if (this.t === 0) { sh.pos.copy(drone as THREE.Vector3); sh.look.set(drone.x + 10, drone.y, drone.z); }
      return sh;
    }
    if (!p || far || (sh.phase === 'observe' && this.t > this.dur) || (s.kind === 'hunt' && !s.live() && this.t > 4 && !s.hold)) {
      this.shot = null;
      this.cooldown = rr(30, 70);
      return null;
    }
    const dist = Math.max(1.4, Math.min(12, s.size * 2.4 + 1.2));
    const lift = Math.min(2.5, 0.4 + s.size * 0.35);
    this.ang += this.spin * dt * (sh.phase === 'observe' ? 1 : 0.3);
    const x = p.x + Math.cos(this.ang) * dist, z = p.z + Math.sin(this.ang) * dist;
    const y = Math.min(Math.max(p.y + lift, floor(x, z) + 1.0), -0.9);
    sh.pos.set(x, y, z);
    sh.look.set(p.x, p.y, p.z);
    const gap = Math.hypot(drone.x - x, drone.y - y, drone.z - z);
    if (sh.phase === 'approach' && (gap < 1.5 || (!sh.forced && this.t > 25) || this.t > 90)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
    this.t += dt;
    return sh;
  }
}
