// The island's residents side by side on a beach under soft daylight: the two robots (Dot, Lantern) and
// the two animals (Kamemaru the green turtle, Rakko the sea otter). ?act=…&wet=1 poses them all (to check
// a motion: float, eat, work, groom, dive, graze, bask, sleep, swim).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { robotKit, type Act } from './models';
import { creatureKit, type Look } from './creatures';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.background = new THREE.Color(0x9fd3e0);
scene.fog = new THREE.Fog(0x9fd3e0, 9, 26);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
camera.position.set(0, 1.6, 5.2);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.45, 0); controls.enableDamping = true; controls.minDistance = 1.2; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.49;

// light: a high tropical sun and the sky
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(3, 6, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 }); sun.shadow.bias = -0.0004;
scene.add(sun, new THREE.HemisphereLight(0xcfeaf5, 0xd9c7a0, 0.9));

// the beach: sand with faint ripples, wet and darker toward the sea behind
const sandTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!;
  g.fillStyle = '#d9c9a6'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const v = 200 + Math.random() * 45; g.fillStyle = `rgba(${v},${v - 12},${v - 40},0.35)`; g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 }));
ground.receiveShadow = true; scene.add(ground);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x2aa7b8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 }));
sea.position.set(0, 0.01, -26); scene.add(sea);

// ---------- materials ----------
const M = {
  shell: new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
  accent: new THREE.MeshPhysicalMaterial({ color: 0xf08a3c, roughness: 0.4, clearcoat: 0.4 }),
  teal: new THREE.MeshPhysicalMaterial({ color: 0x3f9a93, roughness: 0.45, clearcoat: 0.3 }),
  joint: new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: 0.5, metalness: 0.6 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  glow: new THREE.MeshBasicMaterial({ color: 0x8ff6ff }),
  warm: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
  panel: (() => {
    // solar cells: a grid of dark blue cells with thin silver bus lines
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = `hsl(218, 55%, ${14 + Math.random() * 6}%)`; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28); g.fillStyle = 'rgba(200,210,220,0.35)'; g.fillRect(x * 32 + 2, y * 32 + 15, 28, 1); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, clearcoat: 1, metalness: 0.2 });
  })(),
};
const { makeDot, makeLantern } = robotKit({ ...M, stone: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }) }, true);
// the turtle's carapace painted from above: the same scutes the island's shader draws
function carapaceTex() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!, img = g.createImageData(N, N);
  const seeds: number[][] = []; for (let i = 0; i < 5; i++) seeds.push([0, 0.3 - i * 0.155]); for (let i = 0; i < 8; i++) seeds.push([(i % 2 ? 1 : -1) * 0.19, 0.235 - Math.floor(i / 2) * 0.165]);
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k), sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = (px / N - 0.5) * 0.8, z = (py / N - 0.5) * 1.0;
    let d1 = 9, d2 = 9, c1 = seeds[0], id = 0;
    seeds.forEach((s, i) => { const d = Math.hypot(x - s[0], (z - s[1]) * 1.15); if (d < d1) { d2 = d1; d1 = d; c1 = s; id = i; } else if (d < d2) d2 = d; });
    const rn = Math.hypot(x / 0.37, z / 0.48); let seam = 1 - sm(0.004, 0.012, d2 - d1), ang = Math.atan2(z - c1[1], x - c1[0]);
    if (rn > 0.84) { const a = Math.atan2(x, z) / 6.2832 * 24; seam = Math.max(sm(0.42, 0.48, Math.abs(a - Math.floor(a) - 0.5)), 1 - sm(0.004, 0.014, Math.abs(rn - 0.84))); id = Math.floor(a) + 20; ang = (a - Math.floor(a) - 0.5) * 6 + rn * 30; }
    let streak = (0.5 + 0.5 * Math.sin(ang * 9 + id * 13.7)) * (0.55 + 0.45 * Math.sin(ang * 4 - id * 5.1)) * sm(0, 0.06, d1); if (rn > 0.84) streak *= 0.6;
    let col = mix([0.17, 0.11, 0.055], [0.47, 0.37, 0.19], streak); col = mix(col, [0.52, 0.47, 0.34], seam * 0.7);
    const k = (py * N + px) * 4; col.forEach((v, i) => (img.data[k + i] = Math.min(255, Math.pow(v, 1 / 1.25) * 255))); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const std = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const { makeSeaOtter, makeGreenTurtle } = creatureKit({
  fur: std(0x3a281b, 0.9), furPale: std(0xb9a487, 0.95), furDark: std(0x1f1610, 0.9), nose: std(0x0d0c0c, 0.4), eye: std(0x050506, 0.1),
  carapace: new THREE.MeshStandardMaterial({ map: carapaceTex(), roughness: 0.45 }), plastron: std(0xd8c890, 0.7), skin: std(0x4c3b24, 0.6), beak: std(0x6a5838, 0.5),
  stone: std(0x7d776e, 0.9), urchin: std(0x3b1736, 0.5), crab: std(0xb04a2a, 0.5), clam: std(0xcbbca4, 0.5),
  white: std(0xf4f1ea, 0.3), kelp: std(0x5d6b2a, 0.6), blush: std(0xd99a86, 0.9), wire: new THREE.MeshStandardMaterial({ color: 0xb8954a, roughness: 0.3, metalness: 0.8 }), barnacle: std(0xc9c4b8, 0.9), moss: std(0x4f6b2c, 0.9),
}, true);

