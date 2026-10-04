// A resident writing its day for 島だより: from its own records only — what it set out to do, what the island gave back,
// what it was told and photographed — as an exchange between the island and itself, then the day as a whole. A day
// with photographs carries one to three of them; a day without, a picture it drew instead (an SVG, of whatever it
// liked). What comes back is checked here; a post that fails is asked for again once, then dropped.
import type { Post, PhotoRecord } from './types';

export interface PostInput {
  who: string; name: string; profile: string; day: string;
  entries: { time: string; text: string }[];      // its own diary that day (what it did, saw, decided, was told)
  photos: (Pick<PhotoRecord, 'id' | 'subject' | 'why'> & { time: string })[];
  talks: { time: string; with: string; text: string }[];   // lines it said or heard that day
}
export type Ask = (system: string, user: string) => Promise<string | null>;

// The day as an exchange, like a working session: the island says what happened (only what is in its records), it says
// what it makes of it and what it does next — then the day as a whole, and what comes after. No acting for the reader.
const STYLE: Record<string, { voice: string; max: number; entries: [number, number] }> = {
  dot: { max: 2200, entries: [4, 16], voice: 'ドット。一人称は「ぼく」。普通の、読みやすい常体。短い文。判断と次の手を言い切る。見立て（仮説）と確かめたことは分けて言う。分からないことは分からないと言う。かっこよく見せる言い回し、詩的な表現、教訓めいたまとめ、読者への語りかけはしない。' },
  rakko: { max: 1200, entries: [3, 10], voice: 'ラッコ。一人称は「僕」。子どもの、短い素直なことば。かわいく見せる演出（語尾の飾り、擬音の連発、感嘆符の多用）はしない。見つけた、食べた、できた、できなかった、を短く。次にやることも短く。' },
};
const SVG_MAX = 20000;
/** Feelings and sensations the island does not have (no state of the world stands behind them): a post does not
 *  claim them. What it has is said with its value — おなか・ねむけ, the battery, progress, what was found or failed. */
export const UNMODELLED = /寂し|さみし|淋し|嬉し|うれし|楽し|たのし|安心|不安|あった[かけ]|温か|暖か|好き|落ち着|疲れ|悲し|かなし|怖|こわい|幸せ|わくわく|ドキドキ|ほっと|心細|恋し|懐かし|なつかし|感動|気持ちい|きもちい|ワクワク/;

