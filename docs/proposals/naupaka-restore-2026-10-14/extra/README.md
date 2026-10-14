# PR17 夕・夜・スマホと短いカメラ移動の追加比較

PR17初回の昼PC比較に、夕17:30・夜20:30のPC（1280×720 high）、昼12:00・夕・夜のスマホ相当（390×844 medium）を追加。晴れ、2026-10-10、人工保存、カメラ位置と向きは初回と同じ。前後は main c29829f と低木復元3cf4f36の本体で、追加撮影のHEAD c24f9d5はハーネスだけの更新。表現・モデル・照明・生活・保存を変更していない。

スマホ相当はChromiumのviewport/画質設定による比較であり、実スマートフォンの検証ではない。PCもSwiftShaderで、同期frame時間は実機FPSではない。前後を並列描画せず、各2frameウォームアップ後に3frameの同期時間を計測する。

`tools/lab/naupaka-capture.mjs` のCASEに `phone-home-near-day,desktop-home-near-evening,phone-home-near-evening,desktop-home-near-night,phone-home-near-night` を指定。前後別のローカルpreviewで同じfixtureを使用する。詳細なenv指定は[親資料](../README.md#再現)と同じ。追加分では `FLICKER` を省略する。

短い移動は `tools/lab/naupaka-motion.mjs`。各640×360 high、昼、12frame、8fps、1.5秒のオフライン映像。6cmの同じ移動入力を与える。FOVやHUDを追加で固定する改造はしていない。実際の投影行列と向きは全frameで記録し、カメラ移動の条件を確認する。既存の葉の揺れやHUD表示も含む。実機の動画再生や、配信時の滑らかさ・時間的なちらつきの実測とは区別する。

収集と照合は `node tools/lab/naupaka-collect-extra.mjs /workspace/naupaka-evidence`。静止画の保存/時計/カメラ/投影/空/乱数/画質/物体数と、動画の全12frameの位置/回転/投影/時計/Math.randomの呼出し数・ハッシュおよび終了保存を照合する。元の検査条件や閾値は緩和しない。

## 静止画で確認できたこと

追加5条件すべてで保存・乱数・カメラ・投影・時刻・空・画質・物体数が一致し、ブラウザ/シェーダーエラー0。前後のscene objectsは2,317、meshesは2,154で一致。原寸画像を前後とも確認した。

- スマホ昼: 丸い塊から細かな葉先を持つ茂みへの違いは読める。個々の葉は小さく、細枝の詳細を判読できる解像度ではない。同じカメラでは対象が右寄りになり、既存操作ボタンの重なりと画面端による制約がある。
- 夕方PC/スマホ: 外周の葉先は読めるが、内部は昼より暗く、密な塊としてまとまりやすい。夜間の読みやすさを改善する照明変更などは加えていない。
- 夜PC/スマホ: 葉のある輪郭への変化は分かるが、葉面や細枝の判読は弱い。夜の細部まで改善できたとは判定しない。画像の明るさを後処理で持ち上げていない。
- 他オブジェクト: 若木・棚・石・地面などのモデルや配置は変更していない。各条件の幹・焚き火の石・砂地の固定小領域（計15領域）は画素単位でも一致した。[領域と結果](control-regions.json)。全画素が同じという保証ではなく、復元した葉先が広がる場所では、近くの幹の根元や棚奥が隠れる範囲が変わる。元からある右下の明るい箇所やHUD表示も比較画像に残る。

## 追加5条件の描画負荷

| 条件・比較画像 | calls 前→後 | triangles 前→後 | 同期中央値 ms 前→後 | 後/前 |
|---|---:|---:|---:|---:|
| [phone-home-near-day](phone-home-near-day-comparison.png) | 955→955 | 11,897,412→11,666,692 | 25,691.2→15,649.4 | 0.609 |
| [desktop-home-near-evening](desktop-home-near-evening-comparison.png) | 981→981 | 12,516,272→12,285,552 | 35,935.3→37,874.3 | 1.054 |
| [phone-home-near-evening](phone-home-near-evening-comparison.png) | 955→955 | 11,897,412→11,666,692 | 15,874.7→16,581.4 | 1.045 |
| [desktop-home-near-night](desktop-home-near-night-comparison.png) | 988→988 | 12,513,451→12,282,731 | 38,665.8→38,617.6 | 0.999 |
| [phone-home-near-night](phone-home-near-night-comparison.png) | 967→967 | 11,895,827→11,665,107 | 19,361.7→16,063.9 | 0.830 |

全条件でdraw callsは同じ、三角形は230,720減少。1株の頂点数は増える（1,134→3,656）ので、三角形減だけから軽量化とは判断しない。同期時間は0.609〜1.054倍で、条件により増減した。各条件1回・3試料、共有CPU上のSwiftShaderで、個々の試料にも大きな揺れがある。速度向上・実機の性能回帰・実機FPSの根拠にはしない。起動時間は計測していない。

初回の[昼PC結果](../README.md#同条件の実画像と描画値)は別の撮影実行として保持（時間比1.027倍）。初回の微小移動4frame診断を今回の夕・夜・スマホへ一般化しない。追加5条件ではその診断値を再計測していない。

## 短いカメラ移動の結果

[比較動画（左main・右復元）](motion-comparison.mp4) / [0・5・11番フレーム](motion-contact-sheet.png) / [全12フレーム一覧](motion-all-frames.png)

各640×360 high、12frame、8fps、1.5秒。前後全12frameでカメラ位置・向き・投影・時計・Math.randomの呼出し数/ハッシュが一致し、終了時の住人保存SHAも一致。両方とも実際の移動距離は6cmで、記録した区間内の向き・投影は一定だった。ブラウザ/シェーダーエラー0。動画形式とフレーム数もffprobeで検査しPASS。

全12フレーム一覧と0/5/11の抜き出しを確認し、丸い塊から葉のある茂みへ変わった輪郭が保たれること、周囲の若木・棚・石が残ることを確認した。小さな葉は低解像度では数画素で、細枝の詳細は判読しにくい。既存のHUD/地図読込や観賞用の図鑑表示の変化も含む。確認はフレームの抜き出しによるもので、実機で動画を再生して滑らかさや時間的なちらつきを評価したものではない。8fpsのオフライン比較からライブ配信品質を保証しない。

[機械比較](motion-comparison.json)、[raw PNGのSHA256](motion-frame-hashes.json)、[動画形式](motion-video-info.json)、[収集・照合ログ](collection.log)、[配信bundleと本体ソースの証跡](provenance.json)を保存した。rawフレームはこの実行環境の `/workspace/naupaka-evidence/motion-before/frames` と `motion-after/frames` に残る。図版の再生成は `python3 tools/lab/naupaka-extra-plates.py /workspace/naupaka-evidence docs/proposals/naupaka-restore-2026-10-14/extra`（Pillow、動画収集はffmpeg/ffprobeを使用）。

## 関連チェックと残る検証範囲

本体 `src/` は初回実装3cf4f36から差分なし。初回の歴史geometry完全一致・両共有乱数不消費/消費順・他5種形状一致・配置/衝突/60秒生活/保存/伐採指紋一致・既存wall前後/navの証跡をそのまま保持する。追加撮影では5条件の同条件比較、12frameの移動比較、動画形式検査を追加した。検査条件や閾値の緩和なし。最終HEADの型検査・build・fast CIはPR本文へ記録する。

[実行環境の確認](gpu-environment.txt)ではGPUデバイスの公開がなく、取得した描画はSwiftShaderのみ。実機GPU/実スマホ、長時間連続配信、実機での時間的ちらつき、slow検査は未実施。夜の細部判読とスマホのUI重なりの制約も残る。この追加確認を公開やmain統合の実施と読み替えない。

## 若木PR16は別成果として保全

今回の低木検証は若木第3案を含めない。若木の保存先は [Draft PR #16](https://github.com/ynatsume-source/3dproject/pull/16)、branch `codex/homestead-style-study`、HEAD `64a8d87f002b1baaf33f1ff3f2a5112fd1344ab1`。ローカルworktree `/workspace/homestead-style-study` も変更なし。

[初回・第2案・第3案の比較画像](https://github.com/ynatsume-source/3dproject/blob/64a8d87f002b1baaf33f1ff3f2a5112fd1344ab1/docs/proposals/homestead-style-2026-10-14/v3/evidence/three-way-comparison.png) / [第2案と第3案の短い動画](https://github.com/ynatsume-source/3dproject/blob/64a8d87f002b1baaf33f1ff3f2a5112fd1344ab1/docs/proposals/homestead-style-2026-10-14/v3/evidence/motion-comparison.mp4) / [資料・限界](https://github.com/ynatsume-source/3dproject/blob/64a8d87f002b1baaf33f1ff3f2a5112fd1344ab1/docs/proposals/homestead-style-2026-10-14/v3/README.md)。[そのHEADのCI](https://github.com/ynatsume-source/3dproject/actions/runs/38567118337)は成功を再確認した。

若木第3案の夕・夜・スマホ、実機GPU、長時間配信は未評価。丸い房・面の角・継ぎ目、樹冠拡大による家具の隠れは残る。今回PR17で夕・夜・スマホを確認しても、若木側の未完了検証を完了扱いにはしない。
