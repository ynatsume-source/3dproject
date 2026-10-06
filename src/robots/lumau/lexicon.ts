// Lumau's vocabulary (ADR 0006: the island's own language), at about the level of the English taught in Japanese
// schools: some 1,200 words, made by rules rather than one by one.
//
// - Sounds as before: the vowels a i u e o, alone or after one of p t k m n s h l w (no 'wu'). Words are runs of
//   those syllables.
// - The words the island already says keep their form (LEGACY). The small words of grammar are set by hand (GRAMMAR):
//   short, and none of them is a word of its own anywhere else.
// - Every other root gets a form made from its id (the same id always gives the same word): two syllables for the
//   words of every day, three for the rest. New words never begin with 'ha': that is kept for the question words
//   (a few older words — hata, hane, and the digit ha — were there first and stay).
// - Derived words are made from roots by fixed endings (DERIVE): the one who does it, the thing to do it with, the
//   place for it, a small or young one. They count as words of the language, as 'teacher' does in English.
// - No word for a feeling the island does not show (owner's decision, 2026-10-05). The states the world counts —
//   hunger, sleepiness, battery, hits, trust — are words; lonely, glad, sad are not.

export type Cat = 'person' | 'question' | 'grammar' | 'amount' | 'time' | 'place' | 'nature' | 'weather' | 'life' | 'plant' | 'body' | 'action' | 'thing' | 'quality' | 'custom' | 'science' | 'unit' | 'number';
export interface Entry { id: string; ja: string; cat: Cat; form: string; tier: 'legacy' | 'grammar' | 'basic' | 'more' | 'derived'; from?: string }

/** The words the island says already: kept as they are. */
const LEGACY: [string, string, string, Cat][] = [
  ['lumau', 'lumau', 'ルマウ（波打ち際。この言葉の名前）', 'nature'],
  ['identify', 'ino', '識別する', 'action'], ['role', 'wake', '役割', 'custom'], ['report', 'nao', '報告する', 'action'], ['share', 'kesa', '共有する', 'action'],
  ['propose', 'teli', '提案する', 'action'], ['found', 'hoki', '見つける', 'action'], ['record', 'simo', '記録する', 'action'],
  ['dot', 'toto', 'ドット', 'person'], ['rakko', 'lako', 'ラッコ', 'person'], ['kame', 'kamemalu', 'カメマル', 'person'], ['lantern', 'lanta', 'ランタン', 'person'],
  ['hut', 'hata', '小屋', 'thing'], ['harvest', 'niko', '収穫', 'thing'], ['shell', 'pase', '貝殻', 'thing'], ['full', 'hula', 'おなか（満ちぐあい）', 'body'], ['sleepy', 'nemu', 'ねむけ', 'body'],
  ['battery', 'sali', '電池', 'body'], ['map', 'wela', '地図', 'thing'], ['cairn', 'tumo', '目印の石積み', 'thing'], ['wood', 'toli', '流木', 'thing'], ['stone', 'kumo', '石', 'nature'],
  ['fire', 'hi', '火', 'nature'], ['pier', 'lasipo', '桟橋', 'thing'], ['post', 'sita', '柱', 'thing'], ['plank', 'hane', '板', 'thing'], ['base', 'mota', '土台', 'thing'],
  ['place', 'tako', '場所', 'place'], ['beach', 'mau', '浜', 'nature'], ['island', 'nesi', '島', 'nature'], ['sea', 'lu', '海', 'nature'], ['star', 'tika', '星', 'nature'],
  ['book', 'kami', '手帖', 'thing'], ['night', 'nuki', '夜', 'time'], ['shelf', 'tana', '棚', 'thing'],
  ['coconut', 'kolu', 'ヤシの実', 'plant'], ['pumice', 'hupi', '軽石', 'nature'], ['bone', 'pone', '骨', 'life'], ['seabean', 'mama', 'モダマの種', 'plant'],
  ['build', 'motu', '作る・建てる', 'action'], ['gather', 'tule', '集める', 'action'], ['measure', 'semi', '測る', 'action'], ['swim', 'ana', '泳ぐ', 'action'],
  ['put', 'pila', '置く', 'action'], ['pick', 'tolu', '拾う', 'action'], ['compare', 'tasu', '比べる', 'action'],
  ['metre', 'meto', 'メートル', 'unit'], ['percent', 'pa', 'パーセント', 'unit'], ['next', 'neka', '次の', 'time'], ['same', 'hono', '同じ', 'quality'],
  ['agree', 'ua', '了承する・はい', 'grammar'], ['of', 'ne', '〜の（所有・分母）', 'grammar'], ['there', 'ka', 'ある・いる', 'grammar'], ['to', 'to', '〜へ', 'grammar'],
  ['from', 'ma', '〜から', 'grammar'], ['with', 'weko', '〜と（いっしょに）', 'grammar'], ['me', 'na', '僕・わたし', 'person'],
];
/** The digits (src/robots/islandlang.ts num): words of their own; tens 'temu', hundreds 'hiku'. */
export const DIGITS = ['so', 'pi', 'nu', 'sa', 'ke', 'lo', 'mu', 'ta', 'ha', 'wa'];

