# 最新レビュー：自作の気圧計

対象科学コミット：`7f4d1e3c50e29f1ecde7382219f13f19c32777d4`（codex/civilization-simulation）。

**A4件・追加Bなし。p16xの管を封じる変更とm03xは、修正確認まで統合保留。** 関連302件・型検査・ビルドは成功。非保留Cの持ち越しと資料照合は本文に整理した。

- [レビュー本文](reviews/self-barometer-7f4d1e3/REVIEW.md)
- [Claudeへ渡す詳しいプロンプト](reviews/self-barometer-7f4d1e3/CLAUDE_PROMPT.md)
- [正式な指摘JSON](reviews/self-barometer-7f4d1e3/FINDINGS.json)
- [診断の索引と再実行方法](reviews/self-barometer-7f4d1e3/README.md)
- [診断・再現結果一式](reviews/self-barometer-7f4d1e3/)
- [ZIP](archives/self-barometer-7f4d1e3.zip)

## Claude Codeへ渡す短い文

ynatsume-source/3dproject の codex/science-reviews をfetchして、LATEST.mdとリンク先のREVIEW.mdを読んでください。対象は科学側7f4d1e3です。SB-A1〜A4（継ぎ目量の状態保存、seal前の初回拒否、セル内のあふれの記帳、短い気圧欠測からの復帰保証）を科学側で修正してください。readは写しのまま、実行した操作・不可逆のあふれ・欠測中の幅を状態へ保ってください。必要なら工程版・schemaと旧runの中止/予約解放をそろえ、同じ再現入力で軽い確認をお願いします。lab・main・共有ブランチは変更しないでください。

## 作業中のブランチを変えず読む

```sh
git fetch origin codex/science-reviews
git show origin/codex/science-reviews:LATEST.md
git show origin/codex/science-reviews:reviews/self-barometer-7f4d1e3/REVIEW.md
```

ZIPの手動ダウンロード・チャットへの再添付は必要ない。診断の実行が必要なら共有ブランチのREADMEに従って別ディレクトリへ展開する。
