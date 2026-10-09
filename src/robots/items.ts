// Things lying about the island that the residents gather: driftwood washed up along the beaches (Dot
// builds with it), shells on the sand at the water's edge (Rakko keeps the pretty ones) and stones on the
// open ground (Lantern stacks them into cairns). New ones wash up or turn up over time; what is picked up
// is gone from where it lay. They are part of the island's state and are saved with it. Coconuts fall at the top of the
// beach (Lantern takes them to the shelf: the world makes them a lot there — ADR 0006, owner's decision 2026-10-06).
import * as THREE from 'three';

export type ItemKind = 'wood' | 'shell' | 'stone' | 'coconut';
const KINDS: ItemKind[] = ['wood', 'shell', 'stone', 'coconut'];
export interface Item { id: number; kind: ItemKind; x: number; z: number; ry: number; s: number; by?: string; away?: Record<string, number> }   // (away: until when one who could not get to it leaves it be)
type Spot = (near: [number, number], rad: number, ok: (x: number, z: number, h: number) => boolean, tries?: number) => [number, number] | null;
interface Where { near: [number, number]; rad: number; ok: (x: number, z: number, h: number) => boolean; max: number; every: number }

// The things' shapes: soft and rounded, smooth to the touch (owner's request 2026-10-09,
// docs/proposals/nature-look-2026-10-09) — the same sizes as before (a resident carries them), smooth normals, few
// triangles. Each shape from fixed numbers, never Math.random (that would shift where things wash up).
function geoOf(P: number[], I: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
// a smooth tube along x through a gentle curve, radius by rad(t), its ends rounded over (`cap`: how far)
function lathe(P: number[], I: number[], len: number, rad: (t: number) => number, at: (t: number) => [number, number], seg: number, rings: number, cap = 0.5) {
  const st = P.length / 3;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, [cy, cz] = at(t), r = rad(t), x = (t - 0.5) * len;
    for (let j = 0; j < seg; j++) { const an = j / seg * Math.PI * 2; P.push(x, cy + Math.cos(an) * r, cz + Math.sin(an) * r); }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = st + i * seg + j, b = st + i * seg + (j + 1) % seg; I.push(a, b, a + seg, b, b + seg, a + seg); }
  for (const [t, base, sg] of [[0, st, -1], [1, st + rings * seg, 1]] as [number, number, number][]) {
    const [cy, cz] = at(t), tip = P.length / 3; P.push((t - 0.5) * len + sg * rad(t) * cap, cy, cz);
    for (let j = 0; j < seg; j++) { if (sg < 0) I.push(base + (j + 1) % seg, base + j, tip); else I.push(base + j, base + (j + 1) % seg, tip); }
  }
}
// a piece of driftwood (0.8 m): a bleached, smooth, slightly crooked log, rounded at the ends, with the stub of a branch
export function driftwoodGeo() {
  const P: number[] = [], I: number[] = [];
  lathe(P, I, 0.8, (t) => 0.043 - 0.012 * t + 0.004 * Math.sin(t * 9), (t) => [0.0, 0.05 * Math.sin(t * Math.PI) * 0.6 + 0.012 * Math.sin(t * 7)], 8, 6, 0.7);
  // the stub, angled up and back, rounded off
  const st = P.length / 3, P2: number[] = [], I2: number[] = [];
  lathe(P2, I2, 0.13, (t) => 0.02 - 0.006 * t, () => [0, 0], 6, 1, 0.8);
  const c = Math.cos(0.9), s = Math.sin(0.9);
  for (let k = 0; k < P2.length; k += 3) { const x = P2[k], y = P2[k + 1]; P.push(0.1 + x * c - y * s + 0.05, 0.03 + x * s + y * c, P2[k + 2] + 0.01); }
  for (const i of I2) I.push(st + i);
  return geoOf(P, I);
}
// a shell (about 10 cm): a top shell, its rounded whorls swelling one over the next to the point, lying on its side
export function shellGeo() {
  const P: number[] = [], I: number[] = [];
  const whorl = (t: number) => { const f = (t * 3.2) % 1; return 0.82 + 0.18 * Math.sin(f * Math.PI); };
  lathe(P, I, 0.1, (t) => Math.max(0.004, 0.034 * Math.pow(1 - t, 0.85) * whorl(t) + 0.004), (t) => [0.03 * Math.pow(1 - t, 0.85) - 0.004 * t, 0], 9, 9, 0.6);
  return geoOf(P, I);
}
// a stone (about 26 cm): a smooth, flattened pebble, a little lopsided
export function stoneGeo() {
  const g0 = new THREE.IcosahedronGeometry(1, 2); g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
  const P = Array.from(g0.attributes.position.array as Float32Array), I: number[] = [];
  // (the icosahedron comes unindexed: weld its corners so the pebble is smooth)
  const key = new Map<string, number>(), Q: number[] = [];
  for (let k = 0; k < P.length / 3; k++) {
    const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2], id = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let i = key.get(id);
    if (i === undefined) {
      const l = Math.hypot(x, y, z), nx = x / l, ny = y / l, nz = z / l, lump = 1 + 0.06 * Math.sin(nx * 2.3 + 1.1) * Math.sin(nz * 2.1 + 0.4) + 0.04 * Math.sin(ny * 3 + 2);
      i = Q.length / 3; key.set(id, i); Q.push(nx * 0.13 * lump, (ny < 0 ? ny * 0.06 : ny * 0.085) * lump, nz * 0.11 * lump);
    }
    I.push(i);
  }
  g0.dispose();
  return geoOf(Q, I);
}
// a coconut in its husk (about 29 cm): a smooth oval, a little three-sided, coming to a blunt point at one end
export function coconutGeo() {
  const P: number[] = [], I: number[] = [];
  const st = 0, seg = 12, rings = 10;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, x = (t - 0.5) * 0.29, r0 = 0.112 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.02)), 0.62) * (1 - 0.18 * t * t);
    for (let j = 0; j < seg; j++) { const an = j / seg * Math.PI * 2, r = r0 * (1 + 0.06 * Math.cos(an * 3)); P.push(x, 0.1 + Math.cos(an) * r * 0.92, Math.sin(an) * r); }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = st + i * seg + j, b = st + i * seg + (j + 1) % seg; I.push(a, b, a + seg, b, b + seg, a + seg); }
  for (const [x, base, sg] of [[-0.148, 0, -1], [0.15, rings * seg, 1]] as [number, number, number][]) { const tip = P.length / 3; P.push(x, 0.1, 0); for (let j = 0; j < seg; j++) { if (sg < 0) I.push(base + (j + 1) % seg, base + j, tip); else I.push(base + j, base + (j + 1) % seg, tip); } }
  const g = geoOf(P, I); g.translate(0, -0.1, 0);
  return g;
}

