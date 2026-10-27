// Headless check (PROGRAM.md §6, findings R-027 / R-016): every line a resident says aloud — the meanings of
// lumau/frames.ts, each with every value it takes — is said as a person says it, before it can reach a subtitle.
//  1 no heading (共有：, 報告：, Share:, …): no colon in a spoken line at all
//  2 no brackets, fractions or signs: （ ） ( ) / % #, and no minus sign before a number (マイナス, said as a word)
//  3 no internal names: no run of Latin letters in the Japanese (a metre after a number is all right: 110m), no ids
//    with : # _ in either language
//  4 short: two sentences at most, and thirty characters at most (a bubble's two lines)
//  5 every line has its island words (each a word of the lexicon) and its English, and the English has no Japanese
//  6 no value it does not know: no hunger as a number (おなかは64パーセント — hungry or not, by the world's mark); a
//    distance said as a person says it (under 3 m すぐ近く; under 10 m to the metre; under 50 m to five, from 50 m to
//    ten, with くらい — said in the island's words too: about_n); no あなた between friends
// Usage: npx tsx scripts/say-words-check.ts
import { phrase, FRAME_VALUES as V, type Frame } from '../src/robots/lumau/frames';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };

// (every frame, with every value it takes: the people, the reasons, the deeds, the things; numbers small and large,
// and below zero where a reading can be)
const W = V.who, F: Frame[] = [];
for (const to of W) F.push({ act: 'ask-bring', to, what: 'wood' }, { act: 'accept-bring', to, what: 'wood' }, { act: 'offer-help', to, what: 'wood' }, { act: 'ask-day', to }, { act: 'ask-plan', to },
  { act: 'ask-body', to, what: 'hungry' }, { act: 'ask-body', to, what: 'sleepy' }, { act: 'ask-body', to, what: 'battery' }, { act: 'ask-how', to }, { act: 'ask-storm', to }, { act: 'greet', who: to });
for (const why of ['hungry', 'sleepy', 'hands-full', 'not-seen', 'busy-shells'] as const) F.push({ act: 'refuse', why });
for (const what of ['wood', 'shell', 'stone'] as const) for (const metres of [0.4, 7, 110, 840]) { F.push({ act: 'tell-where', what, metres }); for (const to of W) F.push({ act: 'tell-where', what, metres, to }); }
F.push({ act: 'hand-over', what: 'wood' }, { act: 'received', what: 'wood' }, { act: 'will-go' }, { act: 'noted' }, { act: 'accept-help' }, { act: 'decline-help', why: 'has-wood' }, { act: 'decline-help', why: 'hut-done' },
  { act: 'found', what: 'drift' }, { act: 'ask-why' }, { act: 'agree-proposal' }, { act: 'stars-recorded' }, { act: 'dont-know' });
