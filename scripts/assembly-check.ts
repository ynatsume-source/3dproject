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
//  6 the science side's own table (civ-sci.pot-assembly/4 since 2026-10-10, /3 since 2026-10-09; integrated 2026-10-06: world/process-catalog.ts POT_ASSEMBLY): a whole
//    sealed pot is a bulb; worn, it stays sealed, not known airtight, and is no bulb when made up again; broken, it goes
//    back to pot_sherds (potSherdsQuality, cleared by Codex lab e2a4147): a wet, tarred pot with no full history becomes
//    sherds of the same amount, its absorption, tar, water and history_complete as they were (whole ppm, no new rounding;
//    read as the whole lot's mg × ppm rounded down), nothing of the vessel kept; the equipment gone
//  7 several lots made into one piece (a tar retort from an upper and a lower pot): refused for the wrong lots or a cracked
//    pot; a copy of each kept; saved and loaded; worked out again for a new table; taken apart as the table says, each
//    part of its own amount (worn: the upper pot cracked; broken: the upper pot to sherds, the lower one whole)
//  8 table /4 (science final review 2026-10-10-barometer): a sealed pot with a gauge tube through its plug is a barometer
//    bulb — its tube and bulbTauS from the table, and the stick main carves (markMm); one without a tube has no markMm
// Usage: npx tsx scripts/assembly-check.ts
import { emptyLedger, addLot, assemble, disassemble, refreshAssembled, assembleParts, disassembleParts, refreshAssembledParts, loseEquipment, startRun, type AssemblyTable, type PartsAssemblyTable, type Ledger } from '../src/world/process-runner';
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
  want('6 real table: whole and sealed, a bulb', !!e && e.params?.airtightKnown === 1 && (e.params?.airLeakTauMin ?? 0) > 0 && L6.equipment[e.equipmentId].assembled?.table === 'civ-sci.pot-assembly/4', JSON.stringify(e?.params));
  L6.equipment[e.equipmentId].condition = 0.9;
  const back = disassemble(L6, e.equipmentId, POT_ASSEMBLY).lot!;
  want('6 real table: worn, still sealed, not known airtight', back?.quality?.sealed === 1 && back.quality?.airtight_known === 0 && back.quality?.air_leak_tau_min === undefined && back.quality?.crack_ppm === 100000, JSON.stringify(back?.quality));
  const e2 = assemble(L6, back.lotId, POT_ASSEMBLY, 2000).equipment!;
  want('6 real table: made up again, no bulb', e2?.params?.airtightKnown === 0 && e2.params?.airLeakTauMin === 0, JSON.stringify(e2?.params));
  // (broken: a wet, tarred pot whose history is not complete — back to sherds)
  const wetQ = { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 990000, sealed: 1, airtight_known: 1, air_leak_tau_min: 1200, crack_ppm: 3000, x_wood_tar_ppm: 31234, x_water_ppm: 45678, history_complete: 0 };
  const wet = addLot(L6, { materialId: 'fired_pot_test', amount: { value: 615_001, unit: 'mg' }, quality: { ...wetQ }, location: 'shelf' });
  const e3 = assemble(L6, wet.lotId, POT_ASSEMBLY, 3000).equipment!;
  L6.equipment[e3.equipmentId].condition = 0;
  const br = disassemble(L6, e3.equipmentId, POT_ASSEMBLY), sh = br.lot!;
  want('6 real table: broken, back to a pot_sherds lot of the same amount, the equipment gone', !!sh && sh.materialId === 'pot_sherds' && sh.amount.value === 615_001 && sh.amount.unit === 'mg' && sh.location === 'shelf' && !L6.equipment[e3.equipmentId] && !!L6.lots[sh.lotId], br.why ?? `${sh?.materialId} ${sh?.amount.value}${sh?.amount.unit}`);
  want('6 real table: the body\'s absorption, tar, water and history kept, in the copy\'s own whole ppm', JSON.stringify(sh?.quality) === JSON.stringify({ absorption_ppm: 120000, x_wood_tar_ppm: 31234, x_water_ppm: 45678, history_complete: 0 }), JSON.stringify(sh?.quality));
  want('6 real table: nothing of the vessel kept (capacity, coverage, seal, airtightness, crack)', ['capacity_ml', 'coverage_ppm', 'sealed', 'airtight_known', 'air_leak_tau_min', 'crack_ppm'].every((k) => !(k in (sh?.quality ?? {}))));
  const mg = (ppm: number) => Math.floor(sh.amount.value * ppm / 1e6);   // (of the whole lot, water and tar included)
  want('6 real table: read as the whole lot\'s mg × ppm, rounded down', mg(sh.quality!.x_wood_tar_ppm) === 19208 && mg(sh.quality!.x_water_ppm) === 28092, `tar ${mg(sh.quality!.x_wood_tar_ppm)} mg, water ${mg(sh.quality!.x_water_ppm)} mg`);
  // (a dry, untarred one with its history: only what it has; 0 ppm left out, read as 0)
  L6.equipment[e2.equipmentId].condition = 0;
  const dry = disassemble(L6, e2.equipmentId, POT_ASSEMBLY).lot!;
  want('6 real table: a dry, untarred one: absorption only (missing is 0), no history made up', dry?.materialId === 'pot_sherds' && dry.amount.value === 615_000 && JSON.stringify(dry.quality) === JSON.stringify({ absorption_ppm: 120000 }), JSON.stringify(dry?.quality));
  want('6 real table: saved and loaded, the sherds as they were', JSON.stringify(JSON.parse(JSON.stringify(L6)).lots[sh.lotId]) === JSON.stringify(L6.lots[sh.lotId]));
}

