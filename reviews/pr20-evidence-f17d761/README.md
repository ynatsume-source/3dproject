# PR20 f17d761 review evidence (repo outside; no commit)

runs/      : 2026-10-15T02:06:51Z rerun, no pipes. stdout/stderr redirected to separate files; `$?` written immediately after each process.
  check.*      node --import tsx --import ./scripts/node-assets.mjs scripts/manual-husk-separation-check.ts
  typecheck.*  npx tsc --noEmit -p .
  commit.txt   commit / tree of f17d761; env.txt node version, node_modules target (/home/user/civ @ 1e2e103), time
co/        : git archive f17d761 (node_modules -> /home/user/civ/node_modules)

fuzz/      : NOT re-run. Original scratch was deleted; reconstructed from the session transcript.
  transcript-excerpt.json        the three original tool calls (commands) and their outputs
  step1-fuzz-v1.ts               heredoc as first written (400 iterations; import failed: ERR_MODULE_NOT_FOUND)
  step2-fuzz-v1-relimport.ts     after sed of import path (output: { cases: 6, bad: 0 })
  fuzz.ts                        after the python generator rewrite + 400->3000 (final; output: { cases: 3000, bad: 0 })
  previous-run.stdout.txt        the earlier stdout (via `2>&1 | tail -5`; exit code not recorded)
  seed: fixed LCG `rnd = 12345` in fuzz.ts line 2 (no external seed / no Math.random)

Reproduce (from this directory):
  cd co && mkdir -p scratch-review && cp ../fuzz/fuzz.ts scratch-review/fuzz.ts
  node --import tsx --import ./scripts/node-assets.mjs scratch-review/fuzz.ts > ../fuzz/rerun.stdout 2> ../fuzz/rerun.stderr; echo $? > ../fuzz/rerun.exit
