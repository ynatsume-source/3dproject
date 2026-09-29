// Soundscape: a soft generative score woven into the sounds of the reef.
//
// Music: sparse phrases on a sampled grand piano and a slow pad, played in a scale that follows the time of day
// (and, at Miyako, the Ryukyu scale). Everything goes through a long, dark reverb so notes bloom and
// fade instead of starting and stopping.
// Nature: a quiet, low water bed, soft bubbles, and the reef crackle of snapping shrimp that thickens
// after dark. Nothing is loud or bright; a compressor keeps the mix even for hours of listening.

let ac: AudioContext | null = null;
let master: GainNode, natureBus: GainNode, musicBus: GainNode, reverb: ConvolverNode, crackleGain: GainNode, motion: GainNode, bedGain: GainNode;
const timers: Record<string, number> = {};
export const audio = { on: false, music: true, night: 0, twilight: 0, phase: 'noon', sea: '' };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- scales & harmony by time of day ----------
// Pentatonic colours for most seas; at Miyako the Ryukyu scale (do mi fa so ti).
const RYUKYU = [0, 4, 5, 7, 11];
const MOODS: Record<string, { root: number; scale: number[]; lo: number; hi: number; gap: [number, number]; pad: number[][] }> = {
  // all major: pentatonic melodies over I / IV / V (with added ninths and sixths), warm rather than wistful
  dawn: { root: 62, scale: [0, 2, 4, 7, 9], lo: 0, hi: 12, gap: [5, 11], pad: [[0, 7, 16], [5, 12, 16], [-5, 7, 14]] },
  noon: { root: 67, scale: [0, 2, 4, 7, 9], lo: -5, hi: 12, gap: [4, 9], pad: [[0, 7, 16], [5, 9, 16], [-5, 7, 14]] },
  dusk: { root: 65, scale: [0, 2, 4, 7, 9], lo: -5, hi: 12, gap: [6, 12], pad: [[0, 7, 14, 16], [5, 12, 16], [-3, 4, 9, 12]] },
  night: { root: 60, scale: [0, 2, 4, 7, 9], lo: 0, hi: 12, gap: [8, 15], pad: [[0, 7, 16], [5, 12, 16, 21], [-5, 7, 14]] },
};
function mood() {
  const m = MOODS[audio.phase] || MOODS.noon;
  // Miyako keeps the island colour of the Ryukyu scale by day; evenings and nights use the plain major pentatonic
  return audio.sea === 'miyako' && (audio.phase === 'noon' || audio.phase === 'dawn') ? { ...m, scale: RYUKYU } : m;
}
function scaleNotes(): number[] {
  const m = mood(), out: number[] = [];
  for (let o = -12; o <= 24; o += 12) for (const s of m.scale) { const n = m.root + o + s; if (n - m.root >= m.lo && n - m.root <= m.hi + 7) out.push(n); }
  return out.sort((a, b) => a - b);
}

// ---------- setup ----------
function makeImpulse(seconds: number, decay: number): AudioBuffer {
  const rate = ac!.sampleRate, len = Math.floor(rate * seconds), buf = ac!.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.08 + 0.9 * t;                     // later reflections are darker
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k * 0.97);
      d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.02 ? i / (rate * 0.02) : 1);
    }
  }
  return buf;
}

