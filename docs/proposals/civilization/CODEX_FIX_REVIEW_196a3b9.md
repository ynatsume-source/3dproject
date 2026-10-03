# 196a3b9の修正確認

2026-10-03 JST。対象は `codex/civilization-simulation` の
`196a3b9c7a7fa5e6b70f62e808efcae08e370a9d`。独立したdetached worktreeで検証した。

## 結論

**cd096e2で残したS1と格子の原点の補足は、いずれも対応確認済み。今回の再レビューに追加指摘はない。**
F1・F2・元のF3は前回確認済みで、今回も同じ診断条件で結果が維持されている。
このレビュー系列の残件は解消し、本体側の最終レビューへ渡せる。
本体への統合や0.2.0契約案の採択は、本体側の判断後に小さな機能単位で行う。

## S1: 浸漬の状態スキーマ

`soak.ts` は `civ-sci.tile-soak/2` に更新されている。
既存の [science-review-e118e9f.repro.mjs](review/science-review-e118e9f.repro.mjs) を変更せず、
新checkoutを指定して実行した。
`1f7538f` が実際に返した各工程のrunning状態をJSON往復し、工程版0.2.0の連続区間へ渡した結果：

| 工程 | 新規状態 | 旧 `/1` 状態 |
|---|---|---|
| 乾燥 | `civ-sci.drying/2` | failed、unsupported-state-schema |
| 試験片の焼成 | `civ-sci.tile-fire/2` | failed、unsupported-state-schema |
| 浸漬 | `civ-sci.tile-soak/2` | failed、unsupported-state-schema |
| 石灰の焼成 | `civ-sci.lime-calcine/2` | failed、unsupported-state-schema |
| 消化 | `civ-sci.lime-hydrate/2` | failed、unsupported-state-schema |

5工程とも拒否時の消費・生成・放出は空で、診断全体の `validateResult` 違反は0件。
新しい回帰検査F3にも5工程の新規 `/2` と旧 `/1` 拒否が含まれている。

## 格子の原点

ALIGNMENT §10と0.2.0契約案に `runStart + n × 30秒` が明記された。
本体への推奨はrun開始を世界時計の30秒境界にそろえることで、そろえられなければ開始相対の境界を使う。
浸漬は閉じた式なので積分格子が不要という説明も、現在の実装と一致する。

回帰検査Gの開始1000 ms・1時間一括対開始相対30秒刻みは、炉・窯の状態とJが完全一致した。
前回診断でも、開始0の全5工程と、開始1000 msの乾燥・炉・窯・消化の相対格子で一致した。
契約案は `git apply --check` 成功。実際の契約ファイルへは適用していない。

## 検証

| 検査 | 結果 |
|---|---|
| science-review-regressions | 48件成功 |
| science-step-check | 36件成功 |
| science-lime-check | 24件成功 |
| science-tile-chain-check | 16件成功 |
| science-clay-check | 52件成功 |
| 型検査、Viteビルド、OG生成 | 成功 |

計176件成功。Viteの将来のnative loaderでの `__dirname` に関する既存警告のみ。
前回診断のF1・F2も維持：炉600 Wは各分割51,840,000 J、窯1000 Wは各分割36,290 mgの乾燥試験片、
消化5秒・1秒は43,928 J、0.737秒は43,929 Jで生成物68,355 mgは同じ。

```sh
node --import tsx docs/proposals/civilization/review/science-review-e118e9f.repro.mjs /absolute/path/to/196a3b9-checkout /absolute/path/to/1f7538f-checkout
```

tsxのあるlab checkoutから実行する。既存診断の終了コード0は実行完了を意味し、結果はJSONで確認する。
今回は `oldStates` の全5件で `freshSchema` が `/2`、`restoreStatus` が `failed` になった。

## 範囲と引き継ぎ

labへの変更はこの確認記録と前回レビューからのリンクのみ。科学側ブランチとmainは変更していない。
`tools/science-lab/`・`data/science/sources.json`・物性値・計算モデルの変更なし。
今回の科学コード差分は浸漬のスキーマ変更だけで、ROADMAPの画面や本体ホストの実動作は検証していない。
実測による校正や任意の材料・設備における誤差上限を、今回の検査で保証するものではない。
本体側では旧状態のrun中止・予約解放と、既に確定した熱使用台帳を区別して確認する。

## Claudeへ渡すプロンプト

```text
196a3b9の再レビューが完了しました。
CODEX_FIX_REVIEW_196a3b9.mdに結果を記録しています。

S1は修正確認済みです。実際の旧保存状態で5工程すべてがunsupported-state-schemaを返し、
新規状態はすべて/2になりました。格子の原点の説明・契約案・回帰検査Gも確認済みです。
176件・型検査・ビルドが成功し、前回のF1/F2診断も維持されています。
このレビュー系列の残件は解消し、追加指摘はありません。

次は本体側の最終レビューへ進めてください。
最終レビュー後、既定の秤量→成形→乾燥の順で、小さな機能単位の統合をお願いします。
0.2.0契約案の採択と旧状態の中止・予約解放は本体側で確認してください。
labは変更しないでください。
```
