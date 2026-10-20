// Shared occupancy only. No clock, material state, scheduling or second host.
import type { Ledger } from './process-runner';

export function otherScienceWorkBusy(
  L: Ledger, actorId: string, siteId: string, ownProcess: string,
): { actor: boolean; site: boolean } {
  let actor = false;
  let site = false;
  for (const r of Object.values(L.runs)) {
    if (r.processId === ownProcess
      || !['starting', 'running', 'needs-input'].includes(r.status)) continue;
    if (!['prototype_manual_husk_work', 'prototype_coir_work', 'prototype_husk_soak',
      'prototype_sail_work', 'prototype_sail_voyage'].includes(r.processId)) continue;
    const d = r.state?.data as any;
    let who: string;
    let where: string;
    let engaged: boolean;
    let manual = true;
    if (r.processId === 'prototype_manual_husk_work') {
      if (r.state?.schema !== 'civ-world.manual-husk-work/2' || !d?.spec) {
        throw Error('invalid-science-occupancy');
      }
      const job = (L as any).manualHuskArrangement?.jobs?.find((j: any) => j.runId === r.runId);
      if (!job || !Array.isArray(job.controls) || !job.controls.length) {
        throw Error('missing-science-arrangement');
      }
      who = job.actorId;
      where = d.spec.worksite?.locationId;
      engaged = ['start', 'resume', 'takeover'].includes(job.controls.at(-1).kind);
    } else if (r.processId === 'prototype_husk_soak') {
      if (!['civ-world.husk-soak/1', 'civ-world.husk-soak/2'].includes(r.state?.schema ?? '')
        || d?.spec?.site?.kind !== 'coastal-tide-pool') {
        throw Error('invalid-science-occupancy');
      }
      who = d.spec.actorId;
      where = d.spec.site.locationId;
      manual = false;
      engaged = false;
    } else if (r.processId === 'prototype_sail_work') {
      if (r.state?.schema !== 'civ-world.sail-work/1' || !d?.spec
        || typeof d.actorId !== 'string' || typeof d.engaged !== 'boolean') {
        throw Error('invalid-science-occupancy');
      }
      who = d.actorId;
      where = d.spec.facts?.worksite?.locationId;
      manual = d.spec.operation !== 'dry';
      engaged = d.engaged;
    } else if (r.processId === 'prototype_sail_voyage') {
      if (r.state?.schema !== 'civ-world.sail-voyage/1'
        || typeof d?.paused !== 'boolean') throw Error('invalid-science-occupancy');
      who = r.operator;
      where = '';
      engaged = !d.paused;
    } else {
      if (r.state?.schema !== 'civ-world.coir-work/2' || !d?.spec
        || !Array.isArray(d.controls) || !d.controls.length) {
        throw Error('invalid-science-occupancy');
      }
      who = d.controls.at(-1).actorId;
      where = d.spec.facts?.worksite?.locationId;
      manual = d.spec.operation !== 'dry';
      engaged = ['start', 'resume', 'takeover'].includes(d.controls.at(-1).kind);
    }
    if (typeof who !== 'string' || typeof where !== 'string' || r.operator !== who) {
      throw Error('changed-science-occupancy');
    }
    if (siteId !== '' && where === siteId) site = true;
    if (manual && engaged && who === actorId) actor = true;
  }
  return { actor, site };
}
