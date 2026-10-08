// Dolphins coming by (eco/dolphins): with the camera held still in open water, looking one way, each sea with
// dolphins is run by day for MIN minutes. Want: every pod put down out of sight and taken away out of sight
// (eco/unseen), passing the camera close (within 16 m) on the way; none of them ever inside the reef or above
// the surface except in a leap; the curious ones coming to a few metres and never closer than 1.5 m; spinners
// leaping now and then.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/dolphin-check.ts [sea ...]   (env MIN 20)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';

const MIN = +(process.env.MIN || 20), seas = process.argv.slice(2);
let fail = 0;
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.dolphins).map((l) => l.id)) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.3, 0.1));
  let cam = new THREE.Vector3(0, -5, 0);
  for (let r = 0; r < 120; r += 6) { let hit = false; for (let a = 0; a < 6.28; a += 0.5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (loc.pelagic || oc.T.top(x, z) < -14) { cam = new THREE.Vector3(x, -5, z); hit = true; break; } } if (hit) break; }
  const fx = 0, fz = -1, D = oc.dolphins, dt = 0.05;
  let t = 0, pods = 0, badIn = 0, badOut = 0, minPass = 1e9, passes = 0, inReef = 0, inAir = 0, leaps = 0, looks = 0, closest = 1e9, wasActive = false, podMin = 1e9;
  for (let k = 0; k < MIN * 60 / dt; k++) {
    t += dt;
    const before = D.active;
    oc.eco.step(dt, t, cam, fx, fz);
    if (!before && D.active) { pods++; podMin = 1e9; for (const d of D.members) if (!unseen(oc, d.pos.x, d.pos.y, d.pos.z, cam, fx, fz, d.len)) badIn++; }
    if (before && !D.active) { if (podMin < 16) passes++; minPass = Math.min(minPass, podMin); }
    if (before && !D.active) { /* taken away: the last frame's positions were checked as it left (in the module) */ }
    if (D.active) for (const d of D.members) {
      const cd = d.pos.distanceTo(cam);
      podMin = Math.min(podMin, cd); closest = Math.min(closest, cd);
      if (d.pos.y < oc.T.top(d.pos.x, d.pos.z) + 0.3) inReef++;
      if (d.pos.y > 0.05 && !d.leap) inAir++;
      if (d.leap && d.leap.t < dt * 1.5) leaps++;
      if (d.look > 0 && !(d as any)._looking) looks++;
      (d as any)._looking = d.look > 0;
    }
    // (when the pod is gone it must have gone out of sight: check the frame before it is taken away)
    if (D.active && D.phase === 'out' && D.leaving > 6) { const vis = D.members.some((d: any) => !d.leap && !unseen(oc, d.pos.x, d.pos.y, d.pos.z, cam, fx, fz, d.len)); (D as any)._vis = vis; }
    if (before && !D.active && (D as any)._vis) badOut++;
    wasActive = D.active;
  }
  const ok = pods > 0 && badIn === 0 && badOut === 0 && inReef === 0 && inAir === 0 && closest > 1.5;
  if (!ok) fail++;
  console.log(`${id} (${D.spec.ja}): ${MIN} min — pods ${pods}, came within 16 m ${passes}, closest pass ${minPass.toFixed(1)} m, closest of all ${closest.toFixed(1)} m; put down in sight ${badIn}, taken away in sight ${badOut}; in the reef ${inReef}, out of the water not leaping ${inAir}; leaps ${leaps}, came to look ${looks} — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
