// The science processes Dot's world can run (ADR 0002, 0006): which step computes it, on which clock, what it takes
// from the shelf, what equipment the world sets out for it, and whether it can run here yet. Lantern runs a process
// only when its entry is ready and its material is on the shelf; the world runs it (src/world/process-runner.ts).
//
// Ready means the island has all a process needs. The science side takes the island's weather as a replayed record
// (environment.source 'record', contract 0.2.1, fixture-4: integrated 2026-10-05). What is still missing is the
// island's own side: fresh water, the vessels and tools (every process names test equipment, 'fixture_…', which the
// island does not have and nothing washes up with), and lots for coconuts and firewood. Each entry says what it waits for.
import type { EnergyOffer, EquipmentView, ScienceStep } from './science-contract';
import type { ProcessClock } from './process-runner';
import { simpleFixtureStep } from '../science/step/simple';
import { dryingStep, DRYING_PROCESS, SCIENCE_CATALOG_VERSION } from '../science/step/drying';
import { slakeStep, SLAKE_PROCESS } from '../science/step/slake';
import { kneadStep, KNEAD_PROCESS } from '../science/step/knead';
import { coconutMilkStep, coconutBoilStep, COCONUT_MILK_PROCESS, COCONUT_BOIL_PROCESS } from '../science/step/coconut';
import { barometerStep, BAROMETER_PROCESS } from '../science/step/barometer';
import { barometerPotStep, BAROMETER_POT_PROCESS } from '../science/step/barometer-pot';
import { charcoalStep, CHARCOAL_PROCESS } from '../science/step/charcoal';
import { tarSealStep, leakTestStep, TAR_SEAL_PROCESS, LEAK_TEST_PROCESS, POT_ASSEMBLY_TABLE, ASSEMBLED_POT, potToEquipmentParams, potQualityOnReturn, potSherdsQuality } from '../science/step/vessel';
import { firewoodDryStep, FIREWOOD_DRY_PROCESS } from '../science/step/firewood';
import { potShapeStep, potDryStep, POT_SHAPE_PROCESS, POT_DRY_PROCESS } from '../science/step/pottery';
import { clayPitParams, CLAY_PIT } from '../science/step/clay-pit';
import { pitFireStep, PIT_FIRE_PROCESS, FIRED_POT } from '../science/step/pit-fire';
import { oilLampStep, OIL_LAMP_PROCESS, readLampOil, LAMP_DISH, LAMP_WICK, WICK_RECIPES } from '../science/step/oil-lamp';
import { cookPotParams, lampDishParams, firedPotQualityOnReturn, firedPotSherdsQuality, retortParams, retortPartsOnReturn, COOK_POT, TAR_RETORT, FIRED_POT_ASSEMBLY_TABLE, TOOL_RECIPES } from '../science/step/fired-pot-assembly';
import type { LotView } from './science-contract';
/** The clay pit the residents dig (science table civ-sci.clay-pit/1): the recommended size, under the hut's roof. */
export const CLAY_PIT_PLAN = { diameterCm: 50, depthCm: 25, sunExposure: 0 };
import type { AssemblyTable, PartsAssemblyTable } from './process-runner';

