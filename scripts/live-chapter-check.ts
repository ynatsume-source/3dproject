// Chapter 1 on the live screen, its words (PROGRAM.md §2-1, plan B — CHAPTER1_END.md §4; src/live/chapter-line.ts), from
// the world's own record (world/chapter1.ts):
//   A at the start: 第1章 南の島へ（1日目）, the way 小屋 underlined next, the rest faint, what was brought in words
//   B the way as the world goes: done in order, the next one underlined; nearly gone and gone in sand, the others not
//   C the day counted by the residents' days (midnight at the island's tz), not the island calendar's
//   D the end: the load's line gone, the way all done; the end card says what the world did — "the second crossing"
//     only when it was not the first
//   E the start card: the question; English for all of it
// Usage: npx tsx scripts/live-chapter-check.ts
import { chapter1 } from '../src/world/chapter1';
import { chapterView, chapterDay, startCard, endCard } from '../src/live/chapter-line';

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
  want('D the end card: "the second crossing" only when it was not the first', one.head === '第1章　おわり' && one.what === '南の島から、粘土と竹を持ち帰った' && two.what === '2度めの航海で、南の島から、粘土と竹を持ち帰った'
    && oneEn.what === 'They brought clay and bamboo back from the south island' && twoEn.what === 'On the second crossing, they brought clay and bamboo back from the south island' && twoEn.head === 'End of chapter 1', `${one.what} / ${two.what} / ${twoEn.what}`);
}
{ // E
  const s = startCard(false), se = startCard(true), v = chapterView(chapter1(village({ hut: began + 20 * H }, 4.9e6, 3.5e6))!, began + 24 * H, tz, true);
  want('E the start card: the question', s.head === '第1章' && s.what === '筏を組んで、南の島へ渡れるか' && se.what === 'Can they build a raft and cross to the south island?', `${s.what} / ${se.what}`);
  want('E English', line(v) === 'Chapter 1 To the south island· day 2 | hut:done raft:now the south island:later | What we brought clay: nearly gone* / bamboo: about half', line(v));
  const words = [s.what, s.head, endCard(chapter1(village({ 'south-load': began + 31 * H }, 4.9e6, 3.5e6, 3))!, false).what];
  want('E no brackets, numbers as said (PROGRAM.md §6)', words.every((w) => !/[（）()%／/]/.test(w)), words.join(' / '));
}
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
