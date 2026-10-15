# 縄づくりの作業場：読取専用の画面見本

PR18の隔離試作上の見本。main / public / 実住人 / 本番HUDへの接続はない。
`index.html`は画像・フォント・保存状態を内包する静的ファイル。開くと右上の選択欄または‹ ›で6状態を切り替えられる。これは保存記録の切替であり、工程を実行するボタンではない。右上の「詳細」で補足を開き、「閉じる」またはEscapeで同じ状態の通常表示へ戻る。詳細を開いたまま保存状態を切り替えられる。Enter/Spaceでも開閉できる。

## 見る順序

1. **浸漬・別の作業**：Aの容器は待機し、ドットはBの回収作業。待つ工程と住人の拘束を分ける。
2. **取り出して確認**：科学的に回収成功が保証された状態ではない。「確認待ち・完成未確認」と表示する。
3. **手作業中**：ドットがAを担当。一区切りで手を離せる。
4. **中断・続きあり**：仕事量を保存し、住人は解放。後で残りから再開できる。
5. **回収済み・縄は未完成**：実際の試験出力に繊維がある保存記録。画面の束は模式図で、乾燥・撚り・完成縄を描いたものではない。
6. **水不足・開始前**：正常な台帳から水を省いた開始要求が実際に拒否された例。材料を置いた誤記憶やrunを作らず、開始前として表示する。

この並びは状態比較の見本であり、一つの実運転を撮影した時系列映像ではない。A/Bの設備・人物の位置・海岸・背景の人物は配置の模式図で、実住人の位置や別の生活行為を捏造した観測ではない。Aの待機中にBを作業している状態は実際のworkflowのleaseから生成する。「別の暮らしを選べる」は解放状態を表し、食事などを実行したとは記録しない。

## 表示方針

**推奨：通常は2行の要点、詳細は必要時だけ開く。** 場面上の長い説明と下端パネルの重複を除き、設備はA/Bの短い表示にする。人物の位置・大きさは変えない。現在工程・ドットの並行作業/手の空き・状態/停止理由・次の手順は常に見える。

旧版b82219eとの同じ並行作業状態での比較：スマホ横の世界領域は71.2%から80.2%へ、補助文字は11pxから14pxへ。詳細を開くと未知の完了時刻と未実装工程を確認でき、閉じると世界領域が戻る。この一案で両目標を満たしたため、別案の操作系は追加していない。

- 16:9。通常の要点はPC18px、スマホ14px。詳細はPC15px、スマホ14px。文字の縮小・省略記号・スクロールで収めない。
- 自然処理は詳細に「完了時刻：不明」。試験用の確認予定・手作業秒数・科学的ETA・品質値はブラウザへ送らない。
- 詳細では乾燥・撚り・完成縄が**未実装**と明示。回収済み状態は通常表示でも縄未完成と明示し、完成縄の映像や成功扱いはない。
- 全表示パネルを、ドットと背景人物の全描画境界（頭・胴・手足・影）と照合する。全状態で文字・操作部の重なり、はみ出し、状態選択欄の省略を検査する。
- 世界可視率は舞台からヘッダ・下端パネル・A/Bラベルの矩形の**和集合**を引く保守的な面積。透明部分も覆ったものと数え、画面外の余白を加算しない。

| 画角 | 通常（目標80%以上） | 詳細（最低70%） |
|---|---:|---:|
| 1280×720 | 85.68% | 81.10% |
| 640×360 | 80.15% | 74.32% |

各値は全6状態の最小値。検査では丸める前の値で合否を判定する。640×360の通常表示は80%に近く、今後の文言追加時にも再検査が必要。

参照：既存の `docs/proposals/kayama-review/CAPTION_FOCUS_TAP.md` の「対象と説明が一致していない」指摘、`PROPOSAL_VIEW_PERF.md` の事実と表示の分離、ADR0002/0006。
指定された `docs/proposals/viewer-design-2026-10-11` は現在main、作業コピー、確認した関連refs（main-followups / hash-ci-followups / mobile-ui-review / resident-motion-v1）では見つからなかった。未確認の別保存先まで存在しないと断定していない。

## 画像

