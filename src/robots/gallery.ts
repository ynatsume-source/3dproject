// Design samples for the island's resident: four robots with four limbs each, built from simple rounded
// parts and moving by hand-written cycles, standing on a beach under soft daylight.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
const cap = (r: number, l: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m); o.castShadow = true; return o; };
const box = (w: number, h: number, d: number, r: number, m: THREE.Material) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m); o.castShadow = true; return o; };
const ball = (r: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m); o.castShadow = true; return o; };
const cyl = (r1: number, r2: number, h: number, m: THREE.Material, seg = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.castShadow = true; return o; };
// a limb segment hanging from a pivot, so rotating the pivot swings it
function limb(len: number, r: number, m: THREE.Material) {
  const pivot = new THREE.Group(), seg = cap(r, Math.max(0.001, len - 2 * r), m);
  seg.position.y = -len / 2; pivot.add(seg);
  const end = new THREE.Group(); end.position.y = -len; pivot.add(end);
  pivot.add(Object.assign(ball(r * 1.15, M.joint), {}));
  return { pivot, end };
}

interface Robot { root: THREE.Group; update(t: number, dt: number): void }

// 1. ドット: the icon — a round screen face with dot eyes that blink and glance about
function makeDot(): Robot {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const torso = box(0.34, 0.34, 0.26, 0.08, M.shell); torso.position.y = 0.52; body.add(torso);
  const belt = box(0.35, 0.05, 0.27, 0.02, M.accent); belt.position.y = 0.4; body.add(belt);
  const pack = box(0.3, 0.3, 0.06, 0.02, M.panel); pack.position.set(0, 0.55, -0.16); pack.rotation.x = -0.1; body.add(pack);
  const head = new THREE.Group(); head.position.y = 0.86; body.add(head);
  head.add(box(0.46, 0.34, 0.32, 0.1, M.shell));
  const screen = box(0.38, 0.25, 0.02, 0.06, M.dark); screen.position.z = 0.158; head.add(screen);
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), M.glow); e.position.set(sx * 0.08, 0.01, 0.17); head.add(e); eyes.push(e); }
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.008), M.glow); mouth.position.set(0, -0.06, 0.17); head.add(mouth);
  const ant = cyl(0.008, 0.008, 0.14, M.joint); ant.position.set(0.12, 0.23, 0); head.add(ant);
  const tip = ball(0.022, M.warm); tip.position.set(0.12, 0.31, 0); head.add(tip);
  const arms = [-1, 1].map((sx) => { const up = limb(0.18, 0.035, M.shell); up.pivot.position.set(sx * 0.22, 0.64, 0); body.add(up.pivot); const lo = limb(0.16, 0.03, M.teal); up.end.add(lo.pivot);
    for (let f = 0; f < 3; f++) { const c = cyl(0.008, 0.012, 0.06, M.joint, 8); c.position.set((f - 1) * 0.018, -0.03, f === 1 ? 0.012 : -0.006); lo.end.add(c); } return { up, lo, sx }; });
  const legs = [-1, 1].map((sx) => { const up = limb(0.16, 0.045, M.joint); up.pivot.position.set(sx * 0.1, 0.36, 0); body.add(up.pivot); const lo = limb(0.14, 0.04, M.shell); up.end.add(lo.pivot);
    const foot = box(0.1, 0.05, 0.16, 0.02, M.accent); foot.position.set(0, -0.02, 0.03); lo.end.add(foot); return { up, lo }; });
  let blink = 2, look = 0, lookT = 1;
  return { root, update(t, dt) {
    const w = t * 4.2;
    legs.forEach((l, i) => { const ph = w + i * Math.PI; l.up.pivot.rotation.x = Math.sin(ph) * 0.35; l.lo.pivot.rotation.x = Math.max(0, -Math.cos(ph)) * 0.55; });
    const wave = Math.max(0, Math.sin(t * 0.4)) > 0.92;
    arms.forEach((a, i) => {
      if (wave && a.sx > 0) { a.up.pivot.rotation.set(0, 0, -2.4); a.lo.pivot.rotation.z = Math.sin(t * 10) * 0.4; }
      else { a.up.pivot.rotation.set(-Math.sin(w + i * Math.PI) * 0.35, 0, a.sx * 0.12); a.lo.pivot.rotation.set(-0.35, 0, 0); }
    });
    body.position.y = Math.abs(Math.sin(w)) * 0.02; body.rotation.z = Math.sin(w) * 0.03;
    if ((blink -= dt) < 0) blink = 2 + Math.random() * 3;
    const b = blink < 0.12 ? 0.1 : 1;
    if ((lookT -= dt) < 0) { lookT = 1 + Math.random() * 2; look = (Math.random() - 0.5) * 0.05; }
    eyes.forEach((e, i) => { e.scale.y += (b - e.scale.y) * Math.min(1, dt * 30); e.position.x += ((i ? 1 : -1) * 0.08 + look - e.position.x) * Math.min(1, dt * 8); });
    mouth.scale.x = wave ? 1.8 : 1;
    head.rotation.y = Math.sin(t * 0.7) * 0.25; head.rotation.x = Math.sin(t * 0.5) * 0.06;
    (tip.material as THREE.MeshBasicMaterial).color.setHSL(0.11, 1, 0.55 + 0.25 * Math.sin(t * 3));
  } };
}

