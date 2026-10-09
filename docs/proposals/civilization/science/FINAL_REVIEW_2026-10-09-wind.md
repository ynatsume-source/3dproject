# 本体側の最終レビュー依頼：風の欠測を「分からない天気」に

2026-10-09 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**Codex の軽い確認は完了し、追加の A/B/C はない**（8dba18f、ZIP 版）。これまでのレビューから持ち越していた非保留の項目。

共通の `wind10m()` は `windMs` が無いとき 0（無風）を返していたので、風を必須にしていない3工程は、風が欠けた区間を無風として計算していた。

| 工程 | 版 |
|---|---|
| 試験片の乾燥 `p12x_test_tile_dry` | 0.3.0 → **0.3.1** |
| 粘土を浸す `p10x_clay_slake` | 0.1.4 → **0.1.5** |
| 気密の器の水の試験 `p17x_vessel_leak_test` | 0.1.1 → **0.1.2** |
| `common.ts` `wind10m()` | 欠測なら NaN（0 にしない） |

風が欠けた区間は `source: 'unknown'` と同じになる（計算しない、来歴が不完全、look は黙る）。`windMs: 0` は無風として計算する。風のある通常の入力では、前の版と結果が完全に一致する（Codex：480 run の組、960 区間）。状態の形はどれも同じ。

## 統合してほしいもの

| ファイル | 内容 |
|---|---|
| `src/science/step/common.ts` | `wind10m()`：欠測なら NaN（2行） |
| `src/science/step/drying.ts`・`slake.ts`・`vessel.ts` | 天気が分かる条件に `windMs` を足し、版を上げる（各2〜3行） |
| `data/science/catalog-test-2.json` | 3工程の版と注記 |
| `scripts/science-step-check.ts`・`science-clay-prep-check.ts`・`science-vessel-check.ts` | 回帰（48・64・53件） |

## 本体側でやること

- **版**：p12x 0.3.0・p10x 0.1.4・p17x 0.1.1 の run は版で拒否される（本体は中止して予約を解放）。main の `scripts/clay-chain-check.ts` は p10x の版 `'0.1.4'` を決め打ちしているので `'0.1.5'` に。
- **天気の記録**：風の抜けた時間がある区間では、粘土の池・乾燥棚・水の試験が「来歴不完全」になる。これまでは無風として計算されていた。

## 統合の予行（科学側で実施）

main `4168e89` を一時ディレクトリに展開し、上のファイルを置いて確認した（作業後に削除）。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 粘土の下ごしらえ・気密の器の検査 | 64・53件成功 |
| main の `science-integration-check` | 93件成功 |
| main の `process-runner`・`assembly`・`island-science`・`pottery-host`・`oil-chain` | 成功 |
| main の `clay-chain-check` | 版の決め打ち `'0.1.4'` で失敗 → `'0.1.5'` に読み替えて成功 |

`science-step-check` は科学側にしかないファイルを読むので main では走らない（科学側で 48 件成功）。
