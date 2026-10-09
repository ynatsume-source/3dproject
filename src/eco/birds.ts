// Seabirds over the sea, and how each kind hunts (ocean/seabird is the body). They glide and flap in bursts, bank
// into their turns, settle on the water to rest (bobbing on the swell, wings folded) and take off again, running on
// the water with their feet. And they fish, each its own way:
//   booby      — climbs, looks down, tips over and plunges: the wings swept back further and further as it falls,
//                an arrow at the last; under the water it chases with half-open wings, then pops up and swallows
//   tern       — hovers, beating hard, tail fanned and head bowed to the water, then drops to snatch at the surface
//                and climbs away with the fish in its bill
//   shearwater — skims the swell on stiff wings; drops in from a few metres and swims down after the fish
//   albatross  — rides the wind over the swell; settles and seizes what is at the surface
//   frigate    — cannot land on the sea: soars high, swoops to pick fish off the surface without getting wet, and
//                harries a bird carrying a fish until it drops it, catching it before it reaches the water
// Over a bait ball they all come to the one place. Anywhere else they hunt the open water about them, the
// boobies and shearwaters only over water deep enough to dive in.
// Nothing comes out of nowhere (CLAUDE.md): a bird is set down only where the camera cannot see it — far off over
// the sea, or well behind — and flies in; the great flock that comes to a bait ball waits beyond sight.
import * as THREE from 'three';
import { U } from '../render/common';
import { swellAt } from '../ocean/air';
import { seabirdGeometry, seabirdMaterial, type BirdLook } from '../ocean/seabird';
import { clamp, R, rr, hyp } from '../core/math';
import type { BirdSpec } from '../data/locations';

export function lookOf(sp: BirdSpec): BirdLook { return { c1: sp.c1, c2: sp.c2, bill: sp.c3, ...(sp.look || {}) } as BirdLook; }

// a single bird for the field guide (?debug studio: set { flap, ph, fold, dive, legs, tail, head, seed })
export function birdModel(sp: BirdSpec, set: Record<string, number> = {}) {
  const g = seabirdGeometry(sp.kind).clone();
  g.setAttribute('aFly', new THREE.InstancedBufferAttribute(new Float32Array([set.flap ?? 0, set.ph ?? 0, set.fold ?? 0, set.dive ?? 0]), 4));
  g.setAttribute('aFly2', new THREE.InstancedBufferAttribute(new Float32Array([set.legs ?? 0, set.tail ?? 0, set.head ?? 0, set.seed ?? 0.3]), 4));
  const m = new THREE.InstancedMesh(g, seabirdMaterial(sp.kind, lookOf(sp)), 1); m.setMatrixAt(0, new THREE.Matrix4()); m.frustumCulled = false;
  return m;
}

// something at the surface worth gathering over (a bait ball), and what a dive into it does
export interface Attractor { on: boolean; c: THREE.Vector3; r: number; take(x: number, z: number): number | void }
export interface Plunge { splash(x: number, z: number, big: number): void; bubbles(x: number, y: number, z: number): void; plop(p: THREE.Vector3): void }
// the sea under the birds: how deep (the bottom's height), and the land
export interface BirdSea { top(x: number, z: number): number; ground(x: number, z: number): number }

type State = 'fly' | 'hover' | 'dive' | 'under' | 'rest' | 'takeoff' | 'land' | 'chase' | 'skim';
interface Bird {
  p: THREE.Vector3; h: number; vy: number; state: State; t: number; seed: number; altT: number; stateT: number; speed: number; placed: boolean;
  flap: number; flapping: number; ph: number; fold: number; dive: number; legs: number; tail: number; head: number; bank: number; pitch: number;
  tx: number; tz: number; dip: boolean;
  hunt: number;            // seconds till it goes after fish again
  carry: number;           // seconds left carrying a fish (in its bill, or its crop)
  caught: boolean;         // the last dive took something
  prey: Bird | null; preySp: BirdSpec | null; chased: number; drop: { p: THREE.Vector3; v: THREE.Vector3 } | null;
  visit: number;           // seconds left coming past the camera (called up from the guide)
}

const AIR_SIGHT = 450;   // (a bird a metre or two across, further than this, is a speck of a pixel or less in the haze)
/** Whether the camera cannot see a bird at p: far off, or not close and well off to the side or behind (as eco/unseen,
 *  with the air's reach). */
