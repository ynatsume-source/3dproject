# 吸水手順と計算式の版を測定記録へ追加

2026-10-03 JST。対象は `codex/civilization-lab` の `d836573` 以降。

## 共有状況の照合

Claudeの科学ブランチ `59152e2a6f69b3f09960b0a8055efac8d526b6af` の
`docs/proposals/civilization/science/CODEX_REVIEW.md` とツリーを確認した。
公開済みの履歴とレビューの範囲では、前回までの共有漏れは見当たらない。
未公開の作業や会話はこの確認の対象外。

| labの成果 | Claudeの取り込み報告 | 確認内容 |
|---|---|---|
| `13a35fa` | `90c9d24` | 出典・カタログ・引き継ぎ台帳、成形・秤量の移植、入力検査の反映をレビュー記録で確認 |
| `464e63f` | `9e20a2b` | 粘土資料6件と検証画面の取り込み、式と含水率基準の照合をレビュー記録で確認 |
| `d836573` | `59152e2` | 乾燥方法・JSON記録・明暗表示の取り込みをレビュー記録とファイルで確認 |

`59152e2` と作業開始時のlab `d836573` の比較では、`tools/science-lab/` の全8ファイル、
`data/science/` の `sources.json`・`process-catalog.reference.json`・`handoff-manifest.json` の
Git blob SHAがそれぞれ一致した。Claude報告の「7ファイル」は前回の変更分であり、
変更のなかった `measurements.test.mjs` を含めるとツールは8ファイルある。

`CODEX_*.md`・旧 `experiments/civilization-simulation`・旧 `src/science/step.ts` をlabに残すのは
合意済みの分担であり、共有漏れではない。これらを科学ブランチへコピーする必要はない。

確認時のmainは `9e4291deeafbab0a5252d57175d97b75c215031d`。
`src/world/science-contract.ts` と `docs/proposals/civilization/SCIENCE_HANDOFF.md` はlabと同じblobで、
mainの契約は0.1.0。既に共有された `drawn` を追加する0.2.0案は今回の対象外。
基準 `41ccd18` を保ち、mainの更新をlabへmergeしていない。

公開直前の再確認では、科学ブランチが `6731f11b19d5c207bce95e8589f924fa7651b7a1`、
mainが `8ea34ef4cca54966dded1ab17ce6ece9a3e8e2d7` へ進んでいた。
科学側の追加差分は契約検査・反応熱資料・石灰工程などで、上記ツール8ファイルと出典類3ファイルは同じblob。
最新mainの契約と引き継ぎ文書も同じblobのまま。今回の変更範囲との重複はない。
科学側に別途追加された `sources-thermochem.json` は今回取り込まない。

## 今回の変更

`tools/science-lab/` の6ファイルとこの文書だけを変更する。
本体の入口、`src/science/`、世界の保存、物理係数、出典台帳、カタログ、依存関係は変更しない。

1. 吸水方法を選択式にする。未記録、浸漬のみ、煮沸のみ、煮沸後に浸漬、その他。
2. 煮沸時間と浸漬時間を別々の時間（h）で記録する。浸漬時間には煮沸を含めない。
   空欄は `null`、0は0、小数も保存する。負値・非有限数を拒否する。
3. 秤量前の表面水の処理を選択式にする。未記録、拭き取り、水切り、除去せず、その他。
   水温、冷却、布や拭き方、処理から秤量までの時間、元の手順は文章で残す。
4. 吸水後質量がある場合に、手順・必要な時間・表面水の処理・条件の不足を表示する。
   方法と時間が矛盾しても入力を消さず、確認を促す。表面水を除去しない場合もその影響を表示する。
5. 新しい5欄を含め、入力が変わると再計算までJSON保存を無効にする。
6. 計算式を定義する `measurements.mjs` から `{ id: 'measurements', version: 1 }` を公開し、
   記録の `calculator` と結果表示に残す。算術は変更しない。

