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
  | { act: 'tell-night'; reads: number; mark?: number; alarm: boolean }   // the night's gauge, told in the morning
  // everyday talk
  | { act: 'ask-why' }                                          // why?
  | { act: 'tell-why'; why: Reason }                            // because …
  | { act: 'ask-where'; what: Findable }                        // where is …?
  | { act: 'dont-know'; what?: Findable }                       // I don't know (where … is)
  | { act: 'ask-body'; to: Who; what: 'hungry' | 'sleepy' | 'battery' }   // are you hungry? how is your battery?
  | { act: 'tell-body'; hungry?: boolean; sleepy?: boolean; battery?: number }   // as the world counts it
  // sharing
  | { act: 'tell-result'; made: Made; ok: boolean; why?: Reason }          // I tried making …; it worked / it didn't, because …
  | { act: 'tell-measure'; what: Measured; n: number; unit: Unit }        // … is n (units)
  | { act: 'tell-guess'; if: Cond; then: Cond }                           // if …, … may be so
  | { act: 'tell-guess-status'; held: boolean; hits: number; wrong: number }   // that idea seems true / doubtful
  | { act: 'relay'; from: Who; said: Frame }                              // according to …, …
  | { act: 'teach'; how: 'catch-rain' | 'read-gauge' }                    // how it is done
  // proposing
  | { act: 'propose'; deed: Deed; mine?: Deed }                           // let's …; I'll …
  | { act: 'agree-proposal' }                                             // okay, I'll help too
  | { act: 'object-proposal'; why: Reason }                               // that's not good, because …
  | { act: 'counter'; instead: Deed }                                     // rather than that, let's …
  | { act: 'assign'; parts: { who: Who; deed: Deed }[] }                  // … does …, … does …
  // feedback
  | { act: 'helped'; what: 'wood'; became: 'piece' | 'raft' | 'catcher' } // … was of use: it became …
  | { act: 'heard-wrong'; what: Findable }                                // where I was told, there was no …
  | { act: 'correct'; said: Frame }                                       // no: …
  | { act: 'ask-how'; to: Who }                                           // how did it go?
  // stronger
  | { act: 'order'; to: Who; deed: Deed; why?: Reason }                   // do …! (because …)
  | { act: 'forbid'; to?: Who; deed: Deed; why?: Reason }                 // don't …! (because …)
  | { act: 'lecture'; deed: Deed; why: Reason }
  | { act: 'ask-storm'; to: Who }                                          // will a typhoon come?
  | { act: 'tell-storm'; likely: boolean; by: 'gauge' | 'swell' };         // what the gauge (or the swell) says                          // because …, we should …                        // what it did today, as the world counted it

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

