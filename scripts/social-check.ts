// Headless check (ADR 0004, step 2): Dot and Rakko, each with a mind of its own, on controlled ground.
//  A Dot asks Rakko for driftwood; Rakko takes it on, fetches a log only it has seen, hands it over; Dot shapes it
//  B Rakko, hungry, says no; Dot hears why, and does not ask again straight away
//  C Rakko tells Dot where a log is; Dot knows it as heard (from Rakko), not seen, and fetches it — and learns
//    from it that what others tell it is of use
//  D the same log: once one has it in hand (or on the way), the other is not offered it, and a plan naming it is not taken
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/social-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import type { BrainInput, Thought } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
function island(seed: number) {
  store.clear(); now = Date.parse('2026-10-03T00:00:00Z'); Math.random = mulberry32(seed);
  const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  const dot = R.list.find((r: any) => r.id === 'dot'), rakko = R.list.find((r: any) => r.id === 'rakko');
  R.list.forEach((o: any, i: number) => { if (o !== dot && o !== rakko) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
  R.items.list.length = 0;
  dot.pos.set(61, 2, -145); dot.head = Math.PI; dot.battery = 1; dot.task = null;
  rakko.pos.set(61, 2, -160); rakko.head = Math.PI; rakko.hunger = 0.1; rakko.sleepy = 0.1; rakko.task = null; rakko.wet = false;
  return { R, dot, rakko, dm: R.mind(dot), rm: R.mind(rakko) };
}
const wood = (R: any, x: number, z: number) => { R.items.addAt('wood', x, z); return R.items.list[R.items.list.length - 1]; };
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; }
  return false;
}
// stand-in brains, one per resident (as the model would be asked)
function brains(per: Record<string, (i: BrainInput) => Partial<Thought> | null>) {
  return async (i: BrainInput) => { const p = per[i.who]?.(i); return p ? ({ goal: { text: 'テスト', why: 'テスト' }, ...p } as Thought) : null; };
}
const opt = (i: BrainInput, pre: string) => i.options.find((o) => o.id.startsWith(pre) && o.ready !== false)?.id;

