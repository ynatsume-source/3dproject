# 本体側の最終レビュー依頼：薪を積んで乾かす

2026-10-07 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**Codex の確認は完了し、保留は解除されている**（全面 29521cb → 修正確認 511f647、lab 162ee7c）。本体の依頼（science-requests-2026-10-06.md の3）への答え。
炭・気密の器・破片は main に統合済み（8b6441f ほか）なので、今回は薪だけ。

| 工程・版 | 時計 | 接続仕様 | 状態 |
|---|---|---|---|
| `p15x_firewood_dry` 0.1.1 | 島 | 0.2.x のみ（屋根のない山の雨を `drawn: rain_water`） | `civ-sci.firewood-dry/1` |

手順書：[FIREWOOD_DRY_HANDBOOK.md](FIREWOOD_DRY_HANDBOOK.md)。

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/firewood.ts` | 追加 | 工程と `woodEmc`（Wood Handbook eq. 4-5） |
| `src/science/step/index.ts` | 1行の import と1行の登録 | `[FIREWOOD_DRY_PROCESS.processId]: firewoodDryStep` |
| `src/science/params.ts` | 追加のみ（5定数） | `woodPieceMm`・`woodDryTauRefDays`・`woodStackTopM2`・`woodRainCapture`・`woodRainMcMax`（すべて仮定） |
| `data/science/catalog-test-2.json` | 追加のみ | 工程 p15x、設備 `firewood_stack`、材料 `rain_water`（drawn のみ、ロットにならない） |
| `data/science/sources.json` と `data/science/evidence/` の4件 | 追加のみ | Codex が見つけた資料（Wood Handbook 2021 第4章、USDA の平衡含水率の歴史調査、メリーランド大学の薪の乾燥、Fortier 2021）。すべて `calibrationEligible: false` |
| `scripts/science-firewood-check.ts` | 追加 | 31件 |

## 本体側で決めること・守ること

- `firewood_stack` は作る道具ではなく場所。`covered`（屋根の有無）は必須で、屋根は本体が竹・葉から作るもの。本体の雨受けと同じく、屋根のない山の雨は記録の雨量で決まる。
- 天気：気温・湿度・**風**が要る（風の欠測は「分からない」、明示の 0 は無風）。屋根のない山は雨量も要る。記録のある区間は記録を送る。
- 返す薪の `water_ppm` は丸めない比（薪で焼く工程と同じ）。焚き火・炭焼き・器を温める火がそのまま読む。
- 0.1.0 の run は版で拒否される。本体は中止して予約を解放する（版を書き換えて再開しない）。

## 統合の予行（科学側で実施）

main `541d3e2` の一時 worktree に上の追加だけを置き、`index.ts` は main のものに2行足した。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 薪・炭・器の検査 | 31件・38件・52件成功 |
| main の `science-integration-check`・`process-runner-check`・`assembly-check`・`island-science-check` | 93件成功・成功・成功・成功 |

実行していないもの：本体の工程の一覧（島で動くか）への登録、画面での確認。

## 次のレビューへ回すもの（非保留）

- 共通の `wind10m()` が風の欠測を 0 にする件：タイルの乾燥（p12x、統合済み）・粘土を浸す（p10x）・器の漏れの試験（p17x）。工程ごとに風が要るかを決めて直す（統合済みは版を上げる）。
- 焚き火の式に「生木は火がつきにくい」を足すか（器を焼く設計で一緒に）。
