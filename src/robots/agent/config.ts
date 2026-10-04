// Operating settings for the residents' minds (ADR 0004 §7): which model thinks for whom, how often, and how
// much a day. Settings, not design: change them here, from what the log (agentLog) shows they cost and do.
// Prices are assumptions for the log's estimate only (per million tokens, USD; checked 2026-10-03 against the
// pricing page's search listing — confirm against the account before using them for a budget).

export interface MindTier { model: string; dailyCap: number; maxTokens: number }
export interface MindSettings {
  on: boolean;
  deep: MindTier | null;    // hard plans, the unknown, failures, invention
  light: MindTier | null;   // ordinary turning points
  minGapS: number;          // at least this long (wall clock) between two calls of its own
  ponderMaxS: number;       // how long it stands thinking before it gets on by habit instead
  queueS?: number;          // (the daily run) how long to wait for another's call to come back before asking
}

export const MINDS: Record<string, MindSettings> = {
  // Dot, the protagonist: the most thinking, for planning, the unknown and its failures
  dot: { on: true, deep: { model: 'claude-opus-5-5', dailyCap: 200, maxTokens: 900 }, light: { model: 'claude-haiku-4-5-20251001', dailyCap: 400, maxTokens: 600 }, minGapS: 20, ponderMaxS: 12 },
  // (the other three: step 2 and 3 of ADR 0004 — their own loops, lighter thinking)
  rakko: { on: true, deep: null, light: { model: 'claude-haiku-4-5-20251001', dailyCap: 100, maxTokens: 500 }, minGapS: 60, ponderMaxS: 8 },
  kame: { on: false, deep: null, light: { model: 'claude-haiku-4-5-20251001', dailyCap: 100, maxTokens: 500 }, minGapS: 60, ponderMaxS: 8 },
  lantern: { on: false, deep: null, light: { model: 'claude-haiku-4-5-20251001', dailyCap: 100, maxTokens: 500 }, minGapS: 60, ponderMaxS: 8 },
};

export const PRICE: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 }, 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-haiku-4-5-20251001': { in: 1, out: 5 },
};
