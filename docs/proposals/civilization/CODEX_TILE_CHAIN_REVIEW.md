# 粘土のScienceStep一周と、レビューのまとめ

2026-10-03 JST。追加対象は `codex/civilization-simulation` の
`d5a853f70aadaeb1dda396718ce1c61fd726cca8`。
先に届いた `6731f11`（石灰・検査器）と `4a49569`（検証画面の取り込み）のレビューも含めて返答する。

修正後 `1f7538f` の確認と現在の残件は [CODEX_FIX_REVIEW_1f7538f.md](CODEX_FIX_REVIEW_1f7538f.md) を参照。

## 結論

入口を一つにし、乾燥→焼成→秤量→浸漬→秤量→吸水率とつなぐ方針は確認できた。
`d5a853f` の既存検査は合計127件と型検査が成功した。
一方、追加条件では新たに2件の不具合を再現し、[石灰レビュー](CODEX_LIME_REVIEW.md) の
R1・R3・R5に関係する問題も焼成・浸漬に存在することが分かった。
修正・回帰検査と本体側の最終レビューまでは、試験世界にとどめる。

## T1 / P2: 焼成前から割れている試料を「ひびなし」と観察する

対象: [firing.ts L166–169](https://github.com/ynatsume-source/3dproject/blob/d5a853f70aadaeb1dda396718ce1c61fd726cca8/src/science/step/firing.ts#L166-L169)

入力の `quality.crack: 2`（貫通割れ）を引き継ぐ通常焼成で、生成物の品質は `crack: 2` のままなのに、
観察が「ひびは見当たらない」「高く澄んだ音」になる。
新しく発生した割れだけをローカル変数 `crack` に入れ、観察文をその変数から選んでいるため。
品質はL160で入力の割れと最大値を取っているが、観察にはその結果を使っていない。

住民は内部の品質値ではなく観察から判断するため、既存の破損を見落とした結果が伝わる。
既存の割れも含めた状態から観察を生成してほしい。
新しい焼成で割れが発生しなかった場合の、入力 `crack: 1/2` を回帰検査へ追加する。

## T2 / P2: 一度湿った試料を浸け直すと、吸水が不自然に止まる

対象: [soak.ts L63–66](https://github.com/ynatsume-source/3dproject/blob/d5a853f70aadaeb1dda396718ce1c61fd726cca8/src/science/step/soak.ts#L63-L66)

乾燥した焼成体100000 mg、`sinter_ppm: 0`、十分な水で、次の値になる。

| 条件 | 試料中の水 |
|---|---:|
| 1時間浸漬 | 5666 mg |
| 取り出した試料を乾燥させず、別の工程としてもう1時間浸漬 | 5666 mg |
| 連続して2時間浸漬 | 9103 mg |

取り出して戻す間の経過時間は0とし、同じ温度・吸水上限を想定している。
これは同一runを区切る検査とは別で、**既に水を含むロットを新しい浸漬へ渡すケース**。

式が毎回「完全に乾いた試料が時刻0から吸水した量」を目標とし、そこから現在の水を引くため、
既存水分があると初期の吸水が0になる。
モデルの指数近似を維持するなら、開始水分W0と上限W∞から
`W(t) = W0 + max(0, W∞ − W0) × (1 − exp(−t/τ))` のように増分を計算する必要がある。
整数mgの丸めの範囲で、連続浸漬と即座に浸け直した場合を比較してほしい。
時定数や上限の数値が実測で校正されたという意味ではない。

## 石灰側の指摘が追加工程へ及ぶ範囲

- **R1（P1、区間分割と熱）**：
  [firing.ts L79–97](https://github.com/ynatsume-source/3dproject/blob/d5a853f70aadaeb1dda396718ce1c61fd726cca8/src/science/step/firing.ts#L79-L97)
  でも、各リクエストの熱上限を30秒刻みの積分に使っている。
  15000 W相当のofferで30秒を一括計算すると使用66667 J・炉温29.6665°C、
  1秒×30回では15000 J・28.3749°C。どちらも検査器の違反0件。
  石灰と共通の修正方針にし、現在の区間を超えて過去のofferを消費しないようにしてほしい。
- **R3（P2、熱容量0）**：
  [firing.ts L48–50](https://github.com/ynatsume-source/3dproject/blob/d5a853f70aadaeb1dda396718ce1c61fd726cca8/src/science/step/firing.ts#L48-L50)
  も0を受理する。30秒で `status: running`、炉温 `-Infinity` を返し、検査器は違反0件。
  L122の分母は有限かつ正である必要がある。
- **R5（P2、不完全な履歴）**：
  焼成は入力の `history_complete: 0` を継承している。
  ただし [soak.ts L57–60](https://github.com/ynatsume-source/3dproject/blob/d5a853f70aadaeb1dda396718ce1c61fd726cca8/src/science/step/soak.ts#L57-L60)
  の泥になる経路では `tileQuality(slurry)` だけを出し、元の履歴0が欠落する。
  形が崩れても、履歴が不完全だったという事実は引き継いでほしい。
- 石灰レビューR1–R5の再現スクリプトを `d5a853f` に対して実行したところ、出力はすべて同じだった。
  石灰と検査器・熱化学パラメータ自体には `6731f11` からの変更がない。

## 組成・秤量・測定記録の確認

- `water_ppm` はロット全量に対する自由水の割合。
  `xd_<species>_ppm` は自由水を除いた固形分の組成比で、乾量基準。
  乾燥時に `xd_` を維持し、焼成で組成が変わった後に再計算する流れを確認した。
- 例として、37047 mg・`water_ppm: 20434` は水757 mg、固形分36290 mg。
  `xd_kaolinite_ppm: 450000` はカオリナイト16331 mgへ丸められる。
  組成をppmへ戻すと450014になり、これはmg/ppmの丸めであって新しい実測値ではない。
- `fixture_mass_measure` の観測値はmg。`science-tile-chain-check.ts` は1000で割って
  labのg入力へ渡しており、単位の受け渡しは正しい。
  焼成後質量を分母にする吸水率の定義も一致する。
- 実行結果の8.9%と14.5%は、モデルから得た秤量値33700→36700 mg、33900→38800 mgによる。
  実測の粘土データではなく、校正済みと判断する材料にはしない。
- カオリナイト等の結合水と、`water_ppm` の自由水を混同しない。
  labの「乾燥後質量」は測定プロトコルの終点なので、ゲームの乾燥ロットと無条件に同一視しない。

## 実行した検証と範囲

`d5a853f` の独立したdetached worktreeで実行した。

| 検査 | 結果 |
|---|---|
| `scripts/science-tile-chain-check.ts` | 16件成功 |
| `scripts/science-lime-check.ts` | 23件成功 |
| `scripts/science-step-check.ts` | 36件成功 |
| `scripts/science-clay-check.ts` | 52件成功（v2記録を含む） |
| `npm run typecheck` | 成功 |

追加の再現は [science-tile-d5a853f.repro.mjs](review/science-tile-d5a853f.repro.mjs) で実行できる。
出力JSONは診断用で、終了コード0は不具合なしの意味ではない。

```sh
node --import tsx docs/proposals/civilization/review/science-tile-d5a853f.repro.mjs /absolute/path/to/science-checkout
```

`tools/science-lab/` 全8ファイルと `data/science/sources.json` は、labの `1519fb6` と同じblob。
今回のCodex側の変更はレビュー文書と再現スクリプトのみで、科学実装・ツール・出典台帳には変更なし。
`sources.json` はCodex、`sources-thermochem.json` はClaudeの分担を継続する。
新しい一次資料・実測時系列の取得はこのレビューでは行っていない。

## Claudeへ渡すまとめのプロンプト

```text
6731f11（石灰・validateResult）、4a49569（lab取り込み）、d5a853f（粘土一周）をまとめてレビューしました。
labのdocs/proposals/civilization/CODEX_LIME_REVIEW.mdとCODEX_TILE_CHAIN_REVIEW.mdを読んでください。
各文書から、科学ブランチのcheckoutを引数にして動かせる再現スクリプトを参照できます。

確認できたこと：
・OpenStax m68865の本文・blob SHA・反応熱の計算は一致。
・1519fb6のtools取り込みは全ファイル一致。v2記録の追加検査も成功。
・d5a853fで石灰23＋工程36＋粘土52＋一周16＝127件と型検査が成功。
・xd_の乾量基準、秤量mg→labのg、吸水率の分母の受け渡しは一致。

本体へ接続する前に、次を科学ブランチで修正・回帰検査してください。
R1: 石灰と焼成で、30秒を1秒ずつに分けると使用J・温度が変わる。
R2: 純CaO 56080 mg＋水9000 mgの消化でnegative water (-1 mg)の例外。
R3: 石灰炉・焼成窯が熱容量0を受け付け、非有限の温度を返す。
R4: validateResultがNaN時刻と、負の使用Jによる上限超過の相殺を通す。
R5: 石灰でhistory_complete:0が1へ戻り、浸漬で泥になる経路では履歴0が欠落。
T1: 既に貫通割れのある試料を焼成すると、品質crack:2のまま「ひびなし」「高く澄んだ音」と観察する。
T2: 1時間浸漬後に乾燥させず1時間浸け直すと水5666 mgのまま。連続2時間では9103 mg。開始水分を吸水式に反映してほしい。

Codexは科学側の実装を変更しておらず、labにレビューと再現資料だけを置いています。
sources.jsonはCodex、sources-thermochem.jsonはClaudeの分担を継続します。新しい実測資料の追加はありません。
labやmainは変更せず、修正後のコミットを共有してください。本体への統合は最終レビュー後に小さな機能単位でお願いします。
```
