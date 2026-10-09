// Spotted eagle rays keep about the reef: a few lone ones and small groups that cruise along the reef edge and over
// the sand in mid-water, wings beating a few strokes and then gliding, banking into their turns, the group in a
// loose echelon; now and then one drops to the sand and roots in it with its snout for shellfish, hanging nose
// down for a while before lifting away. A group is put down only out of sight (eco/unseen, behind) and, if the
// camera leaves it far behind, taken up again only out of sight and set down somewhere new the same way.
import * as THREE from 'three';
import { R, rr, hyp, clamp } from '../core/math';
import { EAGLERAY_GEO, eagleRayMaterial } from '../ocean/eagleray';
import { logEvent, type Env, type Subject } from './env';
import { unseen, behind, clearDepth, sightRange } from './unseen';
import { outZone, toZone } from '../ocean/zone';

// a species: how many groups, how many to a group, the wingspan range (m)
export interface EagleRaySpec { id: string; ja: string; sci: string; note: string; groups: number; size: [number, number]; span: [number, number] }

interface Ray { pos: THREE.Vector3; vel: THREE.Vector3; off: THREE.Vector3; span: number; ph: number; beat: number; roll: number; lag: number; dig: number; seed: number }
interface Group { rays: Ray[]; c: THREE.Vector3; head: number; speed: number; alt: number; deep: number; cool: number; placed: boolean; t: number; glide: number; logged: number }

const MAX = 14;
export function makeEagleRays(oc: any) {
  const spec: EagleRaySpec | undefined = oc.loc.eaglerays;
  if (!spec) return null;
  const geo = EAGLERAY_GEO.clone();
  const aRay = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); aRay.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aRay', aRay);
  const mesh = new THREE.InstancedMesh(geo, eagleRayMaterial(), MAX);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
  oc.group.add(mesh);
  const groups: Group[] = [];
  let left = MAX;
  for (let g = 0; g < spec.groups && left > 0; g++) {
    const n = Math.min(left, Math.round(rr(spec.size[0], spec.size[1]))); left -= n;
    const rays: Ray[] = [];
    for (let i = 0; i < n; i++) {
      // echelon: each a little behind and to one side of the one before, a little higher or lower
      const off = new THREE.Vector3((i % 2 ? 1 : -1) * Math.ceil(i / 2) * rr(1.4, 2.2), (R() - 0.5) * 0.8, -i * rr(1.2, 2.0));
      rays.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), off, span: rr(spec.span[0], spec.span[1]), ph: R() * 6.28, beat: 0.6, roll: 0, lag: 0, dig: 0, seed: R() });
    }
    groups.push({ rays, c: new THREE.Vector3(), head: R() * 6.28, speed: rr(0.9, 1.3), alt: rr(1.6, 3.5), deep: rr(6, 13), cool: 0, placed: false, t: R() * 100, glide: 0, logged: 0 });
  }
  return { spec, mesh, aRay, groups };
}
export type EagleRays = NonNullable<ReturnType<typeof makeEagleRays>>;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3();

