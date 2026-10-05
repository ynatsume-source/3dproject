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
  latentHeatWater100: P('latentHeatWater100', 2.256e6, 'J/kg', 'sourced', ['S-latent'],
    '100 °C での水の蒸発潜熱（OpenStax 表の 2256 kJ/kg）。窯内の残留水の蒸発に使う'),
  latentHeatWater25: P('latentHeatWater25', 2.43e6, 'J/kg', 'sourced', ['S-latent'],
    '常温の乾燥で環境から受け取る熱。出典は 37 °C の 2430 kJ/kg。25〜28 °C ではわずかに大きいはずだが、その値は出典になく未補正'),
  cpCeramic: P('cpCeramic', 0.9, 'J/(g·K)', 'assumed', ['S-cp', 'S-heatcap'],
    '素地・焼成体の比熱。温度依存は無視。OpenStax の表には粘土がなく、近い物質（コンクリート・花崗岩 840、ガラス 840）があるだけ'),
  dHCalcination: P('dHCalcination', 191.59e3, 'J/mol', 'sourced', ['S-thermo'],
    'CaCO3 → CaO + CO2 の標準反応エンタルピー（吸熱）。OpenStax Chemistry 2e 付録の生成エンタルピー（CaO −634.9、CO2 −393.51、CaCO3 −1220.0）から計算。CaCO3 を約 −1207 とする表もあり、その場合は約178。資料間の差は未解決'),
  dHHydration: P('dHHydration', -64.47e3, 'J/mol', 'sourced', ['S-thermo'],
    'CaO + H2O(l) → Ca(OH)2 の標準反応エンタルピー（発熱）。同じ表（Ca(OH)2 −985.2、H2O(l) −285.83）から計算'),
  dHDehydroxylation: P('dHDehydroxylation', 0.6e6, 'J/kg(kaolinite)', 'assumed', ['S-kaol'],
    'カオリナイト脱水の吸熱量。原典未確認の概算'),
  dHCarbonCombustion: P('dHCarbonCombustion', 393.51e3, 'J/mol', 'sourced', ['S-thermo'],
    'C + O2 → CO2 の発熱（CO2 の生成エンタルピー −393.51、OpenStax）'),
  woodLhvDry: P('woodLhvDry', 18.0e6, 'J/kg', 'assumed', ['S-wood'],
    '絶乾木材の低位発熱量'),
  woodAshFrac: P('woodAshFrac', 0.01, 'kg/kg(dry)', 'assumed', ['S-wood'],
    '木材の灰分'),

  // ---- test clay (fixture) ------------------------------------------------------------
  clayShrinkLinear: P('clayShrinkLinear', 0.06, 'fraction', 'assumed', ['S-dry'],
    '試験粘土Aの乾燥による線収縮（全量、成形時の長さが分母）。保存コピー（Digitalfire, 原典未照合）に「典型的な可塑性の陶土で約6%」とあり定義も同じだが、校正値ではない'),
  clayWaterPlastic: P('clayWaterPlastic', 0.24, 'kg/kg(dry)', 'assumed', ['S-dry'],
    '成形に適した含水率。乾量基準（水/乾燥固形分）。湿量基準では約19.4%。保存コピー（LDW、湿量基準）に「粗い粘土は18〜20%で扱いやすい」とあり桁は合うが、校正値ではない'),
  clayWaterCritical: P('clayWaterCritical', 0.13, 'kg/kg(dry)', 'calibrated', ['S-dry'],
    'これより乾くと収縮がほぼ止まる含水率（Bigot曲線の折れ点の考え方）。乾量基準。以前の検索要約の「12〜14%」は基準（湿量/乾量）が不明で、根拠にしていない'),
  clayWaterEqAt70RH: P('clayWaterEqAt70RH', 0.02, 'kg/kg(dry)', 'assumed', [],
    '相対湿度70%での平衡含水率。湿度に比例させる簡略化'),
  dryBulkDensity: P('dryBulkDensity', 1.7, 'g/cm3', 'assumed', [], '乾燥素地のかさ密度'),

  // ---- drying law ---------------------------------------------------------------------
  evapCoeff: P('evapCoeff', 3.0e-8, 'kg/(m2·s·Pa)', 'calibrated', [],
    'Dalton型の蒸発係数（風速1 m/sあたり+50%）。日あたり数mmの屋外蒸発量の桁に合わせた'),
  windRoughnessM: P('windRoughnessM', 0.03, 'm', 'assumed', [],
    '風の対数分布の粗さ長さ（草地・浜）。風速計の高さから地上10 m相当へ直すのに使う'),
  windRackFactor: P('windRackFactor', 0.6, 'ratio', 'assumed', [],
    '天気の風速（地上10 m、気象サービスの慣例）を棚の高さ（約1 m）の風に直す係数。草地の粗さ0.03 mの対数分布で ln(1/0.03)/ln(10/0.03) ≈ 0.60'),
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
    '脱水は済んだが焼結していない試験体の煮沸吸水率。質量比で、分母は焼成後（吸水前）の質量。SHAB の Variables の式と同じ定義（同ページ Purpose 1.3 の式は分母が違い、不一致がある）'),
  absorptionVitrified: P('absorptionVitrified', 0.05, 'kg/kg', 'assumed', ['S-abs'],
    '試験粘土Aが焼き締まったときの吸水率の下限'),
  overfireC: P('overfireC', 1150, '°C', 'assumed', [], '試験粘土Aが変形し始める温度'),
  coldSoakFraction: P('coldSoakFraction', 0.8, 'ratio', 'assumed', ['S-abs'],
    '24時間冷水浸漬の吸水は煮沸飽和の約8割とする（飽和係数の考え方）。SHAB の手順は5時間煮沸＋19時間浸漬で、冷水浸漬との換算は未確認'),

  // ---- lime (test-world fixtures; kinetics are game calibration)
  kinHydrationTref: P('kinHydrationTref', 25, '°C', 'assumed', [],
    '生石灰の消化の速さ：25 °C で半減期120秒と仮定。実際の速さは焼き方・粒度で大きく変わる（未確認）'),
  cpLimeCharge: P('cpLimeCharge', 0.85, 'J/(g·K)', 'assumed', ['S-heatcap'],
    '石灰の原料・生成物の比熱を一律に仮定。OpenStax の表に石灰はない'),
  cpWater: P('cpWater', 4.186, 'J/(g·K)', 'sourced', ['S-heatcap'], '水の比熱 4186 J/(kg·°C)（OpenStax、15 °C）'),

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
  // the air-and-water barometer (step/barometer.ts)
  waterDensity: P('waterDensity', 1000, 'kg/m3', 'assumed', [], '水の密度（教科書の値。出典本文は未照合。水温による差は扱わない）'),
  gravity: P('gravity', 9.81, 'm/s2', 'assumed', [], '重力加速度（教科書の値。出典本文は未照合）'),
};

export type ParamId = keyof typeof PARAMS;
export const pv = (id: ParamId): number => PARAMS[id].value;
