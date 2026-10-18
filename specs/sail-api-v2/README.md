# 帆の世界側 API の形 v2（科学班 2026-10-18）

v1 は本体の案（時計・縄・天気・保存・材料の5点、2026-10-18）を受け取る前に書いた版で、この v2 で置き換える。v1 との違いは §7 にまとめた。

分担：① 科学（この文書の入口。実装は Codex）／② 本体：帆を作る／③ 本体：帆で渡る／④ 本体と自然班：見た目。
最初に通す範囲：帆を作り、帆で今の島々へ渡るところまで。向きは本体が目的地の方角に固定する。帆は台風と強風のときに本体が下ろし、それ以外は張る。

科学の数値（速さ・力・強さ・傷み）は、受入済みの試作（PR #23）から変えない。変えるのは時計（§3.2）と入口の形だけ。

## 0. 計測にもとづく前提

いまの試作の航海は全セルを状態に持ち、commit のたびに全部を再生する。6時間（720セル）の時点で 1回の commit が 180 ms、状態は 213 KB、project と observe は合わせて 342 ms かかる（`voyage-cost.ts`）。
- 科学側に、1セルずつ畳み込む入口 `step(checkpoint, cell) → checkpoint` を足す。checkpoint は整数だけの JSON。
  - 全セルを再生した結果と、ビット単位で一致すること。
- 上限（科学班が決める）：
  - 1セルの処理：5 ms 以下
  - 1航海の保存：10 KB 以下
  - 同じ指示の見分けは、直近64セル分だけ持つ
  - どれも航海の長さに比例して増えないこと
  - 終わった run は runs に残さない（PR #36 と同じ）
- 本体の言う「区切り」は、1セルごとの checkpoint として扱う。checkpoint には、距離の分子、帆走時間と擦れの端数（縄ごと）、破損状態、帆・マスト・縄の現在の傷みを持ち越す。

## 1. 材料（本体が今ある材料との対応表を返す）

帆の材料は台帳のロットから取る。read / write は `src/world/sail-lots.ts`（`coir-cord-lots.ts` と同じ形）。

| 型 | materialId | 中身（quality。住民には出さない） | 出どころ |
|---|---|---|---|
| PlantMass | `pandanus_standing_leaves` | dry_mg, water_mg | 供給元（タコノキ）。本体が置く |
| PlantMass | `pandanus_leaves` | dry_mg, water_mg | 採る（harvest）→ 干す（dry） |
| PlantMass | `pandanus_strips` | dry_mg, water_mg | 裂く（split） |
| PlantMass | `pandanus_leaf_scrap` | dry_mg, water_mg | 裂いたときの屑 |
| PlantMass | `bamboo` | dry_mg, water_mg, length_mm | 供給元（竹）。本体が置く |
| SailMat | `sail_mat` | dry_mg, water_mg, area_cm2, base_strength_gf, torn, sun_ms, shade_ms, rain_ms | 編む（weave、2 m² の固定値） |
| BambooMast | `bamboo_mast` | dry_mg, water_mg, length_mm, base_strength_gf, broken | 切り出す（mast。先端から 2,500 mm） |
| CoirPiece | `coir_rope` / `coir_strand` | 縄の既存の codec のまま | 縄の作業 |

供給元のキメ案：タコノキ2本（それぞれ乾物 3,000,000 mg・水 6,000,000 mg、つまり葉3回分）、竹やぶ1か所（長さ 6,000 mm・乾物 5,000,000 mg・水 2,000,000 mg）。v1 では生え直さない。

### 船体（12月までは台帳に移さない）

本体は部材の本数から `RaftHull` を作って渡す。科学側の表：

```ts
export const RAFT_PIECE = { dryMg: 8_500_000, waterMg: 500_000 } as const;   // 部材1本（キメ）
export function raftHullFromPieces(lotId: string, pieces: number): RaftHull;  // pieces × RAFT_PIECE。pieces は 1 以上の整数
```

今の筏は6本なので、乾物 51,000,000 mg・水 3,000,000 mg になる。v1 の試作では、船体の値は検査に使うだけで速さには効かない（慣性なし）。

## 2. 帆を作る作業（`src/world/sail-work.ts`）

`coir-cord-work.ts` と同じ形にする。

