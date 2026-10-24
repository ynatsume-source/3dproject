# rehearsal-1 の受入：main 90ae7ca（= 31948e9 + RUNBOOK.md のみ）

- tsc 0、fast 87/87、shader-check --all PASS、build 0。指紋は 1a2ce4e と一致。
- ライブの main-*.js は手元のビルドと、ビルド時刻と live チャンク名以外同じ。バンドルに claude-sonnet-5-5 が入っている。
- 通しテスト（scripts/soak-island.ts、48 h → 閉じて 12 h → 48 h、潮なし）：エラー0、平均 0.85 ms、一番重い1時間 2.88 ms、1フレームの最大 973 ms。98 時間の世界の記録は #110 の回（bf06565）と完全一致。
- 旧い保存の読み込み（SOAK_IN、12 h 閉じて 3 h）：#70 より前（soak2/save-old）、#70〜72 の頃（soak2/save-new）、174fc32 の頃（soak-174fc32/save-b）、87d65b5 の1週間（week/flat）の4本とも、エラー0で読めて動いた。#70 より前の保存は 758 KB → 444 KB（記録の上限への移行）。
