// Research records and learned procedures. A resident can only cite observations they made,
// and a procedure is promoted to 'reproduced' only from separate successful runs with complete history.

import { emptyProposal, reject, type Command, type LearnedProcedure, type Proposal, type ResearchRecord, type WorldView } from './types';

type Cmd<T extends Command['type']> = Extract<Command, { type: T }>;

function ownObservations(w: WorldView, residentId: string, ids: string[]): string | null {
  for (const id of ids) {
    const o = w.observations[id];
    if (!o) return `観察 ${id} は存在しない`;
    if (o.residentId !== residentId) return `観察 ${id} は ${o.residentId} のもので、${residentId} は知らない`;
  }
  return null;
}

export function openResearch(w: WorldView, cmd: Cmd<'open_research'>): Proposal {
  const r = cmd.record;
  if (w.research[r.id]) return reject('duplicate_id', r.id);
  if (r.residentId !== cmd.actorId) return reject('not_owner', '研究記録は本人だけが開ける');
  const own = r.basis.filter((b) => b.kind === 'own-trial').map((b) => b.ref);
  const bad = ownObservations(w, cmd.actorId, own);
  if (bad) return reject('unknown_observation', bad);
  const p = emptyProposal();
  p.research.push({ entity: { ...r, trials: r.trials ?? [], status: 'open', version: 0 }, expectVersion: null });
  p.events.push({ id: `${cmd.commandId}:ev0`, commandId: cmd.commandId, atMs: cmd.atMs, type: 'ResearchOpened', subjectIds: [r.id], summary: r.question });
  return p;
}

export function addTrial(w: WorldView, cmd: Cmd<'add_trial'>): Proposal {
  const r = w.research[cmd.researchId];
  if (!r) return reject('unknown_research', cmd.researchId);
  if (r.residentId !== cmd.actorId) return reject('not_owner', cmd.researchId);
  if (r.status !== 'open') return reject('closed', cmd.researchId);
  const s = w.samples[cmd.trial.sampleId];
  if (!s) return reject('unknown_sample', cmd.trial.sampleId);
  if (s.researchId !== r.id) return reject('foreign_sample', `${s.label} は別の研究の試料`);
  for (const id of cmd.trial.runIds) if (!w.runs[id]) return reject('unknown_run', id);
  const bad = ownObservations(w, cmd.actorId, cmd.trial.observationIds);
  if (bad) return reject('unknown_observation', bad);
  const trials = r.trials.filter((t) => t.sampleId !== cmd.trial.sampleId).concat([cmd.trial]);
  const p = emptyProposal();
  p.research.push({ entity: { ...r, trials }, expectVersion: r.version });
  return p;
}

export function concludeResearch(w: WorldView, cmd: Cmd<'conclude_research'>): Proposal {
  const r = w.research[cmd.researchId];
  if (!r) return reject('unknown_research', cmd.researchId);
  if (r.residentId !== cmd.actorId) return reject('not_owner', cmd.researchId);
  if (r.status !== 'open') return emptyProposal();
  const bad = ownObservations(w, cmd.actorId, cmd.conclusion.observationIds);
  if (bad) return reject('unknown_observation', bad);
  const p = emptyProposal();
  p.research.push({ entity: { ...r, status: 'concluded', conclusion: cmd.conclusion, next: cmd.next }, expectVersion: r.version });
  p.events.push({ id: `${cmd.commandId}:ev0`, commandId: cmd.commandId, atMs: cmd.atMs, type: 'ResearchConcluded', subjectIds: [r.id],
    summary: `${cmd.conclusion.verdict}: ${cmd.conclusion.text}` });
  if (cmd.procedure) {
    const pr = cmd.procedure;
    const firingRuns = new Set<string>();
    for (const e of pr.evidence) {
      const s = w.samples[e.sampleId];
      if (!s) return reject('unknown_sample', e.sampleId);
      if (!s.historyComplete) return reject('incomplete_history_evidence', `${s.label} は経過が不明な区間を含み、根拠にできない`);
      const inTrials = w.research[e.researchId]?.trials.some((t) => t.sampleId === e.sampleId);
      if (!inTrials) return reject('evidence_not_in_trials', e.sampleId);
      if (w.research[e.researchId].residentId !== cmd.actorId) return reject('not_owner', `${e.researchId} は他人の研究`);
      const fired = Object.values(w.runs).find((x) => x.kind === 'firing' && x.sampleIds.includes(e.sampleId) && x.status === 'completed');
      if (e.ok && fired) firingRuns.add(fired.id);
    }
    const prev = w.procedures[pr.id];
    const evidence = [...(prev?.evidence ?? []), ...pr.evidence.filter((e) => !(prev?.evidence ?? []).some((x) => x.sampleId === e.sampleId))];
    for (const e of prev?.evidence ?? []) {
      const fired = Object.values(w.runs).find((x) => x.kind === 'firing' && x.sampleIds.includes(e.sampleId) && x.status === 'completed');
      if (e.ok && fired) firingRuns.add(fired.id);
    }
    const proc: LearnedProcedure = {
      ...pr, residentId: cmd.actorId, evidence,
      status: firingRuns.size >= 2 ? 'reproduced' : 'tried',
      version: prev?.version ?? 0,
    };
    if (!evidence.some((e) => e.ok)) return reject('no_success', '成功した試料のない手順は記録しない（失敗は研究記録に残る）');
    p.procedures.push({ entity: proc, expectVersion: prev ? prev.version : null });
    p.events.push({ id: `${cmd.commandId}:ev1`, commandId: cmd.commandId, atMs: cmd.atMs, type: 'ProcedureLearned', subjectIds: [proc.id],
      summary: `${proc.goal}（${proc.status}、別々の焼成 ${firingRuns.size} 回で成功）` });
  }
  return p;
}

export type { ResearchRecord };
