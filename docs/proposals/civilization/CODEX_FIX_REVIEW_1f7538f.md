# 1f7538fの修正確認

後続の修正確認: [e118e9fの再レビュー](CODEX_FIX_REVIEW_e118e9f.md)。F1・F2と元の焼成復元問題は修正確認済み。浸漬の状態スキーマに説明との不一致が1点残る。

2026-10-03 JST。対象は `codex/civilization-simulation` の
`1f7538fa9e71ee6239bbaca6625876179196d33e`（afc5a87、ceffb29、1f7538f）。
独立したdetached worktreeで確認した。科学実装・mainは変更していない。

## 結論

前回の再現条件ではR2・R3・R4・R5・T1・T2を修正確認できた。
R1も最初の「30秒対1秒×30」の熱量不足は直っている。
ただし**弱い供給での分割依存、消化の刻み幅による誤差**が残るため、R1全体の完了とはしない。
さらに今回の状態構造の変更に、schemaの更新または移行処理が必要。
本体への統合可否は、以下を確認したうえで本体側の最終レビューへ渡す。

## 元の指摘の確認

| 指摘 | 確認結果 |
|---|---|
| R1 | 元の炉30秒・1秒×30・29+1秒は全て120000 J。窯も66666 Jで一致。温度差は元のケースの許容差内。ただし下記F1・F2が残る |
| R2 | 水9000〜20000 mgの各入力がcompleted。1000〜50000 mg、101 mg刻みでも例外なし。整数の質量・元素収支を回帰検査で確認 |
| R3 | 炉・窯の熱容量0をfailedとして拒否。空の状態を正常な拒否として扱うよう、labの診断スクリプトも修正 |
| R4 | NaNの終了時刻と負の使用Jの相殺を検出。冷却時の負のstoredJは許容 |
| R5 | 不完全な石灰ロットと、浸漬で泥になる経路でhistory_complete:0を保持 |
| T1 | 割れ2の品質と「割れて分かれている」「濁ってびりつく音」が一致 |
| T2 | 1時間後5666 mg、再浸漬1時間後9103 mg、連続2時間9103 mgで一致 |

## F1 / P1: 弱い熱供給では格子上の分割でも結果が大きく変わる（R1残件）

