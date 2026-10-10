## 島だよりのローカル運用確認

### 変更

- `tools/journal/photos.cjs` の撮影入口を `#kayama` から `#planet` に変更。日次シミュレーションが `DOTWORLD` を使うのに、写真だけ地球の嘉弥真島へ入る不整合を解消。
- `scripts/journal-check.ts` の静的ページ検証を `process.execPath --import tsx` の非同期 `execFile` に変更。同じ独立プロセスで検証し、tsx CLI の IPC と同期 spawn の環境制約を回避。
- `docs/proposals/codex-followups-2026-10-10/AI_COST_PROPOSAL.md` にサーバー化の1ページ案を追加。実装・予算・方針の変更はなし。

### コマンドと結果（main `301d5fd` + 世界切替修正 `02a4323`）

作業ディレクトリは特記以外 `/workspace/3dproject`。実データを持つ `journal-data` ではなく、空の `/tmp` データから試した。

```sh
env -u ANTHROPIC_API_KEY node --import tsx --import ./scripts/node-assets.mjs scripts/journal-run.ts --data /tmp/codex-journal-main-2026-10-10 --day 2026-10-10 --dry
```

成功。6〜20時、100,800 step、1.5分。ドット/ラッコの下書き各1本、写真記録は2/3件。`postIssues` は空、`thinking=false`・`answered=0`・推定 `usd=0`。`calls=102` は AI の判断**試行**ログであり、API送信数ではない。キーなし・`--dry` により API 実通信は0。`storage.json` に住民保存あり、`seaglass.aikey` なし。

生成した `drafts/*.json` を `/tmp/codex-journal-main-preview/posts/`、`photos/` を同 preview の `photos/` へコピー後、次を実行した。

```sh
JOURNAL_DRAFTS=1 node --import tsx --import ./scripts/node-assets.mjs scripts/journal-pages.ts --src /tmp/codex-journal-main-preview --out /tmp/codex-journal-main-html
env -u JOURNAL_DRAFTS node --import tsx --import ./scripts/node-assets.mjs scripts/journal-pages.ts --src /tmp/codex-journal-main-preview --out /tmp/codex-journal-main-public
```

成功。前者は記事2本、HTML計5ページ（入口・著者2・記事2）、Atom記事2件。後者は記事0本、Atom記事0件。Pythonで記事題・AIなし下書き表示・写真未描画表示・公開出力への下書き除外を検査し PASS。

```sh
# cwd: /tmp/codex-journal-main-preview（content/journal の出力も /tmp 内）
node --import /workspace/3dproject/node_modules/tsx/dist/loader.mjs /workspace/3dproject/scripts/journal-propose.ts --data /tmp/codex-journal-main-2026-10-10 --day 2026-10-10
```

成功、`0 post(s) put forward`。`pr-2026-10-10.count=0`、説明文生成。AIなし下書きを公開提案から除外する実経路を確認。

```sh
env -u ANTHROPIC_API_KEY node --import tsx --import ./scripts/node-assets.mjs scripts/journal-check.ts
node --check tools/journal/photos.cjs
```

成功、journal-check の全18件 PASS。写真記録の検査・記事の再試行/SVG検査・承認済み体裁の記事と画像/図/フィードの静的ページ出力・下書き除外をスタブで確認。root の CI runner 再実行も journal PASS（0.925秒）。photos.cjs 構文確認も成功。

```sh
CHROME=/usr/bin/chromium node tools/journal/photos.cjs --data /tmp/codex-journal-main-2026-10-10
```

失敗（ページを開く前）。Chromium 起動時に `third_party/crashpad/.../socket.cc:45 setsockopt: Operation not permitted (1)`、終了 signal `SIGTRAP`。Playwright はグローバル環境にあり、Chromium は `/usr/bin/chromium` にある。写真記録5件に対し JPG は0件で、静的ページは「写真を準備中」。追加のブラウザ・権限・ネットワーク待ちは行わない。

### 流れと残件

現行 workflow は20:52 JSTに実行し、`journal-data` の保存 → 日次シミュレーション → 写真描画 → データブランチへ保存 → 記事PR → 人による main マージ → deploy workflow の `npm run build` → Pages 公開。今回はローカルの dry生成・静的HTML・dry稿の提案除外まで実行。実APIによる本文生成、正式 `journal-data` の続き、GitHub secrets/PR権限、ブランチ push、PR作成、マージ、Pages 配信は未確認・未実行。外部公開はしていない。

- 写真5枚の実描画と `#planet` での撮影を、ブラウザを起動できる環境で確認する必要がある。日次workflowには Playwright/Chromium 導入と build/preview の手順が既にある。
- 今回、ドットが撮ったヤシの実 `coconut#20` / `coconut#32` の `subject.label` が文字列 `"undefined"` だった。ラッコの3件は `貝殻`。画像未描画とは別の観測で、工程・アイテム担当に引き継ぐ（保護範囲を修正していない）。
- AI費用は現行では回数制限と一部の推定集計。月15,000円を全用途で守る gateway/予約台帳案は添付の `AI_COST_PROPOSAL.md` に記載。オーナー決定待ち、サーバー実装なし。

生成物は `/tmp/codex-journal-main-2026-10-10`、HTML は `/tmp/codex-journal-main-html`。ログは `/tmp/codex-journal-main-2026-10-10.log`、`/tmp/codex-journal-main-check.log`、`/tmp/codex-journal-main-photos.log`。