// 2. カメマル: a shell of solar cells on four legs that fold into flippers; one big lens of an eye
function makeKame(): Robot {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.panel);
  shell.scale.set(1, 0.55, 1.2); shell.position.y = 0.34; shell.castShadow = true; body.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 10, 48), M.shell); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.2, 1); rim.position.y = 0.34; body.add(rim);
  const belly = box(0.66, 0.12, 0.84, 0.06, M.shell); belly.position.y = 0.29; body.add(belly);
  const neck = new THREE.Group(); neck.position.set(0, 0.34, 0.5); body.add(neck);
  const nk = cap(0.06, 0.12, M.joint); nk.rotation.x = Math.PI / 2; nk.position.z = 0.06; neck.add(nk);
  const head = box(0.2, 0.16, 0.2, 0.06, M.shell); head.position.set(0, 0.03, 0.16); neck.add(head);
  const lensRing = cyl(0.065, 0.065, 0.04, M.accent, 32); lensRing.rotation.x = Math.PI / 2; lensRing.position.set(0, 0.04, 0.27); neck.add(lensRing);
  const lens = ball(0.05, M.dark); lens.position.set(0, 0.04, 0.28); lens.scale.z = 0.6; neck.add(lens);
  const iris = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.024, 32), M.glow); iris.position.set(0, 0.04, 0.3); neck.add(iris);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const up = limb(0.16, 0.05, M.joint); up.pivot.position.set(sx * 0.34, 0.3, sz * 0.3); body.add(up.pivot);
    const paddle = box(0.14, 0.04, 0.2, 0.02, M.teal); paddle.position.set(sx * 0.02, -0.01, 0.04 * sz); up.end.add(paddle);
    return { up, sx, sz };
  });
  return { root, update(t) {
    const w = t * 1.8;
    legs.forEach((l, i) => { const ph = w + (i === 0 || i === 3 ? 0 : Math.PI); l.up.pivot.rotation.x = Math.sin(ph) * 0.4; l.up.pivot.rotation.z = l.sx * (0.5 + Math.max(0, Math.cos(ph)) * 0.25); });
    body.position.y = Math.sin(w * 2) * 0.01;
    neck.rotation.y = Math.sin(t * 0.5) * 0.5; neck.rotation.x = -0.15 + Math.sin(t * 0.8) * 0.1;
    iris.scale.setScalar(1 + 0.25 * Math.sin(t * 2.2));   // focusing
  } };
}

// 3. ラッコ: sleek, sitting up on its haunches; nimble front paws working a stone, a propeller tail
function makeOtter(): Robot {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const torso = cap(0.16, 0.34, M.shell); torso.position.set(0, 0.42, 0); torso.rotation.x = -0.35; body.add(torso);
  const chest = cap(0.12, 0.18, M.accent); chest.position.set(0, 0.47, 0.09); chest.rotation.x = -0.35; chest.scale.set(1, 1, 0.6); body.add(chest);
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.12); body.add(head);
  head.add(Object.assign(ball(0.15, M.shell), {}));
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 32, 12, -0.9, 1.8, 1.2, 0.55), M.dark); head.add(visor);
  const eyes = [-1, 1].map((sx) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), M.glow); e.position.set(sx * 0.05, 0.02, 0.15); e.lookAt(e.position.clone().multiplyScalar(2)); head.add(e); return e; });
  for (const sx of [-1, 1]) { const ear = cyl(0.035, 0.035, 0.02, M.joint); ear.rotation.z = Math.PI / 2; ear.position.set(sx * 0.14, 0.07, -0.01); head.add(ear); }
  const nose = ball(0.02, M.joint); nose.position.set(0, -0.03, 0.15); head.add(nose);
  const arms = [-1, 1].map((sx) => { const a = limb(0.2, 0.035, M.shell); a.pivot.position.set(sx * 0.12, 0.62, 0.1); body.add(a.pivot); const paw = ball(0.04, M.joint); a.end.add(paw); return { a, sx }; });
  const stone = ball(0.055, new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 })); stone.scale.set(1.2, 0.8, 1); body.add(stone);
  for (const sx of [-1, 1]) { const leg = cap(0.05, 0.12, M.joint); leg.rotation.x = Math.PI / 2; leg.position.set(sx * 0.12, 0.08, 0.14); body.add(leg);
    const foot = box(0.1, 0.03, 0.14, 0.015, M.teal); foot.position.set(sx * 0.12, 0.03, 0.24); body.add(foot); }
  const tail = new THREE.Group(); tail.position.set(0, 0.16, -0.18); body.add(tail);
  const tl = cap(0.06, 0.3, M.shell); tl.rotation.x = Math.PI / 2 + 0.25; tl.position.z = -0.18; tail.add(tl);
  const hub = new THREE.Group(); hub.position.set(0, -0.08, -0.38); tail.add(hub);
  for (let k = 0; k < 3; k++) { const bl = box(0.03, 0.12, 0.01, 0.005, M.accent); bl.position.y = 0.06; const arm = new THREE.Group(); arm.rotation.z = k * Math.PI * 2 / 3; arm.add(bl); hub.add(arm); }
  return { root, update(t, dt) {
    // tapping the stone, as sea otters crack shells
    const tap = Math.max(0, Math.sin(t * 5)) ** 3, work = Math.sin(t * 0.3) > -0.2 ? 1 : 0;
    arms.forEach((ar) => { ar.a.pivot.rotation.set(-1.1 - tap * 0.4 * work, 0, ar.sx * -0.35); });
    stone.position.set(0, 0.45 + tap * 0.05 * work, 0.3);
    head.rotation.set(0.25 * work + Math.sin(t * 0.6) * 0.05, Math.sin(t * 0.35) * 0.5 * (1 - work), 0);
    hub.rotation.z += dt * 18;
    tail.rotation.y = Math.sin(t * 1.3) * 0.2;
    eyes.forEach((e) => { e.scale.y = Math.sin(t * 0.9) > 0.985 ? 0.1 : 1; });
    body.position.y = Math.sin(t * 1.4) * 0.006;
  } };
}

