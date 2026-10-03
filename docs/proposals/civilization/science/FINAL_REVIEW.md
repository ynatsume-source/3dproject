# 本体側の最終レビュー依頼（科学コア）

2026-10-03 / ブランチ `codex/civilization-simulation` / 先頭 f52e39c / Codex の確認 `codex/civilization-lab` a4d26ec（残件なし）

**未採択の提案。** 本体側（main）の最終レビューを受けるための入口。統合と 0.2.0 契約案の採択は本体側が判断する。
科学側は main・lab・共通ファイル（`src/world/science-contract.ts`）を変えていない。

## 1. レビューの経緯

| 回 | Codex の記録（lab） | 指摘 | 科学側の対応 |
|---|---|---|---|
| 1 | 1d5e846 | R1〜R5、T1、T2 | 1f7538f |
| 2 | 57d4d6d `CODEX_FIX_REVIEW_1f7538f.md` | F1 熱の申し出の時間配分、F2 消化の刻み、F3 旧状態 | 0702783・e118e9f |
| 3 | cd096e2 `CODEX_FIX_REVIEW_e118e9f.md` | S1 浸漬の状態版、補足：格子の原点 | 196a3b9 |
| 4 | a4d26ec `CODEX_FIX_REVIEW_196a3b9.md` | **追加指摘なし** | — |

指摘ごとの原因・対応・確認は [CODEX_REVIEW.md](CODEX_REVIEW.md)、工程の約束は [ALIGNMENT.md](ALIGNMENT.md) §10。

## 2. 最初に統合してほしい単位：秤量だけ

| ファイル | 中身 | 依存 |
|---|---|---|
| `src/science/step/simple.ts` | 秤量 `fixture_mass_measure`（と成形 `p11_pottery_shape`） | 契約の型、`fixture-profile.ts` |
| `src/science/step/fixture-profile.ts` | 秤量・成形の時間・電力・分解能 | なし |
| `src/science/step/validate.ts` | 確定前の検査器 `validateResult(req, res)` | 契約の型のみ |

- 3ファイルで閉じている。`step/index.ts`（全工程の入口）や化学・物性のファイルは、秤量だけなら不要。
- 手順・status ごとの扱い・確認済み／未確認は [WEIGH_HANDBOOK.md](WEIGH_HANDBOOK.md)。
- その後、成形 → 乾燥の順。乾燥から `step/common.ts`・`chem.ts`・`params.ts`・`physics.ts` とカタログ `data/science/catalog-test-1.json` が必要になる。

## 3. 本体側に見てほしいこと

1. **秤量の3つの判断**（WEIGH_HANDBOOK §3）
   - ① 環境：今は `environment.source = 'simulation'` のみ受け付ける。共有の島の `live` を許すか（許すなら科学側で工程版 `fixture-2` にして直す）。
   - ② 電気：はかりは 10 J の電気の申し出が必須。最初は試験用電源（例 `src:fixture-mains`）で、文明の達成に数えない扱いでよいか。
   - ③ カタログ版が2つ（`civilization-fixture-1` と `civ-sci-test-1`）。成形・乾燥の統合前に1つにまとめる。
2. **0.2.0 契約案**（[science-contract-0.2.0.proposed.diff](science-contract-0.2.0.proposed.diff)、main に `git apply --check` 成功）
   - `drawn`（O2・CO2 の取り込み）、J の規則（環境の熱・燃焼は申し出ではない）、seed は run ごとに固定、stop の意味、maxJ は区間に一様に届く、`runStart + n × 30秒` の境界で完全一致。
   - 秤量・成形・乾燥は 0.1.0 のままで動く。0.2.0 が必要になるのは薪の焼成とモルタル（ロードマップ A2 後半・A3）から。採択を急ぐ必要はない。
3. **旧状態の中止と予約の解放**
   - 科学側は旧 `/1` の状態を `unsupported-state-schema` で拒否する（移行しない。試験用の状態しかないため）。
   - 本体の扱い（案）：その run を中止し、予約を解放する。ロットは run の終了時にしか精算しないので物は失われない。**既に確定した過去区間の熱の使用量は台帳に残す**（取り消さない）。この処理は本体側で未実装・未検証。
4. **時間の区切り**：run の開始を世界時計の30秒境界にそろえ、30秒ごとに区切ることを推奨。任意時刻の停止・環境の変化は工程ごとの誤差内（ALIGNMENT §10 の表）。

## 4. 確認済み・未確認（f52e39c 時点）

| 確認済み | 未確認 |
|---|---|
| 検査 176件（回帰48・工程36・石灰24・連鎖16・粘土52）、型検査、ビルド | 本体のサーバー・台帳・予約の上での一度だけの確定 |
| Codex による独立した再現（4回のレビュー、最後は追加指摘なし） | 旧状態での run 中止と予約解放（本体側の処理） |
| main 41ccd18 を合流済み。その後の main（0609bc4 まで15件）は科学側のファイル・共通ファイルに触れておらず、衝突なし | 本体の画面での表示、実機・ブラウザでの見た目 |
| | 粘土・燃料の実測による校正（値の多くは仮定・試験用） |

## 5. 本体側へ渡す文面（案）

```text
科学コアの Codex レビューが完了しました（lab a4d26ec、追加指摘なし）。
本体側の最終レビューをお願いします。入口は codex/civilization-simulation の
docs/proposals/civilization/science/FINAL_REVIEW.md です。

最初の統合単位は「秤量」だけで、src/science/step/{simple,fixture-profile,validate}.ts の3ファイルで閉じています。
手順は WEIGH_HANDBOOK.md。統合前に、①共有の島の live 環境を許すか、②はかりの電気を試験用電源で扱うか、
③カタログ版の一本化、の3点の判断をお願いします。
0.2.0 契約案（drawn・J の規則・30秒境界）と、旧状態での run 中止・予約解放の扱いもあわせて確認してください。
0.2.0 は秤量・成形・乾燥には不要で、採択は急ぎません。
最終レビュー後、秤量 → 成形 → 乾燥の順に小さく統合してください。lab は変更しないでください。
```
