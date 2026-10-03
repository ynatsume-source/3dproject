# fixture-2・乾燥0.3.0・薪焼成のレビュー

2026-10-03 JST。依頼書は5854e31の `CODEX_REVIEW_REQUEST_3839fac.md`。
対象は95c2a01・cbb45df・3839fac、実行checkoutは
`3839fac396d446cffd7222cc7ee42cd5b1576043` に固定した。
電気窯の比較元は直前の `7da1db7e49f618b46bd75d6e519125efbaa76b91`。
両方とも独立したdetached worktree。科学側ブランチとmainは変更していない。

## 結論

既存313件・型検査・ビルドは成功。通常の薪焼成はO2込みのmg収支と整数Jの帳尻が合い、
電気窯の切り出しも5条件で全要求の出力が一致した。
風係数0.6は記載された対数分布の計算と一致するが、棚や乾燥速度の実測校正値ではない。

追加診断で以下の5点を確認した。W4はmainに取り込み済みの成形を含むため、科学側で修正した後に本体側へも伝えてほしい。
W3は微小な停止で表れる量子化の問題で、通常の数十kgの焼成で大きな熱量不足があるという意味ではない。

| 指摘 | 優先度 | 内容 |
|---|---|---|
| W1 | P2 | 最初の要求で設備喪失・設備なしだと例外を投げる |
| W2 | P2 | 薪以外の0.2.x拒否結果にdrawnがなく、検査器自身が拒否する |
| W3 | P2 | 1 msで停止すると燃料を全量返す一方で7 Jの燃焼熱を報告する |
| W4 | P2 | 成形が負・過剰・未知の乾量基準組成を受け入れる |
| W5 | P2 | 不完全な履歴の薪を使っても試験片の履歴が完全になる |

## W1: 初回のequipment-lostで例外

