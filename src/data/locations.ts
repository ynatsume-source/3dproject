// The seas you can dive into. Terrain functions return height (m, surface = 0) and set TERR.reef (0..1 coral cover).
import { fbm, smooth, clamp, bommieField, vnoise, TERR } from '../core/math';
import { caveFootprint, type CaveSpec } from '../ocean/cave';
import type { WhaleSeason } from '../eco/whale';

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
  cocoon?: boolean;                              // sleeps in a mucus cocoon (parrotfish)
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
  swellHs?: number;                        // typical significant wave height (m) when there is no live sea state
  birds?: BirdSpec[];
  pelagic?: boolean;                       // open ocean: no bottom in sight; f() is only a placement floor far below
  cave?: CaveSpec;                         // a limestone massif with a tunnel and skylights, on flat sand
  whales?: WhaleSeason;                    // humpbacks visit in these months
  tempYear?: [number, number];             // sea surface temperature, coolest and warmest month (°C)
  corals: Record<string, number>;
  anemones: number; clamSize: [number, number]; eels: number;
  species: Species[];
  animals: { turtle?: { style: string; count: number }; manta?: number; octopus?: number };
  extraGuide: GuideEntry[];
  benthic: [string, string, string][];
}

export const LOCATIONS: Sea[] = [
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
      ['アオヒトデ', 'Linckia laevigata', '鮮やかな青いヒトデ。リーフの縁や瓦礫の上でよく見かける。'],
      ['クロナマコ', 'Holothuria atra', '砂をまぶした黒いナマコ。砂ごと食べて有機物を漉し取り、砂をきれいにする。'],
    ],
  },
  {
    id: 'miyako', swellHs: 0.7, name: '宮古島', site: '八重干瀬（やびじ）', region: 'Japan · Okinawa',
    lat: 25.0, lon: 125.25, depth: '3–15 m', vis: 40, temp: 28.4, tempYear: [21.5, 29.5], seed: 23, tz: 9, tide: { amp: 0.95, lag: 0.2, axis: [1, 0.35] },
    blurb: '宮古島の北に広がる国内最大級のサンゴ礁群。白砂の上にテーブルサンゴの根が点在する、宮古ブルーの浅瀬。',
    water: { up: [0.30, 0.70, 0.95], hor: [0.02, 0.29, 0.62], down: [0.0, 0.08, 0.27], fog: 0.018, abs: [0.24, 0.05, 0.022] },
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
        diel: 'night', diet: 'fish', pat: 14, c1: [0.42, 0.41, 0.39], c2: [0.86, 0.86, 0.84], c3: [0.96, 0.96, 0.94], shape: 'whitetip', size: [1.3, 1.6], habitat: 'roam', count: 3, alt: [0.8, 2.5], speed: 1.0, big: true, eye: 0.4, rests: 'cave' },
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
    ],
    animals: { turtle: { style: 'green', count: 5 }, octopus: 2, manta: 1 },
    // humpbacks come down from their northern feeding grounds to breed around Okinawa's islands
    whales: { from: [12, 20], to: [4, 5] },
    extraGuide: [
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
      { id: 'koahoudori', ja: 'コアホウドリ', sci: 'Phoebastria immutabilis', note: '翼を広げると2m。風と波の上昇気流を使う「ダイナミック・ソアリング」で、ほとんど羽ばたかずに大洋を何千kmも飛ぶ。ハワイ北西の島で繁殖し、北太平洋を回遊する。', kind: 'albatross', count: 2, span: 2.0, c1: [0.22, 0.2, 0.19], c2: [0.97, 0.97, 0.96], c3: [0.85, 0.72, 0.6], speed: 12, glide: 0.97, alt: [1, 12], rest: 0.35 },
      { id: 'kuroashi', ja: 'クロアシアホウドリ', sci: 'Phoebastria nigripes', note: '全身が黒っぽいアホウドリ。船や漂流物についてくる好奇心の強い鳥で、北太平洋の真ん中でも出会う。', kind: 'albatross', count: 1, span: 2.1, c1: [0.18, 0.16, 0.15], c2: [0.3, 0.27, 0.25], c3: [0.2, 0.18, 0.17], speed: 12, glide: 0.97, alt: [1, 10], rest: 0.35 },
    ],
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
        diel: 'always', diet: 'fish', pat: 14, c1: [0.44, 0.41, 0.36], c2: [0.9, 0.9, 0.88], c3: [0.97, 0.97, 0.95], shape: 'shark', size: [2.0, 2.6], habitat: 'roam', count: 1, alt: [70, 86], speed: 0.9, big: true, eye: 0.45 },
      { id: 'kihada', ja: 'キハダ', sci: 'Thunnus albacares', note: '黄色いひれと小離鰭（しょうりき）をもつマグロ。時速70kmを超える速さで大洋を回遊し、トビウオやイカの群れを追う。',
        diel: 'day', diet: 'fish', pat: 13, c1: [0.55, 0.58, 0.62], c2: [0.08, 0.12, 0.3], c3: [0.86, 0.87, 0.88], shape: 'tuna', size: [1.0, 1.5], habitat: 'shoal', schools: 1, n: 18, alt: [70, 84], speed: 2.2, freq: [4, 6] },
      { id: 'manbou', ja: 'マンボウ', sci: 'Mola mola', note: '世界最大級の硬骨魚。尾びれはなく、縦に長い背びれと尻びれを左右に振って泳ぐ。深く潜って冷えた体を、水面で横になって温めることもある。',
        diel: 'day', diet: 'invert', pat: 0, c1: [0.55, 0.58, 0.6], c2: [0.8, 0.81, 0.8], shape: 'mola', size: [1.5, 2.1], habitat: 'roam', count: 1, alt: [84, 88], speed: 0.4, big: true, wig: 0.2 },
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

// Reef rugosity: living reef framework is rough at the metre scale — knobs, ledges and holes — while
// sand stays smooth. Layered on every sea wherever there is reef.
function rugosity(x: number, z: number) {
  let s = 0, a = 0.5, f = 0.33;
  for (let i = 0; i < 3; i++) { s += a * (1 - Math.abs(vnoise(x * f + 17.3 * i, z * f - 9.1 * i) * 2 - 1)); f *= 2.13; a *= 0.5; }
  return s / 0.875;
}
for (const L of LOCATIONS) {
  const base = L.f;
  // under a cave massif the seabed is plain sand: no reef, no seagrass
  const foot = L.cave ? caveFootprint(L.cave) : () => 0;
  L.f = (x: number, z: number) => {
    const h = base(x, z), r = TERR.reef;
    const out = Math.min(h + (rugosity(x, z) - 0.55) * 1.4 * smooth(0.15, 0.8, r), -2.4);
    TERR.reef = r * (1 - foot(x, z));
    return out;
  };
  const g = L.grass;
  if (g && L.cave) L.grass = (x: number, z: number) => g(x, z) * (1 - smooth(0.02, 0.2, foot(x, z)));
}
