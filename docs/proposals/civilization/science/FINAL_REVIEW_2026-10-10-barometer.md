# 本体側の最終レビュー依頼：自作の気圧計（住人の壺＋試験用の管＋水）

2026-10-10 / ブランチ `codex/civilization-simulation`（93ac6cc） / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**main に統合済み（1535d5d、2026-10-10）**：科学側のファイルはそのまま（科学側で一致を確認）。本体は `markMm` 5 mm を管つきの器にだけ足し、`released` を帳簿の「工程が手放した分」（run・工程・時刻・材料・mg・行き先）に精算時に記帳、旧い版の run は読み込み時に中止・予約解放、/3 の設備は /4 で換算し直し、`assembly-check` を /4 に（管あり／なしのケースを追加）。m03x は工程の一覧に登録済みだが、島で `p16x` が木タール待ちのため ready: false。

**Codex の確認はすべて終わっていて、A/B は残っていない。** 全面レビュー（7f4d1e3、SB-A1〜A4）→ 修正（7318506）→ 確認（追加 A：FX-SB-A1）→ 修正（93ac6cc）→ 確認で m03x 0.1.2 の保留解除。p16x 0.1.4 は 7318506 の確認で保留解除済み。

住人が封じた壺に試験用の既製の管を通して水を入れると、気圧計になる。よく封じた壺は試験用の気圧計に近い読み、漏れる壺は「気圧の高さ」ではなく「変わる速さ」を示す（手順書 §4）。

| もの | 版 |
|---|---|
| 自作の気圧計 `m03x_air_barometer_pot` | 新規 **0.1.2**（状態 `civ-sci.air-barometer-pot/2`、接続仕様 0.1.x / 0.2.x、島の時計） |
| タールで封じる `p16x_vessel_tar_seal` | 0.1.2 → **0.1.4**（任意で `gauge_tube_test` を栓に通す、`seal` の `params.jointTarG`。状態 `civ-sci.vessel-seal/3`） |
| 水の試験 `p17x_vessel_leak_test` | 0.1.3 → **0.1.4**（空気を保つ時間が器の大きさと継ぎ目の漏れで決まる） |
| 気密の器の換算表 | `civ-sci.pot-assembly/3` → **/4**（管つきの器は `tubeBoreMm`・`tubeLengthMm`・`bulbTauS` も。`airLeakTauMin` は大きさと継ぎ目を含む式） |
| 試験用の気圧計 `m02x` | 版は同じ（`Geometry`・`SPILL_NOW`・`SPILLED` を export しただけ） |
| 材料 | `gauge_tube_test`（試験用の既製の管：内径 1〜30 mm、全長 100〜3000 mm） |

手順書：[SELF_BAROMETER_HANDBOOK.md](SELF_BAROMETER_HANDBOOK.md)（§7 が修正）・設計と決定 [SELF_BAROMETER_DESIGN.md](SELF_BAROMETER_DESIGN.md)。

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/barometer-pot.ts` | 追加 | m03x |
| `src/science/step/barometer.ts` | 変更（export 3つ） | 動きは同じ |
| `src/science/step/vessel.ts` | 変更 | p16x 0.1.4・p17x 0.1.4・換算表 /4・`GAUGE_TUBE`・`airLeakTauMin` |
| `src/science/params.ts` | 追加のみ | `jointLeakBase`・`jointLeakFloor`・`jointTarColdPerG`・`jointTarWarmPerG`（すべて assumed） |
| `src/science/step/index.ts` | 1行＋import | `[BAROMETER_POT_PROCESS.processId]: barometerPotStep` |
| `data/science/catalog-test-2.json` | 科学側の版をそのまま | m03x、`gauge_tube_test`、p16x・p17x の版と注記 |
| 検査 | `science-barometer-pot-check.ts`（追加）・`science-vessel-check.ts`・`science-fired-pot-assembly-check.ts`（換算表の版の1行ずつ） | 35・53・26件 |

新しい資料（sources.json）はない。

## 本体側でやること・守ること（Codex の確認から）

- **設備**：`assembled_pot` の params は換算表 /4 の `potToEquipmentParams` に、本体が彫った目盛りの棒の `markMm` を足す。管のない器・`airtightKnown` 0 の器・`airLeakTauMin` のない器は m03x が断る。日陰に置く前提。
- **入力**：管の水 `process_water`（両方の脚の真ん中まで入る量以上：8 mm・600 mm なら 15.1 mL）。終わり（`take_out`・`stop`）に残りの水が元の場所へ返る。あふれた分は `released`（`to: 'ground'`）で、地面への流出として記帳する。
- **操作**：`read_gauge`（目盛り）・`take_out`。合わせ直しは住人のノートの仕事（世界は何もしない）。あふれた・空気が抜けた後は、置き直す（新しい run）まで言葉だけ。
- **天気**：気温・気圧は測った値だけを送る。分からない区間は `unknown`（気候の仮定を入れない）。読めない区間・あふれを否定できない区間は数値なし。
- **30 秒の気圧保持**：読み・あふれ・漏れ・精算は、30 秒のセルを決めたときの気圧で行う（手順書 §7 の適用範囲）。本体が別の時刻の気圧で目盛りを計算し直さない。
- **版**：
  - m03x の旧い run（0.1.0・0.1.1）は、状態が同じ `/2` でも版で拒否される。**中止して予約を解放する**（版名を付け替えて再開しない）。
  - p16x 0.1.2（main の現行）・p17x 0.1.3 の run も版で拒否される（同じく中止して解放）。
  - 換算表 `pot-assembly/4` を記録する。既にある設備の params は版名だけ付け替えず、本体の組み立て方針どおり換算し直す（管のない 500 mL の試験器は値が同じ。住人の器は `airLeakTauMin` が大きさで変わる）。
  - main の `scripts/assembly-check.ts` 100 行は `'civ-sci.pot-assembly/3'` を決め打ちしているので `/4` に。
- **読みの報酬**：目盛りは住人に見える数（整数の目盛り）。器の空気の量・器の温度の幅（`diagnostics`）は世界用で、住人には言わない。

## 統合の予行（科学側で実施）

main `d3e321f` を一時ディレクトリに展開し、上のファイルを置き、`index.ts` に1行を足して確認した（作業後に削除）。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 自作の気圧計・気密の器・焼いた器の換算・灯り・器・野焼き・炭・粘土の下ごしらえ・薪 | 35・53・26・47・41・32・39・64・31件成功 |
| main の `science-integration-check` | 93件成功 |
| main の `process-runner`・`island-science`・`pottery-host`・`clay-chain`・`oil-chain`・`lamp-check` | 成功 |
| main の `assembly-check` | 換算表の版の決め打ち（100 行の `/3`）で1件失敗（params は正しい） → `/4` にすれば全件成功 |

実行していないもの：本体の工程の一覧への登録、画面での確認、気圧計を住人の暮らしの中で回すこと、`npm run sim`。

## 次の全面レビューへ回すもの（非保留の C）

- 気圧計：SB-C3（1 秒の標本の間の約 1 nm の山）、7f4d1e3 の C（継ぎ目タールの日なた、瞬間の大きな気圧変化での流出量、1 mg 管の ppm、短い τ）。
- 30 秒保持の近似の説明（手順書 §7）は、実物の管の口での連続した安全を保証しない。係数（`airLeakRefH`・`joint*`）はすべて仮定で、校正していない。
