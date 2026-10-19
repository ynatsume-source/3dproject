# 帆の世界側 API v2
確定仕様: science/reviews/specs/sail-api-v2/README.md、§9優先。
科学コアPR #44に積む第2段階。基準main c6ca044。residents.ts・住人行動・表示を変更しない。

## 入口
- sail-lots.ts: 植物、帆、マスト、仮想船体の厳密な整数codec。旧竹の明示換算。
- sail-rig-parts.ts: SAIL_RIG_PARTS、複数の縄/撚り糸はsailRigParts(count, materials)。
  船体は装備に内包せず、beginへraftHullFromPiecesの結果を渡す。
- sail-work.ts: harvest/dry/split/weave/mastの意図・確定区間・保存復帰・観察。
  weaveは20000cm²。艤装30分は本体が確認してからassemblePartsを呼ぶ。
- sail-voyage.ts: begin、確定30秒cell、明示resume、world-only View、観察、settle。
  時計・仮定IDは科学コアの選択一か所から取り、保存と擦れ端数にも束縛する。
  読み直しでは乗船を補完せずpaused。resumeで新しい時刻へつなぎ、空白を計上しない。

## 記録と決着
作業は累積時間と量子未満の端数だけ。完了runは除去し、直近64指示と完了要約を保持する。
航海は定数サイズcheckpointと直近64cellの圧縮した正確な要求・観察を保存する。
航海が終わるとrunは除去、直近64commandの決着要約だけを残す。
一セル処理では全台帳を複製しない。決着だけは/3→/4移行や装備分解の原子性のため私有コピーを使う。

縄は航海中に在庫へ重ねて反映せず、決着で元のsourceごとにvoyage:runId:nを/4へ一度書く。
/4のvoyage-summaryは累積曝露と擦れ、実際の切断荷重、入力と出力の小さな整合性fingerprintを持つ。
昔の最大荷重を後の弱った縄へ再試験しない。切断があった場合だけ、その直前までの全傷みから
PR21の整数モデルで切断し、途中checkpointの成分・傷みと照合する。
これは信頼された世界専用の集計入口で、住人の文章を出来事へ変換する口ではない。
単独の曝露・荷重・擦れ、および/3の移行は既存どおり。

健全なら同じ装備IDの中の部品を更新し、同じ縄を棚に二重に残さない。
破損したらkeepLotIdsで帆/マストを元IDへ戻し、切れた縄だけ既存台帳が新IDの二片を発行する。
縄の帆走使用端数は物理IDごとのmapへ保存し、時計方針が違う非ゼロ端数は拒否する。

disassemblePartsの第5引数 { keepLotIds:true } は選択時だけ有効。
既定の呼び出し・第4引数のbroken指定・新ID発行はそのまま。
保持する全IDの衝突は変更前に拒否する。

## 本体へ
天気はsailCellWeatherへ補完前の値を渡す。nullでもcellを送れば漕ぐ。
出航/帆を下ろす判断、地図のheading数学座標変換、乗船済み区間の確認は本体の責務。
帆の航海では既存cord-hostの航海荷重・擦れ・日照を重ねて送らない。
出発直前までの日照を先に精算し、決着後はsunカーソルを決着時刻へ進める。
艤装の材料は予約/装備の中だけが持つ。隠れたqualityとViewを住人の知識へ展開しない。

## v1の横流れとの違い
v2は確定仕様§9.2に従い、漕ぎを含めてheadingDegの向きへ進むため、sidewaysMmは常に0。
旧試作v1には風下への漂流があり、scripts/sail-raft-science-check.tsはsidewaysMmも直接検査する。
この検査と、凍結v1とのproject全体の比較は旧IDの互換性の保証として残し、v2へ漂流の期待値を流用しない。
v2の全再生との比較ではsidewaysMmも0として照合する。
v1とv2の観察の言葉は、どちらもsidewaysMmを参照しない。地図上の移動にはeastMm・northMmを使う。

## 検査
sail-lots、sail-work、sail-voyage、sail-cord-settlementをfast登録。
成分収支、既定とkeepLotIds、予約、作業の分割・保存・再送・部分精算、航海の復帰空白、
64件の上限、null天気/漕ぎ、破損/健全の連続航海、旧荷重と集計の150場面比較、
6時間の全航海保存10KB未満/一セル平均・p95が5ms以下を確認する。
公開bundleへの住人接続とmainマージはレビュー後の別判断。
