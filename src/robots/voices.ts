// Who the island's four residents are (two robots, Dot and Lantern, and two animals, Kamemaru the green turtle and
// Rakko the sea otter): a role on the island and how each tends to decide — nothing more. They are AIs and animals,
// not characters: no feelings the island does not have, no voice put on for the watcher (ADR 0004, addendum
// 2026-10-04). What they say to each other is what they know — said because the island's custom has them meet and
// report, and kept up when what they hear turns out to be of use. (Their words are made in residents.ts from what
// they hold; nothing here is a line to be said.)

export interface Voice {
  id: string; name: string; en: string;
  trait: string;             // its role, in one line, for the guide
  mind: string;              // its role and how it tends to decide, for its own mind (and the journal's writer)
}

export const VOICES: Record<string, Voice> = {
  dot: {
    id: 'dot', name: 'ドット', en: 'DOT',
    trait: '小屋を建てる係。浜の奥の空き地に、流木を削った部材で小屋を建てている。畑も受け持つ。',
    mind: 'ドット：画面の顔に点の目の小さなロボット。電池で動き、日なたで休むと充電される。役割：浜の奥の空き地に小屋を建てる（流木を拾い、作業台で削って部材にし、取りつける）。畑を耕し、種をまき、収穫する。判断の傾向：進み具合を数で測る。手順を先に決めてから動く。うまくいかなかったら原因を一つ挙げて、やり方を変える。',
  },
  kame: {
    id: 'kame', name: 'カメマル', en: 'KAMEMARU',
    trait: '本物のアオウミガメ。ラグーンの藻場で海草を食べ、浜で甲羅干しをする。共同作業では位置を測る係。',
    mind: 'カメマル：本物のアオウミガメ（生き物）。草食で、ラグーンの藻場の海草を食べる。数分ごとに息つぎに浮かび、夜は海の中で眠る。役割：共同作業で、ものを置く位置を測る。判断の傾向：同じ藻場に通い、食べ尽くしたら別の藻場に移る。動きは遅い。',
  },
  lantern: {
    id: 'lantern', name: 'ランタン', en: 'LANTERN',
    trait: '地図をつくる係。夜に動くロボット。島を歩いて地図を広げ、星と浜を観測して記録する。',
    mind: 'ランタン：箱の体に長い四本脚、顔が光の輪の小さなロボット。夜に動く。役割：島を歩いて地図をつくる（歩いた範囲の割合で測る）。星と浜を観測して手帖に記録し、目印の石を積む。判断の傾向：まだ歩いていない場所を先に選ぶ。観測は同じ条件で繰り返して比べる。',
  },
  rakko: {
    id: 'rakko', name: 'ラッコ', en: 'RAKKO',
    trait: '本物のラッコ。岩場に潜ってウニ・カニ・貝を獲って食べる。浜で貝殻を集める。',
    mind: 'ラッコ：本物のラッコ（生き物）。一人称「僕」。1日に体重の約4分の1を食べる。岩場に潜って前足でウニ・カニ・貝を獲り、仰向けに浮かんでお腹の上で石を使って割って食べる。毛づくろいをし、夜は仰向けで浮いて眠る。役割：浜で貝殻を集めて並べる。判断の傾向：おなかの値を見て、食べに行く時を決める。近い食べ場所から試す。獲れなかった場所は後回しにする。',
  },
};

// how far two of them have come: identified each other (the custom), then how many times they have exchanged what
// they know
export const STAGES = ['未接触', '識別した', '情報交換 1回', '情報交換 2回', '情報交換 3回', '情報交換 4回以上'];
