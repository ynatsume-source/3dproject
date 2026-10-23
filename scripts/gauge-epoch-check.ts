// Headless check (a gauge set again, 2026-10-12; science: a new setup starts from its own zero): test data only — the
// island's tar chain run here to its weather pot, saved, and the save's two gauge runs given their older versions:
//  1 on load the old-version runs end (not re-labelled), their reservations freed; the pot's water the same lot, kept;
//    the island's water not doubled
//  2 set again: a new run each; a placing record (setup, the one before and why it ended, the water out and in, the
//    pressure and air of the moment kept for the world only); Lantern's diary says only that it was set again
//  3 nothing earlier dropped: old readings and guesses kept; absolute guesses archived when the setup changes
//  4 no reading compared across setups: a day-on-day guess raises nothing in the new setup's first day, and compares
//    within it after (its marks from the new zero)
//  5 a broken saved state: refused (corrupt-state), reservations freed, the water kept (its lot, or poured back into the
//    rain jar where there is a catcher — catchRain), set again with its record
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/gauge-epoch-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather, islandWait } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';
import { recentScienceRuns, readScienceRunSummary } from '../src/world/science-records';

let now = Date.parse('2026-10-06T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>(), KEY = 'seaglass.residents.v1';
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
Math.random = mulberry32(7);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const make = () => { const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']); R.setBrain(null); return R; };
const stepper = (R: any) => (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; } if (until?.()) return true; } return false; };
const M2 = 'm02x_air_barometer_test', M3 = 'm03x_air_barometer_pot', LIVE = ['starting', 'running', 'needs-input'];
const live = (lab: any, p: string) => Object.values(lab.runs).find((r: any) => r.processId === p && LIVE.includes(r.status)) as any;
const waterSum = (lab: any) => Object.values(lab.lots).filter((l: any) => l.materialId === 'process_water').reduce((s: number, l: any) => s + l.amount.value, 0);
const reserved = (lab: any, id: string) => [...Object.values(lab.lots), ...Object.values(lab.equipment)].filter((x: any) => x.reservedBy === id).length;
const waterOf = (lab: any, run: any) => run?.lotIds.find((id: string) => lab.lots[id]?.materialId === 'process_water');

