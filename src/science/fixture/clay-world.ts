// The clay test world: every material and facility here is a declared test fixture.
// Nothing in this file claims that Kayama-jima has this clay, wood supply or water.

import { type Composition } from '../chem';
import type { Facility, MaterialLot, Provenance, WorldView } from '../types';
import { TestWorld } from './world';

export const FIXTURE: Provenance = {
  kind: 'test-fixture',
  note: '試験世界の仮定。嘉弥真島で確認した資源・設備ではなく、本世界の在庫・歴史へ混ぜない',
  countsForWorldAchievement: false,
};

/** Test clay "A": a composition chosen inside the range of common earthenware clays. Assumed, not measured. */
export function clayA(dryMg: number, waterRatio: number): Composition {
  const f = { kaolinite: 0.45, quartz: 0.30, inert_mineral: 0.21, calcite: 0.02, organic_c: 0.02 };
  const c: Composition = {};
  let acc = 0;
  for (const [k, v] of Object.entries(f)) { const m = Math.round(dryMg * v); c[k as keyof typeof f] = m; acc += m; }
  c.inert_mineral = (c.inert_mineral ?? 0) + (dryMg - acc);
  c.water = Math.round(dryMg * waterRatio);
  return c;
}

/** Air-dry firewood: 15% moisture (wet basis), 1% ash on the dry part (assumptions). */
export function firewood(totalMg: number): Composition {
  const water = Math.round(totalMg * 0.15);
  const dry = totalMg - water;
  const ash = Math.round(dry * 0.01);
  return { water, ash, wood_dry: dry - ash };
}

const lot = (l: Omit<MaterialLot, 'version' | 'provenance' | 'protected'> & Partial<MaterialLot>): MaterialLot =>
  ({ provenance: FIXTURE, protected: false, version: 1, ...l });
const fac = (f: Omit<Facility, 'version' | 'provenance' | 'condition' | 'occupiedBy' | 'exists'> & Partial<Facility>): Facility =>
  ({ provenance: FIXTURE, condition: 'ok', occupiedBy: null, exists: true, version: 1, ...f });

export function createClayTestWorld(): TestWorld {
  const lots: MaterialLot[] = [
    lot({ id: 'clay-A', kind: 'clay', label: '試験粘土A（仮想）', comp: clayA(1_200_000, 0.10), location: 'store:test' }),
    lot({ id: 'water-work', kind: 'water', label: '作業用の水（試験用の雨水タンク）', comp: { water: 20_000_000 }, location: 'store:test' }),
    lot({ id: 'water-life', kind: 'water', label: '暮らし用の水（保護）', comp: { water: 10_000_000 }, location: 'store:life', protected: true }),
    lot({ id: 'wood-research', kind: 'fuel', label: '薪（研究に回せる分）', comp: firewood(150_000_000), location: 'store:test', unitMg: 2_000_000, unitLabel: '束' }),
    lot({ id: 'wood-life', kind: 'fuel', label: '薪（煮炊き用・保護）', comp: firewood(20_000_000), location: 'store:life', protected: true, unitMg: 2_000_000, unitLabel: '束' }),
  ];
  const facilities: Facility[] = [
    fac({ id: 'rack-shade', kind: 'drying_shade', label: '日陰の乾燥棚', capacitySamples: 12 }),
    fac({ id: 'rack-sun', kind: 'drying_sun', label: '日なたの乾燥台', capacitySamples: 12 }),
    fac({ id: 'open-fire', kind: 'open_fire', label: '地面の焚き火（覆いなし）', capacitySamples: 6,
      thermal: { heatCapJPerK: 20e3, uaWPerK: 30, chamberFraction: 0.2, maxBurnKgPerH: 25, forcedCoolingUaFactor: 2 } }),
    fac({ id: 'kiln-fixture', kind: 'kiln', label: '試験用の小窯（既製・対照設備）', capacitySamples: 8,
      thermal: { heatCapJPerK: 40e3, uaWPerK: 8, chamberFraction: 0.3, maxBurnKgPerH: 15, forcedCoolingUaFactor: 5 } }),
    fac({ id: 'kiln-brick-planned', kind: 'kiln', label: 'れんがの窯（計画のみ）', capacitySamples: 8, exists: false,
      thermal: { heatCapJPerK: 80e3, uaWPerK: 6, chamberFraction: 0.35, maxBurnKgPerH: 20, forcedCoolingUaFactor: 5 } }),
    fac({ id: 'basin', kind: 'soak_basin', label: '浸漬用の桶', capacitySamples: 1 }),
    fac({ id: 'basin-2', kind: 'soak_basin', label: '浸漬用の桶（二つ目）', capacitySamples: 1 }),
    fac({ id: 'balance', kind: 'balance', label: '試験用のはかり（0.1 g）', capacitySamples: 1, instrument: { resolutionMg: 100 } }),
  ];
  const view: WorldView = {
    lots: Object.fromEntries(lots.map((l) => [l.id, l])),
    samples: {}, facilities: Object.fromEntries(facilities.map((f) => [f.id, f])),
    reservations: {}, runs: {}, observations: {}, research: {}, procedures: {},
  };
  return TestWorld.create('civ-sim-test-clay-1', view);
}
