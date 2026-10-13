# 植物の限定試作（未採択）

基準main: `c29829f53a2e19852ced6650ecefdff34473edbc`。専用branch `codex/casuarina-visual-study`。通常push・draft PRまで。main統合・公開は行わない。

対象は浜のモクマオウ、小屋周辺の若木5本、伐採中の倒木のみ。ユーザーの「丸い玉が付いた木を隣の草のようなクオリティに」という意図を扱う。DIORAMA.mdの丸っこい方向の撤回を優先し、ぼけ・全体照明は持ち込まない。

## 移植と境界

- `37782a1`の`casuarinaGeo`だけを参考に、細い枝葉の垂れる姿へ。形状専用の既存`mulberry32(41)`を保持し、グローバル乱数は使わない。
- `382a559`／`36d6d86`の若木・倒木共有形状案を限定移植。既存ファイル全体や29コミットは取り込まない。
- 倒木は代表樹種モデルではなく、実際の木の高精細形状variant・幅・傾き・回転行列を共有する。instanceの元位置は風と色の位相に必要なので保持し、mesh側の逆平行移動で倒れる支点を維持する。
- 共有geometry/materialは破棄しない。倒木の終了時は一時InstancedMeshのGPU資源だけを解放する。
- mainのセル境界修正（c5180b1）を保持。配置・当たり・地形・資源量・行動・保存形式は変更しない。
- 他のアダン・茂み・岩・流木はgeometryハッシュまで一致。

## 乱数の扱い

Three.jsのUUID生成が世界の`Math.random`を消費する既存設計がある。固定依存three 0.186.1で実測すると、旧若木の描画部分は44回、新InstancedMeshは4回、旧倒木の描画部分は48回。差40回／44回を10個／11個のUUIDで補償する。最初の若木だけは非表示Meshで旧葉材質を残し、その1 UUIDを上記10個から差し引く。既存の`prepareShaders`は非表示Meshも材質単位で走査するため、旧葉材質を除くとScene＋Mesh cloneの16回分が失われ、最初の住人の行動に影響した。材質の走査順を保ち、非表示Meshは描画しない。依存更新時は`casuarina-uuid-check.mjs`と世界指紋の再確認が必要。

呼び出し数だけでは安全と判断しない。`casuarina-fixture.ts`は実地形で、配置・当たり一覧のハッシュ、60秒の住人行動・保存、実際の伐採の資源と保存、5秒後の片付けまでの乱数指紋・保存を比較する。共有geometryの破棄と立木／倒木の変換不一致はエラーにする。合成fixtureのみを使い、ユーザー保存・実APIは利用しない。

wall診断にある「海中開始のつもりが陸開始」の問題を認識したうえで、既存wall-checkを変更せず検証する。テストの緩和による合格にはしない。

## 再現

```sh
node tools/lab/casuarina-uuid-check.mjs
node --import tsx --import ./scripts/node-assets.mjs tools/lab/casuarina-fixture.ts /tmp/casuarina-fixture
node --import tsx --import ./scripts/node-assets.mjs tools/lab/casuarina-geometry.mjs /tmp/casuarina-geometry.json
node node_modules/vite/bin/vite.js build --minify false
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5319 --strictPort
# 別シェル: Playwright / Chromium は環境のパスを指定
URL=http://127.0.0.1:5319 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME=/usr/bin/chromium \
 FIXTURE=/tmp/casuarina-fixture/fixture.json OUT=/tmp/casuarina-before WARM=2 SAMPLES=3 FLICKER=1 \
 node tools/lab/casuarina-capture.mjs
node tools/lab/casuarina-compare.mjs /tmp/casuarina-before/report.json /tmp/casuarina-after/report.json
```

撮影は昼12:00／新月夜20:30、同じ合成保存・seed・カメラ・時刻。desktop highで家の近景と引き、浜、倒木。phone mediumで家の近景。倒木は同じtaskをテスト側で完了させて途中の姿を撮る。世界の状態・乱数は比較時に厳密一致を要求し、意図して変わるモデル数・三角形・描画回数は差分として記録する。

微小移動のちらつき診断は既存`tools/lab/flicker.cjs`の輝度2階差分を固定再生に組み込み、4m先の1/4画素相当ずつ4フレーム横移動する。近景の若木と浜の昼に実施。全条件を網羅した受入試験ではない。

性能はSwiftShaderの全フレーム＋同期readback。暖機2・標本3の少数測定で実機FPSを保証しない。実機性能・Windows ANGLE・長時間運転は別途確認が必要。

### 夜の倒木fixtureと結果の集約

基準mainで夜の伐採taskが完了せず、通常の撮影は7条件完了時点で停止した。この失敗は実装の回帰ではなく、撮影fixtureの前提の問題。夜間行動を変更せず、`casuarina-night-fall-capture.mjs`だけは`Date.now()`（固定した昼の世界時刻）で実際の伐採処理を成立させ、表示時刻は夜にする。自発的な夜間伐採を検証したものではない。

通常スクリプトの実行は `CASE=desktop-home-wide-day,desktop-home-wide-night,desktop-home-near-day,desktop-home-near-night,desktop-beach-day,desktop-beach-night,desktop-falling-day,phone-home-near-day,phone-home-near-night` を指定。夜の倒木は専用スクリプトを `CASE=desktop-falling-night` で別実行する。

`casuarina-collect.mjs OUT REPORT...` は全10条件の成功行・画像の存在、重複なし、fixture/browser/source一致を要求して集約する。各条件の元harnessハッシュを保持し、その組合せを比較するため、A/Bで同じ条件に同じ撮影スクリプトを使ったことを確認できる。元runの失敗は`attempts`へ保持し、失敗した未測定条件を成功扱いにはしない。撮影をやり直した条件は、成功した別runがなければ集約は失敗する。
