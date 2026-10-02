// Test-world adapter: an in-memory stand-in for the real world store, used only for verification.
// It is NOT the production ledger. It shows the commit rules the real store must keep:
//   - one commit per commandId (same payload → same stored result; different payload → refused)
//   - optimistic versions on every entity put, all-or-nothing
//   - global mass invariant: initial + inflow − outflow = Σ lots + Σ samples (exact, integer mg)
//   - reservations never over-consumed; plain JSON save/load

import { totalMg, addComp, type Composition } from '../chem';
import { propose } from '../core';
import {
  CONTRACT_VERSION, type BoundaryFlow, type Command, type EnergyEntry, type Proposal, type Put, type WorldEvent, type WorldView,
} from '../types';

export interface CommandResult {
  commandId: string;
  payloadHash: string;
  ok: boolean;
  rejection?: { code: string; detail: string };
  worldVersion: number;
  eventIds: string[];
  observationIds: string[];
}

export interface WorldState {
  contract: string;
  worldId: string;
  worldVersion: number;
  view: WorldView;
  events: WorldEvent[];
  boundary: BoundaryFlow[];
  energy: EnergyEntry[];
  commands: Record<string, CommandResult>;
  massBaseline: { initialMg: number; inflowMg: number; outflowMg: number };
  atmosphereOut: Composition;
  atmosphereIn: Composition;
}

function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(stableStringify).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
export function hashString(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
export const hashOf = (x: unknown) => hashString(stableStringify(x));

export function viewMassMg(v: WorldView): number {
  let m = 0;
  for (const l of Object.values(v.lots)) m += totalMg(l.comp);
  for (const s of Object.values(v.samples)) m += totalMg(s.comp);
  return m;
}

export class TestWorld {
  state: WorldState;

  constructor(state: WorldState) { this.state = state; }

  static create(worldId: string, view: WorldView): TestWorld {
    return new TestWorld({
      contract: CONTRACT_VERSION, worldId, worldVersion: 0, view, events: [], boundary: [], energy: [], commands: {},
      massBaseline: { initialMg: viewMassMg(view), inflowMg: 0, outflowMg: 0 },
      atmosphereOut: {}, atmosphereIn: {},
    });
  }

  save(): string { return JSON.stringify(this.state); }
  static load(json: string): TestWorld {
    const s = JSON.parse(json) as WorldState;
    if (s.contract !== CONTRACT_VERSION) throw new Error(`contract ${s.contract} ≠ ${CONTRACT_VERSION}`);
    return new TestWorld(s);
  }

  submit(cmd: Command): CommandResult & { replayed: boolean } {
    const payloadHash = hashOf(cmd);
    const prior = this.state.commands[cmd.commandId];
    if (prior) {
      if (prior.payloadHash !== payloadHash) {
        return { ...prior, ok: false, rejection: { code: 'command_id_reused', detail: '同じcommandIdで異なる内容は受け付けない' }, replayed: true };
      }
      return { ...prior, replayed: true };
    }
    const proposal = propose(this.state.view, cmd);
    const result = proposal.ok ? this.commit(cmd, proposal, payloadHash) : this.record(cmd, payloadHash, proposal);
    return { ...result, replayed: false };
  }

  private record(cmd: Command, payloadHash: string, p: Proposal): CommandResult {
    const r: CommandResult = { commandId: cmd.commandId, payloadHash, ok: false, rejection: p.rejection,
      worldVersion: this.state.worldVersion, eventIds: [], observationIds: [] };
    this.state.commands[cmd.commandId] = r;
    return r;
  }

  private commit(cmd: Command, p: Proposal, payloadHash: string): CommandResult {
    const next: WorldView = JSON.parse(JSON.stringify(this.state.view));
    const apply = <T extends { id: string; version: number }>(table: Record<string, T>, puts: Put<T>[]): string | null => {
      for (const { entity, expectVersion } of puts) {
        const cur = table[entity.id];
        if (expectVersion === null ? !!cur : !cur || cur.version !== expectVersion) {
          return `version conflict on ${entity.id} (expected ${expectVersion}, found ${cur?.version ?? 'none'})`;
        }
        table[entity.id] = { ...entity, version: (expectVersion ?? 0) + 1 };
      }
      return null;
    };
    const err = apply(next.lots, p.lots) ?? apply(next.samples, p.samples) ?? apply(next.facilities, p.facilities)
      ?? apply(next.reservations, p.reservations) ?? apply(next.runs, p.runs) ?? apply(next.research, p.research)
      ?? apply(next.procedures, p.procedures);
    if (err) return this.record(cmd, payloadHash, { ...p, ok: false, rejection: { code: 'conflict', detail: err } });

    let inMg = 0, outMg = 0;
    for (const b of p.boundary) (b.direction === 'in' ? (inMg += totalMg(b.comp)) : (outMg += totalMg(b.comp)));
    const base = this.state.massBaseline;
    const expected = base.initialMg + base.inflowMg + inMg - base.outflowMg - outMg;
    const actual = viewMassMg(next);
    if (expected !== actual) {
      return this.record(cmd, payloadHash, { ...p, ok: false, rejection: { code: 'mass_balance', detail: `expected ${expected} mg, found ${actual} mg` } });
    }
    for (const r of Object.values(next.reservations)) {
      if (r.consumedMg > r.mg) return this.record(cmd, payloadHash, { ...p, ok: false, rejection: { code: 'over_consumed', detail: r.id } });
    }
    for (const o of p.observations) next.observations[o.id] = o;

    // commit
    const s = this.state;
    s.view = next;
    s.worldVersion++;
    base.inflowMg += inMg; base.outflowMg += outMg;
    for (const b of p.boundary) {
      if (b.direction === 'out') s.atmosphereOut = addComp(s.atmosphereOut, b.comp);
      else s.atmosphereIn = addComp(s.atmosphereIn, b.comp);
    }
    s.events.push(...p.events);
    s.boundary.push(...p.boundary);
    s.energy.push(...p.energy);
    const r: CommandResult = { commandId: cmd.commandId, payloadHash, ok: true, worldVersion: s.worldVersion,
      eventIds: p.events.map((e) => e.id), observationIds: p.observations.map((o) => o.id) };
    s.commands[cmd.commandId] = r;
    return r;
  }

  /** Recheck invariants on the stored state (used after load). */
  check(): string[] {
    const errs: string[] = [];
    const v = this.state.view, b = this.state.massBaseline;
    const exp = b.initialMg + b.inflowMg - b.outflowMg, act = viewMassMg(v);
    if (exp !== act) errs.push(`mass: expected ${exp}, found ${act}`);
    for (const l of Object.values(v.lots)) {
      const held = Object.values(v.reservations).filter((r) => r.open && r.lotId === l.id).reduce((s, r) => s + r.mg - r.consumedMg, 0);
      if (held > totalMg(l.comp)) errs.push(`lot ${l.id}: reserved ${held} > present ${totalMg(l.comp)}`);
    }
    for (const r of Object.values(v.reservations)) if (r.consumedMg > r.mg) errs.push(`reservation ${r.id} over-consumed`);
    return errs;
  }
}
