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
const saveStore = () => { const o: Record<string, string> = {}; for (const [k, v] of store) if (k !== SECRET) o[k] = v; fs.writeFileSync(SFILE, JSON.stringify(o)); };

// the island's own clock: the world's time stands in for the wall's, so its thinking is paced in island time
const t0 = Date.parse(`${DAY}T${String(FROM).padStart(2, '0')}:00:00+09:00`), t1 = Date.parse(`${DAY}T${String(TO).padStart(2, '0')}:00:00+09:00`);
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
const { requestAiText } = await import('../src/robots/mind');
const { writePost, draftPost } = await import('../src/journal/write');
// (a stand-in document for what the residents draw for themselves — a soft shadow texture — set only now: the
// modules above look for a real one when loaded)
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });

// how much they may think in a day of the run (operating settings; ADR 0004 §7): paced in island time
const { MINDS } = await import('../src/robots/agent/config');
Object.assign(MINDS.dot, { minGapS: 600 }); MINDS.dot.deep!.dailyCap = 12; MINDS.dot.light!.dailyCap = 30;
Object.assign(MINDS.rakko, { minGapS: 900 }); MINDS.rakko.light!.dailyCap = 20;

const wall0 = realNow();
const oc: any = buildOcean(loc);
const R = oc.residents;
const cam = new THREE.Vector3();
let steps = 0, waits = 0;
console.log(`island day ${DAY} ${FROM}:00-${TO}:00 JST, ${key ? 'thinking with the model' : 'by habit (no key)'}`);
while (sim < t1) {
  sim += STEP * 1000;
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
    entries: r.diary.filter((e: any) => dayOf(e.at) === DAY).map((e: any) => ({ time: hm(e.at), text: e.text })),
    photos: photos.map((p: any) => ({ id: p.id, subject: p.subject, why: p.why, time: hm(p.at) })),
    talks: R.talks.filter((e: any) => dayOf(e.at) === DAY && e.who === who && !e.head).map((e: any) => ({ time: hm(e.at), with: e.with ?? '', text: e.text })),
  };
  const model = who === 'dot' ? MINDS.dot.deep!.model : MINDS.rakko.light!.model;
  const post = key ? await writePost(inp, (sys, user) => requestAiText(sys, user, { model, maxTokens: 1500, timeoutMs: 90000, pool: { name: `${who}:write`, cap: 3 }, onUsage: (u) => mindLog.push({ at: realNow(), who, tier: 'deep', why: '島だよりを書く', usage: u, usd: 0, ok: true }) }), model) : draftPost(inp);
  if (post) { fs.writeFileSync(path.join(DATA, 'drafts', `${post.id}.json`), JSON.stringify(post, null, 1)); written[who] = `${post.title}（写真${post.photos.length}枚、${post.by}）`; }
  else written[who] = photos.length ? '書けなかった' : '写真がなかった';
}

// what it cost and did
const { PRICE } = await import('../src/robots/agent/config');
const usd = mindLog.reduce((a, m) => { const u = m.usage, p = u && PRICE[u.model]; return a + (u && p ? (u.input * p.in + u.cacheRead * p.in * 0.1 + u.cacheWrite * p.in * 1.25 + u.output * p.out) / 1e6 : 0); }, 0);
const run = {
  day: DAY, hours: [FROM, TO], thinking: !!key, steps, waits, minutes: +((realNow() - wall0) / 60000).toFixed(1),
  calls: mindLog.length, usd: +usd.toFixed(4), byWho: Object.fromEntries(['dot', 'rakko'].map((w) => [w, mindLog.filter((m) => m.who === w).length])),
  photos: Object.fromEntries(['dot', 'rakko'].map((w) => [w, (R.list.find((x: any) => x.id === w).photos ?? []).filter((p: any) => p.day === DAY).map((p: any) => p.subject.label)])),
  posts: written,
  goals: Object.fromEntries(['dot', 'rakko'].map((w) => [w, R.list.find((x: any) => x.id === w).diary.filter((e: any) => dayOf(e.at) === DAY && e.key === 'mind').slice(-8).map((e: any) => e.text)])),
};
fs.writeFileSync(path.join(DATA, 'runs', `${DAY}.json`), JSON.stringify(run, null, 1));
// (the island, for tomorrow: saved as it stands at the end of the day)
(R as any).save?.();
saveStore();
console.log(JSON.stringify(run, null, 1));
process.exit(0);
