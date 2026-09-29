// Headless check of the sea cave: build time, and a director fly-through with the drone's collision —
// does it get in, reach the dark chamber, come out the other end, and never sit inside the rock?
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { Director } from '../src/director';

const loc = LOCATIONS.find((l) => l.id === 'miyako')!;
let t0 = performance.now();
const oc = buildOcean(loc);
console.log(`build ${(performance.now() - t0).toFixed(0)} ms, cave tris ${oc.cave.geo.index.count / 3}`);
t0 = performance.now();
oc.cave.updateSun(new THREE.Vector3(0.5, 0.8, 0.2).normalize(), 1e9);
console.log(`sun re-bake ${(performance.now() - t0).toFixed(0)} ms`);
const cave = oc.cave, T = oc.T;
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
for (const start of [[cave.cx - 30, cave.cz - 10], [cave.cx + 28, cave.cz + 12]]) {
  const d = new Director();
  const pos = new THREE.Vector3(start[0], T.top(start[0], start[1]) + 3, start[1]), vel = new THREE.Vector3(), g = new THREE.Vector3();
  let t = 0, phase = '', minSky = 1, inside = 0, worst = 0, done = false, toured = false;
  for (let k = 0; k < 3000 && !done; k++) {
    t += 0.1;
    oc.eco.step(0.1, t, pos, 0, -1);
    const shot = d.update(0.1, pos, () => oc.eco.subjects().filter((s) => s.kind === 'cave'), T.top);
    if (shot && shot.subject.kind === 'cave') {
      if (shot.phase !== phase) { console.log(`  ${t.toFixed(0)}s ${shot.phase} rev=${shot.rev}`); phase = shot.phase; }
      toured = true;
      const want = shot.pos.clone().sub(pos), L = want.length(), top = shot.phase === 'approach' ? 2.4 : 0.9;
      vel.lerp(want.multiplyScalar(Math.min(top, L * 0.8) / Math.max(L, 1e-4)), 1 - Math.exp(-0.1 * 1.2));
    } else if (toured) done = true;
    else vel.multiplyScalar(0.9);
    pos.addScaledVector(vel, 0.1);
    pos.y = Math.min(Math.max(pos.y, T.ground(pos.x, pos.z) + 0.7), -0.7);
    for (let it = 0; it < 2; it++) {
      const sd = cave.sd(pos.x, pos.y, pos.z);
      if (sd >= 0.8) break;
      cave.grad(pos.x, pos.y, pos.z, g); pos.addScaledVector(g, 0.8 - sd);
      const vn = vel.dot(g); if (vn < 0) vel.addScaledVector(g, -vn);
    }
    const sd = cave.sd(pos.x, pos.y, pos.z);
    if (sd < 0) { inside++; worst = Math.min(worst, sd); }
    if (phase === 'observe') minSky = Math.min(minSky, cave.skyAt(pos.x, pos.y, pos.z));
  }
  console.log(`from (${start.map((v) => v.toFixed(0))}): toured=${toured} finished=${done} t=${t.toFixed(0)}s darkest sky ${minSky.toFixed(2)} inside-rock steps ${inside} worst ${worst.toFixed(2)} m, end (${pos.x.toFixed(0)}, ${pos.z.toFixed(0)})`);
}