function build() {
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9000;
  master = ac.createGain(); master.gain.value = 0;
  master.connect(tone).connect(comp).connect(ac.destination);

  reverb = ac.createConvolver(); reverb.buffer = makeImpulse(5.5, 2.4);
  const wet = ac.createGain(); wet.gain.value = 0.55;
  reverb.connect(wet).connect(master);

  musicBus = ac.createGain(); musicBus.gain.value = audio.music ? 1 : 0;
  const musicDry = ac.createGain(); musicDry.gain.value = 0.35;
  musicBus.connect(musicDry).connect(master);
  musicBus.connect(reverb);

  natureBus = ac.createGain(); natureBus.gain.value = 1;
  natureBus.connect(master);
  const natureSend = ac.createGain(); natureSend.gain.value = 0.25;
  natureBus.connect(natureSend).connect(reverb);

  // water bed: very low, slowly breathing
  const len = ac.sampleRate * 8, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const bed = ac.createBufferSource(); bed.buffer = buf; bed.loop = true;
  const bedLp = ac.createBiquadFilter(); bedLp.type = 'lowpass'; bedLp.frequency.value = 170; bedLp.Q.value = 0.3;
  const bedHp = ac.createBiquadFilter(); bedHp.type = 'highpass'; bedHp.frequency.value = 40;
  bedGain = ac.createGain(); bedGain.gain.value = 0.14;
  const swell = ac.createOscillator(); swell.frequency.value = 0.05;
  const swellAmt = ac.createGain(); swellAmt.gain.value = 0.06;
  swell.connect(swellAmt).connect(bedGain.gain); swell.start();
  bed.connect(bedHp).connect(bedLp).connect(bedGain).connect(natureBus); bed.start();

  // drone motion: a faint airy wash that rises with speed (no motor tone)
  const wash = ac.createBufferSource(); wash.buffer = buf; wash.loop = true; wash.playbackRate.value = 1.7;
  const washBp = ac.createBiquadFilter(); washBp.type = 'bandpass'; washBp.frequency.value = 500; washBp.Q.value = 0.5;
  motion = ac.createGain(); motion.gain.value = 0;
  wash.connect(washBp).connect(motion).connect(natureBus); wash.start();

  // reef crackle
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
  const soft = ac.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 7000;
  crackleGain = ac.createGain(); crackleGain.gain.value = 0.18;
  crackleGain.connect(hp).connect(soft).connect(natureBus);
}

export function startAudio(): boolean {
  if (!(window.AudioContext || (window as any).webkitAudioContext)) return false;
  if (!ac) build();
  audio.on = true;
  ac!.resume();
  master.gain.cancelScheduledValues(ac!.currentTime);
  master.gain.setTargetAtTime(0.85, ac!.currentTime, 1.5);
  loadPiano();
  loopBubbles(); loopCrackle(); loopPhrase(); loopPad();
  return true;
}
export function stopAudio() {
  audio.on = false;
  for (const k in timers) clearTimeout(timers[k]);
  songRunning = false;
  if (!ac) return;
  master.gain.setTargetAtTime(0, ac.currentTime, 0.4);
  setTimeout(() => { if (!audio.on) ac!.suspend(); }, 2000);
}
export function setMusic(on: boolean) {
  audio.music = on;
  if (ac) musicBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 1.2);
}
export function setMood(o: { phase: string; night: number; twilight: number; sea: string }) {
  audio.phase = o.phase; audio.night = o.night; audio.twilight = o.twilight; audio.sea = o.sea;
  if (ac && !inAir) bedGain.gain.setTargetAtTime(0.12 + 0.04 * (1 - o.night), ac.currentTime, 2);
}
export function setHum(speed: number) {
  if (ac && audio.on) motion.gain.setTargetAtTime(Math.min(0.03, speed * 0.008), ac.currentTime, 0.8);
}

// ---------- instruments ----------
// A real grand piano: Salamander Grand Piano samples (Alexander Holm, CC-BY 3.0), one every minor
// third, pitched to the nearest note. Played softly and darkened a little, like a felt piano heard
// from across a room.
const NAMES = ['C', 'Ds', 'Fs', 'A'], OFFS = [0, 3, 6, 9];
const piano = new Map<number, AudioBuffer>();
let pianoLoading = false;
function loadPiano() {
  if (pianoLoading || !ac) return;
  pianoLoading = true;
  const jobs: Promise<void>[] = [];
  for (let o = 1; o <= 7; o++) for (let k = 0; k < 4; k++) {
    if (o === 7 && k > 0) continue;
    const midi = 12 * (o + 1) + OFFS[k], url = `${import.meta.env.BASE_URL}audio/piano/${NAMES[k]}${o}.mp3`;
    jobs.push(fetch(url).then((r) => r.arrayBuffer()).then((b) => ac!.decodeAudioData(b)).then((buf) => { piano.set(midi, buf); }).catch(() => { /* fall back to the synth voice */ }));
  }
  Promise.all(jobs);
}
function pianoNote(midi: number, when: number, vel: number, pan: number, bright: number): boolean {
  if (!piano.size) return false;
  let best = -1, bd = 99;
  for (const m of piano.keys()) { const d = Math.abs(m - midi); if (d < bd) { bd = d; best = m; } }
  if (best < 0 || bd > 4) return false;
  const a = ac!, src = a.createBufferSource();
  src.buffer = piano.get(best)!;
  src.playbackRate.value = Math.pow(2, (midi - best) / 12);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + bright * 2600 + vel * 6000; lp.Q.value = 0.1;
  const g = a.createGain();
  const len = midi < 55 ? 7 : midi < 72 ? 5.5 : 4;
  g.gain.setValueAtTime(vel * 5, when);
  g.gain.setTargetAtTime(0.0001, when + len * 0.6, len * 0.25);    // let it ring, then a gentle damper
  const p = a.createStereoPanner(); p.pan.value = pan;
  src.connect(lp).connect(g).connect(p).connect(musicBus);
  src.start(when); src.stop(when + len * 1.6);
  return true;
}
function voice(midi: number, when: number, vel: number, pan: number, bright: number) {
  if (pianoNote(midi, when, vel, pan, bright)) return;
  const a = ac!, f = mtof(midi);
  const out = a.createGain(); out.gain.value = 1;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200 + bright * 3500; lp.Q.value = 0.2;
  const p = a.createStereoPanner(); p.pan.value = pan;
  out.connect(lp).connect(p).connect(musicBus);
  // soft felt piano / celesta: few partials, gentle attack, long bloom into the reverb
  const partials: [number, number, number][] = [[1, 1, 3.8], [2, 0.28 * bright + 0.1, 2.2], [3, 0.08, 1.2], [4.02, 0.05 * bright, 0.8]];
  for (const [mul, amp, dec] of partials) {
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul; o.detune.value = rnd(-4, 4);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * amp), when + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dec * (midi < 60 ? 1.4 : 1));
    o.connect(g).connect(out); o.start(when); o.stop(when + dec * 1.5 + 0.1);
  }
}

