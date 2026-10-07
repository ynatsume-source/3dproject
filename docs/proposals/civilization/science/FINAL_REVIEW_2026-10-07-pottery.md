# 本体側の最終レビュー依頼：器を形づくる・乾かす

2026-10-07 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**Codex の確認は完了し、保留は解除されている**（全面 042cc53 → 修正確認 a363557、どちらも ZIP 版）。本体の依頼1（器を焼く）の前半。後半の野焼き（p13y）は次に別に出す。

| 工程・版 | 時計 | 接続仕様 | 状態 |
|---|---|---|---|
| `p11y_pot_shape` 0.1.0（鍋・壺・灯皿を紐づくりで） | 世界 | 0.1.x / 0.2.x | `civ-sci.pot-shape/1` |
| `p12y_pot_dry` 0.1.1（器を乾かす） | 島 | 0.1.x / 0.2.x | `civ-sci.pot-dry/1` |

手順書：[POTTERY_HANDBOOK.md](POTTERY_HANDBOOK.md)。設計とオーナーの決定：[POT_FIRING_DESIGN.md](POT_FIRING_DESIGN.md)。

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/pottery.ts` | 追加 | 2つの工程、器の形と面積 |
| `src/science/physics.ts` | 変更（**統合済みの共有ファイル**） | `dryPhysics` に任意の入力（`areaM2`・`fluxFactor`・`crackFactor`・`fallingSlow`）。使わない試験片の結果は変わらない（Codex：200,072 条件 × 6出力で完全一致） |
| `src/science/step/index.ts` | import と登録の3行 | `[POT_SHAPE_PROCESS.processId]: potShapeStep`、`[POT_DRY_PROCESS.processId]: potDryStep` |
| `src/science/params.ts` | 追加のみ（9定数） | `pot*`（すべて仮定） |
| `data/science/catalog-test-2.json` | 追加のみ | 工程2つ、材料 `green_pot`・`dry_pot`、`drying_rack` の `covered`（任意）と工程の一覧 |
| `data/science/sources.json` と `evidence/` の6件 | 追加のみ | 器づくりの資料（Silva 2013、Padilla Fernández / Sánchez López 2022、Lynn / Black、Idris 2024、Hugget 1999、Mal 2005）。main の抜粋版に足す。すべて `calibrationEligible: false` |
| `scripts/science-pottery-check.ts` | 追加 | 40件 |

## 本体側で決めること・守ること

- **形づくる**：道具は要らない（手だけ、15 W）。最初の依頼の `interval.from` に `plan` 操作を1回（`form` 1 鍋・2 壺・3 灯皿、`capacityMl`、`wallMm` は任意）。後の依頼に操作を付けない。使う粘土は形から決まり、残りは `prepared_clay` として戻る。
- **乾かす**：棚は試験片と同じ `drying_rack`。`covered: 1` は葉で覆う（任意）。気温・湿度・風（欠けたら分からない、明示の 0 は無風）。途中で下ろした器は `green_pot` のまま、乾燥の履歴（`dry_stage`・`dry_flux_ratio_max_ppm`）を持って次の run で続きを乾かせる。
- 割れて分かれた器（`crack: 2`）は、野焼きで断る予定。生の器を粘土に戻す工程はまだない。
- p12y 0.1.0 の run は版で拒否される（main に入ったことはないはず）。

## 統合の予行（科学側で実施）

main `51a59d6` の一時 worktree に上の追加だけを置き、`index.ts` は main のものに3行足した。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 器・薪・気密の器・炭の検査 | 40件・31件・52件・38件成功 |
| main の `science-integration-check`・`process-runner-check`・`assembly-check`・`island-science-check` | 93件成功・成功・成功・成功 |

実行していないもの：本体の工程の一覧への登録、画面での確認。

## 次の全面レビューへ回すもの（非保留）

- C2：極端な条件（65 °C・RH0・風 80 m/s・壁 20 mm）で返す `dry_flux_ratio_max_ppm` が入力の上限 1e9 を超え、次の run で断られる。
- 割れのモデル：「一番速く乾いたとき」を持ち続けるのは強すぎうる。「ならされる湿り差・応力」と「残るひび」を分ける案（[相談メモ](POTTERY_CRACK_MODEL_CONSULTATION_codex-a363557.md)）。試験片と一緒に。
- 共通の `wind10m()` が風の欠測を 0 にする件（タイルの乾燥・粘土を浸す・器の漏れの試験）。
