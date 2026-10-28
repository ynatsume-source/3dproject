// Chapter 1 on the live screen (viewer design PROGRAM.md §2-1; the owner took plan B on 2026-10-28, CHAPTER1_END.md §4):
// at the top left, always — the chapter and its day, the way (done, the next, later), what was brought in four words;
// and its two cards, the start (the question) and the end (what the world did). The words only, from the world's own
// record (world/chapter1.ts); the screen decides nothing.
import { WAY, LOAD_JA, LOAD_EN, type Chapter1, type Stage, type LoadWord } from '../world/chapter1';

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
    const after = out.length ? `After the ${out.join(' and ')} they brought ran out, ` : '', nth = k >= 2 ? `on their ${ORD[k] ?? `${k}th`} crossing, ` : '';
    const lead = `${after}${nth}`;
    return { head: 'End of chapter 1', what: `${lead ? lead.charAt(0).toUpperCase() + lead.slice(1) : ''}${lead ? 'they' : 'They'} brought clay and bamboo back from the south island` };
  }
  const after = out.length ? `持ってきた${out.map((m) => (m === 'clay' ? '粘土' : '竹')).join('と')}が尽きたあと、` : '', nth = k >= 2 ? `${k}度めの航海で、` : '';
  return { head: '第1章　おわり', what: after || nth ? `${after}${nth}南の島から粘土と竹を持ち帰った` : '南の島から、粘土と竹を持ち帰った' };
}
/** The card when what was brought runs out — a world's event, not the chapter's end (PROGRAM.md §2-1, D33). */
export function goneCard(m: 'clay' | 'bamboo', en: boolean) {
  return en ? { what: m === 'clay' ? 'The clay they brought has run out. No more pots can be made' : 'The bamboo they brought has run out. No more tools can be made' }
    : { what: m === 'clay' ? '持ってきた粘土が、尽きた。もう器は作れない' : '持ってきた竹が、尽きた。もう道具は作れない' };
}
