// Whom the live screen's drone follows (viewer design PROGRAM.md §4, the least of it for trial 3, §7-3). It only reads
// the residents as they are and what the world tells; it gives nothing back. What is going on with each one ranks it:
//   1 a moment decided, a result, a first — it thinks (ponder); a goal set, a try checked, done or failed (its own mind's
//     lines); the island's first of something; a crossing begun or ended; a try's result from the trials' screen (call)
//   2 working together or talking — a talk, the fire's gathering while someone speaks, asking, giving, telling
//   3 work under way — any other task
//   6 at rest — asleep, charging, waiting, looking out, floating (R-017's weak and empty doings), nothing to do
//   (4 the sea's shows and 5 looking back come with trial 4)
//   storms (PROGRAM.md §4, D33): Kamemaru telling of a long swell is rank 1 (once a storm); Dot hauling the raft up in a
//   hurry as a typhoon comes is rank 1 while it hauls
// A higher rank cuts in on a lower one, never on its own rank; a line being said is let finish, ten seconds at most. After
// a rank-1 moment the drone stays twenty seconds; on one at rest twelve seconds at most, if any other has something going
// on; on work three minutes, then the next one at work — one trying a goal of its own first. When all are at rest, each one
// awake in turn for six minutes, as before. Every change of whom it follows, and of the rank of the one followed, is told
// to cam() (the trial's log).
const ORDER = ['dot', 'rakko', 'kame', 'lantern'];
const TURN_S = 360, P1_HOLD = 20, REST_MAX = 12, WORK_TURN = 180, LINE_WAIT = 10;
const REST = new Set(['sleep', 'charge', 'rest', 'nap', 'float', 'idle', 'study-rest', 'study-pause', 'bask', 'groom', 'look', 'wander', 'shelter']);
const TALK = new Set(['ask', 'give', 'tell', 'say', 'answer']);
// (the world's events that are rank 1: a first; in its own mind, a goal set or a try's end; a crossing)
const MIND1 = /^[^：]+：(目的|確かめた|違っていた|やりとげた|うまくいかなかった)：/;

export interface DirectorCtx {
  residents(): any | null;
  watched(): any | null;
  watch(r: any): void;
  speaking(): boolean;   // (a line is up on the screen now)
  cam?(who: string, pri: number, kind: string, why: string): void;
}

export const awake = (r: any) => r.act !== 'sleep' && r.task?.kind !== 'sleep' && !(r.task?.kind === 'voyage' && r.task.data?.started);   // (asleep, or away at sea: not followed)

export function rank(R: any, r: any): { pri: number; kind: string } {
  if (!r || !awake(r)) return { pri: 6, kind: 'asleep' };
  const k = r.task?.kind ?? '';
  if (k === 'ponder') return { pri: 1, kind: 'thinking' };
  if (k === 'haul' && r.task.data?.quick) return { pri: 1, kind: 'storm' };
  if (r.talk || (k === 'fire' && r.task.arrived && R.list.some((x: any) => x.saying && x.task?.kind === 'fire'))) return { pri: 2, kind: r.talk ? 'talk' : 'fire' };
  if (TALK.has(k)) return { pri: 2, kind: k };
  if (!k || REST.has(k)) return { pri: 6, kind: k || 'idle' };
  return { pri: 3, kind: k };
}

