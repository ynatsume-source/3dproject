# 粘土資料の照合と測定値確認：Claudeへの引き継ぎ

2026-10-03 JST。Codexの作業・公開先は `codex/civilization-lab`。
今回の差分は lab `13a35fa` 以降。Claudeの科学ブランチ `90c9d24dc8d1687aab9146e093a8d0a3bd5b883a` の
`science/CODEX_REVIEW.md`、`science/ALIGNMENT.md`、`src/science/physics.ts`、`src/science/step/index.ts` を取得して確認した。

## 今回の結論

粘土試験に関する本文6件を取得し、関連箇所を読み、[出典台帳](../../../data/science/sources.json)に追記した。
**6件とも第三者アーカイブで、Digitalfire原典との一致は未確認。校正に使用できる実測時系列データはまだ取得できていない。**
既存のOpenStax 4件はそのまま。カタログ、物理係数、ScienceStep、本体は変更しない。

検証画面は [tools/science-lab](../../../tools/science-lab/README.md)。測定値の定義・算術を確認するための画面で、
乾燥を実行するシミュレーターや世界ホストではない。データは保存しない。

## 取得経路と証拠の強さ

通常のHTTPS取得は実行環境のプロキシ接続エラーで失敗した。
GitHubコネクタで公開リポジトリ `AngelOnFira/potter` の
`59f128ad5df346ad4befba92bf48294447e9c23d` に保存された本文を取得した。
リポジトリ所有者はDigitalfireではない。保存日時、転載の完全性、原典の現行版との一致は確認していない。

台帳は `verification: archived-text-passages-read-original-unverified`、
`originalPublisherVerified: false`、`calibrationEligible: false` とし、パス・blob SHA・行範囲・
取得先と原典URLを分離した。取得本文のGit blob SHAはローカルで再計算して照合する。
これは保存コピーの同一性の確認であり、原典の真正性や主張の科学的検証ではない。
第三者本文の全文はリポジトリに複製しない。図やスクリーンショットから数値を推定・採録していない。

| 台帳ID | 本文で確認したこと | 今回確認できないこと |
|---|---|---|
| digitalfire-archive-shab | 試験片の成形・乾燥・焼成・煮沸後の長さ/質量の比較。5時間煮沸＋19時間浸漬後に表面水を除去 | 規格適合、吸水速度、室温浸漬との互換性、実測曲線 |
| digitalfire-archive-ldw | 湿量基準の含水率、乾燥後と焼成後の質量の区別、釉薬スラリーの数値例 | 粘土の時系列データ、自由水だけによる焼成減量、放出ガスの内訳 |
| digitalfire-archive-dfac | 中央を覆って不均一乾燥を作り、割れの種類・本数・幅を比較する試験 | 割れ確率、常温乾燥の所要時間、`crackP` の校正 |
| digitalfire-archive-drying-shrinkage | 含水率・調製・粒度・含水勾配と収縮の関係、湿潤長を分母にする定義 | 臨界含水率0.13や最大収縮0.06の実測による根拠 |
| digitalfire-archive-drying-performance | 乾燥の均一さ・乾燥強度も割れに影響するという技術説明 | 速度や厚さだけからの割れ確率、材料を越えた適用 |
| digitalfire-archive-firing-shrinkage | 焼成収縮と全収縮の区別、過焼成による膨張、材料ごとの焼成履歴の重要性 | 反応速度・焼結速度・吸水・強度の定量モデル |

## 数式の照合で見つかった注意点

SHAB の Variables は焼成収縮を `(dryLength - firedLength) / dryLength`、
吸水を `(boiledMass - firedMass) / firedMass` と定義する。
同じページの Purpose 1.2 は焼成収縮の分子の順序と分母が違い、Purpose 1.3 は吸水の分母が湿潤質量になっている。
保存HTML（blob `43027b995995c4b0f738e9689844b85ba63ce044`）にも同じ不一致があり、TXT化だけの問題ではない。
原典での解消は未確認。無条件で本文の式を写さず、今回の画面では以下の定義を明示して使用する。

| 計算 | 定義（比率。画面では100倍して%） |
|---|---|
| 湿量基準含水率 | `(mWet - mDry) / mWet` |
| 乾量基準含水率 | `(mWet - mDry) / mDry` |
| 乾燥線収縮 | `(lWet - lDry) / lWet` |
| 焼成線収縮 | `(lDry - lFired) / lDry` |
| 全線収縮 | `(lWet - lFired) / lWet = 1 - (1 - sDry) * (1 - sFire)` |
| 質量吸水率 | `(mSaturated - mFired) / mFired` |
| 正味焼成質量減少率 | `(mDry - mFired) / mDry` |

`dryPhysics.waterMg / dryMg` は乾量基準。LDWのH2Oは湿量基準なので直接比較できない。
乾量比 `r` と湿量比 `u` は `u=r/(1+r)`、`r=u/(1-u)` で変換する。
例として乾量比0.24は湿量比約0.19355。**これらは定義上の換算で、初期含水率0.24の根拠ではない。**
吸水率は体積空隙率ではない。自由水の蒸発と、焼成の脱水酸基化・有機物・その他のガス放出も区別する。
体積減少を線収縮から推定するなら別途等方性の仮定が必要であり、画面では計算しない。

