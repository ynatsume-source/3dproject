// Headless check for animals that jump: turtles' per-frame turn and pitch, and resting parrotfish's
// per-frame vertical step, at 30 fps by day and night.
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === 'miyako')!;
for (const [label, hour] of [['day', 3], ['night', 14]] as const) {
  const oc = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, hour), loc);
  oc.eco.setSky(skyState(Date.UTC(2026, 8, 29, hour), loc), new THREE.Vector2(0.5, 0.2));
  void ev;
  const cam = new THREE.Vector3(0, -6, 0);
  const parrot = oc.fish.find((f: any) => f.sp?.cocoon);
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  let prevY: number[] = [], prevY2: number[] = [], prevRot: THREE.Euler[] = [], prevP: THREE.Vector3[] = [];
  let maxJump = 0;
  let maxYaw = 0, maxPitch = 0, maxDy = 0, bigDy = 0;
  const dt = 1 / 30;
  for (let k = 0; k < 30 * 240; k++) {
    oc.eco.step(dt, k * dt, cam, 0, -1);
    oc.turtles.forEach((t: any, i: number) => {
      const r = t.group.rotation;
      if (prevRot[i] && k > 30) {
        let dy = r.y - prevRot[i].y; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)));
        maxYaw = Math.max(maxYaw, dy); maxPitch = Math.max(maxPitch, Math.abs(r.x - prevRot[i].x));
      }
      if (prevP[i] && k > 30) maxJump = Math.max(maxJump, t.pos.distanceTo(prevP[i]));
      prevRot[i] = r.clone(); prevP[i] = t.pos.clone();
    });
    if (parrot?.mesh) {
      const n = parrot.mesh.count;
      for (let i = 0; i < n; i++) {
        parrot.mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m);
        if (prevY2[i] !== undefined && k > 30 * 60) { const d = Math.abs(p.y - 2 * prevY[i] + prevY2[i]); maxDy = Math.max(maxDy, d); if (d > 0.004) bigDy++; }
        prevY2[i] = prevY[i]; prevY[i] = p.y;
      }
    }
  }
  console.log(label, 'turtle max yaw/frame', maxYaw.toFixed(3), 'pitch/frame', maxPitch.toFixed(3), 'turtle max step', maxJump.toFixed(3), '| parrotfish max vertical accel/frame²', maxDy.toFixed(4), 'jerks', bigDy);
}
