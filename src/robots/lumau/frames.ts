// What the residents say to each other, as meanings (ADR 0006, the island's language, step 3): the world (or a mind)
// picks a frame — an act and its values — and the sentence is made from it by Lumau's grammar (grammar.ts), with its
// Japanese and English. No feelings in them: what each asks, answers, hands over and tells (owner's decision).
import { render, type Ids } from './grammar';
import type { Said } from '../islandlang';

export type Who = 'dot' | 'rakko' | 'kame' | 'lantern';
/** Why a request is turned down (the reasons the island gives: residents.ts refuseWhy). */
export type NoWhy = 'hungry' | 'sleepy' | 'hands-full' | 'not-seen' | 'busy-shells';
export type Frame =
  | { act: 'ask-bring'; to: Who; what: 'wood' }                 // please bring me …
  | { act: 'accept-bring'; to: Who; what: 'wood' }              // okay: I'll bring you …
  | { act: 'refuse'; why: NoWhy }                               // no, because …
  | { act: 'hand-over'; what: 'wood' }                          // here is …
  | { act: 'received'; what: 'wood' }                           // got it
  | { act: 'tell-where'; what: 'wood' | 'shell'; metres: number } // there is … over there, about n m
  | { act: 'will-go' }                                          // okay, I'll go
  | { act: 'noted' }                                            // okay (heard it)
  | { act: 'warn'; what: 'typhoon' | 'rain' | 'wind' }          // the weather, told to one near
  | { act: 'plan'; doing: 'hut' | 'map' | 'wood' | 'shells' | 'eat' | 'nap' | 'sleep' }    // what it is about to do
  | { act: 'offer-help'; to: Who; what: 'wood' }                // shall I bring you …?
  | { act: 'accept-help' }                                      // yes, please
  | { act: 'decline-help'; why: 'has-wood' | 'hut-done' }       // no need, because …
  | { act: 'found'; what: 'drift' }                             // there is something new on the beach
  | { act: 'ask-day'; to: Who }                                 // what did you do today? (round the evening fire)
  | { act: 'tell-day'; did: DayItem[] }                        // what it did today, as the world counted it
  | { act: 'ask-plan'; to: Who }                                // what will you do today? (the morning gathering)
  | { act: 'tell-night'; reads: number; mark?: number; alarm: boolean };   // the night's gauge, told in the morning                        // what it did today, as the world counted it

/** One thing done today, counted by the world (residents.ts dayCounts): pieces fitted to the hut, islands put on the
 *  map, shells gathered, notes written, cairns stacked, photographs taken. */
export type DayItem = { what: 'piece' | 'island' | 'shell' | 'note' | 'cairn' | 'photo' | 'eat'; n: number } | { what: 'met'; n: number; with: Who };
const DAY: Record<DayItem['what'], { ids: (n: number, w?: Who) => string[]; ja: (n: number, w?: Who) => string; en: (n: number, w?: Who) => string }> = {
  piece: { ids: (n) => ['piece', `#${n}`, 'object', 'build', 'past'], ja: (n) => `部材を${n}つ取りつけた`, en: (n) => `fitted ${n === 1 ? 'a piece' : `${n} pieces`} to the hut` },
  island: { ids: (n) => ['island', `#${n}`, 'object', 'found', 'past'], ja: (n) => `島を${n}つ見つけた`, en: (n) => `found ${n === 1 ? 'an island' : `${n} islands`}` },
  shell: { ids: (n) => ['shell', `#${n}`, 'object', 'gather', 'past'], ja: (n) => `貝殻を${n}つ集めた`, en: (n) => `gathered ${n === 1 ? 'a shell' : `${n} shells`}` },
  note: { ids: (n) => ['record_n', `#${n}`, 'object', 'write', 'past'], ja: (n) => `記録を${n}つ書いた`, en: (n) => `wrote ${n === 1 ? 'a note' : `${n} notes`}` },
  cairn: { ids: (n) => ['cairn', `#${n}`, 'object', 'stack', 'past'], ja: (n) => `石積みを${n}つ積んだ`, en: (n) => `stacked ${n === 1 ? 'a cairn' : `${n} cairns`}` },
  photo: { ids: (n) => ['picture', `#${n}`, 'object', 'photograph', 'past'], ja: (n) => `写真を${n}枚撮った`, en: (n) => `took ${n === 1 ? 'a photograph' : `${n} photographs`}` },
  eat: { ids: (n) => ['sea', 'at', `#${n}`, 'times', 'eat', 'past'], ja: (n) => `海で${n}回食べた`, en: (n) => `ate in the sea ${n === 1 ? 'once' : `${n} times`}` },
  met: { ids: (_n, w) => [w!, 'with', 'speak', 'past'], ja: (_n, w) => `${NAME[w!].ja}と話した`, en: (_n, w) => `talked with ${NAME[w!].en}` },
};

