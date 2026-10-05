// Lumau's grammar, in the order of Japanese (docs/lumau/GRAMMAR.md):
//
//   [joining word ,] subject e   time ni   place ni   thing o   verb  aspect  can/must  not  past/future  ko .
//
// - The small words come after what they mark: e (topic), o (object), ni (at), to (to), ma (from), pu (by),
//   weko (with), ika (than), lami (until), sipe (about), mo (more than one), mi (also), hosi (only).
// - After the verb, in this order: sumo/mase (going on / done), pole/kili (can / must), nole (not),
//   kau/leni (past / future), ko (a question). walo (let's) and lai (please) end the sentence instead.
// - What tells about a thing comes before it: a quality (big island), a 'ne' phrase (Dot ne map = Dot's map),
//   or a whole clause (Dot made hut = the hut Dot made). A count comes after it (shell 5).
// - There is no 'to be': 'ili e nesi.' is 'this is an island'.
// - Clauses are joined at their end: ... pasi, (because) ... mepo, (if) ... nalu, (when) ... tei (that, as said or
//   thought). Sentences are joined at their start: sole (then), kemo (but), leka (so).
// - A question keeps the order and ends in ko; the question word stands where the answer would.
import { num, type Tok } from '../islandlang';
import { word } from './lexicon';

/** A sentence as ids: words by id, '#24' for a number, and the marks '.' and ','. */
export type Ids = string[];
/** The words of a sentence, ready for glyphs() / kana() / roman(). */
export function render(ids: Ids): Tok[] {
  return ids.map((t) => (t === '.' || t === ',' ? t : t.startsWith('#') ? num(+t.slice(1)) : word(t)));
}

export interface Example { point: string; ids: Ids; ja: string; en: string }
/** The grammar shown by examples, one point each. */
export const EXAMPLES: Example[] = [
  { point: '主題と「である」', ids: ['me', 'topic', 'dot', '.'], ja: '僕はドット。', en: 'I am Dot.' },
  { point: '語順（主題・目的・動詞）', ids: ['dot', 'topic', 'map', 'object', 'build', 'ongoing', '.'], ja: 'ドットは地図を作っている。', en: 'Dot is making a map.' },
  { point: '時と場所、過去', ids: ['lantern', 'topic', 'night', 'at', 'fire', 'object', 'light_v', 'past', '.'], ja: 'ランタンは夜に火を灯した。', en: 'Lantern lit a fire at night.' },
  { point: '数（名詞の後ろ）', ids: ['rakko', 'topic', 'shell', '#5', 'object', 'gather', 'past', '.'], ja: 'ラッコは貝殻を5つ集めた。', en: 'Rakko gathered five shells.' },
  { point: '質問の言葉', ids: ['you', 'topic', 'where', 'at', 'swim', 'past', 'question', '.'], ja: 'あなたはどこで泳いだか。', en: 'Where did you swim?' },
  { point: 'だれが', ids: ['who', 'topic', 'this', 'object', 'found', 'past', 'question', '.'], ja: 'だれがこれを見つけたか。', en: 'Who found this?' },
  { point: 'いくつ', ids: ['shell', 'howmany', 'there', 'question', '.'], ja: '貝殻はいくつあるか。', en: 'How many shells are there?' },
  { point: '否定と過去の質問', ids: ['you', 'topic', 'fish', 'object', 'eat', 'not', 'past', 'question', '.'], ja: 'あなたは魚を食べなかったか。', en: "Didn't you eat the fish?" },
  { point: 'はい・いいえ', ids: ['agree', ',', 'me', 'topic', 'eat', 'past', '.'], ja: 'はい、僕は食べた。', en: 'Yes, I ate.' },
  { point: 'できる・できない', ids: ['kame', 'topic', 'deep', 'dive', 'can', '.'], ja: 'カメマルは深く潜れる。', en: 'Kamemaru can dive deep.' },
  { point: 'しなければならない', ids: ['we', 'topic', 'hut', 'object', 'fix', 'must', '.'], ja: '私たちは小屋を直さなければならない。', en: 'We must fix the hut.' },
  { point: 'しよう', ids: ['we', 'topic', 'beach', 'at', 'meet', 'lets', '.'], ja: '私たちは浜で会おう。', en: "Let's meet at the beach." },
  { point: 'してほしい', ids: ['wood', 'object', 'shelf', 'to', 'carry', 'please', '.'], ja: '流木を棚へ運んでほしい。', en: 'Please carry the wood to the shelf.' },
  { point: 'いっしょに', ids: ['me', 'topic', 'you', 'with', 'raft', 'object', 'build', 'future', '.'], ja: '僕はあなたと筏を作る。', en: 'I will build a raft with you.' },
  { point: 'の（持ち主）', ids: ['dot', 'of', 'map', 'topic', 'big', '.'], ja: 'ドットの地図は大きい。', en: "Dot's map is big." },
  { point: 'くらべる', ids: ['this', 'island', 'topic', 'that', 'island', 'than', 'small', '.'], ja: 'この島はあの島より小さい。', en: 'This island is smaller than that island.' },
  { point: 'いちばん', ids: ['this', 'topic', 'most', 'high', 'place', '.'], ja: 'ここはいちばん高い場所だ。', en: 'This is the highest place.' },
  { point: '名詞を説明する文', ids: ['dot', 'build', 'past', 'hut', 'topic', 'strong', '.'], ja: 'ドットが作った小屋は丈夫だ。', en: 'The hut Dot built is strong.' },
  { point: 'ので', ids: ['wind', 'strong', 'because', ',', 'me', 'topic', 'voyage', 'not', 'future', '.'], ja: '風が強いので、僕は船出しない。', en: "The wind is strong, so I won't sail." },
  { point: 'もし〜なら', ids: ['rain', 'there', 'if', ',', 'fire', 'object', 'light_v', 'can', 'not', '.'], ja: 'もし雨なら、火は灯せない。', en: "If it rains, we can't light a fire." },
  { point: '〜とき', ids: ['sun', 'sink', 'when', ',', 'everyone', 'topic', 'fire', 'at', 'gather', '.'], ja: '日が沈むとき、みんなは火のところに集まる。', en: 'When the sun sets, everyone gathers at the fire.' },
  { point: '〜と思う', ids: ['tomorrow', 'rain', 'there', 'quote', 'me', 'topic', 'think', '.'], ja: '明日は雨があると僕は思う。', en: 'I think it will rain tomorrow.' },
  { point: 'しかし', ids: ['me', 'topic', 'island', 'object', 'see', 'past', '.', 'but', ',', 'far', '.'], ja: '僕は島を見た。しかし、遠い。', en: 'I saw an island. But it is far.' },
  { point: 'できた言葉（〜する者）', ids: ['dot', 'topic', 'explorer', '.'], ja: 'ドットは探りに行く者だ。', en: 'Dot is an explorer.' },
];
