// Utsushiyo (formerly Seaglass; storage keys keep the old name): pick a sea on the globe, dive, and drift with the drone. The sim clock lights every sea
// by its real sky; one click jumps to dawn / noon / dusk / night, and time can run faster than real.
import * as THREE from 'three';
import './styles.css';
import { U, mat } from './render/common';
import { clamp, smooth, angDiff, rr } from './core/math';
import { LOCATIONS, type Sea } from './data/locations';
import { ridersFor } from './eco/riders';
import { makeDrone } from './ocean/drone';
import { ZONE } from './ocean/zone';
import { oceanScene, sky, surface, grass, grassMat, grassGeo, snowGeo, snowMat, snow, shafts, BLADES, SEG, SNOW, LIMIT } from './ocean/scenery';
import { updateAir, setPlanets, topScene, setRefraction, swellAt, seaTop, abyss } from './ocean/air';
import { SplitView, SPLIT_BAND } from './render/split';
const split = new SplitView(), _sz = new THREE.Vector2();
let airState = false;
import { stepMeteors, activeShower, forceMeteors } from './ocean/meteors';
import { planets } from './time/planets';
import { buildOcean } from './ocean/build';
import { globeScene, gcam, ll2v, gv, updateGlobe, tweenGlobe, earthMat } from './globe';
import { clock, skyState, presetTime, localTimeString, SPEEDS, PRESET_LABEL, type Preset, setSeason, seasonOf, seaTemp, SEASON_LABEL, type Season } from './time/clock';
import { Director, speciesOf, type Shot } from './director';
import type { Subject } from './eco/env';
import { PERSONAS, personaById, line, type Persona, type Mood, type Taste } from './persona';
import NOSLEEP_MEDIA from 'nosleep.js/src/media.js';
import { studio, guideThumbs } from './ui/thumbs';
import { PLACES } from './ui/places';
import { MiniMap } from './ui/minimap';
import { ageOf, describeSize } from './eco/growth';
import { SHAPES } from './ocean/models';
import { fetchWeather, FAIR, weatherLabel, isStorm, type Weather } from './time/weather';
import { Post, setRTSupport } from './render/post';
import { loadLand } from './ocean/land';
import { STAGES } from './robots/voices';
import { aiKey, setAiKey, aiLastError } from './robots/mind';
import { setAnisotropy, SURFACE, SURF_UNIFORMS } from './render/surface';
import { TIERS, detectTier, type Tier } from './quality';
import { audio, startAudio, stopAudio, setHum, crunch, setWhaleSong, setMood, setMusic, setRain, thunder, splash, breachSound, setAir, frenzy, plop, vol, setVolume, babble } from './audio';
import { makePov } from './ui/pov';
import { makeDiaryBook } from './ui/diary';
import { updateSplash, splashAt, bubblesAt, bigSplash, streamAt } from './ocean/splash';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const canvas = $('scene') as HTMLCanvasElement;

