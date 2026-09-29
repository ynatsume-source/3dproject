// Headless check: do turtles (and the drone path) stay above rocks and coral?
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

for (const id of ['miyako', 'gbr', 'maldives']) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const oc = buildOcean(loc);
  const cam = new THREE.Vector3(0, loc.f(0, 0) + 3, 0);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  let worst = 0, samples = 0, inside = 0;
  for (const [ms, secs] of [[ev.noon, 300], [ev.set + 3 * 3600000, 300]] as const) {
    oc.eco.setSky(skyState(ms, loc), new THREE.Vector2(0.5, 0.2));
    for (let k = 0; k < secs * 10; k++) {
      oc.eco.step(0.1, k * 0.1, cam, 0, -1);
      for (const t of oc.turtles) {
        const below = oc.T.top(t.pos.x, t.pos.z) - (t.pos.y - 0.1 * t.size);
        samples++;
        if (below > 0.05) { inside++; worst = Math.max(worst, below); }
      }
    }
  }
  console.log(`${id}: turtle samples ${samples}, inside rock/coral ${inside} (${(inside / samples * 100).toFixed(2)}%), worst ${worst.toFixed(2)} m`);
}