// a short phrase that wanders along the scale
function phrase() {
  if (!audio.on || !audio.music || !ac) return;
  const notes = scaleNotes(), m = mood();
  let idx = Math.floor(rnd(0.2, 0.7) * notes.length);
  const len = Math.random() < 0.25 ? 1 : 2 + Math.floor(Math.random() * 3);
  let w = ac.currentTime + 0.05;
  const night = audio.night;
  for (let k = 0; k < len; k++) {
    const vel = rnd(0.05, 0.11) * (1 - night * 0.35);
    const pan = rnd(-0.5, 0.5);
    voice(notes[idx], w, vel, pan, 0.6 - night * 0.35);
    if (Math.random() < 0.22) voice(notes[Math.max(0, idx - 2)] - 12, w, vel * 0.6, -pan, 0.3);   // a low answering note
    idx = Math.max(0, Math.min(notes.length - 1, idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    w += rnd(0.45, 1.1) * (1 + night * 0.4);
  }
  void m;
}
function loopPhrase() {
  clearTimeout(timers.phrase);
  const m = mood();
  timers.phrase = window.setTimeout(() => { phrase(); loopPhrase(); }, rnd(m.gap[0], m.gap[1]) * 1000);
}

let padIdx = 0;
function pad() {
  if (!audio.on || !audio.music || !ac) return;
  const a = ac, m = mood(), chord = m.pad[padIdx++ % m.pad.length];
  const now = a.currentTime, hold = rnd(22, 34);
  for (const iv of chord) {
    for (const det of [-6, 6]) {
      const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m.root - 12 + iv); o.detune.value = det;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520 - audio.night * 180;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.009, now + 7);
      g.gain.setValueAtTime(0.009, now + hold - 7);
      g.gain.linearRampToValueAtTime(0.0001, now + hold);
      o.connect(lp).connect(g).connect(musicBus); o.start(now); o.stop(now + hold + 0.2);
    }
  }
}
function loopPad() {
  clearTimeout(timers.pad);
  pad();
  timers.pad = window.setTimeout(loopPad, rnd(20, 30) * 1000);
}

