// Headless check (the live screen in English, viewer design v2 §5, L5: src/live/en.ts, src/live/captions.ts,
// tools/live/caption-format.mjs).
//  1 every sentence the world's status can make (each literal in residents.ts statusOf, its ${…} filled with a name, a
//    catch, an island's word, a number) has its English — no Japanese left in it, never the plain "busy"
//  2 the asides in words at a status's end (away, hungry, sleepy) come through in English
//  3 every first the world grades (world/milestones.ts) has its English card, a crossing with its island's word
//  4 a long English status is broken after a comma, as a Japanese one after a 、
//  5 a caption's body is what YouTube's ingestion takes: a UTC stamp without a zone letter, then at most two lines; a
//    longer line goes on in the next caption, nothing cut
//  6 captions go only to a sender on this machine (127.0.0.1 / localhost); none without ?captions
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/live-en-check.ts
import fs from 'node:fs';
import { statusEn, firstEn, asLine, FIXED_EN } from '../src/live/en';
import { trimStatus, wrapStatus } from '../src/live/status-line';
import { captionSender } from '../src/live/captions';
import { captionBodies, captionStamp, readMs } from '../tools/live/caption-format.mjs';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const JA = /[぀-ヿ一-鿿]/;

{ // 1
  const src = fs.readFileSync('src/robots/residents.ts', 'utf8');
  const a = src.indexOf('  function statusOf(r: Resident): string {'), b = src.indexOf('  const res: Residents = {', a), blk = src.slice(a, b);
  const lits = new Set<string>();
  for (const m of blk.matchAll(/'([^'\n]*[぀-ヿ一-鿿][^'\n]*)'|`([^`\n]*[぀-ヿ一-鿿][^`\n]*)`/g)) lits.add(m[1] ?? m[2]);
  // (what is not a sentence of its own: a catch's name, the bare fallback names, the distance aside — taken out on the
  // screen —, and a process's own name from the catalog)
  const parts = new Set(['ウニ', 'カニ', '貝', '仲間', '景色', '工程']);
  const fill = (t: string) => t.replace(/\$\{[^}]*(name|\.ob\?\.label)[^}]*\}/g, (_, k) => (k === 'name' ? 'ラッコ' : '貝殻'))
    .replace(/\$\{prey\}/g, 'カニ').replace(/\$\{village\.map\.seen[^}]*\}/g, 'Pata').replace(/\$\{[^}]*\}/g, '3');
  const missing: string[] = [];
  let n = 0;
  for (const lit of lits) {
    if (parts.has(lit) || lit.startsWith('（あと') || lit.startsWith('${catalog')) continue;
    n++;
    const ja = trimStatus(fill(lit)), en = statusEn(ja);
    if (!en || JA.test(en)) missing.push(`${ja} → ${en}`);
  }
  want(`1 every status sentence has its English (${n} sentences)`, n > 140 && missing.length === 0, missing.slice(0, 8).join(' / '));
  want('1 an unknown sentence is not guessed (the caller shows the name alone)', statusEn('知らない文') === null);
  want('1 a line is shown with its first letter a capital', asLine(statusEn('息つぎに浮かんできた')!) === 'Coming up for a breath', asLine(statusEn('息つぎに浮かんできた')!));
}
{ // 2
  const got = [statusEn('ひと休みしている（おなかがすいている）'), statusEn('眠っている（ねむそう）'), statusEn(trimStatus('筏でPataへ渡っている（島にはいない）'))];
  want('2 the asides come through', got[0] === 'taking a rest (hungry)' && got[1] === 'asleep (sleepy)' && got[2] === 'crossing by raft to Pata (away from the island)', got.join(' / '));
  want('2 the numbers are taken out first, as on the Japanese screen', statusEn(trimStatus('桟橋に板を張っている（4/8）')) === 'laying planks on the pier', `${statusEn(trimStatus('桟橋に板を張っている（4/8）'))}`);
}
{ // 3
  const src = fs.readFileSync('src/world/milestones.ts', 'utf8');
  const keys = [...src.matchAll(/\(\) => '([^']+)'/g)].map((m) => m[1]);
  const missing = keys.filter((k) => { const t = firstEn(k, 'ドット'); return !t || JA.test(t); });
  want(`3 every first the world grades has its English card (${keys.length} kinds)`, keys.length >= 20 && missing.length === 0, missing.join(','));
  want('3 a crossing names its island (plain for captions; in italics, escaped, on the card)', firstEn('crossing:Pata', 'ドット') === 'Dot crossed by raft to Pata and back' && firstEn('crossing:P<a', 'ドット', true) === 'Dot crossed by raft to <i>P&lt;a</i> and back', `${firstEn('crossing:P<a', 'ドット', true)}`);
  { // (the names, D23 2026-10-20: UTSUSHIYO PROJECT / Series 1 ルマウ (Lumau); "ドットたちの島" only as the series' subtitle, never on the live screen)
    const live = fs.readFileSync('src/live/live.ts', 'utf8'), css = fs.readFileSync('src/live/live.css', 'utf8');
    want('3 the brand: the project, then Series 1 and the series\' name', live.includes('>UTSUSHIYO PROJECT<') && live.includes('<i class="ser">Series 1</i>') && live.includes("'ルマウ'") && !live.includes('ドットたちの島') && /\.brand \.ser \{[^}]*lining-nums/.test(css));
  }
  want('3 the set phrases (viewer design review B)', FIXED_EN.brand === 'Lumau' && FIXED_EN.ai === 'The residents are AI · filmed automatically' && FIXED_EN.date(1, 12, 17) === 'Island year 1 · 17 December' && firstEn('light', 'ドット') === "Dot lit the island's first lamp", `${FIXED_EN.date(1, 12, 17)} / ${firstEn('light', 'ドット')}`);
}
{ // 4
  const fits = (l: string) => l.length <= 40;
  const lines = wrapStatus('looking over the horizon from the beach, mapping the islands in sight', fits);
  want('4 a long English status broken after its comma', lines.length === 2 && lines[0] === 'looking over the horizon from the beach, ' && lines[1] === 'mapping the islands in sight', JSON.stringify(lines));
}
{ // 5
  const at = Date.UTC(2026, 11, 24, 3, 4, 5, 67);
  const bodies = captionBodies('Dot: The wind is good today. Let us take the raft out past the reef and see the island to the south.', at);
  want('5 the stamp: UTC, milliseconds, no zone letter', captionStamp(at) === '2026-12-24T03:04:05.067', captionStamp(at));
  const ok = bodies.every((b) => { const ls = b.split('\n'); return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}$/.test(ls[0]) && ls.length <= 4 && ls.slice(1).every((l) => l.length <= 42) && b.endsWith('\n'); });
  const all = bodies.map((b) => b.split('\n').slice(1).join(' ').trim()).join(' ');
  const first = bodies[0].split('\n').slice(1).join('\n').replace(/\n$/, ''), wait = readMs(first);
  want('5 a long line: caption-sized pieces (a stamp, at most two lines of 42), the next once the one before is read (max 2.5 s, 15 characters a second), nothing lost', bodies.length === 2 && ok && wait === Math.max(2500, Math.round(first.replace(/\n/g, ' ').length / 15 * 1000)) && bodies[1].startsWith(captionStamp(at + wait)) && all === 'Dot: The wind is good today. Let us take the raft out past the reef and see the island to the south.', `${wait} ms; ${JSON.stringify(bodies)}`);
  want('5 a short caption is still left 2.5 s', readMs('Dot: hello') === 2500);
}
{ // 6
  const sent: string[] = [];
  (globalThis as any).fetch = async (u: string, o: any) => { sent.push(`${u} ${o.body}`); return { ok: true }; };
  captionSender(null).send('a', 0); captionSender('https://example.com/caption').send('b', 0);
  const s = captionSender('http://127.0.0.1:8787/caption'); s.send('Dot: hello', 0); s.send('Dot: hello', 0); s.send('Rakko: hi', 0);
  want('6 only to the sender on this machine, each line once', sent.length === 2 && sent[0].startsWith('http://127.0.0.1:8787/caption ') && JSON.parse(sent[0].split(' ').slice(1).join(' ')).text === 'Dot: hello', sent.join(' | '));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
