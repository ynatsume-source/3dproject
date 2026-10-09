# Codex への確認依頼：住人の焼いた器を気密の器に（p16x 0.1.2・p17x 0.1.3・換算表 civ-sci.pot-assembly/3）と、乾燥の速さの記録の上限（p12y 0.1.2）

2026-10-09 / ブランチ `codex/civilization-simulation` / 軽い確認（油の灯りの全面レビューと別。急ぎではない）

自作の気圧計への下準備。手順書：[SEALED_VESSEL_HANDBOOK.md](SEALED_VESSEL_HANDBOOK.md) の末尾の追記。

## 変更

- `src/science/step/vessel.ts`：`fired_pot` も受け付ける（`VESSEL_POTS`）。返す quality は、気密の器が書くキー（`VESSEL_KEYS`）以外を入力のまま残す。壁の面積は `surface_cm2` があればそれ（`Pot.areaM2`）。`fired_pot` の `water_ppm` は 0 でなければ拒否。`potQualityOnReturn` は `crack` キーがあれば 1 にする。
- `src/science/step/fired-pot-assembly.ts`：栓をした器（`sealed: 1`）は鍋・二重の壺・灯皿に組み立てない（口が塞がっている）。換算表 /1 の版は据え置き（これまでに来なかった入力を断るだけ）。
- 版：p16x 0.1.1 → 0.1.2、p17x 0.1.2 → 0.1.3、換算表 /2 → /3。

## 見てほしいところ

1. `fired_pot_test` の結果が前の版と同じか（科学側で 140 通りを比較：状態の器に `areaM2` が増えただけ）。
2. 残すキー（`form`・`wall_mm`・`surface_cm2`・`xd_*`・`sinter_ppm`・`crack`・`overfired`）と、タール・水を足した後の意味：`xd_*` は焼いた素地の割合のまま、タールと壁の水は `x_*_ppm`（ロット全体に対して）。この二つの分母の違いが、ほかの工程（鍋・二重の壺の換算 `readFired`、野焼き）で読み違えられないか。
3. `surface_cm2`（外側の面積）を壁の面積に使うことの妥当さ。
4. 傷んで戻ったときの `crack` と `crack_ppm` の組み合わせ。

## 検査

`scripts/science-fired-pot-assembly-check.ts` 23件（5節：成形 → 乾燥 → 野焼きで作った 2 L の壺を封じ、水の試験・組み立て・戻すまで）、`scripts/science-vessel-check.ts` 53件。

## もう1つ：p12y 0.1.2（Codex C2 on 042cc53）

`dry_flux_ratio_max_ppm` の入力上限 1e9 をやめ、有限で負でなければ受け付ける（返す値は切り詰めない）。影響は頭打ち（割れる確率は約 4 倍、重さは 3.2 倍で上限）。受け付ける天気の中で記録は最大およそ 8.8e8 ppm（科学側で計算：70 °C・RH0・風 80 m/s・日なた・壁 20 mm を1秒）。見てほしいところ：この上限の見積もりと、頭打ちの説明が正しいか。検査：`scripts/science-pottery-check.ts` 41件（9節）。手順書：POTTERY_HANDBOOK.md の末尾。
