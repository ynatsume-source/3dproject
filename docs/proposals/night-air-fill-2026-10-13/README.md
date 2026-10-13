# 夜間の地上補助光・最小試作

基準: main `4b2a7956f946c90f332f117051a4bcb681708221`。未採択の見た目試作。main統合・公開なし。

変更は `src/ocean/shore.ts` の共有 `airLit` のみ。夜間に弱い青い補助光を加え、上向き面を少し明るくし、雲と月明かりで抑える。物理的な星明かりのモデルではなく観賞用の色計算。`uMoonI` は既に月相×高度のため、提案にあった追加の `uMoonIllum` 掛けは行わない。昼は `uNight=0` で補助項がゼロ。

共有関数のため家・薪だけでなく地面・森林・住人等にも作用する。新しい照明オブジェクト、uniform、乱数、モデル、テクスチャ、分岐内サンプリングは追加しない。住人の知覚、科学・物理・AI・保存・経路は変更しない。自然ブランチの変更は取り込まない。

参考Library画像は実ファイル取得がDNS障害で未完了。画像依存の薪造形は保留。本試作は夜間視認性だけを扱う。

## 再現方法

PR #9 の `tools/lab/firewood-*` を再利用し、月相・雲、射影、同期フレーム計測の記録を追加。実ユーザー保存は読まず、24kg薪・棚屋根・既存樹木1本の伐採を含む合成保存を使う。撮影ブラウザは新規コンテキストで外部通信を遮断、AIなし。カメラ・保存・時刻・seedを固定。

```sh
node --import tsx --import ./scripts/node-assets.mjs tools/lab/firewood-fixture.ts /tmp/night-fixture
node node_modules/vite/bin/vite.js build --minify false
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5318 --strictPort
# 別シェル（Playwright / Chromium のパスは環境に合わせる）
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME=/usr/bin/chromium \
  FIXTURE=/tmp/night-fixture/fixture.json OUT=/tmp/night-before WARM=2 SAMPLES=3 \
  node tools/lab/firewood-capture.mjs
node tools/lab/firewood-compare.mjs /tmp/night-before/report.json /tmp/night-after/report.json
```

1280×720 high／390×844 medium、昼・新月・満月・曇天夜の8条件。2026-10-10の新月（照明率0.000064）と10-26の満月（0.999440）、各20:30。夕方は今回の夜間限定試作では未測定。日時ごとの潮位差等はA/B内では固定だが、月相間は変わりうる。

SwiftShaderで2フレーム暖機、3フレーム標本。`gl.finish` と1px `readPixels`まで含む全フレーム時間。実機FPS・Windows ANGLE/D3D11の保証ではない。少数標本なので小差の性能判断は保留。同一実装の新しいA/Aを併記し、旧試作の4.7%を閾値に使わない。
