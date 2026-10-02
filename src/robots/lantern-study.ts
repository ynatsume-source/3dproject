// World-owned intentions and evidence. Neither a model response nor elapsed HTTP
// time can finish an action: residents.ts calls complete after the actual task.
import { sampleSky } from './lantern-sky';
import type { StudyAction, StudyBrain, StudyCompletion, StudyFocus, StudyIntent, StudyMemory,
  StudyObservation, StudyOption, StudyProposal, StudyState, StudyWork, StudyWorld } from './lantern-study-types';

const FOCI: StudyFocus[] = ['patterns', 'brightness', 'horizon'];
const ACTIONS: StudyAction[] = ['observe', 'draw', 'explore', 'rest', 'share'];
const MEMORY_KINDS: StudyMemory['kind'][] = ['observation', 'drawing', 'exploration', 'rest', 'sharing', 'interrupted', 'failed'];
const DURATION: Record<StudyAction, number> = { observe: 40, draw: 55, explore: 30, rest: 45, share: 20 };
const QUESTIONS: Record<StudyFocus, string> = {
  patterns: '時間がたっても、星どうしの並びは同じに見えるだろうか。',
  brightness: '明るい星を目印にすると、空の中で道を見つけられるだろうか。',
  horizon: '低い空の星は、時間とともにどちらへ動くのだろうか。',
};
const TITLES: Record<StudyFocus, string> = { patterns: '星の並びをたどる', brightness: '明るい星の道しるべ', horizon: '地平線のそばの星' };
const CADENCE = 90_000, AI_INTERVAL = 300_000, AI_TIMEOUT = 8_000;
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const number = (x: unknown, low = -Infinity, high = Infinity): x is number => typeof x === 'number' && Number.isFinite(x) && x >= low && x <= high;
const time = (x: unknown): x is number => number(x, 1, 8.64e15);
const id = (x: unknown): x is string => typeof x === 'string' && /^[\w:.-]{1,80}$/.test(x);
const text = (x: unknown, max: number, empty = false): x is string => typeof x === 'string' && (empty || x.trim().length > 0) && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
const focus = (x: unknown): x is StudyFocus => FOCI.includes(x as StudyFocus);
const source = (x: unknown) => x === 'live' || x === 'simulation' || x === 'unknown';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function unique<T extends { id: string }>(arr: T[]): T[] { const seen = new Set<string>(); return arr.filter(v => !seen.has(v.id) && !!seen.add(v.id)); }
function fresh(): StudyState {
  return { version: 1, sequence: 0, interest: { patterns: 0.5, brightness: 0.35, horizon: 0.25 }, memories: [], observations: [], works: [], decisions: [], active: null, lastDecisionAt: 0, lastAiAt: 0, aiEnabled: false, lastIssue: '' };
}
function observation(x: unknown): x is StudyObservation {
  if (!(object(x) && id(x.id) && time(x.atMs) && number(x.lat, -90, 90) && number(x.lon, -180, 180)
    && id(x.placeId) && text(x.placeName, 100) && number(x.cloud, 0, 0.65) && source(x.cloudSource) && x.cloudSource !== 'unknown'
    && typeof x.offline === 'boolean' && focus(x.focus) && Array.isArray(x.starIds) && x.starIds.length > 0 && x.starIds.length <= 64
    && x.starIds.every(id) && new Set(x.starIds).size === x.starIds.length)) return false;
  const sky = sampleSky(x.atMs, x.lat, x.lon), visible = new Set(sky.stars.map(s => s.id));
  return sky.sunAltitudeDeg < -6 && x.starIds.every((v: string) => visible.has(v));
}
function intent(x: unknown): x is StudyIntent {
  return object(x) && id(x.id) && text(x.optionId, 180) && ACTIONS.includes(x.action) && id(x.targetId)
    && number(x.x, -1e5, 1e5) && number(x.z, -1e5, 1e5) && time(x.startedAt) && focus(x.focus)
    && text(x.reason, 180) && text(x.question, 120) && (x.caption === undefined || text(x.caption, 240, true))
    && (x.source === 'rules' || x.source === 'ai') && x.duration === DURATION[x.action as StudyAction];
}
function restore(saved: unknown): StudyState {
  const s = fresh();
  if (!object(saved) || saved.version !== 1) return s;
  s.sequence = number(saved.sequence, 0, Number.MAX_SAFE_INTEGER - 10000) && Number.isInteger(saved.sequence) ? saved.sequence : 0;
  if (object(saved.interest) && FOCI.every(f => number(saved.interest[f], 0, 1))) s.interest = { patterns: saved.interest.patterns, brightness: saved.interest.brightness, horizon: saved.interest.horizon };
  s.aiEnabled = saved.aiEnabled === true;
  s.lastDecisionAt = number(saved.lastDecisionAt, 0, 8.64e15) ? saved.lastDecisionAt : 0;
  s.lastAiAt = number(saved.lastAiAt, 0, 8.64e15) ? saved.lastAiAt : 0;
  const rawObservations: StudyObservation[] = Array.isArray(saved.observations) ? unique<StudyObservation>(saved.observations.slice(-256).filter(observation)).map(o => ({
    id: o.id, atMs: o.atMs, lat: o.lat, lon: o.lon, starIds: [...o.starIds], placeId: o.placeId, placeName: o.placeName,
    cloud: o.cloud, cloudSource: o.cloudSource, offline: o.offline, focus: o.focus,
  })) : [];
  const ids = new Set(rawObservations.map(o => o.id));
  if (Array.isArray(saved.works)) s.works = unique<StudyWork>(saved.works.slice(-24).filter((w: any) => object(w)
    && id(w.id) && text(w.title, 100) && text(w.question, 120) && focus(w.focus) && time(w.createdAt) && time(w.updatedAt) && w.updatedAt >= w.createdAt
    && Number.isInteger(w.revisions) && number(w.revisions, 0, 2) && text(w.caption, 240, true)
    && Array.isArray(w.observationIds) && w.observationIds.length > 0 && w.observationIds.length <= 4
    && new Set(w.observationIds).size === w.observationIds.length && w.observationIds.every((v: unknown) => id(v) && ids.has(v)) && w.revisions <= w.observationIds.length
    && w.observationIds.every((v: string) => { const o = rawObservations.find(o => o.id === v)!; return o.atMs >= w.createdAt && o.atMs <= w.updatedAt && o.focus === w.focus; })
    && Array.isArray(w.sharedWith) && w.sharedWith.length <= 16 && w.sharedWith.every(id) && new Set(w.sharedWith).size === w.sharedWith.length
    && (w.completedAt === undefined || (time(w.completedAt) && w.completedAt >= w.createdAt && w.completedAt <= w.updatedAt && w.revisions >= 2 && w.observationIds.length >= 2))
  )).slice(-6).map(w => ({ id: w.id, title: w.title, question: w.question, focus: w.focus, createdAt: w.createdAt, updatedAt: w.updatedAt,
    ...(w.completedAt !== undefined ? { completedAt: w.completedAt } : {}), observationIds: [...w.observationIds], revisions: w.revisions, caption: w.caption, sharedWith: [...w.sharedWith] }));
  const unfinished = [...s.works].reverse().find(w => !w.completedAt);
  s.works = s.works.filter(w => w.completedAt || w === unfinished);
  // Retain referenced evidence first, then fill the remaining observation slots.
  const referenced = new Set(s.works.flatMap(w => w.observationIds));
  const extras = rawObservations.filter(o => !referenced.has(o.id)).slice(-(24 - referenced.size) || rawObservations.length);
  s.observations = rawObservations.filter(o => referenced.has(o.id)).concat(referenced.size < 24 ? extras : []).sort((a, b) => a.atMs - b.atMs).slice(-24);
  if (Array.isArray(saved.memories)) s.memories = unique<StudyMemory>(saved.memories.slice(-96).filter((m: any) => object(m) && id(m.id) && time(m.atMs)
    && MEMORY_KINDS.includes(m.kind) && text(m.text, 260) && (m.relatedId === undefined || id(m.relatedId)) && typeof m.offline === 'boolean')).slice(-48)
    .map(m => ({ id: m.id, atMs: m.atMs, kind: m.kind, text: m.text, ...(m.relatedId ? { relatedId: m.relatedId } : {}), offline: m.offline }));
  if (Array.isArray(saved.decisions)) s.decisions = saved.decisions.slice(-64).filter((d: any) => object(d) && time(d.atMs) && id(d.intentId) && ACTIONS.includes(d.action)
    && text(d.reason, 180) && (d.source === 'rules' || d.source === 'ai') && ['started', 'completed', 'interrupted', 'failed'].includes(d.outcome)).slice(-32)
    .map(d => ({ atMs: d.atMs, intentId: d.intentId, action: d.action, reason: d.reason, source: d.source, outcome: d.outcome }));
  // Sequence from old or hand-edited saves must never collide with existing IDs.
  for (const key of [...s.memories, ...s.observations, ...s.works].map(v => v.id).concat(s.decisions.map(d => d.intentId), intent(saved.active) ? [saved.active.id] : [])) {
    const n = /^ls:(\d+)$/.exec(key); if (n && number(Number(n[1]), 0, Number.MAX_SAFE_INTEGER - 10000)) s.sequence = Math.max(s.sequence, Number(n[1]));
  }
  if (intent(saved.active)) {
    const a = saved.active;
    s.memories.push({ id: `ls:${++s.sequence}`, atMs: a.startedAt, kind: 'interrupted', text: '前回の途中の行動は再開時にいったん止めた。観察や作品の完成としては数えない。', offline: false });
    s.memories = s.memories.slice(-48);
    const decision = [...s.decisions].reverse().find(d => d.intentId === a.id); if (decision) decision.outcome = 'interrupted';
    s.lastIssue = '途中の行動を中断として復元しました。未完成の作品は残っています。';
  }
  return s;
}

