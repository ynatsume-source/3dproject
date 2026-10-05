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

// whitetip reef sharks: resting in the cave by day, out on the reef at night, never inside the rock
const wt = oc.fish.find((f: any) => f.sp.id === 'nemuribuka');
if (wt) {
  const camIn = new THREE.Vector3(cave.cx, cave.floorAt(cave.cx, cave.cz) + 1.5, cave.cz), camFar = new THREE.Vector3(-90, -8, -90);
  for (const [label, ms, cam] of [['noon (camera far)', ev.noon, camFar], ['noon (camera in cave)', ev.noon, camIn], ['night (camera in cave)', ev.set + 3 * 3600000, camIn]] as const) {
    oc.eco.setSky(skyState(ms, loc), new THREE.Vector2(0.5, 0.2));
    let rock = 0, n = 0;
    for (let k = 0; k < 1500; k++) {
      oc.eco.step(0.1, 1000 + k * 0.1, cam, 0, -1);
      const P = wt.mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < wt.mesh.count; i++) { n++; if (cave.sd(P[i * 16 + 12], P[i * 16 + 13], P[i * 16 + 14]) < -0.05) rock++; }
    }
    const subs: string[] = []; wt.subjects(subs as any); 
    console.log(`whitetips ${label}: ${(subs as any).map((s: any) => s.status()).join(' / ')}; inside rock ${rock}/${n}`);
  }
}

// The floor the drone keeps above, inside the tunnel (owner report 2026-10-05: the cruise stuck in the cave). Flying,
// the drone climbs to stay a metre over the "ground" under it and ahead (main.ts: T.ground on the cruise, T.top by
// hand) — a map of heights alone. Along the director's way through, wherever the way is inside the tunnel, that floor
// plus a metre must stay under the way: anything up on the cave's rock (corals on its sunlit top) must not read as
// the floor from beneath. Want: no point of the way under it.
{
  const p = new THREE.Vector3(), l = new THREE.Vector3();
  let n = 0, cruise = 0, hand = 0, worst = 0;
  cave.tourStart(false);
  for (let t = 0; t < cave.tourLength; t += 0.5) {
    cave.tourAt(t, false, p, l);
    if (cave.topAt(p.x, p.z) < p.y + 0.5) continue;   // (outside: over the rock or in the open)
    n++;
    const g = T.ground(p.x, p.z), h = T.top(p.x, p.z) > cave.topAt(p.x, p.z) - 0.01 ? -1e9 : T.top(p.x, p.z);   // (T.top counts the cave's own top: by hand only what stands on the floor)
    if (g + 1 > p.y) { cruise++; worst = Math.max(worst, g + 1 - p.y); }
    if (h + 1 > p.y) hand++;
  }
  const ok = n > 20 && !cruise && !hand;
  console.log(`floor under the way through the tunnel: ${n} points; over the way on the cruise ${cruise}, by hand ${hand} (worst ${worst.toFixed(2)} m) ${ok ? 'ok' : 'FAIL'}`);
  if (!ok) process.exitCode = 1;
}
