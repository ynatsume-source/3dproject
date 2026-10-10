# p16x 0.1.4 修正確認（SB-A1・SB-A2）

対象: `codex/civilization-simulation` `7318506`。修正箇所に絞った軽い確認。科学側・lab・main のソースは変更していない。

**判定: SB-A1・SB-A2 は解消。この範囲の追加 A/B/C 指摘はなし。**

## 修正の読み取り

- `src/science/step/vessel.ts:153` の `SealData` に `sealAt` と `jointTarG` を追加。新規状態の初期値は −1 / 0（184 行）。
- 200 行で、完了までに届いた `seal` を時刻順に選ぶ。201 行で最初の操作だけを状態に保存する。後の要求や未到達の操作から精算値を読む処理はなくなった。
- 225 行の継ぎ目用タールは保存済みの `d.jointTarG` だけを使う。最初の要求に `seal` が必要だった入力検査も削除された。
- 233–235 行は、封じなかった／封じるタールが不足したとき、管を元と同じ質量・場所・quality で返す。
- 38 行で状態を `civ-sci.vessel-seal/3` に変更。/2 は共通検査の `unsupported-state-schema` で明示的に拒否し、消費・生成はない。

## 再現と追加確認

`original-repro.mjs` は前回の診断をそのままコピーしたもの。引数で今回の作業場所を指定して実行した。JSON 内の `target` 固定文字列と旧来の比較の期待状態は元スクリプトのままなので、実行対象は以下のコマンドとこのメモで確認する。

- 冷たい場合: 一括・10 分＋残り・最初の 30 秒を管の待機にした場合すべて τ = **330 分**。
- 温めた場合: 同じ 3 通りすべて τ = **10,268 分**。
- 届かない 1,800 秒の `jointTarG:60` を先頭に置いても、届いた 60 秒の `jointTarG:6` の結果は同じ。
- 上記の生成物・継ぎ目の被覆・壁の被覆は同一。初回の管の待機も `failed` にならない。

追加の `fix-check.mjs`: **46 呼び出し・22 判定、失敗 0、validateResult 違反 0**。

- /3 を JSON 書き出し・読み戻しして継続しても、実行済みの `sealAt:60000` と `jointTarG:6` を保ち、一括と同じ生成物になる。
- 操作前／操作後の両状態を /2 として渡すと明示的に拒否し、ロットを消費しない。
- 最初の要求で待つ／格子外の区切り／操作時刻ちょうどで区切る／後の要求で別の seal を渡す場合を確認。到達した最初の操作の内容は変わらない。
- 到達済みの 2 操作の配列順を逆にしても、早い時刻の操作を選ぶ。
- seal なし、完了時刻ちょうどの seal、栓に不足する 4,999 mg のタールでは管を元のまま返す。全入力と全返却の質量は一致し、返却した未封じの器も読み戻せる。
- 実際に返った管を次の新規 run に渡し、後の区間で封じるところまで成功。管の来歴不完全も製品へ継承。

格子外の 1 ms 区間を含む追加診断では、機械的エネルギーの申し出を `ceil(20 W × 秒数)` として各区間で必要な出力を満たす。切り捨てで 0 J にするとその区間は供給断になるので、同じ稼働条件の比較にはしない。

## 旧い管なし 500 mL の器

`legacy-compatibility.mjs` は前回の診断の比較関数だけを更新したコピー。`evidence.evaluatorVersion`・封じ工程の状態スキーマ・追加された `sealAt` / `jointTarG` のみを正規化し、その他の状態・生成物・放出・観察・質量・熱を隠さず比較した。

**560 シナリオ / 109,300 区間ペアで差 0。換算・読み戻し・傷み・破片の helper 49 件も差 0。**

元の診断を変更せずに回すと、4,040 ペアが状態の版・新規キーの差で不一致になる。正規化後は不一致なし。状態を新しい形へ更新した結果であり、物理の差ではない。

## 再実行

対象リポジトリで依存関係を用意し、引数に自分の checkout と前回比較用 checkout を指定する。

```sh
node --import tsx /absolute/path/vessel/fix-check.mjs /absolute/path/7318506 /absolute/path/vessel/fix-check.json
node --import tsx /absolute/path/vessel/original-repro.mjs /absolute/path/7318506 /absolute/path/dcdcf554 /absolute/path/vessel/original-repro-result.json
node --import tsx /absolute/path/vessel/legacy-compatibility.mjs /absolute/path/7318506 /absolute/path/dcdcf554 /absolute/path/vessel/legacy-compatibility.json
```

この環境では `tsx` CLI の IPC ソケット作成が許可されないため、同じローダーを使う `node --import tsx` で実行した。
