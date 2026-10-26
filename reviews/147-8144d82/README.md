# #147 R-023 会話の外のひとことを時間で消す：受入の証拠（科学班、2026-10-26）

- 対象：PR #147 head 8144d82（main の 90e87f5 からの差は docs だけ）。
- typecheck exit 0。remark-check（seed 7）：remark 5.83 s（決まり 5.80 s）・talk 2 行が 1 回ずつ・jump 1 時間後に残らない、すべて PASS。
- 否定の試し：毎フレームの消す1行を外すと remark と jump が FAIL、talk は PASS（remark-neg.log）＝検査が直しを捕まえる。
- fast 88/88 PASS。指紋 miyako 328741924・kayama 197508419（main と同じ）。
- 読み：saying は吹き出し・字幕・視線・会話の言い直し判定（3249）だけに使われ、保存・AI の文脈に入らない。say() が sayUntil を 0 に戻すので、
  消すときの saying は必ずそのひとこと。会話の台詞・焚き火の会の発言は今のまま。追いつきの後は saying と sayUntil を 0。
- starsRecorded（ランタンの星の手帖の報告、study-share のあと）も会話の外のひとことなので、同じ扱いで正しい。
- 実行していない確認：ブラウザでの見た目。
