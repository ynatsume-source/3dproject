# 帆の科学コア v2：セルの畳み込みと時計
確定仕様: science/reviews/specs/sail-api-v2/README.md（§9優先、blob a047c700c397efc77ba2372ed67e751aad6eb34a）。
基準main: c6ca044ea830fd62832a3ebdd64ff04dfe7c56cc。

- 従来v1の履歴型APIと値は互換の検査用に維持する。
- v2はcreateSailRaftVoyageのstartCheckpoint/step/restoreCheckpoint/projectCheckpoint/observeCheckpoint。
  現在の材料・破損・整数の距離分子・時計・擦れ端数・決着用の縄の累積だけを保存し、全セルを持たない。
- SAIL_MOTION_CLOCK一か所をisland/worldで選び、仮定ID v2-island/v2-worldを保存に束縛する。
  曝露は常に島時計。距離・帆走時間・擦れは選んだ時計。
- §9の漕ぐ556mm/sを使い、帆が使えるときは帆と漕ぎの速い方で前進する。
  力の式には実際に進む速度を入れる。未知の風では荷重を作らず漕ぐ。
  帆を張り健全なまま終えたセルは、風の欠測でも雨nullを晴れとする仮定で曝露と使用時間を数える。
- 受入済みの負荷→生き残ったセルの曝露→擦れの順を保つ。
  最大荷重を後の弱った縄に掛け直さず、実際の切断直前までの傷みと切断荷重を決着へ渡す。
- sailCellWeatherは補完前の実測だけを変換し、風向の数学座標を一度だけ丸める。
  無い風/風向はnull、無い突風はnull、無い雨はnull。負値や非有限は拒否する。
- 旧竹はBigIntで乾物5/7・残り水・長さ6000mm/7000000mgへ換算する。
- 製造のcompact入口は累積作業量と直近64件のみ。v1製造の配分・値を共有し、全作業区間を保存しない。

このPRは科学コアだけ。世界側の材料・作業・航海、住人との接続は別PR。
コードは世界の時計や在庫を所有しない。観察は数値・強度を返さない。
検査はsail-raft-checkpoint-check（独立した全再生との240航海×2時計、凍結v1比較、
6/12時間の大きさ・平均処理時間）とsail-inputs-check（変換・250作業×20区間・保存上限）。
実行環境が起動しないため、実行確認はGitHub Actionsのnpm ci・型検査・build・fastで行う。
