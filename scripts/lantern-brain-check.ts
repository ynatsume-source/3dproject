// Mock-only transport checks. This script must never contact a live model or use a real API key.
// npx tsx scripts/lantern-brain-check.ts
import assert from 'node:assert/strict';
import { aiConverse, aiKey, aiLastError, aiReady, requestAiText, setAiKey } from '../src/robots/mind';
import { requestLanternDecision } from '../src/robots/lantern-brain';
import type { StudyBrainInput, StudyProposal } from '../src/robots/lantern-study-types';

const oldFetch = globalThis.fetch, oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const RealDate = globalThis.Date, realTimeout = globalThis.setTimeout;
let clock = Date.UTC(2026, 9, 2, 12), getThrows = false, setThrows = false, calls = 0;
const store = new Map<string, string>();
class TestDate extends RealDate {
  constructor(value?: string | number) { super(value === undefined ? clock : value); }
  static now() { return clock; }
}
globalThis.Date = TestDate as typeof Date;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => { if (getThrows) throw Error('blocked'); return store.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (setThrows) throw Error('quota'); store.set(k, v); },
  removeItem: (k: string) => { if (setThrows) throw Error('quota'); store.delete(k); },
} });

const input: StudyBrainInput = {
  profile: 'ランタン。星と夜の探検が好き。',
  world: { atMs: clock, lat: 24.338, lon: 124.334, battery: 0.6, position: [15, -12], cloud: 0.2, cloudSource: 'live',
    places: [{ id: 'private-unseen-place', name: '未訪問の場所', x: 900, z: 900, openSky: true }],
    companions: [{ id: 'unseen-resident', name: '未知の相手', x: 999, z: 999 }], offline: false },
  options: [{ id: 'observe:hill', action: 'observe', targetId: 'hill', label: '丘で星を見る', x: 15, z: -12 }],
  interests: { patterns: 0.6, brightness: 0.3, horizon: 0.1 },
  memories: [{ id: 'memory-1', atMs: clock - 3600000, kind: 'observation', text: '丘で星を観察した。', offline: false }],
  work: { id: 'work-1', title: '明るさの違い', question: 'どの星が先に見えるだろう', focus: 'brightness',
    createdAt: clock, updatedAt: clock, observationIds: ['obs-1'], revisions: 1, caption: '', sharedWith: [] },
};
const valid: StudyProposal = { optionId: 'observe:hill', reason: '昨日見つけた星をもう一度見たい。', focus: 'brightness', question: '今夜も同じ星が先に見えるだろうか。' };
let lastRequest: { url: string; init: RequestInit } | null = null;
let reply: (init: RequestInit) => Promise<Response> = async () => message(JSON.stringify(valid));
const message = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
  calls++; lastRequest = { url: String(url), init }; return reply(init);
}) as typeof fetch;
const ask = (signal = new AbortController().signal) => requestLanternDecision(input, signal);
const nextDay = () => { clock += 86400000; };

