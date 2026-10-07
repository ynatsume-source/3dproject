// Habitat decisions for the existing Point Lobos fish. The species' day/night behaviour is
// separate from fish.ts's steering, predator avoidance and rendering. Locations are sampled
// only at placement; changing kelp drawing quality cannot change a fish's home or sand bed.
import { smooth, hyp } from '../core/math';
import type { Species } from '../data/locations';

type Point = { x: number; y: number; z: number };
type Mode = 'swim' | 'forage' | 'seek-sand' | 'bury' | 'sleep' | 'wake';
export interface KelpFishState {
  mode: Mode; support: Point | null; sand: Point | null;
  supportAt?: (time: number) => { pos: Point }; feedingOnLeaf: boolean;
  x: number; y: number; z: number; weight: number; burial: number; peck: number;
  phase: number; heading: number;
}
const hash = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function makeKelpFishLife(sp: Species, oc: any, count: number) {
  if (oc.loc.id !== 'pointlobos' || !oc.kelp) return null;
  const anchors: { pos: Point }[] = oc.kelp.anchors;
  const leaves: { pos: Point; supportAt: (time: number) => { pos: Point } }[] = (oc.kelp.understory?.anchors || []).filter((a: any) => a.kind === 'broadleaf' && a.supportAt);
  const floor: (x: number, z: number) => number = oc.kelp.floorAt;
  const T = oc.T;
  const senorita = sp.id === 'senorita';
  const grazer = senorita || sp.id === 'black-surfperch';
  const states: KelpFishState[] = Array.from({ length: count }, (_, i) => ({
    mode: 'swim', support: null, sand: null, x: 0, y: 0, z: 0, weight: 0,
    burial: 0, peck: 0, feedingOnLeaf: false, phase: hash(i + 1) * 39, heading: hash(i + 29) * Math.PI * 2,
  }));
  function anchorNear(x: number, z: number, radius = 22): Point | null {
    let best: Point | null = null, distance = radius * radius;
    for (const a of anchors) {
      const d = (a.pos.x - x) ** 2 + (a.pos.z - z) ** 2;
      if (d < distance) { distance = d; best = a.pos; }
    }
    return best;
  }
  // The rendered sand/rock boundary is a blend, so choose well inside its sandy end,
  // on a flat patch large enough for the whole fish. A missing patch means no burial.
  function isSand(x: number, z: number) {
    if (Math.abs(x) > 126 || Math.abs(z) > 126 || !T.wet(x, z, 2)) return false;
    const y = floor(x, z);
    if (T.reef(x, z) > 0.09 || Math.abs(T.top(x, z) - y) > 0.18) return false;
    for (const [dx, dz] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
      if (T.reef(x + dx, z + dz) > 0.11 || Math.abs(floor(x + dx, z + dz) - y) > 0.045) return false;
    }
    return true;
  }
  function sandNear(x: number, z: number, i: number): Point | null {
    let best: Point | null = null, bestDistance = Infinity;
    // Six rings, at most 97 candidates, once per placement rather than every frame.
    for (let k = 0; k < 97; k++) {
      const ring = k ? 1 + Math.floor((k - 1) / 16) : 0;
      const a = (k % 16) / 16 * Math.PI * 2 + hash(i + 53) * 0.36;
      const radius = ring * 5.5, sx = x + Math.cos(a) * radius, sz = z + Math.sin(a) * radius;
      if (radius > bestDistance + 0.01) break;
      if (isSand(sx, sz)) { best = { x: sx, y: floor(sx, sz), z: sz }; bestDistance = radius; }
    }
    return best;
  }
  function place(i: number, x: number, y: number, z: number) {
    const s = states[i], a = anchorNear(x, z, 16);
    s.mode = 'swim'; s.burial = 0; s.peck = 0; s.weight = 0;
    s.x = x; s.y = y; s.z = z; s.support = null; s.supportAt = undefined; s.feedingOnLeaf = false;
    if (grazer) {
      let distance = 10 * 10;
      for (const leaf of leaves) {
        const d = (leaf.pos.x - x) ** 2 + (leaf.pos.z - z) ** 2;
        if (d < distance) { distance = d; s.supportAt = leaf.supportAt; }
      }
      if (s.supportAt) { s.support = s.supportAt(0).pos; s.feedingOnLeaf = true; }
    }
    if (grazer && a && !s.support) {
      // Algal-coated rocky substrate around an actual holdfast, rather than a bite
      // at a guessed mid-water leaf position (the leaves sway on the GPU).
      const angle = hash(i + 109) * Math.PI * 2, radius = 0.8 + hash(i + 401) * 0.7;
      const sx = a.x + Math.cos(angle) * radius, sz = a.z + Math.sin(angle) * radius;
      if (T.reef(sx, sz) > 0.4) s.support = { x: sx, y: Math.max(floor(sx, sz), T.top(sx, sz)), z: sz };
    }
    s.sand = senorita ? sandNear(x, z, i) : null;
  }
  function update(i: number, dt: number, t: number, act: number, danger: boolean, p: Point, size: number) {
    const s = states[i]; s.weight = 0; s.peck = 0;
    const awake = act > 0.45 || danger;
    if (senorita && s.sand) {
      const bed = s.sand;
      if (awake && s.mode !== 'swim' && s.mode !== 'forage') s.mode = s.burial > 0 ? 'wake' : 'swim';
      if (!awake && act < 0.3 && (s.mode === 'swim' || s.mode === 'forage')) s.mode = 'seek-sand';
      if (s.mode === 'seek-sand' || s.mode === 'bury' || s.mode === 'sleep' || s.mode === 'wake') {
        s.weight = 1; s.x = bed.x; s.z = bed.z;
        const near = hyp(p.x - bed.x, p.z - bed.z) < 0.15;
        if (s.mode === 'seek-sand' && near && Math.abs(p.y - bed.y - 0.2) < 0.09) s.mode = 'bury';
        if (s.mode === 'bury' && near) { s.burial = Math.min(1, s.burial + dt * 0.22); if (s.burial === 1) s.mode = 'sleep'; }
        if (s.mode === 'wake') { s.burial = Math.max(0, s.burial - dt * 0.8); if (s.burial === 0) s.mode = 'swim'; }
        // The head points upward while the tail disappears into verified sand.
        // Its exact angle and timing are animation choices, not measured field data.
        s.y = bed.y + 0.2 * (1 - s.burial) - size * 0.28 * s.burial;
        return s;
      }
    }
    s.mode = 'swim';
    if (grazer && s.support && act > 0.55 && !danger) {
      const cycle = (t + s.phase) % 39;
      s.weight = smooth(0, 2, cycle) * (1 - smooth(14, 18, cycle));
      if (s.supportAt && s.weight > 0) s.support = s.supportAt(t).pos;
      const a = s.support;
      s.x = a.x - (s.feedingOnLeaf ? Math.cos(s.heading) * size * 0.35 : 0);
      s.z = a.z - (s.feedingOnLeaf ? Math.sin(s.heading) * size * 0.35 : 0);
      const lift = s.feedingOnLeaf ? 0.085 : 0.25;
      const near = hyp(p.x - s.x, p.z - s.z) < 0.5 && Math.abs(p.y - a.y - lift) < 0.3;
      s.peck = near ? Math.pow(Math.max(0, Math.sin(t * 3.4 + s.phase)), 6) * s.weight : 0;
      s.y = a.y + lift - s.peck * (s.feedingOnLeaf ? 0.035 : 0.065);
      if (near && s.weight > 0.6) s.mode = 'forage';
    }
    return s;
  }
  function status() {
    if (!senorita) return undefined;
    const resting = states.filter(s => s.mode === 'sleep').length;
    if (resting > count / 2) return '砂に潜り、頭だけ出して休んでいる';
    if (states.some(s => s.mode === 'wake')) return '砂から出て泳ぎ始めている';
    if (states.some(s => s.mode === 'seek-sand' || s.mode === 'bury')) return '砂地へ移動して休むところ';
    if (states.some(s => s.mode === 'forage')) return '海藻の表面の小動物をついばんでいる';
    return undefined;
  }
  return { states, anchorNear, place, update, status, floor, isSand };
}
