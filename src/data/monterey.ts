// Regional habitat study, not measured bathymetry or a claim about today's kelp coverage.
import type { Sea } from './locations';
import { fbm, smooth, TERR } from '../core/math';

// A winding sand opening leaves long views between the stands, instead of a uniform wall of plants.
export const kelpCover = (x: number, z: number) => {
  const lane = Math.abs(x - 13 * Math.sin(z * 0.042) - 4);
  return smooth(4, 12, lane) * smooth(0.24, 0.56, fbm(x * 0.027 + 6, z * 0.027 - 5, 3));
};
export const MONTEREY: Sea = {
  id: 'monterey', name: 'モントレー湾', site: 'ジャイアントケルプの森', region: 'USA · California · Monterey Bay',
  lat: 36.621, lon: -121.901, depth: '8–22 m', vis: 16, temp: 13, tempYear: [11, 16], seed: 173, tz: -8,
  tide: { amp: 0.7, lag: 0.55, axis: [0.3, 1] }, swellHs: 0.7,
  blurb: '冷たい太平洋に立ち上がる褐藻の森。長い茎が水面まで伸び、琥珀色の葉の間を緑の光が通る。岩礁と砂の通路が入り組む、モントレー湾の環境をもとにした景観。',
  water: { up: [0.38, 0.65, 0.58], hor: [0.055, 0.28, 0.22], down: [0.015, 0.09, 0.075], fog: 0.035, abs: [0.13, 0.075, 0.09] },
  sand: [0.58, 0.57, 0.48], rock: [0.29, 0.31, 0.27],
  f(x, z) {
    const cover = kelpCover(x, z), ridges = Math.pow(0.5 + 0.5 * Math.sin(x * 0.065 + z * 0.018), 4);
    TERR.reef = cover * 0.78; // existing placement mask means hard substrate here, not tropical coral
    return Math.min(-8.5, -15 - 3.4 * Math.sin(z * 0.009) + cover * (1.8 + ridges * 2.4) + (fbm(x * 0.048 + 2, z * 0.048, 3) - 0.5) * 1.4);
  },
  kelp: { density: kelpCover, extent: 118, spacing: 12 },
  path(s) { return [10 * Math.sin(s * 2) + 32 * Math.sin(s), 55 * Math.cos(s)]; },
  corals: { branch: 0, table: 0, brain: 0, fan: 0, mushroom: 0, clam: 0 },
  anemones: 0, clamSize: [0, 0], eels: 0, animals: {},
  species: [
    { id: 'kelprockfish', ja: 'ケルプ・ロックフィッシュ', sci: 'Sebastes atrovirens', note: '褐色から緑褐色のメバルの仲間。ケルプの葉や岩のそばで目立たずに浮かび、小魚や甲殻類を食べる。',
      diel: 'always', diet: 'fish', pat: 0, c1: [0.32, 0.34, 0.19], c2: [0.53, 0.49, 0.31], shape: 'grouper', size: [0.21, 0.33], habitat: 'reef', schools: 10, n: 3, spread: [2.5, 3, 2.5], alt: [3, 9], speed: 0.45 },
    { id: 'bluerockfish', ja: 'ブルー・ロックフィッシュ', sci: 'Sebastes mystinus', note: '岩礁やケルプ林の中層で群れる青灰色のメバルの仲間。流れてくる動物プランクトンなどを食べる。',
      diel: 'day', diet: 'plankton', pat: 0, c1: [0.20, 0.29, 0.33], c2: [0.49, 0.57, 0.55], shape: 'grouper', size: [0.19, 0.29], habitat: 'reef', schools: 6, n: 16, spread: [4, 2, 4], alt: [4, 8], speed: 0.65 },
    { id: 'senorita', ja: 'セニョリータ', sci: 'Oxyjulis californica', note: '細長い橙褐色のベラの仲間。ケルプ林で小さな無脊椎動物を探し、ほかの魚の体についた寄生生物もついばむ。夜は砂にもぐって休む。',
      diel: 'day', diet: 'invert', pat: 0, c1: [0.61, 0.40, 0.16], c2: [0.80, 0.66, 0.37], shape: 'slender', size: [0.14, 0.23], habitat: 'reef', schools: 7, n: 9, spread: [3, 1.5, 3], alt: [1, 5], speed: 0.85 },
    { id: 'blackperch', ja: 'ブラックパーチ', sci: 'Embiotoca jacksoni', note: 'カリフォルニア沿岸の岩場や海藻のそばにすむウミタナゴの仲間。海藻や岩につく小さな甲殻類などを探す。卵ではなく稚魚を産む。',
      diel: 'day', diet: 'invert', pat: 0, c1: [0.28, 0.28, 0.22], c2: [0.55, 0.50, 0.37], shape: 'oval', size: [0.18, 0.28], habitat: 'reef', schools: 8, n: 5, spread: [2.5, 1, 2.5], alt: [0.6, 2.3], speed: 0.55 },
  ],
  extraGuide: [],
  benthic: [
    ['ジャイアントケルプ', 'Macrocystis pyrifera', '冷たく栄養の豊かな海に育つ大型の褐藻。根に似た付着器で岩をつかみ、葉の付け根の気胞が長い体を浮かせる。水面に広がる葉の層と海底の間に、多くの生きものの居場所ができる。'],
  ],
};
