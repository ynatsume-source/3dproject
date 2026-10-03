# 成形・乾燥の統合手順書（案）

2026-10-03 / ブランチ `codex/civilization-simulation` / 対象 `p11x_test_tile_shape`（fixture-2）と `p12x_test_tile_dry`（0.3.0）、カタログ `civ-sci-test-2`

> 2026-10-03 追記：本体側が成形を統合した（main 60bf067）。乾燥は統合前に 0.3.0 にした：`environment.windMs` を気象サービスの地上10 mの風として読み、棚の高さの風に直す（係数 0.6、仮定）。状態は `/3`（`/1`・`/2` は拒否）。下は 0.3.0 の内容。

**未採択の提案。** 秤量（[WEIGH_HANDBOOK.md](WEIGH_HANDBOOK.md)、main 1c97313）の次に、本体がつなぐ2工程の手順をまとめる。
統合と本体側の検査は本体側が行う。この文書はコードを変えない。

## 1. 流れ（試験片1枚）

```text
練った粘土（prepared_clay、45 g） ─成形 60 s─▶ 試験片（test_tile_green、45 g、50×50×10 mm）
  ─棚で乾燥（数日、実際の天気）─▶ 乾いた試験片（test_tile_dry、約37 g）＋水蒸気（約8 g、大気へ）
  ─秤量─▶ 住民の記憶「37.0 g」
```

2026-10-03 に科学側で実際に通した例（live の天気 28 °C・湿度 0.72・風 3 m/s〔地上10 m〕、日陰、1日ずつ5回、3日目は天気不明）：

| 区間 | status | 熱（環境から） | 確定 |
|---|---|---|---|
| 成形 60 s | completed | 120 J（手の仕事、全量 lostJ） | 粘土 45,000 mg を消費 → 試験片 45,000 mg |
| 乾燥 1日目 | running | 19,214 J | なし（状態だけ） |
| 2日目 | running | 136 J | なし |
| 3日目（天気 unknown） | running | なし | なし。計算せず、来歴を「不完全」にする |
| 4日目 | running | なし（ほぼ乾き切った） | なし |
| 5日目 6時間目に取り外し | completed | なし | 試験片 45,000 mg を消費 → test_tile_dry 37,037 mg ＋ 水蒸気 7,963 mg。観察「白っぽく乾いている」「持っても冷たくない」 |

全結果で `validateResult` の違反は0件。

## 2. 成形 `p11x_test_tile_shape`

秤量と同じ `simple.ts` にあり、本体が取り込み済みの3ファイル（`simple.ts`・`fixture-profile.ts`・`validate.ts`）で閉じている。

| 項目 | 本体が渡すもの |
|---|---|
| processVersion / catalogVersion | `'fixture-2'` / `'civ-sci-test-2'` |
| environment | `source: 'simulation'` のみ（秤量と同じ。島で動かす段階で fixture-3 に） |
| lots | 練った粘土 1つ。**丸ごと1枚になる**ので、本体が予約の時点で1枚分（例 45 g）に分けておく。quality に `water_ppm` と `xd_<化学種>_ppm`（乾燥固形分あたり）が必須。`xd_` は知っている化学種だけ、整数で 0 以上、合計が 1000000 以下（残りは不活性な鉱物とみなす）。外れたら `clay-make-up-*` で拒否（Codex W4） |
| equipment | `fixture_bench` 1台、`params: { thicknessMm, widthMm, lengthMm }`（型の寸法、整数 mm）。質量÷体積が 1.5〜2.3 g/cm³（仮定）でなければ `mould-does-not-fit-the-clay` |
| energy | 機械仕事の申し出 1つ：`{ sourceId: 'src:…', kind: 'mechanical', maxJ ≥ 120 }`（住民の手の仕事。2 W × 60 s） |
| actions | なし |

- 確定は `completed` の結果1回だけ：粘土ロットを消費し、同じ質量の `test_tile_green` を同じ場所に生成する。
- 生成物の quality：粘土の組成をそのまま＋`width_mm`・`length_mm`・`thickness_mm`・`shaped_water_ratio_ppm`・`linear_shrink_ppm: 0`・`crack: 0`・`history_complete`（粘土の値、なければ1）。
- status ごとの扱いは秤量と同じ（停止＋仕事不足は `stopped`、一時停止は再開可）。`stopped` では何も生成しない（粘土のまま）。
- 器の成形 `p11_pottery_shape`（`unfired_pot`）も残っているが、乾燥はそれを受け取らない。統合は p11x を対象にしてほしい。

## 3. 乾燥 `p12x_test_tile_dry`

