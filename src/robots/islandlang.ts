// Lumau (ルマウ: lu 'sea' + mau 'beach' — the tideline), the island's own language (ADR 0006, addendum: another planet the shape of the Earth). What a resident says is a
// meaning — an act and its values — and that one meaning is written three ways: in the island's words, in its own
// letters (one sign to a syllable: a consonant's shape with its vowel's mark), and as a subtitle for the watcher
// (Japanese now; other languages are a template each, never a translation of the island's words). The same meaning
// is always the same words, whoever says it, so the words can be learnt.
//
// Sounds: the vowels a i u e o, alone or after one of p t k m n s h l w. Words are runs of those syllables.

export type Tok = string;                    // a word (syllables, romanized) or the marks '.' and ','
export interface Said { isl: Tok[]; ja: string }

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
  of: 'ne', there: 'ka', to: 'to', from: 'ma', at: 'ma', with: 'weko', me: 'na', metre: 'meto', percent: 'pa', next: 'neka', same: 'hono',
} as const;
type Key = keyof typeof LEX;
const w = (k: Key) => LEX[k];

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
/** The island's own letters, as an inline SVG (current colour, about a line high). */
export function glyphs(toks: Tok[], cls = 'isl') {
  let x = 0; const parts: string[] = [];
  for (const t of toks) {
    if (t === '.') { parts.push(`<circle cx="${x + 2}" cy="12.5" r="1.1" class="f"/>`); x += 6; continue; }
    if (t === ',') { parts.push(`<path d="M${x + 2.5} 11L${x + 1.5} 14"/>`); x += 6; continue; }
    if (x) x += 4;   // (between words)
    for (const [c, v] of syllables(t)) { parts.push(`<g transform="translate(${x} 0)">${BASE[c]}${MARK[v]}</g>`); x += 12; }
  }
  return `<svg class="${cls}" viewBox="-1 -1 ${x + 2} 18" height="1.2em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><style>.f{fill:currentColor;stroke:none}</style>${parts.join('')}</svg>`;
}

/* ---------- what is said: one meaning, its words and its subtitle ---------- */
const NAME_JA: Record<string, string> = { dot: 'ドット', rakko: 'ラッコ', kame: 'カメマル', lantern: 'ランタン' };
const ROLE: Record<string, { isl: Tok[]; ja: string }> = {
  // (what each is for, as ADR 0006 has it: Dot widens the world — its map; Lantern lights the night — fire and what it learns of it)
  dot: { isl: [w('map'), w('build')], ja: '地図の作成' }, rakko: { isl: [w('shell'), w('gather')], ja: '貝殻の収集' },
  kame: { isl: [w('place'), w('measure')], ja: '位置の測量' }, lantern: { isl: [w('fire'), w('measure')], ja: '火と灯りの研究' },
};
const nameW = (id: string) => (LEX as Record<string, string>)[id] ?? id;
/** One of the values a resident reports: hut 3 of 24, shells 5, map 30 %. */
export interface Count { what: 'hut' | 'harvest' | 'shell' | 'full' | 'notes' | 'map' | 'cairn' | 'isle'; n: number; of?: number; pct?: boolean }
const COUNT_JA: Record<Count['what'], string> = { hut: '小屋', harvest: '収穫', shell: '貝殻', full: 'おなか', notes: '記録', map: '地図', cairn: '目印', isle: '見えた島' };
const ITEM: Record<string, { k: Key; ja: string }> = { wood: { k: 'wood', ja: '流木' }, shell: { k: 'shell', ja: '貝殻' }, stone: { k: 'stone', ja: '石' } };
const DRIFT: Record<string, Key> = { 'ヤシの実': 'coconut', '軽石': 'pumice', '大きな骨のかけら': 'bone', 'モダマの種': 'seabean' };

export const SAY = {
  /** The custom, the first time two meet: who it is, and what it is for. */
  identify(id: string): Said {
    return { isl: [w('identify'), nameW(id), ',', w('role'), ...ROLE[id].isl, '.'], ja: `識別：${NAME_JA[id]}。役割：${ROLE[id].ja}` };
  },
  /** How far it has got, in its own numbers. */
  report(counts: Count[]): Said {
    const isl: Tok[] = [w('report')], ja: string[] = [];
    counts.forEach((c, i) => {
      if (i) isl.push(',');
      isl.push(c.what === 'isle' ? w('island') : w(c.what), num(c.n));
      if (c.of !== undefined) isl.push(w('of'), num(c.of));
      if (c.pct) isl.push(w('percent'));
      ja.push(`${COUNT_JA[c.what]} ${c.n}${c.of !== undefined ? `/${c.of}` : c.pct ? '%' : c.what === 'shell' ? '個' : c.what === 'notes' ? '件' : c.what === 'isle' ? 'つ' : ''}`);
    });
    isl.push('.');
    return { isl, ja: `報告：${ja.join('、')}` };
  },
  /** Where something lies that the other gathers (to: said to that one, at a gathering). */
  share(kind: string, metres: number, to: string, atFire = false): Said {
    const it = ITEM[kind] ?? ITEM.wood, m = Math.round(metres);
    return atFire
      ? { isl: [w('share'), nameW(to), w('to'), ',', w(it.k), w('there'), ',', num(m), w('metre'), '.'], ja: `共有：${NAME_JA[to]}へ。${it.ja}が1つある（約${m}m）` }
      : { isl: [w('share'), w(it.k), w('there'), ',', nameW(to), w('from'), num(m), w('metre'), '.'], ja: `共有：${it.ja}が1つある（${NAME_JA[to]}から約${m}m）` };
  },
  /** Something the sea brought, picked up and put on the shelf. */
  found(thingJa: string): Said {
    const k = DRIFT[thingJa];
    return { isl: [w('found'), ',', w('beach'), w('at'), k ? w(k) : w('stone'), w('pick'), ',', w('shelf'), w('put'), '.'], ja: `発見：浜で${thingJa}を拾った。棚に置いた` };
  },
  proposePier(): Said { return { isl: [w('propose'), ',', w('pier'), w('with'), w('build'), ',', w('place'), w('me'), w('measure'), '.'], ja: '提案：桟橋を共同で作る。位置は僕が測る' }; },
  agreePier(id: string): Said {
    return id === 'dot' ? { isl: [w('agree'), ',', w('plank'), w('build'), '.'], ja: '了承：板を作る' }
      : id === 'rakko' ? { isl: [w('agree'), ',', w('post'), w('swim'), w('put'), '.'], ja: '了承：柱を泳いで立てる' }
        : { isl: [w('agree'), ',', w('base'), w('stone'), w('gather'), '.'], ja: '了承：土台の石を運ぶ' };
  },
  starsRecorded(): Said { return { isl: [w('record'), ',', w('star'), w('book'), w('put'), ',', w('next'), w('night'), w('same'), w('compare'), '.'], ja: '記録：星空を手帖に記録した。次の夜に同じ条件で比べる' }; },
};
