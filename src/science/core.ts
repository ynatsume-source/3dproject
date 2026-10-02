// Entry point of the science core: propose(view, command) → Proposal.
// Pure: same view + same command → same proposal. The caller commits it (see fixture/world.ts).

import { advance, finishDrying, inspect, prepareClay, release, reserve, resolveHalt, shapeTiles, startDrying, startFiring, startSoak } from './clay';
import { addTrial, concludeResearch, openResearch } from './research';
import { reject, type Command, type Proposal, type WorldView } from './types';

export { CONTRACT_VERSION } from './types';

export function propose(w: WorldView, cmd: Command): Proposal {
  try {
    switch (cmd.type) {
      case 'reserve': return reserve(w, cmd);
      case 'release': return release(w, cmd);
      case 'prepare_clay': return prepareClay(w, cmd);
      case 'shape_tiles': return shapeTiles(w, cmd);
      case 'start_drying': return startDrying(w, cmd);
      case 'finish_drying': return finishDrying(w, cmd);
      case 'start_firing': return startFiring(w, cmd);
      case 'start_soak': return startSoak(w, cmd);
      case 'advance': return advance(w, cmd);
      case 'resolve_halt': return resolveHalt(w, cmd);
      case 'inspect': return inspect(w, cmd);
      case 'open_research': return openResearch(w, cmd);
      case 'add_trial': return addTrial(w, cmd);
      case 'conclude_research': return concludeResearch(w, cmd);
    }
  } catch (e) {
    return reject('core_error', (e as Error).message);
  }
  return reject('unknown_command', (cmd as Command).type);
}
