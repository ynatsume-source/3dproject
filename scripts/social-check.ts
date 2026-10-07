// Headless check (ADR 0004, step 2): Dot and Rakko, each with a mind of its own, on controlled ground.
//  A Dot asks Rakko for driftwood; Rakko takes it on, fetches a log only it has seen, hands it over; Dot shapes it —
//    and they say so aloud, in the island's words (lumau/frames.ts)
//  B Rakko, hungry, says no; Dot hears why, and does not ask again straight away
//  C Rakko tells Dot where a log is; Dot knows it as heard (from Rakko), not seen, and fetches it — and learns
//    from it that what others tell it is of use
//  D the same log: once one has it in hand (or on the way), the other is not offered it, and a plan naming it is not taken
//  E what to say is its mind's to choose: what it is about to do, and the weather when there is some to tell
//  F Rakko offers to bring Dot driftwood; Dot says yes — and it is as if Dot had asked: Rakko fetches and hands it over
//  G something new on the beach, seen by Rakko, told to Dot, who knows it then as heard
//  H round the evening fire, each is asked what it did today, and answers from what the world counted of its day
//  I the morning gathering: Lantern says what the night's gauge showed (and that a storm may come, when its guess says
//    so), all hear it; each says what it will do today; the hut wants wood and Dot has none, so Rakko offers to bring it
//  J the morning, more: Lantern's guess and how it has fared; a storm may come, so it proposes to put food by and the
//    others agree; Dot means to go to sea in a wind and Kamemaru forbids it, and says why when asked; with Rakko hungry,
//    Dot asks whether it is, and where wood is — and hears that no one knows
//  K the evening, more: what the rain catcher holds and how it is made; asked how its work went, Lantern says; the
//    morning's warning passed on to one who was not there; what was brought was of use, what was told was not there;
//    after a day when something told was of use, Kamemaru says that telling is
//  L a typhoon comes in: one who is up tells those near, plainly, to shelter
//  M a long swell (9 s or more between crests) on a calm morning: Kamemaru, who knows the sea, says a typhoon may come;
//    the world keeps count — a typhoon came after it
//  N the typhoon as a test: forecast at the morning gathering, agreed, who does what said; Dot hauls the raft up the
//    beach; the typhoon comes and passes and the raft is whole — getting ready paid, and it is remembered; the next
//    morning Dot asks of itself whether a storm is coming. Unwarned, a raft left on the beach loses half its pieces
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/social-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import type { BrainInput, Thought } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
function island(seed: number) {
  store.clear(); now = Date.parse('2026-10-03T01:00:00Z'); Math.random = mulberry32(seed);   // (10:00 on the island: after the morning gathering)
  const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  Math.random = mulberry32(seed * 7 + 1);   // (drawn again once the models are built: three.js draws an id for each part it
  // makes, so the island's own draws would otherwise shift whenever a model gains or loses a part)
  const dot = R.list.find((r: any) => r.id === 'dot'), rakko = R.list.find((r: any) => r.id === 'rakko');
  R.list.forEach((o: any, i: number) => { if (o !== dot && o !== rakko) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
  R.items.list.length = 0;
  dot.pos.set(61, 2, -145); dot.head = Math.PI; dot.battery = 1; dot.task = null;
  rakko.pos.set(61, 2, -160); rakko.head = Math.PI; rakko.hunger = 0.1; rakko.sleepy = 0.1; rakko.task = null; rakko.wet = false;
  return { R, dot, rakko, dm: R.mind(dot), rm: R.mind(rakko) };
}
const wood = (R: any, x: number, z: number) => { R.items.addAt('wood', x, z); return R.items.list[R.items.list.length - 1]; };
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 20; i++) { now += 50; R.update(0.05, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; }
  return false;
}
// stand-in brains, one per resident (as the model would be asked)
function brains(per: Record<string, (i: BrainInput) => Partial<Thought> | null>) {
  return async (i: BrainInput) => { const p = per[i.who]?.(i); return p ? ({ goal: { text: 'テスト', why: 'テスト' }, ...p } as Thought) : null; };
}
const opt = (i: BrainInput, pre: string) => i.options.find((o) => o.id.startsWith(pre) && o.ready !== false)?.id;

{ // A asked, taken on, fetched, handed over, shaped
  const { R, dot, rakko, dm, rm } = island(11);
  const log = wood(R, 61, -170);   // (beyond Rakko, out of Dot's sight)
  R.setBrain(brains({
    dot: (i) => i.now.holding === 'wood' ? { plan: ['craft:bench', 'place:hut'] } : opt(i, 'ask:') ? { plan: [opt(i, 'ask:')!] } : { plan: ['look:shore'] },
    // (Rakko only goes for the log once it has been asked)
    rakko: (i) => opt(i, 'accept:') ? { plan: [opt(i, 'accept:')!, opt(i, 'gather:wood')!, 'give:dot'] } : opt(i, 'give:') ? { plan: ['give:dot'] } : i.results.some((r) => r.optionId.startsWith('accept:')) && opt(i, 'gather:wood') ? { plan: [opt(i, 'gather:wood')!, 'give:dot'] } : { plan: ['wander:beach'] },
  }));
  want('A Dot has not seen the log', !dm.seen.has(`wood#${log.id}`));
  await run(R, 600, () => dot.stats.built >= 1);
  const q = R.requests?.[0] ?? null; void q;
  want('A Rakko took it on, fetched it and handed it to Dot', rakko.diary.some((e: any) => /頼み（流木を届ける）を引き受ける：できた/.test(e.text)) && rakko.diary.some((e: any) => /手渡した/.test(e.text)), rm.results.filter((r: any) => !/float|groom|wander/.test(r.optionId)).map((r: any) => `${r.optionId}:${r.outcome}`).join(' '));
  want('A Dot heard it from Rakko, and shaped and fitted it', dm.knowledge.some((k: any) => k.source === 'heard' && k.text.includes('届けて')) && dot.stats.built >= 1, `hut ${dot.stats.built}`);
  want('A both diaries say so', dot.diary.some((e: any) => e.text.includes('頼んだ')) && rakko.diary.some((e: any) => e.text.includes('手渡した')));
  { const said = (who: string, re: RegExp) => R.talks.some((e: any) => e.who === who && re.test(e.text));
    want('A said aloud: asked, taken on, handed over, received', said('dot', /運んでほしい/) && said('rakko', /運ぶ。$/) && said('rakko', /あなたに渡す/) && said('dot', /受け取った/),
      R.talks.filter((e: any) => !e.head).slice(-6).map((e: any) => `${e.who}:${e.text}`).join(' / ')); }
  void rakko;
}
{ // B a no
  const { R, dot, rakko, dm } = island(12);
  rakko.hunger = 0.8;
  R.setBrain(brains({ dot: (i) => opt(i, 'ask:') ? { plan: [opt(i, 'ask:')!] } : { plan: ['look:shore'] }, rakko: () => null }));   // (Rakko by its habits: hungry, it says no)
  await run(R, 300, () => dm.results.some((r: any) => r.outcome === 'refused'));
  const no = dm.results.find((r: any) => r.outcome === 'refused');
  want('B Rakko said no, and why', !!no && /断られた：おなかがすいている/.test(no.detail ?? ''), no?.detail ?? 'no answer');
  let asked = 0; const before = dot.diary.filter((e: any) => e.text.includes('頼んだ')).length;
  await run(R, 120); asked = dot.diary.filter((e: any) => e.text.includes('頼んだ')).length - before;
  want('B Dot does not ask again straight away', asked === 0, `asked again ${asked}`);
  void rakko;
}
{ // C told where
  const { R, dot, rakko, dm, rm } = island(13);
  // (far down the beach, beyond what Dot can see from its hut; Rakko is down there, looking at it)
  rakko.pos.set(61, 2, -232); rakko.head = Math.PI;
  const log = wood(R, 61, -250);
  R.setBrain(brains({
    dot: (i) => { const g = opt(i, 'gather:wood'); return g ? { plan: [g, 'craft:bench'] } : { plan: ['look:shore'] }; },
    rakko: (i) => { const t = opt(i, 'tell:dot:'); return t ? { plan: [t] } : { plan: ['wander:beach'] }; },
  }));
  // (how Dot first came to know of it)
  await run(R, 900, () => dm.seen.has(`wood#${log.id}`));
  const ob = dm.seen.get(`wood#${log.id}`);
  want('C Dot first knows of the log as told by Rakko', ob?.from === 'rakko' && dm.knowledge.some((k: any) => k.source === 'heard'), ob ? `from ${ob.from ?? 'its own eyes'}, ${Math.round(Math.hypot(ob.x - dot.pos.x, ob.z - dot.pos.z))} m off` : 'not known');
  await run(R, 600, () => dot.holding === 'wood' || dot.stats.built > 0);   // (the first time they meet, they identify each other first: the custom)
  want('C and fetches it', dm.results.some((r: any) => r.optionId === `gather:wood#${log.id}` && r.outcome === 'done'));
  want('C and learns that what it hears is of use (talking pays)', (dot.stats.talkUse ?? 0) > 0 && dot.diary.some((e: any) => /ラッコから聞いた情報で/.test(e.text)), `talkUse ${dot.stats.talkUse ?? 0}`);
  void rakko;
}
{ // D one log, two who want it
  const { R, dot, rakko, dm, rm } = island(14);
  const log = wood(R, 61, -152);   // (between them: both see it)
  let rakkoAsked: BrainInput | null = null;
  R.setBrain(brains({
    dot: (i) => { const g = i.options.find((o) => o.id === `gather:wood#${log.id}`); return g ? { plan: [g.id, 'craft:bench'] } : { plan: ['look:shore'] }; },
    rakko: (i) => { rakkoAsked = i; return { plan: [`gather:wood#${log.id}`] }; },
  }));
  await run(R, 120, () => !!dot.task && dot.task.opt === `gather:wood#${log.id}`);
  rm.why = '試しに考える'; rm.lastCall = -1e12;
  await run(R, 60, () => !!rakkoAsked && rakkoAsked.why === '試しに考える');
  const offered = !!(rakkoAsked as BrainInput | null)?.options.some((o) => o.id === `gather:wood#${log.id}`);
  want('D while Dot is on its way, Rakko is not offered that log', !offered);
  await run(R, 200, () => dot.holding === 'wood');
  want('D Dot has it; Rakko never had it', dot.holding === 'wood' && !rm.results.some((r: any) => r.optionId === `gather:wood#${log.id}` && r.outcome === 'done'));
  void dm; void rakko;
}
{ // E its mind picks what to say (ADR 0006, the island's language, step 3): what it is about to do, and the weather
  const { R, dot, rakko } = island(15);
  let offered: string[] = [];
  R.setBrain(brains({
    dot: (i) => { offered = i.options.filter((o) => o.id.startsWith('say:')).map((o) => o.id); const p = offered.find((x) => x.startsWith('say:plan:')); return p ? { plan: [p] } : { plan: ['look:shore'] }; },
    rakko: () => ({ plan: ['wander:beach'] }),
  }));
  await run(R, 1200, () => R.talks.some((e: any) => e.who === 'dot' && /僕は小屋を作る/.test(e.text)) && R.talks.some((e: any) => e.who === 'rakko' && /^わかった。$/.test(e.text)));
  const said = (who: string, re: RegExp) => R.talks.some((e: any) => e.who === who && re.test(e.text));
  want('E Dot is offered to tell Rakko what it is about to do, and says it', said('dot', /僕は小屋を作る/) && said('rakko', /わかった/), offered.join(' ') + ' / ' + R.mind(dot).results.slice(-4).map((r: any) => r.optionId + ':' + r.outcome).join(' '));
  R.setWeather({ ok: true, at: now, cloud: 1, rain: 8, code: 63, wind: 6, windDir: 0, gust: 9, pressure: 1004, typhoon: false, source: 'test', record: { station: 'test', at: '' } });
  R.setBrain(brains({ dot: (i) => { const w = i.options.find((o) => o.id.startsWith('say:warn:rain:')); return w ? { plan: [w.id] } : { plan: ['look:shore'] }; }, rakko: () => ({ plan: ['wander:beach'] }) }));
  await run(R, 1200, () => said('dot', /雨が降っている/));
  want('E in the rain, it is offered to warn, and does', said('dot', /今、雨が降っている/), R.talks.filter((e: any) => !e.head).slice(-3).map((e: any) => `${e.who}:${e.text}`).join(' / '));
  void dot; void rakko;
}
{ // F help offered
  const { R, dot, rakko } = island(17);
  wood(R, 61, -170);
  R.setBrain(brains({
    dot: (i) => i.now.holding === 'wood' ? { plan: ['craft:bench', 'place:hut'] } : { plan: ['look:shore'] },
    rakko: (i) => opt(i, 'say:offer:') ? { plan: [opt(i, 'say:offer:')!] } : i.results.some((r) => r.optionId.startsWith('say:offer:') && r.outcome === 'done') ? (opt(i, 'give:') ? { plan: ['give:dot'] } : opt(i, 'gather:wood') ? { plan: [opt(i, 'gather:wood')!, 'give:dot'] } : { plan: ['wander:beach'] }) : { plan: ['wander:beach'] },
  }));
  await run(R, 1800, () => rakko.diary.some((e: any) => /手渡した/.test(e.text)));
  const said = (who: string, re: RegExp) => R.talks.some((e: any) => e.who === who && re.test(e.text));
  want('F Rakko offers, Dot says yes', said('rakko', /流木を運ぼうか/) && said('dot', /手伝ってほしい/), R.talks.filter((e: any) => !e.head).slice(-4).map((e: any) => `${e.who}:${e.text}`).join(' / '));
  want('F and Rakko brings it, as if asked', rakko.diary.some((e: any) => /申し出て、頼まれた/.test(e.text)) && rakko.diary.some((e: any) => /手渡した/.test(e.text)), R.mind(rakko).results.slice(-8).map((r: any) => `${r.optionId}:${r.outcome}`).join(' '));
  void dot;
}
{ // G something new on the beach
  const { R, dot, rakko } = island(19);
  dot.pos.set(61, 2, -138);   // (out of sight of it: it lies beyond Rakko)
  Object.assign(R.drift, { kind: 0, x: 61, z: -183, t: 0, by: '' });   // (some 45 m from Dot: further than it can see; 23 m in front of Rakko)
  let seenOpts = '';
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: (i) => { seenOpts = i.options.filter((o) => o.id.startsWith('say:')).map((o) => o.id).join(','); return opt(i, 'say:found:') ? { plan: [opt(i, 'say:found:')!] } : { plan: ['look:shore'] }; } }));
  await run(R, 600, () => R.talks.some((e: any) => e.who === 'rakko' && /見慣れないもの/.test(e.text)));
  await run(R, 10);
  want('G Rakko tells Dot of it', R.talks.some((e: any) => e.who === 'rakko' && /浜に見慣れないものがある/.test(e.text)) && R.talks.some((e: any) => e.who === 'dot' && /わかった/.test(e.text)), `rakko sees it ${R.mind(rakko).seen.has('drift')}, dot ${R.mind(dot).seen.has('drift')}; offered ${seenOpts}`);
  want('G and Dot knows of it, as heard', R.mind(dot).seen.has('drift') && R.mind(dot).knowledge.some((k: any) => k.source === 'heard' && /見慣れない/.test(k.text)));
}
{ // H round the fire
  const { R, dot, rakko } = island(21);
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);   // (the day's counts taken)
  dot.stats.built += 2; rakko.stats.shells += 3;   // (what they did today)
  now = Date.parse('2026-10-03T09:50:00Z');   // (evening on the island: the gathering at the fire)
  const said = (who: string, re: RegExp) => R.talks.some((e: any) => e.who === who && re.test(e.text));
  await run(R, 1500, () => said('dot', /部材を2つ取りつけた/) && said('rakko', /貝殻を3つ集めた/));
  want('H asked what it did today', R.talks.some((e: any) => /今日は何をした/.test(e.text)), R.talks.filter((e: any) => !e.head).slice(-4).map((e: any) => `${e.who}:${e.text}`).join(' / '));
  want('H and each answers from its day', said('dot', /今日は部材を2つ取りつけた/) && said('rakko', /今日は貝殻を3つ集めた/));
}
{ // I the morning gathering
  const { R, dot, rakko, rm } = island(23);
  const lantern = R.list.find((r: any) => r.id === 'lantern'); lantern.pos.set(64, 2, -150); lantern.task = null; lantern.battery = 1;
  rakko.pos.set(61, 2, -230);   // (apart until the gathering: nothing asked of each other before it)
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);
  now = Date.parse('2026-10-03T23:40:00Z');   // (08:40 on the island: the morning gathering is near)
  R.village.gaugeLog.push({ at: now - 3 * 3.6e6, processId: 'test', mark: 6 }, { at: now - 3.6e6, processId: 'test', mark: 9 });
  R.village.hypo = { at: 0, by: 'lantern', mark: 8, airs: [], alarm: { at: now - 3.6e6, mark: 9 }, storms: [], hits: 0, falses: 0, misses: 0, leads: [], status: 'testing', heat: false };
  const said = (who: string, re: RegExp) => R.talks.some((e: any) => e.who === who && re.test(e.text));
  await run(R, 3600, () => R.village.mornings > 0);
  const lines = R.talks.filter((e: any) => e.conv && R.talks.some((h: any) => h.head && h.conv === e.conv && /朝の集まり/.test(h.text)) && !e.head).map((e: any) => `${e.who}:${e.text}`);
  console.log(lines.join('\n'));
  want('I Lantern tells the night: the gauge, and that a storm may come', said('lantern', /夜、気圧計を2回読んだ。目盛りは9。目盛りが高い。台風が来るかもしれない/));
  want('I and the others hear it, and have it to think about', [dot, rakko].every((r: any) => r.diary.some((e: any) => /ランタンから夜の気圧計の話を聞いた（2回読んで、目盛り9。台風が来るかもしれない）/.test(e.text))) && rm.knowledge.some((k: any) => k.source === 'heard' && /ランタンによると、夜に気圧計を2回読んで目盛りは9。台風が来るかもしれない/.test(k.text)));
  want('I each is asked what it will do today, and says', said('dot', /^僕は小屋を作る/) && said('rakko', /^僕は貝殻を集める/) && said('lantern', /^僕は眠る/) && lines.some((l: string) => /今日は何をする/.test(l)));
  want('I the hut wants wood: Rakko offers, Dot says yes, and it is taken on', said('rakko', /流木を運ぼうか/) && said('dot', /手伝ってほしい/) && rakko.diary.some((e: any) => /朝の集まりで、ドットに流木を運ぶと申し出て、頼まれた/.test(e.text)));
  want('I it ends: counted as a morning, not an evening', R.village.mornings === 1 && R.village.fires === 0 && dot.diary.some((e: any) => /朝の集まりに出た/.test(e.text)), `mornings ${R.village.mornings}, fires ${R.village.fires}`);
}
const meet = (R: any, ids: string[]) => { for (const id of ids) { const o = R.list.find((r: any) => r.id === id); o.pos.set(58 + Math.random() * 6, 2, -150 + Math.random() * 4); o.task = null; o.battery = 1; o.hunger = 0.1; o.sleepy = 0.1; } };
const saidBy = (R: any, who: string, re: RegExp) => R.talks.some((e: any) => e.who === who && re.test(e.text));
const alarmHypo = (now: number, extra: any = {}) => ({ at: 0, by: 'lantern', mark: 8, airs: [], alarm: { at: now - 3.6e6, mark: 9 }, storms: [], hits: 1, falses: 3, misses: 1, leads: [], status: 'doubted', heat: true, ...extra });
{ // J the morning, more
  const { R, dot } = island(25);
  meet(R, ['lantern', 'kame']); dot.stats.built = 99;
  R.village.map.seen['east-flat'] = { word: 'une', at: 0 };
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);
  now = Date.parse('2026-10-03T23:40:00Z');
  R.setWeather({ ok: true, at: 0, cloud: 0.2, rain: 0, code: 1, wind: 10, windDir: 90, gust: 14, pressure: 1008, typhoon: false, source: 'test', record: { station: 'test', at: '' } });
  R.village.gaugeLog.push({ at: now - 3.6e6, processId: 'test', mark: -4 });
  R.village.hypo = alarmHypo(now);
  await run(R, 3600, () => R.village.mornings > 0);
  want('J Lantern says its guess, what heat does, and how it has fared', saidBy(R, 'lantern', /目盛りが高いなら、台風が来るかもしれない/) && saidBy(R, 'lantern', /暑いなら、目盛りが上がるかもしれない/) && saidBy(R, 'lantern', /その考えは本当ではないかもしれない。当たり1、外れ4/) && saidBy(R, 'lantern', /目盛りは-4/));
  want('J it proposes to put food by; the others agree, and it is decided', saidBy(R, 'lantern', /みんなで食べ物をしまっておこう。僕は気圧計を読む/) && saidBy(R, 'kame', /わかった。僕も手伝う/) && R.village.stormPrep > 0);
  want('J Dot means to go to sea in a wind: forbidden, and asked why, told', saidBy(R, 'dot', /僕は地図を作る/) && saidBy(R, 'kame', /ドット、海に出るな/) && saidBy(R, 'dot', /^なぜ？/) && saidBy(R, 'kame', /^風が強いから/) && dot.diary.some((e: any) => /海に出るな/.test(e.text)));
}
{ // J2 Rakko hungry: Dot asks
  const { R, dot, rakko } = island(27);
  meet(R, ['lantern']);
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);
  now = Date.parse('2026-10-03T23:40:00Z'); rakko.pos.set(61, 2, -230);
  await run(R, 60); rakko.hunger = 0.9;
  await run(R, 3600, () => R.village.mornings > 0);
  want('J Rakko is hungry: Dot asks, and where wood is; no one knows', saidBy(R, 'dot', /ラッコ、おなかはすいている？/) && saidBy(R, 'rakko', /おなかがすいている/) && saidBy(R, 'dot', /流木はどこにある？/) && R.talks.some((e: any) => /流木のある場所を知らない|あそこに流木がある/.test(e.text)),
    R.talks.filter((e: any) => !e.head).slice(-8).map((e: any) => `${e.who}:${e.text}`).join(' / '));
}
{ // K the evening, more
  const { R, dot, rakko } = island(29);
  const kame = R.list.find((r: any) => r.id === 'kame');
  meet(R, ['lantern']);
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);
  now = Date.parse('2026-10-03T23:40:00Z');   // (the morning, Kamemaru far off)
  R.village.gaugeLog.push({ at: now - 3.6e6, processId: 'test', mark: 9 }); R.village.hypo = alarmHypo(now);
  await run(R, 3600, () => R.village.mornings > 0);
  meet(R, ['kame', 'lantern']); dot.pos.set(60, 2, -148); rakko.pos.set(62, 2, -152);
  R.village.catcher = { at: now, areaM2: 0.8, capMg: 20e6 };
  const { addLot } = await import('../src/world/process-runner'); addLot(R.lab, { materialId: 'process_water', amount: { value: 3.4e6, unit: 'mg' }, location: 'shelf' });
  now = Date.parse('2026-10-04T09:50:00Z');   // (the evening)
  R.village.labDone.push({ at: now - 3.6e6, processId: 'p14x_charcoal_kiln', ok: true });
  R.village.feedback.push({ from: 'dot', to: 'rakko', f: { act: 'helped', what: 'wood', became: 'piece' }, at: now }, { from: 'rakko', to: 'kame', f: { act: 'heard-wrong', what: 'wood' }, at: now });
  R.village.heardOkAt = now - 3.6e6;
  await run(R, 3000, () => R.village.fires > 0);
  want('K the rain catcher: how much it holds, and how it is made', saidBy(R, 'lantern', /たまった水は3リットル/) && saidBy(R, 'lantern', /竹と葉で、雨水をためられる/));
  want('K asked how its work went, Lantern says', R.talks.some((e: any) => /ランタン、結果はどうだった？/.test(e.text)) && saidBy(R, 'lantern', /炭を作ってみた。うまくいった/));
  want('K the morning warning, passed on to Kamemaru, who was not there', R.talks.some((e: any) => e.who !== 'lantern' && /ランタンによると、夜、気圧計を/.test(e.text)) && kame.diary.some((e: any) => /ランタンの朝の話/.test(e.text)));
  want('K what was brought was of use; what was told was not there', saidBy(R, 'dot', /流木は役に立った。小屋の部材になった/) && rakko.diary.some((e: any) => /小屋の部材になったと聞いた/.test(e.text)) && saidBy(R, 'rakko', /聞いた場所に流木はなかった/) && R.village.feedback.length === 0);
  want('K telling is of use: Kamemaru says so', saidBy(R, 'kame', /知らせたことは役に立つから、見たことを知らせるべきだ/));
}
{ // L a typhoon comes in
  const { R, dot, rakko } = island(31);
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);
  R.setWeather({ ok: true, at: 0, cloud: 0.9, rain: 8, code: 65, wind: 20, windDir: 90, gust: 30, pressure: 985, typhoon: true, source: 'test', record: { station: 'test', at: '' } });
  await run(R, 30);
  want('L told plainly to shelter, and it goes', saidBy(R, 'dot', /ラッコ、避難場所へ行け。台風が来ているから/) && saidBy(R, 'rakko', /わかった。行く/));
}
{ // M a long swell
  const { R } = island(33);
  meet(R, ['kame']);
  R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
  await run(R, 5);
  now = Date.parse('2026-10-03T23:40:00Z');
  const calmSwell = { ok: true, at: 0, cloud: 0.3, rain: 0, code: 2, wind: 5, windDir: 90, gust: 8, pressure: 1006, typhoon: false, thunder: false, swell: 1.6, swellPeriod: 10.5, swellDir: 150, source: 'test', record: { station: 'test', at: '' } };
  R.setWeather(calmSwell);
  await run(R, 3600, () => R.village.mornings > 0);
  want('M Kamemaru: a long swell is coming in, a typhoon may come', saidBy(R, 'kame', /長いうねりが来ているなら、台風が来るかもしれない/) && R.village.swellGuess.alarm > 0);
  R.setWeather({ ...calmSwell, typhoon: true, wind: 18, pressure: 988 }); await run(R, 40);
  want('M a typhoon came after it: counted', R.village.swellGuess.hits === 1 && R.village.swellGuess.alarm === 0 && R.list.find((r: any) => r.id === 'kame').diary.some((e: any) => /長いうねりのあとに台風が来た/.test(e.text)), JSON.stringify(R.village.swellGuess));
}
{ // N the typhoon as a test
  const gale = { ok: true, at: 0, cloud: 1, rain: 8, code: 65, wind: 18, windDir: 90, gust: 30, pressure: 985, typhoon: true, thunder: false, source: 'test', record: { station: 'test', at: '' } };
  const fair = { ...gale, cloud: 0.3, rain: 0, code: 2, wind: 4, gust: 6, pressure: 1010, typhoon: false };
  { // warned
    const { R, dot } = island(35);
    meet(R, ['lantern', 'kame']); dot.stats.built = 99;
    Object.assign(R.village.raft, { parts: 6, x: 58, z: -150, hauled: false });
    R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
    R.setWeather(fair); await run(R, 5);
    now = Date.parse('2026-10-03T23:40:00Z');
    R.village.gaugeLog.push({ at: now - 3.6e6, processId: 'test', mark: 9 }); R.village.hypo = alarmHypo(now);
    await run(R, 3600, () => R.village.mornings > 0);
    want('N forecast, agreed, and who does what is said', R.village.stormPrep > 0 && R.village.prepBy === 'lantern' && saidBy(R, 'lantern', /ドットは筏を高い所へ運ぶ/));
    await run(R, 1800, () => R.village.raft.hauled);
    want('N Dot hauls the raft up the beach', R.village.raft.hauled && dot.diary.some((e: any) => /筏を浜の上へ引き上げた/.test(e.text)));
    R.setWeather(gale); await run(R, 60); R.setWeather(fair); await run(R, 5);
    const log = R.village.stormLog.at(-1);
    want('N it passes and the raft is whole: getting ready paid, and it is remembered', R.village.raft.parts === 6 && log?.warned && log.saved.includes('筏') && R.village.heed.dot === 1 && dot.diary.some((e: any) => /ランタンの知らせで備えた。筏は無事だった/.test(e.text)), JSON.stringify(log));
    now = Date.parse('2026-10-04T23:40:00Z'); R.village.hypo.alarm = null;
    await run(R, 3600, () => R.village.mornings > 1);
    want('N the next morning Dot asks of itself whether a storm is coming', saidBy(R, 'dot', /ランタン、台風は来る？/) && saidBy(R, 'lantern', /目盛りは高くない。台風は来そうにない/));
  }
  { // unwarned
    const { R, dot } = island(37);
    Object.assign(R.village.raft, { parts: 6, x: 58, z: -150, hauled: false });
    R.setBrain(brains({ dot: () => ({ plan: ['look:shore'] }), rakko: () => ({ plan: ['look:shore'] }) }));
    R.setWeather(fair); await run(R, 5); R.setWeather(gale); await run(R, 60); R.setWeather(fair); await run(R, 5);
    want('N unwarned, the raft left on the beach loses half its pieces', R.village.raft.parts === 3 && !R.village.stormLog.at(-1)?.warned && dot.diary.some((e: any) => /前もって知らなかった。筏の部材3本を失った/.test(e.text)) && !R.village.heed.dot);
  }
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
