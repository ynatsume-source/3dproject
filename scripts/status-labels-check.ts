// Every task a resident can be given has words for the status line (live screen, watch mode): what it is doing once
// there, and — for those that walk somewhere first — on its way. A task with none fell through to 「ひと休みしている」
// while it walked (rehearsal finding R-002: Lantern carrying a coconut to the shelf). Read from the source: the kinds
// of task('kind', ...) against the keys of statusOf's tables (going, at, toward, base) and the ones it answers itself.
// Usage: npx tsx scripts/status-labels-check.ts
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/robots/residents.ts', import.meta.url), 'utf8');
const kinds = new Set([...src.matchAll(/task\('([a-z-]+)'/g)].map((m) => m[1]));
const from = src.indexOf('function statusOf('), to = src.indexOf("return base[k] ??", from);
const body = src.slice(from, to);
const keys = new Set([...body.matchAll(/[\s{,]'?([a-z-]+)'?:\s/g)].map((m) => m[1]));
const handled = new Set(['idle']);   // (no task, or one that says it is idle: its own words, 「ひと休みしている」)
const missing = [...kinds].filter((k) => !keys.has(k) && !handled.has(k) && !k.startsWith('study-'));
console.log(`${kinds.size} kinds of task; without words for the status line: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(missing.length ? 'FAIL' : 'all ok');
process.exit(missing.length ? 1 : 0);
