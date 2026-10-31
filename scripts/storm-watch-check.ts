// Getting ready for a storm with no mind's help (science, specs/storm-prep-habit.md; owner's decision 2026-10-28). Headless,
// on controlled ground, the residents by habit:
//   A Kamemaru up and watching the sea, a long swell (9 s or more): it tells the one near it, getting ready begins from
//     then (by Kamemaru), and Dot hauls the raft up the beach — no gathering needed
//   B the morning gathering after it (within the two island days — 3.7 real hours), the swell gone down: Kamemaru still
//     tells of it, the getting ready is proposed, agreed and shared out — kept from the time it began, not begun again
//   C Kamemaru asleep, or ashore at rest: a long swell is not read
//   D a typhoon comes with no warning, Dot up and within 60 m of the raft: it hauls it up before it shelters, in a
//     hurry — a quarter of the pieces lost (not half), and not remembered as getting ready that paid
//   E the same, Dot farther off: the raft left on the beach loses half
//   F Kamemaru tells of a long swell with Dot out of earshot: getting ready begins for those who heard, not for Dot — it
//     does not haul the raft up (ADR 0004: it acts on what it knows; science on #188); the typhoon comes, Dot near the
//     raft, and it hauls it up in a hurry — and its diary says it did not know
//   G the getting ready over and no typhoon (a swell that was not one): the raft hauled up goes back down the beach, Dot's
//     diary says so; while the getting ready lasts, or in a typhoon, it stays up (science, reviews/195-5ccc3a5 stall2c.log)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/storm-watch-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';

let now = Date.parse('2026-10-03T06:00:00Z');   // (15:00 on the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const fair = { ok: true, at: 0, cloud: 0.3, rain: 0, code: 2, wind: 4, windDir: 90, gust: 6, pressure: 1010, typhoon: false, swell: 1.2, swellPeriod: 7, source: 'test', record: { station: 'test', at: '' } };
const longSwell = { ...fair, swell: 3.1, swellPeriod: 10 }, gale = { ...fair, cloud: 1, rain: 8, code: 65, wind: 18, gust: 30, pressure: 985, typhoon: true };