export function makeItems(h: (x: number, z: number) => number, spot: Spot, where: Record<ItemKind, Where>, mats: Record<ItemKind, THREE.Material>, group: THREE.Group) {
  const GEO: Record<ItemKind, THREE.BufferGeometry> = { wood: driftwoodGeo(), shell: shellGeo(), stone: stoneGeo(), coconut: coconutGeo() };
  const MAX = 64;
  const mesh = {} as Record<ItemKind, THREE.InstancedMesh>;
  for (const k of KINDS) { const m = new THREE.InstancedMesh(GEO[k], mats[k], MAX); m.count = 0; m.frustumCulled = false; group.add(m); mesh[k] = m; }
  let list: Item[] = [], next = 1, dirty = true;
  const since: Record<ItemKind, number> = { wood: 0, shell: 0, stone: 0, coconut: 0 };

  function add(kind: ItemKind): Item | null {
    const w = where[kind], at = spot(w.near, w.rad, w.ok, 60);
    if (!at) return null;
    const it: Item = { id: next++, kind, x: at[0], z: at[1], ry: Math.random() * 6.28, s: 0.8 + Math.random() * 0.45 };
    list.push(it); dirty = true;
    return it;
  }
  const count = (kind: ItemKind) => list.reduce((n, it) => n + (it.kind === kind ? 1 : 0), 0);
  function fill() { for (const k of KINDS) { const w = where[k]; for (let i = count(k); i < w.max; i++) add(k); } }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function draw() {
    const n: Record<ItemKind, number> = { wood: 0, shell: 0, stone: 0, coconut: 0 };
    for (const it of list) {
      if (n[it.kind] >= MAX) continue;
      const lift = it.kind === 'wood' ? 0.03 : it.kind === 'stone' ? 0.05 : it.kind === 'coconut' ? 0.1 : 0.005;
      _p.set(it.x, h(it.x, it.z) + lift * it.s, it.z);
      _q.setFromEuler(_e.set(it.kind === 'wood' ? Math.sin(it.id) * 0.1 : 0, it.ry, 0));
      _s.setScalar(it.s);
      mesh[it.kind].setMatrixAt(n[it.kind]++, _m.compose(_p, _q, _s));
    }
    for (const k of KINDS) { mesh[k].count = n[k]; mesh[k].instanceMatrix.needsUpdate = true; }
    dirty = false;
  }

  return {
    get list() { return list; },
    geo: GEO,
    // the nearest one not already spoken for, nor one it could not get to a little while ago
    nearest(kind: ItemKind, x: number, z: number, maxD: number, who: string, now = Date.now()): Item | null {
      let best: Item | null = null, bd = maxD;
      for (const it of list) {
        if (it.kind !== kind || (it.by && it.by !== who) || (it.away?.[who] ?? 0) > now) continue;
        const d = Math.hypot(it.x - x, it.z - z);
        if (d < bd) { bd = d; best = it; }
      }
      return best;
    },
    // something dropped here (a felled tree's logs)
    addAt(kind: ItemKind, x: number, z: number) { list.push({ id: next++, kind, x, z, ry: Math.random() * 6.28, s: 0.9 + Math.random() * 0.3 }); dirty = true; },
    claim(it: Item, who: string) { it.by = who; },
    release(who: string) { for (const it of list) if (it.by === who) it.by = undefined; },
    take(it: Item) { const i = list.indexOf(it); if (i < 0) return false; list.splice(i, 1); dirty = true; return true; },
    has(it: Item) { return list.includes(it); },
    // the sea brings more driftwood and shells now and then; stones turn up as the ground is walked
    tick(dt: number) {
      for (const k of KINDS) {
        since[k] += dt;
        if (since[k] > where[k].every) { since[k] = 0; if (count(k) < where[k].max) add(k); }
      }
      if (dirty) draw();
    },
    save: () => list.map((it) => [it.kind, +it.x.toFixed(2), +it.z.toFixed(2), +it.ry.toFixed(2), +it.s.toFixed(2)]),
    load(saved: any[] | undefined) {
      if (saved) list = saved.map((a) => ({ id: next++, kind: a[0], x: a[1], z: a[2], ry: a[3], s: a[4] }));   // (what was picked up stays gone)
      if (saved && !count('coconut')) for (let i = 0; i < where.coconut.max; i++) add('coconut');   // (an island saved before coconuts were counted)
      else fill();                                                                                               // a new island: things lying about already
      draw();
    },
  };
}
export type Items = ReturnType<typeof makeItems>;
