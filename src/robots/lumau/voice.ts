// The residents' voices: Lumau read aloud by a small synthesizer (Web Audio), the same on every device.
//
// Every syllable is a consonant and a vowel, so a voice is made the way a speaking machine is: a buzz at the voice's
// pitch, shaped by three filters at the vowel's formants; a consonant before it is a short noise (p t k s h), a hum
// (m n) or a glide (l w). Each resident has its own pitch, speed, body size (formants scaled), buzz and a habit of
// intonation. A sentence falls in pitch toward its end; a question (ending in ko) rises at the last syllable.
import { syllables } from '../islandlang';

export interface Voice {
  pitch: number;      // Hz at the start of a sentence
  fall: number;       // how far it falls by the end (0.2 = to 80 %)
  rate: number;       // syllables a second
  size: number;       // formant scale: 1 a mid-size body, < 1 bigger (lower), > 1 smaller (higher)
  wave: OscillatorType;
  wobble: number;     // pitch steps between syllables (0 = flat machine, 0.08 = sing-song)
  breath: number;     // noise mixed into vowels (0..0.3)
  crush: number;      // a little ring modulation for a machine edge (0..1)
}
export const VOICES: Record<string, Voice & { ja: string }> = {
  dot: { ja: 'ドット：中くらいの高さ、速め、はっきりした機械の声', pitch: 210, fall: 0.18, rate: 7.5, size: 1.05, wave: 'square', wobble: 0.05, breath: 0.04, crush: 0.35 },
  lantern: { ja: 'ランタン：低め、ゆっくり、やわらかい声', pitch: 150, fall: 0.15, rate: 5.6, size: 0.95, wave: 'sawtooth', wobble: 0.02, breath: 0.12, crush: 0.1 },
  rakko: { ja: 'ラッコ：高い、速い、上下に揺れる声', pitch: 300, fall: 0.1, rate: 9, size: 1.25, wave: 'triangle', wobble: 0.12, breath: 0.06, crush: 0.2 },
  kame: { ja: 'カメマル：とても低い、遅い、平らな声', pitch: 92, fall: 0.08, rate: 4.2, size: 0.78, wave: 'sawtooth', wobble: 0.01, breath: 0.08, crush: 0.5 },
};

// formants (Hz) of the five vowels, a mid-size voice; Japanese-like u (not rounded)
const F: Record<string, [number, number, number]> = { a: [800, 1250, 2600], i: [300, 2250, 3000], u: [360, 1350, 2400], e: [480, 1900, 2600], o: [480, 880, 2500] };

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 2 ** 32) * 2 - 1; }
  return noiseBuf;
}

/** Speak words (romanized Lumau; '.' and ',' pause) from time `at`; returns when it ends (context time). */
export function speak(ctx: BaseAudioContext, words: string[], v: Voice, dest: AudioNode = ctx.destination, at = ctx.currentTime + 0.05): number {
  const syl: { c: string; v: string; gap: number }[] = [];
  for (const w of words) {
    if (w === '.' || w === ',') { if (syl.length) syl[syl.length - 1].gap += w === '.' ? 0.35 : 0.18; continue; }
    for (const [c, vv] of syllables(w)) syl.push({ c, v: vv, gap: 0 });
    if (syl.length) syl[syl.length - 1].gap += 0.05;
  }
  const question = words.filter((w) => w !== '.' && w !== ',').pop() === 'ko';
  const out = ctx.createGain(); out.gain.value = 1.6 * (v.wave === 'triangle' ? 1.6 : 1); out.connect(dest);
  // the machine edge: ring modulation mixed with the dry voice
  const bus = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), ring = ctx.createGain(), carrier = ctx.createOscillator();
  dry.gain.value = 1 - v.crush * 0.6; wet.gain.value = v.crush * 0.6; carrier.frequency.value = 55 + v.pitch * 0.5; ring.gain.value = 0;
  carrier.connect(ring.gain); bus.connect(dry).connect(out); bus.connect(ring).connect(wet).connect(out);
  carrier.start(at);

  const dur = 1 / v.rate; let t = at;
  syl.forEach((s, i) => {
    const k = i / Math.max(1, syl.length - 1);
    let f0 = v.pitch * (1 - v.fall * k) * (1 + v.wobble * (i % 2 ? -1 : 1));
    if (i === 0) f0 *= 1.05;
    if (question && i === syl.length - 1) f0 *= 1.35;
    const cons = s.c, cd = cons === '' ? 0 : 'ptk'.includes(cons) ? 0.035 : cons === 's' || cons === 'h' ? 0.07 : 0.05;
    const vd = dur - cd;
    // consonant
    if ('ptksh'.includes(cons) && cons) {
      const n = ctx.createBufferSource(); n.buffer = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = (cons === 's' ? 5200 : cons === 'h' ? F[s.v][1] : cons === 't' ? 3800 : cons === 'k' ? 2000 : 900) * v.size; bp.Q.value = cons === 's' ? 2 : 1.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(cons === 'h' ? 0.25 : 0.45, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + cd);
      n.connect(bp).connect(g).connect(bus); n.start(t, Math.random() * 0.5); n.stop(t + cd + 0.01);
    }
    // vowel (and the voiced consonants m n l w, as a short hum or glide into it)
    const osc = ctx.createOscillator(); osc.type = v.wave;
    const vs = cons === '' || 'ptksh'.includes(cons) ? t + cd : t;
    osc.frequency.setValueAtTime(f0, vs); osc.frequency.linearRampToValueAtTime(f0 * 0.97, t + dur);
    const src = ctx.createGain(); osc.connect(src);
    const env = ctx.createGain(); env.gain.setValueAtTime(0, vs);
    const peak = 0.9;
    env.gain.linearRampToValueAtTime('mn'.includes(cons) && cons ? 0.35 : peak, vs + 0.015);
    if ('mn'.includes(cons) && cons) env.gain.setValueAtTime(0.35, t + cd), env.gain.linearRampToValueAtTime(peak, t + cd + 0.02);
    env.gain.setValueAtTime(peak, t + dur - 0.03); env.gain.linearRampToValueAtTime(0, t + dur + (s.gap ? 0 : 0.01));
    for (let j = 0; j < 3; j++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = [6, 9, 11][j];
      const target = F[s.v][j] * v.size;
      // the consonant colours the start of the vowel: m n hum low, l w glide from a dark vowel
      const start = cons === 'm' || cons === 'n' ? [250, 1100, 2400][j] * v.size : cons === 'w' ? F.u[j] * v.size : cons === 'l' ? [350, 1300, 2700][j] * v.size : target;
      bp.frequency.setValueAtTime(start, vs); bp.frequency.linearRampToValueAtTime(target, t + cd + 0.03);
      const g = ctx.createGain(); g.gain.value = [1, 0.6, 0.25][j] * (j === 0 ? 1 : 1.2);
      src.connect(bp).connect(g).connect(env);
    }
    if (v.breath) {
      const n = ctx.createBufferSource(); n.buffer = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F[s.v][1] * v.size; bp.Q.value = 3;
      const g = ctx.createGain(); g.gain.value = v.breath; n.connect(bp).connect(g).connect(env); n.start(vs, Math.random() * 0.5); n.stop(t + dur + 0.02);
    }
    env.connect(bus); osc.start(vs); osc.stop(t + dur + 0.03);
    t += dur + s.gap;
  });
  carrier.stop(t + 0.1);
  return t;
}
