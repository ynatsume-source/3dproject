# 本体側の最終レビュー依頼：野焼き・焼いた器の換算表・粘土の手ざわり

2026-10-09 / ブランチ `codex/civilization-simulation` / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**Codex の確認はすべて終わっていて、A/B は残っていない。** 0a3de47 の全面レビュー（A 4件）→ 65a55c4 で修正 → Codex の修正確認で保留解除（追加の A/B なし）。7b23852 の追補（二重の壺の戻し方）も A/B なし。

これで島の器づくりが「生の粘土 → 粘土の池 → 練る → 形づくる → 乾かす → **野焼き** → **鍋・二重の壺・灯皿**」までつながる。本体の目標「焼いた鍋でヤシ油を煮る」を島で回せる。

| もの | 版 |
|---|---|
| 野焼き `p13y_pot_pit_fire` | 新規 **0.1.2**（状態 `civ-sci.pot-pit-fire/1`、接続仕様 0.2.x のみ） |
| 換算表 `civ-sci.fired-pot-assembly/1` | 新規（`cookPotParams`・`retortParams`・`lampDishParams`・`firedPotQualityOnReturn`・`firedPotSherdsQuality`・`retortPartsOnReturn`・`TOOL_RECIPES`） |
| 浸す工程 `p10x_clay_slake` | 0.1.2 → **0.1.4**（`look`：手ざわり。状態 `/2` のまま） |
| ヤシ油を煮る `p31x_coconut_oil_boil` | 0.1.2 → **0.1.3**（`cook_pot` も鍋として受け付ける。物理は同じ） |
| 炭と木タール `p14x_charcoal_tar_retort` | 0.1.2 → **0.1.3**（`tar_retort` も受け付ける。物理は同じ） |
| 焼き物の共通物理 `kiln-ware.ts` | `advanceWare` に `{ burnOrganic }`（指定しなければ今までどおり） |

