// Seaglass: pick a sea on the globe, dive, and drift with the drone. The sim clock lights every sea
// by its real sky; one click jumps to dawn / noon / dusk / night, and time can run faster than real.
import * as THREE from 'three';
import './styles.css';
import { U } from './render/common';
import { clamp, smooth, angDiff } from './core/math';
import { LOCATIONS, type Sea } from './data/locations';
import { oceanScene, sky, surface, grass, grassMat, grassGeo, snowGeo, snowMat, shafts, BLADES, SEG, SNOW, LIMIT } from './ocean/scenery';
import { buildOcean } from './ocean/build';
import { globeScene, gcam, ll2v, gv, updateGlobe, tweenGlobe, earthMat } from './globe';
import { clock, skyState, presetTime, localTimeString, SPEEDS, PRESET_LABEL, type Preset, setSeason, seasonOf, seaTemp, SEASON_LABEL, type Season } from './time/clock';
import { Director, type Shot } from './director';
import type { Subject } from './eco/env';
import NOSLEEP_MEDIA from 'nosleep.js/src/media.js';
import { guideThumbs } from './ui/thumbs';
import { PLACES } from './ui/places';
import { Post } from './render/post';
import { setAnisotropy } from './render/surface';
import { TIERS, detectTier, type Tier } from './quality';
import { audio, startAudio, stopAudio, setHum, crunch, setWhaleSong, setMood, setMusic } from './audio';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const canvas = $('scene') as HTMLCanvasElement;

let renderer: THREE.WebGLRenderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('err').hidden = false; throw e; }
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 460);
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
camera.rotation.order = 'YXZ';
const CELL = 40;

/* ================= state ================= */
type Ocean = ReturnType<typeof buildOcean>;
let cur: Ocean | null = null;
let mode: 'globe' | 'ocean' = 'globe';
const oceans: Record<string, Ocean> = {};
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lampOn = false, lampManual = false, hudOn = true, busy = false;
const forcedTier = new URLSearchParams(location.search).get('tier') as Tier | null;
let tier: Tier = forcedTier && forcedTier in TIERS ? forcedTier : detectTier(renderer.getContext());
const post = new Post(TIERS[tier]);

/* ================= drone ================= */
const drone = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: -0.08, roll: 0, mode: 'auto' as 'auto' | 'manual', s: 0.4, lastInput: -1e9 };
function pathXZ(s: number): [number, number] { return [110 * Math.sin(s * 0.9) + 22 * Math.sin(s * 2.3 + 1), -8 + 88 * Math.sin(s * 0.6 + 0.8) + 20 * Math.cos(s * 1.7)]; }
function pathAlt(s: number) {
  const a = 3.4 + 2.0 * Math.sin(s * 3.1) + 1.2 * Math.sin(s * 7.3 + 2);
  return Math.max(1.8, a) + Math.pow(Math.max(0, Math.sin(s * 1.13 + 0.5)), 8) * 10;
}
function pathPoint(s: number, out: THREE.Vector3) { const [x, z] = pathXZ(s); return out.set(x, Math.min(cur!.T.top(x, z) + pathAlt(s), -1.4), z); }
function pathRate(s: number) { const a = pathXZ(s), b = pathXZ(s + 0.001); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.001; }
function nearestS(p: THREE.Vector3) {
  let best = drone.s, bd = Infinity;
  for (let i = 0; i < 2400; i++) { const s = i * 0.02; const [x, z] = pathXZ(s); const d = (x - p.x) ** 2 + (z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}
const director = new Director();
let lastShot: Shot | null = null;
function onShotChange(prev: Shot | null, next: Shot | null) {
  if (next) {
    $('tMode').textContent = 'OBSERVING';
    $('hint').textContent = `観察中：${next.subject.label}（${next.subject.status()}）`;
    recordLog('observe', `${next.subject.label}を観察（${next.subject.status()}）`);
  } else {
    if (prev && drone.mode === 'auto') drone.s = nearestS(drone.pos);
    if (drone.mode === 'auto') setMode('auto');
  }
}
const keys = new Set<string>(), joy = { x: 0, y: 0 }, vert = { v: 0 };
const _t = new THREE.Vector3(), _a = new THREE.Vector3(), _i = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
let yawRate = 0, interestW = 0;
function findInterest(cam: THREE.Vector3, fwd: THREE.Vector3) {
  let best = Infinity;
  const tmp = new THREE.Vector3();
  for (const f of cur!.fish) if (f.sp.big) { const d = f.nearestPos(cam, fwd, 26, tmp); if (d < best) { best = d; _i.copy(tmp); } }
  for (const t of cur!.turtles) { const d = t.pos.distanceTo(cam); if (d < 26 && d < best && _w.subVectors(t.pos, cam).dot(fwd) > 0) { best = d; _i.copy(t.pos); } }
  for (const m of cur!.mantas) { const d = m.pos.distanceTo(cam); if (d < 30 && d < best && _w.subVectors(m.pos, cam).dot(fwd) > 0) { best = d; _i.copy(m.pos); } }
  return best < Infinity;
}
function updateDrone(dt: number, now: number) {
  const prevYaw = drone.yaw, t = U.uTime.value;
  const shot = drone.mode === 'auto' ? director.update(dt, drone.pos, () => cur!.eco.subjects(), cur!.T.top) : null;
  if (shot !== lastShot) { onShotChange(lastShot, shot); lastShot = shot; }
  if (shot) {
    // glide to the viewpoint and keep the subject framed
    _v.subVectors(shot.pos, drone.pos);
    const L = _v.length(), top = shot.phase === 'approach' ? (shot.forced ? Math.min(7, 2.4 + L * 0.1) : 2.4) : 0.9;   // sent somewhere far: travel faster
    _v.multiplyScalar(Math.min(top, L * 0.8) / Math.max(L, 1e-4));
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.2));
    const lx = shot.look.x - camera.position.x, ly = shot.look.y - camera.position.y, lz = shot.look.z - camera.position.z;
    const k = Math.min(1, dt * (shot.phase === 'approach' ? 0.9 : 1.6));
    drone.yaw += angDiff(Math.atan2(-lx, -lz), drone.yaw) * k;
    drone.pitch += (Math.atan2(ly, Math.hypot(lx, lz)) - drone.pitch) * k;
  } else if (drone.mode === 'auto') {
    const hasI = findInterest(drone.pos, U.uCamFwd.value);
    interestW += ((hasI ? 1 : 0) - interestW) * Math.min(1, dt * 0.6);
    const speed = 1.35 - interestW * 0.5;
    drone.s += speed * dt / Math.max(pathRate(drone.s), 1e-3);
    pathPoint(drone.s, _t);
    _v.subVectors(_t, drone.pos);
    const L = _v.length(); _v.multiplyScalar(Math.min(L * 1.4, L > 6 ? 4.5 : 3) / Math.max(L, 1e-4));
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.5));
    pathPoint(drone.s + 9 / Math.max(pathRate(drone.s), 1e-3), _a);
    const dx = _a.x - drone.pos.x, dz = _a.z - drone.pos.z, dy = _a.y - drone.pos.y;
    let wantYaw = Math.atan2(-dx, -dz) + (Math.sin(t * 0.09) * 0.45 + Math.sin(t * 0.031 + 1) * 0.3) * (1 - interestW);
    let wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) * 0.6 - 0.1 + Math.sin(t * 0.07) * 0.12;
    if (interestW > 0.01 && hasI) {
      const ix = _i.x - drone.pos.x, iz = _i.z - drone.pos.z, iy = _i.y - drone.pos.y;
      wantYaw += angDiff(Math.atan2(-ix, -iz), wantYaw) * interestW * 0.8;
      wantPitch += (Math.atan2(iy, Math.hypot(ix, iz)) - wantPitch) * interestW * 0.7;
    }
    drone.yaw += angDiff(wantYaw, drone.yaw) * Math.min(1, dt * 0.7);
    drone.pitch += (wantPitch - drone.pitch) * Math.min(1, dt * 0.7);
  } else {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + joy.y;
    const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + joy.x;
    const u = (keys.has('KeyE') || keys.has('Space') ? 1 : 0) - (keys.has('KeyQ') || keys.has('KeyC') ? 1 : 0) + vert.v;
    if (keys.has('ArrowLeft')) drone.yaw += dt * 1.2;
    if (keys.has('ArrowRight')) drone.yaw -= dt * 1.2;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1;
    const cp = Math.cos(drone.pitch), sy = Math.sin(drone.yaw), cy = Math.cos(drone.yaw);
    _v.set(-sy * cp * f + cy * r, Math.sin(drone.pitch) * f + u, -cy * cp * f - sy * r);
    if (_v.lengthSq() > 1) _v.normalize();
    _v.multiplyScalar(2.2 * boost);
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.8));
    if (now - drone.lastInput > 90000) setMode('auto');
  }
  // look ahead along the way we are moving and start climbing well before a rock or coral head
  const G = cur!.T.ground, hs = Math.hypot(drone.vel.x, drone.vel.z);
  if (hs > 0.05) {
    let ahead = -1e9;
    for (const s of [0.5, 1.0, 1.6, 2.4]) ahead = Math.max(ahead, G(drone.pos.x + drone.vel.x * s, drone.pos.z + drone.vel.z * s));
    const want = ahead + 1.0;
    if (drone.pos.y < want) drone.vel.y = Math.max(drone.vel.y, Math.min(1.6, (want - drone.pos.y) * 1.1));
  }
  drone.pos.addScaledVector(drone.vel, dt);
  // keep a clear bubble: the floor is the highest ground in a ring around the camera, not just under it,
  // and we rise onto it smoothly rather than popping up
  let fh = G(drone.pos.x, drone.pos.z);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; fh = Math.max(fh, G(drone.pos.x + Math.cos(a) * 0.7, drone.pos.z + Math.sin(a) * 0.7) - 0.25); }
  if (drone.pos.y < fh + 0.75) {
    drone.pos.y = Math.max(fh + 0.35, drone.pos.y + (fh + 0.75 - drone.pos.y) * Math.min(1, dt * 6));
    if (drone.vel.y < 0) drone.vel.y *= 0.5;
  }
  // the cave massif is solid in 3D: slide along its walls, roof and the rims of its skylights
  const cave = cur!.cave;
  if (cave) for (let it = 0; it < 2; it++) {
    const d = cave.sd(drone.pos.x, drone.pos.y, drone.pos.z);
    if (d >= 0.8) break;
    cave.grad(drone.pos.x, drone.pos.y, drone.pos.z, _w);
    drone.pos.addScaledVector(_w, 0.8 - d);
    const vn = drone.vel.dot(_w); if (vn < 0) drone.vel.addScaledVector(_w, -vn);
  }
  if (drone.pos.y > -0.7) { drone.pos.y = -0.7; if (drone.vel.y > 0) drone.vel.y = 0; }
  drone.pos.x = clamp(drone.pos.x, -LIMIT, LIMIT); drone.pos.z = clamp(drone.pos.z, -LIMIT, LIMIT);
  drone.pitch = clamp(drone.pitch, -1.25, 1.25);
  yawRate += (angDiff(drone.yaw, prevYaw) / Math.max(dt, 1e-3) - yawRate) * Math.min(1, dt * 3);
  drone.roll += (-yawRate * 0.18 - drone.roll) * Math.min(1, dt * 2);
  camera.position.copy(drone.pos); camera.position.y += Math.sin(t * 0.8) * 0.04;
  camera.rotation.set(drone.pitch + Math.sin(t * 0.6) * 0.008, drone.yaw, drone.roll + Math.sin(t * 0.45) * 0.01);
}

