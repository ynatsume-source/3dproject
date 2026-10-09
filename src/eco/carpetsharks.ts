// Carpet sharks at rest. By day a zebra shark lies on open sand propped on its pectorals, facing into the current, and
// tawny nurse sharks lie at the foot of the reef, nose in under the rock, often two or three together; each pumps
// water over its gills where it lies, its tail curled a little. Now and then one gets up and moves on a few tens of
// metres to lie down again, and one the drone comes right up to swims slowly off and settles further away. At dusk
// they get up and through the night swim slowly along the bottom, nosing into the reef and the sand for food; at
// dawn each lies down again where it is. A resting group is put down only out of sight (eco/unseen, behind), and,
// left far behind, taken up only out of sight and put down again somewhere new the same way.
import * as THREE from 'three';
import { R, rr, hyp, clamp } from '../core/math';
import { carpetGeometry, carpetMaterial, carpetProfile, carpetBelly, type CarpetStyle } from '../ocean/carpetshark';
import { logEvent, type Env, type Subject } from './env';
import { unseen, sightRange } from './unseen';
import { ageOf } from './growth';

// a species: its body, length range (m), the groups it rests in (how many to each), the depth it rests at (m)
export interface CarpetSpec { id: string; ja: string; sci: string; note: string; style: CarpetStyle; len: [number, number]; groups: number[]; depth: [number, number] }

type Mode = 'rest' | 'move' | 'forage';
interface Shark {
  pos: THREE.Vector3; yaw: number; pitch: number; len: number; age: number; seed: number;
  mode: Mode; t: number; next: number; speed: number; swim: number; prop: number; ph: number; br: number; curl: number;
  goal: { x: number; z: number; yaw: number } | null; settle: number; vy: number; lastGap?: number;
}
interface Group { sp: CarpetSpec; members: Shark[]; placed: boolean; home: THREE.Vector3; logged: number }

export function makeCarpetSharks(oc: any) {
  const specs: CarpetSpec[] = oc.loc.carpets ?? [];
  if (!specs.length) return null;
  const kinds = specs.map((sp) => {
    const max = sp.groups.reduce((a, b) => a + b, 0);
    const geo = carpetGeometry(sp.style).clone();
    const aCs = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), aCs2 = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    aCs.setUsage(THREE.DynamicDrawUsage); aCs2.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aCs', aCs); geo.setAttribute('aCs2', aCs2);
    const mesh = new THREE.InstancedMesh(geo, carpetMaterial(sp.style), max);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
    oc.group.add(mesh);
    const groups: Group[] = sp.groups.map((n) => ({ sp, placed: false, home: new THREE.Vector3(), logged: 0, members: Array.from({ length: n }, () => {
      const len = rr(sp.len[0], sp.len[1]);
      return { pos: new THREE.Vector3(), yaw: 0, pitch: 0, len, age: clamp(ageOf(len, sp.len[1], 0.3) / ageOf(sp.len[1] * 1.05, sp.len[1], 0.3), 0, 1), seed: R(),
        mode: 'rest' as Mode, t: 0, next: rr(400, 1100), speed: 0, swim: 0, prop: 0, ph: R() * 6.28, br: R() * 6.28, curl: (R() - 0.5) * 0.6, goal: null, settle: 0, vy: 0 };
    }) }));
    return { sp, mesh, aCs, aCs2, groups };
  });
  return { kinds };
}
export type CarpetSharks = NonNullable<ReturnType<typeof makeCarpetSharks>>;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
// (along it from the snout to the tail's tip, close enough that a coral head between two samples cannot go unseen)
const SAMPLES = Array.from({ length: 25 }, (_, i) => 0.01 + i * 0.04);

