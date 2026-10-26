// The live screen in English (?live&lang=en; viewer design v2 §5, L5): the world's own Japanese words for what a
// resident is doing, and its firsts, put into English just before they are drawn — a pure table on the screen's side.
// The world and the residents' minds are not asked anything and are given nothing: the same sentences, read, and turned.
// Only what the live screen shows is here (the status line, the first-time card, the set phrases); a status the table
// does not know is not shown at all (the name alone) rather than in Japanese or guessed. scripts/live-en-check.ts keeps the table whole: every
// sentence the world's status can make has its English.

export const NAMES_EN: Record<string, string> = { ドット: 'Dot', ラッコ: 'Rakko', カメマル: 'Kamemaru', ランタン: 'Lantern', 仲間: 'a friend' };
const PREY_EN: Record<string, string> = { ウニ: 'a sea urchin', カニ: 'a crab', 貝: 'a clam' };
const VESSEL_EN: Record<string, string> = { 鍋: 'a cooking pot', 灯皿: 'a lamp dish', 蒸留の壺: 'a still', 天気の壺: 'a weather pot' };
const name = (ja: string) => NAMES_EN[ja] ?? ja;   // (an island word for a place stays as it is: it is a name)

/** The set phrases of the screen. */
export const FIXED_EN = {
  brand: 'Lumau',   // (the series' name, D23: Series 1 · Lumau; "Dot's Island" is not used in English)
  ai: 'The residents are AI · filmed automatically',
  first: 'A first on the island',
  date: (y: number, m: number, d: number) => `Island year ${y} · ${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]}`,
};