対象: [lime.ts L99–119](https://github.com/ynatsume-source/3dproject/blob/1f7538fa9e71ee6239bbaca6625876179196d33e/src/science/step/lime.ts#L99-L119)、
[firing.ts L82–103](https://github.com/ynatsume-source/3dproject/blob/1f7538fa9e71ee6239bbaca6625876179196d33e/src/science/step/firing.ts#L82-L103)

回帰検査と同じ方法で `maxJ = 供給W × 今回の区間秒` とし、全区間の総offerをそろえた。
前回の炉・窯のfixture、環境一定、最終24時間時点で未完了ならoperator stopとして比較した。
**24時間、1時間、30秒の境界はいずれも30秒格子上**。

| 炉、供給600 W相当、24時間 | 使用熱J | 結果 | 生成物mg | CO2放出mg |
|---|---:|---|---:|---:|
| 24時間を一括要求 | 32808501 | 約10.45時間でcompleted、ほぼ全量分解 | 58227 | 41773 |
| 1時間ずつ要求 | 51840000 | 最後にstopped、ほぼ未反応 | 100000 | 0 |
| 30秒ずつ要求 | 51840000 | 最後にstopped、ほぼ未反応 | 100000 | 0 |

窯を1000 W相当で24時間進めても、使用熱はどの分割でも86400000 Jだが、
一括なら生成物33697 mgの `test_tile_fired`、1時間・30秒刻みなら36290 mgの `test_tile_dry` になる。
各要求のoffer上限と `validateResult` はすべて通る。

残っている原因は、**要求全体の予算を最初の内部ステップから使えること**。
長い要求では熱を前半へ集中できるが、短い要求では将来分がまだ申し出られていない。
制御出力を格子点で保持するだけでは、この供給時系列の差は解消しない。
回帰検査の弱い供給ケースは「上限を超えない」だけを検査し、同じ供給を異なる分割で比較していない。

`maxJ` を区間内で供給される熱量として扱う場合、内部の時間配分も整合させてほしい。
必要なら供給のW上限・時間区分を接続仕様へ明記し、本体側とレビューする。
開始時点で使える蓄熱予算との区別を曖昧にしたまま、「30秒の倍数なら分割によらず完全一致」と
本体へ伝えることはできない。

## F2 / P2: 消化を1秒刻みにすると、5秒刻みから0.2%を超えて変わる（R1残件）

対象: [lime.ts L218–249](https://github.com/ynatsume-source/3dproject/blob/1f7538fa9e71ee6239bbaca6625876179196d33e/src/science/step/lime.ts#L218-L249)

純CaO56080 mg、水15000 mg、25°C、桶の熱容量400 J/K、損失1.5 W/K。
外部offerはなく、同じ初期条件からcompletedまで比較した。

| 刻み | 発熱量J | 生成物mg | 放出水蒸気mg | 反応率 |
|---|---:|---:|---:|---:|
| 5秒 | 47281 | 69292 | 1788 | 73.3351% |
| 1秒 | 45845 | 68891 | 2189 | 71.1075% |

発熱量は約3.04%、生成物総量は約0.58%異なり、検査器の違反は0件。
要求境界を新しい積分境界として加えることで、温度依存の反応速度・沸騰の数値解が変わる。

ALIGNMENT §10の0.2%は既存テストの条件では確認できても、今回のような水不足の入力には広げられない。
積分誤差を制御するか、工程・条件別の許容差と対応する検査を明示し、
本体が任意の時刻で停止・再開する場合にどの精度を約束するか整理してほしい。
これは計算の分割誤差の話であり、実測による物性・速度の校正とは別。

## F3 / P2: 状態の構造を変えたが、schemaと工程版が同じで復元に失敗する

対象: [firing.ts L19–37](https://github.com/ynatsume-source/3dproject/blob/1f7538fa9e71ee6239bbaca6625876179196d33e/src/science/step/firing.ts#L19-L37)、
[L74–78](https://github.com/ynatsume-source/3dproject/blob/1f7538fa9e71ee6239bbaca6625876179196d33e/src/science/step/firing.ts#L74-L78)

修正前 `d5a853f` で `[0,60000)` を進めた焼成のrunning状態をJSON往復して、
修正後へ `[60000,90000)` の連続区間として渡すと、
`non-finite state: refusing to return it` でfailedになる。
両方とも工程版0.1.0、schema `civ-sci.tile-fire/1` なので、呼び出し側は互換性の違いを識別できない。

新しい `startMs`・`heldPowerW` が旧状態にないことが原因。消化も `startMs` を新設し、
乾燥も丸めと報告済みJの意味を変えているため、状態を読む全工程の版を点検してほしい。
ScienceStateは本体が保存・復元する契約であり、科学側が移行または未知版の明示的な拒否を担当する。

まだ本体へ統合前なので、移行を実装するか、新schemaを発行して旧試験状態を移行対象外とするかは選べる。
どちらにしても、同じschemaで旧状態を新構造として計算しないことと、その扱いを本体へ伝えることが必要。
再現用スクリプトの第2引数に旧checkoutを指定すると、この確認も実行できる。

## 実行した検証

| 対象 | 結果 |
|---|---|
| `scripts/science-review-regressions.ts` | 28件成功 |
| `scripts/science-step-check.ts` | 36件成功 |
| `scripts/science-lime-check.ts` | 24件成功 |
| `scripts/science-tile-chain-check.ts` | 16件成功 |
| `scripts/science-clay-check.ts` | 52件成功 |
| 型検査、Viteビルド、OG生成 | 成功 |

合計156件。OG生成は `node --import tsx --import ./scripts/node-assets.mjs scripts/og-pages.ts`。
Viteは以前と同じ、将来のnative config loaderでの `__dirname` 使用に関する警告のみ。
元のlab側の2つの診断スクリプトも、熱容量0のfailedを扱えるように直して最後まで実行した。

追加条件は [science-review-1f7538f.repro.mjs](review/science-review-1f7538f.repro.mjs) にある。
終了コード0は診断が完了した意味で、不具合がないという判定ではない。

```sh
node --import tsx docs/proposals/civilization/review/science-review-1f7538f.repro.mjs /absolute/path/to/1f7538f-checkout /absolute/path/to/d5a853f-checkout
```

labへの変更はこのレビューと再現スクリプトだけ。
`tools/science-lab/` と `data/science/sources.json` は科学側と同じままで、どちらも変更していない。
新しい科学資料・実測時系列の追加はない。UI・実機・本体への接続の検証は今回行っていない。

## Claudeへ渡すプロンプト

```text
1f7538fを隔離環境で再レビューしました。156件・型検査・ビルドは成功し、元のR2/R3/R4/R5/T1/T2の修正を確認できました。
labの古い診断スクリプトも、熱容量0のfailedで止まらないよう修正しました。

ただしR1は一部未解決です。labのdocs/proposals/civilization/CODEX_FIX_REVIEW_1f7538f.mdと再現スクリプトを確認してください。

F1: maxJ=供給W×区間秒で弱い供給を比較すると、30秒格子上でも分割依存が残ります。
炉600 W相当・24時間一括はほぼ全量分解、1時間/30秒刻みはほぼ未反応。
窯1000 W相当では一括でtest_tile_fired、1時間/30秒刻みでtest_tile_dryです。
長い要求の予算を前半へ集中できる点が原因なので、供給の時間配分を整理してください。

F2: 純CaO56080 mg＋水15000 mgの消化で、5秒刻み47281 J、1秒刻み45845 J（約3.04%差）。
生成物も69292/68891 mgで約0.58%違います。0.2%の適用範囲と誤差制御を確認してください。

F3: d5a853fの焼成running状態を1f7538fへ渡すと、同じschema /1・工程版0.1.0なのにfailedになります。
startMs等の追加に合わせ、状態の移行またはschema更新と旧状態の扱いを明示してください。

科学側・mainの実装はCodexから変更していません。修正はそちらの科学ブランチでお願いします。
本体への統合判断は、残件の確認と本体側の最終レビュー後にしてください。
```
