# 本体側の最終レビュー依頼：島の天気・気圧計・粘土の下ごしらえ・ヤシ油

2026-10-05 / ブランチ `codex/civilization-simulation`（b033ef7）/ レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)（オーナー合意）

**Codex の確認はすべて完了。** 保留は全部解除されている。統合と採択は、本体側の最終レビューの後に本体側が行う。科学側は main・lab・共通ファイル（`src/world/science-contract.ts`）を変えていない。

## 1. 束ねたもの

| 束 | 工程・版 | 時計 | Codex |
|---|---|---|---|
| 島の天気 | 接続仕様 0.2.1 案（`record`・`windHeightM`・区間の時計）、秤量・成形 `fixture-4`、乾燥 0.3.0 の風速の高さ換算 | — | 軽い確認で新しい A/B なし（lab 47284f8・553d2e9） |
| 試験用の気圧計 | `m02x_air_barometer_test` 0.1.2（状態 `/3`） | 島 | 全面＋2回の修正確認、保留解除（lab 2f67ea2） |
| 粘土の下ごしらえ | `p10x_clay_slake` 0.1.1（状態 `/2`）、`p10y_clay_knead` 0.1.1 | 島／世界 | 全面＋修正確認、保留解除（lab 6e3983d） |
| ヤシ油 | `p30x_coconut_milk` 0.1.0、`p31x_coconut_oil_boil` 0.1.2（状態 `/2`、接続仕様 0.2.x のみ） | 世界／島 | 全面＋2回の修正確認、保留解除（lab b39ced0） |

手順書：[WEIGH_HANDBOOK.md](WEIGH_HANDBOOK.md)（fixture-4 の訂正つき）、[CLAY_PREP_HANDBOOK.md](CLAY_PREP_HANDBOOK.md)、[COCONUT_OIL_HANDBOOK.md](COCONUT_OIL_HANDBOOK.md)。気圧計は [CODEX_REVIEW_REQUEST_barometer.md](CODEX_REVIEW_REQUEST_barometer.md) の「仕組み」と、カタログの注記。経緯の全体は [CODEX_REVIEW.md](CODEX_REVIEW.md)。

