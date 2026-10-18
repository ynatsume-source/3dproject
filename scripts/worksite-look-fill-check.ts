// Headless check (what the husk and cord worksites look like, for drawing: robots/worksite-looks.ts, 2026-10-17, PR③).
// Test data only, in a stand-in localStorage.
//  1 a fresh island: every husk and cord place listed, nothing standing there, nothing lying there
//  2 the drying rack stands once fibre has been laid out under the eaves (and not before); the bundle on it, wet
//  3 each thing's look as the science side's rules tell it: a bundle or a husk dry once its water is a tenth of its dry
//    mass or less; a strand or rope smooth, fuzzy with pith over the baseline, frayed once rubbed or after a year of sun
//    (a tenth as fast in the shade), broken lying on the ground
//  4 a thing's id stable while it lies there, not its lot id; no amount anywhere in what is drawn
//  5 drawing never draws: reading the looks takes nothing from the island's random draws; never in a resident's mind
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/worksite-look-fill-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { lookOf } from '../src/robots/worksite-looks';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { addLot } from '../src/world/process-runner';
import { writeCordBundle, writeCordPiece } from '../src/world/coir-cord-lots';
import { COIR_CORD_RULES as RULES } from '../src/science/prototypes/coir-cord-types';

let now = Date.parse('2026-10-06T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
let draws = 0; const rnd = mulberry32(7); Math.random = () => { draws++; return rnd(); };
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const inputs: any[] = [];
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
R.setBrain(async (i: any) => { inputs.push(i); return null; });
R.list.find((r: any) => r.id === 'dot').stats.built = 99;   // (the hut is up: a roof over the eaves)
const step = (secs: number) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); } };
const MASS = 72_017;   // (a marker: never in what is drawn)
const lot = (p: any, location: string) => addLot(R.lab, { materialId: p.materialId, amount: p.amount, location, quality: p.quality });
const show = (ls: any[]) => ls.map((s) => `${s.siteId}[${s.fixtures.map((x: any) => x.kind).join('+')}|${s.items.map((x: any) => `${x.kind}:${x.look}`).join('+')}]`).join(' ');

