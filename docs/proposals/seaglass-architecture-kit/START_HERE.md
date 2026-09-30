# Seaglass｜長期AI開発のための設計キット v0.1

作成日：2026年9月30日  
対象：ynatsume-source/3dproject（Seaglass）  
状態：**提案。アプリへの適用・公開・依存関係の変更は行っていません。**

## この設計の結論

**世界の広がりは大きく描く。ただし、今実装するのは「小さくても同じ住民に再会できる世界」まで。**

既存の海・魚・光・天候の表現を捨てず、次の3点を少しずつ追加します。

1. 世界の事実、描画、AIの判断を分ける。
2. 個体のID・時間・保存形式・モジュール間の約束を決める。
3. AIに毎回渡す作業範囲と、壊していないことを確認するテストを残す。

これは大規模ゲームの完成仕様ではありません。「小さく育てるための境界」と「後から増やせる場所」を定義した設計です。将来構想のすべてを今実装する指示ではありません。

## 読む順番

| 対象 | ファイル | 用途 |
|---|---|---|
| まず本人が読む | docs/01-architecture.md | 全体構造と重要な境界 |
| 最初の導入時 | docs/00-current-state.md | 確認した現状と、未確認事項 |
| 保存・時間・広域化に触るとき | docs/02-world-runtime.md | ID、時間、更新、保存、共有世界 |
| 魚・サンゴ・海域を増やすとき | docs/03-content-and-ecology.md | 定義データ、見た目、行動の分担 |
| AI住民を作るとき | docs/04-resident-ai.md | 記憶、個性、判断、API費用、権限 |
| テスト・公開前 | docs/05-quality-and-operations.md | 品質、性能、運用、安全性 |
| 次の作業を選ぶとき | docs/06-roadmap.md | 小さな到達点と着手条件 |
| Claude Codeで作業するとき | docs/07-ai-development.md | 文書の管理と作業の進め方 |
| 開発ルールの導入候補 | CLAUDE.md.proposed | 既存ルールに照合して統合する案 |
| 最初にClaudeへ渡す | tasks/0001-baseline-audit.md | 読み取り・基準作り中心の初回依頼 |
| 日々の機能依頼 | tasks/TASK_TEMPLATE.md | 小さな作業指示の型 |
| 型の検討時だけ | examples/contracts.v0.ts | 独立した型定義例。未接続・未実装 |
| 設計判断を採択するとき | adr/0001-foundations.proposed.md | 判断理由と再検討条件 |
| 根拠を確認するとき | docs/08-sources.md | 公開コード・公式資料 |

## Claude Codeへの渡し方

ZIPを展開し、この `seaglass-architecture-kit` フォルダをプロジェクト直下に置いてください。既存の `src/`、`README.md`、`CLAUDE.md` を上書きする必要はありません。

その後、Claude Codeへ次を渡します。

```text
seaglass-architecture-kit/START_HERE.md と
seaglass-architecture-kit/tasks/0001-baseline-audit.md を読んでください。
このキットは提案であり、現コードの仕様を断定するものではありません。
まず現在のリポジトリ・既存の開発ルール・実行可能な検証方法と照合し、
現状対応表と、最初の小さな変更案を作ってください。
この依頼では、既存機能の書き換え、依存関係の更新、公開push、
有料APIの呼び出し、データ削除を行わないでください。
実際に実行した検証と、まだ実行していない検証を分けて報告してください。
```

提案を採用した部分だけ、プロジェクトの正式な設計文書・ルールへ移します。`CLAUDE.md.proposed` をそのまま既存の `CLAUDE.md` に上書きしないでください。未採用の提案を正式仕様として読ませないことが重要です。

## 検証範囲

公開 `main` のREADME、package.json、main.ts、data/locations.ts、time/clock.tsの関連箇所を確認しました。公開ページの実描画、リポジトリ全体の依存関係、ローカルでのbuildやシミュレーションは未検証です。参照した `main` のコミットSHAは固定できていないため、導入時に記録してください。

同梱のTypeScriptは設計上の例で、Seaglass本体に接続した実装ではありません。このキットを配置するだけでは、保存・AI住民・サーバーは動作しません。
