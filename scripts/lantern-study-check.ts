// Deterministic state/evidence tests: no API credentials, fetches or scene globals.
// npx tsx scripts/lantern-study-check.ts
import assert from 'node:assert/strict';
import { createLanternStudy } from '../src/robots/lantern-study';
import { sampleSky } from '../src/robots/lantern-sky';
import type { StudyBrain, StudyBrainInput, StudyIntent, StudyWorld } from '../src/robots/lantern-study-types';

const NIGHT = Date.parse('2026-06-20T13:00:00Z');
const world = (changes: Partial<StudyWorld> = {}): StudyWorld => ({ atMs: NIGHT, lat: 24.33, lon: 124.09, battery: 0.85,
  position: [0, 0], cloud: 0.1, cloudSource: 'simulation', offline: false,
  places: [{ id: 'home', name: '小屋', x: 0, z: 0, openSky: false }, { id: 'hill', name: '丘', x: 5, z: 0, openSky: true }], companions: [], ...changes });
type Controller = ReturnType<typeof createLanternStudy>;
function next(c: Controller, w: StudyWorld) { w.atMs += 91_000; const a = c.choose(w); assert.ok(a); return a; }
function finish(c: Controller, w: StudyWorld, a: StudyIntent) {
  w.position = [a.x, a.z]; w.atMs += a.duration * 1000;
  const result = c.complete(a.id, w); assert.equal(result.success, true, result.text); return result;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const proposal = (input: StudyBrainInput, action = 'explore') => ({ optionId: input.options.find(o => o.action === action)!.id, reason: '前の記録を思い返して、自分で確かめたい。', focus: 'horizon', question: '低い空の星はどこへ行くだろう。' });

// An intention, interrupted walk, or invalid arrival is not an observation.
const c = createLanternStudy(), w = world();
const initialInterest = { ...c.state.interest }, first = c.choose(w)!;
assert.equal(first.action, 'observe'); assert.equal(c.state.observations.length, 0);
assert.equal(c.choose(w), null, 'one active intention');
c.interrupt(first.id, w, '道がふさがった。');
assert.equal(c.state.works.length, 0); assert.deepEqual(c.state.interest, initialInterest);
assert.equal(c.complete(first.id, w).success, false, 'cancelled action cannot later finish');
const wrong = next(c, w); w.position = [100, 100]; w.atMs += 60_000;
assert.equal(c.complete(wrong.id, w).success, false, 'arrival is required');
assert.equal(c.state.observations.length, 0);

// Two genuine observing actions and two drawing actions, across two nights.
const grow = createLanternStudy(), gw = world();
const obs1 = grow.choose(gw)!; finish(grow, gw, obs1);
assert.equal(grow.state.works[0].revisions, 0, 'observing starts a question, not a finished drawing');
assert.deepEqual(grow.state.observations[0].starIds, sampleSky(gw.atMs, gw.lat, gw.lon).stars.map(s => s.id));
const draw1 = next(grow, gw); assert.equal(draw1.action, 'draw'); finish(grow, gw, draw1);
assert.equal(grow.state.works[0].revisions, 1); assert.equal(grow.state.works[0].completedAt, undefined);
const once = grow.serialize(); assert.equal(grow.complete(draw1.id, gw).success, false); assert.deepEqual(grow.serialize(), once, 'completion is idempotent');
gw.atMs = Date.parse('2026-06-21T03:00:00Z');
const day = grow.choose(gw)!; assert.ok(['explore', 'rest'].includes(day.action)); finish(grow, gw, day);
const retainedQuestion = grow.state.works[0].question;
gw.atMs = Date.parse('2026-06-21T13:00:00Z');
const obs2 = grow.choose(gw)!; assert.equal(obs2.action, 'observe'); assert.equal(obs2.targetId, 'hill'); finish(grow, gw, obs2);
assert.equal(grow.state.works[0].completedAt, undefined, 'second observation alone cannot finish an artifact');
const draw2 = next(grow, gw); assert.equal(draw2.action, 'draw'); const done = finish(grow, gw, draw2);
assert.ok(done.work?.completedAt); assert.equal(done.work.revisions, 2); assert.equal(done.work.observationIds.length, 2);
assert.equal(done.work.question, retainedQuestion, 'goal persists between nights');
assert.ok(grow.state.interest.patterns > initialInterest.patterns, 'completed evidence changes interest');
assert.equal(grow.state.interest.brightness, initialInterest.brightness, 'unrelated interests do not invent experience');

// Sharing requires a nearby listener at choice AND completion.
gw.companions = [{ id: 'dot', name: 'ドット', x: gw.position[0] + 2, z: gw.position[1] }];
const share = next(grow, gw); assert.equal(share.action, 'share');
gw.companions[0].x += 20; gw.atMs += share.duration * 1000;
assert.equal(grow.complete(share.id, gw).success, false); assert.deepEqual(grow.state.works[0].sharedWith, []);
gw.companions[0].x = gw.position[0] + 1;
finish(grow, gw, next(grow, gw)); assert.deepEqual(grow.state.works[0].sharedWith, ['dot']);

// Cloud, unknown data, sunlight and fatigue govern the available actions.
for (const changes of [{ cloud: 0.9 }, { cloud: null, cloudSource: 'unknown' }, { atMs: Date.parse('2026-06-20T03:00:00Z') }] as Partial<StudyWorld>[]) {
  const blocked = createLanternStudy(), bw = world(changes), action = blocked.choose(bw)!;
  assert.notEqual(action.action, 'observe'); finish(blocked, bw, action); assert.equal(blocked.state.observations.length, 0); blocked.dispose();
}
const tired = createLanternStudy(), tw = world({ battery: 0.1 }); assert.equal(tired.choose(tw)?.action, 'rest'); tired.dispose();
const cloudChange = createLanternStudy(), cw = world(), interruptedObservation = cloudChange.choose(cw)!;
cw.position = [interruptedObservation.x, interruptedObservation.z]; cw.atMs += 80_000; cw.cloud = 0.8;
assert.equal(cloudChange.complete(interruptedObservation.id, cw).success, false); assert.equal(cloudChange.state.observations.length, 0);

// Restore keeps the unfinished project, but never resumes a phantom active task.
const restoreSource = createLanternStudy(), rw = world(); finish(restoreSource, rw, restoreSource.choose(rw)!);
const unfinishedDrawing = next(restoreSource, rw); assert.equal(unfinishedDrawing.action, 'draw');
const restored = createLanternStudy(restoreSource.serialize());
assert.equal(restored.state.active, null); assert.equal(restored.state.works.length, 1); assert.equal(restored.state.works[0].revisions, 0);
assert.equal(restored.state.memories.at(-1)?.kind, 'interrupted');
assert.equal(restored.complete(unfinishedDrawing.id, rw).success, false);
const bad = grow.serialize(); bad.observations[0].starIds = ['invented-star'];
assert.equal(createLanternStudy(bad).state.works.length, 0, 'a work with invalid saved evidence is discarded');
assert.equal(createLanternStudy({ version: 9, works: [{ completedAt: NIGHT }] }).state.works.length, 0);
assert.equal(createLanternStudy({ version: 1, memories: [{}], observations: [{ atMs: NaN }], active: { action: 'draw' } }).state.memories.length, 0);
const copy = grow.serialize(); copy.interest.patterns = 0; assert.notEqual(grow.state.interest.patterns, 0, 'save snapshot is detached');

// Late AI chooses only a later idle action; it cannot replace the current task.
let aiCalls = 0, resolveReply: (value: unknown) => void = () => {}, input: StudyBrainInput | undefined;
const deferred: StudyBrain = (i) => { aiCalls++; input = i; return new Promise(resolve => { resolveReply = resolve; }); };
const ai = createLanternStudy(undefined, deferred), aw = world(); ai.setAiEnabled(true);
const running = ai.choose(aw)!; await flush(); assert.equal(aiCalls, 1);
resolveReply(proposal(input!)); await flush();
assert.equal(ai.state.active!.id, running.id); assert.equal(ai.state.active!.source, 'rules');
finish(ai, aw, running); const chosen = next(ai, aw);
assert.equal(chosen.source, 'ai'); assert.equal(chosen.action, 'explore'); assert.equal(chosen.focus, 'patterns', 'an existing question is not silently rewritten');
assert.equal(aiCalls, 1, 'five-minute API spacing'); finish(ai, aw, chosen); ai.dispose();

// A previously valid AI suggestion is rejected when the current sky changes.
let staleInput: StudyBrainInput | undefined;
const stale = createLanternStudy(undefined, async i => { staleInput = i; return proposal(i, 'observe'); }), sw = world(); stale.setAiEnabled(true);
const si = stale.choose(sw)!; await flush(); assert.ok(staleInput); finish(stale, sw, si); sw.cloud = 0.95;
const sf = next(stale, sw); assert.equal(sf.source, 'rules'); assert.equal(sf.action, 'draw'); stale.dispose();

// Reject prose claiming a completed work, invalid IDs and malformed focus.
for (const reply of ['作品を完成させた', { optionId: 'draw:imaginary', reason: '完成した', focus: 'horizon', question: 'なぜ' }, { optionId: 'observe:hill', reason: '空', focus: 'invented', question: 'なぜ' }]) {
  const invalid = createLanternStudy(undefined, async () => reply), iw = world(); invalid.setAiEnabled(true);
  const action = invalid.choose(iw)!; await flush(); finish(invalid, iw, action);
  assert.equal(next(invalid, iw).source, 'rules'); assert.equal(invalid.state.works[0].completedAt, undefined); invalid.dispose();
}
const rejected = createLanternStudy(undefined, async () => { throw new Error('offline'); }), ew = world(); rejected.setAiEnabled(true);
const er = rejected.choose(ew)!; await flush(); assert.match(rejected.state.lastIssue, /有効/); finish(rejected, ew, er); assert.equal(next(rejected, ew).source, 'rules'); rejected.dispose();

// Timeout is tested with a controlled timer, not an eight-second wall-clock wait.
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
let timeout: (() => void) | null = null, aborted = false;
globalThis.setTimeout = ((fn: () => void, ms: number) => { assert.equal(ms, 8000); timeout = fn; return 123; }) as any;
globalThis.clearTimeout = (() => {}) as any;
try {
  const timed = createLanternStudy(undefined, (_i, signal) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); }), hw = world();
  timed.setAiEnabled(true); const hi = timed.choose(hw)!; await flush(); timeout!();
  assert.ok(aborted); assert.match(timed.state.lastIssue, /8秒/); assert.equal(timed.state.active!.id, hi.id);
  finish(timed, hw, hi); assert.equal(next(timed, hw).source, 'rules'); timed.dispose();
} finally { globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear; }

