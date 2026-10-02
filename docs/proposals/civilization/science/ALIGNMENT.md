# 科学側の整理：分担・main の契約との合わせ・次の統合単位

2026-10-02 / `codex/civilization-simulation` / main `41ccd18` を合流済み / 正本の契約 `src/world/science-contract.ts` **ScienceStep 0.1.0**（ADR 0002）

## 1. ブランチと担当

| ブランチ | 状態 | 誰が書く |
|---|---|---|
| `main` | 41ccd18。ADR 0002 と ScienceStep 0.1.0 を含む | 本体側（自然・住民の既存プロジェクト）。科学側は触らない |
| `codex/civilization-simulation` | 75a3eb1 の上に main を merge で合流（rebase・force push なし） | 科学側の Claude プロジェクト。本体側は編集しない（ADR 0002 の 8） |
| Codex の作業（2f53b30・66ad17b、基準 41ccd18） | **GitHub に未反映。今回の会話にもパッチ本体が届いていない**（アップロード領域は空、リモートにも該当コミットなし） | Codex |

同じブランチ名の衝突を避けるため、次の運用を提案する。

- Codex は自分の成果を **`codex/civilization-lab`**（新規、基準 41ccd18 のままでよい）へ push する。`codex/civilization-simulation` には push しない。
- 科学側の Claude は、そのブランチを隔離した worktree でレビューし、採用する部分だけを `codex/civilization-simulation` へ取り込む（cherry-pick または手作業の移植）。どちらのブランチも force push しない。
- main への統合は本体側が小さな PR 単位で行う。共通の契約ファイル `src/world/science-contract.ts` の変更は、本体側が採択する main への PR に限る。

ファイルの担当（ADR 0002 と本体側メモに合わせる）

| 場所 | 担当 |
|---|---|
| `src/science/`（`step/` = ScienceStep 実装、`fixture/` = 試験世界）、`data/science/`、`scripts/science-*.ts` | 科学側の Claude |
| `tools/science-lab/`（独立した検証画面）、`docs/proposals/civilization/CODEX_*.md` | Codex（レビュー後に取り込む） |
| `docs/proposals/civilization/science/` | 科学側の Claude |
| `docs/proposals/civilization/SCIENCE_HANDOFF.md`、`src/world/science-contract.ts`、`docs/adr/`、その他の本体コード | 本体側 |

Codex の成形・乾燥・秤量ラボが `src/science/` に別のシミュレーターを持つ場合は、そのまま取り込まない。乾燥の物理は `src/science/physics.ts` の `dryPhysics` に一本化してあり、二つ目の乾燥モデルや世界管理機能を本番へつなげない。出典の照合記録（OpenStax で熱・比熱・蒸発潜熱）と、収支の対照試験は優先して取り込む。

## 2. 仮契約 civ-sci/0.1 と ScienceStep 0.1.0 の差

civ-sci/0.1 は、コアが世界全体（全ロット・試料・設備・予約・研究）を読んで書き込み案を返す形だった。0.1.0 では、コアが受け取るのは **一つの工程の一区間** だけになる。役割を次のように移した。

| civ-sci/0.1 にあったもの | 0.1.0 での扱い |
|---|---|
| `reserve` / `release`、保護資源の拒否 | 本体側（予約の正本）。科学側は予約済みロット以外を消費しない |
| 設備の「実在・損傷・占有」の検査 | 本体側が `equipment` に渡す時点で済ませる。科学側は種類・状態・`params` だけを見る |
| commandId の重複排除、版の検査、一括確定、質量の不変条件 | 本体側（requestId で一度だけ確定）。科学側は結果の収支を閉じて返す |
| 世界時刻・環境・seed | request で受け取る（変更なし） |
| 試料（`Sample`）の組成 | ロットの `quality`（整数 ppm・mm）で表す。途中の値は `ScienceState` |
| 研究記録・習得手順の検査（`research.ts`） | 世界の実体（住民の記録）なので本体側。科学側の検査関数は参考実装として残す |
| 観測 | `Observation` の `channel`（sight / touch / sound / weight / instrument:…）に写す |
| 運用停止 `outage` | `stop: world-pause / shutdown` と `environment.source: 'unknown'` で表す（§5） |

`src/science/clay.ts`・`research.ts`・`fixture/` は、試験世界の試作と回帰試験として残す。**本番へは接続しない**（中に世界管理が入っているため）。本番の入口は `src/science/step/index.ts` の `scienceStep` だけにする。

## 3. 乾燥中のロット（質量・組成・来歴）

`src/science/step/drying.ts` は次のように実装した。

- **乾燥中**（`running`）：結果の `consumed`・`produced`・`released` は空。質量の収支は空で自明に閉じる。試験片のロットは確定済みの量のまま予約されているので、他の工程は使えない。水分・収縮・割れの危険度は `ScienceState` だけが持つ。
- **終了時**（住民の `take_off` → `completed`、または `stop: operator / equipment-lost` → `stopped`）：一回の結果で精算する。
  - 元のロットを全量消費する。
  - 新しいロットを一つ生成する。乾いていれば `test_tile_dry`、まだなら `test_tile_green`。新しい含水・収縮・割れ・`history_complete` を quality に入れる。
  - 蒸発した水を `water_vapour` として空気へ放出する。
  - `Σconsumed = Σproduced + Σreleased` は mg で完全に一致する。
