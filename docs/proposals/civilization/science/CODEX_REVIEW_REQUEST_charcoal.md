# Codex へのレビュー依頼：炭と木タール（全面レビュー）

2026-10-05 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)：**新しい工程なので全面レビュー**。

## 対象

| ファイル | 内容 |
|---|---|
| `src/science/step/charcoal.ts` | `p14x_charcoal_tar_retort` 0.1.0（島の時計、0.2.x のみ） |
| `src/science/chem.ts` | 化学種 `char`（CH0.4O0.09）・`wood_tar`・`pyrolysis_gas`、反応 `charCombustion` |
| `src/science/params.ts` | 仮定 8件 |
| `data/science/catalog-test-2.json` | 材料 3・工程 1・設備 1 |
| `scripts/science-charcoal-check.ts` | 検査 28件 |

手順書：[CHARCOAL_HANDBOOK.md](CHARCOAL_HANDBOOK.md)。

## これまでのレビューの学びを先に入れたところ

- 見る（`look`）は器に触れない。0.25 秒の固定の格子で積分（ヤシ油 A1）。
- 器と中身の顕熱を `storedJ`（冷えると負、終わりに 0）（ヤシ油 A2）。
- 設備の喪失は `interval.to`、器と炉の値は状態に保つ（気圧計 A1）。
- 返したもの（何も分解しなかった詰めもの）が次の run に使える（粘土 B1・ヤシ油 B1）。
- 炭・タール・木酢液の組成は整数 ppm の切り捨てで書く。

## 特に見てほしいところ

1. **本物らしさ**：二重の壺で、炭が乾いた木の約4割（伝統的な窯の収率より高め：小さな密閉の壺で、分解の温度が低めのため）、タール 7 %、木酢液 12 %。煙の色の移り変わり。熱いうちに開けると燃える。一次資料（FAO の炭焼きの手引き、木の熱分解の収率）で照合してほしい。
2. **詰めものの見分け方**：詰めるロットの location がレトルトの equipmentId、燃料はそれ以外。この表し方が接続仕様の範囲で筋が通っているか。
3. **質量**：詰めもの＋燃料＋O2 ＝ 炭＋タール＋木酢液＋燃料の残り＋灰＋煙（タール）＋ガス＋水蒸気＋CO2。分解した量は整数に丸め、炭・タール・水は切り捨て、残りがガス（数 mg しか分解しないときは丸めの分を炭から引く）。熱いうちに開けて燃えた炭は CO2・水になり、その熱を usedJ に足す。
4. **熱**：分解の熱を 0 とした。器の損失は線形（UA）で、強火だと 900 °C を超える（壺が割れることは扱わない）。
5. **区切り**：30秒・10分・1時間で完全一致、37.001秒で炭が 1 mg 以内。

## 扱っていないもの

分解の熱、ひびからの空気、高温でのタールの分解、木の太さ、木酢液の酸、壺の破損、土をかぶせた窯（後の工程）。

## 再現のしかた

```sh
npx tsx --import ./scripts/node-assets.mjs scripts/science-charcoal-check.ts   # 28
npm run typecheck && npm run build
```

## お願い

指摘と診断スクリプトは lab へ。科学側のブランチと main は変更しないでください。修正は科学側で行います。
