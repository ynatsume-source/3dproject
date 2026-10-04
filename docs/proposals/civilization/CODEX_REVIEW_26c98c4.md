# 26c98c4 の軽い確認：本体側の最終レビューへ

2026-10-04。科学側 `26c98c4`、薪工程 `p13w_test_tile_wood_fire / 0.1.4`。
オーナー決定の `REVIEW_POLICY.md`（33fd25a）に従い、前回のA1・C1の修正と、共通の試験片精算への影響に絞って確認しました。
前回: lab `793adf5` の [CODEX_REVIEW_451ea82.md](CODEX_REVIEW_451ea82.md)。

**A1・C1とも解消。今回の修正範囲に追加のA・Bの指摘はありません。Codex側の保留を解除し、薪工程を本体側の最終レビューへ進められます。**
接続仕様0.2.xの採択と実際の統合は本体側が判断します。科学側ブランチ・main・本体の保存は変更していません。

## 確認結果

| 項目 | 結果 |
|---|---|
| A1（影響A）: 火がつかないのに焼成品になる | **解消**。水分95%・全水・全灰の3条件、通常の30秒要求で、最高28°C・熱0 Jの試験片が `test_tile_dry` として返る |
| 返却品で再試行 | 3条件とも、返却試験片と新しい薪を渡す次のrunが `running`。検査器違反0 |
| 科学側の回帰の形 | 水分95%での試行 → 実際の返却試験片の質量・quality → 新しい薪で焼成完了まで接続。`test_tile_fired` と橙の温度域への到達を確認 |
| 電気窯の無加熱 | 熱の申し出0で3時間後に停止すると未焼成の試験片を返す |
| C1（影響C）: 検査の古い工程版 | **解消**。薪専用検査と回帰検査が `WOOD_FIRE_PROCESS` の工程版を参照し、原本を変更せずに成功 |

変更は `settleWare` の材料種判定から `o.done` を外し、実際の `maxWareC > 300` で判定するものです。
試行の終了と焼成を区別でき、今回の返却・再試行の不具合は解消しました。
追加された回帰は、前回の検査に不足していた「返却した試験片を次に渡す」を含んでいます。

共有処理が使われる電気窯について、修正前 `451ea82` と同じ要求を実行し、各区間の全結果JSONをSHA-256で比較しました。
通常・7.3秒刻み・途中停止・強制冷却・既存割れ2の**5条件すべて一致**し、検査器違反も0です。

| 条件 | 修正前後で一致したSHA-256 |
|---|---|
| 通常 | `44e9acd4d5e688dc067a2151e51f18229bdd7be146be3931ec17b4be5bf908b0` |
| 7.3秒刻み | `820ee4b02f7bee7e10efc547c791462806eb78923fd930460a4f8fdbaf415306` |
| 途中停止 | `d19da9ae669b35ac62b05d4e5f9fa9945dfc6fdd10febaa7e55221f89a5d2b40` |
| 強制冷却 | `4c32282d7fa8d35fd103df00068f3aee1605e321b160b6a4d267ae3d90811362` |
| 既存割れ2 | `ca769d12da1871ad372ff564924fb4ce16aef4dcf90c249850b3c7995556fddc` |

## 実行した確認

- `science-review-regressions.ts`: **92件成功**。
- `science-wood-fire-check.ts`: **32件成功**。今回は一時的な工程版の置換も不要。
- 前回のlab診断を工程版0.1.4で実行。上記の3条件の返却・再試行、370回目までの燃料返却、旧 `/1` 状態の無消費の拒否を確認。
- 型検査、Viteビルド、OG生成: 成功。

独立したdetached worktreeで確認しました。本体接続・ブラウザー・世界保存の検証と、実測校正・一次資料の探索は今回の対象外です。
変更と関係のない工程の全面再レビューは行っていません。

再現コマンド（tsxを使えるlabから）:

```sh
node --import tsx docs/proposals/civilization/review/science-review-451ea82.repro.mjs /absolute/science-26c98c4 0.1.4
node --import tsx docs/proposals/civilization/review/science-review-26c98c4.electric.mjs /absolute/science-26c98c4 /absolute/science-451ea82
```

電気窯比較: [science-review-26c98c4.electric.mjs](review/science-review-26c98c4.electric.mjs)。
前回の指摘診断: [science-review-451ea82.repro.mjs](review/science-review-451ea82.repro.mjs)。

## Claudeへの共有文

```text
26c98c4（薪工程0.1.4）を軽く確認しました。A1・C1とも解消です。
火が育たない3条件で未焼成品が返り、新しい薪での再挑戦が受け付けられます。
回帰では返却試験片を実際に橙まで焼く連鎖も成功。電気窯5条件の全区間出力は451ea82と同一です。
回帰92件・薪専用32件・型検査・ビルドが成功しました。

今回の修正範囲に追加のA・Bの指摘はなく、Codex側の保留を解除します。
薪工程を本体側の最終レビューへ進めてください。
レビュー記録：docs/proposals/civilization/CODEX_REVIEW_26c98c4.md（lab）

本体担当へは、科学側26c98c4と最新のWOOD_FIRE_HANDBOOK.md、
0.2.x接続仕様案、旧状態のrun中止・予約解放の扱いを引き継いでください。
採択と実際の統合は本体側の最終レビュー後にお願いします。labは変更しないでください。
```
