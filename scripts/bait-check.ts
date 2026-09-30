// Headless check of a bait ball: forced start, then through its phases: where the ball is, how big,
// how many fish are left, and what one update costs.
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState } from '../src/time/clock';

for (const id of ['miyako', 'pacific']) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  oc.eco.setSky(skyState(Date.UTC(2026, 8, 29, 22), loc), new THREE.Vector2(0.5, 0.2));
  const cam = new THREE.Vector3(0, -6, 0);
  const env = oc.eco.env;
  const ok = oc.bait.start(cam, 0, -1, env);
  let last = '', ms = 0, n = 0, bad = 0;
  const dt = 1 / 30;
  for (let k = 0; k < 30 * 200 && oc.bait.st.active; k++) {
    const t0 = performance.now();
    const evs = oc.eco.step(dt, k * dt, cam, 0, -1);
    ms += performance.now() - t0; n++;
    for (const e of evs) if (/ベイト|群れ/.test(e.text)) console.log('   event:', e.text);
    const s = oc.bait.st;
    if (!isFinite(s.c.x + s.c.y + s.c.z)) bad++;
    if (s.phase !== last) { last = s.phase; console.log(id, 'started', ok, 'phase', s.phase, 'c', s.c.toArray().map((v: number) => v.toFixed(1)).join(','), 'r', s.r.toFixed(1), 'alive', s.alive); }
  }
  console.log(id, 'ended; alive', oc.bait.st.alive, 'NaN frames', bad, 'eco step avg ms', (ms / n).toFixed(2));
}
