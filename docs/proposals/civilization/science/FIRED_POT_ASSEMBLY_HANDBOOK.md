# 手順書：住民の器を設備にする（換算表 civ-sci.fired-pot-assembly/1）

2026-10-07 / ブランチ `codex/civilization-simulation` / **未採択の提案**（Codex の確認と本体の最終レビューの後に統合。野焼き p13y のレビューの後）

本体の依頼2（島で作った設備の値）への答え。野焼きで焼いた器（`fired_pot`）を、試験用の鍋・二重の壺の代わりにする。器の組み立て（ADR 0006）と同じ形：本体がロットをまるごと設備にし、写しを持ち、戻すときは下の関数で品質を決める。

## 1. 換算表（`src/science/step/fired-pot-assembly.ts`）

| 設備（kind） | 作り方 | params | 使う工程 |
|---|---|---|---|
| `cook_pot` | `fired_pot`（鍋か壺、ひびなし）1つ：`cookPotParams(lot, { heatShare? })` | `heatCapJPerK`＝質量 × 0.9、`uaWPerK`＝片面の面積 × 20 W/(m²·K)、`heatShare`（標準 0.2、かまど次第で本体が変えてよい）、`capacityMl` | ヤシ油を煮る p31x 0.1.3 |
| `tar_retort` | `fired_pot` 2つ（上：詰める器、1 L 以上／下：タールを受ける器）：`retortParams(upper, lower, …)` | 2つ分の熱容量と面積、`heatShare`（標準 0.35）、`capacityMl`（上の容量）、`collectShare`（標準 0.6） | 炭と木タール p14x 0.1.3 |
| `lamp_dish` | `fired_pot`（灯皿、ひびなし）1つ：`lampDishParams(lot)` | `capacityMl`、`absorptionPpm`（素焼きが油を吸う）、`massG` | 油の灯り（これから） |

例（気をつけて焼いた本物の器）：4 L の鍋 → 約 1140 J/K・2.3 W/K（試験用の鍋の例 1800 J/K・3 W/K に近い）。4 L の鍋と 2 L の壺の二重の壺 → 約 2180 J/K・4.1 W/K。

ひびのある器（`crack` ≥ 1）は組み立てない（漏れる、仮定の決まり）。試験用の `fired_pot_test` はこの表では読まない（気密の器の換算表 `civ-sci.pot-assembly/2` のまま）。

## 2. 戻すとき

| 関数 | 中身 |
|---|---|
| `firedPotQualityOnReturn(copy, condition)` | condition 1 なら写しのまま。傷んだら傷みを `crack_ppm` に足し（上限 1,000,000）、`crack: 1`（もう組み立てられない） |
| `firedPotSherdsQuality(copy)` | 壊れたら（condition 0）同じ量の `pot_sherds`（気密の器と同じ形） |

二重の壺は2つのロットから組み立てるので、写しも2つ持つ。戻すときは `retortPartsOnReturn(upperCopy, lowerCopy, condition)` が2つのロットを返す（本体の質問「どちらかが割れたとき、それぞれ何に戻るか」への答え、2026-10-07 追加）：**傷みは上の器が受ける**（火の中で詰め物を抱える。下の器は地面で冷えたままタールを受ける。仮定の決まりで、乱数は使わない）。下の器はいつも写しのまま `fired_pot`。上の器は傷めば `firedPotQualityOnReturn`、condition 0 なら同じ量の `pot_sherds`。**本体の組み立て（ADR 0006）は今「ロット1つ」なので、2つのロットからの組み立てを足す必要がある**。

## 3. 道具（材料から本体が作る：`TOOL_RECIPES`）

物理の値がほとんど効かない道具は、材料と手間だけを出す。kind は今の工程が探す名前のまま。

| kind | もの | 材料（ロット） | 拾うもの（ロット不要） | 手間 |
|---|---|---|---|---|
| `fixture_coconut_tools` | ヤシの実を割る杭と石、削る貝、こす布 | 竹 1.5 kg | 石・二枚貝の殻・アダンの葉 | 30分 |
| `fixture_tar_brush` | タールの刷毛と栓 | 竹 0.2 kg | アダンの繊維・木片 | 15分 |
| `fixture_vessel_stand` | 器の台 | 竹 1 kg | 縛る蔓 | 20分 |
| `drying_rack` | 乾かす棚 | 竹 3 kg | 縛る蔓 | 40分 |
| `firewood_stack`（`covered: 1`） | 薪の山の屋根 | 竹 2 kg | 葉 | 40分 |

## 4. 値の扱い

熱の逃げ 20 W/(m²·K)、かまど・壺の熱の割合、下の壺に落ちる割合、上の壺の下限、道具の材料と手間はすべて仮定（`params.ts`、表）。p31x・p14x の物理は変えていない（同じ params なら試験用の道具とまったく同じ結果、検査で確認）。
