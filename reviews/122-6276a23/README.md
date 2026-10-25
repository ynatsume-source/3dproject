# #122 ライブの帯を「画面に出す形どうし」で比べる（R-010）受入の証拠（科学班、2026-10-25）

- 対象：PR #122 head 6276a23（コードは 38805af と同じ。そのあとの commit は docs/rehearsal/findings だけ）、main 4236dc4 の上。
- 科学班の検査 `trim-test.mts`：`trimStatus` は2回かけても同じ（距離・数だけの括弧を取り、言葉の括弧は残す）。30 m 歩く間、
  距離付きの文は 27 回変わるが、画面に出す形は1回しか変わらない（＝帯の出直しは起きない）。exit 0。
- typecheck exit 0、live-status・live-en・live-scrim PASS、vite build exit 0、fast 88/88 PASS。
- 実行していない確認：ブラウザでの見た目（帯の点滅が止まったことの映像での確認は、リハーサルの試運転で）。
