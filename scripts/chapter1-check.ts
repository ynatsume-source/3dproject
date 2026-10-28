// Chapter 1 as the world keeps it (viewer design PROGRAM.md §2-1, science's specs/chapter1-world-values.md). Headless, on
// controlled ground, the residents by habit:
//   A the chapter begins with the first load: its time, and none of the way done
//   B the load in words, by the least so far of the clay and bamboo not yet used (raw, settled, prepared clay; bamboo),
//     against the first load's 25 kg and 7 kg: plenty over 60 %, about half from 25 %, nearly gone under 25 %; gone
//     under what the least use takes (a lamp dish's 0.4 kg, a tube's 0.2 kg), the time kept — and more clay coming back
//     does not take a word back
//   C the hut: done when its last piece is on, the time kept
//   D in time or not, from the times kept: the south island's load before either was gone, or after; the load's line
//     gone with the chapter's end (pure: world/chapter1.ts)
//   E an island that never had the first load has no chapter 1
// (the pot fired, the first lamp and the south island's load are seen where the world does them: oil-chain-check,
// lamp-check, raft-habit-check)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/chapter1-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { chapter1, WAY } from '../src/world/chapter1';
import type { BrainInput, Thought } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T01:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };

Math.random = mulberry32(3);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
const V = R.village, lab = R.lab, dot = R.list.find((r: any) => r.id === 'dot');
R.list.forEach((o: any, i: number) => { if (o !== dot) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
R.setBrain(null);
const run = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); if (until?.()) return true; } return false; };
const lotsOf = (m: string) => Object.values(lab.lots).filter((l: any) => l.materialId === m) as any[];
// (what is left of a material, put in one lot — as if the rest were used)
const leave = (m: string, mg: number) => { const ls = lotsOf(m); ls.forEach((l, i) => { if (i) delete lab.lots[l.lotId]; }); if (ls[0]) ls[0].amount.value = mg; };
{ // A
  const c = chapter1(V);
  want('A the chapter begins with the first load, none of the way done', !!c && c.began === V.firstLoad.at && WAY.every((s) => c.way[s] === null) && c.ended === null && c.inTime === null, JSON.stringify(c));
}
{ // B
  run(31);
  const words: string[] = [];
  const say = () => { const c = chapter1(V)!; words.push(`${c.load?.clay}/${c.load?.bamboo}`); return c; };
  say();
  for (const [clay, bamboo] of [[20e6, 5e6], [10e6, 3e6], [4e6, 1.5e6], [3e6, 0.1e6], [0.3e6, 0.1e6]] as const) { leave('raw_clay', clay); leave('bamboo', bamboo); run(31); say(); }
  const goneAt = V.firsts['clay-gone'];
  leave('raw_clay', 20e6); run(31); const after = say();
  want('B the load in words, by the least so far: plenty, about half, nearly gone, gone — and not taken back', words.join(' ') === 'plenty/plenty plenty/plenty half/half little/little little/gone gone/gone gone/gone'
    && after.load?.clay === 'gone' && goneAt > 0 && V.firsts['bamboo-gone'] > 0 && V.firsts['bamboo-gone'] < goneAt, words.join(' '));
}
{ // C
  dot.stats.built = 23; dot.holding = 'piece'; dot.task = null;
  let given = false;
  R.setBrain(async (i: BrainInput) => (i.who !== 'dot' || given ? null : (given = true, { goal: { text: '小屋の最後の部材を付ける', why: 'テスト' }, plan: ['place:hut'] } as Thought)));
  run(600, () => dot.stats.built >= 24);
  want('C the hut: done with its last piece, the time kept', dot.stats.built === 24 && chapter1(V)!.way.hut === V.firsts.hut && V.firsts.hut > V.firstLoad.at, `${dot.stats.built} pieces, ${V.firsts.hut}`);
}
{ // D, E
  const base = { firstLoad: { at: 100 }, loadMin: { clayMg: 3e6, bambooMg: 3e6 } };
  const inTime = chapter1({ ...base, firsts: { 'south-load': 500 } }), late = chapter1({ ...base, firsts: { 'south-load': 500, 'clay-gone': 400 } }), after = chapter1({ ...base, firsts: { 'south-load': 500, 'bamboo-gone': 600 } });
  const going = chapter1({ ...base, firsts: { raft: 300 } });
  want('D in time or not, from the times kept; the load\'s line gone with the end', inTime?.inTime === true && inTime.load === null && inTime.ended === 500 && late?.inTime === false && after?.inTime === true
    && going?.load?.clay === 'little' && going.load.bamboo === 'half' && going.way.raft === 300 && going.ended === null, JSON.stringify({ inTime: inTime?.inTime, late: late?.inTime, after: after?.inTime, going: going?.load }));
  want('E no first load, no chapter 1', chapter1({ firstLoad: null, firsts: {} }) === null);
}
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