| 項目 | 本体が渡すもの |
|---|---|
| processVersion / catalogVersion | `'0.3.0'` / `'civ-sci-test-2'` |
| environment | **毎区間の実際の天気**：`airTempC` と `humidity` が要る（`windMs` はあれば。**地上10 mの風**として読む）。**測っていない値は渡さない**（本体の `weather.ts` は風が取れないとき `wind` に 4 を入れて表示に使っている。その値は `windMs` に渡さず、省く）。`live`・`simulation` は計算する。`stale`・`unknown`、または湿度がない区間は計算せず、来歴を不完全（`history_complete: 0`）にする。天気をでっち上げない |
| lots | 試験片 1つ（`test_tile_green`）。quality に `water_ppm`・`width_mm`・`length_mm`・`thickness_mm` が必須（成形の生成物はそのまま満たす） |
| equipment | `drying_rack` 1台、`params: { sunExposure: 0〜1 }`（0 日陰、1 日なた） |
| energy | **申し出なし**（`[]`）。蒸発の熱は環境から来る。結果には `src:env-heat:<runId>` として usedJ = lostJ で出る。これは申し出ではないので、本体は熱源として差し引かない |
| actions | 取り外すときに `{ at, residentId, action: 'take_off' }`。区間の途中でもよい（その時刻で終わる） |
| 区切り | run の開始を世界時計の30秒の印にそろえ、30秒の倍数で区切れば分け方によらず一致（ALIGNMENT §10）。1日1回でも、30秒ごとでも同じ結果 |

確定のしかた：

- `running` の間は consumed・produced・released がすべて空。**ロットは動かさず、状態だけ保存する。** 予約は乾燥の間ずっと続ける（他の工程に使わせない）。
- `completed`（取り外し）または `stopped`（`stop: 'operator'` / `'equipment-lost'`）の結果で一度だけ確定する：
  試験片を消費、乾いた（または生乾きの）試験片を生成、水蒸気を大気へ放出。Σ消費 = Σ生成 + Σ放出が mg で一致する。
- 生成物は乾き具合で変わる：乾き切っていれば `test_tile_dry`、まだなら `test_tile_green`（水分が減ったもの）。
- 観察は確定の結果にだけ載る（見た目・手触り・割れ）。重さは載らないので、量るなら続けて秤量を行う。
- 割れは種（seed）つきの抽選。同じ要求なら同じ結果。日なた・厚い試験片ほど割れやすい。

## 4. 本体側の取り込みに必要なファイル

乾燥が依存するのは次の7つで閉じている（`src/world/science-contract.ts` は main にある）。

```text
src/science/step/drying.ts   src/science/step/common.ts
src/science/chem.ts          src/science/params.ts
src/science/physics.ts       src/science/rng.ts
data/science/catalog-test-2.json（参照用。コードは読み込まない）
```

本体の回答（SCIENCE_FINAL_REVIEW_RESPONSE.md §6）の一覧に **`rng.ts` が抜けている**ので足してほしい（割れの抽選に使う。外部の乱数は使わず、seed・runId・lotId から決まる）。
`step/index.ts`（全工程の入口）は、乾燥だけなら不要。

## 5. 統合の前に本体側で決めること（案）

1. **粘土ロットの分け方**：成形は予約した粘土を丸ごと1枚にする。1枚分の質量で予約を切り出すのは本体の台帳の仕事（科学側は分けない）。
2. **天気の渡し方**：本体の回答で、Open-Meteo の `relative_humidity_2m` を取得に加え、G2 で区間ごとに保存して渡すことになった。風は `wind_speed_unit=ms` の地上10 mの値で、乾燥 0.3.0 の読み方と合う。取れなかったときの表示用の値（風 4・雲 20%）は渡さない。
3. **乾燥中の見た目**：棚に試験片が載っている間、確定した事実は「予約中の試験片」だけ。乾き具合の見た目を途中で出したいなら、`diagnostics` ではなく、0.2.0 で途中の観察を返す形を相談したい（今は確定時のみ）。

## 6. 確認済み・未確認

| 確認済み（科学側、2026-10-03） | 未確認 |
|---|---|
| 成形 → 乾燥（live の天気・1日ずつ・天気不明の日を含む）→ 取り外しまで、validateResult 違反0 | 本体の台帳・予約・確定 |
| `scripts/science-step-check.ts` 6c（成形の試験片を乾燥がそのまま受け取る）、乾燥の分割・停止・天気不明の検査（同 1〜6） | 棚の高さの風の係数 0.6（仮定。対数分布からの見積もりで、実測ではない） |
| 乾燥の物理は試作（粘土の一周）と 0.2% 以内で一致（同 7） | 乾燥速度・割れの係数の実測校正（仮定のまま） |