/* ================= sky from the clock ================= */
let skyNow = null as ReturnType<typeof skyState> | null;
const _starDir = new THREE.Vector3(0.12, 0.98, 0.16).normalize(), _nightShaft = new THREE.Color(0.5, 0.74, 1.0), _nightTint = new THREE.Color(0.8, 0.88, 1.0);
let nightLift = 0;
let camCave = 1, camExpo = 1.4;   // how much open sky the camera sees (1 outside the cave), and exposure
// the lamp comes on by itself in the dark of the cave (at night the moon or starlight is enough)
function wantLamp() { return camCave < 0.3; }
function applySky(loc: Sea) {
  const s = skyState(clock.ms, loc);
  skyNow = s;
  U.uSunDir.value.set(...s.sunDir);
  U.uSunI.value = s.sunI; U.uAmb.value = s.amb; U.uNight.value = s.night;
  U.uTint.value.setRGB(...s.tint);
  U.uShaftCol.value.setRGB(...s.shaftCol); U.uShaftI.value = s.shaftI; U.uGolden.value = s.golden;
  // Night as a low-light camera would dream it: the moon becomes a silver-blue key light with its own
  // shafts and caustics, the water keeps a deep blue glow, and even a moonless night stays legible.
  // (Rendering only: the animals still live by the real darkness in s.)
  // Without the moon, starlight takes its place (a little brighter than real), coming from high overhead,
  // so every hour of the night reads the same way rather than going black before moonrise.
  const n = s.night, moon = s.moonI, glow = n * (0.8 + 0.2 * moon);
  U.uAmb.value = s.amb + glow * 0.6;
  U.uSunI.value = Math.max(s.sunI, n * (0.45 + 0.25 * moon));
  U.uShaftI.value = Math.max(s.shaftI, n * (0.2 + 0.4 * moon));
  const starlit = n * Math.max(0, 1 - moon / 0.3);
  if (starlit > 0) U.uSunDir.value.lerp(_starDir, starlit).normalize();
  U.uShaftCol.value.lerp(_nightShaft, n);
  U.uTint.value.lerp(_nightTint, n);   // moonlight is only a little bluer than sunlight; keep the reef's colours
  nightLift = n;
  U.uSkyLo.value.setRGB(...s.skyLo); U.uSkyHi.value.setRGB(...s.skyHi);
  U.uMoonDir.value.set(...s.moonDir); U.uMoonI.value = s.moonI;
  // tidal stream: flood one way, ebb the other; strongest mid-tide
  const k = clamp(s.tideRate / (loc.tide.amp * 0.00016 + 1e-6), -1, 1);
  const ax = loc.tide.axis;
  U.uCurrent.value.set(ax[0] * k * 0.8 + 0.12, ax[1] * k * 0.8 + 0.05);
  setMood({ phase: s.phase, night: s.night, twilight: s.twilight, sea: loc.id });
  if (!lampManual) setLamp(wantLamp(), false);
  cur!.eco.setSky(s, U.uCurrent.value);
  if (s.phase !== lastPhase) { if (lastPhase) seaLog('phase', PHASE_LOG[s.phase]); lastPhase = s.phase; }
}
const PHASE_LOG: Record<string, string> = {
  dawn: '夜明け。夜行性の魚が岩陰へ戻り、昼の魚たちが動き出す',
  noon: '日中。小魚がプランクトンを食べに群れ、光の筋がいちばん強い時間',
  dusk: '夕暮れ。昼の魚が寝床へ向かい、捕食者がいちばん活発になる時間',
  night: '夜。昼の魚はサンゴの隙間で眠り、夜行性の魚とプランクトンが上がってくる',
};
let lastPhase = '';

