// A resident's day for 島だより. The log is the island's own record, as it was kept at the time: what happened (事象 —
// what it set out to do and what came of it, what it met, was told, photographed, ate) and, beside it, what its mind
// set down then (its goal and why, its hypothesis, what it found true or false). Nothing in the log is written
// afterwards. What the resident writes is only the end of the day: looking back over that log — the day as a whole,
// where things stand, what is still unknown, what next — and a title, and (a day without photographs) a picture it
// drew. What comes back is checked here; a post that fails is asked for again once, then dropped.
import type { Post, PhotoRecord } from './types';

export interface PostInput {
  who: string; name: string; profile: string; day: string;
  island?: string;   // the island's own dates over the day (its calendar runs faster: ADR 0006)
  entries: { time: string; text: string; key?: string }[];   // its own diary that day, as kept (key: what kind of line)
  photos: (Pick<PhotoRecord, 'id' | 'subject' | 'why'> & { time: string })[];
  talks: { time: string; with: string; text: string }[];   // lines it said or heard that day
}
export type Ask = (system: string, user: string) => Promise<string | null>;
export type LogRow = { t: string; world: string; me: string; photo?: string };

const STYLE: Record<string, { voice: string; max: number }> = {
  dot: { max: 1200, voice: 'ドット。一人称は「ぼく」。普通の、読みやすい常体。短い文。言い切る。見立て（仮説）と確かめたことは分けて言う。分からないことは分からないと言う。かっこよく見せる言い回し、詩的な表現、教訓めいたまとめ、読者への語りかけはしない。' },
  rakko: { max: 700, voice: 'ラッコ。一人称は「僕」。子どもの、短い素直なことば。かわいく見せる演出（語尾の飾り、擬音の連発、感嘆符の多用）はしない。' },
};
const SVG_MAX = 20000;
/** Feelings and sensations the island does not have (no state of the world stands behind them): a post does not
 *  claim them. What it has is said with its value — おなか・ねむけ, the battery, progress, what was found or failed. */
export const UNMODELLED = /寂し|さみし|淋し|嬉し|うれし|楽し|たのし|安心|不安|あった[かけ]|温か|暖か|好き|落ち着|疲れ|悲し|かなし|怖|こわい|幸せ|わくわく|ドキドキ|ほっと|心細|恋し|懐かし|なつかし|感動|気持ちい|きもちい|ワクワク/;

/** Its mind's own lines, as it set them down when it decided: a goal and why, a hypothesis, a verdict. */
const THOUGHT = /^(目的|仮説|確かめた|違っていた)：/;
/** What the world itself records: a step begun and its result, a meeting, a photograph, the body, its mind's lines. */
const RECORD = new Set(['do', 'got', 'met', 'photo', 'body', 'mind', 'weather']);
/** The day's log, straight from its records: one row a minute — what happened, and what its mind set down then.
 *  The same thing over and over with nothing decided in between is one row, with how many times and until when.
 *  (A failure its mind also noted is already in what happened: not said twice.) */
export function buildLog(entries: PostInput['entries']): LogRow[] {
  const rows: (LogRow & { n: number; until: string })[] = [];
  for (const [i, e] of entries.entries()) {
    // (the world's own records only — not the character's voice lines kept beside them; a step begun is shown by its
    // result, when it has one)
    if (e.key && !RECORD.has(e.key)) continue;
    if (e.key === 'do' && entries.slice(i + 1).some((x) => x.key === 'got' && x.text.startsWith(`${e.text}：`))) continue;
    const me = e.key === 'mind' && THOUGHT.test(e.text);
    if (e.key === 'mind' && /^うまくいかなかった：/.test(e.text)) continue;
    let row = rows[rows.length - 1];
    if (!row || row.t !== e.time) { row = { t: e.time, world: '', me: '', n: 1, until: e.time }; rows.push(row); }
    if (me) row.me = row.me ? `${row.me}\n${e.text}` : e.text;
    else if (!row.world.split('\n').includes(e.text)) row.world = row.world ? `${row.world}\n${e.text}` : e.text;
  }
  const out: typeof rows = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && !r.me && !last.me && last.world && last.world === r.world) { last.n++; last.until = r.t; continue; }
    out.push(r);
  }
  return out.map(({ n, until, ...r }) => ({ ...r, world: n > 1 ? `${r.world}（${n}回、${until}まで）` : r.world }));
}

