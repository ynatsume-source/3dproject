# Utsushiyo（旧 Seaglass）開発ガイド

実在の海と島をドローンで眺める自然の世界と、地球と同じ形をした別の星でドットたち4人が暮らす島を持つ Web アプリ。地形と海の仕組みは共有し、住人のいる島へは `#planet` から入る（ADR 0007）。
趣味として長く育てることが目的。今の観賞体験の心地よさを最優先し、商用・大規模化は将来の選択肢にとどめる。

## 最初に読むもの

- `docs/ARCHITECTURE.md` … 実際のモジュール構成、状態の持ち主、時間の種類、保存、外部通信、既知の課題
- `docs/adr/` … 採択済みの設計判断（なぜそうしたか、いつ見直すか）
- `docs/proposals/` … 未採択の提案資料。**正式な仕様として扱わない**

## 守ること

- 1回の作業は1つの目的。見た目の改善と基盤の組み替えを同時にしない。
- 構成は TypeScript / Vite / Three.js（WebGL）。新しいエンジン・フレームワーク・ライブラリは理由を示して別途相談。
- 世界の事実（位置・状態・記憶・関係）と見た目（モデル・シェーダー・画質）を分ける。画質やモデルを変えても住民の同一性と記憶は変わらない。
- 住民は「世界の時間」（現実の時刻）で暮らす。時刻パネルの早回し・季節切り替え・朝昼夕夜のプリセットは観賞用で、住民の履歴を書き換えない（ADR 0001）。
- LLM は描画ループの中で待たない。LLM の返答は検査してから世界へ反映し、失敗しても用意された台詞・ルールで暮らしが続く。
- API キーをリポジトリ・ビルド成果物・ログに入れない。一般公開で訪問者が使う前にサーバーを挟む。
- AI の予算（2026-10 オーナー決定）：全体で月 1.5 万円まで。住民1体あたり1日 150〜200 円までは許容（4体）。節約しすぎて退屈にしない。上限は月額で必ず止まる仕組み（サーバー側の集計）で守り、1日の上限は日ごとの目安として配分する。
- 保存データのキーは `seaglass.*` のまま（名前変更で記録を失わないため）。形式を変えるときは旧データを読めるようにする。
- 生き物は無から出ない・その場で消えない（オーナー決定、全イベント・全生き物共通）。新しく現れるものは見えない所（その海の見通しの外、または視線から75°より外で22 m以上先）に置いて泳いで入ってこさせ、いなくなるものは同じように見えなくなってから片づける。判定は `src/eco/unseen.ts`（`unseen`・`behind`・`sightRange`）を使い、`scripts/appear-check.ts` で確かめる。食べられる（捕食）は例外。
- シェーダーは Windows（ANGLE / Direct3D11）で落ちやすい。テクスチャを読むシェーダーでは早期 return や分岐内のサンプリングを避ける（過去に白画面の原因になった）。

実装と方針の差（2026-10-10）：通常モードの住人の更新はまだ観賞用の `clock.ms` を受け取る（`?lantern-study` のみ `Date.now()`）。共有世界のサーバーと、全用途を集計する月額 AI 上限は未実装。現在の保存と AI 通信はブラウザ内の試作で、上の採択方針を満たした本番の共有世界とは区別する。詳細は `docs/ARCHITECTURE.md` の時間・保存・外部通信を参照。

## 確認コマンド

```sh
npm run typecheck
npm run build
npm run check:list                        # ヘッドレス検査の全一覧・分類
npm run check:fast                        # PR / main の変更で回す検査
npm run check:slow                        # 長い検査（夜間 / 手動 CI）
npm run sim -- miyako                      # 生態系をヘッドレスで早回し
npx tsx --import ./scripts/node-assets.mjs scripts/<name>.ts   # director / clip / cave / bait / jitter / motion / route / appear の各チェック
```
検査の分類は `scripts/check-manifest.mjs`、実行は `scripts/checks.mjs`。各検査を別プロセスで順に動かし、ログと JSON の結果を残す。検査の未登録・失敗・タイムアウトは終了コードで失敗にする。数値を出すだけの診断は「実行完了」と記録し、受け入れ条件の合格とは区別する。`.github/workflows/checks.yml` は PR / main への push で型検査・ビルド・fast、毎日03:40 UTCと手動実行で slow を回す。ブラウザ・GLSL・HUD の検査は別に行う。
シェーダーを変えたら `node scripts/shader-check.mjs`（`--all` で全部の海）：Chromium（ソフトウェア GL）で海を開き、コンパイルに失敗したシェーダーが1つでもあれば落ちる。ヘッドレスのチェックは GLSL をコンパイルしないので、変数の二重宣言などはこれでしか見つからない。`#if` の枝どうしは同じスコープなので、別の枝と同じ名前の変数を宣言しない。