/* ---------- today's sea: a per-day journal of what happened ---------- */
interface LogEntry { ms: number; kind: string; text: string }
let dayLog: LogEntry[] = [], dayKey = '', logSaveT = 0;
const LOG_KIND: Record<string, string> = { phase: '時間', sighting: '発見', observe: '観察', hunt: '狩り', catch: '捕食', breathe: '息継ぎ', whale: 'クジラ', rest: '休息', manta: '採餌' };
function localDate(ms: number, tz: number) { const d = new Date(ms + tz * 3600000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
function ensureDay() {
  const key = `seaglass.log.${cur!.loc.id}.${localDate(clock.ms, cur!.loc.tz)}`;
  if (key === dayKey) return;
  saveLog();
  dayKey = key;
  try { dayLog = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { dayLog = []; }
}
function saveLog() { if (!dayKey) return; try { localStorage.setItem(dayKey, JSON.stringify(dayLog.slice(-300))); } catch (e) { /* storage full or blocked */ } }
function recordLog(kind: string, text: string) {
  if (!cur) return;
  ensureDay();
  let last: LogEntry | undefined;
  for (let i = dayLog.length - 1; i >= 0 && !last; i--) if (dayLog[i].text === text) last = dayLog[i];
  if (last && Math.abs(clock.ms - last.ms) < 120000) return;
  dayLog.push({ ms: clock.ms, kind, text });
  if (dayLog.length > 300) dayLog.splice(0, dayLog.length - 300);
  const now = performance.now();
  if (now - logSaveT > 5000) { logSaveT = now; saveLog(); }
  if (!guideEl.hidden && panelTab === 'log') renderGuide();
}
addEventListener('pagehide', saveLog);

/* ---------- sea log: what is happening around the drone ---------- */
type Where = () => { x: number; y: number; z: number } | null;
const logQueue: { text: string; at?: Where }[] = [];
const recent = new Map<string, number>();
let logShownAt = -1e9;
function seaLog(kind: string, text: string, at?: Where) {
  recordLog(kind, text);
  const now = performance.now();
  if ((recent.get(text) ?? -1e9) > now - 90000) return;
  recent.set(text, now);
  if (kind === 'phase') logQueue.unshift({ text }); else if (logQueue.length < 3) logQueue.push({ text, at });
}
function pumpLog(now: number) {
  if (!logQueue.length || now - logShownAt < 9000 || $('toast').classList.contains('on')) return;
  logShownAt = now;
  const e = logQueue.shift()!;
  showToast('SEA LOG', e.text, '');
  markAt = e.at || null; markText = e.text; markUntil = now + 9000;
  $('toast').classList.toggle('go', !!markAt);
}
// the marker: where the event in the caption is happening
let markAt: Where | null = null, markText = '', markUntil = 0;
const _mk = new THREE.Vector3();
function updateMarker(now: number) {
  const el = $('evMark');
  const p = markAt && now < markUntil ? markAt() : null;
  if (!p) { if (!el.hidden) { el.hidden = true; $('toast').classList.remove('go'); } return; }
  _mk.set(p.x, p.y, p.z).project(camera);
  const w = innerWidth, h = innerHeight, behind = _mk.z > 1;
  let sx = (_mk.x * 0.5 + 0.5) * w, sy = (-_mk.y * 0.5 + 0.5) * h;
  if (behind) { sx = w - sx; sy = h - sy; }
  const m = 36, off = behind || sx < m || sy < m || sx > w - m || sy > h - m;
  if (off) {
    // pin to the edge, pointing the way
    const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy, k = Math.min((cx - m) / Math.max(Math.abs(dx), 1e-3), (cy - m) / Math.max(Math.abs(dy), 1e-3));
    sx = cx + dx * k; sy = cy + dy * k;
    el.style.setProperty('--rot', `${Math.atan2(dy, dx) * 180 / Math.PI - 45}deg`);
  }
  el.classList.toggle('edge', off);
  el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
  el.hidden = false;
}
function goToEvent() {
  if (!markAt || !cur) return;
  const at = markAt, text = markText;
  focusOn({ key: 'focus:event', label: text.replace(/[。、].*$/, ''), kind: 'big', prio: 5, size: 1.5, pos: () => at(), status: () => '', live: () => !!at() });
}
$('evMark').onclick = goToEvent;
$('toast').addEventListener('click', goToEvent);

/* ---------- take me to it ---------- */
function focusOn(s: Subject) {
  if (!cur) return;
  if (drone.mode !== 'auto') setMode('auto');
  director.focus(s, drone.pos);
  lastShot = null;
}
function goTo(id: string) {
  if (!cur) return;
  const oc = cur, cam = drone.pos, near = <T extends { pos: THREE.Vector3 }>(a: T[]) => a.reduce((b, c) => (c.pos.distanceTo(cam) < b.pos.distanceTo(cam) ? c : b));
  const loc = oc.loc, name = guideEntries(loc).find((e) => e.id === id)?.ja ?? (id === 'cave' ? '海底洞窟' : '');
  let s: Subject | null = null;
  const place = id.startsWith('place:') ? (PLACES[loc.id] || []).find((p) => 'place:' + p.id === id) : null;
  if (place) {
    const f = place.find(oc, cam);
    if (f) s = { key: id, label: place.ja, kind: 'big', prio: 5, size: f.size, pos: () => f.pos, status: () => '', live: () => true };
    if (!f) { showToast('見つかりません', `${place.ja}は近くにないようです`, ''); return; }
    focusOn(s!); showToast('向かっています', place.ja, '');
    if (isTouch || innerWidth < 900) { guideEl.hidden = true; renderGuide(); }
    return;
  }
  if (id === 'cave') s = oc.eco.subjects().find((x: Subject) => x.kind === 'cave') ?? null;
  else if (id === 'turtle' && oc.turtles.length) { const t = near(oc.turtles as any[]); s = { key: 'focus:turtle', label: name, kind: 'turtle', prio: 5, size: 1.2 * t.size, pos: () => t.pos, status: () => statusOf('turtle'), live: () => true }; }
  else if (id === 'manta' && oc.mantas.length) { const m = oc.mantas[0]; s = { key: 'focus:manta', label: name, kind: 'manta', prio: 5, size: 4, pos: () => m.pos, status: () => statusOf('manta'), live: () => true }; }
  else if (id === 'octopus' && oc.octopi?.length) { const o = near(oc.octopi as any[]); s = { ...o.subject, key: 'focus:octopus', prio: 5 }; }
  else if (id === 'eel' && oc.colonies.length) { const c = near(oc.colonies as any[]); const p = c.pos.clone(); p.y += 0.4; s = { key: 'focus:eel', label: name, kind: 'anemone', prio: 5, size: 1.5, pos: () => p, status: () => statusOf('eel'), live: () => true }; }
  else if (id === 'whale') {
    const W = oc.whales;
    if (!W || !W.seasonal) { showToast('ザトウクジラ', '今は北の海にいます', '冬（12月下旬〜4月上旬）に来遊。時刻パネルの「季節」で冬を選ぶと会えます'); return; }
    if (!W.active) { W.force = true; W.next = 0; }
    s = { key: 'focus:whale', label: name, kind: 'giant', prio: 5, size: 8, pos: () => (W.active ? W.pod[0].pos : null), status: () => statusOf('whale'), live: () => true };
  } else {
    const f = oc.fish.find((x: any) => x.sp.id === id);
    s = f ? f.focus(cam) : null;
  }
  if (!s) { showToast('見つかりません', `${name}は近くにいないようです`, ''); return; }
  focusOn(s);
  showToast('向かっています', `${name}のところへ`, '');
  if (isTouch || innerWidth < 900) { guideEl.hidden = true; renderGuide(); }
}
function showToast(k: string, t: string, s: string) {
  $('toastK').textContent = k; $('toastT').textContent = t; $('toastS').textContent = s; $('toast').classList.remove('go');
  $('toast').classList.add('on'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => $('toast').classList.remove('on'), 5200);
}

/* ================= HUD ================= */
const strip = $('strip');
{
  const PX = 2, frag = document.createDocumentFragment(), names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -360; d <= 720; d += 15) {
    const x = (d + 360) * PX, dd = ((d % 360) + 360) % 360;
    const tk = document.createElement('div'); tk.className = 'tk' + (dd % 45 === 0 ? ' major' : ''); tk.style.left = x + 'px'; frag.appendChild(tk);
    if (dd % 45 === 0) { const lb = document.createElement('div'); lb.className = 'lb' + (dd % 90 === 0 ? ' card' : ''); lb.style.left = x + 'px'; lb.textContent = names[dd]; frag.appendChild(lb); }
  }
  strip.appendChild(frag);
}
const compassEl = $('compass');
function updateHud() {
  const loc = cur!.loc, s = skyNow!;
  const depth = -drone.pos.y + s.tideH, alt = drone.pos.y - cur!.T.ground(drone.pos.x, drone.pos.z);
  $('tDepth').textContent = depth.toFixed(1);
  $('tAlt').textContent = alt.toFixed(1);
  $('tSpd').textContent = drone.vel.length().toFixed(2);
  $('tTemp').textContent = ((loc.tempYear ? seaTemp(clock.ms, loc.lat, loc.tempYear) : loc.temp) - depth * 0.04 + Math.sin(U.uTime.value * 0.05) * 0.05).toFixed(1);
  $('tVis').textContent = (3 / (U.uFogDen.value * (1 + 0.15 * s.night)) * 0.3).toFixed(0);
  $('tTide').textContent = (s.tideH >= 0 ? '+' : '') + s.tideH.toFixed(1);
  $('tTideDir').textContent = Math.abs(s.tideRate) < 0.000015 ? (s.tideH > 0 ? '満潮' : '干潮') : s.tideRate > 0 ? '上げ潮' : '下げ潮';
  const hdg = ((-drone.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('hdgnum').textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°';
  strip.style.transform = `translateX(${-(hdg + 360) * 2 + compassEl.clientWidth / 2}px)`;
  if (lastShot) $('hint').textContent = `観察中：${lastShot.subject.label}（${lastShot.subject.status()}）`;
  updateTimeUi();
}
function updateTimeUi() {
  if (!cur || !skyNow) return;
  const loc = cur.loc, s = skyNow;
  $('clockTime').textContent = localTimeString(clock.ms, loc.tz);
  $('clockPhase').textContent = s.phaseLabel;
  $('clockMoon').textContent = `${s.moonName}（月齢 ${s.moonAge.toFixed(0)}）`;
  $('clockMode').textContent = clock.live ? '実時間' : SPEEDS.find((x) => x.k === clock.speed)?.label ?? `×${clock.speed}`;
  $('btnTime').classList.toggle('live', clock.live);
  document.querySelectorAll<HTMLButtonElement>('#timePanel [data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(!clock.live && clock.speed === +b.dataset.speed!)));
  $('btnLive').setAttribute('aria-pressed', String(clock.live));
  const ld = new Date(clock.ms + loc.tz * 3600000);
  $('clockDate').textContent = `${ld.getUTCMonth() + 1}月${ld.getUTCDate()}日・${SEASON_LABEL[seasonOf(clock.ms, loc.lat, loc.tz)]}`;
  document.querySelectorAll<HTMLButtonElement>('#timePanel [data-season]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.season === clock.season)));
  document.querySelectorAll<HTMLButtonElement>('#timePanel [data-preset]').forEach((b) => b.classList.toggle('now', b.dataset.preset === s.phase));
}

/* ---------- field guide ---------- */
let seen = new Set<string>();
try { seen = new Set(JSON.parse(localStorage.getItem('seaglass.seen') || '[]')); } catch (e) { /* storage unavailable */ }
const guideEl = $('guide');
const TURTLE_STATE: Record<string, string> = { travel: '泳いでいる', graze: '食事中', toRest: '寝床へ向かっている', rest: '岩陰で眠っている', breathe: '息継ぎに浮上中' };
function statusOf(id: string): string {
  if (!cur) return '';
  const f = cur.fish.find((x: any) => x.sp.id === id);
  if (f) return f.status();
  if (id === 'turtle' && cur.turtles.length) { const t = cur.turtles.reduce((a: any, b: any) => (a.pos.distanceTo(drone.pos) < b.pos.distanceTo(drone.pos) ? a : b)); return TURTLE_STATE[t.state] || ''; }
  if (id === 'whale') { const W = cur.whales; return W?.active ? (W.pod.length > 1 ? '親子で泳いでいる' : '悠々と泳いでいる') : W?.seasonal ? '近くの海で子育て中' : '今は北の海にいる（冬に来遊）'; }
  if (id === 'manta' && cur.mantas.length) return cur.mantas[0].feeding ? 'プランクトンを食べている' : 'クリーニングステーションを回っている';
  if (id === 'octopus' && cur.octopi?.length) { const o = cur.octopi.reduce((a: any, b: any) => (a.pos.distanceTo(drone.pos) < b.pos.distanceTo(drone.pos) ? a : b)); return o.subject.status(); }
  if (id === 'eel') return U.uNight.value > 0.5 ? '巣穴に引っ込んでいる' : '体を出して餌を待っている';
  return '';
}
const guideEntries = (loc: Sea) => [...loc.species.map((s) => ({ id: s.id, ja: s.ja, sci: s.sci, note: s.note })), ...(loc.extraGuide || [])];
let panelTab: 'guide' | 'log' = 'guide';
function renderLog() {
  const loc = cur!.loc;
  ensureDay();
  const d = new Date(clock.ms + loc.tz * 3600000);
  const count = (k: string) => dayLog.filter((e) => e.kind === k).length;
  const chips = [['発見', count('sighting')], ['観察', count('observe')], ['狩り', count('hunt')], ['捕食', count('catch')], ['息継ぎ', count('breathe')]]
    .map(([k, v]) => `<span><b>${v}</b>${k}</span>`).join('');
  const rows = dayLog.slice().reverse().map((e) => e.kind === 'phase'
    ? `<li class="ph"><time>${localTimeString(e.ms, loc.tz)}</time><p>${e.text}</p></li>`
    : `<li><time>${localTimeString(e.ms, loc.tz)}</time><span class="kd k-${e.kind}">${LOG_KIND[e.kind] || e.kind}</span><p>${e.text}</p></li>`).join('');
  return `<h2>今日の${loc.name} <span>現地 ${d.getUTCMonth() + 1}月${d.getUTCDate()}日</span></h2>
    <div class="sum">${chips}</div>
    ${rows ? `<ol class="log">${rows}</ol>` : '<p class="empty">まだ記録はありません。ドローンが出来事に出会うと、ここに時刻つきで残ります。</p>'}`;
}
function renderGuide() {
  if (!cur) return;
  const loc = cur.loc, list = guideEntries(loc);
  const n = list.filter((e) => seen.has(loc.id + ':' + e.id)).length;
  $('seenCount').textContent = `${n}/${list.length}`;
  $('btnGuide').setAttribute('aria-pressed', String(!guideEl.hidden && panelTab === 'guide'));
  $('btnLog').setAttribute('aria-pressed', String(!guideEl.hidden && panelTab === 'log'));
  if (guideEl.hidden) return;
  const tabs = `<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="guide" aria-selected="${panelTab === 'guide'}">図鑑 <kbd>Z</kbd></button><button type="button" role="tab" data-tab="log" aria-selected="${panelTab === 'log'}">今日の海 <kbd>J</kbd></button></div>`;
  const scroll = guideEl.scrollTop;
  if (panelTab === 'log') { guideEl.innerHTML = tabs + renderLog(); guideEl.scrollTop = scroll; return; }
  const thumbs = guideThumbs(loc, list.map((e) => e.id));
  guideEl.innerHTML = tabs + `<h2>${loc.name}の生きもの <span>${n} / ${list.length} 発見</span></h2>
    <h3>行き先</h3>
    <ul class="places">${cur.cave ? `<li class="benthic"><i></i><b>海底洞窟</b><p>石灰岩の根を貫くトンネル。天井の穴から光の柱が差し込み、昼はネムリブカが奥で休んでいる。</p><button class="go" type="button" data-go="cave">洞窟へ行く</button></li>` : ''}${(PLACES[loc.id] || []).map((pl) => `<li class="benthic"><i></i><b>${pl.ja}</b><p>${pl.note}</p><button class="go" type="button" data-go="place:${pl.id}">行ってみる</button></li>`).join('')}</ul>
    <h3>生きもの</h3>
    <ul>${list.map((e) => `<li class="${seen.has(loc.id + ':' + e.id) ? 'seen' : ''}">${thumbs[e.id] ? `<img class="pic" src="${thumbs[e.id]}" alt="">` : ''}<i></i><b>${e.ja}</b><em>${e.sci}</em><span class="st">いま：${statusOf(e.id)}</span><p>${e.note}</p><button class="go" type="button" data-go="${e.id}">会いに行く</button></li>`).join('')}</ul>
    <h3>サンゴと底生生物</h3>
    <ul>${loc.benthic.map(([ja, sci, note]) => `<li class="benthic"><i></i><b>${ja}</b><em>${sci}</em><p>${note}</p></li>`).join('')}</ul>`;
  guideEl.scrollTop = scroll;
}
guideEl.addEventListener('click', (e) => {
  const g = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
  if (g) { goTo(g.dataset.go!); return; }
  const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
  if (b) { panelTab = b.dataset.tab as 'guide' | 'log'; guideEl.scrollTop = 0; renderGuide(); }
});
let toastTimer = 0;
function discover(e?: { id: string; ja: string; sci: string }) {
  if (!e || !cur) return;
  const key = cur.loc.id + ':' + e.id;
  if (seen.has(key)) return;
  seen.add(key);
  try { localStorage.setItem('seaglass.seen', JSON.stringify([...seen])); } catch (err) { /* ignore */ }
  showToast('NEW SIGHTING', e.ja, e.sci);
  recordLog('sighting', `${e.ja}を初めて見つけた`);
  renderGuide();
}
function checkSightings() {
  const cam = drone.pos, fwd = U.uCamFwd.value, loc = cur!.loc;
  for (const f of cur!.fish) if (f.nearest(cam, fwd, f.sp.big ? 16 : (f.sp.habitat === 'anemone' ? 5 : 9)) < Infinity) discover(f.sp);
  const extra = (id: string) => (loc.extraGuide || []).find((e) => e.id === id);
  const inView = (p: THREE.Vector3, maxD: number) => { _w.subVectors(p, cam); const d = _w.length(); return d < maxD && _w.dot(fwd) / d > 0.55; };
  if (cur!.turtles.some((t) => inView(t.pos, 16))) discover(extra('turtle'));
  if (cur!.mantas.some((m) => inView(m.pos, 22))) discover(extra('manta'));
  if (cur!.colonies.some((c) => inView(c.pos, 13))) discover(extra('eel'));
  if ((cur!.octopi || []).some((o: any) => o.placed && inView(o.pos, 10))) discover(extra('octopus'));
  const W = cur!.whales;
  if (W && W.active && W.pod.some((w: any) => inView(w.pos, 45))) discover(extra('whale'));
}

/* ================= globe UI ================= */
const fmtLL = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
const pinEls = LOCATIONS.map((loc, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pin';
  b.innerHTML = `<i></i><span>${loc.name}<small id="pinTime${i}"></small></span>`;
  b.setAttribute('aria-label', `${loc.name} ${loc.site} へ潜る`);
  b.onclick = () => dive(loc);
  b.onmouseenter = () => setHot(i); b.onmouseleave = () => setHot(-1);
  $('pins').appendChild(b); return b;
});
const cardEls = LOCATIONS.map((loc, i) => {
  const li = document.createElement('li');
  const chips = [...loc.species.filter((s) => s.big || s.habitat === 'anemone').map((s) => s.ja), ...(loc.extraGuide || []).map((s) => s.ja)].slice(0, 5);
  li.innerHTML = `<button type="button" class="loc">
    <span class="rg">${loc.region}</span>
    <span class="nm">${loc.name}<small>${loc.site}</small></span>
    <span class="meta"><span>${fmtLL(loc.lat, loc.lon)}</span><span>水深 ${loc.depth}</span><span>透明度 約${loc.vis} m</span><span>水温 ${loc.temp.toFixed(0)}°C</span></span>
    <span class="now" id="cardNow${i}"></span>
    <span class="bl">${loc.blurb}</span>
    <span class="chips">${chips.map((c) => `<span>${c}</span>`).join('')}</span>
    <span class="go">この海へ潜る →</span></button>`;
  const b = li.firstElementChild as HTMLButtonElement;
  b.onclick = () => dive(loc);
  b.onmouseenter = () => { setHot(i); if (!gv.tween) focusLoc(loc); };
  b.onmouseleave = () => setHot(-1);
  b.onfocus = () => setHot(i);
  $('locList').appendChild(li); return b;
});
function setHot(i: number) {
  earthMat.uniforms.uHot.value = i;
  pinEls.forEach((p, k) => p.classList.toggle('hot', k === i));
  cardEls.forEach((c, k) => c.classList.toggle('hot', k === i));
}
function focusLoc(loc: Sea) { gv.lastUser = performance.now(); tweenGlobe(clamp(loc.lat, -60, 60), loc.lon, gv.dist, 1100); }
const _pp = new THREE.Vector3();
function updatePins() {
  const w = innerWidth, h = innerHeight, cd = gcam.position.clone().normalize();
  LOCATIONS.forEach((loc, i) => {
    const p = ll2v(loc.lat, loc.lon, 1.0);
    _pp.copy(p).project(gcam);
    const el = pinEls[i];
    el.style.transform = `translate(${(_pp.x * 0.5 + 0.5) * w - 7}px, ${(-_pp.y * 0.5 + 0.5) * h - 11}px)`;
    el.classList.toggle('back', p.dot(cd) < 0.25);
  });
}
function updateGlobeTimes() {
  LOCATIONS.forEach((loc, i) => {
    const s = skyState(clock.ms, loc), t = localTimeString(clock.ms, loc.tz);
    $('pinTime' + i).textContent = ` ${t}`;
    $('cardNow' + i).textContent = `いま現地 ${t} · ${s.phaseLabel} · ${s.moonName}`;
  });
}

/* ================= modes & transitions ================= */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
function veil(on: boolean, k?: string, t?: string, s?: string) {
  if (k !== undefined) { $('veilK').textContent = k; $('veilT').textContent = t!; $('veilS').textContent = s || ''; }
  $('veil').classList.toggle('on', on);
}
function applyWater(loc: Sea) {
  const w = loc.water;
  U.uUp.value.setRGB(w.up[0], w.up[1], w.up[2]); U.uHor.value.setRGB(w.hor[0], w.hor[1], w.hor[2]); U.uDown.value.setRGB(w.down[0], w.down[1], w.down[2]);
  U.uFogDen.value = w.fog; U.uAbs.value.set(w.abs[0], w.abs[1], w.abs[2]);
  U.uSandRot.value = Math.atan2(loc.tide.axis[1], loc.tide.axis[0]);
  U.uSand.value.setRGB(loc.sand[0], loc.sand[1], loc.sand[2]); U.uRock.value.setRGB(loc.rock[0], loc.rock[1], loc.rock[2]);
}
function enterOcean(oc: Ocean) {
  oc.eco.env.crunch = (d: number) => { if (d < 12) crunch(1 - d / 12); };
  lastPhase = '';
  director.reset(); lastShot = null;
  dayKey = '';
  if (cur && cur !== oc) cur.group.visible = false;
  cur = oc; oc.group.visible = true;
  applyWater(oc.loc);
  setSeason(clock.season, oc.loc.lat);   // a chosen season means that sea's own season (south of the equator it flips)
  const cv = oc.cave;
  U.uCaveOn.value = cv ? 1 : 0; camCave = 1; camExpo = 1.4; post.setExposure(1.4);
  if (cv) {
    U.uCaveTex.value = cv.tex;
    U.uCaveXf.value.set(cv.cx, cv.cz, cv.ca, cv.sa);
    U.uCaveMin.value.set(cv.min[0], cv.min[1], cv.min[2]);
    U.uCaveExt.value.set((cv.n[0] - 1) * cv.step, (cv.n[1] - 1) * cv.step, (cv.n[2] - 1) * cv.step);
    U.uCaveN.value.set(cv.n[0], cv.n[1], cv.n[2]);
  }
  lampManual = false;
  applySky(oc.loc);
  grass.visible = !!oc.grassTex; grassMat.uniforms.uHeight.value = oc.grassTex;
  drone.s = 0.4 + Math.random() * 6; drone.mode = 'auto';
  pathPoint(drone.s, drone.pos); drone.vel.set(0, 0, 0);
  const a = pathPoint(drone.s + 0.05, new THREE.Vector3());
  drone.yaw = Math.atan2(-(a.x - drone.pos.x), -(a.z - drone.pos.z)); drone.pitch = -0.08;
  updateDrone(0.016, performance.now());
  camera.getWorldDirection(U.uCamFwd.value);
  for (const f of oc.fish) f.reset();
  applyTierToSea();
  for (const t of oc.turtles) t.placed = false;
  for (const o of oc.octopi || []) o.placed = false;
  for (const m of oc.mantas) m.placed = false;
  mode = 'ocean';
  document.body.classList.remove('mode-globe'); document.body.classList.add('mode-ocean');
  $('locName').textContent = `${oc.loc.name} · ${oc.loc.site}`;
  $('locCoord').textContent = fmtLL(oc.loc.lat, oc.loc.lon);
  setMode('auto');
  renderGuide();
  try { history.replaceState(null, '', '#' + oc.loc.id); } catch (e) { /* ignore */ }
  resize();
  requestAnimationFrame(resize);
}
async function dive(loc: Sea) {
  keepAwake();
  if (busy) return; busy = true;
  setHot(LOCATIONS.indexOf(loc));
  await tweenGlobe(loc.lat, loc.lon, 1.16, 1700);
  veil(true, 'DIVING', `${loc.name} · ${loc.site}`, `${fmtLL(loc.lat, loc.lon)} ／ 現地 ${localTimeString(clock.ms, loc.tz)}`);
  await wait(750); await nextFrame(); await nextFrame();
  if (!oceans[loc.id]) oceans[loc.id] = buildOcean(loc);
  enterOcean(oceans[loc.id]);
  await nextFrame();
  veil(false); setHot(-1);
  busy = false;
}
async function toGlobe() {
  if (busy || mode !== 'ocean') return; busy = true;
  const loc = cur!.loc;
  veil(true, 'SURFACING', '地球儀へ戻ります', `${loc.name} から浮上中`);
  await wait(750);
  mode = 'globe';
  document.body.classList.add('mode-globe'); document.body.classList.remove('mode-ocean');
  setGuide(false); setTimePanel(false);
  gv.lat = loc.lat; gv.lon = loc.lon; gv.dist = 1.2; gv.lastUser = performance.now();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  resize();
  veil(false);
  await tweenGlobe(clamp(loc.lat, -40, 40), loc.lon, 3.5, 1800);
  busy = false;
}

function setMode(m: 'auto' | 'manual') {
  drone.mode = m;
  if (m === 'manual') director.reset();
  if (m === 'auto' && cur) drone.s = nearestS(drone.pos);
  $('btnAuto').setAttribute('aria-pressed', String(m === 'auto'));
  $('btnManual').setAttribute('aria-pressed', String(m === 'manual'));
  $('tMode').textContent = m === 'auto' ? 'AUTO CRUISE' : 'MANUAL';
  $('hint').textContent = m === 'auto'
    ? (isTouch ? 'ドラッグすると手動操縦に切り替わります' : 'ドラッグかWASDで手動操縦に切り替わります')
    : (isTouch ? '左スティックで移動 · 画面ドラッグで視点 · 90秒操作がないと自動巡航に戻ります'
      : 'ドラッグ: 視点 · WASD: 移動 · E / Q: 上昇 / 下降 · Shift: 加速 · 90秒操作がないと自動巡航に戻ります');
  $('joy').hidden = $('vbtns').hidden = !(isTouch && m === 'manual');
}
function touchInput() { drone.lastInput = performance.now(); if (drone.mode !== 'manual') setMode('manual'); }
function setLamp(on: boolean, manual = true) {
  if (manual) lampManual = true;
  lampOn = on; $('btnLamp').setAttribute('aria-pressed', String(on));
}
function setSound(on: boolean) {
  if (on && !startAudio()) on = false;
  if (!on) stopAudio();
  $('btnSound').setAttribute('aria-pressed', String(on));
}
function toggleMusic() {
  setMusic(!audio.music);
  $('btnMusic').setAttribute('aria-pressed', String(audio.music));
  try { localStorage.setItem('seaglass.music', audio.music ? '1' : '0'); } catch (e) { /* ignore */ }
}
try { if (localStorage.getItem('seaglass.music') === '0') { setMusic(false); $('btnMusic').setAttribute('aria-pressed', 'false'); } } catch (e) { /* ignore */ }
function setHud(on: boolean) { hudOn = on; document.body.classList.toggle('hud-off', !on); }
function openPanel(tab: 'guide' | 'log') {
  if (!guideEl.hidden && panelTab === tab) { setGuide(false); return; }
  panelTab = tab; setGuide(true);
}
function setGuide(on: boolean) { guideEl.hidden = !on; $('btnGuide').setAttribute('aria-pressed', String(on)); if (on) setTimePanel(false); renderGuide(); }
function setTimePanel(on: boolean) { $('timePanel').hidden = !on; $('btnTime').setAttribute('aria-expanded', String(on)); if (on) { guideEl.hidden = true; $('btnGuide').setAttribute('aria-pressed', 'false'); } }
function setQuality(t: Tier) {
  tier = t;
  const T = TIERS[t];
  $('btnQuality').textContent = `画質 ${T.label}`;
  grassGeo.setDrawRange(0, Math.floor(BLADES * T.grass) * SEG * 12);
  snowGeo.setDrawRange(0, Math.floor(SNOW * T.snow));
  shafts.visible = !T.vol;
  U.uLodR.value = T.lodR;
  document.body.classList.toggle('post', T.post);
  post.setTier(T);
  applyTierToSea();
  resize();
}
function applyTierToSea() {
  if (!cur) return;
  for (const f of cur.fish as any[]) f.setFraction?.(TIERS[tier].shoal);
}
const TIER_ORDER: Tier[] = ['low', 'medium', 'high'];
function toggleFull() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => { /* not allowed */ });
  } catch (e) { /* ignore */ }
}
function goPreset(p: Preset) { if (!cur) return; clock.live = false; if (clock.speed === 0) clock.speed = 1; clock.ms = presetTime(p, cur.loc); applySky(cur.loc); updateTimeUi(); }

// Keep the screen on: the Screen Wake Lock where the browser has it, and on phones and tablets also a
// tiny silent looping video (the NoSleep.js technique), since iOS sometimes lets the lock lapse.
let wakeLock: any = null, awakeVideo: HTMLVideoElement | null = null;
async function keepAwake() {
  if (document.visibilityState !== 'visible') return;
  if (!wakeLock && 'wakeLock' in navigator) {
    try { wakeLock = await (navigator as any).wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (e) { /* denied until a tap */ }
  }
  if (isTouch || !('wakeLock' in navigator)) {
    if (!awakeVideo) {
      awakeVideo = document.createElement('video');
      awakeVideo.setAttribute('playsinline', ''); awakeVideo.setAttribute('muted', ''); awakeVideo.muted = true; awakeVideo.loop = true;
      awakeVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0';
      const src = (t: string, d: string) => { const s = document.createElement('source'); s.type = t; s.src = d; awakeVideo!.appendChild(s); };
      src('video/mp4', NOSLEEP_MEDIA.mp4); src('video/webm', NOSLEEP_MEDIA.webm);
      document.body.appendChild(awakeVideo);
    }
    if (awakeVideo.paused) awakeVideo.play().catch(() => { /* needs a tap; tried again on the next one */ });
  }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', keepAwake);          // every tap: the lock is dropped whenever the page is hidden

$('btnGlobe').onclick = toGlobe;
$('btnGuide').onclick = () => openPanel('guide');
$('btnLog').onclick = () => openPanel('log');
$('btnTime').onclick = () => setTimePanel($('timePanel').hidden);
$('btnAuto').onclick = () => setMode('auto');
$('btnManual').onclick = () => { drone.lastInput = performance.now(); setMode('manual'); };
$('btnLamp').onclick = () => setLamp(!lampOn);
$('btnSound').onclick = () => setSound(!audio.on);
$('btnMusic').onclick = () => toggleMusic();
$('btnQuality').onclick = () => { autoQ = false; setQuality(TIER_ORDER[(TIER_ORDER.indexOf(tier) + 1) % 3]); };
$('btnHud').onclick = () => setHud(false);
$('reveal').onclick = () => setHud(true);
$('btnFull').onclick = toggleFull;
$('btnLive').onclick = () => { clock.goLive(); if (cur) applySky(cur.loc); updateTimeUi(); };

const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyC', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const PRESET_KEYS: Record<string, Preset> = { Digit1: 'dawn', Digit2: 'noon', Digit3: 'dusk', Digit4: 'night' };
addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement;
  if (tgt.closest && tgt.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'KeyF' && !e.repeat) { toggleFull(); return; }
  if (mode !== 'ocean' || busy) return;
  if (MOVE.includes(e.code)) { keys.add(e.code); touchInput(); e.preventDefault(); return; }
  if (e.code.startsWith('Shift')) { keys.add(e.code); return; }
  if (e.repeat) return;
  if (PRESET_KEYS[e.code]) goPreset(PRESET_KEYS[e.code]);
  else if (e.code === 'Digit0') $('btnLive').click();
  else if (e.code === 'KeyT') setTimePanel($('timePanel').hidden);
  else if (e.code === 'KeyH') setHud(!hudOn);
  else if (e.code === 'KeyL') setLamp(!lampOn);
  else if (e.code === 'KeyM') setSound(!audio.on);
  else if (e.code === 'KeyN') toggleMusic();
  else if (e.code === 'KeyZ') openPanel('guide');
  else if (e.code === 'KeyJ') openPanel('log');
  else if (e.code === 'KeyG' || e.code === 'Escape') toGlobe();
  else if (e.code === 'KeyP') setMode(drone.mode === 'auto' ? 'manual' : 'auto');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
  if (mode === 'globe') {
    if (busy) return;
    gv.lastUser = performance.now(); gv.tween = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) gv.dist = clamp(gv.dist * pinch0 / d, 1.35, 4.5); pinch0 = d; return; }
    const k = 0.18 * (gv.dist - 0.9);
    gv.lon -= dx * k; gv.lat = clamp(gv.lat + dy * k, -70, 70);
    gv.vlon = -dx * k * 30; gv.vlat = dy * k * 30;
  } else {
    touchInput();
    const k = isTouch ? 0.006 : 0.0035;
    drone.yaw -= dx * k; drone.pitch -= dy * k;
  }
});
const endP = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
canvas.addEventListener('pointerup', endP); canvas.addEventListener('pointercancel', endP);
canvas.addEventListener('wheel', (e) => { if (mode !== 'globe' || busy) return; e.preventDefault(); gv.tween = null; gv.lastUser = performance.now(); gv.dist = clamp(gv.dist * (1 + e.deltaY * 0.0012), 1.35, 4.5); }, { passive: false });
{
  const pad = $('joy'), knob = $('knob'); let jid: number | null = null;
  const setJ = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect(), Rr = r.width / 2;
    let x = (e.clientX - r.left - Rr) / Rr, y = (e.clientY - r.top - Rr) / Rr; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    joy.x = x; joy.y = -y; knob.style.transform = `translate(${x * Rr * 0.6}px, ${y * Rr * 0.6}px)`; touchInput();
  };
  pad.addEventListener('pointerdown', (e) => { jid = e.pointerId; pad.setPointerCapture(jid); setJ(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === jid) setJ(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== jid) return; jid = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  const hold = (btn: HTMLElement, v: number) => {
    btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); vert.v = v; touchInput(); });
    const up = () => { vert.v = 0; }; btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  };
  hold($('btnUp'), 1); hold($('btnDown'), -1);
}
let idleT = 0;
addEventListener('pointermove', () => { idleT = performance.now(); document.body.classList.remove('idle'); });