export function birdUnseen(p: THREE.Vector3, cam: THREE.Vector3, fx: number, fz: number) {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, d = hyp(dx, dy, dz);
  if (d > AIR_SIGHT) return true;
  if (d <= 22) return false;
  const fl = hyp(fx, fz) || 1, hd = hyp(dx, dz) || 1;
  return (dx * fx + dz * fz) / fl / hd < Math.cos(75 * Math.PI / 180);
}
const ang = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function makeBirds(specs: BirdSpec[], group: THREE.Object3D, sea?: BirdSea) {
  const deep = (x: number, z: number, need: number) => !sea || (sea.top(x, z) < -need && sea.ground(x, z) < -need);
  const flocks = specs.map((sp) => {
    const g = seabirdGeometry(sp.kind).clone();
    const fly = new THREE.InstancedBufferAttribute(new Float32Array(sp.count * 4), 4), fly2 = new THREE.InstancedBufferAttribute(new Float32Array(sp.count * 4), 4);
    fly.setUsage(THREE.DynamicDrawUsage); fly2.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFly', fly); g.setAttribute('aFly2', fly2);
    const mesh = new THREE.InstancedMesh(g, seabirdMaterial(sp.kind, lookOf(sp)), sp.count);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    const birds: Bird[] = [];
    for (let i = 0; i < sp.count; i++) birds.push({ p: new THREE.Vector3(), h: R() * 6.28, vy: 0, state: 'fly', t: R() * 100, seed: R() * 50, altT: rr(sp.alt[0], sp.alt[1]), stateT: 0, speed: sp.speed, placed: false,
      flap: 0, flapping: 0, ph: 0, fold: 0, dive: 0, legs: 0, tail: 0, head: 0, bank: 0, pitch: 0, tx: 0, tz: 0, dip: false, hunt: rr(5, 60), carry: 0, caught: false, prey: null, preySp: null, chased: 0, drop: null, visit: 0 });
    return { sp, mesh, fly, fly2, birds, told: new Map<string, number>() };
  });
  const _o = new THREE.Object3D(), _v = new THREE.Vector3();
  let clockT = 0;

  // a place for a bird to be set down: far off over the sea for the great flock, otherwise behind the camera
  function place(b: Bird, sp: BirdSpec, cam: THREE.Vector3, fx: number, fz: number, first: boolean) {
    for (let k = 0; k < 30; k++) {
      let x: number, z: number;
      if (sp.crowd) { const a = R() * 6.28, d = rr(AIR_SIGHT + 30, AIR_SIGHT + 120); x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; }
      else if (first) { const d = rr(12, 70), lat = (R() * 2 - 1) * 60; x = cam.x + fx * d - fz * lat; z = cam.z + fz * d + fx * lat; }   // (the scene opening: they are already about)
      else { const a = Math.atan2(-fz, -fx) + (R() * 2 - 1) * 0.9, d = rr(60, 140); x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; }
      const rest = first && sp.rest > 0 && R() < sp.rest * 0.8 && deep(x, z, 0.5);
      b.p.set(x, rest ? swellAt(x, z) : Math.max(rr(sp.alt[0], sp.alt[1]), (sea ? sea.ground(x, z) : 0) + 8), z);
      if (!first && !birdUnseen(b.p, cam, fx, fz)) continue;
      if (rest) { b.state = 'rest'; b.fold = 1; b.stateT = rr(0, 60); } else { b.state = 'fly'; b.fold = 0; b.stateT = 0; }
      b.dive = 0; b.legs = rest ? 1 : 0; b.vy = 0; b.speed = rest ? 0 : sp.speed; b.prey = null; b.drop = null; b.chased = 0;
      b.h = sp.crowd ? R() * 6.28 : Math.atan2(cam.z - z, cam.x - x) + (R() * 2 - 1) * 0.8;   // (heading in, roughly)
      b.placed = true;
      return;
    }
  }

  function update(dt: number, cam: THREE.Vector3, fx: number, fz: number, show: boolean, log: (sp: BirdSpec, text: string) => void, at?: Attractor | null, fx2?: Plunge) {
    clockT += dt;
    const wa = Math.atan2(U.uCurrent.value.y, U.uCurrent.value.x) + 0.6;   // the wind blows along the swell
    // (said once in a while, of what happened in sight of the camera)
    const tell = (F: typeof flocks[0], b: Bird, key: string, text: string) => {
      if (!show && cam.y < 0 && b.p.y > 0) return;
      const d = b.p.distanceTo(cam); if (d > 70 || birdUnseen(b.p, cam, fx, fz)) return;
      _v.subVectors(b.p, cam).divideScalar(d); if (_v.x * fx + _v.z * fz < 0.5 * hyp(fx, fz)) return;
      if ((F.told.get(key) ?? -1e9) > clockT - 90) return;
      F.told.set(key, clockT); log(F.sp, text);
    };
    const carriers: { b: Bird; sp: BirdSpec }[] = [];
    for (const F of flocks) if (F.sp.kind !== 'frigate') for (const b of F.birds) if (b.carry > 0 && (b.state === 'fly' || b.state === 'takeoff')) carriers.push({ b, sp: F.sp });
    for (const F of flocks) {
      const sp = F.sp, arr = F.fly.array as Float32Array, arr2 = F.fly2.array as Float32Array, k = sp.kind;
      F.mesh.visible = true;   // (from under the water only diving birds are in sight: the surface hides the rest)
      F.birds.forEach((b, i) => {
        b.t += dt; b.stateT += dt; b.hunt -= dt; b.carry = Math.max(0, b.carry - dt); b.visit = Math.max(0, b.visit - dt); b.chased = Math.max(0, b.chased - dt);
        const dx = b.p.x - cam.x, dz = b.p.z - cam.z, r2 = dx * dx + dz * dz;
        // (left far behind: somewhere else now — put down again out of sight, to come in from there)
        if (!b.placed) place(b, sp, cam, fx, fz, true);
        else if (r2 > (sp.crowd ? AIR_SIGHT + 150 : 200) ** 2 && !(at && at.on) && b.state !== 'under' && birdUnseen(b.p, cam, fx, fz)) place(b, sp, cam, fx, fz, false);
        const sw = swellAt(b.p.x, b.p.z);
        const lure = at && at.on ? at : null;
        const lx = lure ? lure.c.x - b.p.x : 0, lz = lure ? lure.c.z - b.p.z : 0, ld = hyp(lx, lz);
        let wantA = 0, wantDive = 0, wantLegs = 0, wantTail = 0, wantHead = 0, wantFold = 0, flapA = sp.kind === 'albatross' ? 0.45 : k === 'tern' ? 0.85 : 0.72;

        if (b.state === 'dive') {
          // the plunge: tipped over and falling at the water, the wings swept back further the nearer it gets —
          // an arrow at the last. A tern's is a short swoop: it snatches at the surface and climbs away.
          b.flapping = 0;
          const h0 = Math.max(0.5, b.p.y - sw), tx = b.tx - b.p.x, tz = b.tz - b.p.z, dh = hyp(tx, tz);
          b.speed = Math.min(b.dip ? 9 : k === 'shearwater' ? 12 : 22, b.speed + dt * (b.dip ? 6 : 12));
          const down = b.dip ? 0.55 : k === 'shearwater' ? 0.7 : 2.6, hs = b.speed / hyp(1, down), vy = -hs * down;
          if (dh > 0.3) b.h = Math.atan2(tz, tx);
          const go = Math.min(hs, dh / Math.max(0.15, h0 / Math.max(-vy, 1)));
          b.p.x += Math.cos(b.h) * go * dt; b.p.z += Math.sin(b.h) * go * dt; b.p.y += vy * dt;
          b.pitch = Math.atan2(-vy, Math.max(go, 0.5)) * 0.95; b.bank *= 0.9;
          wantDive = b.dip ? 0.35 : clamp(1.15 - h0 / 14, 0.35, 1); wantTail = 0; wantHead = b.dip ? 0.5 : 0.2; flapA = 0;
          if (b.dip && h0 < 1.2) { wantLegs = 0.3; wantTail = 0.6; }
          if (b.p.y <= sw + (b.dip ? 0.2 : 0)) {
            const n = lure && ld < lure.r + 4 ? (lure.take(b.p.x, b.p.z) || 0) : 0;
            b.caught = n > 0 || (!lure && R() < (b.dip ? 0.35 : 0.45));
            fx2?.splash(b.p.x, b.p.z, b.dip ? 0.15 : k === 'shearwater' ? 0.3 : 0.6); fx2?.plop(b.p);
            if (b.dip) {
              b.state = 'fly'; b.stateT = 0; b.vy = 3; b.altT = sw + rr(4, 9); b.speed = sp.speed * 0.7; b.p.y = sw + 0.25; b.hunt = rr(12, 35);
              if (b.caught) { b.carry = rr(15, 30); tell(F, b, 'catch', `${sp.ja}が小魚をくわえて水面から飛び上がった`); }
            } else { b.state = 'under'; b.stateT = 0; b.vy = -(b.speed * 0.45); b.speed *= 0.35; }
          }
        } else if (b.state === 'under') {
          // under the water: carried down by the plunge, then chasing with half-open wings, and bobbing back up
          wantDive = 0.6; flapA = 0.35; b.flapping = b.stateT > 0.4 && b.stateT < 2.5 ? 1 : 0;
          const chase = b.stateT < (k === 'shearwater' ? 6 : 2.6);
          b.vy += dt * (chase ? (b.vy < -0.6 ? 6 : 0.4) : 5); if (!chase) b.vy = Math.min(b.vy, 2.2);
          b.speed += ((chase ? 1.8 : 0.6) - b.speed) * Math.min(1, dt * 2);
          if (lure && chase && ld > 0.5) { const d = ang(Math.atan2(lz, lx) - b.h); b.h += clamp(d, -1, 1) * dt * 1.5; }
          else b.h += Math.sin(b.t * 1.7 + b.seed) * dt * 0.8;
          b.p.x += Math.cos(b.h) * b.speed * dt; b.p.z += Math.sin(b.h) * b.speed * dt; b.p.y += b.vy * dt;
          const floor = sea ? sea.top(b.p.x, b.p.z) + 0.6 : -12;
          b.p.y = Math.max(b.p.y, Math.max(k === 'shearwater' ? -6 : -4, floor));
          b.pitch = clamp(-Math.atan2(b.vy, Math.max(b.speed, 0.3)), -1.2, 1.3); b.bank *= 0.9;
          if (R() < dt * 6) fx2?.bubbles(b.p.x, b.p.y, b.p.z);
          if (b.stateT > 0.6 && b.p.y >= sw) {
            b.state = 'rest'; b.p.y = sw; b.stateT = 0; b.tx = b.caught ? rr(3, 7) : rr(4, 20); b.hunt = rr(25, 70);
            if (b.caught) { b.carry = 40; tell(F, b, 'catch', `${sp.ja}が魚をとらえて浮かび上がり、のみこんだ`); }
          }
        } else if (b.state === 'rest') {
          // floating: bob on the swell, turn to face the wind, drift; just up from a dive, swallow and go
          b.p.y = sw + 0.02; wantFold = 1; wantLegs = 1; flapA = 0; b.flapping = 0;
          let d = ang(wa + Math.PI - b.h); b.h += d * dt * 0.2;
          b.p.x += Math.cos(wa) * 0.05 * dt; b.p.z += Math.sin(wa) * 0.05 * dt;
          b.bank = Math.sin(b.t * 0.9 + b.seed) * 0.08; b.pitch = Math.sin(b.t * 0.7) * 0.06 - 0.05;
          const fresh = b.tx > 0 && b.stateT < b.tx;
          wantHead = fresh && b.caught ? -0.5 * Math.max(0, Math.sin(b.stateT * 3)) : k === 'albatross' && Math.sin(b.t * 0.4 + b.seed) > 0.85 ? 0.9 : 0;   // (swallowing; an albatross dipping its bill)
          if (k === 'albatross' && wantHead > 0.5 && R() < dt * 0.05) { b.caught = true; tell(F, b, 'seize', `${sp.ja}が水面に浮かんで、くちばしで獲物をつまみ上げた`); }
          if ((b.tx > 0 && b.stateT > b.tx) || b.stateT > (b.seed % 1 + 1) * 70 || (lure && ld > lure.r * 4 && R() < dt * 0.3)) { b.state = 'takeoff'; b.stateT = 0; b.h = wa + Math.PI; b.speed = 1.5; b.tx = 0; }
        } else {
          // in the air: flying about, hovering, landing, taking off, chasing, skimming
          let turn = 0;
          if (b.state === 'takeoff') {
            // run and flap into the wind, feet pattering on the water, until airborne
            wantFold = 0; wantLegs = 1; wantTail = 0.5; flapA = 0.95; b.flapping = 1;
            b.speed = Math.min(sp.speed, b.speed + dt * (k === 'albatross' ? 2.5 : 4));
            b.altT = sw + (b.speed / sp.speed) * 3;
            if (b.speed >= sp.speed * 0.95) { b.state = 'fly'; b.stateT = 0; b.altT = rr(sp.alt[0], sp.alt[1]); }
          } else if (b.state === 'hover') {
            // a tern holding still in the air, into the wind, beating hard, tail fanned, looking straight down
            b.speed += (0.6 - b.speed) * Math.min(1, dt * 3); turn = ang(wa + Math.PI - b.h) * 1.5;
            b.altT = b.tz; flapA = 1.0; b.flapping = 1; wantTail = 1; wantHead = 0.9;
            if (b.stateT > b.tx) {
              const ok = R() < 0.65;
              if (ok) { b.state = 'dive'; b.stateT = 0; b.dip = true; const a = b.h, d = rr(1, 3); b.tx = b.p.x + Math.cos(a) * d; b.tz = b.p.z + Math.sin(a) * d; b.speed = 2; }
              else { b.state = 'fly'; b.stateT = 0; b.hunt = rr(4, 12); b.altT = sw + rr(4, 9); }
            }
          } else if (b.state === 'chase') {
            // a frigatebird after a bird with a fish: fast, close on its tail, then down after what it drops
            const q = b.prey!, tx = (b.drop ? b.drop.p.x : q.p.x + Math.cos(q.h) * 2) - b.p.x, tz = (b.drop ? b.drop.p.z : q.p.z + Math.sin(q.h) * 2) - b.p.z;
            const ty = b.drop ? b.drop.p.y : q.p.y + 0.5, d = hyp(tx, tz, ty - b.p.y);
            turn = ang(Math.atan2(tz, tx) - b.h) * 3; b.speed += (Math.min(16, sp.speed * 1.7) - b.speed) * Math.min(1, dt); b.altT = ty;
            b.flapping = Math.max(b.flapping, 0.4); wantTail = 0.5;
            if (!b.drop) {
              q.chased = 1;
              if (d < 4 && R() < dt * 0.35) {
                // (it gives up the fish: falling now)
                b.drop = { p: q.p.clone(), v: new THREE.Vector3(Math.cos(q.h) * q.speed * 0.5, 1, Math.sin(q.h) * q.speed * 0.5) }; q.carry = 0; q.caught = false;
                tell(F, b, 'rob', `${b.preySp!.ja}がたまらず魚を落とした`);
              }
            } else {
              b.drop.v.y -= 9.8 * dt; b.drop.p.addScaledVector(b.drop.v, dt); wantHead = 0.6;
              if (d < 1.4) { b.carry = 40; b.caught = true; b.drop = null; b.state = 'fly'; b.stateT = 0; b.prey = null; b.hunt = rr(60, 150); b.altT = rr(sp.alt[0], sp.alt[1]); tell(F, b, 'robbed', `${sp.ja}が落ちる魚を空中でさらった`); }
              else if (b.drop.p.y < swellAt(b.drop.p.x, b.drop.p.z)) { fx2?.splash(b.drop.p.x, b.drop.p.z, 0.08); b.drop = null; b.state = 'fly'; b.stateT = 0; b.prey = null; b.hunt = rr(30, 80); b.altT = rr(sp.alt[0], sp.alt[1]); }
            }
            if (b.state === 'chase' && (b.stateT > 18 || (!b.drop && (q.carry <= 0 || q.state !== 'fly' && q.state !== 'takeoff')))) { b.state = 'fly'; b.stateT = 0; b.prey = null; b.hunt = rr(30, 90); b.altT = rr(sp.alt[0], sp.alt[1]); }
          } else if (b.state === 'skim') {
            // a frigatebird down to the surface on a long glide, bill dipped to pick a fish off it, never touching
            const tx = b.tx - b.p.x, tz = b.tz - b.p.z, dh = hyp(tx, tz);
            if (dh > 2) { turn = ang(Math.atan2(tz, tx) - b.h) * 1.5; b.altT = sw + 0.35 + Math.min(dh * 0.35, 30); }
            else { b.altT = sw + 0.35; wantHead = 1; }
            b.speed += (11 - b.speed) * Math.min(1, dt); b.flapping = 0; wantTail = 0.3;
            if (dh < 1.5 || (b.stateT > 3 && dh < 6 && b.p.y < sw + 1.2 && Math.cos(b.h) * tx + Math.sin(b.h) * tz < 0)) {   // (there, or just past it)
              b.caught = lure ? (lure.take(b.p.x, b.p.z) || 0) > 0 : R() < 0.4;
              fx2?.splash(b.p.x, b.p.z, 0.06);
              if (b.caught) { b.carry = 40; tell(F, b, 'skim', `${sp.ja}が水面すれすれをかすめて、魚をさらっていった`); }
              b.state = 'fly'; b.stateT = 0; b.altT = rr(sp.alt[0], sp.alt[1]); b.hunt = rr(40, 100); b.flapping = 1.2;
            }
            if (b.stateT > 25) { b.state = 'fly'; b.stateT = 0; b.altT = rr(sp.alt[0], sp.alt[1]); b.hunt = rr(20, 60); }
          } else {
            wantFold = 0;
            // wander: slow meanders; the soaring birds carve long arcs
            const arc = k === 'albatross' || k === 'frigate' ? 0.35 : 0.5;
            turn = (Math.sin(b.t * 0.23 + b.seed) * 0.6 + Math.sin(b.t * 0.071 + b.seed * 3) * 0.5) * arc;
            if (b.chased > 0) { turn = Math.sin(b.t * 2.6 + b.seed) * 2.2; b.flapping = Math.max(b.flapping, 0.4); b.speed = Math.min(sp.speed * 1.3, b.speed + dt * 3); }   // (jinking, to shake off a frigatebird)
            if (b.visit > 0) {
              // called up: across in front of the camera
              const gx = cam.x + fx * 22 - b.p.x, gz = cam.z + fz * 22 - b.p.z;
              turn = ang(Math.atan2(gz, gx) - b.h) * 1.2; b.altT = Math.max(cam.y + 3, sw + 3);
            } else if (lure && b.state === 'fly' && k !== 'frigate') {
              // wheel over the fish: circle at a height that suits the bird, and go in
              const orbit = k === 'albatross' ? lure.r + 2 : k === 'tern' ? lure.r + 5 : k === 'shearwater' ? lure.r + 3 : lure.r + 10;
              const tang = Math.atan2(lz, lx) + (b.seed % 2 < 1 ? 1 : -1) * Math.PI / 2 * clamp(orbit / Math.max(ld, 1), 0, 1.4);   // head in from afar, then wheel round
              turn = ang(tang - b.h) * 1.4 + turn * 0.3;
              b.altT = sw + (k === 'tern' ? rr(3, 6) : k === 'albatross' ? 1.5 : k === 'shearwater' ? 2.5 : 12 + (b.seed % 1) * 14);
              if (ld < orbit + 6 && b.stateT > 2 && b.hunt < 0) {
                const a = R() * 6.28, rr0 = Math.sqrt(R()) * lure.r;
                if (k === 'tern' && R() < dt * 0.6) { b.state = 'hover'; b.stateT = 0; b.tx = rr(0.8, 2.2); b.tz = b.p.y; }
                else if ((k === 'booby' || k === 'shearwater') && R() < dt * 0.35) { b.state = 'dive'; b.stateT = 0; b.dip = false; b.tx = lure.c.x + Math.cos(a) * rr0; b.tz = lure.c.z + Math.sin(a) * rr0; }
              }
              if (k === 'albatross' && ld < lure.r + 3 && R() < dt * 0.2) { b.state = 'land'; b.stateT = 0; }
            } else if (lure && b.state === 'fly' && k === 'frigate' && ld < 200) {
              // a frigatebird over the frenzy: high above, coming down to skim the boiling surface
              const tang = Math.atan2(lz, lx) + (b.seed % 2 < 1 ? 1 : -1) * Math.PI / 2 * clamp((lure.r + 18) / Math.max(ld, 1), 0, 1.4);
              turn = ang(tang - b.h) * 1.2 + turn * 0.3; b.altT = sw + 20 + (b.seed % 1) * 20;
              if (b.hunt < 0 && ld < lure.r + 30 && R() < dt * 0.15) { b.state = 'skim'; b.stateT = 0; const a = R() * 6.28; b.tx = lure.c.x + Math.cos(a) * lure.r * 0.8; b.tz = lure.c.z + Math.sin(a) * lure.r * 0.8; }
            } else if (sp.crowd) {
              // (no bait ball: away out over the far sea, beyond sight)
              if (r2 < (AIR_SIGHT + 30) ** 2) turn += ang(Math.atan2(dz, dx) - b.h) * 0.8;
              else if (r2 > (AIR_SIGHT + 130) ** 2) turn += ang(Math.atan2(-dz, -dx) - b.h) * 0.6;
            } else {
              if (r2 > 75 * 75) turn += ang(Math.atan2(-dz, -dx) - b.h) * 0.6;
              // fishing the open water about it
              if (b.state === 'fly' && b.hunt < 0 && b.stateT > 4) {
                const ax = b.p.x + Math.cos(b.h) * 8, az = b.p.z + Math.sin(b.h) * 8, hgt = b.p.y - sw;
                if (k === 'tern') {
                  if (hgt > 2.5 && hgt < 12 && deep(ax, az, 0.3)) { b.state = 'hover'; b.stateT = 0; b.tx = rr(1.2, 3.5); b.tz = b.p.y; tell(F, b, 'hover', `${sp.ja}が空中で止まって、水面の魚をねらっている`); }
                  else b.altT = sw + rr(4, 8);
                } else if (k === 'booby') {
                  if (hgt > 9 && deep(ax, az, 3)) { b.state = 'dive'; b.stateT = 0; b.dip = false; b.tx = b.p.x + Math.cos(b.h) * hgt * 0.35; b.tz = b.p.z + Math.sin(b.h) * hgt * 0.35; }
                  else { b.altT = sw + rr(12, 26); b.hunt = 4; }
                } else if (k === 'shearwater') {
                  if (hgt < 7 && deep(ax, az, 3)) { b.state = 'dive'; b.stateT = 0; b.dip = false; b.tx = b.p.x + Math.cos(b.h) * (hgt * 1.4 + 1); b.tz = b.p.z + Math.sin(b.h) * (hgt * 1.4 + 1); }
                  else { b.altT = sw + rr(1.5, 5); b.hunt = 4; }
                } else if (k === 'albatross') { if (deep(b.p.x, b.p.z, 0.5)) { b.state = 'land'; b.stateT = 0; } b.hunt = rr(60, 160); }
                else if (k === 'frigate') {
                  // a bird with a fish about: go after it; or down to skim the surface
                  let best: { b: Bird; sp: BirdSpec } | null = null, bd = 140;
                  for (const c of carriers) { const d = c.b.p.distanceTo(b.p); if (d < bd && !c.b.chased) { bd = d; best = c; } }
                  if (best) { b.state = 'chase'; b.stateT = 0; b.prey = best.b; b.preySp = best.sp; b.drop = null; best.b.chased = 1; tell(F, b, 'chase', `${sp.ja}が${best.sp.ja}を追い回している。くわえた魚をねらっているらしい`); }
                  else if (deep(ax, az, 0.5) && R() < 0.4) { b.state = 'skim'; b.stateT = 0; const d = rr(30, 60); b.tx = b.p.x + Math.cos(b.h) * d; b.tz = b.p.z + Math.sin(b.h) * d; }
                  else b.hunt = rr(20, 50);
                }
                if (b.state === 'dive') tell(F, b, 'plunge', k === 'booby' ? `${sp.ja}が翼をたたみ、矢のように海へ突っ込んだ` : `${sp.ja}が水面に飛び込んで、魚を追って潜っていった`);
              }
            }
            if (k === 'albatross' && b.state === 'fly' && !lure && b.visit <= 0) b.altT = sw + 0.8 + 6 * Math.abs(Math.sin(b.t * 0.32 + b.seed));   // dynamic soaring: dip to the crests, climb into the wind
            else if (b.state === 'fly' && b.stateT > 20 && R() < dt / 25 && !lure && b.visit <= 0) b.altT = rr(sp.alt[0], sp.alt[1]);
            if (b.state === 'land') {
              b.altT = sw; b.speed = Math.max(2.5, b.speed - dt * 2); wantLegs = 1; wantTail = 1; flapA = 0.8; b.flapping = Math.max(b.flapping, b.p.y < sw + 2 ? 0.3 : 0);
              if (b.p.y < sw + 0.25) { b.state = 'rest'; b.stateT = 0; b.p.y = sw; b.tx = 0; tell(F, b, 'land', `${sp.ja}が水面に降りて羽を休めている`); }
            } else if (b.state === 'fly' && sp.rest > 0 && b.stateT > 30 && !lure && b.visit <= 0 && R() < dt * sp.rest / 90 && deep(b.p.x, b.p.z, 0.5)) { b.state = 'land'; b.stateT = 0; }
            // flap in bursts between glides; always when climbing or slow
            if (b.flapping > 0) b.flapping -= dt; else if (R() < dt * (1 - sp.glide) * 0.8) b.flapping = rr(0.8, 2.2);
          }
          // keep over the sea and clear of the land (and its trees)
          const ground = sea ? sea.ground(b.p.x, b.p.z) : -1;
          const vyT = clamp((Math.max(b.altT, sw + (b.state === 'land' ? 0.05 : b.state === 'skim' ? 0.3 : 0.4), ground + 10) - b.p.y) * (b.state === 'hover' ? 2 : 0.6), -3.5, 2.5);
          b.vy += (vyT - b.vy) * Math.min(1, dt * (b.state === 'hover' ? 4 : 1.5));
          if (b.state !== 'hover' && (b.vy > 0.8 || b.speed < sp.speed * 0.7)) b.flapping = Math.max(b.flapping, 0.3);
          b.h += clamp(turn, -1.6, 1.6) * dt;
          b.p.x += Math.cos(b.h) * b.speed * dt; b.p.z += Math.sin(b.h) * b.speed * dt; b.p.y += b.vy * dt;
          b.p.y = Math.max(b.p.y, sw + (b.state === 'skim' ? 0.25 : 0.12));
          // (banked into the turn: the inner wing down)
          b.bank += (clamp(turn * (k === 'albatross' ? 1.6 : 1.0), -0.9, 0.9) * (b.state === 'hover' ? 0.2 : 1) - b.bank) * Math.min(1, dt * 2);
          const pitchT = b.state === 'hover' ? -0.75 : b.state === 'takeoff' ? -0.2 : b.state === 'land' ? -0.35 : -Math.atan2(b.vy, b.speed) * 0.8;
          b.pitch += (pitchT - b.pitch) * Math.min(1, dt * 4);
          if (b.state === 'fly' && b.speed < sp.speed && b.chased <= 0) b.speed = Math.min(sp.speed, b.speed + dt);
          if (b.state === 'fly' && b.speed > sp.speed && b.chased <= 0) b.speed = Math.max(sp.speed, b.speed - dt * 2);
        }
        // the body's pose, eased: wings, feet, tail, head
        const e = Math.min(1, dt * 4);
        b.fold += (wantFold - b.fold) * Math.min(1, dt * (wantFold > b.fold ? 1.5 : 3));
        b.dive += (wantDive - b.dive) * Math.min(1, dt * (b.state === 'dive' ? 3 : 4));
        b.legs += (wantLegs - b.legs) * e; b.tail += (wantTail - b.tail) * e; b.head += (wantHead - b.head) * e;
        // wingbeat: frequency scales with size (terns quick, albatrosses slow and rare); hovering faster still
        const hz = 5.2 / Math.sqrt(sp.span) * (b.state === 'hover' ? 1.35 : b.state === 'under' ? 0.45 : 1);
        b.flap += (((b.flapping > 0 && b.state !== 'rest') ? flapA : 0) - b.flap) * Math.min(1, dt * 6);
        b.ph += dt * hz * 6.28;
        arr[i * 4] = b.flap; arr[i * 4 + 1] = b.ph % 6283.2; arr[i * 4 + 2] = b.fold; arr[i * 4 + 3] = b.dive;
        arr2[i * 4] = b.legs; arr2[i * 4 + 1] = b.tail; arr2[i * 4 + 2] = b.head; arr2[i * 4 + 3] = b.seed;
        _o.position.copy(b.p);
        _o.rotation.order = 'YXZ';
        _o.rotation.set(b.pitch, Math.atan2(Math.cos(b.h), Math.sin(b.h)), b.bank);
        _o.scale.setScalar(sp.span);
        _o.updateMatrix();
        F.mesh.setMatrixAt(i, _o.matrix);
      });
      F.mesh.instanceMatrix.needsUpdate = true; F.fly.needsUpdate = true; F.fly2.needsUpdate = true;
    }
  }
  const inView = (cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number) => {
    const out: BirdSpec[] = [];
    for (const F of flocks) if (F.birds.some((b) => { const v = b.p.clone().sub(cam), d = v.length(); return d < maxD && v.dot(fwd) / d > 0.6; })) out.push(F.sp);
    return out;
  };
  /** The guide calls a kind up: a few of them come across in front of the camera — from where they are if in
   *  sight, otherwise from out of sight behind, flying in. */
  const call = (id: string, cam: THREE.Vector3, fx: number, fz: number) => {
    const F = flocks.find((f) => f.sp.id === id && !f.sp.crowd); if (!F) return false;
    const near = F.birds.slice().sort((a, b) => a.p.distanceToSquared(cam) - b.p.distanceToSquared(cam)).slice(0, 3);
    near.forEach((b, i) => {
      if (b.state === 'rest' || b.state === 'under' || b.state === 'dive') return;
      if (birdUnseen(b.p, cam, fx, fz) && b.p.distanceTo(cam) > 60) {
        for (let k = 0; k < 20; k++) {
          const a = Math.atan2(-fz, -fx) + (i - 1) * 0.5 + (R() * 2 - 1) * 0.3, d = 40 + i * 6;
          b.p.set(cam.x + Math.cos(a) * d, Math.max(cam.y, 0) + 5 + i, cam.z + Math.sin(a) * d);
          if (birdUnseen(b.p, cam, fx, fz)) break;
        }
        b.h = Math.atan2(cam.z + fz * 22 - b.p.z, cam.x + fx * 22 - b.p.x);
      }
      b.state = 'fly'; b.fold = 0; b.stateT = 0; b.visit = 14; b.speed = F.sp.speed; b.prey = null; b.drop = null;
    });
    return true;
  };
  return { flocks, update, inView, call };
}
export type Birds = ReturnType<typeof makeBirds>;