// how it lies on the ground at (x, z) heading yaw: the pitch of the ground along it, and the height that keeps every part
// of its underside on or above the ground (touching where it is highest)
function fit(T: any, style: CarpetStyle, x: number, z: number, yaw: number, L: number, lift = 0) {
  const hx = Math.sin(yaw), hz = Math.cos(yaw);
  const d: number[] = [], g: number[] = [];
  for (const s of SAMPLES) { const a = (0.5 - s) * L; d.push(a); g.push(T.top(x + hx * a, z + hz * a)); }
  // (the ground's slope along it, by least squares, kept gentle)
  const md = d.reduce((a, b) => a + b, 0) / d.length, mg = g.reduce((a, b) => a + b, 0) / g.length;
  let num = 0, den = 0; for (let i = 0; i < d.length; i++) { num += (d[i] - md) * (g[i] - mg); den += (d[i] - md) ** 2; }
  const slope = clamp(num / Math.max(den, 1e-6), -0.3, 0.3);
  let y = -1e9, rough = 0;
  SAMPLES.forEach((s, i) => {
    const q = carpetProfile(style, s), under = (q.y - q.h * 0.85) * L;
    y = Math.max(y, g[i] - slope * d[i] - under);
    rough = Math.max(rough, Math.abs(g[i] - (mg + slope * (d[i] - md))));
  });
  return { y: y + 0.01 + lift, pitch: -Math.atan(slope), rough };
}

// how high its middle must be for no part of its underside to be in the ground, lying at (x, z) along yaw with this pitch
function floorFor(T: any, style: CarpetStyle, x: number, z: number, yaw: number, pitch: number, L: number) {
  const hx = Math.sin(yaw), hz = Math.cos(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let y = -1e9;
  for (const s of SAMPLES) { const a = (0.5 - s) * L, q = carpetProfile(style, s); y = Math.max(y, T.top(x + hx * cp * a, z + hz * cp * a) + sp * a - cp * (q.y - q.h * 0.85) * L); }
  return y + 0.01;
}

// how high it must swim, foraging, to clear the ground along its length now and a little ahead, and everything within
// reach of its length all round (turning, its head and tail sweep across it)
function swimFloor(T: any, style: CarpetStyle, x: number, z: number, yaw: number, pitch: number, L: number) {
  let fa = floorFor(T, style, x, z, yaw, pitch, L);
  for (const d of [0.7, 1.5, 3, 4.5]) fa = Math.max(fa, floorFor(T, style, x + Math.sin(yaw) * d, z + Math.cos(yaw) * d, yaw, pitch, L));
  for (let k = 0; k < 24; k++) { const b = k * Math.PI / 12; for (const r of [L * 0.15, L * 0.3, L * 0.45, L * 0.6]) fa = Math.max(fa, T.top(x + Math.sin(b) * r, z + Math.cos(b) * r) + carpetBelly(style) * L + 0.02); }
  return fa;
}

// a place to lie: a zebra on open sand, nurses at the foot of the reef with their noses toward it; level enough
// under the whole length; at the depth it likes
function restSpot(oc: any, sp: CarpetSpec, x: number, z: number, L: number, tries = 1) {
  const T = oc.T;
  if (-T.top(x, z) < sp.depth[0] || -T.top(x, z) > sp.depth[1]) return null;
  if (sp.style === 'zebra') {
    if (T.reef(x, z) > 0.12) return null;
    for (let k = 0; k < tries * 6; k++) { const yaw = R() * 6.28, f = fit(T, sp.style, x, z, yaw, L); if (f.rough < 0.06 + 0.02 * L) return { x, z, yaw }; }
    return null;
  }
  if (T.reef(x, z) > 0.2) return null;
  // (a rock rising ahead: turn its head toward the nearest rise within a couple of metres)
  let best = -1, by = 0;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, rise = T.top(x + Math.sin(a) * (L * 0.5 + 1.2), z + Math.cos(a) * (L * 0.5 + 1.2)) - T.top(x, z); if (rise > best) { best = rise; by = a; } }
  if (best < 0.6) return null;
  const f = fit(T, sp.style, x, z, by, L);
  return f.rough < 0.07 + 0.02 * L ? { x, z, yaw: by } : null;
}

