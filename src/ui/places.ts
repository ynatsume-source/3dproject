// Places worth going to in each sea, found in the sea as it was built (the nearest one to the drone).
import * as THREE from 'three';
import { LIMIT } from '../ocean/scenery';

export interface Place { id: string; ja: string; note: string; find(oc: any, cam: THREE.Vector3): { pos: THREE.Vector3; size: number } | null }

const nearest = (list: { pos: THREE.Vector3 }[], cam: THREE.Vector3) => list.length ? list.reduce((a, b) => (b.pos.distanceTo(cam) < a.pos.distanceTo(cam) ? b : a)) : null;
// best-scoring point within reach of the drone (score < 0 = not suitable)
function best(oc: any, cam: THREE.Vector3, score: (x: number, z: number, h: number, reef: number, slope: number) => number) {
  const T = oc.T;
  let bx = 0, bz = 0, bs = -Infinity;
  for (let k = 0; k < 500; k++) {
    const a = k * 2.39996, r = 6 + Math.sqrt(k / 500) * 90;
    const x = Math.max(-LIMIT, Math.min(LIMIT, cam.x + Math.cos(a) * r)), z = Math.max(-LIMIT, Math.min(LIMIT, cam.z + Math.sin(a) * r));
    const h = oc.loc.f(x, z), reef = T.reef(x, z), sl = T.slope(x, z);
    const s = score(x, z, h, reef, sl) - r * 0.004;                 // a little preference for nearer places
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  return bs > -1e8 ? new THREE.Vector3(bx, Math.min(T.top(bx, bz) + 1.2, -1.6), bz) : null;
}
const anemone = (name: string): Place => ({ id: 'anemone', ja: `${name}のイソギンチャク`, note: 'クマノミの一家が暮らすイソギンチャク。近づくと触手の奥へ隠れる。',
  find: (oc, cam) => { const a = nearest(oc.anemones, cam); return a ? { pos: a.pos.clone().setY(a.pos.y + 0.3), size: 0.5 } : null; } });
const eels: Place = { id: 'eels', ja: 'チンアナゴの砂地', note: '砂から体を伸ばしたチンアナゴが、流れに向かってゆらゆら揺れている。',
  find: (oc, cam) => { const c = nearest(oc.colonies, cam); return c ? { pos: c.pos.clone().setY(c.pos.y + 0.8), size: 2.5 } : null; } };

export const PLACES: Record<string, Place[]> = {
  monterey: [
    { id: 'kelp-forest', ja: 'ケルプの森', note: '岩に付着した褐藻が、水面へ伸びる。茎の間をメバルの仲間が行き来する。', find: (oc, cam) => {
      const root = nearest((oc.kelp?.roots || []).map((pos: THREE.Vector3) => ({ pos })), cam);
      return root ? { pos: root.pos.clone().setY(root.pos.y * 0.5), size: 4 } : null; } },
    { id: 'kelp-canopy', ja: '水面の葉の層', note: '気胞に浮かされた葉が水面近くに広がる。下から見上げると、葉の間に空がのぞく。', find: (oc, cam) => {
      const root = nearest((oc.kelp?.roots || []).map((pos: THREE.Vector3) => ({ pos })), cam);
      return root ? { pos: root.pos.clone().setY(-2.2), size: 3 } : null; } },
    { id: 'sand-lane', ja: '森の間の砂地', note: '岩場の間を縫う砂の通路。森の密な場所と開けた場所が隣り合う。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => reef < 0.08 && h < -8 ? 1 : -1e9); return p ? { pos: p, size: 4 } : null; } },
  ],
  miyako: [
    anemone('カクレクマノミ'),
    eels,
    { id: 'meadow', ja: '海草の藻場', note: 'ウミガメが海草を食べに来る、砂地に広がる草原。', find: (oc, cam) => {
      const g = oc.loc.grass; if (!g) return null;
      const p = best(oc, cam, (x, z, h, reef) => { oc.loc.f(x, z); return reef < 0.05 ? g(x, z) : -1e9; }); return p ? { pos: p, size: 4 } : null; } },
    { id: 'bommie', ja: 'テーブルサンゴの根', note: '白砂から立ち上がる根の上に、テーブルサンゴが段々に重なる八重干瀬らしい景色。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (reef > 0.55 ? h : -1e9)); return p ? { pos: p, size: 5 } : null; } },
    { id: 'wall', ja: '根の壁とオーバーハング', note: '根の側面。張り出した岩棚の下にアカマツカサが隠れている。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef, sl) => (reef > 0.4 && sl > 1.0 ? sl : -1e9)); return p ? { pos: p, size: 3 } : null; } },
  ],
  gbr: [
    { id: 'spur', ja: 'スパー・アンド・グルーブ', note: '外洋のうねりが削った、サンゴの尾根と砂の溝が交互に並ぶ斜面。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef, sl) => (reef > 0.35 && sl > 0.6 && h > -16 && h < -6 ? sl : -1e9)); return p ? { pos: p, size: 5 } : null; } },
    { id: 'flat', ja: '礁原（リーフフラット）', note: '干潮には水面近くまで浅くなる、リーフの平らな頂。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (reef > 0.4 ? h : -1e9)); return p ? { pos: p, size: 5 } : null; } },
    anemone('オレンジクラウンフィッシュ'),
  ],
  kayama: [
    anemone('カクレクマノミ'),
    { id: 'shore', ja: '浜の波打ち際', note: '白い砂浜が水の中へゆるやかに続く浅瀬。若いツマグロが膝ほどの深さを巡回し、見上げると浜のアダンとモクマオウが揺れている。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h) => (h > -2.4 && h < -1.7 && oc.T.reef(x, z) < 0.1 ? 1 : -1e9)); return p ? { pos: p.setY(-1.1), size: 3 } : null; } },
    { id: 'microatoll', ja: 'ハマサンゴの根', note: 'ラグーンの砂地に点々と盛り上がる塊状サンゴ。頭が水面近くまで育ち、まわりをスズメダイやチョウチョウウオが囲む。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (reef > 0.5 && h > -3 ? reef : -1e9)); return p ? { pos: p, size: 3 } : null; } },
  ],
  redsea: [
    { id: 'ridge', ja: '尾根の頂上', note: '深い青から立ち上がる細長い尾根のてっぺん。水面の光がサンゴの上で揺れる。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (reef > 0.6 && h > -9 ? reef - Math.abs(h + 5) * 0.05 : -1e9)); return p ? { pos: p, size: 5 } : null; } },
    { id: 'wall', ja: 'ソフトコーラルの壁', note: '尾根の両側の切り立った壁。赤や紫のトゲトサカが流れの中で膨らんでいる。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef, sl) => (reef > 0.3 && sl > 1.2 && h > -25 ? sl : -1e9)); return p ? { pos: p, size: 3 } : null; } },
    { id: 'plateau', ja: '北の台地', note: '尾根の北の端に広がる深い台地。この沖の青の中を、シュモクザメやヨゴレが通りかかる。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (z > 70 && reef > 0.3 ? z * 0.01 : -1e9)); return p ? { pos: p, size: 6 } : null; } },
    anemone('レッドシーアネモネフィッシュ'),
  ],
  carnatic: [
    { id: 'wreck', ja: 'カルナティック号', note: '1869年に沈んだ帆走汽船。左舷を下に横たわり、朽ちた甲板の跡に鉄の肋骨が並ぶ。その間を光の筋とグラスフィッシュの群れが流れる。', find: (oc) => oc.wreck ? { pos: oc.wreck.centre.clone().setY(oc.wreck.centre.y + 9), size: 20 } : null },
    { id: 'reef', ja: 'アブ・ヌハスの礁', note: '沈船の南にそびえる浅い礁。何隻もの船がこの礁に乗り上げてきた。上はテーブルサンゴとキンギョハナダイの群れ。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (reef > 0.6 && h > -6 ? reef : -1e9)); return p ? { pos: p, size: 5 } : null; } },
    anemone('レッドシーアネモネフィッシュ'),
  ],
  galapagos: [
    { id: 'boulders', ja: '溶岩の岩場', note: '火山から転がり落ちた黒い岩の斜面。岩のすき間に魚が群れ、上をシュモクザメが流れていく。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef, sl) => (reef > 0.25 && sl > 0.6 ? sl : -1e9)); return p ? { pos: p, size: 4 } : null; } },
    { id: 'hammers', ja: 'シュモクザメの群れ', note: '潮の中に並んで浮かぶアカシュモクザメの群れ。昼のあいだ、ここで体を休め、掃除してもらう。', find: (oc, cam) => {
      const s = oc.fish.find((f: any) => f.sp.id === 'akashumoku')?.focus(cam); return s ? { pos: s.pos().clone(), size: 10 } : null; } },
    eels,
  ],
  maldives: [
    { id: 'thila', ja: 'ティラの頂上', note: '海底からそびえる根のてっぺん。潮通しがよく、魚が群れる。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef) => (reef > 0.4 ? h : -1e9)); return p ? { pos: p, size: 6 } : null; } },
    { id: 'wall', ja: 'ティラの壁', note: '流れに向かってウミウチワやトゲトサカが枝を広げる急斜面。', find: (oc, cam) => {
      const p = best(oc, cam, (x, z, h, reef, sl) => (reef > 0.4 && sl > 1.0 ? sl : -1e9)); return p ? { pos: p, size: 3 } : null; } },
    { id: 'station', ja: 'マンタのクリーニングステーション', note: '小魚にエラや体を掃除してもらうため、マンタが周回しに来る場所。', find: (oc) => {
      const m = oc.mantas[0]; return m && m.placed ? { pos: m.st.clone().setY(m.y), size: 6 } : null; } },
    anemone('モルディブアネモネフィッシュ'),
  ],
};