const EXACT: Record<string, string> = {
  'お腹の上で貝を割っている': 'cracking a clam on its belly', 'お腹の上の石で貝を割って食べている': 'cracking clams on a stone on its belly, and eating',
  'となりの浜のほうへ散歩している': 'strolling towards the next beach', 'どうするか考えている': 'thinking what to do', 'ひと休みしている': 'taking a rest',
  'ヤシの実を棚へ運んでいる': 'carrying a coconut to the shelf', 'ヤシの実を棚に置いている': 'putting a coconut on the shelf',
  '雨受けを作りに棚へ向かっている': 'going to the shelf to make a rain catcher', '竹と葉で雨受けを作っている': 'making a rain catcher of bamboo and leaves',
  '筏を引き上げに浜へ向かっている': 'going to the beach to haul up the raft', '台風に備えて、筏を浜の上へ引き上げている': 'hauling the raft up the beach before the typhoon',
  '流木を沈める場所へ運んでいる': 'carrying driftwood out to sink it', '流木を海に沈めて、漁礁をつくっている': 'sinking driftwood to make a reef',
  '荒れた藻場を植え直しに向かっている': 'going to replant the worn seagrass', '荒れた藻場を植え直している': 'replanting the worn seagrass',
  '体を温められる水面へ向かっている': 'heading for water to warm up in', '冷えた体を、水面で毛づくろいして温めている': 'grooming on the surface to warm up',
  '冷えて、体を震わせている': 'cold and shivering', '波に揺られて、うとうとしている': 'dozing on the swell', 'うとうとしている': 'dozing',
  '歩いている': 'walking', '泳いでいる': 'swimming',
  '畑へ早めの収穫に行く': 'going to the field to harvest early', '台風の前に、畑の実を早めに収穫している': 'harvesting early before the typhoon',
  'ヤシの殻を叩きに作業場へ向かっている': 'going to beat coconut husks', 'ヤシの殻を叩いて、繊維をほぐしている': 'beating husks to loosen the fibre',
  'やりかけの殻の仕事を片付けに行く': 'going to clear the husk work', 'やりかけの殻の仕事を片付けている': 'clearing the husk work',
  '縄仕事の場所へ向かっている': 'going to the rope-making place', 'ヤシの繊維を振るって髄を落としている': 'shaking the pith out of the fibre',
  'ヤシの繊維を撚って糸にしている': 'twisting fibre into yarn', '撚り糸を三本合わせて縄にしている': 'laying three yarns into rope', 'ヤシの繊維で縄仕事をしている': 'making rope from coconut fibre',
  'やりかけの縄仕事を片付けに行く': 'going to clear the rope work', 'やりかけの縄仕事を片付けている': 'clearing the rope work',
  '筏を縄で縛りに浜へ向かっている': 'going to the beach to lash the raft', '筏を縄で縛っている': 'lashing the raft with rope',
  'タコノキの葉を採りに向かっている': 'going to cut pandanus leaves', '帆の仕事の場所へ向かっている': 'going to the sail-making place', 'タコノキの葉を採っている': 'cutting pandanus leaves',
  'タコノキの葉を裂いている': 'splitting pandanus leaves', 'タコノキの葉で帆を編んでいる': 'weaving a sail from pandanus leaves', '竹で帆柱を作っている': 'making a bamboo mast', '帆の仕事をしている': 'working on the sail',
  '帆を張りに筏へ向かっている': 'going to the raft to rig the sail', '筏に帆柱と帆を取りつけている': 'rigging mast and sail on the raft',
  'やりかけの帆の仕事を片付けに行く': 'going to clear the sail work', 'やりかけの帆の仕事を片付けている': 'clearing the sail work',
  'ひと休みできる場所へ向かっている': 'heading for a place to rest', 'カメマルの岩棚のまわりに石を置いている': "setting stones round Kamemaru's ledge",
  'カメマルの岩棚へ石を運んでいる': "carrying a stone to Kamemaru's ledge", 'ラグーンを泳いで記録している': 'swimming the lagoon and keeping a record',
  '丘で次に気になることを考えている': 'on the hill, thinking what to look at next', '丘のふもとで夜を待っている': 'waiting for night at the foot of the hill',
  '丘のふもとへ向かっている': 'heading for the foot of the hill', '丘の上で星を見て考えごとをしている': 'on the hilltop, watching the stars and thinking',
  '丘の上へ歩いている': 'walking up the hill', '仰向けで波に揺られて眠っている': 'asleep on its back, rocked by the waves', '仰向けに浮いたまま昼寝している': 'napping, floating on its back',
  '休み場に石を運んでいる': 'carrying a stone to the resting place', '休み場の囲いに石を積んでいる': 'piling stones round the resting place',
  '作業台で流木を部材に削っている': 'shaping driftwood into a part at the workbench', '作業台へ部材を取りに行く': 'going to the workbench for a part',
  '作業台へ部材を置きに行く': 'taking a part to the workbench', '削った部材を小屋へ運んでいる': 'carrying a shaped part to the hut',
  '取りつけたところを見に、少し離れる': 'stepping back to look at what it fitted', '取りつけた部材を、少し離れて眺めている': 'looking at the fitted part from a little way off',
  '台風のあいだ、身を低くしてやりすごしている': 'keeping low until the typhoon passes', '土台の石を据えている': 'setting a foundation stone',
  '土台の石を桟橋へ運んでいる': 'carrying a foundation stone to the pier', '夜の島を歩いて地図を作っている': 'walking the island at night, making a map',
  '実を収穫している': 'harvesting the crop', '家の作業に向かっている': 'heading to work on the house', '家を建てている': 'building the house',
  '寝床へ向かっている': 'heading to bed', '小屋へ向かっている': 'heading for the hut', '小屋を建てている': 'building the hut', '屋根に重しをかけている': 'weighing down the roof',
  '息つぎに浮かんできた': 'coming up for a breath', '手ぶらで浮かんでくる': 'coming up empty-handed', '手帖を見返している': 'looking back through its notebook',
  '手帖を閉じて、ひと休みしている': 'notebook closed, taking a rest', '拾った貝殻を、前足で回して眺めている': 'turning a shell in its paws, looking at it',
  '散歩している': 'out for a walk', '斧で若木を切っている': 'cutting a sapling with an axe', '日なたで充電している': 'charging in the sun', '日なたへ向かっている': 'heading for a sunny spot',
  '星の位置を確かめている': 'checking where the stars are', '昼寝のできる静かな水面へ向かっている': 'heading for calm water to nap',
  '朝の集まりで話している': 'talking at the morning gathering', '朝の集まりへ向かっている': 'heading to the morning gathering', '林の木を切り倒している': 'felling a tree in the wood',
  '柱にする木を桟橋へ運んでいる': 'carrying a post to the pier', '桟橋に板を張っている': 'laying planks on the pier', '桟橋の場所へ向かう': 'heading for the pier site',
  '桟橋の場所を測っている': 'measuring the pier site', '桟橋の工事と潮を見守っている': 'watching the pier work and the tide', '桟橋の工事を見に行く': 'going to see the pier work',
  '桟橋の板を運んでいる': 'carrying a plank for the pier', '棚で芯をよりに行く': 'going to the shelf to twist a wick', '棚へ道具を作りに向かっている': 'heading to the shelf to make a tool',
  '次に空を眺める場所を確かめている': 'checking where to watch the sky next', '気になる場所へ歩いている': 'walking to a place that caught its interest',
  '水面で転がりながら毛づくろいしている': 'rolling at the surface, grooming', '沖で仰向けに浮かんでいる': 'floating on its back offshore', '泳ぎながら柱を立てている': 'swimming, raising a post',
  '流木を作業台へ運んでいる': 'carrying driftwood to the workbench', '流木を拾いに行く': 'going to pick up driftwood', '流木を拾い上げている': 'picking up driftwood',
  '流木を拾っている': 'picking up driftwood', '流木を探しに浜へ': 'off to the beach for driftwood', '流木を運んでいる': 'carrying driftwood',
  '浜から水平線を見渡し、見える島を地図に記している': 'scanning the horizon from the beach, mapping the islands in sight', '浜で海を観察している': 'watching the sea from the beach',
  '浜で甲羅干しをしている': 'basking on the beach', '浜で見慣れないものを見つけて近づいていく': 'going closer to something strange on the beach',
  '浜で貝殻を拾っている': 'picking up shells on the beach', '浜に石を置いている': 'putting a stone on the beach', '海の底で、前足で岩の下を探っている': 'on the sea floor, feeling under the rocks',
  '海の底で海草を食べている': 'eating seagrass on the sea floor', '海の底で石を拾っている': 'picking up a stone on the sea floor', '海の底の岩かげで眠っている': 'asleep under a rock on the sea floor',
  '海の見える場所へ向かっている': 'heading for a view of the sea', '海を眺めている': 'looking at the sea', '海を観察する浜へ向かっている': 'heading for the beach to watch the sea',
  '海草の原へ泳いでいく': 'swimming to the seagrass meadow', '灯皿の芯をよっている': 'twisting a wick for the lamp dish', '焚き火へ向かっている': 'heading for the fire',
  '焚き火を囲んで話している': 'talking round the fire', '焼いた器を取りに向かっている': 'going for a fired vessel', '焼いた器を鍋にしている': 'turning a fired vessel into a cooking pot',
  '獲物をかかえて浮かんでいる': 'floating, holding its catch', '甲羅干しの浜へ向かう': 'heading for the basking beach', '畑へ収穫に行く': 'going to the field to harvest',
  '畑へ向かう': 'heading for the field', '畑へ種をまきに行く': 'going to the field to sow', '眠っている': 'asleep', '眠りの合間に息つぎに浮かんできた': 'up for a breath between sleeps',
  '眠る場所へ泳いでいく': 'swimming to its sleeping place', '石を拾いに潜りに行く': 'diving for a stone', '石を拾い上げている': 'picking up a stone',
  '石を浜の石置き場へ運んでいる': 'carrying a stone to the pile on the beach', '石を石垣へ運んでいる': 'carrying a stone to the wall', '石を石積みへ運んでいる': 'carrying a stone to the cairn',
  '石を積み上げている': 'piling up stones', '石垣を積んでいる': 'building the stone wall', '石積みの石を拾いに行く': 'going for a stone for the cairn',
  '石置き場で石を取っている': 'taking a stone from the pile', '石置き場へ石を取りに行く': 'going to the pile for a stone', '種をまいている': 'sowing seeds',
  '筏で出る支度をしている': 'getting ready to set off by raft', '粘土の池を掘っている': 'digging the clay pit', '縄をなっている': 'twisting rope', '若木のところへ向かう': 'heading for a sapling',
  '茅にする草を刈っている': 'cutting grass for thatch', '草を刈りに向かっている': 'going to cut grass', '薪を1つの山にまとめている': 'gathering the firewood into one stack',
  '薪をまとめに向かっている': 'going to stack the firewood', '行く手がふさがっていて、回り道を探している': 'way blocked, looking for a way round',
  '見つけたものを小屋の棚へ運んでいる': "carrying a find to the hut's shelf", '見つけたものを拾い上げて調べている': 'picking up a find to look at it',
  '見つけたものを棚に飾っている': 'setting a find on the shelf', '見つけた貝殻を見せにいく': 'going to show a shell it found', '観察した空を手帖に描いている': 'drawing the sky in its notebook',
  '誰かに気づいて近づいていく': 'going over to someone it noticed', '貝を割る場所へ向かっている': 'heading for a place to crack clams', '貝殻を拾いに行く': 'going to pick up shells',
  '貝殻を拾い上げている': 'picking up a shell', '貝殻を浜に並べている': 'laying shells out on the beach', '貝殻を運んでいる': 'carrying shells',
  '近くの友だちに星の手帖を見せている': 'showing its star notebook to a friend nearby', '道具を作っている': 'making a tool', '部材を作業台の脇に置いている': 'putting a part by the workbench',
  '部材を小屋に取りつけている': 'fitting a part to the hut', '部材を手に取っている': 'taking a part in hand', '部材を筏に組んでいる': 'lashing a part to the raft',
  '鍬で畑を耕している': 'hoeing the field', '雨風をよけに屋根の下へ': 'under the roof, out of the wind and rain', '静かな水面へ': 'off to calm water', '静かな水面へ向かっている': 'heading for calm water',
  '頭から潜っていく': 'diving head first', '頼みを引き受けている': 'agreeing to a request', '頼みを断っている': 'turning down a request', '餌場へ泳いでいく': 'swimming to its feeding ground',
  '手ぶら': 'empty-handed',
  // (VOICE.md §2・§9, rehearsal finding R-017)
  '星の並びを、手帖に記している': 'noting the stars in its notebook', '見た星の並びを、図に描き直している': 'redrawing the stars it saw as a chart', '電池を休ませている': 'resting its battery',
  '手帖を閉じて、じっとしている': 'notebook closed, keeping still', '仕上げた星の図を、仲間に見せている': 'showing a friend its finished star chart', '星を見る場所へ歩いている': 'walking out to watch the stars',
  '次に空を眺める場所へ歩いている': 'walking to where it will watch the sky next', '餌場へ泳いでいる': 'swimming to its feeding ground', '海草を食べに、藻場へ泳いでいる': 'swimming to the seagrass to eat',
  '甲羅干しの浜へ向かっている': 'heading for the basking beach', '桟橋の場所へ向かっている': 'heading for the pier site', '桟橋の工事を見に行っている': 'going to see the pier work',
  '浜の見慣れないものを、調べに行っている': 'going to look at something strange on the beach', '若木のところへ向かっている': 'heading for a sapling', '畑へ向かっている': 'heading for the field',
  '畑へ種をまきに行っている': 'going to the field to sow', '畑へ収穫に行っている': 'going to the field to harvest', '小屋の部材にする流木を拾いに行っている': 'going for driftwood to make a part for the hut',
  'ドットに渡す流木を、拾いに行っている': 'going for driftwood to give Dot', '流木を拾いに行っている': 'going to pick up driftwood', '貝殻を拾いに行っている': 'going to pick up shells',
  '油をとるヤシの実を、拾いに行っている': 'going for a coconut to press for oil', '石を拾いに行っている': 'going for a stone', '見つけた貝殻を見せに行っている': 'going to show a shell it found',
  '水平線の見える浜へ向かっている': 'heading for a beach with a view of the horizon', '部材を筏へ運んでいる': 'carrying a part to the raft', '筏へ向かっている': 'heading for the raft',
  '棚へ向かっている': 'heading for the shelf', '雨風をよけに、屋根の下へ向かっている': 'heading under the roof, out of the wind and rain', '小屋に部材を取りつけている': 'fitting a part to the hut',
  'おなかがすいて、岩場に潜っている': 'hungry, diving among the rocks', 'おなかがすいて、藻場で海草を食べている': 'hungry, eating seagrass in the meadow', '眠気がさして、浜で体を休めている': 'sleepy, resting on the beach',
  '傷みがひどく、屋根の下で乾かしている': 'badly worn, drying out under the roof', '濡れた体を、屋根の下で乾かしている': 'drying off under the roof', '台風のあいだ、身を低くしている': 'keeping low through the typhoon',
  '台風がすぎるまで、屋根の下で待っている': 'waiting under the roof for the typhoon to pass', '水平線の島を、地図に記している': 'mapping the islands on the horizon', '海を渡る筏に、部材を組んでいる': 'fitting a part to the raft for the crossing',
  '桟橋を建てる場所を、測っている': 'measuring where the pier will go', '桟橋の土台石を、据えている': 'setting a foundation stone for the pier', '泳ぎながら、桟橋の柱を立てている': 'swimming, raising a pier post',
  '見慣れないものを、拾って調べている': 'picking up something strange to look at it', '浜で見つけたものを、棚に飾っている': 'setting a find from the beach on the shelf', '朝の集まりで、今日の仕事を話している': "telling the morning gathering of the day's work",
  '並べる貝殻を、浜で拾っている': 'picking up shells on the beach to lay out', 'ヤシの実を拾い上げている': 'picking up a coconut', '桟橋の板に、流木を削っている': 'shaping driftwood into a pier plank',
  '小屋の部材に、流木を削っている': 'shaping driftwood into a part for the hut', '拾った貝殻を、浜の山に並べている': 'adding a shell to the pile on the beach', '行く手がふさがり、回り道を探している': 'way blocked, looking for a way round',
  '畑へ早めの収穫に行っている': 'going to the field to harvest early', 'やりかけの殻の仕事を片付けに行っている': 'going to clear the husk work', 'ヤシの殻を、潮だまりへ運んでいる': 'carrying coconut husks to the tide pool',
  '殻を引き上げに、潮だまりへ向かっている': 'heading to the tide pool to take out the husks', '縄をなう場所へ向かっている': 'going to the rope-making place', 'やりかけの縄仕事を片付けに行っている': 'going to clear the rope work',
  '繊維を干しに、軒下へ向かっている': 'going to hang fibre under the eaves', '繊維を取り込みに、軒下へ向かっている': 'going to take in the fibre from the eaves', '鍋を吊るしに、軒下へ向かっている': 'going to hang a pot under the eaves',
  '吊るした鍋を下ろしに向かっている': 'going to take down the hanging pot', 'アダンの葉を採りに向かっている': 'going to cut pandanus leaves', '帆を作る場所へ向かっている': 'going to the sail-making place',
  'やりかけの帆の仕事を片付けに行っている': 'going to clear the sail work', '葉を干しに、軒下へ向かっている': 'going to dry leaves under the eaves', '葉を取り込みに、軒下へ向かっている': 'going to take in the leaves from the eaves',
  '眠る場所へ泳いでいる': 'swimming to its sleeping place', '浜へ向かっている': 'heading for the beach', '家を建てに向かっている': 'heading off to build the house',
  '棚で芯をよりに行っている': 'going to the shelf to twist a wick', '作業台へ部材を置きに行っている': 'taking a part to the workbench', '作業台へ部材を取りに行っている': 'going to the workbench for a part',
  '石を拾いに潜りに行っている': 'diving for a stone', '石置き場へ石を取りに行っている': 'going to the pile for a stone', '屋根に重しをかけに向かっている': 'going to weigh down the roof',
  '仲間のいるほうへ歩いている': 'walking towards a friend', '浜のほうへ歩いている': 'walking towards the beach', '近くを歩いている': 'walking nearby',
  '仲間に気づいて、近づいている': 'going over to a friend it noticed', '油をとるヤシの実を、棚に置いている': 'putting a coconut for oil on the shelf', '雨水をためる雨受けを、作っている': 'making a rain catcher to collect water',
  '台風にそなえて、筏を引き上げている': 'hauling up the raft before the typhoon', 'ラッコの漁礁に、流木を沈めている': "sinking driftwood for Rakko's reef", 'カメマルの藻場を、植え直している': "replanting Kamemaru's seagrass",
  '冷えた体を、毛づくろいで温めている': 'grooming to warm up', '眠気に負けて、波の上でうとうとしている': 'too sleepy, dozing on the swell', '眠気に負けて、うとうとしている': 'too sleepy, dozing',
  '縄にする繊維を、殻を叩いてとっている': 'beating husks for rope fibre', '打ちかけのヤシの殻を、片付けている': 'clearing away the half-beaten husks', 'ほぐすヤシの殻を、潮だまりに浸けている': 'soaking coconut husks in the tide pool',
  '浸けたヤシの殻を、引き上げている': 'taking the soaked husks out', 'ヤシの繊維で縄をなっている': 'making rope from coconut fibre', '海を渡る筏を、縄で縛っている': 'lashing the raft for the crossing',
  '縄にする繊維を、軒下に干している': 'hanging fibre for rope under the eaves', '乾いた繊維を、軒下から取り込んでいる': 'taking in the dry fibre from the eaves', '縄で、鍋を軒下に吊るしている': 'hanging a pot under the eaves by a rope',
  '吊るした鍋を、下ろしている': 'taking down the hanging pot', '帆にするアダンの葉を、刈っている': 'cutting pandanus leaves for the sail', 'アダンの葉を裂いている': 'splitting pandanus leaves',
  'アダンの葉で帆を編んでいる': 'weaving a sail from pandanus leaves', '帆を作っている': 'making the sail', '海を渡る筏に、帆を張っている': 'rigging the sail on the raft for the crossing',
  '帆にする葉を、軒下に干している': 'drying leaves for the sail under the eaves', '乾いた葉を、取り込んでいる': 'taking in the dry leaves', '夜にそなえて、昼のあいだ眠っている': 'sleeping through the day, ready for the night',
  'じっとして、電池を保っている': 'keeping still to save its battery', '電池が減って、日なたで充電している': 'battery low, charging in the sun', '流木を探しに浜へ向かっている': 'heading to the beach for driftwood',
  '台風で飛んだ茅を、葺き直している': 'rethatching what the typhoon blew off', '丸太をとりに、林の木を切り倒している': 'felling a tree in the wood for logs', '野焼きの薪を、ひと山にまとめている': 'stacking firewood for the firing',
  '明かりを灯す芯を、よっている': 'twisting a wick for a light', 'あとで使う部材を、作業台に置いている': 'setting a part by the workbench for later', '家に使う部材を、作業台から取っている': 'taking a part from the workbench for the house',
  '荒れた日にそなえて、囲いに石を積んでいる': 'piling stones round its shelter for rough days', '岩棚に、うねりよけの石を置いている': 'setting stones by the ledge against the swell', 'ドットの石垣の石を、浜に運んでいる': "carrying stones to the beach for Dot's wall",
  '石垣にする石を、石置き場で取っている': 'taking a stone for the wall from the pile', '茅を守る石垣を、積んでいる': 'building the wall that guards the thatch', '粘土を浸す池を、掘っている': 'digging a pit to soak clay',
  '家に使う縄を、なっている': 'twisting rope for the house', '屋根の茅にする草を、刈っている': 'cutting grass to thatch the roof', '台風にそなえて、屋根に重しをかけている': 'weighing down the roof before the typhoon',
  '浜で、あたりを見ている': 'on the beach, looking about', '浜の近くで、あたりを見ている': 'near the beach, looking about', '家の近くで、あたりを見ている': 'near home, looking about',
  '浜から、泳ぐ魚を見分けている': 'telling the fish apart from the beach', 'ラグーンを泳いで、魚を見分けている': 'swimming the lagoon, telling the fish apart', 'おなかがすきすぎて、浜で動けずにいる': 'too hungry to move, on the beach',
  '星が出るまで、丘のふもとで待っている': 'waiting at the foot of the hill for the stars', '丘の上で、星を見ている': 'on the hilltop, watching the stars', 'まだ歩いていない所を、地図にしている': "mapping places it hasn't walked yet",
  '眠くなって、波の上で眠っている': 'sleepy, asleep on the waves', '波の上で、昼寝している': 'napping on the waves', '仲間の近くで、立ち止まっている': 'stopped near a friend',
};
// (sentences the world makes with a name, a catch or a place in them)
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+)と話している$/, (m) => `talking with ${name(m[1])}`],
  [/^通りかかった(.+)を、目で追っている$/, (m) => `watching ${name(m[1])} go by`],
  [/^(.+)のところへ頼みに行く$/, (m) => `going to ask ${name(m[1])} something`],
  [/^(.+)に流木を届けに行く$/, (m) => `taking driftwood to ${name(m[1])}`],
  [/^(.+)に知らせに行く$/, (m) => `going to tell ${name(m[1])}`],
  [/^(.+)に伝えに行く$/, (m) => `going to tell ${name(m[1])} something`],
  [/^(.+)に伝えている$/, (m) => `telling ${name(m[1])} something`],
  [/^(.+)に頼みごとをしている$/, (m) => `asking ${name(m[1])} a favour`],
  [/^(.+)に流木を手渡している$/, (m) => `handing driftwood to ${name(m[1])}`],
  [/^(.+)に流木の場所を教えている$/, (m) => `telling ${name(m[1])} where the driftwood is`],
  [/^拾った貝殻を(.+)に見せている$/, (m) => `showing a shell to ${name(m[1])}`],
  [/^(.+)をかかえて浮かんでくる$/, (m) => `coming up holding ${PREY_EN[m[1]] ?? 'its catch'}`],
  [/^仰向けに浮かんで、(.+)を食べている$/, (m) => `floating on its back, eating ${PREY_EN[m[1]] ?? 'its catch'}`],
  [/^(.+)を写真に撮っている$/, () => 'taking a photograph'],
  [/^筏で(.*)へ渡っている$/, (m) => m[1] ? `crossing by raft to ${m[1]}` : 'crossing by raft'],
  [/^(.+)に、流木を頼みに行っている$/, (m) => `going to ask ${name(m[1])} for driftwood`],
  [/^(.+)に流木を届けに行っている$/, (m) => `taking driftwood to ${name(m[1])}`],
  [/^(.+)に知らせに行っている$/, (m) => `going to tell ${name(m[1])}`],
  [/^(.+)に伝えに行っている$/, (m) => `going to tell ${name(m[1])} something`],
  [/^(.+)に、流木を頼んでいる$/, (m) => `asking ${name(m[1])} for driftwood`],
  [/^頼まれた流木を、(.+)に届けている$/, (m) => `bringing ${name(m[1])} the driftwood it asked for`],
  [/^(.+)に、流木のある場所を教えている$/, (m) => `telling ${name(m[1])} where there is driftwood`],
  [/^(.+)の頼みを、引き受けている$/, (m) => `agreeing to ${name(m[1])}'s request`],
  [/^星を見に、(.+)へ歩いている$/, () => 'walking out to watch the stars'],
  [/^焼いた器を、(.+)にしている$/, (m) => `turning a fired vessel into ${VESSEL_EN[m[1]] ?? 'a vessel'}`],
  [/^(.+)を、写真に残している$/, () => 'taking a photograph'],
  [/^(.+)を、そばで見守っている$/, () => 'keeping watch over the work on the shelf'],
];
const ASIDES: Record<string, string> = { 島にはいない: 'away from the island', おなかがすいている: 'hungry', ねむそう: 'sleepy' };

