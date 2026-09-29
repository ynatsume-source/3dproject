// Soundscape: a soft generative score woven into the sounds of the reef.
//
// Music: sparse piano / celesta phrases and a slow pad, played in a scale that follows the time of day
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
  dawn: { root: 62, scale: [0, 2, 4, 7, 9], lo: 0, hi: 12, gap: [5, 11], pad: [[0, 7, 16], [-3, 4, 12], [5, 12, 16]] },
  noon: { root: 67, scale: [0, 2, 4, 7, 9], lo: -5, hi: 12, gap: [4, 9], pad: [[0, 7, 16], [5, 9, 16], [-5, 7, 14]] },
  dusk: { root: 64, scale: [0, 3, 5, 7, 10], lo: -5, hi: 12, gap: [6, 12], pad: [[0, 7, 15], [-4, 3, 12], [-2, 5, 14]] },
  night: { root: 57, scale: [0, 3, 5, 7, 10], lo: 0, hi: 12, gap: [9, 18], pad: [[0, 7, 15], [-4, 3, 10], [5, 12, 15]] },
};
function mood() {
  const m = MOODS[audio.phase] || MOODS.noon;
  return audio.sea === 'miyako' ? { ...m, scale: RYUKYU } : m;
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
  loopBubbles(); loopCrackle(); loopPhrase(); loopPad();
  return true;
}
export function stopAudio() {
  audio.on = false;
  for (const k in timers) clearTimeout(timers[k]);
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
  if (ac) bedGain.gain.setTargetAtTime(0.12 + 0.04 * (1 - o.night), ac.currentTime, 2);
}
export function setHum(speed: number) {
  if (ac && audio.on) motion.gain.setTargetAtTime(Math.min(0.03, speed * 0.008), ac.currentTime, 0.8);
}

// ---------- instruments ----------
function voice(midi: number, when: number, vel: number, pan: number, bright: number) {
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
      g.gain.linearRampToValueAtTime(0.012, now + 7);
      g.gain.setValueAtTime(0.012, now + hold - 7);
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
    const n = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 4) : 1;
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

// A small rising chime when something new is spotted.
export function chime() {
  if (!ac || !audio.on || !audio.music) return;
  const notes = scaleNotes(), start = Math.floor(notes.length * 0.55);
  let w = ac.currentTime + 0.05;
  for (let k = 0; k < 3; k++) { voice(notes[Math.min(notes.length - 1, start + k * 2)] + 12, w, 0.07, rnd(-0.3, 0.3), 0.9); w += 0.16; }
}