// ---------- nature ----------
function bubble(when: number) {
  const a = ac!, o = a.createOscillator(), g = a.createGain(), f = rnd(220, 520);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const p = a.createStereoPanner(); p.pan.value = rnd(-0.7, 0.7);
  o.type = 'sine'; o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * rnd(1.8, 2.6), when + 0.08);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(rnd(0.008, 0.02), when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  o.connect(g).connect(lp).connect(p).connect(natureBus); o.start(when); o.stop(when + 0.16);
}
function loopBubbles() {
  clearTimeout(timers.bubbles);
  timers.bubbles = window.setTimeout(() => {
    if (!audio.on || !ac) return;
    const n = inAir ? 0 : Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 4) : 1;
    let w = ac.currentTime + 0.02;
    for (let i = 0; i < n; i++) { bubble(w); w += rnd(0.06, 0.18); }
    loopBubbles();
  }, rnd(2500, 8000));
}
function snap(when: number) {
  const a = ac!, len = Math.floor(a.sampleRate * 0.003), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.2));
  const s = a.createBufferSource(); s.buffer = b;
  const g = a.createGain(); g.gain.value = rnd(0.03, 0.16);
  const p = a.createStereoPanner(); p.pan.value = rnd(-0.9, 0.9);
  s.connect(g).connect(p).connect(crackleGain); s.start(when);
}
function loopCrackle() {
  clearTimeout(timers.crackle);
  timers.crackle = window.setTimeout(() => {
    if (!audio.on || !ac) return;
    const rate = 3 + audio.night * 22 + audio.twilight * 8;   // clicks per second
    const w = ac.currentTime + 0.01;
    for (let i = 0; i < rate * 0.3; i++) snap(w + Math.random() * 0.3);
    loopCrackle();
  }, 300);
}

// Parrotfish biting coral: a few short, muted scrapes.
export function crunch(vol: number) {
  if (!ac || !audio.on) return;
  let w = ac.currentTime + 0.01;
  for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
    const len = Math.floor(ac.sampleRate * 0.025), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(1200, 2200); f.Q.value = 1.4;
    const g = ac.createGain(); g.gain.value = 0.12 * vol;
    s.connect(f).connect(g).connect(natureBus); s.start(w);
    w += rnd(0.07, 0.12);
  }
}

// ---------- humpback song ----------
// In the breeding season males sing for hours: themes of moans, whoops and cries, each repeated a few
// times before the song moves on. Heard underwater from kilometres away, so it sits far back in the
// reverb, and grows when a pod is close.
let songLevel = 0, songRunning = false, theme: { f0: number; f1: number; dur: number; kind: number; gap: number }[] = [], themeLeft = 0;
function newTheme() {
  theme = [];
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const kind = Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : 2;   // moan, whoop, cry
    const f0 = kind === 0 ? rnd(90, 220) : kind === 1 ? rnd(180, 320) : rnd(700, 1300);
    const f1 = kind === 0 ? f0 * rnd(0.7, 1.35) : kind === 1 ? f0 * rnd(1.8, 2.6) : f0 * rnd(0.6, 1.2);
    theme.push({ f0, f1, dur: kind === 0 ? rnd(1.4, 3.2) : kind === 1 ? rnd(0.6, 1.1) : rnd(0.4, 0.9), kind, gap: rnd(0.3, 1.2) });
  }
  themeLeft = 2 + Math.floor(Math.random() * 3);
}
function songUnit(u: typeof theme[0], t0: number, vol: number) {
  const a = ac!;
  const o = a.createOscillator(); o.type = u.kind === 2 ? 'sine' : 'sawtooth';
  o.frequency.setValueAtTime(u.f0, t0); o.frequency.exponentialRampToValueAtTime(u.f1, t0 + u.dur);
  const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = rnd(3.5, 6.5); lg.gain.value = u.f0 * 0.012; lfo.connect(lg).connect(o.frequency);
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = u.kind === 2 ? 2400 : 650; f.Q.value = 3;
  const g = a.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + u.dur * 0.3); g.gain.setValueAtTime(vol, t0 + u.dur * 0.7); g.gain.linearRampToValueAtTime(0, t0 + u.dur);
  const send = a.createGain(); send.gain.value = 2.5;                    // mostly reverb: far away
  o.connect(f).connect(g); g.connect(natureBus); g.connect(send).connect(reverb);
  o.start(t0); lfo.start(t0); o.stop(t0 + u.dur + 0.05); lfo.stop(t0 + u.dur + 0.05);
}
function songLoop() {
  if (!ac || songLevel <= 0) { songRunning = false; return; }
  if (audio.on) {
    if (!theme.length || themeLeft <= 0) newTheme();
    themeLeft--;
    let t = ac.currentTime + 0.1;
    const vol = 0.028 * songLevel;
    for (const u of theme) { songUnit(u, t, vol * rnd(0.8, 1.1)); t += u.dur + u.gap; }
  }
  timers.song = window.setTimeout(songLoop, rnd(7, 16) * 1000);
}
export function setWhaleSong(level: number) {
  songLevel = level;
  if (level > 0 && !songRunning && ac) { songRunning = true; timers.song = window.setTimeout(songLoop, rnd(2, 6) * 1000); }
}

