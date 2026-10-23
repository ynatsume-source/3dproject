// Headless check (the night beach's crabs, their lives: eco/crabs.ts, eco/crab-host.ts; night sight 2, CRABS.md; ADR 0009
// for the coconut crab's hideouts). On the residents' island as built:
//  1 the burrows: dry sand above the high water (BURROW_H), one to a crab, never two within 5 m; the coconut crabs' holes
//    at the root of a pandanus
//  2 none out by day (the burrows' mouths still there); out after dark, from their own burrows and back into them
//  3 a light near sends a crab down its burrow, and it stays down while the light is there; up again a while after
//  4 fewer out on a cold night than a warm one; the coconut crab climbing its own trunk, on it
//  5 no draw of the island's random numbers (Math.random), building or living; the same night twice is the same night;
//    a jump in time puts each back in its hole
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/crabs-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const { makeCrabLife, crabKeen, BURROW_H } = await import('../src/eco/crabs');
const { makeCrabHost, darkAround } = await import('../src/eco/crab-host');
const { sun } = await import('../src/time/astro');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const oc: any = buildOcean(loc);

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const T = oc.T, home: [number, number] = oc.residents.list.find((r: any) => r.id === 'dot').sp.home;
const world = {
  ground: (x: number, z: number) => loc.f(x, z),
  sandy: (x: number, z: number) => { const c = T.landCover(x, z); return c.sand > 0.5 && c.can < 0.3; },
  home,
  trunks: (x: number, z: number, rad: number) => { const out: any[] = []; oc.shore.trunks(x, z, rad, (t: any) => out.push(t)); return out; },
};
let draws = 0; const keep = Math.random; const counting = () => { Math.random = () => { draws++; return keep(); }; };
counting();
const life = makeCrabLife(world), host = makeCrabHost(loc, T, oc.shore, home, new THREE.Group());
Math.random = keep;
const cam = new THREE.Vector3(home[0], 2, home[1]);
const night = (ms: number) => { const d = darkAround(ms, loc.lat, loc.lon); return d && { key: String(d[0]), dark: d }; };
const midnight = Date.parse('2026-10-06T23:30:00+09:00'), noon = Date.parse('2026-10-06T12:00:00+09:00');