/** Pure controller: no scene access, storage, network, or resident movement. */
export function createLanternStudy(saved?: unknown, brain?: StudyBrain) {
  const state = restore(saved);
  let disposed = false, seenAt = 0, generation = 0;
  let pending: { controller: AbortController; timer: ReturnType<typeof setTimeout>; generation: number; atMs: number; lat: number; lon: number; optionIds: Set<string> } | null = null;
  let ready: { value: unknown; atMs: number; lat: number; lon: number; optionIds: Set<string> } | null = null;
  const nextId = () => `ls:${++state.sequence}`;
  const project = () => [...state.works].reverse().find(w => !w.completedAt) || null;
  const latest = () => state.works[state.works.length - 1];
  function cancel() { generation++; if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; } ready = null; }
  function memory(world: StudyWorld, kind: StudyMemory['kind'], message: string, relatedId?: string) {
    state.memories.push({ id: nextId(), atMs: world.atMs, kind, text: message.slice(0, 260), ...(relatedId ? { relatedId } : {}), offline: world.offline });
    state.memories = state.memories.slice(-48);
  }
  function trim() {
    state.works = state.works.slice(-6);
    const referenced = new Set(state.works.flatMap(w => w.observationIds));
    const extras = state.observations.filter(o => !referenced.has(o.id)).slice(-(24 - referenced.size) || state.observations.length);
    state.observations = state.observations.filter(o => referenced.has(o.id)).concat(referenced.size < 24 ? extras : []).sort((a, b) => a.atMs - b.atMs).slice(-24);
    state.decisions = state.decisions.slice(-32);
  }
  function validWorld(w: StudyWorld) {
    return w && time(w.atMs) && number(w.lat, -90, 90) && number(w.lon, -180, 180) && number(w.battery, 0, 1)
      && Array.isArray(w.position) && w.position.length === 2 && w.position.every(v => number(v, -1e5, 1e5))
      && (w.cloud === null || number(w.cloud, 0, 1)) && source(w.cloudSource) && typeof w.offline === 'boolean'
      && Array.isArray(w.places) && Array.isArray(w.companions);
  }
  function noticeWorld(w: StudyWorld) {
    if (!validWorld(w)) { cancel(); state.lastIssue = '世界の状態が不正なため、判断を見送った。'; return false; }
    if (w.offline) cancel();
    if (w.atMs < seenAt || w.atMs < state.lastDecisionAt || w.atMs < state.lastAiAt) {
      cancel(); state.lastDecisionAt = 0; state.lastAiAt = w.atMs; state.lastIssue = '時刻が戻ったため、保留中のAI判断を取り消した。';
      if (state.active) interrupt(state.active.id, w, '時刻の変更で中断した。');
    }
    seenAt = w.atMs;
    return true;
  }
  function options(w: StudyWorld): StudyOption[] {
    const places = w.places.filter(p => p && id(p.id) && text(p.name, 100) && number(p.x, -1e5, 1e5) && number(p.z, -1e5, 1e5) && typeof p.openSky === 'boolean');
    const nearest = [...places].sort((a, b) => Math.hypot(a.x - w.position[0], a.z - w.position[1]) - Math.hypot(b.x - w.position[0], b.z - w.position[1]))[0];
    const at = nearest || { id: 'here', name: 'ここ', x: w.position[0], z: w.position[1] };
    const out: StudyOption[] = [{ id: `rest:${at.id}`, action: 'rest', label: 'しばらく休む', targetId: at.id, x: at.x, z: at.z }];
    if (w.battery < 0.25) return out;
    const sky = sampleSky(w.atMs, w.lat, w.lon);
    const work = project();
    const previous = latest();
    const readyForNewWork = !previous?.completedAt || w.atMs - previous.completedAt >= 600_000;
    if (w.cloud !== null && w.cloud <= 0.65 && w.cloudSource !== 'unknown' && sky.sunAltitudeDeg < -6 && sky.stars.length > 0 && (work ? work.observationIds.length < 4 : readyForNewWork)) {
      for (const p of places.filter(p => p.openSky)) out.push({ id: `observe:${p.id}`, action: 'observe', label: `${p.name}で空を観察する`, targetId: p.id, x: p.x, z: p.z });
    }
    if (work && work.observationIds.some(v => state.observations.some(o => o.id === v)) && work.revisions < Math.min(2, work.observationIds.length)) {
      out.push({ id: `draw:${work.id}`, action: 'draw', label: '観察した星の図を描き直す', targetId: work.id, x: at.x, z: at.z });
    }
    for (const p of places) out.push({ id: `explore:${p.id}`, action: 'explore', label: `${p.name}を訪ねる`, targetId: p.id, x: p.x, z: p.z });
    const completed = latest();
    if (completed?.completedAt) for (const c of w.companions.filter(c => c && id(c.id) && text(c.name, 100) && number(c.x, -1e5, 1e5) && number(c.z, -1e5, 1e5)
      && Math.hypot(c.x - w.position[0], c.z - w.position[1]) <= 4 && !completed.sharedWith.includes(c.id))) {
      out.push({ id: `share:${c.id}`, action: 'share', label: `${c.name}に完成した図を見せる`, targetId: c.id, x: c.x, z: c.z });
    }
    return out;
  }
  function chooseFocus(): StudyFocus {
    return [...FOCI].sort((a, b) => (state.interest[b] - state.works.filter(w => w.focus === b).length * 0.18) - (state.interest[a] - state.works.filter(w => w.focus === a).length * 0.18))[0];
  }
  function rules(w: StudyWorld, opts: StudyOption[]): StudyProposal {
    const work = project(), last = state.decisions[state.decisions.length - 1];
    const find = (a: StudyAction) => opts.find(o => o.action === a);
    let option = find('rest')!, reason = '電池を確かめて、少し休んでから続きを考えたい。';
    if (w.battery >= 0.25) {
      if (find('share')) { option = find('share')!; reason = '仕上がった図を、近くにいる仲間に見せたい。'; }
      else if (work && work.revisions < Math.min(2, work.observationIds.length) && find('draw')) { option = find('draw')!; reason = work.revisions ? '前の観察と見比べて、図をもう一度描き直したい。' : '見たばかりの星を忘れないうちに、一枚目の下書きに残したい。'; }
      else if (find('observe') && (!work || work.observationIds.length < 2) && last?.action !== 'observe') {
        const previous = work && state.observations.find(o => o.id === work.observationIds[0]);
        option = opts.find(o => o.action === 'observe' && o.targetId === previous?.placeId) || find('observe')!;
        reason = previous ? '前に見た場所へ戻って、星の位置をもう一度確かめたい。' : '晴れた空で、今夜気になる星を見つけたい。';
      } else if (find('explore') && last?.action !== 'explore') {
        option = opts.filter(o => o.action === 'explore').sort((a, b) => Math.hypot(b.x - w.position[0], b.z - w.position[1]) - Math.hypot(a.x - w.position[0], a.z - w.position[1]))[0];
        reason = work ? '空を待つあいだ、続きを考えながら島を少し歩きたい。' : '次に空を眺める場所を探しに行きたい。';
      }
    }
    const f = work?.focus || chooseFocus();
    return { optionId: option.id, reason, focus: f, question: work?.question || QUESTIONS[f] };
  }
  function validateProposal(value: unknown, opts: StudyOption[]): StudyProposal | null {
    if (!object(value) || !text(value.optionId, 180) || !opts.some(o => o.id === value.optionId) || !text(value.reason, 180) || !focus(value.focus)
      || !text(value.question, 120) || (value.caption !== undefined && !text(value.caption, 240, true))) return null;
    return { optionId: value.optionId, reason: value.reason, focus: value.focus, question: value.question, ...(value.caption !== undefined ? { caption: value.caption } : {}) };
  }
  function request(w: StudyWorld, opts: StudyOption[]) {
    if (!brain || !state.aiEnabled || w.offline || pending || ready || (state.lastAiAt && w.atMs - state.lastAiAt < AI_INTERVAL)) return;
    state.lastAiAt = w.atMs;
    const controller = new AbortController(), g = ++generation;
    const req = { controller, generation: g, atMs: w.atMs, lat: w.lat, lon: w.lon, optionIds: new Set(opts.map(o => o.id)), timer: undefined as unknown as ReturnType<typeof setTimeout> };
    req.timer = setTimeout(() => { if (pending?.generation === g) { cancel(); state.lastIssue = 'AIの返事を8秒待ったので、暮らしの判断を続けた。'; } }, AI_TIMEOUT);
    pending = req;
    const input = clone({ profile: 'ランタン。好奇心が強く、夜の探検と星が好きな小さなロボット。出来事を確かめながら、自分の問いを育てる。', world: w, options: opts, interests: state.interest, memories: state.memories.slice(-12), work: project() });
    Promise.resolve().then(() => controller.signal.aborted || disposed ? null : brain(input, controller.signal))
      .then(value => { if (disposed || !pending || pending.generation !== g || !state.aiEnabled || controller.signal.aborted) return;
        clearTimeout(req.timer); pending = null; ready = { value, atMs: req.atMs, lat: req.lat, lon: req.lon, optionIds: req.optionIds };
      }, () => { if (pending?.generation === g) { clearTimeout(req.timer); pending = null; state.lastIssue = 'AIから有効な返事を受け取れなかった。通常の判断を続ける。'; } });
  }
  function choose(w: StudyWorld): StudyIntent | null {
    if (disposed || !noticeWorld(w) || state.active || (state.lastDecisionAt && w.atMs - state.lastDecisionAt < CADENCE)) return null;
    const opts = options(w);
    let proposal: StudyProposal | null = null, origin: StudyIntent['source'] = 'rules';
    if (ready) {
      const q = ready; ready = null;
      if (state.aiEnabled && !w.offline && w.atMs >= q.atMs && w.atMs - q.atMs <= AI_INTERVAL && Math.abs(w.lat - q.lat) < 0.001 && Math.abs(w.lon - q.lon) < 0.001) {
        proposal = validateProposal(q.value, opts);
        if (proposal && q.optionIds.has(proposal.optionId)) origin = 'ai'; else proposal = null;
      }
      if (!proposal) state.lastIssue = 'AIの提案が現在の状況に合わないため、今の世界から選び直した。';
    }
    // Launch after the immediate fallback has been selected; the answer only
    // enters a later idle decision, never the task already being performed.
    if (!proposal) proposal = rules(w, opts);
    const option = opts.find(o => o.id === proposal!.optionId)!;
    const work = project();
    state.active = { ...proposal, ...(work ? { focus: work.focus, question: work.question } : {}), id: nextId(), action: option.action, targetId: option.targetId,
      x: option.x, z: option.z, startedAt: w.atMs, source: origin, duration: DURATION[option.action] };
    state.lastDecisionAt = w.atMs;
    state.decisions.push({ atMs: w.atMs, intentId: state.active.id, action: state.active.action, reason: state.active.reason, source: origin, outcome: 'started' });
    trim(); request(w, opts);
    return clone(state.active);
  }
  function interrupt(intentId: string, w: StudyWorld, reason: string, failed = false) {
    if (!state.active || state.active.id !== intentId) return;
    const action = state.active; state.active = null; cancel();
    const d = [...state.decisions].reverse().find(d => d.intentId === intentId); if (d) d.outcome = failed ? 'failed' : 'interrupted';
    if (validWorld(w)) memory(w, failed ? 'failed' : 'interrupted', text(reason, 260) ? reason : '途中の行動を中断した。', action.id);
    state.lastIssue = text(reason, 260) ? reason : '途中の行動を中断した。';
  }
  function complete(intentId: string, w: StudyWorld): StudyCompletion {
    if (disposed || !noticeWorld(w) || !state.active || state.active.id !== intentId) return { success: false, text: '完了する行動がない。' };
    const a = state.active, fail = (message: string) => { interrupt(a.id, w, message, true); return { success: false, text: message }; };
    if (w.atMs < a.startedAt) return fail('開始前の時刻なので、完了として記録しなかった。');
    const available = options(w).find(o => o.id === a.optionId && o.action === a.action);
    if (!available) return fail('周囲の状況が変わり、予定した行動を完了できなかった。');
    if (a.action === 'share' ? Math.hypot(w.position[0] - available.x, w.position[1] - available.z) > 4 : Math.hypot(w.position[0] - a.x, w.position[1] - a.z) > 2.5) return fail('目的の場所に届いていないため、完了として記録しなかった。');
    let result: StudyCompletion;
    if (a.action === 'observe') {
      const p = w.places.find(p => p.id === a.targetId)!, sky = sampleSky(w.atMs, w.lat, w.lon);
      const obs: StudyObservation = { id: nextId(), atMs: w.atMs, lat: w.lat, lon: w.lon, starIds: sky.stars.map(s => s.id).slice(0, 64), placeId: p.id, placeName: p.name,
        cloud: w.cloud!, cloudSource: w.cloudSource, offline: w.offline, focus: a.focus };
      state.observations.push(obs);
      let work = project();
      if (!work) { work = { id: nextId(), title: TITLES[a.focus], question: a.question, focus: a.focus, createdAt: w.atMs, updatedAt: w.atMs, observationIds: [], revisions: 0, caption: '', sharedWith: [] }; state.works.push(work); }
      work.observationIds.push(obs.id); work.updatedAt = w.atMs;
      state.interest[a.focus] = Math.min(1, state.interest[a.focus] + 0.025);
      const message = `${p.name}で空を眺め、地平線より上の星${obs.starIds.length}個の計算位置を手帖に記録した。`;
      memory(w, 'observation', message, obs.id); result = { success: true, text: message, observation: clone(obs), work: clone(work) };
    } else if (a.action === 'draw') {
      const work = project(); if (!work || work.id !== a.targetId) return fail('続きを描く作品が見つからなかった。');
      work.revisions++; work.updatedAt = w.atMs;
      work.caption = a.caption || (work.observationIds.length >= 2 ? 'もう一度見た空を、前の記録と並べた。星の並びを、これからも確かめていきたい。' : '今夜見た空の位置を写した。次に訪れたとき、同じ星を見つけられるだろうか。');
      if (work.revisions >= 2 && work.observationIds.length >= 2) work.completedAt = w.atMs;
      state.interest[work.focus] = Math.min(1, state.interest[work.focus] + 0.015);
      const message = work.completedAt ? `二度の観察をもとに「${work.title}」を仕上げた。` : `観察記録をもとに「${work.title}」の下書きを描いた。`;
      memory(w, 'drawing', message, work.id); result = { success: true, text: message, work: clone(work) };
    } else if (a.action === 'share') {
      const work = latest(); if (!work?.completedAt || work.sharedWith.includes(a.targetId)) return fail('まだ見せられる新しい完成作品がない。');
      const friend = w.companions.find(c => c.id === a.targetId)!;
      work.sharedWith.push(friend.id); work.sharedWith = work.sharedWith.slice(-16); work.updatedAt = w.atMs;
      const message = `そばにいる${friend.name}に「${work.title}」を見せた。`;
      memory(w, 'sharing', message, work.id); result = { success: true, text: message, work: clone(work) };
    } else {
      const message = a.action === 'rest' ? '手を止めて、しばらく休んだ。' : `${w.places.find(p => p.id === a.targetId)?.name || '島の道'}を訪ねた。`;
      memory(w, a.action === 'rest' ? 'rest' : 'exploration', message); result = { success: true, text: message };
    }
    const d = [...state.decisions].reverse().find(d => d.intentId === a.id); if (d) d.outcome = 'completed';
    state.active = null; trim(); return result;
  }
  return { state, choose, complete, interrupt,
    setAiEnabled(enabled: boolean) { state.aiEnabled = enabled === true; if (!state.aiEnabled) cancel(); },
    serialize(): StudyState { return clone(state); },
    dispose() { disposed = true; cancel(); },
  };
}
