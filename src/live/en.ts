// The live screen in English (?live&lang=en; viewer design v2 §5, L5): the world's own Japanese words for what a
// resident is doing, and its firsts, put into English just before they are drawn — a pure table on the screen's side.
// The world and the residents' minds are not asked anything and are given nothing: the same sentences, read, and turned.
// Only what the live screen shows is here (the status line, the first-time card, the set phrases); a status the table
// does not know is shown as a plain "busy" rather than in Japanese. scripts/live-en-check.ts keeps the table whole: every
// sentence the world's status can make has its English.

export const NAMES_EN: Record<string, string> = { ドット: 'Dot', ラッコ: 'Rakko', カメマル: 'Kamemaru', ランタン: 'Lantern', 仲間: 'a friend' };
const PREY_EN: Record<string, string> = { ウニ: 'a sea urchin', カニ: 'a crab', 貝: 'a clam' };
const name = (ja: string) => NAMES_EN[ja] ?? ja;   // (an island word for a place stays as it is: it is a name)

/** The set phrases of the screen. */
export const FIXED_EN = {
  brand: "Dot's island",
  ai: 'The residents are AIs · Filmed automatically',
  first: 'A first on the island',
  date: (y: number, m: number, d: number) => `Island year ${y} · ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`,
};

const EXACT: Record<string, string> = {
  'お腹の上で貝を割っている': 'cracking a clam on its belly', 'お腹の上の石で貝を割って食べている': 'cracking a clam on the stone on its belly, and eating',
  'となりの浜のほうへ散歩している': 'strolling toward the next beach', 'どうするか考えている': 'thinking what to do', 'ひと休みしている': 'taking a rest',
  'ひと休みできる場所へ向かっている': 'heading for a place to rest', 'カメマルの岩棚のまわりに石を置いている': "setting stones round Kamemaru's ledge",
  'カメマルの岩棚へ石を運んでいる': "carrying a stone to Kamemaru's ledge", 'ラグーンを泳いで記録している': 'swimming the lagoon and keeping a record',
  '丘で次に気になることを考えている': 'on the hill, thinking what to look at next', '丘のふもとで夜を待っている': 'waiting for night at the foot of the hill',
  '丘のふもとへ向かっている': 'heading for the foot of the hill', '丘の上で星を見て考えごとをしている': 'on the hilltop, watching the stars and thinking',
  '丘の上へ歩いている': 'walking up the hill', '仰向けで波に揺られて眠っている': 'asleep on its back, rocked by the waves', '仰向けに浮いたまま昼寝している': 'napping, floating on its back',
  '休み場に石を運んでいる': 'carrying a stone to the resting place', '休み場の囲いに石を積んでいる': 'piling stones round the resting place',
  '作業台で流木を部材に削っている': 'shaping driftwood into a part at the workbench', '作業台へ部材を取りに行く': 'going to the workbench for a part',
  '作業台へ部材を置きに行く': 'taking a part to the workbench', '削った部材を小屋へ運んでいる': 'carrying a shaped part to the hut',
  '取りつけたところを見に、少し離れる': 'stepping back to look at what it fixed', '取りつけた部材を、少し離れて眺めている': 'looking at the fixed part from a little way off',
  '台風のあいだ、身を低くしてやりすごしている': 'keeping low until the typhoon passes', '土台の石を据えている': 'setting a foundation stone',
  '土台の石を桟橋へ運んでいる': 'carrying a foundation stone to the pier', '夜の島を歩いて地図を作っている': 'walking the island at night, making a map',
  '実を収穫している': 'harvesting the crop', '家の作業に向かっている': 'heading to work on the house', '家を建てている': 'building the house',
  '寝床へ向かっている': 'heading to bed', '小屋へ向かっている': 'heading for the hut', '小屋を建てている': 'building the hut', '屋根に重しをかけている': 'weighing down the roof',
  '息つぎに浮かんできた': 'come up for a breath', '手ぶらで浮かんでくる': 'coming up empty-handed', '手帖を見返している': 'looking back through its notebook',
  '手帖を閉じて、ひと休みしている': 'notebook closed, taking a rest', '拾った貝殻を、前足で回して眺めている': 'turning a shell in its paws, looking at it',
  '散歩している': 'out for a walk', '斧で若木を切っている': 'cutting a sapling with an axe', '日なたで充電している': 'charging in the sun', '日なたへ向かっている': 'heading into the sun',
  '星の位置を確かめている': 'checking where the stars are', '昼寝のできる静かな水面へ向かっている': 'heading for calm water to nap',
  '朝の集まりで話している': 'talking at the morning gathering', '朝の集まりへ向かっている': 'heading to the morning gathering', '林の木を切り倒している': 'felling a tree in the wood',
  '柱にする木を桟橋へ運んでいる': 'carrying a post to the pier', '桟橋に板を張っている': 'laying planks on the pier', '桟橋の場所へ向かう': 'heading for the pier site',
  '桟橋の場所を測っている': 'measuring the pier site', '桟橋の工事と潮を見守っている': 'watching the pier work and the tide', '桟橋の工事を見に行く': 'going to see the pier work',
  '桟橋の板を運んでいる': 'carrying a plank for the pier', '棚で芯をよりに行く': 'going to the shelf to twist a wick', '棚へ道具を作りに向かっている': 'heading to the shelf to make a tool',
  '次に空を眺める場所を確かめている': 'checking where to watch the sky next', '気になる場所へ歩いている': 'walking to a place it wonders about',
  '水面で転がりながら毛づくろいしている': 'rolling at the surface, grooming', '沖で仰向けに浮かんでいる': 'floating on its back offshore', '泳ぎながら柱を立てている': 'swimming, raising a post',
  '流木を作業台へ運んでいる': 'carrying driftwood to the workbench', '流木を拾いに行く': 'going to pick up driftwood', '流木を拾い上げている': 'picking up driftwood',
  '流木を拾っている': 'picking up driftwood', '流木を探しに浜へ': 'off to the beach for driftwood', '流木を運んでいる': 'carrying driftwood',
  '浜から水平線を見渡し、見える島を地図に記している': 'looking over the horizon from the beach, mapping the islands in sight', '浜で海を観察している': 'watching the sea from the beach',
  '浜で甲羅干しをしている': 'basking on the beach', '浜で見慣れないものを見つけて近づいていく': 'found something strange on the beach, going closer',
  '浜で貝殻を拾っている': 'picking up shells on the beach', '浜に石を置いている': 'putting a stone on the beach', '海の底で、前足で岩の下を探っている': 'on the sea floor, feeling under the rocks',
  '海の底で海草を食べている': 'eating seagrass on the sea floor', '海の底で石を拾っている': 'picking up a stone on the sea floor', '海の底の岩かげで眠っている': 'asleep under a rock on the sea floor',
  '海の見える場所へ向かっている': 'heading for a view of the sea', '海を眺めている': 'looking at the sea', '海を観察する浜へ向かっている': 'heading for the beach to watch the sea',
  '海草の原へ泳いでいく': 'swimming to the seagrass meadow', '灯皿の芯をよっている': 'twisting a wick for the lamp dish', '焚き火へ向かっている': 'heading for the fire',
  '焚き火を囲んで話している': 'talking round the fire', '焼いた器を取りに向かっている': 'going for a fired vessel', '焼いた器を鍋にしている': 'making a fired vessel into a pot',
  '獲物をかかえて浮かんでいる': 'floating, holding its catch', '甲羅干しの浜へ向かう': 'heading for the basking beach', '畑へ収穫に行く': 'going to the field to harvest',
  '畑へ向かう': 'heading for the field', '畑へ種をまきに行く': 'going to the field to sow', '眠っている': 'asleep', '眠りの合間に息つぎに浮かんできた': 'up for a breath between sleeps',
  '眠る場所へ泳いでいく': 'swimming to its sleeping place', '石を拾いに潜りに行く': 'diving for a stone', '石を拾い上げている': 'picking up a stone',
  '石を浜の石置き場へ運んでいる': 'carrying a stone to the pile on the beach', '石を石垣へ運んでいる': 'carrying a stone to the wall', '石を石積みへ運んでいる': 'carrying a stone to the stone pile',
  '石を積み上げている': 'piling up stones', '石垣を積んでいる': 'building the stone wall', '石積みの石を拾いに行く': 'going for a stone for the pile',
  '石置き場で石を取っている': 'taking a stone from the pile', '石置き場へ石を取りに行く': 'going to the pile for a stone', '種をまいている': 'sowing seeds',
  '筏で出る支度をしている': 'getting ready to set off by raft', '粘土の池を掘っている': 'digging the clay pit', '縄をなっている': 'twisting rope', '若木のところへ向かう': 'heading for a sapling',
  '茅にする草を刈っている': 'cutting grass for thatch', '草を刈りに向かっている': 'going to cut grass', '薪を1つの山にまとめている': 'gathering the firewood into one stack',
  '薪をまとめに向かっている': 'going to stack the firewood', '行く手がふさがっていて、回り道を探している': 'the way is blocked; looking for a way round',
  '見つけたものを小屋の棚へ運んでいる': "carrying a find to the hut's shelf", '見つけたものを拾い上げて調べている': 'picking up a find to look at it',
  '見つけたものを棚に飾っている': 'setting a find on the shelf', '見つけた貝殻を見せにいく': 'going to show a shell it found', '観察した空を手帖に描いている': 'drawing the sky it watched in its notebook',
  '誰かに気づいて近づいていく': 'noticed someone, going over', '貝を割る場所へ向かっている': 'heading for a place to crack clams', '貝殻を拾いに行く': 'going to pick up shells',
  '貝殻を拾い上げている': 'picking up a shell', '貝殻を浜に並べている': 'laying shells out on the beach', '貝殻を運んでいる': 'carrying shells',
  '近くの友だちに星の手帖を見せている': 'showing its star notebook to a friend nearby', '道具を作っている': 'making a tool', '部材を作業台の脇に置いている': 'putting a part by the workbench',
  '部材を小屋に取りつけている': 'fixing a part to the hut', '部材を手に取っている': 'taking a part in hand', '部材を筏に組んでいる': 'lashing a part to the raft',
  '鍬で畑を耕している': 'hoeing the field', '雨風をよけに屋根の下へ': 'under the roof, out of the wind and rain', '静かな水面へ': 'to calm water', '静かな水面へ向かっている': 'heading for calm water',
  '頭から潜っていく': 'diving head first', '頼みを引き受けている': 'agreeing to a request', '頼みを断っている': 'turning down a request', '餌場へ泳いでいく': 'swimming to its feeding ground',
  '手ぶら': 'empty-handed',
};
// (sentences the world makes with a name, a catch or a place in them)
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+)と話している$/, (m) => `talking with ${name(m[1])}`],
  [/^通りかかった(.+)を、目で追っている$/, (m) => `watching ${name(m[1])} go by`],
  [/^(.+)のところへ頼みに行く$/, (m) => `going to ask ${name(m[1])} something`],
  [/^(.+)に流木を届けに行く$/, (m) => `taking driftwood to ${name(m[1])}`],
  [/^(.+)に知らせに行く$/, (m) => `going to tell ${name(m[1])}`],
  [/^(.+)に頼みごとをしている$/, (m) => `asking ${name(m[1])} a favour`],
  [/^(.+)に流木を手渡している$/, (m) => `handing driftwood to ${name(m[1])}`],
  [/^(.+)に流木の場所を教えている$/, (m) => `telling ${name(m[1])} where the driftwood is`],
  [/^拾った貝殻を(.+)に見せている$/, (m) => `showing a shell to ${name(m[1])}`],
  [/^(.+)をかかえて浮かんでくる$/, (m) => `coming up holding ${PREY_EN[m[1]] ?? 'its catch'}`],
  [/^仰向けに浮かんで、(.+)を食べている$/, (m) => `floating on its back, eating ${PREY_EN[m[1]] ?? 'its catch'}`],
  [/^(.+)を写真に撮っている$/, () => 'taking a photograph'],
  [/^筏で(.*)へ渡っている$/, (m) => m[1] ? `crossing by raft to ${m[1]}` : 'crossing by raft'],
];
const ASIDES: Record<string, string> = { 島にはいない: 'away from the island', おなかがすいている: 'hungry', ねむそう: 'sleepy' };