function placeGroup(oc: any, gr: Group, cam: THREE.Vector3, fx: number, fz: number, night: boolean) {
  const T = oc.T, back = Math.atan2(-fz, -fx), L0 = gr.members[0].len;
  for (let k = 0; k < 400; k++) {
    // (out to one side, a little ahead or behind, where the camera going on its way will pass it: out of view now)
    const a = back + (R() < 0.5 ? -1 : 1) * rr(1.2, 1.85), d = rr(25, 42) * (1 + Math.floor(k / 150) * 0.4);
    const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
    const spot = restSpot(oc, gr.sp, x, z, L0);
    if (!spot) continue;
    // the others lie alongside, a little apart and askew, or nose to tail
    const ok = gr.members.every((m, i) => {
      const ox = i === 0 ? 0 : (i % 2 ? 1 : -1) * (0.35 * m.len + 0.25 * Math.ceil(i / 2)), oz = i === 0 ? 0 : -rr(0, 0.4) * m.len;
      const cy = Math.cos(spot.yaw), sy = Math.sin(spot.yaw);
      const px = spot.x + cy * ox + sy * oz, pz = spot.z - sy * ox + cy * oz, yaw = spot.yaw + (i ? rr(-0.35, 0.35) : 0);
      const f = fit(T, gr.sp.style, px, pz, yaw, m.len, gr.sp.style === 'zebra' ? m.len * 0.012 : 0);
      if (f.rough > 0.1 + 0.02 * m.len) return false;
      m.pos.set(px, f.y, pz); m.yaw = yaw; m.pitch = f.pitch; m.mode = night ? 'forage' : 'rest'; m.t = 0; m.speed = night ? 0.35 : 0; m.swim = night ? 1 : 0; m.prop = night ? 0 : 1; m.goal = null; m.settle = 1;
      if (night) { m.pitch = 0; m.pos.y = swimFloor(T, gr.sp.style, px, pz, yaw, 0, m.len) + 0.3; }
      return unseen(oc, m.pos.x, m.pos.y, m.pos.z, cam, fx, fz, m.len * 0.6);
    });
    if (!ok) continue;
    // (two lying in one another: try again)
    if (gr.members.some((m, i) => gr.members.some((o, j) => j < i && hyp(m.pos.x - o.pos.x, m.pos.z - o.pos.z) < 0.3 * Math.min(m.len, o.len)))) continue;
    gr.home.set(spot.x, T.top(spot.x, spot.z), spot.z); gr.placed = true; gr.logged = 0;
    return true;
  }
  return false;
}

