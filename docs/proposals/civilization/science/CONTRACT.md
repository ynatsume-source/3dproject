# 科学コアと本体の接続契約 `civ-sci/0.1`（仮・**置き換え済み**）

> 2026-10-02：main の ADR 0002 と `src/world/science-contract.ts`（ScienceStep 0.1.0）が正本になった。この仮契約は試験世界の試作（`src/science/fixture/`）の説明として残す。差分と移行は [ALIGNMENT.md](ALIGNMENT.md)。

状態：**仮の接続仕様**。既存側（共有世界の正本・時刻・在庫・実行器・保存・AI gateway）からの接続仕様メモは、2026-10-02 時点で main にまだない。受け取ったら、この版を改訂して合わせる。型の正本は [`src/science/types.ts`](../../../src/science/types.ts)。

## 1. 役割の分け方

| 担当 | 持つもの |
|---|---|
| 科学コア（`src/science/`） | 工程の規則、物質・熱の計算、割れ等の評価、住民が知覚できる観察の生成、研究記録と習得手順の検査 |
| 既存側（本体） | 世界の正本、世界時刻、材料の所在と予約の確定、住民の実行器（いつ・誰が操作するか）、保存と復旧、3D表示、AI gateway と予算 |
| 試験用 adapter（`src/science/fixture/`） | 既存側の代わりに、上の約束どおり一度だけ確定するメモリ上の世界。**本番の在庫・台帳ではない** |

コアは世界を書き換えない。`propose(view, command) → Proposal` だけを返す純粋関数で、時計・乱数生成器・ネットワーク・DOM・Three.js を持たない（チェックスクリプトで検査）。

## 2. 入力：command

すべての command に `commandId`（再送の識別）、`atMs`（世界時刻、UTC ミリ秒）、`actorId`（住民）を付ける。時間を進める `advance` は `untilMs` と環境サンプル `env`（`source` 付き。`test-fixture / observed / forecast / simulation`）を受け取る。乱数は工程開始時の `seed` だけ。割れの抽選は `draw(seed, runId, sampleId, 機構)` で決まり、保存・再開・再送・時間の区切り方に依存しない。

| command | 意味 |
|---|---|
| `reserve` / `release` | 研究配分の予約と解放。保護資源（暮らし・回復用）は拒否 |
| `prepare_clay` | 予約した原土と水を練る（目標含水比） |
| `shape_tiles` | 試験片の成形。削りくずは未焼成スクラップ（水で戻せる）として残る |
| `start_drying` / `finish_drying` | 乾燥棚に置く／下ろす |
| `start_firing` | 焚き火・窯で焼成。住民の計画は **知覚できる条件**（速さ・狙う火の色・保持分・冷まし方）。温度の数値は世界側の制御則に変換される |
| `start_soak` | 24時間の冷水浸漬。はかりがあれば前後の質量を本人が量る |
| `advance` | 工程を世界時刻まで進める。運用停止区間は `outage` で渡す |
| `resolve_halt` | 運用停止で保留した工程を中止扱いにする |
| `inspect` | 見る・はじく（計器なし） |
| `open_research` / `add_trial` / `conclude_research` | 研究記録と習得手順 |

## 3. 出力：Proposal

```
Proposal {
  ok, rejection?            // 拒否なら理由コードと説明。世界は変わらない
  lots/samples/facilities/reservations/runs/research/procedures: { entity, expectVersion }[]
  boundary[]                // 大気への流出/流入（H2O・CO2・O2 など、mg）
  energy[]                  // 熱の台帳：放出・排気・壁・試験片・反応・蓄熱（J）
  observations[]            // 住民が知覚したことだけ
  events[]                  // 確定時に記録するイベント
  evidence[]                // 依存したパラメータ ID（params.ts → sources.ts）
}
```

既存側の確定手順（試験 adapter が実装している約束）：

1. `commandId` が既にあれば、同じ内容なら前回の結果を返し、内容が違えば拒否する。世界は変えない。
2. 全ての put の `expectVersion` を現在の版と比較し、一つでも違えば全体を拒否（`conflict`）。
3. 質量の不変条件 `初期 ＋ 流入 − 流出 ＝ Σロット ＋ Σ試料`（整数 mg、完全一致）と、予約の過剰消費がないことを確認。
4. 一つの transaction で全部を書き、`worldVersion` を一つ進める。

途中の温度・反応の進み・燃やした燃料の累計・排出済みの量は `ProcessRun` に明示的な状態として入る。JSON で保存して読み戻すと、そのまま続きから同じ結果になる。

## 4. 時間と中断

- 工程は開始時刻からの固定刻み（乾燥 600 s、焼成 30 s）で進む。`advance` の区切り方を変えても結果は同じ（検査済み）。
- 焼成中の運用停止：最後の確定刻みで `halted_operational` にし、停止中の燃焼・温度を作らない。試料は `historyComplete=false` になり、習得手順の根拠に使えない。燃料切れ（世界内の出来事）とは別の結果コード。
- 乾燥中の運用停止：その区間の天候が不明なので計算せず、区間を記録して試料に印を付ける。
- 浸漬は天候に依存しないので、停止があっても結果は変わらない。

## 5. 保存への影響

- 既存の `seaglass.*` キー・保存形式・アプリの読み込みは一切変えていない。`src/science/` はアプリから import されず、バンドルに入らない。
- 統合時に既存側の DB へ入れるもの（論理テーブル）：materialLots、samples、facilities（既存 Work への参照に置き換える）、reservations、processRuns、observations、research、procedures、boundary、energy、events、command results。
- 試験世界（`worldId: civ-sim-test-clay-1`）のデータは本世界へ移さない。fixture の出所は `countsForWorldAchievement: false`。

## 6. 本体と揃える必要がある点（未決）

| 論点 | v0 の仮置き | 既存側に決めてほしいこと |
|---|---|---|
| 設備 | `Facility` を独自に持つ | 既存の Work/Part からの能力判定に置き換えるか、adapter で写すか |
| 材料単位 | 全て整数 mg | 品目ごとの最小単位（個数・長さとの対応） |
| 環境サンプル | command に直接入れる | 本体の `environmentSampleId` の参照と取得方法 |
| 実行器 | テストの台本が command を送る | 住民の実行器がいつ乾燥を終える・薪を足すか |
| 観察→記憶 | `Observation` を返すだけ | 本体の Memory への渡し方、他住民への伝聞 |
| AI | 使わない | 研究の問い・仮説・次の条件を AI に提案させる場合の gateway 経由の呼出と予算 |
| 事故 | v0 は事故を起こさない（消費は常に予約内） | 予約外の被害を Incident として束ねる接続 |