## 2. 統合してほしいファイル

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/world/science-contract.ts` | 変更（共有） | `science-contract-0.2.1.proposed.diff` を当てる（main に `git apply` 成功） |
| `src/science/step/common.ts` | 変更 | `record` を受け付ける、`windHeightM`（1〜300 m）、`wind10m()` |
| `src/science/step/drying.ts` | 変更 | 棚の風 = `wind10m(req) × 0.6`（10 m なら今までと同じ） |
| `src/science/step/simple.ts` | 変更 | `fixture-4`：秤量・成形が simulation と record で動く。**live は拒否** |
| `src/science/params.ts` | 変更 | 追加の定数（すべて `assumed`。気圧計・粘土・ヤシ油・風の粗さ） |
| `src/science/chem.ts` | 変更 | 化学種 `coconut_fat`（トリラウリンで近似）・`plant_solids` |
| `data/science/catalog-test-2.json` | 変更 | 工程ごとの `clock`、新しい材料・工程・設備、版の注記 |
| `src/science/step/barometer.ts` | 新規 | 気圧計 |
| `src/science/step/slake.ts`・`knead.ts` | 新規 | 粘土の下ごしらえ（`knead` は `slake` の読み書きを使う） |
| `src/science/step/coconut.ts` | 新規 | ヤシ油（`wood-fire.ts` の `fuelComp` を使う。main にある） |
| `data/science/sources.json`・`data/science/evidence/` | 任意 | Codex が取得した資料（すべて `calibrationEligible: false`）。気圧計の検査は石垣島の CSV を読む |
| `scripts/science-{barometer,clay-prep,coconut}-check.ts` | 任意 | 検査（`src/science/step/index.ts` の振り分けを使う。main は工程を個別に import しているので、取り込むなら振り分けも一緒に） |

## 3. 本体側で直す必要があるところ（3か所）

秤量・成形の工程版が `fixture-3` → `fixture-4` に変わるため、main の次の3か所で版の文字列を `fixture-4` にする：

1. `src/world/process-catalog.ts`（成形のエントリー）
2. `scripts/process-runner-check.ts`（`shapeSpec`）
3. `scripts/science-integration-check.ts`（要求の版）

## 4. 統合の予行（科学側で実施）

main（aea5ee2）の使い捨ての worktree に、§2 の工程と共通ファイルだけを写し、0.2.1 案を当てて確認した。main・科学側ブランチは変えていない（worktree は削除済み）。

| 確認 | 結果 |
|---|---|
| 0.2.1 案の `git apply` | 成功 |
| 型検査・ビルド | 成功 |
| 本体の統合検査（版を fixture-4 にした写し） | 93件成功 |
| 本体の工程の実行役の検査（§3 の2か所を fixture-4 にした写し） | PASS（成形 → 島の時計で乾燥 → 保存・復元まで） |
| 新しい工程の検査（振り分け `index.ts` を一時的に借りて） | 気圧計 43・粘土の下ごしらえ 50・ヤシ油 45 件成功 |

`fixture-3` のままだと、実行役の検査は成形で `unsupported-version` になる（想定どおり）。

## 5. 本体の実行役に足すエントリー（案）

| 工程 | 時計 | 入れるもの | 設備 | エネルギー | 終わり方 |
|---|---|---|---|---|---|
| `p10x_clay_slake` | island | `raw_clay`＋`process_water`（乾いた土の1.5倍以上）。または湿りすぎた `settled_clay` / `prepared_clay`（水は任意） | `fixture_clay_tub`（`capacityMl`・`surfaceCm2`・`sunExposure`） | なし（蒸発の熱は `src:env-heat:`） | `sieve`（1回）、`decant`（何回でも）、`take_out` |
| `p10y_clay_knead` | world | `settled_clay` / `prepared_clay`（1つ以上）＋水（任意） | `fixture_bench` | 手 `mechanical` 20 W 以上、1 kg あたり5分 | 時間が働かれたら完了 |
| `p30x_coconut_milk` | world | `coconut`（`quality.count`）＋水（任意） | `fixture_coconut_tools` | 手 `mechanical` 30 W 以上、1個20分 | 時間が働かれたら完了 |
| `p31x_coconut_oil_boil` | island | `coconut_milk` または `coconut_latik`＋`firewood` | `fixture_cook_pot`＋`open_fire_pit` | 申し出なし（薪が燃える。接続仕様 0.2.x） | `fire_level`・`look`・`take_off` |
| `m02x_air_barometer_test` | island | なし | `fixture_air_barometer` | なし | `read_gauge`（何回でも）、`stop` |

## 6. 本体側で決めること・守ること

- **天気**：記録（`record`）のある区間は `unknown` でなく記録を送る。気圧計の保証は「欠測中も含めて気温 −60〜70 °C の適用範囲内」。範囲外と分かった run は置き直す。
- **時計**：1つの run の中では、区間・`actions.at`・`effectiveAt`・返す時刻をすべて同じ時計で。
- **旧状態**：科学側は古い版の状態を `unsupported-state-schema` で拒否する。本体は run を中止して予約を解放する（ロットは終わりにしか精算しないので未消費）。工程版だけを付け替えて古い run を再開しない。
- **住人に渡すもの**：`observations` だけ。`diagnostics`・`state`・lot の `quality` の数値を住人の知識に混ぜない。
- **粘土**（手順書 §5）：掘る場所ごとの組成、桶の値、粘土の単位と真水の元、待つ間に住人がそばにいるか。
- **ヤシ油**（手順書 §4）：漂着したヤシの実のロット（何個・何 mg、腐った実の扱い）、鍋の値、火の番（`look` の間隔が結果を変える）、ミルクに足す水。

## 7. 確認済み・未確認・次のレビューに回すもの

| 確認済み | 未確認 | 次の全面レビュー |
|---|---|---|
| 科学側 417件（粘土の下ごしらえ50・ヤシ油45・気圧計43・回帰108・工程47・粘土52・石灰24・連鎖16・薪32）、型検査、ビルド、§4 の予行 | 本体のブラウザーでの表示、保存の互換、実行役に足すエントリー | C1（異常な状態の再利用・設備の継続照合、気圧計・ヤシ油） |
| Codex：全工程の全面レビューと修正確認、一次資料（気象庁・OpenStax・陶芸・ヤシの資料） | 係数の校正（すべて仮定のまま） | C2（気圧計の格子外の越流時刻と言葉） |
| | | 共通 `tileComp`・`tileQuality` の丸め（統合済みの処理） |
