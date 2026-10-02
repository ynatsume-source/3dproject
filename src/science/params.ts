// Every number the clay loop uses, with where it comes from.
//
// status:
//   'sourced'     – the value (or the range it sits in) was read in a fetched source (see sources.ts)
//   'calibrated'  – game calibration chosen so behaviour lands inside a sourced range; the shape
//                   of the law is a simplification, the coefficients are not measured
//   'assumed'     – a design assumption for the test world with no source yet
// A parameter whose source could not be retrieved stays 'assumed' even if it is textbook knowledge.

export type ParamStatus = 'sourced' | 'calibrated' | 'assumed';

export interface Param {
  id: string;
  value: number;
  unit: string;
  status: ParamStatus;
  sources: string[];
  note: string;
}

const P = (id: string, value: number, unit: string, status: ParamStatus, sources: string[], note: string): Param =>
  ({ id, value, unit, status, sources, note });

export const PARAMS = {
  // ---- constants -------------------------------------------------------------------------
  latentHeatWater100: P('latentHeatWater100', 2.257e6, 'J/kg', 'assumed', ['S-latent'],
    '100 °C での水の蒸発潜熱。窯内の残留水の蒸発に使う'),
  latentHeatWater25: P('latentHeatWater25', 2.44e6, 'J/kg', 'assumed', ['S-latent'],
    '常温付近の蒸発潜熱。乾燥で環境から受け取る熱の計上に使う'),
  cpCeramic: P('cpCeramic', 0.9, 'J/(g·K)', 'assumed', ['S-cp'],
    '素地・焼成体の比熱。温度依存は無視'),
  dHCalcination: P('dHCalcination', 178e3, 'J/mol', 'assumed', ['S-calc'],
    'CaCO3 → CaO + CO2 の標準反応エンタルピー（吸熱）'),
  dHDehydroxylation: P('dHDehydroxylation', 0.6e6, 'J/kg(kaolinite)', 'assumed', ['S-kaol'],
    'カオリナイト脱水の吸熱量。原典未確認の概算'),
  dHCarbonCombustion: P('dHCarbonCombustion', 393.5e3, 'J/mol', 'assumed', ['S-comb'],
    'C + O2 → CO2 の発熱'),
  woodLhvDry: P('woodLhvDry', 18.0e6, 'J/kg', 'assumed', ['S-wood'],
    '絶乾木材の低位発熱量'),
  woodAshFrac: P('woodAshFrac', 0.01, 'kg/kg(dry)', 'assumed', ['S-wood'],
    '木材の灰分'),

  // ---- test clay (fixture) ------------------------------------------------------------
  clayShrinkLinear: P('clayShrinkLinear', 0.06, 'fraction', 'assumed', ['S-dry'],
    '試験粘土Aの乾燥による線収縮（全量）'),
  clayWaterPlastic: P('clayWaterPlastic', 0.24, 'kg/kg(dry)', 'assumed', ['S-dry'],
    '成形に適した含水率（乾量基準）'),
  clayWaterCritical: P('clayWaterCritical', 0.13, 'kg/kg(dry)', 'calibrated', ['S-dry'],
    'これより乾くと収縮がほぼ止まる含水率（Bigot曲線の折れ点の考え方）'),
  clayWaterEqAt70RH: P('clayWaterEqAt70RH', 0.02, 'kg/kg(dry)', 'assumed', [],
    '相対湿度70%での平衡含水率。湿度に比例させる簡略化'),
  dryBulkDensity: P('dryBulkDensity', 1.7, 'g/cm3', 'assumed', [], '乾燥素地のかさ密度'),

  // ---- drying law ---------------------------------------------------------------------
  evapCoeff: P('evapCoeff', 3.0e-8, 'kg/(m2·s·Pa)', 'calibrated', [],
    'Dalton型の蒸発係数（風速1 m/sあたり+50%）。日あたり数mmの屋外蒸発量の桁に合わせた'),
  sunSurfaceExcessC: P('sunSurfaceExcessC', 15, 'K', 'assumed', [],
    '日なたで素地表面が気温より高くなる量'),
  dryCrackFluxRef: P('dryCrackFluxRef', 1.3e-4, 'kg/(m2·s)', 'calibrated', ['S-dry'],
    '厚さ10 mmで乾燥割れが出始める収縮期の蒸発速度。厚いほど小さくなる'),

  // ---- firing kinetics (first-order, Arrhenius-shaped; game calibration) ---------------
  kinWaterTref: P('kinWaterTref', 100, '°C', 'calibrated', ['S-steam'], '残留水が速く抜ける温度'),
  kinDehydroxTref: P('kinDehydroxTref', 550, '°C', 'calibrated', ['S-kaol'],
    '半減期10分の基準温度。脱水が450〜600 °Cの範囲で進むよう合わせた'),
  kinCalcTref: P('kinCalcTref', 800, '°C', 'calibrated', ['S-calc'],
    '半減期15分の基準温度。分解が700〜900 °Cで進むよう合わせた'),
  kinOrganicTref: P('kinOrganicTref', 450, '°C', 'calibrated', [], '有機物燃焼の基準温度'),
  kinSinterTref: P('kinSinterTref', 1000, '°C', 'calibrated', ['S-fire', 'S-abs'],
    '焼結（吸水率低下）の半減期60分の基準温度'),
  slakeIfDehydroxBelow: P('slakeIfDehydroxBelow', 0.9, 'extent', 'calibrated', ['S-slake'],
    '脱水がこの割合未満なら水中で崩れる（まだ粘土）'),
  absorptionLowFire: P('absorptionLowFire', 0.18, 'kg/kg', 'assumed', ['S-abs'],
    '脱水は済んだが焼結していない試験体の煮沸吸水率'),
  absorptionVitrified: P('absorptionVitrified', 0.05, 'kg/kg', 'assumed', ['S-abs'],
    '試験粘土Aが焼き締まったときの吸水率の下限'),
  overfireC: P('overfireC', 1150, '°C', 'assumed', [], '試験粘土Aが変形し始める温度'),
  coldSoakFraction: P('coldSoakFraction', 0.8, 'ratio', 'assumed', ['S-abs'],
    '24時間冷水浸漬の吸水は煮沸飽和の約8割とする（飽和係数の考え方）'),

  // ---- crack risks (probabilities per sample; game calibration) ------------------------
  steamMoistureLimit: P('steamMoistureLimit', 0.03, 'kg/kg(dry)', 'calibrated', ['S-steam'],
    'この含水率を超えて100〜250 °Cを急に通ると水蒸気で割れる危険'),
  steamRateLimit: P('steamRateLimit', 150, 'K/h', 'calibrated', ['S-steam'], '同上の昇温速度の目安'),
  quartzInversionC: P('quartzInversionC', 573, '°C', 'assumed', ['S-quartz'], '石英のα–β転移'),
  duntRateLimit10mm: P('duntRateLimit10mm', 600, 'K/h', 'calibrated', ['S-quartz'],
    '厚さ10 mmの小試験体が573 °Cを通過しても割れにくい温度変化速度'),
  pCrackMax: P('pCrackMax', 0.6, 'probability', 'calibrated', [], '一つの機構で割れる確率の上限'),

  // ---- facilities (test-world fixtures) ------------------------------------------------
  wareLagS10mm: P('wareLagS10mm', 120, 's', 'assumed', [], '厚さ10 mmの試験体が炉内温度に追従する時定数'),
  combustionToChamber: P('combustionToChamber', 0.3, 'fraction', 'assumed', ['S-kilneff'],
    '試験窯：燃焼熱のうち炉内に入る割合。残りは排気で直接失う'),
};

export type ParamId = keyof typeof PARAMS;
export const pv = (id: ParamId): number => PARAMS[id].value;
