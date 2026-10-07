# Codex への全面レビュー依頼：器を野焼きで焼く（p13y_pot_pit_fire 0.1.0）

2026-10-07 / ブランチ `codex/civilization-simulation` / 新しい工程なので全面レビュー（REVIEW_POLICY.md）。

| ファイル | 中身 |
|---|---|
| `src/science/step/pit-fire.ts` | 工程（島の時計、接続仕様 0.2.x のみ）、`wetFlameFactor`、`PIT_PACE_K_PER_H` |
| `src/science/params.ts` | `pit*` の14定数（すべて仮定） |
| `data/science/catalog-test-2.json` | 工程 p13y、材料 `fired_pot` |
| `scripts/science-pit-fire-check.ts` | 検査 29件 |

手順書：[PIT_FIRE_HANDBOOK.md](PIT_FIRE_HANDBOOK.md)。設計とオーナーの決定：[POT_FIRING_DESIGN.md](POT_FIRING_DESIGN.md)（野焼きから、本物に近い難しさ、生木の焚き火）。

## これまでの学びを先に入れたところ

`fire_plan` は最初の依頼の `interval.from` に1回だけ（A1）。格子の間の look は写しをその時刻まで進めて読む（A2）。気温・湿度・風・雨のどれかが分からないと run を止め、その後は「火が落ちていた」だけ（A5・薪 A2）。割れは seed と器で決め、区切り方で変わらない。設備の指紋は params をキーで並べる。返す薪は丸めない比。

## 特に見てほしいところ

1. **本物らしさ**：野焼きの温度（桜色 約 830 °C）・時間（約8時間）・薪の量（4 L の鍋1つに 約32 kg）、割れる割合（気をつけて 1/20、不注意で 15/20、風で 6/20、湿った器を速い火で 13/20）、生木で約 440 °C までしか上がらないこと。野焼きの民族誌・実験考古学の資料で照合してほしい。
2. **野焼きの火の値**：`open_fire_pit` を場所として受け取り、火の値は科学側の仮定（`pit*`）にした。本体の設備の値を使わない設計でよいか。
3. **焼けた／焼けていない**：300 °C を超えれば割れは起こり、脱水が進んで初めて `fired_pot`。足りなければ `dry_pot` のまま返す。
4. **湿った薪の炎**：器に届く熱を水分で減らす式（`wetFlameFactor`）。薪で焼く工程（p13w、統合済み）には入れていない。入れるべきか。
5. **質量・熱**：器＋薪（＋O2）＝焼いた器 or かけら ＋ 残りの薪 ＋ 灰 ＋ 蒸気 ＋ CO2。熱は薪で焼く工程と同じ数え方。

## 再現のしかた

```sh
npx tsx --import ./scripts/node-assets.mjs scripts/science-pit-fire-check.ts   # 29
npm run typecheck && npm run build
```

## お願い

前回どおり、lab と main は変更せず、結果は ZIP で。修正は科学側で行います。

## 追記（2026-10-07）：レビュー中に 0.1.1 へ

島の粘土は有機物を 1% 含む（本体の報告）。0.1.0 はそれを拒否していたので、0.1.1 で野焼きの中で燃えて抜けるようにした。

- `kiln-ware.ts` `advanceWare(w, kilnC, dt, { burnOrganic })`：指定しなければ有機物の進みは 0（試験片・電気の試験窯は今までどおり）。野焼きだけが `true`。
- O2 の取り込み = 薪の分 + 器の有機物の分（`wc.inn.o2`）。CO2 は `wc.out.co2` を足して出す。
- 燃え残りの観察「器の芯が黒い」（`ext.organic < 0.9`）。
- 見てほしい点：①opt-in にしたことで、試験片の結果が本当に変わらないか、②有機物の燃焼の速さ（`KINETICS.organic`）が野焼きの温度の記録と合うか、③燃え残りの判定 0.9 の妥当さ、④質量と O2 の閉じ方。
- 検査：`scripts/science-pit-fire-check.ts` 6 節（31 件）。
