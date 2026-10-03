# 科学側 65aa96b の再レビュー（W1〜W5）

対象: `codex/civilization-simulation` の `65aa96bedc38998b15b95926d1be9c657a466673`。
前回: lab `7d671ea` の [CODEX_REVIEW_3839fac.md](CODEX_REVIEW_3839fac.md)。
薪工程: `p13w_test_tile_wood_fire` / `0.1.1`。

**W1・W2・W5は修正を確認。W3・W4は元の入力では改善したが、以下の追加条件で未完了（P2各1件）。**
修正は科学側でお願いします。今回の成果はlabのレビュー文書と読み取り専用診断だけです。
科学側はdetached worktreeで検証し、科学側ブランチ・main・本体の保存には変更を加えていません。

## 残件

### W3a [P2] 薪の総mgの切り上げだけでは、実際に消費した可燃分と発熱量が一致しない

対象: `src/science/step/wood-fire.ts:178–184`（熱の累計は `141–149`）。

`ceil(burnedMg)` のあと `splitComp` で整数成分へ割り振るため、切り上げた1 mgが**水だけ**になる場合があります。
熱は先にロット全体の平均発熱量から報告しているので、燃える成分を返却したまま正の燃焼熱が残ります。

標準の試験用薪窯・試験片・計画を使い、薪だけを `1000 mg / water_ppm: 500000 / ash_dry_ppm: 0` にし、
`[0,1) ms` の最初の要求で `stop: 'operator'` を渡します。

| 項目 | 65aa96b の結果 |
|---|---|
| 入力の薪 | 水500 mg、可燃分 `wood_dry` 500 mg |
| 浮動小数の燃焼量 | 0.9514974190632508 mg |
| 精算する薪総量 | 1 mg |
| `splitComp` で実際に取る成分 | 水1 mgのみ |
| 返却ロットを `fuelComp` で復元 | 水499 mg、可燃分500 mg |
| 発熱の報告 | `usedJ: 7, lostJ: 7, storedJ: 0` |
| 外部流入・放出 | `drawn: []`、水蒸気1 mgのみ（CO₂なし） |
| `validateResult` | 違反なし |

より明確な反復例では、`1000 mg / water_ppm: 600000 / ash_dry_ppm: 0`、
設備の `maxBurnKgPerH: 1` を使い、1 msで停止した**返却ロットの質量とqualityを次の新規runに渡す**操作を20回行います。
時刻は `[0,1), [1,2), …, [19,20) ms`、各runの操作時刻も開始に合わせています。

- 入力: 水600 mg + 可燃分400 mg。
- 最終返却: 水580 mg + 可燃分400 mg。
- 累計: 発熱20 J、O₂取り込み0 mg、放出は水蒸気20 mgのみ。
- 20回とも検査器の違反なし。灰分20%を含む薪でも、1回の「水だけ減少・1 J」の例を確認。

元の水分15%・60 kgの例は、可燃分1 mgを実際に消費して7 Jなので修正済みです。
一方、`scripts/science-review-regressions.ts:265–271` の20回検査は毎回同じ初期 `WF` を渡しており、
返却ロットを次へつなぐ検査にはなっていません。また `burned * 平均LHV` は成分の丸めを検出できません。

**修正してほしい性質:** 報告する累積熱を、最終的に消費する整数の可燃分・水・灰の収支と整合させること。
返却ロットを復元しても可燃分が保存されている場合に、燃焼熱を報告しないこと。
途中区間ですでに報告した熱を終了時の負の `usedJ` で取り消す方法にはせず、区間中の計算と終了時の精算で同じ根拠を使ってください。
mg丸めを認める場合も、runをまたいで上の誤差を積み上げない扱いが必要です。

### W4a [P2] `in SPECIES` が継承プロパティを化学種として許可する

対象: `src/science/step/simple.ts:84–91`。同じ判定は `common.ts` の `tileComp` にもあります。

`m[1] in SPECIES` は登録された化学種のほか、`Object.prototype` 由来の `constructor`、`toString`、`__proto__` にも真を返します。
標準の成形入力のqualityへ `xd_constructor_ppm: 1000` を追加すると、JSON往復後も成形が `completed` となり、
粘土45,000 mgを消費して、そのキーを持つ試験片を生成します。検査器も違反なしです。
この試験片を薪の焼成へ渡すと、`non-finite state: refusing to return it` で `failed` になります。

- `xd_toString_ppm: 1000` も同じ結果。
- `xd___proto___ppm: 1000` も成形で許可される。こちらは焼成が進行するため、未知成分を確実に拒否できていない。
- 診断は通常のJSONの数値qualityを渡すだけで、prototypeを書き換えるものではありません。
- 前回の負値・合計超過・通常の未知名と、今回追加した小数・水のdry-basisキーは、いずれも無消費で拒否されました。

**修正案:** 化学種の登録集合そのもの（`Object.hasOwn(SPECIES, id)` など）で判定してください。
成形と、外から来た試験片を解釈する共通処理で同じ規則にすることを推奨します。
成形は本体へ統合済みなので、科学側で修正確認後、本体担当にも差分を共有してください。

## 確認できた修正と既存動作

