// The seas you can dive into. Terrain functions return height (m, surface = 0) and set TERR.reef (0..1 coral cover).
import { fbm, smooth, clamp, bommieField, TERR } from '../core/math';

export interface Species {
  id: string; ja: string; sci: string; note: string;
  pat: number; c1: number[]; c2?: number[]; c3?: number[]; bands?: number; edge?: number;
  shape: string; size: [number, number]; habitat: 'anemone' | 'reef' | 'roam';
  schools?: number; n?: number; count?: number; spread?: number[]; alt?: [number, number];
  speed: number; big?: boolean; wig?: number; freq?: [number, number];
  // ecology
  diel?: 'day' | 'night' | 'crep' | 'always';    // when it is active
  diet?: 'plankton' | 'algae' | 'invert' | 'fish' | 'filter';
  eye?: number;
}
export interface GuideEntry { id: string; ja: string; sci: string; note: string }
export interface Sea {
  id: string; name: string; site: string; region: string; lat: number; lon: number;
  depth: string; vis: number; temp: number; seed: number;
  tz: number; tide: { amp: number; lag: number; axis: [number, number] };
  blurb: string;
  water: { up: number[]; hor: number[]; down: number[]; fog: number; abs: number[] };
  sand: number[]; rock: number[];
  f(x: number, z: number): number;
  grass?(x: number, z: number): number;
  corals: Record<string, number>;
  anemones: number; clamSize: [number, number]; eels: number;
  species: Species[];
  animals: { turtle?: { style: string; count: number }; manta?: number };
  extraGuide: GuideEntry[];
  benthic: [string, string, string][];
}

