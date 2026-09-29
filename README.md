# Seaglass

実在の海を再現した海中を、ドローンでゆっくり巡る Web アプリ。
現地の太陽・月・潮の位置に合わせて光と流れが変わり、作業中の環境映像として流しっぱなしにできます。

## 開発

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ に出力
npm run typecheck
```

`main` への push で GitHub Actions がビルドし、GitHub Pages に公開します
（リポジトリの Settings → Pages → Source を「GitHub Actions」にしておく）。

## 構成

| パス | 役割 |
| --- | --- |
| `src/main.ts` | モード切替（地球儀 ⇄ 海中）、ドローン、HUD、入力、ループ |
| `src/time/` | シミュレーション時計、太陽・月の位置、潮汐、朝方/昼間/夕方/夜間プリセット |
| `src/data/locations.ts` | 海ごとの地形関数・水の色・サンゴ構成・生きもの |
| `src/ocean/` | 共通の海中風景、サンゴ・魚・ウミガメ・マンタのモデル、海の構築と行動 |
| `src/render/common.ts` | 共有 uniform と水中ライティングの GLSL |
| `src/globe.ts` | 実際の太陽で照らされる地球儀 |
| `src/audio.ts` | 環境音（夜はテッポウエビのパチパチ音が増える） |

## 操作

| 操作 | キー |
| --- | --- |
| 地球儀へ戻る | `G` / `Esc` |
| 時刻パネル | `T` |
| 朝方 / 昼間 / 夕方 / 夜間 | `1` `2` `3` `4` |
| 実時間に戻す | `0` |
| 図鑑 | `Z` |
| 自動巡航 ⇄ 手動操縦 | `P` |
| 移動 / 上昇・下降 / 加速 | `WASD` / `E` `Q` / `Shift` |
| ライト / 環境音 / HUD / 全画面 | `L` / `M` / `H` / `F` |

地球儀の陸地は Natural Earth 1:50m（world-atlas）から作ったマスクです。
