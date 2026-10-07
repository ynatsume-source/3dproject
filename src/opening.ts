// The way into a sea (owner's idea, 2026-10): it begins in the air, the drone itself in the picture under the sky —
// the sun, the moon, or the stars — then the view slides into the drone's own eye, it tips over toward the sea and
// goes in at an angle, through a burst of bubbles, onto the sea's best sight. Only where the camera
// is and which way it looks, second by second; the app lays it over the drone (and shows the whiteout).
import * as THREE from 'three';
import { smooth } from './core/math';

export interface OpeningPose { pos: THREE.Vector3; yaw: number; pitch: number; chase: number; white: number; under: boolean }
export interface Opening { len: number; entry: THREE.Vector3; end: { pos: THREE.Vector3; yaw: number }; at(t: number, out: OpeningPose): OpeningPose }

const HOLD = 3.6, FALL = 3.0, UNDER = 2.8;
const ease = (s: number) => s * s * (3 - 2 * s);
const turn = (a: number, b: number, k: number) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

/** end: where the visit begins under the water (pos, yaw, pitch); sky: the direction of what to look at above
 *  (null: up into the stars); top: the floor (rock and reef) at x, z. */
export function planOpening(end: { pos: THREE.Vector3; yaw: number; pitch: number }, sky: THREE.Vector3 | null, top: (x: number, z: number) => number): Opening {
  const fx = -Math.sin(end.yaw), fz = -Math.cos(end.yaw);
  // into the sea a little back from where it ends up, where the water is deep enough to go in
  let back = 10;
  while (back > 2 && top(end.pos.x - fx * back, end.pos.z - fz * back) > -1.5) back -= 1;
  const entry = new THREE.Vector3(end.pos.x - fx * back, 0, end.pos.z - fz * back);
  const H = 18, RUN = 26, DRIFT = 1.2;
  const air = new THREE.Vector3(entry.x - fx * RUN, H, entry.z - fz * RUN);
  // what it looks up at first
  const skyYaw = sky ? Math.atan2(-sky.x, -sky.z) : end.yaw;
  const skyPitch = sky ? Math.min(0.75, Math.max(0.12, Math.asin(Math.max(-1, Math.min(1, sky.y))))) : 0.55;
  const DIVE = -0.75;   // (the nose down at the surface: about the angle it comes in at)
  const len = HOLD + FALL + UNDER;
  return {
    len, entry, end: { pos: end.pos.clone(), yaw: end.yaw },
    at(t, o) {
      o.under = false;
      if (t < HOLD) {
        // hovering high over the sea, drifting on a little, looking up at the sky; the view slides from behind
        // the drone into its own eye toward the end
        const k = t / HOLD;
        o.pos.set(air.x + fx * DRIFT * k, H + Math.sin(t * 0.9) * 0.15, air.z + fz * DRIFT * k);
        o.chase = 1 - ease(Math.max(0, Math.min(1, (t - 2.2) / 1.4)));
      } else if (t < HOLD + FALL) {
        // tipping over and down toward the water, faster and steeper all the way in
        const s = (t - HOLD) / FALL, h = s * s * (2 - s);
        const sx = air.x + fx * DRIFT, sz = air.z + fz * DRIFT;
        o.pos.set(sx + (entry.x - sx) * h, H * (1 - s * s), sz + (entry.z - sz) * h);
        o.chase = 0;
      } else {
        // in, and on under the water to the sight, slowing as it comes
        const s = Math.min(1, (t - HOLD - FALL) / UNDER), u = 1 - (1 - s) * (1 - s);
        o.pos.set(entry.x + (end.pos.x - entry.x) * u, entry.y + (end.pos.y - entry.y) * u, entry.z + (end.pos.z - entry.z) * u);
        o.chase = 0; o.under = true;
      }
      // the look: up at the sky, then round to the way in and down, then level out toward the sight
      const kTurn = ease(Math.max(0, Math.min(1, (t - 3.2) / 2.0)));
      o.yaw = turn(skyYaw, end.yaw, kTurn);
      const kDown = ease(Math.max(0, Math.min(1, (t - 3.4) / 2.6)));
      const kLevel = ease(Math.max(0, Math.min(1, (t - HOLD - FALL) / (UNDER * 0.85))));
      o.pitch = (skyPitch + (DIVE - skyPitch) * kDown) * (1 - kLevel) + end.pitch * kLevel;
      // going in: a pale veil of churned water for a moment, clearing within a second or so — only a touch of it: what
      // the eye sees is the bubbles (the app's), and the sea through them (a full white screen was too much: owner,
      // 2026-10-06)
      o.white = t < HOLD + FALL ? 0 : 0.35 * (1 - smooth(0.05, 1.2, t - HOLD - FALL));
      return o;
    },
  };
}
