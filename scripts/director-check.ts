// Headless check of the camera director: fly a point-mass drone and list what it chose to film.
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { Director } from '../src/director';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const oc = buildOcean(loc);
const d = new Director();
const pos = new THREE.Vector3(0, loc.f(0, 0) + 3, 0), vel = new THREE.Vector3();
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
for (const [label, ms] of [['noon', ev.noon], ['dusk', ev.set - 20 * 60000], ['night', ev.set + 3 * 3600000]] as const) {
  oc.eco.setSky(skyState(ms, loc), new THREE.Vector2(0.5, 0.2));
  d.reset();
  let t = 0, cur = '';
  for (let k = 0; k < 6000; k++) {           // 10 minutes at 10 Hz
    t += 0.1;
    oc.eco.step(0.1, t, pos, 0, -1);
    const shot = d.update(0.1, pos, () => oc.eco.subjects(), oc.T.h);
    if (shot) {
      const want = shot.pos.clone().sub(pos); const L = want.length();
      vel.lerp(want.multiplyScalar(Math.min(2.4, L * 0.8) / Math.max(L, 1e-4)), 0.12);
      const name = `${shot.subject.label}（${shot.subject.status()}）`;
      if (name !== cur) { console.log(`${label} ${t.toFixed(0).padStart(4)}s ${shot.phase} ${name} dist=${shot.pos.distanceTo(new THREE.Vector3(shot.look.x, shot.look.y, shot.look.z)).toFixed(1)}m`); cur = name; }
    } else { vel.lerp(new THREE.Vector3(1.2, 0, 0.3), 0.05); if (cur) { console.log(`${label} ${t.toFixed(0).padStart(4)}s cruise`); cur = ''; } }
    pos.addScaledVector(vel, 0.1);
    pos.x = Math.max(-120, Math.min(120, pos.x)); pos.z = Math.max(-120, Math.min(120, pos.z));
    pos.y = Math.min(Math.max(pos.y, oc.T.h(pos.x, pos.z) + 0.7), -0.7);
  }
}