for (const what of ['typhoon', 'rain', 'wind'] as const) F.push({ act: 'warn', what });
for (const doing of ['hut', 'map', 'wood', 'shells', 'eat', 'nap', 'sleep'] as const) F.push({ act: 'plan', doing });
F.push({ act: 'tell-day', did: [] });
for (const what of V.day) for (const n of [1, 3, 12]) F.push({ act: 'tell-day', did: [what === 'met' ? { what, n, with: 'kame' } : { what, n } as any] });
for (const a of V.day) for (const b of V.day) F.push({ act: 'tell-day', did: [a === 'met' ? { what: a, n: 1, with: 'dot' } : { what: a, n: 12 } as any, b === 'met' ? { what: b, n: 1, with: 'rakko' } : { what: b, n: 12 } as any] });
for (const reads of [0, 1, 41]) for (const mark of [undefined, 9, -8, -12]) for (const alarm of [false, true]) F.push({ act: 'tell-night', reads, mark, alarm });
for (const why of V.reason) F.push({ act: 'tell-why', why }, { act: 'object-proposal', why });
for (const what of V.findable) F.push({ act: 'ask-where', what }, { act: 'dont-know', what }, { act: 'heard-wrong', what });
F.push({ act: 'tell-body', hungry: true }, { act: 'tell-body', hungry: false, sleepy: true }, { act: 'tell-body', hungry: false, sleepy: false, battery: 100 }, { act: 'tell-body', battery: 7 });
for (const made of V.made) { F.push({ act: 'tell-result', made, ok: true }, { act: 'tell-result', made, ok: false }); for (const why of V.reason) F.push({ act: 'tell-result', made, ok: false, why }); }
for (const what of V.measured) for (const unit of V.unit) for (const n of [-12, 3, 1840]) F.push({ act: 'tell-measure', what, n, unit });
for (const a of V.cond) for (const b of ['typhoon', 'mark-up'] as const) if (a !== b) F.push({ act: 'tell-guess', if: a, then: b });   // (what a guess says may follow: a storm, or the mark rising)
for (const held of [true, false]) F.push({ act: 'tell-guess-status', held, hits: 12, wrong: 31 }, { act: 'tell-guess-status', held, hits: 1, wrong: 4 });
for (const deed of V.deed) {
  F.push({ act: 'propose', deed }, { act: 'counter', instead: deed }, { act: 'agree-do', deed }, { act: 'forbid', deed });
  for (const mine of V.deed) F.push({ act: 'propose', deed, mine });
  for (const why of V.reason) F.push({ act: 'order', to: 'dot', deed, why }, { act: 'forbid', to: 'rakko', deed, why }, { act: 'lecture', deed, why });
  for (const d2 of V.deed) F.push({ act: 'assign', parts: [{ who: 'lantern', deed }, { who: 'rakko', deed: d2 }] });
}
for (const became of ['piece', 'raft', 'catcher'] as const) F.push({ act: 'helped', what: 'wood', became });
for (const how of ['catch-rain', 'read-gauge'] as const) F.push({ act: 'teach', how });
for (const likely of [true, false]) for (const by of ['gauge', 'swell'] as const) F.push({ act: 'tell-storm', likely, by });
for (const thing of [...V.drift, '見たことのないもの']) F.push({ act: 'found-put', thing });
for (const c of V.count) for (const n of [0, 3, 24]) F.push({ act: 'tell-progress', counts: [{ what: c, n, ...(c === 'hut' ? { of: 24 } : c === 'map' ? { pct: true } : {}) }] });
F.push({ act: 'tell-progress', counts: [{ what: 'map', n: 30, pct: true }, { what: 'notes', n: 12 }, { what: 'cairn', n: 4 }] }, { act: 'tell-progress', counts: [{ what: 'hut', n: 0, of: 24 }, { what: 'isle', n: 0 }] },
  { act: 'tell-progress', counts: [{ what: 'hut', n: 18, of: 24 }, { what: 'isle', n: 5 }] }, { act: 'tell-progress', counts: [{ what: 'shell', n: 33 }, { what: 'full', n: 64 }] },
  { act: 'tell-progress', counts: [{ what: 'notes', n: 12 }, { what: 'full', n: 30, hungry: true }] }, { act: 'tell-progress', counts: [{ what: 'cairn', n: 3 }, { what: 'full', n: 90, hungry: false }] });
for (const by of [undefined, 'kame', 'lantern'] as const) for (const deeds of [['haul'], ['harvest'], ['haul', 'harvest']] as const) F.push({ act: 'assign-prep', who: ['dot'], deeds: [...deeds], by });
for (const by of [undefined, 'kame', 'lantern'] as const) for (const who of [['rakko'], ['kame'], ['rakko', 'kame']] as const) F.push({ act: 'assign-prep', who: [...who], deeds: ['eat'], by });
for (const metres of [2.9, 3, 9.4, 12, 19.6, 20, 47.6, 113, 137, 144.9]) F.push({ act: 'tell-where', what: 'shell', metres, to: 'rakko' });
// (what is passed on and corrected: each of the others' lines, once)
const inner: Frame[] = [{ act: 'warn', what: 'typhoon' }, { act: 'tell-night', reads: 41, mark: -8, alarm: false }, { act: 'tell-night', reads: 2, mark: 9, alarm: true }, { act: 'tell-night', reads: 0, alarm: false }, { act: 'tell-where', what: 'wood', metres: 110 }];
for (const said of inner) for (const from of W) F.push({ act: 'relay', from, said }, { act: 'correct', said });