try {
  setAiKey(null);
  assert.equal(await ask(), null); assert.equal(calls, 0, 'no key starts no request');
  setAiKey(' mock-only-key '); assert.equal(aiKey(), 'mock-only-key');
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  assert.equal(await ask(alreadyAborted.signal), null); assert.equal(calls, 0, 'pre-aborted request costs nothing');
  assert.deepEqual(await ask(), valid);
  assert.equal(calls, 1);
  const payload = JSON.parse(String(lastRequest!.init.body));
  assert.equal(lastRequest!.url, 'https://api.anthropic.com/v1/messages');
  assert.equal((lastRequest!.init.headers as Record<string, string>)['x-api-key'], 'mock-only-key');
  assert.equal(payload.model, 'claude-haiku-4-5-20251001');
  assert.ok(payload.max_tokens <= 700);
  const context = JSON.parse(payload.messages[0].content);
  assert.equal(context.memories[0].text, input.memories[0].text);
  assert.equal(context.work.observationCount, 1);
  assert.deepEqual(context.availableOptions[0], { id: 'observe:hill', action: 'observe', label: '丘で星を見る', targetId: 'hill' });
  assert.equal(payload.messages[0].content.includes('private-unseen-place'), false, 'not the whole island');
  assert.equal(payload.messages[0].content.includes('unseen-resident'), false);
  assert.equal(payload.messages[0].content.includes('mock-only-key'), false, 'key is not prompt data');
  assert.equal(Object.hasOwn(context.now, 'position'), false);
  assert.match(payload.system, /実行前の提案/);

  for (const malformed of [
    'not json', 'null', '[]', JSON.stringify({ ...valid, optionId: 'teleport:anywhere' }),
    JSON.stringify({ ...valid, reason: 'a'.repeat(181) }), JSON.stringify({ ...valid, question: '' }),
    JSON.stringify({ ...valid, focus: 'arbitrary' }), JSON.stringify({ ...valid, caption: 'a'.repeat(241) }),
    JSON.stringify({ ...valid, code: 'doSomething()' }), JSON.stringify({ ...valid, x: 1234 }),
    `Prefix ${JSON.stringify(valid)}`, ' '.repeat(4097),
  ]) { reply = async () => message(malformed); assert.equal(await ask(), null, `rejects ${malformed.slice(0, 50)}`); }
  reply = async () => message('```json\n' + JSON.stringify(valid) + '\n```');
  assert.deepEqual(await ask(), valid, 'single code fence may wrap plain JSON');

  reply = async () => new Response('<html>mock-only-key private server details</html>', { status: 401 });
  assert.equal(await ask(), null); assert.match(aiLastError, /401/); assert.ok(!aiLastError.includes('mock-only-key'));
  reply = async () => { throw new Error('mock-only-key secret network exception'); };
  assert.equal(await ask(), null); assert.ok(!aiLastError.includes('mock-only-key'));
  reply = async () => new Response('{broken');
  assert.equal(await ask(), null);
  reply = async () => new Response('x'.repeat(65537));
  assert.equal(await ask(), null); assert.match(aiLastError, /長すぎ/);
  reply = async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { code: 'ignored' } }] }));
  assert.equal(await ask(), null, 'no tool use is interpreted');

  let blockedSignal: AbortSignal | undefined;
  reply = async init => { blockedSignal = init.signal!; return new Promise<Response>(() => {}); };
  const controller = new AbortController(), beforeBusy = calls;
  const waiting = ask(controller.signal);
  assert.equal(aiReady(), false);
  assert.equal(await requestAiText('other caller', 'must wait'), null);
  assert.equal(await aiConverse({ mind: 'A' } as any, { mind: 'B' } as any, 1, '友達', [], [], []), null);
  assert.equal(calls, beforeBusy + 1, 'conversations and decisions share one slot');
  controller.abort(); assert.equal(await waiting, null); assert.ok(blockedSignal!.aborted); assert.ok(aiReady());

  // Advance only the transport watchdog, not world time; no eight-second wall-clock sleep needed.
  globalThis.setTimeout = ((fn: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    assert.equal(ms, 8000, 'watchdog is at most eight seconds'); return realTimeout(fn, 1, ...args);
  }) as typeof setTimeout;
  assert.equal(await ask(), null); assert.match(aiLastError, /8秒/); assert.ok(blockedSignal!.aborted); assert.ok(aiReady());
  globalThis.setTimeout = realTimeout;

  reply = async () => message('[{"who":"A","text":"こんにちは"},{"who":"B","text":"星が見えるね"}]');
  assert.deepEqual(await aiConverse({ mind: 'A' } as any, { mind: 'B' } as any, 1, '友達', [], [], []),
    [{ who: 'A', text: 'こんにちは' }, { who: 'B', text: '星が見えるね' }], 'existing conversation format preserved');
  reply = async () => message(JSON.stringify(valid));

  nextDay(); store.set('seaglass.aiuse', JSON.stringify({ d: new Date().toDateString(), n: 119 }));
  const beforeCap = calls; assert.deepEqual(await ask(), valid);
  assert.equal(await ask(), null); assert.equal(await requestAiText('s', 'u'), null); assert.equal(calls, beforeCap + 1);
  assert.equal(aiReady(), false, 'daily cap is enforced inside transport, not only by aiReady');
  assert.equal(JSON.parse(store.get('seaglass.aiuse')!).n, 120);

  nextDay(); setThrows = true;
  const beforeWriteFailure = calls;
  for (let i = 0; i < 120; i++) assert.deepEqual(await ask(), valid);
  assert.equal(await ask(), null); assert.equal(calls, beforeWriteFailure + 120, 'stale readable storage does not overwrite the session quota');
  setAiKey(null); assert.equal(aiKey(), null, 'failed deletion cannot resurrect the old readable key');
  setAiKey('replacement-mock-key'); assert.equal(aiKey(), 'replacement-mock-key');

  nextDay(); getThrows = true;
  const beforeFallback = calls;
  for (let i = 0; i < 120; i++) assert.deepEqual(await ask(), valid);
  assert.equal(await ask(), null); assert.equal(calls, beforeFallback + 120);
  assert.equal(aiReady(), false, 'unavailable localStorage does not disable the quota');
  nextDay(); assert.ok(aiReady()); assert.deepEqual(await ask(), valid, 'next day renews in-memory budget');
  setAiKey(null); const beforeDelete = calls;
  assert.equal(await ask(), null); assert.equal(calls, beforeDelete, 'deleting a session-only key takes effect');
  console.log(JSON.stringify({ checks: 'PASS', transport: 'mock fetch only; no live API', requests: calls,
    dailyCap: 120, timeoutMs: 8000, validated: ['filtered prompt', 'proposal bounds', 'shared conversation slot', 'abort', 'timeout',
      'safe errors', 'response size', 'existing conversation', 'persisted quota', 'quota without storage', 'day rollover'] }, null, 2));
} finally {
  globalThis.fetch = oldFetch; globalThis.Date = RealDate; globalThis.setTimeout = realTimeout;
  if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
  else delete (globalThis as any).localStorage;
}
