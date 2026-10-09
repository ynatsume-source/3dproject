# 3dproject 科学レビュー共有

共有先：`ynatsume-source/3dproject` の `codex/science-reviews`。

入口は [LATEST.md](LATEST.md)。Claude Codeへは「レビュー共有ブランチのLATEST.mdを読んで」と伝える。レビュー本文・共有用プロンプト・診断スクリプト・再現結果が展開済みで入っている。

このブランチはレビュー成果だけの独立した履歴として作成した。アプリの実装は科学側と本体側のブランチで扱う。作業中のmain・lab・科学側のcheckoutを切り替えず、Gitのオブジェクトを読んで共有内容を参照できる。

```sh
git fetch origin refs/heads/codex/science-reviews:refs/remotes/origin/codex/science-reviews
git show origin/codex/science-reviews:LATEST.md
```

診断をローカルで読む/実行する場合は、別の一時ディレクトリへ展開する。

```sh
review_read_dir=$(mktemp -d /tmp/3dproject-review-read.XXXXXX)
git archive origin/codex/science-reviews reviews/self-barometer-7f4d1e3 | tar -x -C "$review_read_dir"
```

## ファイル

- `LATEST.md`：最新の対象・結論・本文とプロンプトへのリンク。
- `latest.json`：最新の対象SHA・成果の場所・判定。
- `reviews/<review-name>/`：過去も含めて保存するレビュー一式。
- `archives/<review-name>.zip`：同じ内容のダウンロード用ZIP。

## 今後の更新

1. 新しいレビューごとに、新しい名前のディレクトリへ成果を追加する。
2. 既に共有した診断・結果・ZIPを上書きせず、対象コミットとハッシュを保持する。
3. `LATEST.md`と`latest.json`を最新へ更新する。
4. push先は`codex/science-reviews`のみ。force push・アプリへのmergeは行わない。
5. チャットでは共有先・対象SHA・短いClaude用プロンプトを渡す。

科学側が行う修正・本体の最終レビュー・小さな単位での統合の分担は、各レビュー本文に従う。ここにある診断のexit0は、A/Bがないという意味ではない。REVIEW.mdと結果JSONも確認する。
