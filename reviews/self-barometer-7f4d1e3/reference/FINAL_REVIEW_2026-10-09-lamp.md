# 本体側の最終レビュー依頼：油の灯り・住人の気密の器・乾燥の記録

2026-10-09 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**Codex の確認はすべて終わっていて、A/B は残っていない。** 油の灯り：全面レビュー（eb3cd0b、A 6件・B 1件）→ 修正（79cdf9c）→ 確認で保留解除。住人の気密の器：軽い確認（d2e6abd、VF-A1）→ 修正 → 確認で保留解除。乾燥の記録 p12y 0.1.2：d2e6abd の確認で保留解除。

ランタンの「夜に明かりを灯す」の最初の一歩（住人の灯皿・ヤシ油・島の繊維の芯）と、自作の気圧計への下準備（住人の壺を封じて試す）。

| もの | 版 |
|---|---|
| 油の灯り `p40x_oil_lamp` | 新規 **0.1.1**（状態 `civ-sci.oil-lamp/2`、接続仕様 0.2.x のみ、世界の時計） |
| タールで封じる `p16x_vessel_tar_seal` | 0.1.1 → **0.1.2**（住人の `fired_pot` も） |
| 水の試験 `p17x_vessel_leak_test` | 0.1.2 → **0.1.3**（同） |
| 気密の器の換算表 | `civ-sci.pot-assembly/2` → **/3**（`fired_pot` も。試験用の器の値は同じ） |
| 焼いた器の換算表 | `civ-sci.fired-pot-assembly/1` → **/2**（素地を壁の水・タールと分けて読む。裸の器の値は同じ。栓をした器は組み立てない） |
| 器を乾かす `p12y_pot_dry` | 0.1.1 → **0.1.2**（いちばん速く乾いた記録を上限なしで読み戻す） |
| 化学 `chem.ts` | 反応 `oilCombustion`・`oilSooting` |

手順書：[OIL_LAMP_HANDBOOK.md](OIL_LAMP_HANDBOOK.md)（§7 が修正）・[SEALED_VESSEL_HANDBOOK.md](SEALED_VESSEL_HANDBOOK.md) 末尾・[FIRED_POT_ASSEMBLY_HANDBOOK.md](FIRED_POT_ASSEMBLY_HANDBOOK.md) 末尾・[POTTERY_HANDBOOK.md](POTTERY_HANDBOOK.md) 末尾。

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/oil-lamp.ts` | 追加 | 油の灯り・`WICK_RECIPES`・`wickQuality`・`readLampOil`・`lampOilQuality` |
| `src/science/step/vessel.ts` | 変更 | `fired_pot` を受け付ける・換算表 /3 |
| `src/science/step/fired-pot-assembly.ts` | 変更 | 換算表 /2 |
| `src/science/step/pottery.ts` | 変更（数行） | p12y 0.1.2 |
| `src/science/chem.ts` | 追加のみ | 反応2つ |
| `src/science/params.ts` | 追加のみ | `lamp*` 33個 |
| `src/science/step/index.ts` | 1行＋import | `[OIL_LAMP_PROCESS.processId]: oilLampStep as ScienceStep` |
| `data/science/catalog-test-2.json` | 科学側の版をそのまま | p40x、`lamp_wick`・`wick_char`・`soot`、`lamp_dish`、`coconut_oil` の `soaked_in_dish`、p12y・p16x・p17x の版と注記 |
| `data/science/sources.json` | 追加のみ | 4件（`kahwaji-white-coconut-pcm-2019`・`sisi-vanuatu-straight-coconut-oils-2020`・`hughes-gale-lamp-consumption-2007`・`moullou-doulos-topalis-historical-lamp-photometry-2015`、すべて calibrationEligible: false）と `evidence/` の4ファイル |
| 検査 | `science-oil-lamp-check.ts`（追加）・`science-fired-pot-assembly-check.ts`・`science-vessel-check.ts`・`science-pottery-check.ts` | 47・26・53・41件 |

## 本体側でやること・守ること（Codex の確認から）

- **灯りの入力**：澄んだ油（脂と水 2% まで）・芯（`WICK_RECIPES` から作る）・前に使った皿なら、その皿にしみこんだ油（`soaked_in_dish: 1`、皿の equipmentId に置く）。灯皿は 1000 mL まで、油 1 kg まで。この適用範囲を本体の入口でも守る。
- **返る水**：油に水が入っていた場合、終わりに `process_water` が皿の場所に返る。**皿から取り出して別に保管し、記帳する**（油の入力に混ぜない、皿の水を無視しない。捨てる場合も水のロットとして精算する）。
- **しみこんだ油**：所在は皿の equipmentId。皿を移す・解体するときも、皿としみこんだ油の関係を保つ。
- **灯皿の params**：換算表 /2 の `lampDishParams` に、置き場所の `shelter`（0〜1）・`roofed`（0/1）を足す。
- **版**：
  - 灯りの状態は `/2`。0.1.0（状態 /1）の run は消費なしで拒否される：本体は run を中止して予約を解放する（版名を付け替えて再開しない）。
  - p12y 0.1.1・p16x 0.1.1・p17x 0.1.2 の run も版で拒否される（同じく中止して解放）。
  - 換算表 `pot-assembly/3`・`fired-pot-assembly/2` を記録する。既にある設備の params を版名だけ付け替えず、本体の組み立て方針どおり換算し直す（値は試験用の器・裸の器なら同じ）。
  - main の `scripts/assembly-check.ts` は `'civ-sci.pot-assembly/2'` を決め打ちしているので `/3` に（`world/process-catalog.ts` の POT_ASSEMBLY も）。
- **明るさの報酬**：`diagnostics.lumenSeconds`（世界用）。住人には言葉だけ。ともった長さ `litSeconds` も世界用で、住人には言わない。

## 統合の予行（科学側で実施）

main `1041f9f` を一時ディレクトリに展開し、上のファイルを置き、`index.ts` に灯りを1行、`sources.json` に4件を足して確認した（作業後に削除）。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 灯り・焼いた器の換算・気密の器・器・野焼き・炭・粘土の下ごしらえ | 47・26・53・41・32・39・64件成功 |
| main の `science-integration-check` | 93件成功 |
| main の `process-runner`・`island-science`・`pottery-host`・`clay-chain`・`oil-chain` | 成功 |
| main の `assembly-check` | 換算表の版の決め打ち `'civ-sci.pot-assembly/2'` で1件失敗（params は同じ） → `/3` にすれば通る |

実行していないもの：本体の工程の一覧への登録、画面での確認、灯りを住人ごと回すこと。

## 次の全面レビューへ回すもの（非保留の C）

- 灯り：FX-C1（すすの熱の控除と整数すす mg の数 J の残差）、FX-C3（手書きの大きな設備で吸着油が 1 kg を越える端）、C2（壊れた保存 data の構造検査）、資料の相談（融解の幅、芯の植物の順位、葦の髄、吸油の速さ、高位・低位発熱量）。
- 器：FX-C2（手書きで素地が 0 以下になる ppm の入口検査）、VF-C1〜C4（乾燥の記録の最大値の計算条件、整数の上限、`surface_cm2` は片面の薄壁近似、`airLeakTauMin` は 500 mL の試験器の経験則の流用）。
