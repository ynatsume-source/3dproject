# 本体側の最終レビュー依頼：炭と木タール・気密の器

2026-10-06 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)（オーナー合意）

**Codex の確認はすべて完了し、保留は解除されている。** 統合と採択は、本体側の最終レビューの後に本体側が行う。科学側は main・lab・共通ファイルを変えていない。
前の束（島の天気・気圧計・粘土の下ごしらえ・ヤシ油、[FINAL_REVIEW_2026-10-05.md](FINAL_REVIEW_2026-10-05.md)）は main の ad2cb9f に統合済み。共通の組成の丸め（`common.ts`）と薪で焼く 0.1.5 も main にある。今回はその続き。

## 1. 束ねたもの

| 束 | 工程・版 | 時計 | Codex |
|---|---|---|---|
| 炭と木タール | `p14x_charcoal_tar_retort` 0.1.2（状態 `civ-sci.charcoal-retort/2`、接続仕様 0.2.x のみ） | 島 | 全面＋修正確認で保留解除（lab 20cb418）。C3（設備の指紋のキー順）は 0.1.2 で対応 |
| 気密の器 | `p16x_vessel_tar_seal` 0.1.1（状態 `civ-sci.vessel-seal/2`、0.2.x のみ）、`p17x_vessel_leak_test` 0.1.1（状態 `civ-sci.vessel-leak/2`、0.1.x / 0.2.x） | 世界／島 | 全面（A1〜A5）＋組み立ての追加（A6）＋修正確認で保留解除（lab 3d18819） |
| 器の組み立て換算表 | `civ-sci.pot-assembly/2`（`potToEquipmentParams`・`potQualityOnReturn`） | — | 同上（A6） |

炭は気密の器の前提（`wood_tar` は炭焼きの下の壺から）なので、一緒に入れてほしい。
手順書：[CHARCOAL_HANDBOOK.md](CHARCOAL_HANDBOOK.md)、[SEALED_VESSEL_HANDBOOK.md](SEALED_VESSEL_HANDBOOK.md)（§3 が組み立て、§5 が版）。経緯は [CODEX_REVIEW.md](CODEX_REVIEW.md)。

**含めないもの**：`vessel.ts` の `potSherdsQuality`（9c3b611、壊れた器 → `pot_sherds` の quality）は Codex のレビュー対象外のまま。ファイルには入っているが、本体の破損時の処理につなぐ前に、別に Codex の確認を取る（科学側から依頼できる）。

## 2. 統合してほしいファイル

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/charcoal.ts` | 追加 | 二重の壺の炭焼き（`foodQuality`（ヤシ油）・`fuelComp`（薪）を使う） |
| `src/science/step/vessel.ts` | 追加 | p16x・p17x、組み立ての換算表（と、未レビューの `potSherdsQuality`） |
| `src/science/chem.ts` | 追加のみ（+9行） | 化学種 `char`・`wood_tar`・`pyrolysis_gas`、反応 `charCombustion` |
| `src/science/params.ts` | 追加のみ（+20行） | 炭焼き・器の定数（すべて仮定） |
| `data/science/catalog-test-2.json` | 変更 | 工程 p14x・p16x・p17x、材料 `charcoal`・`wood_tar`・`wood_vinegar`・`fired_pot_test`・`pot_sherds`、設備 `fixture_tar_retort`・`fixture_tar_brush`・`fixture_vessel_stand`・`assembled_pot`。あわせて共通の丸め（B2）の版（薪で焼く 0.1.5 など）に追いつく。main のカタログは薪で焼くを 0.1.4 と書いているが、コードは 0.1.5 |
| `scripts/science-charcoal-check.ts`・`scripts/science-vessel-check.ts` | 追加 | 38件・52件。科学側の `src/science/step/index.ts` を使うので、本体の呼び方に合わせるか、科学側の index ごと入れる |

`common.ts`・`wood-fire.ts`・`coconut.ts`・`validate.ts` は main と同じ（変更なし）。`src/world/science-contract.ts` も変えない（0.2.1 のまま）。

## 3. 本体側で決めること・守ること

- **旧 run**：p14x 0.1.1、p16x/p17x 0.1.0 の run（状態 `/1`）は、版と状態の形で拒否される。本体は run を中止し、予約を解放する（ほかの古い run と同じ）。
- **換算表 /2 の意味**（本体の ADR 0006 に反映済みと聞いている）：
  - 傷んでも（condition < 1）封じた器は `sealed: 1` のまま。`airtight_known: 0` が付き、`air_leak_tau_min` は外れる。傷みは開栓ではない。
  - params の `airtightKnown: 0`、`airLeakTauMin: 0` は「気圧計の器には使えない」。完全な気密という意味ではない。
  - ひび `crack_ppm` は使うたびに (1 − condition)×1,000,000 を足し、上限 1,000,000。本体が組み立てのたびに condition を 1 にする前提。戻す関数には、その組み立てのときの写しを渡す。
- **`submerge`（水に沈めて泡を見る）は保留**：p17x は理由つきで断る。気密を確かめ直す圧力の試験と、封じた器を開ける工程はまだないので、`airtight_known: 0` の器は棚に置いたまま（オーナーの制限）。
- **島の工程の一覧**：3つとも試験用の設備（レトルト・刷毛・台）と試験用の焼いた器が要るので、島ではまだ「準備できていない」になるはず。今の7工程と同じ扱い。

## 4. 統合の予行（科学側で実施）

main `65cebcf` の一時 worktree に、2章のファイルだけを置いて確認した（検査が呼ぶ `scienceStep` は、炭・器・薪で焼くだけを振り分ける一時的な index で代用）。

| 確認 | 結果 |
|---|---|
| 型検査（`tsc --noEmit`） | 成功 |
| 炭の検査・器の検査 | 38件・52件成功、検査器の違反 0 |
| `npm run build` | 成功 |
| main の `science-integration-check`（fixture-4） | 93件成功 |
| main の `process-runner-check`・`assembly-check` | 成功（assembly-check は main の模擬表。本物の換算表 /2 の接続は Codex が e14eeba で確認済み） |

実行していないもの：本体の実行役・島の工程の一覧への登録（本体の仕事）、画面での確認。

## 5. 次

- `potSherdsQuality` の Codex 確認（本体が破損時の処理につなぐ前に）。
- 自作の気圧計：設計案 [SELF_BAROMETER_DESIGN.md](SELF_BAROMETER_DESIGN.md)。オーナー決定（ランタンはひらめき型、自作の気圧計は節目）済み。管の用意・管を栓に通す封じ方（換算表 /3 の予定）・合わせ直しはこれから。
