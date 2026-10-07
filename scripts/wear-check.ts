// Headless check (dwelling theme, step 1: docs/proposals/sumika-2026-10-07.md) — the world's rules on wear and a rough
// sea, on controlled ground (sea west of x = 0 and east of x = 300, land between) and made-up weather.
//  1 a robot out in the rain wears (in proportion to the rain), and notes it past 0.3; in the dry it dries
//  2 worn past 0.3 it is slower (walking and working); past 0.6 its battery runs down faster
//  3 a typhoon out in the open: worn past 0.9 it can hardly move — its task is let go; with no roof it rests where it is
//     until it has dried to 0.6, then moves again (noted both times); with a roof near, it creeps to it at a tenth of its
//     pace (owner, 2026-10-07: never quite still)
//  4 under the hut's roof: half the rain; it dries faster there; a worn robot in the rain goes in under it
//  5 the animals: a rough sea makes them hungrier than a calm one
//  6 the wear is kept across a reload; the robot's mind is told it
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/wear-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { ISLAND_RATE } from '../src/world/island-time';

let now = Date.parse('2026-10-03T01:00:00Z');   // (10:00 at the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const wx = (o: any = {}) => ({ ok: true, at: now, cloud: 0.5, rain: 0, code: 1, wind: 3, windDir: 90, gust: 5, pressure: 1010, typhoon: false, source: 'test', record: { station: 't', at: '' }, rainMeasured: 0, windMeasured: 3, wave: 0.5, thunder: false, ...o });
function island(keep = false) {
  if (!keep) store.clear();
  now = Date.parse('2026-10-03T01:00:00Z'); Math.random = mulberry32(31);
  const f = (x: number) => (x < 0 || x > 300 ? -3 : 2), T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(null);
  const by = (id: string) => R.list.find((r: any) => r.id === id);
  return { R, dot: by('dot'), lantern: by('lantern'), rakko: by('rakko'), kame: by('kame') };
}
const hold = (r: any, x = 150, z = 0) => { r.pos.set(x, 2, z); r.task = { kind: 'wander', x, z, act: 'idle', dur: 1e9, t: 0, arrived: true }; };
// seconds of real time for an island hour
const HOUR = 3600 / ISLAND_RATE;
function run(R: any, secs: number, w: any, until?: () => boolean) {
  for (let i = 0; i < secs; i++) { now += 1000; R.setWeather(w); R.update(1, now, new THREE.Vector3(0, 50, 0)); if (until?.()) return true; }
  return false;
}
const lines = (r: any) => r.diary.filter((e: any) => e.key === 'wear').map((e: any) => e.text);

