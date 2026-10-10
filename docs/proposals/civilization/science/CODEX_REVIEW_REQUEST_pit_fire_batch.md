# Codex へのレビュー依頼：野焼きで器をまとめて焼く（p13y 0.2.0）

2026-10-10 / ブランチ `codex/civilization-simulation` / 軽めの全面レビュー（変更は1工程）

本体の依頼：野焼き1回が薪の山（約 31 kg、乾燥 30 日）をまるごと使い、器1つに約 40 日かかっていた。オーナー決定（すべておすすめ）：器 1〜3 個を同じ火で、器ごとに熱・乾き・割れを計算、蒸気ではじけた器は隣にひびを入れうる（`pitNeighborBurstP` 0.2・`pitNeighborBreakShare` 0.3、仮定）、場所の差なし、乾き具合の違う器を混ぜてよい。手順書 [PIT_FIRE_HANDBOOK.md](PIT_FIRE_HANDBOOK.md) §7。

| 変更 | 内容 |
|---|---|
| `src/science/step/pit-fire.ts` | 状態 `civ-sci.pot-pit-fire/2`：`pots[]`（器ごとの `WareState`・lotId・置き場所・元の品質）。`burnStep` は器ごとの `advanceWare` の熱を足して火から引く。片付けは器ごと、灰はいちばん小さい lotId の器の場所。器が2つ以上なら観察の `quantity` に lotId を付ける |
| `src/science/params.ts` | `pitNeighborBurstP`・`pitNeighborBreakShare`（assumed） |
| カタログ | p13y 0.2.0・注記 |
| `scripts/science-pit-fire-check.ts` | 45 件（8 節が今回） |

確認したこと：

- 器1つは 0.1.2 と同じ：一時的に 0.1.2 のコードを並べ、327 要求（計画・seed 1〜20・湿った器・風・雨・7 分の区切りと look・天気の欠測）で結果（state・evidence を除く）と状態の値（器の温度・焼き締まり・蒸気と石英の比・火の温度）が完全一致。
- 3 個：薪 30.8 → 31.3 kg、質量が閉じる、1 h と 7 min の区切りで生成物・放出が一致、lot の順を入れ替えても一致。
- 湿った器と乾いた器：40 seed で湿った器のほうが蒸気の比が大きく、16 回はじける。乾いた器の割れは、自分の4つの仕組みと隣のはじけの規則から別に計算した値と 40 回すべて一致（はじけで割れが増えたのは 1 回）。
- 4 個・割れた器を含む・途中で器を抜く・0.1.2 の run・/1 の状態は拒否。

## 見てほしいところ

1. 器が複数のときの熱の扱い（同じ火の温度、器ごとの遅れ）と、器1つの結果が変わらないこと。
2. 隣の器への割れの規則（はじけた器の判定、鍵 `draw(seed, run, pot, 'neighbor', burstPot)`、焼けていない隣には及ばない）。
3. 観察の `quantity` の名前の付け方、灰の置き場所。
4. 状態 /2 の保存・復元と旧版の拒否。

lab と main・共有ブランチは変えずに、結果は共有ブランチ（codex/science-reviews）か ZIP で。修正は科学側で行う。
