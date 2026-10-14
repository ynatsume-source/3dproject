# 第2案：同じ近景で形と素材感を読む

初回 `1654ec4` と画像・計測は親ディレクトリにそのまま保持する。第2案の本体コードは `7ce1c66`。新しい建物・草の配置・保存状態は追加しない。

若木5本の既存4葉メッシュを、それぞれ5つの薄く垂れる枝葉の塊へ変更した。上から下へ伸びる丸い塊から、幹のまわりに段のあるシルエットへ変える狙い。既存pivot・幹の根元・切株・伐採状態は維持し、葉の内部の位置と広がりだけを調整する。葉束は1メッシュ152→580三角形。

薪棚の屋根と作業台天板は、既存の外寸・原点の中で7枚／3枚の板状部分へ分け、継ぎ目を作った。薪・柱・切株・若木の幹に広い明暗差と明るい木口を付ける。材質は既存ShaderMaterialを使い、指定geometryの頂点色だけで光沢を抑える。共有材質を使う未変更geometryには既定の白い頂点色が入るので、色と光沢は維持する。乾燥量や進捗を示す色ではない。

地面・草は今回の一画として検討したが、初回画像の問題は若木の塊と光沢、家具の一枚板にあるため、この最初の比較では追加しない。地形・植生配置・当たり判定を保ったまま、形と素材感だけの効果を評価する。

検証：形状の閉面・外向き・有限値・板外寸・乱数不消費、typecheck、production build、薪状態5件、fell、navが成功。世界配置・衝突・60秒の生活履歴・保存・乱数・成木と若木の伐採後状態は初回fingerprintと完全一致。既存テストの条件は緩和していない。

比較条件は初回と同じ人工保存・カメラ・昼12:00・1280×720 high。初回の近景raw reportと比較する。SwiftShaderの同期フレーム時間は実機性能ではなく、別実行時点の共有CPU負荷も含む。実機GPU・長時間配信・第2案の夕／夜／phoneは未評価。この一画を見て方向性を判断し、全島展開・main統合・公開は行わない。

## 最初の近景

[初回と第2案の並列比較](evidence/near-comparison.png) ／ [第2案の原画像](evidence/desktop-home-near-day.png)

実際の描画では、初回の丸い塊から段のある枝葉への変化と、薪棚の板の継ぎ目・木口を確認できる。ただし葉は大きく尖った板状にも見え、モクマオウの繊細な枝葉として完成していない。家具は木に比べると画面内で小さく、変化も控えめ。コンセプトを実機の完成保証とは扱わず、この一画の方向性評価用に止める。

近景draw callsは981→981、三角形は12,517,808→12,526,848（+9,040、約0.072%）。同期フレーム中央値は29,469.9→38,587.5ms（1.309倍）。各3サンプルのSwiftShader計測で実機性能の回帰判定ではない。同じ4フレームの微小移動診断では、最大二階明度差0.12超の画素率が0.48025%→0.78657%へ増加した。輪郭・色・影も含む診断で純粋なaliasingではないが、ちらつき改善の証拠はなく、尖った葉の縁は次の修正対象。見た目の変化が大きくなったことと、品質が改善したことは分けて評価する。

[機械可読の初回比較](evidence/comparison.json)では、保存・乱数・カメラ・時刻・画質・Object3D 2,317・Mesh 2,154が一致。撮影コードは初回と同一で、reportのsourceCommitは第2案の本体コード7ce1c66を示す。

## Shader検査

既存`scripts/shader-check.mjs --tier high`へ外部通信を遮断するrouteだけを追加したコピーを使用し、planet / kayama / gbr が全件成功。検査対象・合否条件は変更していない。実行したコピーとログをevidenceに保存した。今回の第2案ではlow/mediumのshader検査は未実施。

```sh
NODE_PATH=/opt/codex/cua_node/lib/node_modules CHROMIUM=/usr/bin/chromium node docs/proposals/homestead-style-2026-10-14/v2/evidence/shader-check-offline.mjs --tier high
node tools/lab/homestead-compare.mjs docs/proposals/homestead-style-2026-10-14/evidence/raw/after-desktop-home-near-day.json docs/proposals/homestead-style-2026-10-14/v2/evidence/report.json
```

環境のPlaywrightとChromiumのパスは実行環境に合わせて指定する。ユーザー保存・秘密情報・実APIは使用していない。
