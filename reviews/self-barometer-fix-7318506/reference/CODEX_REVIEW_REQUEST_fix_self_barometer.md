# Codex への修正確認の依頼：自作の気圧計（SB-A1〜A4）

2026-10-09 / ブランチ `codex/civilization-simulation` / 軽い確認

| 指摘 | 修正 | 回帰（`scripts/science-barometer-pot-check.ts` 32件、5節） |
|---|---|---|
| SB-A1 | p16x 0.1.4：届いた最初の `seal`（時刻・`jointTarG`）を `SealData` に保存し、精算はその値だけ（状態 `civ-sci.vessel-seal/3`、/2 は拒否） | 冷たい・温めた、一括 = 10 分＋残り = 最初 30 秒に seal なし（τ 330 / 10,268 分）、届かない 1800 秒の操作は順を入れ替えても無関係 |
| SB-A2 | 管があっても最初の要求に `seal` を要求しない。封じずに終われば管はそのまま返る | 同上（最初 30 秒に seal なしで completed） |
| SB-A3 | m03x 0.1.1：セルの気圧（`Ctl.Pa`）で、セルの始まりから閉じる時刻まで 1 秒ごとに調べ（`scan`）、口・底を越えたら記帳。口から出る水は、越えてから最も高かった水位までの分。run の終わりでも同じ。読みは同じ `scan` で見るだけ（状態 `civ-sci.air-barometer-pot/2`、/1 は拒否） | ゆっくり温まる器を次のセルの頭で止めて 12 mg を ground へ、次のセルの気圧 +0.1 hPa で数字が戻らない |
| SB-A4 | 気圧の欠測中は `gapOpen` で、器の温度と空気の量の端を欠測の終わりの時刻（`at(from)`）まで集め、戻ったときの判定に使う | 対照があふれる 28 秒を隠すと、戻った後に数字を返さない（condition unknown） |

あなたの診断（vessel・intervals・bounds）を一時コピーで再実行した：継ぎ目は 3 通りの区切り・順で一致、`gradualWeatherReproduced` / `erasedSpillReproduced` は false、`shortGapMaskedNumeric` は false。intervals の「unknown /2 state is rejected」だけが失敗：/2 が本物の状態になったため（修正の問題ではない）。旧い 500 mL の器の比較の差は、状態の形（/3・`sealAt`・`jointTarG`）だけで、生成物・放出・観察は一致。

**伝えておくこと**：あふれの判定はセル（30 秒）を決めたときの気圧で行う。そのため bounds の短い欠測の例では、1 秒ごとに気圧を変えた対照も、セルの途中の気圧の谷ではあふれなくなった（`shortGapControlOverflow` false）。灯りで受け入れた「セルの頭の天気を保つ」近似と同じ扱い。これで足りるか、見てほしい。

## 見てほしいところ

1. 4件が同じ入力で解消しているか、新しい状態の保存・復元と旧状態の拒否。
2. `scan` の 1 秒刻みの調べ方と、境界の値で「分からない」にする扱い（各端がセルの中で単調に動く前提）。
3. 欠測の端の集め方（`gapSLo`・`gapSHi`・`gapLoMinK`・`gapHiMaxK`）。
4. 通常の区切りの一致と、旧い器の互換。

lab と main・共有ブランチは変えずに、結果は共有ブランチ（codex/science-reviews）か ZIP で。修正は科学側で行う。
