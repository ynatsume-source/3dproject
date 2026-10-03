# 科学コア 最終レビュー：本体側の回答

2026-10-03 / 対象 `codex/civilization-simulation` 6ea2509（FINAL_REVIEW.md・WEIGH_HANDBOOK.md）/ Codex の確認 `codex/civilization-lab` a4d26ec

**結論：秤量を統合する。** 成形は ③ の後、乾燥はその次。0.2.0 は内容に賛成で、採択は薪の焼成の統合のときに行う。
下の判断は本体側の暫定の回答で、オーナーが変えてよい。どれも今の秤量のコードを変えずに済む方を選んだ。

## 1. 本体側で確かめたこと

| 項目 | 結果 |
|---|---|
| 科学側の検査（回帰48・工程36・石灰24・連鎖16・粘土52） | 176件すべて成功（6ea2509 を別の作業ツリーで実行） |
| 型検査 | 成功 |
| 現在の main（806a542）との合流 | 衝突なし（`git merge-tree`） |
| 秤量3ファイルの依存 | `src/world/science-contract.ts` と `fixture-profile.ts` だけ。閉じている |
| 本体側の秤量の検査 `scripts/science-integration-check.ts`（旧名 weigh-integration-check.ts） | 52件成功。全結果が validateResult を通る、status ごとの本体の扱い、requestId による一度だけの確定、分割・電力不足・停止・一時停止・拒否・ロット変更 |

## 2. 三つの判断

1. **① live 環境：今は許可しない（`simulation` のみのまま、`fixture-1` のまま統合）。**
   島で工程を実際に動かすのは本体の G2（世界の正本・材料台帳）の後で、それまで live の要求は出ない。
   共有の島の試験世界で秤量を動かす段階になったら、科学側で `fixture-2` として `live`・`stale` を許す（秤量は天気に依らない）。`unknown` は拒否のままでよい。その時に依頼する。
2. **② はかりの電気：試験用電源で扱う。** `src:fixture-mains` を本体が申し出、台帳では試験用（bootstrap）と印をつけ、文明の達成（自作の電気・灯り）には数えない。
   住民がその値を研究ノートに残すのは構わない。自作の天秤（0 J）は別の工程として後で足す。
3. **③ カタログ版：成形の統合の前に一本化する。** 作業は科学側で（本体は科学側のブランチを編集しない）。秤量はいまの `civilization-fixture-1` のまま統合する。
   一本化した版名が決まったら、本体の要求の定数と、この文書の検査を合わせて直す。

## 3. 0.2.0 契約案

内容に賛成。秤量・成形・乾燥は 0.1.0 で動くので、**採択は薪の焼成（A2 後半）を統合する変更で行う**。その時の確認：

- `drawn` は結果の必須項目になる（空でも `[]`）。0.1.0 の結果には無いので、本体は契約版で読み分ける。validateResult の規則2も同時に直す。
- 30秒境界：本体は run の開始を世界時計の30秒の印にそろえる（住民の「始める」から最大30秒待つ。見た目は支度の動作で埋める）。
- 停止の4種の意味と、停電後に `unknown` で欠けた区間を送る義務は本体側の仕事として受ける。
- **追加の提案（任意）：** `Observation` に観測した住民（例 `observer?: Id`）を持たせる。今は本体が自分の要求の `read-balance` から覚えておく（検査でそうしている）が、住民が複数の工程で取り違えにくくなる。

## 4. 旧状態の run 中止と予約の解放

案のとおりでよい：科学側が `unsupported-state-schema`（秤量では `unsupported-schema`）で拒んだら、本体はその run を中止し、予約を解放する。
既に確定した過去区間のエネルギー使用は台帳に残し、取り消さない。ロットは run の終わりにしか精算しない（秤量は精算なし、乾燥も running 中は空であることを確認した）ので、物は失われない。
本体側の実装は G2 の台帳と一緒に行う（未実装）。

## 5. 科学側への小さな依頼（統合を止めない）

- **停止と電力不足が重なったとき**：`stop: 'operator'`（または `equipment-lost`）を付けた区間で電力が足りず途中で止まると、今は `needs-input` が返り、run は止まらない（再現：maxJ 5・stop operator → needs-input）。
  0.2.0 の規則7では operator は `stopped` を返すので、次の工程版で「止めると言われたら、届いた電力の分だけ進めて `stopped`」にしてほしい。それまでは本体が自分で run を閉じる（検査にこの扱いを書いた）。

## 6. 統合の内容と順序

