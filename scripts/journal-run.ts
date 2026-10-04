// The island's day, for 島だより (ADR 0004, publishing): the one Kayama whose Dot and Rakko write the media. Run once a
// day (.github/workflows/journal.yml). It takes up the island where the last run left it (DATA/storage.json), lives
// the day from morning to evening — the residents seeing, deciding (with a model when there is a key), photographing
// what they want to keep — then has Dot and Rakko each write the day's post from their own records and photographs.
// Out: DATA/drafts/<day>-<who>.json (the posts), DATA/photos/<id>.json (the shots to draw: tools/journal/photos.cjs),
// DATA/runs/<day>.json (what it cost and did), DATA/storage.json (the island, for tomorrow).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/journal-run.ts [--data DIR] [--day YYYY-MM-DD] [--dry]
//   ANTHROPIC_API_KEY in the environment: the residents think and write with the model; without it (or --dry) they
//   live by habit and the posts are plain drafts (by: "draft", never published).
import fs from 'node:fs';
import path from 'node:path';
import './node-land';

const arg = (k: string, d = '') => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(arg('--data', 'journal-data')), dry = process.argv.includes('--dry');
const today = new Date(Date.now() + 9 * 3.6e6).toISOString().slice(0, 10);
const DAY = arg('--day', today), FROM = +arg('--from', '6'), TO = +arg('--to', '20'), STEP = +arg('--step', '0.5');
for (const d of ['drafts', 'photos', 'runs']) fs.mkdirSync(path.join(DATA, d), { recursive: true });

// the island's memory: a storage that lives in a file (the API key never written to it)
const SFILE = path.join(DATA, 'storage.json'), SECRET = 'seaglass.aikey';
const store = new Map<string, string>(Object.entries(fs.existsSync(SFILE) ? JSON.parse(fs.readFileSync(SFILE, 'utf8')) : {}));
const key = !dry ? process.env.ANTHROPIC_API_KEY?.trim() : undefined;
if (key) store.set(SECRET, key); else store.delete(SECRET);
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k) } });
// (before the day: one small call to each model it will use, so a key, a model or a balance that will not do is said
// plainly and the run stops — rather than a whole day of silent "no answer")
if (key) {
  for (const model of ['claude-haiku-4-5-20251001', 'claude-opus-5-5']) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }) });
      if (r.ok) { console.log(`model check ${model}: ok`); continue; }
      let why = ''; try { const j: any = await r.json(); why = `${j?.error?.type ?? ''} ${String(j?.error?.message ?? '').slice(0, 200)}`; } catch { /* (no readable reason) */ }
      console.error(`model check ${model}: HTTP ${r.status} ${why}`.trim());
      console.error(r.status === 401 ? '→ the key is not accepted: check the ANTHROPIC_API_KEY secret' : r.status === 400 && /credit/i.test(why) ? '→ the account has no credit: add some at console.anthropic.com (Billing)' : r.status === 404 ? '→ this model is not available to the account' : '→ see the reason above');
      process.exit(1);
    } catch (e) { console.error(`model check ${model}: could not reach the API (${(e as Error).name})`); process.exit(1); }
  }
}
const saveStore = () => { const o: Record<string, string> = {}; for (const [k, v] of store) if (k !== SECRET) o[k] = v; fs.writeFileSync(SFILE, JSON.stringify(o)); };

// the island's own clock: the world's time stands in for the wall's, so its thinking is paced in island time
const t0 = Date.parse(`${DAY}T${String(FROM).padStart(2, '0')}:00:00+09:00`), t1 = Date.parse(`${DAY}T${String(TO).padStart(2, '0')}:00:00+09:00`);
// (a day the island has already lived is not lived again: the second run would only muddle the first — say so and stop)
{ const saved = store.get('seaglass.residents.v1'); const at = saved ? JSON.parse(saved).clockMs : 0; if (at >= t0) { console.log(`island day ${DAY}: already lived (the island is at ${new Date(at + 9 * 3.6e6).toISOString().slice(0, 16)} JST) — nothing to do`); process.exit(0); } }
let sim = t0;
const realNow = Date.now.bind(Date);
Date.now = () => sim;

