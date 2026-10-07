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
  // preparing raw clay (step/slake.ts, step/knead.ts): all assumed, no source read yet
  slakeTauDryS: P('slakeTauDryS', 3600, 's', 'assumed', ['S-slake'],
    '乾いた粘土の塊が水の中でほぐれる時定数。湿った粘土ほど遅い（含水比が成形の目安と同じなら5倍）。乾かしてから浸すと早く崩れる、という陶芸の経験則に合わせた仮の値'),
  slipMinWaterRatio: P('slipMinWaterRatio', 1.5, 'kg/kg(dry)', 'assumed', [], '浸すときに要る水（乾いた土の重さあたり）。土がかぶって泥しょうになる量の目安'),
  slipSievableRatio: P('slipSievableRatio', 1.2, 'kg/kg(dry)', 'assumed', [], 'これより水が少ない泥は、こし布を通らない'),
  slipSettledWaterRatio: P('slipSettledWaterRatio', 1.0, 'kg/kg(dry)', 'assumed', [], '沈んだ泥がゆっくり締まって行き着く含水比（固形分おおよそ5割）'),
  slipSettleTauS: P('slipSettleTauS', 6 * 3600, 's', 'assumed', [], '泥が沈んで上澄みができる時定数（深さ・粒の細かさで大きく変わる）'),
  sieveResidueWaterRatio: P('sieveResidueWaterRatio', 0.3, 'kg/kg(dry)', 'assumed', [], 'こし布に残った小石・砂・塊が抱えて出る水'),
  kneadSecondsPerKg: P('kneadSecondsPerKg', 300, 's/kg', 'assumed', [], '手で練る時間（1 kg あたり5分）'),
  kneadPowerW: P('kneadPowerW', 20, 'W', 'assumed', [], '練る手の仕事率（ほどほどの手仕事）。すべて熱になって散る'),
  // coconut oil (step/coconut.ts): all assumed; food-table values not read in a fetched source yet
  coconutHuskFrac: P('coconutHuskFrac', 0.35, 'kg/kg', 'assumed', [], '熟したヤシの実（殻つき）のうち外皮（繊維）の割合'),
  coconutShellFrac: P('coconutShellFrac', 0.13, 'kg/kg', 'assumed', [], '同じく固い殻の割合'),
  coconutMeatFrac: P('coconutMeatFrac', 0.30, 'kg/kg', 'assumed', [], '同じく白い果肉の割合（残りはヤシの水）'),
  coconutMeatWater: P('coconutMeatWater', 0.47, 'kg/kg', 'assumed', [], '果肉の水分（食品成分表の生の果肉でおよそ半分、未照合）'),
  coconutMeatFat: P('coconutMeatFat', 0.335, 'kg/kg', 'assumed', [], '果肉の脂（同じく約3分の1、未照合）'),
  coconutWaterSolids: P('coconutWaterSolids', 0.05, 'kg/kg', 'assumed', [], 'ヤシの水に溶けた糖など'),
  coconutHuskWater: P('coconutHuskWater', 0.3, 'kg/kg', 'assumed', [], '漂着した実の外皮の水分（海水を吸っている）'),
  coconutShellWater: P('coconutShellWater', 0.1, 'kg/kg', 'assumed', [], '固い殻の水分'),
  coconutHuskAshDry: P('coconutHuskAshDry', 0.03, 'kg/kg(dry)', 'assumed', [], '外皮の灰分'),
  coconutShellAshDry: P('coconutShellAshDry', 0.01, 'kg/kg(dry)', 'assumed', [], '殻の灰分'),
  coconutHandSecondsPerNut: P('coconutHandSecondsPerNut', 1200, 's', 'assumed', [], '1個の実の外皮をむき、割り、削り、搾る手間（20分）'),
  coconutHandPowerW: P('coconutHandPowerW', 30, 'W', 'assumed', [], 'その手の仕事率（外皮むきは力仕事）'),
  pressFatDry: P('pressFatDry', 0.5, 'kg/kg', 'assumed', [], '水を足さずに搾ったとき、果肉の脂がミルクに出る割合'),
  pressFatWet: P('pressFatWet', 0.7, 'kg/kg', 'assumed', [], '果肉と同じ重さ以上の水を足して搾ったときの割合（その間は比例）'),
  pressSolids: P('pressSolids', 0.3, 'kg/kg', 'assumed', [], '果肉の脂以外の固形分がミルクに出る割合'),
  pressWater: P('pressWater', 0.85, 'kg/kg', 'assumed', [], '果肉の水と足した水のうち、ミルクとして搾れる割合'),
  boilEndWaterRatio: P('boilEndWaterRatio', 0.02, 'kg/kg', 'assumed', [], '水がこれ（水以外の重さあたり）を下回ると、煮立つのが止まり温度が上がり始める'),
  boilBoundWaterTauS: P('boilBoundWaterTauS', 300, 's', 'assumed', [], '煮立ちが止まったあと、かすに残る水が抜ける時定数'),
  brownRefC: P('brownRefC', 125, '°C', 'assumed', [], 'かすが色づく速さの基準温度'),
  brownTauRefS: P('brownTauRefS', 1200, 's', 'assumed', [], '基準温度でかすが十分に色づくまで（10 K ごとに2倍の速さ）'),
  scorchRefC: P('scorchRefC', 180, '°C', 'assumed', [], '焦げる速さの基準温度（ヤシ油の煙が出始める温度の近く）'),
  scorchTauRefS: P('scorchTauRefS', 600, 's', 'assumed', [], '基準温度ですっかり焦げるまで（10 K ごとに2倍の速さ）'),
  oilRecoverMax: P('oilRecoverMax', 0.9, 'kg/kg', 'assumed', [], 'かすが十分に色づいたとき、脂のうち澄んだ油として分かれる割合（残りはかすに残る）'),
  // charcoal and wood tar in a double-pot retort (step/charcoal.ts): all assumed, no source read yet
  pyroRefC: P('pyroRefC', 350, '°C', 'assumed', [], '乾いた木が熱で分解する速さの基準温度（盛んに分解するのは 250〜400 °C の間）'),
  pyroTauRefS: P('pyroTauRefS', 1800, 's', 'assumed', [], '基準温度で分解が進む時定数（15 K ごとに2倍の速さ、200 °C 未満では進まない）'),
  charYieldLowT: P('charYieldLowT', 0.45, 'kg/kg(dry)', 'assumed', [], '低い温度（300 °C 以下）で分解したときの炭の割合（乾いた木あたり）。茶色く木が残ったような炭'),
  charYieldHighT: P('charYieldHighT', 0.25, 'kg/kg(dry)', 'assumed', [], '高い温度（550 °C 以上）で分解したときの炭の割合。その間は直線'),
  tarYield: P('tarYield', 0.12, 'kg/kg(dry)', 'assumed', [], '分解した乾いた木あたりのタール'),
  pyroWaterYield: P('pyroWaterYield', 0.2, 'kg/kg(dry)', 'assumed', [], '分解でできる水（木酢液の水）'),
  charLhv: P('charLhv', 30e6, 'J/kg', 'assumed', [], '炭の発熱量（熱いうちに開けて燃えた分の熱）'),
  charIgniteC: P('charIgniteC', 300, '°C', 'assumed', [], 'これより熱いうちに空気に触れると炭が燃え出す'),
  // the sealed vessel (step/vessel.ts): all assumed, no source read yet
  tarCoverRefWarmGm2: P('tarCoverRefWarmGm2', 150, 'g/m2', 'assumed', [], '温めた器に塗ったタールが細かい穴をふさぐ目安（1 − e^(−塗った量/これ)）'),
  tarCoverRefColdGm2: P('tarCoverRefColdGm2', 500, 'g/m2', 'assumed', [], '冷たいまま塗ったとき（タールが固くて穴に入らない）'),
  sealPlugTarG: P('sealPlugTarG', 5, 'g', 'assumed', [], '口を栓とタールで封じるのに使うタール'),
  warmWoodG: P('warmWoodG', 300, 'g', 'assumed', [], '器とタールを焚き火で温めるのに燃やす薪'),
  vesselHandSeconds: P('vesselHandSeconds', 900, 's', 'assumed', [], 'タールを塗って封じる手間（15分）'),
  vesselHandPowerW: P('vesselHandPowerW', 15, 'W', 'assumed', [], 'その手の仕事率'),
  seepRefGPerDay: P('seepRefGPerDay', 40, 'g/day', 'assumed', [], '吸水率12%・500 mL の素焼きの器から、28 °C・湿度75%の日陰でしみ出して乾く水（一日あたり）'),
  airLeakRefH: P('airLeakRefH', 2, 'h', 'assumed', [], '吸水率12%・何も塗らない器を封じたとき、中の空気が外と入れ替わる時定数'),
  wallUptakeTauS: P('wallUptakeTauS', 7200, 's', 'assumed', [], '水を入れた器の壁が水を吸う時定数'),
  tarSoftC: P('tarSoftC', 45, '°C', 'assumed', [], '木タールがやわらかくなって垂れ始める温度（日なたの器）'),
  // drying firewood in a stack (step/firewood.ts): all assumed, no source read yet
  woodPieceMm: P('woodPieceMm', 60, 'mm', 'assumed', [], '割った薪の太さの標準（quality.piece_mm がないとき）'),
  woodDryTauRefDays: P('woodDryTauRefDays', 30, 'day', 'assumed', [], '太さ 6 cm の薪が日陰・28 °C・風 2 m/s（10 m）で平衡含水率へ近づく時定数。太さの2乗に比例'),
  woodStackTopM2: P('woodStackTopM2', 0.2, 'm2', 'assumed', [], '薪の山の上面（雨を受ける面積）の標準'),
  woodRainCapture: P('woodRainCapture', 0.3, 'ratio', 'assumed', [], '屋根のない薪の山の上に降った雨のうち、木にしみこむ割合（残りは流れ落ちる）'),
  woodRainMcMax: P('woodRainMcMax', 0.6, 'kg/kg(dry)', 'assumed', [], '雨でしみこむ上限の含水率（表面が水を吸いきった山の平均）'),
  // pots the residents make (step/pottery.ts): all assumed, no source read yet
  potGreenDensity: P('potGreenDensity', 1.9, 'g/cm3', 'assumed', [], '積んだばかりの湿った粘土の密度（器の粘土の量＝片面の面積 × 壁の厚さ × これ）'),
  potHandSecondsBase: P('potHandSecondsBase', 1200, 's', 'assumed', [], '紐を積んで器を作る手間の基本（20分）'),
  potHandSecondsPerKg: P('potHandSecondsPerKg', 2400, 's/kg', 'assumed', [], '粘土 1 kg あたりの手間（40分）'),
  potHandPowerW: P('potHandPowerW', 15, 'W', 'assumed', [], 'その手の仕事率'),
  potShapeWaterMax: P('potShapeWaterMax', 0.32, 'kg/kg(dry)', 'assumed', [], 'これより湿った粘土は積んだ壁がつぶれる'),
  potShapeWaterMin: P('potShapeWaterMin', 0.17, 'kg/kg(dry)', 'assumed', [], 'これより乾いた粘土は紐がひび割れてつながらない'),
  potInsideDryShare: P('potInsideDryShare', 0.5, 'ratio', 'assumed', [], '器の内側の面が外側に比べて乾く割合（中の空気がこもる）'),
  potCoverFluxFactor: P('potCoverFluxFactor', 0.4, 'ratio', 'assumed', [], '葉で覆った器の乾く速さ（覆わないときに対して）'),
  potFallingSlow: P('potFallingSlow', 10, 'ratio', 'assumed', [], '革のかたさを過ぎてから、壁 8 mm の器の水が出てくるのが試験片の何倍遅いか（壁の厚さの2乗に比例）。器が乾ききるまで数日かかるように仮定'),
  // the air-and-water barometer (step/barometer.ts)
  waterDensity: P('waterDensity', 1000, 'kg/m3', 'assumed', [],
    '水の密度。OpenStax の密度表（sources.json openstax-density）は 4 °C の代表値で、島の水温での値ではない。水温による差は扱わない'),
  gravity: P('gravity', 9.81, 'm/s2', 'assumed', [], '重力加速度。OpenStax の例題は 9.80 m/s²。島の重力の照合ではない'),
  pressureRateMaxHPaPerH: P('pressureRateMaxHPaPerH', 20, 'hPa/h', 'assumed', [],
    '気圧が分からない区間で、気圧が変わりうる速さの上限（上昇・下降とも）。与那国島 2015-09-28 の毎時の差（sources.json jma-yonaguni-20150928-hourly）は低下 8.5・上昇 14.7 hPa/h。毎時の差は1時間未満の速い変化の上限を示さないので、全期間・すべての台風での保証値ではない（試験モデルの暫定値）'),
};

export type ParamId = keyof typeof PARAMS;
export const pv = (id: ParamId): number => PARAMS[id].value;
