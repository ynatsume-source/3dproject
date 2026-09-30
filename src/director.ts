// The camera director: while cruising, it watches for something worth filming nearby — a hunt, a
// turtle asleep or rising to breathe, a manta, a whale shark, a clownfish family — then glides to a
// side-on viewpoint and slowly orbits it for a while before returning to the cruise route.
import * as THREE from 'three';
import { R, rr } from './core/math';
import type { Subject } from './eco/env';

export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; subject: Subject; phase: 'approach' | 'observe'; rev?: boolean; forced?: boolean; close?: boolean; wide?: number; giant?: string }

const DURATION: Record<Subject['kind'], [number, number]> = {
  hunt: [8, 30], school: [28, 45], cave: [0, 0], turtle: [30, 50], manta: [30, 45], giant: [35, 55], big: [20, 30], anemone: [22, 32], octopus: [30, 45], robot: [40, 70],
};

const _p = new THREE.Vector3();

export class Director {
  shot: Shot | null = null;
  private cooldown = 12;
  private t = 0;
  private dur = 0;
  private ang = 0;
  private spin = 0.05;
  private hdx = 1; private hdz = 0;   // the line of a chase, smoothed
  // filming something big: which move, since when, its heading (from how it moves), and a fixed spot
  private move = ''; private moveT = 0; private moveDur = 0; private gvx = 0; private gvz = 1; private gpx = NaN; private gpz = 0;
  private hold = new THREE.Vector3();
  private recent = new Map<string, number>();
  private clock = 0;
  onStart: (s: Subject) => void = () => { /* set by the app */ };
  // the guide's taste: how much it wants to film a subject, and how long it likes to stay (set by the app)
  weight: (s: Subject) => number = () => 1;
  dwellK = 1;
  distK = 1;

  reset() { this.shot = null; this.cooldown = 10; }

  // Go and film this now, however far it is (someone asked to see it).
  focus(s: Subject, drone: THREE.Vector3) { this.begin(s, drone, true); }

