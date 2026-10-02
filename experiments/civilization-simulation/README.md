# 科学・文明の独立試験室

`codex/civilization-lab` の最初の検証。**本番には接続していない試験世界**。
成形 → 乾燥（加熱・蒸発・冷却）→ 秤量を、有限の材料・熱源・機械仕事・電力で実行する。
実物の粘土の乾燥・焼成を校正したモデルではない。[科学的根拠と仮定](../../docs/proposals/civilization/CODEX_SCIENCE_EVIDENCE.md)を参照。

## 実行

Node 22.18 以降（検証環境は 24.19.0）。デモは追加依存なし。
型検査・契約テストには本体が既に使っている TypeScript / tsx が必要（リポジトリで `npm ci`）。新しいライブラリは追加していない。

```sh
node experiments/civilization-simulation/demo.mjs
npm --prefix experiments/civilization-simulation test
npm --prefix experiments/civilization-simulation run typecheck
```

デモは JSON を標準出力に返す。2枚の同一組成・質量の試料について厚さのみを変更し、問い・仮説・比較条件・測定値・失敗・投入熱・収支を出す。
乾燥の時間上限は加熱と蒸発を合わせて2400秒、冷却は別に必要。途中で保存→復元を実行する。
結果例は[検証結果](../../docs/proposals/civilization/validation/demo-result.json)。

## 境界

- `kernel.ts` / `fixtures.ts` は**テスト用ホスト**。予約・在庫・時計・コマンド再送・チェックポイントを試験するためだけに存在し、本体へ移植しない。
- `src/science/step.ts` は main の `ScienceStep` 0.1.0 に準拠する純粋関数。現在は成形と秤量のfixture版のみ。状態・消費/生成案・観測を返し、時計・保存・在庫更新を行わない。
- 乾燥はこのラボ内で稼働。本体へ返す加工中ロットの更新契約を確定するまでは `ScienceStep` から実行しない。[接続方針](../../docs/proposals/civilization/CODEX_INTEGRATION.md)を参照。
- `data/science/process-catalog.reference.json` は引き継いだ82工程の原文。`concept-only` のままで、実行用レシピにしない。
- アプリの import、描画、保存形式、AI、サーバー、共有正本には接続しない。既存ロボットの battery を熱源や外部電力に使わない。

## 数値と再現性

質量は整数 mg、時刻はUTC ms、ラボの計算刻みは1秒。温度は°C、エネルギーはJ。
ラボの熱量は浮動小数点で持ち、収支許容差は `1e-6 J`。測定は100 mg分解能で丸め、含水量などの内部真値は観測へ出さない。
科学コアの初期2工程は整数Jで返す。リクエストは秒境界に揃え、最大24時間とする。未対応の小刻み区間は失敗を返す。

`checkpoint` は版・fixture設定・受理したコマンドをJSON化し、復元時に検査しながら再生する。現在時刻から不在期間を推測しない。
履歴は有限の試験用で無期限運用の保存方式ではない。運用停止は状態凍結、世界内の熱源不足・取消は途中試料を冷却して失敗として残す。

材料・設備・熱源は `external-test-fixture` として与える。嘉弥真島に存在する資源、初期窯の自作、原料由来の文明達成には数えない。
