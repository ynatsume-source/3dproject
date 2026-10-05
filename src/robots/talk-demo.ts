// A demo of the four talking (talk.html): the campfire gathering at night, each line a meaning written in Lumau
// (grammar.ts), said in the speaker's own voice (voice.ts), with the island's letters in a bubble and subtitles in
// Japanese and English. The others turn to whoever is speaking and nod as the words reach them (models.ts talkBeat).
// The models are the design gallery's (plain three.js materials), so the page stands on its own.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { galleryKits } from './gallery-kit';
import type { Pose, Robot } from './models';
import { render, type Ids } from './lumau/grammar';
import { glyphs, kana, roman } from './islandlang';
import { speak, VOICES } from './lumau/voice';

type Who = 'dot' | 'lantern' | 'kame' | 'rakko';
const NAME: Record<Who, string> = { dot: 'ドット', lantern: 'ランタン', kame: 'カメマル', rakko: 'ラッコ' };
const NAME_EN: Record<Who, string> = { dot: 'Dot', lantern: 'Lantern', kame: 'Kamemaru', rakko: 'Rakko' };
const COLOR: Record<Who, string> = { dot: '#f0bd5c', lantern: '#6ccbdc', kame: '#7fcaa4', rakko: '#ec9b6e' };

/** The gathering: reports, a warning, and a plan changed by it. No feelings: what each saw, measured and will do. */
export const LINES: { who: Who; ids: Ids; ja: string; en: string }[] = [
  { who: 'dot', ids: ['everyone', ',', 'report', 'lets', '.'], ja: 'みんな、報告しよう。', en: "Everyone, let's report." },
  { who: 'dot', ids: ['me', 'topic', 'today', 'island', '#5', 'object', 'see', 'past', '.'], ja: '僕は今日、島を5つ見た。', en: 'I saw five islands today.' },
  { who: 'dot', ids: ['tomorrow', ',', '=sopunu', 'to', 'voyage', 'future', '.'], ja: '明日、ソプヌへ船出する。', en: 'Tomorrow I will sail to Sopunu.' },
  { who: 'lantern', ids: ['me', 'topic', 'pressure', 'object', 'measure', 'past', '.', 'pressure', 'topic', 'very', 'low', '.'], ja: '僕は気圧を測った。気圧はとても低い。', en: 'I measured the air pressure. It is very low.' },
  { who: 'lantern', ids: ['typhoon', 'come', 'quote', 'me', 'topic', 'think', '.'], ja: '台風が来ると僕は思う。', en: 'I think a typhoon is coming.' },
  { who: 'kame', ids: ['current', 'topic', 'north', 'to', 'go', 'ongoing', '.', 'wave', 'also', 'high', '.'], ja: '海流は北へ向かっている。波も高い。', en: 'The current is heading north. The waves are high too.' },
  { who: 'rakko', ids: ['me', 'topic', 'shell', '#7', 'object', 'gather', 'past', '.'], ja: '僕は貝殻を7つ集めた。', en: 'I gathered seven shells.' },
  { who: 'rakko', ids: ['reef', 'at', 'many', 'fish', 'there', '.'], ja: '礁に魚がたくさんいる。', en: 'There are many fish at the reef.' },
  { who: 'lantern', ids: ['typhoon', 'come', 'if', ',', 'voyage', 'not', 'please', '.'], ja: '台風が来るなら、船出しないでほしい。', en: "If a typhoon comes, please don't sail." },
  { who: 'dot', ids: ['agree', '.', 'me', 'topic', 'voyage', 'not', 'future', '.', 'hut', 'object', 'fix', 'future', '.'], ja: 'わかった。僕は船出しない。小屋を直す。', en: "Okay. I won't sail. I'll fix the hut." },
  { who: 'kame', ids: ['me', 'also', 'help', 'future', '.'], ja: '僕も手伝う。', en: "I'll help too." },
  { who: 'rakko', ids: ['me', 'also', '.'], ja: '僕も。', en: 'Me too.' },
  { who: 'dot', ids: ['night', 'topic', 'deep', '.', 'sleep', 'lets', '.'], ja: '夜は深い。寝よう。', en: "It's late. Let's sleep." },
  { who: 'lantern', ids: ['me', 'topic', 'star', 'object', 'record', 'future', '.'], ja: '僕は星を記録する。', en: "I'll record the stars." },
];

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;
const NIGHT = 0x0b1828;
scene.background = new THREE.Color(NIGHT); scene.fog = new THREE.FogExp2(NIGHT, 0.045);
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
camera.position.set(0, 1.9, 5.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.45, 0); controls.enableDamping = true; controls.minDistance = 2; controls.maxDistance = 12; controls.maxPolarAngle = Math.PI * 0.47; controls.enablePan = false;

