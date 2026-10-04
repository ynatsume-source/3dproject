// Composition of a ceramic piece during firing, shared by the test-world prototype (clay.ts) and the
// ScienceStep (step/firing.ts). Pure.

import { addComp, react, REACTIONS, type Composition } from './chem';

export type CeramicExt = { water: number; organic: number; dehydrox: number; calc: number };

/**
 * Composition of a piece from its composition at the start of firing and cumulative extents.
 * Rounded once from totals (not step by step), so mass closes exactly and elements within ~1 mg.
 */
export function wareComp(base: Composition, ext: CeramicExt): { comp: Composition; out: Composition; inn: Composition } {
  let comp: Composition = { ...base };
  let out: Composition = {}, inn: Composition = {};
  const conv = (sp: 'water' | 'organic_c' | 'kaolinite' | 'calcite', e: number) => (base[sp] ?? 0) - Math.round((base[sp] ?? 0) * (1 - e));
  const w = conv('water', ext.water);
  if (w > 0) { comp = addComp(comp, { water: w }, -1); out = addComp(out, { water: w }); }
  const o = conv('organic_c', ext.organic);
  if (o > 0) {
    const r = react('organic_c', o, REACTIONS.organicBurnout.coeffs, 'co2');
    comp = addComp(comp, { organic_c: o }, -1); inn = addComp(inn, { o2: r.consumed.o2 ?? 0 }); out = addComp(out, r.produced);
  }
  const k = conv('kaolinite', ext.dehydrox);
  if (k > 0) {
    const r = react('kaolinite', k, REACTIONS.dehydroxylation.coeffs, 'water');
    comp = addComp(addComp(comp, { kaolinite: k }, -1), { metakaolin: r.produced.metakaolin ?? 0 }); out = addComp(out, { water: r.produced.water ?? 0 });
  }
  const c = conv('calcite', ext.calc);
  if (c > 0) {
    const r = react('calcite', c, REACTIONS.calcination.coeffs, 'co2');
    comp = addComp(addComp(comp, { calcite: c }, -1), { lime: r.produced.lime ?? 0 }); out = addComp(out, { co2: r.produced.co2 ?? 0 });
  }
  return { comp, out, inn };
}

