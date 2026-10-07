# 薪の乾燥 511f647：修正確認と診断一式の引き渡し

2026-10-07。対象：科学側 `511f6478354d7eacd94037d0c00b3651b936776e`、`p15x_firewood_dry 0.1.1`。

**A1・A2は解消。修正箇所とその影響を確認し、追加のA・Bはない。薪の工程の保留を解除し、本体側の最終レビューへ進めてよい。**
C1は仮定の明記が入ったが、原典表の範囲を述べる文言に訂正が残る。これはC（非保留）。

## 修正確認

| 項目 | 結果 |
|---|---|
| A1：低温外挿で水が負になる | −60 °C・RH95%・水0の元の再現入力で、蒸気0 mg・熱0 J・返却4,000,000 mg・water_ppm 0。湿った薪も動かず、来歴0・観察なし。解消 |
| A2：風速欠測を無風とする | windMsを削除すると水・熱が動かず来歴0・観察なし。明示的な0 m/sなら乾燥・観察あり。解消 |
| 保存と回復 | 既知→風速欠測または範囲外の温度→既知をJSON保存・復元して接続。未計算区間の水は保持され、回復後も来歴不完全・観察なし。返却薪を次のrunへ渡せ、来歴0を保持 |
| 区切り | 未計算区間の一括1時間と17秒要求で状態・精算・熱が一致。前回の正常系診断もそのまま成功 |
| 状態版 | 新しい状態は `/1` のまま。JSON保存・再開は一括と一致。旧版から実際に生成した状態とprocessVersion 0.1.0を送ると `unknown processVersion 0.1.0`、消費・生成・熱なし |

式の直前・直後の温度境界を検査し、−1.1〜98.9 °C × RH 0〜1の1,002,001点でnull・負・非有限は0件。
式の許容範囲と、工程の環境入力が受け付ける気温範囲は別。日なたの木温による判定も確認した。
高温・乾燥・水4 mgの薪でも、蒸発は4 mg以下、状態と返却水分は非負だった。

旧runは**工程版を保持したまま拒否する**方式であり、「旧 `/1` スキーマを一律拒否する」方式ではない。
本体は保存済みrunの版を0.1.1へ書き換えて再開せず、拒否された旧runを中止して予約を解放する既存方針を維持する。
今回、科学側・mainの実装やブランチは変更していない。

## C1：表はRH95%まで。「表の最後の行98%」は訂正する（非保留）

取得して転記した Wood Handbook 2021 Table 4–2 は、RH **5〜95%（19列）**。
98%の行・列はなく、実装は `Math.min(h, .98)` によって**式をh=0.98で評価した値を固定**している。
25 °Cでは、式のRH95%が乾量基準23.6968%、RH98%が26.4152%。「表の最後の行を使用」とは異なる。

訂正文案：

> 原典表の相対湿度は5〜95%。RH98%超では、式にh=0.98を代入した値へ固定する。これは原典表の値ではなく、工程独自の仮定。

対象（すべて科学側511f647の位置）：

- `src/science/step/firewood.ts:30,34`
- `docs/proposals/civilization/science/FIREWOOD_DRY_HANDBOOK.md:30`
- `scripts/science-firewood-check.ts:132–133` の説明
- `docs/proposals/civilization/science/CODEX_REVIEW_REQUEST_firewood.md:42`

98%へ固定する追加仮定を残す判断自体で統合を止めない。今回、乾燥時定数の校正根拠が新たに得られたわけではない。

## 検証と同梱物

- 科学側 `science-firewood-check.ts`：31件成功。
- 今回の修正診断：26確認、失敗0（領域走査はまとめて1確認）。[入力](review/firewood-511f647/review.mjs)、[結果](review/firewood-511f647/result.json)。
- 前回の診断を**書き換えず**511f647へ実行：正常系387確認、失敗0。表361点、返却物の144回の連鎖などを含む。[結果](review/firewood-511f647/original-diagnostic.json)。
- 型検査・Viteビルド・OG生成・journal生成：成功。[ログ](review/firewood-511f647/verification/)。Viteの将来のconfigLoaderに関する警告あり、終了コードは0。

前回届いていなかった一式は [review/firewood-29521cb/](review/firewood-29521cb/) に収録した。
レビュー、診断2ファイル、29521cbの結果、出典候補4件、資料の転記4件、検証ログとMANIFESTを含む。
元のMANIFESTが列挙する15ファイルのSHA-256はすべて一致し、内容は変更していない。
**その中の「未push」「labを変更していない」は前回時点の記録。今回の明示的な依頼に従い、labへ収録して引き渡す。**

資料は [sources.proposed.json](review/firewood-29521cb/data/science/sources.proposed.json) にまとまっており、ルートの `data/science/sources.json` にはまだ反映していない。
記載のevidenceパスは、前回束の `data/science/` 配下を基準に読むこと。取り込む場合は同梱の転記ファイルも合わせて配置する。
SHA-256は**照合事実を転記したJSON**のハッシュで、原典PDFのバイト列ではない。
Wood Handbook・USDAの履歴調査・Maryland報告は取得本文、Fortier 2021は出版社の抄録と一部方法・結果まで。
全件 `calibrationEligible:false`。取得範囲は前回報告のまま区別する。

再実行（tsxをインストールしたcheckoutから。SCIENCE_FIXとSCIENCE_OLDは各コミットを展開した絶対パス）：

```sh
LAB_REVIEW=docs/proposals/civilization/review
node --import tsx "$LAB_REVIEW/firewood-29521cb/review.mjs" "$SCIENCE_FIX"
node --import tsx "$LAB_REVIEW/firewood-511f647/review.mjs" "$SCIENCE_FIX" "$SCIENCE_OLD"
```

`SCIENCE_OLD` は29521cb、`SCIENCE_FIX` は511f647。各ターゲットからも依存関係を解決できる状態にする。
最初の診断はA1・A2の出力を `findings` に記録するため、終了コードだけで修正済みとは判定しない。
今回の診断は修正後の期待結果をassertし、失敗時に終了コード1を返す。

## 次回への申し送り

共通 `wind10m()` を使うタイル乾燥（p12x）、粘土を浸す工程（p10x）、器の漏れ試験（p17x）の欠測扱いは、依頼文の追記どおり**次回の工程別レビュー**へ残す。
今回の保留解除はp15xの修正について。他工程の欠測問題を解消したという意味ではない。

## Claudeへ渡す文

```text
511f647（p15x 0.1.1）の軽い確認が完了しました。A1・A2は解消、追加A/Bなしで保留解除です。
科学側31件、今回26確認、前回診断387確認、型検査・ビルドが成功。
欠測を挟むJSON保存・再開と、返却薪を次runへ渡す形も確認しました。

C1だけ非保留の文言訂正があります。原典表はRH95%までです。
「表の最後の行98%」ではなく「式をh=0.98で評価して、それ以上は固定する独自の仮定」としてください。

前回未着の診断一式と資料候補4件をlabの
docs/proposals/civilization/review/firewood-29521cb/ に収録しました（元の15ファイルのハッシュ一致）。
今回の入口は docs/proposals/civilization/CODEX_FIREWOOD_REVIEW_511f647.md、
診断と結果は docs/proposals/civilization/review/firewood-511f647/ です。
資料候補は束の sources.proposed.json にあり、ルートのsources.jsonには未反映です。
転記JSONのハッシュであって、原典PDFのハッシュではない点も維持しています。

他3工程の風速欠測は次回へ申し送ります。科学側とmainは変更していません。
```
