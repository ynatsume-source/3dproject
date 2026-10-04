// Headless check (Kayama review A1): a resident's body does not go through what is solid (robots/solids.ts).
// The real makeResidents() on controlled ground (flat, dry; or 2 m of water), one resident sent somewhere with
// solids in the way, stepped at 20 Hz; every frame, how far its body overlaps any solid. Cases from the review
// (NAVIGATION_REVIEW.md N1–N3, N5) plus the approach to something solid and to the workbench.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/nav-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids, type Solid } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';

let now = Date.parse('2026-10-03T08:00:00Z');   // (17:00 at the island: all awake, not yet the evening fire)
Date.now = () => now;
Math.random = mulberry32(2601003);
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });

let bad = 0;
function trial(name: string, o: { id?: string; water?: boolean; solids?: Solid[]; target?: [number, number]; reef?: (x: number, z: number) => number; push?: (p: THREE.Vector3) => void; seconds?: number; start?: [number, number];
  want: (r: any, res: { arrived: boolean; abandoned: boolean; worst: number; worstY: number }) => boolean; what: string }) {
  store.clear(); now = Date.parse('2026-10-03T08:00:00Z'); Math.random = mulberry32(2601003);
  const f = o.water ? () => -2 : () => 2;
  const T: any = { ground: f, floor: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  T.top = (x: number, z: number) => Math.max(f(), o.reef ? o.reef(x, z) : -1e9);
  if (o.push) T.pushTrees = o.push;
  for (const s of o.solids ?? []) T.solids.add(s);
  const R = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f }, T, ['テスト魚'], ['テスト鳥']);
  const r: any = R.list.find((x) => x.id === (o.id ?? 'dot'))!;
  R.list.forEach((x: any, i: number) => { x.pos.set(1000 + i * 100, 2, 1000); x.task = { kind: 'wander', x: x.pos.x, z: x.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; });
  r.pos.set(o.start?.[0] ?? 0, o.water ? -1 : 2, o.start?.[1] ?? 0); r.head = Math.PI / 2; r.wet = !!o.water; r.battery = 1;
  const [tx, tz] = o.target ?? [12, 0];
  r.task = { kind: 'wander', x: tx, z: tz, act: 'idle', dur: 1e9, t: 0, arrived: false, wet: !!o.water };
  const first = r.task;
  let arrived = false, abandoned = false, worst = 0, worstY = -Infinity;
  for (let i = 0; i < (o.seconds ?? 60) * 20; i++) {
    now += 50; R.update(0.05, now, new THREE.Vector3(0, 6, 0));
    const B = R.body(r), fy = r.wet ? r.pos.y : 2;
    T.solids.each(r.pos.x, r.pos.z, 3, (s: Solid) => { if (s.y1 > fy + B.step && s.y0 < fy + B.y1) worst = Math.max(worst, s.r + B.r - Math.hypot(s.x - r.pos.x, s.z - r.pos.z)); });
    if (o.reef) worstY = Math.max(worstY, o.reef(r.pos.x, r.pos.z) - r.pos.y);
    if (r.task !== first) { abandoned = true; break; }
    if (r.task.arrived) { arrived = true; break; }
  }
  const res = { arrived, abandoned, worst, worstY }, ok = o.want(r, res);
  if (!ok) bad++;
  console.log(`${name} (${r.id}): ${arrived ? 'arrived' : abandoned ? `gave up (${r.went ?? '?'})` : 'still going'} at (${r.pos.x.toFixed(2)}, ${r.pos.z.toFixed(2)}), deepest into a solid ${Math.max(0, worst).toFixed(3)} m${o.reef ? `, lowest under a coral top ${Math.max(0, worstY).toFixed(2)} m` : ''} — want ${o.what} ${ok ? 'ok' : 'FAIL'}`);
  return { R, r, T };
}
const rock = (x: number, z: number, r: number, h = 2): Solid => ({ kind: 'rock', x, z, r, y0: 1.7, y1: 2 + h });
const clear = 0.02;   // (overlap allowed: a step's rounding)
trial('long way round a rock', { solids: [rock(6, 0, 2)], want: (r, s) => s.arrived && s.worst < clear, what: 'round it, arrived' });
trial('short last leg past a rock', { target: [1.8, 0], solids: [rock(0.9, 0, 0.3)], seconds: 15, want: (r, s) => s.arrived && s.worst < clear, what: 'round it, arrived' });
{
  const wall: Solid[] = []; for (let z = -60; z <= 60; z += 0.5) wall.push(rock(5.5, z, 0.5));
  trial('a wall with no way through', { solids: wall, seconds: 30, want: (r, s) => s.abandoned && s.worst < clear && (r.went === 'no way' || r.went === 'blocked'), what: 'gives up, not through it' });
}
trial('sent into the middle of a rock', { target: [12, 0], solids: [rock(12, 0, 1)], want: (r, s) => s.arrived && s.worst < clear && Math.hypot(r.pos.x - 12, r.pos.z) > 1, what: 'stands just outside it' });
trial('past a driftwood log, low enough to step over', { solids: [{ kind: 'driftwood', x: 6, z: 0, r: 0.12, y0: 1.7, y1: 2.15 }], id: 'lantern', want: (r, s) => s.arrived, what: 'steps over, arrived' });
trial('swimming past a coral head', { id: 'kame', water: true, reef: (x, z) => (x > 5 && x < 6 && Math.abs(z) < 2 ? -0.6 : -1e9), want: (r, s) => s.arrived && s.worstY < 0, what: 'over it, arrived' });
trial('pushed back by a trunk, again and again', { push: (p) => { if (p.x > 3) p.x = 3; }, seconds: 40, want: (r, s) => s.abandoned, what: 'gives up' });
{
  // the workbench by Dot's hut: sent to its middle, Dot stands at it
  const { R, r, T } = trial('(setting up the homestead)', { target: [0, 0], seconds: 1, want: () => true, what: '-' });
  let bench: Solid | null = null; T.solids.each(r.sp.home[0], r.sp.home[1], 12, (s: Solid) => { if (s.kind === 'bench' && (!bench || s.r > bench.r)) bench = s; });
  if (!bench) { console.log('no workbench found FAIL'); bad++; }
  else {
    const b: Solid = bench;
    trial('to the workbench', { target: [b.x, b.z], start: [b.x + 8, b.z + 6], seconds: 60, want: (r2, s) => s.arrived && s.worst < clear, what: 'arrived beside it' });
    void R;
  }
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
