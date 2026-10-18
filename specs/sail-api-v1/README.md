# 帆の世界側 API の形 v1（科学班 2026-10-18）

> **v2（specs/sail-api-v2）で置き換え済み。** こちらは本体の5点案を受け取る前の版。

対象：帆を作る作業（`src/world/sail-work.ts`）と航海（`src/world/sail-voyage.ts`）の世界側の入口。実装は Codex、住民への接続（②③）は本体。科学の数値は受入済みの試作（`sail-raft-*.ts`、PR #23）から変えない。ただし「進みは島時計」（オーナー決定 2026-10-18）に合わせる変更が1つだけある（§3.2）。

形は殻・縄と同じ約束にそろえる：意図（start / stop / resume / takeover / abandon、presence 'here'）、本体が確定した区間（手作業は世界時計30秒、待つ作業は島時計）、住民へは観察の言葉だけ、拒否コードは開発者ログ、数値は見せない。

## 0. 先に決めた前提（計測にもとづく）

いまの試作の航海は全セルを状態に持ち、commit のたびに全部を再生する。6時間（720セル）の時点で 1回の commit が 180 ms、状態は 213 KB、project と observe は合わせて 342 ms かかる（科学班の計測 `voyage-cost.ts`）。縄の荷重で起きたことと同じなので、**最初から要約（チェックポイント）方式にする**。

- 科学側：`createSailRaftVoyage` に、**1セルずつ畳み込む入口**を足す。`step(checkpoint, cell) → checkpoint`。checkpoint は整数だけの JSON で、帆・マスト・縄の現在状態、距離の分子、縄ごとの端数、直近のセルの要約を持つ。
  - 全セルを再生した結果と、畳み込んだ結果が**ビット単位で一致**することを差分テストで示す。
- 作る作業（manufacturing）も同じ。区間は合計だけを持ち、30秒の区間を全部は残さない。
- 終わった run は台帳の runs に残さない（PR #36 と同じ）。
- 目安：1セルの処理 5 ms 以下、航海1回の保存 10 KB 以下で、航海の長さに比例して増えないこと。

## 1. 材料のロット（`src/world/sail-lots.ts`）

`coir-cord-lots.ts` と同じく read / write の対で用意する。codec_version を持たせ、強さや出来の係数は quality に入れて住民へは出さない。

| materialId | 中身（quality） | 出どころ |
|---|---|---|
| `pandanus_standing_leaves` | dry_mg, water_mg | 世界が置く供給元（木） |
| `pandanus_leaves` / `pandanus_strips` / `pandanus_leaf_scrap` | dry_mg, water_mg | 採る・干す・裂く |
| `bamboo` | dry_mg, water_mg, length_mm | 世界が置く供給元（竹） |
| `sail_mat` | dry_mg, water_mg, area_cm2, base_strength_gf, torn, sun_ms, shade_ms, rain_ms | 編む |
| `bamboo_mast` | dry_mg, water_mg, length_mm, base_strength_gf, broken | 切り出す |
| `raft` | dry_mg, water_mg | **本体が置く**（下の注） |
| `sail_raft` | hull・mat・mast・cords・cord_use_remainders を丸ごと内包 | 艤装 |

注：今の筏は `village.raft.parts` の数で、ロットではない。帆をつなぐ前に、筏ができた時点で本体が `raft` ロットを1つ置く（キメ：乾物 50,000,000 mg、水 1,000,000 mg。試作の fixture と同じ）。

注：艤装は縄ロットを**消費**して内包する。縄の荷重記録（`coirCordLoads` /4）の、その縄のチェックポイントは「艤装に入った」として閉じる。帆の外での縄の荷重（鍋・筏の縛り）は、艤装に入っていない縄だけが対象になる。

## 2. 帆を作る作業（`src/world/sail-work.ts`）

`coir-cord-work.ts` と同じ形にする。

