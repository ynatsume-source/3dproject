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

export interface CatalogEntry {
  processId: string; processVersion: string; catalogVersion: string; contract: string; clock: ProcessClock;
  ja: string;                                   // what Lantern is doing, as the record says it
  input: string; inputJa: string;               // the material it takes from the shelf (one lot; '' none: a gauge)
  also?: { input: string; ja: string }[];       // more lots it takes together (water, firewood)
  equipment: Omit<EquipmentView, 'equipmentId'> & { ja: string };   // what the world sets out for it
  moreEquipment?: (Omit<EquipmentView, 'equipmentId'> & { ja: string })[];
  step: ScienceStep;
  env: 'record' | 'simulation';                 // the weather it is given: the island's replayed record, or (checks only) a simulation
  energy?: (from: number, to: number) => EnergyOffer[];
  /** A process that ends when the operator does something (takes the tile off the rack): after how long, on its clock. */
  finish?: { action: string; afterMs: number };
  tend: 'stay' | 'leave';                       // hand work keeps Lantern at it; a process that only waits does not
  ready: boolean; waits?: string;               // not ready: what it waits for
}
/** What the materials are called in the record (the island's own words come later). */
export const MATERIAL_JA: Record<string, string> = { raw_clay: '粘土', bamboo: '竹', reed: '葦', limestone: '石灰岩', prepared_clay: '下ごしらえした粘土', settled_clay: '沈めた粘土', test_tile_green: '形づくった試験タイル', test_tile_dry: '乾いた試験タイル', process_water: '真水', coconut: 'ヤシの実', coconut_milk: 'ヤシのミルク', coconut_oil: 'ヤシ油', firewood: '薪' };
const handsW = (w: number) => (from: number, to: number): EnergyOffer[] => [{ sourceId: 'src:res-lantern-hands', kind: 'mechanical', maxJ: Math.round(((to - from) / 1000) * w) }];
const hands = handsW(3);
const TEST = SCIENCE_CATALOG_VERSION;
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
    ja: '粘土を水に浸して、こして沈める', input: 'raw_clay', inputJa: '粘土', also: [{ input: 'process_water', ja: '真水（乾いた土の1.5倍以上）' }],
    equipment: { kind: 'fixture_clay_tub', catalogEntry: 'fixture_clay_tub', catalogVersion: TEST, condition: 1, params: { capacityMl: 40000, surfaceCm2: 1500, sunExposure: 0 }, ja: '桶' },
    step: slakeStep, env: 'record', tend: 'leave',
    ready: false, waits: '真水の元と、' + NO_VESSEL },
  { processId: KNEAD_PROCESS.processId, processVersion: KNEAD_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: '沈めた粘土を練る', input: 'settled_clay', inputJa: '沈めた粘土',
    equipment: { kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: TEST, condition: 1, params: {}, ja: '作業台' },
    step: kneadStep, env: 'record', energy: handsW(25), tend: 'stay',
    ready: false, waits: '沈めた粘土（粘土の下ごしらえが島で動いてから）' },
  { processId: COCONUT_MILK_PROCESS.processId, processVersion: COCONUT_MILK_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'world',
    ja: 'ヤシの実を割って、削って、しぼる', input: 'coconut', inputJa: 'ヤシの実',
    equipment: { kind: 'fixture_coconut_tools', catalogEntry: 'fixture_coconut_tools', catalogVersion: TEST, condition: 1, params: {}, ja: '割る・削る・しぼる道具' },
    step: coconutMilkStep, env: 'record', energy: handsW(35), tend: 'stay',
    ready: false, waits: '浜のヤシの実を在庫にする決まり（何個・何 mg、腐った実）と、' + NO_VESSEL },
  { processId: COCONUT_BOIL_PROCESS.processId, processVersion: COCONUT_BOIL_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: 'ヤシのミルクを煮て油をとる', input: 'coconut_milk', inputJa: 'ヤシのミルク', also: [{ input: 'firewood', ja: '薪' }],
    equipment: { kind: 'fixture_cook_pot', catalogEntry: 'fixture_cook_pot', catalogVersion: TEST, condition: 1, params: { heatCapJPerK: 1800, uaWPerK: 3, heatShare: 0.2, capacityMl: 5000 }, ja: '鍋' },
    moreEquipment: [{ kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: TEST, condition: 1, params: { heatCapJPerK: 20000, uaWPerK: 8, chamberFraction: 0.2, maxBurnKgPerH: 2, forcedCoolingUaFactor: 0 }, ja: '焚き火' }],
    step: coconutBoilStep, env: 'record', tend: 'stay',
    ready: false, waits: 'ヤシのミルクと薪の在庫と、' + NO_VESSEL },
  { processId: BAROMETER_PROCESS.processId, processVersion: BAROMETER_PROCESS.processVersion, catalogVersion: TEST, contract: '0.2.1', clock: 'island',
    ja: '試験用の気圧計を置いて読む', input: '', inputJa: '',
    equipment: { kind: 'fixture_air_barometer', catalogEntry: 'fixture_air_barometer', catalogVersion: TEST, condition: 1, params: { bulbVolumeMl: 500, tubeBoreMm: 8, tubeLengthMm: 600, markMm: 5, bulbTauS: 900 }, ja: '試験用の気圧計' },
    step: barometerStep, env: 'record', tend: 'leave',
    ready: false, waits: '既製の試験用の設備で、島にはない。島で作る気圧計（器＋焼いた管＋水＋浮き）は別の工程になる' },
];
