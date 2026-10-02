// Soundscape: a soft generative score woven into the sounds of the reef.
//
// Music: sparse phrases on a sampled grand piano and a slow pad, played in a scale that follows the time of day
// (and, at Miyako, the Ryukyu scale). Everything goes through a long, dark reverb so notes bloom and
// fade instead of starting and stopping.
// Nature: a quiet, low water bed and soft bubbles. Nothing crackles, clicks or scrapes: every onset is
// rounded and the top end is kept low, so it stays kind to the ear. Nothing is loud or bright; a compressor keeps the mix even for hours of listening.

let ac: AudioContext | null = null;
let master: GainNode, natureBus: GainNode, musicBus: GainNode, reverb: ConvolverNode, crackleGain: GainNode, motion: GainNode, motor: GainNode, rotor: OscillatorNode[] = [], bedGain: GainNode;
const timers: Record<string, number> = {};
export const audio = { on: false, music: true, night: 0, twilight: 0, phase: 'noon', sea: '' };
// the listener's own levels, 0..1: everything, the music, and the sounds of the sea
export const vol = { all: 0.8, music: 0.8, nature: 0.8 };
const curve = (v: number) => v * v * 1.5625;   // (the ear hears level roughly on a square law; 0.8 plays as before)

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
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;   // nothing sharp reaches the ear
  master = ac.createGain(); master.gain.value = 0;
  master.connect(tone).connect(comp).connect(ac.destination);

  reverb = ac.createConvolver(); reverb.buffer = makeImpulse(5.5, 2.4);
  const wet = ac.createGain(); wet.gain.value = 0.55;
  reverb.connect(wet).connect(master);

  musicBus = ac.createGain(); musicBus.gain.value = audio.music ? curve(vol.music) : 0;
  const musicDry = ac.createGain(); musicDry.gain.value = 0.35;
  musicBus.connect(musicDry).connect(master);
  musicBus.connect(reverb);

  natureBus = ac.createGain(); natureBus.gain.value = curve(vol.nature);
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
  // the drone's rotors, heard only while it is pulling hard in the air (a chase): a soft low whirr, the
  // blades' buzz rounded off, rising in pitch with the thrust; silent the rest of the time
  const rotorLp = ac.createBiquadFilter(); rotorLp.type = 'lowpass'; rotorLp.frequency.value = 700; rotorLp.Q.value = 0.4;
  const flutter = ac.createOscillator(); flutter.frequency.value = 23;
  const flutterAmt = ac.createGain(); flutterAmt.gain.value = 0.25;
  motor = ac.createGain(); motor.gain.value = 0;
  const body = ac.createGain(); body.gain.value = 0.75; flutter.connect(flutterAmt).connect(body.gain); flutter.start();
  for (const [f, type, g] of [[165, 'sawtooth', 0.5], [168.5, 'triangle', 0.7], [331, 'triangle', 0.25]] as const) {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
    const og = ac.createGain(); og.gain.value = g; o.connect(og).connect(body); o.start(); rotor.push(o);
  }
  body.connect(rotorLp).connect(motor).connect(natureBus);

  // reef crackle
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
  const soft = ac.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 7000;
  crackleGain = ac.createGain(); crackleGain.gain.value = 0;
  crackleGain.connect(hp).connect(soft).connect(natureBus);
}

