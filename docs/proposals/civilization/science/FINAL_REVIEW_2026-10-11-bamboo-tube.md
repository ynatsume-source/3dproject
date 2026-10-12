# 本体側の最終レビュー依頼：竹の管と天気の壺

2026-10-11 / ブランチ `codex/civilization-simulation`（ae9bd08） / レビュー方針 [REVIEW_POLICY.md](REVIEW_POLICY.md)

**main に統合済み（8d14219、2026-10-11）**：科学側のファイルはそのまま（科学側で一致を確認）。古い run の中止・予約解放、/4→/5 の換算し直し、assembly-check の修正、管 350 mm・水 250 mL、気温の記録と言葉はすべて依頼どおり。島の中で乾留炉から天気の壺の読み取りまで通ることを本体が確認。

**Codex の確認はすべて終わっていて、A/B は残っていない。** 全面レビュー（475c7ff、A 1件：BW-A1、C 2件）→ 修正（ae9bd08）→ 確認で BW-A1・BW-C1 が解消し、m03x 0.2.1 の保留が解除された。Codex は、前回の最小診断（係数比 1、48 時間後 11 目盛り）、欠測の幅、旧 0.2.0・/3 の拒否、/4 の JSON 復元、旧 U 字の 64 条件・856 要求の厳密一致（`leakK` を含む）、水の量の上限ちょうどの受付と +1 mg の拒否、公式 57 件・型検査・ビルドを確認した。

島に管がないための作業。オーナー決定（2026-10-10、すべておすすめ）：竹の管を作る、形は「天気の壺」。設計 [BAMBOO_TUBE_DESIGN.md](BAMBOO_TUBE_DESIGN.md)、手順書 [BAMBOO_TUBE_HANDBOOK.md](BAMBOO_TUBE_HANDBOOK.md)。

| もの | 版 |
|---|---|
| 竹から管を切り出す `p18x_bamboo_tube` | 新規 **0.1.0**（状態 `civ-sci.bamboo-tube/1`、接続仕様 0.1.x / 0.2.x、世界の時計） |
| タールで封じる `p16x_vessel_tar_seal` | 0.1.4 → **0.1.5**（`bamboo_tube` も栓に通す） |
| 水の試験 `p17x_vessel_leak_test` | 0.1.4 → **0.1.5** |
| 気密の器の換算表 | `civ-sci.pot-assembly/4` → **/5**（竹の管の器は `tubeForm: 2`・`tubeOuterMm`・`bulbHeatJPerK`。U 字の管の器は同じ値） |
| 自作の気圧計 `m03x_air_barometer_pot` | 0.1.2 → **0.2.1**（天気の壺。状態 `civ-sci.air-barometer-pot/4`。U 字の管は 0.1.2 と同じ読み） |
| 材料 | `bamboo_tube`（`bore_mm`・`length_mm`・`outer_mm`） |

## 統合してほしいもの

| ファイル | main との関係 | 内容 |
|---|---|---|
| `src/science/step/bamboo-tube.ts` | 追加 | p18x |
| `src/science/step/vessel.ts` | 変更 | p16x・p17x 0.1.5、換算表 /5、`BAMBOO_TUBE` |
| `src/science/step/barometer-pot.ts` | 変更 | m03x 0.2.1 |
| `src/science/params.ts` | 追加のみ（14行） | `bamboo*`・`jointLeakBambooFactor`・`weatherPot*`（すべて assumed） |
| `src/science/step/index.ts` | 1行＋import | `[BAMBOO_TUBE_PROCESS.processId]: bambooTubeStep` |
| `data/science/catalog-test-2.json` | 科学側の版をそのまま | `bamboo_tube`、p18x、p16x・p17x・m03x の版と注記、`bamboo` の注記 |
| 検査 | `science-barometer-pot-check.ts`・`science-vessel-check.ts`・`science-fired-pot-assembly-check.ts` | 57・53・26件（後の2つは換算表の版の1行） |

## 本体側でやること・守ること（Codex の確認と、本体とのやりとりから）