/** The small words of grammar, set by hand. */
const GRAMMAR: [string, string, string, Cat][] = [
  // particles (after the word they mark)
  ['topic', 'e', '〜は（主題）', 'grammar'], ['object', 'o', '〜を', 'grammar'], ['at', 'ni', '〜で・〜に（場所・時）', 'grammar'],
  ['by', 'pu', '〜で（道具・方法）', 'grammar'], ['than', 'ika', '〜より', 'grammar'], ['until', 'lami', '〜まで', 'grammar'],
  ['also', 'mi', '〜も', 'grammar'], ['only', 'hosi', '〜だけ', 'grammar'], ['plural', 'mo', '〜たち（複数）', 'grammar'], ['about', 'sipe', '〜について', 'grammar'],
  // after the verb
  ['past', 'kau', '〜した（過去）', 'grammar'], ['future', 'leni', '〜する（これから）', 'grammar'], ['ongoing', 'sumo', '〜している', 'grammar'],
  ['done', 'mase', 'もう〜した（完了）', 'grammar'], ['not', 'nole', '〜ない・いいえ', 'grammar'], ['can', 'pole', '〜できる', 'grammar'],
  ['must', 'kili', '〜しなければならない', 'grammar'], ['lets', 'walo', '〜しよう', 'grammar'], ['please', 'lai', '〜してほしい（頼み）', 'grammar'],
  ['question', 'ko', '〜か（質問）', 'grammar'], ['quote', 'tei', '〜と（言う・思う）', 'grammar'],
  // joining
  ['and', 'wi', '〜と〜（並べる）', 'grammar'], ['then', 'sole', 'そして・それから', 'grammar'], ['but', 'kemo', 'しかし', 'grammar'],
  ['so', 'leka', 'だから', 'grammar'], ['because', 'pasi', 'なぜなら・〜ので', 'grammar'], ['if', 'mepo', 'もし〜なら', 'grammar'],
  ['when', 'nalu', '〜とき', 'grammar'], ['or', 'oli', 'または', 'grammar'],
  // degree
  ['very', 'tete', 'とても', 'amount'], ['little', 'sesi', '少し', 'amount'], ['more', 'malo', 'もっと・より多く', 'amount'], ['most', 'meli', 'いちばん', 'amount'],
  // persons
  ['you', 'ki', 'あなた', 'person'], ['it', 'ho', '彼・それ', 'person'], ['we', 'nami', '私たち', 'person'], ['youall', 'kimi', 'あなたたち', 'person'],
  ['they', 'homi', '彼ら・それら', 'person'], ['self', 'pune', '自分', 'person'], ['everyone', 'mele', 'みんな', 'person'], ['someone', 'teke', 'だれか', 'person'],
  // pointing
  ['this', 'ili', 'これ・この', 'question'], ['that', 'ula', 'それ・その・あれ', 'question'], ['here', 'ilo', 'ここ', 'question'], ['yonder', 'ulo', 'そこ・あそこ', 'question'],
  // questions (all begin with ha)
  ['what', 'hani', '何', 'question'], ['who', 'hasu', 'だれ', 'question'], ['where', 'halo', 'どこ', 'question'], ['whenq', 'hamo', 'いつ', 'question'],
  ['why', 'hale', 'なぜ', 'question'], ['how', 'haso', 'どうやって', 'question'], ['howmany', 'haku', 'いくつ', 'question'], ['which', 'hate', 'どれ・どの', 'question'],
];

