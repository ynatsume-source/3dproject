// Species, molar masses and element balance for the science core.
// Pure data + functions: no world clock, no randomness, no I/O.
//
// Masses in the ledger are integer milligrams (mg). Reactions convert a rounded
// mg amount of reactant and put the rounding remainder into one named product so
// that total mass closes exactly; element balance is then checked within the
// rounding of one mg per species.

export type Element = 'C' | 'H' | 'O' | 'Al' | 'Si' | 'Ca';

export const ATOMIC_MASS: Record<Element, number> = {
  C: 12.011, H: 1.008, O: 15.999, Al: 26.982, Si: 28.085, Ca: 40.078,
};

export type SpeciesId =
  | 'water'          // H2O, liquid or vapour (phase is recorded by the location, not the species)
  | 'kaolinite'      // Al2Si2O5(OH)4, stands in for the clay mineral fraction
  | 'metakaolin'     // Al2Si2O7, dehydroxylated kaolinite
  | 'quartz'         // SiO2
  | 'calcite'        // CaCO3
  | 'lime'           // CaO
  | 'portlandite'    // Ca(OH)2, hydrated lime
  | 'organic_c'      // organic matter in clay, idealised as carbon
  | 'co2'
  | 'o2'
  | 'wood_dry'       // dry wood, idealised as CH1.44O0.66 per carbon (a composition proxy, not a molecule)
  | 'ash'            // wood ash: mixture, composition not measured
  | 'coconut_fat'    // coconut oil, idealised as trilaurin C39H74O6 (lauric acid is about half of it)
  | 'plant_solids'   // the rest of a plant food's dry matter (protein, sugars, fibre, minerals): mixture, not measured
  | 'char'           // charcoal's carbon-rich solid, idealised as CH0.4O0.09 per carbon (a composition proxy)
  | 'wood_tar'       // the dark oily part of what wood gives off when heated without air: mixture, not measured
  | 'pyrolysis_gas'  // the gases wood gives off (CO, CO2, CH4, H2, …): mixture, not measured
  | 'inert_mineral'; // illite/feldspar/iron oxides lumped: mixture, treated as non-reacting in v0

export interface SpeciesDef {
  id: SpeciesId;
  label: string;
  /** null for mixtures whose composition is not measured; they are balanced by mass only. */
  formula: Partial<Record<Element, number>> | null;
  note?: string;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  water: { id: 'water', label: '水 H2O', formula: { H: 2, O: 1 } },
  kaolinite: { id: 'kaolinite', label: 'カオリナイト Al2Si2O5(OH)4', formula: { Al: 2, Si: 2, O: 9, H: 4 } },
  metakaolin: { id: 'metakaolin', label: 'メタカオリン Al2Si2O7', formula: { Al: 2, Si: 2, O: 7 } },
  quartz: { id: 'quartz', label: '石英 SiO2', formula: { Si: 1, O: 2 } },
  calcite: { id: 'calcite', label: '方解石 CaCO3', formula: { Ca: 1, C: 1, O: 3 } },
  lime: { id: 'lime', label: '酸化カルシウム CaO', formula: { Ca: 1, O: 1 } },
  portlandite: { id: 'portlandite', label: '水酸化カルシウム Ca(OH)2', formula: { Ca: 1, O: 2, H: 2 } },
  organic_c: { id: 'organic_c', label: '有機物（炭素として理想化）', formula: { C: 1 },
    note: '実際の有機物はH・O・Nも含む。v0では炭素だけで近似する' },
  co2: { id: 'co2', label: '二酸化炭素 CO2', formula: { C: 1, O: 2 } },
  o2: { id: 'o2', label: '酸素 O2', formula: { O: 2 } },
  wood_dry: { id: 'wood_dry', label: '乾いた木質（CH1.44O0.66 で近似）', formula: { C: 1, H: 1.44, O: 0.66 },
    note: '木は混合物。燃焼の元素収支を取るための組成近似で、分子ではない' },
  ash: { id: 'ash', label: '灰（組成未測定）', formula: null },
  coconut_fat: { id: 'coconut_fat', label: 'ヤシの脂（トリラウリン C39H74O6 で近似）', formula: { C: 39, H: 74, O: 6 },
    note: 'ヤシ油は脂肪酸の混合物（ラウリン酸がおよそ半分）。燃える・焦げるの元素収支のための近似で、分子ではない' },
  plant_solids: { id: 'plant_solids', label: '植物の食べ物の脂以外の固形分（たんぱく質・糖・繊維・ミネラル）', formula: null },
  char: { id: 'char', label: '炭（CH0.4O0.09 で近似）', formula: { C: 1, H: 0.4, O: 0.09 },
    note: '400〜500 °C の炭の質量組成（C 約85%・H 約3%・O 約10%）に近い組成近似。焼いた温度で変わるが、v0 では一つ' },
  wood_tar: { id: 'wood_tar', label: '木タール（組成未測定）', formula: null },
  pyrolysis_gas: { id: 'pyrolysis_gas', label: '熱分解のガス（CO・CO2・CH4・H2 など、組成未測定）', formula: null },
  inert_mineral: { id: 'inert_mineral', label: 'その他の鉱物（一括、v0では反応させない）', formula: null,
    note: 'イライト等の脱水や鉄の酸化還元はv0では扱わない' },
};

