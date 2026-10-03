// Headless check: filming a turtle, from where? Fly a point-mass drone as the director asks (as director-check),
// go to each turtle in turn for 70 s, and while observing measure the angle between the turtle's nose and the
// line to the camera (0° = face on, 180° = its tail), and how much of the time it was startled into fleeing.
// Want: mostly in front or beside it (behind < 25%), seen from several sides, startled < 15% of the time.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/turtle-view-check.ts [miyako]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { Director } from '../src/director';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const oc = buildOcean(loc);
const d = new Director();
d.styles = { orbit: 2, follow: 2, wait: 1, low: 1, detail: 1 };   // (the default guide's manner)
d.distK = 1;
const pos = new THREE.Vector3(0, loc.f(0, 0) + 3, 0), vel = new THREE.Vector3();
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
let t = 0;
const bins = [0, 0, 0], by = new Set<string>();
let n = 0, scared = 0, shots = 0;
const step = () => {
  t += 0.1;
  oc.eco.step(0.1, t, pos, 0, -1);
  const shot = d.update(0.1, pos, () => oc.eco.subjects(), oc.T.h);
  if (shot) {
    const want = shot.pos.clone().sub(pos), L = want.length();
    vel.lerp(want.multiplyScalar(Math.min(2.4, L * 0.8) / Math.max(L, 1e-4)), 0.12);
  } else vel.multiplyScalar(0.9);
  pos.addScaledVector(vel, 0.1);
  pos.y = Math.min(Math.max(pos.y, oc.T.h(pos.x, pos.z) + 0.7), -0.7);
  return shot;
};
for (let k = 0; k < 120; k++) step();
for (let round = 0; round < 3; round++) {
  oc.turtles.forEach((tu: any, i: number) => {
    const s = oc.eco.subjects().find((x: any) => x.key === `turtle:${i}`);
    if (!s || !s.live()) return;
    d.focus(s, pos); shots++;
    for (let k = 0; k < 700; k++) {
      const shot = step();
      if (!shot || shot.subject.key !== s.key) break;
      if (shot.phase !== 'observe') continue;
      const hd = tu.state === 'rest' && tu.yaw != null ? { x: Math.sin(tu.yaw), z: Math.cos(tu.yaw) } : { x: Math.cos(tu.head), z: Math.sin(tu.head) };
      const cx = pos.x - tu.pos.x, cz = pos.z - tu.pos.z, cl = Math.hypot(cx, cz) || 1;
      const a = Math.acos(Math.max(-1, Math.min(1, (cx * hd.x + cz * hd.z) / cl))) * 180 / Math.PI;
      bins[a < 60 ? 0 : a < 120 ? 1 : 2]++; n++;
      by.add(a < 60 ? 'front' : a < 120 ? 'side' : 'behind');
      if ((tu.alarm ?? 0) > 0.05) scared++;
    }
    d.release();
    for (let k = 0; k < 60; k++) step();
  });
}
const pc = (v: number) => (n ? (100 * v / n).toFixed(0) : '-') + '%';
console.log(`${loc.id}: ${shots} turtle shots, ${n} observing samples — front ${pc(bins[0])}, side ${pc(bins[1])}, behind ${pc(bins[2])}; startled ${pc(scared)}`);
const ok = n > 300 && bins[2] / n < 0.25 && scared / n < 0.15 && by.size >= 2;
console.log(ok ? 'PASS' : 'FAIL');
if (!ok) process.exit(1);
