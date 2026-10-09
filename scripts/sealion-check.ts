// Sea lions coming to play (eco/sealions): with the camera held still in open water, looking one way, each sea with
// sea lions is run by day for MIN minutes. Want: every visit put down out of sight and taken away out of sight
// (eco/unseen); none ever in the rock, above the surface, or closer to the drone than its own half-length; while they
// play, time spent within 5 m of the drone and in its view; the games all played (orbit, charge and veer, hang
// head-on, spin, breathe); one hanging in front faces the drone; no jolts (acceleration).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sealion-check.ts [sea ...]   (env MIN 20)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';

const MIN = +(process.env.MIN || 20), seas = process.argv.slice(2);
let fail = 0;
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.sealions).map((l) => l.id)) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.3, 0.1));
  let cam = new THREE.Vector3(0, -8, 0);
  for (let r = 0; r < 120; r += 6) { let hit = false; for (let a = 0; a < 6.28; a += 0.5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (oc.T.top(x, z) < -14) { cam = new THREE.Vector3(x, -8, z); hit = true; break; } } if (hit) break; }
  const fx = 0, fz = -1, S = oc.sealions, dt = 0.05;
  let t = 0, visits = 0, badIn = 0, badOut = 0, inRock = 0, inAir = 0, tooClose = 0, close = 0, inView = 0, faceBad = 0, faceN = 0, maxAcc = 0, closest = 1e9;
  const moves = new Set<string>(), prevV = new Map<any, THREE.Vector3>();
  let wasVis = false;
  for (let k = 0; k < MIN * 60 / dt; k++) {
    t += dt;
    const before = S.active;
    oc.eco.step(dt, t, cam, fx, fz);
    if (!before && S.active) { visits++; prevV.clear(); for (const l of S.lions) if (!unseen(oc, l.pos.x, l.pos.y, l.pos.z, cam, fx, fz, l.len)) badIn++; }
    if (before && !S.active && wasVis) badOut++;
    if (!S.active) { wasVis = false; continue; }
    wasVis = S.lions.some((l: any) => !unseen(oc, l.pos.x, l.pos.y, l.pos.z, cam, fx, fz, l.len));
    let anyClose = false, anyView = false;
    for (const l of S.lions) {
      moves.add(l.move);
      const cd = l.pos.distanceTo(cam); closest = Math.min(closest, cd - l.len * 0.5);
      if (l.pos.y < oc.T.top(l.pos.x, l.pos.z) + 0.15) inRock++;
      if (l.pos.y > -0.08) inAir++;
      if (cd < l.len * 0.5 + 0.3) tooClose++;
      if (cd < 5) anyClose = true;
      const dx = l.pos.x - cam.x, dz = l.pos.z - cam.z;
      if (cd < 12 && (dx * fx + dz * fz) / Math.hypot(dx, dz) > Math.cos(50 * Math.PI / 180)) anyView = true;
      if (l.move === 'hang' && l.t > 2.5) { faceN++; const to = cam.clone().sub(l.pos).normalize(); if (to.dot(l.head) < Math.cos(35 * Math.PI / 180)) faceBad++; }
      const pv = prevV.get(l); if (pv) maxAcc = Math.max(maxAcc, pv.distanceTo(l.vel) / dt); prevV.set(l, l.vel.clone());
    }
    if (anyClose) close++;
    if (anyView) inView++;
  }
  const want = ['orbit', 'charge', 'veer', 'hang', 'spin'];
  const missing = want.filter((m) => !moves.has(m));
  const ok = visits > 0 && badIn === 0 && badOut === 0 && inRock === 0 && inAir === 0 && tooClose === 0 && !missing.length && faceBad <= faceN * 0.1;
  if (!ok) fail++;
  console.log(`${id} (${S.spec.ja}): ${MIN} min — visits ${visits}; put down in sight ${badIn}, taken away in sight ${badOut}; in the rock ${inRock}, above the surface ${inAir}, too close ${tooClose} (nearest skin ${closest.toFixed(2)} m); within 5 m ${(close * dt / 60).toFixed(1)} min, in view within 12 m ${(inView * dt / 60).toFixed(1)} min; games ${[...moves].join(' ')}${missing.length ? ' (missing ' + missing.join(' ') + ')' : ''}; hanging but not facing ${faceBad}/${faceN}; max acceleration ${maxAcc.toFixed(1)} m/s² — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