{ // 1 rain wears, in proportion; dry weather dries it
  const { R, lantern } = island(); hold(lantern); lantern.wear = 0;
  run(R, Math.round(2 * HOUR), wx({ rain: 5, rainMeasured: 5 }));
  const w5 = lantern.wear;
  lantern.wear = 0; run(R, Math.round(2 * HOUR), wx({ rain: 10, rainMeasured: 10 }));
  const w10 = lantern.wear;
  want('1 rain wears it, in proportion to the rain', w5 > 0.08 && w5 < 0.12 && Math.abs(w10 / w5 - 2) < 0.15, `5mm/h 2h → ${w5.toFixed(3)}, 10mm/h → ${w10.toFixed(3)}`);
  lantern.wear = 0; lantern.wearLv = 0;
  run(R, Math.round(4 * HOUR), wx({ rain: 10, rainMeasured: 10 }));
  want('1 past 0.3 it notes it', lines(lantern).some((t: string) => /雨に打たれて関節が重くなってきた/.test(t)), lines(lantern).slice(-1)[0] ?? 'none');
  const wd = lantern.wear; run(R, Math.round(2 * HOUR), wx());
  want('1 in the dry it dries (outdoors, slowly)', Math.abs((wd - lantern.wear) - 0.04) < 0.006, `${wd.toFixed(3)} → ${lantern.wear.toFixed(3)}`);
}
let v0 = 0;
{ // 2 slower walking and working; battery faster
  const walkTime = (wear: number) => {
    const { R, dot } = island(); hold(dot, 100, 0); dot.wear = wear; dot.wearLv = wear > 0.6 ? 2 : wear > 0.3 ? 1 : 0;
    dot.task = { kind: 'wander', x: 160, z: 0, act: 'idle', dur: 1e9, t: 0, arrived: false };
    let t = 0; for (; t < 400 && !dot.task?.arrived; t++) { now += 1000; R.setWeather(wx()); R.update(1, now, new THREE.Vector3(0, 50, 0)); }
    return t;
  };
  const t0 = walkTime(0), t7 = walkTime(0.75); v0 = 60 / t0;
  want('2 worn past 0.3 it walks slower', t7 > t0 * 1.4, `${t0}s fresh, ${t7}s at 0.75`);
  const drainAt = (wear: number) => {
    const { R, dot } = island(); hold(dot); dot.wear = wear; dot.wearLv = 2; dot.battery = 0.8;
    now = Date.parse('2026-10-03T13:00:00Z');   // (22:00: no sun to charge it)
    dot.task = { kind: 'craft', x: 150, z: 0, act: 'work', dur: 1e9, t: 0, arrived: true };
    for (let i = 0; i < 600; i++) { now += 1000; R.setWeather(wx()); R.update(1, now, new THREE.Vector3(0, 50, 0)); dot.task = dot.task ?? null; }
    return { used: 0.8 - dot.battery, t: dot.task?.t ?? 0 };
  };
  const a = drainAt(0), b = drainAt(0.75);
  want('2 past 0.6 its battery runs down faster', b.used > a.used * 1.3, `${a.used.toFixed(4)} → ${b.used.toFixed(4)}`);
}
{ // 3 a typhoon: stuck, still, then moving again once dried
  const { R, lantern } = island(); hold(lantern); lantern.wear = 0.5; lantern.wearLv = 1;
  const typhoon = wx({ typhoon: true, rain: 12, rainMeasured: 12, wind: 22, windMeasured: 22, wave: 6 });
  const got = run(R, Math.round(8 * HOUR), typhoon, () => !!lantern.stuck);
  want('3 out in a typhoon it is worn past 0.9 and can hardly move', got && lines(lantern).some((t: string) => /ほとんど動けなくなった。その場で乾くのを待つ/.test(t)), `${lantern.wear.toFixed(2)}, ${lines(lantern).slice(-1)[0]}`);
  const x0 = lantern.pos.x, z0 = lantern.pos.z;
  run(R, 300, wx({ rain: 3, rainMeasured: 3 }));
  want('3 no roof: it rests where it is, its task let go', !!lantern.stuck && lantern.task?.kind === 'shelter' && lantern.task.data?.worn && Math.hypot(lantern.pos.x - x0, lantern.pos.z - z0) < 0.3, `stuck ${lantern.stuck}, task ${lantern.task?.kind ?? 'none'}`);
  const free = run(R, Math.round(30 * HOUR), wx(), () => !lantern.stuck);
  want('3 dried to 0.6, it moves again', free && lantern.wear < 0.6 && lines(lantern).some((t: string) => /また動けるようになった/.test(t)), `${lantern.wear.toFixed(2)}`);
}
{ // 4 the hut's roof
  const { R, dot } = island();
  dot.stats.built = 24; const H = R.list.find((r: any) => r.id === 'dot');
  const hut = (R as any).group.children.find((g: any) => g.children?.length >= 24 && g.children.slice(0, 24).every((m: any) => m.isMesh));
  const hx = hut?.position.x ?? 0, hz = hut?.position.z ?? 0;
  hold(H, hx, hz); H.wear = 0;
  run(R, Math.round(2 * HOUR), wx({ rain: 5, rainMeasured: 5 }));
  want('4 under the roof, half the rain', !!hut && Math.abs(H.wear - 0.05) < 0.008, `${H.wear.toFixed(3)} (outdoors ≈0.10)`);
  H.wear = 0.4; hold(H, hx, hz); run(R, Math.round(2 * HOUR), wx());
  want('4 it dries faster under the roof', Math.abs((0.4 - H.wear) - 0.1) < 0.01, `0.40 → ${H.wear.toFixed(3)}`);
  // (worn past 0.9, dry weather: it creeps to the roof at a tenth of its pace)
  { const far = hut.localToWorld(new THREE.Vector3(0, 0, -25)); hold(H, far.x, far.z); }
  H.wear = 0.95; H.wearLv = 3; H.stuck = true; H.task = null; H.battery = 1;
  run(R, 2, wx()); const p0 = H.pos.clone(); run(R, 60, wx());
  const v = H.pos.distanceTo(p0) / 60;
  want('4 worn past 0.9, a roof near: it creeps to it at about a tenth of its pace', H.task?.kind === 'shelter' && H.task.data?.worn && v > v0 * 0.06 && v < v0 * 0.16, `${(v / v0 * 100).toFixed(0)}% of its pace`);
  hold(H, hx + 20, hz + 5); H.wear = 0.45; H.wearLv = 1; H.stuck = false;
  const went = run(R, 300, wx({ rain: 4, rainMeasured: 4 }), () => H.task?.kind === 'shelter' && H.task.arrived);
  want('4 worn, in the rain, it goes in under the roof', went && Math.hypot(H.pos.x - hx, H.pos.z - hz) < 1.3, `${H.task?.kind} ${Math.hypot(H.pos.x - hx, H.pos.z - hz).toFixed(2)} m`);
}
{ // 5 a rough sea makes the animals hungrier
  const hungerIn = (wave: number, typhoon = false) => {
    const { R, rakko } = island();
    rakko.pos.set(-60, -3, -60); rakko.wet = true; rakko.hunger = 0.2; rakko.sleepy = 0.1;
    rakko.task = { kind: 'float', x: -60, z: -60, act: 'float', dur: 1e9, t: 0, arrived: true, wet: true };
    const h0 = rakko.hunger; run(R, 300, wx({ wave, typhoon }));
    return rakko.hunger - h0;
  };
  const calm = hungerIn(0.5), rough = hungerIn(4);
  want('5 a rough sea makes it hungrier', rough > calm * 1.5, `${(rough / calm).toFixed(2)}x`);
}
{ // 6 kept across a reload; told to its mind
  const { R, lantern } = island(); hold(lantern); lantern.wear = 0.42; lantern.wearLv = 1;
  R.save();
  const b = island(true);
  want('6 the wear is kept across a reload', Math.abs(b.lantern.wear - 0.42) < 0.02 && b.lantern.wearLv === 1, `${b.lantern.wear?.toFixed(2)}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
