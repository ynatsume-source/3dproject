// The residents' own words, written by Claude when the person watching has given an API key (kept in
// this browser only). Without one, they speak from their prepared lines. A prototype: the key goes
// straight from the browser to the API; a server will stand in between later.
import type { Voice } from './voices';

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
async function boundedResponse(r: Response): Promise<unknown> {
  const reader = r.body?.getReader();
  if (!reader) throw new TransportError('API の応答を読み取れませんでした。');
  const decoder = new TextDecoder(); let size = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 64 * 1024) { void reader.cancel().catch(() => {}); throw new TransportError('API の応答が長すぎました。'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

// Conversations and optional resident decisions share one request slot and the same daily budget.
// Failures count too. No network work starts without a key; aborted requests do not hold the slot.
export async function requestAiText(system: string, user: string, options: { maxTokens?: number; signal?: AbortSignal } = {}): Promise<string | null> {
  const key = aiKey(); if (!key || busy || options.signal?.aborted || used() >= DAILY) return null;
  busy = true; count();
  const controller = new AbortController(); let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
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
        body: JSON.stringify({ model: MODEL, max_tokens: Math.max(1, Math.min(1200, Math.floor(options.maxTokens || 700))), system, messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw new TransportError(`API エラー (HTTP ${Number.isInteger(r.status) ? r.status : 0})。`);
      const j = await boundedResponse(r) as { content?: { type?: string; text?: string }[] };
      if (!Array.isArray(j?.content)) throw new TransportError('API の応答形式を読み取れませんでした。');
      const text = j.content.filter(c => c?.type === 'text' && typeof c.text === 'string').map(c => c.text).join('');
      if (!text || text.length > 16000) throw new TransportError('API の応答形式を読み取れませんでした。');
      return text;
    };
    const text = await Promise.race([request(), aborted]);
    aiLastError = '';
    return text;
  } catch (e) {
    // Never display a response body or network exception: either may contain credentials or HTML.
    aiLastError = timedOut ? 'API の応答が8秒以内に届きませんでした。' :
      e instanceof TransportError ? e.message : 'API へ接続できなかったか、応答を読み取れませんでした。';
    return null;
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort!); controller.abort(); busy = false;
  }
}

const STAGE_GOAL = [
  'はじめて出会った。短く挨拶を交わすだけ（まだ名前も知らない）。',
  '二度目。お互いに名前と、島でふだん何をしているかを自己紹介する。',
  '少し慣れてきた。それぞれ、島で暮らすためのコツをひとつずつ教え合う。',
  '顔見知り。今日あったことや最近のことを話す。',
  '打ち解けてきた。近況を話し、片方がぽつりと個人的な悩みを打ち明け、もう片方が自分らしく受け止める。',
  '悩みを話せる仲。前に聞いた悩みのその後を気にかけたり、新しい話をしたりする。',
];
// a short exchange between A and B, in their own voices
export async function aiConverse(a: Voice, b: Voice, stage: number, stageName: string, aDid: string[], bDid: string[], recent: string[]) {
  const system = 'あなたは、実在の無人島・嘉弥真島（沖縄県八重山）で独立して暮らす住人たち（小さなロボットのドットとランタン、本物の生き物のアオウミガメのカメマルとラッコ）の会話を書く作家です。' +
    'それぞれが自分の力で島での暮らしを築いている。カメマルとラッコは本物の動物として食べ、眠り、泳ぐ。人間は島にいない。説明や地の文は書かず、指定のJSONだけを返す。';
  const user = [
    `A: ${a.mind}`, `B: ${b.mind}`,
    `ふたりの関係: ${stageName}。今回の会話: ${STAGE_GOAL[Math.min(stage, 5)]}`,
    `Aの今日: ${aDid.join('、') || '特になし'}`, `Bの今日: ${bDid.join('、') || '特になし'}`,
    recent.length ? `最近の会話（島全体）:\n${recent.join('\n')}` : '',
    'A が話しかける。4〜7行、1行40字以内、それぞれの口調を守る。最後はどちらかの短い別れの言葉。',
    '形式: [{"who":"A","text":"…"},{"who":"B","text":"…"}]',
  ].filter(Boolean).join('\n');
  const out = await requestAiText(system, user);
  if (!out) return null;
  try {
    const m = out.match(/\[[\s\S]*\]/); if (!m) return null;
    const arr = JSON.parse(m[0]) as { who: string; text: string }[];
    return arr.filter((l) => (l.who === 'A' || l.who === 'B') && typeof l.text === 'string' && l.text.length > 0).slice(0, 8).map((l) => ({ who: l.who as 'A' | 'B', text: l.text.slice(0, 80) }));
  } catch (e) { return null; }
}
