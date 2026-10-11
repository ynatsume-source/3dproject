# 世界切替の実ブラウザ確認

対象: `scripts/worlds-browser-check.mjs`。`world-switch-check.ts` の headless 検証とは別に、ビルド済みの実アプリを Playwright/Chromium で操作する。描画や住民・科学工程の実装は変更しない。

## 実行

通常の環境ではリポジトリに Playwright と Chromium を導入してから実行する（依存・lock の保存はしない）。2026-10-11 の実行環境で確認した Playwright のバージョンは **1.62.1**。

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install --with-deps chromium
npm run build
npm run check:browser -- --out check-results/worlds-browser
```

指定がなければ `127.0.0.1:5317` で Vite preview を起動する。既存サーバーを使う場合は、次のように指定する。

```sh
BROWSER_CHECK_URL=http://127.0.0.1:4174/ node scripts/worlds-browser-check.mjs --out check-results/worlds-browser
```

手動 CI は `.github/workflows/browser-checks.yml`（Browser world checks）。同じバージョンの Playwright / Chromium を導入して build と本チェックを実行し、JSON・画像を14日間 artifact に保存する。毎回の fast には追加しない。GitHub の手動起動には workflow が default branch に登録されている必要があるため、取り込み前の確認は上記ローカルコマンドでも実行できる。この追加 workflow の実行結果はまだ取得していない。

`CHROMIUM`（または `CHROME`）でブラウザ実行ファイルを指定できる。通常の `import('playwright')` ができない環境は、`PLAYWRIGHT_MODULE` に Playwright の入口ファイルの絶対パスを指定する。`--timeout-ms` は各ロード待ちの上限で、既定は600,000 ms。描画は low、960×540。より広い画質・shader の確認は既存の `shader-check.mjs` を使う。

## 何を確かめるか

1. 実際に `#planet` を開き、ドットの日誌に検証用の1行を追加して既存の `residents.save()` で保存する。この正規 snapshot を、テスト用 context 作成時に一度だけ読み込む。reload 時に保存を再注入しない。
2. 別々の新しい context で地球の `#kayama → #planet` と逆順を操作する。住民オブジェクトと4体の住民は planet にだけ存在する。`cur` と描画 group の参照、`earth:kayama` / `planet:kayama` のキャッシュが分離し、再訪で元の参照を使う。
3. `location.hash` のみで移動し、Back / Forward、両世界の reload を操作する。hash移動・履歴移動では document が変わらず、reload では変わることも確認する。
4. 遷移中にイベント処理の機会を挟んで複数の hash を変更し、最後の要求が採用されて落ち着くことを確認する。空 hash は地球儀、未知 hash は現在の海または地球儀を保つ。地球儀から元の海へ戻る。
5. 各段階で実保存の日誌マーカーを確認し、planet ではメモリ上の日誌も確認する。更新され続ける時計・位置・その他の日誌を含む snapshot 全体の文字列比較はしない。
6. ロード後にも描画し、uncaught JavaScript、`World navigation failed`、GLSL/リンク失敗、重大な WebGL エラーと context loss を検知する。許可したアプリの origin 以外へのリクエストは遮断し、API課金・外部公開を伴わない。

期待する確認は seed 1段階 + 各順序15段階、計31段階。JSON と初回の世界のスクリーンショット、失敗時のスクリーンショットを `--out` に保存する。自分で起動した preview とブラウザは終了時に閉じる。

## 今回のローカル結果

```sh
node --check scripts/worlds-browser-check.mjs
node scripts/worlds-browser-check.mjs --help
PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js CHROMIUM=/usr/bin/chromium node scripts/worlds-browser-check.mjs --out /tmp/codex-worlds-browser-2026-10-11
```

- 構文確認とヘルプ表示は成功。
- 本実行は **BLOCKED、終了コード2、完了0段階**。Chromium 起動時に `crashpad/.../socket.cc:45 setsockopt: Operation not permitted (1)`、終了 signal `SIGTRAP`。別途 localhost listen も `EPERM` と確認した。
- 本実行の JSON は `/tmp/codex-worlds-browser-2026-10-11/results.json`、ログは `/tmp/codex-worlds-browser-2026-10-11.log`。実アプリの操作・画像取得には到達していない。ブラウザ確認が通ったとは扱わない。

終了コードは PASS=0、アプリの確認失敗=1、ブラウザ依存/起動や preview の環境準備で停止=2。実ブラウザの結果は、Chromium と localhost の起動を許す CI または手元の環境で取得する必要がある。今回は権限待ちや外部への push は行っていない。
