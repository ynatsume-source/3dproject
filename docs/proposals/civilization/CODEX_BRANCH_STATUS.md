# 同名ブランチの担当分離（解決）

> 続報：lab `13a35fa` はClaudeがレビューし、必要な部分を科学ブランチ `90c9d24` へ選択取り込み済み。
> Codexはlabで継続する。[今回の範囲と引き継ぎ](CODEX_CLAY_REVIEW.md)。以下は初回分離時点の履歴。

2026-10-03（JST）。**Claudeからの依頼に従い、Codex成果の公開先を `codex/civilization-lab` に分離する。基準mainは `41ccd18` のまま。本体への統合は未実施。**

`codex/civilization-simulation` はClaude側のブランチとして維持する。以下は分離前の確認記録であり、旧ローカルコミットIDは公開後のコミットIDとは区別する。

## 確認した状態

- 作業開始時のGitHubブランチ一覧に `codex/civilization-simulation` はなかった。
- Codexは `/workspace/3dproject-civilization` の別クローンで同名のローカルブランチを作成し、main `41ccd18` を取り込んで検証した。
- 公開前の再確認で、別のClaudeセッションが同名リモートブランチに4コミットを追加していた。先端は `75a3eb1dc6d3a2fbe903c0c93a5866d0ae38725f`。4件のコミット時刻は2026-10-03 00:10:42〜43 JST。
- そのブランチの基準mainは `441b646`。最新mainの `eec8a71`（ADR 0002とScienceStep）をまだ含まない。
- Codexの実装コミットは `2f53b300b47f58c4f995e1b1ebcb3de077de3bef`。main `41ccd18` が親。
- 両者の追加は各18ファイル、同一ファイルパスの変更は0。工程の実装と契約の内容には重複がある。
- リモートのforce push・更新、mainへのmergeは行っていない。

## 内容の比較

| | Claude側 `75a3eb1` | Codex側 `2f53b30` |
|---|---|---|
| 試験 | 調製・成形・乾燥・焼成/冷却・浸漬・目視/打音・研究 | 成形・乾燥/冷却・秤量、2条件比較 |
| 科学的根拠 | 原典本文未取得、検索要約/ゲーム仮定 | OpenStax公式本文の熱・比熱・蒸発原理を照合、粘土固有は未校正 |
| 接続 | 独自 `propose(view, command)`、`civ-sci/0.1`（仮） | 最新mainの `ScienceStep 0.1.0` に成形/秤量の最小fixtureを合わせた |
| ラボ | `src/science/fixture/` | `experiments/civilization-simulation/` |
| 実行確認 | 50 passed / 0 failedをCodexの読み取り用worktreeでも再確認 | 33 passed / 0 failed、本体/strict型検査、ビルドとOG生成 |
| 本番 | 未接続 | 未接続 |

Claude側は `/workspace/3dproject-civilization-review` のdetached worktreeへ取得して検証した。既存のClaude環境は編集していない。
実行：`node --import /workspace/3dproject-civilization/node_modules/tsx/dist/loader.mjs scripts/science-clay-check.ts`（cwdはreview worktree）。

## 推奨する整理

担当方針はユーザー経由のClaudeの依頼で確定：Codexは独立した `codex/civilization-lab` へ成果を公開する。Claude側の既存工程を主線として保持し、レビュー後にCodexの出典カード・収支の対照試験・最新main契約との差分確認を選択的に取り込む。
2つの世界ホストや2系統の科学APIをそのまま本番へ接続しない。科学原典を照合した範囲だけを出典へ昇格し、粘土の割れや焼成の係数まで確認済みにしない。

今後Codexは `codex/civilization-lab` を使い、更新時はそのリモート先端を再取得する。Claude側ブランチの上書き・force pushは行わない。直接Git接続が使えない場合はGitHubコネクタで同じ内容のtree/commitを公開し、ローカルとのtree SHA一致を検証する。
共通契約の変更、本体への接続・採択はClaudeの最終レビュー後、小さな機能単位にする。
