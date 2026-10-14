# PR16 若木第3案の夕・夜・スマホ追加検証

比較元は第2案 `18ad2bf457dd98e10611ed3ca088874db3fe399f`、比較先は保全済み第3案 `64a8d87f002b1baaf33f1ff3f2a5112fd1344ab1`。本体コードは第3案から変更せず、夕17:30・夜20:30のPC（1280×720 high）と昼12:00・夕・夜のスマホ相当（390×844 medium）を追加撮影した。晴れ・2026-10-10、人工保存、カメラ位置/向きは既存の近景と同じ。

PR17の低いクサトベラ復元は独立してHEAD `c61d393ea7af06a8dae41a464e5b3681fb202044` を保持し、この比較へ取り込まない。そのため低木は前後とも旧表示であり、PR17の成果を取り消したものではない。地形・新規施設・本番UIの変更なし。

## 再現と条件

- `tools/lab/homestead-extra-capture.mjs` のCASEに `phone-home-near-day,desktop-home-near-evening,phone-home-near-evening,desktop-home-near-night,phone-home-near-night` を指定。
- 第2案は `/workspace/homestead-v2-motion` のpreview 5324、第3案は `/workspace/homestead-style-study` のpreview 5323。実際に配信されたbundleを各distと照合し、第3案は以前の検証済みbundleのSHA256とも一致した。
- FIXTUREは `docs/proposals/homestead-style-2026-10-14/evidence/fixture.json`。外部通信を遮断し、利用者の保存や実APIは使用しない。
- 各2frameのウォームアップ後、同期frameを3回計測。SwiftShaderの共有CPU上の時間で、実機性能・FPSではない。前後を並列描画しない。
- 追加移動は `tools/lab/homestead-phone-motion.mjs`。スマホ相当390×844 medium、昼、6cm、12frame、8fps、1.5秒のオフライン比較。既存のPC昼640×360 highの短い移動は[前回の資料](../README.md#短い動画の確認)に保持。
- 収集/照合: `node tools/lab/homestead-collect-extra.mjs /workspace/homestead-extra-evidence`。図版: `python3 tools/lab/homestead-extra-plates.py /workspace/homestead-extra-evidence docs/proposals/homestead-style-2026-10-14/v3/extra`（Pillow。動画の収集はffmpeg/ffprobe）。

## 関連検証

形状検査を今回再実行し、Math.randomに加え共有world Rも禁止する検査へ強化した。有限値、閉面・外向き、法線、表示色域、matte条件、板/天板の外寸と石の頂点位置がPASS。若木の樹冠の見かけの広がりを同寸にする検査ではない。検査条件や閾値の緩和はしていない。

同じfixtureハーネスを別プロセスで実行し、第2案と第3案の配置・当たり判定・60秒生活・保存・乱数・森林伐採・若木伐採/切り株遷移までの指紋が完全一致した。初回と前回の検証ログも保持する。本体を変更しないため、今回はこれらの不変条件と追加描画を再確認し、最終HEADの型検査・build・既存fast CI結果をPR本文に記録する。

## 静止画の評価と採用可能性

追加5条件すべてで保存・乱数・カメラ・投影・時刻・空・画質・物体数の前後照合がPASS。scene objects 2,317、meshes 2,154を維持し、ブラウザ/シェーダーエラー0。各条件の前後画像を確認した。画像の明るさを後処理で変更していない。

現状の第3案を「柔らかな細枝が読める完成案」として採用することは勧めない。第2案の大きく尖った板葉から、重なる樹冠へ変わった点は読めるが、昼のスマホでも大きな房の量感・面の角・継ぎ目が目立つ。夕方は房の内部が暗く、夜は大きな暗い輪郭としてまとまり、細枝の柔らかさは判読しにくい。樹冠が広がったことで棚や背景の見通しも狭くなる。

[スマホ昼の比較](phone-home-near-day-comparison.png)と[夕方PCの比較](desktop-home-near-evening-comparison.png)が方向判断用の代表画像。必要なのは、房の量感を残すか、房を細分化して枝先・隙間を主体にするかの判断である。目的に照らすと細枝・隙間を主体にした別試作を推す。これは1か所の色や明るさで直る不具合とは判断していないため、今回の検証中に樹冠寸法・色・照明を変えていない。技術的に比較可能な状態として保存し、全島採用・公開可能とは判定しない。

## 描画負荷とスマホの5 calls増の原因

| 条件・比較画像 | calls 第2案→第3案 | triangles 第2案→第3案 | 同期中央値 ms 第2案→第3案 | 第3案/第2案 |
|---|---:|---:|---:|---:|
| [phone-home-near-day](phone-home-near-day-comparison.png) | 959→964 | 11,905,808→11,911,298 | 17,874.3→14,647.8 | 0.819 |
| [desktop-home-near-evening](desktop-home-near-evening-comparison.png) | 981→981 | 12,526,848→12,529,438 | 36,531.1→43,931.2 | 1.203 |
| [phone-home-near-evening](phone-home-near-evening-comparison.png) | 959→964 | 11,905,808→11,911,298 | 14,426.6→18,626.3 | 1.291 |
| [desktop-home-near-night](desktop-home-near-night-comparison.png) | 988→988 | 12,524,027→12,526,617 | 45,432.8→44,509.8 | 0.980 |
| [phone-home-near-night](phone-home-near-night-comparison.png) | 971→976 | 11,904,223→11,909,713 | 14,937.5→14,764.4 | 0.988 |

PCではcalls不変、三角形は+2,590。スマホではcalls+5、三角形+5,490。物体数が増えたのではなく、既存20葉メッシュのうち画角内と判定される数が15→20へ増えた。[CPUでの同じカメラのFrustum検証](frustum-comparison.log)で、対象三角形8,700→14,190の差も一致し、実描画の増分を説明できる。画角内判定はbounding sphereによる保守的な判定で、全頂点が画面内に見えるという意味ではない。判定を固定・緩和する変更は加えていない。

再現: 第2案/第3案それぞれで `npx tsx --import ./scripts/node-assets.mjs tools/lab/homestead-frustum-audit.ts OUTPUT_DIR CAPTURE_REPORT.json`。[第2案](frustum-before.json) / [第3案](frustum-after.json)。

同期中央値の比は0.819〜1.291倍で条件により増減した。各条件1回・3試料、共有CPU上のSwiftShaderなので、一律の高速化も実機性能の回帰も断定しない。計測した描画処理量の増加と、実機で体感できる差は区別する。実機GPU/実スマホ、長時間配信、実機の滑らかさ・時間的ちらつき、slow検査は未確認。選択環境には/dev/driが公開されておらず、実機検証とは呼ばない。

## 小さなカメラ移動の結果

[スマホ比較動画（左第2案・右第3案）](motion-comparison.mp4) / [0・5・11番フレーム](motion-contact-sheet.png) / [全12フレーム一覧](motion-all-frames.png)

両案とも390×844 medium、12frame・8fps・1.5秒。同じ6cmの移動で、全frameの位置・向き・投影・時計・Math.randomの呼出し数/ハッシュ、終了時の住人保存SHAが一致。区間内の向き・投影は一定で、ブラウザ/シェーダーエラー0。ffprobeで形式・フレーム数も確認済み。

世界全体の描画数は既存の世界更新により変化するが、[各フレームで両案を引いた差](motion-render-deltas.json)は常に+5 calls/+5,490 triangles。静止画と同じ差で、追加の急な差は出ていない。全12frame一覧と0/5/11の抜き出しを確認した範囲で、第3案固有の大きな欠落・突然の切替は見られない。房の形は保たれる一方、細枝より大きな房として見える課題は移動しても残る。

確認は低fpsのオフライン画像列とフレーム抜き出しであり、実スマホで動画を再生して滑らかさや時間的なちらつきを評価したものではない。既存HUD/地図読込・観賞図鑑の変化も含む。夕・夜の移動は未撮影。初回の微小移動診断をこれらへ一般化しない。

[比較条件の照合](motion-comparison.json)、[raw PNGのSHA256](motion-frame-hashes.json)、[動画形式](motion-video-info.json)、[収集ログ](collection.log)を保存。raw frameは `/workspace/homestead-extra-evidence/motion-before/frames` と `motion-after/frames` に保持する。追加検証で本体srcは64a8d87から変更なし。最終HEADのCI結果はPR16本文を参照。
