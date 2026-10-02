// A representative kelp forest at Point Lobos, not a surveyed bathymetric reconstruction.
import { fbm, smooth, TERR } from '../core/math';
import type { Sea } from './locations';

export const POINT_LOBOS: Sea = {
  id: 'pointlobos', habitat: 'kelp', name: 'ポイントロボス', site: 'ブルーフィッシュ・コーブ',
  region: 'United States · California', lat: 36.524, lon: -121.941, tz: -8,
  depth: '6–19 m', vis: 15, temp: 13, tempYear: [11, 15], seed: 317,
  swellHs: 0.8, tide: { amp: 0.75, lag: 0.45, axis: [0.8, -0.4] },
  blurb: 'カリフォルニア海流が育てる冷たい海の森。花崗岩の根からジャイアントケルプが立ち上がり、琥珀色の葉の間をロックフィッシュが漂う。地形と植生の配置は、この環境をもとにした手続き表現。',
  water: { up: [0.40, 0.66, 0.58], hor: [0.075, 0.29, 0.245], down: [0.025, 0.11, 0.105], fog: 0.047, abs: [0.14, 0.037, 0.067] },
  sand: [0.48, 0.47, 0.40], rock: [0.36, 0.36, 0.32],
  f(x, z) {
    // Low, weathered granite ridges cut by broad sandy lanes. The clear central lane
    // curves through the stand and gives the cruise somewhere quiet to breathe.
    const lane = x - 13 * Math.sin(z * 0.025);
    const rock = smooth(5, 15, Math.abs(lane)) * smooth(0.27, 0.57, fbm(x * 0.026 + 7, z * 0.026 - 8, 3));
    const ridge = Math.pow(0.5 + 0.5 * Math.sin(x * 0.071 + z * 0.029 + fbm(x * 0.035, z * 0.035, 3) * 2.5), 1.5);
    TERR.reef = rock; // rocky habitat mask; coral cover is zero in this sea
    return -16.5 + Math.tanh(z * 0.006) * 3.5 + rock * (2.8 + 4.8 * ridge)
      + (fbm(x * 0.055 + 80, z * 0.055, 3) - 0.5) * (0.45 + rock * 1.1);
  },
  path(s) { return [Math.sin(s) * 42 + Math.sin(s * 2) * 9, Math.cos(s) * 62]; },
  corals: { branch: 0, table: 0, brain: 0, fan: 0, mushroom: 0, clam: 0 },
  anemones: 0, clamSize: [0, 0], eels: 0, animals: {},
  extraGuide: [{ id: 'harbor-seal', ja: 'ゼニガタアザラシ', sci: 'Phoca vitulina',
    note: 'ポイントロボスの沿岸で見られるアザラシ。ケルプの森や岩礁を泳ぎ、魚などを探す。息継ぎのときは鼻先を水面へ出す。森の縁をときどき通りかかる。' }],
  species: [
    { id: 'blue-rockfish', ja: 'ブルーロックフィッシュ', sci: 'Sebastes mystinus',
      note: '青灰色のメバルの仲間。カリフォルニアの岩礁やケルプの森で群れ、中層の動物プランクトンなどを食べる。近縁種との厳密な識別には頭部の模様などの確認が必要。',
      shape: 'rockfish', size: [0.23, 0.36], pat: 0, c1: [0.27, 0.34, 0.37], c2: [0.59, 0.65, 0.65],
      habitat: 'reef', schools: 9, n: 12, spread: [4.2, 2.0, 4.2], alt: [3, 8], speed: 0.55, diet: 'plankton', diel: 'day', eye: 1.15 },
    { id: 'olive-rockfish', ja: 'オリーブロックフィッシュ', sci: 'Sebastes serranoides',
      note: 'オリーブ色の背と淡い腹を持つロックフィッシュ。岩礁やケルプの周りの中層で、小魚や甲殻類を捕らえる。大きな口と明るい腹が目印。',
      shape: 'rockfish', size: [0.3, 0.46], pat: 0, c1: [0.38, 0.39, 0.26], c2: [0.71, 0.73, 0.60],
      habitat: 'roam', count: 6, alt: [2, 6], speed: 0.65, diet: 'fish', diel: 'crep', big: true },
    { id: 'black-surfperch', ja: 'ブラックサーフパーチ', sci: 'Embiotoca jacksoni',
      note: '銅色を帯びた暗褐色のウミタナゴの仲間。海藻の茂る岩礁で小さな甲殻類などを探す。卵ではなく育った仔魚を産む。',
      shape: 'surfperch', size: [0.19, 0.28], pat: 6, bands: 6, c1: [0.37, 0.30, 0.23], c2: [0.55, 0.48, 0.34], c3: [0.24, 0.22, 0.19],
      habitat: 'reef', schools: 8, n: 4, spread: [1.8, 0.7, 1.8], alt: [0.5, 2], speed: 0.48, diet: 'invert', diel: 'day' },
    { id: 'senorita', ja: 'セニョリータ', sci: 'Oxyjulis californica',
      note: '細長い橙褐色のベラ。ケルプや岩に付く小さな動物をついばみ、ほかの魚の寄生虫を取ることもある。夜は砂に潜って休むことがある。',
      shape: 'slender', size: [0.15, 0.23], pat: 0, c1: [0.63, 0.40, 0.19], c2: [0.86, 0.71, 0.42],
      habitat: 'reef', schools: 7, n: 5, spread: [2, 1.2, 2], alt: [1, 4], speed: 0.8, diet: 'invert', diel: 'day' },
  ],
  benthic: [
    ['ジャイアントケルプ', 'Macrocystis pyrifera', '数本から多数の茎状部が付着器から伸び、葉の付け根の気胞で水面へ浮かぶ大型の褐藻。海草とは異なる。水面に広がる葉が、森の下にまだらな光を落とす。'],
    ['パープルアーチン', 'Strongylocentrotus purpuratus', '北米西岸の紫色のウニ。海藻を食べ、ケルプの落ち葉も利用する。小さな棘を動かしながら、岩の表面やすき間をゆっくり移動する。'],
    ['バットスター', 'Patiria miniata', '腕の間が膜のように広い、五角形に近いヒトデ。岩礁や砂地で有機物などを食べる。色には個体差がある。'],
    ['紅藻・石灰藻の被覆', 'Rhodophyta（種未同定）', 'ケルプの下の岩に広がる赤紫色の低い藻類。暗い海底でも生育し、色や形の異なる小さな藻が重なる。'],
    ['林床の低い海藻', '褐藻・紅藻類（種未同定）', '背の高いケルプの下にも、幅のある葉や細かく枝分かれした藻が重なる。若いケルプの株とともに岩を覆い、砂の水路へ近づくと疎らになる。'],
    ['岩場の小さな巻貝', '腹足類（種未同定）', '海藻の根元や岩の表面をゆっくりたどる小さな巻貝。丸い殻には細い帯が重なる。近づいて眺めると、足を伸ばして進んでいる。'],
    ['岩に付くイソギンチャク', 'Actiniaria（種未同定）', '岩に体を固定し、流れの中へ触手を広げる。ケルプの森の足元で見つかる、小さな動物のひとつ。'],
    ['岩を覆うカイメン', 'Porifera（種未同定）', '岩の表面に付着して暮らす動物。体を通る水から細かな餌を取り込み、林床に色と凹凸を添える。'],
  ],
};
