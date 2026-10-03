// Headless check (ADR 0004, step 1): Dot's own loop — it sees, sets a goal, plans from what the world offers,
// acts, hears how it went, remembers — with a stand-in brain (no API), on controlled ground by its hut.
//  1 what it sees: a log ahead is seen; one behind it, or behind a tall rock, is not
//  2 a goal it set itself is carried out by the body, step by step, and the hut gets a piece
//  3 someone else takes the log first: the world says 'gone', it is remembered, and the next plan is different
//  4 something it has never seen turns up in view: it stops to think (deep), about that
//  5 a thought that names an option the world did not offer, or settles a hypothesis without a real result, is
//    not taken; one with a real result is
//  6 no brain at all, and a brain that never answers: it gets on by habit and still builds
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/mind-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import type { BrainInput, Thought } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T00:00:00Z');   // (09:00 at the island: Dot up and about)
Date.now = () => now;
Math.random = mulberry32(4004);
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
function island() {
  store.clear(); now = Date.parse('2026-10-03T00:00:00Z'); Math.random = mulberry32(4004);
  const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  const dot = R.list.find((r: any) => r.id === 'dot');
  // (the others far off, out of the way; nothing lying about but what each case puts down)
  R.list.forEach((o: any, i: number) => { if (o !== dot) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
  R.items.list.length = 0;
  dot.pos.set(61, 2, -145); dot.head = 0; dot.battery = 1; dot.task = null;
  return { R, T, dot, mind: R.mind(dot) };
}
const wood = (R: any, x: number, z: number) => { R.items.addAt('wood', x, z); return R.items.list[R.items.list.length - 1]; };
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; }
  return false;
}
// a stand-in brain: plans from what it is given, the way the model is asked to (and records what it was asked)
function stub(plan: (i: BrainInput) => Partial<Thought> | null) {
  const asked: { why: string; tier: string; input: BrainInput }[] = [];
  const b = async (i: BrainInput, tier: 'deep' | 'light') => { asked.push({ why: i.why, tier, input: i }); const p = plan(i); return p ? ({ goal: { text: '小屋を建てる', why: 'テスト' }, ...p } as Thought) : null; };
  return { b, asked };
}
const gatherFirst = (i: BrainInput) => { const g = i.options.find((o) => o.action === 'gather'); return g ? { plan: [g.id, 'craft:bench', 'place:hut'] } : { plan: ['look:shore'] }; };

