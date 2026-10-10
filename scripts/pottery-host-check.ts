// Headless check of main's side of the pots (science final review 2026-10-07-pottery: p11y_pot_shape 0.1.0, p12y_pot_dry
// 0.1.1), with the island's catalog entries as they are listed (world/process-catalog.ts):
//  1 coiling a cook pot by hand: no equipment; the first request carries the entry's plan, the later ones nothing; the
//    pot made, what clay is left back as prepared_clay
//  2 drying it on the rack under leaves, in the island's replayed weather (temperature, humidity and wind as recorded);
//    taken off part-dried, it is still a green pot and carries how far it has dried; a second run goes on from there to
//    a dry pot
//  3 the island's pit fire entry (p13y 0.2.1): two dry pots in one fire with the seasoned wood — both fired, one run
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/pottery-host-check.ts
import { emptyLedger, addLot, startRun, advance, toReal, type Ledger } from '../src/world/process-runner';
import { CATALOG } from '../src/world/process-catalog';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import type { EnvironmentSample } from '../src/world/science-contract';

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${typeof got === 'string' ? got : JSON.stringify(got)} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
const shapeE = CATALOG.find((c) => c.processId === 'p11y_pot_shape')!, dryE = CATALOG.find((c) => c.processId === 'p12y_pot_dry')!;
// (the weather as the residents give it: residents.ts envFor)
const env = (clock: 'world' | 'island') => (at: number): EnvironmentSample => {
  const w = islandWeather(toReal(clock, at));
  return w ? { sampleId: `env:record:t:${at}`, source: 'record', effectiveAt: at, airTempC: w.air, humidity: w.humidity, windMs: w.windMeasured, windHeightM: 28.9, rainMmH: w.rainMeasured, pressureHPa: w.pressureMeasured } : { sampleId: `env:none:${at}`, source: 'unknown', effectiveAt: at };
};
const L: Ledger = emptyLedger('dotworld', 'e1');
addLot(L, { lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 6_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 200_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 400_000 } });
const T0 = Date.parse('2026-10-06T10:00:00+09:00');
let pot: any = null, dryPot: any = null;
{ // 1
  want('1 the entry: the hands only, and what to make', shapeE.equipment === null && shapeE.start?.action === 'plan' && shapeE.start.params.form === 1);
  const { run, why } = startRun(L, { processId: shapeE.processId, processVersion: shapeE.processVersion, catalogVersion: shapeE.catalogVersion, contract: shapeE.contract, clock: shapeE.clock, lotIds: ['lot:clay'], equipmentIds: [], operator: 'res:lantern' }, T0);
  want('1 started with no equipment', !!run, why ?? '');
  const start = run!.lastTo, out: any[] = [];
  for (let k = 1; k <= 12 && !['completed', 'failed', 'cancelled'].includes(L.runs[run!.runId].status); k++)
    out.push(...advance(L, run!.runId, shapeE.step, { realNow: T0 + k * 15 * 60_000, environment: env('world'), energy: shapeE.energy, actions: [{ at: start, action: shapeE.start!.action, params: shapeE.start!.params }] }));
  const made = out.flatMap((c) => c.produced ?? []);
  pot = made.find((l: any) => l.materialId === 'green_pot');
  want('1 a cook pot coiled by hand (the plan in the first request only)', out.every((c) => c.ok) && L.runs[run!.runId].status === 'completed' && !!pot && pot.quality?.form === 1 && pot.quality?.capacity_ml === 3000, out.filter((c) => !c.ok).map((c) => c.why ?? c.error)[0] ?? pot?.quality);
  want('1 what clay is left comes back as prepared_clay', made.some((l: any) => l.materialId === 'prepared_clay') && !L.lots['lot:clay'], made.map((l: any) => `${l.materialId} ${l.amount.value}`));
}
{ // 2
  L.equipment['eq:rack'] = { equipmentId: 'eq:rack', ...dryE.equipment!, ja: undefined } as any;
  delete (L.equipment['eq:rack'] as any).ja;
  const spec = { processId: dryE.processId, processVersion: dryE.processVersion, catalogVersion: dryE.catalogVersion, contract: dryE.contract, clock: dryE.clock, equipmentIds: ['eq:rack'], operator: 'res:lantern' };
  const T1 = T0 + 4 * 3600e3;
  const r1 = startRun(L, { ...spec, lotIds: [pot.lotId] }, T1).run!;
  const off = r1.lastTo + 36 * 3600e3;   // (taken off after a day and a half of its clock)
  const a = advance(L, r1.runId, dryE.step, { realNow: T1 + 6 * 3600e3, environment: env('island'), actions: [{ at: off, action: 'take_off' }] });
  const half = a.flatMap((c) => c.produced ?? []).find((l: any) => l.materialId === 'green_pot' || l.materialId === 'dry_pot');
  want('2 taken off part-dried: still a green pot, how far it dried carried', a.every((c) => c.ok) && half?.materialId === 'green_pot' && half.quality?.dry_stage !== undefined && half.quality?.dry_flux_ratio_max_ppm !== undefined, a.filter((c) => !c.ok).map((c) => c.why ?? c.error)[0] ?? half?.quality);
  const T2 = T1 + 7 * 3600e3, r2 = startRun(L, { ...spec, lotIds: [half.lotId] }, T2).run!;
  const b = advance(L, r2.runId, dryE.step, { realNow: T2 + 30 * 3600e3, environment: env('island'), actions: [{ at: r2.lastTo + dryE.finish!.afterMs, action: dryE.finish!.action }] });
  const dry = b.flatMap((c) => c.produced ?? []).find((l: any) => l.materialId === 'dry_pot'); dryPot = dry;
  want('2 a second run goes on from there to a dry pot', b.every((c) => c.ok) && !!dry && dry.quality?.dry_stage === 2, b.filter((c) => !c.ok).map((c) => c.why ?? c.error)[0] ?? b.flatMap((c) => c.produced ?? []).map((l: any) => l.materialId));
}
{ // 3
  const fireE = CATALOG.find((c) => c.processId === 'p13y_pot_pit_fire')!;
  const second = addLot(L, { materialId: 'dry_pot', amount: { ...dryPot.amount }, location: 'shelf', quality: { ...dryPot.quality } });
  const wood = addLot(L, { materialId: 'firewood', amount: { value: 35_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 260_000, history_complete: 1 } });
  L.equipment['eq:fire'] = { equipmentId: 'eq:fire', ...fireE.equipment! } as any; delete (L.equipment['eq:fire'] as any).ja;
  want('3 the entry takes up to three pots at once', fireE.batch === 3 && !!fireE.inputOk?.(dryPot) && !!fireE.inputOk?.(second));
  const T3 = T0 + 60 * 3600e3, run = startRun(L, { processId: fireE.processId, processVersion: fireE.processVersion, catalogVersion: fireE.catalogVersion, contract: fireE.contract, clock: fireE.clock, lotIds: [dryPot.lotId, second.lotId, wood.lotId], equipmentIds: ['eq:fire'], operator: 'res:lantern' }, T3).run!;
  const out = advance(L, run.runId, fireE.step, { realNow: T3 + 30 * 3600e3, environment: env('island'), actions: [{ at: run.lastTo, action: fireE.start!.action, params: fireE.start!.params }] });
  const fired = out.flatMap((c) => c.produced ?? []).filter((l: any) => l.materialId === 'fired_pot');
  want('3 two pots fired in one fire', out.every((c) => c.ok) && L.runs[run.runId].status === 'completed' && fired.length === 2, `${L.runs[run.runId].status} ${L.runs[run.runId].why ?? ''} ${out.filter((c) => !c.ok).map((c) => c.why)[0] ?? ''} fired ${fired.length}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