export type Reason = 'hungry' | 'sleepy' | 'wind' | 'typhoon' | 'typhoon-soon' | 'rain' | 'far' | 'dark' | 'no-wood' | 'danger' | 'told-useful' | 'no-food';
const REASON: Record<Reason, { ids: Ids; ja: string; en: string }> = {
  hungry: { ids: ['me', 'topic', 'hungry'], ja: 'おなかがすいている', en: "I'm hungry" },
  sleepy: { ids: ['me', 'topic', 'sleepy'], ja: '眠い', en: "I'm sleepy" },
  wind: { ids: ['wind', 'topic', 'strong'], ja: '風が強い', en: 'the wind is strong' },
  typhoon: { ids: ['typhoon', 'come', 'ongoing'], ja: '台風が来ている', en: 'a typhoon is here' },
  'typhoon-soon': { ids: ['typhoon', 'come', 'future', 'maybe'], ja: '台風が来るかもしれない', en: 'a typhoon may come' },
  rain: { ids: ['rain', 'there'], ja: '雨が降っている', en: "it's raining" },
  far: { ids: ['that', 'place', 'topic', 'far'], ja: 'そこは遠い', en: "it's far" },
  dark: { ids: ['now', 'topic', 'dark'], ja: '今は暗い', en: "it's dark now" },
  'no-wood': { ids: ['wood', 'topic', 'lack'], ja: '流木が足りない', en: "there isn't enough driftwood" },
  danger: { ids: ['that', 'topic', 'danger'], ja: 'それは危ない', en: "it's dangerous" },
  'told-useful': { ids: ['tell', 'past', 'thing', 'topic', 'useful'], ja: '知らせたことは役に立つ', en: 'what is told is of use' },
  'no-food': { ids: ['food', 'topic', 'lack'], ja: '食べ物が足りない', en: "there isn't enough food" },
};
const because = (r: Reason) => ({ ids: [...REASON[r].ids, 'because', '.'] as Ids, ja: `${REASON[r].ja}から。`, en: ` Because ${REASON[r].en}.` });
/** Things one may do, with the forms Japanese gives them: as is, let's, do it!, (and so: don't, should). */
export type Deed = 'shelter' | 'sea' | 'pier' | 'raft' | 'catcher' | 'store-food' | 'fix-hut' | 'hut' | 'wood' | 'gauge' | 'tell-seen' | 'sleep' | 'eat' | 'haul' | 'harvest';
const DEED: Record<Deed, { ids: Ids; ja: [string, string, string]; en: string }> = {
  shelter: { ids: ['shelter_place', 'to', 'go'], ja: ['避難場所へ行く', '避難場所へ行こう', '避難場所へ行け'], en: 'go to shelter' },
  sea: { ids: ['sea', 'to', 'go'], ja: ['海に出る', '海に出よう', '海に出ろ'], en: 'go out to sea' },
  pier: { ids: ['pier', 'object', 'build'], ja: ['桟橋を作る', '桟橋を作ろう', '桟橋を作れ'], en: 'build the pier' },
  raft: { ids: ['raft', 'object', 'build'], ja: ['筏を作る', '筏を作ろう', '筏を作れ'], en: 'build a raft' },
  catcher: { ids: ['rain_catcher', 'object', 'build'], ja: ['雨受けを作る', '雨受けを作ろう', '雨受けを作れ'], en: 'build a rain catcher' },
  'store-food': { ids: ['food', 'object', 'store'], ja: ['食べ物をしまっておく', '食べ物をしまっておこう', '食べ物をしまっておけ'], en: 'store food' },
  'fix-hut': { ids: ['hut', 'object', 'fix'], ja: ['小屋を直す', '小屋を直そう', '小屋を直せ'], en: 'fix the hut' },
  hut: { ids: ['hut', 'object', 'build'], ja: ['小屋を作る', '小屋を作ろう', '小屋を作れ'], en: 'work on the hut' },
  wood: { ids: ['wood', 'object', 'gather'], ja: ['流木を集める', '流木を集めよう', '流木を集めろ'], en: 'gather driftwood' },
  gauge: { ids: ['barometer', 'object', 'read'], ja: ['気圧計を読む', '気圧計を読もう', '気圧計を読め'], en: 'read the barometer' },
  'tell-seen': { ids: ['see', 'past', 'thing', 'object', 'tell'], ja: ['見たことを知らせる', '見たことを知らせよう', '見たことを知らせろ'], en: 'tell what we saw' },
  sleep: { ids: ['sleep'], ja: ['眠る', '眠ろう', '眠れ'], en: 'sleep' },
  eat: { ids: ['eat'], ja: ['食べる', '食べよう', '食べろ'], en: 'eat' },
  haul: { ids: ['raft', 'object', 'high', 'place', 'to', 'carry'], ja: ['筏を高い所へ運ぶ', '筏を高い所へ運ぼう', '筏を高い所へ運べ'], en: 'carry the raft up high' },
  harvest: { ids: ['harvest', 'object', 'gather'], ja: ['実を早めに収穫する', '実を早めに収穫しよう', '実を早めに収穫しろ'], en: 'harvest early' },
};
export type Findable = 'wood' | 'shell' | 'coconut' | 'water' | 'thing';
const FIND: Record<Findable, { ja: string; en: string }> = { wood: { ja: '流木', en: 'driftwood' }, shell: { ja: '貝殻', en: 'shells' }, coconut: { ja: 'ヤシの実', en: 'coconuts' }, water: { ja: '水', en: 'water' }, thing: { ja: '見慣れないもの', en: 'the new thing' } };
export type Made = 'charcoal' | 'oil' | 'pot' | 'catcher' | 'raft' | 'clay';
const MADE: Record<Made, { id: string; ja: string; en: string }> = { charcoal: { id: 'charcoal', ja: '炭', en: 'charcoal' }, oil: { id: 'oil', ja: '油', en: 'oil' }, pot: { id: 'pot', ja: '器', en: 'a pot' }, catcher: { id: 'rain_catcher', ja: '雨受け', en: 'a rain catcher' }, raft: { id: 'raft', ja: '筏', en: 'a raft' }, clay: { id: 'clay', ja: '粘土', en: 'clay' } };
export type Measured = 'water' | 'coconut' | 'mark' | 'air' | 'wind' | 'island';
const MEASURED: Record<Measured, { ids: Ids; ja: string; en: string }> = { water: { ids: ['water'], ja: 'たまった水', en: 'The water held' }, coconut: { ids: ['coconut'], ja: 'ヤシの実', en: 'The coconut' }, mark: { ids: ['mark'], ja: '目盛り', en: 'The mark' }, air: { ids: ['warmth'], ja: '暖かさ', en: 'The warmth' }, wind: { ids: ['wind', 'of', 'speed'], ja: '風の速さ', en: 'The wind' }, island: { ids: ['island', 'of', 'farness'], ja: '島までの遠さ', en: 'The island' } };
export type Unit = 'kilogram' | 'litre' | 'degree' | 'metre' | 'percent' | 'mark' | 'none';
const UNIT: Record<Unit, { id?: string; ja: string; en: string }> = { kilogram: { id: 'kilogram', ja: 'キロ', en: ' kg' }, litre: { id: 'litre', ja: 'リットル', en: ' L' }, degree: { id: 'degree', ja: '度', en: ' degrees' }, metre: { id: 'metre', ja: 'メートル', en: ' m' }, percent: { id: 'percent', ja: 'パーセント', en: '%' }, mark: { ja: '', en: '' }, none: { ja: '', en: '' } };
/** What a guess is made of: a condition, and what may follow. */
export type Cond = 'mark-high' | 'mark-up' | 'hot' | 'typhoon' | 'swell-long' | 'mark-up-day';
const COND: Record<Cond, { ids: Ids; ja: string; en: string }> = {
  'mark-high': { ids: ['mark', 'topic', 'high'], ja: '目盛りが高い', en: 'the mark is high' },
  'mark-up': { ids: ['mark', 'topic', 'increase'], ja: '目盛りが上がる', en: 'the mark rises' },
  hot: { ids: ['now', 'topic', 'hot'], ja: '暑い', en: "it's hot" },
  typhoon: { ids: ['typhoon', 'come', 'future'], ja: '台風が来る', en: 'a typhoon comes' },
  'swell-long': { ids: ['long', 'swell', 'come', 'ongoing'], ja: '長いうねりが来ている', en: 'a long swell is coming in' },
  'mark-up-day': { ids: ['mark', 'topic', 'yesterday', 'than', 'increase'], ja: '目盛りが前の日より上がる', en: "the mark rises above yesterday's" },
};
const n_ = (n: number): Ids => { const v = Math.round(n); return v < 0 ? ['minus', `#${-v}`] : [`#${v}`]; };
const NAME: Record<Who, { ja: string; en: string }> = { dot: { ja: 'ドット', en: 'Dot' }, rakko: { ja: 'ラッコ', en: 'Rakko' }, kame: { ja: 'カメマル', en: 'Kamemaru' }, lantern: { ja: 'ランタン', en: 'Lantern' } };
const THING: Record<'wood' | 'shell', { ja: string; en: string }> = { wood: { ja: '流木', en: 'driftwood' }, shell: { ja: '貝殻', en: 'a shell' } };
/** The reasons' Japanese, as the island writes them, to their frames. */
export const NO_WHY: Record<string, NoWhy> = { 'おなかがすいている': 'hungry', '眠い': 'sleepy', '手がふさがっている': 'hands-full', '流木のある場所を知らない': 'not-seen', '今は貝殻を集めたい': 'busy-shells' };