```ts
export const SAIL_WORK = { processId: 'prototype_sail_work', version: 'host-1', schema: 'civ-world.sail-work/1', quantumMs: 30000 } as const;
type Operation = 'harvest' | 'dry' | 'split' | 'weave' | 'mast' | 'rig';
type Activity = 'harvest-leaves' | 'split-leaves' | 'weave-mat' | 'cut-mast' | 'rig-sail' | 'rest' | 'travel' | 'idle' | 'unknown';
export type SailIntent =
  | { intentId; kind: 'start'; actorId; atWorldMs; operation: Operation; lotIds: string[]; siteId; presence }
  | { intentId; kind: 'stop' | 'abandon'; actorId; atWorldMs; runId }
  | { intentId; kind: 'resume' | 'takeover'; actorId; atWorldMs; runId; presence };
export interface SailStartFacts { assumptionId: typeof SAIL_RAFT_ID; worksite: HuskWorksite; roofed?: true; requestedAreaCm2?: 20000 }
export function applySailIntent(L, i: SailIntent, expectedRevision: number, nowWorldMs: number, facts?: SailStartFacts): { runId: string };
export function recordSailSpan(L, runId, span: SailManualSpan | SailRoofedSpan, expectedRevision: number, nowWorldMs: number): void;
export function restoreSailWork(saved: unknown, nowWorldMs: number): SailWorkLedger;
export function sailWorkRevision(L): number;
export function readSailWorksite(L, siteId, asOfWorldMs): { activity; observations: { channel: 'sight'; text }[] };   // 数値なし
export function readSailWorkerObservations(L, runId, actorId): { channel: 'sight'; text }[];
export function sailFailureObservations(error, attempt?: { kind: 'host-confirmed-on-site-attempt' }): { channel: 'touch' | 'sight'; text }[];
export class SailWorkError extends Error { code: string }
```

- 手作業（harvest / split / weave / mast / rig）：世界時計30秒の区間、presence 'here'、1回15分まで、追い上げ中はしない。殻・縄と同じ。
- 干す（dry）：屋根のある場所で、島時計の待ち。屋根を確かめた区間を60秒ごとに送り、再起動のあとは1区間でつなぐ。縄の乾かし場と同じ場所でよい（乾かし場は1か所につき1回分）。
- 編む面積：**20,000 cm²（2 m²）の固定値**。住民や LLM には数値を決めさせない（縄の長さと同じ扱い）。
- 必要な手間の目安（キメ、試作のまま）：採る30分、干す島時計2日、裂く90分、編む240分、マスト10分、艤装30分。
- 拒否の例：湿った葉を裂く、葉が足りない、竹が短い、縄の合計が 8,000 mm 未満、壊れた部品で艤装する。どれも開発者ログに残し、住民には `sailFailureObservations` の言葉だけを渡す。

## 3. 航海（`src/world/sail-voyage.ts`）

### 3.1 入口

```ts
export const SAIL_VOYAGE = { processId: 'prototype_sail_voyage', version: 'host-1', schema: 'civ-world.sail-voyage/1', cellWorldMs: 30000 } as const;
export function beginSailVoyage(L, q: { commandId; rigLotId; actorId; presence: 'here'; atWorldMs; atIslandMs }): { runId: string };   // 艤装ロットを予約
export function recordSailCell(L, runId, cell: SailCellInput, nowWorldMs: number): { observations: string[] };   // 1セル、O(1)
export function endSailVoyage(L, runId, q: { commandId; actorId; atWorldMs; reason: 'arrived' | 'turned' | 'interrupted' }): SailVoyageResult;
export function readSailVoyage(L, runId): SailVoyageView;          // 本体（描画・判断）用。住民には渡さない
export function readSailVoyageObservations(L, runId): string[];    // 住民用の言葉だけ
export function restoreSailVoyage(saved: unknown, nowWorldMs: number): SailVoyageLedger;
export class SailVoyageError extends Error { code: string }

interface SailCellInput {            // 本体が確定した、実際に乗っていた30秒
  cellId: string;                    // `${runId}:${n}`（n は開始からの通し番号）
  fromWorldMs: number; toWorldMs: number;   // ちょうど30秒、前のセルの終わりから隙間なく
  fromIslandMs: number; toIslandMs: number; // toClock('island', …) を Math.round した整数
  windMmS: number;                   // 平均風速（m/s ×1000、整数）
  windToDeg: number;                 // 風が「向かう」方角。0=東・90=北（気象の wind-from + 180 を数学座標に直す）
  gustMmS: number | null;            // 突風。わからなければ null（試作の代用：平均×14/10）
  headingDeg: number;                // 進みたい方角（目的の島への向き、整数）
  rain: boolean;
  sailUp: boolean;                   // 帆を張るか（本体の規則で決める）
}
interface SailVoyageView { eastMm: number; northMm: number; sailUp: boolean; matTorn: boolean; mastBroken: boolean; cordBroken: boolean; powered: boolean }
interface SailVoyageResult { rigLotId: string; lotIds: string[]; eastMm: number; northMm: number; observations: string[] }
```

