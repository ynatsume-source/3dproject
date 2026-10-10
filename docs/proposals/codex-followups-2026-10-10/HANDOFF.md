# Codex から本体への引き継ぎ

2026-10-10。ブランチ `codex/main-followups`、基点 main `301d5fdf92bf8abbfaa72ada0462f9c31572c225`。main への push・外部公開はしていない。本体レビュー後に取り込んでください。

## 直したこと

- 世界切替：海・準備済み・訪問・先行生成・観賞の再開位置／導入表示／出来事ログ／図鑑を世界別にした。地形ID `kayama` は維持、URL・共有・LAB は住人の星を `#planet` に統一。世界が曖昧な旧観賞キャッシュは再構築し、判別できる旧地球のログ・図鑑は引き継ぐ。住人の保存・記憶・工程は変更しない。移行の詳細は [VALIDATION.md](VALIDATION.md)。
- ランタンの台風検査：検査用の家が海上だった。`scripts/island-time-check.ts` の fixture だけ4行修正。seed 5 は修正前2/2回失敗、seed 1 / 6 の診断も同じ原因。修正後は全3 seed成功。c5180b1 の戸口や林の幹が原因ではなく、住人の移動コードは変更していない。
- CI：全89本を登録。毎回は型検査・build・fast 37本、夜間／手動は slow 52本を4分割。失敗・未登録・timeout を非ゼロにし、ログを保存。診断だけの11本は assertion 合格と区別する。
- 資料：CLAUDE.md・構成資料・ロードマップの古い事実を訂正。採択済みの方針や優先順位は変更していない。
- 島だより：写真入口を `#planet` に修正し、ページ検査の子プロセスを非同期 Node loader にした。[AI費用のサーバー化案](AI_COST_PROPOSAL.md) は1ページの提案だけで実装していない。

科学・自然・描画の保護範囲と `src/robots/residents.ts` は基点から差分なし。炭・タール・器の工程は触っていない。

## どう確かめたか

| コマンド | 結果 |
|---|---|
| `npx tsc --noEmit -p .` | 成功 |
| `npm run build` | 成功、OG 9か所・通常公開記事0本 |
| `node --import tsx --import ./scripts/node-assets.mjs scripts/world-switch-check.ts` | 修正後27項目成功。同じ検査で基点の main.ts は18項目失敗 |
| `npm run check:fast -- --out /tmp/codex-followups-fast` | 37本実行、36本成功、journal の同期 spawn 環境エラーで exit 1 |
| `node scripts/checks.mjs fast --only journal --out /tmp/codex-followups-journal-recheck` | 非同期起動へ修正後、成功・exit 0。これで全37本を個別に成功確認 |
| `node scripts/checks.mjs fast --only worlds,world-switch,journal --out /tmp/codex-followups-log-recheck` | ログ方式修正後、全3本成功・検査の出力本文も保持 |
| `node scripts/checks.mjs all --list` | 全89本の登録と分類を確認 |
| `journal-run.ts --data /tmp/codex-journal-main-2026-10-10 --day 2026-10-10 --dry` | 6〜20時を完走、下書き2本・写真記録5件、API通信0・費用0 |
| `journal-pages.ts` と `journal-propose.ts`（すべて `/tmp`） | プレビューHTML5ページ・Atom2件。通常公開と提案では下書き0件 |

指定の house・nav・wall・settle・map・mind・lamp・science-integration と worlds はすべて成功。fast 最長は house の46秒。全一括は再実行せず、失敗した journal とログ方式に関わる3本を再検証した。初回は pipe 出力が終了時に消えたため、ログfdへ直接書く方式に修正済み。コマンド全文・seed・測定値は [VALIDATION.md](VALIDATION.md)、[FAST_RESULTS.md](FAST_RESULTS.md)、[JOURNAL_LOCAL.md](JOURNAL_LOCAL.md)。

## 残っていること

- **基点 main の既存失敗**：`bait-check` の miyako は `told early 76` で失敗。今回 `step 5.86 ms` は10ms未満で、指摘にあった step 超過は再現せず。海の班へ引き継ぐ。slow CI から除外していない。
- 写真は Chromium がページ遷移前に `setsockopt EPERM` / `SIGTRAP` で起動失敗。実JPGは0枚。ブラウザを起動できる環境で5枚の撮影と `#planet` の実描画を確認する。
- 日次生成でドットのヤシの実2件（`coconut#20` / `coconut#32`）の `subject.label` が文字列 `"undefined"`。工程・アイテム担当へ報告し、今回は変更していない。
- 実APIの執筆、正式 journal-data の継続、secret／PR権限、push→PR→merge→Pages は未実行。現在の公開までの接続は [JOURNAL_LOCAL.md](JOURNAL_LOCAL.md) に記載。
- slow 全52本、新 CI のリモート実行、WebGL／GPU／HUD検査は未実行。月額AI台帳はオーナー判断待ち。

## 目的別コミット

`4ed92ad` 台風fixture、`02a4323` 世界切替、`3b6e858` CI、`08e616c` 資料の事実訂正、`ae0bb9c` 島だより検査の起動、`bd42f32` 写真の星の入口、`abba4ee` AI費用案、`84b08e2` 検査ログの保持。各コミット本文に理由を記載。最後にこの引き継ぎと検証記録をまとめる。
