# 取り込み時の注意点

比較ブランチは資料のみです。ここから main を更新する必要はありません。制作ブランチから採用する差分を選んでください。

## 基点と現行作業

制作4案の基点は `7124cc6`。比較資料の基点は、資料を作り始めた時点の main `a39f9a3` です。これは実装の新旧や優劣を示すものではありません。

2026-10-02の再開時に取得した main は `4219cb0fdd5a7450d8d6e821ab1db4f49aca27ba` です。基点から、住民の動作と植生に加え、カメ・クジラ等の行動、島周辺へ海の生物を広げる配置処理が更新されています。特に `src/ocean/build.ts`、`src/main.ts`、`src/eco/fish.ts` は新海域案と変更箇所が重なります。古いファイル全体で置き換えると最新の変更を失うため、採用する差分を現在の構造へ移してください。採用時にはさらに新しい更新や未コミットの作業も確認してください。

### 最新mainとの事前確認

制作とは別のレビュー担当が、`git merge-tree --write-tree --name-only` で3-wayの併合結果を確認しました。Astraの最終コミットでも結果を再確認しています。これは作業ツリーを変更しない静的な確認です。実際に統合したアプリの動作確認ではありません。

| 提案 | 確認時コミット | `4219cb0` との内容競合 |
|---|---|---|
| 先行沈没船 | `94a4dd5` | なし |
| Astra沈没船 | `572fb18` | なし |
| 先行Monterey | `c70aa3d` | `src/ocean/build.ts`、`docs/ARCHITECTURE.md` |
| Astra Point Lobos | `34fab2d` | `src/ocean/build.ts` |

**海の2案は、競合表示を解消するだけでは不十分です。** 最新mainではサンゴ配置が `coralAt()` 関数へ抽出されています。試作の「サンゴの総重みが0なら生成しない」という判定の `continue` は、自動併合されると関数内に入り、`TS1107: Jump target cannot cross function boundary` になります。レビューではMonterey `c70aa3d` とAstraの保存コミット `3906de2` の併合内容をメモリ上でTypeScriptに検査させ、このエラーを確認しました。Astraの最終コミットも、このサンゴ配置処理は同じです。採用時は関数から抜ける `return` に適応してください。各試作ブランチ単体の不具合ではありません。

海底小物の競合では main の `placeLitter` 宣言と新しい生成構造を保持し、ケルプ海域を除外する条件だけを加えます。さらに以下を残してください。

- 海岸を80m区画で生成し、遠方区画を破棄する処理と島全域の障害物マップ。
- `main.ts` の `cur.grow` 呼び出しと `ZONE` の更新、および各生物がその範囲を利用する処理。
- 住民が近くの魚を見つけて眺めるための `T.nearFish`。

Montereyの `buildKelp` / `loc.kelp` と、Astraの `makeKelpForest` / `loc.habitat` は別のAPIです。植物だけを交換する場合も、材質・生成条件・地形支持と合わせて確認してください。

再現する場合は、fetch後に例えば次を実行できます。結果に内容競合が含まれると終了コード1になります。

```sh
git merge-tree --write-tree --name-only 4219cb0 94a4dd5
git merge-tree --write-tree --name-only 4219cb0 572fb18
git merge-tree --write-tree --name-only 4219cb0 c70aa3d
git merge-tree --write-tree --name-only 4219cb0 34fab2d
```

比較対象を固定したコミットは [REVIEW_SNAPSHOT.md](REVIEW_SNAPSHOT.md) を参照してください。これは確認時点の静的な検査で、今後のmainに対する無条件の互換性保証ではありません。

## 差分を読む方法

まず作業ツリーの状態を確認し、必要なブランチを fetch します。確認だけなら作業中のブランチを checkout し直す必要はありません。

Astraの2ブランチは、復旧した作業の退避コミットと、検証・仕上げのコミットに分かれています。**最新の1コミットだけをcherry-pickしても試作全体にはなりません。** 各案の全変更は共通基点 `7124cc6` からそのブランチ先端までの累積差分です。履歴を確認して必要なコミット範囲を選ぶか、下記の累積差分から採用部分を移してください。

```sh
git status --short --branch
git fetch origin
git diff 7124cc6...origin/codex/carnatic-wreck-detail -- src scripts
git diff 7124cc6...origin/astra/carnatic-wreck-ultra -- src scripts
git diff 7124cc6...origin/codex/monterey-kelp-prototype -- src scripts
git diff 7124cc6...origin/astra/new-sea-ultra -- src scripts
```

例として、資料は次のように読めます。

```sh
git show origin/astra/carnatic-wreck-ultra:docs/proposals/astra-carnatic/CLAUDE_HANDOFF.md
git show origin/astra/new-sea-ultra:docs/proposals/astra-new-sea/CLAUDE_HANDOFF.md
```

## 選び方

- 沈没船の2案は同じ機能の代替実装です。双方を順番に丸ごと取り込むと、もう片方の形状やAPIを上書きすることがあります。採用ベースを先に決めてから、必要な部分だけ移植してください。
- カリフォルニアの2案も近い環境の代替候補です。海域の登録・分布マスク・材質の分岐・図鑑・地図を一組として確認してください。
- シェーダーだけ、形状だけを混ぜる場合、attribute/uniform の契約や instance matrix、座標空間、法線、bounds の互換性を確認してください。
- 船体の点群・障害物マップ・鑑賞路は連動します。形状を取り込んだ後で鑑賞路の検査を省かないでください。
- 地図の未収録海域へのフォールバックや、熱帯用サンゴの無条件生成を止める処理は、視覚素材を選ぶ場合でも必要になり得ます。

## 採用後の確認

採用したブランチの検査コマンドを読み、型検査・ビルド・該当海域のシミュレーションを実行します。画面では沈船の遠景/骨組み/破断部とツアー、新海域の中層/上層/海底/夜を確認し、既存海域と往復して表示や資源が残らないかを確認してください。

Windows ANGLE、iOS Safari、実 GPU の負荷、実船や現地資料への照合のうち、今回未検証のものは採用時の確認項目として残してください。クラウドの SwiftShader による描画成功から、それらまで成功したと推定しないでください。
