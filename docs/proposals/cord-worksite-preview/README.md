# 縄づくりの作業場：読取専用の画面見本

PR18の隔離試作上の見本。main / public / 実住人 / 本番HUDへの接続はない。
`index.html`は画像・フォント・保存状態を内包する静的ファイル。開くと右上の選択欄または‹ ›で6状態を切り替えられる。これは保存記録の切替であり、工程を実行するボタンではない。

## 見る順序

1. **浸漬・別の作業**：Aの容器は待機し、ドットはBの回収作業。待つ工程と住人の拘束を分ける。
2. **取り出して確認**：科学的に回収成功が保証された状態ではない。「確認待ち・完成未確認」と表示する。
3. **手作業中**：ドットがAを担当。一区切りで手を離せる。
4. **中断・続きあり**：仕事量を保存し、住人は解放。後で残りから再開できる。
5. **回収済み・縄は未完成**：実際の試験出力に繊維がある保存記録。画面の束は模式図で、乾燥・撚り・完成縄を描いたものではない。
6. **水不足・開始前**：正常な台帳から水を省いた開始要求が実際に拒否された例。材料を置いた誤記憶やrunを作らず、開始前として表示する。

この並びは状態比較の見本であり、一つの実運転を撮影した時系列映像ではない。A/Bの設備・人物の位置・海岸・背景の人物は配置の模式図で、実住人の位置や別の生活行為を捏造した観測ではない。Aの待機中にBを作業している状態は実際のworkflowのleaseから生成する。「別の暮らしを選べる」は解放状態を表し、食事などを実行したとは記録しない。

## 表示方針

- 16:9。世界を大きく残し、下端の3列に「現在」「並行する仕事・手の空き」「次」を集約。
- 自然処理は「完了時刻：不明」。試験用の確認予定・手作業秒数・科学的ETA・品質値はブラウザへ送らない。
- 乾燥・撚り・完成縄は全画面で**未実装**と表示。完成縄の映像や成功扱いはない。
- 実際の画面で文字の重なり・はみ出し・人物ラベルによる人物の隠れを検査。試験の最小要点文字サイズは14px、補助文は11px（640×360）。
- 世界の可視率は、舞台全体からヘッダ・下端パネル・全ラベル・注記の矩形の**和集合**を引いた保守的な面積。透明部分も覆ったものとして数える。画面外の余白を世界面積に加算しない。
- 1280×720：全状態で **81.35%以上**。640×360：全状態で **71.19%以上**。スマホは最低70%を満たすが理想80%には届かない。可読性を落として数字だけを達成する調整はしていない。

参照：既存の `docs/proposals/kayama-review/CAPTION_FOCUS_TAP.md` の「対象と説明が一致していない」指摘、`PROPOSAL_VIEW_PERF.md` の事実と表示の分離、ADR0002/0006。
指定された `docs/proposals/viewer-design-2026-10-11` は現在main、作業コピー、確認した関連refs（main-followups / hash-ci-followups / mobile-ui-review / resident-motion-v1）では見つからなかった。未確認の別保存先まで存在しないと断定していない。

## 画像

| 状態 | 1280×720 | 640×360 |
|---|---|---|
| 浸漬と別作業 | [画像](evidence/1280-parallel.png) | [画像](evidence/640-parallel.png) |
| 確認待ち | [画像](evidence/1280-check.png) | [画像](evidence/640-check.png) |
| 手作業 | [画像](evidence/1280-working.png) | [画像](evidence/640-working.png) |
| 中断 | [画像](evidence/1280-paused.png) | [画像](evidence/640-paused.png) |
| 回収済み | [画像](evidence/1280-recovered.png) | [画像](evidence/640-recovered.png) |
| 水不足 | [画像](evidence/1280-missing.png) | [画像](evidence/640-missing.png) |

[寸法・面積・重なりの検査結果](evidence/report.json)。手作業中・並行作業・中断・水不足の画像を実描画後に目視確認した。

## データと非干渉の境界

`scripts/cord-worksite-fixtures.ts`だけが**生成時に**使い捨ての隔離sessionを進める。入力は全て試験用。各sessionを`projectCordWorkflow`で読み、ETA用のestimateを除いた保存済み表示データをHTMLへ埋め込む。実ユーザーの保存・外部AI・本番台帳は使わない。

ブラウザには物理・work command・記憶・sense/optionsForを実行するモジュールを渡さない。データは再帰的にfreezeし、切替はDOM/SVGの表示だけを変更する。ネットワーク取得・時計更新・ストレージ操作・アニメーションによる進行はない。フォントも埋込済み。

headless検査は6状態の生成、状態投影1000回ずつの前後不変、隠れた値/ETAの非混入、生成HTMLと入力ソースの一致を検査。browser検査は全12画面を撮影し、文字と矩形の重なり、要点文字サイズ、世界可視率、住人の隠れ、各viewportで120回の切替前後のデータ同一性、ネットワーク0件、ストレージ参照なしを検査する。画面の生成後はworkflowの計算コード自体がないため、ブラウザからモデル状態を更新できない。

## 再現

```sh
node --import tsx --import ./scripts/node-assets.mjs scripts/cord-worksite-check.ts --write
node --import tsx --import ./scripts/node-assets.mjs scripts/cord-worksite-check.ts
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM=/path/to/chromium \
  CORD_SCREENSHOT_OUT=docs/proposals/cord-worksite-preview/evidence \
  node scripts/cord-worksite-browser-check.mjs
```

Playwrightが通常のnode_modulesにある場合は環境変数を省略できる。専用CIはPlaywright 1.57.0で同じ検査を行い画像をartifact保存する。ブラウザ検査はHTMLをsetContentでメモリ上に読み、ローカルファイルのブラウザ権限に依存しない。
閲覧はHTMLをローカルで開くか、必要なら `python3 -m http.server 5318 --bind 127.0.0.1 --directory docs/proposals/cord-worksite-preview`。外部公開は行わない。

## フォント

日本語の欠字を避けるため、[Google FontsのNoto Sans JP](https://github.com/google/fonts/tree/main/ofl/notosansjp)からこの見本の文字をsubset化して同梱。SIL OFLは`OFL.txt`。元TTF取得2026-10-14、SHA256 `c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f`。subset WOFFは `50d052c966202bc8b7a5ac021d5494474e5252ed65bd4c6428a950e2840cec1c`。HTMLに埋め込み、実行時のフォント通信を不要にした。文字追加時は新しい字の収録も確認する。

未検証：実ゲーム3Dとの一体化、縦画面、実機タッチ操作、利用者の理解度調査、科学的校正。ここは最初の画面レビュー用の隔離見本であり、本番HUDの完成ではない。
