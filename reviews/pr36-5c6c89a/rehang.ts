import { addLot, emptyLedger } from '../src/world/process-runner';
import { makeCordHost, emptyCordHostState } from '../src/robots/cord-host';
import { writeCordPiece } from '../src/world/coir-cord-lots';
const L: any = emptyLedger('w:h', 'e:h');
addLot(L, { lotId: 'pot', materialId: 'fired_pot', amount: { value: 1_200_000, unit: 'mg' }, location: 'shelf', quality: {} } as any);
const p = { lotId: 'rope', material: 'coir_rope', lengthMm: 1000, fiberDryMg: 15000, pithDryMg: 1000, waterMg: 1000, baseStrengthGf: 40000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } } as any;
const o = writeCordPiece(p, 'shelf', 1); addLot(L, { lotId: 'rope', materialId: o.materialId, amount: o.amount, quality: o.quality, location: o.into! });
const state = emptyCordHostState(), dev: any[] = [];
const H = makeCordHost({ lab: L, state: () => state, dev, roofed: () => true, raftWhole: () => false, raftAt: () => null,
  placeSites: () => ({ dry: { id: 'site:cord-dry', x: 0, z: 0, reachM: 2 }, hang: { id: 'site:cord-hang', x: 2, z: 0, reachM: 2 }, work: { id: 'site:cord-work', x: 4, z: 0, reachM: 2 } }) });
let t = 1_800_000_000_000; H.tick(t, null);
const loads = () => Object.values(L.coirCordLoads?.cords ?? {}).flatMap((c: any) => c.recent).filter((x: any) => x.request.event.kind === 'load').length;
console.log('hang 1:', H.hang('dot', t += 60_000), '| loads', loads());
console.log('unhang:', H.unhang('dot', t += 600_000));
console.log('hang 2:', H.hang('dot', t += 600_000), '| loads', loads(), '| hang state', JSON.stringify(state.hang));
for (let i = 0; i < 5; i++) H.tick(t += 1000, null);
console.log('after 5 ticks: loads', loads(), '| dev', dev.map((d) => d.action + ':' + d.code).join(', '));