export interface CatalogEntry {
  processId: string; processVersion: string; catalogVersion: string; contract: string; clock: ProcessClock;
  ja: string;                                   // what Lantern is doing, as the record says it
  input: string; inputJa: string;               // the material it takes from the shelf (one lot; '' none: a gauge)
  also?: { input: string; ja: string; minMg?: number; perDry?: number; ok?: (l: LotView) => boolean }[];   // more lots it takes together (water, firewood): at least so much, and such (dry enough)
  /** Which lot of its material will do (dry enough wood, wood still wet enough to be worth drying). */
  inputOk?: (l: LotView) => boolean;
  equipment: (Omit<EquipmentView, 'equipmentId'> & { ja: string }) | null;   // what the world sets out for it (null: the hands only)
  moreEquipment?: (Omit<EquipmentView, 'equipmentId'> & { ja: string })[];
  step: ScienceStep;
  env: 'record' | 'simulation';                 // the weather it is given: the island's replayed record, or (checks only) a simulation
  energy?: (from: number, to: number) => EnergyOffer[];
  /** An operator action the first request carries at its start (what to make: p11y's plan). */
  start?: { action: string; params: Record<string, number> };
  /** Equipment the residents make themselves first (its kind): the process waits until it stands. */
  built?: string;
  /** Clay that is too stiff: rain water measured out to bring it to this water ratio (per dry mass) as it is worked. */
  wetTo?: number;
  /** Not while a lot of this is on the shelf, not yet used (milk is pressed when it will be boiled, not every nut found). */
  enough?: string;
  /** How much of `enough` counts as enough (default: any). */
  enoughMg?: number;
  /** Not with less of its material than this (mg): what one go takes. */
  minInputMg?: number;
  /** Taken out when it feels right (p10x 0.1.4: the clay is felt with a look): felt every so often from a while after the
   *  start, and taken out at the first feel that is ready — or that has gone too stiff; at the latest at lastMs. */
  feelOut?: { action: string; fromMs: number; everyMs: number; ready: string; tooFar: string[]; lastMs: number };
  /** A process that ends when the operator does something (takes the tile off the rack): after how long, on its clock. */
  finish?: { action: string; afterMs: number };
  /** The operator's work along the way, before it is finished (on its clock, from the start): soaking's sieve and pour-offs. */
  steps?: { action: string; afterMs: number }[];
  tend: 'stay' | 'leave';                       // hand work keeps Lantern at it; a process that only waits does not
  /** A gauge: set once and left running; the operator reads it every so often (on its clock). It does not keep Lantern
   *  from other work. */
  gauge?: { action: string; everyMs: number };
  ready: boolean; waits?: string;               // not ready: what it waits for
  /** Two entries for one process (the pot shaped as a cook pot, or as a lamp dish): which one a task meant. */
  key?: string;
  /** The pot's form it shapes (1 cook pot, 3 lamp dish): not made while one of that form is already on its way. */
  form?: number;
  /** Only at this time of day, on the island's own hours: the lamp is lit at dusk. */
  when?: 'dusk';
  /** The lots kept with its equipment go in too (the oil soaked into the lamp dish's wall, held with the dish). */
  withEquipmentLots?: boolean;
}
/** What the materials are called in the record (the island's own words come later). */
export const MATERIAL_JA: Record<string, string> = { lamp_wick: '芯', wick_char: '芯の燃えさし', coconut_husk: 'ヤシの実の殻', coconut_shell: 'ヤシの実の殻（内側）', pandanus_leaf: 'アダンの葉', fired_pot: '焼いた器', wood_ash: '灰', raw_clay: '粘土', bamboo: '竹', reed: '葦', limestone: '石灰岩', prepared_clay: '下ごしらえした粘土', settled_clay: '沈めた粘土', test_tile_green: '形づくった試験タイル', test_tile_dry: '乾いた試験タイル', process_water: '真水', coconut: 'ヤシの実', coconut_milk: 'ヤシのミルク', coconut_oil: 'ヤシ油', firewood: '薪', charcoal: '炭', wood_tar: '木タール', wood_vinegar: '木酢液', fired_pot_test: '焼いた器（試験用）', gauge_tube_test: '試験用の管', assembled_pot: '封じた器', pot_sherds: '器のかけら', green_pot: '形づくった器', dry_pot: '乾いた器' };
/** The residents' retort and the jar they seal (mL), and the charge the upper jar holds with room (mg). */
export const RETORT_UPPER_ML = 2000, RETORT_LOWER_ML = 300, SEAL_JAR_ML = 500, RETORT_CHARGE_MG = 700_000;
const handsW = (w: number) => (from: number, to: number): EnergyOffer[] => [{ sourceId: 'src:res-lantern-hands', kind: 'mechanical', maxJ: Math.round(((to - from) / 1000) * w) }];
const hands = handsW(3);
const TEST = SCIENCE_CATALOG_VERSION;
// (one fire place by the hut for every process that burns wood on it: the cooking hearth's numbers, which the boil reads;
// the pit fire and the retort read only that it is there and, the retort, its burn rate)
const OPEN_FIRE = { kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: TEST, condition: 1, params: { heatCapJPerK: 20000, uaWPerK: 8, chamberFraction: 0.2, maxBurnKgPerH: 3, forcedCoolingUaFactor: 0 }, ja: '焚き火（小屋のそば）' };
/** Wood dry enough to burn hot: a wet wood's flame is cool and smoky (science: pitWetFlameFrom 0.2 of the wet mass).
 *  Thirty island days under a roof bring green wood (45 %) to about 28 % (science side, 2026-10-09): that will do,
 *  with wood enough. */