本文LDWの例（5.04 g湿潤、2.46 g乾燥）は湿量基準51.1905%、乾量基準104.8780%。
記載の51.2%への丸めを確認した。これは**釉薬の単一記載例**で、粘土体の乾燥曲線ではない。
50:50 bentonite/ball clayの14%収縮・布とプラスチック下で1か月という記載もあるが、
温湿度・時刻ごとの秤量・反復回数が欠けるため、速度モデルの校正には使用しない。

## 実測資料が必要な範囲

| 対象 | 最低限そろえる記録 | Claudeのモデルへの対応 |
|---|---|---|
| 乾燥曲線 | 材料ID/鉱物組成・調製、乾燥基準質量、初期水分、寸法、露出面、T/RH/風、時刻と質量、反復・秤の精度 | `evapCoeff`、`clayWaterCritical`、平衡含水率。1本の曲線で全条件に適用しない |
| 収縮と割れ | 同一試料の含水率と3方向の寸法履歴、拘束/支持条件、観察時刻と割れ幅・本数 | 線収縮の水分依存、`dryCrackFluxRef`。DFACの評点を確率に変換しない |
| 吸水 | 焼成履歴、乾燥質量、試験温度・煮沸/浸漬時間、吸水後質量、表面水の除去、試料損失 | 吸水速度と終点を区別。工程の水取り込みは未採択の `drawn` 契約と調整 |
| 焼成 | 鉱物組成、試料温度の時系列、雰囲気、保持時間、質量・寸法・相/吸水/強度の測定 | `rateK` や焼結係数を別々に検証。最高温度だけで成功を決めない |

今回の取得範囲で上記を満たす一次データは見つかっていない。校正済みとの表示へ進めるには、
原典または著者公開データを取得し、測定条件と数値列まで照合する必要がある。
検索で見つかった計算アプリ、土壌画像解析ソフト、転載断片は陶芸粘土の係数の根拠に採用していない。

## Claudeレビューへの回答を受領

- 乾燥中は元ロットを予約し、途中は `ScienceState` のみが持つ。終了時に一度だけ全量消費・1ロット生成・水蒸気放出を精算する。
- 整数Jは浮動小数累計を保持し、丸めた累計と報告済みの差を返す。
- 本番工程の入口は `src/science/step/index.ts`、乾燥の物理は `dryPhysics`。labの旧 `src/science/step.ts` と実験ホストは移植候補から外す。
- 熱源つき乾燥は将来別工程として提案。今回、新しい工程・二つ目の入口・世界ホストは追加しない。
- `drawn` を加える0.2.0案はレビュー待ち。採択済みとは扱わない。
- 統合順は秤量→成形→乾燥→研究の一周。

確認時のmainは `ef876f9cb040c5c71081e3a396264269baf9ad69`。今回のlabの基準は引き続き `41ccd18`。
mainを取り込まず、共通契約も変更しない。Claudeの最終レビュー後に、今回追加した出典6件と
`tools/science-lab/` を必要な単位で選択的に取り込む。labブランチ全体のmergeは提案しない。

## 今回の検証

- 測定計算6件：成功。湿量/乾量基準、収縮の合成、吸水率の分母、欠測、負値、無効入力・演算範囲超過を検査。
- 追加6本文のGit blob SHA、参照行範囲、台帳IDの一意性：確認。既存OpenStax4件はJSON値として同一。
- rootの `npm run typecheck`：成功。画面のJSは `node --check` とViteのモジュール変換で確認。
- Vite本体ビルドとOGページ生成：成功。後者は環境のtsx CLI制約を避け、`node --import tsx --import ./scripts/node-assets.mjs scripts/og-pages.ts` で実行。
- 画面はmiddlewareモードでHTML/JS/CSSを変換して確認。通常のWebSocket待受けは環境でEPERMになるため `ws: false` とした。ブラウザ実表示・操作・画面幅ごとの見た目は未検証。
- カタログ、handoff-manifest、`src/`、本体index.html、依存関係に差分なし。旧ラボの33件は今回変更しておらず、再実行していない。

## Claudeへ渡すプロンプト

```text
ynatsume-source/3dproject の codex/civilization-lab で、13a35fa以降の粘土資料照合をレビューしてください。
docs/proposals/civilization/CODEX_CLAY_REVIEW.md、data/science/sources.json、tools/science-lab/README.mdを先に読んでください。

今回は保存コピーの本文6件と測定値確認画面です。Digitalfire原典との一致は未確認で、実測時系列による校正は未実施です。
SHABの式の内部不一致、湿量/乾量基準、収縮率の合成、質量吸水率と体積空隙率の区別を確認してください。
既存OpenStax4件・工程カタログ・物理係数・ScienceStep・本体は変更していません。

取り込む場合は sources.json の追加6件と tools/science-lab/ を小さな単位で選択してください。
旧 experiments/ と src/science/step.ts は取り込まず、入口 src/science/step/index.ts と dryPhysics を維持してください。
校正可能な一次資料・実測データがあれば、本文/データの取得先、材料・条件・単位を共有してください。
node tools/science-lab/measurements.test.mjs で算術を確認できます。画面のブラウザ実表示はCodex環境では未検証です。
Codexの作業・push先は引き続きcodex/civilization-labのみです。
```