export function updateCarpetSharks(oc: any, dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
  const C: CarpetSharks | null = oc.carpets;
  if (!C) return;
  const T = oc.T, night = env.night > 0.55, far = Math.max(90, sightRange(oc) + 15);
  for (const K of C.kinds) {
    const sp = K.sp, A = K.aCs.array as Float32Array, B = K.aCs2.array as Float32Array;
    let k = 0;
    for (const gr of K.groups) {
      const g0 = gr.members[0];
      const gone = gr.members.every((m) => hyp(m.pos.x - cam.x, m.pos.z - cam.z) > far && unseen(oc, m.pos.x, m.pos.y, m.pos.z, cam, fx, fz, m.len * 0.6 + 6));   // (well out of sight, with room to spare)
      if (!gr.placed || gone) { gr.placed = false; if (!placeGroup(oc, gr, cam, fx, fz, night)) continue; }
      for (const m of gr.members) {
        m.t += dt; m.next -= dt;
        const L = m.len, hx = Math.sin(m.yaw), hz = Math.cos(m.yaw);
        const cd = hyp(m.pos.x - cam.x, m.pos.z - cam.z), close = (() => {
          // (they let a diver come close: only right up against it, at any part of it from the snout to the tail, does it go)
          const ax = Math.sin(m.yaw), az = Math.cos(m.yaw), along = clamp((cam.x - m.pos.x) * ax + (cam.z - m.pos.z) * az, -L / 2, L / 2);
          return hyp(cam.x - (m.pos.x + ax * along), cam.z - (m.pos.z + az * along), cam.y - m.pos.y) < 0.9;
        })();
        // what it does: lie still by day, moving on now and then or when the drone crowds it; forage by night
        if (night && m.mode === 'rest') { m.mode = 'forage'; m.t = 0; m.goal = null; }
        if (!night && m.mode === 'forage') {
          // (a place to lie down, somewhere about it: a few tries a moment, ahead and to the sides)
          let s: { x: number; z: number; yaw: number } | null = null;
          for (let k2 = 0; k2 < 4 && !s; k2++) { const a2 = m.yaw + rr(-1.4, 1.4), d2 = rr(2, 20); s = restSpot(oc, sp, m.pos.x + Math.sin(a2) * d2, m.pos.z + Math.cos(a2) * d2, L); }
          if (s) { m.goal = s; m.mode = 'move'; m.t = 0; } else m.goal = null;
        }
        if (m.mode === 'rest' && (close || (m.next < 0 && cd > 20))) {
          // (up and away: a new place some way off, away from the drone if it was that)
          for (let tr = 0; tr < 60; tr++) {
            const a = close ? Math.atan2(m.pos.z - cam.z, m.pos.x - cam.x) + rr(-0.8, 0.8) : R() * 6.28, d = rr(12, 28);
            const s = restSpot(oc, sp, m.pos.x + Math.cos(a) * d, m.pos.z + Math.sin(a) * d, L);
            if (s) { m.goal = s; m.mode = 'move'; m.t = 0; m.next = rr(500, 1200); break; }
          }
          if (close && m.mode === 'rest') { m.mode = 'forage'; m.t = 0; m.goal = null; m.yaw = Math.atan2(m.pos.x - cam.x, m.pos.z - cam.z); }   // (nowhere near to lie: off away from the drone, to lie down where it can)
          if (close && m.mode !== 'rest' && gr.logged++ < 1) logEvent(env, 'carpet', `${sp.ja}が起き上がって、ゆっくり泳いで場所を移った`, m.pos.x, m.pos.z, () => m.pos);
          if (m.mode !== 'move') m.next = rr(200, 500);
        }
        if (m.mode === 'rest') {
          // lying still: breathing, the tail swaying a little, propped (a zebra) or flat
          m.speed = 0; m.swim += (0 - m.swim) * Math.min(1, dt * 1.5);
          m.prop += ((sp.style === 'zebra' ? 1 : 0.25) - m.prop) * Math.min(1, dt);
          const f = fit(T, sp.style, m.pos.x, m.pos.z, m.yaw, L, sp.style === 'zebra' ? L * 0.012 * m.prop : 0);
          m.pos.y += (f.y - m.pos.y) * Math.min(1, dt * 2); m.pitch += (f.pitch + (sp.style === 'zebra' ? -0.05 * m.prop : 0) - m.pitch) * Math.min(1, dt * 2);
          { const need = floorFor(T, sp.style, m.pos.x, m.pos.z, m.yaw, m.pitch, L); if (m.pos.y < need) m.pos.y = need; }
        } else {
          // swimming slowly along the bottom: to its new place, or meandering about the reef by night
          let want = m.yaw;
          if (m.mode === 'move' && m.goal) {
            const gx = m.goal.x - m.pos.x, gz = m.goal.z - m.pos.z, gd = hyp(gx, gz);
            want = Math.atan2(gx, gz);
            if (gd < 0.8) want = m.goal.yaw;
            m.speed += ((gd < 0.8 ? 0 : Math.min(0.45, gd * 0.25 + 0.1)) - m.speed) * Math.min(1, dt * 0.8);
            if (gd < 0.8 && Math.abs(Math.atan2(Math.sin(m.goal.yaw - m.yaw), Math.cos(m.goal.yaw - m.yaw))) < 0.15 && m.speed < 0.06) { m.mode = 'rest'; m.t = 0; m.goal = null; }
          } else {
            want = m.yaw + Math.sin(m.t * 0.21 + m.seed * 9) * 0.6 + Math.sin(m.t * 0.05) * 0.4;
            const hd = hyp(m.pos.x - gr.home.x, m.pos.z - gr.home.z);
            if (hd > 30) want = Math.atan2(gr.home.x - m.pos.x, gr.home.z - m.pos.z);
            m.speed += (0.35 - m.speed) * Math.min(1, dt * 0.5);
            if (m.mode === 'move' && !m.goal) m.mode = 'forage';
          }
          // (and round the drone, not through it; and round a wall of reef ahead rather than up it: of the ways a little
          // either side, the one with the least rising ahead)
          if (m.pos.distanceTo(cam) < 1.5 + L * 0.5) want = Math.atan2(m.pos.x - cam.x, m.pos.z - cam.z);
          // (coming in to its new place it heads straight there, nose to the rock if that is how it will lie)
          const nearGoal = m.mode === 'move' && !!m.goal && hyp(m.goal.x - m.pos.x, m.goal.z - m.pos.z) < 4;
          let bestA = 0, bestC = 1e9;
          if (!nearGoal) for (const da of [-2.4, -1.6, -0.9, -0.45, 0, 0.45, 0.9, 1.6, 2.4]) {
            const yw = want + da; let rise = 0;
            for (const d of [2, 3.5, 5, 7]) rise = Math.max(rise, T.top(m.pos.x + Math.sin(yw) * (d + L * 0.5), m.pos.z + Math.cos(yw) * (d + L * 0.5)) - (m.pos.y - 0.4));
            const c = Math.abs(da) * 0.5 + Math.max(0, rise) * 2;
            if (c < bestC) { bestC = c; bestA = da; }
          }
          want += bestA;
          const dy = Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw));
          // (turning swings its head and tail across what is beside it: while it is still climbing to clear it, slowly)
          const lag = Math.max(0, m.lastGap ?? 0), tr = 0.35 * clamp(1 - lag / 0.5, 0.15, 1);
          const turn = clamp(dy, -tr * dt, tr * dt); m.yaw += turn;
          m.pos.x += Math.sin(m.yaw) * m.speed * dt; m.pos.z += Math.cos(m.yaw) * m.speed * dt;
          // just over the bottom, rising ahead of rock and over it along its whole length, coming down gently to lie
          const lying = m.mode === 'move' && m.goal && hyp(m.goal.x - m.pos.x, m.goal.z - m.pos.z) < 0.8;
          const f = fit(T, sp.style, m.pos.x, m.pos.z, m.yaw, L);
          const ty = lying ? f.y + (sp.style === 'zebra' ? L * 0.012 : 0)
            : nearGoal ? floorFor(T, sp.style, m.pos.x, m.pos.z, m.yaw, m.pitch, L) + 0.2
            : swimFloor(T, sp.style, m.pos.x, m.pos.z, m.yaw, m.pitch, L) + 0.3 + 0.15 * Math.sin(m.t * 0.3 + m.seed * 5);
          m.lastGap = ty - m.pos.y - 0.3;
          // (rock rising in its way faster than it can climb: it slows, climbs, and goes on over)
          if (!lying && !nearGoal) { const cap = 0.35 * clamp(1 - (ty - m.pos.y - 0.2) / 0.6, 0.12, 1); if (m.speed > cap) m.speed += (cap - m.speed) * Math.min(1, dt * 3); }
          m.vy += (clamp((ty - m.pos.y) * 0.8, -0.25, 0.45) - m.vy) * Math.min(1, dt * 2);
          m.pos.y += m.vy * dt;
          // (a long body: its nose tilts only a little and slowly as it rises and falls, or its tail would dip into the ground)
          m.pitch += (clamp(lying ? f.pitch : f.pitch * 0.5 - m.vy * 0.4, lying ? -0.35 : -0.15, lying ? 0.35 : 0.15) - m.pitch) * Math.min(1, dt * (lying ? 2 : 0.8));
          // (never with any part of it in the ground, as it is pitched now)
          const need = floorFor(T, sp.style, m.pos.x, m.pos.z, m.yaw, m.pitch, L);
          if (m.pos.y < need) { m.pos.y = need - m.pos.y < 0.025 ? m.pos.y + (need - m.pos.y) * Math.min(1, dt * 3) : need; if (m.vy < 0) m.vy = 0; }   // (a hair's breadth eased out, not popped)
          m.pos.y = Math.min(m.pos.y, -0.8);
          m.swim += ((m.speed > 0.08 ? 1 : 0.2) - m.swim) * Math.min(1, dt * 1.5);
          m.prop += ((lying && sp.style === 'zebra' ? 1 : 0) - m.prop) * Math.min(1, dt);
          // (now and then, by night, it noses into the reef)
          if (m.mode === 'forage' && cd < 25 && gr.logged < 1 && T.reef(m.pos.x, m.pos.z) > 0.4 && R() < dt / 60) { gr.logged++; logEvent(env, 'carpet', `${sp.ja}が岩のすき間に鼻先を入れて、餌を探している`, m.pos.x, m.pos.z, () => m.pos); }
        }
        m.ph += dt * (0.4 + 2.2 * m.speed / Math.max(0.3, L * 0.25)) * (0.3 + 0.7 * m.swim);
        m.br += dt * 2.2;
        _e.set(m.pitch, m.yaw, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(m.pos, _q, _s.setScalar(L));
        K.mesh.setMatrixAt(k, _m);
        A[k * 4] = m.ph; A[k * 4 + 1] = m.swim; A[k * 4 + 2] = m.prop; A[k * 4 + 3] = m.br;
        B[k * 4] = m.age; B[k * 4 + 1] = m.seed; B[k * 4 + 2] = m.curl * (1 - m.swim); B[k * 4 + 3] = 0;
        k++;
      }
    }
    K.mesh.count = k;
    K.mesh.instanceMatrix.needsUpdate = true; K.aCs.needsUpdate = true; K.aCs2.needsUpdate = true;
  }
}