// If the GPU gives up on us (the context is lost: a driver reset, usually a frame that took too long on
// a weak or busy GPU), reload in a lighter mode: first the light tier at a lower resolution, then lower
// still; after that, say so instead of looping.
// ?nopost: draw straight to the screen, without the post-processing chain (and ?nopip without the hunt
// window); the second recovery reload does the same
const noPost = /[?&]nopost/.test(location.search), noPip = /[?&]nopip/.test(location.search);
const SAFE = (() => { try { return +(sessionStorage.getItem('seaglass.safe') || 0); } catch (e) { return 0; } })();
let lostCount = 0;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); lostCount++;
  console.error('WebGL context lost');
  if (location.search.includes('diag')) return;
  if (SAFE < 3) {
    try { sessionStorage.setItem('seaglass.safe', String(SAFE + 1)); } catch (err) { /* ignore */ }
    $('veilK').textContent = 'RECOVERING'; $('veilT').textContent = '描画が止まったため、軽いモードで開き直します'; $('veilS').textContent = '';
    document.getElementById('veil')!.classList.add('on');
    setTimeout(() => location.reload(), 1200);
  } else {
    $('err').innerHTML = 'このPCのGPUでは描画を続けられませんでした。<br>ブラウザの設定で「ハードウェアアクセラレーション」が有効か、GPUドライバーが最新かをご確認ください。';
    $('err').hidden = false;
  }
});
let renderer: THREE.WebGLRenderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: SAFE === 0, powerPreference: 'high-performance' }); }
catch (e) { $('err').hidden = false; throw e; }
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
setRTSupport(renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float'));

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
let lampT = 0, lampOn = false, lampManual = false, hudOn = true, busy = false;
const forcedTier = new URLSearchParams(location.search).get('tier') as Tier | null;
let tier: Tier = forcedTier && forcedTier in TIERS ? forcedTier : SAFE ? 'low' : detectTier(renderer.getContext());
const post = new Post(TIERS[tier]);
const minimap = new MiniMap(document.getElementById('minimap')!);
let mapTimer = 0;
// the hunt window: a second, small camera on whatever is being hunted nearby
const pipPost = new Post({ ...TIERS.low, vol: 0, bloom: 0, ao: 0 });
const pipCam = new THREE.PerspectiveCamera(42, 16 / 10, 0.08, 460);
let pipOff = 0, pipLift = 0, pipClear = 0;
const pipLook = new THREE.Vector3(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
let pipOn = (() => { try { return localStorage.getItem('seaglass.pip') !== '0'; } catch (e) { return true; } })();
let pipSubj: Subject | null = null, pipT = 0, pipFade = 0, pipScan = 0, pipAng = 0, pipBoost = 1, pipIdle = 0;
const pipFrom = new THREE.Vector3(); let pipFromT = 0, pipSlow = false;   // (where the hunter was a few seconds ago: has anything happened since?)
// How bright the hunt window would come out: the water behind the action (its colour at that depth, as
// the shaders make it) and the light falling on the fish there. Deep, at dawn or at night it falls away,
// and the window opens up to keep the chase legible (a noon reef a few metres down is the reference).
const _wl = new THREE.Color();
function pipLight(depth: number) {
  _wl.copy(U.uHor.value).lerp(U.uDown.value, 0.5);
  const water = (0.21 * _wl.r + 0.72 * _wl.g + 0.07 * _wl.b) * (0.32 + 0.68 * Math.exp(-depth * 0.035)) * U.uAmb.value;
  const lit = (U.uAmb.value * 0.42 + U.uSunI.value * 0.4) * Math.exp(-depth * U.uAbs.value.y) * 0.5;
  return 0.6 * water + 0.4 * lit;
}
const pipRect = { x: 0, y: 0, w: 0, h: 0 };

/* ================= drone ================= */
const drone = { skim: 0, skimDir: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: -0.08, roll: 0, mode: 'auto' as 'auto' | 'manual', s: 0.4, lastInput: -1e9, sky: false, skyT: 0, skyAge: 0, skyWait: 600, skyStay: 300, seaUntil: 0 };
// watching one of the island's residents from above: the camera stays with it until let go
const watch = { r: null as any, ang: 0, off: 0.45, el: 0.3, dist: 5.5, infoT: 0, pov: false };
const SKY_MAX = 120;   // stay under the 150 m ceiling drones fly to
function pathXZ(s: number): [number, number] { return cur?.loc.path ? cur.loc.path(s) : [110 * Math.sin(s * 0.9) + 22 * Math.sin(s * 2.3 + 1), -8 + 88 * Math.sin(s * 0.6 + 0.8) + 20 * Math.cos(s * 1.7)]; }
function pathAlt(s: number) {
  const a = 3.4 + 2.0 * Math.sin(s * 3.1) + 1.2 * Math.sin(s * 7.3 + 2);
  return Math.max(1.8, a) + Math.pow(Math.max(0, Math.sin(s * 1.13 + 0.5)), 8) * 10;
}
// The cruise line, as this guide takes it: off to one side and back (weaving, or wandering wide), or
// leaning toward the deeper water; high in mid-water, low along the reef, or just under the surface.
function pathPoint(s: number, out: THREE.Vector3) {
  let [x, z] = pathXZ(s);
  const r = persona.route;
  if (cur!.loc.pelagic) {   // open ocean: depth under the surface, nothing below
    const k = r === 'surface' ? 0.35 : r === 'deep' ? 1.7 : r === 'mid' ? 1.2 : 1;
    return out.set(x, -(6 + pathAlt(s) * 2.2 + 6 * Math.sin(s * 0.37)) * k, z);
  }
  if (r === 'wander' || r === 'free' || r === 'deep') {
    const b = pathXZ(s + 0.002), tl = Math.hypot(b[0] - x, b[1] - z) || 1, nx = -(b[1] - z) / tl, nz = (b[0] - x) / tl;
    let off = 0;
    if (r === 'wander') off = 9 * Math.sin(s * 5.3) + 4 * Math.sin(s * 11.7 + 1);
    else if (r === 'free') off = 16 * Math.sin(s * 2.1 + 0.4) * Math.sin(s * 0.7 + 2);
    else {
      // (a soft lean toward whichever side drops away deeper)
      let w = 0, sum = 0; const h0 = cur!.T.top(x, z);
      for (let o = -14; o <= 14; o += 7) { const e = Math.exp(-(cur!.T.top(x + nx * o, z + nz * o) - h0) / 1.5); w += e; sum += o * e; }
      off = sum / w;
    }
    // (never off the line into the shallows or ashore)
    for (let i = 0; i < 3 && cur!.T.top(x + nx * off, z + nz * off) > -2.5; i++) off *= 0.5;
    if (cur!.T.top(x + nx * off, z + nz * off) > -2.5) off = 0;
    x += nx * off; z += nz * off;
  }
  const top = cur!.T.top(x, z);
  let alt = pathAlt(s) * persona.altK;
  if (r === 'free') alt *= 0.6 + 1.2 * (0.5 + 0.5 * Math.sin(s * 1.9));
  if (r === 'surface') return out.set(x, Math.min(Math.max(top + 1.5, -2 - 1.6 * Math.sin(s * 2.7) ** 2), -1.4), z);
  return out.set(x, Math.min(top + alt, -1.4), z);
}
function pathRate(s: number) { const a = pathXZ(s), b = pathXZ(s + 0.001); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.001; }
function nearestS(p: THREE.Vector3) {
  let best = drone.s, bd = Infinity;
  for (let i = 0; i < 2400; i++) { const s = i * 0.02; const [x, z] = pathXZ(s); const d = (x - p.x) ** 2 + (z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}
const director = new Director();
let stuckT = 0;
// a low run over the sea to put up flying fish, and the chase alongside them (from the sky)
let flyRun: { burst: boolean; t: number; side: number } | null = null, flyT = rr(60, 140);
let lastShot: Shot | null = null;
let huntK = 0, giantK = 0, zoomK = 0;
// The commentary: once the camera has arrived at something, what it is, what it is doing, and a little
// from the field guide; it stays while that is being filmed (on/off, remembered)
let captionOn = (() => { try { return localStorage.getItem('seaglass.caption') !== '0'; } catch (e) { return true; } })();
let capShot: Shot | null = null, capT = 0, obsAt = 0;
function setCaption(on: boolean) {
  captionOn = on; try { localStorage.setItem('seaglass.caption', on ? '1' : '0'); } catch (e) { /* ignore */ }
  $('btnCaption').setAttribute('aria-pressed', String(on));
  if (!on) $('caption').classList.remove('on'); else capShot = null;
}
function captionText(sj: Subject) {
  const e = cur ? guideEntries(cur.loc).find((x) => sj.label.startsWith(x.ja)) : null;
  const sizeTxt = sj.len && sj.adult ? `　${describeSize(sj.len, ageOf(sj.len, sj.adult, sj.lenK), sj.lenWhat)}` : '';
  const note = e ? e.note.split('。').filter(Boolean).slice(0, 2).join('。') + '。' : '';
  return { t: sj.label, i: e?.sci ?? '', s: sj.status() + sizeTxt, n: note };
}
let cruiseSubj: Subject | null = null, cruiseT = 0;
function updateCaption(dt: number) {
  const el = $('caption'); let sh = lastShot;
  // cruising (nothing being filmed): the commentary is about whatever is biggest on screen, close by
  if (captionOn && !(sh && sh.phase === 'observe') && drone.mode === 'auto' && !watch.r && cur && camera.position.y < 0) {
    if ((cruiseT -= dt) < 0) {
      cruiseT = 2;
      const fwd = U.uCamFwd.value; let best: Subject | null = null, bs = 0;
      for (const s of cur.eco.subjects()) {
        const p = s.pos(); if (!p || !s.live() || s.kind === 'cave' || s.kind === 'hunt') continue;
        const dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z, d = Math.hypot(dx, dy, dz);
        if (d > 14 || (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3) < 0.75) continue;
        const sc = Math.max(s.len ?? 0, Math.min(s.size, 3)) / Math.max(d, 1);
        if (sc > bs) { bs = sc; best = s; }
      }
      cruiseSubj = best && bs > 0.12 ? best : null;
    }
    if (cruiseSubj) sh = { subject: cruiseSubj, phase: 'observe', pos: camera.position, look: camera.position, cruise: true } as any;
  } else cruiseSubj = null;
  const want = captionOn && !!sh && sh.phase === 'observe' && drone.mode === 'auto' && !watch.r && sh.subject.kind !== 'cave';
  if (!want) { if (el.classList.contains('on')) el.classList.remove('on'); capShot = null; return; }
  if ((sh as any).cruise && capShot && (capShot as any).cruise && capShot.subject === sh!.subject) sh = capShot;
  if (capShot !== sh) {
    capShot = sh; capT = 0;
    const c = captionText(sh!.subject);
    (el.querySelector('.k') as HTMLElement).textContent = (sh as any).cruise ? 'いま目の前に' : sh!.zoom ? '図鑑から ・ 到着' : sh!.subject.kind === 'hunt' ? '狩り' : '観察中';
    if ((sh as any).cruise) c.n = '';   // (passing by: just the name and what it is doing)
    (el.querySelector('.t b') as HTMLElement).textContent = c.t; (el.querySelector('.t i') as HTMLElement).textContent = c.i;
    (el.querySelector('.s') as HTMLElement).textContent = c.s; (el.querySelector('.n') as HTMLElement).textContent = c.n;
    el.classList.add('on');
  }
  if ((capT += dt) > 1) { capT = 0; (el.querySelector('.s') as HTMLElement).textContent = captionText(sh!.subject).s; }
}
function onShotChange(prev: Shot | null, next: Shot | null) {
  if (next) {
    $('tMode').textContent = 'OBSERVING';
        const sj = next.subject, sizeTxt = sj.len && sj.adult ? `・${describeSize(sj.len, ageOf(sj.len, sj.adult, sj.lenK), sj.lenWhat)}` : '';
    if (!captionOn) hint(`観察中：${sj.label}（${sj.status()}${sizeTxt}）`);
    recordLog('observe', `${sj.label}を観察（${sj.status()}${sizeTxt}）`);
    if (next.subject.kind === 'hunt') say('hunt');
    else say('shot', { name: next.subject.label.replace(/の群れ$/, ''), note: noteOf(next.subject.label) });
  } else {
    if (prev && drone.mode === 'auto') drone.s = nearestS(drone.pos);
    if (drone.mode === 'auto') $('tMode').textContent = 'AUTO CRUISE';   // (back to the cruise, in the sea or the sky as before: a shot ashore does not send us up)
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
// Flying fish from the sky: first down to a fast run a metre or two over the swell (what puts them up,
// as a boat's bow does), and when they burst out ahead, alongside them — level with the glide, a few
// metres off to one side and a little behind, racing along and looking across at them. Then up again.
function flyStep(dt: number) {
  const ff = cur!.flyfish, fr = flyRun!; fr.t += dt;
  const sea = swellAt(drone.pos.x, drone.pos.z), fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw);
  let wantYaw = drone.yaw, wantPitch = -0.06, k = dt * 0.8;
  if (!fr.burst) {
    // in toward the middle of the area first, so there is room for the chase across it (and land ahead: bear away)
    const lim = cur!.loc.land ? cur!.loc.land.roam : LIMIT, c = cur!.loc.land ? cur!.loc.land.center : [0, 0];
    const room = Math.hypot(drone.pos.x - c[0], drone.pos.z - c[1]) < lim * 0.4;
    if (!room) wantYaw = Math.atan2(-(c[0] - drone.pos.x), -(c[1] - drone.pos.z));
    if (cur!.T.ground(drone.pos.x + fx * 25, drone.pos.z + fz * 25) > -1) wantYaw = drone.yaw + 0.8;
    _v.set(fx * 9, clamp((sea + 1.5 - drone.pos.y) * 0.8, -7, 2), fz * 9);
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.2));
    if (drone.pos.y < sea + 3 && Math.hypot(drone.vel.x, drone.vel.z) > 6 && fr.t > 2.5 && (room || fr.t > 20)) {
      const d = rr(8, 13), off = rr(-0.4, 0.4);
      ff.burst(drone.pos.x + fx * d, drone.pos.z + fz * d, Math.atan2(fz, fx) + off);
      fr.burst = true; fr.t = 0; fr.side = off > 0 ? 1 : -1;   // (they veer one way: keep to the other side)
    }
    if (fr.t > 40) flyRun = null;
  } else if (ff.flying()) {
    const L = ff.lead, D = ff.dir, sx = -D.z, sz = D.x;
    _t.set(L.x - sx * fr.side * 2.2 - D.x * 0.6, Math.max(L.y + 0.25, swellAt(L.x, L.z) + 0.8), L.z - sz * fr.side * 2.2 - D.z * 0.6);
    _v.set(D.x * 13 + (_t.x - drone.pos.x) * 2.2, (_t.y - drone.pos.y) * 2.5, D.z * 13 + (_t.z - drone.pos.z) * 2.2);
    if (_v.length() > 22) _v.setLength(22);
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 3));
    const lx = L.x - camera.position.x, ly = L.y - camera.position.y, lz = L.z - camera.position.z;
    wantYaw = Math.atan2(-lx, -lz); wantPitch = Math.atan2(ly, Math.hypot(lx, lz)); k = dt * 4;
  } else {
    // the last of them gone: ease off and climb away
    _v.set(fx * 4, 1.5, fz * 4); drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.2));
    if (fr.t > 2 && !ff.st.active) flyRun = null;
  }
  drone.yaw += angDiff(wantYaw, drone.yaw) * Math.min(1, k);
  drone.pitch += (wantPitch - drone.pitch) * Math.min(1, k);
}
function updateDrone(dt: number, now: number) {
  const prevYaw = drone.yaw, t = U.uTime.value;
  // (the island's residents can be filmed from the sky as well; the treetops count as floor there)
  // (from the sky, a whale or manta leaping nearby is watched from above, whatever was being filmed)
  const bl = cur!.breach.leap, overLeap = drone.sky && drone.mode === 'auto' && !watch.r && !!bl && bl.t > 2 && Math.hypot(bl.c.x - drone.pos.x, bl.c.z - drone.pos.z) < 260
    && ((skyNow?.night ?? 0) < 0.6 || U.uMoonIllum.value * Math.max(0, U.uAirMoon.value.y) > 0.25);   // (not on a dark night: the stars, not a black sea)
  const flyOn = drone.sky && drone.mode === 'auto' && !watch.r && !!flyRun && !!cur!.flyfish && !overLeap;
  const R = cur!.residents, film = drone.mode === 'auto' && !watch.r && (!drone.sky || !!R) && !overLeap && !flyOn;
  const shot = film ? director.update(dt, drone.pos, () => (drone.sky ? R!.subjects() : performance.now() < drone.seaUntil ? allSubjects().filter((sj) => sj.kind !== 'robot' || (sj.pos()?.y ?? 0) < 0) : allSubjects()), (x, z) => Math.max(cur!.T.top(x, z), cur!.T.over ? cur!.T.over(x, z) : -1e9), U.uCamFwd.value) : null;
  if (shot !== lastShot) { onShotChange(lastShot, shot); lastShot = shot; stuckT = 0; }
  // stuck: filming something (not riding a tour through), well short of the spot and hardly moving
  // for ten seconds — blocked by rock on the way. Give it up and go on.
  if (shot && !shot.subject.tour && drone.vel.length() < 0.2 && drone.pos.distanceTo(shot.pos) > 2.5) { if ((stuckT += dt) > 10) { director.abandon(); stuckT = 0; } } else stuckT = 0;
  if (watch.r && watch.pov && cur!.residents) {
    // through its own eyes: where its eyes are, looking where it looks (a drag glances aside)
    const sn = cur!.residents.sense(watch.r);
    drone.pos.copy(sn.eye); drone.vel.set(0, 0, 0);
    const wantYaw = sn.head + Math.PI, wantPitch = watch.r.act === 'sit' ? -0.18 : watch.r.act === 'pick' || watch.r.act === 'dig' ? -0.45 : watch.r.act === 'float' ? 0.25 : -0.1;
    drone.yaw += angDiff(wantYaw, drone.yaw) * Math.min(1, dt * 3);
    drone.pitch += (wantPitch - drone.pitch) * Math.min(1, dt * 2);
  } else if (watch.r) {
    // behind it and a little above, a little to one side, following where it is heading (slowly, so a
    // turn does not swing the view about), looking past it to what lies ahead: it, and its world
    const p = watch.r.pos, T = cur!.T, h = watch.r.head ?? 0, fx = Math.sin(h), fz = Math.cos(h);
    watch.ang += angDiff(Math.atan2(-fz, -fx) + watch.off, watch.ang) * Math.min(1, dt * 0.5);
    const ce = Math.cos(watch.el), se = Math.sin(watch.el), mid = watch.r.sp?.living ? 0.3 : 0.55;   // (round its middle: a turtle is low, a robot taller)
    _t.set(p.x + Math.cos(watch.ang) * ce * watch.dist, p.y + mid + se * watch.dist, p.z + Math.sin(watch.ang) * ce * watch.dist);
    _t.y = Math.max(_t.y, T.h(_t.x, _t.z) + 0.3, 0.25);   // (the bare ground: T.top would be the treetops, the canopy being solid to everything else)   // (the bare ground: the bushes and trees close round it are opened up, not climbed over)   // clear of the ground, and out of the water (the trees overhead are opened up around it)
    _v.subVectors(_t, drone.pos);
    const L = _v.length();
    _v.multiplyScalar(Math.min(L * 1.6, 30) / Math.max(L, 1e-4));   // (across the island quickly when switching)
    if (drone.pos.y < 0) _v.set(_v.x * 0.15, 3, _v.z * 0.15);   // under the water: straight up through the surface first
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 3));
    // looking a little past it, the way it is going — but only from behind and not too close; from the side,
    // in front of it or close up, at it (its face, when you have come round to see it)
    const behind = clamp(Math.cos(watch.off), 0, 1) * clamp((watch.dist - 2.5) / 4, 0, 1);
    const ax = p.x + fx * 2.2 * behind, az = p.z + fz * 2.2 * behind;
    const lx = ax - camera.position.x, ly = p.y + mid - 0.1 * behind - camera.position.y, lz = az - camera.position.z;
    const k = Math.min(1, dt * 2.5);
    drone.yaw += angDiff(Math.atan2(-lx, -lz), drone.yaw) * k;
    drone.pitch += (Math.atan2(ly, Math.hypot(lx, lz)) - drone.pitch) * k;
  } else if (shot) {
    // glide to the viewpoint and keep the subject framed (from inside the cave: out along the tunnel first)
    const way = cur!.cave && shot.subject.kind !== 'cave' && cur!.cave.exitWay(drone.pos, shot.pos, _w) ? _w : shot.pos;
    _v.subVectors(way, drone.pos);
    const L = _v.length(), top = shot.surface ? (shot.phase === 'approach' ? Math.min(9, 2.5 + L * 0.3) : 1.5) : shot.close ? 7 : shot.giant && shot.phase === 'observe' ? 6 : shot.phase === 'observe' && (shot.zoom || shot.subject.size < 1.2) ? 2 : shot.phase === 'approach' ? (shot.forced || shot.subject.kind === 'robot' ? Math.min(shot.pos.y > 0 ? 9 : 7, 2.4 + L * 0.1) : 2.4) : 0.9;   // sent somewhere far (or across the island): travel faster; racing along with a hunt: fast
    _v.multiplyScalar(Math.min(top, L * 0.8) / Math.max(L, 1e-4));
    drone.vel.lerp(_v, 1 - Math.exp(-dt * (shot.close ? 3 : shot.giant ? 2.4 : shot.phase === 'observe' && shot.subject.size < 1.2 ? 2 : 1.2)));
    const lk = way === shot.pos ? shot.look : way;   // escaping the cave: look where we are going
    const lx = lk.x - camera.position.x, ly = lk.y - camera.position.y, lz = lk.z - camera.position.z;
    const k = Math.min(1, dt * (shot.close ? 3.2 : shot.giant ? 2.4 : shot.phase === 'approach' ? 0.9 : shot.zoom || shot.subject.size < 1.2 ? 3 : 1.6));   // (a small fish close up: keep it in the frame)
    drone.yaw += angDiff(Math.atan2(-lx, -lz), drone.yaw) * k;
    drone.pitch += (Math.atan2(ly, Math.hypot(lx, lz)) - drone.pitch) * k;
  } else if (flyOn) {
    flyStep(dt);
  } else if (drone.mode === 'auto' && drone.sky) {
    // over the sea: a slow loop above the reef at a height that wanders, now and then skimming the
    // swell. By day the camera looks down into the water, at dusk out to the horizon, at night up at the stars.
    drone.skyT += dt;
    const a = drone.skyT * 0.018, st = drone.skyT;
    const skim = smooth(0.8, 0.95, Math.sin(st * 0.021 + 2));
    const altT = drone.pos.y < 0 ? 3 : cur!.loc.pelagic
      ? 1.2 + 14 * Math.pow(0.5 + 0.5 * Math.sin(st * 0.013), 3)             // out in the open ocean: drifting low on the swell
      : (6 + 45 * (0.5 + 0.5 * Math.sin(st * 0.013)) * (1 - skim)) * persona.skyAlt + 1.6 * skim;
    _t.set(80 * Math.sin(a * 1.3), altT, 70 * Math.sin(a * 0.9 + 1));
    if (cur!.loc.land) { const [cx, cz] = cur!.loc.land.center; _t.set(cx + _t.x * 3.2, _t.y, cz + _t.z * 3.2); }   // by an island: round the whole island
    if (cur!.loc.land) _t.y = Math.max(_t.y, cur!.T.ground(_t.x, _t.z) + 9, cur!.T.ground(drone.pos.x, drone.pos.z) + 7);   // over the island: clear of the trees
    // a bait ball nearby: wheel over it with the birds
    const bb = cur!.bait?.st, overBall = !!bb && bb.active && bb.phase !== 'gather' && Math.hypot(bb.c.x - drone.pos.x, bb.c.z - drone.pos.z) < 300;
    if (overBall) { const oa = st * 0.12; _t.set(bb!.c.x + Math.cos(oa) * 26, 13, bb!.c.z + Math.sin(oa) * 26); }
    // a leap: off to one side of its line and up, high enough to see the whole splash and the foam it leaves
    const lc = overLeap ? bl!.c : null;
    if (lc) { const big = bl!.kind === 'whale', d = big ? 34 : 16, sd = (drone.pos.x - lc.x) * -bl!.dir.z + (drone.pos.z - lc.z) * bl!.dir.x >= 0 ? 1 : -1; _t.set(lc.x - bl!.dir.z * sd * d + bl!.dir.x * 3, big ? 16 : 8, lc.z + bl!.dir.x * sd * d + bl!.dir.z * 3); }
    _v.subVectors(_t, drone.pos);
    // first, up through the surface on a slant, carrying on the way we were going
    if (drone.pos.y < 0) _v.set(-Math.sin(drone.yaw) * 1.8, 2.4, -Math.cos(drone.yaw) * 1.8);
    else {
      const L = Math.hypot(_v.x, _v.z);
      const top = lc ? 12 : 4.5;   // (to a leap: quickly, it will not wait)
      _v.x *= Math.min(top, L * 0.3) / Math.max(L, 1e-4); _v.z *= Math.min(top, L * 0.3) / Math.max(L, 1e-4);
      _v.y = clamp(_v.y * 0.5, -2.5, 3);
    }
    drone.vel.lerp(_v, 1 - Math.exp(-dt * (drone.pos.y < 0 ? 2 : 0.8)));
    const s = skyNow!, night = s.night, dusk = Math.max(s.golden, s.twilight * (1 - night));
    let wantYaw = Math.atan2(-drone.vel.x, -drone.vel.z) + Math.sin(st * 0.05) * 0.6;
    if (overBall) wantYaw = Math.atan2(-(bb!.c.x - drone.pos.x), -(bb!.c.z - drone.pos.z));
    if (lc) wantYaw = Math.atan2(-(lc.x - drone.pos.x), -(lc.z - drone.pos.z));
    if (night > 0.5) wantYaw = drone.yaw + dt * 0.035;                       // at night, turn slowly under the sky
    else if (dusk > 0.3) wantYaw += angDiff(Math.atan2(-U.uAirSun.value.x, -U.uAirSun.value.z), wantYaw) * 0.7;   // face the sunset
    const wantPitch = drone.pos.y < 0 ? 0.3 : lc ? -Math.atan2(drone.pos.y - (bl!.kind === 'whale' ? 2.5 : 0.8), Math.max(Math.hypot(lc.x - drone.pos.x, lc.z - drone.pos.z), 1)) : overBall ? -Math.atan2(drone.pos.y + 1, Math.max(Math.hypot(bb!.c.x - drone.pos.x, bb!.c.z - drone.pos.z), 1))                                  // rising: watch the surface come closer
      : night > 0.5 ? 0.42 + Math.sin(st * 0.04) * 0.15 : dusk > 0.3 ? 0.02 : -0.5 + Math.sin(st * 0.06) * 0.15 + skim * 0.4;
    drone.yaw += angDiff(wantYaw, drone.yaw) * Math.min(1, dt * (lc ? 1.2 : 0.35));
    drone.pitch += (wantPitch - drone.pitch) * Math.min(1, dt * (lc ? 1.2 : 0.35));
  } else if (drone.mode === 'auto') {
    const hasI = findInterest(drone.pos, U.uCamFwd.value);
    interestW += ((hasI ? 1 : 0) - interestW) * Math.min(1, dt * 0.6);
    const speed = (1.35 - interestW * 0.5) * persona.cruise * (persona.pace ? persona.pace(t) : 1);
    if ((whimT -= dt) < 0) { whimT = rr(240, 420); whim = WHIMS[Math.floor(Math.random() * WHIMS.length)]; }
    drone.s += speed * dt / Math.max(pathRate(drone.s), 1e-3);
    pathPoint(drone.s, _t);
    _v.subVectors(_t, drone.pos);
    let L = _v.length();
    // far from the cruise line (just back from the island's middle, or from watching someone inland): fly
    // straight back to it, quickly, above the trees, and only then down into the water
    if (L > 20) {
      const T = cur!.T, gr = Math.max(T.ground(drone.pos.x, drone.pos.z), T.over ? T.over(drone.pos.x, drone.pos.z) : -1e9);
      const hz = Math.hypot(_v.x, _v.z);
      if (gr > -0.5 && hz > 12) { _v.y = Math.max(gr + 4, 3) - drone.pos.y; L = _v.length(); }
      _v.multiplyScalar(Math.min(L * 0.5, 18) / Math.max(L, 1e-4));
    } else _v.multiplyScalar(Math.min(L * 1.4, L > 6 ? 4.5 : 3) / Math.max(L, 1e-4));
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.5));
    pathPoint(drone.s + 9 / Math.max(pathRate(drone.s), 1e-3), _a);
    const dx = _a.x - drone.pos.x, dz = _a.z - drone.pos.z, dy = _a.y - drone.pos.y;
    let wantYaw = Math.atan2(-dx, -dz) + (Math.sin(t * 0.09 * persona.sway) * 0.45 + Math.sin(t * 0.031 + 1) * 0.3) * (1 - interestW) * persona.sway;
    let wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) * 0.6 - 0.1 + Math.sin(t * 0.07) * 0.12;
    if (interestW > 0.01 && hasI) {
      const ix = _i.x - drone.pos.x, iz = _i.z - drone.pos.z, iy = _i.y - drone.pos.y;
      wantYaw += angDiff(Math.atan2(-ix, -iz), wantYaw) * interestW * 0.8;
      wantPitch += (Math.atan2(iy, Math.hypot(ix, iz)) - wantPitch) * interestW * 0.7;
    }
    drone.yaw += angDiff(wantYaw, drone.yaw) * Math.min(1, dt * 0.7 * persona.turn);
    drone.pitch += (wantPitch - drone.pitch) * Math.min(1, dt * 0.7 * persona.turn);
  } else {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + joy.y;
    const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + joy.x;
    const u = (keys.has('KeyE') || keys.has('Space') ? 1 : 0) - (keys.has('KeyQ') || keys.has('KeyC') ? 1 : 0) + vert.v;
    if (keys.has('ArrowLeft')) drone.yaw += dt * 1.2;
    if (keys.has('ArrowRight')) drone.yaw -= dt * 1.2;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.8 : 1;
    const cp = Math.cos(drone.pitch), sy = Math.sin(drone.yaw), cy = Math.cos(drone.yaw);
    _v.set(-sy * cp * f + cy * r, Math.sin(drone.pitch) * f + u, -cy * cp * f - sy * r);
    if (_v.lengthSq() > 1) _v.normalize();
    _v.multiplyScalar((drone.pos.y > 0 ? 8 : 3.6) * boost);   // more power; much faster in the open air
    drone.vel.lerp(_v, 1 - Math.exp(-dt * 1.8));
    if (now - drone.lastInput > 90000) setMode('auto');
  }
  // by an island, under water: the beach shelves up to nothing, so turn back toward deeper water
  // rather than being squeezed between the sand and the surface
  if (cur!.loc.land && drone.pos.y < 0 && !watch.r) {
    const f = cur!.loc.f, h0 = f(drone.pos.x, drone.pos.z);
    if (h0 > -1.9) {
      const gx = f(drone.pos.x + 1.5, drone.pos.z) - f(drone.pos.x - 1.5, drone.pos.z), gz = f(drone.pos.x, drone.pos.z + 1.5) - f(drone.pos.x, drone.pos.z - 1.5), gl = Math.hypot(gx, gz) || 1;
      const k = clamp((h0 + 1.9) * 1.5, 0, 2.5);
      const vn = (drone.vel.x * gx + drone.vel.z * gz) / gl;
      if (vn > 0) { drone.vel.x -= gx / gl * vn; drone.vel.z -= gz / gl * vn; }   // no further up the slope
      drone.vel.x -= gx / gl * k * dt * 3; drone.vel.z -= gz / gl * k * dt * 3;
    }
  }
  // look ahead along the way we are moving and start climbing well before a rock or coral head
  // (flown by hand, the forest is trees to weave between, not a roof to keep above)
  const G = drone.mode === 'manual' ? cur!.T.top : cur!.T.ground, hs = Math.hypot(drone.vel.x, drone.vel.z);
  if (hs > 0.05 && !(watch.r && !watch.pov)) {   // (watching someone, the camera's own spot already keeps clear of the ground: no early climbing away from their eye level)
    let ahead = -1e9;
    // (outside the cave, its rock counts as ground to climb over; inside the tunnel, the roof doesn't)
    const cv = cur!.cave, outside = !cv || cv.topAt(drone.pos.x, drone.pos.z) < drone.pos.y + 0.5;
    for (const s of [0.5, 1.0, 1.6, 2.4]) {
      const ax = drone.pos.x + drone.vel.x * s, az = drone.pos.z + drone.vel.z * s;
      // (the cave rock counts only where it is actually solid at our height: a tunnel mouth ahead is a way in, not a wall)
      ahead = Math.max(ahead, G(ax, az), outside && cv && cv.sd(ax, drone.pos.y, az) < 0.8 ? cv.topAt(ax, az) : -1e9);
    }
    const want = ahead + 1.0;
    if (drone.pos.y < want) drone.vel.y = Math.max(drone.vel.y, Math.min(1.6, (want - drone.pos.y) * 1.1));
  }
  drone.pos.addScaledVector(drone.vel, dt);
  if (drone.mode === 'manual' || watch.r) cur!.shore?.push?.(drone.pos);   // (round the trunks)
  // watching from above: never down inside the forest roof
  // (except close by it, where the trees are opened up anyway: there it may come down to eye level)
  // (once down under the trees with it, it stays down among the trunks rather than being lifted back over the roof)
  const openR = Math.max(13, watch.dist * 2.2);
  if (watch.r && !watch.pov && cur!.T.over && Math.hypot(drone.pos.x - watch.r.pos.x, drone.pos.z - watch.r.pos.z) > openR - 0.5) {
    const roof = cur!.T.over(drone.pos.x, drone.pos.z);
    if (drone.pos.y > roof - 2 || Math.hypot(drone.pos.x - watch.r.pos.x, drone.pos.z - watch.r.pos.z) > openR + 12) drone.pos.y = Math.max(drone.pos.y, roof + 1.5);
  }
  // keep a clear bubble: the floor is the highest ground in a ring around the camera, not just under it,
  // and we rise onto it smoothly rather than popping up
  // (watching someone close by, the bushes and trees around them are opened up: only the bare ground counts)
  const Gc = watch.r && !watch.pov && Math.hypot(drone.pos.x - watch.r.pos.x, drone.pos.z - watch.r.pos.z) < Math.max(13, watch.dist * 2.2) + 12 ? cur!.T.h : G;
  let fh = Gc(drone.pos.x, drone.pos.z);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; fh = Math.max(fh, Gc(drone.pos.x + Math.cos(a) * 0.7, drone.pos.z + Math.sin(a) * 0.7) - 0.25); }
  const clear = watch.r && !watch.pov ? 0.4 : 0.75;   // (watching someone close up: down nearer their eye level)
  if (drone.pos.y < fh + clear) {
    drone.pos.y = Math.max(fh + 0.3, drone.pos.y + (fh + clear - drone.pos.y) * Math.min(1, dt * 6));
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
  // the surface: the drone punches through it rather than hovering in it
  const wasUp = drone.pos.y - drone.vel.y * dt > 0.2;
  const upShot = !!shot && shot.pos.y > 0.3;   // filming something ashore: out of the water and back
  const mayRise = drone.mode === 'manual' || drone.sky || upShot || !!watch.r, mayDive = drone.mode === 'manual' || (!drone.sky && !upShot && !watch.r);
  // filming from the waterline (a leap out of the sea): once near the surface, ride it, half in and half out,
  // for as long as the shot lasts; afterwards on down into the sea (or up, if it came down from the sky)
  if (drone.mode === 'auto' && shot?.surface && Math.abs(drone.pos.y) < 1.2) { drone.skim = Math.max(drone.skim, 0.6); drone.skimDir = drone.sky ? 1 : -1; }
  if (drone.mode === 'manual') {
    // flown by hand it may stop anywhere, the waterline included (half in the sea, half in the air)
    const prevY = drone.pos.y - drone.vel.y * dt;
    if ((prevY > 0) !== (drone.pos.y > 0)) crossSurface(drone.pos.y > 0);
    drone.skim = 0;
  } else if (drone.skim > 0) {
    // riding the surface on its way through: a few seconds with the lens at the waterline, level, the
    // swell washing over it, before going on up into the air or down into the sea
    drone.skim -= dt;
    drone.pos.y += (0 - drone.pos.y) * Math.min(1, dt * 3); drone.vel.y = 0;
    drone.pitch += (0.02 - drone.pitch) * Math.min(1, dt * 1.5);
    if (drone.skim <= 0) { drone.pos.y = drone.skimDir > 0 ? 0.5 : -0.75; crossSurface(drone.skimDir > 0); }
  } else if (!wasUp && drone.pos.y > -0.7) {
    if (mayRise && drone.vel.y > 0.25) { drone.skim = rr(4, 8); drone.skimDir = 1; drone.pos.y = -0.3; }
    else { drone.pos.y = -0.7; if (drone.vel.y > 0) drone.vel.y = 0; }
  } else if (wasUp && drone.pos.y < 0.5) {
    if (mayDive && drone.vel.y < -0.25) { drone.skim = rr(4, 8); drone.skimDir = -1; drone.pos.y = 0.3; }
    else { drone.pos.y = 0.5; if (drone.vel.y < 0) drone.vel.y = 0; }
  }
  if (drone.pos.y > SKY_MAX) { drone.pos.y = SKY_MAX; if (drone.vel.y > 0) drone.vel.y = 0; }
  const lim = cur!.loc.land ? cur!.loc.land.roam : LIMIT;   // (by an island, the whole island)
  drone.pos.x = clamp(drone.pos.x, -lim, lim); drone.pos.z = clamp(drone.pos.z, -lim, lim);
  drone.pitch = clamp(drone.pitch, -1.25, 1.25);
  yawRate += (angDiff(drone.yaw, prevYaw) / Math.max(dt, 1e-3) - yawRate) * Math.min(1, dt * 3);
  drone.roll += ((watch.r ? 0 : -yawRate * 0.18) - drone.roll) * Math.min(1, dt * 2);   // (watching someone: the horizon stays level as the camera circles)
  camera.position.copy(drone.pos); camera.position.y += Math.sin(t * 0.8) * 0.04 * (drone.skim > 0 && lastShot?.surface ? 0.2 : 1);
  // just above the sea the camera rides the swell, rising, falling and rolling with it
  const ride = drone.pos.y > -0.6 ? 1 - smooth(1.5, 5, drone.pos.y) : 0;
  // (at the waterline it rides a little behind the swell, so the line between sea and air rises and falls across the view)
  const atLine = drone.skim > 0 || (drone.mode === 'manual' && Math.abs(drone.pos.y) < 0.6) ? 1 : 0;
  // (waiting for a leap: right on the swell and a hair above it, so the far sea and the sky over it fill most of the frame)
  const lineUp = atLine && lastShot?.surface && drone.mode === 'auto' ? 1 : 0;
  camera.position.y += ride * swellAt(drone.pos.x, drone.pos.z) * (1 - 0.25 * atLine * (1 - lineUp)) + atLine * (0.06 * Math.sin(t * 1.3) + 0.04 * Math.sin(t * 2.9 + 1)) * (1 - 0.7 * lineUp) + 0.1 * lineUp;
  // a look around while cruising: the drag turns the view, and once let go it drifts back ahead
  if (drone.mode === 'manual') { drone.yaw += look.yaw; drone.pitch = clamp(drone.pitch + look.pitch, -1.25, 1.25); look.yaw = look.pitch = 0; }
  else if (!look.held && now - look.let > 900) { const k = 1 - Math.exp(-dt * 0.8); look.yaw -= look.yaw * k; look.pitch -= look.pitch * k; }
  // filming a hunt close up: a longer lens (the view narrows), and the slight life of a hand-held camera
  const huntCam = (!!lastShot?.close || (drone.sky && !!flyRun?.burst && !!cur?.flyfish?.flying())) && drone.mode === 'auto' && !watch.r;   // (racing alongside flying fish too)
  huntK += ((huntCam ? 1 : 0) - huntK) * Math.min(1, dt * 0.9);
  // right up against something big: a wider lens, so it fills and overflows the frame
  const giantCam = lastShot?.giant && lastShot.phase === 'observe' && drone.mode === 'auto' && !watch.r ? lastShot.wide ?? 1 : 0;
  giantK += (giantCam - giantK) * Math.min(1, dt * 0.6);
  if (lastShot?.phase === 'observe' && obsAt === 0) obsAt = now; else if (lastShot?.phase !== 'observe') obsAt = 0;
  const zoomOn = !!lastShot?.zoom && lastShot.phase === 'observe' && !lastShot.giant && obsAt > 0 && now - obsAt < 9000 && drone.mode === 'auto' && !watch.r;
  zoomK += ((zoomOn ? 1 : 0) - zoomK) * Math.min(1, dt * (zoomOn ? 0.9 : 0.5));   // (in gently, and gently back out)
  const fov = 70 - 24 * huntK + 12 * giantK - 26 * zoomK;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const shake = huntK * (Math.sin(t * 6.3) * 0.004 + Math.sin(t * 11.7 + 1) * 0.0025);
  camera.rotation.set(shake + drone.pitch + look.pitch + Math.sin(t * 0.6) * 0.008 + ride * U.uWave.value * 0.04 * Math.sin(t * 0.52 + 1.2), drone.yaw + look.yaw, drone.roll + Math.sin(t * 0.45) * 0.01 + ride * U.uWave.value * 0.06 * Math.sin(t * 0.41));
  applyView(dt, t);
}
// The view: through the drone's own camera, or from a little behind it, with the drone in the picture —
// it floats and sways as a real one does: nosing down as it speeds up and lifting as it slows, banking
// into its turns, bobbing on the swell of the water; its props spin with the thrust and its lamps glow.
// Its size (under half a metre) gives everything around it a scale.
let viewMode: 'fpv' | 'chase' = (() => { try { return localStorage.getItem('seaglass.view') === 'chase' ? 'chase' : 'fpv'; } catch (e) { return 'fpv'; } })();
const droneModel = makeDrone(); oceanScene.add(droneModel.group);
const chase = { pos: new THREE.Vector3(), on: false, acc: new THREE.Vector3(), prevVel: new THREE.Vector3(), pitch: 0, roll: 0 };
const _cf = new THREE.Vector3(), _cr = new THREE.Vector3(), _ct = new THREE.Vector3();
function applyView(dt: number, t: number) {
  const on = viewMode === 'chase' && !watch.r;
  droneModel.group.visible = on;
  camera.updateMatrixWorld(); camera.getWorldDirection(_cf);
  if (!on) { chase.on = false; U.uLampPos.value.copy(camera.position); U.uLampDir.value.copy(_cf); return; }
  // how it is being pushed about: acceleration (smoothed), to tilt it
  chase.acc.lerp(_ct.subVectors(drone.vel, chase.prevVel).divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 4)); chase.prevVel.copy(drone.vel);
  const hx = -Math.sin(drone.yaw), hz = -Math.cos(drone.yaw);           // its heading (level)
  const fwdAcc = chase.acc.x * hx + chase.acc.z * hz, latAcc = chase.acc.x * -hz + chase.acc.z * hx;
  chase.pitch += (clamp(drone.pitch * 0.55 - fwdAcc * 0.08, -0.5, 0.5) - chase.pitch) * Math.min(1, dt * 2.5);
  chase.roll += (clamp(-yawRate * 0.3 - latAcc * 0.06, -0.45, 0.45) - chase.roll) * Math.min(1, dt * 2);
  const g = droneModel.group;
  g.position.copy(drone.pos); g.position.y += Math.sin(t * 1.1) * 0.012 + Math.sin(t * 0.43 + 2) * 0.008;
  g.rotation.set(-chase.pitch + Math.sin(t * 0.7) * 0.015, drone.yaw + Math.PI + Math.sin(t * 0.37) * 0.02, chase.roll + Math.sin(t * 0.9 + 1) * 0.02, 'YXZ');
  droneModel.animate(dt, Math.min(1, drone.vel.length() / 3), U.uLamp.value);
  // the camera: a little behind, above and to one side, following with a soft lag, looking past the drone
  _cr.set(-_cf.z, 0, _cf.x).normalize();
  _ct.copy(drone.pos).addScaledVector(_cf, -1.55).addScaledVector(_cr, 0.32); _ct.y += 0.42;
  if (cur) { const gy = cur.T.ground(_ct.x, _ct.z) + 0.4; if (_ct.y < gy) _ct.y = gy; }
  if (drone.pos.y < 0 && _ct.y > -0.3) _ct.y = -0.3;
  if (!chase.on) chase.pos.copy(_ct); else chase.pos.lerp(_ct, 1 - Math.exp(-dt * 2.6));
  chase.on = true;
  camera.position.copy(chase.pos);
  camera.lookAt(_ct.copy(drone.pos).addScaledVector(_cf, 4));
  camera.rotateZ(drone.roll * 0.3);
  // the lamp shines from the drone's lamps, the way it points
  U.uLampPos.value.set(0, 0.02, 0.24).applyMatrix4(g.matrixWorld.compose(g.position, g.quaternion, g.scale));
  U.uLampDir.value.set(0, 0, 1).applyQuaternion(g.quaternion);
}
function setView(v: 'fpv' | 'chase') {
  viewMode = v;
  try { localStorage.setItem('seaglass.view', v); } catch (e) { /* ignore */ }
  $('btnView').setAttribute('aria-pressed', String(v === 'chase'));
}