// the night: moonlight from behind, a dim sky, the fire's warm light in the middle
const moon = new THREE.DirectionalLight(0xa8c0ff, 0.45); moon.position.set(-4, 6, -6); scene.add(moon);
scene.add(new THREE.HemisphereLight(0x2d4470, 0x1c140c, 0.45));
const fill = new THREE.DirectionalLight(0xffc89a, 0.35); fill.position.set(0, 2, 6); scene.add(fill);   // (the fire's light on their faces, from the watcher's side)
const fire = new THREE.PointLight(0xff9447, 9, 0, 1.6); fire.position.set(0, 0.45, 0); fire.castShadow = true; fire.shadow.mapSize.set(1024, 1024); fire.shadow.bias = -0.002; scene.add(fire);

const sandTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!;
  g.fillStyle = '#cdbb98'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const v = 190 + Math.random() * 45; g.fillStyle = `rgba(${v},${v - 14},${v - 42},0.35)`; g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 }));
ground.receiveShadow = true; scene.add(ground);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0f2e44, roughness: 0.08, metalness: 0.6 }));
sea.position.set(0, 0.02, -50); scene.add(sea);

// stars and the moon
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.asin(Math.random() * 0.95 + 0.05); pos.set([Math.cos(a) * Math.cos(e) * 90, Math.sin(e) * 90, Math.sin(a) * Math.cos(e) * 90], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.95 })));
  const m = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: 0xf3f0de, fog: false }));
  m.position.set(-30, 26, -70); m.lookAt(0, 0, 0); scene.add(m);
}

// the fire: a ring of stones, crossed driftwood, flames, a glow and rising sparks
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,190,110,0.9)'); r.addColorStop(0.35, 'rgba(255,130,50,0.35)'); r.addColorStop(1, 'rgba(255,100,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const flames: THREE.Mesh[] = [];
const sparks = (() => {
  const n = 40, pos = new Float32Array(n * 3), life = new Float32Array(n);
  for (let i = 0; i < n; i++) life[i] = Math.random();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffb35c, size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(p); return { p, pos, life, n, seed: Array.from({ length: n }, () => [Math.random() - 0.5, Math.random() - 0.5]) };
})();
{
  const stone = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.9 }), wood = new THREE.MeshStandardMaterial({ color: 0x6b5340, roughness: 0.9 });
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085 + (i % 3) * 0.015), stone); s.position.set(Math.cos(a) * 0.4, 0.045, Math.sin(a) * 0.4); s.rotation.set(i, i * 2, 0); s.castShadow = true; scene.add(s); }
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 8), wood); l.rotation.set(Math.PI / 2 - 0.35, i / 3 * Math.PI * 2, 0, 'YXZ'); l.position.y = 0.12; scene.add(l); }
  const add = (c: number, r: number, h: number, y: number) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); f.position.y = y + h / 2; scene.add(f); flames.push(f); };
  add(0xff6a1f, 0.19, 0.5, 0.08); add(0xff9a2e, 0.13, 0.42, 0.08); add(0xffd36b, 0.07, 0.28, 0.08);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); glow.scale.set(1.8, 1.8, 1); glow.position.y = 0.35; scene.add(glow);
}

