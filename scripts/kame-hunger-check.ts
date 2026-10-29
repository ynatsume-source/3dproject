// Headless check (science, reviews/188-8bf9d1e kame-none.log: after a 40-hour typhoon the seagrass beds were all at 0.35
// and Kamemaru, past 0.95 hungry, lay still for an hour and a half to two and a half, again and again through every day,
// and never went to eat — resting does not fill it). On the real island of Dot's world, its habits alone, a morning after
// such a storm:
//  1 so hungry it cannot go on: it hauls out and lies still — once
//  2 then, still past the mark, it goes to graze (not to lie still again), at a bed grown back as it reaches it
//  3 within twelve hours it is no longer hungry past what slows it (under 0.8)
// and an evening, the beds grown back, Kamemaru at 0.5 (science, kame-fix.log: the night adds near half):
//  4 it grazes before it sleeps, goes to sleep under 0.4, and wakes the next morning not past the mark
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/kame-hunger-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-08T08:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(13);
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
const kame = R.list.find((r: any) => r.id === 'kame'), cam = new THREE.Vector3();
R.setBrain(null);
R.setWeather({ ok: true, at: 0, cloud: 0.3, rain: 0, code: 2, wind: 4, windDir: 90, gust: 6, pressure: 1010, typhoon: false, source: 'test', record: { station: 'test', at: '' } });
// (the storm just passed: every bed torn to 0.35, Kamemaru past the mark)
for (const b of R.beds) { b.grass = 0.35; b.at = sim; }
kame.hunger = 0.97; kame.sleepy = 0.2; kame.task = null;
const kinds: string[] = [];
let under = 0;
for (let i = 0; i < 12 * 3600; i++) {
  sim += 1000; cam.set(kame.pos.x, 30, kame.pos.z); R.update(1, sim, cam);
  const k = kame.task?.kind; if (k && kinds.at(-1) !== k) kinds.push(k);
  if (!under && kame.hunger < 0.8) under = sim;
  if (i % 60 === 0) await Promise.resolve();
}
const stuck = kame.diary.filter((e: any) => /動けなくなった/.test(e.text)).length, rest1 = kinds.indexOf('rest'), graze = kinds.indexOf('graze', Math.max(0, rest1));
want('1 so hungry it cannot go on: it lies still — once', stuck === 1 && rest1 >= 0, `${stuck} times; ${kinds.slice(0, 8).join(' → ')}`);
want('2 then it goes to graze, still hungry past the mark', graze > rest1 && !kinds.slice(rest1 + 1, graze).includes('rest'), kinds.slice(rest1, graze + 1).join(' → '));
want('3 within twelve hours no longer hungry past what slows it', under > 0 && kame.hunger < 0.8, `hunger ${kame.hunger.toFixed(2)}; under 0.8 at ${under ? ((under - Date.parse('2026-10-08T08:00:00+09:00')) / 3.6e6).toFixed(1) + ' h' : 'never'}`);
{ // 4
  sim = Date.parse('2026-10-09T18:30:00+09:00');
  for (const b of R.beds) { b.grass = 1; b.at = sim; }
  kame.hunger = 0.5; kame.sleepy = 0.3; kame.task = null;
  const ev: string[] = []; let atSleep = -1;
  const morning = Date.parse('2026-10-10T07:00:00+09:00');
  while (sim < morning) {
    sim += 1000; cam.set(kame.pos.x, 30, kame.pos.z); R.update(1, sim, cam);
    const k = kame.task?.kind; if (k && ev.at(-1) !== k) { ev.push(k); if (k === 'sleep' && atSleep < 0) atSleep = kame.hunger; }
    if ((sim / 1000) % 60 === 0) await Promise.resolve();
  }
  const g = ev.indexOf('graze'), s = ev.indexOf('sleep');
  want('4 in the evening it grazes before it sleeps, sleeps under 0.4, wakes not past the mark', g >= 0 && g < s && atSleep >= 0 && atSleep < 0.4 && kame.hunger < 0.95,
    `${ev.slice(0, 6).join(' → ')}; at sleep ${atSleep.toFixed(2)}; at 07:00 ${kame.hunger.toFixed(2)}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