// (the island as the tar chain leaves it — scripts/tar-chain-check.ts: the retort, a sealed jar with its tube, the weather pot)
let R: any = make(), lab = R.lab, step = stepper(R);
const jar = (ml: number, mg: number) => addLot(lab, { materialId: 'fired_pot', amount: { value: mg, unit: 'mg' }, location: 'shelf', quality: { form: 2, capacity_ml: ml, surface_cm2: Math.round(4.836 * Math.pow(ml, 2 / 3) * 1.2), absorption_ppm: 120_000, history_complete: 1 } });
lab.equipment['eq:cook_pot'] = { equipmentId: 'eq:cook_pot', kind: 'cook_pot', catalogEntry: 'cook_pot', catalogVersion: 'x', condition: 1, params: { capacityMl: 3000 } };
lab.equipment['eq:lamp_dish'] = { equipmentId: 'eq:lamp_dish', kind: 'lamp_dish', catalogEntry: 'lamp_dish', catalogVersion: 'x', condition: 1, params: { capacityMl: 100, absorptionPpm: 120000, massG: 250, shelter: 0.8, roofed: 1 } };
addLot(lab, { materialId: 'firewood', amount: { value: 30_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 250_000, history_complete: 1 } });
jar(2000, 1_400_000); jar(300, 420_000);
step(3600, () => !!lab.equipment['eq:tar_retort']);
step(2 * 86400, () => recentScienceRuns(lab).some(r => r.processId === 'p14x_charcoal_tar_retort' && r.status === 'completed'));
jar(500, 600_000);
addLot(lab, { materialId: 'bamboo', amount: { value: 3_000_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
addLot(lab, { materialId: 'process_water', amount: { value: 1_000_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
step(5 * 86400, () => !!live(lab, M3) && R.village.gaugeLog.filter((g: any) => g.processId === M3 && g.mark !== undefined).length >= 2 && !!live(lab, M2));
const old2 = live(lab, M2), old3 = live(lab, M3), oldWater = waterOf(lab, old3);
want('0 the island\'s two gauges running, read', !!old2 && !!old3 && !!oldWater, `${old2?.runId} ${old3?.runId} water ${oldWater}`);

// (the save, its gauge runs made older versions; a day-on-day guess that would cry out at any comparison at all)
R.save();
const s = JSON.parse(store.get(KEY)!);
delete s.village.hypoHistory; // a pre-change save has no archive field
s.lab.runs[old2.runId].processVersion = '0.1.2'; s.lab.runs[old3.runId].processVersion = '0.2.1';
s.village.hypo = { at: now - 3.6e6, by: 'lantern', mark: -1000, airs: [20], alarm: null, storms: [], hits: 2, falses: 1, misses: 0, leads: [3], status: 'held', heat: true };
s.village.hypo2 = { at: now - 3.6e6, by: 'lantern', mark: -1000, airs: [], alarm: null, storms: [], hits: 1, falses: 2, misses: 0, leads: [3], status: 'testing', heat: true, kind: 'day' };
store.set(KEY, JSON.stringify(s));
const savedLog = JSON.stringify(s.village.gaugeLog), savedHypo = JSON.stringify(s.village.hypo ?? null), water0 = waterSum(s.lab);
R = make(); lab = R.lab; step = stepper(R);
{ // 1
  const a = readScienceRunSummary(lab, old2.runId)!, b = readScienceRunSummary(lab, old3.runId)!, w = lab.lots[oldWater];
  want('1 the old-version runs ended, not re-labelled; reservations freed', a.status === 'stopped' && b.status === 'stopped' && /工程の版が変わった/.test(b.why) && a.processVersion === '0.1.2' && reserved(lab, old2.runId) + reserved(lab, old3.runId) === 0, `${a.status} ${a.why} / ${b.status} ${b.why}`);
  want('1 the pot\'s water the same lot, kept (250 g, free); the island\'s water the same', w?.amount.value === 250_000 && !w.reservedBy && waterSum(lab) === water0, `${oldWater} ${w?.amount.value} ${w?.reservedBy ?? 'free'}; ${waterSum(lab)} / ${water0}`);
  want('3 nothing dropped on load: the readings and the guesses as saved', JSON.stringify(R.village.gaugeLog) === savedLog && JSON.stringify(R.village.hypo ?? null) === savedHypo && R.village.hypo2?.hits === 1 && R.village.hypo2?.leads?.[0] === 3, `${R.village.gaugeLog.length} entries`);
}
const loadedAt = now;
step(2 * 86400, () => !!live(lab, M2) && !!live(lab, M3));
want('6 reinstallation retires the legacy absolute guess without losing its history', R.village.hypo === null && R.village.hypoHistory?.some((x: any) => JSON.stringify(x.hypothesis) === savedHypo));
const foundAt = now, new2 = live(lab, M2), new3 = live(lab, M3), placed = (id: string) => R.village.gaugeLog.find((g: any) => g.placed && g.runId === id);
{ // 2
  const p2 = placed(new2?.runId), p3 = placed(new3?.runId), lantern = R.list.find((r: any) => r.id === 'lantern');
  want('2 set again: new runs, each with a placing record (the one before, why it ended)', !!p2 && !!p3 && p2.placed.from === old2.runId && p3.placed.from === old3.runId && /版が変わった/.test(p3.placed.why), `${JSON.stringify(p2?.placed)} | ${JSON.stringify(p3?.placed)}`);
  want('2 the weather pot\'s record: the old water out, the new in; the moment\'s pressure and air for the world only', JSON.stringify(p3?.placed.lotsOut) === JSON.stringify([oldWater]) && p3?.placed.lotsIn.includes(waterOf(lab, new3)) && 'pressureHPa' in (p3?.placed ?? {}) && 'airC' in (p3 ?? {}) && waterSum(lab) === water0, `out ${p3?.placed.lotsOut} in ${p3?.placed.lotsIn}; ${p3?.placed.pressureHPa} hPa ${p3?.airC} °C; water ${waterSum(lab)}`);
  const said = lantern.diary.filter((d: any) => d.at >= loadedAt && /置き直した/.test(d.text)).map((d: any) => d.text);
  want('2 Lantern\'s diary: only that it was set again (no number)', said.length >= 2 && said.every((t: string) => !/\d/.test(t)), said.join(' / '));
}
const placedAt = placed(new2?.runId)?.at ?? foundAt,   // (the record's time; without one, when the new run was found)
  DAY = islandWait(24 * 3.6e6), tol = islandWait(1.6 * 3.6e6);
{ // 4
  step(3 * 86400, () => !!R.village.hypo2?.alarm || now > placedAt + DAY + 6 * tol);
  const reads = R.village.gaugeLog.filter((g: any) => g.processId === M2 && g.mark !== undefined && g.at > placedAt), al = R.village.hypo2?.alarm;
  want('4 new readings carry the new setup', reads.length > 0 && reads.every((g: any) => g.runId === new2.runId), `${reads.length} reads`);
  want('4 no comparison across the setups: the day-on-day guess raised nothing in the new setup\'s first day; it compared within it after', !!al && al.at >= placedAt + DAY - tol, al ? `alarm ${((al.at - placedAt) / DAY).toFixed(2)} island days after placing (d ${al.mark})` : 'no alarm');
  const oldKept = JSON.parse(savedLog), left = R.village.gaugeLog.filter((g: any) => g.at < loadedAt), evicted = oldKept.length - left.length;
  want('3 the old readings kept as they were (only the log\'s 400 cap ever drops the oldest)', JSON.stringify(left) === JSON.stringify(oldKept.slice(evicted)) && (evicted === 0 || R.village.gaugeLog.length === 400), `${left.length} of ${oldKept.length} kept, log ${R.village.gaugeLog.length}`);
}
{ // 5
  const run = live(lab, M3); R.save(); const s2 = JSON.parse(store.get(KEY)!); delete s2.lab.runs[run.runId].state.data.s.tMs; store.set(KEY, JSON.stringify(s2));
  const w0 = waterSum(s2.lab), wl = waterOf(lab, run);
  R = make(); lab = R.lab; step = stepper(R);
  step(6 * 3600, () => !LIVE.includes(lab.runs[run.runId]?.status));
  const r = readScienceRunSummary(lab, run.runId)!;
  step(2 * 86400, () => !!live(lab, M3));
  const again = live(lab, M3), p = placed(again?.runId);
  want('5 a broken saved state refused, reservations freed, the water kept, set again with its record', r.status === 'failed' && /corrupt/.test(r.why) && reserved(lab, run.runId) === 0 && (lab.lots[wl]?.amount.value === 250_000 || (!lab.lots[wl] && !!R.village.catcher)) && !!p && p.placed.from === run.runId && /corrupt/.test(p.placed.why) && JSON.stringify(p.placed.lotsOut) === JSON.stringify([wl]) && waterSum(lab) === w0, `${r.status} ${r.why?.slice(0, 40)}; ${JSON.stringify(p?.placed)}; water ${waterSum(lab)} / ${w0}`);
}
{ // 6: a corrupt test-gauge state also ends and releases reservations; its replacement gets a new setup.
  const run = live(lab, M2); R.save(); const s3 = JSON.parse(store.get(KEY)!);
  delete s3.lab.runs[run.runId].state.data.lastTo; store.set(KEY, JSON.stringify(s3));
  R = make(); lab = R.lab; step = stepper(R);
  step(6 * 3600, () => !LIVE.includes(lab.runs[run.runId]?.status));
  step(2 * 86400, () => !!live(lab, M2));
  const again = live(lab, M2), p = placed(again?.runId), old = readScienceRunSummary(lab, run.runId)!;
  want('6 broken test gauge refused and reinstalled with reason and released equipment', old.status === 'failed' && /corrupt/.test(old.why) && reserved(lab, old.runId) === 0 && again?.runId !== old.runId && p?.placed.from === old.runId && /corrupt/.test(p.placed.why));
  step(6 * 3600, () => R.village.hypo?.runId === again?.runId);
  want('6 new absolute hypothesis belongs to the replacement test gauge', R.village.hypo?.runId === again?.runId && R.village.hypo?.processId === M2);
}
{ // 7: actual residents save/load, not just a JSON clone; no user storage involved.
  R.save(); const saved = JSON.parse(store.get(KEY)!);
  R = make(); lab = R.lab; R.save(); const restored = JSON.parse(store.get(KEY)!);
  const keys = ['gaugeLog', 'hypo', 'hypo2', 'hypoHistory'];
  want('7 save/restore preserves readings, placement records, active guesses and archived guesses exactly', keys.every((k) => JSON.stringify(saved.village[k]) === JSON.stringify(restored.village[k])));
  want('7 save/restore preserves water and live setup identities', waterSum(lab) === waterSum(saved.lab) && [M2, M3].every((p) => live(lab, p)?.runId === live(saved.lab, p)?.runId));
  const history = JSON.stringify(R.village.hypoHistory), runId = live(lab, M2)?.runId;
  step = stepper(R); step(3600, () => R.village.gaugeLog.some((g: any) => g.runId === runId && g.mark !== undefined && g.at > saved.clockMs));
  want('7 normal same-setup continuation does not archive the restored active hypothesis again', R.village.hypo?.runId === runId && JSON.stringify(R.village.hypoHistory) === history);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
