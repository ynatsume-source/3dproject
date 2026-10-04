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
}

/** What it is setting out to do, why, and the steps it means to take (option ids). */
export interface Goal { id: string; text: string; why: string; by: 'self' | 'asked' | 'habit'; at: number; steps: string[] }

/** What its thinking came back with (checked against the world before any of it is used). */
export interface Thought {
  goal: { text: string; why: string }; plan: string[];
  say?: string; hypothesis?: string;
  verdicts?: { id: string; status: 'confirmed' | 'refuted'; evidence: string[] }[];
}

export interface BrainInput {
  who: string; profile: string; now: { at: number; hour: number; battery: number | null; holding: string; night: boolean; body?: { おなか: number; ねむけ: number } };   // (body: the two animals — 100 full / 100 very sleepy)
  why: string;                                  // (what made it stop to think: a goal done, a failure, something new…)
  goal: Goal | null; seeing: Observation[]; remembered: Observation[];
  knowledge: Knowledge[]; results: ActionResult[]; options: Option[];
}
export type Brain = (input: BrainInput, tier: 'deep' | 'light') => Promise<Thought | null>;

/** One asking another for something (ADR 0004 §6): kept by the world, answered by the one asked, in its own way. */
export interface Request { id: string; from: string; to: string; what: 'bring-wood'; at: number; status: 'open' | 'accepted' | 'refused' | 'done' | 'failed'; reason?: string }