/* ================= the guide's character ================= */
let persona: Persona = personaById((() => { try { return localStorage.getItem('seaglass.persona'); } catch (e) { return null; } })());
let lastSay = -1e9, chatT = 0;
function applyPersona() {
  director.dwellK = persona.dwell; director.distK = persona.distK;
  director.styles = persona.styles; director.giantW = persona.giant; director.spinK = persona.spinK;
  director.switchK = persona.switchK; director.minHold = persona.minHold; director.rest = persona.rest;
  director.weight = (s) => persona.weight(s, taste(s)) * reachable(s);
  director.jumpTo = (s) => !!persona.jumpTo?.(s, taste(s));
  for (const b of $('personas').querySelectorAll('button')) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.p === persona.id));
  $('personaBlurb').textContent = persona.blurb;
}
// something deep inside the cave, seen from outside it, cannot be filmed from where the drone is: it
// would only press against the rock (it is filmed on the way through the cave instead)
function reachable(s: Subject) {
  const cv = cur?.cave, p = s.pos(); if (!cv || !p || s.kind === 'cave') return 1;
  return cv.skyAt(p.x, p.y, p.z) < 0.5 && camCave > 0.6 ? 0 : 1;
}
// what the guide knows of a subject, to weigh it: a shark? not yet in the field guide? and the hour
const speciesKey = new Map<string, string | null>();
function taste(s: Subject): Taste {
  const lk = (cur?.loc.id ?? '') + '|' + s.label;
  let key = speciesKey.get(lk);
  if (key === undefined && cur) { const e = guideEntries(cur.loc).find((x) => s.label.startsWith(x.ja)); key = e ? cur.loc.id + ':' + e.id : null; speciesKey.set(lk, key); }
  return { shark: isShark(s), isNew: !!key && !seen.has(key), night: skyNow?.night ?? 0, golden: skyNow?.golden ?? 0, whim };
}
// what the carefree guide fancies just now (a kind of subject), changing every few minutes
let whim = '', whimT = 0;
const WHIMS = ['school', 'turtle', 'manta', 'critter', 'octopus', 'big', 'giant', 'anemone', 'hunt', 'cave'];
function isShark(s: Subject) {
  const sp = cur?.loc.species.find((x) => s.label.startsWith(x.ja));
  return !!sp && !!(SHAPES as any)[sp.shape]?.lofted;   // every shark body is lofted
}
// the first sentence of a creature's field-guide note, for the chatty guide
function noteOf(label: string) {
  const e = cur ? guideEntries(cur.loc).find((x) => label.startsWith(x.ja)) : null;
  return e ? e.note.split('。')[0] + '。' : '';
}
// a remark in the guide's own voice (auto-cruise only: in manual flight you are the guide)
function say(mood: Mood, vars: Record<string, string> = {}, force = false) {
  return;   // (the guide no longer talks: its character shows in how it moves)
  if (!cur || drone.mode !== 'auto') return;
  const now = performance.now();
  if (!force && now - lastSay < persona.gap * 1000) return;
  const text = line(persona, mood, { sea: cur.loc.name, ...vars });
  if (!text) return;
  lastSay = now; chatT = 0;
  recordLog('voice', text);
  if (logQueue.length < 3) logQueue.push({ text, label: `GUIDE · ${persona.ja}` });
}
function setPersona(p: Persona) {
  persona = p;
  try { localStorage.setItem('seaglass.persona', p.id); } catch (e) { /* ignore */ }
  applyPersona();
  drone.skyWait = rr(...persona.skyGap);
  hint(`ガイド：${p.ja} — ${p.blurb}`);
  // greet once the choice has settled (clicking through the characters shouldn't make them all speak)
  clearTimeout(helloTimer);
  helloTimer = window.setTimeout(() => { logQueue.length = 0; lastSay = -1e9; say('hello', {}, true); }, 1800);
}
let helloTimer = 0;

/* ================= above the water ================= */
function crossSurface(up: boolean) {
  splash();
  if (cur) applySky(cur.loc);   // the night is lit differently on each side of the surface
  seaLog('observe', up ? '水面を抜けて空へ' : '海の中へ');
}
// natural: the guide decided (it goes back on its own after a while); otherwise you asked, and it stays longer
function skyLabel() { $('btnSky').setAttribute('aria-pressed', String(drone.sky)); $('btnSky').querySelector('span')!.textContent = drone.sky ? '海へ' : '空へ'; }
function setSky(on: boolean, natural = false) {
  if (!cur) return;
  if (watch.r && !natural) stopWatch(false);
  drone.sky = on; drone.skyT = 0; drone.skyAge = 0; flyRun = null;
  drone.seaUntil = on ? 0 : performance.now() + (natural ? 60000 : 150000);   // back into the sea: no flying straight off to the residents ashore
  if (drone.mode !== 'auto') setMode('auto');
  director.reset(); lastShot = null;
  if (!on) { drone.s = nearestS(drone.pos); drone.skyWait = rr(...persona.skyGap); }
  else drone.skyStay = rr(...persona.skyStay) * (natural ? 1 : 2.5);
  skyLabel();
  say(on ? 'skyUp' : 'skyDown', {}, natural);
}
// Every so often the guide rises into the sky on its own, and comes back down: more often on a clear
// night with a meteor shower on, never from inside the cave or in the middle of filming something.
// (海だけ: the cruise stays in the sea; going up is then only when asked)
let seaOnly = (() => { try { return localStorage.getItem('seaglass.seaOnly') === '1'; } catch (e) { return false; } })();
function setSeaOnly(on: boolean) { seaOnly = on; try { localStorage.setItem('seaglass.seaOnly', on ? '1' : '0'); } catch (e) { /* ignore */ } $('btnSeaOnly').setAttribute('aria-pressed', String(on)); if (on && drone.sky) setSky(false, true); }
function skySchedule(dt: number) {
  if (!cur || drone.mode !== 'auto' || watch.r) return;
  if (seaOnly && !drone.sky) return;
  if (!drone.sky) {
    const s = skyNow!, clearNight = s.night * (1 - U.uCloud.value);
    drone.skyWait -= dt * (1 + clearNight + (activeShower(clock.ms) ? clearNight * 2 : 0));   // (the wait runs down while filming too)
    if (drone.skyWait <= 0 && !lastShot && !(cur.cave && camCave < 0.95)) setSky(true, true);   // go up once the shot in hand is done
  } else if ((drone.skyAge += dt) > drone.skyStay) setSky(false, true);   // (the time up there counts while filming the residents from the sky too)
}
// aurora: the auroral oval sits around 65-70° magnetic latitude; ?aurora=1 previews it anywhere
const auroraParam = new URLSearchParams(location.search).get('aurora');
function auroraAt(lat: number) { return auroraParam ? Number(auroraParam) || 1 : smooth(55, 65, Math.abs(lat)) * 0.8; }

/* ================= sky from the clock ================= */
let skyNow = null as ReturnType<typeof skyState> | null;
const _starDir = new THREE.Vector3(0.12, 0.98, 0.16).normalize(), _nightShaft = new THREE.Color(0.5, 0.74, 1.0), _nightTint = new THREE.Color(0.8, 0.88, 1.0);
let nightLift = 0;
const _grey = new THREE.Color();
let wx: Weather = FAIR, wxTimer = 0, flashT = 0, nextFlash = 20;
// the real weather stands for 'today': live, or within half a day of now, in the real season
const liveWeather = () => (clock.season === 'now' && Math.abs(clock.ms - Date.now()) < 12 * 3600000 && wx.ok ? wx : FAIR);
async function refreshWeather(loc: Sea) {
  const w = await fetchWeather(loc.id, loc.lat, loc.lon);
  if (cur && cur.loc === loc) { wx = w; applySky(loc); updateTimeUi(); }
}
let camCave = 1, camExpo = 1.4;   // how much open sky the camera sees (1 outside the cave), and exposure
// the lamp comes on by itself in the dark of the cave, and wherever the water around the camera grows
// dim: deep down, at dawn and dusk, at night (with a little hysteresis, so it does not flicker)
function wantLamp() {
  if (camCave < 0.3) return true;
  if (camera.position.y > -0.15) return false;   // (out of the water: never; just under the surface it can be as dark as deeper)
  const l = pipLight(-camera.position.y);
  return lampOn ? l < 0.078 : l < 0.062;   // (only when it is really dim: not on a bright day a little deep)
}
// The light of the moment: the sun or the moon (or the stars), lifted at night so it stays legible, and
// dimmed by cloud. The little hunt window, looking under the water, is lit as it is down there.
function lightFor(s: ReturnType<typeof skyState>, airView: boolean) {
  U.uSunDir.value.set(...s.sunDir);
  U.uSunI.value = s.sunI; U.uAmb.value = s.amb; U.uNight.value = s.night;
  U.uTint.value.setRGB(...s.tint);
  U.uShaftCol.value.setRGB(...s.shaftCol); U.uShaftI.value = s.shaftI; U.uGolden.value = s.golden;
  // Night as a low-light camera would dream it: the moon becomes a silver-blue key light with its own
  // shafts and caustics, the water keeps a deep blue glow, and even a moonless night stays legible.
  // (Rendering only: the animals still live by the real darkness in s.)
  // Without the moon, starlight takes its place (a little brighter than real), coming from high overhead,
  // so every hour of the night reads the same way rather than going black before moonrise.
  // Seen from the air it is a little darker than below, but never black: the reef still shows through.
  // (by an island the night ashore is kept open and gentle, as it is under the water, rather than black)
  // (and it begins as the sun fades, not only once it is fully night: no dark valley in the late dusk between the two)
  const nk = Math.max(s.night, smooth(0.22, 0.03, s.sunI) * 0.85);
  const n = nk * (airView ? (cur?.loc.land ? 0.95 : 0.75) : 1), moon = s.moonI, glow = n * (0.8 + 0.2 * moon);
  // the sun is the star of the scene: by day it falls hard and bright, with deep blue shade beside it,
  // and strong shafts and caustics; low in the sky its light turns gold and the shafts stand out most.
  // A full moon is bright enough to read by: silver shafts and caustics of its own; a moonless night stays
  // dim and soft (the drama is natural light's alone — the drone's lamp stays gentle)
  const day = s.sunI * (1 - n);
  U.uAmb.value = s.amb * (1 - 0.12 * day) + glow * (0.45 + 0.2 * moon);
  U.uSunI.value = Math.max(s.sunI * (1 + 0.38 * day) + 0.3 * s.golden, n * (0.32 + 0.75 * moon));
  U.uShaftI.value = Math.max(s.shaftI * (1 + 0.6 * day) + 1.4 * s.golden, n * (0.12 + 0.95 * moon));
  const starlit = n * Math.max(0, 1 - moon / 0.3);
  if (starlit > 0) U.uSunDir.value.lerp(_starDir, starlit).normalize();
  U.uShaftCol.value.lerp(_nightShaft, n);
  U.uTint.value.lerp(_nightTint, n);   // moonlight is only a little bluer than sunlight; keep the reef's colours
  nightLift = n;
  const w = liveWeather();
  const cloud = w.cloud * (w.rain > 0 ? 1 : 0.85);
  U.uSunI.value *= 1 - 0.65 * cloud; U.uShaftI.value *= 1 - 0.85 * cloud; U.uAmb.value *= 1 - 0.22 * cloud;
}
function applySky(loc: Sea, airView = drone.pos.y > 0) {
  const s = skyState(clock.ms, loc);
  skyNow = s;
  lightFor(s, airView);
  const w = liveWeather();
  const cloud = w.cloud * (w.rain > 0 ? 1 : 0.85);
  const grey = (c: THREE.Color) => { const l = c.r * 0.3 + c.g * 0.5 + c.b * 0.2; c.lerp(_grey.setRGB(l, l, l * 1.05), cloud * 0.7); };
  grey(U.uSkyLo.value); grey(U.uSkyHi.value);
  U.uCloud.value = cloud;
  U.uRain.value = w.code >= 51 && w.code <= 57 ? 0.25 : Math.min(1, w.rain / 3);
  U.uWave.value = Math.min(2.4, Math.max(0.45, 0.55 + (w.wave ?? w.wind / 7) * 0.65));
  // the swell: today's measured wave height (never more than twice the usual, a reef lagoon is sheltered), or the usual
  U.uSwell.value = Math.min(w.wave ?? loc.swellHs ?? 1, (loc.swellHs ?? 1) * 2) / 2.37;
  setRain(U.uRain.value);
  U.uSkyLo.value.setRGB(...s.skyLo); U.uSkyHi.value.setRGB(...s.skyHi);
  U.uMoonDir.value.set(...s.moonDir); U.uMoonI.value = s.moonI;
  U.uAirSun.value.set(...s.sunAir); U.uAirMoon.value.set(...s.moonAir); U.uMoonIllum.value = s.moonIllum;
  U.uStarM.value.fromArray(s.starM);
  setPlanets(planets(clock.ms));
  U.uAurora.value = auroraAt(loc.lat);
  // tidal stream: flood one way, ebb the other; strongest mid-tide
  const k = clamp(s.tideRate / (loc.tide.amp * 0.00016 + 1e-6), -1, 1);
  const ax = loc.tide.axis;
  U.uCurrent.value.set(ax[0] * k * 0.8 + 0.12, ax[1] * k * 0.8 + 0.05);
  setMood({ phase: s.phase, night: s.night, twilight: s.twilight, sea: loc.id });
  if (!lampManual) setLamp(wantLamp(), false);
  cur!.eco.setSky(s, U.uCurrent.value);
  if (s.phase !== lastPhase) { if (lastPhase) { seaLog('phase', (loc.pelagic ? PHASE_LOG_OPEN : loc.habitat === 'kelp' ? PHASE_LOG_KELP : PHASE_LOG)[s.phase]); say(s.phase as Mood); } lastPhase = s.phase; }
  if (U.uRain.value > 0.2 && !saidRain) { saidRain = true; say('rain'); }
}
const PHASE_LOG: Record<string, string> = {
  dawn: '夜明け。夜行性の魚が岩陰へ戻り、昼の魚たちが動き出す',
  noon: '日中。小魚がプランクトンを食べに群れ、光の筋がいちばん強い時間',
  dusk: '夕暮れ。昼の魚が寝床へ向かい、捕食者がいちばん活発になる時間',
  night: '夜。昼の魚はサンゴの隙間で眠り、夜行性の魚とプランクトンが上がってくる',
};
const PHASE_LOG_OPEN: Record<string, string> = {
  dawn: '夜明け。夜のあいだ表層に上がっていたプランクトンが、光を避けて深みへ沈んでいく',
  noon: '日中。光は数百mの深さまで届き、その下はずっと暗い青',
  dusk: '夕暮れ。深海から無数のプランクトンと小さな生きものが表層へ上がってくる、地球でいちばん大きな移動の時間',
  night: '夜。灯りひとつない海の上に、星がいちばん多く見える',
};
const PHASE_LOG_KELP: Record<string, string> = {
  dawn: '夜明け。ケルプの葉の間へ光が差し、昼の魚たちが動き出す',
  noon: '日中。水面に広がるケルプの天蓋から、岩と砂の海底へ光が差し込む',
  dusk: '夕暮れ。ケルプの森が影に包まれ、岩陰へ戻る魚が増えていく',
  night: '夜。昼の魚は岩陰やケルプの間で休み、長い葉はうねりに揺れ続ける',
};
let lastPhase = '';

