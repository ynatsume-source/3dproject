// A resident's own loop (ADR 0004): it sees, sets itself a goal, plans the steps from what the world offers,
// takes them one by one, hears back how each went, and remembers. It stops to think (a model, when it has one
// and an allowance left) at the turning points: nothing to do, a goal done, a step that failed, something new
// seen; between them it gets on with its plan. Without a model it plans by its habits — the same loop, the
// same world, never stuck waiting.
import { MINDS } from './config';
import { checkThought } from './brain';
import type { ActionResult, Brain, BrainInput, Goal, Knowledge, Observation, Option, Outcome, Request, Thought } from './types';

export interface Habit { (options: Option[], a: Agent): { text: string; why: string; plan: string[] } | null }

const FAIL: Outcome[] = ['gone', 'no way', 'blocked', 'nowhere to stand', 'unavailable', 'timeout', 'refused'];

export class Agent {
  goal: Goal | null = null;
  results: ActionResult[] = [];
  knowledge: Knowledge[] = [];
  seen = new Map<string, Observation>();
  /** why it should stop and think, if it should ('' : get on with it) */
  why = 'まだ何も決めていない';
  thinking: { since: number; p: Promise<Thought | null>; got?: Thought | null; done: boolean } | null = null;
  lastCall = -1e12;
  calls = 0;
  /** what it said to itself, and the diary lines its mind has for the day (taken by residents.ts) */
  out: { say?: string; diary: string[] } = { diary: [] };
  private n = 0;
  constructor(readonly who: string, readonly profile: string, private habit: Habit, public brain: Brain | null) {}

  private id(p: string) { return `${this.who}-${p}${++this.n}`; }

  /** What its eyes give it this moment: kept, by id, as the last time it saw each thing. Something of a kind it
   *  has never seen before is a reason to stop and think. */
  look(obs: Observation[]) {
    const kinds = new Set([...this.seen.values()].map((s) => s.kind)), first = this.seen.size === 0;
    for (const o of obs) {
      if (!first && !kinds.has(o.kind) && !['place', 'friend', 'plot', 'young-tree'].includes(o.kind)) this.why ||= `はじめて見るもの：${o.label}`;
      kinds.add(o.kind); this.seen.set(o.id, o);
    }
  }
  /** Something new has come into view while it was busy: worth stopping for. */
  get struck() { return this.why.includes('はじめて'); }
  forget(id: string) { this.seen.delete(id); }
  /** Something another told it: kept as heard (not as seen), from whom — and a reason to think. */
  hear(o: Observation, from: string, text: string, now: number) {
    const mine = this.seen.get(o.id);
    if (!mine || mine.at < o.at) this.seen.set(o.id, { ...o, from });
    this.knowledge.push({ id: this.id('k'), text, source: 'heard', at: now });
    this.out.diary.push(`聞いた：${text}`);
    this.why ||= `話を聞いた：${text}`;
  }
  /** Asked for something: a reason to think whether to (it is its own to decide). */
  asked(q: Request, fromName: string) { this.out.diary.push(`${fromName}に頼まれた：流木を届けてほしい`); this.why = `頼まれごと：${fromName}から（${q.id}）`; }
  /** The answer to something it asked, as a result of its own. */
  answered(q: Request, now: number, byName: string) {
    const r = this.result(`ask:${q.to}:${q.what}`, 'ask', q.status === 'refused' ? 'refused' : 'accepted', now, `${byName}${q.status === 'refused' ? 'に断られた' : 'が引き受けた'}${q.reason ? `：${q.reason}` : ''}`);
    if (q.status !== 'refused') this.why ||= `${byName}が引き受けてくれた`;
    return r;
  }

  /** The next step to take (an option id), or 'ponder' (stopping a moment to think), or null (nothing it means
   *  to do: the body's own habits carry on). */
  next(options: Option[], input: () => BrainInput, now: number, wall: number): string | 'ponder' | null {
    const set = MINDS[this.who];
    // thinking under way: wait for it, a little, then get on by habit
    if (this.thinking) {
      if (!this.thinking.done && wall - this.thinking.since < (set?.ponderMaxS ?? 8) * 1000) return 'ponder';
      const got = this.thinking.done ? this.thinking.got : null; this.thinking = null;
      if (got) this.adopt(got, 'self', input(), now); else this.byHabit(options, now);
    }
    // a turning point: think, if there is a mind and allowance and it has not just thought
    if (this.why && this.brain && set?.on && wall - this.lastCall > set.minGapS * 1000) {
      const inp = input(), tier: 'deep' | 'light' = this.deep() ? 'deep' : 'light';
      this.lastCall = wall; this.calls++;
      const t = { since: wall, p: this.brain(inp, tier), done: false } as NonNullable<Agent['thinking']>;
      t.p.then((g) => { t.got = g ? checkThought(g, inp) : null; t.done = true; }, () => { t.got = null; t.done = true; });
      this.thinking = t; this.why = '';
      return 'ponder';
    }
    if (this.why && !this.goal?.steps.length) this.byHabit(options, now);
    // (a reason to think is kept until it has thought, if it has a mind: it gets on with its plan meanwhile)
    if (!this.brain || !set?.on) this.why = '';
    // the next step of the plan the world still offers; one it no longer offers is a result too
    const ids = new Set(options.filter((o) => o.ready !== false).map((o) => o.id));
    while (this.goal?.steps.length) {
      const s = this.goal.steps[0];
      if (ids.has(s)) return s;
      this.goal.steps.shift();
      this.result(s, s.split(':')[0], 'unavailable', now, options.find((o) => o.id === s)?.needs ? `${options.find((o) => o.id === s)!.needs}が要る` : 'もうできなくなっていた');
      return null;
    }
    return null;
  }