// the four, sitting round the far side of the fire, facing it (and so the watcher)
const K = galleryKits();
const SEAT: { who: Who; make: () => Robot; ang: number; r: number; scale: number }[] = [
  { who: 'dot', make: K.makeDot, ang: 172, r: 1.6, scale: 1 },
  { who: 'lantern', make: K.makeLantern, ang: 124, r: 1.75, scale: 1 },
  { who: 'kame', make: K.makeKame, ang: 62, r: 1.65, scale: 1 },
  { who: 'rakko', make: K.makeRakko, ang: 12, r: 1.55, scale: 1.1 },
];
const bots = SEAT.map((s) => {
  const b = s.make(); b.root.scale.setScalar(s.scale);
  const a = s.ang * Math.PI / 180; b.root.position.set(Math.cos(a) * s.r, 0, -Math.sin(a) * s.r);
  b.root.rotation.y = Math.atan2(-b.root.position.x, -b.root.position.z);
  b.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  scene.add(b.root);
  const sit: Pose = { act: 'sit', walk: 0, night: 1 };
  for (let k = 0; k < 40; k++) b.update(k * 0.1, 0.1, sit);   // (settled at the fire)
  const box = new THREE.Box3().setFromObject(b.root);
  return { ...s, b, top: box.max.y };
});
const byWho = Object.fromEntries(bots.map((x) => [x.who, x])) as Record<Who, (typeof bots)[number]>;

/* ---------- the conversation ---------- */
let ctx: AudioContext | null = null, master: GainNode | null = null;
let idx = -1, lineAt = 0, lineEnd = 0, playing = false, pausedAt = 0;
const bubble = $('bubble'), sub = $('sub');
type Mode = 'both' | 'ja' | 'en' | 'none';
let mode: Mode = 'both';
function show(i: number) {
  const L = LINES[i], toks = render(L.ids), c = COLOR[L.who];
  bubble.style.setProperty('--c', c);
  bubble.innerHTML = `<div class="g">${glyphs(toks, 'gl')}</div><div class="r">${roman(toks)}</div>`;
  bubble.hidden = false;
  sub.style.setProperty('--c', c);
  sub.innerHTML = `<span class="who">${NAME[L.who]}<i>${NAME_EN[L.who]}</i></span><div class="k">${kana(toks)}</div>`
    + (mode === 'both' || mode === 'ja' ? `<div class="ja">${L.ja}</div>` : '') + (mode === 'both' || mode === 'en' ? `<div class="en">${L.en}</div>` : '');
  sub.hidden = mode === 'none' && false;
  document.querySelectorAll<HTMLElement>('#script li').forEach((li, k) => li.classList.toggle('on', k === i));
}
function say(i: number) {
  idx = i; const L = LINES[i];
  show(i);
  lineAt = performance.now() / 1000;
  lineEnd = ctx ? speak(ctx, render(L.ids), VOICES[L.who], master!) : ctx!.currentTime + 2;
}
function start() {
  if (!ctx) { ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
  ctx.resume(); $('intro').hidden = true; playing = true; $('pause').textContent = '一時停止';
  say(0);
}
$('go').onclick = start;
$('again').onclick = () => { if (!ctx) return start(); ctx.resume(); playing = true; $('pause').textContent = '一時停止'; say(0); };
$('pause').onclick = () => {
  if (!ctx) return;
  if (playing) { ctx.suspend(); pausedAt = performance.now(); playing = false; $('pause').textContent = '再開'; }
  else { ctx.resume(); lineAt += (performance.now() - pausedAt) / 1000; playing = true; $('pause').textContent = '一時停止'; }
};
const MODES: [Mode, string][] = [['both', '字幕：日本語＋English'], ['ja', '字幕：日本語'], ['en', '字幕：English'], ['none', '字幕：なし']];
$('mode').onclick = () => { const k = (MODES.findIndex((m) => m[0] === mode) + 1) % MODES.length; mode = MODES[k][0]; $('mode').textContent = MODES[k][1]; if (idx >= 0) show(idx); };
$('script').innerHTML = LINES.map((L) => `<li style="--c:${COLOR[L.who]}"><b>${NAME[L.who]}</b><span class="rm">${roman(render(L.ids))}</span><span>${L.ja}</span></li>`).join('');
document.querySelectorAll<HTMLElement>('#script li').forEach((li, k) => li.onclick = () => { if (!ctx) start(); ctx!.resume(); playing = true; $('pause').textContent = '一時停止'; say(k); });

/* ---------- each frame ---------- */
const v = new THREE.Vector3(), aim = new THREE.Vector3(0, 0.45, 0), clock = new THREE.Clock();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 50 : 36; camera.updateProjectionMatrix();
  // (a phone held upright: further back, so all four stay in the frame)
  const want = w < h ? 5.4 * Math.min(1.9, 1.15 * h / w) : 5.4; camera.position.sub(controls.target).setLength(want).add(controls.target); }