export function startAudio(): boolean {
  if (!(window.AudioContext || (window as any).webkitAudioContext)) return false;
  if (!ac) build();
  audio.on = true;
  ac!.resume();
  master.gain.cancelScheduledValues(ac!.currentTime);
  master.gain.setTargetAtTime(0.85 * curve(vol.all), ac!.currentTime, 1.5);
  loadPiano();
  loopBubbles(); loopPhrase(); loopPad();   // (no snapping-shrimp crackle: its hard clicks sat on top of the music)
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
  if (ac) musicBus.gain.setTargetAtTime(on ? curve(vol.music) : 0, ac.currentTime, 1.2);
}
export function setVolume(v: Partial<typeof vol>) {
  Object.assign(vol, v);
  if (!ac) return;
  const t = ac.currentTime;
  if (audio.on) master.gain.setTargetAtTime(0.85 * curve(vol.all), t, 0.08);
  musicBus.gain.setTargetAtTime(audio.music ? curve(vol.music) : 0, t, 0.08);
  natureBus.gain.setTargetAtTime(curve(vol.nature), t, 0.08);
}
export function setMood(o: { phase: string; night: number; twilight: number; sea: string }) {
  audio.phase = o.phase; audio.night = o.night; audio.twilight = o.twilight; audio.sea = o.sea;
  if (ac && !inAir) bedGain.gain.setTargetAtTime(0.12 + 0.04 * (1 - o.night), ac.currentTime, 2);
}
// thrust 0..1: how hard the drone is pulling (only ever heard in the air)
export function setMotor(thrust: number) {
  if (!ac || !audio.on || !motor) return;
  const now = ac.currentTime;
  motor.gain.setTargetAtTime(thrust * 0.011, now, thrust > 0.05 ? 0.25 : 0.9);
  const k = 1 + thrust * 0.45;
  rotor.forEach((o, i) => o.frequency.setTargetAtTime([165, 168.5, 331][i] * k, now, 0.4));
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
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const p = a.createStereoPanner(); p.pan.value = rnd(-0.7, 0.7);
  o.type = 'sine'; o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * rnd(1.8, 2.6), when + 0.08);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(rnd(0.006, 0.014), when + 0.035);   // a rounded onset: a blup, not a tick
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
  o.connect(g).connect(lp).connect(p).connect(natureBus); o.start(when); o.stop(when + 0.2);
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
// Parrotfish biting coral: left silent now (the short scrapes were too hard on the ear).
export function crunch(_vol: number) { /* silent */ }

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
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;   // an even hiss (no crackle)
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
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

// Breaking the surface. Going in: a short, soft "shan" as the lens cuts the water, then at once the world
// goes muffled and the air it took down with it rises past in a burst — "buku-buku-buku…", low and
// rounded, thinning out. Coming out: the water tearing off and running away, "za-ba", the sound opening
// up from muffled to bright in an instant, and a few drops falling from the drone.
export function splash(up = false) {
  if (!ac || !audio.on) return;
  const a = ac, t0 = a.currentTime + 0.02;
  const burst = (dur: number, decay: number) => {
    const len = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) { const t = i / a.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay) * (t < 0.012 ? t / 0.012 : 1); }
    const s = a.createBufferSource(); s.buffer = b; return s;
  };
  if (!up) {
    // the cut: brief, and with its top already going as the water closes over
    { const s = burst(0.45, 9), f = filt(a, 'lowpass', 2400, 0.5), g = a.createGain(); g.gain.value = 0.11;
      f.frequency.setValueAtTime(2400, t0); f.frequency.exponentialRampToValueAtTime(380, t0 + 0.25);
      s.connect(f).connect(g).connect(natureBus); s.start(t0); }
    // the gulp of water closing in: a low, rounded thump
    { const o = a.createOscillator(), g = shaped(a, t0 + 0.03, 0.02, 0.12, 0.02, 0.12);
      o.frequency.setValueAtTime(140, t0 + 0.03); o.frequency.exponentialRampToValueAtTime(60, t0 + 0.3); o.connect(g).connect(natureBus); o.start(t0 + 0.03); o.stop(t0 + 1); }
    // the bubbles: a burst of them right away, coming in uneven gulps, then fewer and fewer — each a small
    // pitch rising as it shrinks, all heard through the water (low-passed, no air in it)
    const lp = filt(a, 'lowpass', 1100, 0.6), bus = a.createGain(); bus.gain.value = 1; lp.connect(bus).connect(natureBus);
    const send = a.createGain(); send.gain.value = 0.35; bus.connect(send).connect(reverb);
    let tt = t0 + 0.06;
    for (let k = 0; k < 46 && tt < t0 + 1.9; k++) {
      const age = tt - t0, f0 = 170 + Math.random() * 380 * (1 + age * 0.4), lv = 0.05 * Math.exp(-age * 1.5) * (0.5 + Math.random() * 0.5);
      const o = a.createOscillator(), og = a.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * (1.5 + Math.random() * 0.6), tt + 0.05 + Math.random() * 0.04);
      og.gain.setValueAtTime(0.0001, tt); og.gain.exponentialRampToValueAtTime(lv, tt + 0.006); og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06 + Math.random() * 0.07);
      o.connect(og).connect(lp); o.start(tt); o.stop(tt + 0.16);
      tt += (Math.random() < 0.3 ? 0.008 : 0.025 + Math.random() * 0.05) * (1 + age * 1.6);   // (in gulps: clusters, then gaps)
    }
    // and under it all, the soft roar of the bubble cloud going by
    { const s = burst(1.6, 2.2), f = filt(a, 'lowpass', 520, 0.7), g = a.createGain(); g.gain.value = 0.09; s.connect(f).connect(g).connect(bus); s.start(t0 + 0.05); }
  } else {
    // out: the muffle tearing away — the water's rush opens from dark to bright in a moment, then drains off
    { const s = burst(0.9, 4.2), f = filt(a, 'lowpass', 500, 0.6), hp = filt(a, 'highpass', 120), g = a.createGain(); g.gain.value = 0.12;
      f.frequency.setValueAtTime(500, t0); f.frequency.exponentialRampToValueAtTime(5200, t0 + 0.12); f.frequency.exponentialRampToValueAtTime(1800, t0 + 0.8);
      s.connect(hp).connect(f).connect(g).connect(natureBus); s.start(t0); }
    // the water running off it: a light trickle, dying away
    { const s = burst(1.3, 2.4), bp = filt(a, 'bandpass', 2200, 0.7), g = a.createGain(); g.gain.value = 0.035; s.connect(bp).connect(g).connect(natureBus); s.start(t0 + 0.15); }
    // and a few drops falling back from it into the sea: little bright plinks, spread out
    for (let k = 0; k < 7; k++) {
      const tt = t0 + 0.25 + Math.pow(Math.random(), 1.3) * 1.3, f0 = 900 + Math.random() * 1400, o = a.createOscillator(), og = a.createGain();
      o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 1.6, tt + 0.03);
      og.gain.setValueAtTime(0.0001, tt); og.gain.exponentialRampToValueAtTime(0.012 * (0.5 + Math.random() * 0.5), tt + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      o.connect(og).connect(natureBus); o.start(tt); o.stop(tt + 0.08);
    }
  }
}