{ // 7 several lots made into one piece (a tar retort: an upper and a lower pot). The table here stands in for the science
  // side's (fired-pot-assembly.ts retortParams / retortPartsOnReturn, civ-sci.fired-pot-assembly/1, not yet taken in):
  // the wear is the upper pot's; the lower one comes back as it was; at condition 0 the upper one is sherds
  const RT = (version: string, k = 1): PartsAssemblyTable => ({
    version, kind: 'tar_retort', catalogEntry: 'tar_retort', catalogVersion: 'civ-sci-test-2', roles: ['upper', 'lower'], materials: ['fired_pot'],
    toParams([up, low]) { if ((up.quality?.crack ?? 0) > 0 || (low.quality?.crack ?? 0) > 0) throw new Error('a cracked pot is not assembled'); return { capacityMl: up.quality!.capacity_ml * k, collectMl: low.quality!.capacity_ml }; },
    partsOnReturn([up, low], condition) {
      if (condition >= 1) return [{ materialId: 'fired_pot', quality: { ...up } }, { materialId: 'fired_pot', quality: { ...low } }];
      if (condition <= 0) { const { capacity_ml: _c, crack: _k, ...body } = up; return [{ materialId: 'pot_sherds', quality: body }, { materialId: 'fired_pot', quality: { ...low } }]; }
      return [{ materialId: 'fired_pot', quality: { ...up, crack: 1 } }, { materialId: 'fired_pot', quality: { ...low } }];
    },
  });
  const pot = (L: Ledger, id: string, ml: number, mg: number, crack = 0) => addLot(L, { lotId: id, materialId: 'fired_pot', amount: { value: mg, unit: 'mg' }, quality: { capacity_ml: ml, absorption_ppm: 120000, crack }, location: 'shelf' });
  const L7 = emptyLedger('island', 'test'), T7 = RT('civ-sci.fired-pot-assembly/1');
  pot(L7, 'lot:up', 3000, 1_400_000); pot(L7, 'lot:low', 1500, 900_000); pot(L7, 'lot:cracked', 3000, 1_400_000, 1);
  want('7 refused: one lot only, the same lot twice, a cracked pot — nothing changes', !!assembleParts(L7, ['lot:up'], T7, 1).why && !!assembleParts(L7, ['lot:up', 'lot:up'], T7, 1).why && !!assembleParts(L7, ['lot:cracked', 'lot:low'], T7, 1).why && Object.keys(L7.lots).length === 3 && !Object.keys(L7.equipment).length);
  const e = assembleParts(L7, ['lot:up', 'lot:low'], T7, 1000).equipment!;
  want('7 two pots, one retort: both lots off the shelf, a copy of each kept, in order', !!e && !L7.lots['lot:up'] && !L7.lots['lot:low'] && e.params.capacityMl === 3000 && e.params.collectMl === 1500 && L7.equipment[e.equipmentId].assembled?.parts?.map((p) => p.lotId).join() === 'lot:up,lot:low', JSON.stringify(e?.params));
  want('7 the one-lot disassembly will not take it apart', !!disassemble(L7, e.equipmentId, POT_ASSEMBLY).why && !!L7.equipment[e.equipmentId]);
  const L7b: Ledger = JSON.parse(JSON.stringify(L7));
  want('7 saved and loaded, as it was', JSON.stringify(L7b) === JSON.stringify(L7));
  want('7 a new version of the table: the params worked out again from both copies', refreshAssembledParts(L7b, RT('civ-sci.fired-pot-assembly/2', 2)).length === 1 && L7b.equipment[e.equipmentId].params.capacityMl === 6000);
  const whole = disassembleParts(L7b, e.equipmentId, T7).lots!;
  want('7 whole: both pots back as they were, their own amounts', whole.length === 2 && whole[0].amount.value === 1_400_000 && whole[1].amount.value === 900_000 && whole.every((l) => l.materialId === 'fired_pot' && !l.quality?.crack));
  const L7c: Ledger = JSON.parse(JSON.stringify(L7)); L7c.equipment[e.equipmentId].condition = 0.7;
  const worn = disassembleParts(L7c, e.equipmentId, T7).lots!;
  want('7 worn: the upper pot cracked, the lower one as it was', worn[0].quality?.crack === 1 && worn[1].quality?.crack === 0, worn.map((l) => JSON.stringify(l.quality)).join(' / '));
  L7.equipment[e.equipmentId].condition = 0;
  const broken = disassembleParts(L7, e.equipmentId, T7).lots!;
  want('7 broken: the upper pot to sherds of its amount, the lower one whole; the retort gone', broken[0].materialId === 'pot_sherds' && broken[0].amount.value === 1_400_000 && broken[1].materialId === 'fired_pot' && !L7.equipment[e.equipmentId], broken.map((l) => `${l.materialId} ${l.amount.value}`).join(', '));
  const wrongT: PartsAssemblyTable = { ...T7, partsOnReturn: () => [{ materialId: 'fired_pot', quality: {} }] };
  const e2 = assembleParts(L7, [broken[1].lotId, pot(L7, 'lot:up2', 3000, 1_400_000).lotId], T7, 2000).equipment!;
  want('7 a table that answers for the wrong number of parts: refused, nothing changes', !!disassembleParts(L7, e2.equipmentId, wrongT).why && !!L7.equipment[e2.equipmentId]);
  // (what the table does not decide — science, 2026-10-08 — is the world's: a part that breaks of itself, a dropped
  // retort, one washed away whole)
  let asked = 0; const T7n: PartsAssemblyTable = { ...T7, partsOnReturn: (c, k) => { asked++; return T7.partsOnReturn(c, k); } };
  const L7d: Ledger = JSON.parse(JSON.stringify(L7));
  const lowBroke = disassembleParts(L7d, e2.equipmentId, T7n, { parts: [1], as: POT_ASSEMBLY }).lots!;
  want('7 the lower pot itself broken: it to sherds of its own amount (the one-pot table\'s body), the upper as the table says; the table asked once', asked === 1 && lowBroke[0].materialId === 'fired_pot' && lowBroke[0].amount.value === 900_000 && lowBroke[1].materialId === POT_ASSEMBLY.brokenMaterial && lowBroke[1].amount.value === 1_400_000 && !L7d.equipment[e2.equipmentId], lowBroke.map((l) => `${l.materialId} ${l.amount.value} ${JSON.stringify(l.quality)}`).join(' / '));
  const L7e: Ledger = JSON.parse(JSON.stringify(L7)); L7e.equipment[e2.equipmentId].condition = 0;
  const dropped = disassembleParts(L7e, e2.equipmentId, T7, { parts: [1], as: POT_ASSEMBLY }).lots!;
  want('7 dropped: both to sherds, each of its own amount — not the sum on one, not both copied', dropped.every((l) => l.materialId === 'pot_sherds') && dropped[0].amount.value + dropped[1].amount.value === 2_300_000 && dropped[0].amount.value === 900_000, dropped.map((l) => `${l.materialId} ${l.amount.value}`).join(', '));
  want('7 no such part: refused, nothing changes', !!disassembleParts(L7, e2.equipmentId, T7, { parts: [2], as: POT_ASSEMBLY }).why && !!L7.equipment[e2.equipmentId]);
  const L7f: Ledger = JSON.parse(JSON.stringify(L7)), fw = addLot(L7f, { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'shelf' });
  const run7 = startRun(L7f, { processId: 'p14x_charcoal_tar_retort', processVersion: '0', catalogVersion: 'x', contract: 'x', clock: 'world', lotIds: [fw.lotId], equipmentIds: [e2.equipmentId], operator: 'res:lantern' }, 3000).run!;
  const before7f = Object.keys(L7f.lots).sort().join();
  loseEquipment(L7f, e2.equipmentId, null, null);
  const lots7f = Object.keys(L7f.lots).sort().join();
  want('7 washed away whole while in use: the run stopped, its firewood free again, the retort and both pots gone', !L7f.equipment[e2.equipmentId] && L7f.runs[run7.runId].status === 'stopped' && !L7f.lots['lot:wood'].reservedBy && lots7f === before7f, `${L7f.runs[run7.runId].status}; lots ${before7f === lots7f ? 'unchanged (nothing came back)' : lots7f}`);
}

