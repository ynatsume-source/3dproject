// Headless check (the live screen's status line: src/live/status-line.ts, the viewer design v2 2026-10-17).
//  1 a "（あと○m）" and a bracket of numbers only are taken out; a bracket of words stays
//  2 too long for its place: broken after a 、 or 。 in two, never cut short; with none, one whole line
// Usage: npx tsx scripts/live-status-check.ts
import { trimStatus, wrapStatus } from '../src/live/status-line';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
{ // 1
  const cases: [string, string][] = [
    ['浜へ流木を拾いに行く（あと12m）', '浜へ流木を拾いに行く'],
    ['小屋の部材を組む（3本目）', '小屋の部材を組む'],
    ['桟橋の板を張る（4/8）', '桟橋の板を張る'],
    ['石垣に石を積んだ（１２／３０）', '石垣に石を積んだ'],
    ['南の島へ渡っている（島にはいない）', '南の島へ渡っている（島にはいない）'],
    ['眠っている（ねむそう）', '眠っている（ねむそう）'],
    ['薪を運ぶ（あと3m）（おなかがすいている）', '薪を運ぶ（おなかがすいている）'],
    ['ヤシの繊維を撚って糸にする（鍋吊り用の長さ）', 'ヤシの繊維を撚って糸にする（鍋吊り用の長さ）'],
  ];
  const got = cases.map(([a]) => trimStatus(a));
  want('1 numbers and distances out, words kept', cases.every(([, b], i) => got[i] === b), got.join(' / '));
}
{ // 2
  const fits = (n: number) => (s: string) => s.length <= n;
  const a = wrapStatus('ラッコと話している', fits(20)), b = wrapStatus('作業台で流木を削り、部材にしている。小屋に使う', fits(14));
  const c = wrapStatus('とても長くて句読点のない状態の文がここにあるとしても切らない', fits(10));
  want('2 one line when it fits; two after a 、 or 。; never cut, whole when there is no 、 or 。',
    a.length === 1 && b.length === 2 && b.join('') === '作業台で流木を削り、部材にしている。小屋に使う' && /[、。]$/.test(b[0]) && c.length === 1 && c[0].length === 30,
    `${JSON.stringify(a)} ${JSON.stringify(b)} ${JSON.stringify(c)}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
