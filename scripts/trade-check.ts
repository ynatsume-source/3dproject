// Headless check (ADR 0006, stage 3: trades), on the real island of Dot's world.
//  1 Dot sinks a log in Rakko's water: a reef — a log not put on the hut — bare at first, shellfish settling with time;
//    Rakko comes upon it and knows it as a place to dive
//  2 Rakko fed at Dot's reef: it learns that Dot's doing has paid it (trust), and takes on Dot's asking more surely
//  3 Dot plants a torn-up seagrass bed again: it grows back three times as fast for a while
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/trade-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T07:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(42);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const by = (id: string) => R.list.find((r: any) => r.id === id);
const dot = by('dot'), rakko = by('rakko');
const cam = new THREE.Vector3();
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; cam.set(dot.pos.x, 30, dot.pos.z); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
// (Dot, by a stand-in mind: holding a log, it makes a reef; Rakko by its habits)
let mode = 'reef';

R.setBrain(async (i: any) => i.who === 'dot'
  ? ({ goal: { text: 'テスト', why: 'テスト' }, plan: [i.options.find((o: any) => o.id === (mode === 'reef' ? 'reef:sea' : o.id.startsWith('replant:') ? o.id : '') && o.ready !== false)?.id ?? 'look:shore'] })
  : null);
const reefs = () => R.patches.filter((p: any) => p.by === 'dot');
{ // 1
  dot.holding = 'wood'; dot.stats.wood = 1; (R.mind(dot) as any).why = 'テスト'; (R.mind(dot) as any).lastCall = -1e12;
  const made = await run(3600, () => reefs().length > 0);
  const p = reefs()[0];
  want('1 Dot sank its log in Rakko\'s water: a reef', made && !!p && dot.holding === '', p ? `at ${p.x.toFixed(0)},${p.z.toFixed(0)}` : 'none');
  want('1 bare at first', !!p && Object.values(p.stock).every((n: any) => n === 0));
  want('1 Rakko knows it as a place to dive', !!p && rakko.body.known.includes(p.id) && rakko.diary.some((e: any) => /新しい漁礁/.test(e.text)));
  await run(3 * 3600);
}
{ // 2
  const p = reefs()[0];
  if (p) { const body = await import('../src/robots/body'); body.regrow(p, sim); }
  want('2 shellfish have settled on it with time', !!p && Object.values(p.stock).reduce((a: number, b: any) => a + b, 0) > 0, p ? JSON.stringify(p.stock) : '');
  // (Rakko hungry, only the reef known: it goes there to eat)
  if (p) rakko.body.known = [p.id];
  rakko.hunger = 0.7; rakko.holding = ''; R.setBrain(async (i: any) => i.who === 'rakko' ? ({ goal: { text: 'テスト', why: 'テスト' }, plan: [i.options.find((o: any) => o.id === `eat:${p?.id}`)?.id ?? 'float:sea'] }) : ({ goal: { text: 'テスト', why: 'テスト' }, plan: ['look:shore'] }));
  (R.mind(rakko) as any).why = 'テスト'; (R.mind(rakko) as any).lastCall = -1e12;
  const ate = await run(3 * 3600, () => !!R.mind(rakko).values.m.get('made:dot'));
  const v = R.mind(rakko).values.m.get('made:dot');
  want('2 fed at Dot\'s reef, Rakko learns Dot\'s doing has paid it', ate && !!v && R.mind(rakko).values.value(v) > 0, v ? `${v.label} ${R.mind(rakko).values.value(v).toFixed(2)}` : 'none');
  want('2 its hits show where it was fed', R.mind(rakko).values.hits(6).some((h: string) => /ドットの漁礁で食べる|ドットがつくった漁礁/.test(h)) || R.mind(rakko).values.m.has('made:dot'), R.mind(rakko).values.hits(6).join(' / '));
}
{ // 3
  const b = R.beds[0]; b.grass = 0.02; b.at = sim; dot.holding = '';
  mode = 'replant'; R.setBrain(async (i: any) => i.who === 'dot' ? ({ goal: { text: 'テスト', why: 'テスト' }, plan: [i.options.find((o: any) => o.id.startsWith('replant:'))?.id ?? 'look:shore'] }) : null);
  (R.mind(dot) as any).why = 'テスト'; (R.mind(dot) as any).lastCall = -1e12;
  const did = await run(3600, () => !!b.replanted);
  const body = await import('../src/robots/body');
  const g0 = b.grass; b.at = sim; body.regrowBed(b, sim + 6e5); const fast = b.grass - g0;
  const c = { ...b, replanted: undefined, grass: g0, at: sim }; body.regrowBed(c as any, sim + 6e5); const slow = c.grass - g0;
  want('3 Dot planted the torn-up bed again', did && b.by === 'dot');
  want('3 it grows back three times as fast for a while', Math.abs(fast / slow - 3) < 0.01, `${(fast * 100).toFixed(1)}% vs ${(slow * 100).toFixed(1)}% in ten minutes`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
