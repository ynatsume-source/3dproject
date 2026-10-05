// The residents' voices: Lumau read aloud by a small synthesizer (Web Audio), the same on every device.
//
// Every syllable is a consonant and a vowel. A voice is a soft tone (a sine with a little triangle) at the voice's
// pitch, coloured toward the vowel by two gentle formant filters over a dry body, so the vowels are told apart
// without sounding like a human throat. Each syllable sits on a note of a five-note scale (chosen by its vowel and
// its place in the sentence) and bounces up a little as it is said: a sung babble more than speech. Consonants are
// small and soft: a click (p t k), a puff (s h), a hum (m n), a dip (l w).
//
// Owner's note (2026-10-05): the first voices were close but harsh and a little eerie; these aim to be cute.
import { syllables } from '../islandlang';

export interface Voice {
  pitch: number;      // Hz: the voice's home note
  rate: number;       // syllables a second
  size: number;       // formant scale: > 1 a smaller body (brighter)
  tone: number;       // 0 a pure round tone .. 1 a brighter one (more triangle, more vowel colour)
  melody: number;     // how many scale steps the notes wander (0 flat .. 3 sing-song)
  bounce: number;     // rise within a syllable (0.06 = 6 %)
  vibrato: number;    // depth (0 .. 0.02)
  legato: number;     // how much of a syllable sounds (0.6 staccato .. 0.95 smooth)
}
export const VOICES: Record<string, Voice & { ja: string }> = {
  dot: { ja: 'ドット：明るい高め、はきはき', pitch: 340, rate: 7.5, size: 1.15, tone: 0.45, melody: 2, bounce: 0.07, vibrato: 0, legato: 0.72 },
  lantern: { ja: 'ランタン：やわらかい中くらい、ゆっくり', pitch: 270, rate: 5.6, size: 1.05, tone: 0.3, melody: 1, bounce: 0.04, vibrato: 0.012, legato: 0.9 },
  rakko: { ja: 'ラッコ：いちばん高い、ころころ速い', pitch: 460, rate: 9, size: 1.3, tone: 0.4, melody: 3, bounce: 0.1, vibrato: 0, legato: 0.65 },
  kame: { ja: 'カメマル：低めでまるい、のんびり', pitch: 190, rate: 4.4, size: 0.95, tone: 0.25, melody: 1, bounce: 0.03, vibrato: 0.008, legato: 0.92 },
};

// formants (Hz) of the five vowels, F1 and F2; Japanese-like u (not rounded)
const F: Record<string, [number, number]> = { a: [800, 1250], i: [300, 2250], u: [360, 1350], e: [480, 1900], o: [480, 880] };
// a major pentatonic, in semitones; each vowel leans to a note (i high, u low)
const SCALE = [0, 2, 4, 7, 9, 12, 14];
const VOWEL_NOTE: Record<string, number> = { i: 4, e: 3, a: 2, o: 1, u: 0 };

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
  const syl: { c: string; v: string; gap: number; first: boolean }[] = [];
  for (const w of words) {
    if (w === '.' || w === ',') { if (syl.length) syl[syl.length - 1].gap += w === '.' ? 0.3 : 0.15; continue; }
    syllables(w).forEach(([c, vv], k) => syl.push({ c, v: vv, gap: 0, first: k === 0 }));
    if (syl.length) syl[syl.length - 1].gap += 0.04;
  }
  const question = words.filter((w) => w !== '.' && w !== ',').pop() === 'ko';
  // the whole voice: a gentle low-pass takes the edge off, then the level
  const out = ctx.createGain(); out.gain.value = 0.55; out.connect(dest);
  const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 3400 * v.size; soft.Q.value = 0.5; soft.connect(out);

  const dur = 1 / v.rate; let t = at;
  syl.forEach((s, i) => {
    // the note: the vowel's lean, a word's first syllable a step up, wandering by the voice's melody, falling at the end
    const last = i === syl.length - 1;
    let step = Math.round((VOWEL_NOTE[s.v] - 2) * v.melody / 2) + 2 + (s.first ? 1 : 0);
    if (last) step = question ? 5 : Math.max(0, step - 2);
    const semis = SCALE[Math.max(0, Math.min(SCALE.length - 1, step))] - 4;
    const f0 = v.pitch * 2 ** (semis / 12);
    const cons = s.c, voiced = cons === '' || 'mnlw'.includes(cons);
    const cd = voiced ? 0 : 'ptk'.includes(cons) ? 0.012 : 0.03;
    const len = dur * v.legato, vs = t + cd, ve = t + len;

    // consonant: small and soft
    if (!voiced) {
      const n = ctx.createBufferSource(); n.buffer = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = (cons === 's' ? 4200 : cons === 'h' ? 1800 : cons === 't' ? 3000 : cons === 'k' ? 1800 : 1100) * v.size; bp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(cons === 's' || cons === 'h' ? 0.09 : 0.14, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + cd + 0.01);
      n.connect(bp).connect(g).connect(soft); n.start(t, (i * 0.137) % 0.8); n.stop(t + cd + 0.02);
    }
    // the tone: a sine body and a little triangle, bouncing up through the syllable
    const body = ctx.createOscillator(); body.type = 'sine';
    const edge = ctx.createOscillator(); edge.type = 'triangle';
    const dip = cons === 'l' || cons === 'w' ? 0.92 : 1;
    for (const o of [body, edge]) {
      o.frequency.setValueAtTime(f0 * dip, vs);
      o.frequency.exponentialRampToValueAtTime(f0 * (1 + v.bounce), ve);
    }
    if (v.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = f0 * v.vibrato;
      lfo.connect(lg); lg.connect(body.frequency); lg.connect(edge.frequency); lfo.start(vs); lfo.stop(ve + 0.06);
    }
    const env = ctx.createGain();
    const hum = cons === 'm' || cons === 'n';
    env.gain.setValueAtTime(0, vs);
    env.gain.linearRampToValueAtTime(hum ? 0.45 : 0.9, vs + 0.012);
    if (hum) env.gain.linearRampToValueAtTime(0.9, vs + 0.045);
    env.gain.linearRampToValueAtTime(0.7, ve - 0.02);
    env.gain.linearRampToValueAtTime(0, ve + 0.04);
    const bodyG = ctx.createGain(); bodyG.gain.value = 1 - v.tone * 0.5;
    const edgeG = ctx.createGain(); edgeG.gain.value = v.tone * 0.6;
    body.connect(bodyG).connect(env); edge.connect(edgeG);
    // vowel colour: the triangle through two soft formant filters (a hum starts closed, toward u)
    for (let j = 0; j < 2; j++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
      const target = F[s.v][j] * v.size, from = hum ? F.u[j] * v.size * 0.8 : target;
      bp.frequency.setValueAtTime(from, vs); bp.frequency.linearRampToValueAtTime(target, vs + 0.04);
      const g = ctx.createGain(); g.gain.value = (j === 0 ? 2.2 : 1.6) * (0.4 + v.tone);
      edgeG.connect(bp).connect(g).connect(env);
    }
    env.connect(soft);
    body.start(vs); edge.start(vs); body.stop(ve + 0.06); edge.stop(ve + 0.06);
    t += dur + s.gap;
  });
  return t;
}
