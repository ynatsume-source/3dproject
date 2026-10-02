# 最新mainとの接続方針

基準main：`41ccd18fc0d650f61c786fd5543ce430d480a55e`。
作業中に追加された `eec8a71` の [ADR 0002](../../adr/0002-shared-world-and-science-core.md)、[本体側の引き継ぎ](SCIENCE_HANDOFF.md)、[ScienceStep 0.1.0](../../../src/world/science-contract.ts) を取り込んだ。共通ファイルは変更していない。

**担当分離：Claudeからの依頼に従い、Codexの公開先は `codex/civilization-lab` とする。** [状態と経緯](CODEX_BRANCH_STATUS.md)。既存の `codex/civilization-simulation` はClaude側が継続し、Codexからは更新しない。

## 開発環境

`/workspace/3dproject-civilization`、ブランチ `codex/civilization-lab`。
既存 `/workspace/3dproject` は `work` / `68c4e43` のまま、追跡ファイルの変更なし。
`git clone --no-hardlinks` による別クローンで `.git` / index / refs / node_modules は独立。同一クラウド環境内の別作業領域であり、別マシンではない。
Claudeの別環境内の未公開ファイルは直接検査できない。本作業はその作業領域を参照・変更せず、公開されたmainと専用ブランチを境界にする。

Git直接接続が失敗したため、GitHubコネクタで必要なcommit/tree/blobを取得し、Gitオブジェクトを復元した。
各SHAを照合し、既存履歴からfast-forwardしている。mainの内容を別の自作コミットに置き換えていない。

## 所有権

| 場所 | 今回の役割 | 将来の扱い |
|---|---|---|
| `src/science/` | 純粋な成形/秤量の `ScienceStep` とfixture定義 | 本体が検査して呼ぶ計算部品。現在アプリからimportしていない |
| `data/science/` | 引き継ぎ82工程の原文、出典・SHA | 版つきの照合資料。実行解禁フラグにはしない |
| `experiments/civilization-simulation/` | 成形・乾燥・冷却・秤量の検証ホスト、予約と収支のテスト | 時計・在庫・再送・保存は試験用の代役。本体へコピーしない |
| `docs/proposals/civilization/CODEX_*.md` | 科学側の記録 | Claude最終レビュー用 |
| mainの正本・時計・台帳・AI・保存・配信 | 本体側の担当 | 科学側に二重実装しない |

## 0.1.0への最小接続

`scienceStep(req)` は `processVersion: fixture-1` / `catalogVersion: civilization-fixture-1`、`environment.source: simulation` のみ受理する。
`p11_pottery_shape` は質量を変えず `prepared_clay → unfired_pot` の案を完成時に一度返す。
`fixture_mass_measure` は補助測定であり、物を作らず、実在するfixture秤と `read-balance` 操作から100 mg分解能の観測だけを返す。
82工程の本世界版は未解禁。既存のカタログIDは変えず、fixtureの工程版で区別する。

- 入力の状態・配列を変更せず、ネットワーク/時計/保存/AI/外部乱数を使わない。
- 返却量はこの2工程では整数mg/J。供給不足なら可能な秒だけ進め `needs-input` を返す。
- UTC ms区間は1秒境界・最大24時間。許可範囲で区間を分割しても、最終状態・材料・総エネルギーは同じ。
- 版、状態スキーマ、世界/工程の紐付け、元ロット、設備、区間連続性を検査。未知のものは副作用なしで `failed`。
- `simulated.to` は実計算の終端。完成/供給不足なら短くなる。本体は要求の `to` まで進んだと仮定しない。
- `stop` は区間末尾で扱う。shutdown/world-pause後の時間の空白は状態を進めず再開できる。操作停止では未加工の入力を消費しない。
- これは保存状態への権限検証や署名ではない。本体は保存されたstateを正本から渡し、利用者が捏造したstateを受理しない。
- `requestId` の一度だけの確定、在庫の予約と更新、イベントの保存は本体側の一つのtransactionで行う。

## 乾燥の接続でレビューする点

乾燥の量/熱/時間計算はラボで実行・検査済みだが、`ScienceStep` では `p12_pottery_dry` を未対応として拒否する。
0.1.0には既存ロットの組成/質量を更新する専用フィールドがなく、ラボの「同じ試料IDを保ち、水だけが減る」を暗黙に接続すると二重計上しやすい。
次の小さなPRで本体側と方式を決める。

1. 加工中ロットを消費→再生成する方式なら、出力IDの割当て、来歴、次区間への予約引継ぎと、分割時の正味収支を定義する。
2. 組成成分別に予約・消費する方式なら、試料内の自由水を在庫の可搬水と混同しない所有/所在契約を定義する。
3. ラボの浮動小数Jを本体の整数J台帳へ移す際は、丸め残差の保持・供給元別の蓄熱/持ち出し・冷却の帰属を決める。
4. 将来の1秒未満の区間、外気・湿度、設備停止中の実環境変化、実粘土の校正を拡張する。

共通契約を先回りして変更せず、上記の解決を乾燥接続の受入条件にする。

## Claudeの最終レビュー後の小さな統合単位

1. 資料・fixture・不変条件の採択（本番動作なし）。
2. 秤量：本体の1ロットを予約し、観測だけを住民の記録へ渡す。
3. 成形：予約→機械仕事→完成の一度だけの消費/生成を本体のtransactionで検証する。
4. 乾燥：上記ロット更新と整数Jの契約を決め、原料・熱源・評価器を校正したfixtureへ接続する。
5. 研究の一周：本人の観測から条件を比較。住民の言語化は本体AI gateway/共通予算へ依頼する。

共有本番はG2の正本・資材台帳を前提にする。校正、原料の来歴、共有時計、復旧時の二重計上防止、Claudeのレビューを通してから各機能を接続する。
自作照明の達成、焼成、現地資源の採取、既存batteryの外部供給は、この試験の成功では有効にならない。
