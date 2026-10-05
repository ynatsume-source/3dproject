// Headless check (ADR 0006: the island's language): Lumau's vocabulary and grammar keep their rules.
//  1 every word is made of the island's syllables (a i u e o, alone or after p t k m n s h l w; no 'wu'; a bare vowel
//    only to begin a word), and no two words share a form or an id
//  2 the words the island says already (islandlang LEX) keep their form, except 'at', which grammar moves to 'ni'
//  3 only question words begin with 'ha' (and the older words that were there first)
//  4 the vocabulary is about the size planned (some 1,200 words) and no word is longer than four syllables
//  5 every example sentence renders: each id is a word, and the sentence ends with a mark
//  6 every line the island says has its English too, and 'at' is now the grammar's ni (found on the beach: mau ni)
//  7 every meaning the residents say to each other (lumau/frames.ts) makes a sentence of known words, with its Japanese and English
// Usage: npx tsx scripts/lumau-check.ts
import { lexicon, DIGITS } from '../src/robots/lumau/lexicon';
import { EXAMPLES, render } from '../src/robots/lumau/grammar';
import { LEX, SAY, roman, subtitle } from '../src/robots/islandlang';
import { phrase, type Frame } from '../src/robots/lumau/frames';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const L = lexicon();

const SYL = /^(?:[ptkmnshlw]?[aiueo])+$/;
// (the older words keep their form even off these rules: lanta, ua; the hand-set small words may run two vowels)
const badSound = L.filter((e) => e.tier !== 'legacy' && (!SYL.test(e.form) || /wu/.test(e.form) || (e.tier !== 'grammar' && /[aiueo][aiueo]/.test(e.form))));
want('1 sounds', badSound.length === 0, badSound.map((e) => e.form).join(' ') || `${L.length} words`);
const forms = new Map<string, string>(), dup: string[] = [];
for (const e of L) { if (forms.has(e.form) && e.tier !== 'legacy') dup.push(`${e.form}(${forms.get(e.form)}/${e.id})`); forms.set(e.form, e.id); }
const ids = new Set(L.map((e) => e.id));
want('1 one form, one word', dup.length === 0 && ids.size === L.length, dup.join(' ') || 'unique');
want('1 no word is a digit', !L.some((e) => DIGITS.includes(e.form)));

const moved: string[] = [];
for (const [id, form] of Object.entries(LEX)) {
  const e = L.find((x) => x.id === id);
  if (id === 'at' || id === 'notes') continue;   // (at → ni; notes is 'record', simo)
  if (!e || e.form !== form) moved.push(`${id}:${form}→${e?.form ?? '-'}`);
}
want('2 the old words stay', moved.length === 0, moved.join(' ') || `${Object.keys(LEX).length} words`);

const OLD_HA = new Set(['hata', 'hane']);
const ha = L.filter((e) => e.form.startsWith('ha') && !OLD_HA.has(e.form) && e.cat !== 'question');
want('3 ha- is for questions', ha.length === 0, ha.map((e) => `${e.form}=${e.id}`).join(' ') || L.filter((e) => e.form.startsWith('ha') && e.cat === 'question').map((e) => e.form).join(' '));

const syl = (f: string) => (f.match(/[aiueo]/g) ?? []).length;
const long = L.filter((e) => syl(e.form) > 4 && e.tier !== 'legacy');
want('4 size', L.length >= 1100 && L.length <= 1400, `${L.length}`);
want('4 length', long.length === 0, long.map((e) => e.form).join(' ') || 'max 4 syllables');

const broken: string[] = [];
for (const x of EXAMPLES) {
  try { const t = render(x.ids); if (!['.', ','].includes(t[t.length - 1])) broken.push(x.ja); }
  catch (err) { broken.push(`${x.ja} (${(err as Error).message})`); }
}
want('5 examples', broken.length === 0, broken.join(' / ') || `${EXAMPLES.length}`);
if (!broken.length) for (const x of EXAMPLES.slice(0, 3)) console.log(`   ${roman(render(x.ids))}  ${x.ja}`);

const said = [SAY.identify('dot'), SAY.identify('rakko'), SAY.report([{ what: 'hut', n: 3, of: 24 }, { what: 'map', n: 30, pct: true }]), SAY.share('wood', 12, 'rakko'), SAY.share('shell', 5, 'dot', true),
  SAY.found('ヤシの実'), SAY.proposePier(), SAY.agreePier('dot'), SAY.agreePier('rakko'), SAY.agreePier('lantern'), SAY.starsRecorded()];
const noEn = said.filter((m) => !m.en || /[ぁ-んァ-ン一-龥]/.test(m.en));
want('6 English for every line', noEn.length === 0, noEn.map((m) => m.ja).join(' / ') || `${said.length} lines`);
want('6 at is ni', roman(SAY.found('ヤシの実').isl).includes('mau ni') && subtitle(SAY.found('軽石'), 'en').startsWith('Found:'), roman(SAY.found('ヤシの実').isl));

const frames: Frame[] = [{ act: 'ask-bring', to: 'rakko', what: 'wood' }, { act: 'accept-bring', to: 'dot', what: 'wood' },
  ...(['hungry', 'sleepy', 'hands-full', 'not-seen', 'busy-shells'] as const).map((why) => ({ act: 'refuse', why }) as Frame),
  { act: 'hand-over', what: 'wood' }, { act: 'received', what: 'wood' }, { act: 'tell-where', what: 'wood', metres: 37 }, { act: 'tell-where', what: 'shell', metres: 5 }, { act: 'will-go' }, { act: 'noted' },
  ...(['typhoon', 'rain', 'wind'] as const).map((what) => ({ act: 'warn', what }) as Frame), ...(['hut', 'map', 'wood', 'shells', 'eat', 'nap'] as const).map((doing) => ({ act: 'plan', doing }) as Frame)];
const badF: string[] = [];
for (const f of frames) { try { const m = phrase(f); if (!m.isl.length || !m.ja || !m.en || /[ぁ-んァ-ン一-龥]/.test(m.en)) badF.push(f.act); } catch (e) { badF.push(`${f.act}: ${(e as Error).message}`); } }
want('7 the meanings make sentences', badF.length === 0, badF.join(' / ') || `${frames.length} frames`);
if (!badF.length) for (const f of frames.slice(0, 3)) { const m = phrase(f); console.log(`   ${roman(m.isl)}  ${m.ja}  ${m.en}`); }

if (bad) { console.log(`${bad} FAILED`); process.exit(1); }
console.log('all ok');
