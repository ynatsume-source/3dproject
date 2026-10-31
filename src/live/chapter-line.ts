// Chapter 1 on the live screen (viewer design PROGRAM.md §2-1; the owner took plan B on 2026-10-28, CHAPTER1_END.md §4):
// at the top left, always — the chapter and its day, the way (done, the next, later), what was brought in four words;
// and its two cards, the start (the question) and the end (what the world did). The words only, from the world's own
// record (world/chapter1.ts); the screen decides nothing.
import { WAY, LOAD_JA, LOAD_EN, type Chapter1, type Stage, type LoadWord } from '../world/chapter1';
import { WAY2, type Chapter2, type Stage2 } from '../world/chapter2';

const WAY_JA: Record<string, string> = { hut: '小屋', raft: '筏', south: '南の島へ' };
const WAY_EN: Record<string, string> = { hut: 'hut', raft: 'raft', south: 'the south island' };
export interface ChapterView {
  no: string; name: string; day: string;
  way: { w: string; k: 'done' | 'now' | 'later' }[];
  cargo: { label: string; items: { w: string; low: boolean }[] } | null;   // (gone once the chapter ends)
}
/** The day of the chapter, counted by the island's days as its residents live them (the real clock's days, at its tz). */
export function chapterDay(began: number, now: number, tz: number) {
  const day = (ms: number) => Math.floor((ms + tz * 3.6e6) / 86_400_000);
  return Math.max(1, day(now) - day(began) + 1);
}
export function chapterView(c: Chapter1, now: number, tz: number, en: boolean): ChapterView {
  const n = chapterDay(c.began, now, tz), next = WAY.find((s) => c.way[s as Stage] === null);
  const low = (w: LoadWord) => w === 'little' || w === 'gone';
  return {
    no: en ? 'Chapter 1' : '第1章', name: en ? 'To the south island' : '南の島へ', day: en ? `· day ${n}` : `（${n}日目）`,
    way: WAY.map((s) => ({ w: (en ? WAY_EN : WAY_JA)[s], k: c.way[s as Stage] !== null ? 'done' : s === next ? 'now' : 'later' })),
    cargo: c.load ? { label: en ? 'What we brought' : '持ってきた荷', items: [
      { w: en ? `clay: ${LOAD_EN[c.load.clay]}` : `粘土 ${LOAD_JA[c.load.clay]}`, low: low(c.load.clay) },
      { w: en ? `bamboo: ${LOAD_EN[c.load.bamboo]}` : `竹 ${LOAD_JA[c.load.bamboo]}`, low: low(c.load.bamboo) },
    ] } : null,
  };
}
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
/** The chapter's start card: its heading and the question (CHAPTER1_END.md §4). */
export function startCard(en: boolean) {
  return en ? { head: 'Chapter 1', what: 'Can they build a raft and cross to the south island?' } : { head: '第1章', what: '筏を組んで、南の島へ渡れるか' };
}
/** The chapter's end card: what the world did (PROGRAM.md §2-1, D33) — "the second crossing" only when it was not the
 *  first (the ones turned back count); "after the clay they brought ran out" only when it had, before the load came. */
export function endCard(c: Chapter1, en: boolean) {
  const k = c.crossing, end = c.ended ?? Infinity, out = (['clay', 'bamboo'] as const).filter((m) => c.gone[m] !== null && c.gone[m]! < end);
  if (en) {
    const after = out.length ? `After the ${out.join(' and ')} they came with ran out, ` : '', nth = k >= 2 ? `on their ${ORD[k] ?? `${k}th`} crossing, ` : '';
    const lead = `${after}${nth}`;
    return { head: 'End of chapter 1', what: `${lead ? lead.charAt(0).toUpperCase() + lead.slice(1) : ''}${lead ? 'they' : 'They'} brought clay and bamboo back from the south island` };
  }
  const after = out.length ? `持ってきた${out.map((m) => (m === 'clay' ? '粘土' : '竹')).join('と')}が尽きたあと、` : '', nth = k >= 2 ? `${k}度めの航海で、` : '';
  return { head: '第1章　おわり', what: after || nth ? `${after}${nth}南の島から粘土と竹を持ち帰った` : '南の島から、粘土と竹を持ち帰った' };
}
/** The card when what was brought runs out — a world's event, not the chapter's end (PROGRAM.md §2-1, D33); its heading
 *  the load's line's own words, not "a first on the island" (viewer design on #190). */
export function goneCard(m: 'clay' | 'bamboo', en: boolean) {
  return en ? { head: 'What we brought', what: m === 'clay' ? 'The clay they brought has run out. No more pots can be made' : 'The bamboo they brought has run out. No more tools can be made' }
    : { head: '持ってきた荷', what: m === 'clay' ? '持ってきた粘土が、尽きた。もう器は作れない' : '持ってきた竹が、尽きた。もう道具は作れない' };
}

// Chapter 2, the first light (PROGRAM.md §2-2, CHAPTER2.md; the owner's decision 2026-10-29, D34): the same line at the
// top left — its name and day, the way — with no load's line (the clay does not run out within it), and its two cards.
const WAY2_JA: Record<Stage2, string> = { wood: '薪', pot: '器', dish: '灯皿', oil: '油', light: '灯り' };
const WAY2_EN: Record<Stage2, string> = { wood: 'firewood', pot: 'pots', dish: 'lamp dish', oil: 'oil', light: 'light' };
/** Chapter 2's line: the day counted from its start (the south island's load on the shelf); the lamp dish and the oil
 *  done in either order — each done when the world says so, the first not done underlined. */
export function chapter2View(c: Chapter2, now: number, tz: number, en: boolean): ChapterView {
  const n = chapterDay(c.began, now, tz), next = WAY2.find((s) => c.way[s] === null);
  return {   // (no day where it began before the world kept it: an island from before)
    no: en ? 'Chapter 2' : '第2章', name: en ? 'The first light' : 'はじめての灯り', day: c.began <= 0 ? '' : en ? `· day ${n}` : `（${n}日目）`,
    way: WAY2.map((s) => ({ w: (en ? WAY2_EN : WAY2_JA)[s], k: c.way[s] !== null ? 'done' : s === next ? 'now' : 'later' })),
    cargo: null,
  };
}
/** Chapter 2's start card: its heading and the question. */
export function startCard2(en: boolean) {
  return en ? { head: 'Chapter 2', what: "Can they light a lamp with the south island's clay?" } : { head: '第2章', what: '南の島の粘土で、灯りをともせるか' };
}
/** Chapter 2's end card, after the first lamp's: what the world did. */
export function endCard2(en: boolean) {
  return en ? { head: 'End of chapter 2', what: "With the south island's clay they fired pots, and lit a lamp" } : { head: '第2章　おわり', what: '南の島の粘土で器を焼き、灯りをともした' };
}
