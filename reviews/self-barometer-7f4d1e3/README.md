# self-barometer-7f4d1e3

2026-10-09、自作の気圧計の全面レビュー。**A4件・追加Bなし、p16xとm03xの修正確認まで統合保留。** まずREVIEW.md、ClaudeへはCLAUDE_PROMPT.mdを共有する。

| 内容 | 場所 |
| --- | --- |
| 正式な結論・A/B/Cと修正方向 | REVIEW.md / FINDINGS.json |
| 封じる操作・旧器の互換 | vessel/ |
| セル内のあふれ・区切り・読み | intervals/ |
| 実測の一部を隠す照合・短い気圧欠測 | bounds/（summary.jsonは小さい索引） |
| 質量・実回収物の連鎖・流出近似の端 | mass/ |
| 根・連続ODE・短いτ・出典 | physics/ |
| 正常保存・版・本体・住人の情報 | host/ |
| 以前からの非保留Cの整理 | carryover/ |
| 公式302件・型検査・ビルド | logs/ |
| 対象・未変更確認・ファイルのハッシュ | target.json / SNAPSHOT.json / MANIFEST.json |

ZIPには対象のアプリ全体やnode_modulesは含めない。対象コミットと親をそれぞれ**隔離したコピー**に用意し、既存プロジェクトの依存を使う。診断は公開工程版定数から版を読み、対象ソースを差し替えない。

再実行には同梱run-diagnostics.pyを使う：

```sh
python3 run-diagnostics.py /path/to/target-7f4d1e3 /path/to/parent-dcdcf55 /path/to/new-output
```

新しい出力ディレクトリへ診断の写しと結果を保存し、ZIP内の元の証拠を上書きしない。cwdは対象。Nodeのtsxとscripts/node-assets.mjsを読み、元のrepoを変更しない。実行コマンド・終了コード・stdout/stderrは新しい出力に保存する。

**診断のexit0は指摘がないという意味ではない。** 意図的に見つけた反例をJSONへ保存する。正式な指摘はREVIEW.mdの4件。担当MEMOの番号は正式番号に読み替える。数学の高精度対照・実測weatherを隠す試験は実物の器を測定した校正ではない。

新規一次資料の原典PDF/HTMLは未ダウンロード。physics/source-textのNIST/Iowaは短いレビュー事実メモで、そのSHAを原典SHAとして扱わない。OpenStaxの3CNXMLだけは原文の生バイトとGit blobを再照合。資料は全てcalibrationEligible:false。

ファイル名はASCIIの標準ZIP（DEFLATE）。Androidでも通常のZIP展開アプリで読める形式。MANIFEST.jsonは自身を除く全ファイルのSHA-256を記録する。