- **来歴**：本体側が確定イベントで「消費ロット → 生成ロット」を一本結ぶ。一回の乾燥につき一本だけで、区間ごとにロットIDを作り直さない。
- **乾燥中の質量を見せたい場合**：`diagnostics` か観測で見せる。本番の在庫に途中の値を書くなら「品質だけを更新する欄」が契約に必要になるが、今は要らない。

## 4. 熱を整数 J へ（端数処理）

- 科学側は区間内の熱を小数のまま `ScienceState` に累積する（`latentJ`）。
- 報告済みの整数の累計（`reportedJ`）も状態に持ち、各区間では `round(累計) − 報告済み` を `usedJ` として返す。
- 区間をどう刻んでも、整数 J の合計は `round(全体の熱)` と一致する（検査：一括・12時間刻み・不揃い刻みで 19,326 J が一致。蒸発した水の潜熱 19,325.79 J との差は 0.21 J。潜熱は OpenStax の 2430 kJ/kg）。
- 一つのエントリの中では `lostJ` を残差として求めるので、`usedJ = storedJ + lostJ` が整数で厳密に閉じる。
- 乾燥の熱は空気から受け取り、水蒸気とともに出ていく。そのため `usedJ = lostJ`、`storedJ = 0` で、供給元は `src:env-heat:<run>`（本体の EnergyOffer ではない）。

## 5. 二重計上を防ぐ線引き

| 項目 | 一度だけ計上する場所 |
|---|---|
| 試験片の質量 | 終了時の一回の consumed／produced／released |
| 水蒸気 | 終了時の released（乾燥）。焼成では区間ごと |
| 乾燥の熱 | `src:env-heat` の usedJ = lostJ（区間ごと、累積の丸め） |
| 燃料（焼成、未統合） | 燃料ロットの consumed（区間ごと）＋同じ燃焼の熱を `src:combustion:<run>` に一度。本体はこの火を別に EnergyOffer しない |
| 炉体の蓄熱（焼成、未統合） | 区間ごとの storedJ（正負あり）。終了時に残った顕熱は lostJ として出し、宙に浮いた蓄熱を残さない |
| 空気中の O2（焼成、未統合） | **0.1.0 には流入の欄がない** → 0.2.0 案の `drawn` |
| 再送・刻み直し・停止・再開 | requestId で一度だけ確定し、run の seed は最初の request の値で固定する。状態の累積値から差分で報告する |

## 6. 共通契約の変更案（0.2.0、レビュー用。未適用）

差分：[`science-contract-0.2.0.proposed.diff`](science-contract-0.2.0.proposed.diff)（`git apply --check` で適用できることを確認済み）

1. **`drawn` を追加**（形の変更）：周囲から取り込む物質。燃焼と有機物の酸化で使う O2、石灰の炭酸化（p24・p81）で使う CO2。これがないと、焼成や炭酸化では質量の収支が閉じない。乾燥の統合には不要なので、焼成を統合する前に入れればよい。
2. **規則の明確化**：
   - J は整数で、`used = stored + lost + work` が厳密に閉じる。
   - `storedJ` には化学のエンタルピーも含み、負になりうる。工程の終了時に残った顕熱は lost として出す。
   - `src:env-heat`・`src:combustion` は本体の EnergyOffer ではない。同じ火を二重に供給しない。
3. **seed**：一つの run では同じ値を送る（科学側は最初の値で固定する）。
4. **停止**：`world-pause` / `shutdown` は精算せず `running` を返し、`operator` / `equipment-lost` は精算する。運用停止の後は、空白の区間を `environment.source: 'unknown'` で送る。乾燥はその区間を計算せず履歴に印を付け、焼成は `stopped`（履歴不完全）で終える。

## 7. 最初に本体へ統合する小さな機能（Codex のレビュー後に更新）

Codex の提案どおり、材料の変化が小さい順に一つずつ進める。どれも契約 0.1.0 のまま動く。

1. **秤量** `fixture_mass_measure`：予約した1ロットの質量を、秤の分解能（100 mg）で観測として返すだけ。材料は変わらない。
2. **成形** `p11_pottery_shape`（fixture-1）：機械仕事を供給元から使い、完成時に一度だけ prepared_clay → unfired_pot を消費・生成する。
3. **乾燥** `p12x_test_tile_dry`：§3 の「終了時に一回だけ精算」と §4 の「整数 J」で動く。

統合時に本体側が持ち込むもの：
- `src/science/step/`（入口 `index.ts`）
- `src/science/physics.ts`・`params.ts`・`rng.ts`・`chem.ts`
- `data/science/`
- `scripts/science-step-check.ts`

持ち込まないもの：`src/science/fixture/`・`clay.ts`・`research.ts`、Codex のラボ（`codex/civilization-lab` の `experiments/`）。

本番の島では、原典の照合と校正が済むまで実行可能にしない。焼成（燃料・O2・蓄熱）は 0.2.0 の `drawn` を採択した後にする。
