# 実機リハーサルの手順（rehearsal-1、2026-10-31〜）

家の PC で、決まった commit（`23f2c17`、科学班が受入したもの。#121・#122 の表示の直しが入った版。タグ名 `rehearsal-1`）をビルドして、24〜48 時間動かす。視聴者の記録は `docs/proposals/viewer-design-2026-10-16/REHEARSAL.md`、アプリが書き出す記録は `src/ui/rehearsal-log.ts`。

## 0. 用意するもの
- Node.js 22 と git、Chrome（または Edge）。
- AI のリハーサル専用キー（Console の workspace に月額の上限を付けたもの）。
- YouTube のストリームキー（限定公開・自動停止オフ・遅延は通常）と配信ソフト（1080p30、映像 14 Mbps 前後、キーフレーム 2 秒）。配信 PC 側でも同時に録画する。
- 画面のスリープとスクリーンセーバーを切る。**ブラウザのウィンドウを最小化しない、ほかのタブに切り替えない、ほかのウィンドウで覆わない**（アプリは隠れると止まる。記録には `hidden` と残る）。Windows の Chrome・Edge は、ほかのウィンドウに完全に覆われただけでも「隠れた」扱いにすることがある（ウィンドウの遮蔽の検出）。モニターが 2 台なら、ブラウザと OBS を別々の画面に置く。
- 遮蔽の検出を切るには、リハーサル用にブラウザをこのオプション付きで起こす（ショートカットの「リンク先」の末尾に足す。ほかのブラウザのウィンドウを全部閉じてから起こす）：
  ```
  --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows
  ```

## 1. ビルド（10/30 まで）
```
git clone https://github.com/ynatsume-source/3dproject.git      （2 回目からは: git fetch --tags）
cd 3dproject
git checkout 23f2c17cf65712782f600b169d0061b23866cf35
git tag rehearsal-1 && git push origin rehearsal-1   （目印。本体の環境からはタグを送れないため、家の PC で付ける。1 回だけ）
npm ci
npm run build
npx vite preview --port 4173 --strictPort
```
- リハーサルの間、このフォルダで `git pull`・`npm run build` をしない。preview を止めない。
- `localhost:4173` の島は公開サイトとは別で、新しい島から始まる。

## 2. キーを入れる
1. `http://localhost:4173/#kayama` を開く（`?live` なし）。
2. 島の画面で Z（図鑑のパネル）→ タブ「島の住人」を開き、一番下の API キーの欄にリハーサル専用キーを入れて「保存」。キーはこのブラウザの中にだけ保存される（同じ `localhost:4173` なら `?live` でも使われる）。
3. **配信している間は、この API キーの欄（キーの末尾 4 文字が出る）を開かない。** キーを入れるのは配信を始める前に済ませる。

## 3. 試運転（10/30、数分〜30 分）
1. `http://localhost:4173/?live&rehearsal` を開く。右下に `JST 18:02:37` の時計が出ることを確かめる。
2. 島が開いて数分待ち、ブラウザの開発者ツール（F12）のコンソールで:
   ```
   (await seaglassRehearsal.text()).split('\n').filter((l) => l.includes('"t":"ai"')).slice(-5)
   ```
   - `"ok":true` の行があり、`model` が `claude-sonnet-5-5`（ドットの深い判断）や `claude-haiku-4-5-20251001` で、`input`・`output`（トークン数）が入っていること → (1) モデル ID が通る、(3) ai の行が出る。
   - ドットは島が開いてすぐ「何も決めていない」ので、最初の数分のうちに深い判断（`claude-sonnet-5-5`）が 1 回は出るはず。30 分出なければ本体に知らせる。
   - `"ok":false` だけなら、`why` の文を本体に送る。
3. `?live&rehearsal` のまま 10〜20 分見て、ドットの字幕や状態の文が変わることを確かめる（コンソールで
   ```
   (await seaglassRehearsal.text()).split('\n').filter((l) => l.includes('"t":"sub"') || l.includes('"t":"status"')).slice(-5)
   ```
   ）。そのあと `?live` のタブを閉じてから `http://localhost:4173/#kayama` を開き、Z（図鑑のパネル）→ タブ「島の住人」→ ドット →「日記帳をひらく」に「目的：…」の行があれば、頭の答えが checkThought を通っている → (2)。**同じ島を 2 つのタブで同時に開かない**（保存を取り合う）。
4. 隠れたときの確かめ：OBS か別のウィンドウでアプリのウィンドウを 1 分ほど完全に覆い、戻してからコンソールで
   ```
   (await seaglassRehearsal.text()).split('\n').filter((l) => l.includes('"kind":"hidden"') || l.includes('"kind":"shown"')).slice(-4)
   ```
   - 行が出なければよい。
   - `hidden` の行が出たら、§0 のオプション付きでブラウザを起こし直して、もう一度確かめる。それでも出るなら、本体に知らせる（覆わない置き方で行う）。
5. 試運転のあと、`seaglassRehearsal.clear()` で記録を消す。

## 4. 上限で止まる確認（10/30）
AI が止まっても、島が台詞とルールで続くこと（エラーにならないこと）を、一度わざと止めて確かめる。
1. `?live&rehearsal` を動かしたまま、Console でリハーサル専用キーを一時的に使えなくする（無効化できない場合は、使い捨てのキーを別に作って入れ、それを削除する）。
2. 10〜20 分見る。確かめること：
   - 島が止まらない（字幕・状態の文・カメラが動き続ける）。page error がない（コンソールに赤い行がない）。
   - 記録の ai の行が `"ok":false`（`why` に `API エラー (HTTP 401)` など）になり、同じ住人の問い合わせが 1→2→4→5 分と間をあけていく。
3. キーを元に戻し（または専用キーを入れ直し）、`"ok":true` に戻ることを確かめる。
4. `seaglassRehearsal.clear()` で記録を消す。

## 5. 始める（10/31 8:00 ごろ）
1. 新しい島で始める場合は、開発者ツールの Application → Local Storage → `http://localhost:4173` で、`seaglass.aikey` 以外の `seaglass.` のキーを消す（キーは残す）。
2. `http://localhost:4173/?live&rehearsal` を開き、コンソールで `seaglassRehearsal.clear()`。
3. 始める前の保存を書き出す：`seaglassRehearsal.saveOut()`（API キーは入らない）。ダウンロードの表示が配信に映らないよう、**配信を始める前に**行う。
4. 配信と、配信 PC での録画を始める。

## 6. 間
- 何も触らない。ブラウザを前に出したまま。
- 夜中に止まった・固まったときは、時刻と画面を控え、ページを読み直して続ける（記録は消えない）。

## 7. 終わる
1. **配信を止める**（ダウンロードの表示が映らないように）。
2. Alt+Shift+R（または `seaglassRehearsal.download()`）で記録 `rehearsal-*.ndjson` を書き出す。
3. `seaglassRehearsal.saveOut()` で終わりの保存 `save-*.json` を書き出す。
4. 記録・始めと終わりの保存・配信 PC の録画の場所を、科学班と視聴者設計班に渡す。

## 記録の行（`rehearsal-*.ndjson`）
どの行にも `jst`（日本時間）・`isl`（画面の島の時計）・`world`（世界の時計）。`sec`（毎秒のフレーム）、`slow`（250 ms を超えたフレームと内訳）、`event`（出来事、`shown`）、`ai`（頭の呼び出し、本文なし）、`status`（状態の文）、`card`（節目の札）、`sub`（字幕）、`sea`（5 分ごとの海面）。