/** The status line in English: null when the table has no sentence for it (the caller shows the name alone). */
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
/** As the line is shown: its first letter a capital (a line on the screen is read as a heading); the table keeps lower case. */
export const asLine = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// The first-time card: the world's grade (world/milestones.ts) is the key; the English is said by it and the one whose
// event it was. A crossing's key carries the island's word.
const FIRSTS: Record<string, (who: string) => string> = {
  light: (w) => `${w} lit the island's first lamp`,
  'weather-pot': (w) => `${w} made the weather pot`, retort: (w) => `${w} built the retort for charcoal and tar`, 'cook-pot': (w) => `${w} made the island's cooking pot`,
  raft: (w) => `${w} finished the raft`, sighting: (w) => `${w} sighted an island on the horizon`, pier: (w) => `${w} finished the pier`,
  'house-roof': (w) => `${w} thatched the house roof`, 'house-walls': (w) => `${w} finished the house's clay walls`, house: (w) => `${w} finished the house`,
  wall: (w) => `${w} finished the house's stone wall`, 'rakko-bed': () => "Rakko's resting place is finished", 'clay-pit': (w) => `${w} dug the clay pit`,
  fibre: (w) => `${w} beat a coconut husk into fibre`, rope: (w) => `${w} plied three strands into a rope`, hang: (w) => `${w} hung a pot by a rope under the eaves`,
  lash: (w) => `${w} lashed the raft with rope`, 'cord-break': () => 'A rope broke',
  sail: (w) => `${w} wove the sail's mat`, mast: (w) => `${w} cut a bamboo mast`, rig: (w) => `${w} rigged the raft with sail and mast`,
  'sail-crossing': (w) => `${w} crossed under sail`,
};
/** The card's sentence in English for a first, or null for one the table does not have. With `html`, an island's own
 *  word for a place is set in italics (a foreign word in an English sentence) and the rest escaped; otherwise plain. */
export function firstEn(key: string, who: string, html = false): string | null {
  const w = name(who), esc = (t: string) => (html ? t.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;')) : t);
  if (key.startsWith('crossing:')) { const place = esc(key.slice('crossing:'.length)); return `${esc(w)} crossed by raft to ${html ? `<i>${place}</i>` : place} and back`; }
  const t = FIRSTS[key]?.(w); return t ? esc(t) : null;
}
export const FIRST_KEYS = Object.keys(FIRSTS);