{ // 1
  const ls = R.worksiteLooks();
  want('1 a fresh island: every husk and cord place, nothing standing, nothing lying', ls.length === 5 && ls.every((s: any) => s.fixtures.length === 0 && s.items.length === 0) && ['site:husk-pool', 'site:husk-work', 'site:cord-dry', 'site:cord-work', 'site:cord-hang'].every((id) => ls.some((s: any) => s.siteId === id)), show(ls));
}
{ // 2
  const b = writeCordBundle({ fiberDryMg: MASS, pithDryMg: 7_000, waterMg: 115_000 }, 'site:husk-work', 1);
  lot(b, 'site:husk-work');
  const before = R.worksiteLooks().find((s: any) => s.siteId === 'site:cord-dry');
  const w = R.cordHost.putToDry('dot', now);
  const after = R.worksiteLooks().find((s: any) => s.siteId === 'site:cord-dry');
  want('2 the rack stands once fibre is laid out on it, not before; the bundle hung on it (on: the rack), wet', before.fixtures.length === 0 && !!w && after.fixtures.length === 1 && after.fixtures[0].kind === 'drying-rack' && after.items.length === 1 && after.items[0].kind === 'fiber-bundle' && after.items[0].look === 'wet' && after.items[0].on === after.fixtures[0].id && before.items.every((x: any) => x.on === undefined), `${show([before])} → ${show([after])}`);
}
{ // 3
  const at = (p: any, location = 'site:cord-work') => lookOf({ lotId: 'lot:x', materialId: p.materialId, amount: p.amount, location, quality: p.quality } as any)!.look;
  const dry = writeCordBundle({ fiberDryMg: 72_000, pithDryMg: 8_000, waterMg: 8_000 }, 's', 1), damp = writeCordBundle({ fiberDryMg: 72_000, pithDryMg: 8_000, waterMg: 8_001 }, 's', 1);
  want('3 a bundle dry once its water is a tenth of its dry mass, wet above', at(dry) === 'dry' && at(damp) === 'wet' && RULES.waterPerDryDenominator === 10, `${at(dry)} / ${at(damp)}`);
  const husk = (water: number) => lookOf({ lotId: 'h', materialId: 'partially_separated_coconut_husk', amount: { value: 100_000 + water, unit: 'mg' }, location: 's', quality: { dry_mg: 100_000, water_mg: water, husk_count: 1, unseparated: 0, history_complete: 1 } } as any)!.look;
  want('3 a husk left from the beating the same: wet, then dry', husk(10_001) === 'wet' && husk(10_000) === 'dry', `${husk(10_001)} / ${husk(10_000)}`);
  const piece = (o: any = {}) => writeCordPiece({ lotId: 'p', material: 'coir_strand', fiberDryMg: 10_000, pithDryMg: 1_000, waterMg: 500, lengthMm: 1_000, baseStrengthGf: 40_000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 }, ...o }, 's', 1);
  const y = RULES.yearIslandMs;
  const looks = { smooth: at(piece()), fuzzy: at(piece({ pithDryMg: 1_001 })), rubbed: at(piece({ damage: { sunMs: 0, shadeMs: 0, abrasions: 1 } })), sun: at(piece({ damage: { sunMs: y, shadeMs: 0, abrasions: 0 } })), almost: at(piece({ damage: { sunMs: y - 1, shadeMs: 0, abrasions: 0 } })), shade: at(piece({ damage: { sunMs: 0, shadeMs: 10 * y, abrasions: 0 } })), broken: at(piece(), 'ground') };
  want('3 a strand: smooth, fuzzy, frayed when rubbed or a year in the sun (ten in the shade), broken on the ground', looks.smooth === 'smooth' && looks.fuzzy === 'fuzzy' && looks.rubbed === 'frayed' && looks.sun === 'frayed' && looks.almost === 'smooth' && looks.shade === 'frayed' && looks.broken === 'broken', JSON.stringify(looks));
  const rope = lookOf({ lotId: 'r', ...(() => { const p = writeCordPiece({ lotId: 'r', material: 'coir_rope', fiberDryMg: 30_000, pithDryMg: 1_000, waterMg: 500, lengthMm: 900, baseStrengthGf: 100_000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } }, 's', 1); return { materialId: p.materialId, amount: p.amount, quality: p.quality }; })(), location: 's' } as any)!;
  want('3 a rope drawn as cord, a strand as yarn', rope.kind === 'cord' && lookOf({ lotId: 'p', materialId: 'coir_strand', amount: { value: 1, unit: 'mg' }, location: 's', quality: piece().quality } as any)!.kind === 'yarn', rope.kind);
}
{ // 4
  const a = R.worksiteLooks(), b = R.worksiteLooks(), items = a.flatMap((s: any) => s.items), text = JSON.stringify(a);
  want('4 ids stable, not lot ids; no amount in what is drawn', JSON.stringify(a) === JSON.stringify(b) && items.length > 0 && items.every((x: any) => !/lot:/.test(x.id)) && !text.includes(String(MASS)), items.map((x: any) => x.id).join(','));
}
{ // 5
  const d0 = draws; for (let k = 0; k < 50; k++) R.worksiteLooks(); const took = draws - d0;
  const n0 = inputs.length; for (const r of R.list) { const a = R.mind(r); if (a) { a.why = 'テスト'; a.lastCall = -1e12; } }
  for (let i = 0; i < 1800 && inputs.length === n0; i++) { step(1); await Promise.resolve(); await Promise.resolve(); }
  const minds = JSON.stringify(inputs);
  want('5 reading the looks takes nothing from the island\'s draws, and no look reaches a resident\'s mind', took === 0 && inputs.length > n0 && !/fiber-bundle|drying-rack|beat-board|thing:/.test(minds), `${took} draws, ${inputs.length - n0} inputs`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