- **旧い run（ここで接続を確認してほしい）**：m03x 0.1.x・0.2.0（状態 /1〜/3）、p16x 0.1.4、p17x 0.1.4 の run は版で拒否される。**読み込み時に中止して予約を解放する**。版名や状態の名前を付け替えて再開しない（0.2.0 の状態は漏れの係数 `leakK` を保存していて、それが小さすぎる）。換算表 /4 で組んだ設備は /5 で換算し直す（U 字の管の器は値が同じ）。
- **`scripts/assembly-check.ts`**：102 行と 182 行の `'civ-sci.pot-assembly/4'` を `/5` に（予行で確認：直せば全件成功）。管つきの器のケースに、竹の管（`tubeForm: 2`・`tubeOuterMm`・`bulbHeatJPerK` が付く）を足すとよい。
- **竹の管（p18x）**：棚の竹（約 30 kg）から、`cut` の `lengthMm` を **350**（本体で決定。節の間の上限 400）。1本は約 20〜25 g。10% は縦に割れて管にならず、竹が全部戻る（作り直す）。手の仕事 10 分。
- **封じる（p16x 0.1.5）**：**新しい 0.5 L の壺**を作り、竹の管を通して封じる。今ある封じた壺（705 分）は使わない（開ける工程がない）。「管を通して封じた壺がまだなければ作る」に条件を変える。竹の管の継ぎ目は試験用の管の 2 倍漏れる（仮定）。
- **天気の壺（m03x 0.2.1）**：
  - 設備：竹の管つきの封じた壺（換算表 /5）＋本体が足す `markMm`（浮き棒の目盛り、5 mm）。
  - 水：雨水の真水ロットから **250 mL**（0.5 L の壺なら 152〜300 mL。上限ちょうどは受け付ける）。終わりにそのまま返る。あふれた分は `released`（`to: 'ground'`）として記帳する。
  - 気温・気圧：島の観測記録の実測値だけを送る。欠けた区間は送らない（科学側で幅を持ち、読めないときは数字を返さない）。
  - 読みの記録：本体ですでに入れたとおり（main 88e1e53）、目盛りと一緒に実測の気温を記録に残し、欠けた時間は「不明」。住人の日記には目盛りと体で感じる言葉だけ。気温が「不明」の時間は言葉も付けない。
  - 天気の壺は温度計でもある（日陰で 1 °C あたり約 1 cm）。30 hPa の低下で、漏れのない壺なら約 10 cm 上がる。漏れのある壺（例：τ 2,595 分）は、下がっている間だけ上がり、止まると戻る。
  - 言葉：管の上からあふれた（地面へ）、外の空気が泡になって壺に入った。どちらも置き直すまで言葉だけ。

## 統合の予行（科学側で実施）

main `88e1e53` を一時ディレクトリに展開し、上のファイルを置き、`index.ts` に1行を足して確認した（作業後に削除）。

| 確認 | 結果 |
|---|---|
| 型検査・`npm run build` | 成功 |
| 自作の気圧計・気密の器・焼いた器の換算・野焼き・灯り・炭・薪・粘土の下ごしらえ・器 | 57・53・26・51・47・39・31・64・41件成功 |
| main の `science-integration-check` | 93件成功 |
| main の `process-runner`・`island-science`・`pottery-host`・`clay-chain`・`oil-chain`・`tar-chain`・`lamp`・`lab` | 成功 |
| main の `assembly-check` | 換算表の版の決め打ち（102・182 行の `/4`）で2件失敗 → `/5` にすれば全件成功 |

実行していないもの：本体の工程一覧への登録（p18x、天気の壺）、通しの暮らし、画面での確認。

## 次の全面レビューへ回すもの（非保留の C）

- BW-C2 と既存の C（Codex の引き継ぎ）。U 字の管の下側の言葉（外の空気が入るはず、m02x も同じ）。SB-C3。
- 一次資料 5 件は取り込み案（すべて calibrationEligible: false）。竹の種類・内径・割れやすさ、天気の壺の係数はすべて仮定のまま。