export function molarMass(id: SpeciesId): number {
  const f = SPECIES[id].formula;
  if (!f) throw new Error(`molarMass: ${id} is a mixture without a formula`);
  let m = 0;
  for (const [el, n] of Object.entries(f)) m += ATOMIC_MASS[el as Element] * (n as number);
  return m;
}

/** Composition: species → integer mg. */
export type Composition = Partial<Record<SpeciesId, number>>;

export function totalMg(c: Composition): number {
  let s = 0;
  for (const v of Object.values(c)) s += v ?? 0;
  return s;
}

export function addComp(a: Composition, b: Composition, sign = 1): Composition {
  const out: Composition = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const id = k as SpeciesId;
    const nv = (out[id] ?? 0) + sign * (v ?? 0);
    if (nv < 0) throw new Error(`addComp: negative ${id} (${nv} mg)`);
    if (nv === 0) delete out[id]; else out[id] = nv;
  }
  return out;
}

/** Split a composition proportionally (largest-remainder rounding, so no species is biased). */
export function splitComp(c: Composition, takeMg: number): { taken: Composition; rest: Composition } {
  const tot = totalMg(c);
  if (takeMg > tot) throw new Error(`splitComp: take ${takeMg} > ${tot}`);
  const keys = (Object.keys(c) as SpeciesId[]).sort();
  const exact = keys.map((k) => ((c[k] ?? 0) * takeMg) / tot);
  const fl = exact.map(Math.floor);
  let short = takeMg - fl.reduce((a, b) => a + b, 0);
  const order = keys.map((_, i) => i).sort((i, j) => (exact[j] - fl[j]) - (exact[i] - fl[i]) || i - j);
  for (const i of order) { if (short <= 0) break; if (fl[i] < (c[keys[i]] ?? 0)) { fl[i]++; short--; } }
  const taken: Composition = {};
  keys.forEach((k, i) => { if (fl[i] > 0) taken[k] = fl[i]; });
  return { taken, rest: addComp(c, taken, -1) };
}

/** Element moles in a composition (mixtures without formula are skipped). */
export function elementMoles(c: Composition): Record<Element, number> {
  const out: Record<Element, number> = { C: 0, H: 0, O: 0, Al: 0, Si: 0, Ca: 0 };
  for (const [k, mg] of Object.entries(c)) {
    const f = SPECIES[k as SpeciesId].formula;
    if (!f || !mg) continue;
    const mol = mg / 1000 / molarMass(k as SpeciesId);
    for (const [el, n] of Object.entries(f)) out[el as Element] += mol * (n as number);
  }
  return out;
}

/** Mass of the formula-less (mixture) part. */
export function mixtureMg(c: Composition): number {
  let s = 0;
  for (const [k, mg] of Object.entries(c)) if (!SPECIES[k as SpeciesId].formula) s += mg ?? 0;
  return s;
}

export interface BalanceCheck {
  massInMg: number;
  massOutMg: number;
  massClosed: boolean;
  /** Max relative element imbalance over elements present (formula species only). */
  elementMaxRelErr: number;
  elementClosed: boolean;
  mixtureInMg: number;
  mixtureOutMg: number;
}

