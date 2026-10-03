# 秤量の統合手順書（案）

2026-10-03 / ブランチ `codex/civilization-simulation` / 対象 `fixture_mass_measure`（`src/science/step/simple.ts`、Codex lab 13a35fa から移植）

> 2026-10-03 追記：本体側が `fixture-1` を統合した（main 1c97313）。その回答を受けて `fixture-2` にした：カタログを `civ-sci-test-2` に一本化、停止と電力不足が重なったときは `stopped`、状態スキーマ `civilization-simple-process/2`（`/1` は `unsupported-schema`）、試験片の成形 `p11x_test_tile_shape` を追加。live 環境の許可は、依頼があったときに `fixture-3` で行う。下は `fixture-2` の内容。

**未採択の提案。** 本体へ最初につなぐ工程として、本体がどの値を渡し、何を一度だけ確定するかをまとめる。
本体への統合は、残件の確認と本体側の最終レビューの後に、本体側が行う。この文書はコードを変えない。

## 1. この工程がすること・しないこと

| する | しない |
|---|---|
| 予約したロット1つを、はかり1台で10秒かけて量る | ロットを消費・生成しない（重さは変わらない） |
| 住民が読んだ値を、はかりの観察（`instrument:eq:…`）として返す。100 mg 単位に丸め、精度 100 mg を添える | 本当の重さ（1 mg 単位）を観察に出さない |
| はかりの電力 1 W × 10 s = 10 J を、全量「損失」として返す | 熱・物質を外へ出さない |

## 2. 本体が渡すもの

```text
contract       '0.1.0'
requestId      runId + interval.from + 試行番号（再送は同じ値）
world          { worldId, worldEpoch, worldVersion }
runId          'run:…'（新しい run ごとに作る）
processId      'fixture_mass_measure'
processVersion 'fixture-2'
catalogVersion 'civ-sci-test-2'
interval       [from, to)：1000 ms の倍数、長さ 24 時間以内
state          最初は null、以後は前回の result.state をそのまま
environment    { sampleId: 'env:…', source: 'simulation', effectiveAt }   ← 3. の決めること①
lots           量るロット 1つだけ（lotId 'lot:…'、amount は整数 mg）
equipment      はかり 1台：kind = catalogEntry = 'fixture_balance'、catalogVersion 'civ-sci-test-2'、condition 1
energy         電気の申し出 1つ：{ sourceId: 'src:…', kind: 'electric', maxJ ≥ 10 }   ← 決めること②
actions        最初の要求に { at: from, residentId: 'res:…', action: 'read-balance' }
seed           整数（この工程では使わないが必須）
```

## 3. 統合の前に決めること

1. **環境の出どころ**：いまの実装は `environment.source === 'simulation'` 以外を `fixture-only` で拒否する（試験世界専用の安全装置）。
   秤量は天気に左右されないので、共有の島でつなぐなら、この制限を外すか「秤量だけ live を許す」へ変える必要がある。
   本体の回答：今は許可しない。共有の島の試験世界で動かす段階で、`live`・`stale` を許す版（`fixture-3`）を作る。`unknown` は拒否のまま。
2. **はかりの電気の出どころ**：原料から作る世界には、まだ電気がない。
   最初の統合では、本体が試験用の電源（例 `src:fixture-mains`）を申し出て、文明の達成には数えない。
   将来、自作の天秤（電気なし・0 J）へ置き換えるときは、別の工程として追加する。
3. **カタログ版**：`fixture-2` で `civ-sci-test-2` に一本化した（`data/science/catalog-test-2.json`、設備の一覧つき）。以前は秤量・成形が `civilization-fixture-1`、乾燥以降が `civ-sci-test-1` だった。
   最初の統合はこのまま渡す。2つを一本にまとめる作業は、成形・乾燥の統合（ロードマップ A2）の前に別の変更として行う。

## 4. 流れ（1回の秤量）

