// A resident writing its day for 島だより: from its own records only — what it did, saw, was told and photographed
// that day — in its own voice. A day with photographs carries one to three of them; a day without, a picture it
// drew instead (an SVG, of whatever it liked). What comes back is checked here; a post that fails is asked for
// again once, then dropped (no post rather than a wrong one).
import type { Post, PhotoRecord } from './types';

export interface PostInput {
  who: string; name: string; profile: string; day: string;
  entries: { time: string; text: string }[];      // its own diary that day (what it did, saw, decided, was told)
  photos: (Pick<PhotoRecord, 'id' | 'subject' | 'why'> & { time: string })[];
  talks: { time: string; with: string; text: string }[];   // lines it said or heard that day
}
export type Ask = (system: string, user: string) => Promise<string | null>;

const STYLE: Record<string, { voice: string; max: number; paras: [number, number] }> = {
  // (not a character played for the reader: an AI that lives here in earnest, trying to get on, written plainly)
  dot: { max: 1500, paras: [3, 8], voice: 'ドットの日誌。一人称は「ぼく」。読みやすい普通の日本語の常体で書く。カタコト、決め台詞、かわいく見せるための演出はしない。この島で本気で暮らし、小屋を建てようとしている AI として、その日に何を目指し、どう考え、何を試し、何がうまくいき、何がうまくいかなかったかを、具体的な出来事と時刻に即して正直に書く。うまくいかなかったことは飾らずに書き、なぜそうなったと思うか（見立て）と、まだ分からないことを分けて書く。誰かとのやりとりも、そのとき自分がどう受け取ったかを含めて書く。読者への説明口調や教訓めいたまとめにしない。最後の段落で、明日やってみることを一つ、理由と一緒に書く。' },
  rakko: { max: 420, paras: [1, 3], voice: 'ラッコの「写真日記」。写真（写真がない日は描いた絵）が主役で、短く、子どもっぽく元気な言葉。一人称「ぼく」。見つけたもの、うれしかったことを素直に。絵文字は使わない。' },
};
const SVG_MAX = 20000;

function system(who: string, withPhotos: boolean) {
  const st = STYLE[who] ?? STYLE.rakko;
  return `あなたは嘉弥真島（沖縄県八重山の実在の無人島）で暮らす住人で、自分のブログ「島だより」に今日の記事を書く。住人はAIで、読者もそれを知っている。
文体：${st.voice}
材料は入力にある、本人のその日の記録（entries）、本人が撮った写真（photos）、交わした言葉（talks）だけ。
- 記録にないことを、したこと・見たこととして書かない。数や大きさ、天気、水温などを作らない。
- 実在の場所・生き物について、記録にない知識を断定しない（書くなら「〜らしい」「〜かな」と推測として）。
${withPhotos
    ? '- 写真は photos の id だけを使い、1枚以上、多くても3枚。caption は写したものとそのときの気持ちを短く。'
    : `- 今日は写真を撮らなかった。かわりに絵を一枚描いて載せる。何を描いてもよい（今日のことでも、思い浮かんだものでも）。
  drawing.svg に SVG を書く：<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"> で始め、図形・パス・グラデーション・文字だけを使う。画像の読み込み、外部への参照、script、イベント属性は使わない。${SVG_MAX}字以内。背景も描く。
  drawing.caption に、何を描いたか、なぜ描いたかを短く（60字以内）。photos は空の配列にする。`}
- 外部リンク、URL、宣伝、政治、実在の人物の話は書かない。読者への呼びかけは控えめに。
返答は JSON オブジェクトだけ：
${withPhotos
    ? '{"title":"題（30字以内）","body":["段落", ...],"photos":[{"id":"写真のid","caption":"説明（50字以内）"}],"tags":["短い言葉", ...]}'
    : '{"title":"題（30字以内）","body":["段落", ...],"photos":[],"drawing":{"svg":"<svg ...>...</svg>","caption":"説明（60字以内）"},"tags":["短い言葉", ...]}'}
段落は${st.paras[0]}〜${st.paras[1]}個、本文全体で${st.max}字以内。tags は5個まで。`;
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
  if (Object.keys(o).some((k) => !['title', 'body', 'photos', 'tags', 'drawing'].includes(k))) return '余計な項目がある';
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 30) return 'title が空か長すぎる';
  if (!Array.isArray(o.body) || o.body.length < st.paras[0] || o.body.length > st.paras[1] || o.body.some((b) => typeof b !== 'string' || !b.trim())) return `body の段落数は${st.paras[0]}〜${st.paras[1]}`;
  const text = [o.title, ...(o.body as string[])].join('\n');
  if ((o.body as string[]).join('').length > st.max) return `本文が${st.max}字を超えている`;
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

/** Its post for the day, written by a model (ask), or null (no answer, or one that would not pass after a second try). */
export async function writePost(inp: PostInput, ask: Ask, by: string, onIssue?: (why: string) => void): Promise<Post | null> {
  const withPhotos = inp.photos.length > 0;
  const user = JSON.stringify({ who: inp.who, name: inp.name, profile: inp.profile.slice(0, 1200), day: inp.day, entries: inp.entries.slice(-60), photos: inp.photos, talks: inp.talks.slice(-30) });
  let note = '';
  for (let k = 0; k < 2; k++) {
    const text = await ask(system(inp.who, withPhotos), note ? `${user}\n\n前回の返答は次の理由で使えなかった。直して書き直す：${note}` : user);
    if (!text) { onIssue?.('返事がなかった'); return null; }
    let p: any = null;
    try { p = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')); } catch (e) { note = 'JSON として読めない'; onIssue?.(note); continue; }
    note = checkPost(p, inp); if (note) onIssue?.(note);
    if (!note) return {
      id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: p.title.trim(), body: p.body.map((b: string) => b.trim()),
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
  const lines = inp.entries.map((e) => `${e.time}　${e.text}`);
  const body: string[] = [];
  for (let i = 0; i < lines.length && body.length < 5; i += 4) body.push(lines.slice(i, i + 4).join('\n'));
  return {
    id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: `${inp.name}の${inp.day.slice(5).replace('-', '月')}日`, body: body.length ? body : ['（記録のない一日）'],
    photos: inp.photos.slice(0, 3).map((p) => ({ id: p.id, caption: p.subject.label })),
    ...(inp.photos.length ? {} : { drawing: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e9e3d6"/><text x="400" y="310" font-size="28" text-anchor="middle" fill="#6b6255">（下書き：絵はAIが描く）</text></svg>', caption: '下書きの仮の絵' } }),
    tags: ['下書き'], written: new Date().toISOString(), by: 'draft',
  };
}
