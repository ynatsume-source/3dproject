# 乾燥方法つき測定記録とダーク表示

2026-10-03 JST。対象は `codex/civilization-lab` の `464e63f` 以降。

## Claudeの追加レビューを受領

科学ブランチ `9e20a2b2474c1dffd04f42334f363496c1641aa0` の
`docs/proposals/civilization/science/CODEX_REVIEW.md` と `ALIGNMENT.md` を確認した。
出典6件と画面が取り込まれ、Variablesの式、湿量/乾量基準、吸水率の定義に合意したことを受領。
前回版についてはClaudeがChromiumで表示・操作と390pxの表示幅を検査済み。

今回の担当は、追加依頼のあった検証画面と、その測定記録の受け渡し。
`tools/science-lab/` とこのCodex側記録に限定する。
`src/science/`、本体、共通契約、科学側の `docs/proposals/civilization/science/`、
旧 `experiments/`、出典台帳・カタログは編集しない。
作業開始時のmainは `aba474396dadc88c011c9f354206f16b12f1f13a`、labは `464e63f`。
未公開のClaude作業までは確認できないため、公開済みファイルと明示された担当範囲で分離する。

## 変更内容

1. OSのダーク設定に応じてページ、入力欄、注意書き、結果、リンク、ボタンの配色を変える。
2. 試料ID、値の由来、乾燥方法、乾燥条件・終点、測定メモを記録できる。
3. 入力と計算結果を同じJSONへ書き出す。手元への明示的なダウンロードだけで、サーバーや世界の保存には接続しない。
4. 計算後に数値・条件を変えると保存を無効にする。再計算してから保存するので、条件と計算結果の取り違えを防ぐ。
5. 欠測は `null`、乾燥方法の未記録は `unrecorded` として残す。温度や終点は推定しない。
6. 実測と自己申告しても `evidenceStatus: unverified-user-entry`、`calibrationEligible: false` を維持する。
7. faviconに空のdata URLを指定し、不要な404をなくす。

算術の定義・数値は変更していない。`measurements.mjs` は既存の入力欄一覧を読み取り用に公開しただけ。
記録の形式と使い方は [README](../../../tools/science-lab/README.md) を参照。
READMEの出典照合リンクは、科学側ブランチにCODEX文書がなくても読める固定GitHub URLへ変更した。

乾燥方法を変えても乾燥質量を補正しない。常温平衡と加熱乾燥の差をモデルが推定する機能ではない。
この記録は単一試験片の計算メモであり、実測時系列データの受入規格やScienceStepの新バージョンではない。
JSONの再読み込み・自動保存はこの版にはない。

## 原典・実測データの探索結果

必要条件を満たす新しい本文・数値列は取得できていないため、`sources.json` に追加はない。

- GitHubで `clay drying experiment`、`kaolinite desiccation`、`ceramic absorption experimental`、
  `clay drying dataset`、`desiccation data`、`clay evaporation`、`ceramic drying`、`kaolinite thermal` を検索。
- 本文検索も `Bigot curve clay`、`kaolinite drying curve`、`clay desiccation experimental data` を確認。
  検索結果には無関係な語彙一覧、他分野のデータ、転載断片が含まれ、粘土の係数の出典には採用しなかった。
- USGSへのHTTPSは通常のサンドボックスではプロキシ接続エラー。
  ネットワーク権限を付けた再試行では接続したが、HTTP 403 / `Your request was blocked.` で本文を取得できなかった。
  制限を回避する取得はしていない。GitHub上の範囲だけの探索であり、文献が存在しないという結論ではない。

今後も、材料・調製・温湿度・時刻ごとの質量/寸法・反復回数をそろえた一次資料を探す。
新しい記録欄がそろっていても、出典・測定器の精度・試料の同一性・時系列の完全性は別に照合する必要がある。

## 検証

- 既存の計算6件と新規の記録8件：成功。
- `node --check tools/science-lab/app.mjs`、rootの `npm run typecheck`、Viteビルド・OG生成：成功。
  OG生成は `node --import tsx --import ./scripts/node-assets.mjs scripts/og-pages.ts` で実行。
- Chromium 151で明暗×幅390/1280pxの4通り：出典10件、計算7指標、JSONダウンロード、
  条件のみ変更した場合の保存無効化、入力エラー、リセット、未記録の出力を確認。
- メモのHTML風文字列は文字として表示し、実行されないことを確認。コンソールエラー0、横はみ出し0。
- 通常文字・補足文字・入力文字はそれぞれの背景とのコントラスト比4.5以上を確認。
- ブラウザテストはリポジトリ内のファイルだけをPlaywrightのルートで応答し、外部通信なしで実行。
  通常のサンドボックスではChromiumのIPCが拒否されたため、承認された実行権限で確認した。
- Safari/Firefox、端末実機、複数試料の取り込み、物理モデルの実測一致は未検証。

## Claudeへ渡すプロンプト

```text
ynatsume-source/3dproject の codex/civilization-lab で、464e63f以降をレビューしてください。
CODEX_MEASUREMENT_RECORD_REVIEW.md（docs/proposals/civilization/内）とtools/science-lab/README.mdを読んでください。

追加依頼に合わせ、ダーク配色と乾燥方法・条件・終点の記録欄を作りました。
測定値と条件をJSONへ保存でき、変更後は再計算まで保存できません。
欠測はnullのまま、実測との自己申告でも未確認・校正不可として出力します。
世界の状態・物理係数・ScienceStep・出典台帳は変更していません。

計算6件＋記録8件、Chromiumの明暗×390/1280pxで表示・保存・エラー処理を確認しました。
tools/science-lab/の差分だけを選択的に取り込んでください。lab全体はmergeしないでください。
原典・実測時系列は新たに取得できておらず、sources.jsonへの追加はありません。
引き続きCodexはlabだけへpushします。
```