画面のチラつきは `node tools/lab/flicker.cjs`（ビルドを PORT で配信した状態で。`POSE=land` で島の砂地、`POSE='x,y,z,yaw,pitch'` で同じ位置）：カメラを 1/4 画素ずつずらして本番の描画経路で描き、画素の明るさの急な変化（2 階差分）の割合とその場所の画像を出す。細かい模様・細い形・`discard` の縁を足したら、直す前と同じ位置で比べる。模様は `aaK(周波数, length(fwidth(座標)))` で画素に近づいた細部を溶かし、`discard` の縁は `uA2C`（アルファ・トゥ・カバレッジ）で。docs/proposals/kayama-review/FLICKER.md。
見た目の確認は `npx vite preview` + Playwright（Chromium は `/opt/pw-browsers`、SwiftShader で WebGL）。
画面の部品の重なりは `node tools/layout/overlap.cjs`（ビルドを PORT で配信した状態で）：スマホ縦・横・タブレット・PC の7サイズで、HUNT の小窓・地図・丸ボタン・字幕・SEA LOG・下のバー・「巡航に戻る」を全部出して重なりと画面外を数える。HUD を変えたら必ず通す。
構図は `node tools/layout/composition.cjs`（同上、1サイズずつ別ブラウザで順に。並行で動かすとソフトウェア描画が落ちる。`ONLY="phone portrait"` で1サイズ）：既定の巡航を数分撮り、観察中に被写体が画面外 10% 超・岩に隠れる 5% 超・幅 8% 未満が 5% 超、岩や水面が画面の1/3以上を占める瞬間が 3% 超なら不合格。1回の測定は数分ぶんなので数ポイントは揺れる。カメラ・監督を変えたら通す。
住人の目線は `node tools/lab/pov.cjs`（同上）：4体それぞれ、カメラがモデルの目の位置にあるか（0 m）、視線が頭の向きと一致するか（2°未満）を測る。目線・頭・カメラ補正を変えたら通す。
サンゴが水に収まっているかは `npx tsx --import ./scripts/node-assets.mjs scripts/coral-depth-check.ts`：嘉弥真の実地形（`scripts/node-land.ts` で PNG を読む）でサンゴを生成し、群体の上端が育つ上限（`CORAL_CEIL`、平均海面下0.35 m）を超えないこと、浅場（0.5–2 m）にサンゴが残ることを確かめる。サンゴの寸法・配置を変えたら通す。
水域の区分は `src/ocean/water.ts`（海・ラグーン・潮だまり・内陸の水・陸）。海面のうねり（GPU の `seaK` と CPU の `swellAt`/`surfaceAt`）と住人が水に入る場所が同じ答えを使う。確認は `npx tsx --import ./scripts/node-assets.mjs scripts/water-check.ts`：海から切れたくぼみの水面が動かないこと、外海は元のうねり、ラグーンは一部。地形・うねり・水辺の行動を変えたら通す。
住人が通れない物は `src/robots/solids.ts` の一つの登録（岩・幹・流木・小屋の柱・作業台・棚・桟橋の杭・焚き火）。描画や LOD と独立。経路の計画・一歩ごとの接触・目的地の接近位置が同じ登録と身体の大きさ（`body(r)`、持ち物込み）を使う。道がなければ直進せず諦める（`r.went`）。確認は `npx tsx --import ./scripts/node-assets.mjs scripts/nav-check.ts`。移動・置く物・体の大きさを変えたら通す。
住人について言うこと（状態表示・日記）は実際の状態から：向かっている途中は「向かっている」、着いてから「している」、道がふさがれば「回り道を探している」。日記の数値・見た魚は世界で本当に測った・見たもの（`Entry.obs`、`T.nearFish`）だけで、乱数で作らない。確認は `npx tsx --import ./scripts/node-assets.mjs scripts/words-check.ts`。
住人の主体性は ADR 0004（採択）。`src/robots/agent/`：観察（`observe`：視野・遮蔽・明るさ、物体 ID）→ 目的 → 計画（世界が出す選択肢 `optionsFor` の id だけ、ready=false は将来の手順）→ 行動（`taskFor`、世界が判定）→ 結果（`report`：done/gone/no way/blocked/interrupted/unavailable/timeout）→ 記憶（knowledge：saw/tried/heard/guessed、仮説は本物の結果でしか確定しない）。AI は節目だけ（`agent/config.ts` の MINDS が運用設定：モデル・1日の上限・間隔）。キーなし・予算切れ・応答なしでも習慣（HABIT）で動く。いまはドットとラッコが on。確認は `npx tsx --import ./scripts/node-assets.mjs scripts/mind-check.ts`。住人どうしの頼む・断る・教える・渡す（`requests`、`ask`/`answer`/`tell`/`give`）と取り合いは `scripts/social-check.ts`。