const ROBOTS = [
  { name: 'ドット', en: 'DOT', text: '丸い画面の顔に点の目。表情で気持ちを伝える、いちばんアイコン的な姿。器用な三本指の手で道具を作り、背中の太陽電池で動く。', make: makeDot, scale: 1 },
  { name: 'カメマル', en: 'KAMEMARU', text: '年寄りのアオウミガメ。ラグーンの海草を食べ、数分ごとに息つぎに浮かぶ。夜は海の底の岩かげで眠り、昼は浜で甲羅を干す。', make: makeGreenTurtle, scale: 1 },
  { name: 'ラッコ', en: 'RAKKO', text: 'ラッコ。潜ってウニやカニや貝をとり、仰向けに浮かんでお腹の上の石で割って食べる。毛づくろいを欠かさず、前足で目をおおって眠る。', make: makeSeaOtter, scale: 1.2 },
  { name: 'ランタン', en: 'LANTERN', text: '箱の体に長い四本脚。顔は光の輪で、考えるときに明滅する。岩場も軽々と歩く、いちばんAIらしい抽象的な姿。', make: makeLantern, scale: 1 },
];
const bots = ROBOTS.map((r, i) => {
  const b = r.make(); b.root.scale.setScalar(r.scale);
  b.root.position.set((i - 1.5) * 1.35, 0, 0); b.root.rotation.y = -((i - 1.5) * 0.12);
  scene.add(b.root); return b;
});
let focus = -1, flyT = 0, flying = false;
// ?drafts=otter|kame: four character drafts for one of the animals, side by side
const DRAFTS: Record<string, { name: string; look: Look }[]> = {
  otter: [
    { name: 'A　本物寄り＋白い線の石', look: { stone: true } },
    { name: 'B　ぬいぐるみ', look: { head: 1.3, eye: 1.7, shine: true, plump: 1.12, cheeks: true } },
    { name: 'C　昆布のスカーフ', look: { head: 1.12, eye: 1.3, shine: true, scarf: true } },
    { name: 'D　ぴょこ毛', look: { head: 1.18, eye: 1.45, shine: true, tuft: true, stone: true } },
  ],
  kame: [
    { name: 'A　フジツボと古傷', look: { barnacles: true } },
    { name: 'B　ぬいぐるみ', look: { head: 1.35, eye: 1.7, shine: true, dome: 1.25 } },
    { name: 'C　丸めがね', look: { head: 1.12, eye: 1.25, shine: true, glasses: true } },
    { name: 'D　苔のぼうし', look: { head: 1.15, eye: 1.35, shine: true, moss: true, barnacles: true } },
  ],
};
{ const which = new URLSearchParams(location.search).get('drafts');
  if (which && DRAFTS[which]) {
    bots.forEach((b) => (b.root.visible = false));
    DRAFTS[which].forEach((d, i) => {
      const b = which === 'otter' ? makeSeaOtter(d.look) : makeGreenTurtle(d.look);
      b.root.scale.setScalar(which === 'otter' ? 1.2 : 1); b.root.position.set((i - 1.5) * 1.25, 0, 0); b.root.rotation.y = 0.35 - i * 0.05; scene.add(b.root); bots.push(b);
      const tag = document.createElement('div'); tag.textContent = d.name; tag.style.cssText = `position:fixed;bottom:5%;left:${12.5 + i * 25}%;transform:translateX(-50%);font:600 15px sans-serif;color:#24363a;background:rgba(255,255,255,.75);padding:6px 12px;border-radius:999px`; document.body.appendChild(tag);
    });
    const q2 = new URLSearchParams(location.search).get('cam'); const c = (q2 ?? '0,0.9,3.4').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[0] * 0.9, 0.2, 0);
    document.getElementById('cards')!.style.display = 'none'; (document.querySelector('header') as HTMLElement | null)?.style.setProperty('display', 'none');
  } }
// ?solo=<n>: just that one, close up (with &cam=x,y,z), without the cards
{ const qs = new URLSearchParams(location.search), solo = qs.get('solo');
  if (solo != null) {
    bots.forEach((b, i) => { b.root.visible = i === +solo; b.root.position.set(0, qs.has('wet') ? 0.25 : 0, 0); b.root.rotation.y = +(qs.get('yaw') ?? 0.6); });
    const c = (qs.get('cam') ?? '1.3,0.8,1.6').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(0, +(qs.get('ty') ?? 0.15), 0);
    document.getElementById('cards')!.style.display = 'none'; (document.querySelector('header') as HTMLElement | null)?.style.setProperty('display', 'none');
  } }
const cards = document.getElementById('cards')!;
ROBOTS.forEach((r, i) => {
  const c = document.createElement('button'); c.className = 'card'; c.type = 'button';
  c.innerHTML = `<b>${r.name}</b><small>${r.en} · 案${i + 1}</small><p>${r.text}</p>`;
  c.onclick = () => { focus = focus === i ? -1 : i; flyT = performance.now(); flying = true; cards.querySelectorAll('.card').forEach((x, j) => x.classList.toggle('on', j === focus)); };
  cards.appendChild(c);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 58 : 38; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const q = new URLSearchParams(location.search), POSE = q.get('act') ? { act: q.get('act') as Act, walk: +(q.get('walk') ?? 0), wet: q.has('wet'), k: +(q.get('k') ?? 0.5), food: q.get('food') ?? '' } : undefined;
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  bots.forEach((b) => b.update(t, dt, POSE));
  // a chosen robot: glide the camera in to it
  // (for ~1.5 s after a card click, then the orbit controls are free again)
  const fly = (performance.now() - flyT) / 1500;
  if (flying) {
    const k = fly >= 1 ? 1 : Math.min(1, dt * 3 + fly * fly); flying = fly < 1;
    if (focus >= 0) { const p = bots[focus].root.position; _t.set(p.x, 0.5, p.z); _p.set(p.x + 1.1, 1.0, p.z + 2.3); }
    else { _t.set(0, 0.45, 0); _p.set(0, 1.6, 5.2); }
    controls.target.lerp(_t, k); camera.position.lerp(_p, k);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
