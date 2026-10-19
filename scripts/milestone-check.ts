// Headless check (the island's firsts: world/milestones.ts and residents' tell, viewer design 2-a, 2026-10-18).
// Test data only, in a stand-in localStorage.
//  1 the table: which of the world's events can be a first, and of what kind (one crossing per island)
//  2 the first of a kind is marked as a milestone once; told again, it is not
//  3 kept with the village: saved and loaded, the same kind is not a first again
//  4 marked in the hours caught up on as well (nobody watching): the record is the world's
//  5 what the island had done before it kept firsts is not told as a first (a raft already built, an island reached)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/milestone-check.ts
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { milestoneKey } from '../src/world/milestones';

let now = Date.parse('2026-10-06T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>(), KEY = 'seaglass.residents.v1';
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
Math.random = mulberry32(7);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const make = () => { const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']); R.setBrain(null); return R; };
const told: { kind: string; text: string; m?: string }[] = [];
let R: any = make(); R.onEvent = (kind: string, text: string, _r: any, meta?: { milestone?: string }) => told.push({ kind, text, m: meta?.milestone });
const dot = () => R.list.find((r: any) => r.id === 'dot');

{ // 1
  const k = [milestoneKey('science', 'ランタンが、島で初めて灯りをともした。焼いた灯皿に'), milestoneKey('map', 'ドットが筏で南のすぐ近くの島に渡り、戻ってきた'), milestoneKey('map', 'ドットが筏で東の平たい島に渡り、戻ってきた'),
    milestoneKey('cord', 'ドットが撚り糸を三本合わせて、縄をなった'), milestoneKey('cord', 'ドットの筏の縄が切れた'), milestoneKey('fire', '朝の集まりが始まった'), milestoneKey('photo', 'ドットがラッコの写真を撮った')];
  want('1 the table: the first light, a crossing per island, the rope, a cord giving; a gathering or a photo never', k.join() === 'light,crossing:南のすぐ近くの島,crossing:東の平たい島,rope,cord-break,,', k.join());
}
{ // 2
  R.tell('raft', 'ドットの筏ができた', dot()); R.tell('raft', 'ドットの筏ができた', dot()); R.tell('fire', '朝の集まりが始まった', dot());
  want('2 the first raft a milestone once; again, not; a gathering never', told.map((x) => x.m ?? '-').join() === 'raft,-,-', told.map((x) => `${x.kind}:${x.m ?? '-'}`).join());
}
{ // 3
  R.save(); now += 60e3; told.length = 0; R = make(); R.onEvent = (kind: string, text: string, _r: any, meta?: { milestone?: string }) => told.push({ kind, text, m: meta?.milestone });
  R.tell('raft', 'ドットの筏ができた', dot());
  want('3 saved and loaded: the raft is not a first again', told.length === 1 && !told[0].m && R.village.firsts.raft > 0, JSON.stringify(R.village.firsts));
}
{ // 4
  const quiet = R.onEvent; R.onEvent = () => {};
  R.tell('pier', '桟橋が完成した。みんなでつくった、はじめての大きなもの', dot());
  R.onEvent = quiet; told.length = 0; R.tell('pier', '桟橋が完成した。みんなでつくった、はじめての大きなもの', dot());
  want('4 marked with nobody watching (the hours caught up on): not a first when it is told again', R.village.firsts.pier > 0 && !told[0].m, JSON.stringify(R.village.firsts));
}
{ // 5
  store.clear(); R = make(); R.village.raft.parts = 6; R.village.map.seen['south-near'] = { word: '南のすぐ近くの島' }; R.village.map.reached['south-near'] = { at: now }; R.save();
  R = make(); told.length = 0; R.onEvent = (kind: string, text: string, _r: any, meta?: { milestone?: string }) => told.push({ kind, text, m: meta?.milestone });
  R.tell('raft', 'ドットの筏ができた', dot()); R.tell('map', 'ドットが筏で南のすぐ近くの島に渡り、戻ってきた', dot()); R.tell('map', 'ドットが筏で東の平たい島に渡り、戻ってきた', dot());
  want('5 done before firsts were kept: not told as firsts; a new island still is', told.map((x) => x.m ?? '-').join() === '-,-,crossing:東の平たい島', told.map((x) => x.m ?? '-').join());
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
