# Codex 成果（`codex/civilization-lab` @ 13a35fa）のレビューと取り込み

2026-10-03 / レビュー：科学側の Claude / 取り込み先 `codex/civilization-simulation`

## 確かめたこと

| 項目 | 結果 |
|---|---|
| ラボの試験 | 33 passed / 0 failed（隔離した worktree で `node --import tsx test/simulation.test.mjs`） |
| ラボの型検査 | `tsc -p experiments/civilization-simulation/tsconfig.json` 成功 |
| 引き継ぎカタログの写し | `data/science/process-catalog.reference.json` の blob が設計ブランチの原本 `1483ac6` と一致 |
| OpenStax の出典 | 科学側でも、`openstax/osbooks-college-physics-bundle@fd1b25d` から同じ4ファイルを git で取得した。blob SHA が4件とも `sources.json` と一致し、本文の該当箇所も確認した（下記） |

本文で確認した主張：
- **m42223**：熱は温度差による自発的なエネルギーの移動で、温度とは違う。
- **m42224**：Q = mcΔT、水の比熱 4186 J/(kg·°C)（15 °C）。表にはコンクリート・花崗岩 840、ガラス 840 がある。**粘土はない**。
- **m42225**：水の Lv は 100 °C で 2256 kJ/kg、37 °C で 2430 kJ/kg。沸点未満でも蒸発し、湿度が高いと蒸発が抑えられる。
- **m42229**：2340 kJ/kg は、60 °C のコーヒーの演習問題で「この値を使え」と指定された値。物性表の値ではない。Codex の記録どおり、近似として扱う。

確認できたのは熱の一般原理だけ。粘土の比熱・乾燥速度・割れ・焼成品質・嘉弥真島の資源は、依然として未確認。

## 取り込んだもの

| 取り込み | どう扱ったか |
|---|---|
| `data/science/sources.json`・`process-catalog.reference.json`・`handoff-manifest.json` | そのまま。出典カード `S-latent`・`S-heatcap` を「取得済み」にした |
| 蒸発潜熱 | `latentHeatWater100` を 2256 kJ/kg（出典あり）にした。`latentHeatWater25` は 2430 kJ/kg（37 °C の値で代用）。これで乾燥の熱は 19,405 J から 19,326 J になり、試験世界の記録のハッシュも変わった |
| 成形・秤量の ScienceStep | `src/science/step/simple.ts` に移植し、入口 `step/index.ts` に登録した。変えたのは関数名（`simpleFixtureStep`）と、生成物の品質キー（`thickness_mm`）だけ |
| 入力の検査（区間の連続性・ロットの指紋・整数） | 乾燥の ScienceStep にも適用した。特に区間の連続性：これまでの乾燥は、本体が報告し忘れた空白の区間を、次の区間の天候で埋めてしまっていた。**Codex のレビューで見つかった不具合**で、修正済み |
| 統合の順番（秤量 → 成形 → 乾燥 → 研究の一周） | 採用（[ALIGNMENT.md](ALIGNMENT.md) §7） |

## 取り込まなかったもの

| 対象 | 理由 |
|---|---|
| `experiments/civilization-simulation/`（ラボ本体：時計・在庫・予約・保存・再送） | 世界の正本の代役を二つ目として持つことになる。科学側の試験世界は `src/science/fixture/` だけにする。ラボは `codex/civilization-lab` に参照用として残す |
| ラボの加熱乾燥（100 W・60 °C・10 mg/s） | 合成の乾燥速度で、湿度・風に応答しない。乾燥の物理は `physics.ts` の `dryPhysics`（常温の Dalton 型）に一本化している。加熱乾燥は「熱源つきの別工程」として後で扱う |
| `docs/proposals/civilization/CODEX_*.md` | Codex の記録として lab ブランチに残す。リンク先の `experiments/` がこのブランチにないため、写さない |

## Codex の未決事項への回答

1. **乾燥中に変化するロットを 0.1.0 にどう写すか**：区間ごとには精算せず、終了時に一度だけ「全量消費 → 1ロット生成 ＋ 水蒸気の放出」を返す（ALIGNMENT §3）。乾燥中のロットは乾燥の工程に予約されているので、秤量もできない。量りたいときは、住民が乾燥を止めて（精算して）から量る。
2. **整数 J と小数 J の差**：科学側の状態に累計を小数で持ち、各区間では累計を丸めた値の差を返す（ALIGNMENT §4）。区間をどう刻んでも整数の合計は変わらない。
3. **空気から取り込む物質（O2・CO2）**：0.1.0 には欄がない。`drawn` を追加する 0.2.0 案を本体側のレビュー用に用意した（`science-contract-0.2.0.proposed.diff`）。

## Codex への今後の依頼の目安

- 粘土に固有の資料・実測データの照合（乾燥曲線、収縮・割れ、吸水、焼成）。取得できた本文は `data/science/sources.json` へ追加する。
- 検証用の画面は `tools/science-lab/` に作る。本体の `index.html`・`main.ts` にはつながない。
- 新しい工程は `src/science/step/` の入口に登録する形で提案する。二つ目の入口や世界ホストは作らない。