// 4. ランタン: a box on four long jointed legs; a ring of light for a face that breathes as it thinks
function makeLantern(): Robot {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const core = box(0.42, 0.34, 0.42, 0.07, M.shell); core.position.y = 0.72; body.add(core);
  const roof = box(0.46, 0.05, 0.46, 0.02, M.panel); roof.position.y = 0.905; body.add(roof);
  const face = cyl(0.13, 0.13, 0.02, M.dark, 40); face.rotation.x = Math.PI / 2; face.position.set(0, 0.73, 0.212); body.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 10, 48), M.glow.clone()); ring.position.set(0, 0.73, 0.224); body.add(ring);
  const dotEye = ball(0.02, M.glow); dotEye.position.set(0, 0.73, 0.225); body.add(dotEye);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.2, 0.62, sz * 0.2); hip.rotation.y = Math.atan2(sx, sz); body.add(hip);
    // knee held out level with the hip, shin dropping to the sand: a spider's stance
    const a = limb(0.3, 0.025, M.joint); a.pivot.rotation.x = -1.4; hip.add(a.pivot);
    const b = limb(0.62, 0.022, M.shell); b.pivot.rotation.x = 1.05; a.end.add(b.pivot);
    const toe = ball(0.03, M.accent); b.end.add(toe);
    return { a, b, i };
  });
  return { root, update(t) {
    const w = t * 3;
    legs.forEach((l) => { const ph = w + [0, Math.PI, Math.PI, 0][l.i]; l.a.pivot.rotation.x = -1.4 - Math.max(0, Math.sin(ph)) * 0.3; l.a.pivot.rotation.z = Math.cos(ph) * 0.18; });
    body.position.y = Math.sin(w * 2) * 0.012; body.rotation.x = Math.sin(t * 0.6) * 0.04;
    const think = 0.5 + 0.5 * Math.sin(t * 1.6);
    (ring.material as THREE.MeshBasicMaterial).color.setHSL(0.5 - think * 0.05, 0.85, 0.55 + 0.25 * think);
    ring.scale.setScalar(0.95 + 0.08 * think);
    dotEye.position.x = Math.sin(t * 0.7) * 0.05;
  } };
}

const ROBOTS = [
  { name: 'ドット', en: 'DOT', text: '丸い画面の顔に点の目。表情で気持ちを伝える、いちばんアイコン的な姿。器用な三本指の手で道具を作り、背中の太陽電池で動く。', make: makeDot, scale: 1 },
  { name: 'カメマル', en: 'KAMEMARU', text: '甲羅が太陽電池。四本の脚は水に入るとヒレに変わる。大きな一つ目のレンズで、じっくり観察してから動く慎重派。', make: makeKame, scale: 1 },
  { name: 'ラッコ', en: 'RAKKO', text: 'ラッコのように石で貝を割り、背中で浮かんで眠る。器用な前脚で細かい作業が得意。尻尾のプロペラで泳ぐ。', make: makeOtter, scale: 1.25 },
  { name: 'ランタン', en: 'LANTERN', text: '箱の体に長い四本脚。顔は光の輪で、考えるときに明滅する。岩場も軽々と歩く、いちばんAIらしい抽象的な姿。', make: makeLantern, scale: 1 },
];
const bots = ROBOTS.map((r, i) => {
  const b = r.make(); b.root.scale.setScalar(r.scale);
  b.root.position.set((i - 1.5) * 1.35, 0, 0); b.root.rotation.y = -((i - 1.5) * 0.12);
  scene.add(b.root); return b;
});
let focus = -1, flyT = 0, flying = false;
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
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  bots.forEach((b) => b.update(t, dt));
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
