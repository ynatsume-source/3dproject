// Every headless *-check.ts belongs to exactly one group. The runner rejects
// missing, duplicate and stale entries, so adding a check requires a CI choice.
// Fast checks keep a 120 s per-file budget. Slow checks retain their full default
// durations and locations; a failure is never a reason to move or skip a check.
const fast = [
  'assembly', 'body', 'house', 'hypo', 'island-science', 'island-time', 'journal',
  'lamp',
  'lantern', 'lantern-brain', 'lantern-residents', 'lantern-sky', 'lantern-study',
  'lumau', 'map', 'mind', 'nav', 'pottery-host', 'process-runner',
  'science-barometer-pot', 'science-charcoal', 'science-clay-prep',
  'science-fired-pot-assembly', 'science-firewood', 'science-integration',
  'science-oil-lamp', 'science-pit-fire', 'science-pottery', 'science-vessel',
  'settle', 'social', 'values', 'wall', 'wear', 'words', 'world-switch', 'worlds',
];

const slow = [
  'appear', 'astra-wreck', 'bait', 'bird', 'carpet', 'cave', 'circle',
  'clay-chain', 'clip', 'coral-depth', 'coral-overlap', 'coral-rock',
  'cruise-motion', 'day-lot', 'director', 'director-pingpong', 'dolphin',
  'eagleray', 'fell', 'float', 'hunt', 'iguana', 'jacks', 'jitter',
  'jump', 'keep-about', 'lab', 'lobos-benthos', 'lobos-fish-life',
  'lobos-forest', 'lobos-otters', 'lobos-visitors', 'manta', 'manta-stuck',
  'manta-terrain', 'manta-transit', 'moray', 'motion', 'oil-chain',
  'passthrough', 'pointlobos', 'route', 'sealion', 'sim', 'status',
  'stuck', 'tar-chain', 'tideline', 'trade', 'turtle-breath', 'turtle-view',
  'water',
];

// These scripts print measurements without asserting their acceptable range.
// Their execution can succeed, but the runner must not call that a semantic pass.
const diagnostics = new Set([
  'clip', 'coral-overlap', 'director', 'director-pingpong', 'hunt', 'jitter',
  'jump', 'manta-stuck', 'motion', 'sim', 'stuck',
]);

export const checks = Object.freeze([
  ...fast.map((name) => ({ name, group: 'fast', kind: diagnostics.has(name) ? 'diagnostic' : 'assertion', timeoutSeconds: 120 })),
  ...slow.map((name) => ({ name, group: 'slow', kind: diagnostics.has(name) ? 'diagnostic' : 'assertion', timeoutSeconds: 1200 })),
].map((check) => Object.freeze({ ...check, file: `scripts/${check.name}-check.ts` })));
