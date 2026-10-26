# リハーサル　Windows の短い版

> **10/31 からのリハーサルは延期（オーナー 10/26）。** いまは、数日に 1 回の試し回し（`CYCLES.md`）。1 回ごとの手順は CYCLES.md にある。この文書の手順 4〜6（アプリとブラウザを起こす・キーを入れる）は、そのまま使う。

細かい理由や記録の中身は `RUNBOOK.md`（両方に書いてあることは同じ。Windows で迷ったらこちら）。ここは Windows の家の PC で上から順にやるだけの版。
コマンドは **PowerShell**（スタートメニューで「PowerShell」と打って開く）に 1 行ずつ貼る。
`npm` と `npx` は `npm.cmd`・`npx.cmd` と書く（Windows の初期設定では、PowerShell から `npm` と打つと「スクリプトの実行が無効」で止まるため）。

---

## A. 前の日まで（10/30 まで、1 回だけ）

### 1. Node.js と git を入れる
PowerShell に 1 行ずつ：
```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```
入れ終わったら **PowerShell を一度閉じて開き直し**、次で数字が出れば OK：
```
node -v
git --version
```
（`node -v` が `v22.` か `v24.` で始まればよい。winget が使えないときは nodejs.org の「LTS」と git-scm.com からインストーラーを入れる）

### 2. ビルドする
```
cd $HOME
git clone https://github.com/ynatsume-source/3dproject.git
cd 3dproject
git checkout 23f2c17cf65712782f600b169d0061b23866cf35
git tag rehearsal-1
git push origin rehearsal-1
npm.cmd ci
npm.cmd run build
```
（`git push` で GitHub のログインを聞かれたら、そのままログインする。うまくいかなければ飛ばしてよい。中身は同じ）

### 2b. 版が差し替わったとき（10/26：90ae7ca → 23f2c17）
すでに手順 2 をやった PC では、アプリの黒い窓を閉じて（Ctrl+C）から：
```
cd $HOME\3dproject
git fetch
git checkout 23f2c17cf65712782f600b169d0061b23866cf35
git tag -f rehearsal-1
git push -f origin rehearsal-1
npm.cmd run build
```
終わったら手順 4 でアプリを起こし直し、ブラウザを読み込み直す（F5）。島の保存とキーは残る。

### 3. Windows の設定
- 設定 → システム → 電源 → 「画面とスリープ」を全部「なし」
- 設定 → Windows Update → 「更新の一時停止」で 1 週間止める（夜中の再起動を防ぐ）

---

## B. 動かすたびに（10/30 の試運転と 10/31 の本番）

### 4. アプリを起こす
PowerShell で：
```
cd $HOME\3dproject
npx.cmd vite preview --port 4173 --strictPort
```
**この PowerShell の窓は閉じない**（閉じるとアプリが止まる）。最小化はしてよい。

### 5. リハーサル用のブラウザを起こす
**もう 1 つ** PowerShell を開いて、Chrome なら：
```
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$HOME\rehearsal-trial" --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required "http://localhost:4173/#kayama"
```
Edge なら：
```
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="$HOME\rehearsal-trial" --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required "http://localhost:4173/#kayama"
```
- ふだんのブラウザとは別の、リハーサル専用の窓が開く（島の保存とキーもこの窓だけに残る）。
- `--autoplay-policy=no-user-gesture-required` は、クリックしなくても音が出るようにするため（配信は音を出した状態で始める。PROGRAM.md §5-5）。**ほかの Chrome・Edge の窓を全部閉じてから**起こす（開いていると、この設定が効かない）。
- **本番（10/31）では `rehearsal-trial` を `rehearsal-run` に変えて起こす**（試運転の島を持ち越さず、新しい島から始めるため。キーはもう一度入れる）。
- **この窓は最小化しない・ほかの窓で覆わない**（隠れるとアプリが止まる）。モニター 2 台なら、この窓と OBS を別の画面に。

### 6. キーを入れる（試運転と本番でそれぞれ 1 回。配信を始める前に）
島の画面をクリックしてキーボードの **Z**（図鑑のパネルが開く）→ 上のタブの「島の住人」→ 一番下の `sk-ant-...` の欄にリハーサル専用キーを貼って「保存」→「設定済み（…末尾 4 文字）」と出れば OK → もう一度 Z で閉じる。
見つからないときは F12 →「コンソール」に `localStorage.setItem('seaglass.aikey', 'ここにキー'); location.reload()`（貼り付けを止められたら先に `allow pasting` と打つ）。
**配信中はこの欄を開かない**（キーの末尾 4 文字が出る）。

---

## C. 試運転（10/30、30 分〜1 時間）

7. アドレス欄を `http://localhost:4173/?live&rehearsal` に変えて開く。右下に `JST 12:34:56` の時計が出れば OK。
8. 5 分ほど待って F12 →「コンソール」に次を貼って Enter：
   ```
   (await seaglassRehearsal.text()).split('\n').filter((l) => l.includes('"t":"ai"')).slice(-5)
   ```
   `"ok":true` と `claude-sonnet-5-5`（または `claude-haiku-...`）と `input`・`output` の数字が見えれば OK。**出た行をそのまま本体に送る。**
9. 窓を OBS などで 1 分ほど完全に覆い、戻してからコンソールに：
   ```
   (await seaglassRehearsal.text()).split('\n').filter((l) => l.includes('"kind":"hidden"')).length
   ```
   `0` なら OK。`1` 以上なら本体に知らせる。
10. **上限で止まる確認**：Console（console.anthropic.com）でリハーサル用キーを一時的に使えなくして、10〜20 分見る。島が止まらず、字幕や文が動き続ければ OK。コンソールで手順 8 と同じ行を貼り、`"ok":false` が出ていることも見る。終わったらキーを使えるように戻す。
11. 試運転の終わりに、コンソールで `seaglassRehearsal.clear()`。

---

## D. 本番（10/31 8:00〜）

12. 手順 4・5（`rehearsal-run` で）・6 をやり、`http://localhost:4173/?live&rehearsal` を開く。
13. コンソールで、まず `seaglassRehearsal.clear()`、次に `seaglassRehearsal.saveOut()`（始めの保存がダウンロードされる）。**配信を始める前に**やる。
14. 配信と、OBS での録画を始める。あとは触らない。

## E. 終わり

15. **先に配信を止める**（ダウンロードの表示が映らないように）。
16. F12 →「コンソール」で `seaglassRehearsal.download()`（記録 `rehearsal-…ndjson` がダウンロードされる。Ctrl+J のダウンロード一覧で確かめる）。**Alt+Shift+R は使わない**（Chrome がこのキーで「リーディング モード」を開いてしまうことがある。開いたら右上の × で閉じる）。
17. コンソールで `seaglassRehearsal.saveOut()`（終わりの保存 `save-…json`）。
18. ダウンロードフォルダの `rehearsal-…ndjson` と `save-…json` 2 つを本体に送る。録画の場所は視聴者設計班へ。

困ったら、画面の文字やエラーをそのまま貼って本体に送る。
