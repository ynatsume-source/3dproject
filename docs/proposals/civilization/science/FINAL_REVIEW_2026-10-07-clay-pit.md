# 本体側の最終レビュー依頼：粘土の池（島の最初の桶）

2026-10-07 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**Codex の軽い確認は完了し、追加の A/B はない**（7601336、ZIP 版）。本体の依頼「粘土の池の設備の値と材料の一覧」への答え。これで島の器づくりが「生の粘土 → 粘土の池で浸す → 練る → 形づくる → 乾かす」と動き出せる。

| もの | 版 |
|---|---|
| 換算表 `civ-sci.clay-pit/1`（`clayPitParams`・`clayPitMaterials`） | 新規 |
| 浸す工程 `p10x_clay_slake` | 0.1.1 → **0.1.2**（`clay_pit` を桶として受け付ける。状態 `/2` のまま） |

手順書：[CLAY_PIT_HANDBOOK.md](CLAY_PIT_HANDBOOK.md)。

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/clay-pit.ts` | 追加 | 換算表：大きさ → 設備の params と材料 |
| `src/science/step/slake.ts` | 変更（5行） | 0.1.2：`clay_pit` も桶。物理は変えていない（Codex：同じ params の池と試験用の桶は 39 条件・2,136 区間で完全一致） |
| `src/science/params.ts` | 追加のみ | `clayPit*` の6定数だけ（同じファイルにある `pit*` は野焼き用で、まだレビュー中なので今回は入れない） |
| `data/science/catalog-test-2.json` | 一部だけ | 設備 `clay_pit`、p10x の版 0.1.2 と工程の注記。**野焼き（p13y）と `fired_pot` の項目はレビュー中なので今回は入れない** |
| `data/science/sources.json` と `evidence/` の4件 | 追加のみ | FAO の養殖池の手引き3件、Panno ほか 1991。すべて `calibrationEligible: false` |
| `scripts/science-clay-prep-check.ts` | （main にない検査） | 55件。9節が粘土の池 |

## 本体側で決めること・守ること

- **作る**：`clayPitMaterials({ diameterCm, depthCm })` の生の粘土（`rawClayMg`）と手の仕事（`handSeconds`、30 W）を使って、本体が材料から作る。おすすめは直径 50 cm・深さ 25 cm（生の粘土 約 20 kg、約 70 分）。範囲は直径 20〜120・深さ 10〜60 cm。
- **設備の値**：`clayPitParams({ diameterCm, depthCm, sunExposure })` をそのまま `clay_pit` の params に。葉の屋根の下に置く（`sunExposure: 0`、雨は入らない）。
- **伝え方**：この版は、健全な内張りを水を通さない桶とみなす理想化。住人の知識として「土の池は漏れない」と一般化しない。
- 浸す工程 0.1.1 の run は版で拒否される（本体は中止して予約を解放）。

## 統合の予行（科学側で実施）

main `542408e` の一時 worktree に、上のファイル（params と目録は科学側の版をそのまま）を置いて確認した。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 粘土の下ごしらえ（池を含む）・器の検査 | 55件・40件成功 |
| main の `science-integration-check`・`process-runner-check`・`assembly-check`・`island-science-check`・`pottery-host-check` | 93件成功・成功・成功・成功・成功 |

実行していないもの：本体の工程の一覧への登録、画面での確認。

## 次のレビューへ回すもの（非保留）

- 内張りのしみ出しのモデル（今は理想化）。確かめ方は手順書。
- 材料量を正確な円柱の差にそろえるか（今は 約 2.7% 多めの近似）。
- 共通の `wind10m()` の風の欠測（浸す工程も対象）。
