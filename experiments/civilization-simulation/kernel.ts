import { MODEL_VERSION, PHYSICS as P, PROCESS } from '../../src/science/fixture-profile.ts';
import { createFixture } from './fixtures.ts';
import type { Command, Equipment, MaterialLot, ProcessRun, World } from './types.ts';

function requireThat(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
function validateCommand(c: Command) {
  requireThat(c && typeof c === 'object' && !Array.isArray(c), 'invalid-command');
  requireThat(typeof c.commandId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(c.commandId), 'invalid-command-id');
  requireThat(integer(c.expectedVersion, 0, Number.MAX_SAFE_INTEGER), 'invalid-version');
  const fields: Record<string, string[]> = {
    start: ['processId', 'lotId', 'equipmentId', 'expectedLotRevision', 'expectedEquipmentRevision', 'thicknessMm', 'durationLimitS'],
    advance: ['seconds'], cancel: ['runId'], pause: [], resume: [],
  };
  requireThat(Object.hasOwn(fields, c.kind), 'unknown-command');
  const allowed = ['commandId', 'worldId', 'worldEpoch', 'expectedVersion', 'kind', ...fields[c.kind]];
  requireThat(Object.keys(c).every(k => allowed.includes(k)), 'unknown-command-field');
  if (c.kind === 'start') {
    requireThat(typeof c.processId === 'string' && typeof c.lotId === 'string' && typeof c.equipmentId === 'string', 'invalid-start');
    requireThat(integer(c.expectedLotRevision, 0, Number.MAX_SAFE_INTEGER) && integer(c.expectedEquipmentRevision, 0, Number.MAX_SAFE_INTEGER), 'invalid-revision');
    if (c.thicknessMm !== undefined) requireThat(integer(c.thicknessMm, 1, 20), 'invalid-thickness');
    if (c.durationLimitS !== undefined) requireThat(integer(c.durationLimitS, 1, 86400), 'invalid-duration');
  }
  if (c.kind === 'advance') requireThat(integer(c.seconds, 1, 86400), 'invalid-time');
  if (c.kind === 'cancel') requireThat(typeof c.runId === 'string', 'invalid-run-id');
}
function emit(w: World, c: Command, type: string, subjectIds: string[], payload: Record<string, unknown> = {}) {
  w.worldVersion++;
  w.events.push({ eventId: `${w.worldEpoch}:${w.worldVersion}`, worldId: w.worldId,
    worldEpoch: w.worldEpoch, worldVersion: w.worldVersion, worldTime: w.worldTime,
    commandId: c.commandId, catalogVersion: MODEL_VERSION, type, subjectIds, payload });
}
function capacity(l: MaterialLot) { return (l.solidMg * P.solidSpecificHeatJPerKgK + l.waterMg * P.waterSpecificHeatJPerKgK) / 1e6; }
function sensible(l: MaterialLot) { return capacity(l) * (l.temperatureC - P.ambientC); }
function consume(e: Equipment, r: ProcessRun, inputJ: number) {
  requireThat(Number.isFinite(inputJ) && inputJ >= 0 && inputJ <= e.energyJ + 1e-8 && inputJ <= e.maxPowerW + 1e-8, 'energy-overdraw');
  e.energyJ = Math.max(0, e.energyJ - inputJ); r.inputJ += inputJ;
}
function finish(w: World, c: Command, r: ProcessRun) {
  const l = w.lots[r.lotId], e = w.equipment[r.equipmentId];
  r.status = r.failure ? 'failed' : 'completed'; r.stage = 'finished'; r.endedAtMs = w.worldTime;
  l.reservedBy = null; l.location = 'storage'; l.revision++; l.history.push(r.id);
  e.reservedBy = null; e.revision++;
  if (!r.failure && r.processId === PROCESS.shape.id) { l.form = 'coupon'; l.thicknessMm = r.thicknessMm; }
  if (!r.failure && r.processId === PROCESS.weigh.id) {
    w.observations.push({ runId: r.id, lotId: l.id, worldTime: w.worldTime,
      instrumentId: e.id, measuredMassMg: Math.round((l.solidMg + l.waterMg) / PROCESS.weigh.resolutionMg) * PROCESS.weigh.resolutionMg,
      resolutionMg: PROCESS.weigh.resolutionMg });
  }
  emit(w, c, r.failure ? 'ProcessFailed' : 'ProcessCompleted', [r.id, l.id, e.id], {
    failure: r.failure, inputJ: r.inputJ, vaporMg: r.vaporMg, retainedWaterMg: l.waterMg,
  }); // World facts; NOT resident-visible observations.
}
function start(w: World, c: Extract<Command, { kind: 'start' }>) {
  requireThat(Object.values(PROCESS).some(p => p.id === c.processId), 'unsupported-process');
  const l = Object.hasOwn(w.lots, c.lotId) ? w.lots[c.lotId] : undefined;
  const e = Object.hasOwn(w.equipment, c.equipmentId) ? w.equipment[c.equipmentId] : undefined;
  requireThat(l && e, 'missing-resource');
  requireThat(l.revision === c.expectedLotRevision && e.revision === c.expectedEquipmentRevision, 'stale-resource');
  requireThat(!l.reservedBy && !e.reservedBy, 'resource-reserved');
  requireThat(e.available && e.processId === c.processId && e.maxPowerW > 0 && e.energyJ > 0, 'equipment-unavailable');
  if (c.processId === PROCESS.shape.id) {
    requireThat(l.form === 'prepared-clay' && l.waterMg > 0, 'not-prepared-clay');
    requireThat(c.thicknessMm !== undefined && c.durationLimitS === undefined, 'shape-parameters');
  } else if (c.processId === PROCESS.dry.id) {
    requireThat(l.form === 'coupon' && l.waterMg > 0, 'not-wet-coupon');
    requireThat(c.thicknessMm === undefined, 'dry-parameters');
    requireThat(e.maxTemperatureC > PROCESS.dry.targetC, 'temperature-capability');
    requireThat(Math.abs(l.temperatureC - P.ambientC) < 1e-8, 'sample-not-cooled');
  } else {
    requireThat(l.temperatureC <= 35, 'sample-too-hot');
    requireThat(c.thicknessMm === undefined && c.durationLimitS === undefined, 'measure-parameters');
  }
  const id = `run:${c.commandId}`;
  w.runs[id] = { id, processId: e.processId, modelVersion: MODEL_VERSION,
    lotId: l.id, equipmentId: e.id, equipmentRevision: e.revision,
    status: 'running', stage: e.processId === PROCESS.dry.id ? 'heating' : 'work',
    startedAtMs: w.worldTime, endedAtMs: null, elapsedS: 0, activeS: 0,
    durationLimitS: c.durationLimitS ?? 86400, thicknessMm: c.thicknessMm ?? l.thicknessMm,
    failure: null, inputJ: 0, wasteHeatJ: 0, vaporEnthalpyJ: 0, coolingHeatJ: 0, vaporMg: 0 };
  l.reservedBy = id; l.location = 'equipment'; l.revision++; e.reservedBy = id;
  emit(w, c, 'ProcessStarted', [id, l.id, e.id], { processId: e.processId });
}
function tick(w: World, c: Command, r: ProcessRun) {
  if (r.status !== 'running') return;
  const l = w.lots[r.lotId], e = w.equipment[r.equipmentId];
  r.elapsedS++;
  if (r.stage === 'work') {
    const p = r.processId === PROCESS.shape.id ? PROCESS.shape : PROCESS.weigh;
    if (e.energyJ + 1e-8 < p.powerW || e.maxPowerW < p.powerW) { r.failure = 'energy-exhausted'; finish(w, c, r); return; }
    consume(e, r, p.powerW); r.wasteHeatJ += p.powerW; r.activeS++;
    if (r.activeS >= p.seconds) finish(w, c, r);
    return;
  }
  if (r.stage === 'cooling') {
    const heat = Math.min(P.coolingW, sensible(l));
    r.coolingHeatJ += heat;
    l.temperatureC = Math.max(P.ambientC, l.temperatureC - heat / capacity(l));
    if (l.temperatureC - P.ambientC < 1e-8) { l.temperatureC = P.ambientC; finish(w, c, r); }
    return;
  }
  if (r.activeS >= r.durationLimitS) { r.failure = 'duration-limit'; r.stage = 'cooling'; return; }
  r.activeS++;
  const availableHeat = Math.min(e.energyJ, e.maxPowerW) * P.dryerEfficiency;
  if (r.stage === 'heating') {
    const needed = capacity(l) * (PROCESS.dry.targetC - l.temperatureC);
    const heat = Math.min(needed, availableHeat);
    consume(e, r, heat / P.dryerEfficiency);
    r.wasteHeatJ += heat * (1 / P.dryerEfficiency - 1);
    l.temperatureC = Math.min(PROCESS.dry.targetC, l.temperatureC + heat / capacity(l));
    if (PROCESS.dry.targetC - l.temperatureC < 1e-8) { l.temperatureC = PROCESS.dry.targetC; r.stage = 'evaporating'; }
    if (e.energyJ < 1e-8) { r.failure = 'energy-exhausted'; r.stage = 'cooling'; }
    return;
  }
  // Whole mg only. Mass-transfer and power limits both apply; unused source energy stays in its reservoir.
  const rate = Math.max(1, Math.floor(P.baseEvaporationMgPerS * 5 / l.thicknessMm!));
  const removedMg = Math.min(l.waterMg, rate, Math.floor((availableHeat + 1e-10) * 1e6 / P.latentHeatJPerKg));
  if (removedMg === 0) { r.failure = 'insufficient-evaporation-power-or-energy'; r.stage = 'cooling'; return; }
  const latent = removedMg / 1e6 * P.latentHeatJPerKg;
  const exportedSensible = removedMg / 1e6 * P.waterSpecificHeatJPerKgK * (l.temperatureC - P.ambientC);
  consume(e, r, latent / P.dryerEfficiency);
  r.wasteHeatJ += latent * (1 / P.dryerEfficiency - 1);
  r.vaporEnthalpyJ += latent + exportedSensible; r.vaporMg += removedMg; l.waterMg -= removedMg;
  if (l.waterMg === 0) r.stage = 'cooling';
}

/** Pure transactional reducer: callers retain the original state on any rejected command. */
export function applyCommand(current: World, command: Command): World {
  validateCommand(command);
  requireThat(command.worldId === current.worldId && command.worldEpoch === current.worldEpoch, 'wrong-world-or-epoch');
  const previous = current.commands.find(c => c.commandId === command.commandId);
  if (previous) { requireThat(canonical(previous) === canonical(command), 'command-id-conflict'); return current; }
  requireThat(current.worldVersion === command.expectedVersion, 'stale-world');
  requireThat(!current.paused || command.kind === 'resume', 'world-paused');
  const w = structuredClone(current);
  if (command.kind === 'start') start(w, command);
  else if (command.kind === 'advance') {
    for (let s = 0; s < command.seconds; s++) {
      w.worldTime += 1000;
      for (const r of Object.values(w.runs)) tick(w, command, r);
    }
    emit(w, command, 'TimeAdvanced', [], { seconds: command.seconds });
  } else if (command.kind === 'cancel') {
    const r = Object.hasOwn(w.runs, command.runId) ? w.runs[command.runId] : undefined;
    requireThat(r && r.status === 'running', 'run-not-active');
    r.failure = 'cancelled';
    if (r.processId === PROCESS.dry.id) r.stage = 'cooling';
    else finish(w, command, r);
    emit(w, command, 'ProcessCancelled', [r.id]);
  } else {
    requireThat(command.kind === 'pause' ? !w.paused : w.paused, 'invalid-pause-state');
    w.paused = command.kind === 'pause'; emit(w, command, w.paused ? 'WorldPaused' : 'WorldResumed', []);
  }
  w.commands.push(structuredClone(command));
  assertConservation(w);
  return w;
}
export function audit(w: World) {
  const lots = Object.values(w.lots), runs = Object.values(w.runs);
  const vaporMg = runs.reduce((n, r) => n + r.vaporMg, 0);
  const inputJ = runs.reduce((n, r) => n + r.inputJ, 0);
  const destinationsJ = runs.reduce((n, r) => n + r.wasteHeatJ + r.vaporEnthalpyJ + r.coolingHeatJ, 0) + lots.reduce((n, l) => n + sensible(l), 0);
  return { solidResidualMg: w.initialSolidMg - lots.reduce((n, l) => n + l.solidMg, 0),
    waterResidualMg: w.initialWaterMg - lots.reduce((n, l) => n + l.waterMg, 0) - vaporMg,
    energyResidualJ: inputJ - destinationsJ, inputJ, destinationsJ, vaporMg,
    supplyResidualJ: Object.values(w.equipment).reduce((n, e) => n + e.initialEnergyJ - e.energyJ, 0) - inputJ };
}
export function assertConservation(w: World) {
  requireThat(w.scope === 'test-fixture' && w.modelVersion === MODEL_VERSION, 'unsupported-world');
  for (const l of Object.values(w.lots)) {
    requireThat(integer(l.solidMg, 0, 1e9) && integer(l.waterMg, 0, 1e9), 'invalid-mass');
    requireThat(Number.isFinite(l.temperatureC) && l.temperatureC >= P.ambientC && l.temperatureC <= PROCESS.dry.targetC, 'invalid-temperature');
    requireThat(!l.reservedBy || w.runs[l.reservedBy]?.status === 'running', 'invalid-lot-reservation');
  }
  for (const e of Object.values(w.equipment)) {
    requireThat(Number.isFinite(e.energyJ) && e.energyJ >= 0 && e.energyJ <= e.initialEnergyJ, 'invalid-energy');
    requireThat(!e.reservedBy || w.runs[e.reservedBy]?.status === 'running', 'invalid-equipment-reservation');
  }
  const a = audit(w);
  requireThat(a.solidResidualMg === 0 && a.waterResidualMg === 0, 'mass-balance');
  requireThat(Math.abs(a.energyResidualJ) < 1e-6 && Math.abs(a.supplyResidualJ) < 1e-6, 'energy-balance');
}
/** Checkpoints replay validated commands; arbitrary deserialized material state is never accepted. */
export function checkpoint(w: World): string {
  return JSON.stringify({ modelVersion: MODEL_VERSION, options: w.options, commands: w.commands });
}
export function restoreCheckpoint(json: string): World {
  const saved = JSON.parse(json);
  requireThat(saved && saved.modelVersion === MODEL_VERSION && Array.isArray(saved.commands) && saved.commands.length <= 10_000, 'invalid-checkpoint');
  let w = createFixture(saved.options);
  let seconds = 0;
  for (const command of saved.commands) {
    if (command.kind === 'advance') seconds += command.seconds;
    requireThat(Number.isFinite(seconds) && seconds <= 1_000_000, 'checkpoint-time-limit');
    w = applyCommand(w, command);
  }
  return w;
}
