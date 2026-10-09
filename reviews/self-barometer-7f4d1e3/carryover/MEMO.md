# 7f4d1e3：持ち越しCの棚卸し

今回の全面レビューに持ち越しを集めた。**下表のCは非保留のまま。VF-C4の容量・面積・継ぎ目の構造は今回対応されているが、漏れの係数は未校正。その他は未変更か、近似の意味が残っている。** 未変更を「解消」と扱わず、旧Cを新しいA/Bへ引き上げていない。新工程で今回見つかったA/Bは各担当のレビューに従う。

対象 `7f4d1e3c50e29f1ecde7382219f13f19c32777d4`。前回の79cdf9c・d2e6abdのREVIEW.md、対象内の旧気圧計記録と乾燥相談を読み、関連ファイルのSHA-256と差分だけを確認した。新規資料探索や全面回帰の繰り返しはしていない。旧67a030fの独立アーカイブとは比較しておらず、今回の直前親と79cdf9c/d2e6abdに残る旧m02x実装との比較である。

| 項目 | 今回の状態 | 残ること・根拠 |
| --- | --- | --- |
| FX-C1 | retained-unchanged | 浮動の炭素熱控除と整数すすmgの端（前回最大正残差約4.34 J）。oil-lamp.ts・chem.tsは79cdf9cと同一、旧係数も変更なし。 |
| FX-C2 | retained-unchanged | 手書きの素地0/負になるtar/water ppmによるNaN/負params。readFiredを含むfired-pot-assembly.tsは79cdf9cと同一。通常生成ロットで再現するA/Bに変更しない。 |
| FX-C3 | retained-unchanged | 手書きの大きな吸油設備と約1 kg既存吸着油の端。oil-lamp/成形/換算ファイルは79cdf9cと同一。通常灯皿レシピ上界728640mgとの区別を維持。 |
| VF-C1 | retained-unchanged | 約8.8e8ppmの見積もりは風高さ10mのみ。高さ1mなら1437998108ppm。コード/手順書はd2e6abdと同一、値域拡張自体は既に有効。 |
| VF-C2 | retained-unchanged | MAX_SAFE_INTEGER人工端のppm往復+1。pottery.ts同一。通常生成値の600万倍超なのでCを維持。 |
| VF-C3 | retained-model-meaning | surface_cm2は容量から生成する片面/薄壁の有効面積。生成のpottery.tsは同一。vessel.tsの漏れにも使うようになったが、実測外面積や内外差の校正になったわけではない。 |
| VF-C4 | structural-response-calibration-pending | vessel.tsに容量比V/500mLと壁area比、継ぎ目の漏れが追加。旧500mL単独経験式のそのまま流用という構造は対応された。airLeakRefH/壁漏れ/継ぎ目係数は仮定のまま、壁厚による透過の独立項はない。現物時定数の校正済みとはしない。 |
| BARO-C1 | retained-computation-unchanged | 旧m02xの異常state再利用（data:null/欠けたfield/別run・world/停止済み）。barometer.tsの差はexport3箇所だけ、common.tsは同一。m03xの新状態検証とは別に旧m02xのCは残る。 |
| BARO-C2 | retained-computation-unchanged | 旧m02x格子外の越流を初めて検出する時刻と言葉。spilledAtを物理的な越流の瞬間と説明しない。export以外の旧計算は同一。新m03xの今回A指摘へ同じ番号で混ぜない。 |
| DRY-PEAK-CONSULTATION | retained-unchanged | 最大流束の永久保持は短時間の強風と長時間を区別しない。ならされる湿り差/応力と残る損傷を分ける相談は未実装。pottery.tsはd2e6abdと同一、相談文も同一。校正済み緩和時間はない。 |
| BARO-GAP-EXTREMA-CONSULTATION | retained-computation-unchanged | 気圧と器温の極値を同時刻で組にする改善、20hPa/hの1時間未満の検証は未対応。今回新工程の空気量幅とは分け、旧m02xの非保留相談を残す。 |

元の器乾燥C2（生成した履歴が1e9を越え、次runで拒否）はd2e6abdで解消済みで、ここでは再度未解消に戻さない。残るVF-C1は説明の見積もり、VF-C2は通常天気で生成しない整数上限の端である。

## ファイルの同一性

- 79cdf9cから `oil-lamp.ts`・`fired-pot-assembly.ts`・`pottery.ts`・`common.ts`・`physics.ts`・`chem.ts` はSHA-256一致。
- d2e6abdから `pottery.ts`・`common.ts`・`physics.ts` と乾燥手順書・最大速度相談文はSHA-256一致。
- `barometer.ts` はファイルSHAが変わったが、`Geometry`・`SPILL_NOW`・`SPILLED`のexport追加3箇所だけ。3つのexportを取り除くと直前親と本文が完全一致する。
- `params.ts` の79cdf9cとの差は4つのjoint定義の追加だけ。既存の炭素熱・気圧欠測・乾燥係数等は変えていない。
- `vessel.ts` は変更。`τ = airLeakRefH × 60 × (容量/500 mL) / max(壁の漏れやすさ×面積比＋継ぎ目, 1e−4)` となりVF-C4の構造に応答する。面積は有効片面近似のまま、厚さ別の透過率はまだ入っていない。係数の根拠を新しく取得したという主張はしない。

各比較元・対象の完全なSHA-256、3箇所のexport差分、項目別の関係ファイルは `status.json` に保存した。原ファイル・ブランチ・過去ZIPは変更していない。
