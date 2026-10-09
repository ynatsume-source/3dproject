# 自作の気圧計 7f4d1e3：入口・保存・本体接続・観測情報

対象 `7f4d1e3c50e29f1ecde7382219f13f19c32777d4`。この担当は m03x の入口・版・保存・入力guard・本体への水の返却・住人に返す情報を確認した。物理・幅・区切りの正しさは他担当の結果と合わせて判断する。

**通常の正しい入力・実生成物について追加 A/B 指摘なし。保存破損の持ち越し C2 を再現し、新工程にも同じ guard 不足があることを C として記録した。** lab・main・科学側・対象ソースを変更していない。

## 再現

対象ディレクトリを cwd として:

```sh
node --import tsx --import ./scripts/node-assets.mjs /workspace/reviews/self-barometer-7f4d1e3/host/repro.mjs /tmp/self-barometer-7f4d1e3 /workspace/reviews/self-barometer-7f4d1e3/host/result.json
```

49判定成功。82件の通常要求と拒否結果を契約検査に通し、違反0・シリアライズ前の非有限値0。壊した保存データは、この集計に混ぜず、別に例外を捕捉して記録する。

## 実際の器から m03x まで

粘土から500 mLの壺（形2）を成形し、日陰8日で乾燥、丁寧に野焼きした。seed1で割れないfired_potを得て、p16x 0.1.3にその器・管40 g（内径8 mm・長さ600 mm）・タール30 g・温める薪を入れ、継ぎ目に6 gのタールを盛って封じた。

返った管つきの器を `potToEquipmentParams`（civ-sci.pot-assembly/4）に通し、本体相当でmarkMm5を加えた。sealed1・airtightKnown1・正のairLeakTauMinとbulbTauSが得られ、管の水20 gを入れて m03x が動いた。器と換算値はresult.jsonに残した。

以下を確認した:

- m03xの登録は既存入口に1つ。p16x0.1.3はworld時計、p17x0.1.4/m03x0.1.0はisland時計でカタログと一致。新たな入口・世界ホストは作られていない。
- m03xはciv-sci.air-barometer-pot/1を保存する。正常状態のJSON保存→復元は、直接続けた場合と応答全体が一致。
- 古い/future/別工程のschemaは明示的に拒否し、消費・精算しない。p16x0.1.2/p17x0.1.3の要求も版を理由に計算前に拒否する。
- m03xは0.1.x/0.2.xを受理。0.2.xだけdrawn配列があり、0.3.0は拒否。
- 実際の管つき器をcondition0.9で返すとsealed1を維持、airtightKnown0。これを実際に換算しm03xへ入れると「空気を保つことが分かっている必要」を理由に拒否する。
- 設備のparamsキー順の変更は無関係。予約中の水の質量/位置、設備のmarkMmの無通知変更はchanged-inputで拒否。
- equipment-lostを一括または2区間で通知（最後はequipment空配列）しても、区間の終わりまでの読み・最終状態・水の返却が完全一致。最初の要求で設備が無い場合は、0.1/0.2両方で理由つきのfailed・消費なし・例外なし。
- record/live/simulationでは気温と気圧の値を使う。unknown/stale、各値の欠測、NaN/Infinityは分からないものとして扱う。初期設置で気温か気圧が分からなければ拒否、続行中は幅を持ち、非有限状態を返さない。

## 住人が知り得る情報

正常な実器の read_gauge はquantity level・整数value・unit mark・precision1のみ。pressureHPa、器の温度、空気の量、airLeakTauMinはobservationsに出さない。これらは世界側のparams/state/diagnosticsであって、住人へ渡す観測ではない。あふれ・印の不一致の言葉も数値を漏らしていない。

worldとislandの時計は、本体がADR0006どおり区間・actions.at・environment.effectiveAtを1つのrunでそろえて送る責務。関数は外の時計を読まない。温度/気圧の欠測は個別にmissingとして送る。再生記録がある区間はrecordで、その区間を覆わない古いlive値を「今分かっている」として再利用しない。

## 来歴不完全な水を、新しく置く気圧計に使うこと

実器のm03xを既知の天気で開始→unknownの区間を送る→take_outで水を返した。この水はhistory_complete0。

その**実返却水**を別の新しいrunへ入れ、既知の気温・気圧で設置し直すと0目盛りが読める。最後に返る水のhistory_completeは0のままで、過去の来歴を完全に直すことはしていない。

これは、このrunの前の管の空気・温度をそのまま続行することとは異なる。新しい設置の初期条件を既知の天気で与えるというモデルは m02x と共通。水ロットの以前の来歴が不完全でも、新しく合わせた管の目盛りを目で読めることは不自然ではない。そのため、この挙動を「unknownの空白を分かったことにした」Aとは扱わない。途中のunknownでは数値を渡さず、幅を保持することを別途確認している。

## HOST-C2：現在のschema名でも保存内容が壊れると例外になる（非保留）

**分類C。** オーナーの整理どおり、正常に生成・保存した状態とは別の、手で壊した保存データの端。今回の全面レビューで持ち越し分をまとめて提示する。

箇所: barometer-pot.ts95–102（型のcastとstructuredCloneだけでdataの構造は検査しない）、112–115（geometry/snap/controlの使用）。

正常な初回状態を作った後、同じschemaと連続区間・同じ水/設備を使い、次のように保存だけを変更:

| 内容 | 実際の応答 |
|---|---|
| data:null | TypeError: nullのlastToを読めない |
| data:[] / data:{} | noncontiguous-intervalを理由にfailed |
| 正常dataからgを削除 | TypeError: undefinedのtauSを読めない |
| 正常dataからsを削除 | TypeError: undefinedのtMsを読めない |
| 正常dataからctlを削除 | TypeError: undefinedのtKnownを読めない |

既に持ち越していた油の灯りでも、civ-sci.oil-lamp/2のdata:nullは例外になることを再確認。正常なJSON往復状態では再現しない。

再開前に状態の必須キー・型・有限値・範囲を検査し、壊れていたらdiagnostic付きfailedを返す形がよい。本体は拒否を受けてrunを中止し予約を解放する。failedの初回結果に含まれるdata:nullも、正常な続行状態として再投入しないこと。失敗からの再試行は、本体で旧runを終え、state:nullの新規runとして行う。