// ---------- leaps ----------
// A whale (big = 1) or a manta (0.2-0.3) leaping, heard from d metres off, from above the water or from
// below it. Each part is noise (or a falling tone) shaped by its own filter and envelope, all through one
// path for the distance: how late it arrives (sound in air, 343 m/s; in water, 1480), how loud, how much
// of its top is lost on the way (air takes the highs off with distance; the surface takes nearly all of
// them from a listener below), and how much of it comes back off the sea and the reef (the reverb).
let noiseBuf: AudioBuffer | null = null;
function noiseSrc(a: AudioContext, t0: number, dur: number, rate = 1) {
  if (!noiseBuf) { const n = a.sampleRate * 4; noiseBuf = a.createBuffer(1, n, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate;
  s.start(t0, Math.random() * 3.5); s.stop(t0 + dur); return s;
}
// a gain shaped: up in `att` s to `peak`, held `hold` s, then dying away with time constant `tau`
function shaped(a: AudioContext, t0: number, att: number, peak: number, hold: number, tau: number) {
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + att);
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t0 + att + hold); g.gain.setTargetAtTime(0.0001, t0 + att + hold, tau); return g;
}
function filt(a: AudioContext, type: BiquadFilterType, f: number, q = 0.7) { const x = a.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
// the way from where it happened to the listener: returns where to connect a part, and when it arrives
function leapPath(a: AudioContext, d: number, under: boolean) {
  const t0 = a.currentTime + 0.02 + d / (under ? 1480 : 343);
  const level = under ? 0.8 / (1 + d / 60) : 1 / (1 + d / 22);
  const out = a.createGain(); out.gain.value = level;
  const lp = filt(a, 'lowpass', under ? 1600 : Math.max(1200, 16000 * Math.exp(-d / 120)), 0.5);
  const send = a.createGain(); send.gain.value = under ? 0.5 : 0.18 + 0.6 * Math.min(1, d / 160);
  out.connect(lp).connect(natureBus); lp.connect(send).connect(reverb);
  return { t0, out, near: 1 / (1 + d / 40) };   // (near: for what only carries a little way, the fizz)
}
// tiny resonant pings of bubbles under the water (each a shrinking bubble ringing up in pitch)
function bubblePings(a: AudioContext, into: AudioNode, t0: number, n: number, span: number, lvl: number) {
  for (let k = 0; k < n; k++) {
    const tt = t0 + span * Math.pow(Math.random(), 1.8), f0 = 380 + Math.random() * 1800, o = a.createOscillator(), og = a.createGain();
    o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * (1.3 + Math.random() * 0.5), tt + 0.06);
    og.gain.setValueAtTime(0.0001, tt); og.gain.exponentialRampToValueAtTime(lvl * (0.4 + Math.random() * 0.6), tt + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03 + Math.random() * 0.05);
    o.connect(og).connect(into); o.start(tt); o.stop(tt + 0.12);
  }
}
// Coming down: "do-o-n" — the body hitting the water; "jaaaa" — the water it threw up crashing back;
// "aa..." — the spray raining down; "ssss" — the foam fizzing out, long after. Below the water: a heavy,
// muffled boom felt more than heard, then the roar of the bubble cloud and its ringing, and a fizz.
export function breachSound(big: number, d: number, under = false) {
  if (!ac || !audio.on) return;
  const a = ac, { t0, out, near } = leapPath(a, d, under), B = 0.35 + 0.65 * big;
  // the body hitting the water: deep and falling (forty tonnes; a manta, much less)
  for (const [f0, f1, g0, tau] of [[under ? 44 : 52, 22, 0.95, 0.5], [104, 46, 0.4, 0.22]] as [number, number, number, number][]) {
    const o = a.createOscillator(), g = shaped(a, t0, 0.008, g0 * B * (under ? 1.25 : 1) * (0.3 + 0.7 * big), 0.03, tau * (0.6 + 0.6 * big));
    o.frequency.setValueAtTime(f0 + 25 * (1 - big), t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + 0.9);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 4);
  }
  { const n = noiseSrc(a, t0, 1.2, 0.5), g = shaped(a, t0, 0.006, 0.6 * B, 0.02, 0.12); n.connect(filt(a, 'lowpass', under ? 260 : 380)).connect(g).connect(out); }
  if (!under) {
    // the slap: a hard, broad crack at the instant of impact
    { const n = noiseSrc(a, t0, 0.5), g = shaped(a, t0, 0.003, 0.55 * B, 0.015, 0.05); n.connect(filt(a, 'bandpass', 1100, 0.6)).connect(g).connect(out); }
    // the crash: a wall of water breaking, bright at first and darkening
    { const n = noiseSrc(a, t0 + 0.04, 5), bp = filt(a, 'bandpass', 2200, 0.35), g = shaped(a, t0 + 0.04, 0.07, 0.5 * B, 0.15 + 0.35 * big, 0.35 + 0.55 * big);
      bp.frequency.setValueAtTime(2300, t0); bp.frequency.exponentialRampToValueAtTime(600, t0 + 0.9 + 1.0 * big);
      n.connect(filt(a, 'highpass', 160)).connect(bp).connect(g).connect(out); }
    // the spray coming down: a patter of a thousand drops, thinning out
    { const len = Math.floor(a.sampleRate * (2.5 + 3 * big)), buf = a.createBuffer(1, len, a.sampleRate), dd = buf.getChannelData(0);
      for (let k = 0, n = Math.floor(900 * (0.5 + big)); k < n; k++) {
        const at = Math.floor(len * Math.pow(Math.random(), 1.6)), w = Math.floor(a.sampleRate * (0.004 + Math.random() * 0.012)), amp = (0.3 + Math.random() * 0.7) * (1 - at / len);
        for (let i = 0; i < w && at + i < len; i++) dd[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (w * 0.3));
      }
      const s = a.createBufferSource(); s.buffer = buf; const g = shaped(a, t0 + 0.5, 0.3, 0.26 * B, 0.15, 0.8 + 0.6 * big);
      s.connect(filt(a, 'lowpass', 3000)).connect(filt(a, 'highpass', 300)).connect(g).connect(out); s.start(t0 + 0.5); }
    // and the foam fizzing away, long after
    // (kept low and short: a faint hiss that is soon gone, not a long bright wash over everything)
    { const n = noiseSrc(a, t0 + 0.9, 4.5), g = shaped(a, t0 + 0.9, 0.6, 0.022 * (0.5 + big) * near * 2.2, 0.2, 0.7 + 0.6 * big);
      n.connect(filt(a, 'lowpass', 7000)).connect(filt(a, 'highpass', 3600)).connect(g).connect(out); }
  } else {
    // the bubble cloud: a low roar, and the bubbles in it ringing
    { const n = noiseSrc(a, t0 + 0.03, 7), lp = filt(a, 'lowpass', 1300, 0.6), g = shaped(a, t0 + 0.03, 0.05, 0.6 * B, 0.3 + 0.4 * big, 0.9 + big);
      lp.frequency.setValueAtTime(1300, t0); lp.frequency.exponentialRampToValueAtTime(260, t0 + 3 + 2 * big);
      n.connect(lp).connect(g).connect(out); }
    bubblePings(a, out, t0 + 0.1, Math.floor(40 + 70 * big), 2.5 + 2 * big, 0.05);
    // then a soft crackle of the fizz above, through the water
    { const n = noiseSrc(a, t0 + 1, 8, 0.7), g = shaped(a, t0 + 1, 0.8, 0.05 * (0.5 + big), 0.4, 2 + 1.5 * big); n.connect(filt(a, 'bandpass', 900, 0.8)).connect(g).connect(out); }
  }
}
// Breaking out: "zaba-a" — the water tearing as it comes out, and pouring off it. Below: a rushing whoosh
// and a burst of bubbles.
export function breachRise(big: number, d: number, under = false) {
  if (!ac || !audio.on) return;
  const a = ac, { t0, out } = leapPath(a, d, under), B = 0.3 + 0.7 * big;
  if (!under) {
    { const n = noiseSrc(a, t0, 3), bp = filt(a, 'bandpass', 900, 0.45), g = shaped(a, t0, 0.18, 0.4 * B, 0.15, 0.45 + 0.4 * big);
      bp.frequency.setValueAtTime(800, t0); bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.35); n.connect(bp).connect(g).connect(out); }
    { const n = noiseSrc(a, t0 + 0.2, 3.5), g = shaped(a, t0 + 0.2, 0.3, 0.2 * B, 0.5 + 0.6 * big, 0.5); n.connect(filt(a, 'lowpass', 2600)).connect(filt(a, 'highpass', 400)).connect(g).connect(out); }
  } else {
    { const n = noiseSrc(a, t0, 3, 0.6), lp = filt(a, 'lowpass', 500, 0.8), g = shaped(a, t0, 0.25, 0.45 * B, 0.2, 0.5);
      lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(900, t0 + 0.5); n.connect(lp).connect(g).connect(out); }
    bubblePings(a, out, t0 + 0.15, Math.floor(15 + 30 * big), 1.5, 0.035);
  }
}