export const SEASONED_PPM = 300_000;
const DRY_WOOD = (l: LotView) => (l.quality?.water_ppm ?? 1e6) <= SEASONED_PPM;
const NO_VESSEL = '島に桶・鍋・道具がない（どれも試験用の設備 fixture。島で作る方法を決める）';
export const CATALOG: CatalogEntry[] = [
  { processId: 'p11x_test_tile_shape', processVersion: 'fixture-4', catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'world',
    ja: '粘土で試験タイルを形づくる', input: 'prepared_clay', inputJa: '下ごしらえした粘土',
    equipment: { kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 }, ja: '型と作業台' },
    step: simpleFixtureStep, env: 'record', energy: hands, tend: 'stay',
    ready: false, waits: '下ごしらえした粘土（粘土の下ごしらえが島で動いてから）' },
  { processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION, contract: '0.1.0', clock: 'island',
    ja: '試験タイルを棚で乾かす', input: 'test_tile_green', inputJa: '形づくった試験タイル',
    equipment: { kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { sunExposure: 0 }, ja: '乾燥の棚' },
    step: dryingStep, env: 'record', finish: { action: 'take_off', afterMs: 6 * 86_400_000 }, tend: 'leave',
    ready: false, waits: '形づくった試験タイル（成形が島で動いてから）' },
  // (integrated 2026-10-05: the science team's final review FINAL_REVIEW_2026-10-05.md §5)
  { processId: SLAKE_PROCESS.processId, processVersion: SLAKE_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '粘土を水に浸して、こして沈める', input: 'raw_clay', inputJa: '粘土', also: [{ input: 'process_water', ja: '真水（乾いた土の1.5倍以上）', perDry: 1.6 }],   // (the science side's floor is 1.5: a little over it)
    // (0.1.2: the residents' own clay pit is its tub — science final review 2026-10-07-clay-pit)
    equipment: { kind: CLAY_PIT, catalogEntry: CLAY_PIT, catalogVersion: TEST, condition: 1, params: clayPitParams(CLAY_PIT_PLAN), ja: '粘土の池（小屋の屋根の下）' }, built: CLAY_PIT,
    // (the operator's work as the science side's own check does it: sieve after a day, pour off at two and a half and at
    // four, take out at nine and a quarter — island days)
    step: slakeStep, env: 'record', tend: 'leave',
    steps: [{ action: 'sieve', afterMs: 86_400_000 }, { action: 'decant', afterMs: 2.5 * 86_400_000 }, { action: 'decant', afterMs: 4 * 86_400_000 }],
    // (0.1.4: taken out by feel — the science side's word for clay ready to work is 「手につかず、よくまとまる」: felt every half
    // day from four and a half days, out at the first that is so, or already stiff; at the latest a fortnight)
    feelOut: { action: 'look', fromMs: 4.5 * 86_400_000, everyMs: 12 * 3_600_000, ready: '手につかず、よくまとまる', tooFar: ['固く、曲げるとひびが入る', '乾いて固まっている'], lastMs: 14 * 86_400_000 },
    ready: true, waits: '粘土の池（ランタンが掘る）と、雨受けの真水' },
  { processId: KNEAD_PROCESS.processId, processVersion: KNEAD_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: '沈めた粘土を練る', input: 'settled_clay', inputJa: '沈めた粘土',
    equipment: { kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: TEST, condition: 1, params: {}, ja: '作業台（ドットの作業台）' },
    // (stiff clay — settled clay that has stood in the pit dries — is wetted as it is kneaded: the science side takes the
    // whole of a water lot, so the world measures out what brings it to a quarter of its dry weight, as for coiling)
    step: kneadStep, env: 'record', energy: handsW(25), tend: 'stay', wetTo: 0.25,
    ready: true, waits: '沈めた粘土（粘土の池で浸してから）' },
  { processId: COCONUT_MILK_PROCESS.processId, processVersion: COCONUT_MILK_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: 'ヤシの実を割って、削って、しぼる', input: 'coconut', inputJa: 'ヤシの実',
    equipment: { kind: 'fixture_coconut_tools', catalogEntry: 'fixture_coconut_tools', catalogVersion: TEST, condition: 1, params: {}, ja: '割る・削る・しぼる道具' },
    // (the tools from the science side's recipe — a stake and a stone, a shell to grate, woven pandanus to strain: Lantern
    // makes them from bamboo and what lies about; FINAL_REVIEW_2026-10-09-pit-fire TOOL_RECIPES)
    built: 'fixture_coconut_tools', enough: 'coconut_milk',
    step: coconutMilkStep, env: 'record', energy: handsW(35), tend: 'stay',
    ready: true, waits: 'ヤシの実と、割る・削る・しぼる道具（竹から作る）' },
  { processId: COCONUT_BOIL_PROCESS.processId, processVersion: COCONUT_BOIL_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: 'ヤシのミルクを煮て油をとる', input: 'coconut_milk', inputJa: 'ヤシのミルク', also: [{ input: 'firewood', ja: '乾いた薪', minMg: 2_000_000, ok: DRY_WOOD }],
    // (0.1.3: in the residents' own pot, fired in the open and made a cook pot — science table civ-sci.fired-pot-assembly/1)
    equipment: { kind: COOK_POT, catalogEntry: COOK_POT, catalogVersion: TEST, condition: 1, params: {}, ja: '焼いた鍋' }, built: COOK_POT,
    moreEquipment: [OPEN_FIRE],
    // (not while there is clear oil enough for an evening's lamp on the shelf: the dry wood kept for the next pot's fire —
    // life-run 2026-10-10, the boil taking the seasoned stack again and again, the second pot never fired)
    enough: 'coconut_oil', enoughMg: 20_000,
    step: coconutBoilStep, env: 'record', tend: 'stay',
    ready: true, waits: 'ヤシのミルクと、乾いた薪と、焼いた鍋' },
  { processId: BAROMETER_PROCESS.processId, processVersion: BAROMETER_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '試験用の気圧計を置いて読む', input: '', inputJa: '',
    equipment: { kind: 'fixture_air_barometer', catalogEntry: 'fixture_air_barometer', catalogVersion: TEST, condition: 1, params: { bulbVolumeMl: 500, tubeBoreMm: 8, tubeLengthMm: 600, markMm: 5, bulbTauS: 900 }, ja: '試験用の気圧計' },
    step: barometerStep, env: 'record', tend: 'leave', gauge: { action: 'read_gauge', everyMs: 3 * 3_600_000 },
    // (owner's decision 2026-10-06: the typhoon forecast begins with this test gauge — it is Lantern's, on the island from
    // the first; what its readings have to do with the storms is Lantern's to find out. The self-made one is a milestone.)
    ready: true },
  // (science final review 2026-10-10-barometer, m03x 0.1.2: the self-made barometer — the residents' own sealed pot with
  // the test tube through its plug, water in the tube, a stick with marks beside it; stands in the hut's shade. The water
  // goes in as a lot and comes back at the end; what spilled from the tube's mouth is released to the ground. The gauge
  // is read on the cell's own held pressure; re-zeroing is the residents' note, the world does nothing. Not before a pot
  // can be sealed with a tube on the island: p16x waits for wood tar.)
  { processId: BAROMETER_POT_PROCESS.processId, processVersion: BAROMETER_POT_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '管を通して封じた器に水を入れ、目盛りの棒を添えて気圧計にする', input: 'process_water', inputJa: '真水（管の両脚の真ん中まで：8mm・600mmの管で15mL）', minInputMg: 16_000,
    equipment: { kind: ASSEMBLED_POT, catalogEntry: ASSEMBLED_POT, catalogVersion: TEST, condition: 1, params: {}, ja: '管を通して封じた器' },
    step: barometerPotStep, env: 'record', tend: 'leave', gauge: { action: 'read_gauge', everyMs: 3 * 3_600_000 },
    ready: false, waits: '管を栓に通して封じた器（木タールで封じる工程はこれから）と、真水' },
  // (integrated 2026-10-06: the science team's final review FINAL_REVIEW_2026-10-06.md — charcoal and wood tar, and the
  // sealed vessel; wood tar comes from the charcoal burn, so they came in together)
  // (the residents' own retort — two fired jars, the upper packed with dry wood mouth down over the lower buried to catch
  // what drips: civ-sci.fired-pot-assembly/2 retortParams, assembled by main (RETORT_ASSEMBLY). Lantern plans the burn
  // as the science side's standard one: a medium fire, fed 200 minutes, then left to cool in place and opened at six
  // hours. The charge is carved from a dry lot and laid in the retort (its location the retort's); the fuel is another dry
  // lot, beside it. What comes out — charcoal, the tar and the wood vinegar caught in the lower jar — goes to the shelf.)
  { processId: CHARCOAL_PROCESS.processId, processVersion: CHARCOAL_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '二重の壺で炭と木タールを作る', input: 'firewood', inputJa: '詰める乾いた薪（上の壺に入るだけ）', minInputMg: RETORT_CHARGE_MG, inputOk: DRY_WOOD,
    also: [{ input: 'firewood', ja: '燃料の乾いた薪（10kg以上）', minMg: 10_000_000, ok: DRY_WOOD }],
    equipment: { kind: TAR_RETORT, catalogEntry: TAR_RETORT, catalogVersion: TEST, condition: 1, params: {}, ja: '二重の壺（乾留の器）' }, built: TAR_RETORT,
    moreEquipment: [OPEN_FIRE],
    start: { action: 'fire_level', params: { level: 1 } }, steps: [{ action: 'put_out', afterMs: 200 * 60_000 }], finish: { action: 'open', afterMs: 360 * 60_000 },
    // (not while the shelf has tar enough to seal a jar or two: a burn takes Lantern six hours and ten kilos of dry wood, and
    // burned on and on it took all its days — two hundred burns in eighty island days, the clay never prepared; life-run 2026-10-10)
    enough: 'wood_tar', enoughMg: 30_000,
    step: charcoalStep as ScienceStep, env: 'record', tend: 'stay',
    ready: true, waits: '乾いた薪と、二重の壺（焼いた壺を2つ組む：上は2L、下は0.3L）' },
  // (the residents' own fired jar sealed with the tar from their retort — p16x takes fired_pot since 0.1.2; the brush and
  // plug from TOOL_RECIPES. No tube yet: the island has no gauge tube of its own)
  { processId: TAR_SEAL_PROCESS.processId, processVersion: TAR_SEAL_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: '器にタールを塗って口を封じる', input: 'fired_pot', inputJa: '焼いた壺（封じていない0.5Lのもの）', inputOk: (l) => l.quality?.form === 2 && l.quality?.capacity_ml === SEAL_JAR_ML && l.quality?.sealed !== 1 && !l.quality?.crack,
    also: [{ input: 'wood_tar', ja: '木タール' }],
    equipment: { kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: TEST, condition: 1, params: {}, ja: 'タールの刷毛' }, built: 'fixture_tar_brush',
    start: { action: 'seal', params: {} },
    step: tarSealStep, env: 'record', energy: handsW(15), tend: 'stay',
    ready: true, waits: '焼いた0.5Lの壺と、木タール（炭焼きから）と、タールの刷毛（竹から作る）' },
  { processId: LEAK_TEST_PROCESS.processId, processVersion: LEAK_TEST_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '器の漏れを試す（水を入れて待つ）', input: 'fired_pot_test', inputJa: '焼いた器', also: [{ input: 'process_water', ja: '真水（封じていない器に入れるとき）' }],
    equipment: { kind: 'fixture_vessel_stand', catalogEntry: 'fixture_vessel_stand', catalogVersion: TEST, condition: 1, params: { sunExposure: 0 }, ja: '器の台' },
    step: leakTestStep, env: 'record', finish: { action: 'take_out', afterMs: 86_400_000 }, tend: 'leave',
    ready: false, waits: '焼いた器と、' + NO_VESSEL + '（水に沈めて泡を見る試しは科学側で保留）' },
  // (stacked firewood dries toward the air's equilibrium moisture — science final review 2026-10-07, Codex lab 162ee7c.
  // The stack is a place, not a tool: whether it has a roof (covered) must be said; an open one takes up the recorded rain)
  { processId: FIREWOOD_DRY_PROCESS.processId, processVersion: FIREWOOD_DRY_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '薪を積んで乾かす', input: 'firewood', inputJa: '積む薪（生木の枝）',
    equipment: { kind: 'firewood_stack', catalogEntry: 'firewood_stack', catalogVersion: TEST, condition: 1, params: { covered: 1, sunExposure: 0, topAreaM2: 0.2 }, ja: '屋根の下の薪の山' },
    // (the stack's roof from the science side's recipe: bamboo and leaves, by the hut; wood still wet, piled together first)
    // (45 kg green is some 30 kg seasoned: one pit fire's worth — science side's sums, 2026-10-09)
    built: 'firewood_stack', inputOk: (l) => (l.quality?.water_ppm ?? 0) > SEASONED_PPM, minInputMg: 45_000_000,
    step: firewoodDryStep, env: 'record', finish: { action: 'take_out', afterMs: 30 * 86_400_000 }, tend: 'leave',
    ready: true, waits: '生木の薪（まとめて45kg以上）と、屋根の下の薪の山（竹から作る）' },
  // (pots, the first half: science final review 2026-10-07-pottery, Codex a363557. Coiled by hand — no tool; the first
  // request says what to make. Dried on the same rack as the tiles, under leaves; taken off part-dried, a pot keeps how far
  // it has dried and goes on in the next run)
  { processId: POT_DRY_PROCESS.processId, processVersion: POT_DRY_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '器を棚で乾かす（葉で覆って）', input: 'green_pot', inputJa: '形づくった器',
    equipment: { kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: TEST, condition: 1, params: { sunExposure: 0, covered: 1 }, ja: '乾燥の棚（小屋の棚、葉で覆う）' },
    step: potDryStep, env: 'record', finish: { action: 'take_off', afterMs: 14 * 86_400_000 }, tend: 'leave',
    ready: true, waits: '形づくった器' },
  { processId: POT_SHAPE_PROCESS.processId, processVersion: POT_SHAPE_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: '粘土を紐にして積み、鍋を形づくる', input: 'prepared_clay', inputJa: '下ごしらえした粘土',
    equipment: null, start: { action: 'plan', params: { form: 1, capacityMl: 3000 } }, minInputMg: 1_500_000,   // (a 3 L cook pot takes about 1.4 kg)
    step: potShapeStep, env: 'record', energy: handsW(15), tend: 'stay', key: 'pot', form: 1,
    ready: true, waits: '下ごしらえした粘土（池で浸して練ってから）' },
  // (the same hands' work, a small shallow dish for a lamp — form 3, 100 mL: science table lampDishParams; made once the
  // island has its cook pot, one at a time)
  { processId: POT_SHAPE_PROCESS.processId, processVersion: POT_SHAPE_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: '粘土で灯皿を形づくる', input: 'prepared_clay', inputJa: '下ごしらえした粘土',
    equipment: null, start: { action: 'plan', params: { form: 3, capacityMl: 100 } }, minInputMg: 400_000,
    step: potShapeStep, env: 'record', energy: handsW(15), tend: 'stay', key: 'dish', form: 3, built: COOK_POT,
    ready: true, waits: '下ごしらえした粘土（鍋ができてから）' },
  // (after the lamp: two jars for the residents' retort — the upper 2 L to hold the charge (retortParams: at least 1 L), the
  // lower 0.3 L to catch all a full charge can drip (2 L × 0.4 g/mL × (0.12 + 0.2) × 0.6 ≈ 154 mL) — and, once the retort
  // stands, a 0.5 L jar to seal with its tar. One of each, each once)
  ...([['upper', RETORT_UPPER_ML, 1_700_000, '乾留の器の上の壺', LAMP_DISH], ['lower', RETORT_LOWER_ML, 500_000, '乾留の器の下の壺', LAMP_DISH], ['seal', SEAL_JAR_ML, 700_000, '封じる壺', TAR_RETORT]] as const).map(([key, ml, mg, ja, after]) => ({
    processId: POT_SHAPE_PROCESS.processId, processVersion: POT_SHAPE_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world' as const,
    ja: `粘土で${ja}（${ml / 1000}L）を形づくる`, input: 'prepared_clay', inputJa: '下ごしらえした粘土',
    equipment: null, start: { action: 'plan', params: { form: 2, capacityMl: ml } }, minInputMg: mg,
    step: potShapeStep, env: 'record' as const, energy: handsW(15), tend: 'stay' as const, key, form: 2, built: after,
    ready: true, waits: `下ごしらえした粘土（${after === TAR_RETORT ? '乾留の器ができてから' : '灯皿ができてから'}）` })),
  // (science final review 2026-10-09-pit-fire: a dry pot fired in the open, the fire heaped round it. Lantern plans it
  // once — warmed beside the fire half an hour, built up at a normal pace to a cherry red, held there half an hour, left to
  // cool in the ashes — and tends it. A fire that hot takes some 20 kg of seasoned wood, more of wood dried only 30 days
  // (28 %: 30–40 kg — science side's sums, 2026-10-09; the wood's amount is from an assumed fire, not yet measured);
  // green wood never brings a pot to red. Run out of wood with the pot fired, it is still a fired pot.)
  { processId: PIT_FIRE_PROCESS.processId, processVersion: PIT_FIRE_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '乾いた器を野焼きする（焚き火で囲んで焼く）', input: 'dry_pot', inputJa: '乾いた器', also: [{ input: 'firewood', ja: '乾いた薪（30kg以上）', minMg: 30_000_000, ok: DRY_WOOD }],
    equipment: OPEN_FIRE, start: { action: 'fire_plan', params: { preheatMin: 30, pace: 1, targetGlow: 1, holdMin: 30, forcedCooling: 0 } },
    step: pitFireStep as ScienceStep, env: 'record', tend: 'stay',
    ready: true, waits: '乾いた器と、乾いた薪（30kg以上）' },
  // (science final review 2026-10-09-lamp: the residents' own lamp — the island's coconut oil in a fired dish, a wick twisted
  // from what the island has. On the world clock: lit at dusk, the tip trimmed once in the evening, put out at bedtime.
  // The dish stands in the hut, under its roof, out of most of the wind. What comes back: the clear oil left to the shelf,
  // the water (if the oil had any) to a jar of its own, the oil soaked into the dish's wall kept with the dish)
  { processId: OIL_LAMP_PROCESS.processId, processVersion: OIL_LAMP_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: '灯皿にヤシ油を入れ、芯を立てて灯す', input: 'coconut_oil', inputJa: 'ヤシ油', minInputMg: 20_000,
    inputOk: (l) => (l.quality?.soaked_in_dish ?? 0) !== 1 && (() => { try { readLampOil(l); return true; } catch { return false; } })(),   // (clear oil only: at most 2 % water)
    also: [{ input: LAMP_WICK, ja: '芯（アダン・ヤシの実の繊維・葦の髄から作る）' }],
    equipment: { kind: LAMP_DISH, catalogEntry: LAMP_DISH, catalogVersion: TEST, condition: 1, params: {}, ja: '灯皿' }, built: LAMP_DISH, withEquipmentLots: true,
    start: { action: 'light', params: { wickOut: 1 } }, steps: [{ action: 'trim', afterMs: 2.5 * 3_600_000 }], finish: { action: 'put_out', afterMs: 5 * 3_600_000 },
    step: oilLampStep as ScienceStep, env: 'record', tend: 'leave', when: 'dusk',
    ready: true, waits: 'ヤシ油と、芯と、焼いた灯皿' },
];