/** Check a transformation: everything in (incl. boundary inflows) vs everything out (incl. outflows). */
export function checkBalance(inputs: Composition, outputs: Composition, tolRel = 2e-3): BalanceCheck {
  const mi = totalMg(inputs), mo = totalMg(outputs);
  const ei = elementMoles(inputs), eo = elementMoles(outputs);
  let maxRel = 0;
  for (const el of Object.keys(ei) as Element[]) {
    const a = ei[el], b = eo[el];
    const scale = Math.max(Math.abs(a), Math.abs(b));
    if (scale < 1e-9) continue;
    // one mg of rounding per species is allowed: convert to an absolute floor
    const rel = Math.abs(a - b) / scale;
    const absFloor = 0.02 / 1000 / 1; // ~20 µmol absolute floor for tiny amounts
    if (Math.abs(a - b) > absFloor) maxRel = Math.max(maxRel, rel);
  }
  return {
    massInMg: mi, massOutMg: mo, massClosed: mi === mo,
    elementMaxRelErr: maxRel, elementClosed: maxRel <= tolRel,
    mixtureInMg: mixtureMg(inputs), mixtureOutMg: mixtureMg(outputs),
  };
}

/**
 * Convert `reactMg` of one reactant by a fixed stoichiometry. Products get rounded mg;
 * the closing product (`closeInto`) absorbs the rounding so mass closes exactly.
 * coefficients: moles of each species per mole of the reactant; negative = consumed.
 */
export function react(
  reactant: SpeciesId, reactMg: number,
  coeffs: Partial<Record<SpeciesId, number>>, closeInto: SpeciesId,
): { consumed: Composition; produced: Composition } {
  const mol = reactMg / 1000 / molarMass(reactant);
  const consumed: Composition = { [reactant]: reactMg };
  const produced: Composition = {};
  for (const [k, n] of Object.entries(coeffs)) {
    const id = k as SpeciesId;
    const mg = Math.round(mol * Math.abs(n as number) * molarMass(id) * 1000);
    if ((n as number) < 0) consumed[id] = (consumed[id] ?? 0) + mg;
    else if (id !== closeInto) produced[id] = (produced[id] ?? 0) + mg;
  }
  const close = totalMg(consumed) - totalMg(produced);
  if (close < 0) throw new Error(`react: negative closure for ${closeInto}`);
  if (close > 0) produced[closeInto] = (produced[closeInto] ?? 0) + close;
  return { consumed, produced };
}

/** Idealised reactions used by the clay loop. Element-balanced; the conditions they need are in params. */
export const REACTIONS = {
  // Al2Si2O5(OH)4 → Al2Si2O7 + 2 H2O
  dehydroxylation: { reactant: 'kaolinite' as SpeciesId, coeffs: { metakaolin: 1, water: 2 }, closeInto: 'water' as SpeciesId },
  // CaCO3 → CaO + CO2
  calcination: { reactant: 'calcite' as SpeciesId, coeffs: { lime: 1, co2: 1 }, closeInto: 'co2' as SpeciesId },
  // CaO + H2O → Ca(OH)2
  hydration: { reactant: 'lime' as SpeciesId, coeffs: { water: -1, portlandite: 1 }, closeInto: 'portlandite' as SpeciesId },
  // C + O2 → CO2  (o2 drawn from the air as a recorded boundary inflow)
  organicBurnout: { reactant: 'organic_c' as SpeciesId, coeffs: { o2: -1, co2: 1 }, closeInto: 'co2' as SpeciesId },
  // CH1.44O0.66 + 1.03 O2 → CO2 + 0.72 H2O
  woodCombustion: { reactant: 'wood_dry' as SpeciesId, coeffs: { o2: -1.03, co2: 1, water: 0.72 }, closeInto: 'water' as SpeciesId },
  // CH0.4O0.09 + 1.055 O2 → CO2 + 0.2 H2O
  charCombustion: { reactant: 'char' as SpeciesId, coeffs: { o2: -1.055, co2: 1, water: 0.2 }, closeInto: 'water' as SpeciesId },
  // C39H74O6 + 54.5 O2 → 39 CO2 + 37 H2O  (coconut oil burning in a lamp flame)
  oilCombustion: { reactant: 'coconut_fat' as SpeciesId, coeffs: { o2: -54.5, co2: 39, water: 37 }, closeInto: 'water' as SpeciesId },
  // C39H74O6 + 15.5 O2 → 39 C + 37 H2O  (the share of the oil that leaves as soot: the carbon not burned; C as organic_c)
  oilSooting: { reactant: 'coconut_fat' as SpeciesId, coeffs: { o2: -15.5, organic_c: 39, water: 37 }, closeInto: 'water' as SpeciesId },
};
