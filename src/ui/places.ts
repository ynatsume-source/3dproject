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
