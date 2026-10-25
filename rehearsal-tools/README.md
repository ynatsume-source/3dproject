# リハーサルの記録を読む道具（科学班、2026-10-25、main 6a3b0fc の記録形式）

- `analyze.mts`：`?rehearsal` の記録（`rehearsal-*.ndjson`）と、`seaglassRehearsal.saveOut()` の保存（`save-*.json`）を読んで
  Markdown の報告を出す。
  ```sh
  npx tsx analyze.mts rehearsal-20261031-0800.ndjson save-before.json save-after.json --yen 150
  ```
  出すもの：描画（1 秒ごとのフレーム数・間隔、250 ms を超えた間隔とその直前の仕事の内訳、時間ごと）、出来事（日誌・エラー・
  タブが隠れた回数・カード・字幕）、AI（日・呼び先ごとの回数・失敗の内訳・tokens・応答時間・費用）、住民 1 体あたり 1 日の
  費用（そのまま 24 時間に直した値と、1 日の上限回数 dailyCap で止まるとした値）、月の見込み、海面、保存の大きさと
  `seaglass.aikey` が入っていないことの確認。
- 値段は `src/robots/agent/config.ts` の PRICE と同じ表（入力・出力のみ）。記録に cache の tokens がないので、費用は上側の見積もり。
  円は既定で 1 ドル 150 円（`--yen` で変える）。
- dailyCap の表は main 6a3b0fc の `MINDS` から写した。設定が変わったら合わせる。
- `mkfake.mts`：試験用の作りものの記録（`fake.ndjson`、`fake-save.json`）を作る。実データではない。リポジトリには入れない。
- 映像の記録（視聴者体験設計班）との突き合わせは、記録の JST（秒まで、フレームはミリ秒まで）と画面右下の JST 時計で合わせる。
