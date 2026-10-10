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

// a piece of driftwood: a bleached, slightly crooked log with the stub of a branch
export function driftwoodGeo() {
  const g = new THREE.CylinderGeometry(0.042, 0.032, 0.8, 7, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y / 0.4;
    p.setX(i, p.getX(i) + 0.05 * (1 - k * k) + Math.sin(i * 1.7) * 0.004);
    p.setZ(i, p.getZ(i) + Math.sin(y * 7) * 0.012);
  }
  const stub = new THREE.CylinderGeometry(0.014, 0.022, 0.16, 5); stub.rotateZ(-0.9); stub.translate(0.1, 0.12, 0);
  const merged = mergeTwo(g, stub);
  merged.rotateZ(Math.PI / 2);   // lying along x
  merged.computeVertexNormals();
  return merged;
}
export function shellGeo() {
  const g = new THREE.SphereGeometry(0.05, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {   // ribbed, and flattened like a cockle
    const a = Math.atan2(p.getZ(i), p.getX(i));
    p.setY(i, p.getY(i) * 0.55 * (1 + 0.08 * Math.sin(a * 12)));
    p.setZ(i, p.getZ(i) * 1.25);
  }
  g.computeVertexNormals();
  return g;
}
export function stoneGeo() {
  const g = new THREE.DodecahedronGeometry(0.13, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.7 + Math.sin(i * 2.3) * 0.006);
  g.computeVertexNormals();
  return g;
}
// a coconut in its husk: a little longer than wide, three faint ridges
export function coconutGeo() {
  const g = new THREE.SphereGeometry(0.12, 12, 9);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, y);
    const k = 1 + 0.05 * Math.cos(a * 3);
    p.setXYZ(i, x * 1.22, y * 0.92 * k, z * 0.92 * k);
  }
  g.computeVertexNormals();
  return g;
}
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const A = a.toNonIndexed(), B = b.toNonIndexed(), out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const x = A.attributes[k] as THREE.BufferAttribute, y = B.attributes[k] as THREE.BufferAttribute;
    const arr = new Float32Array(x.array.length + y.array.length); arr.set(x.array as Float32Array); arr.set(y.array as Float32Array, x.array.length);
    out.setAttribute(k, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return out;
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
