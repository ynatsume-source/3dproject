// A resident writing its day for 島だより: from its own records only — what it did, saw, was told and photographed
// that day — in its own voice. Every post carries at least one of that day's own photographs. What comes back is
// checked here; a post that fails is asked for again once, then dropped (no post rather than a wrong one).
import type { Post, PhotoRecord } from './types';

export interface PostInput {
  who: string; name: string; profile: string; day: string;
  entries: { time: string; text: string }[];      // its own diary that day (what it did, saw, decided, was told)
  photos: (Pick<PhotoRecord, 'id' | 'subject' | 'why'> & { time: string })[];
  talks: { time: string; with: string; text: string }[];   // lines it said or heard that day
}
export type Ask = (system: string, user: string) => Promise<string | null>;

const STYLE: Record<string, { voice: string; max: number; paras: [number, number] }> = {
  dot: { max: 1100, paras: [3, 7], voice: 'ドットの「作業日報ブログ」。一人称「ボク」、少しカタコトで、単語を区切ったカタカナまじりの短い文（例：「ボク、ドット。今日ノ作業、報告シマス。」）。数字と手順が好きで「計画」「進捗」「反省」と書く。最後に「次ノ計画」を一行。' },
  rakko: { max: 420, paras: [1, 3], voice: 'ラッコの「写真日記」。写真が主役で、短く、子どもっぽく元気な言葉。一人称「ぼく」。見つけたもの、うれしかったことを素直に。絵文字は使わない。' },
};

function system(who: string) {
  const st = STYLE[who] ?? STYLE.rakko;
  return `あなたは嘉弥真島（沖縄県八重山の実在の無人島）で暮らす住人で、自分のブログ「島だより」に今日の記事を書く。住人はAIで、読者もそれを知っている。
文体：${st.voice}
材料は入力にある、本人のその日の記録（entries）、本人が撮った写真（photos）、交わした言葉（talks）だけ。
- 記録にないことを、したこと・見たこととして書かない。数や大きさ、天気、水温などを作らない。
- 実在の場所・生き物について、記録にない知識を断定しない（書くなら「〜らしい」「〜かな」と推測として）。
- 写真は photos の id だけを使い、1枚以上、多くても3枚。caption は写したものとそのときの気持ちを短く。
- 外部リンク、URL、宣伝、政治、実在の人物の話は書かない。読者への呼びかけは控えめに。
返答は JSON オブジェクトだけ：
{"title":"題（30字以内）","body":["段落", ...],"photos":[{"id":"写真のid","caption":"説明（50字以内）"}],"tags":["短い言葉", ...]}
段落は${st.paras[0]}〜${st.paras[1]}個、本文全体で${st.max}字以内。tags は5個まで。`;
}

/** The checks every post goes through: '' if it may stand, else what is wrong (told to the writer on the retry). */
export function checkPost(p: unknown, inp: PostInput): string {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'JSON オブジェクトではない';
  const o = p as Record<string, unknown>, st = STYLE[inp.who] ?? STYLE.rakko;
  if (Object.keys(o).some((k) => !['title', 'body', 'photos', 'tags'].includes(k))) return '余計な項目がある';
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 30) return 'title が空か長すぎる';
  if (!Array.isArray(o.body) || o.body.length < st.paras[0] || o.body.length > st.paras[1] || o.body.some((b) => typeof b !== 'string' || !b.trim())) return `body の段落数は${st.paras[0]}〜${st.paras[1]}`;
  const text = [o.title, ...(o.body as string[])].join('\n');
  if ((o.body as string[]).join('').length > st.max) return `本文が${st.max}字を超えている`;
  if (/https?:|www\.|\.(com|jp|net|org)\b|@[a-z0-9_]/i.test(text)) return 'URL や宛先を含めない';
  const ids = new Set(inp.photos.map((x) => x.id));
  if (!Array.isArray(o.photos) || o.photos.length < 1 || o.photos.length > 3) return '写真は1〜3枚';
  for (const ph of o.photos as Record<string, unknown>[]) {
    if (!ph || typeof ph.id !== 'string' || !ids.has(ph.id)) return `写真の id は photos のものだけ（${String(ph?.id)}）`;
    if (typeof ph.caption !== 'string' || ph.caption.length > 50) return 'caption は50字以内';
  }
  if (new Set((o.photos as { id: string }[]).map((x) => x.id)).size !== (o.photos as unknown[]).length) return '同じ写真を二度使わない';
  if (o.tags !== undefined && (!Array.isArray(o.tags) || o.tags.length > 5 || o.tags.some((t) => typeof t !== 'string' || t.length > 12))) return 'tags は5個まで、各12字以内';
  return '';
}

/** Its post for the day, written by a model (ask), or null (no photograph that day, no answer, or one that would
 *  not pass after a second try). */
export async function writePost(inp: PostInput, ask: Ask, by: string): Promise<Post | null> {
  if (!inp.photos.length) return null;
  const user = JSON.stringify({ who: inp.who, name: inp.name, profile: inp.profile.slice(0, 1200), day: inp.day, entries: inp.entries.slice(-60), photos: inp.photos, talks: inp.talks.slice(-30) });
  let note = '';
  for (let k = 0; k < 2; k++) {
    const text = await ask(system(inp.who), note ? `${user}\n\n前回の返答は次の理由で使えなかった。直して書き直す：${note}` : user);
    if (!text) return null;
    let p: any = null;
    try { p = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')); } catch (e) { note = 'JSON として読めない'; continue; }
    note = checkPost(p, inp);
    if (!note) return { id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: p.title.trim(), body: p.body.map((b: string) => b.trim()), photos: p.photos.map((x: any) => ({ id: x.id, caption: x.caption.trim() })), tags: (p.tags ?? []).map((t: string) => t.trim()).filter(Boolean), written: new Date().toISOString(), by };
  }
  return null;
}

/** Without a model (a dry run, for checking the pages and the photographs): its own diary lines stitched as they are.
 *  Marked 'draft': never published. */
export function draftPost(inp: PostInput): Post | null {
  if (!inp.photos.length) return null;
  const lines = inp.entries.map((e) => `${e.time}　${e.text}`);
  const body: string[] = [];
  for (let i = 0; i < lines.length && body.length < 5; i += 4) body.push(lines.slice(i, i + 4).join('\n'));
  return { id: `${inp.day}-${inp.who}`, who: inp.who, name: inp.name, day: inp.day, title: `${inp.name}の${inp.day.slice(5).replace('-', '月')}日`, body: body.length ? body : ['（記録のない一日）'],
    photos: inp.photos.slice(0, 3).map((p) => ({ id: p.id, caption: p.subject.label })), tags: ['下書き'], written: new Date().toISOString(), by: 'draft' };
}
