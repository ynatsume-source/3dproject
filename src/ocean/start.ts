// Where a visit to a sea begins: in front of the best thing in it, in full view. Each sea has its sight — the
// wreck where there is one, the thickest of the staghorn thicket where the reef has them, the mantas' circling
// ground — and the camera is put where that fills the picture with clear water between, looking at it. (The
// open ocean, the kelp forest and the residents' island keep their own way of arriving.)
import * as THREE from 'three';
import { hyp } from '../core/math';

export interface Start { pos: THREE.Vector3; yaw: number; pitch: number; what: string }

export function pickStart(oc: any): Start | null {
  const T = oc.T, loc = oc.loc;
  if (loc.pelagic || loc.habitat === 'kelp' || oc.residents) return null;
  let target: THREE.Vector3 | null = null, dist = 10, rise = 3, what = '';
  if (oc.wreck) {
    // the wreck, from off her quarter, a good part of her length in the picture
    const c = oc.wreck.centre;
    target = new THREE.Vector3(c.x, c.y, c.z); dist = Math.max(16, (loc.wreck?.len ?? 60) * 0.2); rise = 3; what = 'wreck';
  } else if (oc.thicketAt) {
    // the thickest of the thicket, at a depth that is bright
    let bs = 0;
    for (let x = -110; x <= 110; x += 5) for (let z = -110; z <= 110; z += 5) {
      const k = oc.thicketAt(x, z); if (k <= 0) continue;
      const h = loc.f(x, z), s = k * (h < -2.5 && h > -10 ? 1 : 0.3);
      if (s > bs) { bs = s; target = new THREE.Vector3(x, T.top(x, z), z); }
    }
    if (target) { dist = 9; rise = 3.2; what = 'thicket'; }
  }
  if (!target) {
    // otherwise the finest pinnacle: a head of reef standing well up out of deeper water round it, its top in
    // the bright water (a thila, a bommie)
    let bs = 0;
    for (let x = -100; x <= 100; x += 6) for (let z = -100; z <= 100; z += 6) {
      const top = T.top(x, z); if (top > -3 || top < -14) continue;
      let ring = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ring += T.top(x + Math.cos(a) * 12, z + Math.sin(a) * 12); }
      const rise0 = top - ring / 8;
      if (rise0 > bs) { bs = rise0; target = new THREE.Vector3(x, top, z); }
    }
    if (target && bs > 2) { dist = 14; rise = 1.5; what = 'pinnacle'; } else target = null;
  }
  if (!target) return null;
  // round it, the place with clear water between the camera and the sight, the camera above the reef and under the surface
  let best: Start | null = null, bs = -Infinity;
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = target.x + Math.cos(a) * dist, z = target.z + Math.sin(a) * dist;
    const fl = T.top(x, z);
    const y = Math.min(Math.max(target.y + rise, fl + 2.2), -1.8);
    if (y < fl + 1.5) continue;
    let clear = 1;
    for (let i = 1; i < 20; i++) {
      const t = i / 20, px = x + (target.x - x) * t, pz = z + (target.z - z) * t, py = y + (target.y + 0.6 - y) * t;
      if (T.top(px, pz) > py - 0.3 && t < 0.92) { clear = 0; break; }
    }
    if (!clear) continue;
    // (open water around the camera; looking a little down at it rather than up)
    const room = y - fl, sc = Math.min(room, 6) - Math.abs(y - (target.y + rise)) * 0.5;
    if (sc > bs) {
      bs = sc;
      const dx = target.x - x, dz = target.z - z, dy = target.y + 0.5 - y;
      best = { pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(-dx, -dz), pitch: Math.max(-0.6, Math.min(0.3, Math.atan2(dy, hyp(dx, dz)))), what };
    }
  }
  return best;
}