| 項目 | 独立確認 |
|---|---|
| W1 | 初回・炉なし・`equipment-lost` は理由付き `failed`、無消費、例外なし、検査器違反なし。他5工程の初回条件も科学側回帰を実行 |
| W2 | 9入口 × `0.1.0 / 0.1.3 / 0.2.0 / 0.2.3` の36拒否。contractを維持、0.2.xのみ `drawn: []`、全件検査器違反なし |
| W3 元の入力 | 1 msで7 J、薪1 mg（可燃分）を精算、O₂あり。総量0 mgの元の不具合は解消 |
| W4 元の入力 | 負値・137%・未知名を無消費で拒否。正常な成形は維持 |
| W5 | 試験片/薪の履歴 `1/1, 1/0, 0/1, 0/0` を最後まで計算し、焼成品は `1,0,0,0` |
| O₂込み質量 | 前回と同じ7種類の薪量・水分・灰分条件で、入力＋drawn＝生成＋放出がmg単位で一致 |
| 整数J | 元の各区切りで整数の熱収支が一致。ただし上記W3aの成分と熱の対応は別に必要 |
| 電気窯の切り出し | 切り出し前 `7da1db7` と現在を比較。通常、7.3秒刻み、途中停止、強制冷却、既存割れ2の5条件すべてで各区間の全結果JSONのSHA-256が一致 |
| 風 | 0 / 3 / 10 m/sを0 / 1.8 / 6 m/sへ変換した30秒の乾燥計算が再度一致。係数の物理的限界は前回レビューのとおり |

区切りの追試（標準の薪60 kg・橙）:

| 刻み | 総熱 J | 終了時刻 ms |
|---|---:|---:|
| 1時間 / 30秒 / 7時間 | 480,364,773 | 39,570,000 |
| 7.3秒 | 481,390,674 | 39,630,000 |
| 1秒 | 480,693,778 | 39,600,000 |
| 0.737秒 | 480,696,828 | 39,600,000 |

7.3秒刻みの熱は +0.213567%、放出ガスは約 +0.214%、返却薪は -0.252322%（小数2桁で0.25%）。
焼結は +1584 ppm（相対約0.295%）、終了は +60秒、焼いた試験片は33,692 mgで同一。
ALIGNMENT §10の許容値（熱・ガス・薪0.5%、焼結1%、終了60秒）に収まります。
この分割誤差と、微量精算のW3aは別の問題です。

## 実行と再現

既存検査 **335件成功**: wood-fire 32、step 47、review-regressions 71、tile-chain 16、lime 24、clay 52、integration 93。
`npm run typecheck`、Viteビルド、`scripts/og-pages.ts` も成功。
ブラウザー・本体ホストへの接続・世界の保存・0.2.0採択は今回の確認対象外です。
一次資料の追加取得は行っていません。木の発熱量・灰分・炉の熱効率は引き続き未校正です。
`sources.json`、`sources-thermochem.json`、`tools/science-lab/` は変更していません。

新しい診断: [science-review-65aa96b.repro.mjs](review/science-review-65aa96b.repro.mjs)。
tsxを使えるlabのディレクトリから、対象の絶対パスを渡します。

```sh
node --import tsx docs/proposals/civilization/review/science-review-65aa96b.repro.mjs /absolute/science-65aa96b
```

JSONの `W3.halfWater`、`W3.sequentialReturns`、`W4` が残件の再現です。
終了コード0は診断完了を表し、指摘ゼロを意味しません。修正後に工程版を変える場合は末尾引数に新しい版を渡せます。

前回の全診断（電気窯比較を含む）は、歴史的なファイルを変更せず、薪工程版だけ置換した一時コピーで再実行しました。
任意の作業場所で同じコピーを作る場合:

```sh
python3 - <<'PY'
from pathlib import Path
s = Path('docs/proposals/civilization/review/science-review-3839fac.repro.mjs').read_text()
s = s.replace("processId:'p13w_test_tile_wood_fire',processVersion:'0.1.0'",
              "processId:'p13w_test_tile_wood_fire',processVersion:'0.1.1'")
Path('/tmp/science-review-65aa96b-original.mjs').write_text(s)
PY
node --import tsx /tmp/science-review-65aa96b-original.mjs /absolute/science-65aa96b /absolute/science-7da1db7
```

## Claudeへ渡す文面

```text
65aa96bを隔離して再レビューしました。W1・W2・W5は修正を確認しました。
既存335件・型検査・ビルド成功。電気窯5条件も切り出し前と全結果が同一です。

W3・W4に追加条件の残件が各1件あります（P2）。
詳細はlabの docs/proposals/civilization/CODEX_REVIEW_65aa96b.md、
診断は docs/proposals/civilization/review/science-review-65aa96b.repro.mjs です。

W3a: 水分50%・1000 mgの薪を1 msで止めると、水1 mgだけを減らして7 Jを報告します。
水分60%・燃焼上限1 kg/hで返却ロットを次のrunへ渡す20回でも、可燃分400 mgが変わらず、O2ゼロで20 Jです。
総mgと平均LHVだけでなく、整数の可燃分・水・灰と報告熱を整合させ、返却ロットをつなぐ回帰を追加してください。

W4a: `in SPECIES` が `constructor` 等の継承プロパティも許可します。
xd_constructor_ppm:1000入りの成形は完了するのに、次の焼成が非有限状態で失敗します。
登録された化学種だけを許可する判定にし、共通の組成解釈も確認してください。

修正はcodex/civilization-simulationでお願いします。labとmainは変更しないでください。
成形の修正は、確認後にmain担当へも共有が必要です。最終承認・本体統合はまだ行っていません。
```
