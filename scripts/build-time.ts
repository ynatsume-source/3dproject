// How long building each sea takes (buildOcean, headless), and a fingerprint of what it laid out, so a faster build
// can be checked to lay out the same sea. Usage: npx tsx --import ./scripts/node-assets.mjs scripts/build-time.ts [seaId ...]
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['miyako', 'kayama'];
for (const id of ids) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const t0 = performance.now();
  const oc: any = buildOcean(loc);
  const ms = performance.now() - t0;
  // fingerprint: every instanced mesh's matrices, summed with weights
  let h = 0, n = 0;
  oc.group.traverse((o: any) => { if (o.isInstancedMesh) { const a = o.instanceMatrix.array; for (let i = 0; i < o.count * 16; i++) h = (h * 31 + Math.round(a[i] * 1000)) % 1000000007; n += o.count; } });
  console.log(`${id}: ${(ms / 1000).toFixed(2)} s, ${n} instances, fingerprint ${h}`);
}