export const LOCATIONS: Sea[] = [
  {
    id: 'gbr', name: 'グレートバリアリーフ', site: 'アジンコート・リーフ', region: 'Australia · Queensland',
    lat: -15.98, lon: 145.82, depth: '3–27 m', vis: 25, temp: 25.2, seed: 11, tz: 10, tide: { amp: 1.1, lag: 0.4, axis: [0.3, -1] },
    blurb: '外洋に面したリボンリーフ。尾根と溝が交互に並ぶ「スパー・アンド・グルーブ」地形の斜面。',
    water: { up: [0.50, 0.82, 0.86], hor: [0.10, 0.42, 0.50], down: [0.02, 0.14, 0.20], fog: 0.026, abs: [0.10, 0.040, 0.028] },
    sand: [0.82, 0.78, 0.66], rock: [0.46, 0.43, 0.36],
    f(x, z) {
      const front = 8 + (fbm(x * 0.008 + 3, 1.7, 3) - 0.5) * 50;
      const s = smooth(front - 60, front + 20, z);
      let h = -27 + 22 * s;
      const warp = (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 5;
      const sg = Math.pow(Math.abs(Math.sin(x * 0.13 + warp)), 0.7);
      const zone = smooth(0.1, 0.4, s) * (1 - 0.6 * smooth(0.85, 1.0, s));
      h += (sg - 0.55) * 4.5 * zone;
      const b = bommieField(x, z, 26, 0.45, 2, 5, 4, 9, 11, 0.25);
      h += b[0] * (1 - s);
      h += (fbm(x * 0.06 + 9, z * 0.06, 4) - 0.5) * 2.2;
      const patch = smooth(0.45, 0.62, fbm(x * 0.05 + 4, z * 0.05 - 2, 3));
      TERR.reef = Math.max(zone * smooth(0.35, 0.8, sg), smooth(0.8, 0.95, s) * patch, b[1] * 0.9 * (1 - s));
      return Math.min(h, -2.8);
    },
    corals: { branch: 0.30, table: 0.14, brain: 0.22, fan: 0.07, mushroom: 0.14, clam: 0.03 },
    anemones: 34, clamSize: [0.6, 1.1], eels: 0,
    species: [
      { id: 'percula', ja: 'オレンジクラウンフィッシュ', sci: 'Amphiprion percula', note: 'イソギンチャクと共生するクマノミ。太い黒の縁取りがある白帯が3本。',
        diel: 'day', diet: 'plankton', pat: 1, c1: [0.95, 0.40, 0.06], c2: [0.97, 0.97, 0.95], c3: [0.03, 0.03, 0.03], bands: 3, edge: 1, shape: 'clown', size: [0.07, 0.10], habitat: 'anemone', speed: 0.5 },
      { id: 'chromis', ja: 'デバスズメダイ', sci: 'Chromis viridis', note: '枝状サンゴの上に群れ、危険を感じると枝の間へ隠れる。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.42, 0.85, 0.80], c2: [0.72, 0.95, 0.92], shape: 'slender', size: [0.06, 0.09], habitat: 'reef', schools: 9, n: 36, spread: [1.6, 0.7, 1.6], alt: [0.5, 1.4], speed: 0.8 },
      { id: 'tang', ja: 'ナンヨウハギ', sci: 'Paracanthurus hepatus', note: '鮮やかな青に黒い模様、黄色い尾びれ。流れの当たるリーフ斜面で小群をつくる。',
        diel: 'day', diet: 'algae', pat: 2, c1: [0.10, 0.30, 0.86], c2: [0.98, 0.84, 0.12], c3: [0.03, 0.04, 0.10], shape: 'oval', size: [0.18, 0.26], habitat: 'reef', schools: 4, n: 6, spread: [2.4, 1.0, 2.4], alt: [1, 3], speed: 1.0 },
      { id: 'auriga', ja: 'トゲチョウチョウウオ', sci: 'Chaetodon auriga', note: '白地に「く」の字の模様、後半が黄色。目を隠す黒い帯はチョウチョウウオの特徴。',
        diel: 'day', diet: 'invert', pat: 4, c1: [0.95, 0.94, 0.90], c2: [0.98, 0.80, 0.10], c3: [0.04, 0.04, 0.04], shape: 'disc', size: [0.15, 0.21], habitat: 'reef', schools: 7, n: 2, spread: [0.8, 0.3, 0.8], alt: [0.6, 2], speed: 0.8 },
      { id: 'parrot', ja: 'ナンヨウブダイ', sci: 'Chlorurus microrhinos', note: 'くちばし状の歯でサンゴをかじり、白い砂をつくり出す。',
        diel: 'day', diet: 'algae', pat: 10, c1: [0.18, 0.55, 0.55], c2: [0.85, 0.55, 0.55], shape: 'parrot', size: [0.5, 0.7], habitat: 'reef', schools: 3, n: 3, spread: [3, 1, 3], alt: [0.8, 2.5], speed: 1.0, big: true },
      { id: 'wrasse', ja: 'メガネモチノウオ', sci: 'Cheilinus undulatus', note: '通称ナポレオンフィッシュ。額のこぶが目印で、全長2mに達するベラ科最大種。',
        diel: 'day', diet: 'invert', pat: 7, c1: [0.20, 0.46, 0.44], c2: [0.55, 0.78, 0.72], shape: 'wrasse', size: [1.3, 1.8], habitat: 'roam', count: 2, alt: [1.5, 4], speed: 0.7, big: true },
      { id: 'blacktip', ja: 'ツマグロ', sci: 'Carcharhinus melanopterus', note: '背びれと尾びれの先が黒い小型のサメ。昼夜を問わずリーフを巡回し、夕暮れから夜に狩りが活発になる。人には臆病。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.50, 0.52, 0.52], c2: [0.92, 0.92, 0.90], c3: [0.02, 0.02, 0.02], shape: 'shark', size: [1.3, 1.7], habitat: 'roam', count: 3, alt: [1.2, 4], speed: 1.2, big: true },
    ],
    animals: { turtle: { style: 'green', count: 3 } },
    extraGuide: [{ id: 'turtle', ja: 'アオウミガメ', sci: 'Chelonia mydas', note: '海草や藻を食べる草食のウミガメ。体脂肪が緑がかることが名前の由来。' }],
    benthic: [
      ['ミドリイシ（枝状・テーブル状）', 'Acropora spp.', 'リーフの骨格をつくる造礁サンゴ。'],
      ['ハマサンゴ・ノウサンゴ（塊状）', 'Porites / Platygyra', '何百年もかけて岩のように大きくなる。'],
      ['ウミキノコ（ソフトコーラル）', 'Sarcophyton sp.', '骨格を持たず、流れに合わせて揺れる。'],
      ['ウミウチワ（ヤギ類）', 'Gorgonacea', '流れに対して直角に扇を広げてプランクトンを捕らえる。'],
      ['センジュイソギンチャク', 'Heteractis magnifica', 'クマノミの住みか。'],
      ['オオシャコガイ', 'Tridacna gigas', '世界最大の二枚貝。外套膜の色は共生する褐虫藻による。'],
    ],
  },
  {
    id: 'miyako', name: '宮古島', site: '八重干瀬（やびじ）', region: 'Japan · Okinawa',
    lat: 24.96, lon: 125.25, depth: '3–15 m', vis: 40, temp: 28.4, seed: 23, tz: 9, tide: { amp: 0.95, lag: 0.2, axis: [1, 0.35] },
    blurb: '宮古島の北に広がる国内最大級のサンゴ礁群。白砂の上にテーブルサンゴの根が点在する、宮古ブルーの浅瀬。',
    water: { up: [0.58, 0.90, 0.96], hor: [0.10, 0.50, 0.64], down: [0.03, 0.18, 0.30], fog: 0.019, abs: [0.085, 0.030, 0.019] },
    sand: [0.94, 0.92, 0.85], rock: [0.52, 0.50, 0.44],
    f(x, z) {
      let h = -12.5 + (fbm(x * 0.01 + 5, z * 0.01, 3) - 0.5) * 5 + clamp(z * 0.015, -2, 2);
      const a = bommieField(x, z, 22, 0.6, 3.5, 7, 6, 12, 3, 0.25);
      const b = bommieField(x, z, 9, 0.3, 1.0, 2.4, 1.8, 3.8, 21, 0.2);
      h += Math.max(a[0], b[0]);
      h += (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 1.2 * (0.3 + a[1]);
      TERR.reef = Math.max(a[1], b[1] * 0.9);
      return Math.min(h, -2.6);
    },
    grass(x, z) { return (1 - smooth(0.0, 0.4, TERR.reef)) * smooth(0.5, 0.62, fbm(x * 0.03 + 91, z * 0.03 - 40, 4)) * 0.7; },
    corals: { branch: 0.26, table: 0.32, brain: 0.20, fan: 0.02, mushroom: 0.14, clam: 0.06 },
    anemones: 40, clamSize: [0.22, 0.38], eels: 14,
    species: [
      { id: 'ocellaris', ja: 'カクレクマノミ', sci: 'Amphiprion ocellaris', note: 'ハタゴイソギンチャクなどに暮らす。オレンジクラウンフィッシュより黒い縁取りが細い。',
        diel: 'day', diet: 'plankton', pat: 1, c1: [0.98, 0.48, 0.08], c2: [0.97, 0.97, 0.95], c3: [0.03, 0.03, 0.03], bands: 3, edge: 0.45, shape: 'clown', size: [0.07, 0.10], habitat: 'anemone', speed: 0.5 },
      { id: 'chromis', ja: 'デバスズメダイ', sci: 'Chromis viridis', note: '枝状サンゴの上に群れ、危険を感じると枝の間へ隠れる。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.42, 0.85, 0.80], c2: [0.72, 0.95, 0.92], shape: 'slender', size: [0.06, 0.09], habitat: 'reef', schools: 8, n: 36, spread: [1.6, 0.7, 1.6], alt: [0.5, 1.4], speed: 0.8 },
      { id: 'sergeant', ja: 'ロクセンスズメダイ', sci: 'Abudefduf sexfasciatus', note: '銀白色の体に黒い横帯。中層を群れで泳ぎ、ダイバーにも寄ってくる。',
        diel: 'day', diet: 'plankton', pat: 6, c1: [0.86, 0.90, 0.88], c2: [0.86, 0.84, 0.52], c3: [0.05, 0.05, 0.06], shape: 'oval', size: [0.12, 0.16], habitat: 'reef', schools: 5, n: 14, spread: [2.6, 1.3, 2.6], alt: [1.5, 4], speed: 1.0 },
      { id: 'idol', ja: 'ツノダシ', sci: 'Zanclus cornutus', note: '長く伸びた背びれと突き出た口。白・黄・黒の帯模様。',
        diel: 'day', diet: 'invert', pat: 3, c1: [0.97, 0.95, 0.88], c2: [0.98, 0.86, 0.22], c3: [0.03, 0.03, 0.03], shape: 'idol', size: [0.15, 0.2], habitat: 'reef', schools: 5, n: 2, spread: [0.8, 0.4, 0.8], alt: [0.8, 2.5], speed: 0.8 },
      { id: 'nokogiri', ja: 'ノコギリダイ', sci: 'Gnathodentex aureolineatus', note: '銀色の体に金色の縦線。昼は根のまわりに群れて漂う。',
        diel: 'night', diet: 'invert', pat: 5, c1: [0.80, 0.82, 0.82], c2: [0.86, 0.70, 0.30], bands: 7, shape: 'slender', size: [0.2, 0.26], habitat: 'reef', schools: 3, n: 26, spread: [3, 1.2, 3], alt: [0.6, 2], speed: 0.8 },
      { id: 'auriga', ja: 'トゲチョウチョウウオ', sci: 'Chaetodon auriga', note: '白地に「く」の字の模様、後半が黄色。目を隠す黒い帯はチョウチョウウオの特徴。',
        diel: 'day', diet: 'invert', pat: 4, c1: [0.95, 0.94, 0.90], c2: [0.98, 0.80, 0.10], c3: [0.04, 0.04, 0.04], shape: 'disc', size: [0.15, 0.21], habitat: 'reef', schools: 6, n: 2, spread: [0.8, 0.3, 0.8], alt: [0.6, 2], speed: 0.8 },
      { id: 'hibudai', ja: 'ヒブダイ', sci: 'Scarus ghobban', note: '昼はサンゴ礁の藻をかじって砂をつくる。夜は岩陰で、自分で出した粘液の膜にくるまって眠る。',
        diel: 'day', diet: 'algae', pat: 10, c1: [0.22, 0.52, 0.62], c2: [0.95, 0.66, 0.30], shape: 'parrot', size: [0.4, 0.6], habitat: 'reef', schools: 4, n: 3, spread: [2.4, 0.8, 2.4], alt: [0.5, 1.5], speed: 0.9, big: true },
      { id: 'akamatsukasa', ja: 'アカマツカサ', sci: 'Myripristis murdjan', note: '大きな目を持つ夜行性の魚。昼は岩陰やテーブルサンゴの下に隠れ、夜に出てきて動物プランクトンを食べる。',
        diel: 'night', diet: 'plankton', pat: 12, c1: [0.86, 0.20, 0.16], c2: [0.96, 0.52, 0.44], shape: 'oval', size: [0.18, 0.25], habitat: 'reef', schools: 5, n: 7, spread: [1.4, 0.6, 1.4], alt: [0.4, 1.4], speed: 0.6, eye: 1.7 },
      { id: 'kasumiaji', ja: 'カスミアジ', sci: 'Caranx melampygus', note: '青いひれのアジ。夕暮れや明け方にリーフを巡回し、小魚の群れに突っ込んで狩りをする。',
        diel: 'crep', diet: 'fish', pat: 11, c1: [0.42, 0.50, 0.52], c2: [0.86, 0.87, 0.84], c3: [0.20, 0.45, 0.95], shape: 'jack', size: [0.5, 0.8], habitat: 'roam', count: 3, alt: [1.5, 5], speed: 1.4, big: true },
    ],
    animals: { turtle: { style: 'green', count: 5 } },
    extraGuide: [
      { id: 'turtle', ja: 'アオウミガメ', sci: 'Chelonia mydas', note: '宮古島は一年を通してウミガメに出会える島として知られる。' },
      { id: 'eel', ja: 'チンアナゴ', sci: 'Heteroconger hassi', note: '砂に巣穴を掘って体を出し、流れてくるプランクトンを食べる。近づくと引っ込む。' },
    ],
    benthic: [
      ['テーブル状ミドリイシ', 'Acropora hyacinthus など', '八重干瀬を代表する景観。大きいものは直径2mを超える。'],
      ['枝状ミドリイシ', 'Acropora spp.', 'デバスズメダイの隠れ家。'],
      ['ノウサンゴ', 'Platygyra sp.', '脳のような溝模様の塊状サンゴ。'],
      ['ウミキノコ', 'Sarcophyton sp.', 'キノコ形のソフトコーラル。'],
      ['ハタゴイソギンチャク', 'Stichodactyla gigantea', 'カクレクマノミの住みか。'],
      ['ヒメシャコガイ', 'Tridacna crocea', '岩に埋もれるように暮らす小型のシャコガイ。'],
    ],
  },
  {
    id: 'maldives', name: 'モルディブ', site: '南アリ環礁のティラ', region: 'Maldives · South Ari Atoll',
    lat: 3.48, lon: 72.84, depth: '8–30 m', vis: 35, temp: 29.0, seed: 37, tz: 5, tide: { amp: 0.5, lag: 0.1, axis: [-1, 0.2] },
    blurb: '環礁の中にそびえる海中の根「ティラ」。マンタのクリーニングステーションがあり、ジンベエザメが通年見られる海域。',
    water: { up: [0.52, 0.86, 0.96], hor: [0.06, 0.37, 0.58], down: [0.01, 0.09, 0.24], fog: 0.019, abs: [0.10, 0.034, 0.02] },
    sand: [0.90, 0.89, 0.82], rock: [0.48, 0.44, 0.40],
    f(x, z) {
      let h = -27 + (fbm(x * 0.01 + 1, z * 0.01 + 2, 3) - 0.5) * 5;
      const t = bommieField(x, z, 75, 0.6, 16, 20, 18, 30, 7, 0.4);
      const b = bommieField(x, z, 13, 0.28, 1.5, 3.5, 2.2, 4.8, 31, 0.2);
      h += Math.max(t[0], b[0]);
      h += (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 1.6 * (0.3 + t[1]);
      TERR.reef = Math.max(t[1], b[1] * 0.8);
      return Math.min(h, -3);
    },
    corals: { branch: 0.12, table: 0.18, brain: 0.22, fan: 0.2, mushroom: 0.22, clam: 0.02 },
    anemones: 30, clamSize: [0.3, 0.5], eels: 12,
    species: [
      { id: 'nigripes', ja: 'モルディブアネモネフィッシュ', sci: 'Amphiprion nigripes', note: 'モルディブとスリランカ周辺だけに暮らすクマノミ。白帯は頭の後ろの1本だけ。',
        diel: 'day', diet: 'plankton', pat: 1, c1: [0.96, 0.52, 0.24], c2: [0.98, 0.98, 0.96], c3: [0.04, 0.04, 0.04], bands: 1, edge: 0, shape: 'clown', size: [0.08, 0.11], habitat: 'anemone', speed: 0.5 },
      { id: 'anthias', ja: 'キンギョハナダイ', sci: 'Pseudanthias squamipinnis', note: 'オレンジ色の大群がティラの斜面を彩る。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.98, 0.50, 0.22], c2: [0.98, 0.70, 0.45], shape: 'slender', size: [0.08, 0.12], habitat: 'reef', schools: 9, n: 34, spread: [2.4, 1.2, 2.4], alt: [0.5, 2.5], speed: 0.8 },
      { id: 'kasmira', ja: 'ヨスジフエダイ', sci: 'Lutjanus kasmira', note: '黄色の体に青い縦線が4本。昼は根のそばで大群をつくる。',
        diel: 'night', diet: 'invert', pat: 5, c1: [0.98, 0.80, 0.14], c2: [0.40, 0.66, 0.98], bands: 4.2, shape: 'slender', size: [0.22, 0.3], habitat: 'reef', schools: 3, n: 60, spread: [4, 1.6, 4], alt: [1, 3], speed: 0.8 },
      { id: 'idol', ja: 'ツノダシ', sci: 'Zanclus cornutus', note: '長く伸びた背びれと突き出た口。白・黄・黒の帯模様。',
        diel: 'day', diet: 'invert', pat: 3, c1: [0.97, 0.95, 0.88], c2: [0.98, 0.86, 0.22], c3: [0.03, 0.03, 0.03], shape: 'idol', size: [0.15, 0.2], habitat: 'reef', schools: 4, n: 2, spread: [0.8, 0.4, 0.8], alt: [0.8, 2.5], speed: 0.8 },
      { id: 'tang', ja: 'ナンヨウハギ', sci: 'Paracanthurus hepatus', note: '鮮やかな青に黒い模様、黄色い尾びれ。',
        diel: 'day', diet: 'algae', pat: 2, c1: [0.10, 0.30, 0.86], c2: [0.98, 0.84, 0.12], c3: [0.03, 0.04, 0.10], shape: 'oval', size: [0.18, 0.26], habitat: 'reef', schools: 3, n: 5, spread: [2.4, 1.0, 2.4], alt: [1, 3], speed: 1.0 },
      { id: 'blacktip', ja: 'ツマグロ', sci: 'Carcharhinus melanopterus', note: '背びれと尾びれの先が黒い小型のサメ。昼夜を問わずリーフを巡回し、夕暮れから夜に狩りが活発になる。人には臆病。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.50, 0.52, 0.52], c2: [0.92, 0.92, 0.90], c3: [0.02, 0.02, 0.02], shape: 'shark', size: [1.3, 1.7], habitat: 'roam', count: 3, alt: [1.5, 5], speed: 1.2, big: true },
      { id: 'whaleshark', ja: 'ジンベエザメ', sci: 'Rhincodon typus', note: '世界最大の魚類。プランクトンを濾し取って食べる。南アリ環礁は通年観察できる海として有名。',
        diel: 'always', diet: 'filter', pat: 9, c1: [0.22, 0.30, 0.36], c2: [0.86, 0.88, 0.86], shape: 'whale', size: [6.5, 8], habitat: 'roam', count: 1, alt: [6, 11], speed: 0.9, big: true, wig: 0.6, freq: [1.4, 1.8] },
    ],
    animals: { turtle: { style: 'hawksbill', count: 2 }, manta: 2 },
    extraGuide: [
      { id: 'manta', ja: 'ナンヨウマンタ', sci: 'Mobula alfredi', note: '翼幅3〜5m。ティラのクリーニングステーションに集まり、小魚に体を掃除してもらう。' },
      { id: 'turtle', ja: 'タイマイ', sci: 'Eretmochelys imbricata', note: '鷹のくちばしのような口でカイメンを食べる。べっ甲の甲羅を持つ絶滅危惧種。' },
      { id: 'eel', ja: 'チンアナゴ', sci: 'Heteroconger hassi', note: '砂に巣穴を掘って体を出し、流れてくるプランクトンを食べる。近づくと引っ込む。' },
    ],
    benthic: [
      ['ウミウチワ（ヤギ類）', 'Gorgonacea', 'ティラの壁で流れに向かって扇を広げる。'],
      ['ソフトコーラル', 'Sarcophyton / Sinularia', '潮通しのよい根を覆う。'],
      ['テーブル状ミドリイシ', 'Acropora spp.', '根の上の浅い部分に育つ。'],
      ['ハマサンゴ（塊状）', 'Porites sp.', 'ゆっくり育つ岩のようなサンゴ。'],
      ['センジュイソギンチャク', 'Heteractis magnifica', 'モルディブアネモネフィッシュの住みか。'],
    ],
  },
];
