# #121 状態の文（R-002・R-003）受入の証拠（科学班、2026-10-25）

- 対象：PR #121 head 00c69aa（コードは 80e1e02 と同じ、差は docs/rehearsal/findings/README.md の1行）、main 7c8214e の上。
- typecheck：exit 0（typecheck.log）
- status-labels-check：PR で 85 種類すべてに文あり（labels.log）。同じ検査を main の residents.ts にかけると 17 種類が FAIL
  （labels-on-main.log）＝ 検査は不具合を捕まえられる。
- fast：88/88 PASS（fast-summary.log）。
- 指紋：miyako 328741924・kayama 197508419 が main と PR で同じ（fp-main.log / fp-pr.log、時間と slice 数だけ違う）。
- vite build：exit 0（build-tail.log）。
- 表示だけであることの読み：statusOf は文字列を返すだけ。呼び先は live の帯・観察の札・日誌の「いま」・POV・
  リハの status 行（main.ts getStatus）だけで、住民の判断（agent の文脈）・保存・世界の事実には入らない。
- 実行していない確認：ブラウザでの見た目、soak（表示だけの変更のため）。
