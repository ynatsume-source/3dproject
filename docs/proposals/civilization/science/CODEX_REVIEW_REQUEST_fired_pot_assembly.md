# Codex への確認依頼：住民の器を設備にする（換算表 civ-sci.fired-pot-assembly/1）と p31x 0.1.3・p14x 0.1.3

2026-10-07 / ブランチ `codex/civilization-simulation` / 換算表と既存工程の小さな変更なので**軽い確認**でお願いしたい。野焼き p13y（全面レビュー中）の `fired_pot` を前提にするので、p13y の後で構わない。

| ファイル | 中身 |
|---|---|
| `src/science/step/fired-pot-assembly.ts` | 換算表（鍋・二重の壺・灯皿）、戻すときの品質、道具の材料一覧 |
| `src/science/step/coconut.ts` | p31x 0.1.3：`cook_pot` も鍋として受け付ける（物理は同じ） |
| `src/science/step/charcoal.ts` | p14x 0.1.3：`tar_retort` も二重の壺として受け付ける（物理は同じ） |
| `src/science/params.ts` | `fired*` の5定数（すべて仮定） |
| `data/science/catalog-test-2.json` | 設備 `cook_pot`・`tar_retort`・`lamp_dish`、2工程の版 |
| `scripts/science-fired-pot-assembly-check.ts` | 15件（本物の器を形づくり・乾かし・野焼きして作る） |
| `scripts/science-coconut-check.ts`・`science-charcoal-check.ts` | 1件ずつ：同じ params なら試験用の道具と完全一致 |

手順書：[FIRED_POT_ASSEMBLY_HANDBOOK.md](FIRED_POT_ASSEMBLY_HANDBOOK.md)。

## 見てほしいところ

1. 熱容量・熱の逃げを器の質量・面積から決める式（4 L の鍋で 約 1140 J/K・2.3 W/K）が、煮る・炭焼きの工程の仮定と整合するか。
2. ひびのある器を組み立てない決まり、傷んだら `crack: 1` にして二度と組み立てない決まり。
3. 二重の壺を2つのロットから作ること（本体の組み立ては今1ロット）。
4. 同じ params なら試験用の道具と結果が完全に一致すること。

## お願い

lab と main は変更せず、結果は ZIP で。修正は科学側で行います。