```ts
export const SAIL_WORK = { processId: 'prototype_sail_work', version: 'host-1', schema: 'civ-world.sail-work/1', quantumMs: 30000 } as const;
type Operation = 'harvest' | 'dry' | 'split' | 'weave' | 'mast';
type Activity = 'harvest-leaves' | 'split-leaves' | 'weave-mat' | 'cut-mast' | 'rest' | 'travel' | 'idle' | 'unknown';
export function applySailIntent(L, i: SailIntent, expectedRevision: number, nowWorldMs: number, facts?: SailStartFacts): { runId: string };
export function recordSailSpan(L, runId, span: SailManualSpan | SailRoofedSpan, expectedRevision: number, nowWorldMs: number): void;
export function restoreSailWork(saved: unknown, nowWorldMs: number): SailWorkLedger;
export function sailWorkRevision(L): number;
export function readSailWorksite(L, siteId, asOfWorldMs): { activity; observations: { channel: 'sight'; text }[] };
export function readSailWorkerObservations(L, runId, actorId): { channel: 'sight'; text }[];
export function sailFailureObservations(error, attempt?: { kind: 'host-confirmed-on-site-attempt' }): { channel: 'touch' | 'sight'; text }[];
```

- intent・span・presence・15分・追い上げ中はしない、は縄と同じ。干すのは屋根の下で島時計の待ち。60秒ごとに送り、再起動のあとは1区間でつなぐ。
- 面積は `requestedAreaCm2: 20000` の固定値。数値を住民に決めさせない。
- 艤装（rig）はこの作業ではなく、§4 の assemble で行う（本体の案どおり）。艤装の手間30分は、本体が手作業として数える（キメ：rigMs = 1,800,000 ms）。

## 3. 航海（`src/world/sail-voyage.ts`）

### 3.1 入口

```ts
export const SAIL_VOYAGE = { processId: 'prototype_sail_voyage', version: 'host-1', schema: 'civ-world.sail-voyage/1', cellWorldMs: 30000 } as const;
export function beginSailVoyage(L, q: { commandId; rigEquipmentId; hull: RaftHull; actorId; presence: 'here'; atWorldMs; atIslandMs }): { runId: string };   // 帆の装備を予約
export function recordSailCell(L, runId, cell: SailCellInput, nowWorldMs: number): { observations: string[] };
export function resumeSailVoyage(L, runId, q: { commandId; actorId; presence: 'here'; atWorldMs; atIslandMs }): void;   // 読み直したあと、最後に確定したセルから続ける
export function settleSailVoyage(L, runId, q: { commandId; actorId; atWorldMs; reason: 'arrived' | 'turned' | 'interrupted' }): SailVoyageResult;
export function readSailVoyage(L, runId): SailVoyageView;              // 本体の判断・描画用。住民には渡さない
export function readSailVoyageObservations(L, runId): string[];        // 住民用の言葉だけ
export function restoreSailVoyage(saved: unknown, nowWorldMs: number): SailVoyageLedger;

interface SailCellInput {
  cellId: string;                              // `${runId}:${n}`
  fromWorldMs: number; toWorldMs: number;      // ちょうど30秒
  fromIslandMs: number; toIslandMs: number;    // Math.round(toClock('island', …))
  windMmS: number; windToDeg: number; gustMmS: number | null; headingDeg: number; rain: boolean; sailUp: boolean;
}
interface SailVoyageView { eastMm: number; northMm: number; sailUp: boolean; matTorn: boolean; mastBroken: boolean; cordBroken: boolean; moving: boolean }
interface SailVoyageResult { rigEquipmentId: string | null; lotIds: string[]; eastMm: number; northMm: number; observations: string[] }
```

### 3.2 時計（本体案1）

- セルは世界時計で30秒ごとに確定する。距離・帆走時間・縄の擦れ（帆走1時間に1回）は、**セルの島の区間（toIslandMs − fromIslandMs）**で数える。日焼けと雨も島時計。
- 仮定の ID は `owner-assumption/sail-raft/2026-10-18/v2`。数値は変えない。
- 突風の判定はセルごとに1回のまま（島時計では約6.5分に1回）。キメとしてこれで受入する。

### 3.3 再開（本体案4）

- 読み直したときは、確定していない区間を捨てる。アプリが閉じていた時間は進めない（舵取りは手の作業の扱い）。
- `resumeSailVoyage` のあとは、最後に確定したセルの位置から、新しいセル番号で続ける。セルとセルの間の空白は数えない。
- 日没までに戻れないなら引き返す、という判断は本体が行う（`reason:'turned'`）。

## 4. 装備と縄（本体案2・5）

- **艤装**：帆（sail_mat）、マスト（bamboo_mast）、縄（1本以上、合計 8,000 mm 以上）を、本体が assemble で1つの装備にする。科学側は表 `SAIL_RIG_PARTS` を用意する（PartsAssemblyTable と同じ形）。
- **lotId を保つ**：今の `disassembleParts` は、部品ごとに新しい lotId を作る。帆では、本体案2の「切れなければ同じ lotId」を守るため、**部品の lotId を保ったまま分ける**オプションを process-runner に足す。これは世界の変更なので、本体の了承を得てから Codex が行う。
- **航海中**：装備は予約される。縄への荷重・擦れ・日照は、航海の処理（PR21 の整数の芯）がまとめて受け持つ。本体は、帆の航海では `voyageHome` の荷重を送らない。出発の直前に、本体が縄の日照をそこまでの分だけ送る。
- **決着（settle）**：
  1. 帆とマストの傷み・破れ・折れを、各部品の quality に書き戻す。
  2. 装備を lotId を保ったまま分ける。ただし帆の装備として続けられる場合は、装備のまま残す（`rigEquipmentId` を返す）。
  3. 航海中に縄に起きたこと（日照 → 荷重 → 擦れの順）を、縄の荷重の記録（`coirCordLoads` /4）へ同じ形で書く。commandId は `voyage:${runId}:${n}`。切れなければ同じ lotId、切れたら新しい lotId の2片になる。
  4. 航海の処理の中での縄の結果と、縄の記録に書いた結果が**一致**することを、科学側の検査で示す。
