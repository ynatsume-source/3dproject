// Headless check (living near each other — docs/proposals/sumika-2026-10-07.md 2.5), on the real island of Dot's world:
//  1 the world counts how far each comes to a gathering; with no house yet, nothing is proposed
//  2 the house has walls: at the morning gathering Lantern tells its daily walk and proposes to live near each other,
//    Dot agrees, and Lantern's home is the house; each animal there reckons for itself (the walk saved, the swim to its
//    food, a quiet place of its own) and says yes or no — written in its record with the numbers
//  3 Lantern sleeps in the house; the next gathering it comes from there, a short walk
//  4 kept in the save
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/settle-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T08:30:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(5);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { HOUSE_N } = await import('../src/robots/house');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const O: any = buildOcean(loc), R: any = O.residents;
R.setBrain(null);
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const by = (id: string) => R.list.find((r: any) => r.id === id), dot = by('dot'), ln = by('lantern'), V = R.village;
const cam = new THREE.Vector3();
const calm: any = { ok: true, at: 0, cloud: 0.2, rain: 0, rainMeasured: 0, code: 1, wind: 3, windMeasured: 3, windDir: 90, gust: 5, pressure: 1012, wave: 0.5, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
const keep = () => { for (const r of R.list) { if (r.sp.living) { r.hunger = Math.min(r.hunger, 0.3); r.sleepy = Math.min(r.sleepy, 0.3); } else { r.battery = 1; r.wear = 0; } } };
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; keep(); cam.set(ln.pos.x, 30, ln.pos.z); R.setWeather(calm); R.update(0.5, sim, cam); await Promise.resolve(); if (until?.()) return true; } return false; };
const to = async (iso: string, until?: () => boolean) => { const t = Date.parse(iso); return run(Math.max(0, (t - sim) / 1000), until); };
const near = (r: any, p: [number, number], d: number) => Math.hypot(r.pos.x - p[0], r.pos.z - p[1]) < d;
const said = (re: RegExp) => R.list.some((r: any) => r.diary.some((e: any) => re.test(e.text)));

{ // 1
  await to('2026-10-06T09:35:00+09:00');
  const w = Object.fromEntries(Object.entries(V.walks).map(([k, v]: any) => [k, v.join('/')]));
  want('1 how far each came to the gathering, counted', (V.walks.lantern?.length ?? 0) >= 1 && (V.walks.dot?.length ?? 0) >= 1, JSON.stringify(w));
  want('1 no house yet: nothing proposed', !V.settle && !said(/すみかを近くに移そう/));
}
{ // 2
  dot.stats.built = 24; V.house.n = HOUSE_N; V.house.lost = 0;
  V.walks.lantern = [380, 360];   // (as the last two gatherings counted it: from its old place)
  sim = Date.parse('2026-10-07T08:20:00+09:00');
  for (const r of R.list) { r.task = null; r.pos.x = r.sp.home[0]; r.pos.z = r.sp.home[1]; }   // (each where it lives)
  await to('2026-10-07T09:35:00+09:00', () => !!V.settle && Object.keys(V.settle.asked).length >= 2 && !R.list.some((r: any) => r.task?.kind === 'fire' && !V.settle.asked[r.id]));
  const st = V.settle, came = R.list.filter((r: any) => r.task?.kind === 'fire' || V.walks[r.id]?.length).map((r: any) => r.id);
  want('2 Lantern told its walk and proposed; Dot agreed; Lantern\'s home is the house', !!st && st.asked.lantern === 'yes' && st.asked.dot === 'yes' && !!st.homes.lantern && Math.hypot(ln.sp.home[0] - R.houseG.position.x, ln.sp.home[1] - R.houseG.position.z) < 2.5 && ln.diary.some((e: any) => /すみかを近くに移そうと提案した（毎日の道のり約\d+m）/.test(e.text)), JSON.stringify(st?.asked));
  for (const id of ['rakko', 'kame']) {
    const r = by(id), e = r.diary.find((x: any) => /すみかを近くに移そうと言われて数えた/.test(x.text));
    if (!st?.asked[id]) { console.log(`2 ${id}: not at the gathering (asked at a later one)`); continue; }
    const moved = st.asked[id] === 'yes';
    want(`2 ${id} reckoned for itself, and its home is where it said`, !!e && /道のりは1日約\d+m減り/.test(e.text) && (moved ? !!st.homes[id] && near({ pos: { x: r.sp.home[0], z: r.sp.home[1] } }, st.homes[id], 0.1) : !st.homes[id]), e?.text ?? 'none');
  }
  void came;
}
{ // 3
  const room = V.settle.homes.lantern as [number, number];
  const slept = await to('2026-10-07T13:00:00+09:00', () => ln.task?.kind === 'sleep' && ln.task.arrived && near(ln, room, 1.5));
  want('3 Lantern sleeps in the house', slept, `${Math.hypot(ln.pos.x - room[0], ln.pos.z - room[1]).toFixed(1)} m from its place, ${ln.task?.kind}`);
  // (the way back from the morning gathering: to its bed, now in the house — before, to its old place far off)
  const backs = (V.walks.lantern as number[]).slice(-1)[0];
  want('3 from the morning gathering it goes to its bed in the house: a short way back', backs < 40, `${backs} m (its walks: ${V.walks.lantern.join('/')})`);
}
{ // 4
  R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('"settle"')) ?? '{}');
  want('4 kept in the save', !!saved.village?.settle?.homes?.lantern && Object.keys(saved.village?.walks ?? {}).length >= 2);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