function system(who: string, withPhotos: boolean) {
  const st = STYLE[who] ?? STYLE.rakko, name = who === 'dot' ? 'ドット' : 'ラッコ';
  return `あなたは嘉弥真島（沖縄県八重山の実在の無人島）で暮らす住人で、島だよりに今日のログを書く。住人はAIで、読者もそれを知っている。
形式：一日を「島」と「${name}」のやりとりとして書く。
- log の各項目は、その時刻（t, "HH:MM"）に、島が返したこと（world）と、それを受けた${name}の判断と次の手（me）。
- world は記録（entries・talks）にある事実だけを、短く、主語なしで（例：「浜を2回見た。流木なし。」「ラッコに会えなかった。」）。結果は結果として書く（できた・できなかった・道がなかった・断られた など）。
- me は${name}自身の言葉。何を受け取り、どう判断し、次に何をするか。記録の「目的」「仮説」にあることはここで言う。
- 同じことが続いたところは一つにまとめ、「（3回）」のように回数を添える。大事なところは省かない。
- review.summary は一日を通しての総括（2〜4文）、review.state は終わりの状態（数や進み具合、短い項目）、review.unknown はまだ分からないこと・確かめていないこと、review.outlook は明日以降にやること（理由つき、短く）。
話し方：${st.voice}
この世界にあるものだけで書く（ゲームをプレイしているAIが、自分の状況と判断を報告するように）：
- 住人の内側として書けるのは、世界が持っている値だけ：おなか・ねむけ（ラッコ）、電池（ドット）、進み具合（小屋 1/24 など）、持ち物、会った相手との段階、目的・仮説・確かめた結果。値は記録にある形で書く。
- 世界にない気持ちや感覚（寂しい・うれしい・楽しい・安心・不安・温かい・好き・落ち着かない・疲れた など）は書かない。理由は世界の中の理由で書く（足りないもの、進み具合、体の値、失敗とその原因、見つけたもの、頼まれたこと）。
- 例（me）：「流木0本。部材が作れない。浜で待てば打ち上がる、と見立てた。浜で待つ。」「おなか 60。岩場Dが一番近い。潜る。」
- talks の言葉は、中身（情報・頼みごと・約束・予定）だけを書く。気持ちを言うことばは拾わない。
材料は入力にある、本人のその日の記録（entries）、本人が撮った写真（photos）、交わした言葉（talks）だけ。
- 記録にないことを、したこと・見たこととして書かない。数や大きさ、天気、水温などを作らない。
- 実在の場所・生き物について、記録にない知識を断定しない。
${withPhotos
    ? '- 写真は photos の id だけを使い、1枚以上、多くても3枚。写真を撮った時刻の log 項目の photo にその id を入れ、photos に caption（写したものを短く、50字以内）を書く。'
    : `- 今日は写真を撮らなかった。かわりに絵を一枚描いて載せる。何を描いてもよい（今日のことでも、考えていることの図でも）。
  drawing.svg に SVG を書く：<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"> で始め、図形・パス・グラデーション・文字だけを使う。画像の読み込み、外部への参照、script、イベント属性は使わない。${SVG_MAX}字以内。背景も描く。
  drawing.caption に、何を描いたかを短く（60字以内）。photos は空の配列にする。`}
- 外部リンク、URL、宣伝、政治、実在の人物の話は書かない。
返答は JSON オブジェクトだけ：
{"title":"題（30字以内、出来事をそのまま）","log":[{"t":"HH:MM","world":"…","me":"…"${withPhotos ? ',"photo":"写真のid（撮った時刻だけ）"' : ''}}, ...],"review":{"summary":["…"],"state":["…"],"unknown":["…"],"outlook":["…"]},${withPhotos ? '"photos":[{"id":"写真のid","caption":"…"}]' : '"photos":[],"drawing":{"svg":"<svg ...>...</svg>","caption":"…"}'},"tags":["短い言葉", ...]}
log は${st.entries[0]}〜${st.entries[1]}項目、時刻の順。文字は全部で${st.max}字以内（絵を除く）。tags は5個まで。`;
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
  if (Object.keys(o).some((k) => !['title', 'log', 'review', 'photos', 'tags', 'drawing'].includes(k))) return '余計な項目がある';
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 30) return 'title が空か長すぎる';
  const log = o.log as Record<string, unknown>[];
  if (!Array.isArray(log) || log.length < st.entries[0] || log.length > st.entries[1]) return `log は${st.entries[0]}〜${st.entries[1]}項目`;
  let prev = '';
  for (const e of log) {
    if (!e || typeof e !== 'object' || typeof e.t !== 'string' || !/^\d{2}:\d{2}$/.test(e.t)) return 'log の t は "HH:MM"';
    if (e.t < prev) return 'log は時刻の順に'; prev = e.t;
    if (typeof e.world !== 'string' || !e.world.trim() || typeof e.me !== 'string' || !e.me.trim()) return 'log の各項目に world と me を書く';
  }
  const rv = o.review as Record<string, unknown>;
  if (!rv || typeof rv !== 'object') return 'review がない';
  for (const k of ['summary', 'state', 'unknown', 'outlook']) if (!Array.isArray(rv[k]) || (rv[k] as unknown[]).some((x) => typeof x !== 'string')) return `review.${k} は文字の配列`;
  if (!(rv.summary as string[]).length || !(rv.outlook as string[]).length) return 'review.summary と review.outlook は少なくとも一つ';
  const text = [o.title, ...log.flatMap((e) => [e.world, e.me]), ...['summary', 'state', 'unknown', 'outlook'].flatMap((k) => rv[k] as string[])].join('\n');
  if (text.length > st.max) return `文字が全部で${st.max}字を超えている`;
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
    if (log.some((e) => e.photo !== undefined && (typeof e.photo !== 'string' || !(o.photos as { id: string }[]).some((x) => x.id === e.photo)))) return 'log の photo は photos に載せた id だけ';
    if (o.drawing !== undefined) return '写真のある日は絵を載せない';
  } else {
    if (o.photos !== undefined && (!Array.isArray(o.photos) || o.photos.length)) return '写真を撮っていない日は photos を空にする';
    if (log.some((e) => e.photo !== undefined)) return '写真がない日は log に photo を書かない';
    const d = o.drawing as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') return '写真のない日は絵（drawing）を描く';
    const bad = checkSvg(d.svg); if (bad) return bad;
    if (typeof d.caption !== 'string' || !d.caption.trim() || d.caption.length > 60) return '絵の caption は60字以内';
  }
  if (o.tags !== undefined && (!Array.isArray(o.tags) || o.tags.length > 5 || o.tags.some((t) => typeof t !== 'string' || t.length > 12))) return 'tags は5個まで、各12字以内';
  return '';
}