| 状態 | PC通常 | PC詳細 | スマホ通常 | スマホ詳細 |
|---|---|---|---|---|
| 浸漬と別作業 | [画像](evidence/1280-parallel.png) | [画像](evidence/1280-parallel-details.png) | [画像](evidence/640-parallel.png) | [画像](evidence/640-parallel-details.png) |
| 確認待ち | [画像](evidence/1280-check.png) | [画像](evidence/1280-check-details.png) | [画像](evidence/640-check.png) | [画像](evidence/640-check-details.png) |
| 手作業 | [画像](evidence/1280-working.png) | [画像](evidence/1280-working-details.png) | [画像](evidence/640-working.png) | [画像](evidence/640-working-details.png) |
| 中断 | [画像](evidence/1280-paused.png) | [画像](evidence/1280-paused-details.png) | [画像](evidence/640-paused.png) | [画像](evidence/640-paused-details.png) |
| 回収済み | [画像](evidence/1280-recovered.png) | [画像](evidence/1280-recovered-details.png) | [画像](evidence/640-recovered.png) | [画像](evidence/640-recovered-details.png) |
| 水不足 | [画像](evidence/1280-missing.png) | [画像](evidence/1280-missing-details.png) | [画像](evidence/640-missing.png) | [画像](evidence/640-missing-details.png) |

[寸法・面積・重なりの検査結果](evidence/report.json)。全24画面を再描画し、並行作業の両画角、中断・回収・水不足などのスマホ画像を目視確認した。

## データと非干渉の境界

`scripts/cord-worksite-fixtures.ts`だけが**生成時に**使い捨ての隔離sessionを進める。入力は全て試験用。各sessionを`projectCordWorkflow`で読み、ETA用のestimateを除いた保存済み表示データをHTMLへ埋め込む。実ユーザーの保存・外部AI・本番台帳は使わない。

ブラウザには物理・work command・記憶・sense/optionsForを実行するモジュールを渡さない。データは再帰的にfreezeし、切替はDOM/SVGの表示だけを変更する。ネットワーク取得・時計更新・ストレージ操作・アニメーションによる進行はない。フォントも埋込済み。

headless検査は6状態の生成、状態投影1000回ずつの前後不変、隠れた値/ETAの非混入、生成HTMLと入力ソースの一致を検査。browser検査は全24画面（6状態×2画角×通常/詳細）を撮影し、文字と矩形の重なり、要点・補助文字サイズ、通常80%/詳細70%の世界可視率、ドットと背景人物それぞれの全描画境界（頭・胴・手足・影を含む）と全表示パネルの重なり、各viewportで120回の切替前後のデータ同一性、ネットワーク0件、ストレージ参照なしを検査する。詳細のクリック/Enter/Space開閉、Escapeで閉じてフォーカスを戻すこと、開いたままの状態切替、前後ボタンも確認する。各状態の4要点と未知ETA/未実装表記を期待値と照合する。画面の生成後はworkflowの計算コード自体がないため、ブラウザからモデル状態を更新できない。

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

日本語の欠字を避けるため、[Google FontsのNoto Sans JP](https://github.com/google/fonts/tree/main/ofl/notosansjp)からこの見本の文字をsubset化して同梱。SIL OFLは`OFL.txt`。元TTF再取得2026-10-15、SHA256 `c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f`。subset WOFFは `fbd867c0fd01072b87992e087b8eca7ac8526e9cabbfe282b5076c2049e2e118`。HTMLに埋め込み、実行時のフォント通信を不要にした。文字追加時は新しい字の収録も確認する。今回のsubsetはtemplateとfixtureの全テキストから再生成した。

未検証：実ゲーム3Dとの一体化、縦画面、実機タッチ操作、利用者の理解度調査、科学的校正。ここは最初の画面レビュー用の隔離見本であり、本番HUDの完成ではない。

前版b82219eの独立確認後の修正：並行作業時だけドットのラベルを上へ移動。修正前の位置は拡張検査で背景人物との重なりとして失敗することを確認した。状態データと人物位置は変更していない。

今回の通常/詳細整理では場面上の人物説明を下端の要点に統合。埋込の6状態データはb82219eとバイト一致し、workflow/science/本番UIには変更なし。
