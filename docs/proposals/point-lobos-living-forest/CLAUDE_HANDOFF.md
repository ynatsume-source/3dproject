# Claudeへの引き継ぎ

ポイントロボスの林床が疎らに見えること、生き物がケルプや砂地を暮らしの場所として使う動きが少ないことを改善した試作です。既存の成株・地形・水色と、Claudeが導入したケルプの区画別LODを土台にしています。

- 対象ブランチ: `codex/point-lobos-living-forest`
- 基準main: `b001aeb9d81f887ebcab3c2d01823629de04fcf0`
- 実装・テスト: `2cf7f7a51db46646c8c74ba08590b683dc8dd4d0`（資料・画像は後続コミット）
- 比較: [README](README.md) / 生態と地形の根拠: [RESEARCH](RESEARCH.md)

## コピペ用

```text
ynatsume-source/3dproject の codex/point-lobos-living-forest を確認してください。
docs/proposals/point-lobos-living-forest/README.md の変更前後画像、近景・動画、RESEARCH.md、検証結果を見たうえで、出来の良い部分を現在のmainへ取り込んでください。

内容は、ポイントロボスの局所的なケルプ増加と林床の海藻、既存4種の魚の生息場所と採餌、セニョリータの砂中休息、小さな底生生物、野生アザラシの訪問です。
既存の地形・成株380株・LOD・住民の保存を維持しています。基準は b001aeb なので、あなたがその後変更した部分を優先して比較・統合してください。

全体をそのまま採用する必要はありません。植生、魚の暮らし、小動物、訪問アザラシの順に見て、見た目と負荷の良いものを選んでください。
描画量は増えています。Windowsの実GPUや普段使う画質で動かし、移動時の引っかかり・近景の接地・昼夜の行動・他海域への影響を確認してから採用してください。
未同定の海藻や小動物の形へ、資料にない種名や現在の実測密度を付けないでください。
```

## 採用単位と接続

| 単位 | 主なファイル | 統合時の注意 |
|---|---|---|
| 植生 | `src/ocean/kelp.ts`, `src/ocean/kelp-understory.ts` | `anchors`, `stats`, `floorAt`, `update`の既存APIを維持。追加`understory.anchors`は小動物と採餌が参照 |
| 魚 | `src/eco/kelp-life.ts`, `src/eco/fish.ts` | Point Lobos限定。既存のsteering/捕食/回避へ目的地と姿勢を加える。復活・ガイド・prey位置も対応 |
| 小動物 | `src/ocean/lobos-benthos.ts` | 旧`kelp.ts`末尾の静止`buildBenthos`を置換。`build.ts`で生成し`Ecosystem.step`で更新 |
| 訪問者 | `src/eco/lobos-visitors.ts`, `src/ocean/lobos-visitor-models.ts` | Point Lobosだけに生成。`Ecosystem`のupdate/subjectsへ接続。住民ラッコとは独立 |
| 見つけ方 | `src/data/pointlobos.ts`, `src/ui/places.ts`, `src/ui/thumbs.ts`, `src/main.ts` | 図鑑、近景の行き先、アザラシの発見/追跡/肖像。main全体を置換せず追加箇所を統合可能 |

植生だけを取り込む場合は、現行版の静止`buildBenthos`生成を残してください。このブランチでは小動物モジュールへ置き換えるため削除しています。下層海藻を外す場合は、`build.ts`から渡す`understoryAnchors`も省略するか空配列にしてください。魚と小動物の内部は、葉の支持点がなくても岩上の行動へフォールバックします。

アザラシを外す場合は生成/update/subjects、extraGuide、mainの専用分岐、thumbsをひとまとまりで外せます。生物数や訪問間隔は現地の統計ではなく設計値です。

## 動作の境界

- 現行の4魚種と個体数を保持。採餌・休息の角度や周期、砂床の検索半径33mは演出値。
- 夜でも安全な砂が見つからない魚は埋没させません。起床は既存の明るさに基づく活動量に従うため、日の出直後には眠っている個体もいます。
- 岩上の巻貝とバットスターは遅い有界軌道。近景更新は間引きます。葉の巻貝は実際のGPU変形と同じ支持点へ毎フレーム追従します。
- アザラシの訪問時間は観察中のdtで進み、他海域へ移ると停止。底生生物の這行・葉の揺れは共通描画時間の位相を使い、再訪時にその位相へ据え直します。
- 新しい住民の記憶・保存キー・サーバー・ライブラリ・外部モデル素材は追加していません。

## 再検証

Node 22系、既存のロックファイルを利用します。

```sh
npm ci
npm run typecheck
npm run build
npx tsx --import ./scripts/node-assets.mjs scripts/pointlobos-check.ts
npx tsx --import ./scripts/node-assets.mjs scripts/lobos-forest-check.ts
npx tsx --import ./scripts/node-assets.mjs scripts/lobos-fish-life-check.ts
npx tsx --import ./scripts/node-assets.mjs scripts/lobos-benthos-check.ts
npx tsx --import ./scripts/node-assets.mjs scripts/lobos-visitors-check.ts
npm run sim -- pointlobos
npm run sim -- miyako
```

画像は960×600の実アプリで、比較用に時刻・天候・海藻の揺れ・カメラを固定。比較4枚は生態更新を停止しているため、魚の行動の証明には使いません。近景・動作記録を併せて確認してください。描画数の詳細と、実機で未検証の範囲はREADMEに記載しています。

再撮影用の`capture.cjs`と`life-capture.cjs`は環境側のPlaywright/Chromiumを使い、動画の書き出しにはFFmpegが必要です。これらはアプリの依存関係へ追加していません。Chromiumの場所は`CHROMIUM_PATH`で指定できます。各スクリプト冒頭に起動引数があり、生活の撮影は`--small`、`--fish --video`、`--portraits --seal --video`で選びます。
