# Codex への確認依頼：粘土の池（換算表 civ-sci.clay-pit/1）と浸す工程 p10x 0.1.2

2026-10-07 / ブランチ `codex/civilization-simulation` / 新しい工程ではなく、換算表と既存工程の小さな変更なので**軽い確認**でお願いしたい（全面が要ると判断したらそれでも）。

| ファイル | 中身 |
|---|---|
| `src/science/step/clay-pit.ts` | 換算表：大きさ → 設備の params と材料 |
| `src/science/step/slake.ts` | 0.1.2：`clay_pit` も桶として受け付ける（ほかは変えていない） |
| `src/science/params.ts` | `clayPit*` の6定数（すべて仮定） |
| `data/science/catalog-test-2.json` | 設備 `clay_pit`、p10x 0.1.2 |
| `scripts/science-clay-prep-check.ts` | 9節（5件）を追加、計 55件 |

手順書：[CLAY_PIT_HANDBOOK.md](CLAY_PIT_HANDBOOK.md)。

## 見てほしいところ

1. 同じ params なら試験用の桶と結果が完全に一致すること（工程の物理を変えていないこと）。
2. 内張りからのしみ出しを扱わないこと（湿らせて屋根の下にある間は少ない、という仮定）が、世界をうそにしない範囲か。扱うべきなら、浸す工程に「しみ出し」を足す設計を相談したい。
3. 生の粘土 約 20 kg・約 70 分という作る手間の大きさ（本物らしさ）。

## お願い

前回どおり、lab と main は変更せず、結果は ZIP で。修正は科学側で行います。

## 追記（2026-10-07）：島の粘土の組成と、手でさわる look

- 表 `civ-sci.island-clay/1`（`src/science/island-clay.ts`）：南のすぐ近くの島の粘土を、検査の例の値のまま「仮定」として置いた。資料での照合をお願いしたい：八重山（地球の小浜島にあたる場所）の土壌（国頭マージ・島尻マージなど）で、粘土鉱物・石英・有機物・石灰の割合がどのくらいありうるか。石灰が多いなら、焼いた後の石灰のはじけ（すでに kiln-ware にある）が効く。地質を断定しない書き方で。
- p10x 0.1.3 の `look`：格子の間のコピー読み、来歴不完全の後は黙る、見ても変わらない。検査は `scripts/science-clay-prep-check.ts` 10・11 節（61 件）。