function island(seed: number, at = '2026-10-03T06:00:00Z') {
  store.clear(); now = Date.parse(at); Math.random = mulberry32(seed);
  const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  Math.random = mulberry32(seed * 7 + 1);
  R.setBrain(null);
  const by = (id: string) => R.list.find((r: any) => r.id === id);
  const dot = by('dot'), kame = by('kame');
  R.list.forEach((o: any, i: number) => { if (o !== dot && o !== kame) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
  dot.pos.set(61, 2, -145); dot.battery = 1; dot.task = null; dot.stats.built = 24;
  Object.assign(R.village.raft, { parts: 6, x: 58, z: -150, hauled: false });
  R.setWeather(fair);
  return { R, dot, kame, V: R.village };
}
const watching = (k: any) => { k.pos.set(70, 2, -150); k.task = { kind: 'watch', x: 70, z: -150, act: 'look', dur: 1e9, t: 0, arrived: true }; k.sleepy = 0.1; k.hunger = 0.1; };
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); if (until?.()) return true; }
  return false;
}
{ // A, B
  const { R, dot, kame, V } = island(41, '2026-10-02T22:00:00Z');   // (07:00 on the island)
  watching(kame); await run(R, 5);
  R.setWeather(longSwell); await run(R, 40, () => V.stormPrep > 0);
  const began = V.stormPrep;
  want('A a long swell read at sea: told to the one near, getting ready begun from then by Kamemaru', began > 0 && V.prepBy === 'kame' && V.prepTold === false && V.swellGuess.alarm > 0
    && R.talks.some((e: any) => e.who === 'kame' && /長いうねりが来ている。台風が来るかもしれない/.test(e.text)) && dot.diary.some((e: any) => /カメマルから「台風が来るかもしれない」と聞いた/.test(e.text)), `${V.prepBy} ${R.talks.filter((e: any) => !e.head).slice(-2).map((e: any) => `${e.who}:${e.text}`).join(' / ')}`);
  await run(R, 1800, () => V.raft.hauled);
  want('A Dot hauls the raft up the beach, no gathering needed', V.raft.hauled && !V.raft.quick && V.mornings === 0 && dot.diary.some((e: any) => /台風に備えて、筏を浜の上へ引き上げた/.test(e.text)));
  R.setWeather(fair);
  now = Date.parse('2026-10-02T23:40:00Z');   // (08:40, the gathering about to begin: the swell gone down)
  for (const r of R.list) { r.pos.set(58 + Math.random() * 6, 2, -150 + Math.random() * 4); r.task = null; r.battery = 1; r.hunger = 0.1; r.sleepy = 0.1; }
  await run(R, 3600, () => V.mornings > 0);
  await run(R, 120);
  want('B the next gathering: told of, proposed and shared out, and kept from when it began', V.prepTold === true && V.stormPrep === began && V.prepBy === 'kame'
    && R.talks.some((e: any) => e.who === 'kame' && /長いうねり/.test(e.text)) && R.talks.some((e: any) => e.who === 'kame' && /食べておく。$/.test(e.text)), R.talks.filter((e: any) => e.who === 'kame' && !e.head).map((e: any) => e.text).slice(-4).join(' / '));
}
{ // C
  const { R, kame, V } = island(43);
  kame.pos.set(70, 2, -150); kame.task = { kind: 'rest', x: 70, z: -150, act: 'idle', dur: 1e9, t: 0, arrived: true };
  R.setWeather(longSwell); await run(R, 40);
  const ashore = V.stormPrep === 0 && !V.swellGuess.alarm;
  const night = island(44, '2026-10-03T15:00:00Z');   // (midnight on the island: asleep)
  watching(night.kame); night.R.setWeather(longSwell); await run(night.R, 40);
  want('C asleep, or ashore at rest: a long swell is not read', ashore && night.V.stormPrep === 0 && !night.V.swellGuess.alarm, `${V.stormPrep} ${night.V.stormPrep}`);
}
{ // D
  const { R, dot, V } = island(45);
  await run(R, 5); R.setWeather(gale); await run(R, 120, () => V.raft.hauled);
  const hauled = V.raft.hauled && V.raft.quick;
  await run(R, 60); R.setWeather(fair); await run(R, 5);
  const log = V.stormLog.at(-1);
  want('D unwarned, Dot near the raft: hauled up in a hurry, a quarter lost, not remembered as getting ready', hauled && V.raft.parts === 4 && !log?.warned && !(V.heed.dot > 0)
    && dot.diary.some((e: any) => /急いで筏を浜の上へ引き上げた/.test(e.text)) && dot.diary.some((e: any) => /筏の部材2本（急いで引き上げた）を失った/.test(e.text)), `${V.raft.parts}/6; ${dot.diary.slice(-2).map((e: any) => e.text).join(' / ')}`);
}
{ // E
  const { R, dot, V } = island(47);
  Object.assign(V.raft, { x: 58, z: -260 });   // (110 m off)
  await run(R, 5); R.setWeather(gale); await run(R, 120); R.setWeather(fair); await run(R, 5);
  want('E unwarned, Dot far from the raft: left on the beach, half lost', V.raft.parts === 3 && !V.raft.hauled && dot.diary.some((e: any) => /筏の部材3本を失った/.test(e.text)), `${V.raft.parts}/6`);
}
{ // F
  const { R, dot, kame, V } = island(49);
  watching(kame); kame.pos.set(300, 2, -150); kame.task.x = 300;   // (240 m off: out of earshot)
  await run(R, 5); R.setWeather(longSwell); await run(R, 40, () => V.stormPrep > 0);
  await run(R, 900);
  const unheard = V.stormPrep > 0 && V.prepKnown.includes('kame') && !V.prepKnown.includes('dot') && !V.raft.hauled;
  R.setWeather(gale); await run(R, 120, () => V.raft.hauled); const quick = V.raft.hauled && V.raft.quick;
  await run(R, 60); R.setWeather(fair); await run(R, 5);
  want('F not heard, not readied: Dot does not haul the raft before; in a hurry as it comes, and it did not know', unheard && quick && V.raft.parts === 4 && dot.diary.some((e: any) => /前もって知らなかった/.test(e.text)),
    `known ${V.prepKnown.join(',') || '—'}; ${V.raft.parts}/6; ${dot.diary.slice(-1).map((e: any) => e.text).join('')}`);
}
{ // G
  const { R, dot, V } = island(47);
  const prep = 48 * 3.6e6 / (365 / 28);   // (two island days, in real time)
  V.raft.hauled = true; V.stormPrep = now - prep * 0.5; V.prepBy = 'kame';
  await run(R, 40);
  const stillUp = V.raft.hauled;
  V.stormPrep = now - prep - 60e3; await run(R, 40);
  want('G the getting ready over, no typhoon: the raft back down the beach — not while it lasts', stillUp && !V.raft.hauled && dot.diary.some((e: any) => /台風は来なかった。引き上げていた筏を、浜に戻した/.test(e.text)), `${stillUp} → ${V.raft.hauled}`);
}
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