// (?debug: a leap's sound rendered offline into a buffer, to check it or save it as a file)
export async function renderLeap(big: number, d: number, under: boolean, rise: boolean | 'in' | 'out' = false, seconds = 12): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, 44100 * seconds, 44100);
  const keep = { ac, natureBus, reverb, noiseBuf, on: audio.on };
  ac = off as unknown as AudioContext; noiseBuf = null; audio.on = true;
  natureBus = off.createGain(); natureBus.connect(off.destination);
  reverb = off.createConvolver(); reverb.buffer = makeImpulse(5.5, 2.4); const wet = off.createGain(); wet.gain.value = 0.35; reverb.connect(wet).connect(off.destination);
  try { if (rise === 'in' || rise === 'out') splash(rise === 'out'); else (rise ? breachRise : breachSound)(big, d, under); } finally { ({ ac, natureBus, reverb, noiseBuf } = keep); audio.on = keep.on; }
  return off.startRendering();
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
  airGain.gain.setTargetAtTime(on ? 0.2 : 0, t, 0.4);   // (wind and waves about as loud as the sea's hush below: no jump at the surface)
  bedGain.gain.setTargetAtTime(on ? 0 : 0.12 + 0.04 * (1 - audio.night), t, 0.4);
  crackleGain.gain.setTargetAtTime(0, t, 0.3);
}