  private begin(best: Subject, drone: THREE.Vector3, forced: boolean) {
    const p = best.pos() ?? drone;
    this.ang = Math.atan2(drone.z - p.z, drone.x - p.x);   // come in from the side we are already on
    this.move = ''; this.gpx = NaN;
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
        const score = s.prio * (1 - d / Math.max(60, (s.reach ?? 42) * 1.25))   // (things worth crossing the island for fade more slowly with distance) * (seenAgo < 240 ? 0.25 : 1) * (kindAgo < 150 ? 0.4 : 1) * this.weight(s);
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
    if (!p || far || (sh.phase === 'observe' && this.t > this.dur && !(s.kind === 'hunt' && s.live())) || (s.kind === 'hunt' && !s.live() && this.t > 4 && !s.hold)) {
      this.shot = null;
      this.cooldown = rr(30, 70);
      return null;
    }
    // a hunt: right in it, as if with a long lens from close by — level with the hunter, a little behind
    // and to the side of its line of attack, racing along with it, framing it and the fish it is after
    const tg = s.kind === 'hunt' && s.target && s.frameR ? s.target() : null;
    if (tg && p) {
      let dx = tg.x - p.x, dz = tg.z - p.z; const dl = Math.hypot(dx, dz);
      if (dl > 0.05) { dx /= dl; dz /= dl; this.hdx += (dx - this.hdx) * Math.min(1, dt * 1.5); this.hdz += (dz - this.hdz) * Math.min(1, dt * 1.5); }
      const hl = Math.hypot(this.hdx, this.hdz) || 1, ux = this.hdx / hl, uz = this.hdz / hl;
      // stay on the side we are already on (no swinging across the action)
      const sx = -uz, sz = ux, side = (drone.x - p.x) * sx + (drone.z - p.z) * sz >= 0 ? 1 : -1;
      const R = s.frameR!(), d = Math.max(2.2, Math.min(5.5, R * 2.2 + 1.4));
      const x = p.x + sx * side * d - ux * d * 0.35, z = p.z + sz * side * d - uz * d * 0.35;
      const y = Math.min(Math.max(p.y - 0.1, floor(x, z) + 0.6), -0.9);
      sh.pos.set(x, y, z);
      sh.look.set(p.x + (tg.x - p.x) * 0.3, p.y + (tg.y - p.y) * 0.3, p.z + (tg.z - p.z) * 0.3);
      sh.close = true;
      const gap = Math.hypot(drone.x - x, drone.y - y, drone.z - z);
      if (sh.phase === 'approach' && (gap < 2 || this.t > 30)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
      if (!s.live() && this.t > 3) { this.shot = null; this.cooldown = rr(30, 70); return null; }
      this.t += dt;
      return sh;
    }
    // something big: close in, where its size tells — see below
    const L = s.len ?? s.size;
    if (p && L >= 1.4 && (s.kind === 'giant' || s.kind === 'big' || s.kind === 'manta') && p.y < -1.5) return this.giant(sh, s, p, L, dt, drone, floor);
    const dist = Math.max(1.4, Math.min(12, s.size * 2.4 + 1.2)) * this.distK;
    const lift = Math.min(2.5, 0.4 + s.size * 0.35);
    this.ang += this.spin * dt * (sh.phase === 'observe' ? 1 : 0.3);
    const x = p.x + Math.cos(this.ang) * dist, z = p.z + Math.sin(this.ang) * dist;
    // (ashore or at the surface: from the air, at the height of someone standing by)
    const y = p.y > -0.5 ? Math.max(p.y + lift + 0.6, floor(x, z) + 1.2, 0.8) : Math.min(Math.max(p.y + lift, floor(x, z) + 1.0), -0.9);
    sh.pos.set(x, y, z);
    sh.look.set(p.x, p.y, p.z);
    const gap = Math.hypot(drone.x - x, drone.y - y, drone.z - z);
    if (sh.phase === 'approach' && (gap < 1.5 || (!sh.forced && this.t > 25) || this.t > 90)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
    this.t += dt;
    return sh;
  }

  // Filming the big ones so their size is felt: never the far, slow orbit that makes a whale shark look
  // like a toy, but close, and moving with it — alongside its head with the body running away past the
  // lens; from below, looking up at it against the light; out in front as it comes on; or holding still
  // on its path and letting it glide by. A wider lens up close, so it overflows the frame and the other
  // fish around it show the scale.
  private giant(sh: Shot, s: Subject, p: { x: number; y: number; z: number }, L: number, dt: number, drone: THREE.Vector3, floor: (x: number, z: number) => number): Shot {
    // its heading, from how it has been moving (kept when it drifts slowly)
    if (!isNaN(this.gpx)) {
      const vx = (p.x - this.gpx) / Math.max(dt, 1e-3), vz = (p.z - this.gpz) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz);
      if (sp > 0.05 && sp < 20) { const k = Math.min(1, dt * 1.2); this.gvx += (vx / sp - this.gvx) * k; this.gvz += (vz / sp - this.gvz) * k; }
    }
    this.gpx = p.x; this.gpz = p.z;
    const hl = Math.hypot(this.gvx, this.gvz) || 1, fx = this.gvx / hl, fz = this.gvz / hl, sx = -fz, sz = fx;
    const side = (drone.x - p.x) * sx + (drone.z - p.z) * sz >= 0 ? 1 : -1;
    const room = p.y - floor(p.x, p.z);
    // the next move, every so often
    if (!this.move || (this.moveT += dt) > this.moveDur) {
      const opts = ['flank', 'front', 'pass', ...(room > L * 0.45 + 2 ? ['under', 'under'] : []), 'flank'].filter((m) => m !== this.move);
      this.move = opts[Math.floor(R() * opts.length)]; this.moveT = 0; this.moveDur = rr(9, 13);
      if (this.move === 'pass') this.hold.set(p.x + fx * (L * 1.4 + 3) + sx * side * (L * 0.35 + 1.2), p.y + L * 0.04, p.z + fz * (L * 1.4 + 3) + sz * side * (L * 0.35 + 1.2));
    }
    const spot = (move: string) => {
      let x = 0, y = 0, z = 0, lx = p.x, ly = p.y, lz = p.z, wide = 1;
      if (move === 'flank') {
        // alongside the head, a little ahead of it, looking back along the flank
        const d = Math.max(1.3, L * 0.32 + 0.8), a = L * 0.28;
        x = p.x + sx * side * d + fx * a; z = p.z + sz * side * d + fz * a; y = p.y + L * 0.03;
        lx = p.x - fx * L * 0.12; lz = p.z - fz * L * 0.12;
      } else if (move === 'under') {
        // beneath it and a little ahead, looking up at it passing over against the bright surface
        x = p.x + fx * L * 0.15 + sx * side * L * 0.12; z = p.z + fz * L * 0.15 + sz * side * L * 0.12; y = p.y - (L * 0.42 + 1.2);
        lx = p.x - fx * L * 0.1; lz = p.z - fz * L * 0.1; wide = 1.1;
      } else if (move === 'front') {
        // out in front, a touch to one side, backing away as it comes on
        const d = L * 0.5 + 1.5;
        x = p.x + fx * d + sx * side * L * 0.22; z = p.z + fz * d + sz * side * L * 0.22; y = p.y + L * 0.02;
        lx = p.x + fx * L * 0.3; lz = p.z + fz * L * 0.3; wide = 0.8;
      } else {
        // hold still on its path and let it glide past, close
        x = this.hold.x; y = this.hold.y; z = this.hold.z;
      }
      y = Math.min(Math.max(y, floor(x, z) + 0.8), -0.9);
      // (no rock or reef between the lens and the animal)
      let clear = true;
      for (let i = 1; i < 8 && clear; i++) { const f = i / 8, qx = x + (p.x - x) * f, qz = z + (p.z - z) * f, qy = y + (p.y - y) * f; if (floor(qx, qz) > qy - 0.4) clear = false; }
      return { x, y, z, lx, ly, lz, wide, clear };
    };
    let c = spot(this.move);
    if (!c.clear) {
      // blocked: take whichever other move has a clear view (or rise over the obstacle)
      for (const m of ['flank', 'under', 'front']) { if (m === this.move) continue; const o = spot(m); if (o.clear) { this.move = m; this.moveT = 0; this.moveDur = rr(9, 13); c = o; break; } }
      if (!c.clear) c.y = Math.min(c.y + 2, -0.9);
    }
    if (this.move === 'pass' && (p.x - c.x) * fx + (p.z - c.z) * fz > L * 0.6) this.moveT = this.moveDur;   // (it has gone by)
    const { x, y, z, lx, ly, lz, wide } = c;
    sh.pos.set(x, y, z); sh.look.set(lx, ly, lz);
    sh.giant = this.move; sh.wide = wide;
    const gap = Math.hypot(drone.x - x, drone.y - y, drone.z - z);
    if (sh.phase === 'approach' && (gap < 2.5 || this.t > 30)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
    this.t += dt;
    return sh;
  }
}