function make(ids: Ids, ja: string, en: string): Said { return { isl: render(ids), ja, en }; }
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
      if (f.mark !== undefined) { ids.push('mark', 'topic', ...n_(f.mark), '.'); ja += `目盛りは${Math.round(f.mark)}。`; en += ` The mark is ${Math.round(f.mark)}.`; }
      if (f.alarm) { ids.push('mark', 'topic', 'high', '.', 'typhoon', 'come', 'future', 'question', '.'); ja += '目盛りが高い。台風が来るかもしれない。'; en += ' The mark is high. A typhoon may come.'; }
      return make(ids, ja, en);
    }
    case 'ask-why': return make(['why', 'question', '.'], 'なぜ？', 'Why?');
    case 'tell-why': { const b = because(f.why); return make(b.ids, b.ja, b.en.trim()); }
    case 'ask-where': return make([f.what, 'topic', 'where', 'at', 'there', 'question', '.'], `${FIND[f.what].ja}はどこにある？`, `Where ${f.what === 'shell' || f.what === 'coconut' ? 'are' : 'is'} ${FIND[f.what].en === 'driftwood' || f.what === 'water' ? 'the ' + FIND[f.what].en : FIND[f.what].en}?`);
    case 'dont-know': return f.what
      ? make(['me', 'topic', f.what, 'of', 'place', 'object', 'know', 'not', '.'], `${FIND[f.what].ja}のある場所を知らない。`, `I don't know where ${f.what === 'shell' || f.what === 'coconut' ? `${FIND[f.what].en} are` : `${FIND[f.what].en} is`}.`)
      : make(['me', 'topic', 'know', 'not', '.'], '知らない。', "I don't know.");
    case 'ask-body': return f.what === 'battery'
      ? make([f.to, ',', 'you', 'of', 'battery', 'topic', 'howmany', 'question', '.'], `${NAME[f.to].ja}、電池はどれくらい？`, `${NAME[f.to].en}, how is your battery?`)
      : make([f.to, ',', 'you', 'topic', f.what, 'question', '.'], `${NAME[f.to].ja}、${f.what === 'hungry' ? 'おなかはすいている' : '眠い'}？`, `${NAME[f.to].en}, are you ${f.what}?`);
    case 'tell-body': {
      const ids: Ids = [], ja: string[] = [], en: string[] = [];
      if (f.hungry !== undefined) { ids.push('me', 'topic', 'hungry', ...(f.hungry ? [] : ['not']), '.'); ja.push(f.hungry ? 'おなかがすいている。' : 'おなかはすいていない。'); en.push(f.hungry ? "I'm hungry." : "I'm not hungry."); }
      if (f.sleepy !== undefined) { ids.push('me', 'topic', 'sleepy', ...(f.sleepy ? [] : ['not']), '.'); ja.push(f.sleepy ? '眠い。' : '眠くない。'); en.push(f.sleepy ? "I'm sleepy." : "I'm not sleepy."); }
      if (f.battery !== undefined) { ids.push('battery', 'topic', ...n_(f.battery), 'percent', '.'); ja.push(`電池は${Math.round(f.battery)}パーセント。`); en.push(`My battery is at ${Math.round(f.battery)}%.`); }
      return make(ids, ja.join(''), en.join(' '));
    }
    case 'tell-result': {
      const m = MADE[f.made], ids: Ids = [m.id, 'object', 'make', 'try', 'past', '.', f.ok ? 'succeed' : 'fail', 'past', '.'];
      let ja = `${m.ja}を作ってみた。${f.ok ? 'うまくいった' : 'うまくいかなかった'}。`, en = `I tried making ${m.en}. ${f.ok ? 'It worked.' : "It didn't work."}`;
      if (!f.ok && f.why) { const b = because(f.why); ids.push(...b.ids); ja += b.ja; en += b.en; }
      return make(ids, ja, en);
    }
    case 'tell-measure': {
      const w = MEASURED[f.what], u = UNIT[f.unit], v = Math.round(f.n);
      return make([...w.ids, 'topic', ...n_(f.n), ...(u.id ? [u.id] : []), '.'], `${w.ja}は${v}${u.ja}。`, `${w.en} is ${v}${u.en}.`);
    }
    case 'tell-guess': { const a = COND[f.if], b = COND[f.then];
      return make([...a.ids, 'if', ',', ...b.ids, 'maybe', '.'], `${a.ja}なら、${b.ja}かもしれない。`, `If ${a.en}, ${b.en.replace(/^a typhoon comes$/, 'a typhoon may come')}${b.en === 'a typhoon comes' ? '' : ', maybe'}.`); }
    case 'tell-guess-status': return make(['that', 'idea', 'topic', 'true', ...(f.held ? [] : ['not']), 'maybe', '.', 'true', ...n_(f.hits), '.', 'wrong', ...n_(f.wrong), '.'],
      `その考えは${f.held ? '本当' : '本当ではない'}かもしれない。当たり${f.hits}、外れ${f.wrong}。`, `That idea may ${f.held ? '' : 'not '}be true. Right ${f.hits}, wrong ${f.wrong}.`);
    case 'relay': { const m = phrase(f.said); return { isl: [...render([f.from, 'according', ',']), ...m.isl], ja: `${NAME[f.from].ja}によると、${m.ja}`, en: `According to ${NAME[f.from].en}: ${m.en}` }; }
    case 'teach': return f.how === 'catch-rain'
      ? make(['bamboo', 'and', 'leaf', 'by', 'collect_rain', 'can', '.'], '竹と葉で、雨水をためられる。', 'With bamboo and leaves, you can catch rain.')
      : make(['mark', 'object', 'count', '.', 'then', ',', 'pressure', 'object', 'know', 'can', '.'], '目盛りを数える。そうすると、気圧がわかる。', 'Count the marks. Then you know the pressure.');
    case 'propose': { const d = DEED[f.deed]; const ids: Ids = ['we', 'topic', ...d.ids, 'lets', '.']; let ja = `みんなで${d.ja[1]}。`, en = `Let's ${d.en}.`;
      if (f.mine) { const m = DEED[f.mine]; ids.push('me', 'topic', ...m.ids, 'future', '.'); ja += `僕は${m.ja[0]}。`; en += ` I'll ${m.en}.`; }
      return make(ids, ja, en); }
    case 'agree-proposal': return make(['agree', '.', 'me', 'also', 'help', 'future', '.'], 'わかった。僕も手伝う。', "Okay. I'll help too.");
    case 'object-proposal': { const b = because(f.why); return make(['that', 'topic', 'good', 'not', '.', ...b.ids], `それはよくない。${b.ja}`, `That's not good.${b.en}`); }
    case 'counter': { const d = DEED[f.instead]; return make(['that', 'than', ',', ...d.ids, 'lets', '.'], `それより、${d.ja[1]}。`, `Rather than that, let's ${d.en}.`); }
    case 'assign': return make(f.parts.flatMap((p) => [p.who, 'topic', ...DEED[p.deed].ids, 'future', '.']), f.parts.map((p) => `${NAME[p.who].ja}は${DEED[p.deed].ja[0]}。`).join(''), f.parts.map((p) => `${NAME[p.who].en} will ${DEED[p.deed].en}.`).join(' '));
    case 'helped': { const to = f.became === 'piece' ? { ids: ['hut', 'of', 'piece'], ja: '小屋の部材', en: 'a piece of the hut' } : f.became === 'raft' ? { ids: ['raft'], ja: '筏', en: 'the raft' } : { ids: ['rain_catcher'], ja: '雨受け', en: 'the rain catcher' };
      return make([f.what, 'topic', 'useful', 'past', '.', ...to.ids, 'become', 'past', '.'], `${THING[f.what].ja}は役に立った。${to.ja}になった。`, `The ${THING[f.what].en} was of use. It became ${to.en}.`); }
    case 'heard-wrong': return make(['hear', 'past', 'place', 'at', f.what, 'there', 'not', 'past', '.'], `聞いた場所に${FIND[f.what].ja}はなかった。`, `There was no ${FIND[f.what].en} where I was told.`);
    case 'correct': { const m = phrase(f.said); return { isl: [...render(['wrong', '.']), ...m.isl], ja: `違う。${m.ja}`, en: `No. ${m.en}` }; }
    case 'ask-how': return make([f.to, ',', 'result', 'topic', 'how', 'question', '.'], `${NAME[f.to].ja}、結果はどうだった？`, `${NAME[f.to].en}, how did it go?`);
    case 'order': { const d = DEED[f.deed], b = f.why ? because(f.why) : null;
      return make([f.to, ',', ...d.ids, 'command', '.', ...(b?.ids ?? [])], `${NAME[f.to].ja}、${d.ja[2]}。${b?.ja ?? ''}`, `${NAME[f.to].en}, ${d.en}!${b?.en ?? ''}`); }
    case 'forbid': { const d = DEED[f.deed], b = f.why ? because(f.why) : null;
      return make([...(f.to ? [f.to, ','] : []), ...d.ids, 'dont', '.', ...(b?.ids ?? [])], `${f.to ? NAME[f.to].ja + '、' : ''}${d.ja[0]}な。${b?.ja ?? ''}`, `${f.to ? NAME[f.to].en + ', d' : 'D'}on't ${d.en}!${b?.en ?? ''}`); }
    case 'lecture': { const d = DEED[f.deed], r = REASON[f.why];
      return make([...r.ids, 'because', ',', 'we', 'topic', ...d.ids, 'should', '.'], `${r.ja}から、${d.ja[0]}べきだ。`, `${cap(r.en)}, so we should ${d.en}.`); }
    case 'ask-storm': return make([f.to, ',', 'typhoon', 'come', 'future', 'question', '.'], `${NAME[f.to].ja}、台風は来る？`, `${NAME[f.to].en}, will a typhoon come?`);
    case 'tell-storm': {
      const sign: Ids = f.by === 'gauge' ? ['mark', 'topic', 'high', ...(f.likely ? [] : ['not']), '.'] : ['long', 'swell', 'come', ...(f.likely ? ['ongoing'] : ['not']), '.'];
      const sja = f.by === 'gauge' ? (f.likely ? '目盛りが高い。' : '目盛りは高くない。') : (f.likely ? '長いうねりが来ている。' : '長いうねりは来ていない。');
      const sen = f.by === 'gauge' ? (f.likely ? 'The mark is high.' : 'The mark is not high.') : (f.likely ? 'A long swell is coming in.' : 'No long swell is coming in.');
      return make([...sign, 'typhoon', 'come', 'future', ...(f.likely ? [] : ['not']), 'maybe', '.'], `${sja}${f.likely ? '台風が来るかもしれない' : '台風は来そうにない'}。`, `${sen} A typhoon may${f.likely ? '' : ' not'} come.`);
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