export function makeDirector(ctx: DirectorCtx) {
  // (its own reckoning: who it is on, why and since when; rank-1 moments waiting their turn)
  let shot = { id: '', pri: 6, kind: '', since: 0, hold: 0 }, clock = 0, turn = 0, dirT = 0;
  const calls: { id: string; kind: string; why: string; at: number }[] = [];
  const call = (r: any, kind: string, why: string) => { if (r?.id && ORDER.includes(r.id)) { calls.push({ id: r.id, kind, why: why.slice(0, 80), at: clock }); if (calls.length > 12) calls.shift(); } };
  const ownGoal = (R: any, r: any) => { const g = R.mind?.(r)?.goal; return !!g && g.by !== 'habit'; };
  function next(R: any) {
    const now = ctx.watched(), i = now ? ORDER.indexOf(now.id) : -1;
    for (let k = 1; k <= ORDER.length; k++) { const r = R.list.find((x: any) => x.id === ORDER[(i + k) % ORDER.length]); if (r && awake(r)) return r; }
    return now ?? R.list.find((x: any) => x.id === 'dot');
  }
  function follow(n: any, pri: number, kind: string, why: string) {
    const was = ctx.watched();
    if (n !== was) ctx.watch(n);
    if (n !== was || shot.id !== n.id) ctx.cam?.(n.id, pri, kind, why);
    shot = { id: n.id, pri, kind, since: clock, hold: pri === 1 ? clock + P1_HOLD : 0 }; turn = TURN_S;
  }
  function direct(R: any) {
    const r = ctx.watched();
    if (!r) { const n = next(R); if (n) { const k = rank(R, n); follow(n, k.pri, k.kind, 'start'); } return; }
    if (shot.id !== r.id) shot = { id: r.id, pri: rank(R, r).pri, kind: rank(R, r).kind, since: clock, hold: 0 };   // (followed by another hand)
    const held = shot.hold > clock, cur = held ? { pri: 1, kind: shot.kind } : rank(R, r);
    // (rank 1: what has just happened, or one starting to think — the line being said let finish, ten seconds at most)
    while (calls.length && clock - calls[0].at > 30) calls.shift();
    const live = R.list.filter((x: any) => awake(x));
    const thinking = live.find((x: any) => x !== r && x.task?.kind === 'ponder'), hauling = live.find((x: any) => x !== r && x.task?.kind === 'haul' && x.task.data?.quick);
    const c = calls.find((x) => x.id !== r.id || !held);
    const p1 = c ? { r: R.list.find((x: any) => x.id === c.id), kind: c.kind, why: c.why, call: c } : thinking ? { r: thinking, kind: 'thinking', why: '考え始めた', call: null }
      : hauling ? { r: hauling, kind: 'storm', why: '台風が来て、急いで筏を引き上げている', call: null } : null;
    if (p1?.r && p1.r !== r && awake(p1.r) && cur.pri > 1) {
      if (!ctx.speaking() || (p1.call ? clock - p1.call.at : 0) > LINE_WAIT) { if (p1.call) calls.splice(calls.indexOf(p1.call), 1); follow(p1.r, 1, p1.kind, p1.why); return; }
      return;   // (waiting for the line to end)
    }
    if (p1?.r === r && p1.call) { calls.splice(calls.indexOf(p1.call), 1); shot.hold = clock + P1_HOLD; shot.kind = p1.kind; shot.pri = 1; ctx.cam?.(r.id, 1, p1.kind, p1.why); return; }   // (on it already: it stays)
    if (held) return;
    // (rank 2 cuts in on 3 and 6: two at work together, talking, at the fire)
    if (cur.pri > 2) { const t = live.find((x: any) => x !== r && rank(R, x).pri === 2); if (t) { const k = rank(R, t); follow(t, 2, k.kind, k.kind === 'talk' ? '話している' : k.kind === 'fire' ? '焚き火の会' : '頼み・知らせ'); return; } }
    // (at rest: twelve seconds, if another has something going on; at work: three minutes — one trying a goal of its own first)
    const best = () => live.filter((x: any) => x !== r && rank(R, x).pri <= 3).sort((a: any, b: any) => rank(R, a).pri - rank(R, b).pri || Number(ownGoal(R, b)) - Number(ownGoal(R, a)))[0];
    if ((cur.pri === 6 && clock - shot.since >= REST_MAX) || (cur.pri === 3 && clock - shot.since >= WORK_TURN)) {
      const b = best(); if (b) { const k = rank(R, b); follow(b, k.pri, k.kind, ownGoal(R, b) ? '試みの途中' : '仕事の途中'); return; }
    }
    if (cur.pri !== shot.pri) ctx.cam?.(r.id, cur.pri, cur.kind, '同じ住人の、していることが変わった');   // (the same one, its rank changed: for the time each rank is on screen)
    if (cur.pri !== shot.pri || cur.kind !== shot.kind) { shot.pri = cur.pri; shot.kind = cur.kind; }
    // (all at rest, or the one followed gone to sleep: as before, the next one awake)
    if (turn <= 0 || (!awake(r) && turn < TURN_S - 30)) { const n = next(R); if (n && n !== r) { const k = rank(R, n); follow(n, k.pri, k.kind, awake(r) ? 'じゅんばん' : '眠った'); } else turn = TURN_S; }
  }
  return {
    /** Each frame: the drone's reckoning, twice a second. */
    tick(dt: number) { const R = ctx.residents(); if (!R) return; turn -= dt; clock += dt; if ((dirT -= dt) <= 0) { dirT = 0.5; direct(R); } },
    /** What the world tells (residents' onEvent), ranked. */
    event(kind: string, text: string, r: any, meta?: { milestone?: string }) {
      if (meta?.milestone) call(r, 'first', text);
      else if (kind === 'mind' && MIND1.test(text)) call(r, /目的/.test(text.split('：')[1]) ? 'decided' : 'result', text);
      else if (kind === 'map' || kind === 'sail' || kind === 'raft') call(r, 'crossing', text);
      else if (kind === 'weather' && /長いうねりに気づいた/.test(text)) call(r, 'storm', text);
    },
    /** A try's result, from the trials' screen (PROGRAM.md §1): rank 1. */
    trial(r: any, outcome: string, text: string) { call(r, `result:${outcome}`, text); },
  };
}