{ // 1
  const g = life.ghosts(), c = life.coconuts();
  const hs = g.map((b) => loc.f(b.x, b.z)), gap = Math.min(...g.flatMap((a, i) => g.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
  want('1 ghost crabs\' burrows found', g.length >= 8, g.length);
  want('1 each above the high water, below the dunes\' grass', hs.every((h) => h >= BURROW_H[0] && h <= BURROW_H[1]), `${Math.min(...hs).toFixed(2)}–${Math.max(...hs).toFixed(2)} m`);
  want('1 each on open sand', g.every((b) => world.sandy(b.x, b.z)));
  want('1 never two within 5 m', gap >= 5, `${gap.toFixed(1)} m`);
  const tr = world.trunks(home[0], home[1], 90).filter((t) => t.kind === 'pandanus');
  const foot = c.map((h) => Math.min(...tr.map((t) => Math.hypot(t.base.x - h.x, t.base.z - h.z))));
  want('1 two coconut crabs, each at a pandanus root', c.length === 2 && foot.every((d) => d < 0.5), foot.map((d) => d.toFixed(2)).join(' '));
  want('1 the same burrows built again', JSON.stringify(makeCrabLife(world).ghosts()) === JSON.stringify(g));
}
{ // 2
  want('2 no dark at noon; dark at midnight, the sun six degrees down at its ends', night(noon) === null && !!night(midnight)
    && sun(night(midnight)!.dark[0], loc.lat, loc.lon).alt < -6 * Math.PI / 180, new Date(night(midnight)!.dark[0]).toISOString().slice(11, 16) + '–' + new Date(night(midnight)!.dark[1]).toISOString().slice(11, 16) + ' UTC');
  const L = makeCrabLife(world); let outByDay = 0;
  for (let t = noon; t < noon + 3600e3; t += 500) { L.update(0.5, t, night(t), 1, []); outByDay += L.poses(cam).crabs.length; }
  want('2 none out by day', outByDay === 0, outByDay);
  { const B = L.poses(cam).burrows;   // (the ghost crabs' burrows and the coconut crabs' dens, all there by day: ways in and out)
    want('2 the burrows\' mouths there by day', B.filter((b) => b.kind !== 'coconut').length === L.ghosts().length, B.length);
    want('2 the coconut crabs\' dens there by day, at their holes', B.filter((b) => b.kind === 'coconut').length === L.coconuts().length && L.coconuts().every((c) => B.some((b) => b.kind === 'coconut' && b.x === c.x && b.z === c.z)), B.filter((b) => b.kind === 'coconut').length); }
  // (a warm night, all of it: who comes up, from where, and whether each is back in by its end)
  const n = night(midnight)!, M = makeCrabLife(world); let most = 0, offHome = 0, coconutOut = 0, climbing = 0, onTrunkOk = true;
  const seen = new Set<string>();
  for (let t = n.dark[0]; t <= n.dark[1] + 600e3; t += 500) {
    M.update(0.5, t, night(t), 1, []);
    const P = M.poses(cam).crabs; most = Math.max(most, P.filter((c) => c.kind === 'ghost').length);
    for (const c of P) {
      seen.add(c.id);
      const s = M.state(c.id)!;
      if (s.mode === 'up' && Math.hypot(c.x - s.bx, c.z - s.bz) > 0.01) offHome++;   // (out of nothing: never)
      if (c.kind === 'coconut') coconutOut++;
      if (c.on) { climbing++; if (c.y < loc.f(c.x, c.z) + 0.02) onTrunkOk = false; }
    }
  }
  want('2 out after dark (most ghost crabs up at once)', most >= 3, most);
  want('2 each comes up out of its own burrow', offHome === 0, offHome);
  want('2 a coconut crab out in the night', coconutOut > 0, `${(coconutOut / 2 / 60).toFixed(0)} crab-min`);
  want('2 all back in by the night\'s end', M.poses(cam).crabs.length === 0, M.poses(cam).crabs.length);
  want('4 the coconut crab climbs its trunk, up off the ground', climbing > 0 && onTrunkOk, `${(climbing / 2 / 60).toFixed(1)} min`);
}
{ // 3
  const n = night(midnight)!, L = makeCrabLife(world); let t = n.dark[0] + 2 * 3600e3, id = '';
  for (let k = 0; k < 7200 && !id; k++, t += 500) { L.update(0.5, t, night(t), 1, []); id = L.poses(cam).crabs.find((c) => c.kind === 'ghost' && L.state(c.id)!.mode === 'out')?.id ?? ''; }
  want('3 a ghost crab out', !!id, id);
  const c0 = L.state(id)!, lamp = [{ x: c0.x + 2, z: c0.z, r: 2.5 }];
  let downAt = -1, upWhileLit = 0;
  for (let s = 0; s < 120; s += 0.5, t += 500) { L.update(0.5, t, night(t), 1, lamp); const m = L.state(id)!.mode; if (m === 'in' && downAt < 0) downAt = s; if (downAt >= 0 && m !== 'in') upWhileLit++; }
  want('3 a light near: down its burrow, quickly', downAt >= 0 && downAt < 15, `${downAt} s`);
  want('3 stays down while the light is there', upWhileLit === 0, upWhileLit);
  let upAt = -1;
  for (let s = 0; s < 600 && upAt < 0; s += 0.5, t += 500) { L.update(0.5, t, night(t), 1, []); if (L.state(id)!.mode !== 'in') upAt = s; }
  want('3 up again, a while after the light has gone', upAt >= 20, `${upAt} s`);
}
{ // 4
  want('4 keen: warm 1, cold less, cold and wet less still', crabKeen(26, 0) === 1 && crabKeen(16, 0) < 0.5 && crabKeen(16, 6) < crabKeen(16, 0), [crabKeen(26, 0), crabKeen(16, 0).toFixed(2), crabKeen(16, 6).toFixed(2)].join(' '));
  const count = (keen: number) => { let up = 0; for (let d = 0; d < 20; d++) { const ms = midnight + d * 86400e3, n = night(ms)!, L = makeCrabLife(world); const seen = new Set<string>(); for (let t = n.dark[0]; t < n.dark[1]; t += 60e3) { L.update(1, t, n, keen, []); L.update(30, t + 1, n, keen, []); for (const c of L.poses(cam).crabs) seen.add(c.id); } up += seen.size; } return up; };
  const warm = count(1), cold = count(crabKeen(16, 0));
  want('4 fewer out on cold nights (20 nights)', cold < warm * 0.6, `${cold} against ${warm}`);
}
{ // 5
  const run = () => { const L = makeCrabLife(world), n = night(midnight)!, out: string[] = []; for (let t = n.dark[0]; t < n.dark[0] + 2 * 3600e3; t += 500) { L.update(0.5, t, night(t), 0.8, t % 600e3 < 30e3 ? [{ x: home[0], z: home[1] + 20, r: 3 }] : []); if (t % 60e3 === 0) out.push(JSON.stringify(L.poses(cam))); } return out.join(''); };
  draws = 0; counting(); const a = run(); host.update(0.5, midnight, cam); host.update(0.5, midnight + 500, cam); Math.random = keep;
  want('5 no draw of Math.random, building or living', draws === 0, draws);
  want('5 the same night twice is the same night', a === run());
  const L = makeCrabLife(world), n = night(midnight)!; let t = n.dark[0] + 3600e3;
  for (let k = 0; k < 2400; k++, t += 500) L.update(0.5, t, night(t), 1, []);
  const before = L.poses(cam).crabs.length; L.update(3600, t + 3600e3, night(t + 3600e3), 1, []);
  want('5 a jump in time: each back in its hole', L.ghosts().every((g) => L.state(g.id)!.mode !== 'out') && L.coconuts().every((g) => L.state(g.id)!.up === 0), `${before} out before`);
}
console.log(bad ? `FAIL ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