const THREE = await import('three');
const { loadLand } = await import('../src/ocean/land');
const { LOCATIONS } = await import('../src/data/locations');
const loc: any = LOCATIONS.find((l) => l.id === 'kayama')!;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const { mindLog } = await import('../src/robots/agent/brain');
const mindMod = await import('../src/robots/mind'), { requestAiText } = mindMod;
const { writePost, draftPost } = await import('../src/journal/write');
// (a stand-in document for what the residents draw for themselves — a soft shadow texture — set only now: the
// modules above look for a real one when loaded)
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });

// how much they may think in a day of the run (operating settings; ADR 0004 §7): paced in island time
const { MINDS } = await import('../src/robots/agent/config');
// (no one is watching the day go by here: time to think properly, and to wait a turn rather than go without)
Object.assign(MINDS.dot, { minGapS: 600, ponderMaxS: 60, queueS: 120 }); MINDS.dot.deep!.dailyCap = 12; MINDS.dot.light!.dailyCap = 30;
Object.assign(MINDS.rakko, { minGapS: 900, ponderMaxS: 40, queueS: 120 }); MINDS.rakko.light!.dailyCap = 20;

const wall0 = realNow();
const oc: any = buildOcean(loc);
const R = oc.residents;
const cam = new THREE.Vector3();
let steps = 0, waits = 0;
console.log(`island day ${DAY} ${FROM}:00-${TO}:00 JST, ${key ? 'thinking with the model' : 'by habit (no key)'}`);
// (what each was doing, every ten minutes of the day: a stalled day shows)
const timeline: Record<string, string[]> = { dot: [], rakko: [] };
let nextLook = t0;
while (sim < t1) {
  sim += STEP * 1000;
  if (sim >= nextLook) { nextLook += 10 * 60e3; for (const w of ['dot', 'rakko']) { const r = R.list.find((x: any) => x.id === w), m = R.mind(r); timeline[w].push(`${new Date(sim + 9 * 3.6e6).toISOString().slice(11, 16)} ${r.task?.kind ?? '-'}${m?.thinking ? '(考え中)' : ''}`); } }
  const dot = R.list.find((r: any) => r.id === 'dot');
  cam.set(dot.pos.x, dot.pos.y + 30, dot.pos.z);
  R.update(STEP, sim, cam);
  steps++;
  // (one of them stopped to think: the island waits for the thought, as the body would stand thinking)
  for (const r of R.list) {
    const th = R.mind(r)?.thinking;
    if (th && !th.done) { waits++; const until = realNow() + 30000; while (!th.done && realNow() < until) await new Promise((res) => setTimeout(res, 50)); }
  }
  if (steps % 2000 === 0) await new Promise((res) => setImmediate(res));
}

