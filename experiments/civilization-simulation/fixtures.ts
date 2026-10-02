import { MODEL_VERSION, PHYSICS, PROCESS } from '../../src/science/fixture-profile.ts';
import type { Equipment, FixtureOptions, MaterialLot, World } from './types.ts';
export function createFixture(options: FixtureOptions = {}): World {
  const defaults = { dryerEnergyJ: 200_000, dryerPowerW: 100,
    dryerMaxTemperatureC: 120, workEnergyJ: 1000, balanceEnergyJ: 1000 };
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('invalid-options');
  for (const key of Object.keys(options)) if (!Object.hasOwn(defaults, key)) throw new Error('unknown-option');
  const config = { ...defaults, ...options };
  for (const value of Object.values(config)) {
    if (!Number.isFinite(value) || value < 0 || value > 1e9) throw new Error('invalid-options');
  }
  const lot = (id: string): MaterialLot => ({ id, solidMg: 100_000, waterMg: 20_000,
    temperatureC: PHYSICS.ambientC, form: 'prepared-clay', thicknessMm: null,
    location: 'storage', revision: 0, origin: 'external-test-fixture:prepared-clay',
    history: [], reservedBy: null });
  const device = (id: string, processId: Equipment['processId'], energyJ: number,
    maxPowerW: number, maxTemperatureC = 20): Equipment => ({ id, processId,
    revision: 0, available: true, reservedBy: null, initialEnergyJ: energyJ,
    energyJ, maxPowerW, maxTemperatureC });
  return { scope: 'test-fixture', modelVersion: MODEL_VERSION,
    worldId: 'civilization-lab', worldEpoch: 'lab-epoch-1', worldVersion: 0,
    worldTime: Date.UTC(2026, 9, 2), paused: false, options: config,
    lots: { a: lot('a'), b: lot('b') }, equipment: {
      bench: device('bench', PROCESS.shape.id, config.workEnergyJ, 2),
      dryer: device('dryer', PROCESS.dry.id, config.dryerEnergyJ, config.dryerPowerW, config.dryerMaxTemperatureC),
      balance: device('balance', PROCESS.weigh.id, config.balanceEnergyJ, 1),
    }, runs: {}, observations: [], events: [], commands: [],
    initialSolidMg: 200_000, initialWaterMg: 40_000 };
}
