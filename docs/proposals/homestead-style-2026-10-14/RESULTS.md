# 同条件比較の結果

全7ケースで保存・乱数・カメラ・時刻・画質・オブジェクト数・Mesh数が変更前後一致。draw callsと三角形は全描画passの合計。同期フレーム時間はSwiftShaderの3サンプル中央値で実機FPSではない。共有CPUのばらつきや短いwarmupがあるため、比の大小だけで性能の優劣を結論しない。

|ケース|画像|draw calls 前→後|三角形 前→後|中央値ms 前→後|時間比 後/前|
|---|---|---|---|---|---|
|desktop-home-wide-day|[前](evidence/before/desktop-home-wide-day.png) / [後](evidence/after/desktop-home-wide-day.png)|976→976|12471592→12473128|33803.0→38866.6|1.150×|
|phone-home-wide-day|[前](evidence/before/phone-home-wide-day.png) / [後](evidence/after/phone-home-wide-day.png)|944→944|11858416→11859376|17457.0→15365.2|0.880×|
|desktop-home-wide-evening|[前](evidence/before/desktop-home-wide-evening.png) / [後](evidence/after/desktop-home-wide-evening.png)|976→976|12471592→12473128|28133.2→29153.9|1.036×|
|phone-home-wide-evening|[前](evidence/before/phone-home-wide-evening.png) / [後](evidence/after/phone-home-wide-evening.png)|944→944|11858416→11859376|14901.4→13982.2|0.938×|
|desktop-home-wide-night|[前](evidence/before/desktop-home-wide-night.png) / [後](evidence/after/desktop-home-wide-night.png)|983→983|12471667→12473203|28686.6→29041.4|1.012×|
|phone-home-wide-night|[前](evidence/before/phone-home-wide-night.png) / [後](evidence/after/phone-home-wide-night.png)|946→946|11858456→11859416|15620.9→17292.3|1.107×|
|desktop-home-near-day|[前](evidence/before/desktop-home-near-day.png) / [後](evidence/after/desktop-home-near-day.png)|981→981|12516272→12517808|34614.4→29469.9|0.851×|

近景の移動診断（最大二階明度差0.12超の全画面画素率）：

- desktop-home-near-day: 0.46625% → 0.48025%。4フレーム。

これは色・輪郭・影にも依存する比較診断。純粋なaliasingの分離や合格判定ではなく、実機・長時間・複数視点の確認は未実施。
