// The words a resident's own mind works in (ADR 0004): what it has seen, what it can do, what came of it,
// what it knows and how it knows it, and what it is setting out to do.

/** Something it saw: by its id in the world, where, how far, and when (its own eyes: robots/residents.ts observe). */
export interface Observation { id: string; kind: string; label: string; x: number; z: number; dist: number; at: number; from?: string }   // (from: told by that one, not seen with its own eyes)

/** Something it can do now, offered by the world (an id it may choose; never coordinates of its own). */
export interface Option { id: string; action: string; label: string; targetId?: string; ready?: boolean; needs?: string }   // (ready false: a step it may plan for, possible once `needs` holds)

export type Outcome = 'done' | 'gone' | 'no way' | 'blocked' | 'nowhere to stand' | 'interrupted' | 'timeout' | 'unavailable' | 'accepted' | 'refused';
/** What came of doing it, as the world judged it. */
export interface ActionResult { eventId: string; optionId: string; action: string; targetId?: string; outcome: Outcome; at: number; detail?: string }

/** Something it knows, and how: seen it, tried it, been told, or only supposes (a hypothesis until tried). */
export interface Knowledge {
  id: string; text: string; source: 'saw' | 'tried' | 'heard' | 'guessed'; at: number;
  status?: 'hypothesis' | 'confirmed' | 'refuted'; evidence?: string[];   // (the results that settled it)
  said?: string;   // (a hypothesis: the words its trial was shown in when it was made — its result is told in the same: PROGRAM.md §1-2)
}

/** How the world can tell a goal is reached (R-028): one of the world's values (BrainInput.metrics), and the mark. */
export interface DoneWhen { metric: string; op: '>=' | '<=' | '=='; value: number | string }
/** What it is setting out to do, why, and the steps it means to take (option ids); doneWhen: what the world looks at
 *  once the steps are taken (none: the steps taken is all that can be said). */
export interface Goal { id: string; text: string; why: string; by: 'self' | 'asked' | 'habit'; at: number; steps: string[]; doneWhen?: DoneWhen }

/** What its thinking came back with (checked against the world before any of it is used). */
export interface Thought {
  goal: { text: string; why: string }; plan: string[];
  say?: string; hypothesis?: string; doneWhen?: DoneWhen;
  verdicts?: { id: string; status: 'confirmed' | 'refuted'; evidence: string[] }[];
}

export interface BrainInput {
  who: string; profile: string; now: { at: number; hour: number; island?: Record<string, string>; map?: { 見えた島: string[]; 地図の広さ: number }; store?: string[]; battery: number | null; holding: string; night: boolean; body?: { おなか: number; ねむけ: number } };   // (body: the two animals — 100 full / 100 very sleepy)
  why: string;                                  // (what made it stop to think: a goal done, a failure, something new…)
  goal: Goal | null; seeing: Observation[]; remembered: Observation[];
  knowledge: Knowledge[]; results: ActionResult[]; options: Option[];
  hits?: string[];   // what has paid off, as the world counted it: average reward and how many times (agent/values.ts)
  metrics?: { id: string; label: string; now: number | string }[];   // the world's values a goal may be checked by, as they are now (R-028)
}
export type Brain = (input: BrainInput, tier: 'deep' | 'light') => Promise<Thought | null>;

/** One asking another for something (ADR 0004 §6): kept by the world, answered by the one asked, in its own way. */
export interface Request { id: string; from: string; to: string; what: 'bring-wood'; at: number; status: 'open' | 'accepted' | 'refused' | 'done' | 'failed'; reason?: string; conv?: number; endedAt?: number }   // (conv: the talk log's thread the asking and answering are said in)
