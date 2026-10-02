// The seas you can dive into. Terrain functions return height (m, surface = 0) and set TERR.reef (0..1 coral cover).
import { POINT_LOBOS } from './pointlobos';
import { fbm, smooth, clamp, bommieField, vnoise, TERR } from '../core/math';
import { caveFootprint, type CaveSpec } from '../ocean/cave';
import type { WreckSpec } from '../ocean/wreck';
import type { WhaleSeason } from '../eco/whale';
import { landOf } from '../ocean/land';
import type { CritterSpec } from '../eco/critters';

export interface Species {
  id: string; ja: string; sci: string; note: string;
  pat: number; c1: number[]; c2?: number[]; c3?: number[]; bands?: number; edge?: number;
  shape: string; size: [number, number]; habitat: 'anemone' | 'reef' | 'roam' | 'shoal';
  schools?: number; n?: number; count?: number; spread?: number[]; alt?: [number, number];
  speed: number; big?: boolean; wig?: number; freq?: [number, number];
  // ecology
  diel?: 'day' | 'night' | 'crep' | 'always';    // when it is active
  diet?: 'plankton' | 'algae' | 'invert' | 'fish' | 'filter';
  eye?: number;
  shine?: number;                                // how mirror-like its flanks are (1 = ordinary)
  cocoon?: boolean;                              // sleeps in a mucus cocoon (parrotfish)
  wreck?: boolean;                               // keeps to the wreck (glassfish in her shadows, anthias over her)
  rests?: 'cave';                                // lies still on the floor of the cave while inactive (whitetip reef shark)
}
// seabirds over the site: how they fly, and whether they rest on the water
export interface BirdSpec {
  id: string; ja: string; sci: string; note: string;
  kind: 'booby' | 'tern' | 'albatross' | 'frigate';
  count: number; span: number;            // wingspan (m)
  c1: number[]; c2: number[]; c3: number[];   // upperparts, underparts, bill / cap
  speed: number; glide: number;           // m/s; fraction of the time spent gliding
  alt: [number, number]; rest: number;     // flying height (m); how often it settles on the sea (0 never)
  crowd?: boolean;                         // a great flock that only comes in to a bait ball (out of sight otherwise)
}
export interface GuideEntry { id: string; ja: string; sci: string; note: string }
export interface Sea {
  habitat?: 'kelp';                     // cold-water rocky habitat, without tropical reef defaults
  id: string; name: string; site: string; region: string; lat: number; lon: number;
  depth: string; vis: number; temp: number; seed: number;
  tz: number; tide: { amp: number; lag: number; axis: [number, number] };
  blurb: string;
  water: { up: number[]; hor: number[]; down: number[]; fog: number; abs: number[] };
  sand: number[]; rock: number[];
  f(x: number, z: number): number;
  grass?(x: number, z: number): number;
  swellHs?: number;                        // typical significant wave height (m) when there is no live sea state
  birds?: BirdSpec[];
  // bait balls: the small schooling fish that get driven to the surface, and who drives them
  bait?: { sp: Species; predators: { id: string; n: number }[] };
  pelagic?: boolean;                       // open ocean: no bottom in sight; f() is only a placement floor far below
  land?: { half: number; far: number; roam: number; center: [number, number] };   // real terrain that comes ashore (ocean/land.ts), loaded before building: fine and whole-island squares, how far the drone may go, the island's middle
  path?(s: number): [number, number];      // the auto-cruise loop, where the default one would run aground
  residents?: boolean;                     // the robots who live on the island (robots/residents.ts)
  cave?: CaveSpec;                         // a limestone massif with a tunnel and skylights, on flat sand
  wreck?: WreckSpec;                       // a shipwreck on the sand (ocean/wreck.ts)
  whales?: WhaleSeason;                    // humpbacks visit in these months
  tempYear?: [number, number];             // sea surface temperature, coolest and warmest month (°C)
  corals: Record<string, number>;
  anemones: number; clamSize: [number, number]; eels: number;
  species: Species[];
  animals: { turtle?: { style: string; count: number }; manta?: number; octopus?: number };
  extraGuide: GuideEntry[];
  benthic: [string, string, string][];
  flora?: [string, string, string][];      // plants ashore (for the guide)
  critters?: CritterSpec[];                // morays, sea snakes, jellyfish (eco/critters.ts)
}

