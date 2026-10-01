// The residents' own words, written by Claude when the person watching has given an API key (kept in
// this browser only). Without one, they speak from their prepared lines. A prototype: the key goes
// straight from the browser to the API; a server will stand in between later.
import type { Voice } from './voices';

const KEY = 'seaglass.aikey', MODEL = 'claude-haiku-4-5-20251001';
const DAILY = 120;   // at most this many calls a day
let busy = false;

export function aiKey(): string | null { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
export function setAiKey(k: string | null) { try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
export function aiReady() { return !!aiKey() && !busy && used() < DAILY; }
export let aiLastError = '';
function used() {
  try { const s = JSON.parse(localStorage.getItem('seaglass.aiuse') || '{}'); return s.d === new Date().toDateString() ? s.n : 0; } catch (e) { return 0; }
}
function count() { try { localStorage.setItem('seaglass.aiuse', JSON.stringify({ d: new Date().toDateString(), n: used() + 1 })); } catch (e) { /* ignore */ } }

async function ask(system: string, user: string, maxTokens = 700): Promise<string | null> {
  const key = aiKey(); if (!key || busy) return null;
  busy = true; count();
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) { aiLastError = `${r.status} ${(await r.text()).slice(0, 160)}`; return null; }
    const j = await r.json();
    aiLastError = '';
    return (j.content || []).map((c: any) => c.text || '').join('');
  } catch (e: any) { aiLastError = String(e?.message || e); return null; } finally { busy = false; }
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
  const out = await ask(system, user);
  if (!out) return null;
  try {
    const m = out.match(/\[[\s\S]*\]/); if (!m) return null;
    const arr = JSON.parse(m[0]) as { who: string; text: string }[];
    return arr.filter((l) => (l.who === 'A' || l.who === 'B') && typeof l.text === 'string' && l.text.length > 0).slice(0, 8).map((l) => ({ who: l.who as 'A' | 'B', text: l.text.slice(0, 80) }));
  } catch (e) { return null; }
}
