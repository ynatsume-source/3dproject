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
  | { act: 'noted' };                                           // okay (heard it)

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
  }
  throw new Error(`no phrase for ${JSON.stringify(f)}`);
}
