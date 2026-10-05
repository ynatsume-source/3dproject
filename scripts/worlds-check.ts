// Headless check (ADR 0007): two worlds. The Earth's Kayama is the nature side's — no residents, on the globe; Dot's
// world is the same island on another planet — the residents, not on this Earth's globe — and it inherits everything
// else from the Earth's Kayama, so the nature side's changes there always show in Dot's world too.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/worlds-check.ts
import { LOCATIONS, DOTWORLD } from '../src/data/locations';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const earth = LOCATIONS.find((l) => l.id === 'kayama')!;
want('the Earth\'s Kayama: on the globe, no residents, not the planet', !!earth && !earth.residents && !earth.world);
want('Dot\'s world: the residents, on the other planet, not on the globe', !!DOTWORLD && DOTWORLD.residents === true && DOTWORLD.world === 'planet' && !LOCATIONS.includes(DOTWORLD));
want('the same island (same id, the same land, the same sea\'s life)', DOTWORLD.id === earth.id && DOTWORLD.land === earth.land && DOTWORLD.species === earth.species && DOTWORLD.f === earth.f && DOTWORLD.water === earth.water);
// (a change the nature side makes to the Earth's Kayama, later, shows in Dot's world too)
const before = earth.vis, f0 = earth.f;
(earth as any).vis = before + 7; (earth as any).f = () => -1;
want('a later change to the Earth\'s Kayama shows in Dot\'s world', DOTWORLD.vis === before + 7 && DOTWORLD.f(0, 0) === -1);
(earth as any).vis = before; (earth as any).f = f0;
want('…and Dot\'s world\'s own things stay its own', DOTWORLD.name !== earth.name && earth.residents !== true);
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
