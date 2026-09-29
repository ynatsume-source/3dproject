// Synthesised ambience: swell, hiss, bubbles and the drone's motor hum.
// At night the reef crackle (snapping shrimp) rises, as it does on real reefs.
let ac: AudioContext | null = null;
let master: GainNode, hum: OscillatorNode, crackleGain: GainNode;
let bubbleTimer = 0, crackleTimer = 0;
export const audio = { on: false, night: 0 };

export function startAudio(): boolean {
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return false;
  audio.on = true;
  if (ac) { ac.resume(); master.gain.setTargetAtTime(0.9, ac.currentTime, 0.6); scheduleBubbles(); scheduleCrackle(); return true; }
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  master.gain.setTargetAtTime(0.9, ac.currentTime, 0.8);
  const len = ac.sampleRate * 6, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
  const ng = ac.createGain(); ng.gain.value = 0.55;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
  const lg = ac.createGain(); lg.gain.value = 0.22;
  lfo.connect(lg).connect(ng.gain); lfo.start();
  src.connect(lp).connect(ng).connect(master); src.start();
  const src2 = ac.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 0.6;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.6;
  const g2 = ac.createGain(); g2.gain.value = 0.04;
  src2.connect(bp).connect(g2).connect(master); src2.start();
  hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 46;
  const hf = ac.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 130;
  const hg = ac.createGain(); hg.gain.value = 0.035;
  hum.connect(hf).connect(hg).connect(master); hum.start();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
  crackleGain = ac.createGain(); crackleGain.gain.value = 0.5;
  crackleGain.connect(hp).connect(master);
  scheduleBubbles(); scheduleCrackle();
  return true;
}

export function stopAudio() {
  audio.on = false;
  if (!ac) return;
  master.gain.setTargetAtTime(0, ac.currentTime, 0.3);
  clearTimeout(bubbleTimer); clearTimeout(crackleTimer);
  setTimeout(() => { if (!audio.on) ac!.suspend(); }, 1200);
}

export function setHum(speed: number) {
  if (ac && hum && audio.on) hum.frequency.setTargetAtTime(44 + speed * 7, ac.currentTime, 0.4);
}

function bubble(when: number) {
  const o = ac!.createOscillator(), g = ac!.createGain(), f = 260 + Math.random() * 520;
  o.type = 'sine'; o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * (2.2 + Math.random()), when + 0.07);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.035, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
  o.connect(g).connect(master); o.start(when); o.stop(when + 0.14);
}
function scheduleBubbles() {
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => {
    if (!audio.on || !ac) return;
    const n = Math.random() < 0.3 ? 3 + Math.floor(Math.random() * 5) : 1;
    let w = ac.currentTime + 0.02;
    for (let i = 0; i < n; i++) { bubble(w); w += 0.05 + Math.random() * 0.12; }
    scheduleBubbles();
  }, 900 + Math.random() * 4200);
}
// Snapping shrimp: a bed of short broadband clicks, denser after dark.
function snap(when: number) {
  const len = Math.floor(ac!.sampleRate * 0.004), b = ac!.createBuffer(1, len, ac!.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
  const s = ac!.createBufferSource(); s.buffer = b;
  const g = ac!.createGain(); g.gain.value = 0.05 + Math.random() * 0.25;
  s.connect(g).connect(crackleGain); s.start(when);
}
function scheduleCrackle() {
  clearTimeout(crackleTimer);
  crackleTimer = window.setTimeout(() => {
    if (!audio.on || !ac) return;
    const rate = 6 + audio.night * 40;               // clicks per second
    let w = ac.currentTime + 0.01;
    for (let i = 0; i < rate * 0.25; i++) { snap(w + Math.random() * 0.25); }
    w += 0.25;
    scheduleCrackle();
  }, 250);
}
