# ポイントロボス — 現地資料を踏まえた充実案

調査日: 2026-10-02 UTC。前回の「現地資料未取得」の草案を、この調査結果で更新する。本文の「今回」は実装前の調査を指す。実装後の内容はREADME.mdを参照。

今回、California Department of Fish and Wildlife（CDFW）、California State Parks、Monterey Bay Aquarium の本文・現地写真・潜水案内図を取得して確認した。ネットワーク設定の公開後にこれらへのアクセスは成功。NOAAとPoint Lobos FoundationはHTTP 403、USGSはタイムアウトで、今回の根拠には含めない。

実装は変更していない。最新 `main` は `d21e59971e1b709e12f5bdfaf6cf89747986d9e0`。前回調べた `f81514f28df44067aecfd020a7827c9ac1384051` から、海域設定・ケルプ・魚行動・見所・Point Lobos検証スクリプトに差分がないことを確認した。前回の生成数はこの範囲の基準値として使用し、新しい描画性能の測定とは扱わない。

## 提案の中心

**ケルプの天蓋、葉と茎の中層、低い海藻、岩の表面を重ね、そこで暮らす生物を見せる。**

現地資料では、ケルプ林・岩礁・砂底が併存する。CDFWはBluefish Coveの水中の岩峰を紹介し、State Parksの潜水案内図はWhalers Coveからケルプを抜ける砂の水路を描いている。[S1–S4]

最初は現行マップの中に「濃い森」「岩陰の庭」「砂と森の境界」を作る。将来、実在の湾どうしを位置・縮尺まで再現する場合は、別途測深・底質資料を確保する。

## 1. 現地から確認できたこと

### 地形と密度

- CDFWは、Point Lobos SMRに砂底、広い岩の地形、surfgrass beds、kelp forestsがあると説明する。surfgrass（海草）と海藻は別の植生として扱う。[S1]
- Bluefish Coveでは水中の岩峰、Whaler’s Middle Reefではケルプ林、Coal Chute Coveでは水中の洞穴を紹介している。それぞれ別の場所であり、現行の小さなマップへ距離を無視して混ぜない。[S1]
- 潜水案内図には砂の水路と、生物の多い岩峰の潜水域がある。岩峰域の案内深度60–100ftは約18–30m。湾全体や現行の6–19mの生成地形を置き換える測量値ではない。[S4]
- 図は縮尺・等深線・制作日のない模式図。地形の種類と相対関係の根拠に使う。

**設計への反映:** 岩に森のまとまりを作り、砂道を残す。林縁では密度と高さを段階的に変え、岩の側面や亀裂にも生物の居場所を作る。周遊から遠すぎる株配置を見直す。

### 海藻の違い

- Giant kelp / *Macrocystis pyrifera* は岩に付着器で固定され、茎が水面へ伸び、葉が水面で広がる。Montereyでは多年生。付着器・葉・中層・天蓋が、それぞれ生物の住む場所になる。[S5]
- CDFWはPoint Lobos SMRで撮られた “Southern sea palm and jeweled top snail” の写真を掲載。幅のある褐色の葉、その上の巻貝、周囲の岩表面の付着生物を目視確認した。写真は葉の接写なので、植物全体の高さや株密度は推定しない。[S1]
- 同じページに、Weston Beach沖の “Bladder chain kelp” の写真があり、細かな枝を持つ褐藻の群落を確認した。これはPoint Lobos内の記録だが、Bluefish Coveの局所分布を示す写真ではない。[S1]
- 紅藻・石灰藻には岩を覆う型と枝状に立ち上がる型がある。水族館の解説では枝状型の多くは20cm未満。これは形態を作る資料として有効だが、特定種がBluefish Coveのどこにあるかは別途照合が必要。[S6]

**設計への反映:** 既存の背の高いケルプに加え、若い株、形の違う下層の褐藻、低い枝状の藻、岩表面の被覆を使い分ける。Southern sea palmとbladder-chain kelpは現地記録のある優先調査候補。学名・全体形・深度・局所分布を確定してから種別モデルとして採用する。

### 動物と生活

