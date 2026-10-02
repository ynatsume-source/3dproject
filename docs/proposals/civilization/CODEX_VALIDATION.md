# 初回検証記録

2026-10-03（JST）。Node 24.19.0。基準main `41ccd18`、契約0.1.0。

| 検査 | 結果 |
|---|---|
| `npm --prefix experiments/civilization-simulation test` | 33件成功。うち1件で厚み4×出力3×残量3＝36条件を検査 |
| `npm --prefix experiments/civilization-simulation run typecheck` | ラボと `src/science` のstrict型検査成功 |
| `npm run typecheck` | 本体型検査成功 |
| `node experiments/civilization-simulation/demo.mjs` | 2試料の研究比較・途中保存/復元が完走 |
| Vite本番ビルド＋OG生成 | 成功（後述の同等コマンド） |
| 引き継ぎカタログ | 82件、全てconcept-only、原文blob SHA `1483ac6f693634d8ce38f07a793db87e06d12135` と一致 |
| `git fsck --connectivity-only` | Git履歴の接続確認成功 |

`npm run build` はVite部分まで成功するが、後段のtsx CLIがこのサンドボックスでIPCソケットを開けず `EPERM`。
同じOG生成スクリプトを、ソケットを作らないNode loader経由で実行して確認した。設定や既存package.jsonは変更していない。

```sh
node node_modules/vite/bin/vite.js build
node --import tsx --import ./scripts/node-assets.mjs scripts/og-pages.ts
```

ラボテストは `node --import tsx test/simulation.test.mjs` でnode:testを実行し、33件を個別に報告させる。
環境の `node --test` 子プロセス経由ではファイル単位の1件表示になったため、この実行方法を使った。

## 科学・再開・失敗の検査

材料のmg収支、加熱+潜熱の手計算対照、蒸気に移る顕熱、冷却、有限供給量とW上限、熱源の温度上限、時間不足を検査。
失敗・取消でも固体/残水/熱の行先を保持する。材料/設備の予約競合、重複コマンド、古いepoch/version、負値/NaN/Infinity、途中のJSON保存/再開、時間区間の分割を検査。
未知の工程・契約/工程/カタログ/状態版、本世界環境、不正な単位を拒否する。計器なしに真の含水量を観測として渡さない。

## 比較結果

両試料：固体100 g＋自由水20 g。温度20→60°C、熱源100 W、加熱+蒸発上限2400秒。

| 厚さ | 観測した最終質量 | 乾燥工程の使用熱源エネルギー | 結果（冷却込み所要時間） |
|---|---:|---:|---|
| 5 mm | 100.0 g | 66,686 J | 完了、2402秒 |
| 10 mm | 108.4 g | 42,086.75 J | 時間上限、2862秒。途中試料は保持 |

100 mg分解能の測定値なので、内部の自由水量と最後の桁は一致しない。
2試料合計の水蒸気31,590 mg、固体/水の収支差0 mg、エネルギー収支差は約 `7.4e-10 J`（許容 `1e-6 J`）。
全使用エネルギー109,052.75 Jには成形の仕事240 Jと秤の電力40 Jも含む。乾燥熱源の残量は91,227.25 J。
再現可能な機械可読出力：[demo-result.json](validation/demo-result.json)。

## 実施していない検証

実粘土の実測・焼成/割れ/吸水/強度の評価、現地資源確認、実燃料の燃焼モデル、サーバーとの実接続、DB transaction、共有本番の保存移行、ブラウザ描画・性能、AI創造性評価。
新しいコードを本体からimportしていないため描画や保存の新動作はない。これは実世界の乾燥時間や製品性能の妥当性を示す検証ではない。
