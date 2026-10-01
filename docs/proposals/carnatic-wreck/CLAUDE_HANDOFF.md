# Claude への引き継ぎ

ユーザー依頼: 紅海北部の沈没船の出来栄えを改善する試作を、Claude が確認して本実装へ進めやすい独立ブランチにする。

最初に [README](README.md) と比較画像を確認してください。既存の作業内容を保護し、この案を最終仕様とみなさずレビューしてください。

## 差分

- `src/ocean/wreck.ts`: プロシージャルモデルと材質。公開 API は保持、`landmarks` だけ追加。
- `src/ocean/build.ts`: 船上のソフトコーラルを小さくする 1 行。
- `src/ui/places.ts`: Carnatic に行き先 2 件。
- `scripts/wreck-check.ts`: ジオメトリと往復撮影路の検査。

レビュー時に `git diff 7124cc6...origin/codex/carnatic-wreck-detail` を参照できます。main の全ファイルをこのブランチで置換しないでください。作業中の住民・動作の変更はそのまま維持してください。

この作業の終盤に確認した main `00e7a4d` は、住民のモデル・生物モデル・residents の変更でした。今回のソース差分とは重なりません。ただし取り込み時の最新 main と、Claude の未コミットの作業については改めて確認してください。

## 画面を開く

```sh
npm ci
npm run typecheck
npm run build
npm run preview -- --host 0.0.0.0
```

起動した URL に `/?debug&tier=low&at=2026-06-20T10:00:00Z#carnatic` を付けます。既存ポートと競合する場合は `--port` で分けてください。

図鑑の「船首の骨組み」「船体の破断部」、既存の沈船ツアーから観賞できます。

比較撮影に使った手動カメラ（`?debug` の console）:

```js
const s = seaglass;
s.drone.mode = 'manual';
s.drone.pos.set(8, -11, -20); s.drone.vel.set(0, 0, 0);
s.drone.lastInput = performance.now();
// 視点 (8,-11,-20) → 注視点 (19,-14,-3)
s.drone.yaw = Math.atan2(-11, -17);
s.drone.pitch = Math.atan2(-3, Math.hypot(11, 17));
```

## 採用前の確認優先順

1. 実船写真との照合。特に二つの船体のずれ、甲板梁、マスト残骸、煙突、船尾。未検証の部分は修正または省略してよい。
2. 通常 GPU と Windows ANGLE で、近景のちらつき・裏面・過度の暗さ・FPS を確認。ポリゴン数は増えています。
3. 地形の新しい変更があれば `wreck-check.ts` と往復ツアーを再確認。高さマップなので内部探索の精密衝突は対象外。
4. 必要なら部材や材質のみ採用。見た目の改善と、住民ロジックや描画基盤の改修を一緒にしない。

新しい海のブランチを併用する場合、`build.ts` と `places.ts` は双方に差分がありますが、編集箇所は別です。両方を一つずつ取り込み、最後に両海域を開いて確認してください。
