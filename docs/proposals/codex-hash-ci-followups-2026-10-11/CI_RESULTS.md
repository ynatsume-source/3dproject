# Headless checks 初回結果

確認日時：2026-10-11 07:36:44 UTC。接続済み GitHub ツールの GET で、run・job・jobログ・artifact情報を確認した。再実行・承認・GitHubへの書き込みは行っていない。

前回の9コミットを取り込んだ `27ac939` は、`7208a01` を第2親に持つマージコミット。その直後からの実行は以下の4件。

| 実行 | 開始日時（UTC） | 対象SHA | 結果 |
| --- | --- | --- | --- |
| [#1 初回](https://github.com/ynatsume-source/3dproject/actions/runs/38064643113) | 2026-10-10 15:41:43 | `27ac939` | `fast`取消、`slow`未実行。型検査・build成功、14チェック成功後にmapの途中で取消。 |
| [#2 初回完走](https://github.com/ynatsume-source/3dproject/actions/runs/38064712238) | 2026-10-10 15:42:44 | `1efdfc7` | `fast`成功。型検査・build・37/37チェック成功、失敗0。`slow`未実行。 |
| [#3 島だよりPR #5](https://github.com/ynatsume-source/3dproject/actions/runs/38068706540) | 2026-10-10 16:41:47 | `bd3b79b` | `action_required`、job 0件。チェックは起動していない。 |
| [#4 最新main](https://github.com/ynatsume-source/3dproject/actions/runs/38070122806) | 2026-10-10 17:02:41 | `4b53977` | `fast`成功。型検査・build・37/37チェック成功、失敗0。`slow`未実行。 |

## 取消・対応要求とチェック失敗の区別

初回のmapは15:42:53.928 UTCに開始し、約4秒後にGitHubの `The operation was canceled.` で打ち切られた。120秒のチェックtimeoutではない。直後のmain push（#2）と、同一branch/eventの前の実行を取り消す `cancel-in-progress` 設定に時刻が整合する。ログには取消の明示的な依頼者・理由は記載されていない。

#3のactorは `github-actions[bot]`。`approvals` と `pending_deployments` はいずれも空で、APIには `action_required` の具体的理由がない。PRのhead/baseは同一リポジトリであり、fork承認とは断定しない。チェック失敗として扱わない。

完走した#2と#4には失敗・timeoutがない。最新の37チェック合計は205.122秒、最長はhouseの57.294秒で、120秒上限内。実行環境はUbuntu 24.04 / Node 22.23.3。ActionsのNode移行警告とnpm依存の警告は出ているが、install・型検査・build・チェックは成功している。

## 未検証と証拠

pushではworkflowの条件どおり `slow` がskippedになる。確認時点のActions先頭100件には上記4件のHeadless checksのみで、毎日03:40 UTC予定のslow実行はまだ見当たらない。遅延・未起動の原因は未確認。**slow 52本、ブラウザ・GLSL・HUDは未検証**。前回記録した既存mainのbait不具合も、今回のfast成功で解決したとは判断しない。

- [#2のchecks-fast artifact](https://github.com/ynatsume-source/3dproject/actions/runs/38064712238/artifacts/11674597213)：jobログに `Finished 37 checks: 37 assertion passes, 0 diagnostics completed, 0 failures.` を確認。
- [#4のchecks-fast artifact](https://github.com/ynatsume-source/3dproject/actions/runs/38070122806/artifacts/11676358359)：同じ集計を確認。artifactは2026-10-24まで保持予定。
- [初回workflowの取消・実行条件](https://github.com/ynatsume-source/3dproject/blob/27ac939d5a6df253875ad3043e492e61cc7c9666/.github/workflows/checks.yml) と [取り込みの比較](https://github.com/ynatsume-source/3dproject/compare/7208a0169c77c20dd80840b03de375932b75ac00...27ac939d5a6df253875ad3043e492e61cc7c9666)。

この記録はCI結果の報告のみ。ソース・workflow・科学コア・住民の行動や工程を変更していない。
