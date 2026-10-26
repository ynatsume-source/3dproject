// The status line's words (live screen, watch mode), read from the source — VOICE.md §2 and §9, rehearsal findings
// R-002 and R-017:
//   kinds     every task a resident can be given has words for it (the kinds of task('kind', ...), and the ones made
//             from a name — task(`cord-${target}`, ...) — or chosen between two — task(a ? 'husk-soak' : 'husk-takeout')
//             — against the keys of statusLine's tables; Lantern's notebook steps are answered by their own branch).
//             A task with none fell through to 「ひと休みしている」 (R-002, R-017: the eight handwork kinds)
//   words     none of 散歩・ひと休み・休憩, and 作業 only as a place or a thing (作業台・作業場)
//   thinking  「考え」 only in Dot's and Rakko's 「どうするか考えている」 (waiting for its mind's answer): Lantern, with
//             no mind of its own yet, never says it is thinking
//   length    20 characters at most, as shown (the metres to go and a bracket of numbers taken out)
//   idle      nothing to do: no line at all (the band shows the name alone), and none for a kind with no words once there
// Usage: npx tsx scripts/status-labels-check.ts
import { readFileSync } from 'node:fs';
import { trimStatus } from '../src/live/status-line';
const src = readFileSync(new URL('../src/robots/residents.ts', import.meta.url), 'utf8');
const kinds = new Set([...src.matchAll(/task\('([a-z-]+)'/g)].map((m) => m[1]));
for (const line of src.split('\n')) {
  for (const m of line.matchAll(/task\(\w+ === '\w+' \? '([a-z-]+)' : '([a-z-]+)'/g)) { kinds.add(m[1]); kinds.add(m[2]); }
  const t = /task\(`([a-z]+)-\$\{(\w+)\}`/.exec(line);
  if (t) for (const m of line.matchAll(new RegExp(`${t[2]} === '(\\w+)'`, 'g'))) kinds.add(`${t[1]}-${m[1]}`);
}
const from = src.indexOf('  function statusLine('), to = src.indexOf('  const res: Residents = {', from);
const body = src.slice(from, to);
const keys = new Set([...body.matchAll(/[\s{,]'?([a-z-]+)'?:\s/g)].map((m) => m[1]));
const handled = new Set(['idle']);
const missing = [...kinds].filter((k) => !keys.has(k) && !handled.has(k) && !k.startsWith('study-'));
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
want(`kinds: ${kinds.size} kinds of task, each with words`, missing.length === 0 && ['husk-soak', 'cord-hang', 'sail-takein'].every((k) => kinds.has(k)), missing.length ? `without: ${missing.join(', ')}` : '');

const lits = new Set<string>();
for (const m of body.matchAll(/'([^'\n]*[぀-ヿ一-鿿][^'\n]*)'|`([^`\n]*[぀-ヿ一-鿿][^`\n]*)`/g)) lits.add(m[1] ?? m[2]);
const parts = new Set(['ウニ', 'カニ', '貝', '仲間', '景色', '工程', '灯皿', '蒸留の壺', '天気の壺', '鍋', '棚の材料']);
const fill = (t: string) => t.replace(/\$\{[^}]*(name|\.ob\?\.label)[^}]*\}/g, (_, k) => (k === 'name' ? 'ラッコ' : '貝殻')).replace(/\$\{prey\}/g, 'カニ').replace(/\$\{place\}/g, '北の浜').replace(/\$\{village\.map\.seen[^}]*\}/g, 'パタ').replace(/\$\{who\}/g, 'ラッコ').replace(/\$\{vessel\}/g, '蒸留の壺').replace(/\$\{[^}]*\}/g, '3');
const lines = [...lits].filter((l) => !parts.has(l) && !l.startsWith('（あと') && !l.startsWith('${catalog')).map((l) => trimStatus(fill(l)));
const banned = lines.filter((l) => /散歩|ひと休み|休憩/.test(l) || /作業(?!台|場)/.test(l.replace(/やりかけの縄仕事/g, '')));
want(`words: ${lines.length} lines, none with 散歩・ひと休み・休憩 or 作業 but as a place`, banned.length === 0, banned.join(' / '));
const thinking = lines.filter((l) => /考え/.test(l) && l !== 'どうするか考えている');
want('thinking: only Dot\'s and Rakko\'s waiting for their minds', thinking.length === 0 && /if \(k === 'study-pause'\) return KEEP;/.test(body), thinking.join(' / '));
const long = lines.filter((l) => l.length > 20);
want('length: 20 characters at most, as shown', long.length === 0, long.map((l) => `${l}（${l.length}）`).join(' / '));
want('idle: no line, and none for a kind with no words once there', /\bidle: '',/.test(body) && /\+ left : ''\);\n  \}\n$/.test(body));
console.log(bad ? 'FAIL' : 'all ok');
process.exit(bad ? 1 : 0);