- CDFWとState Parksは現地にrockfish、lingcod、cabezon、海星、海綿、イソギンチャク、ウミウシ類、ラッコ、アザラシ等を紹介する。Point Lobos広域の記録で、同じ深さに同じ頻度で現れるという意味ではない。[S1–S3]
- CDFWの写真では、海藻の葉に載るjeweled top snailを確認できる。小さな生物を葉と結びつける造形の根拠になる。ただし写真から移動速度・食性は確定できない。[S1]
- 既存のセニョリータ / *Oxyjulis californica* は、疎らな群れで海底付近から上層までを利用する。海藻上の付着生物をついばみ、他の魚の外部寄生虫を取る。昼間に採餌し、夜は砂に頭を残して埋まる。これらは種としての生態で、今回読んだ資料はBluefish Coveの個体群密度を示さない。[S7]
- バットスター / *Patiria miniata* は管足で移動し、体には柔軟性がある。既存の静止描画を、岩面に沿う遅い移動へ改善する根拠になる。[S8]
- パープルウニ / *Strongylocentrotus purpuratus* は管足や棘を動かし、流れてきた餌を口へ運ぶ。2026年公開の回復研究紹介は、ウニの密度だけでなく採餌行動が重要とする。[S9–S10]

**設計への反映:** 既存魚と底生生物に生活を追加する。新種は岩陰・葉・砂地など役割の違う少数から。ウニを一面に増やすことを「豊かな森」の表現には使わず、局所配置と採餌を考える。

## 2. 最初に作る景色

以下は資料を踏まえたアプリ内の設計案。現地の実測区画を示す名称ではない。

| 景色 | 見えるもの | 暮らし | 初回の重点 |
|---|---|---|---|
| 天蓋の濃い森 | 岩上のケルプのまとまり、丈の差、水面の葉、光の隙間 | 中層の魚群、葉の近くの採餌 | 周遊から森が近く見え、見上げると天蓋がある |
| 岩陰の庭 | 低い海藻、若い株、岩の亀裂、被覆生物 | ゆっくり動くバットスター、隙間のウニ、追加候補の巻貝 | 近づくほど小さな発見が増える |
| 砂と森の境界 | 明るい砂道、岩際の低い植生、少しずつ濃くなる林縁 | 日中のセニョリータの探索、夜の砂への移動 | 昼夜と底質の違いが行動に現れる |

森の中から水路が見え、水路から濃い森へ入れる構成にする。全域の株数倍率ではなく、群落のまとまりと高さの違いを先に調整する。

## 3. 実装の優先順位

| 段階 | 作るもの | 完了の判断 |
|---|---|---|
| 1: 植生と配置 | 一角に低い植生、若い株、局所的に濃いケルプ、岩と砂の境界。海藻の種別造形は同定と生息深度を確認して採用 | 同じカメラで足元・中層・天蓋の差が分かる。砂道が読める。根元が浮かない |
| 2: 既存生物の生活 | セニョリータの付着生物をついばむ動き・夜の砂への移動、少数のバットスターの遅い移動、近景のウニの棘/採餌 | 地形を貫通せず、昼夜移行と既存の回避・捕食が共存する |
| 3: 小さな住人 | 現地記録のある巻貝、海綿/イソギンチャク等を、形・深度・生活資料が揃ったものから追加 | 新種が決まった支持面や居場所を持ち、図鑑説明と動きが対応する |
| 4: ときどきの出会い | cabezon/lingcod等の追加魚、ラッコ・アザラシ等の訪問候補 | 種別行動・深度・モデルを別途検証。出現頻度を現地実測値と偽らない |

セニョリータのクリーニングは相手の魚の姿勢と一時停止まで必要なので、最初の採餌/夜間移動の後に追加する。バットスターの移動や藻の成長を、見せるためだけに高速化しない。短い観察で気付ける棘・管足・体の姿勢変化と、長時間見たときの移動を使い分ける。

ラッコやアザラシは現地の魅力的な候補だが、今回の主目的である海藻の密度や林床の充実を先に進める。常時大量に出現させる個体数の根拠は今回の資料にはない。

## 4. 生態についての時間と範囲

現時点の適切な位置付けは **「Point Lobosの現地資料に基づく代表的なケルプ林」**。2026年のBluefish Coveを密度まで再現した、とはまだ言えない。

- CDFWのモニタリング紹介は、航空調査が1989年、1999年、主に2002–2016年、掲載衛星グラフが1984年から2022年第1四半期までを扱うと説明する。地域はnorth/central/south coastで、Point Lobos局所の現在値ではない。[S11]
- 同ページは潜水調査が、航空観測からは得られない密度・群集多様性の情報を提供すると説明する。水面被覆をそのまま海底の株数へ変換しない。[S11]
- 水族館の回復研究ページは2025年に58水中地点を調査したと記載。中央・北カリフォルニアの研究で、今回読んだページにはBluefish Coveの観測結果はない。ページの公開日はメタデータで2026-03-09、更新日は2026-08-31。これは観測日そのものではない。[S10]
- 同研究は、ウニの受動的な採餌とケルプの新規加入が回復の契機となり得ること、ラッコと森の持続性に関連があることを紹介する。「ラッコを置けば必ず森が回復する」という単純な規則にはしない。[S10]
- 北カリフォルニアやChannel Islandsの減少率は、この入り江の減少率として使わない。写真にある種の現在の普通さ、被度、季節差も未確定。

