# Codex への全面レビュー依頼：器を形づくる・乾かす（p11y_pot_shape 0.1.0、p12y_pot_dry 0.1.0）

2026-10-07 / ブランチ `codex/civilization-simulation` / 新しい工程なので全面レビュー（REVIEW_POLICY.md）。本体の依頼1（器を焼く）の前半。

| ファイル | 中身 |
|---|---|
| `src/science/step/pottery.ts` | 2つの工程、器の形と面積、壁の下限 |
| `src/science/physics.ts` | `dryPhysics` に任意の入力（`areaM2`・`fluxFactor`・`crackFactor`・`fallingSlow`）。**main に統合済みのファイル**：試験片の結果は変わらないこと |
| `src/science/params.ts` | `pot*` の9定数（すべて仮定） |
| `data/science/catalog-test-2.json` | 工程2つ、材料 `green_pot`・`dry_pot`、`drying_rack` の `covered` |
| `scripts/science-pottery-check.ts` | 検査 36件 |

手順書：[POTTERY_HANDBOOK.md](POTTERY_HANDBOOK.md)。設計とオーナーの決定：[POT_FIRING_DESIGN.md](POT_FIRING_DESIGN.md)。

## これまでの学びを先に入れたところ

器の形は最初の依頼の `plan` 1回だけ（開始時のレシピ。A1）。格子の間の look は写しで読む（A2）。分からない天気（風の欠測を含む）は計算せず、その後は観察しない（A5・薪 A2）。返した湿った器は次の run で乾かせる。設備の指紋は params をキーで並べる。組成は共通の `tileComp`・`tileQuality`。

## 特に見てほしいところ

1. **本物らしさ**：紐づくりの器の大きさと粘土の量、壁の厚さの下限、成形できる含水比の幅、器が乾くまでの日数（日陰で約5日、葉で覆って約2週間）と、急いで乾かすと割れる割合（暑い日なたで約半分）。一次資料（民族誌の土器づくり、乾燥の時間と割れ）で照合してほしい。
2. **`fallingSlow`**：革のかたさの後の乾燥を壁の厚さの2乗で遅くした。これがないと器が1日で乾ききる。仮定の置き方として妥当か。試験片にも同じ遅さがあるべきか（今はない）。
3. **共通の `dryPhysics` の変更**：任意の入力を足しただけで、試験片の結果は変わらない（main の版と新しい版を、ランダムな入力 20万通りで比べて出力が完全に一致）。
4. **質量**：粘土 ＝ 器 ＋ 残りの粘土（化学種ごとに比で分け、切り捨て、残りは残りの粘土へ）。器 ＝ 乾いた器 ＋ 蒸気。読み戻し。
5. **形にならないとき**：粘土がそのまま戻り、手の仕事は使われる（失敗も手間はかかる）。

## 再現のしかた

```sh
npx tsx --import ./scripts/node-assets.mjs scripts/science-pottery-check.ts   # 36
npx tsx --import ./scripts/node-assets.mjs scripts/science-clay-check.ts      # タイルの乾燥が変わらない
npm run typecheck && npm run build
```

## お願い

指摘と診断スクリプトは lab へ。科学側のブランチと main は変更しないでください。修正は科学側で行います。
