# Point Lobos / Bluefish Cove — Astra 独立試作

採用前の比較用試作。`astra/new-sea-ultra` で、共通基点 `7124cc649a881a805499eb6effa37caa49a92e3d` から制作した。最終統合と採否は Claude が判断する。main への統合・公開はしていない。実装担当の指定は GPT-6 Astra / reasoning ultra。

ポイントロボスの温帯ケルプ林を題材に、熱帯のサンゴ礁とは異なる水中体験を追加した。専用の岩と砂の地形、曲がる茎、低い茎と水面まで届く茎、浮いた葉の天蓋、岩へ付着するハプテラを備える。各葉の付け根には小さな気胞を置き、Macrocystis を表現する。付着器と底生生物の支持面には、描画する海底メッシュの三角形を使う。

魚はブルーロックフィッシュ、オリーブロックフィッシュ、ブラックサーフパーチ、セニョリータの4種。ウニとバットスター、岩の紅藻・石灰藻の色、岩と砂の水路を加えた。図鑑、3つの行き先、地球儀、昼夜、魚の捕食・逃避ログへ接続している。熱帯生物の既定追加と、夜の青い発光粒子をこの海域では抑えている。

## 画像

最終本番ビルドの Chromium / SwiftShader、1440×900。実機の性能評価や現地写真との一致を示すものではない。

| 見どころ | 軽量画質 | 標準画質 |
|---|---|---|
| 林・地形 | [low-forest](screenshots/low-forest.png) | [medium-forest](screenshots/medium-forest.png) |
| 天蓋 | [low-canopy](screenshots/low-canopy.png) | [medium-canopy](screenshots/medium-canopy.png) |
| 付着器 | [low-holdfast](screenshots/low-holdfast.png) | [medium-holdfast](screenshots/medium-holdfast.png) |
| ロックフィッシュ | [low-rockfish](screenshots/low-rockfish.png) | [medium-rockfish](screenshots/medium-rockfish.png) |
| 図鑑 | [low-guide](screenshots/low-guide.png) | [medium-guide](screenshots/medium-guide.png) |
| 夜 | [low-night](screenshots/low-night.png) | [medium-night](screenshots/medium-night.png) |

## 実在の環境と、この試作で決めたこと

| 項目 | 扱い |
|---|---|
| 地名・概略位置 | Point Lobos / Bluefish Cove、36.524°N・121.941°W。測量点としての精度は検証していない |
| 生物の題材 | カリフォルニアのケルプ林で見られる生物群を選定。各種の同定形質と現地の現在の分布・被度は未照合 |
| 地形・岸線 | 花崗岩質の岩礁と砂地を想定した手続き地形。実測測深・岸線・写真を使った復元ではない。陸景も未実装 |
| 株数・配置 | seed 317 による代表的な配置。現地の植生被度や個体数のデータではない |
| 水色・光・温度・透明度・潮汐 | 観賞用の代表値と既存の時刻・天気処理。色や光は写真未照合。表示の水温13°C、透明度15 mは観測値ではない |
| 水深 | 表示6–19 m。中心±130 mを2 m間隔で調べた生成地形は約6.13–18.77 m。海域全域の極値や現地の水深を保証しない |
| 地図 | 実地図は未収録。座標と「地図未収録」を表示し、他の海の地図が残らないようにした |