// time panel contents
{
  $('presetRow').innerHTML = (Object.keys(PRESET_LABEL) as Preset[]).map((p, i) => `<button type="button" data-preset="${p}">${PRESET_LABEL[p]} <kbd>${i + 1}</kbd></button>`).join('');
  $('speedRow').innerHTML = SPEEDS.map((s) => `<button type="button" data-speed="${s.k}" title="${s.note}">${s.label}<small>${s.note}</small></button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('#timePanel [data-preset]').forEach((b) => { b.onclick = () => goPreset(b.dataset.preset as Preset); });
  $('seasonRow').innerHTML = (['now', 'spring', 'summer', 'autumn', 'winter'] as Season[]).map((k) => `<button type="button" data-season="${k}">${k === 'now' ? '今の季節' : SEASON_LABEL[k]}</button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('#timePanel [data-season]').forEach((b) => { b.onclick = () => { if (!cur) return; setSeason(b.dataset.season as Season, cur.loc.lat); try { localStorage.setItem('seaglass.season', clock.season); } catch (e) { /* storage blocked */ } applySky(cur.loc); updateTimeUi(); }; });
  try { const s = localStorage.getItem('seaglass.season'); if (s && s in SEASON_LABEL) clock.season = s as Season; } catch (e) { /* storage blocked */ }
  document.querySelectorAll<HTMLButtonElement>('#timePanel [data-speed]').forEach((b) => { b.onclick = () => { const k = +b.dataset.speed!; if (k === 1 && clock.live) return; clock.live = false; clock.speed = k; updateTimeUi(); }; });
}

/* ================= loop ================= */
function resize() {
  const w = innerWidth, h = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, TIERS[tier].dpr);
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  post.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
  camera.aspect = w / h; camera.updateProjectionMatrix();
  gcam.aspect = w / h; gcam.fov = w / h < 1 ? 50 : 32;
  if (w > 760) gcam.setViewOffset(w, h, -Math.min(w * 0.2, 260), 0, w, h);
  else gcam.setViewOffset(w, h, 0, h * 0.2, w, h);
  gcam.updateProjectionMatrix();
  snowMat.uniforms.uPx.value = h * dpr * 0.5 / Math.tan(camera.fov * Math.PI / 360);
  // keep the hint and time panel just above the dock, however many rows it wraps to
  const dockH = $('dock').offsetHeight || 44;
  $('hint').style.bottom = `calc(${dockH + 26}px + env(safe-area-inset-bottom, 0px))`;
  $('timePanel').style.bottom = `calc(${dockH + 26}px + env(safe-area-inset-bottom, 0px))`;
}
addEventListener('resize', resize);