```text
本体：住民が「量る」と決める（AI ではなく、暮らしの規則か研究ノートの手順から）
 → ロットを読み取り予約（消費しない予約。秤量中に他の工程が同じロットを使わない）
 → 要求 [t, t+10 s) を送る
 → validateResult(req, res) で検査。違反があれば確定しない（直さずに捨てる）
 → status 'completed' なら一つの transaction で確定：
     ・ロットの量・場所は変えない
     ・エネルギー台帳：src の usedJ 10・lostJ 10
     ・観察を、read-balance をした住民の記憶へ（value・unit・precision ごと）
     ・run を閉じ、予約を解放
```

10秒を分けて送ってもよい（例 4 s + 6 s）。途中は `running` で状態だけが返り、観察は完了した区間の終わりに一度だけ出る。

## 5. 返ってくる status と本体の扱い

| status | いつ | 本体の扱い |
|---|---|---|
| `completed` | 10秒ぶん動いた | 上の確定をする |
| `running` | 区間が10秒より短い | 状態を保存し、次の区間を送る |
| `needs-input` | 電気が足りず途中で止まった（例 maxJ 5 → 5秒ぶんだけ）。停止の指示なし、または一時停止（world-pause・shutdown）のとき | 状態を保存し、電気を申し出て続きを送る。`simulated.to` から再開する（一時停止の後は、それより後からでもよい） |
| `stopped`（電力不足と重なったとき） | `stop: 'operator'` または `'equipment-lost'` の区間で電気が足りなかった（fixture-2 から。fixture-1 は needs-input だった） | 届いた電気の分だけ進んだところで run を閉じる。観察はない |
| `stopped` | `stop: 'operator'` などで中止 | 観察なしで run を閉じ、予約を解放 |
| `failed` | 入力が不正（`diagnostics.code` に理由） | 何も確定しない。run を閉じ、予約を解放 |

`stop: 'world-pause'` と `'shutdown'` は運用上の一時停止で、失敗ではない。次の要求は `from ≥ 前回の to` で再開できる。

主な `diagnostics.code`：

| code | 意味 |
|---|---|
| `fixture-only` | environment.source が simulation でない（決めること①） |
| `measurement-not-requested` | 最初の要求に read-balance がない |
| `one-energy-source-required` / `invalid-energy-offer` | 電気の申し出がない、または kind が electric でない |
| `unaligned-or-invalid-interval` | 1000 ms の倍数でない、または24時間を超える |
| `changed-input` | 途中でロットの中身・はかりが変わった |
| `noncontiguous-interval` | 前回の to から続いていない（一時停止の後を除く） |
| `unsupported-schema` / `unsupported-version` | 状態・工程・カタログの版が違う |

## 6. 一度だけ確定するために

- 同じ `requestId` の再送には同じ結果が返る（純粋な関数）。本体は `requestId` で重複を排し、二度確定しない。
- 観察は `completed` の結果にだけ載る。途中の区間を再送しても、観察が二重に記憶へ入ることはない。
- 本体のサーバーが止まったときは `shutdown` で区間を閉じ、再起動後に続きを送る。ロットは変わっていないので、物は失われない。

## 7. 確認済み・未確認

| 確認済み（科学側、2026-10-03） | 未確認 |
|---|---|
| 正常な秤量：36,290 mg のロット → 観察 36,300 mg・精度 100 mg、10 J、消費なし、validateResult 違反 0 | 本体のサーバー・台帳・予約での一度だけの確定 |
| 電気 5 J → `needs-input`（5秒ぶん）、区間 4 秒 → `running`、電気 5 J＋stop operator → `stopped`（5秒ぶん）、5 J＋world-pause → 後で再開して完了 | 住民の記憶への書き込みと表示 |
| live 環境 → `fixture-only`、read-balance なし → `measurement-not-requested`、1 ms ずれ → `unaligned-or-invalid-interval` | 本体側の検査（weigh-integration-check.ts）の fixture-2 への更新。版の定数を置き換えた写しでは、意図して変えた「停止＋電力不足」の1件以外の51件が成功 |
| `scripts/science-step-check.ts`（47件）のうち秤量・成形の項目（6b・6c） | |

## 8. 本体の画面で見えること（案）

ドットが試験片をはかりに載せ、少し待って読み上げる：「36.3 g」。
その値は本人の研究ノートに残り、浸漬の後にもう一度量ると、本人が吸水率を計算できる（計算は `tools/science-lab/measurements.mjs` の定義と同じ）。