// ---------- bait balls ----------
// The frenzy: a rushing, fluttering churn of thousands of fish turning at once and predators tearing
// through them, fading with distance; and the sharp plop of each bird or fish hitting the water.
let frenzyGain: GainNode | null = null;
export function frenzy(level: number, dist: number) {
  if (!ac) return;
  if (!frenzyGain) {
    const a = ac, len = a.sampleRate * 3, b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b; s.loop = true;
    const bp = a.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 650; bp.Q.value = 0.4;   // a soft churn, not a crackle
    const flutter = a.createGain(); flutter.gain.value = 0.6;
    const lfo = a.createOscillator(); lfo.frequency.value = 2.2; const lg = a.createGain(); lg.gain.value = 0.25;
    lfo.connect(lg).connect(flutter.gain); lfo.start();
    frenzyGain = a.createGain(); frenzyGain.gain.value = 0;
    s.connect(bp).connect(flutter).connect(frenzyGain).connect(natureBus); s.start();
  }
  const v = audio.on ? Math.min(1, level) * 0.16 / (1 + dist / 18) : 0;
  frenzyGain.gain.setTargetAtTime(v, ac.currentTime, 0.5);
}
export function plop(dist: number) {
  if (!ac || !audio.on || dist > 90) return;
  const a = ac, t0 = a.currentTime + dist / 1500, len = Math.floor(a.sampleRate * 0.35), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) { const t = i / a.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 9) * (t < 0.03 ? t / 0.03 : 1); }   // a soft onset: a muffled plunge
  const s = a.createBufferSource(); s.buffer = b;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = rnd(450, 800); f.Q.value = 0.5;
  const g = a.createGain(); g.gain.value = 0.18 / (1 + dist / 12);
  s.connect(f).connect(g).connect(natureBus); s.start(t0);
}

