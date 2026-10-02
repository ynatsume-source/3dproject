# Claude への引き継ぎ — Carnatic / Astra Ultra

未採択の比較候補。**最終的な確認・採否・本実装は Claude に任せる**という依頼に沿い、mainへ統合していない。

## 最初に見るもの

1. [README](README.md) の原型/試作の3視点。内部の奥行き、中央の切れ目、細い船首・船尾、海の静けさを見てほしい。
2. [変更の中心](../../../src/ocean/wreck.ts) を開く。実装は `src/ocean/wreck.ts` の1ファイルのみ。
3. [costs.json](costs.json) と [drone-check.json](drone-check.json)。画面の印象と描画量・衝突の安全性を分けて判断する。

制作指定は **GPT-6 Astra / reasoning ultra**。base は `7124cc649a881a805499eb6effa37caa49a92e3d`、branch は `astra/carnatic-wreck-ultra`。別モデル案は参照せず、baseから独立して実装した。補助agentは検査スクリプトと計数だけを担当した。

## 採用時の手順

- まず `CLAUDE.md`、`docs/ARCHITECTURE.md`、ADR 0001 を読む。
- このbranchを別の通常cloneで確認するか、必要なcommitを作業branchへ cherry-pick する。mainへ直接pushしない。base以後の本流更新は統合先で確認する。
- 特に `src/ocean/wreck.ts` が本流で更新されていたら、外形・素材・衝突点の変更を一緒に確認する。形だけ移し、面内の障害物サンプルを落とさない。
- 依存と起動は下記。構造テスト→production画面→実GPU確認の順に進める。
- 史料に合わない細部は修正・削除してよい。機関の円筒、倒れたマストの位置、舵・バウスプリットは特に写真照合が必要。
- 採用する場合にだけ通常のレビュー・統合・公開手順へ進む。この資料は正式仕様ではない。

```sh
# cloudで準備済みのNode。通常の開発環境ではNode22を使う。
export PATH=/workspace/3dproject-cloud/toolchain/node_modules/node/bin:$PATH
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm run typecheck
npm run build
npx tsx --import ./scripts/node-assets.mjs scripts/astra-wreck-check.ts
npm run sim -- carnatic
npm run preview -- --host 127.0.0.1 --port 4176
```

別プロセスから、cloudの既存 `NODE_PATH` で Playwright が読める状態で実行する。

```sh
node docs/proposals/astra-carnatic/capture.cjs http://127.0.0.1:4176 carnatic review
node docs/proposals/astra-carnatic/drone-check.cjs http://127.0.0.1:4176
```

`capture.cjs` は既存のアプリ画面へドローンを移動するだけ。画面の上下動・魚・粒子は止めていない。スクリーンショットを開いて自分でも見ること。将来の開発環境ではChromiumのパスを修正する必要がある。開発用は `npm run dev -- --host 127.0.0.1 --port 5176`。

## 実装の地図

- `WreckMesh`: 一つのBufferGeometryへ面・矩形梁・中空円筒を詰める。面内の点を採り、既存ObstacleMapへ渡す最高点群を作る。
- `Wreck.constructor`: 船体断面と前後片→厚い外板と欠損→肋骨とフランジ→甲板梁/縦通材→船首船尾→倒れた部材→中央の残骸→付着物。
- `wreckMaterial`: 鉄/石灰/被覆を3D value noiseで分ける。船体全体を斜めに横切る反復帯は初稿で問題になったため修正済み。陰はfogの前に掛け、水まで黒くならないようにしている。
- `geo.userData.trianglesByPart`: 0外板、1骨格、2部材/縁、3仮機関、4低い付着塊、5小型海綿。4と5も船体の計数に含まれる。
- `up`: buildOceanが既存のウミトサカ/ウミウチワを置く40点。上限56。既存buildOceanは `n` の方向をインスタンス回転に使わないため、ほぼ上向きに生える点だけを選んでいる。

## Claude が決める必要のある点

- **実物との一致**: この試作は資料未照合の解釈。実際の残存肋骨・外板・マスト・機関部と照合し、正確でないディテールを減らしてほしい。
- **骨格の規則性**: 読みやすさのため周期が残る。近景でまだ新品の骨組みに見えるなら、資料に基づいて梁の抜け・曲がり・被覆密度を調整する。
- **既存サンゴ**: 大きいウミウチワや樹状サンゴは既存モデルを再利用。海藻/サンゴ全体の描画品質は本案の変更外。
- **コスト**: 船体は36,698三角形。近景の厚みと付着の小塊に多くを使う。実GPUで重ければpart4/5の密度や遠景LODをまず検討する。三角形だけでFPSは決められない。
- **衝突**: 既存高さマップを維持し、外側のツアーは検査済み。内部潜航を採用するなら別目的として3D衝突・経路を設計する必要がある。
- **乱数**: モデル造形に専用seedを使うようにしたため、共有乱数を使っていた原型とは周辺の初期配置がずれる。保存形式や住民ロジックの変更はない。

## 検証済み / 未検証

型・build・Carnatic sim、有限ジオメトリ/面/法線、実マップの面内被覆、両方向のツアーとDirector、productionの5視点、実ドローン制御の両方向の早回しを確認済み。細かな数字はREADMEとJSONにある。

未検証は現地写真との照合、Windows ANGLE/D3D11、Safari/スマートフォン、実GPUの性能・長時間描画、全保存データの回帰。新しい専用shaderのテクスチャ取得は0だが、共通lightingは従来のものを使う。SwiftShader画像を実機性能の証拠にはしない。
