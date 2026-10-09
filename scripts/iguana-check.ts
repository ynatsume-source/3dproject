// A marine iguana coming down to graze (eco/iguanas): the camera held still a little off shallow rock, looking at it,
// each sea with iguanas run by day for MIN minutes. Want: each one put down out of sight and taken away out of sight
// (eco/unseen); never in the rock nor out of the water; while it grazes, its feet on the rock (its middle at the
// rock's top plus its legs' reach) and in view of the drone; no jolts.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/iguana-check.ts [sea ...]   (env MIN 20)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';
import { IG_FEET } from '../src/ocean/iguana';

const MIN = +(process.env.MIN || 20), seas = process.argv.slice(2);
let fail = 0;
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.iguanas).map((l) => l.id)) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.3, 0.1));
  const T = oc.T, sp = loc.iguanas;
  // (a shallow rock, and the camera 9 m off it, a little above, looking at it)
  let rock: THREE.Vector3 | null = null;
  for (let r = 0; r < 200 && !rock; r += 4) for (let a = 0; a < 6.28 && !rock; a += 0.3) { const x = Math.cos(a) * r, z = Math.sin(a) * r, t = T.top(x, z); if (-t > sp.deep[0] + 0.5 && -t < sp.deep[1] - 1) rock = new THREE.Vector3(x, t, z); }
  if (!rock) { console.log(`${id}: no shallow rock found`); fail++; continue; }
  const cam = new THREE.Vector3(rock.x + 9, Math.min(-1.5, rock.y + 1.5), rock.z), fx = -1, fz = 0;
  const I = oc.iguanas, dt = 0.05;
  let t = 0, visits = 0, badIn = 0, badOut = 0, inRock = 0, inAir = 0, grazeT = 0, grazeView = 0, offRock = 0, maxAcc = 0, wasVis = false;
  const prev = new THREE.Vector3(), pv = new THREE.Vector3(); let havePrev = 0;
  for (let k = 0; k < MIN * 60 / dt; k++) {
    t += dt;
    const before = I.active;
    oc.eco.step(dt, t, cam, fx, fz);
    if (!before && I.active) { visits++; havePrev = 0; if (!unseen(oc, I.pos.x, I.pos.y, I.pos.z, cam, fx, fz, I.len)) badIn++; }
    if (before && !I.active && wasVis) badOut++;
    if (!I.active) { wasVis = false; continue; }
    wasVis = !unseen(oc, I.pos.x, I.pos.y, I.pos.z, cam, fx, fz, I.len);
    const top = T.top(I.pos.x, I.pos.z);
    if (I.pos.y < top + IG_FEET * I.len * 0.6) { inRock++; if (process.env.DEBUG && inRock < 6) console.log('in rock', I.phase, I.t.toFixed(1), (I.pos.y - top).toFixed(3), I.len.toFixed(2)); }
    if (I.pos.y > -0.1) inAir++;
    if (I.phase === 'graze' && I.t > 3) {
      grazeT++;
      if (Math.abs(I.pos.y - (T.top(I.target.x, I.target.z) + IG_FEET * I.len)) > 0.05) offRock++;
      const dx = I.pos.x - cam.x, dz = I.pos.z - cam.z;
      if ((dx * fx + dz * fz) / Math.hypot(dx, dz) > Math.cos(50 * Math.PI / 180)) grazeView++;
    }
    if (havePrev) { const v = I.pos.clone().sub(prev).divideScalar(dt); const ac = havePrev > 1 ? v.distanceTo(pv) / dt : 0; if (process.env.DEBUG && ac > 8) console.log('jolt', I.phase, I.t.toFixed(2), ac.toFixed(1)); maxAcc = Math.max(maxAcc, ac); pv.copy(v); }
    prev.copy(I.pos); havePrev++;
  }
  const ok = visits > 0 && badIn === 0 && badOut === 0 && inRock === 0 && inAir === 0 && offRock === 0 && grazeT > 0 && grazeView > grazeT * 0.8;
  if (!ok) fail++;
  console.log(`${id} (${sp.ja}): ${MIN} min, rock at ${(-rock.y).toFixed(1)} m — visits ${visits}; put down in sight ${badIn}, taken away in sight ${badOut}; in the rock ${inRock}, out of the water ${inAir}; grazing ${(grazeT * dt / 60).toFixed(1)} min (feet off the rock ${offRock}, in view ${grazeT ? Math.round(grazeView / grazeT * 100) : 0}%); max acceleration ${maxAcc.toFixed(1)} m/s² — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