function place(oc: any, g: Group, cam: THREE.Vector3, fx: number, fz: number) {
  for (let k = 0; k < 10; k++) {
    // (ahead, just beyond what can be seen, where a cruising camera comes up on it; in water too clear for that, out
    // to one side and a little ahead; failing both, behind)
    const sr = sightRange(oc), side = R() < 0.5 ? 1 : -1;
    const ahead = sr < 80 && k < 5, off = ahead ? Math.PI + rr(-0.5, 0.5) : k < 8 ? side * (Math.PI - rr(1.45, 1.75)) : 0;
    const at = behind(oc, cam, fx, fz, ahead ? sr + rr(4, 12) : rr(36, 55), 5, off);
    if (!at) continue;
    const fl = hyp(fx, fz) || 1, ax = cam.x + fx / fl * 25, az = cam.z + fz / fl * 25;
    g.head = Math.atan2(az - at.z, ax - at.x) + rr(-0.5, 0.5);   // (heading across, toward where the camera is going)
    const hx = Math.cos(g.head), hz = Math.sin(g.head);
    const y = Math.min(-1.2, clearDepth(oc, at.x, at.z, hx, hz, Math.max(oc.T.top(at.x, at.z) + g.alt, -g.deep), 2.6, 1.6, 10));
    g.c.set(at.x, y, at.z); g.cool = 0;
    for (const r of g.rays) {
      r.pos.set(at.x - hz * r.off.x + hx * r.off.z, y + r.off.y, at.z + hx * r.off.x + hz * r.off.z);
      r.pos.y = Math.max(r.pos.y, floorUnder(oc.T, r.pos.x, r.pos.z, hx, hz, r.span) + clearOf(r));
      r.vel.set(hx, 0, hz).multiplyScalar(g.speed); r.dig = 0;
    }
    if (g.rays.every((r) => r.pos.y < -0.8 && unseen(oc, r.pos.x, r.pos.y, r.pos.z, cam, fx, fz, r.span))) { g.placed = true; return true; }
  }
  return false;
}

// the highest of the floor under a ray: under its body, both wing tips and its snout, and a little ahead of each
function floorUnder(T: any, x: number, z: number, hx: number, hz: number, span: number) {
  const w = span * 0.5, sx = -hz * w, sz = hx * w;
  let f = -1e9;
  for (const d of [-span * 0.3, 0, span * 0.35, span * 0.8 + 1]) {
    const px = x + hx * d, pz = z + hz * d;
    f = Math.max(f, T.top(px, pz), T.top(px + sx, pz + sz), T.top(px - sx, pz - sz), T.top(px + sx * 0.5, pz + sz * 0.5), T.top(px - sx * 0.5, pz - sz * 0.5));
  }
  return f;
}
// (how far above that floor it keeps: room for a wing's beat, less when it is down rooting in the sand)
const clearOf = (r: Ray) => (r.dig > 0 ? r.span * 0.1 : r.span * 0.22 + 0.25);