/** Roots: id ja, one per line; a leading '*' marks a word of every day (two syllables). */
const ROOTS: Record<Cat, string> = {
  person: `*friend 仲間
*other 相手
*elder 年上の者
young 若い個体
*resident 住人
robot ロボット
animal_kind 生き物（住人としての）
stranger 見知らぬ者`,
  question: '',
  grammar: '',
  amount: `*all 全部
*half 半分
*some いくつか
*many 多い
*few 少ない
*none ひとつもない
*enough 足りる
lack 足りない
*left_over 余り
*empty 空の
*whole まるごとの
part 一部
*again また
*already もう
*still まだ
almost ほとんど
*about_n 約
exactly ちょうど
each それぞれ
*more_than 〜以上
less_than 〜未満
*increase 増える
*decrease 減る
twice 二倍
*first 一番目の
*last 最後の
count_n 数
*amount 量
pair ひと組
group 群れ・組
bundle 束
load ひと荷`,
  time: `later あとで
earlier さっき
recently 近ごろ
until_now これまで
from_now これから
during 〜の間に
while 〜しながら
meanwhile その間
finally ついに
suddenly 急に
slowly ゆっくり
quickly すばやく
at_once いっせいに
in_turn 順に
dry_season 乾いた季節
wet_season 雨の季節
typhoon_season 台風の季節
*now 今
*today 今日
*yesterday 昨日
*tomorrow 明日
*morning 朝
*noon 昼
*evening 夕方
day 日
*hour 時間
minute 分
week 週
month 月
*year 年
season 季節
spring 春
summer 夏
autumn 秋
winter 冬
*before 前に
*after 後で
*soon すぐ
*always いつも
*sometimes ときどき
never 一度も〜ない
*long_time 長い間
short_time 短い間
*early 早い
*late 遅い
*begin 始まる・始める
*end 終わる・終える
*wait 待つ
*continue 続く・続ける
everyday 毎日
every_night 毎晩
sunrise 日の出
sunset 日の入り
dawn 明け方
midnight 真夜中
calendar 暦
island_day 島暦の日
real_day 現実の日
moment その時
past_time 昔
future_time これから先
first_time 初めて
once 一度
often よく
rarely めったに〜ない`,
  place: `*up 上
*down 下
*inside 中
*outside 外
*front 前
*back 後ろ
*side 横
*near 近い
*far 遠い
north 北
south 南
east 東
west 西
*right 右
*left 左
between 間
around まわり
edge 端
center 中心
inland 島の奥
offshore 沖
*shallow 浅い
*deep 深い
*high 高い
*low 低い
*path 道
entrance 入口
top てっぺん
bottom 底
surface 表面・水面
corner すみ
direction 方角
distance 距離
over_there 向こう
under 〜の下
above 〜の上
across 〜を渡って
along 〜に沿って
toward 〜のほうへ
home すみか
camp 焚き火の場
landing 着く所`,
  nature: `bay 湾
cape 岬
strait 海峡
channel 水路
sandbar 砂州
dune 砂丘
tidepool 潮だまり（岩場）
spray しぶき
breaker 砕ける波
swell うねり
undertow 引き波
wake_water 航跡
crest 波頭
valley 谷
slope 坂
plain 平地
peak 頂
stream 小川
pond 池
marsh 湿地
dust ほこり
ice 氷
snow 雪
dew 露
rainbow 虹
dusk 夕暮れ
twilight 薄明
starlight 星明かり
moonlight 月明かり
sunlight 日の光
milky_way 天の川
constellation 星の並び
pole_star 北の星
eclipse 食（太陽・月の）
volcano 火山
ore 鉱石
flint 火打ち石
obsidian 黒曜石
*water 水
*fresh_water 真水
*salt 塩
*sand 砂
*soil 土
*clay 粘土
*rock 岩
*hill 丘
mountain 山
*forest 森
*tree 木
river 川
*wave 波
*tide 潮
high_tide 満ち潮
low_tide 引き潮
reef 礁
lagoon ラグーン
seagrass_bed 藻場
cave 洞
*sky 空
*cloud 雲
*sun 太陽
*moon 月
*light 光
*shadow 影
smoke 煙
ash 灰
heat 熱
*world 世界
earth 大地
horizon 水平線
current 海流
foam 泡
pool 潮だまり
cliff がけ
shore 海岸
mud 泥
pebble 小石
limestone 石灰岩
coral サンゴ
mangrove マングローブ
grassland 草地
spring_water 湧き水
planet 星（この星）
other_world もうひとつの世界`,
  weather: `*rain 雨
*wind 風
*storm 嵐
typhoon 台風
thunder 雷
lightning 稲妻
fog 霧
*clear_sky 晴れ
*cloudy 曇り
*hot 暑い・熱い
*cold 寒い・冷たい
*warm 暖かい
cool 涼しい
*dry 乾いた
*wet 濡れた
humid 湿った
pressure 気圧
temperature 温度
humidity 湿度
wind_dir 風向き
*strong 強い
*weak 弱い
calm 凪
forecast 予報
gust 突風
drizzle 小雨
downpour 大雨
weather 天気`,
  life: `jellyfish クラゲ
eel ウナギ・ウツボ
ray エイ
whale クジラ
dolphin イルカ
shrimp エビ
snail 巻き貝
starfish ヒトデ
worm 虫（ゴカイなど）
insect 虫
ant アリ
fly_insect ハエ
mosquito カ
butterfly チョウ
lizard トカゲ
gecko ヤモリ
bat コウモリ
rat ネズミ
hermit_crab ヤドカリ
coconut_crab ヤシガニ
gull カモメ
heron サギ
school_fish 魚の群れ
spawn 産卵
molt 脱皮
migrate 渡る（季節に）
*creature 生き物
*fish 魚
*bird 鳥
turtle カメ
otter ラッコ（種）
octopus タコ
shark サメ
*crab カニ
*urchin ウニ
*clam 貝
anemone イソギンチャク
sea_cucumber ナマコ
plankton プランクトン
*flock 群れ（鳥・魚）
egg 卵
child 子ども（個体）
adult 大人（個体）
tooth 歯
*fin ひれ
tail 尾
feather 羽
fur 毛
skin 皮
scale_fish うろこ
beak くちばし
claw はさみ・爪
predator 捕食者
prey 獲物
nest 巣
tern アジサシ
booby カツオドリ
parrotfish ブダイ
grouper ハタ
barracuda カマス
seaweed 藻`,
  plant: `*plant 植物
*leaf 葉
*branch 枝
*root 根
trunk 幹
*fruit 実
*seed 種
flower 花
bamboo 竹
reed 葦
grass 草
sprout 芽
palm ヤシ
pandanus アダン
casuarina モクマオウ
seagrass 海草
vine つる
bark 樹皮
fiber 繊維
wick 灯芯`,
  body: `*body 体
*head 頭
*eye 目
*mouth 口
*hand 手
*foot 足
*arm 腕
leg 脚
back_body 背中
belly 腹
nose 鼻
ear 耳
breath 息
*power 力
*tired 疲れた（労力が多い）
*hungry 空腹の
*asleep 眠っている
awake 起きている
*cold_body 体が冷えた
*weak_body 弱った
*rest 休む
recover 戻る（体が）
light_face 光の輪
screen_face 画面の顔
charge 充電する
solar_panel 太陽電池
stuck 動けない
chill 冷え
groom 毛づくろいする
breathe 息をする`,
  action: `wipe ぬぐう
fold たたむ
roll 転がす
spin 回す
hang つるす
tie_up しばる
weave 編む
sew 縫う
grind すりつぶす
pound たたく
scrape こそげる
peel むく
split 裂く
chop 刻む
saw のこで切る
drill 穴をあける
lift 持ち上げる
lower 下ろす
drag 引きずる
float_v 浮かべる
row 漕ぐ
steer 舵をとる
navigate 星で道を知る
anchor_v 止めておく
tow 曳く
launch 浜から出す
beach_v 浜に上げる
shelter_v 風をよける
cover 覆う
uncover 覆いをとる
hide 隠れる
appear 現れる
disappear 見えなくなる
point 指し示す
nod うなずく
wave_hand 手を振る
gesture 身振りする
listen 耳を澄ます
notice 気づく
check 確かめる
guess 見当をつける
expect 見込む
prepare 用意する
arrange 並べる
sort 仕分ける
store しまう
fetch 取ってくる
deliver 届ける
borrow 借りる
lend 貸す
return_item 返す
share_out 分け合う
cooperate 力を合わせる
lead 先に立つ
wait_for 待ち受ける
guard 見張る
warn 警告する
rescue 助け出す
escape 逃げる
chase 追う
catch 捕まえる
release 放す
feed 食べさせる
crack_open 割って開ける
spill こぼす
drain 水を抜く
collect_rain 雨水をためる
heat_v 熱する
cool_v 冷やす
smoke_v いぶす
glow 光る
flicker ちらつく
reflect 映す
measure_time 時を計る
mark_v 印をつける
repeat 繰り返す
practice 練習する
improve よくする
fail しくじる
succeed うまくいく
plan_v 計画する
predict 予報する
explain 説明する
agree_on 決めあう
greet あいさつする
introduce 名乗る
visit 訪ねる
explore 探りに行く
survey 見渡す
*go 行く
*come 来る
*return 帰る・戻る
*walk 歩く
*run 走る
*dive 潜る
*float 浮く
*fly 飛ぶ
*climb 登る
*descend 降りる
*cross 渡る
*carry 運ぶ
*hold 持つ
*drop 落とす
throw 投げる
*pull 引く
*push 押す
*break 割る・壊す
*cut 切る
*shave 削る
*dig 掘る
bury 埋める
*stack 積む
*lash 組む・結ぶ
untie ほどく
*make 作る（物を）
*fix 直す
*open 開ける
*close 閉める
*put_in 入れる
*take_out 出す
*mix 混ぜる
knead 練る
*soak 浸す
strain こす
*dry_v 乾かす
*fire_v 焼く
*boil 煮る
*burn 燃やす・燃える
*put_out 消す
*light_v 灯す
shine 照らす
*plant_v 植える
*grow 育つ・育てる
*harvest_v 収穫する
till 耕す
*divide 分ける
*count 数える
*search 探す
*lose なくす
*keep 守る・保つ
*shelter 避難する
*try 試す
*learn 学ぶ
*remember 覚える
*forget 忘れる
*teach 教える
*know 知る
*think 考える
*decide 決める
*choose 選ぶ
*stop やめる・止まる
*help 手伝う
*ask_for 頼む
*refuse 断る
*accept 引き受ける
*give 渡す
*receive 受け取る
*trade 交換する
*speak 話す
*say 言う
*hear 聞く
*answer 答える
*ask 尋ねる
*call 呼ぶ
*show 示す
*write 書く
*draw 描く
photograph 写真を撮る
*read 読む
*tell 知らせる
*see 見る
*look 眺める
*watch 見守る
*touch 触る
smell 嗅ぐ
*eat 食べる
*drink 飲む
*sleep 眠る
*wake_up 起きる
*sit 座る
*stand 立つ
*lie_down 横になる
*use 使う
*need 必要とする
*have 持っている
*become なる
*change 変わる・変える
*move 動く・動かす
*turn 曲がる・向きを変える
*follow ついて行く
*meet 会う
*leave 離れる
*arrive 着く
*enter 入る
*exit 出る
sink 沈む・沈める
fill 満たす
pour 注ぐ
scoop すくう
wash 洗う
squeeze しぼる
crack 割れる
melt 溶ける
harden 固まる
shrink 縮む
leak 漏れる
seal 閉じ込める
set_up 置いて据える
read_gauge 目盛りを読む
graze 草を食む
forage 餌を探す
bask 甲羅干しする
patrol 巡回する
chart 地図に記す
voyage 船出する
reach たどり着く
turn_back 引き返す
replant 植え直す`,
  thing: `cloth 布
string ひも
knot 結び目
plate 平皿
spoon さじ
shovel 掘り具
hammer 槌
chisel のみ
wedge くさび
peg くい
frame 枠
mast 帆柱
rudder 舵
hull 船体
paddle 小櫂
float_ring 浮き輪
container 入れ物
lid_jar 壺のふた
funnel じょうご
sieve ふるい
filter こし布
trough 樋
cistern 水だめ
well 井戸
oven かまど
fireplace 炉辺
torch たいまつ
candle ろうそく
lantern_lamp 手灯り
mirror 鏡
lens レンズ
compass 方位を知る道具
clock 時計
sundial 日時計
ruler 物差し
balance 天秤
weight_stone おもり
map_sheet 地図の紙
marker_post 標柱
sign 標識
step 段
bridge 橋
hut_frame 小屋の骨組み
garden 菜園
trap 仕掛け
cage かご（生き物の）
food 食べ物
meal 食事
water_jar 水がめ
bottle_gourd ひょうたん
shell_cup 貝殻の杯
*tool 道具
*vessel 器
tub 桶
pot 鍋
jar 壺
dish 皿
*rope 縄
net 網
*stick 棒
board 平板
piece 部材
roof 屋根
wall 壁
floor 床
door 戸
workbench 作業台
*raft 筏
*boat 舟
sail 帆
oar 櫂
field 畑
fishing_reef 漁礁
notebook_page 頁
*mark 印・目盛り
picture 写真・絵
*lamp 灯り
oil 油
charcoal 炭
firewood 薪
tar タール
lime 石灰
brick れんが
pottery 土器
test_piece 試験片
barometer 気圧計
tube 管
float_thing 浮き
bag 袋
basket かご
blade 刃
axe 斧
hook 鉤
needle 針
thread 糸
cup 杯
lid ふた
handle 取っ手
bowl 鉢
mat 敷物
fence 囲い
ladder はしご
anchor いかり
wheel 車輪
mold 型`,
  quality: `deep_blue 深い青の
pale 淡い
shiny 光る
dull くすんだ
sticky ねばる
slippery すべる
fragile こわれやすい
strong_built 丈夫な
loose ゆるい
tight きつい
hollow 中が空の
solid 中が詰まった
upright 立った
tilted 傾いた
level_a 水平な
hidden 隠れた
visible 見える
invisible 見えない
far_off はるかな
nearby そばの
ready 準備ができた
busy 手がふさがった
free_a 手があいた
idle 休んでいる
lost なくした
found_a 見つかった
known 知られた
unknown 知られていない
same_kind 同じ種類の
different_kind 違う種類の
first_class いちばん良い
enough_a 十分な
countless 数えきれない
single ひとつだけの
double ふたつの
*big 大きい
*small 小さい
*long 長い
*short 短い
*heavy 重い
*light_w 軽い
*hard 硬い
*soft 柔らかい
*new 新しい
*old 古い
*fast 速い
*slow 遅い
*bright 明るい
*dark 暗い
*white 白い
*black 黒い
*red 赤い
*blue 青い
*green 緑の
*yellow 黄色い
brown 茶色の
gray 灰色の
*round 丸い
flat 平たい
sharp とがった
thick 太い・厚い
thin 細い・薄い
*full_of 満ちた
*good 良い（役に立つ）
*bad 悪い（役に立たない）
*right_c 正しい
*wrong 違う・誤った
similar 似た
*safe 安全な
*danger 危ない
broken 壊れた
finished 完成した
raw 生の
cooked 焼いた・煮た
cracked 割れた
edible 食べられる
*useful 役に立つ
usable 使える
certain 確かな
uncertain 不確かな
possible できる見込みの
necessary 必要な
*clean きれいな
dirty 汚れた
*easy 易しい
*difficult 難しい
*true 本当の
false 本当でない
open_a 開いた
closed 閉じた
straight まっすぐな
crooked 曲がった
quiet 静かな
loud うるさい
*many_kinds いろいろな
rare 珍しい
common よくある
whole_a 欠けていない
*alive 生きている
dead 死んだ
ripe 熟した
rotten 腐った
salty しょっぱい
fresh 新しい（水・食べ物）
smooth なめらかな
rough ざらざらした
wide 広い
narrow 狭い
tall 高い（背が）
oily 脂の多い`,
  custom: `meeting 話し合い
agreement 取り決め
turn_n 番（順番）
order_n 順序
list 一覧
example 例
mistake 誤り
correction 直し
progress 進み具合
goal 目標
step_n 段階
chance 機会
risk 危うさ
cost 手間
benefit 得
exchange 交換
gift 贈り物
help_n 手伝い
warning 警告
signal 合図
call_n 呼び声
greeting あいさつ
farewell 別れのあいさつ
story 出来事の話
history これまでの記録
*name 名前
purpose 大義・目的
*hit 当たり
reward 報酬
*trust 信頼
trade_n 取引
return_n 見返り
*request 頼み
*promise 約束
custom しきたり
*gathering 会
fire_gathering 焚き火の会
identification 識別
report_n 報告
share_n 共有
discovery 発見
*news 知らせ
forecast_n 予報
record_n 記録
*idea 考え
*plan 計画
*result 結果
*failure 失敗
*success うまくいったこと
*reason 理由
*problem 問題
*way 方法
knowledge 知識
*word 言葉
language 言語
letter 文字
number_n 数字
question_n 質問
answer_n 答え
rule 決まり
team 組
work 仕事
duty 役目
public_report 広報`,
  science: `science 科学
process 工程
*test 試し
observation 観察
*weight 重さ
*length 長さ
*time_n 時間（長さ）
*heat_n 熱さ
flame 炎
steam 湯気
fat 脂
metal 金属
iron 鉄
copper 銅
glass ガラス
electricity 電気
airtight 気密の
gauge 計器
scale 目盛り
level 水位
reading 読み取った値
sample 試料
mixture 混ざったもの
layer 層
settle 沈む（底に）
dissolve 溶かす
evaporate 蒸発する
ferment 発酵する
cool_down 冷ます
warm_up 温める
kiln 窯
furnace 炉
bellows ふいご
mortar しっくい
waterproof 水を通さない
absorb 吸う
prediction 見込み
cause 原因
effect 結果（作用）
experiment 実験`,
  unit: `gram グラム
kilogram キログラム
litre リットル
kilometre キロメートル
centimetre センチメートル
degree 度
hpa ヘクトパスカル
count_unit 個
times 回
do する @action
thing もの @thing`,
  number: '',
};

