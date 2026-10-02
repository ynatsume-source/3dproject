// Mantas over the real seabed (manta-check.ts uses flat deep water): through hours of night feeding and
// day cruising in each sea, how close any part of the body comes to the reef and to the surface, how many
// feeding somersaults there were; and forced leaps, that each lands and swims on under the water.
// npx tsx --import ./scripts/node-assets.mjs scripts/manta-terrain-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { updateMantas } from '../src/eco/animals';
import { U } from '../src/render/common';
import { mulberry32 } from '../src/core/math';
import { MANTA_GEO } from '../src/ocean/models';

Math.random = mulberry32(4242);
// points on the body (model frame) that bound it in any pose: the wing tips, nose, the back of the disc,
// the tail's root and tip, the top and the belly
const PTS = [[1, 0, -0.2], [-1, 0, -0.2], [0, 0.09, 0.05], [0, -0.06, 0.05], [0, 0, 0.33], [0, 0, -0.4], [0, 0, -1.15], [0.6, 0, -0.1], [-0.6, 0, -0.1]].map((p) => new THREE.Vector3(...p));
const v = new THREE.Vector3();
function extent(mesh: THREE.Mesh, T: any) {
  mesh.updateMatrixWorld(true);
  let floor = Infinity, top = -Infinity;
  let which = -1;
  for (const [i, p] of PTS.entries()) { v.copy(p).applyMatrix4(mesh.matrixWorld); const f = v.y - T.top(v.x, v.z); if (f < floor) { floor = f; which = i; } top = Math.max(top, v.y); }
  return { floor, top, which };
}
const env = (cam: THREE.Vector3, night: number): any => ({ t: 0, day: 1 - night, night, twilight: 0, sunI: 1 - night, month: 1, mday: 15, cur: { x: 0.2, z: 0 }, cam, shy: 1, events: [], threats: [], threatsOut: [], prey: [],
  plankton: { sample: (x: number, z: number) => 0.65 + 0.1 * Math.sin(x * 0.11 + z * 0.03), consume: () => {} }, crunch: () => {}, sound: { frenzy: () => {}, plop: () => {} } });
const report: any = {};
for (const id of ['miyako', 'maldives', 'galapagos']) {
  const loc = LOCATIONS.find((l) => l.id === id)!, oc: any = buildOcean(loc), cam = new THREE.Vector3(0, -6, 0);
  const r = { mantas: oc.mantas.length, loops: 0, minFloor_m: Infinity, minFloorLoop_m: Infinity, maxTop_m: -Infinity, leaps: 0, swamOn: 0, leapMinFloor_m: Infinity, leapMinAt: '', leapMaxTopAfter_m: -Infinity };
  const dt = 1 / 30;
  for (const night of [1, 0]) {
    const e = env(cam, night);
    for (let k = 0; k < 30 * 3600 * 2; k++) {   // two hours each, the camera wandering about
      const t = k * dt; cam.set(Math.sin(t * 0.004) * 60, -6, Math.cos(t * 0.0033) * 60);
      U.uTime.value += dt; updateMantas(oc, dt, e, cam, Math.cos(t * 0.004), -Math.sin(t * 0.0033));
      for (const m of oc.mantas) {
        if (m.flip >= 0 && !m._inLoop) { r.loops++; m._inLoop = true; } else if (m.flip < 0) m._inLoop = false;
        const x = extent(m.mesh, oc.T);
        if (x.floor < r.minFloor_m) (r as any).minAt = `pt${x.which} night${night} flip${m.flip.toFixed(2)} pend${m.loopPending} y${m.mesh.position.y.toFixed(2)} swimY${m.swimY?.toFixed(2)} my${m.y.toFixed(2)} under${oc.T.top(m.mesh.position.x, m.mesh.position.z).toFixed(2)} travel${m.st.distanceTo(m.stationTarget).toFixed(1)} rad${m.rad.toFixed(1)} span${m.span.toFixed(1)} cam${m.mesh.position.distanceTo(cam).toFixed(0)}`;
        r.minFloor_m = Math.min(r.minFloor_m, x.floor); r.maxTop_m = Math.max(r.maxTop_m, x.top);
        if (m.flip >= 0) r.minFloorLoop_m = Math.min(r.minFloorLoop_m, x.floor);
      }
    }
  }
  // leaps, forced at the camera, each followed until it is put away
  const e = env(cam, 0); e.night = 0;
  for (let n = 0; n < 12; n++) {
    cam.set((n % 4 - 1.5) * 40, -6, (Math.floor(n / 4) - 1) * 40);
    if (!oc.breach.force('manta', cam, 0, -1)) continue;
    r.leaps++;
    const mesh = oc.group.children.find((c: any) => c.geometry === MANTA_GEO && !oc.mantas.some((m: any) => m.mesh === c));
    let landedAt = -1, t = 0, moved = 0, prev: any = null; const last = new THREE.Vector3();
    while (oc.breach.leap && t < 120) {
      U.uTime.value += dt; t += dt; oc.breach.update(dt, e, cam, 0, -1, false);
      const l = oc.breach.leap; if (!l) break;
      if (l !== prev) { landedAt = -1; prev = l; }   // (one of a series: the next leap of it)
      const x = extent(mesh, oc.T), s = l.t - 7;
      if (s >= 0 && x.floor < r.leapMinFloor_m) { r.leapMinFloor_m = x.floor; r.leapMinAt = (l.sw ? 'swim-on ' + (l.sw.t).toFixed(1) + 's' : l.run.done ? 'air' : 'run-up') + ` pt${x.which} y${mesh.position.y.toFixed(2)} top${oc.T.top(mesh.position.x, mesh.position.z).toFixed(2)} pitch${l.sw?.pitch?.toFixed(2)} scale${mesh.scale.x.toFixed(2)}`; }   // (the run up from the deep, and the swim on after)
      if (l.sw && landedAt < 0) { landedAt = t; last.copy(mesh.position); moved = 0; }
      if (landedAt >= 0 && t - landedAt > 2) {
        r.leapMaxTopAfter_m = Math.max(r.leapMaxTopAfter_m, x.top);
        if (t - landedAt < 6.5) moved += mesh.position.distanceTo(last);
      }
      if (landedAt >= 0) last.copy(mesh.position);
    }
    if (landedAt >= 0 && moved / 4.5 > 0.6) r.swamOn++;   // (the last of the series: swimming on at over 0.6 m/s)
  }
  for (const k in r) if (typeof (r as any)[k] === 'number') (r as any)[k] = +(r as any)[k].toFixed(2);
  report[id] = r;
}
console.log(JSON.stringify(report, null, 1));
for (const [id, r] of Object.entries(report) as [string, any][]) {
  assert.ok(r.minFloor_m > 0, `${id}: a manta goes into the seabed (${r.minFloor_m} m)`);
  assert.ok(r.maxTop_m < 0, `${id}: a manta breaks the surface while swimming (${r.maxTop_m} m)`);
  if (r.leaps) { assert.equal(r.swamOn, r.leaps, `${id}: a leap does not swim on after landing`); assert.ok(r.leapMinFloor_m > 0 && r.leapMaxTopAfter_m < 0, `${id}: after a leap, out of the water or into the reef`); }
}
console.log('manta-terrain-check: PASS');