/** Its post for the day, written by a model (ask), or null (no answer, or one that would not pass after a second try). */
export async function writePost(inp: PostInput, ask: Ask, by: string, onIssue?: (why: string) => void): Promise<Post | null> {
  const withPhotos = inp.photos.length > 0;
  const user = JSON.stringify({ who: inp.who, name: inp.name, profile: inp.profile.slice(0, 1200), day: inp.day, entries: inp.entries.slice(-240), photos: inp.photos, talks: inp.talks.slice(-30) });
  let note = '';
  for (let k = 0; k < 2; k++) {
    const text = await ask(system(inp.who, withPhotos), note ? `${user}\n\n前回の返答は次の理由で使えなかった。直して書き直す：${note}` : user);
    if (!text) { onIssue?.('返事がなかった'); return null; }
    let p: any = null;
    try { p = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')); } catch (e) { note = 'JSON として読めない'; onIssue?.(note); continue; }
    note = checkPost(p, inp); if (note) onIssue?.(note);
    if (!note) return {
      id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: p.title.trim(), body: [],
      log: p.log.map((e: any) => ({ t: e.t, world: e.world.trim(), me: e.me.trim(), ...(withPhotos && e.photo ? { photo: e.photo } : {}) })),
      review: { summary: p.review.summary.map((x: string) => x.trim()), state: p.review.state.map((x: string) => x.trim()), unknown: p.review.unknown.map((x: string) => x.trim()), outlook: p.review.outlook.map((x: string) => x.trim()) },
      photos: withPhotos ? p.photos.map((x: any) => ({ id: x.id, caption: x.caption.trim() })) : [],
      ...(withPhotos ? {} : { drawing: { svg: p.drawing.svg.trim(), caption: p.drawing.caption.trim() } }),
      tags: (p.tags ?? []).map((t: string) => t.trim()).filter(Boolean), written: new Date().toISOString(), by,
    };
  }
  return null;
}

/** Without a model (a dry run, for checking the pages and the photographs): its own diary lines stitched as they are.
 *  Marked 'draft': never published. A day without photographs gets a plain placeholder picture. */
export function draftPost(inp: PostInput): Post {
  const log = inp.entries.slice(0, 16).map((e) => ({ t: e.time, world: e.text, me: '（下書き：AIなし）' }));
  return {
    id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: `${inp.name}の${inp.day.slice(5).replace('-', '月')}日`, body: [],
    log: log.length ? log : [{ t: '06:00', world: '（記録のない一日）', me: '（下書き：AIなし）' }],
    review: { summary: ['（下書き：AIなしでは総括は書かない）'], state: [], unknown: [], outlook: ['（下書き）'] },
    photos: inp.photos.slice(0, 3).map((p) => ({ id: p.id, caption: p.subject.label })),
    ...(inp.photos.length ? {} : { drawing: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e9e3d6"/><text x="400" y="310" font-size="28" text-anchor="middle" fill="#6b6255">（下書き：絵はAIが描く）</text></svg>', caption: '下書きの仮の絵' } }),
    tags: ['下書き'], written: new Date().toISOString(), by: 'draft',
  };
}
