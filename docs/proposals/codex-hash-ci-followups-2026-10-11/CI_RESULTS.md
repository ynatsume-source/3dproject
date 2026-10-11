# Headless checks 初回結果

確認日時：2026-10-11 07:36:44 UTC。接続済み GitHub ツールの GET で、run・job・jobログ・artifact情報を確認した。再実行・承認・GitHubへの書き込みは行っていない。

前回の9コミットを取り込んだ `27ac939` は、`7208a01` を第2親に持つマージコミット。その直後からの実行は以下の4件。

| 実行 | 開始日時（UTC） | 対象SHA | 結果 |
| --- | --- | --- | --- |
| [#1 初回](https://github.com/ynatsume-source/3dproject/actions/runs/38064643113) | 2026-10-10 15:41:43 | `27ac939` | `fast`取消、`slow`未実行。型検査・build成功、14チェック成功後にmapの途中で取消。 |
| [#2 初回完走](https://github.com/ynatsume-source/3dproject/actions/runs/38064712238) | 2026-10-10 15:42:44 | `1efdfc7` | `fast`成功。型検査・build・37/37チェック成功、失敗0。`slow`未実行。 |
| [#3 島だよりPR #5](https://github.com/ynatsume-source/3dproject/actions/runs/38068706540) | 2026-10-10 16:41:47 | `bd3b79b` | `action_required`、job 0件。チェックは起動していない。 |
| [#4 当時の最新main](https://github.com/ynatsume-source/3dproject/actions/runs/38070122806) | 2026-10-10 17:02:41 | `4b53977` | `fast`成功。型検査・build・37/37チェック成功、失敗0。`slow`未実行。 |

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

## 2026-10-11 午後の追記

追加確認日時：2026-10-11 17:44:59 UTC。接続済みGitHubツールで `actions/runs?per_page=20`、各jobとログ、artifact情報を再確認した。上の「未検証」は07:36時点の記録であり、その後、次の4件が追加された。mainは `4b53977` → `88e1e53` → `8d14219` と更新されている。

| 実行 | 開始日時（UTC） | 対象SHA | 結果 |
| --- | --- | --- | --- |
| [#5 main push](https://github.com/ynatsume-source/3dproject/actions/runs/38126057089) | 2026-10-11 08:47:33 | `88e1e53` | `fast`成功。install・型検査・build・37/37チェック成功、失敗0。`slow`未実行。 |
| [#6 夜間schedule](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459) | 2026-10-11 10:17:19 | `88e1e53` | `slow`4 shardを実行し、3 shardが失敗、1 shardが成功。`fast`未実行。 |
| [#7 最新main push](https://github.com/ynatsume-source/3dproject/actions/runs/38137866941) | 2026-10-11 12:04:05 | `8d14219` | `fast`成功。install・型検査・build・37/37チェック成功、失敗0。`slow`未実行。 |
| [#8 PR](https://github.com/ynatsume-source/3dproject/actions/runs/38157949264) | 2026-10-11 17:02:15 | `fe8ce61` | `action_required`、job 0件。チェックは起動しておらず、要求理由は未確認。 |

#6のslowは全52本を起動し、集計は **35 assertion passes、11 diagnostics completed、6 failures**。diagnosticの完了は挙動が正しいというassertion成功を意味しない。各shardのinstallとartifact保存は成功し、失敗後も残りのチェックを実行した。

| shard | job結果 | assertion成功 | diagnostic完了 | 失敗 |
| --- | --- | ---: | ---: | --- |
| [slow 1](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/job/114446339545) | failure | 8 | 3 | carpet、manta |
| [slow 2](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/job/114446339742) | failure | 9 | 3 | eagleray（timeout） |
| [slow 3](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/job/114446339703) | failure | 8 | 2 | bait、jacks（timeout）、turtle-view |
| [slow 4](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/job/114446339709) | success | 10 | 3 | なし |

| 失敗check | runner結果 | 経過秒 | 確認できた原因・限界 |
| --- | --- | ---: | --- |
| carpet | FAILED | 639.856 | 子プロセスが非ゼロ終了。具体的なassertion・例外は未取得。 |
| manta | FAILED | 2.228 | 子プロセスが非ゼロ終了。具体的なassertion・例外は未取得。 |
| bait | FAILED | 244.161 | 子プロセスが非ゼロ終了。前回のmain基準でも不具合を記録しているが、今回も同じ原因かは未確認。 |
| eagleray | TIMED-OUT | 1200.123 | チェック単位の1200秒上限。 |
| jacks | TIMED-OUT | 1200.066 | チェック単位の1200秒上限。 |
| turtle-view | FAILED | 41.838 | 子プロセスが非ゼロ終了。具体的なassertion・例外は未取得。 |

今回の6件は、main `88e1e53` の実行で観測した結果。job全体のtimeoutや取消ではない。install失敗はないが、4本の非ゼロ終了がassertion失敗か実行時例外かを区別するには個別ログが必要であり、環境要因とも断定しない。最新main `8d14219` ではfastのみを確認しており、slowの再検証はしていない。ブラウザ・GLSL・HUDも引き続き未検証。

個別のstdout/stderrと集計JSONを含むartifactは以下。GitHubツールからのdownload結果はFile Service参照のみで、今回利用できるローカルdownloadツールの対応外だったため、zip内の具体的assertionまでは取得していない。保持期限は2026-10-25予定。

- [checks-slow-1](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/artifacts/11700186509)：carpet、manta。
- [checks-slow-2](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/artifacts/11699739608)：eagleray。
- [checks-slow-3](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/artifacts/11700725323)：bait、jacks、turtle-view。
- [checks-slow-4](https://github.com/ynatsume-source/3dproject/actions/runs/38131412459/artifacts/11699388924)：失敗なし。