const lines: { f: Frame; ja: string; en: string; isl: string[] }[] = [], broke: string[] = [];
for (const f of F) { try { const m = phrase(f); lines.push({ f, ...m }); } catch (e) { broke.push(`${JSON.stringify(f)}: ${(e as Error).message}`); } }
const show = (xs: typeof lines) => xs.slice(0, 6).map((x) => x.ja).join(' / ') || `${lines.length} lines`;
const sentences = (t: string) => (t.match(/[。？！]/g) ?? []).length || 1;
want('5 every frame makes a line of the island\'s words', broke.length === 0, broke.slice(0, 4).join(' / ') || `${F.length} frames`);
want('1 no heading', !lines.some((x) => /[：:]/.test(x.ja) || /^[A-Z][a-z]+:/.test(x.en)), show(lines.filter((x) => /[：:]/.test(x.ja) || /^[A-Z][a-z]+:/.test(x.en))));
const sign = (x: { ja: string }) => /[（）()\/％%#＃]/.test(x.ja) || /[-－−]\s?\d/.test(x.ja);
want('2 no brackets, fractions or signs', !lines.some(sign), show(lines.filter(sign)));
const inside = (x: { ja: string; en: string }) => /[A-Za-z_]{2,}/.test(x.ja.replace(/\d+m(?![A-Za-z])/g, '')) || /[A-Za-z]m(?![a-z])/.test(x.ja) || /[#_]|\w+:\w+/.test(x.en);
want('3 no internal names', !lines.some(inside), show(lines.filter(inside)));
const long = (x: { ja: string }) => sentences(x.ja) > 2 || [...x.ja].length > 30;
want('4 two sentences, thirty characters at most', !lines.some(long), lines.filter(long).slice(0, 8).map((x) => `${x.ja}（${[...x.ja].length}）`).join(' / ') || `longest ${Math.max(...lines.map((x) => [...x.ja].length))}`);
const noEn = (x: { en: string }) => !x.en || /[ぁ-んァ-ン一-龥]/.test(x.en);
want('5 English for every line, and none of it Japanese', !lines.some(noEn), show(lines.filter(noEn)));
const hidden = (x: { f: Frame; ja: string; isl: string[] }) => /おなかは\d|\d+パーセント$/.test(x.ja.replace(/電池は\d+パーセント|地図は\d+パーセント/g, '')) || /あなた/.test(x.ja)
  || (x.f.act === 'tell-where' && (x.f.metres < 3 ? !/すぐ近く/.test(x.ja) : x.f.metres < 9.5 ? /くらい/.test(x.ja) || x.isl.includes('mile')
    : !/くらい/.test(x.ja) || !x.isl.includes('mile') || !/[05]m/.test(x.ja) || (x.f.metres >= 50 && !/0m/.test(x.ja))));
want('6 no value it does not know; distances as a person says them; no あなた', !lines.some(hidden), show(lines.filter(hidden)) + ` (${lines.filter((x) => x.f.act === 'tell-where').slice(0, 1).map((x) => x.ja + ' ' + x.isl.join(' ')).join('')})`);
if (process.env.SHOW) { const by = new Map<string, string[]>(); for (const x of lines.filter(long)) by.set(x.f.act, [...(by.get(x.f.act) ?? []), `${x.ja}（${[...x.ja].length}）`]); for (const [k, v] of by) console.log(k, v.length, v.slice(0, 3).join(" / ")); }
console.log(bad ? `FAIL (${bad})` : 'all ok');
process.exit(bad ? 1 : 0);
