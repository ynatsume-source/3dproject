// Kamemaru up the beach and back (rehearsal finding R-020: at the water's edge its height jumped, again and again — 30-55
// cm in one frame where it went from dry to wet and from walking to swimming; placeY now has it crawl in water shallower
// than it is tall and rise as it deepens, science team 2026-10-26). On the island as built, for the sea as drawn and as the
// residents have it — the same at the year's lowest water, mean sea level and the year's highest (-1.04, 0, +0.91 m), and
// apart (drawn 0, theirs +0.3 and -0.3; drawn +0.91, theirs +0.6) — it is set in water a metre deep off its home shore,
// sent up the beach to bask, then back into the sea. Along the straight line from its home to the open sea (the one that
// meets ground a metre under mean sea level soonest), the points are found from the residents' sea: the sea point 4 m
// beyond the first water a metre deep, the land point 3 m inland of the last ground 0.3 m over the water. Every frame (1/30 s): its height, the ground, wet or not, what it is doing.
// Want, each way: it crosses the edge (wet to dry going up, dry to wet coming back); no change of height over 5 cm in one
// frame (the first seven left out: it was just set down there); never under the ground (2 cm allowed).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/kame-shore-check.ts
import './node-land';
import * as THREE from 'three';
let sim = Date.parse('2026-12-04T12:00:00+09:00'); Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD; await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const { setSeaLevel } = await import('../src/ocean/air');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const cam = new THREE.Vector3(0, 50, 0), dt = 1 / 30, f = (x: number, z: number) => loc.f(x, z);
const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
let fail = 0;
for (const [drawn, theirs] of [[-1.04, -1.04], [0, 0], [0.91, 0.91], [0, 0.3], [0, -0.3], [0.91, 0.6]]) {
  setSeaLevel(drawn);
  const oc: any = buildOcean(loc), R: any = oc.residents, T = oc.T; R.setBrain(null);
  R.setSeaAt(() => theirs);
  const top = (x: number, z: number) => theirs * (T.tideK ? T.tideK(x, z) : 1);   // (the residents' water's top, as placeY reads it)
  const k = R.list.find((r: any) => r.id === 'kame'), [hx, hz] = k.sp.home;
  // (the way to the open sea: the straight line out from its home that meets ground a metre under mean sea level
  // soonest — the same line whatever the water; along it, the water a metre deep for this sea)
  let best: [number, number, number] | null = null;
  for (let a = 0; a < 6.283; a += 0.02) {
    const ux = Math.cos(a), uz = Math.sin(a);
    for (let d = 1; d < 250 && (!best || d < best[2]); d += 0.5) if (f(hx + ux * d, hz + uz * d) < -1) { best = [ux, uz, d]; break; }
  }
  const [ux, uz] = best!, at = (d: number): [number, number] => [hx + ux * d, hz + uz * d];
  let deep = 1; while (deep < 250 && f(...at(deep)) >= top(...at(deep)) - 1) deep += 0.5;
  let dry = deep; while (dry > 0 && f(...at(dry)) <= top(...at(dry)) + 0.3) dry -= 0.25;
  const sea = at(deep + 4), land = at(Math.max(0, dry - 3));
  const where = `sea drawn ${fmt(drawn)} m, theirs ${fmt(theirs)} m`;
  console.log(`${where}: water a metre deep ${deep} m from home; sea point ground ${fmt(f(...sea))} (water ${fmt(top(...sea))}), land point ground ${fmt(f(...land))}`);
  for (const [from, to, way] of [[sea, land, 'up the beach'], [land, sea, 'back into the sea']] as const) {
    const up = way === 'up the beach', kind = up ? 'bask' : 'swim';
    let rows: { t: number; y: number; g: number; wet: boolean; act: string; under: number }[] = [], driven = false;
    // (its own walk there; where that finds no way — the way-finding is not what is tried here — it is led along the line
    // instead, at its own pace, swimming where it is wet: the same frames for placeY)
    for (const lead of [false, true]) {
      k.pos.x = from[0]; k.pos.z = from[1]; k.path = undefined; k.under = 0; k.wet = up; k.act = up ? 'swim' : 'walk'; k.mo.lift = undefined; k.mo.recheck = 0; (k.mo as any).lastPlan = undefined; k.went = undefined;
      k.task = lead ? { kind: 'led', x: from[0], z: from[1], act: k.act, dur: 1e9, t: 0, arrived: true } : { kind, x: to[0], z: to[1], act: kind, dur: 600, t: 0, arrived: false, wet: !up };
      rows = []; driven = lead;
      let lost = false;
      for (let i = 0; i < 400 / dt; i++) {
        if (lead) {
          const dx = to[0] - k.pos.x, dz = to[1] - k.pos.z, d = Math.hypot(dx, dz); if (d < 0.5) break;
          const v = Math.min(d, (k.wet ? k.sp.swimSpeed : k.sp.speed) * dt); k.pos.x += dx / d * v; k.pos.z += dz / d * v;
          k.task = { kind: 'led', x: k.pos.x, z: k.pos.z, act: k.wet ? 'swim' : 'walk', dur: 1e9, t: 0, arrived: true };
        } else if (!k.task?.arrived && (k.went === 'no way' || k.task?.kind !== kind)) { lost = true; break; }
        else if (k.task?.arrived) break;
        sim += dt * 1000; R.update(dt, sim, cam);
        rows.push({ t: i * dt, y: k.pos.y, g: f(k.pos.x, k.pos.z), wet: !!k.wet, act: k.act, under: +(k.under ?? 0) });
      }
      if (!lost) break;
    }
    let worst = 0, at = -1, low = Infinity; const jumps: number[] = [];
    for (let i = 7; i < rows.length; i++) {   // (the first seven frames: it was just set down there)
      const d = Math.abs(rows[i].y - rows[i - 1].y); if (d > worst) { worst = d; at = i; } if (d > 0.05) jumps.push(i);
      low = Math.min(low, rows[i].y - rows[i].g);
    }
    const crossed = rows.some((r, i) => i && rows[i - 1].wet === up && r.wet !== up);
    const ok = crossed && worst <= 0.05 && low >= -0.02;
    if (!ok) fail++;
    const acts = [...new Set(rows.map((r) => r.act))].join('/');
    console.log(`  ${way}: ${rows.length} frames, ${driven ? 'led along the line (its own walk found no way)' : k.task?.arrived ? 'arrived' : 'not arrived'}; ${crossed ? 'crossed the edge' : 'DID NOT cross the edge'}; biggest change of height in one frame ${(worst * 100).toFixed(1)} cm, ${jumps.length} over 5 cm; lowest ${(low * 100).toFixed(1)} cm from the ground; ${acts} — ${ok ? 'PASS' : 'FAIL'}`);
    for (const i of jumps.slice(0, 3)) for (const j of [i - 1, i]) { const r = rows[j]; console.log(`     t ${r.t.toFixed(2)} s  y ${r.y.toFixed(3)}  ground ${r.g.toFixed(3)}  ${r.wet ? 'wet' : 'dry'}  ${r.act}  under ${r.under.toFixed(2)}`); }
  }
}
setSeaLevel(0);
process.exit(fail ? 1 : 0);
