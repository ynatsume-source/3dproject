# 殻を潮だまりに浸ける：科学部品と段取り v1

必須の仮定IDは `owner-assumption/husk-soak/2026-10-17/v1`。すべてオーナー決定の**仮定（キメ値）**で、文献による校正ではない。IDの省略・未知のIDは拒否する。baseは main `d6a6d039cddcb5b4f7a9a3b8fe8705b1854914b7`。

## 入出力と収支

唯一の入口は `coconutMilkStep` が作るまとめロット `coconut_husk`。質量mg、整数の `count`・`water_ppm`・`ash_dry_ppm` と明示した `history_complete` を読む。既存の木質材料の読み方に合わせ、水は `round(質量 × water_ppm / 1e6)`。BigIntの半分切上げで計算する。元工程はppm化する前の正確な水mgを保持していないため、読み取った質量と水をこの工程の入口とする。乾物＝質量−水で、**灰分も乾物に含める**。標準殻の300gを黙って当てはめない。

元の乾物をD、元の水をW0、確定した浸漬の島時間の累計をtとする。30秒未満の端数は保存し、累計から `q=floor(t/30000)×30000` を得る。

`吸った水 = floor(max(0, 2D−W0) × min(q,432000000) / 432000000)`

5日で水は乾物の2倍になる。元からそれ以上の水があれば増やさず、減らさない。比例計算と等分はBigInt。負の量・安全整数を超える最終質量・個体の乾物が0になるcountは拒否する。5日で吸水は止まるが、自動で取り出し・予約解放はしない。

取り出したときに一度だけ、元ロットを全量消費し、吸った水を `drawn: {materialId:'sea_water',from:'water'}` で精算する。ここでいうsea_waterは海から取り込んだ**水の質量だけ**で、塩はv1で扱わない。水の在庫ロットは不要。`入力質量 + drawn = count個の出力質量` が整数mgで閉じる。

乾物と水をそれぞれcountで等分し、それぞれの余りを先頭から1mgずつ配る。出力は `wet_unseparated_coconut_husk`、qualityは `dry_mg/water_mg/husk_count:1/unseparated:1/history_complete`。IDはrun・元ロット・個体の添字のJSONタプルから決める。

## 段取りと時計

新しい部品は `src/science/prototypes/husk-soak.ts` と `src/world/husk-soak-work.ts`。別の台帳や時計を作らず、既存Ledgerのrun/state・予約・commitを使う。

- 本体が、意図、確認した在席、潮だまりに置かれた元ロットを渡して `beginHuskSoak` を呼ぶ。場所は `coastal-tide-pool` のみ。移動は本体が先に確定する。
- 材料と潮だまりを予約する。浸けて待つ住人は自由で、連続した手仕事として予約しない。既存の手仕事と同じ場所を同時に使わない。
- `recordHuskSoakSpan` は、本体が確定した世界時刻・島時刻の両方と、浸かっていたかを受け取る。両時計の換算は本体の責任で、科学側は倍率を推測しない。runの時計は島時計。
- `immersed:true` の島時間だけを累計する。falseは加算せず、nullや未報告の空白も加算しない。空白やunknownがあれば `history_complete:0`。端数は区間をまたいで引き継ぐ。
- `takeOutHuskSoak` は、在席した住人の `kind:'take-out'` の意図で終わる。最後の確定区間から取り出しまでを黙って埋めない。
- 確定した30秒が0なら、元ロットの**同じID・同じ質量とquality**を残し、予約だけ解く。29999msの記録があっても同じ。新品を途中物に書き換えない。
- 同じcommandId/recordId/取り出し意図の再送は無変化。内容が違う再送、重複・逆順・別世界/runの区間、予約した材料の変化は、取引全体を変更せず拒否する。
- 保存したJSONを `restoreHuskSoak` で検査して復元できる。復帰だけでオフラインの時間を加算しない。状態schemaは `civ-world.husk-soak/1`。

共有runnerのcommitは新製品を採番するため、新工程は**同じ取引の中**で、この工程の新製品だけを上記の決定的IDに付け替える。共有runner自体は変更しない。

## 来歴と打つ工程への接続

LotViewのqualityは数値専用なので、`soakHistory` は各製品の入力データとして**元のrunのstateに保存**する。世界時刻で実際に確認された浸漬を、隣接する区間はまとめて記録する。記録は `recordId/runId/fromWorldMs/toWorldMs` の4キー。区間を分けても同じ記録になる。共有runnerが自動で保存しないdrawnの精算記録も、このstateに保持する。

`readSoakedHuskInput(L, lotId)` が、現在のロットの質量とqualityを照合し、PR20の `WetUnseparatedHusk` を返す。ロットの移動は来歴を失わせない。本体は作業場へ運び、殻1個ずつ既存の `beginManualHuskWork` に渡す。十分浸けた殻は既存の配分表と手仕事で完了する。早く取り出せば、既存の水不足の拒否をそのまま返す。

公開の言葉への変換は `huskWorkFailureObservations`。本体が在席して実際に試したと確定した場合だけ、水不足の既存エラーを「殻が硬く、ほぐれない」と言う。予定・不在・未確認の試行・他の拒否では言わない。機械向けの拒否コードや、受入済みの手仕事・配分表・段取りは変更しない。

## 観察と範囲

公開用 `readHuskSoakWorksite` は、見た目の言葉・段階・予約の有無・住人が自由であることだけを返す。量、count、時間、残り時間、仮定、quality、ID、配分表は渡さない。世界専用 `projectHuskSoak` と保存stateは住人の知識・日記・UI・ログへの入力にしない。

待機中は「殻が水を吸って重くなってきた」「まだ硬く、乾いている」。元から水の多い殻には「殻は水を含み、重い」と言う。取り出したときは「浸けた殻を引き上げた」。

住人の行動・記憶・AI・3D・表示・`residents.ts`、公開エントリへの接続は対象外。PR20〜28の受入済み実装と接続仕様は保つ。変更する既存コードは共有の二重予約の確認への新工程の追加だけ。main統合・公開反映は行わない。

## 検査

`node --import tsx --import ./scripts/node-assets.mjs scripts/husk-soak-check.ts`

実際のcoconutMilkStepの出力から、等分・drawnを含む収支、区切り・JSON・再送、30秒未満/0の取り出し、欠測と空白、二重予約、来歴、早期の水不足と在席した試行だけの公開観察、5日後の1個ずつの打ち終わり、観察の非公開境界を検査する。既存の殻・縄の検査もfastのまま残す。