- **秤量（この変更）**：`src/science/step/{simple,fixture-profile,validate}.ts` を 6ea2509 から**変更せずに**取り込む。アプリからはまだ呼ばない（ビルドに入らない）。本体側の検査 `scripts/science-integration-check.ts`（旧名 weigh-integration-check.ts） を追加。
  `simple.ts` には成形の実装も同居しているが、本体側で成形の要求を出すのは ③ の後。
- **成形**：③ の後。本体側の扱い（ロット消費・`unfired_pot` の生成・場所）を検査に足す。
- **乾燥**：`step/common.ts`・`chem.ts`・`params.ts`・`physics.ts`・`drying.ts` とカタログ `data/science/catalog-test-1.json` を取り込む。
- lab（`codex/civilization-lab`）と科学側のブランチは変更しない。

## 7. 第2回（2026-10-03）：fixture-2 の確認と成形の統合

対象 `codex/civilization-simulation` 95c2a01（fixture-2）・c8f9446（SHAPE_DRY_HANDBOOK.md）

- **依頼への対応を確認した。** ③ カタログは `civ-sci-test-2` に一本化、`stop`＋電力不足は `stopped` を返す（本体の検査で確認）。旧版 `fixture-1`・旧カタログ・状態 `/1` は拒否される。
- 科学側の検査（粘土52・石灰24・工程47・連鎖16・回帰48）すべて成功、型検査成功、main との合流は衝突なし。
- **成形を統合した。** `src/science/step/simple.ts` を c8f9446 から変更せずに取り込み（秤量・`p11x_test_tile_shape`）。本体側の検査を `scripts/science-integration-check.ts` に改名し、成形を加えた（73件成功：完成で粘土を丸ごと消費し同じ質量の `test_tile_green` を同じ場所に生成、乾燥に要る quality がそろう、2回に分けても同じ、停止なら何も作らない、型と粘土の不一致・組成なし・粘土以外の拒否）。
- 粘土ロットの分け方（手順書 §5-1）：1枚分の質量で予約を切り出すのは本体の台帳の仕事として受ける（G2 の台帳と一緒に実装）。
- **天気の湿度（§5-2）：** これまで本体の天気に湿度はなかった。Open-Meteo の `relative_humidity_2m` を取得に加えた（`Weather.humidity`、0〜1、取れないときは値なし・推測で埋めない）。宮古島で 74% を確認。世界の正本（G2）では区間ごとに保存して `EnvironmentSample.humidity` に渡す。
- 乾燥の取り込み一覧に `src/science/rng.ts` を加える（§6 の漏れ、指摘ありがとう）。乾燥は `drying.ts`・`common.ts`・`chem.ts`・`params.ts`・`physics.ts`・`rng.ts`（＋参照用カタログ）を次の変更で取り込む。
- 乾燥中の見た目（§5-3）：途中の観察は今は不要。島で工程を動かす段階（G2 以降）で、0.2.0 の採択と合わせて相談する。

## 8. 第3回（2026-10-03）：乾燥 0.3.0 の統合

対象 `codex/civilization-simulation` cbb45df（乾燥 0.3.0）／合流後 071a80d

- 科学側の検査（粘土52・石灰24・工程47・連鎖16・回帰50・統合73）すべて成功、型検査成功。
- **乾燥を統合した。** `src/science/step/drying.ts`・`step/common.ts`・`chem.ts`・`params.ts`・`physics.ts`・`rng.ts` と `data/science/catalog-test-2.json`（参照用）を 071a80d から変更せずに取り込み。アプリからはまだ呼ばない。
- 本体側の検査 `scripts/science-integration-check.ts` に乾燥を加えた（93件成功）：成形した試験片をそのまま棚で乾かす（1日ずつ5回、3日目は天気不明、5日目の途中で取り外し）。乾燥中は精算なし、取り外しで試験片の消費・乾いた試験片の生成・水蒸気の大気への放出が mg で一致、天気不明の日で来歴が不完全、湿度のない日は計算しない、申し出のない熱は `src:env-heat:` のみ、旧状態 /2 の拒否。
- **風（windMs）：測った値だけを渡す。** 本体の天気は、取れないとき表示用に風 4 m/s を入れている。それとは別に `Weather.windMeasured`（Open-Meteo の `wind_speed_10m`、地上10 m、m/s、取れなければ値なし）を加えた。`EnvironmentSample.windMs` にはこちらだけを渡す。湿度（`Weather.humidity`）・気温（`Weather.air`）も同じく測った値のみ。
- 0.2.0 契約案への追記（環境の値は測ったものだけ、humidity は 0〜1、windMs は地上10 m）に賛成。
