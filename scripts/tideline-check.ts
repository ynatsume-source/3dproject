// Headless check (owner's watch, 2026-10-09: Dot a metre from a log at the water's edge, and it "could not get there"):
// on the real island, logs laid at the tideline in several places, Dot set down a step or two inland of each, and asked
// to pick it up — it does, every one. The logs lie lower than a walker stands (0.15–0.2 m): no way is planned to them,
// and the keep-off-the-water turn looked 2 m ahead, past the log, into the sea. LO=/HI= to try other heights.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/tideline-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(9);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const O: any = buildOcean(loc), R: any = O.residents;
const H = (x: number, z: number) => loc.f(x, z);   // (the ground the residents walk on: loc.f, as residents.ts L.h)
const dot = R.list.find((r: any) => r.id === 'dot'), items = R.items;
const cam = new THREE.Vector3();
const calm: any = { ok: true, at: 0, cloud: 0.2, rain: 0, rainMeasured: 0, code: 1, wind: 3, windMeasured: 3, windDir: 90, gust: 5, pressure: 1012, wave: 0.5, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; dot.battery = 1; dot.wear = 0; cam.set(dot.pos.x, 30, dot.pos.z); R.setWeather(calm); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
let target: any = null;
R.setBrain(async (i: any) => i.who === 'dot' && target ? { goal: { text: 'テスト', why: 'テスト' }, plan: [`gather:wood#${target.id}`] } : null);
const think = () => { const m = R.mind(dot); m.why = 'テスト'; m.lastCall = -1e12; };
// (places along the shore near home: a log on the wet sand just above the water, with the sea a metre or two beyond it)
const spots: [number, number, number, number][] = [];
const home = dot.sp.home;
for (let a = 0; a < 6.28 && spots.length < 5; a += 0.05) for (let d = 10; d < 160; d += 0.5) {
  const x = home[0] + Math.cos(a) * d, z = home[1] + Math.sin(a) * d, h = H(x, z);
  if (h > (Number(process.env.LO ?? 0.15)) && h < (Number(process.env.HI ?? 0.2)) && H(x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5) < 0.05) {   // (the sea a step and a half past it)
    const ix = x - Math.cos(a) * 1.2, iz = z - Math.sin(a) * 1.2;   // (Dot a step inland of it)
    if (H(ix, iz) > 0.3 && !spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 20)) spots.push([x, z, ix, iz]);
    break;
  }
}
let got = 0;
for (const [x, z, ix, iz] of spots) {
  items.addAt('wood', x, z); target = items.list[items.list.length - 1];
  dot.holding = ''; dot.task = null; dot.pos.x = ix; dot.pos.z = iz; dot.path = undefined; dot.goal = undefined;
  think();
  const ok = await run(240, () => dot.holding === 'wood');
  console.log(`  log at ${x.toFixed(1)},${z.toFixed(1)} (ground ${H(x, z).toFixed(2)} m): ${ok ? 'picked up' : `not — ${dot.diary.slice(-1)[0]?.text ?? ''}`}`);
  if (ok) got++;
  items.release?.('dot');
}
const okAll = spots.length >= 3 && got === spots.length;
console.log(`at the water's edge, a step away: picked up ${got}/${spots.length} ${okAll ? 'ok' : 'FAIL'}`);
console.log(okAll ? 'PASS' : 'FAIL (1)');
process.exit(okAll ? 0 : 1);
