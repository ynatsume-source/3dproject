# Codex への全面レビュー依頼：自作の気圧計（p16x 0.1.3・p17x 0.1.4・換算表 civ-sci.pot-assembly/4・m03x_air_barometer_pot 0.1.0）

2026-10-09 / ブランチ `codex/civilization-simulation` / 新しい工程の全面レビュー

設計案 [SELF_BAROMETER_DESIGN.md](SELF_BAROMETER_DESIGN.md)（オーナー決定済み）、手順書 [SELF_BAROMETER_HANDBOOK.md](SELF_BAROMETER_HANDBOOK.md)。

## 対象

| ファイル | 内容 |
|---|---|
| `src/science/step/barometer-pot.ts` | 新規：m03x |
| `src/science/step/barometer.ts` | `Geometry`・`SPILL_NOW`・`SPILLED` を export（計算は変えていない） |
| `src/science/step/vessel.ts` | 管を栓に通す（p16x 0.1.3）、空気を保つ時間を器の大きさと継ぎ目で（`airLeakTauMin`、p17x 0.1.4・換算表 /4）、管つきの器の params |
| `src/science/params.ts` | `jointLeakBase`・`jointLeakFloor`・`jointTarColdPerG`・`jointTarWarmPerG` |
| `src/science/step/index.ts` | m03x の登録 |
| `data/science/catalog-test-2.json` | `gauge_tube_test`・m03x・`assembled_pot`・版 |
| `scripts/science-barometer-pot-check.ts` | 24件 |

## 最初から入れた約束

分からないものは幅で持つ（器の温度に加えて空気の量）／両端が同じ目盛りのときだけ読む／30 秒のセルの頭でだけ決め、途中は式（灯りの A1）／読みは状態を変えない／管の端を越えたかもしれないなら何も言わない／水はロットで返し、あふれた分は ground／管のない 500 mL の試験用の器は今までと同じ（140 通り一致）。

## 特に見てほしいところ

1. **幅の正しさ**：気圧が分からない間に空気の量を `±leakK × 管の半分の長さ` で広げる扱いが、実際にありうる範囲を必ず含むか。気圧が戻ったときのあふれの判定（試験用の気圧計と同じ形）に空気の量の幅を入れた扱い。
2. **区切り**：セルの頭の決定と閉じた式で、どの区切り・読みでも完全一致するか（天気が要求の頭で変わる場合、セルの途中から次のセルの頭まで前の天気の漏れの速さを保つ）。
3. **漏れの式**：`τ` の定義（閉じた器の小さな圧力差が 1/e）と U 字管での読みの戻り（約 1.5 τ）、`leakK = V0/(T0·τ)·2ρg`。器の大きさ（容量と面積の比）と継ぎ目の足し方。
4. **あふれの水**：口からあふれた量（管の端を越えた水柱の分）を ground に出す近似。
5. **住人の言葉**：数値は目盛りだけか。
6. 新しい穴（実際に返る器・水の再投入、閾値の近く）。

検査：`science-barometer-pot-check.ts` 24件、ほかの科学検査すべて、型検査・build 成功。lab と main は変えずに、ZIP で。修正は科学側で行う。
