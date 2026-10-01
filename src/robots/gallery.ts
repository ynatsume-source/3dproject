// The island's residents side by side on a beach under soft daylight: the two robots (Dot, Lantern) and
// the two animals (Kamemaru the green turtle, Rakko the sea otter). ?act=…&wet=1 poses them all (to check
// a motion: float, eat, work, groom, dive, graze, bask, sleep, swim).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { robotKit, type Act } from './models';
import { creatureKit } from './creatures';

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
const std = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const { makeSeaOtter, makeGreenTurtle } = creatureKit({
  fur: std(0x3a281b, 0.9), furPale: std(0xb9a487, 0.95), furDark: std(0x1f1610, 0.9), nose: std(0x0d0c0c, 0.4), eye: std(0x050506, 0.1),
  carapace: std(0x5a4426, 0.5), plastron: std(0xd8c890, 0.7), skin: std(0x4c3b24, 0.6), beak: std(0x8f7d58, 0.5),
  stone: std(0x7d776e, 0.9), urchin: std(0x3b1736, 0.5), crab: std(0xb04a2a, 0.5), clam: std(0xcbbca4, 0.5),
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
