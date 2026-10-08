// Dot's house (the owner's dwelling theme, 2026-10-07: docs/proposals/sumika-2026-10-07.md §2). Built the way the old
// houses of the Yaeyama islands were, with little more than an axe: earth-fast posts, a frame lashed with rope (no
// joints, no nails), corner braces against the wind, a hipped roof at about 45° thatched with cogon grass from the eaves
// up, with deep eaves; then walls of a woven bamboo lattice daubed with clay (bamboo and clay from the island to the
// south), a raised bamboo floor to rest on, and a corner for Lantern's work.
//
// This file is the house as a thing: its steps in order, what each needs, how it looks as it goes up, and what it keeps
// off. Who builds it, and when, is residents.ts.
import * as THREE from 'three';

export type HouseNeed = 'piece' | 'grass' | 'bamboo' | 'clay';
export interface HouseStep { kind: 'post' | 'beam' | 'brace' | 'rafter' | 'thatch' | 'wattle' | 'daub' | 'floor' | 'desk'; need: HouseNeed; rope: number; act: 'dig' | 'work' | 'hammer'; ja: string }
// (rope in metres; bamboo in poles and clay in kg, below)
export const HOUSE_BAMBOO = 8, HOUSE_CLAY = 150;
const S = (kind: HouseStep['kind'], n: number, need: HouseNeed, rope: number, act: HouseStep['act'], ja: string): HouseStep[] => Array.from({ length: n }, () => ({ kind, need, rope, act, ja }));
export const HOUSE_STEPS: HouseStep[] = [
  ...S('post', 6, 'piece', 0, 'dig', '家の柱を立てた（深さ60cmの穴に、焦がした根元を埋めて石と土で突き固めた）'),
  ...S('beam', 6, 'piece', 3, 'work', '家の桁と梁を柱の上に縄で縛った'),
  ...S('brace', 4, 'piece', 2, 'work', '家の隅に筋交いを縛った（横からの風で傾かないように）'),
  ...S('rafter', 8, 'piece', 2, 'work', '寄棟の垂木を縛った'),
  ...S('thatch', 8, 'grass', 4, 'work', '茅を束ねて、軒から重ねて葺いた'),
  ...S('wattle', 4, 'bamboo', 4, 'work', '柱の間に竹を格子に編んで、壁の下地にした'),
  ...S('daub', 4, 'clay', 0, 'work', '粘土に砂と刻んだ草を混ぜて練り、下地の両側から塗った'),
  ...S('floor', 1, 'bamboo', 4, 'work', '竹を並べて、地面から上げた寝床を作った'),
  ...S('desk', 1, 'piece', 0, 'hammer', 'ランタンの研究の場所に台を作った'),
];
export const HOUSE_N = HOUSE_STEPS.length;
export const stepsBefore = (kind: HouseStep['kind']) => HOUSE_STEPS.findIndex((s) => s.kind === kind);
const ROOF_DONE = stepsBefore('wattle'), WALLS_DONE = stepsBefore('floor');
export type HouseLevel = 'none' | 'frame' | 'roof' | 'house';
/** How far it has come: 'roof' once every course of thatch has been laid, 'house' once the walls are daubed (a course
 *  blown off since does not undo either: it lets rain in, below). */
export function houseLevel(n: number, _lost = 0): HouseLevel {
  if (n >= WALLS_DONE) return 'house';
  if (n >= ROOF_DONE) return 'roof';
  return n > 0 ? 'frame' : 'none';
}
/** What it keeps off, inside (1 lets all of it through): a whole roof all the rain and half the wind; walls the wind too,
 *  and most of a typhoon (the proposal's table, §1). Each course of thatch blown off lets an eighth of the rain in, and a
 *  little more of a typhoon. A stone wall, later, all but all of a typhoon. */
export function houseCover(level: HouseLevel, lost = 0, stoneWall = false): { rain: number; wind: number; storm: number } {
  const leak = Math.min(1, lost / 8);
  if (level === 'house') return { rain: leak, wind: 0, storm: (stoneWall ? 0.02 : 0.1) + 0.05 * lost };
  if (level === 'roof') return { rain: leak, wind: 0.5, storm: 0.6 };
  return { rain: 1, wind: 1, storm: 1 };
}

// its size: about 2.7 m by 3.6 m (one and a half ken by two), eaves at 2 m, a 45° hipped roof
export const HW = 1.35, HD = 1.8, EAVE = 2.1, OVER = 0.5;
const RIDGE_Y = EAVE + HW, RIDGE_Z = HD - HW;   // (45°: the hips meet at the half-width's height; the ridge is the rest of the depth)