/** The status line in English: null when the table has no sentence for it (the caller shows a plain "busy"). */
export function statusEn(ja: string): string | null {
  let core = ja.trim(), tail = '';
  for (let m; (m = /（([^）]*)）$/.exec(core));) {   // (the asides in words at its end: away, hungry, sleepy)
    const a = ASIDES[m[1]]; if (!a) break;
    tail = ` (${a})` + tail; core = core.slice(0, m.index).trim();
  }
  const exact = EXACT[core]; if (exact) return exact + tail;
  for (const [re, f] of PATTERNS) { const m = core.match(re); if (m) return f(m) + tail; }
  return null;
}
export const BUSY_EN = 'busy at something';

// The first-time card: the world's grade (world/milestones.ts) is the key; the English is said by it and the one whose
// event it was. A crossing's key carries the island's word.
const FIRSTS: Record<string, (who: string) => string> = {
  light: (w) => `${w} lit a lamp for the first time on the island`,
  'weather-pot': (w) => `${w} made the weather pot`, retort: (w) => `${w} made the retort`, 'cook-pot': (w) => `${w} made the island's cooking pot`,
  raft: (w) => `${w} finished the raft`, sighting: (w) => `${w} sighted an island on the horizon`, pier: (w) => `${w} finished the pier`,
  'house-roof': (w) => `${w} thatched the house roof`, 'house-walls': (w) => `${w} finished the house's clay walls`, house: (w) => `${w} finished the house`,
  wall: (w) => `${w} finished the house's stone wall`, 'rakko-bed': () => "Rakko's resting place is finished", 'clay-pit': (w) => `${w} dug the clay pit`,
  fibre: (w) => `${w} beat a coconut husk into fibre`, rope: (w) => `${w} plied three strands into a rope`, hang: (w) => `${w} hung a pot by a rope under the eaves`,
  lash: (w) => `${w} lashed the raft with rope`, 'cord-break': () => 'A rope broke',
  sail: (w) => `${w} wove the sail's mat`, mast: (w) => `${w} cut a bamboo mast`, rig: (w) => `${w} rigged the raft with sail and mast`,
  'sail-crossing': (w) => `${w} crossed under sail`,
};
/** The card's sentence in English for a first, or null for one the table does not have. */
export function firstEn(key: string, who: string): string | null {
  const w = name(who);
  if (key.startsWith('crossing:')) return `${w} crossed by raft to ${key.slice('crossing:'.length)} and back`;
  return FIRSTS[key]?.(w) ?? null;
}
export const FIRST_KEYS = Object.keys(FIRSTS);