/* ---------- today's sea: a per-day journal of what happened ---------- */
interface LogEntry { ms: number; kind: string; text: string }
let dayLog: LogEntry[] = [], dayKey = '', logSaveT = 0;
let saidRain = false;
const LOG_KIND: Record<string, string> = { robot: '住人', voice: 'ガイド', phase: '時間', sighting: '発見', observe: '観察', hunt: '狩り', catch: '捕食', breathe: '息継ぎ', whale: 'クジラ', breach: '跳躍', rest: '休息', manta: '採餌' };
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
const logQueue: { text: string; at?: Where; label?: string; kind?: string; ref?: any }[] = [];
const recent = new Map<string, number>();
let logShownAt = -1e9;
// While a hunt is on the caption, it stays with that hunt until it ends: other hunts elsewhere wait
// (they still go into the day's log). Everyday moments of the same kind show at most every few minutes.
const huntLock = { ref: null as any, until: 0 };
const QUIET: Record<string, number> = { breathe: 300e3, rest: 300e3, manta: 240e3, octopus: 180e3 };
const lastKind = new Map<string, number>();
const sameHunt = (a: any, b: any) => !!a && !!b && (a === b || Math.hypot(a.x - b.x, a.z - b.z) < 8);
function seaLog(kind: string, text: string, at?: Where) {
  recordLog(kind, text);
  const now = performance.now();
  if ((recent.get(text) ?? -1e9) > now - 90000) return;
  if (QUIET[kind] && (lastKind.get(kind) ?? -1e9) > now - QUIET[kind]) return;
  const ref = at?.() ?? null;
  if ((kind === 'hunt' || kind === 'catch') && now < huntLock.until && !sameHunt(ref, huntLock.ref)) return;
  recent.set(text, now); lastKind.set(kind, now);
  if (kind === 'phase') logQueue.unshift({ text }); else if (logQueue.length < 3) logQueue.push({ text, at, kind, ref });
}
function pumpLog(now: number) {
  if (!logQueue.length || now - logShownAt < 20000 || $('toast').classList.contains('on')) return;
  logShownAt = now;
  const e = logQueue.shift()!;
  // (what happens to the one being filmed is told by the commentary, not here)
  const sp = lastShot?.subject.pos(), ep = e.ref ?? (e.at ? e.at() : null);
  if (sp && ep && Math.hypot(sp.x - ep.x, sp.y - ep.y, sp.z - ep.z) < 8) { logShownAt = now - 15000; return; }
  noticeSubj = null;
  // (a hunt on the caption: keep with it — its end, caught or got away, releases it)
  if (e.kind === 'hunt' || e.kind === 'catch') {
    if (huntLock.until > now && !sameHunt(e.ref, huntLock.ref)) return;
    const ends = e.kind === 'catch' || /振り切|空を切|追いつけ|あきらめ/.test(e.text);
    huntLock.ref = e.ref; huntLock.until = now + (ends ? 9000 : 45000);
  }
  showToast(e.label ?? (ep ? `SEA LOG ・ ${bearing(ep)}` : 'SEA LOG'), e.text, '');
  markAt = e.at || null; markText = e.text; markUntil = e.kind === 'hunt' && huntLock.until > now ? huntLock.until : now + 9000;
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
// which way something is from the camera, and how far: "↗ 40m"
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function bearing(p: { x: number; y: number; z: number }) {
  const dx = p.x - camera.position.x, dz = p.z - camera.position.z, yaw = drone.yaw;
  const f = dx * -Math.sin(yaw) + dz * -Math.cos(yaw), r = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
  const k = ((Math.round(Math.atan2(r, f) / (Math.PI / 4)) % 8) + 8) % 8, d = Math.hypot(dx, p.y - camera.position.y, dz);
  return `${ARROWS[k]} ${d < 10 ? d.toFixed(0) : Math.round(d / 5) * 5}m`;
}
// Notices: something worth a look, in view and not far, that the camera is not filming (a school, a
// big one, something happening): one quiet line, with which way and how far; a tap goes to it
let noticeT = 0, noticeSubj: Subject | null = null;
const noticed = new Map<string, number>();
function scanNotices(dt: number, now: number) {
  if ((noticeT -= dt) > 0 || !cur || !captionOn || drone.mode !== 'auto' || watch.r || drone.sky) return;
  noticeT = 2;
  if (now - logShownAt < 20000 || $('toast').classList.contains('on')) return;
  const fwd = U.uCamFwd.value, filming = lastShot?.subject;
  let best: Subject | null = null, bs = 0;
  for (const s of cur.eco.subjects()) {
    if (s === filming || s.key === filming?.key || s.kind === 'cave' || (noticed.get(speciesOf(s)) ?? -1e9) > now - 180000) continue;
    const notable = s.kind === 'giant' || s.kind === 'manta' || s.kind === 'hunt' || (s.kind === 'school' && s.size >= 3) || (s.kind === 'big' && (s.len ?? s.size) >= 1) || (s.kind === 'critter' && s.prio >= 2);
    const p = s.pos(); if (!notable || !p || !s.live()) continue;
    const dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z, d = Math.hypot(dx, dy, dz);
    if (d > 35 || d < 3 || (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d < 0.3) continue;
    const sc = s.prio / (1 + d * 0.05);
    if (sc > bs) { bs = sc; best = s; }
  }
  if (!best) return;
  noticed.set(speciesOf(best), now); logShownAt = now;
  const b = best;
  showToast(`${bearing(b.pos()!)}先に`, `${b.label}`, b.status());
  markAt = () => b.pos(); markText = b.label; markUntil = now + 9000; noticeSubj = b;
  $('toast').classList.add('go');
}
function goToEvent() {
  if (!markAt || !cur) return;
  if (noticeSubj && noticeSubj.live()) { const s = noticeSubj; noticeSubj = null; focusOn({ ...s, key: 'focus:' + s.key, prio: 5 }); return; }
  const at = markAt, text = markText;
  focusOn({ key: 'focus:event', label: text.replace(/[。、].*$/, ''), kind: 'big', prio: 5, size: 1.5, pos: () => at(), status: () => '', live: () => !!at() });
}
$('evMark').onclick = goToEvent;
$('toast').addEventListener('click', goToEvent);

/* ---------- take me to it ---------- */
let rareT = 0;
function announceRare(r: { info: { id: string; ja: string; note: string } }) {
  const el = $('rare');
  (el.querySelector('.t') as HTMLElement).textContent = r.info.ja; (el.querySelector('.n') as HTMLElement).textContent = r.info.note;
  el.classList.add('on'); clearTimeout(rareT); rareT = window.setTimeout(() => el.classList.remove('on'), 11000);
  recordLog('rare', `めったに出会えない光景：${r.info.ja}`);
  if (drone.mode === 'auto' && !watch.r && cur) {
    if (drone.sky && r.info.id !== 'bigbait') setSky(false, true);
    const sj: Subject[] = []; cur.rare.subjects(sj); if (sj[0]) { director.focus(sj[0], drone.pos); lastShot = null; }
  }
}
function focusOn(s: Subject) {
  if (!cur) return;
  if (watch.r) stopWatch(false);
  if (drone.mode !== 'auto') setMode('auto');
  if (drone.sky) setSky(false);
  director.focus(s, drone.pos);
  lastShot = null;
}
const usePost = () => TIERS[tier].post && !noPost && SAFE < 2;
const allSubjects = () => (cur!.residents ? [...cur!.eco.subjects(), ...cur!.residents.subjects()] : cur!.eco.subjects());
function goTo(id: string) {
  if (!cur) return;
  if (id.startsWith('robot:') && cur.residents) {
    const r = cur.residents.list.find((x: any) => 'robot:' + x.id === id);
    if (r) { focusOn(r.subject); showToast('向かっています', `${r.v.name}のところへ`, cur.residents.status(r)); if (isTouch || innerWidth < 900) { guideEl.hidden = true; renderGuide(); } }
    return;
  }
  const oc = cur, cam = drone.pos, near = <T extends { pos: THREE.Vector3 }>(a: T[]) => a.reduce((b, c) => (c.pos.distanceTo(cam) < b.pos.distanceTo(cam) ? c : b));
  const loc = oc.loc, name = guideEntries(loc).find((e) => e.id === id)?.ja ?? (id === 'cave' ? '海底洞窟' : '');
  let s: Subject | null = null;
  // a seabird: go up into the sky, where a few of them come by
  if ((id === 'bait' || id === oc.loc.bait?.sp.id) && oc.bait) {
    // go and find one: out there somewhere the birds are starting to gather
    const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw);
    if (!oc.bait.st.active && oc.bait.start(drone.pos, fx, fz, oc.eco.env)) seaLog('hunt', `沖で${oc.bait.bsp.ja}の大群が身を寄せ合いはじめた。何かに追われている`, () => (oc.bait.st.active ? oc.bait.st.c : null));
    if (drone.sky) setSky(false);
    const bs = oc.bait.subjects()[0];
    if (bs) focusOn(bs);
    return;
  }
  // flying fish: up into the sky, and down to a low run over the sea that puts them up
  if (id === 'tobiuo' && oc.flyfish && !loc.species.some((sp) => sp.id === 'tobiuo')) {
    if (!drone.sky) setSky(true);
    flyRun = { burst: false, t: 0, side: 1 };
    return;
  }
  const flock = oc.birds?.flocks.find((f: any) => f.sp.id === id);
  if (flock) {
    if (!drone.sky) setSky(true);
    const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw);
    flock.birds.slice(0, 3).forEach((b: any, i: number) => {
      b.p.set(cam.x + fx * (25 + i * 6) + fz * (i - 1) * 8, Math.max(cam.y, 0) + 5 + i, cam.z + fz * (25 + i * 6) - fx * (i - 1) * 8);
      b.state = 'fly'; b.fold = 0; b.h = Math.atan2(-fz, -fx) + (i - 1) * 0.4; b.stateT = 0;
    });
    return;
  }
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
    s = { key: 'focus:whale', label: name, kind: 'giant', prio: 5, size: 8, pos: () => (W.active ? W.pod[0].pos : null), status: () => statusOf('whale'), live: () => W.active || W.force };   // (gone when the pod has gone: no card left behind)
  } else if ((loc.critters || []).some((c) => c.id === id) && oc.critters) {
    // a moray, sea snake or jellyfish: the nearest one
    const all: Subject[] = []; oc.critters.subjects(all);
    const mine = all.filter((x) => x.key.split(':')[1] === id && x.live());
    const n = mine.length ? mine.reduce((b, c) => (c.pos()!.x - cam.x) ** 2 + (c.pos()!.z - cam.z) ** 2 < (b.pos()!.x - cam.x) ** 2 + (b.pos()!.z - cam.z) ** 2 ? c : b) : null;
    s = n ? { ...n, key: 'focus:' + id, prio: 5 } : null;
  } else if (ridersFor(loc).some((r) => r.id === id)) {
    // a remora, pilot fish or trevally: go to the big animal that carries it
    const host = oc.fish.find((x: any) => ['whaleshark', 'yogore', 'itachizame', 'galapagoszame'].includes(x.sp.id) && x.sp.habitat !== 'shoal');
    if (host) s = host.focus(cam); else if (oc.mantas.length) { const m = oc.mantas[0]; s = { key: 'focus:manta', label: name, kind: 'manta', prio: 5, size: 4, pos: () => m.pos, status: () => statusOf('manta'), live: () => true }; }
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
  const up = drone.pos.y > 0;
  $('lDepth').textContent = up ? 'HEIGHT' : 'DEPTH';
  $('tDepth').textContent = (up ? drone.pos.y : depth).toFixed(1);
  $('tAlt').textContent = loc.pelagic ? (4800 + drone.pos.y).toFixed(0) : alt.toFixed(1);   // the real bottom, 4.8 km down
  $('tSpd').textContent = drone.vel.length().toFixed(2);
  $('tTemp').textContent = ((liveWeather().sst ?? (loc.tempYear ? seaTemp(clock.ms, loc.lat, loc.tempYear) : loc.temp)) - depth * 0.04 + Math.sin(U.uTime.value * 0.05) * 0.05).toFixed(1);
  $('tVis').textContent = (3 / (U.uFogDen.value * (1 + 0.15 * s.night)) * 0.3).toFixed(0);
  $('tTide').textContent = (s.tideH >= 0 ? '+' : '') + s.tideH.toFixed(1);
  $('tTideDir').textContent = Math.abs(s.tideRate) < 0.000015 ? (s.tideH > 0 ? '満潮' : '干潮') : s.tideRate > 0 ? '上げ潮' : '下げ潮';
  const hdg = ((-drone.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('hdgnum').textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°';
  strip.style.transform = `translateX(${-(hdg + 360) * 2 + compassEl.clientWidth / 2}px)`;
  if (lastShot && $('hint').classList.contains('on')) $('hint').textContent = `観察中：${lastShot.subject.label}（${lastShot.subject.status()}）`;
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
  {
    const w = liveWeather();
    $('wxLine').innerHTML = w.ok
      ? `現地の天気（実況）：<b>${weatherLabel(w)}</b> · 雲 ${Math.round(w.cloud * 100)}% · 風 ${w.wind.toFixed(1)} m/s${w.wave != null ? ` · 波 ${w.wave.toFixed(1)} m` : ''}${w.air != null ? ` · 気温 ${w.air.toFixed(0)}°C` : ''}<br><small>天気データ：Open-Meteo</small>`
      : wx.ok ? '時刻や季節を動かしている間は、晴れの標準的な海になります' : '現地の天気を取得できないため、晴れの標準的な海です';
    const sh = activeShower(clock.ms);
    if (sh) $('wxLine').innerHTML += `<br>${sh.ja}が活動中（${sh.k >= 30 ? '極大のころ' : '見ごろの前後'}）。晴れた夜に空へ出ると流れ星が見えます`;
  }
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
  if (id === 'tobiuo' && cur.flyfish) return cur.flyfish.flying() ? '水面の上を滑空している' : '沖の表層を群れで泳いでいる';
  if (id === 'eel') return U.uNight.value > 0.5 ? '巣穴に引っ込んでいる' : '体を出して餌を待っている';
  return '';
}
const guideEntries = (loc: Sea) => [...loc.species.map((s) => ({ id: s.id, ja: s.ja, sci: s.sci, note: s.note })), ...(loc.extraGuide || []), ...(loc.birds || []).map((b) => ({ id: b.id, ja: b.ja, sci: b.sci, note: b.note })), ...(loc.bait ? [{ id: loc.bait.sp.id, ja: loc.bait.sp.ja, sci: loc.bait.sp.sci, note: loc.bait.sp.note }] : []), ...ridersFor(loc).map((s) => ({ id: s.id, ja: s.ja, sci: s.sci, note: s.note })), ...(loc.critters || []).map((s) => ({ id: s.id, ja: s.ja, sci: s.sci, note: s.note }))];
let panelTab: 'guide' | 'log' | 'island' | 'talk' = 'guide';
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
// the island's residents: what each is doing, how they get on, their diaries and conversations
// everything they have said to each other, conversation by conversation (newest first); in their own
// languages, set down here in Japanese
function renderTalk() {
  const R = cur!.residents!, loc = cur!.loc, t = (ms: number) => localTimeString(ms, loc.tz);
  const who = (id: string) => R.list.find((r: any) => r.id === id);
  const groups: { head: string; at: number; lines: any[] }[] = [];
  const byConv = new Map<number, typeof groups[0]>();
  for (const e of R.talks as any[]) {
    if (e.head) { const g = { head: e.text, at: e.at, lines: [] as any[] }; groups.push(g); byConv.set(e.conv, g); continue; }
    let g = e.conv != null ? byConv.get(e.conv) : undefined;
    if (!g) { g = { head: '', at: e.at, lines: [] }; groups.push(g); if (e.conv != null) byConv.set(e.conv, g); }
    g.lines.push(e);
  }
  const html = groups.filter((g) => g.lines.length).slice(-40).reverse().map((g) => `<section class="conv"><h4><time>${t(g.at)}</time>${g.head || '会話'}</h4><ol>${g.lines.map((e) => {
    const r = e.who ? who(e.who) : null;
    return r ? `<li style="--c:${r.sp.color}"><b><i></i>${r.v.name}</b>${e.text}</li>` : `<li>${e.text}</li>`;
  }).join('')}</ol></section>`).join('');
  return `<h2>会話ログ <span>${loc.name}の住人たち</span></h2>
    <p class="lead">4体はそれぞれ自分だけの言葉で話しています（近くで聞くと声が聞こえます）。なぜかお互いには通じているようです。ここには日本語で残しています。</p>
    ${html || '<p class="empty">まだ誰も話していません。</p>'}`;
}
function renderIsland() {
  const R = cur!.residents!, loc = cur!.loc;
  const t = (ms: number) => localTimeString(ms, loc.tz);
  const cards = R.list.map((r: any) => {
    const rel = R.list.filter((o: any) => o !== r).map((o: any) => { const b = R.bonds[[r.id, o.id].sort().join('|')]; return `<span class="rel s${b.stage}"><i style="background:${o.sp.color}"></i>${o.v.name}：${STAGES[b.stage]}</span>`; }).join('');
    const diary = r.diary.slice(-3).reverse().map((e: any) => `<li><time>${t(e.at)}</time>${e.text}</li>`).join('');
    const st = r.stats, work = r.id === 'dot' ? `小屋の部材 ${st.built}/24` : r.id === 'kame' ? `観察記録 ${st.notes}件` : r.id === 'lantern' ? `目印の石積み ${st.cairns}` : `集めた貝殻 ${st.shells}個・割った貝 ${st.cracked}個`;
    return `<li class="res"><i style="background:${r.sp.color}"></i><b>${r.v.name}</b><em>${r.v.en}</em><span class="st">いま：${R.status(r)}・${R.vitals(r)}</span>
      <p>${r.v.trait}</p><p class="work">${work}</p><div class="rels">${rel}</div>${diary ? `<ol class="diary">${diary}</ol>` : ''}
      <button class="go" type="button" data-go="robot:${r.id}">会いに行く</button><button class="go" type="button" data-watch="${r.id}">上から見守る</button><button class="go" type="button" data-diary="${r.id}">日記帳をひらく</button></li>`;
  }).join('');
  const talk = R.talks.filter((e: any) => !e.head).slice(-6).reverse().map((e: any) => `<li><time>${t(e.at)}</time>${e.who ? `${R.list.find((r: any) => r.id === e.who)?.v.name ?? ''}「${e.text}」` : e.text}</li>`).join('');
  const key = aiKey();
  return `<h2>島の住人 <span>${loc.name}で暮らす4体</span></h2>
    <p class="lead">それぞれが自分の暮らしを持ち、島のどこかで出会うと話をします。はじめは挨拶、次に自己紹介、島で生きるコツ、近況……打ち解けてくると悩みも打ち明けます。見ていないあいだも、暮らしは続いています。</p>
    <ul>${cards}</ul>
    ${(() => { const vg = (R as any).village; if (!vg) return '';
      const pier = vg.pier === 'none' ? `<p class="lead">まだありません。焚き火を何度か囲むうちに、みんなで何かをつくる話が出てくるかもしれません（焚き火の会 ${vg.fires}回）。</p>`
        : `<p class="lead"><b>桟橋</b>　${vg.pier === 'plan' ? 'カメマルが場所を測るのを待っている' : vg.pier === 'done' ? '完成！ みんなでつくったはじめての大きなもの' : `土台の石 ${vg.bases}/4（ランタン）・柱 ${vg.posts}/4（ラッコ）・板 ${vg.deck}/8（ドット）`}</p>`;
      const tr = vg.treasures.length ? `<ul class="plain">${vg.treasures.map((x: any) => `<li>${x.what}　<small>${x.who}が見つけた・${localTimeString(x.at, loc.tz)}</small></li>`).join('')}</ul>` : '<p class="empty">まだ何も流れ着いていません。ときどき、遠くから何かが浜に打ち上がります。</p>';
      return `<h3>みんなでつくっているもの</h3>${pier}<h3>海の向こうから流れ着いたもの</h3>${tr}`; })()}
    <h3>聞こえてきた会話</h3>
    ${talk ? `<ol class="diary talk">${talk}</ol><button class="go" type="button" data-tab="talk">会話ログをすべて見る</button>` : '<p class="empty">まだ誰も出会っていません。</p>'}
    <h3>AIで言葉を書く（試作）</h3>
    <p class="lead">Anthropic の API キーを入れると、出会ったときの会話を Claude が住人それぞれの性格で書きます。キーはこのブラウザの中にだけ保存されます。</p>
    <div class="aikey">${key ? `<span>設定済み（…${key.slice(-4)}）${aiLastError ? `・エラー：${aiLastError}` : ''}</span><button type="button" data-ai="clear">外す</button>` : `<input id="aiKey" type="password" placeholder="sk-ant-..." autocomplete="off"><button type="button" data-ai="save">保存</button>`}</div>`;
}
function renderGuide() {
  if (!cur) return;
  const loc = cur.loc, list = guideEntries(loc);
  const n = list.filter((e) => seen.has(loc.id + ':' + e.id)).length;
  $('seenCount').textContent = `${n}/${list.length}`;
  $('btnGuide').setAttribute('aria-pressed', String(!guideEl.hidden && panelTab === 'guide'));
  $('btnLog').setAttribute('aria-pressed', String(!guideEl.hidden && panelTab === 'log'));
  if (guideEl.hidden) return;
  if ((panelTab === 'island' || panelTab === 'talk') && !cur.residents) panelTab = 'guide';
  const tabs = `<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="guide" aria-selected="${panelTab === 'guide'}">図鑑 <kbd>Z</kbd></button><button type="button" role="tab" data-tab="log" aria-selected="${panelTab === 'log'}">今日のログ <kbd>J</kbd></button>${cur.residents ? `<button type="button" role="tab" data-tab="island" aria-selected="${panelTab === 'island'}">島の住人</button><button type="button" role="tab" data-tab="talk" aria-selected="${panelTab === 'talk'}">会話ログ</button>` : ''}</div>`;
  const scroll = guideEl.scrollTop;
  if (panelTab === 'log') { guideEl.innerHTML = tabs + renderLog(); guideEl.scrollTop = scroll; return; }
  if (panelTab === 'talk') { guideEl.innerHTML = tabs + renderTalk(); guideEl.scrollTop = scroll; return; }
  if (panelTab === 'island') { if (!guideEl.contains(document.activeElement) || !(document.activeElement instanceof HTMLInputElement)) { guideEl.innerHTML = tabs + renderIsland(); guideEl.scrollTop = scroll; } return; }
  const thumbs = guideThumbs(loc, list.map((e) => e.id), 0);   // (the ones already made; the rest come in a few at a time)
  guideEl.innerHTML = tabs + `<h2>${loc.name}の生きもの <span>${n} / ${list.length} 発見</span></h2>
    <h3>行き先</h3>
    <ul class="places">${cur.cave ? `<li class="benthic"><i></i><b>海底洞窟</b><p>石灰岩の根を貫くトンネル。天井の穴から光の柱が差し込み、昼はネムリブカが奥で休んでいる。</p><button class="go" type="button" data-go="cave">洞窟へ行く</button></li>` : ''}${cur.bait ? `<li class="benthic"><i></i><b>ベイトボール</b><p>${cur.bait.st.active ? 'いま沖で起きている。' : ''}${predatorsJa(loc)}が${loc.bait!.sp.ja}の群れを水面へ追い上げ、海鳥が上から突っ込む。ふだんはまれにしか起きない。</p><button class="go" type="button" data-go="bait">${cur.bait.st.active ? '見に行く' : '探しに行く'}</button></li>` : ''}${(PLACES[loc.id] || []).map((pl) => `<li class="benthic"><i></i><b>${pl.ja}</b><p>${pl.note}</p><button class="go" type="button" data-go="place:${pl.id}">行ってみる</button></li>`).join('')}</ul>
    <h3>生きもの</h3>
    <ul>${list.map((e) => `<li data-id="${e.id}" class="${seen.has(loc.id + ':' + e.id) ? 'seen' : ''}">${thumbs[e.id] ? `<img class="pic" src="${thumbs[e.id]}" alt="">` : thumbs[e.id] === '' ? '' : `<img class="pic" data-pic="${e.id}" alt="" hidden>`}<i></i><b>${e.ja}</b><em>${e.sci}</em><span class="st">いま：${statusOf(e.id)}</span><p>${e.note}</p><button class="go" type="button" data-go="${e.id}">会いに行く</button></li>`).join('')}</ul>
    <h3>${loc.pelagic ? '漂う生きもの' : loc.habitat === 'kelp' ? 'ケルプと底生生物' : 'サンゴと底生生物'}</h3>
    <ul>${loc.benthic.map(([ja, sci, note]) => `<li class="benthic"><i></i><b>${ja}</b><em>${sci}</em><p>${note}</p></li>`).join('')}</ul>${loc.flora ? `
    <h3>島の植物</h3>
    <ul>${loc.flora.map(([ja, sci, note]) => `<li class="benthic"><i></i><b>${ja}</b><em>${sci}</em><p>${note}</p></li>`).join('')}</ul>` : ''}`;
  guideEl.scrollTop = scroll;
  pumpThumbs();
}
// the field guide's pictures, a couple a frame until all are made, each put in its place as it comes
let thumbsRaf = 0;
function pumpThumbs() {
  cancelAnimationFrame(thumbsRaf);
  const step = () => {
    if (!cur || guideEl.hidden || panelTab !== 'guide') return;
    const holes = [...guideEl.querySelectorAll<HTMLImageElement>('img[data-pic]')];
    if (!holes.length) return;
    const got = guideThumbs(cur.loc, holes.map((h) => h.dataset.pic!), 2);
    for (const h of holes) { const u = got[h.dataset.pic!]; if (u === undefined) continue; if (u) { h.src = u; h.hidden = false; } else h.remove(); h.removeAttribute('data-pic'); }
    thumbsRaf = requestAnimationFrame(step);
  };
  thumbsRaf = requestAnimationFrame(step);
}
// while the guide stays open: only what changes (where each creature is, what has been found), not the
// whole list with its pictures every two seconds
function refreshGuide() {
  if (!cur || guideEl.hidden) return;
  if (panelTab !== 'guide') { renderGuide(); return; }
  const loc = cur.loc, list = guideEntries(loc), n = list.filter((e) => seen.has(loc.id + ':' + e.id)).length;
  $('seenCount').textContent = `${n}/${list.length}`;
  const h = guideEl.querySelector('h2 span'); if (h) h.textContent = `${n} / ${list.length} 発見`;
  for (const li of guideEl.querySelectorAll<HTMLElement>('li[data-id]')) {
    const id = li.dataset.id!, st = li.querySelector('.st'), txt = `いま：${statusOf(id)}`;
    if (st && st.textContent !== txt) st.textContent = txt;
    li.classList.toggle('seen', seen.has(loc.id + ':' + id));
  }
}
guideEl.addEventListener('click', (e) => {
  const g = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
  if (g) { goTo(g.dataset.go!); return; }
  const dy = (e.target as HTMLElement).closest('[data-diary]') as HTMLElement | null;
  if (dy) { openDiary(dy.dataset.diary!); return; }
  const w = (e.target as HTMLElement).closest('[data-watch]') as HTMLElement | null;
  if (w && cur?.residents) { const r = cur.residents.list.find((x: any) => x.id === w.dataset.watch); if (r) { startWatch(r); if (isTouch || innerWidth < 900) { guideEl.hidden = true; renderGuide(); } } return; }
  const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
  if (b) { panelTab = b.dataset.tab as typeof panelTab; guideEl.scrollTop = 0; renderGuide(); return; }
  const ai = (e.target as HTMLElement).closest('[data-ai]') as HTMLElement | null;
  if (ai) {
    const inp = guideEl.querySelector('#aiKey') as HTMLInputElement | null;
    setAiKey(ai.dataset.ai === 'save' && inp && inp.value.trim() ? inp.value.trim() : null);
    (document.activeElement as HTMLElement | null)?.blur?.(); renderGuide();
  }
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
  say('sighting', { name: e.ja });
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
  if (cur!.flyfish?.fish.some((f: any) => f.state !== 'wait' && f.state !== 'gone' && inView(f.p, 40))) discover(guideEntries(cur!.loc).find((e) => e.id === 'tobiuo'));
  if (cur!.birds && cam.y > 0) for (const b of cur!.birds.inView(cam, fwd, 80)) discover(b);
  if (cur!.bait?.near(cam, 30)) discover(loc.bait!.sp);
}

/* ================= globe UI ================= */
const fmtLL = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
const pinEls = LOCATIONS.map((loc, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = loc.id === 'kayama' ? 'pin below' : 'pin';   // (next to Miyako on the globe: its label hangs below)
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
  if (cur !== oc) {
    // Observations belong to the sea that produced them. Its ecosystem pauses when
    // we leave, so old live() closures cannot be allowed to keep a hunt on screen.
    pipSubj = null; pipFade = pipScan = pipT = pipIdle = pipFromT = 0;
    pipSlow = false; pipOff = pipLift = pipClear = 0;
    $('pip').hidden = true; $('pip').style.opacity = '0'; $('pipText').textContent = '';
    capShot = cruiseSubj = null; capT = obsAt = cruiseT = 0; flyRun = null;
    logQueue.length = 0; recent.clear(); lastKind.clear(); logShownAt = -1e9;
    huntLock.ref = null; huntLock.until = 0;
    markAt = null; markText = ''; markUntil = 0; noticeSubj = null; noticeT = 0; noticed.clear();
    clearTimeout(toastTimer); clearTimeout(rareT); clearTimeout(hintT); clearTimeout(helloTimer);
    for (const id of ['toast', 'rare', 'hint', 'caption']) $(id).classList.remove('on', 'go');
    $('evMark').hidden = true;
  }
  watch.r = null; watch.pov = false; pov.hide(); document.body.classList.remove('pov', 'pov-ui');
  for (const l of U.uLights.value) l.w = 0;   // (only the island's residents carry lights)
  U.uFire.value.w = 0;   // (only the island has a fire)
  if (oc.residents) {
    oc.residents.onEvent = (_k: string, text: string, r: any) => seaLog('robot', text, () => r.pos);
    // their voices, when the camera is close enough to hear them
    oc.residents.onSay = (r: any, text: string) => {
      const d = camera.position.distanceTo(r.pos); if (d > 40) return;
      _w.subVectors(r.pos, camera.position).normalize();
      const right = new THREE.Vector3(Math.cos(drone.yaw), 0, -Math.sin(drone.yaw));
      babble(r.id, text, Math.min(1, 1.3 / (1 + d * 0.12)) * (camera.position.y > 0 || r.pos.y < 0 ? 1 : 0.4), _w.dot(right));
      if (!guideEl.hidden && (panelTab === 'talk' || panelTab === 'island')) renderGuide();
    };
  }
  U.uSeaWorld.value = oc.loc.land ? oc.loc.land.far : 260;
  oc.eco.env.crunch = (d: number) => { if (d < 12) crunch(1 - d / 12); };
  oc.eco.env.sound = { frenzy, plop };
  oc.breach.fx.splash = bigSplash; oc.breach.fx.stream = streamAt; oc.breach.fx.bubbles = bubblesAt;
  oc.breach.fx.sound = (big: number, x: number, z: number) => breachSound(big, Math.hypot(x - drone.pos.x, z - drone.pos.z));
  lastPhase = '';
  director.reset(); lastShot = null;
  dayKey = '';
  if (cur && cur !== oc) cur.group.visible = false;
  cur = oc; oc.group.visible = true;
  applyWater(oc.loc);
  wx = FAIR; refreshWeather(oc.loc);
  setSeason(clock.season, oc.loc.lat);   // a chosen season means that sea's own season (south of the equator it flips)
  const cv = oc.cave;
  U.uCaveOn.value = cv ? 1 : 0; U.uCamCave.value = 1; camCave = 1; camExpo = 1.4; post.setExposure(1.4);
  if (cv) {
    U.uCaveTex.value = cv.tex;
    U.uCaveXf.value.set(cv.cx, cv.cz, cv.ca, cv.sa);
    U.uCaveMin.value.set(cv.min[0], cv.min[1], cv.min[2]);
    U.uCaveExt.value.set((cv.n[0] - 1) * cv.step, (cv.n[1] - 1) * cv.step, (cv.n[2] - 1) * cv.step);
    U.uCaveN.value.set(cv.n[0], cv.n[1], cv.n[2]);
    U.uCaveAtlas.value.set(cv.atlas[0], cv.atlas[1]);
  }
  lampManual = false;
  applySky(oc.loc);
  grass.visible = !!oc.grassTex; grassMat.uniforms.uHeight.value = oc.grassTex;
  drone.s = 0.4 + Math.random() * 6; drone.mode = 'auto';
  drone.sky = false; drone.skyWait = rr(...persona.skyGap) * 0.6; saidRain = false;
  skyLabel();
  setTimeout(() => { if (cur === oc) { lastSay = -1e9; say('hello', {}, true); } }, 6000);
  pathPoint(drone.s, drone.pos); drone.vel.set(0, 0, 0);
  if (oc.loc.habitat === 'kelp') drone.pos.y = Math.max(oc.T.top(drone.pos.x, drone.pos.z) + 2.5, Math.min(drone.pos.y, -7)); // enter among the stipes, below the canopy
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
  renderGuide(); renderWatch();
  try { history.replaceState(null, '', '#' + oc.loc.id); } catch (e) { /* ignore */ }
  resize();
  requestAnimationFrame(resize);
}
// Diving in: the sea is built first (behind a veil), then a short glide from wherever the globe is
// looking down to the site, and into the water.
{ const at = new URLSearchParams(location.search).get('at'); if (at && !isNaN(Date.parse(at))) { clock.live = false; clock.speed = 1; clock.ms = Date.parse(at); } }   // ?at=ISO time, for checking
// ?bisect (with ?diag): to find what a GPU cannot draw, start from an empty sea and bring its things
// back one kind at a time, a few seconds apart; if the GPU gives up, the last one brought back is named.
const bisect = /[?&]bisect/.test(location.search);
let bisectList: { hint: string; objs: THREE.Object3D[]; vis: boolean[] }[] | null = null, bisectI = -1, bisectT = 0;
function bisectStep(dt: number) {
  if (!cur) return;
  if (!bisectList) {
    const by = new Map<string, THREE.Object3D[]>();
    const take = (root: THREE.Object3D) => root.traverse((o: any) => { if (!o.material || o === root) return; const h = `${o.type} ${shaderHint(Array.isArray(o.material) ? o.material[0] : o.material)} [${Object.keys(o.geometry?.attributes || {}).filter((k) => !['position', 'normal', 'uv'].includes(k)).join(',')}]`; if (!by.has(h)) by.set(h, []); by.get(h)!.push(o); });
    take(oceanScene); take(topScene);
    bisectList = [...by].map(([hint, objs]) => ({ hint, objs, vis: objs.map((o) => o.visible) }));
    diagLog?.(`B ${bisectList.length} kinds to bring back, one every 3 s`);
  }
  bisectT += dt;
  if (bisectT > 3 && bisectI < bisectList.length) { bisectT = 0; bisectI++; const b = bisectList[bisectI]; if (b) b.objs.forEach((o, k) => { o.visible = b.vis[k]; }); if (b) diagLog?.(`B ${bisectI + 1}/${bisectList.length} +${b.objs.length} ${b.hint}`); else diagLog?.('B all back: nothing failed'); }
  for (let i = bisectI + 1; i < bisectList.length; i++) for (const o of bisectList[i].objs) o.visible = false;
}
// ?diag&gputest#sea: draw nothing else, and take a sea's shaders one at a time: prepare it, wait, draw it
// once into a small target, wait. When the GPU gives up, the one it was on is named (and the test stops).
const gputest = /[?&](gputest|probe)/.test(location.search), probe = /[?&]probe/.test(location.search);
// ?diag&probe#sea: the seabed's shader built up a feature at a time, each prepared and drawn on its own,
// stopping at the first one the GPU cannot take
async function shaderProbe() {
  const gl = renderer.getContext(), lost = () => gl.isContextLost();
  const VS = `varying vec3 vWp; varying vec3 vN; void main(){ vWp = position; vN = normal; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
  const V = 'varying vec3 vWp; varying vec3 vN;\n';
  const steps: [string, string, boolean, Record<string, number>?][] = [
    ['1 共通部分だけ', V + 'void main(){ gl_FragColor = vec4(fract(vWp * 0.1), 1.0); }', false],
    ['2 水中の光（shade）', V + 'void main(){ gl_FragColor = vec4(shade(vec3(0.5), vWp, normalize(vN), 0.95), 1.0); }', false],
    ['3 テクスチャ（textureGrad）', SURFACE + V + 'void main(){ gl_FragColor = vec4(textureGrad(tSandC, vWp.xz, dFdx(vWp.xz), dFdy(vWp.xz)).rgb, 1.0); }', true],
    ['4 分岐の中のtextureGrad', SURFACE + V + 'void main(){ vec3 c = vec3(0.0); vec2 gx = dFdx(vWp.xz), gy = dFdy(vWp.xz); if (vN.y > 0.5) c = textureGrad(tSandC, vWp.xz, gx, gy).rgb; gl_FragColor = vec4(c, 1.0); }', true],
    ['5 三方向投影ひとつ（triSample）', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); gl_FragColor = vec4(c + dn, 1.0); }', true],
    ['6 海底の質感（reefSurface）', SURFACE + V + 'void main(){ vec3 n; vec3 a = reefSurface(vWp, normalize(vN), 0.5, n); gl_FragColor = vec4(a + n * 0.01, 1.0); }', true],
    ['H1 砂＋水の色（waterCol）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(c + waterCol(normalize(vWp - uCamPos)), 1.0); }', true],
    ['H2 砂＋水の輝き（hazeCol）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(c + hazeCol(normalize(vWp - uCamPos)), 1.0); }', true],
    ['H3 砂＋空から見た霞（fogAir）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(fogAir(c, vWp), 1.0); }', true],
    ['H4 砂＋霞（fogIt、洞窟なし）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(fogIt(c, vWp), 1.0); }', true, { NO_CAVE_LIGHT: 1 }],
    ['G1 砂＋洞窟の光のデータを直接読む', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(c * textureLod(uCaveTex, vec2(0.5), 0.0).r, 1.0); }', true],
    ['G2 砂＋洞窟の光の関数（caveLight）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(c * caveLight(vWp).x, 1.0); }', true],
    ['G3 砂＋水中の光（洞窟の光を使わない版）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(shade(c, vWp, normalize(vN), 0.95), 1.0); }', true, { NO_CAVE_LIGHT: 1 }],
    ['F1 修正案：普通の読み方のテクスチャ＋光（shade）', SURFACE + V + 'void main(){ vec3 w = abs(normalize(vN)); w = w * w; w /= (w.x + w.y + w.z); vec3 c = texture(tSandC, vWp.zy * 0.3).rgb * w.x + texture(tSandC, vWp.xz * 0.3).rgb * w.y + texture(tSandC, vWp.xy * 0.3).rgb * w.z; gl_FragColor = vec4(shade(c, vWp, normalize(vN), 0.95), 1.0); }', true],
    ['9a 砂のテクスチャ＋水の色（hazeCol）', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); gl_FragColor = vec4((c + dn) + hazeCol(normalize(vWp - uCamPos)), 1.0); }', true],
    ['9b 砂のテクスチャ＋空から見た霞（fogAir）', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); gl_FragColor = vec4(fogAir(c + dn, vWp), 1.0); }', true],
    ['9c 砂のテクスチャ＋距離の霞だけ', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); float d = length(vWp - uCamPos); vec3 T = exp(-uFogDen * vec3(1.4, 1.0, 0.78) * d); gl_FragColor = vec4((c + dn) * T + waterCol(normalize(vWp - uCamPos)) * (1.0 - T), 1.0); }', true],
    ['8a 砂のテクスチャ＋水の霞（fogIt）', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); gl_FragColor = vec4(fogIt(c + dn, vWp), 1.0); }', true],
    ['8b 砂のテクスチャ＋コースティクス（caustic）', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); gl_FragColor = vec4((c + dn) * caustic(vWp.xz * 0.075, uTime), 1.0); }', true],
    ['8c 砂のテクスチャ＋洞窟の光（caveLight）', SURFACE + V + 'void main(){ vec3 c = vec3(0.0), dn = vec3(0.0); vec3 w = abs(normalize(vN)); triSample(tSandC, tSandN, vWp, dFdx(vWp), dFdy(vWp), w, 0.3, 0.8, c, dn, 1.0); gl_FragColor = vec4((c + dn) * caveLight(vWp).x, 1.0); }', true],
    ['7a 砂だけの質感＋光', SURFACE + V + 'void main(){ vec3 n; vec3 a = reefSurface(vWp, normalize(vN), 0.5, n); gl_FragColor = vec4(shade(a, vWp, n, 0.95), 1.0); }', true, { PROBE_SAND_ONLY: 1 }],
    ['7b 質感（岩の二層目なし）＋光', SURFACE + V + 'void main(){ vec3 n; vec3 a = reefSurface(vWp, normalize(vN), 0.5, n); gl_FragColor = vec4(shade(a, vWp, n, 0.95), 1.0); }', true, { PROBE_NO_ROCK2: 1 }],
    ['7c 質感＋光（コースティクスなし）', SURFACE + V + 'void main(){ vec3 n; vec3 a = reefSurface(vWp, normalize(vN), 0.5, n); vec3 col = absorb(a * lightAt(n, caveLight(vWp + n * 0.25)) * 1.6, vWp.y) + lamp(a, vWp, n); gl_FragColor = vec4(fogIt(col, vWp), 1.0); }', true],
    ['7 海底そのもの（質感＋光）', SURFACE + V + 'void main(){ vec3 n; vec3 a = reefSurface(vWp, normalize(vN), 0.5, n); gl_FragColor = vec4(shade(a, vWp, n, 0.95), 1.0); }', true],
  ];
  const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100); cam.position.set(0, 3, 4); cam.lookAt(0, 0, 0);
  const geo = new THREE.PlaneGeometry(4, 4, 8, 8).rotateX(-Math.PI / 2);
  for (const [name, fs, tex, defs] of steps) {
    const m = mat(VS, fs, tex ? { uniforms: SURF_UNIFORMS, defines: defs || {} } : {});
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(mesh);
    diagNow = name + ' → 準備中'; renderer.compile(sc, cam);
    await wait(900); if (lost()) { diagNow = 'STOP ' + name + '（準備）'; diagLog?.('P STOP ' + name); return; }
    diagNow = name + ' → 描画中'; renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null); (gl as any).finish?.();
    await wait(1200); if (lost()) { diagNow = 'STOP ' + name + '（描画）'; diagLog?.('P STOP ' + name); return; }
    diagLog?.('P ok ' + name);
  }
  diagNow = 'ALL OK（海底の部品は単独ではどれも止まらなかった）';
}
async function gpuTest(loc: Sea) {
  const gl = renderer.getContext(), lost = () => gl.isContextLost();
  diagLog?.(`T GPU test: ${loc.name}`);
  if (loc.land) await loadLand(loc.id, loc.land.half, loc.land.far);
  const oc = buildOcean(loc);
  const seen = new Map<THREE.Material, THREE.Object3D>();
  const take = (root: THREE.Object3D) => root.traverse((o: any) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (!seen.has(m)) seen.set(m, o); });
  take(oc.group); take(oceanScene); take(topScene);
  const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });
  const cam = new THREE.PerspectiveCamera(60, 1, 0.08, 460); cam.position.set(0, -3, 8); cam.lookAt(0, -3, 0);
  let i = 0; const n = seen.size;
  for (const [m, o] of seen) {
    i++;
    const label = `${i}/${n} ${(o as any).type} ${shaderHint(m)} [${Object.keys((o as any).geometry?.attributes || {}).filter((k) => !['position', 'normal', 'uv'].includes(k)).join(',')}]`;
    const tmp = new THREE.Scene(), c = o.clone(false) as any; c.visible = true; c.frustumCulled = false; c.position.set(0, -3, 0); tmp.add(c);
    diagNow = label + ' → 準備中'; renderer.compile(tmp, cam);
    await wait(700); if (lost()) { diagLog?.(`T STOP: 準備で停止 ${label}`); diagNow = 'STOP ' + label + '（準備）'; return; }
    diagNow = label + ' → 描画中'; renderer.setRenderTarget(rt); renderer.render(tmp, cam); renderer.setRenderTarget(null); (gl as any).finish?.();
    await wait(1300); if (lost()) { diagLog?.(`T STOP: 描画で停止 ${label}`); diagNow = 'STOP ' + label + '（描画）'; return; }
    diagLog?.(`T ok ${label}`);
  }
  // then the post-processing chain on its own
  diagNow = 'post-processing → 描画中';
  post.setSize(640, 360); post.render(renderer, new THREE.Scene(), camera, null, setRefraction);
  await wait(2000);
  if (lost()) { diagNow = 'STOP post-processing'; diagLog?.('T STOP: post-processing'); return; }
  diagNow = 'ALL OK（どれも単独では止まらなかった）'; diagLog?.('T all passed');
}
// Get every shader of a sea ready before diving in, one at a time and without holding up the page.
// All at once in the first frame is too much for some GPUs: on Windows each is translated for Direct3D,
// slowly, and a long enough stall makes the browser reset the GPU (the screen goes white or black).
let diagLog: ((s: string) => void) | null = null, diagNow = '';   // (with ?diag: the shader being prepared)
const shaderHint = (m: any) => `${m.type}${m.uniforms ? ':' + Object.keys(m.uniforms).filter((k) => !(k in U)).slice(0, 4).join(',') : ''} ${(m.fragmentShader || '').length}`;
const dbg = location.search.includes('debug');
async function prepareShaders(oc: Ocean) {
  const seen = new Map<THREE.Material, THREE.Object3D>();
  const take = (root: THREE.Object3D) => root.traverse((o: any) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (!seen.has(m)) seen.set(m, o); });
  take(oc.group); take(oceanScene); take(topScene);
  const par = !!renderer.extensions.get('KHR_parallel_shader_compile');
  let i = 0; const total = seen.size;
  if (dbg) console.log(`[load] ${total} materials, parallel ${par}`);
  const scene = (list: THREE.Object3D[]) => { const tmp = new THREE.Scene(); for (const o of list) { const c = o.clone(false); c.visible = true; tmp.add(c); } return tmp; };
  if (par && !diagLog && SAFE === 0) {
    // the browser compiles on its own threads: hand over a batch at a time and let them work side by side
    const all = [...seen.values()];
    for (let k = 0; k < all.length; k += 12) {
      try { await renderer.compileAsync(scene(all.slice(k, k + 12)), camera); } catch (e) { /* it will compile when first drawn */ }
      if (renderer.getContext().isContextLost()) return;
    }
    return;
  }
  let t0 = performance.now();
  for (const [, o] of seen) {
    const tmp = scene([o]);
    const hint = shaderHint((o as any).material);
    try {
      if (diagLog) {
        diagLog(`C … ${i + 1}/${total} ${hint}`); diagNow = `${i + 1}/${total} ${(o as any).type} ${hint} [${Object.keys((o as any).geometry?.attributes || {}).filter((k) => !['position', 'normal', 'uv'].includes(k)).join(',')}]`;
        const t1 = performance.now(); renderer.compile(tmp, camera); const dt = performance.now() - t1;
        diagLog(`C ${dt.toFixed(0)}ms ${hint}${renderer.getContext().isContextLost() ? ' LOST' : ''}`);
        if (!renderer.getContext().isContextLost()) diagNow = 'done ' + diagNow;
      } else {
        renderer.compile(tmp, camera);
        // wait for the link here, one program at a time, rather than all of them in the first frame
        const pr = (renderer.properties.get((o as any).material) as any)?.currentProgram; pr?.getUniforms?.();
      }
    } catch (e) { /* it will compile when first drawn */ }
    i++;
    if (diagLog || performance.now() - t0 > 60) { await nextFrame(); t0 = performance.now(); }   // give the page a breath every so often
    if (renderer.getContext().isContextLost()) return;
  }
}
async function dive(loc: Sea) {
  keepAwake();
  if (busy) return; busy = true;
  setHot(LOCATIONS.indexOf(loc));
  if (!oceans[loc.id]) {
    veil(true, 'PREPARING', `${loc.name} · ${loc.site}`, '海を用意しています');
    await wait(500); await nextFrame(); await nextFrame();
    if (loc.land) await loadLand(loc.id, loc.land.half, loc.land.far);   // real terrain: the survey data first
    const tb = performance.now();
    oceans[loc.id] = buildOcean(loc);
    const tc = performance.now();
    await prepareShaders(oceans[loc.id]);
    if (dbg) console.log(`[load] build ${(tc - tb).toFixed(0)}ms shaders ${(performance.now() - tc).toFixed(0)}ms`);
    veil(false); await wait(300);
  }
  await tweenGlobe(loc.lat, loc.lon, 1.16, reduceMotion ? 900 : 1300);
  veil(true, 'DIVING', `${loc.name} · ${loc.site}`, `${fmtLL(loc.lat, loc.lon)} ／ 現地 ${localTimeString(clock.ms, loc.tz)}`);
  await wait(600);
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
  setGuide(false); setTimePanel(false); setVolPanel(false); watch.r = null; setPov(false);
  gv.lat = loc.lat; gv.lon = loc.lon; gv.dist = 1.2; gv.lastUser = performance.now();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  resize();
  veil(false);
  await tweenGlobe(clamp(loc.lat, -40, 40), loc.lon, 3.5, 1800);
  busy = false;
}

function setMode(m: 'auto' | 'manual') {
  if (watch.r) stopWatch(false);
  drone.mode = m;
  if (m === 'manual') director.reset();
  if (m === 'auto' && cur) { drone.s = nearestS(drone.pos); if (drone.pos.y > 0 && !drone.sky) { drone.sky = true; drone.skyT = 0; drone.skyAge = 0; } }
  if (cur) skyLabel();
  $('btnAuto').setAttribute('aria-pressed', String(m === 'auto'));
  $('btnManual').setAttribute('aria-pressed', String(m === 'manual'));
  $('tMode').textContent = m === 'auto' ? 'AUTO CRUISE' : 'MANUAL';
  hint(m === 'auto'
    ? (isTouch ? 'ドラッグで見回す · 気になる生きものをタップするとそこへ向かいます' : 'ドラッグで見回す · 気になる生きものをクリックするとそこへ向かいます')
    : (isTouch ? '左スティックで移動 · 画面ドラッグで視点 · 90秒操作がないと自動巡航に戻ります'
      : 'ドラッグ: 視点 · WASD: 移動 · E / Q: 上昇 / 下降 · Shift: 加速 · 90秒操作がないと自動巡航に戻ります'));
  $('joy').hidden = $('vbtns').hidden = !(isTouch && m === 'manual');
}
// a line of help at the bottom that shows for a moment and fades
let hintT = 0;
function hint(text: string) { const el = $('hint'); el.textContent = text; el.classList.add('on'); clearTimeout(hintT); hintT = window.setTimeout(() => el.classList.remove('on'), 7000); }
// the instruments (depth, speed, heading, position) and the rest of the controls: off until asked for
function setInst(on: boolean) { document.body.classList.toggle('inst-off', !on); $('btnInst').setAttribute('aria-pressed', String(on)); try { localStorage.setItem('seaglass.inst', on ? '1' : '0'); } catch (e) { /* ignore */ } }
try { setInst(localStorage.getItem('seaglass.inst') === '1'); } catch (e) { setInst(false); }
$('btnInst').onclick = () => setInst(document.body.classList.contains('inst-off'));
function setMenu(on: boolean) { document.body.classList.toggle('dock-open', on); $('btnMore').setAttribute('aria-expanded', String(on)); $('btnMore').textContent = on ? '×' : '⋯'; }
$('btnMore').onclick = () => setMenu(!document.body.classList.contains('dock-open'));
// the menu's categories: each shows its own settings (the last one opened is remembered)
function setCat(c: string) {
  document.querySelectorAll<HTMLElement>('#menu [data-cat]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === c)));
  document.querySelectorAll<HTMLElement>('#menu [data-sec]').forEach((sec) => { sec.hidden = sec.dataset.sec !== c; });
  try { localStorage.setItem('seaglass.menuCat', c); } catch (e) { /* ignore */ }
}
document.querySelectorAll<HTMLElement>('#menu [data-cat]').forEach((b) => { b.onclick = () => setCat(b.dataset.cat!); });
setCat((() => { try { return localStorage.getItem('seaglass.menuCat') || 'move'; } catch (e) { return 'move'; } })());
// (a tap outside the menu closes it)
document.addEventListener('pointerdown', (e) => { if (document.body.classList.contains('dock-open') && !(e.target as HTMLElement).closest('#menu, #btnMore, #volPanel, #timePanel')) setMenu(false); });
const look = { yaw: 0, pitch: 0, held: false, let: 0 };
const pov = makePov($('pov'));
const diaryBook = makeDiaryBook($('diaryBook'));
function openDiary(id: string) { if (cur?.residents) diaryBook.show(cur.residents, id, cur.loc.tz); }
$('povExit').onclick = () => setPov(false);
$('povMenu').onclick = () => { const on = !document.body.classList.contains('pov-ui'); document.body.classList.toggle('pov-ui', on); $('povMenu').setAttribute('aria-pressed', String(on)); };
const tap = { moved: 0, t: 0 };
// Things worth going to that are on screen, nearest the point: creatures, the cave, the residents.
// Only these answer a tap, so touching the screen elsewhere does nothing.
const _tp = new THREE.Vector3();
function pickAt(x: number, y: number): Subject | null {
  if (!cur) return null;
  let best: Subject | null = null, bs = Infinity;
  for (const s of allSubjects()) {
    const p = s.pos(); if (!p || !s.live()) continue;
    const d = Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z);
    if (d > (s.kind === 'robot' || s.kind === 'cave' ? 260 : 80) || d < 1) continue;
    _tp.set(p.x, p.y, p.z).project(camera);
    if (_tp.z > 1 || Math.abs(_tp.x) > 1 || Math.abs(_tp.y) > 1) continue;
    const sx = (_tp.x * 0.5 + 0.5) * innerWidth, sy = (-_tp.y * 0.5 + 0.5) * innerHeight;
    const r = Math.max(isTouch ? 56 : 40, (s.size * 0.7 / d) * innerHeight);   // about as big as it looks on screen, and never too small to hit
    const off = Math.hypot(sx - x, sy - y);
    if (off < r && off / r < bs) { bs = off / r; best = s; }
  }
  return best;
}
function tapAt(x: number, y: number) {
  const s = pickAt(x, y); if (!s) return;
  focusOn(s);
  showToast('向かっています', s.label, s.status());
  const ring = $('tapRing'); ring.style.transform = `translate(${x}px, ${y}px)`; ring.classList.remove('on'); void ring.offsetWidth; ring.classList.add('on');
}
// on a desktop, the name of what is under the pointer
// (only for a real mouse: a pen or a finger on a tablet sends moves too, but never a leave, and the tag
// would stay up; and it fades by itself when the pointer rests or leaves)
let hoverT = 0, hoverOff = 0;
const hideHover = () => { clearTimeout(hoverOff); $('hoverTag').classList.remove('on'); canvas.style.cursor = ''; };
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') { hideHover(); return; }
  if (mode !== 'ocean' || isTouch || pointers.size) { hideHover(); return; }
  if (drone.mode !== 'auto') { hideHover(); return; }
  const now = performance.now(); if (now - hoverT < 90) return; hoverT = now;
  const s = pickAt(e.clientX, e.clientY), el = $('hoverTag');
  canvas.style.cursor = s ? 'pointer' : '';
  if (!s) { hideHover(); return; }
  el.textContent = `${s.label} — クリックで近づく`; el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; el.classList.add('on');
  clearTimeout(hoverOff); hoverOff = window.setTimeout(hideHover, 2500);
});
for (const ev of ['pointerdown', 'pointerleave', 'pointercancel'] as const) canvas.addEventListener(ev, hideHover);
addEventListener('blur', hideHover);
function startWatch(r: any) {
  if (!cur?.residents) return;
  if (drone.mode !== 'auto') setMode('auto');
  if (drone.sky) { drone.sky = false; skyLabel(); }
  director.reset(); lastShot = null;
  const first = !watch.r;
  watch.r = r;
  if (first) { watch.ang = Math.atan2(drone.pos.z - r.pos.z, drone.pos.x - r.pos.x); watch.el = 0.3; watch.dist = 5.5; watch.off = 0.45; }
  watch.infoT = 0;
  if (watch.pov) setPov(true);   // (switching whose eyes we look through)
  renderWatch();
  showToast(watch.pov ? '目線で見ています' : '見守っています', r.v.name, cur.residents.status(r));
}
function setPov(on: boolean) {
  watch.pov = on && !!watch.r;
  if (watch.pov) pov.show(watch.r); else pov.hide();
  if (cur?.residents) cur.residents.hide = watch.pov ? watch.r.id : '';
  look.yaw = look.pitch = 0;
  document.body.classList.toggle('pov', watch.pov); if (!watch.pov) { document.body.classList.remove('pov-ui'); $('povMenu').setAttribute('aria-pressed', 'false'); }
  renderWatch();
}
function stopWatch(resume: boolean) {
  if (!watch.r) return;
  if (watch.pov) { watch.r = null; setPov(false); }
  watch.r = null;
  renderWatch();
  // let go: straight back to the sea (quickly, above the trees), and leave the residents ashore be for a
  // while, so the cruise does not turn round to film the one just left
  if (resume && cur) { drone.s = nearestS(drone.pos); drone.sky = false; drone.seaUntil = performance.now() + 150000; director.reset(); lastShot = null; skyLabel(); }
}
// the row of residents to watch (only by the island), and the card for the one being watched
function renderWatch() {
  const bar = $('watchBar'), card = $('watchCard'), R = cur?.residents;
  bar.hidden = !R || mode !== 'ocean';
  if (R && !bar.dataset.built) {
    bar.dataset.built = '1';
    bar.innerHTML = '<span class="k">見守る ／ 目線</span>' + R.list.map((r: any) => `<div class="row" style="--c:${r.sp.color}"><button type="button" data-watch="${r.id}"><i></i>${r.v.name}</button><button type="button" class="eye" data-pov="${r.id}" aria-label="${r.v.name}の目線で見る">目線</button></div>`).join('');
    bar.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-watch],[data-pov]') as HTMLElement | null; if (!b || !cur?.residents) return;
      const id = b.dataset.watch ?? b.dataset.pov, r = cur.residents.list.find((x: any) => x.id === id);
      if (!r) return;
      if (b.dataset.pov) { if (r === watch.r && watch.pov) setPov(false); else { if (r !== watch.r) startWatch(r); setPov(true); } return; }
      if (watch.pov) { if (r !== watch.r) startWatch(r); return; }   // (through someone's eyes: a name switches whose)
      if (r === watch.r) stopWatch(true); else { startWatch(r); setPov(false); }
    };
  }
  bar.querySelectorAll<HTMLButtonElement>('[data-watch]').forEach((b) => b.setAttribute('aria-pressed', String(!!watch.r && watch.r.id === b.dataset.watch && !watch.pov)));
  bar.querySelectorAll<HTMLButtonElement>('[data-pov]').forEach((b) => b.setAttribute('aria-pressed', String(!!watch.r && watch.r.id === b.dataset.pov && watch.pov)));
  card.hidden = !watch.r;
  document.body.classList.toggle('watching', !!watch.r);
  if (!watch.r || !R) return;
  const r = watch.r, st = r.stats, t = (ms: number) => localTimeString(ms, cur!.loc.tz);
  const work = r.id === 'dot' ? `小屋の部材 ${st.built}/24` : r.id === 'kame' ? `観察記録 ${st.notes}件` : r.id === 'lantern' ? `目印の石積み ${st.cairns}` : `貝殻 ${st.shells}個・割った貝 ${st.cracked}個`;
  const diary = r.diary.slice(-3).reverse().map((e: any) => `<li><time>${t(e.at)}</time>${e.text}</li>`).join('');
  card.style.setProperty('--c', r.sp.color);
  card.innerHTML = `<div class="h"><i></i><b>${r.v.name}</b><span>${R.status(r)}</span></div>
    <div class="m">${R.vitals(r)} ・ ${work}</div>
    ${r.saying ? `<p class="say">「${r.saying}」</p>` : ''}
    ${diary ? `<ol>${diary}</ol>` : ''}
    <div class="f"><span>ドラッグで回り込む・${isTouch ? 'ピンチ' : 'ホイール'}で遠近</span><button type="button" id="watchEye">目線で見る</button><button type="button" id="watchDiary">日記帳</button><button type="button" id="watchStop">見守りをやめる</button></div>`;
  $('watchStop').onclick = () => stopWatch(true);
  $('watchEye').onclick = () => setPov(true);
  $('watchDiary').onclick = () => openDiary(r.id);
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
// volume: three sliders, kept in this browser
try { const v = JSON.parse(localStorage.getItem('seaglass.vol') || 'null'); if (v) setVolume(v); } catch (e) { /* ignore */ }
for (const [id, k] of [['volAll', 'all'], ['volMusic', 'music'], ['volNature', 'nature']] as const) {
  const el = $(id) as HTMLInputElement, out = $(id + 'O');
  el.value = String(Math.round(vol[k] * 100)); out.textContent = el.value;
  el.oninput = () => {
    setVolume({ [k]: +el.value / 100 }); out.textContent = el.value;
    if (!audio.on && +el.value > 0) setSound(true);   // turning it up means wanting to hear it
    if (k === 'music' && !audio.music && +el.value > 0) toggleMusic();
    try { localStorage.setItem('seaglass.vol', JSON.stringify(vol)); } catch (e) { /* ignore */ }
  };
}
function setVolPanel(on: boolean) { $('volPanel').hidden = !on; $('btnVol').setAttribute('aria-expanded', String(on)); }
$('btnVol').onclick = () => setVolPanel($('volPanel').hidden);
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
  U.uVolOff.value = T.vol ? 0 : 1;
  U.uLodR.value = T.lodR;
  document.body.classList.toggle('post', T.post);
  post.setTier(T);
  applyTierToSea();
  resize();
}
const predatorsJa = (loc: Sea) => (loc.bait?.predators || []).map((p) => loc.species.find((s) => s.id === p.id)?.ja).filter(Boolean).slice(0, 2).join('や');
function applyTierToSea() {
  if (!cur) return;
  for (const f of cur.fish as any[]) f.setFraction?.(TIERS[tier].shoal);
  cur.bait?.setFraction(TIERS[tier].shoal);
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

$('btnBack').onclick = toGlobe;
$('btnGuide').onclick = () => openPanel('guide');
$('btnLog').onclick = () => openPanel('log');
$('btnTime').onclick = () => setTimePanel($('timePanel').hidden);
$('btnAuto').onclick = () => setMode('auto');
$('btnSky').onclick = () => setSky(!drone.sky);
$('btnSeaOnly').onclick = () => setSeaOnly(!seaOnly);
setSeaOnly(seaOnly);
$('btnPip').onclick = () => setPip(!pipOn);
setPip(pipOn);
$('personas').innerHTML = PERSONAS.map((p) => `<button type="button" role="radio" data-p="${p.id}" title="${p.blurb}"><span class="dot"></span>${p.ja}</button>`).join('');
$('personas').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null; if (b) setPersona(personaById(b.dataset.p!)); });
applyPersona();
$('btnManual').onclick = () => { drone.lastInput = performance.now(); setMode('manual'); };
$('btnLamp').onclick = () => setLamp(!lampOn);
$('btnCaption').onclick = () => setCaption(!captionOn);
setCaption(captionOn);
$('btnView').onclick = () => setView(viewMode === 'chase' ? 'fpv' : 'chase');
setView(viewMode);
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
  if (MOVE.includes(e.code)) { if (drone.mode === 'manual') { keys.add(e.code); drone.lastInput = performance.now(); e.preventDefault(); } return; }   // (flying by keys is for manual only)
  if (e.code.startsWith('Shift')) { keys.add(e.code); return; }
  if (e.repeat) return;
  if (PRESET_KEYS[e.code]) goPreset(PRESET_KEYS[e.code]);
  else if (e.code === 'Digit0') $('btnLive').click();
  else if (e.code === 'KeyT') setTimePanel($('timePanel').hidden);
  else if (e.code === 'KeyH') setHud(!hudOn);
  else if (e.code === 'KeyL') setLamp(!lampOn);
  else if (e.code === 'KeyV') setView(viewMode === 'chase' ? 'fpv' : 'chase');
  else if (e.code === 'KeyM') setSound(!audio.on);
  else if (e.code === 'KeyN') toggleMusic();
  else if (e.code === 'KeyZ') openPanel('guide');
  else if (e.code === 'KeyJ') openPanel('log');
  else if (e.code === 'Escape' && diaryBook.open) diaryBook.close();
  else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && diaryBook.open) diaryBook.step(e.code === 'ArrowLeft' ? -1 : 1);
  else if (e.code === 'Escape' && watch.r) stopWatch(true);
  else if (e.code === 'KeyG' || e.code === 'Escape') toGlobe();
  else if (e.code === 'KeyP') setMode(drone.mode === 'auto' ? 'manual' : 'auto');
  else if (e.code === 'KeyU') setSky(!drone.sky);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0, dragT = 0, pinched = false;   // (pinched: two fingers were down — the one left behind does not then turn the view)
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
  if (mode === 'globe') { gv.dragging = true; gv.vlon = gv.vlat = 0; dragT = performance.now(); }   // a touch catches a spinning globe
  tap.moved = 0; tap.t = performance.now();
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
    // about as far as the surface under the finger moves (gentler zoomed in), and a fling that
    // carries on at the speed of the last moments of the drag, not of a single jumpy event
    const k = 0.1 * (gv.dist - 1.0), now = performance.now(), dtm = clamp((now - dragT) / 1000, 0.008, 0.1); dragT = now;
    gv.lon -= dx * k; gv.lat = clamp(gv.lat + dy * k, -70, 70);
    const a = Math.min(1, dtm * 12);
    gv.vlon += (-dx * k / dtm * 0.6 - gv.vlon) * a; gv.vlat += (dy * k / dtm * 0.6 - gv.vlat) * a;
  } else {
    if (watch.r && pointers.size >= 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) watch.dist = clamp(watch.dist * pinch0 / d, 1.2, 60); pinch0 = d; pinched = true; tap.moved += 99; return; }
    if (watch.r && pinched) return;
    const k = isTouch ? 0.006 : 0.0035;
    tap.moved += Math.abs(dx) + Math.abs(dy);
    if (drone.mode === 'manual') { drone.lastInput = performance.now(); drone.yaw -= dx * k; drone.pitch -= dy * k; }
    else if (watch.r && !watch.pov) { watch.off -= dx * k * 1.2; watch.el = clamp(watch.el + dy * k, -0.12, 1.45); }   // watching: drag to circle round it (all the way to its face) and tilt, down to eye level
    else { look.held = true; look.yaw = clamp(look.yaw - dx * k, -2.6, 2.6); look.pitch = clamp(look.pitch - dy * k, -1.1, 1.1); }   // cruising: only the view turns
  }
});
const endP = (e: PointerEvent) => {
  if (mode === 'ocean' && pointers.has(e.pointerId)) {
    look.held = false; look.let = performance.now();
    if (drone.mode === 'auto' && tap.moved < 10 && performance.now() - tap.t < 450 && e.type === 'pointerup') { if (watch.r) { const s = pickAt(e.clientX, e.clientY); if (s && s.kind === 'robot') { const r = cur!.residents!.list.find((x: any) => x.subject === s); if (r) startWatch(r); } } else tapAt(e.clientX, e.clientY); }
  }
  pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (!pointers.size) pinched = false;
  gv.dragging = pointers.size > 0;
  if (performance.now() - dragT > 90) gv.vlon = gv.vlat = 0;   // held still before letting go: no fling
  gv.vlon = clamp(gv.vlon, -120, 120); gv.vlat = clamp(gv.vlat, -60, 60);
};
canvas.addEventListener('pointerup', endP); canvas.addEventListener('pointercancel', endP);
canvas.addEventListener('wheel', (e) => { if (mode === 'ocean' && watch.r && !watch.pov) { e.preventDefault(); watch.dist = clamp(watch.dist * (1 + clamp(e.deltaY, -120, 120) * 0.0012), 1.2, 60); return; } if (mode !== 'globe' || busy) return; e.preventDefault(); gv.tween = null; gv.lastUser = performance.now(); gv.dist = clamp(gv.dist * (1 + clamp(e.deltaY, -120, 120) * 0.0007), 1.35, 4.5); }, { passive: false });
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
// Pick a hunt to show: a live one near the drone that the main camera isn't already filming, and
// watch it from a slowly circling viewpoint, with its own post-processing, in a corner of the screen.
function renderPip(dt: number, air: boolean) {
  if (!cur) return;
  if ((pipScan -= dt) < 0) {
    pipScan = 0.5;
    const filming = lastShot?.subject.key;
    // a hunt that has gone quiet (missed, and the hunter barely moving) gives way to a livelier one nearby
    if (pipSubj && pipSubj.live()) {
      const p = pipSubj.pos(), el = pipT - pipFromT;
      if (p && el > 2) { pipSlow = Math.hypot(p.x - pipFrom.x, p.y - pipFrom.y, p.z - pipFrom.z) / el < 0.35; if (el > 4) { pipFrom.set(p.x, p.y, p.z); pipFromT = pipT; } }
      const st = pipSubj.status();
      pipIdle = !st.includes('追いかけ') && (st.includes('かわされ') || pipSlow) ? pipIdle + 0.5 : 0;
    }
    const stale = !pipSubj || !pipSubj.live() || pipIdle > 3;
    if (stale) {
      const was = pipSubj;
      let best: Subject | null = null, bd = 140;
      for (const s of cur.eco.subjects()) {
        if (s.kind !== 'hunt' || !s.live() || s.key === filming || (was && s.key === was.key && pipIdle > 3)) continue;
        const p = s.pos(); if (!p) continue;
        const d = Math.hypot(p.x - drone.pos.x, p.z - drone.pos.z) - (s.status().includes('追いかけ') ? 50 : 0);
        if (d < bd) { bd = d; best = s; }
      }
      if (best || !was || !was.live()) pipSubj = best;
      if (pipSubj && pipSubj !== was) { pipT = 0; pipIdle = 0; pipAng = Math.random() * 6.28; pipOff = 0; pipLift = 0; pipClear = 0; pipSlow = false; pipFromT = 0; const q = pipSubj.pos(); if (q) pipFrom.set(q.x, q.y, q.z); }
    }
    if (pipSubj && pipSubj.key === filming) pipSubj = null;
  }
  const want = pipOn && pipSubj && pipSubj.live() ? 1 : 0;
  pipFade += (want - pipFade) * Math.min(1, dt * 5);
  const el = $('pip');
  el.style.opacity = String(pipFade);
  el.hidden = pipFade < 0.02;
  if (pipFade < 0.02 || !pipSubj) return;
  const p = pipSubj.pos(); if (!p) return;
  pipT += dt; pipAng += dt * 0.05;
  $('pipText').textContent = `${pipSubj.label} — ${pipSubj.status()}`;
  // stay close on the hunter: from behind and to one side of it, looking past it toward its prey,
  // so the chase reads (and once the two are close, pull back a little to hold both)
  const q = pipSubj.target?.(), R = pipSubj.frameR?.() ?? pipSubj.size * 0.5;
  let sep = 0;
  _pa.set(p.x, p.y, p.z);
  if (q) { sep = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); if (sep < 6) _pa.lerp(_pb.set(q.x, q.y, q.z), 0.35 * (1 - sep / 6) + 0.1); }
  if (q && sep > 0.3) pipAng += angDiff(Math.atan2(p.z - q.z, p.x - q.x) + 0.9, pipAng) * Math.min(1, dt * 0.8);
  const dist = clamp(R * 1.6 + 1.5 + Math.min(sep, 6) * 0.3, 2.0, 10) * (1.25 - 0.25 * Math.min(1, pipT / 3));
  // on the reef, swing round (or rise) until no rock or coral head stands between the camera and the hunt
  if (!cur.loc.pelagic && (pipClear -= dt) < 0) {
    pipClear = 0.4;
    const clearAt = (a: number, lift: number) => {
      const cx = _pa.x + Math.cos(a) * dist, cz = _pa.z + Math.sin(a) * dist, cy = Math.min(_pa.y + dist * (0.18 + lift), -0.5);
      for (let i = 1; i <= 8; i++) { const f = i / 9; if (cur!.T.ground(cx + (_pa.x - cx) * f, cz + (_pa.z - cz) * f) > cy + (_pa.y - cy) * f - 0.25) return false; }
      return cur!.T.ground(cx, cz) < cy - 0.5;
    };
    let found = false;
    for (const lift of [pipLift, 0, 0.5, 1.0]) {
      for (const da of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, Math.PI]) if (clearAt(pipAng + pipOff + da, lift)) { pipOff += da; pipLift = lift; found = true; break; }
      if (found) break;
    }
    if (!found) pipLift = 1.0;
  }
  const ang = pipAng + pipOff;
  _t.set(_pa.x + Math.cos(ang) * dist, Math.min(_pa.y + dist * (0.18 + pipLift), -0.5), _pa.z + Math.sin(ang) * dist);
  if (!cur.loc.pelagic) _t.y = Math.max(_t.y, cur.T.ground(_t.x, _t.z) + 0.8);
  if (pipT < dt * 1.5) { pipCam.position.copy(_t); pipLook.copy(_pa); }
  else { pipCam.position.lerp(_t, Math.min(1, dt * 2.5)); pipLook.lerp(_pa, Math.min(1, dt * 4)); }
  pipCam.lookAt(pipLook); pipCam.updateMatrixWorld();
  // this camera's view of the sea: its own position for fog and light, the cells around it
  const keepPos = U.uCamPos.value.clone(), keepFwd = U.uCamFwd.value.clone();
  U.uCamPos.value.copy(pipCam.position); pipCam.getWorldDirection(U.uCamFwd.value);
  const vis = cur.cells.map((c: any) => [c.mesh.visible, c.hi?.visible]);
  for (const c of cur.cells) { const d = Math.hypot(c.x - pipCam.position.x, c.z - pipCam.position.z); c.mesh.visible = d < 70; if (c.hi) c.hi.visible = d < 20; }
  sky.position.copy(pipCam.position); surface.position.set(pipCam.position.x, 0, pipCam.position.z);
  const surf = surface.visible, snw = snow.visible; surface.visible = snow.visible = true;
  const r = el.getBoundingClientRect(), dpr = renderer.getPixelRatio(), H = innerHeight;
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (w !== pipRect.w || h !== pipRect.h) { pipRect.w = w; pipRect.h = h; pipPost.setSize(Math.floor(w * dpr), Math.floor(h * dpr)); pipCam.aspect = w / h; pipCam.updateProjectionMatrix(); }
  if (air && skyNow) lightFor(skyNow, false);   // (the little window looks under the water: lit as it is down there, even when we are up in the air)
  const wantBoost = clamp(Math.pow(0.17 / Math.max(pipLight(Math.max(0, -pipLook.y)), 0.01), 0.7), 1, 3);
  pipBoost += (wantBoost - pipBoost) * Math.min(1, dt * 1.2);
  pipPost.setExposure(1.9 * (1 + 0.45 * nightLift) * pipBoost);   // a touch brighter than the main view: the action has to read small
  // and when it is dim, a soft light over the hunt (as a filmer's lamp would give), so the fish themselves show
  const keepSpot = U.uSpot.value.clone();
  U.uSpot.value.set(pipLook.x, pipLook.y + 2.5, pipLook.z, clamp(0.3 * (pipBoost - 1) + 0.3 * nightLift, 0, 0.75));
  pipPost.whiteBalance(-pipCam.position.y, U.uAbs.value, U.uNight.value);
  renderer.setViewport(r.left, H - r.bottom, w, h); renderer.setScissor(r.left, H - r.bottom, w, h); renderer.setScissorTest(true);
  pipPost.render(renderer, oceanScene, pipCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.setScissor(0, 0, innerWidth, innerHeight);
  // put the main camera's view back
  if (air && skyNow) lightFor(skyNow, true);
  U.uSpot.value.copy(keepSpot);
  U.uCamPos.value.copy(keepPos); U.uCamFwd.value.copy(keepFwd);
  cur.cells.forEach((c: any, i: number) => { c.mesh.visible = vis[i][0]; if (c.hi) c.hi.visible = vis[i][1]; });
  sky.position.copy(camera.position); surface.position.set(camera.position.x, 0, camera.position.z);
  surface.visible = surf; snow.visible = snw;
  void air;
}
function setPip(on: boolean) {
  pipOn = on;
  try { localStorage.setItem('seaglass.pip', on ? '1' : '0'); } catch (e) { /* ignore */ }
  $('btnPip').setAttribute('aria-pressed', String(on));
}
function resize() {
  const w = innerWidth, h = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, TIERS[tier].dpr) * (SAFE === 1 ? 0.75 : SAFE >= 3 ? 0.5 : 1);
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
  if (gputest) { requestAnimationFrame(frame); return; }   // (the GPU test draws only what it is testing)
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
    updateCaption(dt);
    scanNotices(dt, now);
    const fwd = U.uCamFwd.value; camera.getWorldDirection(fwd);
    U.uCamPos.value.copy(camera.position);
    if (cur.cave) {
      // the camera opens up in the dark of the cave, and the sun's bake follows the sun
      cur.cave.updateSun(U.uSunDir.value);
      const cp = camera.position;
      camCave += (cur.cave.skyAt(cp.x, cp.y, cp.z) - camCave) * Math.min(1, dt * 1.2);
      U.uCamCave.value = camCave;
    }
    if (!lampManual && (lampT -= dt) < 0) { lampT = 0.5; const want = wantLamp(); if (want !== lampOn) setLamp(want, false); }
    // a touch more exposure at night, and much more in the dark of the cave (eased)
    {
      const cp = camera.position, cv = cur.cave;
      const ahead = cv ? cv.skyAt(cp.x + fwd.x * 5, cp.y + fwd.y * 5, cp.z + fwd.z * 5) : 1;
      const want = camera.position.y > 0 ? 1.25 * (1 + 0.6 * nightLift) * (watch.r && skyNow ? 1 + 0.35 * skyNow.night : 1) : 1.4 * (1 + 0.55 * nightLift) * (1 + 1.1 * (1 - Math.max(camCave, ahead * 0.8)));
      camExpo += (want - camExpo) * Math.min(1, dt * 0.8);
      post.setExposure(camExpo);
    }
    U.uLamp.value += ((lampOn && camera.position.y < 0 ? 1 : 0) - U.uLamp.value) * Math.min(1, dt * 6);   // no lamp beam from the air
    // watching a resident after dark: light it from above so what it is doing can be seen
    { const sp = U.uSpot.value, want = 0;   // (the residents carry their own lights now)
      sp.w += (want - sp.w) * Math.min(1, dt * 1.5);
      if (watch.r) { const wp = watch.r.pos; sp.x = wp.x; sp.y = wp.y; sp.z = wp.z; }
      // and open up the forest roof over it, so it can be seen from above
      const cut = U.uCut.value; if (watch.r && !watch.pov) cut.set(watch.r.pos.x, watch.r.pos.y, watch.r.pos.z, Math.max(9, watch.dist * 1.6)); else cut.w = 0; }
    const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
    cur.residents?.focus(watch.r);
    cur.residents?.update(dt, clock.ms, drone.pos);
    if (watch.r && (watch.infoT -= dt) < 0) { watch.infoT = 1; if (!watch.pov) renderWatch(); }
    if (watch.pov && watch.r && cur.residents) {
      // (Kamemaru names the creatures it sees)
      const fish = watch.r.id === 'kame' ? cur.eco.subjects().filter((sj) => { const p = sj.pos(); return !!p && p.y < 0 && Math.hypot(p.x - drone.pos.x, p.z - drone.pos.z) < 25; }).slice(0, 8).map((sj) => { const p = sj.pos()!; return { x: p.x, y: p.y, z: p.z, kind: 'fish', label: sj.label, sub: sj.status() }; }) : [];
      pov.update(watch.r, cur.residents.sense(watch.r), cur.residents.status(watch.r), camera, innerWidth, innerHeight, dt, fish, cur.residents.gibber);
    }
    // a rare scene has begun: announce it, put it in the log, and (cruising) go and film it
    { const rs = cur.rare?.takeStarted(); if (rs) announceRare(rs); }
    { const F = U.uFoam.value, fs = cur.breach.foams; for (let i = 0; i < 3; i++) { const f = fs[fs.length - 1 - i]; if (f) { const k = f.age / f.life; F[i].set(f.x, f.z, f.r * (1 + 1.6 * Math.sqrt(k)), Math.min(1, f.age * 4) * (1 - k)); } else F[i].w = 0; } }
    const ff = cur.flyfish;
    if (ff) {
      ff.update(dt, { splash: splashAt, stream: streamAt, plop: (p: THREE.Vector3) => plop(p.distanceTo(camera.position)) });
      if (ff.st.fresh) { ff.st.fresh = false; seaLog('sighting', `${guideEntries(cur.loc).find((e) => e.id === 'tobiuo')?.ja ?? 'トビウオ'}の群れが水面から飛び出した`, () => (ff.flying() ? ff.lead : null)); }
      // now and then: from the sky, a low run to put some up; from just under the surface, a few bursting out overhead
      if (drone.mode === 'auto' && !watch.r && !ff.st.active && !flyRun && (flyT -= dt) < 0) {
        flyT = rr(70, 160);
        if (drone.sky && !lastShot && !cur.bait?.st.active && !cur.breach.leap) flyRun = { burst: false, t: 0, side: 1 };
        else if (!drone.sky && drone.pos.y > -6 && drone.pos.y < -0.5) { const d = rr(7, 12); ff.burst(drone.pos.x + fx * d, drone.pos.z + fz * d, Math.atan2(fz, fx) + rr(-1.2, 1.2)); }
      }
    }
    // (through the drone's own eyes the animals hardly mind it — they would bolt from every slow pass of
    // the cruise otherwise; with the drone in the picture, a little more, and a little more when flown by hand)
    cur.eco.env.shy = viewMode === 'chase' ? (drone.mode === 'manual' ? 0.85 : 0.6) : 0.35;
    for (const ev of cur.eco.step(dt, U.uTime.value, drone.pos, fx, fz)) { seaLog(ev.kind, ev.text, ev.at); if (ev.text.startsWith('ベイトボール')) say('bait', {}, true); else if (ev.text.startsWith('沖で')) say('hunt'); }
    updateMarker(now);
    if ((wxTimer += dt) > 900) { wxTimer = 0; refreshWeather(cur.loc); }
    // thunderstorms: now and then a flicker of lightning through the surface, and the roll after it
    if (isStorm(liveWeather())) {
      if ((nextFlash -= dt) < 0) {
        nextFlash = 12 + Math.random() * 35; flashT = 0;
        const a = Math.random() * Math.PI * 2, km = 1 + Math.random() * 8;
        U.uBolt.value.set(Math.cos(a) * 0.993, 0.12, Math.sin(a) * 0.993, Math.random() * 100);
        thunder(km * 2.9, Math.min(1, 1.6 / km + 0.3));                   // sound covers a km in about three seconds
      }
      flashT += dt;
      U.uFlash.value = flashT < 0.5 ? (flashT < 0.08 || (flashT > 0.18 && flashT < 0.3) ? 1 : 0.15) * (1 - flashT) : 0;
    } else U.uFlash.value = 0;
    const W = cur.whales;
    setWhaleSong(W && W.seasonal ? (W.active ? 1 : 0.45) : 0);
    pumpLog(now);
    snowMat.uniforms.uPlank.value = 0.5 + cur.eco.env.plankton.sample(drone.pos.x, drone.pos.z) * 1.2;
    snowMat.uniforms.uBiolum.value = cur.loc.habitat === 'kelp' ? 0 : 1;
    if ((guideTimer += dt) > 2 && !guideEl.hidden) { guideTimer = 0; refreshGuide(); }
    // (in the air or in the sea, with some slack: riding the waterline it must not flip every frame)
    const lvl = camera.position.y - swellAt(camera.position.x, camera.position.z);
    if (lvl > 0.12 || (Math.abs(lvl) >= SPLIT_BAND && camera.position.y > 0)) airState = true; else if (lvl < -0.12) airState = false;
    const air = airState;
    cur.grow?.(drone.pos);   // (by an island: the reef further off filled in as the camera comes near it)
    // (and the life of the sea keeps about the camera, wherever it is along the island's shore)
    if (cur.loc.land) { const m = cur.loc.land.far - LIMIT - 10; ZONE.x = clamp(drone.pos.x, -m, m); ZONE.z = clamp(drone.pos.z, -m, m); } else ZONE.x = ZONE.z = 0;
    const vis = air ? 400 : Math.min(3.1 / U.uFogDen.value, 150) * TIERS[tier].coralVis + CELL * 0.72;
    for (const c of cur.cells) {
      const dx = c.x - drone.pos.x, dz = c.z - drone.pos.z, d = Math.hypot(dx, dz);
      const cs = c.big ? 80 : CELL;
      c.mesh.visible = d < (c.small ? (air ? 60 : 38) : vis + (cs - CELL) * 0.72) && (air || d < cs || (dx * fx + dz * fz) / d > -0.4);
      if (c.hi) c.hi.visible = c.mesh.visible && d < U.uLodR.value + CELL * 0.72;
    }
    cur.kelp?.update(drone.pos);   // (a kelp forest: the plants near the camera drawn finely)
    sky.position.copy(camera.position);
    surface.position.set(camera.position.x, 0, camera.position.z);
    setHum(drone.vel.length());
    // above the water the air takes over: sky, the sea from above, stars; no marine snow or water shafts
    surface.visible = snow.visible = !air;
    shafts.visible = !TIERS[tier].vol && !air;
    updateAir(camera, renderer.domElement.height, renderer.getPixelRatio());
    cur.birds?.update(dt, drone.pos, fx, fz, air, (sp, t) => { seaLog('observe', t); say('bird', { name: sp.ja }); }, cur.bait?.attract,
      { splash: splashAt, bubbles: (x, y, z) => bubblesAt(x, y, z, 1), plop: (p) => plop(p.distanceTo(camera.position)) });
    updateSplash(dt, snowMat.uniforms.uPx.value);
    stepMeteors(clock.live ? dt : dt * clock.speed, dt, clock.ms, camera.position, U.uStarM.value, { sunAir: skyNow!.sunAir, moonI: U.uMoonI.value, cloud: U.uCloud.value }, air, (t) => { seaLog('observe', t); say('meteor'); });
    // the guide: its own trips to the sky, and a word now and then when nothing much is happening
    skySchedule(dt);
    if ((chatT += dt) > 3600 / persona.talk * (0.6 + Math.random() * 0.8)) say(air ? 'idleSky' : skyNow!.night > 0.5 ? 'idleNight' : 'idle');
    const far = air ? 90000 : 460;
    if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
    setAir(air);
    post.setAir(air);
    post.whiteBalance(air ? 0 : -camera.position.y, U.uAbs.value, U.uNight.value, air);
    if (bisect) bisectStep(dt);
    // at the waterline: the view half under the water and half in the air (see render/split.ts)
    if (usePost() && Math.abs(lvl) < SPLIT_BAND && !watch.pov) {
      const sz = renderer.getDrawingBufferSize(_sz); split.setSize(sz.x, sz.y);
      const cy = camera.position.y, keepFar = camera.far, keepExpo = camExpo;
      for (const asAir of [false, true]) {
        U.uCamPos.value.y = asAir ? Math.max(cy, 0.03) : Math.min(cy, -0.03);
        // (and each side's sea surface just on the far side of the lens: under the water the surface is
        // drawn a touch above the camera, from the air a touch below, so neither side sees it edge-on —
        // from the air only close round the lens, or a shallow reef further off would show above the sea)
        surface.position.y = asAir ? 0 : Math.max(0, cy + 0.1);   // (the flat underside: above the lens itself, even on a crest) (seaTop.material as THREE.ShaderMaterial).uniforms.uDrop.value = asAir ? Math.max(0, 0.1 - lvl) : 0;
        surface.visible = snow.visible = !asAir; shafts.visible = !TIERS[tier].vol && !asAir;
        seaTop.visible = abyss.visible = asAir;   // (in a trough the lens may be below y = 0 while above the water: the sea from above all the same)
        camera.far = asAir ? 90000 : 460; camera.updateProjectionMatrix();
        post.setAir(asAir); post.whiteBalance(asAir ? 0 : 0.3, U.uAbs.value, U.uNight.value, asAir);
        post.setExposure(asAir ? 1.25 * (1 + 0.6 * nightLift) : 1.4 * (1 + 0.55 * nightLift));
        post.render(renderer, oceanScene, camera, asAir ? topScene : null, setRefraction, asAir ? split.air : split.water);
      }
      seaTop.visible = abyss.visible = camera.position.y > 0;
      surface.position.y = 0; (seaTop.material as THREE.ShaderMaterial).uniforms.uDrop.value = 0;
      U.uCamPos.value.y = cy; camera.far = keepFar; camera.updateProjectionMatrix(); post.setExposure(keepExpo);
      split.compose(renderer, camera);
    } else if (usePost()) post.render(renderer, oceanScene, camera, air ? topScene : null, setRefraction);
    if (!cur.shore) U.uHaze.value = 0;
    cur.shore?.update?.(camera.position, tier === 'low' ? 50 : tier === 'medium' ? 70 : 85);   // (the island's trees, near the camera)
    cur.residents?.bubbles(camera, innerWidth, innerHeight);
    if (usePost()) { if (!noPip) renderPip(dt, air); }
    else {
      renderer.setRenderTarget(null); renderer.render(oceanScene, camera);
      if (air) { setRefraction(null); renderer.autoClear = false; renderer.render(topScene, camera); renderer.autoClear = true; }
    }
    if ((hudTimer += dt) > 0.1) { hudTimer = 0; if (hudOn) updateHud(); }
    if ((mapTimer += dt) > 0.2 && hudOn) {
      mapTimer = 0;
      const bb = cur.bait?.st;
      minimap.draw(cur.loc, drone.pos.x, drone.pos.z, Math.atan2(fwd.x, -fwd.z), bb && bb.active ? bb.c : null, cur.residents ? cur.residents.list.map((r: any) => ({ x: r.pos.x, z: r.pos.z, color: r.sp.color })) : []);
    }
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
if (start) { gv.lat = start.lat; gv.lon = start.lon; setTimeout(() => (probe ? shaderProbe() : gputest ? gpuTest(start) : dive(start)), 300); }
void smooth;

// Inspect the live sim from the console with ?debug
if (location.search.includes('debug')) (window as any).seaglass = { get cur() { return cur; }, clock, drone, camera, swellAt, stepDrone: (dt: number) => updateDrone(dt, performance.now()), persona: (id: string) => setPersona(personaById(id)), watch, startWatch: (id: string) => startWatch(cur!.residents!.list.find((r: any) => r.id === id)), U, director, goTo, dive: async (id: string) => { const l = LOCATIONS.find((x) => x.id === id); if (!l) return; if (mode === 'ocean') await toGlobe(); await dive(l); }, seaLog, forceMeteors, minimap, get bait() { return cur?.bait; }, fly: () => { if (drone.sky) flyRun = { burst: false, t: 0, side: 1 }; else { const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw); cur?.flyfish?.burst(drone.pos.x + fx * 9, drone.pos.z + fz * 9, Math.atan2(fz, fx) + 0.8); } return !!cur?.flyfish; }, get flyRun() { return flyRun; }, breach: (kind: 'whale' | 'manta' = 'whale') => { const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw); return cur?.breach.force(kind, drone.pos, fx, fz); }, rare: (id: string) => { const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw); return cur?.rare.start(id, cur.eco.env, drone.pos, fx, fz); }, pip: () => ({ pipOn, subj: pipSubj?.key, fade: pipFade, hidden: $('pip').hidden, rect: $('pip').getBoundingClientRect().toJSON() }), thumbs: () => guideThumbs(cur!.loc, guideEntries(cur!.loc).map((e) => e.id)), studio: (id: string, view: [number, number, number], zoom = 1, focus: [number, number, number] | null = null, set: Record<string, number> = {}) => studio(cur!.loc, id, view, zoom, focus, set), setWx: (w: Partial<Weather>) => { wx = { ...FAIR, ok: true, at: Date.now(), ...w }; if (cur) applySky(cur.loc); } };

declare const __BUILD__: string;
// ?diag: what this machine's browser and GPU report, for tracking down a blank or white screen
if (location.search.includes('diag')) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;max-width:min(92vw,560px);max-height:80vh;overflow:auto;margin:0;padding:10px 12px;font:11px/1.5 ui-monospace,monospace;color:#eafffb;background:rgba(0,12,18,.86);border:1px solid rgba(143,232,216,.5);border-radius:8px;white-space:pre-wrap;user-select:text';
  document.body.appendChild(box);
  const errs: string[] = [];
  const cerr = console.error.bind(console), cwarn = console.warn.bind(console);
  console.error = (...a: any[]) => { errs.push('E ' + a.map(String).join(' ').slice(0, 400)); cerr(...a); };
  console.warn = (...a: any[]) => { errs.push('W ' + a.map(String).join(' ').slice(0, 200)); cwarn(...a); };
  addEventListener('error', (e) => errs.push('X ' + e.message));
  const gl = renderer.getContext() as WebGL2RenderingContext;
  diagLog = (t: string) => { console.info('[diag]', t); if (errs.length && errs[errs.length - 1].startsWith('C … ')) errs.pop(); errs.push(t); if (errs.length > 400) errs.shift(); };   // (a 'C …' line is the one compiling now: replaced when it finishes)
  // a shader that fails: its own logs, and enough of its source to tell which one it is
  renderer.debug.onShaderError = (g: WebGLRenderingContext, prog: WebGLProgram, vs: WebGLShader, fs: WebGLShader) => {
    const src = g.getShaderSource(fs) || '', own = [...new Set((src.match(/uniform\s+\w+\s+(?:\w+\s+)?(\w+)/g) || []).map((u) => u.split(/\s+/).pop()))].filter((u) => !(u! in U)).slice(0, 8);
    const logs = [g.getShaderInfoLog(vs), g.getShaderInfoLog(fs), g.getProgramInfoLog(prog)].map((l) => (l || '').trim()).filter(Boolean).join(' | ').slice(0, 300);
    errs.push(`S link=${g.getProgramParameter(prog, g.LINK_STATUS)} vs=${g.getShaderParameter(vs, g.COMPILE_STATUS)} fs=${g.getShaderParameter(fs, g.COMPILE_STATUS)} len=${src.length} own=[${own.join(',')}] ${logs}`);
  };
  let name = '?', vendor = '?';
  try { const x = gl.getExtension('WEBGL_debug_renderer_info'); name = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); vendor = String(gl.getParameter(x ? x.UNMASKED_VENDOR_WEBGL : gl.VENDOR)); } catch (e) { /* hidden */ }
  const ex = (n: string) => (renderer.extensions.has(n) ? 'yes' : 'NO');
  let frames = 0, t0 = performance.now(), fps = 0;
  const tick = () => {
    frames++; const now = performance.now();
    if (now - t0 > 1000) {
      fps = frames * 1000 / (now - t0); frames = 0; t0 = now;
      box.textContent = [
        `build    ${__BUILD__} UTC`,
        `GPU      ${name}`, `vendor   ${vendor}`, `WebGL2   ${gl instanceof WebGL2RenderingContext ? 'yes' : 'NO'}   maxTex ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`,
        `float RT ${ex('EXT_color_buffer_float')}   half RT ${ex('EXT_color_buffer_half_float')}   float linear ${ex('OES_texture_float_linear')}`,
        `tier     ${tier}   safe ${SAFE}   post ${usePost() ? 'on' : 'OFF'}   dpr ${renderer.getPixelRatio().toFixed(2)}   canvas ${canvas.width}x${canvas.height}`,
        `fps      ${fps.toFixed(1)}   ms/frame ${(1000 / Math.max(fps, 0.01)).toFixed(0)}   lost ${lostCount}   ctx ${gl.isContextLost() ? 'LOST' : 'ok'}   glError ${gl.getError()}`,
        `mode     ${mode}   sea ${cur?.loc.id ?? '-'}   cam y ${camera.position.y.toFixed(1)}`,
        `UA       ${navigator.userAgent}`,
        `now      ${diagNow || "-"}`,
        '', 'slowest shaders:', ...errs.filter((e) => /^C \d/.test(e)).sort((x, y) => parseFloat(y.slice(2)) - parseFloat(x.slice(2))).slice(0, 8),
        '', ...errs.filter((e) => !/^C \d/.test(e)).slice(-8),
      ].join('\n');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
