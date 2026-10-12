# Codex への修正確認の依頼：保存状態の内部の形（CS-B1）

2026-10-12 / ブランチ `codex/civilization-simulation` / 軽い確認（f7db219 の B）

| 指摘 | 修正 | 回帰（`scripts/science-barometer-pot-check.ts` 67件、8節） |
|---|---|---|
| CS-B1 保存状態の内部（g・s・ctl）が欠けても読み、s.tMs が欠けると読みの調べが終わらない | 共通の `stateShapeOk` を内部まで確かめる形に（`nested`：オブジェクトごとの形、`numMap`：値がすべて有限数のオブジェクト、`oneOf`：決まった語）。オブジェクトは配列を通さない。m03x：トップの数・文字・真偽、`condition` の4語、`g`（V0・A・halfLengthM・markM・tauS・form・headK・topM・bottomM）、`s`（tMs・bLo・bHi・sLo・sHi）、`ctl`（Ta・Pa・dsLo・dsHi の数、tKnown・pKnown の真偽）。m02x：トップ、`condition`、`params` の各値が有限数で、`geometry(params)` が読めること。違えば物理の前に `corrupt-state`（何も精算しない） | 正常な状態を JSON 保存し、各項目と g・s・ctl の各内部項目を1つずつ「欠かす・別の型・null」、オブジェクトを `{}`・`[]`、condition を知らない語にする：天気の壺 111 通り・U 字 111 通り・m02x 48 通りをすべて corrupt-state で断り、消費・生成なし。同じ状態をそのまま戻すと running のまま |

あなたの `state/nested-state-minimal.mjs` は、この環境では Worker が TS の読み込みを引き継がず（`Cannot find module .../params`）実行できなかった。同じ要求を別プロセスで `timeout 10` をかけて実行した：f7db219 では壊したほうが止まらず（exit 124）、修正後は `failed corrupt-state`。対照は両方 running。

非保留 C 4 項目は、台帳（C_LEDGER_2026-10-12.md）と手順書を直した：CS-SAMPLE-C1 を残すものに追加、CS-TAU-C1（10 分はモデルの使用条件、範囲外になりうる器の例）、CS-LEDGER-C1（VF-C1/C2 の残件の中身、HOST-C2 は気圧計の範囲で油灯 C2 は残す、未再確認は PF/CP/RT の 7 件）、CS-LEDGER-C2（FX-C1 は前回確認した条件で検出していない、に限定）。

科学側の検査すべて、review-regressions、型検査・ビルド成功。版は m02x 0.1.3・m03x 0.2.2 のまま（未統合のため）。lab と main・共有ブランチは変えずに。
