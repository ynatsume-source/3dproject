// Fish that travel with the big ones, as they do in these seas: remoras (コバンザメ) stuck by their head
// discs under whale sharks, mantas, sharks and turtles, now and then shifting their grip; pilot fish
// (ブリモドキ) keeping station round an oceanic whitetip's snout and flanks; and young golden trevally
// (コガネシマアジ) riding the pressure wave just ahead of a whale shark's mouth. They are placed in their
// host's own frame each frame (read back from the host's drawn transform), so they go wherever it goes.
import * as THREE from 'three';
import type { Species } from '../data/locations';
import { SHAPES, fishGeometry, fishMaterial } from '../ocean/models';

export const REMORA: Species = { id: 'kobanzame', ja: 'コバンザメ', sci: 'Echeneis naucrates', note: '頭の上の小判形の吸盤で、ジンベエザメやマンタ、サメ、ウミガメの腹に吸いつく。大きな生きものに運んでもらい、食べこぼしや寄生虫を食べる。ときどき離れては、また吸いつき直す。',
  pat: 5, c1: [0.36, 0.36, 0.36], c2: [0.08, 0.08, 0.09], bands: 1.6, shape: 'barracuda', size: [0.35, 0.6], habitat: 'roam', speed: 1 };
export const PILOT: Species = { id: 'burimodoki', ja: 'ブリモドキ', sci: 'Naucrates ductor', note: '青白い体に黒い縦帯が5〜7本。外洋でヨゴレなどのサメの鼻先やわきにつき従って泳ぐ。サメの起こす流れに乗り、食べこぼしをもらう。',
  pat: 6, c1: [0.62, 0.7, 0.8], c2: [0.72, 0.78, 0.86], c3: [0.1, 0.12, 0.2], bands: 6, shape: 'jack', size: [0.25, 0.4], habitat: 'roam', speed: 1 };
export const TREVALLY: Species = { id: 'koganeshimaaji', ja: 'コガネシマアジ（幼魚）', sci: 'Gnathanodon speciosus', note: '黄金色に黒い横帯の幼魚が、ジンベエザメやサメの口の前に群れて泳ぐ。大きな体が水を押す波に乗って、楽に泳いでいるといわれる。',
  pat: 6, c1: [0.98, 0.84, 0.2], c2: [0.95, 0.9, 0.55], c3: [0.08, 0.07, 0.05], bands: 4.2, shape: 'jack', size: [0.1, 0.16], habitat: 'roam', speed: 1 };

type Kind = 'remora' | 'pilot' | 'trevally';
interface Rider { kind: Kind; host: () => THREE.Matrix4 | null; hostLen: number; at: THREE.Vector3; len: number; ph: number; hop: number }

// who carries whom (species id of the host → riders)
const CREW: Record<string, [Kind, number, number][]> = {
  whaleshark: [['remora', 2, 5], ['trevally', 4, 9]],
  yogore: [['pilot', 3, 6], ['remora', 0, 2]],
  itachizame: [['remora', 1, 3]],
  galapagoszame: [['remora', 0, 2]],
  blacktip: [['remora', 0, 1]],
  kurokajiki: [['remora', 0, 1]],
  manbou: [],
};

