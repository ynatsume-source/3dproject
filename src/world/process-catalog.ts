// The science processes Dot's world can run (ADR 0002, 0006): which step computes it, on which clock, what it takes
// from the shelf, what equipment the world sets out for it, and whether it can run here yet. Lantern runs a process
// only when its entry is ready and its material is on the shelf; the world runs it (src/world/process-runner.ts).
//
// Ready means the science side accepts this world as it is: the island's weather is a replayed record
// (environment.source 'record', contract 0.2.1, fixture-4), which the science team has made and which waits for
// Codex's review before it is taken in. Until then the entries say what they wait for, and nothing runs on the island.
import type { EnergyOffer, EquipmentView, ScienceStep } from './science-contract';
import type { ProcessClock } from './process-runner';
import { simpleFixtureStep } from '../science/step/simple';
import { dryingStep, DRYING_PROCESS, SCIENCE_CATALOG_VERSION } from '../science/step/drying';

export interface CatalogEntry {
  processId: string; processVersion: string; catalogVersion: string; contract: string; clock: ProcessClock;
  ja: string;                                   // what Lantern is doing, as the record says it
  input: string; inputJa: string;               // the material it takes from the shelf (one lot)
  equipment: Omit<EquipmentView, 'equipmentId'> & { ja: string };   // what the world sets out for it
  step: ScienceStep;
  env: 'record' | 'simulation';                 // the weather it is given: the island's replayed record, or (checks only) a simulation
  energy?: (from: number, to: number) => EnergyOffer[];
  /** A process that ends when the operator does something (takes the tile off the rack): after how long, on its clock. */
  finish?: { action: string; afterMs: number };
  tend: 'stay' | 'leave';                       // hand work keeps Lantern at it; a process that only waits does not
  ready: boolean; waits?: string;               // not ready: what it waits for
}
/** What the materials are called in the record (the island's own words come later). */
export const MATERIAL_JA: Record<string, string> = { raw_clay: '粘土', bamboo: '竹', reed: '葦', limestone: '石灰岩', prepared_clay: '下ごしらえした粘土', test_tile_green: '形づくった試験タイル', test_tile_dry: '乾いた試験タイル' };
const hands = (from: number, to: number): EnergyOffer[] => [{ sourceId: 'src:res-lantern-hands', kind: 'mechanical', maxJ: Math.round(((to - from) / 1000) * 3) }];
export const CATALOG: CatalogEntry[] = [
  { processId: 'p11x_test_tile_shape', processVersion: 'fixture-3', catalogVersion: 'civ-sci-test-2', contract: '0.2.0', clock: 'world',
    ja: '粘土で試験タイルを形づくる', input: 'prepared_clay', inputJa: '下ごしらえした粘土',
    equipment: { kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 }, ja: '型と作業台' },
    step: simpleFixtureStep, env: 'record', energy: hands, tend: 'stay',
    ready: false, waits: '科学の fixture-4（島の天気の再生 record を許す版）と、生の粘土の下ごしらえの工程' },
  { processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION, contract: '0.1.0', clock: 'island',
    ja: '試験タイルを棚で乾かす', input: 'test_tile_green', inputJa: '形づくった試験タイル',
    equipment: { kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { sunExposure: 0 }, ja: '乾燥の棚' },
    step: dryingStep, env: 'record', finish: { action: 'take_off', afterMs: 6 * 86_400_000 }, tend: 'leave',
    ready: false, waits: '接続仕様 0.2.1（environment.source record）' },
];