/** A sealed pot made into equipment, and back (ADR 0006 addendum; the science side's table civ-sci.pot-assembly/2,
 *  integrated 2026-10-06). A worn one stays sealed and is no longer known to be airtight; its params then say it will
 *  not do for a barometer's bulb (airtightKnown 0, airLeakTauMin 0) — not that it is perfectly airtight. A broken one
 *  goes back to a lot of pot_sherds of the same amount as the copy, its quality from potSherdsQuality (cleared by Codex,
 *  lab e2a4147; science FINAL_REVIEW_2026-10-06 §6): the body's absorption, the tar and the water in its walls and
 *  history_complete as the copy had them, in its whole ppm (no further rounding) — read as the whole lot's mg × ppm,
 *  rounded down (water and tar included in the whole); nothing of the vessel (capacity, coverage, seal, airtightness,
 *  crack) is kept. */
/** The marks on the stick beside a self-made barometer's tube (mm apart): as the test gauge's. */
export const GAUGE_MARK_MM = 5;
export const POT_ASSEMBLY: AssemblyTable = {
  version: POT_ASSEMBLY_TABLE, kind: ASSEMBLED_POT, catalogEntry: ASSEMBLED_POT, catalogVersion: TEST, materials: ['fired_pot_test'],
  // (table /4: a pot with a gauge tube through its plug gives the bulb's params; main adds the stick it carves to read it
  // by, marks GAUGE_MARK_MM apart, as the test gauge's — science final review 2026-10-10-barometer)
  toParams: (l) => { const p = potToEquipmentParams(l); return p.tubeBoreMm !== undefined ? { ...p, markMm: GAUGE_MARK_MM } : p; }, qualityOnReturn: potQualityOnReturn, brokenMaterial: 'pot_sherds', brokenQuality: potSherdsQuality,
};

