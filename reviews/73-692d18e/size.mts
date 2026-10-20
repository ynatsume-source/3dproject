const { makeHuskHost, emptyHuskHostState } = await import('/tmp/claude-0/-home-user-3dproject/4db7e567-5529-5795-9b08-c7b02441b831/scratchpad/pr73/src/robots/husk-host');
const { addLot, emptyLedger } = await import('/tmp/claude-0/-home-user-3dproject/4db7e567-5529-5795-9b08-c7b02441b831/scratchpad/pr73/src/world/process-runner');
const pool = { id: 'site:husk-pool', x: 0, z: 0, ground: -0.2, stand: [2, 0] as [number, number] }, work = { id: 'site:husk-work', x: 20, z: 0, reachM: 2 };
const t0 = Date.parse('2026-10-06T00:00:00Z');
for (const hours of [1, 6, 12]) {
  const L = emptyLedger('w', 'sz'), st = emptyHuskHostState();
  addLot(L, { materialId: 'coconut_husk', amount: { value: 2_400_017, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
  const H = makeHuskHost({ lab: L, state: () => st, dev: [], placeSites: () => ({ pool: { ...pool }, work }), repool: () => ({ ...pool }), seaAt: (ms) => Math.sin(ms / 2e7) * 0.5 });
  H.putInPool('dot', t0);
  const a = performance.now(); H.tick(t0 + hours * 3600e3); const ms = performance.now() - a;
  console.log(`${hours}h catch-up: ${ms.toFixed(0)} ms, ledger ${(JSON.stringify(L).length / 1024).toFixed(1)} KB`);
}