照合先の候補は [California State Parks](https://www.parks.ca.gov/?page_id=571)、[Monterey Bay Aquarium / Giant kelp](https://www.montereybayaquarium.org/animals/animals-a-to-z/giant-kelp)、[Monterey Bay National Marine Sanctuary](https://montereybay.noaa.gov/)、[California Department of Fish and Wildlife](https://wildlife.ca.gov/Conservation/Marine)。今回これらのページの取得・内容照合は行っていない。出典検証済みの写真再現として扱わない。

## 検証

2026-10-02 の最終ビルドは `main-CA3iQIZV.js`。型検査、ビルド、昼・夕・夜・朝の生態系シミュレーション、[地形検証](geometry.json)が成功した。

| 確認 | 結果・範囲 |
|---|---|
| `npm run typecheck` / `npm run build` | 成功。Viteの将来の設定ローダーに関する既存警告あり |
| `npm run sim -- pointlobos` | 4時相を完走。餌探し・休息・狩り・捕獲・逃走のログを確認。全生態の正確性の検証ではない |
| `scripts/pointlobos-check.ts` | 有限頂点、index範囲、熱帯既定生物なし、付着器支持、3行き先、同seed再構築を確認 |
| 軽量画質の本番ブラウザ | 成功。海域往復、旧海のPiP/通知とfire/cave値のresetも確認。[browser-low.json](browser-low.json)、JavaScript/シェーダーエラー収集は空 |
| 標準画質の本番ブラウザ | 成功。終了時も「画質 標準」、6場面撮影・目視、魚移動・3行き先・図鑑・夜を確認。[browser-medium.json](browser-medium.json)、JavaScript/シェーダーエラー収集は空 |
| 既存魚モデル | 先行する実装検証で既存24形状×2 LODのgeometry hash不変を確認済み。今回の最後の変更は植物法線と水深表示のみで、魚モデルは再変更していない |

ブラウザ確認は、森・天蓋・付着器・魚・図鑑・夜を撮影し、魚座標の進行、行き先3件のクリックで自動巡航、図鑑に熱帯用見出しがないこと、夜の `uBiolum=0` を検査する。軽量画質のみ、Point Lobos → 地球儀 → 宮古島 → 地球儀 → Point Lobos を往復し、宮古の発光・実地図の復帰、ケルプ非表示、再訪時の株数と地図表示を検査する。旧海に永続する仮のPiP被写体・通知とライト値を注入し、海を移ったあとに残らないことも確認する。

軽量画質の記録は画質固定用のスクリプト変更前に取得した（lowより下への自動降格はない）。標準画質は画質ボタンの操作で自動降格を止め、開始時と終了時のラベルを検査した。アプリのビルドは両方とも同じ。

Google Fonts と Open-Meteo の通信はこの環境では `ERR_TUNNEL_CONNECTION_FAILED`。代替フォントと既存の天気フォールバックで描画した。実天気取得の成功は今回の結果に含めない。Windows ANGLE/D3D11、実機スマートフォン、ハードウェアGPUの性能・長時間運転・保存データ往復は未検証。

## 構築量と費用

[geometry.json](geometry.json) は静的なgeometry格納量とinstance展開量を分けて記録する。ブラウザJSONの `submitted` はカリングやPiP・後処理を含む、撮影付近の実際のWebGL送信量であり、この表とは異なる。

| 対象 | 最終値 |
|---|---:|
| ケルプ | 364株 / 1,428茎 / 30,421葉 / 62メッシュ |
| ケルプ頂点 / 三角形 | 1,358,199 / 1,757,008 |
| ウニ / バットスター | 320 / 110 |
| 海全体の格納頂点 / 格納三角形 | 1,559,749 / 2,122,205 |
| instance展開後の三角形 | 3,002,592 |
| 海全体のメッシュ数 / instance数 | 347 / 3,272 |

森の撮影位置で記録した送信量は、軽量画質が68 draw / 1,046,266三角形、標準画質が90 draw / 1,082,588三角形。記録した5フレーム内では各値が一致した。撮影位置・PiP・画質設定で変わるため、シーン全体の最大値ではない。

植物法線を保存しないことで、Float32×3×1,358,199 = 16,298,388 bytes（約15.54 MiB）の法線属性を省いた。CPUの属性配列とGPUへの属性アップロードを減らす変更であり、ブラウザ全体の実測メモリ削減量ではない。植物シェーダーは変形後の位置の微分から法線を作り、底生生物は頂点法線を使い続ける。

40 m単位のセルを既存の距離・視線カリングへ接続している。画質別のケルプ形状LODや株数削減は未実装で、軽量画質も森全体のgeometryを構築する。葉の両面描画と細かい形状には相応の負荷があり、SwiftShaderのFPSを実機性能として扱わない。LLMのトークン数・請求額は取得できず不明。新しい実行時AI呼び出し、有料素材、ライブラリ依存は追加していない。

## 再現手順

Node.jsはVite 8の要求を満たすものを使い、依存未導入時は `npm ci`。このクラウド環境では次のコマンドを使った。既存 `NODE_PATH` は上書きしない。PlaywrightとChromiumはレビュー環境が提供し、アプリ依存には追加しない。

```sh
cd /workspace/3dproject-astra-sea
export PATH=/workspace/3dproject-cloud/toolchain/node_modules/node/bin:$PATH
npm run typecheck
npm run build
npm run sim -- pointlobos
npx tsx --import ./scripts/node-assets.mjs scripts/pointlobos-check.ts > docs/proposals/astra-new-sea/geometry.json
npm run preview -- --host 127.0.0.1 --port 4177 --strictPort
```

previewを起動したまま別のシェルで順に実行する。

```sh
node docs/proposals/astra-new-sea/review.cjs low
node docs/proposals/astra-new-sea/review.cjs medium
git diff --check
```

previewのプロセスは環境再起動後に立ち上げ直す。スクリプトは内部検証用の4177番へ接続し、JSONとPNGをこのディレクトリへ保存する。`CHROMIUM_PATH` で別のChromium実行ファイルを指定できる。観賞時刻は2026-09-22の現地正午と深夜へ固定しているが、魚の動きと演出には既存の非決定的な乱数があるため画像は毎回完全一致しない。

## 採用判断と残る表現上の課題

独立選定後、先行案 `codex/monterey-kelp-prototype` も近隣の同じ生態系を扱うことが分かった。比較する代替案であり、両方を既定海域として追加する提案ではない。今回の地形・三角形への接地・茎の曲がり・茎の高低・天蓋を採用の基礎候補とする。先行案の細い葉と、方角・縮尺・現在地を示す模式地図は部分採用の候補。

近景では葉の角ばり、規則的な繰り返し、低画質の光線の板状表現が見える。葉の細部・負荷・種ごとの特徴は改善余地がある。ブルーとオリーブは形を共有し、セニョリータの尾柄黒斑、掃除行動、潜砂は未実装。ウニとヒトデは静的な姿で、ケルプの成長、ウニの摂食、魚・ドローンと葉の衝突はない。葉の透過光や天蓋の影は近似表現。時差は `tz=-8` 固定でカリフォルニアの夏時間に対応していない。

住民、世界時間の設計、保存キーと保存形式は変更していない。海域切替で消すのは一時的な観察表示であり、保存済みログは削除しない。取り込み範囲と共有部の注意点は [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) にまとめた。
