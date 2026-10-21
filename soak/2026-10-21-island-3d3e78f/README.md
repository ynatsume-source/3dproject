# 実際の島の地形での通しテスト 2026-10-21（main 3d3e78f：#81〜#86 入り）

道具：soak-island.ts（嘉弥真の陸と水を buildOcean で作り、住人を代わりの頭で動かす。筏は6部材から）。
- 48 h → 閉じて 12 h → 48 h。エラー0。保存は 4.5 日で約 700 KB。
- 殻 → 繊維 → 縄 → 帆の敷物 → 艤装 → **帆の航海で南の島に着いた**（reached south-near）。
- **B：開き直してから約17時間後（12-04 14:00〜19:00、12-05 07:00〜09:00）、1フレームの平均が 87〜93 ms**（run2-hours.jsonl、run1 では1時間が5分以上かかって止めた）。
  - profslow（run2）：335 s のうち 304 s が move → findPath。
  - probe-dot.out（save-slow-12-04T15.json.gz を読み込み）：ドットが板（plank）を持ち、桟橋の板張り（deck）の立ち位置 (40.9, −79.6) へ向かうが、毎回 "no way"。lastPlan の5秒の記憶が切れるたびに、道探しの連鎖（0.4〜0.6 s）がやり直される。fails 0 のまま何時間も続く。板を持たせないと平均 5.7 ms。
  - probe-reach.out：板張りの立ち位置は歩ける（板の上）が、岸（z −84、地面 0.34）とのあいだの約 3 m の浅瀬（−0.15〜+0.13 m）が歩けず、陸から届かない。陸からは、波打ち際・浅瀬の道（edgeCost / wadeCost）の予備にも入らない。
- 通常時でも、住人の update の 26% が cord-host look → readCordWorksite（arrangement の全件検査）だった（prof78-summary.txt）。
