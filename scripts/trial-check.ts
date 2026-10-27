// Trials and results on the screen, and goals the world checks (PROGRAM.md §1, R-028, R-030). Headless, on controlled
// ground, Dot's mind a stand-in:
//   A a thought's doneWhen kept only as given — a value it was offered, toward the goal from where it is now ("22"
//     read as 22); an unknown value, one that goes backward or stays put, let go (the thought stands)
//   B reached as the world checks it: Dot means to put up one more piece of the hut, and does — やりとげた, a trial
//     begun in its own words and a result 'done'
//   C not yet: it means to put up two more, the steps put up one — まだ, the goal kept, a reason to think again
//   D nothing to check: its steps taken is all that is said — 手順を終えた, never やりとげた
//   E a step the world will not have (a piece to put up, with none in hand): the result 'failed', with the world's own
//     outcome
//   F words that fail the rule (an option id, letters, "22/24") are not shown: the trial told with no text
//   G its habits are no trial: nothing told
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/trial-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { checkThought } from '../src/robots/agent/brain';
import type { BrainInput, Thought } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T01:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };

// A
{
  const inp = { options: [{ id: 'place:hut', action: 'place', label: '' }], knowledge: [], results: [], metrics: [{ id: 'hut.parts', label: '', now: 20 }, { id: 'holding', label: '', now: 'なし' }] } as unknown as BrainInput;
  const t = (d: unknown) => checkThought({ goal: { text: 'テスト', why: 'テスト' }, plan: ['place:hut'], doneWhen: d }, inp)?.doneWhen;
  const ok = t({ metric: 'hut.parts', op: '>=', value: 21 }), str = t({ metric: 'hut.parts', op: '>=', value: '22' }), unknown = t({ metric: 'magic', op: '>=', value: 1 }),
    back = t({ metric: 'hut.parts', op: '>=', value: 19 }), same = t({ metric: 'hut.parts', op: '==', value: 20 }), hold = t({ metric: 'holding', op: '==', value: 'wood' });
  const kept = checkThought({ goal: { text: 'テスト', why: 'テスト' }, plan: ['place:hut'], doneWhen: { metric: 'magic', op: '>=', value: 1 } }, inp);
  want('A doneWhen kept as given, "22" read as 22, the wrong ones let go and the thought kept', ok?.value === 21 && str?.value === 22 && !unknown && !back && !same && hold?.value === 'wood' && !!kept && !kept.doneWhen,
    JSON.stringify({ ok, str, unknown, back, same, hold, kept: !!kept }));
}

function island(seed: number) {
  store.clear(); now = Date.parse('2026-10-03T01:00:00Z'); Math.random = mulberry32(seed);
  const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  Math.random = mulberry32(seed * 7 + 1);
  const dot = R.list.find((r: any) => r.id === 'dot');
  R.list.forEach((o: any, i: number) => { if (o !== dot) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
  R.items.list.length = 0;
  dot.pos.set(61, 2, -145); dot.battery = 1; dot.task = null; dot.stats.built = 20;
  const told: any[] = []; R.onEvent = (k: string, _t: string, r: any, meta: any) => { if (k === 'trial' && r === dot) told.push(meta.trial); };
  return { R, dot, dm: R.mind(dot), told };
}
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; }
  return false;
}
const once = (p: Partial<Thought>) => { let given = false; return async (i: BrainInput) => { if (i.who !== 'dot' || given) return null; given = true; return { goal: { text: '小屋に部材をもうひとつ取りつける', why: 'テスト' }, ...p } as Thought; }; };

// B, C, D: the same steps, three ways of saying when it is reached
for (const [tag, d, expect] of [['B reached', 1, 'done'], ['C not yet', 2, 'not-yet'], ['D nothing to check', 0, 'steps-done']] as const) {
  const { R, dot, dm, told } = island(5);
  dot.holding = 'wood';
  R.setBrain(once({ plan: ['craft:bench', 'place:hut'], say: '流木を削って、小屋に取りつけてみる', ...(d ? { doneWhen: { metric: 'hut.parts', op: '>=', value: 20 + d } } : {}) }));
  await run(R, 900, () => told.some((t) => t.kind === 'result'));
  const res = told.find((t) => t.kind === 'result'), start = told.find((t) => t.kind === 'start'), diary = dot.diary.map((e: any) => e.text).join(' / ');
  const word = expect === 'done' ? /やりとげた：/ : expect === 'not-yet' ? /まだ：/ : /手順を終えた：/;
  want(`${tag}: begun in its own words, then ${expect}${expect === 'not-yet' ? ', the goal kept and a reason to think' : ''}`,
    start?.text === '流木を削って、小屋に取りつけてみる' && res?.result === expect && word.test(diary) && (expect === 'done' || !/やりとげた：/.test(diary))
    && dot.stats.built === 21 && (expect !== 'not-yet' || (!!dm.goal && /まだ/.test(dm.why) || !!dm.thinking)),
    `built ${dot.stats.built}; ${JSON.stringify(told)}; trial ${JSON.stringify(dot.trial)}`);
}
// E a step that came to nothing
{
  const { R, dot, dm, told } = island(6);
  R.setBrain(once({ plan: ['place:hut'], say: '部材を取りつけてみる', doneWhen: { metric: 'hut.parts', op: '>=', value: 21 } }));
  await run(R, 30, () => told.some((t) => t.kind === 'result'));   // (no piece in hand: the world will not have it)
  const res = told.find((t) => t.kind === 'result');
  want('E a step that came to nothing: failed, in the world\'s words', res?.result === 'failed' && ['できなかった', 'もうなかった', '道がなかった', '進めなかった', '立てる場所がなかった', '時間がかかりすぎた', '断られた'].includes(res?.outcome) && dot.trial?.result === 'failed' && dot.stats.built === 20, JSON.stringify(res));
}
// F words that fail the rule
{
  const { R, dot, dm, told } = island(7);
  R.setBrain(once({ plan: ['place:hut'], say: 'craft:bench で小屋を22/24にする' }));
  await run(R, 10, () => told.length > 0);
  want('F words with an option id or "22/24": told with no text, nothing shown', told[0]?.kind === 'start' && told[0]?.text === null && dot.trial?.text === null, JSON.stringify(told[0]));
  void dm;
}
// G habits
{
  const { R, dot, told } = island(8);
  R.setBrain(null);
  await run(R, 60);
  want('G by habit only: no trial told', told.length === 0 && !dot.trial, `${told.length}`);
}
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