// Offline catch-up, opt-out, time reversal and disposal all invalidate HTTP work.
for (const mode of ['offline', 'disable', 'rewind', 'dispose'] as const) {
  let aborted = false, resolve: (value: unknown) => void = () => {}, request: StudyBrainInput | undefined;
  const ctl = createLanternStudy(undefined, (i, signal) => { request = i; signal.addEventListener('abort', () => { aborted = true; }); return new Promise(r => { resolve = r; }); });
  const ww = world(); ctl.setAiEnabled(true); const active = ctl.choose(ww)!; await flush();
  if (mode === 'offline') { ww.offline = true; ctl.choose(ww); }
  if (mode === 'disable') ctl.setAiEnabled(false);
  if (mode === 'rewind') { ww.atMs -= 1_000; ctl.choose(ww); }
  if (mode === 'dispose') ctl.dispose();
  assert.ok(aborted, mode); resolve(proposal(request!)); await flush();
  assert.equal(ctl.state.decisions.filter(d => d.source === 'ai').length, 0, mode);
  if (mode !== 'rewind') assert.equal(ctl.state.active?.id, active.id, 'AI cancellation does not fabricate an action result');
  ctl.dispose();
}
let offlineCalls = 0;
const offline = createLanternStudy(undefined, async () => { offlineCalls++; return null; }); offline.setAiEnabled(true);
const ow = world({ offline: true, cloud: null, cloudSource: 'unknown' }); finish(offline, ow, offline.choose(ow)!); await flush(); assert.equal(offlineCalls, 0); offline.dispose();
let stoppedBeforeDispatch = 0;
const noDispatch = createLanternStudy(undefined, async () => { stoppedBeforeDispatch++; return null; }); noDispatch.setAiEnabled(true); noDispatch.choose(world()); noDispatch.setAiEnabled(false); await flush(); assert.equal(stoppedBeforeDispatch, 0); noDispatch.dispose();

