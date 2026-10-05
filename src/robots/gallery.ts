// The island's residents side by side on a beach under soft daylight: the two robots (Dot, Lantern) and
// the two animals (Kamemaru the green turtle, Rakko the sea otter). ?act=…&wet=1 poses them all (to check
// a motion: float, eat, work, groom, dive, graze, bask, sleep, swim).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type Act } from './models';
import { type Look } from './creatures';
import { galleryKits } from './gallery-kit';

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

const { makeDot, makeLantern, makeSeaOtter, makeGreenTurtle, makeChibiOtter, makeChibiTurtle, makeRakko, makeKame } = galleryKits();

const ROBOTS = [
  { name: 'ドット', en: 'DOT', text: '丸い画面の顔に点の目。表情で気持ちを伝える、いちばんアイコン的な姿。器用な三本指の手で道具を作り、背中の太陽電池で動く。', make: makeDot, scale: 1 },
  { name: 'カメマル', en: 'KAMEMARU', text: '年寄りのアオウミガメ。いつも真顔。甲羅のてっぺんに双葉が一本。ラグーンの海草を食べ、数分ごとに息つぎに浮かび、夜は海の底で眠る。', make: makeKame, scale: 1 },
  { name: 'ラッコ', en: 'RAKKO', text: 'ラッコ。首に海藻のスカーフ、頭にぴょこ毛。白い線の入った石を手放さない。潜ってウニやカニや貝をとり、仰向けに浮かんでお腹の上で食べる。', make: makeRakko, scale: 1.2 },
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
  if (which === 'chibi' || which === 'odd' || which === 'odd2' || which === 'pick') {
    // the characters: in the poses of their days
    bots.forEach((b) => (b.root.visible = false));
    const eat = { act: 'eat', walk: 0, wet: true, food: 'urchin' }, swim = { act: 'swim', walk: 1, wet: true };
    const set: [string, () => any, any, number][] = which === 'chibi' ? [
      ['ラッコ', makeChibiOtter, undefined, 0],
      ['ラッコ　ウニを食べる', makeChibiOtter, eat, 0.18],
      ['カメマル', makeChibiTurtle, undefined, 0],
      ['カメマル　泳ぐ', makeChibiTurtle, swim, 0.25],
    ] : which === 'pick' ? [
      ['ラッコ', makeRakko, undefined, 0],
      ['ラッコ　ウニを食べる', makeRakko, eat, 0.25],
      ['カメマル', () => makeChibiTurtle('kame'), undefined, 0],
      ['カメマル　泳ぐ', () => makeChibiTurtle('kame'), swim, 0.25],
    ] : which === 'odd' ? [
      ['ラッコ　ぽかん', () => makeChibiOtter('pokan'), undefined, 0],
      ['ラッコ　真顔', () => makeChibiOtter('magao'), undefined, 0],
      ['カメマル　ぽかん', () => makeChibiTurtle('pokan'), undefined, 0],
      ['カメマル　真顔', () => makeChibiTurtle('magao'), undefined, 0],
    ] : [
      ['ぽかん　ウニを食べる', () => makeChibiOtter('pokan'), eat, 0.18],
      ['真顔　ウニを食べる', () => makeChibiOtter('magao'), eat, 0.18],
      ['ぽかん　泳ぐ', () => makeChibiTurtle('pokan'), swim, 0.25],
      ['真顔　泳ぐ', () => makeChibiTurtle('magao'), swim, 0.25],
    ];
    set.forEach(([name, make, pose, lift], i) => {
      const b = make(); b.root.scale.setScalar(1.25); b.root.position.set((i - 1.5) * 1.15, lift, 0); b.root.rotation.y = which === 'pick' ? [0.25, 1.9, 0.3, -0.5][i] : which === 'odd' ? (i % 2 ? -0.25 : 0.25) : which === 'odd2' ? (i < 2 ? 1.9 : -0.5) : i === 1 ? 1.9 : i === 3 ? -0.5 : 0.3; scene.add(b.root);
      const u = b.update.bind(b); for (let k = 0; k < 60; k++) u(k * 0.1, 0.1, pose); b.update = (t: number, dt: number) => u(t, dt, pose); bots.push(b);   // (settled into the pose)
      const tag = document.createElement('div'); tag.textContent = name; tag.style.cssText = `position:fixed;bottom:5%;left:${12.5 + i * 25}%;transform:translateX(-50%);font:600 15px sans-serif;color:#24363a;background:rgba(255,255,255,.75);padding:6px 12px;border-radius:999px`; document.body.appendChild(tag);
    });
    const q2 = new URLSearchParams(location.search).get('cam'); const c = (q2 ?? '0,0.9,3.2').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[0] * 0.9, 0.3, 0);
    document.getElementById('cards')!.style.display = 'none'; (document.querySelector('header') as HTMLElement | null)?.style.setProperty('display', 'none');
  }
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
// (&el=<s>&task=<kind>&key=<n>: a moment in a spell of doing something, held still — for checking a staged motion;
// &probe=<0..1>: Lantern trying the footing; &look=x,y,z: what it looks at, in its own frame; &beat=speak|listen,<s>)
const q = new URLSearchParams(location.search), POSE = q.get('act') ? { act: q.get('act') as Act, walk: +(q.get('walk') ?? 0), wet: q.has('wet'), k: +(q.get('k') ?? 0.5), food: q.get('food') ?? '',
  ...(q.has('el') ? { elapsed: +q.get('el')!, key: +(q.get('key') ?? 1), task: q.get('task') ?? undefined } : {}),
  ...(q.has('probe') ? { probe: +q.get('probe')! } : {}), ...(q.has('beat') ? { beat: { role: q.get('beat')!.split(',')[0] as 'speak' | 'listen', t: +(q.get('beat')!.split(',')[1] ?? 1) } } : {}), ...(q.has('look') ? { look: q.get('look')!.split(',').map(Number) as [number, number, number] } : {}) } : undefined;
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  bots.forEach((b) => b.update(t, dt, POSE ?? undefined));
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
