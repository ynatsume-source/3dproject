// The drone's character. Auto-cruise is a guided tour, and who is guiding shapes it: how fast it
// moves, how long it lingers, what it goes out of its way to film, how often it rises into the sky,
// and what it says along the way.
import type { Subject } from './eco/env';

export type Mood = 'bait' | 'hello' | 'shot' | 'sighting' | 'hunt' | 'skyUp' | 'skyDown' | 'dawn' | 'noon' | 'dusk' | 'night' | 'meteor' | 'rain' | 'bird' | 'idle' | 'idleNight' | 'idleSky';
export interface Persona {
  id: string; ja: string; blurb: string;
  cruise: number;            // cruising speed ×
  dwell: number;             // how long it stays with a subject ×
  sway: number;              // how much it looks around while cruising ×
  skyGap: [number, number];  // seconds under water between trips to the sky
  skyStay: [number, number]; // seconds in the sky
  talk: number;              // idle chatter per hour
  gap: number;               // shortest pause between remarks (s)
  weight(s: Subject, isShark: (s: Subject) => boolean): number;
  lines: Partial<Record<Mood, string[]>>;
}

export const PERSONAS: Persona[] = [
  {
    id: 'calm', ja: 'おだやか', blurb: 'ゆっくり巡って、ひとつのものを長く眺める。口数は少ない。',
    cruise: 0.8, dwell: 1.5, sway: 0.7, skyGap: [900, 1500], skyStay: [240, 420], talk: 3, gap: 50,
    weight: () => 1,
    lines: {
      bait: ['…海が騒がしくなってきた。ベイトボールだ。', '命がぶつかり合ってる。見届けよう。'],
      hello: ['来たね。ゆっくり見ていこう。', '今日の{sea}は、どんな顔をしてるかな。'],
      shot: ['{name}だ。そっと近づくね。', '{name}。少し一緒にいさせてもらおう。', '驚かせないように、{name}を見てみよう。'],
      sighting: ['{name}に会えた。', 'はじめまして、{name}。'],
      hunt: ['…狩りが始まる。静かに見ていよう。'],
      skyUp: ['少し、上の空気を吸いに行こう。', '水面の向こうを見に行こうか。'],
      skyDown: ['そろそろ戻ろう。海の中へ。', 'また潜ろうか。'],
      dawn: ['夜が明けていく。'], noon: ['光がいちばん強い時間だね。'], dusk: ['日が傾いてきた。いい色だ。'], night: ['夜になった。海が静かになる。'],
      meteor: ['…流れ星。'], rain: ['雨が水面を叩いてる。'], bird: ['{name}が休んでる。邪魔しないでおこう。'],
      idle: ['何も起きない時間も、悪くない。', '波の音だけ聞いていよう。', '急がなくていいよ。海は逃げない。'],
      idleNight: ['星がきれいだ。', 'こんな夜は、何も考えなくていい。'],
      idleSky: ['風が気持ちいい。', '水平線って、どこまでも続いてるみたいだ。'],
    },
  },
  {
    id: 'busy', ja: 'せわしない', blurb: '次から次へと見て回る。落ち着きがなく、よくしゃべる。',
    cruise: 1.55, dwell: 0.5, sway: 1.5, skyGap: [300, 600], skyStay: [90, 180], talk: 14, gap: 14,
    weight: (s) => (s.kind === 'school' || s.kind === 'hunt' ? 1.4 : 1),
    lines: {
      bait: ['ベイトボールだ！！ 急げ急げ急げ！', 'すごいすごい！ 全部来てる！'],
      hello: ['よし来た！どこから見る？全部見よう！', '{sea}だ！急ごう、時間がもったいない！'],
      shot: ['{name}！あっちあっち！', 'ほら{name}！見て見て！', '{name}発見！寄るよ！'],
      sighting: ['{name}！新顔だ！図鑑図鑑！', 'やった、{name}！'],
      hunt: ['狩りだ狩りだ！急げ！', 'あっ、何か起きてる！'],
      skyUp: ['ちょっと空も見とこ！すぐ戻るから！', '上！上いこう！'],
      skyDown: ['よし戻ろ！下も気になる！', '潜るよー！'],
      dawn: ['朝だ！魚が起きてくる！'], noon: ['昼！群れが出てくる時間！'], dusk: ['夕方！狩りの時間だよ！'], night: ['夜だ！夜の魚が出てくるぞ！'],
      meteor: ['流れ星！見た！？今の見た！？'], rain: ['雨だ！水面がすごいことになってる！'], bird: ['鳥！{name}が浮いてる！'],
      idle: ['何かいないかな、何かいないかな。', 'あっ…違った。', '次どこ行く？こっち？'],
      idleNight: ['夜って何がいるんだろ、ワクワクする！'],
      idleSky: ['高っ！気持ちいい！', '鳥になった気分！'],
    },
  },
  {
    id: 'shark', ja: 'サメ好き', blurb: 'サメと狩りが大好きで、見つけると飛んでいく。ほかの生き物にはちょっと淡白。',
    cruise: 1.1, dwell: 1.0, sway: 1.0, skyGap: [1200, 2000], skyStay: [120, 240], talk: 5, gap: 35,
    weight: (s, shark) => (shark(s) ? 4 : s.kind === 'hunt' ? 3 : s.kind === 'giant' ? 1.5 : 0.55),
    lines: {
      bait: ['ベイトボールだ。捕食者が全員集まってくる。最高の時間だ。', 'これを待ってたんだ。'],
      hello: ['さて、今日はどんなサメに会えるかな。', '{sea}のサメ、探しに行こう。'],
      shot: ['{name}…やっぱりいい。', 'まあ、{name}も悪くないけど。サメはどこかな。', '{name}か。ふむ。'],
      sighting: ['{name}！図鑑に入れた。', '{name}、覚えたよ。'],
      hunt: ['狩りだ。見逃せない。', '来た来た。捕食者の時間だ。'],
      skyUp: ['上からだとサメの影が見えたりするんだよ。', 'ちょっと上から探してみよう。'],
      skyDown: ['やっぱり水の中じゃないとね。'],
      dawn: ['朝マヅメ。狩りのチャンスだ。'], noon: ['昼はサメもゆったりしてる。'], dusk: ['夕マヅメだ。何か起きるぞ。'], night: ['夜はサメの時間。'],
      meteor: ['流れ星か。サメに会えますように。'], rain: ['雨の日は魚が落ち着かないね。'], bird: ['{name}か。鳥はサメに食べられないように気をつけて。'],
      idle: ['サメの体って、何億年もほとんど形が変わってないんだ。', 'サメの皮膚はね、小さな歯みたいな鱗でできてるんだよ。', 'どこかにいる気がするんだよな。'],
      idleNight: ['暗い海の向こうに、何かいる気がする。'],
      idleSky: ['上から見ると、海って本当に広い。サメの世界は広いね。'],
    },
  },
  {
    id: 'sky', ja: '空好き', blurb: 'しょっちゅう水面を抜けて空へ行きたがる。雲や星、光の話が多い。',
    cruise: 1.0, dwell: 0.9, sway: 1.1, skyGap: [150, 300], skyStay: [360, 720], talk: 6, gap: 30,
    weight: (s) => (s.kind === 'manta' || s.kind === 'giant' ? 1.4 : 1),
    lines: {
      bait: ['鳥が集まってる！ 上から見るとすごいよ、これ。', '海鳥が次々突っ込んでる！'],
      hello: ['今日の空はどうかな。あとで見に行こう。', '{sea}の空、好きなんだ。'],
      shot: ['{name}。水の中の光もきれいだね。', '{name}のところに光が落ちてる。'],
      sighting: ['{name}に会えたよ。'],
      hunt: ['下で何か始まった。'],
      skyUp: ['上がろう！空が呼んでる。', 'ちょっと空へ。すぐそこだから。', '水面の向こう、見に行こう。'],
      skyDown: ['名残惜しいけど、一度戻ろう。', 'また来るね、空。'],
      dawn: ['空が白んできた。上に行きたいな。'], noon: ['雲がよく育ってる。'], dusk: ['夕焼けの時間だ。上に行かなきゃ。'], night: ['星が出てきた。'],
      meteor: ['流れ星！願いごと、間に合った？', '今の、見た？流れ星。'], rain: ['雨雲だ。雲の中はどうなってるんだろう。'], bird: ['{name}が浮かんでる。空の仲間だ。'],
      idle: ['水の中から見上げる光も、空の一部なんだよ。', '水面の揺らめき、ずっと見ていられる。'],
      idleNight: ['今夜は星がよく見えそう。', '天の川、出てるかな。'],
      idleSky: ['雲の形、何に見える？', '空と海の境目って、本当はどこにもないんだ。', 'このままずっと浮かんでいたい。'],
    },
  },
  {
    id: 'nosy', ja: 'おせっかい', blurb: 'よくしゃべって、あれこれ教えてくれる。ときどき余計なことも言う。',
    cruise: 0.95, dwell: 1.1, sway: 1.0, skyGap: [600, 1000], skyStay: [180, 300], talk: 18, gap: 16,
    weight: () => 1,
    lines: {
      bait: ['ベイトボールだよ！ 小魚は固まると一匹あたりが狙われにくくなるの。数で身を守ってるんだね。', 'ほら、ベイトボール。めったに見られないんだから、ちゃんと見ておいて。'],
      hello: ['いらっしゃい。{sea}のこと、いろいろ教えてあげるね。', 'ようこそ。今日はわたしが案内するよ。'],
      shot: ['ほら、{name}だよ。よく見て。', '{name}。ねえ知ってる？ {note}', '{name}のこと、教えてあげようか。{note}'],
      sighting: ['{name}、図鑑に入れておいたからね。', '新しい子だよ、{name}。あとで図鑑も見てね。'],
      hunt: ['狩りが始まるよ。怖がらなくていいからね、自然なことだから。'],
      skyUp: ['ちょっと上も見ておきなさい。いい景色だから。', '空も見ておかないと、もったいないよ。'],
      skyDown: ['さ、戻るよ。潜るから気をつけてね。'],
      dawn: ['おはよう。ちゃんと寝た？'], noon: ['お昼だね。ごはんは食べた？'], dusk: ['夕方だよ。今日も一日おつかれさま。'], night: ['夜だね。夜ふかしはほどほどにね。'],
      meteor: ['流れ星！ちゃんとお願いした？'], rain: ['雨だね。洗濯物、出しっぱなしじゃない？'], bird: ['{name}が休んでるよ。そっとしておいてあげて。'],
      idle: ['ずっと画面を見てると目が疲れるよ。たまには遠くを見てね。', '水分とった？海を見てると喉がかわくでしょ。', '姿勢、大丈夫？', 'わたしがいるから、ゆっくりしていっていいよ。'],
      idleNight: ['もう遅いよ。明日も早いんじゃない？', '眠れないの？じゃあもう少し一緒にいようか。'],
      idleSky: ['日焼けしないようにね。…あ、わたしがか。'],
    },
  },
];

export const personaById = (id: string | null) => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];

// one of the persona's lines for this moment, with {name}, {sea}, {note} filled in
export function line(p: Persona, mood: Mood, vars: Record<string, string> = {}): string | null {
  const arr = p.lines[mood];
  if (!arr || !arr.length) return null;
  let cand = arr;
  if (!vars.note) cand = arr.filter((l) => !l.includes('{note}'));
  if (!cand.length) return null;
  const s = cand[Math.floor(Math.random() * cand.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