手順書：[PIT_FIRE_HANDBOOK.md](PIT_FIRE_HANDBOOK.md)・[FIRED_POT_ASSEMBLY_HANDBOOK.md](FIRED_POT_ASSEMBLY_HANDBOOK.md)・[CLAY_PREP_HANDBOOK.md](CLAY_PREP_HANDBOOK.md)（追記）。

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/pit-fire.ts` | 追加 | 野焼き 0.1.2 |
| `src/science/step/fired-pot-assembly.ts` | 追加 | 換算表 |
| `src/science/step/kiln-ware.ts` | 変更（5行） | `burnOrganic` の opt-in。試験片・電気の試験窯は全戻り値が完全一致（Codex：72実行・137,991区間） |
| `src/science/step/slake.ts` | 変更 | 0.1.4：look、来歴が不完全なら黙る、同じ時刻は操作が先 |
| `src/science/step/coconut.ts`・`charcoal.ts` | 変更（数行） | 版と、住人の鍋・二重の壺の kind。`charcoal.ts` は `BULK_G_PER_ML` を export |
| `src/science/step/index.ts` | 1行＋import | `[PIT_FIRE_PROCESS.processId]: pitFireStep as ScienceStep`（main の index の形のまま足す） |
| `src/science/params.ts` | 追加のみ | `pit*` 15個と `fired*` 5個（すべて仮定） |
| `src/science/island-clay.ts` | コメントのみ | 土壌資料の分母の違いの注記（値は同じ） |
| `data/science/catalog-test-2.json` | 科学側の版をそのまま | `fired_pot`、`p13y`、`cook_pot`・`tar_retort`・`lamp_dish`、版と注記 |
| `scripts/science-pit-fire-check.ts`・`science-fired-pot-assembly-check.ts` | （main にない検査） | 32件・17件 |
| `scripts/science-clay-prep-check.ts`・`science-charcoal-check.ts` | 更新 | 63件・39件 |

資料（`sources.json`）の追加はない（野焼きの値はすべて仮定。Codex が集めた候補は ZIP の中にあり、今回は入れていない）。

## 本体側でやること・守ること

- **野焼き**：最初の依頼の `interval.from` に `fire_plan` を1回（preheatMin・pace 0〜2・targetGlow 0〜3・holdMin・forcedCooling 0/1）。途中は `look` だけ。`open_fire_pit` は場所で、その params は使わない（焚き火の値は科学側の仮定 `pit*`。料理用の炉の値を共有しない）。天気（気温・湿度・風・雨）のどれかが分からない区間で run は止まる。燃えている途中で場所を失ったら `stop: equipment-lost` を送る（0.1.2 で区間の終わりまで燃えてから止まる）。
- **生成物**：`fired_pot`（形・容量・壁・吸水・ひび）、割れたら同じ量の `pot_sherds`、火が届かなければ `dry_pot` に戻る。島の粘土の有機物は燃えて抜ける（O2 は `drawn`）。
- **鍋**：`cookPotParams(lot)` を `cook_pot` の params に（ひびのある器は拒否される）。p31x 0.1.3 が受け付ける。
- **二重の壺**：`retortParams(upper, lower)` を `tar_retort` の params に。**2つのロットから1つの設備を組み立てる処理が本体に要る**。
  - 下の器は、上の器いっぱいの詰め物から落ちうる液を受けきれる大きさでないと拒否される（8 L の鍋の下は 615 mL 以上。式は FIRED_POT_ASSEMBLY_HANDBOOK.md §1）。
  - 戻すときは `retortPartsOnReturn(upperCopy, lowerCopy, condition)`。通常使用の傷みは上の器に割り当てる仮定。落下・洪水・下の器そのものの破損・`equipment-lost` はこの表で決めない（本体が扱う）。量は関数が返さないので、組み立てのときに上下それぞれの元の量を持っておき、同じ側に一度だけ返す。
- **灯皿**：`lampDishParams(lot)`（油の灯りはこれから）。
- **竹の道具**：`TOOL_RECIPES` の材料と手間で本体が作る。
- **粘土の池**：決め打ちの取り出し（9.25日目）を、`look` の「手につかず、よくまとまる」で取り出す形に変えられる。
- **版**：p10x 0.1.2・p31x 0.1.2・p14x 0.1.2 の run は版で拒否される（本体は中止して予約を解放）。main の `scripts/clay-chain-check.ts` は p10x の版 `'0.1.2'` を決め打ちしているので `'0.1.4'` に。

## 統合の予行（科学側で実施）

main `06d20e8` を一時ディレクトリに展開し、上のファイルを置き、`index.ts` に野焼きを1行足して確認した（作業後に削除）。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 野焼き・換算表・粘土の下ごしらえ・炭・ヤシ油・器の検査 | 32・17・63・39・46・40件成功 |
| main の `science-integration-check` | 93件成功 |
| main の `process-runner-check`・`assembly-check`・`island-science-check`・`pottery-host-check` | 成功 |
| main の `clay-chain-check` | 版の決め打ち `'0.1.2'` で1件失敗 → `'0.1.4'` に読み替えて成功 |

実行していないもの：本体の工程の一覧への登録、2つのロットからの組み立て、画面での確認、「焼いた鍋でヤシ油を煮る」を住人ごと回すこと。

## 次のレビューへ回すもの（非保留）

- 野焼きの校正：割れ率・薪の量は実測ではない。生木の温度は傾向の再現。黒い芯は割って見る形へ（PF-C1）。
- 二重の壺の容量の上限は、詰め物の最初の水分を蒸気として出し、1 g = 1 mL で数えるこの版の範囲での保証。最初の水分も下に集める版やタールの密度を使う版では見直す。
- 取り出すときの手ざわり（終わりの観察）は、来歴が不完全でも今までどおり出る。
- 乾燥の最大流束の履歴の上限（p12y C2）、共通の `wind10m()` の風の欠測。