動物（ラッコ・カメマル）の体は `src/robots/body.ts`（ADR 0004 追記：体と食べ物）。おなか・ねむけは何をしているかで減る（`drain`）。食べ物は世界の在庫（ラッコの採餌場 `patches`：ウニ・カニ・貝、獲れば減り時間で戻る／カメマルの藻場 `beds`）。空腹・眠気が過ぎると困りごと（力が出ない・体が冷える・動けない・落とす・寝落ち）が起き、本人の日記と AI への結果に状態つきで残り、習慣の目安（`learn.eatAt`/`sleepAt`）が少し早まる（何事もない日は少し戻る）。AI にはルールを渡さず、体の状態（`now.body`）と体験だけを渡す。確認は `npx tsx --import ./scripts/node-assets.mjs scripts/body-check.ts`。
科学の工程は `src/world/process-catalog.ts`（使える工程と前提）と `process-runner.ts`（材料・設備の予約、時計、検査、結果の反映）を通して住人の暮らしから呼ぶ。粘土の池→下ごしらえ→器の成形・乾燥→野焼き→鍋・灯皿、ヤシ油→芯→油の灯り、焼いた壺2つ→乾留の器→炭・木タール→壺の封止まで接続済み。管を通した自作気圧計・漏れ試験・試験タイルの成形と乾燥は、工程表ではまだ `ready: false`。科学コアの計算そのものは科学側の持ち物。接続の確認は `scripts/island-science-check.ts`・`clay-chain-check.ts`・`pottery-host-check.ts`・`oil-chain-check.ts`・`lamp-check.ts`・`tar-chain-check.ts`。
島だより（住人のメディア、`/journal/`）は docs/JOURNAL.md。住人の写真（`photo:` 行為、1日3枚まで、撮らない日は記事に自分で描いた絵（SVG）を載せる、`PhotoRecord`）、記事（`src/journal/write.ts`：本人の記録と写真または絵だけ、検査つき）、毎日の島（`scripts/journal-run.ts`、状態は journal-data ブランチ）、写真の描画（`tools/journal/photos.cjs`、`?journalshot`）、ページ（`scripts/journal-pages.ts`、build で生成、承認＝マージ済みの `content/journal/` だけ）。確認は `scripts/journal-check.ts`。
`?debug` でコンソールに `seaglass` オブジェクト、`?diag` で GPU 診断パネル。

## 公開と報告

- `main` への push で GitHub Actions が GitHub Pages に公開する。push 後はライブのバンドルに変更が載ったことを確認してから報告する。
- 報告では、実行した確認と実行していない確認を分ける。見た目・性能・保存互換性への影響を書く。
- 設計の境界を変えたら `docs/ARCHITECTURE.md`、判断を変えたら ADR を更新する。