// Several nights of real state transitions bound storage and retain every work's evidence.
const long = createLanternStudy(), lw = world();
let completed = 0;
for (let d = 0; d < 20; d++) {
  lw.atMs = NIGHT + d * 86_400_000;
  for (let action = 0; action < 10; action++) {
    const a = next(long, lw), out = finish(long, lw, a);
    if (a.action === 'draw' && out.work?.completedAt) completed++;
  }
  assert.ok(long.state.memories.length <= 48); assert.ok(long.state.decisions.length <= 32); assert.ok(long.state.works.length <= 6); assert.ok(long.state.observations.length <= 24);
  for (const work of long.state.works) for (const obs of work.observationIds) assert.ok(long.state.observations.some(o => o.id === obs));
}
assert.ok(completed >= 15, `multi-day progression: ${completed}`);
assert.equal(long.state.works.length, 6); assert.equal(long.state.memories.length, 48); assert.equal(long.state.decisions.length, 32);
const roundTrip = createLanternStudy(long.serialize()); assert.deepEqual(roundTrip.state.works, long.state.works); assert.deepEqual(roundTrip.state.observations, long.state.observations);
for (const ctl of [c, grow, cloudChange, restoreSource, restored, long, roundTrip]) ctl.dispose();
console.log(JSON.stringify({ ok: true, nights: 20, completedWorks: completed, retainedWorks: long.state.works.length, observations: long.state.observations.length,
  memories: long.state.memories.length, decisions: long.state.decisions.length, checks: ['actual completion only', 'weather and energy', 'multi-night goal', 'two observations/two revisions', 'nearby sharing', 'strict restore', 'bounded storage', 'AI fallback/timeout/cancellation/stale/validation'] }, null, 2));