/** A fired cook pot (or jar) made into the residents' cook pot, and back (science table civ-sci.fired-pot-assembly/1,
 *  final review 2026-10-09): its heat capacity and loss from the pot itself; a cracked pot is not made one (it leaks). */
export const COOK_POT_ASSEMBLY: AssemblyTable = {
  version: FIRED_POT_ASSEMBLY_TABLE, kind: COOK_POT, catalogEntry: COOK_POT, catalogVersion: TEST, materials: [FIRED_POT],
  toParams: (l) => cookPotParams(l), qualityOnReturn: firedPotQualityOnReturn, brokenMaterial: 'pot_sherds', brokenQuality: firedPotSherdsQuality,
};
/** Two fired pots made into a tar retort, the upper holding the charge, the lower catching the tar (the same table): a
 *  lower pot too small for all a full charge can drip is refused. Going back, the wear of use is the upper pot's (an
 *  assumed allocation); each pot keeps its own amount (process-runner disassembleParts). */
export const RETORT_ASSEMBLY: PartsAssemblyTable = {
  version: FIRED_POT_ASSEMBLY_TABLE, kind: TAR_RETORT, catalogEntry: TAR_RETORT, catalogVersion: TEST, roles: ['upper', 'lower'], materials: [FIRED_POT],
  toParams: ([u, l]) => retortParams(u, l),
  partsOnReturn: ([u, l], condition) => { const r = retortPartsOnReturn(u, l, condition); return [r.upper, r.lower]; },
};
/** A fired dish of the lamp's form made the residents' lamp dish (science table civ-sci.fired-pot-assembly/2, lampDishParams),
 *  with where it stands added by main: in the hut, under its roof (roofed 1), sheltered from most of the wind (0.8). */
export const LAMP_DISH_STAND = { shelter: 0.8, roofed: 1 };
export const LAMP_DISH_ASSEMBLY: AssemblyTable = {
  version: FIRED_POT_ASSEMBLY_TABLE, kind: LAMP_DISH, catalogEntry: LAMP_DISH, catalogVersion: TEST, materials: [FIRED_POT],
  toParams: (l) => ({ ...lampDishParams(l), ...LAMP_DISH_STAND }), qualityOnReturn: firedPotQualityOnReturn, brokenMaterial: 'pot_sherds', brokenQuality: firedPotSherdsQuality,
};
/** The wicks the residents twist (science WICK_RECIPES: the material, how much, how long by hand). */
export const WICKS = WICK_RECIPES;
/** The tools the residents make from the science side's recipes (what they take, how long by hand). */
export const TOOLS = TOOL_RECIPES;