export interface HouseLook { group: THREE.Group; parts: THREE.Object3D[]; posts: [number, number][]; wallDots: [number, number][][]; door: [number, number]; inside: [number, number] }
// (mk: the island's own lit material, as the residents' are — the scene has no lights for a standard one)
export function makeHouseLook(mats: { wood: THREE.Material; wood2: THREE.Material; mk: (hex: number, spec: number, both?: boolean) => THREE.Material }): HouseLook {
  const group = new THREE.Group(), parts: THREE.Object3D[] = [];
  const straws = [0xa88f55, 0x9a8250, 0xb09858].map((c) => mats.mk(c, 0.05, true));
  const bamboo = mats.mk(0xa8b060, 0.2);
  const clay = mats.mk(0x9a7b5a, 0.05);
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
    const d = b.clone().sub(a), l = d.length(), mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, l, 7), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return mesh;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const posts: [number, number][] = [];
  for (const sx of [-1, 1]) for (const z of [-HD, 0, HD]) posts.push([sx * HW, z]);
  // posts (a little below the ground: it is not quite level)
  for (const [x, z] of posts) parts.push(rod(V(x, -0.35, z), V(x, EAVE + 0.05, z), 0.07, mats.wood2));
  // the wall plates along each side, ties across the ends and the middle, and the ridge on two short king posts
  parts.push(rod(V(-HW, EAVE - 0.04, -HD - 0.05), V(-HW, EAVE - 0.04, HD + 0.05), 0.06, mats.wood));
  parts.push(rod(V(HW, EAVE - 0.04, -HD - 0.05), V(HW, EAVE - 0.04, HD + 0.05), 0.06, mats.wood));
  for (const z of [-HD, 0, HD]) parts.push(rod(V(-HW - 0.05, EAVE + 0.04, z), V(HW + 0.05, EAVE + 0.04, z), 0.055, mats.wood));
  { const g = new THREE.Group(); g.add(rod(V(0, RIDGE_Y, -RIDGE_Z), V(0, RIDGE_Y, RIDGE_Z), 0.05, mats.wood)); for (const z of [-RIDGE_Z, RIDGE_Z]) g.add(rod(V(0, EAVE + 0.04, z), V(0, RIDGE_Y, z), 0.04, mats.wood2)); parts.push(g); }
  // braces: one in each corner of the long walls
  for (const [x, z, s] of [[-HW, -HD, 1], [HW, -HD, 1], [-HW, HD, -1], [HW, HD, -1]] as number[][]) parts.push(rod(V(x, EAVE - 0.9, z), V(x, EAVE - 0.05, z + s * 0.85), 0.035, mats.wood));
  // rafters: the four hips, then one down the middle of each side (all out past the walls to the eaves)
  const eave = (x: number, z: number) => { const k = OVER / HW; return V(x * (1 + k), EAVE - OVER, z + Math.sign(z) * OVER * (Math.abs(z) > 0.01 ? 1 : 0)); };
  for (const [x, z] of [[-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]]) parts.push(rod(eave(x, z), V(0, RIDGE_Y, Math.sign(z) * RIDGE_Z), 0.035, mats.wood));
  parts.push(rod(V(-HW - OVER, EAVE - OVER, 0), V(0, RIDGE_Y, 0), 0.035, mats.wood), rod(V(HW + OVER, EAVE - OVER, 0), V(0, RIDGE_Y, 0), 0.035, mats.wood));
  parts.push(rod(V(0, EAVE - OVER, -HD - OVER), V(0, RIDGE_Y, -RIDGE_Z), 0.035, mats.wood), rod(V(0, EAVE - OVER, HD + OVER), V(0, RIDGE_Y, RIDGE_Z), 0.035, mats.wood));
  // thatch: eight courses from the eaves to the ridge, each a band round all four faces, a hand's thickness, each
  // laid over the one below it
  const ex = HW + OVER, ez = HD + OVER, ye = EAVE - OVER;
  const ring = (s: number, lift: number) => {
    const hx = ex * (1 - s), hz = ez + (RIDGE_Z - ez) * s, y = ye + (RIDGE_Y - ye) * s + lift;
    return [V(-hx, y, -hz), V(hx, y, -hz), V(hx, y, hz), V(-hx, y, hz)];
  };
  for (let k = 0; k < 8; k++) {
    const s0 = Math.max(0, k / 8 - 0.03), s1 = Math.min(1, (k + 1) / 8);
    const a = ring(s0, 0.1), b = ring(s1, 0.22), pos: number[] = [];
    const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, t: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z, p.x, p.y, p.z, r.x, r.y, r.z, t.x, t.y, t.z);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(a[i], a[j], b[j], b[i]); }
    // (the lower edge of each course, cut square: its thickness shows)
    const lip = ring(s0 - 0.015, -0.06); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(lip[i], lip[j], a[j], a[i]); }
    if (k === 7) { const top = ring(1, 0.3); quad(b[0], b[1], top[1], top[0]); quad(b[2], b[3], top[3], top[2]); quad(b[1], b[2], top[2], top[1]); quad(b[3], b[0], top[0], top[3]); }   // (the ridge capped)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    parts.push(new THREE.Mesh(g, straws[k % 3]));
  }
  // the walls: a bamboo lattice on each side (the front, +z, has its door), then clay over it
  const DOOR = 0.45, DOOR_H = 1.45;
  const sides: { a: [number, number]; b: [number, number]; door: boolean }[] = [
    { a: [-HW, -HD], b: [HW, -HD], door: false }, { a: [HW, -HD], b: [HW, HD], door: false },
    { a: [HW, HD], b: [-HW, HD], door: true }, { a: [-HW, HD], b: [-HW, -HD], door: false },
  ];
  const inDoor = (side: typeof sides[0], t: number, len: number) => side.door && Math.abs(t * len - len / 2) < DOOR;
  for (const side of sides) {
    const g = new THREE.Group(), [ax, az] = side.a, [bx, bz] = side.b, len = Math.hypot(bx - ax, bz - az);
    for (let t = 0.06; t < 0.97; t += 0.07) if (!inDoor(side, t, len)) g.add(rod(V(ax + (bx - ax) * t, 0, az + (bz - az) * t), V(ax + (bx - ax) * t, EAVE - 0.05, az + (bz - az) * t), 0.012, bamboo));
    for (let y = 0.25; y < EAVE; y += 0.28) {
      if (side.door && y < DOOR_H) { const m = len / 2 - DOOR; for (const [t0, t1] of [[0, m / len], [1 - m / len, 1]]) g.add(rod(V(ax + (bx - ax) * t0, y, az + (bz - az) * t0), V(ax + (bx - ax) * t1, y, az + (bz - az) * t1), 0.012, bamboo)); }
      else g.add(rod(V(ax, y, az), V(bx, y, bz), 0.012, bamboo));
    }
    parts.push(g);
  }
  for (const side of sides) {
    const g = new THREE.Group(), [ax, az] = side.a, [bx, bz] = side.b, len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    const slab = (t0: number, t1: number, y0: number, y1: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry((t1 - t0) * len, y1 - y0, 0.07), clay);
      const t = (t0 + t1) / 2; m.position.set(ax + (bx - ax) * t, (y0 + y1) / 2, az + (bz - az) * t); m.rotation.y = -ang; g.add(m);
    };
    if (side.door) { const m = (len / 2 - DOOR) / len; slab(0, m, -0.1, EAVE); slab(1 - m, 1, -0.1, EAVE); slab(m, 1 - m, DOOR_H, EAVE); }
    else slab(0, 1, -0.1, EAVE);
    parts.push(g);
  }
  // a raised bamboo floor to rest on, at the back; a work table in the front corner for Lantern
  { const g = new THREE.Group(); for (let k = 0; k < 16; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), bamboo); m.rotation.z = Math.PI / 2; m.position.set(0, 0.32, -HD + 0.2 + k * 0.085); g.add(m); }
    for (const [x, z] of [[-1.1, -1.6], [1.1, -1.6], [-1.1, -0.35], [1.1, -0.35]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), mats.wood2); l.position.set(x, 0.12, z); g.add(l); }
    parts.push(g); }
  { const g = new THREE.Group(), top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.5), mats.wood); top.position.set(-HW + 0.55, 0.75, HD - 0.5); g.add(top);
    for (const [x, z] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6), mats.wood2); l.position.set(-HW + 0.55 + x, 0.37, HD - 0.5 + z); g.add(l); }
    parts.push(g); }
  if (parts.length !== HOUSE_N) throw new Error(`house: ${parts.length} parts for ${HOUSE_N} steps`);
  for (const p of parts) { p.visible = false; group.add(p); }
  // where the walls stand (for what cannot be walked through: a row of short stretches, the doorway left open)
  const wallDots = sides.map((side) => { const [ax, az] = side.a, [bx, bz] = side.b, len = Math.hypot(bx - ax, bz - az), out: [number, number][] = []; for (let t = 0.1; t < 0.95; t += 0.3 / len) if (!(side.door && Math.abs(t * len - len / 2) < DOOR + 0.12)) out.push([ax + (bx - ax) * t, az + (bz - az) * t]); return out; });
  return { group, parts, posts, wallDots, door: [0, HD + 0.7], inside: [0.5, 0.5] };
}
/** Under the roof's eaves (local coordinates): where a roof without walls keeps the rain off. */
export const underHouseRoof = (x: number, z: number) => Math.abs(x) < HW + 0.4 && Math.abs(z) < HD + 0.4;
/** Inside the walls (local coordinates). */
export const HOUSE_JA: Record<HouseStep['kind'], string> = { post: '柱を立てる', beam: '桁と梁を縛る', brace: '筋交いを縛る', rafter: '垂木を縛る', thatch: '茅を葺く', wattle: '竹で壁の下地を編む', daub: '土壁を塗る', floor: '竹の床を張る', desk: 'ランタンの研究の台を作る' };
export const insideHouse = (x: number, z: number) => Math.abs(x) < HW - 0.1 && Math.abs(z) < HD - 0.1;
