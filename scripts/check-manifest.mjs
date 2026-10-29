// Every headless *-check.ts belongs to exactly one group. The runner rejects
// missing, duplicate and stale entries, so adding a check requires a CI choice.
// Fast checks keep a 120 s per-file budget. Slow checks retain their full default
// durations and locations; a failure is never a reason to move or skip a check.
const fast = [
  'science-records', 'manual-husk-records', 'husk-soak-records', 'husk-soak-batch',
  'sail-lots', 'sail-work', 'sail-voyage', 'sail-cord-settlement',
  'sail-raft-checkpoint', 'sail-inputs', 'sail-weave-offer', 'cord-twist-offer',
  'cord-load-compaction',
  'cord-integer-load',
  'sail-raft-science',
  'husk-soak', 'husk-host', 'cord-host', 'sail-voyage-host', 'worksite-look-fill', 'live-status', 'live-scrim', 'live-director', 'live-chapter', 'live-en', 'trial', 'say-words', 'sail-look', 'bamboo-carry', 'milestone',
  'science-wet-wick', 'science-dry-wick-comparison',
  'coir-cord-identity',
  'manual-husk-handover', 'coir-cord-handover',
  'coir-cord-work', 'coir-cord-lots', 'coir-cord-load', 'coir-cord-science',
  'manual-husk-workflow',
  'manual-husk-work',
  'manual-husk-separation',
  'ai-pool', 'assembly', 'body', 'chapter1', 'brain-weather', 'gauge-epoch', 'gauge-hypothesis', 'house', 'hypo', 'island-science', 'island-time', 'journal', 'tide', 'crabs', 'sea-level', 'tide-reach', 'husk-tide', 'no-way', 'residents-water',
  'lamp',
  'lantern', 'lantern-brain', 'lantern-residents', 'lantern-sky', 'lantern-study',
  'lumau', 'map', 'mind', 'nav', 'pottery-host', 'process-runner',
  'science-barometer-pot', 'science-charcoal', 'science-clay-prep',
  'science-fired-pot-assembly', 'science-firewood', 'science-integration',
  'science-oil-lamp', 'science-pit-fire', 'science-pottery', 'science-vessel',
  'save-migration', 'settle', 'social', 'storm-watch', 'status-labels', 'values', 'wall', 'wear', 'words', 'world-switch', 'worlds',
];

const slow = [
  'appear', 'astra-wreck', 'bait', 'bird', 'carpet', 'carpet-stuck', 'cave', 'circle',
  'clay-chain', 'clip', 'coral-depth', 'coral-overlap', 'coral-rock',
  'cruise-motion', 'day-lot', 'director', 'director-pingpong', 'dolphin',
  'eagleray', 'fell', 'firewood-habit', 'first-load', 'float', 'hunt', 'iguana', 'jacks', 'jitter', 'kame-shore', 'offer', 'remark',
  'jump', 'kame-hunger', 'keep-about', 'lab', 'sea-readers', 'lobos-benthos', 'lobos-fish-life',
  'lobos-forest', 'lobos-otters', 'lobos-visitors', 'manta', 'manta-stuck',
  'manta-terrain', 'manta-transit', 'moray', 'motion', 'oil-chain',
  'passthrough', 'pointlobos', 'raft-habit', 'route', 'sail-host', 'sealion', 'sim', 'status',
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
