// Headless check of the live screen's drone (src/live/director.ts; viewer design PROGRAM.md §4, the least of it for
// trial 3): four stand-in residents, the director ticked at 10 Hz.
//   rest      on one at rest, twelve seconds at most when another is at work; not before
//   thinking  one starting to think cuts in on work at once (rank 1), and the drone stays twenty seconds — a talk
//             elsewhere does not cut in meanwhile
//   queue     a result for another, while a rank-1 moment is held: it waits its turn, then the drone goes to it
//   talk      once nothing holds it, a talk elsewhere cuts in on work (rank 2); a talk does not cut in on a talk
//   line      a line being said is let finish — ten seconds at most — before a rank-1 moment elsewhere
//   mind      the world's words ranked: a goal set or a try's end in a resident's own mind, a first, a crossing; not other
//             words
//   cam       every change of whom it follows is told, with the rank, the kind and why
// Usage: npx tsx scripts/live-director-check.ts
import { makeDirector, rank } from '../src/live/director';

const mk = (id: string, kind: string) => ({ id, act: 'idle', task: kind ? { kind, arrived: true } : null, talk: null as any, saying: '' });
const dot = mk('dot', 'look'), rakko = mk('rakko', 'gather'), kame = mk('kame', 'graze'), lantern = mk('lantern', 'rest');
const R = { list: [dot, rakko, kame, lantern], mind: (r: any) => (r === rakko ? { goal: { by: 'mind' } } : null) };
let watched: any = null, speaking = false, t = 0;
const cams: { t: number; who: string; pri: number; kind: string; why: string }[] = [];
const D = makeDirector({ residents: () => R, watched: () => watched, watch: (r) => { watched = r; }, speaking: () => speaking, cam: (who, pri, kind, why) => cams.push({ t, who, pri, kind, why }) });
const run = (s: number) => { for (let i = 0; i < s * 10; i++) { t += 0.1; D.tick(0.1); } };
let fail = 0;
const row = (ok: boolean, text: string) => { if (!ok) fail++; console.log(`${text} — ${ok ? 'PASS' : 'FAIL'}`); };

// rest
run(0.2); const first = watched?.id;
kame.task = { kind: 'sleep', arrived: true }; kame.act = 'sleep';   // (only Rakko at work: the one to go to)
run(10); const at10 = watched?.id; run(3); const at13 = watched?.id;
row(first === 'dot' && at10 === 'dot' && at13 === 'rakko', `rest: first ${first}, at 10 s ${at10}, at 13 s ${at13}`);
// thinking
lantern.task = { kind: 'ponder', arrived: true }; run(0.6);
const onLantern = watched?.id; lantern.task = { kind: 'study-observe', arrived: false };
kame.task = null; kame.act = 'idle'; dot.talk = kame.talk = { a: dot, b: kame }; dot.task = null;
run(18); const at18 = watched?.id;
row(onLantern === 'lantern' && at18 === 'lantern' && cams.at(-1)?.pri === 1, `thinking: cuts in ${onLantern}; at 18 s, a talk elsewhere, still ${at18}`);
// queue (a result for Rakko arrives while the hold lasts)
D.trial(rakko, 'confirmed', '浜で待ったら、流木が見えた'); run(1); const held = watched?.id;
run(3); const after = watched?.id, afterCam = cams.at(-1);
row(held === 'lantern' && after === 'rakko' && afterCam?.pri === 1 && afterCam.kind === 'result:confirmed', `queue: while held ${held}; after the hold ${after} (${afterCam?.kind})`);
// talk (once Rakko's twenty seconds are up, the talk between Dot and Kamemaru cuts in on work)
run(21); const talkOn = watched?.id, talkCam = cams.at(-1);
rakko.talk = lantern.talk = { a: rakko, b: lantern }; run(5); const stays = watched?.id;
row(['dot', 'kame'].includes(talkOn) && talkCam?.pri === 2 && stays === talkOn, `talk: ${talkOn} (rank ${talkCam?.pri}); another talk elsewhere, still ${stays}`);
// line (a line being said on screen: a first elsewhere waits, ten seconds at most)
for (const r of R.list) { r.talk = null; r.task = { kind: 'gather', arrived: true }; }
watched = dot; run(1); speaking = true;
D.event('raft', 'ラッコの筏ができた', rakko, { milestone: 'raft' }); run(5); const during = watched?.id; run(6); const past = watched?.id; speaking = false;
row(during === 'dot' && past === 'rakko', `line: during the line ${during}; past ten seconds ${past}`);
// mind
run(25);
const n0 = cams.length;
D.event('mind', 'カメマル：目的：ラグーンの魚を見分けて記録する', kame); run(1); const goalOn = watched?.id;
run(25); D.event('mind', 'カメマル：聞いた：ドットによると…', kame); D.event('photo', 'ランタンが写真を撮った', lantern); run(1); const other = cams.length;
const ones = cams.slice(n0 + 1).filter((c) => c.pri === 1).length;
row(goalOn === 'kame' && cams[n0]?.kind === 'decided' && ones === 0, `mind: a goal set — on ${goalOn} (${cams[n0]?.kind}); other words — rank-1 moves after: ${ones} (${other - n0 - 1} rows)`);
// cam
row(cams.length > 5 && cams.every((c) => ['dot', 'rakko', 'kame', 'lantern'].includes(c.who) && [1, 2, 3, 6].includes(c.pri) && c.kind && c.why), `cam: ${cams.length} rows, each with who, rank, kind and why`);
row(rank(R, { ...dot, task: { kind: 'sleep' }, act: 'sleep' }).pri === 6 && rank(R, { ...dot, task: { kind: 'ponder' } }).pri === 1, 'rank: asleep 6, thinking 1');
process.exit(fail ? 1 : 0);
