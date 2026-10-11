# Codex 追加対応の引き継ぎ（2026-10-11）

作業ブランチ：`codex/hash-ci-followups-2026-10-11`。開始点は最新 main の `4b5397773a0a0abddb0b19f9c849292dd45d996c`（`1efdfc7` を含む）。main への push・公開は行っていない。前回分は `27ac939` で取り込み済み。

## 何を直したか

- 初回 CI を確認・整理した。初回は map 開始約4秒で取消、timeout ではない。後続と最新 main は fast 37/37 成功。島だより PR #5 は `action_required`、ジョブ未起動。詳細と URL は [CI_RESULTS.md](CI_RESULTS.md)。失敗を外す変更は不要だった。
- URL の `#kayama` / `#planet` などの変更と、履歴の戻る・進むで世界も切り替える。読込・浮上中は最後の要求を保留し、空 hash は地球儀、未知 hash は現在の表示を維持する。海から別世界へは既存の浮上・潜水を使い、URL 起点の移動は履歴を上書きしない。
- 同世界の再通知、地球儀からの再入場、起動300msと先行 UI 操作の競合、読込失敗後の再試行を処理した。再開位置の適用時は実際に表示中の世界も確認する。保存形式・世界識別子は前回のままで、住人の保存を消す処理は追加していない。
- 実アプリを操作する31段階のブラウザチェックと、専用の手動 CI を追加した。手順・範囲・制約は [BROWSER_CHECK.md](BROWSER_CHECK.md)。CLAUDE.md / ARCHITECTURE.md は実装・検証入口の事実だけ更新した。

## どう確かめたか

- `npx tsc --noEmit -p .`：成功。
- `npm run build`：成功（Vite / OG ページ / 島だよりページ生成）。
- `node scripts/checks.mjs fast --out /tmp/codex-followups2-results/fast`：37/37 成功、失敗・timeout 0。house / nav / wall / settle / map / mind / lamp / science-integration と worlds を含む。[FAST_RESULTS.md](FAST_RESULTS.md)。
- `world-switch-check.ts`：現実装53項目成功。最新 main の main.ts を指定すると13項目失敗し、hash-only・busy 中・起動競合の不具合を再現する。[VALIDATION.md](VALIDATION.md)。
- ブラウザチェックは構文・ヘルプと workflow の YAML 確認が成功。本実行は Chromium の `EPERM / SIGTRAP` で **BLOCKED、終了コード2、完了0段階**。描画・画像・ブラウザ動作の合格とは扱わない。
- 保護範囲（science / 自然・魚・海・水面 / residents.ts / process-catalog.ts / process-runner.ts）は開始点から差分0。住人の移動・工程・科学コアは変更していない。

## 残っていること

- Chromium と localhost の起動を許す環境で `npm run check:browser` を実行し、結果と画像をレビューする。新しい手動 CI は未実行。
- slow 52本の結果を取得する。既知の bait 不具合は今回未検証・未修正で、fast 成功を解決扱いにしていない。工程系で失敗が出た場合も、本体へ報告して source 修正はしない。
- PR #5 の GitHub 側 `action_required` の詳細確認。API は具体的理由を返していない。
- 本体のレビュー・ブランチ取り込み。乾かす棚・竹の管・器の封止・AI 費用管理の実装は今回の変更に含めていない。
