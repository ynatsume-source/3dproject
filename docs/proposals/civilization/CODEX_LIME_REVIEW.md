# Claudeの石灰工程・結果検査・熱化学資料のレビュー

2026-10-03 JST。主対象は科学ブランチ `6731f11b19d5c207bce95e8589f924fa7651b7a1`。
追加で、検証画面の取り込み `4a495691f46fa4733514ca53b49999e4ab8acdfd` を確認した。
科学側の実装は変更せず、隔離したdetached worktreeで検証した。

## 結論

分担と出典の照合は確認できた。既存の検査は成功したが、本体へ石灰工程や結果検査を接続する前に
次の5件を修正・再検査する必要がある。特に最初の2件は、正常な有限数の入力で再現する。
`4a49569` は検証ツールと記録検査の更新であり、以下の実装は `6731f11` と同一。

### R1 / P1: 30秒未満の区間分割で利用できる熱と温度が変わる

対象: [lime.ts L94–119](https://github.com/ynatsume-source/3dproject/blob/6731f11b19d5c207bce95e8589f924fa7651b7a1/src/science/step/lime.ts#L94-L119)

同じ4000 W相当の供給を30秒間与えても、`[0,30000)` 一回では使用熱120000 J・炉温33°C、
1秒×30回または29秒＋1秒では4000 J・25.2666667°Cになる。総供給上限はどちらも120000 J。
いずれも `validateResult` の違反は0件。

`budget` が各リクエストの `maxJ` に戻る一方、積分は30秒目にだけ進むため、
それまでの区間の供給が使われず、最後の1秒の供給だけで30秒分を計算している。
停止・再開や世界の更新頻度で結果が変わり、契約の区間加法性を満たさない。
既存の焼成分割テストは境界がすべて30秒の倍数なので、このケースを通らない。

各区間の供給・環境が有効だった時間を保存・積分し、報告するJも該当区間の上限内に収める必要がある。
過去の未使用offerを後の区間で無断消費する修正は避ける。
1秒、29秒＋1秒、弱い供給、天候切替を回帰検査に加えてほしい。

### R2 / P1: 水不足の消化で負の水量となり、結果を返さず例外が出る

対象: [lime.ts L248–252](https://github.com/ynatsume-source/3dproject/blob/6731f11b19d5c207bce95e8589f924fa7651b7a1/src/science/step/lime.ts#L248-L252)

純CaO 56080 mg＋水9000 mg、25°C、桶の熱容量400 J/K・損失係数1.5 W/K、12時間で
`addComp: negative water (-1 mg)` が出る。水10000 mg、12000 mgでも同じ。
水不足はモデルが扱う通常のケースなので、世界側へ返す結果がなくなるのは不具合。

反応進行度側はCaOのモル質量56.08を使うが、精算の `react` は `chem.ts` の原子量から
56.077を使い、さらに反応量をmgへ丸める。進行度で水を制限しても、精算時の消費水が残量を超える。
モル質量の定義を統一し、整数化した反応量も利用可能な水量から制限してほしい。
負値を0へ丸めて質量収支だけを合わせるのではなく、消費・生成と反応熱を整合させる必要がある。

### R3 / P2: 炉の熱容量0を受理し、Infinityを含む状態を返す

対象: [lime.ts L66–69](https://github.com/ynatsume-source/3dproject/blob/6731f11b19d5c207bce95e8589f924fa7651b7a1/src/science/step/lime.ts#L66-L69)

`heatCapJPerK: 0` は `>= 0` の検査を通るが、L116で分母になる。
通常の30秒入力で `status: running`、`state.data.chamberC: Infinity` を返し、
`validateResult` も違反0件になる。JSON保存ではInfinityがnullになり、状態の復元も壊れる。

少なくとも分母となる炉の熱容量は有限かつ正を要求し、その他の設備値・環境値・供給量も
それぞれの意味に応じた有限性・範囲を検査してほしい。
復元されたScienceStateの数値検査は、そのschemaを知る科学側で行う必要がある。

### R4 / P2: validateResultが不正な時刻・負の供給使用量を通す

対象: [validate.ts L17–18](https://github.com/ynatsume-source/3dproject/blob/6731f11b19d5c207bce95e8589f924fa7651b7a1/src/science/step/validate.ts#L17-L18)、
[L49–61](https://github.com/ynatsume-source/3dproject/blob/6731f11b19d5c207bce95e8589f924fa7651b7a1/src/science/step/validate.ts#L49-L61)

- 正常な結果の `simulated.to` だけをNaNにすると、大小比較がどちらもfalseとなり違反0件。
- 同じ外部熱源の上限120000 Jに対し、使用120001 Jと使用−1 Jの2行を返しても、
  合計が120000になるため違反0件（各行は `lostJ = usedJ`、`storedJ = 0`）。

世界の確定前に使う場合、無効な時間や負の使用量による相殺を受理してしまう。
時刻の有限な整数検査と、外部offerからの使用量の非負検査が必要。
冷却時の `storedJ` は負になり得るため、すべてのJに一律の非負制約をかける修正にはしない。
不正な結果を渡す検査も、正常な工程出力を通す検査と併せて追加してほしい。

### R5 / P2: 入力の不完全な履歴が、消化で完全へ上書きされる

対象: [lime.ts L192–195](https://github.com/ynatsume-source/3dproject/blob/6731f11b19d5c207bce95e8589f924fa7651b7a1/src/science/step/lime.ts#L192-L195)

`quicklime.quality.history_complete: 0` のロットを既知の環境で消化すると、
生成物には `history_complete: 1` が付く（純CaO 56080 mg、水60000 mgの例）。
前工程で不明な天候を経たという記録が失われる。

初期化の `historyComplete: true` が原因。同じキーを使う乾燥では入力の0を継承している
（`drying.ts` は「試料の生涯の全区間を計算済み」と定義）。焼成側の初期化にも同じ問題がある。
入力ロットの不完全フラグを継承してほしい。
もし「今回の工程だけ」の意味にするなら、前工程の履歴を消さない別の項目が必要。

## 再現用ファイル

[science-lime-6731f11.repro.mjs](review/science-lime-6731f11.repro.mjs) は上記の入力・結果を出す
レビュー用のスクリプト。製品の入口や世界ホストではない。
labには石灰実装を取り込まず、引数で渡した科学ブランチのcheckoutを読む。
リポジトリへの書き込み、時計・ネットワーク・保存の使用はない。

labのルートで、依存関係が利用できる状態から実行する。

```sh
node --import tsx docs/proposals/civilization/review/science-lime-6731f11.repro.mjs /absolute/path/to/science-checkout
```

現状の再現値をJSONで表示する診断用で、終了コード0は不具合がないという意味ではない。
修正後は、R1の使用Jと温度の一致、R2の正常な結果、R3の不正入力拒否、R4の違反検出、
R5の履歴0の保持をそれぞれ確認する。

## 出典・分担の確認

- `openstax/osbooks-chemistry-bundle@db0a8e6027100ce082e67fc8879faab86f9a58a7` の
  `modules/m68865/index.cnxml` を独立に取得。取得本文から計算したGit blob SHAは
  `716bcbdfc6aba71cecb030d85f5b088282183f49` で、台帳と一致。
- CaO(s) −634.9、Ca(OH)2(s) −985.2、CaCO3(s, calcite) −1220.0、CO2(g) −393.51、
  H2O(l) −285.83 kJ/molを表の該当行で確認。Hessの法則による+191.59、−64.47、−393.51 kJ/molと整合。
- CaCO3の他資料との差は、Claudeが明記したとおり未解決。別資料による約178 kJ/molの値を
  今回新たに照合したわけではない。高温での補正・反応速度・実試料の校正も未確認。
- 提案の分担を継続する。`data/science/sources.json` はCodex、`sources-thermochem.json` はClaude。
  今回は既にClaude台帳にある資料の再照合なので重複登録せず、どちらも編集しない。
  今後Codexが別の石灰・熱化学資料を取得した場合は、Codex台帳に出典・本文ハッシュ・条件・単位を残して知らせる。
- ScienceStepの入口が既存の `src/science/step/index.ts` 一つであること、燃焼を石灰工程内に持たず、
  水を予約ロットから受け取ることを確認。契約0.1.0のまま進める分担は妥当。

## 追加で届いた4a49569の確認

- lab `1519fb6` と、科学側 `4a49569` の `tools/science-lab/` 全8ファイルは同じblob。
  `data/science/sources.json` も同じ。CODEX文書と旧experimentsをlabに残す方針も受領した。
- `science-clay-check.ts` の追加検査は、値の由来を `simulation`、浸漬24時間、煮沸0時間、
  拭き取りとしてv2記録に変換し、式の版1・校正不可・警告0・吸水率一致を検査している。
  独立実行でも成功。記録形式との整合の確認であり、物理モデルの実測校正を意味しない。

## 実行した検証

- `6731f11`: `science-lime-check.ts` 23件、`science-step-check.ts` 36件、
  `science-clay-check.ts` 51件、`npm run typecheck` は成功。
- `4a49569`: 追加検査を含む `science-clay-check.ts` 52件が成功。
  石灰・検査関数・熱化学パラメータに差分がないことを確認したため、同じ既存検査は繰り返していない。
- 上記の再現用スクリプトでR1–R5を確認。既存検査の成功だけでは拾えない境界条件だった。
- UIは今回変更しておらず、ブラウザ検査は再実行していない。
  実機の炉・粘土・石灰試料での実測検証や、世界本体への接続は行っていない。

## Claudeへ渡すプロンプト

```text
6731f11の石灰工程・validateResult・熱化学資料をCodex側でもレビューしました。
4a49569での1519fb6の取り込みも確認しました。v2記録の追加検査を含む粘土52件は成功しています。
OpenStax m68865の本文・blob SHA・5行の値と反応エンタルピーの計算は一致しました。
sources.jsonはCodex、sources-thermochem.jsonはClaudeの分担を継続します。

ただし本体への接続前に、labのdocs/proposals/civilization/CODEX_LIME_REVIEW.mdのR1〜R5を確認・修正してください。
1. 同じ4000 W・30秒でも、一括では120000 J、1秒×30回では4000 Jしか使わず温度も変わります。
2. 純CaO 56080 mg＋水9000 mgの消化でaddComp: negative water (-1 mg)が出ます。
3. 炉のheatCapJPerK:0でInfinityを含むrunning状態を返します。
4. validateResultがNaNの終了時刻、負の使用Jによる上限超過の相殺を通します。
5. 入力history_complete:0が消化後に1へ上書きされます。

同文書から再現用スクリプトを参照できます。科学側の実装はCodexから変更していません。
修正と回帰検査はそちらの科学ブランチでお願いします。labやmainへの変更は不要です。
石灰は試験世界のまま、本体への統合はこれらの確認と本体側の最終レビュー後にお願いします。
```
