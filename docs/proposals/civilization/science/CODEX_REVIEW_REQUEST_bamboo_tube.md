# Codex へのレビュー依頼：竹の管と天気の壺

2026-10-11 / ブランチ `codex/civilization-simulation` / 全面レビュー

オーナー決定（2026-10-10、[BAMBOO_TUBE_DESIGN.md](BAMBOO_TUBE_DESIGN.md)）：竹の管を作る、形は「天気の壺」（まっすぐな竹の管を栓に通し、壺の中の水に差し込む）。手順書 [BAMBOO_TUBE_HANDBOOK.md](BAMBOO_TUBE_HANDBOOK.md)。

| 変更 | 内容 |
|---|---|
| `src/science/step/bamboo-tube.ts`（新規） | p18x 0.1.0：`bamboo` から節の間を切る（150〜400 mm）。内径は seed とロットで 6〜12 mm、割れ 10%（青い竹 35%）、手の仕事 10 分。状態 `civ-sci.bamboo-tube/1` |
| `src/science/step/vessel.ts` | p16x 0.1.5：`bamboo_tube` も栓に通す（`tube_form: 2`・`tube_outer_mm`、継ぎ目の漏れ ×2）。p17x 0.1.5。換算表 `pot-assembly/5`：`tubeForm`・`tubeOuterMm`・`bulbHeatJPerK` |
| `src/science/step/barometer-pot.ts` | m03x 0.2.0：形に `headK`・`topM`・`bottomM`。天気の壺は (Pa + (1 + A/Ares)ρg x)(V0 + A x) = s·Tb、V0 = 壺 − 水 − 中の管、端は管の上端と下端、水の熱で bulbTauS を伸ばす。状態 `/3` |
| `src/science/params.ts` | `bamboo*`・`jointLeakBambooFactor`・`weatherPot*`（すべて assumed） |
| `src/science/step/index.ts` | p18x を登録 |
| カタログ | `bamboo_tube`、p18x、p16x・p17x・m03x の版と注記 |
| 検査 | `science-barometer-pot-check.ts` 53 件（7 節）、`science-vessel-check.ts`・`science-fired-pot-assembly-check.ts` は換算表の版の1行 |

確認したこと：

- U 字の管（form 1）：0.1.2 のコードを一時的に並べ、管 200〜1200 mm・継ぎ目のタール 4 通り × 天気 4 通り（下がる・大きく下がって温度も揺れる・上がる・気温や気圧の欠測）× 区切り 4 通り（1 h・30 min・7 min 13 s・開始 1007 ms）、7,120 要求で結果と状態の値が完全一致。
- 天気の壺：30 hPa で約 3 mm/hPa 上がり、漏れのない柱に近い（3 目盛り以内、τ 2,595 分の漏れの分だけ低い）。1 °C で 2 目盛り。格子の外の区切り（9 min 7.013 s ごと）と読みの有無で生成物・観察・最終状態が一致。あふれ（ground へ）と泡、水の量・管の長さの拒否、旧版の拒否。

## 見てほしいところ

1. 天気の壺の釣り合いの式と端（`headK = 1 + A/Ares`、`topM = L − dip`、`bottomM = dip`）、壺の中を球とみなす仮定、水の量の決まり。
2. 漏れの式を `headK` で一般化したこと（U 字の管は同じ数）。欠測の幅（`dsLo = −leakK·topM`、`dsHi = leakK·bottomM`）。
3. 水の熱で bulbTauS を伸ばす扱い。
4. p18x の内径・割れの乱数の鍵、手の仕事の分割、割れたときの返却。
5. p16x の竹の管の受け付けと継ぎ目の漏れ、換算表 /5、旧版の拒否。
6. 資料：島（八重山）の竹の種類・節の間の長さ・内径・壁、乾いた竹の割れやすさ、天気の壺（Goethe の気圧計・weather glass）の実例と感度。

**こちらで気づいた C**：U 字の管（m02x・m03x form 1）の下側の言葉「器の空気が泡になって抜けた」は、x < 0（器の中の気圧が外より低い）なので、実際は外の空気が器に入るはず。試験用の気圧計（m02x、統合済み）も同じ言葉なので、今回は変えていない。次の全面レビューで扱いたい。

lab と main・共有ブランチは変えずに、結果は共有ブランチか ZIP（または Drive）で。修正は科学側で行う。