方法の選択から標準の時間や温度を補完しない。煮沸と浸漬の値を換算せず、飽和や規格適合も判断しない。
互換性のため保持した `saturatedMassG` は「吸水後質量」の入力キーであり、飽和確認済みを表さない。
`evidenceStatus: unverified-user-entry` と `calibrationEligible: false` は固定。
時刻の取得、自動保存、外部送信、JSONの再読み込みは追加しない。

## 記録形式と式の版

項目構成の変更で記録の `version` は **2** に上げる。
計算式・単位・計算規則は変更していないので `calculator.version` は **1**。
UIや記録項目だけの変更では計算式の版を上げない。
これらはScienceStepや世界保存のバージョンとは独立する。

旧JSON（記録形式1）を書き換えたり、式の版を後付けしたりしない。
旧記録に `calculator` がなければ版未記録であり、記録形式の番号から推測しない。
詳細な項目定義と使い方は [README](../../../tools/science-lab/README.md) を参照。

## 検証結果

- 計算6件、記録16件（従来8件＋今回8件）：成功。記録の版と式の版、別々の時間、
  欠測・0・小数、方法を変えても同じ計算、矛盾の保持、不正入力、未確認の扱いを検査。
- `node --check tools/science-lab/app.mjs`、`npm run typecheck`、Viteビルド・OG生成：成功。
  OG生成は `node --import tsx --import ./scripts/node-assets.mjs scripts/og-pages.ts` で実行。
  既存のVite設定には将来のnative config loaderでの `__dirname` 使用に関する警告がある。
- Chromium 151、明暗×390/1280pxの4通り：出典10件・計算7指標・JSON保存を確認。
  ダウンロードしたJSONの記録形式2・式1・吸水手順・独立した時間を照合。
- 新しい5欄それぞれで保存無効化→再計算による復帰、負の時間の拒否、リセット、
  未記録の `null`、0と小数の保持、方法変更時の矛盾表示、吸水だけの入力を確認。
- 吸水手順とメモのHTML風文字列は文字として表示され、実行されない。
  コンソールエラー0、横はみ出し0。通常文字・補足文字・入力文字のコントラスト比は4.5以上。
- ブラウザはローカルのファイルだけをPlaywrightで応答し、外部通信なしで検証。
  ChromiumのIPC用に承認された実行権限を使用。Safari/Firefoxや実機は未検証。

テスト値は合成した算術例で、測定プロトコルの推奨ではない。
今回、新しい一次資料や実測時系列の取得・照合は行っていないため、`sources.json` に追加はない。
物理モデルと実測の一致は引き続き未確認。

## Claudeへ渡すプロンプト

```text
ynatsume-source/3dproject の codex/civilization-lab で、d836573以降をレビューしてください。
docs/proposals/civilization/CODEX_ABSORPTION_RECORD_REVIEW.md と tools/science-lab/README.md を参照してください。

59152e2の取り込みを確認しました。前回までのtools全8ファイルとdata/scienceの3ファイルはlabと一致し、共有漏れは見当たりません。
今回、ご提案の吸水方法・煮沸/浸漬の時間・表面水の処理・手順メモと、計算式の版を追加しました。
JSONは記録形式version:2、calculator:{id:"measurements",version:1}です。算術は変えていません。
欠測はnull、0と小数はそのまま、標準時間の補完や方法間の換算はありません。実測の自己申告でも未確認・校正不可を維持します。

計算6件＋記録16件、型検査・ビルド、Chromiumの明暗×390/1280pxで表示・条件変更・保存・不正入力を確認しました。
tools/science-lab/の差分だけを選択的に取り込んでください。lab全体はmergeせず、CODEX文書と旧experimentsはlabに残してください。
本体の入口・世界の保存・物理モデル・共通契約・出典台帳は変更していません。新しい一次資料・実測時系列の追加はありません。
Codexは引き続きlabだけで作業・pushします。
```
