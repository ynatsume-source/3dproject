// Headless check (ADR 0006 addendum: main assembles a lot into equipment, science gives the table). The table here
// stands in for the science side's (src/science/step/vessel.ts, assembled_pot, civ-sci.pot-assembly/2: not yet taken
// in, it waits for Codex's review); its rules are the agreed ones.
//  1 a whole sealed pot lot becomes equipment: the lot leaves the shelf, the equipment keeps its copy and the table's version
//  2 refused: a lot in use, a material the table does not take, a lot the table cannot read
//  3 back from equipment, whole: the copy as it was (a new lotId); worn: still sealed but no longer known airtight (the
//    guarantee lapses; the pot is not opened), the leak time dropped, the wear kept as a crack;
//    broken: a lot of sherds of the same mass, its quality from the table (the body's kept, the vessel's dropped); in use: refused
//  4 a new version of the table: the params worked out again from the copy (not for equipment in use)
//  5 saved and loaded (JSON): all of it as it was
//  6 the science side's own table (civ-sci.pot-assembly/2, integrated 2026-10-06: world/process-catalog.ts POT_ASSEMBLY): a whole
//    sealed pot is a bulb; worn, it stays sealed, not known airtight, and is no bulb when made up again; broken, it stays
//    equipment (what a broken one becomes waits for its own review)
// Usage: npx tsx scripts/assembly-check.ts
import { emptyLedger, addLot, assemble, disassemble, refreshAssembled, type AssemblyTable, type Ledger } from '../src/world/process-runner';
import type { LotView } from '../src/world/science-contract';
import { POT_ASSEMBLY } from '../src/world/process-catalog';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const table = (version: string, k = 1): AssemblyTable => ({
  version, kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: 'civ-sci-test-2', materials: ['fired_pot_test'], brokenMaterial: 'pot_sherds',
  toParams(lot: LotView) {
    const q = lot.quality ?? {};
    if (!q.capacity_ml) throw new Error('a pot without capacity_ml');
    const known = q.airtight_known ?? (q.sealed ? 1 : 0);
    return { capacityMl: q.capacity_ml, sealed: q.sealed ?? 0, airtightKnown: known, airLeakTauMin: known ? (q.air_leak_tau_min ?? 0) * k : 0, crackPpm: q.crack_ppm ?? 0 };
  },
  brokenQuality(copy) { const { capacity_ml: _c, sealed: _s, air_leak_tau_min: _t, crack_ppm: _k, ...rest } = copy; return rest; },
  qualityOnReturn(copy, condition) {
    if (condition >= 1) return { ...copy };
    // (civ-sci.pot-assembly/2, Codex A6: the guarantee lapsing is not the pot being opened — a sealed one stays sealed)
    const { air_leak_tau_min: _t, ...rest } = copy;
    return { ...rest, ...(copy.sealed ? { airtight_known: 0 } : {}), crack_ppm: Math.min(1e6, Math.round((copy.crack_ppm ?? 0) + (1 - condition) * 1e6)) };
  },
});
const T1 = table('civ-sci.pot-assembly/2');
const pot = (L: Ledger, q: Record<string, number>) => addLot(L, { materialId: 'fired_pot_test', amount: { value: 615_000, unit: 'mg' }, quality: q, location: 'shelf' });

const L = emptyLedger('island', 'test');
const p1 = pot(L, { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 990000, sealed: 1, air_leak_tau_min: 4100 });
const r1 = assemble(L, p1.lotId, T1, 1000);
const e1 = r1.equipment!;
want('1 assembled', !!e1 && !L.lots[p1.lotId] && e1.kind === 'assembled_pot' && e1.params?.airLeakTauMin === 4100 && e1.condition === 1, r1.why ?? e1.equipmentId);
want('1 it keeps the lot and the table', L.equipment[e1.equipmentId].assembled?.from.lotId === p1.lotId && L.equipment[e1.equipmentId].assembled?.table === 'civ-sci.pot-assembly/2');

const p2 = pot(L, { capacity_ml: 500, sealed: 1, air_leak_tau_min: 3000 }); L.lots[p2.lotId].reservedBy = 'run:1';
const sand = addLot(L, { materialId: 'sand', amount: { value: 1000, unit: 'mg' }, location: 'shelf' });
const p3 = pot(L, { sealed: 1 });
want('2 refused: in use', !!assemble(L, p2.lotId, T1, 0).why && !!L.lots[p2.lotId]);
want('2 refused: not a pot', !!assemble(L, sand.lotId, T1, 0).why && !!L.lots[sand.lotId]);
want('2 refused: unreadable', /capacity_ml/.test(assemble(L, p3.lotId, T1, 0).why ?? '') && !!L.lots[p3.lotId]);

