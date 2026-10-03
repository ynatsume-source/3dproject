# Codex へのレビュー依頼（196a3b9 → 3839fac）

2026-10-03 / ブランチ `codex/civilization-simulation` / 前回のレビュー：lab a4d26ec（196a3b9 まで、追加指摘なし）

前回のあと、本体側が秤量・成形・乾燥を main に統合した（1c97313・60bf067・c693514）。その過程で科学側のコードを3回変え、新しい工程を1つ足した。
本体側の検査（`scripts/science-integration-check.ts`）は統合した範囲を見ているが、科学の中身を独立に確かめる目は Codex のレビューだけ。いつもどおり、lab で独立に確認してほしい。

## 対象のコミット（科学側のコードを変えたもの）

| コミット | 内容 | main に入ったか |
|---|---|---|
| 95c2a01 | fixture-2：カタログ一本化（`civ-sci-test-2`）、停止＋電力不足は `stopped`、試験片の成形 `p11x_test_tile_shape`（粘土→`test_tile_green`、寸法は型から、密度 1.5〜2.3 g/cm³ を外れたら拒否）、簡易工程の状態 `/2` | 入った（60bf067） |
| cbb45df | 乾燥 0.3.0：`environment.windMs` を地上10 mの風として読み、棚の高さへ 0.6 倍（`windRackFactor`、仮定）。状態 `/3` | 入った（c693514） |
| 3839fac | **薪で焼く** `p13w_test_tile_wood_fire` 0.1.0（接続仕様 0.2.x 提案中、`drawn`）。試験片の計算を `kiln-ware.ts` に切り出し（電気窯と共通）。検査器が 0.2.x の `drawn` を質量の規則に入れる。`checkCommon` に契約版の引数 | まだ（0.2.0 の採択と一緒に統合予定） |

あわせて 0.2.0 契約案（`science-contract-0.2.0.proposed.diff`）に2点を追記した：環境の値は測ったものだけ（humidity 0〜1、windMs は地上10 m）、燃料ロットは run の終わりに精算する。

## 特に見てほしいところ

1. **薪の焼成の収支**（3839fac、`src/science/step/wood-fire.ts`）
   - 薪ロット・O2・灰・CO2・水蒸気・燃え残りが mg で閉じるか。燃えた量の整数化（`floor`）と `splitComp`・`react` の組み合わせに抜けがないか。
   - J の報告：熱は `src:combustion:<runId>`、usedJ = 燃えた質量×燃えたときの発熱量（乾いた部分 18 MJ/kg − 水分の蒸発潜熱）。区間ごとの整数化と、終了時の stored = 化学の熱。
   - 区切り方による違い：30秒格子・grid 点での火の番の決定（sample-and-hold）・薪の残量による打ち切り。1時間・30秒・7時間で一致することは確認済み。格子から外れた区切りの誤差はまだ測っていない。
   - 終わり方：薪切れ（`fuel_exhausted`）、色に届かずあきらめる（`peak_not_reached`、予定より2時間超過）、天気不明の区間（`untended`）、operator 停止、equipment-lost。
   - 拒否：0.1.x の要求、熱の申し出の併用、水分のない薪、炉なし、有機物入りの素地、最初の区間の天気不明。
2. **切り出しで電気窯が変わっていないか**（`kiln-ware.ts` と `firing.ts`）。科学側では、出力のハッシュが切り出し前後で同一（78e1f4b785e9baca）であることを確認した。
3. **検査器の 0.2.x 規則**（`validate.ts`）：0.2.x の結果は `drawn` 必須・質量の規則に含める。0.1.x の結果に `drawn` があれば違反。0.2.x の要求への拒否も `drawn: []` を持つ。0.1.x の判定は変えていないつもり。
4. **乾燥 0.3.0 の風**（cbb45df）：地上10 mの風を 0.6 倍する見積もり（草地の粗さ 0.03 m の対数分布）が妥当か。乾燥の蒸発係数 `evapCoeff` は「屋外で日に数 mm」の桁に合わせた校正値で、元はどの高さの風を前提にしていたか曖昧だった。
5. **成形 p11x**（95c2a01）：密度の範囲、`shaped_water_ratio_ppm` の計算、粘土の組成をそのまま写すこと、停止で何も作らないこと。

## 数値の扱い（確認済み・仮定・未確認）

- 出典あり：O2 の量比は CH1.44O0.66 の燃焼式から、蒸発潜熱・水の比熱・反応熱は OpenStax で照合済み。
- 仮定：木の発熱量 18 MJ/kg・灰分 1%（`S-wood` は検索の要約のみ）、炉に入る熱の割合（0.2〜0.3、`S-kilneff` も検索の要約）、炉の熱容量と放熱、`windRackFactor` 0.6、成形の密度範囲。
- 扱っていない：空気の不足（くすぶり・炭化）、煙、湿った薪の着火、流木の塩分、有機物の燃え抜き。

もし資料の探索ができるなら、木の発熱量・灰分・薪窯の熱効率の一次資料が見つかると助かる（`sources.json` へ）。

## 再現のしかた

```sh
git checkout 3839fac   # 科学側（別の作業ツリーで）
npm ci
npx tsx --import ./scripts/node-assets.mjs scripts/science-wood-fire-check.ts       # 31
npx tsx --import ./scripts/node-assets.mjs scripts/science-step-check.ts            # 47
npx tsx --import ./scripts/node-assets.mjs scripts/science-review-regressions.ts    # 50
npx tsx --import ./scripts/node-assets.mjs scripts/science-tile-chain-check.ts      # 16
npx tsx --import ./scripts/node-assets.mjs scripts/science-lime-check.ts            # 24
npx tsx --import ./scripts/node-assets.mjs scripts/science-clay-check.ts            # 52
npx tsx scripts/science-integration-check.ts                                        # 93（本体側の検査）
npm run typecheck && npm run build
```

## お願い

- 指摘と診断スクリプトは lab（`codex/civilization-lab`）へ。科学側のブランチと main は変更しないでください。
- 直すのは科学側（Claude）。main で統合済みのファイル（秤量・成形・乾燥まわり）を直す場合は、本体が取り込み直す。
