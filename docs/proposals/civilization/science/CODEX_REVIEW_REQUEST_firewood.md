# Codex への全面レビュー依頼：薪を積んで乾かす（p15x_firewood_dry 0.1.0）

2026-10-06 / ブランチ `codex/civilization-simulation` / 新しい工程なので全面レビュー（REVIEW_POLICY.md）。

| ファイル | 中身 |
|---|---|
| `src/science/step/firewood.ts` | 工程（島の時計、接続仕様 0.2.x のみ）と `woodEmc` |
| `src/science/params.ts` | `woodPieceMm`・`woodDryTauRefDays`・`woodStackTopM2`・`woodRainCapture`・`woodRainMcMax`（すべて仮定） |
| `data/science/catalog-test-2.json` | 工程 p15x、設備 `firewood_stack`、材料 `rain_water`（drawn のみ） |
| `scripts/science-firewood-check.ts` | 検査 25件 |

手順書：[FIREWOOD_DRY_HANDBOOK.md](FIREWOOD_DRY_HANDBOOK.md)。

## これまでの学びを先に入れたところ

look は物理に触れず、格子の間の look は写しをその時刻まで進めて読む（器 A2）。天気が分からない区間（屋根なしなら雨量も）は計算せず、その後の run は何も観察しない（器 A5）。返した薪は次の工程でそのまま読める。設備の指紋は params をキーで並べる（C3）。run の始まりから 30 秒の固定の格子。

## 特に見てほしいところ

1. **本物らしさ**：平衡含水率（Hailwood–Horrobin、Wood Handbook）の式と係数の転記、切ったばかりの薪が屋根の下で約4か月で 13% になる速さ、太さの2乗、日なたの効き（木の温度＋15 K で局所の湿度が下がる）。一次資料での照合をお願いしたい（Wood Handbook の該当章、薪の乾燥の実測）。
2. **雨**：屋根なしの山にしみこむ雨を `drawn: rain_water`（from air）で入れるのが接続仕様の使い方として正しいか。取り込み 3 割・上限 0.6 の仮定。雨量が分からない屋根なしの区間を計算しない扱い。
3. **質量・熱**：薪＋雨 ＝ 乾いた薪＋蒸気。蒸気の潜熱だけを `src:env-heat:`。雨がしみこむ熱、湿った空気から水を取り戻すこと（扱っていない）の扱い。
4. **返す quality**：`water_ppm` を丸めない比で返す（薪で焼く 0.1.2 と同じ）。読み戻しの一致。

## 再現のしかた

```sh
npx tsx --import ./scripts/node-assets.mjs scripts/science-firewood-check.ts   # 25
npm run typecheck && npm run build
```

## お願い

指摘と診断スクリプトは lab へ。科学側のブランチと main は変更しないでください。修正は科学側で行います。
