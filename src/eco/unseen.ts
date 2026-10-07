// Nothing comes out of nowhere. An animal (or a school, a pod, a train of mantas) that is new to the scene
// is put down only where it cannot be seen — beyond what this water lets one see, or well behind the camera —
// and swims in from there; one that is done is taken away only once it has gone the same way, out of sight.
// Every event and every relocation of a school keeps to this (CLAUDE.md, "生き物は無から出ない").
import { clamp, R, hyp } from '../core/math';

/** How far one can make out a large animal in this water (m): where the water has taken all but about a
 *  tenth of its contrast. Clear tropical water ~150 m, a green kelp coast ~80 m. */
export function sightRange(oc: any) {
  const fog = oc.loc?.water?.fog ?? 0.02;
  return clamp(Math.log(10) / fog, 60, 160);
}

/** Whether something of radius r at (x, y, z) cannot be seen from the camera looking along (fx, fz):
 *  beyond sight, or not close by and well off to the side or behind — more than 75° off the way it looks
 *  (the widest view, a phone on its side, shows 50° either side; the rest is room for the camera turning). */
export function unseen(oc: any, x: number, y: number, z: number, cam: { x: number; y: number; z: number }, fx: number, fz: number, r = 0) {
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, d = hyp(dx, dy, dz);
  if (d - r > sightRange(oc)) return true;
  if (d - r <= 22) return false;
  const fl = hyp(fx, fz) || 1, hd = hyp(dx, dz) || 1, along = (dx * fx + dz * fz) / fl;
  // (the edge of what it covers, not its middle: its radius brings it that much nearer the view)
  return along / hd < Math.cos(75 * Math.PI / 180 + Math.min(0.5, r / hd));
}

/** A point at distance d from the camera, in a direction `off` radians from straight behind it (0: dead
 *  behind; ±1: behind to one side), in water at least `need` deep: where something can be put unseen.
 *  Tries round the back first, then wider, then further off; null if there is no such water. */
export function behind(oc: any, cam: { x: number; z: number }, fx: number, fz: number, d: number, need: number, off = 0) {
  const back = Math.atan2(-fz, -fx), T = oc.T;
  for (let k = 0; k < 40; k++) {
    const spread = 0.35 + k * 0.03, a = back + off + (R() * 2 - 1) * spread, dd = d * (1 + Math.floor(k / 14) * 0.35);
    const x = cam.x + Math.cos(a) * dd, z = cam.z + Math.sin(a) * dd;
    if (oc.loc.pelagic || T.top(x, z) < -need) return { x, z };
  }
  return null;
}

/** Depth for something swimming along at (x, z) heading (hx, hz) (unit), wanting depth `want`: kept clear of the
 *  reef under its whole body (half-width w) and some way ahead (look), and under the surface. */
export function clearDepth(oc: any, x: number, z: number, hx: number, hz: number, want: number, w: number, clear: number, look = 6) {
  const T = oc.T, sx = -hz * w, sz = hx * w;
  let fl = -1e9;
  for (let d = -2; d <= look; d += 2) {   // (from just behind: its tail end and the trailing wing are over it still)
    const px = x + hx * d, pz = z + hz * d;
    fl = Math.max(fl, T.top(px, pz), T.top(px + sx, pz + sz), T.top(px - sx, pz - sz), T.top(px + sx * 0.5, pz + sz * 0.5), T.top(px - sx * 0.5, pz - sz * 0.5));   // (and halfway out: a rock under the wing between the tip and the body)
  }
  return Math.min(Math.max(want, fl + clear), -1.2);
}