// ---------- the residents' voices ----------
// Each of them talks in a little language of its own — a run of soft blips, one per syllable, whose
// pitch rises and falls with the sentence (up at a question, bright at a "!"). Nobody can make out
// the words, but they always seem to understand each other. Rounded onsets, nothing sharp.
export interface VoiceTone { base: number; spread: number; wave: OscillatorType; rate: number; tone: number; glide: number; vib: number; steps?: number }
export const TONES: Record<string, VoiceTone> = {
  dot: { base: 520, spread: 0.35, wave: 'triangle', rate: 11, tone: 1900, glide: 0, vib: 0, steps: 5 },     // quick robot bleeps on a scale
  kame: { base: 165, spread: 0.2, wave: 'sine', rate: 5, tone: 700, glide: -0.12, vib: 4, },                // slow low hums that sink a little
  lantern: { base: 330, spread: 0.25, wave: 'sine', rate: 7, tone: 1400, glide: 0.08, vib: 6 },             // airy, wavering, thoughtful
  rakko: { base: 690, spread: 0.4, wave: 'triangle', rate: 13, tone: 2400, glide: 0.2, vib: 0 },            // squeaky, bouncing upward
};
let voiceBus: GainNode | null = null;
export function babble(who: string, text: string, vol: number, pan = 0) {
  if (!ac || !audio.on || vol < 0.01) return;
  const v = TONES[who]; if (!v) return;
  if (!voiceBus) { voiceBus = ac.createGain(); voiceBus.gain.value = 0.9; voiceBus.connect(master); voiceBus.connect(reverb); }
  const a = ac, chars = [...text].filter((c) => !/[\s「」『』（）()・…]/.test(c)).slice(0, 36);
  const ask = /[？?]\s*$/.test(text), shout = /[！!]\s*$/.test(text);
  let t = a.currentTime + 0.03, seed = 0;
  for (const c of text) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const p = a.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, pan)); p.connect(voiceBus);
  const n = chars.length;
  chars.forEach((c, i) => {
    if (/[、。，．,.!?！？ー〜]/.test(c)) { t += 1 / v.rate * (/[、，,ー〜]/.test(c) ? 0.9 : 1.6); return; }
    const k = i / Math.max(1, n - 1);
    let f = v.base * Math.pow(2, (rnd() - 0.5) * v.spread * 2);
    if (v.steps) f = v.base * Math.pow(2, Math.round((rnd() - 0.5) * v.steps) / 12 * 2);   // on a scale, like a little machine
    if (ask && k > 0.7) f *= 1 + (k - 0.7) * 1.2;          // rising at a question
    if (shout) f *= 1.12;
    f *= 1 - k * 0.08;                                     // sentences settle a little toward the end
    const d = (0.55 + rnd() * 0.3) / v.rate;
    const o = a.createOscillator(); o.type = v.wave;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * (1 + v.glide)), t + d);
    if (v.vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = v.vib; lg.gain.value = f * 0.025; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + d + 0.05); }
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = v.tone; lp.Q.value = 0.7;
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * vol, t + Math.min(0.025, d * 0.3));   // a soft start
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(lp).connect(g).connect(p); o.start(t); o.stop(t + d + 0.02);
    t += 1 / v.rate;
  });
}