// back, whole
const back = disassemble(L, e1.equipmentId, T1).lot!;
want('3 whole: the copy as it was', !!back && back.lotId !== p1.lotId && JSON.stringify(back.quality) === JSON.stringify(p1.quality) && back.amount.value === 615_000 && !L.equipment[e1.equipmentId]);
// worn
const e2 = assemble(L, back.lotId, T1, 2000).equipment!; L.equipment[e2.equipmentId].condition = 0.97;
const worn = disassemble(L, e2.equipmentId, T1).lot!;
want('3 worn: still sealed, no longer known airtight, crack kept', !!worn && worn.quality?.sealed === 1 && worn.quality?.airtight_known === 0 && worn.quality?.air_leak_tau_min === undefined && worn.quality?.crack_ppm === 30000 && worn.quality?.capacity_ml === 500, JSON.stringify(worn?.quality));
// assembled again from the worn lot: not usable as a barometer bulb (its leak time is not known)
const e2b = assemble(L, worn.lotId, T1, 2500).equipment!;
want('3 worn, assembled again: not known airtight, leak time 0', e2b.params?.airtightKnown === 0 && e2b.params?.airLeakTauMin === 0 && e2b.condition === 1, JSON.stringify(e2b.params));
// worn again: the crack adds to the one it had (the copy given back is the one taken at this assembly)
L.equipment[e2b.equipmentId].condition = 0.98;
const worn2 = disassemble(L, e2b.equipmentId, T1).lot!;
want('3 worn again: the cracks add up', worn2?.quality?.crack_ppm === 50000 && worn2.quality?.sealed === 1 && worn2.quality?.airtight_known === 0, JSON.stringify(worn2?.quality));
// broken
const p4 = pot(L, { capacity_ml: 500, absorption_ppm: 120000, tar_mg: 15000, sealed: 1, air_leak_tau_min: 4000 });
const e3 = assemble(L, p4.lotId, T1, 3000).equipment!; L.equipment[e3.equipmentId].condition = 0;
const shards = disassemble(L, e3.equipmentId, T1).lot!;
want('3 broken: sherds of the same mass, the body kept, the vessel gone', shards?.materialId === 'pot_sherds' && shards.amount.value === 615_000 && JSON.stringify(shards.quality) === JSON.stringify({ absorption_ppm: 120000, tar_mg: 15000 }), JSON.stringify(shards?.quality));
// in use
const p5 = pot(L, { capacity_ml: 500, sealed: 1, air_leak_tau_min: 2000 });
const e4 = assemble(L, p5.lotId, T1, 4000).equipment!; L.equipment[e4.equipmentId].reservedBy = 'run:2';
want('3 refused while in use', !!disassemble(L, e4.equipmentId, T1).why && !!L.equipment[e4.equipmentId]);

// a new table
const p6 = pot(L, { capacity_ml: 500, sealed: 1, air_leak_tau_min: 1000 });
const e5 = assemble(L, p6.lotId, T1, 5000).equipment!;
const T2 = table('civ-sci.pot-assembly/3', 2);
const redone = refreshAssembled(L, T2);
want('4 worked out again from the copy', redone.includes(e5.equipmentId) && L.equipment[e5.equipmentId].params?.airLeakTauMin === 2000 && L.equipment[e5.equipmentId].assembled?.table === 'civ-sci.pot-assembly/3');
want('4 not the one in use', !redone.includes(e4.equipmentId) && L.equipment[e4.equipmentId].params?.airLeakTauMin === 2000 && L.equipment[e4.equipmentId].assembled?.table === 'civ-sci.pot-assembly/2');
want('4 the same table again: nothing to do', refreshAssembled(L, T2).length === 0);

// saved and loaded
const L2: Ledger = JSON.parse(JSON.stringify(L));
want('5 saved and loaded', JSON.stringify(L2) === JSON.stringify(L) && L2.equipment[e5.equipmentId].assembled?.from.quality?.air_leak_tau_min === 1000);

{ // 6 the real table
  const L6 = emptyLedger('island', 'test');
  const lot = addLot(L6, { materialId: 'fired_pot_test', amount: { value: 615_000, unit: 'mg' }, quality: { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 990000, sealed: 1 }, location: 'shelf' });
  const e = assemble(L6, lot.lotId, POT_ASSEMBLY, 1000).equipment!;
  want('6 real table: whole and sealed, a bulb', !!e && e.params?.airtightKnown === 1 && (e.params?.airLeakTauMin ?? 0) > 0 && L6.equipment[e.equipmentId].assembled?.table === 'civ-sci.pot-assembly/2', JSON.stringify(e?.params));
  L6.equipment[e.equipmentId].condition = 0.9;
  const back = disassemble(L6, e.equipmentId, POT_ASSEMBLY).lot!;
  want('6 real table: worn, still sealed, not known airtight', back?.quality?.sealed === 1 && back.quality?.airtight_known === 0 && back.quality?.air_leak_tau_min === undefined && back.quality?.crack_ppm === 100000, JSON.stringify(back?.quality));
  const e2 = assemble(L6, back.lotId, POT_ASSEMBLY, 2000).equipment!;
  want('6 real table: made up again, no bulb', e2?.params?.airtightKnown === 0 && e2.params?.airLeakTauMin === 0, JSON.stringify(e2?.params));
  L6.equipment[e2.equipmentId].condition = 0;
  const br = disassemble(L6, e2.equipmentId, POT_ASSEMBLY);
  want('6 real table: broken, it stays as it is for now', !!br.why && !!L6.equipment[e2.equipmentId], br.why ?? '');
}

if (bad) { console.log(`${bad} FAILED`); process.exit(1); }
console.log('all ok');
