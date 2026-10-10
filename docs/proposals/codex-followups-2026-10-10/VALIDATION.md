# 検証記録（2026-10-10）

基点は `main` の `301d5fdf92bf8abbfaa72ada0462f9c31572c225`。`c5180b1` の戸口修正と本体の炭・タール接続を含む。作業ブランチは `codex/main-followups`。ローカル環境は Node 24.19.0、npm 11.9.0。CI は Node 22 を指定し、CI 自体の実行結果は未確認。

## 世界切替

```sh
git show main:src/main.ts > /tmp/codex-world-switch-main-before.ts
WORLD_SWITCH_MAIN=/tmp/codex-world-switch-main-before.ts node --import tsx --import ./scripts/node-assets.mjs scripts/world-switch-check.ts
node --import tsx --import ./scripts/node-assets.mjs scripts/world-switch-check.ts
```

最終版の検査で、基点の `main.ts` は18項目 FAIL・exit 1、修正後は27項目 PASS・exit 0。先に追加した初版でも修正前に13項目の失敗を確認してから直した。

検査は TypeScript の構文木から実際の `main.ts` の関数・URL処理を取り出し、描画・待ち時間・海の生成だけを置き換える。地球→星／星→地球→戻る、地球の先行生成、海の解放、URL再読込・共有、再開位置、導入表示、出来事ログ・図鑑と旧データの扱い、住人保存の保持を確認する。WebGL の描画と実際の GPU 資源解放は検査しない。

旧データの扱い：

- セッション内の海は世界付きキーで新しく構築。地形の `kayama` とその共有データは維持する。
- 旧 `seaglass.resume` の世界なし ID と旧導入表示の印は読込対象から外し、次の保存で世界付きにする。
- 観賞の出来事ログ・図鑑は、嘉弥真島以外の旧地球記録を引き継ぐ。世界を判別できない旧 `kayama` の観賞記録は新しい表示に引き継がない。旧ログの storage 項目は残す。図鑑の移行済み配列は次の発見時に保存する。
- `seaglass.residents.v1`、住人の日記・記憶・材料・科学工程の保存は変更しない。

## 台風時のランタン

失敗項目は `scripts/island-time-check.ts` の **`3 in a typhoon everyone takes shelter`**。乱数は `mulberry32(5)`、空の保存、AIなし。`2026-10-03T01:00:00Z` から0.25秒刻みで初期5秒→晴天5秒→台風10秒を進める。台風は晴天記録を `typhoon:true, pressure:985, gust:33, wind:18` にしたもの。

```sh
node --import tsx --import ./scripts/node-assets.mjs scripts/island-time-check.ts
```

元の全検査は seed 5 で2回とも同じ項目だけ失敗。台風部分の診断でも seed 5 / 1 / 6 がすべて失敗した。検査用地形は `0 <= x <= 300` だけ陸だが、泳げないランタンの家と初期位置が `[405,-285]` で、海底高さ−3mだった。避難先付近に陸がなく、`went='nowhere to stand'`, `blocked=99`, `task=null` となる。家は未建築（`houseN:0`）なので戸口の通り方が原因ではない。林の幹の境界変更でも説明できず、地形だけで再現する。

ランタンの検査用の家と初期位置の x を260（陸、高さ2m）に変えた反実仮想は全3 seedで成功。修正後の全検査は seed 5 で2回、seed 1 / 6で各1回成功。泳ぐ住人の海上の家は保持し、歩く住人の初期位置と家が陸上にある検査を追加した。変更はテストの4行だけで、`residents.ts` は変更していない。

## 基点 main の既存失敗と測定

同じ Node loader で次を基点のコードに対して実行した。

```sh
node --import tsx --import ./scripts/node-assets.mjs scripts/<name>-check.ts
```

| 検査 | 結果 | 実時間（秒） |
|---|---|---:|
| worlds | PASS | 0.37 |
| house | PASS | 49.61 |
| nav | PASS | 1.07 |
| wall | PASS | 11.07 |
| settle | PASS | 22.06 |
| map | PASS | 15.23 |
| mind | PASS | 2.33 |
| lamp | PASS | 14.99 |
| science-integration | PASS | 0.26 |
| bait | FAIL、exit 1 | 264.16 |

`bait-check` の今回の失敗は `miyako` の **`told early 76`**。`step 5.86 ms` は条件 `avg < 10` を満たし、今回の失敗要因ではない。`school out of the water 0`、`NaN 0`。`pacific` は `told early 0`, `step 2.56 ms` で成功した。先行の指摘にあった step 時間超過はこの測定では再現していない。環境による性能差と今回再現した出来事の判定を区別する。海の動きは今回の修正対象外なので変更せず、slow CI に登録したまま非ゼロ終了を保持する。

そのほか、`island-time-check` の上記 fixture 失敗は本ブランチで修正。`journal-check` は本環境では子の `npx` 起動が `spawnSync npx EPERM` となった。`process.execPath` に変えても同期起動は EPERM だったため、同じ tsx loader を現在の Node の非同期 `execFile` から読むように修正した。リモート CI でも同じ環境エラーになるとは確認していない。

## 修正後の型検査・build・fast

```sh
npx tsc --noEmit -p .
npm run build
npm run check:fast -- --out /tmp/codex-followups-fast
node scripts/checks.mjs fast --only journal --out /tmp/codex-followups-journal-recheck
```

型検査と build は exit 0。build は Vite、地球9か所の OG ページ、公開用の島だよりページまで成功。`content/journal` に承認済み記事がないため通常 build の記事数は0。既存の大きな chunk 等の警告は残る。

fast 全37本を実行し、36本 PASS、journal の同期 spawn の環境エラー1本、集約 exit 1。失敗後も残りの検査を実行している。journal の上記非同期起動への修正後、同じ runner でその1本を再実行して PASS・exit 0。必須の house・nav・wall・settle・map・mind・lamp・science-integration と worlds はすべて一括実行で成功。最長は house の46.092秒。各本の結果は [FAST_RESULTS.md](FAST_RESULTS.md)。全一括の再実行はしていない。

最後に、子の pipe 出力が検査の明示的な `process.exit()` で消えることを発見。runner を開いたログfdへ直接 stdout/stderr を出す方式に修正し、journal・world-switch・worlds を再実行して全3本 PASS、本文の保持も確認（ログ24・33・11行）。1MB超の stdout と64KBの stderr を終了直前に出す fixture でも全量保持、失敗後の継続・timeout等を再確認した。初回全37本の終了コード・JSONは有効だが、全出力本文が残っているとは扱わない。

## CI の範囲

全89本を manifest に明記（fast 37、slow 52）。必須8本と世界切替を fast に含む。PR／main push は型検査・build・fast、slow は03:40 UTCの夜間と手動、4分割。未登録・重複・削除済み登録を失敗とし、失敗後も残りを実行して集約結果を非ゼロにする。fast は各120秒、slow は各1200秒。

数値を出すだけの診断11本は `completed` と記録し、assertion の `passed` と区別する。既存の script 内の skip もログに残す。失敗継続、manifest の不整合、分割の全件網羅、timeout・キャンセル時の子孫終了は一時 fixture で確認済み。

slow 全52本、GitHub 上の新 CI、ブラウザでの描画・GPU・HUD検査は今回未実行。既存失敗の一覧は上記の実行範囲で確認できたものに限る。