### 3.2 時計（オーナー決定 2026-10-18 に合わせた唯一の科学側の変更）

- セルは世界時計で30秒ごとに確定する。進む距離、帆走時間、縄の擦れ（1時間に1回）は、**島時計の区間（toIslandMs − fromIslandMs）**で計算する。日焼けと雨も島時計のまま。
- 試作の記述（「距離と擦れは世界時計」）からの変更なので、科学側で版を上げる（`owner-assumption/sail-raft/2026-10-18/v2`）。数値（速さ・力・強さ）は変えない。
- 突風の判定はセルごとに1回のまま。島時計では1セル約6.5分に1回の判定になる。キメとしてこれで受入する。

### 3.3 約束

- セルは隙間なく続ける。乗っていない時間、追い上げ中の時間、アプリを閉じていた時間はセルにしない。
  - 再起動したら、前の航海を最後に確定したセルの終わりで `endSailVoyage(reason:'interrupted')` で閉じる。続けるなら新しい航海として始める。
- 同じ cellId・同じ中身の再送は何も変えない。中身が違えば拒否する（縄と同じく、直近64件の範囲で）。
- 壊れたあとも航海は続けられる（漂流）。帰る・引き返すは本体が決める。View の `matTorn / mastBroken / cordBroken` を判断に使ってよい。これは目に見える事実なので、住民に「裂けた」と言葉で伝えるのはかまわない。
- 力・強さ・速さ・最大負荷・seed・係数は View にも出さない。出してよいのは、描画と移動に使う変位（east/north mm）と、壊れたかどうかだけ。
- 終えたとき、艤装ロットの中身（帆の傷み、マスト、縄の片、端数）を台帳に書き戻す。縄が切れたら新しい ID の片になる（PR21 と同じ）。

## 4. 本体が決めること（科学はどれでもよい）

1. **帆の速さが今の航海より遅い場合がある**：今は櫂で島時計1時間に約2 km。帆は風5 m/sで 441 mm/s（約1.6 km/h）、10 m/sで約3.2 km/h。
   - 案A：風が弱いときは帆をたたんで漕ぐ（今の速さ）。
   - 案B：帆の航海では漕がない。
   - 科学班のおすすめは案A。漕ぐ区間は帆のセルにせず、今の距離の規則で進める。帆を張ったセルは帆の速さで進む。
2. `sailUp` の規則（例：突風が強すぎる日は張らない、など）。
3. 供給元（タコノキの葉、竹）を島のどこに、いくつ置くか。キメ案：葉の木2本（それぞれ乾物 3,000,000 mg）、竹やぶ1か所（長さ 6,000 mm、乾物 5,000,000 mg）。再生しない（v1）。
4. 帆を作る作業場の場所。縄の作業場と兼ねてよい。

## 5. 検査（Codex に入れてほしいもの）

- 畳み込みと全再生の一致（ランダムな航海200本以上。突風・破損・漂流・雨・無風・60度超を含む）
- 6時間の航海で、1セルの処理時間が増えないこと、保存が上限内に収まること
- 同じセルの再送で何も変わらないこと、違う中身は拒否すること
- 再起動で中断し、新しい航海として続けられること
- 艤装で縄の荷重チェックポイントが閉じること、閉じた縄に荷重を送ると拒否されること
- 住民の言葉に数値・コードが出ないこと、View に強さ・速さ・力が出ないこと
- 島時計で進むこと（同じ世界時間でも、島の区間が倍なら距離が倍）
