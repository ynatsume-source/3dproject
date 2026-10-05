# Codex へのレビュー依頼：気密の器（全面レビュー）

2026-10-05 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)：**新しい工程が2つなので全面レビュー**。

オーナーの決定（設計案 [SEALED_VESSEL_DESIGN.md](SEALED_VESSEL_DESIGN.md)）：試験用の焼いた器から始める、ロット → 設備は本体の組み立て（科学側は換算表）、気圧計の器 500 mL。

## 対象

| ファイル | 内容 |
|---|---|
| `src/science/step/vessel.ts` | `p16x_vessel_tar_seal` 0.1.0（世界の時計、0.2.x のみ）・`p17x_vessel_leak_test` 0.1.0（島の時計） |
| `src/science/params.ts` | 仮定 10件 |
| `data/science/catalog-test-2.json` | 材料 `fired_pot_test`、工程 2、設備 2 |
| `scripts/science-vessel-check.ts` | 検査 29件 |

手順書：[SEALED_VESSEL_HANDBOOK.md](SEALED_VESSEL_HANDBOOK.md)（§3 に本体への換算表）。

## これまでの学びを先に入れたところ

look・submerge は器に触れない（物理を変えない）。設備の喪失は `interval.to`、台の値は状態に保ち、通知なしの変更は changed-input（params はキーを並べて指紋に：C3 の学び）。天気が分からない区間は計算しない。返した器（壁が水を持つ）が次の試験に使える。組成は整数 ppm の切り捨て。

## 特に見てほしいところ

1. **本物らしさ**：素焼きの器の「汗をかく」しみ出し（500 mL・吸水 12 % で1日 40 g ＋ 壁が吸う 72 g）、温めたタールがしみこむ／冷たいと乗るだけ、封じた器を水に沈めて泡で漏れを見る、日なたでタールが垂れる。一次資料（素焼きの透水・蒸発冷却の壺、木タールの軟化・粘度、土器の樹脂やタールでの封じの考古・民族誌）で照合してほしい。
2. **空気の時定数**：封じた器の空気が外と入れ替わる時間を `air_leak_tau_min` として lot に書き、本体が気圧計の器に換算する。この量の定義（何が何に近づく時定数か）と、自作の気圧計の式への入れ方を次の工程の前に見てほしい。
3. **質量**：器＋タール（＋薪＋O2）＝ タールつきの器（＋薪の残り・灰・煙）。器＋水 ＝ 器（壁の水）＋残りの水＋蒸気。整数の丸めで負にならないか。
4. **熱**：温める火の熱はすべて lost（器の温度は追わない）。しみ出して乾く水の熱は `src:env-heat:`。
5. **区切り**：漏れの試験は 1時間・30秒・3時間で完全一致（格子外の操作を含む）。

## 扱っていないもの

冷えた夜のタールのひび、タールが日にちをかけて深くしみる、器そのもののひび、油を入れたとき、住民が焼いた器（後の工程）。

## 再現のしかた

```sh
npx tsx --import ./scripts/node-assets.mjs scripts/science-vessel-check.ts   # 29
npm run typecheck && npm run build
```

## お願い

指摘と診断スクリプトは lab へ。科学側のブランチと main は変更しないでください。修正は科学側で行います。

## 追記：組み立て（本体の ADR 0006）に合わせた変更（このレビューに含めてください）

- 器の品質にひび `crack_ppm`。漏れやすさに足す（ひび全体で基準の素焼きの器 20 個分、仮定）。内側のタールではふさがらない。
- 本体が呼ぶ換算：`potToEquipmentParams`（ロット → 設備 `assembled_pot` の params）、`potQualityOnReturn`（写し＋condition → 戻すロット。condition < 1 なら sealed と air_leak_tau_min を外し、ひびを足す）。版 `civ-sci.pot-assembly/1`。
- 材料 `pot_sherds`（工程なし）。
- 検査 34件（検査6：組み立て → 戻す → 漏れの試験でひびが見える、封じ直してもひびは残る）。
- 見てほしいところ：傷みを「ひび」として漏れに足す扱いが本物らしいか、condition から crack_ppm への換算。
- 追記2：壊れた器を本体が同じ質量の `pot_sherds` に戻すときの quality `potSherdsQuality`（検査 35件）。

## 追記3：e6668fb の A1〜A5 と ce0cfc1 の A6 を直した版（軽い再確認のお願い）

対応表は [CODEX_REVIEW.md](CODEX_REVIEW.md) の最後の節。p16x 0.1.1・p17x 0.1.1（状態 /2）、換算表 `civ-sci.pot-assembly/2`。検査 52件。
submerge は保留にしたので、前回の診断の泡の部分は「拒否される」ことの確認になる。
