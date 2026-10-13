# 基準撮影と検証結果（2026-10-12）

**造形の変更前だけを撮影した記録。改善後画像ではない。** Libraryの参考画像5件は取得できず、未確認のまま。通常アプリのソース変更はゼロ。

## 基準画像

合成saveは薪24kg、屋根あり、家の近くの実在する森林の木1本を伐採済みに設定したもの。自然な生活で到達した保存ではない。元のアプリを新規ブラウザで読み、時刻とカメラを固定して撮影した。

| 画面 | 昼12:00 | 夕17:45 | 夜20:30 |
|---|---|---|---|
| 1280×720 / high | [昼](evidence/desktop-day.png) | [夕](evidence/desktop-evening.png) | [夜](evidence/desktop-night.png) |
| 390×844 / medium | [昼](evidence/phone-day.png) | [夕](evidence/phone-evening.png) | [夜](evidence/phone-night.png) |

6枚とも実ファイルを開いて確認した。引いた構図では薪の占める面積が小さい。現行mainの夜は棚の判別が難しい。切り株専用の近接構図は未撮影。この基準構図では、薪の細部だけの変更を加えても視聴時の差が小さい可能性がある。次段では棚・手元の画面内の大きさと夜の見やすさを判断材料にする。自然枝の夜間照明変更は未統合であり、この画像には入っていない。

## 測定

Chromium 151.0.7922.173、ANGLE Vulkan SwiftShader、DPR 1。**実機GPUの性能・FPSではない。** 全描画パスのcalls/triangles合計。フレーム時間はCPU処理・命令発行・GPU完了待ち・1画素readbackを含む同期時間。

今回の基準撮影は `WARM=4 SAMPLES=3` の短い再現確認。既定の20フレーム準備・6サンプルより少なく、露出・炎などの時間変化が落ち着いた状態を保証しない。初回コンパイル等の外れ値も含め全サンプルを[生ログ](evidence/baseline-report.json)に残した。少数サンプルの中央値を採用したが、性能改善の根拠にはしない。

| ケース | draw calls | triangles | 同期時間中央値（ms） | サンプル（ms） |
|---|---:|---:|---:|---|
| desktop-day | 976 | 12,471,592 | 12,594.4 | 12,562.7, 14,023.1, 12,594.4 |
| desktop-evening | 976 | 12,471,592 | 13,806.8 | 13,806.8, 13,818.3, 13,280.4 |
| desktop-night | 983 | 12,471,667 | 13,523.7 | 14,071.7, 13,329.9, 13,523.7 |
| phone-day | 944 | 11,858,416 | 6,056.4 | 6,056.4, 5,933.6, 6,246.2 |
| phone-evening | 944 | 11,858,416 | 6,181.1 | 29,436.5, 5,822.2, 6,181.1 |
| phone-night | 946 | 11,858,456 | 6,395.8 | 6,395.8, 6,700.2, 6,225.4 |

6条件すべてpage/shaderエラー記録なし。棚の実量24kg、8モデル分の表示条件、棚のwater_ppm 450000は同じ。野焼き・煮沸runはない。夜の火は既存の夜の集まりの時刻による表示で、棚の薪の消費量を意味しない。

## 検証

- `npm run typecheck`: 成功。
- `npm run build`: 成功（[ログ](evidence/build.log)）。撮影は別途 `vite build --minify false`。
- `npm run check:fast`: 37件すべて合格（[一覧](evidence/check-fast.log)、[JSON](evidence/fast-results.json)）。既存検査の変更・緩和なし。
- 既存 `fell-check.ts`: 全項目合格（[ログ](evidence/fell-check.log)）。
- 表示境界の5検査: 合格（[ログ](evidence/state-tests.log)）。棚の実量と予約中の扱い、表示上限、乾燥途中の内部値を表示に使わないこと、野焼きの表示優先、森林と若木の区別。
- 新規世界60秒の2回実行で、乱数消費数/ハッシュ・生活トレースSHA・保存SHAが一致。`buildRandom.draws=598832`、60秒後 `draws=599248`。撮影用fixtureの合成状態ではなく、変更していない新規世界での確認。

60秒の指紋は [1回目](evidence/fingerprint-a.json) と [2回目](evidence/fingerprint-b.json) に保存した。

## 同一ビルドの再比較（A/A）

スマホ昼だけを、同じ合成save・`WARM=4 SAMPLES=3` で新規ブラウザに読み直した。[再撮影画像](evidence/aa-repeat-phone-day.png)、[再撮影ログ](evidence/aa-repeat-report.json)、[比較結果](evidence/aa-comparison.json)。6条件すべての再比較ではない。

比較器はsave指紋（準備後/測定後）、カメラ、時刻、解像度、画質、モデル数、乱数指紋、表示境界の一致を確認した。callsは944、trianglesは11,858,416で一致。同期時間中央値は6,056.4→6,343.0ms、比1.0473。同じコードでも約4.7%揺れるため、改善・悪化の結論にはしない。

画像はビット単位では一致しない。[画素差](evidence/aa-pixels.json)は329,160画素中19,916画素（約6.05%）に差があり、平均絶対チャンネル差0.125/255、最大15/255。原因は未特定。条件と生活状態の一致を確認した範囲にとどめ、微小な画素差を造形の効果とみなさない。

比較器にカメラ・保存指紋・乱数回数を各々1項目変更した入力を渡すと、すべて不一致として拒否した（[ログ](evidence/comparison-negative.log)）。

```sh
# 上の6条件の撮影、または1条件のA/Aを再現する設定
WARM=4 SAMPLES=3 FIXTURE=docs/proposals/firewood-study-2026-10-12/evidence/fixture.json OUT=check-results/firewood-before CHROME=/usr/bin/chromium node tools/lab/firewood-capture.mjs
CASE=phone-day WARM=4 SAMPLES=3 FIXTURE=docs/proposals/firewood-study-2026-10-12/evidence/fixture.json OUT=check-results/firewood-repeat CHROME=/usr/bin/chromium node tools/lab/firewood-capture.mjs
node tools/lab/firewood-compare.mjs check-results/firewood-before/report.json check-results/firewood-repeat/report.json phone-day
```

造形変更、実際の薪運搬、進行中工程の描画、切り株の接写、長時間配信、実機・Windows ANGLE、ちらつきの確認は未実施。参考画像の取得制約を解除できるまで造形実装は保留する。[取得状態](evidence/reference-status.txt)と[表示境界・運搬案](README.md)を参照。