/** Derived words: [new id, root id, ending, ja]. Endings: 'he' the one who does it, 'pe' the thing to do it with,
 *  'po' the place for it, 'ti' a small or young one, 'sa' to make or become so (from a quality), 'mu' how much so it is. */
export const ENDINGS = { he: 'する者', pe: 'する道具', po: 'する場所', ti: '小さな〜・若い〜', sa: '〜にする・〜になる', mu: '〜さ（度合い）' } as const;
const DERIVE: [string, string, keyof typeof ENDINGS, string][] = [
  ['builder', 'build', 'he', '作り手'], ['gatherer', 'gather', 'he', '集める者'], ['measurer', 'measure', 'he', '測る者'], ['swimmer', 'swim', 'he', '泳ぐ者'],
  ['watcher', 'watch', 'he', '見守る者'], ['teacher', 'teach', 'he', '教える者'], ['learner', 'learn', 'he', '学ぶ者'], ['speaker', 'speak', 'he', '話す者'],
  ['traveler', 'voyage', 'he', '船出する者'], ['diver', 'dive', 'he', '潜る者'], ['carrier', 'carry', 'he', '運ぶ者'], ['finder', 'found', 'he', '見つけた者'],
  ['recorder', 'record', 'he', '記録する者'], ['planter', 'plant_v', 'he', '植える者'], ['grazer', 'graze', 'he', '草を食む者'], ['hunter', 'forage', 'he', '餌を探す者'],
  ['digging_tool', 'dig', 'pe', '掘る道具'], ['cutting_tool', 'cut', 'pe', '切る道具（刃物）'], ['shaving_tool', 'shave', 'pe', '削る道具'], ['measuring_tool', 'measure', 'pe', '測る道具'],
  ['lifting_tool', 'pick', 'pe', '拾う道具'], ['cooking_tool', 'boil', 'pe', '煮る道具'], ['firing_tool', 'fire_v', 'pe', '焼く道具'], ['carrying_tool', 'carry', 'pe', '運ぶ道具'],
  ['drawing_tool', 'draw', 'pe', '描く道具'], ['writing_tool', 'write', 'pe', '書く道具'], ['lighting_tool', 'light_v', 'pe', '灯す道具'], ['breaking_tool', 'break', 'pe', '割る道具'],
  ['squeezing_tool', 'squeeze', 'pe', 'しぼる道具'], ['straining_tool', 'strain', 'pe', 'こす道具'], ['mixing_tool', 'mix', 'pe', '混ぜる道具'], ['fishing_tool', 'scoop', 'pe', 'すくう道具'],
  ['workshop', 'build', 'po', '作業場'], ['sleeping_place', 'sleep', 'po', '寝床'], ['eating_place', 'eat', 'po', '食べ場'], ['diving_place', 'dive', 'po', '潜り場'],
  ['grazing_place', 'graze', 'po', '藻場（食べ場）'], ['drying_place', 'dry_v', 'po', '乾かし場'], ['firing_place', 'fire_v', 'po', '焼き場'], ['meeting_place', 'meet', 'po', '会う場所'],
  ['landing_place', 'arrive', 'po', '着き場'], ['lookout', 'look', 'po', '見晴らし'], ['storage', 'keep', 'po', 'しまう場所'], ['shelter_place', 'shelter', 'po', '避難場所'],
  ['study_place', 'learn', 'po', '学ぶ場所'], ['crossing_place', 'cross', 'po', '渡し場'], ['planting_place', 'plant_v', 'po', '植え場'], ['harvest_place', 'harvest_v', 'po', '収穫の場'],
  ['islet', 'island', 'ti', '小島'], ['cove', 'sea', 'ti', '入り江'], ['pebble_s', 'stone', 'ti', '小石'], ['twig', 'branch', 'ti', '小枝'],
  ['chick', 'bird', 'ti', 'ひな'], ['hatchling', 'turtle', 'ti', '子ガメ'], ['pup', 'otter', 'ti', '子ラッコ'], ['small_fish', 'fish', 'ti', '小魚'],
  ['seedling', 'plant', 'ti', '苗'], ['spark', 'fire', 'ti', '火の粉'], ['droplet', 'water', 'ti', 'しずく'], ['ripple', 'wave', 'ti', 'さざ波'],

  ['enlarge', 'big', 'sa', '大きくする'], ['make_small', 'small', 'sa', '小さくする'], ['lengthen', 'long', 'sa', '長くする'], ['shorten', 'short', 'sa', '短くする'],
  ['soften', 'soft', 'sa', '柔らかくする'], ['brighten', 'bright', 'sa', '明るくする'], ['darken', 'dark', 'sa', '暗くする'], ['moisten', 'wet', 'sa', '濡らす'],
  ['warm_sa', 'warm', 'sa', '暖める'], ['chill_sa', 'cold', 'sa', '冷やす・冷える'], ['strengthen', 'strong', 'sa', '強くする'], ['weaken', 'weak', 'sa', '弱める'],
  ['empty_sa', 'empty', 'sa', '空にする'], ['clean_sa', 'clean', 'sa', 'きれいにする'], ['flatten', 'flat', 'sa', '平らにする'], ['straighten', 'straight', 'sa', 'まっすぐにする'],
  ['secure', 'safe', 'sa', '安全にする'], ['finish', 'finished', 'sa', '仕上げる'], ['renew', 'new', 'sa', '新しくする'], ['sharpen', 'sharp', 'sa', 'とがらせる'],
  ['thicken', 'thick', 'sa', '太く・厚くする'], ['thin_sa', 'thin', 'sa', '細く・薄くする'], ['heavier', 'heavy', 'sa', '重くする'], ['lighten', 'light_w', 'sa', '軽くする'],
  ['speed_up', 'fast', 'sa', '速める'], ['slow_down', 'slow', 'sa', '遅くする'], ['widen', 'wide', 'sa', '広げる'], ['narrow_sa', 'narrow', 'sa', '狭める'],
  ['size', 'big', 'mu', '大きさ'], ['height', 'high', 'mu', '高さ'], ['depth', 'deep', 'mu', '深さ'], ['width', 'wide', 'mu', '広さ'],
  ['strength', 'strong', 'mu', '強さ'], ['speed', 'fast', 'mu', '速さ'], ['brightness', 'bright', 'mu', '明るさ'], ['hardness', 'hard', 'mu', '硬さ'],
  ['warmth', 'warm', 'mu', '暖かさ'], ['coldness', 'cold', 'mu', '冷たさ'], ['wetness', 'wet', 'mu', '湿り気'], ['dryness', 'dry', 'mu', '乾き'],
  ['heaviness', 'heavy', 'mu', '重み'], ['nearness', 'near', 'mu', '近さ'], ['farness', 'far', 'mu', '遠さ'], ['age', 'old', 'mu', '古さ・年'],
  ['thickness', 'thick', 'mu', '太さ・厚さ'], ['sharpness', 'sharp', 'mu', '鋭さ'], ['saltiness', 'salty', 'mu', '塩気'], ['roundness', 'round', 'mu', '丸み'],
  ['usefulness', 'useful', 'mu', '役立ち'], ['danger_level', 'danger', 'mu', '危うさの度合い'], ['certainty', 'certain', 'mu', '確かさ'], ['difficulty', 'difficult', 'mu', '難しさ'],
  ['walker', 'walk', 'he', '歩く者'], ['climber', 'climb', 'he', '登る者'], ['helper', 'help', 'he', '手伝う者'], ['guard_one', 'guard', 'he', '見張り番'],
  ['messenger', 'tell', 'he', '知らせる者'], ['rower', 'row', 'he', '漕ぎ手'], ['navigator', 'navigate', 'he', '道を知る者'], ['explorer', 'explore', 'he', '探りに行く者'],
  ['maker', 'make', 'he', '作る者'], ['fixer', 'fix', 'he', '直す者'], ['thinker', 'think', 'he', '考える者'], ['reader', 'read', 'he', '読む者'],
  ['drawer', 'draw', 'he', '描く者'], ['photographer', 'photograph', 'he', '撮る者'], ['weaver', 'weave', 'he', '編む者'], ['cook', 'boil', 'he', '煮炊きする者'],
  ['sewing_tool', 'sew', 'pe', '縫う道具'], ['weaving_tool', 'weave', 'pe', '編む道具'], ['grinding_tool', 'grind', 'pe', 'すりつぶす道具'], ['pounding_tool', 'pound', 'pe', 'たたく道具'],
  ['peeling_tool', 'peel', 'pe', 'むく道具'], ['rowing_tool', 'row', 'pe', '漕ぐ道具'], ['steering_tool', 'steer', 'pe', '舵'], ['lifting_gear', 'lift', 'pe', '持ち上げる道具'],
  ['heating_tool', 'heat_v', 'pe', '熱する道具'], ['catching_tool', 'catch', 'pe', '捕る道具'], ['marking_tool', 'mark_v', 'pe', '印をつける道具'], ['rain_catcher', 'collect_rain', 'pe', '雨水受け'],
  ['washing_place', 'wash', 'po', '洗い場'], ['rowing_route', 'row', 'po', '漕ぎ道'], ['launch_place', 'launch', 'po', '舟出し場'], ['grinding_place', 'grind', 'po', 'すり場'],
  ['storing_place', 'store', 'po', '倉'], ['hiding_place', 'hide', 'po', '隠れ場'], ['resting_place', 'rest', 'po', '休み場'], ['watching_place', 'watch', 'po', '見張り場'],
  ['spawning_place', 'spawn', 'po', '産卵場'], ['nesting_place', 'nest', 'po', '巣のある所'], ['gathering_place', 'gather', 'po', '集まる場所'], ['rain_pool', 'collect_rain', 'po', '水だめ'],
  ['crablet', 'crab', 'ti', '子ガニ'], ['fry', 'school_fish', 'ti', '稚魚'], ['bud', 'flower', 'ti', 'つぼみ'], ['pebble_shell', 'snail', 'ti', '小さな巻き貝'],
  ['puddle_sea', 'tidepool', 'ti', '小さな潮だまり'], ['ember', 'flame', 'ti', 'おき火'], ['breeze', 'wind', 'ti', 'そよ風'], ['shower', 'rain', 'ti', 'にわか雨'],
  ['sapling', 'tree', 'ti', '若木'], ['kitten_star', 'star', 'ti', '小さな星'], ['crumb', 'food', 'ti', '食べかす'], ['splinter', 'wood', 'ti', '木くず'],
  ['hillock', 'hill', 'ti', '小さな丘'], ['puddle', 'pool', 'ti', '水たまり'], ['flake', 'pottery', 'ti', 'かけら'], ['shell_s', 'clam', 'ti', '小さな貝'],
];

