# リハーサル前の保存形式・移行経路一覧（2026-10-23作成、10-24追記）

## 対象と確認の範囲

- 静的調査の起点main：`1a2ce4e57537e36ff3b3c78054fd22becde3af1a`。以下のソース参照はこのcommitに固定する。main `90ae7cac46b4a0c461b95c922da183c5bd3e7dd3` との比較で、`src/science/`・`src/world/`・住人の復帰コード（`residents.ts`と各host）の変更はない。
- 科学班による旧保存の実読込対象main：`90ae7cac46b4a0c461b95c922da183c5bd3e7dd3`。結果と受入範囲は§7に記載する。
- 目的：11/6または11/7の実機リハーサル前に、科学班が旧保存を読み直すための対応表を渡す。
- 今回は**コード・既存検査・科学班の公開出力の静的照合**。Codexによる旧実保存の展開・読込・通し運転は未実施。下の「既存検査」は検査内容への参照であり、この調査でのPASS記録ではない。10/24の1週間試験は§6、旧保存4本の読込・運転は§7で、科学班の実行結果として区別する。
- この変更は文書だけ。保存形式・工程版・科学計算・本体の復帰処理を変更しない。受入結論は科学班のPRコメントを正とする。
- 範囲は住人保存に含まれる科学台帳・材料・設備・途中工程。観賞用の図鑑・ログ・カメラ位置の移行は [ARCHITECTUREの保存の節](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/docs/ARCHITECTURE.md#L64) を参照。

**保存全体を表す「台帳 /5」は存在しない。** 通常キーは `seaglass.residents.v1` のまま、ルートJSONにも `Ledger` にも全体のschema版はなく、内部の各部品が別々の版を持つ。「/3・/4 → /5」は主に `coirCordLoads` の移行を指す。旧保存を開くこと、在庫を残すこと、途中の工程を継続することは分けて判定する。

## 1. 本体の保存入口と復帰順

| 対象 | 読み方・変換 | 根拠 |
|---|---|---|
| 通常の住人 | `seaglass.residents.v1`。キー名のv1は内部部品の版ではない | [residents:294](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L294)、[3529](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3529) |
| ランタン試作 | `seaglass.lantern-study.residents.v1`。専用キーが空なら通常キーを読む。書込先は専用キー | [residents:299](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L299)、[3541](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3541) |
| 台帳導入前の棚 | `lab` があればそれを採用。なければ旧 `village.store` のロットを台帳へ移し、旧store欄を削除。両方を足さない | [residents:3566](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3566) |
| 旧粘土 | `!quality?.water_ppm` の場合に島の粘土の値を補う。全材料を再校正する処理ではない | [residents:3569](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3569) |
| 一般ScienceStepの旧工程版 | `village.labRuns` の工程が現行版か明示的な互換版かを確認。それ以外は `abortRun` し活動リストから外す。入力ロットは未消費のまま予約を解く | [residents:3571](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3571)、[canResumeProcessVersion](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/process-catalog.ts#L84)、[abortRun](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/process-runner.ts#L385) |
| 組立設備 | 鍋・気密の器・二重壺の各設備を、保存された元ロット／部品から再換算。予約中を除き、換算不能なら元の設備を維持する。ここで灯皿の再換算は呼ばれていない | [residents:3574](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3574)、[refreshAssembled](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/process-runner.ts#L284) |
| 段取りの復帰 | 殻host → 縄host → 帆作業host → `compactScienceLedger` → 帆走host。手仕事は復帰だけでは進めず、新たな在席・実働の確定を待つ | [residents:3577](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3577) |
| 航海中に閉じた保存 | 本体hostが最後の確定セルでinterrupted精算してから復帰。閉じていた時間の航海は作らない | [sail-voyage-host:227](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/sail-voyage-host.ts#L227) |

一般工程の `failed` は契約検査後、無精算で終了して予約を解く（[commit/end](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/process-runner.ts#L350)）。一方、prototypeの不正schema・checksum・bindingは各restoreが例外で拒否する。本体hostはその例外を開発用ログへ記録してcatchするため、**不正な保存全体を自動で拒否・ロールバックし、すべての予約を解くという保証にはしない**。旧保存試験ではログと残った予約も見る。

JSONパース等の例外時は初期状態へ進む経路がある。パースできたルート全体を一括検証する仕組みとは異なる。実保存は原本を保持し、隔離したworktree・storageで試す（[residents:3539](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/robots/residents.ts#L3539)）。

## 2. 科学台帳の各部品

「旧形式」欄は実装された経路。記載のない古い形式を名前の付け替えで読むことはしない。

| 保存部品 | 現行形式 | 対応する旧形式と結果 | 実装入口 |
|---|---|---|---|
| 一般科学の記録 | `scienceRecords: civ-world.science-records/1` | 同欄がない旧台帳の終了済み非prototype runを要約化。状態を捨ててrunsから外し、すでに終了したrunの古い予約だけ解く。量・時計・ID採番は進めない | [compactScienceLedger](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/science-records.ts#L188) |
| 殻を打つ低層 | run `civ-world.manual-husk-work/2`・host-2、`manualHuskRecords: civ-world.manual-husk-records/1` | 同host-2に残った終了状態を検証して要約化。activeは維持。host-1/run-/1を読む分岐はない | [compactManualHuskRecords](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/manual-husk-work.ts#L408) |
| 殻の段取り | `manualHuskArrangement: civ-world.manual-husk-arrangement/3` | arrangement /2を検証して/3へ。終了jobを要約化。途中の確定作業と端数は保持し、復帰後の手仕事はresumeを待つ | [migration](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/manual-husk-workflow.ts#L237)、[restoreHuskArrangement](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/manual-husk-workflow.ts#L354) |
| 縄の段取り | `cordArrangement: civ-world.coir-arrangement/3`、run `civ-world.coir-work/3`・host-3 | arrangement /2・run /2・host-2を検証し/3へ。終了runを要約化。手仕事は停止し、待機も確定した屋根の区間だけを数える。/1移行分岐はない | [migration](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-work.ts#L565)、[restoreCordWork](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-work.ts#L602) |
| 縄の荷重・傷み | `coirCordLoadFormat` / `coirCordLoads.schema: civ-world.coir-cord-load-ledger/5` | /3の履歴・終了荷重runを再検証し最新状態と直近控えへ。/4のchecksum・子リンクも検査してretentionを足す。旧荷重runだけを削除。ロット・傷み・seq・worldは保持。/1・/2は非対応 | [migration/inspect](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-load.ts#L450)、[legacy /3](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-load-v3.ts#L37) |
| 殻の浸漬 | run `civ-world.husk-soak/3`・host-3、`huskSoakRecords: civ-world.husk-soak-records/3` | host-1/run-/1、host-2/run-/2を検証して/3へ。出力殻の来歴を回収してから終了runを要約化。途中runと旧吸水の速さを保持。旧分配の互換扱いはsplitPolicy:1。読込だけでは浸漬を加算しない | [migration](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/husk-soak-work.ts#L688)、[restoreHuskSoak](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/husk-soak-work.ts#L1060) |
| 帆の材料作業 | `sailArrangement: civ-world.sail-arrangement/1`。通常run `civ-world.sail-work/2`・host-2、新規dryのみ/3・host-3 | 旧host-1/run-/1はchecksumを検証してsourcesを補いhost-2へ。**旧dry host-2は旧2日の日程を保持**。残水比例は明示policyを持つ新規dry host-3だけ | [migration](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/sail-work.ts#L692)、[restoreSailWork](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/sail-work.ts#L713) |
| 帆走 | `sailVoyageFormat` / `sailVoyages.schema: civ-world.sail-voyages/1`、run `civ-world.sail-voyage/1`・host-1 | 現行/1のみ。未導入なら空storeを用意できるがformatやrunだけの不整合は拒否。純粋なrestoreはpausedへ。本体での先行精算は§1参照 | [inspect](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/sail-voyage.ts#L174)、[restoreSailVoyage](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/sail-voyage.ts#L580) |

### 記録の上限と、在庫との違い

- 一般科学：終了要約64、稼働中runの観察64、要約内の観察8、committed 500、released 300（[SCIENCE_RECORD_LIMITS](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/science-records.ts#L7)）。
- 殻・縄・浸漬・帆の直近控え／終了要約は64件の窓を使う。窓を過ぎた古い指示の扱いも各部品の規則に従い、無期限の再送成功を保証しない。
- 荷重/5は生存ロットと設備部品として戻せるロットを保持する。消費済み・切断親の孤立checkpointは、最後に触れてから64取引世代以上経過し、走査対象になった時点で回収する。世代は新規荷重イベントで進み、通常走査は1取引最大8件、明示compactは全件を対象にする（[retention](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-load.ts#L65)）。
- これらは**記録の上限**。作った在庫ロット自体の個数と保存全体の大きさを一定にする保証ではない。在庫の増加は科学班の潮なし／潮あり1週間試験の結果で別に扱う。
- #83の浸漬記録・#88の作業場読取cacheは実行時の検証控え。保存JSONの新しい形式ではない。JSONを読み直した台帳は再検証する。

### 材料・設備の読取互換

| 対象 | 読み方 | 根拠 |
|---|---|---|
| PR20の繊維束 | 旧qualityのfiber/attached-pith別水分と、新codec_version:1の両方を検査して読む。読込だけで全量を新形式へ書き換えない | [coir-cord-lots:36](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-lots.ts#L36) |
| 撚り糸・縄 | cord_codec:1と隠れた強さ・傷みを保持 | [coir-cord-lots:55](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/coir-cord-lots.ts#L55) |
| 竹 | qualityなしの旧竹だけlegacy換算を使用。dry_mg・water_mg・length_mmを持つ竹はその値を検査し、量を読み替えない | [sail-lots:96](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/sail-lots.ts#L96) |
| 設備換算表 | 池 civ-sci.clay-pit/1、焼いた器 civ-sci.fired-pot-assembly/2、気密の器 civ-sci.pot-assembly/5。表の版は工程状態の版とは別 | [clay-pit](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/clay-pit.ts#L18)、[fired-pot-assembly](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/fired-pot-assembly.ts#L21)、[vessel](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/vessel.ts#L123) |

## 3. 一般ScienceStepの工程版と状態

mainの [index](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/index.ts#L1) に存在する工程だけを列挙する。科学側ブランチだけにある石灰・電気試験窯・試験片浸漬は含めない。

下表の工程版が古ければ本体の互換判定で中止される。現行工程版でも状態schemaが古ければ原則拒否。中止・failedでの無精算／予約解放は§1参照。

| 工程 | 現行工程版 | 状態schema | 定数・検査の根拠 |
|---|---|---|---|
| 秤量・試験片成形 | fixture-4 | civilization-simple-process/2 | [simple](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/simple.ts#L16) |
| 試験片乾燥 p12x | 0.3.1 | civ-sci.drying/3 | [drying](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/drying.ts#L27) |
| 試験片薪焼成 p13w | 0.1.5 | civ-sci.tile-wood-fire/2 | [wood-fire](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/wood-fire.ts#L23) |
| 試験気圧計 m02x | 0.1.3 | civ-sci.air-barometer/3 | [barometer](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/barometer.ts#L32) |
| 自作気圧計 m03x | 0.2.2 | civ-sci.air-barometer-pot/4 | [barometer-pot](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/barometer-pot.ts#L43) |
| 竹筒 p18x | 0.1.1 | civ-sci.bamboo-tube/1 | [bamboo-tube](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/bamboo-tube.ts#L19) |
| 粘土浸漬 p10x | 0.1.5 | civ-sci.clay-slake/2 | [slake](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/slake.ts#L32) |
| 粘土練り p10y | 0.1.1 | civ-sci.clay-knead/1 | [knead](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/knead.ts#L18) |
| ヤシミルク p30x | 0.1.0 | civ-sci.coconut-milk/1 | [coconut](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/coconut.ts#L32) |
| ヤシ油煮出し p31x | 0.1.3 | civ-sci.coconut-boil/2 | [coconut](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/coconut.ts#L33) |
| 炭・タール p14x | 0.1.3 | civ-sci.charcoal-retort/2 | [charcoal](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/charcoal.ts#L34) |
| タール封止 p16x | 0.1.5 | civ-sci.vessel-seal/3 | [vessel](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/vessel.ts#L35) |
| 漏れ試験 p17x | 0.1.5 | civ-sci.vessel-leak/2 | [vessel](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/vessel.ts#L36) |
| 薪乾燥 p15x | 0.1.1 | civ-sci.firewood-dry/1 | [firewood](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/firewood.ts#L25) |
| 器成形 p11y | 0.1.0 | civ-sci.pot-shape/1 | [pottery](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/pottery.ts#L27) |
| 器乾燥 p12y | 0.1.2 | civ-sci.pot-dry/1 | [pottery](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/pottery.ts#L28) |
| 器野焼き p13y | 0.2.1 | civ-sci.pot-pit-fire/3 | [pit-fire](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/pit-fire.ts#L40) |
| 油の灯り p40x | 0.2.0 | civ-sci.oil-lamp/3 | [oil-lamp](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/oil-lamp.ts#L52) |

共通の拒否は工程版違いが `unknown processVersion`、同baseの古いschemaが `unsupported-state-schema`。simpleは独自の `unsupported-version` / `unsupported-schema`（[common](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/common.ts#L19)、[simple](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/simple.ts#L46)）。

**明示的な例外は竹筒の0.1.0**。同じ/1状態を元の工程版で継続でき、カタログも互換版として認識する。0.1.0を名前だけ0.1.1へ書き換える必要はない（[bamboo-tube](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/step/bamboo-tube.ts#L19)、[catalogの互換版](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/world/process-catalog.ts#L206)）。

## 4. prototypeの内部状態（台帳の版とは別）

| 内部状態 | 形式と読取の境界 | 根拠 |
|---|---|---|
| 殻分離の中核 | prototype-manual-husk-separation/1。配分表・context・入力のbindingを照合 | [manual-husk-separation](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/manual-husk-separation.ts#L114) |
| 縄製造の中核 | prototype-coir-cord/3。中核restore自体に/1・/2の移行はない。world側旧host移行と混同しない | [coir-cord](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/coir-cord.ts#L99) |
| 縄の傷み | 旧factoryのprototype-coir-cord-damage/1と整数factoryの/2は別。対応schema・policyだけを読む | [coir-cord-damage](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/coir-cord-damage.ts#L55) |
| 帆の製造 | 旧履歴型prototype-sail-manufacture/1はlegacy factory。compact /2と残水比例dry /3はそれぞれ対応policyで読む | [sail manufacturing](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/sail-raft-manufacturing.ts#L367) |
| 帆走 | 現行checkpointはprototype-sail-raft-checkpoint/2。assumption・binding・整数policyを照合。旧full replay prototype-sail-raft/1は別factory | [checkpoint](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/sail-raft-checkpoint.ts#L92)、[legacy replay](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/sail-raft-voyage.ts#L324) |
| むしろの傷み | prototype-sail-wear/1、bindingを照合 | [sail wear](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/sail-raft-voyage.ts#L367) |
| 殻浸漬の計算 | 中核に独立した保存schemaはなく、world側状態からprojectionを計算。assumption IDとhost版で区別 | [husk soak](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/src/science/prototypes/husk-soak.ts#L5) |

## 5. 既存検査と、今回未実行の実保存確認

### 合成fixture・差分検査への入口

以下は対象mainに存在する検査。任意の旧実保存を渡す入口ではない。

| 対象 | 既存スクリプト・主な確認点 |
|---|---|
| 旧棚→lab、save→load→save | [save-migration-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/save-migration-check.ts#L37)：storeのみ／labのみ／両方あり／粘土だけのlab。固定日時・seed7 |
| 一般科学の古い終了run | [science-records-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/science-records-check.ts#L141)：無消費・時計とID不変、再移行、不正要約拒否 |
| 殻の段取り/2 | [manual-husk-records-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/manual-husk-records-check.ts#L130)：途中／完了、65件超の要約化、版名付け替え拒否 |
| 縄の段取り/2 | [coir-cord-work-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/coir-cord-work-check.ts#L257)：旧projection・ロット・ID維持、再開して旧コードと比較 |
| 荷重/3・/4→/5 | [cord-load-compaction-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/cord-load-compaction-check.ts#L100)：傷み・切断・ID・再送、/4移行、孤立回収、1000本の縒り合わせ |
| 旧浸漬host-1・host-2 | [husk-soak-records-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/husk-soak-records-check.ts#L170)：旧途中／終了、元の吸水の速さ、来歴保持、版名付け替え拒否 |
| 帆host-1・旧dryhost-2 | [sail-work-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/sail-work-check.ts#L510)：旧checksum検査、旧dryの2日保持、新dryとのpolicy分離 |
| 各hostの実際の復帰 | husk-host-check、cord-host-check、sail-host-check、sail-voyage-host-check。航海は最後のセルで終了・部品返却 |
| 工程の旧状態拒否 | science-wet-wick-check、science-barometer-pot-check、science-pit-fire-check、science-vessel-check等 |
| 竹筒の互換再開 | [sail-lots-check](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/sail-lots-check.ts#L375)：品質なし竹の結果、旧0.1.0状態の再開とcatalog alias |

通常の検査入口は `npm run check:fast` / `npm run check:slow`。分類は [manifest](https://github.com/ynatsume-source/3dproject/blob/1a2ce4e57537e36ff3b3c78054fd22becde3af1a/scripts/check-manifest.mjs#L1) を正とする。個別例：

```sh
node --import tsx --import ./scripts/node-assets.mjs scripts/save-migration-check.ts
```

### science/reviewsにある実保存

参照を固定したscience/reviews先頭：`84318ea4708837d2f5fc7b358fe89c8706cfe928`。treeで確認した保存ファイルは次の2本。**圧縮本文の取得・展開・実行は今回未実施**。SHAはGit blob SHAで、SHA256ではない。

| 実保存 | 出自の記録 | Git blob SHA / 圧縮サイズ | 既存runner |
|---|---|---|---|
| [save-old-fcfbf8e.json.gz](https://github.com/ynatsume-source/3dproject/blob/84318ea4708837d2f5fc7b358fe89c8706cfe928/soak/2026-10-20-c091813/save-old-fcfbf8e.json.gz) | 名前がmain fcfbf8e由来と表す。内部の出自は未検証 | 709cfe2bee3ff5ad0dd25803ff82fb12f644d828 / 66,418 B | [soak2.ts](https://github.com/ynatsume-source/3dproject/blob/84318ea4708837d2f5fc7b358fe89c8706cfe928/soak/2026-10-20-c091813/soak2.ts#L34) |
| [save-slow-12-04T15.json.gz](https://github.com/ynatsume-source/3dproject/blob/84318ea4708837d2f5fc7b358fe89c8706cfe928/soak/2026-10-21-island-3d3e78f/save-slow-12-04T15.json.gz) | 同ディレクトリREADMEはmain 3d3e78fの実島テスト保存と説明 | a778f0ad86eb883f774355b4559352bcae1232a5 / 74,528 B | [soak-island.ts](https://github.com/ynatsume-source/3dproject/blob/84318ea4708837d2f5fc7b358fe89c8706cfe928/soak/2026-10-21-island-3d3e78f/soak-island.ts#L35) |

両runnerは `SOAK_IN` / `SOAK_OUT` / `SOAK_HOURS` / `SOAK_CLOSE` を読み、seed11・2026で固定する。入力はgzipではなく展開済みJSON `{ now, store }`。対象mainの隔離worktreeの `scripts/` にrunnerを一時コピーする（相対import `../src`、島版の `./node-land` を解決するため）。JSONを別ファイルへ展開してから使う。手順例は未実行：

```sh
SOAK_IN=/tmp/save-old.json SOAK_OUT=/tmp/save-current.json SOAK_HOURS=0 SOAK_CLOSE=0 \
node --import tsx --import ./scripts/node-assets.mjs scripts/soak-migration-review.ts
```

`scripts/soak-migration-review.ts` は上記runnerの一時コピー名で、今回追加するファイルではない。まず0時間で読込・再保存を比較し、その後に12時間などの運転と閉じ直しを試す。

**runnerの終了コード0だけを合格にしない。** 更新例外をerrors[]に集めても非0終了にしないため、errors・huskDev・cordDev・sailDevと出力保存を別に確認する。stdoutには内部qualityも含み得る。レビュー証拠は必要な集計に絞り、住人への観察には渡さない。


### 10/24追加：1週間運転後の実保存

参照を固定したscience/reviews先頭：`0fb9cf218a8ae6f0ee70898cf41f7b3b1100c48b`。科学班はmain `87d65b5` を1週間動かした保存を追加した。上の旧形式2本に加え、記録が埋まった状態での復帰・保存サイズ・性能の確認に使う。以下のGit blob SHAと圧縮サイズはtreeで確認。**Codexによる圧縮本文の展開・読込は未実施**。

| 実保存 | 条件 | Git blob SHA / 圧縮サイズ |
|---|---|---|
| [flat-save-day7.json.gz](https://github.com/ynatsume-source/3dproject/blob/0fb9cf218a8ae6f0ee70898cf41f7b3b1100c48b/soak/2026-10-24-week-87d65b5/flat-save-day7.json.gz) | main 87d65b5、潮なし、7日目 | 160be3faf948ab67185396197e2f0d969766f363 / 95,751 B |
| [tide-save-day7.json.gz](https://github.com/ynatsume-source/3dproject/blob/0fb9cf218a8ae6f0ee70898cf41f7b3b1100c48b/soak/2026-10-24-week-87d65b5/tide-save-day7.json.gz) | main 87d65b5、潮あり、7日目 | fd43166ac2a8fc2280170e18027e8e26f44325c8 / 93,445 B |

このディレクトリにはREADME・時刻ごとのJSONL・stdout・保存があり、週次実行に使ったrunner自体は含まれていない。READMEは `scripts/soak-island.ts` と `SOAK_TIDE=1` を記すが、上の旧runnerへの潮設定の対応まで今回検証していない。週次保存を再生するときは、科学班が使用したrunnerの固定版・seed・依存関係を記録して実行する。ファイル名からgzip内部が旧runnerと同じ包絡だと断定しない。

### 実保存確認時の観点（科学班の実施記録は§7）

- [ ] 原本の出自commit・Git blob SHAまたはSHA256・実行対象commit、Node・依存関係・seed、実コマンドと終了コードを記録する。
- [ ] 読込→保存→再読込で内部schemaを列挙し、2回目は同じ変換を繰り返さない。
- [ ] ロットID・材料・乾物・水・来歴、隠れた傷み／強さ、seqと世界IDを比較する。単なる保存byte列比較と、意図した記録削減は分ける。
- [ ] 途中run、予約、設備部品を確認する。旧一般工程が中止された場合は、材料未消費・予約解放を確認する。hostのcatch後に移行失敗ログや孤立予約が残らないかも見る。
- [ ] 手仕事・航海は閉じていた時間を加算しない。待機は本体が確定した浸漬・屋根の区間だけを渡す。再送が窓内で二重精算にならない。
- [ ] 旧浸漬host-1/2と引き上げた殻、荷重/3と/4、殻arrangement/2、縄arrangement/2、帆host-1、旧dryhost-2、現行航海を含むか確認する。上記4本で網羅できない経路は既存合成fixtureで補い、未網羅を明記する。
- [ ] 読取cacheは再保存されないこと、保存サイズは記録と在庫を分けて集計する。性能を測る場合は記録上限まで埋まった保存を使う。
- [ ] mainが進んだ場合、保存読込・host・工程版・換算表の差分を確認してからリハーサル対象commitを固定する。

## 6. 科学班の1週間試験と容量見積もり（10/24受領）

出典：[README](https://github.com/ynatsume-source/3dproject/blob/0fb9cf218a8ae6f0ee70898cf41f7b3b1100c48b/soak/2026-10-24-week-87d65b5/README.md)、[潮なしの時刻別出力](https://github.com/ynatsume-source/3dproject/blob/0fb9cf218a8ae6f0ee70898cf41f7b3b1100c48b/soak/2026-10-24-week-87d65b5/flat-hours.jsonl)、[潮ありの時刻別出力](https://github.com/ynatsume-source/3dproject/blob/0fb9cf218a8ae6f0ee70898cf41f7b3b1100c48b/soak/2026-10-24-week-87d65b5/tide-hours.jsonl)。実行したのは科学班で、対象はmain `87d65b5`、78時間 → 閉じて12時間 → 78時間。Codexは公開されたREADMEと各158行のJSONLを読み、7日目の値と、全行でerrorsが0であることを静的に照合した。main `1a2ce4e` での再実行や保存本文の検査をしたという意味ではない。

| 条件 | 7日目のsaveKB（出力の表記） | 在庫ロット | 縄 | JSONLのerrors最大 |
|---|---:|---:|---:|---:|
| 潮なし | 839 | 126 | 23本 | 0 |
| 潮あり | 776 | 121 | 33本 | 0 |

科学班の整理では、大きな記録はhuskSoakRecords.finished・cordArrangement.finished・各receiptsの64件の窓で頭打ちになる。一方、READMEは今回の伸びの鈍化に**代わりの頭で材料が尽きた影響もある**と注記する。本物のLLMで材料が入り続ける場合まで、保存全体が一定になるとは判断しない。

縄1本あたり約4〜5 KB、coirCordLoads約100 KB、1か月1.0〜1.3 MB・2か月1.5〜1.8 MBは**科学班による見積もり**で、1〜2か月運転した実測ではない。12月までに急ぎの容量対策は不要という科学班の判断を受け、今回保存や在庫を削除するコードは追加しない。実機リハーサルでは実際のstorage使用量・保存成否も確認する。

husk_drainage_water 7〜13ロット、coir_pith 9〜14ロットの蓄積は任意の設計相談として残す。環境への移動・分解の規則を採択するまでは、経過時間だけで在庫を削除しない。

## 7. 科学班による旧保存4本の読込・運転結果

記録の正は[科学班のPRコメント](https://github.com/ynatsume-source/3dproject/pull/108#issuecomment-6383188374)。実行主体は科学班、対象mainは `90ae7cac46b4a0c461b95c922da183c5bd3e7dd3`、入口は `scripts/soak-island.ts` の `SOAK_IN`、条件は**12時間閉じてから3時間運転**。[README](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/README.md)と[証拠ディレクトリ](https://github.com/ynatsume-source/3dproject/tree/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves)を、science/reviews `14c3cb396480c8ac7a100c82630171818f4188fd` に固定して参照する。

Codexは公開ログを静的に照合し、4本とも `.exit` が0、`.out` のerrorsが空、`.hours` の各4行でerrorsが0であることを確認した。Codex自身が旧保存を読込・運転したという意味ではない。

| 入力名（科学班の実行環境での表記） | 作成元 | errors / 終了コード | 保存KB：最初 → 3時間後（出力表記） | 証拠 |
|---|---|---|---|---|
| `soak2/save-old.json` | #70より前 | 0 / 0 | 758 → 444 | [out](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak2_save-old.json.out)・[hours](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak2_save-old.json.hours)・[exit](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak2_save-old.json.exit) |
| `soak2/save-new.json` | #70〜#72の頃 | 0 / 0 | 450 → 515 | [out](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak2_save-new.json.out)・[hours](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak2_save-new.json.hours)・[exit](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak2_save-new.json.exit) |
| `soak-174fc32/save-b.json` | main 174fc32 | 0 / 0 | 815 → 857 | [out](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak-174fc32_save-b.json.out)・[hours](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak-174fc32_save-b.json.hours)・[exit](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/soak-174fc32_save-b.json.exit) |
| `week/flat/save.json` | main 87d65b5の1週間 | 0 / 0 | 839 → 896 | [out](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/week_flat_save.json.out)・[hours](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/week_flat_save.json.hours)・[exit](https://github.com/ynatsume-source/3dproject/blob/14c3cb396480c8ac7a100c82630171818f4188fd/reviews/rehearsal-1-90ae7ca/old-saves/week_flat_save.json.exit) |

上表の入力名は科学班の実行環境内の名前であり、§5の公開gzip4本とは同じ集合ではない。入力保存本文はこの証拠ディレクトリに含まれず、公開gzipとのハッシュ対応は未照合。週次の潮あり保存を今回再読込したとは記録されていない。

#70より前の758 → 444 KBについて、科学班は記録の上限への移行による縮小と説明している。ログの値は3時間の運転も含むため、読込直後だけの移行前後を比較した数値とは区別する。`soak2_save-new.json.out` のhuskDevには、水不足による打撃試行拒否が2件記録されている。errors 0を「すべての開発診断が空」とは読み替えない。

証拠のGit blob SHA（SHA256ではない）：

| 証拠ファイルのstem | .out | .hours |
|---|---|---|
| `soak2_save-old.json` | `b1e49f289985a303c3a193e22fc9f6ff7eea18d9` | `e0072ec3cfe7774f627981f853506b353e076aae` |
| `soak2_save-new.json` | `b2368cf4674b4e16df037823942c455710d99689` | `70204d5f51f39f473bb3c386c42a375332a64e7a` |
| `soak-174fc32_save-b.json` | `13ed03a1903add962acdf51cde05eed961cd4eef` | `6dc3dedf00d47d995a584cf78a0815213c47b7ce` |
| `week_flat_save.json` | `a67882303494ed1cc08be33fb67d291de88d1a5b` | `c5ffb8854341c927115aeaa0888aea652dd90d66` |

4本共通の `.exit` blob SHA：`573541ac9702dd3969c9bc859d2b91ec1f7e6e56`。

この証拠には実コマンド全文、seed・Node・依存関係、移行前後の全材料・予約の差分は含まれていない。**確認済みの範囲は、上記main・入力4本・条件で読めて運転でき、記録されたerrorsが0だったこと**。§5の個別不変条件を全件照合済みとする承認や、あらゆる旧形式・破損保存の互換保証へ広げない。

### 副産物の規則に関する科学班の判断

同じPRコメントで、絞り水は地面に広がったと確定したものを空気・地面へ記帳して減らし、髄の乾物は地表有機物として地面へ移す方向を受入。置かれ方不明・容器内・予約中のロットは保持する。

実装は12月本番の後に扱い、速さを版付きの仮定（キメ値）として科学班と決める。今回、処理コードや保存形式は追加・変更しない。

## 8. リハーサルまでの残件

科学班の旧保存4本の読込・運転結果は§7で受領済み。リハーサルでは対象commitを固定し、その後に保存・時計・科学の変更が入れば差分を確認する。

prototypeのrestore拒否をhostがcatchした後の予約、灯皿を含む設備の換算対象、実保存で網羅できない旧形式など、公開証拠で個別に検証されていない観点は残す。今回、それらに対する新しい修正や未再現の不具合認定は行っていない。

1週間試験の容量見積もりは§6で受領済み。副産物の処理は§7の方針どおり12月本番の後に相談し、在庫の傷み・使い道の変更も別に判断する。11/6・11/7までにコードや保存形式が変わった場合は、固定対象と差分を更新する。
