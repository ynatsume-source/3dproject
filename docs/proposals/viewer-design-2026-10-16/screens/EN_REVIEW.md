# ライブ画面の英語（L5、PR #55）へのレビュー（2026-10-19）

対象：main の `src/live/en.ts`・`src/live/live.ts`・`src/live/live.css`・`tools/live/caption-format.mjs`（origin/main 3432fe1 時点）。コードは読んだだけで、実際の配信の画面はまだ見ていない。
英文は英国式のつづり（favour・fibre・round）でそろっているので、それに合わせた。

## A. 先に直してほしい2点（仕組み）

| # | 何 | なぜ | 案 |
|---|---|---|---|
| A1 | **字幕の言語が画面の言語に連動している**（`live.ts` 90行・159行：`en` のときだけ英語、そうでなければ日本語を送る） | 決めた組み合わせは「画面＝日本語、YouTube の字幕＝英語」（`README.md` §6）。いまのままだと日本語の配信で字幕も日本語になり、画面の字幕と同じ文が重なる | 字幕の言語を画面と別に持つ（例 `&captions=…&captionLang=en`、既定は英語）。日本語の画面でも、字幕には `sayEn`・`firstEn`・`NAMES_EN` を使う |
| A2 | **Cormorant Garamond の数字が古い形（オールドスタイル）**になる | 「Island year 1」の 1 が小文字の i のように見える（モックで確認済み） | `#live.en` に `font-variant-numeric: lining-nums;` |

## B. 画面の決まり文句

| いま | 案 | なぜ |
|---|---|---|
| `Dot's island` | `Dot's Island` | 島の名前（固有名）なので語頭を大文字に |
| `The residents are AIs · Filmed automatically` | `The residents are AI · filmed automatically` | 英語では AI を数えない言い方が自然。中点のあとは続きの文なので小文字 |
| `Island year 1 · Dec 17` | `Island year 1 · 17 December` | 略さないほうが落ち着く。英国式の日付の順に合わせる |
| `busy at something`（表にない状態） | **何も出さない**（名前だけにする） | 「何かで忙しい」は、休んでいるときにも出ると事実と違う。分からないときは書かないほうが、この画面の「事実だけ」の方針に合う |
| 状態の1行は小文字で始まる | **最初の1文字だけ大文字**にして出す（表はそのまま、表示の直前に） | 画面の上では1行の見出しとして読まれる。モックもそうしている |
| 英語の状態の文字の大きさ `× 1.05` | `× 1.1` | Cormorant Garamond は小文字が小さく、同じ大きさだと日本語より一段小さく見える（モックでは +4px） |

## C. 状態の文（`EXACT`）

| 日本語 | いま | 案 | なぜ |
|---|---|---|---|
| 息つぎに浮かんできた | come up for a breath | coming up for a breath | 文法（ほかの行と同じ -ing に） |
| 浜で見慣れないものを見つけて近づいていく | found something strange on the beach, going closer | going closer to something strange on the beach | 時制をそろえる |
| 誰かに気づいて近づいていく | noticed someone, going over | going over to someone it noticed | 同上 |
| 行く手がふさがっていて、回り道を探している | the way is blocked; looking for a way round | way blocked, looking for a way round | 1行の見出しとして短く |
| 日なたへ向かっている | heading into the sun | heading for a sunny spot | 「太陽の方へ」と読める |
| 部材を小屋に取りつけている | fixing a part to the hut | fitting a part to the hut | fix は「直す」とも読める |
| 取りつけたところを見に、少し離れる | stepping back to look at what it fixed | stepping back to look at what it fitted | 同上 |
| 取りつけた部材を、少し離れて眺めている | looking at the fixed part from a little way off | looking at the fitted part from a little way off | 同上 |
| 石を石積みへ運んでいる | carrying a stone to the stone pile | carrying a stone to the cairn | 石積みはランタンの目印（島の言葉 tumo、`islandlang.ts` では cairn）。石置き場（the pile）と区別する |
| 石積みの石を拾いに行く | going for a stone for the pile | going for a stone for the cairn | 同上 |
| お腹の上の石で貝を割って食べている | cracking a clam on the stone on its belly, and eating | cracking clams on a stone on its belly, and eating | 自然な語順 |
| 観察した空を手帖に描いている | drawing the sky it watched in its notebook | drawing the sky in its notebook | 「手帖の中で見た空」とも読める |
| 気になる場所へ歩いている | walking to a place it wonders about | walking to a place that caught its interest | 自然な言い方 |
| 焼いた器を鍋にしている | making a fired vessel into a pot | turning a fired vessel into a cooking pot | 用途が分かるように |
| 静かな水面へ | to calm water | off to calm water | 1行で立つように |
| となりの浜のほうへ散歩している | strolling toward the next beach | strolling towards the next beach | 英国式のつづりにそろえる |
| 浜から水平線を見渡し、見える島を地図に記している | looking over the horizon from the beach, mapping the islands in sight | scanning the horizon from the beach, mapping the islands in sight | look over the horizon は少し不自然 |

## D. 「島で初めて」のカード（`FIRSTS`）

| いま | 案 | なぜ |
|---|---|---|
| `${w} lit a lamp for the first time on the island` | `${w} lit the island's first lamp` | 見出し（A FIRST ON THE ISLAND）と「初めて」が重なる。短く |
| `${w} made the retort` | `${w} built the retort for charcoal and tar` | retort だけでは何か分かりにくい |
| `crossed by raft to ${島の言葉} and back` ほか、島の言葉の地名 | 島の言葉の地名だけ**斜体**にする（`<i>`） | 英文の中の外国語は斜体にするのが慣例。島の言葉だと分かる |

ほかの初めて（fibre・rope・hang・lash・A rope broke・sail・mast・rig・sighted an island など）は、このままでよい。

## E. 字幕（`caption-format.mjs`）

| いま | 案 | なぜ |
|---|---|---|
| 長い行は2.5秒ごとに次へ | 1つの字幕の長さを文字数で決める：`max(2.5秒, 文字数 ÷ 15)`（2行84字なら約5.6秒） | 2行を2.5秒で読み切るのは難しい（英語の字幕はおおむね毎秒15字前後） |
| `名前: 文` | このままでよい（話し手が分かる） | — |
| `島で初めて: …` | 英語の字幕では `A first on the island: …`（A1 を直せばそうなる） | — |

## F. 見ていないこと

- 実際の配信の画面（GPU の画、英語の文字の大きさ・行の長さ）。試験配信で `?live&lang=en` も撮る。
- YouTube 側で字幕が実際に出るか、遅れ（配信の遅延 30秒）で合っているか。
