// Headless check: do mantas get stuck (turning to and fro on the spot, hardly moving) on a shallow reef?
// Counts, per sea, the share of 3-second windows in which a placed manta moved less than a metre.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/manta-stuck-check.ts
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

for (const id of ['miyako', 'maldives', 'gbr']) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const oc = buildOcean(loc);
  if (!oc.mantas.length) continue;
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  const cam = new THREE.Vector3(0, loc.f(0, 0) + 3, 0);
  let windows = 0, stuck = 0, t = 0;
  for (const [ms, secs] of [[ev.noon, 900], [ev.set + 3 * 3600000, 600]] as const) {
    oc.eco.setSky(skyState(ms, loc), new THREE.Vector2(0.5, 0.2));
    const last = oc.mantas.map((m: any) => m.pos.clone());
    for (let k = 0; k < secs * 10; k++) {
      t += 0.1;
      cam.set(Math.sin(t * 0.004) * 60, -3, Math.cos(t * 0.005) * 60);   // (the camera wandering about, slowly)
      oc.eco.step(0.1, t, cam, 0, -1);
      if (k % 30 === 29) oc.mantas.forEach((m: any, i: number) => { if (!m.placed) return; windows++; if (m.pos.distanceTo(last[i]) < 1) stuck++; last[i].copy(m.pos); });
    }
  }
  console.log(`${id}: manta 3 s windows ${windows}, hardly moving ${stuck} (${(stuck / Math.max(1, windows) * 100).toFixed(1)}%)`);
}