addEventListener('resize', resize); resize();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  // the next line, after a breath
  if (playing && ctx && idx >= 0 && ctx.currentTime > lineEnd + 0.75) {
    if (idx + 1 < LINES.length) say(idx + 1); else { playing = false; bubble.hidden = true; idx = LINES.length; $('pause').textContent = '一時停止'; }
  }
  const speaking = idx >= 0 && idx < LINES.length && ctx && ctx.currentTime < lineEnd + 0.4 ? LINES[idx].who : null;
  const lt = playing ? performance.now() / 1000 - lineAt : 0;
  for (const x of bots) {
    const s = speaking ? byWho[speaking] : null;
    const look = s && s !== x ? x.b.root.worldToLocal(v.set(s.b.root.position.x, s.top * 0.85, s.b.root.position.z)).toArray() as [number, number, number]
      : x.b.root.worldToLocal(v.set(0, 0.3, 0)).toArray() as [number, number, number];
    const pose: Pose = { act: 'sit', walk: 0, night: 1, look, beat: speaking ? { role: speaking === x.who ? 'speak' : 'listen', t: lt } : undefined };
    x.b.update(t, dt, pose);
  }
  // the fire flickers
  const fl = 0.85 + 0.1 * Math.sin(t * 13.1) + 0.07 * Math.sin(t * 7.3 + 1) + 0.05 * Math.sin(t * 23.7);
  fire.intensity = 9 * fl;
  flames.forEach((f, i) => { f.scale.set(1 + 0.08 * Math.sin(t * 9 + i), fl * (1 + 0.12 * Math.sin(t * 11 + i * 2)), 1 + 0.08 * Math.cos(t * 8 + i)); f.rotation.y = t * (0.6 + i * 0.3); });
  for (let i = 0; i < sparks.n; i++) {
    sparks.life[i] += dt * (0.35 + (i % 5) * 0.06); if (sparks.life[i] > 1) { sparks.life[i] = 0; sparks.seed[i] = [Math.random() - 0.5, Math.random() - 0.5]; }
    const k = sparks.life[i], [a, b] = sparks.seed[i];
    sparks.pos.set([a * 0.3 + Math.sin(t * 2 + i) * 0.08 * k, 0.25 + k * 1.8, b * 0.3 + Math.cos(t * 2.3 + i) * 0.08 * k], i * 3);
  }
  sparks.p.geometry.attributes.position.needsUpdate = true;
  // the camera leans a little toward whoever speaks
  if (speaking) { const s = byWho[speaking].b.root.position; aim.lerp(v.set(s.x * 0.35, 0.5, s.z * 0.35), Math.min(1, dt * 1.2)); }
  else aim.lerp(v.set(0, 0.45, 0), Math.min(1, dt * 0.8));
  controls.target.copy(aim); controls.update();
  renderer.render(scene, camera);
  // the bubble over the speaker's head
  if (speaking && !bubble.hidden) {
    const s = byWho[speaking]; v.set(s.b.root.position.x, s.top + 0.12, s.b.root.position.z).project(camera);
    const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    const w = bubble.offsetWidth, cx = Math.min(innerWidth - 12 - w / 2, Math.max(12 + w / 2, x));
    bubble.style.transform = `translate(${cx - w / 2}px, ${y - bubble.offsetHeight - 14}px)`;
    bubble.style.setProperty('--tail', `${x - (cx - w / 2)}px`);
    bubble.style.opacity = '1';
  } else bubble.style.opacity = '0';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).talkDemo = { get idx() { return idx; }, start };
