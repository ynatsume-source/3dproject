// The residents' own words, written by Claude when the person watching has given an API key (kept in
// this browser only). Without one, they speak from their prepared lines. A prototype: the key goes
// straight from the browser to the API; a server will stand in between later.

const KEY = 'seaglass.aikey', MODEL = 'claude-haiku-4-5-20251001';
const DAILY = 120;   // at most this many calls a day
let busy = false;
let memoryKey: string | null = null, memoryDay = '', memoryUsed = 0, sessionKeyOverride = false;

export function aiKey(): string | null {
  if (!sessionKeyOverride) try { memoryKey = localStorage.getItem(KEY); } catch (e) { /* session fallback */ }
  return memoryKey;
}
export function setAiKey(k: string | null) {
  memoryKey = k?.trim() || null;
  try {
    if (memoryKey) localStorage.setItem(KEY, memoryKey); else localStorage.removeItem(KEY);
    sessionKeyOverride = false;
  } catch (e) { sessionKeyOverride = true; }
}
export function aiReady() { return !!aiKey() && !busy && used() < DAILY; }
export let aiLastError = '';
function used() {
  const day = new Date().toDateString();
  if (memoryDay !== day) { memoryDay = day; memoryUsed = 0; }
  try {
    const s = JSON.parse(localStorage.getItem('seaglass.aiuse') || '{}');
    if (s?.d === day && Number.isSafeInteger(s.n) && s.n >= 0) memoryUsed = Math.max(memoryUsed, s.n);
  } catch (e) { /* quota still applies when storage is unavailable */ }
  return memoryUsed;
}
function count() {
  memoryUsed = used() + 1;
  try { localStorage.setItem('seaglass.aiuse', JSON.stringify({ d: memoryDay, n: memoryUsed })); } catch (e) { /* session fallback */ }
}

class TransportError extends Error {}
async function boundedResponse(r: Response, max = 64 * 1024): Promise<unknown> {
  const reader = r.body?.getReader();
  if (!reader) throw new TransportError('API の応答を読み取れませんでした。');
  const decoder = new TextDecoder(); let size = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) { void reader.cancel().catch(() => {}); throw new TransportError('API の応答が長すぎました。'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

// Conversations and optional resident decisions share one request slot and the same daily budget.
// Failures count too. No network work starts without a key; aborted requests do not hold the slot.
/** What one call used, from the API's own count (for the operating log: robots/agent/config.ts). */
export interface AiUsage { model: string; input: number; output: number; cacheRead: number; cacheWrite: number; ms: number }
// (a pool: a resident's own allowance for the day, kept apart from the conversations' — ADR 0004)
function poolUsed(name: string) {
  const day = new Date().toDateString();
  try { const s = JSON.parse(localStorage.getItem('seaglass.aipool') || '{}'); return s?.d === day && Number.isSafeInteger(s[name]) ? s[name] as number : 0; } catch (e) { return 0; }
}
function poolCount(name: string) {
  const day = new Date().toDateString();
  try { let s = JSON.parse(localStorage.getItem('seaglass.aipool') || '{}'); if (s?.d !== day) s = { d: day }; s[name] = (Number.isSafeInteger(s[name]) ? s[name] : 0) + 1; localStorage.setItem('seaglass.aipool', JSON.stringify(s)); } catch (e) { /* session only */ }
}
export function aiPoolLeft(name: string, cap: number) { return Math.max(0, cap - poolUsed(name)); }
export async function requestAiText(system: string, user: string, options: { maxTokens?: number; signal?: AbortSignal; timeoutMs?: number; leave?: number; model?: string; pool?: { name: string; cap: number }; onUsage?: (u: AiUsage) => void; queueMs?: number; maxChars?: number } = {}): Promise<string | null> {
  // (leave: calls kept back from the day's budget for others — a resident's own decisions never use up the conversations')
  // (queueMs: while another call is out, wait this long for it rather than giving up at once)
  for (const until = performance.now() + (options.queueMs ?? 0); busy && performance.now() < until;) await new Promise((res) => setTimeout(res, 100));
  const key = aiKey(); if (!key || options.signal?.aborted) return null;
  if (busy) { aiLastError = 'ほかの問い合わせの返事待ちで、出せなかった。'; return null; }
  if (options.pool ? poolUsed(options.pool.name) >= options.pool.cap : used() >= DAILY - (options.leave ?? 0)) return null;
  busy = true; if (options.pool) poolCount(options.pool.name); else count();
  const model = options.model ?? MODEL, t0 = Date.now();
  const controller = new AbortController(); let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const waitMs = options.timeoutMs ?? 20000, timeout = setTimeout(() => { timedOut = true; controller.abort(); }, waitMs);
  let onAbort: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new TransportError('API の応答待ちを中止しました。'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const request = async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: Math.max(1, Math.min(options.maxChars ? 12000 : 2000, Math.floor(options.maxTokens || 700))), system, messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw new TransportError(`API エラー (HTTP ${Number.isInteger(r.status) ? r.status : 0})。`);
      const j = await boundedResponse(r, options.maxChars ? 4 * options.maxChars : undefined) as { content?: { type?: string; text?: string }[]; usage?: Record<string, number> };
      const u = j?.usage ?? {}, n = (v: unknown) => (Number.isFinite(v) ? Number(v) : 0);
      options.onUsage?.({ model, input: n(u.input_tokens), output: n(u.output_tokens), cacheRead: n(u.cache_read_input_tokens), cacheWrite: n(u.cache_creation_input_tokens), ms: Date.now() - t0 });
      if (!Array.isArray(j?.content)) throw new TransportError('API の応答形式を読み取れませんでした。');
      const text = j.content.filter(c => c?.type === 'text' && typeof c.text === 'string').map(c => c.text).join('');
      if (!text || text.length > (options.maxChars ?? 16000)) throw new TransportError('API の応答形式を読み取れませんでした。');
      return text;
    };
    const text = await Promise.race([request(), aborted]);
    aiLastError = '';
    return text;
  } catch (e) {
    // Never display a response body or network exception: either may contain credentials or HTML.
    aiLastError = timedOut ? `API の応答が${Math.round(waitMs / 1000)}秒以内に届きませんでした。` :
      e instanceof TransportError ? e.message : 'API へ接続できなかったか、応答を読み取れませんでした。';
    return null;
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort!); controller.abort(); busy = false;
  }
}

