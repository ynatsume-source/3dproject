// Spotted eagle rays (eco/eaglerays): each sea with them is run by day for MIN minutes with the camera cruising a
// wide loop, looking where it goes, so that groups are left behind and set down again. Want: no ray ever moved
// more than a few metres in one step (put down or taken up) unless it was out of sight before and after (eco/unseen);
// none in the reef (its body or under either wing tip, beyond a few centimetres of the drawn floor's wobble) or out of
// the water; the drone never inside a wing; groups met within 20 m in sight; some rooting in the sand.
// FOLLOW=1: the camera instead stays 3 m off the nearest ray, as when filming it close: want its nose not to nod
// (the pitch's rate of change stays small).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/eagleray-check.ts [sea ...]   (env MIN 20)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';

const MIN = +(process.env.MIN || 20), seas = process.argv.slice(2);
let fail = 0;
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.eaglerays).map((l) => l.id)) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.3, 0.1));
  const E = oc.eaglerays, T = oc.T, dt = 0.05, R0 = 70, W = 1.3 / R0;
  const cam = new THREE.Vector3();
  let pitR = 0; const pitP = new Map<any, number>();
  let t = 0, jumps = 0, badJumps = 0, inReef = 0, tipReef = 0, inAir = 0, tooClose = 0, frames = 0, digs = 0, metFrames = 0, maxAcc = 0;
  const prev = new Map<any, { p: THREE.Vector3; v: THREE.Vector3; seen: boolean; placed: boolean }>();
  for (let k = 0; k < MIN * 60 / dt; k++) {
    t += dt;
    const a = t * W, fx = -Math.sin(a), fz = Math.cos(a);
    cam.set(Math.cos(a) * R0, Math.max(T.top(Math.cos(a) * R0, Math.sin(a) * R0) + 2, -5), Math.sin(a) * R0);
    if (process.env.FOLLOW && t > 5) { const r0 = E.groups[0].rays[0]; const h = Math.hypot(r0.vel.x, r0.vel.z) || 1; cam.set(r0.pos.x - r0.vel.z / h * 3, r0.pos.y + 0.5, r0.pos.z + r0.vel.x / h * 3); }
    oc.eco.step(dt, t, cam, fx, fz);
    let met = false;
    for (const g of E.groups) for (const r of g.rays) {
      const seen = !unseen(oc, r.pos.x, r.pos.y, r.pos.z, cam, fx, fz, r.span);
      const q = prev.get(r);
      if (q && q.p.distanceTo(r.pos) > 3) { jumps++; if (q.seen || seen) badJumps++; }
      else if (q && q.placed && g.placed) maxAcc = Math.max(maxAcc, q.v.distanceTo(r.vel) / dt);
      prev.set(r, { p: r.pos.clone(), v: r.vel.clone(), seen, placed: g.placed });
      if (!g.placed) continue;
      frames++;
      { const pp = pitP.get(r); if (pp !== undefined && r.pos.distanceTo(cam) < 6 && r.dig <= 0) pitR = Math.max(pitR, Math.abs(r.pit - pp) / dt); pitP.set(r, r.pit); }
      if (r.dig > 0 && !(r as any)._dug) digs++;
      (r as any)._dug = r.dig > 0;
      if (r.pos.y < T.top(r.pos.x, r.pos.z) + 0.02) inReef++;
      // (under the wing tips, level: the side across its heading)
      const h = Math.hypot(r.vel.x, r.vel.z) || 1, sx = -r.vel.z / h * r.span * 0.45, sz = r.vel.x / h * r.span * 0.45;
      if (r.pos.y < Math.max(T.top(r.pos.x + sx, r.pos.z + sz), T.top(r.pos.x - sx, r.pos.z - sz)) - 0.05) tipReef++;
      if (r.pos.y > -0.5) inAir++;
      if (r.pos.distanceTo(cam) < r.span * 0.5) tooClose++;
      if (seen && r.pos.distanceTo(cam) < 20) met = true;
    }
    if (met) metFrames++;
  }
  const ok = pitR < 0.35 && badJumps === 0 && inReef === 0 && tipReef === 0 && inAir === 0 && tooClose === 0 && metFrames > 0;
  if (!ok) fail++;
  console.log(`${id} (${E.spec.ja}, ${E.groups.length} groups of ${E.groups.map((g: any) => g.rays.length).join('/')}): ${MIN} min — set down / taken up ${jumps} (in sight ${badJumps}); in the reef ${inReef}, wing tip in the reef ${tipReef}, at the surface ${inAir}, drone inside a wing ${tooClose} (of ${frames} ray-frames); met within 20 m ${(metFrames * dt / 60).toFixed(1)} min; max turn/accel ${maxAcc.toFixed(2)} m/s²; rooting ${digs}; nose nodding near the drone (max pitch rate) ${(pitR * 57.3).toFixed(1)}°/s — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