// What the resident writes: the end of its day, looking back over the log (which it is given, and does not rewrite).
function system(who: string, withPhotos: boolean) {
  const st = STYLE[who] ?? STYLE.rakko;
  return `あなたは、地球と同じ形をした人の住まない星の、ある島で暮らす住人で、AI。この星に人間はいない。人間の地名は知らないので、場所は「この島」「北の浜」など自分たちの呼び方で言う。一日の終わりに、島だよりに載せる「今日のふりかえり」を書く。読者は住人がAIだと知っている。
入力の log は、その日に世界が記録したもの（world：起きたこと）と、そのときあなたの考える部分が書き残したもの（me：目的・仮説・確かめたこと）。log は記事にそのまま載る。あなたは log を書き直さない。
書くもの：
- review.summary：log を通して見た、今日の総括（2〜4文）。
- review.state：一日の終わりの状態（数・進み具合・持ち物・体の値など、短い項目）。
- review.unknown：まだ分からないこと、確かめていないこと。
- review.outlook：明日以降にやること（理由つき、短く）。
- title：今日を表す題（30字以内、出来事をそのまま）。
- sns：人間界のSNSに載せる短い投稿（140字以内）。今日の取り組み・分かったこと・次にやることを、外の人に伝わるように。URL・絵文字・ハッシュタグは使わない。
広報の役割：記事の写真と絵、SNS投稿は、あなたの役割の一つ「人間界への広報」として作る。いま取り組んでいること、学んだこと（確かめた仮説・当たり）、これからの道のりを、島の外の人に伝えるためのもの。飾りの演出はしない。
話し方：${st.voice}
この世界にあるものだけで書く（ゲームをプレイしているAIが、自分の状況と判断を報告するように）：
- island はこの島の暦の日付（地球の暦より速く進む）。季節や台風は、この島の暦と log の天気の記録で言う。
- 根拠は log・talks・photos だけ。記録にないことを、したこと・見たこととして書かない。数や大きさ、天気、水温などを作らない。
- 住人の内側として書けるのは、世界が持っている値だけ：おなか・ねむけ（ラッコ）、電池（ドット）、進み具合（小屋 1/24 など）、持ち物、会った相手との段階、目的・仮説・確かめた結果。
- 世界にない気持ちや感覚（寂しい・うれしい・楽しい・安心・不安・温かい・好き・落ち着かない・疲れた など）は書かない。理由は世界の中の理由で書く（足りないもの、進み具合、体の値、失敗とその原因、見つけたもの、頼まれたこと）。
- 地球の場所・生き物の知識を、記録にないこととして断定しない。外部リンク、URL、宣伝、政治、実在の人物の話は書かない。
${withPhotos
    ? '- 写真：photos から、取り組みが伝わるものを1〜3枚選び、caption（何を写したか・何の記録か、50字以内）を書く。写真は撮った時刻の log の行に置かれる。'
    : `- 今日は写真を撮らなかった。かわりに図を一枚描く。人間界に取り組みを伝える図にする（例：進み具合、仮説と結果、これからの道のり、島の中の位置関係）。
  drawing.svg に SVG を書く：<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"> で始め、図形・パス・グラデーション・文字だけを使う。画像の読み込み、外部への参照、script、イベント属性は使わない。${SVG_MAX}字以内。背景も描く。
  drawing.caption に、何の図かを短く（60字以内）。photos は空の配列にする。`}
返答は JSON オブジェクトだけ：
{"title":"…","sns":"…","review":{"summary":["…"],"state":["…"],"unknown":["…"],"outlook":["…"]},${withPhotos ? '"photos":[{"id":"写真のid","caption":"…"}]' : '"photos":[],"drawing":{"svg":"<svg ...>...</svg>","caption":"…"}'},"tags":["短い言葉", ...]}
文字は title と review で合わせて${st.max}字以内（sns と絵を除く）。tags は5個まで。`;
}

