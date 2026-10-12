# Codex へのレビュー依頼：非保留の C の整理

2026-10-12 / ブランチ `codex/civilization-simulation` / 全面レビュー（変更の範囲）

オーナー了承のうえ、たまった非保留の C をまとめて整理した。一覧と残す理由は [C_LEDGER_2026-10-12.md](C_LEDGER_2026-10-12.md)。

| 変更 | 内容 |
|---|---|
| `src/science/step/common.ts` | `stateShapeOk`（保存状態の形の確認） |
| `src/science/step/barometer.ts` | m02x 0.1.3：底の言葉、壊れた状態の拒否（状態 /3 のまま） |
| `src/science/step/barometer-pot.ts` | m03x 0.2.2：底の言葉（共通）、SB-C3（`scan(until, endSample)`、読みは整数秒の標本だけ、標本の間の超過は端に寄せる）、BW-C2（管の太さ・残る空気）、τ < 10 分の拒否、壊れた状態の拒否（状態 /4 のまま） |
| `src/science/step/vessel.ts` | p16x：1 g 未満の管を断る（入口の検査、版はそのまま） |
| `src/science/step/fired-pot-assembly.ts` | 素地が残らない器を断る（入口の検査、換算表 /2 のまま） |
| `data/science/sources.json`・`data/science/evidence/` | あなたの取り込み案の一次資料 5 件（ハッシュ一致を確認、calibrationEligible: false） |
| カタログ・手順書 | 版と注記、天気の壺の近似の説明 |
| 検査 | `science-barometer-pot-check.ts` 65 件（8 節）、`science-fired-pot-assembly-check.ts` 27 件 |

確認したこと：

- SB-C3：あなたの `intervals/subsecond-peak.mjs`（7318506 の共有ブランチ）を変えずに実行。修正前 `reproduced: true`、修正後 `false`（読み 21 目盛り、condition ok、流出 0 で一致）。検査では、深い低気圧を半端な ms に 60 回読んでも、「あふれ」と言うことと流出の記帳が一致。
- 0.2.1 と 0.2.2 を並べ、U 字と天気の壺の 10,704 要求で結果と状態（`leakK` を含む）が完全一致（底まで下がる場面は含まれず、言葉の変更は別の検査で確認）。
- 底の言葉：U 字（m03x）と m02x の両方で、1010 → 1100 hPa のとき「器に外の空気が入ったまま」。
- 拒否：太すぎる管（BW-C2 の例：100 mL・内径 30・外径 60・水 59,999 mg）、τ 5 分、data null・項目の欠け、1 mg の管、素地の残らない焼いた器。
- 科学側の検査すべて、review-regressions、型検査・ビルド。

## 見てほしいところ

1. SB-C3 の直し方（読みと記帳で標本の時刻をそろえる、端に寄せる）が、合意した 30 秒保持のモデルの中で筋が通っているか。
2. 拒否の基準（管の外径 < 壺の直径の半分、空気 ≥ 1 割、τ ≥ 10 分）が、ふつうの住人の組み立てを断らないか。
3. `stateShapeOk` の確認する項目と、別の run の状態は本体の役目とする線引き。
4. 残す C の理由（C_LEDGER）。
5. 資料 5 件の取り込みの書き方（sources.json の項目）。

lab と main・共有ブランチは変えずに。修正は科学側で行う。
