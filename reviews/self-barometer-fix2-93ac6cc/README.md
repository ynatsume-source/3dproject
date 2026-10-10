# self-barometer-fix2-93ac6cc

科学側93ac6ccのFX-SB-A1への軽い修正確認。**解消・追加指摘なし、m03x 0.1.2のCodex保留解除。本体側の最終レビューへ。** p16xの解除は維持、SB-C3は非保留で次回。

| 内容 | 場所 |
| --- | --- |
| 結論・引き継ぎ | REVIEW.md / CLAUDE_PROMPT.md / FINDINGS.json |
| 前回5本の結果の小さい索引 | WITNESS_SUMMARY.json |
| 前回と同じ再現入力・結果 | bounds/ / intervals/ |
| 欠測セル・復元・旧工程版の独立確認 | focused/ |
| 公式35件・型検査・ビルド | logs/ |
| 依頼書・手順書・方針・差分 | reference/ |
| 対象・スクリプトの出どころ・ハッシュ | target.json / SCRIPT_PROVENANCE.json / MANIFEST.json |

前回のmjsスクリプトは一切編集していない。scan-localの結果内のtarget固定値は7318506のままだが、実行対象はtarget.jsonとlogs/diagnostic-commands.jsonで93ac6ccと確認できる。結果の古い固定文字列も元のまま保管する。

本体の作業ブランチを切り替えず、共有ブランチのGitオブジェクトを参照する。

```sh
git fetch origin refs/heads/codex/science-reviews:refs/remotes/origin/codex/science-reviews
git show origin/codex/science-reviews:LATEST.md
review_read_dir=$(mktemp -d /tmp/3dproject-review-read.XXXXXX)
git archive origin/codex/science-reviews reviews/self-barometer-fix2-93ac6cc | tar -x -C "$review_read_dir"
```

再実行には依存関係を用意した対象93ac6ccの隔離checkoutを使う。新しい出力先へ診断の写しを置き、既に共有した証拠を上書きしない。

```sh
python3 run-diagnostics.py /path/to/target-93ac6cc /path/to/new-output
python3 run-official-checks.py /path/to/target-93ac6cc /path/to/new-logs
```

独立確認の実行方法はfocused/MEMO.mdの内容とlogs/focused-command.jsonに記録した。新規一次資料の取得やsources.jsonの変更は行っていない。knownOutsideTubeNumericの意味はREVIEW.mdの説明に従い、診断のexit0や一つの索引欄だけで合否を決めない。
