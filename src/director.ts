// The camera director: while cruising, it watches for something worth filming nearby — a hunt, a
// turtle asleep or rising to breathe, a manta, a whale shark, a clownfish family — then glides to a
// side-on viewpoint and slowly orbits it for a while before returning to the cruise route.
import * as THREE from 'three';
import { R, rr } from './core/math';
import type { Subject } from './eco/env';
import type { Style, GiantMove } from './persona';

export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; subject: Subject; phase: 'approach' | 'observe'; rev?: boolean; forced?: boolean; close?: boolean; wide?: number; giant?: string; zoom?: boolean; asked?: boolean; style?: Style; surface?: boolean; down?: boolean;   // (down: after a leap, gone in after the animal)
  tilt?: number;                       // the camera's pitch, when the framing sets it rather than the subject
  leapView?: 'line' | 'close' | 'air'; // how a leap is being filmed (below)
}

const DURATION: Record<Subject['kind'], [number, number]> = {
  hunt: [8, 30], school: [28, 45], cave: [0, 0], turtle: [30, 50], manta: [30, 45], giant: [35, 55], big: [20, 30], anemone: [22, 32], octopus: [30, 45], robot: [40, 70], critter: [20, 32],
};

const _p = new THREE.Vector3();
// one of several choices, by weight (only those allowed)
function pick<K extends string>(w: Partial<Record<K, number>>, ok: (k: K) => boolean = () => true): K | undefined {
  const keys = (Object.keys(w) as K[]).filter((k) => ok(k) && (w[k] ?? 0) > 0);
  let r = R() * keys.reduce((a, k) => a + (w[k] ?? 0), 0);
  for (const k of keys) { r -= w[k] ?? 0; if (r <= 0) return k; }
  return keys[keys.length - 1];
}
// the kind of animal a subject is (a school, a hunt and a lone one of the same species count as one)
export const speciesOf = (s: Subject) => s.label.replace(/の群れ$|の大群$|（.*$/, '');

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
  private hold = new THREE.Vector3(); private gspd = 0; private arcDir = 1;
  private recent = new Map<string, number>();
  private switchT = 0;
  private clock = 0;
  onStart: (s: Subject) => void = () => { /* set by the app */ };
  // the guide's taste: how much it wants to film a subject, and how long it likes to stay (set by the app)
  weight: (s: Subject) => number = () => 1;
  jumpTo: (s: Subject) => boolean = () => false;
  dwellK = 1;
  nearK = 1;       // (how far afield it looks for the next thing: under 1, it keeps to what is near)
  distK = 1;
  styles: Partial<Record<Style, number>> = { orbit: 1 };
  giantW: Partial<Record<GiantMove, number>> = { flank: 2, under: 2, front: 1, pass: 1 };
  spinK = 1;
  rest: [number, number] = [30, 70];
  private side = 1;
  private brT = 0;
  private brN = 0; private brSince = -1e9;   // leaps watched lately (two or three, then on to something else for a while)

  reset() { this.shot = null; this.cooldown = 10; }
  // let go of what it is filming and go back to the cruise (asked to: the cruise button pressed mid-shot);
  // the subject is not held against (it may be filmed again when it next comes up)
  release() { if (!this.shot) return false; this.shot = null; this.cooldown = rr(4, 8); return true; }
  // how long it has waited for something asked for that is not here yet, and how long what it is filming has
  // been gone (no longer there: swum off out of the sea, its season over)
  private waitT = 0; private goneT = 0;
  static readonly WAIT = 60;
  // give up on what it is filming (it could not get there, or nothing could be seen of it): leave it be
  // for a while, and go on cruising
  private skipUntil = new Map<string, number>();
  abandon(sec = 300) { if (!this.shot) return; this.skipUntil.set(this.shot.subject.key, this.clock + sec); this.shot = null; this.cooldown = rr(...this.rest); }

  // Go and film this now, however far it is (someone asked to see it).
  focus(s: Subject, drone: THREE.Vector3) { this.begin(s, drone, true); }

  private begin(best: Subject, drone: THREE.Vector3, forced: boolean) {
    if (this.shot) this.recent.set('left:' + speciesOf(this.shot.subject), this.clock);   // (what it is leaving: not straight back to it)
    const p = best.pos() ?? drone;
    this.ang = Math.atan2(drone.z - p.z, drone.x - p.x);   // come in from the side we are already on
    this.move = ''; this.gpx = NaN;
    this.spin = (R() < 0.5 ? -1 : 1) * rr(0.035, 0.07) * this.spinK;
    this.side = R() < 0.5 ? -1 : 1; this.hold.set(NaN, 0, 0); this.gspd = 0;
    this.t = 0; this.waitT = 0; this.goneT = 0;
    const [a, b] = DURATION[best.kind];
    this.dur = best.hold ?? rr(a, b) * this.dwellK;
    this.recent.set(best.key, this.clock);
    this.bored.set(speciesOf(best), (this.bored.get(speciesOf(best)) ?? 0) + 1);
    this.recent.set('kind:' + best.kind, this.clock);
    // how to film it, in this guide's manner (following needs something that swims about)
    const still = best.kind === 'anemone' || best.kind === 'octopus' || best.kind === 'cave' || best.kind === 'robot' || !!best.front || !!best.under;
    const style = pick(this.styles, (k) => !(still && k === 'follow')) as Style | undefined;
    this.shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), subject: best, phase: 'approach', forced, asked: forced, zoom: forced || style === 'detail', style: forced ? 'orbit' : style ?? 'orbit' };   // (asked for from the guide: a closer look once there)
    if (best.tour) {
      // enter from whichever end is nearer
      const e0 = best.tour.start(false), e1 = best.tour.start(true);
      this.shot.rev = Math.hypot(e1.x - drone.x, e1.z - drone.z) < Math.hypot(e0.x - drone.x, e0.z - drone.z);
      this.dur = best.tour.length;
    }
    this.onStart(best);
  }

  // How interesting something is right now, to film: how much is happening (its prio), whether it is in
  // front of the lens and near, how worn the eye is by its kind already today (boredom fades over about
  // ten minutes), whether it was just filmed, how rare or grand it is, and the guide's own taste.
  private bored = new Map<string, number>();
  switchK = 1.6;   // (how much better something passing must be to switch to it, mid-shot)
  minHold = 8;     // (how long a shot is held before switching is considered)
  interest(s: Subject, drone: THREE.Vector3, fwd: THREE.Vector3, self = false) {
    const p = s.pos(); if (!p || !s.live()) return 0;
    if ((this.skipUntil.get(s.key) ?? 0) > this.clock) return 0;
    const dx = p.x - drone.x, dy = p.y - drone.y, dz = p.z - drone.z, d = Math.hypot(dx, dy, dz);
    if (d > (s.reach ?? 42)) return 0;
    const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3);
    const vis = 0.55 + 0.75 * Math.max(0, dot) * (1 - Math.min(1, Math.max(0, (d - 4) / 31)));
    const near = 1 - d / (Math.max(60, (s.reach ?? 42) * 1.25) * this.nearK);    // (things worth crossing the island for fade more slowly with distance; a guide may keep to what is near)
    const bored = 1 / (1 + 0.9 * (this.bored.get(speciesOf(s)) ?? 0) * (self ? 0.4 : 1));
    const seenAgo = this.clock - (this.recent.get(s.key) ?? -1e9), kindAgo = this.clock - (this.recent.get('kind:' + s.kind) ?? -1e9);
    const leftAgo = this.clock - (this.recent.get('left:' + speciesOf(s)) ?? -1e9);
    const recent = self ? 1 : (seenAgo < 240 ? 0.25 : 1) * (kindAgo < 150 ? 0.5 : 1) * (leftAgo < 90 ? 0.3 : 1);   // (just left: not straight back)
    const grand = s.kind === 'giant' ? 1.4 : s.kind === 'manta' ? 1.3 : s.kind === 'big' ? 1.15 : s.kind === 'critter' ? 1.1 : 1;
    return s.prio * vis * Math.max(0, near) * bored * recent * grand * this.weight(s);
  }

  // A leap out of the sea, filmed one of three ways (not the same way twice running):
  //  'line'  from the waterline, side on: the lens just above the water and tipped down, a fifth of the frame
  //          sky, on the animal coming up through the blue; tipped up with it as it breaks out (four fifths
  //          sky while it is in the air), and down again as it falls back in;
  //  'close' right beside where it will come out, the lens very wide: it comes straight at the camera from
  //          below and goes up past it, the view thrown up after it;
  //  'air'   from above and off to the side, the whole arc and the splash below.
  private lastLeapView = '';
  private breach(sh: Shot, s: Subject, p: { x: number; y: number; z: number }, dt: number, drone: THREE.Vector3, floor: (x: number, z: number) => number) {
    if (!s.live()) { this.shot = null; this.cooldown = rr(...this.rest); return null; }
    const b = s.breach!, dx = b.dir.x, dz = b.dir.z, L = b.len ?? 4;
    const mx = p.x + dx * 2, mz = p.z + dz * 2;          // (where it will be in the air: a little on along its line)
    if (this.t === 0 && sh.phase === 'approach') {
      // which side, and how far: ours if there is water there to sit in, else the other; closer in over a shallow reef
      const our = (drone.x - p.x) * -dz + (drone.z - p.z) * dx >= 0 ? 1 : -1;
      let best: [number, number] = [our, b.dist];
      search: for (const k of [1, 0.75, 0.55]) for (const sd of [our, -our]) {
        const x = mx - dz * sd * b.dist * k, z = mz + dx * sd * b.dist * k;
        if (floor(x, z) < -1.6) { best = [sd, b.dist * k]; break search; }
      }
      this.side = best[0]; this.ang = best[1];
      // the framing: mostly from the waterline, now and then close in, now and then from the air
      const lat = L * 0.5 + 1.5, cx = p.x + dx * 2.5 - dz * this.side * lat, cz = p.z + dz * 2.5 + dx * this.side * lat;
      const opts: ('line' | 'close' | 'air')[] = ['line', 'line', 'close', 'close', 'air'].filter((v) => v !== this.lastLeapView) as any;
      let view = opts[Math.floor(Math.random() * opts.length)];
      if (view === 'close' && floor(cx, cz) > -1.6) view = 'line';   // (no water to sit in beside it)
      sh.leapView = view; this.lastLeapView = view;
    }
    const d = this.ang, body = b.body ?? { x: mx, y: b.h * 0.5, z: mz }, view = sh.leapView ?? 'line';
    // back in the water (filmed from the waterline or close beside it): the camera goes in after it, a little
    // behind and to the side at its depth, and watches it swim off, rather than staying at the splash looking
    // at the sky while it goes
    const after = b.after ? b.after() : -1;
    if (view !== 'air' && after > 0.8) {
      const back = L * 1.3 + 3, side = L * 0.8 + 2;
      sh.pos.set(body.x - dx * back - dz * this.side * side, Math.min(-1.4, body.y + 0.8), body.z - dz * back + dx * this.side * side);
      const fl = floor(sh.pos.x, sh.pos.z); if (sh.pos.y < fl + 1.2) sh.pos.y = Math.min(-1.0, fl + 1.2);
      sh.look.set(body.x, body.y, body.z);
      sh.tilt = undefined; sh.zoom = false; sh.surface = false; sh.down = true;
      this.t += dt;
      return sh;
    }
    if (view === 'close') {
      const lat = L * 0.5 + 1.5;
      sh.pos.set(p.x + dx * 2.5 - dz * this.side * lat, 0, p.z + dz * 2.5 + dx * this.side * lat);
    } else if (view === 'air') {
      sh.pos.set(mx - dz * this.side * d * 1.5 - dx * d * 0.4, b.h * 4 + 3, mz + dx * this.side * d * 1.5 - dz * d * 0.4);
    } else sh.pos.set(mx - dz * this.side * d, 0, mz + dx * this.side * d);
    // looking at the animal itself, wherever it is on its way (before it is out, where it will come out)
    sh.look.set(body.x, body.y, body.z);
    // the line: the horizon a fifth from the top while it is under (lens tipped down ~0.4), four fifths down
    // while it is out (tipped up as much), following its height through the surface
    // (tipped up a moment ahead of it, as it nears the surface, so the camera is with it when it comes out)
    sh.tilt = view === 'line' ? -0.4 + 0.8 * Math.min(1, Math.max(0, (body.y + L * 0.5) / (L * 0.55 + 0.4))) : undefined;
    sh.zoom = false;   // (a leap is filmed with the lens as the framing has it, not closed in on)
    sh.surface = view !== 'air';
    const gap = Math.hypot(drone.x - sh.pos.x, drone.z - sh.pos.z);
    if (sh.phase === 'approach' && (gap < 3 || this.t > 20)) sh.phase = 'observe';
    this.t += dt;
    return sh;
  }

  update(dt: number, drone: THREE.Vector3, subjects: () => Subject[], floor: (x: number, z: number) => number, fwd: THREE.Vector3 = new THREE.Vector3(0, 0, -1)): Shot | null {
    this.clock += dt;
    for (const [k, v] of this.bored) { const nv = v * Math.exp(-dt / 600); if (nv < 0.05) this.bored.delete(k); else this.bored.set(k, nv); }
    // a whale or a manta on its way up to leap: drop everything (but what someone asked to see, or a
    // ride through the cave) and get to the waterline in time
    if ((this.brT -= dt) < 0 && !this.shot?.subject.breach && !this.shot?.asked && !this.shot?.subject.tour) {
      this.brT = 0.5;
      if (this.clock - this.brSince > 900) this.brN = 0;
      for (const s of subjects()) {
        if (!s.breach || !s.live() || (this.skipUntil.get(s.key) ?? 0) > this.clock || this.brN >= 3) continue;
        const p = s.pos(); if (!p || Math.hypot(p.x - drone.x, p.z - drone.z) > (s.reach ?? 42)) continue;
        if (this.brN === 0) this.brSince = this.clock;
        this.brN++; this.begin(s, drone, false); break;
      }
    }
    if (!this.shot) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return null;
      this.cooldown = 3;                      // look again in a moment if nothing is found
      let best: Subject | null = null, bs = 0;
      for (const s of subjects()) {
        const score = this.interest(s, drone, fwd) * (0.85 + 0.3 * R());   // (a little chance in it: not always the same favourite first)
        if (score > bs) { bs = score; best = s; }
      }
      if (!best || bs < 0.9) return null;
      this.begin(best, drone, false);
    }
    // mid-shot: something better right in front of the lens (or the one being followed has got far
    // away while something good is close by): switch to it
    if (this.shot && this.shot.phase === 'observe' && !this.shot.forced && !this.shot.asked && !this.shot.subject.tour && (this.switchT -= dt) < 0) {
      this.switchT = 1;
      const cur = this.shot.subject, cp = cur.pos();
      const curD = cp ? Math.hypot(cp.x - drone.x, cp.y - drone.y, cp.z - drone.z) : 99;
      const keepHunt = cur.kind === 'hunt' && cur.live();
      const curJump = this.jumpTo(cur);
      if (!keepHunt) {
        const cs = this.interest(cur, drone, fwd, true);
        let alt: Subject | null = null, as = 0, jump: Subject | null = null, js = 0;
        for (const s of subjects()) {
          if (s.key === cur.key || s.kind === 'cave' || s.tour) continue;
          const p = s.pos(); if (!p || !s.live()) continue;
          const dx = p.x - drone.x, dy = p.y - drone.y, dz = p.z - drone.z, d = Math.hypot(dx, dy, dz);
          // (what it drops everything for: but not one it has just been filming — that is how it swung back and forth)
          const j = !curJump && this.jumpTo(s) && this.clock - (this.recent.get(s.key) ?? -1e9) > 240 && this.clock - (this.recent.get('left:' + speciesOf(s)) ?? -1e9) > 90;
          if (d > (j ? 30 : 14) || (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3) < (j ? 0 : 0.45)) continue;   // (passing close, in view; what it lives for, anywhere near)
          const sc = this.interest(s, drone, fwd);
          if (j && sc > js) { js = sc; jump = s; }
          // (nor something it filmed only a moment ago, passing again: once seen, it moves on)
          if (sc > as && this.clock - (this.recent.get(s.key) ?? -1e9) > 120) { as = sc; alt = s; }
        }
        // what this guide drops everything for, at once; otherwise only once it has given this one a fair look
        if (jump && js > 0.3 && this.t > Math.min(3, this.minHold)) this.begin(jump, drone, false);   // (given at least a moment's look first)
        else if (this.t > this.minHold && alt && (as > cs * this.switchK || (curD > 20 && as > cs * 0.8))) this.begin(alt, drone, false);
      }
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
        if (this.t > this.dur + 1) { this.shot = null; this.cooldown = rr(...this.rest); return null; }
      }
      this.t += dt;
      return sh;
    }
    if (s.breach && p) return this.breach(sh, s, p, dt, drone, floor);
    const far = p ? !sh.forced && Math.hypot(p.x - drone.x, p.z - drone.z) > 55 : !sh.forced;
    // what it is filming is no longer there (gone from the sea, its season over, the event ended): a moment's
    // grace, then back to the cruise (a hunt has its own, below)
    this.goneT = s.live() || s.kind === 'hunt' ? 0 : this.goneT + dt;
    if (sh.forced && !p) {                                       // e.g. whales still on their way in: hold here and look out
      // (but not for ever, nor once they can no longer come: then on with the cruise)
      if (this.waitT === 0) { sh.pos.copy(drone as THREE.Vector3); sh.look.set(drone.x + 10, drone.y, drone.z); }
      this.waitT += dt;
      if (this.goneT > 1.5 || this.waitT > Director.WAIT) { this.shot = null; this.cooldown = rr(4, 8); return null; }
      return sh;
    }
    if (!p || far || this.goneT > 1.5 || (sh.phase === 'observe' && this.t > this.dur && !(s.kind === 'hunt' && s.live())) || (s.kind === 'hunt' && !s.live() && this.t > 4 && !s.hold)) {
      this.recent.set('left:' + speciesOf(s), this.clock);
      this.shot = null;
      this.cooldown = rr(...this.rest);
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
      if (!s.live() && this.t > 3) { this.shot = null; this.cooldown = rr(...this.rest); return null; }
      this.t += dt;
      return sh;
    }
    if (p) this.track(p, dt);
    // something big: close in, where its size tells — see below
    const L = s.len ?? s.size;
    if (p && L >= 1.4 && (s.kind === 'giant' || s.kind === 'big' || s.kind === 'manta') && p.y < -1.5) return this.giant(sh, s, p, L, dt, drone, floor);
    // close: about a body length or so away, by the animal's own size (a small fish from under a metre)
    const sz = Math.min(s.size, Math.max(s.len ?? s.size, 0.15) * 2) * (s.kind === 'school' ? 0.65 : 1);   // (a school: in among its edge)
    const dist = Math.max(0.8, Math.min(7, sz * 1.25 + 0.55)) * this.distK * (sh.zoom ? 0.75 : 1);
    if (s.under && p) {
      // a tornado of fish: from right underneath, looking up the hollow core toward the light
      const sw = this.t * 0.05, x = p.x + Math.cos(sw) * 0.6, z = p.z + Math.sin(sw) * 0.6;
      const y = Math.min(Math.max(p.y - s.under, floor(x, z) + 0.9), -1);
      sh.pos.set(x, y, z); sh.look.set(p.x + Math.cos(sw + 2) * 0.9, p.y + 6, p.z + Math.sin(sw + 2) * 0.9);
      const gap = Math.hypot(drone.x - x, drone.y - y, drone.z - z);
      if (sh.phase === 'approach' && (gap < 1.5 || this.t > 30)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
      this.t += dt;
      return sh;
    }
    if (s.front && p) {
      // something looking out of a hole: face it from the open water, swaying gently from side to side
      const f = s.front(), sw = (this.spin > 0 ? 0.7 : -0.7) + Math.sin(this.t * 0.12) * 0.3, c = Math.cos(sw), si = Math.sin(sw);   // (from forty degrees or so off its line: the head and a length of body)
      const fx = f.x * c - f.z * si, fz = f.x * si + f.z * c, d = dist * 0.9;
      const x = p.x + fx * d, z = p.z + fz * d, y = Math.min(Math.max(p.y + f.y * d + 0.3, floor(x, z) + 0.8), -0.9);
      sh.pos.set(x, y, z); sh.look.set(p.x, p.y, p.z);
      const gap = Math.hypot(drone.x - x, drone.y - y, drone.z - z);
      if (sh.phase === 'approach' && (gap < 1.5 || (!sh.forced && this.t > 25) || this.t > 90)) { sh.phase = 'observe'; sh.forced = false; this.t = 0; }
      this.t += dt;
      return sh;
    }
    const lift = Math.min(1.5, 0.2 + sz * 0.22);
    const wet = p.y <= -0.5, hl = Math.hypot(this.gvx, this.gvz) || 1, fx = this.gvx / hl, fz = this.gvz / hl, sx = -fz * this.side, sz2 = fx * this.side;
    const style = !wet ? 'orbit' : sh.style === 'follow' && this.gspd < 0.12 ? 'orbit' : sh.style ?? 'orbit';
    let x: number, y: number, z: number;
    sh.look.set(p.x, p.y, p.z);
    if (style === 'follow') {
      // behind it and a little to one side and above, going where it goes, looking past it the way it swims
      const d = dist * 1.15;
      x = p.x - fx * d + sx * d * 0.45; z = p.z - fz * d + sz2 * d * 0.45; y = p.y + d * 0.3;
      sh.look.set(p.x + fx * d * 0.4, p.y, p.z + fz * d * 0.4);
    } else if (style === 'wait') {
      // still, on its way (or just off it), and let it come on and go by; once it is well past, a new spot
      const gone = !isNaN(this.hold.x) && Math.hypot(this.hold.x - p.x, this.hold.z - p.z) > dist * 3.2;
      if (isNaN(this.hold.x) || gone) {
        const ahead = this.gspd > 0.12 ? dist * 1.6 : 0, a = this.ang;
        this.hold.set(p.x + fx * ahead + (ahead ? sx * dist * 0.75 : Math.cos(a) * dist), p.y + lift * 0.5, p.z + fz * ahead + (ahead ? sz2 * dist * 0.75 : Math.sin(a) * dist));
      }
      x = this.hold.x; z = this.hold.z; y = this.hold.y;
    } else if (style === 'low' && p.y - floor(p.x, p.z) > dist * 0.55 + 1) {
      // from beneath and a little off, looking up at it against the light from the surface
      this.ang += this.spin * dt * 0.5;
      const d = dist * 0.75;
      x = p.x + Math.cos(this.ang) * d; z = p.z + Math.sin(this.ang) * d; y = p.y - dist * 0.65;
      sh.look.set(p.x, p.y + dist * 0.15, p.z);
    } else {
      // circling it (close in, for a look at the details)
      this.ang += this.spin * dt * (sh.phase === 'observe' ? 1 : 0.3);
      const d = style === 'detail' ? Math.max(0.6, dist * 0.6) : dist;
      x = p.x + Math.cos(this.ang) * d; z = p.z + Math.sin(this.ang) * d; y = p.y + lift * (style === 'detail' ? 0.5 : 1);
    }
    // (ashore or at the surface: from the air, at the height of someone standing by)
    y = !wet ? Math.max(p.y + lift + 0.6, floor(x, z) + 1.2, 0.8) : Math.min(Math.max(y, floor(x, z) + (style === 'low' ? 0.6 : 1.0)), -0.9);
    // (nothing between the lens and it — a sea fan, a coral head, a rock: else round to where there is a clear
    // view, or up a little over what is in the way. A small thing seen through a fan is not seen at all.)
    if (wet) {
      const seen = (qx: number, qy: number, qz: number) => { for (let i = 1; i < 8; i++) { const f = i / 8, ax = qx + (p.x - qx) * f, az = qz + (p.z - qz) * f, ay = qy + (p.y - qy) * f; if (floor(ax, az) > ay - 0.15) return false; } return true; };
      if (!seen(x, y, z)) {
        const d = Math.max(0.8, Math.hypot(x - p.x, z - p.z));
        let found = false;
        for (let k = 1; k <= 8 && !found; k++) {
          const a = this.ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.7, ax = p.x + Math.cos(a) * d, az = p.z + Math.sin(a) * d;
          const ay = Math.min(Math.max(y, floor(ax, az) + 1.0), -0.9);
          if (seen(ax, ay, az)) { this.ang = a; x = ax; z = az; y = ay; found = true; if (style === 'wait') this.hold.set(ax, ay, az); }
        }
        if (!found) y = Math.min(y + 1.2, -0.9);
      }
    }
    sh.pos.set(x, y, z);
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
  // a subject's heading and speed, from how it has been moving (kept when it drifts slowly)
  private track(p: { x: number; z: number }, dt: number) {
    if (!isNaN(this.gpx)) {
      const vx = (p.x - this.gpx) / Math.max(dt, 1e-3), vz = (p.z - this.gpz) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz);
      if (sp > 0.05 && sp < 20) { const k = Math.min(1, dt * 1.2); this.gvx += (vx / sp - this.gvx) * k; this.gvz += (vz / sp - this.gvz) * k; }
      if (sp < 20) this.gspd += (sp - this.gspd) * Math.min(1, dt * 0.8);
    }
    this.gpx = p.x; this.gpz = p.z;
  }

  private giant(sh: Shot, s: Subject, p: { x: number; y: number; z: number }, L: number, dt: number, drone: THREE.Vector3, floor: (x: number, z: number) => number): Shot {
    const hl = Math.hypot(this.gvx, this.gvz) || 1, fx = this.gvx / hl, fz = this.gvz / hl, sx = -fz, sz = fx;
    const side = (drone.x - p.x) * sx + (drone.z - p.z) * sz >= 0 ? 1 : -1;
    const room = p.y - floor(p.x, p.z);
    // the next move, every so often
    if (!this.move || (this.moveT += dt) > this.moveDur) {
      // (the guide's own favourite moves, and the ones that move through space, pulling back and coming
      // round to show the whole of it — most of all for the true giants, where staying close shows nothing)
      const huge = L >= 8, w: Partial<Record<GiantMove, number>> = { reveal: 1.4, arc: 1.4, rise: 1, trail: 0.7, wide: 0.6, ...this.giantW };
      if (huge) { w.flank = (w.flank ?? 0) * 0.5; w.front = (w.front ?? 0) * 0.5; w.reveal! *= 1.8; w.arc! *= 1.6; w.wide! *= 1.8; w.rise! *= 1.3; }
      this.move = pick(w, (m) => m !== this.move && (m !== 'under' || room > L * 0.45 + 2) && (m !== 'rise' || room > L * 0.3 + 1.5)) ?? 'flank'; this.moveT = 0;
      this.moveDur = this.move === 'reveal' || this.move === 'arc' || this.move === 'rise' ? rr(11, 15) : rr(9, 13);
      this.arcDir = R() < 0.5 ? 1 : -1;
      if (this.move === 'pass') this.hold.set(p.x + fx * (L * 1.4 + 3) + sx * side * (L * 0.35 + 1.2), p.y + L * 0.04, p.z + fz * (L * 1.4 + 3) + sz * side * (L * 0.35 + 1.2));
    }
    const wideBody = s.kind === 'manta';   // (a manta is as wide as it is long: keep clear of its wingtips)
    L *= 1 + 0.8 * Math.min(1, Math.max(0, (this.gspd - 1.5) / 1.5));   // (something racing past, faster than the drone can follow closely: stand further off)
    const spot = (move: string) => {
      let x = 0, y = 0, z = 0, lx = p.x, ly = p.y, lz = p.z, wide = 1;
      if (move === 'flank') {
        // alongside the head, a little ahead of it, looking back along the flank
        const d = wideBody ? L * 0.6 + 1.6 : Math.max(1.3, L * 0.32 + 0.8), a = L * (wideBody ? 0.15 : 0.28);
        x = p.x + sx * side * d + fx * a; z = p.z + sz * side * d + fz * a; y = p.y + L * 0.03;
        lx = p.x - fx * L * 0.12; lz = p.z - fz * L * 0.12;
      } else if (move === 'under') {
        // beneath it and a little ahead, looking up at it passing over against the bright surface
        x = p.x + fx * L * 0.15 + sx * side * L * 0.12; z = p.z + fz * L * 0.15 + sz * side * L * 0.12; y = p.y - (wideBody ? L * 0.35 + 1.5 : L * 0.42 + 1.2);
        lx = p.x - fx * L * 0.1; lz = p.z - fz * L * 0.1; wide = 1.1;
      } else if (move === 'front') {
        // out in front, a touch to one side, backing away as it comes on
        const d = L * 0.5 + 1.5;
        x = p.x + fx * d + sx * side * L * 0.22; z = p.z + fz * d + sz * side * L * 0.22; y = p.y + L * 0.02;
        lx = p.x + fx * L * 0.3; lz = p.z + fz * L * 0.3; wide = 0.8;
      } else if (move === 'reveal' || move === 'arc' || move === 'rise' || move === 'trail' || move === 'wide') {
        const k = Math.min(1, this.moveT / this.moveDur), e = k * k * (3 - 2 * k);
        let ang = 0, d = 0;   // (round it from straight ahead (0) to the side (π/2) to behind (π); on our side)
        if (move === 'reveal') {
          // in close beside the head, then drawing back and up and round toward its tail, the whole of it opening out
          ang = 1.2 + 0.9 * e; d = L * (0.32 + 1.0 * e) + 1 + 2 * e; y = p.y + L * (0.02 + 0.32 * e); wide = 1.1 - 0.25 * e;
        } else if (move === 'arc') {
          // sweeping round it at a middle distance, from its flank to ahead of it (or the other way)
          ang = this.arcDir > 0 ? 1.7 - 1.15 * e : 0.55 + 1.15 * e; d = L * 0.8 + 2; y = p.y + L * 0.08 + Math.sin(e * Math.PI) * L * 0.12; wide = 0.95;
        } else if (move === 'rise') {
          // from below its flank up past it to above, the bulk of it rolling through the frame
          ang = 1.4; d = L * 0.65 + 2; y = p.y + L * (-0.42 + 0.85 * e); wide = 1.05;
        } else if (move === 'trail') {
          // behind and above, following the stroke of the tail
          ang = 2.65; d = L * 0.9 + 2; y = p.y + L * 0.25;
          lx = p.x + fx * L * 0.25; lz = p.z + fz * L * 0.25; wide = 0.95;
        } else {
          // well off, out in the blue, the whole animal small against it: its size told by what is around it
          ang = 1.0; d = L * 1.9 + 4; y = p.y - L * 0.12; wide = 0.85;
        }
        const ca = Math.cos(ang), sa = Math.sin(ang);
        x = p.x + fx * d * ca + sx * side * d * sa; z = p.z + fz * d * ca + sz * side * d * sa;
      } else {
        // hold still on its path and let it glide past, close
        x = this.hold.x; y = this.hold.y; z = this.hold.z;
      }
      y = Math.min(Math.max(y, floor(x, z) + 0.8), -0.9);
      // never inside its bulk: the floor or the surface may have squeezed the camera in — push it out sideways
      // to a distance the animal's size calls for (a whale needs metres, not an arm's length)
      { const minD = L >= 8 ? L * 0.42 : wideBody ? L * 0.45 + 0.8 : L * 0.22 + 0.7, dx = x - p.x, dz = z - p.z, dy = y - p.y, d3 = Math.hypot(dx, dy, dz);
        if (d3 < minD) { const h = Math.hypot(dx, dz), need = Math.sqrt(Math.max(0, minD * minD - dy * dy)), ux = h > 0.1 ? dx / h : sx * side, uz = h > 0.1 ? dz / h : sz * side; x = p.x + ux * need; z = p.z + uz * need; y = Math.min(Math.max(y, floor(x, z) + 0.8), -0.9); } }
      // (no rock or reef between the lens and the animal)
      let clear = true;
      for (let i = 1; i < 8 && clear; i++) { const f = i / 8, qx = x + (p.x - x) * f, qz = z + (p.z - z) * f, qy = y + (p.y - y) * f; if (floor(qx, qz) > qy - 0.4) clear = false; }
      return { x, y, z, lx, ly, lz, wide, clear };
    };
    let c = spot(this.move);
    if (!c.clear) {
      // blocked: take whichever other move has a clear view (or rise over the obstacle)
      for (const m of ['arc', 'flank', 'reveal', 'under', 'front']) { if (m === this.move) continue; const o = spot(m); if (o.clear) { this.move = m; this.moveT = 0; this.moveDur = rr(9, 13); c = o; break; } }
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