{ // 1 what it sees
  const { R, T, dot } = island();
  const ahead = wood(R, 61, -135), behind = wood(R, 61, -155), hidden = wood(R, 75, -130);
  T.solids.add({ kind: 'rock', x: 68, z: -137.5, r: 1.6, y0: 1.7, y1: 5 });   // (between Dot and the third log)
  const seen = new Set(R.observe(dot).map((o: any) => o.id));
  want('1 sees the log ahead', seen.has(`wood#${ahead.id}`), [...seen].filter((s) => String(s).startsWith('wood')).join(','));
  want('1 not the one behind it', !seen.has(`wood#${behind.id}`));
  want('1 not the one behind a tall rock', !seen.has(`wood#${hidden.id}`));
}
{ // 2 its own goal, carried out
  const { R, dot, mind } = island();
  wood(R, 61, -136);
  const s = stub(gatherFirst); R.setBrain(s.b);
  const before = dot.stats.built;
  await run(R, 400, () => dot.stats.built > before && !mind.goal);
  const done = mind.results.filter((r: any) => r.outcome === 'done').map((r: any) => r.action).join('→');
  want('2 its plan done step by step, a piece on the hut', dot.stats.built === before + 1 && /gather→craft→place/.test(done), `${done}, hut ${dot.stats.built}`);
  want('2 it wrote what it set out to do and that it did', dot.diary.some((e: any) => e.key === 'mind' && e.text.startsWith('目的')) && dot.diary.some((e: any) => e.text.startsWith('やりとげた')));
  await run(R, 30, () => s.asked.length >= 2);
  want('2 a goal done is a time to think again', s.asked.length >= 2 && /終わった/.test(s.asked[1].why), s.asked[1]?.why ?? '-');
}
{ // 3 someone else gets there first
  const { R, dot, mind } = island();
  const far = wood(R, 61, -110), near2 = wood(R, 58, -128);
  // (it means to fetch the far one; the other is in view too)
  const s = stub((i) => { const f = i.options.find((o) => o.id === `gather:wood#${far.id}`); return { plan: f ? [f.id, 'craft:bench'] : [i.options.find((o) => o.action === 'gather')?.id ?? 'look:shore'] }; });
  R.setBrain(s.b);
  await run(R, 90, () => dot.task?.opt === `gather:wood#${far.id}`);
  R.items.take(far);   // (taken by another, while it is on its way)
  await run(R, 200, () => mind.results.some((r: any) => r.outcome === 'gone'));
  const gone = mind.results.find((r: any) => r.outcome === 'gone');
  want('3 the world says the log is gone', !!gone, gone ? `${gone.optionId} ${gone.outcome}` : 'no result');
  want('3 it remembers that it tried', mind.knowledge.some((k: any) => k.source === 'tried' && k.evidence?.includes(gone?.eventId)));
  await run(R, 30, () => s.asked.length >= 2);
  const next = s.asked[1]?.input;
  want('3 it thinks again knowing why, and the gone log is not offered', !!next && /うまくいかなかった/.test(next.why) && next.results.some((r) => r.outcome === 'gone') && !next.options.some((o) => o.id === `gather:wood#${far.id}`), next?.why ?? '-');
  await run(R, 300, () => !dot.holding && dot.stats.built > 0 || dot.holding === 'wood');
  want('3 and goes for the other one', mind.results.some((r: any) => r.optionId === `gather:wood#${near2.id}` && r.outcome === 'done'));
}
{ // 4 something new in view
  const { R, dot, mind } = island();
  wood(R, 61, -136);
  const s = stub(gatherFirst); R.setBrain(s.b);
  await run(R, 20, () => s.asked.length >= 1);
  const v = R.village; void v;
  // (a strange thing washed up just ahead)
  const drift = (R as any).drift; void drift;
  dot.head = 0;
  await run(R, 5);
  const n0 = s.asked.length;
  // put something of a new kind in its sight by hand: a stone
  R.items.addAt('stone', 62, -138);
  await run(R, 60, () => s.asked.length > n0);
  const q = s.asked[n0];
  if (!q) console.log('   (debug) why', JSON.stringify(mind.why), 'seen stone', [...mind.seen.keys()].filter((k: string) => k.startsWith('stone')), 'dot', dot.pos.x.toFixed(1), dot.pos.z.toFixed(1), dot.head.toFixed(2), dot.task?.kind, dot.task?.arrived);
  want('4 a new kind of thing seen: it stops to think, deeply', !!q && /はじめて/.test(q.why) && q.tier === 'deep', q ? `${q.why} (${q.tier})` : 'not asked');
  void mind;
}
{ // 5 thoughts are checked
  const { R, dot, mind } = island();
  wood(R, 61, -136); wood(R, 63, -132); wood(R, 58, -130); wood(R, 60, -126);
  let round = 0, hypId = '';
  const s = stub((i) => {
    round++;
    if (round === 1) return { plan: ['gather:wood#999', 'go:61,-100'] };   // (not offered: refused)
    if (round === 2) return { plan: [i.options.find((o) => o.action === 'gather')!.id, 'craft:bench', 'place:hut'], hypothesis: '流木は作業台で削れば部材になる' };
    hypId = i.knowledge.find((k) => k.status === 'hypothesis')?.id ?? '';
    const hat = i.knowledge.find((k) => k.id === hypId)?.at ?? 0, real = [...i.results].reverse().find((r) => r.action === 'craft' && r.outcome === 'done' && r.at >= hat);
    const g = i.options.find((o) => o.action === 'gather');
    return { plan: g ? [g.id, 'craft:bench', 'place:hut'] : ['look:shore'], verdicts: [{ id: hypId, status: 'confirmed', evidence: ['made-up-1'] }, ...(real ? [{ id: hypId, status: 'confirmed' as const, evidence: [real.eventId] }] : [])] };
  });
  R.setBrain(s.b);
  await run(R, 30, () => round >= 1);
  want('5 a plan with options the world did not offer is not taken', !mind.goal || !mind.goal.steps.some((x: string) => x.startsWith('go:') || x === 'gather:wood#999'), mind.goal ? mind.goal.steps.join(',') : '(no goal)');
  const hyp = () => mind.knowledge.find((x: any) => x.text === '流木は作業台で削れば部材になる');
  await run(R, 900, () => hyp()?.status === 'confirmed');
  const k = hyp();
  if (!k) console.log('   (debug) round', round, 'knowledge', JSON.stringify(mind.knowledge.map((x: any) => [x.text, x.status])), 'goal', JSON.stringify(mind.goal), 'built', dot.stats.built);
  want('5 a hypothesis is settled only by a real result', !!k && k.status === 'confirmed' && k.evidence.every((e: string) => mind.results.some((r: any) => r.eventId === e)), k ? `${k.status} ${k.evidence}` : 'none');
  void dot;
}
{ // 6 no brain; a brain that never answers
  for (const [name, b] of [['no brain', null], ['never answers', () => new Promise(() => {})]] as const) {
    const { R, dot } = island();
    wood(R, 61, -136); wood(R, 64, -130);
    R.setBrain(b as any);
    await run(R, 500, () => dot.stats.built >= 1);
    want(`6 ${name}: it gets on by habit and builds`, dot.stats.built >= 1, `hut ${dot.stats.built}`);
  }
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