{ // A asked, taken on, fetched, handed over, shaped
  const { R, dot, rakko, dm, rm } = island(11);
  const log = wood(R, 61, -170);   // (beyond Rakko, out of Dot's sight)
  R.setBrain(brains({
    dot: (i) => i.now.holding === 'wood' ? { plan: ['craft:bench', 'place:hut'] } : opt(i, 'ask:') ? { plan: [opt(i, 'ask:')!] } : { plan: ['look:shore'] },
    // (Rakko only goes for the log once it has been asked)
    rakko: (i) => opt(i, 'accept:') ? { plan: [opt(i, 'accept:')!, opt(i, 'gather:wood')!, 'give:dot'] } : opt(i, 'give:') ? { plan: ['give:dot'] } : i.results.some((r) => r.optionId.startsWith('accept:')) && opt(i, 'gather:wood') ? { plan: [opt(i, 'gather:wood')!, 'give:dot'] } : { plan: ['wander:beach'] },
  }));
  want('A Dot has not seen the log', !dm.seen.has(`wood#${log.id}`));
  await run(R, 600, () => dot.stats.built >= 1);
  const q = R.requests?.[0] ?? null; void q;
  want('A Rakko took it on, fetched it and handed it to Dot', rakko.diary.some((e: any) => /頼み（流木を届ける）を引き受ける：できた/.test(e.text)) && rakko.diary.some((e: any) => /手渡した/.test(e.text)), rm.results.filter((r: any) => !/float|groom|wander/.test(r.optionId)).map((r: any) => `${r.optionId}:${r.outcome}`).join(' '));
  want('A Dot heard it from Rakko, and shaped and fitted it', dm.knowledge.some((k: any) => k.source === 'heard' && k.text.includes('届けて')) && dot.stats.built >= 1, `hut ${dot.stats.built}`);
  want('A both diaries say so', dot.diary.some((e: any) => e.text.includes('頼んだ')) && rakko.diary.some((e: any) => e.text.includes('手渡した')));
  void rakko;
}
{ // B a no
  const { R, dot, rakko, dm } = island(12);
  rakko.hunger = 0.8;
  R.setBrain(brains({ dot: (i) => opt(i, 'ask:') ? { plan: [opt(i, 'ask:')!] } : { plan: ['look:shore'] }, rakko: () => null }));   // (Rakko by its habits: hungry, it says no)
  await run(R, 300, () => dm.results.some((r: any) => r.outcome === 'refused'));
  const no = dm.results.find((r: any) => r.outcome === 'refused');
  want('B Rakko said no, and why', !!no && /断られた：おなかがすいている/.test(no.detail ?? ''), no?.detail ?? 'no answer');
  let asked = 0; const before = dot.diary.filter((e: any) => e.text.includes('頼んだ')).length;
  await run(R, 120); asked = dot.diary.filter((e: any) => e.text.includes('頼んだ')).length - before;
  want('B Dot does not ask again straight away', asked === 0, `asked again ${asked}`);
  void rakko;
}
{ // C told where
  const { R, dot, rakko, dm, rm } = island(13);
  // (far down the beach, beyond what Dot can see from its hut; Rakko is down there, looking at it)
  rakko.pos.set(61, 2, -232); rakko.head = Math.PI;
  const log = wood(R, 61, -250);
  R.setBrain(brains({
    dot: (i) => { const g = opt(i, 'gather:wood'); return g ? { plan: [g, 'craft:bench'] } : { plan: ['look:shore'] }; },
    rakko: (i) => { const t = opt(i, 'tell:dot:'); return t ? { plan: [t] } : { plan: ['wander:beach'] }; },
  }));
  // (how Dot first came to know of it)
  await run(R, 900, () => dm.seen.has(`wood#${log.id}`));
  const ob = dm.seen.get(`wood#${log.id}`);
  want('C Dot first knows of the log as told by Rakko', ob?.from === 'rakko' && dm.knowledge.some((k: any) => k.source === 'heard'), ob ? `from ${ob.from ?? 'its own eyes'}, ${Math.round(Math.hypot(ob.x - dot.pos.x, ob.z - dot.pos.z))} m off` : 'not known');
  await run(R, 600, () => dot.holding === 'wood' || dot.stats.built > 0);   // (the first time they meet, they identify each other first: the custom)
  want('C and fetches it', dm.results.some((r: any) => r.optionId === `gather:wood#${log.id}` && r.outcome === 'done'));
  want('C and learns that what it hears is of use (talking pays)', (dot.stats.talkUse ?? 0) > 0 && dot.diary.some((e: any) => /ラッコから聞いた情報で/.test(e.text)), `talkUse ${dot.stats.talkUse ?? 0}`);
  void rakko;
}
{ // D one log, two who want it
  const { R, dot, rakko, dm, rm } = island(14);
  const log = wood(R, 61, -152);   // (between them: both see it)
  let rakkoAsked: BrainInput | null = null;
  R.setBrain(brains({
    dot: (i) => { const g = i.options.find((o) => o.id === `gather:wood#${log.id}`); return g ? { plan: [g.id, 'craft:bench'] } : { plan: ['look:shore'] }; },
    rakko: (i) => { rakkoAsked = i; return { plan: [`gather:wood#${log.id}`] }; },
  }));
  await run(R, 120, () => !!dot.task && dot.task.opt === `gather:wood#${log.id}`);
  rm.why = '試しに考える'; rm.lastCall = -1e12;
  await run(R, 60, () => !!rakkoAsked && rakkoAsked.why === '試しに考える');
  const offered = !!(rakkoAsked as BrainInput | null)?.options.some((o) => o.id === `gather:wood#${log.id}`);
  want('D while Dot is on its way, Rakko is not offered that log', !offered);
  await run(R, 200, () => dot.holding === 'wood');
  want('D Dot has it; Rakko never had it', dot.holding === 'wood' && !rm.results.some((r: any) => r.optionId === `gather:wood#${log.id}` && r.outcome === 'done'));
  void dm; void rakko;
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
