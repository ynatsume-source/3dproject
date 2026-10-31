// Chapter 1 on the live screen, its words (PROGRAM.md §2-1, plan B — CHAPTER1_END.md §4; src/live/chapter-line.ts), from
// the world's own record (world/chapter1.ts):
//   A at the start: 第1章 南の島へ（1日目）, the way 小屋 underlined next, the rest faint, what was brought in words
//   B the way as the world goes: done in order, the next one underlined; nearly gone and gone in sand, the others not
//   C the day counted by the residents' days (midnight at the island's tz), not the island calendar's
//   D the end: the load's line gone, the way all done; the end card says what the world did — "the second crossing"
//     only when it was not the first, "after the clay they brought ran out" only when it had (D33); the card when it
//     runs out is a world's event
//   E the start card: the question; English for all of it
//   F chapter 2 (PROGRAM.md §2-2, D34): its day from the south island's load, the way 薪・器・灯皿・油・灯り as the world
//     goes (the lamp dish and the oil in either order), no load's line; its start card the question, its end card what
//     the world did; English; no day on an island from before the world kept it
// Usage: npx tsx scripts/live-chapter-check.ts
import { chapter1 } from '../src/world/chapter1';
import { chapterView, chapterDay, startCard, endCard, goneCard, chapter2View, startCard2, endCard2 } from '../src/live/chapter-line';
import { chapter2 } from '../src/world/chapter2';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const H = 3.6e6, began = Date.parse('2026-11-05T10:00:00+09:00'), tz = 9;
const village = (firsts: Record<string, number>, clayMg = 25e6, bambooMg = 7e6, southSetOut = 0) => ({ firstLoad: { at: began }, firsts, loadMin: { clayMg, bambooMg }, southSetOut });
const line = (v: ReturnType<typeof chapterView>) => `${v.no} ${v.name}${v.day} | ${v.way.map((x) => `${x.w}:${x.k}`).join(' ')} | ${v.cargo ? `${v.cargo.label} ${v.cargo.items.map((x) => `${x.w}${x.low ? '*' : ''}`).join(' / ')}` : '—'}`;
{ // A
  const v = chapterView(chapter1(village({}))!, began + 60e3, tz, false);
  want('A at the start', line(v) === '第1章 南の島へ（1日目） | 小屋:now 筏:later 南の島へ:later | 持ってきた荷 粘土 たっぷり / 竹 たっぷり', line(v));
}
{ // B
  const v = chapterView(chapter1(village({ hut: began + 20 * H }, 4.9e6, 3.5e6))!, began + 24 * H, tz, false);
  const g = chapterView(chapter1(village({ hut: began + 20 * H, raft: began + 26 * H, 'bamboo-gone': began + 27 * H }, 4.9e6, 0.1e6))!, began + 28 * H, tz, false);
  want('B the way as the world goes; nearly gone and gone in sand', line(v) === '第1章 南の島へ（2日目） | 小屋:done 筏:now 南の島へ:later | 持ってきた荷 粘土 残りわずか* / 竹 半分ほど'
    && line(g) === '第1章 南の島へ（2日目） | 小屋:done 筏:done 南の島へ:now | 持ってきた荷 粘土 残りわずか* / 竹 尽きた*', `${line(v)} || ${line(g)}`);
}
{ // C
  const late = Date.parse('2026-11-05T23:50:00+09:00'), next = Date.parse('2026-11-06T00:10:00+09:00');
  want('C the day by the residents\' days at the island\'s tz', chapterDay(began, late, tz) === 1 && chapterDay(began, next, tz) === 2 && chapterDay(began, began + 72 * H, tz) === 4, `${chapterDay(began, late, tz)} ${chapterDay(began, next, tz)} ${chapterDay(began, began + 72 * H, tz)}`);
}
{ // D
  const end = (n: number) => chapter1(village({ hut: began + 20 * H, raft: began + 26 * H, 'south-load': began + 31 * H }, 4.9e6, 3.5e6, n))!;
  const v = chapterView(end(1), began + 31 * H + 5e3, tz, false), one = endCard(end(1), false), two = endCard(end(2), false), twoEn = endCard(end(2), true), oneEn = endCard(end(1), true);
  want('D the end: the load\'s line gone, the way all done', line(v) === '第1章 南の島へ（2日目） | 小屋:done 筏:done 南の島へ:done | —', line(v));
  want('D the end card: "the second crossing" only when it was not the first', one.head === '第1章　おわり' && one.what === '南の島から、粘土と竹を持ち帰った' && two.what === '2度めの航海で、南の島から粘土と竹を持ち帰った'
    && oneEn.what === 'They brought clay and bamboo back from the south island' && twoEn.what === 'On their second crossing, they brought clay and bamboo back from the south island' && twoEn.head === 'End of chapter 1', `${one.what} / ${two.what} / ${twoEn.what}`);
  const late = (f: Record<string, number>) => chapter1(village({ hut: began + 20 * H, raft: began + 26 * H, 'south-load': began + 31 * H, ...f }, 0.3e6, 3.5e6, 1))!;
  const goneBefore = endCard(late({ 'clay-gone': began + 29 * H }), false), goneAfter = endCard(late({ 'clay-gone': began + 33 * H }), false), goneEn = endCard(late({ 'clay-gone': began + 29 * H }), true);
  want('D the end card: "after the clay they brought ran out" only when it ran out before', goneBefore.what === '持ってきた粘土が尽きたあと、南の島から粘土と竹を持ち帰った' && goneAfter.what === '南の島から、粘土と竹を持ち帰った'
    && goneEn.what === 'After the clay they came with ran out, they brought clay and bamboo back from the south island', `${goneBefore.what} / ${goneAfter.what} / ${goneEn.what}`);
  want('D the card when it runs out: a world\'s event, headed with the load\'s line\'s words', goneCard('clay', false).what === '持ってきた粘土が、尽きた。もう器は作れない' && goneCard('bamboo', false).what === '持ってきた竹が、尽きた。もう道具は作れない'
    && goneCard('clay', false).head === '持ってきた荷' && goneCard('clay', true).head === 'What we brought', goneCard('clay', true).what);
}
{ // E
  const s = startCard(false), se = startCard(true), v = chapterView(chapter1(village({ hut: began + 20 * H }, 4.9e6, 3.5e6))!, began + 24 * H, tz, true);
  want('E the start card: the question', s.head === '第1章' && s.what === '筏を組んで、南の島へ渡れるか' && se.what === 'Can they build a raft and cross to the south island?', `${s.what} / ${se.what}`);
  want('E English', line(v) === 'Chapter 1 To the south island· day 2 | hut:done raft:now the south island:later | What we brought clay: nearly gone* / bamboo: about half', line(v));
  const words = [s.what, s.head, endCard(chapter1(village({ 'south-load': began + 31 * H }, 4.9e6, 3.5e6, 3))!, false).what];
  want('E no brackets, numbers as said (PROGRAM.md §6)', words.every((w) => !/[（）()%／/]/.test(w)), words.join(' / '));
}
{ // F
  const load = began + 31 * H, c2 = (f: Record<string, number>) => chapter2({ firsts: { 'south-load': load, ...f } })!;
  const v0 = chapter2View(c2({}), load + 70e3, tz, false), v1 = chapter2View(c2({ 'dry-wood': load + 20 * H, 'fired-pot': load + 74 * H, oil: load + 80 * H }), load + 90 * H, tz, false);
  const ve = chapter2View(c2({ 'dry-wood': load + 20 * H, 'fired-pot': load + 74 * H, 'lamp-dish': load + 130 * H }), load + 140 * H, tz, true);
  const old0 = chapter2View(chapter2({ firsts: { 'south-load': 0, 'fired-pot': 0 } })!, began, tz, false);
  want('F chapter 2: its day from the load, the way as the world goes, no load\'s line', line(v0) === '第2章 はじめての灯り（1日目） | 薪:now 器:later 灯皿:later 油:later 灯り:later | —'
    && line(v1) === '第2章 はじめての灯り（5日目） | 薪:done 器:done 灯皿:now 油:done 灯り:later | —', `${line(v0)} || ${line(v1)}`);
  want('F English; no day on an island from before', line(ve) === 'Chapter 2 The first light· day 7 | firewood:done pots:done lamp dish:done oil:now light:later | —' && old0.day === '', `${line(ve)} || '${old0.day}'`);
  const s = startCard2(false), e = endCard2(false), se = startCard2(true), ee = endCard2(true);
  want('F its cards: the question, and what the world did', s.head === '第2章' && s.what === '南の島の粘土で、灯りをともせるか' && e.head === '第2章　おわり' && e.what === '南の島の粘土で器を焼き、灯りをともした'
    && se.what === "Can they light a lamp with the south island's clay?" && ee.what === "With the south island's clay they fired pots, and lit a lamp" && ee.head === 'End of chapter 2' && [s.what, e.what].every((w) => !/[（）()%／/]/.test(w)), `${s.what} / ${e.what}`);
}
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