- **壊れたら材料に戻す**：裂けた帆・折れたマスト・切れた縄は、装備から外して材料のロットに戻す（質量と水はそのまま）。修理は v1 では扱わない。
- 縄の日照の時計：航海中の分は決着で記録される。本体の縄の日照の記録（cord-host の `sun[lotId]`）は、決着の時刻まで進めておく（二重に数えないため）。

## 5. 天気（本体案3。変換は科学側が関数として持ち、検査する）

本体はこの関数を通して値を作る。変換を2か所に書かないためで、検査は科学側に入れる。

```ts
export function sailCellWeather(rec: { windMeasuredMs?: number; windFromDeg?: number; gustMs?: number; rainMeasuredMm?: number }):
  { windMmS: number; windToDeg: number; gustMmS: number | null; rain: boolean } | null;   // 風の実測がなければ null（セルを送らない）
```

- `windMmS = round(windMeasuredMs × 1000)`
- **`windToDeg = (270 − windFromDeg) mod 360`**。吹いてくる方位（0=北、時計回り）を、向かう方向の数学座標（0=東、90=北）に直す。「+180」だけだと方位のままなので、東西が入れ替わる。
- `gustMmS`：実測の値があれば `round(gust × 1000)`、なければ null（科学側の代用は平均の 14/10）
- `rain = rainMeasuredMm > 0`
- 風向が欠けていれば null（セルを送らない）
- **注意（本体へ）**：`islandWeather()` は欠けた値を埋めている。風向が欠けていれば 90、突風が欠けていれば平均の 1.5倍になる。そのため、この関数には埋める前の生の記録の値（`windMeasured`、風向が NA かどうか、突風が NA かどうか）を渡すこと。
- `headingDeg` も数学座標（0=東、90=北）で、本体が目的の島への向きから作る。

## 6. 本体が決めること

1. **風が弱い・実測がないときの扱い**：本体案では、実測の風がない時間はセルを送らず、筏は進まない。ただ、無風が続くと戻れない（引き返しても動かない）。また帆の速さは、風 5 m/s で約 1.6 km/h、10 m/s で約 3.2 km/h で、今の漕ぐ航海（島時計で約 2 km/h）より遅いことがある。科学班のおすすめは「帆が進まないセルでは、今の漕ぐ規則で進む（帆のセルにはしない）」。
2. 強風の目安（帆を下ろす条件）。参考：突風 18 m/s では、新品の縄でも切れることがある（縄への荷重はおよそ 90 kg 重）。
3. 供給元の置き場所と数（§1 のキメ案でよいか）。
4. lotId を保ったまま分けるオプションを process-runner に足してよいか（§4）。

## 7. v1 からの違い

- v1 は「艤装した筏」を1つのロット（`sail_raft`）にして縄を消費していた。v2 では本体案どおり、assemble で装備にし、lotId を保ったまま返す。
- v1 は再起動で航海を閉じていた。v2 では `resumeSailVoyage` で続ける。
- 船体は、ロットではなく部材の本数から作る（`raftHullFromPieces`）。
- 天気の変換を科学側の関数にした。v1 は方位の注意が不十分だった。

## 8. 検査（Codex に入れてほしいもの）

- 畳み込みと全再生の一致（ランダムな航海200本以上。突風・破損・漂流・雨・無風・60度超を含む）
- 6時間の航海で、1セル 5 ms 以下、保存 10 KB 以下、増えないこと
- 再送で何も変わらないこと、違う中身は拒否すること、再開のあとの空白を数えないこと
- 決着で、縄の記録の結果（同じ lotId か、2片か、傷み）が、航海の処理の中の結果と一致すること。帆とマストの lotId が保たれること
- `sailCellWeather`：北風（0）→ 270、東風（90）→ 180、西風（270）→ 0、南風（180）→ 90。風の実測なし → null、風向なし → null、突風なし → null、雨 0 → false
- 島時計で進むこと（同じ世界時間でも、島の区間が倍なら距離が倍）
- 住民の言葉に数値・コードが出ないこと、View に強さ・速さ・力が出ないこと