export function updateEagleRays(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const E: EagleRays | null = oc.eaglerays;
  if (!E) return;
  const T = oc.T, A = E.aRay.array as Float32Array;
  let k = 0;
  for (const g of E.groups) {
    g.t += dt;
    const far = hyp(g.c.x - cam.x, g.c.z - cam.z) > Math.max(85, sightRange(oc) + 15);
    // left far behind: lifted (only once out of sight) and set down again somewhere new, out of sight
    if (!g.placed || (far && g.rays.every((r) => unseen(oc, r.pos.x, r.pos.y, r.pos.z, cam, fx, fz, r.span)))) {
      g.placed = false;
      if (!place(oc, g, cam, fx, fz)) continue;
    }
    // the group's course: a slow meander, kept off shallow reef (toward the deeper side) and within the sea's range;
    // its depth a few metres over the floor, but over deep water no deeper than its own cruising depth (mid-water)
    g.head += (Math.sin(g.t * 0.11 + g.alt * 3) * 0.16 + Math.sin(g.t * 0.037) * 0.1) * dt;
    // (while some way off, its rounds slowly bring it across the way the camera is going: a group keeps about this
    // stretch of reef, and it is here the camera is; a slow turn, never a jump)
    const fl = hyp(fx, fz) || 1, gx = cam.x + fx / fl * 20 - g.c.x, gz = cam.z + fz / fl * 20 - g.c.z;
    const gd = hyp(g.c.x - cam.x, g.c.z - cam.z);
    g.cool -= dt; if (gd < 18) g.cool = rr(90, 180);   // (and once it has crossed near, it goes its own way for a while)
    const drawn = gd > 25 && g.cool <= 0 && (g.c.x - cam.x) * fx + (g.c.z - cam.z) * fz > 0 ? 2 : 0;   // (not chasing from behind: one left behind is left)
    let best = 0, bestD = -1e9;
    for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const hx = Math.cos(g.head + a), hz = Math.sin(g.head + a);
      let top = -1e9; for (let d = 4; d <= 16; d += 4) top = Math.max(top, T.top(g.c.x + hx * d, g.c.z + hz * d));
      const off = Math.atan2(gz, gx) - g.head - a, sc = Math.min(-top, 6) - Math.abs(a) * 0.6 - drawn * Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
      if (sc > bestD) { bestD = sc; best = a; }
    }
    g.head += clamp(best, -0.3, 0.3) * dt * 0.8;
    if (outZone(g.c.x, g.c.z)) { const d = Math.atan2(Math.sin(toZone(g.c.x, g.c.z) - g.head), Math.cos(toZone(g.c.x, g.c.z) - g.head)); g.head += d * dt * 0.5; }
    const hx = Math.cos(g.head), hz = Math.sin(g.head);
    // a few strokes, then a glide
    g.glide -= dt; if (g.glide < -rr(3, 5)) g.glide = rr(2, 4);
    const pace = g.speed * (g.glide > 0 ? 0.85 : 1.05);
    g.c.x += hx * pace * dt; g.c.z += hz * pace * dt;
    const want = Math.min(-1.2, clearDepth(oc, g.c.x, g.c.z, hx, hz, Math.max(T.top(g.c.x, g.c.z) + g.alt, -g.deep) + Math.sin(g.t * 0.2) * 0.5, 2.6, 1.6, 12));
    g.c.y += Math.max(-0.3 * dt, Math.min(0.35 * dt, (want - g.c.y) * dt * 0.5));
    // now and then, over sand and near enough to see, one drops to root in it
    for (const r of g.rays) {
      if (r.dig <= 0 && T.reef(r.pos.x, r.pos.z) < 0.15 && T.top(r.pos.x, r.pos.z) > r.pos.y - 6 && floorUnder(T, r.pos.x, r.pos.z, hx, hz, r.span) - T.top(r.pos.x, r.pos.z) < 0.25 && R() < dt / 70) {
        r.dig = rr(9, 15);
        if (hyp(r.pos.x - cam.x, r.pos.z - cam.z) < 30 && g.logged++ < 2) logEvent(env, 'eagleray', `${E.spec.ja}が砂地に鼻先を突っこんで、貝を探している`, r.pos.x, r.pos.z, () => r.pos);
      }
    }
    for (const r of g.rays) {
      if (k >= MAX) break;
      if (r.dig > 0) {
        // rooting in the sand: down to just over it, nose down, hanging there, wings rippling slowly
        r.dig -= dt;
        _t.set(r.pos.x + hx * 0.2 * dt, floorUnder(T, r.pos.x, r.pos.z, hx, hz, r.span) + clearOf(r), r.pos.z + hz * 0.2 * dt);
      } else {
        _t.set(g.c.x - hz * r.off.x + hx * r.off.z, g.c.y + r.off.y, g.c.z + hx * r.off.x + hz * r.off.z);
      }
      _w.subVectors(_t, r.pos);
      const dist = _w.length(), maxS = r.dig > 0 ? 0.5 : pace * 1.6 + 0.3;
      _w.multiplyScalar(Math.min(maxS, dist * 0.9) / Math.max(dist, 1e-3));
      // (a big flat animal cannot turn on a pin: its heading swings round slowly)
      const v0 = r.vel.clone();
      r.vel.lerp(_w, 1 - Math.exp(-dt * 0.9));
      if (r.dig <= 0 && r.vel.length() < 0.35) r.vel.setLength(r.vel.length() + (0.35 - r.vel.length()) * Math.min(1, dt * 1.5) + 1e-3);
      // (and keep off the drone)
      _s.subVectors(r.pos, cam); const cd = _s.length(); if (cd < r.span * 0.9 + 1.5) r.vel.addScaledVector(_s, Math.min(1, r.span * 0.9 + 1.5 - cd) * dt * 1.6 / Math.max(cd, 0.1));
      // (rising ahead of rock under it or under a wing: its own floor, looked for a little ahead)
      const hs0 = hyp(r.vel.x, r.vel.z) || 1e-3, fl = floorUnder(T, r.pos.x, r.pos.z, r.vel.x / hs0, r.vel.z / hs0, r.span) + clearOf(r);
      if (r.pos.y < fl + 0.3) r.vel.y += clamp(Math.min(0.8, (fl + 0.3 - r.pos.y) * 1.5) - r.vel.y, 0, dt * 1.5);
      r.pos.addScaledVector(r.vel, dt);
      if (r.pos.y < fl - 0.05) r.pos.y += (fl - 0.05 - r.pos.y) * Math.min(1, dt * 4);
      r.pos.y = Math.min(r.pos.y, -0.8);
      const turn = Math.atan2(v0.x * r.vel.z - v0.z * r.vel.x, v0.x * r.vel.x + v0.z * r.vel.z) / Math.max(dt, 1e-3);
      r.roll += (clamp(turn * 1.2, -0.6, 0.6) - r.roll)   /* (turn > 0: round to its right, right wing down) */ * Math.min(1, dt * 1.5);
      r.lag += (clamp(turn * 0.5, -0.3, 0.3) - r.lag) * Math.min(1, dt * 2);
      const beatW = r.dig > 0 ? 0.25 : g.glide > 0 ? 0.08 : 0.75;
      r.beat += (beatW - r.beat) * Math.min(1, dt * 1.5);
      r.ph += dt * (r.dig > 0 ? 1.6 : 2.6) * (0.6 + 0.4 * r.beat);
      const hs = hyp(r.vel.x, r.vel.z) || 1e-3, pitch = r.dig > 0 ? -0.5 : clamp(-Math.atan2(r.vel.y, hs) * 0.7, -0.3, 0.3);
      _e.set(pitch, Math.atan2(r.vel.x, r.vel.z), r.roll, 'YXZ');
      _q.setFromEuler(_e); _m.compose(r.pos, _q, _s.setScalar(r.span * 0.5));
      E.mesh.setMatrixAt(k, _m);
      A[k * 4] = r.ph; A[k * 4 + 1] = r.beat; A[k * 4 + 2] = r.seed; A[k * 4 + 3] = r.lag;
      k++;
    }
  }
  E.mesh.count = k;
  E.mesh.instanceMatrix.needsUpdate = true; E.aRay.needsUpdate = true;
}

export function eagleRaySubjects(oc: any, out: Subject[]) {
  const E: EagleRays | null = oc.eaglerays;
  if (!E) return;
  E.groups.forEach((g, i) => {
    if (!g.placed) return;
    const lead = g.rays[0], mid = new THREE.Vector3();
    out.push({ key: `eagleray:${i}`, label: g.rays.length > 1 ? `${E.spec.ja}の群れ` : E.spec.ja, len: lead.span, adult: E.spec.span[1], lenK: 0.25, lenWhat: '体盤幅', kind: 'manta', prio: 3.4, size: lead.span + (g.rays.length - 1) * 1.2,
      pos: () => { mid.set(0, 0, 0); for (const r of g.rays) mid.add(r.pos); return mid.multiplyScalar(1 / g.rays.length); },
      heading: () => ({ x: Math.cos(g.head), z: Math.sin(g.head) }),
      status: () => (g.rays.some((r) => r.dig > 0) ? (g.rays.length > 1 ? '一匹が砂地で貝を探している' : '砂地で貝を探している') : g.glide > 0 ? '翼を広げて滑るように泳いでいる' : 'ゆったり羽ばたいて泳いでいる'),
      live: () => g.placed });
  });
}
