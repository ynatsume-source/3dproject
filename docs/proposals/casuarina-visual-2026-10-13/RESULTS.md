# 植物の限定試作: 比較結果（未採択）

基準main `c29829f53a2e19852ced6650ecefdff34473edbc`。浜のモクマオウ、家の若木5本、実際の立木を引き継ぐ倒木だけの試作。mainへの統合・公開はしていない。

## 保存・行動の確認

同じ合成保存・seed・時刻・カメラの全10条件で、開始／終了保存ハッシュ、乱数の回数と指紋、世界状態が厳密一致した。ヘッドレスでも配置・当たり、60秒の生活、伐採の実量、片付け後の保存と乱数が一致。他の植物・岩・流木のgeometryハッシュは不変。

初回案では旧葉材質がシェーダー準備の走査から消え、16回分のUUID乱数が減り、続く行き先探索が変化した。これを検出して撮影を中止。非表示Meshで旧材質を保持し、その構築UUID分を補償から差し引いた。検査条件は緩めていない。診断: [棄却した案の乱数差](evidence/rejected-browser-rng-diagnosis.json)。

## 画像

| 条件 | 基準main | 試作 |
|---|---|---|
| desktop-home-wide-day | [before](evidence/before/desktop-home-wide-day.png) | [after](evidence/after/desktop-home-wide-day.png) |
| desktop-home-wide-night | [before](evidence/before/desktop-home-wide-night.png) | [after](evidence/after/desktop-home-wide-night.png) |
| desktop-home-near-day | [before](evidence/before/desktop-home-near-day.png) | [after](evidence/after/desktop-home-near-day.png) |
| desktop-home-near-night | [before](evidence/before/desktop-home-near-night.png) | [after](evidence/after/desktop-home-near-night.png) |
| desktop-beach-day | [before](evidence/before/desktop-beach-day.png) | [after](evidence/after/desktop-beach-day.png) |
| desktop-beach-night | [before](evidence/before/desktop-beach-night.png) | [after](evidence/after/desktop-beach-night.png) |
| desktop-falling-day | [before](evidence/before/desktop-falling-day.png) | [after](evidence/after/desktop-falling-day.png) |
| desktop-falling-night | [before](evidence/before/desktop-falling-night.png) | [after](evidence/after/desktop-falling-night.png) |
| phone-home-near-day | [before](evidence/before/phone-home-near-day.png) | [after](evidence/after/phone-home-near-day.png) |
| phone-home-near-night | [before](evidence/before/phone-home-near-night.png) | [after](evidence/after/phone-home-near-night.png) |

## 描画負荷

1280×720 high／390×844 medium、SwiftShader、暖機2フレーム・標本3。全描画パスと同期readbackの時間。実機GPUのFPSや長時間配信性能を示す数値ではない。環境負荷による揺れがあり、下表の相対値だけで実機の高速化／低速化を断定しない。

| 条件 | calls 前→後 | triangles 前→後 | median ms 前→後 | 相対時間 |
|---|---:|---:|---:|---:|
| desktop-home-wide-day | 976 → 956 | 12,471,592 → 13,645,732 | 23884.0 → 27171.9 | 1.138× |
| desktop-home-wide-night | 983 → 963 | 12,471,667 → 13,645,807 | 23202.4 → 27151.2 | 1.170× |
| desktop-home-near-day | 981 → 961 | 12,516,272 → 13,690,412 | 24593.3 → 24524.0 | 0.997× |
| desktop-home-near-night | 988 → 968 | 12,513,451 → 13,687,591 | 23404.6 → 25777.1 | 1.101× |
| desktop-beach-day | 915 → 910 | 12,713,162 → 13,888,346 | 20158.2 → 21844.0 | 1.084× |
| desktop-beach-night | 917 → 912 | 12,713,202 → 13,888,386 | 19379.4 → 20776.9 | 1.072× |
| desktop-falling-day | 971 → 959 | 12,340,222 → 13,518,762 | 25139.6 → 36550.3 | 1.454× |
| desktop-falling-night | 973 → 961 | 12,340,262 → 13,518,802 | 29047.2 → 22702.0 | 0.782× |
| phone-home-near-day | 955 → 944 | 11,897,412 → 13,072,272 | 9999.3 → 9484.8 | 0.949× |
| phone-home-near-night | 967 → 956 | 11,895,827 → 13,070,687 | 10407.0 → 13312.7 | 1.279× |

モクマオウ単体の三角形は3,336→6,696。若木は5本を維持し、共有形状への変更で描画Meshが減る。非表示の旧材質保持Meshは描画回数に加算されない。

## 微小移動のちらつき

1/4画素相当の横移動4フレームで輝度2階差分を比較した限定診断。細い枝葉の全距離・全端末・動画品質を保証するものではない。

| 条件 | >0.12 前→後 | >0.25 前→後 |
|---|---:|---:|
| desktop-home-near-day | 0.4663% → 2.2220% | 0.1463% → 0.4125% |
| desktop-beach-day | 0.3784% → 0.6492% | 0.0479% → 0.0718% |

## 検証と限界

- 型検査・build・fast42件、fell／nav／wall、shader6条件（planet・kayama・gbr各low/high）が成功。wallのテスト条件・判定は変更していない。最終headのCI結果はPRに記載。
- 倒木は周囲の立木に一部隠れる構図。画像だけでは全形状を判定しにくいため、立木のgeometryと行列の継承、共有geometryを破棄しないことをfixtureで別途検証。
- 夜の倒木は、基準mainの夜間taskが完了しなかったため、固定した昼の世界時刻で伐採処理を完了させ、夜の表示時刻で撮影した。自発的な夜間伐採を検証したものではない。元失敗ログも保持。
- 保存は合成fixtureのみ。既存ユーザー保存・秘密情報・実AI APIは使っていない。外部画像の再取得はしていない。
- 依存Three.jsのUUID消費と既存shader準備経路に依存する局所互換処理。依存更新・準備処理変更時には指紋を再検証する必要がある。大きな乱数設計変更は行っていない。
- 実機GPU、Windows ANGLE、長時間運転、すべての保存状態／画角、slow検査の全体実行は未確認。既存の背景森林・他の丸い茂みは今回の対象外。

## 評価と次案

丸い葉玉を外し、若木と成木を同じ樹種として読める輪郭にする効果は確認できる。ただし近景・浜の両方で微小移動のちらつき指標が悪化した。このまま24時間配信向けに採用することは勧めず、draftで保留する。

次案は対象を増やさず、細い独立帯を減らして太めの枝葉のまとまりにする小さな形状試験。今回の固定カメラ・保存とちらつき診断を再利用し、実機動画で輪郭の安定性を確認してから採否を判断する。今回、その追加実装はしていない。

[比較JSON](evidence/comparison.json) · [手順と対象範囲](README.md)

## 成果物の保存

比較画像20枚のLibrary保存を現行の一括保存手順で1回試したが、接続エラーで失敗した（保存成功は確認できていない）。画像はこのリポジトリの`evidence/before`／`evidence/after`に保存し、PRには固定commitの結果資料へのリンクを記載する。参考Library画像の取得は再試行していない。
