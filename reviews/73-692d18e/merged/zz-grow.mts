const { makeHuskHost, emptyHuskHostState } = await import('../src/robots/husk-host');
const { addLot, emptyLedger } = await import('../src/world/process-runner');
const pool = { id: 'site:husk-pool', x: 0, z: 0, ground: -0.2, stand: [2, 0] as [number, number] }, work = { id: 'site:husk-work', x: 20, z: 0, reachM: 2 };
const t0 = Date.parse('2026-10-06T00:00:00Z');
const L = emptyLedger('w', 'g'), st = emptyHuskHostState();
addLot(L, { materialId: 'coconut_husk', amount: { value: 2_400_017, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
const H = makeHuskHost({ lab: L, state: () => st, dev: [], placeSites: () => ({ pool: { ...pool }, work }), repool: () => ({ ...pool }), seaAt: (ms) => Math.sin(ms / 2e7) * 0.5 });
H.putInPool('dot', t0);
let worst = 0;
for (let m = 1; m <= 48 * 60; m++) { const a = performance.now(); H.tick(t0 + m * 60_000); worst = Math.max(worst, performance.now() - a);
  if (m % (12 * 60) === 0) { const parts = Object.fromEntries(Object.entries(L as any).map(([k, v]) => [k, (JSON.stringify(v) ?? '').length])); console.log(`${m / 60}h ledger ${(JSON.stringify(L).length / 1024).toFixed(1)} KB, worst tick ${worst.toFixed(1)} ms`, JSON.stringify(parts)); worst = 0; } }
