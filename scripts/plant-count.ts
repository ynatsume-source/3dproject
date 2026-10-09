// LAB: triangle counts of the island's plants and things (docs/proposals/nature-look-2026-10-09 §4: the limits).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/plant-count.ts
import { treeGeo } from '../src/ocean/forest';
import * as shore from '../src/ocean/shore';
import { driftwoodGeo, shellGeo, stoneGeo, coconutGeo } from '../src/robots/items';
import { seedRandom } from '../src/core/math';
const tri = (g: any) => (g.index ? g.index.count : g.attributes.position.count) / 3;
for (let k = 0; k < 4; k++) console.log('tree', k, 'hi', [11 + k * 7, 101 + k * 13].map((s) => tri(treeGeo(k, false, s))).join('/'), 'lo', [11 + k * 7, 101 + k * 13].map((s) => tri(treeGeo(k, false, s, true))).join('/'), 'young', tri(treeGeo(k, true, 301 + k)), tri(treeGeo(k, true, 301 + k, true)));
seedRandom(1);
const G = (shore as any).__plantGeos?.();
if (G) for (const k in G) console.log(k, tri(G[k]));
console.log('items wood', tri(driftwoodGeo()), 'shell', tri(shellGeo()), 'stone', tri(stoneGeo()), 'coconut', tri(coconutGeo()));