現在の森を再現する段階へ進める場合は、Bluefish Coveの日時・深度付き水中記録と局所の被覆資料を追加する。今回の初回試作では、現地に裏付けられた構造と行動を優先し、密度は設計値として明示する。

## 5. 既存実装との接続と検証

前回の基準値はケルプ380株・2,479茎・64,597葉、4種181匹、ウニ320・バットスター110。いずれも生成モデルの数で、現地の個体数ではない。

Claudeが実装した40m区画、45m以内の段階的な精細化、70m以遠の精細形状の解放を活かす。株ごとのseed、海底への接地、葉の透過光の表現も維持する。低い植生は形状を共有し、近景の動物だけ必要な更新を行う。負荷の上限は、同条件での描画計測を行ってから決める。

実装開始時に最新mainを再確認し、専用ブランチで進める。採用しやすい単位として「配置と植生」「既存生物の行動」「新種」「資料と比較」を分ける。Claudeには同じカメラ・時刻・海況の前後画像、短い周遊動画、低/標準画質の動作、資料一覧と検証結果を渡す。

この文書は実装前の調査記録。実装内容・比較・検証結果は同じディレクトリのREADME.mdとCLAUDE_HANDOFF.mdを参照。

## 6. 実際に確認した資料

短い引用は確認箇所を示すためのもの。各資料の地域・時点の限界は本文の通り。全て2026-10-02取得。

| ID | 資料 | 確認箇所 / 根拠 |
|---|---|---|
| S1 | [CDFW: Point Lobos SMR/SMCA](https://wildlife.ca.gov/Conservation/Marine/MPAs/Point-Lobos) | Overview、Natural History、Recreation、Photo Gallery。Bluefishの岩峰、各生息地、現地動物と海藻の写真 |
| S2 | [State Parks: Point Lobos](https://www.parks.ca.gov/?page_id=571) | “70 foot-high kelp forests”。林の高さの紹介であり平均水深ではない |
| S3 | [State Parks: Marine Reserve](https://www.parks.ca.gov/?page_id=27221) | “kelp forests, sandy bottoms and deep canyons”。cabezon、blue rockfish等 |
| S4 | [State Parks: Diving](https://www.parks.ca.gov/?page_id=28353) / [潜水案内図](https://www.parks.ca.gov/pages/571/images/point_lobos_dive_map.jpg) | “Sand channel. Best access through the kelp from Whalers Cove.” 図を目視 |
| S5 | [MBA: Giant kelp](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelp) | Natural history、In Monterey Bay。“anchor itself to a rocky surface” |
| S6 | [MBA: Red coralline algae](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/red-coralline-alga) | 被覆型・枝状型、形と大きさ。現地局所記録ではない |
| S7 | [MBA: Señorita](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/senorita) | “bury in the sand with only their heads exposed”。採餌・クリーニングの説明 |
| S8 | [MBA: Bat star](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/bat-star) | 管足、柔軟な体、摂食。種一般の説明 |
| S9 | [MBA: Purple sea urchin](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/purple-sea-urchin) | 管足による移動、餌を口へ運ぶ仕組み、岩の隙間 |
| S10 | [MBA: Kelp forest resilience & recovery research](https://www.montereybayaquarium.org/change-impact/our-conservation-work/kelp-forest-resilience-and-recovery) | “Sea urchin behavior, not just density, is key”。2025年58地点、回復と捕食者について |
| S11 | [CDFW: Kelp monitoring](https://wildlife.ca.gov/Conservation/Marine/Kelp/Monitoring) | 航空・衛星・潜水調査の範囲、年代、得られる情報の違い |
| S12 | [MBA: Harbor seal](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/harbor-seal) | 実装時に追加確認。*Phoca vitulina*、雄最大1.9m/雌最大1.8m、ケルプ林の利用。鼻先を出すbottlingの紹介もあるが、今回の水平に近い息継ぎ動作を垂直のbottling睡眠再現とは扱わない |

参照画像は調査用に手元へ取得し、アプリ素材としては追加していない。公開日・更新日はHTMLメタデータで確認した。元の取得資料は作業環境に保存し、このブランチには出典URLと調査結果を収録する。