{ // 8 a pot with a gauge tube through its plug
  const L8 = emptyLedger('island', 'test');
  const lot = addLot(L8, { materialId: 'fired_pot_test', amount: { value: 640_000, unit: 'mg' }, location: 'shelf',
    quality: { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 990000, sealed: 1, x_tube_ppm: 39_000, tube_bore_mm: 8, tube_length_mm: 600, joint_cover_ppm: 900_000 } });
  const e = assemble(L8, lot.lotId, POT_ASSEMBLY, 1000).equipment!, p = e?.params ?? {};
  want('8 a tubed pot: a bulb with its tube, bulbTauS and the stick\'s marks', p.tubeBoreMm === 8 && p.tubeLengthMm === 600 && p.bulbTauS > 0 && p.markMm === 5 && p.airLeakTauMin > 0 && L8.equipment[e.equipmentId].assembled?.table === 'civ-sci.pot-assembly/4', JSON.stringify(p));
  const plain = addLot(L8, { materialId: 'fired_pot_test', amount: { value: 615_000, unit: 'mg' }, location: 'shelf', quality: { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 990000, sealed: 1 } });
  const e2 = assemble(L8, plain.lotId, POT_ASSEMBLY, 1000).equipment!;
  want('8 without a tube: no stick, no tube', e2.params?.markMm === undefined && e2.params?.tubeBoreMm === undefined, JSON.stringify(e2.params));
}

if (bad) { console.log(`${bad} FAILED`); process.exit(1); }
console.log('all ok');