/** A drawing it may put up: an SVG of shapes and words only — nothing that loads, links out or runs. '' if it may
 *  stand, else what is wrong. (Shown through <img>, where nothing in it would run anyway; checked all the same.) */
export function checkSvg(svg: unknown): string {
  if (typeof svg !== 'string' || !svg.trim()) return '絵（drawing.svg）がない';
  const t = svg.trim();
  if (t.length > SVG_MAX) return `絵が${SVG_MAX}字を超えている`;
  if (!/^<svg[\s>]/i.test(t) || !/<\/svg>\s*$/i.test(t)) return '絵は <svg ...> で始まり </svg> で終わる';
  if (/<script|<foreignObject|<image|<iframe|<object|<embed|<use[\s>]|javascript:|data:|@import|on[a-z]+\s*=/i.test(t)) return '絵に script・画像・外部参照・イベント属性は使えない';
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(t) || /url\(\s*['"]?(?!#)/i.test(t)) return '絵の中から外を参照しない';
  return '';
}

/** The checks every post goes through: '' if it may stand, else what is wrong (told to the writer on the retry). */
export function checkPost(p: unknown, inp: PostInput): string {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'JSON オブジェクトではない';
  const o = p as Record<string, unknown>, st = STYLE[inp.who] ?? STYLE.rakko;
  if (Object.keys(o).some((k) => !['title', 'sns', 'review', 'photos', 'tags', 'drawing'].includes(k))) return '余計な項目がある（log は書かない）';
  if (typeof o.sns !== 'string' || !o.sns.trim() || o.sns.length > 140) return 'sns は140字以内で書く';
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 30) return 'title が空か長すぎる';
  const rv = o.review as Record<string, unknown>;
  if (!rv || typeof rv !== 'object') return 'review がない';
  for (const k of ['summary', 'state', 'unknown', 'outlook']) if (!Array.isArray(rv[k]) || (rv[k] as unknown[]).some((x) => typeof x !== 'string')) return `review.${k} は文字の配列`;
  if (!(rv.summary as string[]).length || !(rv.outlook as string[]).length) return 'review.summary と review.outlook は少なくとも一つ';
  const own = [o.title, ...['summary', 'state', 'unknown', 'outlook'].flatMap((k) => rv[k] as string[])].join('\n'), text = `${own}\n${o.sns}`;
  if (own.length > st.max) return `文字が全部で${st.max}字を超えている`;
  { const f = text.match(UNMODELLED); if (f) return `「${f[0]}」のような、世界にない気持ちや感覚を書かない（理由は世界の中の理由で）`; }
  if (/https?:|www\.|\.(com|jp|net|org)\b|@[a-z0-9_]/i.test(text)) return 'URL や宛先を含めない';
  if (inp.photos.length) {
    const ids = new Set(inp.photos.map((x) => x.id));
    if (!Array.isArray(o.photos) || o.photos.length < 1 || o.photos.length > 3) return '写真は1〜3枚';
    for (const ph of o.photos as Record<string, unknown>[]) {
      if (!ph || typeof ph.id !== 'string' || !ids.has(ph.id)) return `写真の id は photos のものだけ（${String(ph?.id)}）`;
      if (typeof ph.caption !== 'string' || ph.caption.length > 50) return 'caption は50字以内';
    }
    if (new Set((o.photos as { id: string }[]).map((x) => x.id)).size !== (o.photos as unknown[]).length) return '同じ写真を二度使わない';
    if (o.drawing !== undefined) return '写真のある日は絵を載せない';
  } else {
    if (o.photos !== undefined && (!Array.isArray(o.photos) || o.photos.length)) return '写真を撮っていない日は photos を空にする';
    const d = o.drawing as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') return '写真のない日は絵（drawing）を描く';
    const bad = checkSvg(d.svg); if (bad) return bad;
    if (typeof d.caption !== 'string' || !d.caption.trim() || d.caption.length > 60) return '絵の caption は60字以内';
  }
  if (o.tags !== undefined && (!Array.isArray(o.tags) || o.tags.length > 5 || o.tags.some((t) => typeof t !== 'string' || t.length > 12))) return 'tags は5個まで、各12字以内';
  return '';
}

/** Each photograph it put up sits on the log's row for the minute it was taken (or the last one before). */
function placePhotos(log: LogRow[], inp: PostInput, ids: string[]) {
  for (const id of ids) {
    const t = inp.photos.find((x) => x.id === id)?.time; if (!t) continue;
    const row = [...log].reverse().find((r) => r.t <= t && !r.photo) ?? log.find((r) => !r.photo); if (row) row.photo = id;
  }
}

/** Its post for the day: the log from its records, and its look back, written by a model (ask) — or null (no answer,
 *  or one that would not pass after a second try). */
export async function writePost(inp: PostInput, ask: Ask, by: string, onIssue?: (why: string) => void): Promise<Post | null> {
  const withPhotos = inp.photos.length > 0;
  const log = buildLog(inp.entries);
  const user = JSON.stringify({ who: inp.who, name: inp.name, profile: inp.profile.slice(0, 1200), day: inp.day, island: inp.island, log: log.slice(-240), photos: inp.photos, talks: inp.talks.slice(-30) });
  let note = '';
  for (let k = 0; k < 2; k++) {
    const text = await ask(system(inp.who, withPhotos), note ? `${user}\n\n前回の返答は次の理由で使えなかった。直して書き直す：${note}` : user);
    if (!text) { onIssue?.('返事がなかった'); return null; }
    let p: any = null;
    try { p = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')); } catch (e) { note = 'JSON として読めない'; onIssue?.(note); continue; }
    note = checkPost(p, inp); if (note) onIssue?.(note);
    if (!note) {
      const photos = withPhotos ? p.photos.map((x: any) => ({ id: x.id, caption: x.caption.trim() })) : [];
      placePhotos(log, inp, photos.map((x: { id: string }) => x.id));
      return {
        id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, ...(inp.island ? { island: inp.island } : {}), title: p.title.trim(), sns: p.sns.trim(), body: [], log,
        review: { summary: p.review.summary.map((x: string) => x.trim()), state: p.review.state.map((x: string) => x.trim()), unknown: p.review.unknown.map((x: string) => x.trim()), outlook: p.review.outlook.map((x: string) => x.trim()) },
        photos, ...(withPhotos ? {} : { drawing: { svg: p.drawing.svg.trim(), caption: p.drawing.caption.trim() } }),
        tags: (p.tags ?? []).map((t: string) => t.trim()).filter(Boolean), written: new Date().toISOString(), by,
      };
    }
  }
  return null;
}

/** Without a model (a dry run, for checking the pages and the photographs): its own diary lines stitched as they are.
 *  Marked 'draft': never published. A day without photographs gets a plain placeholder picture. */
export function draftPost(inp: PostInput): Post {
  const log = buildLog(inp.entries);
  const photos = inp.photos.slice(0, 3).map((p) => ({ id: p.id, caption: p.subject.label }));
  placePhotos(log, inp, photos.map((x) => x.id));
  return {
    id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: `${inp.name}の${inp.day.slice(5).replace('-', '月')}日`, body: [],
    log: log.length ? log : [{ t: '06:00', world: '（記録のない一日）', me: '' }],
    review: { summary: ['（下書き：AIなしでは総括は書かない）'], state: [], unknown: [], outlook: ['（下書き）'] },
    photos,
    ...(inp.photos.length ? {} : { drawing: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e9e3d6"/><text x="400" y="310" font-size="28" text-anchor="middle" fill="#6b6255">（下書き：絵はAIが描く）</text></svg>', caption: '下書きの仮の絵' } }),
    tags: ['下書き'], written: new Date().toISOString(), by: 'draft',
  };
}
