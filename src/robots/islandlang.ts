// Lumau (ルマウ: lu 'sea' + mau 'beach' — the tideline), the island's own language (ADR 0006, addendum: another planet the shape of the Earth). What a resident says is a
// meaning — an act and its values — and that one meaning is written three ways: in the island's words, in its own
// letters (one sign to a syllable: a consonant's shape with its vowel's mark), and as a subtitle for the watcher
// (Japanese now; other languages are a template each, never a translation of the island's words). The same meaning
// is always the same words, whoever says it, so the words can be learnt.
//
// Sounds: the vowels a i u e o, alone or after one of p t k m n s h l w. Words are runs of those syllables.

export type Tok = string;                    // a word (syllables, romanized) or the marks '.' and ','
export interface Said { isl: Tok[]; ja: string; en: string }

/** The language of what is shown under the island's words: Japanese, English, or none (the letters alone). */
export type SubLang = 'ja' | 'en' | 'none';
const SUB_KEY = 'seaglass.subLang';
export function subLang(): SubLang { try { const v = localStorage.getItem(SUB_KEY); return v === 'en' || v === 'none' ? v : 'ja'; } catch { return 'ja'; } }
export function setSubLang(v: SubLang) { try { localStorage.setItem(SUB_KEY, v); } catch { /* ignore */ } }
/** What a line means, in the chosen language ('' for none). */
export const subtitle = (m: { ja: string; en?: string | null }, lang: SubLang = subLang()) => (lang === 'none' ? '' : lang === 'en' ? m.en || m.ja : m.ja);

/* ---------- words ---------- */
export const LEX = {
  // its own name: the tideline, where all four live
  lumau: 'lumau',
  // acts
  identify: 'ino', role: 'wake', report: 'nao', share: 'kesa', propose: 'teli', agree: 'ua', found: 'hoki', record: 'simo',
  // the residents
  dot: 'toto', rakko: 'lako', kame: 'kamemalu', lantern: 'lanta',
  // things
  hut: 'hata', harvest: 'niko', shell: 'pase', full: 'hula', sleepy: 'nemu', battery: 'sali', map: 'wela', notes: 'simo',
  cairn: 'tumo', wood: 'toli', stone: 'kumo', fire: 'hi', pier: 'lasipo', post: 'sita', plank: 'hane', base: 'mota',
  place: 'tako', beach: 'mau', island: 'nesi', sea: 'lu', star: 'tika', book: 'kami', night: 'nuki', shelf: 'tana',
  coconut: 'kolu', pumice: 'hupi', bone: 'pone', seabean: 'mama',
  // doing
  build: 'motu', gather: 'tule', measure: 'semi', swim: 'ana', put: 'pila', pick: 'tolu', compare: 'tasu',
  // small words
  of: 'ne', there: 'ka', to: 'to', from: 'ma', at: 'ni', with: 'weko', me: 'na', metre: 'meto', percent: 'pa', next: 'neka', same: 'hono',
} as const;

const DIGIT = ['so', 'pi', 'nu', 'sa', 'ke', 'lo', 'mu', 'ta', 'ha', 'wa'];
/** A number in the island's words: base ten, tens 'temu', hundreds 'hiku' (24 → nutemuke). */
export function num(n: number): Tok {
  n = Math.max(0, Math.round(n));
  if (n < 10) return DIGIT[n];
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return `${t > 1 ? DIGIT[t] : ''}temu${o ? DIGIT[o] : ''}`; }
  if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return `${h > 1 ? DIGIT[h] : ''}hiku${r ? num(r) : ''}`; }
  return String(n).split('').map((d) => DIGIT[+d]).join('');
}

/* ---------- reading (katakana) and letters ---------- */
const SYL = /([ptkmnshlw]?)([aiueo])/g;
const KANA: Record<string, string[]> = {
  '': ['ア', 'イ', 'ウ', 'エ', 'オ'], p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'], t: ['タ', 'ティ', 'トゥ', 'テ', 'ト'], k: ['カ', 'キ', 'ク', 'ケ', 'コ'],
  m: ['マ', 'ミ', 'ム', 'メ', 'モ'], n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'], s: ['サ', 'スィ', 'ス', 'セ', 'ソ'], h: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
  l: ['ラ', 'リ', 'ル', 'レ', 'ロ'], w: ['ワ', 'ウィ', 'ウ', 'ウェ', 'ウォ'],
};
const VI = 'aiueo';
export const syllables = (word: string) => [...word.matchAll(SYL)].map((m) => [m[1], m[2]] as [string, string]);
/** How it sounds, in katakana (for the watcher: read it aloud and it is near enough). */
export function kana(toks: Tok[]) {
  return toks.map((t) => (t === '.' ? '。' : t === ',' ? '、' : syllables(t).map(([c, v]) => KANA[c][VI.indexOf(v)]).join(''))).join(' ').replace(/ ([。、])/g, '$1').replace(/([。、]) /g, '$1');
}
export function roman(toks: Tok[]) { return toks.join(' ').replace(/ ([.,])/g, '$1'); }

// a sign is 12 wide and 16 high: the consonant's shape in the middle (x 1..9, y 3..13), the vowel's mark around it
const BASE: Record<string, string> = {
  '': '<circle cx="5" cy="8" r="3"/>',
  p: '<path d="M5 3V13"/>',
  t: '<path d="M2 3H8M5 3V13"/>',
  k: '<path d="M8 3L2 8L8 13"/>',
  m: '<path d="M2 13V7Q5 1 8 7V13"/>',
  n: '<path d="M1.5 8Q3.25 4.5 5 8T8.5 8"/>',
  s: '<path d="M8 3L2 13"/>',
  h: '<path d="M3 3V13M7 3V13"/>',
  l: '<path d="M6 3V11Q6 13 3.5 13"/>',
  w: '<path d="M2 3L5 13L8 3"/>',
};
const MARK: Record<string, string> = {
  a: '',
  i: '<circle cx="5" cy="1" r="0.9" class="f"/>',
  u: '<circle cx="5" cy="15.2" r="0.9" class="f"/>',
  e: '<path d="M11 6V10"/>',
  o: '<circle cx="11" cy="8" r="1.3"/>',
};
/** The island's own letters, as an inline SVG (current colour, about a line high; `stroke` the line's weight). */
export function glyphs(toks: Tok[], cls = 'isl', stroke = 1.4) {
  let x = 0; const parts: string[] = [];
  for (const t of toks) {
    if (t === '.') { parts.push(`<circle cx="${x + 2}" cy="12.5" r="1.1" class="f"/>`); x += 6; continue; }
    if (t === ',') { parts.push(`<path d="M${x + 2.5} 11L${x + 1.5} 14"/>`); x += 6; continue; }
    if (x) x += 4;   // (between words)
    for (const [c, v] of syllables(t)) { parts.push(`<g transform="translate(${x} 0)">${BASE[c]}${MARK[v]}</g>`); x += 12; }
  }
  return `<svg class="${cls}" viewBox="-1 -1 ${x + 2} 18" height="1.2em" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><style>.f{fill:currentColor;stroke:none}</style>${parts.join('')}</svg>`;
}

/* ---------- what is said ---------- */
// (the lines themselves are meanings made into sentences by lumau/frames.ts — said as a person says them, PROGRAM.md §6)
/** One of the values a resident reports: hut 3 of 24, shells 5, map 30 %. */
export interface Count { what: 'hut' | 'harvest' | 'shell' | 'full' | 'notes' | 'map' | 'cairn' | 'isle'; n: number; of?: number; pct?: boolean; hungry?: boolean }   // (full: said by hungry, not by n)
