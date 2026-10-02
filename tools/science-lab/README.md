# 粘土の測定値確認

リポジトリのルートで `npm run dev` を実行し、表示されたローカルURLの
`/tools/science-lab/` を開く。ルートの index.html / main.ts からは接続しない。

同一試験片の質量（g）と、同じ方向・標点間の距離（mm）から定義に沿って計算する。
測定値の保存、時間経過、材料の消費・生成、世界の状態、ScienceStep は持たない。
新しい工程を実装する際は Claude 側の `src/science/step/index.ts` に登録する。
旧 `experiments/civilization-simulation` は参照用のまま。

入力は空欄から始まる。空欄は未測定であり、0・成功・完了と見なさない。
「乾燥後」は測定プロトコルの乾燥終点を指す。ゲーム内の dry ステージや常温平衡と同一とは限らない。
吸水の温度、保持時間、煮沸/常温浸漬、表面水の除去方法を記録し、異なる手順の測定を混ぜない。
表示する小数4桁は演算結果の桁数であり、装置精度や有効数字を保証しない。

数式と出典の不一致は [照合記録](../../docs/proposals/civilization/CODEX_CLAY_REVIEW.md) を参照。
出典一覧は `data/science/sources.json` を読む。外部スクリプト・追加ライブラリは使わない。

```sh
node tools/science-lab/measurements.test.mjs
node --check tools/science-lab/app.mjs
```

6件のテストは湿量/乾量基準、割合の合成、質量吸水率の分母、負値、欠測、不正入力を検査する。
LDWの釉薬スラリー例以外の試験値は合成した算術例であり、実測データではない。
この画面から物理係数や工程カタログを更新しない。
