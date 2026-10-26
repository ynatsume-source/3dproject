// Kamemaru up the beach and back (rehearsal finding R-020: at the water's edge its height jumped, again and again). On
// the island as built, at the sea's three heights (-1.04, 0, +0.91 m), it is set in the water off its home shore and
// sent up the beach to bask, then back into the sea; every frame (1/30 s) its height, the ground, the water's top, wet or
// not and what it is doing are kept, and the biggest change of height in one frame is looked for (the first fifth of a
// second left out: it was just set down there). A diagnostic for now: it prints the jumps over 5 cm with the frames
// either side, and asserts nothing. Found (2026-10-26): 30-55 cm in one frame where it goes from dry to wet and from
// walking to swimming — placeY's three heights (on the ground; wet and not swimming, 0.2 m under the top; swimming,
// 0.3 m over the bottom) do not meet at the water's edge. Wet counts from 5 cm over the top, so in that last strip the
// one 0.2 m under the top is in the ground (25 cm down for a frame, then 54 cm up).
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
const { setSeaLevel, waterTopAt } = await import('../src/ocean/air');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const cam = new THREE.Vector3(0, 50, 0), dt = 1 / 30;
for (const level of [-1.04, 0, 0.91]) {
  setSeaLevel(level);
  const oc: any = buildOcean(loc), R: any = oc.residents, T = oc.T; R.setBrain(null);
  if (level) R.setSeaAt(() => level);
  const k = R.list.find((r: any) => r.id === 'kame'), [hx, hz] = k.sp.home;
  // (the nearest beach to its home: ground 0.6 m over mean sea level, from the island's own land; the sea 25 m back
  // from it the way it came, the land 6 m on)
  const f = (x: number, z: number) => loc.f(x, z), wt = () => waterTopAt(k.pos.x, k.pos.z);
  let best: [number, number, number] | null = null;
  for (let a = 0; a < 6.283; a += 0.05) for (let d = 2; d < 200; d += 1) if (f(hx + Math.cos(a) * d, hz + Math.sin(a) * d) > 0.6) { if (!best || d < best[2]) best = [Math.cos(a), Math.sin(a), d]; break; }
  const [ux, uz, shore] = best!;
  const land: [number, number] = [hx + ux * (shore + 6), hz + uz * (shore + 6)], sea: [number, number] = [hx + ux * (shore - 25), hz + uz * (shore - 25)];
  console.log(`home ${hx},${hz} (ground ${f(hx, hz).toFixed(2)}); beach ${shore} m away; sea point ground ${f(...sea).toFixed(2)}, land point ${f(...land).toFixed(2)}`);
  for (const [from, to, what] of [[sea, land, 'up the beach'], [land, sea, 'back into the sea']] as const) {
    k.pos.x = from[0]; k.pos.z = from[1]; k.path = undefined;
    k.task = { kind: what === 'up the beach' ? 'bask' : 'swim', x: to[0], z: to[1], act: what === 'up the beach' ? 'bask' : 'swim', dur: 600, t: 0, arrived: false, wet: what !== 'up the beach' };
    const rows: { t: number; y: number; g: number; w: number; wet: boolean; act: string; under: number }[] = [];
    for (let i = 0; i < 300 / dt && !k.task?.arrived; i++) { sim += dt * 1000; R.update(dt, sim, cam); rows.push({ t: i * dt, y: k.pos.y, g: f(k.pos.x, k.pos.z), w: wt(), wet: !!k.wet, act: k.act, under: +(k.under ?? 0) }); }
    let worst = 0, at = -1; const jumps: number[] = [];
    for (let i = 7; i < rows.length; i++) {   // (the first fifth of a second: it was just set down there)
      const d = Math.abs(rows[i].y - rows[i - 1].y); if (d > worst) { worst = d; at = i; } if (d > 0.05) jumps.push(i); }
    const acts = [...new Set(rows.map((r) => r.act))].join('/'), flips = rows.filter((r, i) => i && r.wet !== rows[i - 1].wet).length;
    console.log(`   acts ${acts}; wet↔dry ${flips} times; height ${Math.min(...rows.map((r) => r.y)).toFixed(2)}..${Math.max(...rows.map((r) => r.y)).toFixed(2)} m`);
    console.log(`sea ${level >= 0 ? '+' : ''}${level.toFixed(2)} m, ${what}: ${rows.length} frames, ${k.task?.arrived ? 'arrived' : 'not arrived'}; biggest change of height in one frame ${(worst * 100).toFixed(1)} cm; ${jumps.length} frames over 5 cm`);
    for (const i of jumps.slice(0, 4)) for (const j of [i - 1, i]) { const r = rows[j]; console.log(`   t ${r.t.toFixed(2)} s  y ${r.y.toFixed(3)}  ground ${r.g.toFixed(3)}  water ${r.w.toFixed(3)}  ${r.wet ? 'wet' : 'dry'}  ${r.act}  under ${r.under.toFixed(2)}`); }
  }
}
setSeaLevel(0);
process.exit(0);