const NAME: Record<Who, { ja: string; en: string }> = { dot: { ja: 'ドット', en: 'Dot' }, rakko: { ja: 'ラッコ', en: 'Rakko' }, kame: { ja: 'カメマル', en: 'Kamemaru' }, lantern: { ja: 'ランタン', en: 'Lantern' } };
const THING: Record<'wood' | 'shell', { ja: string; en: string }> = { wood: { ja: '流木', en: 'driftwood' }, shell: { ja: '貝殻', en: 'a shell' } };
/** The reasons' Japanese, as the island writes them, to their frames. */
export const NO_WHY: Record<string, NoWhy> = { 'おなかがすいている': 'hungry', '眠い': 'sleepy', '手がふさがっている': 'hands-full', '流木のある場所を知らない': 'not-seen', '今は貝殻を集めたい': 'busy-shells' };

function make(ids: Ids, ja: string, en: string): Said { return { isl: render(ids), ja, en }; }

/** A meaning, said: the island's words, and what they mean in Japanese and English. */
export function phrase(f: Frame): Said {
  switch (f.act) {
    case 'ask-bring': return make([f.to, ',', f.what, 'object', 'me', 'to', 'carry', 'please', '.'], `${NAME[f.to].ja}、${THING[f.what].ja}を僕のところへ運んでほしい。`, `${NAME[f.to].en}, please bring me ${THING[f.what].en}.`);
    case 'accept-bring': return make(['agree', '.', 'me', 'topic', f.what, 'object', 'you', 'to', 'carry', 'future', '.'], `わかった。${THING[f.what].ja}をあなたのところへ運ぶ。`, `Okay. I will bring you ${THING[f.what].en}.`);
    case 'refuse':
      switch (f.why) {
        case 'hungry': return make(['not', '.', 'me', 'topic', 'hungry', 'because', ',', 'eat', 'must', '.'], 'いいえ。おなかがすいているので、食べなければならない。', "No. I'm hungry, so I must eat.");
        case 'sleepy': return make(['not', '.', 'me', 'topic', 'sleepy', 'because', ',', 'sleep', 'must', '.'], 'いいえ。眠いので、眠らなければならない。', "No. I'm sleepy, so I must sleep.");
        case 'hands-full': return make(['not', '.', 'me', 'of', 'hand', 'topic', 'busy', '.'], 'いいえ。僕の手はふさがっている。', 'No. My hands are full.');
        case 'not-seen': return make(['not', '.', 'me', 'topic', 'wood', 'of', 'place', 'object', 'know', 'not', '.'], 'いいえ。流木のある場所を知らない。', "No. I don't know where there is driftwood.");
        case 'busy-shells': return make(['not', '.', 'me', 'topic', 'now', 'shell', 'object', 'gather', 'ongoing', '.'], 'いいえ。僕は今、貝殻を集めている。', "No. I'm gathering shells now.");
      }
      break;
    case 'hand-over': return make(['this', 'topic', f.what, '.', 'you', 'to', 'give', '.'], `これは${THING[f.what].ja}。あなたに渡す。`, `This is ${THING[f.what].en}. It's for you.`);
    case 'received': return make(['agree', '.', f.what, 'object', 'receive', 'past', '.'], `うん。${THING[f.what].ja}を受け取った。`, `Got it. I have the ${THING[f.what].en.replace(/^a /, '')}.`);
    case 'tell-where': { const m = Math.max(1, Math.round(f.metres)); return make(['yonder', 'at', f.what, 'there', '.', `#${m}`, 'metre', '.'], `あそこに${THING[f.what].ja}がある。約${m}m。`, `There is ${THING[f.what].en} over there. About ${m} m.`); }
    case 'will-go': return make(['agree', '.', 'me', 'topic', 'go', 'future', '.'], 'わかった。行く。', "Okay. I'll go.");
    case 'noted': return make(['agree', '.'], 'わかった。', 'Okay.');
    case 'warn':
      switch (f.what) {
        case 'typhoon': return make(['typhoon', 'come', 'ongoing', '.', 'shelter_place', 'to', 'go', 'lets', '.'], '台風が来ている。避難場所へ行こう。', "A typhoon is coming. Let's go to shelter.");
        case 'rain': return make(['now', 'rain', 'there', '.'], '今、雨が降っている。', "It's raining now.");
        case 'wind': return make(['wind', 'topic', 'very', 'strong', '.'], '風がとても強い。', 'The wind is very strong.');
      }
      break;
    case 'plan':
      switch (f.doing) {
        case 'hut': return make(['me', 'topic', 'hut', 'object', 'build', 'future', '.'], '僕は小屋を作る。', "I'll work on the hut.");
        case 'map': return make(['me', 'topic', 'map', 'object', 'build', 'future', '.'], '僕は地図を作る。', "I'll work on the map.");
        case 'wood': return make(['me', 'topic', 'wood', 'object', 'gather', 'future', '.'], '僕は流木を集める。', "I'll gather driftwood.");
        case 'shells': return make(['me', 'topic', 'shell', 'object', 'gather', 'future', '.'], '僕は貝殻を集める。', "I'll gather shells.");
        case 'eat': return make(['me', 'topic', 'sea', 'at', 'eat', 'future', '.'], '僕は海で食べる。', "I'll go and eat in the sea.");
        case 'nap': return make(['me', 'topic', 'sea', 'at', 'sleep', 'future', '.'], '僕は海で眠る。', "I'll sleep on the sea.");
        case 'sleep': return make(['me', 'topic', 'sleep', 'future', '.'], '僕は眠る。', "I'll sleep.");
      }
      break;
  }
  switch (f.act) {
    case 'offer-help': return make([f.to, ',', 'me', 'topic', f.what, 'object', 'you', 'to', 'carry', 'future', 'question', '.'], `${NAME[f.to].ja}、${THING[f.what].ja}を運ぼうか。`, `${NAME[f.to].en}, shall I bring you ${THING[f.what].en}?`);
    case 'accept-help': return make(['agree', '.', 'help', 'please', '.'], 'うん。手伝ってほしい。', 'Yes, please help.');
    case 'decline-help': return f.why === 'has-wood'
      ? make(['not', '.', 'me', 'topic', 'wood', 'object', 'there', '.'], 'いいえ。流木はもう持っている。', 'No need. I have driftwood already.')
      : make(['not', '.', 'hut', 'topic', 'build', 'past', '.'], 'いいえ。小屋はもうできた。', 'No need. The hut is built.');
    case 'found': return make(['beach', 'at', 'new', 'thing', 'there', '.'], '浜に見慣れないものがある。', "There's something new on the beach.");
    case 'ask-day': return make([f.to, ',', 'you', 'topic', 'today', 'what', 'object', 'do', 'past', 'question', '.'], `${NAME[f.to].ja}、今日は何をした？`, `${NAME[f.to].en}, what did you do today?`);
    case 'ask-plan': return make([f.to, ',', 'you', 'topic', 'today', 'what', 'object', 'do', 'future', 'question', '.'], `${NAME[f.to].ja}、今日は何をする？`, `${NAME[f.to].en}, what will you do today?`);
    case 'tell-night': {
      if (!f.reads) return make(['me', 'topic', 'night', 'rest', 'past', '.'], '夜は休んだ。', 'I rested in the night.');
      const ids: Ids = ['me', 'topic', 'night', 'barometer', 'object', `#${f.reads}`, 'times', 'read', 'past', '.'];
      let ja = `夜、気圧計を${f.reads}回読んだ。`, en = `In the night I read the barometer ${f.reads === 1 ? 'once' : `${f.reads} times`}.`;
      if (f.mark !== undefined && f.mark >= 0) { ids.push('mark', 'topic', `#${f.mark}`, '.'); ja += `目盛りは${f.mark}。`; en += ` The mark is ${f.mark}.`; }
      if (f.alarm) { ids.push('mark', 'topic', 'high', '.', 'typhoon', 'come', 'future', 'question', '.'); ja += '目盛りが高い。台風が来るかもしれない。'; en += ' The mark is high. A typhoon may come.'; }
      return make(ids, ja, en);
    }
    case 'tell-day': {
      if (!f.did.length) return make(['me', 'topic', 'today', 'rest', 'past', '.'], '今日は休んだ。', 'I rested today.');
      const w = (d: DayItem) => (d.what === 'met' ? d.with : undefined);
      const [a, b] = f.did, ids = ['me', 'topic', 'today', ...DAY[a.what].ids(a.n, w(a)), '.'];   // (the time after the topic, as 'now' is: grammar.ts)
      let ja = `今日は${DAY[a.what].ja(a.n, w(a))}。`, en = `Today I ${DAY[a.what].en(a.n, w(a))}.`;
      if (b) { ids.push('then', ',', ...DAY[b.what].ids(b.n, w(b)), '.'); ja += `それから、${DAY[b.what].ja(b.n, w(b))}。`; en += ` And I ${DAY[b.what].en(b.n, w(b))}.`; }
      return make(ids, ja, en);
    }
  }
  throw new Error(`no phrase for ${JSON.stringify(f)}`);
}