export const LOCATIONS: Sea[] = [
  POINT_LOBOS,
  {
    id: 'gbr', swellHs: 1.3, name: 'グレートバリアリーフ', site: 'アジンコート・リーフ', region: 'Australia · Queensland',
    lat: -15.98, lon: 145.82, depth: '3–27 m', vis: 25, temp: 25.2, tempYear: [24, 29.5], seed: 11, tz: 10, tide: { amp: 1.1, lag: 0.4, axis: [0.3, -1] },
    blurb: '外洋に面したリボンリーフ。尾根と溝が交互に並ぶ「スパー・アンド・グルーブ」地形の斜面。',
    water: { up: [0.36, 0.72, 0.84], hor: [0.04, 0.33, 0.50], down: [0.01, 0.10, 0.20], fog: 0.026, abs: [0.26, 0.06, 0.04] },
    sand: [0.70, 0.67, 0.58], rock: [0.46, 0.43, 0.36],
    f(x, z) {
      const front = 8 + (fbm(x * 0.008 + 3, 1.7, 3) - 0.5) * 50;
      const s = smooth(front - 60, front + 20, z);
      let h = -27 + 22 * s;
      const warp = (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 5;
      const sg = Math.pow(Math.abs(Math.sin(x * 0.13 + warp)), 0.7);
      const zone = smooth(0.1, 0.4, s) * (1 - 0.6 * smooth(0.85, 1.0, s));
      h += (sg - 0.55) * 4.5 * zone;
      const b = bommieField(x, z, 26, 0.45, 2, 5, 4, 9, 11, 0.5);
      h += b[0] * (1 - s);
      h += (fbm(x * 0.06 + 9, z * 0.06, 4) - 0.5) * 2.2;
      const patch = smooth(0.45, 0.62, fbm(x * 0.05 + 4, z * 0.05 - 2, 3));
      TERR.reef = Math.max(zone * smooth(0.35, 0.8, sg), smooth(0.8, 0.95, s) * patch, b[1] * 0.9 * (1 - s));
      return Math.min(h, -2.8);
    },
    corals: { branch: 0.30, table: 0.14, brain: 0.22, fan: 0.07, mushroom: 0.14, clam: 0.03 },
    anemones: 34, clamSize: [0.6, 1.1], eels: 0,
    birds: [
      { id: 'katsuodori', ja: 'カツオドリ', sci: 'Sula leucogaster', note: '焦げ茶の背と白い腹の海鳥。高いところから翼をたたんで海へ突っ込み、魚を捕る。水面に浮かんで休むことも多い。', kind: 'booby', count: 7, span: 1.4, c1: [0.24, 0.18, 0.13], c2: [0.94, 0.93, 0.9], c3: [0.9, 0.82, 0.45], speed: 11, glide: 0.55, alt: [4, 28], rest: 0.5 },
      { id: 'ooajisashi', ja: 'オオアジサシ', sci: 'Thalasseus bergii', note: '黄色いくちばしと黒い冠羽のアジサシ。水面の上をふわふわと飛び、小魚を見つけると急降下する。', kind: 'tern', count: 6, span: 1.1, c1: [0.62, 0.64, 0.66], c2: [0.96, 0.96, 0.95], c3: [0.95, 0.85, 0.2], speed: 9, glide: 0.25, alt: [3, 14], rest: 0 },
    ],
    bait: {
      sp: { id: 'mizun', ja: 'ミズン', sci: 'Herklotsichthys quadrimaculatus', note: 'リーフの浅場で何千匹もの群れをつくるニシンの仲間。ふだんは広がって漂い、捕食者に囲まれると身を寄せ合って球のように固まる（ベイトボール）。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.3, 0.52, 0.58], c2: [0.86, 0.89, 0.9], shape: 'slender', size: [0.11, 0.15], habitat: 'shoal', speed: 1.2, shine: 3.5 },
      predators: [{ id: 'rouninaji', n: 6 }, { id: 'onikamasu', n: 3 }, { id: 'blacktip', n: 2 }],
    },
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
        diel: 'always', diet: 'fish', pat: 8, c1: [0.50, 0.52, 0.52], c2: [0.92, 0.92, 0.90], c3: [0.02, 0.02, 0.02], shape: 'shark', size: [1.3, 1.7], habitat: 'roam', count: 3, alt: [1.2, 4], speed: 1.2, big: true, eye: 0.45 },
      { id: 'mitsuji', ja: 'ミスジリュウキュウスズメダイ', sci: 'Dascyllus aruanus', note: '白地に黒い帯が3本。枝サンゴの上に小さな群れで暮らし、危ないとすぐ枝の間に隠れる。群れにはなわばりの順位がある。',
        diel: 'day', diet: 'plankton', pat: 6, c1: [0.95, 0.95, 0.93], c2: [0.93, 0.93, 0.92], c3: [0.03, 0.03, 0.04], shape: 'disc', size: [0.06, 0.08], habitat: 'reef', schools: 7, n: 9, spread: [0.8, 0.4, 0.8], alt: [0.3, 0.9], speed: 0.6 },
      { id: 'suji-ara', ja: 'スジアラ', sci: 'Plectropomus leopardus', note: '赤い体に青い小さな斑点が散るハタの仲間。サンゴの陰から待ち伏せて小魚を一瞬で吸い込む、リーフの主役級の捕食者。',
        diel: 'crep', diet: 'fish', pat: 15, c1: [0.82, 0.24, 0.16], c2: [0.9, 0.46, 0.36], c3: [0.35, 0.62, 0.95], shape: 'grouper', size: [0.5, 0.8], habitat: 'roam', count: 3, alt: [0.5, 2], speed: 0.9, big: true },
      { id: 'tatejima', ja: 'タテジマキンチャクダイ', sci: 'Pomacanthus imperator', note: '青地に黄色い線が走る大型のキンチャクダイ。目の上を黒い帯が隠す。幼魚は白い渦巻き模様で、成長するとまるで別の魚のように変わる。',
        diel: 'day', diet: 'invert', pat: 16, c1: [0.12, 0.22, 0.72], c2: [0.98, 0.84, 0.14], c3: [0.03, 0.04, 0.1], bands: 7, shape: 'angel', size: [0.25, 0.35], habitat: 'reef', schools: 4, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.5, 2], speed: 0.7 },
      { id: 'onikamasu', ja: 'オニカマス', sci: 'Sphyraena barracuda', note: '通称グレート・バラクーダ。銀色の細長い体で中層に静止し、獲物に気づくと矢のような速さで襲いかかる。背の黒い山形の模様と、尾の近くの黒い斑点が目印。',
        diel: 'crep', diet: 'fish', pat: 17, c1: [0.5, 0.55, 0.58], c2: [0.86, 0.88, 0.9], c3: [0.12, 0.14, 0.16], shape: 'barracuda', size: [1.0, 1.5], habitat: 'roam', count: 2, alt: [2, 6], speed: 1.3, big: true },
      { id: 'rouninaji', ja: 'ロウニンアジ', sci: 'Caranx ignobilis', note: '通称GT（ジャイアント・トレバリー）。最大1.7mになるアジ科最大の魚。群れで小魚を追い込み、ときにはリーフの浅瀬で海鳥の雛まで襲う。',
        diel: 'crep', diet: 'fish', pat: 11, c1: [0.38, 0.4, 0.42], c2: [0.72, 0.74, 0.74], c3: [0.12, 0.13, 0.14], shape: 'jack', size: [0.9, 1.4], habitat: 'roam', count: 2, alt: [1.5, 6], speed: 1.4, big: true },
      { id: 'kosyoudai', ja: 'アジアコショウダイ', sci: 'Plectorhinchus vittatus', note: '白地に黒い縦縞、黄色いひれと分厚い唇。昼はテーブルサンゴの下で群れて休み、夜に砂地へ出て餌をあさる。',
        diel: 'night', diet: 'invert', pat: 18, c1: [0.95, 0.94, 0.9], c2: [0.06, 0.06, 0.07], c3: [0.98, 0.84, 0.16], bands: 13, shape: 'grouper', size: [0.4, 0.6], habitat: 'reef', schools: 3, n: 5, spread: [1.4, 0.6, 1.4], alt: [0.4, 1.5], speed: 0.6 },
      { id: 'tsubameuo', ja: 'ツバメウオ', sci: 'Platax teira', note: '円盤のように平たく背の高い体。好奇心が強く、群れでゆったりとダイバーに寄ってくる。目と胸びれを通る黒い帯が目印。',
        diel: 'day', diet: 'invert', pat: 6, c1: [0.82, 0.8, 0.72], c2: [0.74, 0.73, 0.68], c3: [0.14, 0.13, 0.12], bands: 2.1, shape: 'batfish', size: [0.4, 0.55], habitat: 'reef', schools: 2, n: 6, spread: [2.5, 1.2, 2.5], alt: [2, 5], speed: 0.6 },
      { id: 'itachizame', ja: 'イタチザメ', sci: 'Galeocerdo cuvier', note: '通称タイガーシャーク。体の縞模様は若いほど濃い。ウミガメの甲羅も噛み砕く歯を持ち、魚、海鳥、ウミヘビまで何でも食べる海の掃除屋。全長4mを超える。',
        diel: 'always', diet: 'fish', pat: 21, c1: [0.4, 0.4, 0.37], c2: [0.88, 0.88, 0.86], c3: [0.18, 0.18, 0.17], shape: 'tiger', size: [3.0, 4.2], habitat: 'roam', count: 1, alt: [2, 8], speed: 0.8, big: true, eye: 0.4 },
      { id: 'tamakai', ja: 'タマカイ', sci: 'Epinephelus lanceolatus', note: '世界最大級のハタ。全長2mを超え、体重は300kgにも。サンゴ礁の洞や沈船に住みつき、大きな口で魚やカニ、小型のサメまで丸呑みにする。',
        diel: 'crep', diet: 'fish', pat: 15, c1: [0.32, 0.3, 0.24], c2: [0.55, 0.52, 0.4], c3: [0.85, 0.78, 0.35], shape: 'grouper', size: [1.6, 2.3], habitat: 'roam', count: 1, alt: [0.8, 3], speed: 0.5, big: true },
      { id: 'akashumoku', ja: 'アカシュモクザメ', sci: 'Sphyrna lewini', note: 'ハンマー形の頭の両端に目がある。頭で電気や匂いを広く捉え、砂に隠れた獲物も探し当てる。昼は数十〜数百匹の群れで回遊し、夜に散らばって狩りをする。沖縄では冬に群れが現れる。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.45, 0.45, 0.43], c2: [0.9, 0.9, 0.88], c3: [0.3, 0.3, 0.3], shape: 'hammer', size: [2.2, 3.0], habitat: 'roam', count: 2, alt: [5, 12], speed: 1.0, big: true, eye: 0.01 },
      { id: 'gingameaji', ja: 'ギンガメアジ', sci: 'Caranx sexfasciatus', note: '大きな目の銀色のアジ。昼は数百匹が渦を巻くように群れ（トルネード）、夜になると散らばって小魚を狩る。',
        diel: 'night', diet: 'fish', pat: 11, c1: [0.6, 0.64, 0.66], c2: [0.86, 0.88, 0.88], c3: [0.2, 0.22, 0.24], shape: 'jack', size: [0.5, 0.75], habitat: 'shoal', schools: 1, n: 110, alt: [4, 10], speed: 1.2, freq: [5, 7], eye: 1.4 },
    ],
    animals: { turtle: { style: 'green', count: 3 } },
    extraGuide: [{ id: 'turtle', ja: 'アオウミガメ', sci: 'Chelonia mydas', note: '海草や藻を食べる草食のウミガメ。体脂肪が緑がかることが名前の由来。' }, { id: 'tobiuo', ja: 'ハマトビウオの仲間', sci: 'Cheilopogon spp.', note: '外洋に面したリーフの外で、船やドローンが近づくと群れで水面から飛び出す。胸びれを翼のように広げて水面の1mほど上を滑空し、尾びれの下の長い葉で水面を叩いて何度も飛び直す。' }],
    benthic: [
      ['ミドリイシ（枝状・テーブル状）', 'Acropora spp.', 'リーフの骨格をつくる造礁サンゴ。'],
      ['ハマサンゴ・ノウサンゴ（塊状）', 'Porites / Platygyra', '何百年もかけて岩のように大きくなる。'],
      ['ウミキノコ（ソフトコーラル）', 'Sarcophyton sp.', '骨格を持たず、流れに合わせて揺れる。'],
      ['ウミウチワ（ヤギ類）', 'Gorgonacea', '流れに対して直角に扇を広げてプランクトンを捕らえる。'],
      ['センジュイソギンチャク', 'Heteractis magnifica', 'クマノミの住みか。'],
      ['オオシャコガイ', 'Tridacna gigas', '世界最大の二枚貝。外套膜の色は共生する褐虫藻による。'],
      ['アオヒトデ', 'Linckia laevigata', '鮮やかな青いヒトデ。リーフの縁や瓦礫の上でよく見かける。'],
      ['クロナマコ', 'Holothuria atra', '砂をまぶした黒いナマコ。砂ごと食べて有機物を漉し取り、砂をきれいにする。'],
    ],
  },
  {
    id: 'miyako', swellHs: 0.7, name: '宮古島', site: '八重干瀬（やびじ）', region: 'Japan · Okinawa',
    lat: 25.0, lon: 125.25, depth: '3–15 m', vis: 40, temp: 28.4, tempYear: [21.5, 29.5], seed: 23, tz: 9, tide: { amp: 0.95, lag: 0.2, axis: [1, 0.35] },
    blurb: '宮古島の北に広がる国内最大級のサンゴ礁群。白砂の上にテーブルサンゴの根が点在する、宮古ブルーの浅瀬。',
    water: { up: [0.24, 0.62, 1.0], hor: [0.0, 0.30, 0.76], down: [0.0, 0.08, 0.3], fog: 0.0135, abs: [0.24, 0.05, 0.022] },
    sand: [0.78, 0.77, 0.72], rock: [0.52, 0.50, 0.44],
    f(x, z) {
      let h = -12.5 + (fbm(x * 0.01 + 5, z * 0.01, 3) - 0.5) * 5 + clamp(z * 0.015, -2, 2);
      const a = bommieField(x, z, 22, 0.6, 3.5, 7, 6, 12, 3, 0.5);
      const b = bommieField(x, z, 9, 0.3, 1.0, 2.4, 1.8, 3.8, 21, 0.45);
      h += Math.max(a[0], b[0]);
      h += (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 1.2 * (0.3 + a[1]);
      TERR.reef = Math.max(a[1], b[1] * 0.9);
      return Math.min(h, -2.6);
    },
    grass(x, z) { return (1 - smooth(0.0, 0.4, TERR.reef)) * smooth(0.5, 0.62, fbm(x * 0.03 + 91, z * 0.03 - 40, 4)) * 0.7; },
    // Miyako and Irabu are known for their caves (魔王の宮殿, アントニオ・ガウディ): light pours through holes in the roof
    cave: { x: 45, z: 25, rot: 0.35 },
    corals: { branch: 0.30, table: 0.22, brain: 0.24, fan: 0.02, mushroom: 0.16, clam: 0.06 },
    anemones: 40, clamSize: [0.22, 0.38], eels: 14,
    birds: [
      { id: 'katsuodori', ja: 'カツオドリ', sci: 'Sula leucogaster', note: '焦げ茶の背と白い腹の海鳥。高いところから翼をたたんで海へ突っ込み、魚を捕る。水面に浮かんで休むことも多い。', kind: 'booby', count: 7, span: 1.4, c1: [0.24, 0.18, 0.13], c2: [0.94, 0.93, 0.9], c3: [0.9, 0.82, 0.45], speed: 11, glide: 0.55, alt: [4, 28], rest: 0.5 },
      { id: 'erigure', ja: 'エリグロアジサシ', sci: 'Sterna sumatrana', note: '真っ白な体に黒い後頭部。夏に沖縄の岩礁で子育てし、サンゴ礁の上を軽やかに飛ぶ。', kind: 'tern', count: 10, span: 0.62, c1: [0.9, 0.92, 0.94], c2: [0.98, 0.98, 0.98], c3: [0.05, 0.05, 0.05], speed: 8, glide: 0.2, alt: [3, 12], rest: 0 },
    ],
    bait: {
      sp: { id: 'mizun', ja: 'ミズン', sci: 'Herklotsichthys quadrimaculatus', note: 'リーフの浅場で何千匹もの群れをつくるニシンの仲間。ふだんは広がって漂い、捕食者に囲まれると身を寄せ合って球のように固まる（ベイトボール）。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.3, 0.52, 0.58], c2: [0.86, 0.89, 0.9], shape: 'slender', size: [0.11, 0.15], habitat: 'shoal', speed: 1.2, shine: 3.5 },
      predators: [{ id: 'kasumiaji', n: 6 }, { id: 'onikamasu', n: 3 }, { id: 'blacktip', n: 2 }],
    },
    species: [
      { id: 'ocellaris', ja: 'カクレクマノミ', sci: 'Amphiprion ocellaris', note: 'ハタゴイソギンチャクなどに暮らす。オレンジクラウンフィッシュより黒い縁取りが細い。',
        diel: 'day', diet: 'plankton', pat: 1, c1: [0.98, 0.48, 0.08], c2: [0.97, 0.97, 0.95], c3: [0.03, 0.03, 0.03], bands: 3, edge: 0.45, shape: 'clown', size: [0.07, 0.10], habitat: 'anemone', speed: 0.5 },
      { id: 'chromis', ja: 'デバスズメダイ', sci: 'Chromis viridis', note: '枝状サンゴの上に群れ、危険を感じると枝の間へ隠れる。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.42, 0.85, 0.80], c2: [0.72, 0.95, 0.92], shape: 'slender', size: [0.06, 0.09], habitat: 'reef', schools: 8, n: 36, spread: [1.6, 0.7, 1.6], alt: [0.5, 1.4], speed: 0.8 },
      { id: 'umeiro', ja: 'ウメイロモドキ', sci: 'Caesio teres', note: '青い体に黄色い背中と尾びれのタカサゴの仲間。昼は中層で何百匹もの大群をつくってプランクトンを食べ、夜はリーフの近くで休む。',
        diel: 'day', diet: 'plankton', pat: 13, c1: [0.16, 0.36, 0.92], c2: [0.98, 0.84, 0.1], c3: [0.82, 0.9, 0.96], shape: 'fusilier', size: [0.24, 0.34], habitat: 'shoal', schools: 3, n: 320, alt: [4, 9], speed: 1.1, freq: [7, 10] },
      { id: 'sergeant', ja: 'ロクセンスズメダイ', sci: 'Abudefduf sexfasciatus', note: '銀白色の体に黒い横帯。中層を群れで泳ぎ、ダイバーにも寄ってくる。',
        diel: 'day', diet: 'plankton', pat: 6, c1: [0.86, 0.90, 0.88], c2: [0.86, 0.84, 0.52], c3: [0.05, 0.05, 0.06], shape: 'oval', size: [0.12, 0.16], habitat: 'reef', schools: 5, n: 14, spread: [2.6, 1.3, 2.6], alt: [1.5, 4], speed: 1.0 },
      { id: 'idol', ja: 'ツノダシ', sci: 'Zanclus cornutus', note: '長く伸びた背びれと突き出た口。白・黄・黒の帯模様。',
        diel: 'day', diet: 'invert', pat: 3, c1: [0.97, 0.95, 0.88], c2: [0.98, 0.86, 0.22], c3: [0.03, 0.03, 0.03], shape: 'idol', size: [0.15, 0.2], habitat: 'reef', schools: 5, n: 2, spread: [0.8, 0.4, 0.8], alt: [0.8, 2.5], speed: 0.8 },
      { id: 'nokogiri', ja: 'ノコギリダイ', sci: 'Gnathodentex aureolineatus', note: '銀色の体に金色の縦線。昼は根のまわりに群れて漂う。',
        diel: 'night', diet: 'invert', pat: 5, c1: [0.80, 0.82, 0.82], c2: [0.86, 0.70, 0.30], bands: 7, shape: 'slender', size: [0.2, 0.26], habitat: 'reef', schools: 3, n: 26, spread: [3, 1.2, 3], alt: [0.6, 2], speed: 0.8 },
      { id: 'auriga', ja: 'トゲチョウチョウウオ', sci: 'Chaetodon auriga', note: '白地に「く」の字の模様、後半が黄色。目を隠す黒い帯はチョウチョウウオの特徴。',
        diel: 'day', diet: 'invert', pat: 4, c1: [0.95, 0.94, 0.90], c2: [0.98, 0.80, 0.10], c3: [0.04, 0.04, 0.04], shape: 'disc', size: [0.15, 0.21], habitat: 'reef', schools: 6, n: 2, spread: [0.8, 0.3, 0.8], alt: [0.6, 2], speed: 0.8 },
      { id: 'hibudai', ja: 'ヒブダイ', sci: 'Scarus ghobban', note: '昼はサンゴ礁の藻をかじって砂をつくる。夜は岩陰で、自分で出した粘液の膜にくるまって眠る。',
        diel: 'day', diet: 'algae', pat: 10, c1: [0.22, 0.52, 0.62], c2: [0.95, 0.66, 0.30], shape: 'parrot', size: [0.4, 0.6], habitat: 'reef', schools: 4, n: 3, spread: [2.4, 0.8, 2.4], alt: [0.5, 1.5], speed: 0.9, big: true, cocoon: true },
      { id: 'yarai', ja: 'ヤライイシモチ', sci: 'Cheilodipterus quinquelineatus', note: '黒い縦縞が5本のテンジクダイの仲間。昼は枝サンゴの間でじっと群れ、夜になると散らばって小さな甲殻類を食べる。',
        diel: 'night', diet: 'invert', pat: 5, c1: [0.86, 0.87, 0.82], c2: [0.08, 0.08, 0.09], bands: 5.5, shape: 'slender', size: [0.08, 0.12], habitat: 'reef', schools: 6, n: 16, spread: [1.0, 0.5, 1.0], alt: [0.3, 1.0], speed: 0.5, eye: 1.5 },
      { id: 'akamatsukasa', ja: 'アカマツカサ', sci: 'Myripristis murdjan', note: '大きな目を持つ夜行性の魚。昼は岩陰やテーブルサンゴの下に隠れ、夜に出てきて動物プランクトンを食べる。',
        diel: 'night', diet: 'plankton', pat: 12, c1: [0.86, 0.20, 0.16], c2: [0.96, 0.52, 0.44], shape: 'oval', size: [0.18, 0.25], habitat: 'reef', schools: 5, n: 7, spread: [1.4, 0.6, 1.4], alt: [0.4, 1.4], speed: 0.6, eye: 1.7 },
      { id: 'blacktip', ja: 'ツマグロ', sci: 'Carcharhinus melanopterus', note: '背びれと尾びれの先が黒い小型のサメ。宮古の浅いリーフでもよく見られる。夕暮れから夜に狩りが活発になる。人には臆病。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.50, 0.50, 0.47], c2: [0.92, 0.92, 0.90], c3: [0.02, 0.02, 0.02], shape: 'shark', size: [1.2, 1.6], habitat: 'roam', count: 2, alt: [1.2, 4], speed: 1.2, big: true, eye: 0.45 },
      { id: 'nemuribuka', ja: 'ネムリブカ', sci: 'Triaenodon obesus', note: '和名は「眠るサメ」。えらに水を送り込めるので、泳がずに洞窟や岩棚の下でじっと休める。昼は休み、夜になると岩の隙間に頭を突っ込んで魚を探す。第1背びれと尾びれの先が白い。',
        diel: 'night', diet: 'fish', pat: 14, c1: [0.42, 0.41, 0.39], c2: [0.86, 0.86, 0.84], c3: [0.96, 0.96, 0.94], shape: 'whitetip', size: [1.3, 1.6], habitat: 'roam', count: 2, alt: [0.8, 2.5], speed: 1.0, big: true, eye: 0.4, rests: 'cave' },
      { id: 'kasumiaji', ja: 'カスミアジ', sci: 'Caranx melampygus', note: '青いひれのアジ。夕暮れや明け方にリーフを巡回し、小魚の群れに突っ込んで狩りをする。',
        diel: 'crep', diet: 'fish', pat: 11, c1: [0.42, 0.50, 0.52], c2: [0.86, 0.87, 0.84], c3: [0.20, 0.45, 0.95], shape: 'jack', size: [0.5, 0.8], habitat: 'roam', count: 3, alt: [1.5, 5], speed: 1.4, big: true },
      { id: 'mitsuji', ja: 'ミスジリュウキュウスズメダイ', sci: 'Dascyllus aruanus', note: '白地に黒い帯が3本。枝サンゴの上に小さな群れで暮らし、危ないとすぐ枝の間に隠れる。群れにはなわばりの順位がある。',
        diel: 'day', diet: 'plankton', pat: 6, c1: [0.95, 0.95, 0.93], c2: [0.93, 0.93, 0.92], c3: [0.03, 0.03, 0.04], shape: 'disc', size: [0.06, 0.08], habitat: 'reef', schools: 7, n: 9, spread: [0.8, 0.4, 0.8], alt: [0.3, 0.9], speed: 0.6 },
      { id: 'akahimeji', ja: 'アカヒメジ', sci: 'Mulloidichthys vanicolensis', note: '黄色い縦帯のヒメジ。昼は根のそばで群れてじっとしていて、夜になると散らばり、あごのひげで砂の中の小さな生き物を探す。',
        diel: 'night', diet: 'invert', pat: 5, c1: [0.9, 0.86, 0.8], c2: [0.98, 0.82, 0.12], bands: 3.4, shape: 'slender', size: [0.25, 0.35], habitat: 'reef', schools: 3, n: 22, spread: [3, 1, 3], alt: [0.4, 1.5], speed: 0.8 },
      { id: 'suji-ara', ja: 'スジアラ', sci: 'Plectropomus leopardus', note: '赤い体に青い小さな斑点が散るハタの仲間。サンゴの陰から待ち伏せて小魚を一瞬で吸い込む、リーフの主役級の捕食者。',
        diel: 'crep', diet: 'fish', pat: 15, c1: [0.82, 0.24, 0.16], c2: [0.9, 0.46, 0.36], c3: [0.35, 0.62, 0.95], shape: 'grouper', size: [0.5, 0.8], habitat: 'roam', count: 3, alt: [0.5, 2], speed: 0.9, big: true },
      { id: 'onikamasu', ja: 'オニカマス', sci: 'Sphyraena barracuda', note: '通称グレート・バラクーダ。銀色の細長い体で中層に静止し、獲物に気づくと矢のような速さで襲いかかる。背の黒い山形の模様と、尾の近くの黒い斑点が目印。',
        diel: 'crep', diet: 'fish', pat: 17, c1: [0.5, 0.55, 0.58], c2: [0.86, 0.88, 0.9], c3: [0.12, 0.14, 0.16], shape: 'barracuda', size: [1.0, 1.5], habitat: 'roam', count: 2, alt: [2, 6], speed: 1.3, big: true },
      { id: 'tatejima', ja: 'タテジマキンチャクダイ', sci: 'Pomacanthus imperator', note: '青地に黄色い線が走る大型のキンチャクダイ。目の上を黒い帯が隠す。幼魚は白い渦巻き模様で、成長するとまるで別の魚のように変わる。',
        diel: 'day', diet: 'invert', pat: 16, c1: [0.12, 0.22, 0.72], c2: [0.98, 0.84, 0.14], c3: [0.03, 0.04, 0.1], bands: 7, shape: 'angel', size: [0.25, 0.35], habitat: 'reef', schools: 4, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.5, 2], speed: 0.7 },
      { id: 'gomamongara', ja: 'ゴマモンガラ', sci: 'Balistoides viridescens', note: '大型のモンガラカワハギ。強い歯でサンゴやウニを噛み砕く。産卵期は巣のまわりのなわばりを守り、ダイバーにも向かってくる。',
        diel: 'day', diet: 'invert', pat: 10, c1: [0.62, 0.6, 0.38], c2: [0.18, 0.2, 0.16], shape: 'trigger', size: [0.5, 0.7], habitat: 'roam', count: 2, alt: [0.6, 2.5], speed: 0.7, big: true },
      { id: 'akashumoku', ja: 'アカシュモクザメ', sci: 'Sphyrna lewini', note: 'ハンマー形の頭の両端に目がある。頭で電気や匂いを広く捉え、砂に隠れた獲物も探し当てる。昼は数十〜数百匹の群れで回遊し、夜に散らばって狩りをする。沖縄では冬に群れが現れる。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.45, 0.45, 0.43], c2: [0.9, 0.9, 0.88], c3: [0.3, 0.3, 0.3], shape: 'hammer', size: [2.2, 3.0], habitat: 'roam', count: 2, alt: [5, 12], speed: 1.0, big: true, eye: 0.01 },
      { id: 'gingameaji', ja: 'ギンガメアジ', sci: 'Caranx sexfasciatus', note: '大きな目の銀色のアジ。昼は数百匹が渦を巻くように群れ（トルネード）、夜になると散らばって小魚を狩る。',
        diel: 'night', diet: 'fish', pat: 11, c1: [0.6, 0.64, 0.66], c2: [0.86, 0.88, 0.88], c3: [0.2, 0.22, 0.24], shape: 'jack', size: [0.5, 0.75], habitat: 'shoal', schools: 1, n: 110, alt: [4, 10], speed: 1.2, freq: [5, 7], eye: 1.4 },
    ],
    animals: { turtle: { style: 'green', count: 3 }, octopus: 1, manta: 1 },
    // humpbacks come down from their northern feeding grounds to breed around Okinawa's islands
    whales: { from: [12, 20], to: [4, 5] },
    extraGuide: [
      { id: 'tobiuo', ja: 'ツクシトビウオ', sci: 'Cypselurus heterurus doederleini', note: '春から夏、黒潮にのって沖縄の海にやってくる。追われると水面から飛び出し、大きな胸びれを広げて数十mも滑空する。尾びれの下の葉で水面を叩いて加速し直し、飛行をつなぐ。' },
      { id: 'turtle', ja: 'アオウミガメ', sci: 'Chelonia mydas', note: '宮古島は一年を通してウミガメに出会える島として知られる。' },
      { id: 'manta', ja: 'ナンヨウマンタ', sci: 'Mobula alfredi', note: '翼幅3〜5m。宮古・伊良部の周りでもときどき出会える。昼はリーフの上で小魚に体を掃除してもらい、夜はプランクトンを食べに浅場へ上がる。' },
      { id: 'whale', ja: 'ザトウクジラ', sci: 'Megaptera novaeangliae', note: '冬（12月下旬〜4月上旬）だけ、北の海から子育てにやってくる。体長13m、胸びれは体の1/3ほどもある。オスは長い「歌」をうたい、水中ではその声が遠くまで響く。' },
      { id: 'eel', ja: 'チンアナゴ', sci: 'Heteroconger hassi', note: '砂に巣穴を掘って体を出し、流れてくるプランクトンを食べる。近づくと引っ込む。' },
      { id: 'octopus', ja: 'ワモンダコ', sci: 'Octopus cyanea', note: '昼に活動するタコ。岩の上を歩いて甲殻類を探し、体の色や模様を一瞬で変える。驚くと体色を変えてジェット噴射で逃げる。' },
    ],
    benthic: [
      ['テーブル状ミドリイシ', 'Acropora hyacinthus など', '八重干瀬を代表する景観。大きいものは直径2mを超える。'],
      ['枝状ミドリイシ', 'Acropora spp.', 'デバスズメダイの隠れ家。'],
      ['ノウサンゴ', 'Platygyra sp.', '脳のような溝模様の塊状サンゴ。'],
      ['ウミキノコ', 'Sarcophyton sp.', 'キノコ形のソフトコーラル。'],
      ['ハタゴイソギンチャク', 'Stichodactyla gigantea', 'カクレクマノミの住みか。'],
      ['ヒメシャコガイ', 'Tridacna crocea', '岩に埋もれるように暮らす小型のシャコガイ。'],
      ['アオヒトデ', 'Linckia laevigata', '鮮やかな青いヒトデ。リーフの縁や瓦礫の上でよく見かける。'],
      ['クロナマコ', 'Holothuria atra', '砂をまぶした黒いナマコ。砂ごと食べて有機物を漉し取り、砂をきれいにする。'],
    ],
  },
  {
    id: 'maldives', swellHs: 0.8, name: 'モルディブ', site: '南アリ環礁のティラ', region: 'Maldives · South Ari Atoll',
    lat: 3.48, lon: 72.84, depth: '8–30 m', vis: 35, temp: 29.0, tempYear: [28, 30.2], seed: 37, tz: 5, tide: { amp: 0.5, lag: 0.1, axis: [-1, 0.2] },
    blurb: '環礁の中にそびえる海中の根「ティラ」。マンタのクリーニングステーションがあり、ジンベエザメが通年見られる海域。',
    water: { up: [0.30, 0.68, 0.95], hor: [0.02, 0.26, 0.58], down: [0.0, 0.07, 0.25], fog: 0.019, abs: [0.25, 0.055, 0.025] },
    sand: [0.76, 0.75, 0.70], rock: [0.48, 0.44, 0.40],
    f(x, z) {
      let h = -27 + (fbm(x * 0.01 + 1, z * 0.01 + 2, 3) - 0.5) * 5;
      const t = bommieField(x, z, 75, 0.6, 16, 20, 18, 30, 7, 0.4);
      const b = bommieField(x, z, 13, 0.28, 1.5, 3.5, 2.2, 4.8, 31, 0.45);
      h += Math.max(t[0], b[0]);
      h += (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 1.6 * (0.3 + t[1]);
      TERR.reef = Math.max(t[1], b[1] * 0.8);
      return Math.min(h, -3);
    },
    corals: { branch: 0.12, table: 0.18, brain: 0.22, fan: 0.2, mushroom: 0.22, clam: 0.02 },
    anemones: 30, clamSize: [0.3, 0.5], eels: 12,
    birds: [
      { id: 'gunkandori', ja: 'オオグンカンドリ', sci: 'Fregata minor', note: '細長い翼で上昇気流に乗り、何時間も羽ばたかずに舞う。羽が水をはじかないので海に降りられず、ほかの鳥の獲物を空中で奪う。', kind: 'frigate', count: 3, span: 2.2, c1: [0.06, 0.06, 0.07], c2: [0.9, 0.9, 0.9], c3: [0.5, 0.5, 0.55], speed: 9, glide: 0.95, alt: [25, 70], rest: 0 },
      { id: 'shiroajisashi', ja: 'シロアジサシ', sci: 'Gygis alba', note: '全身真っ白で目が大きい、妖精のようなアジサシ。巣を作らず木の枝のくぼみに直接卵を産む。', kind: 'tern', count: 5, span: 0.78, c1: [0.97, 0.97, 0.97], c2: [0.99, 0.99, 0.99], c3: [0.08, 0.08, 0.1], speed: 8, glide: 0.2, alt: [4, 15], rest: 0 },
    ],
    bait: {
      sp: { id: 'kibinago', ja: 'キビナゴ', sci: 'Spratelloides gracilis', note: '銀色の体に青く光る縦帯の小魚。環礁のまわりに大群で暮らし、モルディブの伝統的なカツオ一本釣りでは生き餌として撒かれる。',
        diel: 'day', diet: 'plankton', pat: 5, c1: [0.84, 0.87, 0.88], c2: [0.3, 0.52, 0.95], bands: 3.4, shape: 'slender', size: [0.09, 0.12], habitat: 'shoal', speed: 1.2, shine: 3.5 },
      predators: [{ id: 'isomaguro', n: 6 }, { id: 'rouninaji', n: 4 }, { id: 'blacktip', n: 2 }],
    },
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
        diel: 'always', diet: 'fish', pat: 8, c1: [0.50, 0.52, 0.52], c2: [0.92, 0.92, 0.90], c3: [0.02, 0.02, 0.02], shape: 'shark', size: [1.3, 1.7], habitat: 'roam', count: 3, alt: [1.5, 5], speed: 1.2, big: true, eye: 0.45 },
      { id: 'whaleshark', ja: 'ジンベエザメ', sci: 'Rhincodon typus', note: '世界最大の魚類。プランクトンを濾し取って食べる。南アリ環礁は通年観察できる海として有名。',
        diel: 'always', diet: 'filter', pat: 9, c1: [0.22, 0.30, 0.36], c2: [0.86, 0.88, 0.86], shape: 'whale', size: [6.5, 8], habitat: 'roam', count: 1, alt: [6, 11], speed: 0.9, big: true, wig: 0.6, freq: [1.4, 1.8] },
      { id: 'mitsuji', ja: 'ミスジリュウキュウスズメダイ', sci: 'Dascyllus aruanus', note: '白地に黒い帯が3本。枝サンゴの上に小さな群れで暮らし、危ないとすぐ枝の間に隠れる。群れにはなわばりの順位がある。',
        diel: 'day', diet: 'plankton', pat: 6, c1: [0.95, 0.95, 0.93], c2: [0.93, 0.93, 0.92], c3: [0.03, 0.03, 0.04], shape: 'disc', size: [0.06, 0.08], habitat: 'reef', schools: 7, n: 9, spread: [0.8, 0.4, 0.8], alt: [0.3, 0.9], speed: 0.6 },
      { id: 'tatejima', ja: 'タテジマキンチャクダイ', sci: 'Pomacanthus imperator', note: '青地に黄色い線が走る大型のキンチャクダイ。目の上を黒い帯が隠す。幼魚は白い渦巻き模様で、成長するとまるで別の魚のように変わる。',
        diel: 'day', diet: 'invert', pat: 16, c1: [0.12, 0.22, 0.72], c2: [0.98, 0.84, 0.14], c3: [0.03, 0.04, 0.1], bands: 7, shape: 'angel', size: [0.25, 0.35], habitat: 'reef', schools: 4, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.5, 2], speed: 0.7 },
      { id: 'gomamongara', ja: 'ゴマモンガラ', sci: 'Balistoides viridescens', note: '大型のモンガラカワハギ。強い歯でサンゴやウニを噛み砕く。産卵期は巣のまわりのなわばりを守り、ダイバーにも向かってくる。',
        diel: 'day', diet: 'invert', pat: 10, c1: [0.62, 0.6, 0.38], c2: [0.18, 0.2, 0.16], shape: 'trigger', size: [0.5, 0.7], habitat: 'roam', count: 2, alt: [0.6, 2.5], speed: 0.7, big: true },
      { id: 'rouninaji', ja: 'ロウニンアジ', sci: 'Caranx ignobilis', note: '通称GT（ジャイアント・トレバリー）。最大1.7mになるアジ科最大の魚。群れで小魚を追い込み、ときにはリーフの浅瀬で海鳥の雛まで襲う。',
        diel: 'crep', diet: 'fish', pat: 11, c1: [0.38, 0.4, 0.42], c2: [0.72, 0.74, 0.74], c3: [0.12, 0.13, 0.14], shape: 'jack', size: [0.9, 1.4], habitat: 'roam', count: 2, alt: [1.5, 6], speed: 1.4, big: true },
      { id: 'kosyoudai', ja: 'アジアコショウダイ', sci: 'Plectorhinchus vittatus', note: '白地に黒い縦縞、黄色いひれと分厚い唇。昼はテーブルサンゴの下で群れて休み、夜に砂地へ出て餌をあさる。',
        diel: 'night', diet: 'invert', pat: 18, c1: [0.95, 0.94, 0.9], c2: [0.06, 0.06, 0.07], c3: [0.98, 0.84, 0.16], bands: 13, shape: 'grouper', size: [0.4, 0.6], habitat: 'reef', schools: 3, n: 5, spread: [1.4, 0.6, 1.4], alt: [0.4, 1.5], speed: 0.6 },
      { id: 'tsubameuo', ja: 'ツバメウオ', sci: 'Platax teira', note: '円盤のように平たく背の高い体。好奇心が強く、群れでゆったりとダイバーに寄ってくる。目と胸びれを通る黒い帯が目印。',
        diel: 'day', diet: 'invert', pat: 6, c1: [0.82, 0.8, 0.72], c2: [0.74, 0.73, 0.68], c3: [0.14, 0.13, 0.12], bands: 2.1, shape: 'batfish', size: [0.4, 0.55], habitat: 'reef', schools: 2, n: 6, spread: [2.5, 1.2, 2.5], alt: [2, 5], speed: 0.6 },
      { id: 'isomaguro', ja: 'イソマグロ', sci: 'Gymnosarda unicolor', note: '犬のような鋭い歯を持つマグロの仲間。潮の当たるドロップオフやティラの縁を群れで回り、小魚の群れに突っ込む。',
        diel: 'crep', diet: 'fish', pat: 0, c1: [0.2, 0.26, 0.36], c2: [0.8, 0.82, 0.84], shape: 'tuna', size: [1.0, 1.5], habitat: 'roam', count: 3, alt: [3, 10], speed: 1.6, big: true },
      { id: 'nemuribuka', ja: 'ネムリブカ', sci: 'Triaenodon obesus', note: '和名は「眠るサメ」。泳がずに岩棚の下でじっと休める。昼は休み、夜になると岩の隙間に頭を突っ込んで魚を探す。第1背びれと尾びれの先が白い。',
        diel: 'night', diet: 'fish', pat: 14, c1: [0.42, 0.41, 0.39], c2: [0.86, 0.86, 0.84], c3: [0.96, 0.96, 0.94], shape: 'whitetip', size: [1.3, 1.6], habitat: 'roam', count: 2, alt: [0.8, 2.5], speed: 1.0, big: true, eye: 0.4 },
      { id: 'akashumoku', ja: 'アカシュモクザメ', sci: 'Sphyrna lewini', note: 'ハンマー形の頭の両端に目がある。頭で電気や匂いを広く捉え、砂に隠れた獲物も探し当てる。昼は数十〜数百匹の群れで回遊し、夜に散らばって狩りをする。沖縄では冬に群れが現れる。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.45, 0.45, 0.43], c2: [0.9, 0.9, 0.88], c3: [0.3, 0.3, 0.3], shape: 'hammer', size: [2.2, 3.0], habitat: 'roam', count: 5, alt: [5, 12], speed: 1.0, big: true, eye: 0.01 },
      { id: 'itachizame', ja: 'イタチザメ', sci: 'Galeocerdo cuvier', note: '通称タイガーシャーク。体の縞模様は若いほど濃い。ウミガメの甲羅も噛み砕く歯を持ち、魚、海鳥、ウミヘビまで何でも食べる海の掃除屋。全長4mを超える。',
        diel: 'always', diet: 'fish', pat: 21, c1: [0.4, 0.4, 0.37], c2: [0.88, 0.88, 0.86], c3: [0.18, 0.18, 0.17], shape: 'tiger', size: [3.0, 4.2], habitat: 'roam', count: 1, alt: [2, 8], speed: 0.8, big: true, eye: 0.4 },
      { id: 'gingameaji', ja: 'ギンガメアジ', sci: 'Caranx sexfasciatus', note: '大きな目の銀色のアジ。昼は数百匹が渦を巻くように群れ（トルネード）、夜になると散らばって小魚を狩る。',
        diel: 'night', diet: 'fish', pat: 11, c1: [0.6, 0.64, 0.66], c2: [0.86, 0.88, 0.88], c3: [0.2, 0.22, 0.24], shape: 'jack', size: [0.5, 0.75], habitat: 'shoal', schools: 1, n: 110, alt: [4, 10], speed: 1.2, freq: [5, 7], eye: 1.4 },
    ],
    animals: { turtle: { style: 'hawksbill', count: 2 }, manta: 2 },
    extraGuide: [
      { id: 'tobiuo', ja: 'トビウオの仲間', sci: 'Exocoetidae', note: '環礁の外の深い海の表層にすむ。カツオやシイラに追われると一斉に飛び出し、胸びれを広げて波の上を滑空する。モルディブの漁師には、カツオの群れを知らせる目印でもある。' },
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
  {
    // The middle of the North Pacific subtropical gyre: some 1,700 km from Hawaii, the nearest land, over
    // an abyssal plain nearly 5 km down. The clearest, emptiest blue water on Earth, under the Pacific High's
    // steady clear skies.
    id: 'pacific', swellHs: 2.2, name: '北太平洋', site: '北太平洋のまんなか', region: 'North Pacific · Subtropical Gyre',
    lat: 32.0, lon: -145.0, depth: '水深 4,800 m', vis: 60, temp: 22.5, tempYear: [17.5, 24.5], seed: 53, tz: -10, tide: { amp: 0.3, lag: 0.6, axis: [0.8, 0.6] },
    blurb: 'いちばん近い陸地まで1,700km。海底は5km下。地球でいちばん澄んで、いちばん何もない青の真ん中を、ただ漂う。',
    pelagic: true,
    water: { up: [0.2, 0.52, 0.98], hor: [0.0, 0.15, 0.5], down: [0.0, 0.02, 0.14], fog: 0.015, abs: [0.3, 0.06, 0.02] },
    sand: [0.5, 0.5, 0.5], rock: [0.4, 0.4, 0.4],
    f() { TERR.reef = 0; return -90; },
    corals: { branch: 0, table: 0, brain: 0, fan: 0, mushroom: 0, clam: 0 },
    anemones: 0, clamSize: [0.3, 0.4], eels: 0,
    birds: [
      { id: 'onaga', ja: 'オナガミズナギドリ', sci: 'Ardenna pacifica', note: '細長い翼で波の上すれすれを滑空する海鳥。マグロやカツオの群れについて回り、群れに追い上げられた小魚を浅く潜って捕る。漁師はこの鳥の群れを目印にナブラを探す。', kind: 'booby', count: 6, span: 1.0, c1: [0.3, 0.26, 0.23], c2: [0.8, 0.77, 0.73], c3: [0.3, 0.3, 0.32], speed: 11, glide: 0.8, alt: [1.5, 9], rest: 0.35 },
      { id: 'koahoudori', ja: 'コアホウドリ', sci: 'Phoebastria immutabilis', note: '翼を広げると2m。風と波の上昇気流を使う「ダイナミック・ソアリング」で、ほとんど羽ばたかずに大洋を何千kmも飛ぶ。ハワイ北西の島で繁殖し、北太平洋を回遊する。', kind: 'albatross', count: 2, span: 2.0, c1: [0.22, 0.2, 0.19], c2: [0.97, 0.97, 0.96], c3: [0.85, 0.72, 0.6], speed: 12, glide: 0.97, alt: [1, 12], rest: 0.35 },
      { id: 'kuroashi', ja: 'クロアシアホウドリ', sci: 'Phoebastria nigripes', note: '全身が黒っぽいアホウドリ。船や漂流物についてくる好奇心の強い鳥で、北太平洋の真ん中でも出会う。', kind: 'albatross', count: 1, span: 2.1, c1: [0.18, 0.16, 0.15], c2: [0.3, 0.27, 0.25], c3: [0.2, 0.18, 0.17], speed: 12, glide: 0.97, alt: [1, 10], rest: 0.35 },
    ],
    bait: {
      sp: { id: 'muroaji', ja: 'ムロアジの幼魚', sci: 'Decapterus spp.', note: '外洋の表層を群れで漂う小さなアジの仲間。マグロやカツオ、シイラの大事な餌で、群れが追い上げられると水面が沸き立つ「ナブラ」が起きる。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.22, 0.34, 0.5], c2: [0.84, 0.86, 0.9], shape: 'slender', size: [0.1, 0.14], habitat: 'shoal', speed: 1.3, shine: 3.5 },
      predators: [{ id: 'kihada', n: 12 }, { id: 'katsuo', n: 16 }, { id: 'shiira', n: 3 }, { id: 'yogore', n: 1 }],
    },
    species: [
      { id: 'tobiuo', ja: 'ハマトビウオ', sci: 'Cheilopogon pinnatibarbatus', note: '外洋の表層を群れで泳ぐ。シイラなどに追われると大きな胸びれを広げて水面を飛び出し、数百mも滑空して逃げる。',
        diel: 'day', diet: 'plankton', pat: 0, c1: [0.16, 0.26, 0.52], c2: [0.86, 0.89, 0.92], shape: 'slender', size: [0.26, 0.34], habitat: 'shoal', schools: 1, n: 40, alt: [85, 88], speed: 1.4, freq: [8, 11] },
      { id: 'katsuo', ja: 'カツオ', sci: 'Katsuwonus pelamis', note: '大洋を回遊する群れ。濃い青の背と、腹の黒い縦縞。止まると窒息するため一生泳ぎ続ける。',
        diel: 'day', diet: 'fish', pat: 13, c1: [0.24, 0.3, 0.46], c2: [0.08, 0.13, 0.34], c3: [0.86, 0.88, 0.9], shape: 'fusilier', size: [0.5, 0.7], habitat: 'shoal', schools: 1, n: 90, alt: [72, 86], speed: 1.8, freq: [5, 7] },
      { id: 'tsumuburi', ja: 'ツムブリ', sci: 'Elagatis bipinnulata', note: '流木や漂流物の下によく集まるアジの仲間。紺の背に水色と黄色の縦帯が走る。',
        diel: 'day', diet: 'fish', pat: 13, c1: [0.3, 0.55, 0.85], c2: [0.1, 0.2, 0.42], c3: [0.9, 0.9, 0.86], shape: 'fusilier', size: [0.6, 0.9], habitat: 'shoal', schools: 1, n: 12, alt: [80, 87], speed: 1.5, freq: [5, 7] },
      { id: 'shiira', ja: 'シイラ', sci: 'Coryphaena hippurus', note: '金と緑と青に輝く外洋の魚。流木などの漂流物につき、トビウオを追って水面を跳ねる。死ぬと色がみるみる褪せる。',
        diel: 'day', diet: 'fish', pat: 11, c1: [0.22, 0.6, 0.45], c2: [0.95, 0.84, 0.28], c3: [0.28, 0.52, 0.82], shape: 'jack', size: [0.8, 1.2], habitat: 'roam', count: 3, alt: [80, 87], speed: 1.6, big: true },
      { id: 'yoshikiri', ja: 'ヨシキリザメ', sci: 'Prionace glauca', note: '藍色の背をした細長いサメ。長い胸びれで大洋を何千kmも回遊する。夜は表層に上がってイカや魚を追う。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.16, 0.28, 0.62], c2: [0.9, 0.91, 0.93], c3: [0.16, 0.28, 0.62], shape: 'shark', size: [2.2, 2.8], habitat: 'roam', count: 1, alt: [66, 84], speed: 1.0, big: true, eye: 0.45 },
      { id: 'yogore', ja: 'ヨゴレ', sci: 'Carcharhinus longimanus', note: '外洋の表層に暮らすサメ。丸く大きな胸びれと背びれの先が白い。何もない海で出会う数少ない大型動物で、好奇心が強く近寄ってくる。',
        diel: 'always', diet: 'fish', pat: 19, c1: [0.36, 0.34, 0.3], c2: [0.9, 0.9, 0.88], c3: [0.97, 0.97, 0.95], shape: 'oceanic', size: [2.0, 2.6], habitat: 'roam', count: 1, alt: [70, 86], speed: 0.9, big: true, eye: 0.45 },
      { id: 'kihada', ja: 'キハダ', sci: 'Thunnus albacares', note: '黄色いひれと小離鰭（しょうりき）をもつマグロ。時速70kmを超える速さで大洋を回遊し、トビウオやイカの群れを追う。',
        diel: 'day', diet: 'fish', pat: 13, c1: [0.55, 0.58, 0.62], c2: [0.08, 0.12, 0.3], c3: [0.86, 0.87, 0.88], shape: 'tuna', size: [1.0, 1.5], habitat: 'shoal', schools: 1, n: 18, alt: [70, 84], speed: 2.2, freq: [4, 6] },
      { id: 'manbou', ja: 'マンボウ', sci: 'Mola mola', note: '世界最大級の硬骨魚。尾びれはなく、縦に長い背びれと尻びれを左右に振って泳ぐ。深く潜って冷えた体を、水面で横になって温めることもある。',
        diel: 'day', diet: 'invert', pat: 20, c1: [0.42, 0.46, 0.5], c2: [0.78, 0.8, 0.8], shape: 'mola', size: [1.5, 2.1], habitat: 'roam', count: 1, alt: [84, 88], speed: 0.4, big: true, wig: 0.05, eye: 1.4 },
      { id: 'kurokajiki', ja: 'クロカジキ', sci: 'Makaira nigricans', note: '槍のような吻を持つ大洋の狩人。全長4mを超え、時速80km近くで泳ぐともいわれる。吻を振って魚の群れを打ち、弱った獲物を捕らえる。興奮すると体に青い縞が浮かぶ。',
        diel: 'day', diet: 'fish', pat: 6, c1: [0.08, 0.14, 0.34], c2: [0.82, 0.85, 0.88], c3: [0.45, 0.65, 0.95], bands: 7, shape: 'marlin', size: [2.6, 3.6], habitat: 'roam', count: 1, alt: [74, 86], speed: 1.8, big: true, eye: 0.7 },
    ],
    animals: {},
    extraGuide: [],
    benthic: [
      ['マリンスノー', 'marine snow', '死んだプランクトンや糞が綿のように固まって、5km下の海底へ何週間もかけて降っていく。'],
      ['夜光虫・発光プランクトン', 'Dinoflagellata', '夜、動くものに触れると青く光る。'],
      ['カツオノエボシ', 'Physalia physalis', '青い浮き袋で水面に浮かび、風まかせに漂うクダクラゲの仲間。長い触手に強い毒がある。'],
      ['サルパ', 'Salpa spp.', '透明な樽形の動物プランクトン。鎖のようにつながって漂う。'],
    ],
  },
];

// Kayama-jima (嘉弥真島), a small uninhabited island north of Kohama in the Yaeyama islands: beach,
// forest and shallow coral lagoon from survey data (scripts/bake-kayama.py). The sea's life is the
// lagoon's share of the Yaeyama reef fish, the same species as Miyako's shallows.
{
  const miyako = LOCATIONS.find((l) => l.id === 'miyako')!;
  const pickSp = (ids: [string, Partial<Species>?][]) => ids.map(([id, o]) => ({ ...miyako.species.find((s) => s.id === id)!, ...(o || {}) }));
  const HALF = 300;
  const kayama: Sea = {
    id: 'kayama', swellHs: 0.35, name: '嘉弥真島', site: '島の南西の浜とラグーン', region: 'Japan · Okinawa · Yaeyama',
    lat: 24.36107, lon: 123.99674, depth: '0–8 m', vis: 25, temp: 28.6, tempYear: [22, 30], seed: 57, tz: 9, tide: { amp: 0.8, lag: 0.25, axis: [0.8, 0.6] },
    blurb: '小浜島の北に浮かぶ、周囲2kmほどの無人島。白い砂浜とモクマオウやアダンの森、浅いサンゴ礁のラグーン。地形・海岸線・植生は国土地理院の標高データと航空写真から再現。',
    water: { up: [0.34, 0.80, 0.92], hor: [0.05, 0.40, 0.58], down: [0.02, 0.17, 0.28], fog: 0.026, abs: [0.26, 0.055, 0.03] },
    sand: [0.84, 0.82, 0.75], rock: [0.55, 0.52, 0.45],
    land: { half: HALF, far: 760, roam: 720, center: [320, -270] },
    residents: true,
    f(x, z) {
      const L = landOf('kayama');
      if (!L) { TERR.reef = 0; return -3; }
      const h = L.h(x, z);
      TERR.reef = Math.min(1, L.reef(x, z) * 1.6);
      return h < 0 ? h + (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 0.35 * smooth(0, -1.2, h) : h;
    },
    // a loop round the lagoon, clear of the beach
    path(s) { return [-25 + 100 * Math.sin(s * 0.9) + 14 * Math.sin(s * 2.3 + 1), 45 + 80 * Math.sin(s * 0.6 + 0.8) + 14 * Math.cos(s * 1.7)]; },
    corals: { branch: 0.34, table: 0.16, brain: 0.3, fan: 0.0, mushroom: 0.14, clam: 0.06 },
    anemones: 26, clamSize: [0.2, 0.34], eels: 0,
    birds: [
      { id: 'erigure', ja: 'エリグロアジサシ', sci: 'Sterna sumatrana', note: '真っ白な体に黒い後頭部。夏に八重山の小島の岩場で子育てし、ラグーンの上を軽やかに飛んで小魚を捕る。', kind: 'tern', count: 12, span: 0.62, c1: [0.9, 0.92, 0.94], c2: [0.98, 0.98, 0.98], c3: [0.05, 0.05, 0.05], speed: 8, glide: 0.2, alt: [3, 12], rest: 0 },
      { id: 'beniajisashi', ja: 'ベニアジサシ', sci: 'Sterna dougallii', note: '淡い灰色の背に黒い頭、長い燕尾。夏に南の島の岩礁や砂浜で集団で子育てする。繁殖期には胸がうっすら桃色を帯びる。', kind: 'tern', count: 8, span: 0.76, c1: [0.8, 0.83, 0.86], c2: [0.99, 0.96, 0.96], c3: [0.04, 0.04, 0.04], speed: 8.5, glide: 0.2, alt: [3, 14], rest: 0 },
      { id: 'katsuodori', ja: 'カツオドリ', sci: 'Sula leucogaster', note: '焦げ茶の背と白い腹の海鳥。高いところから翼をたたんで海へ突っ込み、魚を捕る。', kind: 'booby', count: 3, span: 1.4, c1: [0.24, 0.18, 0.13], c2: [0.94, 0.93, 0.9], c3: [0.9, 0.82, 0.45], speed: 11, glide: 0.55, alt: [6, 30], rest: 0.4 },
    ],
    species: pickSp([
      ['ocellaris'], ['chromis', { schools: 10 }], ['mitsuji', { schools: 9 }], ['sergeant'], ['idol'], ['auriga'], ['nokogiri'], ['yarai'], ['hibudai'],
      ['akahimeji'], ['tatejima', { schools: 2 }], ['gomamongara', { count: 1 }], ['suji-ara', { count: 2, alt: [0.4, 1.4] }],
      ['blacktip', { count: 4, alt: [0.6, 1.6], note: '背びれと尾びれの先が黒い小型のサメ。八重山の浅いラグーンや波打ち際でよく見られ、若いツマグロは膝ほどの浅瀬も泳ぐ。夕暮れに狩りが活発になる。人には臆病。' }],
      ['onikamasu', { count: 1, alt: [1, 2.5] }],
    ]),
    animals: { turtle: { style: 'green', count: 2 }, octopus: 1 },
    extraGuide: [
      { id: 'turtle', ja: 'アオウミガメ', sci: 'Chelonia mydas', note: '八重山のラグーンでは、海草や藻を食べに浅場へ入ってくる。' },
      { id: 'octopus', ja: 'ワモンダコ', sci: 'Octopus cyanea', note: '昼に活動するタコ。岩の上を歩いて甲殻類を探し、体の色や模様を一瞬で変える。' },
    ],
    benthic: [
      ['枝状ミドリイシ', 'Acropora spp.', '浅いラグーンの主役。デバスズメダイの隠れ家。'],
      ['ハマサンゴ', 'Porites spp.', '塊状のサンゴ。浅瀬では頭が水面近くで平らになり、マイクロアトールをつくる。'],
      ['テーブル状ミドリイシ', 'Acropora hyacinthus など', 'ラグーンの縁に点在する。'],
      ['ハタゴイソギンチャク', 'Stichodactyla gigantea', 'カクレクマノミの住みか。'],
      ['ヒメシャコガイ', 'Tridacna crocea', '岩に埋もれるように暮らす小型のシャコガイ。'],
      ['クロナマコ', 'Holothuria atra', '砂をまぶした黒いナマコ。'],
    ],
    flora: [
      ['モクマオウ', 'Casuarina equisetifolia', '細い枝が針のように垂れる常緑樹。海岸の防風林として植えられ、島の森の高い木々をつくる。'],
      ['アダン', 'Pandanus odoratissimus', '幹から支柱のような根を下ろし、ノコギリ状の長い葉を螺旋に広げる。夏にパイナップルのような実をつける。'],
      ['クサトベラ', 'Scaevola taccada', '砂浜のすぐ上に茂る、つやのある大きな葉の低木。花は扇を半分にしたような形。'],
      ['モンパノキ', 'Heliotropium foertherianum', '銀白色の柔らかい毛に覆われた葉の海岸低木。砂浜の縁に丸く茂る。'],
      ['グンバイヒルガオ', 'Ipomoea pes-caprae', '砂浜を這うつる草。軍配の形の葉に、薄紫の花を咲かせる。'],
    ],
  };
  LOCATIONS.splice(LOCATIONS.indexOf(miyako) + 1, 0, kayama);
}

// Two seas of big water, far from the others in time: the Red Sea (Elphinstone Reef, off Marsa Alam), a
// long coral ridge rising out of deep blue; and the Galápagos (Wolf Island), dark volcanic boulders in
// cool green water where the currents meet and the hammerheads school. Fish they share with the other
// seas are the same species, taken from there.
{
  const all = LOCATIONS.flatMap((l) => [...l.species, ...(l.bait ? [l.bait.sp] : [])]);
  const any = (id: string, o?: Partial<Species>): Species => ({ ...all.find((s) => s.id === id)!, ...(o || {}) });
  const bird = (id: string, o?: Partial<BirdSpec>): BirdSpec => ({ ...LOCATIONS.flatMap((l) => l.birds || []).find((b) => b.id === id)!, ...(o || {}) });
  const redsea: Sea = {
    id: 'redsea', swellHs: 0.9, name: '紅海', site: 'エルフィンストーン・リーフ', region: 'Egypt · Marsa Alam',
    lat: 25.31, lon: 34.86, depth: '4–40 m', vis: 40, temp: 26.0, tempYear: [22.5, 29.5], seed: 71, tz: 2, tide: { amp: 0.3, lag: 0.3, axis: [0, 1] },
    blurb: '砂漠に囲まれた細長い海の、沖にひとすじ伸びるサンゴの尾根。両側は深い青へ切れ落ち、壁をソフトコーラルが覆う。',
    water: { up: [0.25, 0.6, 0.98], hor: [0.01, 0.2, 0.6], down: [0.0, 0.05, 0.28], fog: 0.016, abs: [0.26, 0.055, 0.022] },
    sand: [0.82, 0.8, 0.74], rock: [0.52, 0.47, 0.41],
    f(x, z) {
      // the ridge runs north–south, gently bending; to the north it steps down to a plateau
      const u = x - (fbm(z * 0.006 + 2, 0.5, 3) - 0.5) * 40;
      const north = smooth(40, 110, z);
      const halfW = 13 + (fbm(z * 0.012, 3.1, 2) - 0.5) * 10 + 18 * north;
      const top = -4.5 - 13 * north + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 3;
      const floor = -38 + 12 * north + (fbm(x * 0.01 + 5, z * 0.01, 3) - 0.5) * 6;
      const d = Math.abs(u) - halfW;
      // buttresses and gullies down the walls
      const rib = (Math.pow(Math.abs(Math.sin(z * 0.16 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 4)), 0.7) - 0.5) * 6;
      const wall = 1 - smooth(-2, 16 + rib, d);
      let h = floor + (top - floor) * wall;
      const b = bommieField(x, z, 22, 0.35, 1.5, 4, 2.5, 6, 73, 0.5);   // coral heads on the sand below
      h += b[0] * (1 - wall);
      h += (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 1.4;
      TERR.reef = Math.max(smooth(0.05, 0.4, wall) * 0.95, b[1] * 0.8);
      return Math.min(h, -3);
    },
    corals: { branch: 0.14, table: 0.12, brain: 0.2, fan: 0.22, mushroom: 0.3, clam: 0.02 },
    anemones: 20, clamSize: [0.25, 0.4], eels: 8,
    birds: [
      bird('katsuodori'),
      { id: 'hoojiroajisashi', ja: 'ホオジロアジサシ', sci: 'Sterna repressa', note: '灰色の体に黒い帽子、頬の白い筋が目立つアジサシ。紅海とアラビアの沿岸だけで繁殖し、夏の海の上を群れで飛び回って小魚に飛び込む。', kind: 'tern', count: 6, span: 0.8, c1: [0.5, 0.52, 0.55], c2: [0.72, 0.73, 0.75], c3: [0.08, 0.08, 0.09], speed: 9, glide: 0.25, alt: [3, 14], rest: 0 },
    ],
    bait: {
      sp: any('kibinago', { note: '銀色の体に青く光る縦帯の小魚。リーフの縁で大群をつくり、夕方にはアジやマグロの仲間に追い立てられる。' }),
      predators: [{ id: 'rouninaji', n: 5 }, { id: 'isomaguro', n: 5 }, { id: 'onikamasu', n: 2 }],
    },
    species: [
      { id: 'bicinctus', ja: 'レッドシーアネモネフィッシュ', sci: 'Amphiprion bicinctus', note: '紅海とアデン湾だけに暮らすクマノミ。オレンジから黄色の体に、黒く縁取られた白帯が2本。',
        diel: 'day', diet: 'plankton', pat: 1, c1: [0.95, 0.55, 0.12], c2: [0.97, 0.97, 0.95], c3: [0.06, 0.05, 0.05], bands: 2, edge: 1, shape: 'clown', size: [0.08, 0.12], habitat: 'anemone', speed: 0.5 },
      any('anthias', { note: 'オレンジ色の雲のような大群が、尾根の壁を覆う。紅海のサンゴ礁の代名詞。', schools: 12, n: 40 }),
      { id: 'semilarvatus', ja: 'ブルーチークバタフライフィッシュ', sci: 'Chaetodon semilarvatus', note: '鮮やかな黄色の体に、目のまわりの青いほほ。紅海の固有種で、昼はテーブルサンゴの下でつがいや小群になって浮かんでいる。',
        diel: 'day', diet: 'invert', pat: 0, c1: [0.98, 0.78, 0.12], c2: [0.99, 0.86, 0.3], shape: 'disc', size: [0.18, 0.23], habitat: 'reef', schools: 6, n: 2, spread: [0.8, 0.3, 0.8], alt: [0.6, 2], speed: 0.7 },
      { id: 'sohal', ja: 'ソハールサージョンフィッシュ', sci: 'Acanthurus sohal', note: '青白い体に細い縦線が並ぶ紅海のニザダイ。尾の付け根のメスのようなとげはオレンジ色。浅い礁の縁になわばりを持ち、ほかの魚を追い払う。',
        diel: 'day', diet: 'algae', pat: 5, c1: [0.78, 0.82, 0.88], c2: [0.14, 0.18, 0.32], bands: 9, shape: 'oval', size: [0.3, 0.4], habitat: 'reef', schools: 5, n: 2, spread: [2, 0.6, 2], alt: [0.5, 1.5], speed: 1.1 },
      any('wrasse', { note: '通称ナポレオンフィッシュ。額のこぶが目印で、全長2mに達するベラ科最大種。紅海では人に慣れた大きな個体がダイバーのそばを悠々と泳ぐ。', count: 2 }),
      { id: 'minokasago', ja: 'ハナミノカサゴ', sci: 'Pterois miles', note: '羽のように広がるひれに毒のとげを持つ。昼は岩陰で休み、夕暮れからひれを広げて小魚やエビを隅に追い込んで吸い込む。',
        diel: 'crep', diet: 'invert', pat: 6, c1: [0.72, 0.3, 0.2], c2: [0.93, 0.86, 0.8], c3: [0.45, 0.14, 0.1], bands: 6, shape: 'grouper', size: [0.25, 0.35], habitat: 'reef', schools: 5, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.3, 1.2], speed: 0.4 },
      { id: 'hanadai', ja: 'レッドシーバナーフィッシュ', sci: 'Heniochus intermedius', note: '白と黒の帯に黄色いひれ、長く伸びた背びれ。紅海の固有種で、壁の前に小さな群れで浮かんでいる。',
        diel: 'day', diet: 'plankton', pat: 3, c1: [0.95, 0.93, 0.86], c2: [0.98, 0.84, 0.2], c3: [0.05, 0.05, 0.05], shape: 'idol', size: [0.16, 0.22], habitat: 'reef', schools: 5, n: 4, spread: [1.4, 0.6, 1.4], alt: [1, 3], speed: 0.8 },
      any('tatejima', { schools: 3 }),
      { id: 'kanmuri', ja: 'カンムリブダイ', sci: 'Bolbometopon muricatum', note: '額が大きくこぶのように張り出した、最大級のブダイ。朝、群れで礁の上に現れ、頭をぶつけるようにしてサンゴをかじり取る。',
        diel: 'day', diet: 'algae', pat: 0, c1: [0.3, 0.42, 0.36], c2: [0.55, 0.62, 0.52], shape: 'parrot', size: [0.9, 1.2], habitat: 'roam', count: 4, alt: [0.8, 3], speed: 0.8, big: true, cocoon: true },
      any('gomamongara', { count: 2 }),
      any('akashumoku', { note: 'ハンマー形の頭の両端に目がある。夏、エルフィンストーンの北の台地の沖に群れが現れ、深い青の中をゆっくり横切っていく。', count: 4, alt: [10, 20] }),
      any('yogore', { note: '丸く大きな胸びれと背びれの先が白い外洋のサメ。秋から冬にかけて尾根に現れ、好奇心が強く、ダイバーの近くまで寄ってくる。', alt: [3, 12] }),
      any('onikamasu'),
      any('gingameaji', { note: '大きな目の銀色のアジ。尾根の南の端で数百匹が渦を巻き、夜になると散らばって小魚を狩る。' }),
      any('rouninaji'),
      any('isomaguro'),
      any('nemuribuka', { count: 1, rests: undefined }),
    ],
    animals: { turtle: { style: 'hawksbill', count: 2 }, octopus: 2 },
    extraGuide: [
      { id: 'tobiuo', ja: 'トビウオの仲間', sci: 'Exocoetidae', note: '紅海の沖合の表層にすむ。リーフの外をゆく船の舳先から、銀色の群れがつぎつぎと飛び出して滑空する。' },
      { id: 'turtle', ja: 'タイマイ', sci: 'Eretmochelys imbricata', note: '鷹のくちばしのような口でカイメンを食べる。紅海のサンゴ礁は大事な餌場。' },
      { id: 'eel', ja: 'レッドシーガーデンイール', sci: 'Gorgasia sillneri', note: '砂から体を伸ばして流れてくるプランクトンを食べる、紅海のアナゴの仲間。近づくと引っ込む。' },
    ],
    benthic: [
      ['ソフトコーラル（トゲトサカ）', 'Dendronephthya spp.', '赤・紫・橙。流れが当たると膨らみ、壁を花畑のように覆う。'],
      ['ウミウチワ（ヤギ類）', 'Gorgonacea', '尾根の壁で流れに向かって扇を広げる。'],
      ['アミメミドリイシ', 'Acropora spp.', '浅い尾根の頂上に広がる。紅海のサンゴは高い水温に強いことで知られる。'],
      ['ハマサンゴ（塊状）', 'Porites sp.', 'ゆっくり育つ岩のようなサンゴ。'],
      ['センジュイソギンチャク', 'Heteractis magnifica', 'レッドシーアネモネフィッシュの住みか。'],
    ],
  };
  const galapagos: Sea = {
    id: 'galapagos', swellHs: 1.4, name: 'ガラパゴス', site: 'ウルフ島の東', region: 'Ecuador · Galápagos · Wolf Island',
    lat: 1.382, lon: -91.806, depth: '8–35 m', vis: 18, temp: 23.5, tempYear: [21, 27], seed: 89, tz: -6, tide: { amp: 1.0, lag: 0.7, axis: [1, 0.3] },
    blurb: '赤道の下、冷たい湧昇流と暖かい海流がぶつかる火山の島。黒い溶岩の岩が転がる斜面の上を、シュモクザメの群れが流れていく。',
    water: { up: [0.4, 0.72, 0.78], hor: [0.08, 0.36, 0.44], down: [0.03, 0.14, 0.2], fog: 0.027, abs: [0.26, 0.06, 0.055] },
    sand: [0.52, 0.5, 0.46], rock: [0.34, 0.32, 0.3],
    f(x, z) {
      // the island's flank falls away to the north; lava boulders, big and small, all over it
      const s = smooth(-130, 130, z + (fbm(x * 0.01, 1.3, 3) - 0.5) * 70);
      let h = -8 - 26 * s;
      const b = bommieField(x, z, 12, 0.6, 1.2, 3.5, 1.8, 4.5, 91, 0.7);
      const b2 = bommieField(x, z, 38, 0.45, 3, 8, 5, 11, 93, 0.6);
      h += Math.max(b[0], b2[0]) * (1 - 0.4 * s);
      h += (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 1.8;
      TERR.reef = Math.max(b[1], b2[1]) * 0.42;
      return Math.min(h, -4);
    },
    corals: { branch: 0.04, table: 0, brain: 0.12, fan: 0.4, mushroom: 0.4, clam: 0 },
    anemones: 0, clamSize: [0.2, 0.3], eels: 6,
    birds: [
      { id: 'aoashi', ja: 'アオアシカツオドリ', sci: 'Sula nebouxii', note: '空色の足をもつカツオドリ。群れで高く舞い、いっせいに翼をたたんで海へ突き刺さるように飛び込む。求愛では青い足を交互に持ち上げて見せる。', kind: 'booby', count: 8, span: 1.5, c1: [0.4, 0.33, 0.27], c2: [0.95, 0.94, 0.92], c3: [0.4, 0.55, 0.62], speed: 11, glide: 0.5, alt: [5, 30], rest: 0.4 },
      bird('gunkandori', { note: '細長い翼で上昇気流に乗り、何時間も羽ばたかずに舞う。ガラパゴスではオスが赤いのど袋をふくらませて求愛する。羽が水をはじかないので海に降りられず、ほかの鳥の獲物を空中で奪う。' }),
    ],
    bait: {
      sp: { id: 'salema', ja: 'ブラックストライプサレマ', sci: 'Xenocys jessiae', note: '銀色の体に黒い縦縞が走る、ガラパゴスの固有種。何千匹もの群れで岩のまわりを漂い、サメやアジ、アシカに追われて球のように固まる。',
        diel: 'day', diet: 'plankton', pat: 5, c1: [0.82, 0.84, 0.84], c2: [0.12, 0.13, 0.15], bands: 3, shape: 'slender', size: [0.14, 0.2], habitat: 'shoal', speed: 1.2, shine: 3 },
      predators: [{ id: 'galapagoszame', n: 3 }, { id: 'gingameaji', n: 8 }, { id: 'kihada', n: 5 }],
    },
    species: [
      any('akashumoku', { note: 'ハンマー形の頭の両端に目がある。ウルフ島では昼、数十〜数百匹が群れて潮の中に並び、夜になると散らばって沖へ狩りに出る。群れの中ではクリーナーフィッシュに体を掃除してもらう。',
        diel: 'day', habitat: 'shoal', schools: 1, n: 26, count: undefined, alt: [8, 16], speed: 0.9, freq: [1.8, 2.4] }),
      { id: 'galapagoszame', ja: 'ガラパゴスザメ', sci: 'Carcharhinus galapagensis', note: '大洋の島のまわりに暮らすメジロザメの仲間。最初に見つかったのがガラパゴス。浅い岩場を群れで回り、好奇心が強い。',
        diel: 'always', diet: 'fish', pat: 8, c1: [0.4, 0.4, 0.39], c2: [0.9, 0.9, 0.88], c3: [0.32, 0.32, 0.31], shape: 'shark', size: [2.0, 2.8], habitat: 'roam', count: 3, alt: [3, 10], speed: 1.0, big: true, eye: 0.45 },
      any('whaleshark', { note: '世界最大の魚類。ウルフ島とダーウィン島には、夏から冬にかけて大きなメスが立ち寄る。どこで出産するのかは、まだ誰も知らない。', alt: [7, 13] }),
      any('gingameaji', { note: '大きな目の銀色のアジ。岩場の上で銀の壁のような群れをつくり、夜になると散らばって小魚を狩る。' }),
      any('kihada', { note: '黄色いひれのマグロ。冷たい湧昇流が運ぶ餌を追って、島のまわりを群れで回る。', n: 10, alt: [6, 16] }),
      { id: 'kiobi', ja: 'イエローテールサージョンフィッシュ', sci: 'Prionurus laticlavius', note: '灰色の体に黄色い尾。何百匹もの群れで岩の上を移動しながら、藻をいっせいに食べていく。',
        diel: 'day', diet: 'algae', pat: 2, c1: [0.3, 0.32, 0.35], c2: [0.98, 0.82, 0.14], c3: [0.12, 0.13, 0.15], shape: 'oval', size: [0.3, 0.45], habitat: 'reef', schools: 5, n: 28, spread: [4, 1.2, 4], alt: [0.6, 2.5], speed: 0.9 },
      { id: 'kingangel', ja: 'キングエンゼルフィッシュ', sci: 'Holacanthus passer', note: '濃い紺の体に白い帯が1本、黄色い尾びれ。岩場のあちこちで、群れからはぐれた魚やシュモクザメの体をつついて掃除する。',
        diel: 'day', diet: 'invert', pat: 6, c1: [0.12, 0.14, 0.3], c2: [0.14, 0.16, 0.32], c3: [0.95, 0.95, 0.93], bands: 1.1, shape: 'angel', size: [0.25, 0.35], habitat: 'reef', schools: 6, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.5, 2], speed: 0.7 },
      { id: 'creole', ja: 'パシフィッククレオールフィッシュ', sci: 'Paranthias colonus', note: 'オレンジと赤褐色のハタの仲間。群れで岩の上の中層に浮かび、流れてくるプランクトンを食べる。',
        diel: 'day', diet: 'plankton', pat: 13, c1: [0.8, 0.36, 0.2], c2: [0.62, 0.24, 0.16], c3: [0.95, 0.9, 0.85], shape: 'slender', size: [0.22, 0.3], habitat: 'reef', schools: 6, n: 22, spread: [3, 1.4, 3], alt: [1.5, 4], speed: 0.8 },
      { id: 'barberfish', ja: 'バーバーフィッシュ', sci: 'Johnrandallia nigrirostris', note: '黄色い体に黒い口元のチョウチョウウオ。群れでステーションに陣取り、立ち寄ったシュモクザメの寄生虫をついばむ「床屋さん」。',
        diel: 'day', diet: 'invert', pat: 4, c1: [0.95, 0.88, 0.62], c2: [0.98, 0.8, 0.12], c3: [0.08, 0.07, 0.06], shape: 'disc', size: [0.14, 0.18], habitat: 'reef', schools: 5, n: 6, spread: [1, 0.5, 1], alt: [0.8, 2.5], speed: 0.8 },
      any('idol'),
      any('manbou', { note: '世界最大級の硬骨魚。冷たい湧昇流のある海で深く潜ったあと、岩場のクリーニングステーションに浮かび上がって体を掃除してもらう。', alt: [10, 16] }),
    ],
    animals: { turtle: { style: 'green', count: 3 }, manta: 1, octopus: 1 },
    extraGuide: [
      { id: 'tobiuo', ja: 'トビウオの仲間', sci: 'Exocoetidae', note: '赤道の湧昇で豊かなガラパゴスの沖に多い。アシカやカツオに追われて水面を飛び、カツオドリやグンカンドリに空から狙われる。' },
      { id: 'manta', ja: 'オニイトマキエイ', sci: 'Mobula birostris', note: '翼幅は最大7m、世界最大のエイ。冷たい湧昇流が運ぶプランクトンを求めて、島のまわりに現れる。' },
      { id: 'turtle', ja: 'アオウミガメ（ガラパゴスの個体群）', sci: 'Chelonia mydas', note: '甲羅が黒っぽく、ほかの海のアオウミガメより小柄。岩についた藻を食べ、島の浜で産卵する。' },
      { id: 'eel', ja: 'ガラパゴスガーデンイール', sci: 'Heteroconger klausewitzi', note: '岩の間の砂地に巣穴を並べ、流れに向かって体を伸ばす。' },
    ],
    benthic: [
      ['玄武岩の岩塊', 'basalt', '火山から転がり落ちた黒い溶岩の岩。すき間は魚の隠れ家になる。'],
      ['ヤギ類・ウミトサカ', 'Gorgonacea / Alcyonacea', '冷たい流れの当たる岩に、黄色やオレンジの枝を伸ばす。'],
      ['クロサンゴ', 'Antipatharia', '深いところで黒い骨格の枝を広げる。生きている部分は緑や黄色。'],
      ['フジツボ', 'Megabalanus spp.', '湧昇流が運ぶ豊かなプランクトンを、脚で掻き寄せて食べる。'],
    ],
  };
  const rsp = (id: string, o?: Partial<Species>): Species => ({ ...redsea.species.find((x) => x.id === id)!, ...(o || {}) });   // (the Red Sea's own fish)
  const carnatic: Sea = {
    id: 'carnatic', swellHs: 0.8, name: '紅海北部', site: 'アブ・ヌハス礁のカルナティック号', region: 'Egypt · Gulf of Suez · Abu Nuhas',
    lat: 27.5817, lon: 33.931, depth: '2–28 m', vis: 30, temp: 24.0, tempYear: [21.5, 28], seed: 97, tz: 2, tide: { amp: 0.4, lag: 0.35, axis: [1, 0.2] },
    blurb: '1869年、インドへ向かう途中にこの礁で沈んだ帆走汽船カルナティック号が、砂の斜面に横たわる。木の甲板は朽ちて鉄の肋骨だけが残り、その間を光の筋とグラスフィッシュの群れが流れる。',
    water: { up: [0.27, 0.62, 0.95], hor: [0.02, 0.22, 0.52], down: [0.0, 0.06, 0.24], fog: 0.02, abs: [0.26, 0.055, 0.025] },
    sand: [0.86, 0.83, 0.76], rock: [0.52, 0.47, 0.41],
    f(x, z) {
      // the reef to the south: a shallow top, a wall down to the sand; from its foot a sand slope runs
      // north into the deep, with coral heads scattered over it
      const edge = -48 + (fbm(x * 0.012, 4.2, 3) - 0.5) * 26;
      const reefTop = -2.2 + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 2.2;
      const sand = -15 - Math.max(0, z - edge) * 0.12 - Math.max(0, z - 60) * 0.1 + (fbm(x * 0.02 + 3, z * 0.02, 3) - 0.5) * 2.5;
      const wall = 1 - smooth(-6, 6, z - edge + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 6);
      let h = sand + (reefTop - sand) * wall;
      const b = bommieField(x, z, 20, 0.25, 1.2, 3.5, 2, 5, 31, 0.45);
      h += b[0] * (1 - wall) * smooth(edge + 12, edge + 24, z);
      h += (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 0.9;
      TERR.reef = Math.max(smooth(0.1, 0.5, wall) * 0.95, b[1] * 0.85 * smooth(edge + 12, edge + 24, z));
      return Math.min(h, -1.6);
    },
    // she lies along the foot of the reef, on her port side, bow to the east
    wreck: { x: 5, z: 2, rot: 0.08, len: 90, beam: 11.6, depth: 7.6 },
    corals: { branch: 0.16, table: 0.14, brain: 0.18, fan: 0.18, mushroom: 0.34, clam: 0.02 },
    anemones: 14, clamSize: [0.25, 0.4], eels: 6,
    birds: [bird('katsuodori'), redsea.birds!.find((b) => b.id === 'hoojiroajisashi')!],
    species: [
      any('anthias', { note: 'オレンジ色のハナダイの群れ。船体の上の明るい水の中で、流れてくるプランクトンをついばむ。', schools: 8, n: 30, wreck: true }),
      rsp('bicinctus'),
      rsp('semilarvatus'),
      rsp('hanadai', { wreck: true }),
      rsp('minokasago', { note: '羽のようなひれに毒のとげ。昼は船体の陰や肋骨の間で休み、夕暮れから小魚を隅に追い込む。', wreck: true }),
      rsp('sohal'),
      any('wrasse', { note: '通称ナポレオンフィッシュ。額のこぶが目印の最大級のベラ。沈船のまわりを悠々と見回る大きな個体が知られている。', count: 1 }),
      any('gomamongara', { count: 1 }),
      any('tatejima', { schools: 2 }),
      any('rouninaji'),
      any('onikamasu', { note: '銀色の大きなカマス。沈船の上の中層に、じっと浮かんで獲物を待つ。', wreck: true }),
      any('gingameaji', { note: '大きな目の銀色のアジ。礁の沖で群れになり、夜は散らばって小魚を狩る。' }),
    ],
    animals: { turtle: { style: 'hawksbill', count: 1 }, octopus: 1 },
    extraGuide: [
      { id: 'turtle', ja: 'タイマイ', sci: 'Eretmochelys imbricata', note: '鷹のくちばしのような口でカイメンを食べる。沈船を覆う海綿をかじりに来ることも。' },
      { id: 'eel', ja: 'レッドシーガーデンイール', sci: 'Gorgasia sillneri', note: '沈船の先の砂地から体を伸ばして、流れてくるプランクトンを食べる。近づくと引っ込む。' },
      { id: 'tobiuo', ja: 'トビウオの仲間', sci: 'Exocoetidae', note: 'スエズ湾の入り口の沖を、船の舳先から逃げるように飛ぶ。' },
    ],
    benthic: [
      ['カルナティック号', 'SS Carnatic (1862–1869)', 'P&O社の帆走汽船。全長約90m。1869年9月、スエズからボンベイへ金貨と郵便を運ぶ途中、夜にこの礁に乗り上げ、翌日二つに折れて沈んだ。31人が亡くなったとされる。いまは左舷を下に横たわり、鉄の肋骨と船体を海の生きものが覆っている。'],
      ['ソフトコーラル（トゲトサカ）', 'Dendronephthya spp.', '赤・紫・ピンク。船体の上を向いた面や、流れの当たる肋骨に房のように育つ。'],
      ['海綿', 'Porifera', 'オレンジや黄色の海綿が、錆びた鉄板の上を覆っている。'],
      ['ミドリイシ（テーブル）', 'Acropora spp.', '南の礁の上に広がるテーブル状のサンゴ。'],
      ['センジュイソギンチャク', 'Heteractis magnifica', 'レッドシーアネモネフィッシュの住みか。'],
    ],
  };
  LOCATIONS.push(redsea, carnatic, galapagos);
}

// Morays in the reef walls, sea snakes, jellyfish — as they really occur in each sea (none of the Red
// Sea's reefs has sea snakes; the open Pacific has nothing to hide in, only drifting jellies); and more of
// the big, characterful reef fish where they live.
{
  const giant: CritterSpec = { id: 'dokuutsubo', ja: 'ドクウツボ', sci: 'Gymnothorax javanicus', note: '世界最大級のウツボで、全長2.5mを超える。昼は岩穴から頭を出し、口を開け閉めしている（えらに水を送る呼吸で、威嚇ではない）。夜になると穴を出て、魚やタコを探して礁を這い回る。',
    kind: 'moray', n: 7, size: [1.4, 2.4], pat: 0, c1: [0.52, 0.46, 0.22], c2: [0.12, 0.1, 0.05], c3: [0.45, 0.4, 0.22] };
  const white: CritterSpec = { id: 'hanabirautsubo', ja: 'ハナビラウツボ', sci: 'Gymnothorax meleagris', note: '茶色の体に白い小さな斑点がびっしり。口の中が真っ白なのが名前の由来（英名 White-mouth moray）。浅いサンゴ礁の穴にすむ。',
    kind: 'moray', n: 5, size: [0.6, 1.0], pat: 1, c1: [0.32, 0.2, 0.1], c2: [0.92, 0.9, 0.84], c3: [0.3, 0.2, 0.12] };
  const zebra: CritterSpec = { id: 'zebrautsubo', ja: 'ゼブラウツボ', sci: 'Gymnomuraena zebra', note: 'こげ茶の体に細い白い輪が何十本も並ぶ。歯が臼のように平たく、カニや貝を噛み砕いて食べる、おとなしいウツボ。',
    kind: 'moray', n: 3, size: [0.8, 1.4], pat: 2, c1: [0.9, 0.88, 0.82], c2: [0.14, 0.1, 0.07], c3: [0.3, 0.25, 0.2] };
  const dovii: CritterSpec = { id: 'finespotmoray', ja: 'ファインスポッテッド・モレイ', sci: 'Gymnothorax dovii', note: '灰褐色の体に白い細かな点が散らばる、東太平洋の大型ウツボ。ガラパゴスの溶岩の岩のすき間から、何匹もが顔を出している。',
    kind: 'moray', n: 8, size: [1.0, 1.6], pat: 3, c1: [0.3, 0.28, 0.25], c2: [0.86, 0.86, 0.82], c3: [0.3, 0.28, 0.25] };
  const krait: CritterSpec = { id: 'aomadara', ja: 'アオマダラウミヘビ', sci: 'Laticauda colubrina', note: '青灰色と黒の縞模様、黄色い鼻先。強い毒を持つが、おとなしく人を襲うことはまずない。昼はサンゴの間を巡って穴にいる小魚やアナゴを探し、ときどき水面へ息継ぎに上がる。産卵や休息は陸でする。',
    kind: 'snake', n: 3, size: [1.0, 1.5], pat: 0, c1: [0.55, 0.62, 0.72], c2: [0.04, 0.04, 0.05], c3: [0.92, 0.82, 0.3] };
  const erabu: CritterSpec = { id: 'erabu', ja: 'エラブウミヘビ', sci: 'Laticauda semifasciata', note: '沖縄では「イラブー」と呼ばれる。青灰色に黒い帯。夜にサンゴ礁の穴をのぞいて魚を探す。陸に上がって岩のすき間で卵を産む。',
    kind: 'snake', n: 2, size: [1.1, 1.6], pat: 0, c1: [0.48, 0.55, 0.66], c2: [0.06, 0.06, 0.08], c3: [0.75, 0.72, 0.5] };
  const olive: CritterSpec = { id: 'olivesnake', ja: 'オリーブウミヘビ', sci: 'Aipysurus laevis', note: 'グレートバリアリーフでいちばんよく出会うウミヘビ。オリーブ色の太い体。好奇心が強く、ダイバーのそばまで来て体に巻きつくように調べることもある。',
    kind: 'snake', n: 4, size: [1.2, 1.8], pat: 1, c1: [0.42, 0.38, 0.2], c2: [0.62, 0.58, 0.42] };
  const moon: CritterSpec = { id: 'mizukurage', ja: 'ミズクラゲ', sci: 'Aurelia aurita', note: '透き通った傘に、四つ葉のクローバーのような生殖腺が透けて見える。泳ぐ力は弱く、傘を脈打たせて浮かびながら、ほとんど流れにまかせて漂う。',
    kind: 'jelly', n: 14, size: [0.12, 0.22], pat: 0, c1: [0.78, 0.85, 0.92], c2: [0.85, 0.62, 0.78], depth: [2, 12] };
  const pelagia: CritterSpec = { id: 'okikurage', ja: 'オキクラゲ', sci: 'Pelagia noctiluca', note: '外洋を漂う赤紫のクラゲ。傘にいぼがあり、長い触手と口腕を引く。刺されると痛い。夜、刺激を受けると淡く光る（学名は「夜に光る」の意味）。',
    kind: 'jelly', n: 16, size: [0.06, 0.1], pat: 1, c1: [0.75, 0.55, 0.7], c2: [0.85, 0.4, 0.65], depth: [3, 25] };
  const by: Record<string, CritterSpec[]> = {
    miyako: [giant, white, krait, erabu], kayama: [{ ...white, n: 4 }, { ...krait, n: 2 }, { ...erabu, n: 1 }],
    gbr: [giant, white, olive], maldives: [giant, { ...white, n: 4 }], redsea: [{ ...giant, n: 9 }, zebra, moon],
    galapagos: [dovii], pacific: [pelagia],
  };
  for (const L of LOCATIONS) if (by[L.id]) L.critters = by[L.id];
  // more of the big characters, where they really live
  const all = LOCATIONS.flatMap((l) => l.species);
  const add = (id: string, spId: string, o: Partial<Species> = {}) => { const L = LOCATIONS.find((l) => l.id === id)!; if (L.species.some((x) => x.id === spId)) return; L.species.push({ ...all.find((x) => x.id === spId)!, ...o }); };
  add('maldives', 'wrasse', { count: 2, note: '通称ナポレオンフィッシュ。額のこぶが目印で、全長2mに達するベラ科最大種。モルディブのティラでは大きな個体が悠々と泳ぎ、ダイバーに寄ってくることもある。' });
  add('maldives', 'kanmuri', { count: 3 });
  add('maldives', 'tamakai', { count: 1 });
  add('gbr', 'kanmuri', { count: 4, note: '額が大きくこぶのように張り出した、最大級のブダイ。アジンコート・リーフでは朝、数十匹の群れが礁の上に現れ、頭をぶつけるようにしてサンゴをかじり取っていく。' });
  add('miyako', 'wrasse', { count: 1, note: '通称ナポレオンフィッシュ。額のこぶが目印で、全長2mに達するベラ科最大種。沖縄では数が少なく、出会えたら幸運。' });
}

// More of the small reef fish that make a reef feel full, each only where it really lives: fusiliers,
// damsels, cardinalfish, soldierfish, goatfish, bannerfish, butterflyfish, triggerfish and sweepers in
// the Indo-Pacific seas; the Red Sea's own fusiliers and sweepers; the eastern Pacific's reef fish at
// the Galápagos.
{
  const all = LOCATIONS.flatMap((l) => l.species);
  const add = (id: string, sp: Species | string, o: Partial<Species> = {}) => {
    const L = LOCATIONS.find((l) => l.id === id)!, base = typeof sp === 'string' ? all.find((x) => x.id === sp)! : sp;
    if (L.species.some((x) => x.id === base.id)) return;
    L.species.push({ ...base, ...o });
  };
  const hatatate: Species = { id: 'hatatate', ja: 'ハタタテダイ', sci: 'Heniochus acuminatus', note: '白と黒の帯に黄色いひれ、背びれの一部が長い旗のように伸びる。つがいや小さな群れでリーフの上を漂う。ツノダシとよく似ているが、口が突き出ていない。',
    diel: 'day', diet: 'plankton', pat: 3, c1: [0.95, 0.94, 0.9], c2: [0.98, 0.86, 0.22], c3: [0.05, 0.05, 0.05], shape: 'idol', size: [0.16, 0.22], habitat: 'reef', schools: 4, n: 2, spread: [1, 0.5, 1], alt: [1, 2.5], speed: 0.8 };
  const murehatatate: Species = { ...hatatate, id: 'murehatatate', ja: 'ムレハタタテダイ', sci: 'Heniochus diphreutes', note: 'ハタタテダイに似るが、何十匹もの群れで根の上の中層に浮かび、流れてくるプランクトンを食べる。モルディブのティラの名物。',
    schools: 3, n: 26, spread: [3, 1.6, 3], alt: [3, 7] };
  const moongara: Species = { id: 'moongara', ja: 'モンガラカワハギ', sci: 'Balistoides conspicillum', note: '黒い体の下半分に大きな白い水玉、口のまわりは黄色。派手な模様で目立つが、なわばり意識が強く、ほかの魚を追い払う。',
    diel: 'day', diet: 'invert', pat: 22, c1: [0.06, 0.06, 0.08], c2: [0.95, 0.8, 0.15], c3: [0.95, 0.95, 0.9], shape: 'trigger', size: [0.3, 0.45], habitat: 'reef', schools: 3, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.5, 2], speed: 0.8 };
  const fueyakko: Species = { id: 'fueyakko', ja: 'フエヤッコダイ', sci: 'Forcipiger flavissimus', note: '鮮やかな黄色の体に、ピンセットのような細長い口。上半分が黒い頭。サンゴのすき間の奥から小さな生き物をつまみ出して食べる。',
    diel: 'day', diet: 'invert', pat: 23, c1: [0.99, 0.84, 0.1], c2: [0.98, 0.8, 0.08], c3: [0.05, 0.05, 0.06], shape: 'forceps', size: [0.14, 0.2], habitat: 'reef', schools: 4, n: 2, spread: [0.8, 0.3, 0.8], alt: [0.5, 1.8], speed: 0.8 };
  const oyabiccha: Species = { id: 'oyabiccha', ja: 'オヤビッチャ', sci: 'Abudefduf vaigiensis', note: '黄色みのある背と黒い横帯5本。浅いリーフの中層を群れで泳ぐ、いちばん身近なスズメダイのひとつ。産卵期のオスは岩に産みつけた卵を守る。',
    diel: 'day', diet: 'plankton', pat: 6, c1: [0.84, 0.9, 0.9], c2: [0.95, 0.86, 0.38], c3: [0.05, 0.05, 0.06], shape: 'oval', size: [0.13, 0.18], habitat: 'reef', schools: 5, n: 16, spread: [2.6, 1.3, 2.6], alt: [1.2, 3.5], speed: 1.0 };
  const hanatakasago: Species = { id: 'hanatakasago', ja: 'ハナタカサゴ', sci: 'Caesio lunaris', note: '全身が青く、尾びれの先が黒いタカサゴの仲間。昼は根のまわりの中層を大群で回り、流れてくるプランクトンを食べる。',
    diel: 'day', diet: 'plankton', pat: 13, c1: [0.2, 0.42, 0.9], c2: [0.3, 0.55, 0.95], c3: [0.8, 0.88, 0.96], shape: 'fusilier', size: [0.25, 0.35], habitat: 'shoal', schools: 2, n: 220, alt: [4, 10], speed: 1.1, freq: [7, 10] };
  const minamihatanpo: Species = { id: 'minamihatanpo', ja: 'ミナミハタンポ', sci: 'Parapriacanthus ransonneti', note: '体が半透明で金色に光る小魚。昼は岩のくぼみやオーバーハングの下に雲のような群れで集まり、夜になると散らばってプランクトンを食べる。',
    diel: 'night', diet: 'plankton', pat: 0, c1: [0.95, 0.75, 0.4], c2: [0.98, 0.88, 0.62], shape: 'slender', size: [0.06, 0.09], habitat: 'reef', schools: 5, n: 60, spread: [1.4, 0.7, 1.4], alt: [0.4, 1.2], speed: 0.6, shine: 2, eye: 1.6 };
  // eastern Pacific (Galápagos)
  const panamic: Species = { id: 'panamicsergeant', ja: 'パナミックサージェントメジャー', sci: 'Abudefduf troschelii', note: '黄色い背に黒い横帯5本の、東太平洋のスズメダイ。溶岩の岩の上の中層に大きな群れで浮かぶ。オスは岩に産みつけた紫色の卵を守る。',
    diel: 'day', diet: 'plankton', pat: 6, c1: [0.82, 0.88, 0.86], c2: [0.95, 0.85, 0.3], c3: [0.05, 0.05, 0.06], shape: 'oval', size: [0.14, 0.2], habitat: 'reef', schools: 6, n: 24, spread: [3, 1.4, 3], alt: [1, 3.5], speed: 1.0 };
  const bluegold: Species = { id: 'bluegoldsnapper', ja: 'ブルーアンドゴールド・スナッパー', sci: 'Lutjanus viridis', note: '黄色い体に、黒く縁取られた水色の縦線が5本。ガラパゴスの岩場に何十匹もの群れで漂い、夜に散らばって狩りをする。',
    diel: 'night', diet: 'fish', pat: 5, c1: [0.98, 0.8, 0.14], c2: [0.45, 0.72, 0.98], bands: 13, shape: 'slender', size: [0.25, 0.35], habitat: 'reef', schools: 3, n: 30, spread: [3, 1.2, 3], alt: [0.8, 2.5], speed: 0.8 };
  const scissortail: Species = { id: 'scissortail', ja: 'シザーテール・ダムゼルフィッシュ', sci: 'Chromis atrilobata', note: '灰褐色の小さなスズメダイ。背びれの付け根に白い点。岩の上の中層に何百匹も群れて、流れてくるプランクトンをついばむ。',
    diel: 'day', diet: 'plankton', pat: 0, c1: [0.42, 0.4, 0.38], c2: [0.62, 0.6, 0.56], shape: 'slender', size: [0.08, 0.12], habitat: 'reef', schools: 7, n: 40, spread: [2.4, 1.2, 2.4], alt: [1, 3], speed: 0.9 };
  const cortez: Species = { id: 'cortezwrasse', ja: 'コルテス・レインボーラス', sci: 'Thalassoma lucasanum', note: '黄色と赤の縦縞に青い頭の小さなベラ。せわしなく泳ぎ回り、群れで岩をつついて、ときにはほかの魚の体の掃除もする。',
    diel: 'day', diet: 'invert', pat: 5, c1: [0.96, 0.82, 0.2], c2: [0.85, 0.25, 0.2], bands: 10, shape: 'slender', size: [0.1, 0.15], habitat: 'reef', schools: 6, n: 12, spread: [2, 0.6, 2], alt: [0.3, 1.2], speed: 1.2 };
  const giantdamsel: Species = { id: 'giantdamsel', ja: 'ジャイアント・ダムゼルフィッシュ', sci: 'Microspathodon dorsalis', note: '青みがかった濃い灰色の大きなスズメダイ。岩の上の藻の畑を一匹ずつなわばりにして守り、ウミイグアナにさえ向かっていく。',
    diel: 'day', diet: 'algae', pat: 0, c1: [0.16, 0.2, 0.28], c2: [0.22, 0.26, 0.34], shape: 'oval', size: [0.2, 0.3], habitat: 'reef', schools: 6, n: 1, spread: [0.5, 0.3, 0.5], alt: [0.3, 1], speed: 0.7 };

  // Great Barrier Reef
  for (const id of ['umeiro', 'sergeant', 'akamatsukasa', 'yarai', 'akahimeji', 'anthias']) add('gbr', id);
  add('gbr', hatatate); add('gbr', moongara); add('gbr', fueyakko);
  // Maldives
  for (const id of ['akamatsukasa', 'yarai', 'akahimeji', 'nokogiri', 'auriga', 'chromis']) add('maldives', id);
  add('maldives', murehatatate); add('maldives', hanatakasago); add('maldives', oyabiccha); add('maldives', moongara); add('maldives', fueyakko);
  // Red Sea
  for (const id of ['chromis', 'mitsuji', 'akamatsukasa', 'kasmira', 'yarai']) add('redsea', id);
  add('redsea', hanatakasago); add('redsea', oyabiccha); add('redsea', minamihatanpo); add('redsea', fueyakko);
  // the Carnatic: glassfish in their thousands in her shadows
  add('carnatic', minamihatanpo, { ja: 'グラスフィッシュ（ミナミハタンポ）', note: '半透明の金色の小魚。カルナティック号の船内の暗がりに何千匹もの雲のような群れで集まり、肋骨の間から差し込む光の中で一斉に向きを変える。', wreck: true, schools: 6, n: 60 });
  for (const id of ['chromis', 'kasmira', 'akamatsukasa']) add('carnatic', id);
  add('carnatic', fueyakko);
  // Galápagos
  for (const sp of [panamic, bluegold, scissortail, cortez, giantdamsel]) add('galapagos', sp);
  // Miyako and Kayama (Okinawa)
  add('miyako', fueyakko); add('miyako', moongara); add('miyako', hatatate); add('miyako', 'anthias', { schools: 4 });
  add('kayama', oyabiccha); add('kayama', 'akamatsukasa', { schools: 3 }); add('kayama', hatatate, { schools: 2 });
}

// Reef rugosity: living reef framework is rough at the metre scale — knobs, ledges and holes — while
// sand stays smooth. Layered on every sea wherever there is reef.
function rugosity(x: number, z: number) {
  let s = 0, a = 0.5, f = 0.33;
  for (let i = 0; i < 3; i++) { s += a * (1 - Math.abs(vnoise(x * f + 17.3 * i, z * f - 9.1 * i) * 2 - 1)); f *= 2.13; a *= 0.5; }
  return s / 0.875;
}
for (const L of LOCATIONS) {
  if (L.habitat === 'kelp') continue;
  const base = L.f;
  // under a cave massif the seabed is plain sand: no reef, no seagrass
  const foot = L.cave ? caveFootprint(L.cave) : () => 0;
  L.f = (x: number, z: number) => {
    const h = base(x, z), r = TERR.reef;
    const out = L.land ? (h < -0.4 ? Math.min(h + (rugosity(x, z) - 0.55) * 0.9 * smooth(0.15, 0.8, r), -0.35) : h)   // (reef heads reach up to just under the surface)
      : Math.min(h + (rugosity(x, z) - 0.55) * 1.4 * smooth(0.15, 0.8, r), -2.4);
    TERR.reef = r * (1 - foot(x, z));
    return out;
  };
  const g = L.grass;
  if (g && L.cave) L.grass = (x: number, z: number) => g(x, z) * (1 - smooth(0.02, 0.2, foot(x, z)));
}