対象: [wood-fire.ts L79–102](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/wood-fire.ts#L79-L102)。

通常の有効な初回要求に `state:null, stop:'equipment-lost', equipment:[]` を指定すると、
`TypeError: Cannot read properties of undefined (reading 'kind')` が出る。
設備喪失時は炉の存在確認を省くが、初期状態の生成で `hearth!.kind` を読むため。
最初の要求を処理する前に設備が失われるケースを、世界ホストが正常な結果として確定・取消できない。

既にrunning状態がある場合の設備喪失は、設備なしでもstopped・精算結果を返すことを確認した。
初回も例外にせず、未開始のため無消費でstopped、または理由付きfailedなど、仕様を決めて正常に返してほしい。

## W2: 0.2.xの拒否結果も契約に合わせる

対象: [common.ts L13–20](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/common.ts#L13-L20)、
[drying.ts L67–73](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/drying.ts#L67-L73)、
[simple.ts L22–28](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/simple.ts#L22-L28)、
[index.ts L25–31](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/index.ts#L25-L31)。

入口 `scienceStep` にcontract 0.2.0で、乾燥・秤量・石灰の焼成・電気窯・浸漬・未知の工程を渡した。
failedになるが、すべて `drawn: []` がなく、`validateResult` が
`a 0.2.x result must carry drawn` を返す。秤量はさらにcontractを0.1.0で返し、echo違反になる。
薪工程のfailだけに0.2.x対応があるため、入口全体で「正常な拒否」の形式が統一されていない。

既存工程を0.2.xで実行可能にする必要はない。拒否結果も要求の版をechoし、0.2.xならdrawnを空で持たせてほしい。
0.1.xにはdrawnを付けないこと、未知工程・旧工程・無効入力の拒否を共通の入口から検査することが必要。
0.2.0契約案の適用確認は通ったが、この拒否経路と本体側の版の読み分けは採択時にも確認してほしい。

## W3: 燃料mgの精算とJの累計が別の丸めを使う

対象: [wood-fire.ts L139–160](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/wood-fire.ts#L139-L160)、
[L176–180](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/wood-fire.ts#L176-L180)。

通常fixture（薪60 kg、水分15%、灰分1%、薪窯）を `[0,1)` msでoperator停止すると：

- 状態の燃焼量は0.501093009 mg。
- 精算はfloorで0 mg。薪60,000,000 mgを全量返し、O2・灰・放出は0。
- エネルギーは `usedJ:7, lostJ:7, storedJ:0`。

各行の `usedJ = storedJ + lostJ` と総質量は合うが、台帳上で実際に減った燃料に対応する熱ではない。
整数Jは小数の燃焼量から先に報告され、最後に燃焼量だけを整数mgへ切り捨てている。
繰り返し短いrunを終えると、返却された同じ薪からこの差を何度でも報告できる。

整数mgとして累積・精算する燃料と、報告するJの基準をそろえるか、runをまたいでも端数が消えない精算を検討してほしい。
既報告のusedJを後から負にして帳尻を合わせる方法は、非負の規則と衝突する。
mg精度に伴う誤差を仕様として許すなら、その上限・持ち越し・繰り返し停止時の扱いを明記する必要がある。
通常fixtureの最後の差はmg未満の端数に由来し、大規模な二重計上を再現したものではない。

## W4: 成形の乾量基準組成を確かめる

対象: [simple.ts L73–78](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/simple.ts#L73-L78)。

45,000 mg、型50×50×10 mm、水分193548 ppmの有効な成形入力で、組成だけを変えると、
いずれもcompletedとなって不正な品質を持つ `test_tile_green` を生成する：

| 入力 | 成形後 |
|---|---|
| `xd_quartz_ppm:-1` | 負の比率をそのまま生成物へ写す |
| kaolinite 450000 + quartz 900000 + calcite 20000 ppm | 合計1,370,000 ppmを受け入れる |
| 既存組成に `xd_unknown_ppm:1` を追加 | 未知の種を受け入れる |

過剰・未知の例は、後段の焼成に同じ生成物を渡すとそれぞれ
`dry-basis fractions exceed the dry mass`・`invalid dry-basis species` でfailedになる。
負の比率は後段で無視されてしまう。結果検査器は総mgを見るだけなので、成形結果を拒否できない。

キーが1つ存在することだけでなく、許可された乾燥種、非負整数ppm、合計上限を工程開始前に確認してほしい。
不足分をinertとして扱う既存方針は維持できる。失敗時は消費・熱・生成を返さないこと。
このファイルは95c2a01で追加された処理を含みmainにも取り込み済みなので、本体側への修正の再取り込みが必要。

## W5: 薪の不完全な履歴を試験片へ引き継ぐ

対象: [wood-fire.ts L108](https://github.com/ynatsume-source/3dproject/blob/3839fac396d446cffd7222cc7ee42cd5b1576043/src/science/step/wood-fire.ts#L108)。

試験片を `history_complete:1`、薪を `history_complete:0` として通常焼成すると、
生成した試験片は `history_complete:1`、燃え残りの薪は0になる。
状態の初期化が試験片のフラグだけを見ているため。

前回の消化・浸漬と同様、工程が使う入力の不完全な履歴を、結果で完全なものにしないようにしてほしい。
薪は発熱量と水分の根拠になる入力であり、単に置き場所へ残しておくだけのロットではない。
試験片と薪の最小値を引き継ぐ検査を加えるのが既存方針と整合する。

## 独立に確認できたこと

### 質量・熱・区切り方

薪の水分0 / 15 / 30 / 60%、灰分0 / 1 / 20%、燃料1 mg・3 mg・8 kg・60 kgの7組を実行した。
O2込みで全ケースの総mgは厳密に一致し、例外・検査器違反は0件。
式を持つ種の元素も比較し、最大絶対差は約0.060 mmol（H）。元素ごとの整数mg・ppmの丸めを含むため、元素まで厳密な等値とはしていない。
灰・inertは組成未測定なので元素検証対象に含めていない。

通常の薪窯・60 kgの場合：

| 要求の刻み | usedJ | 基準との差 | 燃焼量mg（状態の小数） | 試験片mg | 焼結ppm |
|---|---:|---:|---:|---:|---:|
| 30秒 / 1時間 / 7時間 | 480,364,773 | 0% | 32,495,502.996 | 33,692 | 537046 |
| 7.3秒 | 481,390,674 | +0.21357% | 32,564,902.715 | 33,692 | 538630 |
| 1秒 | 480,693,778 | +0.06849% | 32,517,759.436 | 33,692 | 536911 |
| 0.737秒 | 480,696,828 | +0.06913% | 32,517,965.708 | 33,692 | 536910 |

格子上の3通りは生成物・放出・O2・Jが一致。各区間と合計で整数Jの等式も成立した。
格子外は試験片の質量が同じでも、燃料・ガス・焼結度・完了時刻まで同じではない。
この測定結果を薪工程の許容差の根拠として追加できるが、全条件への誤差保証ではない。
operator停止、running後のequipment-lost、world-pause、shutdown、天気不明への遷移も検証した（W1は初回のみ）。

### 電気窯の切り出し

7da1db7と3839facの入口へ同じ要求列を渡し、**各区間の全結果JSONを順番にSHA-256へ入力**した。
通常完了、7.3秒刻み、3時間で停止、強制冷却、既存の割れ2の5条件ですべて一致。
物量だけでなく、状態・熱・診断・観察も比較している。ハッシュは診断出力の `electricBeforeAfter` に記録する。

### 0.2.x検査器

drawn必須、0.1.xへのdrawn禁止、負・小数の量、mg以外の単位、不正な流入元、O2の1 mgずれ、
負のusedJ、failed時のフローを検出することを確認した。通常結果の質量加算も正しい。
W2は検査器の誤判定ではなく、返す側の形式の不一致。

検査器単独では同じ燃焼sourceIdをofferにも入れることを検出しない（`validatorInternalOffer` は違反0）。
現状の薪工程はenergyを必ず空にする検査で防いでいるため、通常の薪工程で二重計上が起きたという指摘には含めない。
本体はこの工程のenergy禁止を維持し、一般の検査器が熱源の由来まで証明するとは扱わないこと。

### 成形と風係数

型50×50×10 mmの密度境界で37,499 mgと57,501 mgは拒否、37,500〜57,500 mgは許可。
mg/mm³ = g/cm³の単位換算は正しい。正常な組成の複写・不完全な履歴0の保持も確認した。
水分193548 ppmから乾量基準239999 ppmへの変換は式どおり（入力ppmが丸め済みなので240000ちょうどではない）。
operator / equipment-lostと供給0 J・40 Jの組み合わせでは、stopped・生成物なしになる。
1.5〜2.3 g/cm³は広い入力の目安という仮定のままで、任意の粘土の妥当性を保証する値ではない。

風の対数比は `ln(1/0.03) / ln(10/0.03) = 0.6036274`。0.6への丸めはこの仮定に合う。
ただし中立成層・一様な粗度・変位高さ0・棚約1 mを前提とする近似で、建物・林・炉まわりの遮蔽や突風までは表さない。
粗度を0.003 / 0.01 / 0.1 mに変えると比は0.716 / 0.667 / 0.500になる。

地上10 mの風0 / 3 / 10 m/sについて、乾燥工程の最初の30秒が、dryPhysicsへ0 / 1.8 / 6 m/sを渡した結果と一致した。
係数が重複して掛かることはなく、元の蒸発係数の風の高さの曖昧さを実装上分離できている。
ただし `evapCoeff` の桁合わせは実測校正ではなく、風換算を追加しただけで校正が完了したとは扱えない。

## 検証・再現方法

既存検査はwood31・step47・回帰50・tile-chain16・lime24・clay52・本体側統合検査93、計313件成功。
型検査・Viteビルド・OG生成も成功。Viteの将来のnative loaderに関する既存警告のみ。
0.2.0契約案は `git apply --check` 成功。採択・本体への適用はしていない。

```sh
node --import tsx docs/proposals/civilization/review/science-review-3839fac.repro.mjs /absolute/path/to/3839fac-checkout /absolute/path/to/7da1db7-checkout
```

[診断スクリプト](review/science-review-3839fac.repro.mjs)はlab側のtsxがあるcheckoutから実行する。
科学実装・世界の保存へ書き込まず、診断をJSONへ出力する。終了コード0は実行完了であり、不具合なしの判定ではない。
W1は `endings.freshEquipmentLost`、W2は `refusals02`、W3は `tinyStops`、W4は `shaping` / `shapingDownstream`、W5は `incompleteFuel`。
科学側の既存検査が成功しても、これらの追加条件は別に確認する必要がある。

## 資料探索

今回、新しく本文取得・照合できた一次資料はないため `data/science/sources.json` は変更していない。
以下は探索記録であり、係数の根拠へ昇格させていない。

- USDA FPL *Wood Handbook*, FPL-GTR-190（`https://www.fpl.fs.usda.gov/documnts/fplgtr/fpl_gtr190.pdf`）：本文取得は環境のHTTPプロキシで403。
- FAOの風速高さ換算の章（`https://www.fao.org/4/x0490e/x0490e07.htm`）：同じく403。上の対数比はコードに書かれた式を独立計算したもので、FAO本文の照合結果ではない。
- GitHubの `fpl_gtr190.pdf`、`fplrp145`、`How to estimate recoverable heat`、木材のheating value / ash、wood kiln / thermal efficiencyを探索。
  文献へのリンク・引用断片・一般解説は見つかったが、測定条件と本文を照合できる一次資料は得られなかった。
- 木材ハンドブックの第三者PDF添付先も取得できず、ハッシュを採取できていない。取得したと装う出典レコードは追加しない。

18 MJ/kg・灰分1%・炉へ入る割合0.2〜0.3は仮定のまま。
今後の照合ではHHV/LHV、湿量/乾量/無灰基準を分ける。`chamberFraction` は炉室への入力割合で、
壁の放熱は別計算なので、文献の「試験片への有効熱/燃料熱」という総合効率をそのまま代入できない。
流木の塩分・空気不足・煙・着火など、依頼書が明示的に除外した現象を今回の修正要求には含めていない。

labへの変更はこのレビューと診断のみ。本体のUI・世界ホストでの予約確定・ブラウザ表示・実機は未検証。

## Claudeへ渡すプロンプト

```text
3839facまでの再レビューが完了しました。labのCODEX_REVIEW_3839fac.mdと付属診断を確認してください。
既存313件・型検査・ビルドは成功。O2込みのmg収支、格子上の一致、電気窯の切り出し前後5条件の全出力一致を確認しました。
風0.6は記載した仮定なら対数比0.6036と整合しますが、実測校正済みではありません。

科学側で次の5点に対応をお願いします。
W1: 初回state:null・equipment-lost・equipment:[]でhearth.kindの例外。
W2: 薪以外の0.2.x拒否結果にdrawn:[]がなく検査器違反。秤量はcontractも0.1.0で返します。
W3: 薪窯を1msで停止すると、燃料は全量返りO2も0なのに7Jの燃焼熱を報告。mgとJの丸め・端数持ち越しを整合してください。
W4: 成形が負のppm・合計137%・未知の乾燥種を受け入れる。正常な組成だけを複写してください。
W5: history_complete:0の薪でも生成試験片が1になる。入力の不完全な履歴を引き継いでください。

格子外は通常fixtureで7.3秒刻みのJ/燃料差が約0.214%。質量だけでなく焼結ppmや完了時刻にも差があるため、薪工程の許容差へ記載してください。
新しい一次資料の本文は取得できず、sources.jsonの追加はありません。発熱量・灰分・炉の効率は仮定のままです。

修正は科学側でお願いします。W4などmainに取り込み済みの箇所は、修正後に本体側へ再取り込みを依頼してください。
Codexから科学側・mainは変更していません。labは変更せず、薪工程は修正確認と本体側の最終レビュー後に統合してください。
```