let lastTs = 0;
let guideTimer = 0;
let autoQ = true, fpsAcc = 0, fpsN = 0, fpsStart = 0, hudTimer = 0, sightTimer = 0, skyTimer = 0, globeTimer = 1;
function frame(ts: number) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016, now = performance.now();
  lastTs = ts;
  U.uTime.value += dt;
  clock.advance(dt);
  if (mode === 'globe') {
    updateGlobe(dt, now, clock.ms, reduceMotion);
    renderer.setRenderTarget(null);
    renderer.render(globeScene, gcam);
    updatePins();
    if ((globeTimer += dt) > 1) { globeTimer = 0; updateGlobeTimes(); }
  } else if (cur) {
    if ((skyTimer += dt) > (clock.speed > 1 && !clock.live ? 0.05 : 0.5)) { skyTimer = 0; applySky(cur.loc); }
    updateDrone(dt, now);
    const fwd = U.uCamFwd.value; camera.getWorldDirection(fwd);
    U.uCamPos.value.copy(camera.position);
    if (cur.cave) {
      // the camera opens up in the dark of the cave, and the sun's bake follows the sun
      cur.cave.updateSun(U.uSunDir.value);
      const cp = camera.position;
      camCave += (cur.cave.skyAt(cp.x, cp.y, cp.z) - camCave) * Math.min(1, dt * 1.2);
      U.uCamCave.value = camCave;
      if (!lampManual) { const want = wantLamp(); if (want !== lampOn) setLamp(want, false); }
    }
    // a touch more exposure at night, and much more in the dark of the cave (eased)
    {
      const cp = camera.position, cv = cur.cave;
      const ahead = cv ? cv.skyAt(cp.x + fwd.x * 5, cp.y + fwd.y * 5, cp.z + fwd.z * 5) : 1;
      const want = 1.4 * (1 + 0.55 * nightLift) * (1 + 1.1 * (1 - Math.max(camCave, ahead * 0.8)));
      camExpo += (want - camExpo) * Math.min(1, dt * 0.8);
      post.setExposure(camExpo);
    }
    U.uLamp.value += ((lampOn ? 1 : 0) - U.uLamp.value) * Math.min(1, dt * 6);
    const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
    for (const ev of cur.eco.step(dt, U.uTime.value, drone.pos, fx, fz)) seaLog(ev.kind, ev.text, ev.at);
    updateMarker(now);
    const W = cur.whales;
    setWhaleSong(W && W.seasonal ? (W.active ? 1 : 0.45) : 0);
    pumpLog(now);
    snowMat.uniforms.uPlank.value = 0.5 + cur.eco.env.plankton.sample(drone.pos.x, drone.pos.z) * 1.2;
    if ((guideTimer += dt) > 2 && !guideEl.hidden) { guideTimer = 0; renderGuide(); }
    const vis = Math.min(3.1 / U.uFogDen.value, 150) * TIERS[tier].coralVis + CELL * 0.72;
    for (const c of cur.cells) {
      const dx = c.x - drone.pos.x, dz = c.z - drone.pos.z, d = Math.hypot(dx, dz);
      const cs = c.big ? 80 : CELL;
      c.mesh.visible = d < (c.small ? 38 : vis + (cs - CELL) * 0.72) && (d < cs || (dx * fx + dz * fz) / d > -0.4);
      if (c.hi) c.hi.visible = c.mesh.visible && d < U.uLodR.value + CELL * 0.72;
    }
    sky.position.copy(camera.position);
    surface.position.set(camera.position.x, 0, camera.position.z);
    setHum(drone.vel.length());
    post.whiteBalance(-camera.position.y, U.uAbs.value, U.uNight.value);
    if (TIERS[tier].post) post.render(renderer, oceanScene, camera); else { renderer.setRenderTarget(null); renderer.render(oceanScene, camera); }
    if ((hudTimer += dt) > 0.1) { hudTimer = 0; if (hudOn) updateHud(); }
    if ((sightTimer += dt) > 0.3) { sightTimer = 0; checkSightings(); }
    if (!hudOn && now - idleT > 3000) document.body.classList.add('idle');
    if (autoQ) {
      if (!fpsStart) fpsStart = now;
      else if (now - fpsStart > 2000) { fpsAcc += dt; fpsN++; }
      if (fpsN > 150) {
        const fps = fpsN / fpsAcc;
        if (fps < 38 && tier !== 'low') { setQuality(TIER_ORDER[TIER_ORDER.indexOf(tier) - 1]); fpsN = 0; fpsAcc = 0; fpsStart = now; }
        else autoQ = false;
      }
    }
  }
  requestAnimationFrame(frame);
}

document.body.classList.add('mode-globe');
setQuality(tier);
resize();
updateGlobeTimes();
requestAnimationFrame(frame);
const start = LOCATIONS.find((l) => l.id === location.hash.slice(1));
if (start) { gv.lat = start.lat; gv.lon = start.lon; setTimeout(() => dive(start), 300); }
void smooth;

// Inspect the live sim from the console with ?debug
if (location.search.includes('debug')) (window as any).seaglass = { get cur() { return cur; }, clock, drone, U, director, goTo, seaLog };