export function makeRiders(oc: any) {
  const group = new THREE.Group();
  const riders: Rider[] = [];
  const hash = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  let seed = 1;
  const rnd = () => hash(seed++);
  const add = (kind: Kind, host: () => THREE.Matrix4 | null, hostLen: number, where: 'belly' | 'side' | 'shell') => {
    const sp = kind === 'remora' ? REMORA : kind === 'pilot' ? PILOT : TREVALLY;
    const len = sp.size[0] + (sp.size[1] - sp.size[0]) * rnd();
    // where on (or around) the host, in its own frame: model units, snout at +z
    const at = new THREE.Vector3();
    if (kind === 'trevally') at.set((rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.06, 0.56 + rnd() * 0.12);            // in front of the mouth
    else if (kind === 'pilot') { const s = rnd() < 0.5 ? -1 : 1; at.set(s * (0.07 + rnd() * 0.1), 0.02 + (rnd() - 0.5) * 0.08, 0.2 + rnd() * 0.45); }   // round the snout and along the flanks
    else if (where === 'shell') at.set((rnd() - 0.5) * 0.3, -0.06, (rnd() - 0.5) * 0.5);                           // under a turtle's plastron
    else if (where === 'side') at.set((rnd() - 0.5) * 0.35, -0.03, (rnd() - 0.2) * 0.35);                           // under a manta's disc
    else at.set((rnd() - 0.5) * 0.08, -0.085 - rnd() * 0.02, -0.05 + rnd() * 0.3);                                    // on a shark's belly
    riders.push({ kind, host, hostLen, at, len, ph: rnd() * 100, hop: 0 });
  };
  // fish hosts: every drawn instance of the species
  for (const sys of oc.fish) {
    const crew = CREW[sys.sp.id === 'whaleshark' ? 'whaleshark' : sys.sp.id];
    if (!crew || !sys.mesh || sys.sp.habitat === 'shoal') continue;
    const mesh = sys.mesh as THREE.InstancedMesh;
    for (let i = 0; i < mesh.count; i++) {
      const m = new THREE.Matrix4();
      const host = () => { mesh.getMatrixAt(i, m); return m.elements[0] * m.elements[0] + m.elements[1] * m.elements[1] + m.elements[2] * m.elements[2] < 1e-6 ? null : m; };
      for (const [kind, lo, hi] of crew) { const n = lo + Math.floor(rnd() * (hi - lo + 1)); for (let k = 0; k < n; k++) add(kind, host, 1.28, 'belly'); }
    }
  }
  for (const mt of oc.mantas || []) { const n = 1 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) add('remora', () => (mt.mesh.visible ? mt.mesh.matrixWorld : null), 1, 'side'); }
  for (const t of oc.turtles || []) if (rnd() < 0.45) add('remora', () => (t.group.visible && t.placed !== false ? t.group.matrixWorld : null), 1, 'shell');
  if (!riders.length) return null;

  const meshes: Record<Kind, THREE.InstancedMesh | null> = { remora: null, pilot: null, trevally: null };
  for (const kind of ['remora', 'pilot', 'trevally'] as Kind[]) {
    const list = riders.filter((r) => r.kind === kind); if (!list.length) continue;
    const sp = kind === 'remora' ? REMORA : kind === 'pilot' ? PILOT : TREVALLY;
    const g = fishGeometry(SHAPES[sp.shape]);
    const sw = new Float32Array(list.length * 3);
    list.forEach((r, i) => { sw[i * 3] = r.ph; sw[i * 3 + 1] = kind === 'remora' ? 3 : 9 + rnd() * 3; sw[i * 3 + 2] = 0.9 + rnd() * 0.2; });
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 3));
    const mesh = new THREE.InstancedMesh(g, fishMaterial(sp), list.length);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh); meshes[kind] = mesh;
  }
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hs = new THREE.Vector3(), _m = new THREE.Matrix4(), _o = new THREE.Vector3();
  const idx: Record<Kind, number> = { remora: 0, pilot: 0, trevally: 0 };
  return {
    group,
    species: [REMORA, PILOT, TREVALLY].filter((sp) => riders.some((r) => (r.kind === 'remora' ? REMORA : r.kind === 'pilot' ? PILOT : TREVALLY) === sp)),
    update(dt: number, t: number) {
      idx.remora = idx.pilot = idx.trevally = 0;
      for (const r of riders) {
        const mesh = meshes[r.kind]!, i = idx[r.kind]++;
        const hm = r.host();
        if (!hm) { mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        hm.decompose(_hp, _hq, _hs);
        // a remora now and then lets go, drifts a hand's breadth off, and clamps on again
        if (r.kind === 'remora') { r.hop = Math.max(0, r.hop - dt); if (r.hop === 0 && Math.random() < dt * 0.01) r.hop = 3; }
        const off = r.kind === 'remora' ? Math.sin(Math.min(1, r.hop / 3) * Math.PI) * 0.05 : r.kind === 'pilot' ? 0.012 : 0.008;
        _o.set(r.at.x + Math.sin(t * 0.7 + r.ph) * off, r.at.y - (r.kind === 'remora' ? off : Math.sin(t * 0.9 + r.ph * 2) * off), r.at.z + Math.sin(t * 0.5 + r.ph * 3) * off);
        _p.copy(_o).applyMatrix4(hm);
        // the same heading as the host (a pilot fish or trevally weaving a little), at its own size
        _q.copy(_hq);
        if (r.kind !== 'remora') _q.multiply(new THREE.Quaternion().setFromAxisAngle(_s.set(0, 1, 0), Math.sin(t * 1.3 + r.ph) * 0.18));
        else _q.multiply(new THREE.Quaternion().setFromAxisAngle(_s.set(0, 0, 1), Math.PI));   // (clinging upside down under the host: its disc is on top of its head)
        _s.setScalar(r.len / 1.28);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      for (const k of ['remora', 'pilot', 'trevally'] as Kind[]) if (meshes[k]) meshes[k]!.instanceMatrix.needsUpdate = true;
    },
  };
}

// which of them live in a sea (for the field guide): whoever its big animals carry
export function ridersFor(loc: { species: Species[]; animals: { manta?: number; turtle?: unknown } }): Species[] {
  const kinds = new Set<Kind>();
  for (const sp of loc.species) if (sp.habitat !== 'shoal') for (const [k, , hi] of CREW[sp.id] || []) if (hi > 0) kinds.add(k);
  if (loc.animals.manta || loc.animals.turtle) kinds.add('remora');
  return [...kinds].map((k) => (k === 'remora' ? REMORA : k === 'pilot' ? PILOT : TREVALLY));
}