/* ---------- making the forms ---------- */
const C = ['', 'p', 't', 'k', 'm', 'n', 's', 'h', 'l', 'w'], V = 'aiueo';
const ok = (c: string, v: string) => !(c === 'w' && v === 'u');
function hash(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; }
function next(h: number) { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; return h >>> 0; }
/** A word for an id: n syllables, from the id itself, not one already taken, not a question word (those begin with ha),
 *  and not starting with a vowel-only syllable twice over. */
function coinWord(id: string, n: number, taken: Set<string>): string {
  let h = hash(id) || 1;
  for (let tries = 0; tries < 400; tries++) {
    let w = '';
    for (let k = 0; k < n; k++) {
      let c: string, v: string;
      do { h = next(h); c = C[h % C.length]; h = next(h); v = V[h % 5]; } while (!ok(c, v) || (k > 0 && c === ''));   // (a bare vowel only to begin a word)
      w += c + v;
    }
    if (!taken.has(w) && !w.startsWith('ha') && !DIGITS.includes(w)) return w;
    if (tries > 200) n = n + 1;   // (crowded: a syllable longer)
  }
  throw new Error(`no word for ${id}`);
}

let built: Entry[] | null = null;
/** The whole vocabulary, the same every time. */
export function lexicon(): Entry[] {
  if (built) return built;
  const out: Entry[] = [], taken = new Set<string>(DIGITS);
  const add = (e: Entry) => { if (out.some((x) => x.id === e.id)) throw new Error(`duplicate id ${e.id}`); if (taken.has(e.form) && e.tier !== 'legacy') throw new Error(`duplicate form ${e.form} (${e.id})`); taken.add(e.form); out.push(e); };
  for (const [id, form, ja, cat] of LEGACY) add({ id, form, ja, cat, tier: 'legacy' });
  for (const [id, form, ja, cat] of GRAMMAR) add({ id, form, ja, cat, tier: 'grammar' });
  ['temu', 'hiku'].forEach((w) => taken.add(w));
  const roots: [string, string, Cat, boolean][] = [];
  for (const [cat, text] of Object.entries(ROOTS) as [Cat, string][]) for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const basic = line.startsWith('*'), [id, ...ja] = line.replace(/^\*/, '').split(' ');
    // (a word added late keeps its place at the end of the list — so no older word's form moves — and says its own kind: '@action')
    const own = ja.length > 1 && ja[ja.length - 1].startsWith('@') ? (ja.pop()!.slice(1) as Cat) : cat;
    roots.push([id, ja.join(' '), own, basic]);
  }
  for (const [id, ja, cat, basic] of roots.filter((r) => r[3])) add({ id, ja, cat, form: coinWord(id, 2, taken), tier: 'basic' });
  for (const [id, ja, cat, basic] of roots.filter((r) => !r[3])) add({ id, ja, cat, form: coinWord(id, 3, taken), tier: 'more' });
  const byId = new Map(out.map((e) => [e.id, e]));
  for (const [id, root, end, ja] of DERIVE) {
    const r = byId.get(root); if (!r) throw new Error(`no root ${root} for ${id}`);
    let form = r.form + end; if (taken.has(form)) form = r.form + end + end[0] + 'a';
    add({ id, ja, cat: r.cat, form, tier: 'derived', from: root });
  }
  return (built = out);
}
/** The form of a word by its id. */
export function word(id: string): string { const e = lexicon().find((x) => x.id === id); if (!e) throw new Error(`no word ${id}`); return e.form; }
