# self-barometer-fix-7318506

科学側7318506のSB-A1〜A4に対する軽い修正確認。前回4件は解消。追加A1件・Bなし・非保留C1件。**p16xは保留解除可能、m03xは追加Aの修正確認まで保留。** 結論はREVIEW.md、引き継ぎ文はCLAUDE_PROMPT.md。

| 内容 | 場所 |
| --- | --- |
| 結論・指摘 | REVIEW.md / FINDINGS.json |
| 最初のseal、管の返却・再投入、旧器互換 | vessel/ |
| セル内のあふれ、終了・読み・区切り、非保留C | intervals/ |
| 欠測復帰、気圧の使い分けの新A、保持近似への意見 | bounds/ |
| 主担当による同じ保存入力の再確認 | independent-witness.json |
| 公式310件・型検査・ビルド | logs/ |
| 依頼書・方針・変更箇所 | reference/ |
| 対象・未変更確認・ハッシュ | target.json / SNAPSHOT.json / MANIFEST.json |

入力ソースは対象コミット7318506、旧器比較にはdcdcf554。依存関係を用意した隔離したcheckoutを使う。本体の作業場所・ブランチを切り替えず、別のディレクトリへレビューを展開する。

```sh
git fetch origin refs/heads/codex/science-reviews:refs/remotes/origin/codex/science-reviews
review_read_dir=$(mktemp -d /tmp/3dproject-review-read.XXXXXX)
git archive origin/codex/science-reviews reviews/self-barometer-fix-7318506 | tar -x -C "$review_read_dir"
```

展開したrun-diagnostics.pyは、診断をさらに新しい出力場所へ写して実行する。元の結果を上書きしない。

```sh
python3 run-diagnostics.py /path/to/target-7318506 /path/to/parent-dcdcf554 /path/to/new-output
```

関連公式チェックはrun-official-checks.pyから別の出力先へ保存できる。`.mjs`個別の実行方法は担当MEMO.mdにもある。

```sh
python3 run-official-checks.py /path/to/target-7318506 /path/to/new-logs
```

**診断のexit0は指摘なしを意味しない。** 再現と判定はREVIEW.mdとFINDINGS.jsonを読む。vessel/original-reproは前回の写しなので、結果の古いtarget固定文字列と状態版の差の期待はMEMO.mdに説明した。intervals/reproの未来状態だけは/3へ更新し、旧/1の拒否も追加した。ソースは差し替えない。

今回は新しい一次資料の取得・sources.jsonへの提案追加は行っていない。前回の校正や持ち越しCの結論を今回の検査で拡張しない。