  /** Taking up a thought: its goal, its steps, its hypothesis, its verdicts on what it supposed before. */
  private adopt(t: Thought, by: Goal['by'], inp: BrainInput, now: number) {
    this.goal = { id: this.id('g'), text: t.goal.text, why: t.goal.why, by, at: now, steps: [...t.plan] };
    this.out.diary.push(`目的：${t.goal.text}（${t.goal.why}）`);
    if (t.say) this.out.say = t.say;
    if (t.hypothesis) { this.knowledge.push({ id: this.id('k'), text: t.hypothesis, source: 'guessed', status: 'hypothesis', at: now }); this.out.diary.push(`仮説：${t.hypothesis}`); }
    for (const v of t.verdicts ?? []) {
      const k = this.knowledge.find((x) => x.id === v.id && x.status === 'hypothesis'); if (!k) continue;
      k.status = v.status; k.evidence = v.evidence; k.source = 'tried';
      this.out.diary.push(`${v.status === 'confirmed' ? '確かめた' : '違っていた'}：${k.text}`);
    }
    void inp;
  }
  private byHabit(options: Option[], now: number) {
    const h = this.habit(options, this);
    this.goal = h ? { id: this.id('g'), text: h.text, why: h.why, by: 'habit', at: now, steps: h.plan.filter((s) => options.some((o) => o.id === s)) } : null;
  }
  /** Is this a turning point for its deeper thinking? (the unknown, a failure, nothing left to do) */
  private deep() { return /はじめて|うまくいかなかった|できなかった|何も決めていない|終わった/.test(this.why); }

  /** How a step went, as the world judged it: kept, learnt from, and — if it failed, or the goal is done — a
   *  reason to think again. */
  result(optionId: string, action: string, outcome: Outcome, now: number, detail?: string) {
    const r: ActionResult = { eventId: this.id('e'), optionId, action, targetId: optionId.split(':')[1], outcome, at: now, detail };
    this.results.push(r); if (this.results.length > 60) this.results.shift();
    if (outcome === 'done' && this.goal?.steps[0] === optionId) this.goal.steps.shift();   // (interrupted: the step is still to do)
    if (FAIL.includes(outcome)) {
      // (what it learnt by trying: kept as something tried, with the result as its evidence)
      // (the same lesson again is the same knowledge, with one more result behind it)
      const text = `${optionId} は ${outcome}${detail ? `（${detail}）` : ''}`, same = this.knowledge.find((k) => k.source === 'tried' && k.text === text);
      if (same) { same.at = now; same.evidence = [...(same.evidence ?? []), r.eventId].slice(-5); }
      else this.knowledge.push({ id: this.id('k'), text, source: 'tried', at: now, evidence: [r.eventId] });
      if (outcome === 'gone' && r.targetId) this.forget(r.targetId);
      // (a failure is a reason to think; something new it saw stays one too)
      this.why = `うまくいかなかった：${optionId}（${outcome}）${this.why.startsWith('はじめて') ? '・' + this.why : ''}`;
      this.out.diary.push(`うまくいかなかった：${detail ?? optionId}`);
      if (this.goal) this.goal.steps = [];
    } else if (outcome === 'done' && this.goal && !this.goal.steps.length) {
      if (this.goal.by !== 'habit') this.out.diary.push(`やりとげた：${this.goal.text}`);   // (its everyday habits are not news)
      this.why = `目的が終わった：${this.goal.text}`; this.goal = null;
    } else if (outcome === 'interrupted') this.why ||= '';
    if (this.knowledge.length > 80) this.knowledge.splice(0, this.knowledge.length - 80);
    return r;
  }

  save() { return { goal: this.goal, results: this.results.slice(-30), knowledge: this.knowledge.slice(-60), seen: [...this.seen.values()].slice(-80), n: this.n }; }
  load(s: any) {
    if (!s || typeof s !== 'object') return;
    this.goal = s.goal ?? null; this.results = Array.isArray(s.results) ? s.results : []; this.knowledge = Array.isArray(s.knowledge) ? s.knowledge : [];
    this.seen = new Map((Array.isArray(s.seen) ? s.seen : []).map((o: Observation) => [o.id, o])); this.n = Number.isSafeInteger(s.n) ? s.n : 0;
    this.why = this.goal ? '' : 'まだ何も決めていない';
  }
}
