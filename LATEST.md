# 最新レビュー：自作の気圧計の修正確認

2026-10-10。対象科学コミット：`731850666455de96a1e206028fc1cafe4f15f7c0`（codex/civilization-simulation）。前回7f4d1e3のSB-A1〜A4への軽い確認。

**前回4件は解消。追加A1件・Bなし・非保留C1件。p16x 0.1.4は保留解除可能。m03x 0.1.1は追加Aの修正確認まで保留。** 本体への統合は本体側の最終レビュー後。関連公式310件・型検査・ビルド各工程は成功（tsx CLIのIPC制限とローダーでの代替実行はログに記録）。

追加A（FX-SB-A1）：あふれ判定はセル先頭の気圧、数値の読みは要求の現在の気圧を使う。5 mm目盛りで保持軌道9に対し10を返す。細かい0.5 mm目盛りでは管口100を越えた101を返し、次セルで100に戻り、終了してもok・ground0・水20g全量返却。30秒保持の近似自体は採用可能だが、読み・あふれ・漏れを同じ気圧の軌道へそろえる必要がある。

- [レビュー本文](reviews/self-barometer-fix-7318506/REVIEW.md)
- [Claudeへ渡す詳しいプロンプト](reviews/self-barometer-fix-7318506/CLAUDE_PROMPT.md)
- [正式な指摘JSON](reviews/self-barometer-fix-7318506/FINDINGS.json)
- [診断の索引と再実行方法](reviews/self-barometer-fix-7318506/README.md)
- [診断・再現結果一式](reviews/self-barometer-fix-7318506/)
- [ZIP](archives/self-barometer-fix-7318506.zip)
- [前回の全面レビュー（上書きせず保存）](reviews/self-barometer-7f4d1e3/REVIEW.md)

## Claude Codeへ渡す短い文

ynatsume-source/3dproject の codex/science-reviews をfetchし、LATEST.mdとリンク先のREVIEW.mdを確認してください。対象は科学側7318506。SB-A1〜A4は解消、p16xは保留解除可能です。m03xの追加A（FX-SB-A1：scanの保持気圧とreadの現在の気圧の混在）を科学側で修正してください。30秒保持の近似は採用可能なので、読み・あふれ・漏れの軌道をそろえ、既知の気圧のセル途中の谷を回帰にしてください。SB-C3は非保留で次の全面レビューへ。lab・main・共有ブランチは変更しないでください。

## 作業中のブランチを変えず読む

```sh
git fetch origin refs/heads/codex/science-reviews:refs/remotes/origin/codex/science-reviews
git show origin/codex/science-reviews:LATEST.md
git show origin/codex/science-reviews:reviews/self-barometer-fix-7318506/REVIEW.md
```

ZIPの手動ダウンロード・再添付は不要。診断の実行が必要ならREADMEに従って別のディレクトリへ展開する。
