// Carpet sharks resting on the bottom (eco/carpetsharks): each sea with them is run for MIN minutes by day and by night
// with the camera cruising a wide loop. Want: none ever moved more than a few metres in one step (put down or taken
// up) unless out of sight before and after (eco/unseen); no part of the underside, from the snout to the tail's tip,
// ever into the ground (beyond 3 cm); by day each resting and, met near, seen within 40 m (where the director goes to film it); by night swimming; no jolts.
// Then (by day) the camera is taken right up to a resting one: it should get up and swim off and settle again.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/carpet-check.ts [sea ...]   (env MIN 10)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';
import { carpetProfile } from '../src/ocean/carpetshark';

const MIN = +(process.env.MIN || 10), seas = process.argv.slice(2);
let fail = 0;
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.carpets).map((l) => l.id)) for (const night of process.env.NIGHT ? [true] : [false, true]) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(night ? ev.noon + 12 * 3600e3 : ev.noon, loc), new THREE.Vector2(0.3, 0.1));
  const C = oc.carpets, T = oc.T, dt = 0.05, R0 = 60, W = 1.1 / R0, cam = new THREE.Vector3();
  let t = 0, jumps = 0, badJumps = 0, inGround = 0, deepest = 0, frames = 0, met = 0, resting = 0, swimming = 0, maxAcc = 0;
  const prev = new Map<any, { p: THREE.Vector3; v: THREE.Vector3; seen: boolean }>();
  const all = () => C.kinds.flatMap((K: any) => K.groups.flatMap((g: any) => g.members.map((m: any) => ({ m, g, K }))));
  for (let k = 0; k < MIN * 60 / dt; k++) {
    t += dt;
    const a = t * W, fx = -Math.sin(a), fz = Math.cos(a);
    cam.set(Math.cos(a) * R0, Math.max(T.top(Math.cos(a) * R0, Math.sin(a) * R0) + 3, -6), Math.sin(a) * R0);
    oc.eco.step(dt, t, cam, fx, fz);
    let near = false;
    for (const { m, g, K } of all()) {
      const seen = !unseen(oc, m.pos.x, m.pos.y, m.pos.z, cam, fx, fz, m.len * 0.6);
      const q = prev.get(m);
      const v = q ? m.pos.clone().sub(q.p).divideScalar(dt) : new THREE.Vector3();
      const jump = !!q && q.p.distanceTo(m.pos) > 3;
      // (taken up while it could be seen, or put down where it can: only a placed group is drawn — positions tried while
      // looking for a place are not)
      if (jump) { jumps++; if (((q as any).placed && q!.seen) || (g.placed && seen)) { badJumps++; if (process.env.DEBUG) console.log('jump in sight', m.mode, q!.p.distanceTo(m.pos).toFixed(2), g.placed); } }
      else if (q && g.placed && !(q as any).jump && m.t > 1) { const ac = v.distanceTo(q.v) / dt; if (process.env.DEBUG && ac > 5) console.log('jolt', K.sp.style, m.mode, ac.toFixed(0), 'vy', ((m.pos.y - q.p.y) / dt).toFixed(2), 'speed', m.speed.toFixed(2), 't', m.t.toFixed(1)); maxAcc = Math.max(maxAcc, ac); }
      prev.set(m, { p: m.pos.clone(), v, seen, jump, placed: g.placed } as any);
      if (!g.placed) continue;
      frames++;
      if (m.mode === 'rest') resting++; else swimming++;
      // (its underside along its length against the ground)
      const hx = Math.sin(m.yaw), hz = Math.cos(m.yaw), cp = Math.cos(m.pitch), sp = Math.sin(m.pitch);
      for (let s = 0.02; s <= 0.98; s += 0.06) {
        const ax = (0.5 - s) * m.len, pr = carpetProfile(K.sp.style, s), under = (pr.y - pr.h * 0.85) * m.len;
        const x = m.pos.x + hx * cp * ax, z = m.pos.z + hz * cp * ax, y = m.pos.y - sp * ax + cp * under;
        const d = T.top(x, z) - y;
        if (d > 0.03) { inGround++; deepest = Math.max(deepest, d); if (process.env.DEBUG && inGround < 8) console.log('in ground', K.sp.style, m.mode, 's', s.toFixed(2), 'd', d.toFixed(2), 'pitch', m.pitch.toFixed(2), 'y', m.pos.y.toFixed(2), 'top here', T.top(m.pos.x, m.pos.z).toFixed(2), 't', m.t.toFixed(1)); }
      }
      if (seen && m.pos.distanceTo(cam) < 40) near = true;
    }
    if (near) met++;
  }
  // (by day: up close to one resting, and see that it gets up and goes)
  let woke = 'n/a';
  if (!night) {
    const r = all().find(({ m, g }: any) => g.placed && m.mode === 'rest');
    if (r) {
      const m = r.m, p0 = m.pos.clone();
      let moved = false, settled = false;
      for (let k = 0; k < 240 / dt; k++) {
        if (k < 40) cam.set(m.pos.x + Math.sin(m.yaw) * (m.len * 0.5 + 0.6), m.pos.y + 0.6, m.pos.z + Math.cos(m.yaw) * (m.len * 0.5 + 0.6));
        oc.eco.step(dt, t += dt, cam, -Math.sin(m.yaw), -Math.cos(m.yaw));
        if (m.mode !== 'rest') moved = true;
        if (process.env.DEBUG && k % 200 === 0) console.log('crowd', r.K.sp.style, m.mode, m.goal ? Math.hypot(m.goal.x - m.pos.x, m.goal.z - m.pos.z).toFixed(1) : '-', 'speed', m.speed.toFixed(2), 'yaw', m.yaw.toFixed(2), m.goal ? m.goal.yaw.toFixed(2) : '', 'y-top', (m.pos.y - T.top(m.pos.x, m.pos.z)).toFixed(2));
        if (moved && m.mode === 'rest') { settled = true; break; }
      }
      woke = `${moved ? 'got up' : 'stayed'}${settled ? `, lay down again ${m.pos.distanceTo(p0).toFixed(1)} m away` : ''}`;
    }
  }
  const wokeOk = night || woke.includes('lay down again') || woke === 'n/a';
  const ok = wokeOk && badJumps === 0 && inGround === 0 && (night ? swimming > resting : resting > swimming && met > 0) && maxAcc < 3;
  if (!ok) fail++;
  console.log(`${id} ${night ? 'night' : 'day'}: ${MIN} min — set down / taken up ${jumps} (in sight ${badJumps}); into the ground ${inGround} (deepest ${(deepest * 100).toFixed(0)} cm); resting ${Math.round(resting / Math.max(1, frames) * 100)}%; seen within 40 m ${(met * dt / 60).toFixed(1)} min; max acceleration ${maxAcc.toFixed(2)} m/s²; crowded by the drone: ${woke} — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
