# Codex への全面レビュー依頼：油の灯り（p40x_oil_lamp 0.1.0）

2026-10-09 / ブランチ `codex/civilization-simulation` / 新しい工程の全面レビュー

設計案 [OIL_LAMP_DESIGN.md](OIL_LAMP_DESIGN.md)（オーナー決定済み）、手順書 [OIL_LAMP_HANDBOOK.md](OIL_LAMP_HANDBOOK.md)。8dba18f の資料調査をもとに値の桁を合わせ、4件を `sources.json` に取り込んだ。

## 対象

| ファイル | 内容 |
|---|---|
| `src/science/step/oil-lamp.ts` | 新規。工程・`WICK_RECIPES`・`wickQuality` |
| `src/science/chem.ts` | 反応 `oilCombustion`（C39H74O6 + 54.5 O2 → 39 CO2 + 37 H2O）・`oilSooting`（+ 15.5 O2 → 39 C + 37 H2O） |
| `src/science/params.ts` | `lamp*` 31個 |
| `src/science/step/index.ts` | 登録 |
| `data/science/catalog-test-2.json` | p40x、`lamp_wick`・`wick_char`・`soot`、`lamp_dish` の params、`coconut_oil` の `soaked_in_dish` |
| `data/science/sources.json`・`evidence/` | 4件 |
| `scripts/science-oil-lamp-check.ts` | 34件 |

## 最初から入れた約束（これまでの学び）

look はその時刻の写しから読む（見ても変わらない）／同じ時刻なら操作が先／天気・風の欠測は計算せず run を止める／設備を失っても区間の終わりまで計算する／精算は終わりに一度、整数 mg／返したロットが次で読める／1 秒の格子は run の始まりから。

## 特に見てほしいところ

1. **質量**：油（脂と水）・しみこみ・芯・切りくず・すす・O2 の精算が、どの区切りでも閉じるか。しみこんだ油を別ロット（`soaked_in_dish: 1`、皿の equipmentId）で返す設計の妥当さ。
2. **区切り**：行動・look が格子の間にあるとき、1 h・30 s・3 h・17 min の区切りで完全一致するか（消える判定・しみこみ・焦げを含む）。
3. **融解**：20〜27 °C の直線と、炎による＋6 K・時定数 15 分の扱いが、資料（DSC の峰）に対して言いすぎていないか。
4. **値の桁**：油の消費（ふつうの芯で 3.7 g/時）・明るさ（約 10 lm）・燃焼熱が、資料の範囲・条件の違いとどう向き合っているか（Codex の注意：別資料の g/h と lm から発光効率を作らない → `lampLumenPerGPerH` は「桁を合わせた仮定」と書いた）。
5. **住人の言葉**：数値を渡していないか。分からない区間の後は「見ていない間に灯が消えていた」だけか。

いつもどおり lab と main は変えずに、結果は ZIP で。修正は科学側で行う。