const postIssues: Record<string, string[]> = {};   // (why a post did not come, for the run's record)
// the day's posts
const hm = (ms: number) => new Date(ms + 9 * 3.6e6).toISOString().slice(11, 16);
const dayOf = (ms: number) => new Date(ms + 9 * 3.6e6).toISOString().slice(0, 10);
const written: Record<string, string> = {};
for (const who of ['dot', 'rakko']) {
  const r = R.list.find((x: any) => x.id === who);
  const photos = (r.photos ?? []).filter((p: any) => p.day === DAY);
  for (const p of photos) fs.writeFileSync(path.join(DATA, 'photos', `${p.id}.json`), JSON.stringify(p));
  const inp = {
    who, name: r.v.name, profile: r.v.mind, day: DAY,
    // (what it set out to do and what came of it, one line each: "…：できた"; a 'do' with no result yet stays as it is)
    entries: r.diary.filter((e: any) => dayOf(e.at) === DAY).reduce((out: { time: string; text: string; key?: string }[], e: any) => {
      const last = out[out.length - 1];
      if (e.key === 'got' && last?.key === 'do' && e.text.startsWith(last.text + '：')) { last.text = e.text; last.key = 'got'; return out; }
      out.push({ time: hm(e.at), text: e.text, key: e.key }); return out;
    }, []).map(({ time, text }) => ({ time, text })),
    photos: photos.map((p: any) => ({ id: p.id, subject: p.subject, why: p.why, time: hm(p.at) })),
    talks: R.talks.filter((e: any) => dayOf(e.at) === DAY && e.who === who && !e.head).map((e: any) => ({ time: hm(e.at), with: e.with ?? '', text: e.text })),
  };
  const model = who === 'dot' ? MINDS.dot.deep!.model : MINDS.rakko.light!.model;
  const post = key ? await writePost(inp, async (sys, user) => { const t = await requestAiText(sys, user, { model, maxTokens: inp.photos.length ? 2500 : 9000, maxChars: 48000, timeoutMs: inp.photos.length ? 150000 : 300000, queueMs: 180000, pool: { name: `${who}:write`, cap: 3 }, onUsage: (u) => mindLog.push({ at: realNow(), who, tier: 'deep', why: '島だよりを書く', usage: u, usd: 0, ok: true }) }); if (!t) (postIssues[who] ??= []).push(mindMod.aiLastError || '返事がなかった'); return t; }, model, (why) => (postIssues[who] ??= []).push(why)) : draftPost(inp);
  if (post) { fs.writeFileSync(path.join(DATA, 'drafts', `${post.id}.json`), JSON.stringify(post, null, 1)); written[who] = `${post.title}（${post.drawing ? '絵1枚' : `写真${post.photos.length}枚`}、${post.by}）`; }
  else written[who] = '書けなかった';
}

// what it cost and did
const { PRICE } = await import('../src/robots/agent/config');
const usd = mindLog.reduce((a, m) => { const u = m.usage, p = u && PRICE[u.model]; return a + (u && p ? (u.input * p.in + u.cacheRead * p.in * 0.1 + u.cacheWrite * p.in * 1.25 + u.output * p.out) / 1e6 : 0); }, 0);
const run = {
  day: DAY, hours: [FROM, TO], thinking: !!key, steps, waits, minutes: +((realNow() - wall0) / 60000).toFixed(1),
  calls: mindLog.length, answered: mindLog.filter((m) => m.ok).length, bodies: Object.fromEntries(R.list.filter((x: any) => x.body).map((x: any) => [x.id, { troubles: x.body.troubles, eatStarts: x.body.eatStarts, eatAt: +x.body.learn.eatAt.toFixed(2), sleepAt: +x.body.learn.sleepAt.toFixed(2) }])), misses: mindLog.filter((m) => !m.ok).reduce((o: Record<string, number>, m) => { const k = m.miss ?? '?'; o[k] = (o[k] ?? 0) + 1; return o; }, {}), postIssues, usd: +usd.toFixed(4), byWho: Object.fromEntries(['dot', 'rakko'].map((w) => [w, mindLog.filter((m) => m.who === w).length])),
  photos: Object.fromEntries(['dot', 'rakko'].map((w) => [w, (R.list.find((x: any) => x.id === w).photos ?? []).filter((p: any) => p.day === DAY).map((p: any) => p.subject.label)])),
  posts: written, timeline,
  goals: Object.fromEntries(['dot', 'rakko'].map((w) => [w, R.list.find((x: any) => x.id === w).diary.filter((e: any) => dayOf(e.at) === DAY && e.key === 'mind').slice(-8).map((e: any) => e.text)])),
};
fs.writeFileSync(path.join(DATA, 'runs', `${DAY}.json`), JSON.stringify(run, null, 1));
// (the island, for tomorrow: saved as it stands at the end of the day)
(R as any).save?.();
saveStore();
console.log(JSON.stringify(run, null, 1));
process.exit(0);