export function carpetSubjects(oc: any, out: Subject[], only?: string) {
  const C: CarpetSharks | null = oc.carpets;
  if (!C) return;
  for (const K of C.kinds) {
    if (only && K.sp.id !== only) continue;
    K.groups.forEach((gr, i) => {
      if (!gr.placed) return;
      const sp = K.sp, lead = gr.members[0], mid = new THREE.Vector3();
      const resting = () => gr.members.every((m) => m.mode === 'rest');
      out.push({ key: `${sp.id}:${i}`, label: gr.members.length > 1 && resting() ? `${sp.ja}（${gr.members.length}匹）` : sp.ja, len: lead.len, adult: sp.len[1], lenK: 0.3, lenWhat: '全長', kind: 'turtle', prio: 3.2, size: lead.len,
        pos: () => { mid.set(0, 0, 0); for (const m of gr.members) mid.add(m.pos); return mid.multiplyScalar(1 / gr.members.length); },
        heading: () => ({ x: Math.sin(lead.yaw), z: Math.cos(lead.yaw) }),
        status: () => {
          if (gr.members.some((m) => m.mode === 'move')) return 'ゆっくり泳いで、休む場所を移っている';
          if (gr.members.some((m) => m.mode === 'forage')) return T_NIGHT[sp.style];
          return gr.members.length > 1 ? '岩陰の砂の上で、仲間と寄り添って休んでいる' : sp.style === 'zebra' ? '胸びれで体を支えて、砂の上で休んでいる' : '岩陰の砂の上で休んでいる';
        },
        live: () => gr.placed });
    });
  }
}
const T_NIGHT: Record<CarpetStyle, string> = { zebra: '海底すれすれを泳いで、貝やカニを探している', nurse: '海底すれすれを泳いで、岩のすき間の餌を探している' };
