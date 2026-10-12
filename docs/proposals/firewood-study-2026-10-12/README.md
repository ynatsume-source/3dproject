# 薪の表示と比較撮影の準備

画像に依存する造形試作は保留。今回の差分は `tools/lab/firewood-*` とこの記録だけで、通常アプリ・AI・保存形式・物理・経路・科学係数を変更しない。

基点: main `395beae25c3460d13cf04296375af2ee552186d7`。独立枝 `codex/firewood-study-foundation`。
自然枝 `ccr-e08d1594-zvwjwx` の `477dd2a` にある `docs/proposals/nature-look-2026-10-09/DIORAMA.md` を読み取りで確認した。丸い形の方針は撤回済み、ジオラマのぼけは既定オフという意図を優先する。自然側29コミット（描画末尾 `ad50d01`）は取り込んでいない。他班の保存・brain修正も含まない。

参考画像5件はLibraryの現行手順でこの環境へ取得を試み、一度再試行しても配信先のDNS名前解決に失敗した。ローカルの実画像は未確認。ネットワーク制限の迂回や、別環境のパスを存在証拠にすることはしていない。

## 表示が読める事実

対象は家 `(61,-145)` 周辺25mの薪棚と切り株。`firewood-state.mjs` は通常描画から独立した検証用の読み取り関数。

| 事実の持ち主 | 今の表示・許される読み取り | 表示から推測してはいけないこと |
|---|---|---|
| `lab.equipment['eq:firewood_stack']` | 棚の屋根が存在する | 屋根の建設進捗 |
| `lab.lots`: `materialId='firewood'`, `location='shelf'` | 予約中も含む実量mg。既存棚は `ceil(mg/3e6)`、上限15モデル | 1モデルが厳密に3kgの実物、残量が連続的に減ること。45kg以上は表示が飽和する |
| 棚の `quality.water_ppm` | 確定したロットの品質 | 乾燥中の連続した色・進捗。途中は内部runだけが変化する |
| `village.felled` と森林の伐採状態 | 実際の伐採位置に切り株。復元時も `forest.fell` と `drawStump` | 伐採前の予告切り株、木が存在した証拠のない置物 |
| 保存の `trees[]` | 若木の伐採状態。森林の `felled[]` と別の記録 | 両者を合算して同じ木として扱うこと |
| `village.labRuns`→`lab.runs` | 野焼き/油煮の `starting/running/needs-input`、実際の `kilnC` | 任意の工程進捗、推定の燃料消費 |
| `U.uFire.w` | 今描画されている火の強度 | 薪が燃えた量。夜の集まりでも火が灯る |

`craftTick` は野焼きの薪の山を優先し、同時に煮沸runがあっても鍋の表示を抑える。検証用 `craftShow` は使わず、実runと区別する。

現行 `done('fell')` は丸太2〜3本を伐採地点に `items.addAt('wood',...)` で置く一方、枝の薪6〜12kgはその完了処理で棚の台帳へ直接追加する。薪の運搬taskや `holding:'firewood'` はない。`wood` / `piece` は建築部材であり、薪運搬に読み替えない。現状の棚への瞬時加算を、架空の運搬・予約演出で隠さない。

## 再現用データと撮影

`firewood-fixture.ts` はユーザー保存を読まず、実際の島地形を読み込んだ新規世界から完全なsaveを作る。そのコピーに24kgの薪・屋根・25m内の実在する木1本の伐採記録を設定した**合成の表示fixture**を出す。自然な暮らしの到達結果ではない。別に、変更していない新規世界を60秒動かして生活状態・保存・乱数の指紋を出す。

```sh
node --import tsx --import ./scripts/node-assets.mjs tools/lab/firewood-fixture.ts check-results/firewood-fixture
node --test tools/lab/firewood-state.test.mjs
npm run typecheck
npm run build
# 撮影専用: 関数名frameを保持し、通常の自動描画を最初から止める
node node_modules/vite/bin/vite.js build --minify false
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5318 --strictPort
```

別ターミナル:

```sh
CHROME=/usr/bin/chromium \
FIXTURE=check-results/firewood-fixture/fixture.json \
OUT=check-results/firewood-before node tools/lab/firewood-capture.mjs
# 必要なら PLAYWRIGHT_MODULE にインストール済みPlaywrightのindex.mjsを指定。
# 修正後も同じfixtureファイルをそのまま使い、OUTだけ変更する。
node tools/lab/firewood-compare.mjs check-results/firewood-before/report.json check-results/firewood-after/report.json
```

撮影ツールは各ケースごとに新規ブラウザコンテキストを使い、外部リクエストを遮断する。合成save以外のlocalStorageは持ち込まない。乱数・日付・描画用時間を固定し、自動のメインフレームを止め、ロード用の地球儀アニメーションだけ完了させた後、既存 `seaglass.advance` で同じ枚数だけ描く。実行中は通常の住人更新も通るので、その結果のsave指紋も比較する。URLの現地時刻は昼12:00・夕17:45・夜20:30、2026-10-10晴天。1280×720/highと390×844/medium、DPR 1。実際のdrawing bufferも記録する。

カメラは家から `(7,+6,8)`、yaw π/4・pitch −0.5。20フレーム準備後、既定6フレームを測定。通常の `renderer.info` のリセット方式を維持し、各 `renderer.render` 呼び出しの直後のcalls/trianglesを加算してポスト処理を含む全描画を集計する。時間は本来のperformance時計でフレーム全体＋`gl.finish()`＋1画素の同期readbackを計測する。**SwiftShaderでの同期測定であり、実機GPUのFPSではない**。まず同じビルドを2回撮るA/A比較を成立させる。比較器は乱数・save・時刻・カメラ・解像度・機器・モデル数等が違えば相対時間を出さない。

限界: 合成fixtureは乾燥runや燃焼runを含まず、日中の棚と夜の習慣の火を扱う。乾燥途中と同時runの表示境界は読み取り関数の検査にとどまる。実際の工程・運搬の視覚確認ではない。関数名に依存するため圧縮ビルドでは実行せず、自動フレームが先に動けば失敗する。実機・Windows ANGLE、長時間配信、ちらつきの検査は造形再開後に必要。

## 運搬方式の比較（未決、未実装）

評価軸は「リアルタイムの作業を視聴者が理解し、次を見たくなるか」。多少の作業感は残しつつ、同じ往復だけで長く待たせない。

| 案 | 視聴時の利点 | 気になる点・後で決める範囲 |
|---|---|---|
| 実寸の薪を個別に持つ | 手元と棚の変化が直接つながり、何が動いたか分かる | 寸法と本数を台帳と結ぶ設計が必要。衝突・持ち姿勢・経路・束ね方の負担、少量ずつの単調な往復が増える可能性 |
| 重量/容量インベントリ＋可視の束・籠 | 実量を台帳に残し、手元の束と棚への到着で工程を読める。1往復の量を調整しやすい | 束は代表表示と分かる表現が必要。運搬開始・移動中・受渡しの実状態と場所、容量規則を追加する必要がある |

次に試す候補は後者。見て分かる「拾う→持って歩く→置く」を実taskに結び、棚への加算は到着/受渡し成立時にする。ただし今回は変更しない。前者も否定せず、同じ距離・実量で、往復回数、何も変化しない時間、手元と棚が画面から読めるかを比較して決める。実寸を縮めることや時計を早めることを先に解決策にしない。

架空の作業進捗・乾燥色・連続減量・予約演出・瞬間移動を隠す演出はどちらでも採用しない。今回の造形再開は参考実画像が読めてから、同じモデル数/乱数消費を保った薪断面・樹皮・切り株程度に限定する。