// ---------- weather ----------
// Rain heard from under the water is a soft, bright hiss; thunder arrives as a long, low roll.
let rainGain: GainNode | null = null;
export function setRain(level: number) {
  if (!ac) return;
  if (!rainGain) {
    const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.4 + 0.6 * Math.random() ** 8);   // hiss with crackle
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    rainGain = ac.createGain(); rainGain.gain.value = 0;
    s.connect(hp).connect(lp).connect(rainGain).connect(natureBus); s.start();
  }
  rainGain.gain.setTargetAtTime(audio.on ? Math.min(1, level) * 0.05 : 0, ac.currentTime, 1.5);
}
export function thunder(delay: number, vol: number) {
  if (!ac || !audio.on) return;
  const a = ac, t0 = a.currentTime + delay, dur = rnd(3, 6);
  const len = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.15; d[i] = v; }
  const s = a.createBufferSource(); s.buffer = b;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  const g = a.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5 * vol, t0 + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  const send = a.createGain(); send.gain.value = 0.8;
  s.connect(lp).connect(g); g.connect(natureBus); g.connect(send).connect(reverb);
  s.start(t0); s.stop(t0 + dur);
}

// Breaking the surface: a rush of water, then bubbles rising past the lens.
export function splash() {
  if (!ac || !audio.on) return;
  const a = ac, t0 = a.currentTime + 0.02, len = Math.floor(a.sampleRate * 1.6), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) { const t = i / a.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * (t < 0.03 ? t / 0.03 : 1); }
  const s = a.createBufferSource(); s.buffer = b;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t0); f.frequency.exponentialRampToValueAtTime(380, t0 + 1.2);
  const g = a.createGain(); g.gain.value = 0.35;
  s.connect(f).connect(g).connect(natureBus); s.start(t0);
  for (let k = 0; k < 14; k++) {
    const o = a.createOscillator(), og = a.createGain(), tt = t0 + 0.2 + Math.random() * 1.4, f0 = rnd(500, 1400);
    o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 1.8, tt + 0.07);
    og.gain.setValueAtTime(0, tt); og.gain.linearRampToValueAtTime(0.03, tt + 0.01); og.gain.exponentialRampToValueAtTime(0.0005, tt + 0.09);
    o.connect(og).connect(natureBus); o.start(tt); o.stop(tt + 0.1);
  }
}

// ---------- above the water ----------
// Out in the air the underwater bed, bubbles and reef crackle give way to wind and the slap and wash
// of waves around the drone.
let inAir = false, airGain: GainNode | null = null;
export function setAir(on: boolean) {
  if (!ac || on === inAir) return;
  inAir = on;
  if (!airGain) {
    const a = ac, len = a.sampleRate * 6, b = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let v = 0; for (let i = 0; i < len; i++) { v = v * 0.97 + (Math.random() * 2 - 1) * 0.12; d[i] = v; } }
    airGain = a.createGain(); airGain.gain.value = 0; airGain.connect(natureBus);
    // wind: a breathy band that gusts
    const wind = a.createBufferSource(); wind.buffer = b; wind.loop = true;
    const wbp = a.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 520; wbp.Q.value = 0.6;
    const wg = a.createGain(); wg.gain.value = 0.35;
    const gust = a.createOscillator(); gust.frequency.value = 0.07; const ga = a.createGain(); ga.gain.value = 0.2;
    gust.connect(ga).connect(wg.gain); gust.start();
    const sweep = a.createOscillator(); sweep.frequency.value = 0.045; const sa = a.createGain(); sa.gain.value = 180;
    sweep.connect(sa).connect(wbp.frequency); sweep.start();
    wind.connect(wbp).connect(wg).connect(airGain); wind.start();
    // waves: low wash that swells every few seconds
    const sea = a.createBufferSource(); sea.buffer = b; sea.loop = true; sea.playbackRate.value = 0.6;
    const slp = a.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 900;
    const sg = a.createGain(); sg.gain.value = 0.5;
    const swell = a.createOscillator(); swell.frequency.value = 0.13; const sw = a.createGain(); sw.gain.value = 0.45;
    swell.connect(sw).connect(sg.gain); swell.start();
    sea.connect(slp).connect(sg).connect(airGain); sea.start();
  }
  const t = ac.currentTime;
  airGain.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.4);
  bedGain.gain.setTargetAtTime(on ? 0 : 0.12 + 0.04 * (1 - audio.night), t, 0.4);
  crackleGain.gain.setTargetAtTime(on ? 0 : 0.18, t, 0.3);
}
